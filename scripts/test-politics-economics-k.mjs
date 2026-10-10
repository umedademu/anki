import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadPoliticsEconomicsK, appendPoliticsKDecks, contentHash, validatePoliticsKBank, buildPoliticsEconomicsK, politicsKExcerptPath } from "./politics-economics-k.mjs";
import { encodeJsonBindings } from "./japanese-history-k-bindings.js";
import writer from "./politics-economics-k-storage-worker.js";
import { buildPoliticsKImages } from "./politics-economics-k-images.mjs";
import { createEmptyProgress, createQuestionQueue, getTermStage, rateQuestion } from "../public/learning-engine.js";

const plans = await loadPoliticsEconomicsK();
assert.deepEqual(plans.map(plan => plan.index.deckId), ["pek-01-01"]);
const [plan] = plans;
assert.equal(plan.index.datasetLabel, "政治経済K｜1-1 民主政治と国家・主権");
assert.deepEqual(plan.index.availableStages, ["reverse"], "逆向きの説明だけを出題します。");
assert.deepEqual(plan.index.questionCounts, { beginner: 0, reverse: 26, integrated: 0 });
assert.equal(plan.unitCount, 19);
assert.deepEqual(plan.definition.chapterGroups, [{ id: "item-01", number: 1, title: "1 民主政治の思想と原理", label: "項目1", deckIds: ["pek-01-01"] }]);
for (const term of plan.terms) {
  assert.deepEqual(term.stages.beginner, []); assert.deepEqual(term.stages.integrated, []);
  for (const question of term.stages.reverse) {
    assert.ok(question.id.startsWith(`${term.id}-R`));
    assert.equal(question.type, "reverse");
    assert.equal(question.hideTermUntilAnswer, false);
    assert.match(question.explanation, /原文の根拠：\d+頁「/);
  }
  // 基礎・統合のない用語も、逆向きの説明から始まり全問の習得で完了する。
  const progress = createEmptyProgress();
  assert.equal(getTermStage(term, progress, 2), "reverse");
  assert.ok(createQuestionQueue([term], progress, 2).every(task => task.stage === "reverse"));
  for (const question of term.stages.reverse) rateQuestion(progress, question.id, "easy", 2);
  assert.equal(getTermStage(term, progress, 2), "complete");
}

// 原稿の検査：小見出しの範囲外の引用、逆向き以外の問題、使っていない根拠、強調と重要語の不一致を拒否する。
const bank = JSON.parse(await readFile("data/source/politics-economics-k/01-01.json", "utf8"));
const excerpt = await readFile(politicsKExcerptPath(bank), "utf8");
validatePoliticsKBank(bank, excerpt);
const outside = structuredClone(bank);
outside.facts.push({ id: "next-heading", page: 10, quote: "自然法は人間である以上当然守るべき、根源的なルールである。" });
outside.units[0].questions[0].evidence.push("next-heading");
assert.throws(() => validatePoliticsKBank(outside, excerpt), /範囲に引用がありません/, "同じ頁でも次の小見出しの記述は根拠にしません。");
const beginner = structuredClone(bank); beginner.units[0].questions[0].stage = "beginner";
assert.throws(() => validatePoliticsKBank(beginner, excerpt), /逆向きの説明以外/);
const unused = structuredClone(bank); unused.facts.push({ id: "unused", page: 9, quote: "国家の三要素" });
assert.throws(() => validatePoliticsKBank(unused, excerpt), /使っていない根拠/);
const keyword = structuredClone(bank); keyword.units[0].questions[0].keywords = ["人民"];
assert.throws(() => validatePoliticsKBank(keyword, excerpt), /重要語と強調が一致しません/);
const dependent = structuredClone(bank); dependent.units[0].questions[0].prompt = "上記の「民主政治」とは、どのような政治か。";
assert.throws(() => validatePoliticsKBank(dependent, excerpt), /元資料や別の問題に依存/);
const missingTerm = structuredClone(bank); missingTerm.units[1].questions[0].prompt = "社会の秩序を形成する作用とは何か。";
assert.throws(() => validatePoliticsKBank(missingTerm, excerpt), /対象の用語がありません/);
const pages = structuredClone(bank); pages.source.pages = [8, 9, 10];
assert.throws(() => validatePoliticsKBank(pages, excerpt), /頁が原文の範囲と一致しません/);

// 初回は科目を新設し、他科目と科目一覧の順を維持する。再送は何も変えない。
const original = { schemaVersion: 3, version: "before", subjects: [{ id: "world-history", title: "世界史", decks: [] }] };
const next = appendPoliticsKDecks(original, plans);
assert.deepEqual(next.subjects[0], original.subjects[0]);
const subject = next.subjects[1];
assert.equal(subject.id, "politics-economics-k");
assert.equal(subject.title, "政治経済K");
assert.equal(subject.defaultDeckId, "pek-01-01");
assert.equal(subject.questionCount, 26); assert.equal(subject.termCount, 19);
assert.deepEqual(subject.chapterGroups, plan.definition.chapterGroups);
assert.notEqual(next.version, original.version);
assert.deepEqual(appendPoliticsKDecks(next, plans), next, "同じ追加を繰り返しても索引版を変えません。");
const edited = structuredClone(next); edited.subjects[1].decks[0].contentVersion = "edited-after-publication";
assert.throws(() => appendPoliticsKDecks(edited, plans), /上書きしません/, "公開後に編集したパートを上書きしません。");
assert.throws(() => appendPoliticsKDecks(original, [plan, plan]), /重複/);
// 次の小見出しは同じ項目のデッキへ番号順に加わる。
const laterBank = structuredClone(bank); laterBank.heading = { number: 2, title: "試験用の小見出し" };
const later = buildPoliticsEconomicsK(laterBank, excerpt);
const grown = appendPoliticsKDecks(next, [later]);
assert.deepEqual(grown.subjects[1].chapterGroups, [{ ...plan.definition.chapterGroups[0], deckIds: ["pek-01-01", "pek-01-02"] }]);
assert.equal(grown.subjects[1].questionCount, 52);
assert.deepEqual(grown.subjects[1].decks[0], next.subjects[1].decks[0]);

