import assert from "node:assert/strict";
import { loadEnglishDeck6, buildEnglishDeck6, appendEnglishDeck6, checkEnglishDeck6Overlap, contentHash } from "./english-deck-6.mjs";
import { encodeJsonBindings } from "./japanese-history-k-bindings.js";
import { parseCsv, toEnglishObjects } from "./build-learning-data.mjs";
import { createEmptyProgress, createQuestionQueue, rateQuestion, getTermStage } from "../public/learning-engine.js";
import { createVocabularySpeechGroups } from "../public/speech.js";
import writer from "./english-deck-6-storage-worker.js";
import { editorFixture } from "./question-editor-fixture.mjs";

const plan = await loadEnglishDeck6(), rows = toEnglishObjects(parseCsv(plan.deck.sourceText));
assert.equal(plan.terms.length, 500); assert.equal(plan.objects.length, 11);
assert.equal(plan.entry.version, "english-vocabulary-deck-6-v1");
assert.equal(plan.entry.contentVersion, "193c9cf0d470");
assert.deepEqual(plan.index.questionCounts, { beginner: 500, reverse: 500, integrated: 500 });
assert.deepEqual(plan.objects.slice(0, 10).flatMap(object => object.value.terms), plan.terms);
for (const [position, term] of plan.terms.entries()) {
  const row = rows[position], beginner = term.stages.beginner[0], reverse = term.stages.reverse[0], integrated = term.stages.integrated[0];
  assert.equal(term.id, `EN-${String(position + 2501).padStart(6, "0")}`);
  assert.equal(beginner.prompt, row.word); assert.equal(beginner.answer, row.meaning);
  assert.deepEqual(beginner.acceptedAnswers, row.accepted_answers.split("|").filter(answer => answer !== row.meaning));
  assert.equal(reverse.prompt, row.meaning); assert.equal(reverse.answer, row.word); assert.equal(reverse.hideTermUntilAnswer, true);
  assert.equal(integrated.prompt, row.example_sentence); assert.equal(integrated.answer, row.example_translation);
  for (const [stage, question] of [["beginner", beginner], ["reverse", reverse], ["integrated", integrated]]) {
    const groups = createVocabularySpeechGroups(term, question);
    assert.equal(groups.word.text, row.word); assert.equal(groups.meaning.text, row.meaning.replace(/[~〜～]/g, "").trim());
    assert.equal(groups["example-english"].text, row.example_sentence); assert.equal(groups["example-japanese"].text, row.example_translation);
    assert.equal(question.speech.question[0].language, stage === "reverse" ? "ja-JP" : "en-US");
  }
  const progress = createEmptyProgress(); assert.equal(getTermStage(term, progress, 2), "beginner");
  rateQuestion(progress, beginner.id, "easy", 2); assert.equal(getTermStage(term, progress, 2), "reverse");
  rateQuestion(progress, reverse.id, "easy", 2); assert.equal(createQuestionQueue([term], progress, 2)[0].questionId, integrated.id);
}
assert.equal(plan.terms[0].term, "abide"); assert.equal(plan.terms.at(-1).term, "predominance");
for (const revise of [text => text.replace("EN-002501", "EN-002500"), text => text.replace("MARCH・国公立・難関大500語", "別の名前"), text => text.trimEnd().slice(0, text.trimEnd().lastIndexOf("\n"))]) {
  assert.throws(() => buildEnglishDeck6(revise(plan.deck.sourceText)));
}
const fixture = editorFixture(), { objects, bucket } = fixture;
const original = { schemaVersion: 3, version: "before", extraMetadata: "保持", subjects: [{ id: "other", title: "他科目", indexPath: "subjects/other/index.json" },
  { id: "english-vocabulary", title: "英単語", learningType: "vocabulary", defaultDeckId: "deck-1", indexPath: "subjects/english-vocabulary/deck-1/index.json",
    datasetLabel: "英単語段階別デッキ｜Deck 1〜5", termCount: 2500, questionCount: 7500, editorQuestionOrder: ["old-question"],
    decks: [1, 2, 3, 4, 5].map(number => ({ id: `deck-${number}`, number, version: `old-version-${number}`, indexPath: `subjects/english-vocabulary/deck-${number}/index.json`, termCount: 500, questionCount: 1500 })) }] };
