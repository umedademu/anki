import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  countQuestionsByStage,
  loadEnglishDecks,
  loadJapaneseHistoryDecks,
  loadSourceDecks,
  loadTermImageManifest,
  mergeTermImageManifests,
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

const expectedSpecs = new Map([
  [
    "deck-1",
    {
      number: 1,
      version: "0836119c5d45",
      contentVersion: "6dd2eeeb145e",
      datasetLabel: "世界史段階別デッキ｜Deck 1｜最重要骨格400語",
      difficultyLabel: "Deck 1｜骨格・基礎",
      termCount: 400,
      questionCount: 2782,
      questionCounts: { beginner: 1200, reverse: 1182, integrated: 400 },
      mnemonicCount: 1187,
      distinctMnemonicCount: 403,
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
      contentVersion: "09e02e2de6d3",
      datasetLabel: "世界史段階別デッキ｜Deck 2｜共通テスト基礎400語",
      difficultyLabel: "Deck 2｜骨格・基礎",
      termCount: 400,
      questionCount: 2400,
      questionCounts: { beginner: 1200, reverse: 800, integrated: 400 },
      mnemonicCount: 1173,
      distinctMnemonicCount: 398,
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
      contentVersion: "7edfff4529a4",
      datasetLabel: "世界史段階別デッキ｜Deck 3｜主要王朝・人物・制度の穴埋め400語",
      difficultyLabel: "Deck 3｜標準",
      termCount: 400,
      questionCount: 2400,
      questionCounts: { beginner: 1200, reverse: 800, integrated: 400 },
      mnemonicCount: 1170,
      distinctMnemonicCount: 390,
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
]);

const expectedJapaneseSpec = {
  number: 1,
  version: "jh-455fb6def169",
  contentVersion: "455fb6def169",
  datasetLabel: "日本史段階別デッキ｜Deck 1｜日本史の最重要骨格400語",
  difficultyLabel: "Deck 1｜骨格・基礎",
  termCount: 400,
  questionCount: 2800,
  questionCounts: { beginner: 1200, reverse: 1200, integrated: 400 },
  mnemonicCount: 604,
};

const { decks: sourceDecks, terms: expectedTerms } = await loadSourceDecks();
const {
  decks: sourceJapaneseDecks,
  terms: expectedJapaneseTerms,
} = await loadJapaneseHistoryDecks();
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
  catalog.subjects.length !== 3 ||
  catalog.subjects.map((subject) => subject.id).join(",") !==
    "world-history,japanese-history,english-vocabulary"
) {
  throw new Error("世界史・日本史・英単語の科目一覧が正しくありません。");
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
    exactDateQuestions.some((question) => !question.yearMnemonic.trim()) ||
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
        !integratedMnemonics.has([...mnemonics][0])
      );
    })
  ) {
    throw new Error(
      `${deckEntry.id}の単一年・年月・年月日の語呂合わせが不足または不統一です。`,
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
    datedPeriodQuestions.some((question) => !question.yearMnemonic.trim()) ||
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
      `${deckEntry.id}の数字を含む時期問題の語呂合わせが不足または不統一です。`,
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
  sourceEnglishDecks.length !== 2 ||
  sourceEnglishDecks.some((deck) => !expectedEnglishSpecs.has(deck.id)) ||
  !englishSubjectEntry ||
  englishSubjectEntry.defaultDeckId !== "deck-1" ||
  englishSubjectEntry.datasetLabel !== "英単語段階別デッキ｜Deck 1〜2" ||
  englishSubjectEntry.termCount !== 1000 ||
  englishSubjectEntry.questionCount !== 3000 ||
  englishSubjectEntry.decks.length !== 2 ||
  englishSubjectEntry.decks.map((deck) => deck.id).join(",") !==
    "deck-1,deck-2"
) {
  throw new Error("英単語Deck 1・Deck 2の科目一覧が正しくありません。");
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
  new Set(generatedEnglishTerms.map((term) => term.id)).size !== 1000 ||
  new Set(generatedEnglishTerms.map((term) => term.term)).size !== 1000 ||
  new Set(generatedEnglishQuestions.map((question) => question.id)).size !== 3000 ||
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
  [...generatedTerms, ...generatedJapaneseTerms].flatMap((term) =>
    Object.values(term.stages)
      .flat()
      .map((question) => [question.id, term.id]),
  ),
);
if (
  JSON.stringify(generatedTermImages) !== JSON.stringify(expectedTermImages) ||
  generatedTermImages.schemaVersion !== 2 ||
  fallbackTermIds.size !== 1600 ||
  generatedTermImages.termFallbacks.length !== 1600 ||
  assignedQuestionIds.size !== 10382 ||
  generatedTermImages.assignments.length !== 10382 ||
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
  throw new Error("世界史と日本史の関連画像が全問題へ正しく割り当てられていません。");
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
  sourceOverrideMismatches.length > 0
) {
  throw new Error(
    `監査済み画像が指定した史料と一致しません: ${[
      ...auditedFallbackMismatches.map((term) => term.id),
      ...auditedTargetMismatches.map((assignment) => assignment.questionId),
      ...sourceOverrideMismatches.map((override) =>
        override.target ? `${override.termId}:${override.target}` : override.termId,
      ),
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

const representativeMnemonic = generatedQuestions.find(
  (question) => question.id === "WH-000045-B02",
);
if (
  representativeMnemonic?.yearMnemonic !==
  "476年：死なむ（476）西ローマ帝国"
) {
  throw new Error("Deck 1の既存語呂合わせが変更されています。");
}

console.log(
  `検証完了: 世界史1200用語・7582問、日本史${generatedJapaneseTerms.length}語・${generatedJapaneseQuestions.length}問、英単語${generatedEnglishTerms.length}語・${generatedEnglishQuestions.length}問、語呂合わせ${[...generatedQuestions, ...generatedJapaneseQuestions].filter((question) => question.yearMnemonic).length}問・関連画像${generatedTermImages.assets.length}点`,
);
