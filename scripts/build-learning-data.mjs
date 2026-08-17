import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const sourcePath = path.join(
  projectRoot,
  "data",
  "source",
  "world-history",
  "world_history_skeleton_100.csv",
);
const outputRoot = path.join(projectRoot, "public", "data");
const subjectId = "world-history";
const subjectTitle = "世界史";
const chunkSize = 50;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inQuotes) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        inQuotes = false;
      } else {
        value += character;
      }
      continue;
    }

    if (character === '"') {
      inQuotes = true;
    } else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n") {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (inQuotes) {
    throw new Error("CSV内の引用符が閉じられていません。");
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

function toObjects(rows) {
  if (rows.length < 2) {
    throw new Error("CSVに見出し行とデータ行が必要です。");
  }

  const headers = rows[0].map((header, index) =>
    index === 0 ? header.replace(/^\uFEFF/, "").trim() : header.trim(),
  );
  const duplicateHeaders = headers.filter(
    (header, index) => headers.indexOf(header) !== index,
  );

  if (duplicateHeaders.length > 0) {
    throw new Error(`CSVの見出しが重複しています: ${duplicateHeaders.join(", ")}`);
  }

  return rows.slice(1).map((cells, rowIndex) => {
    if (cells.length !== headers.length) {
      throw new Error(
        `${rowIndex + 2}行目の列数が見出しと一致しません（${cells.length}/${headers.length}）。`,
      );
    }

    return Object.fromEntries(
      headers.map((header, columnIndex) => [header, cells[columnIndex].trim()]),
    );
  });
}

function getQuestionNumbers(headers) {
  return headers
    .map((header) => /^question_(\d+)$/.exec(header))
    .filter(Boolean)
    .map((match) => Number(match[1]))
    .sort((left, right) => left - right);
}

function normalizeTerm(row, rowIndex, questionNumbers) {
  if (!row.term_id || !row.term) {
    throw new Error(`${rowIndex + 2}行目にterm_idまたはtermがありません。`);
  }

  const questions = questionNumbers.flatMap((number) => {
    const prompt = row[`question_${number}`] ?? "";
    const answer = row[`answer_${number}`] ?? "";

    if (!prompt && !answer) {
      return [];
    }
    if (!prompt || !answer) {
      throw new Error(
        `${rowIndex + 2}行目の質問${number}は、質問と答えを両方入力してください。`,
      );
    }

    return [
      {
        number,
        axis: row[`q${number}_axis`] ?? "",
        prompt,
        answer,
      },
    ];
  });

  if (questions.length === 0) {
    throw new Error(`${rowIndex + 2}行目に質問がありません。`);
  }

  return {
    id: `${subjectId}-${row.term_id}`,
    sourceId: row.term_id,
    term: row.term,
    type: row.term_type,
    level: row.level,
    unit: row.unit,
    period: row.period,
    region: row.region,
    questions,
    integrated: {
      prompt: row.integrated_question,
      explanation: row.total_explanation,
    },
    keywords: (row.core_keywords ?? "")
      .split(/[;；]/)
      .map((keyword) => keyword.trim())
      .filter(Boolean),
  };
}

async function writeJson(targetPath, value) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(value)}\n`, "utf8");
}

export async function main() {
  const sourceText = await readFile(sourcePath, "utf8");
  const csvRows = parseCsv(sourceText);
  const sourceRows = toObjects(csvRows);
  const questionNumbers = getQuestionNumbers(Object.keys(sourceRows[0]));

  if (questionNumbers.length === 0) {
    throw new Error("question_1のような質問列がありません。");
  }

  const terms = sourceRows.map((row, index) =>
    normalizeTerm(row, index, questionNumbers),
  );
  const version = createHash("sha256").update(sourceText).digest("hex").slice(0, 12);
  const relativeOutput = path.relative(projectRoot, outputRoot);

  if (!relativeOutput || relativeOutput.startsWith("..") || path.isAbsolute(relativeOutput)) {
    throw new Error("出力先が作業フォルダ内ではありません。");
  }

  await rm(outputRoot, { recursive: true, force: true });

  const chunks = [];
  for (let offset = 0; offset < terms.length; offset += chunkSize) {
    const chunkNumber = chunks.length + 1;
    const fileName = `${String(chunkNumber).padStart(4, "0")}.json`;
    const relativePath = `subjects/${subjectId}/chunks/${fileName}`;
    const chunkTerms = terms.slice(offset, offset + chunkSize);

    await writeJson(path.join(outputRoot, relativePath), {
      subjectId,
      chunkNumber,
      terms: chunkTerms,
    });

    chunks.push({
      number: chunkNumber,
      path: relativePath,
      count: chunkTerms.length,
      firstTerm: chunkTerms[0].term,
      lastTerm: chunkTerms.at(-1).term,
    });
  }

  const subjectIndexPath = `subjects/${subjectId}/index.json`;
  await writeJson(path.join(outputRoot, subjectIndexPath), {
    id: subjectId,
    title: subjectTitle,
    description: "用語から複数の問いをたどり、最後に知識を統合する世界史学習データ",
    version,
    termCount: terms.length,
    questionCount: terms.reduce((sum, term) => sum + term.questions.length, 0),
    chunks,
  });

  await writeJson(path.join(outputRoot, "index.json"), {
    version,
    subjects: [
      {
        id: subjectId,
        title: subjectTitle,
        termCount: terms.length,
        indexPath: subjectIndexPath,
      },
    ],
  });

  console.log(
    `${terms.length}用語・${terms.reduce((sum, term) => sum + term.questions.length, 0)}問を${chunks.length}個に分割しました。`,
  );
}

export { getQuestionNumbers, normalizeTerm, parseCsv, toObjects };

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main();
}
