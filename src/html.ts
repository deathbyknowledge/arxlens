/**
 * Server-rendered HTML for arxlens.
 * No framework, no build step. Inline CSS in GitHub style (inspired by ripgit).
 */

import type { PaperRow, Challenge } from "./types";

// ---------------------------------------------------------------------------
// Shared CSS
// ---------------------------------------------------------------------------

const CSS = `
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  font-size: 14px;
  color: #1f2328;
  background: #fff;
  line-height: 1.5;
}
a { color: #0969da; text-decoration: none; }
a:hover { text-decoration: underline; }

/* Nav */
header { border-bottom: 1px solid #d1d9e0; }
.global-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  height: 48px;
  max-width: 1100px;
  margin: 0 auto;
}
.logo { font-weight: 700; font-size: 16px; color: #1f2328; letter-spacing: -0.5px; }
.logo span { color: #0969da; }
.nav-links { display: flex; gap: 20px; font-size: 13px; color: #656d76; }
.nav-links a { color: #656d76; }
.nav-links a:hover { color: #1f2328; text-decoration: none; }

/* Main layout */
main {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px;
}

/* Feed header */
.feed-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid #d1d9e0;
}
.feed-title { font-size: 18px; font-weight: 600; }
.feed-tabs { display: flex; gap: 4px; }
.tab {
  padding: 5px 12px;
  border: 1px solid #d1d9e0;
  border-radius: 6px;
  font-size: 12px;
  color: #656d76;
  background: #fff;
  cursor: pointer;
  text-decoration: none;
}
.tab:hover { background: #f6f8fa; text-decoration: none; color: #1f2328; }
.tab.active { background: #0969da; color: #fff; border-color: #0969da; }

/* Paper card */
.paper-card {
  border: 1px solid #d1d9e0;
  border-radius: 8px;
  padding: 16px 20px;
  margin-bottom: 12px;
  transition: border-color 0.1s;
}
.paper-card:hover { border-color: #0969da; }
.paper-top { display: flex; gap: 16px; align-items: flex-start; }
.vote-col { display: flex; flex-direction: column; align-items: center; gap: 4px; flex-shrink: 0; width: 48px; }
.vote-btn {
  background: none;
  border: 1px solid #d1d9e0;
  border-radius: 4px;
  width: 32px;
  height: 28px;
  cursor: pointer;
  font-size: 14px;
  color: #656d76;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.1s, border-color 0.1s;
}
.vote-btn:hover { background: #f6f8fa; border-color: #0969da; color: #0969da; }
.vote-count { font-size: 13px; font-weight: 600; color: #1f2328; }
.paper-body { flex: 1; min-width: 0; }
.paper-title {
  font-size: 15px;
  font-weight: 600;
  color: #1f2328;
  margin-bottom: 4px;
  line-height: 1.4;
}
.paper-title a { color: #1f2328; }
.paper-title a:hover { color: #0969da; text-decoration: none; }
.paper-meta { font-size: 12px; color: #656d76; margin-bottom: 8px; }
.paper-meta .category {
  display: inline-block;
  background: #ddf4ff;
  color: #0550ae;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 11px;
  margin-right: 4px;
}
.paper-preview {
  position: relative;
}
.paper-intro {
  font-size: 13px;
  color: #1f2328;
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.paper-abstract {
  font-size: 13px;
  color: #3d444d;
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
/* Abstract tooltip: appears on hover over the preview area */
.abstract-tooltip {
  display: none;
  position: absolute;
  left: 0;
  right: 0;
  top: 100%;
  z-index: 10;
  padding-top: 6px;
}
.abstract-tooltip-inner {
  background: #fff;
  border: 1px solid #d1d9e0;
  border-radius: 8px;
  padding: 12px 14px;
  font-size: 12px;
  color: #3d444d;
  line-height: 1.6;
  font-style: italic;
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
  max-height: 200px;
  overflow-y: auto;
}
.paper-preview:hover .abstract-tooltip { display: block; }
.paper-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
  font-size: 12px;
  color: #656d76;
}
.ai-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
}
.ai-badge.done { background: #dafbe1; color: #116329; }
.ai-badge.pending { background: #fff8c5; color: #7d4e00; }
.ai-badge.reviewing { background: #ddf4ff; color: #0550ae; }
.ai-badge.error { background: #ffebe9; color: #82071e; }

/* Paper detail page */
.paper-detail { max-width: 820px; }
.paper-detail-title { font-size: 22px; font-weight: 700; margin-bottom: 8px; line-height: 1.3; }
.paper-detail-meta { font-size: 13px; color: #656d76; margin-bottom: 16px; }
.paper-links { display: flex; gap: 8px; margin-bottom: 24px; }
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 14px;
  border: 1px solid #d1d9e0;
  border-radius: 6px;
  font-size: 13px;
  color: #1f2328;
  background: #f6f8fa;
  cursor: pointer;
  text-decoration: none;
}
.btn:hover { background: #eaeef2; text-decoration: none; }
.btn-primary { background: #0969da; color: #fff; border-color: #0969da; }
.btn-primary:hover { background: #0860ca; color: #fff; }

/* Sections */
.section {
  border: 1px solid #d1d9e0;
  border-radius: 8px;
  margin-bottom: 20px;
  overflow: hidden;
}
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: #f6f8fa;
  border-bottom: 1px solid #d1d9e0;
  font-size: 13px;
  font-weight: 600;
}
.section-body {
  padding: 16px;
  font-size: 14px;
  line-height: 1.7;
  color: #1f2328;
}
.section-body p { margin-bottom: 12px; }
.section-body p:last-child { margin-bottom: 0; }

/* Abstract */
.abstract-text {
  font-size: 13px;
  line-height: 1.7;
  color: #3d444d;
  font-style: italic;
}

/* AI review sections */
.review-intro { color: #1f2328; }
.review-section-title {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #656d76;
  margin-bottom: 8px;
  margin-top: 16px;
}
.review-section-title:first-child { margin-top: 0; }

/* Vote bar on detail page */
.vote-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: #f6f8fa;
  border: 1px solid #d1d9e0;
  border-radius: 8px;
  margin-bottom: 20px;
}
.vote-bar-count { font-size: 20px; font-weight: 700; }
.vote-bar-label { font-size: 13px; color: #656d76; }
.vote-spacer { flex: 1; }

/* Challenge form */
.challenge-form textarea {
  width: 100%;
  min-height: 80px;
  padding: 10px 12px;
  border: 1px solid #d1d9e0;
  border-radius: 6px;
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
  margin-bottom: 10px;
  line-height: 1.5;
}
.challenge-form textarea:focus {
  outline: none;
  border-color: #0969da;
  box-shadow: 0 0 0 3px rgba(9, 105, 218, 0.1);
}

/* Challenge thread */
.challenge-thread { display: flex; flex-direction: column; gap: 12px; }
.challenge-item {
  border: 1px solid #d1d9e0;
  border-radius: 6px;
  overflow: hidden;
}
.challenge-user {
  padding: 10px 14px;
  background: #fff8c5;
  border-bottom: 1px solid #d1d9e0;
  font-size: 13px;
}
.challenge-user-label { font-size: 11px; font-weight: 600; text-transform: uppercase; color: #7d4e00; margin-bottom: 4px; }
.challenge-ai {
  padding: 10px 14px;
  background: #f6f8fa;
  font-size: 13px;
  line-height: 1.7;
}
.challenge-ai-label { font-size: 11px; font-weight: 600; text-transform: uppercase; color: #0550ae; margin-bottom: 4px; }
.challenge-time { font-size: 11px; color: #656d76; margin-top: 6px; }

/* Spinner / loading state */
.spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid #d1d9e0;
  border-top-color: #0969da;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  vertical-align: middle;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Status badge */
.status-pending { color: #7d4e00; }
.status-reviewing { color: #0550ae; }
.status-done { color: #116329; }
.status-error { color: #82071e; }

/* Empty state */
.empty {
  text-align: center;
  padding: 48px 24px;
  color: #656d76;
  border: 1px dashed #d1d9e0;
  border-radius: 8px;
}
.empty h3 { font-size: 16px; color: #1f2328; margin-bottom: 8px; }

/* Pagination */
.pagination {
  display: flex;
  gap: 4px;
  justify-content: center;
  margin-top: 24px;
}
.page-btn {
  padding: 5px 10px;
  border: 1px solid #d1d9e0;
  border-radius: 5px;
  font-size: 13px;
  color: #1f2328;
  background: #fff;
  text-decoration: none;
}
.page-btn:hover { background: #f6f8fa; text-decoration: none; }
.page-btn.active { background: #0969da; color: #fff; border-color: #0969da; }
.page-btn.disabled { color: #d1d9e0; pointer-events: none; }

/* Responsive */
@media (max-width: 640px) {
  .global-nav { padding: 0 16px; }
  main { padding: 16px; }
  .paper-detail-title { font-size: 18px; }
}
`;

