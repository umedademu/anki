import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  countQuestionsByStage,
  loadBiologyDecks,
  loadClassicalChineseDecks,
  loadClassicalJapaneseDecks,
  loadEarthScienceDecks,
  loadEnglishDecks,
  loadGeographyDecks,
  loadJapaneseHistoryDecks,
  loadMindsetDecks,
  loadPoliticsEconomicsDecks,
  loadSourceDecks,
  loadTermImageManifest,
  mergeTermImageManifests,
  parseCsv,
  toClassicalChineseObjects,
  toClassicalJapaneseObjects,
} from "./build-learning-data.mjs";
import {
  targetFileOverrides,
  targetKey,
  termFileOverrides,
} from "./prepare-question-images.mjs";
import { getQuestionPromptForDisplay } from "../public/learning-engine.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = path.join(projectRoot, "public", "data");
const readJson = async (relativePath) =>
  JSON.parse(await readFile(path.join(dataRoot, relativePath), "utf8"));
const digestJson = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const splitMnemonicList = (value) =>
  String(value ?? "")
    .split("|")
    .map((mnemonic) => mnemonic.trim())
    .filter(Boolean);
const countValues = (values) =>
  values.reduce(
    (counts, value) => ({ ...counts, [value]: (counts[value] ?? 0) + 1 }),
    {},
  );

const expectedSpecs = new Map([
  [
    "deck-1",
    {
      number: 1,
      version: "0836119c5d45",
      contentVersion: "9665b14e4331",
      datasetLabel: "世界史段階別デッキ｜Deck 1｜最重要骨格400語",
      difficultyLabel: "Deck 1｜骨格・基礎",
      termCount: 400,
      questionCount: 2782,
      questionCounts: { beginner: 1200, reverse: 1182, integrated: 400 },
      mnemonicCount: 386,
      distinctMnemonicCount: 122,
      exactDateQuestionCount: 116,
      exactDateTermCount: 59,
      datedPeriodQuestionCount: 781,
      datedPeriodTermCount: 399,
      datedPeriodExpressionCount: 399,
    },
  ],
  [
    "deck-2",
    {
      number: 2,
      version: "8acba0d50165",
      contentVersion: "79014ce3e8d2",
      datasetLabel: "世界史段階別デッキ｜Deck 2｜共通テスト基礎400語",
      difficultyLabel: "Deck 2｜骨格・基礎",
      termCount: 400,
      questionCount: 2400,
      questionCounts: { beginner: 1200, reverse: 800, integrated: 400 },
      mnemonicCount: 271,
      distinctMnemonicCount: 82,
      exactDateQuestionCount: 133,
      exactDateTermCount: 69,
      datedPeriodQuestionCount: 780,
      datedPeriodTermCount: 390,
      datedPeriodExpressionCount: 392,
    },
  ],
  [
    "deck-3",
    {
      number: 3,
      version: "7edfff4529a4",
      contentVersion: "0371038da60b",
      datasetLabel: "世界史段階別デッキ｜Deck 3｜主要王朝・人物・制度の穴埋め400語",
      difficultyLabel: "Deck 3｜標準",
      termCount: 400,
      questionCount: 2400,
      questionCounts: { beginner: 1200, reverse: 800, integrated: 400 },
      mnemonicCount: 124,
      distinctMnemonicCount: 39,
      exactDateQuestionCount: 134,
      exactDateTermCount: 67,
      datedPeriodQuestionCount: 780,
      datedPeriodTermCount: 390,
      datedPeriodExpressionCount: 390,
    },
  ],
]);

const expectedEnglishSpecs = new Map([
  [
    "deck-1",
    {
      number: 1,
      version: "en-6984fb69efaf",
      contentVersion: "6984fb69efaf",
      datasetLabel: "英単語段階別デッキ｜Deck 1｜基礎確認500語",
      difficultyLabel: "Deck 1｜基礎確認",
      termCount: 500,
      questionCount: 1500,
    },
  ],
  [
    "deck-2",
    {
      number: 2,
      version: "en-abb710688392",
      contentVersion: "abb710688392",
      datasetLabel: "英単語段階別デッキ｜Deck 2｜受験基礎500語",
      difficultyLabel: "Deck 2｜受験基礎",
      termCount: 500,
      questionCount: 1500,
    },
  ],
  [
    "deck-3",
    {
      number: 3,
      version: "en-6397b7943e25",
      contentVersion: "6397b7943e25",
      datasetLabel: "英単語段階別デッキ｜Deck 3｜共通テスト基礎500語",
      difficultyLabel: "Deck 3｜共通テスト基礎",
      termCount: 500,
      questionCount: 1500,
    },
  ],
]);

const expectedJapaneseSpec = {
  number: 1,
  version: "jh-455fb6def169",
  contentVersion: "30424e3a962e",
  datasetLabel: "日本史段階別デッキ｜Deck 1｜日本史の最重要骨格400語",
  difficultyLabel: "Deck 1｜骨格・基礎",
  termCount: 400,
  questionCount: 2800,
  questionCounts: { beginner: 1200, reverse: 1200, integrated: 400 },
  mnemonicCount: 231,
};

const expectedGeographySpec = {
  number: 1,
  version: "geography-deck-1-v1",
  contentVersion: "56a1cc5bd8d2",
  datasetLabel: "大学受験地理_Deck1_全範囲の骨格",
  difficultyLabel: "Deck 1｜全範囲の骨格",
  termCount: 400,
  questionCount: 400,
  questionCounts: { beginner: 400, reverse: 0, integrated: 0 },
};

const expectedBiologySpec = {
  number: 1,
  version: "biology-basics-deck-1-v1",
  contentVersion: "a56fb069ec50",
  datasetLabel: "生物基礎_Deck1_最重要骨格",
  difficultyLabel: "Deck1・最重要骨格",
  termCount: 300,
  questionCount: 300,
  questionCounts: { beginner: 300, reverse: 0, integrated: 0 },
};

const expectedEarthScienceSpec = {
  number: 1,
  version: "earth-science-basics-deck-1-v1",
  contentVersion: "57a5a5de20e0",
  datasetLabel: "地学基礎 Deck1 全範囲最重要骨格",
  difficultyLabel: "Deck1｜全範囲の最重要骨格",
  termCount: 300,
  questionCount: 384,
  questionCounts: { beginner: 384, reverse: 0, integrated: 0 },
};

const expectedPoliticsEconomicsSpec = {
  number: 1,
  version: "politics-economics-deck-1-v1",
  contentVersion: "8410f76753f2",
  datasetLabel: "政治・経済 Deck 1 公共・政治・経済の骨格",
  difficultyLabel: "Deck 1・骨格",
  termCount: 400,
  questionCount: 400,
  questionCounts: { beginner: 400, reverse: 0, integrated: 0 },
};

const expectedClassicalJapaneseSpecs = new Map([
  [
    "deck-1",
    {
      number: 1,
      version: "classical-japanese-word-deck-1-v1",
      contentVersion: "8308d65d93ed",
      datasetLabel: "古文単語_単語Deck1_最重要古文単語_300",
      difficultyLabel: "単語Deck1_最重要古文単語",
      termCount: 300,
      questionCount: 300,
      questionCounts: { beginner: 300, reverse: 0, integrated: 0 },
      sourceRowCount: 549,
      rankStart: 1,
      unitCount: 7,
    },
  ],
  [
    "deck-2",
    {
      number: 2,
      version: "classical-japanese-word-deck-2-v1",
      contentVersion: "93ff5dc34586",
      datasetLabel: "古文単語_単語Deck2_共通テスト・受験標準_300",
      difficultyLabel: "単語Deck2_共通テスト・受験標準",
      termCount: 300,
      questionCount: 300,
      questionCounts: { beginner: 300, reverse: 0, integrated: 0 },
      sourceRowCount: 521,
      rankStart: 301,
      unitCount: 10,
    },
  ],
  [
    "deck-3",
    {
      number: 3,
      version: "classical-japanese-word-deck-3-v1",
      contentVersion: "fd9992fed403",
      datasetLabel: "古文単語_単語Deck3_難関大・東大向け_300",
      difficultyLabel: "単語Deck3_難関大・東大向け",
      termCount: 300,
      questionCount: 300,
      questionCounts: { beginner: 300, reverse: 0, integrated: 0 },
      sourceRowCount: 446,
      rankStart: 601,
      unitCount: 9,
    },
  ],
]);

const expectedClassicalChineseSpecs = new Map([
  [
    "deck-1",
    {
      number: 1,
      version: "classical-chinese-deck-1-v2",
      contentVersion: "93a7f9c647a7",
      datasetLabel: "漢文 意味瞬発 Deck1 最重要250項目",
      difficultyLabel: "Deck1 最重要・意味瞬発",
      termCount: 250,
      questionCount: 250,
      questionCounts: { beginner: 250, reverse: 0, integrated: 0 },
      rankStart: 1,
      unitCount: 135,
      itemTypeCount: 61,
      domainCounts: { 句法: 101, 再読文字: 9, 重要語: 140 },
    },
  ],
  [
    "deck-2",
    {
      number: 2,
      version: "classical-chinese-deck-2-v1",
      contentVersion: "5e80f6eec792",
      datasetLabel: "漢文 意味瞬発 Deck2 共通テスト完成250項目",
      difficultyLabel: "Deck2 共通テスト完成・意味瞬発",
      termCount: 250,
      questionCount: 250,
      questionCounts: { beginner: 250, reverse: 0, integrated: 0 },
      rankStart: 251,
      unitCount: 162,
      itemTypeCount: 49,
      domainCounts: { 句法: 60, 重要語: 190 },
    },
  ],
  [
    "deck-3",
    {
      number: 3,
      version: "classical-chinese-deck-3-v1",
      contentVersion: "f5a645ea12e3",
      datasetLabel: "漢文 意味瞬発 Deck3 難関大向け200項目",
      difficultyLabel: "Deck3 難関大向け・意味瞬発",
      termCount: 200,
      questionCount: 200,
      questionCounts: { beginner: 200, reverse: 0, integrated: 0 },
      rankStart: 501,
      unitCount: 144,
      itemTypeCount: 34,
      domainCounts: { 句法: 40, 重要語: 160 },
    },
  ],
  [
    "deck-4",
    {
      number: 4,
      version: "classical-chinese-deck-4-v1",
      contentVersion: "cd185da28b4d",
      datasetLabel: "漢文 Deck4 漢文ルール 100項目",
      difficultyLabel: "Deck4 漢文ルール・全範囲",
      termCount: 100,
      questionCount: 112,
      questionCounts: { beginner: 112, reverse: 0, integrated: 0 },
      sourceRowCount: 112,
      rankStart: 701,
      unitCount: 6,
      itemTypeCount: 16,
      domainCounts: { 再読文字: 13, 句法: 20, 置き字: 10, 訓読: 33, 返り点: 24 },
      questionTypeCounts: {
        construction: 15,
        identification: 13,
        kundoku_order: 23,
        meaning: 12,
        okurigana: 25,
        saidoku: 12,
        term_from_meaning: 12,
      },
      focusCounts: {
        再読文字の規則: 12,
        定義から用語: 12,
        文法規則: 13,
        書き下しの規則: 25,
        機能語の働き: 15,
        用語から定義: 12,
        返り点の規則: 23,
      },
      standardRuleCards: true,
    },
  ],
]);

const { decks: sourceDecks, terms: expectedTerms } = await loadSourceDecks();
const {
  decks: sourceJapaneseDecks,
  terms: expectedJapaneseTerms,
} = await loadJapaneseHistoryDecks();
const {
  decks: sourceGeographyDecks,
  terms: expectedGeographyTerms,
} = await loadGeographyDecks();
const {
  decks: sourceBiologyDecks,
  terms: expectedBiologyTerms,
} = await loadBiologyDecks();
const {
  decks: sourcePoliticsEconomicsDecks,
  terms: expectedPoliticsEconomicsTerms,
} = await loadPoliticsEconomicsDecks();
const {
  decks: sourceEarthScienceDecks,
  terms: expectedEarthScienceTerms,
} = await loadEarthScienceDecks();
const {
  decks: sourceClassicalJapaneseDecks,
  terms: expectedClassicalJapaneseTerms,
} = await loadClassicalJapaneseDecks();
const {
  decks: sourceClassicalChineseDecks,
  terms: expectedClassicalChineseTerms,
} = await loadClassicalChineseDecks();
const {
  decks: sourceMindsetDecks,
  terms: expectedMindsetTerms,
} = await loadMindsetDecks();
const sourceDeckById = new Map(sourceDecks.map((deck) => [deck.id, deck]));
if (
  sourceDecks.length !== 3 ||
  sourceDecks.some((deck) => !expectedSpecs.has(deck.id))
) {
  throw new Error("元CSVがDeck 1〜Deck 3の3冊構成になっていません。");
}

