ALTER TABLE review_settings
  ADD COLUMN speech_parts_json TEXT NOT NULL DEFAULT '{"history":{"question":true,"answer":true,"mnemonic":true,"explanation":false},"vocabulary":{"word":true,"meaning":true,"exampleEnglish":false,"exampleJapanese":false}}';
