-- D1 schema: lightweight index for querying the feed across all papers

CREATE TABLE IF NOT EXISTS papers (
  id TEXT PRIMARY KEY,              -- arXiv ID, e.g. "2401.12345"
  title TEXT NOT NULL,
  authors TEXT NOT NULL,            -- JSON array of strings
  abstract TEXT NOT NULL,
  categories TEXT NOT NULL,         -- JSON array of strings, e.g. ["cs.AI","cs.LG"]
  published_at TEXT NOT NULL,       -- ISO 8601
  arxiv_url TEXT NOT NULL,
  pdf_url TEXT NOT NULL,
  votes_up INTEGER NOT NULL DEFAULT 0,
  votes_down INTEGER NOT NULL DEFAULT 0,
  review_status TEXT NOT NULL DEFAULT 'pending', -- pending | reviewing | done | error
  fetched_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_papers_votes ON papers(votes_up DESC, votes_down ASC);
CREATE INDEX IF NOT EXISTS idx_papers_published ON papers(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_papers_fetched ON papers(fetched_at DESC);

-- Categories to watch. Cron reads this on each run — editable without redeploy.
CREATE TABLE IF NOT EXISTS watched_categories (
  category TEXT PRIMARY KEY          -- e.g. "cs.AI", "stat.ML"
);

-- Seed defaults
INSERT OR IGNORE INTO watched_categories (category) VALUES
  ('cs.AI'), ('cs.LG'), ('cs.CL'), ('cs.CV'), ('stat.ML');

-- High-water mark per category: newest published_at we've successfully enqueued
CREATE TABLE IF NOT EXISTS cron_state (
  category TEXT PRIMARY KEY,
  newest_published_at TEXT NOT NULL  -- ISO 8601
);
