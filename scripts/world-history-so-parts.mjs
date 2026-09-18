import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);

// 本番から取得した問題をそのまま並べ替え、所属表示だけを変更する。
export function regroupSOParts(catalog, currentDecks, classification) {
  const next = structuredClone(catalog);
  const subject = next.subjects.find((item) => item.id === "world-history-so");
  assert.ok(subject);
  const current = currentDecks.flatMap((deck) => deck.chunks.flatMap((chunk) => chunk.terms));
  const assignments = new Map(classification.questions.map((item) => [item.questionId, item]));
  const seen = new Set();
  for (const deck of currentDecks) for (const term of deck.chunks.flatMap((chunk) => chunk.terms)) {
    const question = term.stages.beginner[0];
    const assignment = assignments.get(question.id);
    assert.ok(assignment, `所属未設定の問題: ${question.id}`);
    assert.equal(assignment.prompt, question.prompt, "問題文が変更されています。対応表を確認してください。");
    assert.ok(!seen.has(question.id), "問題番号が重複しています。");
    seen.add(question.id);
    const destination = classification.chapters.find((part) => part.number === assignment.chapter);
    assert.ok(destination);
    assert.ok(deck.index.version === assignment.previousVersion || deck.index.version === destination.version,
      "想定していない履歴版です。対応表を確認してください。");
  }
  assert.equal(seen.size, assignments.size, "本番と対応表の問題数が異なります。");
  assert.equal(classification.chapters.length, 9);
  const staged = [], decks = [];
  for (const part of classification.chapters) {
    const datasetLabel = `世界史SO｜第${part.lesson}回 ${part.part} ${part.title}`;
    const terms = current.filter((term) => assignments.get(term.stages.beginner[0].id).chapter === part.number)
      .map((term) => ({ ...structuredClone(term), datasetLabel }))
      .sort((a, b) => a.importanceRank - b.importanceRank);
    assert.ok(terms.length);
    const contentVersion = hash(terms);
    const prefix = `subjects/world-history-so/question-types/parts-${contentVersion}/${part.id}`;
    const original = currentDecks.find((deck) => deck.entry.id === part.id);
    assert.ok(original);
    const index = { ...structuredClone(original.index), deckNumber: part.number, datasetLabel,
      difficultyLabel: part.title, version: part.version, contentVersion, termCount: terms.length,
      questionCount: terms.length, questionCounts: { beginner: terms.length, reverse: 0, integrated: 0 }, chunks: [] };
    for (let offset = 0; offset < terms.length; offset += 100) {
      const number = index.chunks.length + 1, items = terms.slice(offset, offset + 100);
      const path = `${prefix}/chunks/${String(number).padStart(4, "0")}.json`;
      staged.push({ path, value: { schemaVersion: 3, subjectId: subject.id, deckId: part.id, chunkNumber: number, terms: items } });
      index.chunks.push({ number, path, count: items.length, firstTerm: items[0].term, lastTerm: items.at(-1).term });
    }
    const entry = { ...original.entry, number: part.number, datasetLabel, difficultyLabel: part.title,
      version: part.version, contentVersion, termCount: terms.length, questionCount: terms.length, indexPath: `${prefix}/index.json` };
    staged.push({ path: entry.indexPath, value: index });
    decks.push({ ...entry, terms });
  }
  const beforeById = new Map(current.map((term) => [term.id, term]));
  for (const term of decks.flatMap((deck) => deck.terms)) {
    const before = beforeById.get(term.id);
    assert.deepEqual({ ...term, datasetLabel: before.datasetLabel }, before,
      "所属表示以外の問題内容が変更されています。");
  }
  subject.decks = decks.map(({ terms, ...entry }) => entry);
  subject.datasetLabel = "世界史SO｜第6章 イスラーム世界（9パート）";
  subject.deckSelectionAliases = classification.selectionAliases;
  subject.indexPath = subject.decks.find((deck) => deck.id === subject.defaultDeckId).indexPath;
  next.version = hash(next.subjects);
  assert.deepEqual(next.subjects.filter((item) => item.id !== subject.id), catalog.subjects.filter((item) => item.id !== subject.id));
  return { next, staged, decks };
}