const catalog = await readJson("index.json");
if (
  catalog.schemaVersion !== 3 ||
  catalog.subjects.length !== 10 ||
  catalog.subjects.map((subject) => subject.id).join(",") !==
    "world-history,japanese-history,english-vocabulary,geography,politics-economics,biology-basics,earth-science-basics,classical-japanese,classical-chinese,mindset"
) {
  throw new Error(
    "世界史・日本史・英単語・地理・政治・経済・生物基礎・地学基礎・古文・漢文・マインドセットの科目一覧が正しくありません。",
  );
}
const subjectEntry = catalog.subjects.find(
  (subject) => subject.id === "world-history",
);
const englishSubjectEntry = catalog.subjects.find(
  (subject) => subject.id === "english-vocabulary",
);
const japaneseSubjectEntry = catalog.subjects.find(
  (subject) => subject.id === "japanese-history",
);
const geographySubjectEntry = catalog.subjects.find(
  (subject) => subject.id === "geography",
);
const politicsEconomicsSubjectEntry = catalog.subjects.find(
  (subject) => subject.id === "politics-economics",
);
const biologySubjectEntry = catalog.subjects.find(
  (subject) => subject.id === "biology-basics",
);
const earthScienceSubjectEntry = catalog.subjects.find(
  (subject) => subject.id === "earth-science-basics",
);
const classicalJapaneseSubjectEntry = catalog.subjects.find(
  (subject) => subject.id === "classical-japanese",
);
const classicalChineseSubjectEntry = catalog.subjects.find(
  (subject) => subject.id === "classical-chinese",
);
const mindsetSubjectEntry = catalog.subjects.find(
  (subject) => subject.id === "mindset",
);
if (
  subjectEntry.id !== "world-history" ||
  subjectEntry.indexPath !== "subjects/world-history/index.json" ||
  subjectEntry.defaultDeckId !== "deck-1" ||
  !Array.isArray(subjectEntry.decks) ||
  subjectEntry.decks.length !== 3 ||
  subjectEntry.decks.map((deck) => deck.id).join(",") !== "deck-1,deck-2,deck-3"
) {
  throw new Error("開始画面用のDeck一覧が正しくありません。");
}

const generatedDecks = [];
for (const deckEntry of subjectEntry.decks) {
  const sourceDeck = sourceDeckById.get(deckEntry.id);
  const spec = expectedSpecs.get(deckEntry.id);
  if (!sourceDeck || !spec) throw new Error(`想定外のDeckです: ${deckEntry.id}`);

  const subject = await readJson(deckEntry.indexPath);
  if (
    subject.schemaVersion !== 3 ||
    subject.id !== "world-history" ||
    subject.deckId !== deckEntry.id ||
    subject.deckNumber !== spec.number ||
    subject.masteryTarget !== 2
  ) {
    throw new Error(`${deckEntry.id}の科目情報の形式が正しくありません。`);
  }
  const chunks = await Promise.all(subject.chunks.map((chunk) => readJson(chunk.path)));
  if (
    chunks.some(
      (chunk) =>
        chunk.schemaVersion !== 3 ||
        chunk.subjectId !== "world-history" ||
        chunk.deckId !== deckEntry.id,
    )
  ) {
    throw new Error(`${deckEntry.id}の分割データに別Deckまたは旧形式が混在しています。`);
  }
  const terms = chunks.flatMap((chunk) => chunk.terms);
  const questionCounts = countQuestionsByStage(terms);
  const questionCount = Object.values(questionCounts).reduce(
    (sum, count) => sum + count,
    0,
  );
  if (
    terms.length !== spec.termCount ||
    questionCount !== spec.questionCount ||
    JSON.stringify(questionCounts) !== JSON.stringify(spec.questionCounts) ||
    JSON.stringify(terms) !== JSON.stringify(sourceDeck.terms)
  ) {
    throw new Error(`${deckEntry.id}の生成内容が元CSVと一致しません。`);
  }
  if (
    subject.datasetLabel !== spec.datasetLabel ||
    subject.difficultyLabel !== spec.difficultyLabel ||
    subject.version !== sourceDeck.version ||
    (spec.version && subject.version !== spec.version) ||
    subject.contentVersion !== sourceDeck.contentVersion ||
    subject.contentVersion !== spec.contentVersion ||
    subject.sourceFile !== sourceDeck.sourceFile ||
    subject.termCount !== spec.termCount ||
    subject.questionCount !== spec.questionCount ||
    JSON.stringify(subject.questionCounts) !== JSON.stringify(spec.questionCounts) ||
    deckEntry.datasetLabel !== spec.datasetLabel ||
    deckEntry.difficultyLabel !== spec.difficultyLabel ||
    deckEntry.version !== sourceDeck.version ||
    deckEntry.contentVersion !== sourceDeck.contentVersion ||
    deckEntry.termCount !== spec.termCount ||
    deckEntry.questionCount !== spec.questionCount
  ) {
    throw new Error(`${deckEntry.id}の名称・版・件数が一致しません。`);
  }
  if (
    subject.chunks.length !== 8 ||
    subject.chunks.some((chunk) => chunk.count !== 50)
  ) {
    throw new Error(`${deckEntry.id}が50語ずつ8個へ分割されていません。`);
  }

  const questions = terms.flatMap((term) => Object.values(term.stages).flat());
  const mnemonicQuestions = questions.filter((question) => question.yearMnemonic);
  if (
    mnemonicQuestions.length !== spec.mnemonicCount ||
    new Set(mnemonicQuestions.map((question) => question.yearMnemonic)).size !==
      spec.distinctMnemonicCount ||
    questions.some((question) => typeof question.yearMnemonic !== "string")
  ) {
    throw new Error(`${deckEntry.id}の年号語呂合わせが元CSVどおりではありません。`);
  }

  const exactDatePattern = /^(?:紀元前|前)?\d{1,4}年(?:\d{1,2}月(?:\d{1,2}日)?)?$/;
  const exactDateTerms = terms.filter((term) =>
    Object.values(term.stages)
      .flat()
      .some((question) =>
        exactDatePattern.test(question.answer.replaceAll("**", "").trim()),
      ),
  );
  const exactDateQuestions = exactDateTerms.flatMap((term) =>
    Object.values(term.stages)
      .flat()
      .filter((question) =>
        exactDatePattern.test(question.answer.replaceAll("**", "").trim()),
      ),
  );
  if (
    exactDateQuestions.length !== spec.exactDateQuestionCount ||
    exactDateTerms.length !== spec.exactDateTermCount ||
    exactDateTerms.some((term) => {
      const targetQuestions = Object.values(term.stages)
        .flat()
        .filter((question) =>
          exactDatePattern.test(question.answer.replaceAll("**", "").trim()),
        );
      const mnemonics = new Set(
        targetQuestions.map((question) => question.yearMnemonic),
      );
      const integratedMnemonics = new Set(
        term.stages.integrated[0].yearMnemonic
          .split("|")
          .map((mnemonic) => mnemonic.trim())
          .filter(Boolean),
      );
      return (
        mnemonics.size !== 1 ||
        !splitMnemonicList([...mnemonics][0]).every((mnemonic) =>
          integratedMnemonics.has(mnemonic),
        )
      );
    })
  ) {
    throw new Error(
      `${deckEntry.id}の単一年・年月・年月日の語呂合わせが不統一です。`,
    );
  }

  const datedPeriodTerms = terms.filter((term) =>
    Object.values(term.stages)
      .flat()
      .some(
        (question) =>
          question.type === "time" &&
          /\d/.test(question.answer.replaceAll("**", "").trim()),
      ),
  );
  const datedPeriodQuestions = datedPeriodTerms.flatMap((term) =>
    Object.values(term.stages)
      .flat()
      .filter(
        (question) =>
          question.type === "time" &&
          /\d/.test(question.answer.replaceAll("**", "").trim()),
      ),
  );
  const datedPeriodExpressions = new Set(
    datedPeriodQuestions.map(
      (question) =>
        `${question.id.split("-").slice(0, 2).join("-")}\0${question.answer
          .replaceAll("**", "")
          .trim()}`,
    ),
  );
  if (
    datedPeriodQuestions.length !== spec.datedPeriodQuestionCount ||
    datedPeriodTerms.length !== spec.datedPeriodTermCount ||
    datedPeriodExpressions.size !== spec.datedPeriodExpressionCount ||
    datedPeriodTerms.some((term) => {
      const targetQuestions = Object.values(term.stages)
        .flat()
        .filter(
          (question) =>
            question.type === "time" &&
            /\d/.test(question.answer.replaceAll("**", "").trim()),
        );
      const mnemonicsByAnswer = new Map();
      for (const question of targetQuestions) {
        const answer = question.answer.replaceAll("**", "").trim();
        const mnemonics = mnemonicsByAnswer.get(answer) ?? new Set();
        mnemonics.add(question.yearMnemonic);
        mnemonicsByAnswer.set(answer, mnemonics);
      }
      const integratedMnemonics = new Set(
        term.stages.integrated[0].yearMnemonic
          .split("|")
          .map((mnemonic) => mnemonic.trim())
          .filter(Boolean),
      );
      return [...mnemonicsByAnswer.values()].some(
        (mnemonics) =>
          mnemonics.size !== 1 ||
          !splitMnemonicList([...mnemonics][0]).every((mnemonic) =>
            integratedMnemonics.has(mnemonic),
          ),
      );
    })
  ) {
    throw new Error(
      `${deckEntry.id}の数字を含む時期問題の語呂合わせが不統一です。`,
    );
  }
  generatedDecks.push({ entry: deckEntry, subject, terms, questions });
}

const generatedTerms = generatedDecks.flatMap((deck) => deck.terms);
const generatedQuestions = generatedDecks.flatMap((deck) => deck.questions);
const generatedCounts = countQuestionsByStage(generatedTerms);
if (
  generatedTerms.length !== 1200 ||
  generatedQuestions.length !== 7582 ||
  JSON.stringify(generatedCounts) !==
    JSON.stringify({ beginner: 3600, reverse: 2782, integrated: 1200 }) ||
  JSON.stringify(generatedTerms) !== JSON.stringify(expectedTerms) ||
  subjectEntry.datasetLabel !== "世界史段階別デッキ｜Deck 1〜3" ||
  subjectEntry.termCount !== 1200 ||
  subjectEntry.questionCount !== 7582
) {
  throw new Error("Deck 1〜Deck 3の総件数または統合索引が一致しません。");
}

