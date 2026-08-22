ALTER TABLE review_settings
  ADD COLUMN setup_preferences_json TEXT NOT NULL DEFAULT '{"schemaVersion":1,"lastSubjectId":"","subjects":{}}';
