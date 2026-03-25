/**
 * arxlens - main Cloudflare Worker entry point.
 *
 * Responsibilities split cleanly:
 *   Cron      → fetch arXiv metadata → enqueue to PAPER_QUEUE
 *   Queue     → route each message to its PaperAgent DO via RPC
 *   DO (RPC)  → owns D1 row, paper text, review, votes, challenges
 *   HTTP      → read D1 for feed, call DO RPC for detail/vote/challenge
 */

import {getAgentByName} from "agents";
import {
  feedPage,
  paperDetailPage,
  errorPage,
  aboutPage,
  loginPage,
  signupPage,
  accountPage,
  adminPage,
} from "./html";
import type { PaperRow, PaperMeta, QueueMessage } from "./types";
import {
  PAPERS_TABLE,
  compareArxivVersions,
  composeVersionedId,
  ensurePaperStore,
  parseArxivId,
} from "./papers";
import {
  applyReaderStateEvents,
  applyUserVote,
  authenticateUser,
  createInvite,
  createSession,
  destroySessionFromRequest,
  ensureAuthTables,
  getInviteCodeStatus,
  getReaderStateCounts,
  getUserVotesForPapers,
  getViewerFromRequest,
  importReaderState,
  isAuthError,
  isBootstrapOpen,
  listInvitesForAdmin,
  listInvitesForUser,
  listUsersForAdmin,
  registerUser,
  sanitizeNextPath,
  serializeClearSessionCookie,
  serializeSessionCookie,
  updateUserForAdmin,
  type Viewer,
} from "./auth";
export { PaperAgent } from "./paper-agent";
import { env } from "cloudflare:workers";

const PAGE_SIZE = 20;
const IS_DEV = env.DEV === "true";
type FeedSort = "hot" | "new" | "top";

const INGEST_RETRY_AFTER_SECONDS = 60;
const CHALLENGE_RETRY_AFTER_SECONDS = 60;
const VOTE_RETRY_AFTER_SECONDS = 60;
const AUTH_RETRY_AFTER_SECONDS = 60;
const OAI_BASE_URL = "https://oaipmh.arxiv.org/oai";
const OAI_METADATA_PREFIX = "arXivRaw";
const INITIAL_HARVEST_LOOKBACK_DAYS = IS_DEV ? 1 : 2;

