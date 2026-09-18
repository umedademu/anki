import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { editorFixture } from "./question-editor-fixture.mjs";

const root = path.resolve(import.meta.dirname, "..", "public");
const { objects } = editorFixture();
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
  const checkRoute = (view, subject = "test") => {
    const url = new URL(page.url());
    assert.equal(url.searchParams.get("view"), view);
    assert.equal(url.searchParams.get("subject"), subject);
  };

  controls.catalogDelay = 700; controls.settingsDelay = 2200; controls.imagesDelay = 1200;
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await shown("subject-panel");
  assert.equal(await page.locator("#loading-panel").isVisible(), false);
  await page.locator('[data-subject-id="test"]').waitFor();
  assert.equal(await page.locator("#routine-dashboard").isVisible(), false, "科目一覧は設定を待たず表示");
  assert.equal(requests.includes("/data/term-images.json"), false, "起動時に画像一覧を読まない");
  await page.locator('[data-subject-id="test"]').click();
  await shown("setup-panel"); await ready();
  checkRoute("setup");
  controls.catalogDelay = 0; controls.settingsDelay = 0; controls.imagesDelay = 0;
  assert.ok(requests.includes("/data/term-images.json"));
  assert.equal(new URL(page.url()).searchParams.get("deck"), "deck-1");
  await page.reload(); await shown("setup-panel"); await ready(); checkRoute("setup");
  await page.locator("#start-study").click(); await shown("study-shell");
  await page.waitForFunction(() => !document.querySelector("#question-card").classList.contains("is-hidden"));
  checkRoute("study");
  const firstQuestion = await page.locator("#question-text").textContent();
  const studyUrl = page.url();
  const historyLength = await page.evaluate(() => history.length);
  await page.locator("#next-action").click();
  await page.locator("#good-action").click();
  await page.waitForFunction((before) => document.querySelector("#question-text").textContent !== before, firstQuestion);
  const question = await page.locator("#question-text").textContent();
  assert.equal(page.url(), studyUrl);
  assert.equal(await page.evaluate(() => history.length), historyLength, "問題を進めても履歴を増やさない");
  await page.goBack(); await shown("setup-panel"); await ready(); checkRoute("setup");
  await page.goForward(); await shown("study-shell"); checkRoute("study");
  assert.equal(await page.locator("#question-text").textContent(), question);
  await page.reload(); await shown("study-shell"); checkRoute("study");
  assert.equal(await page.locator("#question-text").textContent(), question);
  await page.locator("#study-menu-trigger").click();
  await page.locator("#study-menu-home").click(); await shown("subject-panel");
  assert.equal(new URL(page.url()).search, "");
  await page.goto(studyUrl); await shown("study-shell"); checkRoute("study");

  // 保存失敗では現在の問題を保持し、再試行できる。
  controls.failSessionSave = true;
  await page.locator("#study-menu-trigger").click();
  await page.locator("#study-menu-home").click();
  await page.waitForFunction(() => document.querySelector("#unlock-notice").textContent.includes("保存できませんでした"));
  assert.equal(await page.locator("#study-shell").isVisible(), true);
  checkRoute("study");
  assert.equal(await page.locator("#question-text").textContent(), question);
  controls.failSessionSave = false;
  await page.locator("#study-menu-trigger").click();
  await page.locator("#study-menu-home").click(); await shown("subject-panel");

  // 選択されたデッキも直接URLと再読み込みで維持する。
  await page.goto(base + "/?subject=test&view=setup&deck=deck-2");
  await shown("setup-panel"); await ready();
  assert.equal(await page.locator('#deck-filter input[value="deck-2"]').isChecked(), true);
  assert.equal(await page.locator('#deck-filter input[value="deck-1"]').isChecked(), false);
  await page.reload(); await shown("setup-panel"); await ready();
  assert.equal(await page.locator('#deck-filter input[value="deck-2"]').isChecked(), true);

  // 保存記録がないURLは開始画面へ戻し、新しい一周を勝手に作らない。
  const countBefore = sessions.size;
  await page.goto(base + "/?subject=test&view=study&deck=deck-2");
  await shown("setup-panel"); await ready(); checkRoute("setup");
  assert.equal(sessions.size, countBefore);
  assert.match(await page.locator("#cloud-status").textContent(), /再開できる学習記録がありません/);

  // 聞き流しURLは停止状態で復元し、自動で問題を進めない。
  controls.settingsDelay = 0; controls.imagesDelay = 0; controls.catalogDelay = 0;
  const listenUrl = new URL(studyUrl); listenUrl.searchParams.set("mode", "listen-answer");
  await page.goto(listenUrl.href); await shown("study-shell"); checkRoute("study");
  assert.match(await page.locator("#listening-toggle-action").getAttribute("aria-label") ?? await page.locator("#listening-toggle-action").textContent(), /再生|再開/);

  // 読み込み中に戻っても、遅れて完了した科目へ引き戻されない。
  await page.locator("#study-menu-trigger").click();
  await page.locator("#study-menu-home").click(); await shown("subject-panel");
  controls.deckDelay = 400;
  await page.locator('[data-subject-id="test"]').click(); await shown("loading-panel");
  await page.goBack(); await shown("subject-panel");
  await sleep(1000);
  assert.equal(await page.locator("#subject-panel").isVisible(), true);
  assert.equal(new URL(page.url()).search, "");
  controls.deckDelay = 0;

  await page.goto(base + "/?subject=unknown&view=study");
  await shown("subject-panel");
  await page.waitForURL(base + "/");
  assert.match(await page.locator("#subject-loading-status").textContent(), /見つかりません/);

  controls.catalogFailure = true;
  await page.goto(base); await shown("subject-panel");
  await page.locator("#retry-subjects").waitFor({ state: "visible" });
  assert.equal(await page.locator("#loading-panel").isVisible(), false);
  controls.catalogFailure = false;
  await page.locator("#retry-subjects").click(); await page.locator('[data-subject-id="test"]').waitFor();

  // オリジナルも入力・開始・学習をそれぞれ復元する。
  await page.locator('[data-original-study]').click(); await shown("original-panel"); checkRoute("input", "original");
  await page.locator("#original-input").fill("試験問題" + String.fromCharCode(9) + "試験回答");
  await page.locator('[data-original="start"]').click(); await shown("setup-panel"); await ready(); checkRoute("setup", "original");
  await page.locator("#start-study").click(); await shown("study-shell"); checkRoute("study", "original");
  await page.reload(); await shown("study-shell"); checkRoute("study", "original");
  assert.match(await page.locator("#question-text").textContent(), /試験問題/);
  await page.goto(base + "/changelog.html");
  await page.goBack(); await shown("study-shell"); checkRoute("study", "original");
  assert.match(await page.locator("#question-text").textContent(), /試験問題/);
  assert.deepEqual(errors, []);
  assert.equal(requests.some((url) => /\/v1\/.*(speech|rating-sound)/.test(url)), false, "音声を取得・再生しない: " + JSON.stringify(requests.filter((url) => /\/v1\/.*(speech|rating-sound)/.test(url))));
  console.log("画面遷移検証完了: 段階表示・画像後読み・科目別URL・再読み込み・戻る進む・途中復元・聞き流し停止・デッキ維持・無効URL・通信失敗・オリジナル");
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
