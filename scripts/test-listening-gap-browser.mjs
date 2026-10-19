// 英単語・3語表示の聞き流しで、読み上げが終わってから次の読み上げを始めるまでの間を実測する。
// スマートフォン相当の遅い処理速度と携帯回線相当の通信速度を再現し、単語を重ねても間が伸びないこと、
// 1語ごとの保存通信が小さいことを確かめる。人工データと試験用の保存窓口（本物の保存処理を手元の
// 仮の記録領域で動かす）だけを使い、音声は鳴らさず、試験サーバーの外へは通信しない。
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import worker from "../worker/src/index.js";

const root = path.resolve(import.meta.dirname, "..", "public");
const options = {
  terms: Number(process.env.ANKI_GAP_TERMS ?? 2000),
  words: Number(process.env.ANKI_GAP_WORDS ?? 30),
  segmentMs: Number(process.env.ANKI_GAP_SEGMENT_MS ?? 500),
  cpuRate: Number(process.env.ANKI_GAP_CPU ?? 4),
  latencyMs: Number(process.env.ANKI_GAP_LATENCY_MS ?? 120),
  uploadBps: Number(process.env.ANKI_GAP_UPLOAD_BPS ?? 2_000_000),
  downloadBps: Number(process.env.ANKI_GAP_DOWNLOAD_BPS ?? 8_000_000),
  reportOnly: process.env.ANKI_GAP_REPORT_ONLY === "1",
  maxLateMedianMs: Number(process.env.ANKI_GAP_MAX_MEDIAN_MS ?? 120),
  maxSaveBytes: Number(process.env.ANKI_GAP_MAX_SAVE_BYTES ?? 4096),
};
const accessKey = "gap-test-key";

// 人工の英単語。英語から意味の問題だけを聞き流しで使う。
const terms = Array.from({ length: options.terms }, (_, index) => {
  const word = `word${index}`;
  const meaning = `意味${index}`;
  const question = (stage, prompt, answer) => ({
    id: `${stage === "beginner" ? "q" : stage === "reverse" ? "r" : "i"}${index}`,
    stage, type: stage === "beginner" ? "identify" : stage,
    prompt, answer, acceptedAnswers: [], keywords: [answer],
    speech: {
      question: [{ text: prompt, language: stage === "reverse" ? "ja-JP" : "en-US" }],
      answer: [{ text: answer, language: stage === "reverse" ? "en-US" : "ja-JP" }],
    },
  });
  return {
    id: `t${index}`, term: word, reading: "品詞：試験", category: "試験", importanceRank: index + 1,
    geography: {}, chronology: { sortYear: index + 1 },
    stages: {
      beginner: [question("beginner", word, meaning)],
      reverse: [question("reverse", meaning, word)],
      integrated: [question("integrated", `Example ${word}.`, `例文${index}`)],
    },
  };
});
const deck = { id: "deck-1", number: 1, datasetLabel: "試験用英単語", indexPath: "vocabulary/index.json",
  version: "gap-vocabulary-v1", termCount: terms.length, questionCount: terms.length * 3 };
const objects = new Map([
  ["index.json", { schemaVersion: 3, version: "gap-test", subjects: [
    { id: "english-vocabulary", title: "英単語", learningType: "vocabulary", defaultDeckId: "deck-1", decks: [deck] },
  ] }],
  ["vocabulary/index.json", { id: "english-vocabulary", title: "英単語", deckId: "deck-1", version: deck.version,
    learningType: "vocabulary", masteryTarget: 2, availableStages: ["beginner", "reverse", "integrated"], chunks: [{ path: "vocabulary/chunk.json" }] }],
  ["vocabulary/chunk.json", { terms }],
  ["term-images.json", { schemaVersion: 2, assets: [], assignments: [] }],
]);