function htmlResponse(html: string, status = 200, headers: HeadersInit = {}): Response {
  return new Response(html, {
    status,
    headers: {
      ...headers,
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

function redirectResponse(location: string, headers: HeadersInit = {}): Response {
  return new Response(null, {
    status: 303,
    headers: {
      ...headers,
      Location: location,
    },
  });
}

function noStoreHeaders(headers: HeadersInit = {}): HeadersInit {
  return {
    ...headers,
    "Cache-Control": "no-store",
  };
}

function tooManyRequestsResponse(
  request: Request,
  message: string,
  retryAfterSeconds: number,
): Response {
  const headers = {
    "Cache-Control": "no-store",
    "Retry-After": String(retryAfterSeconds),
  };

  if (wantsJsonResponse(request)) {
    return Response.json(
      { error: message, retryAfter: retryAfterSeconds },
      { status: 429, headers },
    );
  }

  return new Response(errorPage(429, message), {
    status: 429,
    headers: {
      ...headers,
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

function isFeedSort(value: string | null): value is FeedSort {
  return value === "hot" || value === "new" || value === "top";
}

function normalizePaperLookup(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "arxiv.org") {
      const match = url.pathname.match(/^\/(?:abs|pdf|html)\/(.+)$/);
      if (match) {
        return normalizeArxivId(match[1].replace(/\.pdf$/i, ""));
      }
    }
  } catch {
    // Fall back to raw ID parsing.
  }

  return normalizeArxivId(raw.replace(/^arxiv:/i, ""));
}

function normalizeArxivId(value: string): string | null {
  return parseArxivId(value.trim())?.versionedId ?? null;
}

function wantsJsonResponse(request: Request): boolean {
  const accept = request.headers.get("accept") ?? "";
  const requestedWith = request.headers.get("x-requested-with") ?? "";
  return accept.includes("application/json") || requestedWith === "fetch";
}

function currentPath(url: URL): string {
  return `${url.pathname}${url.search}`;
}

function authActorKey(viewer: Viewer | null, request: Request): string {
  return viewer ? `user:${viewer.userId}` : `ip:${rateLimitActorKey(request)}`;
}

function authRequiredResponse(request: Request, nextPath: string): Response {
  const loginUrl = `/login?next=${encodeURIComponent(nextPath)}`;

  if (wantsJsonResponse(request)) {
    return Response.json(
      {
        error: "Sign in required.",
        loginUrl,
      },
      {
        status: 401,
        headers: noStoreHeaders(),
      },
    );
  }

  return redirectResponse(loginUrl, noStoreHeaders());
}

function adminRequiredResponse(
  request: Request,
  url: URL,
  viewer: Viewer | null,
): Response | null {
  if (!viewer) {
    return authRequiredResponse(request, currentPath(url));
  }

  if (viewer.role !== "admin") {
    if (wantsJsonResponse(request)) {
      return Response.json(
        { error: "Admin access required." },
        {
          status: 403,
          headers: noStoreHeaders(),
        },
      );
    }

    return htmlResponse(errorPage(403, "Admin access required."), 403, noStoreHeaders());
  }

  return null;
}

function authRedirectTarget(nextPath: string | null | undefined): string {
  return sanitizeNextPath(nextPath, "/account");
}

function rateLimitActorKey(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    forwardedFor ??
    "local";

  return ip || "local";
}

async function shouldAllow(
  limiter: RateLimit,
  key: string,
  label: string,
): Promise<boolean> {
  const { success } = await limiter.limit({ key });
  if (!success) {
    console.warn(`[rate-limit] ${label} blocked for ${key}`);
  }
  return success;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Cron: discovery only — fetch arXiv metadata, enqueue for DOs
// ---------------------------------------------------------------------------

async function scheduled(env: Env): Promise<void> {
  await ensurePaperStore(env.DB);
  await ensureHarvestStateTable(env);

  // Read watched categories from D1 (editable without redeploy)
  const catRows = await env.DB.prepare(
    "SELECT category FROM watched_categories",
  ).all<{ category: string }>();
  let categories = catRows.results.map((r) => r.category);
  const uniquePapers = new Map<string, PaperMeta>();
  const harvestDates = new Map<string, string>();

  // Dev: only first category
  if (IS_DEV) categories = categories.slice(0, 1);

  for (const cat of categories) {
    try {
      const harvest = await harvestCategory(cat, env);
      harvestDates.set(cat, harvest.responseDate);

      for (const meta of harvest.papers) {
        uniquePapers.set(meta.id, meta);
      }

      await sleep(1200);
    } catch (err) {
      console.error(`[cron] ${cat} failed:`, err);
    }
  }

  if (uniquePapers.size === 0) {
    await persistHarvestDates(harvestDates, env);
    console.log(`[cron${IS_DEV ? ":dev" : ""}] no new OAI papers to enqueue`);
    return;
  }

  await enqueuePapers(Array.from(uniquePapers.values()), env);
  await persistHarvestDates(harvestDates, env);

  console.log(
    `[cron${IS_DEV ? ":dev" : ""}] enqueued ${uniquePapers.size} unique papers from OAI`,
  );
}

async function harvestCategory(
  category: string,
  env: Env,
): Promise<{ papers: PaperMeta[]; responseDate: string }> {
  const label = `[cron${IS_DEV ? ":dev" : ""}]`;
  const fromDate = await getHarvestFromDate(category, env);
  const setSpec = categoryToOaiSetSpec(category);
  const { papers, responseDate } = await fetchOaiRecords(setSpec, fromDate);
  const newSubmissions = papers.filter(
    (paper) => paper.publishedAt.slice(0, 10) >= fromDate,
  );

  await setHarvestDate(category, responseDate, env);

  console.log(
    `${label} ${category}: harvested ${papers.length} updated records and kept ${newSubmissions.length} new submissions via OAI from ${fromDate} -> ${responseDate}`,
  );

  return {
    papers: newSubmissions,
    responseDate,
  };
}

async function ensureHarvestStateTable(env: Env): Promise<void> {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS harvest_state (
      category TEXT PRIMARY KEY,
      last_harvest_date TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`
  ).run();
}

async function getHarvestFromDate(category: string, env: Env): Promise<string> {
  const row = await env.DB.prepare(
    "SELECT last_harvest_date FROM harvest_state WHERE category = ?"
  ).bind(category).first<{ last_harvest_date: string }>();

  return normalizeHarvestDate(row?.last_harvest_date) ?? initialHarvestDate();
}

async function setHarvestDate(
  category: string,
  responseDate: string,
  env: Env,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO harvest_state (category, last_harvest_date, updated_at)
     VALUES (?, ?, unixepoch())
     ON CONFLICT(category) DO UPDATE SET
       last_harvest_date = excluded.last_harvest_date,
       updated_at = excluded.updated_at`
  ).bind(category, responseDate).run();
}

async function persistHarvestDates(
  harvestDates: Map<string, string>,
  env: Env,
): Promise<void> {
  for (const [category, responseDate] of harvestDates) {
    await setHarvestDate(category, responseDate, env);
  }
}

async function enqueuePapers(papers: PaperMeta[], env: Env): Promise<void> {
  const chunkSize = 100;

  for (let offset = 0; offset < papers.length; offset += chunkSize) {
    const batch = papers.slice(offset, offset + chunkSize).map((meta) => ({
      body: { paperId: meta.id, meta },
    }));
    await env.PAPER_QUEUE.sendBatch(batch);
  }
}

function initialHarvestDate(): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - INITIAL_HARVEST_LOOKBACK_DAYS);
  return date.toISOString().slice(0, 10);
}

function normalizeHarvestDate(value: string | null | undefined): string | null {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function categoryToOaiSetSpec(category: string): string {
  if (!category.includes(".")) return category;

  const [archive, subject] = category.split(".", 2);
  return `${archive}:${archive}:${subject.toUpperCase()}`;
}

async function fetchOaiRecords(
  setSpec: string,
  fromDate: string,
): Promise<{ papers: PaperMeta[]; responseDate: string }> {
  const papers = new Map<string, PaperMeta>();
  let responseDate = fromDate;
  let resumptionToken: string | null = null;

  do {
    const page = await fetchOaiPage(setSpec, fromDate, resumptionToken);
    responseDate = page.responseDate;

    for (const meta of page.papers) {
      papers.set(meta.id, meta);
    }

    resumptionToken = page.resumptionToken;
    if (resumptionToken) {
      await sleep(500);
    }
  } while (resumptionToken);

  return {
    papers: Array.from(papers.values()),
    responseDate,
  };
}

async function fetchOaiPage(
  setSpec: string,
  fromDate: string,
  resumptionToken: string | null,
): Promise<{
  papers: PaperMeta[];
  responseDate: string;
  resumptionToken: string | null;
}> {
  const url = new URL(OAI_BASE_URL);
  url.searchParams.set("verb", "ListRecords");

  if (resumptionToken) {
    url.searchParams.set("resumptionToken", resumptionToken);
  } else {
    url.searchParams.set("metadataPrefix", OAI_METADATA_PREFIX);
    url.searchParams.set("set", setSpec);
    url.searchParams.set("from", fromDate);
  }

  const res = await fetchWithRetry(url.toString());
  const xml = await res.text();
  const responseDate = parseOaiResponseDate(xml) ?? fromDate;

  if (xml.includes('code="noRecordsMatch"')) {
    return {
      papers: [],
      responseDate,
      resumptionToken: null,
    };
  }

  const errorMatch = xml.match(/<error\b[^>]*code="([^"]+)"[^>]*>([\s\S]*?)<\/error>/i);
  if (errorMatch) {
    throw new Error(`OAI ${errorMatch[1]}: ${decodeXml(errorMatch[2].trim())}`);
  }

  return {
    papers: parseOaiListRecords(xml),
    responseDate,
    resumptionToken: parseOaiResumptionToken(xml),
  };
}

function parseOaiResponseDate(xml: string): string | null {
  const value = extractTag(xml, "responseDate")?.trim();
  if (!value) return null;
  return value.slice(0, 10);
}

function parseOaiResumptionToken(xml: string): string | null {
  const match = xml.match(/<resumptionToken\b[^>]*>([\s\S]*?)<\/resumptionToken>/i);
  const token = match?.[1]?.trim();
  return token ? decodeXml(token) : null;
}

function parseOaiListRecords(xml: string): PaperMeta[] {
  const papers: PaperMeta[] = [];
  const records = xml.match(/<record>([\s\S]*?)<\/record>/g) ?? [];

  for (const record of records) {
    const meta = parseOaiRecord(record);
    if (meta) papers.push(meta);
  }

  return papers;
}

function parseOaiRecord(recordXml: string): PaperMeta | null {
  const headerMatch = recordXml.match(/<header\b([^>]*)>([\s\S]*?)<\/header>/i);
  if (!headerMatch || headerMatch[1].includes('status="deleted"')) {
    return null;
  }

  const metadataXml = recordXml.match(/<metadata>([\s\S]*?)<\/metadata>/i)?.[1];
  const rawXml = metadataXml?.match(/<arXivRaw\b[\s\S]*?>([\s\S]*?)<\/arXivRaw>/i)?.[1];
  if (!rawXml) return null;

  const baseId = decodeXml(extractTag(rawXml, "id") ?? "").trim();
  const title = decodeXml(extractTag(rawXml, "title") ?? "").replace(/\s+/g, " ").trim();
  const abstract = decodeXml(extractTag(rawXml, "abstract") ?? "").replace(/\s+/g, " ").trim();
  const authors = splitOaiAuthors(decodeXml(extractTag(rawXml, "authors") ?? ""));
  const categories = decodeXml(extractTag(rawXml, "categories") ?? "")
    .split(/\s+/)
    .map((category) => category.trim())
    .filter(Boolean);
  const versions = parseOaiVersions(rawXml);

  if (!baseId || !title || !abstract || versions.length === 0) {
    return null;
  }

  const publishedAt = versions[0].submittedAt;
  const latest = versions[versions.length - 1];
  const version = latest.version.toLowerCase();
  const versionedId = composeVersionedId(baseId, version);

  return {
    id: baseId,
    version,
    versionedId,
    title,
    authors,
    abstract,
    categories,
    publishedAt,
    arxivUrl: `https://arxiv.org/abs/${versionedId}`,
    pdfUrl: `https://arxiv.org/pdf/${versionedId}`,
  };
}

function parseOaiVersions(rawXml: string): Array<{ version: string; submittedAt: string }> {
  const versions: Array<{ version: string; submittedAt: string }> = [];
  const matches = rawXml.matchAll(/<version\b[^>]*version="([^"]+)"[^>]*>([\s\S]*?)<\/version>/gi);

  for (const match of matches) {
    const submittedAt = extractTag(match[2], "date")?.trim();
    if (!submittedAt) continue;

    const parsedDate = new Date(decodeXml(submittedAt));
    if (Number.isNaN(parsedDate.getTime())) continue;

    versions.push({
      version: match[1],
      submittedAt: parsedDate.toISOString(),
    });
  }

  return versions;
}

function splitOaiAuthors(value: string): string[] {
  return value
    .replace(/\s+and\s+/g, ", ")
    .split(/\s*,\s*/)
    .map((author) => author.trim())
    .filter(Boolean);
}

async function fetchWithRetry(url: string): Promise<Response> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, {
      headers: { "User-Agent": "arxlens/1.0 (https://arxlens.workers.dev)" },
    });
    if (res.status !== 429 && res.status !== 503) {
      if (!res.ok) throw new Error(`arXiv API error ${res.status}`);
      return res;
    }
    const retryAfter = parseInt(res.headers.get("retry-after") ?? "0", 10);
    const wait = (retryAfter > 0 ? retryAfter : 10 * attempt) * 1000;
    console.warn(`[arxiv] ${res.status}, waiting ${wait}ms (attempt ${attempt}/3)`);
    await sleep(wait);
  }
  throw new Error("arXiv: exhausted retries on throttled response");
}

async function renderAccountResponse(
  env: Env,
  viewer: Viewer,
  extras: {
    createdInviteCode?: string;
    createdInviteExpiresAt?: number;
    notice?: {
      kind: "error" | "success" | "info" | "warning";
      message: string;
    };
  } = {},
): Promise<Response> {
  const [counts, invites] = await Promise.all([
    getReaderStateCounts(env.DB, viewer.userId),
    listInvitesForUser(env.DB, viewer.userId),
  ]);

  return htmlResponse(
    accountPage({
      viewer,
      savedCount: counts.savedCount,
      seenCount: counts.seenCount,
      readCount: counts.readCount,
      invites,
      ...(extras.createdInviteCode
        ? { createdInviteCode: extras.createdInviteCode }
        : {}),
      ...(extras.createdInviteExpiresAt
        ? { createdInviteExpiresAt: extras.createdInviteExpiresAt }
        : {}),
      ...(extras.notice ? { notice: extras.notice } : {}),
    }),
    200,
    noStoreHeaders(),
  );
}

async function renderAdminResponse(
  env: Env,
  viewer: Viewer,
  extras: {
    notice?: {
      kind: "error" | "success" | "info" | "warning";
      message: string;
    };
  } = {},
): Promise<Response> {
  const [users, invites] = await Promise.all([
    listUsersForAdmin(env.DB),
    listInvitesForAdmin(env.DB),
  ]);

  return htmlResponse(
    adminPage({
      viewer,
      users,
      invites,
      ...(extras.notice ? { notice: extras.notice } : {}),
    }),
    200,
    noStoreHeaders(),
  );
}

async function handleLoginPageRequest(
  url: URL,
  viewer: Viewer | null,
): Promise<Response> {
  const nextPath = authRedirectTarget(url.searchParams.get("next"));
  if (viewer) {
    return redirectResponse(nextPath, noStoreHeaders());
  }

  return htmlResponse(
    loginPage({
      nextPath,
      username: "",
    }),
    200,
    noStoreHeaders(),
  );
}

async function handleLogin(
  request: Request,
  env: Env,
): Promise<Response> {
  const allowed = await shouldAllow(
    env.AUTH_LIMITER,
    `auth:${rateLimitActorKey(request)}`,
    "login",
  );
  if (!allowed) {
    return tooManyRequestsResponse(
      request,
      "Too many login attempts from this browser. Try again in a minute.",
      AUTH_RETRY_AFTER_SECONDS,
    );
  }

  const formData = await request.formData();
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const nextPath = authRedirectTarget(formData.get("next") as string | null);

  const viewer = await authenticateUser(env.DB, username, password);
  if (!viewer) {
    return htmlResponse(
      loginPage({
        nextPath,
        username,
        error: "Invalid username or password.",
      }),
      400,
      noStoreHeaders(),
    );
  }

  const session = await createSession(env.DB, viewer.userId);
  return redirectResponse(
    nextPath,
    noStoreHeaders({
      "Set-Cookie": serializeSessionCookie(session.token, request.url),
    }),
  );
}

async function handleSignupPageRequest(
  url: URL,
  viewer: Viewer | null,
  env: Env,
): Promise<Response> {
  const nextPath = authRedirectTarget(url.searchParams.get("next"));
  if (viewer) {
    return redirectResponse(nextPath, noStoreHeaders());
  }

  const bootstrapOpen = await isBootstrapOpen(env.DB);
  const inviteCode = (url.searchParams.get("invite") ?? "").trim();
  const inviteStatus = !bootstrapOpen && inviteCode
    ? await getInviteCodeStatus(env.DB, inviteCode)
    : null;

  return htmlResponse(
    signupPage({
      nextPath,
      username: "",
      inviteCode,
      bootstrapOpen,
      inviteStatus,
    }),
    200,
    noStoreHeaders(),
  );
}

async function handleSignup(
  request: Request,
  env: Env,
): Promise<Response> {
  const allowed = await shouldAllow(
    env.AUTH_LIMITER,
    `auth:${rateLimitActorKey(request)}`,
    "signup",
  );
  if (!allowed) {
    return tooManyRequestsResponse(
      request,
      "Too many signup attempts from this browser. Try again in a minute.",
      AUTH_RETRY_AFTER_SECONDS,
    );
  }

  const formData = await request.formData();
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("password_confirm") ?? "");
  const inviteCode = String(formData.get("invite") ?? "").trim();
  const nextPath = authRedirectTarget(formData.get("next") as string | null);
  const bootstrapOpen = await isBootstrapOpen(env.DB);
  const inviteStatus = !bootstrapOpen && inviteCode
    ? await getInviteCodeStatus(env.DB, inviteCode)
    : null;

  if (password !== passwordConfirm) {
    return htmlResponse(
      signupPage({
        nextPath,
        username,
        inviteCode,
        bootstrapOpen,
        inviteStatus,
        error: "Passwords do not match.",
      }),
      400,
      noStoreHeaders(),
    );
  }

  try {
    const result = await registerUser(env.DB, {
      username,
      password,
      inviteCode,
    });

    return redirectResponse(
      nextPath,
      noStoreHeaders({
        "Set-Cookie": serializeSessionCookie(result.sessionToken, request.url),
      }),
    );
  } catch (err) {
    const message = isAuthError(err)
      ? err.message
      : "Could not create account right now. Try again.";
    return htmlResponse(
      signupPage({
        nextPath,
        username,
        inviteCode,
        bootstrapOpen,
        inviteStatus,
        error: message,
      }),
      isAuthError(err) ? err.status : 500,
      noStoreHeaders(),
    );
  }
}

