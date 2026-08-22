import {
  groupTerms,
  requiredHeaders,
  validateTerms,
} from "./build-learning-data.mjs";
import {
  createEmptyProgress,
  createQuestionQueue,
  createRatingUndoSnapshot,
  createTermQuestionQueue,
  defaultReviewSettings,
  deserializeProgress,
  enqueueUniqueTasks,
  filterTermsBySelection,
  getIntegratedExplanationQuestion,
  getMacroRegionTags,
  getNextDueAt,
  getOverallMastery,
  getQuestionAnswerDisplayText,
  getQuestionAnswerParts,
  getQuestionAnswerSpeechText,
  getQuestionExplanation,
  getQuestionPromptForDisplay,
  getQuestionYearMnemonic,
  getTermStage,
  isQuestionDue,
  isQuestionMastered,
  rateQuestion,
  restoreRatingUndoSnapshot,
  serializeProgress,
  shouldHideTerm,
} from "../public/learning-engine.js";

function makeRow({ termId, rank, term, sortYear, questionId, stage, questionType, question, answer }) {
  return {
    dataset_label: "確認用語集",
    term_id: termId,
    importance_rank: String(rank),
    difficulty_label: "大学受験標準",
    category: termId === "WH-TEST-001" ? "事件・革命" : "人物",
    term,
    reading: "かくにん",
    aliases: "",
    era: "近代",
    macro_region: termId === "WH-TEST-001" ? "ヨーロッパ・西アジア" : "東アジア",
    region_detail: termId === "WH-TEST-001" ? "確認地域A" : "確認地域B",
    display_period: `${sortYear}年`,
    sort_year: String(sortYear),
    question_id: questionId,
    stage,
    focus: stage === "integrated" ? "統合説明" : "確認",
    question_type: stage === "integrated" ? "integrated" : stage === "reverse" ? "reverse" : (questionType ?? "identify"),
    question,
    answer,
    keywords: "確認語",
    accepted_answers: "",
    answer_note: "",
    year_mnemonic:
      questionId === "A-B02" || questionId === "A-I01"
        ? "1800年：開始年の確認用語呂合わせ|1850年：終了年の確認用語呂合わせ"
        : "",
    source_name: "確認資料",
    source_url: "https://example.com/source",
  };
}

const rows = [
  makeRow({ termId: "WH-TEST-001", rank: 1, term: "確認用語A", sortYear: 1800, questionId: "A-B01", stage: "beginner", question: "短答1", answer: "確認用語A" }),
  makeRow({ termId: "WH-TEST-001", rank: 1, term: "確認用語A", sortYear: 1800, questionId: "A-B02", stage: "beginner", questionType: "time", question: "確認用語Aの期間は？", answer: "1800〜1850年" }),
  makeRow({ termId: "WH-TEST-001", rank: 1, term: "確認用語A", sortYear: 1800, questionId: "A-R01", stage: "reverse", question: "何が起きた？", answer: "**確認語**を説明する。" }),
  makeRow({ termId: "WH-TEST-001", rank: 1, term: "確認用語A", sortYear: 1800, questionId: "A-I01", stage: "integrated", question: "確認用語Aについて説明せよ。", answer: "**確認語**を統合して説明する。" }),
  makeRow({ termId: "WH-TEST-002", rank: 2, term: "確認用語B", sortYear: 1900, questionId: "B-B01", stage: "beginner", question: "短答1", answer: "確認用語B" }),
  makeRow({ termId: "WH-TEST-002", rank: 2, term: "確認用語B", sortYear: 1900, questionId: "B-R01", stage: "reverse", question: "いつ・どこ？", answer: "**1900年**の確認地域。" }),
  makeRow({ termId: "WH-TEST-002", rank: 2, term: "確認用語B", sortYear: 1900, questionId: "B-R02", stage: "reverse", question: "何をした？", answer: "**確認語**を実行した。" }),
  makeRow({ termId: "WH-TEST-002", rank: 2, term: "確認用語B", sortYear: 1900, questionId: "B-I01", stage: "integrated", question: "確認用語Bについて説明せよ。", answer: "**確認語**を統合して説明する。" }),
];

if (requiredHeaders.some((header) => !(header in rows[0]))) {
  throw new Error("25列形式の確認データに不足があります。");
}
const terms = groupTerms(rows);
validateTerms(terms);

if (
  terms[0].stages.beginner[1].yearMnemonic !== "1800年：開始年の確認用語呂合わせ|1850年：終了年の確認用語呂合わせ" ||
  terms[0].stages.integrated[0].yearMnemonic !== "1800年：開始年の確認用語呂合わせ|1850年：終了年の確認用語呂合わせ"
) {
  throw new Error("期間の両端を含む語呂合わせを問題データへ取り込めませんでした。");
}