// 本物の保存処理（worker）を、手元の仮の記録領域で動かす。
const speechParts = {
  history: { question: false, answer: false, explanation: false, mnemonic: false },
  vocabulary: { word: true, meaning: true, exampleEnglish: false, exampleJapanese: false },
};
const setupPreferences = { subjects: { "english-vocabulary": {
  selectedDeckIds: ["deck-1"], studyMode: "listen-answer", vocabularyStreamEnabled: true,
  decks: { "deck-1": { questionStyle: "all" } },
} } };
const settingsRow = {
  again_seconds: 86400, hard_seconds: 86400, good_seconds: 86400, easy_seconds: 86400,
  speech_source: "cloud", azure_voice_id: "", english_azure_voice_id: "", device_voice_id: "", english_device_voice_id: "",
  speech_rate: 1, shuffle_enabled: 0, auto_speech_enabled: 1, listening_pause_seconds: 0, listening_question_interval_seconds: 0,
  study_routine_overtime_seconds: 0, study_time_limit_seconds: 86400, rating_sound_volume: 0, rating_sounds_json: null,
  speech_parts_json: JSON.stringify(speechParts), setup_preferences_json: JSON.stringify(setupPreferences),
  updated_at: "2026-10-20T00:00:00.000Z",
};
const store = { sessions: new Map(), activities: new Map(), times: new Map(), rounds: new Set() };
function execute(sql, values) {
  if (sql.includes("INSERT INTO study_sessions (")) store.sessions.set(values[0], { session_json: values[1], updated_at: values[2] });
  else if (sql.startsWith("DELETE FROM study_sessions WHERE")) store.sessions.delete(values[0]);
  else if (sql.includes("INSERT INTO study_activity_events")) store.activities.set(values[0], values);
  else if (sql.includes("INSERT INTO study_time_events")) store.times.set(values[0], values);
  else if (sql.includes("INSERT INTO study_round_events")) store.rounds.add(values[1]);
}
function firstRow(sql, values) {
  if (sql.includes("FROM study_sessions WHERE dataset_version")) {
    const row = store.sessions.get(values[0]);
    return row ? { ...row } : null;
  }
  if (sql.includes("COUNT(*) AS completed_count")) return { completed_count: store.rounds.size };
  if (sql.includes("FROM review_settings")) return { ...settingsRow };
  return null;
}
const env = {
  SYNC_TOKEN: accessKey, ALLOWED_ORIGIN: "", AZURE_SPEECH_REGION: "japaneast", AZURE_SPEECH_KEY: "", SPEECH_CACHE: {},
  DB: {
    prepare(sql) {
      return {
        sql, values: [],
        bind(...values) { this.values = values; return this; },
        async all() { return { results: [] }; },
        async first() { return firstRow(sql, this.values); },
        async run() { execute(sql, this.values); return { success: true }; },
      };
    },
    async batch(statements) {
      for (const statement of statements) execute(statement.sql, statement.values);
      return statements.map(() => ({ success: true }));
    },
  },
};

