import assert from "node:assert/strict";
import worker from "../worker/src/index.js";

const batches = [];
const env = {
  SYNC_TOKEN: "test-key", ALLOWED_ORIGIN: "https://test.invalid",
  DB: {
    prepare(sql) {
      return { sql, values: [], bind(...values) { this.values = values; return this; },
        async all() { return { results: [] }; }, async first() { return null; } };
    },
    async batch(statements) { batches.push(statements); return []; },
  },
};
const dataset = "original-00000000-0000-0000-0000-000000000000";
async function save(studyMode, seconds = 12, version = dataset, key = "test-key") {
  return worker.fetch(new Request(`https://test.invalid/v1/study-time/event-${studyMode}?dataset=${version}`, {
    method: "PUT", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ session: null, timeEntry: {
      subjectId: "original", subjectTitle: "オリジナル", deckId: "deck-1", deckTitle: "今回の問題",
      questionId: "question-1", studyMode, studySeconds: seconds,
    } }),
  }), env);
}
for (const mode of ["memorize", "listen-answer"]) {
  const response = await save(mode);
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  assert.equal((await response.json()).session, null);
  const statements = batches.at(-1);
  assert.equal(statements.length, 1);
  assert.match(statements[0].sql, /INSERT INTO study_time_events/);
  assert.match(statements[0].sql, /MAX\(study_time_events.study_seconds, excluded.study_seconds\)/);
  assert.equal(statements[0].values[3], "original");
  assert.equal(statements[0].values[8], mode);
  assert.equal(statements[0].values[10], 12);
}
const savedCount = batches.length;
assert.equal((await save("memorize", 31)).status, 400);
assert.equal((await save("memorize", 12, "normal-deck")).status, 400);
assert.equal((await save("memorize", 12, dataset, "wrong-key")).status, 401);
assert.equal(batches.length, savedCount);
console.log("オリジナル時間保存検証完了: 暗記・聞き流し・時間のみ保存・再送時の重複防止・上限・認証を確認");
