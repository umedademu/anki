import {
  groupTerms,
  requiredHeaders,
  validateTerms,
} from "./build-learning-data.mjs";
import {
  createEmptyProgress,
  createQuestionQueue,
  deserializeProgress,
  enqueueUniqueTasks,
  getOverallMastery,
  getTermStage,
  rateQuestion,
  scheduleRetryTask,
  serializeProgress,
  shouldHideTerm,
} from "../public/learning-engine.js";

function makeRow({
  termId,
  rank,
  term,
  sortYear,
  questionId,
  stage,
  type,
  question,
  answer,
}) {
  return {
    dataset_label: "確認用55語",
    term_id: termId,
    importance_rank: String(rank),
    difficulty_label: "大学受験標準",
    category: "事件・革命",
    term,
    reading: "かくにん",
    aliases: "",
    era: "近代",
    macro_region: "世界",
    region_detail: "確認地域",
    display_period: `${sortYear}年`,
    sort_year: String(sortYear),
    question_id: questionId,
    stage,
    focus: stage === "integrated" ? "統合説明" : "確認",
    question_type: type,
    question,
    answer,
    keywords: "確認語",
    accepted_answers: "",
    answer_note: "",
    source_name: "確認資料",
    source_url: "https://example.com/source",
  };
}

const rows = [
  makeRow({
    termId: "WH-TEST-001",
    rank: 1,
    term: "確認用語A",
    sortYear: 1800,
    questionId: "WH-TEST-001-B01",
    stage: "beginner",
    type: "identify",
    question: "短答1",
    answer: "確認用語A",
  }),
  makeRow({
    termId: "WH-TEST-001",
    rank: 1,
    term: "確認用語A",
    sortYear: 1800,
    questionId: "WH-TEST-001-B02",
    stage: "beginner",
    type: "time",
    question: "短答2",
    answer: "1800年",
  }),
  makeRow({
    termId: "WH-TEST-001",
    rank: 1,
    term: "確認用語A",
    sortYear: 1800,
    questionId: "WH-TEST-001-R01",
    stage: "reverse",
    type: "reverse",
    question: "何が起きた？",
    answer: "**確認語**を説明する。",
  }),
  makeRow({
    termId: "WH-TEST-001",
    rank: 1,
    term: "確認用語A",
    sortYear: 1800,
    questionId: "WH-TEST-001-I01",
    stage: "integrated",
    type: "integrated",
    question: "確認用語Aについて説明せよ。",
    answer: "**確認語**を統合して説明する。",
  }),
  makeRow({
    termId: "WH-TEST-002",
    rank: 2,
    term: "確認用語B",
    sortYear: 1900,
    questionId: "WH-TEST-002-B01",
    stage: "beginner",
    type: "identify",
    question: "短答1",
    answer: "確認用語B",
  }),
  makeRow({
    termId: "WH-TEST-002",
    rank: 2,
    term: "確認用語B",
    sortYear: 1900,
    questionId: "WH-TEST-002-R01",
    stage: "reverse",
    type: "reverse",
    question: "いつ・どこ？",
    answer: "**1900年**の確認地域。",
  }),
  makeRow({
    termId: "WH-TEST-002",
    rank: 2,
    term: "確認用語B",
    sortYear: 1900,
    questionId: "WH-TEST-002-R02",
    stage: "reverse",
    type: "reverse",
    question: "何をした？",
    answer: "**確認語**を実行した。",
  }),
  makeRow({
    termId: "WH-TEST-002",
    rank: 2,
    term: "確認用語B",
    sortYear: 1900,
    questionId: "WH-TEST-002-I01",
    stage: "integrated",
    type: "integrated",
    question: "確認用語Bについて説明せよ。",
    answer: "**確認語**を統合して説明する。",
  }),
];

if (requiredHeaders.some((header) => !(header in rows[0]))) {
  throw new Error("24列形式の確認データに不足があります。");
}

const terms = groupTerms(rows);
validateTerms(terms);
if (
  terms.length !== 2 ||
  terms[0].stages.beginner.length !== 2 ||
  terms[0].stages.reverse.length !== 1 ||
  terms[1].stages.reverse.length !== 2
) {
  throw new Error("1行1問のデータを用語・段階別に正しくまとめられませんでした。");
}

const masteryTarget = 2;
const progress = createEmptyProgress();
const firstQueue = createQuestionQueue(terms, progress, masteryTarget);
if (
  firstQueue.length !== 3 ||
  firstQueue.some((task) => task.stage !== "beginner")
) {
  throw new Error("未学習時に短答問題だけを出題できませんでした。");
}

