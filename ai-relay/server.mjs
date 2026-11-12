// 中継役の受け口。アプリ（Vercel）からの質問を、アクセスキーで確かめてから Claude か Codex に渡し、
// 返事を1行ずつのJSON（NDJSON）で少しずつ返す。
import http from 'node:http';
import {createHash, timingSafeEqual} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {
  claudeArguments, claudeEnvironment, codexArguments, codexEnvironment, conversationText, describeFailure,
  normalizeAsk, runClaude, runCodex, systemPrompt,
} from './engines.mjs';

const TURN_LIMIT = 3 * 60000;
const MAX_RUNNING = 2;
const PING_INTERVAL = 10000;

const digest = (value) => createHash('sha256').update(String(value)).digest();
export function sameKey(supplied, expected) {
  if (!supplied || !expected) return false;
  return timingSafeEqual(digest(supplied), digest(expected));
}

// 本番のアプリと、手元での確認用の画面だけを許す。
export function allowedOrigin(origin, allowed = []) {
  if (!origin) return false;
  if (allowed.includes(origin)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

export function createRelayServer({config, workDir, claude, codex, log = console, spawnImpl, tokenLoader = () => null}) {
  mkdirSync(workDir, {recursive: true});
  let running = 0;
  const allowed = config.allowedOrigins ?? ['https://anki-ume.vercel.app'];
  const limiter = {count: 0, until: 0};

  function headers(req, extra = {}) {
    const out = {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin', ...extra};
    const origin = req.headers.origin;
    if (allowedOrigin(origin, allowed)) {
      out['Access-Control-Allow-Origin'] = origin;
      out['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
      out['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
      out['Access-Control-Max-Age'] = '86400';
    }
    return out;
  }
  const json = (req, res, status, payload) => {
    res.writeHead(status, headers(req, {'Content-Type': 'application/json; charset=utf-8'}));
    res.end(JSON.stringify(payload));
  };
  const authorized = (req) => {
    const value = req.headers.authorization ?? '';
    return value.startsWith('Bearer ') && sameKey(value.slice(7), config.accessKey);
  };

  async function readBody(req, max = 120000) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > max) throw Object.assign(new Error('質問が長すぎます。'), {status: 413});
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  function startRun(ask) {
    const system = systemPrompt(ask.context);
    const input = conversationText(ask.messages);
    if (ask.service === 'claude') {
      if (!claude.command) return {error: 'PCに Claude Code（claude）が見つかりません。'};
      return {run: (on) => runClaude({
        command: claude.command, args: claudeArguments({system, model: claude.model, effort: claude.effort}),
        cwd: workDir, input, env: claudeEnvironment(process.env, tokenLoader()), spawnImpl,
      }, on)};
    }
    if (!codex.target) return {error: 'PCに Codex CLI（codex）が見つかりません。'};
    return {run: (on) => runCodex({
      target: codex.target, args: codexArguments({model: codex.model, effort: codex.effort}),
      cwd: workDir, input: system + '\n\n' + input, env: codexEnvironment(process.env), spawnImpl,
    }, on)};
  }

  async function ask(req, res) {
    let ask;
    try {
      ask = normalizeAsk(JSON.parse(await readBody(req)));
    } catch (error) {
      json(req, res, error.status ?? 400, {error: error.status ? error.message : '質問の形式が正しくありません。'});
      return;
    }
    if (ask.error) { json(req, res, 400, {error: ask.error}); return; }
    const now = Date.now();
    if (limiter.until < now) { limiter.count = 0; limiter.until = now + 60000; }
    if (++limiter.count > 20) { json(req, res, 429, {error: '質問が多すぎます。少し待ってから聞いてください。'}); return; }
    if (running >= MAX_RUNNING) { json(req, res, 429, {error: '前の質問に答えています。少し待ってから聞いてください。'}); return; }
    const prepared = startRun(ask);
    if (prepared.error) { json(req, res, 503, {error: prepared.error}); return; }

    running += 1;
    res.writeHead(200, headers(req, {'Content-Type': 'application/x-ndjson; charset=utf-8', 'X-Accel-Buffering': 'no'}));
    const write = (payload) => { if (!res.writableEnded) res.write(JSON.stringify(payload) + '\n'); };
    write({type: 'start', service: ask.service});
    // 最初の文字が出るまでの間もつながりを保つ（トンネルが無通信で切らないように）。
    const ping = setInterval(() => write({type: 'ping'}), PING_INTERVAL);
    let lastText = '', finished = false;
    const handle = prepared.run({text: (text) => { lastText = text; write({type: 'delta', text}); }});
    const timer = setTimeout(() => { if (!finished) { handle.kill(); log.error('AI turn timed out'); } }, TURN_LIMIT);
    // アプリ側で閉じたり通信が切れたりしたら、途中でも止める。
    res.on('close', () => { if (!finished) handle.kill(); });
    const result = await handle.done.catch((error) => ({ok: false, text: lastText, detail: error.message}));
    finished = true;
    clearInterval(ping);
    clearTimeout(timer);
    running -= 1;
    if (result.ok) write({type: 'done', text: result.text});
    else {
      log.error(`AI (${ask.service}) failed:`, String(result.detail).replace(/\s+/g, ' ').slice(0, 300));
      write({type: 'error', message: describeFailure(ask.service, result.detail)});
    }
    res.end();
  }

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'OPTIONS') {
        if (!allowedOrigin(req.headers.origin, allowed)) { json(req, res, 403, {error: '許可されていない接続元です。'}); return; }
        res.writeHead(204, headers(req));
        res.end();
        return;
      }
      if (url.pathname === '/health' && req.method === 'GET') {
        json(req, res, 200, {service: 'anki-ai-relay', ok: true});
        return;
      }
      if (!authorized(req)) { json(req, res, 401, {error: 'アクセスキーが正しくありません。'}); return; }
      if (url.pathname === '/v1/status' && req.method === 'GET') {
        json(req, res, 200, {ok: true, services: {claude: Boolean(claude.command), codex: Boolean(codex.target)}});
        return;
      }
      if (url.pathname === '/v1/ask' && req.method === 'POST') { await ask(req, res); return; }
      json(req, res, 404, {error: '該当する処理がありません。'});
    } catch (error) {
      log.error('Relay error:', error.message);
      if (!res.headersSent) json(req, res, 500, {error: '中継役で問題が起きました。'});
      else res.end();
    }
  });
}
