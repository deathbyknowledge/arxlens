/**
 * Agent/text-mode renderers for arxlens public pages.
 */

import type {
  Challenge,
  PaperRow,
  ReviewCitation,
  ReviewData,
} from "./types";
import type { FeedOptions, PaperDetailOptions } from "./html";
import {
  buildFeedHref,
  compactPlainText,
  detailSummaryCards,
  feedResultsLabel,
  feedSortNote,
  formatDate,
  formatDateTime,
  getReviewSection,
  looksLikeStructuredLeak,
  resolveReviewData,
  reviewStatusCopy,
} from "./html";
import {
  renderActionsSection,
  renderHintsSection,
  textNavigationHint,
  type Action,
  type Hint,
  type NegotiatedRepresentation,
} from "./presentation";

export function feedPageMarkdown(
  opts: FeedOptions,
  selection: NegotiatedRepresentation,
): string {
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
    viewer,
    userVotes,
  } = opts;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasFilters = reviewedOnly || !!selectedCategory;
  const feedState = { sort, page, selectedCategory, reviewedOnly };
  const currentFeedPath = buildFeedHref(feedState);
  const resultsLabel = feedResultsLabel(total, selectedCategory, reviewedOnly);
  const sortNote = feedSortNote(sort);

  const overviewSection = [
    "## Feed",
    `- sort: \`${sort}\``,
    `- page: \`${page} of ${totalPages}\``,
    `- results: ${markdownEscape(resultsLabel)}`,
    `- category: ${selectedCategory ? `\`${selectedCategory}\`` : "all categories"}`,
    `- review filter: ${reviewedOnly ? "`reviewed only`" : "all papers"}`,
    `- reader: ${viewer ? `\`@${markdownEscape(viewer.username)}\`` : "public"}`,
    `- sort note: ${markdownEscape(sortNote)}`,
  ].join("\n");

  const lookupSection = lookupValue || lookupError
    ? [
      "## Lookup",
      lookupValue ? `- requested: ${markdownEscape(lookupValue)}` : "",
      lookupError ? `- status: ${markdownEscape(lookupError)}` : "- status: ready",
    ].filter(Boolean).join("\n")
    : "";

  const categoriesSection = categories.length === 0
    ? ""
    : [
      "## Categories (GET paths)",
      ...categories.map((category) => `- \`${buildFeedHref(feedState, { selectedCategory: category })}\` - ${markdownEscape(category)}`),
    ].join("\n");

  const papersSection = papers.length === 0
    ? [
      "## Papers (GET paths)",
      hasFilters
        ? "No papers match these filters. Try another category or include papers still being reviewed."
        : "No papers yet. Papers are fetched every day from arXiv.",
    ].join("\n\n")
    : [
      "## Papers (GET paths)",
      ...papers.map((paper, index) => renderFeedPaperMarkdown(paper, index, userVotes[paper.id] ?? null)),
    ].join("\n\n");

  const actions: Action[] = [
    {
      method: "GET",
      path: currentFeedPath,
      description: "reload this feed",
    },
    {
      method: "GET",
      path: "/",
      description: "open a paper by arXiv id or URL",
      fields: [
        {
          name: "paper",
          description: "arXiv id or arXiv abs/pdf/html URL",
        },
      ],
      effect: "redirects to `\/paper\/{id}`",
    },
  ];

  if (sort !== "hot") {
    actions.push({
      method: "GET",
      path: buildFeedHref(feedState, { sort: "hot" }),
      description: "browse trending papers",
    });
  }

  if (sort !== "new") {
    actions.push({
      method: "GET",
      path: buildFeedHref(feedState, { sort: "new" }),
      description: "browse newest papers",
    });
  }

  if (sort !== "top") {
    actions.push({
      method: "GET",
      path: buildFeedHref(feedState, { sort: "top" }),
      description: "browse top-scoring papers",
    });
  }

  if (hasFilters) {
    actions.push({
      method: "GET",
      path: buildFeedHref(feedState, { selectedCategory: null, reviewedOnly: false }),
      description: "clear category and review filters",
    });
  }

  if (page > 1) {
    actions.push({
      method: "GET",
      path: buildFeedHref(feedState, { page: page - 1 }),
      description: "open previous results page",
    });
  }

  if (page < totalPages) {
    actions.push({
      method: "GET",
      path: buildFeedHref(feedState, { page: page + 1 }),
      description: "open next results page",
    });
  }

  const hints: Hint[] = [
    textNavigationHint(selection),
    {
      text: "Each preview is labeled as either an AI intro or the raw abstract so agents can distinguish synthesized text from source metadata.",
    },
    {
      text: "Markdown mode is currently read-only. Mutation routes like voting and challenge submission are intentionally omitted from this contract.",
    },
    {
      text: "Reading is public. Votes, saved-state sync, and challenge submission require sign-in.",
    },
    {
      text: "The feed lookup accepts bare arXiv ids, versioned ids, and arXiv abs/pdf/html URLs.",
    },
  ];

  return joinMarkdownSections([
    "# arxlens feed\n\nPublic read of AI-assisted arXiv triage.",
    overviewSection,
    lookupSection,
    categoriesSection,
    papersSection,
    renderActionsSection(actions),
    renderHintsSection(hints),
  ]);
}