objects.set("index.json", JSON.stringify(original));
const previousHashes = {};
for (const deck of original.subjects[1].decks) {
  const key = `subjects/english-vocabulary/${deck.id}/chunk.json`, index = { chunks: [{ path: key }], version: deck.version }, chunk = { terms: [{ id: `OLD-${deck.number}`, term: `old-word-${deck.number}`, stages: { beginner: [{ id: `old-question-${deck.number}` }], reverse: [], integrated: [] } }] };
  objects.set(deck.indexPath, JSON.stringify(index)); objects.set(key, JSON.stringify(chunk));
  previousHashes[deck.indexPath] = contentHash(index); previousHashes[key] = contentHash(chunk);
}
const next = appendEnglishDeck6(original, plan), subject = next.subjects[1];
assert.deepEqual(subject.decks.slice(0, 5), original.subjects[1].decks);
assert.deepEqual(next.subjects[0], original.subjects[0]); assert.equal(next.extraMetadata, "保持");
assert.equal(subject.termCount, 3000); assert.equal(subject.questionCount, 9000); assert.equal(subject.defaultDeckId, "deck-1");
assert.deepEqual(subject.editorQuestionOrder, ["old-question"]);
assert.deepEqual(appendEnglishDeck6(next, plan), next, "再登録では何も追加しない");
const edited = structuredClone(next); edited.subjects[1].decks[5].contentVersion = "edited";
assert.throws(() => appendEnglishDeck6(edited, plan), /上書き/);
checkEnglishDeck6Overlap([], plan);
for (const existing of [{ id: plan.terms[0].id, term: "old", stages: { beginner: [] } }, { id: "old", term: "ABIDE", stages: { beginner: [] } },
  { id: "old", term: "old", stages: { beginner: [{ id: plan.terms[0].stages.beginner[0].id }] } }]) assert.throws(() => checkEnglishDeck6Overlap([existing], plan), /重複/);
const env = { ACCESS_TOKEN: "test-only", BUCKET: bucket, PREVIOUS_SUBJECT_HASH: contentHash(original.subjects[1]),
  ...encodeJsonBindings("ADDITION_JSON", subject), ...encodeJsonBindings("OBJECT_HASHES", Object.fromEntries(plan.objects.map(object => [object.key, contentHash(object.value)]))),
  ...encodeJsonBindings("PREVIOUS_OBJECT_HASHES", previousHashes) };
const call = (input, settings = env, token = "test-only") => writer.fetch(new Request("https://example.invalid", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(input) }), settings);
const before = await bucket.get("index.json"), commit = { action: "commit", key: "index.json", value: next, expectedEtag: before.etag };
assert.equal((await call({ action: "read", key: "index.json" }, env, "bad")).status, 401);
assert.equal((await call({ action: "stage", key: original.subjects[1].decks[0].indexPath, value: {} })).status, 403);
assert.equal((await call({ action: "read", key: "speech-cache/audio.json" })).status, 403);
assert.equal((await call(commit)).status, 400, "全ての新規問題を照合する前には索引を切り替えない");
const invalid = { ...env }; delete invalid.OBJECT_HASHES_0;
assert.equal((await call({ action: "stage", ...plan.objects[0] }, invalid)).status, 500);
assert.equal((await call({ action: "stage", ...plan.objects[0], value: {} })).status, 400);
for (const object of plan.objects) assert.equal((await call({ action: "stage", ...object })).status, 200);
assert.equal((await call({ action: "stage", ...plan.objects[0] })).status, 200, "再送でも上書きせず同じ内容を確認する");
assert.equal((await call({ ...commit, expectedEtag: "stale" })).status, 409);
const otherChanged = structuredClone(next); otherChanged.subjects[0].title = "変更";
assert.equal((await call({ ...commit, value: otherChanged })).status, 400);
const oldKey = original.subjects[1].decks[0].indexPath, oldText = objects.get(oldKey);
objects.set(oldKey, JSON.stringify({ modified: true })); assert.equal((await call(commit)).status, 400, "確認後に既存問題が変わると中止する"); objects.set(oldKey, oldText);
bucket.conflictOnCommit = true; assert.equal((await call(commit)).status, 409); bucket.conflictOnCommit = false;
assert.equal(objects.get("index.json"), JSON.stringify(original));
assert.equal((await call(commit)).status, 200);
assert.deepEqual(JSON.parse(objects.get("index.json")), next);
assert.deepEqual(JSON.parse(objects.get(`subjects/english-vocabulary/imports/history/${before.etag}.json`)), original);
for (const [key, expected] of Object.entries(previousHashes)) assert.equal(contentHash(JSON.parse(objects.get(key))), expected);
assert.equal(fixture.dbCalls.length, 0);
console.log("英単語Deck 6：全500語・1500問の原稿照合、三方向と音声内容、重複・番号・既存科目と履歴版の保持、再登録・未照合・同時編集・認証・登録後の編集保護を確認しました。");