if (
  !shouldHideTerm(terms[0].stages.beginner[0], false) ||
  shouldHideTerm(terms[0].stages.beginner[0], true) ||
  shouldHideTerm(terms[0].stages.reverse[0], false)
) {
  throw new Error("回答前の短答だけで用語名を隠す判定ができませんでした。");
}

const retryTask = { termId: "WH-TEST-001", questionId: "RETRY", stage: "beginner" };
const retryBaseQueue = Array.from({ length: 10 }, (_, index) => ({
  termId: `WH-TEST-${index + 10}`,
  questionId: `QUEUE-${index + 1}`,
  stage: "beginner",
}));
const retryAfterStill = scheduleRetryTask(retryBaseQueue, retryTask, false);
const retryAfterRemembered = scheduleRetryTask(retryBaseQueue, retryTask, true);
if (
  retryAfterStill[3]?.questionId !== retryTask.questionId ||
  retryAfterRemembered[8]?.questionId !== retryTask.questionId
) {
  throw new Error("回答結果に応じた間隔で再出題列へ戻せませんでした。");
}

const queueWithDuplicate = [retryTask, ...retryBaseQueue];
const rescheduledQueue = scheduleRetryTask(queueWithDuplicate, retryTask, false);
if (
  rescheduledQueue.filter((task) => task.questionId === retryTask.questionId).length !== 1 ||
  rescheduledQueue[3]?.questionId !== retryTask.questionId
) {
  throw new Error("再出題列から同じ問題の重複を除けませんでした。");
}

const addedTasks = enqueueUniqueTasks(
  retryBaseQueue,
  [
    retryBaseQueue[0],
    retryTask,
    retryTask,
    { termId: "WH-TEST-999", questionId: "BLOCKED", stage: "reverse" },
  ],
  ["BLOCKED"],
);
if (
  addedTasks.length !== retryBaseQueue.length + 1 ||
  addedTasks.at(-1)?.questionId !== retryTask.questionId ||
  addedTasks.some((task) => task.questionId === "BLOCKED") ||
  retryBaseQueue.length !== 10
) {
  throw new Error("解放した段階の問題を重複なく追加できませんでした。");
}

const restoredProgress = deserializeProgress(
  JSON.stringify({
    questions: {
      "WH-TEST-001-B01": {
        streak: "2",
        attempts: "3",
        rememberedCount: "2",
      },
    },
    updatedAt: "2026-08-20T00:00:00.000Z",
  }),
);
const serializedProgress = JSON.parse(serializeProgress(restoredProgress));
if (
  restoredProgress.questions["WH-TEST-001-B01"].streak !== 2 ||
  restoredProgress.questions["WH-TEST-001-B01"].attempts !== 3 ||
  serializedProgress.questions["WH-TEST-001-B01"].rememberedCount !== 2 ||
  deserializeProgress("壊れた保存内容").updatedAt !== null
) {
  throw new Error("端末内へ保存する進捗の正規化と復元ができませんでした。");
}

for (const question of terms[0].stages.beginner) {
  rateQuestion(progress, question.id, true, masteryTarget);
  rateQuestion(progress, question.id, true, masteryTarget);
}
if (getTermStage(terms[0], progress, masteryTarget) !== "reverse") {
  throw new Error("短答の習得後に逆一問一答へ移行できませんでした。");
}

const reverseQuestion = terms[0].stages.reverse[0];
rateQuestion(progress, reverseQuestion.id, true, masteryTarget);
rateQuestion(progress, reverseQuestion.id, false, masteryTarget);
if (progress.questions[reverseQuestion.id].streak !== 0) {
  throw new Error("「まだ」の選択時に連続回数を戻せませんでした。");
}
rateQuestion(progress, reverseQuestion.id, true, masteryTarget);
rateQuestion(progress, reverseQuestion.id, true, masteryTarget);
if (getTermStage(terms[0], progress, masteryTarget) !== "integrated") {
  throw new Error("逆一問一答の習得後に統合説明へ移行できませんでした。");
}

const integratedQuestion = terms[0].stages.integrated[0];
rateQuestion(progress, integratedQuestion.id, true, masteryTarget);
rateQuestion(progress, integratedQuestion.id, true, masteryTarget);
if (getTermStage(terms[0], progress, masteryTarget) !== "complete") {
  throw new Error("統合説明の習得後に用語を完全習得にできませんでした。");
}

const overall = getOverallMastery(terms, progress, masteryTarget);
if (overall.masteredTerms !== 1 || overall.totalTerms !== 2) {
  throw new Error("用語全体の習得数を正しく集計できませんでした。");
}

console.log(
  "三段階学習検証完了: 段階移行・用語非表示・再出題・重複防止・保存復元を確認",
);
