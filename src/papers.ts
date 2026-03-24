import type { PaperMeta } from "./types";

export const PAPERS_TABLE = "papers_current";

export interface ParsedArxivId {
  baseId: string;
  version: string | null;
  versionedId: string;
}

type LegacyPaperRow = {
  id: string;
  title: string;
  authors: string;
  abstract: string;
  categories: string;
  published_at: string;
  arxiv_url: string;
  pdf_url: string;
  votes_up: number;
  votes_down: number;
  review_status: string;
  intro: string;
  fetched_at: number;
  version?: string;
  versioned_id?: string;
};

type MigratedPaperRow = {
  id: string;
  version: string;
  versioned_id: string;
  title: string;
  authors: string;
  abstract: string;
  categories: string;
  published_at: string;
  arxiv_url: string;
  pdf_url: string;
  votes_up: number;
  votes_down: number;
  review_status: string;
  intro: string;
  fetched_at: number;
};

let paperStoreReady: Promise<void> | null = null;

export function composeVersionedId(baseId: string, version?: string | null): string {
  return version ? `${baseId}${version}` : baseId;
}

export function parseArxivId(value: string | null | undefined): ParsedArxivId | null {
  const candidate = String(value ?? "").trim();
  if (!candidate) return null;

  const modern = candidate.match(/^(\d{4}\.\d{4,5})(v\d+)?$/i);
  if (modern) {
    const version = modern[2]?.toLowerCase() ?? null;
    return {
      baseId: modern[1],
      version,
      versionedId: composeVersionedId(modern[1], version),
    };
  }

  const legacy = candidate.match(/^([a-z-]+(?:\.[a-z-]+)?\/\d{7})(v\d+)?$/i);
  if (legacy) {
    const version = legacy[2]?.toLowerCase() ?? null;
    return {
      baseId: legacy[1],
      version,
      versionedId: composeVersionedId(legacy[1], version),
    };
  }

  return null;
}

export function compareArxivVersions(left: string | null | undefined, right: string | null | undefined): number {
  const leftValue = parseVersionNumber(left);
  const rightValue = parseVersionNumber(right);
  return leftValue - rightValue;
}

export function normalizePaperMeta(meta: PaperMeta): PaperMeta {
  const parsed =
    parseArxivId(meta.versionedId) ??
    parseArxivId(meta.id) ??
    parseArxivId(extractArxivIdFromUrl(meta.arxivUrl) ?? "") ??
    parseArxivId(extractArxivIdFromUrl(meta.pdfUrl) ?? "");

  const baseId = parsed?.baseId ?? meta.id;
  const version = normalizeVersion(meta.version ?? parsed?.version ?? "v1");
  const versionedId = meta.versionedId
    ? composeVersionedId(baseId, normalizeVersion(meta.version ?? parsed?.version ?? version))
    : composeVersionedId(baseId, version);

  return {
    ...meta,
    id: baseId,
    version,
    versionedId,
    arxivUrl: `https://arxiv.org/abs/${versionedId}`,
    pdfUrl: `https://arxiv.org/pdf/${versionedId}`,
  };
}

export async function ensurePaperStore(db: D1Database): Promise<void> {
  if (!paperStoreReady) {
    paperStoreReady = ensurePaperStoreImpl(db).catch((err) => {
      paperStoreReady = null;
      throw err;
    });
  }

  return paperStoreReady;
}

