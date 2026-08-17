import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = path.join(projectRoot, "public", "data");
const readJson = async (relativePath) =>
  JSON.parse(await readFile(path.join(dataRoot, relativePath), "utf8"));

const catalog = await readJson("index.json");
if (catalog.subjects.length !== 1) {
  throw new Error("科目一覧が想定どおりではありません。");
}

const subject = await readJson(catalog.subjects[0].indexPath);
const chunks = await Promise.all(subject.chunks.map((chunk) => readJson(chunk.path)));
const terms = chunks.flatMap((chunk) => chunk.terms);
const questionCount = terms.reduce((sum, term) => sum + term.questions.length, 0);

if (terms.length !== subject.termCount || terms.length !== 100) {
  throw new Error(`用語数が一致しません: ${terms.length}/${subject.termCount}`);
}
if (questionCount !== subject.questionCount || questionCount !== 400) {
  throw new Error(`質問数が一致しません: ${questionCount}/${subject.questionCount}`);
}
if (terms.some((term) => term.questions.length === 0)) {
  throw new Error("質問のない用語があります。");
}
if (terms.some((term) => !term.integrated.explanation)) {
  throw new Error("統合説明のない用語があります。");
}

console.log(`検証完了: ${terms.length}用語・${questionCount}問`);
