import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { editorFixture } from "./question-editor-fixture.mjs";
import { createStudyRoutineRun } from "../public/study-routine.js";

const root = path.resolve(import.meta.dirname, "..", "public");
const { objects } = editorFixture();
const terms = Array.from({ length: 119 }, (_, index) => ({
  id: `MS-${String(index + 1).padStart(6, "0")}`,
  content: `試験用の言葉${index + 1}`,
  stages: { beginner: [], reverse: [], integrated: [] },
}));
const deck = {
  id: "deck-1", number: 1, version: "mindset-test-v1",
  indexPath: "subjects/mindset/deck-1/index.json",
  termCount: terms.length, questionCount: 0,
};
const catalog = JSON.parse(objects.get("index.json"));
catalog.subjects.push({
  id: "mindset", title: "マインドセット", learningType: "mindset",
  defaultDeckId: deck.id, decks: [deck], termCount: terms.length, questionCount: 0,
});
objects.set("index.json", JSON.stringify(catalog));
objects.set(deck.indexPath, JSON.stringify({
  ...deck, id: "mindset", deckId: deck.id, title: "マインドセット",
  learningType: "mindset", masteryTarget: 2, availableStages: [],
  chunks: [{ path: "subjects/mindset/deck-1/chunk.json" }],
}));
objects.set("subjects/mindset/deck-1/chunk.json", JSON.stringify({ terms }));
objects.set("term-images.json", JSON.stringify({ schemaVersion: 2, assets: [], assignments: [] }));