if (
  sourceJapaneseDecks.length !== 1 ||
  !japaneseSubjectEntry ||
  japaneseSubjectEntry.defaultDeckId !== "deck-1" ||
  japaneseSubjectEntry.datasetLabel !== "日本史段階別デッキ｜Deck 1" ||
  japaneseSubjectEntry.termCount !== expectedJapaneseSpec.termCount ||
  japaneseSubjectEntry.questionCount !== expectedJapaneseSpec.questionCount ||
  japaneseSubjectEntry.decks.length !== 1
) {
  throw new Error("日本史Deck 1の科目一覧が正しくありません。");
}
const sourceJapaneseDeck = sourceJapaneseDecks[0];
const japaneseDeckEntry = japaneseSubjectEntry.decks[0];
const japaneseSubject = await readJson(japaneseDeckEntry.indexPath);
const japaneseChunks = await Promise.all(
  japaneseSubject.chunks.map((chunk) => readJson(chunk.path)),
);
const generatedJapaneseTerms = japaneseChunks.flatMap((chunk) => chunk.terms);
const generatedJapaneseQuestions = generatedJapaneseTerms.flatMap((term) =>
  Object.values(term.stages).flat(),
);
const generatedJapaneseCounts = countQuestionsByStage(generatedJapaneseTerms);
if (
  japaneseDeckEntry.number !== expectedJapaneseSpec.number ||
  japaneseDeckEntry.version !== expectedJapaneseSpec.version ||
  japaneseDeckEntry.contentVersion !== expectedJapaneseSpec.contentVersion ||
  japaneseDeckEntry.datasetLabel !== expectedJapaneseSpec.datasetLabel ||
  japaneseDeckEntry.difficultyLabel !== expectedJapaneseSpec.difficultyLabel ||
  japaneseDeckEntry.termCount !== expectedJapaneseSpec.termCount ||
  japaneseDeckEntry.questionCount !== expectedJapaneseSpec.questionCount ||
  japaneseSubject.schemaVersion !== 3 ||
  japaneseSubject.id !== "japanese-history" ||
  japaneseSubject.learningType !== "history" ||
  japaneseSubject.deckId !== "deck-1" ||
  japaneseSubject.deckNumber !== expectedJapaneseSpec.number ||
  japaneseSubject.version !== expectedJapaneseSpec.version ||
  japaneseSubject.contentVersion !== expectedJapaneseSpec.contentVersion ||
  japaneseSubject.datasetLabel !== expectedJapaneseSpec.datasetLabel ||
  japaneseSubject.difficultyLabel !== expectedJapaneseSpec.difficultyLabel ||
  japaneseSubject.sourceFile !== sourceJapaneseDeck.sourceFile ||
  japaneseSubject.termCount !== expectedJapaneseSpec.termCount ||
  japaneseSubject.questionCount !== expectedJapaneseSpec.questionCount ||
  japaneseSubject.chunks.length !== 8 ||
  japaneseSubject.chunks.some((chunk) => chunk.count !== 50) ||
  japaneseChunks.some(
    (chunk) =>
      chunk.schemaVersion !== 3 ||
      chunk.subjectId !== "japanese-history" ||
      chunk.deckId !== "deck-1",
  ) ||
  JSON.stringify(generatedJapaneseCounts) !==
    JSON.stringify(expectedJapaneseSpec.questionCounts) ||
  JSON.stringify(generatedJapaneseTerms) !== JSON.stringify(expectedJapaneseTerms) ||
  generatedJapaneseQuestions.filter((question) => question.yearMnemonic).length !==
    expectedJapaneseSpec.mnemonicCount
) {
  throw new Error("日本史Deck 1の生成内容・語呂合わせ・分割が元CSVと一致しません。");
}

const { decks: sourceEnglishDecks, terms: expectedEnglishTerms } =
  await loadEnglishDecks();
const sourceEnglishDeckById = new Map(
  sourceEnglishDecks.map((deck) => [deck.id, deck]),
);
if (
  sourceEnglishDecks.length !== 3 ||
  sourceEnglishDecks.some((deck) => !expectedEnglishSpecs.has(deck.id)) ||
  !englishSubjectEntry ||
  englishSubjectEntry.defaultDeckId !== "deck-1" ||
  englishSubjectEntry.datasetLabel !== "英単語段階別デッキ｜Deck 1〜3" ||
  englishSubjectEntry.termCount !== 1500 ||
  englishSubjectEntry.questionCount !== 4500 ||
  englishSubjectEntry.decks.length !== 3 ||
  englishSubjectEntry.decks.map((deck) => deck.id).join(",") !==
    "deck-1,deck-2,deck-3"
) {
  throw new Error("英単語Deck 1〜3の科目一覧が正しくありません。");
}
const generatedEnglishTerms = [];
const generatedEnglishQuestions = [];
for (const englishDeckEntry of englishSubjectEntry.decks) {
  const sourceEnglishDeck = sourceEnglishDeckById.get(englishDeckEntry.id);
  const spec = expectedEnglishSpecs.get(englishDeckEntry.id);
  if (!sourceEnglishDeck || !spec) {
    throw new Error(`想定外の英単語Deckです: ${englishDeckEntry.id}`);
  }
  const englishSubject = await readJson(englishDeckEntry.indexPath);
  const englishChunks = await Promise.all(
    englishSubject.chunks.map((chunk) => readJson(chunk.path)),
  );
  const deckTerms = englishChunks.flatMap((chunk) => chunk.terms);
  const deckQuestions = deckTerms.flatMap((term) =>
    Object.values(term.stages).flat(),
  );
  const generatedEnglishCounts = countQuestionsByStage(deckTerms);
  if (
    englishDeckEntry.number !== spec.number ||
    englishDeckEntry.version !== spec.version ||
    englishDeckEntry.contentVersion !== spec.contentVersion ||
    englishDeckEntry.datasetLabel !== spec.datasetLabel ||
    englishDeckEntry.difficultyLabel !== spec.difficultyLabel ||
    englishDeckEntry.termCount !== spec.termCount ||
    englishDeckEntry.questionCount !== spec.questionCount ||
    englishSubject.version !== spec.version ||
    englishSubject.contentVersion !== spec.contentVersion ||
    englishSubject.deckId !== englishDeckEntry.id ||
    englishSubject.deckNumber !== spec.number ||
    englishSubject.datasetLabel !== spec.datasetLabel ||
    englishSubject.difficultyLabel !== spec.difficultyLabel ||
    englishSubject.id !== "english-vocabulary" ||
    englishSubject.learningType !== "vocabulary" ||
    englishSubject.filterLabels.category !== "品詞" ||
    englishSubject.stageLabels.beginner !== "英語から意味" ||
    englishSubject.stageLabels.reverse !== "意味から英語" ||
    englishSubject.stageLabels.integrated !== "例文から和訳" ||
    englishSubject.termCount !== 500 ||
    englishSubject.questionCount !== 1500 ||
    englishSubject.chunks.length !== 10 ||
    englishSubject.chunks.some((chunk) => chunk.count !== 50) ||
    JSON.stringify(generatedEnglishCounts) !==
      JSON.stringify({ beginner: 500, reverse: 500, integrated: 500 }) ||
    JSON.stringify(deckTerms) !== JSON.stringify(sourceEnglishDeck.terms)
  ) {
    throw new Error(
      `英単語${englishDeckEntry.id}の生成内容が元CSVと一致しません。`,
    );
  }
  generatedEnglishTerms.push(...deckTerms);
  generatedEnglishQuestions.push(...deckQuestions);
}
if (
  JSON.stringify(generatedEnglishTerms) !== JSON.stringify(expectedEnglishTerms) ||
  new Set(generatedEnglishTerms.map((term) => term.id)).size !== 1500 ||
  new Set(generatedEnglishTerms.map((term) => term.term)).size !== 1500 ||
  new Set(generatedEnglishQuestions.map((question) => question.id)).size !== 4500 ||
  generatedEnglishTerms.some(
    (term) =>
      term.stages.beginner[0].acceptedAnswers.includes(
        term.stages.beginner[0].answer,
      ) ||
      term.stages.reverse[0].hideTermUntilAnswer !== true ||
      term.stages.beginner[0].speech.question[0].language !== "en-US" ||
      term.stages.reverse[0].speech.question[0].language !== "ja-JP" ||
      term.stages.integrated[0].speech.question[0].language !== "en-US",
  )
) {
  throw new Error("英単語の識別番号・別解・読み上げ言語が正しくありません。");
}

if (
  sourceGeographyDecks.length !== 1 ||
  !geographySubjectEntry ||
  geographySubjectEntry.defaultDeckId !== "deck-1" ||
  geographySubjectEntry.termUnitLabel !== "項目" ||
  geographySubjectEntry.datasetLabel !== "大学受験地理｜Deck 1" ||
  geographySubjectEntry.termCount !== expectedGeographySpec.termCount ||
  geographySubjectEntry.questionCount !== expectedGeographySpec.questionCount ||
  geographySubjectEntry.decks.length !== 1
) {
  throw new Error("地理Deck 1の科目一覧が正しくありません。");
}
const sourceGeographyDeck = sourceGeographyDecks[0];
const geographyDeckEntry = geographySubjectEntry.decks[0];
const geographySubject = await readJson(geographyDeckEntry.indexPath);
const geographyChunks = await Promise.all(
  geographySubject.chunks.map((chunk) => readJson(chunk.path)),
);
const generatedGeographyTerms = geographyChunks.flatMap((chunk) => chunk.terms);
const generatedGeographyQuestions = generatedGeographyTerms.flatMap((term) =>
  Object.values(term.stages).flat(),
);
const generatedGeographyCounts = countQuestionsByStage(generatedGeographyTerms);
if (
  geographyDeckEntry.number !== expectedGeographySpec.number ||
  geographyDeckEntry.version !== expectedGeographySpec.version ||
  geographyDeckEntry.contentVersion !== expectedGeographySpec.contentVersion ||
  geographyDeckEntry.datasetLabel !== expectedGeographySpec.datasetLabel ||
  geographyDeckEntry.difficultyLabel !== expectedGeographySpec.difficultyLabel ||
  geographyDeckEntry.termCount !== expectedGeographySpec.termCount ||
  geographyDeckEntry.questionCount !== expectedGeographySpec.questionCount ||
  geographySubject.schemaVersion !== 3 ||
  geographySubject.id !== "geography" ||
  geographySubject.learningType !== "cards" ||
  geographySubject.termUnitLabel !== "項目" ||
  geographySubject.deckId !== "deck-1" ||
  geographySubject.deckNumber !== expectedGeographySpec.number ||
  geographySubject.version !== expectedGeographySpec.version ||
  geographySubject.contentVersion !== expectedGeographySpec.contentVersion ||
  geographySubject.datasetLabel !== expectedGeographySpec.datasetLabel ||
  geographySubject.difficultyLabel !== expectedGeographySpec.difficultyLabel ||
  geographySubject.sourceFile !== sourceGeographyDeck.sourceFile ||
  geographySubject.termCount !== expectedGeographySpec.termCount ||
  geographySubject.questionCount !== expectedGeographySpec.questionCount ||
  geographySubject.filterLabels.macroRegion !== "尺度" ||
  geographySubject.filterLabels.regionDetail !== "地域" ||
  geographySubject.filterLabels.category !== "単元" ||
  geographySubject.stageLabels.beginner !== "暗記カード" ||
  geographySubject.availableStages.join(",") !== "beginner" ||
  geographySubject.chunks.length !== 8 ||
  geographySubject.chunks.some((chunk) => chunk.count !== 50) ||
  geographyChunks.some(
    (chunk) =>
      chunk.schemaVersion !== 3 ||
      chunk.subjectId !== "geography" ||
      chunk.deckId !== "deck-1",
  ) ||
  JSON.stringify(generatedGeographyCounts) !==
    JSON.stringify(expectedGeographySpec.questionCounts) ||
  JSON.stringify(generatedGeographyTerms) !== JSON.stringify(expectedGeographyTerms) ||
  generatedGeographyQuestions.some(
    (question) =>
      question.stage !== "beginner" ||
      question.yearMnemonic !== "" ||
      question.answerNote !== "" ||
      !question.explanation ||
      question.acceptedAnswers.includes(question.answer),
  )
) {
  throw new Error("地理Deck 1の生成内容・絞り込み・分割が元CSVと一致しません。");
}
const geographyRanks = generatedGeographyTerms
  .map((term) => term.importanceRank)
  .sort((left, right) => left - right);
if (
  new Set(generatedGeographyTerms.map((term) => term.id)).size !== 400 ||
  new Set(generatedGeographyTerms.map((term) => term.term)).size !== 400 ||
  new Set(generatedGeographyQuestions.map((question) => question.id)).size !== 400 ||
  geographyRanks.some((rank, index) => rank !== index + 1) ||
  generatedGeographyTerms.some((term) => !/^GE-\d{6}$/.test(term.id)) ||
  generatedGeographyQuestions.some(
    (question) => !/^GE-\d{6}-C\d{2}$/.test(question.id),
  )
) {
  throw new Error("地理Deck 1のID・項目名・重要度順位が重複または欠落しています。");
}

