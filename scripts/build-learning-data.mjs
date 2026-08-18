import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const sourceDirectory = path.join(
  projectRoot,
  "data",
  "source",
  "world-history",
);
const outputRoot = path.join(projectRoot, "public", "data");
const subjectId = "world-history";
const subjectTitle = "世界史";
const chunkSize = 50;
const schemaVersion = 2;

const requiredHeaders = [
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
  "date_basis",
  "display_period",
  "start_year",
  "end_year",
  "sort_year",
  "date_precision",
  "date_note",
  "question_count",
  "integrated_question",
  "total_explanation",
  "total_keywords",
  "relation_edges",
  "source_1",
  "source_2",
  "verification_status",
];

const questionTypeLabels = {
  time: "時期",
  place: "場所",
  core: "要点",
  cause: "原因",
  content: "内容",
  impact: "影響",
  definition: "定義",
  connection: "つながり",
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

  const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
  if (missingHeaders.length > 0) {
    throw new Error(`CSVの必須列がありません: ${missingHeaders.join(", ")}`);
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

export function getQuestionNumbers(headers) {
  return headers
    .map((header) => /^q(\d+)_question$/.exec(header))
    .filter(Boolean)
    .map((match) => Number(match[1]))
    .sort((left, right) => left - right);
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

function parseRelations(value, rowNumber) {
  return String(value ?? "")
    .split("||")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const separatorIndex = item.indexOf(">");
      if (separatorIndex <= 0 || separatorIndex === item.length - 1) {
        throw new Error(`${rowNumber}行目のrelation_edgesの書式が正しくありません。`);
      }
      return {
        type: item.slice(0, separatorIndex).trim(),
        term: item.slice(separatorIndex + 1).trim(),
      };
    });
}

function parseSource(value) {
  if (!value) {
    return null;
  }
  const separatorIndex = value.indexOf("｜");
  if (separatorIndex < 0) {
    return { label: value, url: "" };
  }
  return {
    label: value.slice(0, separatorIndex).trim(),
    url: value.slice(separatorIndex + 1).trim(),
  };
}

export function normalizeTerm(row, rowIndex, questionNumbers) {
  const rowNumber = rowIndex + 2;
  [
    "dataset_label",
    "term_id",
    "importance_rank",
    "difficulty_label",
    "category",
    "term",
    "reading",
    "era",
    "macro_region",
    "region_detail",
    "date_basis",
    "display_period",
    "start_year",
    "end_year",
    "sort_year",
    "date_precision",
    "date_note",
    "question_count",
    "integrated_question",
    "total_explanation",
    "verification_status",
  ].forEach((fieldName) => assertRequiredText(row, fieldName, rowNumber));

  const questions = questionNumbers.flatMap((number) => {
    const type = row[`q${number}_type`] ?? "";
    const prompt = row[`q${number}_question`] ?? "";
    const answer = row[`q${number}_answer`] ?? "";
    const keywords = row[`q${number}_keywords`] ?? "";

    if (!type && !prompt && !answer && !keywords) {
      return [];
    }
    if (!type || !prompt || !answer) {
      throw new Error(
        `${rowNumber}行目の質問${number}は、種類・質問・答えをすべて入力してください。`,
      );
    }

    assertBalancedBold(answer, `q${number}_answer`, rowNumber);
    return [
      {
        number,
        type,
        label: questionTypeLabels[type] ?? type,
        prompt,
        answer,
        keywords: splitPipeList(keywords),
      },
    ];
  });

  const declaredQuestionCount = parseInteger(
    row.question_count,
    "question_count",
    rowNumber,
  );
  if (declaredQuestionCount !== questions.length) {
    throw new Error(
      `${rowNumber}行目のquestion_countと実際の質問数が一致しません（${declaredQuestionCount}/${questions.length}）。`,
    );
  }
  if (questions.length === 0) {
    throw new Error(`${rowNumber}行目に質問がありません。`);
  }

  const startYear = parseInteger(row.start_year, "start_year", rowNumber);
  const endYear = parseInteger(row.end_year, "end_year", rowNumber);
  const sortYear = parseInteger(row.sort_year, "sort_year", rowNumber);
  if (startYear > endYear) {
    throw new Error(`${rowNumber}行目の開始年が終了年より後になっています。`);
  }

  assertBalancedBold(row.total_explanation, "total_explanation", rowNumber);
  const sources = [parseSource(row.source_1), parseSource(row.source_2)].filter(Boolean);

  return {
    id: row.term_id,
    datasetLabel: row.dataset_label,
    importanceRank: parseInteger(row.importance_rank, "importance_rank", rowNumber),
    difficultyLabel: row.difficulty_label,
    category: row.category,
    term: row.term,
    reading: row.reading,
    aliases: splitPipeList(row.aliases),
    era: row.era,
    geography: {
      macroRegion: row.macro_region,
      regionDetail: row.region_detail,
    },
    chronology: {
      basis: row.date_basis,
      displayPeriod: row.display_period,
      startYear,
      endYear,
      sortYear,
      precision: row.date_precision,
      note: row.date_note,
    },
    questions,
    integrated: {
      prompt: row.integrated_question,
      explanation: row.total_explanation,
      keywords: splitPipeList(row.total_keywords),
    },
    relations: parseRelations(row.relation_edges, rowNumber),
    sources,
    verificationStatus: row.verification_status,
  };
}

function assertUnique(terms, fieldName, label) {
  const seen = new Set();
  for (const term of terms) {
    if (seen.has(term[fieldName])) {
      throw new Error(`${label}が重複しています: ${term[fieldName]}`);
    }
    seen.add(term[fieldName]);
  }
}

async function writeJson(targetPath, value) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(value)}\n`, "utf8");
}

export async function main() {
  const sourcePath = await findSourcePath();
  const sourceText = await readFile(sourcePath, "utf8");
  const csvRows = parseCsv(sourceText);
  const sourceRows = toObjects(csvRows);
  const questionNumbers = getQuestionNumbers(Object.keys(sourceRows[0]));

  if (questionNumbers.length === 0) {
    throw new Error("q1_questionのような質問列がありません。");
  }

  const terms = sourceRows.map((row, index) =>
    normalizeTerm(row, index, questionNumbers),
  );
  assertUnique(terms, "id", "用語ID");
  assertUnique(terms, "term", "用語名");
  assertUnique(terms, "importanceRank", "重要度順位");

  const importanceRanks = terms
    .map((term) => term.importanceRank)
    .sort((left, right) => left - right);
  if (importanceRanks.some((rank, index) => rank !== index + 1)) {
    throw new Error("重要度順位は1から用語数までの連番にしてください。");
  }
  if (
    terms.some(
      (term, index) =>
        index > 0 && terms[index - 1].chronology.sortYear > term.chronology.sortYear,
    )
  ) {
    throw new Error("CSVの行がsort_yearの古い順に並んでいません。");
  }

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

  const questionCount = terms.reduce((sum, term) => sum + term.questions.length, 0);
  const datasetLabel = terms[0].datasetLabel;
  const subjectIndexPath = `subjects/${subjectId}/index.json`;
  await writeJson(path.join(outputRoot, subjectIndexPath), {
    schemaVersion,
    id: subjectId,
    title: subjectTitle,
    datasetLabel,
    description: "大学受験で特に重要な用語を、複数の問いと統合説明で学ぶ世界史データ",
    version,
    sourceFile: path.basename(sourcePath),
    termCount: terms.length,
    questionCount,
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

  console.log(`${terms.length}用語・${questionCount}問を${chunks.length}個に分割しました。`);
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main();
}
