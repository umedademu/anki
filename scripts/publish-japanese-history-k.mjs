import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { loadJapaneseHistoryK, appendJapaneseKSubject, replaceJapaneseKSubject, japaneseKPreviousSubjectHash, contentHash } from "./japanese-history-k.mjs";

const apply = process.argv.includes("--apply"), plan = await loadJapaneseHistoryK();
const work = new URL("../.wrangler/japanese-history-k/", import.meta.url);
await mkdir(work, { recursive: true });
const configPath = new URL("writer.json", work), token = randomBytes(32).toString("hex");
let endpoint, deployAttempted = false;
async function wrangler(...args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url)), ...args, "--config", fileURLToPath(configPath)], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", part => output += part); child.stderr.on("data", part => output += part);
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve(output) : reject(new Error(output.replaceAll(token, "[非公開]"))));
  });
}
async function request(input, waitForDeployment = false) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(input), signal: AbortSignal.timeout(45000) });
    if (waitForDeployment && [404, 502, 503].includes(response.status) && attempt < 5) {
      await response.arrayBuffer();
      await delay(Math.min(2000 * (attempt + 1), 8000));
      continue;
    }
    assert.ok(response.ok, `Cloudflareの${input.action}（${input.key}）が失敗しました（${response.status}）。`);
    return response.json();
  }
}
async function read(key) {
  if (endpoint) return request({ action: "read", key });
  const response = await fetch(`https://pub-76ffbe2829114a5cbaa433db45872267.r2.dev/${key}?japaneseK=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(30000) });
  assert.ok(response.ok, `Cloudflareの${key}を取得できません（${response.status}）。`);
  return { value: await response.json(), etag: response.headers.get("etag") };
}
try {
  const prepared = await read("index.json");
  const preparedExisting = prepared.value.subjects.find(subject => subject.id === plan.subject.id);
  const matchesNew = preparedExisting && contentHash(preparedExisting) === contentHash(plan.subject);
  const previousHashes = {};
  if (preparedExisting && !matchesNew) {
    assert.equal(contentHash(preparedExisting), japaneseKPreviousSubjectHash, "確認済みの試作以外は上書きしません。日本史Kに別の編集があります。");
    const previousIndex = (await read(preparedExisting.indexPath)).value;
    previousHashes[preparedExisting.indexPath] = contentHash(previousIndex);
    for (const chunk of previousIndex.chunks) previousHashes[chunk.path] = contentHash((await read(chunk.path)).value);
  }
  if (apply && !matchesNew) {
    await writeFile(configPath, JSON.stringify({
      name: "anki-japanese-history-k-import", compatibility_date: "2026-08-20",
      main: fileURLToPath(new URL("japanese-history-k-storage-worker.js", import.meta.url)), workers_dev: true, preview_urls: false,
      vars: { ACCESS_TOKEN: token, ADDITION_JSON: JSON.stringify(plan.subject), OBJECT_HASHES: JSON.stringify(Object.fromEntries(plan.objects.map(object => [object.key, contentHash(object.value)]))),
        PREVIOUS_SUBJECT_HASH: preparedExisting ? japaneseKPreviousSubjectHash : "", PREVIOUS_OBJECT_HASHES: JSON.stringify(previousHashes) },
      r2_buckets: [{ binding: "BUCKET", bucket_name: "anki-world-history" }],
    }));
    deployAttempted = true;
    const deployed = await wrangler("deploy");
    endpoint = deployed.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/)?.[0]; assert.ok(endpoint);
  }
  // 作業用窓口の公開直後だけ応答を待つ。登録や索引切替を重複送信しない。
  const original = endpoint ? await request({ action: "read", key: "index.json" }, true) : prepared;
  const existing = original.value.subjects.find(subject => subject.id === plan.subject.id);
  if (existing && contentHash(existing) === contentHash(plan.subject)) {
    assert.deepEqual(existing, plan.subject, "登録済みの日本史Kを上書きしません。");
    for (const object of plan.objects) assert.deepEqual((await read(object.key)).value, object.value, "登録後の編集を上書きしません。");
    console.log("日本史Kは登録済みで一致しています。変更しません。");
  } else {
    const next = existing ? replaceJapaneseKSubject(original.value, plan.subject) : appendJapaneseKSubject(original.value, plan.subject);
    console.log(`日本史K：第6章「ＧＨＱの占領政策」を${plan.unitCount}学習項目・${plan.index.questionCount}問（基礎${plan.index.questionCounts.beginner}・逆向き${plan.index.questionCounts.reverse}・統合${plan.index.questionCounts.integrated}）へ${existing ? "置換" : "追加"}します。他科目と旧データ・旧履歴は維持します。`);
    if (apply) {
      await writeFile(new URL(`before-${original.etag.replace(/[^a-zA-Z0-9-]/g, "")}.json`, work), JSON.stringify(original));
      for (const object of plan.objects) {
        await request({ action: "stage", ...object });
        assert.deepEqual((await read(object.key)).value, object.value);
      }
      await request({ action: "commit", key: "index.json", value: next, expectedEtag: original.etag });
      assert.deepEqual((await read("index.json")).value, next);
      console.log(`Cloudflareへの登録、全${plan.index.questionCount}問と既存科目一覧の照合が完了しました。新しい履歴版で三段階学習を開始します。`);
    } else console.log("確認のみです。--applyでCloudflareへ反映します。");
  }
} finally {
  if (deployAttempted) {
    await wrangler("delete", "--force");
    await unlink(configPath);
    console.log("作業用保存窓口を削除しました。");
  }
}
