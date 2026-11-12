// 暗記アプリの「AIに質問」に、PCのサブスクで動く Claude Code（claude）か Codex CLI（codex exec）で答える。
// APIの従量課金は使わない。質問ごとに1回だけ起動し、会話はアプリが毎回まとめて送るので、ここでは何も覚えない。
// どちらもファイル操作・コマンド実行・Web検索・外部接続（MCP）を使えない設定で動かし、質問に答えるだけにする。
// 仕組みは gonta（C:\Users\USER\Desktop\gonta\relay\brain.mjs・codex.mjs）と同じ考え方で、保存場所やポートは分ける。
import {spawn, execFile, execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const SERVICES = ['claude', 'codex'];
export const LIMITS = {field: 6000, message: 4000, messages: 24};

const clip = (value, max) => {
  const text = String(value ?? '').trim();
  return text.length > max ? text.slice(0, max) + '…（以下略）' : text;
};

// アプリから届いた内容を確かめて整える。おかしな時は理由を返す。
export function normalizeAsk(body) {
  if (!body || typeof body !== 'object') return {error: '質問の形式が正しくありません。'};
  if (!SERVICES.includes(body.service)) return {error: 'AIの種類が正しくありません。'};
  const context = body.context && typeof body.context === 'object' ? body.context : {};
  const prompt = clip(context.prompt, LIMITS.field), answer = clip(context.answer, LIMITS.field);
  if (!prompt || !answer) return {error: '問題と答えが必要です。'};
  if (!Array.isArray(body.messages) || !body.messages.length || body.messages.length > LIMITS.messages) {
    return {error: '会話の形式が正しくありません。'};
  }
  const messages = [];
  for (const message of body.messages) {
    if (!message || !['user', 'assistant'].includes(message.role) || typeof message.text !== 'string') {
      return {error: '会話の形式が正しくありません。'};
    }
    if (message.text.length > LIMITS.message) return {error: '質問が長すぎます。'};
    const text = message.text.trim();
    if (text) messages.push({role: message.role, text});
  }
  if (messages.at(-1)?.role !== 'user') return {error: '質問が空です。'};
  return {
    service: body.service,
    context: {prompt, answer, explanation: clip(context.explanation, LIMITS.field)},
    messages,
  };
}

// 前提文。問題・答え・解説を渡し、日本語で簡潔に答えるよう頼む。
export function systemPrompt({prompt, answer, explanation}) {
  return [
    'あなたは、高校生向けの暗記学習アプリで、利用者の質問に答える係です。',
    '利用者はいま、次の一問一答を学習しています。',
    '',
    `問題：${prompt}`,
    `答え：${answer}`,
    ...(explanation ? [`解説：${explanation}`] : []),
    '',
    'この問題・答え・解説を前提にして、利用者の質問に答えてください。',
    '- 日本語で、簡潔に答えてください。最初の1文で質問に直接答え、必要なときだけ短い補足を添えてください。全体でおおむね300字以内にしてください。',
    '- 見出しや表は使わず、普通の文章で書いてください。箇条書きは必要なときだけ使ってください。',
    '- 答えや解説に誤りや不正確な点があると考えられるときは、そのことをはっきり伝えてください。',
    '- ファイルの読み書き、コマンドの実行、Web検索は行わず、質問に答えるだけにしてください。',
  ].join('\n');
}

// 会話の続き。最後の利用者の質問に答えてもらう。
export function conversationText(messages) {
  const history = messages.slice(0, -1);
  const question = messages.at(-1).text;
  if (!history.length) return question;
  return [
    'これまでの会話（古い順）：',
    ...history.map((m) => `${m.role === 'user' ? '利用者' : 'あなた'}：${m.text}`),
    '',
    `今回の質問：${question}`,
  ].join('\n');
}

export function resolveClaude(env = process.env) {
  if (env.ANKI_AI_CLAUDE) return env.ANKI_AI_CLAUDE;
  if (process.platform === 'win32') {
    const candidates = [
      env.APPDATA && path.join(env.APPDATA, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'),
      path.join(os.homedir(), '.local', 'bin', 'claude.exe'),
    ];
    for (const candidate of candidates) if (candidate && existsSync(candidate)) return candidate;
    return 'claude.cmd';
  }
  return 'claude';
}

// npm の起動用スクリプトを使い、Codex の更新後も動くようにする（gonta と同じ）。
export function resolveCodex(env = process.env) {
  if (env.ANKI_AI_CODEX) return env.ANKI_AI_CODEX;
  const launcher = env.APPDATA && path.join(env.APPDATA, 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
  return launcher && existsSync(launcher) ? launcher : null;
}

// ほかの Claude Code の身元や APIキーを引き継がない。サブスクの合言葉（claude setup-token）があればそれを、
// なければPCの通常のログインを使う。APIキーは渡さないので、従量課金にはならない。
export function claudeEnvironment(env = process.env, token = null) {
  const out = {};
  for (const [key, value] of Object.entries(env)) {
    if (!/^(CLAUDE|ANTHROPIC_|MCP_|BOT_CLAUDE_API_KEY$)/i.test(key)) out[key] = value;
  }
  out.CLAUDE_CODE_DISABLE_AUTO_MEMORY = '1';
  out.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1';
  out.DISABLE_AUTOUPDATER = '1';
  if (token) out.CLAUDE_CODE_OAUTH_TOKEN = token;
  return out;
}

// Codex が動かすものから Claude のログインやAPIキーが見えないようにする。
export function codexEnvironment(env = process.env) {
  const out = {};
  for (const [key, value] of Object.entries(env)) {
    if (!/^(CLAUDE|ANTHROPIC_|MCP_|BOT_CLAUDE_API_KEY$|OPENAI_API_KEY$)/i.test(key)) out[key] = value;
  }
  return out;
}

// ツールを1つも持たせず（--tools ""）、外部接続も設定も読まず、会話も保存しない。
export function claudeArguments({system, model = 'sonnet', effort}) {
  const args = [
    '-p', '--output-format', 'stream-json', '--include-partial-messages', '--verbose',
    '--tools', '', '--strict-mcp-config', '--no-session-persistence', '--disable-slash-commands',
    '--setting-sources', 'project', '--system-prompt', system,
  ];
  if (model) args.push('--model', model);
  if (effort) args.push('--effort', effort);
  return args;
}

// 読み取り専用で、シェル・アプリ・ブラウザー・Web検索などを止める。利用者のCodex設定（全権限など）は読まない。
export const CODEX_DISABLED_FEATURES = [
  'shell_tool', 'unified_exec', 'js_repl', 'apps', 'plugins', 'browser_use', 'computer_use',
  'in_app_browser', 'multi_agent', 'image_generation', 'memories', 'view_image', 'hooks',
];
export function codexArguments({model, effort = 'low'}) {
  const args = [
    'exec', '--json', '--ephemeral', '--skip-git-repo-check', '--ignore-user-config', '--ignore-rules',
    '--sandbox', 'read-only',
    '-c', 'approval_policy="never"', '-c', 'web_search="disabled"', '-c', `model_reasoning_effort="${effort}"`,
  ];
  for (const feature of CODEX_DISABLED_FEATURES) args.push('--disable', feature);
  if (model) args.push('-m', model);
  args.push('-');
  return args;
}

// Windows では起動用スクリプトだけ止めると本体が残るので、まとめて止める。
export function killTree(child) {
  if (process.platform === 'win32' && child.pid) {
    execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], {windowsHide: true}, () => {});
    return;
  }
  try { child.kill(); } catch {}
}

const AUTH_FAILURE = /Failed to authenticate|OAuth (session|token)|Login expired|run \/login|Not logged in|authentication_error|Invalid bearer token|not signed in|Please login|401 Unauthorized/i;
const LIMIT_FAILURE = /hit your (?:usage )?limit|usage limit|rate limit|limit reached|limit will reset|out of (?:extra )?usage|quota/i;

// 利用者に見せる失敗の説明。
export function describeFailure(service, detail) {
  const name = service === 'claude' ? 'Claude' : 'ChatGPT（Codex）';
  if (LIMIT_FAILURE.test(detail)) return `${name}の利用上限に達しているようです。しばらく待ってから聞いてください。`;
  if (AUTH_FAILURE.test(detail)) {
    return service === 'claude'
      ? 'PCのClaudeのログインが切れています。PCで ai-relay\\setup.cmd を実行して、ログインし直してください。'
      : 'PCのCodexのログインが切れています。PCで codex login を実行して、ChatGPTでログインし直してください。';
  }
  return `${name}が答えられませんでした。${detail ? '（' + String(detail).replace(/\s+/g, ' ').slice(0, 200) + '）' : ''}`;
}

// 1回分の回答。on.text には、そこまでの返事の全文を渡す。{ok, text, detail} で終わる。
export function runClaude({command, args, cwd, input, env, spawnImpl = spawn}, on = {}) {
  const child = spawnImpl(command, args, {cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, shell: /\.(cmd|bat)$/i.test(command)});
  let buffer = '', stderr = '', committed = '', block = '', streaming = false, result = null, errorText = '';
  const join = (a, b) => (a && b ? a + '\n\n' + b : a || b || '');
  const show = () => on.text?.(join(committed, streaming ? block : ''));
  const handle = (m) => {
    if (m.type === 'stream_event') {
      if (m.parent_tool_use_id) return;
      const e = m.event || {};
      if (e.type === 'content_block_start' && e.content_block?.type === 'text') { block = ''; streaming = true; }
      else if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta' && streaming) { block += e.delta.text; show(); }
      else if (e.type === 'content_block_stop' && streaming) { committed = join(committed, block); block = ''; streaming = false; show(); }
    } else if (m.type === 'assistant' && m.error) {
      errorText = (m.message?.content || []).filter((b) => b?.type === 'text').map((b) => b.text).join('\n') || String(m.error);
    } else if (m.type === 'result') {
      result = m;
    }
  };
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      try { handle(JSON.parse(line)); } catch {}
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4000); });
  child.stdin.on('error', () => {});
  const done = new Promise((resolve) => {
    let failure = '';
    child.on('error', (error) => { failure = error.message; });
    child.on('close', (code) => {
      const ok = result?.subtype === 'success' && !result.is_error && !errorText;
      const text = (committed || (typeof result?.result === 'string' ? result.result : '')).trim();
      const detail = [errorText, failure, ok ? '' : typeof result?.result === 'string' ? result.result : '', ok ? '' : stderr.trim().slice(-300),
        !result && !failure ? `claude exited (code ${code})` : ''].filter(Boolean).join(' ');
      resolve({ok: ok && Boolean(text), text, detail});
    });
  });
  child.stdin.end(input, 'utf8');
  return {child, done, kill: () => killTree(child)};
}

