import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const japaneseKImagesKey = "term-images.json";
export const imageContentHash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function buildJapaneseKImages(snapshot, selection) {
  assert.equal(selection.schemaVersion, 1);
  assert.equal(selection.subjectId, "japanese-history-k");
  assert.equal(new Set(selection.deckIds).size, selection.deckIds.length);
  const { catalog, images, decks } = snapshot;
  const subject = catalog.subjects.find(value => value.id === selection.subjectId);
  assert.ok(subject);
  assert.equal(images.schemaVersion, 2);
  for (const field of ["assets", "assignments", "termFallbacks"]) assert.ok(Array.isArray(images[field]));
  const original = JSON.stringify(snapshot);
  const next = structuredClone(images);
  const assets = new Map(images.assets.map(asset => [asset.id, asset]));
  assert.equal(assets.size, images.assets.length);
  const addedAssets = [], addedAssignments = [], audit = [], seen = new Set();
  const sourceIds = new Set();
  for (const { sourceFile, sha256, ...asset } of selection.sources ?? []) {
    assert.match(sha256, /^[a-f0-9]{64}$/);
    assert.equal(asset.id, "JHKS-" + sha256.slice(0, 20));
    assert.equal(asset.path, `term-images/japanese-history-k/${asset.id}.jpg`);
    assert.equal(sourceFile, `data/source/japanese-history-k/images/${asset.id}.jpg`);
    assert.ok(!sourceIds.has(asset.id), "新規画像の重複は登録しません。"); sourceIds.add(asset.id);
    assert.ok(selection.images.some(choice => choice.sourceAssetId === asset.id), "未使用画像は登録しません。");
    if (assets.has(asset.id)) assert.deepEqual(assets.get(asset.id), asset, "登録済みの画像は上書きしません。");
    else { next.assets.push(asset); assets.set(asset.id, asset); addedAssets.push(asset); }
  }
  const registered = new Map(images.assignments.map(value => [value.questionId, value]));
  assert.equal(registered.size, images.assignments.length);
  const questions = new Map();
  for (const deckId of selection.deckIds) {
    const deck = decks.find(value => value.entry.id === deckId);
    assert.ok(deck, `Cloudflareの小項目がありません: ${deckId}`);
    assert.deepEqual(deck.entry, subject.decks.find(value => value.id === deckId));
    for (const term of deck.chunks.flatMap(chunk => chunk.terms)) {
      for (const question of Object.values(term.stages).flat()) {
        assert.ok(!questions.has(question.id));
        questions.set(question.id, { question, term, deckId });
      }
    }
  }
  for (const choice of selection.images) {
    const source = assets.get(choice.sourceAssetId);
    assert.ok(source, `Cloudflareに確認済み画像がありません: ${choice.sourceAssetId}`);
    for (const field of ["path", "creator", "license", "licenseUrl", "sourcePageUrl"]) assert.ok(String(source[field] ?? "").trim(), field);
    assert.match(source.path, /^term-images\/[a-zA-Z0-9_./-]+\.(webp|png|jpg|jpeg)$/);
    assert.ok(!source.path.includes(".."));
    assert.match(source.sourcePageUrl, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    assert.ok(String(choice.caption ?? "").trim());
    assert.ok(String(choice.note ?? "").trim());
    const asset = { ...source, id: "JHKI-" + imageContentHash([source.id, choice.caption]).slice(0, 20), alt: choice.caption, caption: choice.caption };
    const existingAsset = assets.get(asset.id);
    if (existingAsset) assert.deepEqual(existingAsset, asset, "既存の画像説明は上書きしません。");
    else { next.assets.push(asset); assets.set(asset.id, asset); addedAssets.push(asset); }
    for (const target of choice.targets) for (const suffix of target.questions) {
      const questionId = `${target.termId}-${suffix}`;
      const entry = questions.get(questionId);
      assert.ok(entry && entry.term.id === target.termId, `現行問題の割り当てが不正です: ${questionId}`);
      assert.ok(!seen.has(questionId), `画像が重複しています: ${questionId}`);
      seen.add(questionId);
      const assignment = { questionId, termId: target.termId, target: entry.term.term, assetId: asset.id };
      assert.ok(assignment.target);
      const existing = registered.get(questionId);
      if (existing) assert.deepEqual(existing, assignment, `編集済みの画像指定は上書きしません: ${questionId}`);
      else { next.assignments.push(assignment); addedAssignments.push(assignment); }
      audit.push({ deckId: entry.deckId, questionId, prompt: entry.question.prompt, answer: entry.question.answer, caption: asset.caption, path: asset.path, sourcePageUrl: asset.sourcePageUrl, note: choice.note });
    }
  }
  assert.equal(JSON.stringify(snapshot), original, "問題・画像の現行データを変更せず追加します。");
  assert.deepEqual(next.termFallbacks, images.termFallbacks);
  assert.deepEqual(next.assets.slice(0, images.assets.length), images.assets);
  assert.deepEqual(next.assignments.slice(0, images.assignments.length), images.assignments);
  return { manifest: next, addedAssets, addedAssignments, audit };
}
