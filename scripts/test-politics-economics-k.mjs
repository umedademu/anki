import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { loadPoliticsEconomicsK, appendPoliticsKDecks, replacePoliticsKSubject, contentHash, validatePoliticsKBank, buildPoliticsEconomicsK, politicsKExcerptPath } from "./politics-economics-k.mjs";
import { encodeJsonBindings } from "./japanese-history-k-bindings.js";
import { imageWriterVars } from "./japanese-history-k-images-config.mjs";
import writer from "./politics-economics-k-storage-worker.js";
import imageWriter from "./politics-economics-k-images-storage-worker.js";
import { buildPoliticsKImages, isPoliticsKAssignment } from "./politics-economics-k-images.mjs";
import { createEmptyProgress, createQuestionQueue, getTermStage, rateQuestion } from "../public/learning-engine.js";

const plans = await loadPoliticsEconomicsK();
// 公開済みの全パート（項目ごとに追記する）。
const expected = [
  ["pek-01-01", "政治経済K｜1-1 民主政治と国家・主権", 21, 23, 2],
  ["pek-01-02", "政治経済K｜1-2 自然法と自然権", 4, 6, 1],
  ["pek-01-03", "政治経済K｜1-3 社会契約説", 15, 19, 1],
  ["pek-01-04", "政治経済K｜1-4 法の支配と権力分立", 9, 10, 1],
  ["pek-02-01", "政治経済K｜2-1 人権獲得の歴史", 24, 29, 1],
  ["pek-02-02", "政治経済K｜2-2 人権の国際化", 8, 9, 1],
  ["pek-02-03", "政治経済K｜2-3 代表的な人権条約", 12, 13, 1],
  ["pek-03-01", "政治経済K｜3-1 大日本帝国憲法", 9, 11, 1],
  ["pek-03-02", "政治経済K｜3-2 日本国憲法の成立", 8, 8, 1],
  ["pek-03-03", "政治経済K｜3-3 日本国憲法", 5, 8, 1],
  ["pek-03-04", "政治経済K｜3-4 憲法改正の議論", 7, 7, 1],
  ["pek-03-05", "政治経済K｜3-5 各国の政治制度", 11, 11, 1],
  ["pek-03-06", "政治経済K｜3-6 その他の主要国", 4, 6, 1],
  ["pek-04-01", "政治経済K｜4-1 裁判と判例", 36, 38, 1],
  ["pek-04-02", "政治経済K｜4-2 新しい人権", 11, 11, 1],
  ["pek-04-03", "政治経済K｜4-3 外国人や少数民族の扱い・その他", 17, 18, 1],
];
assert.deepEqual(plans.map(plan => plan.index.deckId), expected.map(([deckId]) => deckId));
for (const [index, [deckId, label, units, questions, revision]] of expected.entries()) {
  const value = plans[index];
  assert.equal(value.index.datasetLabel, label);
  assert.deepEqual(value.index.availableStages, ["reverse"], "逆向きの説明だけを出題します。");
  assert.deepEqual(value.index.questionCounts, { beginner: 0, reverse: questions, integrated: 0 });
  assert.equal(value.unitCount, units);
  assert.equal(value.index.version, `politics-economics-k-${deckId}-v${revision}`, "作り直した版だけ学習履歴を分けます。");
  assert.equal(value.definition.chapterGroups[0].id, `item-${deckId.slice(4, 6)}`);
  assert.deepEqual(value.definition.chapterGroups[0].deckIds, [deckId]);
}
const [plan] = plans, allPlanObjects = plans.flatMap(value => value.objects);
const totalQuestions = expected.reduce((sum, value) => sum + value[3], 0), totalUnits = expected.reduce((sum, value) => sum + value[2], 0);
const allTerms = plans.flatMap(value => value.terms);
assert.equal(new Set(allTerms.map(term => term.id)).size, allTerms.length);
assert.equal(new Set(allTerms.flatMap(term => term.stages.reverse).map(question => question.prompt)).size, totalQuestions, "パートをまたいでも問題文は重複しません。");
// 講義の口調を答えに持ち込まない。
for (const question of allTerms.flatMap(term => term.stages.reverse)) {
  assert.doesNotMatch(question.answer, /だよ|なんだ|のさ|大変なことになる|100％|しょせん|ってわけ|じゃなくて|僕/, `講義口調の答えです: ${question.id}`);
  // 問題文は「排他的経済水域とはどんな水域？」のような普通の疑問文にし、「用語」：…？ の形や「〜か。」の形にしない。
  assert.match(question.prompt, /？$/, `問題文は普通の疑問文にします: ${question.id}`);
  assert.doesNotMatch(question.prompt, /^「[^」]+」：/, `「用語」：…？ の形は使いません: ${question.id}`);
}
for (const term of allTerms) {
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
assert.equal(subject.questionCount, totalQuestions); assert.equal(subject.termCount, totalUnits);
// 項目ごとに一つのデッキにまとまり、パートは番号順に並ぶ。
assert.deepEqual(subject.chapterGroups.map(group => group.id), [...new Set(expected.map(([deckId]) => `item-${deckId.slice(4, 6)}`))]);
assert.deepEqual(subject.chapterGroups.flatMap(group => group.deckIds), expected.map(([deckId]) => deckId));
assert.deepEqual(subject.chapterGroups[0], { ...plan.definition.chapterGroups[0], deckIds: expected.filter(([deckId]) => deckId.startsWith("pek-01-")).map(([deckId]) => deckId) });
assert.deepEqual(subject.decks.map(deck => deck.number), expected.map(([deckId]) => Number(deckId.slice(4, 6)) * 100 + Number(deckId.slice(7))));
assert.notEqual(next.version, original.version);
assert.deepEqual(appendPoliticsKDecks(next, plans), next, "同じ追加を繰り返しても索引版を変えません。");
const edited = structuredClone(next); edited.subjects[1].decks[0].contentVersion = "edited-after-publication";
assert.throws(() => appendPoliticsKDecks(edited, plans), /上書きしません/, "公開後に編集したパートを上書きしません。");
assert.throws(() => appendPoliticsKDecks(original, [plan, plan]), /重複/);
// 次の小見出しは同じ項目のデッキへ番号順に加わる。
const laterBank = structuredClone(bank); laterBank.heading = { number: 9, title: "試験用の小見出し" };
const later = buildPoliticsEconomicsK(laterBank, excerpt);
const grown = appendPoliticsKDecks(next, [later]);
assert.deepEqual(grown.subjects[1].chapterGroups[0], { ...plan.definition.chapterGroups[0], deckIds: [...expected.filter(([deckId]) => deckId.startsWith("pek-01-")).map(([deckId]) => deckId), "pek-01-09"] });
assert.equal(grown.subjects[1].questionCount, totalQuestions + 23);
assert.deepEqual(grown.subjects[1].decks[0], next.subjects[1].decks[0]);
// 作り直し：確認時の科目と一致する場合だけ、手元の原稿全体で科目を置き換え、他科目と並び順を維持する。
const revised = structuredClone(bank); revised.revision = 3; revised.units[0].questions[0].answer = "多くの人が集まる社会で、**権力**や**政策**を用いて秩序を形成する作用。";
revised.units[0].questions[0].keywords = ["権力", "政策"];
const revisedPlan = buildPoliticsEconomicsK(revised, excerpt);
assert.equal(revisedPlan.index.version, "politics-economics-k-pek-01-01-v3");
const replaced = replacePoliticsKSubject(grown, [revisedPlan], contentHash(grown.subjects[1]));
assert.deepEqual(replaced.subjects.map(entry => entry.id), grown.subjects.map(entry => entry.id));
assert.deepEqual(replaced.subjects[0], grown.subjects[0]);
assert.deepEqual(replaced.subjects[1].decks.map(deck => deck.id), ["pek-01-01"], "置き換え後は手元の原稿にあるパートだけになります。");
assert.equal(replaced.subjects[1].decks[0].version, "politics-economics-k-pek-01-01-v3");
assert.notEqual(replaced.version, grown.version);
assert.throws(() => replacePoliticsKSubject(grown, [revisedPlan], "stale"), /確認後に編集/);
assert.throws(() => replacePoliticsKSubject(original, [revisedPlan], "x"), /1科目だけ/);

// 保存窓口：初回は未登録の科目への追加だけを受け付け、照合前の切替や他科目の変更を拒否する。
class MemoryBucket {
  objects = new Map(); serial = 0;
  async head(key) { const entry = this.objects.get(key); return entry ? { etag: entry.etag } : null; }
  async get(key) { const entry = this.objects.get(key); return entry ? { etag: entry.etag, text: async () => entry.text, json: async () => JSON.parse(entry.text), arrayBuffer: async () => new TextEncoder().encode(entry.text).buffer } : null; }
  async put(key, text, options = {}) {
    const entry = this.objects.get(key), condition = options.onlyIf ?? {};
    if (condition.etagMatches && entry?.etag !== condition.etagMatches || condition.etagDoesNotMatch === "*" && entry) return null;
    const etag = `etag-${++this.serial}`; this.objects.set(key, { etag, text }); return { etag };
  }
}
const bucket = new MemoryBucket(), before = await bucket.put("index.json", JSON.stringify(original));
const env = { BUCKET: bucket, ACCESS_TOKEN: "test-only", PRESERVE_EXISTING_DECKS: "false", PREVIOUS_SUBJECT_HASH: "",
  ...encodeJsonBindings("ADDITION_JSON", subject),
  ...encodeJsonBindings("OBJECT_HASHES", Object.fromEntries(allPlanObjects.map(object => [object.key, contentHash(object.value)]))),
  ...encodeJsonBindings("PREVIOUS_OBJECT_HASHES", {}) };
const call = input => writer.fetch(new Request("https://example.invalid", { method: "POST", headers: { Authorization: "Bearer test-only", "Content-Type": "application/json" }, body: JSON.stringify(input) }), env);
const commit = { action: "commit", key: "index.json", value: next, expectedEtag: before.etag };
assert.equal((await call(commit)).status, 400, "全新規問題を照合する前には切替できません。");
assert.equal((await call({ action: "stage", key: "subjects/japanese-history-k/x.json", value: {} })).status, 403, "他科目の保存先には書き込みません。");
for (const object of allPlanObjects) assert.equal((await call({ action: "stage", ...object })).status, 200);
assert.equal((await call({ ...commit, expectedEtag: "stale" })).status, 409);
const otherChanged = structuredClone(next); otherChanged.subjects[0].title = "変更";
assert.equal((await call({ ...commit, value: otherChanged })).status, 400, "他科目の変更を含む切替を拒否します。");
assert.equal((await call(commit)).status, 200);
assert.deepEqual(await (await bucket.get("index.json")).json(), next);
for (const object of allPlanObjects) assert.deepEqual(await (await bucket.get(object.key)).json(), object.value);
assert.equal((await call({ ...commit, expectedEtag: (await bucket.get("index.json")).etag })).status, 409, "登録済みの科目を初回として二重登録しません。");
// 作り直しの切替：確認時の科目と一致し、他科目を変えない場合だけ科目全体を置き換える。
const replacedCatalog = replacePoliticsKSubject(next, [revisedPlan], contentHash(subject));
const replaceEnv = { ...env, PRESERVE_EXISTING_DECKS: "false", PREVIOUS_SUBJECT_HASH: contentHash(subject),
  ...encodeJsonBindings("ADDITION_JSON", replacedCatalog.subjects[1]),
  ...encodeJsonBindings("OBJECT_HASHES", Object.fromEntries(revisedPlan.objects.map(object => [object.key, contentHash(object.value)]))) };
const callReplace = input => writer.fetch(new Request("https://example.invalid", { method: "POST", headers: { Authorization: "Bearer test-only", "Content-Type": "application/json" }, body: JSON.stringify(input) }), replaceEnv);
for (const object of revisedPlan.objects) assert.equal((await callReplace({ action: "stage", ...object })).status, 200);
const replaceCommit = { action: "commit", key: "index.json", value: replacedCatalog, expectedEtag: (await bucket.get("index.json")).etag };
const replaceOther = structuredClone(replacedCatalog); replaceOther.subjects[0].title = "変更";
assert.equal((await callReplace({ ...replaceCommit, value: replaceOther })).status, 400, "置き換え時も他科目の変更を拒否します。");
assert.equal((await callReplace({ ...replaceCommit })).status, 200);
assert.deepEqual(await (await bucket.get("index.json")).json(), replacedCatalog);
assert.equal((await callReplace({ ...replaceCommit, expectedEtag: (await bucket.get("index.json")).etag })).status, 409, "置き換え後の科目は確認時と異なるので再度の置き換えを拒否します。");

// 関連画像：点検済みの割り当てだけを追加し、既存の画像一覧を保持する。
const selection = JSON.parse(await readFile("data/source/politics-economics-k/image-assignments.json", "utf8"));
// 「政治・経済」で登録済みの画像（ホッブズなど）は共有する。Cloudflareの一覧と同じ内容を手元の写しから使う。
// 他科目の画像を共有する場合は、その元の登録内容を shared-images.json に写しておく（公開処理はCloudflareの一覧で照合する）。
const sharedIds = new Set(selection.images.map(choice => choice.sourceAssetId).filter(id => !id.startsWith("PEKS-")));
const sharedAssets = JSON.parse(await readFile("data/source/politics-economics-k/shared-images.json", "utf8")).filter(asset => sharedIds.has(asset.id));
assert.equal(sharedAssets.length, sharedIds.size, "共有する画像はすべて登録済みです。");
const images = { schemaVersion: 2, assets: [{ id: "OLD", path: "term-images/old.webp" }, ...sharedAssets], assignments: [{ questionId: "OLD-Q", assetId: "OLD" }], termFallbacks: [] };
const snapshot = { catalog: next, images, decks: plans.map(value => ({ entry: subject.decks.find(deck => deck.id === value.index.deckId), index: value.index, chunks: value.objects.filter(object => object.key.includes("/chunks/")).map(object => object.value) })) };
const result = buildPoliticsKImages(snapshot, selection);
// 割り当て数・画像数は点検済みの割り当て一覧から数える。
const expectedAssignments = selection.images.reduce((sum, choice) => sum + choice.targets.reduce((count, target) => count + target.questions.length, 0), 0);
assert.equal(result.addedAssignments.length, expectedAssignments);
assert.equal(result.removedAssignments.length, 0);
assert.equal(new Set(result.audit.map(entry => entry.path)).size, new Set(selection.images.map(choice => choice.sourceAssetId)).size);
assert.deepEqual(selection.deckIds, expected.map(([deckId]) => deckId), "画像の点検対象は全パートです。");
assert.ok(result.audit.every(entry => selection.deckIds.includes(entry.deckId)));
assert.deepEqual(result.manifest.assets.slice(0, images.assets.length), images.assets);
assert.deepEqual(result.manifest.assignments.slice(0, 1), images.assignments);
for (const entry of result.audit) assert.ok(allTerms.some(term => term.stages.reverse.some(question => question.id === entry.questionId)));
for (const source of selection.sources) {
  const bytes = await readFile(source.sourceFile);
  assert.ok(bytes.length > 1000 && bytes.length < 500000 && bytes[0] === 255 && bytes[1] === 216, `JPEG・500KB未満の画像です: ${source.id}`);
}
// 作り直し：旧版の割り当てが残る一覧では追加を拒否し、置き換えではこの科目の割り当てだけを外して付け直す。
const staleImages = structuredClone(result.manifest);
staleImages.assignments = [images.assignments[0], { questionId: "PEK-01-01-U08-R01", termId: "PEK-01-01-U08", target: "旧版", assetId: "OLD" }, { questionId: "PEK-01-01-U99-R01", termId: "PEK-01-01-U99", target: "旧版", assetId: "OLD" }];
assert.throws(() => buildPoliticsKImages({ ...snapshot, images: staleImages }, selection), /編集済みの画像指定は上書きしません/);
const replacedImages = buildPoliticsKImages({ ...snapshot, images: staleImages }, selection, { replace: true });
assert.equal(replacedImages.removedAssignments.length, 2);
assert.equal(replacedImages.addedAssignments.length, expectedAssignments);
assert.deepEqual(replacedImages.manifest.assignments.filter(item => !isPoliticsKAssignment(item)), [images.assignments[0]], "他科目の割り当てを保持します。");
assert.deepEqual(replacedImages.manifest.assets.slice(0, staleImages.assets.length), staleImages.assets, "既存の画像は残します。");
assert.ok(!replacedImages.manifest.assignments.some(item => item.questionId === "PEK-01-01-U99-R01"), "旧版だけの問題への割り当てを外します。");
// 画像一覧の保存窓口：他科目の割り当ての変更と、設定にない問題への割り当てを拒否し、この科目の付け直しだけを受け付ける。
const staleText = JSON.stringify(staleImages), nextText = JSON.stringify(replacedImages.manifest) + "\n";
const imageBucket = new MemoryBucket();
const imagesBefore = await imageBucket.put("term-images.json", staleText), catalogBefore = await imageBucket.put("index.json", JSON.stringify(next));
const digest = text => createHash("sha256").update(text).digest("hex");
const ownQuestionIds = replacedImages.manifest.assignments.filter(isPoliticsKAssignment).map(item => item.questionId);
const imageEnv = { BUCKET: imageBucket, ACCESS_TOKEN: "test-only", ...imageWriterVars({ READ_KEYS: ["index.json", "term-images.json"], QUESTION_IDS: ownQuestionIds, NEW_IMAGES: {} }), PREVIOUS_IMAGES_HASH: digest(staleText), NEXT_IMAGES_HASH: digest(nextText) };
const callImages = (input, settings = imageEnv) => imageWriter.fetch(new Request("https://example.invalid", { method: "POST", headers: { Authorization: "Bearer test-only", "Content-Type": "application/json" }, body: JSON.stringify(input) }), settings);
const imageCommit = { action: "commit", key: "term-images.json", text: nextText, expectedEtag: imagesBefore.etag, catalogEtag: catalogBefore.etag };
const otherAssignment = structuredClone(replacedImages.manifest); otherAssignment.assignments[0] = { questionId: "OLD-Q", assetId: "CHANGED" };
const otherText = JSON.stringify(otherAssignment) + "\n";
assert.equal((await callImages({ ...imageCommit, text: otherText }, { ...imageEnv, NEXT_IMAGES_HASH: digest(otherText) })).status, 400, "他科目の割り当ての変更を拒否します。");
assert.equal((await callImages(imageCommit, { ...imageEnv, ...imageWriterVars({ READ_KEYS: ["index.json", "term-images.json"], QUESTION_IDS: ownQuestionIds.slice(1), NEW_IMAGES: {} }) })).status, 400, "設定にない問題への割り当てを拒否します。");
assert.equal((await callImages(imageCommit)).status, 200);
assert.equal(await (await imageBucket.get("term-images.json")).text(), nextText);
console.log(`政治経済K：${plans.length}パート・${totalUnits}用語・${totalQuestions}問（逆向きの説明のみ）の原文照合、一般的な言い回しの検査、科目の新設・再送・上書き防止・作り直しの置き換え、保存窓口の照合、関連画像${result.addedAssignments.length}問・${new Set(result.audit.map(entry => entry.path)).size}枚の割り当てと付け直しを確認しました。`);
