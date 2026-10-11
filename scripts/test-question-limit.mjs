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
let mapResets = 0;
let rejectSave = false;
const context = {
  state, elements, console,
  answerVisuals: { reset() { mapResets++; } },
  stopListeningSequence() { state.listeningPaused = true; }, stopStudyClock() {},
  enqueuePendingRetryTasksImmediately() {},
  formatStudyDuration: value => String(value),
  renderRatingResult(value) { results++; resultRatings = value; },
  updateRoundProgressDisplay() {}, updateOverallProgress() {},
  isListeningMode: () => true, renderActionControls() {},
  studySessionSave: Promise.resolve(), queueCurrentStudyTimeSave: async () => {},
  listeningSaves: { tail: Promise.resolve(), pending: [], failures: 0 },
  listeningSaveBacklogLimit: 3, captureStudyTimeEntry: () => null,
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
assert.ok(mapResets > 0, '指定した問題数を終えたら解答地図を閉じる');
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

// 聞き流しは保存の完了を待たずに次々と読み上げ、保存は古い順に送る。
// 保存に失敗した時は、その問題へ戻し、後ろに並んでいた保存は送らない。
{
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const events = [];
  const pendingSaves = [];
  const savedOptions = [];
  const originalBegin = context.beginListeningQuestion;
  const originalSave = context.queueActiveStudyActivity;
  const originalTimeEntry = context.captureStudyTimeEntry;
  elements.questionLimit.value = '';
  context.initializeQuestionLimit();
  Object.assign(state, {
    listeningRunId: 5, listeningPaused: false, saving: false, activeSession: true,
    answeredThisSession: 0, currentTask: { questionId: 'a' },
    queue: ['b', 'c', 'd', 'e', 'f'].map((questionId) => ({ questionId })),
    unseenQuestionIds: new Set(['a', 'b', 'c', 'd', 'e', 'f']), retryQuestionIds: new Set(),
    history: [], studyTimeSavedSeconds: 0,
  });
  context.captureStudyTimeEntry = () => ({
    questionId: state.currentTask.questionId, eventId: `time-${state.currentTask.questionId}`, studySeconds: 2,
  });
  context.beginListeningQuestion = () => {
    events.push(`読み上げ:${state.currentTask.questionId}:保存中=${state.saving}`);
  };
  context.queueActiveStudyActivity = (activity, options) => {
    events.push(`保存:${activity.questionId}`);
    savedOptions.push(options);
    return new Promise((resolve, reject) => pendingSaves.push({ resolve, reject }));
  };
  const first = context.advanceListening(5);
  const second = context.advanceListening(5);
  const third = context.advanceListening(5);
  await settle();
  assert.deepEqual(
    events,
    ['読み上げ:b:保存中=false', '読み上げ:c:保存中=false', '読み上げ:d:保存中=false', '保存:a'],
    '保存を待たずに次々と読み上げ、保存は1件ずつ送る',
  );
  assert.equal(savedOptions[0].timeEntry.eventId, 'time-a', '終えた問題の学習時間を同じ通信で送る');
  assert.equal(state.history.length, 3, '戻るための記録は次の問題の回答表示より先に積む');
  const fourth = context.advanceListening(5);
  await settle();
  assert.equal(events.length, 4, '未保存が上限に達したら古い保存を待つ');
  pendingSaves[0].resolve();
  await first;
  await settle();
  assert.deepEqual(events.slice(4).sort(), ['保存:b', '読み上げ:e:保存中=false'], '古い保存が済んだら次へ進み、次の保存を送る');
  pendingSaves[1].reject(new Error('保存失敗'));
  await Promise.all([second, third, fourth]);
  assert.equal(events.length, 6, '失敗より後ろに並んでいた保存は送らない');
  assert.equal(state.currentTask.questionId, 'b', '保存に失敗した問題へ戻す');
  assert.equal(state.answeredThisSession, 1);
  assert.equal(state.history.length, 1, '失敗した進行より後の記録を取り除く');
  assert.equal(state.listeningPaused, true);
  assert.equal(state.saving, false);
  assert.equal(state.unlockMessage, '保存失敗');
  assert.equal(context.listeningSaves.pending.length, 0);
  context.beginListeningQuestion = originalBegin;
  context.queueActiveStudyActivity = originalSave;
  context.captureStudyTimeEntry = originalTimeEntry;
}
console.log('聞き流しの保存待ちなしの連続進行・学習時間の一括保存・未保存数の上限・失敗時の巻き戻しを確認');


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


// 聞き流しで次の問題へ進んだ直後は、読み上げを止めずに前の問題を評価できる。
{
  const rateSource = app.slice(app.indexOf('async function rateListeningQuestion(rating)'), app.indexOf('async function rateCurrentQuestion(rating)'));
  const calls = [];
  Object.assign(context, {
    termForTask: (task) => ({ id: `${task.questionId}-term` }),
    questionForTask: (task) => ({ id: task.questionId }),
    createRatingUndoSnapshot: ({ questionId }) => ({ type: 'rating', questionId }),
    restoreRatingUndoSnapshot() { calls.push('取り消し'); },
    createQuestionAnalysisSnapshot: () => ({}),
    applyQuestionRating: (_term, question, rating) => calls.push(`評価:${question.id}:${rating}`),
    ratingSoundPlayer: { play: (rating) => calls.push(`効果音:${rating}`) },
    async saveCloudStudyAnswer(_version, questionId, _record, _session, change) {
      calls.push(`保存:${questionId}:${change.activity.rating}:置換=${change.replaceActivityId}`);
      return { session: {}, roundProgress: {} };
    },
    setRoundProgress() {}, restoreRoutineRun() {},
    stopListeningSequence() { calls.push('停止'); state.listeningPaused = true; },
    async queueActiveStudyActivity() {},
    beginListeningQuestion() { state.answerVisible = false; },
    isListeningMode: () => state.studyMode === 'listen-answer',
  });
  runInNewContext(rateSource, context);
  elements.questionLimit.value = '';
  context.initializeQuestionLimit();
  Object.assign(state, {
    studyMode: 'listen-answer', listeningRunId: 7, listeningPaused: false, saving: false,
    activeSession: true, inRoutine: false, answerVisible: true, answeredThisSession: 0,
    currentTask: { questionId: 'a' }, queue: [{ questionId: 'b' }, { questionId: 'c' }],
    unseenQuestionIds: new Set(['a', 'b', 'c']), retryQuestionIds: new Set(), history: [],
    ratingCounts: emptyRatings(), progress: { questions: {} }, lateListeningRating: null,
  });
  await context.advanceListening(7);
  assert.equal(state.currentTask.questionId, 'b');
  assert.ok(context.lateListeningRatingTarget(), '次の問題の回答が出るまでは前の問題を評価できる');
  await context.rateListeningQuestion('good');
  assert.deepEqual(calls, ['効果音:good', '評価:a:good', '保存:a:good:置換=a'], '前の問題を評価し、評価なしの記録を置き換える');
  assert.equal(state.currentTask.questionId, 'b', '読み上げ中の問題はそのまま');
  assert.equal(state.listeningPaused, false, '読み上げを止めない');
  assert.equal(state.ratingCounts.good, 1);
  assert.equal(state.history.at(-1).type, 'rating', '戻る操作では評価として取り消す');
  assert.equal(context.lateListeningRatingTarget(), null, '同じ問題は一度だけ評価する');
  await context.advanceListening(7);
  assert.ok(context.lateListeningRatingTarget());
  state.answerVisible = true;
  assert.equal(context.lateListeningRatingTarget(), null, '次の問題の回答が出たら前の問題の評価は終える');
}
console.log('聞き流しの次の問題へ進んだ直後に前の問題を評価できることを確認');
