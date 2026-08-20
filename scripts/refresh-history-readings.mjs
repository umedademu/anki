import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseCsv,
  requiredHeaders,
  toObjects,
} from "./build-learning-data.mjs";
import {
  addRequiredReadings,
  requiredHistoryReadings,
} from "../public/reading-rules.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const relativeSourcePath =
  "data/source/world-history/world_history_university_essential_300_terms.csv";
const sourcePath = path.join(projectRoot, relativeSourcePath);
const readFromHead = process.argv.includes("--from-head");

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function removeBold(text) {
  return String(text ?? "").replaceAll("**", "");
}

function addDirectTermReading(row, answer) {
  const plainAnswer = removeBold(answer);
  const isSingleHan = /^[\p{Script=Han}々ヶ]$/u.test(row.term);
  const isRequiredTerm = Object.hasOwn(requiredHistoryReadings, row.term);
  if (
    plainAnswer === row.term &&
    row.reading &&
    !plainAnswer.includes("(") &&
    (isSingleHan || isRequiredTerm)
  ) {
    return `${row.term}(${row.reading})`;
  }
  return answer;
}

const sourceText = readFromHead
  ? execFileSync(
      "git",
      ["show", `HEAD:${relativeSourcePath.replaceAll("\\", "/")}`],
      { cwd: projectRoot, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
    )
  : await readFile(sourcePath, "utf8");

const rows = toObjects(parseCsv(sourceText));
let changedRows = 0;
let changedCells = 0;

for (const row of rows) {
  let rowChanged = false;
  for (const fieldName of ["question", "answer"]) {
    const before = row[fieldName];
    let after = addRequiredReadings(before);
    if (fieldName === "answer") {
      after = addDirectTermReading(row, after);
    }
    if (after !== before) {
      row[fieldName] = after;
      changedCells += 1;
      rowChanged = true;
    }
  }
  if (rowChanged) {
    changedRows += 1;
  }
}

const lines = [
  requiredHeaders.map(csvCell).join(","),
  ...rows.map((row) => requiredHeaders.map((header) => csvCell(row[header])).join(",")),
];
await writeFile(sourcePath, `\uFEFF${lines.join("\r\n")}\r\n`, "utf8");

console.log(
  `読み仮名を再点検しました: ${rows.length}問、${changedRows}行、${changedCells}セルを更新`,
);
