import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { loadWorldHistorySODecks } from "./build-learning-data.mjs";
import { createSOProgressMigration } from "./world-history-so-progress.mjs";
import { createSessionDatasetVersion, mergeDeckProgress } from "../public/deck-selection.js";

const { terms, decks, classification } = await loadWorldHistorySODecks();
const matches = JSON.parse(await readFile(new URL("../data/source/world-history-so/source-matches.json", import.meta.url), "utf8"));
assert.equal(matches.length, 356);
assert.equal(matches.filter((item) => item.status === "追加").length, 246);
assert.equal(terms.length, 357);
assert.equal(decks.length, 13);
assert.equal(new Set(decks.flatMap((deck) => deck.terms.map((term) => term.id))).size, 357);
assert.equal(classification.questions.filter((item) => item.legacyQuestionId).length, 111);
const byPrompt = new Map(decks.flatMap((deck) => deck.terms.map((term) => [term.stages.beginner[0].prompt, deck.number])));
for (const match of matches) assert.equal(byPrompt.get(match.prompt), match.chapter);
for (const [prompt, chapter] of [
  ["ウマイヤ朝の都は？", 2], ["イスラム史において最も多い王朝は何系？", 4],
  ["サーマーン朝の都は？", 3], ["カラ＝キタイについて説明しなさい", 4],
  ["オスマン帝国で、スルタン直属の常備歩兵軍団を何というか？", 9],
  ["チャルディラーンの戦いでサファヴィー朝を破り、東アナトリアを獲得したオスマン帝国のスルタンは？", 10],
]) assert.equal(byPrompt.get(prompt), chapter);
// 全入力行の対応を確認し、空白区切りの回答も取りこぼさない。
const sourceRoot = new URL("../SekaishiSO/", import.meta.url);
const sourceKeys = new Set();
const questionByPrompt = new Map(terms.map((term) => [term.stages.beginner[0].prompt, term.stages.beginner[0]]));
for (const file of (await readdir(sourceRoot)).filter((name) => /^QA_\d+\.md$/.test(name))) {
  const lines = (await readFile(new URL(file, sourceRoot), "utf8")).split(/\r?\n/);
  for (const [i, line] of lines.entries()) {
    if (!line.trim()) continue;
    const key = `SekaishiSO/${file}:${i + 1}`;
    sourceKeys.add(key);
    const found = matches.filter((match) => `${match.source}:${match.line}` === key);
    assert.equal(found.length, 1, key);
    const match = found[0];
    assert.ok(questionByPrompt.has(match.prompt), key);
    if (match.release === "0.233") {
      const [prompt, answer] = line.includes("\t") ? line.split("\t") : line.split(/(?<=？) /);
      assert.equal(match.originalPrompt, prompt.trim(), key);
      if (match.status === "追加") assert.equal(questionByPrompt.get(match.prompt).answer, answer.trim(), key);
    }
  }
}
assert.equal(sourceKeys.size, matches.length);
assert.equal(matches.filter((match) => match.release === "0.233" && match.status === "追加").length, 183);
assert.equal(matches.filter((match) => match.release === "0.233" && match.status === "同義").length, 4);
const maps = terms.filter((term) => term.stages.beginner[0].questionMap);
assert.deepEqual(maps.map((term) => byPrompt.get(term.stages.beginner[0].prompt)), [3, 3, 4, 5, 5, 7]);
const versions = new Map(decks.map((deck) => [deck.id, deck.version]));
assert.equal(new Set(decks.map((deck) => createSessionDatasetVersion("world-history-so", [deck.id], versions))).size, 13);
assert.ok(createSessionDatasetVersion("world-history-so", decks.map((deck) => deck.id), versions).length <= 100);

// 10章までの保存先を保ち、13章選択では順序に依存せず短縮する。
const oldDeckIds = decks.slice(0, 10).map((deck) => deck.id);
assert.equal(createSessionDatasetVersion("world-history-so", oldDeckIds, versions),
  `mix-world-history-so-${[...oldDeckIds].sort().join("-")}`);
const allDeckIds = decks.map((deck) => deck.id);
const combined = createSessionDatasetVersion("world-history-so", allDeckIds, versions);
assert.equal(combined, createSessionDatasetVersion("world-history-so", [...allDeckIds].reverse(), versions));
assert.notEqual(combined, createSessionDatasetVersion("world-history-so", allDeckIds.slice(1), versions));

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
console.log("世界史SO章分け検証完了: 元356問の照合、357問の所属、地図6問、習熟度の複写・未回答・再実行・他科目の維持を確認");
