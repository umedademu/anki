import assert from "node:assert/strict";
import { loadWorldHistorySODecks } from "./build-learning-data.mjs";
import { loadSOQuestionTypes, applySOQuestionTypes } from "./world-history-so-question-types.mjs";
import { filterQuestionTypes, resolveQuestionTypes } from "../public/question-types.js";
import { isTimeQuestion } from "../public/time-questions.js";
import storageWorker from "./so-classification-storage-worker.js";

const assignments = await loadSOQuestionTypes();
const { terms, decks } = await loadWorldHistorySODecks();
const questions = terms.flatMap(term => Object.values(term.stages).flat());
assert.equal(questions.length, 357);
assert.equal(assignments.size, questions.length);
assert.equal(questions.filter(isTimeQuestion).length, 0);
assert.equal(questions.filter(question => question.questionMap && question.type === "place").length, 6);
assert.equal(questions.find(question => question.prompt.startsWith("1402年、")).type, "identify", "年号が手がかりの問題を時期にしない");
assert.equal(filterQuestionTypes(terms, ["person"]).length, 69);
assert.equal(filterQuestionTypes(terms, ["place", "cause"]).length, 55);
assert.equal(filterQuestionTypes(decks[0].terms, ["person"]).length, 5);
assert.equal(filterQuestionTypes(terms, ["time"]).length, 0);
const added = [{ stages: { beginner: [{ id: "new", type: "short_answer" }] } }];
assert.equal(filterQuestionTypes(added, resolveQuestionTypes(null, true, ["short_answer"])).length, 1, "編集画面で追加した未分類問題も選べる");
assert.equal(filterQuestionTypes(added, resolveQuestionTypes([], true, ["short_answer"])).length, 0, "明示的な全解除は維持する");
const unchanged = structuredClone(terms);
applySOQuestionTypes(terms, assignments);
assert.deepEqual(terms, unchanged, "再実行しても本文・回答・画像・識別番号は維持する");
const changed = structuredClone(terms);
changed[0].stages.beginner[0].prompt += "変更";
assert.throws(() => applySOQuestionTypes(changed, assignments), /問題文が変更/);
assert.throws(() => applySOQuestionTypes(terms, new Map()), /分類のない問題/);

// 保存窓口の認証、科目制限、索引の競合防止を実行して確認する。
const catalog = { subjects: [{ id: "world-history-so", decks: [] }, { id: "other", title: "維持" }] };
let current = structuredClone(catalog), etag = "before", conflictDuringPut = false, writes = 0;
const env = { ACCESS_TOKEN: "test-secret", BUCKET: {
  async get() { return { etag, json: async () => structuredClone(current) }; },
  async put(key, body, options) {
    if (options.onlyIf && (conflictDuringPut || options.onlyIf.etagMatches !== etag)) return null;
    current = JSON.parse(body); etag = "after"; writes++; return { etag };
  },
} };
const call = (body, authorization = "Bearer test-secret") => storageWorker.fetch(new Request("https://example.test", {
  method: "POST", headers: { Authorization: authorization, "Content-Type": "application/json" }, body: JSON.stringify(body),
}), env);
assert.equal((await call({ action: "read", key: "index.json" }, "wrong")).status, 401);
assert.equal((await call({ action: "read", key: "subjects/other/index.json" })).status, 403);
assert.equal((await call({ action: "put", key: "index.json", value: catalog })).status, 403);
assert.equal((await call({ action: "put", key: "index.json", value: catalog, expectedEtag: "stale" })).status, 409);
const modifiedOther = structuredClone(catalog); modifiedOther.subjects[1].title = "変更";
assert.equal((await call({ action: "put", key: "index.json", value: modifiedOther, expectedEtag: "before" })).status, 400);
conflictDuringPut = true;
assert.equal((await call({ action: "put", key: "index.json", value: catalog, expectedEtag: "before" })).status, 409);
assert.equal(writes, 0);
conflictDuringPut = false;
assert.equal((await call({ action: "put", key: "index.json", value: catalog, expectedEtag: "before" })).status, 200);
assert.equal(writes, 1);
console.log("世界史SO分類: 全357問・10種類・時期0問・地図6問・章との組合せ・本文維持・未知の問題の検知・認証と競合防止を確認");