async function handleLogout(request: Request, env: Env): Promise<Response> {
  await destroySessionFromRequest(request, env.DB);
  return redirectResponse(
    "/",
    noStoreHeaders({
      "Set-Cookie": serializeClearSessionCookie(request.url),
    }),
  );
}

async function handleAccount(
  request: Request,
  url: URL,
  viewer: Viewer | null,
  env: Env,
): Promise<Response> {
  if (!viewer) return authRequiredResponse(request, currentPath(url));
  return renderAccountResponse(env, viewer);
}

async function handleAdmin(
  request: Request,
  url: URL,
  viewer: Viewer | null,
  env: Env,
): Promise<Response> {
  const guard = adminRequiredResponse(request, url, viewer);
  if (guard) return guard;
  return renderAdminResponse(env, viewer!);
}

async function handleAdminUserUpdate(
  userId: string,
  request: Request,
  url: URL,
  viewer: Viewer | null,
  env: Env,
): Promise<Response> {
  const guard = adminRequiredResponse(request, url, viewer);
  if (guard) return guard;

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const value = String(formData.get("value") ?? "");

  try {
    if (intent === "status") {
      await updateUserForAdmin(env.DB, viewer!, {
        userId,
        status: value === "disabled" ? "disabled" : "active",
      });

      return renderAdminResponse(env, viewer!, {
        notice: {
          kind: "success",
          message: value === "disabled" ? "User disabled." : "User re-enabled.",
        },
      });
    }

    if (intent === "invites") {
      await updateUserForAdmin(env.DB, viewer!, {
        userId,
        canCreateInvites: value === "1",
      });

      return renderAdminResponse(env, viewer!, {
        notice: {
          kind: "success",
          message: value === "1" ? "Invite access granted." : "Invite access revoked.",
        },
      });
    }

    return renderAdminResponse(env, viewer!, {
      notice: {
        kind: "error",
        message: "Unknown admin action.",
      },
    });
  } catch (err) {
    return renderAdminResponse(env, viewer!, {
      notice: {
        kind: isAuthError(err) ? "error" : "warning",
        message: isAuthError(err) ? err.message : "Could not update that user right now.",
      },
    });
  }
}

