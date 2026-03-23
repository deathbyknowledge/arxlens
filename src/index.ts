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
import { feedPage, paperDetailPage, errorPage } from "./html";
import type { PaperRow, PaperMeta, QueueMessage } from "./types";
export { PaperAgent } from "./paper-agent";
import { env } from "cloudflare:workers";

const PAGE_SIZE = 20;
const IS_DEV = env.DEV === "true";

function safeAgentId(arxivId: string): string {
  return arxivId
    .replace(/v\d+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, "-");
}

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
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
  // Load high-water mark
  const hwRow = await env.DB.prepare(
    "SELECT newest_published_at FROM cron_state WHERE category = ?",
  )
    .bind(category)
    .first<{ newest_published_at: string }>();
  const highWater = hwRow?.newest_published_at ?? null;

  // Build submittedDate filter if we have a high-water mark
  let dateFilter = "";
  if (highWater) {
    // Convert ISO date to arXiv format: YYYYMMDDTTTT
    const from = highWater.replace(/[-T:]/g, "").slice(0, 12);
    const now = new Date().toISOString().replace(/[-T:]/g, "").slice(0, 12);
    dateFilter = `+AND+submittedDate:[${from}+TO+${now}]`;
  }

  const maxResults = IS_DEV ? 2 : 100;
  const url =
    `https://export.arxiv.org/api/query` +
    `?search_query=cat:${encodeURIComponent(category)}${dateFilter}` +
    `&sortBy=submittedDate&sortOrder=descending` +
    `&start=0&max_results=${maxResults}`;

  const res = await fetchWithRetry(url);
  const xml = await res.text();
  const papers = parseArxivAtom(xml);

  if (papers.length === 0) {
    console.log(`[cron${IS_DEV ? ":dev" : ""}] ${category}: nothing new`);
    return;
  }

  // Filter out papers we've already seen (at or before high-water mark)
  const newPapers = highWater
    ? papers.filter((p) => p.publishedAt > highWater)
    : papers;

  if (newPapers.length > 0) {
    // Enqueue in batches (Queue.sendBatch accepts up to 100 messages)
    const messages = newPapers.map((meta) => ({
      body: { paperId: meta.id, meta },
    }));
    await env.PAPER_QUEUE.sendBatch(messages);

    // Update high-water mark to the newest paper
    const newest = newPapers.reduce((a, b) =>
      a.publishedAt > b.publishedAt ? a : b,
    );
    await env.DB.prepare(
      "INSERT OR REPLACE INTO cron_state (category, newest_published_at) VALUES (?, ?)",
    )
      .bind(category, newest.publishedAt)
      .run();
  }

  console.log(
    `[cron${IS_DEV ? ":dev" : ""}] ${category}: enqueued ${newPapers.length} papers`,
  );
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

async function handleFeed(url: URL, env: Env): Promise<Response> {
  const sort = (url.searchParams.get("sort") ?? "hot") as "hot" | "new" | "top";
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const offset = (page - 1) * PAGE_SIZE;

  const orderBy =
    sort === "new"
      ? "published_at DESC"
      : sort === "top"
        ? "(votes_up - votes_down) DESC"
        : "(votes_up - votes_down) DESC, fetched_at DESC";

  const [rows, countRow] = await Promise.all([
    env.DB.prepare(`SELECT * FROM papers ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
      .bind(PAGE_SIZE, offset)
      .all<PaperRow>(),
    env.DB.prepare(`SELECT COUNT(*) as n FROM papers`).first<{ n: number }>(),
  ]);

  return htmlResponse(
    feedPage({
      papers: rows.results,
      sort,
      page,
      total: countRow?.n ?? 0,
      pageSize: PAGE_SIZE,
    }),
  );
}

async function handlePaperDetail(rawId: string, env: Env): Promise<Response> {
  const id = decodeURIComponent(rawId);

  let paper = await env.DB.prepare("SELECT * FROM papers WHERE id = ?")
    .bind(id)
    .first<PaperRow>();

  // On-demand ingestion for papers not in our feed
  if (!paper) {
    const meta = await fetchPaperById(id);
    if (!meta)
      return htmlResponse(
        errorPage(404, `Paper "${id}" not found on arXiv.`),
        404,
      );

    // Init via RPC (DO will upsert its own D1 row)
    const stub = await getAgentByName(env.PAPER_AGENT, meta.id);
    await stub.init(meta);

    paper = await env.DB.prepare("SELECT * FROM papers WHERE id = ?")
      .bind(id)
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
      reviewStatus: doState?.reviewStatus ?? paper.review_status,
      challenges,
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

  const stub = await getAgentByName(env.PAPER_AGENT, id);
  await stub.vote(dir);

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

  const stub = await getAgentByName(env.PAPER_AGENT, id);
  await stub.challenge(prompt);

  return Response.redirect(
    new URL(`/paper/${encodeURIComponent(id)}`, reqUrl).toString(),
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

    const detailMatch = path.match(/^\/paper\/([^/]+)$/);
    if (detailMatch && request.method === "GET")
      return handlePaperDetail(detailMatch[1], env);

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
