ALTER TABLE study_activity_events ADD COLUMN rating TEXT
  CHECK (rating IS NULL OR rating IN ('again', 'hard', 'good', 'easy'));

ALTER TABLE study_activity_events ADD COLUMN analysis_json TEXT;

CREATE INDEX IF NOT EXISTS idx_study_activity_events_analysis
  ON study_activity_events(study_date, subject_id, rating);
