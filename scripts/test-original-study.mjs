import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { parseOriginalQuestions, createOriginalDeck, createOriginalStudy } from "../public/original-study.js";
import * as session from "../public/original-session.js";
import { createQuestionQueue, getQuestionExplanation, rateQuestion } from "../public/learning-engine.js";

const parsed = parseOriginalQuestions("\uFEFF問1\t答1\r\n\r\n問2\t答2\t解説\r問3\t答3\t");
assert.deepEqual(parsed, { questions: [
  { prompt: "問1", answer: "答1", explanation: "" },
  { prompt: "問2", answer: "答2", explanation: "解説" },
  { prompt: "問3", answer: "答3", explanation: "" },
], errors: [] });
assert.equal(parseOriginalQuestions(" \n\t\n").questions.length, 0);
const invalid = parseOriginalQuestions("問題だけ\n問\t\n\t答\n問\t答\t説明\t余分");
assert.equal(invalid.errors.length, 4);
assert.equal(parseOriginalQuestions(Array(10001).fill("問\t答").join("\n")).errors.length, 1);
assert.ok(invalid.errors.every((error, index) => error.startsWith(`${index + 1}行目`)));

// オリジナルの全操作で通信と端末保存が発生しないことを確認。
const previousFetch = globalThis.fetch;
globalThis.fetch = () => { throw new Error("一時学習の通信は禁止"); };
globalThis.window = { localStorage: {
  getItem() { throw new Error("読み込み禁止"); }, setItem() { throw new Error("保存禁止"); },
} };
const version = session.beginOriginalSession({ goodSeconds: 30 });
const deck = createOriginalDeck(parsed.questions, version);
assert.equal(deck.subject.learningType, "history");
let saved = await session.loadCloudState(2, version);
const queue = createQuestionQueue(deck.terms, saved.progress, 2);
assert.equal(queue.length, 3);
assert.equal(getQuestionExplanation(deck.terms[1], deck.terms[1].stages.beginner[0]), "解説");
const questionId = deck.terms[0].stages.beginner[0].id;
rateQuestion(saved.progress, questionId, "good", 2, { goodSeconds: 30 });
await session.saveCloudStudyAnswer(version, questionId, saved.progress.questions[questionId], null, { completeRoundId: "round-1" });
await session.saveCloudStudyAnswer(version, questionId, saved.progress.questions[questionId], null, { completeRoundId: "round-1" });
saved = await session.loadCloudState(2, version);
assert.equal(saved.roundProgress.completedCount, 1);
assert.equal(createQuestionQueue(deck.terms, saved.progress, 2).length, 2);
saved.progress.questions = {};
assert.ok((await session.loadCloudState(2, version)).progress.questions[questionId]);
await session.saveCloudStudyAnswer(version, questionId, null, null, { deleteRoundId: "round-1" });
assert.equal((await session.loadCloudState(2, version)).roundProgress.completedCount, 0);
assert.equal(createQuestionQueue(deck.terms, (await session.loadCloudState(2, version)).progress, 2).length, 3);
await session.saveCloudSettings({ goodSeconds: 12, setupPreferences: { lastSubjectId: "original", subjects: { original: { selectedDeckIds: ["deck-1"], studyMode: "memorize", decks: {} } } } });
assert.equal(session.originalSettings().goodSeconds, 12);
await session.saveCloudStudySession(version, null);
await session.saveCloudStudyActivity(version, { eventId: "event-1" }, null, { completeRoundId: "round-2", completeSession: true });
await session.undoCloudStudyActivity(version, "event-1", null, { deleteRoundId: "round-2" });
await session.saveCloudStudyTime(version, { eventId: "time-1", studySeconds: 10 }, null);
await session.deleteCloudStudySession(version);
await session.resetCloudProgress(version);
assert.deepEqual((await session.loadCloudState(2, version)).progress.questions, {});
session.endOriginalSession();
assert.equal(session.originalSettings(), null);
await assert.rejects(session.saveCloudStudySession(version, null), /終了/);
await assert.rejects(session.saveCloudSettings({ setupPreferences: { subjects: { original: {} } } }), /終了/);
const nextVersion = session.beginOriginalSession({});
assert.notEqual(nextVersion, version);
assert.equal(session.originalSettings().goodSeconds, 43200);
session.endOriginalSession();

const nodes = new Map();
function node(name) {
  if (!nodes.has(name)) nodes.set(name, { value: "", textContent: "", disabled: false, handlers: {},
    setAttribute() {}, focus() {}, addEventListener(event, handler) { this.handlers[event] = handler; } });
  return nodes.get(name);
}
let received = null;
const input = createOriginalStudy({ querySelector: (selector) => node(selector.match(/"([^"]+)"/)[1]) }, () => {}, async (questions) => { received = questions; });
input.open();
assert.equal(node("start").disabled, true);
node("input").value = "問題\t回答\t解説";
node("input").handlers.input();
await node("start").handlers.click();
assert.equal(received[0].explanation, "解説");
input.clear();
assert.equal(node("input").value, "");

const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
assert.ok(app.includes('return { entry, ...originalDeck }'));
assert.ok(app.includes('showOnly(elements.setupPanel)'));
// 実際のアプリの音声設定取得と読み上げ初期化を、音を出さずに検査する。
const storedVoiceSettings = { source: "cloud", azureVoiceId: "ja-JP-AoiNeural", englishAzureVoiceId: "en-US-GuyNeural", rate: 1.35 };
const settingsFunction = app.slice(app.indexOf("function loadSpeechSettings() {"), app.indexOf("function saveSpeechSettings(settings) {"));
const controllerStart = app.indexOf("const speechController = createSpeechController({");
const controllerEnd = app.indexOf("\n});", controllerStart) + 4;
assert.ok(controllerStart >= 0 && controllerEnd > controllerStart);
const cloudAudio = () => { throw new Error("実際の音声は生成しない"); };
const controller = runInNewContext(`${settingsFunction}\n${app.slice(controllerStart, controllerEnd)}\nspeechController;`, {
  createSpeechController: (options) => options,
  requestCloudSpeech: cloudAudio,
  originalSettings: session.originalSettings,
  isOriginalSession: session.isOriginalSession,
  loadStoredSpeechSettings: () => storedVoiceSettings,
  updateSpeechButtons() {},
});
assert.equal(controller.requestCloudAudio, cloudAudio);
assert.equal(controller.getSettings().source, "cloud");
session.beginOriginalSession(storedVoiceSettings);
for (const [key, expected] of Object.entries(storedVoiceSettings)) {
  assert.equal(controller.getSettings()[key], expected, `オリジナルの音声設定: ${key}`);
}
await session.saveCloudSettings({ rate: 1.7 });
assert.equal(controller.getSettings().rate, 1.7);
assert.equal(controller.getSettings().source, "cloud");
await session.saveCloudSettings({ source: "device" });
assert.equal(controller.getSettings().source, "device");
session.endOriginalSession();
assert.equal(controller.getSettings().source, "cloud");
assert.equal(controller.getSettings().rate, 1.35);
assert.equal((html.match(/data-rating=/g) ?? []).length, 8);
assert.ok(!html.includes('data-original="ratings"'));
assert.ok(!html.includes('data-original="study"'));
globalThis.fetch = previousFetch;
console.log("オリジナル検証完了: 入力、共通出題・復習、一手戻し用記録、音声方針、通信・保存の分離、終了後の破棄を確認");
