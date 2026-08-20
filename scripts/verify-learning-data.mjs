import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  countQuestionsByStage,
  findSourcePath,
  groupTerms,
  parseCsv,
  toObjects,
  validateTerms,
} from "./build-learning-data.mjs";
import { getQuestionPromptForDisplay } from "../public/learning-engine.js";
import { hasMissingRequiredReadings } from "./reading-rules.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = path.join(projectRoot, "public", "data");
const readJson = async (relativePath) =>
  JSON.parse(await readFile(path.join(dataRoot, relativePath), "utf8"));

const sourcePath = await findSourcePath();
const expectedTerms = groupTerms(
  toObjects(parseCsv(await readFile(sourcePath, "utf8"))),
);
validateTerms(expectedTerms);
const expectedCounts = countQuestionsByStage(expectedTerms);
const expectedQuestionCount = Object.values(expectedCounts).reduce(
  (sum, count) => sum + count,
  0,
);

const catalog = await readJson("index.json");
if (catalog.schemaVersion !== 3 || catalog.subjects.length !== 1) {
  throw new Error("科目一覧が三段階学習用の新形式ではありません。");
}

const subject = await readJson(catalog.subjects[0].indexPath);
if (subject.schemaVersion !== 3 || subject.masteryTarget !== 2) {
  throw new Error("科目情報の形式または習得条件が想定どおりではありません。");
}
const chunks = await Promise.all(subject.chunks.map((chunk) => readJson(chunk.path)));
if (chunks.some((chunk) => chunk.schemaVersion !== 3)) {
  throw new Error("旧形式の分割データが残っています。");
}

const generatedTerms = chunks.flatMap((chunk) => chunk.terms);
const generatedQuestions = generatedTerms.flatMap((term) =>
  Object.values(term.stages).flat(),
);
const generatedCounts = countQuestionsByStage(generatedTerms);
const generatedQuestionCount = Object.values(generatedCounts).reduce(
  (sum, count) => sum + count,
  0,
);

if (generatedTerms.length !== 300 || generatedQuestionCount !== 1770) {
  throw new Error(
    `新しい用語集の件数が一致しません: ${generatedTerms.length}用語・${generatedQuestionCount}問`,
  );
}
if (
  generatedCounts.beginner !== 900 ||
  generatedCounts.reverse !== 570 ||
  generatedCounts.integrated !== 300
) {
  throw new Error(
    `段階別件数が一致しません: ${JSON.stringify(generatedCounts)}`,
  );
}
if (
  generatedTerms.length !== subject.termCount ||
  generatedQuestionCount !== subject.questionCount ||
  JSON.stringify(generatedCounts) !== JSON.stringify(subject.questionCounts)
) {
  throw new Error("生成データの件数が科目情報と一致しません。");
}
if (
  generatedTerms.length !== expectedTerms.length ||
  generatedQuestionCount !== expectedQuestionCount ||
  JSON.stringify(generatedCounts) !== JSON.stringify(expectedCounts)
) {
  throw new Error("元CSVと生成データの件数が一致しません。");
}
if (JSON.stringify(generatedTerms) !== JSON.stringify(expectedTerms)) {
  throw new Error("元CSVの問題・回答・出典が生成データへ正確に反映されていません。");
}

