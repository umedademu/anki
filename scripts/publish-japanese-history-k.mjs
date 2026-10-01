import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadJapaneseHistoryK, appendJapaneseKSubject, contentHash } from "./japanese-history-k.mjs";

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
async function request(input) {
  const response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(input), signal: AbortSignal.timeout(45000) });
  assert.ok(response.ok, `Cloudflareの${input.action}が失敗しました（${response.status}）。`);
  return response.json();
}
async function read(key) {
  if (endpoint) return request({ action: "read", key });
  const response = await fetch(`https://pub-76ffbe2829114a5cbaa433db45872267.r2.dev/${key}?japaneseK=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(30000) });
  assert.ok(response.ok, `Cloudflareの${key}を取得できません（${response.status}）。`);
  return { value: await response.json(), etag: response.headers.get("etag") };
}
try {
  if (apply) {
    await writeFile(configPath, JSON.stringify({
      name: "anki-japanese-history-k-import", compatibility_date: "2026-08-20",
      main: fileURLToPath(new URL("japanese-history-k-storage-worker.js", import.meta.url)), workers_dev: true, preview_urls: false,
      vars: { ACCESS_TOKEN: token, ADDITION_JSON: JSON.stringify(plan.subject), OBJECT_HASHES: JSON.stringify(Object.fromEntries(plan.objects.map(object => [object.key, contentHash(object.value)]))) },
      r2_buckets: [{ binding: "BUCKET", bucket_name: "anki-world-history" }],
    }));
    deployAttempted = true;
    const deployed = await wrangler("deploy");
    endpoint = deployed.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/)?.[0]; assert.ok(endpoint);
  }
  const original = await read("index.json");
  const existing = original.value.subjects.find(subject => subject.id === plan.subject.id);
  if (existing) {
    assert.deepEqual(existing, plan.subject, "登録済みの日本史Kを上書きしません。");
    for (const object of plan.objects) assert.deepEqual((await read(object.key)).value, object.value, "登録後の編集を上書きしません。");
    console.log("日本史Kは登録済みで一致しています。変更しません。");
  } else {
    const next = appendJapaneseKSubject(original.value, plan.subject);
    console.log(`日本史K：第6章「ＧＨＱの占領政策」${plan.unitCount}学習項目・${plan.terms.length}問を追加します。既存${original.value.subjects.length}科目を維持します。`);
    if (apply) {
      await writeFile(new URL(`before-${original.etag.replace(/[^a-zA-Z0-9-]/g, "")}.json`, work), JSON.stringify(original));
      for (const object of plan.objects) {
        await request({ action: "stage", ...object });
        assert.deepEqual((await read(object.key)).value, object.value);
      }
      await request({ action: "commit", key: "index.json", value: next, expectedEtag: original.etag });
      assert.deepEqual((await read("index.json")).value, next);
      console.log("Cloudflareへの登録、全79問と既存科目一覧の照合が完了しました。");
    } else console.log("確認のみです。--applyでCloudflareへ追加します。");
  }
} finally {
  if (deployAttempted) {
    await wrangler("delete", "--force");
    await unlink(configPath);
    console.log("作業用保存窓口を削除しました。");
  }
}
