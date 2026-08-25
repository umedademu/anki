ALTER TABLE review_settings
ADD COLUMN study_routine_overtime_seconds INTEGER NOT NULL DEFAULT 600
CHECK (
  study_routine_overtime_seconds >= 0
  AND study_routine_overtime_seconds <= 86400
);
