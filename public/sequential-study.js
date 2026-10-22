import { isQuestionDue, learningStages, selectedStageList, shuffleTasks } from "./learning-engine.js";

export function normalizeDeckOrder(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .filter(id => typeof id === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(id)))].slice(0, 1000);
}

export function orderedDeckIds(availableIds, savedOrder) {
  const available = new Set(availableIds);
  const ordered = normalizeDeckOrder(savedOrder).filter(id => available.has(id));
  const known = new Set(ordered);
  return [...ordered, ...availableIds.filter(id => !known.has(id))];
}

export function normalizeQuestionLimit(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? Math.min(999999, number) : null;
}

export function createSequentialStudyTasks(terms, selectedStage = "") {
  const selected = selectedStageList(selectedStage);
  const stages = selected.length ? selected : learningStages;
  return stages.flatMap(stage => terms.flatMap(term =>
    (term.stages[stage] ?? []).map(question => ({ termId: term.id, questionId: question.id, stage }))));
}

export function hasPassingRating(record) {
  return ["hard", "good", "easy"].includes(record?.lastRating);
}

// 復習は全パートから先に出し、新しい問題は最初の未習得パートだけを開く。
// 習得には過去の連続正解数を使わず、現在の全問題の評価を使う。
export function sequentialStudyPlan({ tasks, progress, deckOrder, questionDeckIds,
  retryQuestionIds = new Set(), queuedQuestionIds = [], now = new Date(), shuffle = false }) {
  const groups = new Map(deckOrder.map(id => [id, []]));
  for (const task of tasks) groups.get(questionDeckIds.get(task.questionId))?.push(task);
  const masteredDeckIds = deckOrder.filter(id => groups.get(id)?.length &&
    groups.get(id).every(task => hasPassingRating(progress.questions[task.questionId])));
  const currentDeckId = deckOrder.find(id => groups.get(id)?.length && !masteredDeckIds.includes(id)) ?? "";
  const review = [], fresh = [], retry = [];
  for (const id of deckOrder) for (const task of groups.get(id) ?? []) {
    const record = progress.questions[task.questionId];
    if (record?.lastAnsweredAt) {
      if (retryQuestionIds.has(task.questionId)) retry.push(task);
      else if (isQuestionDue(progress, task.questionId, now)) review.push(task);
    } else if (id === currentDeckId) fresh.push(task);
  }
  const orderedReview = shuffle ? shuffleTasks(review) : review;
  const orderedFresh = shuffle ? shuffleTasks(fresh) : fresh;
  // 不正解の再出題は通常の暗記モードと同じく、今のパートの未出題問題の後ろへ回す。
  // 既に待っている再出題は順番を保ち、新しく不正解にした問題を最後に加える。
  const queued = new Map(queuedQuestionIds.map((id, index) => [id, index]));
  const rank = task => queued.get(task.questionId) ?? queued.size;
  const orderedRetry = (shuffle ? shuffleTasks(retry) : retry).sort((left, right) => rank(left) - rank(right));
  return { queue: [...orderedReview, ...orderedFresh, ...orderedRetry], currentDeckId, masteredDeckIds };
}
