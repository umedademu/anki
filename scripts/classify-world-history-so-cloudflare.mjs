import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { applySOQuestionTypes, loadSOQuestionTypes } from "./world-history-so-question-types.mjs";

const apply = process.argv.includes("--apply");
const work = new URL("../.wrangler/so-types/", import.meta.url);
await mkdir(work, { recursive: true });
const configPath = new URL("writer.json", work);
const token = randomBytes(32).toString("hex");
await writeFile(configPath, JSON.stringify({ name: "anki-so-classification", compatibility_date: "2026-08-20",
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
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
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
  const next = structuredClone(original.value);
  const subject = next.subjects.find((item) => item.id === "world-history-so");
  assert.ok(subject?.decks?.length);
  const assignments = await loadSOQuestionTypes();
  const seen = new Set(), counts = {}, staged = [], backup = [];
  for (const entry of subject.decks) {
    const { value: index } = await read(entry.indexPath);
    const chunks = await Promise.all(index.chunks.map(async (chunk) => (await read(chunk.path)).value));
    backup.push({ entry: structuredClone(entry), index: structuredClone(index), chunks: structuredClone(chunks) });
    const terms = chunks.flatMap((chunk) => chunk.terms);
    for (const id of applySOQuestionTypes(terms, assignments)) {
      assert.ok(!seen.has(id), `章をまたぐ問題番号の重複: ${id}`);
      seen.add(id);
      const type = assignments.get(id).type;
      counts[type] = (counts[type] ?? 0) + 1;
    }
    // 問題の分類以外は一切変更しない。本文・画像・音声・識別番号も照合する。
    const before = backup.at(-1).chunks;
    const restored = structuredClone(chunks);
    restored.forEach((chunk, ci) => chunk.terms.forEach((term, ti) => {
      for (const [stage, questions] of Object.entries(term.stages)) questions.forEach((question, qi) => {
        question.type = before[ci].terms[ti].stages[stage][qi].type;
      });
    }));
    assert.deepEqual(restored, before);
    const contentVersion = hash(chunks);
    const prefix = `subjects/world-history-so/question-types/${contentVersion}/${entry.id}`;
    index.chunks = index.chunks.map((chunk, i) => {
      const path = `${prefix}/chunks/${String(i + 1).padStart(4, "0")}.json`;
      staged.push({ path, value: chunks[i] });
      return { ...chunk, path };
    });
    index.contentVersion = contentVersion;
    entry.contentVersion = contentVersion;
    entry.indexPath = `${prefix}/index.json`;
    staged.push({ path: entry.indexPath, value: index });
    assert.equal(index.version, backup.at(-1).index.version);
  }
  assert.equal(seen.size, assignments.size, "Cloudflare上の問題と分類表の件数が一致しません。");
  subject.indexPath = subject.decks.find((deck) => deck.id === subject.defaultDeckId).indexPath;
  next.version = hash(next.subjects);
  assert.deepEqual(next.subjects.filter(s => s.id !== subject.id), original.value.subjects.filter(s => s.id !== subject.id));
  console.log(JSON.stringify({ total: seen.size, counts, time: counts.time ?? 0 }));
  if (JSON.stringify(next) === JSON.stringify(original.value)) {
    console.log("現行の分類と一致しています。変更はありません。");
  } else if (apply) {
    const backupName = `before-${original.etag.replaceAll('"', '')}.json`;
    await writeFile(new URL(backupName, work), JSON.stringify({ original, backup }, null, 2));
    await put(`subjects/world-history-so/question-types/history/${original.etag.replaceAll('"', '')}.json`, original.value);
    for (const object of staged) await put(object.path, object.value);
    // 取得後に別の編集が行われていたら、全体索引を上書きせず中断する。
    const committed = await request({ action: "put", key: "index.json", value: next, expectedEtag: original.etag });
    assert.ok(committed, "作業中に索引が更新されました。分類表を確認して再実行してください。");
    assert.deepEqual((await read("index.json")).value, next);
    console.log("Cloudflareの分類を登録・全文照合しました。学習履歴版と他科目は維持しています。");
  } else console.log("確認のみです。反映するには --apply を付けてください。");
} finally {
  await wrangler("delete", "--force");
  console.log("作業用の保存窓口を削除しました。");
}
