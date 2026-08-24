const routineIdPattern = /^[A-Za-z0-9_-]{1,100}$/;
const routineQuestionKeyPattern = /^[A-Za-z0-9_-]{1,100}::[A-Za-z0-9_-]{1,100}$/;
const routineItemLimit = 100;
const routineQuestionTargetLimit = 10_000;
const routineCountedQuestionLimit = 20_000;

const defaultSubjects = [
  "world-history",
  "english-vocabulary",
  "geography",
  "classical-japanese",
  "japanese-history",
  "politics-economics",
  "english-vocabulary",
  "world-history",
  "earth-science-basics",
  "geography",
  "japanese-history",
  "english-vocabulary",
  "geography",
  "classical-chinese",
  "world-history",
  "japanese-history",
  "biology-basics",
  "geography",
  "english-vocabulary",
  "japanese-history",
  "english-vocabulary",
  "world-history",
];

export const defaultStudyRoutinePlan = Object.freeze(
  defaultSubjects.map((subjectId, index) =>
    Object.freeze({
      id: `default-${String(index + 1).padStart(2, "0")}`,
      subjectId,
      questionTarget: 100,
    }),
  ),
);

function normalizeRoutineId(value) {
  const id = String(value ?? "");
  return routineIdPattern.test(id) ? id : "";
}

function normalizeQuestionTarget(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed)
    ? Math.min(routineQuestionTargetLimit, Math.max(1, parsed))
    : 100;
}

function normalizeRoutineItem(value, index, usedIds) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const subjectId = normalizeRoutineId(value.subjectId);
  if (!subjectId) return null;
  const requestedId = normalizeRoutineId(value.id);
  let id = requestedId || `routine-${String(index + 1).padStart(2, "0")}`;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${(requestedId || "routine").slice(0, 90)}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(id);
  return {
    id,
    subjectId,
    questionTarget: normalizeQuestionTarget(value.questionTarget),
  };
}

function cloneDefaultPlan() {
  return defaultStudyRoutinePlan.map((item) => ({ ...item }));
}

export function normalizeStudyRoutinePlan(value, { fallbackToDefault = true } = {}) {
  if (!Array.isArray(value)) {
    return fallbackToDefault ? cloneDefaultPlan() : [];
  }
  const usedIds = new Set();
  const plan = value.slice(0, routineItemLimit).flatMap((item, index) => {
    const normalized = normalizeRoutineItem(item, index, usedIds);
    return normalized ? [normalized] : [];
  });
  return plan.length > 0 || !fallbackToDefault ? plan : cloneDefaultPlan();
}

function normalizeStudyDate(value) {
  const date = String(value ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

export function normalizeStudyRoutineRun(value) {
  let source = value;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      return null;
    }
  }
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return null;
  }
  const id = normalizeRoutineId(source.id);
  const studyDate = normalizeStudyDate(source.studyDate);
  const items = normalizeStudyRoutinePlan(source.items, {
    fallbackToDefault: false,
  }).map((item, index) => ({
    ...item,
    completedCount: Math.min(
      item.questionTarget,
      Math.max(
        0,
        Number.parseInt(source.items?.[index]?.completedCount, 10) || 0,
      ),
    ),
  }));
  if (!id || !studyDate || items.length === 0) return null;
  const countedQuestionKeys = [...new Set(
    (Array.isArray(source.countedQuestionKeys)
      ? source.countedQuestionKeys
      : [])
      .map((key) => String(key ?? ""))
      .filter((key) => routineQuestionKeyPattern.test(key)),
  )].slice(0, routineCountedQuestionLimit);
  const firstIncompleteIndex = items.findIndex(
    (item) => item.completedCount < item.questionTarget,
  );
  const currentIndex = firstIncompleteIndex < 0
    ? items.length
    : firstIncompleteIndex;
  return {
    schemaVersion: 1,
    id,
    studyDate,
    currentIndex,
    items,
    countedQuestionKeys,
  };
}

function createRoutineRunId() {
  return globalThis.crypto?.randomUUID?.() ??
    `routine-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createStudyRoutineRun(plan, studyDate, id = createRoutineRunId()) {
  const items = normalizeStudyRoutinePlan(plan).map((item) => ({
    ...item,
    completedCount: 0,
  }));
  return normalizeStudyRoutineRun({
    schemaVersion: 1,
    id,
    studyDate,
    currentIndex: 0,
    items,
    countedQuestionKeys: [],
  });
}

export function currentStudyRoutineItem(run) {
  const normalized = normalizeStudyRoutineRun(run);
  return normalized?.items[normalized.currentIndex] ?? null;
}

export function studyRoutineTotals(run) {
  const normalized = normalizeStudyRoutineRun(run);
  if (!normalized) {
    return { completed: 0, target: 0 };
  }
  return normalized.items.reduce(
    (totals, item) => ({
      completed: totals.completed + item.completedCount,
      target: totals.target + item.questionTarget,
    }),
    { completed: 0, target: 0 },
  );
}

export function continueStudyRoutineOnDate(run, studyDate) {
  const normalized = normalizeStudyRoutineRun(run);
  const nextStudyDate = normalizeStudyDate(studyDate);
  return normalized && nextStudyDate
    ? { ...normalized, studyDate: nextStudyDate }
    : null;
}

export function recordStudyRoutineQuestion(
  run,
  subjectId,
  datasetVersion,
  questionId,
) {
  const normalized = normalizeStudyRoutineRun(run);
  const item = currentStudyRoutineItem(normalized);
  const key = `${normalizeRoutineId(datasetVersion)}::${normalizeRoutineId(questionId)}`;
  if (
    !normalized ||
    !item ||
    item.subjectId !== normalizeRoutineId(subjectId) ||
    !routineQuestionKeyPattern.test(key)
  ) {
    return { run: normalized, counted: false, completedItem: null, nextItem: item };
  }
  if (normalized.countedQuestionKeys.includes(key)) {
    return { run: normalized, counted: false, completedItem: null, nextItem: item };
  }
  const items = normalized.items.map((candidate, index) =>
    index === normalized.currentIndex
      ? { ...candidate, completedCount: candidate.completedCount + 1 }
      : { ...candidate },
  );
  const completedItem = items[normalized.currentIndex].completedCount >=
      items[normalized.currentIndex].questionTarget
    ? items[normalized.currentIndex]
    : null;
  const currentIndex = completedItem
    ? Math.min(items.length, normalized.currentIndex + 1)
    : normalized.currentIndex;
  const next = {
    ...normalized,
    currentIndex,
    items,
    countedQuestionKeys: [...normalized.countedQuestionKeys, key].slice(
      -routineCountedQuestionLimit,
    ),
  };
  return {
    run: next,
    counted: true,
    completedItem,
    nextItem: next.items[next.currentIndex] ?? null,
  };
}
