import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { importSOBookFiles, readSOBookFiles } from "./world-history-so-book.mjs";

// 逆向きの問題文の書き換え記録を、Cloudflare上の世界史SOへ反映する。問題番号・履歴版は変えない。
const apply = process.argv.includes("--apply");
const work = new URL("../.wrangler/so-prompts/", import.meta.url);
await mkdir(work, { recursive: true });
const { revisions } = JSON.parse(await readFile(new URL("../data/source/world-history-so/reverse-prompt-revisions.json", import.meta.url), "utf8"));
const contents = await readFile(new URL("../data/source/world-history-so/sekai_shi_tankyu_mokuji.md", import.meta.url), "utf8");
const imported = importSOBookFiles(await readSOBookFiles(fileURLToPath(new URL("../data/source/world-history-so/book/", import.meta.url))), contents);
const csvQuestions = new Map(imported.flatMap(deck => deck.terms.map(term => {
  const question = term.stages.beginner[0];
  return [`${deck.sourceFile}|${question.source.originalQuestionId}`, question];
})));
const targets = new Map(revisions.map(revision => {
  const question = csvQuestions.get(`${revision.file}|${revision.questionId}`);
  assert.ok(question, `CSVにない問題です: ${revision.file} ${revision.questionId}`);
  assert.equal(question.prompt, revision.after, `CSVの問題文が書き換え記録と異なります: ${question.id}`);
  assert.notEqual(revision.before, revision.after);
  return [question.id, revision];
}));
assert.equal(targets.size, revisions.length, "書き換え記録の問題番号が重複しています。");

const prefix = "subjects/world-history-so/prompt-revisions/";
const configPath = new URL("writer.json", work);
const token = randomBytes(32).toString("hex");
await writeFile(configPath, JSON.stringify({ name: "anki-so-prompt-revision", compatibility_date: "2026-08-20",
  main: fileURLToPath(new URL("so-classification-storage-worker.js", import.meta.url)),
  workers_dev: true, preview_urls: false, vars: { ACCESS_TOKEN: token, WRITE_PREFIX: prefix },
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
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(input), signal: AbortSignal.timeout(60000) });
    if (input.action === "read" && [404, 429, 500, 502, 503, 504].includes(response.status) && attempt < 5) {
      await response.arrayBuffer(); await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1))); continue;
    }
    assert.ok(response.ok, `Cloudflareの${input.action}に失敗しました（${response.status}）。`);
    return response.json();
  }
}
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
const read = (key) => request({ action: "read", key });
async function put(key, value) {
  assert.ok(key.startsWith(prefix));
  await request({ action: "put", key, value });
  assert.deepEqual((await read(key)).value, value);
}
try {
  const original = await read("index.json");
  const next = structuredClone(original.value);
  const subject = next.subjects.find(item => item.id === "world-history-so");
  assert.ok(subject?.decks?.length);
  const found = new Set(), staged = [], backup = [], conflicts = [];
  let changed = 0, already = 0, changedDecks = 0;
  for (const entry of subject.decks) {
    const { value: index } = await read(entry.indexPath);
    const chunks = await Promise.all(index.chunks.map(async chunk => (await read(chunk.path)).value));
    const before = structuredClone(chunks);
    backup.push({ entry: structuredClone(entry), index: structuredClone(index), chunks: before });
    let deckChanged = false;
    for (const chunk of chunks) for (const term of chunk.terms) for (const questions of Object.values(term.stages)) for (const question of questions) {
      const revision = targets.get(question.id);
      if (!revision) continue;
      assert.ok(!found.has(question.id), `問題番号が重複しています: ${question.id}`);
      found.add(question.id);
      if (question.prompt === revision.after) already++;
      else if (question.prompt === revision.before) { question.prompt = revision.after; changed++; deckChanged = true; }
      // 問題編集画面などで直された問題文は上書きしない。
      else conflicts.push({ id: question.id, live: question.prompt, before: revision.before, after: revision.after });
    }
    if (!deckChanged) continue;
    // 問題文以外は一切変更しない。
    const restored = structuredClone(chunks);
    restored.forEach((chunk, ci) => chunk.terms.forEach((term, ti) => {
      for (const [stage, questions] of Object.entries(term.stages)) questions.forEach((question, qi) => {
        question.prompt = before[ci].terms[ti].stages[stage][qi].prompt;
      });
    }));
    assert.deepEqual(restored, before);
    const contentVersion = hash(chunks);
    const deckPrefix = `${prefix}${contentVersion}/${entry.id}`;
    const oldIndexPath = entry.indexPath;
    index.chunks = index.chunks.map((chunk, i) => {
      const path = `${deckPrefix}/chunks/${String(i + 1).padStart(4, "0")}.json`;
      staged.push({ path, value: chunks[i] });
      return { ...chunk, path };
    });
    index.contentVersion = contentVersion;
    entry.contentVersion = contentVersion;
    entry.indexPath = `${deckPrefix}/index.json`;
    if (subject.indexPath === oldIndexPath) subject.indexPath = entry.indexPath;
    staged.push({ path: entry.indexPath, value: index });
    assert.equal(index.version, backup.at(-1).index.version);
    changedDecks++;
  }
  const missing = [...targets.keys()].filter(id => !found.has(id));
  next.version = hash(next.subjects);
  assert.deepEqual(next.subjects.filter(s => s.id !== subject.id), original.value.subjects.filter(s => s.id !== subject.id));
  await writeFile(new URL("report.json", work), JSON.stringify({ changed, already, changedDecks, conflicts, missing }, null, 2) + "\n");
  console.log(`書き換え${changed}問（${changedDecks}パート）、反映済み${already}問、編集済みのため保留${conflicts.length}問、Cloudflareにない問題${missing.length}問。`);
  assert.equal(missing.length, 0, "Cloudflare上に見つからない問題があります。.wrangler/so-prompts/report.json を確認してください。");
  if (!changed) {
    console.log("すべて反映済みです。変更はありません。");
  } else if (apply) {
    const etag = original.etag.replaceAll('"', "");
    await writeFile(new URL(`before-${etag}.json`, work), JSON.stringify({ original, backup }));
    await put(`${prefix}history/${etag}.json`, original.value);
    for (const object of staged) await put(object.path, object.value);
    // 取得後に別の編集が行われていたら、全体索引を上書きせず中断する。
    await request({ action: "put", key: "index.json", value: next, expectedEtag: original.etag });
    assert.deepEqual((await read("index.json")).value, next);
    console.log("Cloudflareの問題文を登録・全文照合しました。問題番号・学習履歴版・他科目は維持しています。");
  } else console.log("確認のみです。反映するには --apply を付けてください。");
} finally {
  await wrangler("delete", "--force");
  console.log("作業用の保存窓口を削除しました。");
}
