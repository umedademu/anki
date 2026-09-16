import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import worker from "../worker/src/index.js";
import { loadEditableSubject, mutateEditableSubject } from "../worker/src/question-editor.js";
import { createVocabularySpeechGroups, createVocabularyAutomaticAnswerSequence } from "../public/speech.js";
import { createEmptyProgress, createQuestionQueue, rateQuestion } from "../public/learning-engine.js";
import { editorFixture } from "./question-editor-fixture.mjs";

const fixture = editorFixture(), { env, bucket, objects, dbCalls } = fixture;
const db = new DatabaseSync(":memory:");
const migration = await readFile(new URL("../worker/migrations/0002_dataset_scope.sql", import.meta.url), "utf8");
db.exec(migration.slice(0, migration.indexOf("INSERT INTO")).replace("question_progress_scoped", "question_progress"));
db.prepare("INSERT INTO question_progress (dataset_version, question_id, attempts, last_rating, updated_at) VALUES (?, ?, ?, ?, ?)").run("test-deck-1-v1", "q1", 4, "good", "2026-09-17T00:00:00.000Z");
env.DB = { prepare(sql) { return { bind(...args) { return { async run() { dbCalls.push({ sql, args }); db.prepare(sql).run(...args); return { success: true }; } }; } }; } };
const initial = await loadEditableSubject(env, "test");
const originalCatalog = JSON.parse(objects.get("index.json"));
const originalChunk = objects.get("subjects/test/deck-1/chunk.json");
const fields = { prompt: "変更した問題", answer: "変更した回答", explanation: "新しい解説", term: "試験用語", category: "試験分類", macroRegion: "アジア", regionDetail: "西アジア", stage: "beginner", acceptedAnswers: "別の回答\n別解", answerNote: "補足", yearMnemonic: "語呂" };
const operation = (revision, extra = {}) => ({ operationId: crypto.randomUUID(), subjectId: "test", action: "update", revision, deckId: "deck-1", targetDeckId: "deck-1", questionId: "q1", fields, ...extra });
const update = operation(initial.revision);
const saved = await mutateEditableSubject(env, update);
assert.equal(saved.questionId, "q1");
const edited = await loadEditableSubject(env, "test");
assert.equal(edited.decks[0].index.version, initial.decks[0].index.version);
assert.equal(edited.decks[0].terms[0].id, "term-1");
assert.equal(edited.decks[0].terms[0].stages.beginner.find((q) => q.id === "q1").answer, fields.answer);
assert.equal(objects.get("subjects/test/deck-1/chunk.json"), originalChunk);
assert.deepEqual(JSON.parse(objects.get("index.json")).subjects[1], originalCatalog.subjects[1]);
assert.deepEqual(await mutateEditableSubject(env, update), saved, "同じ通信の再送は二重適用しない");
await assert.rejects(mutateEditableSubject(env, operation(initial.revision)), (error) => error.status === 409);
const progress = createEmptyProgress(); rateQuestion(progress, "q1", "good", 2);
assert.ok(!createQuestionQueue(edited.decks[0].terms, progress, 2).some((task) => task.questionId === "q1"), "編集前の復習予定を引き継ぐ");
assert.equal(dbCalls.length, 0, "文章の修正で学習履歴へ書き込まない");

const beforeFailure = objects.get("index.json");
bucket.failPut = (key) => key.endsWith("chunk-1.json");
await assert.rejects(mutateEditableSubject(env, operation(edited.revision)), /保存失敗/);
assert.equal(objects.get("index.json"), beforeFailure);
bucket.failPut = null; bucket.conflictOnCommit = true;
await assert.rejects(mutateEditableSubject(env, operation(edited.revision)), (error) => error.status === 409);
assert.equal(objects.get("index.json"), beforeFailure);
bucket.conflictOnCommit = false;
for (const bad of [{ answer: " " }, { stage: "unknown" }, { prompt: "a".repeat(20001) }]) {
  await assert.rejects(mutateEditableSubject(env, operation(edited.revision, { fields: { ...fields, ...bad } })));
}
assert.equal(objects.get("index.json"), beforeFailure);

