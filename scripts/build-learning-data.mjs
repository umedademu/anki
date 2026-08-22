import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const sourceDirectory = path.join(projectRoot, "data", "source", "world-history");
const englishSourceDirectory = path.join(
  projectRoot,
  "data",
  "source",
  "english-vocabulary",
);
const japaneseSourceDirectory = path.join(
  projectRoot,
  "data",
  "source",
  "japanese-history",
);
const outputRoot = path.join(projectRoot, "public", "data");
const termImageManifestPath = path.join(sourceDirectory, "term-images.json");
const termImageSourceDirectory = path.join(sourceDirectory, "term-images");
const japaneseTermImageManifestPath = path.join(
  japaneseSourceDirectory,
  "term-images.json",
);
const japaneseTermImageSourceDirectory = path.join(
  japaneseSourceDirectory,
  "term-images",
);
const subjectId = "world-history";
const subjectTitle = "世界史";
const japaneseSubjectId = "japanese-history";
const japaneseSubjectTitle = "日本史";
const englishSubjectId = "english-vocabulary";
const englishSubjectTitle = "英単語";
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
  "year_mnemonic",
  "source_name",
  "source_url",
];

export const englishRequiredHeaders = [
  "dataset_label",
  "term_id",
  "importance_rank",
  "difficulty_label",
  "word",
  "part_of_speech",
  "meaning",
  "accepted_answers",
  "example_sentence",
  "example_translation",
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

export async function findSourcePaths() {
  return findHistorySourcePaths(sourceDirectory, "世界史");
}

async function findHistorySourcePaths(targetDirectory, subjectLabel) {
  const entries = await readdir(targetDirectory, { withFileTypes: true });
  const csvFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".csv"))
    .map((entry) => entry.name)
    .sort();

  if (csvFiles.length === 0) {
    throw new Error(`${subjectLabel}の元CSVがありません。`);
  }
  return csvFiles.map((fileName) => path.join(targetDirectory, fileName));
}

export async function findJapaneseHistorySourcePaths() {
  return findHistorySourcePaths(japaneseSourceDirectory, "日本史");
}

