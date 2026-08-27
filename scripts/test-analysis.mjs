import {
  buildWeaknessSections,
  calculateWeaknessScore,
  createQuestionAnalysisSnapshot,
  normalizeRatingAnalysis,
} from "../public/analysis-core.js";

const snapshot = createQuestionAnalysisSnapshot(
  {
    filterLabels: {
      macroRegion: "大分類の地域",
      regionDetail: "小分類の地域",
      category: "カテゴリ",
    },
  },
  {
    term: "十字軍",
    category: "戦争",
    geography: {
      macroRegion: "ヨーロッパ・西アジア",
      regionDetail: "東地中海",
    },
  },
  {
    label: "時期",
    prompt: "第1回十字軍が開始された年はいつか。",
  },
);

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

console.log("分析検証完了: 地域・カテゴリ・問題形式と4段階評価の集計を確認");
