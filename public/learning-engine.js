export const learningStages = ["beginner", "reverse", "integrated"];

export const stageLabels = {
  beginner: "基礎 一問一答",
  reverse: "逆一問一答",
  integrated: "統合説明",
  complete: "完全習得",
};

export const ratingValues = ["again", "hard", "good", "easy"];

export const defaultReviewSettings = {
  againSeconds: 60,
  hardSeconds: 4 * 60 * 60,
  goodSeconds: 12 * 60 * 60,
  easySeconds: 6 * 24 * 60 * 60,
};

const ratingSettingKeys = {
  again: "againSeconds",
  hard: "hardSeconds",
  good: "goodSeconds",
  easy: "easySeconds",
};

function clampInteger(value, minimum, maximum, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallback;
}

export function normalizeReviewSettings(value) {
  const settings = value && typeof value === "object" ? value : {};
  return Object.fromEntries(
    Object.entries(defaultReviewSettings).map(([key, fallback]) => [
      key,
      clampInteger(settings[key], 1, 365 * 24 * 60 * 60, fallback),
    ]),
  );
}

function emptyQuestionRecord() {
  return {
    streak: 0,
    attempts: 0,
    rememberedCount: 0,
    lastRating: null,
    lastAnsweredAt: null,
    nextReviewAt: null,
    everMastered: false,
  };
}

function normalizeQuestionRecord(record, masteryTarget = 2) {
  const source = record && typeof record === "object" ? record : {};
  const streak = Math.max(0, Number.parseInt(source.streak, 10) || 0);
  return {
    streak,
    attempts: Math.max(0, Number.parseInt(source.attempts, 10) || 0),
    rememberedCount: Math.max(
      0,
      Number.parseInt(source.rememberedCount, 10) || 0,
    ),
    lastRating: ratingValues.includes(source.lastRating)
      ? source.lastRating
      : null,
    lastAnsweredAt:
      typeof source.lastAnsweredAt === "string" ? source.lastAnsweredAt : null,
    nextReviewAt:
      typeof source.nextReviewAt === "string" ? source.nextReviewAt : null,
    everMastered: Boolean(source.everMastered) || streak >= masteryTarget,
  };
}

function questionRecord(progress, questionId, masteryTarget = 2) {
  return progress.questions[questionId]
    ? normalizeQuestionRecord(progress.questions[questionId], masteryTarget)
    : emptyQuestionRecord();
}

export function createEmptyProgress() {
  return { questions: {}, updatedAt: null };
}

export function normalizeProgress(value, masteryTarget = 2) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createEmptyProgress();
  }
  const questions =
    value.questions && typeof value.questions === "object" && !Array.isArray(value.questions)
      ? value.questions
      : {};
  return {
    questions: Object.fromEntries(
      Object.entries(questions).flatMap(([questionId, record]) =>
        record && typeof record === "object"
          ? [[questionId, normalizeQuestionRecord(record, masteryTarget)]]
          : [],
      ),
    ),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
  };
}

export function deserializeProgress(serializedProgress, masteryTarget = 2) {
  if (typeof serializedProgress !== "string" || serializedProgress.trim() === "") {
    return createEmptyProgress();
  }
  try {
    return normalizeProgress(JSON.parse(serializedProgress), masteryTarget);
  } catch {
    return createEmptyProgress();
  }
}

export function serializeProgress(progress, masteryTarget = 2) {
  return JSON.stringify(normalizeProgress(progress, masteryTarget));
}

export function shouldHideTerm(question, answerVisible) {
  const hidesUntilAnswer =
    typeof question?.hideTermUntilAnswer === "boolean"
      ? question.hideTermUntilAnswer
      : question?.stage === "beginner";
  return hidesUntilAnswer && !answerVisible;
}

const questionReadingPattern = /\([ぁ-ゖー]+(?:[・\s][ぁ-ゖー]+)*\)/g;

export function getQuestionPromptForDisplay(question, answerVisible) {
  const prompt = String(question?.prompt ?? "");
  return answerVisible ? prompt : prompt.replace(questionReadingPattern, "");
}

