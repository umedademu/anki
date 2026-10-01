import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadJapaneseHistoryK, buildJapaneseHistoryK, appendJapaneseKSubject, contentHash } from "./japanese-history-k.mjs";
import writer from "./japanese-history-k-storage-worker.js";
import { createEmptyProgress, createQuestionQueue, rateQuestion, shouldHideTerm } from "../public/learning-engine.js";
import { filterQuestionTypes, resolveQuestionTypes } from "../public/question-types.js";
import { createSessionDatasetVersion } from "../public/deck-selection.js";
import { usesChapterDecks, groupSODecks, soStudyLabel } from "../public/so-chapters.js";

const bank = JSON.parse(await readFile(new URL("../data/source/japanese-history-k/06-01-01.json", import.meta.url), "utf8"));
const excerpt = await readFile(new URL("../" + bank.source.file, import.meta.url), "utf8");
const plan = await loadJapaneseHistoryK();
assert.equal(plan.unitCount, 16);
assert.equal(plan.terms.length, 79);
assert.equal(plan.index.questionCount, 79);
assert.equal(plan.index.simpleQuestions, true);
assert.deepEqual(plan.index.availableStages, ["beginner"]);
assert.deepEqual(plan.index.chunks.map(chunk => chunk.count), [50, 29]);
assert.equal(new Set(plan.terms.map(term => term.id)).size, 79);
assert.deepEqual(plan.objects.flatMap(object => object.value.terms ?? []), plan.terms);
for (const term of plan.terms) {
  const question = term.stages.beginner[0];
  assert.equal(term.stages.beginner.length, 1);
  assert.ok(question.source.evidence.length && question.source.pages.length);
  assert.equal(shouldHideTerm(question, false), true);
  assert.equal(shouldHideTerm(question, true), false);
  assert.ok(question.explanation.includes("原文の根拠："));
}
// 引用ページ違い、出題根拠欠落、問題番号重複を検知する。
for (const alter of [
  value => value.facts[0].page = 416,
  value => value.units[0].questions[0].evidence = ["範囲外"],
  value => value.units[0].questions[1].id = value.units[0].questions[0].id,
]) {
  const changed = structuredClone(bank); alter(changed);
  assert.throws(() => buildJapaneseHistoryK(changed, excerpt));
}
const changed = structuredClone(bank);
changed.units[0].questions[0].answer += "（連合国軍総司令部）";
const revised = buildJapaneseHistoryK(changed, excerpt);
assert.notEqual(revised.index.contentVersion, plan.index.contentVersion);
assert.equal(revised.index.version, plan.index.version);
assert.deepEqual(revised.terms.map(term => term.id), plan.terms.map(term => term.id));
assert.equal(createQuestionQueue(plan.terms, createEmptyProgress(), 2).length, 79);
assert.equal(filterQuestionTypes(plan.terms, ["relation"]).length, bank.units.flatMap(unit => unit.questions).filter(question => question.type === "relation").length);
assert.equal(filterQuestionTypes(plan.terms, []).length, 0);
assert.ok(filterQuestionTypes(plan.terms, resolveQuestionTypes()).every(term => term.stages.beginner[0].type !== "time"));
const progress = createEmptyProgress();
rateQuestion(progress, plan.terms[0].id, "good", 2);
assert.equal(createQuestionQueue(plan.terms, progress, 2).length, 78);
assert.equal(usesChapterDecks(plan.subject), true);
assert.equal(usesChapterDecks({ id: "world-history-so" }), true);
assert.equal(usesChapterDecks({ id: "japanese-history" }), false);
assert.equal(groupSODecks(plan.subject.decks, plan.subject.chapterGroups)[0].title, "第6章 現代");
assert.equal(soStudyLabel(plan.subject.decks, plan.subject.chapterGroups), "第6章 現代");
const versions = new Map(plan.subject.decks.map(deck => [deck.id, deck.version]));
const sessionVersion = createSessionDatasetVersion(plan.subject.id, [plan.subject.defaultDeckId], versions);
assert.ok(sessionVersion.length <= 100);
assert.notEqual(sessionVersion, createSessionDatasetVersion("japanese-history", ["deck-1"], new Map([["deck-1", "japanese-history-v1"]])));

const catalog = { schemaVersion: 3, version: "existing-v1", subjects: [{ id: "japanese-history", questionCount: 7, decks: [{ id: "deck-1", version: "existing" }] }], termImages: { path: "term-images.json" } };
const next = appendJapaneseKSubject(catalog, plan.subject);
assert.deepEqual(next.subjects.slice(0, -1), catalog.subjects);
assert.deepEqual(next.termImages, catalog.termImages);
assert.throws(() => appendJapaneseKSubject(next, plan.subject));

class MemoryBucket {
  objects = new Map(); serial = 0;
  async get(key) {
    const object = this.objects.get(key);
    return object ? { etag: object.etag, text: async () => object.text, json: async () => JSON.parse(object.text) } : null;
  }
  async put(key, text, options = {}) {
    const existing = this.objects.get(key), condition = options.onlyIf ?? {};
    if (condition.etagMatches && existing?.etag !== condition.etagMatches || condition.etagDoesNotMatch === "*" && existing) return null;
    const etag = `etag-${++this.serial}`;
    this.objects.set(key, { text, etag }); return { etag };
  }
}
const bucket = new MemoryBucket();
const env = { BUCKET: bucket, ACCESS_TOKEN: "test-only", ADDITION_JSON: JSON.stringify(plan.subject), OBJECT_HASHES: JSON.stringify(Object.fromEntries(plan.objects.map(object => [object.key, contentHash(object.value)]))) };
const call = (input, authorization = "Bearer test-only") => writer.fetch(new Request("https://example.invalid", { method: "POST", headers: { Authorization: authorization, "Content-Type": "application/json" }, body: JSON.stringify(input) }), env);
const original = await bucket.put("index.json", JSON.stringify(catalog));
assert.equal((await call({ action: "read", key: "index.json" }, "Bearer invalid")).status, 401);
assert.equal((await call({ action: "stage", key: "subjects/japanese-history/chunks/0001.json", value: {} })).status, 403);
assert.equal((await call({ action: "stage", ...plan.objects[0], value: {} })).status, 400);
assert.equal((await call({ action: "commit", key: "index.json", value: next, expectedEtag: original.etag })).status, 400);
for (const object of plan.objects) {
  assert.equal((await call({ action: "stage", ...object })).status, 200);
  assert.equal((await call({ action: "stage", ...object })).status, 200);
}
const tampered = structuredClone(next); tampered.subjects[0].questionCount = 100;
assert.equal((await call({ action: "commit", key: "index.json", value: tampered, expectedEtag: original.etag })).status, 400);
assert.equal((await call({ action: "commit", key: "index.json", value: next, expectedEtag: "old-etag" })).status, 409);
assert.equal((await call({ action: "commit", key: "index.json", value: next, expectedEtag: original.etag })).status, 200);
assert.deepEqual(await (await bucket.get("index.json")).json(), next);
assert.deepEqual(await (await bucket.get(`subjects/japanese-history-k/imports/history/${original.etag}.json`)).json(), catalog);
assert.equal((await call({ action: "commit", key: "index.json", value: next, expectedEtag: original.etag })).status, 409);
await bucket.put(plan.objects[0].key, JSON.stringify({ edited: true }));
assert.equal((await call({ action: "stage", ...plan.objects[0] })).status, 409);
console.log("日本史K：16学習項目・79問の原文根拠、出題・評価、章選択、履歴の分離、他科目を保持する条件付き保存を確認しました。");
