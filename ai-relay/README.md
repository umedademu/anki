# AIに質問の中継役（ai-relay）

暗記アプリの学習画面にある「AIに質問」に、PCのサブスクで動く AI が答えるための中継役です。アプリ（Vercel）からの質問を受け取り、PCの Claude Code（`claude -p`）か Codex CLI（`codex exec`。ChatGPTでログイン済みのもの）に渡して、返事を少しずつ返します。

- **料金**：APIの従量課金は使いません。Claude はサブスクのログイン（または `claude setup-token` の1年有効な合言葉）、ChatGPT は Codex の ChatGPT ログインの利用枠を使います。追加の費用はかかりません。
- **AIにさせないこと**：Claude は `--tools ""`（ツールなし）・MCPなし・設定の読み込みなし・会話の保存なしで動かします。Codex は読み取り専用で、シェル・アプリ・ブラウザー・Web検索などを止め、利用者のCodex設定（全権限など）は読みません。どちらも質問に答えるだけです。
- **会話の扱い**：アプリが同じ問題の会話をまとめて毎回送ります。中継役は会話を保存しません。
- **前提文**：問題・答え・解説を入れ、日本語で簡潔に答えるよう指示します（`engines.mjs` の `systemPrompt`）。

## つながり方

1. 中継役は `127.0.0.1:18920` で待ち受け、Cloudflare Quick Tunnel（`cloudflared`）で外からつなぎます。
2. トンネルのURLは起動のたびに変わるため、中継役が anki の Worker（`/v1/ai-relay`）に登録します。アプリはそこからURLを受け取ります。
3. Worker への登録も、アプリから中継役への質問も、アプリの設定ページで登録している既存のアクセスキーで認証します。

## gonta とぶつからないように

| | gonta | この中継役 |
|---|---|---|
| ポート | 18890・18891 | 18920 |
| 保存場所 | `%USERPROFILE%\.gonta` | `%USERPROFILE%\.anki-ai` |
| トンネル | gonta 用の cloudflared | この中継役が自分で起動する別の cloudflared |
| 会話ID | `claude-session.json` | 持たない（毎回1回だけ起動） |

gonta のファイルは使いません。

## 利用者がすること

初回だけ:

1. `ai-relay\setup.cmd` をダブルクリックします。
2. アプリの設定ページで登録している「Cloudflareのアクセスキー」を貼り付けて Enter を押します。
3. 「合言葉を作りますか？」と聞かれたら `y` を押し、ブラウザで Claude の「承認」を押して、表示された `sk-ant-oat…` を貼り付けます（PCのふだんの Claude ログインは約2週間で切れるため。作らなくても、ふだんのログインが有効な間は動きます）。
4. 最後に Codex のログイン状態が表示されます。「Logged in using ChatGPT」と出ていれば ChatGPT も使えます。

使うとき:

1. `ai-relay\start.cmd` をダブルクリックします。黒い画面に「アプリへ接続先を知らせました。」と出たら準備完了です。
2. この画面を開いている間だけ「AIに質問」が使えます（最小化してかまいません。閉じると止まります）。
3. PCがスリープ中・電源オフの時は使えません。アプリには「PCのAIに接続できません」と出ます。

自動起動（Windowsへのログイン時に起動）は登録していません。必要になったら別途設定します。

## ファイル

- `main.mjs` — 起動。中継役とトンネルを動かし、接続先を Worker に登録する。終了時は登録を消す。
- `server.mjs` — 受け口（`/health`、`/v1/status`、`/v1/ask`）。アクセスキーと接続元を確かめ、同時に2件まで答える。
- `engines.mjs` — 前提文、claude・codex の起動設定、返事の読み取り。
- `setup.ps1` / `setup.cmd` — 初回設定（アクセスキー・Claudeの合言葉・Codexの確認）。
- `start.cmd` — 起動。
- 設定は `%USERPROFILE%\.anki-ai\config.json`（`accessKey`、`allowedOrigins`、`claude.model`（既定 `sonnet`）、`claude.effort`、`codex.model`、`codex.effort`（既定 `low`））。合言葉は `claude-oauth-token.dpapi`（このWindowsユーザーだけが読める暗号化）。どちらも共有・コミットしないでください。

## 確かめ方

```
node scripts/test-ai-relay.mjs
```

偽の claude・codex で、内容の確かめ・前提文・起動設定・認証・少しずつの返事・Worker の登録を確かめます。
