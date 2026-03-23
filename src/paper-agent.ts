/**
 * PaperAgent - one Durable Object per arXiv paper.
 *
 * The DO owns its paper's full lifecycle:
 *   - Upserts its own row into D1
 *   - Fetches paper text (arXiv HTML → PDF → toMarkdown)
 *   - Runs alarm-based AI review loop via Kimi K2.5
 *   - Syncs status/votes back to D1
 *   - Handles challenges inline
 *
 * All public methods are called via RPC from the worker — no fetch/onRequest.
 */

import { Agent } from "agents";
import type { PaperState, PaperMeta, Challenge } from "./types";

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

const REVIEW_SYSTEM_PROMPT = `\
You are a rigorous scientific reviewer with the ability to fetch URLs to verify sources.

You will receive the full text of an academic paper in Markdown.
Produce exactly two sections:

INTRO:
Write 2-3 sentences explaining the paper for a smart non-specialist.
  Cover: what problem it solves, the core idea, and why it matters.
  Do NOT paraphrase the abstract. Synthesize in your own words.
  Keep it concise — this will be shown as a preview in a feed card.

REVIEW:
Write 4-6 paragraphs of rigorous critical evaluation. Cover:
  - Soundness of methodology and experimental design
  - Whether claims are supported by the evidence shown
  - Key assumptions, limitations, or things glossed over
  - Fit with related work — use fetch_url to pull cited papers from
    https://arxiv.org/html/{id} and verify comparisons are fair
  - Whether results are reproducible (hyperparameters, data, code released?)
  Be direct. Name flaws explicitly. Do not praise without cause.

Formatting rules:
  - Use LaTeX for all math: inline $...$ and display $$...$$
  - When referencing equations, losses, metrics, or any mathematical content
    from the paper, reproduce them in LaTeX rather than describing them in words.
  - Write prose in plain text (not LaTeX). Only math goes in dollar signs.

Your response must begin with "INTRO:" and contain "REVIEW:" — no other top-level text.`;

const CHALLENGE_SYSTEM_PROMPT = `\
You are a rigorous scientific fact-checker. A user has raised a specific challenge
about a claim in a paper or its AI review.

Your job:
  1. Investigate the concern objectively using the paper text provided
  2. Use fetch_url to pull cited sources or URLs the user mentions
     (prefer https://arxiv.org/html/{id} for arXiv papers)
  3. Quote directly from sources when making claims
  4. If the user is right, say so clearly; if wrong, explain why with evidence
  5. Be concise: 2-4 paragraphs, evidence-first
  6. Use LaTeX for math: inline $...$ and display $$...$$`;

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
        url: { type: "string", description: "The full URL to fetch (http/https only)" },
      },
      required: ["url"],
    },
  },
};

const MAX_RETRIES = 5;
const BACKOFF_BASE_SECONDS = 30;

export class PaperAgent extends Agent<Env, PaperState> {
  initialState: PaperState = {
    id: "",
    reviewStatus: "pending",
    intro: "",
    review: "",
    votesUp: 0,
    votesDown: 0,
  };

  async onStart(): Promise<void> {
    this.sql`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`;
    this.sql`CREATE TABLE IF NOT EXISTS challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_prompt TEXT NOT NULL,
      ai_response TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`;
  }

  /** Called by the queue consumer. DO upserts its own D1 row and starts review. */
  async init(meta: PaperMeta): Promise<void> {
    this.setMeta(meta);
    await this.upsertD1Row(meta);

    if (this.state.reviewStatus === "pending" || this.state.reviewStatus === "error") {
      await this.startReview(meta);
    }
  }

  /** Returns live state + challenge threads for the detail page. */
  async getState(): Promise<{ state: PaperState; challenges: Challenge[] }> {
    return { state: this.state, challenges: this.getChallenges() };
  }

  /** Cast a vote. Returns updated counts. DO syncs to D1. */
  async vote(dir: "up" | "down"): Promise<{ votesUp: number; votesDown: number }> {
    this.setState({
      ...this.state,
      votesUp:   this.state.votesUp   + (dir === "up"   ? 1 : 0),
      votesDown: this.state.votesDown + (dir === "down" ? 1 : 0),
    });
    await this.syncToD1({ votes_up: this.state.votesUp, votes_down: this.state.votesDown });
    return { votesUp: this.state.votesUp, votesDown: this.state.votesDown };
  }

  /** User challenges the review. Runs inline (user is waiting). */
  async challenge(prompt: string): Promise<{ id: number }> {
    const meta = this.getMeta();
    if (!meta) throw new Error("paper not initialised");

    const aiResponse = await this.runChallenge(meta, prompt);
    this.sql`INSERT INTO challenges (user_prompt, ai_response) VALUES (${prompt}, ${aiResponse})`;
    const row = [...this.sql<{ id: number }>`SELECT last_insert_rowid() AS id`][0];
    return { id: row?.id ?? 0 };
  }

  // =========================================================================
  // D1 sync — the DO is the single owner of its paper's D1 row
  // =========================================================================

