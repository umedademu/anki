// 「AIに質問」の中継役（ai-relay）を、本物の claude・codex を動かさずに確かめる。
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import os from "node:os";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import {
  claudeArguments, claudeEnvironment, codexArguments, codexEnvironment, conversationText, describeFailure,
  normalizeAsk, systemPrompt,
} from "../ai-relay/engines.mjs";
import { allowedOrigin, createRelayServer, sameKey } from "../ai-relay/server.mjs";
import worker, { aiRelayUrlPattern } from "../worker/src/index.js";

const context = { prompt: "アラブの大征服で領土を失った帝国は？", answer: "ビザンツ帝国", explanation: "首都はコンスタンティノープル。" };

// 届いた内容の確かめ方。
assert.equal(normalizeAsk({ service: "gemini", context, messages: [{ role: "user", text: "x" }] }).error, "AIの種類が正しくありません。");
assert.ok(normalizeAsk({ service: "claude", context: { prompt: "", answer: "a" }, messages: [{ role: "user", text: "x" }] }).error);
assert.ok(normalizeAsk({ service: "claude", context, messages: [{ role: "assistant", text: "x" }] }).error);
assert.ok(normalizeAsk({ service: "claude", context, messages: [{ role: "user", text: "x".repeat(4001) }] }).error);
assert.ok(normalizeAsk({ service: "claude", context, messages: Array.from({ length: 25 }, () => ({ role: "user", text: "x" })) }).error);
const ask = normalizeAsk({ service: "codex", context, messages: [{ role: "user", text: " 東ローマの事？ " }, { role: "assistant", text: "はい。" }, { role: "user", text: "首都は？" }] });
assert.equal(ask.service, "codex");
assert.deepEqual(ask.messages.map((m) => m.text), ["東ローマの事？", "はい。", "首都は？"]);

// 前提文には問題・答え・解説と、日本語で簡潔に答える指示を入れる。解説がなければ省く。
const system = systemPrompt(context);
for (const part of ["問題：アラブの大征服で領土を失った帝国は？", "答え：ビザンツ帝国", "解説：首都はコンスタンティノープル。", "日本語で、簡潔に", "コマンドの実行"]) assert.ok(system.includes(part), part);
assert.ok(!systemPrompt({ ...context, explanation: "" }).includes("解説："));
assert.equal(conversationText([{ role: "user", text: "Q" }]), "Q");
assert.equal(conversationText(ask.messages), "これまでの会話（古い順）：\n利用者：東ローマの事？\nあなた：はい。\n\n今回の質問：首都は？");

// Claude はツールなし・MCPなし・保存なし。APIキーやほかの Claude Code の身元は渡さない。
const claudeArgs = claudeArguments({ system: "S", model: "sonnet" });
assert.equal(claudeArgs[claudeArgs.indexOf("--tools") + 1], "");
for (const flag of ["--strict-mcp-config", "--no-session-persistence", "--disable-slash-commands", "-p"]) assert.ok(claudeArgs.includes(flag), flag);
assert.equal(claudeArgs[claudeArgs.indexOf("--system-prompt") + 1], "S");
assert.ok(!claudeArgs.includes("--dangerously-skip-permissions"));
const claudeEnv = claudeEnvironment({ PATH: "p", ANTHROPIC_API_KEY: "k", CLAUDECODE: "1", CLAUDE_CODE_ENTRYPOINT: "x", BOT_CLAUDE_API_KEY: "b" }, "tok");
assert.deepEqual(Object.keys(claudeEnv).filter((k) => /ANTHROPIC|BOT_CLAUDE|CLAUDECODE|ENTRYPOINT/.test(k)), []);
assert.equal(claudeEnv.CLAUDE_CODE_OAUTH_TOKEN, "tok");
assert.equal(claudeEnvironment({ PATH: "p" }).CLAUDE_CODE_OAUTH_TOKEN, undefined);
// Codex は読み取り専用で、シェルなどを止め、利用者の全権限の設定を読まない。
const codexArgs = codexArguments({});
for (const flag of ["--ephemeral", "--ignore-user-config", "--skip-git-repo-check", "read-only", 'approval_policy="never"', 'web_search="disabled"']) assert.ok(codexArgs.includes(flag), flag);
for (const feature of ["shell_tool", "unified_exec", "apps", "plugins", "browser_use", "computer_use"]) {
  assert.ok(codexArgs.some((arg, index) => arg === feature && codexArgs[index - 1] === "--disable"), feature);
}
assert.ok(!codexArgs.includes("danger-full-access") && !codexArgs.includes("workspace-write"));
assert.equal(codexEnvironment({ OPENAI_API_KEY: "x", CLAUDE_CODE_OAUTH_TOKEN: "y", PATH: "p" }).PATH, "p");
assert.deepEqual(Object.keys(codexEnvironment({ OPENAI_API_KEY: "x", CLAUDE_CODE_OAUTH_TOKEN: "y" })), []);
assert.match(describeFailure("claude", "You've hit your usage limit"), /利用上限/);
assert.match(describeFailure("claude", "Not logged in · Please run /login"), /setup\.cmd/);
assert.match(describeFailure("codex", "401 Unauthorized"), /codex login/);
assert.ok(sameKey("abc", "abc") && !sameKey("abc", "abd") && !sameKey("", "abc"));
assert.ok(allowedOrigin("https://anki-ume.vercel.app", ["https://anki-ume.vercel.app"]));
assert.ok(allowedOrigin("http://127.0.0.1:4173", []));
assert.ok(!allowedOrigin("https://evil.example", ["https://anki-ume.vercel.app"]));

