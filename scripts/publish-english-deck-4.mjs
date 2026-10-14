import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { loadEnglishDeck4, appendEnglishDeck4, checkEnglishDeck4Overlap, contentHash, englishSubjectId } from "./english-deck-4.mjs";
import { encodeJsonBindings } from "./japanese-history-k-bindings.js";

const apply = process.argv.includes("--apply"), plan = await loadEnglishDeck4();
const work = new URL("../.wrangler/english-deck-4-check/", import.meta.url);
await mkdir(work, { recursive: true });
const configPath = new URL("writer.json", work), token = randomBytes(32).toString("hex");
let endpoint, deployAttempted = false, publishError;
async function wrangler(...args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url)), ...args, "--config", fileURLToPath(configPath)], { stdio: ["ignore", "pipe", "pipe"] });
    let output = ""; child.stdout.on("data", part => output += part); child.stderr.on("data", part => output += part);
    child.on("error", reject); child.on("close", code => code === 0 ? resolve(output) : reject(new Error(output.replaceAll(token, "[非公開]"))));
  });
}
async function request(input, wait = false) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(input), signal: AbortSignal.timeout(45000) });
    if (wait && [404, 502, 503].includes(response.status) && attempt < 5) { await response.arrayBuffer(); await delay(Math.min(2000 * (attempt + 1), 8000)); continue; }
    assert.ok(response.ok, `Cloudflareの${input.action}に失敗しました（${response.status}）。`);
    return response.json();
  }
}
async function read(key) {
  if (endpoint) return request({ action: "read", key });
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`https://pub-76ffbe2829114a5cbaa433db45872267.r2.dev/${key}?english4=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(30000) });
    if ([429, 503].includes(response.status) && attempt < 4) { await response.arrayBuffer(); await delay(2000 * (attempt + 1)); continue; }
    assert.ok(response.ok, `Cloudflareの${key}を取得できません（${response.status}）。`);
    return { value: await response.json(), etag: response.headers.get("etag") };
  }
}
try {
  const prepared = await read("index.json"), next = appendEnglishDeck4(prepared.value, plan);
  const subject = prepared.value.subjects.find(item => item.id === englishSubjectId), nextSubject = next.subjects.find(item => item.id === englishSubjectId);
  const previousHashes = {}, existingTerms = [];
  for (const deck of subject.decks.filter(item => item.id !== "deck-4")) {
    const index = (await read(deck.indexPath)).value; previousHashes[deck.indexPath] = contentHash(index);
    for (const chunk of index.chunks) {
      const value = (await read(chunk.path)).value; previousHashes[chunk.path] = contentHash(value); existingTerms.push(...value.terms);
    }
  }
  checkEnglishDeck4Overlap(existingTerms, plan);
  if (subject.decks.some(deck => deck.id === "deck-4")) {
    for (const object of plan.objects) assert.deepEqual((await read(object.key)).value, object.value, "登録後の本文編集を上書きしません。");
    console.log("英単語Deck 4は登録済みで全文が一致しています。変更しません。");
  } else if (!apply) {
    console.log(`Deck 4：500語・1500問を追加します。既存${existingTerms.length}語との単語・番号の重複はありません。`);
    console.log(`英単語全体：${nextSubject.termCount}語・${nextSubject.questionCount}問。Deck 1〜3・他科目・画像・音声・学習記録は維持します。`);
    console.log("確認のみです。--applyでCloudflareへ反映します。");
  } else {
    const vars = { ACCESS_TOKEN: token, PREVIOUS_SUBJECT_HASH: contentHash(subject), ...encodeJsonBindings("ADDITION_JSON", nextSubject),
      ...encodeJsonBindings("OBJECT_HASHES", Object.fromEntries(plan.objects.map(object => [object.key, contentHash(object.value)]))), ...encodeJsonBindings("PREVIOUS_OBJECT_HASHES", previousHashes) };
    assert.ok(Object.keys(vars).length <= 64);
    await writeFile(configPath, JSON.stringify({ name: "anki-english-deck-4-import", compatibility_date: "2026-08-20",
      main: fileURLToPath(new URL("english-deck-4-storage-worker.js", import.meta.url)), workers_dev: true, preview_urls: false,
      vars, r2_buckets: [{ binding: "BUCKET", bucket_name: "anki-world-history" }] }));
    deployAttempted = true;
    const deployed = await wrangler("deploy"); endpoint = deployed.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/)?.[0]; assert.ok(endpoint);
    const original = await request({ action: "read", key: "index.json" }, true);
    assert.deepEqual(original.value, prepared.value, "確認後に科目一覧が更新されました。再確認してください。");
    await writeFile(new URL(`before-${original.etag.replace(/[^a-zA-Z0-9-]/g, "")}.json`, work), JSON.stringify(original));
    for (const [position, object] of plan.objects.entries()) {
      await request({ action: "stage", ...object }); assert.deepEqual((await read(object.key)).value, object.value);
      console.log(`新規データの登録・全文照合：${position + 1}/${plan.objects.length}`);
    }
    await request({ action: "commit", key: "index.json", value: next, expectedEtag: original.etag });
    assert.deepEqual((await read("index.json")).value, next);
    for (const [key, hash] of Object.entries(previousHashes)) assert.equal(contentHash((await read(key)).value), hash, "既存の問題が変わっています。");
    console.log("Deck 4のCloudflare登録、全1500問の照合と既存Deck 1〜3・他科目の保持確認が完了しました。");
  }
} catch (error) { publishError = error; throw error; }
finally {
  if (deployAttempted) {
    try { await wrangler("delete", "--force"); console.log("作業用保存窓口を削除しました。"); }
    catch (error) { if (/\[code: 10090\]/.test(error.message)) console.log("作業用保存窓口が存在しないことを確認しました。"); else if (publishError) console.error("作業用保存窓口の削除に失敗しました。" + error.message); else throw error; }
    finally { try { await unlink(configPath); } catch (error) { if (error.code !== "ENOENT") { if (publishError) console.error("一時設定の削除に失敗しました。" + error.message); else throw error; } } }
  }
}
