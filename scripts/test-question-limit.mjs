import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const helpers = app.slice(app.indexOf('function validateQuestionLimit()'), app.indexOf('async function beginStudy()'));
const advance = app.slice(app.indexOf('async function advanceListening(runId)'), app.indexOf('function speakListeningAnswer(runId)'));
const emptyRatings = () => ({ again: 0, hard: 0, good: 0, easy: 0 });
const state = { inRoutine: false, answeredThisSession: 40, studySeconds: 60, ratingCounts: emptyRatings(), activeSession: true };
const elements = new Proxy({}, { get(target, key) {
  return target[key] ??= { value: '', reportValidity: () => true, classList: { add() {}, remove() {} } };
}});
let saved = 0;
let results = 0;
let resultRatings;
let rejectSave = false;
const context = {
  state, elements, console,
  stopListeningSequence() { state.listeningPaused = true; }, stopStudyClock() {}, clearPendingReviewTimer() {},
  formatStudyDuration: value => String(value),
  renderRatingResult(value) { results++; resultRatings = value; },
  updateRoundProgressDisplay() {}, updateOverallProgress() {},
  isListeningMode: () => true, renderActionControls() {},
  studySessionSave: Promise.resolve(), queueCurrentStudyTimeSave: async () => {},
  captureActiveSession: () => structuredClone({ ...state, history: [] }),
  restoreActiveSession(snapshot) { Object.assign(state, snapshot); return true; },
  createStudyActivity: questionId => ({ questionId, eventId: questionId }),
  datasetVersionForQuestion: () => 'test', cloneTask: task => ({ ...task }),
  recordActiveRoutineQuestion: () => null, startNewStudyScreen() {},
  async queueActiveStudyActivity(_activity, options) {
    assert.equal(results, 0, '保存前に結果を表示しない');
    if (rejectSave) throw new Error('保存失敗');
    saved++;
    if (options.completeSession) state.savedComplete = true;
  },
  pushHistory(snapshot) { state.history.push(snapshot); },
  startStudyClock() {}, renderQuestion() {}, beginListeningQuestion() {}, setSavedSessionForMode() {},
};
runInNewContext(helpers + '\n' + advance, context);
context.initializeQuestionLimit();
state.answeredThisSession = 1000;
assert.equal(context.hasReachedQuestionLimit(), false, '空欄は制限なし');
state.answeredThisSession = 40;
elements.questionLimit.value = '100';
context.initializeQuestionLimit();
state.answeredThisSession = 139;
assert.equal(context.hasReachedQuestionLimit(), false);
state.answeredThisSession = 140;
assert.equal(context.hasReachedQuestionLimit(), true, '再開前の回答数を含めない');
state.inRoutine = true;
assert.equal(context.hasReachedQuestionLimit(), false, '毎日のメニューには適用しない');
state.inRoutine = false;
state.saving = true;
assert.equal(context.showQuestionLimitCompletion(), true);
assert.equal(results, 0, '保存中は結果を表示しない');
state.answeredThisSession = 139;
state.saving = false;
assert.equal(context.showQuestionLimitCompletion(), false, '取り消すと未達へ戻る');

// 実際の聞き流しの回答処理で、100回目の保存後に停止することを確認する。
state.answeredThisSession = 0;
state.studySeconds = 0;
context.initializeQuestionLimit();
Object.assign(state, {
  listeningRunId: 1, listeningPaused: false, currentTask: { questionId: 'q0' },
  queue: Array.from({ length: 100 }, (_, i) => ({ questionId: `q${i + 1}` })),
  unseenQuestionIds: new Set(Array.from({ length: 101 }, (_, i) => `q${i}`)),
  retryQuestionIds: new Set(), history: [], screenStudySeconds: 0,
});
for (let i = 0; i < 99; i++) await context.advanceListening(1);
assert.equal(saved, 99);
assert.equal(results, 0);
rejectSave = true;
await context.advanceListening(1);
assert.equal(results, 0);
assert.equal(state.answeredThisSession, 99, '保存失敗時は回答回数を戻す');
rejectSave = false;
state.listeningPaused = false;
await context.advanceListening(1);
assert.equal(saved, 100);
assert.equal(results, 1);
assert.equal(state.currentTask.questionId, 'q100', '残りの問題を維持する');
assert.equal(state.activeSession, true, '途中終了を一周完了にしない');
assert.equal(state.listeningPaused, true);
assert.equal(elements.completionTitle.textContent, '100問の学習を完了しました');
await context.advanceListening(1);
assert.equal(saved, 100, '101問目へ進まない');