const readingPattern = /\([ぁ-ゖー]+(?:[・\s][ぁ-ゖー]+)*\)/;
const readingPatternGlobal = /\([ぁ-ゖー]+(?:[・\s][ぁ-ゖー]+)*\)/g;
const questionsWithReading = generatedQuestions.filter((question) =>
  readingPattern.test(question.prompt),
);
const questionReadingOccurrences = generatedQuestions.reduce(
  (total, question) =>
    total + (question.prompt.match(readingPatternGlobal)?.length ?? 0),
  0,
);
const answersWithReading = generatedQuestions.filter((question) =>
  readingPattern.test(question.answer),
);
const answerReadingOccurrences = generatedQuestions.reduce(
  (total, question) =>
    total + (question.answer.match(readingPatternGlobal)?.length ?? 0),
  0,
);
const invalidPromptPatterns = [
  /\)\(/,
  /(?<!靖難の)変\(せいなんのへん\)/,
  /(?<!安史の)乱\(あんしのらん\)/,
  /(?<!黄巾の)乱\(こうきんのらん\)/,
  /(?<!三藩の)乱\(さんぱんのらん\)/,
];
if (
  questionsWithReading.length !== 226 ||
  questionReadingOccurrences !== 277 ||
  answersWithReading.length !== 388 ||
  answerReadingOccurrences !== 729 ||
  generatedQuestions.some((question) =>
    invalidPromptPatterns.some((pattern) => pattern.test(question.prompt)),
  ) ||
  generatedQuestions.some((question) =>
    readingPattern.test(getQuestionPromptForDisplay(question, false)),
  ) ||
  generatedQuestions.some(
    (question) => getQuestionPromptForDisplay(question, true) !== question.prompt,
  )
) {
  throw new Error("問題文の読み仮名を回答前だけ隠すためのデータが正しくありません。");
}
if (
  generatedQuestions.some(
    (question) =>
      hasMissingRequiredReadings(question.prompt) ||
      hasMissingRequiredReadings(question.answer),
  )
) {
  throw new Error("問題文または回答に、登録済みの難読語の読み仮名漏れがあります。");
}
if (
  generatedQuestions.some((question) =>
    [...question.keywords, ...question.acceptedAnswers].some((value) =>
      readingPattern.test(value),
    ),
  )
) {
  throw new Error("キーワードまたは別解に読み仮名が混入しています。");
}
const xiongnu = generatedTerms.find((term) => term.id === "WH-000052");
const wangAnshi = generatedTerms.find((term) => term.id === "WH-000126");
const kangxi = generatedTerms.find((term) => term.id === "WH-000204");
if (
  xiongnu?.stages.beginner[0]?.answer !== "匈奴(きょうど)" ||
  xiongnu?.stages.beginner[0]?.prompt !==
    "冒頓単于(ぼくとつぜんう)のもとでモンゴル高原を統一し、漢と対立した騎馬遊牧国家は？" ||
  !xiongnu?.stages.beginner.some((question) => question.answer === "単于(ぜんう)") ||
  !xiongnu?.stages.reverse.some((question) =>
    question.answer.includes("冒頓単于(ぼくとつぜんう)"),
  ) ||
  !xiongnu?.stages.integrated[0]?.answer.includes(
    "冒頓単于(ぼくとつぜんう)",
  ) ||
  wangAnshi?.stages.beginner[2]?.prompt !==
    "王安石(おうあんせき)の低利融資政策を何という？" ||
  getQuestionPromptForDisplay(wangAnshi?.stages.beginner[2], false) !==
    "王安石の低利融資政策を何という？" ||
  !kangxi?.stages.reverse[0]?.answer.includes("鄭氏台湾(ていしたいわん)") ||
  !kangxi?.stages.integrated[0]?.answer.includes("鄭氏台湾(ていしたいわん)")
) {
  throw new Error("問題・回答・解説の代表的な難読語に読み仮名がありません。");
}
if (subject.sourceFile !== path.basename(sourcePath)) {
  throw new Error("科目情報の元ファイル名が一致しません。");
}
if (
  subject.chunks.length !== 6 ||
  subject.chunks.some((chunk) => chunk.count !== 50)
) {
  throw new Error("300用語が50語ずつ6個へ正しく分割されていません。");
}

const questionIds = generatedTerms.flatMap((term) =>
  Object.values(term.stages).flatMap((questions) =>
    questions.map((question) => question.id),
  ),
);
if (new Set(questionIds).size !== questionIds.length) {
  throw new Error("生成後の問題IDが重複しています。");
}

console.log(
  "検証完了: 300用語・1770問（短答900、逆一問一答570、統合説明300）・新形式",
);