if (
  sourcePoliticsEconomicsDecks.length !== 1 ||
  !politicsEconomicsSubjectEntry ||
  politicsEconomicsSubjectEntry.defaultDeckId !== "deck-1" ||
  politicsEconomicsSubjectEntry.termUnitLabel !== "項目" ||
  politicsEconomicsSubjectEntry.datasetLabel !== "大学受験政治・経済｜Deck 1" ||
  politicsEconomicsSubjectEntry.termCount !==
    expectedPoliticsEconomicsSpec.termCount ||
  politicsEconomicsSubjectEntry.questionCount !==
    expectedPoliticsEconomicsSpec.questionCount ||
  politicsEconomicsSubjectEntry.decks.length !== 1
) {
  throw new Error("政治・経済Deck 1の科目一覧が正しくありません。");
}
const sourcePoliticsEconomicsDeck = sourcePoliticsEconomicsDecks[0];
const politicsEconomicsDeckEntry = politicsEconomicsSubjectEntry.decks[0];
const politicsEconomicsSubject = await readJson(
  politicsEconomicsDeckEntry.indexPath,
);
const politicsEconomicsChunks = await Promise.all(
  politicsEconomicsSubject.chunks.map((chunk) => readJson(chunk.path)),
);
const generatedPoliticsEconomicsTerms = politicsEconomicsChunks.flatMap(
  (chunk) => chunk.terms,
);
const generatedPoliticsEconomicsQuestions = generatedPoliticsEconomicsTerms.flatMap(
  (term) => Object.values(term.stages).flat(),
);
const generatedPoliticsEconomicsCounts = countQuestionsByStage(
  generatedPoliticsEconomicsTerms,
);
if (
  politicsEconomicsDeckEntry.number !== expectedPoliticsEconomicsSpec.number ||
  politicsEconomicsDeckEntry.version !== expectedPoliticsEconomicsSpec.version ||
  politicsEconomicsDeckEntry.contentVersion !==
    expectedPoliticsEconomicsSpec.contentVersion ||
  politicsEconomicsDeckEntry.datasetLabel !==
    expectedPoliticsEconomicsSpec.datasetLabel ||
  politicsEconomicsDeckEntry.difficultyLabel !==
    expectedPoliticsEconomicsSpec.difficultyLabel ||
  politicsEconomicsDeckEntry.termCount !==
    expectedPoliticsEconomicsSpec.termCount ||
  politicsEconomicsDeckEntry.questionCount !==
    expectedPoliticsEconomicsSpec.questionCount ||
  politicsEconomicsSubject.schemaVersion !== 3 ||
  politicsEconomicsSubject.id !== "politics-economics" ||
  politicsEconomicsSubject.learningType !== "cards" ||
  politicsEconomicsSubject.termUnitLabel !== "項目" ||
  politicsEconomicsSubject.deckId !== "deck-1" ||
  politicsEconomicsSubject.deckNumber !== expectedPoliticsEconomicsSpec.number ||
  politicsEconomicsSubject.version !== expectedPoliticsEconomicsSpec.version ||
  politicsEconomicsSubject.contentVersion !==
    expectedPoliticsEconomicsSpec.contentVersion ||
  politicsEconomicsSubject.datasetLabel !==
    expectedPoliticsEconomicsSpec.datasetLabel ||
  politicsEconomicsSubject.difficultyLabel !==
    expectedPoliticsEconomicsSpec.difficultyLabel ||
  politicsEconomicsSubject.sourceFile !== sourcePoliticsEconomicsDeck.sourceFile ||
  politicsEconomicsSubject.termCount !== expectedPoliticsEconomicsSpec.termCount ||
  politicsEconomicsSubject.questionCount !==
    expectedPoliticsEconomicsSpec.questionCount ||
  politicsEconomicsSubject.filterLabels.macroRegion !== "領域" ||
  politicsEconomicsSubject.filterLabels.regionDetail !== "小分類" ||
  politicsEconomicsSubject.filterLabels.category !== "大分類" ||
  politicsEconomicsSubject.stageLabels.beginner !== "暗記カード" ||
  politicsEconomicsSubject.availableStages.join(",") !== "beginner" ||
  politicsEconomicsSubject.chunks.length !== 8 ||
  politicsEconomicsSubject.chunks.some((chunk) => chunk.count !== 50) ||
  politicsEconomicsChunks.some(
    (chunk) =>
      chunk.schemaVersion !== 3 ||
      chunk.subjectId !== "politics-economics" ||
      chunk.deckId !== "deck-1",
  ) ||
  JSON.stringify(generatedPoliticsEconomicsCounts) !==
    JSON.stringify(expectedPoliticsEconomicsSpec.questionCounts) ||
  JSON.stringify(generatedPoliticsEconomicsTerms) !==
    JSON.stringify(expectedPoliticsEconomicsTerms) ||
  generatedPoliticsEconomicsQuestions.some(
    (question) =>
      question.stage !== "beginner" ||
      question.yearMnemonic !== "" ||
      question.answerNote !== "" ||
      !question.explanation ||
      question.acceptedAnswers.includes(question.answer),
  )
) {
  throw new Error(
    "政治・経済Deck 1の生成内容・絞り込み・分割が元CSVと一致しません。",
  );
}
const politicsEconomicsRanks = generatedPoliticsEconomicsTerms
  .map((term) => term.importanceRank)
  .sort((left, right) => left - right);
const politicsEconomicsTimeSensitivityCounts = Object.fromEntries(
  ["stable", "law_as_of_date", "system_as_of_date"].map((timeSensitivity) => [
    timeSensitivity,
    generatedPoliticsEconomicsTerms.filter(
      (term) => term.politicsEconomics.timeSensitivity === timeSensitivity,
    ).length,
  ]),
);
const politicsEconomicsReferenceDatePrefix =
  /^\d{4}年(?:\d{1,2}月\d{1,2}日)?時点で、/u;
if (
  new Set(generatedPoliticsEconomicsTerms.map((term) => term.id)).size !== 400 ||
  new Set(generatedPoliticsEconomicsTerms.map((term) => term.term)).size !== 400 ||
  new Set(generatedPoliticsEconomicsQuestions.map((question) => question.id))
    .size !== 400 ||
  politicsEconomicsRanks.some((rank, index) => rank !== index + 1) ||
  generatedPoliticsEconomicsTerms.some((term) => !/^PE-\d{6}$/.test(term.id)) ||
  generatedPoliticsEconomicsQuestions.some(
    (question) => !/^PE-\d{6}-C\d{2}$/.test(question.id),
  ) ||
  new Set(
    generatedPoliticsEconomicsTerms.map(
      (term) => term.politicsEconomics.curriculumScope,
    ),
  ).size !== 3 ||
  new Set(
    generatedPoliticsEconomicsTerms.map((term) => term.politicsEconomics.domain),
  ).size !== 6 ||
  politicsEconomicsTimeSensitivityCounts.stable !== 371 ||
  politicsEconomicsTimeSensitivityCounts.law_as_of_date !== 26 ||
  politicsEconomicsTimeSensitivityCounts.system_as_of_date !== 3 ||
  generatedPoliticsEconomicsTerms.some(
    (term) =>
      term.politicsEconomics.timeSensitivity === "stable"
        ? term.chronology.displayPeriod !== ""
        : !term.chronology.displayPeriod ||
          !term.stages.beginner[0].explanation.includes("基準日："),
  ) ||
  generatedPoliticsEconomicsTerms.some(
    (term) =>
      term.politicsEconomics.legalBasis &&
      !term.stages.beginner[0].explanation.includes("根拠："),
  ) ||
  generatedPoliticsEconomicsQuestions.some(
    (question) =>
      question.prompt.includes("次の説明に当てはまる用語は何か") ||
      politicsEconomicsReferenceDatePrefix.test(question.prompt),
  )
) {
  throw new Error(
    "政治・経済Deck 1のID・重要度順位・領域・基準日・法的根拠・問い方が正しくありません。",
  );
}

if (
  sourceBiologyDecks.length !== 1 ||
  !biologySubjectEntry ||
  biologySubjectEntry.defaultDeckId !== "deck-1" ||
  biologySubjectEntry.termUnitLabel !== "項目" ||
  biologySubjectEntry.datasetLabel !== "大学受験生物基礎｜Deck 1" ||
  biologySubjectEntry.termCount !== expectedBiologySpec.termCount ||
  biologySubjectEntry.questionCount !== expectedBiologySpec.questionCount ||
  biologySubjectEntry.decks.length !== 1
) {
  throw new Error("生物基礎Deck 1の科目一覧が正しくありません。");
}
const sourceBiologyDeck = sourceBiologyDecks[0];
const biologyDeckEntry = biologySubjectEntry.decks[0];
const biologySubject = await readJson(biologyDeckEntry.indexPath);
const biologyChunks = await Promise.all(
  biologySubject.chunks.map((chunk) => readJson(chunk.path)),
);
const generatedBiologyTerms = biologyChunks.flatMap((chunk) => chunk.terms);
const generatedBiologyQuestions = generatedBiologyTerms.flatMap((term) =>
  Object.values(term.stages).flat(),
);
const generatedBiologyCounts = countQuestionsByStage(generatedBiologyTerms);
if (
  biologyDeckEntry.number !== expectedBiologySpec.number ||
  biologyDeckEntry.version !== expectedBiologySpec.version ||
  biologyDeckEntry.contentVersion !== expectedBiologySpec.contentVersion ||
  biologyDeckEntry.datasetLabel !== expectedBiologySpec.datasetLabel ||
  biologyDeckEntry.difficultyLabel !== expectedBiologySpec.difficultyLabel ||
  biologyDeckEntry.termCount !== expectedBiologySpec.termCount ||
  biologyDeckEntry.questionCount !== expectedBiologySpec.questionCount ||
  biologySubject.schemaVersion !== 3 ||
  biologySubject.id !== "biology-basics" ||
  biologySubject.learningType !== "cards" ||
  biologySubject.termUnitLabel !== "項目" ||
  biologySubject.deckId !== "deck-1" ||
  biologySubject.deckNumber !== expectedBiologySpec.number ||
  biologySubject.version !== expectedBiologySpec.version ||
  biologySubject.contentVersion !== expectedBiologySpec.contentVersion ||
  biologySubject.datasetLabel !== expectedBiologySpec.datasetLabel ||
  biologySubject.difficultyLabel !== expectedBiologySpec.difficultyLabel ||
  biologySubject.sourceFile !== sourceBiologyDeck.sourceFile ||
  biologySubject.termCount !== expectedBiologySpec.termCount ||
  biologySubject.questionCount !== expectedBiologySpec.questionCount ||
  biologySubject.filterLabels.macroRegion !== "大項目" ||
  biologySubject.filterLabels.regionDetail !== "小項目" ||
  biologySubject.filterLabels.category !== undefined ||
  biologySubject.stageLabels.beginner !== "暗記カード" ||
  biologySubject.availableStages.join(",") !== "beginner" ||
  biologySubject.chunks.length !== 6 ||
  biologySubject.chunks.some((chunk) => chunk.count !== 50) ||
  biologyChunks.some(
    (chunk) =>
      chunk.schemaVersion !== 3 ||
      chunk.subjectId !== "biology-basics" ||
      chunk.deckId !== "deck-1",
  ) ||
  JSON.stringify(generatedBiologyCounts) !==
    JSON.stringify(expectedBiologySpec.questionCounts) ||
  JSON.stringify(generatedBiologyTerms) !== JSON.stringify(expectedBiologyTerms) ||
  generatedBiologyQuestions.some(
    (question) =>
      question.stage !== "beginner" ||
      question.yearMnemonic !== "" ||
      question.answerNote !== "" ||
      !question.explanation ||
      question.acceptedAnswers.includes(question.answer),
  )
) {
  throw new Error("生物基礎Deck 1の生成内容・絞り込み・分割が元CSVと一致しません。");
}
const biologyRanks = generatedBiologyTerms
  .map((term) => term.importanceRank)
  .sort((left, right) => left - right);
const biologyUnitCounts = Object.fromEntries(
  ["生物の特徴", "ヒトの体の調節", "生物の多様性と生態系"].map((unit) => [
    unit,
    generatedBiologyTerms.filter((term) => term.category === unit).length,
  ]),
);
if (
  new Set(generatedBiologyTerms.map((term) => term.id)).size !== 300 ||
  new Set(generatedBiologyTerms.map((term) => term.term)).size !== 300 ||
  new Set(generatedBiologyQuestions.map((question) => question.id)).size !== 300 ||
  biologyRanks.some((rank, index) => rank !== index + 1) ||
  generatedBiologyTerms.some((term) => !/^BB-\d{6}$/.test(term.id)) ||
  generatedBiologyQuestions.some(
    (question) => !/^BB-\d{6}-C\d{2}$/.test(question.id),
  ) ||
  Object.values(biologyUnitCounts).some((count) => count !== 100) ||
  new Set(generatedBiologyTerms.map((term) => term.subunit)).size !== 9
) {
  throw new Error("生物基礎Deck 1のID・項目名・重要度順位・単元構成が正しくありません。");
}

