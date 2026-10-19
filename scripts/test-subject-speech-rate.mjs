import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { runInNewContext } from "node:vm";
import { getSubjectSpeechSettings, normalizeSubjectSpeechRate } from "../public/speech-settings.js";
import { normalizeSetupPreferences } from "../public/cloud-progress.js";
import worker, { normalizeSetupPreferences as normalizeWorkerPreferences } from "../worker/src/index.js";

const preferences = {
  lastSubjectId: "history",
  subjects: {
    history: { speechRate: "1.75", selectedDeckIds: ["deck-2"], reviewSettings: { againSeconds: 30, hardSeconds: 60, goodSeconds: 300, easySeconds: 600 } },
    english: { speechRate: 0.8 },
    mindset: { speechRate: 2.5 },
    old: { studyMode: "listen-answer" },
  },
};
const normalized = normalizeSetupPreferences(preferences);
assert.deepEqual(normalizeWorkerPreferences(preferences), normalized);
assert.deepEqual(normalizeWorkerPreferences(JSON.stringify(normalized)), normalized);
assert.equal(normalized.subjects.old.speechRate, null);
assert.equal(normalized.subjects.history.speechRate, 1.75);
assert.deepEqual(normalized.subjects.history.selectedDeckIds, ["deck-2"]);
assert.equal(normalized.subjects.history.reviewSettings.goodSeconds, 300);
for (const value of [undefined, null, "", "invalid", true, {}, [], NaN, Infinity]) {
  assert.equal(normalizeSubjectSpeechRate(value), null);
}
assert.equal(normalizeSubjectSpeechRate(20), 3);
assert.equal(normalizeSubjectSpeechRate(0), 0.7);
const shared = { source: "device", rate: 1.35, voiceId: "voice", setupPreferences: normalized };
for (const [id, rate] of [["history", 1.75], ["english", 0.8], ["mindset", 2.5], ["old", 1.35], ["missing", 1.35]]) {
  const settings = getSubjectSpeechSettings(shared, id);
  assert.equal(settings.rate, rate);
  assert.equal(settings.source, "device");
  assert.equal(settings.voiceId, "voice");
}
assert.equal(shared.rate, 1.35);

// アプリが科目を切り替えるたびに、読み上げと評価音へ渡す実際の速度を確かめる。
const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const state = { activeSubjectId: "history", setupPreferences: normalized };
let original = null;
const load = runInNewContext(app.slice(app.indexOf("function loadSpeechSettings() {"), app.indexOf("function saveSpeechSettings(settings) {")) + "\nloadSpeechSettings;", {
  state, originalSettings: () => original, loadStoredSpeechSettings: () => shared, getSubjectSpeechSettings,
});
assert.equal(load().rate, 1.75);
state.activeSubjectId = "english";
assert.equal(load().rate, 0.8);
state.activeSubjectId = "old";
assert.equal(load().rate, 1.35);
state.activeSubjectId = "original";
original = { rate: 1.2, setupPreferences: { subjects: { original: { speechRate: 2.1 } } } };
assert.equal(load().rate, 2.1);
original = null;
assert.equal(load().rate, 1.35);

// 本番の保存処理を一時的なデータベースへ通し、別の読込でも速度が戻ることを確かめる。
const db = new DatabaseSync(":memory:");
try {
  const migrations = new URL("../worker/migrations/", import.meta.url);
  for (const name of (await readdir(migrations)).filter(name => name.endsWith(".sql")).sort()) {
    db.exec(await readFile(new URL(name, migrations), "utf8"));
  }
  const env = { SYNC_TOKEN: "rate-test", ALLOWED_ORIGIN: "https://test.invalid", DB: {
    prepare(sql) {
      let values = [];
      return { bind(...args) { values = args; return this; },
        async first() { return db.prepare(sql).get(...values) ?? null; },
        async all() { return { results: db.prepare(sql).all(...values) }; },
        async run() { db.prepare(sql).run(...values); return { success: true }; },
      };
    },
  } };
  const request = async (route, patch) => {
    const response = await worker.fetch(new Request(`https://test.invalid/v1/${route}`, {
      method: patch ? "PATCH" : "GET", headers: { Authorization: "Bearer rate-test", "Content-Type": "application/json" },
      ...(patch ? { body: JSON.stringify(patch) } : {}),
    }), env);
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    return result.settings;
  };
  await request("settings", { rate: 1.35, setupPreferences: normalized });
  const restored = await request("state");
  assert.deepEqual(restored.setupPreferences, normalized);
  assert.equal(getSubjectSpeechSettings(restored, "english").rate, 0.8);
  await request("settings", { voiceId: "changed-voice" });
  const afterVoiceChange = await request("state");
  assert.equal(afterVoiceChange.setupPreferences.subjects.history.speechRate, 1.75);
  assert.equal(afterVoiceChange.rate, 1.35);
} finally { db.close(); }
console.log("科目別の速度を検証完了: 共通速度の引継ぎ・科目切替・実際の保存処理と再読込・範囲補正・オリジナルの分離を確認");
