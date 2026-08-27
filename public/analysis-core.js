import { getMacroRegionTags } from "./learning-engine.js";

export const analysisRatingValues = Object.freeze([
  "again",
  "hard",
  "good",
  "easy",
]);

export const minimumRankedAnswerCount = 5;

const ratingWeaknessWeights = Object.freeze({
  again: 100,
  hard: 65,
  good: 20,
  easy: 0,
});

const analysisIdPattern = /^[A-Za-z0-9_-]{1,100}$/;

function limitedText(value, maximumLength) {
  return String(value ?? "").trim().slice(0, maximumLength);
}

function uniqueTexts(values, maximumLength, maximumCount = 10) {
  return [...new Set(
    (Array.isArray(values) ? values : [values])
      .map((value) => limitedText(value, maximumLength))
      .filter(Boolean),
  )].slice(0, maximumCount);
}

function normalizeAnalysisDimension(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const key = limitedText(value.key, 50);
  const label = limitedText(value.label, 50);
  const values = uniqueTexts(value.values, 100);
  return key && label && values.length > 0 ? { key, label, values } : null;
}

export function normalizeQuestionAnalysisSnapshot(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const term = limitedText(value.term, 300);
  const question = limitedText(value.question, 1000);
  const dimensions = (Array.isArray(value.dimensions) ? value.dimensions : [])
    .flatMap((dimension) => {
      const normalized = normalizeAnalysisDimension(dimension);
      return normalized ? [normalized] : [];
    })
    .slice(0, 10);
  if (!term || !question || dimensions.length === 0) return null;
  return { term, question, dimensions };
}

export function createQuestionAnalysisSnapshot(subject, term, question) {
  const filterLabels = subject?.filterLabels ?? {};
  const dimensions = [
    {
      key: "macroRegion",
      label: filterLabels.macroRegion,
      values: getMacroRegionTags(term),
    },
    {
      key: "regionDetail",
      label: filterLabels.regionDetail,
      values: term?.geography?.regionDetail,
    },
    {
      key: "category",
      label: filterLabels.category,
      values: term?.category,
    },
    {
      key: "questionType",
      label: "問題形式",
      values: question?.label || question?.focus || question?.type,
    },
  ];
  return normalizeQuestionAnalysisSnapshot({
    term: term?.term,
    question: question?.prompt,
    dimensions,
  });
}

function normalizeAnalysisRow(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const subjectId = limitedText(value.subjectId, 100);
  const subjectTitle = limitedText(value.subjectTitle, 200);
  const deckId = limitedText(value.deckId, 100);
  const deckTitle = limitedText(value.deckTitle, 200);
  const datasetVersion = limitedText(value.datasetVersion, 100);
  const questionId = limitedText(value.questionId, 100);
  const rating = limitedText(value.rating, 20);
  const answerCount = Math.min(
    1_000_000_000,
    Math.max(0, Number.parseInt(value.answerCount, 10) || 0),
  );
  let analysis = value.analysis;
  if (typeof analysis === "string") {
    try {
      analysis = JSON.parse(analysis);
    } catch {
      analysis = null;
    }
  }
  analysis = normalizeQuestionAnalysisSnapshot(analysis);
  if (
    !analysisIdPattern.test(subjectId) ||
    !subjectTitle ||
    !analysisIdPattern.test(deckId) ||
    !deckTitle ||
    !datasetVersion ||
    !analysisIdPattern.test(questionId) ||
    !analysisRatingValues.includes(rating) ||
    answerCount === 0 ||
    !analysis
  ) {
    return null;
  }
  return {
    subjectId,
    subjectTitle,
    deckId,
    deckTitle,
    datasetVersion,
    questionId,
    rating,
    answerCount,
    analysis,
  };
}

