import { getQuestionNumbers, normalizeTerm } from "./build-learning-data.mjs";

const baseRow = {
  dataset_label: "確認用",
  term_id: "WH-TEST-001",
  importance_rank: "1",
  difficulty_label: "確認用",
  category: "人物",
  term: "確認用語",
  reading: "かくにんようご",
  aliases: "別名A|別名B",
  era: "近代",
  macro_region: "ヨーロッパ",
  region_detail: "確認地域",
  date_basis: "主な活動時期",
  display_period: "1800〜1850年",
  start_year: "1800",
  end_year: "1850",
  sort_year: "1800",
  date_precision: "exact_range",
  date_note: "確認用の年代",
  question_count: "5",
  q1_type: "time",
  q1_question: "問1",
  q1_answer: "答1",
  q1_keywords: "",
  q2_type: "place",
  q2_question: "問2",
  q2_answer: "答2",
  q2_keywords: "",
  q3_type: "core",
  q3_question: "問3",
  q3_answer: "答3",
  q3_keywords: "",
  q4_type: "cause",
  q4_question: "問4",
  q4_answer: "答4",
  q4_keywords: "",
  q5_type: "impact",
  q5_question: "問5",
  q5_answer: "**答5**",
  q5_keywords: "答5",
  integrated_question: "確認用語について説明せよ。",
  total_explanation: "**確認用語**の説明。",
  total_keywords: "確認用語",
  relation_edges: "関係>関連用語",
  source_1: "確認資料｜https://example.com/",
  source_2: "",
  verification_status: "単一資料確認",
};

const questionNumbers = getQuestionNumbers([
  "q1_question",
  "q2_question",
  "q3_question",
  "q4_question",
  "q5_question",
]);
const fiveQuestionTerm = normalizeTerm(baseRow, 0, questionNumbers);
const threeQuestionTerm = normalizeTerm(
  {
    ...baseRow,
    term_id: "WH-TEST-002",
    term: "三問の確認用語",
    question_count: "3",
    q4_type: "",
    q4_question: "",
    q4_answer: "",
    q5_type: "",
    q5_question: "",
    q5_answer: "",
    q5_keywords: "",
  },
  1,
  questionNumbers,
);

if (fiveQuestionTerm.questions.length !== 5 || threeQuestionTerm.questions.length !== 3) {
  throw new Error("用語ごとの質問数を正しく認識できませんでした。");
}
if (fiveQuestionTerm.questions[0].label !== "時期") {
  throw new Error("質問種類の日本語表示を作成できませんでした。");
}
if (fiveQuestionTerm.integrated.keywords[0] !== "確認用語") {
  throw new Error("キーワードを正しく分割できませんでした。");
}

console.log("新CSV形式の可変質問数検証完了: 5問と3問を正しく認識");