  private async upsertD1Row(meta: PaperMeta): Promise<void> {
    await this.env.DB.prepare(
      `INSERT OR IGNORE INTO papers
         (id, title, authors, abstract, categories, published_at, arxiv_url, pdf_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        meta.id, meta.title, JSON.stringify(meta.authors), meta.abstract,
        JSON.stringify(meta.categories), meta.publishedAt, meta.arxivUrl, meta.pdfUrl
      )
      .run();
  }

  private async syncToD1(fields: Record<string, string | number>): Promise<void> {
    const id = this.state.id;
    if (!id) return;
    const setClauses = Object.keys(fields).map(k => `${k} = ?`).join(", ");
    const values = Object.values(fields);
    await this.env.DB.prepare(`UPDATE papers SET ${setClauses} WHERE id = ?`)
      .bind(...values, id)
      .run();
  }

  private async syncStatusToD1(status: PaperState["reviewStatus"]): Promise<void> {
    await this.syncToD1({ review_status: status });
  }

  // =========================================================================
  // Review pipeline (alarm-based)
  // =========================================================================

  async retryStartReview(payload: { retry: number }): Promise<void> {
    const meta = this.getMeta();
    if (!meta) { console.error(`[${this.state.id}] retryStartReview: no meta`); return; }
    await this.startReview(meta, payload.retry);
  }

  private async startReview(meta: PaperMeta, retry = 0): Promise<void> {
    this.setState({ ...this.state, reviewStatus: "reviewing" });
    await this.syncStatusToD1("reviewing");

    let paperMd: string;
    try {
      paperMd = await this.getPaperMarkdown(meta);
    } catch (err) {
      console.error(`[${meta.id}] paper text fetch failed (retry ${retry}):`, err);
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
    await this.schedule(0, "reviewStep", { step: 0 } satisfies ReviewStepPayload);
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
        `tools=${JSON.stringify(result.tool_calls?.map(c => c.function.name) ?? [])}`
      );

      if (!result.tool_calls?.length) {
        await this.applyReview(result.response ?? "");
        this.clearReviewMessages();
        return;
      }

      messages.push({ role: "assistant", content: result.response ?? "", tool_calls: result.tool_calls });
      for (const call of result.tool_calls) {
        const r = await this.executeTool(call);
        console.log(`[${id}] tool ${call.function.name}: ${r.length} chars`);
        messages.push({ role: "tool", content: r, tool_call_id: call.id });
      }

      this.saveReviewMessages(messages);
      await this.schedule(0, "reviewStep", { step: step + 1 } satisfies ReviewStepPayload);
    } catch (err) {
      console.error(`[${id}] reviewStep ${step} failed (retry ${retry}):`, err);
      if (retry < MAX_RETRIES) {
        const delay = BACKOFF_BASE_SECONDS * Math.pow(4, retry);
        await this.schedule(delay, "reviewStep", { step, retry: retry + 1 } satisfies ReviewStepPayload);
      } else {
        this.setState({ ...this.state, reviewStatus: "error" });
        await this.syncStatusToD1("error");
        this.clearReviewMessages();
      }
    }
  }

  private async applyReview(text: string): Promise<void> {
    const introMatch  = text.match(/INTRO:\s*([\s\S]*?)(?=REVIEW:|$)/i);
    const reviewMatch = text.match(/REVIEW:\s*([\s\S]*?)$/i);
    const intro  = introMatch?.[1]?.trim()  ?? "";
    const review = reviewMatch?.[1]?.trim() ?? text;

    // Reject empty reviews — model burned all tokens on reasoning
    if (!intro && !review) {
      throw new Error("model returned empty review (likely exhausted tokens on reasoning)");
    }

    console.log(`[${this.state.id}] review done: intro=${intro.length}, review=${review.length} chars`);
    this.setState({ ...this.state, reviewStatus: "done", intro, review });
    await this.syncToD1({ review_status: "done", intro });
  }


  private async runChallenge(meta: PaperMeta, userPrompt: string): Promise<string> {
    const paperMd = await this.getPaperMarkdown(meta);
    const existingReview = (this.state.intro || this.state.review)
      ? `\n\n---\n**Existing AI review:**\n\n${this.state.intro}\n\n${this.state.review}` : "";

    const messages: ChatMessage[] = [
      { role: "system", content: CHALLENGE_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Title: ${meta.title}\narXiv: ${meta.arxivUrl}\n\n${paperMd}${existingReview}\n\n---\n**User challenge:** ${userPrompt}`,
      },
    ];

