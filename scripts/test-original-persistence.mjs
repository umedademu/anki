import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { createOriginalDeck, parseOriginalQuestions, originalProgressStorageKey } from "../public/original-study.js";
import { createQuestionQueue, rateQuestion } from "../public/learning-engine.js";

let moduleNumber = 0;
const reload = () => import(`../public/original-session.js?test-persistence=${++moduleNumber}`);
const data = new Map([["unrelated", "keep"]]);
let failWrite = false;
const storage = {
  getItem: (key) => data.get(key) ?? null,
  setItem: (key, value) => {
    if (failWrite) throw new Error("容量不足");
    data.set(key, value);
  },
  removeItem: (key) => data.delete(key),
};
const questions = parseOriginalQuestions("問1\t答1\n問2\t答2\t解説2\n問3\t答3").questions;
const settings = { againSeconds: 14400, hardSeconds: 14400, goodSeconds: 14400, easySeconds: 14400 };
const answeredAt = new Date("2026-09-11T14:00:00.000Z");
const previousFetch = globalThis.fetch;
globalThis.fetch = () => { throw new Error("学習記録を送信してはいけません"); };
try {
  let api = await reload();
  let version = await api.beginOriginalSession(settings, questions, () => storage);
  const deck = createOriginalDeck(questions, version);
  let loaded = await api.loadCloudState(2, version);
  const tasks = createQuestionQueue(deck.terms, loaded.progress, 2, "beginner", answeredAt);
  const questionId = tasks[0].questionId;
  const studySession = {
    schemaVersion: 1, roundId: "round-1", studyMode: "memorize", deckIds: ["deck-1"],
    selectedStage: "beginner", shuffleEnabled: true,
    termIds: deck.terms.map((term) => term.id), tasks,
    currentTask: tasks[1], queue: [tasks[2]],
    unseenQuestionIds: tasks.slice(1).map((task) => task.questionId), retryQuestionIds: [],
    answeredCount: 1, ratingCounts: { hard: 1 }, studySeconds: 25,
    startedAt: answeredAt.toISOString(), answerVisible: false,
  };
  rateQuestion(loaded.progress, questionId, "hard", 2, settings, answeredAt);
  await api.saveCloudStudyAnswer(version, questionId, loaded.progress.questions[questionId], studySession);
  const record = structuredClone(loaded.progress.questions[questionId]);
  api.saveOriginalSessionSnapshot(version, { ...studySession, answerVisible: true, studySeconds: 30 });
  api.endOriginalSession();

  // 新しい実行環境で、改行や空行だけが異なる同じ内容を読み直す。
  api = await reload();
  const equivalent = parseOriginalQuestions("\uFEFF問1\t答1\r\n\r\n問2\t答2\t解説2\r\n問3\t答3\t\r\n").questions;
  assert.equal(await api.beginOriginalSession(settings, equivalent, () => storage), version);
  loaded = await api.loadCloudState(2, version);
  assert.deepEqual(loaded.progress.questions[questionId], record);
  assert.equal(loaded.session.currentTask.questionId, tasks[1].questionId);
  assert.equal(loaded.session.answerVisible, true);
  assert.equal(loaded.session.studySeconds, 30);
  assert.equal(loaded.session.answeredCount, 1);
  assert.equal(loaded.session.ratingCounts.hard, 1);
  assert.equal(loaded.session.shuffleEnabled, true);
  const beforeFourHours = new Date(answeredAt.getTime() + 4 * 3600000 - 1);
  const nextMorning = new Date(answeredAt.getTime() + 8 * 3600000);
  assert.equal(createQuestionQueue(deck.terms, loaded.progress, 2, "beginner", beforeFourHours).length, 2);
  assert.equal(createQuestionQueue(deck.terms, loaded.progress, 2, "beginner", nextMorning).length, 3);

  const customReview = { ...settings, hardSeconds: 60 };
  await api.saveCloudSettings({ setupPreferences: { subjects: { original: { reviewSettings: customReview } } } });
  api.endOriginalSession();
  api = await reload();
  assert.equal(await api.beginOriginalSession(settings, questions, () => storage), version);
  loaded = await api.loadCloudState(2, version);
  assert.equal(loaded.progress.questions[questionId].nextReviewAt, new Date(answeredAt.getTime() + 60000).toISOString());

  // 一巡完了・同じ完了の再送・一手戻し・聞き流し・途中位置削除も保存する。
  await api.saveCloudStudyAnswer(version, questionId, record, null, { completeRoundId: "round-1" });
  await api.saveCloudStudyAnswer(version, questionId, record, null, { completeRoundId: "round-1" });
  api.endOriginalSession();
  api = await reload();
  await api.beginOriginalSession(settings, questions, () => storage);
  loaded = await api.loadCloudState(2, version);
  assert.equal(loaded.roundProgress.completedCount, 1);
  assert.equal(loaded.session, null);
  await api.saveCloudStudyAnswer(version, questionId, null, studySession, { deleteRoundId: "round-1" });
  loaded = await api.loadCloudState(2, version);
  assert.equal(loaded.roundProgress.completedCount, 0);
  assert.equal(loaded.progress.questions[questionId], undefined);
  const listening = { ...studySession, studyMode: "listen-answer" };
  await api.saveCloudStudySession(version, listening);
  {
    const previousWindow = globalThis.window;
    const rejectFetch = globalThis.fetch;
    globalThis.window = { ANKI_CONFIG: { progressApiBaseUrl: "https://test.invalid" }, localStorage: { ...previousWindow?.localStorage, getItem: (key) => key === "anki-cloud-access-key:v1" ? "test-key" : previousWindow?.localStorage.getItem(key) } };
    globalThis.fetch = async (url, options) => {
      assert.ok(url.includes("/v1/study-time/"));
      assert.equal(JSON.parse(options.body).session, null);
      return Response.json({ updatedAt: new Date().toISOString(), studyDate: "2026-09-11", session: null });
    };
    try {
  await api.saveCloudStudyTime(version, { studySeconds: 40 }, { ...listening, studySeconds: 40 });
    } finally { globalThis.window = previousWindow; globalThis.fetch = rejectFetch; }
  }
  api.endOriginalSession();
  api = await reload();
  await api.beginOriginalSession(settings, questions, () => storage);
  loaded = await api.loadCloudState(2, version);
  assert.equal(loaded.session.studyMode, "listen-answer");
  assert.equal(loaded.session.studySeconds, 40);
  await api.saveCloudStudyActivity(version, {}, listening, { completeSession: true });
  assert.equal((await api.loadCloudState(2, version)).roundProgress.completedCount, 1);
  await api.undoCloudStudyActivity(version, "event", listening, { deleteRoundId: "round-1" });
  await api.deleteCloudStudySession(version);
  assert.equal(JSON.parse(data.get(originalProgressStorageKey)).session, null);

  // 保存が失敗しても、前回の記録とメモリーを変更しない。
  const persistedBeforeFailure = data.get(originalProgressStorageKey);
  failWrite = true;
  await assert.rejects(api.saveCloudStudyAnswer(version, questionId, record, studySession), /保存できません/);
  await assert.rejects(api.resetCloudProgress(version), /保存できません/);
  assert.equal(data.get(originalProgressStorageKey), persistedBeforeFailure);
  assert.equal((await api.loadCloudState(2, version)).progress.questions[questionId], undefined);
  failWrite = false;
  await api.saveCloudStudyAnswer(version, questionId, record, studySession);

  // 問題・回答・解説・並びのいずれを変えても、その問題群の記録を新しくする。
  for (const changed of [
    questions.map((q, index) => index ? q : { ...q, prompt: "変更した問" }),
    questions.map((q, index) => index ? q : { ...q, answer: "変更した答" }),
    questions.map((q, index) => index ? q : { ...q, explanation: "変更した解説" }),
    [...questions].reverse(),
  ]) {
    api.endOriginalSession();
    const oldVersion = version;
    version = await api.beginOriginalSession(settings, changed, () => storage);
    assert.notEqual(version, oldVersion);
    loaded = await api.loadCloudState(2, version);
    assert.deepEqual(loaded.progress.questions, {});
    assert.equal(loaded.session, null);
    assert.equal(loaded.roundProgress.completedCount, 0);
    assert.deepEqual(loaded.settings.setupPreferences.subjects.original.reviewSettings, customReview);
    await api.saveCloudStudyAnswer(version, questionId, record, studySession, { completeRoundId: "round-1" });
  }
  await api.resetCloudProgress(version);
  api.endOriginalSession();
  await api.beginOriginalSession(settings, [...questions].reverse(), () => storage);
  assert.deepEqual((await api.loadCloudState(2, version)).progress.questions, {});
  assert.equal((await api.loadCloudState(2, version)).roundProgress.completedCount, 0);

  // 別の画面で問題を更新・削除した場合、古い画面の遅れた保存で戻さない。
  const other = await reload();
  await other.beginOriginalSession(settings, questions, () => storage);
  const changedValue = data.get(originalProgressStorageKey);
  await assert.rejects(api.saveCloudStudyAnswer(version, questionId, record, null), /別の画面/);
  assert.equal(data.get(originalProgressStorageKey), changedValue);
  data.delete(originalProgressStorageKey);
  await assert.rejects(other.saveCloudStudySession(JSON.parse(changedValue).version, studySession), /別の画面/);
  assert.equal(data.has(originalProgressStorageKey), false);

  data.set(originalProgressStorageKey, "壊れた内容");
  api.endOriginalSession();
  await assert.rejects(api.beginOriginalSession(settings, questions, () => storage), /読み込めません/);
  assert.equal(data.get(originalProgressStorageKey), "壊れた内容");
  data.delete(originalProgressStorageKey);
  failWrite = true;
  await assert.rejects(api.beginOriginalSession(settings, questions, () => storage), /保存できません/);
  assert.equal(api.isOriginalSession(), false);
  assert.equal(data.get("unrelated"), "keep");
} finally {
  globalThis.fetch = previousFetch;
}

// 実際の終了時処理を実行し、画面を閉じる前に同期保存することを確認する。
const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const hideFunction = app.match(/^function saveOriginalBeforeHide\(\)[\s\S]*?^}/m)?.[0];
assert.ok(hideFunction);
let snapshot = null;
const context = {
  state: { activeSession: true, saving: false, sessionDatasetVersion: "original-test" },
  isOriginalSession: () => true, captureActiveSession: () => ({ answerVisible: true }),
  saveOriginalSessionSnapshot: (version, value) => { snapshot = { version, value }; },
};
runInNewContext(`${hideFunction}\nsaveOriginalBeforeHide();`, context);
assert.equal(snapshot.version, "original-test");
assert.equal(snapshot.value.answerVisible, true);
snapshot = null;
context.state.saving = true;
runInNewContext(`${hideFunction}\nsaveOriginalBeforeHide();`, context);
assert.equal(snapshot, null, "評価の保存中に未確定の途中状態を上書きしない");
console.log("オリジナル継続検証完了: 再読み込み・翌朝の復習・途中再開・周回・一手戻し・内容変更・保存失敗・別画面との競合を確認");
