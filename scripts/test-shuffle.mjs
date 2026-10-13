import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import * as engine from "../public/learning-engine.js";

const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const source = name => {
  const match = app.match(new RegExp(`^function ${name}\\([^]*?(?=\\n(?:async )?function )`, "m"));
  assert.ok(match, name); return match[0];
};
const tasks = Array.from({ length: 10 }, (_, i) => ({ termId: `t${i}`, questionId: `q${i}`, stage: "beginner" }));
const now = new Date("2026-10-13T00:00:00Z");
const state = { activeSession: true, sequentialEnabled: false, shuffleEnabled: true, queue: [],
  sessionTasks: [], unseenQuestionIds: new Set(), retryQuestionIds: new Set(), currentTask: { termId: "current", questionId: "current", stage: "beginner" },
  progress: { questions: Object.fromEntries(tasks.map((task, i) => [task.questionId, {
    lastAnsweredAt: "2026-10-01T00:00:00Z", nextReviewAt: new Date(now.getTime() - (10 - i) * 1000).toISOString(),
  }])) } };
const originalProgress = structuredClone(state.progress);
const context = { ...engine, state, now, Set, Date, isListeningMode: () => false,
  routineOvertimeCutoffAt: () => null, cloneTask: task => ({ ...task }),
  shuffleTasks: tasks => engine.shuffleTasks(tasks, () => 0.37) };
runInNewContext(["addTasksToActiveSession", "ensureUnseenTasksQueued", "enqueueDueSessionTasks", "enqueuePendingRetryTasksImmediately", "routineOvertimeReviewTasks"].map(source).join("\n"), context);
context.addTasksToActiveSession(tasks);
assert.notDeepEqual(Array.from(state.queue, task => task.questionId), tasks.map(task => task.questionId), "後から追加される段階・復習も掲載順のままにしない");
assert.equal(state.queue.length, 10); assert.equal(state.unseenQuestionIds.size, 10);
context.addTasksToActiveSession(tasks);
assert.equal(state.queue.length, 10, "同じ問題を重複追加しない");
state.queue = []; context.ensureUnseenTasksQueued();
assert.notDeepEqual(Array.from(state.queue, task => task.questionId), tasks.map(task => task.questionId), "未出題の補充にもシャッフルを適用する");
state.queue = []; state.unseenQuestionIds = new Set();
context.enqueueDueSessionTasks(now);
assert.notDeepEqual(Array.from(state.queue, task => task.questionId), tasks.map(task => task.questionId), "復習日時の昇順でシャッフルを取り消さない");
assert.deepEqual(new Set(Array.from(state.queue, task => task.questionId)), new Set(tasks.map(task => task.questionId)));
state.queue = []; state.shuffleEnabled = false;
context.enqueueDueSessionTasks(now);
assert.deepEqual(Array.from(state.queue, task => task.questionId), tasks.map(task => task.questionId), "オフなら従来の復習日時順を保つ");
assert.equal(state.currentTask.questionId, "current", "表示中の問題を入れ替えない");
state.shuffleEnabled = true;
state.unseenQuestionIds = new Set(["q0"]);
const overtime = context.routineOvertimeReviewTasks(now.getTime() - 5000);
assert.notDeepEqual(Array.from(overtime, task => task.questionId), ["q1", "q2", "q3", "q4", "q5"], "メニューの追加復習でも混ぜる");
assert.deepEqual(new Set(Array.from(overtime, task => task.questionId)), new Set(["q1", "q2", "q3", "q4", "q5"]), "未出題と猶予の範囲外を追加復習へ混ぜない");
state.queue = [];
state.retryQuestionIds = new Set(tasks.map(task => task.questionId));
context.enqueuePendingRetryTasksImmediately();
assert.notDeepEqual(Array.from(state.queue, task => task.questionId), tasks.map(task => task.questionId), "不正解の再出題も掲載順のままにしない");
assert.equal(state.queue.length, 10);
assert.deepEqual(state.progress, originalProgress, "問題ごとの評価・復習日時を変更しない");
console.log("シャッフル：後からの問題追加・未出題の補充・期限を迎えた復習・メニューの追加復習・重複防止・オフの順序・現在の問題と記録の保持を確認しました。");
