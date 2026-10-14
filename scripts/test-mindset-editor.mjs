import assert from "node:assert/strict";
import worker from "../worker/src/index.js";
import { loadEditableSubject, loadEditableQuestion, mutateEditableSubject } from "../worker/src/question-editor.js";
import { normalizeSetupPreferences, mindsetResumeStartIndex } from "../public/cloud-progress.js";
import { orderedEditorRows } from "../public/editor-row-order.js";
import { mindsetEditorFixture } from "./question-editor-fixture.mjs";

const { env, objects, bucket, dbCalls } = mindsetEditorFixture();
const initial = await loadEditableSubject(env, "mindset");
const catalogBefore = JSON.parse(objects.get("index.json"));
const chunkBefore = objects.get("subjects/mindset/deck-1/chunk.json");
const operation = (revision, extra = {}) => ({ subjectId: "mindset", operationId: crypto.randomUUID(), revision,
  action: "update", deckId: "deck-1", questionId: "MS-000001", fields: { content: "変更した言葉\n\n次の行＝続き", category: "心構え" }, ...extra });
const terms = (data) => data.decks.flatMap(deck => deck.terms);
const checkAudioOnly = (data) => {
  assert.equal(data.subject.questionCount, 0);
  assert.equal(data.subject.termCount, terms(data).length);
  for (const deck of data.decks) {
    assert.equal(deck.index.questionCount, 0);
    assert.equal(deck.index.termCount, deck.terms.length);
    assert.equal(deck.entry.version, initial.decks.find(d => d.entry.id === deck.entry.id).entry.version, "履歴の版番号は変えない");
    assert.deepEqual(deck.index.availableStages, []);
    assert.deepEqual(deck.index.questionCounts, { beginner: 0, reverse: 0, integrated: 0 });
    for (const term of deck.terms) {
      assert.equal(term.term, term.content);
      assert.deepEqual(term.stages, { beginner: [], reverse: [], integrated: [] }, "回答や評価のある問題を生成しない");
      assert.equal(term.answer, undefined);
    }
  }
  assert.equal(dbCalls.length, 0, "再生位置・メニューの達成数・回答履歴へ書き込まない");
};
const update = operation(initial.revision);
const saved = await mutateEditableSubject(env, update);
let data = await loadEditableSubject(env, "mindset");
assert.equal(saved.questionId, "MS-000001");
assert.equal(data.decks[0].terms[0].content, update.fields.content);
assert.equal(data.decks[0].terms[0].category, "心構え");
assert.deepEqual(data.decks[0].terms[0].source, initial.decks[0].terms[0].source);
assert.equal(objects.get("subjects/mindset/deck-1/chunk.json"), chunkBefore, "切り替え前の分割データは残す");
assert.deepEqual(JSON.parse(objects.get("index.json")).subjects.slice(0, 2), catalogBefore.subjects.slice(0, 2), "他科目には触れない");
assert.deepEqual(await mutateEditableSubject(env, update), saved, "同じ保存の再送は二重反映しない");
await assert.rejects(mutateEditableSubject(env, operation(initial.revision)), error => error.status === 409);
assert.deepEqual(await loadEditableQuestion(env, "mindset", "deck-1", "MS-000001"), { revision: data.revision, ...update.fields });
checkAudioOnly(data);

const beforeFailure = objects.get("index.json");
for (const fields of [{ content: " " }, { content: "a".repeat(20001) }, { content: "本文", category: "a".repeat(501) }, { content: 42 }, { prompt: "問題", answer: "回答" }]) {
  await assert.rejects(mutateEditableSubject(env, operation(data.revision, { fields })));
}
await assert.rejects(mutateEditableSubject(env, operation(data.revision, { action: "field", field: "answer", value: "回答" })));
await assert.rejects(mutateEditableSubject(env, operation(data.revision, { targetDeckId: "unknown" })));
assert.equal(objects.get("index.json"), beforeFailure);
bucket.failPut = key => key.endsWith("chunk-1.json");
await assert.rejects(mutateEditableSubject(env, operation(data.revision)), /保存失敗/);
bucket.failPut = null;
bucket.conflictOnCommit = true;
await assert.rejects(mutateEditableSubject(env, operation(data.revision)), error => error.status === 409);
bucket.conflictOnCommit = false;
assert.equal(objects.get("index.json"), beforeFailure, "保存失敗や競合で索引を切り替えない");

