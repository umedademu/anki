-- 「AIに質問」の中継役（利用者のPC）の今の接続先。Quick Tunnel のURLは起動のたびに変わるため、中継役が登録する。
CREATE TABLE IF NOT EXISTS ai_relay (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  url TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