if (
  sourceEarthScienceDecks.length !== 1 ||
  !earthScienceSubjectEntry ||
  earthScienceSubjectEntry.defaultDeckId !== "deck-1" ||
  earthScienceSubjectEntry.termUnitLabel !== "項目" ||
  earthScienceSubjectEntry.datasetLabel !== "大学受験地学基礎｜Deck 1" ||
  earthScienceSubjectEntry.termCount !== expectedEarthScienceSpec.termCount ||
  earthScienceSubjectEntry.questionCount !== expectedEarthScienceSpec.questionCount ||
  earthScienceSubjectEntry.decks.length !== 1
) {
  throw new Error("地学基礎Deck 1の科目一覧が正しくありません。");
}
const sourceEarthScienceDeck = sourceEarthScienceDecks[0];
const earthScienceDeckEntry = earthScienceSubjectEntry.decks[0];
const earthScienceSubject = await readJson(earthScienceDeckEntry.indexPath);
const earthScienceChunks = await Promise.all(
  earthScienceSubject.chunks.map((chunk) => readJson(chunk.path)),
);
const generatedEarthScienceTerms = earthScienceChunks.flatMap(
  (chunk) => chunk.terms,
);
const generatedEarthScienceQuestions = generatedEarthScienceTerms.flatMap(
  (term) => Object.values(term.stages).flat(),
);
const generatedEarthScienceCounts = countQuestionsByStage(
  generatedEarthScienceTerms,
);
if (
  earthScienceDeckEntry.number !== expectedEarthScienceSpec.number ||
  earthScienceDeckEntry.version !== expectedEarthScienceSpec.version ||
  earthScienceDeckEntry.contentVersion !== expectedEarthScienceSpec.contentVersion ||
  earthScienceDeckEntry.datasetLabel !== expectedEarthScienceSpec.datasetLabel ||
  earthScienceDeckEntry.difficultyLabel !== expectedEarthScienceSpec.difficultyLabel ||
  earthScienceDeckEntry.termCount !== expectedEarthScienceSpec.termCount ||
  earthScienceDeckEntry.questionCount !== expectedEarthScienceSpec.questionCount ||
  earthScienceSubject.schemaVersion !== 3 ||
  earthScienceSubject.id !== "earth-science-basics" ||
  earthScienceSubject.learningType !== "cards" ||
  earthScienceSubject.termUnitLabel !== "項目" ||
  earthScienceSubject.deckId !== "deck-1" ||
  earthScienceSubject.deckNumber !== expectedEarthScienceSpec.number ||
  earthScienceSubject.version !== expectedEarthScienceSpec.version ||
  earthScienceSubject.contentVersion !== expectedEarthScienceSpec.contentVersion ||
  earthScienceSubject.datasetLabel !== expectedEarthScienceSpec.datasetLabel ||
  earthScienceSubject.difficultyLabel !== expectedEarthScienceSpec.difficultyLabel ||
  earthScienceSubject.sourceFile !== sourceEarthScienceDeck.sourceFile ||
  earthScienceSubject.termCount !== expectedEarthScienceSpec.termCount ||
  earthScienceSubject.questionCount !== expectedEarthScienceSpec.questionCount ||
  earthScienceSubject.filterLabels.macroRegion !== "大項目" ||
  earthScienceSubject.filterLabels.regionDetail !== "小項目" ||
  earthScienceSubject.filterLabels.category !== undefined ||
  earthScienceSubject.stageLabels.beginner !== "暗記カード" ||
  earthScienceSubject.availableStages.join(",") !== "beginner" ||
  earthScienceSubject.chunks.length !== 6 ||
  earthScienceSubject.chunks.some((chunk) => chunk.count !== 50) ||
  earthScienceChunks.some(
    (chunk) =>
      chunk.schemaVersion !== 3 ||
      chunk.subjectId !== "earth-science-basics" ||
      chunk.deckId !== "deck-1",
  ) ||
  JSON.stringify(generatedEarthScienceCounts) !==
    JSON.stringify(expectedEarthScienceSpec.questionCounts) ||
  JSON.stringify(generatedEarthScienceTerms) !==
    JSON.stringify(expectedEarthScienceTerms) ||
  generatedEarthScienceQuestions.some(
    (question) =>
      question.stage !== "beginner" ||
      question.yearMnemonic !== "" ||
      question.answerNote !== "" ||
      !question.explanation ||
      question.acceptedAnswers.includes(question.answer),
  )
) {
  throw new Error("地学基礎Deck 1の生成内容・絞り込み・分割が元CSVと一致しません。");
}
const earthScienceRanks = generatedEarthScienceTerms
  .map((term) => term.importanceRank)
  .sort((left, right) => left - right);
const earthScienceUnitCounts = Object.fromEntries(
  ["地球のすがた", "変動する地球"].map((unit) => [
    unit,
    generatedEarthScienceTerms.filter((term) => term.category === unit).length,
  ]),
);
if (
  new Set(generatedEarthScienceTerms.map((term) => term.id)).size !== 300 ||
  new Set(generatedEarthScienceTerms.map((term) => term.term)).size !== 300 ||
  new Set(generatedEarthScienceQuestions.map((question) => question.id)).size !== 384 ||
  earthScienceRanks.some((rank, index) => rank !== index + 1) ||
  generatedEarthScienceTerms.some((term) => !/^ES-\d{6}$/.test(term.id)) ||
  generatedEarthScienceQuestions.some(
    (question) => !/^ES-\d{6}-C\d{2}$/.test(question.id),
  ) ||
  earthScienceUnitCounts["地球のすがた"] !== 181 ||
  earthScienceUnitCounts["変動する地球"] !== 119 ||
  new Set(generatedEarthScienceTerms.map((term) => term.subunit)).size !== 41 ||
  generatedEarthScienceTerms.some(
    (term) =>
      !term.earthScience?.timeScale ||
      !term.earthScience?.spatialScale ||
      term.geography.scale !== term.earthScience.spatialScale,
  )
) {
  throw new Error("地学基礎Deck 1のID・重要度順位・単元・尺度が正しくありません。");
}

const expectedClassicalJapaneseTermCount = [
  ...expectedClassicalJapaneseSpecs.values(),
].reduce((sum, spec) => sum + spec.termCount, 0);
const expectedClassicalJapaneseQuestionCount = [
  ...expectedClassicalJapaneseSpecs.values(),
].reduce((sum, spec) => sum + spec.questionCount, 0);
if (
  sourceClassicalJapaneseDecks.length !== 3 ||
  !classicalJapaneseSubjectEntry ||
  classicalJapaneseSubjectEntry.defaultDeckId !== "deck-1" ||
  classicalJapaneseSubjectEntry.termUnitLabel !== "単語" ||
  classicalJapaneseSubjectEntry.datasetLabel !==
    "大学受験古文（国語）｜Deck 1〜3" ||
  classicalJapaneseSubjectEntry.termCount !== expectedClassicalJapaneseTermCount ||
  classicalJapaneseSubjectEntry.questionCount !==
    expectedClassicalJapaneseQuestionCount ||
  classicalJapaneseSubjectEntry.decks.length !== 3
) {
  throw new Error("古文単語Deck 1〜3の科目一覧が正しくありません。");
}

const generatedClassicalJapaneseTerms = [];
const generatedClassicalJapaneseQuestions = [];
const sourceClassicalJapaneseRows = [];
for (const sourceClassicalJapaneseDeck of sourceClassicalJapaneseDecks) {
  const spec = expectedClassicalJapaneseSpecs.get(sourceClassicalJapaneseDeck.id);
  const classicalJapaneseDeckEntry = classicalJapaneseSubjectEntry.decks.find(
    (deck) => deck.id === sourceClassicalJapaneseDeck.id,
  );
  if (!spec || !classicalJapaneseDeckEntry) {
    throw new Error(`${sourceClassicalJapaneseDeck.id}の古文単語仕様がありません。`);
  }
  const deckSourceRows = toClassicalJapaneseObjects(
    parseCsv(sourceClassicalJapaneseDeck.sourceText),
  );
  sourceClassicalJapaneseRows.push(...deckSourceRows);
  const classicalJapaneseSubject = await readJson(
    classicalJapaneseDeckEntry.indexPath,
  );
  const classicalJapaneseChunks = await Promise.all(
    classicalJapaneseSubject.chunks.map((chunk) => readJson(chunk.path)),
  );
  const deckTerms = classicalJapaneseChunks.flatMap((chunk) => chunk.terms);
  const deckQuestions = deckTerms.flatMap((term) =>
    Object.values(term.stages).flat(),
  );
  generatedClassicalJapaneseTerms.push(...deckTerms);
  generatedClassicalJapaneseQuestions.push(...deckQuestions);
  const generatedClassicalJapaneseCounts = countQuestionsByStage(deckTerms);
  const classicalJapaneseRanks = deckTerms
    .map((term) => term.importanceRank)
    .sort((left, right) => left - right);
  const classicalJapaneseDomainCounts = deckTerms.reduce(
    (counts, term) => ({
      ...counts,
      [term.classicalJapanese.domain]:
        (counts[term.classicalJapanese.domain] ?? 0) + 1,
    }),
    {},
  );
  const classicalJapaneseRowsByItemId = Map.groupBy(
    deckSourceRows,
    (row) => row.item_id,
  );
  const classicalJapaneseMeaningRowsMatch = deckTerms.every((term) => {
    const sourceRows = classicalJapaneseRowsByItemId.get(term.id) ?? [];
    const question = term.stages.beginner[0];
    const sourceAnswers = [...new Set(sourceRows.map((row) => row.answer))];
    const sourceKeywords = new Set(
      sourceRows.flatMap((row) => [
        row.answer,
        ...String(row.accepted_answers)
          .split("｜")
          .map((answer) => answer.trim())
          .filter((answer) => answer && answer !== "なし"),
      ]),
    );
    return (
      sourceRows.length > 0 &&
      term.stages.beginner.length === 1 &&
      question.id === `${term.id}-C01` &&
      sourceRows.every((row) => row.question === term.term) &&
      question.prompt === term.term &&
      question.answer === sourceAnswers.join("／") &&
      question.acceptedAnswers.length === 0 &&
      [...sourceKeywords].every((keyword) => question.keywords.includes(keyword))
    );
  });

  if (
    classicalJapaneseDeckEntry.number !== spec.number ||
    classicalJapaneseDeckEntry.version !== spec.version ||
    classicalJapaneseDeckEntry.contentVersion !== spec.contentVersion ||
    classicalJapaneseDeckEntry.datasetLabel !== spec.datasetLabel ||
    classicalJapaneseDeckEntry.difficultyLabel !== spec.difficultyLabel ||
    classicalJapaneseDeckEntry.termCount !== spec.termCount ||
    classicalJapaneseDeckEntry.questionCount !== spec.questionCount ||
    classicalJapaneseSubject.schemaVersion !== 3 ||
    classicalJapaneseSubject.id !== "classical-japanese" ||
    classicalJapaneseSubject.title !== "古文（国語）" ||
    classicalJapaneseSubject.learningType !== "cards" ||
    classicalJapaneseSubject.termUnitLabel !== "単語" ||
    classicalJapaneseSubject.deckId !== sourceClassicalJapaneseDeck.id ||
    classicalJapaneseSubject.deckNumber !== spec.number ||
    classicalJapaneseSubject.version !== spec.version ||
    classicalJapaneseSubject.contentVersion !== spec.contentVersion ||
    classicalJapaneseSubject.datasetLabel !== spec.datasetLabel ||
    classicalJapaneseSubject.difficultyLabel !== spec.difficultyLabel ||
    classicalJapaneseSubject.sourceFile !== sourceClassicalJapaneseDeck.sourceFile ||
    classicalJapaneseSubject.termCount !== spec.termCount ||
    classicalJapaneseSubject.questionCount !== spec.questionCount ||
    classicalJapaneseSubject.filterLabels.macroRegion !== "分野" ||
    classicalJapaneseSubject.filterLabels.regionDetail !== "単元" ||
    classicalJapaneseSubject.filterLabels.category !== "項目種別" ||
    classicalJapaneseSubject.stageLabels.beginner !== "暗記カード" ||
    classicalJapaneseSubject.availableStages.join(",") !== "beginner" ||
    classicalJapaneseSubject.chunks.length !== 6 ||
    classicalJapaneseSubject.chunks.some((chunk) => chunk.count !== 50) ||
    classicalJapaneseChunks.some(
      (chunk) =>
        chunk.schemaVersion !== 3 ||
        chunk.subjectId !== "classical-japanese" ||
        chunk.deckId !== sourceClassicalJapaneseDeck.id,
    ) ||
    JSON.stringify(generatedClassicalJapaneseCounts) !==
      JSON.stringify(spec.questionCounts) ||
    JSON.stringify(deckTerms) !==
      JSON.stringify(sourceClassicalJapaneseDeck.terms) ||
    deckQuestions.some(
      (question) =>
        question.stage !== "beginner" ||
        question.yearMnemonic !== "" ||
        !question.label ||
        !question.explanation ||
        question.acceptedAnswers.includes(question.answer),
    ) ||
    deckSourceRows.length !== spec.sourceRowCount ||
    deckSourceRows.some(
      (row) => row.domain !== "語彙" || row.card_type !== "meaning",
    ) ||
    classicalJapaneseRowsByItemId.size !== spec.termCount ||
    new Set(deckTerms.map((term) => term.id)).size !== spec.termCount ||
    new Set(deckTerms.map((term) => term.term)).size !== spec.termCount ||
    new Set(deckQuestions.map((question) => question.id)).size !==
      spec.questionCount ||
    classicalJapaneseRanks.some(
      (rank, index) => rank !== spec.rankStart + index,
    ) ||
    deckTerms.some((term) => !/^CJ-\d{6}$/.test(term.id)) ||
    deckQuestions.some((question) => !/^CJ-\d{6}-C\d{2}$/.test(question.id)) ||
    classicalJapaneseDomainCounts["語彙"] !== spec.termCount ||
    Object.keys(classicalJapaneseDomainCounts).length !== 1 ||
    new Set(deckTerms.map((term) => term.classicalJapanese.unit)).size !==
      spec.unitCount ||
    !classicalJapaneseMeaningRowsMatch ||
    deckTerms.some(
      (term) =>
        term.geography.macroRegion !== term.classicalJapanese.domain ||
        term.geography.regionDetail !== term.classicalJapanese.unit ||
        term.category !== term.classicalJapanese.itemType ||
        term.speechReadings[term.term] !== term.reading,
    )
  ) {
    throw new Error(
      `古文単語Deck ${spec.number}の生成内容・順位・分割が元CSVと一致しません。`,
    );
  }
}

