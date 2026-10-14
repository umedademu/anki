import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { loadEnglishDeck5 } from "./english-deck-5.mjs";
import { normalizeSetupPreferences, normalizeStudySession } from "../worker/src/index.js";

const root = path.resolve(import.meta.dirname, "..", "public"), plan = await loadEnglishDeck5();
const dataBase = "https://pub-76ffbe2829114a5cbaa433db45872267.r2.dev";
const off = { history: { question: false, answer: false, explanation: false, mnemonic: false }, vocabulary: { word: false, meaning: false, exampleEnglish: false, exampleJapanese: false } };
let settings, sessions;
function reset(mode) {
  sessions = new Map(); settings = { autoSpeechEnabled: false, speechParts: off, shuffleEnabled: false, ratingSoundVolume: 0,
    setupPreferences: normalizeSetupPreferences({ subjects: { "english-vocabulary": { selectedDeckIds: ["deck-5"], lastDeckId: "deck-5", studyMode: mode, decks: { "deck-5": { questionStyle: "beginner" } } } } }) };
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const json = value => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(value)); };
    if (url.pathname.startsWith("/v1/")) {
      const buffers = []; for await (const part of req) buffers.push(part);
      const body = buffers.length ? JSON.parse(Buffer.concat(buffers).toString()) : {}, dataset = url.searchParams.get("dataset");
      if (url.pathname === "/v1/state") { json({ settings, progress: { questions: {} }, session: sessions.get(dataset), studyDate: "2026-10-14" }); return; }
      if (url.pathname === "/v1/settings") { settings = { ...settings, ...body, autoSpeechEnabled: false, speechParts: off }; json({ settings }); return; }
      if (url.pathname === "/v1/study-session" || url.pathname.startsWith("/v1/study-time/")) {
        const session = url.pathname === "/v1/study-session" ? body : body.session;
        sessions.set(dataset, normalizeStudySession(session)); json({ session: sessions.get(dataset), updatedAt: new Date().toISOString() }); return;
      }
      throw new Error(`未対応の試験用通信：${url.pathname}`);
    }
    if (url.pathname === "/config.js") { res.setHeader("Content-Type", "text/javascript"); res.end(`window.ANKI_CONFIG={dataBaseUrl:${JSON.stringify(dataBase)},progressApiBaseUrl:"http://127.0.0.1:${server.address().port}"};`); return; }
    if (url.pathname.startsWith("/data/")) throw new Error("この試験ではCloudflare上の問題集を使います。");
    const target = path.resolve(root, "." + (url.pathname === "/" ? "/index.html" : url.pathname));
    if (!target.startsWith(root + path.sep)) throw new Error("公開フォルダー外");
    res.setHeader("Content-Type", ({ ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" })[path.extname(target)] ?? "text/plain"); res.end(await readFile(target));
  } catch (error) { res.writeHead(500); res.end(error.message); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext(); context.setDefaultTimeout(20000);
  // 公開データは本番で許可された接続元を指定してCloudflareから取得する。
  // 試験用の画面へ渡す応答だけ接続元の制限を外し、本番の設定は変えない。
  await context.route(`${dataBase}/**`, async route => {
    const response = await fetch(route.request().url(), { headers: { Origin: "https://anki-ume.vercel.app" }, cache: "no-store" });
    const headers = { ...Object.fromEntries(response.headers), "access-control-allow-origin": "*" };
    for (const name of ["content-encoding", "content-length", "transfer-encoding"]) delete headers[name];
    await route.fulfill({ status: response.status, headers, body: Buffer.from(await response.arrayBuffer()) });
  });
  // 自動読み上げを試験開始前からOFFにし、実際の音声を再生しない。
  await context.addInitScript(parts => {
    localStorage.setItem("anki-cloud-access-key:v1", "english-deck-test-key");
    localStorage.setItem("anki-speech-settings:v1", JSON.stringify({ autoSpeechEnabled: false, speechParts: parts }));
    const forbidden = () => { throw new Error("試験中の音声再生は禁止"); };
    speechSynthesis.cancel(); speechSynthesis.speak = forbidden; HTMLMediaElement.prototype.play = forbidden;
    if (window.AudioScheduledSourceNode) AudioScheduledSourceNode.prototype.start = forbidden;
  }, off);
  const speech = (await readFile(path.join(root, "speech.js"), "utf8")).replace("export function createSpeechController(", "function unusedSpeechController(");
  await context.route("**/speech.js*", route => route.fulfill({ contentType: "text/javascript", body: speech + "\nexport function createSpeechController(){return {supported:true,paused:false,currentTarget:null,stop(){},unlock(){},pause(){return false},resume(){return false},speak(){return true},preload(){return Promise.resolve()}};}" }));
  const page = await context.newPage(), errors = [], reads = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (request.url().startsWith(dataBase)) reads.push(request.url()); });
  const first = plan.terms[0];
  for (const mode of ["memorize", "listen-answer"]) for (const stage of ["beginner", "reverse", "integrated"]) {
    reset(mode);
    await page.goto(`${base}/?subject=english-vocabulary&view=setup&deck=deck-5`);
    await page.locator("#setup-panel").waitFor({ state: "visible" });
    await page.waitForFunction(() => !document.querySelector("#start-study").disabled);
    for (const number of [1, 2, 3, 4, 5]) assert.equal(await page.locator(`#deck-filter input[value="deck-${number}"]`).count(), 1);
    assert.equal(await page.locator('#deck-filter input[value="deck-5"]').isChecked(), true);
    await page.locator("#question-style-filter").selectOption(stage);
    await page.locator("#setup-shuffle").uncheck();
    await page.locator(`input[name="study-mode"][value="${mode}"]`).check();
    await page.locator("#start-study").click(); await page.locator("#question-card").waitFor({ state: "visible" });
    const question = first.stages[stage][0];
    assert.equal(await page.locator("#question-text").textContent(), question.prompt);
    if (mode === "memorize") { await page.locator("#next-action").click(); assert.ok((await page.locator("#answer-text").textContent()).startsWith(question.answer)); }
    assert.ok([...sessions.values()].some(session => session.deckIds.join(",") === "deck-5" && session.currentTask.questionId === question.id));
  }
  assert.ok(reads.some(url => url.includes(plan.entry.indexPath)), "登録した索引をCloudflareから読む");
  assert.equal(new Set(reads.filter(url => /imports\/deck-5\/.+\/chunks\//.test(url)).map(url => new URL(url).pathname)).size, 10);
  assert.deepEqual(errors, []);
  console.log("英単語Deck 5：Cloudflare上の全500語を読み込み、5デッキの選択と暗記・聞き流しの三方向の出題・回答を無音で確認しました。");
} finally { await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