// ---------------------------------------------------------------------------
// Layout shell
// ---------------------------------------------------------------------------

function layout(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${htmlEscape(title)} - arxlens</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.css">
<style>${CSS}</style>
</head>
<body>
<header>
  <div class="global-nav">
    <a href="/" class="logo">arx<span>lens</span></a>
    <nav class="nav-links">
      <a href="/?sort=hot">Hot</a>
      <a href="/?sort=new">New</a>
      <a href="/?sort=top">Top</a>
      <a href="/about">About</a>
    </nav>
  </div>
</header>
<main>
${content}
</main>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/contrib/auto-render.min.js"
  onload="renderMathInElement(document.body,{delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false},{left:'\\\\(',right:'\\\\)',display:false},{left:'\\\\[',right:'\\\\]',display:true}],throwOnError:false})"></script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Feed page (wall of papers)
// ---------------------------------------------------------------------------

export interface FeedOptions {
  papers: PaperRow[];
  sort: "hot" | "new" | "top";
  page: number;
  total: number;
  pageSize: number;
}

export function feedPage(opts: FeedOptions): string {
  const { papers, sort, page, total, pageSize } = opts;
  const totalPages = Math.ceil(total / pageSize);

  const tabHtml = (label: string, value: string) => {
    const active = sort === value ? " active" : "";
    return `<a href="/?sort=${value}" class="tab${active}">${label}</a>`;
  };

  const header = `
<div class="feed-header">
  <div class="feed-title">AI-reviewed papers from arXiv</div>
  <div class="feed-tabs">
    ${tabHtml("Hot", "hot")}
    ${tabHtml("New", "new")}
    ${tabHtml("Top", "top")}
  </div>
</div>`;

  const cards =
    papers.length === 0
      ? `<div class="empty">
          <h3>No papers yet</h3>
          <p>Papers are fetched every hour from arXiv. Check back soon.</p>
        </div>`
      : papers.map((p) => paperCard(p)).join("\n");

  const pagination =
    totalPages <= 1
      ? ""
      : `<div class="pagination">
          ${page > 1 ? `<a href="/?sort=${sort}&page=${page - 1}" class="page-btn">Prev</a>` : '<span class="page-btn disabled">Prev</span>'}
          ${Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            const p = i + 1;
            const active = p === page ? " active" : "";
            return `<a href="/?sort=${sort}&page=${p}" class="page-btn${active}">${p}</a>`;
          }).join("")}
          ${page < totalPages ? `<a href="/?sort=${sort}&page=${page + 1}" class="page-btn">Next</a>` : '<span class="page-btn disabled">Next</span>'}
        </div>`;

  return layout("Feed", `${header}${cards}${pagination}`);
}

function paperCard(p: PaperRow): string {
  const authors = JSON.parse(p.authors) as string[];
  const categories = JSON.parse(p.categories) as string[];
  const authorStr =
    authors.slice(0, 3).join(", ") + (authors.length > 3 ? " et al." : "");
  const score = p.votes_up - p.votes_down;

  const catBadges = categories
    .slice(0, 3)
    .map((c) => `<span class="category">${htmlEscape(c)}</span>`)
    .join("");

  const aiStatus = aiStatusBadge(p.review_status);

  return `
<div class="paper-card" id="paper-${htmlEscape(p.id)}">
  <div class="paper-top">
    <div class="vote-col">
      <form method="POST" action="/paper/${htmlEscape(p.id)}/vote" style="display:contents">
        <input type="hidden" name="dir" value="up">
        <button type="submit" class="vote-btn" title="Upvote">&#9650;</button>
      </form>
      <span class="vote-count">${score}</span>
      <form method="POST" action="/paper/${htmlEscape(p.id)}/vote" style="display:contents">
        <input type="hidden" name="dir" value="down">
        <button type="submit" class="vote-btn" title="Downvote">&#9660;</button>
      </form>
    </div>
    <div class="paper-body">
      <div class="paper-title"><a href="/paper/${htmlEscape(p.id)}">${htmlEscape(p.title)}</a></div>
      <div class="paper-meta">
        ${catBadges}
        <span>${htmlEscape(authorStr)}</span>
        &middot;
        <span>${formatDate(p.published_at)}</span>
      </div>
      <div class="paper-preview">
        ${p.intro
          ? `<div class="paper-intro">${escapeWithMath(p.intro)}</div>`
          : `<div class="paper-abstract">${htmlEscape(p.abstract)}</div>`
        }
        <div class="abstract-tooltip"><div class="abstract-tooltip-inner">${htmlEscape(p.abstract)}</div></div>
      </div>
      <div class="paper-footer">
        ${aiStatus}
        <a href="${htmlEscape(p.arxiv_url)}" target="_blank" rel="noopener">arXiv</a>
        <a href="${htmlEscape(p.pdf_url)}" target="_blank" rel="noopener">PDF</a>
      </div>
    </div>
  </div>
</div>`;
}

// ---------------------------------------------------------------------------
// Paper detail page
// ---------------------------------------------------------------------------

export interface PaperDetailOptions {
  paper: PaperRow;
  intro: string;
  review: string;
  reviewStatus: string;
  challenges: Challenge[];
}

export function paperDetailPage(opts: PaperDetailOptions): string {
  const { paper, intro, review, reviewStatus, challenges } = opts;
  const authors = JSON.parse(paper.authors) as string[];
  const categories = JSON.parse(paper.categories) as string[];
  const score = paper.votes_up - paper.votes_down;

  const catBadges = categories
    .map((c) => `<span class="category">${htmlEscape(c)}</span>`)
    .join(" ");

  // Vote bar
  const voteBar = `
<div class="vote-bar">
  <form method="POST" action="/paper/${htmlEscape(paper.id)}/vote" style="display:contents">
    <input type="hidden" name="dir" value="up">
    <button type="submit" class="btn">&#9650; Upvote</button>
  </form>
  <div>
    <div class="vote-bar-count">${score}</div>
    <div class="vote-bar-label">${paper.votes_up} up &middot; ${paper.votes_down} down</div>
  </div>
  <div class="vote-spacer"></div>
  <form method="POST" action="/paper/${htmlEscape(paper.id)}/vote" style="display:contents">
    <input type="hidden" name="dir" value="down">
    <button type="submit" class="btn">&#9660; Downvote</button>
  </form>
</div>`;

  // Abstract section
  const abstractSection = `
<div class="section">
  <div class="section-header">Abstract</div>
  <div class="section-body">
    <p class="abstract-text">${htmlEscape(paper.abstract)}</p>
  </div>
</div>`;

  // AI review section
  const reviewSection = reviewSectionHtml(reviewStatus, intro, review);

  // Challenge section
  const challengeSection = challengeSectionHtml(paper.id, challenges);

  const content = `
<div class="paper-detail">
  <nav style="font-size:13px;color:#656d76;margin-bottom:16px">
    <a href="/">Feed</a> / <span>${htmlEscape(paper.id)}</span>
  </nav>

  <h1 class="paper-detail-title">${htmlEscape(paper.title)}</h1>
  <div class="paper-detail-meta">
    ${catBadges}
    &nbsp;
    ${htmlEscape(authors.join(", "))}
    &middot; ${formatDate(paper.published_at)}
  </div>

  <div class="paper-links">
    <a href="${htmlEscape(paper.arxiv_url)}" target="_blank" rel="noopener" class="btn">arXiv page</a>
    <a href="${htmlEscape(paper.pdf_url)}" target="_blank" rel="noopener" class="btn">PDF</a>
  </div>

  ${voteBar}
  ${abstractSection}
  ${reviewSection}
  ${challengeSection}
</div>`;

  return layout(paper.title, content);
}

function reviewSectionHtml(
  status: string,
  intro: string,
  review: string
): string {
  let body: string;

  if (status === "pending") {
    body = `<p class="status-pending">AI review is queued and will begin shortly.</p>`;
  } else if (status === "reviewing") {
    body = `<p class="status-reviewing"><span class="spinner"></span> AI is currently reviewing this paper&hellip;</p>`;
  } else if (status === "error") {
    body = `<p class="status-error">Review failed. It will be retried automatically.</p>`;
  } else {
    // done
    const introHtml = intro
      ? `<div class="review-section-title">Plain-language introduction</div>
         <div class="review-intro">${renderParagraphs(intro)}</div>`
      : "";
    const reviewHtml = review
      ? `<div class="review-section-title">Critical review</div>
         ${renderParagraphs(review)}`
      : "";
    body = introHtml + reviewHtml || "<p>Review content unavailable.</p>";
  }

  return `
<div class="section">
  <div class="section-header">
    <span>AI Review</span>
    ${aiStatusBadge(status)}
  </div>
  <div class="section-body">${body}</div>
</div>`;
}

function challengeSectionHtml(paperId: string, challenges: Challenge[]): string {
  const threadHtml =
    challenges.length === 0
      ? `<p style="color:#656d76;font-size:13px">No challenges yet. Disagree with the review? Ask the AI to look at a specific claim.</p>`
      : `<div class="challenge-thread">
          ${challenges.map(challengeItemHtml).join("\n")}
        </div>`;

  return `
<div class="section">
  <div class="section-header">Challenge the Review</div>
  <div class="section-body">
    <form method="POST" action="/paper/${htmlEscape(paperId)}/challenge" class="challenge-form" style="margin-bottom:16px">
      <textarea
        name="prompt"
        placeholder="e.g. &quot;I disagree with the claim about scalability on page 5. The paper ignores X &mdash; please re-examine this.&quot;"
        required
      ></textarea>
      <button type="submit" class="btn btn-primary">Submit challenge</button>
    </form>
    ${threadHtml}
  </div>
</div>`;
}

function challengeItemHtml(c: Challenge): string {
  const time = new Date(c.created_at * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `
<div class="challenge-item">
  <div class="challenge-user">
    <div class="challenge-user-label">User challenge</div>
    <div>${htmlEscape(c.user_prompt)}</div>
  </div>
  <div class="challenge-ai">
    <div class="challenge-ai-label">AI response</div>
    <div>${renderParagraphs(c.ai_response)}</div>
    <div class="challenge-time">${time}</div>
  </div>
</div>`;
}

// ---------------------------------------------------------------------------
// About page
// ---------------------------------------------------------------------------

export interface AboutOptions {
  categories: string[];
  paperCount: number;
  reviewedCount: number;
}

export function aboutPage(opts: AboutOptions): string {
  const { categories, paperCount, reviewedCount } = opts;
  const catList = categories.map(c => `<span class="category">${htmlEscape(c)}</span>`).join(" ");

  const content = `
<div class="paper-detail">
  <h1 class="paper-detail-title">About arxlens</h1>

  <div class="section">
    <div class="section-header">What is this?</div>
    <div class="section-body">
      <p>arxlens is a free, AI-powered overlay for <a href="https://arxiv.org" target="_blank" rel="noopener">arXiv</a>. Every day, new papers are fetched, read in full, and reviewed by an AI agent that can follow up on cited sources to verify claims.</p>
      <p>Each paper gets a plain-language introduction (so you can quickly decide if it's relevant) and a critical review (so you can see where the strengths and weaknesses are before reading the full paper yourself). You can also challenge any part of the review and the AI will investigate your concern.</p>
      <p>The goal is to make the daily arXiv flood navigable without sacrificing rigor.</p>
    </div>
  </div>

  <div class="section">
    <div class="section-header">Stats</div>
    <div class="section-body">
      <p><strong>${paperCount}</strong> papers indexed &middot; <strong>${reviewedCount}</strong> AI-reviewed</p>
    </div>
  </div>

  <div class="section">
    <div class="section-header">Watched categories</div>
    <div class="section-body">
      <p>${catList}</p>
      <p style="font-size:12px;color:#656d76;margin-top:8px">Categories are configurable without redeploy. Visit any arXiv paper directly (e.g. <code>/paper/2401.12345</code>) to trigger an on-demand review for papers outside these categories.</p>
    </div>
  </div>

  <div class="section">
    <div class="section-header">How it works</div>
    <div class="section-body">
      <p><strong>Infrastructure:</strong> Cloudflare Workers + Durable Objects + D1 + Queues + Workers AI</p>
      <p><strong>Model:</strong> <code>@cf/moonshotai/kimi-k2.5</code> (256k context window, function calling)</p>
      <p><strong>Paper text:</strong> Fetched from arXiv HTML (preferred) or PDF, converted to Markdown via <code>Workers AI toMarkdown</code>. Full paper text is cached in the Durable Object's SQLite storage.</p>
      <p><strong>Review pipeline:</strong> Each paper is a Durable Object. Reviews run as an alarm-based loop &mdash; one model call per alarm fire, giving a fresh subrequest budget per step. The agent can call <code>fetch_url</code> to pull cited papers and verify claims. Up to 20 steps, with exponential-backoff retries on failure.</p>
      <p><strong>Architecture:</strong></p>
      <pre style="font-size:12px;line-height:1.6;background:#f6f8fa;padding:12px;border-radius:6px;overflow-x:auto">Cron (daily)
  &darr; fetch arXiv API &rarr; parse metadata
  &darr; sendBatch()
Queue (PAPER_QUEUE)
  &darr; for each paper:
PaperAgent DO (per paper, via RPC)
  1. Upsert D1 row
  2. Fetch paper text (HTML &rarr; PDF &rarr; toMarkdown)
  3. Alarm-based review loop (Kimi K2.5 + fetch_url tool)
  4. Sync status + intro back to D1</pre>
    </div>
  </div>

  <div class="section">
    <div class="section-header">Review prompt</div>
    <div class="section-body">
      <p style="font-size:12px;color:#656d76;margin-bottom:8px">This is the exact system prompt used to generate reviews. Full transparency &mdash; you can see exactly what the AI is told to do.</p>
      <pre style="font-size:11px;line-height:1.5;background:#f6f8fa;padding:12px;border-radius:6px;overflow-x:auto;white-space:pre-wrap">${htmlEscape(REVIEW_PROMPT_TEXT)}</pre>
    </div>
  </div>

  <div class="section">
    <div class="section-header">Challenge prompt</div>
    <div class="section-body">
      <p style="font-size:12px;color:#656d76;margin-bottom:8px">When you challenge a review, this is the system prompt used.</p>
      <pre style="font-size:11px;line-height:1.5;background:#f6f8fa;padding:12px;border-radius:6px;overflow-x:auto;white-space:pre-wrap">${htmlEscape(CHALLENGE_PROMPT_TEXT)}</pre>
    </div>
  </div>

  <div class="section">
    <div class="section-header">Source code</div>
    <div class="section-body">
      <p><a href="https://github.com/sjames/arxlens" target="_blank" rel="noopener">github.com/sjames/arxlens</a></p>
    </div>
  </div>
</div>`;

  return layout("About", content);
}

// Prompts are imported from paper-agent.ts and passed here as strings
// to avoid circular deps. Set via the exported constants below.
export const REVIEW_PROMPT_TEXT = `You are a rigorous scientific reviewer with the ability to fetch URLs to verify sources.

You will receive the full text of an academic paper in Markdown.
Produce exactly two sections:

INTRO:
Write 2-3 paragraphs explaining the paper for a smart non-specialist.
  - What problem does it solve?
  - What is the core idea or approach?
  - Why does it matter and who should care?
  Do NOT just paraphrase the abstract. Synthesize.

REVIEW:
Write 4-6 paragraphs of rigorous critical evaluation. Cover:
  - Soundness of methodology and experimental design
  - Whether claims are supported by the evidence shown
  - Key assumptions, limitations, or things glossed over
  - Fit with related work \u2014 use fetch_url to pull cited papers from
    https://arxiv.org/html/{id} and verify comparisons are fair
  - Whether results are reproducible (hyperparameters, data, code released?)
  Be direct. Name flaws explicitly. Do not praise without cause.

Formatting rules:
  - Use LaTeX for all math: inline $...$ and display $$...$$
  - When referencing equations, losses, metrics, or any mathematical content
    from the paper, reproduce them in LaTeX rather than describing them in words.
  - Write prose in plain text (not LaTeX). Only math goes in dollar signs.

Your response must begin with "INTRO:" and contain "REVIEW:" \u2014 no other top-level text.`;

export const CHALLENGE_PROMPT_TEXT = `You are a rigorous scientific fact-checker. A user has raised a specific challenge about a claim in a paper or its AI review.

Your job:
  1. Investigate the concern objectively using the paper text provided
  2. Use fetch_url to pull cited sources or URLs the user mentions
     (prefer https://arxiv.org/html/{id} for arXiv papers)
  3. Quote directly from sources when making claims
  4. If the user is right, say so clearly; if wrong, explain why with evidence
  5. Be concise: 2-4 paragraphs, evidence-first
  6. Use LaTeX for math: inline $...$ and display $$...$$`;

// ---------------------------------------------------------------------------
// Error page
// ---------------------------------------------------------------------------

export function errorPage(status: number, message: string): string {
  return layout(
    `${status} Error`,
    `<div class="empty">
      <h3>${status}</h3>
      <p>${htmlEscape(message)}</p>
      <p style="margin-top:12px"><a href="/">Back to feed</a></p>
    </div>`
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function aiStatusBadge(status: string): string {
  const map: Record<string, [string, string]> = {
    pending: ["pending", "Queued"],
    reviewing: ["reviewing", "Reviewing..."],
    done: ["done", "AI reviewed"],
    error: ["error", "Review failed"],
  };
  const [cls, label] = map[status] ?? ["pending", "Queued"];
  return `<span class="ai-badge ${cls}">${label}</span>`;
}

/**
 * Render text to HTML paragraphs, preserving $...$ and $$...$$ math blocks
 * verbatim so KaTeX auto-render can process them client-side.
 */
function renderParagraphs(text: string): string {
  return text
    .split(/\n\n+/)
    .map((p) => `<p>${escapeWithMath(p.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/**
 * HTML-escape text but leave $...$ and $$...$$ blocks untouched.
 * KaTeX auto-render picks them up client-side.
 */
function escapeWithMath(text: string): string {
  // Split on math delimiters, preserving them.
  // Matches $$...$$, $...$, \(...\), \[...\] — non-greedy.
  const mathPattern = /(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\])/g;
  const parts = text.split(mathPattern);
  return parts
    .map((part, i) => {
      // Odd indices are the captured math groups — leave them raw
      if (i % 2 === 1) return part;
      return htmlEscape(part);
    })
    .join("");
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export function htmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
