/**
 * PaperAgent - one Durable Object per arXiv paper.
 *
 * The DO owns its paper's full lifecycle:
 *   - Upserts its own row into D1
 *   - Fetches paper text (arXiv HTML → PDF → toMarkdown)
 *   - Runs alarm-based AI review loop via Kimi K2.5
 *   - Syncs status/votes back to D1
 *   - Handles queued challenges asynchronously
 *
 * All public methods are called via RPC from the worker — no fetch/onRequest.
 */

import { Agent } from "agents";
import type {
  PaperState,
  PaperMeta,
  Challenge,
  ReviewData,
  ReviewSectionData,
  ReviewCitation,
  ChallengeData,
  ChallengeStance,
} from "./types";
import { PAPERS_TABLE, ensurePaperStore, normalizePaperMeta } from "./papers";

const MODEL = "@cf/moonshotai/kimi-k2.5";

const REVIEW_MAX_STEPS = 20;
const CHALLENGE_MAX_STEPS = 6;
const MAX_PAPER_CHARS = 120_000;
const MAX_FETCH_CHARS = 12_000;

type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; tool_calls?: ToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string };

type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type AiResponse = {
  response?: string;
  tool_calls?: ToolCall[];
};

type ToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: string; description: string }>;
      required: string[];
    };
  };
};

type ReviewStepPayload = { step: number; retry?: number };
type ChallengeStepPayload = { id: number; retry?: number };

const REVIEW_SYSTEM_PROMPT = `\
You are a rigorous scientific reviewer with the ability to fetch URLs to verify sources.

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

const CHALLENGE_SYSTEM_PROMPT = `\
You are a rigorous scientific fact-checker. A user has raised a specific challenge
about a claim in a paper or its AI review.

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

const FETCH_URL_TOOL: ToolDef = {
  type: "function",
  function: {
    name: "fetch_url",
    description:
      "Fetch any public URL and get it back as clean Markdown. " +
      "Use for cited papers (https://arxiv.org/html/{id} preferred over PDFs), " +
      "verifying claims, or checking source material. " +
      `Returns up to ${MAX_FETCH_CHARS} characters.`,
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The full URL to fetch (http/https only)",
        },
      },
      required: ["url"],
    },
  },
};

const MAX_RETRIES = 5;
const BACKOFF_BASE_SECONDS = 30;

const REVIEW_SECTION_ORDER = [
  "verdict",
  "what_holds_up",
  "main_concerns",
  "evidence_comparison",
  "reproducibility",
] as const;

const REVIEW_SECTION_TITLES: Record<string, string> = {
  verdict: "Verdict",
  what_holds_up: "What holds up",
  main_concerns: "Main concerns",
  evidence_comparison: "Evidence and comparison",
  reproducibility: "Reproducibility",
};

const CHALLENGE_SECTION_ORDER = [
  "evidence",
  "assessment",
  "caveats",
] as const;

const CHALLENGE_SECTION_TITLES: Record<string, string> = {
  evidence: "Evidence checked",
  assessment: "Assessment",
  caveats: "Caveats",
};

function extractJsonCandidate(text: string): string | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;

  if (candidate.startsWith("{") && candidate.endsWith("}")) {
    return candidate;
  }

  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace <= firstBrace) return null;

  return candidate.slice(firstBrace, lastBrace + 1);
}

