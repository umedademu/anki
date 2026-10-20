import assert from "node:assert/strict";
import {
  applyStudySessionPatch,
  createStudySessionPatch,
  studySessionFingerprint,
  studySessionPatchMatches,
  studySessionPatchVersion,
} from "../public/study-session-patch.js";
import { normalizeStudySession as normalizeBrowserSession } from "../public/cloud-progress.js";
import { normalizeStudySession as normalizeWorkerSession } from "../worker/src/index.js";

// 途中記録の差分：聞き流しで1語進んだ時の差分が小さく、保存窓口側で同じ結果になることを確かめる。
const count = 2000;
const tasks = Array.from({ length: count }, (_, index) => ({
  termId: `EN-${String(index + 1).padStart(6, "0")}`,
  questionId: `EN-${String(index + 1).padStart(6, "0")}-B01`,
  stage: "beginner",
}));
function makeSession(overrides = {}) {
  return normalizeBrowserSession({
    schemaVersion: 1,
    roundId: "round-1",
    studyMode: "listen-answer",
    vocabularyStreamEnabled: true,
    vocabularyStreamRows: [],
    deckIds: ["deck-1", "deck-2", "deck-3", "deck-4"],
    termIds: tasks.map((task) => task.termId),
    tasks,
    queue: tasks.slice(1),
    currentTask: tasks[0],
    unseenQuestionIds: tasks.map((task) => task.questionId),
    retryQuestionIds: [],
    answeredCount: 0,
    ratingCounts: { again: 0, hard: 0, good: 0, easy: 0 },
    studySeconds: 0,
    screenStudySeconds: 0,
    savedScreenStudySeconds: 0,
    studyTimeEventId: "screen-1",
    answerVisible: false,
    startedAt: "2026-10-20T00:00:00.000Z",
    updatedAt: "2026-10-20T00:00:01.000Z",
    ...overrides,
  });
}

const base = makeSession();
const fullBytes = Buffer.byteLength(JSON.stringify(base));
assert.ok(fullBytes > 300_000, `2,000語の途中記録は全体で300KBを超える（${fullBytes}バイト）`);

// 1語進んだ後：現在の問題が次へ移り、出題待ちと未出題から1件ずつ減り、3行の表示が更新される。
const advanced = makeSession({
  queue: tasks.slice(2),
  currentTask: tasks[1],
  unseenQuestionIds: tasks.slice(1).map((task) => task.questionId),
  answeredCount: 1,
  vocabularyStreamRows: [
    { ...tasks[1], answerVisible: false, rating: "", activityId: "", answeredAt: null, previousRecord: null, routineCounted: false },
    { ...tasks[0], answerVisible: true, rating: "", activityId: "activity-1", answeredAt: "2026-10-20T00:00:02.000Z", previousRecord: null, routineCounted: false },
  ],
  studySeconds: 3,
  screenStudySeconds: 0,
  studyTimeEventId: "screen-2",
  updatedAt: null,
});
const patch = createStudySessionPatch(base, advanced);
assert.equal(patch.version, studySessionPatchVersion);
const patchBytes = Buffer.byteLength(JSON.stringify(patch));
assert.ok(patchBytes < 1500, `1語分の差分は1.5KB未満に収まる（${patchBytes}バイト）`);
assert.deepEqual(patch.lists.queue, { remove: [tasks[1].questionId] }, "出題待ちは先頭の1件を消す差分になる");
assert.deepEqual(patch.lists.unseenQuestionIds, { remove: [tasks[0].questionId] });
assert.equal(patch.lists.tasks, undefined, "変わらない出題対象は送らない");
assert.equal(patch.lists.termIds, undefined);
assert.equal(patch.set.currentTask.questionId, tasks[1].questionId);
assert.equal(patch.set.answeredCount, 1);
assert.equal(patch.set.updatedAt, undefined, "更新日時は保存窓口が付けるため送らない");

// 保存窓口側：保存済みの内容へ当てはめ、既存の正規化処理に通した結果がブラウザー側と一致する。
const storedJson = JSON.stringify({ ...base, updatedAt: "2026-10-20T00:00:01.000Z" });
const applied = normalizeWorkerSession(applyStudySessionPatch(JSON.parse(storedJson), patch));
assert.ok(studySessionPatchMatches(patch, applied), "当てはめた結果の要約がブラウザー側の要約と一致する");
assert.equal(applied.queue.length, count - 2);
assert.equal(applied.queue[0].questionId, tasks[2].questionId);
assert.equal(applied.unseenQuestionIds.length, count - 1);
assert.equal(applied.currentTask.questionId, tasks[1].questionId);
assert.equal(applied.vocabularyStreamRows.length, 2);
assert.equal(applied.vocabularyStreamRows[1].activityId, "activity-1");
assert.equal(applied.tasks.length, count);
assert.equal(applied.termIds.length, count);
assert.equal(
  JSON.stringify(normalizeBrowserSession(applied)),
  JSON.stringify(normalizeBrowserSession({ ...advanced, updatedAt: null })),
  "当てはめた途中記録はブラウザー側の途中記録と同じ内容になる",
);