// 保存窓口：初回は未登録の科目への追加だけを受け付け、照合前の切替や他科目の変更を拒否する。
class MemoryBucket {
  objects = new Map(); serial = 0;
  async get(key) { const entry = this.objects.get(key); return entry ? { etag: entry.etag, text: async () => entry.text, json: async () => JSON.parse(entry.text) } : null; }
  async put(key, text, options = {}) {
    const entry = this.objects.get(key), condition = options.onlyIf ?? {};
    if (condition.etagMatches && entry?.etag !== condition.etagMatches || condition.etagDoesNotMatch === "*" && entry) return null;
    const etag = `etag-${++this.serial}`; this.objects.set(key, { etag, text }); return { etag };
  }
}
const bucket = new MemoryBucket(), before = await bucket.put("index.json", JSON.stringify(original));
const env = { BUCKET: bucket, ACCESS_TOKEN: "test-only", PRESERVE_EXISTING_DECKS: "false", PREVIOUS_SUBJECT_HASH: "",
  ...encodeJsonBindings("ADDITION_JSON", subject),
  ...encodeJsonBindings("OBJECT_HASHES", Object.fromEntries(plan.objects.map(object => [object.key, contentHash(object.value)]))),
  ...encodeJsonBindings("PREVIOUS_OBJECT_HASHES", {}) };
const call = input => writer.fetch(new Request("https://example.invalid", { method: "POST", headers: { Authorization: "Bearer test-only", "Content-Type": "application/json" }, body: JSON.stringify(input) }), env);
const commit = { action: "commit", key: "index.json", value: next, expectedEtag: before.etag };
assert.equal((await call(commit)).status, 400, "全新規問題を照合する前には切替できません。");
assert.equal((await call({ action: "stage", key: "subjects/japanese-history-k/x.json", value: {} })).status, 403, "他科目の保存先には書き込みません。");
for (const object of plan.objects) assert.equal((await call({ action: "stage", ...object })).status, 200);
assert.equal((await call({ ...commit, expectedEtag: "stale" })).status, 409);
const otherChanged = structuredClone(next); otherChanged.subjects[0].title = "変更";
assert.equal((await call({ ...commit, value: otherChanged })).status, 400, "他科目の変更を含む切替を拒否します。");
assert.equal((await call(commit)).status, 200);
assert.deepEqual(await (await bucket.get("index.json")).json(), next);
for (const object of plan.objects) assert.deepEqual(await (await bucket.get(object.key)).json(), object.value);
assert.equal((await call({ ...commit, expectedEtag: (await bucket.get("index.json")).etag })).status, 409, "登録済みの科目を初回として二重登録しません。");

// 関連画像：点検済みの割り当てだけを追加し、既存の画像一覧を保持する。
const selection = JSON.parse(await readFile("data/source/politics-economics-k/image-assignments.json", "utf8"));
const images = { schemaVersion: 2, assets: [{ id: "OLD", path: "term-images/old.webp" }], assignments: [{ questionId: "OLD-Q", assetId: "OLD" }], termFallbacks: [] };
const snapshot = { catalog: next, images, decks: [{ entry: subject.decks[0], index: plan.index, chunks: plan.objects.filter(object => object.key.includes("/chunks/")).map(object => object.value) }] };
const result = buildPoliticsKImages(snapshot, selection);
assert.equal(result.addedAssignments.length, 13);
assert.equal(new Set(result.audit.map(entry => entry.path)).size, 7);
assert.deepEqual(result.manifest.assets.slice(0, 1), images.assets);
assert.deepEqual(result.manifest.assignments.slice(0, 1), images.assignments);
for (const entry of result.audit) assert.ok(plan.terms.some(term => term.stages.reverse.some(question => question.id === entry.questionId)));
for (const source of selection.sources) {
  const bytes = await readFile(source.sourceFile);
  assert.ok(bytes.length > 1000 && bytes.length < 500000 && bytes[0] === 255 && bytes[1] === 216, `JPEG・500KB未満の画像です: ${source.id}`);
}
console.log(`政治経済K：${plans.length}パート・${plan.unitCount}用語・${plan.index.questionCount}問（逆向きの説明のみ）の原文照合、科目の新設・再送・上書き防止、保存窓口の照合、関連画像${result.addedAssignments.length}問・${selection.sources.length}枚の割り当てを確認しました。`);
