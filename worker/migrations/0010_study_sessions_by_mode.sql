CREATE TABLE IF NOT EXISTS study_sessions_by_mode (
  dataset_version TEXT NOT NULL,
  study_mode TEXT NOT NULL CHECK (study_mode IN ('memorize', 'listen-answer')),
  session_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (dataset_version, study_mode)
);

INSERT OR REPLACE INTO study_sessions_by_mode (
  dataset_version, study_mode, session_json, updated_at
)
SELECT
  dataset_version,
  CASE
    WHEN json_extract(session_json, '$.studyMode') = 'listen-answer'
      THEN 'listen-answer'
    ELSE 'memorize'
  END,
  session_json,
  updated_at
FROM study_sessions;

CREATE INDEX IF NOT EXISTS idx_study_sessions_by_mode_updated_at
  ON study_sessions_by_mode(updated_at);