async function handleCreateInvite(
  request: Request,
  url: URL,
  viewer: Viewer | null,
  env: Env,
): Promise<Response> {
  if (!viewer) return authRequiredResponse(request, currentPath(url));

  try {
    const invite = await createInvite(env.DB, viewer);
    return renderAccountResponse(env, viewer, {
      createdInviteCode: invite.code,
      createdInviteExpiresAt: invite.expiresAt,
      notice: {
        kind: "success",
        message: "New invite created.",
      },
    });
  } catch (err) {
    const message = isAuthError(err)
      ? err.message
      : "Could not create invite right now. Try again.";
    return renderAccountResponse(env, viewer, {
      notice: {
        kind: isAuthError(err) ? "error" : "warning",
        message,
      },
    });
  }
}

async function handleReaderStateImport(
  request: Request,
  viewer: Viewer | null,
  env: Env,
): Promise<Response> {
  if (!viewer) return authRequiredResponse(request, "/account");

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, {
      status: 400,
      headers: noStoreHeaders(),
    });
  }

  const snapshot = await importReaderState(env.DB, viewer.userId, payload);
  return Response.json(snapshot, { headers: noStoreHeaders() });
}

async function handleReaderStateEvents(
  request: Request,
  viewer: Viewer | null,
  env: Env,
): Promise<Response> {
  if (!viewer) return authRequiredResponse(request, "/account");

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, {
      status: 400,
      headers: noStoreHeaders(),
    });
  }

  await applyReaderStateEvents(env.DB, viewer.userId, payload);
  return Response.json({ ok: true }, { headers: noStoreHeaders() });
}

