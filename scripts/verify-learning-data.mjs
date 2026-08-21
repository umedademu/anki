import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  countQuestionsByStage,
  findSourcePath,
  groupTerms,
  loadTermImageManifest,
  parseCsv,
  toObjects,
  validateTerms,
} from "./build-learning-data.mjs";
import { getQuestionPromptForDisplay } from "../public/learning-engine.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = path.join(projectRoot, "public", "data");
const readJson = async (relativePath) =>
  JSON.parse(await readFile(path.join(dataRoot, relativePath), "utf8"));

const sourcePath = await findSourcePath();
const expectedTerms = groupTerms(
  toObjects(parseCsv(await readFile(sourcePath, "utf8"))),
);
validateTerms(expectedTerms);
const expectedTermImages = await loadTermImageManifest(expectedTerms);
const expectedCounts = countQuestionsByStage(expectedTerms);
const expectedQuestionCount = Object.values(expectedCounts).reduce(
  (sum, count) => sum + count,
  0,
);

const catalog = await readJson("index.json");
if (catalog.schemaVersion !== 3 || catalog.subjects.length !== 1) {
  throw new Error("科目一覧が三段階学習用の形式ではありません。");
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

if (generatedTerms.length !== 400 || generatedQuestionCount !== 2782) {
  throw new Error(
    `Deck 1の件数が一致しません: ${generatedTerms.length}用語・${generatedQuestionCount}問`,
  );
}
if (
  generatedCounts.beginner !== 1200 ||
  generatedCounts.reverse !== 1182 ||
  generatedCounts.integrated !== 400
) {
  throw new Error(`段階別件数が一致しません: ${JSON.stringify(generatedCounts)}`);
}
if (
  subject.datasetLabel !== "世界史段階別デッキ｜Deck 1｜最重要骨格400語" ||
  subject.termCount !== generatedTerms.length ||
  subject.questionCount !== generatedQuestionCount ||
  JSON.stringify(subject.questionCounts) !== JSON.stringify(generatedCounts)
) {
  throw new Error("科目情報の名称または件数が生成データと一致しません。");
}
if (
  generatedTerms.length !== expectedTerms.length ||
  generatedQuestionCount !== expectedQuestionCount ||
  JSON.stringify(generatedCounts) !== JSON.stringify(expectedCounts) ||
  JSON.stringify(generatedTerms) !== JSON.stringify(expectedTerms)
) {
  throw new Error("元CSVの問題・回答・語呂合わせ・出典が正確に反映されていません。");
}

const generatedTermImages = await readJson("term-images.json");
const imageAssetIds = new Set(generatedTermImages.assets.map((asset) => asset.id));
const assignedQuestionIds = new Set(
  generatedTermImages.assignments.map((assignment) => assignment.questionId),
);
if (
  JSON.stringify(generatedTermImages) !== JSON.stringify(expectedTermImages) ||
  generatedTermImages.schemaVersion !== 2 ||
  generatedTermImages.assets.length !== 456 ||
  generatedTermImages.termFallbacks.length !== 400 ||
  generatedTermImages.assignments.length !== 2782 ||
  assignedQuestionIds.size !== 2782 ||
  generatedTermImages.assets.some(
    (asset) =>
      !asset.path.endsWith(".webp") ||
      !asset.creator ||
      !asset.license ||
      !asset.licenseUrl ||
      !asset.sourcePageUrl,
  ) ||
  generatedTermImages.termFallbacks.some(
    (fallback) => !imageAssetIds.has(fallback.assetId),
  ) ||
  generatedTermImages.assignments.some(
    (assignment) => !imageAssetIds.has(assignment.assetId),
  )
) {
  throw new Error("Deck 1の関連画像一覧・割り当て・出典情報が一致しません。");
}
await Promise.all(
  generatedTermImages.assets.map((image) => stat(path.join(dataRoot, image.path))),
);

const mnemonicQuestions = generatedQuestions.filter((question) => question.yearMnemonic);
const distinctMnemonics = new Set(
  mnemonicQuestions.map((question) => question.yearMnemonic),
);
const representativeMnemonic = generatedQuestions.find(
  (question) => question.id === "WH-000045-B02",
);
if (
  mnemonicQuestions.length !== 71 ||
  distinctMnemonics.size !== 22 ||
  representativeMnemonic?.yearMnemonic !==
    "476年：死なむ（476）西ローマ帝国" ||
  generatedQuestions.some((question) => typeof question.yearMnemonic !== "string")
) {
  throw new Error("年号の語呂合わせが元CSVどおり取り込まれていません。");
}

const reverseQuestions = generatedTerms.flatMap((term) => term.stages.reverse);
if (
  reverseQuestions.length !== 1182 ||
  reverseQuestions.filter((question) => question.type !== "reverse").length !== 782
) {
  throw new Error("逆一問一答段階の詳しい問題種別が保持されていません。");
}

const readingPattern = /\([ぁ-ゖー]+(?:[・\s][ぁ-ゖー]+)*\)/;
if (
  generatedQuestions.some((question) =>
    readingPattern.test(getQuestionPromptForDisplay(question, false)),
  ) ||
  generatedQuestions.some(
    (question) => getQuestionPromptForDisplay(question, true) !== question.prompt,
  ) ||
  generatedQuestions.some((question) =>
    [...question.keywords, ...question.acceptedAnswers].some((value) =>
      readingPattern.test(value),
    ),
  )
) {
  throw new Error("問題文の読み仮名を回答前だけ隠すためのデータが正しくありません。");
}

if (subject.sourceFile !== path.basename(sourcePath)) {
  throw new Error("科目情報の元ファイル名が一致しません。");
}
if (
  subject.chunks.length !== 8 ||
  subject.chunks.some((chunk) => chunk.count !== 50)
) {
  throw new Error("400用語が50語ずつ8個へ正しく分割されていません。");
}

const questionIds = generatedQuestions.map((question) => question.id);
if (new Set(questionIds).size !== questionIds.length) {
  throw new Error("生成後の問題IDが重複しています。");
}

console.log(
  `検証完了: Deck 1・400用語・2782問（短答1200、逆一問一答1182、統合説明400）・語呂合わせ${mnemonicQuestions.length}問・関連画像${generatedTermImages.assets.length}点`,
);
