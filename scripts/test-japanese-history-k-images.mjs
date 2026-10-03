import assert from "node:assert/strict";
import { buildJapaneseKImages } from "./japanese-history-k-images.mjs";
import storageWorker from "./japanese-history-k-images-storage-worker.js";
import { createHash } from "node:crypto";

const asset = { id: "old-picture", path: "term-images/old.webp", caption: "既存の説明", alt: "既存の説明", creator: "作者", license: "Public domain", licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/", sourcePageUrl: "https://commons.wikimedia.org/wiki/File:Old.jpg" };
const entry = { id: "book-06-01-01", version: "履歴は保持" };
const question = { id: "JHK3-06-01-01-U01-B01", prompt: "機関は何か。", answer: "ＧＨＱ。", stage: "beginner" };
const term = { id: "JHK3-06-01-01-U01", term: "ＧＨＱ", stages: { beginner: [question], reverse: [], integrated: [] } };
const images = { schemaVersion: 2, assets: [asset], termFallbacks: [{ termId: "WH-000001", assetId: asset.id }], assignments: [{ questionId: "WH-000001-B01", termId: "WH-000001", assetId: asset.id, target: "元の用語" }], extra: "その他の設定を保持" };
const snapshot = { catalog: { subjects: [{ id: "japanese-history-k", decks: [entry] }] }, images, decks: [{ entry, chunks: [{ terms: [term] }] }] };
const selection = { schemaVersion: 1, subjectId: "japanese-history-k", deckIds: [entry.id], images: [{ sourceAssetId: asset.id, caption: "ＧＨＱの拠点", note: "確認した理由", targets: [{ termId: term.id, questions: ["B01"] }] }] };
const original = structuredClone(snapshot), result = buildJapaneseKImages(snapshot, selection);
assert.deepEqual(snapshot, original);
assert.equal(result.addedAssets.length, 1); assert.equal(result.addedAssignments.length, 1);
assert.deepEqual(result.manifest.assets[0], asset); assert.deepEqual(result.manifest.assignments[0], images.assignments[0]);
assert.equal(result.addedAssets[0].path, asset.path); assert.equal(result.addedAssets[0].creator, asset.creator);
assert.equal(result.addedAssets[0].sourcePageUrl, asset.sourcePageUrl); assert.equal(result.manifest.extra, images.extra);
const repeated = buildJapaneseKImages({ ...snapshot, images: result.manifest }, selection);
assert.equal(repeated.addedAssets.length, 0); assert.equal(repeated.addedAssignments.length, 0); assert.deepEqual(repeated.manifest, result.manifest);
const edited = structuredClone(snapshot); edited.images.assignments.push({ ...result.addedAssignments[0], assetId: "user-edited" });
assert.throws(() => buildJapaneseKImages(edited, selection), /編集済み/);
const absent = structuredClone(selection); absent.images[0].targets[0].questions = ["B99"];
assert.throws(() => buildJapaneseKImages(snapshot, absent), /現行問題/);
const duplicate = structuredClone(selection); duplicate.images[0].targets.push(duplicate.images[0].targets[0]);
assert.throws(() => buildJapaneseKImages(snapshot, duplicate), /重複/);

const hash = text => createHash("sha256").update(text).digest("hex");
const oldText = JSON.stringify(images), newText = JSON.stringify(result.manifest);
let catalogEtag = "catalog-before", imageEtag = "images-before", stored = oldText;
const writes = [];
const env = {
  ACCESS_TOKEN: "test-only", READ_KEYS: JSON.stringify(["index.json", "term-images.json"]),
  PREVIOUS_IMAGES_HASH: hash(oldText), NEXT_IMAGES_HASH: hash(newText),
  BUCKET: {
    async get(key) { return key === "term-images.json" ? { etag: imageEtag, text: async () => stored } : null; },
    async head(key) { return key === "index.json" ? { etag: catalogEtag } : null; },
    async put(key, text, options) {
      if (options.onlyIf && options.onlyIf.etagMatches !== imageEtag) return null;
      writes.push({ key, text }); if (key === "term-images.json") { stored = text; imageEtag = "images-after"; } return { etag: imageEtag };
    },
  },
};
const commit = { action: "commit", key: "term-images.json", text: newText, expectedEtag: imageEtag, catalogEtag };
const send = (body, authorization = "Bearer test-only") => storageWorker.fetch(new Request("https://test.invalid", { method: "POST", headers: { Authorization: authorization, "Content-Type": "application/json" }, body: JSON.stringify(body) }), env);
assert.equal((await send(commit, "Bearer wrong")).status, 401);
assert.equal((await send({ ...commit, key: "index.json" })).status, 403);
assert.equal((await send({ action: "read", key: "another-subject.json" })).status, 403);
assert.equal((await send({ ...commit, text: newText + " " })).status, 400);
assert.equal((await send({ ...commit, expectedEtag: "old-edit" })).status, 409);
catalogEtag = "changed-catalog"; assert.equal((await send(commit)).status, 409); catalogEtag = commit.catalogEtag;
assert.equal(writes.length, 0, "認証・範囲・同時編集で失敗した時は書き込みません。");
assert.equal((await send(commit)).status, 200); assert.equal(stored, newText);
assert.deepEqual(writes.map(value => value.key), ["term-images-history/japanese-history-k/images-before.json", "term-images.json"]);
assert.equal(writes[0].text, oldText); assert.equal((await send(commit)).status, 409);
assert.equal(writes.length, 2, "古い版による再送は画像一覧を上書きしません。");
console.log("日本史Kの画像追加：元の問題・画像・他科目の保持、画像本体の共有、再実行、編集済み指定の拒否、認証・範囲・同時編集の拒否と旧一覧の保持を確認しました。");
