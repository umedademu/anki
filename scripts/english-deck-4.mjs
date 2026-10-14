import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseCsv, toEnglishObjects, groupEnglishTerms, countQuestionsByStage } from "./build-learning-data.mjs";

export const englishSubjectId = "english-vocabulary";
export const englishDeck4Source = new URL("../data/source/english-vocabulary/english_vocabulary_deck4_common_test_standard_500.csv", import.meta.url);
export const contentHash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const englishDeck4Definition = {
  id: englishSubjectId, title: "英単語", catalogLabel: "英単語段階別デッキ",
  description: "英語・意味・例文の三方向から覚える大学受験英単語", learningType: "vocabulary", termUnitLabel: "語",
  filterLabels: { category: "品詞" }, stageLabels: { all: "三方向すべて", beginner: "英語から意味", reverse: "意味から英語", integrated: "例文から和訳" },
};

export function buildEnglishDeck4(sourceText) {
  const rows = toEnglishObjects(parseCsv(sourceText));
  assert.equal(rows.length, 500, "Deck 4は500語の原稿を使用してください。");
  for (const [position, row] of rows.entries()) {
    assert.equal(row.term_id, `EN-${String(position + 1501).padStart(6, "0")}`, "単語番号は1501〜2000を順番に使います。");
    assert.equal(Number(row.importance_rank), position + 1501, "順位に欠けや重複があります。");
    assert.equal(row.dataset_label, "英単語段階別デッキ｜Deck 4｜共通テスト標準500語");
    assert.equal(row.difficulty_label, "Deck 4｜共通テスト標準");
  }
  const terms = groupEnglishTerms(rows);
  assert.equal(new Set(terms.map(term => term.term.normalize("NFKC").toLowerCase())).size, 500, "大文字や表記の違いを除くと単語が重複しています。");
  const contentVersion = createHash("sha256").update(sourceText).digest("hex").slice(0, 12);
  const deck = { id: "deck-4", number: 4, sourceFile: "english_vocabulary_deck4_common_test_standard_500.csv", sourceText,
    version: "english-vocabulary-deck-4-v1", contentVersion, datasetLabel: rows[0].dataset_label, difficultyLabel: rows[0].difficulty_label, terms };
  const folder = `subjects/${englishSubjectId}/imports/deck-4/${contentVersion}`, objects = [], chunks = [];
  for (let offset = 0; offset < terms.length; offset += 50) {
    const number = chunks.length + 1, part = terms.slice(offset, offset + 50), key = `${folder}/chunks/${String(number).padStart(4, "0")}.json`;
    objects.push({ key, value: { schemaVersion: 3, subjectId: englishSubjectId, deckId: deck.id, chunkNumber: number, terms: part } });
    chunks.push({ number, path: key, count: part.length, firstTerm: part[0].term, lastTerm: part.at(-1).term });
  }
  const questionCounts = countQuestionsByStage(terms), questionCount = Object.values(questionCounts).reduce((sum, count) => sum + count, 0);
  assert.deepEqual(questionCounts, { beginner: 500, reverse: 500, integrated: 500 });
  const index = { schemaVersion: 3, ...englishDeck4Definition, availableStages: ["beginner", "reverse", "integrated"],
    deckId: deck.id, deckNumber: 4, datasetLabel: deck.datasetLabel, difficultyLabel: deck.difficultyLabel,
    version: deck.version, contentVersion, sourceFile: deck.sourceFile, termCount: 500, questionCount, questionCounts, masteryTarget: 2, chunks };
  delete index.catalogLabel;
  const entry = { id: deck.id, number: 4, datasetLabel: deck.datasetLabel, difficultyLabel: deck.difficultyLabel,
    version: deck.version, contentVersion, termCount: 500, questionCount, indexPath: `${folder}/index.json` };
  objects.push({ key: entry.indexPath, value: index });
  return { deck, entry, index, terms, objects };
}

export async function loadEnglishDeck4() { return buildEnglishDeck4(await readFile(englishDeck4Source, "utf8")); }

export function checkEnglishDeck4Overlap(existingTerms, plan) {
  const ids = new Set(existingTerms.map(term => term.id));
  const questions = new Set(existingTerms.flatMap(term => Object.values(term.stages).flat().map(question => question.id)));
  const words = new Set(existingTerms.map(term => term.term.normalize("NFKC").toLowerCase().trim()));
  for (const term of plan.terms) {
    assert.ok(!ids.has(term.id), `既存の単語番号と重複しています：${term.id}`);
    assert.ok(!words.has(term.term.normalize("NFKC").toLowerCase().trim()), `既存の英単語と重複しています：${term.term}`);
    for (const question of Object.values(term.stages).flat()) assert.ok(!questions.has(question.id), `既存の問題番号と重複しています：${question.id}`);
  }
}

export function appendEnglishDeck4(catalog, plan) {
  assert.equal(catalog.schemaVersion, 3);
  const next = structuredClone(catalog), subject = next.subjects.find(item => item.id === englishSubjectId);
  assert.ok(subject?.learningType === "vocabulary" && subject.decks?.length, "Cloudflare上の英単語の一覧を取得してください。");
  const current = subject.decks.find(deck => deck.id === "deck-4");
  if (current) { assert.deepEqual(current, plan.entry, "登録後の編集を上書きしません。"); return next; }
  assert.deepEqual(subject.decks.map(deck => deck.id), ["deck-1", "deck-2", "deck-3"], "既存のデッキ構成が想定と異なります。");
  assert.equal(subject.datasetLabel, "英単語段階別デッキ｜Deck 1〜3");
  subject.decks.push(structuredClone(plan.entry));
  subject.datasetLabel = "英単語段階別デッキ｜Deck 1〜4";
  subject.termCount += plan.entry.termCount;
  subject.questionCount += plan.entry.questionCount;
  next.version = contentHash(next.subjects).slice(0, 20);
  return next;
}
