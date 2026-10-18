import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
const advance=app.slice(app.indexOf('async function advanceListening(runId)'), app.indexOf('function speakListeningAnswer(runId)'));
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
  isListeningMode: () => true, isVocabularyStream: () => false, renderActionControls() {},
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

Object.assign(context, {hasReachedQuestionLimit:()=>false,showQuestionLimitCompletion:()=>false,initializeQuestionLimit(){state.questionLimit=null;},updateQuestionBatch(){}});
runInNewContext(advance,context);
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


