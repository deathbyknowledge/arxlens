-- D1 schema: lightweight index for querying the feed across all papers

CREATE TABLE IF NOT EXISTS papers_current (
  id TEXT PRIMARY KEY,              -- stable arXiv family ID, e.g. "2401.12345"
  version TEXT NOT NULL,            -- exact reviewed version, e.g. "v2"
  versioned_id TEXT NOT NULL,       -- exact reviewed paper ID, e.g. "2401.12345v2"
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
  intro TEXT NOT NULL DEFAULT '',               -- AI-generated plain-language intro (synced from DO)
  fetched_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_papers_current_votes ON papers_current(votes_up DESC, votes_down ASC);
CREATE INDEX IF NOT EXISTS idx_papers_current_published ON papers_current(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_papers_current_fetched ON papers_current(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_papers_current_versioned_id ON papers_current(versioned_id);

-- Categories to watch. Cron reads this on each run — editable without redeploy.
CREATE TABLE IF NOT EXISTS watched_categories (
  category TEXT PRIMARY KEY          -- e.g. "cs.AI", "stat.ML"
);

-- Seed defaults
INSERT OR IGNORE INTO watched_categories (category) VALUES
  ('cs.AI'), ('cs.LG'), ('cs.CL'), ('cs.CV'), ('stat.ML');

-- OAI-PMH harvest state per category: tracks the last successfully harvested date.
CREATE TABLE IF NOT EXISTS harvest_state (
  category TEXT PRIMARY KEY,
  last_harvest_date TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
