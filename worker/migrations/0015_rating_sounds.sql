ALTER TABLE review_settings
  ADD COLUMN rating_sound_volume REAL NOT NULL DEFAULT 1.0
  CHECK (rating_sound_volume >= 0.25 AND rating_sound_volume <= 2.0);

ALTER TABLE review_settings
  ADD COLUMN rating_sounds_json TEXT NOT NULL DEFAULT '{"again":null,"hard":null,"good":null,"easy":null}';
