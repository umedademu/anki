import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { editorFixture } from "./question-editor-fixture.mjs";
import { createStudyRoutineRun } from "../public/study-routine.js";

// 毎日のメニューで、今の科目を今日だけ飛ばして次の項目へ進めることを確かめる。
const root = path.resolve(import.meta.dirname, "..", "public");
const { objects } = editorFixture();
const mindsetTerms = Array.from({ length: 3 }, (_, index) => ({
  id: `MS-${String(index + 1).padStart(6, "0")}`,
  content: `試験用の言葉${index + 1}`,
  stages: { beginner: [], reverse: [], integrated: [] },
}));
const mindsetDeck = {
  id: "deck-1", number: 1, version: "mindset-skip-test-v1",
  indexPath: "subjects/mindset/deck-1/index.json",
  termCount: mindsetTerms.length, questionCount: 0,
};
const catalog = JSON.parse(objects.get("index.json"));
catalog.subjects.push({
  id: "mindset", title: "マインドセット", learningType: "mindset",
  defaultDeckId: mindsetDeck.id, decks: [mindsetDeck],
  termCount: mindsetTerms.length, questionCount: 0,
});
objects.set("index.json", JSON.stringify(catalog));
objects.set(mindsetDeck.indexPath, JSON.stringify({
  ...mindsetDeck, id: "mindset", deckId: mindsetDeck.id, title: "マインドセット",
  learningType: "mindset", masteryTarget: 2, availableStages: [],
  chunks: [{ path: "subjects/mindset/deck-1/chunk.json" }],
}));
objects.set("subjects/mindset/deck-1/chunk.json", JSON.stringify({ terms: mindsetTerms }));
objects.set("term-images.json", JSON.stringify({ schemaVersion: 2, assets: [], assignments: [] }));

