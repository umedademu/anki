import {
  buildLegacyWeaknessSections,
  buildWeaknessSections,
  calculateWeaknessScore,
  createLegacyAnalysisRow,
  createQuestionAnalysisSnapshot,
  normalizeRatingAnalysis,
} from "../public/analysis-core.js";

const subject = {
  id: "world-history",
  title: "世界史",
  deckId: "deck-1",
  datasetLabel: "Deck 1",
  filterLabels: {
    macroRegion: "大分類の地域",
    regionDetail: "小分類の地域",
    category: "カテゴリ",
  },
};
const term = {
  term: "十字軍",
  category: "戦争",
  geography: {
    macroRegion: "ヨーロッパ・西アジア",
    regionDetail: "東地中海",
  },
};
const question = {
  id: "WH-000001-B01",
  label: "時期",
  prompt: "第1回十字軍が開始された年はいつか。",
};
const snapshot = createQuestionAnalysisSnapshot(subject, term, question);

if (
  snapshot.dimensions.length !== 4 ||
  snapshot.dimensions[0].values.join(",") !== "ヨーロッパ,西アジア" ||
  snapshot.dimensions[3].values[0] !== "時期"
) {
  throw new Error("問題の地域・カテゴリ・問題形式を分析用にまとめられませんでした。");
}

const analysis = normalizeRatingAnalysis({
  periodDays: 30,
  ratedAnswerCount: "10",
  unratedAnswerCount: "2",
  legacyProgressRows: [
    {
      datasetVersion: "world-history-v1",
      questionId: "WH-000001-B01",
      streak: 1,
      attempts: 10,
      rememberedCount: 6,
      lastRating: "hard",
      everMastered: false,
    },
  ],
  rows: [
    {
      subjectId: "world-history",
      subjectTitle: "世界史",
      deckId: "deck-1",
      deckTitle: "Deck 1",
      datasetVersion: "world-history-v1",
      questionId: "WH-000001-B01",
      rating: "again",
      analysis: JSON.stringify(snapshot),
      answerCount: 3,
    },
    {
      subjectId: "world-history",
      subjectTitle: "世界史",
      deckId: "deck-1",
      deckTitle: "Deck 1",
      datasetVersion: "world-history-v1",
      questionId: "WH-000001-B01",
      rating: "hard",
      analysis: snapshot,
      answerCount: 2,
    },
  ],
});

const sections = buildWeaknessSections(analysis.rows, "world-history");
const regionSection = sections.find((section) => section.key === "macroRegion");
const westAsia = regionSection?.ranked.find((item) => item.name === "西アジア");
if (
  analysis.rows.length !== 2 ||
  analysis.unratedAnswerCount !== 2 ||
  westAsia?.answerCount !== 5 ||
  westAsia.weaknessScore !== 86 ||
  calculateWeaknessScore({ again: 3, hard: 2, good: 0, easy: 0 }) !== 86
) {
  throw new Error("4段階評価から苦手度と上位項目を計算できませんでした。");
}

const legacyRow = createLegacyAnalysisRow({
  progress: analysis.legacyProgressRows[0],
  subject,
  deck: { id: "deck-1", datasetLabel: "Deck 1" },
  term,
  question,
});
const legacySections = buildLegacyWeaknessSections(
  legacyRow ? [legacyRow] : [],
  "world-history",
);
const legacyWestAsia = legacySections
  .find((section) => section.key === "macroRegion")
  ?.ranked.find((item) => item.name === "西アジア");
if (
  analysis.legacyProgressRows.length !== 1 ||
  legacyWestAsia?.attempts !== 10 ||
  legacyWestAsia.incorrectCount !== 4 ||
  legacyWestAsia.incorrectRate !== 40 ||
  legacyWestAsia.unmasteredQuestionCount !== 1
) {
  throw new Error("過去の回答回数から不正解率と未習得数を計算できませんでした。");
}

console.log("分析検証完了: 過去の不正解率と今後の4段階評価の集計を確認");