const classicalJapaneseRanks = generatedClassicalJapaneseTerms
  .map((term) => term.importanceRank)
  .sort((left, right) => left - right);
if (
  new Set(generatedClassicalJapaneseTerms.map((term) => term.id)).size !==
    expectedClassicalJapaneseTermCount ||
  new Set(generatedClassicalJapaneseTerms.map((term) => term.term)).size !==
    expectedClassicalJapaneseTermCount ||
  new Set(generatedClassicalJapaneseQuestions.map((question) => question.id))
    .size !== expectedClassicalJapaneseQuestionCount ||
  classicalJapaneseRanks.some((rank, index) => rank !== index + 1) ||
  sourceClassicalJapaneseRows.length !== 1516
) {
  throw new Error("古文単語Deck 1〜3の重複または通算順位が正しくありません。");
}

const expectedClassicalChineseTermCount = [
  ...expectedClassicalChineseSpecs.values(),
].reduce((sum, spec) => sum + spec.termCount, 0);
const expectedClassicalChineseQuestionCount = [
  ...expectedClassicalChineseSpecs.values(),
].reduce((sum, spec) => sum + spec.questionCount, 0);
if (
  sourceClassicalChineseDecks.length !== 4 ||
  !classicalChineseSubjectEntry ||
  classicalChineseSubjectEntry.defaultDeckId !== "deck-1" ||
  classicalChineseSubjectEntry.termUnitLabel !== "項目" ||
  classicalChineseSubjectEntry.datasetLabel !==
    "大学受験漢文（国語）｜Deck 1〜4" ||
  classicalChineseSubjectEntry.termCount !== expectedClassicalChineseTermCount ||
  classicalChineseSubjectEntry.questionCount !==
    expectedClassicalChineseQuestionCount ||
  classicalChineseSubjectEntry.decks.length !== 4
) {
  throw new Error("漢文Deck 1〜4の科目一覧が正しくありません。");
}

const generatedClassicalChineseTerms = [];
const generatedClassicalChineseQuestions = [];
for (const sourceClassicalChineseDeck of sourceClassicalChineseDecks) {
  const spec = expectedClassicalChineseSpecs.get(sourceClassicalChineseDeck.id);
  const classicalChineseDeckEntry = classicalChineseSubjectEntry.decks.find(
    (deck) => deck.id === sourceClassicalChineseDeck.id,
  );
  if (!spec || !classicalChineseDeckEntry) {
    throw new Error(`${sourceClassicalChineseDeck.id}の漢文仕様がありません。`);
  }
  const deckSourceRows = toClassicalChineseObjects(
    parseCsv(sourceClassicalChineseDeck.sourceText),
  );
  const classicalChineseSubject = await readJson(
    classicalChineseDeckEntry.indexPath,
  );
  const classicalChineseChunks = await Promise.all(
    classicalChineseSubject.chunks.map((chunk) => readJson(chunk.path)),
  );
  const deckTerms = classicalChineseChunks.flatMap((chunk) => chunk.terms);
  const deckQuestions = deckTerms.flatMap((term) =>
    Object.values(term.stages).flat(),
  );
  generatedClassicalChineseTerms.push(...deckTerms);
  generatedClassicalChineseQuestions.push(...deckQuestions);
  const generatedClassicalChineseCounts = countQuestionsByStage(deckTerms);
  const classicalChineseRanks = deckTerms
    .map((term) => term.importanceRank)
    .sort((left, right) => left - right);
  const classicalChineseDomainCounts = deckTerms.reduce(
    (counts, term) => ({
      ...counts,
      [term.classicalChinese.domain]:
        (counts[term.classicalChinese.domain] ?? 0) + 1,
    }),
    {},
  );
  const classicalChineseQuestionTypeCounts = countValues(
    deckQuestions.map((question) => question.type),
  );
  const classicalChineseFocusCounts = countValues(
    deckQuestions.map((question) => question.focus),
  );
  const expectedQuestionTypeCounts = spec.questionTypeCounts ?? {
    meaning: spec.questionCount,
  };
  const expectedFocusCounts = spec.focusCounts ?? {
    意味瞬発: spec.questionCount,
  };

  if (
    classicalChineseDeckEntry.number !== spec.number ||
    classicalChineseDeckEntry.version !== spec.version ||
    classicalChineseDeckEntry.contentVersion !== spec.contentVersion ||
    classicalChineseDeckEntry.datasetLabel !== spec.datasetLabel ||
    classicalChineseDeckEntry.difficultyLabel !== spec.difficultyLabel ||
    classicalChineseDeckEntry.termCount !== spec.termCount ||
    classicalChineseDeckEntry.questionCount !== spec.questionCount ||
    classicalChineseSubject.schemaVersion !== 3 ||
    classicalChineseSubject.id !== "classical-chinese" ||
    classicalChineseSubject.title !== "漢文（国語）" ||
    classicalChineseSubject.learningType !== "cards" ||
    classicalChineseSubject.termUnitLabel !== "項目" ||
    classicalChineseSubject.deckId !== sourceClassicalChineseDeck.id ||
    classicalChineseSubject.deckNumber !== spec.number ||
    classicalChineseSubject.version !== spec.version ||
    classicalChineseSubject.contentVersion !== spec.contentVersion ||
    classicalChineseSubject.datasetLabel !== spec.datasetLabel ||
    classicalChineseSubject.difficultyLabel !== spec.difficultyLabel ||
    classicalChineseSubject.sourceFile !== sourceClassicalChineseDeck.sourceFile ||
    classicalChineseSubject.termCount !== spec.termCount ||
    classicalChineseSubject.questionCount !== spec.questionCount ||
    classicalChineseSubject.filterLabels.macroRegion !== "分野" ||
    classicalChineseSubject.filterLabels.regionDetail !== "単元" ||
    classicalChineseSubject.filterLabels.category !== "項目種別" ||
    classicalChineseSubject.stageLabels.beginner !== "暗記カード" ||
    classicalChineseSubject.availableStages.join(",") !== "beginner" ||
    classicalChineseSubject.chunks.length !== Math.ceil(spec.termCount / 50) ||
    classicalChineseSubject.chunks.some((chunk) => chunk.count !== 50) ||
    classicalChineseChunks.some(
      (chunk) =>
        chunk.schemaVersion !== 3 ||
        chunk.subjectId !== "classical-chinese" ||
        chunk.deckId !== sourceClassicalChineseDeck.id,
    ) ||
    JSON.stringify(generatedClassicalChineseCounts) !==
      JSON.stringify(spec.questionCounts) ||
    JSON.stringify(deckTerms) !== JSON.stringify(sourceClassicalChineseDeck.terms) ||
    deckSourceRows.length !== (spec.sourceRowCount ?? spec.termCount) ||
    deckSourceRows.some((row) => row.rule_info.includes("音声=")) ||
    JSON.stringify(Object.entries(classicalChineseQuestionTypeCounts).sort()) !==
      JSON.stringify(Object.entries(expectedQuestionTypeCounts).sort()) ||
    JSON.stringify(Object.entries(classicalChineseFocusCounts).sort()) !==
      JSON.stringify(Object.entries(expectedFocusCounts).sort()) ||
    deckQuestions.some(
      (question) =>
        question.stage !== "beginner" ||
        question.yearMnemonic !== "" ||
        !question.label ||
        !question.explanation ||
        question.acceptedAnswers.includes(question.answer),
    ) ||
    (spec.standardRuleCards
      ? deckQuestions.some(
          (question) =>
            question.label !== question.focus ||
            question.hideTermUntilAnswer !== true ||
            Array.isArray(question.speech?.question) ||
            Array.isArray(question.speech?.answer) ||
            question.focus === "意味瞬発",
        )
      : deckQuestions.some(
          (question) =>
            question.type !== "meaning" ||
            Array.isArray(question.speech?.question) ||
            Array.isArray(question.speech?.answer) ||
            question.focus !== "意味瞬発",
        )) ||
    new Set(deckTerms.map((term) => term.id)).size !== spec.termCount ||
    new Set(deckTerms.map((term) => term.term)).size !== spec.termCount ||
    new Set(deckQuestions.map((question) => question.id)).size !==
      spec.questionCount ||
    classicalChineseRanks.some(
      (rank, index) => rank !== spec.rankStart + index,
    ) ||
    deckTerms.some((term) => !/^CC-\d{6}$/.test(term.id)) ||
    deckQuestions.some((question) => !/^CC-\d{6}-C\d{2}$/.test(question.id)) ||
    JSON.stringify(Object.entries(classicalChineseDomainCounts).sort()) !==
      JSON.stringify(Object.entries(spec.domainCounts).sort()) ||
    new Set(deckTerms.map((term) => term.classicalChinese.unit)).size !==
      spec.unitCount ||
    new Set(deckTerms.map((term) => term.classicalChinese.itemType)).size !==
      spec.itemTypeCount ||
    deckTerms.some(
      (term) =>
        term.geography.macroRegion !== term.classicalChinese.domain ||
        term.geography.regionDetail !== term.classicalChinese.unit ||
        term.category !== term.classicalChinese.itemType ||
        term.classicalChinese.ruleInfo.includes("音声=") ||
        term.speechReadings[term.term] !== term.reading,
    )
  ) {
    throw new Error(
      `漢文Deck ${spec.number}の生成内容・順位・分野・読み上げ情報が元CSVと一致しません。`,
    );
  }
}

const classicalChineseRanks = generatedClassicalChineseTerms
  .map((term) => term.importanceRank)
  .sort((left, right) => left - right);
if (
  new Set(generatedClassicalChineseTerms.map((term) => term.id)).size !==
    expectedClassicalChineseTermCount ||
  new Set(generatedClassicalChineseTerms.map((term) => term.term)).size !==
    expectedClassicalChineseTermCount ||
  new Set(generatedClassicalChineseQuestions.map((question) => question.id))
    .size !== expectedClassicalChineseQuestionCount ||
  classicalChineseRanks.some((rank, index) => rank !== index + 1)
) {
  throw new Error("漢文Deck 1〜4の重複または通算順位が正しくありません。");
}