const off = {
  history: { question: false, answer: false, explanation: false, mnemonic: false },
  vocabulary: { word: false, meaning: false, exampleEnglish: false, exampleJapanese: false },
};
const studyDate = "2026-10-07";
let settings;
let sessions;
let progress;
let failRoutineSave = false;
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
      const dataset = url.searchParams.get("dataset");
      const sessionDataset = body.sessionDatasetVersion ?? dataset;
      if (url.pathname === "/v1/study-routine" && failRoutineSave) {
        reply({ error: "試験用の保存失敗" }, 503);
        return;
      }
      if (body.routineRun) {
        settings.setupPreferences = { ...settings.setupPreferences, routineRun: body.routineRun };
      }
      if (url.pathname === "/v1/state") {
        reply({
          settings,
          progress: { questions: progress.get(dataset) ?? {} },
          session: sessions.get(dataset) ?? null,
          studyDate,
        });
        return;
      }
      if (url.pathname === "/v1/settings") {
        settings = { ...settings, ...body, autoSpeechEnabled: false, speechParts: off };
        reply({ settings });
        return;
      }
      if (url.pathname === "/v1/study-routine") {
        settings.setupPreferences = { ...settings.setupPreferences, ...body };
        reply({ setupPreferences: settings.setupPreferences, studyDate });
        return;
      }
      if (url.pathname.startsWith("/v1/study-answer/")) {
        if (body.session) sessions.set(sessionDataset, body.session);
        else sessions.delete(sessionDataset);
        const questionId = decodeURIComponent(url.pathname.split("/").pop());
        progress.set(dataset, { ...progress.get(dataset), [questionId]: body.record });
        reply({ session: body.session ?? null, updatedAt: new Date().toISOString() });
        return;
      }
      if (url.pathname === "/v1/study-session") {
        if (req.method === "DELETE") sessions.delete(dataset);
        else sessions.set(dataset, body);
        reply({ session: sessions.get(dataset) ?? null });
        return;
      }
      if (url.pathname.startsWith("/v1/study-time/")) {
        if (body.session) sessions.set(sessionDataset, body.session);
        reply({ session: body.session, studyDate });
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

function reset(plan) {
  sessions = new Map();
  progress = new Map();
  failRoutineSave = false;
  settings = {
    autoSpeechEnabled: false, speechParts: off, ratingSoundVolume: 0,
    studyTimeLimitSeconds: 600, studyRoutineOvertimeSeconds: 0,
    listeningQuestionIntervalSeconds: 0,
    setupPreferences: {
      subjects: {},
      mindsetResume: { lastCompletedItemId: "" },
      routinePlan: plan,
      routineRun: createStudyRoutineRun(plan, studyDate, "skip-run"),
      routineMultiplier: 1,
      routineSkipVideos: false,
    },
  };
}

let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext();
  context.setDefaultTimeout(15000);
  // 試験開始前に自動読み上げをOFFにし、実際の音声は一切再生しない。
  await context.addInitScript((parts) => {
    localStorage.setItem("anki-cloud-access-key:v1", "skip-test-key");
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
    body: speechModule + `\nexport function createSpeechController() {
      return { supported: true, paused: false, currentTarget: null,
        stop() {}, unlock() {}, pause() { return false; }, resume() { return false; },
        speak() { return false; }, preload() { return Promise.resolve(); } };
    }`,
  }));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const shown = (id) => page.locator(`#${id}`).waitFor({ state: "visible" });
  const text = (id) => page.locator(`#${id}`).textContent();
  const run = () => settings.setupPreferences.routineRun;
  const openHome = async () => {
    await page.goto(base);
    await shown("subject-panel");
    await page.waitForFunction(() => !document.querySelector("#start-routine").disabled);
  };
  const answerDialog = (accept) => new Promise((resolve) => {
    page.once("dialog", async (dialog) => {
      const message = dialog.message();
      if (accept) await dialog.accept();
      else await dialog.dismiss();
      resolve(message);
    });
  });

  reset([
    { id: "first", kind: "study", subjectId: "test", questionTarget: 1 },
    { id: "textbook", kind: "study", subjectId: "test", questionTarget: 5 },
    { id: "mindset", kind: "study", subjectId: "mindset", questionTarget: 2 },
    { id: "last", kind: "study", subjectId: "test", questionTarget: 1 },
  ]);
  await openHome();
  assert.equal(await text("skip-routine-item"), "試験科目を今日はスキップ");
  await page.locator("#continue-routine").click();
  await shown("setup-panel");
  await page.waitForFunction(() => !document.querySelector("#start-study").disabled);
  await page.locator("#start-study").click();
  await shown("study-shell");
  await page.locator("#next-action").click();
  await page.locator("#good-action").click();
  await shown("completion-card");
  assert.match(await text("completion-message"), /次は試験科目を5問進めます/);
  await page.locator("#completion-return").click();
  await shown("setup-panel");
  assert.match(await text("routine-setup-title"), /^毎日のメニュー 2／4/);
  assert.equal(await page.locator("#routine-setup-skip").isVisible(), true);

  // 確認で取りやめた時は何も変えない。
  let dialog = answerDialog(false);
  await page.locator("#routine-setup-skip").click();
  assert.match(await dialog, /試験科目（5問）を今日はスキップ/);
  assert.equal(run().currentIndex, 1, "取りやめた時は進めない");
  assert.equal(await page.locator("#setup-panel").isVisible(), true);

  // 保存に失敗した時は進めず、理由を表示する。
  failRoutineSave = true;
  dialog = answerDialog(true);
  await page.locator("#routine-setup-skip").click();
  await dialog;
  await page.waitForFunction(() => /スキップを保存できませんでした/.test(document.querySelector("#cloud-status").textContent));
  assert.equal(run().currentIndex, 1);
  assert.equal(run().items[1].skipped, undefined);
  failRoutineSave = false;

  // 科目の開始画面からスキップすると、次の項目（マインドセット）をそのまま開く。
  dialog = answerDialog(true);
  await page.locator("#routine-setup-skip").click();
  await dialog;
  await shown("mindset-player-panel");
  assert.equal(run().items[1].skipped, true);
  assert.equal(run().items[1].completedCount, 0);
  assert.equal(run().currentIndex, 2);
  assert.equal(await page.locator("#mindset-skip").isVisible(), true, "メニュー中のマインドセットにも表示する");

  // マインドセットからスキップすると次の科目の開始画面へ進む。
  dialog = answerDialog(true);
  await page.locator("#mindset-skip").click();
  assert.match(await dialog, /マインドセット（2問）を今日はスキップ/);
  await shown("setup-panel");
  await page.waitForFunction(() => /^毎日のメニュー 4／4/.test(document.querySelector("#routine-setup-title").textContent));
  assert.equal(run().items[2].skipped, true);

  // トップからスキップした時は、画面を移らずメニューの表示だけを更新する。
  await openHome();
  assert.equal(await text("skip-routine-item"), "試験科目を今日はスキップ");
  dialog = answerDialog(true);
  await page.locator("#skip-routine-item").click();
  await dialog;
  await page.waitForFunction(() => document.querySelector("#routine-dashboard-title").textContent === "メニューをすべて完了しました");
  assert.equal(await page.locator("#subject-panel").isVisible(), true, "トップからのスキップでは画面を移らない");
  assert.equal(await page.locator("#skip-routine-item").isVisible(), false);
  assert.match(await text("routine-dashboard-summary"), /4項目・1問・動画0本をすべて進めました。（3項目は今日はスキップ）/);
  assert.match(await text("routine-dashboard-list"), /2\. 試験科目 5問（今日はスキップ）/);
  assert.equal(run().currentIndex, 4);

  // 途中まで進めた記録があれば確認文で知らせる。
  reset([
    { id: "partial", kind: "study", subjectId: "test", questionTarget: 5 },
    { id: "after", kind: "study", subjectId: "test", questionTarget: 1 },
  ]);
  settings.setupPreferences.routineRun.items[0].completedCount = 2;
  await openHome();
  dialog = answerDialog(true);
  await page.locator("#skip-routine-item").click();
  assert.match(await dialog, /2／5問まで進めた記録はそのまま残ります/);
  await page.waitForFunction(() => /^続きから/.test(document.querySelector("#continue-routine").textContent) &&
    document.querySelector("#routine-dashboard-list li.is-current")?.textContent.startsWith("2. "));
  assert.equal(run().items[0].completedCount, 2);
  assert.equal(run().currentIndex, 1);

  const audioCalls = await page.evaluate(() => window.__actualAudioCalls ?? 0);
  assert.equal(audioCalls, 0, "実際の音声は一切再生しない");
  assert.deepEqual(errors, []);
  console.log("毎日のメニューのスキップ検証完了: 開始画面・マインドセット・トップからのスキップ、取りやめ、保存失敗、途中記録の保持、完了表示を無音で確認");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
