import assert from "node:assert/strict";
import { normalizeSubjectOrder, orderSubjects } from "../public/subject-order.js";
import { normalizeSetupPreferences as browser } from "../public/cloud-progress.js";
import { normalizeSetupPreferences as worker } from "../worker/src/index.js";
assert.deepEqual(normalizeSubjectOrder(['funda','original','funda',null,'<bad>',4]),['funda','original']);
const subjects = ['original','history','funda','new'].map(id=>({id}));
assert.deepEqual(orderSubjects(subjects,['funda','missing','original']).map(s=>s.id),['funda','original','history','new']);
for (const normalize of [browser,worker]) {
  assert.deepEqual(normalize().subjectOrder,[]);
  const preferences=normalize({subjectOrder:['funda','original','funda'], subjects:{funda:{lastDeckId:'deck-01',selectedDeckIds:['deck-01']}}});
  assert.deepEqual(preferences.subjectOrder,['funda','original']);
  assert.equal(preferences.subjects.funda.lastDeckId,'deck-01');
  assert.deepEqual(normalize(JSON.stringify(preferences)),preferences);
}
assert.deepEqual(browser({subjectOrder:['funda','original']}),worker({subjectOrder:['funda','original']}));
console.log('教科順序：重複・不正値・新規科目・削除済み科目・既存設定保持・保存側と画面側の一致を確認しました。');
