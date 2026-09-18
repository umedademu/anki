import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { atlas, byPlaceId, findMapPlaces } from "./world-history-so-atlas.mjs";
import { renderAnswerMap, buildSOAnswerVisuals } from "./world-history-so-answer-visuals.mjs";
import { parseAnswerVisuals } from "../public/answer-visuals.js";
import storage from "./so-answer-visuals-storage-worker.js";

const base = await readFile(new URL("../data/source/world-history-so/answer-visuals/base-map.svg", import.meta.url), "utf8");
assert.equal(atlas.length, byPlaceId.size, "地名の識別番号は重複しない");
for (const place of atlas) {
  assert.ok(place.point[0] >= -18 && place.point[0] <= 122 && place.point[1] >= -26 && place.point[1] <= 55, place.name);
  for (const id of place.context) assert.ok(byPlaceId.has(id), id);
  const { svg } = renderAnswerMap(base, { focus: [place.id], context: place.context.slice(0,4) });
  assert.match(svg, /viewBox="0 0 1000 650"/);
  assert.ok(!/<script|<foreignObject|\son\w+=|(?:href|src)=/i.test(svg));
}
const find = (prompt, answer = "", id = "WHSO-test") => findMapPlaces({ id, prompt, answer }, "deck-3").focus;
assert.ok(find("後ウマイヤ朝の都は？", "コルドバ").includes("cordoba-state"));
assert.ok(!find("後ウマイヤ朝の都は？", "コルドバ").includes("umayyad"));
assert.ok(!find("マンサブダール制とは？", "官位制度").includes("buda"));
assert.ok(!find("神聖ローマ皇帝とハプスブルク家").includes("rome"));
assert.ok(!find("古代インドのヴァルナ制", "クシャトリヤ", "WHSO-ee8f4f-B01").includes("varna"));
assert.ok(find("ホラズム＝シャー朝", "", "WHSO-8af8aa-B01").includes("khorasan"));
assert.ok(find("3ハン国とは？", "", "WHSO-6af0a1-B01").includes("kokand"));
assert.ok(byPlaceId.get("khwarazm").point[1] > byPlaceId.get("khorasan").point[1], "ホラズムはホラーサーンより北");
const question = { id: "WHSO-sample", prompt: "ホラーサーン地方は？", answer: "イラン北東部" };
const snapshot = { decks: [{ entry: { id: "deck-3" }, chunks: [{ terms: [{ stages: { beginner: [question] } }, { stages: { beginner: [{ id: "map-question", questionMap: { path: "existing.svg" } }] } }] }] }] };
const result = buildSOAnswerVisuals(snapshot, { assets: [] }, base);
assert.equal(result.manifest.questionCount, 2);
assert.equal(result.assets.size, 1);
assert.equal(parseAnswerVisuals(result.manifest).get("map-question").existingQuestionMap, true);
const invalid = structuredClone(result.manifest); invalid.assignments[0].map.path = "https://example.org/map.svg";
assert.throws(() => parseAnswerVisuals(invalid));
invalid.assignments = [result.manifest.assignments[0], result.manifest.assignments[0]];
assert.throws(() => parseAnswerVisuals(invalid), /番号/);

// 保存窓口に問題集や他科目を書かせず、同時更新時には地図一覧を切り替えない。
const calls = [], env = { ACCESS_TOKEN: "test", BUCKET: { head: async () => ({ etag: "new" }), get: async () => null, put: async (...args) => { calls.push(args); return { etag: "saved" }; } } };
const send = (input, token = "test") => storage.fetch(new Request("https://example.org/", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(input) }), env);
assert.equal((await send({ action: "read", key: "index.json" }, "wrong")).status, 401);
assert.equal((await send({ action: "map", key: "index.json", text: "{}" })).status, 403);
assert.equal((await send({ action: "map", key: "subjects/world-history/map.svg", text: "<svg/>" })).status, 403);
assert.equal((await send({ action: "commit", key: "subjects/world-history-so/answer-visuals/index.json", expectedEtag: null, catalogEtag: "old", imagesEtag: "new", text: JSON.stringify(result.manifest) })).status, 409);
assert.equal(calls.length, 0);
console.log(`解答地図確認完了：${atlas.length}地点・ラベル配置・同名語の区別・既存地図・保存範囲・同時更新の拒否`);
