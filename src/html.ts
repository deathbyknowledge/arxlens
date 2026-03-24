/**
 * Server-rendered HTML for arxlens.
 * No framework, no build step. Inline CSS in GitHub style (inspired by ripgit).
 */

import type {
  PaperRow,
  Challenge,
  ReviewData,
  ReviewSectionData,
  ReviewCitation,
} from "./types";

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
.logo:hover { text-decoration: none; }
.logo span { color: #0969da; }
.nav-links { display: flex; gap: 20px; font-size: 13px; color: #656d76; }
.nav-links a { color: #656d76; }
.nav-links a.active,
.nav-links a:hover { color: #1f2328; text-decoration: none; }

/* Main layout */
main {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px;
}

/* Feed header */
.feed-shell { display: flex; flex-direction: column; gap: 16px; }
.feed-header {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid #d1d9e0;
}
.feed-lede {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.feed-title {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.03em;
}
.feed-subtitle {
  max-width: 62ch;
  margin-top: 6px;
  font-size: 14px;
  color: #656d76;
  line-height: 1.7;
}
.lookup-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(100%, 360px);
  padding: 14px;
  border: 1px solid #d1d9e0;
  border-radius: 8px;
  background: #f6f8fa;
}
.lookup-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #656d76;
}
.lookup-row { display: flex; gap: 8px; }
.lookup-input {
  width: 100%;
  min-width: 0;
  padding: 9px 12px;
  border: 1px solid #d1d9e0;
  border-radius: 6px;
  background: #fff;
  font: inherit;
  color: #1f2328;
}
.lookup-input:focus {
  outline: none;
  border-color: #0969da;
  box-shadow: 0 0 0 3px rgba(9, 105, 218, 0.1);
}
.field-help { font-size: 12px; color: #656d76; }
.form-error { font-size: 12px; color: #82071e; }
.feed-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.feed-tabs,
.feed-controls,
.filter-group { display: flex; gap: 6px; flex-wrap: wrap; }
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
.toggle,
.filter-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 5px 12px;
  border: 1px solid #d1d9e0;
  border-radius: 999px;
  font-size: 12px;
  color: #656d76;
  background: #fff;
  text-decoration: none;
}
.toggle:hover,
.filter-chip:hover { background: #f6f8fa; text-decoration: none; color: #1f2328; }
.toggle.active,
.filter-chip.active { background: #0969da; color: #fff; border-color: #0969da; }
.feed-results-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.feed-results { font-size: 12px; color: #656d76; }
.feed-note { font-size: 12px; color: #656d76; }
.feed-clear { font-size: 12px; color: #656d76; }

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
.paper-meta a.category:hover { text-decoration: none; background: #c2e7ff; }
.paper-preview-label {
  margin-bottom: 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #656d76;
}
.paper-intro {
  font-size: 13px;
  color: #1f2328;
  line-height: 1.6;
}
.paper-intro p { margin-bottom: 8px; }
.paper-intro p:last-child { margin-bottom: 0; }
.paper-abstract {
  font-size: 13px;
  color: #3d444d;
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
/* Expand-in-place abstract toggle (pure CSS, no JS) */
.abstract-toggle { display: none; }
.abstract-expand {
  display: none;
  margin-top: 8px;
  padding: 10px 12px;
  background: #f6f8fa;
  border: 1px solid #d1d9e0;
  border-radius: 6px;
  font-size: 12px;
  color: #3d444d;
  line-height: 1.6;
  font-style: italic;
}
.abstract-toggle:checked ~ .abstract-expand { display: block; }
.abstract-toggle-label {
  display: inline-block;
  margin-top: 6px;
  font-size: 11px;
  color: #0969da;
  cursor: pointer;
  user-select: none;
}
.abstract-toggle-label:hover { text-decoration: underline; }
.abstract-toggle:checked ~ .abstract-toggle-label .toggle-show { display: none; }
.abstract-toggle:not(:checked) ~ .abstract-toggle-label .toggle-hide { display: none; }
.paper-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 10px;
  font-size: 12px;
  color: #656d76;
}
.vote-status { color: #656d76; }
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
.detail-jumps {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 20px;
}
.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}
.summary-card {
  border: 1px solid #d1d9e0;
  border-radius: 8px;
  padding: 14px;
  background: #f6f8fa;
}
.summary-card-label {
  margin-bottom: 8px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #656d76;
}
.summary-card-text {
  font-size: 13px;
  line-height: 1.7;
  color: #1f2328;
}
.summary-card.status .summary-card-text { color: #57606a; }
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
.review-verdict {
  margin-bottom: 14px;
  padding: 14px;
  border: 1px solid #d1d9e0;
  border-radius: 8px;
  background: #f6f8fa;
}
.review-verdict-label {
  margin-bottom: 6px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #656d76;
}
.review-verdict-text p { margin-bottom: 0; }
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
.review-blocks { display: flex; flex-direction: column; gap: 14px; }
.review-block {
  padding-top: 14px;
  border-top: 1px solid #d1d9e0;
}
.review-block:first-child {
  padding-top: 0;
  border-top: 0;
}
.review-block-title {
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #656d76;
}
.review-citations {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}
.review-citation {
  padding: 10px 12px;
  border-left: 3px solid #c6e6ff;
  border-radius: 0 8px 8px 0;
  background: #f6f8fa;
}
.review-citation-quote {
  font-size: 13px;
  line-height: 1.7;
  color: #1f2328;
}
.review-citation-meta {
  margin-top: 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #656d76;
}
.review-actions,
.challenge-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.prompt-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 12px;
  border: 1px solid #d1d9e0;
  border-radius: 999px;
  background: #fff;
  color: #57606a;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.prompt-chip:hover {
  background: #f6f8fa;
  color: #1f2328;
}

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
.vote-btn:disabled,
.btn:disabled { opacity: 0.65; cursor: wait; }

/* Challenge form */
.challenge-banner {
  margin-bottom: 14px;
  padding: 10px 12px;
  border: 1px solid #c6e6ff;
  border-radius: 8px;
  background: #eef7ff;
  font-size: 13px;
  color: #0550ae;
}
.challenge-banner strong { color: #1f2328; }
.challenge-help {
  margin-bottom: 12px;
  font-size: 13px;
  color: #656d76;
}
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
.challenge-item.pending { border-color: #c6e6ff; }
.challenge-item.error { border-color: #ffb7ae; }
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
.challenge-summary {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.challenge-stance {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.challenge-stance.agree { background: #dafbe1; color: #116329; }
.challenge-stance.partially_agree { background: #fff8c5; color: #7d4e00; }
.challenge-stance.disagree { background: #ffebe9; color: #82071e; }
.challenge-stance.inconclusive { background: #ddf4ff; color: #0550ae; }
.challenge-structured {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.challenge-section {
  padding-top: 12px;
  border-top: 1px solid #d1d9e0;
}
.challenge-section:first-child {
  padding-top: 0;
  border-top: 0;
}
.challenge-section-title {
  margin-bottom: 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #656d76;
}
.challenge-item.pending .challenge-ai { color: #57606a; }
.challenge-item.error .challenge-ai {
  background: #ffebe9;
  color: #82071e;
}
.challenge-ai-label { font-size: 11px; font-weight: 600; text-transform: uppercase; color: #0550ae; margin-bottom: 4px; }
.challenge-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #0550ae;
}
.challenge-item.error .challenge-status { color: #82071e; }
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

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* Responsive */
@media (max-width: 700px) {
  .feed-title { font-size: 22px; }
  .lookup-form { width: 100%; }
  .lookup-row { flex-direction: column; }
  .summary-grid { grid-template-columns: 1fr; }
}

@media (max-width: 640px) {
  .global-nav { padding: 0 16px; }
  main { padding: 16px; }
  .paper-top { flex-direction: column; }
  .vote-col { flex-direction: row; width: auto; }
  .detail-jumps { margin-bottom: 16px; }
  .paper-detail-title { font-size: 18px; }
}
`;

// ---------------------------------------------------------------------------
// Layout shell
// ---------------------------------------------------------------------------

const CLIENT_JS = `
document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;

  if (form.matches("[data-challenge-form]")) {
    const button = form.querySelector("button[type='submit']");
    if (button instanceof HTMLButtonElement) {
      button.disabled = true;
      button.textContent = "Submitting...";
    }
    return;
  }

  if (!form.matches("[data-vote-form]")) return;

  const voteRoot = form.closest("[data-vote-card]");
  if (!voteRoot) return;

  event.preventDefault();

  const buttons = Array.from(voteRoot.querySelectorAll("[data-vote-button]"));
  const liveRegion = voteRoot.querySelector("[data-vote-message]");

  buttons.forEach((button) => {
    if (button instanceof HTMLButtonElement) button.disabled = true;
  });

  try {
    const response = await fetch(form.action, {
      method: form.method || "POST",
      body: new FormData(form),
      headers: {
        "Accept": "application/json",
        "X-Requested-With": "fetch",
      },
    });

    if (!response.ok) throw new Error("vote failed");

    const data = await response.json();
    const score = voteRoot.querySelector("[data-vote-score]");
    const summary = voteRoot.querySelector("[data-vote-summary]");

    if (score instanceof HTMLElement) score.textContent = String(data.score);
    if (summary instanceof HTMLElement) {
      summary.textContent = data.votesUp + " up · " + data.votesDown + " down";
    }
    if (liveRegion instanceof HTMLElement) {
      liveRegion.textContent = data.dir === "up" ? "Upvoted." : "Downvoted.";
      window.setTimeout(() => {
        if (liveRegion.textContent === "Upvoted." || liveRegion.textContent === "Downvoted.") {
          liveRegion.textContent = "";
        }
      }, 1500);
    }
  } catch {
    form.submit();
  } finally {
    buttons.forEach((button) => {
      if (button instanceof HTMLButtonElement) button.disabled = false;
    });
  }
});

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const trigger = target.closest("[data-challenge-prompt]");
  if (!(trigger instanceof HTMLElement)) return;

  const prompt = trigger.getAttribute("data-challenge-prompt") ?? "";
  const targetId = trigger.getAttribute("data-challenge-target") ?? "challenge-input";
  const field = document.getElementById(targetId);

  if (field instanceof HTMLTextAreaElement) {
    field.value = prompt;
    field.focus();
    field.selectionStart = field.value.length;
    field.selectionEnd = field.value.length;
    field.scrollIntoView({ behavior: "smooth", block: "center" });
  }
});

const pendingRefresh = document.querySelector("[data-refresh-while-pending]");
if (pendingRefresh) {
  window.setTimeout(() => window.location.reload(), 4000);
} else if (window.location.search.includes("challenge=queued")) {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.delete("challenge");
  window.history.replaceState({}, "", nextUrl.toString());
}
`;

function layout(title: string, content: string, activeNav: "feed" | "about" = "feed"): string {
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
      <a href="/"${activeNav === "feed" ? ' class="active"' : ""}>Feed</a>
      <a href="/about"${activeNav === "about" ? ' class="active"' : ""}>About</a>
    </nav>
  </div>
</header>
<main>
${content}
</main>
<script>${CLIENT_JS}</script>
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
  categories: string[];
  selectedCategory: string;
  reviewedOnly: boolean;
  lookupValue: string;
  lookupError: string;
}

export function feedPage(opts: FeedOptions): string {
  const {
    papers,
    sort,
    page,
    total,
    pageSize,
    categories,
    selectedCategory,
    reviewedOnly,
    lookupValue,
    lookupError,
  } = opts;
  const totalPages = Math.ceil(total / pageSize);
  const hasFilters = reviewedOnly || !!selectedCategory;

  const feedHref = (next: {
    sort?: FeedOptions["sort"];
    page?: number;
    selectedCategory?: string | null;
    reviewedOnly?: boolean;
  } = {}): string => {
    const params = new URLSearchParams();
    const nextSort = next.sort ?? sort;
    const nextCategory = next.selectedCategory === undefined
      ? selectedCategory
      : (next.selectedCategory ?? "");
    const nextReviewedOnly = next.reviewedOnly ?? reviewedOnly;
    const resetPage = next.sort !== undefined || next.selectedCategory !== undefined || next.reviewedOnly !== undefined;
    const nextPage = next.page ?? (resetPage ? 1 : page);

    params.set("sort", nextSort);
    if (nextCategory) params.set("category", nextCategory);
    if (nextReviewedOnly) params.set("reviewed", "1");
    if (nextPage > 1) params.set("page", String(nextPage));

    return `/?${params.toString()}`;
  };

  const tabHtml = (label: string, value: string) => {
    const active = sort === value ? " active" : "";
    return `<a href="${feedHref({ sort: value as FeedOptions["sort"] })}" class="tab${active}">${label}</a>`;
  };

  const totalLabel = `${total} ${total === 1 ? "paper" : "papers"}`;
  const resultsLabel = selectedCategory
    ? `${totalLabel} in ${selectedCategory}${reviewedOnly ? " · reviewed only" : ""}`
    : `${totalLabel}${reviewedOnly ? " · reviewed only" : ""}`;

  const sortNote =
    sort === "hot"
      ? "Trending mixes fresh papers with community signal."
      : sort === "new"
        ? "Newest is the raw publish-time firehose."
        : "Top is the highest-scoring timeline.";

  const header = `
<div class="feed-header">
  <div class="feed-lede">
    <div>
      <div class="feed-title">AI-reviewed papers from arXiv</div>
      <div class="feed-subtitle">Scroll AI takes the way you would scroll a great paper aggregator: quick signal first, deeper critique when something earns your attention, and challenges when a claim feels off.</div>
    </div>
    <form method="GET" action="/" class="lookup-form">
      <label class="lookup-label" for="paper-lookup">Open any arXiv paper</label>
      <div class="lookup-row">
        <input
          id="paper-lookup"
          class="lookup-input"
          type="text"
          name="paper"
          value="${htmlEscape(lookupValue)}"
          placeholder="Paste arXiv URL or 2401.12345"
        >
        <button type="submit" class="btn btn-primary">Open</button>
      </div>
      <div class="field-help">Paste an arXiv URL or paper ID to ingest it on demand.</div>
      ${lookupError ? `<div class="form-error">${htmlEscape(lookupError)}</div>` : ""}
    </form>
  </div>
  <div class="feed-toolbar">
    <div class="feed-tabs">
      ${tabHtml("Trending", "hot")}
      ${tabHtml("Newest", "new")}
      ${tabHtml("Top", "top")}
    </div>
    <div class="feed-controls">
      <a href="${feedHref({ reviewedOnly: false })}" class="toggle${!reviewedOnly ? " active" : ""}">All papers</a>
      <a href="${feedHref({ reviewedOnly: true })}" class="toggle${reviewedOnly ? " active" : ""}">Reviewed only</a>
    </div>
  </div>
  <div class="filter-group">
    <a href="${feedHref({ selectedCategory: null })}" class="filter-chip${!selectedCategory ? " active" : ""}">All categories</a>
    ${categories.map((category) => `<a href="${feedHref({ selectedCategory: category })}" class="filter-chip${selectedCategory === category ? " active" : ""}">${htmlEscape(category)}</a>`).join("")}
  </div>
  <div class="feed-results-bar">
    <div class="feed-results">${htmlEscape(resultsLabel)}</div>
    <div class="feed-note">${htmlEscape(sortNote)}</div>
    ${hasFilters ? `<a href="${feedHref({ selectedCategory: null, reviewedOnly: false })}" class="feed-clear">Clear filters</a>` : ""}
  </div>
</div>`;

  const cards =
    papers.length === 0
      ? `<div class="empty">
          <h3>${hasFilters ? "No papers match these filters" : "No papers yet"}</h3>
          <p>${hasFilters ? "Try another category or include papers still being reviewed." : "Papers are fetched every day from arXiv. Check back soon."}</p>
          ${hasFilters ? `<p style="margin-top:12px"><a href="${feedHref({ selectedCategory: null, reviewedOnly: false })}">Clear filters</a></p>` : ""}
        </div>`
      : papers.map((p) => paperCard(p, (category) => feedHref({ selectedCategory: category }))).join("\n");

  const pagination =
    totalPages <= 1
      ? ""
      : `<div class="pagination">
          ${page > 1 ? `<a href="${feedHref({ page: page - 1 })}" class="page-btn">Prev</a>` : '<span class="page-btn disabled">Prev</span>'}
          ${Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            const p = i + 1;
            const active = p === page ? " active" : "";
            return `<a href="${feedHref({ page: p })}" class="page-btn${active}">${p}</a>`;
          }).join("")}
          ${page < totalPages ? `<a href="${feedHref({ page: page + 1 })}" class="page-btn">Next</a>` : '<span class="page-btn disabled">Next</span>'}
        </div>`;

  return layout("Feed", `<div class="feed-shell">${header}${cards}${pagination}</div>`, "feed");
}

function paperCard(p: PaperRow, categoryHref: (category: string) => string): string {
  const authors = JSON.parse(p.authors) as string[];
  const categories = JSON.parse(p.categories) as string[];
  const authorStr =
    authors.slice(0, 3).join(", ") + (authors.length > 3 ? " et al." : "");
  const score = p.votes_up - p.votes_down;
  const abstractId = `abs-${p.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  const catBadges = categories
    .slice(0, 3)
    .map((c) => `<a href="${htmlEscape(categoryHref(c))}" class="category">${htmlEscape(c)}</a>`)
    .join("");

  const aiStatus = aiStatusBadge(p.review_status);

  return `
<div class="paper-card" id="paper-${htmlEscape(p.id)}" data-vote-card>
  <span class="sr-only" aria-live="polite" data-vote-message></span>
  <div class="paper-top">
    <div class="vote-col">
      <form method="POST" action="/paper/${htmlEscape(p.id)}/vote" style="display:contents" data-vote-form>
        <input type="hidden" name="dir" value="up">
        <button type="submit" class="vote-btn" title="Upvote" data-vote-button>&#9650;</button>
      </form>
      <span class="vote-count" data-vote-score>${score}</span>
      <form method="POST" action="/paper/${htmlEscape(p.id)}/vote" style="display:contents" data-vote-form>
        <input type="hidden" name="dir" value="down">
        <button type="submit" class="vote-btn" title="Downvote" data-vote-button>&#9660;</button>
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
      <div class="paper-preview-label">${p.intro ? "AI takeaway" : "Abstract preview"}</div>
      ${p.intro
        ? `<div class="paper-intro">${renderParagraphs(p.intro)}</div>`
        : `<div class="paper-abstract">${htmlEscape(p.abstract)}</div>`
      }
      <input type="checkbox" class="abstract-toggle" id="${abstractId}">
      <div class="abstract-expand">${htmlEscape(p.abstract)}</div>
      <label class="abstract-toggle-label" for="${abstractId}"><span class="toggle-show">Read abstract</span><span class="toggle-hide">Hide abstract</span></label>
      <div class="paper-footer">
        ${aiStatus}
        <span class="vote-status" data-vote-summary>${p.votes_up} up &middot; ${p.votes_down} down</span>
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
  reviewData: ReviewData | null;
  reviewStatus: string;
  challenges: Challenge[];
  challengeQueued: boolean;
}

export function paperDetailPage(opts: PaperDetailOptions): string {
  const { paper, intro, review, reviewData, reviewStatus, challenges, challengeQueued } = opts;
  const authors = JSON.parse(paper.authors) as string[];
  const categories = JSON.parse(paper.categories) as string[];
  const score = paper.votes_up - paper.votes_down;

  const catBadges = categories
    .map((c) => `<a href="/?sort=hot&category=${encodeURIComponent(c)}" class="category">${htmlEscape(c)}</a>`)
    .join(" ");

  const sectionNav = `
<nav class="detail-jumps">
  <a href="#summary" class="filter-chip">At a glance</a>
  <a href="#review" class="filter-chip">AI review</a>
  <a href="#abstract" class="filter-chip">Abstract</a>
  <a href="#challenges" class="filter-chip">Challenges</a>
</nav>`;

  const summarySection = detailSummarySection(paper, intro, review, reviewData, reviewStatus);

  // Vote bar
  const voteBar = `
<div class="vote-bar" data-vote-card>
  <span class="sr-only" aria-live="polite" data-vote-message></span>
  <form method="POST" action="/paper/${htmlEscape(paper.id)}/vote" style="display:contents" data-vote-form>
    <input type="hidden" name="dir" value="up">
    <button type="submit" class="btn" data-vote-button>&#9650; Upvote</button>
  </form>
  <div>
    <div class="vote-bar-count" data-vote-score>${score}</div>
    <div class="vote-bar-label" data-vote-summary>${paper.votes_up} up &middot; ${paper.votes_down} down</div>
  </div>
  <div class="vote-spacer"></div>
  <form method="POST" action="/paper/${htmlEscape(paper.id)}/vote" style="display:contents" data-vote-form>
    <input type="hidden" name="dir" value="down">
    <button type="submit" class="btn" data-vote-button>&#9660; Downvote</button>
  </form>
</div>`;

  // Abstract section
  const abstractSection = `
<div class="section" id="abstract">
  <div class="section-header">Abstract</div>
  <div class="section-body">
    <p class="abstract-text">${htmlEscape(paper.abstract)}</p>
  </div>
</div>`;

  // AI review section
  const reviewSection = reviewSectionHtml(reviewStatus, intro, review, reviewData);

  // Challenge section
  const challengeSection = challengeSectionHtml(paper.id, challenges, challengeQueued);

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

  ${sectionNav}
  ${summarySection}
  ${voteBar}
  ${reviewSection}
  ${abstractSection}
  ${challengeSection}
</div>`;

  return layout(paper.title, content, "feed");
}

function detailSummarySection(
  paper: PaperRow,
  intro: string,
  review: string,
  reviewData: ReviewData | null,
  reviewStatus: string,
): string {
  const introBlocks = splitTextBlocks(intro);
  const resolvedReview = resolveReviewData(review, reviewData);
  const statusCopy: Record<string, string> = {
    pending: "The AI summary is queued. Use the abstract below while the full review gets ready.",
    reviewing: "The AI is still reading and checking this paper now. The first full critique will appear below shortly.",
    error: "The review hit a snag and will retry automatically. The abstract is still available below.",
    done: "The full intro and critique are ready below, and you can challenge any claim you want the AI to revisit.",
  };

  const introPrimary = introBlocks[0] ?? paper.abstract;
  const introSecondary = introBlocks[1] ?? (tailSentences(introPrimary, 2) || introPrimary);
  const mainConcern = getReviewSection(resolvedReview, "main_concerns")?.body;
  const reviewPrimary = getReviewSection(resolvedReview, "verdict")?.body || mainConcern || statusCopy.done;

  const cards = [
    {
      label: "What it does",
      text: summarizeBlock(headSentences(introPrimary, 2) || introPrimary, 240),
      tone: "default",
    },
    {
      label: "Why it matters",
      text: summarizeBlock(tailSentences(introSecondary, 2) || introSecondary, 240),
      tone: "default",
    },
    {
      label: reviewStatus === "done" ? "Main concern" : "Review status",
      text: summarizeBlock(
        reviewStatus === "done"
          ? (headSentences(reviewPrimary, 2) || reviewPrimary)
          : (statusCopy[reviewStatus] ?? statusCopy.pending),
        240,
      ),
      tone: reviewStatus === "done" ? "default" : "status",
    },
  ];

  return `
<div class="summary-grid" id="summary">
  ${cards.map((card) => `<section class="summary-card${card.tone === "status" ? " status" : ""}">
    <div class="summary-card-label">${htmlEscape(card.label)}</div>
    <div class="summary-card-text">${escapeWithMath(card.text)}</div>
  </section>`).join("")}
</div>`;
}

function challengePromptButton(label: string, prompt: string): string {
  return `<button type="button" class="prompt-chip" data-challenge-target="challenge-input" data-challenge-prompt="${htmlEscape(prompt)}">${htmlEscape(label)}</button>`;
}

function reviewSectionHtml(
  status: string,
  intro: string,
  review: string,
  reviewData: ReviewData | null,
): string {
  let body: string;

  if (status === "pending") {
    body = `<p class="status-pending">AI review is queued and will begin shortly.</p>`;
  } else if (status === "reviewing") {
    body = `<p class="status-reviewing"><span class="spinner"></span> AI is currently reviewing this paper&hellip;</p>`;
  } else if (status === "error") {
    body = `<p class="status-error">Review failed. It will be retried automatically.</p>`;
  } else {
    const resolvedReview = resolveReviewData(review, reviewData);
    const verdictSection = getReviewSection(resolvedReview, "verdict");
    const displaySections = resolvedReview.sections.filter((section) => section.key !== "verdict");
    const introPrompt =
      "Please verify the evidence behind the AI's plain-language introduction for this paper. Quote the paper or cited sources directly.";
    const reviewPrompt =
      "Please re-examine the AI's main critique of this paper. Is the criticism fair and well-supported? Quote the paper or cited sources directly.";
    const comparisonPrompt =
      "Please check whether the AI's comparison to related work is fair. Quote the paper or cited sources directly.";

    const introHtml = intro
      ? `<div class="review-section-title">Plain-language introduction</div>
         <div class="review-intro">${renderParagraphs(intro)}</div>
         <div class="review-actions">
           ${challengePromptButton("Ask for evidence", introPrompt)}
         </div>`
      : "";

    const verdictHtml = verdictSection
      ? `<div class="review-section-title">Verdict</div>
         <div class="review-verdict">
           <div class="review-verdict-label">Bottom line</div>
           <div class="review-verdict-text">${renderParagraphs(verdictSection.body)}</div>
           ${renderReviewCitations(verdictSection.citations)}
         </div>`
      : "";

    const structuredReviewHtml = displaySections.length > 0
      ? `<div class="review-blocks">
           ${displaySections.map((section: ReviewSectionData) => `<section class="review-block">
             <div class="review-block-title">${htmlEscape(section.title)}</div>
             <div class="review-block-body">${renderParagraphs(section.body)}</div>
             ${renderReviewCitations(section.citations)}
           </section>`).join("")}
         </div>`
      : (review ? renderParagraphs(review) : "");

    const reviewHtml = review
      ? `<div class="review-section-title">Critical review</div>
         ${verdictHtml}
         <div class="review-actions">
           ${challengePromptButton("Challenge this critique", reviewPrompt)}
           ${challengePromptButton("Check comparison fairness", comparisonPrompt)}
          </div>
          ${structuredReviewHtml}`
      : "";
    body = introHtml + reviewHtml || "<p>Review content unavailable.</p>";
  }

  return `
<div class="section" id="review">
  <div class="section-header">
    <span>AI Review</span>
    ${aiStatusBadge(status)}
  </div>
  <div class="section-body">${body}</div>
</div>`;
}

function challengeSectionHtml(
  paperId: string,
  challenges: Challenge[],
  challengeQueued: boolean,
): string {
  const pendingCount = challenges.filter(
    (challenge) => challenge.status === "pending" || challenge.status === "running",
  ).length;

  const challengeBanner = challengeQueued
    ? `<div class="challenge-banner"${pendingCount > 0 ? ' data-refresh-while-pending="true"' : ""}>
         <strong>Challenge queued.</strong>
         ${pendingCount > 0
           ? "The AI is checking the paper and cited sources now. This page will refresh automatically when the response is ready."
           : "Your challenge is now part of the thread below."}
       </div>`
    : "";

  const helpText = pendingCount > 0
    ? `${pendingCount} challenge${pendingCount === 1 ? " is" : "s are"} still running. Keep reading while the AI checks the paper and sources.`
    : "Pick a starting point or write your own. Challenges run in the background, so you can keep reading while the AI investigates.";

  const threadHtml =
    challenges.length === 0
      ? `<p class="challenge-help">No challenges yet. Disagree with the review? Ask the AI to revisit a specific claim.</p>`
      : `<div class="challenge-thread">
           ${challenges.map(challengeItemHtml).join("\n")}
         </div>`;

  return `
<div class="section" id="challenges">
  <div class="section-header">Challenge the Review</div>
  <div class="section-body">
    ${challengeBanner}
    <p class="challenge-help">${htmlEscape(helpText)}</p>
    <div class="challenge-suggestions">
      ${challengePromptButton("Ask for evidence", "Please gather the strongest evidence for the main claim in this paper. Quote the paper or cited sources directly.")}
      ${challengePromptButton("Re-examine the critique", "Please revisit the AI's main critique of this paper. Is it fair and well-supported? Quote the paper or cited sources directly.")}
      ${challengePromptButton("Check comparison fairness", "Please check whether the paper's comparison to related work is fair. Quote the paper or cited sources directly.")}
    </div>
    <form method="POST" action="/paper/${htmlEscape(paperId)}/challenge" class="challenge-form" style="margin-bottom:16px" data-challenge-form>
      <textarea
        id="challenge-input"
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

  const statusLabel =
    c.status === "pending"
      ? "Queued"
      : c.status === "running"
        ? "Investigating"
        : c.status === "error"
          ? "Retry needed"
          : "AI response";

  const statusHtml =
    c.status === "done"
      ? `<div class="challenge-ai-label">${statusLabel}</div>`
      : `<div class="challenge-status">${c.status === "running" ? '<span class="spinner"></span>' : ""}${statusLabel}</div>`;

  const bodyHtml =
    c.status === "done"
      ? (c.response_data ? renderChallengeResponse(c.response_data) : renderParagraphs(c.ai_response))
      : c.status === "error"
        ? `<p>${htmlEscape(c.ai_response || "Challenge failed. Please try again.")}</p>`
        : `<p>The AI is checking this challenge against the paper and cited sources. Refresh in a moment to see the result.</p>`;

  return `
<div class="challenge-item ${htmlEscape(c.status)}">
  <div class="challenge-user">
    <div class="challenge-user-label">User challenge</div>
    <div>${htmlEscape(c.user_prompt)}</div>
  </div>
  <div class="challenge-ai">
    ${statusHtml}
    <div>${bodyHtml}</div>
    <div class="challenge-time">${time}</div>
  </div>
</div>`;
}

function renderChallengeResponse(challengeData: Challenge["response_data"]): string {
  if (!challengeData) return "";

  const sectionsHtml = challengeData.sections.length > 0
    ? `<div class="challenge-structured">
         ${challengeData.sections.map((section) => `<section class="challenge-section">
           <div class="challenge-section-title">${htmlEscape(section.title)}</div>
           <div>${renderParagraphs(section.body)}</div>
           ${renderReviewCitations(section.citations)}
         </section>`).join("")}
       </div>`
    : "";

  const summaryHtml = challengeData.summary
    ? `<div class="challenge-summary">
         <div class="challenge-stance ${htmlEscape(challengeData.stance)}">${htmlEscape(challengeStanceLabel(challengeData.stance))}</div>
         <div>${renderParagraphs(challengeData.summary)}</div>
       </div>`
    : "";

  return `${summaryHtml}${sectionsHtml}` || "<p>Challenge response unavailable.</p>";
}

function challengeStanceLabel(stance: NonNullable<Challenge["response_data"]>["stance"]): string {
  if (stance === "agree") return "Agrees with challenge";
  if (stance === "partially_agree") return "Partially agrees";
  if (stance === "disagree") return "Disagrees";
  return "Inconclusive";
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
    <div class="section-header">What arxlens is for</div>
    <div class="section-body">
      <p>arxlens is built for the daily &quot;what should I read?&quot; problem on <a href="https://arxiv.org" target="_blank" rel="noopener">arXiv</a>. The feed is meant to feel like a paper timeline: quick AI takes first, then a deeper critical review when a paper earns your attention.</p>
      <p>Each paper gets a plain-language introduction, a structured critical review, and a challenge thread where the AI can revisit claims against the paper and cited sources.</p>
      <p>The goal is not to replace reading papers. The goal is to help you decide what deserves your time and where to be skeptical.</p>
    </div>
  </div>

  <div class="section">
    <div class="section-header">How to use it</div>
    <div class="section-body">
      <p><strong>Scan the feed.</strong> Read the inline AI take the way you would scroll a strong paper aggregator.</p>
      <p><strong>Open the detail page.</strong> Get the at-a-glance summary, full review, abstract, and challenge thread.</p>
      <p><strong>Challenge anything shaky.</strong> Ask for evidence, push on a critique, or re-check a comparison without leaving the paper page.</p>
    </div>
  </div>

  <div class="section">
    <div class="section-header">Trust model</div>
    <div class="section-body">
      <p><strong>The intro is compression.</strong> It is there to help you triage, not to stand in for the paper.</p>
      <p><strong>The review is an argument.</strong> It can surface useful criticism, but it can also be wrong, unfair, or incomplete.</p>
      <p><strong>The challenge flow is a second pass.</strong> It is meant to pressure-test claims against the paper and cited sources, not certify correctness.</p>
      <p>For consequential decisions, read the paper yourself and treat arxlens as a reading aid, not a source of truth.</p>
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
      <p style="font-size:12px;color:#656d76">If you want full transparency, this is the implementation and prompt stack behind the product.</p>
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
      <p><a href="https://github.com/deathbyknowledge/arxlens" target="_blank" rel="noopener">github.com/deathbyknowledge/arxlens</a></p>
    </div>
  </div>
</div>`;

  return layout("About", content, "about");
}

// Prompts are imported from paper-agent.ts and passed here as strings
// to avoid circular deps. Set via the exported constants below.
export const REVIEW_PROMPT_TEXT = `You are a rigorous scientific reviewer with the ability to fetch URLs to verify sources.

You will receive the full text of an academic paper in Markdown.
Produce exactly one valid JSON object with this shape:
{
  "intro": "2-4 short sentences for a scrolling feed",
  "sections": [
    {
      "key": "verdict",
      "title": "Verdict",
      "body": "1 short paragraph on the overall assessment",
      "citations": [{"source":"paper or cited source","locator":"Section 4.7","quote":"exact quote","url":"https://... optional"}]
    },
    {
      "key": "what_holds_up",
      "title": "What holds up",
      "body": "1 short paragraph on the strongest parts of the paper",
      "citations": []
    },
    {
      "key": "main_concerns",
      "title": "Main concerns",
      "body": "1-2 short paragraphs on flaws, unsupported leaps, and limitations",
      "citations": []
    },
    {
      "key": "evidence_comparison",
      "title": "Evidence and comparison",
      "body": "1 short paragraph on whether the evidence supports the claims and whether comparisons to related work are fair",
      "citations": []
    },
    {
      "key": "reproducibility",
      "title": "Reproducibility",
      "body": "1 short paragraph on code, data, hyperparameters, experimental detail, and what would block an independent reproduction",
      "citations": []
    }
  ]
}

Requirements:
  - Intro must explain what problem the paper solves, the core idea, and why it matters.
  - Do NOT paraphrase the abstract. Synthesize in your own words.
  - Be direct. Name flaws explicitly. Do not praise without cause.
  - Use fetch_url to check cited papers from https://arxiv.org/html/{id} when needed.
  - For every section except the intro, include 1-2 short direct quotes when possible.
  - Keep quotes exact and attributable. Use short locator strings like "Section 4.7", "Table 2", or "Badea et al., Sec. 3".
  - If a quote came from a fetched external source, include its URL.
  - Return JSON only. No markdown fences. No prose before or after the JSON.

Formatting rules:
  - Use LaTeX for all math: inline $...$ and display $$...$$
  - When referencing equations, losses, metrics, or any mathematical content
    from the paper, reproduce them in LaTeX rather than describing them in words.
  - Write prose in plain text (not LaTeX). Only math goes in dollar signs.
`;

export const CHALLENGE_PROMPT_TEXT = `You are a rigorous scientific fact-checker. A user has raised a specific challenge about a claim in a paper or its AI review.

Produce exactly one valid JSON object with this shape:
{
  "stance": "agree | partially_agree | disagree | inconclusive",
  "summary": "1 short paragraph directly answering the user's challenge",
  "sections": [
    {
      "key": "evidence",
      "title": "Evidence checked",
      "body": "1 short paragraph on the strongest evidence you found",
      "citations": [{"source":"paper or cited source","locator":"Section 4.7","quote":"exact quote","url":"https://... optional"}]
    },
    {
      "key": "assessment",
      "title": "Assessment",
      "body": "1 short paragraph explaining whether the challenge holds up",
      "citations": []
    },
    {
      "key": "caveats",
      "title": "Caveats",
      "body": "optional short paragraph on uncertainty or what remains unresolved",
      "citations": []
    }
  ]
}

Requirements:
  1. Investigate the concern objectively using the paper text provided.
  2. Use fetch_url to pull cited sources or URLs the user mentions
     (prefer https://arxiv.org/html/{id} for arXiv papers).
  3. Quote directly from sources when making claims.
  4. If the user is right, say so clearly; if wrong, explain why with evidence.
  5. Be concise and evidence-first.
  6. Include at least 1-2 direct quotes across the response when possible.
  7. Keep quotes exact and attributable with short locator strings.
  8. If a quote came from a fetched external source, include its URL.
  9. Return JSON only. No markdown fences. No prose before or after the JSON.

Formatting rules:
  - Use LaTeX for math: inline $...$ and display $$...$$
  - Write prose in plain text (not LaTeX). Only math goes in dollar signs.`;

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
    </div>`,
    "feed"
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function splitTextBlocks(text: string): string[] {
  return text
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function summarizeBlock(text: string, maxChars: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= maxChars) return flat;
  return `${flat.slice(0, maxChars).replace(/\s+\S*$/, "")}...`;
}

function splitSentences(text: string): string[] {
  return (text.replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]?/g) ?? [])
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function headSentences(text: string, count: number): string {
  return splitSentences(text).slice(0, count).join(" ");
}

function tailSentences(text: string, count: number): string {
  const sentences = splitSentences(text);
  return sentences.slice(Math.max(0, sentences.length - count)).join(" ");
}

interface ParsedReviewSection {
  title: string;
  body: string;
}

function parseReviewSections(review: string): {
  verdict: string;
  sections: ParsedReviewSection[];
} {
  const paragraphs = splitTextBlocks(review);
  const sections: ParsedReviewSection[] = [];
  let verdict = "";
  let current: ParsedReviewSection | null = null;

  for (const paragraph of paragraphs) {
    const heading = extractReviewHeading(paragraph);
    if (heading) {
      const normalizedTitle = normalizeReviewHeading(heading.title);
      const isVerdictHeading = /^(verdict|overall assessment)$/i.test(normalizedTitle);

      if (isVerdictHeading && !verdict) {
        verdict = heading.body;
        current = null;
        continue;
      }

      current = {
        title: normalizedTitle,
        body: heading.body,
      };
      sections.push(current);
      continue;
    }

    if (!verdict) {
      verdict = paragraph;
      continue;
    }

    if (!current) {
      current = {
        title: sections.length === 0 ? "Key takeaways" : "More context",
        body: paragraph,
      };
      sections.push(current);
      continue;
    }

    current.body = current.body
      ? `${current.body}\n\n${paragraph}`
      : paragraph;
  }

  if (!verdict && sections[0]) {
    verdict = headSentences(sections[0].body, 2) || sections[0].body;
  }

  return { verdict, sections };
}

function resolveReviewData(review: string, reviewData: ReviewData | null): ReviewData {
  if (reviewData && reviewData.sections.length > 0) return reviewData;

  const parsed = parseReviewSections(review);
  const sections: ReviewSectionData[] = [];

  if (parsed.verdict) {
    sections.push({
      key: "verdict",
      title: "Verdict",
      body: parsed.verdict,
      citations: [],
    });
  }

  sections.push(
    ...parsed.sections.map((section) => ({
      key: reviewKeyFromHeading(section.title),
      title: section.title,
      body: section.body,
      citations: [],
    })),
  );

  return {
    intro: "",
    sections,
  };
}

function getReviewSection(reviewData: ReviewData, key: string): ReviewSectionData | null {
  return reviewData.sections.find((section) => section.key === key) ?? null;
}

function renderReviewCitations(citations: ReviewCitation[]): string {
  if (citations.length === 0) return "";

  return `<div class="review-citations">
    ${citations.map((citation) => `<div class="review-citation">
      <div class="review-citation-quote">&ldquo;${escapeWithMath(citation.quote)}&rdquo;</div>
      <div class="review-citation-meta">${renderCitationMeta(citation)}</div>
    </div>`).join("")}
  </div>`;
}

function renderCitationMeta(citation: ReviewCitation): string {
  const sourceLabel = htmlEscape(citation.source || "paper");
  const source = citation.url
    ? `<a href="${htmlEscape(citation.url)}" target="_blank" rel="noopener">${sourceLabel}</a>`
    : sourceLabel;
  const locator = citation.locator ? ` &middot; ${htmlEscape(citation.locator)}` : "";
  return `${source}${locator}`;
}

function reviewKeyFromHeading(title: string): string {
  const normalized = title
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (normalized === "evidence_and_comparison") return "evidence_comparison";
  if (normalized === "bottom_line" || normalized === "overall_assessment" || normalized === "conclusion") {
    return "verdict";
  }

  return normalized;
}

function extractReviewHeading(paragraph: string): {
  title: string;
  body: string;
} | null {
  const markdownHeading = paragraph.match(/^\*\*([^*]+?)\*\*\s*([\s\S]*)$/);
  if (markdownHeading) {
    return {
      title: markdownHeading[1],
      body: markdownHeading[2].trim(),
    };
  }

  const labelHeading = paragraph.match(/^(VERDICT|WHAT HOLDS UP|MAIN CONCERNS|EVIDENCE(?:\s*&\s*COMPARISON)?|REPRODUCIBILITY|BOTTOM LINE|CONCLUSION|OVERALL ASSESSMENT):\s*([\s\S]*)$/i);
  if (labelHeading) {
    return {
      title: labelHeading[1],
      body: labelHeading[2].trim(),
    };
  }

  return null;
}

function normalizeReviewHeading(title: string): string {
  const normalized = title.replace(/[.:]+$/, "").replace(/\s+/g, " ").trim();
  const lower = normalized.toLowerCase();

  if (lower === "conclusion") return "Bottom line";
  if (lower === "what holds up") return "What holds up";
  if (lower === "main concerns") return "Main concerns";
  if (lower === "evidence & comparison") return "Evidence and comparison";
  if (lower === "reproducibility") return "Reproducibility";
  if (lower === "verdict" || lower === "overall assessment") return "Verdict";

  return normalized;
}

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
