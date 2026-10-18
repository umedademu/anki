import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { createQuestionBatch, normalizeQuestionBatch, pendingQuestionBatchIds, questionBatchComplete, rateQuestionBatch } from "../public/question-batch.js";
import { normalizeStudySession } from "../public/cloud-progress.js";
import { normalizeStudySession as normalizeWorkerSession } from "../worker/src/index.js";
import { createStudyRoutineRun, recordStudyRoutineQuestion, reviseStudyRoutineListeningRating } from "../public/study-routine.js";

const tasks = Array.from({ length: 500 }, (_, i) => ({ termId: `t${i}`, questionId: `q${i}`, stage: "beginner" }));
let batch = createQuestionBatch(tasks, 10);
for (let i = 0; i < 9; i++) batch = rateQuestionBatch(batch, `q${i}`, ["hard", "good", "easy"][i % 3]);
for (let i = 0; i < 5; i++) {
  batch = rateQuestionBatch(batch, "q9", "again");
  assert.equal(questionBatchComplete(batch), false);
  assert.deepEqual([...pendingQuestionBatchIds(batch)], ["q9"], "９問覚えたら残り１問だけを出す");
}
assert.deepEqual(batch.questionIds, tasks.slice(0, 10).map(task => task.questionId));
batch = rateQuestionBatch(batch, "q9", "hard");
assert.equal(questionBatchComplete(batch), true);
assert.equal(rateQuestionBatch(batch, "q499", "good"), batch, "対象外の回答は達成数へ加えない");
assert.equal(rateQuestionBatch(batch, "q9", "easy").completedQuestionIds.length, 10, "同じ問題を二重に数えない");
assert.equal(questionBatchComplete(rateQuestionBatch(batch, "q9", "again")), false);
assert.equal(createQuestionBatch(tasks.slice(0, 3), 10).questionIds.length, 3);
const session = { tasks, questionBatch: batch, currentTask: tasks[9], unseenQuestionIds: tasks.slice(10).map(task => task.questionId) };
assert.deepEqual(normalizeStudySession(session).questionBatch, batch);
assert.deepEqual(normalizeWorkerSession(session).questionBatch, batch, "Cloudflare側も対象と達成済み問題を保持する");
assert.deepEqual(normalizeStudySession(normalizeWorkerSession(session)).questionBatch, batch);
assert.equal(normalizeStudySession({ tasks }).questionBatch, null, "旧途中記録を読み込める");
assert.deepEqual(normalizeQuestionBatch({ questionIds: ["q0", "q0", "outside"], completedQuestionIds: ["outside"] }, new Set(["q0"])).completedQuestionIds, []);

let run = createStudyRoutineRun([{ id: "study", subjectId: "test", questionTarget: 10 }], "2026-10-14", "run");
const answerRoutine = (id, rating = "") => {
  const change = recordStudyRoutineQuestion(run, "test", "dataset", id, 2, rating, { uniqueQuestions: true });
  run = change.run; return change;
};
assert.equal(answerRoutine("q0", "good").counted, true);
assert.equal(answerRoutine("q0", "easy").counted, false);
assert.equal(answerRoutine("q1", "again").counted, false);
for (let i = 1; i < 9; i++) answerRoutine(`q${i}`, "hard");
assert.equal(run.items[0].completedCount, 9);
assert.equal(run.currentIndex, 0);
assert.ok(answerRoutine("q9", "easy").completedItem);
assert.equal(run.items[0].completedQuestionKeys.length, 10);
run = createStudyRoutineRun([{ id: "study", subjectId: "test", questionTarget: 10 }], "2026-10-14", "listen");
answerRoutine("q0");
run = reviseStudyRoutineListeningRating(run, "test", "again", { counted: true, datasetVersion: "dataset", questionId: "q0" }).run;
assert.equal(run.items[0].completedCount, 0);
assert.deepEqual(run.items[0].completedQuestionKeys, []);
assert.equal(answerRoutine("q0", "good").counted, true);

// 実際の画面処理を使い、不正解の繰り返し・保存失敗・続きの選択を確認する。
const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const helpers = app.slice(app.indexOf("function validateQuestionLimit()"), app.indexOf("async function beginStudy()"));
const rate = app.slice(app.indexOf("async function rateCurrentQuestion(rating)"), app.indexOf("async function resetAllProgress"));
const emptyRatings = () => ({ again: 0, hard: 0, good: 0, easy: 0 });
const state = { inRoutine: false, questionBatch: null, currentTask: tasks[0], queue: tasks.slice(1), sessionTasks: tasks,
  unseenQuestionIds: new Set(tasks.map(task => task.questionId)), retryQuestionIds: new Set(), answeredThisSession: 0,
  ratingCounts: emptyRatings(), studySeconds: 0, progress: { questions: {} }, activeSession: true, history: [], answerVisible: true };