// 差分を2回続けても、毎回の前提が前回の結果に合えば当てはまる。
const advancedTwice = makeSession({
  queue: tasks.slice(3),
  currentTask: tasks[2],
  unseenQuestionIds: tasks.slice(2).map((task) => task.questionId),
  answeredCount: 2,
  updatedAt: null,
});
const secondPatch = createStudySessionPatch(advanced, advancedTwice);
const appliedTwice = normalizeWorkerSession(applyStudySessionPatch(applied, secondPatch));
assert.ok(studySessionPatchMatches(secondPatch, appliedTwice));
assert.equal(appliedTwice.answeredCount, 2);

// 前提が合わない（保存窓口の内容が別端末で進んでいた）時は、理由付きで拒否する。
assert.throws(
  () => applyStudySessionPatch(JSON.parse(storedJson), secondPatch),
  (error) => error.code === "study-session-patch-base",
);
assert.throws(
  () => applyStudySessionPatch(null, patch),
  (error) => error.code === "study-session-patch-missing",
);
assert.throws(
  () => applyStudySessionPatch(JSON.parse(storedJson), { ...patch, version: 99 }),
  (error) => error.code === "study-session-patch-version",
);

// 3語表示の表示行が11行（表示3行と10個前まで）たまった後も、1語進む差分は行の入れ替わりだけで済む。
const row = (index, extra = {}) => ({ ...tasks[index], answerVisible: true, rating: "good", activityId: `activity-${index}`,
  answeredAt: "2026-10-20T00:00:02.000Z", previousRecord: null, routineCounted: false, ...extra });
const fullRows = [row(11, { answerVisible: false, rating: "", activityId: "", answeredAt: null }), ...Array.from({ length: 10 }, (_, offset) => row(10 - offset))];
const fullBase = makeSession({ vocabularyStreamRows: fullRows, currentTask: tasks[11], queue: tasks.slice(12), answeredCount: 11 });
const fullNext = makeSession({
  vocabularyStreamRows: [row(12, { answerVisible: false, rating: "", activityId: "", answeredAt: null }), row(11), ...fullRows.slice(1, 10)],
  currentTask: tasks[12], queue: tasks.slice(13), answeredCount: 12, updatedAt: null,
});
const fullPatch = createStudySessionPatch(fullBase, fullNext);
assert.deepEqual(Object.keys(fullPatch.lists.vocabularyStreamRows).sort(), ["remove", "unshift"], "表示行は消す行と先頭へ足す行だけを送る");
assert.equal(fullPatch.lists.vocabularyStreamRows.unshift.length, 2, "新しい現在語と評価の付いた前の現在語を先頭へ足す");
assert.equal(fullPatch.lists.vocabularyStreamRows.remove.length, 2, "評価前の現在語と11行目を消す");
const fullPatchBytes = Buffer.byteLength(JSON.stringify(fullPatch));
assert.ok(fullPatchBytes < 2000, `11行の表示行があっても1語分の差分は2KB未満に収まる（${fullPatchBytes}バイト）`);
const fullApplied = normalizeWorkerSession(applyStudySessionPatch(JSON.parse(JSON.stringify({ ...fullBase, updatedAt: "2026-10-20T00:00:01.000Z" })), fullPatch));
assert.ok(studySessionPatchMatches(fullPatch, fullApplied));
assert.equal(fullApplied.vocabularyStreamRows.length, 11);
assert.deepEqual(fullApplied.vocabularyStreamRows.map((item) => item.questionId), fullNext.vocabularyStreamRows.map((item) => item.questionId));
assert.equal(fullApplied.vocabularyStreamRows[1].activityId, "activity-11");
// 途中の行の評価を訂正した時も、当てはめた結果が画面側と一致する。
const revisedNext = makeSession({ ...fullNext, vocabularyStreamRows: fullNext.vocabularyStreamRows.map((item, index) => index === 6 ? { ...item, rating: "again" } : item), updatedAt: null });
const revisedPatch = createStudySessionPatch(fullNext, revisedNext);
const revisedApplied = normalizeWorkerSession(applyStudySessionPatch(JSON.parse(JSON.stringify({ ...fullApplied, updatedAt: "2026-10-20T00:00:03.000Z" })), revisedPatch));
assert.ok(studySessionPatchMatches(revisedPatch, revisedApplied), "過去の行の評価訂正も差分で当てはまる");
assert.equal(revisedApplied.vocabularyStreamRows[6].rating, "again");
assert.equal(revisedApplied.vocabularyStreamRows.length, 11);

