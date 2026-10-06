import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { editorFixture } from "./question-editor-fixture.mjs";
import { createStudyRoutineRun } from "../public/study-routine.js";

// 毎日のメニューで「◯パート」を指定した項目が、選んだパートの一周ごとに進むことを確かめる。
const root = path.resolve(import.meta.dirname, "..", "public");
const { objects } = editorFixture();
const catalog = JSON.parse(objects.get("index.json"));
const testSubject = catalog.subjects.find((subject) => subject.id === "test");
testSubject.chapterGroups = [
  { id: "chapter-1", number: 1, title: "第1章 試験", deckIds: ["deck-1", "deck-2"] },
];
catalog.subjects.push({
  id: "mindset", title: "マインドセット", learningType: "mindset",
  defaultDeckId: "deck-1", decks: [], termCount: 0, questionCount: 0,
});
objects.set("index.json", JSON.stringify(catalog));
objects.set("term-images.json", JSON.stringify({ schemaVersion: 2, assets: [], assignments: [] }));

const off = {
  history: { question: false, answer: false, explanation: false, mnemonic: false },
  vocabulary: { word: false, meaning: false, exampleEnglish: false, exampleJapanese: false },
};
const studyDate = "2026-10-07";
let settings;
let sessions;
let progress;
let routinePatches;
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
        routinePatches.push(structuredClone(body));
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

