import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const sourceDirectory = path.join(projectRoot, "data", "source", "world-history");
const outputRoot = path.join(projectRoot, "public", "data");
const subjectId = "world-history";
const subjectTitle = "世界史";
const chunkSize = 50;
const schemaVersion = 3;
const masteryTarget = 2;

export const requiredHeaders = [
  "dataset_label",
  "term_id",
  "importance_rank",
  "difficulty_label",
  "category",
  "term",
  "reading",
  "aliases",
  "era",
  "macro_region",
  "region_detail",
  "display_period",
  "sort_year",
  "question_id",
  "stage",
  "focus",
  "question_type",
  "question",
  "answer",
  "keywords",
  "accepted_answers",
  "answer_note",
  "source_name",
  "source_url",
];

const termFields = requiredHeaders.slice(0, 13);
const requiredTermFields = termFields.filter((fieldName) => fieldName !== "aliases");
const allowedStages = ["beginner", "reverse", "integrated"];
const allowedQuestionTypes = new Set([
  "identify",
  "time",
  "place",
  "person",
  "actor",
  "cause",
  "content",
  "result",
  "relation",
  "reverse",
  "integrated",
]);

const questionTypeLabels = {
  identify: "用語",
  time: "時期",
  place: "場所",
  person: "人物",
  actor: "主体",
  cause: "原因",
  content: "内容",
  result: "結果",
  relation: "関連",
  reverse: "逆一問一答",
  integrated: "統合説明",
};

export async function findSourcePath() {
  const entries = await readdir(sourceDirectory, { withFileTypes: true });
  const csvFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".csv"))
    .map((entry) => entry.name)
    .sort();

  if (csvFiles.length !== 1) {
    throw new Error(
      `世界史の元CSVは1ファイルだけ配置してください（現在${csvFiles.length}ファイル）。`,
    );
  }
  return path.join(sourceDirectory, csvFiles[0]);
}

