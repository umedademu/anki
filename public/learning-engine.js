export const learningStages = ["beginner", "reverse", "integrated"];

export const stageLabels = {
  beginner: "基礎 一問一答",
  reverse: "逆一問一答",
  integrated: "統合説明",
  complete: "完全習得",
};

function questionRecord(progress, questionId) {
  return progress.questions[questionId] ?? {
    streak: 0,
    attempts: 0,
    rememberedCount: 0,
  };
}

export function createEmptyProgress() {
  return { questions: {}, updatedAt: null };
}

export function normalizeProgress(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createEmptyProgress();
  }
  const questions =
    value.questions && typeof value.questions === "object" && !Array.isArray(value.questions)
      ? value.questions
      : {};
  return {
    questions: Object.fromEntries(
      Object.entries(questions).flatMap(([questionId, record]) => {
        if (!record || typeof record !== "object") {
          return [];
        }
        return [
          [
            questionId,
            {
              streak: Math.max(0, Number.parseInt(record.streak, 10) || 0),
              attempts: Math.max(0, Number.parseInt(record.attempts, 10) || 0),
              rememberedCount: Math.max(
                0,
                Number.parseInt(record.rememberedCount, 10) || 0,
              ),
            },
          ],
        ];
      }),
    ),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
  };
}

export function deserializeProgress(serializedProgress) {
  if (typeof serializedProgress !== "string" || serializedProgress.trim() === "") {
    return createEmptyProgress();
  }

  try {
    return normalizeProgress(JSON.parse(serializedProgress));
  } catch {
    return createEmptyProgress();
  }
}

export function serializeProgress(progress) {
  return JSON.stringify(normalizeProgress(progress));
}

export function shouldHideTerm(question, answerVisible) {
  return question?.stage === "beginner" && !answerVisible;
}

export function getIntegratedExplanationQuestion(term, question) {
  if (!term || !question || question.stage === "integrated") {
    return null;
  }
  return term.stages?.integrated?.[0] ?? null;
}

export function getMacroRegionTags(term) {
  return String(term?.geography?.macroRegion ?? "")
    .split("・")
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
  return questionRecord(progress, questionId).streak >= masteryTarget;
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

export function getTermStage(term, progress, masteryTarget) {
  return (
    learningStages.find(
      (stage) => !isStageMastered(term, stage, progress, masteryTarget),
    ) ?? "complete"
  );
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
  const masteredTerms = terms.filter(
    (term) =>
      stages.every((stage) =>
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
) {
  if (learningStages.includes(selectedStage)) {
    const largestStageSize = Math.max(
      0,
      ...terms.map((term) => term.stages[selectedStage]?.length ?? 0),
    );
    const tasks = [];
    for (let questionIndex = 0; questionIndex < largestStageSize; questionIndex += 1) {
      for (const term of terms) {
        const question = term.stages[selectedStage]?.[questionIndex];
        if (
          question &&
          !isQuestionMastered(progress, question.id, masteryTarget)
        ) {
          tasks.push({ termId: term.id, questionId: question.id, stage: selectedStage });
        }
      }
    }
    return tasks;
  }

  const tasks = [];
  const currentStages = new Map(
    terms.map((term) => [term.id, getTermStage(term, progress, masteryTarget)]),
  );
  const largestStageSize = Math.max(
    0,
    ...terms.map((term) => {
      const stage = currentStages.get(term.id);
      return stage === "complete" ? 0 : term.stages[stage].length;
    }),
  );

  for (const stage of learningStages) {
    for (let questionIndex = 0; questionIndex < largestStageSize; questionIndex += 1) {
      for (const term of terms) {
        if (currentStages.get(term.id) !== stage) {
          continue;
        }
        const question = term.stages[stage][questionIndex];
        if (
          question &&
          !isQuestionMastered(progress, question.id, masteryTarget)
        ) {
          tasks.push({ termId: term.id, questionId: question.id, stage });
        }
      }
    }
  }

  return tasks;
}

export function getTasksForCurrentTermStage(term, progress, masteryTarget) {
  const stage = getTermStage(term, progress, masteryTarget);
  if (stage === "complete") {
    return [];
  }
  return term.stages[stage]
    .filter((question) => !isQuestionMastered(progress, question.id, masteryTarget))
    .map((question) => ({ termId: term.id, questionId: question.id, stage }));
}

export function enqueueUniqueTasks(queue, tasks, blockedQuestionIds = []) {
  const knownQuestionIds = new Set([
    ...queue.map((task) => task.questionId),
    ...blockedQuestionIds,
  ]);
  const uniqueTasks = [];

  for (const task of tasks) {
    if (knownQuestionIds.has(task.questionId)) {
      continue;
    }
    knownQuestionIds.add(task.questionId);
    uniqueTasks.push(task);
  }

  return [...queue, ...uniqueTasks];
}

export function scheduleRetryTask(queue, task, remembered) {
  const gap = remembered ? 8 : 3;
  const queueWithoutTask = queue.filter(
    (queuedTask) => queuedTask.questionId !== task.questionId,
  );
  const insertAt = Math.min(gap, queueWithoutTask.length);
  return [
    ...queueWithoutTask.slice(0, insertAt),
    task,
    ...queueWithoutTask.slice(insertAt),
  ];
}

export function rateQuestion(
  progress,
  questionId,
  remembered,
  masteryTarget,
  now = new Date(),
) {
  const previous = questionRecord(progress, questionId);
  const nextStreak = remembered
    ? Math.min(masteryTarget, previous.streak + 1)
    : 0;
  progress.questions[questionId] = {
    streak: nextStreak,
    attempts: previous.attempts + 1,
    rememberedCount: previous.rememberedCount + (remembered ? 1 : 0),
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
    progress.questions[snapshot.questionId] = {
      ...snapshot.previousQuestionRecord,
    };
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
