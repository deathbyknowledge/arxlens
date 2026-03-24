/**
 * Shared types for arxlens.
 */

/** Row shape in D1 `papers` table */
export interface PaperRow {
  id: string;
  title: string;
  authors: string;      // JSON string: string[]
  abstract: string;
  categories: string;   // JSON string: string[]
  published_at: string; // ISO 8601
  arxiv_url: string;
  pdf_url: string;
  votes_up: number;
  votes_down: number;
  review_status: "pending" | "reviewing" | "done" | "error";
  intro: string;        // AI-generated plain-language intro (synced from DO)
  fetched_at: number;   // unix epoch
}

/** State synced into the PaperAgent DO via setState() */
export interface ReviewCitation {
  source: string;
  locator: string;
  quote: string;
  url?: string;
}

export interface ReviewSectionData {
  key: string;
  title: string;
  body: string;
  citations: ReviewCitation[];
}

export interface ReviewData {
  intro: string;
  sections: ReviewSectionData[];
}

export type ChallengeStance =
  | "agree"
  | "partially_agree"
  | "disagree"
  | "inconclusive";

export interface ChallengeData {
  stance: ChallengeStance;
  summary: string;
  sections: ReviewSectionData[];
}

export interface PaperState {
  id: string;
  reviewStatus: "pending" | "reviewing" | "done" | "error";
  intro: string;    // plain-language introduction
  review: string;   // critical AI review
  reviewData: ReviewData | null;
  votesUp: number;
  votesDown: number;
}

/** Row from the challenges SQLite table inside the PaperAgent DO */
export interface Challenge {
  id: number;
  user_prompt: string;
  ai_response: string;
  response_data: ChallengeData | null;
  status: "pending" | "running" | "done" | "error";
  created_at: number; // unix epoch
}

/** Minimal paper metadata stored in the DO */
export interface PaperMeta {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  categories: string[];
  publishedAt: string;
  arxivUrl: string;
  pdfUrl: string;
}

export interface QueueMessage {
  paperId: string;
  meta: PaperMeta
}