export function paperDetailPageMarkdown(
  opts: PaperDetailOptions,
  selection: NegotiatedRepresentation,
): string {
  const {
    paper,
    intro,
    review,
    reviewData,
    reviewStatus,
    challenges,
    challengeQueued,
    viewer,
    userVote,
  } = opts;
  const authors = JSON.parse(paper.authors) as string[];
  const categories = uniqueValues(JSON.parse(paper.categories) as string[]);
  const score = paper.votes_up - paper.votes_down;
  const safeIntro = looksLikeStructuredLeak(intro) ? "" : intro;
  const safeReview = looksLikeStructuredLeak(review) ? "" : review;
  const summaryCards = detailSummaryCards(paper, safeIntro, safeReview, reviewData, reviewStatus);

  const metadataLines = [
    "## Paper",
    `- GET path: \`/paper/${encodeURIComponent(paper.id)}\``,
    `- paper id: \`${paper.id}\``,
    `- versioned id: \`${paper.versioned_id}\``,
    `- version: \`${paper.version}\``,
    `- published: ${markdownEscape(formatDate(paper.published_at))}`,
    `- review status: \`${reviewStatus}\``,
    `- community score: \`${score}\` (${paper.votes_up} up, ${paper.votes_down} down)`,
    `- authors: ${markdownEscape(authors.join(", "))}`,
    `- categories: ${categories.length > 0 ? categories.map((category) => `\`${category}\``).join(", ") : "none"}`,
    `- reader state: ${viewer ? `\`synced to @${markdownEscape(viewer.username)}\`` : "local to this browser"}`,
    `- your vote: ${userVote ? `\`${userVote}\`` : "none"}`,
  ].join("\n");

  const sourceSection = [
    "## Source links",
    `- arXiv: ${paper.arxiv_url}`,
    `- PDF: ${paper.pdf_url}`,
  ].join("\n");

  const categorySection = categories.length === 0
    ? ""
    : [
      "## Category feeds (GET paths)",
      ...categories.map((category) => `- \`/?sort=hot&category=${encodeURIComponent(category)}\` - ${markdownEscape(category)}`),
    ].join("\n");

  const summarySection = [
    "## Summary",
    ...summaryCards.map((card) => `### ${markdownEscape(card.label)}\n\n${renderMarkdownParagraphs(card.text)}`),
  ].join("\n\n");

  const actions: Action[] = [
    {
      method: "GET",
      path: `/paper/${encodeURIComponent(paper.id)}`,
      description: "reload this paper detail",
    },
    {
      method: "GET",
      path: "/",
      description: "return to the main feed",
    },
  ];

  const hints: Hint[] = [
    textNavigationHint(selection),
    {
      text: "The AI summary, review, and challenge responses are reading aids. Check the abstract, paper, and quoted citations before trusting a claim.",
    },
    {
      text: "Markdown mode is currently read-only. Voting and challenge submission still use the browser forms and auth flow.",
    },
    {
      text: "Challenges are public to read. Posting a new challenge or voting requires a signed-in member session.",
    },
  ];

  return joinMarkdownSections([
    `# ${markdownEscape(paper.title)}\n\nAI-assisted reading brief for \`${paper.id}\`.`,
    metadataLines,
    sourceSection,
    categorySection,
    summarySection,
    renderPaperReviewMarkdown(reviewStatus, safeIntro, safeReview, reviewData),
    `## Abstract\n\n${renderMarkdownParagraphs(paper.abstract)}`,
    renderPaperChallengesMarkdown(challenges, challengeQueued),
    renderActionsSection(actions),
    renderHintsSection(hints),
  ]);
}

