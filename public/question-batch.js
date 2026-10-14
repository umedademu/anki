// 指定した問題だけを固定し、覚えた問題を同じ回で再出題しない。
export function normalizeQuestionBatch(value, validQuestionIds) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const ids = values => [...new Set((Array.isArray(values) ? values : [])
    .filter(id => typeof id === "string" && id.length <= 200 && /^[A-Za-z0-9_.:-]+$/.test(id)))];
  const questionIds = ids(value.questionIds)
    .filter(id => !validQuestionIds || validQuestionIds.has(id)).slice(0, 999999);
  if (!questionIds.length) return null;
  const selected = new Set(questionIds);
  return {
    target: Math.max(1, Math.min(999999, Number.parseInt(value.target, 10) || questionIds.length)),
    routineItemId: typeof value.routineItemId === "string" ? value.routineItemId.slice(0, 200) : "",
    questionIds,
    completedQuestionIds: ids(value.completedQuestionIds).filter(id => selected.has(id)),
  };
}

export function createQuestionBatch(tasks, count, { target = count, routineItemId = "" } = {}) {
  const questionIds = [...new Set(tasks.map(task => task.questionId))].slice(0, Math.max(0, count));
  return normalizeQuestionBatch({ target, routineItemId, questionIds, completedQuestionIds: [] });
}

export function questionBatchComplete(batch) {
  return Boolean(batch?.questionIds.length && batch.completedQuestionIds.length === batch.questionIds.length);
}

export function rateQuestionBatch(batch, questionId, rating = "") {
  if (!batch?.questionIds.includes(questionId)) return batch;
  const completed = new Set(batch.completedQuestionIds);
  if (["", "hard", "good", "easy"].includes(rating)) completed.add(questionId);
  else if (rating === "again") completed.delete(questionId);
  return { ...batch, completedQuestionIds: [...completed] };
}

export function pendingQuestionBatchIds(batch) {
  const completed = new Set(batch?.completedQuestionIds);
  return new Set(batch?.questionIds.filter(id => !completed.has(id)) ?? []);
}