if (
  !getMacroRegionTags(terms[0]).includes("西アジア") ||
  filterTermsBySelection(terms, { macroRegion: "西アジア" })[0]?.id !== "WH-TEST-001" ||
  filterTermsBySelection(terms, { macroRegion: "東アジア", regionDetail: "確認地域B", category: "人物" })[0]?.id !== "WH-TEST-002"
) {
  throw new Error("地域・小地域・カテゴリを組み合わせて絞り込めませんでした。");
}
if (
  getMacroRegionTags({
    geography: {
      macroRegion: "都市・生活圏",
      splitMacroRegion: false,
    },
  }).join(",") !== "都市・生活圏"
) {
  throw new Error("地理の尺度名を一つの選択肢として扱えませんでした。");
}

const masteryTarget = 2;
const startAt = new Date("2026-08-21T00:00:00.000Z");
const progress = createEmptyProgress();
const singleStageTerm = {
  id: "GE-TEST-001",
  stages: {
    beginner: [{ id: "GE-TEST-001-C01", stage: "beginner" }],
    reverse: [],
    integrated: [],
  },
};
const singleStageProgress = createEmptyProgress();
if (
  getTermStage(singleStageTerm, singleStageProgress, masteryTarget) !== "beginner" ||
  getOverallMastery(
    [singleStageTerm],
    singleStageProgress,
    masteryTarget,
  ).masteredTerms !== 0
) {
  throw new Error("一段階だけの暗記カードを未習得として開始できませんでした。");
}
rateQuestion(
  singleStageProgress,
  "GE-TEST-001-C01",
  "easy",
  masteryTarget,
  defaultReviewSettings,
  startAt,
);
if (
  getTermStage(singleStageTerm, singleStageProgress, masteryTarget) !== "complete" ||
  getOverallMastery(
    [singleStageTerm],
    singleStageProgress,
    masteryTarget,
  ).masteredTerms !== 1
) {
  throw new Error("一段階だけの暗記カードを習得完了にできませんでした。");
}
const firstQueue = createQuestionQueue(terms, progress, masteryTarget, "", startAt);
if (firstQueue.map((task) => task.questionId).join(",") !== "A-B01,B-B01,A-B02") {
  throw new Error("未学習時に基礎問題を問題番号ごとの用語順で並べられませんでした。");
}

const firstTermQueue = createTermQuestionQueue(
  terms,
  progress,
  masteryTarget,
  "",
  startAt,
  () => 0,
);
if (
  firstTermQueue.map((task) => task.questionId).join(",") !== "A-B01,B-B01" ||
  new Set(firstTermQueue.map((task) => task.termId)).size !== firstTermQueue.length
) {
  throw new Error("1項目につき復習対象を1問だけ選べませんでした。");
}
const randomTermQueue = createTermQuestionQueue(
  terms,
  progress,
  masteryTarget,
  "",
  startAt,
  () => 0.99,
);
if (randomTermQueue.find((task) => task.termId === "WH-TEST-001")?.questionId !== "A-B02") {
  throw new Error("習熟状況が同じ問題から偏りなく1問を選べませんでした。");
}

const priorityProgress = createEmptyProgress();
rateQuestion(
  priorityProgress,
  "A-B01",
  "again",
  masteryTarget,
  defaultReviewSettings,
  startAt,
);
const afterIncorrectAt = new Date(startAt.getTime() + 61 * 1000);
const coverageTermQueue = createTermQuestionQueue(
  terms,
  priorityProgress,
  masteryTarget,
  "beginner",
  afterIncorrectAt,
  () => 0,
);
if (coverageTermQueue.find((task) => task.termId === "WH-TEST-001")?.questionId !== "A-B02") {
  throw new Error("同じ苦手度なら未出題の問題を優先できませんでした。");
}
rateQuestion(
  priorityProgress,
  "A-B02",
  "easy",
  masteryTarget,
  defaultReviewSettings,
  startAt,
);
const weaknessTermQueue = createTermQuestionQueue(
  terms,
  priorityProgress,
  masteryTarget,
  "beginner",
  new Date(startAt.getTime() + defaultReviewSettings.easySeconds * 1000),
  () => 0,
);
if (weaknessTermQueue.find((task) => task.termId === "WH-TEST-001")?.questionId !== "A-B01") {
  throw new Error("復習対象の中から苦手な問題を優先できませんでした。");
}

