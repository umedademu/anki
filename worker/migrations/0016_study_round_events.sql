CREATE TABLE IF NOT EXISTS study_round_events (
  dataset_version TEXT NOT NULL,
  round_id TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  PRIMARY KEY (dataset_version, round_id)
);

CREATE INDEX IF NOT EXISTS idx_study_round_events_dataset
  ON study_round_events(dataset_version, completed_at);
