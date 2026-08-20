ALTER TABLE review_settings
  ADD COLUMN speech_source TEXT NOT NULL DEFAULT 'cloud';

ALTER TABLE review_settings
  ADD COLUMN azure_voice_id TEXT NOT NULL DEFAULT 'ja-JP-NanamiNeural';

ALTER TABLE review_settings
  ADD COLUMN device_voice_id TEXT NOT NULL DEFAULT '';

ALTER TABLE review_settings
  ADD COLUMN speech_rate REAL NOT NULL DEFAULT 1.0;

ALTER TABLE review_settings
  ADD COLUMN shuffle_enabled INTEGER NOT NULL DEFAULT 0;

ALTER TABLE review_settings
  ADD COLUMN auto_speech_enabled INTEGER NOT NULL DEFAULT 1;
