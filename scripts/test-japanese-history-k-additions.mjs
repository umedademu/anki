import assert from "node:assert/strict";
import { loadJapaneseHistoryK, loadJapaneseKAdditions, appendJapaneseKDecks, contentHash } from "./japanese-history-k.mjs";
import { encodeJsonBindings, readJsonBinding } from "./japanese-history-k-bindings.js";
import writer from "./japanese-history-k-storage-worker.js";
import { createEmptyProgress, createQuestionQueue, getTermStage, rateQuestion } from "../public/learning-engine.js";
import { createSessionDatasetVersion } from "../public/deck-selection.js";
import { filterQuestionTypes, resolveQuestionTypes } from "../public/question-types.js";

const checkedBindings = (name, value) => {
  const bindings = encodeJsonBindings(name, value), parts = Number(bindings[`${name}_PARTS`]);
  assert.ok(Number.isInteger(parts) && parts >= 1 && parts <= 60);
  assert.equal(Object.hasOwn(bindings, name), false, "大きな単一変数として登録しません。");
  assert.equal(Object.keys(bindings).length, parts + 1);
  for (let number = 0; number < parts; number++) {
    const part = bindings[`${name}_${number}`];
    assert.equal(typeof part, "string");
    assert.ok(Buffer.byteLength(part, "utf8") <= 4000, `${name}_${number}は4000バイト以内です。`);
    assert.ok(part.isWellFormed(), `${name}_${number}の日本語・絵文字を途中で壊しません。`);
  }
  assert.deepEqual(readJsonBinding(bindings, name), value);
  return bindings;
};
const unicodeValue = { text: "日本語🌏🙂𠮷".repeat(1000), nested: { escaped: "改行\n引用\"と\\線" } };
const unicodeBindings = checkedBindings("UNICODE", unicodeValue);
assert.ok(Number(unicodeBindings.UNICODE_PARTS) > 1, "日本語と絵文字が複数の変数にまたがる状態を検査します。");
for (let number = 0; number < Number(unicodeBindings.UNICODE_PARTS); number++) {
  const missing = { ...unicodeBindings }; delete missing[`UNICODE_${number}`];
  assert.throws(() => readJsonBinding(missing, "UNICODE"), undefined, "分割設定の欠落を拒否します。");
  assert.throws(() => readJsonBinding(missing, "UNICODE", "{}"), undefined, "一部欠落した設定を初期値で代用しません。");
}
const missingPartCount = { ...unicodeBindings }; delete missingPartCount.UNICODE_PARTS;
assert.throws(() => readJsonBinding(missingPartCount, "UNICODE"), undefined, "部分だけが残る設定の分割数欠落を拒否します。");
assert.throws(() => readJsonBinding(missingPartCount, "UNICODE", "{}"), undefined, "分割数が欠落しても初期値で代用しません。");
for (const parts of ["0", "61", "-1", "1.5", "abc"]) {
  assert.throws(() => readJsonBinding({ UNICODE_PARTS: parts, UNICODE_0: "{}" }, "UNICODE"), undefined, "不正な分割数を拒否します。");
}
assert.throws(() => encodeJsonBindings("TOO_LARGE", "日".repeat(80000)), undefined, "60部分を超える設定を拒否します。");
assert.deepEqual(readJsonBinding({ LEGACY: JSON.stringify(unicodeValue) }, "LEGACY"), unicodeValue, "従来の単一変数も読み込めます。");
assert.deepEqual(readJsonBinding({}, "OPTIONAL", "{}"), {});
assert.throws(() => readJsonBinding({}, "REQUIRED"), undefined, "必須設定の欠落を拒否します。");

