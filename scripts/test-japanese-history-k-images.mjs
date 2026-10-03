import assert from "node:assert/strict";
import { buildJapaneseKImages } from "./japanese-history-k-images.mjs";
import storageWorker from "./japanese-history-k-images-storage-worker.js";
import { createHash } from "node:crypto";
import { imageWriterVars } from "./japanese-history-k-images-config.mjs";

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
  QUESTION_IDS: JSON.stringify([question.id]),
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
const bytes = Buffer.from([255, 216, 255, 224, 1, 2, 3, 4, 255, 217]);
const sha256 = hash(bytes), id = "JHKS-" + sha256.slice(0, 20);
const source = { ...asset, id, path: `term-images/japanese-history-k/${id}.jpg`, sourceFile: `data/source/japanese-history-k/images/${id}.jpg`, sha256 };
const withSource = { ...selection, sources: [source], images: [{ ...selection.images[0], sourceAssetId: id }] };
const prepared = buildJapaneseKImages(snapshot, withSource);
assert.equal(prepared.addedAssets.length, 2); assert.equal(prepared.addedAssignments.length, 1);
assert.equal(buildJapaneseKImages({ ...snapshot, images: prepared.manifest }, withSource).addedAssets.length, 0);
assert.throws(() => buildJapaneseKImages(snapshot, { ...withSource, sources: [{ ...source, sha256: "bad" }] }));
assert.throws(() => buildJapaneseKImages(snapshot, { ...withSource, sources: [{ ...source, sourceFile: "../outside.jpg" }] }));
const binaries = new Map(), binaryWrites = [];
stored = oldText; imageEtag = "images-before";
const preparedText = JSON.stringify(prepared.manifest);
const binaryEnv = { ...env, NEXT_IMAGES_HASH: hash(preparedText), NEW_IMAGES: JSON.stringify({ [source.path]: sha256 }), BUCKET: {
  ...env.BUCKET,
  async get(key) { if (binaries.has(key)) return { arrayBuffer: async () => binaries.get(key) }; return env.BUCKET.get(key); },
  async put(key, value, options) {
    if (key === source.path) {
      assert.equal(options.onlyIf.get("If-None-Match"), "*");
      if (binaries.has(key)) return null; binaries.set(key, value); binaryWrites.push(key); return { etag: "new-image" };
    }
    return env.BUCKET.put(key, value, options);
  },
} };
const sendBinary = (body, authorization = "Bearer test-only") => storageWorker.fetch(new Request("https://test.invalid", { method: "POST", headers: { Authorization: authorization, "Content-Type": "application/json" }, body: JSON.stringify(body) }), binaryEnv);
const imageRequest = { action: "image", key: source.path, base64: bytes.toString("base64") };
const imageCommit = { ...commit, text: preparedText };
assert.equal((await sendBinary(imageCommit)).status, 409, "画像本体を登録・照合する前に一覧を公開しません。");
assert.equal((await sendBinary(imageRequest, "Bearer wrong")).status, 401);
assert.equal((await sendBinary({ ...imageRequest, key: "term-images/old.webp" })).status, 403);
assert.equal((await sendBinary({ ...imageRequest, base64: Buffer.from("wrong").toString("base64") })).status, 400);
assert.equal((await sendBinary(imageRequest)).status, 200);
assert.equal((await sendBinary(imageRequest)).status, 200); assert.equal(binaryWrites.length, 1);
assert.equal((await (await sendBinary({ action: "image-check", key: source.path })).json()).sha256, sha256);
const validBytes = binaries.get(source.path); binaries.set(source.path, bytes.subarray(0, 2));
assert.equal((await sendBinary(imageRequest)).status, 409, "同じ保存先の既存画像は上書きしません。"); binaries.set(source.path, validBytes);
binaryEnv.QUESTION_IDS = "[]"; assert.equal((await sendBinary(imageCommit)).status, 400, "点検した問題番号以外への追加を拒否します。");
binaryEnv.QUESTION_IDS = env.QUESTION_IDS;
assert.equal((await sendBinary(imageCommit)).status, 200);
assert.equal(stored, preparedText);
// Cloudflareの一設定の容量上限を越える実際の登録件数を再現する。
const manyImages = { [source.path]: sha256 };
for (let index = 0; index < 39; index++) {
  const key = `term-images/japanese-history-k/JHKS-${index.toString(16).padStart(20, "0")}.jpg`;
  manyImages[key] = sha256; binaries.set(key, validBytes);
}
assert.ok(Buffer.byteLength(JSON.stringify(manyImages)) > 5120);
const chunkVars = imageWriterVars({
  NEW_IMAGES: manyImages,
  READ_KEYS: [...Array.from({ length: 300 }, (_, index) => `読込対象😀/${index}.json`), "term-images.json"],
  QUESTION_IDS: [...Array.from({ length: 300 }, (_, index) => `JHK-test-${index.toString().padStart(5, "0")}-B01`), question.id],
});
assert.ok(Number(chunkVars.NEW_IMAGES_PARTS) > 1); assert.ok(Number(chunkVars.READ_KEYS_PARTS) > 1); assert.ok(Number(chunkVars.QUESTION_IDS_PARTS) > 1);
for (const [key, value] of Object.entries(chunkVars)) if (!key.endsWith("_PARTS")) assert.ok(Buffer.byteLength(value) <= 4000);
stored = oldText; imageEtag = "images-before";
const chunkEnv = { ...binaryEnv, ...chunkVars };
const sendChunk = body => storageWorker.fetch(new Request("https://test.invalid", { method: "POST", headers: { Authorization: "Bearer test-only", "Content-Type": "application/json" }, body: JSON.stringify(body) }), chunkEnv);
assert.equal((await sendChunk({ action: "read", key: "term-images.json" })).status, 200);
assert.equal((await sendChunk({ action: "read", key: "another-subject.json" })).status, 403);
assert.equal((await (await sendChunk({ action: "image-check", key: source.path })).json()).sha256, sha256);
const lastPart = "QUESTION_IDS_" + (Number(chunkVars.QUESTION_IDS_PARTS) - 1), savedPart = chunkEnv[lastPart];
delete chunkEnv[lastPart]; assert.equal((await sendChunk(imageCommit)).status, 400); assert.equal(stored, oldText);
chunkEnv[lastPart] = savedPart;
const secondPart = "NEW_IMAGES_1", savedImagesPart = chunkEnv[secondPart];
chunkEnv[secondPart] = "x".repeat(4001); assert.equal((await sendChunk(imageCommit)).status, 400); assert.equal(stored, oldText);
chunkEnv[secondPart] = savedImagesPart;
const checkedKey = Object.keys(manyImages).at(-1); binaries.delete(checkedKey);
assert.equal((await sendChunk(imageCommit)).status, 409); assert.equal(stored, oldText); binaries.set(checkedKey, validBytes);
assert.equal((await sendChunk(imageCommit)).status, 200); assert.equal(stored, preparedText);
console.log("容量上限を越える画像40枚の設定・日本語と絵文字を含む読込範囲・問題番号の分割、末尾の対象の保持、欠落と未照合画像の公開拒否を確認しました。");
console.log("日本史Kの画像追加：元の問題・画像・他科目の保持、画像本体の共有、再実行、編集済み指定の拒否、認証・範囲・同時編集の拒否と旧一覧の保持を確認しました。");