function normalizeLegacyProgressRow(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const datasetVersion = limitedText(value.datasetVersion, 100);
  const questionId = limitedText(value.questionId, 100);
  const attempts = Math.min(
    1_000_000_000,
    Math.max(0, Number.parseInt(value.attempts, 10) || 0),
  );
  const rememberedCount = Math.min(
    attempts,
    Math.max(0, Number.parseInt(value.rememberedCount, 10) || 0),
  );
  const lastRating = limitedText(value.lastRating, 20);
  if (
    !datasetVersion ||
    !analysisIdPattern.test(questionId) ||
    attempts === 0
  ) {
    return null;
  }
  return {
    datasetVersion,
    questionId,
    streak: Math.min(
      1_000_000_000,
      Math.max(0, Number.parseInt(value.streak, 10) || 0),
    ),
    attempts,
    rememberedCount,
    lastRating: analysisRatingValues.includes(lastRating) ? lastRating : null,
    lastAnsweredAt: limitedText(value.lastAnsweredAt, 50) || null,
    nextReviewAt: limitedText(value.nextReviewAt, 50) || null,
    everMastered: Boolean(value.everMastered),
  };
}

export function createLegacyAnalysisRow({
  progress,
  subject,
  deck,
  term,
  question,
}) {
  const normalizedProgress = normalizeLegacyProgressRow(progress);
  const analysis = createQuestionAnalysisSnapshot(subject, term, question);
  const subjectId = limitedText(subject?.id, 100);
  const subjectTitle = limitedText(subject?.title, 200);
  const deckId = limitedText(deck?.id ?? subject?.deckId, 100);
  const deckTitle = limitedText(
    deck?.datasetLabel ?? deck?.difficultyLabel ?? subject?.datasetLabel,
    200,
  );
  if (
    !normalizedProgress ||
    !analysisIdPattern.test(subjectId) ||
    !subjectTitle ||
    !analysisIdPattern.test(deckId) ||
    !deckTitle ||
    !analysis
  ) {
    return null;
  }
  const masteryTarget = Math.max(
    1,
    Number.parseInt(subject?.masteryTarget, 10) || 2,
  );
  return {
    ...normalizedProgress,
    subjectId,
    subjectTitle,
    deckId,
    deckTitle,
    analysis,
    currentlyMastered: normalizedProgress.streak >= masteryTarget,
  };
}

export function normalizeRatingAnalysis(value) {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
  const rows = (Array.isArray(source.rows) ? source.rows : []).flatMap((row) => {
    const normalized = normalizeAnalysisRow(row);
    return normalized ? [normalized] : [];
  });
  const legacyProgressRows = (
    Array.isArray(source.legacyProgressRows) ? source.legacyProgressRows : []
  ).flatMap((row) => {
    const normalized = normalizeLegacyProgressRow(row);
    return normalized ? [normalized] : [];
  });
  const periodDays = source.periodDays == null
    ? null
    : [30, 90].includes(Number(source.periodDays))
      ? Number(source.periodDays)
      : 30;
  return {
    periodDays,
    ratedAnswerCount: Math.min(
      1_000_000_000,
      Math.max(0, Number.parseInt(source.ratedAnswerCount, 10) || 0),
    ),
    unratedAnswerCount: Math.min(
      1_000_000_000,
      Math.max(0, Number.parseInt(source.unratedAnswerCount, 10) || 0),
    ),
    rows,
    legacyProgressRows,
  };
}

export function createEmptyAnalysisCounts() {
  return { again: 0, hard: 0, good: 0, easy: 0 };
}

export function totalAnalysisAnswers(counts) {
  return analysisRatingValues.reduce(
    (total, rating) => total + (Number(counts?.[rating]) || 0),
    0,
  );
}

export function calculateWeaknessScore(counts) {
  const total = totalAnalysisAnswers(counts);
  if (total === 0) return 0;
  const weighted = analysisRatingValues.reduce(
    (sum, rating) =>
      sum + (Number(counts?.[rating]) || 0) * ratingWeaknessWeights[rating],
    0,
  );
  return Math.round(weighted / total);
}

