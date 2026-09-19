import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const apply = process.argv.includes("--apply");
const work = new URL("../.wrangler/funda/", import.meta.url);
await mkdir(work, { recursive: true });
const configPath = new URL("writer.json", work), token = randomBytes(32).toString("hex");
let endpoint;
const subjectId = "funda", deckId = "deck-01", version = "funda-v1";
const prompt = "FOMC（連邦公開市場委員会）は、どのくらいの頻度で開催されるか。";
const answer = "原則年8回、約1か月半に1回。";
const contentVersion = createHash("sha256").update(JSON.stringify({ prompt, answer })).digest("hex").slice(0, 20);
const prefix = `subjects/funda/imports/${contentVersion}`;
const datasetLabel = "ファンダ｜一問一答";
const term = {
  id: "FUNDA-0001", datasetLabel, importanceRank: 1, difficultyLabel: "一問一答",
  term: prompt, reading: "", aliases: [], category: "金融政策", era: "",
  geography: { macroRegion: "", macroRegions: [], regionDetail: "" },
  chronology: { displayPeriod: "", sortYear: 1 },
  stages: { beginner: [{ id: "FUNDA-0001-B01", stage: "beginner", focus: "一問一答",
    type: "short_answer", label: "一問一答", prompt, answer, explanation: "",
    keywords: [], acceptedAnswers: [], answerNote: "", yearMnemonic: "",
    source: { name: "利用者指定", url: "" }, hideTermUntilAnswer: true }], reverse: [], integrated: [] },
};
const entry = { id: deckId, number: 1, datasetLabel, difficultyLabel: "一問一答", version, contentVersion,
  termCount: 1, questionCount: 1, indexPath: `${prefix}/index.json` };
const common = { id: subjectId, title: "ファンダ", description: "金融・経済の一問一答", learningType: "cards", termUnitLabel: "問" };
const subject = { ...common, datasetLabel, termCount: 1, questionCount: 1, indexPath: entry.indexPath, defaultDeckId: deckId, decks: [entry] };
const chunkPath = `${prefix}/chunks/0001.json`;
const index = { ...common, schemaVersion: 3, simpleQuestions: true, filterLabels: { category: "カテゴリ" },
  stageLabels: { all: "すべての問題", beginner: "一問一答" }, availableStages: ["beginner"],
  deckId, deckNumber: 1, datasetLabel, difficultyLabel: "一問一答", version, contentVersion,
  sourceFile: "利用者指定", termCount: 1, questionCount: 1, questionCounts: { beginner: 1, reverse: 0, integrated: 0 }, masteryTarget: 2,
  chunks: [{ number: 1, path: chunkPath, count: 1, firstTerm: prompt, lastTerm: prompt }] };
const staged = [
  { key: chunkPath, value: { schemaVersion: 3, subjectId, deckId, chunkNumber: 1, terms: [term] } },
  { key: entry.indexPath, value: index },
];
async function wrangler(...args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url)), ...args, "--config", fileURLToPath(configPath)], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", p => output += p); child.stderr.on("data", p => output += p);
    child.on("error", reject); child.on("close", code => code === 0 ? resolve(output) : reject(new Error(output.replaceAll(token, "[非公開]"))));
  });
}
async function request(input) {
  const response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(input), signal: AbortSignal.timeout(45000) });
  assert.ok(response.ok, `Cloudflareの${input.action}が失敗しました（${response.status}）。`);
  return response.json();
}
async function read(key) {
  if (endpoint) return request({ action: "read", key });
  const response = await fetch(`https://pub-76ffbe2829114a5cbaa433db45872267.r2.dev/${key}?funda=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(30000) });
  assert.ok(response.ok, `Cloudflareの${key}を取得できません（${response.status}）。`);
  return { value: await response.json(), etag: response.headers.get("etag") };
}
try {
  if (apply) {
    await writeFile(configPath, JSON.stringify({ name: "anki-funda-import", compatibility_date: "2026-08-20", main: fileURLToPath(new URL("funda-storage-worker.js", import.meta.url)), workers_dev: true, preview_urls: false, vars: { ACCESS_TOKEN: token }, r2_buckets: [{ binding: "BUCKET", bucket_name: "anki-world-history" }] }));
    const deployed = await wrangler("deploy");
    endpoint = deployed.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/)?.[0]; assert.ok(endpoint);
  }
  const original = await read("index.json");
  assert.equal(original.value.schemaVersion, 3);
  const existing = original.value.subjects.find(s => s.id === subjectId);
  if (existing) {
    assert.deepEqual(existing, subject, "登録済みの科目は上書きしません。");
    for (const object of staged) assert.deepEqual((await read(object.key)).value, object.value, "登録後の編集は上書きしません。");
    console.log("ファンダ1問は登録済みで一致しています。変更しません。");
  } else {
    const next = structuredClone(original.value);
    next.subjects.push(subject);
    next.version = createHash("sha256").update(JSON.stringify(next.subjects)).digest("hex").slice(0, 20);
    assert.deepEqual(next.subjects.filter(s => s.id !== subjectId), original.value.subjects);
    console.log(`ファンダ1問を追加。既存${original.value.subjects.length}科目は維持します。`);
    if (apply) {
      await writeFile(new URL(`before-${original.etag}.json`, work), JSON.stringify(original));
      for (const object of staged) {
        await request({ action: "stage", ...object });
        assert.deepEqual((await read(object.key)).value, object.value);
      }
      await request({ action: "commit", key: "index.json", value: next, expectedEtag: original.etag });
      assert.deepEqual((await read("index.json")).value, next);
      console.log("Cloudflareへの登録と問題・回答・既存科目一覧の照合が完了しました。");
    } else console.log("確認のみです。--apply でCloudflareへ追加します。");
  }
} finally {
  if (endpoint) { await wrangler("delete", "--force"); await unlink(configPath); console.log("作業用保存窓口を削除しました。"); }
}
