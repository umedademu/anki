import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadJapaneseHistoryK, buildJapaneseHistoryK, appendJapaneseKSubject, replaceJapaneseKSubject, contentHash } from "./japanese-history-k.mjs";
import writer from "./japanese-history-k-storage-worker.js";
import { createEmptyProgress, createQuestionQueue, createTermQuestionQueue, rateQuestion, shouldHideTerm, getTermStage } from "../public/learning-engine.js";
import { filterQuestionTypes, resolveQuestionTypes } from "../public/question-types.js";
import { createSessionDatasetVersion } from "../public/deck-selection.js";
import { usesChapterDecks, groupSODecks, soStudyLabel } from "../public/so-chapters.js";

const bank = JSON.parse(await readFile(new URL("../data/source/japanese-history-k/06-01-01.json", import.meta.url), "utf8"));
const excerpt = await readFile(new URL("../" + bank.source.file, import.meta.url), "utf8");
const plan = await loadJapaneseHistoryK();
const stages = ["beginner", "reverse", "integrated"];
const counts = Object.fromEntries(stages.map(stage => [stage, bank.units.reduce((sum, unit) => sum + unit.questions.filter(question => question.stage === stage).length, 0)]));
const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
const plain = text => String(text).replace(/\*\*/g, "");
const withoutReadings = text => String(text).replace(/[（(][ぁ-ゖー・\s]+[）)]/g, "");
const boldKeywords = text => [...String(text).matchAll(/\*\*([^*]+)\*\*/g)].map(match => match[1].replace(/[（(][ぁ-ゖー・\s]+[）)]/g, ""));
assert.equal(plan.unitCount, bank.units.length);
assert.equal(plan.terms.length, bank.units.length);
assert.equal(plan.index.questionCount, total);
assert.equal(plan.index.learningType, "history");
assert.ok(!plan.index.simpleQuestions);
assert.deepEqual(plan.index.availableStages, stages);
assert.deepEqual(plan.index.questionCounts, counts);
assert.equal(plan.index.chunks.reduce((sum, chunk) => sum + chunk.count, 0), bank.units.length);
assert.equal(new Set(plan.terms.map(term => term.id)).size, bank.units.length);
assert.equal(plan.index.version, "japanese-history-k-book-06-01-01-v3");
assert.deepEqual(plan.objects.flatMap(object => object.value.terms ?? []), plan.terms);
for (const [index, term] of plan.terms.entries()) {
  const unit = bank.units[index];
  assert.match(term.id, /^JHK3-06-01-01-U\d{2}$/);
  assert.ok(term.stages.beginner.length >= 3 && term.stages.beginner.length <= 7);
  assert.ok(term.stages.reverse.length >= 1 && term.stages.reverse.length <= 4);
  assert.equal(term.stages.integrated.length, 1);
  assert.deepEqual(term.chronology, unit.chronology);
  const learnedEvidence = new Set(unit.questions.filter(question => question.stage !== "integrated").flatMap(question => question.evidence));
  const learnedAnswers = unit.questions.filter(question => question.stage !== "integrated").map(question => withoutReadings(plain(question.answer)).normalize("NFKC")).join("\n");
  for (const question of Object.values(term.stages).flat()) {
    const authored = unit.questions.find(item => question.id.endsWith("-" + item.id));
    assert.ok(question.source.evidence.length && question.source.pages.length);
    assert.deepEqual(question.source.evidence, authored.evidence.map(id => bank.facts.find(fact => fact.id === id)), "元の引用は表示用に整形せず保存します。");
    assert.equal(shouldHideTerm(question, false), question.stage === "beginner");
    assert.equal(shouldHideTerm(question, true), false);
    assert.ok(question.explanation.includes("原文の根拠："));
    assert.doesNotMatch(question.explanation, /<br\s*\/?>|\|/i, "解説に改行指定や表の区切り記号を露出しません。");
    if (authored.note) assert.ok(question.explanation.startsWith(authored.note));
    else if (question.stage !== "integrated") assert.ok(!question.explanation.startsWith(unit.explanation), "基礎や逆向きで単元全体の説明を先に表示しません。");
    assert.doesNotMatch(question.prompt, /原文|本文|本書|この章|前述|上記/);
    assert.deepEqual(question.keywords, authored.keywords);
    if (question.stage !== "beginner") assert.ok(question.keywords.length);
    assert.deepEqual([...new Set(question.keywords)], [...new Set(boldKeywords(question.answer))]);
    if (question.stage === "beginner" && question.type !== "identify") assert.ok(question.prompt.includes(unit.term));
    if (question.stage === "integrated") {
      assert.equal(question.prompt, `日本の占領期の「${unit.term}」について説明せよ。`);
      assert.match(plain(question.answer), /[0-9０-９]{4}[^。]*年/);
      assert.ok(question.answer.includes("日本"));
      assert.ok(authored.evidence.every(evidence => learnedEvidence.has(evidence)));
      assert.ok(question.keywords.every(keyword => learnedAnswers.includes(keyword.normalize("NFKC"))));
      const periods = plain(question.answer).match(/\d{3,4}(?:[〜～~－-]\d{3,4})?年|\d{1,2}世紀/g) ?? [];
      assert.ok(periods.every(period => learnedAnswers.includes(period)), "統合の時期も基礎・逆向きの回答で学習済みにします。");
    }
  }
}
// 原文の裏付け、独立した問題文、説明段階の構成を崩した原稿は拒否する。
const nonIdentify = value => value.units.flatMap(unit => unit.questions.map(question => ({ unit, question }))).find(({ question }) => question.stage === "beginner" && question.type !== "identify");
const integrated = value => value.units[0].questions.find(question => question.stage === "integrated");
const explained = value => value.units[0].questions.find(question => question.stage === "reverse");
for (const [caseIndex, alter] of [
  value => value.facts[0].page = value.source.pages.find(page => page !== value.facts[0].page),
  value => value.units[0].questions[0].evidence = ["範囲外"],
  value => value.units[0].questions[1].id = value.units[0].questions[0].id,
  value => value.units[0].questions = value.units[0].questions.filter(question => question.stage !== "reverse"),
  value => value.units[0].questions = value.units[0].questions.filter(question => question.stage !== "beginner" || question.id === "B01"),
  value => value.units[0].questions[0].prompt = "原文では何と説明されているか。",
  value => { const { unit, question } = nonIdentify(value); question.prompt = question.prompt.replaceAll(unit.term, "この政策"); },
  value => { const unit = value.units[0], question = unit.questions.find(item => item.stage === "reverse"); while (unit.questions.filter(item => item.stage === "reverse").length < 5) unit.questions.push({ ...structuredClone(question), id: `R${String(unit.questions.filter(item => item.stage === "reverse").length + 1).padStart(2, "0")}`, prompt: question.prompt + "追加" + unit.questions.length }); },
  value => {
    const target = value.units.find(unit => { const learned = new Set(unit.questions.filter(question => question.stage !== "integrated").flatMap(question => question.evidence)); return value.facts.some(fact => !learned.has(fact.id)); });
    assert.ok(target, "統合だけに新しい根拠を追加する試験項目が必要です。");
    const learned = new Set(target.questions.filter(question => question.stage !== "integrated").flatMap(question => question.evidence));
    target.questions.find(question => question.stage === "integrated").evidence.push(value.facts.find(fact => !learned.has(fact.id)).id);
  },
  value => integrated(value).prompt = `日本の占領期の「${value.units[0].term}」について、時期・内容・結果を説明せよ。`,
  value => integrated(value).answer = integrated(value).answer.replace(/[0-9０-９]{4}/g, "当時"),
  value => { const question = integrated(value); assert.ok(question.answer.includes("1945年")); question.answer = question.answer.replaceAll("1945年", "1948年"); },
  value => integrated(value).answer = integrated(value).answer.replaceAll("日本", "この国"),
  value => { const question = explained(value); question.answer = question.answer.replaceAll("**", ""); question.keywords = []; },
  value => explained(value).keywords = [],
  value => value.units[0].questions[0].keywords = ["原文にも回答にもない語"],
  value => { const question = integrated(value); question.answer += " **基礎や逆向きで学んでいない語**。"; question.keywords.push("基礎や逆向きで学んでいない語"); },
].entries()) {
  const changed = structuredClone(bank); alter(changed);
  assert.throws(() => buildJapaneseHistoryK(changed, excerpt), undefined, `不適切な原稿の拒否検査 ${caseIndex + 1}`);
}
const changed = structuredClone(bank);
changed.source.note += " 原稿の補足を変更した場合も内容の版を更新する。";
const revised = buildJapaneseHistoryK(changed, excerpt);
assert.notEqual(revised.index.contentVersion, plan.index.contentVersion);
assert.equal(revised.index.version, plan.index.version);
assert.deepEqual(revised.terms.map(term => term.id), plan.terms.map(term => term.id));
assert.equal(createQuestionQueue(plan.terms, createEmptyProgress(), 2).length, counts.beginner);
assert.equal(createTermQuestionQueue(plan.terms, createEmptyProgress(), 2).length, bank.units.length);
assert.equal(filterQuestionTypes(plan.terms, ["relation"]).flatMap(term => Object.values(term.stages).flat()).length, bank.units.flatMap(unit => unit.questions).filter(question => question.type === "relation").length);
assert.equal(filterQuestionTypes(plan.terms, []).length, 0);
assert.ok(filterQuestionTypes(plan.terms, resolveQuestionTypes()).every(term => term.stages.beginner.every(question => question.type !== "time")));
const progress = createEmptyProgress();
const first = plan.terms[0], initialQueue = createQuestionQueue(plan.terms, progress, 2);
assert.ok(initialQueue.every(task => task.stage === "beginner"));
rateQuestion(progress, first.stages.beginner[0].id, "good", 2);
assert.equal(createQuestionQueue(plan.terms, progress, 2).length, counts.beginner - 1);
assert.equal(getTermStage(first, progress, 2), "beginner");
rateQuestion(progress, first.stages.beginner[0].id, "good", 2);
for (const question of first.stages.beginner.slice(1)) rateQuestion(progress, question.id, "easy", 2);
assert.equal(getTermStage(first, progress, 2), "reverse");
assert.ok(createQuestionQueue(plan.terms, progress, 2).some(task => task.questionId === first.stages.reverse[0].id));
assert.ok(!createQuestionQueue(plan.terms, progress, 2).some(task => task.questionId === first.stages.integrated[0].id));
assert.ok(createQuestionQueue(plan.terms, progress, 2).filter(task => task.termId !== first.id).every(task => task.stage === "beginner"));
assert.ok(first.stages.reverse.length > 1, "先頭項目で複数の説明問題による移行条件を検証します。");
for (const [index, question] of first.stages.reverse.entries()) {
  rateQuestion(progress, question.id, "easy", 2);
  if (index < first.stages.reverse.length - 1) {
    assert.equal(getTermStage(first, progress, 2), "reverse");
    assert.ok(!createQuestionQueue(plan.terms, progress, 2).some(task => task.questionId === first.stages.integrated[0].id));
  }
}
assert.equal(getTermStage(first, progress, 2), "integrated");
assert.ok(createQuestionQueue(plan.terms, progress, 2).some(task => task.questionId === first.stages.integrated[0].id));
rateQuestion(progress, first.stages.integrated[0].id, "easy", 2);
assert.equal(getTermStage(first, progress, 2), "complete");
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
const oldSubject = { id: plan.subject.id, title: "日本史K", questionCount: 79, indexPath: "subjects/japanese-history-k/old/index.json", decks: [{ id: "book-06-01-01", version: "japanese-history-k-book-06-01-01-v1" }] };
const beforeReplacement = { ...catalog, subjects: [oldSubject, ...catalog.subjects] };
const replaced = replaceJapaneseKSubject(beforeReplacement, plan.subject, contentHash(oldSubject));
assert.deepEqual(replaced.subjects.slice(1), catalog.subjects);
assert.equal(replaced.subjects[0].questionCount, total);
assert.throws(() => replaceJapaneseKSubject(beforeReplacement, plan.subject, "another-version"));

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
// 置換では旧内容と他科目を保持し、未照合・同時編集・旧データ変更を拒否する。
const replacementBucket = new MemoryBucket();
const oldObject = { key: oldSubject.indexPath, value: { version: "old", questionCount: 79 } };
await replacementBucket.put(oldObject.key, JSON.stringify(oldObject.value));
const replacementOriginal = await replacementBucket.put("index.json", JSON.stringify(beforeReplacement));
const replacementEnv = { ...env, BUCKET: replacementBucket, PREVIOUS_SUBJECT_HASH: contentHash(oldSubject), PREVIOUS_OBJECT_HASHES: JSON.stringify({ [oldObject.key]: contentHash(oldObject.value) }) };
const replacementCall = input => writer.fetch(new Request("https://example.invalid", { method: "POST", headers: { Authorization: "Bearer test-only", "Content-Type": "application/json" }, body: JSON.stringify(input) }), replacementEnv);
for (const object of plan.objects) assert.equal((await replacementCall({ action: "stage", ...object })).status, 200);
assert.equal((await replacementCall({ action: "stage", ...oldObject })).status, 403);
assert.equal((await replacementCall({ action: "commit", key: "index.json", value: replaced, expectedEtag: "stale" })).status, 409);
await replacementBucket.put(oldObject.key, JSON.stringify({ edited: true }));
assert.equal((await replacementCall({ action: "commit", key: "index.json", value: replaced, expectedEtag: replacementOriginal.etag })).status, 400);
await replacementBucket.put(oldObject.key, JSON.stringify(oldObject.value));
assert.equal((await replacementCall({ action: "commit", key: "index.json", value: replaced, expectedEtag: replacementOriginal.etag })).status, 200);
assert.deepEqual(await (await replacementBucket.get(oldObject.key)).json(), oldObject.value);
assert.deepEqual(await (await replacementBucket.get("index.json")).json(), replaced);
console.log(`日本史K：${bank.units.length}項目・${total}問、原文根拠、単独で理解できる問題文、太字と重要語、統合前の学習範囲、全説明問題の習得後の移行、旧データを保持する条件付き置換を確認しました。`);
