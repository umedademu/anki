import assert from "node:assert/strict";
import { avoidImmediateRepeat, createSequentialStudyTasks, orderedDeckIds, sequentialStudyPlan } from "../public/sequential-study.js";
import { normalizeSetupPreferences, normalizeStudySession } from "../public/cloud-progress.js";
import { normalizeSetupPreferences as workerPreferences, normalizeStudySession as workerSession } from "../worker/src/index.js";
import { applyStudyRoutineMultiplier, createStudyRoutineRun, recordStudyRoutineQuestion, setStudyRoutineQuestionTarget } from "../public/study-routine.js";

const now = new Date("2026-10-13T00:00:00Z");
const deckOrder = Array.from({ length: 6 }, (_, index) => `part-${index + 1}`);
const terms = deckOrder.map((id, index) => ({ id: `t${index}`, stages: {
  beginner: [{ id: `${id}-a` }], reverse: [{ id: `${id}-b` }], integrated: [],
} }));
const tasks = createSequentialStudyTasks(terms);
const questionDeckIds = new Map(tasks.map(task => [task.questionId, task.questionId.slice(0, -2)]));
const progress = { questions: {} };
const passed = nextReviewAt => ({ lastRating: "hard", lastAnsweredAt: "2026-10-12T00:00:00Z", nextReviewAt, streak: 1 });
const plan = extra => sequentialStudyPlan({ tasks, progress, deckOrder, questionDeckIds, now, ...extra });
assert.deepEqual(plan().queue.map(task => task.questionId), ["part-1-a", "part-1-b"], "後ろのパートを混ぜない。段階は連続正解２回を待たず同じパート内で進める");
for (const task of tasks.filter(task => /^part-[123]-/.test(task.questionId))) progress.questions[task.questionId] = passed("2026-10-20T00:00:00Z");
for (const id of ["part-1-a", "part-3-b"]) progress.questions[id].nextReviewAt = "2026-10-12T23:59:00Z";
assert.equal(plan().currentDeckId, "part-4");
assert.deepEqual(plan().masteredDeckIds, ["part-1", "part-2", "part-3"], "難しい・正解も１回で習得と判定");
assert.deepEqual(plan().queue.map(task => task.questionId), ["part-1-a", "part-3-b", "part-4-a", "part-4-b"], "過去の復習２問の後で現在のパートへ進む");
for (const id of ["part-1-a", "part-3-b", "part-4-a", "part-4-b"]) progress.questions[id] = passed("2026-10-20T00:00:00Z");
assert.equal(plan().currentDeckId, "part-5", "翌日を待たず次へ進む");
progress.questions["part-1-a"] = { ...passed("2026-10-20T00:00:00Z"), lastRating: "again" };
assert.equal(plan().currentDeckId, "part-1", "過去の習得済み印があっても現在の不正解を保持する");
assert.deepEqual(plan({ retryQuestionIds: new Set(["part-1-a"]) }).queue.map(task => task.questionId), ["part-1-a"], "不正解を解消するまでは先の未回答を開かない");
assert.deepEqual(orderedDeckIds(deckOrder, ["part-6", "part-6", "deleted", "part-2"]), ["part-6", "part-2", "part-1", "part-3", "part-4", "part-5"]);
progress.questions["part-1-a"] = passed("2026-10-20T00:00:00Z");
assert.equal(plan({ deckOrder: orderedDeckIds(deckOrder, ["part-6"]) }).currentDeckId, "part-6", "科目ごとの並びを使う");
const prefs = { subjects: { test: { selectedDeckIds: deckOrder, deckOrder: ["part-6", "part-2"], sequentialEnabled: true, questionLimit: 100 } } };
assert.deepEqual(normalizeSetupPreferences(prefs), workerPreferences(prefs), "画面と保存先の設定が一致する");
assert.equal(workerPreferences(prefs).subjects.test.questionLimit, 100);
const session = { tasks, termIds: terms.map(term => term.id), deckIds: deckOrder, sequentialEnabled: true, deckOrder,
  questionLimit: 10, questionLimitStart: 5, questionLimitRatings: { good: 4 }, questionLimitSeconds: 50 };