    for (let step = 0; step < CHALLENGE_MAX_STEPS; step++) {
      const result = await this.aiRun(messages, [FETCH_URL_TOOL]);
      if (!result.tool_calls?.length) return result.response ?? "";
      messages.push({ role: "assistant", content: result.response ?? "", tool_calls: result.tool_calls });
      for (const call of result.tool_calls) {
        messages.push({ role: "tool", content: await this.executeTool(call), tool_call_id: call.id });
      }
    }
    const final = await this.aiRun(messages);
    return final.response ?? "";
  }

  private async aiRun(messages: ChatMessage[], tools?: ToolDef[]): Promise<AiResponse> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await (this.env.AI.run as any)(MODEL, {
      messages, ...(tools ? { tools } : {}),
    });
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
    const cached = [...this.sql<{ value: string }>`SELECT value FROM meta WHERE key = 'paper_md'`][0];
    if (cached) return cached.value;
    const md = await this.fetchPaperMarkdown(meta);
    this.sql`INSERT OR REPLACE INTO meta (key, value) VALUES ('paper_md', ${md})`;
    return md;
  }

  private async fetchPaperMarkdown(meta: PaperMeta): Promise<string> {
    const sources: Array<{ url: string; mime: string; label: string }> = [
      { url: `https://arxiv.org/html/${meta.id}`, mime: "text/html", label: "arXiv HTML" },
      { url: `https://arxiv.org/pdf/${meta.id}`, mime: "application/pdf", label: "arXiv PDF" },
    ];

    const MAX_BODY = 30 * 1024 * 1024;

    for (const source of sources) {
      try {
        const res = await fetch(source.url, {
          headers: { "User-Agent": "arxlens/1.0 (https://arxlens.workers.dev)" },
          redirect: "follow",
        });
        if (!res.ok) { console.warn(`[${meta.id}] ${source.label}: HTTP ${res.status}`); continue; }

        const ct = res.headers.get("content-type") ?? "";
        if (source.mime === "application/pdf" && !ct.includes("application/pdf")) {
          console.warn(`[${meta.id}] ${source.label}: expected PDF, got "${ct}"`); continue;
        }

        const cl = parseInt(res.headers.get("content-length") ?? "0", 10);
        if (cl > MAX_BODY) { console.warn(`[${meta.id}] ${source.label}: too large (${cl})`); continue; }

        const buffer = await res.arrayBuffer();
        if (buffer.byteLength > MAX_BODY) { console.warn(`[${meta.id}] ${source.label}: body too large`); continue; }

        const ext = source.mime === "application/pdf" ? "pdf" : "html";
        const results = await this.env.AI.toMarkdown([{
          name: `paper.${ext}`, blob: new Blob([buffer], { type: source.mime }),
        }]);
        const result = Array.isArray(results) ? results[0] : results;
        if (result.format === "error") { console.warn(`[${meta.id}] ${source.label}: toMarkdown error`); continue; }
        if (!result.data || result.data.length < 5000) { console.warn(`[${meta.id}] ${source.label}: too short`); continue; }

        console.log(`[${meta.id}] ${source.label}: ${result.data.length} chars`);
        return result.data.slice(0, MAX_PAPER_CHARS);
      } catch (err) {
        console.warn(`[${meta.id}] ${source.label}: error —`, err);
      }
    }
    throw new Error(`[${meta.id}] could not retrieve paper text`);
  }

  private async fetchUrlAsMarkdown(url: string): Promise<string> {
    if (!url.startsWith("http://") && !url.startsWith("https://")) return "Error: only http/https URLs";
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "arxlens/1.0 (https://arxlens.workers.dev)" }, redirect: "follow",
      });
      if (!res.ok) return `Error: HTTP ${res.status}`;
      const ct = res.headers.get("content-type") ?? "";
      const buffer = await res.arrayBuffer();
      if (ct.includes("text/plain") || ct.includes("text/markdown")) {
        return new TextDecoder().decode(buffer).slice(0, MAX_FETCH_CHARS);
      }
      let mimeType = "text/html", fileName = "page.html";
      if (ct.includes("application/pdf")) { mimeType = "application/pdf"; fileName = "doc.pdf"; }
      else if (!ct.includes("text/html") && !ct.includes("application/xhtml")) {
        return `Cannot read content-type "${ct}".`;
      }
      const results = await this.env.AI.toMarkdown([{ name: fileName, blob: new Blob([buffer], { type: mimeType }) }]);
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
    this.sql`INSERT OR REPLACE INTO meta (key, value) VALUES ('review_messages', ${JSON.stringify(messages)})`;
  }
  private loadReviewMessages(): ChatMessage[] | null {
    const r = [...this.sql<{ value: string }>`SELECT value FROM meta WHERE key = 'review_messages'`][0];
    return r ? JSON.parse(r.value) as ChatMessage[] : null;
  }
  private clearReviewMessages(): void {
    this.sql`DELETE FROM meta WHERE key = 'review_messages'`;
  }

  private setMeta(meta: PaperMeta): void {
    this.sql`INSERT OR REPLACE INTO meta (key, value) VALUES ('paper', ${JSON.stringify(meta)})`;
    if (!this.state.id) this.setState({ ...this.state, id: meta.id });
  }
  private getMeta(): PaperMeta | null {
    const r = [...this.sql<{ value: string }>`SELECT value FROM meta WHERE key = 'paper'`][0];
    return r ? JSON.parse(r.value) as PaperMeta : null;
  }
  private getChallenges(): Challenge[] {
    return [...this.sql<Challenge>`SELECT id, user_prompt, ai_response, created_at FROM challenges ORDER BY created_at ASC`];
  }
}