// 偽の claude・codex。受け取った入力を記録し、決まった出力を返す。
const spawned = [];
function fakeSpawn(command, args, options) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  let input = "";
  child.stdin = new Writable({ write(chunk, _encoding, callback) { input += chunk; callback(); } });
  child.pid = 0;
  child.kill = () => { child.killed = true; };
  const record = { command, args, options, child, get input() { return input; } };
  spawned.push(record);
  child.stdin.on("finish", () => setTimeout(() => {
    const lines = (command === "claude.exe")
      ? input.includes("失敗させて")
        ? [{ type: "result", subtype: "error_during_execution", is_error: true, result: "You've hit your usage limit" }]
        : [
            { type: "system", subtype: "init", tools: [] },
            { type: "stream_event", event: { type: "content_block_start", content_block: { type: "text" } } },
            { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "はい、" } } },
            { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "東ローマ帝国です。" } } },
            { type: "stream_event", event: { type: "content_block_stop" } },
            { type: "result", subtype: "success", is_error: false, result: "はい、東ローマ帝国です。" },
          ]
      : [
          { type: "thread.started", thread_id: "t" },
          { type: "item.completed", item: { type: "agent_message", text: "首都はコンスタンティノープルです。" } },
          { type: "turn.completed" },
        ];
    for (const line of lines) child.stdout.write(JSON.stringify(line) + "\n");
    child.stdout.end();
    child.stderr.end();
    setTimeout(() => child.emit("close", 0), 5);
  }, 5));
  return child;
}

