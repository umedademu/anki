import { questionTypes, resolveQuestionTypes, filterQuestionTypes } from "../public/question-types.js";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { filterTimeQuestions, hasTimeQuestions, isTimeQuestion } from "../public/time-questions.js";
import { createEmptyProgress, createQuestionQueue, createTermQuestionQueue, filterTermsBySelection, getTermStage, learningStages } from "../public/learning-engine.js";
import { normalizeSetupPreferences, normalizeStudySession, switchStudySessionMode } from "../public/cloud-progress.js";
import { normalizeSetupPreferences as workerPreferences, normalizeStudySession as workerSession } from "../worker/src/index.js";

for (const question of [
  { type: "time", prompt: "活動年代は？" },
  { type: "relation", focus: "時期", prompt: "特に広がった時代は？" },
  { prompt: "いつ完成した？" },
  { prompt: "いつ、どこに建てられた？" },
  { prompt: "成立したのは何年？" },
  { prompt: "何年までの達成を目指す何個の国際目標か。" },
  { prompt: "ビッグバンのおよそ何年後に起こったか。" },
]) assert.equal(isTimeQuestion(question), true, question.prompt);
for (const question of [
  { prompt: "ドイツ統一(どいつとういつ)を進めた人物は？" },
  { prompt: "任期は何年か。" },
  { prompt: "地球の年齢は約何億年か。" },
  { prompt: "1990年に起きた事件は？" },
  { prompt: "いつしか" },
  { prompt: "〜するときはいつでも" },
  { prompt: "寒冷前線が温暖前線に追いつき、できる前線は？" },
  { stage: "integrated", type: "time", prompt: "時期も含めて説明せよ。" },
]) assert.equal(isTimeQuestion(question), false, question.prompt);

const q = (id, stage, type = "identify") => ({ id, stage, type, prompt: type === "time" ? "いつ？" : "何？", answer: "答え" });
const terms = [{ id: "t1", term: "出来事", stages: {
  beginner: [q("b1", "beginner"), q("b2", "beginner", "time")],
  reverse: [q("r1", "reverse", "time")],
  integrated: [q("i1", "integrated", "integrated")],
} }, { id: "t2", stages: { beginner: [q("b3", "beginner", "time")] } }];
const original = structuredClone(terms);
const filtered = filterTimeQuestions(terms);
assert.equal(hasTimeQuestions(terms), true);
assert.equal(filtered.length, 1);
assert.equal(filtered[0].stages.beginner.length, 1);
assert.equal(filtered[0].stages.reverse.length, 0);
assert.equal(filtered[0].stages.integrated.length, 1);
assert.deepEqual(terms, original, "元の問題集を変更しない");
assert.equal(filterTimeQuestions(terms, false), terms, "オフで元の全問を戻す");
const progress = createEmptyProgress();
assert.deepEqual(createQuestionQueue(filtered, progress, 2).map(t => t.questionId), ["b1"]);
assert.deepEqual(createTermQuestionQueue(filtered, progress, 2).map(t => t.questionId), ["b1"]);
progress.questions.b1 = { everMastered: true, lastAnsweredAt: "2026-09-17T00:00:00Z", nextReviewAt: "2099-01-01T00:00:00Z" };
progress.questions.b2 = { attempts: 7, lastRating: "again" };
assert.equal(getTermStage(filtered[0], progress, 2), "integrated");
assert.deepEqual(createQuestionQueue(filtered, progress, 2).map(t => t.questionId), ["i1"], "空になった段階で止まらない");
assert.equal(progress.questions.b2.attempts, 7, "除外した問題の履歴を維持する");

for (const value of [undefined, true, false]) {
  const input = { subjects: { "world-history": { decks: { "deck-1": { excludeTimeQuestions: value } } } } };
  const browser = normalizeSetupPreferences(input);
  const worker = workerPreferences(browser);
  assert.equal(worker.subjects["world-history"].decks["deck-1"].excludeTimeQuestions, value !== false);
  assert.deepEqual(normalizeSetupPreferences(worker), browser, "保存・再読込でオンオフを保持する");
}