function normalizeReviewKey(value: string): string {
  const normalized = value
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

function normalizeReviewTitle(key: string, title: string): string {
  if (title.trim()) return title.trim();
  return REVIEW_SECTION_TITLES[key] ?? key.replace(/_/g, " ");
}

function normalizeCitation(raw: unknown): ReviewCitation | null {
  if (!raw || typeof raw !== "object") return null;

  const source = typeof (raw as Record<string, unknown>).source === "string"
    ? (raw as Record<string, string>).source.trim()
    : "";
  const locator = typeof (raw as Record<string, unknown>).locator === "string"
    ? (raw as Record<string, string>).locator.trim()
    : "";
  const quote = typeof (raw as Record<string, unknown>).quote === "string"
    ? (raw as Record<string, string>).quote.trim()
    : "";
  const url = typeof (raw as Record<string, unknown>).url === "string"
    ? (raw as Record<string, string>).url.trim()
    : "";

  if (!quote) return null;

  return {
    source: source || "paper",
    locator,
    quote,
    ...(url.startsWith("http://") || url.startsWith("https://") ? { url } : {}),
  };
}

function normalizeSection(raw: unknown): ReviewSectionData | null {
  if (!raw || typeof raw !== "object") return null;

  const record = raw as Record<string, unknown>;
  const keyInput = typeof record.key === "string"
    ? record.key
    : typeof record.title === "string"
      ? record.title
      : "";
  const key = normalizeReviewKey(keyInput);
  const body = typeof record.body === "string" ? record.body.trim() : "";

  if (!key || !body) return null;

  const citations = Array.isArray(record.citations)
    ? record.citations
        .map((citation) => normalizeCitation(citation))
        .filter((citation): citation is ReviewCitation => citation !== null)
    : [];

  return {
    key,
    title: normalizeReviewTitle(
      key,
      typeof record.title === "string" ? record.title : "",
    ),
    body,
    citations,
  };
}

function normalizeReviewData(raw: unknown): ReviewData | null {
  if (!raw || typeof raw !== "object") return null;

  const record = raw as Record<string, unknown>;
  const intro = typeof record.intro === "string" ? record.intro.trim() : "";
  const sections = Array.isArray(record.sections)
    ? record.sections
        .map((section) => normalizeSection(section))
        .filter((section): section is ReviewSectionData => section !== null)
    : [];

  if (!intro && sections.length === 0) return null;

  const orderedSections = [
    ...REVIEW_SECTION_ORDER.flatMap((key) => sections.filter((section) => section.key === key)),
    ...sections.filter((section) => !REVIEW_SECTION_ORDER.includes(section.key as typeof REVIEW_SECTION_ORDER[number])),
  ];

  return { intro, sections: orderedSections };
}

function reviewTextFromData(reviewData: ReviewData): string {
  return reviewData.sections
    .map((section) => `**${section.title}.** ${section.body}`)
    .join("\n\n");
}

function normalizeChallengeStance(value: string): ChallengeStance {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (normalized === "agree") return "agree";
  if (normalized === "partially_agree" || normalized === "partial_agreement") {
    return "partially_agree";
  }
  if (normalized === "disagree") return "disagree";
  return "inconclusive";
}

function normalizeChallengeTitle(key: string, title: string): string {
  if (title.trim()) return title.trim();
  return CHALLENGE_SECTION_TITLES[key] ?? key.replace(/_/g, " ");
}

function normalizeChallengeSection(raw: unknown): ReviewSectionData | null {
  if (!raw || typeof raw !== "object") return null;

  const record = raw as Record<string, unknown>;
  const keyInput = typeof record.key === "string"
    ? record.key
    : typeof record.title === "string"
      ? record.title
      : "";
  const key = keyInput
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const body = typeof record.body === "string" ? record.body.trim() : "";

  if (!key || !body) return null;

  const citations = Array.isArray(record.citations)
    ? record.citations
        .map((citation) => normalizeCitation(citation))
        .filter((citation): citation is ReviewCitation => citation !== null)
    : [];

  return {
    key,
    title: normalizeChallengeTitle(
      key,
      typeof record.title === "string" ? record.title : "",
    ),
    body,
    citations,
  };
}

function normalizeChallengeData(raw: unknown): ChallengeData | null {
  if (!raw || typeof raw !== "object") return null;

  const record = raw as Record<string, unknown>;
  const stance = normalizeChallengeStance(
    typeof record.stance === "string" ? record.stance : "inconclusive",
  );
  const summary = typeof record.summary === "string" ? record.summary.trim() : "";
  const sections = Array.isArray(record.sections)
    ? record.sections
        .map((section) => normalizeChallengeSection(section))
        .filter((section): section is ReviewSectionData => section !== null)
    : [];

  if (!summary && sections.length === 0) return null;

  const orderedSections = [
    ...CHALLENGE_SECTION_ORDER.flatMap((key) => sections.filter((section) => section.key === key)),
    ...sections.filter((section) => !CHALLENGE_SECTION_ORDER.includes(section.key as typeof CHALLENGE_SECTION_ORDER[number])),
  ];

  return {
    stance,
    summary,
    sections: orderedSections,
  };
}

function challengeTextFromData(challengeData: ChallengeData): string {
  const sectionsText = challengeData.sections
    .map((section) => `**${section.title}.** ${section.body}`)
    .join("\n\n");

  return challengeData.summary && sectionsText
    ? `${challengeData.summary}\n\n${sectionsText}`
    : challengeData.summary || sectionsText;
}

function parseLegacyReviewResponse(text: string): { intro: string; review: string } | null {
  const introMatch = text.match(/INTRO:\s*([\s\S]*?)(?=REVIEW:|$)/i);
  const reviewMatch = text.match(/REVIEW:\s*([\s\S]*?)$/i);
  const intro = introMatch?.[1]?.trim() ?? "";
  const review = reviewMatch?.[1]?.trim() ?? "";

  if (!intro || !review) return null;
  return { intro, review };
}

function invalidStructuredOutput(kind: "review" | "challenge", text: string): Error {
  const sample = text.replace(/\s+/g, " ").slice(0, 240);
  return new Error(`model returned invalid structured ${kind} output: ${sample}`);
}

function parseStructuredReviewResponse(text: string): {
  intro: string;
  review: string;
  reviewData: ReviewData | null;
} {
  const jsonCandidate = extractJsonCandidate(text);
  if (jsonCandidate) {
    try {
      const reviewData = normalizeReviewData(JSON.parse(jsonCandidate));
      if (reviewData?.intro && reviewData.sections.length > 0) {
        return {
          intro: reviewData.intro,
          review: reviewTextFromData(reviewData),
          reviewData,
        };
      }
    } catch {
      // Fall through to legacy check or hard failure.
    }
  }

  const legacy = parseLegacyReviewResponse(text);
  if (legacy) {
    return {
      intro: legacy.intro,
      review: legacy.review,
      reviewData: null,
    };
  }

  throw invalidStructuredOutput("review", text);
}

function parseStructuredChallengeResponse(text: string): {
  text: string;
  data: ChallengeData;
} {
  const jsonCandidate = extractJsonCandidate(text);
  if (!jsonCandidate) {
    throw invalidStructuredOutput("challenge", text);
  }

  try {
    const data = normalizeChallengeData(JSON.parse(jsonCandidate));
    if (!data?.summary || data.sections.length === 0) {
      throw invalidStructuredOutput("challenge", text);
    }
    return {
      text: challengeTextFromData(data),
      data,
    };
  } catch {
    throw invalidStructuredOutput("challenge", text);
  }
}

export class PaperAgent extends Agent<Env, PaperState> {
  initialState: PaperState = {
    id: "",
    reviewStatus: "pending",
    intro: "",
    review: "",
    reviewData: null,
    votesUp: 0,
    votesDown: 0,
  };

  async onStart(): Promise<void> {
    this
      .sql`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`;
    this.sql`CREATE TABLE IF NOT EXISTS challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_prompt TEXT NOT NULL,
      created_by_user_id TEXT,
      ai_response TEXT NOT NULL,
      response_data TEXT,
      status TEXT NOT NULL DEFAULT 'done',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`;

    try {
      this
        .sql`ALTER TABLE challenges ADD COLUMN status TEXT NOT NULL DEFAULT 'done'`;
    } catch {
      // Existing tables already have the column.
    }

    try {
      this.sql`ALTER TABLE challenges ADD COLUMN response_data TEXT`;
    } catch {
      // Existing tables already have the column.
    }

    try {
      this.sql`ALTER TABLE challenges ADD COLUMN created_by_user_id TEXT`;
    } catch {
      // Existing tables already have the column.
    }
  }

  /** Called by the queue consumer. DO upserts its own D1 row and starts review. */
  async init(meta: PaperMeta): Promise<void> {
    const normalizedMeta = normalizePaperMeta(meta);
    await ensurePaperStore(this.env.DB);
    this.setMeta(normalizedMeta);
    await this.upsertD1Row(normalizedMeta);

    if (
      this.state.reviewStatus === "pending" ||
      this.state.reviewStatus === "error"
    ) {
      await this.startReview(normalizedMeta);
    }
  }

  /** Returns live state + challenge threads for the detail page. */
  async getState(): Promise<{ state: PaperState; challenges: Challenge[] }> {
    return { state: this.state, challenges: this.getChallenges() };
  }

  /** Cast a vote. Returns updated counts. DO syncs to D1. */
  async vote(
    dir: "up" | "down",
  ): Promise<{ votesUp: number; votesDown: number }> {
    this.setState({
      ...this.state,
      votesUp: this.state.votesUp + (dir === "up" ? 1 : 0),
      votesDown: this.state.votesDown + (dir === "down" ? 1 : 0),
    });
    await this.syncToD1({
      votes_up: this.state.votesUp,
      votes_down: this.state.votesDown,
    });
    return { votesUp: this.state.votesUp, votesDown: this.state.votesDown };
  }

  async setVoteTotals(votesUp: number, votesDown: number): Promise<void> {
    this.setState({
      ...this.state,
      votesUp,
      votesDown,
    });
  }

  /** User challenges the review. Queues work so the user can keep reading. */
  async challenge(prompt: string, createdByUserId?: string): Promise<{ id: number }> {
    const meta = this.getMeta();
    if (!meta) throw new Error("paper not initialised");

    this.sql`
      INSERT INTO challenges (user_prompt, created_by_user_id, ai_response, status)
      VALUES (${prompt}, ${createdByUserId ?? null}, '', 'pending')
    `;
    const row = [
      ...this.sql<{ id: number }>`SELECT last_insert_rowid() AS id`,
    ][0];
    const challengeId = row?.id ?? 0;
    await this.schedule(0, "processChallenge", {
      id: challengeId,
    } satisfies ChallengeStepPayload);
    return { id: challengeId };
  }

  async processChallenge(payload: ChallengeStepPayload): Promise<void> {
    const { id, retry = 0 } = payload;
    const meta = this.getMeta();
    const challenge = this.getChallenge(id);

    if (!meta || !challenge) {
      console.error(`[${this.state.id}] processChallenge: missing meta or challenge ${id}`);
      return;
    }

    if (challenge.status === "done") return;

    this.updateChallenge(id, { status: "running", ai_response: "", response_data: null });

    try {
      const { text, data } = await this.runChallenge(meta, challenge.user_prompt);
      this.updateChallenge(id, {
        ai_response: text,
        response_data: data ? JSON.stringify(data) : null,
        status: "done",
      });
    } catch (err) {
      console.error(`[${this.state.id}] challenge ${id} failed (retry ${retry}):`, err);

      if (retry < MAX_RETRIES) {
        const delay = BACKOFF_BASE_SECONDS * Math.pow(4, retry);
        this.updateChallenge(id, { status: "pending" });
        await this.schedule(delay, "processChallenge", {
          id,
          retry: retry + 1,
        } satisfies ChallengeStepPayload);
      } else {
        this.updateChallenge(id, {
          status: "error",
          ai_response: "Challenge failed. Please try again in a moment.",
          response_data: null,
        });
      }
    }
  }

  // =========================================================================
  // D1 sync — the DO is the single owner of its paper's D1 row
  // =========================================================================

  private async upsertD1Row(meta: PaperMeta): Promise<void> {
    await ensurePaperStore(this.env.DB);

    const existing = await this.env.DB.prepare(
      `SELECT versioned_id, votes_up, votes_down FROM ${PAPERS_TABLE} WHERE id = ?`
    )
      .bind(meta.id)
      .first<{ versioned_id: string; votes_up: number; votes_down: number }>();

    if (existing) {
      this.setState({
        ...this.state,
        votesUp: existing.votes_up,
        votesDown: existing.votes_down,
      });
    }

    const versionChanged = !!existing && existing.versioned_id !== meta.versionedId;

    if (!existing) {
      await this.env.DB.prepare(
        `INSERT INTO ${PAPERS_TABLE}
           (id, version, versioned_id, title, authors, abstract, categories, published_at, arxiv_url, pdf_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          meta.id,
          meta.version,
          meta.versionedId,
          meta.title,
          JSON.stringify(meta.authors),
          meta.abstract,
          JSON.stringify(meta.categories),
          meta.publishedAt,
          meta.arxivUrl,
          meta.pdfUrl,
        )
        .run();
      return;
    }

    const fields: Record<string, string | number> = {
      version: meta.version,
      versioned_id: meta.versionedId,
      title: meta.title,
      authors: JSON.stringify(meta.authors),
      abstract: meta.abstract,
      categories: JSON.stringify(meta.categories),
      published_at: meta.publishedAt,
      arxiv_url: meta.arxivUrl,
      pdf_url: meta.pdfUrl,
    };

    if (versionChanged) {
      fields.review_status = "pending";
      fields.intro = "";
      fields.fetched_at = Math.floor(Date.now() / 1000);
    }

    await this.syncToD1(fields, meta.id);
  }

  private async syncToD1(
    fields: Record<string, string | number>,
    paperId?: string,
  ): Promise<void> {
    await ensurePaperStore(this.env.DB);
    const id = paperId ?? this.getMeta()?.id;
    if (!id) return;
    const setClauses = Object.keys(fields)
      .map((k) => `${k} = ?`)
      .join(", ");
    const values = Object.values(fields);
    await this.env.DB.prepare(`UPDATE ${PAPERS_TABLE} SET ${setClauses} WHERE id = ?`)
      .bind(...values, id)
      .run();
  }

  private async syncStatusToD1(
    status: PaperState["reviewStatus"],
  ): Promise<void> {
    await this.syncToD1({ review_status: status });
  }

  // =========================================================================
  // Review pipeline (alarm-based)
  // =========================================================================

  async retryStartReview(payload: { retry: number }): Promise<void> {
    const meta = this.getMeta();
    if (!meta) {
      console.error(`[${this.state.id}] retryStartReview: no meta`);
      return;
    }
    await this.startReview(meta, payload.retry);
  }

  private async startReview(meta: PaperMeta, retry = 0): Promise<void> {
    this.setState({ ...this.state, reviewStatus: "reviewing" });
    await this.syncStatusToD1("reviewing");

    let paperMd: string;
    try {
      paperMd = await this.getPaperMarkdown(meta);
    } catch (err) {
      console.error(
        `[${meta.id}] paper text fetch failed (retry ${retry}):`,
        err,
      );
      if (retry < MAX_RETRIES) {
        const delay = BACKOFF_BASE_SECONDS * Math.pow(4, retry);
        console.log(`[${meta.id}] retrying startReview in ${delay}s`);
        await this.schedule(delay, "retryStartReview", { retry: retry + 1 });
      } else {
        this.setState({ ...this.state, reviewStatus: "error" });
        await this.syncStatusToD1("error");
      }
      return;
    }
    console.log(`[${meta.id}] paper text: ${paperMd.length} chars`);

    this.saveReviewMessages([
      { role: "system", content: REVIEW_SYSTEM_PROMPT },
      {
        role: "user",
        content:
          `Title: ${meta.title}\nAuthors: ${meta.authors.join(", ")}\n` +
          `Categories: ${meta.categories.join(", ")}\narXiv: ${meta.arxivUrl}\n\n${paperMd}`,
      },
    ]);
    await this.schedule(0, "reviewStep", {
      step: 0,
    } satisfies ReviewStepPayload);
  }

  async reviewStep(payload: ReviewStepPayload): Promise<void> {
    const { step, retry = 0 } = payload;
    const id = this.state.id || "?";
    console.log(`[${id}] reviewStep ${step} (retry ${retry})`);

    const messages = this.loadReviewMessages();
    if (!messages) {
      console.error(`[${id}] reviewStep: no messages`);
      this.setState({ ...this.state, reviewStatus: "error" });
      await this.syncStatusToD1("error");
      return;
    }

    try {
      if (step >= REVIEW_MAX_STEPS) {
        const final = await this.aiRun(messages);
        await this.applyReview(final.response ?? "");
        this.clearReviewMessages();
        return;
      }

      const result = await this.aiRun(messages, [FETCH_URL_TOOL]);
      console.log(
        `[${id}] step ${step}: response=${(result.response ?? "").length} chars, ` +
          `tools=${JSON.stringify(result.tool_calls?.map((c) => c.function.name) ?? [])}`,
      );

      if (!result.tool_calls?.length) {
        await this.applyReview(result.response ?? "");
        this.clearReviewMessages();
        return;
      }

      messages.push({
        role: "assistant",
        content: result.response ?? "",
        tool_calls: result.tool_calls,
      });
      for (const call of result.tool_calls) {
        const r = await this.executeTool(call);
        console.log(`[${id}] tool ${call.function.name}: ${r.length} chars`);
        messages.push({ role: "tool", content: r, tool_call_id: call.id });
      }

      this.saveReviewMessages(messages);
      await this.schedule(0, "reviewStep", {
        step: step + 1,
      } satisfies ReviewStepPayload);
    } catch (err) {
      console.error(`[${id}] reviewStep ${step} failed (retry ${retry}):`, err);
      if (retry < MAX_RETRIES) {
        const delay = BACKOFF_BASE_SECONDS * Math.pow(4, retry);
        await this.schedule(delay, "reviewStep", {
          step,
          retry: retry + 1,
        } satisfies ReviewStepPayload);
      } else {
        this.setState({ ...this.state, reviewStatus: "error" });
        await this.syncStatusToD1("error");
        this.clearReviewMessages();
      }
    }
  }

  private async applyReview(text: string): Promise<void> {
    const { intro, review, reviewData } = parseStructuredReviewResponse(text);

    // Reject empty reviews — model burned all tokens on reasoning
    if (!intro && !review) {
      throw new Error(
        "model returned empty review (likely exhausted tokens on reasoning)",
      );
    }

    console.log(
      `[${this.state.id}] review done: intro=${intro.length}, review=${review.length} chars`,
    );
    this.setState({ ...this.state, reviewStatus: "done", intro, review, reviewData });
    await this.syncToD1({ review_status: "done", intro });
  }

  private async runChallenge(
    meta: PaperMeta,
    userPrompt: string,
  ): Promise<{ text: string; data: ChallengeData | null }> {
    const paperMd = await this.getPaperMarkdown(meta);
    const existingReview =
      this.state.intro || this.state.review
        ? `\n\n---\n**Existing AI review:**\n\n${this.state.intro}\n\n${this.state.review}`
        : "";

    const messages: ChatMessage[] = [
      { role: "system", content: CHALLENGE_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Title: ${meta.title}\narXiv: ${meta.arxivUrl}\n\n${paperMd}${existingReview}\n\n---\n**User challenge:** ${userPrompt}`,
      },
    ];

    for (let step = 0; step < CHALLENGE_MAX_STEPS; step++) {
      const result = await this.aiRun(messages, [FETCH_URL_TOOL]);
      if (!result.tool_calls?.length) return this.parseChallengeResponse(result.response ?? "");
      messages.push({
        role: "assistant",
        content: result.response ?? "",
        tool_calls: result.tool_calls,
      });
      for (const call of result.tool_calls) {
        messages.push({
          role: "tool",
          content: await this.executeTool(call),
          tool_call_id: call.id,
        });
      }
    }
    const final = await this.aiRun(messages);
    return this.parseChallengeResponse(final.response ?? "");
  }

  private parseChallengeResponse(text: string): {
    text: string;
    data: ChallengeData;
  } {
    return parseStructuredChallengeResponse(text);
  }

  private async aiRun(
    messages: ChatMessage[],
    tools?: ToolDef[],
  ): Promise<AiResponse> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await (this.env.AI.run as any)(
      MODEL,
      {
        messages,
        ...(tools ? { tools } : {}),
      },
      {
        extraHeaders: {
          "x-session-affinity": this.state.id,
        },
      },
    );
    const msg = raw?.choices?.[0]?.message;
    // Kimi K2.5 sometimes puts the full answer in reasoning_content when content is null
    const text = msg?.content ?? msg?.reasoning_content ?? raw?.response ?? "";
    return { response: text, tool_calls: msg?.tool_calls ?? raw?.tool_calls };
  }

  private async executeTool(call: ToolCall): Promise<string> {
    if (call.function.name === "fetch_url") {
      const { url } = JSON.parse(call.function.arguments) as { url: string };
      return this.fetchUrlAsMarkdown(url);
    }
    return `Unknown tool: ${call.function.name}`;
  }

  private async getPaperMarkdown(meta: PaperMeta): Promise<string> {
    const cached = [
      ...this.sql<{
        value: string;
      }>`SELECT value FROM meta WHERE key = 'paper_md'`,
    ][0];
    if (cached) return cached.value;
    const md = await this.fetchPaperMarkdown(meta);
    this
      .sql`INSERT OR REPLACE INTO meta (key, value) VALUES ('paper_md', ${md})`;
    return md;
  }

  private async fetchPaperMarkdown(meta: PaperMeta): Promise<string> {
    const sources: Array<{ url: string; mime: string; label: string }> = [
      {
        url: `https://arxiv.org/html/${meta.versionedId}`,
        mime: "text/html",
        label: "arXiv HTML",
      },
      {
        url: `https://arxiv.org/pdf/${meta.versionedId}`,
        mime: "application/pdf",
        label: "arXiv PDF",
      },
    ];

    const MAX_BODY = 30 * 1024 * 1024;

    for (const source of sources) {
      try {
        const res = await fetch(source.url, {
          headers: {
            "User-Agent": "arxlens/1.0 (https://arxlens.workers.dev)",
          },
          redirect: "follow",
        });
        if (!res.ok) {
          console.warn(`[${meta.id}] ${source.label}: HTTP ${res.status}`);
          continue;
        }

        const ct = res.headers.get("content-type") ?? "";
        if (
          source.mime === "application/pdf" &&
          !ct.includes("application/pdf")
        ) {
          console.warn(
            `[${meta.id}] ${source.label}: expected PDF, got "${ct}"`,
          );
          continue;
        }

        const cl = parseInt(res.headers.get("content-length") ?? "0", 10);
        if (cl > MAX_BODY) {
          console.warn(`[${meta.id}] ${source.label}: too large (${cl})`);
          continue;
        }

        const buffer = await res.arrayBuffer();
        if (buffer.byteLength > MAX_BODY) {
          console.warn(`[${meta.id}] ${source.label}: body too large`);
          continue;
        }

        const ext = source.mime === "application/pdf" ? "pdf" : "html";
        const results = await this.env.AI.toMarkdown([
          {
            name: `paper.${ext}`,
            blob: new Blob([buffer], { type: source.mime }),
          },
        ]);
        const result = Array.isArray(results) ? results[0] : results;
        if (result.format === "error") {
          console.warn(`[${meta.id}] ${source.label}: toMarkdown error`);
          continue;
        }
        if (!result.data || result.data.length < 5000) {
          console.warn(`[${meta.id}] ${source.label}: too short`);
          continue;
        }

        console.log(
          `[${meta.id}] ${source.label}: ${result.data.length} chars`,
        );
        return result.data.slice(0, MAX_PAPER_CHARS);
      } catch (err) {
        console.warn(`[${meta.id}] ${source.label}: error —`, err);
      }
    }
    throw new Error(`[${meta.id}] could not retrieve paper text`);
  }

  private async fetchUrlAsMarkdown(url: string): Promise<string> {
    if (!url.startsWith("http://") && !url.startsWith("https://"))
      return "Error: only http/https URLs";
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "arxlens/1.0 (https://arxlens.workers.dev)" },
        redirect: "follow",
      });
      if (!res.ok) return `Error: HTTP ${res.status}`;
      const ct = res.headers.get("content-type") ?? "";
      const buffer = await res.arrayBuffer();
      if (ct.includes("text/plain") || ct.includes("text/markdown")) {
        return new TextDecoder().decode(buffer).slice(0, MAX_FETCH_CHARS);
      }
      let mimeType = "text/html",
        fileName = "page.html";
      if (ct.includes("application/pdf")) {
        mimeType = "application/pdf";
        fileName = "doc.pdf";
      } else if (
        !ct.includes("text/html") &&
        !ct.includes("application/xhtml")
      ) {
        return `Cannot read content-type "${ct}".`;
      }
      const results = await this.env.AI.toMarkdown([
        { name: fileName, blob: new Blob([buffer], { type: mimeType }) },
      ]);
      const result = Array.isArray(results) ? results[0] : results;
      if (result.format === "error") return `Conversion error: ${result.error}`;
      return (result.data ?? "").slice(0, MAX_FETCH_CHARS);
    } catch (err) {
      return `Error: ${String(err)}`;
    }
  }

  // =========================================================================
  // SQLite helpers
  // =========================================================================

  private saveReviewMessages(messages: ChatMessage[]): void {
    this
      .sql`INSERT OR REPLACE INTO meta (key, value) VALUES ('review_messages', ${JSON.stringify(messages)})`;
  }
  private loadReviewMessages(): ChatMessage[] | null {
    const r = [
      ...this.sql<{
        value: string;
      }>`SELECT value FROM meta WHERE key = 'review_messages'`,
    ][0];
    return r ? (JSON.parse(r.value) as ChatMessage[]) : null;
  }
  private clearReviewMessages(): void {
    this.sql`DELETE FROM meta WHERE key = 'review_messages'`;
  }

  private setMeta(meta: PaperMeta): void {
    const normalizedMeta = normalizePaperMeta(meta);
    this
      .sql`INSERT OR REPLACE INTO meta (key, value) VALUES ('paper', ${JSON.stringify(normalizedMeta)})`;
    if (!this.state.id) this.setState({ ...this.state, id: normalizedMeta.versionedId });
  }
  private getMeta(): PaperMeta | null {
    const r = [
      ...this.sql<{
        value: string;
      }>`SELECT value FROM meta WHERE key = 'paper'`,
    ][0];
    return r ? normalizePaperMeta(JSON.parse(r.value) as PaperMeta) : null;
  }

  private hydrateChallenge(row: {
    id: number;
    user_prompt: string;
    ai_response: string;
    response_data: string | null;
    status: Challenge["status"];
    created_at: number;
  }): Challenge {
    let responseData: ChallengeData | null = null;

    if (row.response_data) {
      try {
        responseData = normalizeChallengeData(JSON.parse(row.response_data));
      } catch (err) {
        console.warn(`[${this.state.id}] failed to hydrate challenge ${row.id}:`, err);
      }
    }

    return {
      id: row.id,
      user_prompt: row.user_prompt,
      ai_response: row.ai_response,
      response_data: responseData,
      status: row.status,
      created_at: row.created_at,
    };
  }

  private getChallenge(id: number): Challenge | null {
    const row = [
      ...this.sql<{
        id: number;
        user_prompt: string;
        ai_response: string;
        response_data: string | null;
        status: Challenge["status"];
        created_at: number;
      }>`SELECT id, user_prompt, ai_response, response_data, status, created_at FROM challenges WHERE id = ${id} LIMIT 1`,
    ][0];

    return row ? this.hydrateChallenge(row) : null;
  }

  private updateChallenge(
    id: number,
    fields: {
      ai_response?: string;
      response_data?: string | null;
      status?: Challenge["status"];
    },
  ): void {
    if (
      fields.ai_response !== undefined &&
      fields.response_data !== undefined &&
      fields.status !== undefined
    ) {
      this.sql`UPDATE challenges SET ai_response = ${fields.ai_response}, response_data = ${fields.response_data}, status = ${fields.status} WHERE id = ${id}`;
      return;
    }

    if (fields.ai_response !== undefined && fields.response_data !== undefined) {
      this.sql`UPDATE challenges SET ai_response = ${fields.ai_response}, response_data = ${fields.response_data} WHERE id = ${id}`;
      return;
    }

    if (fields.ai_response !== undefined && fields.status !== undefined) {
      this.sql`UPDATE challenges SET ai_response = ${fields.ai_response}, status = ${fields.status} WHERE id = ${id}`;
      return;
    }

    if (fields.response_data !== undefined && fields.status !== undefined) {
      this.sql`UPDATE challenges SET response_data = ${fields.response_data}, status = ${fields.status} WHERE id = ${id}`;
      return;
    }

    if (fields.ai_response !== undefined) {
      this.sql`UPDATE challenges SET ai_response = ${fields.ai_response} WHERE id = ${id}`;
      return;
    }

    if (fields.response_data !== undefined) {
      this.sql`UPDATE challenges SET response_data = ${fields.response_data} WHERE id = ${id}`;
      return;
    }

    if (fields.status !== undefined) {
      this.sql`UPDATE challenges SET status = ${fields.status} WHERE id = ${id}`;
    }
  }

  private getChallenges(): Challenge[] {
    return [
      ...this
        .sql<{
          id: number;
          user_prompt: string;
          ai_response: string;
          response_data: string | null;
          status: Challenge["status"];
          created_at: number;
        }>`SELECT id, user_prompt, ai_response, response_data, status, created_at FROM challenges ORDER BY created_at ASC`,
    ].map((row) => this.hydrateChallenge(row));
  }
}
