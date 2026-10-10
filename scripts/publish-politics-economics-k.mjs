import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { loadPoliticsEconomicsK, appendPoliticsKDecks, replacePoliticsKSubject, contentHash, politicsKSubjectId } from "./politics-economics-k.mjs";
import { encodeJsonBindings } from "./japanese-history-k-bindings.js";

// --replace は試作の作り直し用。登録済みのパートを保持せず、手元の原稿全体で科目を置き換える。
const apply = process.argv.includes("--apply"), replace = process.argv.includes("--replace"), additions = await loadPoliticsEconomicsK();
assert.ok(additions.length, "追加する問題原稿がありません。");
const work = new URL("../.wrangler/politics-economics-k/", import.meta.url);
await mkdir(work, { recursive: true });
const configPath = new URL("writer.json", work), token = randomBytes(32).toString("hex");
let endpoint, deployAttempted = false, publishError;
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
  const response = await fetch(`https://pub-76ffbe2829114a5cbaa433db45872267.r2.dev/${key}?politicsK=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(30000) });
  assert.ok(response.ok, `Cloudflareの${key}を取得できません（${response.status}）。`);
  return { value: await response.json(), etag: response.headers.get("etag") };
}
try {
  const prepared = await read("index.json");
  const preparedExisting = prepared.value.subjects.find(subject => subject.id === politicsKSubjectId);
  assert.ok(!replace || preparedExisting, "置き換える政治経済Kが未登録です。--replaceなしで追加してください。");
  const next = replace ? replacePoliticsKSubject(prepared.value, additions, contentHash(preparedExisting)) : appendPoliticsKDecks(prepared.value, additions);
  const nextSubject = next.subjects.find(subject => subject.id === politicsKSubjectId);
  const matchesNew = Boolean(preparedExisting) && contentHash(preparedExisting) === contentHash(nextSubject);
  const newAdditions = replace ? additions : additions.filter(plan => !preparedExisting?.decks.some(deck => deck.id === plan.index.deckId));
  const newObjects = newAdditions.flatMap(plan => plan.objects);
  // 置き換え時は旧パートを引き継がないので、既存の保存内容の照合は行わない（旧データはCloudflareに残る）。
  const previousHashes = {};
  for (const deck of replace ? [] : preparedExisting?.decks ?? []) {
    const previousIndex = (await read(deck.indexPath)).value;
    previousHashes[deck.indexPath] = contentHash(previousIndex);
    for (const chunk of previousIndex.chunks) previousHashes[chunk.path] = contentHash((await read(chunk.path)).value);
  }
  // 追加済みの原稿を再送するときも、公開後の本文編集を上書きしない。
  for (const plan of additions.filter(plan => !newAdditions.includes(plan))) {
    for (const object of plan.objects) assert.deepEqual((await read(object.key)).value, object.value, "登録後の編集を上書きしません。");
  }
  if (apply && !matchesNew) {
    const vars = {
      ACCESS_TOKEN: token,
      ...encodeJsonBindings("ADDITION_JSON", nextSubject),
      ...encodeJsonBindings("OBJECT_HASHES", Object.fromEntries(newObjects.map(object => [object.key, contentHash(object.value)]))),
      ...encodeJsonBindings("PREVIOUS_OBJECT_HASHES", previousHashes),
      // 初回は科目が未登録であることを、以後は確認時の科目と既存パートの維持を保存窓口でも照合する。置き換え時はパートを保持しない。
      PREVIOUS_SUBJECT_HASH: preparedExisting ? contentHash(preparedExisting) : "", PRESERVE_EXISTING_DECKS: preparedExisting && !replace ? "true" : "false",
    };
    assert.ok(Object.keys(vars).length <= 64, "登録設定がCloudflareの変数数の上限を超えています。");
    await writeFile(configPath, JSON.stringify({
      name: "anki-politics-economics-k-import", compatibility_date: "2026-08-20",
      main: fileURLToPath(new URL("politics-economics-k-storage-worker.js", import.meta.url)), workers_dev: true, preview_urls: false,
      vars,
      r2_buckets: [{ binding: "BUCKET", bucket_name: "anki-world-history" }],
    }));
    deployAttempted = true;
    const deployed = await wrangler("deploy");
    endpoint = deployed.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/)?.[0]; assert.ok(endpoint);
  }
  // 作業用窓口の公開直後だけ応答を待つ。登録や索引切替を重複送信しない。
  const original = endpoint ? await request({ action: "read", key: "index.json" }, true) : prepared;
  assert.deepEqual(original.value, prepared.value, "確認後に科目一覧が更新されました。再確認してください。");
  if (matchesNew) {
    console.log("政治経済Kの小見出しは登録済みで一致しています。変更しません。");
  } else {
    if (!preparedExisting) console.log("政治経済Kを新しい科目として追加します。");
    if (replace) console.log(`政治経済Kの登録済み${preparedExisting.decks.length}パート・${preparedExisting.questionCount}問を、手元の原稿全体で置き換えます（履歴版：${newAdditions.map(plan => plan.index.version).join("、")}）。`);
    for (const plan of newAdditions) console.log(`政治経済K：${plan.index.datasetLabel}を${plan.unitCount}用語・${plan.index.questionCount}問（逆向きの説明）で${replace ? "登録" : "追加"}します。`);
    console.log(`全体は${nextSubject.chapterGroups.length}項目・${nextSubject.decks.length}パート・${nextSubject.termCount}用語・${nextSubject.questionCount}問です。他科目と既存の問題・履歴版を維持します。`);
    if (apply) {
      await writeFile(new URL(`before-${original.etag.replace(/[^a-zA-Z0-9-]/g, "")}.json`, work), JSON.stringify(original));
      for (const object of newObjects) {
        await request({ action: "stage", ...object });
        assert.deepEqual((await read(object.key)).value, object.value);
      }
      await request({ action: "commit", key: "index.json", value: next, expectedEtag: original.etag });
      assert.deepEqual((await read("index.json")).value, next);
      for (const [key, hash] of Object.entries(previousHashes)) assert.equal(contentHash((await read(key)).value), hash, "既存問題が変わっています。");
      console.log("Cloudflareへの登録、新規問題の全文照合と既存問題・科目一覧の保持確認が完了しました。");
    } else console.log(`確認のみです。--apply${replace ? " --replace" : ""}でCloudflareへ反映します。`);
  }
} catch (error) {
  publishError = error;
  throw error;
} finally {
  if (deployAttempted) {
    try {
      await wrangler("delete", "--force");
      console.log("作業用保存窓口を削除しました。");
    } catch (error) {
      if (/\[code: 10090\]/.test(error.message)) console.log("作業用保存窓口が存在しないことを確認しました。");
      else if (publishError) console.error("作業用保存窓口の削除に失敗しました。" + error.message);
      else throw error;
    } finally {
      try { await unlink(configPath); }
      catch (error) {
        if (error.code === "ENOENT") { /* すでに削除済み。 */ }
        else if (publishError) console.error("一時設定ファイルの削除に失敗しました。" + error.message);
        else throw error;
      }
    }
  }
}
