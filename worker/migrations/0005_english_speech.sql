ALTER TABLE review_settings
  ADD COLUMN english_azure_voice_id TEXT NOT NULL DEFAULT 'en-US-JennyNeural';

ALTER TABLE review_settings
  ADD COLUMN english_device_voice_id TEXT NOT NULL DEFAULT '';
