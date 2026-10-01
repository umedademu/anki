import assert from "node:assert/strict";
import { loadJapaneseHistoryK, loadJapaneseKAdditions, appendJapaneseKDecks, contentHash } from "./japanese-history-k.mjs";
import writer from "./japanese-history-k-storage-worker.js";
import { createEmptyProgress, createQuestionQueue, getTermStage, rateQuestion } from "../public/learning-engine.js";
import { createSessionDatasetVersion } from "../public/deck-selection.js";
import { filterQuestionTypes, resolveQuestionTypes } from "../public/question-types.js";

const first = await loadJapaneseHistoryK(), additions = await loadJapaneseKAdditions();
assert.equal(additions.length, 9);
assert.deepEqual(additions.map(plan => plan.index.deckId), ["book-06-01-02", "book-06-01-03", "book-06-01-04", "book-06-01-05", "book-06-01-06", "book-06-02-01", "book-06-02-02", "book-06-02-03", "book-06-02-04"]);
const earlier = additions.slice(0, 3), pending = additions.slice(3);
const original = appendJapaneseKDecks({ schemaVersion: 3, version: "before", subjects: [{ id: "other", decks: [{ id: "other-deck", version: "keep" }] }, first.subject], termImages: { path: "unchanged" } }, earlier);
const next = appendJapaneseKDecks(original, additions), subject = next.subjects[1];
assert.deepEqual(next.subjects[0], original.subjects[0]);
assert.deepEqual(next.termImages, original.termImages);
assert.deepEqual(subject.decks[0], first.subject.decks[0]);
for (const deck of original.subjects[1].decks) assert.deepEqual(subject.decks.find(entry => entry.id === deck.id), deck, "追加前の４小項目と履歴版を保持します。");
assert.equal(subject.defaultDeckId, first.subject.defaultDeckId);
assert.equal(subject.indexPath, first.subject.indexPath);
assert.equal(subject.questionCount, first.index.questionCount + additions.reduce((sum, plan) => sum + plan.index.questionCount, 0));
assert.equal(subject.termCount, first.unitCount + additions.reduce((sum, plan) => sum + plan.unitCount, 0));
assert.deepEqual(subject.chapterGroups[0].deckIds, subject.decks.map(deck => deck.id));
assert.deepEqual(appendJapaneseKDecks(next, additions), next, "同じ追加を繰り返しても問題・索引版を増やしません。");
assert.throws(() => appendJapaneseKDecks(original, [additions[0], additions[0]]));
const edited = structuredClone(next); edited.subjects[1].decks[1].contentVersion = "edited-after-publication";
assert.throws(() => appendJapaneseKDecks(edited, additions), undefined, "追加済み問題の編集を上書きしません。");
const editedGHQ = structuredClone(original); editedGHQ.subjects[1].decks[0].contentVersion = "user-edit";
assert.deepEqual(appendJapaneseKDecks(editedGHQ, additions).subjects[1].decks[0], editedGHQ.subjects[1].decks[0]);
const allTerms = [first, ...additions].flatMap(plan => plan.terms);
assert.equal(new Set(allTerms.map(term => term.id)).size, allTerms.length);
const questions = allTerms.flatMap(term => Object.values(term.stages).flat());
assert.equal(new Set(questions.map(question => question.id)).size, questions.length);
const versions = new Map(subject.decks.map(deck => [deck.id, deck.version]));
assert.equal(new Set(subject.decks.map(deck => deck.version)).size, subject.decks.length);
assert.notEqual(createSessionDatasetVersion(subject.id, [subject.decks[0].id], versions), createSessionDatasetVersion(subject.id, subject.decks.map(deck => deck.id), versions));
for (const plan of additions) {
  assert.equal(plan.index.version, `japanese-history-k-${plan.index.deckId}-v1`);
  assert.equal(plan.index.availableStages.length, 3);
  // 年号だけの問いを除く初期設定でも、各項目が統合まで進めることを確認する。
  for (const term of plan.terms.flatMap(value => [value, ...filterQuestionTypes([value], resolveQuestionTypes())])) {
    const progress = createEmptyProgress();
    assert.equal(getTermStage(term, progress, 2), "beginner");
    assert.ok(createQuestionQueue([term], progress, 2).every(task => task.stage === "beginner"));
    for (const question of term.stages.beginner) rateQuestion(progress, question.id, "easy", 2);
    assert.equal(getTermStage(term, progress, 2), "reverse");
    for (const [index, question] of term.stages.reverse.entries()) {
      rateQuestion(progress, question.id, "easy", 2);
      assert.equal(getTermStage(term, progress, 2), index === term.stages.reverse.length - 1 ? "integrated" : "reverse");
    }
    assert.equal(createQuestionQueue([term], progress, 2)[0].questionId, term.stages.integrated[0].id);
  }
}