if (
  sourceMindsetDecks.length !== 1 ||
  !mindsetSubjectEntry ||
  mindsetSubjectEntry.learningType !== "mindset" ||
  mindsetSubjectEntry.defaultDeckId !== "deck-1" ||
  mindsetSubjectEntry.termUnitLabel !== "件" ||
  mindsetSubjectEntry.datasetLabel !== "マインドセット集｜Deck 1" ||
  mindsetSubjectEntry.termCount !== 115 ||
  mindsetSubjectEntry.questionCount !== 0 ||
  mindsetSubjectEntry.decks.length !== 1
) {
  throw new Error("マインドセット科目の一覧が正しくありません。");
}
const mindsetDeckEntry = mindsetSubjectEntry.decks[0];
const mindsetSubject = await readJson(mindsetDeckEntry.indexPath);
const mindsetChunks = await Promise.all(
  mindsetSubject.chunks.map((chunk) => readJson(chunk.path)),
);
const generatedMindsetTerms = mindsetChunks.flatMap((chunk) => chunk.terms);
if (
  mindsetSubject.id !== "mindset" ||
  mindsetSubject.learningType !== "mindset" ||
  mindsetSubject.version !== "mindset-deck-1-v1" ||
  mindsetSubject.version !== sourceMindsetDecks[0].version ||
  mindsetSubject.contentVersion !== sourceMindsetDecks[0].contentVersion ||
  mindsetSubject.termCount !== expectedMindsetTerms.length ||
  mindsetSubject.questionCount !== 0 ||
  mindsetSubject.availableStages.length !== 0 ||
  generatedMindsetTerms.length !== expectedMindsetTerms.length ||
  new Set(generatedMindsetTerms.map((term) => term.id)).size !== 115 ||
  new Set(generatedMindsetTerms.map((term) => term.content)).size !== 115 ||
  generatedMindsetTerms.some(
    (term, index) =>
      term.id !== expectedMindsetTerms[index].id ||
      term.content !== expectedMindsetTerms[index].content ||
      term.term !== term.content ||
      Object.values(term.stages).some((questions) => questions.length !== 0),
  )
) {
  throw new Error("マインドセット115件の生成内容が元データと一致しません。");
}

const generatedTermImages = await readJson("term-images.json");
const expectedTermImages = mergeTermImageManifests([
  await loadTermImageManifest(expectedTerms),
  await loadTermImageManifest(expectedJapaneseTerms, {
    manifestPath: path.join(
      projectRoot,
      "data",
      "source",
      "japanese-history",
      "term-images.json",
    ),
    imageSourceDirectory: path.join(
      projectRoot,
      "data",
      "source",
      "japanese-history",
    ),
  }),
  await loadTermImageManifest(expectedGeographyTerms, {
    manifestPath: path.join(
      projectRoot,
      "data",
      "source",
      "geography",
      "term-images.json",
    ),
    imageSourceDirectory: path.join(
      projectRoot,
      "data",
      "source",
      "geography",
    ),
    requireComplete: false,
  }),
  await loadTermImageManifest(expectedPoliticsEconomicsTerms, {
    manifestPath: path.join(
      projectRoot,
      "data",
      "source",
      "politics-economics",
      "term-images.json",
    ),
    imageSourceDirectory: path.join(
      projectRoot,
      "data",
      "source",
      "politics-economics",
    ),
    requireComplete: false,
  }),
  await loadTermImageManifest(expectedBiologyTerms, {
    manifestPath: path.join(
      projectRoot,
      "data",
      "source",
      "biology-basics",
      "term-images.json",
    ),
    imageSourceDirectory: path.join(
      projectRoot,
      "data",
      "source",
      "biology-basics",
    ),
    requireComplete: false,
  }),
  await loadTermImageManifest(expectedEarthScienceTerms, {
    manifestPath: path.join(
      projectRoot,
      "data",
      "source",
      "earth-science-basics",
      "term-images.json",
    ),
    imageSourceDirectory: path.join(
      projectRoot,
      "data",
      "source",
      "earth-science-basics",
    ),
    requireComplete: false,
  }),
]);
const imageAssetIds = new Set(generatedTermImages.assets.map((asset) => asset.id));
const imageAssetById = new Map(
  generatedTermImages.assets.map((asset) => [asset.id, asset]),
);
const fallbackTermIds = new Set(
  generatedTermImages.termFallbacks.map((fallback) => fallback.termId),
);
const assignedQuestionIds = new Set(
  generatedTermImages.assignments.map((assignment) => assignment.questionId),
);
const expectedTermIdByQuestionId = new Map(
  [
    ...generatedTerms,
    ...generatedJapaneseTerms,
    ...generatedGeographyTerms,
    ...generatedPoliticsEconomicsTerms,
    ...generatedBiologyTerms,
    ...generatedEarthScienceTerms,
  ].flatMap((term) =>
      Object.values(term.stages)
        .flat()
        .map((question) => [question.id, term.id]),
    ),
);
if (
  JSON.stringify(generatedTermImages) !== JSON.stringify(expectedTermImages) ||
  generatedTermImages.schemaVersion !== 2 ||
  fallbackTermIds.size !== expectedTermImages.termFallbacks.length ||
  generatedTermImages.termFallbacks.length !== expectedTermImages.termFallbacks.length ||
  assignedQuestionIds.size !== expectedTermImages.assignments.length ||
  generatedTermImages.assignments.length !== expectedTermImages.assignments.length ||
  generatedTermImages.assets.some(
    (asset) =>
      !asset.path.endsWith(".webp") ||
      !asset.creator ||
      !asset.license ||
      !asset.licenseUrl ||
      !asset.sourcePageUrl,
  ) ||
  generatedTermImages.termFallbacks.some(
    (fallback) => !imageAssetIds.has(fallback.assetId),
  ) ||
  generatedTermImages.assignments.some(
    (assignment) =>
      !imageAssetIds.has(assignment.assetId) ||
      expectedTermIdByQuestionId.get(assignment.questionId) !== assignment.termId,
  )
) {
  throw new Error(
    "世界史・日本史・地理・政治・経済・地学基礎・生物基礎の関連画像が正しく割り当てられていません。",
  );
}

const geographyImageOverrides = JSON.parse(
  await readFile(
    path.join(projectRoot, "data", "source", "geography", "image-overrides.json"),
    "utf8",
  ),
);
const geographyImageTermIds = new Set(
  generatedTermImages.termFallbacks
    .filter((fallback) => fallback.termId.startsWith("GE-"))
    .map((fallback) => fallback.termId),
);
const geographyImageQuestionIds = new Set(
  generatedTermImages.assignments
    .filter((assignment) => assignment.termId.startsWith("GE-"))
    .map((assignment) => assignment.questionId),
);
const geographyImageCoverage =
  geographyImageOverrides.length / generatedGeographyTerms.length;
if (
  geographyImageCoverage < 0.4 ||
  geographyImageCoverage > 0.6 ||
  geographyImageTermIds.size !== geographyImageOverrides.length ||
  geographyImageQuestionIds.size !== geographyImageOverrides.length ||
  geographyImageOverrides.some(
    (override) => !geographyImageTermIds.has(override.termId),
  )
) {
  throw new Error(
    "地理の厳選画像が全項目の40%以上60%以下へ用語単位で割り当てられていません。",
  );
}

const politicsEconomicsImageOverrides = JSON.parse(
  await readFile(
    path.join(
      projectRoot,
      "data",
      "source",
      "politics-economics",
      "image-overrides.json",
    ),
    "utf8",
  ),
);
const politicsEconomicsImageTermIds = new Set(
  generatedTermImages.termFallbacks
    .filter((fallback) => fallback.termId.startsWith("PE-"))
    .map((fallback) => fallback.termId),
);
const politicsEconomicsImageAssignments = generatedTermImages.assignments.filter(
  (assignment) => assignment.termId.startsWith("PE-"),
);
const politicsEconomicsImageAssetIds = new Set(
  generatedTermImages.termFallbacks
    .filter((fallback) => fallback.termId.startsWith("PE-"))
    .map((fallback) => fallback.assetId),
);
const politicsEconomicsTermById = new Map(
  generatedPoliticsEconomicsTerms.map((term) => [term.id, term]),
);
if (
  politicsEconomicsImageOverrides.length !== 51 ||
  politicsEconomicsImageTermIds.size !== politicsEconomicsImageOverrides.length ||
  politicsEconomicsImageAssignments.length !== politicsEconomicsImageOverrides.length ||
  politicsEconomicsImageAssetIds.size !== 47 ||
  politicsEconomicsImageOverrides.some(
    (override) =>
      !politicsEconomicsImageTermIds.has(override.termId) || !override.fileName,
  ) ||
  politicsEconomicsImageAssignments.some(
    (assignment) =>
      assignment.target !== politicsEconomicsTermById.get(assignment.termId)?.term,
  )
) {
  throw new Error(
    "政治・経済の厳選画像47点が51項目へ回答文ではなく用語単位で割り当てられていません。",
  );
}

const earthScienceImageOverrides = JSON.parse(
  await readFile(
    path.join(
      projectRoot,
      "data",
      "source",
      "earth-science-basics",
      "image-overrides.json",
    ),
    "utf8",
  ),
);
const earthScienceImageTermIds = new Set(
  generatedTermImages.termFallbacks
    .filter((fallback) => fallback.termId.startsWith("ES-"))
    .map((fallback) => fallback.termId),
);
const earthScienceImageAssignments = generatedTermImages.assignments.filter(
  (assignment) => assignment.termId.startsWith("ES-"),
);
const earthScienceImageQuestionIds = new Set(
  earthScienceImageAssignments.map((assignment) => assignment.questionId),
);
const earthScienceTermById = new Map(
  generatedEarthScienceTerms.map((term) => [term.id, term]),
);
const expectedEarthScienceImageQuestionIds = new Set(
  earthScienceImageOverrides.flatMap((override) =>
    Object.values(earthScienceTermById.get(override.termId)?.stages ?? {})
      .flat()
      .map((question) => question.id),
  ),
);
const earthScienceImageCoverage =
  earthScienceImageOverrides.length / generatedEarthScienceTerms.length;
if (
  earthScienceImageCoverage < 0.4 ||
  earthScienceImageCoverage > 0.6 ||
  earthScienceImageTermIds.size !== earthScienceImageOverrides.length ||
  earthScienceImageQuestionIds.size !== expectedEarthScienceImageQuestionIds.size ||
  earthScienceImageOverrides.some(
    (override) =>
      !earthScienceImageTermIds.has(override.termId) || !override.fileName,
  ) ||
  earthScienceImageAssignments.some(
    (assignment) =>
      !expectedEarthScienceImageQuestionIds.has(assignment.questionId) ||
      assignment.target !== earthScienceTermById.get(assignment.termId)?.term,
  )
) {
  throw new Error(
    "地学基礎の厳選画像が全項目の40%以上60%以下へ用語単位で割り当てられていません。",
  );
}

const biologyImageOverrides = JSON.parse(
  await readFile(
    path.join(
      projectRoot,
      "data",
      "source",
      "biology-basics",
      "image-overrides.json",
    ),
    "utf8",
  ),
);
const biologyImageTermIds = new Set(
  generatedTermImages.termFallbacks
    .filter((fallback) => fallback.termId.startsWith("BB-"))
    .map((fallback) => fallback.termId),
);
const biologyImageAssignments = generatedTermImages.assignments.filter(
  (assignment) => assignment.termId.startsWith("BB-"),
);
const biologyImageQuestionIds = new Set(
  biologyImageAssignments.map((assignment) => assignment.questionId),
);
const biologyImageAssetIds = new Set(
  generatedTermImages.termFallbacks
    .filter((fallback) => fallback.termId.startsWith("BB-"))
    .map((fallback) => fallback.assetId),
);
const biologyTermById = new Map(
  generatedBiologyTerms.map((term) => [term.id, term]),
);
const expectedBiologyImageQuestionIds = new Set(
  biologyImageOverrides.flatMap((override) =>
    Object.values(biologyTermById.get(override.termId)?.stages ?? {})
      .flat()
      .map((question) => question.id),
  ),
);
const biologyImageCoverage =
  biologyImageOverrides.length / generatedBiologyTerms.length;
const biologyImageCategoryCounts = [
  "生物の特徴",
  "ヒトの体の調節",
  "生物の多様性と生態系",
].map(
  (category) =>
    generatedBiologyTerms.filter(
      (term) => category === term.category && biologyImageTermIds.has(term.id),
    ).length,
);
if (
  biologyImageOverrides.length !== 225 ||
  biologyImageCoverage < 0.7 ||
  biologyImageCoverage > 0.8 ||
  biologyImageCategoryCounts.some((count) => count !== 75) ||
  biologyImageTermIds.size !== biologyImageOverrides.length ||
  biologyImageQuestionIds.size !== expectedBiologyImageQuestionIds.size ||
  biologyImageAssetIds.size !== 167 ||
  biologyImageOverrides.some(
    (override) => !biologyImageTermIds.has(override.termId) || !override.fileName,
  ) ||
  biologyImageAssignments.some(
    (assignment) =>
      !expectedBiologyImageQuestionIds.has(assignment.questionId) ||
      assignment.target !== biologyTermById.get(assignment.termId)?.term,
  )
) {
  throw new Error(
    "生物基礎の関連画像167点が3大項目各75項目・全225項目へ用語単位で割り当てられていません。",
  );
}

