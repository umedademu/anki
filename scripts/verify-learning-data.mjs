import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  findSourcePath,
  getQuestionNumbers,
  normalizeTerm,
  parseCsv,
  toObjects,
} from "./build-learning-data.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = path.join(projectRoot, "public", "data");
const readJson = async (relativePath) =>
  JSON.parse(await readFile(path.join(dataRoot, relativePath), "utf8"));

const sourcePath = await findSourcePath();
const sourceRows = toObjects(parseCsv(await readFile(sourcePath, "utf8")));
const questionNumbers = getQuestionNumbers(Object.keys(sourceRows[0]));
const expectedTerms = sourceRows.map((row, index) =>
  normalizeTerm(row, index, questionNumbers),
);
const expectedQuestionCount = expectedTerms.reduce(
  (sum, term) => sum + term.questions.length,
  0,
);

const catalog = await readJson("index.json");
if (catalog.schemaVersion !== 2 || catalog.subjects.length !== 1) {
  throw new Error("科目一覧の形式が想定どおりではありません。");
}

const subject = await readJson(catalog.subjects[0].indexPath);
const chunks = await Promise.all(subject.chunks.map((chunk) => readJson(chunk.path)));
if (chunks.some((chunk) => chunk.schemaVersion !== 2)) {
  throw new Error("旧形式の分割データが残っています。");
}

const generatedTerms = chunks.flatMap((chunk) => chunk.terms);
const generatedQuestionCount = generatedTerms.reduce(
  (sum, term) => sum + term.questions.length,
  0,
);

if (generatedTerms.length !== subject.termCount) {
  throw new Error(`用語数が科目情報と一致しません: ${generatedTerms.length}/${subject.termCount}`);
}
if (generatedQuestionCount !== subject.questionCount) {
  throw new Error(
    `質問数が科目情報と一致しません: ${generatedQuestionCount}/${subject.questionCount}`,
  );
}
if (
  generatedTerms.length !== expectedTerms.length ||
  generatedQuestionCount !== expectedQuestionCount
) {
  throw new Error("元CSVと生成データの件数が一致しません。");
}
if (JSON.stringify(generatedTerms) !== JSON.stringify(expectedTerms)) {
  throw new Error("元CSVの内容が生成データへ正確に反映されていません。");
}
if (subject.sourceFile !== path.basename(sourcePath)) {
  throw new Error("科目情報の元ファイル名が一致しません。");
}

console.log(
  `検証完了: ${generatedTerms.length}用語・${generatedQuestionCount}問・新形式`,
);
