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
import { feedPage, paperDetailPage, errorPage, aboutPage } from "./html";
import type { PaperRow, PaperMeta, QueueMessage } from "./types";
export { PaperAgent } from "./paper-agent";
import { env } from "cloudflare:workers";

const PAGE_SIZE = 20;
const IS_DEV = env.DEV === "true";
type FeedSort = "hot" | "new" | "top";

const INGEST_RETRY_AFTER_SECONDS = 60;
const CHALLENGE_RETRY_AFTER_SECONDS = 60;
const VOTE_RETRY_AFTER_SECONDS = 60;

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
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
  const candidate = value.trim();
  if (!candidate) return null;

  if (/^\d{4}\.\d{4,5}(v\d+)?$/i.test(candidate)) return candidate;
  if (/^[a-z-]+(?:\.[a-z-]+)?\/\d{7}(v\d+)?$/i.test(candidate)) return candidate;

  return null;
}

function wantsJsonResponse(request: Request): boolean {
  const accept = request.headers.get("accept") ?? "";
  const requestedWith = request.headers.get("x-requested-with") ?? "";
  return accept.includes("application/json") || requestedWith === "fetch";
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
  // Read watched categories from D1 (editable without redeploy)
  const catRows = await env.DB.prepare(
    "SELECT category FROM watched_categories",
  ).all<{ category: string }>();
  let categories = catRows.results.map((r) => r.category);

  // Dev: only first category
  if (IS_DEV) categories = categories.slice(0, 1);

  for (const cat of categories) {
    try {
      await fetchAndEnqueue(cat);
      await sleep(3500); // arXiv rate limit
    } catch (err) {
      console.error(`[cron] ${cat} failed:`, err);
    }
  }
}

async function fetchAndEnqueue(category: string): Promise<void> {
  const pageSize = IS_DEV ? 2 : 100;
  const label = `[cron${IS_DEV ? ":dev" : ""}]`;

  // Load cursor: where we left off last run
  const cursorRow = await env.DB.prepare(
    "SELECT next_offset FROM cron_state WHERE category = ?"
  ).bind(category).first<{ next_offset: number }>();
  const start = cursorRow?.next_offset ?? 0;

  const url =
    `https://export.arxiv.org/api/query` +
    `?search_query=cat:${encodeURIComponent(category)}` +
    `&sortBy=submittedDate&sortOrder=descending` +
    `&start=${start}&max_results=${pageSize}`;

  const res = await fetchWithRetry(url);
  const papers = parseArxivAtom(await res.text());

  if (papers.length === 0) {
    // Caught up — reset offset for the next daily batch
    if (start > 0) {
      await setCronOffset(category, 0);
      console.log(`${label} ${category}: caught up, reset offset`);
    } else {
      console.log(`${label} ${category}: nothing new`);
    }
    return;
  }

  // Enqueue all papers — DOs handle dedup (skip if already reviewing/done)
  const messages = papers.map((meta) => ({ body: { paperId: meta.id, meta } }));
  await env.PAPER_QUEUE.sendBatch(messages);

  // Advance the cursor so the next run picks up the next page
  await setCronOffset(category, start + papers.length);

  console.log(`${label} ${category}: enqueued ${papers.length} (offset ${start}→${start + papers.length})`);
}

async function setCronOffset(category: string, offset: number): Promise<void> {
  await env.DB.prepare(
    "INSERT OR REPLACE INTO cron_state (category, next_offset) VALUES (?, ?)"
  ).bind(category, offset).run();
}

async function fetchWithRetry(url: string): Promise<Response> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, {
      headers: { "User-Agent": "arxlens/1.0 (https://arxlens.workers.dev)" },
    });
    if (res.status !== 429) {
      if (!res.ok) throw new Error(`arXiv API error ${res.status}`);
      return res;
    }
    const retryAfter = parseInt(res.headers.get("retry-after") ?? "0", 10);
    const wait = (retryAfter > 0 ? retryAfter : 10 * attempt) * 1000;
    console.warn(`[cron] arXiv 429, waiting ${wait}ms (attempt ${attempt}/3)`);
    await sleep(wait);
  }
  throw new Error("arXiv: exhausted retries on 429");
}

async function handleAbout(env: Env): Promise<Response> {
  const [catRows, countRow, reviewedRow] = await Promise.all([
    env.DB.prepare("SELECT category FROM watched_categories").all<{ category: string }>(),
    env.DB.prepare("SELECT COUNT(*) as n FROM papers").first<{ n: number }>(),
    env.DB.prepare("SELECT COUNT(*) as n FROM papers WHERE review_status = 'done'").first<{ n: number }>(),
  ]);

  return htmlResponse(aboutPage({
    categories: catRows.results.map(r => r.category),
    paperCount: countRow?.n ?? 0,
    reviewedCount: reviewedRow?.n ?? 0,
  }));
}

