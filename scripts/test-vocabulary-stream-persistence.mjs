import assert from "node:assert/strict";
import worker, {
  normalizeStudySession as normalizeWorkerSession,
  normalizeSetupPreferences as normalizeWorkerPreferences,
} from "../worker/src/index.js";
import {
  normalizeStudySession as normalizeBrowserSession,
  normalizeSetupPreferences as normalizeBrowserPreferences,
  saveCloudStudyAnswer,
} from "../public/cloud-progress.js";

const tasks = Array.from({ length: 4 }, (_, index) => ({
  termId: `EN-${index + 1}`,
  questionId: `EN-${index + 1}-B01`,
  stage: "beginner",
}));
const previousRecord = {
  streak: 1, attempts: 7, rememberedCount: 4, lastRating: "hard",
  lastAnsweredAt: "2026-10-17T03:00:00.000Z",
  nextReviewAt: "2026-10-18T03:00:00.000Z", everMastered: true,
};
const rows = tasks.map((task, index) => ({
  ...task, answerVisible: index > 0, rating: index > 0 ? "good" : "",
  activityId: index > 0 ? `answer-${index}` : "", previousRecord,
  routineCounted: index > 1,
}));
const session = {
  studyMode: "memorize", vocabularyStreamEnabled: true,
  tasks, currentTask: tasks[0], queue: tasks.slice(1),
  vocabularyStreamRows: rows,
};
for (const normalize of [normalizeBrowserSession, normalizeWorkerSession]) {
  const actual = normalize(session);
  assert.equal(actual.vocabularyStreamEnabled, true);
  assert.equal(actual.selectedStage, "beginner", "3行画面では英単語から意味を答える問題に固定する");
  assert.deepEqual(actual.vocabularyStreamRows, rows.slice(0, 3), "最新の3行と評価前の回答回数を保持する");
  assert.equal(normalize({ tasks }).vocabularyStreamEnabled, undefined, "従来の途中記録の形を維持する");
  assert.deepEqual(normalize({ ...session, studyMode: "listen-answer" }).vocabularyStreamRows, [], "聞き流しに3行画面を適用しない");
  assert.equal(normalize({ tasks, selectedStage: "reverse" }).selectedStage, "reverse", "既存画面の問題の向きは変えない");
  assert.deepEqual(normalize({ ...session, vocabularyStreamRows: [rows[0], rows[0], rows[1]] }).vocabularyStreamRows, [rows[0], rows[0], rows[1]], "同じ問題が再登場した場合も直近3回の表示を残す");
  const invalidRows = [
    { ...rows[0], termId: "different-term" },
    { ...rows[0], questionId: "outside" },
    { ...rows[0], stage: "reverse" },
    rows[1], { ...rows[2], rating: "invalid", activityId: "不正", previousRecord: { lastRating: "invalid" } },
  ];
  const normalizedRows = normalize({ ...session, vocabularyStreamRows: invalidRows }).vocabularyStreamRows;
  assert.deepEqual(normalizedRows, [rows[1], { ...rows[2], rating: "", activityId: "", previousRecord: null }], "対象外の問題・不正値を引き継がない");
}
assert.deepEqual(normalizeBrowserSession(session), normalizeWorkerSession(session), "画面側と保存側で同じ途中記録を扱う");
for (const normalize of [normalizeBrowserPreferences, normalizeWorkerPreferences]) {
  const subjects = normalize({ subjects: {
    "english-vocabulary": { vocabularyStreamEnabled: true },
    "world-history": { vocabularyStreamEnabled: true },
  } }).subjects;
  assert.equal(subjects["english-vocabulary"].vocabularyStreamEnabled, true);
  assert.equal(subjects["world-history"].vocabularyStreamEnabled, false, "英単語のみに設定を保存する");
}

const batches = [];
const queries = [];
let existingEvent = true;
const env = {
  SYNC_TOKEN: "test-key",
  DB: {
    prepare(sql) {
      return {
        sql, values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          queries.push(this);
          return sql.includes("SELECT event_id FROM study_activity_events") && existingEvent
            ? { event_id: "answer-1" }
            : null;
        },
        async all() { return { results: [] }; },
      };
    },
    async batch(statements) { batches.push(statements); return []; },
  },
};
const save = (changes = {}) => worker.fetch(new Request(
  "https://anki-progress-api.example/v1/study-answer/EN-1-B01?dataset=en-test",
  {
    method: "PUT", headers: { Authorization: "Bearer test-key", "Content-Type": "application/json" },
    body: JSON.stringify({
      record: { ...previousRecord, lastRating: "easy" }, session,
      studyMode: "memorize", reviseActivityId: "answer-1", ...changes,
    }),
  },
), env);
assert.equal((await save()).status, 200);
const updated = batches[0].find(({ sql }) => sql.includes("UPDATE study_activity_events SET rating"));
assert.deepEqual(updated.values, ["easy", "answer-1", "en-test", "EN-1-B01"]);
assert.ok(updated.sql.includes("study_mode = 'memorize'"));
assert.ok(queries[0].sql.includes("dataset_version = ? AND question_id = ? AND study_mode = 'memorize'"));
assert.deepEqual(queries[0].values, ["answer-1", "en-test", "EN-1-B01"]);
assert.equal(batches[0].some(({ sql }) => sql.includes("INSERT INTO study_activity_events") || sql.includes("DELETE FROM study_activity_events")), false, "履歴件数と回答日時を変えずに評価を修正する");
const batchCount = batches.length;
existingEvent = false;
assert.equal((await save()).status, 409, "存在しない履歴の修正は拒否する");
existingEvent = true;
for (const change of [
  { reviseActivityId: "" }, { reviseActivityId: "不正" }, { record: null },
  { record: { ...previousRecord, lastRating: null } },
  { studyMode: "listen-answer", session: { ...session, studyMode: "listen-answer" } },
  { deleteActivityId: "other" }, { completeRoundId: "round-1" }, { deleteRoundId: "round-1" },
  { replaceActivityId: "other" },
  { activity: {
    eventId: "answer-2", subjectId: "english-vocabulary", subjectTitle: "英単語",
    deckId: "deck-1", deckTitle: "Deck 1", questionId: "EN-1-B01", studyMode: "memorize",
  } },
]) {
  assert.equal((await save(change)).status, 400, "評価の修正と別の履歴操作を混在させない");
}
assert.equal(batches.length, batchCount, "不正な修正では問題記録と途中記録を書き換えない");

const originalWindow = globalThis.window;
const originalFetch = globalThis.fetch;
try {
  globalThis.window = {
    ANKI_CONFIG: { progressApiBaseUrl: "https://anki-progress-api.example" },
    localStorage: { getItem: () => "test-key" },
  };
  let sent;
  globalThis.fetch = async (_url, options) => {
    sent = JSON.parse(options.body);
    return new Response(JSON.stringify({ ok: true, session }));
  };
  await saveCloudStudyAnswer("en-test", tasks[0].questionId, previousRecord, session, {
    studyMode: "memorize", reviseActivityId: "answer-1",
  });
  assert.equal(sent.reviseActivityId, "answer-1", "画面の評価修正を保存窓口へ送る");
  assert.equal(sent.activity, null);
} finally {
  globalThis.window = originalWindow;
  globalThis.fetch = originalFetch;
}
console.log("英単語3行画面の設定・途中記録・過去の評価修正を確認しました。");
