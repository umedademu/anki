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
const geographySourceDirectory = path.join(
  projectRoot,
  "data",
  "source",
  "geography",
);
const geographyTermImageManifestPath = path.join(
  geographySourceDirectory,
  "term-images.json",
);
const politicsEconomicsSourceDirectory = path.join(
  projectRoot,
  "data",
  "source",
  "politics-economics",
);
const biologySourceDirectory = path.join(
  projectRoot,
  "data",
  "source",
  "biology-basics",
);
const biologyTermImageManifestPath = path.join(
  biologySourceDirectory,
  "term-images.json",
);
const earthScienceSourceDirectory = path.join(
  projectRoot,
  "data",
  "source",
  "earth-science-basics",
);
const earthScienceTermImageManifestPath = path.join(
  earthScienceSourceDirectory,
  "term-images.json",
);
const classicalJapaneseSourceDirectory = path.join(
  projectRoot,
  "data",
  "source",
  "classical-japanese",
);
const classicalChineseSourceDirectory = path.join(
  projectRoot,
  "data",
  "source",
  "classical-chinese",
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
const geographySubjectId = "geography";
const geographySubjectTitle = "地理";
const politicsEconomicsSubjectId = "politics-economics";
const politicsEconomicsSubjectTitle = "政治・経済";
const biologySubjectId = "biology-basics";
const biologySubjectTitle = "生物基礎";
const earthScienceSubjectId = "earth-science-basics";
const earthScienceSubjectTitle = "地学基礎";
const classicalJapaneseSubjectId = "classical-japanese";
const classicalJapaneseSubjectTitle = "古文（国語）";
const classicalChineseSubjectId = "classical-chinese";
const classicalChineseSubjectTitle = "漢文（国語）";
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

export const geographyRequiredHeaders = [
  "dataset_label",
  "item_id",
  "importance_rank",
  "difficulty_label",
  "curriculum_scope",
  "unit",
  "subunit",
  "item",
  "reading",
  "aliases",
  "prerequisite_ids",
  "scale",
  "region",
  "reference_year",
  "card_id",
  "card_type",
  "focus",
  "question",
  "answer",
  "accepted_answers",
  "explanation",
  "confusable_with",
  "distinction",
  "formula",
  "answer_unit",
  "memory_aid",
  "source_name",
  "source_url",
  "reading_map",
];

export const politicsEconomicsRequiredHeaders = [
  "dataset_label",
  "item_id",
  "importance_rank",
  "difficulty_label",
  "curriculum_scope",
  "domain",
  "unit",
  "subunit",
  "item",
  "reading",
  "aliases",
  "prerequisite_ids",
  "time_sensitivity",
  "reference_date",
  "legal_basis",
  "card_id",
  "card_type",
  "focus",
  "question",
  "answer",
  "accepted_answers",
  "explanation",
  "confusable_with",
  "distinction",
  "formula",
  "answer_unit",
  "memory_aid",
  "source_name",
  "source_url",
  "reading_map",
];

export const biologyRequiredHeaders = [
  "dataset_label",
  "item_id",
  "importance_rank",
  "difficulty_label",
  "unit",
  "subunit",
  "item",
  "reading",
  "aliases",
  "prerequisite_ids",
  "card_id",
  "card_type",
  "focus",
  "question",
  "answer",
  "accepted_answers",
  "explanation",
  "confusable_with",
  "distinction",
  "formula",
  "answer_unit",
  "memory_aid",
  "source_name",
  "source_url",
  "reading_map",
];

export const earthScienceRequiredHeaders = [
  "dataset_label",
  "item_id",
  "importance_rank",
  "difficulty_label",
  "unit",
  "subunit",
  "item",
  "reading",
  "aliases",
  "prerequisite_ids",
  "time_scale",
  "spatial_scale",
  "card_id",
  "card_type",
  "focus",
  "question",
  "answer",
  "accepted_answers",
  "explanation",
  "confusable_with",
  "distinction",
  "formula",
  "answer_unit",
  "memory_aid",
  "source_name",
  "source_url",
  "reading_map",
];

export const classicalJapaneseRequiredHeaders = [
  "dataset_label",
  "item_id",
  "importance_rank",
  "difficulty_label",
  "domain",
  "unit",
  "item",
  "reading",
  "aliases",
  "item_type",
  "grammar_info",
  "card_id",
  "card_type",
  "focus",
  "question",
  "answer",
  "accepted_answers",
  "explanation",
  "example_text",
  "example_reading",
  "example_translation",
  "confusable_with",
  "distinction",
  "memory_aid",
  "source_name",
  "source_url",
  "reading_map",
];

export const classicalChineseRequiredHeaders = [
  "dataset_label",
  "item_id",
  "importance_rank",
  "difficulty_label",
  "domain",
  "unit",
  "item",
  "reading",
  "aliases",
  "item_type",
  "rule_info",
  "card_id",
  "card_type",
  "focus",
  "question",
  "answer",
  "accepted_answers",
  "explanation",
  "example_original",
  "example_kundoku",
  "example_kakikudashi",
  "example_reading",
  "example_translation",
  "confusable_with",
  "distinction",
  "memory_aid",
  "source_name",
  "source_url",
  "reading_map",
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

const geographyCardTypeLabels = {
  identify: "用語",
  definition: "定義",
  location: "位置",
  distribution: "分布",
  example: "代表例",
  association: "対応",
  reason: "理由",
  comparison: "比較",
  sequence: "順序",
  formula: "式",
  number: "数値",
};
const geographyCardTypes = new Set(Object.keys(geographyCardTypeLabels));
const geographyTermFields = geographyRequiredHeaders.slice(0, 14);
const politicsEconomicsCardTypeLabels = {
  identify: "用語",
  definition: "定義",
  institution: "機関",
  authority: "権限",
  legal_basis: "法的根拠",
  procedure: "手続",
  relation: "対応関係",
  comparison: "比較",
  history: "成立と背景",
  formula: "式",
  unit: "単位",
};
const politicsEconomicsCardTypes = new Set(
  Object.keys(politicsEconomicsCardTypeLabels),
);
const politicsEconomicsTermFields = politicsEconomicsRequiredHeaders.slice(0, 15);
const politicsEconomicsCurriculumScopes = new Set(["公共", "政治・経済", "両方"]);
const politicsEconomicsDomains = new Set([
  "政治",
  "法",
  "経済",
  "国際政治",
  "国際経済",
  "複合",
]);
const politicsEconomicsTimeSensitivities = new Set([
  "stable",
  "law_as_of_date",
  "system_as_of_date",
  "statistics_as_of_date",
]);
const biologyCardTypeLabels = {
  identify: "用語",
  definition: "定義",
  location: "場所",
  function: "働き",
  component: "構成要素",
  sequence: "順序",
  relation: "対応関係",
  comparison: "比較",
  formula: "式",
  number: "数値",
};
const biologyCardTypes = new Set(Object.keys(biologyCardTypeLabels));
const biologyTermFields = biologyRequiredHeaders.slice(0, 10);
const earthScienceCardTypeLabels = {
  identify: "用語",
  definition: "定義",
  location: "場所・分布",
  structure: "構造・構成",
  sequence: "順序",
  relation: "原因と結果",
  comparison: "比較",
  scale: "尺度",
  formula: "式",
  unit: "単位",
  example: "代表例",
};
const earthScienceCardTypes = new Set(
  Object.keys(earthScienceCardTypeLabels),
);
const earthScienceTermFields = earthScienceRequiredHeaders.slice(0, 12);
const classicalJapaneseCardTypeLabels = {
  meaning: "語義",
  word_from_meaning: "意味から古語",
  meaning_in_example: "用例中の語義",
  part_of_speech: "品詞",
  conjugation: "活用",
  connection: "接続",
  auxiliary_meaning: "助動詞の意味",
  identification: "識別",
  honorific_type: "敬語の種類",
  respect_direction: "敬意の方向",
  rhetoric: "修辞",
  classical_culture: "古典常識",
  literary_history: "文学史",
};
const classicalJapaneseCardTypes = new Set(
  Object.keys(classicalJapaneseCardTypeLabels),
);
const classicalJapaneseTermFields = classicalJapaneseRequiredHeaders.slice(0, 11);
const classicalJapaneseDomains = new Set([
  "語彙",
  "文法",
  "敬語",
  "修辞",
  "古典常識",
  "文学史",
]);
const classicalChineseCardTypeLabels = {
  meaning: "意味",
  term_from_meaning: "意味から用語",
  reading: "読み",
  kundoku_order: "訓読順",
  okurigana: "送り仮名",
  saidoku: "再読",
  construction: "句法",
  identification: "識別",
  kakikudashi: "書き下し",
  translation: "現代語訳",
  idiom: "故事成語",
  poetry: "漢詩",
  literary_history: "文学史",
};
const classicalChineseCardTypes = new Set(
  Object.keys(classicalChineseCardTypeLabels),
);
const classicalChineseTermFields = classicalChineseRequiredHeaders.slice(0, 11);
const classicalChineseDomains = new Set([
  "重要語",
  "訓読",
  "返り点",
  "置き字",
  "再読文字",
  "句法",
  "故事成語",
  "漢詩",
  "文学史",
  "思想・文化",
]);

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
  ["geography:deck-1", "geography-deck-1-v1"],
  ["politics-economics:deck-1", "politics-economics-deck-1-v1"],
  ["biology-basics:deck-1", "biology-basics-deck-1-v1"],
  ["earth-science-basics:deck-1", "earth-science-basics-deck-1-v1"],
  ["classical-japanese:deck-1", "classical-japanese-deck-1-v1"],
  ["classical-chinese:deck-1", "classical-chinese-deck-1-v1"],
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

function geographyList(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized === "なし" || normalized === "該当なし") {
    return [];
  }
  return normalized
    .split(/[|｜]/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function geographyValue(value) {
  const normalized = String(value ?? "").trim();
  return normalized === "なし" || normalized === "該当なし" ? "" : normalized;
}

function geographyReadingMap(value, rowNumber) {
  return Object.fromEntries(
    geographyList(value).map((entry) => {
      const separatorIndex = entry.indexOf("=");
      if (separatorIndex <= 0 || separatorIndex === entry.length - 1) {
        throw new Error(`${rowNumber}行目のreading_mapが「語=よみ」の形式ではありません。`);
      }
      return [
        entry.slice(0, separatorIndex).trim(),
        entry.slice(separatorIndex + 1).trim(),
      ];
    }),
  );
}

export function toGeographyObjects(rows) {
  if (rows.length < 2) {
    throw new Error("地理CSVに見出し行とデータ行が必要です。");
  }
  const headers = rows[0].map((header, index) =>
    index === 0 ? header.replace(/^\uFEFF/, "").trim() : header.trim(),
  );
  if (
    headers.length !== geographyRequiredHeaders.length ||
    headers.some((header, index) => header !== geographyRequiredHeaders[index])
  ) {
    throw new Error("地理CSVの見出しまたは並び順が29列形式と一致しません。");
  }
  return rows.slice(1).map((cells, rowIndex) => {
    if (cells.length !== headers.length) {
      throw new Error(
        `${rowIndex + 2}行目の列数が見出しと一致しません（${cells.length}/${headers.length}）。`,
      );
    }
    const row = Object.fromEntries(
      headers.map((header, columnIndex) => [header, cells[columnIndex].trim()]),
    );
    for (const fieldName of geographyRequiredHeaders) {
      assertRequiredText(row, fieldName, rowIndex + 2);
    }
    return row;
  });
}

function geographyExplanation(row) {
  return [
    geographyValue(row.explanation),
    geographyValue(row.confusable_with) && geographyValue(row.distinction)
      ? `区別：${row.confusable_with}とは、${row.distinction}`
      : "",
    geographyValue(row.formula) ? `式：${row.formula}` : "",
    geographyValue(row.answer_unit) ? `単位：${row.answer_unit}` : "",
    geographyValue(row.memory_aid) ? `記憶補助：${row.memory_aid}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function normalizeGeographyQuestion(row, rowIndex) {
  const rowNumber = rowIndex + 2;
  if (!geographyCardTypes.has(row.card_type)) {
    throw new Error(`${rowNumber}行目のcard_typeが正しくありません: ${row.card_type}`);
  }
  const sourceUrls = geographyList(row.source_url);
  if (sourceUrls.length === 0 || sourceUrls.some((url) => !/^https:\/\//.test(url))) {
    throw new Error(`${rowNumber}行目のsource_urlはhttpsのURLにしてください。`);
  }
  const acceptedAnswers = geographyList(row.accepted_answers).filter(
    (answer) => answer !== row.answer,
  );
  return {
    id: row.card_id,
    stage: "beginner",
    focus: row.focus,
    type: row.card_type,
    label: geographyCardTypeLabels[row.card_type],
    prompt: row.question,
    answer: row.answer,
    keywords: [...new Set([row.answer, ...acceptedAnswers])],
    acceptedAnswers,
    answerNote: "",
    explanation: geographyExplanation(row),
    yearMnemonic: "",
    source: { name: row.source_name, url: row.source_url },
    hideTermUntilAnswer: row.card_type === "identify",
  };
}

function assertSameGeographyTermData(firstRow, row, rowNumber) {
  for (const fieldName of geographyTermFields) {
    if (row[fieldName] !== firstRow[fieldName]) {
      throw new Error(
        `${rowNumber}行目の${fieldName}が同じ地理項目のほかの行と一致しません。`,
      );
    }
  }
}

export function groupGeographyTerms(rows) {
  const groups = [];
  const groupById = new Map();
  const cardIds = new Set();
  rows.forEach((row, rowIndex) => {
    if (cardIds.has(row.card_id)) {
      throw new Error(`地理カードIDが重複しています: ${row.card_id}`);
    }
    cardIds.add(row.card_id);
    let group = groupById.get(row.item_id);
    if (!group) {
      group = { firstRow: row, rows: [] };
      groupById.set(row.item_id, group);
      groups.push(group);
    } else {
      assertSameGeographyTermData(group.firstRow, row, rowIndex + 2);
    }
    group.rows.push({ row, rowIndex });
  });

  return groups.map(({ firstRow, rows: itemRows }) => {
    const questions = itemRows.map(({ row, rowIndex }) =>
      normalizeGeographyQuestion(row, rowIndex),
    );
    const expectedCardIds = questions.map(
      (_, index) => `${firstRow.item_id}-C${String(index + 1).padStart(2, "0")}`,
    );
    if (questions.some((question, index) => question.id !== expectedCardIds[index])) {
      throw new Error(`${firstRow.item}のカードIDがC01からの連番ではありません。`);
    }
    const readingMap = {};
    for (const { row, rowIndex } of itemRows) {
      for (const [written, reading] of Object.entries(
        geographyReadingMap(row.reading_map, rowIndex + 2),
      )) {
        if (readingMap[written] && readingMap[written] !== reading) {
          throw new Error(`${rowIndex + 2}行目の${written}の読みが同じ項目内で一致しません。`);
        }
        readingMap[written] = reading;
      }
    }
    return {
      id: firstRow.item_id,
      datasetLabel: firstRow.dataset_label,
      importanceRank: parseInteger(
        firstRow.importance_rank,
        "importance_rank",
        itemRows[0].rowIndex + 2,
      ),
      difficultyLabel: firstRow.difficulty_label,
      category: firstRow.unit,
      subunit: firstRow.subunit,
      term: firstRow.item,
      reading: firstRow.reading,
      aliases: geographyList(firstRow.aliases),
      prerequisiteIds: geographyList(firstRow.prerequisite_ids),
      era: firstRow.curriculum_scope,
      geography: {
        macroRegion: firstRow.scale,
        regionDetail: firstRow.region,
        scale: firstRow.scale,
        splitMacroRegion: false,
      },
      chronology: {
        displayPeriod: geographyValue(firstRow.reference_year),
        sortYear: parseInteger(
          firstRow.importance_rank,
          "importance_rank",
          itemRows[0].rowIndex + 2,
        ),
      },
      referenceYear: geographyValue(firstRow.reference_year),
      speechReadings: {
        [firstRow.item]: firstRow.reading,
        ...readingMap,
      },
      integratedAsExplanation: false,
      stages: { beginner: questions, reverse: [], integrated: [] },
      source: { name: firstRow.source_name, url: firstRow.source_url },
    };
  });
}

export function validateGeographyTerms(terms, { rankStart = 1 } = {}) {
  assertUnique(terms, (term) => term.id, "地理項目ID");
  assertUnique(terms, (term) => term.term, "地理項目名");
  assertUnique(terms, (term) => term.importanceRank, "地理重要度順位");
  assertUnique(
    terms.flatMap((term) => term.stages.beginner),
    (question) => question.id,
    "地理カードID",
  );
  const ranks = terms
    .map((term) => term.importanceRank)
    .sort((left, right) => left - right);
  if (ranks.some((rank, index) => rank !== rankStart + index)) {
    throw new Error(
      `地理の重要度順位は${rankStart}から${rankStart + terms.length - 1}までの連番にしてください。`,
    );
  }
  for (const term of terms) {
    const expectedId = `GE-${String(term.importanceRank).padStart(6, "0")}`;
    if (term.id !== expectedId) {
      throw new Error(`${term.term}の項目IDと重要度順位が一致しません。`);
    }
    if (
      term.stages.beginner.length === 0 ||
      term.stages.reverse.length !== 0 ||
      term.stages.integrated.length !== 0
    ) {
      throw new Error(`${term.term}の地理カードの段階分けが正しくありません。`);
    }
  }
}

export async function loadGeographyDecks() {
  const entries = await readdir(geographySourceDirectory, { withFileTypes: true });
  const sourcePaths = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".csv"))
    .map((entry) => path.join(geographySourceDirectory, entry.name))
    .sort();
  if (sourcePaths.length === 0) {
    throw new Error("地理の元CSVがありません。");
  }
  const decks = await Promise.all(
    sourcePaths.map(async (sourcePath) => {
      const sourceText = await readFile(sourcePath, "utf8");
      const terms = groupGeographyTerms(
        toGeographyObjects(parseCsv(sourceText)),
      );
      const datasetLabels = new Set(terms.map((term) => term.datasetLabel));
      const difficultyLabels = new Set(terms.map((term) => term.difficultyLabel));
      if (datasetLabels.size !== 1 || difficultyLabels.size !== 1) {
        throw new Error(`${path.basename(sourcePath)}の地理デッキ名が統一されていません。`);
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
        version: datasetVersion(geographySubjectId, id),
        contentVersion: sourceVersion(sourceText),
        datasetLabel,
        difficultyLabel: terms[0].difficultyLabel,
        terms,
      };
    }),
  );
  decks.sort((left, right) => left.number - right.number);
  assertUnique(decks, (deck) => deck.id, "地理Deck番号");
  const terms = decks.flatMap((deck) => deck.terms);
  validateGeographyTerms(terms);
  return { decks, terms };
}

export function toPoliticsEconomicsObjects(rows) {
  if (rows.length < 2) {
    throw new Error("政治・経済CSVに見出し行とデータ行が必要です。");
  }
  const headers = rows[0].map((header, index) =>
    index === 0 ? header.replace(/^\uFEFF/, "").trim() : header.trim(),
  );
  if (
    headers.length !== politicsEconomicsRequiredHeaders.length ||
    headers.some(
      (header, index) => header !== politicsEconomicsRequiredHeaders[index],
    )
  ) {
    throw new Error("政治・経済CSVの見出しまたは並び順が30列形式と一致しません。");
  }
  return rows.slice(1).map((cells, rowIndex) => {
    if (cells.length !== headers.length) {
      throw new Error(
        `${rowIndex + 2}行目の列数が見出しと一致しません（${cells.length}/${headers.length}）。`,
      );
    }
    const row = Object.fromEntries(
      headers.map((header, columnIndex) => [header, cells[columnIndex].trim()]),
    );
    for (const fieldName of politicsEconomicsRequiredHeaders) {
      assertRequiredText(row, fieldName, rowIndex + 2);
    }
    return row;
  });
}

function politicsEconomicsExplanation(row) {
  return [
    geographyValue(row.explanation),
    geographyValue(row.confusable_with) && geographyValue(row.distinction)
      ? `区別：${row.confusable_with}とは、${row.distinction}`
      : "",
    geographyValue(row.legal_basis) ? `根拠：${row.legal_basis}` : "",
    row.time_sensitivity !== "stable" && geographyValue(row.reference_date)
      ? `基準日：${row.reference_date}`
      : "",
    geographyValue(row.formula) ? `式：${row.formula}` : "",
    geographyValue(row.answer_unit) ? `単位：${row.answer_unit}` : "",
    geographyValue(row.memory_aid) ? `記憶補助：${row.memory_aid}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function politicsEconomicsReferenceDateLabels(referenceDate) {
  const normalized = String(referenceDate ?? "").trim();
  const isoDate = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return isoDate
    ? [
        normalized,
        `${isoDate[1]}年${Number(isoDate[2])}月${Number(isoDate[3])}日`,
      ]
    : [normalized];
}

function normalizePoliticsEconomicsQuestion(row, rowIndex) {
  const rowNumber = rowIndex + 2;
  if (!politicsEconomicsCardTypes.has(row.card_type)) {
    throw new Error(`${rowNumber}行目のcard_typeが正しくありません: ${row.card_type}`);
  }
  if (!politicsEconomicsCurriculumScopes.has(row.curriculum_scope)) {
    throw new Error(
      `${rowNumber}行目のcurriculum_scopeが正しくありません: ${row.curriculum_scope}`,
    );
  }
  if (!politicsEconomicsDomains.has(row.domain)) {
    throw new Error(`${rowNumber}行目のdomainが正しくありません: ${row.domain}`);
  }
  if (!politicsEconomicsTimeSensitivities.has(row.time_sensitivity)) {
    throw new Error(
      `${rowNumber}行目のtime_sensitivityが正しくありません: ${row.time_sensitivity}`,
    );
  }
  if (row.time_sensitivity === "stable" && row.reference_date !== "該当なし") {
    throw new Error(`${rowNumber}行目の安定知識のreference_dateは「該当なし」にしてください。`);
  }
  if (
    row.time_sensitivity !== "stable" &&
    (!/^(\d{4}-\d{2}-\d{2}|\d{4}年(?:度)?)$/.test(row.reference_date) ||
      !politicsEconomicsReferenceDateLabels(row.reference_date).some((label) =>
        row.question.includes(label),
      ))
  ) {
    throw new Error(
      `${rowNumber}行目の変わり得る知識はreference_dateを設定し、問題文にも含めてください。`,
    );
  }
  const sourceUrls = geographyList(row.source_url);
  if (sourceUrls.length === 0 || sourceUrls.some((url) => !/^https:\/\//.test(url))) {
    throw new Error(`${rowNumber}行目のsource_urlはhttpsのURLにしてください。`);
  }
  const answerChoices = geographyList(row.accepted_answers);
  if (answerChoices[0] !== row.answer) {
    throw new Error(`${rowNumber}行目のaccepted_answersはanswerを先頭にしてください。`);
  }
  const acceptedAnswers = answerChoices.slice(1);
  return {
    id: row.card_id,
    stage: "beginner",
    focus: row.focus,
    type: row.card_type,
    label: politicsEconomicsCardTypeLabels[row.card_type],
    prompt: row.question,
    answer: row.answer,
    keywords: [...new Set(answerChoices)],
    acceptedAnswers,
    answerNote: "",
    explanation: politicsEconomicsExplanation(row),
    yearMnemonic: "",
    source: { name: row.source_name, url: row.source_url },
    hideTermUntilAnswer: row.card_type === "identify",
  };
}

function assertSamePoliticsEconomicsTermData(firstRow, row, rowNumber) {
  for (const fieldName of politicsEconomicsTermFields) {
    if (row[fieldName] !== firstRow[fieldName]) {
      throw new Error(
        `${rowNumber}行目の${fieldName}が同じ政治・経済項目のほかの行と一致しません。`,
      );
    }
  }
}

export function groupPoliticsEconomicsTerms(rows) {
  const groups = [];
  const groupById = new Map();
  const cardIds = new Set();
  rows.forEach((row, rowIndex) => {
    if (cardIds.has(row.card_id)) {
      throw new Error(`政治・経済カードIDが重複しています: ${row.card_id}`);
    }
    cardIds.add(row.card_id);
    let group = groupById.get(row.item_id);
    if (!group) {
      group = { firstRow: row, rows: [] };
      groupById.set(row.item_id, group);
      groups.push(group);
    } else {
      assertSamePoliticsEconomicsTermData(group.firstRow, row, rowIndex + 2);
    }
    group.rows.push({ row, rowIndex });
  });

  return groups.map(({ firstRow, rows: itemRows }) => {
    const questions = itemRows.map(({ row, rowIndex }) =>
      normalizePoliticsEconomicsQuestion(row, rowIndex),
    );
    const expectedCardIds = questions.map(
      (_, index) => `${firstRow.item_id}-C${String(index + 1).padStart(2, "0")}`,
    );
    if (questions.some((question, index) => question.id !== expectedCardIds[index])) {
      throw new Error(`${firstRow.item}のカードIDがC01からの連番ではありません。`);
    }
    const readingMap = {};
    for (const { row, rowIndex } of itemRows) {
      for (const [written, reading] of Object.entries(
        geographyReadingMap(row.reading_map, rowIndex + 2),
      )) {
        if (readingMap[written] && readingMap[written] !== reading) {
          throw new Error(`${rowIndex + 2}行目の${written}の読みが同じ項目内で一致しません。`);
        }
        readingMap[written] = reading;
      }
    }
    const importanceRank = parseInteger(
      firstRow.importance_rank,
      "importance_rank",
      itemRows[0].rowIndex + 2,
    );
    return {
      id: firstRow.item_id,
      datasetLabel: firstRow.dataset_label,
      importanceRank,
      difficultyLabel: firstRow.difficulty_label,
      category: firstRow.unit,
      subunit: firstRow.subunit,
      term: firstRow.item,
      reading: firstRow.reading,
      aliases: geographyList(firstRow.aliases),
      prerequisiteIds: geographyList(firstRow.prerequisite_ids),
      era: firstRow.curriculum_scope,
      geography: {
        macroRegion: firstRow.domain,
        regionDetail: firstRow.subunit,
        scale: firstRow.domain,
        splitMacroRegion: false,
      },
      chronology: {
        displayPeriod: geographyValue(firstRow.reference_date),
        sortYear: importanceRank,
      },
      referenceYear: geographyValue(firstRow.reference_date),
      politicsEconomics: {
        curriculumScope: firstRow.curriculum_scope,
        domain: firstRow.domain,
        timeSensitivity: firstRow.time_sensitivity,
        referenceDate: geographyValue(firstRow.reference_date),
        legalBasis: geographyValue(firstRow.legal_basis),
      },
      speechReadings: {
        [firstRow.item]: firstRow.reading,
        ...readingMap,
      },
      integratedAsExplanation: false,
      stages: { beginner: questions, reverse: [], integrated: [] },
      source: { name: firstRow.source_name, url: firstRow.source_url },
    };
  });
}

export function validatePoliticsEconomicsTerms(terms, { rankStart = 1 } = {}) {
  assertUnique(terms, (term) => term.id, "政治・経済項目ID");
  assertUnique(terms, (term) => term.term, "政治・経済項目名");
  assertUnique(terms, (term) => term.importanceRank, "政治・経済重要度順位");
  assertUnique(
    terms.flatMap((term) => term.stages.beginner),
    (question) => question.id,
    "政治・経済カードID",
  );
  const ranks = terms
    .map((term) => term.importanceRank)
    .sort((left, right) => left - right);
  if (ranks.some((rank, index) => rank !== rankStart + index)) {
    throw new Error(
      `政治・経済の重要度順位は${rankStart}から${rankStart + terms.length - 1}までの連番にしてください。`,
    );
  }
  const termIds = new Set(terms.map((term) => term.id));
  for (const term of terms) {
    const expectedId = `PE-${String(term.importanceRank).padStart(6, "0")}`;
    if (term.id !== expectedId) {
      throw new Error(`${term.term}の項目IDと重要度順位が一致しません。`);
    }
    if (
      term.stages.beginner.length === 0 ||
      term.stages.reverse.length !== 0 ||
      term.stages.integrated.length !== 0
    ) {
      throw new Error(`${term.term}の政治・経済カードの段階分けが正しくありません。`);
    }
    if (
      term.prerequisiteIds.some(
        (prerequisiteId) =>
          prerequisiteId === term.id || !termIds.has(prerequisiteId),
      )
    ) {
      throw new Error(`${term.term}の前提項目IDが存在しないか、自分自身を参照しています。`);
    }
  }
}

export async function loadPoliticsEconomicsDecks() {
  const entries = await readdir(politicsEconomicsSourceDirectory, {
    withFileTypes: true,
  });
  const sourcePaths = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".csv"))
    .map((entry) => path.join(politicsEconomicsSourceDirectory, entry.name))
    .sort();
  if (sourcePaths.length === 0) {
    throw new Error("政治・経済の元CSVがありません。");
  }
  const decks = await Promise.all(
    sourcePaths.map(async (sourcePath) => {
      const sourceText = await readFile(sourcePath, "utf8");
      const terms = groupPoliticsEconomicsTerms(
        toPoliticsEconomicsObjects(parseCsv(sourceText)),
      );
      const datasetLabels = new Set(terms.map((term) => term.datasetLabel));
      const difficultyLabels = new Set(terms.map((term) => term.difficultyLabel));
      if (datasetLabels.size !== 1 || difficultyLabels.size !== 1) {
        throw new Error(
          `${path.basename(sourcePath)}の政治・経済デッキ名が統一されていません。`,
        );
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
        version: datasetVersion(politicsEconomicsSubjectId, id),
        contentVersion: sourceVersion(sourceText),
        datasetLabel,
        difficultyLabel: terms[0].difficultyLabel,
        terms,
      };
    }),
  );
  decks.sort((left, right) => left.number - right.number);
  assertUnique(decks, (deck) => deck.id, "政治・経済Deck番号");
  const terms = decks.flatMap((deck) => deck.terms);
  validatePoliticsEconomicsTerms(terms);
  return { decks, terms };
}

export function toBiologyObjects(rows) {
  if (rows.length < 2) {
    throw new Error("生物基礎CSVに見出し行とデータ行が必要です。");
  }
  const headers = rows[0].map((header, index) =>
    index === 0 ? header.replace(/^\uFEFF/, "").trim() : header.trim(),
  );
  if (
    headers.length !== biologyRequiredHeaders.length ||
    headers.some((header, index) => header !== biologyRequiredHeaders[index])
  ) {
    throw new Error("生物基礎CSVの見出しまたは並び順が25列形式と一致しません。");
  }
  return rows.slice(1).map((cells, rowIndex) => {
    if (cells.length !== headers.length) {
      throw new Error(
        `${rowIndex + 2}行目の列数が見出しと一致しません（${cells.length}/${headers.length}）。`,
      );
    }
    const row = Object.fromEntries(
      headers.map((header, columnIndex) => [header, cells[columnIndex].trim()]),
    );
    for (const fieldName of biologyRequiredHeaders) {
      assertRequiredText(row, fieldName, rowIndex + 2);
    }
    return row;
  });
}

function biologyExplanation(row) {
  return [
    geographyValue(row.explanation),
    geographyValue(row.confusable_with) && geographyValue(row.distinction)
      ? `区別：${row.confusable_with}とは、${row.distinction}`
      : "",
    geographyValue(row.formula) ? `式：${row.formula}` : "",
    geographyValue(row.answer_unit) ? `単位：${row.answer_unit}` : "",
    geographyValue(row.memory_aid) ? `記憶補助：${row.memory_aid}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function normalizeBiologyQuestion(row, rowIndex) {
  const rowNumber = rowIndex + 2;
  if (!biologyCardTypes.has(row.card_type)) {
    throw new Error(`${rowNumber}行目のcard_typeが正しくありません: ${row.card_type}`);
  }
  const sourceUrls = geographyList(row.source_url);
  if (sourceUrls.length === 0 || sourceUrls.some((url) => !/^https:\/\//.test(url))) {
    throw new Error(`${rowNumber}行目のsource_urlはhttpsのURLにしてください。`);
  }
  const acceptedAnswers = geographyList(row.accepted_answers).filter(
    (answer) => answer !== row.answer,
  );
  return {
    id: row.card_id,
    stage: "beginner",
    focus: row.focus,
    type: row.card_type,
    label: biologyCardTypeLabels[row.card_type],
    prompt: row.question,
    answer: row.answer,
    keywords: [...new Set([row.answer, ...acceptedAnswers])],
    acceptedAnswers,
    answerNote: "",
    explanation: biologyExplanation(row),
    yearMnemonic: "",
    source: { name: row.source_name, url: row.source_url },
    hideTermUntilAnswer: row.card_type === "identify",
  };
}

function assertSameBiologyTermData(firstRow, row, rowNumber) {
  for (const fieldName of biologyTermFields) {
    if (row[fieldName] !== firstRow[fieldName]) {
      throw new Error(
        `${rowNumber}行目の${fieldName}が同じ生物基礎項目のほかの行と一致しません。`,
      );
    }
  }
}

export function groupBiologyTerms(rows) {
  const groups = [];
  const groupById = new Map();
  const cardIds = new Set();
  rows.forEach((row, rowIndex) => {
    if (cardIds.has(row.card_id)) {
      throw new Error(`生物基礎カードIDが重複しています: ${row.card_id}`);
    }
    cardIds.add(row.card_id);
    let group = groupById.get(row.item_id);
    if (!group) {
      group = { firstRow: row, rows: [] };
      groupById.set(row.item_id, group);
      groups.push(group);
    } else {
      assertSameBiologyTermData(group.firstRow, row, rowIndex + 2);
    }
    group.rows.push({ row, rowIndex });
  });

  return groups.map(({ firstRow, rows: itemRows }) => {
    const questions = itemRows.map(({ row, rowIndex }) =>
      normalizeBiologyQuestion(row, rowIndex),
    );
    const expectedCardIds = questions.map(
      (_, index) => `${firstRow.item_id}-C${String(index + 1).padStart(2, "0")}`,
    );
    if (questions.some((question, index) => question.id !== expectedCardIds[index])) {
      throw new Error(`${firstRow.item}のカードIDがC01からの連番ではありません。`);
    }
    const readingMap = {};
    for (const { row, rowIndex } of itemRows) {
      for (const [written, reading] of Object.entries(
        geographyReadingMap(row.reading_map, rowIndex + 2),
      )) {
        if (readingMap[written] && readingMap[written] !== reading) {
          throw new Error(`${rowIndex + 2}行目の${written}の読みが同じ項目内で一致しません。`);
        }
        readingMap[written] = reading;
      }
    }
    const importanceRank = parseInteger(
      firstRow.importance_rank,
      "importance_rank",
      itemRows[0].rowIndex + 2,
    );
    return {
      id: firstRow.item_id,
      datasetLabel: firstRow.dataset_label,
      importanceRank,
      difficultyLabel: firstRow.difficulty_label,
      category: firstRow.unit,
      subunit: firstRow.subunit,
      term: firstRow.item,
      reading: firstRow.reading,
      aliases: geographyList(firstRow.aliases),
      prerequisiteIds: geographyList(firstRow.prerequisite_ids),
      era: "",
      geography: {
        macroRegion: firstRow.unit,
        regionDetail: firstRow.subunit,
        scale: firstRow.unit,
        splitMacroRegion: false,
      },
      chronology: {
        displayPeriod: "",
        sortYear: importanceRank,
      },
      referenceYear: "",
      speechReadings: {
        [firstRow.item]: firstRow.reading,
        ...readingMap,
      },
      integratedAsExplanation: false,
      stages: { beginner: questions, reverse: [], integrated: [] },
      source: { name: firstRow.source_name, url: firstRow.source_url },
    };
  });
}

export function validateBiologyTerms(terms, { rankStart = 1 } = {}) {
  assertUnique(terms, (term) => term.id, "生物基礎項目ID");
  assertUnique(terms, (term) => term.term, "生物基礎項目名");
  assertUnique(terms, (term) => term.importanceRank, "生物基礎重要度順位");
  assertUnique(
    terms.flatMap((term) => term.stages.beginner),
    (question) => question.id,
    "生物基礎カードID",
  );
  const ranks = terms
    .map((term) => term.importanceRank)
    .sort((left, right) => left - right);
  if (ranks.some((rank, index) => rank !== rankStart + index)) {
    throw new Error(
      `生物基礎の重要度順位は${rankStart}から${rankStart + terms.length - 1}までの連番にしてください。`,
    );
  }
  for (const term of terms) {
    const expectedId = `BB-${String(term.importanceRank).padStart(6, "0")}`;
    if (term.id !== expectedId) {
      throw new Error(`${term.term}の項目IDと重要度順位が一致しません。`);
    }
    if (
      term.stages.beginner.length === 0 ||
      term.stages.reverse.length !== 0 ||
      term.stages.integrated.length !== 0
    ) {
      throw new Error(`${term.term}の生物基礎カードの段階分けが正しくありません。`);
    }
  }
}

export async function loadBiologyDecks() {
  const entries = await readdir(biologySourceDirectory, { withFileTypes: true });
  const sourcePaths = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".csv"))
    .map((entry) => path.join(biologySourceDirectory, entry.name))
    .sort();
  if (sourcePaths.length === 0) {
    throw new Error("生物基礎の元CSVがありません。");
  }
  const decks = await Promise.all(
    sourcePaths.map(async (sourcePath) => {
      const sourceText = await readFile(sourcePath, "utf8");
      const terms = groupBiologyTerms(toBiologyObjects(parseCsv(sourceText)));
      const datasetLabels = new Set(terms.map((term) => term.datasetLabel));
      const difficultyLabels = new Set(terms.map((term) => term.difficultyLabel));
      if (datasetLabels.size !== 1 || difficultyLabels.size !== 1) {
        throw new Error(
          `${path.basename(sourcePath)}の生物基礎デッキ名が統一されていません。`,
        );
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
        version: datasetVersion(biologySubjectId, id),
        contentVersion: sourceVersion(sourceText),
        datasetLabel,
        difficultyLabel: terms[0].difficultyLabel,
        terms,
      };
    }),
  );
  decks.sort((left, right) => left.number - right.number);
  assertUnique(decks, (deck) => deck.id, "生物基礎Deck番号");
  const terms = decks.flatMap((deck) => deck.terms);
  validateBiologyTerms(terms);
  return { decks, terms };
}

export function toEarthScienceObjects(rows) {
  if (rows.length < 2) {
    throw new Error("地学基礎CSVに見出し行とデータ行が必要です。");
  }
  const headers = rows[0].map((header, index) =>
    index === 0 ? header.replace(/^\uFEFF/, "").trim() : header.trim(),
  );
  if (
    headers.length !== earthScienceRequiredHeaders.length ||
    headers.some(
      (header, index) => header !== earthScienceRequiredHeaders[index],
    )
  ) {
    throw new Error("地学基礎CSVの見出しまたは並び順が27列形式と一致しません。");
  }
  return rows.slice(1).map((cells, rowIndex) => {
    if (cells.length !== headers.length) {
      throw new Error(
        `${rowIndex + 2}行目の列数が見出しと一致しません（${cells.length}/${headers.length}）。`,
      );
    }
    const row = Object.fromEntries(
      headers.map((header, columnIndex) => [header, cells[columnIndex].trim()]),
    );
    for (const fieldName of earthScienceRequiredHeaders) {
      assertRequiredText(row, fieldName, rowIndex + 2);
    }
    return row;
  });
}

function earthScienceExplanation(row) {
  return [
    geographyValue(row.explanation),
    geographyValue(row.confusable_with) && geographyValue(row.distinction)
      ? `区別：${row.confusable_with}とは、${row.distinction}`
      : "",
    geographyValue(row.formula) ? `式：${row.formula}` : "",
    geographyValue(row.answer_unit) ? `単位：${row.answer_unit}` : "",
    geographyValue(row.memory_aid) ? `記憶補助：${row.memory_aid}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function normalizeEarthScienceQuestion(row, rowIndex) {
  const rowNumber = rowIndex + 2;
  if (!earthScienceCardTypes.has(row.card_type)) {
    throw new Error(`${rowNumber}行目のcard_typeが正しくありません: ${row.card_type}`);
  }
  const sourceUrls = geographyList(row.source_url);
  if (sourceUrls.length === 0 || sourceUrls.some((url) => !/^https:\/\//.test(url))) {
    throw new Error(`${rowNumber}行目のsource_urlはhttpsのURLにしてください。`);
  }
  const acceptedAnswers = geographyList(row.accepted_answers).filter(
    (answer) => answer !== row.answer,
  );
  return {
    id: row.card_id,
    stage: "beginner",
    focus: row.focus,
    type: row.card_type,
    label: earthScienceCardTypeLabels[row.card_type],
    prompt: row.question,
    answer: row.answer,
    keywords: [...new Set([row.answer, ...acceptedAnswers])],
    acceptedAnswers,
    answerNote: "",
    explanation: earthScienceExplanation(row),
    yearMnemonic: "",
    source: { name: row.source_name, url: row.source_url },
    hideTermUntilAnswer: row.card_type === "identify",
  };
}

function assertSameEarthScienceTermData(firstRow, row, rowNumber) {
  for (const fieldName of earthScienceTermFields) {
    if (row[fieldName] !== firstRow[fieldName]) {
      throw new Error(
        `${rowNumber}行目の${fieldName}が同じ地学基礎項目のほかの行と一致しません。`,
      );
    }
  }
}

export function groupEarthScienceTerms(rows) {
  const groups = [];
  const groupById = new Map();
  const cardIds = new Set();
  rows.forEach((row, rowIndex) => {
    if (cardIds.has(row.card_id)) {
      throw new Error(`地学基礎カードIDが重複しています: ${row.card_id}`);
    }
    cardIds.add(row.card_id);
    let group = groupById.get(row.item_id);
    if (!group) {
      group = { firstRow: row, rows: [] };
      groupById.set(row.item_id, group);
      groups.push(group);
    } else {
      assertSameEarthScienceTermData(group.firstRow, row, rowIndex + 2);
    }
    group.rows.push({ row, rowIndex });
  });

  return groups.map(({ firstRow, rows: itemRows }) => {
    const questions = itemRows.map(({ row, rowIndex }) =>
      normalizeEarthScienceQuestion(row, rowIndex),
    );
    const expectedCardIds = questions.map(
      (_, index) => `${firstRow.item_id}-C${String(index + 1).padStart(2, "0")}`,
    );
    if (questions.some((question, index) => question.id !== expectedCardIds[index])) {
      throw new Error(`${firstRow.item}のカードIDがC01からの連番ではありません。`);
    }
    const readingMap = {};
    for (const { row, rowIndex } of itemRows) {
      for (const [written, reading] of Object.entries(
        geographyReadingMap(row.reading_map, rowIndex + 2),
      )) {
        if (readingMap[written] && readingMap[written] !== reading) {
          throw new Error(`${rowIndex + 2}行目の${written}の読みが同じ項目内で一致しません。`);
        }
        readingMap[written] = reading;
      }
    }
    const importanceRank = parseInteger(
      firstRow.importance_rank,
      "importance_rank",
      itemRows[0].rowIndex + 2,
    );
    return {
      id: firstRow.item_id,
      datasetLabel: firstRow.dataset_label,
      importanceRank,
      difficultyLabel: firstRow.difficulty_label,
      category: firstRow.unit,
      subunit: firstRow.subunit,
      term: firstRow.item,
      reading: firstRow.reading,
      aliases: geographyList(firstRow.aliases),
      prerequisiteIds: geographyList(firstRow.prerequisite_ids),
      era: "",
      geography: {
        macroRegion: firstRow.unit,
        regionDetail: firstRow.subunit,
        scale: firstRow.spatial_scale,
        splitMacroRegion: false,
      },
      chronology: {
        displayPeriod: "",
        sortYear: importanceRank,
      },
      referenceYear: "",
      earthScience: {
        timeScale: firstRow.time_scale,
        spatialScale: firstRow.spatial_scale,
      },
      speechReadings: {
        [firstRow.item]: firstRow.reading,
        ...readingMap,
      },
      integratedAsExplanation: false,
      stages: { beginner: questions, reverse: [], integrated: [] },
      source: { name: firstRow.source_name, url: firstRow.source_url },
    };
  });
}

export function validateEarthScienceTerms(terms, { rankStart = 1 } = {}) {
  assertUnique(terms, (term) => term.id, "地学基礎項目ID");
  assertUnique(terms, (term) => term.term, "地学基礎項目名");
  assertUnique(terms, (term) => term.importanceRank, "地学基礎重要度順位");
  assertUnique(
    terms.flatMap((term) => term.stages.beginner),
    (question) => question.id,
    "地学基礎カードID",
  );
  const ranks = terms
    .map((term) => term.importanceRank)
    .sort((left, right) => left - right);
  if (ranks.some((rank, index) => rank !== rankStart + index)) {
    throw new Error(
      `地学基礎の重要度順位は${rankStart}から${rankStart + terms.length - 1}までの連番にしてください。`,
    );
  }
  const termIds = new Set(terms.map((term) => term.id));
  const timeScales = new Set([
    "秒〜日",
    "月〜年",
    "数十〜数千年",
    "万〜億年",
    "複数尺度",
    "該当なし",
  ]);
  const spatialScales = new Set([
    "試料・露頭",
    "地域",
    "日本列島",
    "地球規模",
    "太陽系",
    "宇宙",
    "複数尺度",
  ]);
  for (const term of terms) {
    const expectedId = `ES-${String(term.importanceRank).padStart(6, "0")}`;
    if (term.id !== expectedId) {
      throw new Error(`${term.term}の項目IDと重要度順位が一致しません。`);
    }
    if (
      term.stages.beginner.length === 0 ||
      term.stages.reverse.length !== 0 ||
      term.stages.integrated.length !== 0
    ) {
      throw new Error(`${term.term}の地学基礎カードの段階分けが正しくありません。`);
    }
    if (term.prerequisiteIds.some((id) => !termIds.has(id))) {
      throw new Error(`${term.term}の前提項目IDがDeck内にありません。`);
    }
    if (!timeScales.has(term.earthScience.timeScale)) {
      throw new Error(`${term.term}の時間尺度が正しくありません。`);
    }
    if (!spatialScales.has(term.earthScience.spatialScale)) {
      throw new Error(`${term.term}の空間尺度が正しくありません。`);
    }
  }
}

export async function loadEarthScienceDecks() {
  const entries = await readdir(earthScienceSourceDirectory, {
    withFileTypes: true,
  });
  const sourcePaths = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".csv"))
    .map((entry) => path.join(earthScienceSourceDirectory, entry.name))
    .sort();
  if (sourcePaths.length === 0) {
    throw new Error("地学基礎の元CSVがありません。");
  }
  const decks = await Promise.all(
    sourcePaths.map(async (sourcePath) => {
      const sourceText = await readFile(sourcePath, "utf8");
      const terms = groupEarthScienceTerms(
        toEarthScienceObjects(parseCsv(sourceText)),
      );
      const datasetLabels = new Set(terms.map((term) => term.datasetLabel));
      const difficultyLabels = new Set(terms.map((term) => term.difficultyLabel));
      if (datasetLabels.size !== 1 || difficultyLabels.size !== 1) {
        throw new Error(
          `${path.basename(sourcePath)}の地学基礎デッキ名が統一されていません。`,
        );
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
        version: datasetVersion(earthScienceSubjectId, id),
        contentVersion: sourceVersion(sourceText),
        datasetLabel,
        difficultyLabel: terms[0].difficultyLabel,
        terms,
      };
    }),
  );
  decks.sort((left, right) => left.number - right.number);
  assertUnique(decks, (deck) => deck.id, "地学基礎Deck番号");
  const terms = decks.flatMap((deck) => deck.terms);
  validateEarthScienceTerms(terms);
  return { decks, terms };
}

export function toClassicalJapaneseObjects(rows) {
  if (rows.length < 2) {
    throw new Error("古文CSVに見出し行とデータ行が必要です。");
  }
  const headers = rows[0].map((header, index) =>
    index === 0 ? header.replace(/^\uFEFF/, "").trim() : header.trim(),
  );
  if (
    headers.length !== classicalJapaneseRequiredHeaders.length ||
    headers.some(
      (header, index) => header !== classicalJapaneseRequiredHeaders[index],
    )
  ) {
    throw new Error("古文CSVの見出しまたは並び順が27列形式と一致しません。");
  }
  return rows.slice(1).map((cells, rowIndex) => {
    if (cells.length !== headers.length) {
      throw new Error(
        `${rowIndex + 2}行目の列数が見出しと一致しません（${cells.length}/${headers.length}）。`,
      );
    }
    const row = Object.fromEntries(
      headers.map((header, columnIndex) => [header, cells[columnIndex].trim()]),
    );
    for (const fieldName of classicalJapaneseRequiredHeaders) {
      assertRequiredText(row, fieldName, rowIndex + 2);
    }
    return row;
  });
}

function classicalJapaneseExplanation(row) {
  return [
    geographyValue(row.explanation),
    geographyValue(row.grammar_info)
      ? `文法情報：${row.grammar_info.replaceAll(";", "／")}`
      : "",
    geographyValue(row.confusable_with) && geographyValue(row.distinction)
      ? `区別：${row.confusable_with}とは、${row.distinction}`
      : "",
    geographyValue(row.memory_aid) ? `記憶補助：${row.memory_aid}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function normalizeClassicalJapaneseQuestion(row, rowIndex) {
  const rowNumber = rowIndex + 2;
  if (!classicalJapaneseCardTypes.has(row.card_type)) {
    throw new Error(`${rowNumber}行目のcard_typeが正しくありません: ${row.card_type}`);
  }
  const sourceUrls = geographyList(row.source_url);
  if (sourceUrls.some((url) => !/^https:\/\//.test(url))) {
    throw new Error(`${rowNumber}行目のsource_urlはhttpsのURLか「なし」にしてください。`);
  }
  const exampleText = geographyValue(row.example_text);
  const exampleReading = geographyValue(row.example_reading);
  const exampleTranslation = geographyValue(row.example_translation);
  if (
    [exampleText, exampleReading, exampleTranslation].filter(Boolean).length !== 0 &&
    [exampleText, exampleReading, exampleTranslation].filter(Boolean).length !== 3
  ) {
    throw new Error(`${rowNumber}行目の用例・用例の読み・現代語訳をすべて記入してください。`);
  }
  const acceptedAnswers = geographyList(row.accepted_answers).filter(
    (answer) => answer !== row.answer,
  );
  return {
    id: row.card_id,
    stage: "beginner",
    focus: row.focus,
    type: row.card_type,
    label: classicalJapaneseCardTypeLabels[row.card_type],
    prompt: [row.question, exampleText].filter(Boolean).join("\n"),
    answer: row.answer,
    keywords: [...new Set([row.answer, ...acceptedAnswers])],
    acceptedAnswers,
    answerNote: exampleTranslation ? `現代語訳：${exampleTranslation}` : "",
    explanation: classicalJapaneseExplanation(row),
    yearMnemonic: "",
    source: { name: row.source_name, url: geographyValue(row.source_url) },
    hideTermUntilAnswer: row.card_type === "word_from_meaning",
    ...(exampleReading
      ? {
          speech: {
            question: [
              { text: row.question, language: "ja-JP" },
              { text: exampleReading, language: "ja-JP" },
            ],
          },
        }
      : {}),
  };
}

function assertSameClassicalJapaneseTermData(firstRow, row, rowNumber) {
  for (const fieldName of classicalJapaneseTermFields) {
    if (row[fieldName] !== firstRow[fieldName]) {
      throw new Error(
        `${rowNumber}行目の${fieldName}が同じ古文項目のほかの行と一致しません。`,
      );
    }
  }
}

export function groupClassicalJapaneseTerms(rows) {
  const groups = [];
  const groupById = new Map();
  const cardIds = new Set();
  rows.forEach((row, rowIndex) => {
    if (cardIds.has(row.card_id)) {
      throw new Error(`古文カードIDが重複しています: ${row.card_id}`);
    }
    cardIds.add(row.card_id);
    let group = groupById.get(row.item_id);
    if (!group) {
      group = { firstRow: row, rows: [] };
      groupById.set(row.item_id, group);
      groups.push(group);
    } else {
      assertSameClassicalJapaneseTermData(group.firstRow, row, rowIndex + 2);
    }
    group.rows.push({ row, rowIndex });
  });

  return groups.map(({ firstRow, rows: itemRows }) => {
    const questions = itemRows.map(({ row, rowIndex }) =>
      normalizeClassicalJapaneseQuestion(row, rowIndex),
    );
    const expectedCardIds = questions.map(
      (_, index) => `${firstRow.item_id}-C${String(index + 1).padStart(2, "0")}`,
    );
    if (questions.some((question, index) => question.id !== expectedCardIds[index])) {
      throw new Error(`${firstRow.item}のカードIDがC01からの連番ではありません。`);
    }
    const readingMap = {};
    for (const { row, rowIndex } of itemRows) {
      for (const [written, reading] of Object.entries(
        geographyReadingMap(row.reading_map, rowIndex + 2),
      )) {
        if (readingMap[written] && readingMap[written] !== reading) {
          throw new Error(`${rowIndex + 2}行目の${written}の読みが同じ項目内で一致しません。`);
        }
        readingMap[written] = reading;
      }
    }
    const importanceRank = parseInteger(
      firstRow.importance_rank,
      "importance_rank",
      itemRows[0].rowIndex + 2,
    );
    return {
      id: firstRow.item_id,
      datasetLabel: firstRow.dataset_label,
      importanceRank,
      difficultyLabel: firstRow.difficulty_label,
      category: firstRow.item_type,
      subunit: firstRow.unit,
      term: firstRow.item,
      reading: firstRow.reading,
      aliases: geographyList(firstRow.aliases),
      prerequisiteIds: [],
      era: "",
      geography: {
        macroRegion: firstRow.domain,
        regionDetail: firstRow.unit,
        scale: firstRow.domain,
        splitMacroRegion: false,
      },
      chronology: {
        displayPeriod: "",
        sortYear: importanceRank,
      },
      referenceYear: "",
      classicalJapanese: {
        domain: firstRow.domain,
        unit: firstRow.unit,
        itemType: firstRow.item_type,
        grammarInfo: geographyValue(firstRow.grammar_info),
      },
      speechReadings: {
        [firstRow.item]: firstRow.reading,
        ...readingMap,
      },
      integratedAsExplanation: false,
      stages: { beginner: questions, reverse: [], integrated: [] },
      source: {
        name: firstRow.source_name,
        url: geographyValue(firstRow.source_url),
      },
    };
  });
}

export function validateClassicalJapaneseTerms(terms, { rankStart = 1 } = {}) {
  assertUnique(terms, (term) => term.id, "古文項目ID");
  assertUnique(terms, (term) => term.term, "古文項目名");
  assertUnique(terms, (term) => term.importanceRank, "古文重要度順位");
  assertUnique(
    terms.flatMap((term) => term.stages.beginner),
    (question) => question.id,
    "古文カードID",
  );
  const ranks = terms
    .map((term) => term.importanceRank)
    .sort((left, right) => left - right);
  if (ranks.some((rank, index) => rank !== rankStart + index)) {
    throw new Error(
      `古文の重要度順位は${rankStart}から${rankStart + terms.length - 1}までの連番にしてください。`,
    );
  }
  for (const term of terms) {
    const expectedId = `CJ-${String(term.importanceRank).padStart(6, "0")}`;
    if (term.id !== expectedId) {
      throw new Error(`${term.term}の項目IDと重要度順位が一致しません。`);
    }
    if (
      term.stages.beginner.length === 0 ||
      term.stages.beginner.length > 5 ||
      term.stages.reverse.length !== 0 ||
      term.stages.integrated.length !== 0
    ) {
      throw new Error(`${term.term}の古文カードの枚数または段階分けが正しくありません。`);
    }
    if (!classicalJapaneseDomains.has(term.classicalJapanese.domain)) {
      throw new Error(`${term.term}の分野が正しくありません。`);
    }
  }
}

export async function loadClassicalJapaneseDecks() {
  const entries = await readdir(classicalJapaneseSourceDirectory, {
    withFileTypes: true,
  });
  const sourcePaths = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".csv"))
    .map((entry) => path.join(classicalJapaneseSourceDirectory, entry.name))
    .sort();
  if (sourcePaths.length === 0) {
    throw new Error("古文の元CSVがありません。");
  }
  const decks = await Promise.all(
    sourcePaths.map(async (sourcePath) => {
      const sourceText = await readFile(sourcePath, "utf8");
      const terms = groupClassicalJapaneseTerms(
        toClassicalJapaneseObjects(parseCsv(sourceText)),
      );
      const datasetLabels = new Set(terms.map((term) => term.datasetLabel));
      const difficultyLabels = new Set(terms.map((term) => term.difficultyLabel));
      if (datasetLabels.size !== 1 || difficultyLabels.size !== 1) {
        throw new Error(`${path.basename(sourcePath)}の古文デッキ名が統一されていません。`);
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
        version: datasetVersion(classicalJapaneseSubjectId, id),
        contentVersion: sourceVersion(sourceText),
        datasetLabel,
        difficultyLabel: terms[0].difficultyLabel,
        terms,
      };
    }),
  );
  decks.sort((left, right) => left.number - right.number);
  assertUnique(decks, (deck) => deck.id, "古文Deck番号");
  const terms = decks.flatMap((deck) => deck.terms);
  validateClassicalJapaneseTerms(terms);
  return { decks, terms };
}

export function toClassicalChineseObjects(rows) {
  if (rows.length < 2) {
    throw new Error("漢文CSVに見出し行とデータ行が必要です。");
  }
  const headers = rows[0].map((header, index) =>
    index === 0 ? header.replace(/^\uFEFF/, "").trim() : header.trim(),
  );
  if (
    headers.length !== classicalChineseRequiredHeaders.length ||
    headers.some(
      (header, index) => header !== classicalChineseRequiredHeaders[index],
    )
  ) {
    throw new Error("漢文CSVの見出しまたは並び順が29列形式と一致しません。");
  }
  return rows.slice(1).map((cells, rowIndex) => {
    if (cells.length !== headers.length) {
      throw new Error(
        `${rowIndex + 2}行目の列数が見出しと一致しません（${cells.length}/${headers.length}）。`,
      );
    }
    const row = Object.fromEntries(
      headers.map((header, columnIndex) => [header, cells[columnIndex].trim()]),
    );
    for (const fieldName of classicalChineseRequiredHeaders) {
      assertRequiredText(row, fieldName, rowIndex + 2);
    }
    return row;
  });
}

function classicalChineseExplanation(row) {
  return [
    geographyValue(row.explanation),
    geographyValue(row.rule_info)
      ? `句法情報：${row.rule_info.replaceAll(";", "／")}`
      : "",
    geographyValue(row.confusable_with) && geographyValue(row.distinction)
      ? `区別：${row.confusable_with}とは、${row.distinction}`
      : "",
    geographyValue(row.memory_aid) ? `記憶補助：${row.memory_aid}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function classicalChineseExamplePrompt(row) {
  const original = geographyValue(row.example_original);
  const kundoku = geographyValue(row.example_kundoku);
  const kakikudashi = geographyValue(row.example_kakikudashi);
  return [
    original ? `原文：${original}` : "",
    kundoku ? `訓読用表記：${kundoku}` : "",
    kakikudashi && row.card_type !== "kakikudashi"
      ? `書き下し文：${kakikudashi}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function classicalChineseAnswerNote(row) {
  const kakikudashi = geographyValue(row.example_kakikudashi);
  const translation = geographyValue(row.example_translation);
  return [
    kakikudashi && kakikudashi !== row.answer
      ? `書き下し文：${kakikudashi}`
      : "",
    translation && translation !== row.answer ? `現代語訳：${translation}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function classicalChineseQuestionSpeech(row) {
  const hidesAnswerReading = ["reading", "saidoku"].includes(row.card_type);
  const exampleReading = hidesAnswerReading
    ? ""
    : geographyValue(row.example_reading);
  const spokenQuestion =
    row.card_type === "reading"
      ? "画面に表示されている語句は、漢文訓読でどう読むか。"
      : row.card_type === "saidoku"
        ? "画面に表示されている再読文字は、最初と二度目にそれぞれどう読むか。"
        : row.question;
  return [
    { text: spokenQuestion, language: "ja-JP" },
    ...(exampleReading
      ? [{ text: exampleReading, language: "ja-JP" }]
      : []),
  ];
}

function normalizeClassicalChineseQuestion(row, rowIndex) {
  const rowNumber = rowIndex + 2;
  if (!classicalChineseCardTypes.has(row.card_type)) {
    throw new Error(`${rowNumber}行目のcard_typeが正しくありません: ${row.card_type}`);
  }
  const sourceUrls = geographyList(row.source_url);
  if (sourceUrls.length === 0 || sourceUrls.some((url) => !/^https:\/\//.test(url))) {
    throw new Error(`${rowNumber}行目のsource_urlはhttpsのURLにしてください。`);
  }
  const exampleValues = [
    row.example_original,
    row.example_kundoku,
    row.example_kakikudashi,
    row.example_reading,
    row.example_translation,
  ].map(geographyValue);
  if (
    exampleValues.filter(Boolean).length !== 0 &&
    exampleValues.filter(Boolean).length !== exampleValues.length
  ) {
    throw new Error(
      `${rowNumber}行目の原文・訓読用表記・書き下し文・読み・現代語訳をすべて記入してください。`,
    );
  }
  const acceptedAnswers = geographyList(row.accepted_answers).filter(
    (answer) => answer !== row.answer,
  );
  const examplePrompt = classicalChineseExamplePrompt(row);
  const needsSafeQuestionSpeech = ["reading", "saidoku"].includes(
    row.card_type,
  );
  return {
    id: row.card_id,
    stage: "beginner",
    focus: row.focus,
    type: row.card_type,
    label: classicalChineseCardTypeLabels[row.card_type],
    prompt: [row.question, examplePrompt].filter(Boolean).join("\n"),
    answer: row.answer,
    keywords: [...new Set([row.answer, ...acceptedAnswers])],
    acceptedAnswers,
    answerNote: classicalChineseAnswerNote(row),
    explanation: classicalChineseExplanation(row),
    yearMnemonic: "",
    source: { name: row.source_name, url: row.source_url },
    hideTermUntilAnswer: [
      "term_from_meaning",
      "reading",
      "saidoku",
      "kakikudashi",
    ].includes(row.card_type),
    ...(needsSafeQuestionSpeech || geographyValue(row.example_reading)
      ? { speech: { question: classicalChineseQuestionSpeech(row) } }
      : {}),
  };
}

function assertSameClassicalChineseTermData(firstRow, row, rowNumber) {
  for (const fieldName of classicalChineseTermFields) {
    if (row[fieldName] !== firstRow[fieldName]) {
      throw new Error(
        `${rowNumber}行目の${fieldName}が同じ漢文項目のほかの行と一致しません。`,
      );
    }
  }
}

export function groupClassicalChineseTerms(rows) {
  const groups = [];
  const groupById = new Map();
  const cardIds = new Set();
  rows.forEach((row, rowIndex) => {
    if (cardIds.has(row.card_id)) {
      throw new Error(`漢文カードIDが重複しています: ${row.card_id}`);
    }
    cardIds.add(row.card_id);
    let group = groupById.get(row.item_id);
    if (!group) {
      group = { firstRow: row, rows: [] };
      groupById.set(row.item_id, group);
      groups.push(group);
    } else {
      assertSameClassicalChineseTermData(group.firstRow, row, rowIndex + 2);
    }
    group.rows.push({ row, rowIndex });
  });

  return groups.map(({ firstRow, rows: itemRows }) => {
    const questions = itemRows.map(({ row, rowIndex }) =>
      normalizeClassicalChineseQuestion(row, rowIndex),
    );
    const expectedCardIds = questions.map(
      (_, index) => `${firstRow.item_id}-C${String(index + 1).padStart(2, "0")}`,
    );
    if (questions.some((question, index) => question.id !== expectedCardIds[index])) {
      throw new Error(`${firstRow.item}のカードIDがC01からの連番ではありません。`);
    }
    const readingMap = {};
    for (const { row, rowIndex } of itemRows) {
      for (const [written, reading] of Object.entries(
        geographyReadingMap(row.reading_map, rowIndex + 2),
      )) {
        if (readingMap[written] && readingMap[written] !== reading) {
          throw new Error(`${rowIndex + 2}行目の${written}の読みが同じ項目内で一致しません。`);
        }
        readingMap[written] = reading;
      }
    }
    const importanceRank = parseInteger(
      firstRow.importance_rank,
      "importance_rank",
      itemRows[0].rowIndex + 2,
    );
    return {
      id: firstRow.item_id,
      datasetLabel: firstRow.dataset_label,
      importanceRank,
      difficultyLabel: firstRow.difficulty_label,
      category: firstRow.item_type,
      subunit: firstRow.unit,
      term: firstRow.item,
      reading: firstRow.reading,
      aliases: geographyList(firstRow.aliases),
      prerequisiteIds: [],
      era: "",
      geography: {
        macroRegion: firstRow.domain,
        regionDetail: firstRow.unit,
        scale: firstRow.domain,
        splitMacroRegion: false,
      },
      chronology: {
        displayPeriod: "",
        sortYear: importanceRank,
      },
      referenceYear: "",
      classicalChinese: {
        domain: firstRow.domain,
        unit: firstRow.unit,
        itemType: firstRow.item_type,
        ruleInfo: geographyValue(firstRow.rule_info),
      },
      speechReadings: {
        [firstRow.item]: firstRow.reading,
        ...readingMap,
      },
      integratedAsExplanation: false,
      stages: { beginner: questions, reverse: [], integrated: [] },
      source: { name: firstRow.source_name, url: firstRow.source_url },
    };
  });
}

export function validateClassicalChineseTerms(terms, { rankStart = 1 } = {}) {
  assertUnique(terms, (term) => term.id, "漢文項目ID");
  assertUnique(terms, (term) => term.term, "漢文項目名");
  assertUnique(terms, (term) => term.importanceRank, "漢文重要度順位");
  assertUnique(
    terms.flatMap((term) => term.stages.beginner),
    (question) => question.id,
    "漢文カードID",
  );
  const ranks = terms
    .map((term) => term.importanceRank)
    .sort((left, right) => left - right);
  if (ranks.some((rank, index) => rank !== rankStart + index)) {
    throw new Error(
      `漢文の重要度順位は${rankStart}から${rankStart + terms.length - 1}までの連番にしてください。`,
    );
  }
  for (const term of terms) {
    const expectedId = `CC-${String(term.importanceRank).padStart(6, "0")}`;
    if (term.id !== expectedId) {
      throw new Error(`${term.term}の項目IDと重要度順位が一致しません。`);
    }
    if (
      term.stages.beginner.length === 0 ||
      term.stages.beginner.length > 5 ||
      term.stages.reverse.length !== 0 ||
      term.stages.integrated.length !== 0
    ) {
      throw new Error(`${term.term}の漢文カードの枚数または段階分けが正しくありません。`);
    }
    if (!classicalChineseDomains.has(term.classicalChinese.domain)) {
      throw new Error(`${term.term}の分野が正しくありません。`);
    }
  }
}

export async function loadClassicalChineseDecks() {
  const entries = await readdir(classicalChineseSourceDirectory, {
    withFileTypes: true,
  });
  const sourcePaths = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".csv"))
    .map((entry) => path.join(classicalChineseSourceDirectory, entry.name))
    .sort();
  if (sourcePaths.length === 0) {
    throw new Error("漢文の元CSVがありません。");
  }
  const decks = await Promise.all(
    sourcePaths.map(async (sourcePath) => {
      const sourceText = await readFile(sourcePath, "utf8");
      const terms = groupClassicalChineseTerms(
        toClassicalChineseObjects(parseCsv(sourceText)),
      );
      const datasetLabels = new Set(terms.map((term) => term.datasetLabel));
      const difficultyLabels = new Set(terms.map((term) => term.difficultyLabel));
      if (datasetLabels.size !== 1 || difficultyLabels.size !== 1) {
        throw new Error(`${path.basename(sourcePath)}の漢文デッキ名が統一されていません。`);
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
        version: datasetVersion(classicalChineseSubjectId, id),
        contentVersion: sourceVersion(sourceText),
        datasetLabel,
        difficultyLabel: terms[0].difficultyLabel,
        terms,
      };
    }),
  );
  decks.sort((left, right) => left.number - right.number);
  assertUnique(decks, (deck) => deck.id, "漢文Deck番号");
  const terms = decks.flatMap((deck) => deck.terms);
  validateClassicalChineseTerms(terms);
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
    requireComplete = true,
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
  const termIdByQuestionId = new Map(
    terms.flatMap((term) =>
      Object.values(term.stages)
        .flat()
        .map((question) => [question.id, term.id]),
    ),
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
  if (requireComplete && fallbackTermIds.size !== termIds.size) {
    throw new Error(
      `用語の基準画像が不足しています（${fallbackTermIds.size}/${termIds.size}）。`,
    );
  }
  const expectedQuestionIds = new Set(
    [...termIdByQuestionId]
      .filter(([, termId]) => fallbackTermIds.has(termId))
      .map(([questionId]) => questionId),
  );
  const assignedQuestionIds = new Set();
  for (const assignment of manifest.assignments) {
    if (
      !questionIds.has(assignment.questionId) ||
      assignedQuestionIds.has(assignment.questionId) ||
      !termIds.has(assignment.termId) ||
      termIdByQuestionId.get(assignment.questionId) !== assignment.termId ||
      !fallbackTermIds.has(assignment.termId) ||
      !assetIds.has(assignment.assetId) ||
      !String(assignment.target ?? "").trim()
    ) {
      throw new Error(`問題別画像の割り当てが不正です: ${assignment.questionId}`);
    }
    assignedQuestionIds.add(assignment.questionId);
  }
  if (
    assignedQuestionIds.size !== expectedQuestionIds.size ||
    [...expectedQuestionIds].some((questionId) => !assignedQuestionIds.has(questionId))
  ) {
    throw new Error(
      `問題別画像の割り当てが不足しています（${assignedQuestionIds.size}/${expectedQuestionIds.size}）。`,
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
      termUnitLabel: definition.termUnitLabel ?? "語",
      filterLabels: definition.filterLabels,
      stageLabels: definition.stageLabels,
      availableStages: definition.availableStages ?? allowedStages,
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
    termUnitLabel: definition.termUnitLabel ?? "語",
    datasetLabel: `${definition.catalogLabel}｜${range}`,
    termCount: terms.length,
    questionCount,
    indexPath: deckEntries[0].indexPath,
    defaultDeckId: deckEntries[0].id,
    decks: deckEntries,
  };
}

export async function main() {
  const [
    worldHistoryData,
    japaneseHistoryData,
    englishData,
    geographyData,
    politicsEconomicsData,
    biologyData,
    earthScienceData,
    classicalJapaneseData,
    classicalChineseData,
  ] = await Promise.all([
    loadSourceDecks(),
    loadJapaneseHistoryDecks(),
    loadEnglishDecks(),
    loadGeographyDecks(),
    loadPoliticsEconomicsDecks(),
    loadBiologyDecks(),
    loadEarthScienceDecks(),
    loadClassicalJapaneseDecks(),
    loadClassicalChineseDecks(),
  ]);
  const [
    worldTermImageManifest,
    japaneseTermImageManifest,
    geographyTermImageManifest,
    biologyTermImageManifest,
    earthScienceTermImageManifest,
  ] = await Promise.all([
    loadTermImageManifest(worldHistoryData.terms),
    loadTermImageManifest(japaneseHistoryData.terms, {
      manifestPath: japaneseTermImageManifestPath,
      imageSourceDirectory: japaneseSourceDirectory,
    }),
    loadTermImageManifest(geographyData.terms, {
      manifestPath: geographyTermImageManifestPath,
      imageSourceDirectory: geographySourceDirectory,
      requireComplete: false,
    }),
    loadTermImageManifest(biologyData.terms, {
      manifestPath: biologyTermImageManifestPath,
      imageSourceDirectory: biologySourceDirectory,
      requireComplete: false,
    }),
    loadTermImageManifest(earthScienceData.terms, {
      manifestPath: earthScienceTermImageManifestPath,
      imageSourceDirectory: earthScienceSourceDirectory,
      requireComplete: false,
    }),
  ]);
  const termImageManifest = mergeTermImageManifests([
    worldTermImageManifest,
    japaneseTermImageManifest,
    geographyTermImageManifest,
    biologyTermImageManifest,
    earthScienceTermImageManifest,
  ]);

  const allDecks = [
    ...worldHistoryData.decks,
    ...japaneseHistoryData.decks,
    ...englishData.decks,
    ...geographyData.decks,
    ...politicsEconomicsData.decks,
    ...biologyData.decks,
    ...earthScienceData.decks,
    ...classicalJapaneseData.decks,
    ...classicalChineseData.decks,
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
    if (geographyTermImageManifest.assets.length > 0) {
      await cp(
        path.join(geographySourceDirectory, "term-images"),
        path.join(outputRoot, "term-images"),
        { recursive: true },
      );
    }
    if (biologyTermImageManifest.assets.length > 0) {
      await cp(
        path.join(biologySourceDirectory, "term-images"),
        path.join(outputRoot, "term-images"),
        { recursive: true },
      );
    }
    if (earthScienceTermImageManifest.assets.length > 0) {
      await cp(
        path.join(earthScienceSourceDirectory, "term-images"),
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
    writeSubjectData(
      {
        id: geographySubjectId,
        title: geographySubjectTitle,
        catalogLabel: "大学受験地理",
        description: "用語・位置・分布・代表例から全範囲の骨格を覚える大学受験地理",
        learningType: "cards",
        termUnitLabel: "項目",
        availableStages: ["beginner"],
        filterLabels: {
          macroRegion: "尺度",
          regionDetail: "地域",
          category: "単元",
        },
        stageLabels: {
          all: "すべてのカード",
          beginner: "暗記カード",
        },
      },
      geographyData.decks,
    ),
    writeSubjectData(
      {
        id: politicsEconomicsSubjectId,
        title: politicsEconomicsSubjectTitle,
        catalogLabel: "大学受験政治・経済",
        description: "公共・政治・法・経済・国際分野の最重要事項を覚える大学受験政治・経済",
        learningType: "cards",
        termUnitLabel: "項目",
        availableStages: ["beginner"],
        filterLabels: {
          macroRegion: "領域",
          regionDetail: "小分類",
          category: "大分類",
        },
        stageLabels: {
          all: "すべてのカード",
          beginner: "暗記カード",
        },
      },
      politicsEconomicsData.decks,
    ),
    writeSubjectData(
      {
        id: biologySubjectId,
        title: biologySubjectTitle,
        catalogLabel: "大学受験生物基礎",
        description: "細胞・遺伝子・体内環境・免疫・生態系の最重要事項を覚える生物基礎",
        learningType: "cards",
        termUnitLabel: "項目",
        availableStages: ["beginner"],
        filterLabels: {
          macroRegion: "大項目",
          regionDetail: "小項目",
        },
        stageLabels: {
          all: "すべてのカード",
          beginner: "暗記カード",
        },
      },
      biologyData.decks,
    ),
    writeSubjectData(
      {
        id: earthScienceSubjectId,
        title: earthScienceSubjectTitle,
        catalogLabel: "大学受験地学基礎",
        description: "地球・大気・海洋・地質・天体の最重要事項を覚える地学基礎",
        learningType: "cards",
        termUnitLabel: "項目",
        availableStages: ["beginner"],
        filterLabels: {
          macroRegion: "大項目",
          regionDetail: "小項目",
        },
        stageLabels: {
          all: "すべてのカード",
          beginner: "暗記カード",
        },
      },
      earthScienceData.decks,
    ),
    writeSubjectData(
      {
        id: classicalJapaneseSubjectId,
        title: classicalJapaneseSubjectTitle,
        catalogLabel: "大学受験古文（国語）",
        description: "古語・文法・敬語・修辞・古典常識の最重要事項を覚える大学受験古文",
        learningType: "cards",
        termUnitLabel: "項目",
        availableStages: ["beginner"],
        filterLabels: {
          macroRegion: "分野",
          regionDetail: "単元",
          category: "項目種別",
        },
        stageLabels: {
          all: "すべてのカード",
          beginner: "暗記カード",
        },
      },
      classicalJapaneseData.decks,
    ),
    writeSubjectData(
      {
        id: classicalChineseSubjectId,
        title: classicalChineseSubjectTitle,
        catalogLabel: "大学受験漢文（国語）",
        description: "重要語・訓読・返り点・再読文字・句法の最重要事項を覚える大学受験漢文",
        learningType: "cards",
        termUnitLabel: "項目",
        availableStages: ["beginner"],
        filterLabels: {
          macroRegion: "分野",
          regionDetail: "単元",
          category: "項目種別",
        },
        stageLabels: {
          all: "すべてのカード",
          beginner: "暗記カード",
        },
      },
      classicalChineseData.decks,
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
  const geographyCounts = countQuestionsByStage(geographyData.terms);
  const politicsEconomicsCounts = countQuestionsByStage(
    politicsEconomicsData.terms,
  );
  const biologyCounts = countQuestionsByStage(biologyData.terms);
  const earthScienceCounts = countQuestionsByStage(earthScienceData.terms);
  const classicalJapaneseCounts = countQuestionsByStage(
    classicalJapaneseData.terms,
  );
  const classicalChineseCounts = countQuestionsByStage(
    classicalChineseData.terms,
  );
  console.log(
    `世界史${worldHistoryData.decks.length}デッキ・${worldHistoryData.terms.length}語・${Object.values(worldCounts).reduce((sum, count) => sum + count, 0)}問、日本史${japaneseHistoryData.decks.length}デッキ・${japaneseHistoryData.terms.length}語・${Object.values(japaneseCounts).reduce((sum, count) => sum + count, 0)}問、英単語${englishData.decks.length}デッキ・${englishData.terms.length}語・${Object.values(englishCounts).reduce((sum, count) => sum + count, 0)}問、地理${geographyData.decks.length}デッキ・${geographyData.terms.length}項目・${Object.values(geographyCounts).reduce((sum, count) => sum + count, 0)}問、政治・経済${politicsEconomicsData.decks.length}デッキ・${politicsEconomicsData.terms.length}項目・${Object.values(politicsEconomicsCounts).reduce((sum, count) => sum + count, 0)}問、生物基礎${biologyData.decks.length}デッキ・${biologyData.terms.length}項目・${Object.values(biologyCounts).reduce((sum, count) => sum + count, 0)}問、地学基礎${earthScienceData.decks.length}デッキ・${earthScienceData.terms.length}項目・${Object.values(earthScienceCounts).reduce((sum, count) => sum + count, 0)}問、古文${classicalJapaneseData.decks.length}デッキ・${classicalJapaneseData.terms.length}項目・${Object.values(classicalJapaneseCounts).reduce((sum, count) => sum + count, 0)}問、漢文${classicalChineseData.decks.length}デッキ・${classicalChineseData.terms.length}項目・${Object.values(classicalChineseCounts).reduce((sum, count) => sum + count, 0)}問を生成しました。`,
  );
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main();
}