assert.deepEqual(normalizeStudySession(session), workerSession(session), "順番と指定数を途中記録へ保持する");
const run = createStudyRoutineRun([{ id: "a", subjectId: "test", questionTarget: 100 }], "2026-10-13", "run-test");
run.items[0].completedCount = 30;
run.items[0].studySeconds = 45;
const changed = setStudyRoutineQuestionTarget(run, "a", 60);
assert.equal(changed.items[0].questionTarget, 60);
assert.equal(changed.items[0].baseQuestionTarget, 100, "毎日の元の目標を保持する");
assert.equal(changed.items[0].completedCount, 30);
assert.equal(changed.items[0].studySeconds, 45);
assert.equal(applyStudyRoutineMultiplier(changed, 2).items[0].questionTarget, 60, "手入力した目標を保存時に倍率で戻さない");
let current = changed;
for (let i = 0; i < 30; i++) current = recordStudyRoutineQuestion(current, "test", "dataset", `q${i}`, 0, "good").run;
assert.equal(current.currentIndex, 1, "変更後の目標でメニューを完了する");
assert.equal(setStudyRoutineQuestionTarget(run, "a", 20).items[0].completedCount, 30, "目標を下げても達成済み件数を削らない");
// 不正解の再出題は、今のパートの未出題問題の後ろへ回し、すぐ次に繰り返さない。
const wrong = { lastRating: "again", lastAnsweredAt: "2026-10-12T23:59:00Z", nextReviewAt: "2026-10-12T23:59:30Z", streak: 0 };
const retryProgress = { questions: { "part-1-a": wrong } };
const retryPlan = extra => sequentialStudyPlan({ tasks, progress: retryProgress, deckOrder, questionDeckIds, now,
  retryQuestionIds: new Set(["part-1-a"]), ...extra });
for (const shuffle of [false, true]) {
  assert.deepEqual(retryPlan({ shuffle }).queue.map(task => task.questionId), ["part-1-b", "part-1-a"],
    `不正解は未出題の問題の後ろで再出題する（シャッフル${shuffle ? "ON" : "OFF"}）`);
}
retryProgress.questions["part-3-a"] = passed("2026-10-12T00:00:00Z");
assert.deepEqual(retryPlan().queue.map(task => task.questionId), ["part-3-a", "part-1-b", "part-1-a"], "復習時期の問題は従来どおり先に出す");
retryProgress.questions["part-1-b"] = wrong;
const twoRetries = new Set(["part-1-b", "part-1-a"]);
assert.deepEqual(retryPlan({ retryQuestionIds: twoRetries, queuedQuestionIds: ["part-1-b"] }).queue.map(task => task.questionId),
  ["part-3-a", "part-1-b", "part-1-a"], "待っている再出題を先にし、直前に不正解にした問題を最後へ回す");
assert.deepEqual(retryPlan({ retryQuestionIds: twoRetries, queuedQuestionIds: ["part-1-a"], shuffle: true }).queue.slice(1).map(task => task.questionId),
  ["part-1-a", "part-1-b"], "シャッフル中も直前に不正解にした問題をすぐ次に出さない");
// 今のパートに不正解の問題しか残らない時は、次のパートの新しい問題を１問はさみ、同じ問題を続けて出さない。
const onlyRetry = { questions: { "part-1-a": { ...passed("2026-10-20T00:00:00Z") }, "part-1-b": wrong } };
for (const shuffle of [false, true]) {
  const avoided = sequentialStudyPlan({ tasks, progress: onlyRetry, deckOrder, questionDeckIds, now, shuffle,
    retryQuestionIds: new Set(["part-1-b"]), avoidQuestionId: "part-1-b" });
  assert.match(avoided.queue[0].questionId, /^part-2-[ab]$/, `次のパートの問題をはさむ（シャッフル${shuffle ? "ON" : "OFF"}）`);
  assert.equal(avoided.queue[1].questionId, "part-1-b");
  assert.equal(avoided.currentDeckId, "part-1", "はさんでも不正解が残るパートは習得扱いにしない");
}
assert.deepEqual(sequentialStudyPlan({ tasks, progress: onlyRetry, deckOrder, questionDeckIds, now,
  retryQuestionIds: new Set(["part-1-b"]) }).queue.map(task => task.questionId), ["part-1-b"], "直前の問題でなければ、次のパートを開かず再出題する");
const allAnswered = { questions: Object.fromEntries(tasks.map(task => [task.questionId, passed("2026-10-20T00:00:00Z")])) };
allAnswered.questions["part-6-b"] = wrong;
assert.notEqual(sequentialStudyPlan({ tasks, progress: allAnswered, deckOrder, questionDeckIds, now,
  retryQuestionIds: new Set(["part-6-b"]), avoidQuestionId: "part-6-b" }).queue[0].questionId, "part-6-b", "新しい問題が無ければ範囲内の別の問題をはさむ");
const single = tasks.filter(task => task.questionId === "part-1-a");
assert.deepEqual(sequentialStudyPlan({ tasks: single, progress: { questions: { "part-1-a": wrong } }, deckOrder, questionDeckIds, now,
  retryQuestionIds: new Set(["part-1-a"]), avoidQuestionId: "part-1-a" }).queue.map(task => task.questionId), ["part-1-a"], "範囲にほかの問題が無い時だけ続けて出す");
const swapped = avoidImmediateRepeat([{ questionId: "x" }, { questionId: "y" }, { questionId: "z" }], "x");
assert.deepEqual(swapped.map(task => task.questionId), ["y", "x", "z"], "固定した問題の中に別の問題があれば先に出す");
console.log("順番学習：習得判定・復習優先・順序変更・同じ回の次パート・不正解・不正解の再出題位置・同じ問題を続けて出さない・途中記録・保存側の一致・今回だけの目標変更を確認しました。");