function renderFeedPaperMarkdown(
  paper: PaperRow,
  index: number,
  userVote: "up" | "down" | null,
): string {
  const authors = JSON.parse(paper.authors) as string[];
  const categories = uniqueValues(JSON.parse(paper.categories) as string[]);
  const authorStr = authors.slice(0, 3).join(", ") + (authors.length > 3 ? " et al." : "");
  const safeIntro = looksLikeStructuredLeak(paper.intro) ? "" : paper.intro;
  const previewText = safeIntro || paper.abstract;
  const previewSource = safeIntro ? "AI intro" : "abstract";
  const score = paper.votes_up - paper.votes_down;
  const lines = [
    `### ${index + 1}. ${markdownEscape(paper.title)}`,
    `- GET path: \`/paper/${encodeURIComponent(paper.id)}\``,
    `- published: ${markdownEscape(formatDate(paper.published_at))}`,
    `- community score: \`${score}\` (${paper.votes_up} up, ${paper.votes_down} down)`,
    `- authors: ${markdownEscape(authorStr)}`,
    `- categories: ${categories.length > 0 ? categories.map((category) => `\`${category}\``).join(", ") : "none"}`,
    `- preview source: \`${previewSource}\``,
  ];

  if (userVote) {
    lines.push(`- your vote: \`${userVote}\``);
  }

  if (paper.arxiv_url) {
    lines.push(`- arXiv: ${paper.arxiv_url}`);
  }

  lines.push(`- preview: ${markdownEscape(previewText)}`);
  return lines.join("\n");
}

function renderPaperReviewMarkdown(
  status: string,
  intro: string,
  review: string,
  reviewData: ReviewData | null,
): string {
  const sections: string[] = [
    "## AI Review",
    `- status: \`${status}\``,
  ];

  if (status === "pending" || status === "reviewing" || status === "error") {
    sections.push(renderMarkdownParagraphs(reviewStatusCopy(status)));
    return joinMarkdownSections(sections);
  }

  const resolvedReview = resolveReviewData(review, reviewData);
  const verdictSection = getReviewSection(resolvedReview, "verdict");
  const displaySections = resolvedReview.sections.filter((section) => section.key !== "verdict");
  const missingReviewContent = !intro && !review && !reviewData;

  if (intro) {
    sections.push("### Plain-language introduction");
    sections.push(renderMarkdownParagraphs(intro));
  }

  if (verdictSection) {
    sections.push("### Verdict");
    sections.push(renderMarkdownParagraphs(verdictSection.body));
    const citations = renderMarkdownReviewCitations(verdictSection.citations);
    if (citations) sections.push(citations);
  }

  if (displaySections.length > 0) {
    for (const section of displaySections) {
      sections.push(`### ${markdownEscape(section.title)}`);
      sections.push(renderMarkdownParagraphs(section.body));
      const citations = renderMarkdownReviewCitations(section.citations);
      if (citations) sections.push(citations);
    }
  } else if (review) {
    sections.push("### Critical review");
    sections.push(renderMarkdownParagraphs(review));
  } else {
    sections.push(
      missingReviewContent
        ? "Review content unavailable. This cached review should be regenerated."
        : "Review content unavailable.",
    );
  }

  return joinMarkdownSections(sections);
}

