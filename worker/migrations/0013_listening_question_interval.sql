ALTER TABLE review_settings
ADD COLUMN listening_question_interval_seconds REAL NOT NULL DEFAULT 0
CHECK (
  listening_question_interval_seconds >= 0
  AND listening_question_interval_seconds <= 60
);