results = 0;
elements.questionLimit.value = '1';
context.initializeQuestionLimit();
state.listeningPaused = false;
await context.advanceListening(1);
assert.equal(state.activeSession, false, '指定数と一周完了が同時の場合は一周も完了する');
assert.equal(state.savedComplete, true);
assert.equal(results, 1);

results = 0;
state.ratingCounts = { again: 3, hard: 2, good: 4, easy: 1 };
context.initializeQuestionLimit();
state.ratingCounts.again++;
state.answeredThisSession++;
context.showQuestionLimitCompletion();
assert.equal(resultRatings.again, 1, '不正解も回答1回と数える');
assert.equal(resultRatings.good, 0, '前回までの評価を今回の結果に含めない');
console.log('問題数指定の検証完了: 未入力・100問・再開・保存失敗・残り問題・一周完了・今回の評価を確認');


// 暗記と任意評価付き聞き流しも実際の評価処理で確認する。
for (const [name, next] of [['rateCurrentQuestion', 'async function resetAllProgress'], ['rateListeningQuestion', 'async function rateCurrentQuestion']]) {
  const source = app.slice(app.indexOf(`async function ${name}(rating)`), app.indexOf(next));
  results = 0;
  state.inRoutine = false;
  state.answeredThisSession = 0;
  state.ratingCounts = emptyRatings();
  state.studyMode = name === 'rateCurrentQuestion' ? 'memorize' : 'listen-answer';
  context.isListeningMode = () => state.studyMode === 'listen-answer';
  state.progress = { questions: {} };
  state.activeSession = true;
  state.currentTask = { questionId: 'rated' };
  state.queue = [{ questionId: 'remaining' }];
  state.unseenQuestionIds = new Set(['rated', 'remaining']);
  state.retryQuestionIds = new Set();
  state.history = [];
  state.answerVisible = true;
  state.saving = false;
  state.listeningPaused = false;
  elements.questionLimit.value = '1';
  Object.assign(context, {
    currentTerm: () => ({}), currentQuestion: () => ({ id: 'rated' }),
    ratingSoundPlayer: { play() {} }, speechController: { stop() {} },
    createRatingUndoSnapshot: () => ({}), createRatingActivity: () => ({ eventId: 'rating' }),
    addRatingCount(counts, rating) { return { ...counts, [rating]: counts[rating] + 1 }; },
    applyQuestionRating() {}, ensureUnseenTasksQueued() {}, enqueueDueSessionTasks() {},
    startRoutineOvertimeIfNeeded() {}, hasPendingRoutineOvertimeReview: () => false,
    autoSpeakQuestion() { assert.equal(context.hasReachedQuestionLimit(), false); },
    window: { scrollTo() {} },
    async saveCloudStudyAnswer() {
      assert.equal(results, 0);
      return { session: {}, roundProgress: {} };
    },
    setRoundProgress() {},
  });
  // 音声処理は実装の到達判定までを使用し、再生はしない。
  const autoSpeak = app.slice(app.indexOf('function autoSpeakQuestion()'), app.indexOf('function autoSpeakAnswerAndOverview()'));
  runInNewContext(autoSpeak + '\n' + source, context);
  context.initializeQuestionLimit();
  await context[name]('again');
  assert.equal(results, 1, `${name}: 保存後に結果を表示する`);
  assert.equal(resultRatings.again, 1);
  assert.equal(state.currentTask.questionId, 'remaining');
  assert.equal(state.activeSession, true);
}
console.log('暗記・任意評価付き聞き流しの指定数終了を確認');