export function buildWeaknessSections(rows, subjectId = "") {
  const sectionMap = new Map();
  for (const row of rows) {
    if (subjectId && row.subjectId !== subjectId) continue;
    for (const dimension of row.analysis.dimensions) {
      const sectionKey = `${dimension.key}\0${dimension.label}`;
      if (!sectionMap.has(sectionKey)) {
        sectionMap.set(sectionKey, {
          key: dimension.key,
          label: dimension.label,
          items: new Map(),
        });
      }
      const section = sectionMap.get(sectionKey);
      for (const name of dimension.values) {
        if (!section.items.has(name)) {
          section.items.set(name, {
            name,
            counts: createEmptyAnalysisCounts(),
          });
        }
        section.items.get(name).counts[row.rating] += row.answerCount;
      }
    }
  }
  return [...sectionMap.values()].map((section) => {
    const items = [...section.items.values()]
      .map((item) => ({
        ...item,
        answerCount: totalAnalysisAnswers(item.counts),
        weaknessScore: calculateWeaknessScore(item.counts),
      }))
      .sort((left, right) =>
        right.weaknessScore - left.weaknessScore ||
        right.answerCount - left.answerCount ||
        left.name.localeCompare(right.name, "ja"),
      );
    return {
      key: section.key,
      label: section.label,
      ranked: items
        .filter((item) => item.answerCount >= minimumRankedAnswerCount)
        .slice(0, 10),
      collecting: items
        .filter((item) => item.answerCount < minimumRankedAnswerCount)
        .slice(0, 5),
    };
  });
}

export function buildLegacyWeaknessSections(rows, subjectId = "") {
  const sectionMap = new Map();
  for (const row of rows) {
    if (subjectId && row.subjectId !== subjectId) continue;
    const incorrectCount = Math.max(0, row.attempts - row.rememberedCount);
    for (const dimension of row.analysis.dimensions) {
      const sectionKey = `${dimension.key}\0${dimension.label}`;
      if (!sectionMap.has(sectionKey)) {
        sectionMap.set(sectionKey, {
          key: dimension.key,
          label: dimension.label,
          items: new Map(),
        });
      }
      const section = sectionMap.get(sectionKey);
      for (const name of dimension.values) {
        if (!section.items.has(name)) {
          section.items.set(name, {
            name,
            attempts: 0,
            incorrectCount: 0,
            questionIds: new Set(),
            unmasteredQuestionIds: new Set(),
          });
        }
        const item = section.items.get(name);
        item.attempts += row.attempts;
        item.incorrectCount += incorrectCount;
        item.questionIds.add(row.questionId);
        if (!row.currentlyMastered) item.unmasteredQuestionIds.add(row.questionId);
      }
    }
  }
  return [...sectionMap.values()].map((section) => {
    const items = [...section.items.values()]
      .map((item) => ({
        name: item.name,
        attempts: item.attempts,
        incorrectCount: item.incorrectCount,
        rememberedCount: item.attempts - item.incorrectCount,
        incorrectRate: item.attempts > 0
          ? Math.round((item.incorrectCount / item.attempts) * 100)
          : 0,
        questionCount: item.questionIds.size,
        unmasteredQuestionCount: item.unmasteredQuestionIds.size,
      }))
      .sort((left, right) =>
        right.incorrectRate - left.incorrectRate ||
        right.incorrectCount - left.incorrectCount ||
        right.attempts - left.attempts ||
        left.name.localeCompare(right.name, "ja"),
      );
    return {
      key: section.key,
      label: section.label,
      ranked: items
        .filter((item) => item.attempts >= minimumRankedAnswerCount)
        .slice(0, 10),
      collecting: items
        .filter((item) => item.attempts < minimumRankedAnswerCount)
        .slice(0, 5),
    };
  });
}
