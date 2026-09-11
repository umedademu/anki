import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { loadWorldHistorySODecks } from "./build-learning-data.mjs";
import { createSOProgressMigration } from "./world-history-so-progress.mjs";
import { createSessionDatasetVersion, mergeDeckProgress } from "../public/deck-selection.js";

const { terms, decks, classification } = await loadWorldHistorySODecks();
const matches = JSON.parse(await readFile(new URL("../data/source/world-history-so/source-matches.json", import.meta.url), "utf8"));
assert.equal(matches.length, 169);
assert.equal(matches.filter((item) => item.status === "追加").length, 63);
assert.equal(terms.length, 174);
assert.equal(decks.length, 10);
assert.equal(new Set(decks.flatMap((deck) => deck.terms.map((term) => term.id))).size, 174);
assert.equal(classification.questions.filter((item) => item.legacyQuestionId).length, 111);
const byPrompt = new Map(decks.flatMap((deck) => deck.terms.map((term) => [term.stages.beginner[0].prompt, deck.number])));
for (const match of matches) assert.equal(byPrompt.get(match.prompt), match.chapter);
for (const [prompt, chapter] of [
  ["ウマイヤ朝の都は？", 2], ["イスラム史において最も多い王朝は何系？", 4],
  ["サーマーン朝の都は？", 3], ["カラ＝キタイについて説明しなさい", 4],
  ["オスマン帝国で、スルタン直属の常備歩兵軍団を何というか？", 9],
  ["チャルディラーンの戦いでサファヴィー朝を破り、東アナトリアを獲得したオスマン帝国のスルタンは？", 10],
]) assert.equal(byPrompt.get(prompt), chapter);
const maps = terms.filter((term) => term.stages.beginner[0].questionMap);
assert.deepEqual(maps.map((term) => byPrompt.get(term.stages.beginner[0].prompt)), [3, 3, 4, 5, 5, 7]);
const versions = new Map(decks.map((deck) => [deck.id, deck.version]));
assert.equal(new Set(decks.map((deck) => createSessionDatasetVersion("world-history-so", [deck.id], versions))).size, 10);
assert.ok(createSessionDatasetVersion("world-history-so", decks.map((deck) => deck.id), versions).length <= 100);

// 習得済み・不正解・未回答を混ぜ、元の記録と他科目を維持したまま複写する。
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE question_progress (
 dataset_version TEXT, question_id TEXT, streak INTEGER, attempts INTEGER, remembered_count INTEGER,
 last_rating TEXT, last_answered_at TEXT, next_review_at TEXT, ever_mastered INTEGER, updated_at TEXT,
 PRIMARY KEY(dataset_version, question_id));`);
const migration = createSOProgressMigration(decks, classification);
const insert = db.prepare("INSERT INTO question_progress VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
for (const [i, item] of migration.entries()) {
  if (i % 4 === 0) continue;
  insert.run(classification.legacyVersion, item.questionId, i % 3, i + 1, i,
    i % 2 ? "good" : "again", "2026-09-11T01:00:00.000Z", "2026-09-12T01:00:00.000Z", i % 2, "2026-09-11T01:00:00.000Z");
}
insert.run("other-subject-v1", "other", 2, 4, 3, "easy", null, null, 1, "2026-09-11");
const before = db.prepare("SELECT * FROM question_progress ORDER BY dataset_version, question_id").all();
db.exec(migration.map((item) => item.sql).join("\n"));
for (const item of migration) {
 const original = db.prepare("SELECT * FROM question_progress WHERE dataset_version = ? AND question_id = ?").get(classification.legacyVersion, item.questionId);
 const copied = db.prepare("SELECT * FROM question_progress WHERE dataset_version = ? AND question_id = ?").get(item.version, item.questionId);
 if (!original) assert.equal(copied, undefined);
 else assert.deepEqual({ ...copied }, { ...original, dataset_version: item.version });
}
assert.deepEqual(db.prepare("SELECT * FROM question_progress WHERE dataset_version NOT LIKE 'world-history-so-chapter-%' ORDER BY dataset_version, question_id").all(), before);
const learned = migration[1];
db.prepare("UPDATE question_progress SET streak = 0, attempts = 99, last_rating = 'again' WHERE dataset_version = ? AND question_id = ?").run(learned.version, learned.questionId);
db.exec(migration.map((item) => item.sql).join("\n"));
assert.equal(db.prepare("SELECT attempts FROM question_progress WHERE dataset_version = ? AND question_id = ?").get(learned.version, learned.questionId).attempts, 99);
const merged = mergeDeckProgress(decks.map((deck) => ({progress: {questions: Object.fromEntries(db.prepare("SELECT question_id, streak FROM question_progress WHERE dataset_version = ?").all(deck.version).map((row) => [row.question_id, row])), updatedAt: null}})));
assert.equal(Object.keys(merged.questions).length, before.length - 1);
db.close();
console.log("世界史SO章分け検証完了: 元169問の照合、174問の所属、地図6問、習熟度の複写・未回答・再実行・他科目の維持を確認");