async function handleAbout(viewer: Viewer | null, env: Env): Promise<Response> {
  const [catRows, countRow, reviewedRow] = await Promise.all([
    env.DB.prepare("SELECT category FROM watched_categories").all<{ category: string }>(),
    env.DB.prepare(`SELECT COUNT(*) as n FROM ${PAPERS_TABLE}`).first<{ n: number }>(),
    env.DB.prepare(`SELECT COUNT(*) as n FROM ${PAPERS_TABLE} WHERE review_status = 'done'`).first<{ n: number }>(),
  ]);

  return htmlResponse(aboutPage({
    categories: catRows.results.map(r => r.category),
    paperCount: countRow?.n ?? 0,
    reviewedCount: reviewedRow?.n ?? 0,
    viewer,
  }));
}

async function handleFeed(url: URL, viewer: Viewer | null, env: Env): Promise<Response> {
  const lookupValue = (url.searchParams.get("paper") ?? "").trim();
  if (lookupValue) {
    const paperId = normalizePaperLookup(lookupValue);
    if (paperId) {
      return Response.redirect(
        new URL(`/paper/${encodeURIComponent(paperId)}`, url).toString(),
        303,
      );
    }
  }

  const sort = isFeedSort(url.searchParams.get("sort"))
    ? (url.searchParams.get("sort") as FeedSort)
    : "hot";
  const selectedCategory = (url.searchParams.get("category") ?? "").trim();
  const reviewedOnly = url.searchParams.get("reviewed") === "1";
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const offset = (page - 1) * PAGE_SIZE;

  const whereClauses: string[] = [];
  const whereBindings: Array<string | number> = [];

  if (selectedCategory) {
    whereClauses.push(
      `EXISTS (SELECT 1 FROM json_each(${PAPERS_TABLE}.categories) WHERE json_each.value = ?)`
    );
    whereBindings.push(selectedCategory);
  }

  if (reviewedOnly) {
    whereClauses.push("review_status = 'done'");
  }

  const whereSql = whereClauses.length > 0
    ? `WHERE ${whereClauses.join(" AND ")}`
    : "";

  const orderBy =
    sort === "new"
      ? "published_at DESC"
      : sort === "top"
        ? "(votes_up - votes_down) DESC"
        : "CASE WHEN review_status = 'done' THEN 1 ELSE 0 END DESC, fetched_at DESC, (votes_up - votes_down) DESC";

  const [rows, countRow, catRows] = await Promise.all([
    env.DB.prepare(`SELECT * FROM ${PAPERS_TABLE} ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
      .bind(...whereBindings, PAGE_SIZE, offset)
      .all<PaperRow>(),
    env.DB.prepare(`SELECT COUNT(*) as n FROM ${PAPERS_TABLE} ${whereSql}`)
      .bind(...whereBindings)
      .first<{ n: number }>(),
    env.DB.prepare("SELECT category FROM watched_categories ORDER BY category ASC")
      .all<{ category: string }>(),
  ]);

  const categories = catRows.results.map((row) => row.category);
  if (selectedCategory && !categories.includes(selectedCategory)) {
    categories.unshift(selectedCategory);
  }

  const userVotes = await getUserVotesForPapers(
    env.DB,
    viewer?.userId,
    rows.results.map((row) => row.id),
  );

  return htmlResponse(
    feedPage({
      papers: rows.results,
      sort,
      page,
      total: countRow?.n ?? 0,
      pageSize: PAGE_SIZE,
      categories,
      selectedCategory,
      reviewedOnly,
      lookupValue,
      lookupError: lookupValue ? `Couldn't understand "${lookupValue}". Paste an arXiv URL or paper ID.` : "",
      currentPath: currentPath(url),
      viewer,
      userVotes,
    }),
  );
}

