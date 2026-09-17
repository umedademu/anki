import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { editorFixture } from "./question-editor-fixture.mjs";

const root = path.resolve(import.meta.dirname, "..", "public");
const { objects } = editorFixture();
const template = new Map(objects);
objects.clear();
const subjects = [];
for (const subject of ["world-history", "world-history-s"]) {
  for (const [key, value] of template) {
    const renamed = value.replaceAll('test-deck-', `${subject}-deck-`).replaceAll('subjects/test/', `subjects/${subject}/`).replaceAll('"test"', JSON.stringify(subject));
    const object = JSON.parse(renamed);
    if (key === "index.json") { subjects.push(object.subjects[0]); continue; }
    if (object.terms) {
      const questions = object.terms[0].stages.beginner;
      questions[0].type = "content";
      questions[0].prompt = "試験用の出来事は何年？";
      if (questions[1]) questions[1].type = "time";
    }
    objects.set(key.replace('subjects/test/', `subjects/${subject}/`), JSON.stringify(object));
  }
}
objects.set("index.json", JSON.stringify({schemaVersion:3, subjects}));

objects.set("term-images.json", JSON.stringify({ schemaVersion: 2, assets: [], assignments: [] }));
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
  const speechModule = (await readFile(path.join(root, "speech.js"), "utf8"))
    .replace("export function createSpeechController(", "function unusedSpeechController(");
  await context.route("**/speech.js", (route) => route.fulfill({
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
  const checkRoute = (view, subject = "test") => {
    const url = new URL(page.url());
    assert.equal(url.searchParams.get("view"), view);
    assert.equal(url.searchParams.get("subject"), subject);
  };


  for (const subject of ["world-history", "world-history-s"]) {
    await page.goto(base + `/?subject=${subject}&view=setup&deck=deck-1`);
    await shown("setup-panel"); await ready();
    assert.equal(await page.locator("#time-question-field").isVisible(), false);
    await page.locator("#question-type-summary").click();
    assert.equal(await page.locator('#question-type-options input').count(), 11);
    assert.equal(await page.locator('#question-type-options input[value="time"]').isChecked(), false);
    await page.locator('[data-question-types="none"]').click();
    await page.waitForFunction(() => document.querySelector("#start-study").disabled);
    await page.waitForFunction(() => document.querySelector("#cloud-status").textContent.includes("共有しました"));
    assert.deepEqual(settings.setupPreferences.subjects[subject].selectedQuestionTypes, []);
    await page.reload(); await shown("setup-panel");
    await page.waitForFunction(() => document.querySelector("#question-type-summary").textContent.includes("１種類以上"));
    await page.locator("#question-type-summary").click();
    await page.locator('#question-type-options input[value="content"]').check();
    await ready();
    await page.waitForFunction(() => document.querySelector("#cloud-status").textContent.includes("共有しました"));
    assert.deepEqual(settings.setupPreferences.subjects[subject].selectedQuestionTypes, ["content"]);
    await page.reload(); await shown("setup-panel"); await ready();
    await page.locator("#question-type-summary").click();
    assert.equal(await page.locator('#question-type-options input[value="content"]').isChecked(), true);
    assert.equal(await page.locator('#question-type-options input:checked').count(), 1);
    await page.locator("#question-type-summary").press("Escape");
    assert.equal(await page.locator("#question-type-field").getAttribute("open"), null);
    await page.locator("#start-study").click(); await shown("study-shell");
    assert.match(await page.locator("#question-text").textContent(), /何年/);
    const saved = [...sessions.values()].at(-1);
    assert.deepEqual(saved.selectedQuestionTypes, ["content"]);
    assert.equal(saved.tasks.length, 1);
    await page.reload(); await shown("study-shell");
    assert.match(await page.locator("#question-text").textContent(), /何年/);
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(base + "/?subject=world-history&view=setup&deck=deck-1");
  await shown("setup-panel"); await ready();
  await page.locator("#question-type-summary").click();
  const box = await page.locator(".question-type-menu").boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 375, "狭い画面内に選択肢が収まる");
  await page.locator('[data-question-types="all"]').click();
  assert.equal(await page.locator('#question-type-options input:checked').count(), 11);
  assert.deepEqual(errors, []);
  assert.equal(requests.some(url => /\/v1\/.*(speech|rating-sound)/.test(url)), false);
  console.log("問題形式選択の画面確認完了: ２科目・旧設定移行・全解除・再読込・保存・分類による出題・途中復元・狭い画面・音声なし");
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
