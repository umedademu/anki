import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import * as engine from "../public/learning-engine.js";
import * as original from "../public/original-session.js";

const ratings = ["again", "hard", "good", "easy"];
const intervals = (seconds) => Object.fromEntries(ratings.map((rating) => [`${rating}Seconds`, seconds]));
const answeredAt = new Date("2026-09-11T00:00:00.000Z");
const beforeDue = new Date(answeredAt.getTime() + 59999);
const dueAt = new Date(answeredAt.getTime() + 60000);
const now = new Date(answeredAt.getTime() + 90000);
const day = intervals(86400);
const minute = intervals(60);
const progress = engine.createEmptyProgress();
for (const rating of ratings) engine.rateQuestion(progress, rating, rating, 2, day, answeredAt);
const before = structuredClone(progress);
engine.rescheduleReviewProgress(progress, minute);
for (const rating of ratings) {
  assert.deepEqual(progress.questions[rating], {
    ...before.questions[rating], nextReviewAt: dueAt.toISOString(),
  }, `${rating}は最後の回答時刻から1分後に変更し、回答の記録は維持する`);
  assert.equal(engine.isQuestionDue(progress, rating, beforeDue), false);
  assert.equal(engine.isQuestionDue(progress, rating, dueAt), true);
  assert.equal(engine.isQuestionDue(progress, rating, now), true);
}
assert.equal(progress.updatedAt, before.updatedAt);

const terms = [...ratings, "new"].map((id) => ({
  id: `term-${id}`, stages: { beginner: [{ id }], reverse: [], integrated: [] },
}));
assert.equal(engine.createQuestionQueue(terms, progress, 2, "beginner", now).length, 5);
assert.equal(engine.getNextDueAt(terms, progress, 2, "beginner"), dueAt.toISOString());
engine.rescheduleReviewProgress(progress, day);
assert.deepEqual(engine.createQuestionQueue(terms, progress, 2, "beginner", now).map((task) => task.questionId), ["new"]);
const loaded = engine.deserializeProgress(engine.serializeProgress(progress));
engine.rescheduleReviewProgress(loaded, engine.resolveSubjectReviewSettings(minute, null));
assert.equal(engine.createQuestionQueue(terms, loaded, 2, "beginner", now).length, 5);
engine.rescheduleReviewProgress(loaded, engine.resolveSubjectReviewSettings(minute, day));
assert.equal(engine.createQuestionQueue(terms, loaded, 2, "beginner", now).length, 1);

// 変更する評価だけを反映し、最後の評価を基準にする。
engine.rescheduleReviewProgress(progress, { ...day, hardSeconds: 60 });
assert.deepEqual(engine.createQuestionQueue(terms, progress, 2, "beginner", now).map((task) => task.questionId), ["hard", "new"]);
engine.rateQuestion(progress, "again", "easy", 2, day, now);
engine.rescheduleReviewProgress(progress, minute);
assert.equal(progress.questions.again.nextReviewAt, new Date(now.getTime() + 60000).toISOString());
assert.equal(engine.isQuestionDue(progress, "again", now), false);

const invalidProgress = { questions: {
  missing: { lastRating: "good", lastAnsweredAt: null, nextReviewAt: null },
  invalidDate: { lastRating: "good", lastAnsweredAt: "invalid", nextReviewAt: "kept" },
  invalidRating: { lastRating: "unknown", lastAnsweredAt: answeredAt.toISOString(), nextReviewAt: "kept" },
}, updatedAt: null };
const invalidBefore = structuredClone(invalidProgress);
engine.rescheduleReviewProgress(invalidProgress, minute);
assert.deepEqual(invalidProgress, invalidBefore);

const undoProgress = structuredClone(before);
const snapshot = engine.createRatingUndoSnapshot({
  progress: undoProgress, questionId: "hard", queue: [], currentTask: null,
  answerVisible: true, answeredThisSession: 1, ratingCounts: {}, unlockMessage: "",
});
engine.rateQuestion(undoProgress, "hard", "good", 2, minute, now);
engine.restoreRatingUndoSnapshot(undoProgress, snapshot, minute);
assert.deepEqual(undoProgress.questions.hard, { ...before.questions.hard, nextReviewAt: dueAt.toISOString() });

