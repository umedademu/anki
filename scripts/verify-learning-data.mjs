import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  countQuestionsByStage,
  loadEnglishDecks,
  loadSourceDecks,
  loadTermImageManifest,
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

const expectedSpecs = new Map([
  [
    "deck-1",
    {
      number: 1,
      version: "0836119c5d45",
      contentVersion: "38a0118c46ca",
      datasetLabel: "世界史段階別デッキ｜Deck 1｜最重要骨格400語",
      difficultyLabel: "Deck 1｜骨格・基礎",
      termCount: 400,
      questionCount: 2782,
      questionCounts: { beginner: 1200, reverse: 1182, integrated: 400 },
      mnemonicCount: 213,
      distinctMnemonicCount: 70,
      exactDateQuestionCount: 116,
      exactDateTermCount: 59,
    },
  ],
  [
    "deck-2",
    {
      number: 2,
      version: "8acba0d50165",
      contentVersion: "e0904a4f00d5",
      datasetLabel: "世界史段階別デッキ｜Deck 2｜共通テスト基礎400語",
      difficultyLabel: "Deck 2｜骨格・基礎",
      termCount: 400,
      questionCount: 2400,
      questionCounts: { beginner: 1200, reverse: 800, integrated: 400 },
      mnemonicCount: 204,
      distinctMnemonicCount: 68,
      exactDateQuestionCount: 133,
      exactDateTermCount: 69,
    },
  ],
]);

const { decks: sourceDecks, terms: expectedTerms } = await loadSourceDecks();
const sourceDeckById = new Map(sourceDecks.map((deck) => [deck.id, deck]));
if (
  sourceDecks.length !== 2 ||
  sourceDecks.some((deck) => !expectedSpecs.has(deck.id))
) {
  throw new Error("元CSVがDeck 1・Deck 2の2冊構成になっていません。");
}

const catalog = await readJson("index.json");
if (
  catalog.schemaVersion !== 3 ||
  catalog.subjects.length !== 2 ||
  catalog.subjects.map((subject) => subject.id).join(",") !==
    "world-history,english-vocabulary"
) {
  throw new Error("世界史と英単語の科目一覧が正しくありません。");
}
const subjectEntry = catalog.subjects.find(
  (subject) => subject.id === "world-history",
);
const englishSubjectEntry = catalog.subjects.find(
  (subject) => subject.id === "english-vocabulary",
);
if (
  subjectEntry.id !== "world-history" ||
  subjectEntry.indexPath !== "subjects/world-history/index.json" ||
  subjectEntry.defaultDeckId !== "deck-1" ||
  !Array.isArray(subjectEntry.decks) ||
  subjectEntry.decks.length !== 2 ||
  subjectEntry.decks.map((deck) => deck.id).join(",") !== "deck-1,deck-2"
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
      return (
        mnemonics.size !== 1 ||
        term.stages.integrated[0].yearMnemonic !== [...mnemonics][0]
      );
    })
  ) {
    throw new Error(
      `${deckEntry.id}の単一年・年月・年月日の語呂合わせが不足または不統一です。`,
    );
  }
  generatedDecks.push({ entry: deckEntry, subject, terms, questions });
}

const generatedTerms = generatedDecks.flatMap((deck) => deck.terms);
const generatedQuestions = generatedDecks.flatMap((deck) => deck.questions);
const generatedCounts = countQuestionsByStage(generatedTerms);
if (
  generatedTerms.length !== 800 ||
  generatedQuestions.length !== 5182 ||
  JSON.stringify(generatedCounts) !==
    JSON.stringify({ beginner: 2400, reverse: 1982, integrated: 800 }) ||
  JSON.stringify(generatedTerms) !== JSON.stringify(expectedTerms) ||
  subjectEntry.datasetLabel !== "世界史段階別デッキ｜Deck 1〜2" ||
  subjectEntry.termCount !== 800 ||
  subjectEntry.questionCount !== 5182
) {
  throw new Error("Deck 1・Deck 2の総件数または統合索引が一致しません。");
}

const { decks: sourceEnglishDecks, terms: expectedEnglishTerms } =
  await loadEnglishDecks();
