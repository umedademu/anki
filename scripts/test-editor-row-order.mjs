import assert from 'node:assert/strict';
import { loadEditableSubject, mutateEditableSubject } from '../worker/src/question-editor.js';
import { orderedEditorRows, moveEditorQuestion } from '../public/editor-row-order.js';
import { editorFixture } from './question-editor-fixture.mjs';
const { env, objects, dbCalls, bucket } = editorFixture();
const before = await loadEditableSubject(env,'test'), snapshot = new Map(objects);
const input = { subjectId:'test', revision:before.revision, action:'reorder', operationId:crypto.randomUUID(), questionId:'q3',targetQuestionId:'q1',placement:'before' };
const result = await mutateEditableSubject(env,input);
const after = await loadEditableSubject(env,'test');
assert.deepEqual(after.subject.editorQuestionOrder,['q3','q1','q2']);
assert.deepEqual(after.decks,before.decks,'本文・用語の共有・形式・所属・履歴版を保持');
for(const [key,value] of snapshot) if(key!=='index.json') assert.equal(objects.get(key),value);
assert.deepEqual(dbCalls,[],'学習履歴に書き込まない');
assert.deepEqual(JSON.parse(objects.get('index.json')).subjects[1],JSON.parse(snapshot.get('index.json')).subjects[1]);
assert.deepEqual(await mutateEditableSubject(env,input),result,'再送は重複操作しない');
await assert.rejects(mutateEditableSubject(env,{...input,operationId:crypto.randomUUID()}),e=>e.status===409);
for(const invalid of [{questionId:'missing'},{targetQuestionId:'missing'},{targetQuestionId:'q3'},{placement:'wrong'}]) {
  await assert.rejects(mutateEditableSubject(env,{...input,revision:after.revision,operationId:crypto.randomUUID(),...invalid}));
}
bucket.conflictOnCommit=true;
await assert.rejects(mutateEditableSubject(env,{...input,revision:after.revision,operationId:crypto.randomUUID()}),e=>e.status===409);
assert.deepEqual((await loadEditableSubject(env,'test')).subject.editorQuestionOrder,['q3','q1','q2']);
assert.deepEqual(moveEditorQuestion(['a','hidden','b'],'b','a','before'),['b','a','hidden']);
assert.deepEqual(orderedEditorRows(['a','b','new'].map(questionId=>({questionId})),['gone','b','a']).map(row=>row.questionId),['b','a','new']);
console.log('行順序：デッキをまたぐ保存・本文と履歴の維持・再送・競合・不正な行・絞り込み・追加と削除を確認しました。');
