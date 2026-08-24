ALTER TABLE review_settings
  ADD COLUMN study_time_limit_seconds INTEGER NOT NULL DEFAULT 30
  CHECK (study_time_limit_seconds BETWEEN 1 AND 3600);

CREATE TABLE study_time_events_with_custom_limit (
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
  study_seconds INTEGER NOT NULL CHECK (study_seconds BETWEEN 1 AND 3600)
);

INSERT INTO study_time_events_with_custom_limit (
  event_id, occurred_at, study_date, subject_id, subject_title,
  deck_id, deck_title, dataset_version, study_mode, question_id,
  study_seconds
)
SELECT
  event_id, occurred_at, study_date, subject_id, subject_title,
  deck_id, deck_title, dataset_version, study_mode, question_id,
  study_seconds
FROM study_time_events;

DROP TABLE study_time_events;

ALTER TABLE study_time_events_with_custom_limit
  RENAME TO study_time_events;

CREATE INDEX IF NOT EXISTS idx_study_time_events_study_date
  ON study_time_events(study_date DESC);

CREATE INDEX IF NOT EXISTS idx_study_time_events_summary
  ON study_time_events(study_date, subject_id, deck_id, study_mode);