export function getQuestionAnswerParts(question) {
  const primaryAnswer = String(question?.answer ?? "").trim();
  const seen = new Set(primaryAnswer ? [primaryAnswer] : []);
  const acceptedAnswers = Array.isArray(question?.acceptedAnswers)
    ? question.acceptedAnswers
    : [];
  const parts = primaryAnswer ? [primaryAnswer] : [];
  for (const acceptedAnswer of acceptedAnswers) {
    const normalizedAnswer = String(acceptedAnswer ?? "").trim();
    if (!normalizedAnswer || seen.has(normalizedAnswer)) {
      continue;
    }
    seen.add(normalizedAnswer);
    parts.push(normalizedAnswer);
  }
  return parts;
}

export function getQuestionAnswerDisplayText(question) {
  return getQuestionAnswerParts(question).join(" /");
}

export function getQuestionAnswerSpeechText(question) {
  return getQuestionAnswerParts(question).join("。");
}

export function getIntegratedExplanationQuestion(term, question) {
  if (
    !term ||
    !question ||
    question.stage === "integrated" ||
    term.integratedAsExplanation === false
  ) {
    return null;
  }
  return term.stages?.integrated?.[0] ?? null;
}

export function getQuestionExplanation(term, question) {
  const directExplanation = String(question?.explanation ?? "").trim();
  if (directExplanation) {
    return directExplanation;
  }
  const integratedExplanation = getIntegratedExplanationQuestion(term, question);
  return String(integratedExplanation?.answer ?? "").trim();
}

export function getQuestionYearMnemonic(term, question) {
  const questionMnemonic = String(question?.yearMnemonic ?? "").trim();
  if (questionMnemonic) {
    return questionMnemonic;
  }
  const integratedExplanation = getIntegratedExplanationQuestion(term, question);
  return String(integratedExplanation?.yearMnemonic ?? "").trim();
}

export function getMacroRegionTags(term) {
  const macroRegion = String(term?.geography?.macroRegion ?? "");
  return (term?.geography?.splitMacroRegion === false
    ? [macroRegion]
    : macroRegion.split("・"))
    .map((value) => value.trim())
    .filter(Boolean);
}

export function filterTermsBySelection(
  terms,
  { macroRegion = "", regionDetail = "", category = "" } = {},
) {
  return terms.filter(
    (term) =>
      (!macroRegion || getMacroRegionTags(term).includes(macroRegion)) &&
      (!regionDetail || term.geography?.regionDetail === regionDetail) &&
      (!category || term.category === category),
  );
}

export function isQuestionMastered(progress, questionId, masteryTarget) {
  const record = questionRecord(progress, questionId, masteryTarget);
  return record.everMastered || record.streak >= masteryTarget;
}

export function isQuestionDue(progress, questionId, now = new Date()) {
  const record = questionRecord(progress, questionId);
  if (!record.lastAnsweredAt || !record.nextReviewAt) {
    return true;
  }
  const dueAt = Date.parse(record.nextReviewAt);
  return !Number.isFinite(dueAt) || dueAt <= now.getTime();
}

export function getStageStats(term, stage, progress, masteryTarget) {
  const questions = term.stages[stage] ?? [];
  return {
    mastered: questions.filter((question) =>
      isQuestionMastered(progress, question.id, masteryTarget),
    ).length,
    total: questions.length,
  };
}

export function isStageMastered(term, stage, progress, masteryTarget) {
  const stats = getStageStats(term, stage, progress, masteryTarget);
  return stats.total > 0 && stats.mastered === stats.total;
}

export function isStageUnlocked(term, stage, progress, masteryTarget) {
  if (stage === "beginner") {
    return true;
  }
  if (stage === "reverse") {
    return isStageMastered(term, "beginner", progress, masteryTarget);
  }
  if (stage === "integrated") {
    return isStageMastered(term, "reverse", progress, masteryTarget);
  }
  return false;
}

export function getTermStage(term, progress, masteryTarget) {
  const stagesWithQuestions = learningStages.filter(
    (stage) => (term?.stages?.[stage]?.length ?? 0) > 0,
  );
  if (
    stagesWithQuestions.length > 0 &&
    stagesWithQuestions.every((stage) =>
      isStageMastered(term, stage, progress, masteryTarget),
    )
  ) {
    return "complete";
  }
  for (const stage of stagesWithQuestions) {
    if (
      isStageUnlocked(term, stage, progress, masteryTarget) &&
      !isStageMastered(term, stage, progress, masteryTarget)
    ) {
      return stage;
    }
  }
  return stagesWithQuestions[0] ?? "complete";
}

