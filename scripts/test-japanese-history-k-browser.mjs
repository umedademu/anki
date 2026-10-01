import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { loadJapaneseHistoryK, appendJapaneseKSubject } from "./japanese-history-k.mjs";

const root = path.resolve(import.meta.dirname, "../public"), plan = await loadJapaneseHistoryK();
const objects = new Map(), cloudBase = "https://pub-76ffbe2829114a5cbaa433db45872267.r2.dev";
async function cloudJson(key) {
  const response = await fetch(`${cloudBase}/${key}?japaneseKTest=${Date.now()}`, { signal: AbortSignal.timeout(30000) });
  assert.ok(response.ok, `Cloudflareの${key}を取得できません。`);
  const value = await response.json(); objects.set(key, JSON.stringify(value)); return value;
}
// 現行科目一覧をCloudflareから取得し、新規原稿を試験用の通信へ組み合わせる。
const original = await cloudJson("index.json");
const catalog = original.subjects.some(subject => subject.id === plan.subject.id) ? original : appendJapaneseKSubject(original, plan.subject);
objects.set("index.json", JSON.stringify(catalog));
for (const object of plan.objects) objects.set(object.key, JSON.stringify(object.value));
objects.set("term-images.json", JSON.stringify({ schemaVersion: 2, assets: [], assignments: [] }));
const off = { history: { question: false, answer: false, explanation: false, mnemonic: false }, vocabulary: { word: false, meaning: false, exampleEnglish: false, exampleJapanese: false } };
let settings = { autoSpeechEnabled: false, speechParts: off, setupPreferences: { subjects: {} }, studyTimeLimitSeconds: 600, ratingSoundVolume: 0 };
const sessions = new Map(), progress = new Map(), answers = [], requests = [];
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost"); requests.push(url.pathname);
    const reply = (value, status = 200) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(value)); };
    if (url.pathname.startsWith("/v1/")) {
      const buffers = []; for await (const part of req) buffers.push(part);
      const body = buffers.length ? JSON.parse(Buffer.concat(buffers).toString()) : {}, dataset = url.searchParams.get("dataset");
      if (url.pathname === "/v1/state") { reply({ settings, progress: { questions: progress.get(dataset) ?? {} }, session: sessions.get(dataset), studyDate: "2026-10-02" }); return; }
      if (url.pathname === "/v1/settings") { settings = { ...settings, ...body, autoSpeechEnabled: false, speechParts: off }; reply({ settings }); return; }
      if (url.pathname === "/v1/study-session") {
        if (req.method === "DELETE") sessions.delete(dataset); else sessions.set(dataset, body);
        reply({ session: sessions.get(dataset) }); return;
      }
      if (url.pathname.startsWith("/v1/study-answer/")) {
        answers.push({ dataset, body }); sessions.set(body.sessionDatasetVersion ?? dataset, body.session);
        const id = decodeURIComponent(url.pathname.split("/").pop());
        progress.set(dataset, { ...progress.get(dataset), [id]: body.record });
        reply({ session: body.session, updatedAt: new Date().toISOString() }); return;
      }
      if (url.pathname.startsWith("/v1/study-time/")) {
        if (body.session) sessions.set(body.sessionDatasetVersion ?? dataset, body.session);
        reply({ session: body.session, studyDate: "2026-10-02" }); return;
      }
      throw new Error("未対応の試験用通信: " + url.pathname);
    }
    if (url.pathname === "/config.js") {
      res.setHeader("Content-Type", "text/javascript");
      res.end(`window.ANKI_CONFIG={dataBaseUrl:"/data",progressApiBaseUrl:"http://127.0.0.1:${server.address().port}"};`); return;
    }
    if (url.pathname.startsWith("/data/")) {
      const key = url.pathname.slice(6);
      if (!objects.has(key)) await cloudJson(key);
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(objects.get(key)); return;
    }
    const target = path.resolve(root, "." + (url.pathname === "/" ? "/index.html" : url.pathname));
    if (!target.startsWith(root + path.sep)) throw new Error("公開フォルダー外");
    res.setHeader("Content-Type", ({ ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" })[path.extname(target)] ?? "text/plain");
    res.end(await readFile(target));
  } catch (error) { res.writeHead(500); res.end(error.message); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext(); context.setDefaultTimeout(15000);
  // 試験開始前に全自動音声をOFFにし、実際の音声再生も遮断する。
  await context.addInitScript(parts => {
    localStorage.setItem("anki-cloud-access-key:v1", "japanese-k-test-only");
    localStorage.setItem("anki-speech-settings:v1", JSON.stringify({ autoSpeechEnabled: false, speechParts: parts }));
    window.testAudioAttempts = 0;
    speechSynthesis.cancel(); speechSynthesis.speak = () => { window.testAudioAttempts++; };
    HTMLMediaElement.prototype.play = () => { window.testAudioAttempts++; return Promise.resolve(); };
    if (window.AudioScheduledSourceNode) AudioScheduledSourceNode.prototype.start = () => { window.testAudioAttempts++; };
  }, off);
  await context.route("https://**/*", route => route.abort());
  const cloudProgress = (await readFile(path.join(root, "cloud-progress.js"), "utf8")).replace("export function normalizeSpeechParts(value)", "function unusedNormalizeSpeechParts(value)");
  await context.route("**/cloud-progress.js*", route => route.fulfill({ contentType: "text/javascript", body: cloudProgress + `\nexport function normalizeSpeechParts() { return ${JSON.stringify(off)}; }` }));
  const speechModule = (await readFile(path.join(root, "speech.js"), "utf8")).replace("export function createSpeechController(", "function unusedSpeechController(");
  await context.route("**/speech.js*", route => route.fulfill({ contentType: "text/javascript", body: speechModule + `\nexport function createSpeechController() { return { supported: true, paused: false, currentTarget: null, stop() {}, unlock() {}, pause() { return false; }, resume() { return false; }, speak() { return false; }, preload() { return Promise.resolve(); } }; }` }));
  const page = await context.newPage(), errors = []; page.on("pageerror", error => errors.push(error.message));
  const shown = id => page.locator("#" + id).waitFor({ state: "visible" });
  const ready = () => page.waitForFunction(() => document.querySelector("#setup-panel").getAttribute("aria-busy") !== "true" && !document.querySelector("#start-study").disabled);
  await page.goto(base + "/");
  await page.getByRole("button", { name: "日本史K", exact: true }).click(); await shown("setup-panel"); await ready();
  assert.equal(await page.locator("#deck-filter .deck-filter-name").textContent(), "第6章 現代");
  assert.equal(await page.locator("#deck-filter .deck-filter-count").textContent(), "79問");
  assert.match(await page.locator("#chapter-selection-summary").textContent(), /1パート/);
  assert.match(await page.locator("#selection-summary").textContent(), /73問/);
  assert.equal(await page.locator("#question-type-field").isVisible(), true);
  await page.locator("#chapter-selection-summary").click();
  assert.equal(await page.locator(".chapter-picker .deck-filter-name").textContent(), "1 イ ＧＨＱの占領政策");
  await page.getByRole("button", { name: "全パートを解除" }).click();
  assert.equal(await page.locator("#start-study").isDisabled(), true);
  await page.getByRole("button", { name: "全パートを選択" }).click(); await ready();
  await page.locator("#question-type-summary").click();
  assert.match(await page.locator('#question-type-options label').filter({ hasText: "時期" }).textContent(), /6問/);
  await page.locator('[data-question-types="none"]').click();
  assert.equal(await page.locator("#start-study").isDisabled(), true);
  await page.locator('#question-type-options input[value="relation"]').check(); await ready();
  assert.match(await page.locator("#selection-summary").textContent(), /16問/);
  await page.locator('[data-question-types="all"]').click();
  assert.match(await page.locator("#selection-summary").textContent(), /79問/);
  await page.locator("#setup-shuffle").uncheck();
  const images = path.resolve(import.meta.dirname, "../.wrangler/japanese-history-k/screenshots"); await mkdir(images, { recursive: true });
  await page.screenshot({ path: path.join(images, "setup-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: path.join(images, "setup-mobile.png"), fullPage: true });
  await page.locator("#start-study").click(); await shown("study-shell");
  assert.equal(await page.locator("#subject-name").textContent(), "日本史K｜第6章 現代");
  assert.equal(await page.locator("#question-speech").getAttribute("aria-pressed"), "false");
  assert.equal(await page.locator("#question-text").textContent(), plan.terms[0].stages.beginner[0].prompt);
  assert.equal(await page.locator("#term-overview").isVisible(), false);
  await page.locator("#next-action").click();
  assert.match(await page.locator("#answer-text").textContent(), /ＧＨＱ/);
  assert.match(await page.locator("#term-overview-text").textContent(), /原文の根拠：413頁/);
  await page.screenshot({ path: path.join(images, "answer-mobile.png"), fullPage: true });
  await page.locator("#good-action").click();
  await page.waitForFunction(prompt => document.querySelector("#question-text").textContent === prompt, plan.terms[1].stages.beginner[0].prompt);
  assert.equal(answers.length, 1);
  assert.equal(answers[0].dataset, plan.index.version);
  assert.equal(answers[0].body.activity.subjectId, plan.subject.id);
  await page.reload(); await shown("study-shell");
  assert.equal(await page.locator("#question-text").textContent(), plan.terms[1].stages.beginner[0].prompt);
  // 共有化した章表示が、既存の世界史SOにも同じ章名で適用される。
  const so = catalog.subjects.find(subject => subject.id === "world-history-so");
  await page.goto(`${base}/?subject=world-history-so&deck=${so.defaultDeckId}&view=setup`); await shown("setup-panel"); await ready();
  assert.deepEqual(await page.locator("#deck-filter .deck-filter-name").allTextContents(), so.chapterGroups.map(group => group.title));
  assert.equal(await page.locator("#question-type-field").isVisible(), true);
  assert.deepEqual(errors, []);
  assert.equal(await page.evaluate(() => window.testAudioAttempts), 0);
  assert.equal(requests.some(url => /\/v1\/.*(speech|rating-sound)/.test(url)), false);
  assert.ok([...sessions.keys()].every(key => key === plan.index.version));
  console.log("日本史Kの画面確認：科目追加、章と小項目、種類選択73・79問、全解除、回答と原文根拠、評価保存と再開、スマートフォン幅、世界史SOの章表示、音声停止を確認しました。");
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
