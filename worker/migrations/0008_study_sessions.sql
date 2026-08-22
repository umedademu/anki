CREATE TABLE IF NOT EXISTS study_sessions (
  dataset_version TEXT PRIMARY KEY,
  session_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_study_sessions_updated_at
  ON study_sessions(updated_at);
