CREATE TABLE question_progress_scoped (
  dataset_version TEXT NOT NULL,
  question_id TEXT NOT NULL,
  streak INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  remembered_count INTEGER NOT NULL DEFAULT 0,
  last_rating TEXT,
  last_answered_at TEXT,
  next_review_at TEXT,
  ever_mastered INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (dataset_version, question_id)
);

INSERT INTO question_progress_scoped (
  dataset_version, question_id, streak, attempts, remembered_count,
  last_rating, last_answered_at, next_review_at, ever_mastered, updated_at
)
SELECT
  'legacy', question_id, streak, attempts, remembered_count,
  last_rating, last_answered_at, next_review_at, ever_mastered, updated_at
FROM question_progress;

DROP TABLE question_progress;
ALTER TABLE question_progress_scoped RENAME TO question_progress;

CREATE INDEX idx_question_progress_next_review
  ON question_progress(dataset_version, next_review_at);