// 携帯回線相当の遅れ：往復の待ちに加え、送受信する大きさに比例して時間がかかる。
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const transferMs = (bytes, bitsPerSecond) => options.latencyMs + (bytes * 8 / bitsPerSecond) * 1000;
const requests = [];
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname.startsWith("/v1/")) {
      const parts = []; for await (const part of req) parts.push(part);
      const bodyText = Buffer.concat(parts).toString();
      const upBytes = Buffer.byteLength(bodyText);
      const startedAt = performance.now();
      await sleep(transferMs(upBytes, options.uploadBps));
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) if (typeof value === "string") headers.set(key, value);
      const request = new Request(`https://anki-progress-api.test${url.pathname}${url.search}`, {
        method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : bodyText,
      });
      const response = await worker.fetch(request, env);
      const text = await response.text();
      const downBytes = Buffer.byteLength(text);
      await sleep(transferMs(downBytes, options.downloadBps));
      requests.push({ path: url.pathname, method: req.method, status: response.status, upBytes, downBytes,
        ms: Math.round(performance.now() - startedAt), body: bodyText });
      res.writeHead(response.status, { "Content-Type": response.headers.get("content-type") ?? "application/json" });
      res.end(text);
      return;
    }
    if (url.pathname === "/config.js") {
      res.setHeader("Content-Type", "text/javascript");
      res.end(`window.ANKI_CONFIG={dataBaseUrl:"/data",progressApiBaseUrl:"http://127.0.0.1:${server.address().port}"};`);
      return;
    }
    if (url.pathname.startsWith("/data/")) {
      const body = objects.get(url.pathname.slice(6));
      res.writeHead(body ? 200 : 404, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body ?? {}));
      return;
    }
    const target = path.resolve(root, "." + (url.pathname === "/" ? "/index.html" : url.pathname));
    if (!target.startsWith(root + path.sep)) throw new Error("公開範囲の外");
    res.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" })[path.extname(target)] ?? "text/plain");
    res.end(await readFile(target));
  } catch (error) { res.writeHead(500); res.end(error.message); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
env.ALLOWED_ORIGIN = base;

let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 812, height: 375 } });
  context.setDefaultTimeout(30000);
  await context.addInitScript(key => {
    localStorage.setItem("anki-cloud-access-key:v1", key);
    const forbidden = () => { throw new Error("試験中の音声再生は禁止"); };
    speechSynthesis.cancel(); speechSynthesis.speak = forbidden;
    HTMLMediaElement.prototype.play = forbidden;
    if (window.AudioScheduledSourceNode) AudioScheduledSourceNode.prototype.start = forbidden;
  }, accessKey);
  await context.route("**/*", route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  // 読み上げは鳴らさず、1区切りを一定時間で終えたことにして、終わりから次の開始までの間を記録する。
  const speech = (await readFile(path.join(root, "speech.js"), "utf8")).replace("export function createSpeechController(", "function unusedSpeechController(");
  await context.route("**/speech.js*", route => route.fulfill({ contentType: "text/javascript", body: speech + `
export function createSpeechController() {
  const log = window.__gapLog = [];
  const segmentMs = ${options.segmentMs};
  let lastEndAt = null, pending = null, paused = false;
  const controller = {
    supported: true, deviceSupported: false, cloudSupported: true, currentTarget: "",
    get paused() { return paused; },
    preload() { return Promise.resolve([]); }, stage() { return true; }, unlock() { return true; }, release() { return false; },
    stop() { if (pending) { clearTimeout(pending.timer); pending = null; } },
    pause() { paused = true; return true; }, resume() { paused = false; return true; },
    speak(segments, { onComplete = () => {} } = {}) {
      controller.stop();
      const normalized = Array.from(segments ?? []).filter(segment => segment?.text);
      if (normalized.length === 0) return false;
      const at = performance.now();
      log.push({ type: "start", at, targets: normalized.map(segment => segment.target), gapMs: lastEndAt === null ? null : at - lastEndAt });
      const entry = { timer: 0 };
      entry.timer = setTimeout(() => {
        pending = null; lastEndAt = performance.now(); log.push({ type: "end", at: lastEndAt }); onComplete();
      }, normalized.length * segmentMs);
      pending = entry;
      return true;
    },
  };
  return controller;
}` }));
  await context.route("**/rating-sound.js*", route => route.fulfill({ contentType: "text/javascript", body: `
export function createRatingSoundPlayer() {
  return { play() { return true; }, setVolume(value) { return value; }, setCustomSound() { return Promise.resolve(); },
    clearCustomSound() { return false; }, hasCustomSound() { return false; }, close() { return Promise.resolve(); }, releaseOutput() { return Promise.resolve(); } };
}` }));
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: options.cpuRate });

  await page.goto(`${base}/?subject=english-vocabulary&view=setup&deck=deck-1`);
  await page.locator("#setup-panel").waitFor({ state: "visible" });
  await page.waitForFunction(() => !document.querySelector("#start-study").disabled);
  await page.locator('input[name="study-mode"][value="listen-answer"]').check();
  const streamToggle = page.locator('input#vocabulary-stream-enabled, #vocabulary-stream-enabled input[type="checkbox"][role="switch"]');
  if (!await streamToggle.isChecked()) await streamToggle.check();
  const startedAt = performance.now();
  await page.locator("#start-study").click();
  const wordStarts = () => page.evaluate(() => (window.__gapLog ?? []).filter(entry => entry.type === "start" && !entry.targets.some(target => target.includes("meaning"))).length);
  const deadline = Date.now() + Math.max(120000, options.words * 8000);
  while (await wordStarts() < options.words + 1) {
    assert.ok(Date.now() < deadline, `${options.words}語分の読み上げが時間内に進む（現在${await wordStarts()}語）`);
    assert.deepEqual(errors, [], "画面で例外が起きない");
    await sleep(200);
  }
  const elapsedMs = performance.now() - startedAt;
  const log = await page.evaluate(() => window.__gapLog);
  const unlock = await page.evaluate(() => document.querySelector("#unlock-notice")?.textContent?.trim() ?? "");
  assert.equal(unlock.includes("一時停止"), false, `聞き流しが止まらない：${unlock}`);

  // 単語ごとに、前の単語の訳を読み終えてから次の単語を読み始めるまでの間（語間）と、
  // 単語を読み終えてから訳を読み始めるまでの間（訳の前）を集める。
  const words = [];
  for (const entry of log) {
    if (entry.type !== "start") continue;
    if (entry.targets.some(target => target.includes("meaning"))) {
      if (words.length > 0) words.at(-1).answerGapMs = entry.gapMs;
    } else {
      words.push({ index: words.length + 1, wordGapMs: entry.gapMs, answerGapMs: null });
    }
  }
  const saves = requests.filter(request => request.path.startsWith("/v1/study-activity/") || request.path.startsWith("/v1/study-time/") || request.path === "/v1/study-session");
  const median = values => {
    const sorted = [...values].filter(value => Number.isFinite(value)).sort((left, right) => left - right);
    return sorted.length === 0 ? NaN : sorted[Math.floor(sorted.length / 2)];
  };
  const early = words.slice(1, 6).map(word => word.wordGapMs);
  const late = words.slice(10, options.words + 1).map(word => word.wordGapMs);
  const summary = {
    terms: options.terms, words: options.words, cpuRate: options.cpuRate,
    network: { latencyMs: options.latencyMs, uploadBps: options.uploadBps, downloadBps: options.downloadBps },
    elapsedSeconds: Math.round(elapsedMs / 100) / 10,
    wordGapMedianWords2to6: Math.round(median(early)),
    wordGapMedianWords11toEnd: Math.round(median(late)),
    wordGapMax: Math.round(Math.max(...words.slice(1).map(word => word.wordGapMs))),
    answerGapMedian: Math.round(median(words.map(word => word.answerGapMs))),
    saveRequests: saves.length,
    saveUpBytesMax: Math.max(...saves.map(request => request.upBytes)),
    saveDownBytesMax: Math.max(...saves.map(request => request.downBytes)),
    saveUpBytesMedian: median(saves.map(request => request.upBytes)),
    saveMsMedian: median(saves.map(request => request.ms)),
    failedSaves: saves.filter(request => request.status >= 400).length,
  };
  console.log("語ごとの間（ミリ秒）：語間 / 訳の前");
  console.log(words.slice(0, options.words + 1).map(word =>
    `${String(word.index).padStart(3)}: ${word.wordGapMs === null ? "   -" : String(Math.round(word.wordGapMs)).padStart(5)} / ${word.answerGapMs === null ? "-" : Math.round(word.answerGapMs)}`,
  ).join("\n"));
  console.log("保存通信（上り／下りバイト、所要ミリ秒）：");
  console.log(saves.slice(0, 8).map(request => `${request.method} ${request.path.slice(0, 40)} ${request.upBytes}/${request.downBytes} ${request.ms}ms ${request.status}`).join("\n"));
  console.log(JSON.stringify(summary));
  if (process.env.ANKI_GAP_JSON) await import("node:fs/promises").then(fs => fs.writeFile(process.env.ANKI_GAP_JSON, JSON.stringify({ summary, words, saves: saves.map(({ body, ...rest }) => rest) }, null, 2)));

  if (!options.reportOnly) {
    assert.equal(summary.failedSaves, 0, "保存が失敗しない");
    assert.ok(summary.wordGapMedianWords11toEnd <= options.maxLateMedianMs,
      `11語目以降の語間の中央値が${options.maxLateMedianMs}ミリ秒以下（実測${summary.wordGapMedianWords11toEnd}）`);
    assert.ok(summary.wordGapMedianWords11toEnd <= summary.wordGapMedianWords2to6 + 40,
      `単語を重ねても語間が伸びない（序盤${summary.wordGapMedianWords2to6}、終盤${summary.wordGapMedianWords11toEnd}）`);
    const laterSaves = saves.slice(1);
    assert.ok(laterSaves.every(request => request.upBytes <= options.maxSaveBytes && request.downBytes <= options.maxSaveBytes),
      `2回目以降の1語ごとの保存通信が${options.maxSaveBytes}バイト以下（上り最大${Math.max(...laterSaves.map(request => request.upBytes))}、下り最大${Math.max(...laterSaves.map(request => request.downBytes))}）`);
    // 本物の保存処理が差分を当てはめ、保存済みの途中記録が画面の進みと一致していることを確かめる。
    const stored = JSON.parse(store.sessions.get(deck.version)?.session_json ?? "null");
    assert.ok(stored, "途中記録が保存されている");
    assert.ok(stored.answeredCount >= options.words - 1, `保存済みの回答数が進んでいる（${stored.answeredCount}）`);
    assert.equal(stored.tasks.length, options.terms);
    assert.equal(stored.queue.length + stored.answeredCount + 1, options.terms, "出題待ちの件数が進みと合う");
  }
  console.log(`聞き流しの語間を確認しました：${options.terms}語・${options.words}語分、序盤${summary.wordGapMedianWords2to6}ミリ秒・終盤${summary.wordGapMedianWords11toEnd}ミリ秒、保存通信は最大${summary.saveUpBytesMax}バイト`);
} finally {
  await browser?.close();
  server.close();
}