const cooledProgress = createEmptyProgress();
for (const question of terms[0].stages.beginner) {
  rateQuestion(
    cooledProgress,
    question.id,
    "easy",
    masteryTarget,
    defaultReviewSettings,
    startAt,
  );
}
const cooledTermQueue = createTermQuestionQueue(
  terms,
  cooledProgress,
  masteryTarget,
  "beginner",
  new Date(startAt.getTime() + 24 * 60 * 60 * 1000),
  () => 0,
);
if (cooledTermQueue.some((task) => task.termId === "WH-TEST-001")) {
  throw new Error("すべての問題が復習時刻前の項目を1項目1問から除外できませんでした。");
}

const directReverse = createQuestionQueue(terms, progress, masteryTarget, "reverse", startAt);
if (directReverse.length !== 3 || directReverse.some((task) => task.stage !== "reverse")) {
  throw new Error("問題スタイル指定時に前段階を飛ばして直接出題できませんでした。");
}

if (
  !shouldHideTerm(terms[0].stages.beginner[0], false) ||
  shouldHideTerm(terms[0].stages.beginner[0], true) ||
  shouldHideTerm(terms[0].stages.reverse[0], false)
) {
  throw new Error("回答前の基礎問題だけで用語欄を隠せませんでした。");
}

const questionWithReading = { prompt: "王安石(おう あんせき)の低利融資政策を何という？" };
if (
  getQuestionPromptForDisplay(questionWithReading, false) !== "王安石の低利融資政策を何という？" ||
  getQuestionPromptForDisplay(questionWithReading, true) !== questionWithReading.prompt
) {
  throw new Error("回答表示時だけ問題文の読み仮名を表示できませんでした。");
}

const answerWithAlternates = {
  answer: "ベルリン会議",
  acceptedAnswers: ["コンゴ会議", "ベルリン会議", ""],
};
if (
  getQuestionAnswerParts(answerWithAlternates).join("|") !==
    "ベルリン会議|コンゴ会議" ||
  getQuestionAnswerDisplayText(answerWithAlternates) !==
    "ベルリン会議 / コンゴ会議" ||
  getQuestionAnswerSpeechText(answerWithAlternates) !==
    "ベルリン会議。コンゴ会議"
) {
  throw new Error("回答と別解を同じ表示・読み上げ単位へまとめられませんでした。");
}

if (
  getIntegratedExplanationQuestion(terms[0], terms[0].stages.beginner[0]) !== terms[0].stages.integrated[0] ||
  getIntegratedExplanationQuestion(terms[0], terms[0].stages.integrated[0]) !== null
) {
  throw new Error("統合説明以外の回答へ解説を対応付けられませんでした。");
}
if (
  getQuestionExplanation(terms[0], terms[0].stages.beginner[0]) !==
    terms[0].stages.integrated[0].answer ||
  getQuestionExplanation(
    { ...terms[0], integratedAsExplanation: false },
    { ...terms[0].stages.beginner[0], explanation: "カード専用の解説" },
  ) !== "カード専用の解説"
) {
  throw new Error("世界史の統合説明と暗記カード専用の解説を同じ解説枠へ分けて表示できませんでした。");
}

const termMnemonic = "1800年：開始年の確認用語呂合わせ|1850年：終了年の確認用語呂合わせ";
const questionMnemonic = "1815年：問題専用の確認用語呂合わせ";
if (
  getQuestionYearMnemonic(terms[0], terms[0].stages.beginner[0]) !== termMnemonic ||
  getQuestionYearMnemonic(terms[0], terms[0].stages.beginner[1]) !== termMnemonic ||
  getQuestionYearMnemonic(terms[0], terms[0].stages.integrated[0]) !== termMnemonic ||
  getQuestionYearMnemonic(terms[1], terms[1].stages.beginner[0]) !== "" ||
  getQuestionYearMnemonic(
    terms[0],
    { ...terms[0].stages.beginner[0], yearMnemonic: questionMnemonic },
  ) !== questionMnemonic ||
  getQuestionYearMnemonic(
    { ...terms[0], integratedAsExplanation: false },
    terms[0].stages.beginner[0],
  ) !== ""
) {
  throw new Error("同じ用語の統合説明にある年号語呂を各問題へ対応付けられませんでした。");
}

const intervalChecks = [
  ["again", 60],
  ["hard", 4 * 60 * 60],
  ["good", 12 * 60 * 60],
  ["easy", 6 * 24 * 60 * 60],
];
for (const [rating, expectedSeconds] of intervalChecks) {
  const checkProgress = createEmptyProgress();
  rateQuestion(checkProgress, `Q-${rating}`, rating, masteryTarget, defaultReviewSettings, startAt);
  const record = checkProgress.questions[`Q-${rating}`];
  if ((Date.parse(record.nextReviewAt) - startAt.getTime()) / 1000 !== expectedSeconds) {
    throw new Error(`${rating}の復習間隔が正しくありません。`);
  }
  if (isQuestionDue(checkProgress, `Q-${rating}`, startAt)) {
    throw new Error("評価直後の問題がすぐ再出題されました。");
  }
}