const first = await loadJapaneseHistoryK(), additions = await loadJapaneseKAdditions();
assert.equal(additions.length, 26);
assert.deepEqual(additions.map(plan => plan.index.deckId), ["book-05-01-01", "book-05-01-02", "book-05-01-03", "book-05-01-04", "book-05-01-05", "book-05-01-06", "book-05-02-01", "book-05-02-02", "book-05-02-03", "book-05-02-04", "book-05-02-05", "book-05-02-06", "book-06-01-02", "book-06-01-03", "book-06-01-04", "book-06-01-05", "book-06-01-06", "book-06-02-01", "book-06-02-02", "book-06-02-03", "book-06-02-04", "book-06-02-05", "book-06-02-06", "book-06-02-07", "book-06-02-08", "book-06-02-09"]);
const earlier = additions.filter(plan => !plan.index.deckId.startsWith("book-05-02-")), pending = additions.filter(plan => plan.index.deckId.startsWith("book-05-02-"));
assert.equal(earlier.length, 20); assert.equal(pending.length, 6);
const original = appendJapaneseKDecks({ schemaVersion: 3, version: "before", subjects: [{ id: "other", decks: [{ id: "other-deck", version: "keep" }] }, first.subject], termImages: { path: "unchanged" } }, earlier);
const next = appendJapaneseKDecks(original, additions), subject = next.subjects[1];
assert.ok(Buffer.byteLength(JSON.stringify(subject), "utf8") > 5 * 1024, "今回の科目情報は単一変数の5KB制限を超えます。");
const subjectBindings = checkedBindings("ADDITION_JSON", subject);
assert.ok(Number(subjectBindings.ADDITION_JSON_PARTS) > 1);
assert.deepEqual(next.subjects[0], original.subjects[0]);
assert.deepEqual(next.termImages, original.termImages);
assert.deepEqual(subject.decks.find(deck => deck.id === first.index.deckId), first.subject.decks[0]);
for (const deck of original.subjects[1].decks) assert.deepEqual(subject.decks.find(entry => entry.id === deck.id), deck, "追加前の21小項目と履歴版を保持します。");
assert.equal(subject.defaultDeckId, first.subject.defaultDeckId);
assert.equal(subject.indexPath, first.subject.indexPath);
assert.equal(subject.questionCount, first.index.questionCount + additions.reduce((sum, plan) => sum + plan.index.questionCount, 0));
assert.equal(subject.termCount, first.unitCount + additions.reduce((sum, plan) => sum + plan.unitCount, 0));
assert.deepEqual(subject.chapterGroups.find(group => group.id === "chapter-6"), original.subjects[1].chapterGroups.find(group => group.id === "chapter-6"), "完成済みの第6章の情報を保持します。");
assert.deepEqual(subject.chapterGroups.find(group => group.id === "chapter-5"), { ...original.subjects[1].chapterGroups.find(group => group.id === "chapter-5"), deckIds: additions.filter(plan => plan.index.deckId.startsWith("book-05-")).map(plan => plan.index.deckId) });
assert.deepEqual(pending.map(plan => plan.index.deckNumber), [50101, 50102, 50103, 50104, 50105, 50106], "明治時代の小項目が第1節に続く番号で並びます。");
assert.deepEqual(subject.chapterGroups.flatMap(group => group.deckIds).sort(), subject.decks.map(deck => deck.id).sort(), "全小項目がそれぞれの章に一度ずつ所属します。");
assert.equal(new Set(subject.decks.map(deck => deck.number)).size, subject.decks.length, "別章の小項目番号も衝突しません。");
for (const plan of pending) for (const term of plan.terms) for (const question of Object.values(term.stages).flat()) {
  assert.ok(question.id.startsWith("JHK-05-02-"));
  assert.equal(question.source.file, "sources/kokushi/5_近代.md");
  assert.ok(question.source.name.startsWith("第5章 近代／"));
  assert.equal(term.geography.macroRegion, "第5章 近代");
  assert.equal(term.geography.regionDetail, "明治時代");
}
assert.deepEqual(appendJapaneseKDecks(next, additions), next, "同じ追加を繰り返しても問題・索引版を増やしません。");
assert.throws(() => appendJapaneseKDecks(original, [additions[0], additions[0]]));
const edited = structuredClone(next); edited.subjects[1].decks[1].contentVersion = "edited-after-publication";
assert.throws(() => appendJapaneseKDecks(edited, additions), undefined, "追加済み問題の編集を上書きしません。");
const editedGHQ = structuredClone(original), oldGHQ = editedGHQ.subjects[1].decks.find(deck => deck.id === first.index.deckId); oldGHQ.contentVersion = "user-edit";
assert.deepEqual(appendJapaneseKDecks(editedGHQ, additions).subjects[1].decks.find(deck => deck.id === first.index.deckId), oldGHQ);
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
    for (const [index, question] of term.stages.beginner.entries()) {
      rateQuestion(progress, question.id, "easy", 2);
      assert.equal(getTermStage(term, progress, 2), index === term.stages.beginner.length - 1 ? "reverse" : "beginner", "全基礎問題を習得してから逆向きへ進みます。");
    }
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
const env = { BUCKET: bucket, ACCESS_TOKEN: "test-only", PRESERVE_EXISTING_DECKS: "true", PREVIOUS_SUBJECT_HASH: contentHash(original.subjects[1]), ...subjectBindings,
  ...checkedBindings("OBJECT_HASHES", Object.fromEntries(objects.map(object => [object.key, contentHash(object.value)]))),
  ...checkedBindings("PREVIOUS_OBJECT_HASHES", Object.fromEntries(previousObjects.map(object => [object.key, contentHash(object.value)]))) };