// 不正解の再出題：出題待ちの末尾へ戻る変化は「消して末尾へ足す」で表せる。
const requeued = makeSession({
  queue: [...tasks.slice(2), tasks[1]],
  currentTask: tasks[1],
  retryQuestionIds: [tasks[1].questionId],
  answeredCount: 1,
  updatedAt: null,
});
const requeuePatch = createStudySessionPatch(base, requeued);
assert.deepEqual(requeuePatch.lists.queue, { remove: [tasks[1].questionId], push: [tasks[1]] });
// 空の一覧へ1件足す時は、短い方の表し方（一覧全体）を選ぶ。
assert.deepEqual(requeuePatch.lists.retryQuestionIds, { set: [tasks[1].questionId] });
const appliedRequeue = normalizeWorkerSession(applyStudySessionPatch(JSON.parse(storedJson), requeuePatch));
assert.ok(studySessionPatchMatches(requeuePatch, appliedRequeue));
assert.equal(appliedRequeue.queue.at(-1).questionId, tasks[1].questionId);
assert.deepEqual(appliedRequeue.retryQuestionIds, [tasks[1].questionId]);
// 既にある一覧へ足す時は「末尾に足す」になる。
const retryAgain = makeSession({ retryQuestionIds: [tasks[1].questionId, tasks[2].questionId], updatedAt: null });
assert.deepEqual(createStudySessionPatch(requeued, retryAgain).lists.retryQuestionIds, { push: [tasks[2].questionId] });

// 復習時刻を迎えた問題を先頭へ足す変化は「先頭に足す」で表せる。
const prepended = makeSession({
  queue: [tasks[0], ...tasks.slice(1)],
  currentTask: null,
  updatedAt: null,
});
const prependPatch = createStudySessionPatch(base, prepended);
assert.deepEqual(prependPatch.lists.queue, { unshift: [tasks[0]] });
assert.equal(prependPatch.set.currentTask, null);

// 並びを混ぜ直した時は一覧全体を送り、結果は同じになる。
const shuffled = makeSession({
  queue: [...tasks.slice(1)].reverse(),
  updatedAt: null,
});
const shufflePatch = createStudySessionPatch(base, shuffled);
assert.ok(Array.isArray(shufflePatch.lists.queue.set), "入れ替わった一覧は全体を送る");
const appliedShuffle = normalizeWorkerSession(applyStudySessionPatch(JSON.parse(storedJson), shufflePatch));
assert.ok(studySessionPatchMatches(shufflePatch, appliedShuffle));
assert.equal(appliedShuffle.queue[0].questionId, tasks[count - 1].questionId);

// 一周が変わった時や空の途中記録では差分を作らず、全体の保存に任せる。
assert.equal(createStudySessionPatch(base, makeSession({ roundId: "round-2" })), null);
assert.equal(createStudySessionPatch(null, advanced), null);
assert.equal(createStudySessionPatch(base, null), null);

// 変化がない時も前提と結果の要約だけを持つ差分になる。
const unchanged = createStudySessionPatch(base, makeSession({ updatedAt: null }));
assert.equal(unchanged.set, undefined);
assert.equal(unchanged.lists, undefined);
assert.equal(unchanged.base, unchanged.expect);

// 特別な名前の項目は無視し、保存内容を汚さない。
const polluted = applyStudySessionPatch(JSON.parse(storedJson), {
  ...patch,
  set: { ...patch.set, __proto__: { polluted: true }, constructor: "x", unknown: 1 },
  lists: { ...patch.lists, __proto__: { set: [] } },
});
assert.equal(polluted.unknown, undefined);
assert.equal(Object.getPrototypeOf(polluted), Object.prototype);
assert.equal({}.polluted, undefined);

// 要約は内容が変わると変わり、同じ内容なら両側の正規化を通しても一致する。
assert.notEqual(studySessionFingerprint(base), studySessionFingerprint(advanced));
assert.equal(
  studySessionFingerprint(normalizeBrowserSession(base)),
  studySessionFingerprint(normalizeWorkerSession(JSON.parse(storedJson))),
);

console.log(`途中記録の差分保存を確認しました：全体${Math.round(fullBytes / 1024)}KBに対し1語分の差分は${patchBytes}バイト`);