export function getTermMastery(term, progress, masteryTarget) {
  return Object.fromEntries(
    learningStages.map((stage) => [
      stage,
      getStageStats(term, stage, progress, masteryTarget),
    ]),
  );
}

export function getOverallMastery(
  terms,
  progress,
  masteryTarget,
  stages = learningStages,
) {
  const allQuestions = terms.flatMap((term) =>
    stages.flatMap((stage) => term.stages[stage] ?? []),
  );
  const masteredQuestions = allQuestions.filter((question) =>
    isQuestionMastered(progress, question.id, masteryTarget),
  ).length;
  const masteredTerms = terms.filter((term) =>
    stages.every(
      (stage) =>
        (term.stages[stage]?.length ?? 0) === 0 ||
        isStageMastered(term, stage, progress, masteryTarget),
    ),
  ).length;
  return {
    masteredQuestions,
    totalQuestions: allQuestions.length,
    masteredTerms,
    totalTerms: terms.length,
  };
}

export function createQuestionQueue(
  terms,
  progress,
  masteryTarget,
  selectedStage = "",
  now = new Date(),
) {
  const stages = learningStages.includes(selectedStage)
    ? [selectedStage]
    : learningStages;
  const tasks = [];
  for (const stage of stages) {
    const largestStageSize = Math.max(
      0,
      ...terms.map((term) => term.stages[stage]?.length ?? 0),
    );
    for (let questionIndex = 0; questionIndex < largestStageSize; questionIndex += 1) {
      for (const term of terms) {
        if (
          !selectedStage &&
          !isStageUnlocked(term, stage, progress, masteryTarget)
        ) {
          continue;
        }
        const question = term.stages[stage]?.[questionIndex];
        if (question && isQuestionDue(progress, question.id, now)) {
          tasks.push({ termId: term.id, questionId: question.id, stage });
        }
      }
    }
  }
  return tasks;
}

const questionSelectionRatingOrder = {
  again: 0,
  hard: 1,
  good: 2,
  easy: 3,
};

function questionSelectionRank(progress, questionId, masteryTarget) {
  const record = questionRecord(progress, questionId, masteryTarget);
  const lastAnsweredAt = Date.parse(record.lastAnsweredAt ?? "");
  return [
    Math.min(masteryTarget, record.streak),
    record.attempts,
    questionSelectionRatingOrder[record.lastRating] ?? 1,
    Number.isFinite(lastAnsweredAt) ? lastAnsweredAt : Number.NEGATIVE_INFINITY,
  ];
}

function compareQuestionSelectionRanks(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] - right[index];
    }
  }
  return 0;
}

export function createTermQuestionQueue(
  terms,
  progress,
  masteryTarget,
  selectedStage = "",
  now = new Date(),
  random = Math.random,
) {
  const candidatesByTerm = new Map();
  for (const task of createQuestionQueue(
    terms,
    progress,
    masteryTarget,
    selectedStage,
    now,
  )) {
    const candidates = candidatesByTerm.get(task.termId) ?? [];
    candidates.push(task);
    candidatesByTerm.set(task.termId, candidates);
  }

  return terms.flatMap((term) => {
    const candidates = candidatesByTerm.get(term.id) ?? [];
    let bestRank = null;
    let bestCandidates = [];
    for (const task of candidates) {
      const rank = questionSelectionRank(progress, task.questionId, masteryTarget);
      const comparison = bestRank
        ? compareQuestionSelectionRanks(rank, bestRank)
        : -1;
      if (comparison < 0) {
        bestRank = rank;
        bestCandidates = [task];
      } else if (comparison === 0) {
        bestCandidates.push(task);
      }
    }
    if (bestCandidates.length === 0) {
      return [];
    }
    const randomValue = Number(random());
    const randomIndex = Number.isFinite(randomValue)
      ? Math.min(
          bestCandidates.length - 1,
          Math.max(0, Math.floor(randomValue * bestCandidates.length)),
        )
      : 0;
    return [bestCandidates[randomIndex]];
  });
}