export function parseCsv(text) {
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

export function toObjects(rows) {
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
  if (
    headers.length !== requiredHeaders.length ||
    headers.some((header, index) => header !== requiredHeaders[index])
  ) {
    throw new Error("CSVの見出しまたは並び順が新しい24列形式と一致しません。");
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

function splitPipeList(value) {
  return String(value ?? "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseInteger(value, fieldName, rowNumber) {
  if (!/^-?\d+$/.test(value)) {
    throw new Error(`${rowNumber}行目の${fieldName}は整数で入力してください。`);
  }
  return Number(value);
}

function assertRequiredText(row, fieldName, rowNumber) {
  if (!row[fieldName]) {
    throw new Error(`${rowNumber}行目の${fieldName}が空欄です。`);
  }
}

function assertBalancedBold(text, fieldName, rowNumber) {
  const markerCount = text.match(/\*\*/g)?.length ?? 0;
  if (markerCount % 2 !== 0) {
    throw new Error(`${rowNumber}行目の${fieldName}で太字記号が閉じられていません。`);
  }
}

function normalizeSource(row) {
  return { name: row.source_name, url: row.source_url };
}

export function normalizeQuestion(row, rowIndex) {
  const rowNumber = rowIndex + 2;
  [
    ...requiredTermFields,
    "question_id",
    "stage",
    "focus",
    "question_type",
    "question",
    "answer",
    "keywords",
    "source_name",
    "source_url",
  ].forEach((fieldName) => assertRequiredText(row, fieldName, rowNumber));

  if (!allowedStages.includes(row.stage)) {
    throw new Error(`${rowNumber}行目のstageが正しくありません: ${row.stage}`);
  }
  if (!allowedQuestionTypes.has(row.question_type)) {
    throw new Error(
      `${rowNumber}行目のquestion_typeが正しくありません: ${row.question_type}`,
    );
  }
  if (row.stage === "reverse" && row.question_type !== "reverse") {
    throw new Error(`${rowNumber}行目の逆一問一答はquestion_typeをreverseにしてください。`);
  }
  if (row.stage === "integrated" && row.question_type !== "integrated") {
    throw new Error(`${rowNumber}行目の統合説明はquestion_typeをintegratedにしてください。`);
  }
  if (row.stage === "beginner" && ["reverse", "integrated"].includes(row.question_type)) {
    throw new Error(`${rowNumber}行目の短答問題に段階と異なる種類が設定されています。`);
  }
  if (!/^https:\/\//.test(row.source_url)) {
    throw new Error(`${rowNumber}行目のsource_urlはhttpsのURLにしてください。`);
  }
  assertBalancedBold(row.answer, "answer", rowNumber);

  return {
    id: row.question_id,
    stage: row.stage,
    focus: row.focus,
    type: row.question_type,
    label: questionTypeLabels[row.question_type] ?? row.focus,
    prompt: row.question,
    answer: row.answer,
    keywords: splitPipeList(row.keywords),
    acceptedAnswers: splitPipeList(row.accepted_answers),
    answerNote: row.answer_note,
    source: normalizeSource(row),
  };
}

function assertSameTermData(firstRow, row, rowNumber) {
  for (const fieldName of termFields) {
    if (row[fieldName] !== firstRow[fieldName]) {
      throw new Error(
        `${rowNumber}行目の${fieldName}が同じ用語のほかの行と一致しません。`,
      );
    }
  }
  if (row.source_name !== firstRow.source_name || row.source_url !== firstRow.source_url) {
    throw new Error(`${rowNumber}行目の出典が同じ用語のほかの行と一致しません。`);
  }
}

export function groupTerms(rows) {
  const groups = [];
  const groupById = new Map();
  const questionIds = new Set();

  rows.forEach((row, rowIndex) => {
    if (questionIds.has(row.question_id)) {
      throw new Error(`問題IDが重複しています: ${row.question_id}`);
    }
    questionIds.add(row.question_id);

    let group = groupById.get(row.term_id);
    if (!group) {
      group = { firstRow: row, rows: [] };
      groupById.set(row.term_id, group);
      groups.push(group);
    } else {
      assertSameTermData(group.firstRow, row, rowIndex + 2);
    }
    group.rows.push({ row, rowIndex });
  });

  return groups.map(({ firstRow, rows: termRows }) => {
    const seenStages = termRows.map(({ row }) => allowedStages.indexOf(row.stage));
    if (seenStages.some((stage, index) => index > 0 && seenStages[index - 1] > stage)) {
      throw new Error(`${firstRow.term}の問題が短答・逆一問一答・統合説明の順ではありません。`);
    }

    const stages = Object.fromEntries(allowedStages.map((stage) => [stage, []]));
    termRows.forEach(({ row, rowIndex }) => {
      stages[row.stage].push(normalizeQuestion(row, rowIndex));
    });
    if (stages.beginner.length === 0 || stages.reverse.length === 0) {
      throw new Error(`${firstRow.term}に短答または逆一問一答がありません。`);
    }
    if (stages.integrated.length !== 1) {
      throw new Error(`${firstRow.term}の統合説明は1問にしてください。`);
    }

    return {
      id: firstRow.term_id,
      datasetLabel: firstRow.dataset_label,
      importanceRank: parseInteger(
        firstRow.importance_rank,
        "importance_rank",
        termRows[0].rowIndex + 2,
      ),
      difficultyLabel: firstRow.difficulty_label,
      category: firstRow.category,
      term: firstRow.term,
      reading: firstRow.reading,
      aliases: splitPipeList(firstRow.aliases),
      era: firstRow.era,
      geography: {
        macroRegion: firstRow.macro_region,
        regionDetail: firstRow.region_detail,
      },
      chronology: {
        displayPeriod: firstRow.display_period,
        sortYear: parseInteger(
          firstRow.sort_year,
          "sort_year",
          termRows[0].rowIndex + 2,
        ),
      },
      stages,
      source: normalizeSource(firstRow),
    };
  });
}

function assertUnique(terms, selector, label) {
  const seen = new Set();
  for (const term of terms) {
    const value = selector(term);
    if (seen.has(value)) {
      throw new Error(`${label}が重複しています: ${value}`);
    }
    seen.add(value);
  }
}

export function validateTerms(terms) {
  assertUnique(terms, (term) => term.id, "用語ID");
  assertUnique(terms, (term) => term.term, "用語名");
  assertUnique(terms, (term) => term.importanceRank, "重要度順位");

  const ranks = terms
    .map((term) => term.importanceRank)
    .sort((left, right) => left - right);
  if (ranks.some((rank, index) => rank !== index + 1)) {
    throw new Error("重要度順位は1から用語数までの連番にしてください。");
  }
  if (
    terms.some(
      (term, index) =>
        index > 0 && terms[index - 1].chronology.sortYear > term.chronology.sortYear,
    )
  ) {
    throw new Error("CSVの用語がsort_yearの古い順に並んでいません。");
  }
}

export function countQuestionsByStage(terms) {
  return Object.fromEntries(
    allowedStages.map((stage) => [
      stage,
      terms.reduce((sum, term) => sum + term.stages[stage].length, 0),
    ]),
  );
}

async function writeJson(targetPath, value) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(value)}\n`, "utf8");
}

export async function main() {
  const sourcePath = await findSourcePath();
  const sourceText = await readFile(sourcePath, "utf8");
  const terms = groupTerms(toObjects(parseCsv(sourceText)));
  validateTerms(terms);

  const version = createHash("sha256").update(sourceText).digest("hex").slice(0, 12);
  const relativeOutput = path.relative(projectRoot, outputRoot);
  if (!relativeOutput || relativeOutput.startsWith("..") || path.isAbsolute(relativeOutput)) {
    throw new Error("出力先が作業フォルダー内ではありません。");
  }
  await rm(outputRoot, { recursive: true, force: true });

  const chunks = [];
  for (let offset = 0; offset < terms.length; offset += chunkSize) {
    const chunkNumber = chunks.length + 1;
    const fileName = `${String(chunkNumber).padStart(4, "0")}.json`;
    const relativePath = `subjects/${subjectId}/chunks/${fileName}`;
    const chunkTerms = terms.slice(offset, offset + chunkSize);
    await writeJson(path.join(outputRoot, relativePath), {
      schemaVersion,
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

  const questionCounts = countQuestionsByStage(terms);
  const questionCount = Object.values(questionCounts).reduce((sum, count) => sum + count, 0);
  const datasetLabel = terms[0].datasetLabel;
  const subjectIndexPath = `subjects/${subjectId}/index.json`;
  await writeJson(path.join(outputRoot, subjectIndexPath), {
    schemaVersion,
    id: subjectId,
    title: subjectTitle,
    datasetLabel,
    description: "短答から逆一問一答、統合説明へ進む大学受験世界史データ",
    version,
    sourceFile: path.basename(sourcePath),
    termCount: terms.length,
    questionCount,
    questionCounts,
    masteryTarget,
    chunks,
  });

  await writeJson(path.join(outputRoot, "index.json"), {
    schemaVersion,
    version,
    subjects: [
      {
        id: subjectId,
        title: subjectTitle,
        datasetLabel,
        termCount: terms.length,
        questionCount,
        indexPath: subjectIndexPath,
      },
    ],
  });

  console.log(
    `${terms.length}用語・${questionCount}問（短答${questionCounts.beginner}、逆一問一答${questionCounts.reverse}、統合説明${questionCounts.integrated}）を${chunks.length}個に分割しました。`,
  );
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main();
}