async function ensurePaperStoreImpl(db: D1Database): Promise<void> {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS ${PAPERS_TABLE} (
      id TEXT PRIMARY KEY,
      version TEXT NOT NULL,
      versioned_id TEXT NOT NULL,
      title TEXT NOT NULL,
      authors TEXT NOT NULL,
      abstract TEXT NOT NULL,
      categories TEXT NOT NULL,
      published_at TEXT NOT NULL,
      arxiv_url TEXT NOT NULL,
      pdf_url TEXT NOT NULL,
      votes_up INTEGER NOT NULL DEFAULT 0,
      votes_down INTEGER NOT NULL DEFAULT 0,
      review_status TEXT NOT NULL DEFAULT 'pending',
      intro TEXT NOT NULL DEFAULT '',
      fetched_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`
  ).run();

  await db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_${PAPERS_TABLE}_votes ON ${PAPERS_TABLE}(votes_up DESC, votes_down ASC)`
  ).run();
  await db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_${PAPERS_TABLE}_published ON ${PAPERS_TABLE}(published_at DESC)`
  ).run();
  await db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_${PAPERS_TABLE}_fetched ON ${PAPERS_TABLE}(fetched_at DESC)`
  ).run();
  await db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_${PAPERS_TABLE}_versioned_id ON ${PAPERS_TABLE}(versioned_id)`
  ).run();

  const hasRows = await db.prepare(`SELECT COUNT(*) as n FROM ${PAPERS_TABLE}`)
    .first<{ n: number }>();
  if ((hasRows?.n ?? 0) > 0) return;

  const legacyTable = await db.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'papers'`
  ).first<{ name: string }>();
  if (!legacyTable) return;

  const legacyRows = await db.prepare(
    `SELECT id, title, authors, abstract, categories, published_at, arxiv_url, pdf_url, votes_up, votes_down, review_status, intro, fetched_at FROM papers`
  ).all<LegacyPaperRow>();

  if (legacyRows.results.length === 0) return;

  const grouped = new Map<string, MigratedPaperRow>();

  for (const row of legacyRows.results) {
    const migrated = migrateLegacyPaperRow(row);
    const existing = grouped.get(migrated.id);

    if (!existing) {
      grouped.set(migrated.id, migrated);
      continue;
    }

    const preferred = compareMigratedRows(migrated, existing) > 0 ? migrated : existing;
    grouped.set(migrated.id, {
      ...preferred,
      votes_up: existing.votes_up + migrated.votes_up,
      votes_down: existing.votes_down + migrated.votes_down,
      fetched_at: Math.max(existing.fetched_at, migrated.fetched_at),
    });
  }

  for (const row of grouped.values()) {
    await db.prepare(
      `INSERT OR REPLACE INTO ${PAPERS_TABLE}
        (id, version, versioned_id, title, authors, abstract, categories, published_at, arxiv_url, pdf_url, votes_up, votes_down, review_status, intro, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      row.id,
      row.version,
      row.versioned_id,
      row.title,
      row.authors,
      row.abstract,
      row.categories,
      row.published_at,
      row.arxiv_url,
      row.pdf_url,
      row.votes_up,
      row.votes_down,
      row.review_status,
      row.intro,
      row.fetched_at,
    ).run();
  }
}

function migrateLegacyPaperRow(row: LegacyPaperRow): MigratedPaperRow {
  const meta = normalizePaperMeta({
    id: row.id,
    version: row.version ?? "v1",
    versionedId: row.versioned_id ?? row.id,
    title: row.title,
    authors: safeJsonArray(row.authors),
    abstract: row.abstract,
    categories: safeJsonArray(row.categories),
    publishedAt: row.published_at,
    arxivUrl: row.arxiv_url,
    pdfUrl: row.pdf_url,
  });

  return {
    id: meta.id,
    version: meta.version,
    versioned_id: meta.versionedId,
    title: row.title,
    authors: JSON.stringify(meta.authors),
    abstract: row.abstract,
    categories: JSON.stringify(meta.categories),
    published_at: row.published_at,
    arxiv_url: meta.arxivUrl,
    pdf_url: meta.pdfUrl,
    votes_up: row.votes_up ?? 0,
    votes_down: row.votes_down ?? 0,
    review_status: row.review_status ?? "pending",
    intro: row.intro ?? "",
    fetched_at: row.fetched_at ?? 0,
  };
}

function compareMigratedRows(left: MigratedPaperRow, right: MigratedPaperRow): number {
  const statusDiff = reviewStatusRank(left.review_status) - reviewStatusRank(right.review_status);
  if (statusDiff !== 0) return statusDiff;

  const versionDiff = compareArxivVersions(left.version, right.version);
  if (versionDiff !== 0) return versionDiff;

  return left.fetched_at - right.fetched_at;
}

function reviewStatusRank(status: string): number {
  if (status === "done") return 4;
  if (status === "reviewing") return 3;
  if (status === "pending") return 2;
  return 1;
}

function parseVersionNumber(version: string | null | undefined): number {
  const match = version?.match(/^v(\d+)$/i);
  return match ? parseInt(match[1], 10) : 0;
}

function normalizeVersion(version: string | null | undefined): string {
  const match = version?.match(/^v(\d+)$/i);
  return match ? `v${parseInt(match[1], 10)}` : "v1";
}

function extractArxivIdFromUrl(url: string | undefined): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/^\/(?:abs|pdf|html)\/(.+)$/);
    if (!match) return null;
    return match[1].replace(/\.pdf$/i, "");
  } catch {
    return null;
  }
}

function safeJsonArray(raw: string): string[] {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.map((entry) => String(entry)) : [];
  } catch {
    return [];
  }
}