class MemoryBucket {
  objects = new Map(); serial = 0;
  async get(key) { const entry = this.objects.get(key); return entry ? { etag: entry.etag, text: async () => entry.text, json: async () => JSON.parse(entry.text) } : null; }
  async put(key, text, options = {}) {
    const entry = this.objects.get(key), condition = options.onlyIf ?? {};
    if (condition.etagMatches && entry?.etag !== condition.etagMatches || condition.etagDoesNotMatch === "*" && entry) return null;
    const etag = `etag-${++this.serial}`; this.objects.set(key, { etag, text }); return { etag };
  }
}
const bucket = new MemoryBucket(), objects = pending.flatMap(plan => plan.objects);
const previousObjects = [first, ...earlier].flatMap(plan => plan.objects);
for (const object of previousObjects) await bucket.put(object.key, JSON.stringify(object.value) + "\n");
const before = await bucket.put("index.json", JSON.stringify(original));
const env = { BUCKET: bucket, ACCESS_TOKEN: "test-only", PRESERVE_EXISTING_DECKS: "true", PREVIOUS_SUBJECT_HASH: contentHash(original.subjects[1]), ADDITION_JSON: JSON.stringify(subject),
  OBJECT_HASHES: JSON.stringify(Object.fromEntries(objects.map(object => [object.key, contentHash(object.value)]))),
  PREVIOUS_OBJECT_HASHES: JSON.stringify(Object.fromEntries(previousObjects.map(object => [object.key, contentHash(object.value)]))) };
const call = (input, settings = env) => writer.fetch(new Request("https://example.invalid", { method: "POST", headers: { Authorization: "Bearer test-only", "Content-Type": "application/json" }, body: JSON.stringify(input) }), settings);
const commit = { action: "commit", key: "index.json", value: next, expectedEtag: before.etag };
assert.equal((await call(commit)).status, 400, "全新規問題を照合する前には切替できません。");
assert.equal((await call({ action: "stage", ...first.objects[0] })).status, 403, "既存GHQは参照のみです。");
for (const object of objects) assert.equal((await call({ action: "stage", ...object })).status, 200);
assert.equal((await call({ ...commit, expectedEtag: "stale" })).status, 409);
for (const change of [value => value.decks[0].version = "lost-history", value => value.defaultDeckId = value.decks[1].id, value => value.chapterGroups[0].deckIds.shift()]) {
  const bad = structuredClone(subject); change(bad);
  const badCatalog = structuredClone(next); badCatalog.subjects[1] = bad; badCatalog.version = contentHash(badCatalog.subjects).slice(0, 20);
  assert.equal((await call({ ...commit, value: badCatalog }, { ...env, ADDITION_JSON: JSON.stringify(bad) })).status, 400);
}
await bucket.put(first.objects[0].key, JSON.stringify({ changed: true }));
assert.equal((await call(commit)).status, 400, "確認後に既存問題が変わった場合は切替を中止します。");
await bucket.put(first.objects[0].key, JSON.stringify(first.objects[0].value) + "\n");
assert.equal((await call(commit)).status, 200);
assert.deepEqual(await (await bucket.get("index.json")).json(), next);
for (const object of previousObjects) assert.deepEqual(await (await bucket.get(object.key)).json(), object.value);
assert.deepEqual(await (await bucket.get(`subjects/japanese-history-k/imports/history/${before.etag}.json`)).json(), original);
console.log(`日本史K追加：原稿${additions.length}小項目の検査、今回の${pending.length}小項目・${pending.reduce((sum, plan) => sum + plan.index.questionCount, 0)}問の追加、全項目の段階移行、既存４小項目と履歴版の保持、再送・同時編集・上書き防止を確認しました。`);