const off = {
  history: { question: false, answer: false, explanation: false, mnemonic: false },
  vocabulary: { word: false, meaning: false, exampleEnglish: false, exampleJapanese: false },
};
let settings;
let failCompletionSave = false;
let completionSaveDelay = 0;
const completionSaves = [];
const studyDate = "2026-10-04";
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const reply = (value, status = 200) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(value));
    };
    if (url.pathname.startsWith("/v1/")) {
      const buffers = [];
      for await (const part of req) buffers.push(part);
      const body = buffers.length ? JSON.parse(Buffer.concat(buffers).toString()) : {};
      if (url.pathname === "/v1/state") {
        reply({ settings, progress: { questions: {} }, session: null, studyDate });
        return;
      }
      if (url.pathname === "/v1/settings") {
        const previousCount = settings.setupPreferences.routineRun?.items[0].completedCount;
        const nextCount = body.setupPreferences?.routineRun?.items[0].completedCount;
        if (nextCount > previousCount) {
          completionSaves.push(structuredClone(body.setupPreferences));
          if (completionSaveDelay) {
            await new Promise((resolve) => setTimeout(resolve, completionSaveDelay));
          }
          if (failCompletionSave) {
            reply({ error: "試験用の保存失敗" }, 503);
            return;
          }
        }
        settings = { ...settings, ...body, autoSpeechEnabled: false, speechParts: off };
        reply({ settings });
        return;
      }
      if (url.pathname === "/v1/study-routine") {
        settings.setupPreferences = { ...settings.setupPreferences, ...body };
        reply({ setupPreferences: settings.setupPreferences, studyDate });
        return;
      }
      throw new Error(`未対応の試験用通信: ${url.pathname}`);
    }
    if (url.pathname === "/config.js") {
      res.setHeader("Content-Type", "text/javascript");
      res.end(`window.ANKI_CONFIG={dataBaseUrl:"/data",progressApiBaseUrl:"http://127.0.0.1:${server.address().port}"};`);
      return;
    }
    if (url.pathname.startsWith("/data/")) {
      const body = objects.get(url.pathname.slice(6));
      res.writeHead(body ? 200 : 404, { "Content-Type": "application/json" });
      res.end(body ?? "{}");
      return;
    }
    const target = path.resolve(root, "." + (url.pathname === "/" ? "/index.html" : url.pathname));
    if (!target.startsWith(root + path.sep)) throw new Error("公開フォルダー外");
    const types = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };
    res.setHeader("Content-Type", types[path.extname(target)] ?? "text/plain");
    res.end(await readFile(target));
  } catch (error) {
    res.writeHead(500);
    res.end(error.message);
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext();
  context.setDefaultTimeout(15000);
  // 試験開始前に自動読み上げをOFFにし、実際の音声は一切再生しない。
  await context.addInitScript((parts) => {
    localStorage.setItem("anki-cloud-access-key:v1", "mindset-test-key");
    localStorage.setItem("anki-speech-settings:v1", JSON.stringify({ autoSpeechEnabled: false, speechParts: parts }));
    window.__actualAudioCalls = 0;
    const forbidden = () => { window.__actualAudioCalls++; throw new Error("試験中の音声再生は禁止"); };
    speechSynthesis.cancel();
    speechSynthesis.speak = forbidden;
    HTMLMediaElement.prototype.play = forbidden;
    if (window.AudioScheduledSourceNode) AudioScheduledSourceNode.prototype.start = forbidden;
  }, off);
  await context.route("https://**/*", (route) => route.abort());
  const speechModule = (await readFile(path.join(root, "speech.js"), "utf8"))
    .replace("export function createSpeechController(", "function unusedSpeechController(");
  await context.route("**/speech.js*", (route) => route.fulfill({
    contentType: "text/javascript",
    body: speechModule + `
      export function createSpeechController() {
        return window.__testSpeech = {
          supported: true, paused: false, currentTarget: null, calls: [], pending: null,
          stop() { this.pending = null; this.currentTarget = null; this.paused = false; },
          unlock() {}, preload() { return Promise.resolve(); },
          pause() { this.paused = true; return true; },
          resume() { this.paused = false; return true; },
          speak(segments, handlers = {}) {
            this.calls.push(segments); this.pending = handlers;
            this.currentTarget = segments[0]?.target; this.paused = false; return true;
          },
          async complete() { this.currentTarget = null; await this.pending?.onComplete?.(); },
        };
      }`,
  }));
  const page = await context.newPage();
  const errors = [];
  let actualAudioCalls = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  const shown = (id) => page.locator(`#${id}`).waitFor({ state: "visible" });
  const count = () => settings.setupPreferences.routineRun?.items[0].completedCount ?? 0;
  const load = async () => {
    actualAudioCalls += await page.evaluate(() => window.__actualAudioCalls ?? 0).catch(() => 0);
    await page.goto(base);
    await shown("subject-panel");
    await page.waitForFunction(() => !document.querySelector("#continue-routine").disabled);
  };
  const begin = async ({ target = 2, cycles = 0, completed = 0, lastCompletedItemId = "", interval = 0, next = "study", skipVideos = false, multiplier = 1 } = {}) => {
    const plan = [{
      id: "mindset-step", kind: "study", subjectId: "mindset", questionTarget: target,
      ...(cycles ? { targetUnit: "decks", deckTarget: cycles } : {}),
    }];
    if (next === "video") plan.push({ id: "video-step", kind: "video" });
    if (next === "study" || skipVideos) plan.push({ id: "next-step", kind: "study", subjectId: "test", questionTarget: 3 });
    const run = createStudyRoutineRun(plan, studyDate, "mindset-test-run", multiplier, skipVideos);
    run.items[0].completedCount = completed;
    settings = {
      autoSpeechEnabled: false, speechParts: off, ratingSoundVolume: 0,
      listeningQuestionIntervalSeconds: interval, studyTimeLimitSeconds: 600,
      setupPreferences: { subjects: {}, mindsetResume: { lastCompletedItemId }, routinePlan: plan, routineRun: run, routineMultiplier: multiplier, routineSkipVideos: skipVideos },
    };
    failCompletionSave = false;
    completionSaveDelay = 0;
    completionSaves.length = 0;
    await load();
    await page.locator("#continue-routine").click();
    await shown("mindset-player-panel");
    assert.equal(await page.evaluate(() => window.__testSpeech.calls.length), 0, "再開しただけで自動再生しない");
  };
  const complete = async () => {
    await page.evaluate(() => window.__testSpeech.complete());
  };
  const waitForPlayback = (calls) => page.waitForFunction((expected) => window.__testSpeech.calls.length === expected, calls);

  await begin();
  await page.locator("#mindset-toggle").click();
  await complete();
  await waitForPlayback(2);
  assert.equal(count(), 1);
  assert.equal(completionSaves[0].mindsetResume.lastCompletedItemId, terms[0].id, "消化数と再生位置を同じ通信で保存する");
  await complete();
  await shown("completion-card");
  assert.equal(count(), 2);
  assert.equal(await page.locator("#completion-title").textContent(), "マインドセットを2件進めました");
  assert.equal(await page.locator("#mindset-completion-panel").isVisible(), false);
  assert.equal(await page.evaluate(() => window.__testSpeech.calls.length), 2, "指定数の次を自動再生しない");
  await page.locator("#completion-return").click();
  await shown("setup-panel");
  assert.equal(new URL(page.url()).searchParams.get("subject"), "test", "次の科目へ進める");

  await begin({ interval: 60 });
  await page.locator("#mindset-toggle").click();
  await complete();
  await page.locator("#mindset-next").click();
  await waitForPlayback(2);
  assert.equal(count(), 1, "読み上げ完了後の手動移動を二重加算しない");
  failCompletionSave = true;
  await complete();
  assert.equal(count(), 1, "保存失敗で件数を進めない");
  assert.equal(await page.locator("#completion-card").isVisible(), false);
  assert.match(await page.locator("#mindset-playback-status").textContent(), /保存できませんでした/);
  failCompletionSave = false;
  await page.locator("#mindset-next").click();
  await shown("completion-card");
  assert.equal(count(), 2, "同じ言葉の保存を再試行しても一度だけ加算する");
  assert.equal(settings.setupPreferences.mindsetResume.lastCompletedItemId, terms[1].id);

  await begin({ target: 3, interval: 60 });
  await page.locator("#mindset-toggle").click();
  await page.locator("#mindset-toggle").click();
  await page.locator("#mindset-previous").click();
  assert.equal(count(), 0, "一時停止と前へでは加算しない");
  await page.locator("#mindset-home").click();
  await shown("subject-panel");
  await page.locator("#continue-routine").click();
  await shown("mindset-player-panel");
  await page.locator("#mindset-next").click();
  await waitForPlayback(3);
  assert.equal(count(), 1, "評価なしの次へも一件として数える");
  await page.locator("#mindset-home").click();
  await shown("subject-panel");
  await page.locator("#continue-routine").click();
  await shown("mindset-player-panel");
  assert.match(await page.locator("#mindset-position").textContent(), /^2 \/ 119.*1 \/ 3件$/, "残りの言葉と消化数を復元する");

  await begin({ target: 3, lastCompletedItemId: terms[116].id });
  await page.locator("#mindset-toggle").click();
  await complete();
  await waitForPlayback(2);
  await complete();
  await waitForPlayback(3);
  assert.equal(count(), 2);
  assert.match(await page.locator("#mindset-position").textContent(), /^1 \/ 119/, "目標に届かなければ末尾から先頭へ続ける");
  await complete();
  await shown("completion-card");
  assert.equal(count(), 3);

  await begin({ target: 119 });
  await page.locator("#mindset-toggle").click();
  for (let index = 0; index < 119; index++) {
    await waitForPlayback(index + 1);
    await complete();
  }
  await shown("completion-card");
  assert.equal(count(), 119, "末尾と設定数が一致しても次の科目へ進める");

  // 「1周」は途中の位置から始めても、全部の言葉を1回ずつ聞き終えた時に終える。
  await begin({ cycles: 1, lastCompletedItemId: terms[116].id });
  assert.match(await page.locator("#mindset-position").textContent(), /^118 \/ 119.*メニュー 0 \/ 119件$/);
  await page.locator("#mindset-toggle").click();
  for (let index = 0; index < 119; index++) {
    await waitForPlayback(index + 1);
    if (index === 118) {
      assert.equal(await page.locator("#completion-card").isVisible(), false, "全部の言葉を聞き終えるまで次へ進まない");
      assert.equal(settings.setupPreferences.routineRun.items[0].completedDeckIds.length, 0);
    }
    await complete();
  }
  await shown("completion-card");
  assert.equal(count(), 119);
  assert.deepEqual(settings.setupPreferences.routineRun.items[0].completedDeckIds, ["cycle-1"]);
  assert.equal(await page.locator("#completion-title").textContent(), "マインドセットを1周進めました");
  assert.equal(settings.setupPreferences.routineRun.currentIndex, 1);

  await begin({ target: 2, multiplier: 0.5, next: "video", skipVideos: true });
  completionSaveDelay = 300;
  await page.locator("#mindset-next").click();
  await page.locator("#mindset-next").waitFor({ state: "visible" });
  assert.equal(await page.locator("#mindset-next").isDisabled(), true, "保存中の連打を防ぐ");
  await shown("completion-card");
  assert.equal(count(), 1, "倍率適用後の件数で終了する");
  assert.match(await page.locator("#completion-message").textContent(), /試験科目/, "スキップした動画の次へ進める");

  await begin({ target: 1, next: "video" });
  await page.locator("#mindset-next").click();
  await shown("completion-card");
  assert.match(await page.locator("#completion-message").textContent(), /次は登録動画/);
  assert.equal(settings.setupPreferences.routineRun.currentIndex, 1);

  await begin({ target: 1, next: "none" });
  await page.locator("#mindset-next").click();
  await shown("completion-card");
  assert.equal(await page.locator("#completion-return").textContent(), "科目選択へ戻る");
  await page.locator("#completion-return").click();
  await shown("subject-panel");

  await begin({ lastCompletedItemId: terms[117].id });
  await page.locator("#mindset-home").click();
  await shown("subject-panel");
  await page.locator('[data-subject-id="mindset"]').click();
  await shown("mindset-player-panel");
  await page.locator("#mindset-toggle").click();
  await complete();
  await shown("mindset-completion-panel");
  assert.equal(count(), 0, "通常の科目選択ではメニューを変更しない");
  assert.equal(await page.evaluate(() => window.__testSpeech.calls.length), 1, "通常の聞き流しは末尾で停止する");
  actualAudioCalls += await page.evaluate(() => window.__actualAudioCalls);
  assert.equal(actualAudioCalls, 0, "実際の音声は一切再生しない");
  assert.deepEqual(errors, []);
  console.log("マインドセットの毎日メニュー検証完了: 指定数・次の科目と動画・倍率・途中再開・末尾・手動操作・二重加算防止・保存失敗と再試行・通常の一周停止・全部の言葉を聞く1周の指定を無音で確認");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