export function getTasksForStage(
  term,
  stage,
  progress,
  now = new Date(),
) {
  return (term.stages[stage] ?? [])
    .filter((question) => isQuestionDue(progress, question.id, now))
    .map((question) => ({ termId: term.id, questionId: question.id, stage }));
}

export function enqueueUniqueTasks(queue, tasks, blockedQuestionIds = []) {
  const knownQuestionIds = new Set([
    ...queue.map((task) => task.questionId),
    ...blockedQuestionIds,
  ]);
  const uniqueTasks = [];
  for (const task of tasks) {
    if (!knownQuestionIds.has(task.questionId)) {
      knownQuestionIds.add(task.questionId);
      uniqueTasks.push(task);
    }
  }
  return [...queue, ...uniqueTasks];
}

export function getNextDueAt(
  terms,
  progress,
  masteryTarget,
  selectedStage = "",
) {
  const dates = [];
  for (const term of terms) {
    for (const stage of learningStages) {
      if (
        selectedStage
          ? stage !== selectedStage
          : !isStageUnlocked(term, stage, progress, masteryTarget)
      ) {
        continue;
      }
      for (const question of term.stages[stage] ?? []) {
        const nextReviewAt = questionRecord(progress, question.id).nextReviewAt;
        const timestamp = Date.parse(nextReviewAt ?? "");
        if (Number.isFinite(timestamp)) {
          dates.push(timestamp);
        }
      }
    }
  }
  return dates.length > 0 ? new Date(Math.min(...dates)).toISOString() : null;
}

export function rateQuestion(
  progress,
  questionId,
  rating,
  masteryTarget,
  reviewSettings = defaultReviewSettings,
  now = new Date(),
) {
  if (!ratingValues.includes(rating)) {
    throw new Error(`不明な評価です: ${rating}`);
  }
  const settings = normalizeReviewSettings(reviewSettings);
  const previous = questionRecord(progress, questionId, masteryTarget);
  const nextStreak =
    rating === "again"
      ? 0
      : rating === "easy"
        ? masteryTarget
        : Math.min(masteryTarget, previous.streak + 1);
  const intervalSeconds = settings[ratingSettingKeys[rating]];
  progress.questions[questionId] = {
    streak: nextStreak,
    attempts: previous.attempts + 1,
    rememberedCount: previous.rememberedCount + (rating === "again" ? 0 : 1),
    lastRating: rating,
    lastAnsweredAt: now.toISOString(),
    nextReviewAt: new Date(
      now.getTime() + intervalSeconds * 1000,
    ).toISOString(),
    everMastered: previous.everMastered || nextStreak >= masteryTarget,
  };
  progress.updatedAt = now.toISOString();
  return progress.questions[questionId];
}

function cloneTask(task) {
  return task ? { ...task } : null;
}

export function createRatingUndoSnapshot({
  progress,
  questionId,
  queue,
  currentTask,
  answerVisible,
  answeredThisSession,
  unlockMessage,
}) {
  const previousQuestionRecord = progress.questions[questionId];
  return {
    type: "rating",
    questionId,
    previousQuestionRecord: previousQuestionRecord
      ? { ...previousQuestionRecord }
      : null,
    previousUpdatedAt: progress.updatedAt,
    queue: queue.map((task) => cloneTask(task)),
    currentTask: cloneTask(currentTask),
    answerVisible: Boolean(answerVisible),
    answeredThisSession,
    unlockMessage,
  };
}

export function restoreRatingUndoSnapshot(progress, snapshot) {
  if (!snapshot || snapshot.type !== "rating" || !snapshot.questionId) {
    return null;
  }
  if (snapshot.previousQuestionRecord) {
    progress.questions[snapshot.questionId] = { ...snapshot.previousQuestionRecord };
  } else {
    delete progress.questions[snapshot.questionId];
  }
  progress.updatedAt = snapshot.previousUpdatedAt ?? null;
  return {
    queue: snapshot.queue.map((task) => cloneTask(task)),
    currentTask: cloneTask(snapshot.currentTask),
    answerVisible: Boolean(snapshot.answerVisible),
    answeredThisSession: snapshot.answeredThisSession,
    unlockMessage: snapshot.unlockMessage,
  };
}

export function shuffleTasks(tasks, random = Math.random) {
  const result = [...tasks];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
  }
  return result;
}