const call = (input, settings = env) => writer.fetch(new Request("https://example.invalid", { method: "POST", headers: { Authorization: "Bearer test-only", "Content-Type": "application/json" }, body: JSON.stringify(input) }), settings);
const untouchedObjects = structuredClone([...bucket.objects]), untouchedSerial = bucket.serial;
const commit = { action: "commit", key: "index.json", value: next, expectedEtag: before.etag };
const assertSettingsRejected = async (settings, reason) => {
  for (const input of [{ action: "stage", ...objects[0] }, commit]) {
    assert.equal((await call(input, settings)).status, 500, `${reason}は登録・切替の前に拒否します。`);
    assert.deepEqual([...bucket.objects], untouchedObjects, "拒否した設定で保存内容を変更しません。");
    assert.equal(bucket.serial, untouchedSerial, "拒否した設定で一度も書き込みません。");
  }
};
for (const name of ["ADDITION_JSON", "OBJECT_HASHES", "PREVIOUS_OBJECT_HASHES"]) {
  const missing = { ...env }; delete missing[`${name}_0`];
  await assertSettingsRejected(missing, `${name}の一部欠落`);
  const missingCount = { ...env }; delete missingCount[`${name}_PARTS`];
  await assertSettingsRejected(missingCount, `${name}の分割数欠落`);
  for (const value of [null, [], "設定"]) {
    await assertSettingsRejected({ ...env, ...checkedBindings(name, value) }, `${name}の不正な形`);
  }
}
for (const name of ["OBJECT_HASHES", "PREVIOUS_OBJECT_HASHES"]) {
  const hashes = readJsonBinding(env, name), key = Object.keys(hashes)[0];
  for (const value of ["a".repeat(63), "g".repeat(64), "A".repeat(64), null, 0]) {
    await assertSettingsRejected({ ...env, ...checkedBindings(name, { ...hashes, [key]: value }) }, `${name}の不正な照合値`);
  }
}
await assertSettingsRejected({ ...env, ...checkedBindings("ADDITION_JSON", { ...subject, id: "world-history-so" }) }, "他科目の登録設定");
for (const field of ["decks", "chapterGroups"]) {
  const missing = structuredClone(subject); delete missing[field];
  await assertSettingsRejected({ ...env, ...checkedBindings("ADDITION_JSON", missing) }, `${field}の欠落`);
  await assertSettingsRejected({ ...env, ...checkedBindings("ADDITION_JSON", { ...subject, [field]: {} }) }, `${field}が配列でない設定`);
}
assert.equal((await call(commit)).status, 400, "全新規問題を照合する前には切替できません。");
for (const object of previousObjects) assert.equal((await call({ action: "stage", ...object })).status, 403, "既存21小項目は参照のみです。");
for (const object of objects) assert.equal((await call({ action: "stage", ...object })).status, 200);
assert.equal((await call({ ...commit, expectedEtag: "stale" })).status, 409);
for (const change of [value => value.decks[0].version = "lost-history", value => value.defaultDeckId = value.decks[1].id, value => value.chapterGroups[0].deckIds.shift()]) {
  const bad = structuredClone(subject); change(bad);
  const badCatalog = structuredClone(next); badCatalog.subjects[1] = bad; badCatalog.version = contentHash(badCatalog.subjects).slice(0, 20);
  assert.equal((await call({ ...commit, value: badCatalog }, { ...env, ...checkedBindings("ADDITION_JSON", bad) })).status, 400);
}
await bucket.put(first.objects[0].key, JSON.stringify({ changed: true }));
assert.equal((await call(commit)).status, 400, "確認後に既存問題が変わった場合は切替を中止します。");
await bucket.put(first.objects[0].key, JSON.stringify(first.objects[0].value) + "\n");
assert.equal((await call(commit)).status, 200);
assert.deepEqual(await (await bucket.get("index.json")).json(), next);
for (const object of previousObjects) assert.deepEqual(await (await bucket.get(object.key)).json(), object.value);
assert.deepEqual(await (await bucket.get(`subjects/japanese-history-k/imports/history/${before.etag}.json`)).json(), original);
console.log(`日本史K追加：原稿${additions.length}小項目の検査、第5章「明治時代」の${pending.length}小項目・${pending.reduce((sum, plan) => sum + plan.index.questionCount, 0)}問の追加と章別表示情報、全項目の段階移行、既存21小項目と履歴版の保持、再送・同時編集・上書き防止、4000バイト以内の設定分割・復元・欠落拒否を確認しました。`);