const moved = await mutateEditableSubject(env, operation(edited.revision, { targetDeckId: "deck-2" }));
const afterMove = await loadEditableSubject(env, "test");
assert.equal(afterMove.decks[0].terms[0].stages.beginner[0].id, "q2");
assert.equal(afterMove.decks[1].terms[1].stages.beginner[0].id, "q1");
assert.notEqual(afterMove.decks[1].terms[1].id, "term-1");
assert.equal(new Set(afterMove.decks.flatMap((d) => d.terms.map((t) => t.id))).size, 3);
assert.deepEqual(dbCalls[0].args, ["test-deck-2-v1", "test-deck-1-v1", "q1"]);
assert.ok(dbCalls[0].sql.includes("excluded.updated_at > question_progress.updated_at"));
const sourceRecord = db.prepare("SELECT * FROM question_progress WHERE dataset_version = ? AND question_id = ?").get("test-deck-1-v1", "q1");
const movedRecord = db.prepare("SELECT * FROM question_progress WHERE dataset_version = ? AND question_id = ?").get("test-deck-2-v1", "q1");
assert.deepEqual({ ...movedRecord }, { ...sourceRecord, dataset_version: "test-deck-2-v1" });
db.prepare("UPDATE question_progress SET attempts = 8, updated_at = ? WHERE dataset_version = ?").run("2026-09-18T00:00:00.000Z", "test-deck-2-v1");
db.prepare(dbCalls[0].sql).run(...dbCalls[0].args);
assert.equal(db.prepare("SELECT attempts FROM question_progress WHERE dataset_version = ?").get("test-deck-2-v1").attempts, 8, "移動先の新しい記録を上書きしない");

const deleted = await mutateEditableSubject(env, operation(moved.revision, { action: "delete", questionId: "q2" }));
const afterDelete = await loadEditableSubject(env, "test");
assert.equal(afterDelete.decks[0].terms.length, 0);
assert.equal(afterDelete.decks[0].index.questionCount, 0);
assert.deepEqual(afterDelete.decks[0].index.chunks, []);
await mutateEditableSubject(env, operation(deleted.revision, { action: "undo", undoId: deleted.undoId }));
let current = await loadEditableSubject(env, "test");
assert.equal(current.decks[0].terms[0].stages.beginner[0].id, "q2");
await assert.rejects(mutateEditableSubject(env, operation(current.revision, { action: "undo", undoId: deleted.undoId })), (error) => error.status === 409);
const newQuestion = operation(current.revision, { action: "create", questionId: undefined });
const added = await mutateEditableSubject(env, newQuestion);
assert.match(added.questionId, /^EDIT-/);
await mutateEditableSubject(env, newQuestion);
current = await loadEditableSubject(env, "test");
assert.equal(current.decks[0].index.questionCount, 2);
assert.equal(current.decks[0].terms[1].stages.beginner[0].id, added.questionId);
assert.equal(current.subject.questionCount, 4);
assert.equal(db.prepare("SELECT attempts FROM question_progress WHERE dataset_version = ?").get("test-deck-1-v1").attempts, 4, "削除・復元・追加でも元の履歴は残る");

for (const [stage, prompt, answer, questionGroup, answerGroup] of [
  ["beginner", "new word", "意味", "word", "meaning"],
  ["reverse", "新しい意味", "new word", "meaning", "word"],
  ["integrated", "New example.", "新しい訳", "example-english", "example-japanese"],
]) {
  const question = { stage, prompt, answer, editorModified: true };
  const term = { stages: { beginner: [], reverse: [], integrated: [] } };
  const groups = createVocabularySpeechGroups(term, question);
  assert.equal(groups[questionGroup].text, prompt); assert.equal(groups[answerGroup].text, answer);
  assert.equal(createVocabularyAutomaticAnswerSequence(term, stage, { question })[0].text, answer);
}
const request = (method, token = "editor-test-key", body) => new Request("https://example.test/v1/question-editor?subject=test", { method, headers: { Authorization: `Bearer ${token}`, Origin: env.ALLOWED_ORIGIN, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
assert.equal((await worker.fetch(request("GET", "bad"), env)).status, 401);
const response = await worker.fetch(request("GET"), env);
assert.equal(response.status, 200); assert.equal(response.headers.get("Access-Control-Allow-Origin"), env.ALLOWED_ORIGIN);
assert.equal((await worker.fetch(request("POST", "editor-test-key", operation("stale")), env)).status, 409);
assert.equal((await worker.fetch(request("DELETE"), env)).status, 405);
assert.equal((await worker.fetch(request("POST", "editor-test-key", { operationId: "bad" }), env)).status, 400);
console.log("問題編集：追加・修正・移動・削除・復元・履歴維持・同時保存・再送・保存失敗・認証・英語音声を確認しました。");
db.close();