async function handlePaperDetail(
  rawId: string,
  request: Request,
  url: URL,
  viewer: Viewer | null,
  env: Env,
): Promise<Response> {
  const requested = parseArxivId(decodeURIComponent(rawId));
  if (!requested) {
    return htmlResponse(errorPage(404, `Paper "${decodeURIComponent(rawId)}" not found on arXiv.`), 404);
  }

  let id = requested.baseId;

  let paper = await env.DB.prepare(`SELECT * FROM ${PAPERS_TABLE} WHERE id = ?`)
    .bind(id)
    .first<PaperRow>();

  const shouldRefreshRequestedVersion =
    !!requested.version && (!paper || compareArxivVersions(requested.version, paper.version) > 0);

  // On-demand ingestion for papers not in our feed
  if (!paper || shouldRefreshRequestedVersion) {
    const actorKey = rateLimitActorKey(request);
    const allowed = await shouldAllow(
      env.INGEST_LIMITER,
      `ingest:${actorKey}`,
      `ingest:${requested.versionedId}`,
    );
    if (!allowed) {
      return tooManyRequestsResponse(
        request,
        "Too many on-demand paper lookups from this browser. Try again in a minute.",
        INGEST_RETRY_AFTER_SECONDS,
      );
    }

    const meta = await fetchPaperById(requested.versionedId);
    if (!meta)
      return htmlResponse(
        errorPage(404, `Paper "${requested.versionedId}" not found on arXiv.`),
        404,
      );

    // Init via RPC (DO will upsert its own D1 row)
    const stub = await getAgentByName(env.PAPER_AGENT, meta.versionedId);
    await stub.init(meta);

    if (decodeURIComponent(rawId) !== meta.id) {
      return Response.redirect(
        new URL(`/paper/${encodeURIComponent(meta.id)}`, url).toString(),
        303,
      );
    }

    id = meta.id;

    paper = await env.DB.prepare(`SELECT * FROM ${PAPERS_TABLE} WHERE id = ?`)
      .bind(meta.id)
      .first<PaperRow>();
    if (!paper)
      return htmlResponse(errorPage(500, "Failed to ingest paper."), 500);
  }

  if (decodeURIComponent(rawId) !== paper.id) {
    return Response.redirect(
      new URL(`/paper/${encodeURIComponent(paper.id)}`, url).toString(),
      303,
    );
  }

  const stub = await getAgentByName(env.PAPER_AGENT, paper.versioned_id);
  const { state: doState, challenges } = await stub.getState();
  const userVotes = await getUserVotesForPapers(env.DB, viewer?.userId, [paper.id]);

  return htmlResponse(
    paperDetailPage({
      paper,
      intro: doState?.intro ?? "",
      review: doState?.review ?? "",
      reviewData: doState?.reviewData ?? null,
      reviewStatus: doState?.reviewStatus ?? paper.review_status,
      challenges,
      challengeQueued: url.searchParams.get("challenge") === "queued",
      currentPath: `/paper/${encodeURIComponent(paper.id)}`,
      viewer,
      userVote: userVotes[paper.id] ?? null,
    }),
  );
}

