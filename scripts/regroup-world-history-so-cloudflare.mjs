import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { regroupSOParts } from "./world-history-so-parts.mjs";
import { migrateSOProgress } from "./world-history-so-progress.mjs";

const apply = process.argv.includes("--apply");
const work = new URL("../.wrangler/so-parts/", import.meta.url);
await mkdir(work, { recursive: true });
const configPath = new URL("writer.json", work);
const token = randomBytes(32).toString("hex");
await writeFile(configPath, JSON.stringify({ name: "anki-so-parts", compatibility_date: "2026-08-20",
  main: fileURLToPath(new URL("so-classification-storage-worker.js", import.meta.url)),
  workers_dev: true, preview_urls: false, vars: { ACCESS_TOKEN: token },
  r2_buckets: [{ binding: "BUCKET", bucket_name: "anki-world-history" }] }));
async function wrangler(...args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url)), ...args, "--config", fileURLToPath(configPath)], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", part => { output += part; });
    child.stderr.on("data", part => { output += part; });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve(output) : reject(new Error(output.replaceAll(token, "[非公開]"))));
  });
}
const deployed = await wrangler("deploy");
const endpoint = deployed.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/)?.[0];
assert.ok(endpoint, "一時保存窓口の接続先を確認できません。");
async function request(input) {
  const response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(input), signal: AbortSignal.timeout(60000) });
  assert.ok(response.ok, `Cloudflareの${input.action}に失敗しました（${response.status}）。`);
  return response.json();
}
async function read(key) {
  return request({ action: "read", key });
}
async function put(key, value) {
  assert.ok(key.startsWith("subjects/world-history-so/"));
  await request({ action: "put", key, value });
  assert.deepEqual((await read(key)).value, value);
}
try {
  const original = await read("index.json");
  const subject = original.value.subjects.find((item) => item.id === "world-history-so");
  const backup = [];
  for (const entry of subject.decks) {
    const { value: index } = await read(entry.indexPath);
    const chunks = await Promise.all(index.chunks.map(async (chunk) => (await read(chunk.path)).value));
    backup.push({ entry, index, chunks });
  }
  const classification = JSON.parse(await readFile(new URL("../data/source/world-history-so/chapters.json", import.meta.url), "utf8"));
  const { next, staged, decks } = regroupSOParts(original.value, backup, classification);
  for (const deck of decks) console.log(deck.datasetLabel + ": " + deck.terms.length + "問");
  if (JSON.stringify(next) === JSON.stringify(original.value)) {
    console.log("現行のパート分けと一致しています。変更はありません。");
  } else if (apply) {
    const backupName = `before-${original.etag.replaceAll('"', '')}.json`;
    await writeFile(new URL(backupName, work), JSON.stringify({ original, backup }, null, 2));
    await put(`subjects/world-history-so/question-types/parts-history/${original.etag.replaceAll('"', '')}.json`, original.value);
    for (const object of staged) await put(object.path, object.value);
    await migrateSOProgress(decks, classification);
    // 取得後に別の編集が行われていたら、全体索引を上書きせず中断する。
    const committed = await request({ action: "put", key: "index.json", value: next, expectedEtag: original.etag });
    assert.ok(committed, "作業中に索引が更新されました。対応表を確認して再実行してください。");
    assert.deepEqual((await read("index.json")).value, next);
    console.log("Cloudflareの9パートを登録・全文照合しました。問題内容・他科目を維持し、移動した問題の履歴を引き継ぎました。");
  } else console.log("確認のみです。反映するには --apply を付けてください。");
} finally {
  await wrangler("delete", "--force");
  console.log("作業用の保存窓口を削除しました。");
}
