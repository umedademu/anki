import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { editorFixture } from "./question-editor-fixture.mjs";

const root = path.resolve(import.meta.dirname, "..", "public");
const { objects } = editorFixture();
objects.set("term-images.json", JSON.stringify({ schemaVersion: 2, assets: [], assignments: [] }));
// 本番の問題はCloudflareから読み取り、試験中の保存は手元の模擬窓口だけに行う。
const cloudBase = "https://pub-76ffbe2829114a5cbaa433db45872267.r2.dev";
async function cloudJson(key) {
  const response = await fetch(`${cloudBase}/${key}`);
  assert.ok(response.ok);
  const value = await response.json();
  objects.set(key, JSON.stringify(value));
  return value;
}
const catalog = await cloudJson("index.json");
const so = catalog.subjects.find((subject) => subject.id === "world-history-so");
// この確認は既存の第6章だけを取り出す。複数章の選択は book-browser で確認する。
const islamicIds = so.chapterGroups?.find(group => group.number === 6)?.deckIds;
if (islamicIds) {
  so.decks = so.decks.filter(deck => islamicIds.includes(deck.id));
  so.termCount = so.questionCount = so.decks.reduce((sum,deck) => sum + deck.questionCount,0);
  delete so.chapterGroups;
  objects.set("index.json", JSON.stringify(catalog));
}
assert.equal(so.decks.length, 9);
await Promise.all(so.decks.map(async (deck) => {
  const index = await cloudJson(deck.indexPath);
  await Promise.all(index.chunks.map((chunk) => cloudJson(chunk.path)));
}));
const off = { history: { question: false, answer: false, explanation: false, mnemonic: false }, vocabulary: { word: false, meaning: false, exampleEnglish: false, exampleJapanese: false } };
let settings = { autoSpeechEnabled: false, speechParts: off, setupPreferences: { subjects: {} }, studyTimeLimitSeconds: 600, ratingSoundVolume: 0 };
const sessions = new Map();
const progress = new Map();
const requests = [];
const controls = { catalogDelay: 0, settingsDelay: 0, imagesDelay: 0, catalogFailure: false, deckDelay: 0, failSessionSave: false };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    requests.push(url.pathname + url.search);
    const reply = (value, status = 200) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(value)); };
    if (url.pathname.startsWith("/v1/")) {
      const buffers = []; for await (const part of req) buffers.push(part);
      const body = buffers.length ? JSON.parse(Buffer.concat(buffers).toString()) : {};
      const dataset = url.searchParams.get("dataset");
      if (url.pathname === "/v1/state") {
        if (!dataset) await sleep(controls.settingsDelay);
        reply({ settings, progress: { questions: progress.get(dataset) ?? {} }, session: sessions.get(dataset), studyDate: "2026-09-17" }); return;
      }
      if (url.pathname === "/v1/settings") {
        settings = { ...settings, ...body, autoSpeechEnabled: false, speechParts: off };
        reply({ settings }); return;
      }
      if (url.pathname.startsWith("/v1/study-answer/")) {
        sessions.set(body.sessionDatasetVersion ?? dataset, body.session);
        progress.set(dataset, { ...progress.get(dataset), [decodeURIComponent(url.pathname.split("/").pop())]: body.record });
        reply({ session: body.session, updatedAt: new Date().toISOString() }); return;
      }
      if (url.pathname === "/v1/study-session") {
        if (controls.failSessionSave) { reply({ error: "試験用の保存失敗" }, 503); return; }
        if (req.method === "DELETE") sessions.delete(dataset);
        else sessions.set(dataset, body);
        reply({ session: sessions.get(dataset) }); return;
      }
      if (url.pathname.startsWith("/v1/study-time/")) {
        if (body.session) sessions.set(body.sessionDatasetVersion ?? dataset, body.session);
        reply({ session: body.session, studyDate: "2026-09-17" }); return;
      }
      throw new Error("未対応の試験用通信: " + url.pathname);
    }
    if (url.pathname === "/config.js") {
      res.setHeader("Content-Type", "text/javascript");
      res.end(`window.ANKI_CONFIG={dataBaseUrl:"/data",progressApiBaseUrl:"http://127.0.0.1:${server.address().port}"};`); return;
    }
    if (url.pathname.startsWith("/data/")) {
      if (url.pathname === "/data/index.json") {
        await sleep(controls.catalogDelay);
        if (controls.catalogFailure) { reply({ error: "試験用の通信失敗" }, 503); return; }
      } else if (url.pathname === "/data/term-images.json") await sleep(controls.imagesDelay);
      else await sleep(controls.deckDelay);
      const body = objects.get(url.pathname.slice(6));
      res.writeHead(body ? 200 : 404, { "Content-Type": "application/json" }); res.end(body ?? "{}"); return;
    }
    const target = path.resolve(root, "." + (url.pathname === "/" ? "/index.html" : url.pathname));
    if (!target.startsWith(root + path.sep)) throw new Error("公開フォルダー外");
    const types = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };
    res.setHeader("Content-Type", types[path.extname(target)] ?? "text/plain"); res.end(await readFile(target));
  } catch (error) { res.writeHead(500); res.end(error.message); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext();
  context.setDefaultTimeout(15000);
  // 試験開始前に自動読み上げをOFFにし、実音声も再生させない。
  await context.addInitScript((parts) => {
    localStorage.setItem("anki-cloud-access-key:v1", "navigation-test-key");
    localStorage.setItem("anki-speech-settings:v1", JSON.stringify({ autoSpeechEnabled: false, speechParts: parts }));
    speechSynthesis.cancel(); speechSynthesis.speak = () => {};
    HTMLMediaElement.prototype.play = () => Promise.resolve();
    if (window.AudioScheduledSourceNode) AudioScheduledSourceNode.prototype.start = () => {};
  }, off);
  await context.route("https://**/*", (route) => route.abort());
  const cloudProgress = (await readFile(path.join(root, "cloud-progress.js"), "utf8")).replace("export function normalizeSpeechParts(value)", "function unusedNormalizeSpeechParts(value)");
  await context.route("**/cloud-progress.js*", route => route.fulfill({ contentType: "text/javascript", body: cloudProgress + `\nexport function normalizeSpeechParts() { return ${JSON.stringify(off)}; }` }));
  const speechModule = (await readFile(path.join(root, "speech.js"), "utf8"))
    .replace("export function createSpeechController(", "function unusedSpeechController(");
  await context.route("**/speech.js*", (route) => route.fulfill({
    contentType: "text/javascript",
    body: speechModule + `\nexport function createSpeechController() {
      return { supported: true, paused: false, currentTarget: null,
        stop() {}, unlock() {}, pause() { return false; }, resume() { return false; },
        speak() { return false; }, preload() { return Promise.resolve(); } };
    }`,
  }));
  const page = await context.newPage(), errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const shown = (id) => page.locator("#" + id).waitFor({ state: "visible" });
  const ready = () => page.waitForFunction(() => !document.querySelector("#start-study").disabled);
  await page.goto(base + "/?subject=world-history-so&view=setup");
  await shown("setup-panel"); await ready();
  assert.equal(await page.locator("#deck-filter > .deck-filter-choice .deck-filter-name").textContent(), "第6章 イスラーム世界");
  assert.equal(await page.locator("#deck-filter > .deck-filter-choice").count(), 1);
  assert.equal(await page.locator("#deck-filter .chapter-picker").count(), 0);
  assert.equal(await page.locator("#chapter-field .chapter-picker").count(), 1);
  assert.equal(await page.evaluate(() => {
    const deckField = document.querySelector("#deck-filter").closest("fieldset");
    const chapterField = document.querySelector("#chapter-field");
    return deckField.parentElement === chapterField.parentElement && !deckField.contains(chapterField);
  }), true, "デッキ選択と章選択は同じ階層の独立した項目");
  assert.equal(await page.locator("#deck-filter > .deck-filter-choice .deck-filter-count").textContent(), "357問");
  assert.deepEqual(await page.locator(".chapter-picker .deck-filter-name").allTextContents(), so.decks.map(deck => deck.datasetLabel.split("｜").slice(1).join(" ")));
  const deckCheckbox = page.locator('input[name="chapter-deck-filter"]');
  assert.equal(await deckCheckbox.isChecked(), true);
  assert.equal(await page.locator(".chapter-picker input").count(), 9);
  assert.equal(await page.locator(".chapter-picker").getAttribute("open"), null);
  await page.locator("#chapter-selection-summary").click();
  await page.locator('.chapter-picker input[value="deck-1"]').click();
  assert.equal(await page.locator('.chapter-picker input[value="deck-1"]').isChecked(), true);
  assert.match(await page.locator("#cloud-status").textContent(), /パートは1つ以上/);
  await page.locator('.chapter-picker input[value="deck-2"]').check(); await ready();
  await page.waitForFunction(() => document.querySelector("#setup-panel").getAttribute("aria-busy") !== "true");
  assert.match(await page.locator("#chapter-selection-summary").textContent(), /2 \/ 9パート/);
  await page.waitForFunction(() => new URL(location.href).searchParams.getAll("deck").includes("deck-2"));
  await page.reload(); await shown("setup-panel"); await ready();
  assert.equal(await page.locator('.chapter-picker input:checked').count(), 2);
  await page.locator("#chapter-selection-summary").click();
  await page.getByRole("button", { name: "すべてのパートを選択" }).click();
  await page.waitForFunction(() => document.querySelector("#setup-panel").getAttribute("aria-busy") !== "true");
  await ready();
  assert.equal(await page.locator('.chapter-picker input:checked').count(), 9);
  await deckCheckbox.click();
  assert.equal(await deckCheckbox.isChecked(), true);
  assert.match(await page.locator("#cloud-status").textContent(), /デッキは1つ以上/);
  assert.match(await page.locator("#chapter-selection-summary").textContent(), /すべて（9パート）/);
  assert.match(await page.locator("#selection-summary").textContent(), /357/);
  assert.equal(await page.locator("#question-type-field").isVisible(), true);
  await page.locator("#chapter-selection-summary").click();
  await page.locator("#question-type-summary").click();
  assert.match(await page.locator('#question-type-options label').filter({ hasText: "時期" }).textContent(), /0問/);
  await page.locator('[data-question-types="none"]').click();
  assert.equal(await page.locator("#start-study").isDisabled(), true);
  await page.locator('#question-type-options input[value="time"]').check();
  assert.equal(await page.locator("#start-study").isDisabled(), true);
  await page.locator('#question-type-options input[value="time"]').uncheck();
  await page.locator('#question-type-options input[value="person"]').check();
  await ready();
  assert.match(await page.locator("#selection-summary").textContent(), /69問/);
  await page.locator('#question-type-options input[value="place"]').check();
  assert.match(await page.locator("#selection-summary").textContent(), /99問/);
  await page.locator('#question-type-options input[value="place"]').uncheck();
  // 保存した問題種類が、再読み込み後も章の設定とともに戻る。
  for (let attempt = 0; attempt < 100 && settings.setupPreferences?.subjects?.[so.id]?.selectedQuestionTypes?.join() !== "person"; attempt++) await sleep(50);
  assert.deepEqual(settings.setupPreferences.subjects[so.id].selectedQuestionTypes, ["person"]);
  await page.reload(); await shown("setup-panel"); await ready();
  assert.deepEqual(await page.locator('#question-type-options input:checked').evaluateAll(inputs => inputs.map(input => input.value)), ["person"]);
  assert.match(await page.locator("#selection-summary").textContent(), /69問/);
  await page.locator("#question-type-summary").click();
  await page.locator('[data-question-types="all"]').click();
  await page.locator("#question-type-summary").click();
  assert.match(await page.locator("#selection-summary").textContent(), /357/);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator("#start-study").click(); await shown("study-shell");
  assert.equal(await page.locator("#subject-name").textContent(), "世界史SO｜第6章 イスラーム世界");
  assert.ok([...sessions.keys()].some((key) => key.startsWith("mix-world-history-so-")));
  settings.setupPreferences.subjects[so.id].selectedDeckIds = ["deck-10", "deck-11", "deck-6"];
  await page.goto(base + "/?subject=world-history-so&view=setup"); await shown("setup-panel"); await ready();
  assert.deepEqual(await page.locator('.chapter-picker input:checked').evaluateAll(inputs => inputs.map(input => input.value)), ["deck-5", "deck-9"]);
  assert.deepEqual(errors, []);
  assert.equal(requests.some((url) => /\/v1\/.*(speech|rating-sound)/.test(url)), false);
  console.log("世界史SO確認完了: Cloudflare現行357問、9パート、問題種類の複数選択・全解除・時期0問・件数・保存復元・狭い画面・従来の保存範囲・音声停止");
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
