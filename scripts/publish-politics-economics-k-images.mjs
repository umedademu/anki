import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildPoliticsKImages, imageContentHash, politicsKImagesKey } from "./politics-economics-k-images.mjs";
import { getUnregisteredImageSources, imageWriterVars } from "./japanese-history-k-images-config.mjs";

const apply = process.argv.includes("--apply");
const work = new URL("../.wrangler/politics-economics-k-images/", import.meta.url);
await mkdir(work, { recursive: true });
const cloudBase = "https://pub-76ffbe2829114a5cbaa433db45872267.r2.dev";
const configPath = new URL("writer.json", work), token = randomBytes(32).toString("hex");
const selection = JSON.parse(await readFile(new URL("../data/source/politics-economics-k/image-assignments.json", import.meta.url), "utf8"));
let endpoint, deployAttempted = false;
const textHash = text => createHash("sha256").update(text).digest("hex");
async function wrangler(...args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url)), ...args, "--config", fileURLToPath(configPath)], { stdio: ["ignore", "pipe", "pipe"] });
    let output = ""; child.stdout.on("data", part => { output += part; }); child.stderr.on("data", part => { output += part; });
    child.on("error", reject); child.on("close", code => code === 0 ? resolve(output) : reject(new Error(output.replaceAll(token, "[非公開]"))));
  });
}
async function request(input) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(input), signal: AbortSignal.timeout(45000) });
    if (input.action === "read" && [404, 429, 500, 502, 503, 504].includes(response.status) && attempt < 5) {
      await response.arrayBuffer(); await new Promise(resolve => setTimeout(resolve, Math.min(8000, 2000 * (attempt + 1)))); continue;
    }
    assert.ok(response.ok, `Cloudflareの${input.action}が失敗しました（${response.status}）。`);
    return response.json();
  }
}
async function read(key) {
  if (endpoint) return request({ action: "read", key });
  const response = await fetch(`${cloudBase}/${key}?politicsKImages=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(30000) });
  assert.ok(response.ok, `Cloudflareの取得に失敗しました: ${key}`);
  return { text: await response.text(), etag: response.headers.get("etag") };
}
const reads = new Map();
async function json(key) { const value = await read(key); reads.set(key, value); return JSON.parse(value.text); }
try {
  const [catalog, images] = await Promise.all([json("index.json"), json(politicsKImagesKey)]);
  const subject = catalog.subjects.find(value => value.id === "politics-economics-k"); assert.ok(subject);
  const decks = await Promise.all(selection.deckIds.map(async id => {
    const entry = subject.decks.find(value => value.id === id); assert.ok(entry, id);
    const index = await json(entry.indexPath);
    const chunks = await Promise.all(index.chunks.map(chunk => json(chunk.path)));
    return { entry, index, chunks };
  }));
  const snapshot = { catalog, images, decks }, result = buildPoliticsKImages(snapshot, selection);
  const manifestText = JSON.stringify(result.manifest) + "\n";
  const sourceBytes = new Map();
  for (const source of selection.sources ?? []) {
    const bytes = await readFile(new URL("../" + source.sourceFile, import.meta.url));
    assert.equal(textHash(bytes), source.sha256, "点検済みの新規画像が変更されました。");
    assert.ok(bytes.byteLength > 1000 && bytes.byteLength < 500000 && bytes[0] === 255 && bytes[1] === 216);
    sourceBytes.set(source.path, bytes);
  }
  const pendingSourceBytes = getUnregisteredImageSources(sourceBytes, images.assets);
  // 画像本体も点検時の内容を記録し、同じ保存先の差し替えを検知する。
  const assetHashes = {};
  for (const path of new Set(result.audit.map(value => value.path))) {
    const response = await fetch(`${cloudBase}/${path}?politicsKImages=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(30000) });
    let bytes;
    if (response.status === 404 && sourceBytes.has(path) && !images.assets.some(asset => asset.path === path)) bytes = sourceBytes.get(path);
    else {
      assert.ok(response.ok && response.headers.get("content-type")?.startsWith("image/"), path);
      bytes = Buffer.from(await response.arrayBuffer());
    }
    assert.ok(bytes.byteLength > 300);
    if (sourceBytes.has(path)) assert.equal(textHash(bytes), textHash(sourceBytes.get(path)), "公開済みの画像本体は上書きしません。");
    assetHashes[path] = textHash(bytes);
  }
  const review = { selection: imageContentHash(selection), reads: Object.fromEntries([...reads].map(([key, value]) => [key, textHash(value.text)])), assets: assetHashes, next: textHash(manifestText) };
  if (apply && result.addedAssignments.length) assert.deepEqual(review, JSON.parse(await readFile(new URL("review.json", work), "utf8")), "確認後に問題・画像・指定が変わりました。公開せず再点検してください。");
  if (!apply) {
    await writeFile(new URL("snapshot.json", work), JSON.stringify(snapshot));
    await writeFile(new URL("manifest.json", work), manifestText);
    await writeFile(new URL("audit.json", work), JSON.stringify(result.audit, null, 2));
    await writeFile(new URL("review.json", work), JSON.stringify(review));
  }
  console.log(`今回の追加は${result.addedAssignments.length}問。累計${selection.deckIds.length}パート・${result.audit.length}問へ${Object.keys(assetHashes).length}枚の確認済み画像を割り当てます。`);
  if (!apply) console.log("確認用の一覧を作成しました。Cloudflareへの書き込みはありません。");
  else if (!result.addedAssignments.length && !result.addedAssets.length) console.log("公開済みの画像指定が一致しています。再登録は不要です。");
  else {
    await writeFile(configPath, JSON.stringify({ name: "anki-politics-economics-k-images", compatibility_date: "2026-08-20", main: fileURLToPath(new URL("politics-economics-k-images-storage-worker.js", import.meta.url)), workers_dev: true, preview_urls: false, vars: { ACCESS_TOKEN: token, ...imageWriterVars({ READ_KEYS: [...reads.keys()], QUESTION_IDS: result.addedAssignments.map(item => item.questionId), NEW_IMAGES: Object.fromEntries([...pendingSourceBytes].map(([key, bytes]) => [key, textHash(bytes)])) }), PREVIOUS_IMAGES_HASH: textHash(reads.get(politicsKImagesKey).text), NEXT_IMAGES_HASH: textHash(manifestText) }, r2_buckets: [{ binding: "BUCKET", bucket_name: "anki-world-history" }] }));
    deployAttempted = true;
    endpoint = (await wrangler("deploy")).match(/https:\/\/[a-z0-9.-]+\.workers\.dev/)?.[0]; assert.ok(endpoint);
    const checked = new Map();
    for (const [key, previous] of reads) {
      const current = await read(key); assert.equal(current.text, previous.text, `同時編集を検知しました: ${key}`); checked.set(key, current);
    }
    for (const [key, bytes] of pendingSourceBytes) {
      await request({ action: "image", key, base64: bytes.toString("base64") });
      assert.equal((await request({ action: "image-check", key })).sha256, textHash(bytes));
    }
    if (pendingSourceBytes.size) {
      console.log(`新規画像本体${pendingSourceBytes.size}枚をCloudflareで照合しました。既存の画像${Object.keys(assetHashes).length - pendingSourceBytes.size}枚は公開前に照合し、再送せず保持しています。`);
    }
    await request({ action: "commit", key: politicsKImagesKey, text: manifestText, expectedEtag: checked.get(politicsKImagesKey).etag, catalogEtag: checked.get("index.json").etag });
    assert.equal((await read(politicsKImagesKey)).text, manifestText);
    for (const [key, previous] of reads) if (key !== politicsKImagesKey) assert.equal((await read(key)).text, previous.text, key);
    console.log("Cloudflareの画像一覧だけを条件付きで更新・全文照合しました。既存画像・他科目の割り当て・問題・学習履歴を保持しています。");
  }
} finally {
  if (deployAttempted) {
    try { await wrangler("delete", "--force"); console.log("作業用の保存窓口を削除しました。"); }
    catch (error) { if (!error.message.includes("[code: 10090]")) throw error; console.log("作業用の保存窓口は存在しないことを確認しました。"); }
    finally { await unlink(configPath).catch(error => { if (error.code !== "ENOENT") throw error; }); }
  }
}
