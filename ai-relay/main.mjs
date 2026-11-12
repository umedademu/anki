// 暗記アプリの「AIに質問」用の中継役。PCで動かし、Cloudflare Quick Tunnel で外からつなぐ。
// 起動：ai-relay\start.cmd をダブルクリック（または node ai-relay\main.mjs）。初回は ai-relay\setup.cmd で設定する。
// gonta とぶつからないよう、ポート（18920）・保存場所（%USERPROFILE%\.anki-ai）・トンネルは別にしている。
// 自動起動（autostart.ps1 が見張る）では、gonta と同じく中継役（引数 relay）とトンネル（引数 tunnel）を
// 別々のプロセスで動かす。引数なしなら両方を1つのプロセスで動かす（手動起動の start.cmd 用）。
import {spawn} from 'node:child_process';
import {existsSync, readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRelayServer} from './server.mjs';
import {loadOAuthToken, resolveClaude, resolveCodex} from './engines.mjs';

const stateDir = process.env.ANKI_AI_STATE_DIR || path.join(os.homedir(), '.anki-ai');
mkdirSync(stateDir, {recursive: true, mode: 0o700});
const configFile = path.join(stateDir, 'config.json');
const tokenFile = path.join(stateDir, 'claude-oauth-token.dpapi');
const urlFile = path.join(stateDir, 'tunnel-url.txt');
const port = Number(process.env.ANKI_AI_PORT || 18920);
const log = console;
const mode = ['relay', 'tunnel'].includes(process.argv[2]) ? process.argv[2] : 'both';
const runsRelay = mode !== 'tunnel';
const runsTunnel = mode !== 'relay' && process.env.ANKI_AI_NO_TUNNEL !== '1';

if (!existsSync(configFile)) {
  log.error(`設定がありません。先に ai-relay\\setup.cmd を実行してください（${configFile}）。`);
  process.exit(1);
}
const config = JSON.parse(readFileSync(configFile, 'utf8').replace(/^\uFEFF/, ''));
if (typeof config.accessKey !== 'string' || config.accessKey.length < 8) {
  log.error('設定にアクセスキーがありません。ai-relay\\setup.cmd を実行し直してください。');
  process.exit(1);
}
const workerUrl = config.workerUrl || 'https://anki-progress-api.umedademu.workers.dev';

// 合言葉の読み出しはPowerShellを使うので、10分ごとにだけ読み直す。
let token = null, tokenRead = 0;
const tokenLoader = () => {
  if (Date.now() - tokenRead > 600000) { token = loadOAuthToken(tokenFile, log); tokenRead = Date.now(); }
  return token;
};

const claude = {command: resolveClaude(), model: config.claude?.model ?? 'sonnet', effort: config.claude?.effort};
const codex = {target: resolveCodex(), model: config.codex?.model, effort: config.codex?.effort ?? 'low'};
const server = runsRelay ? createRelayServer({config, workDir: path.join(stateDir, 'work'), claude, codex, log, tokenLoader}) : null;
server?.on('error', (error) => {
  log.error(error.code === 'EADDRINUSE'
    ? `ポート ${port} はすでに使われています。自動起動で動いている時は ai-relay\\restart.cmd で起動し直してください。`
    : `中継役を起動できません: ${error.message}`);
  process.exit(1);
});
server?.listen(port, '127.0.0.1', () => {
  log.log(`AI中継役を起動しました（127.0.0.1:${port}）。Claude: ${claude.command ? 'あり' : 'なし'}（${tokenLoader() ? '1年有効の合言葉' : '通常のログイン'}）、Codex: ${codex.target ? 'あり' : 'なし'}`);
  if (runsTunnel) startTunnel();
});

// アプリが今の接続先を知れるよう、anki の Worker に登録する（既存のアクセスキーで認証）。
async function publish(url) {
  const response = await fetch(`${workerUrl}/v1/ai-relay`, {
    method: url ? 'PUT' : 'DELETE',
    headers: {Authorization: `Bearer ${config.accessKey}`, 'Content-Type': 'application/json'},
    body: url ? JSON.stringify({url}) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Worker への登録に失敗しました（${response.status}）`);
}

function resolveCloudflared(env = process.env) {
  if (env.ANKI_AI_CLOUDFLARED) return env.ANKI_AI_CLOUDFLARED;
  const candidates = process.platform === 'win32'
    ? [env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', 'cloudflared.exe'),
      path.join(env.ProgramFiles || 'C:\\Program Files', 'cloudflared', 'cloudflared.exe'),
      path.join(env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'cloudflared', 'cloudflared.exe')]
    : ['/usr/local/bin/cloudflared', '/usr/bin/cloudflared'];
  for (const candidate of candidates) if (candidate && existsSync(candidate)) return candidate;
  return 'cloudflared';
}

let tunnel = null, current = '', publishTimer = null, stopping = false;
function startTunnel() {
  if (!runsTunnel || stopping) return;
  current = '';
  // このPCではQUICが通らないことがあるため、gonta と同じく HTTP/2 を指定する。
  const child = tunnel = spawn(resolveCloudflared(), ['tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', `http://127.0.0.1:${port}`], {stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true});
  let buffer = '';
  const capture = (data) => {
    buffer = (buffer + data).slice(-10000);
    const match = buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match && !current) {
      current = match[0];
      writeFileSync(urlFile, current, {mode: 0o600});
      log.log('トンネルの接続先:', current);
      void sync();
    }
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.on('error', (error) => log.error('cloudflared を起動できません:', error.message));
  child.on('exit', (code) => {
    if (tunnel !== child) return;
    tunnel = null;
    if (stopping) return;
    log.error(`トンネルが止まりました（code ${code}）。10秒後に起動し直します。`);
    setTimeout(startTunnel, 10000);
  });
}

// 接続先を登録する。失敗しても30秒ごとに、成功後も10分ごとに登録し直す。
async function sync() {
  clearTimeout(publishTimer);
  if (!current) return;
  let delay = 600000;
  try {
    await publish(current);
    log.log('アプリへ接続先を知らせました。');
  } catch (error) {
    log.error(error.message);
    delay = 30000;
  }
  publishTimer = setTimeout(sync, delay);
}

async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearTimeout(publishTimer);
  if (runsTunnel) { try { await publish(null); } catch {} }
  try { tunnel?.kill(); } catch {}
  server?.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
// トンネルだけを動かす時（自動起動）は、すぐにトンネルを起動する。
if (!runsRelay) startTunnel();