export async function findSourcePath() {
  const sourcePaths = await findSourcePaths();
  if (sourcePaths.length !== 1) {
    throw new Error(
      `世界史の元CSVが複数あります。findSourcePathsを使用してください（現在${sourcePaths.length}ファイル）。`,
    );
  }
  return sourcePaths[0];
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
    throw new Error("CSVの見出しまたは並び順が新しい25列形式と一致しません。");
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
  if (row.stage === "integrated" && row.question_type !== "integrated") {
    throw new Error(`${rowNumber}行目の統合説明はquestion_typeをintegratedにしてください。`);
  }
  if (row.stage !== "integrated" && row.question_type === "integrated") {
    throw new Error(`${rowNumber}行目の統合説明以外にintegratedは指定できません。`);
  }
  if (row.stage === "beginner" && row.question_type === "reverse") {
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
    yearMnemonic: row.year_mnemonic,
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

export function validateTerms(terms, { rankStart = 1 } = {}) {
  assertUnique(terms, (term) => term.id, "用語ID");
  assertUnique(terms, (term) => term.term, "用語名");
  assertUnique(terms, (term) => term.importanceRank, "重要度順位");
  assertUnique(
    terms.flatMap((term) => Object.values(term.stages).flat()),
    (question) => question.id,
    "問題ID",
  );

  for (const term of terms) {
    const contextMissingQuestions = term.stages.beginner.filter(
      (question) =>
        question.type !== "identify" && !question.prompt.includes(term.term),
    );
    if (contextMissingQuestions.length > 0) {
      throw new Error(
        `${term.term}の短答問題に対象語がありません: ${contextMissingQuestions
          .map((question) => question.id)
          .join(", ")}`,
      );
    }

    const exactDatePattern = /^(?:紀元前|前)?\d{1,4}年(?:\d{1,2}月(?:\d{1,2}日)?)?$/;
    const exactDateQuestions = Object.values(term.stages)
      .flat()
      .filter((question) =>
        exactDatePattern.test(question.answer.replaceAll("**", "").trim()),
      );
    if (exactDateQuestions.length > 0) {
      const mnemonicsByAnswer = new Map();
      for (const question of exactDateQuestions) {
        const answer = question.answer.replaceAll("**", "").trim();
        const mnemonics = mnemonicsByAnswer.get(answer) ?? new Set();
        mnemonics.add(question.yearMnemonic.trim());
        mnemonicsByAnswer.set(answer, mnemonics);
      }
      if (
        exactDateQuestions.some((question) => !question.yearMnemonic.trim()) ||
        [...mnemonicsByAnswer.values()].some(
          (mnemonics) => mnemonics.size !== 1 || mnemonics.has(""),
        )
      ) {
        throw new Error(
          `${term.term}の同じ単一年・年月・年月日の問題に、統一した年号語呂合わせがありません。`,
        );
      }
      const integratedMnemonics = new Set(
        term.stages.integrated[0].yearMnemonic
          .split("|")
          .map((mnemonic) => mnemonic.trim())
          .filter(Boolean),
      );
      if (
        [...mnemonicsByAnswer.values()].some(
          (mnemonics) =>
            !splitPipeList([...mnemonics][0]).every((mnemonic) =>
              integratedMnemonics.has(mnemonic),
            ),
        )
      ) {
        throw new Error(
          `${term.term}の統合説明に、年号問題と同じ語呂合わせがありません。`,
        );
      }
    }

    const datedPeriodQuestions = Object.values(term.stages)
      .flat()
      .filter(
        (question) =>
          question.type === "time" &&
          /\d/.test(question.answer.replaceAll("**", "").trim()),
      );
    if (datedPeriodQuestions.length > 0) {
      const mnemonicsByAnswer = new Map();
      for (const question of datedPeriodQuestions) {
        const answer = question.answer.replaceAll("**", "").trim();
        const mnemonics = mnemonicsByAnswer.get(answer) ?? new Set();
        mnemonics.add(question.yearMnemonic.trim());
        mnemonicsByAnswer.set(answer, mnemonics);
      }
      if (
        datedPeriodQuestions.some((question) => !question.yearMnemonic.trim()) ||
        [...mnemonicsByAnswer.values()].some(
          (mnemonics) => mnemonics.size !== 1 || mnemonics.has(""),
        )
      ) {
        throw new Error(
          `${term.term}の数字を含む時期問題に、統一した年号語呂合わせがありません。`,
        );
      }
      const integratedMnemonics = new Set(
        term.stages.integrated[0].yearMnemonic
          .split("|")
          .map((mnemonic) => mnemonic.trim())
          .filter(Boolean),
      );
      if (
        [...mnemonicsByAnswer.values()].some(
          (mnemonics) =>
            !splitPipeList([...mnemonics][0]).every((mnemonic) =>
              integratedMnemonics.has(mnemonic),
            ),
        )
      ) {
        throw new Error(
          `${term.term}の統合説明に、数字を含む時期問題の語呂合わせがありません。`,
        );
      }
    }
  }

  const ranks = terms
    .map((term) => term.importanceRank)
    .sort((left, right) => left - right);
  if (ranks.some((rank, index) => rank !== rankStart + index)) {
    throw new Error(
      `重要度順位は${rankStart}から${rankStart + terms.length - 1}までの連番にしてください。`,
    );
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

function sourceVersion(sourceText) {
  return createHash("sha256").update(sourceText).digest("hex").slice(0, 12);
}

const stableDatasetVersions = new Map([
  ["world-history:deck-1", "0836119c5d45"],
  ["world-history:deck-2", "8acba0d50165"],
  ["world-history:deck-3", "7edfff4529a4"],
  ["japanese-history:deck-1", "jh-455fb6def169"],
  ["english-vocabulary:deck-1", "en-6984fb69efaf"],
  ["english-vocabulary:deck-2", "en-abb710688392"],
  ["english-vocabulary:deck-3", "en-6397b7943e25"],
]);

function datasetVersion(subjectId, deckId) {
  return (
    stableDatasetVersions.get(`${subjectId}:${deckId}`) ??
    `${subjectId}-${deckId}-v1`
  );
}

function deckNumberFromLabel(datasetLabel, sourcePath) {
  const match = String(datasetLabel).match(/Deck\s*(\d+)/i);
  if (!match) {
    throw new Error(`${path.basename(sourcePath)}のデータセット名からDeck番号を判別できません。`);
  }
  return Number(match[1]);
}

export async function loadSourceDecks() {
  return loadHistoryDecks(await findSourcePaths(), subjectId);
}

async function loadHistoryDecks(sourcePaths, historySubjectId) {
  const decks = await Promise.all(
    sourcePaths.map(async (sourcePath) => {
      const sourceText = await readFile(sourcePath, "utf8");
      const terms = groupTerms(toObjects(parseCsv(sourceText)));
      const datasetLabels = new Set(terms.map((term) => term.datasetLabel));
      const difficultyLabels = new Set(terms.map((term) => term.difficultyLabel));
      if (datasetLabels.size !== 1 || difficultyLabels.size !== 1) {
        throw new Error(`${path.basename(sourcePath)}のデッキ名がファイル内で統一されていません。`);
      }
      const datasetLabel = terms[0].datasetLabel;
      const id = `deck-${deckNumberFromLabel(datasetLabel, sourcePath)}`;
      return {
        id,
        number: deckNumberFromLabel(datasetLabel, sourcePath),
        sourcePath,
        sourceText,
        sourceFile: path.basename(sourcePath),
        version: datasetVersion(historySubjectId, id),
        contentVersion: sourceVersion(sourceText),
        datasetLabel,
        difficultyLabel: terms[0].difficultyLabel,
        terms,
      };
    }),
  );
  decks.sort((left, right) => left.number - right.number);
  assertUnique(decks, (deck) => deck.id, "Deck番号");
  const terms = decks.flatMap((deck) => deck.terms);
  validateTerms(terms);
  return { decks, terms };
}

export async function loadJapaneseHistoryDecks() {
  return loadHistoryDecks(
    await findJapaneseHistorySourcePaths(),
    japaneseSubjectId,
  );
}

export function toEnglishObjects(rows) {
  if (rows.length < 2) {
    throw new Error("英単語CSVに見出し行とデータ行が必要です。");
  }
  const headers = rows[0].map((header, index) =>
    index === 0 ? header.replace(/^\uFEFF/, "").trim() : header.trim(),
  );
  if (
    headers.length !== englishRequiredHeaders.length ||
    headers.some((header, index) => header !== englishRequiredHeaders[index])
  ) {
    throw new Error("英単語CSVの見出しまたは並び順が10列形式と一致しません。");
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

function vocabularyQuestion({
  id,
  stage,
  focus,
  label,
  prompt,
  answer,
  acceptedAnswers = [],
  answerNote = "",
  promptLanguage,
  answerSpeech,
  hideTermUntilAnswer = false,
}) {
  return {
    id,
    stage,
    focus,
    type:
      stage === "beginner"
        ? "identify"
        : stage === "reverse"
          ? "reverse"
          : "integrated",
    label,
    prompt,
    answer,
    keywords: [answer],
    acceptedAnswers,
    answerNote,
    yearMnemonic: "",
    source: { name: "", url: "" },
    hideTermUntilAnswer,
    speech: {
      question: [{ text: prompt, language: promptLanguage }],
      answer: answerSpeech,
    },
  };
}

export function groupEnglishTerms(rows) {
  const termIds = new Set();
  const words = new Set();
  const ranks = new Set();
  const terms = rows.map((row, rowIndex) => {
    const rowNumber = rowIndex + 2;
    englishRequiredHeaders.forEach((fieldName) =>
      assertRequiredText(row, fieldName, rowNumber),
    );
    if (termIds.has(row.term_id)) {
      throw new Error(`英単語IDが重複しています: ${row.term_id}`);
    }
    if (words.has(row.word)) {
      throw new Error(`英単語が重複しています: ${row.word}`);
    }
    const importanceRank = parseInteger(
      row.importance_rank,
      "importance_rank",
      rowNumber,
    );
    if (ranks.has(importanceRank)) {
      throw new Error(`英単語の重要度順位が重複しています: ${importanceRank}`);
    }
    termIds.add(row.term_id);
    words.add(row.word);
    ranks.add(importanceRank);

    const acceptedAnswers = splitPipeList(row.accepted_answers).filter(
      (answer) => answer !== row.meaning,
    );
    const detail = [
      `品詞：${row.part_of_speech}`,
      `例文：${row.example_sentence}`,
      `和訳：${row.example_translation}`,
    ].join("\n");
    const exampleSpeech = [
      { text: row.example_sentence, language: "en-US" },
      { text: row.example_translation, language: "ja-JP" },
    ];

    return {
      id: row.term_id,
      datasetLabel: row.dataset_label,
      importanceRank,
      difficultyLabel: row.difficulty_label,
      category: row.part_of_speech,
      term: row.word,
      reading: `品詞：${row.part_of_speech}`,
      aliases: [],
      era: "",
      geography: { macroRegion: "", regionDetail: "" },
      chronology: { displayPeriod: "", sortYear: importanceRank },
      integratedAsExplanation: false,
      stages: {
        beginner: [
          vocabularyQuestion({
            id: `${row.term_id}-B01`,
            stage: "beginner",
            focus: "英語から意味",
            label: "英語から意味",
            prompt: row.word,
            answer: row.meaning,
            acceptedAnswers,
            answerNote: detail,
            promptLanguage: "en-US",
            answerSpeech: [
              { text: row.meaning, language: "ja-JP" },
              ...exampleSpeech,
            ],
          }),
        ],
        reverse: [
          vocabularyQuestion({
            id: `${row.term_id}-R01`,
            stage: "reverse",
            focus: "意味から英語",
            label: "意味から英語",
            prompt: row.meaning,
            answer: row.word,
            answerNote: detail,
            promptLanguage: "ja-JP",
            answerSpeech: [
              { text: row.word, language: "en-US" },
              ...exampleSpeech,
            ],
            hideTermUntilAnswer: true,
          }),
        ],
        integrated: [
          vocabularyQuestion({
            id: `${row.term_id}-I01`,
            stage: "integrated",
            focus: "例文から和訳",
            label: "例文から和訳",
            prompt: row.example_sentence,
            answer: row.example_translation,
            answerNote: `品詞：${row.part_of_speech}\n単語：${row.word}（${row.meaning}）`,
            promptLanguage: "en-US",
            answerSpeech: [
              { text: row.example_translation, language: "ja-JP" },
              { text: row.word, language: "en-US" },
              { text: row.meaning, language: "ja-JP" },
            ],
          }),
        ],
      },
      source: { name: "", url: "" },
    };
  });
  validateTerms(terms, {
    rankStart: Math.min(...terms.map((term) => term.importanceRank)),
  });
  return terms;
}

export async function loadEnglishDecks() {
  const entries = await readdir(englishSourceDirectory, { withFileTypes: true });
  const sourcePaths = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".csv"))
    .map((entry) => path.join(englishSourceDirectory, entry.name))
    .sort();
  if (sourcePaths.length === 0) {
    throw new Error("英単語の元CSVがありません。");
  }
  const decks = await Promise.all(
    sourcePaths.map(async (sourcePath) => {
      const sourceText = await readFile(sourcePath, "utf8");
      const terms = groupEnglishTerms(toEnglishObjects(parseCsv(sourceText)));
      const datasetLabels = new Set(terms.map((term) => term.datasetLabel));
      const difficultyLabels = new Set(terms.map((term) => term.difficultyLabel));
      if (datasetLabels.size !== 1 || difficultyLabels.size !== 1) {
        throw new Error(`${path.basename(sourcePath)}のデッキ名が統一されていません。`);
      }
      const datasetLabel = terms[0].datasetLabel;
      const number = deckNumberFromLabel(datasetLabel, sourcePath);
      const id = `deck-${number}`;
      return {
        id,
        number,
        sourcePath,
        sourceText,
        sourceFile: path.basename(sourcePath),
        version: datasetVersion(englishSubjectId, id),
        contentVersion: sourceVersion(sourceText),
        datasetLabel,
        difficultyLabel: terms[0].difficultyLabel,
        terms,
      };
    }),
  );
  decks.sort((left, right) => left.number - right.number);
  assertUnique(decks, (deck) => deck.id, "英単語Deck番号");
  const terms = decks.flatMap((deck) => deck.terms);
  validateTerms(terms);
  return { decks, terms };
}

async function writeJson(targetPath, value) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(value)}\n`, "utf8");
}

export async function loadTermImageManifest(
  terms,
  {
    manifestPath = termImageManifestPath,
    imageSourceDirectory = sourceDirectory,
  } = {},
) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (
    manifest.schemaVersion !== 2 ||
    !Array.isArray(manifest.assets) ||
    !Array.isArray(manifest.termFallbacks) ||
    !Array.isArray(manifest.assignments)
  ) {
    throw new Error("関連画像データの形式が正しくありません。");
  }
  const termIds = new Set(terms.map((term) => term.id));
  const questionIds = new Set(
    terms.flatMap((term) => Object.values(term.stages).flat().map((question) => question.id)),
  );
  const assetIds = new Set();
  for (const image of manifest.assets) {
    if (!image.id || assetIds.has(image.id)) {
      throw new Error(`関連画像の画像IDが不正です: ${image.id}`);
    }
    assetIds.add(image.id);
    for (const field of [
      "path",
      "alt",
      "caption",
      "creator",
      "license",
      "licenseUrl",
      "sourcePageUrl",
    ]) {
      if (!String(image[field] ?? "").trim()) {
        throw new Error(`関連画像の${field}が空です: ${image.id}`);
      }
    }
    if (!image.path.startsWith("term-images/") || image.path.includes("..")) {
      throw new Error(`関連画像の保存先が不正です: ${image.path}`);
    }
    await stat(path.join(imageSourceDirectory, image.path));
  }
  const fallbackTermIds = new Set();
  for (const fallback of manifest.termFallbacks) {
    if (
      !termIds.has(fallback.termId) ||
      fallbackTermIds.has(fallback.termId) ||
      !assetIds.has(fallback.assetId)
    ) {
      throw new Error(`用語の基準画像が不正です: ${fallback.termId}`);
    }
    fallbackTermIds.add(fallback.termId);
  }
  if (fallbackTermIds.size !== termIds.size) {
    throw new Error(
      `用語の基準画像が不足しています（${fallbackTermIds.size}/${termIds.size}）。`,
    );
  }
  const assignedQuestionIds = new Set();
  for (const assignment of manifest.assignments) {
    if (
      !questionIds.has(assignment.questionId) ||
      assignedQuestionIds.has(assignment.questionId) ||
      !termIds.has(assignment.termId) ||
      !assetIds.has(assignment.assetId) ||
      !String(assignment.target ?? "").trim()
    ) {
      throw new Error(`問題別画像の割り当てが不正です: ${assignment.questionId}`);
    }
    assignedQuestionIds.add(assignment.questionId);
  }
  if (assignedQuestionIds.size !== questionIds.size) {
    throw new Error(
      `問題別画像の割り当てが不足しています（${assignedQuestionIds.size}/${questionIds.size}）。`,
    );
  }
  return manifest;
}

export function mergeTermImageManifests(manifests) {
  const assetsById = new Map();
  const termFallbacks = [];
  const assignments = [];
  for (const manifest of manifests) {
    for (const asset of manifest.assets) {
      const existing = assetsById.get(asset.id);
      if (existing && JSON.stringify(existing) !== JSON.stringify(asset)) {
        throw new Error(`関連画像の画像IDが科目間で重複しています: ${asset.id}`);
      }
      assetsById.set(asset.id, asset);
    }
    termFallbacks.push(...manifest.termFallbacks);
    assignments.push(...manifest.assignments);
  }
  assertUnique(termFallbacks, (fallback) => fallback.termId, "画像の用語ID");
  assertUnique(assignments, (assignment) => assignment.questionId, "画像の問題ID");
  return {
    schemaVersion: 2,
    assets: [...assetsById.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    termFallbacks,
    assignments,
  };
}

async function writeSubjectData(definition, decks) {
  const deckEntries = [];
  for (const deck of decks) {
    const basePath =
      deck.number === 1
        ? `subjects/${definition.id}`
        : `subjects/${definition.id}/${deck.id}`;
    const chunks = [];
    for (let offset = 0; offset < deck.terms.length; offset += chunkSize) {
      const chunkNumber = chunks.length + 1;
      const fileName = `${String(chunkNumber).padStart(4, "0")}.json`;
      const relativePath = `${basePath}/chunks/${fileName}`;
      const chunkTerms = deck.terms.slice(offset, offset + chunkSize);
      await writeJson(path.join(outputRoot, relativePath), {
        schemaVersion,
        subjectId: definition.id,
        deckId: deck.id,
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

    const questionCounts = countQuestionsByStage(deck.terms);
    const questionCount = Object.values(questionCounts).reduce(
      (sum, count) => sum + count,
      0,
    );
    const subjectIndexPath = `${basePath}/index.json`;
    await writeJson(path.join(outputRoot, subjectIndexPath), {
      schemaVersion,
      id: definition.id,
      title: definition.title,
      learningType: definition.learningType,
      filterLabels: definition.filterLabels,
      stageLabels: definition.stageLabels,
      deckId: deck.id,
      deckNumber: deck.number,
      datasetLabel: deck.datasetLabel,
      difficultyLabel: deck.difficultyLabel,
      description: definition.description,
      version: deck.version,
      contentVersion: deck.contentVersion,
      sourceFile: deck.sourceFile,
      termCount: deck.terms.length,
      questionCount,
      questionCounts,
      masteryTarget,
      chunks,
    });
    deckEntries.push({
      id: deck.id,
      number: deck.number,
      datasetLabel: deck.datasetLabel,
      difficultyLabel: deck.difficultyLabel,
      version: deck.version,
      contentVersion: deck.contentVersion,
      termCount: deck.terms.length,
      questionCount,
      indexPath: subjectIndexPath,
    });
  }

  const terms = decks.flatMap((deck) => deck.terms);
  const questionCounts = countQuestionsByStage(terms);
  const questionCount = Object.values(questionCounts).reduce(
    (sum, count) => sum + count,
    0,
  );
  const firstDeckNumber = decks[0].number;
  const lastDeckNumber = decks.at(-1).number;
  const range =
    firstDeckNumber === lastDeckNumber
      ? `Deck ${firstDeckNumber}`
      : `Deck ${firstDeckNumber}〜${lastDeckNumber}`;
  return {
    id: definition.id,
    title: definition.title,
    description: definition.description,
    learningType: definition.learningType,
    datasetLabel: `${definition.catalogLabel}｜${range}`,
    termCount: terms.length,
    questionCount,
    indexPath: deckEntries[0].indexPath,
    defaultDeckId: deckEntries[0].id,
    decks: deckEntries,
  };
}

export async function main() {
  const [worldHistoryData, japaneseHistoryData, englishData] = await Promise.all([
    loadSourceDecks(),
    loadJapaneseHistoryDecks(),
    loadEnglishDecks(),
  ]);
  const [worldTermImageManifest, japaneseTermImageManifest] = await Promise.all([
    loadTermImageManifest(worldHistoryData.terms),
    loadTermImageManifest(japaneseHistoryData.terms, {
      manifestPath: japaneseTermImageManifestPath,
      imageSourceDirectory: japaneseSourceDirectory,
    }),
  ]);
  const termImageManifest = mergeTermImageManifests([
    worldTermImageManifest,
    japaneseTermImageManifest,
  ]);

  const allDecks = [
    ...worldHistoryData.decks,
    ...japaneseHistoryData.decks,
    ...englishData.decks,
  ];
  const version = createHash("sha256")
    .update(
      allDecks
        .map((deck) => `${deck.sourceFile}\0${deck.contentVersion}`)
        .join("\0"),
    )
    .digest("hex")
    .slice(0, 12);
  const relativeOutput = path.relative(projectRoot, outputRoot);
  if (!relativeOutput || relativeOutput.startsWith("..") || path.isAbsolute(relativeOutput)) {
    throw new Error("出力先が作業フォルダー内ではありません。");
  }
  await rm(outputRoot, { recursive: true, force: true });
  if (termImageManifest.assets.length > 0) {
    await cp(termImageSourceDirectory, path.join(outputRoot, "term-images"), {
      recursive: true,
    });
    if (japaneseTermImageManifest.assets.length > 0) {
      await cp(
        japaneseTermImageSourceDirectory,
        path.join(outputRoot, "term-images"),
        { recursive: true },
      );
    }
  }
  await writeJson(path.join(outputRoot, "term-images.json"), termImageManifest);

  const subjects = await Promise.all([
    writeSubjectData(
      {
        id: subjectId,
        title: subjectTitle,
        catalogLabel: "世界史段階別デッキ",
        description: "短答から逆一問一答、統合説明へ進む大学受験世界史",
        learningType: "history",
        filterLabels: {
          macroRegion: "大分類の地域",
          regionDetail: "小分類の地域",
          category: "カテゴリ",
        },
        stageLabels: {
          all: "三段階すべて",
          beginner: "通常の一問一答",
          reverse: "逆一問一答",
          integrated: "統合説明",
        },
      },
      worldHistoryData.decks,
    ),
    writeSubjectData(
      {
        id: japaneseSubjectId,
        title: japaneseSubjectTitle,
        catalogLabel: "日本史段階別デッキ",
        description: "短答から逆一問一答、統合説明へ進む大学受験日本史",
        learningType: "history",
        filterLabels: {
          macroRegion: "大分類の地域",
          regionDetail: "小分類の地域",
          category: "カテゴリ",
        },
        stageLabels: {
          all: "三段階すべて",
          beginner: "通常の一問一答",
          reverse: "逆一問一答",
          integrated: "統合説明",
        },
      },
      japaneseHistoryData.decks,
    ),
    writeSubjectData(
      {
        id: englishSubjectId,
        title: englishSubjectTitle,
        catalogLabel: "英単語段階別デッキ",
        description: "英語・意味・例文の三方向から覚える大学受験英単語",
        learningType: "vocabulary",
        filterLabels: { category: "品詞" },
        stageLabels: {
          all: "三方向すべて",
          beginner: "英語から意味",
          reverse: "意味から英語",
          integrated: "例文から和訳",
        },
      },
      englishData.decks,
    ),
  ]);

  await writeJson(path.join(outputRoot, "index.json"), {
    schemaVersion,
    version,
    subjects,
  });

  const worldCounts = countQuestionsByStage(worldHistoryData.terms);
  const japaneseCounts = countQuestionsByStage(japaneseHistoryData.terms);
  const englishCounts = countQuestionsByStage(englishData.terms);
  console.log(
    `世界史${worldHistoryData.decks.length}デッキ・${worldHistoryData.terms.length}語・${Object.values(worldCounts).reduce((sum, count) => sum + count, 0)}問、日本史${japaneseHistoryData.decks.length}デッキ・${japaneseHistoryData.terms.length}語・${Object.values(japaneseCounts).reduce((sum, count) => sum + count, 0)}問、英単語${englishData.decks.length}デッキ・${englishData.terms.length}語・${Object.values(englishCounts).reduce((sum, count) => sum + count, 0)}問を生成しました。`,
  );
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main();
}
