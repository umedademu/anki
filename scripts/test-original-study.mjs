import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { parseOriginalQuestions, createOriginalDeck, createOriginalStudy, originalQuestionsStorageKey } from "../public/original-study.js";
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

// 評価・途中状態の操作で通信と端末保存が発生しないことを確認。
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
const storedInput = new Map([["unrelated-setting", "keep"]]);
const storage = {
  getItem: (key) => storedInput.get(key) ?? null,
  setItem: (key, value) => storedInput.set(key, value),
  removeItem: (key) => storedInput.delete(key),
};
const panel = { querySelector: (selector) => node(selector.match(/"([^"]+)"/)[1]) };
let received = null;
const input = createOriginalStudy(panel, () => {}, async (questions) => { received = questions; }, () => storage);
input.open();
assert.equal(node("start").disabled, true);
node("input").value = "問題\t回答\t解説";
node("input").handlers.input();
await node("start").handlers.click();
assert.equal(received[0].explanation, "解説");
input.clear();
assert.equal(node("input").value, "");
assert.equal(storedInput.get(originalQuestionsStorageKey), "問題\t回答\t解説");
input.open();
assert.equal(node("input").value, "問題\t回答\t解説");
assert.equal(node("start").disabled, false);
// 新しい画面の作成後も、入力途中の文字列をそのまま復元する。
const draft = "問1\t答1\r\n\r\n問2\t答2\t解説2\n入力途中";
node("input").value = draft;
node("input").handlers.input();
assert.equal(node("start").disabled, true);
const reloaded = createOriginalStudy(panel, () => {}, async () => {}, () => storage);
reloaded.open();
assert.equal(node("input").value, draft);
assert.equal(node("start").disabled, true);
node("delete").handlers.click();
assert.equal(storedInput.has(originalQuestionsStorageKey), false);
assert.equal(node("input").value, "");
assert.equal(node("start").disabled, true);
assert.equal(storedInput.get("unrelated-setting"), "keep");
reloaded.open();
assert.equal(node("input").value, "");
node("input").value = "問\t答";
node("input").handlers.input();
node("input").value = "";
node("input").handlers.input();
assert.equal(storedInput.has(originalQuestionsStorageKey), false);

const unavailable = createOriginalStudy(panel, () => {}, async () => {}, () => { throw new Error("禁止"); });
unavailable.open();
assert.match(node("storage-status").textContent, /読み込めません/);
node("input").value = "問\t答";
node("input").handlers.input();
assert.match(node("storage-status").textContent, /保存できません/);
assert.equal(node("start").disabled, false);
node("delete").handlers.click();
assert.equal(node("input").value, "問\t答");
assert.match(node("storage-status").textContent, /削除できません/);

storedInput.set(originalQuestionsStorageKey, "保存済み\t答");
const full = createOriginalStudy(panel, () => {}, async () => {}, () => ({
  ...storage, setItem() { throw new Error("容量不足"); },
}));
full.open();
node("input").value = "新しい問\t答";
node("input").handlers.input();
assert.match(node("storage-status").textContent, /保存できません/);
assert.equal(storedInput.get(originalQuestionsStorageKey), "保存済み\t答");
assert.equal(node("input").value, "新しい問\t答");

// 復習間隔は問題の内容・学習回・問題削除と独立して保存する。
const reviewData = new Map();
const reviewStorage = {
  getItem: (key) => reviewData.get(key) ?? null,
  setItem: (key, value) => reviewData.set(key, value),
  removeItem: (key) => reviewData.delete(key),
};
const customReview = { againSeconds: 25, hardSeconds: 120, goodSeconds: 600, easySeconds: 3600 };
const reviewPatch = (reviewSettings) => ({ setupPreferences: { subjects: { original: { reviewSettings } } } });
const firstReviewVersion = session.beginOriginalSession({}, () => reviewStorage);
await session.saveCloudSettings(reviewPatch(customReview));
assert.deepEqual(JSON.parse(reviewData.get(session.originalReviewStorageKey)).reviewSettings, customReview);
const savedReviewText = reviewData.get(session.originalReviewStorageKey);
await session.saveCloudSettings({ rate: 1.4 });
assert.equal(reviewData.get(session.originalReviewStorageKey), savedReviewText);
await session.resetCloudProgress(firstReviewVersion);
assert.equal(reviewData.get(session.originalReviewStorageKey), savedReviewText);
session.endOriginalSession();
reviewData.set(originalQuestionsStorageKey, "別の問題\t別の回答");
const secondReviewVersion = session.beginOriginalSession({}, () => reviewStorage);
assert.notEqual(firstReviewVersion, secondReviewVersion);
assert.deepEqual(session.originalSettings().setupPreferences.subjects.original.reviewSettings, customReview);
reviewStorage.removeItem(originalQuestionsStorageKey);
session.endOriginalSession();
session.beginOriginalSession({}, () => reviewStorage);
assert.deepEqual(session.originalSettings().setupPreferences.subjects.original.reviewSettings, customReview);
await session.saveCloudSettings(reviewPatch(null));
session.endOriginalSession();
session.beginOriginalSession(reviewPatch(customReview), () => reviewStorage);
assert.equal(session.originalSettings().setupPreferences.subjects.original.reviewSettings, null);
session.endOriginalSession();

const brokenStorage = { ...reviewStorage, setItem() { throw new Error("容量不足"); } };
session.beginOriginalSession({}, () => brokenStorage);
await assert.rejects(session.saveCloudSettings(reviewPatch(customReview)), /保存できません/);
assert.equal(session.originalSettings().setupPreferences.subjects.original.reviewSettings, null);
session.endOriginalSession();
reviewData.set(session.originalReviewStorageKey, "壊れた内容");
session.beginOriginalSession({}, () => reviewStorage);
assert.match(session.originalReviewStorageNotice(), /復元できません/);
await session.saveCloudSettings(reviewPatch(customReview));
assert.equal(session.originalReviewStorageNotice(), "");
session.endOriginalSession();
session.beginOriginalSession({}, () => { throw new Error("利用不可"); });
assert.match(session.originalReviewStorageNotice(), /復元できません/);
session.endOriginalSession();

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
console.log("オリジナル検証完了: 端末保存・復元・削除・保存失敗、共通出題と音声設定、学習記録の分離を確認");
