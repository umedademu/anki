CREATE TABLE IF NOT EXISTS study_time_events (
  event_id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  study_date TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  subject_title TEXT NOT NULL,
  deck_id TEXT NOT NULL,
  deck_title TEXT NOT NULL,
  dataset_version TEXT NOT NULL,
  study_mode TEXT NOT NULL CHECK (study_mode IN ('memorize', 'listen-answer')),
  question_id TEXT NOT NULL,
  study_seconds INTEGER NOT NULL CHECK (study_seconds BETWEEN 1 AND 30)
);

CREATE INDEX IF NOT EXISTS idx_study_time_events_study_date
  ON study_time_events(study_date DESC);

CREATE INDEX IF NOT EXISTS idx_study_time_events_summary
  ON study_time_events(study_date, subject_id, deck_id, study_mode);
