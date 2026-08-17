import {
  getQuestionNumbers,
  normalizeTerm,
  parseCsv,
  toObjects,
} from "./build-learning-data.mjs";

const sample = [
  "term_id,term,question_1,answer_1,question_2,answer_2,question_3,answer_3,question_4,answer_4,question_5,answer_5",
  "1,五問ある用語,問1,答1,問2,答2,問3,答3,問4,答4,問5,答5",
  "2,三問ある用語,問1,答1,問2,答2,問3,答3,,,,",
].join("\n");
const rows = toObjects(parseCsv(sample));
const questionNumbers = getQuestionNumbers(Object.keys(rows[0]));
const terms = rows.map((row, index) => normalizeTerm(row, index, questionNumbers));

if (terms[0].questions.length !== 5 || terms[1].questions.length !== 3) {
  throw new Error("用語ごとの質問数を正しく認識できませんでした。");
}

console.log("可変質問数の検証完了: 5問と3問を正しく認識");