const elements = new Proxy({}, { get(target, key) { return target[key] ??= { value: "", reportValidity: () => true, classList: { add() {}, remove() {} } }; } });
elements.questionLimit.value = "10";
let results = 0, failSave = false;
const context = { state, elements, console, Set, Map, structuredClone,
  createQuestionBatch, normalizeQuestionBatch, pendingQuestionBatchIds, questionBatchComplete, rateQuestionBatch,
  activeRoutineItem: () => null, studyRoutineUsesDeckTarget: () => false, cloneTask: task => task ? { ...task } : null,
  datasetVersionForQuestion: () => "dataset", isListeningMode: () => false, isQuestionDue: () => true,
  isVocabularyStream: () => false, setVocabularyStreamScreen() {},
  answerVisuals: { reset() {} }, stopListeningSequence() {}, stopStudyClock() {}, renderActionControls() {},
  speechController: { stop() {} }, ratingSoundPlayer: { play() {} },
  currentTerm: () => ({}), currentQuestion: () => ({ id: state.currentTask.questionId }),
  createRatingUndoSnapshot: () => ({}), captureActiveSession: () => structuredClone({ ...state, history: [] }),
  restoreActiveSession(snapshot) { Object.assign(state, snapshot); return true; }, restoreRatingUndoSnapshot() {},
  createRatingActivity: () => ({}), addRatingCount: (counts, rating) => ({ ...counts, [rating]: counts[rating] + 1 }),
  applyQuestionRating(_term, question, rating) { state.progress.questions[question.id] = { lastRating: rating }; },
  enqueueDueSessionTasks() {}, ensureUnseenTasksQueued() { context.refreshQuestionBatchQueue(); },
  enqueuePendingRetryTasksImmediately() { context.refreshQuestionBatchQueue(); }, startRoutineOvertimeIfNeeded() {},
  hasPendingRoutineOvertimeReview: () => false, recordActiveRoutineQuestion: () => null, clearRoutineOvertime() {},
  startNewStudyScreen() {}, renderQuestion() {}, autoSpeakQuestion() {}, window: { scrollTo() {} },
  studySessionSave: Promise.resolve(), queueCurrentStudyTimeSave: async () => {},
  async saveCloudStudyAnswer() { assert.equal(results, 0); if (failSave) throw Error("保存失敗"); return {}; },
  setSavedSessionForMode() {}, setRoundProgress() {}, pushHistory: snapshot => state.history.push(snapshot),
  ensureCurrentStudyScreen() {}, startStudyClock() {}, formatStudyDuration: String, renderRatingResult() { results++; },
  updateRoundProgressDisplay() {}, updateOverallProgress() {},
};
runInNewContext(helpers + "\n" + rate, context);
context.initializeQuestionLimit();
for (let i = 0; i < 9; i++) { state.answerVisible = true; await context.rateCurrentQuestion("good"); }
assert.equal(state.currentTask.questionId, "q9");
for (let i = 0; i < 3; i++) {
  state.answerVisible = true; await context.rateCurrentQuestion("again");
  assert.equal(state.currentTask.questionId, "q9");
  assert.equal(context.hasReachedQuestionLimit(), false);
}
failSave = true; state.answerVisible = true; await context.rateCurrentQuestion("good");
assert.equal(state.currentTask.questionId, "q9");
assert.equal(state.questionBatch.completedQuestionIds.length, 9);
assert.equal(results, 0);
failSave = false; state.answerVisible = true; await context.rateCurrentQuestion("good");
assert.equal(results, 1);
assert.equal(state.currentTask, null);
assert.equal(state.activeSession, true, "残り４９０問を途中記録へ残す");
assert.equal(state.unseenQuestionIds.size, 490);
assert.equal(state.answeredThisSession, 13, "回答回数と覚えた問題数を別々に数える");
context.initializeQuestionLimit();
assert.deepEqual([...state.questionBatch.questionIds], tasks.slice(10, 20).map(task => task.questionId));
assert.equal(state.currentTask.questionId, "q10");
console.log("問題数指定：５００問から１０問固定・９問習得後の１問反復・重複なし・保存側との一致・不正解・保存失敗・次の１０問・メニューと聞き流しの数え直しを確認しました。");