await mutateEditableSubject(env, operation(data.revision, { action: "field", field: "content", value: "個別の本文変更\n２行目" }));
data = await loadEditableSubject(env, "mindset");
assert.equal(data.decks[0].terms[0].term, "個別の本文変更\n２行目");
assert.equal(data.decks[0].terms[0].category, "心構え");
await mutateEditableSubject(env, operation(data.revision, { targetDeckId: "deck-2", fields: { content: "移動した言葉", category: "" } }));
data = await loadEditableSubject(env, "mindset");
assert.equal(data.decks[0].terms.length, 1);
assert.equal(data.decks[1].terms[1].id, "MS-000001", "移動でも再生位置に使用する番号を維持する");
assert.equal(data.decks[1].terms[1].datasetLabel, data.decks[1].index.datasetLabel);
checkAudioOnly(data);

const deleted = await mutateEditableSubject(env, operation(data.revision, { action: "delete", questionId: "MS-000002" }));
data = await loadEditableSubject(env, "mindset");
assert.equal(data.decks[0].terms.length, 0);
assert.deepEqual(data.decks[0].index.chunks, []);
checkAudioOnly(data);
await mutateEditableSubject(env, operation(data.revision, { action: "undo", undoId: deleted.undoId }));
data = await loadEditableSubject(env, "mindset");
assert.equal(data.decks[0].terms[0].id, "MS-000002");
await assert.rejects(mutateEditableSubject(env, operation(data.revision, { action: "undo", undoId: deleted.undoId })), error => error.status === 409);

const create = operation(data.revision, { action: "create", questionId: undefined, fields: { content: "新しい言葉" } });
const added = await mutateEditableSubject(env, create);
assert.match(added.questionId, /^MS-EDIT-[a-f0-9-]{36}$/);
await mutateEditableSubject(env, create);
data = await loadEditableSubject(env, "mindset");
assert.equal(terms(data).filter(t => t.id === added.questionId).length, 1);
const createdAt = terms(data).find(t => t.id === added.questionId).editorCreatedAt;
assert.ok(Number.isFinite(createdAt) && createdAt > 0);
assert.equal(normalizeSetupPreferences({ mindsetResume: { lastCompletedItemId: added.questionId } }).mindsetResume.lastCompletedItemId, added.questionId);
assert.equal(mindsetResumeStartIndex(data.decks[0].terms, "MS-000002"), 1);
assert.equal(mindsetResumeStartIndex(data.decks[0].terms, added.questionId), 0);
await mutateEditableSubject(env, operation(data.revision, { questionId: added.questionId, targetDeckId: "deck-2", fields: { content: "追加後の修正", category: "" } }));
data = await loadEditableSubject(env, "mindset");
assert.equal(terms(data).find(t => t.id === added.questionId).editorCreatedAt, createdAt);
const playbackOrder = terms(data).map(t => t.id);
await mutateEditableSubject(env, operation(data.revision, { action: "reorder", questionId: "MS-000002", targetQuestionId: added.questionId, placement: "before" }));
data = await loadEditableSubject(env, "mindset");
assert.deepEqual(terms(data).map(t => t.id), playbackOrder, "表の並べ替えは収録順を変えない");
const ordered = orderedEditorRows(terms(data).map(term => ({ questionId: term.id, question: term })), data.subject.editorQuestionOrder).map(row => row.questionId);
assert.equal(ordered.indexOf("MS-000002") + 1, ordered.indexOf(added.questionId));
checkAudioOnly(data);

const request = (method, token = "editor-test-key", body, query = "subject=mindset") => new Request(`https://example.test/v1/question-editor?${query}`,
  { method, headers: { Authorization: `Bearer ${token}`, Origin: env.ALLOWED_ORIGIN, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
assert.equal((await worker.fetch(request("GET", "bad"), env)).status, 401);
const response = await worker.fetch(request("GET"), env);
assert.equal(response.status, 200);
assert.equal((await response.json()).subject.learningType, "mindset");
assert.equal((await worker.fetch(request("POST", "editor-test-key", operation("stale")), env)).status, 409);
assert.equal((await worker.fetch(request("POST", "editor-test-key", operation(data.revision, { fields: { content: "" } })), env)).status, 400);
assert.equal((await worker.fetch(request("GET", "editor-test-key", undefined, "subject=mindset&deck=deck-2&question=MS-000001"), env)).status, 200);

const empty = mindsetEditorFixture([0]);
const emptyData = await loadEditableSubject(empty.env, "mindset");
await mutateEditableSubject(empty.env, operation(emptyData.revision, { action: "create", questionId: undefined, fields: { content: "空の集に追加" } }));
const filled = await loadEditableSubject(empty.env, "mindset");
assert.equal(filled.subject.termCount, 1);
assert.equal(filled.subject.questionCount, 0);
assert.equal(filled.decks[0].terms[0].content, "空の集に追加");
console.log("マインドセット編集：追加・本文と分類の修正・移動・削除・復元・並べ替え・履歴維持・競合・再送・認証を確認しました。");