async function fetchPaperById(id: string): Promise<PaperMeta | null> {
  try {
    const res = await fetchWithRetry(
      `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}&max_results=1`,
    );
    const papers = parseArxivAtom(await res.text());
    return papers[0] ?? null;
  } catch (err) {
    console.error(`[on-demand] ${id} failed:`, err);
    return null;
  }
}

async function handleVote(
  rawId: string,
  request: Request,
  reqUrl: URL,
  viewer: Viewer | null,
  env: Env,
): Promise<Response> {
  const parsed = parseArxivId(decodeURIComponent(rawId));
  const id = parsed?.baseId ?? decodeURIComponent(rawId);
  const formData = await request.formData();
  const nextPath = authRedirectTarget(
    (formData.get("next") as string | null) ?? `/paper/${encodeURIComponent(id)}`,
  );
  const dir = formData.get("dir") as "up" | "down";
  if (dir !== "up" && dir !== "down")
    return htmlResponse(errorPage(400, "Invalid vote."), 400);

  if (!viewer) return authRequiredResponse(request, nextPath);

  const paper = await env.DB.prepare(`SELECT * FROM ${PAPERS_TABLE} WHERE id = ?`)
    .bind(id)
    .first<PaperRow>();
  if (!paper) return htmlResponse(errorPage(404, "Paper not found."), 404);

  const actorKey = authActorKey(viewer, request);
  const allowed = await shouldAllow(
    env.VOTE_LIMITER,
    `vote:${actorKey}`,
    `vote:${id}`,
  );
  if (!allowed) {
    return tooManyRequestsResponse(
      request,
      "You're voting too quickly. Give it a few seconds and try again.",
        VOTE_RETRY_AFTER_SECONDS,
      );
  }

  const update = await applyUserVote(env.DB, viewer.userId, id, dir);
  await env.DB.prepare(
    `UPDATE ${PAPERS_TABLE}
     SET votes_up = ?, votes_down = ?
     WHERE id = ?`,
  ).bind(update.votesUp, update.votesDown, id).run();

  const stub = await getAgentByName(env.PAPER_AGENT, paper.versioned_id);
  await stub.setVoteTotals(update.votesUp, update.votesDown);

  if (wantsJsonResponse(request)) {
    return Response.json(
      {
        dir,
        votesUp: update.votesUp,
        votesDown: update.votesDown,
        score: update.votesUp - update.votesDown,
        userVote: update.userVote,
      },
      { headers: noStoreHeaders() },
    );
  }

  return redirectResponse(new URL(nextPath, reqUrl).toString(), noStoreHeaders());
}


async function handleChallenge(
  rawId: string,
  request: Request,
  reqUrl: URL,
  viewer: Viewer | null,
  env: Env,
): Promise<Response> {
  const parsed = parseArxivId(decodeURIComponent(rawId));
  const id = parsed?.baseId ?? decodeURIComponent(rawId);
  const formData = await request.formData();
  const nextPath = authRedirectTarget(
    (formData.get("next") as string | null) ?? `/paper/${encodeURIComponent(id)}`,
  );

  if (!viewer) return authRequiredResponse(request, nextPath);

  const prompt = (formData.get("prompt") as string | null)?.trim();
  if (!prompt)
    return htmlResponse(errorPage(400, "Challenge prompt is required."), 400);

  const paper = await env.DB.prepare(`SELECT * FROM ${PAPERS_TABLE} WHERE id = ?`)
    .bind(id)
    .first<PaperRow>();
  if (!paper) return htmlResponse(errorPage(404, "Paper not found."), 404);

  const actorKey = authActorKey(viewer, request);
  const allowed = await shouldAllow(
    env.CHALLENGE_LIMITER,
    `challenge:${actorKey}`,
    `challenge:${id}`,
  );
  if (!allowed) {
    return tooManyRequestsResponse(
      request,
      "Too many challenge requests from this browser. Try again in a minute.",
        CHALLENGE_RETRY_AFTER_SECONDS,
      );
  }

  const stub = await getAgentByName(env.PAPER_AGENT, paper.versioned_id);
  await stub.challenge(prompt, viewer.userId);

  const redirectUrl = new URL(`/paper/${encodeURIComponent(id)}`, reqUrl);
  redirectUrl.searchParams.set("challenge", "queued");
  redirectUrl.hash = "challenges";

  return Response.redirect(
    redirectUrl.toString(),
    303,
  );
}