async function handleFeed(url: URL, env: Env): Promise<Response> {
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
      "EXISTS (SELECT 1 FROM json_each(papers.categories) WHERE json_each.value = ?)"
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
    env.DB.prepare(`SELECT * FROM papers ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
      .bind(...whereBindings, PAGE_SIZE, offset)
      .all<PaperRow>(),
    env.DB.prepare(`SELECT COUNT(*) as n FROM papers ${whereSql}`)
      .bind(...whereBindings)
      .first<{ n: number }>(),
    env.DB.prepare("SELECT category FROM watched_categories ORDER BY category ASC")
      .all<{ category: string }>(),
  ]);

  const categories = catRows.results.map((row) => row.category);
  if (selectedCategory && !categories.includes(selectedCategory)) {
    categories.unshift(selectedCategory);
  }

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
    }),
  );
}

async function handlePaperDetail(
  rawId: string,
  request: Request,
  url: URL,
  env: Env,
): Promise<Response> {
  let id = decodeURIComponent(rawId);

  let paper = await env.DB.prepare("SELECT * FROM papers WHERE id = ?")
    .bind(id)
    .first<PaperRow>();

  // On-demand ingestion for papers not in our feed
  if (!paper) {
    const actorKey = rateLimitActorKey(request);
    const allowed = await shouldAllow(
      env.INGEST_LIMITER,
      `ingest:${actorKey}`,
      `ingest:${id}`,
    );
    if (!allowed) {
      return tooManyRequestsResponse(
        request,
        "Too many on-demand paper lookups from this browser. Try again in a minute.",
        INGEST_RETRY_AFTER_SECONDS,
      );
    }

    const meta = await fetchPaperById(id);
    if (!meta)
      return htmlResponse(
        errorPage(404, `Paper "${id}" not found on arXiv.`),
        404,
      );

    // Init via RPC (DO will upsert its own D1 row)
    const stub = await getAgentByName(env.PAPER_AGENT, meta.id);
    await stub.init(meta);

    if (meta.id !== id) {
      return Response.redirect(
        new URL(`/paper/${encodeURIComponent(meta.id)}`, url).toString(),
        303,
      );
    }

    id = meta.id;

    paper = await env.DB.prepare("SELECT * FROM papers WHERE id = ?")
      .bind(meta.id)
      .first<PaperRow>();
    if (!paper)
      return htmlResponse(errorPage(500, "Failed to ingest paper."), 500);
  }

  const stub = await getAgentByName(env.PAPER_AGENT, id);
  const { state: doState, challenges } = await stub.getState();

  return htmlResponse(
    paperDetailPage({
      paper,
      intro: doState?.intro ?? "",
      review: doState?.review ?? "",
      reviewData: doState?.reviewData ?? null,
      reviewStatus: doState?.reviewStatus ?? paper.review_status,
      challenges,
      challengeQueued: url.searchParams.get("challenge") === "queued",
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
  env: Env,
): Promise<Response> {
  const id = decodeURIComponent(rawId);
  const formData = await request.formData();
  const dir = formData.get("dir") as "up" | "down";
  if (dir !== "up" && dir !== "down")
    return htmlResponse(errorPage(400, "Invalid vote."), 400);

  const actorKey = rateLimitActorKey(request);
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

  const stub = await getAgentByName(env.PAPER_AGENT, id);
  const { votesUp, votesDown } = await stub.vote(dir);

  if (wantsJsonResponse(request)) {
    return Response.json({
      dir,
      votesUp,
      votesDown,
      score: votesUp - votesDown,
    });
  }

  return Response.redirect(
    new URL(`/paper/${encodeURIComponent(id)}`, reqUrl).toString(),
    303,
  );
}


async function handleChallenge(
  rawId: string,
  request: Request,
  reqUrl: URL,
  env: Env,
): Promise<Response> {
  const id = decodeURIComponent(rawId);
  const formData = await request.formData();
  const prompt = (formData.get("prompt") as string | null)?.trim();
  if (!prompt)
    return htmlResponse(errorPage(400, "Challenge prompt is required."), 400);

  const actorKey = rateLimitActorKey(request);
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

  const stub = await getAgentByName(env.PAPER_AGENT, id);
  await stub.challenge(prompt);

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
        id,
        title,
        authors,
        abstract,
        categories,
        publishedAt: published,
        arxivUrl: `https://arxiv.org/abs/${id}`,
        pdfUrl: `https://arxiv.org/pdf/${id}`,
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
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/" && request.method === "GET") return handleFeed(url, env);
    if (path === "/about" && request.method === "GET") return handleAbout(env);

    const detailMatch = path.match(/^\/paper\/([^/]+)$/);
    if (detailMatch && request.method === "GET")
      return handlePaperDetail(detailMatch[1], request, url, env);

    const voteMatch = path.match(/^\/paper\/([^/]+)\/vote$/);
    if (voteMatch && request.method === "POST")
      return handleVote(voteMatch[1], request, url, env);

    const challengeMatch = path.match(/^\/paper\/([^/]+)\/challenge$/);
    if (challengeMatch && request.method === "POST")
      return handleChallenge(challengeMatch[1], request, url, env);

    return htmlResponse(errorPage(404, "Page not found"), 404);
  },

  async scheduled(
    _event: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(scheduled(env));
  },

  async queue(batch: MessageBatch<QueueMessage>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      try {
        const { meta } = msg.body;
        const stub = await getAgentByName(env.PAPER_AGENT, meta.id);
        await stub.init(meta);
        msg.ack();
        console.log(`[queue] ${meta.id}: init ok`);
      } catch (err) {
        console.error(`[queue] ${msg.body.paperId} failed:`, err);
        msg.retry();
      }
    }
  },
} satisfies ExportedHandler<Env, QueueMessage>;