const workDir = mkdtempSync(path.join(os.tmpdir(), "anki-ai-relay-test-"));
const errors = [];
const server = createRelayServer({
  config: { accessKey: "test-access-key", allowedOrigins: ["https://anki-ume.vercel.app"] },
  workDir, claude: { command: "claude.exe", model: "sonnet" }, codex: { target: "codex.exe", effort: "low" },
  log: { log() {}, error: (...args) => errors.push(args.join(" ")) }, spawnImpl: fakeSpawn, tokenLoader: () => "oauth-token",
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const origin = "https://anki-ume.vercel.app";
async function askRelay(body, key = "test-access-key") {
  const response = await fetch(`${base}/v1/ask`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body) });
  const text = await response.text();
  return { response, events: response.headers.get("content-type")?.includes("ndjson") ? text.trim().split("\n").map((line) => JSON.parse(line)) : JSON.parse(text) };
}
try {
  assert.equal((await fetch(`${base}/health`)).status, 200);
  const preflight = await fetch(`${base}/v1/ask`, { method: "OPTIONS", headers: { Origin: origin } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
  assert.equal((await fetch(`${base}/v1/ask`, { method: "OPTIONS", headers: { Origin: "https://evil.example" } })).status, 403);
  // アクセスキーが違えば答えない。
  const denied = await askRelay({ service: "claude", context, messages: [{ role: "user", text: "Q" }] }, "wrong");
  assert.equal(denied.response.status, 401);
  assert.equal(spawned.length, 0);
  assert.equal((await fetch(`${base}/v1/status`, { headers: { Authorization: "Bearer test-access-key" } }).then((r) => r.json())).services.codex, true);

  // Claude：少しずつ返し、最後に全文を返す。前提文と質問が渡り、合言葉は環境にだけ入る。
  const claude = await askRelay({ service: "claude", context, messages: [{ role: "user", text: "ビザンツ帝国って東ローマの事ですよね？" }] });
  assert.equal(claude.response.status, 200);
  assert.equal(claude.response.headers.get("access-control-allow-origin"), origin);
  assert.deepEqual(claude.events.map((e) => e.type), ["start", "delta", "delta", "delta", "done"]);
  assert.equal(claude.events.at(-1).text, "はい、東ローマ帝国です。");
  const claudeRun = spawned.at(-1);
  assert.equal(claudeRun.input, "ビザンツ帝国って東ローマの事ですよね？");
  assert.ok(claudeRun.args[claudeRun.args.indexOf("--system-prompt") + 1].includes("答え：ビザンツ帝国"));
  assert.equal(claudeRun.options.env.CLAUDE_CODE_OAUTH_TOKEN, "oauth-token");
  assert.equal(claudeRun.options.cwd, workDir);
  assert.ok(!claudeRun.args.includes("oauth-token"));

  // ChatGPT（Codex）：前提文と会話をまとめて渡す。
  const codex = await askRelay({ service: "codex", context, messages: [{ role: "user", text: "東ローマ？" }, { role: "assistant", text: "はい。" }, { role: "user", text: "首都は？" }] });
  assert.deepEqual(codex.events.map((e) => e.type), ["start", "delta", "done"]);
  assert.equal(codex.events.at(-1).text, "首都はコンスタンティノープルです。");
  const codexRun = spawned.at(-1);
  assert.equal(codexRun.command, "codex.exe");
  assert.ok(codexRun.input.startsWith("あなたは、高校生向けの暗記学習アプリ"));
  assert.ok(codexRun.input.endsWith("今回の質問：首都は？"));
  assert.equal(codexRun.options.env.CLAUDE_CODE_OAUTH_TOKEN, undefined);

  // 失敗は分かりやすい説明で返す。
  const failed = await askRelay({ service: "claude", context, messages: [{ role: "user", text: "失敗させて" }] });
  assert.equal(failed.events.at(-1).type, "error");
  assert.match(failed.events.at(-1).message, /利用上限/);
  // 形式違いは起動しない。
  const count = spawned.length;
  const bad = await askRelay({ service: "claude", context, messages: [] });
  assert.equal(bad.response.status, 400);
  assert.equal(spawned.length, count);
} finally {
  server.close();
}

// Worker：接続先の登録と読み出し。Quick Tunnel のURLだけを受け付け、アクセスキーが必要。
assert.ok(aiRelayUrlPattern.test("https://a-b-c.trycloudflare.com"));
assert.ok(!aiRelayUrlPattern.test("https://a.trycloudflare.com.evil.example"));
const rows = new Map();
const db = {
  prepare(sql) {
    let values = [];
    const statement = {
      bind(...args) { values = args; return statement; },
      async run() {
        if (sql.startsWith("INSERT INTO ai_relay")) rows.set(1, { url: values[0], updated_at: values[1] });
        if (sql.startsWith("DELETE FROM ai_relay")) rows.delete(1);
        return { success: true };
      },
      async first() { return sql.startsWith("SELECT url") ? rows.get(1) ?? null : null; },
    };
    return statement;
  },
};
const env = { SYNC_TOKEN: "test-access-key", ALLOWED_ORIGIN: origin, DB: db };
const call = (method, body, key = "test-access-key") => worker.fetch(new Request("https://worker.test/v1/ai-relay", {
  method, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Origin: origin }, ...(body ? { body: JSON.stringify(body) } : {}),
}), env).then(async (response) => ({ status: response.status, body: await response.json() }));
assert.equal((await call("GET", null, "wrong")).status, 401);
assert.deepEqual((await call("GET")).body, { url: null, updatedAt: null });
assert.equal((await call("PUT", { url: "https://evil.example" })).status, 400);
assert.equal((await call("PUT", { url: "https://abc-def.trycloudflare.com" })).status, 200);
assert.equal((await call("GET")).body.url, "https://abc-def.trycloudflare.com");
assert.equal((await call("DELETE")).status, 200);
assert.equal((await call("GET")).body.url, null);
assert.deepEqual(errors.filter((e) => !e.includes("failed")), []);
console.log("AI中継役：内容の確かめ・前提文・ツールなしの起動設定・アクセスキー・接続元・Claude/Codexの少しずつの返事・失敗の説明・Workerの接続先登録を確認しました。");
