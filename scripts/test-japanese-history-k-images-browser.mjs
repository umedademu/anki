import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { buildJapaneseKImages } from "./japanese-history-k-images.mjs";
import { getQuestionPromptForDisplay } from "../public/learning-engine.js";

const root = path.resolve(import.meta.dirname, "../public"), objects = new Map();
const cloudBase = "https://pub-76ffbe2829114a5cbaa433db45872267.r2.dev";
async function cloud(key) {
  const response = await fetch(`${cloudBase}/${key}?imageTest=${Date.now()}`, { signal: AbortSignal.timeout(30000) });
  assert.ok(response.ok, key); const bytes = Buffer.from(await response.arrayBuffer()); objects.set(key, bytes); return bytes;
}
const selection = JSON.parse(await readFile(new URL("../data/source/japanese-history-k/image-assignments.json", import.meta.url), "utf8"));
const catalog = JSON.parse(await cloud("index.json")), images = JSON.parse(await cloud("term-images.json"));
const subject = catalog.subjects.find(value => value.id === selection.subjectId);
const decks = await Promise.all(selection.deckIds.map(async id => {
  const entry = subject.decks.find(value => value.id === id), index = JSON.parse(await cloud(entry.indexPath));
  const chunks = await Promise.all(index.chunks.map(async chunk => JSON.parse(await cloud(chunk.path))));
  return { entry, index, chunks };
}));
const result = buildJapaneseKImages({ catalog, images, decks }, selection);
objects.set("term-images.json", Buffer.from(JSON.stringify(result.manifest)));
const imageByQuestion = new Map(result.audit.map(value => [value.questionId, value]));
for (const imagePath of new Set(result.audit.map(value => value.path))) {
  const source = selection.sources?.find(value => value.path === imagePath);
  // 新規画像の公開前の表示点検だけは、登録予定の画像本体を使用する。
  if (source && !images.assets.some(asset => asset.path === imagePath)) {
    const bytes = await readFile(new URL("../" + source.sourceFile, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), source.sha256); objects.set(imagePath, bytes);
  } else await cloud(imagePath);
}
const terms = decks.flatMap(deck => deck.chunks.flatMap(chunk => chunk.terms)).filter(term => Object.values(term.stages).flat().some(question => imageByQuestion.has(question.id)));
const off = { history: { question: false, answer: false, explanation: false, mnemonic: false }, vocabulary: { word: false, meaning: false, exampleEnglish: false, exampleJapanese: false } };
const defaults = () => ({ autoSpeechEnabled: false, speechParts: off, setupPreferences: { subjects: {} }, studyTimeLimitSeconds: 600, ratingSoundVolume: 0 });
let settings = defaults(), failManifest = false, failImages = false;
const sessions = new Map(), progress = new Map(), requests = [], answers = [];
const contentTypes = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml", ".webp": "image/webp", ".jpg": "image/jpeg", ".json": "application/json" };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost"); requests.push(url.pathname);
    const reply = value => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(value)); };
    if (url.pathname.startsWith("/v1/")) {
      const buffers = []; for await (const part of req) buffers.push(part);
      const body = buffers.length ? JSON.parse(Buffer.concat(buffers).toString()) : {}, dataset = url.searchParams.get("dataset");
      if (url.pathname === "/v1/state") return reply({ settings, progress: { questions: progress.get(dataset) ?? {} }, session: sessions.get(dataset), studyDate: "2026-10-04" });
      if (url.pathname === "/v1/settings") { settings = { ...settings, ...body, autoSpeechEnabled: false, speechParts: off }; return reply({ settings }); }
      if (url.pathname === "/v1/study-session") { if (req.method === "DELETE") sessions.delete(dataset); else sessions.set(dataset, body); return reply({ session: sessions.get(dataset) }); }
      if (url.pathname.startsWith("/v1/study-answer/")) {
        const id = decodeURIComponent(url.pathname.split("/").pop()); answers.push(id);
        sessions.set(body.sessionDatasetVersion ?? dataset, body.session); progress.set(dataset, { ...progress.get(dataset), [id]: body.record });
        return reply({ session: body.session, updatedAt: new Date().toISOString() });
      }
      if (url.pathname.startsWith("/v1/study-time/")) return reply({ session: body.session, studyDate: "2026-10-04" });
      throw Error("未対応の試験用通信: " + url.pathname);
    }
    if (url.pathname === "/config.js") { res.setHeader("Content-Type", "text/javascript"); res.end(`window.ANKI_CONFIG={dataBaseUrl:"/data",progressApiBaseUrl:"http://127.0.0.1:${server.address().port}"};`); return; }
    if (url.pathname.startsWith("/data/")) {
      const key = url.pathname.slice(6);
      if (failManifest && key === "term-images.json" || failImages && key.startsWith("term-images/")) { res.writeHead(503); res.end(); return; }
      const bytes = objects.get(key); res.writeHead(bytes ? 200 : 404, { "Content-Type": contentTypes[path.extname(key)] ?? "application/octet-stream" }); res.end(bytes ?? "{}"); return;
    }
    const file = path.resolve(root, "." + (url.pathname === "/" ? "/index.html" : url.pathname)); assert.ok(file.startsWith(root + path.sep));
    res.setHeader("Content-Type", contentTypes[path.extname(file)] ?? "text/plain"); res.end(await readFile(file));
  } catch (error) { res.writeHead(500); res.end(error.message); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`, output = path.resolve(root, "../.wrangler/japanese-history-k-images/screenshots");
await mkdir(output, { recursive: true });
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } }); context.setDefaultTimeout(15000);
  const audioAttempts = [], errors = [], seen = new Set(), photographed = new Set();
  await context.exposeBinding("reportImageTestAudio", (_source, kind) => audioAttempts.push(kind));
  // 試験開始前から自動音声をOFFにし、音声ファイル・端末音声・効果音を遮断する。
  await context.addInitScript(parts => {
    localStorage.setItem("anki-cloud-access-key:v1", "images-test-only");
    localStorage.setItem("anki-speech-settings:v1", JSON.stringify({ autoSpeechEnabled: false, speechParts: parts }));
    const blocked = kind => { void window.reportImageTestAudio(kind); };
    speechSynthesis.cancel(); speechSynthesis.speak = () => blocked("音声読み上げ");
    HTMLMediaElement.prototype.play = () => { blocked("音声ファイル"); return Promise.resolve(); };
    if (window.AudioScheduledSourceNode) AudioScheduledSourceNode.prototype.start = () => blocked("効果音");
  }, off);
  await context.route("https://**/*", route => route.abort());
  const cloudProgress = (await readFile(path.join(root, "cloud-progress.js"), "utf8")).replace("export function normalizeSpeechParts(value)", "function unusedNormalizeSpeechParts(value)");
  await context.route("**/cloud-progress.js*", route => route.fulfill({ contentType: "text/javascript", body: cloudProgress + `\nexport function normalizeSpeechParts() { return ${JSON.stringify(off)}; }` }));
  const speech = (await readFile(path.join(root, "speech.js"), "utf8")).replace("export function createSpeechController(", "function unusedSpeechController(");
  await context.route("**/speech.js*", route => route.fulfill({ contentType: "text/javascript", body: speech + '\nexport function createSpeechController() { return { supported:true, paused:false, currentTarget:null, stop(){}, unlock(){}, pause(){return false;}, resume(){return false;}, speak(segments=[]) { if(segments.some(s=>String(s?.text??"").trim())) void window.reportImageTestAudio("読み上げ要求"); return false;}, preload(){return Promise.resolve();} }; }' }));
  const sound = (await readFile(path.join(root, "rating-sound.js"), "utf8")).replace("export function createRatingSoundPlayer(", "function unusedRatingSoundPlayer(");
  await context.route("**/rating-sound.js*", route => route.fulfill({ contentType: "text/javascript", body: sound + '\nexport function createRatingSoundPlayer() { return { play(){return false;}, setVolume(v){return v;}, clearCustomSound(){}, setCustomSound(){return Promise.resolve(false);}, close(){return Promise.resolve();} }; }' }));
  async function start(term) {
    const deck = decks.find(value => value.chunks.some(chunk => chunk.terms.some(value => value.id === term.id)));
    // 問題本文を変えず、試験の選択範囲だけ一項目に絞る。本番へは送信しない。
    const count = Object.values(term.stages).flat().length;
    const entry = { ...deck.entry, termCount: 1, questionCount: count };
    const testingCatalog = structuredClone(catalog), testingSubject = testingCatalog.subjects.find(value => value.id === subject.id);
    testingSubject.decks = [entry]; testingSubject.defaultDeckId = entry.id; testingSubject.indexPath = entry.indexPath; testingSubject.termCount = 1; testingSubject.questionCount = count;
    objects.set("index.json", Buffer.from(JSON.stringify(testingCatalog)));
    objects.set(entry.indexPath, Buffer.from(JSON.stringify({ ...deck.index, termCount: 1, questionCount: count, chunks: [{ ...deck.index.chunks[0], termCount: 1, questionCount: count }] })));
    objects.set(deck.index.chunks[0].path, Buffer.from(JSON.stringify({ ...deck.chunks[0], terms: [term] })));
    settings = defaults(); sessions.clear(); progress.clear();
    const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${base}/?subject=${subject.id}&deck=${entry.id}&view=setup`);
    await page.locator("#setup-panel").waitFor({ state: "visible" });
    await page.waitForFunction(() => !document.querySelector("#start-study").disabled);
    await page.locator("#question-type-summary").click(); await page.locator('[data-question-types="all"]').click();
    await page.locator("#setup-shuffle").uncheck(); await page.locator("#question-limit").fill("");
    await page.locator("#start-study").click(); await page.locator("#study-shell").waitFor({ state: "visible" }); return page;
  }
  async function hidden(page) {
    assert.equal(await page.locator("#term-image").isVisible(), false);
    assert.equal(await page.locator("#term-image-content").getAttribute("src"), null);
    assert.equal(await page.locator("#term-image-content").getAttribute("alt"), "");
  }
  for (const term of terms) {
    const page = await start(term);
    for (const question of Object.values(term.stages).flat()) {
      await page.waitForFunction(prompt => document.querySelector("#question-text").textContent === prompt && !document.querySelector("#next-action").disabled, getQuestionPromptForDisplay(question, false));
      await hidden(page);
      await page.locator("#next-action").click();
      const expected = imageByQuestion.get(question.id);
      if (expected) {
        await page.waitForFunction(() => { const image = document.querySelector("#term-image-content"); return image.complete && image.naturalWidth > 0; });
        assert.equal(await page.locator("#term-image").isVisible(), true);
        assert.equal(await page.locator("#term-image-content").getAttribute("src"), "/data/" + expected.path);
        assert.equal(await page.locator("#term-image-content").getAttribute("alt"), expected.caption);
        assert.equal(await page.locator("#term-image-caption").textContent(), expected.caption);
        const asset = result.manifest.assets.find(value => value.path === expected.path && value.caption === expected.caption);
        assert.equal(await page.locator("#term-image-creator").textContent(), asset.creator);
        assert.equal(await page.locator("#term-image-license").getAttribute("href"), asset.licenseUrl);
        assert.equal(await page.locator("#term-image-content").evaluate(image => Boolean(image.closest("a"))), false);
        seen.add(question.id);
        if (!photographed.has(asset.id)) {
          await page.locator("#question-card").screenshot({ path: path.join(output, asset.id + "-desktop.png"), animations: "disabled" });
          await page.setViewportSize({ width: 390, height: 844 });
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
          await page.locator("#term-image").evaluate(element => element.scrollIntoView({ block: "start", behavior: "instant" }));
          await page.locator("#term-image").screenshot({ path: path.join(output, asset.id + "-mobile-image.png"), animations: "disabled" });
          await page.setViewportSize({ width: 844, height: 390 });
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
          await page.locator("#question-card").screenshot({ path: path.join(output, asset.id + "-landscape.png"), animations: "disabled" });
          await page.setViewportSize({ width: 1440, height: 1080 }); photographed.add(asset.id);
        }
      } else await hidden(page);
      await page.locator("#easy-action").click();
    }
    await page.close();
  }
  assert.equal(seen.size, result.audit.length); assert.equal(photographed.size, selection.images.length);
  assert.ok(answers.length >= seen.size);
  for (const failure of ["manifest", "image"]) {
    failManifest = failure === "manifest"; failImages = failure === "image";
    const page = await start(terms[0]); await hidden(page); await page.locator("#next-action").click();
    await page.waitForFunction(() => !document.querySelector("#next-action").disabled);
    if (failImages) await page.waitForFunction(() => document.querySelector("#term-image").classList.contains("is-hidden"));
    assert.equal(await page.locator("#term-image").isVisible(), false);
    if (failManifest) await hidden(page);
    assert.equal(await page.locator("#answer-panel").isVisible(), true);
    assert.equal(await page.locator("#easy-action").isEnabled(), true); await page.locator("#easy-action").click();
    await page.waitForFunction(prompt => document.querySelector("#question-text").textContent !== prompt && !document.querySelector("#next-action").disabled, getQuestionPromptForDisplay(terms[0].stages.beginner[0], false));
    await hidden(page); await page.close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(audioAttempts, []);
  assert.equal(requests.some(value => /\/v1\/.*(speech|rating-sound)/.test(value)), false);
  console.log(`日本史Kの関連画像：${seen.size}問・${photographed.size}枚の正しい割り当て、回答前の非表示と次問での消去、説明・作者・利用条件、三段階での表示、三つの画面幅、取得失敗時の学習継続、音声停止を確認しました。`);
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