function renderPaperChallengesMarkdown(
  challenges: Challenge[],
  challengeQueued: boolean,
): string {
  const pendingCount = challenges.filter(
    (challenge) => challenge.status === "pending" || challenge.status === "running",
  ).length;
  const sections: string[] = [
    "## Challenges",
    `- count: \`${challenges.length}\`\n- pending: \`${pendingCount}\``,
  ];

  if (challengeQueued) {
    sections.push(
      pendingCount > 0
        ? "Challenge queued. The AI is checking the paper and cited sources now."
        : "Challenge queued. The response is now part of the thread below.",
    );
  }

  if (challenges.length === 0) {
    sections.push("No challenges yet.");
    return joinMarkdownSections(sections);
  }

  for (const [index, challenge] of challenges.entries()) {
    sections.push(renderMarkdownChallenge(challenge, index + 1));
  }

  return joinMarkdownSections(sections);
}

function renderMarkdownChallenge(challenge: Challenge, index: number): string {
  const sections: string[] = [
    `### Challenge ${index}`,
    `- status: \`${challengeStatusLabel(challenge.status)}\`\n- created: ${markdownEscape(formatDateTime(challenge.created_at * 1000))}`,
    "#### Prompt",
    renderMarkdownParagraphs(challenge.user_prompt),
    "#### Response",
  ];

  if (challenge.status === "done") {
    sections.push(
      challenge.response_data
        ? renderMarkdownChallengeResponse(challenge.response_data)
        : renderMarkdownParagraphs(challenge.ai_response),
    );
  } else if (challenge.status === "error") {
    sections.push(renderMarkdownParagraphs(challenge.ai_response || "Challenge failed. Please try again."));
  } else {
    sections.push("The AI is checking this challenge against the paper and cited sources. Refresh in a moment to see the result.");
  }

  return joinMarkdownSections(sections);
}

function renderMarkdownChallengeResponse(challengeData: Challenge["response_data"]): string {
  if (!challengeData) return "Challenge response unavailable.";

  const sections: string[] = [];

  if (challengeData.summary) {
    sections.push("#### Response summary");
    sections.push(`- stance: \`${challengeStanceLabel(challengeData.stance)}\``);
    sections.push(renderMarkdownParagraphs(challengeData.summary));
  }

  for (const section of challengeData.sections) {
    sections.push(`#### ${markdownEscape(section.title)}`);
    sections.push(renderMarkdownParagraphs(section.body));
    const citations = renderMarkdownReviewCitations(section.citations);
    if (citations) sections.push(citations);
  }

  return joinMarkdownSections(sections) || "Challenge response unavailable.";
}

function renderMarkdownReviewCitations(citations: ReviewCitation[]): string {
  if (citations.length === 0) return "";

  return [
    "Citations:",
    ...citations.map((citation) => `- \"${markdownEscape(citation.quote.replace(/\s+/g, " ").trim())}\" - ${renderMarkdownCitationMeta(citation)}`),
  ].join("\n");
}

function renderMarkdownCitationMeta(citation: ReviewCitation): string {
  const sourceLabel = markdownEscape(citation.source || "paper");
  const url = citation.url ? ` (${citation.url})` : "";
  const locator = citation.locator ? ` - ${markdownEscape(citation.locator)}` : "";
  return `${sourceLabel}${url}${locator}`;
}

function challengeStatusLabel(status: Challenge["status"]): string {
  if (status === "pending") return "Queued";
  if (status === "running") return "Investigating";
  if (status === "error") return "Retry needed";
  return "AI response";
}

function challengeStanceLabel(stance: NonNullable<Challenge["response_data"]>["stance"]): string {
  if (stance === "agree") return "Agrees with challenge";
  if (stance === "partially_agree") return "Partially agrees";
  if (stance === "disagree") return "Disagrees";
  return "Inconclusive";
}

function renderMarkdownParagraphs(text: string): string {
  const blocks = splitTextBlocks(text)
    .map((block) => markdownEscape(block.replace(/\s*\n\s*/g, " ").trim()))
    .filter(Boolean);

  if (blocks.length === 0) {
    return markdownEscape(text.replace(/\s+/g, " ").trim());
  }

  return blocks.join("\n\n");
}

function splitTextBlocks(text: string): string[] {
  return text
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function joinMarkdownSections(sections: Array<string | null | undefined>): string {
  return sections
    .filter((section): section is string => typeof section === "string" && section.trim().length > 0)
    .join("\n\n");
}

function markdownEscape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\\/g, "\\\\")
    .replace(/([`*_{}\[\]()#+\-!>])/g, "\\$1");
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
