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
| 自動起動のタスク・ログ | `Gonta-Autostart`・`%LOCALAPPDATA%\Gonta` | `AnkiAI-Autostart`・`%USERPROFILE%\.anki-ai\runtime` |
| 保存場所 | `%USERPROFILE%\.gonta` | `%USERPROFILE%\.anki-ai` |
| トンネル | gonta 用の cloudflared | この中継役が自分で起動する別の cloudflared |
| 会話ID | `claude-session.json` | 持たない（毎回1回だけ起動） |

gonta のファイルは使いません。

## 利用者がすること

初回だけ:

1. `ai-relay\setup.cmd` をダブルクリックします。
2. アプリの設定ページで登録している「Cloudflareのアクセスキー」を貼り付けて Enter を押します。
3. 「合言葉を作りますか？」と聞かれたら `y` を押し、ブラウザで Claude の「承認」を押して、表示された `sk-ant-oat…` を貼り付けます（PCのふだんの Claude ログインは約2週間で切れるため。作らなくても、ふだんのログインが有効な間は動きます）。
4. Codex のログイン状態が表示されます。「Logged in using ChatGPT」と出ていれば ChatGPT も使えます。
5. 「自動起動を登録しますか？」で Enter を押すと、自動起動を登録して、その場で中継役を起動します（次の節）。1分ほどでアプリの「AIに質問」が使えます。

PCがスリープ中・電源オフの時は使えません。アプリには「PCのAIに接続できません」と出ます。

## 自動起動（Windowsへのログイン時）

gonta の自動起動と同じ作りです。

- **登録するもの**：タスク スケジューラのタスク `AnkiAI-Autostart`（このWindowsユーザーのログオン時に起動。画面は出しません）。gonta の `Gonta-Autostart` とは別のタスクです。
- **動くもの**：タスクが `%USERPROFILE%\.anki-ai\runtime\Start-AnkiAI.ps1`（`autostart.ps1` の写し）を実行し、これが見張り役になって、中継役（`node ai-relay\main.mjs relay`）と専用のトンネル（`node ai-relay\main.mjs tunnel`。中で cloudflared を起動）を別々に動かし続けます。
- **落ちたとき**：見張り役が10秒後に起動し直します（起動して30秒以内に落ちたときは、設定や環境の問題とみなして60秒後）。トンネルの cloudflared が止まったときは、トンネル側が10秒後に起動し直します。タスク自体も、失敗したら1分おきに3回まで起動し直します。
- **置き場所**：起動ファイル・作業フォルダ・ログは `%USERPROFILE%\.anki-ai\runtime` に置きます。`%LOCALAPPDATA%` は使いません。Claude デスクトップ（MSIXでパッケージ化されたアプリ）から作ったフォルダは `%LOCALAPPDATA%\Packages\Claude_…\LocalCache\Local` に振り替えられ、タスク スケジューラから見えず、起動が 0x8007010B（ディレクトリ名が無効）で失敗するためです。
- **ログ**：`%USERPROFILE%\.anki-ai\runtime\` の `startup.log`・`relay.log`・`relay.err.log`・`tunnel.log`・`tunnel.err.log`（2MBを超えると `.previous` に回します）。

| したいこと | ダブルクリックするもの |
|---|---|
| 自動起動を登録する（その場で起動もする） | `ai-relay\install-autostart.cmd`（`setup.cmd` の最後でも登録できます） |
| 起動し直す（新しいプログラムや設定を読み込ませる） | `ai-relay\restart.cmd` |
| 自動起動を外す（動いているものも止める） | `ai-relay\uninstall-autostart.cmd` |
| 自動起動なしで手動で動かす | `ai-relay\start.cmd`（画面を閉じると止まります。自動起動で動いている間はポートが使用中と出ます） |

PowerShell で外すときは `Unregister-ScheduledTask -TaskName AnkiAI-Autostart -Confirm:$false` でも外せます（動いている中継役は別に止めてください）。登録は、worktree ではなく `C:\Users\USER\Desktop\anki` の `ai-relay` から行います。

## ファイル

- `main.mjs` — 起動。引数なしなら中継役とトンネルを両方、`relay` なら中継役だけ、`tunnel` ならトンネルだけを動かす。トンネルは接続先を Worker に登録し、終了時は登録を消す。
- `autostart.ps1` — 自動起動の見張り役。`install-autostart.ps1` / `.cmd` が登録し、`uninstall-autostart.ps1` / `.cmd` が外す。`restart.ps1` / `.cmd` で起動し直す。`stop-processes.ps1` はこの中継役のプロセスだけを止める共通部品。
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