function reset(plan, { overtimeSeconds = 0 } = {}) {
  sessions = new Map();
  progress = new Map();
  routinePatches = [];
  settings = {
    autoSpeechEnabled: false, speechParts: off, ratingSoundVolume: 0,
    studyTimeLimitSeconds: 600, studyRoutineOvertimeSeconds: overtimeSeconds,
    setupPreferences: {
      subjects: {},
      routinePlan: plan,
      routineRun: createStudyRoutineRun(plan, studyDate, "deck-target-run"),
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
    localStorage.setItem("anki-cloud-access-key:v1", "deck-target-test-key");
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
  const routineItem = () => settings.setupPreferences.routineRun.items[0];
  const openRoutine = async () => {
    await page.goto(base);
    await shown("subject-panel");
    await page.waitForFunction(() => !document.querySelector("#continue-routine").disabled);
    await page.locator("#continue-routine").click();
    await shown("setup-panel");
    await page.waitForFunction(() => !document.querySelector("#start-study").disabled);
  };
  const answer = async (rating) => {
    const before = await text("question-text");
    await page.locator("#next-action").click();
    await page.locator(`#${rating}-action`).click();
    await page.waitForFunction(
      (previous) => document.querySelector("#question-text").textContent !== previous ||
        !document.querySelector("#completion-card").classList.contains("is-hidden"),
      before,
    );
  };
  const choosePart = async (deckId) => {
    await page.locator(".chapter-picker summary").click();
    for (const input of await page.locator('.chapter-picker input[name="deck-filter"]').all()) {
      const value = await input.getAttribute("value");
      if ((await input.isChecked()) !== (value === deckId)) await input.click();
    }
    await page.waitForFunction(() => !document.querySelector("#start-study").disabled);
  };

  // 1. 2パートを指定した項目は、1パート目の一周では終わらず、2パート目の一周で次へ進む。
  reset([
    { id: "parts", kind: "study", subjectId: "test", questionTarget: 100, targetUnit: "decks", deckTarget: 2 },
    { id: "next", kind: "study", subjectId: "test", questionTarget: 1 },
  ]);
  await page.goto(base);
  await shown("subject-panel");
  await page.waitForFunction(() => !document.querySelector("#start-routine").disabled);
  assert.match(await text("routine-dashboard-list"), /1\. 試験科目 2パート/);
  assert.match(await text("routine-dashboard-list"), /2\. 試験科目 1問/);
  await openRoutine();
  assert.match(await text("routine-setup-progress"), /^0／2パート完了・残り2パート。/);
  assert.equal(await text("start-study"), "開始する（残り2パート）");
  await choosePart("deck-1");
  await page.locator("#start-study").click();
  await shown("study-shell");
  assert.equal(await text("routine-progress"), "メニュー 0 / 2パート");
  await answer("good");
  assert.equal(routineItem().completedDeckIds.length, 0, "一周の途中ではパートを数えない");
  await answer("good");
  await shown("completion-card");
  assert.deepEqual(routineItem().completedDeckIds, ["deck-1"], "一周したパートを1つ数える");
  assert.equal(routineItem().completedCount, 2);
  assert.equal(settings.setupPreferences.routineRun.currentIndex, 0, "目標前は次の項目へ進まない");
  assert.equal(await text("completion-title"), "試験科目の選んだパートで出題できる問題を終えました");
  assert.equal(await text("completion-return"), "残り1パートの学習内容を選ぶ");

  await page.locator("#completion-return").click();
  await shown("setup-panel");
  assert.match(await text("routine-setup-progress"), /^1／2パート完了・残り1パート。/);
  await choosePart("deck-2");
  await page.locator("#start-study").click();
  await shown("study-shell");
  await answer("good");
  await shown("completion-card");
  assert.deepEqual(routineItem().completedDeckIds, ["deck-1", "deck-2"]);
  assert.equal(settings.setupPreferences.routineRun.currentIndex, 1, "2パート目の一周で次の項目へ進む");
  assert.equal(await text("completion-title"), "試験科目を2パート進めました");
  assert.equal(await text("routine-result-questions"), "3問");
  assert.equal(await text("routine-result-total"), "2 / 2パート・0 / 1問");
  assert.match(await text("completion-message"), /次は試験科目を1問進めます/);
  await page.locator("#completion-return").click();
  await shown("setup-panel");
  assert.match(await text("routine-setup-progress"), /^0／1問完了・残り1問。/, "次の項目は問題数で数える");

  // 2. 目標のパート数へ届いた一周の後は、復習猶予内の問題を出し終えてから次へ進む。
  reset([
    { id: "parts", kind: "study", subjectId: "test", questionTarget: 100, targetUnit: "decks", deckTarget: 1 },
    { id: "next", kind: "study", subjectId: "test", questionTarget: 1 },
  ], { overtimeSeconds: 5 * 60 * 60 });
  await openRoutine();
  await choosePart("deck-1");
  await page.locator("#start-study").click();
  await shown("study-shell");
  const firstQuestion = await text("question-text");
  await answer("hard");
  await answer("good");
  assert.equal(await page.locator("#completion-card").isVisible(), false, "猶予内の復習があれば続けて出題する");
  assert.equal(await text("question-text"), firstQuestion, "やや難しいと答えた問題を追加で復習する");
  assert.deepEqual(routineItem().completedDeckIds, ["deck-1"]);
  assert.equal(routineItem().overtimePending, true);
  assert.equal(settings.setupPreferences.routineRun.currentIndex, 0);
  await answer("good");
  await shown("completion-card");
  assert.equal(await text("completion-title"), "試験科目を1パート進めました");
  assert.equal(settings.setupPreferences.routineRun.currentIndex, 1);

  // 3. 設定画面では科目に応じて「パート」「デッキ」を選べ、マインドセットは問題数だけにする。
  reset([
    { id: "edit-parts", kind: "study", subjectId: "test", questionTarget: 100 },
    { id: "edit-decks", kind: "study", subjectId: "other", questionTarget: 50 },
    { id: "edit-mindset", kind: "study", subjectId: "mindset", questionTarget: 10 },
  ]);
  await page.goto(`${base}/settings.html#study-routine-settings`);
  await page.waitForFunction(() => /読み込みました/.test(document.querySelector("#routine-status").textContent));
  const rows = page.locator(".routine-editor-item");
  await page.waitForFunction(() => document.querySelector(".routine-subject-select option")?.textContent === "試験科目");
  assert.deepEqual(await rows.nth(0).locator(".routine-unit-select option").allTextContents(), ["問", "パート"]);
  assert.deepEqual(await rows.nth(1).locator(".routine-unit-select option").allTextContents(), ["問", "デッキ"]);
  assert.equal(await rows.nth(2).locator(".routine-unit-select").count(), 0);
  await rows.nth(0).locator(".routine-unit-select").selectOption("decks");
  const deckInput = rows.nth(0).locator('input[data-routine-field="deckTarget"]');
  assert.equal(await deckInput.inputValue(), "1");
  await deckInput.fill("2");
  await rows.nth(2).locator(".routine-subject-select").selectOption("test");
  await rows.nth(2).locator(".routine-unit-select").selectOption("decks");
  await rows.nth(2).locator(".routine-subject-select").selectOption("mindset");
  assert.equal(await rows.nth(2).locator(".routine-unit-select").count(), 0, "マインドセットへ戻すと問題数へ戻す");
  await page.locator("#save-routine").click();
  await page.waitForFunction(() => /保存しました/.test(document.querySelector("#routine-status").textContent));
  const savedPlan = routinePatches.at(-1).routinePlan;
  assert.equal(savedPlan[0].targetUnit, "decks");
  assert.equal(savedPlan[0].deckTarget, 2);
  assert.equal(savedPlan[0].questionTarget, 100, "問題数の値も残す");
  assert.equal(Object.hasOwn(savedPlan[1], "targetUnit"), false);
  assert.equal(Object.hasOwn(savedPlan[2], "targetUnit"), false);
  assert.equal(await rows.nth(0).locator(".routine-unit-select").inputValue(), "decks");

  const audioCalls = await page.evaluate(() => window.__actualAudioCalls ?? 0);
  assert.equal(audioCalls, 0, "実際の音声は一切再生しない");
  assert.deepEqual(errors, []);
  console.log("パート数の毎日メニュー検証完了: 一周ごとの加算・目標前の選び直し・次の項目・復習猶予・設定画面の単位切替を無音で確認");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
