import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { questionTypes } from "../public/question-types.js";

export async function loadSOQuestionTypes() {
  const rows = JSON.parse(await readFile(new URL("../data/source/world-history-so/question-types.json", import.meta.url), "utf8"));
  const assignments = new Map();
  for (const row of rows) {
    assert.ok(row.id && row.prompt && Object.hasOwn(questionTypes, row.type), "問題分類の番号・問題文・種類を確認してください。");
    assert.ok(!assignments.has(row.id), "問題分類の番号が重複しています。");
    assignments.set(row.id, row);
  }
  return assignments;
}

export function applySOQuestionTypes(terms, assignments) {
  const seen = new Set();
  for (const term of terms) for (const questions of Object.values(term.stages ?? {})) for (const question of questions) {
    const assignment = assignments.get(question.id);
    assert.ok(assignment, `分類のない問題です: ${question.id} ${question.prompt}`);
    assert.equal(assignment.prompt, question.prompt, `分類後に問題文が変更されています: ${question.id}`);
    assert.ok(!seen.has(question.id), "問題番号が重複しています。");
    question.type = assignment.type;
    seen.add(question.id);
  }
  return seen;
}