function parseArxivAtom(xml: string): PaperMeta[] {
  const papers: PaperMeta[] = [];
  const entries = xml.match(/<entry>([\s\S]*?)<\/entry>/g) ?? [];

  for (const entry of entries) {
    try {
      const id = extractTag(entry, "id")
        ?.replace("http://arxiv.org/abs/", "")
        ?.replace("https://arxiv.org/abs/", "")
        ?.trim();
      if (!id) continue;

      const parsedId = parseArxivId(id);
      if (!parsedId) continue;

      const title = decodeXml(extractTag(entry, "title") ?? "").replace(
        /\s+/g,
        " ",
      );
      const abstract = decodeXml(extractTag(entry, "summary") ?? "").replace(
        /\s+/g,
        " ",
      );
      const published =
        extractTag(entry, "published") ?? new Date().toISOString();

      const authorMatches = entry.match(/<author>[\s\S]*?<\/author>/g) ?? [];
      const authors = authorMatches
        .map((a) => decodeXml(extractTag(a, "name") ?? ""))
        .filter(Boolean);

      const categoryMatches = entry.match(/term="([^"]+)"/g) ?? [];
      const categories = categoryMatches
        .map((m) => m.replace(/term="([^"]+)"/, "$1"))
        .filter((c) => c.includes("."));

      papers.push({
        id: parsedId.baseId,
        version: parsedId.version ?? "v1",
        versionedId: parsedId.versionedId,
        title,
        authors,
        abstract,
        categories,
        publishedAt: published,
        arxivUrl: `https://arxiv.org/abs/${parsedId.versionedId}`,
        pdfUrl: `https://arxiv.org/pdf/${parsedId.versionedId}`,
      });
    } catch {
      /* skip malformed */
    }
  }

  return papers;
}

function extractTag(xml: string, tag: string): string | null {
  return (
    xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))?.[1] ?? null
  );
}

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}


export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    await ensurePaperStore(env.DB);
    await ensureAuthTables(env.DB);

    const url = new URL(request.url);
    const path = url.pathname;
    const viewer = await getViewerFromRequest(request, env.DB);

    if (path === "/" && request.method === "GET") return handleFeed(url, viewer, env);
    if (path === "/about" && request.method === "GET") return handleAbout(viewer, env);
    if (path === "/login" && request.method === "GET") return handleLoginPageRequest(url, viewer);
    if (path === "/login" && request.method === "POST") return handleLogin(request, env);
    if (path === "/signup" && request.method === "GET") return handleSignupPageRequest(url, viewer, env);
    if (path === "/signup" && request.method === "POST") return handleSignup(request, env);
    if (path === "/logout" && request.method === "POST") return handleLogout(request, env);
    if (path === "/account" && request.method === "GET") return handleAccount(request, url, viewer, env);
    if (path === "/account/invites" && request.method === "POST") return handleCreateInvite(request, url, viewer, env);
    if (path === "/account/reader-state/import" && request.method === "POST") return handleReaderStateImport(request, viewer, env);
    if (path === "/account/reader-state/events" && request.method === "POST") return handleReaderStateEvents(request, viewer, env);
    if (path === "/admin" && request.method === "GET") return handleAdmin(request, url, viewer, env);

    const adminUserMatch = path.match(/^\/admin\/users\/([^/]+)$/);
    if (adminUserMatch && request.method === "POST") {
      return handleAdminUserUpdate(adminUserMatch[1], request, url, viewer, env);
    }

    const detailMatch = path.match(/^\/paper\/([^/]+)$/);
    if (detailMatch && request.method === "GET")
      return handlePaperDetail(detailMatch[1], request, url, viewer, env);

    const voteMatch = path.match(/^\/paper\/([^/]+)\/vote$/);
    if (voteMatch && request.method === "POST")
      return handleVote(voteMatch[1], request, url, viewer, env);

    const challengeMatch = path.match(/^\/paper\/([^/]+)\/challenge$/);
    if (challengeMatch && request.method === "POST")
      return handleChallenge(challengeMatch[1], request, url, viewer, env);

    return htmlResponse(errorPage(404, "Page not found"), 404);
  },

  async scheduled(
    _event: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    await ensurePaperStore(env.DB);
    ctx.waitUntil(scheduled(env));
  },

  async queue(batch: MessageBatch<QueueMessage>, env: Env): Promise<void> {
    await ensurePaperStore(env.DB);

    for (const msg of batch.messages) {
      try {
        const { meta } = msg.body;
        const stub = await getAgentByName(env.PAPER_AGENT, meta.versionedId);
        await stub.init(meta);
        msg.ack();
        console.log(`[queue] ${meta.versionedId}: init ok`);
      } catch (err) {
        console.error(`[queue] ${msg.body.paperId} failed:`, err);
        msg.retry();
      }
    }
  },
} satisfies ExportedHandler<Env, QueueMessage>;