if (
  sourceEnglishDecks.length !== 1 ||
  !englishSubjectEntry ||
  englishSubjectEntry.defaultDeckId !== "deck-1" ||
  englishSubjectEntry.termCount !== 500 ||
  englishSubjectEntry.questionCount !== 1500 ||
  englishSubjectEntry.decks.length !== 1
) {
  throw new Error("英単語Deck 1の科目一覧が正しくありません。");
}
const englishDeckEntry = englishSubjectEntry.decks[0];
const englishSubject = await readJson(englishDeckEntry.indexPath);
const englishChunks = await Promise.all(
  englishSubject.chunks.map((chunk) => readJson(chunk.path)),
);
const generatedEnglishTerms = englishChunks.flatMap((chunk) => chunk.terms);
const generatedEnglishQuestions = generatedEnglishTerms.flatMap((term) =>
  Object.values(term.stages).flat(),
);
const generatedEnglishCounts = countQuestionsByStage(generatedEnglishTerms);
if (
  englishDeckEntry.version !== "en-6984fb69efaf" ||
  englishDeckEntry.contentVersion !== "6984fb69efaf" ||
  englishSubject.version !== "en-6984fb69efaf" ||
  englishSubject.contentVersion !== "6984fb69efaf" ||
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
  JSON.stringify(generatedEnglishTerms) !== JSON.stringify(expectedEnglishTerms)
) {
  throw new Error("英単語Deck 1の生成内容が元CSVと一致しません。");
}
if (
  new Set(generatedEnglishTerms.map((term) => term.id)).size !== 500 ||
  new Set(generatedEnglishTerms.map((term) => term.term)).size !== 500 ||
  new Set(generatedEnglishQuestions.map((question) => question.id)).size !== 1500 ||
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
const expectedTermImages = await loadTermImageManifest(expectedTerms);
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
  generatedTerms.flatMap((term) =>
    Object.values(term.stages)
      .flat()
      .map((question) => [question.id, term.id]),
  ),
);
if (
  JSON.stringify(generatedTermImages) !== JSON.stringify(expectedTermImages) ||
  generatedTermImages.schemaVersion !== 2 ||
  fallbackTermIds.size !== 800 ||
  generatedTermImages.termFallbacks.length !== 800 ||
  assignedQuestionIds.size !== 5182 ||
  generatedTermImages.assignments.length !== 5182 ||
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
  throw new Error("Deck 1・Deck 2の関連画像が全問題へ正しく割り当てられていません。");
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
if (auditedFallbackMismatches.length > 0 || auditedTargetMismatches.length > 0) {
  throw new Error(
    `監査済み画像が指定した史料と一致しません: ${[
      ...auditedFallbackMismatches.map((term) => term.id),
      ...auditedTargetMismatches.map((assignment) => assignment.questionId),
    ].join(", ")}`,
  );
}
await Promise.all(
  generatedTermImages.assets.map((image) => stat(path.join(dataRoot, image.path))),
);

const deck1Assignments = generatedTermImages.assignments.filter(
  (assignment) => Number(assignment.questionId.slice(3, 9)) <= 400,
);
const deck1Fallbacks = generatedTermImages.termFallbacks.filter(
  (fallback) => Number(fallback.termId.slice(3, 9)) <= 400,
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

const contextRequiredQuestions = generatedTerms.flatMap((term) =>
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
    "「海の民(うみのたみ)」の活動と同時期の前12世紀初頭に滅亡した、アナトリアの大国は？",
  ],
  [
    "WH-000603-B03",
    "「ヴェネツィア(ゔぇねつぃあ)」商人の意向などから第4回十字軍(だいよんかいじゅうじぐん)が攻略した、ビザンツ帝国(びざんつていこく)の都は？",
  ],
  [
    "WH-000747-B03",
    "「北京条約(ぺきんじょうやく)」で九竜半島(きゅうりゅうはんとう)南部を割譲された国は？",
  ],
]);
if (
  contextRequiredQuestions.length !== 1600 ||
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
  generatedQuestions.some((question) =>
    readingPattern.test(getQuestionPromptForDisplay(question, false)),
  ) ||
  generatedQuestions.some(
    (question) => getQuestionPromptForDisplay(question, true) !== question.prompt,
  ) ||
  generatedQuestions.some((question) =>
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
  new Set(termIds).size !== 800 ||
  new Set(termNames).size !== 800 ||
  new Set(questionIds).size !== 5182 ||
  importanceRanks.some((rank, index) => rank !== index + 1)
) {
  throw new Error("Deck間でID・用語名・重要度順位が重複または欠落しています。");
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
  `検証完了: 世界史800用語・5182問、英単語500語・1500問、語呂合わせ${generatedQuestions.filter((question) => question.yearMnemonic).length}問・関連画像${generatedTermImages.assets.length}点`,
);