export function runCodex({target, args, cwd, input, env, spawnImpl = spawn}, on = {}) {
  const js = /\.m?js$/i.test(target);
  const child = spawnImpl(js ? process.execPath : target, js ? [target, ...args] : args, {cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true});
  let buffer = '', stderr = '', text = '', completed = false, failure = '';
  const handle = (e) => {
    if (e.type === 'item.completed' && e.item?.type === 'agent_message' && e.item.text) {
      text = text ? text + '\n\n' + e.item.text : e.item.text;
      on.text?.(text);
    } else if (e.type === 'turn.completed') completed = true;
    else if (e.type === 'turn.failed') failure = e.error?.message || 'turn failed';
    else if (e.type === 'error') failure = e.message || 'error';
  };
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      try { handle(JSON.parse(line)); } catch {}
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4000); });
  child.stdin.on('error', () => {});
  const done = new Promise((resolve) => {
    child.on('error', (error) => { failure = failure || error.message; });
    child.on('close', (code) => {
      // 設定の警告は "error" として届くことがあるので、返事が完成していれば成功とする。
      const ok = completed && Boolean(text.trim());
      resolve({ok, text: text.trim(), detail: ok ? '' : failure || `codex exited (code ${code})${stderr.trim() ? ': ' + stderr.trim().slice(-300) : ''}`});
    });
  });
  child.stdin.end(input, 'utf8');
  return {child, done, kill: () => killTree(child)};
}

// setup.ps1 が保存した1年有効の合言葉（DPAPIで暗号化）を、このWindowsユーザーとして読み出す。
export function loadOAuthToken(file, log = console) {
  if (process.platform !== 'win32' || !existsSync(file)) return null;
  try {
    const script = '$s=(Get-Content -LiteralPath $env:ANKI_AI_TOKEN_FILE -Raw).Trim()|ConvertTo-SecureString;$b=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s);try{[Runtime.InteropServices.Marshal]::PtrToStringBSTR($b)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b)}';
    const token = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8', timeout: 20000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: {...process.env, ANKI_AI_TOKEN_FILE: file},
    }).trim();
    if (/^\S{20,}$/.test(token)) return token;
    log.error('Claude token file is not usable; using the normal login');
  } catch (error) {
    log.error('Claude token could not be read:', String(error.message).split('\n')[0]);
  }
  return null;
}
