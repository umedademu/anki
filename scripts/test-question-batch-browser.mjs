import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { createStudyRoutineRun } from "../public/study-routine.js";
import { normalizeSetupPreferences, normalizeStudySession } from "../worker/src/index.js";

const root = path.resolve(import.meta.dirname, "..", "public");
const off = { history: { question: false, answer: false, explanation: false, mnemonic: false },
  vocabulary: { word: false, meaning: false, exampleEnglish: false, exampleJapanese: false } };
const terms = Array.from({ length: 500 }, (_, i) => ({ id: `t${i}`, term: `言葉${i}`, category: "試験", geography: {},
  stages: { beginner: [{ id: `q${i}`, stage: "beginner", type: "identify", prompt: `問題${i}`, answer: `答え${i}` }], reverse: [], integrated: [] } }));
const objects = new Map([
  ["index.json", { schemaVersion: 3, version: "test", subjects: [{ id: "test", title: "試験科目", learningType: "history", defaultDeckId: "deck-1",
    decks: [{ id: "deck-1", number: 1, datasetLabel: "試験５００問", indexPath: "deck/index.json", version: "test-v1", questionCount: 500, termCount: 500 }] }] }],
  ["deck/index.json", { id: "test", deckId: "deck-1", version: "test-v1", title: "試験科目", learningType: "history", masteryTarget: 2,
    simpleQuestions: true, availableStages: ["beginner"], chunks: [{ path: "deck/chunk.json" }] }],
  ["deck/chunk.json", { terms }], ["term-images.json", { schemaVersion: 2, assets: [], assignments: [] }],
]);
const plan = [{ id: "study", subjectId: "test", questionTarget: 10 }, { id: "next", subjectId: "test", questionTarget: 5 }];
let settings, records, session, answers, failSave;
function reset({ routine = false, shuffle = false, sequential = false } = {}) {
  records = {}; session = null; answers = []; failSave = false;
  settings = { autoSpeechEnabled: false, speechParts: off, ratingSoundVolume: 0, goodSeconds: 1, hardSeconds: 1, easySeconds: 1,
    studyRoutineOvertimeSeconds: 600, shuffleEnabled: shuffle,
    setupPreferences: normalizeSetupPreferences({ subjects: { test: { selectedDeckIds: ["deck-1"], sequentialEnabled: sequential, questionLimit: 10 } },
      routinePlan: plan, routineRun: routine ? createStudyRoutineRun(plan, "2026-10-14", "batch-run") : null }) };
}
reset();
let speechRequests = 0;
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const reply = (body, status = 200) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
    if (url.pathname.startsWith("/v1/")) {
      const parts = []; for await (const part of req) parts.push(part);
      const body = parts.length ? JSON.parse(Buffer.concat(parts).toString()) : {};
      if (/speech|rating-sound/.test(url.pathname)) { speechRequests++; throw Error("音声を要求しました"); }
      if (url.pathname === "/v1/state") { reply({ settings, progress: { questions: records }, session, studyDate: "2026-10-14" }); return; }
      if (url.pathname === "/v1/settings") {
        settings = { ...settings, ...body, autoSpeechEnabled: false, speechParts: off };
        settings.setupPreferences = normalizeSetupPreferences(settings.setupPreferences); reply({ settings }); return;
      }
      if (url.pathname === "/v1/study-routine") {
        settings.setupPreferences = normalizeSetupPreferences({ ...settings.setupPreferences, ...body });
        reply({ setupPreferences: settings.setupPreferences, studyDate: "2026-10-14" }); return;
      }
      if (url.pathname.startsWith("/v1/study-answer/")) {
        if (failSave) { reply({ error: "試験用の保存失敗" }, 503); return; }
        const id = decodeURIComponent(url.pathname.split("/").pop());
        if (body.record == null) delete records[id]; else records[id] = body.record;
        if (body.deleteActivityId) answers.pop(); else answers.push({ id, rating: body.activity.rating });
      }
      if (body.routineRun) settings.setupPreferences = normalizeSetupPreferences({ ...settings.setupPreferences, routineRun: body.routineRun });
      if (url.pathname === "/v1/study-session") session = req.method === "DELETE" ? null : normalizeStudySession(body);
      else if (Object.hasOwn(body, "session")) session = body.session ? normalizeStudySession(body.session) : null;
      reply({ session, updatedAt: new Date().toISOString() }); return;
    }
    if (url.pathname === "/config.js") {
      res.setHeader("Content-Type", "text/javascript"); res.end(`window.ANKI_CONFIG={dataBaseUrl:"/data",progressApiBaseUrl:"http://127.0.0.1:${server.address().port}"};`); return;
    }
    if (url.pathname.startsWith("/data/")) { reply(objects.get(url.pathname.slice(6)) ?? {}); return; }
    const target = path.resolve(root, "." + (url.pathname === "/" ? "/index.html" : url.pathname));
    if (!target.startsWith(root + path.sep)) throw Error("公開範囲の外");
    res.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" })[path.extname(target)] ?? "text/plain");
    res.end(await readFile(target));
  } catch (error) { res.writeHead(500); res.end(error.message); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext(); context.setDefaultTimeout(15000);
  // 試験開始前に自動読み上げをOFFにし、実音声の再生も止める。
  await context.addInitScript(off => {
    localStorage.setItem("anki-cloud-access-key:v1", "test-key"); localStorage.setItem("anki-auto-speech:v1", "false");
    localStorage.setItem("anki-speech-parts:v1", JSON.stringify(off));
    speechSynthesis.speak = () => {}; HTMLMediaElement.prototype.play = async () => {};
    if (window.AudioScheduledSourceNode) AudioScheduledSourceNode.prototype.start = () => {};
  }, off);
  await context.route("https://**/*", route => route.abort());
  const speech = (await readFile(path.join(root, "speech.js"), "utf8")).replace("export function createSpeechController(", "function unusedSpeechController(");
  await context.route("**/speech.js*", route => route.fulfill({ contentType: "text/javascript", body: speech + "\nexport function createSpeechController() { return { supported:true,paused:false,currentTarget:null,stop(){},unlock(){},pause(){return false},resume(){return false},speak(){return true},preload(){return Promise.resolve()} }; }" }));
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const shown = id => page.locator(`#${id}`).waitFor({ state: "visible" });
  const question = () => page.locator("#question-text").textContent();
  async function start(routine, listening = false) {
    await page.goto(routine ? base : base + "/?subject=test&view=setup&deck=deck-1");
    if (routine) { await shown("continue-routine"); await page.locator("#continue-routine").click(); }
    await shown("setup-panel"); await page.waitForFunction(() => !document.querySelector("#start-study").disabled);
    if (listening) await page.locator('input[name="study-mode"][value="listen-answer"]').check();
    await page.locator("#question-limit").fill("10"); await page.locator("#start-study").click();
    await shown("question-card"); await page.waitForFunction(() => !document.querySelector("#next-action").disabled);
    assert.equal(session.questionBatch.questionIds.length, 10); return [...session.questionBatch.questionIds];
  }
  async function answer(rating, listening = false) {
    if (!await page.locator("#answer-panel").isVisible()) await page.locator(listening ? "#listening-next-action" : "#next-action").click();
    await page.locator(listening ? `#listening-${rating === "again" ? "incorrect" : rating}-action` : `#rating-buttons [data-rating="${rating}"]`).click();
    await page.waitForFunction(() => !document.querySelector("#completion-card").classList.contains("is-hidden") || !document.querySelector("#next-action").disabled);
  }

  for (const routine of [false, true]) for (const shuffle of [false, true]) for (const sequential of [false, true]) {
    reset({ routine, shuffle, sequential }); const selected = await start(routine);
    if (!shuffle) assert.deepEqual(selected, Array.from({ length: 10 }, (_, i) => `q${i}`));
    for (let i = 0; i < 9; i++) await answer(["good", "hard", "easy"][i % 3]);
    assert.equal(session.questionBatch.completedQuestionIds.length, 9);
    const last = await question();
    for (let i = 0; i < 3; i++) {
      await answer("again"); assert.equal(await question(), last);
      assert.deepEqual(session.questionBatch.questionIds, selected);
      assert.equal(session.questionBatch.completedQuestionIds.length, 9);
      assert.equal(await page.locator("#completion-card").isVisible(), false);
    }
    await page.reload(); await shown("question-card"); assert.equal(await question(), last);
    assert.deepEqual(session.questionBatch.questionIds, selected);
    failSave = true; await answer("good");
    await page.waitForFunction(() => document.querySelector("#unlock-notice").textContent.includes("保存失敗"));
    assert.equal(await question(), last); assert.equal(session.questionBatch.completedQuestionIds.length, 9);
    failSave = false; await answer("hard"); await shown("completion-card");
    assert.equal(answers.length, 13); assert.equal(new Set(answers.map(answer => answer.id)).size, 10);
    assert.equal(session.questionBatch.completedQuestionIds.length, 10);
    assert.equal(session.unseenQuestionIds.length, 490);
    if (routine) {
      assert.equal(settings.setupPreferences.routineRun.items[0].completedCount, 10);
      assert.equal(settings.setupPreferences.routineRun.currentIndex, 1);
    } else {
      await page.reload(); await shown("completion-card");
      await page.locator("#completion-return").click(); await shown("setup-panel");
      await page.locator("#resume-study").click(); await shown("question-card");
      assert.equal(session.questionBatch.questionIds.some(id => selected.includes(id)), false);
    }
  }

  // 一手戻りで覚えた問題が対象に戻る。
  reset(); await start(false); await answer("good"); await answer("good");
  await page.locator("#back-action").click();
  await page.waitForFunction(() => document.querySelector("#question-text").textContent === "問題1" && !document.querySelector("#good-action").disabled);
  assert.equal(session.questionBatch.completedQuestionIds.length, 1);
  await answer("again");
  assert.equal(session.questionBatch.completedQuestionIds.length, 1);

  // 聞き流しでも任意評価の不正解は、残り１問として繰り返す。
  for (const routine of [false, true]) {
    reset({ routine, shuffle: true }); const selected = await start(routine, true);
    for (let i = 0; i < 9; i++) await answer("good", true);
    const last = await question(); await answer("again", true); await answer("again", true);
    assert.equal(await question(), last); assert.equal(session.questionBatch.completedQuestionIds.length, 9);
    await answer("easy", true); await shown("completion-card");
    assert.equal(answers.length, 12); assert.deepEqual(session.questionBatch.questionIds, selected);
  }

  // 聞き終えた直前の問題に後から不正解を付けた場合も、対象へ戻す。
  reset({ routine: true }); await start(true, true);
  await page.locator("#listening-next-action").click();
  await page.locator("#listening-next-action").click();
  await page.waitForFunction(() => document.querySelector("#question-text").textContent === "問題1");
  await page.locator("#listening-incorrect-action").click();
  await page.waitForFunction(() => document.querySelector("#routine-progress").textContent.includes("0 / 10"));
  assert.equal(session.questionBatch.completedQuestionIds.length, 0);
  assert.equal(session.retryQuestionIds.includes("q0"), true);
  assert.deepEqual(settings.setupPreferences.routineRun.items[0].completedQuestionKeys, []);
  for (let i = 0; i < 9; i++) await answer("good", true);
  assert.equal(await question(), "問題0");
  await answer("good", true); await shown("completion-card");
  assert.equal(settings.setupPreferences.routineRun.items[0].completedCount, 10);

  // 暗記から聞き流しへ切り替えても、未完了の１０問と達成済み３問を保持する。
  reset(); const selected = await start(false);
  for (let i = 0; i < 3; i++) await answer("good");
  await page.goto(base + "/?subject=test&view=setup&deck=deck-1"); await shown("setup-panel");
  await page.locator('input[name="study-mode"][value="listen-answer"]').check();
  await page.locator("#resume-study").click(); await shown("question-card");
  assert.deepEqual(session.questionBatch.questionIds, selected);
  assert.equal(session.questionBatch.completedQuestionIds.length, 3);
  for (let i = 0; i < 7; i++) await answer("good", true);
  await shown("completion-card");
  assert.equal(speechRequests, 0); assert.deepEqual(errors, []);
  console.log("画面確認：５００問から１０問固定・通常とメニュー・シャッフル有無・順番学習・最後の１問反復・再読み込み・保存失敗・一手戻り・次の１０問・聞き流し・無音を確認しました。");
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
