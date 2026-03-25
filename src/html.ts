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
import type { InviteCodeStatus, InviteSummary, Viewer } from "./auth";

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
  -webkit-text-size-adjust: 100%;
}
a { color: #0969da; text-decoration: none; }
a:hover { text-decoration: underline; }
button,
input,
textarea {
  font: inherit;
}

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
.nav-side {
  display: flex;
  align-items: center;
  gap: 16px;
}
.nav-links { display: flex; gap: 20px; font-size: 13px; color: #656d76; }
.nav-links a { color: #656d76; }
.nav-links a.active,
.nav-links a:hover { color: #1f2328; text-decoration: none; }
.nav-auth {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}
.nav-user {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 4px 10px;
  border: 1px solid #d1d9e0;
  border-radius: 8px;
  background: #fff;
  color: #1f2328;
  font-weight: 600;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.nav-user.active {
  background: #ddf4ff;
  border-color: #0969da;
  color: #0550ae;
  text-decoration: none;
}
.nav-logout {
  border: 0;
  background: none;
  color: #656d76;
  cursor: pointer;
  padding: 0;
}
.nav-logout:hover { color: #1f2328; }

/* Main layout */
main {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px;
}
.site-footer {
  margin-top: 32px;
  border-top: 1px solid #d1d9e0;
}
.site-footer-inner {
  max-width: 1100px;
  margin: 0 auto;
  padding: 16px 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  line-height: 1.6;
  color: #656d76;
}
.site-footer a {
  color: #57606a;
}
.site-footer a:hover {
  color: #1f2328;
  text-decoration: none;
}

/* Feed header */
.feed-shell { display: flex; flex-direction: column; gap: 16px; }
.feed-header {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.feed-copy {
  max-width: 70ch;
}
.feed-title {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.03em;
}
.feed-subtitle {
  margin-top: 6px;
  font-size: 14px;
  color: #656d76;
  line-height: 1.7;
}
.feed-command-bar {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px 16px;
  border: 1px solid #d1d9e0;
  border-radius: 14px;
  background: #f6f8fa;
}
.feed-command-top,
.feed-command-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.feed-tabs { display: flex; gap: 8px; flex-wrap: wrap; }
.lookup-form {
  flex: 1 1 360px;
  max-width: 440px;
}
.lookup-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 6px 0 12px;
  border: 1px solid #d1d9e0;
  border-radius: 10px;
  background: #fff;
}
.lookup-row:focus-within {
  border-color: #0969da;
  box-shadow: 0 0 0 3px rgba(9, 105, 218, 0.1);
}
.lookup-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #656d76;
  flex-shrink: 0;
}
.lookup-input {
  width: 100%;
  min-width: 0;
  padding: 10px 0;
  border: 0;
  background: transparent;
  font: inherit;
  color: #1f2328;
}
.lookup-input:focus {
  outline: none;
}
.control-icon-button.lookup-submit {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  min-height: 0;
  border: 0;
  background: transparent;
  color: #1f2328;
}
.control-icon-button.lookup-submit:hover {
  border: 0;
  background: #eaeef2;
  color: #1f2328;
}
.field-help { font-size: 12px; color: #656d76; }
.form-error { font-size: 12px; color: #82071e; }
.feed-filter-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(150px, 1fr));
  gap: 10px;
  flex: 1 1 380px;
}
.feed-select-wrap {
  position: relative;
  min-width: 0;
}
.feed-select {
  width: 100%;
  height: 36px;
  min-height: 36px;
  padding: 0 34px 0 12px;
  border: 1px solid #d1d9e0;
  border-radius: 10px;
  background: #fff;
  color: #1f2328;
  font: inherit;
  line-height: 1.1;
  appearance: none;
  -webkit-appearance: none;
}
.feed-select:focus {
  outline: none;
  border-color: #0969da;
  box-shadow: 0 0 0 3px rgba(9, 105, 218, 0.1);
}
.select-chevron {
  position: absolute;
  right: 11px;
  top: 50%;
  transform: translateY(-50%);
  color: #656d76;
  pointer-events: none;
}
.feed-reader-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-left: auto;
}
.tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid #d1d9e0;
  border-radius: 8px;
  font-size: 12px;
  color: #656d76;
  background: #fff;
  cursor: pointer;
  text-decoration: none;
  line-height: 1;
}
.tab:hover { background: #f6f8fa; text-decoration: none; color: #1f2328; }
.tab.active { background: #0969da; color: #fff; border-color: #0969da; }
.filter-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  padding: 5px 11px;
  border: 1px solid #d1d9e0;
  border-radius: 8px;
  font-size: 12px;
  color: #656d76;
  background: #fff;
  text-decoration: none;
  line-height: 1.25;
}
.filter-chip:hover { background: #f6f8fa; text-decoration: none; color: #1f2328; }
.filter-chip.active { background: #0969da; color: #fff; border-color: #0969da; }
.filter-chip:disabled,
.paper-action:disabled {
  opacity: 0.55;
  cursor: default;
}
.control-icon-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid #d1d9e0;
  border-radius: 10px;
  background: #fff;
  color: #57606a;
  cursor: pointer;
  text-decoration: none;
  touch-action: manipulation;
}
.control-icon-button:hover {
  background: #fff;
  border-color: #b6c2cf;
  color: #1f2328;
  text-decoration: none;
}
.control-icon-button.active {
  background: #ddf4ff;
  border-color: #0969da;
  color: #0550ae;
}
.control-icon-button:disabled {
  opacity: 0.55;
  cursor: default;
}
.control-icon-button[data-count]::after {
  content: attr(data-count);
  position: absolute;
  top: -5px;
  right: -5px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: #1f2328;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
}
.control-icon-button.active[data-count]::after {
  background: #0550ae;
}
.control-icon-button-primary {
  background: #1f2328;
  border-color: #1f2328;
  color: #fff;
}
.control-icon-button-primary:hover {
  background: #30363d;
  border-color: #30363d;
  color: #fff;
}
.icon {
  width: 16px;
  height: 16px;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.feed-results-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding-top: 12px;
  border-top: 1px solid #d8dee4;
}
.feed-results { font-size: 12px; color: #656d76; }
.feed-note { font-size: 12px; color: #656d76; }

/* Paper card */
.paper-card {
  border: 1px solid #d1d9e0;
  border-radius: 12px;
  padding: 16px 20px;
  margin-bottom: 12px;
  transition: border-color 0.1s;
}
.paper-card:hover { border-color: #0969da; }
.paper-card.is-saved {
  box-shadow: inset 0 0 0 1px #c6e6ff;
}
.paper-top { display: flex; gap: 16px; align-items: flex-start; }
.vote-col { display: flex; flex-direction: column; align-items: center; gap: 6px; flex-shrink: 0; width: 52px; }
.vote-btn {
  background: none;
  border: 1px solid #d1d9e0;
  border-radius: 8px;
  width: 36px;
  height: 36px;
  cursor: pointer;
  font-size: 16px;
  color: #656d76;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.1s, border-color 0.1s;
  touch-action: manipulation;
}
.vote-btn:hover { background: #f6f8fa; border-color: #0969da; color: #0969da; }
.vote-btn.active,
.btn.active {
  background: #ddf4ff;
  border-color: #0969da;
  color: #0550ae;
}
.vote-count { min-width: 28px; text-align: center; font-size: 16px; font-weight: 700; color: #1f2328; }
.paper-body { flex: 1; min-width: 0; }
.paper-title {
  font-size: 18px;
  font-weight: 600;
  color: #1f2328;
  margin-bottom: 6px;
  line-height: 1.3;
}
.paper-title a { color: #1f2328; }
.paper-title a:hover { color: #0969da; text-decoration: none; }
.paper-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #656d76;
  margin-bottom: 10px;
  line-height: 1.5;
}
.category {
  display: inline-flex;
  align-items: center;
  background: #ddf4ff;
  color: #0550ae;
  padding: 3px 8px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.2;
}
.version-chip {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 999px;
  background: #f6f8fa;
  color: #57606a;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.2;
}
a.category:hover { text-decoration: none; background: #c2e7ff; }
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
  display: inline-flex;
  align-items: center;
  margin-top: 6px;
  min-height: 30px;
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
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #eaeef2;
  font-size: 12px;
  color: #656d76;
}
.retention-statuses,
.paper-actions,
.reader-actions,
.reader-statuses {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.paper-actions {
  margin-left: auto;
}
.retention-chip {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.2;
}
.retention-chip.saved { background: #ddf4ff; color: #0550ae; }
.retention-chip.read { background: #dafbe1; color: #116329; }
.retention-chip.seen { background: #f6f8fa; color: #57606a; }
.retention-chip.new { background: #fff8c5; color: #7d4e00; }
.paper-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  padding: 5px 10px;
  border: 1px solid #d1d9e0;
  border-radius: 8px;
  background: #fff;
  color: #57606a;
  cursor: pointer;
  text-decoration: none;
  line-height: 1.25;
}
.paper-action:hover {
  background: #f6f8fa;
  color: #1f2328;
}
.vote-status { color: #656d76; }
.ai-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 500;
}
.ai-badge.done { background: #dafbe1; color: #116329; }
.ai-badge.pending { background: #fff8c5; color: #7d4e00; }
.ai-badge.reviewing { background: #ddf4ff; color: #0550ae; }
.ai-badge.error { background: #ffebe9; color: #82071e; }

/* Paper detail page */
.paper-detail-title { font-size: 22px; font-weight: 700; margin-bottom: 8px; line-height: 1.3; }
.paper-detail-meta { font-size: 13px; color: #656d76; margin-bottom: 16px; }
.paper-links { display: flex; gap: 8px; margin-bottom: 24px; }
.reader-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 20px;
  padding: 12px 14px;
  border: 1px solid #d1d9e0;
  border-radius: 12px;
  background: #f6f8fa;
}
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
  min-height: 36px;
  padding: 6px 12px;
  border: 1px solid #d1d9e0;
  border-radius: 8px;
  font-size: 13px;
  color: #1f2328;
  background: #f6f8fa;
  cursor: pointer;
  text-decoration: none;
  touch-action: manipulation;
  line-height: 1.25;
}
.btn:hover { background: #eaeef2; text-decoration: none; }
.btn-primary { background: #0969da; color: #fff; border-color: #0969da; }
.btn-primary:hover { background: #0860ca; color: #fff; }
.btn-quiet {
  background: #fff;
}

.auth-shell {
  max-width: 460px;
  margin: 0 auto;
}
.auth-card,
.account-panel {
  border: 1px solid #d1d9e0;
  border-radius: 16px;
  background: #fff;
  padding: 20px;
}
.auth-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.auth-title {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.03em;
}
.auth-subtitle,
.auth-note,
.reader-sync-note,
.account-note {
  font-size: 13px;
  line-height: 1.7;
  color: #656d76;
}
.auth-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.field-stack {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field-label {
  font-size: 12px;
  font-weight: 600;
  color: #1f2328;
}
.text-input,
.text-area {
  width: 100%;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid #d1d9e0;
  border-radius: 10px;
  background: #fff;
  color: #1f2328;
}
.text-input:focus,
.text-area:focus {
  outline: none;
  border-color: #0969da;
  box-shadow: 0 0 0 3px rgba(9, 105, 218, 0.1);
}
.field-row {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.notice {
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid #d1d9e0;
  font-size: 13px;
  line-height: 1.6;
}
.notice.error { background: #ffebe9; color: #82071e; border-color: #ffb4a8; }
.notice.success { background: #dafbe1; color: #116329; border-color: #9ed8a5; }
.notice.info { background: #ddf4ff; color: #0550ae; border-color: #96d0ff; }
.notice.warning { background: #fff8c5; color: #7d4e00; border-color: #e8d27b; }
.auth-footer {
  font-size: 13px;
  color: #656d76;
}
.account-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.account-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.account-panel.full {
  grid-column: 1 / -1;
}
.account-panel-title {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.2;
}
.account-stat-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.account-stat {
  border: 1px solid #d1d9e0;
  border-radius: 12px;
  padding: 12px;
  background: #f6f8fa;
}
.account-stat-value {
  font-size: 22px;
  font-weight: 700;
  line-height: 1;
}
.account-stat-label {
  margin-top: 6px;
  font-size: 12px;
  color: #656d76;
}
.account-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.account-list-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 14px;
  border: 1px solid #d1d9e0;
  border-radius: 12px;
  background: #f6f8fa;
}
.invite-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.invite-status {
  font-size: 12px;
  font-weight: 600;
  color: #1f2328;
}
.invite-detail {
  font-size: 12px;
  color: #656d76;
}
.invite-code-box {
  padding: 14px;
  border: 1px solid #d1d9e0;
  border-radius: 12px;
  background: #f6f8fa;
  font-size: 13px;
  line-height: 1.6;
}
.invite-code {
  display: inline-block;
  margin-top: 6px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #1f2328;
  color: #fff;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}
.challenge-lockup {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border: 1px solid #d1d9e0;
  border-radius: 12px;
  background: #f6f8fa;
}

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
  min-height: 40px;
  padding: 8px 14px;
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
.saved-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.saved-list[hidden],
.client-empty[hidden] {
  display: none;
}
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
  min-height: 34px;
  padding: 6px 11px;
  border: 1px solid #d1d9e0;
  border-radius: 8px;
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
  .global-nav {
    height: auto;
    min-height: 48px;
    padding: 10px 20px;
    align-items: flex-start;
    gap: 10px 12px;
    flex-wrap: wrap;
  }
  .nav-side {
    width: 100%;
    align-items: center;
    justify-content: space-between;
    gap: 6px 12px;
    flex-wrap: wrap;
  }
  .nav-links {
    flex-wrap: wrap;
    min-width: 0;
  }
  .nav-auth {
    margin-left: auto;
    justify-content: flex-end;
    flex-wrap: wrap;
    row-gap: 4px;
  }
  .feed-title { font-size: 22px; }
  .feed-command-top,
  .feed-command-bottom {
    flex-direction: column;
    align-items: stretch;
  }
  .feed-command-bar {
    padding: 12px;
  }
  .lookup-form,
  .feed-filter-form {
    flex: none;
    width: 100%;
    max-width: none;
    min-width: 0;
  }
  .feed-tabs {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    width: 100%;
  }
  .feed-tabs .tab {
    width: 100%;
    justify-content: center;
  }
  .feed-filter-form {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .feed-results-bar {
    flex-direction: column;
    align-items: flex-start;
  }
  .tab,
  .filter-chip,
  .btn,
  .paper-action,
  .page-btn,
  .feed-select {
    min-height: 40px;
  }
  .feed-select {
    height: 40px;
  }
  .control-icon-button,
  .vote-btn {
    width: 40px;
    height: 40px;
  }
  .feed-reader-controls {
    width: 100%;
    margin-left: 0;
  }
  .summary-grid { grid-template-columns: 1fr; }
  .account-grid,
  .account-stat-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .global-nav { padding: 10px 16px; }
  .nav-side {
    gap: 8px 10px;
  }
  .nav-auth {
    width: auto;
    justify-content: flex-end;
  }
  .nav-links { gap: 10px 12px; }
  .nav-user {
    max-width: min(55vw, 180px);
  }
  main { padding: 16px; }
  .site-footer-inner { padding: 14px 16px 20px; }
  .feed-filter-form {
    grid-template-columns: 1fr;
  }
  .paper-card {
    padding: 16px;
    border-radius: 14px;
  }
  .paper-top { flex-direction: column; gap: 12px; }
  .vote-col {
    order: 2;
    flex-direction: row;
    width: 100%;
    justify-content: flex-start;
    gap: 10px;
    margin-top: 2px;
    padding-top: 12px;
    border-top: 1px solid #d1d9e0;
  }
  .paper-title { font-size: 16px; }
  .paper-meta {
    gap: 8px;
  }
  .paper-footer {
    gap: 8px 12px;
  }
  .paper-actions {
    margin-left: 0;
    width: 100%;
  }
  .paper-links,
  .detail-jumps {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .paper-links .btn,
  .detail-jumps .filter-chip {
    width: 100%;
  }
  .detail-jumps { margin-bottom: 16px; }
  .vote-bar {
    justify-content: space-between;
    padding: 14px;
  }
  .vote-spacer { display: none; }
  .reader-bar {
    flex-direction: column;
    align-items: stretch;
  }
  .reader-actions,
  .reader-statuses,
  .paper-actions {
    width: 100%;
  }
  .reader-actions .btn,
  .paper-actions .paper-action {
    flex: 1 1 auto;
    justify-content: center;
  }
  .section {
    border-radius: 12px;
  }
  .section-header {
    padding: 12px 14px;
  }
  .section-body {
    padding: 14px;
  }
  .challenge-form textarea {
    min-height: 120px;
  }
  .paper-detail-title { font-size: 18px; }
}
`;

// ---------------------------------------------------------------------------
// Layout shell
// ---------------------------------------------------------------------------

const CLIENT_JS = `
const RETENTION_KEY = 'arxlens:reader-state:v1';

function stablePaperId(value) {
  return String(value || '').trim().replace(/(v\\d+)$/i, '');
}

function extractVersion(value) {
  const match = String(value || '').trim().match(/(v\\d+)$/i);
  return match ? match[1].toLowerCase() : '';
}

function migrateIdMap(map) {
  const next = {};

  Object.entries(map || {}).forEach(([key, value]) => {
    const stableId = stablePaperId(key);
    const numeric = Number(value || 0);
    if (!stableId || !numeric) return;
    next[stableId] = numeric;
  });

  return next;
}

function migrateSavedMap(map) {
  const next = {};

  Object.entries(map || {}).forEach(([key, value]) => {
    if (!value || typeof value !== 'object') return;

    const stableIdValue = stablePaperId(value.id || key);
    if (!stableIdValue) return;

    const versionedId = value.versionedId || value.id || key;
    const href = typeof value.href === 'string' && value.href
      ? value.href.replace(/\\/paper\\/[^/?#]+/, '/paper/' + encodeURIComponent(stableIdValue))
      : '/paper/' + encodeURIComponent(stableIdValue);

    next[stableIdValue] = {
      ...value,
      id: stableIdValue,
      version: value.version || extractVersion(versionedId) || 'v1',
      versionedId: versionedId,
      href: href,
      savedAt: Number(value.savedAt || 0) || Date.now(),
      fetchedAt: Number(value.fetchedAt || 0) || 0,
      categories: Array.isArray(value.categories) ? value.categories.filter(Boolean).slice(0, 8) : [],
    };
  });

  return next;
}

function loadViewer() {
  const script = document.getElementById('arxlens-viewer');
  if (!(script instanceof HTMLScriptElement)) {
    return { isAuthenticated: false, username: '', canCreateInvites: false };
  }

  try {
    const parsed = JSON.parse(script.textContent || 'null');
    if (!parsed || typeof parsed !== 'object') {
      return { isAuthenticated: false, username: '', canCreateInvites: false };
    }

    return {
      isAuthenticated: !!parsed.isAuthenticated,
      username: typeof parsed.username === 'string' ? parsed.username : '',
      canCreateInvites: !!parsed.canCreateInvites,
    };
  } catch {
    return { isAuthenticated: false, username: '', canCreateInvites: false };
  }
}

function loadReaderState() {
  const fallback = {
    saved: {},
    seen: {},
    read: {},
    removedSaved: {},
    removedRead: {},
    lastFeedVisit: 0,
  };

  try {
    const raw = window.localStorage.getItem(RETENTION_KEY);
    if (!raw) return fallback;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return fallback;

    return {
      saved: parsed.saved && typeof parsed.saved === 'object' ? migrateSavedMap(parsed.saved) : {},
      seen: parsed.seen && typeof parsed.seen === 'object' ? migrateIdMap(parsed.seen) : {},
      read: parsed.read && typeof parsed.read === 'object' ? migrateIdMap(parsed.read) : {},
      removedSaved: parsed.removedSaved && typeof parsed.removedSaved === 'object' ? migrateIdMap(parsed.removedSaved) : {},
      removedRead: parsed.removedRead && typeof parsed.removedRead === 'object' ? migrateIdMap(parsed.removedRead) : {},
      lastFeedVisit: typeof parsed.lastFeedVisit === 'number' ? parsed.lastFeedVisit : 0,
    };
  } catch {
    return fallback;
  }
}

function persistReaderState() {
  try {
    window.localStorage.setItem(RETENTION_KEY, JSON.stringify(readerState));
  } catch {
    // Ignore local persistence failures.
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getPaperMeta(element) {
  if (!(element instanceof HTMLElement)) return null;

  const id = stablePaperId(element.dataset.paperId || '');
  if (!id) return null;

  return {
    id: id,
    version: element.dataset.paperVersion || 'v1',
    versionedId: element.dataset.paperVersionedId || (id + (element.dataset.paperVersion || '')),
    title: element.dataset.paperTitle || '',
    href: element.dataset.paperHref || ('/paper/' + encodeURIComponent(id)),
    arxivUrl: element.dataset.paperArxiv || '',
    pdfUrl: element.dataset.paperPdf || '',
    authors: element.dataset.paperAuthors || '',
    publishedLabel: element.dataset.paperDateLabel || '',
    categories: (element.dataset.paperCategories || '').split('|').filter(Boolean),
    preview: element.dataset.paperPreview || '',
    reviewStatus: element.dataset.paperReviewStatus || '',
    fetchedAt: Number(element.dataset.paperFetchedAt || '0'),
  };
}

function normalizeSavedMeta(meta, savedAt) {
  return {
    id: meta.id,
    version: meta.version || 'v1',
    versionedId: meta.versionedId || (meta.id + (meta.version || '')),
    title: meta.title,
    href: meta.href,
    arxivUrl: meta.arxivUrl,
    pdfUrl: meta.pdfUrl,
    authors: meta.authors,
    publishedLabel: meta.publishedLabel,
    categories: Array.isArray(meta.categories) ? meta.categories.slice(0, 8) : [],
    preview: (meta.preview || '').slice(0, 600),
    reviewStatus: meta.reviewStatus || '',
    fetchedAt: meta.fetchedAt || 0,
    savedAt: typeof savedAt === 'number' ? savedAt : Date.now(),
  };
}

function serializeReaderState() {
  return {
    saved: readerState.saved,
    seen: readerState.seen,
    read: readerState.read,
    removedSaved: readerState.removedSaved,
    removedRead: readerState.removedRead,
  };
}

function replaceReaderState(nextState) {
  const preservedLastFeedVisit = readerState.lastFeedVisit || 0;
  readerState.saved = migrateSavedMap(nextState && nextState.saved);
  readerState.seen = migrateIdMap(nextState && nextState.seen);
  readerState.read = migrateIdMap(nextState && nextState.read);
  readerState.removedSaved = migrateIdMap(nextState && nextState.removedSaved);
  readerState.removedRead = migrateIdMap(nextState && nextState.removedRead);
  readerState.lastFeedVisit = preservedLastFeedVisit;
}

function savePaperMeta(meta, savedAt) {
  readerState.saved[meta.id] = normalizeSavedMeta(meta, savedAt);
}

function isSaved(id) {
  return !!readerState.saved[id];
}

function isSeen(id) {
  return !!readerState.seen[id];
}

function isRead(id) {
  return !!readerState.read[id];
}

const viewer = loadViewer();
const feedShell = document.querySelector('[data-feed-shell]');
const detailRoot = document.querySelector('[data-paper-detail]');
const feedCardsContainer = document.querySelector('[data-feed-cards]');
const savedList = document.querySelector('[data-saved-list]');
const clientEmpty = document.querySelector('[data-client-empty]');
const clientEmptyTitle = document.querySelector('[data-client-empty-title]');
const clientEmptyBody = document.querySelector('[data-client-empty-body]');
const feedResults = document.querySelector('[data-feed-results]');
const feedNote = document.querySelector('[data-feed-note]');
const feedPagination = document.querySelector('[data-feed-pagination]');
const readerState = loadReaderState();
const previousFeedVisit = feedShell ? (readerState.lastFeedVisit || 0) : 0;
const pendingReaderOps = new Map();
let activeClientFilter = null;
let readerSyncReady = !viewer.isAuthenticated;
let readerSyncTimer = 0;

function isNewPaper(meta) {
  return !!previousFeedVisit && meta.fetchedAt > 0 && meta.fetchedAt * 1000 > previousFeedVisit;
}

function getPaperElements() {
  return Array.from(document.querySelectorAll('[data-paper-id]'));
}

function getFeedCards() {
  return Array.from(document.querySelectorAll('[data-feed-cards] [data-paper-card]'));
}

function formatCount(count, singular, plural) {
  return String(count) + ' ' + (count === 1 ? singular : plural);
}

function aiStatusBadgeHtml(status) {
  const normalized = status || 'pending';
  const map = {
    pending: ['pending', 'Queued'],
    reviewing: ['reviewing', 'Reviewing...'],
    done: ['done', 'AI reviewed'],
    error: ['error', 'Review failed'],
  };
  const entry = map[normalized] || map.pending;
  return '<span class="ai-badge ' + entry[0] + '">' + entry[1] + '</span>';
}

function renderRetentionStatuses(meta) {
  const chips = [];

  if (isNewPaper(meta)) chips.push('<span class="retention-chip new">New</span>');
  if (isSaved(meta.id)) chips.push('<span class="retention-chip saved">Saved</span>');

  if (isRead(meta.id)) {
    chips.push('<span class="retention-chip read">Read</span>');
  } else if (isSeen(meta.id)) {
    chips.push('<span class="retention-chip seen">Seen</span>');
  }

  return chips.join('');
}

function setVoteButtonsState(root, userVote) {
  if (!(root instanceof Element)) return;
  root.dataset.currentVote = userVote || '';

  root.querySelectorAll('[data-vote-button]').forEach((button) => {
    if (!(button instanceof HTMLElement)) return;
    const dir = button.dataset.voteDir || '';
    const active = !!userVote && dir === userVote;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function updatePaperElement(element) {
  const meta = getPaperMeta(element);
  if (!meta) return;

  element.classList.toggle('is-saved', isSaved(meta.id));
  element.classList.toggle('is-read', isRead(meta.id));
  element.classList.toggle('is-seen', isSeen(meta.id) && !isRead(meta.id));
  element.classList.toggle('is-new', isNewPaper(meta));

  element.querySelectorAll('[data-retention-statuses]').forEach((target) => {
    if (target instanceof HTMLElement) target.innerHTML = renderRetentionStatuses(meta);
  });

  element.querySelectorAll('[data-save-toggle]').forEach((target) => {
    if (!(target instanceof HTMLButtonElement)) return;
    target.textContent = isSaved(meta.id) ? 'Saved' : 'Save for later';
    target.setAttribute('aria-pressed', isSaved(meta.id) ? 'true' : 'false');
  });

  element.querySelectorAll('[data-read-toggle]').forEach((target) => {
    if (!(target instanceof HTMLButtonElement)) return;
    target.textContent = isRead(meta.id) ? 'Mark unread' : 'Mark read';
    target.setAttribute('aria-pressed', isRead(meta.id) ? 'true' : 'false');
  });

  if (element instanceof HTMLElement) {
    setVoteButtonsState(element, element.dataset.currentVote || null);
  }

  if (isSaved(meta.id)) {
    const savedAt = readerState.saved[meta.id] && readerState.saved[meta.id].savedAt;
    savePaperMeta(meta, savedAt);
  }
}

function updateAllPaperElements() {
  getPaperElements().forEach(updatePaperElement);
}

function mergePendingReaderOp(op) {
  const pending = pendingReaderOps.get(op.paperId) || { paperId: op.paperId };

  if (op.field === 'seen') {
    pending.seen = { ts: Math.max((pending.seen && pending.seen.ts) || 0, op.ts) };
  } else if (op.field === 'saved') {
    pending.saved = { value: !!op.value, ts: op.ts };
  } else if (op.field === 'read') {
    pending.read = { value: !!op.value, ts: op.ts };
  }

  pendingReaderOps.set(op.paperId, pending);
}

function scheduleReaderSync(immediate) {
  if (!viewer.isAuthenticated || !readerSyncReady) return;
  if (readerSyncTimer) window.clearTimeout(readerSyncTimer);
  readerSyncTimer = window.setTimeout(flushReaderSyncOps, immediate ? 0 : 500);
}

async function flushReaderSyncOps() {
  if (!viewer.isAuthenticated || !readerSyncReady || pendingReaderOps.size === 0) return;
  if (readerSyncTimer) {
    window.clearTimeout(readerSyncTimer);
    readerSyncTimer = 0;
  }

  const ops = [];
  pendingReaderOps.forEach((entry) => {
    if (entry.saved) {
      ops.push({ paperId: entry.paperId, field: 'saved', value: entry.saved.value, ts: entry.saved.ts });
    }
    if (entry.read) {
      ops.push({ paperId: entry.paperId, field: 'read', value: entry.read.value, ts: entry.read.ts });
    }
    if (entry.seen) {
      ops.push({ paperId: entry.paperId, field: 'seen', ts: entry.seen.ts });
    }
  });

  pendingReaderOps.clear();

  try {
    const response = await fetch('/account/reader-state/events', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ops: ops }),
    });

    if (response.status === 401) {
      return;
    }

    if (!response.ok) {
      throw new Error('reader sync failed');
    }
  } catch {
    ops.forEach(mergePendingReaderOp);
    scheduleReaderSync(false);
  }
}

function queueReaderSync(op, immediate) {
  if (!viewer.isAuthenticated) return;
  mergePendingReaderOp(op);
  scheduleReaderSync(immediate);
}

async function hydrateReaderStateFromServer() {
  if (!viewer.isAuthenticated) return;

  try {
    const response = await fetch('/account/reader-state/import', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(serializeReaderState()),
    });

    if (response.status === 401) {
      return;
    }

    if (!response.ok) {
      return;
    }

    const data = await response.json().catch(() => null);
    if (!data || typeof data !== 'object') return;

    replaceReaderState(data);
    persistReaderState();
    renderSavedList();
    updateAllPaperElements();
    updateClientFilterButtons();
    applyClientFilters();
  } catch {
    // Keep local state if sync fails.
  } finally {
    readerSyncReady = true;
    if (pendingReaderOps.size > 0) {
      scheduleReaderSync(true);
    }
  }
}

function markSeen(meta) {
  if (!meta || isSeen(meta.id)) return;
  const now = Date.now();
  readerState.seen[meta.id] = now;
  persistReaderState();
  updateAllPaperElements();
  queueReaderSync({ paperId: meta.id, field: 'seen', ts: now }, false);
}

function setReadState(meta, shouldRead) {
  if (!meta) return;

  const now = Date.now();

  if (shouldRead) {
    readerState.read[meta.id] = now;
    readerState.seen[meta.id] = Math.max(readerState.seen[meta.id] || 0, now);
    delete readerState.removedRead[meta.id];
    queueReaderSync({ paperId: meta.id, field: 'read', value: true, ts: now }, false);
    queueReaderSync({ paperId: meta.id, field: 'seen', ts: readerState.seen[meta.id] }, false);
  } else {
    delete readerState.read[meta.id];
    readerState.removedRead[meta.id] = now;
    queueReaderSync({ paperId: meta.id, field: 'read', value: false, ts: now }, false);
  }

  persistReaderState();
  updateAllPaperElements();
  renderSavedList();
}

function toggleSaved(meta) {
  if (!meta) return;

  const now = Date.now();

  if (isSaved(meta.id)) {
    delete readerState.saved[meta.id];
    readerState.removedSaved[meta.id] = now;
    queueReaderSync({ paperId: meta.id, field: 'saved', value: false, ts: now }, false);
  } else {
    savePaperMeta(meta, now);
    delete readerState.removedSaved[meta.id];
    queueReaderSync({ paperId: meta.id, field: 'saved', value: true, ts: now }, false);
  }

  persistReaderState();
  updateAllPaperElements();
  renderSavedList();
  updateClientFilterButtons();
  applyClientFilters();
}

function buildCategoryHtml(categories) {
  return categories.map((category) => '<span class="category">' + escapeHtml(category) + '</span>').join('');
}

function buildSavedCard(savedPaper) {
  const categoriesHtml = buildCategoryHtml(savedPaper.categories || []);
  const statusHtml = renderRetentionStatuses({
    id: savedPaper.id,
    fetchedAt: savedPaper.fetchedAt || 0,
  });
  const versionHtml = savedPaper.version
    ? '<span class="version-chip">' + escapeHtml(savedPaper.version) + '</span>'
    : '';
  const links = [];

  if (savedPaper.arxivUrl) {
    links.push('<a href="' + escapeHtml(savedPaper.arxivUrl) + '" target="_blank" rel="noopener">arXiv</a>');
  }

  if (savedPaper.pdfUrl) {
    links.push('<a href="' + escapeHtml(savedPaper.pdfUrl) + '" target="_blank" rel="noopener">PDF</a>');
  }

  links.push('<a href="' + escapeHtml(savedPaper.href || ('/paper/' + encodeURIComponent(savedPaper.id))) + '">Open paper</a>');

  const metaBits = [];
  if (savedPaper.version) metaBits.push(versionHtml);
  if (savedPaper.authors) metaBits.push('<span>' + escapeHtml(savedPaper.authors) + '</span>');
  if (savedPaper.publishedLabel) metaBits.push('<span>' + escapeHtml(savedPaper.publishedLabel) + '</span>');

  return '<article class="paper-card saved-paper-card" ' +
    'data-paper-id="' + escapeHtml(savedPaper.id) + '" ' +
    'data-paper-version="' + escapeHtml(savedPaper.version || 'v1') + '" ' +
    'data-paper-versioned-id="' + escapeHtml(savedPaper.versionedId || (savedPaper.id + (savedPaper.version || ''))) + '" ' +
    'data-paper-title="' + escapeHtml(savedPaper.title || savedPaper.id) + '" ' +
    'data-paper-href="' + escapeHtml(savedPaper.href || ('/paper/' + encodeURIComponent(savedPaper.id))) + '" ' +
    'data-paper-arxiv="' + escapeHtml(savedPaper.arxivUrl || '') + '" ' +
    'data-paper-pdf="' + escapeHtml(savedPaper.pdfUrl || '') + '" ' +
    'data-paper-authors="' + escapeHtml(savedPaper.authors || '') + '" ' +
    'data-paper-date-label="' + escapeHtml(savedPaper.publishedLabel || '') + '" ' +
    'data-paper-categories="' + escapeHtml((savedPaper.categories || []).join('|')) + '" ' +
    'data-paper-preview="' + escapeHtml(savedPaper.preview || '') + '" ' +
    'data-paper-review-status="' + escapeHtml(savedPaper.reviewStatus || '') + '" ' +
    'data-paper-fetched-at="' + escapeHtml(String(savedPaper.fetchedAt || 0)) + '">' +
      '<div class="paper-title"><a href="' + escapeHtml(savedPaper.href || ('/paper/' + encodeURIComponent(savedPaper.id))) + '">' + escapeHtml(savedPaper.title || savedPaper.id) + '</a></div>' +
      '<div class="paper-meta">' + categoriesHtml + metaBits.join(' &middot; ') + '</div>' +
      '<div class="paper-preview-label">Saved for later</div>' +
      '<div class="paper-intro"><p>' + escapeHtml(savedPaper.preview || 'Open this paper to revisit it later.') + '</p></div>' +
      '<div class="paper-footer">' +
        (savedPaper.reviewStatus ? aiStatusBadgeHtml(savedPaper.reviewStatus) : '') +
        '<span class="retention-statuses" data-retention-statuses>' + statusHtml + '</span>' +
        '<div class="paper-actions">' +
          '<button type="button" class="paper-action" data-save-toggle>Saved</button>' +
          '<button type="button" class="paper-action" data-read-toggle>' + (isRead(savedPaper.id) ? 'Mark unread' : 'Mark read') + '</button>' +
          links.join('') +
        '</div>' +
      '</div>' +
    '</article>';
}

function renderSavedList() {
  if (!(savedList instanceof HTMLElement)) return 0;

  const savedPapers = Object.values(readerState.saved).sort((left, right) => {
    return (right.savedAt || 0) - (left.savedAt || 0);
  });

  savedList.innerHTML = savedPapers.map(buildSavedCard).join('');
  Array.from(savedList.querySelectorAll('[data-paper-id]')).forEach(updatePaperElement);
  return savedPapers.length;
}

function setClientEmpty(title, body) {
  if (!(clientEmpty instanceof HTMLElement)) return;
  clientEmpty.hidden = false;
  if (clientEmptyTitle instanceof HTMLElement) clientEmptyTitle.textContent = title;
  if (clientEmptyBody instanceof HTMLElement) clientEmptyBody.textContent = body;
}

function clearClientEmpty() {
  if (clientEmpty instanceof HTMLElement) clientEmpty.hidden = true;
}

function updateFeedSummary(resultsText, noteText) {
  if (feedResults instanceof HTMLElement) {
    feedResults.textContent = resultsText || feedResults.dataset.defaultText || '';
  }

  if (feedNote instanceof HTMLElement) {
    feedNote.textContent = noteText || feedNote.dataset.defaultText || '';
  }
}

function setIconButtonCount(button, count) {
  if (!(button instanceof HTMLElement)) return;

  if (count > 0) {
    button.dataset.count = count > 99 ? '99+' : String(count);
    return;
  }

  delete button.dataset.count;
}

function updateClientFilterButtons() {
  const buttons = Array.from(document.querySelectorAll('[data-client-filter]'));
  const newCount = previousFeedVisit
    ? getFeedCards().filter((card) => {
        const meta = getPaperMeta(card);
        return !!meta && isNewPaper(meta);
      }).length
    : 0;
  const savedCount = Object.keys(readerState.saved).length;

  buttons.forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) return;

    const filterName = button.dataset.clientFilter || '';
    const active = activeClientFilter === filterName;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');

    if (filterName === 'saved') {
      setIconButtonCount(button, savedCount);
      button.disabled = false;
      const label = active
        ? 'Exit saved view'
        : savedCount > 0
          ? 'Show saved papers (' + savedCount + ')'
          : 'Show saved papers';
      button.setAttribute('aria-label', label);
      button.title = label;
      return;
    }

    if (filterName === 'new') {
      setIconButtonCount(button, newCount);
      button.disabled = !previousFeedVisit;
      const label = !previousFeedVisit
        ? 'Only-new view becomes available after your next visit'
        : active
          ? 'Exit only-new view'
          : newCount > 0
            ? 'Show only new papers (' + newCount + ')'
            : 'Show only new papers';
      button.setAttribute('aria-label', label);
      button.title = label;
    }
  });
}

function applyClientFilters() {
  if (!(feedCardsContainer instanceof HTMLElement)) return;

  const cards = getFeedCards();
  let visibleCount = 0;

  if (activeClientFilter === 'saved') {
    const savedCount = renderSavedList();

    feedCardsContainer.hidden = true;
    if (savedList instanceof HTMLElement) savedList.hidden = false;
    if (feedPagination instanceof HTMLElement) feedPagination.hidden = true;

    if (savedCount === 0) {
      setClientEmpty('No saved papers yet', viewer.isAuthenticated ? 'Save a paper to keep it synced with your account.' : 'Save a paper to come back to it later on this browser.');
    } else {
      clearClientEmpty();
    }

    updateFeedSummary(
      formatCount(savedCount, 'saved paper', 'saved papers'),
      viewer.isAuthenticated ? 'Saved for later syncs to your account.' : 'Saved for later lives in this browser for now.',
    );
    return;
  }

  if (savedList instanceof HTMLElement) savedList.hidden = true;
  feedCardsContainer.hidden = false;
  if (feedPagination instanceof HTMLElement) feedPagination.hidden = false;

  cards.forEach((card) => {
    const meta = getPaperMeta(card);
    const shouldShow = activeClientFilter !== 'new' || (!!meta && isNewPaper(meta));
    card.hidden = !shouldShow;
    if (shouldShow) visibleCount += 1;
  });

  if (activeClientFilter === 'new') {
    if (visibleCount === 0) {
      setClientEmpty('Nothing new yet', 'No papers on this page were added since your last visit.');
    } else {
      clearClientEmpty();
    }

    updateFeedSummary(
      formatCount(visibleCount, 'paper since your last visit', 'papers since your last visit'),
      'New is based on when a paper reached this feed.',
    );
    return;
  }

  clearClientEmpty();
  updateFeedSummary('', '');
}

function initializeSeenTracking() {
  const cards = getFeedCards();
  if (cards.length === 0) return;

  if (!('IntersectionObserver' in window)) {
    cards.slice(0, 4).forEach((card) => {
      const meta = getPaperMeta(card);
      if (meta) markSeen(meta);
    });
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const meta = getPaperMeta(entry.target);
      if (meta) markSeen(meta);
      observer.unobserve(entry.target);
    });
  }, {
    threshold: 0.55,
  });

  cards.forEach((card) => observer.observe(card));
}

if (feedShell) {
  readerState.lastFeedVisit = Date.now();
  persistReaderState();
}

renderSavedList();
updateAllPaperElements();
updateClientFilterButtons();
applyClientFilters();

if (feedShell) {
  initializeSeenTracking();
}

if (detailRoot) {
  const detailMeta = getPaperMeta(detailRoot);
  if (detailMeta) setReadState(detailMeta, true);
}

if (viewer.isAuthenticated) {
  hydrateReaderStateFromServer();
}

document.addEventListener('submit', async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;

  if (form.matches('[data-challenge-form]')) {
    const button = form.querySelector("button[type='submit']");
    if (button instanceof HTMLButtonElement) {
      button.disabled = true;
      button.textContent = 'Submitting...';
    }
    return;
  }

  if (!form.matches('[data-vote-form]')) return;

  const voteRoot = form.closest('[data-vote-card]');
  if (!voteRoot) return;

  event.preventDefault();

  const buttons = Array.from(voteRoot.querySelectorAll('[data-vote-button]'));
  const liveRegion = voteRoot.querySelector('[data-vote-message]');

  buttons.forEach((button) => {
    if (button instanceof HTMLButtonElement) button.disabled = true;
  });

  try {
    const response = await fetch(form.action, {
      method: form.method || 'POST',
      body: new FormData(form),
      headers: {
        'Accept': 'application/json',
        'X-Requested-With': 'fetch',
      },
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);

      if (response.status === 401 && data && data.loginUrl) {
        window.location.href = data.loginUrl;
        return;
      }

      if (response.status === 429) {
        if (liveRegion instanceof HTMLElement) {
          liveRegion.textContent = data && data.error ? data.error : 'You are voting too quickly. Try again soon.';
        }
        return;
      }

      throw new Error('vote failed');
    }

    const data = await response.json();
    const score = voteRoot.querySelector('[data-vote-score]');
    const summary = voteRoot.querySelector('[data-vote-summary]');

    if (score instanceof HTMLElement) score.textContent = String(data.score);
    if (summary instanceof HTMLElement) {
      summary.textContent = data.votesUp + ' up · ' + data.votesDown + ' down';
    }

    setVoteButtonsState(voteRoot, data.userVote || null);

    if (liveRegion instanceof HTMLElement) {
      if (data.userVote === null) {
        liveRegion.textContent = 'Vote removed.';
      } else {
        liveRegion.textContent = data.userVote === 'up' ? 'Upvoted.' : 'Downvoted.';
      }

      window.setTimeout(() => {
        if (liveRegion.textContent === 'Upvoted.' || liveRegion.textContent === 'Downvoted.' || liveRegion.textContent === 'Vote removed.') {
          liveRegion.textContent = '';
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

document.addEventListener('change', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) return;
  if (!target.matches('[data-feed-select]')) return;

  const form = target.closest('[data-feed-filter-form]');
  if (!(form instanceof HTMLFormElement)) return;

  const formData = new FormData(form);
  const params = new URLSearchParams();
  const sort = String(formData.get('sort') || '');
  const category = String(formData.get('category') || '');
  const reviewed = String(formData.get('reviewed') || '');

  if (sort) params.set('sort', sort);
  if (category) params.set('category', category);
  if (reviewed === '1') params.set('reviewed', '1');

  const action = form.getAttribute('action') || window.location.pathname;
  window.location.assign(params.toString() ? action + '?' + params.toString() : action);
});

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const saveToggle = target.closest('[data-save-toggle]');
  if (saveToggle instanceof HTMLElement) {
    const paperRoot = saveToggle.closest('[data-paper-id]');
    const meta = getPaperMeta(paperRoot);
    if (meta) toggleSaved(meta);
    event.preventDefault();
    return;
  }

  const readToggle = target.closest('[data-read-toggle]');
  if (readToggle instanceof HTMLElement) {
    const paperRoot = readToggle.closest('[data-paper-id]');
    const meta = getPaperMeta(paperRoot);
    if (meta) setReadState(meta, !isRead(meta.id));
    event.preventDefault();
    return;
  }

  const filterToggle = target.closest('[data-client-filter]');
  if (filterToggle instanceof HTMLButtonElement && !filterToggle.disabled) {
    const filterName = filterToggle.dataset.clientFilter || '';
    activeClientFilter = activeClientFilter === filterName ? null : filterName;
    updateClientFilterButtons();
    applyClientFilters();
    event.preventDefault();
    return;
  }

  const trigger = target.closest('[data-challenge-prompt]');
  if (!(trigger instanceof HTMLElement)) return;

  const prompt = trigger.getAttribute('data-challenge-prompt') || '';
  const targetId = trigger.getAttribute('data-challenge-target') || 'challenge-input';
  const field = document.getElementById(targetId);

  if (field instanceof HTMLTextAreaElement) {
    field.value = prompt;
    field.focus();
    field.selectionStart = field.value.length;
    field.selectionEnd = field.value.length;
    field.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
});

const pendingRefresh = document.querySelector('[data-refresh-while-pending]');
if (pendingRefresh) {
  window.setTimeout(() => window.location.reload(), 4000);
} else if (window.location.search.includes('challenge=queued')) {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.delete('challenge');
  window.history.replaceState({}, '', nextUrl.toString());
}
`;

function viewerScriptJson(viewer: Viewer | null): string {
  return JSON.stringify({
    isAuthenticated: !!viewer,
    username: viewer?.username ?? "",
    canCreateInvites: !!viewer?.canCreateInvites,
  })
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

function renderAuthNav(activeNav: "feed" | "about" | "account", viewer: Viewer | null): string {
  if (!viewer) {
    return `<div class="nav-auth">
      <a href="/login" class="paper-action">Log in</a>
      <a href="/signup" class="paper-action">Sign up</a>
    </div>`;
  }

  return `<div class="nav-auth">
    <a href="/account" class="nav-user${activeNav === "account" ? " active" : ""}">@${htmlEscape(viewer.username)}</a>
    <form method="POST" action="/logout">
      <button type="submit" class="nav-logout">Log out</button>
    </form>
  </div>`;
}

function layout(
  title: string,
  content: string,
  activeNav: "feed" | "about" | "account" = "feed",
  viewer: Viewer | null = null,
): string {
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
    <div class="nav-side">
      <nav class="nav-links">
        <a href="/"${activeNav === "feed" ? ' class="active"' : ""}>Feed</a>
        <a href="/about"${activeNav === "about" ? ' class="active"' : ""}>About</a>
      </nav>
      ${renderAuthNav(activeNav, viewer)}
    </div>
  </div>
</header>
<main>
${content}
</main>
<footer class="site-footer">
  <div class="site-footer-inner">
    <p>Thank you to <a href="https://arxiv.org" target="_blank" rel="noopener">arXiv</a> for use of its open access interoperability.</p>
    <p>This product was not reviewed or approved by, nor does it necessarily express or reflect the policies or opinions of, arXiv. Built by <a href="https://theagents.company" target="_blank" rel="noopener">The Agents Company</a>.</p>
  </div>
</footer>
<script id="arxlens-viewer" type="application/json">${viewerScriptJson(viewer)}</script>
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
  currentPath: string;
  viewer: Viewer | null;
  userVotes: Record<string, "up" | "down">;
}

function iconSvg(paths: string): string {
  return `<svg class="icon" viewBox="0 0 16 16" aria-hidden="true">${paths}</svg>`;
}

function searchIcon(): string {
  return iconSvg('<circle cx="7" cy="7" r="4.25"></circle><path d="M10.5 10.5 14 14"></path>');
}

function arrowRightIcon(): string {
  return iconSvg('<path d="M3 8h10"></path><path d="m9.5 4.5 3.5 3.5-3.5 3.5"></path>');
}

function bookmarkIcon(): string {
  return iconSvg('<path d="M4 2.75h8a.5.5 0 0 1 .5.5v10l-4.5-3-4.5 3v-10a.5.5 0 0 1 .5-.5Z"></path>');
}

function sparkIcon(): string {
  return iconSvg('<path d="M8 2.5 9.4 6.1 13 7.5 9.4 8.9 8 12.5 6.6 8.9 3 7.5 6.6 6.1 8 2.5Z"></path>');
}

function rotateIcon(): string {
  return iconSvg('<path d="M2.5 8A5.5 5.5 0 1 0 4 4"></path><path d="M2.5 2.75v3h3"></path>');
}

function chevronDownIcon(): string {
  return iconSvg('<path d="m4.5 6.5 3.5 3 3.5-3"></path>');
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
    currentPath,
    viewer,
    userVotes,
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
  <div class="feed-copy">
    <div class="feed-title">Your paper timeline</div>
    <div class="feed-subtitle">Scroll AI takes the way you would scroll a great paper aggregator: quick signal first, deeper critique when something earns your attention, and challenges when a claim feels off.</div>
  </div>
  <div class="feed-command-bar">
    <div class="feed-command-top">
      <div class="feed-tabs">
        ${tabHtml("Trending", "hot")}
        ${tabHtml("Newest", "new")}
        ${tabHtml("Top", "top")}
      </div>
      <form method="GET" action="/" class="lookup-form">
        <label class="sr-only" for="paper-lookup">Open arXiv paper</label>
        <div class="lookup-row">
          <span class="lookup-icon">${searchIcon()}</span>
          <input
            id="paper-lookup"
            class="lookup-input"
            type="text"
            name="paper"
            value="${htmlEscape(lookupValue)}"
            placeholder="Open paper or paste arXiv URL"
          >
          <button type="submit" class="control-icon-button lookup-submit" aria-label="Open paper" title="Open paper">${arrowRightIcon()}</button>
        </div>
        ${lookupError ? `<div class="form-error">${htmlEscape(lookupError)}</div>` : ""}
      </form>
    </div>

    <div class="feed-command-bottom">
      <form method="GET" action="/" class="feed-filter-form" data-feed-filter-form>
        <input type="hidden" name="sort" value="${htmlEscape(sort)}">
        <label class="sr-only" for="feed-category">Category</label>
        <div class="feed-select-wrap">
          <select id="feed-category" class="feed-select" name="category" data-feed-select aria-label="Category">
            <option value="">All categories</option>
            ${categories.map((category) => `<option value="${htmlEscape(category)}"${selectedCategory === category ? " selected" : ""}>${htmlEscape(category)}</option>`).join("")}
          </select>
          <span class="select-chevron">${chevronDownIcon()}</span>
        </div>
        <label class="sr-only" for="feed-reviewed">Review status</label>
        <div class="feed-select-wrap">
          <select id="feed-reviewed" class="feed-select" name="reviewed" data-feed-select aria-label="Review status">
            <option value="">All papers</option>
            <option value="1"${reviewedOnly ? " selected" : ""}>Reviewed only</option>
          </select>
          <span class="select-chevron">${chevronDownIcon()}</span>
        </div>
      </form>

      <div class="feed-reader-controls" data-reader-controls>
        <button type="button" class="control-icon-button" data-client-filter="saved" aria-label="Show saved papers" title="Show saved papers">${bookmarkIcon()}</button>
        <button type="button" class="control-icon-button" data-client-filter="new" aria-label="Show only new papers" title="Show only new papers">${sparkIcon()}</button>
        ${hasFilters ? `<a href="${feedHref({ selectedCategory: null, reviewedOnly: false })}" class="control-icon-button" aria-label="Reset filters" title="Reset filters">${rotateIcon()}</a>` : ""}
      </div>
    </div>

    <div class="feed-results-bar">
      <div class="feed-results" data-feed-results data-default-text="${htmlEscape(resultsLabel)}">${htmlEscape(resultsLabel)}</div>
      <div class="feed-note" data-feed-note data-default-text="${htmlEscape(sortNote)}">${htmlEscape(sortNote)}</div>
    </div>
  </div>
</div>`;

  const cards =
    papers.length === 0
      ? `<div class="empty">
          <h3>${hasFilters ? "No papers match these filters" : "No papers yet"}</h3>
          <p>${hasFilters ? "Try another category or include papers still being reviewed." : "Papers are fetched every day from arXiv. Check back soon."}</p>
          ${hasFilters ? `<p style="margin-top:12px"><a href="${feedHref({ selectedCategory: null, reviewedOnly: false })}">Clear filters</a></p>` : ""}
        </div>`
      : papers.map((p) => paperCard(
          p,
          (category) => feedHref({ selectedCategory: category }),
          currentPath,
          viewer,
          userVotes[p.id] ?? null,
        )).join("\n");

  const pagination =
    totalPages <= 1
      ? ""
      : `<div class="pagination" data-feed-pagination>
          ${page > 1 ? `<a href="${feedHref({ page: page - 1 })}" class="page-btn">Prev</a>` : '<span class="page-btn disabled">Prev</span>'}
          ${Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            const p = i + 1;
            const active = p === page ? " active" : "";
            return `<a href="${feedHref({ page: p })}" class="page-btn${active}">${p}</a>`;
          }).join("")}
          ${page < totalPages ? `<a href="${feedHref({ page: page + 1 })}" class="page-btn">Next</a>` : '<span class="page-btn disabled">Next</span>'}
        </div>`;

  const clientEmpty = `<div class="empty client-empty" data-client-empty hidden>
    <h3 data-client-empty-title>Nothing here yet</h3>
    <p data-client-empty-body></p>
  </div>`;

  return layout(
    "Feed",
    `<div class="feed-shell" data-feed-shell>
      ${header}
      <div class="saved-list" data-saved-list hidden></div>
      ${clientEmpty}
      <div data-feed-cards>
        ${cards}
      </div>
      ${pagination}
    </div>`,
    "feed",
    viewer,
  );
}

function paperCard(
  p: PaperRow,
  categoryHref: (category: string) => string,
  currentPath: string,
  viewer: Viewer | null,
  userVote: "up" | "down" | null,
): string {
  const authors = JSON.parse(p.authors) as string[];
  const categories = JSON.parse(p.categories) as string[];
  const authorStr =
    authors.slice(0, 3).join(", ") + (authors.length > 3 ? " et al." : "");
  const score = p.votes_up - p.votes_down;
  const abstractId = `abs-${p.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const safeIntro = looksLikeStructuredLeak(p.intro) ? "" : p.intro;
  const previewText = compactPlainText(safeIntro || p.abstract, 420);
  const detailHref = `/paper/${encodeURIComponent(p.id)}`;
  const versionChip = `<span class="version-chip">${htmlEscape(p.version)}</span>`;
  const voteTitle = viewer ? "Vote" : "Sign in to vote";

  const catBadges = categories
    .slice(0, 3)
    .map((c) => `<a href="${htmlEscape(categoryHref(c))}" class="category">${htmlEscape(c)}</a>`)
    .join("");

  const aiStatus = aiStatusBadge(p.review_status);

  return `
<div
  class="paper-card"
  id="paper-${htmlEscape(p.id)}"
  data-paper-card
  data-paper-id="${htmlEscape(p.id)}"
  data-paper-version="${htmlEscape(p.version)}"
  data-paper-versioned-id="${htmlEscape(p.versioned_id)}"
  data-paper-title="${htmlEscape(p.title)}"
  data-paper-href="${htmlEscape(detailHref)}"
  data-paper-arxiv="${htmlEscape(p.arxiv_url)}"
  data-paper-pdf="${htmlEscape(p.pdf_url)}"
  data-paper-authors="${htmlEscape(authorStr)}"
  data-paper-date-label="${htmlEscape(formatDate(p.published_at))}"
  data-paper-categories="${htmlEscape(categories.join("|"))}"
  data-paper-preview="${htmlEscape(previewText)}"
  data-paper-review-status="${htmlEscape(p.review_status)}"
  data-paper-fetched-at="${p.fetched_at}"
  data-current-vote="${userVote ?? ""}"
  data-vote-card
>
  <span class="sr-only" aria-live="polite" data-vote-message></span>
  <div class="paper-top">
    <div class="vote-col">
      <form method="POST" action="/paper/${htmlEscape(p.id)}/vote" style="display:contents" data-vote-form>
        <input type="hidden" name="dir" value="up">
        <input type="hidden" name="next" value="${htmlEscape(currentPath)}">
        <button type="submit" class="vote-btn${userVote === "up" ? " active" : ""}" title="${voteTitle}" data-vote-button data-vote-dir="up" aria-pressed="${userVote === "up" ? "true" : "false"}">&#9650;</button>
      </form>
      <span class="vote-count" data-vote-score>${score}</span>
      <form method="POST" action="/paper/${htmlEscape(p.id)}/vote" style="display:contents" data-vote-form>
        <input type="hidden" name="dir" value="down">
        <input type="hidden" name="next" value="${htmlEscape(currentPath)}">
        <button type="submit" class="vote-btn${userVote === "down" ? " active" : ""}" title="${voteTitle}" data-vote-button data-vote-dir="down" aria-pressed="${userVote === "down" ? "true" : "false"}">&#9660;</button>
      </form>
    </div>
    <div class="paper-body">
      <div class="paper-title"><a href="${htmlEscape(detailHref)}">${htmlEscape(p.title)}</a></div>
      <div class="paper-meta">
        ${catBadges}
        ${versionChip}
        <span>${htmlEscape(authorStr)}</span>
        &middot;
        <span>${formatDate(p.published_at)}</span>
      </div>
      <div class="paper-preview-label">${safeIntro ? "AI takeaway" : "Abstract preview"}</div>
      ${safeIntro
        ? `<div class="paper-intro">${renderParagraphs(safeIntro)}</div>`
        : `<div class="paper-abstract">${htmlEscape(p.abstract)}</div>`
      }
      <input type="checkbox" class="abstract-toggle" id="${abstractId}">
      <div class="abstract-expand">${htmlEscape(p.abstract)}</div>
      <label class="abstract-toggle-label" for="${abstractId}"><span class="toggle-show">Read abstract</span><span class="toggle-hide">Hide abstract</span></label>
      <div class="paper-footer">
        ${aiStatus}
        <span class="retention-statuses" data-retention-statuses></span>
        <span class="vote-status" data-vote-summary>${p.votes_up} up &middot; ${p.votes_down} down</span>
        <div class="paper-actions">
          <button type="button" class="paper-action" data-save-toggle>Save for later</button>
          <a href="${htmlEscape(p.arxiv_url)}" target="_blank" rel="noopener">arXiv</a>
          <a href="${htmlEscape(p.pdf_url)}" target="_blank" rel="noopener">PDF</a>
        </div>
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
  currentPath: string;
  viewer: Viewer | null;
  userVote: "up" | "down" | null;
}

export function paperDetailPage(opts: PaperDetailOptions): string {
  const {
    paper,
    intro,
    review,
    reviewData,
    reviewStatus,
    challenges,
    challengeQueued,
    currentPath,
    viewer,
    userVote,
  } = opts;
  const authors = JSON.parse(paper.authors) as string[];
  const categories = JSON.parse(paper.categories) as string[];
  const score = paper.votes_up - paper.votes_down;
  const safeIntro = looksLikeStructuredLeak(intro) ? "" : intro;
  const safeReview = looksLikeStructuredLeak(review) ? "" : review;
  const previewText = compactPlainText(safeIntro || paper.abstract, 420);
  const versionChip = `<span class="version-chip">${htmlEscape(paper.version)}</span>`;

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

  const summarySection = detailSummarySection(paper, safeIntro, safeReview, reviewData, reviewStatus);

  const readerBar = `
<div class="reader-bar">
  <div>
    <div class="reader-statuses" data-retention-statuses></div>
    <div class="reader-sync-note" style="margin-top:8px">${viewer ? `Reader state syncs to <strong>@${htmlEscape(viewer.username)}</strong>.` : `Reader state stays local until you sign in.`}</div>
  </div>
  <div class="reader-actions">
    <button type="button" class="btn" data-save-toggle>Save for later</button>
    <button type="button" class="btn" data-read-toggle>Mark unread</button>
  </div>
</div>`;

  // Vote bar
  const voteBar = `
<div class="vote-bar" data-vote-card data-current-vote="${userVote ?? ""}">
  <span class="sr-only" aria-live="polite" data-vote-message></span>
  <form method="POST" action="/paper/${htmlEscape(paper.id)}/vote" style="display:contents" data-vote-form>
    <input type="hidden" name="dir" value="up">
    <input type="hidden" name="next" value="${htmlEscape(currentPath)}">
    <button type="submit" class="btn${userVote === "up" ? " active" : ""}" data-vote-button data-vote-dir="up" aria-pressed="${userVote === "up" ? "true" : "false"}">&#9650; ${viewer ? "Upvote" : "Sign in to vote"}</button>
  </form>
  <div>
    <div class="vote-bar-count" data-vote-score>${score}</div>
    <div class="vote-bar-label" data-vote-summary>${paper.votes_up} up &middot; ${paper.votes_down} down</div>
  </div>
  <div class="vote-spacer"></div>
  <form method="POST" action="/paper/${htmlEscape(paper.id)}/vote" style="display:contents" data-vote-form>
    <input type="hidden" name="dir" value="down">
    <input type="hidden" name="next" value="${htmlEscape(currentPath)}">
    <button type="submit" class="btn${userVote === "down" ? " active" : ""}" data-vote-button data-vote-dir="down" aria-pressed="${userVote === "down" ? "true" : "false"}">&#9660; ${viewer ? "Downvote" : "Sign in to vote"}</button>
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
  const reviewSection = reviewSectionHtml(reviewStatus, safeIntro, safeReview, reviewData);

  // Challenge section
  const challengeSection = challengeSectionHtml(paper.id, currentPath, challenges, challengeQueued, viewer);

  const content = `
<div
  class="paper-detail"
  data-paper-detail
  data-paper-id="${htmlEscape(paper.id)}"
  data-paper-version="${htmlEscape(paper.version)}"
  data-paper-versioned-id="${htmlEscape(paper.versioned_id)}"
  data-paper-title="${htmlEscape(paper.title)}"
  data-paper-href="/paper/${encodeURIComponent(paper.id)}"
  data-paper-arxiv="${htmlEscape(paper.arxiv_url)}"
  data-paper-pdf="${htmlEscape(paper.pdf_url)}"
  data-paper-authors="${htmlEscape(authors.join(", "))}"
  data-paper-date-label="${htmlEscape(formatDate(paper.published_at))}"
  data-paper-categories="${htmlEscape(categories.join("|"))}"
  data-paper-preview="${htmlEscape(previewText)}"
  data-paper-review-status="${htmlEscape(reviewStatus)}"
  data-paper-fetched-at="${paper.fetched_at}"
  data-current-vote="${userVote ?? ""}"
>
  <nav style="font-size:13px;color:#656d76;margin-bottom:16px">
    <a href="/">Feed</a> / <span>${htmlEscape(paper.id)}</span> ${versionChip}
  </nav>

  <h1 class="paper-detail-title">${htmlEscape(paper.title)}</h1>
  <div class="paper-detail-meta">
    ${catBadges}
    ${versionChip}
    &nbsp;
    ${htmlEscape(authors.join(", "))}
    &middot; ${formatDate(paper.published_at)}
  </div>

  <div class="paper-links">
    <a href="${htmlEscape(paper.arxiv_url)}" target="_blank" rel="noopener" class="btn">arXiv page</a>
    <a href="${htmlEscape(paper.pdf_url)}" target="_blank" rel="noopener" class="btn">PDF</a>
  </div>

  ${readerBar}
  ${sectionNav}
  ${summarySection}
  ${voteBar}
  ${reviewSection}
  ${abstractSection}
  ${challengeSection}
</div>`;

  return layout(paper.title, content, "feed", viewer);
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
  const missingReviewContent = reviewStatus === "done" && !intro && !review && !reviewData;
  const statusCopy: Record<string, string> = {
    pending: "The AI summary is queued. Use the abstract below while the full review gets ready.",
    reviewing: "The AI is still reading and checking this paper now. The first full critique will appear below shortly.",
    error: "The review hit a snag and will retry automatically. The abstract is still available below.",
    done: "The full intro and critique are ready below, and you can challenge any claim you want the AI to revisit.",
  };

  const introPrimary = introBlocks[0] ?? paper.abstract;
  const introSecondary = introBlocks[1] ?? (tailSentences(introPrimary, 2) || introPrimary);
  const mainConcern = getReviewSection(resolvedReview, "main_concerns")?.body;
  const reviewPrimary = missingReviewContent
    ? "This cached review is malformed and should be regenerated."
    : (getReviewSection(resolvedReview, "verdict")?.body || mainConcern || statusCopy.done);

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
    const missingReviewContent = !intro && !review && !reviewData;
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

    const reviewHtml = review || reviewData
      ? `<div class="review-section-title">Critical review</div>
         ${verdictHtml}
         <div class="review-actions">
           ${challengePromptButton("Challenge this critique", reviewPrompt)}
           ${challengePromptButton("Check comparison fairness", comparisonPrompt)}
           </div>
           ${structuredReviewHtml}`
      : "";
    body = introHtml + reviewHtml || (missingReviewContent
      ? "<p>Review content unavailable. This cached review should be regenerated.</p>"
      : "<p>Review content unavailable.</p>");
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
  currentPath: string,
  challenges: Challenge[],
  challengeQueued: boolean,
  viewer: Viewer | null,
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

  const challengeComposer = viewer
    ? `<div class="challenge-suggestions">
         ${challengePromptButton("Ask for evidence", "Please gather the strongest evidence for the main claim in this paper. Quote the paper or cited sources directly.")}
         ${challengePromptButton("Re-examine the critique", "Please revisit the AI's main critique of this paper. Is it fair and well-supported? Quote the paper or cited sources directly.")}
         ${challengePromptButton("Check comparison fairness", "Please check whether the paper's comparison to related work is fair. Quote the paper or cited sources directly.")}
       </div>
       <form method="POST" action="/paper/${htmlEscape(paperId)}/challenge" class="challenge-form" style="margin-bottom:16px" data-challenge-form>
         <input type="hidden" name="next" value="${htmlEscape(currentPath)}">
         <textarea
           id="challenge-input"
           name="prompt"
           placeholder="e.g. &quot;I disagree with the claim about scalability on page 5. The paper ignores X &mdash; please re-examine this.&quot;"
           required
         ></textarea>
         <button type="submit" class="btn btn-primary">Submit challenge</button>
       </form>`
    : `<div class="challenge-lockup">
         <div class="account-note">Challenges are public to read, but only signed-in members can post them. Your challenge text is stored with your account for moderation, but usernames are not shown in the public thread.</div>
         <div class="field-row">
           <a href="/login?next=${encodeURIComponent(currentPath)}" class="btn btn-primary">Log in to challenge</a>
           <a href="/signup?next=${encodeURIComponent(currentPath)}" class="btn btn-quiet">Create account</a>
         </div>
       </div>`;

  return `
<div class="section" id="challenges">
  <div class="section-header">Challenge the Review</div>
  <div class="section-body">
    ${challengeBanner}
    <p class="challenge-help">${htmlEscape(helpText)}</p>
    ${challengeComposer}
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
// Auth pages
// ---------------------------------------------------------------------------

function noticeHtml(kind: "error" | "success" | "info" | "warning", message: string): string {
  return `<div class="notice ${kind}">${htmlEscape(message)}</div>`;
}

export interface LoginPageOptions {
  nextPath: string;
  username: string;
  error?: string;
}

export function loginPage(opts: LoginPageOptions): string {
  const { nextPath, username, error } = opts;
  const signupHref = `/signup?next=${encodeURIComponent(nextPath)}`;
  const content = `
<div class="auth-shell">
  <section class="auth-card">
    <div>
      <div class="auth-title">Log in</div>
      <div class="auth-subtitle">Use your username and password. No email, phone, or public profile required.</div>
    </div>
    ${error ? noticeHtml("error", error) : ""}
    <form method="POST" action="/login" class="auth-form">
      <input type="hidden" name="next" value="${htmlEscape(nextPath)}">
      <label class="field-stack">
        <span class="field-label">Username</span>
        <input class="text-input" type="text" name="username" autocomplete="username" value="${htmlEscape(username)}" required>
      </label>
      <label class="field-stack">
        <span class="field-label">Password</span>
        <input class="text-input" type="password" name="password" autocomplete="current-password" required>
      </label>
      <button type="submit" class="btn btn-primary">Log in</button>
    </form>
    <div class="auth-note">There is no email reset flow yet, so keep your username and password somewhere safe.</div>
    <div class="auth-footer">Need an account? <a href="${signupHref}">Create one with an invite</a>.</div>
  </section>
</div>`;

  return layout("Log in", content, "feed", null);
}

export interface SignupPageOptions {
  nextPath: string;
  username: string;
  inviteCode: string;
  bootstrapOpen: boolean;
  inviteStatus: InviteCodeStatus | null;
  error?: string;
}

export function signupPage(opts: SignupPageOptions): string {
  const { nextPath, username, inviteCode, bootstrapOpen, inviteStatus, error } = opts;
  const loginHref = `/login?next=${encodeURIComponent(nextPath)}`;
  const inviteNotice = inviteStatus
    ? noticeHtml(
        inviteStatus.kind === "ready"
          ? "success"
          : inviteStatus.kind === "invalid"
            ? "error"
            : "warning",
        inviteStatus.message,
      )
    : "";

  const content = `
<div class="auth-shell">
  <section class="auth-card">
    <div>
      <div class="auth-title">Create account</div>
      <div class="auth-subtitle">Choose a pseudonymous username and password. Public reading stays open; the account is for sync and participation.</div>
    </div>
    ${bootstrapOpen
      ? noticeHtml("info", "This is the first account, so no invite is required. It will get invite privileges.")
      : inviteNotice}
    ${error ? noticeHtml("error", error) : ""}
    <form method="POST" action="/signup" class="auth-form">
      <input type="hidden" name="next" value="${htmlEscape(nextPath)}">
      <label class="field-stack">
        <span class="field-label">Username</span>
        <input class="text-input" type="text" name="username" value="${htmlEscape(username)}" autocomplete="username" required>
      </label>
      <label class="field-stack">
        <span class="field-label">Password</span>
        <input class="text-input" type="password" name="password" autocomplete="new-password" required>
      </label>
      <label class="field-stack">
        <span class="field-label">Confirm password</span>
        <input class="text-input" type="password" name="password_confirm" autocomplete="new-password" required>
      </label>
      ${bootstrapOpen
        ? ""
        : `<label class="field-stack">
             <span class="field-label">Invite code</span>
             <input class="text-input" type="text" name="invite" value="${htmlEscape(inviteCode)}" required>
           </label>`}
      <button type="submit" class="btn btn-primary">Create account</button>
    </form>
    <div class="auth-note">Use a pseudonym. Don&rsquo;t use a real name or a handle you already use somewhere else.</div>
    <div class="auth-footer">Already have an account? <a href="${loginHref}">Log in</a>.</div>
  </section>
</div>`;

  return layout("Create account", content, "feed", null);
}

export interface AccountPageOptions {
  viewer: Viewer;
  savedCount: number;
  seenCount: number;
  readCount: number;
  invites: InviteSummary[];
  createdInviteCode?: string;
  createdInviteExpiresAt?: number;
  notice?: {
    kind: "error" | "success" | "info" | "warning";
    message: string;
  };
}

export function accountPage(opts: AccountPageOptions): string {
  const {
    viewer,
    savedCount,
    seenCount,
    readCount,
    invites,
    createdInviteCode,
    createdInviteExpiresAt,
    notice,
  } = opts;

  const inviteList = invites.length === 0
    ? `<div class="account-note">No invites created yet.</div>`
    : `<div class="account-list">${invites.map((invite) => `<div class="account-list-row">
         <div class="invite-meta">
           <div class="invite-status">${htmlEscape(invite.status === "available" ? "Available" : invite.status === "claimed" ? "Claimed" : "Expired")}</div>
           <div class="invite-detail">Created ${htmlEscape(formatDateTime(invite.createdAt))} · expires ${htmlEscape(formatDateTime(invite.expiresAt))}${invite.usedAt ? ` · used ${htmlEscape(formatDateTime(invite.usedAt))}` : ""}</div>
         </div>
       </div>`).join("")}</div>`;

  const createdInviteBox = createdInviteCode
    ? `<div class="invite-code-box">
         <div><strong>New invite code</strong></div>
         <div class="invite-code">${htmlEscape(createdInviteCode)}</div>
         <div class="account-note" style="margin-top:10px">Share this code directly, or send this link: <a href="/signup?invite=${encodeURIComponent(createdInviteCode)}">/signup?invite=${htmlEscape(createdInviteCode)}</a>${createdInviteExpiresAt ? ` · expires ${htmlEscape(formatDateTime(createdInviteExpiresAt))}` : ""}</div>
       </div>`
    : "";

  const content = `
<div class="paper-detail">
  <h1 class="paper-detail-title">@${htmlEscape(viewer.username)}</h1>
  <div class="paper-detail-meta">Private account for sync and participation. No email, phone, bio, or public profile required.</div>

  ${notice ? noticeHtml(notice.kind, notice.message) : ""}

  <div class="account-grid">
    <section class="account-panel">
      <div class="account-panel-title">Reader sync</div>
      <div class="account-note">Saved, seen, and read state from this browser merges into your account automatically after sign-in.</div>
      <div class="account-stat-grid">
        <div class="account-stat">
          <div class="account-stat-value">${savedCount}</div>
          <div class="account-stat-label">Saved</div>
        </div>
        <div class="account-stat">
          <div class="account-stat-value">${seenCount}</div>
          <div class="account-stat-label">Seen</div>
        </div>
        <div class="account-stat">
          <div class="account-stat-value">${readCount}</div>
          <div class="account-stat-label">Read</div>
        </div>
      </div>
    </section>

    <section class="account-panel">
      <div class="account-panel-title">Privacy model</div>
      <div class="account-note">Your username is the only user identifier this app asks for. Votes and challenges are tied to your account for moderation, but usernames are not shown publicly on paper pages.</div>
      <div class="account-note">There is no email reset flow yet, so keep your username and password somewhere safe.</div>
    </section>

    <section class="account-panel full">
      <div class="account-panel-title">Invites</div>
      <div class="account-note">Single-use invite codes expire after two weeks.</div>
      ${viewer.canCreateInvites
        ? `<form method="POST" action="/account/invites" class="field-row">
             <button type="submit" class="btn btn-primary">Create invite</button>
           </form>
           ${createdInviteBox}`
        : `<div class="account-note">This account cannot create invites yet.</div>`}
      ${inviteList}
    </section>
  </div>
</div>`;

  return layout("Account", content, "account", viewer);
}

// ---------------------------------------------------------------------------
// About page
// ---------------------------------------------------------------------------

export interface AboutOptions {
  categories: string[];
  paperCount: number;
  reviewedCount: number;
  viewer: Viewer | null;
}

export function aboutPage(opts: AboutOptions): string {
  const { categories, paperCount, reviewedCount, viewer } = opts;
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
    <div class="section-header">Acknowledgement</div>
    <div class="section-body">
      <p>Thank you to <a href="https://arxiv.org" target="_blank" rel="noopener">arXiv</a> for use of its open access interoperability.</p>
      <p>This product was not reviewed or approved by, nor does it necessarily express or reflect the policies or opinions of, arXiv.</p>
      <p>arxlens is an independent project and is not affiliated with arXiv or Cornell University.</p>
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
    <div class="section-header">Accounts and privacy</div>
    <div class="section-body">
      <p><strong>Reading stays public.</strong> You can browse the feed and paper pages without an account.</p>
      <p><strong>Accounts are lightweight.</strong> Sign-in uses a username and password only. No email, phone number, or public profile is required.</p>
      <p><strong>Auth is for sync and participation.</strong> Saved/read state can sync across browsers, and votes plus challenges are gated behind sign-in.</p>
      <p>${viewer ? `You are currently signed in as <strong>@${htmlEscape(viewer.username)}</strong>.` : `If you want synced state or member actions, create an account with an invite.`}</p>
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

  return layout("About", content, "about", viewer);
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
  - Keep every JSON string value on a single line. If you need paragraph breaks, encode them as \n\n inside the JSON string.
  - Never emit raw newlines inside a JSON string value.
  - Never emit chain-of-thought, <think> tags, XML tags, or prose before/after the JSON object.
  - Return JSON only. No markdown fences. No prose before or after the JSON.

Formatting rules:
  - Use LaTeX for all math: inline $...$ and display $$...$$
  - When referencing equations, losses, metrics, or any mathematical content
    from the paper, reproduce them in LaTeX rather than describing them in words.
  - Keep math inline and compact inside the JSON string, e.g. "$Q_i \in [0,1]$" or "$\\mathcal{G}_{exp}$".
  - Never pretty-print symbols across multiple lines.
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
  9. Keep every JSON string value on a single line. If you need paragraph breaks, encode them as \n\n inside the JSON string.
  10. Never emit raw newlines inside a JSON string value.
  11. Never emit chain-of-thought, <think> tags, XML tags, or prose before/after the JSON object.
  12. Return JSON only. No markdown fences. No prose before or after the JSON.

Formatting rules:
  - Use LaTeX for math: inline $...$ and display $$...$$
  - Keep math inline and compact inside the JSON string, e.g. "$Q_i \in [0,1]$".
  - Never pretty-print symbols across multiple lines.
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

function compactPlainText(text: string, maxChars: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= maxChars) return flat;
  return `${flat.slice(0, maxChars).replace(/\s+\S*$/, "")}...`;
}

function looksLikeStructuredLeak(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  return trimmed.includes("</think>") ||
    trimmed.includes('"sections":') ||
    trimmed.includes('"intro":') ||
    trimmed.includes('"stance":') ||
    trimmed.includes("Let me write the JSON") ||
    trimmed.includes("I need to include LaTeX") ||
    (/^\{[\s\S]*\}$/.test(trimmed) && trimmed.includes('"key"'));
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

function formatDateTime(value: number): string {
  try {
    return new Date(value).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(value);
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
