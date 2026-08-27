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

export function normalizeRatingAnalysis(value) {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
  const rows = (Array.isArray(source.rows) ? source.rows : []).flatMap((row) => {
    const normalized = normalizeAnalysisRow(row);
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
