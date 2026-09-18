import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { buildSOAnswerVisuals } from "./world-history-so-answer-visuals.mjs";

const root = path.resolve(import.meta.dirname, "..", "public"), objects = new Map();
const cloudBase = "https://pub-76ffbe2829114a5cbaa433db45872267.r2.dev";
async function cloud(key) {
  const response = await fetch(`${cloudBase}/${key}`); assert.ok(response.ok, key);
  const buffer = Buffer.from(await response.arrayBuffer()); objects.set(key, buffer); return buffer;
}
const catalog = JSON.parse(await cloud("index.json")), images = JSON.parse(await cloud("term-images.json"));
const subject = catalog.subjects.find(s => s.id === "world-history-so");
const decks = await Promise.all(subject.decks.map(async entry => {
  const index = JSON.parse(await cloud(entry.indexPath));
  return { entry, index, chunks: await Promise.all(index.chunks.map(async c => JSON.parse(await cloud(c.path)))) };
}));
const snapshot = { catalog, subject, decks }, original = JSON.stringify(snapshot);
const result = buildSOAnswerVisuals(snapshot, images, await readFile(path.join(root, "../data/source/world-history-so/answer-visuals/base-map.svg"), "utf8"));
assert.equal(JSON.stringify(snapshot), original, "問題データを書き換えず地図を作る");
assert.equal(result.manifest.questionCount, 357);
assert.equal(result.manifest.assignments.filter(a => a.map).length, 351);
const manifestKey = "subjects/world-history-so/answer-visuals/index.json";
objects.set(manifestKey, JSON.stringify(result.manifest));
for (const [key, svg] of result.assets) objects.set(key, svg);
const terms = decks.flatMap(d => d.chunks.flatMap(c => c.terms));
const selected = ["8af8aa", "17bde7", "fafcac", "fd1618"].map(prefix => terms.find(t => t.stages.beginner[0].id.startsWith("WHSO-" + prefix)));
assert.ok(selected.every(Boolean));
const mapQuestion = selected[2].stages.beginner[0];
for (const key of [mapQuestion.questionMap.path, mapQuestion.questionMap.answerPath, result.manifest.assignments.find(a => a.questionId === selected[1].stages.beginner[0].id).relatedImage.path]) await cloud(key);
// 読み取った現行問題から試験用の4問を並べる。保存先は下記の模擬窓口のみ。
const testDeck = decks.find(deck => deck.entry.id === "deck-1");
objects.set(testDeck.index.chunks[0].path, JSON.stringify({ ...testDeck.chunks[0], terms: selected }));
objects.set(testDeck.entry.indexPath, JSON.stringify({ ...testDeck.index, chunks: [testDeck.index.chunks[0]] }));
const off = { history: { question: false, answer: false, explanation: false, mnemonic: false }, vocabulary: { word: false, meaning: false, exampleEnglish: false, exampleJapanese: false } };
let settings = { autoSpeechEnabled: false, speechParts: off, shuffleEnabled: false, setupPreferences: { subjects: {} }, studyTimeLimitSeconds: 600, ratingSoundVolume: 0 };
let failManifest = false, failMap = false;
const sessions = new Map(), requests = [], errors = [];
const types = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json" };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost"); requests.push(url.pathname);
    const reply = (value, status = 200) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(value)); };
    if (url.pathname.startsWith("/v1/")) {
      const buffers = []; for await (const part of req) buffers.push(part);
      const body = buffers.length ? JSON.parse(Buffer.concat(buffers).toString()) : {};
      const dataset = url.searchParams.get("dataset");
      if (url.pathname === "/v1/state") return reply({ settings, progress: { questions: {} }, session: sessions.get(dataset), studyDate: "2026-09-18" });
      if (url.pathname === "/v1/settings") { settings = { ...settings, ...body, autoSpeechEnabled: false, speechParts: off }; return reply({ settings }); }
      if (url.pathname === "/v1/study-session") { if (req.method === "DELETE") sessions.delete(dataset); else sessions.set(dataset, body); return reply({ session: sessions.get(dataset) }); }
      if (/^\/v1\/study-(answer|time)\//.test(url.pathname)) return reply({ session: body.session, updatedAt: new Date().toISOString(), studyDate: "2026-09-18" });
      throw Error("未対応の試験用通信: " + url.pathname);
    }
    if (url.pathname === "/config.js") { res.setHeader("Content-Type", "text/javascript"); res.end(`window.ANKI_CONFIG={dataBaseUrl:"/data",progressApiBaseUrl:"http://127.0.0.1:${server.address().port}"};`); return; }
    if (url.pathname.startsWith("/data/")) {
      const key = url.pathname.slice(6);
      if (failManifest && key === manifestKey || failMap && key.includes("answer-visuals/maps/")) return reply({}, 503);
      const body = objects.get(key); res.writeHead(body ? 200 : 404, { "Content-Type": types[path.extname(key)] ?? "application/octet-stream", "Cache-Control": "no-store" }); res.end(body ?? "{}"); return;
    }
    const target = path.resolve(root, "." + (url.pathname === "/" ? "/index.html" : url.pathname));
    assert.ok(target.startsWith(root + path.sep));
    res.setHeader("Content-Type", types[path.extname(target)] ?? "text/plain"); res.end(await readFile(target));
  } catch (error) { res.writeHead(500); res.end(error.message); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`, output = path.resolve(root, "../.wrangler/so-answer-visuals/screenshots");
await mkdir(output, { recursive: true });
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
  context.setDefaultTimeout(15000);
  // 試験開始前に自動読み上げをOFF。端末音声・読み上げ・評価音はすべて停止する。
  await context.addInitScript(parts => {
    localStorage.setItem("anki-cloud-access-key:v1", "visuals-test-key");
    localStorage.setItem("anki-speech-settings:v1", JSON.stringify({ autoSpeechEnabled: false, speechParts: parts }));
    speechSynthesis.cancel(); speechSynthesis.speak = () => {};
    HTMLMediaElement.prototype.play = () => Promise.resolve();
    if (window.AudioScheduledSourceNode) AudioScheduledSourceNode.prototype.start = () => {};
  }, off);
  await context.route("https://**/*", route => route.abort());
  // 全項目OFFを既定値へ戻す既存動作は、試験用の配信だけで止める。
  const cloudProgress = (await readFile(path.join(root, "cloud-progress.js"), "utf8")).replace("export function normalizeSpeechParts(value)", "function unusedNormalizeSpeechParts(value)");
  await context.route("**/cloud-progress.js*", route => route.fulfill({ contentType: "text/javascript", body: cloudProgress + `\nexport function normalizeSpeechParts() { return ${JSON.stringify(off)}; }` }));
  const speech = (await readFile(path.join(root, "speech.js"), "utf8")).replace("export function createSpeechController(", "function unusedSpeechController(");
  await context.route("**/speech.js*", route => route.fulfill({ contentType: "text/javascript", body: speech + `\nexport function createSpeechController() { return {supported:true, paused:false, currentTarget:null, stop(){}, unlock(){}, pause(){return false;}, resume(){return false;}, speak(){return false;}, preload(){return Promise.resolve();}}; }` }));
  const page = await context.newPage(); page.on("pageerror", e => errors.push(e.message));
  const visible = id => page.locator("#" + id).waitFor({ state: "visible" });
  const loadedMap = () => page.waitForFunction(() => { const img = document.querySelector('[data-map="image"]'); return img.complete && img.naturalWidth > 0; });
  async function start() {
    sessions.clear();
    await page.goto(base + "/?subject=world-history-so&deck=deck-1&view=setup");
    await visible("setup-panel"); await page.waitForFunction(() => !document.querySelector("#start-study").disabled);
    await page.locator("#start-study").click(); await visible("study-shell");
  }
  async function hidden() {
    assert.equal(await page.locator("#answer-map").isVisible(), false);
    assert.equal(await page.locator('[data-map="image"]').getAttribute("src"), null);
    assert.equal(await page.locator('[data-map="image"]').getAttribute("alt"), "");
    assert.equal(await page.locator("#term-image").isVisible(), false);
    assert.equal(await page.locator("#answer-map-dialog").getAttribute("open"), null);
  }
  await start(); await hidden();
  assert.equal(await page.locator("#question-speech").getAttribute("aria-pressed"), "false");
  assert.equal(requests.some(p => p.includes("answer-visuals/maps/")), false, "回答前に地図画像を要求しない");
  assert.match(await page.locator("#question-text").textContent(), /ホラズム/);
  await page.locator("#next-action").click(); await visible("answer-map"); await loadedMap();
  const explanationBox = await page.locator("#term-overview-text").boundingBox();
  const mapBox = await page.locator("#answer-map").boundingBox();
  assert.ok(mapBox.x >= explanationBox.x + explanationBox.width, "解説の右側に地図を配置する");
  assert.ok((await page.locator('[data-map="image"]').boundingBox()).height <= 190, "地図を既存画像と同じ高さに収める");
  await page.locator("#question-card").screenshot({ path: path.join(output, "desktop-answer.png") });
  await page.locator('[data-map="details"]').evaluate(e => { e.open = true; });
  assert.match(await page.locator('[data-map="places"]').textContent(), /ホラーサーン/);
  await page.locator("#answer-map").screenshot({ path: path.join(output, "desktop-map.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator("#question-card").screenshot({ path: path.join(output, "mobile-answer.png") });
  await page.locator('[data-map="open"]').click(); await visible("answer-map-dialog");
  const zoomWidth = await page.locator("#answer-map-dialog img").evaluate(e => e.getBoundingClientRect().width);
  await page.locator('[data-zoom="in"]').click();
  assert.ok(await page.locator("#answer-map-dialog img").evaluate(e => e.getBoundingClientRect().width) > zoomWidth);
  await page.locator("#answer-map-dialog").screenshot({ path: path.join(output, "mobile-zoom.png") });
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#answer-map-dialog img").getAttribute("src"), null);
  await page.locator("#good-action").click(); await hidden();
  assert.match(await page.locator("#question-text").textContent(), /霊廟/);
  await page.locator("#next-action").click(); await loadedMap(); await visible("term-image");
  await page.waitForFunction(() => document.querySelector("#term-image-content").naturalWidth > 0);
  assert.ok(await page.locator("#answer-map").evaluate(e => Boolean(e.compareDocumentPosition(document.querySelector("#term-image")) & Node.DOCUMENT_POSITION_FOLLOWING)));
  assert.match(await page.locator("#term-image-caption").textContent(), /タージ/);
  await page.locator("#question-card").screenshot({ path: path.join(output, "photo-answer.png") });
  await page.locator("#good-action").click(); await hidden(); await visible("question-map");
  assert.ok((await page.locator("#question-map").getAttribute("src")).endsWith(mapQuestion.questionMap.path));
  await page.locator("#next-action").click();
  assert.ok((await page.locator("#question-map").getAttribute("src")).endsWith(mapQuestion.questionMap.answerPath));
  assert.equal(await page.locator("#answer-map").isVisible(), false);
  await page.locator("#good-action").click(); await hidden();
  failMap = true; await page.locator("#next-action").click(); await page.locator('[data-map="error"]').waitFor({ state: "visible" });
  failMap = false; await page.locator('[data-map="retry"]').click(); await loadedMap();
  assert.equal(await page.locator('[data-map="error"]').isVisible(), false);
  await page.locator('[data-map="open"]').click();
  // 科目を変更したら拡大中の地図も残らない。
  await page.evaluate(() => { history.pushState(null, "", "/"); dispatchEvent(new PopStateEvent("popstate")); });
  await visible("subject-panel"); await hidden();
  failManifest = true; await start(); await hidden();
  await page.locator("#next-action").click(); await page.locator('[data-map="error"]').waitFor({ state: "visible" });
  failManifest = false; await page.locator('[data-map="retry"]').click(); await loadedMap();
  assert.deepEqual(errors, []);
  assert.equal(requests.some(p => /\/v1\/.*(speech|rating-sound)/.test(p)), false);
  console.log("ブラウザー確認完了：現行357問・回答前非表示・次問で消去・関連画像・既存地図・390px表示・拡大・科目移動・通信失敗と再読込・音声停止");
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
