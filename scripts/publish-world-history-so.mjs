import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadWorldHistorySODecks, worldHistorySODefinition, writeSubjectData } from "./build-learning-data.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "public", "data");
const baseUrl = "https://pub-76ffbe2829114a5cbaa433db45872267.r2.dev";
const subjectId = worldHistorySODefinition.id;
const fetchJson = async (key) => {
  const response = await fetch(`${baseUrl}/${key}?so=${Date.now()}`, {
    headers: { Origin: "https://anki-ume.vercel.app" }, cache: "no-store",
  });
  if (!response.ok) throw new Error(`Cloudflareの${key}を取得できません（${response.status}）。`);
  return response.json();
};
const original = await fetchJson("index.json");
assert.equal(original.schemaVersion, 3);
assert.ok(original.subjects.length > 0);
const source = await loadWorldHistorySODecks();
const entry = await writeSubjectData(worldHistorySODefinition, source.decks);
const index = JSON.parse(await readFile(path.join(output, entry.indexPath), "utf8"));
const previous = original.subjects.find((subject) => subject.id === subjectId);
if (previous) {
  const previousIndex = await fetchJson(previous.indexPath);
  assert.equal(previousIndex.version, index.version, "既存の学習履歴版を維持してください。");
  const currentIds = new Set(source.terms.map((term) => term.id));
  for (const chunk of previousIndex.chunks) {
    const oldChunk = await fetchJson(chunk.path);
    assert.ok(oldChunk.terms.every((term) => currentIds.has(term.id)),
      "既存問題の削除または問題文変更を検出しました。識別番号の移行を先に検討してください。");
  }
}
const subjects = original.subjects.filter((subject) => subject.id !== subjectId);
subjects.splice(subjects.findIndex((subject) => subject.id === "world-history-s") + 1, 0, entry);
const catalog = {
  ...original, subjects,
  version: createHash("sha256").update(JSON.stringify(subjects)).digest("hex").slice(0, 12),
};
assert.deepEqual(catalog.subjects.filter((s) => s.id !== subjectId),
  original.subjects.filter((s) => s.id !== subjectId));
console.log(`世界史SO ${source.terms.length}問、カテゴリ: ${[...new Set(source.terms.map((term) => term.category))].join("、")}`);
console.log(`既存${original.subjects.filter((s) => s.id !== subjectId).length}科目と画像・音声・学習履歴は変更しません。`);
if (!process.argv.includes("--apply")) {
  console.log("予行表示のみです。登録するには --apply を付けてください。");
  process.exit(0);
}
const put = (key) => new Promise((resolve, reject) => {
  assert.ok(key === "index.json" || key.startsWith(`subjects/${subjectId}/`));
  const child = spawn(process.execPath, [
    path.join(root, "node_modules", "wrangler", "bin", "wrangler.js"),
    "r2", "object", "put", `anki-world-history/${key}`,
    "--file", path.join(output, key), "--content-type", key.endsWith(".svg") ? "image/svg+xml" : "application/json; charset=utf-8",
    "--cache-control", "no-cache", "--remote", "--force",
  ], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  child.stdout.on("data", (data) => { log += data; });
  child.stderr.on("data", (data) => { log += data; });
  child.on("error", reject);
  child.on("close", (code) => code === 0 ? resolve() : reject(new Error(log)));
});
const publishAndVerify = async (key) => {
  await put(key);
  assert.deepEqual(await fetchJson(key), JSON.parse(await readFile(path.join(output, key), "utf8")));
  console.log(`登録・照合済み: ${key}`);
};
// 新科目の参照先を先に揃え、現在のCloudflare索引にその科目だけを追加する。
for (const term of source.terms) {
  for (const question of term.stages.beginner) {
    if (!question.questionMap) continue;
    for (const key of [question.questionMap.path, question.questionMap.answerPath].filter(Boolean)) {
      await put(key);
      const response = await fetch(`${baseUrl}/${key}?so=${Date.now()}`, { cache: "no-store" });
      assert.ok(response.ok, "地図をCloudflareから取得できません。");
      assert.equal(await response.text(), await readFile(path.join(output, key), "utf8"));
      console.log(`登録・照合済み: ${key}`);
    }
  }
}
for (const chunk of index.chunks) await publishAndVerify(chunk.path);
await publishAndVerify(entry.indexPath);
assert.deepEqual(await fetchJson("index.json"), original, "作業中に科目一覧が変わりました。再実行してください。");
await writeFile(path.join(output, "index.json"), JSON.stringify(catalog) + "\n");
await publishAndVerify("index.json");
console.log("世界史SOをCloudflareへ反映しました。");
