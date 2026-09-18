import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { regroupSOParts } from "./world-history-so-parts.mjs";
import { createSOProgressMigration } from "./world-history-so-progress.mjs";
import { normalizeDeckSelection } from "../public/deck-selection.js";
import { loadWorldHistorySODecks } from "./build-learning-data.mjs";

const { terms, decks, classification } = await loadWorldHistorySODecks();
assert.deepEqual(classification.chapters.map(p => [p.lesson, p.part]),
  [[20, 1], [20, 2], [20, 3], [20, 4], [21, 1], [21, 2], [21, 3], [21, 4], [21, 5]]);
assert.deepEqual(decks.map(d => d.terms.length), [20, 32, 47, 31, 22, 24, 76, 70, 35]);
// 旧13章の試験用データを作り、所属以外の値を追加しても保持されることを確認する。
const current = Array.from({ length: 13 }, (_, i) => {
  const id = `deck-${i + 1}`, version = `world-history-so-chapter-${String(i + 1).padStart(2, "0")}-v1`;
  return { entry: { id, version }, index: { version, deckId: id }, chunks: [{ terms: terms.filter(t =>
    classification.questions.find(q => q.questionId === t.stages.beginner[0].id).previousChapter === i + 1) }] };
});
const catalog = { subjects: [{ id: "other", arbitrary: 1 }, { id: "world-history-so", defaultDeckId: "deck-1", termCount: 357, questionCount: 357 }] };
current[0].chunks[0].terms[0].stages.beginner[0].answerNote = "本番で編集された補足";
const result = regroupSOParts(catalog, current, classification);
assert.equal(result.next.subjects[1].decks.length, 9);
assert.equal(result.decks[0].terms[0].stages.beginner[0].answerNote, "本番で編集された補足");
assert.deepEqual(result.next.subjects[0], catalog.subjects[0]);
assert.equal(result.decks.flatMap(d => d.terms).length, 357);
const missing = structuredClone(current); missing[0].chunks[0].terms.pop();
assert.throws(() => regroupSOParts(catalog, missing, classification), /問題数/);
const extra = structuredClone(current); extra[0].chunks[0].terms.push(extra[0].chunks[0].terms[0]);
assert.throws(() => regroupSOParts(catalog, extra, classification), /重複/);
const again = result.decks.map(d => ({ entry: result.next.subjects[1].decks.find(e => e.id === d.id),
  index: result.staged.find(o => o.path === d.indexPath).value, chunks: [{ terms: d.terms }] }));
assert.deepEqual(regroupSOParts(result.next, again, classification).next, result.next);

const ids = decks.map(d => d.id);
assert.deepEqual(normalizeDeckSelection(ids, ["deck-10", "deck-11", "deck-6"], "deck-1", classification.selectionAliases), ["deck-5", "deck-9"]);
assert.deepEqual(normalizeDeckSelection(ids, ["deck-4"], "deck-1", classification.selectionAliases), ["deck-2", "deck-3", "deck-13"]);
assert.deepEqual(normalizeDeckSelection(["deck-1", "deck-4"], ["deck-4"]), ["deck-4"]);

const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE question_progress (dataset_version TEXT, question_id TEXT, streak INTEGER,
 attempts INTEGER, remembered_count INTEGER, last_rating TEXT, last_answered_at TEXT, next_review_at TEXT,
 ever_mastered INTEGER, updated_at TEXT, PRIMARY KEY(dataset_version, question_id));`);
const migration = createSOProgressMigration(decks, classification);
const insert = db.prepare("INSERT OR IGNORE INTO question_progress VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
for (const [i, item] of migration.entries()) {
  if (i % 4 === 0) continue;
  insert.run(item.sourceVersion, item.questionId, i % 3, i + 1, i, i % 2 ? "good" : "again",
    "2026-09-18T01:00:00Z", "2026-09-19T01:00:00Z", i % 2, "2026-09-18T01:00:00Z");
}
insert.run("other", "other", 1, 1, 1, "easy", null, null, 1, "2026-09-18");
const before = db.prepare("SELECT * FROM question_progress ORDER BY dataset_version, question_id").all();
const expected = new Map(before.map(row => [`${row.dataset_version}/${row.question_id}`, { ...row }]));
for (const item of migration) {
  const old = expected.get(`${item.sourceVersion}/${item.questionId}`), key = `${item.version}/${item.questionId}`;
  if (old && !expected.has(key)) expected.set(key, { ...old, dataset_version: item.version });
}
db.exec(migration.map(item => item.sql).join("\n"));
const after = db.prepare("SELECT * FROM question_progress ORDER BY dataset_version, question_id").all();
assert.equal(after.length, expected.size);
for (const row of after) assert.deepEqual({ ...row }, expected.get(`${row.dataset_version}/${row.question_id}`));
for (const row of before) assert.deepEqual({ ...db.prepare("SELECT * FROM question_progress WHERE dataset_version = ? AND question_id = ?").get(row.dataset_version, row.question_id) }, { ...row });
const learned = migration.find(item => expected.has(`${item.version}/${item.questionId}`));
db.prepare("UPDATE question_progress SET attempts = 999 WHERE dataset_version = ? AND question_id = ?").run(learned.version, learned.questionId);
db.exec(migration.map(item => item.sql).join("\n"));
assert.equal(db.prepare("SELECT attempts FROM question_progress WHERE dataset_version = ? AND question_id = ?").get(learned.version, learned.questionId).attempts, 999);
db.close();
console.log("9パート検証完了: 問題内容・地図の保持、欠落と重複の拒否、再実行、旧選択の復元、履歴の複写と上書き防止");
