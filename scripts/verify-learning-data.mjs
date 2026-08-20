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

const readingPattern = /\([ぁ-ゖー]+(?:・[ぁ-ゖー]+)*\)/;
if (generatedQuestions.some((question) => readingPattern.test(question.prompt))) {
  throw new Error("問題文に読み仮名が混入しています。");
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
if (
  xiongnu?.stages.beginner[0]?.answer !== "匈奴(きょうど)" ||
  !xiongnu?.stages.beginner.some((question) => question.answer === "単于(ぜんう)") ||
  !xiongnu?.stages.reverse.some((question) =>
    question.answer.includes("冒頓単于(ぼくとつぜんう)"),
  ) ||
  !xiongnu?.stages.integrated[0]?.answer.includes(
    "冒頓単于(ぼくとつぜんう)",
  )
) {
  throw new Error("回答・解説の代表的な難読語に読み仮名がありません。");
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
