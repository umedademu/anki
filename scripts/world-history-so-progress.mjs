import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const columns = ["question_id", "streak", "attempts", "remembered_count", "last_rating", "last_answered_at", "next_review_at", "ever_mastered", "updated_at"];
const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
export function createSOProgressMigration(decks, classification) {
  assert.equal(classification.legacyVersion, "world-history-so-deck-1-v1");
  const destination = new Map(decks.flatMap((deck) => deck.terms.map((term) => [term.stages.beginner[0].id, deck.version])));
  return classification.questions.filter((item) => item.legacyQuestionId).map((item) => {
    const version = destination.get(item.legacyQuestionId);
    assert.match(version, /^world-history-so-chapter-\d{2}-v1$/);
    return {
      questionId: item.legacyQuestionId, version,
      sql: `INSERT INTO question_progress (dataset_version, ${columns.join(", ")})
SELECT ${quote(version)}, ${columns.join(", ")} FROM question_progress
WHERE dataset_version = ${quote(classification.legacyVersion)} AND question_id = ${quote(item.legacyQuestionId)}
ON CONFLICT(dataset_version, question_id) DO NOTHING;`,
    };
  });
}
async function query(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "node_modules/wrangler/bin/wrangler.js"),
      "d1", "execute", "anki-progress", "--config", "worker/wrangler.jsonc", "--remote", "--json", "--command", sql],
      { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let output = "", errors = "";
    child.stdout.on("data", (part) => output += part);
    child.stderr.on("data", (part) => errors += part);
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(errors || output));
      try { const results = JSON.parse(output); assert.ok(results.every((result) => result.success)); resolve(results); }
      catch (error) { reject(error); }
    });
  });
}
export async function migrateSOProgress(decks, classification) {
  const migration = createSOProgressMigration(decks, classification);
  const snapshotSql = `SELECT * FROM question_progress WHERE dataset_version = ${quote(classification.legacyVersion)} OR dataset_version LIKE 'world-history-so-chapter-%' ORDER BY dataset_version, question_id`;
  const folder = path.join(root, ".wrangler", "so-progress", new Date().toISOString().replaceAll(/[:.]/g, "-"));
  await mkdir(folder, { recursive: true });
  const before = (await query(snapshotSql))[0].results;
  await writeFile(path.join(folder, "before.json"), JSON.stringify(before, null, 2));
  // 元の履歴を残し、新しい保存範囲に記録のない問題だけを複写する。
  const sql = migration.map((item) => item.sql).join("\n");
  await writeFile(path.join(folder, "migration.sql"), sql);
  // コマンドの長さを抑え、繰り返し実行しても既存の新デッキの記録を上書きしない。
  for (let i = 0; i < migration.length; i += 10) {
    await query(migration.slice(i, i + 10).map((item) => item.sql).join("\n"));
  }
  const after = (await query(snapshotSql))[0].results;
  await writeFile(path.join(folder, "after.json"), JSON.stringify(after, null, 2));
  let copied = 0;
  for (const item of migration) {
    const old = before.find((row) => row.dataset_version === classification.legacyVersion && row.question_id === item.questionId);
    if (!old) continue;
    const target = after.find((row) => row.dataset_version === item.version && row.question_id === item.questionId);
    assert.ok(target, "習熟度を新しいデッキで確認できません。");
    const existing = before.find((row) => row.dataset_version === item.version && row.question_id === item.questionId);
    if (!existing) assert.deepEqual(target, { ...old, dataset_version: item.version });
    copied++;
  }
  for (const row of before) {
    const retained = after.find((item) => item.dataset_version === row.dataset_version && item.question_id === row.question_id);
    assert.ok(retained, "元の学習履歴が見つかりません。");
    assert.ok(retained.updated_at >= row.updated_at, "既存の学習履歴が古い値へ戻っています。");
  }
  console.log(`習熟度の引継ぎを確認: ${copied}問。元の履歴と日別記録は保持。`);
}
