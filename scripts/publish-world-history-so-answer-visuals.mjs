import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildSOAnswerVisuals } from "./world-history-so-answer-visuals.mjs";

const apply = process.argv.includes("--apply");
const work = new URL("../.wrangler/so-answer-visuals/", import.meta.url);
await mkdir(new URL("maps/", work), { recursive: true });
const configPath = new URL("writer.json", work), token = randomBytes(32).toString("hex");
const cloudBase = "https://pub-76ffbe2829114a5cbaa433db45872267.r2.dev";
let endpoint = null;
async function wrangler(...args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url)), ...args, "--config", fileURLToPath(configPath)], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", part => { output += part; }); child.stderr.on("data", part => { output += part; });
    child.on("error", reject); child.on("close", code => code === 0 ? resolve(output) : reject(new Error(output.replaceAll(token, "[非公開]"))));
  });
}
async function request(input) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(input), signal: AbortSignal.timeout(45000) });
    // 新しい作業用窓口の反映待ち。問題集・一覧の更新は再送しない。
    if (input.action === "read" && [404,429,500,502,503,504].includes(response.status) && attempt < 5) {
      await response.arrayBuffer();
      await new Promise(resolve => setTimeout(resolve, Math.min(8000, 2000 * (attempt + 1))));
      continue;
    }
    assert.ok(response.ok, `Cloudflareへの${input.action}が失敗しました（${response.status}）。`);
    return response.json();
  }
}
async function read(key) {
  if (endpoint) return request({ action: "read", key });
  const response = await fetch(`${cloudBase}/${key}?visuals=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(30000) });
  if (response.status === 404) return { text: null, etag: null };
  assert.ok(response.ok, `Cloudflareから${key}を読み込めません（${response.status}）。`);
  return { text: await response.text(), etag: response.headers.get("etag") };
}
async function json(key) { return JSON.parse((await read(key)).text); }
try {
  if (apply) {
    await writeFile(configPath, JSON.stringify({ name: "anki-so-answer-visuals", compatibility_date: "2026-08-20", main: fileURLToPath(new URL("so-answer-visuals-storage-worker.js", import.meta.url)), workers_dev: true, preview_urls: false, vars: { ACCESS_TOKEN: token }, r2_buckets: [{ binding: "BUCKET", bucket_name: "anki-world-history" }] }));
    const deployed = await wrangler("deploy");
    endpoint = deployed.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/)?.[0];
    assert.ok(endpoint, "作業用保存窓口の接続先を確認できません。");
  }
  const original = await read("index.json"), images = await read("term-images.json");
  const catalog = JSON.parse(original.text), subject = catalog.subjects.find(s => s.id === "world-history-so");
  assert.ok(subject);
  const decks = await Promise.all(subject.decks.map(async entry => {
    const index = await json(entry.indexPath);
    return { entry, index, chunks: await Promise.all(index.chunks.map(c => json(c.path))) };
  }));
  const snapshot = { catalog, subject, decks };
  const result = buildSOAnswerVisuals(snapshot, JSON.parse(images.text), await readFile(new URL("../data/source/world-history-so/answer-visuals/base-map.svg", import.meta.url), "utf8"));
  const manifestKey = "subjects/world-history-so/answer-visuals/index.json", previous = await read(manifestKey);
  const manifestText = JSON.stringify(result.manifest) + "\n";
  await writeFile(new URL("current.json", work), JSON.stringify(snapshot));
  await writeFile(new URL("images.json", work), images.text);
  await writeFile(new URL("manifest.json", work), manifestText);
  await writeFile(new URL("audit.json", work), JSON.stringify(result.audit, null, 2));
  for (const [key, svg] of result.assets) await writeFile(new URL("maps/" + key.split("/").at(-1), work), svg);
  const mapCount = result.manifest.assignments.filter(a => a.map).length;
  console.log(`${result.manifest.questionCount}問：解答用の地図${mapCount}問、既存地図${result.manifest.questionCount-mapCount}問、関連画像${result.audit.filter(a=>a.relatedImage).length}問。地図ファイル${result.assets.size}枚。`);
  const report = { version: result.manifest.version, questions: result.manifest.questionCount, maps: result.assets.size, assignments: result.audit };
  await writeFile(new URL("../data/source/world-history-so/answer-visuals/coverage.json", import.meta.url), JSON.stringify(report, null, 2) + "\n");
  if (!apply) console.log("確認用の地図・一覧を .wrangler/so-answer-visuals に出力しました。Cloudflareへの登録は --apply で行います。");
  else if (previous.text === manifestText) console.log("Cloudflareの解答画像は生成結果と一致しています。");
  else {
    await writeFile(new URL(`before-${previous.etag ?? "initial"}.json`, work), JSON.stringify(previous));
    const assets = [...result.assets], queue = [...assets]; let done = 0;
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (queue.length) {
        const [key, text] = queue.shift();
        const existing = await read(key);
        if (existing.text !== text) { await request({ action: "map", key, text }); assert.equal((await read(key)).text, text); }
        done++; if (done % 25 === 0 || done === assets.length) console.log(`地図を登録・照合：${done} / ${assets.length}枚`);
      }
    }));
    await request({ action: "commit", key: manifestKey, text: manifestText, expectedEtag: previous.etag, catalogEtag: original.etag, imagesEtag: images.etag });
    assert.equal((await read(manifestKey)).text, manifestText);
    assert.equal((await read("index.json")).text, original.text, "作業中に問題集が更新されました。再確認してください。");
    assert.equal((await read("term-images.json")).text, images.text);
    console.log("Cloudflareへの登録・全文照合を完了しました。問題集・既存の画像一覧・学習履歴は変更していません。");
  }
} finally {
  if (endpoint) { await wrangler("delete", "--force"); await unlink(configPath); console.log("作業用保存窓口を削除しました。"); }
}