for (const question of terms[0].stages.beginner) {
  rateQuestion(progress, question.id, "easy", masteryTarget, defaultReviewSettings, startAt);
}
if (getTermStage(terms[0], progress, masteryTarget) !== "reverse") {
  throw new Error("基礎問題の習得後に逆一問一答を追加できませんでした。");
}
const afterBeginner = createQuestionQueue(terms, progress, masteryTarget, "", startAt);
if (!afterBeginner.some((task) => task.questionId === "A-R01")) {
  throw new Error("新しく解放した逆一問一答がデッキへ追加されませんでした。");
}
if (afterBeginner.some((task) => task.questionId.startsWith("A-B"))) {
  throw new Error("簡単を選んだ問題が6日後より前の読み上げ・出題対象に残りました。");
}

const sixDaysLater = new Date(startAt.getTime() + defaultReviewSettings.easySeconds * 1000);
const additiveQueue = createQuestionQueue(terms, progress, masteryTarget, "", sixDaysLater);
if (
  !additiveQueue.some((task) => task.questionId === "A-B01") ||
  !additiveQueue.some((task) => task.questionId === "A-R01")
) {
  throw new Error("段階追加後に基礎と逆一問一答を同じデッキで復習できませんでした。");
}

rateQuestion(progress, "A-R01", "good", masteryTarget, defaultReviewSettings, startAt);
rateQuestion(progress, "A-R01", "hard", masteryTarget, defaultReviewSettings, sixDaysLater);
if (!isQuestionMastered(progress, "A-R01", masteryTarget)) {
  throw new Error("難しい・正解の2回で問題を習得扱いにできませんでした。");
}
if (getTermStage(terms[0], progress, masteryTarget) !== "integrated") {
  throw new Error("逆一問一答の習得後に統合説明を追加できませんでした。");
}
rateQuestion(progress, "A-R01", "again", masteryTarget, defaultReviewSettings, sixDaysLater);
if (!isQuestionMastered(progress, "A-R01", masteryTarget) || getTermStage(terms[0], progress, masteryTarget) !== "integrated") {
  throw new Error("追加済み段階が後の不正解で閉じてしまいました。");
}

const undoProgress = createEmptyProgress();
const undoTask = { termId: "WH-TEST-001", questionId: "UNDO", stage: "beginner" };
const undoSnapshot = createRatingUndoSnapshot({
  progress: undoProgress,
  questionId: "UNDO",
  queue: [firstQueue[0]],
  currentTask: undoTask,
  answerVisible: true,
  answeredThisSession: 5,
  unlockMessage: "",
});
rateQuestion(undoProgress, "UNDO", "easy", masteryTarget, defaultReviewSettings, startAt);
const restoredUndo = restoreRatingUndoSnapshot(undoProgress, undoSnapshot);
if ("UNDO" in undoProgress.questions || restoredUndo.currentTask.questionId !== "UNDO" || !restoredUndo.answerVisible) {
  throw new Error("4段階評価を一手戻しで取り消せませんでした。");
}

const queueWithDuplicates = enqueueUniqueTasks(
  [firstQueue[0]],
  [firstQueue[0], firstQueue[1], firstQueue[1]],
);
if (queueWithDuplicates.length !== 2) {
  throw new Error("追加問題の重複を防げませんでした。");
}

const legacy = deserializeProgress(JSON.stringify({
  questions: { LEGACY: { streak: "2", attempts: "3", rememberedCount: "2" } },
  updatedAt: "2026-08-20T00:00:00.000Z",
}), masteryTarget);
const serialized = JSON.parse(serializeProgress(legacy, masteryTarget));
if (!legacy.questions.LEGACY.everMastered || serialized.questions.LEGACY.attempts !== 3) {
  throw new Error("従来の端末内記録を新形式へ引き継げませんでした。");
}

const nextDueAt = getNextDueAt([terms[0]], progress, masteryTarget);
if (!nextDueAt || !Number.isFinite(Date.parse(nextDueAt))) {
  throw new Error("次の復習日時を取得できませんでした。");
}

const overall = getOverallMastery(terms, progress, masteryTarget);
if (overall.masteredQuestions < 3 || overall.totalTerms !== 2) {
  throw new Error("習得状況を正しく集計できませんでした。");
}

console.log(
  "四段階復習検証完了: 復習間隔・段階追加・期限判定・一手戻し・旧記録移行を確認",
);