// 実際のアプリの再開処理を実行し、現在問・待ち行列・再出題からの除外を確認する。
const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const extract = (start, end) => app.slice(app.indexOf(start), app.indexOf(end, app.indexOf(start)));
const state = { allTerms: terms, activeDeckIds: ["deck-1"], activeSubjectId: "japanese-history", subject: { learningType: "history" }, studyTimeLimitSeconds: 60, progress };
const elements = { excludeTimeQuestions: { checked: true }, questionTypeOptions: { querySelectorAll: () => [] } };
const context = {
  questionTypes, resolveQuestionTypes, filterQuestionTypes,
  state, elements, filterTimeQuestions, hasTimeQuestions, filterTermsBySelection, learningStages,
  normalizeStudySession, normalizeRatingCounts: v => v, createEventId: () => "round",
  cloneTask: t => t ? { ...t } : null, setSavedSessionForMode() {}, refreshPendingReviewTasks() {},
  selectedFilters: () => ({}), setSetupControlsFromSession() {},
};
runInNewContext([
  extract("function setStudyTerms(", "function captureActiveSession("),
  extract("function restoreActiveSession(", "function queueActiveSessionSave("),
  extract("function supportsQuestionTypes(", "function updateSetupPreview("),
].join("\n"), context);
const tasks = terms.flatMap(t => Object.values(t.stages).flat().map(question => ({ termId: t.id, questionId: question.id, stage: question.stage })));
const session = {
  studyMode: "memorize", deckIds: ["deck-1"], termIds: ["t1", "t2"], tasks,
  currentTask: tasks.find(t => t.questionId === "b2"), queue: tasks,
  unseenQuestionIds: ["b1", "b2", "b3"], retryQuestionIds: ["b2", "r1", "b1"],
  screenStudySeconds: 12, savedScreenStudySeconds: 10, studyTimeEventId: "old-screen", answerVisible: true,
};
for (const mode of ["memorize", "listen-answer"]) {
  for (const exclude of [undefined, true, false]) {
    const saved = workerSession(normalizeStudySession({ ...session, studyMode: mode, excludeTimeQuestions: exclude }));
    assert.equal(saved.excludeTimeQuestions, exclude !== false);
    assert.equal(context.restoreActiveSession(saved), true);
    if (exclude !== false) {
      assert.equal(state.currentTask, null);
      assert.deepEqual(Array.from(state.sessionTasks, t => t.questionId), ["b1", "i1"]);
      assert.deepEqual(Array.from(state.unseenQuestionIds), ["b1"]);
      assert.deepEqual(Array.from(state.retryQuestionIds), ["b1"]);
      assert.equal(state.screenStudySeconds, 0);
      assert.equal(state.studyTimeEventId, "");
      assert.equal(state.answerVisible, false);
    } else {
      assert.equal(state.currentTask.questionId, "b2");
      assert.equal(state.sessionTasks.length, 5);
      assert.equal(state.screenStudySeconds, 12);
    }
  }
}
for (const [id, type] of [["original", "cards"], ["english-vocabulary", "vocabulary"]]) {
  state.activeSubjectId = id;
  state.subject.learningType = type;
  assert.equal(context.supportsTimeQuestionExclusion(), false);
}
assert.deepEqual(terms, original);
// 全問が除外される既存の一周は削除せず、解除方法を表示する。
state.activeSubjectId = "japanese-history";
state.subject.learningType = "history";
state.cloudReady = true;
let deleted = 0;
let saveFails = false;
const onlyTime = { ...session, termIds: ["t2"], tasks: [tasks.at(-1)], queue: [], currentTask: tasks.at(-1) };
Object.assign(elements, { resumeStudy: {}, startStudy: {}, cloudStatus: {} });
Object.assign(context, {
  validateQuestionLimit: () => true, selectedStudyMode: () => "memorize",
  savedSessionForMode: () => onlyTime, activeRoutineItem: () => null,
  switchStudySessionMode, startingStudy: false, deckSelectionUpdating: false,
  speechController: { stop() {} },
  queueSetupPreferenceSave: async () => { if (saveFails) throw Error("保存失敗"); },
  updateSetupPreview() { elements.cloudStatus.textContent = "接続済み"; },
  deleteCloudStudySession: async () => { deleted++; },
});
runInNewContext(extract("async function resumeStudy()", "async function activateDecks("), context);
await context.resumeStudy();
assert.equal(deleted, 0);
assert.equal(context.startingStudy, false);
assert.match(elements.cloudStatus.textContent, /除外設定を変更/);
saveFails = true;
await context.resumeStudy();
assert.equal(deleted, 0);
assert.match(elements.cloudStatus.textContent, /共有できませんでした/);
console.log("時期問題の除外: 判定・初期オン・保存・解除・件数・段階移行・暗記と聞き流しの再開・履歴維持を確認しました。");

// 履歴科目は問題文による判定を使わず、保存した分類だけで復元する。
for (const subjectId of ["world-history", "world-history-s"]) {
  state.activeSubjectId = subjectId;
  for (const mode of ["memorize", "listen-answer"]) {
    for (const selection of [null, [], ["time"], ["identify", "integrated"]]) {
      const saved = workerSession(normalizeStudySession({ ...session, studyMode: mode, selectedQuestionTypes: selection }));
      const expected = filterQuestionTypes(terms, resolveQuestionTypes(selection)).flatMap(t => Object.values(t.stages).flat().map(q => q.id));
      assert.equal(context.restoreActiveSession(saved), expected.length > 0);
      if (expected.length) assert.deepEqual(Array.from(state.sessionTasks, t => t.questionId), expected);
      assert.deepEqual(saved.selectedQuestionTypes, selection);
    }
  }
  for (const selection of [null, [], ["time"], ["identify", "integrated"]]) {
    const input = { subjects: { [subjectId]: { selectedQuestionTypes: selection } } };
    const saved = workerPreferences(normalizeSetupPreferences(input));
    assert.deepEqual(saved.subjects[subjectId].selectedQuestionTypes, selection);
    assert.deepEqual(normalizeSetupPreferences(saved), saved);
  }
}
const misleading = [{ stages: { beginner: [{ type: "content", prompt: "何年？" }, { type: "time", prompt: "時期は？" }] } }];
assert.deepEqual(filterQuestionTypes(misleading, ["content"])[0].stages.beginner, [misleading[0].stages.beginner[0]]);
assert.equal(filterQuestionTypes(misleading, []).length, 0);
console.log("問題形式の選択: 科目別保存、未設定と全解除の区別、暗記・聞き流し再開、分類のみの判定を確認しました。");
