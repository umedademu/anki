import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { mindsetEditorFixture } from "./question-editor-fixture.mjs";
import { normalizeSettings } from "../worker/src/index.js";

const root = path.resolve(import.meta.dirname, "..", "public");
const { objects } = mindsetEditorFixture([2]);
const catalog = JSON.parse(objects.get("index.json"));
const english = structuredClone(catalog.subjects[0]);
Object.assign(english, { id: "english-vocabulary", title: "英単語", learningType: "vocabulary" });
for (const deck of english.decks) {
  const oldPath = deck.indexPath;
  deck.indexPath = oldPath.replace("/test/", "/english-vocabulary/");
  const index = JSON.parse(objects.get(oldPath));
  Object.assign(index, { id: english.id, title: english.title, learningType: "vocabulary" });
  for (const chunk of index.chunks) {
    const terms = JSON.parse(objects.get(chunk.path));
    for (const term of terms.terms) term.vocabulary = { meaning: "意味", exampleEnglish: "Example.", exampleJapanese: "例文です。" };
    chunk.path = chunk.path.replace("/test/", "/english-vocabulary/");
    objects.set(chunk.path, JSON.stringify(terms));
  }
  objects.set(deck.indexPath, JSON.stringify(index));
}
catalog.subjects.push(english);
objects.set("index.json", JSON.stringify(catalog));
const off = { history: { question: false, answer: false, explanation: false, mnemonic: false }, vocabulary: { word: false, meaning: false, exampleEnglish: false, exampleJapanese: false } };
let settings = normalizeSettings({ rate: 1.35, speechParts: off, ratingSoundVolume: 0, setupPreferences: { subjects: {} } });
let failSave = false;
let audioRequests = 0;
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const reply = (body, status = 200) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
    if (url.pathname.startsWith("/v1/")) {
      const buffers = []; for await (const part of req) buffers.push(part);
      const body = buffers.length ? JSON.parse(Buffer.concat(buffers).toString()) : {};
      if (/speech|rating-sound/.test(url.pathname)) { audioRequests++; reply({ error: "試験中の音声取得は禁止" }, 500); return; }
      if (url.pathname === "/v1/state") { reply({ settings, progress: { questions: {} }, session: null, studyDate: "2026-10-19" }); return; }
      if (url.pathname === "/v1/settings") {
        if (failSave) { reply({ error: "試験用の保存失敗" }, 503); return; }
        settings = normalizeSettings({ ...settings, ...body, speechParts: off });
        reply({ settings }); return;
      }
      reply({ session: body.session ?? body, updatedAt: new Date().toISOString() }); return;
    }
    if (url.pathname === "/config.js") { res.setHeader("Content-Type", "text/javascript"); res.end(`window.ANKI_CONFIG={dataBaseUrl:"/fixtures",progressApiBaseUrl:"http://127.0.0.1:${server.address().port}"};`); return; }
    if (url.pathname.startsWith("/fixtures/")) { res.setHeader("Content-Type", "application/json"); res.end(objects.get(url.pathname.slice(10)) ?? "{}"); return; }
    const target = path.resolve(root, "." + (url.pathname === "/" ? "/index.html" : url.pathname));
    if (!target.startsWith(root + path.sep)) throw new Error("公開範囲の外");
    res.setHeader("Content-Type", ({ ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" })[path.extname(target)] ?? "text/plain");
    res.end(await readFile(target));
  } catch (error) { res.writeHead(500); res.end(error.message); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext();
  context.setDefaultTimeout(15000);
  // 試験を始める前に自動読み上げをOFFにし、音声を実際に再生したら失敗させる。
  await context.addInitScript(parts => {
    localStorage.setItem("anki-cloud-access-key:v1", "subject-rate-test-key");
    localStorage.setItem("anki-speech-settings:v1", JSON.stringify({ autoSpeechEnabled: false, speechParts: parts }));
    window.__actualAudioCalls = 0;
    const forbidden = () => { window.__actualAudioCalls++; throw new Error("試験中の音声再生は禁止"); };
    speechSynthesis.cancel(); speechSynthesis.speak = forbidden;
    HTMLMediaElement.prototype.play = forbidden;
    if (window.AudioScheduledSourceNode) AudioScheduledSourceNode.prototype.start = forbidden;
  }, off);
  await context.route("https://**/*", route => route.abort());
  const speech = (await readFile(path.join(root, "speech.js"), "utf8")).replace("export function createSpeechController(", "function unusedSpeechController(");
  await context.route("**/speech.js*", route => route.fulfill({ contentType: "text/javascript", body: speech + `
    export function createSpeechController(options) {
      return window.__testSpeech = { supported:true,paused:false,currentTarget:null,getSettings:options.getSettings,
        stop(){},unlock(){},pause(){return false},resume(){return false},speak(){return true},
        preload(){return Promise.resolve()},stage(){return false} };
    }` }));
  const page = await context.newPage();
  const errors = []; let actualAudioCalls = 0;
  page.on("pageerror", error => errors.push(error.message));
  const go = async url => {
    actualAudioCalls += await page.evaluate(() => window.__actualAudioCalls ?? 0).catch(() => 0);
    await page.goto(url);
  };
  const range = (id, value, change = false) => page.locator("#" + id).evaluate((element, { value, change }) => {
    element.value = String(value); element.dispatchEvent(new Event("input", { bubbles: true }));
    if (change) element.dispatchEvent(new Event("change", { bubbles: true }));
  }, { value, change });
  const rate = () => page.evaluate(() => window.__testSpeech.getSettings().rate);

  await go(base + "/settings.html");
  await page.locator('#speech-rate-subject option[value="test"]').waitFor({ state: "attached" });
  await page.waitForFunction(() => document.querySelector("#settings-status").textContent.includes("接続しました"));
  assert.equal(await page.locator("#speech-rate").inputValue(), "1.35");
  await page.locator("#speech-rate-subject").selectOption("test"); await range("speech-rate", 1.85);
  await page.locator("#speech-rate-subject").selectOption("english-vocabulary"); await range("speech-rate", 0.9);
  await page.locator("#speech-rate-subject").selectOption("test");
  assert.equal(await page.locator("#speech-rate").inputValue(), "1.85", "科目切替でも未保存の入力を保持");
  await page.locator("#speech-rate-subject").selectOption("");
  // 別の設定を変更してから保存しても、その変更を速度設定で戻さない。つまみを離した時（change）に保存する。
  settings.setupPreferences.subjects.other = { ...settings.setupPreferences.subjects.other, sequentialEnabled: true };
  await range("speech-rate", 1.45, true);
  await page.waitForFunction(() => document.querySelector("#speech-settings-status").textContent.includes("保存し"));
  assert.equal(settings.rate, 1.45);
  assert.equal(settings.setupPreferences.subjects.test.speechRate, 1.85);
  assert.equal(settings.setupPreferences.subjects["english-vocabulary"].speechRate, 0.9);
  assert.equal(settings.setupPreferences.subjects.other.sequentialEnabled, true);
  await go(base + "/settings.html");
  await page.waitForFunction(() => document.querySelector("#settings-status").textContent.includes("接続しました"));
  await page.locator("#speech-rate-subject").selectOption("test");
  assert.equal(await page.locator("#speech-rate").inputValue(), "1.85", "再読込で科目別速度を復元");
  failSave = true;
  await range("speech-rate", 2, true);
  await page.locator("#speech-settings-status.is-error").waitFor();
  assert.equal(settings.setupPreferences.subjects.test.speechRate, 1.85);
  assert.equal(await page.locator("#speech-rate").inputValue(), "2", "保存失敗でも入力を保持");
  failSave = false;

  const study = async (id, stream = false, mode = "memorize") => {
    await go(`${base}/?subject=${id}&deck=deck-1&view=setup`);
    await page.waitForFunction(() => !document.querySelector("#start-study").disabled);
    if (stream) await page.locator("#vocabulary-stream-enabled").check();
    await page.locator(`input[name="study-mode"][value="${mode}"]`).check();
    await page.locator("#start-study").click();
    await page.locator("#study-shell").waitFor({ state: "visible" });
    await page.waitForFunction(() => !document.querySelector("#study-menu-trigger").disabled);
    await page.locator("#study-menu-trigger").click();
  };
  await study("test");
  assert.equal(await page.locator("#study-menu-speech-rate").inputValue(), "1.85");
  await range("study-menu-speech-rate", 2.3, true);
  await page.waitForFunction(() => document.querySelector("#study-menu-status").textContent.includes("保存しました"));
  assert.equal(settings.rate, 1.45, "学習中の変更で共通速度を変更しない");
  assert.equal(settings.setupPreferences.subjects.test.speechRate, 2.3);
  assert.equal(settings.setupPreferences.subjects["english-vocabulary"].speechRate, 0.9);
  assert.equal(await rate(), 2.3);
  await study("english-vocabulary", true);
  assert.equal(await rate(), 0.9);
  assert.equal(await page.locator("#study-menu-speech-rate").inputValue(), "0.9");
  await page.locator("#study-menu-close").click();
  assert.equal(await page.locator("#vocabulary-stream-panel").isVisible(), true);
  await study("test");
  assert.equal(await rate(), 2.3, "元の科目へ戻ると保存した速度を使用");
  await study("test", false, "listen-answer");
  assert.equal(await rate(), 2.3, "聞き流しでも同じ科目の速度を使用");
  assert.equal(await page.locator("#study-menu-speech-rate").inputValue(), "2.3");

  await go(`${base}/?subject=mindset&deck=deck-1&view=setup`);
  await page.locator("#mindset-player-panel").waitFor({ state: "visible" });
  assert.equal(await page.locator("#mindset-speech-rate").inputValue(), "1.45", "未設定の科目は共通速度を使用");
  const mindsetSaved = page.waitForResponse(response => response.url().includes("/v1/settings") && response.status() === 200);
  await range("mindset-speech-rate", 1.6, true);
  await mindsetSaved;
  assert.equal(settings.setupPreferences.subjects.mindset.speechRate, 1.6);
  assert.equal(settings.rate, 1.45);
  assert.equal(settings.setupPreferences.subjects.test.speechRate, 2.3);
  assert.equal(await rate(), 1.6);
  await go(`${base}/?subject=mindset&deck=deck-1&view=setup`);
  await page.locator("#mindset-player-panel").waitFor({ state: "visible" });
  assert.equal(await page.locator("#mindset-speech-rate").inputValue(), "1.6");
  actualAudioCalls += await page.evaluate(() => window.__actualAudioCalls ?? 0);
  assert.equal(actualAudioCalls, 0); assert.equal(audioRequests, 0); assert.deepEqual(errors, []);
  console.log("科目別速度の画面検証完了: 複数科目の設定・保存失敗・共通速度の保持・暗記と聞き流し・3語表示・マインドセット・再読込を音声なしで確認");
} finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
}
