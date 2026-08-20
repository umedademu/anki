CREATE TABLE IF NOT EXISTS question_progress (
  question_id TEXT PRIMARY KEY,
  streak INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  remembered_count INTEGER NOT NULL DEFAULT 0,
  last_rating TEXT,
  last_answered_at TEXT,
  next_review_at TEXT,
  ever_mastered INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_question_progress_next_review
  ON question_progress(next_review_at);

CREATE TABLE IF NOT EXISTS review_settings (
  profile_id INTEGER PRIMARY KEY CHECK (profile_id = 1),
  again_seconds INTEGER NOT NULL,
  hard_seconds INTEGER NOT NULL,
  good_seconds INTEGER NOT NULL,
  easy_seconds INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