const normalizeCommonsFileName = (sourcePageUrl) => {
  const marker = "/wiki/File:";
  const index = sourcePageUrl.indexOf(marker);
  if (index < 0) return "";
  return decodeURIComponent(sourcePageUrl.slice(index + marker.length))
    .normalize("NFKC")
    .replaceAll("_", " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
};
const termById = new Map(generatedTerms.map((term) => [term.id, term]));
const fallbackByTermId = new Map(
  generatedTermImages.termFallbacks.map((fallback) => [fallback.termId, fallback]),
);
const sourceImageOverrides = JSON.parse(
  await readFile(
    path.join(projectRoot, "data", "source", "world-history", "image-overrides.json"),
    "utf8",
  ),
);
const geographySourceOverrideMismatches = geographyImageOverrides.filter((override) => {
  const assetId = fallbackByTermId.get(override.termId)?.assetId;
  const asset = imageAssetById.get(assetId);
  return (
    normalizeCommonsFileName(asset?.sourcePageUrl ?? "") !==
    normalizeCommonsFileName(
      `https://commons.wikimedia.org/wiki/File:${override.fileName}`,
    )
  );
});
const politicsEconomicsSourceOverrideMismatches =
  politicsEconomicsImageOverrides.filter((override) => {
    const assetId = fallbackByTermId.get(override.termId)?.assetId;
    const asset = imageAssetById.get(assetId);
    return (
      normalizeCommonsFileName(asset?.sourcePageUrl ?? "") !==
      normalizeCommonsFileName(
        `https://commons.wikimedia.org/wiki/File:${override.fileName}`,
      )
    );
  });
const earthScienceSourceOverrideMismatches = earthScienceImageOverrides.filter(
  (override) => {
    const assetId = fallbackByTermId.get(override.termId)?.assetId;
    const asset = imageAssetById.get(assetId);
    return (
      normalizeCommonsFileName(asset?.sourcePageUrl ?? "") !==
      normalizeCommonsFileName(
        `https://commons.wikimedia.org/wiki/File:${override.fileName}`,
      )
    );
  },
);
const biologySourceOverrideMismatches = biologyImageOverrides.filter((override) => {
  const assetId = fallbackByTermId.get(override.termId)?.assetId;
  const asset = imageAssetById.get(assetId);
  return (
    normalizeCommonsFileName(asset?.sourcePageUrl ?? "") !==
    normalizeCommonsFileName(
      `https://commons.wikimedia.org/wiki/File:${override.fileName}`,
    )
  );
});
const auditedFallbackMismatches = generatedTerms
  .filter(
    (term) => Number(term.id.slice(3, 9)) > 400 && termFileOverrides.has(term.term),
  )
  .filter((term) => {
    const fallback = fallbackByTermId.get(term.id);
    const asset = imageAssetById.get(fallback?.assetId);
    return (
      normalizeCommonsFileName(asset?.sourcePageUrl ?? "") !==
      normalizeCommonsFileName(
        `https://commons.wikimedia.org/wiki/File:${termFileOverrides.get(term.term)}`,
      )
    );
  });
const auditedTargetMismatches = generatedTermImages.assignments.filter((assignment) => {
  if (Number(assignment.termId.slice(3, 9)) <= 400) return false;
  const term = termById.get(assignment.termId);
  const expectedFile = term
    ? targetFileOverrides.get(targetKey(term.term, assignment.target))
    : undefined;
  if (!expectedFile) return false;
  const asset = imageAssetById.get(assignment.assetId);
  return (
    normalizeCommonsFileName(asset?.sourcePageUrl ?? "") !==
    normalizeCommonsFileName(`https://commons.wikimedia.org/wiki/File:${expectedFile}`)
  );
});
const sourceOverrideMismatches = sourceImageOverrides.filter((override) => {
  const assetIds = override.target
    ? generatedTermImages.assignments
        .filter(
          (assignment) =>
            assignment.termId === override.termId && assignment.target === override.target,
        )
        .map((assignment) => assignment.assetId)
    : [fallbackByTermId.get(override.termId)?.assetId];
  return (
    assetIds.length === 0 ||
    assetIds.some((assetId) => {
      const asset = imageAssetById.get(assetId);
      return (
        normalizeCommonsFileName(asset?.sourcePageUrl ?? "") !==
        normalizeCommonsFileName(
          `https://commons.wikimedia.org/wiki/File:${override.fileName}`,
        )
      );
    })
  );
});
if (
  auditedFallbackMismatches.length > 0 ||
  auditedTargetMismatches.length > 0 ||
  sourceOverrideMismatches.length > 0 ||
  geographySourceOverrideMismatches.length > 0 ||
  politicsEconomicsSourceOverrideMismatches.length > 0 ||
  earthScienceSourceOverrideMismatches.length > 0 ||
  biologySourceOverrideMismatches.length > 0
) {
  throw new Error(
    `監査済み画像が指定した史料と一致しません: ${[
      ...auditedFallbackMismatches.map((term) => term.id),
      ...auditedTargetMismatches.map((assignment) => assignment.questionId),
      ...sourceOverrideMismatches.map((override) =>
        override.target ? `${override.termId}:${override.target}` : override.termId,
      ),
      ...geographySourceOverrideMismatches.map((override) => override.termId),
      ...politicsEconomicsSourceOverrideMismatches.map(
        (override) => override.termId,
      ),
      ...earthScienceSourceOverrideMismatches.map((override) => override.termId),
      ...biologySourceOverrideMismatches.map((override) => override.termId),
    ].join(", ")}`,
  );
}
await Promise.all(
  generatedTermImages.assets.map((image) => stat(path.join(dataRoot, image.path))),
);

const deck1Assignments = generatedTermImages.assignments.filter(
  (assignment) =>
    assignment.questionId.startsWith("WH-") &&
    Number(assignment.questionId.slice(3, 9)) <= 400,
);
const deck1Fallbacks = generatedTermImages.termFallbacks.filter(
  (fallback) =>
    fallback.termId.startsWith("WH-") && Number(fallback.termId.slice(3, 9)) <= 400,
);
const deck1AssetIds = new Set([
  ...deck1Assignments.map((assignment) => assignment.assetId),
  ...deck1Fallbacks.map((fallback) => fallback.assetId),
]);
const deck1Assets = generatedTermImages.assets.filter((asset) =>
  deck1AssetIds.has(asset.id),
);
if (
  digestJson(deck1Assignments) !==
    "e746bb9ee06914bdcd6813b833c1cee292989cabf8c10b83eda3dde661443100" ||
  digestJson(deck1Fallbacks) !==
    "049087253d70160f4b342089d93b3d1c74ef8e448806d3feef0d1f71f74d3c79" ||
  digestJson(deck1Assets) !==
    "f80bafb332581b335f9ca2a36f95c92ca406c0de05544105c150b4086da61ab2"
) {
  throw new Error("既存のDeck 1画像割り当てが変更されています。");
}

const contextRequiredQuestions = [...generatedTerms, ...generatedJapaneseTerms].flatMap((term) =>
  term.stages.beginner
    .filter((question) => question.type !== "identify")
    .map((question) => ({ term: term.term, question })),
);
const correctedPrompts = new Map([
  ["WH-000090-B03", "安史の乱(あんしのらん)を起こした節度使は？"],
  [
    "WH-000259-B03",
    "七月革命(しちがつかくめい)によって成立した王政は？",
  ],
  [
    "WH-000410-B03",
    "「海の民」の活動と同時期の前12世紀初頭に滅亡した、アナトリアの大国は？",
  ],
  [
    "WH-000603-B03",
    "「ヴェネツィア」商人の意向などから第4回十字軍が攻略した、ビザンツ帝国の都は？",
  ],
  [
    "WH-000747-B03",
    "「北京条約」で九竜半島南部を割譲された国は？",
  ],
]);
if (
  contextRequiredQuestions.length !== 3200 ||
  contextRequiredQuestions.some(
    ({ term, question }) => !question.prompt.includes(term),
  ) ||
  [...correctedPrompts].some(
    ([questionId, expectedPrompt]) =>
      generatedQuestions.find((question) => question.id === questionId)?.prompt !==
      expectedPrompt,
  )
) {
  throw new Error("短答問題が一問だけで対象を特定できる形になっていません。");
}

const readingPattern = /\([ぁ-ゖー]+(?:[・\s][ぁ-ゖー]+)*\)/;
if (
  [...generatedQuestions, ...generatedJapaneseQuestions].some((question) =>
    readingPattern.test(getQuestionPromptForDisplay(question, false)),
  ) ||
  [...generatedQuestions, ...generatedJapaneseQuestions].some(
    (question) => getQuestionPromptForDisplay(question, true) !== question.prompt,
  ) ||
  [...generatedQuestions, ...generatedJapaneseQuestions].some((question) =>
    [...question.keywords, ...question.acceptedAnswers].some((value) =>
      readingPattern.test(value),
    ),
  )
) {
  throw new Error("問題文の読み仮名を回答前だけ隠すためのデータが正しくありません。");
}

const termIds = generatedTerms.map((term) => term.id);
const termNames = generatedTerms.map((term) => term.term);
const importanceRanks = generatedTerms
  .map((term) => term.importanceRank)
  .sort((left, right) => left - right);
const questionIds = generatedQuestions.map((question) => question.id);
if (
  new Set(termIds).size !== 1200 ||
  new Set(termNames).size !== 1200 ||
  new Set(questionIds).size !== 7582 ||
  importanceRanks.some((rank, index) => rank !== index + 1)
) {
  throw new Error("Deck間でID・用語名・重要度順位が重複または欠落しています。");
}

const japaneseTermIds = generatedJapaneseTerms.map((term) => term.id);
const japaneseTermNames = generatedJapaneseTerms.map((term) => term.term);
const japaneseImportanceRanks = generatedJapaneseTerms
  .map((term) => term.importanceRank)
  .sort((left, right) => left - right);
const japaneseQuestionIds = generatedJapaneseQuestions.map((question) => question.id);
if (
  new Set(japaneseTermIds).size !== 400 ||
  new Set(japaneseTermNames).size !== 400 ||
  new Set(japaneseQuestionIds).size !== 2800 ||
  japaneseImportanceRanks.some((rank, index) => rank !== index + 1) ||
  japaneseTermIds.some((id) => !/^JH-\d{6}$/.test(id)) ||
  japaneseQuestionIds.some((id) => !/^JH-\d{6}-(?:B|R|I)\d{2}$/.test(id))
) {
  throw new Error("日本史Deck 1のID・用語名・重要度順位が重複または欠落しています。");
}

const duplicateMnemonicYearQuestion = [
  ...generatedQuestions,
  ...generatedJapaneseQuestions,
].find((question) => {
  const dates = splitMnemonicList(question.yearMnemonic).map((mnemonic) =>
    mnemonic.match(/^([^:：]+)[：:]/u)?.[1].trim(),
  );
  return dates.some((date) => !date) || new Set(dates).size !== dates.length;
});
if (duplicateMnemonicYearQuestion) {
  throw new Error(
    `${duplicateMnemonicYearQuestion.id}で同じ対象年の語呂合わせが重複しています。`,
  );
}

console.log(
  `検証完了: 世界史1200用語・7582問、日本史${generatedJapaneseTerms.length}語・${generatedJapaneseQuestions.length}問、英単語${generatedEnglishTerms.length}語・${generatedEnglishQuestions.length}問、地理${generatedGeographyTerms.length}項目・${generatedGeographyQuestions.length}問、政治・経済${generatedPoliticsEconomicsTerms.length}項目・${generatedPoliticsEconomicsQuestions.length}問、生物基礎${generatedBiologyTerms.length}項目・${generatedBiologyQuestions.length}問、地学基礎${generatedEarthScienceTerms.length}項目・${generatedEarthScienceQuestions.length}問、古文${generatedClassicalJapaneseTerms.length}項目・${generatedClassicalJapaneseQuestions.length}問、漢文${generatedClassicalChineseTerms.length}項目・${generatedClassicalChineseQuestions.length}問、マインドセット${generatedMindsetTerms.length}件、語呂合わせ${[...generatedQuestions, ...generatedJapaneseQuestions].filter((question) => question.yearMnemonic).length}問・関連画像${generatedTermImages.assets.length}点`,
);