// 通信を禁止し、オリジナルの設定保存・復元でも全評価の予定が変わることを確認する。
const previousFetch = globalThis.fetch;
globalThis.fetch = () => { throw new Error("オリジナルの学習記録を送信してはいけません"); };
try {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const version = original.beginOriginalSession(day, () => storage);
  for (const rating of ratings) await original.saveCloudStudyAnswer(version, rating, before.questions[rating], null);
  const patch = (reviewSettings) => ({ setupPreferences: { subjects: { original: { reviewSettings } } } });
  await original.saveCloudSettings(patch(minute));
  let state = await original.loadCloudState(2, version);
  assert.equal(engine.createQuestionQueue(terms, state.progress, 2, "beginner", now).length, 5);
  await original.saveCloudSettings(patch(day));
  state = await original.loadCloudState(2, version);
  assert.equal(engine.createQuestionQueue(terms, state.progress, 2, "beginner", now).length, 1);
  await original.saveCloudSettings({ ...minute, ...patch(null) });
  state = await original.loadCloudState(2, version);
  for (const rating of ratings) assert.equal(state.progress.questions[rating].nextReviewAt, dueAt.toISOString());
  assert.deepEqual([...data.keys()], [original.originalReviewStorageKey]);
} finally {
  original.endOriginalSession();
  globalThis.fetch = previousFetch;
}

// 実際の画面の処理を音声・通信なしで実行し、出題待ちと途中再開を確認する。
const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
function source(name) {
  const match = app.match(new RegExp(`^(?:async )?function ${name}\\([^]*?(?=\\n(?:async )?function )`, "m"));
  assert.ok(match, name);
  return match[0];
}
const newTask = { termId: "term-new", questionId: "new", stage: "beginner" };
const state = {
  progress: structuredClone(before), terms, subject: { masteryTarget: 2 },
  activeSubjectId: "original", sharedReviewSettings: day,
  setupPreferences: { subjects: { original: { reviewSettings: minute } } },
  activeSession: true, currentTask: newTask, selectedStage: "beginner",
  queue: [], sessionTasks: [newTask], unseenQuestionIds: new Set(["new"]), retryQuestionIds: new Set(),
};
const context = {
  ...engine, state, now, Set, Date,
  cloneTask: (task) => task ? { ...task } : null,
  isListeningMode: () => false, routineOvertimeCutoffAt: () => null,
  usesOneQuestionPerTerm: () => false,
};
const functions = ["applyReviewSettings", "currentSubjectReviewSettings", "refreshPendingReviewTasks", "addTasksToActiveSession", "enqueueDueSessionTasks", "ensureUnseenTasksQueued"].map(source).join("\n");
runInNewContext(`${functions}\napplyReviewSettings(); refreshPendingReviewTasks(now);`, context);
assert.deepEqual(new Set(state.queue.map((task) => task.questionId)), new Set(ratings));
assert.equal(state.currentTask, newTask, "表示中の問題は切り替えない");
state.setupPreferences.subjects.original.reviewSettings = day;
runInNewContext(`${functions}\napplyReviewSettings(); refreshPendingReviewTasks(now); ensureUnseenTasksQueued();`, context);
assert.equal(state.queue.length, 0, "間隔を延ばした問題を、出題待ちから除き、未出題の補充で戻さない");
state.retryQuestionIds.add("again");
state.queue = [state.sessionTasks.find((task) => task.questionId === "again")];
runInNewContext(`${functions}\nrefreshPendingReviewTasks(now);`, context);
assert.equal(state.queue[0].questionId, "again", "同じ一周での不正解の即時再出題を維持する");
state.retryQuestionIds.clear();
state.setupPreferences.subjects.original.reviewSettings = minute;
runInNewContext(`${functions}\napplyReviewSettings(); refreshPendingReviewTasks(now);`, context);
assert.equal(new Set(state.queue.map((task) => task.questionId)).size, 4);
assert.equal(state.queue.length, 4, "短縮・延長を繰り返しても重複させない");
assert.match(source("saveSetupReviewPreference"), /applyReviewSettings\(\)/);
assert.match(source("saveStudyMenuSettings"), /applyReviewSettings\(\)/);
assert.match(source("saveStudyMenuSettings"), /refreshPendingReviewTasks\(\)/);
assert.match(source("loadProgressFromCloud"), /rescheduleReviewProgress\(state.progress, state.reviewSettings\)/);
assert.match(source("resumeStudy"), /refreshPendingReviewTasks\(\)/);
console.log("復習予定変更検証完了: 全4評価・短縮と延長・回答時刻基準・共通と個別・再読み込み・途中再開・一手戻し・端末内学習");
