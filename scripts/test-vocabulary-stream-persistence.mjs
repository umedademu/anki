import assert from "node:assert/strict";
import worker, {
  normalizeStudySession as normalizeWorkerSession,
  normalizeSetupPreferences as normalizeWorkerPreferences,
} from "../worker/src/index.js";
import {
  normalizeStudySession as normalizeBrowserSession,
  normalizeSetupPreferences as normalizeBrowserPreferences,
  saveCloudStudyAnswer,
  switchStudySessionMode,
} from "../public/cloud-progress.js";

const tasks = Array.from({ length: 13 }, (_, index) => ({
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
  answeredAt: index > 0 ? "2026-10-19T00:00:00.000Z" : null,
  routineCounted: index > 1,
}));
const session = {
  studyMode: "memorize", vocabularyStreamEnabled: true,
  tasks, currentTask: tasks[0], queue: tasks.slice(1),
  vocabularyStreamRows: rows,
};
const analysis = {
  term: " word ", question: " word ",
  dimensions: [{ key: " category ", label: " 品詞 ", values: [" 名詞 ", "名詞"] }],
};
const normalizedAnalysis = {
  term: "word", question: "word",
  dimensions: [{ key: "category", label: "品詞", values: ["名詞"] }],
};
for (const normalize of [normalizeBrowserSession, normalizeWorkerSession]) {
  const actual = normalize(session);
  assert.equal(actual.vocabularyStreamEnabled, true);
  assert.equal(actual.selectedStage, "beginner", "3行画面では英単語から意味を答える問題に固定する");
  assert.deepEqual(actual.vocabularyStreamRows, rows.slice(0, 11), "最新の11行（表示3行と10個前まで）と評価前の回答回数を保持する");
  assert.equal(normalize({ tasks }).vocabularyStreamEnabled, undefined, "従来の途中記録の形を維持する");
  assert.deepEqual(normalize({ ...session, studyMode: "listen-answer" }).vocabularyStreamRows, rows.slice(0, 11), "聞き流しにも3行画面を適用する");
  assert.equal(normalize({ ...session, studyMode: "listen-answer" }).vocabularyStreamEnabled, true);
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
  assert.equal(normalize({ ...session, vocabularyStreamRows: [{ ...rows[1], answeredAt: "2026-10-19T09:00:00+09:00" }] }).vocabularyStreamRows[0].answeredAt, "2026-10-19T00:00:00.000Z", "行の回答日時を共通の日時表記に整える");
  for (const answeredAt of [undefined, null, "invalid", 123, {}, []]) {
    assert.equal(normalize({ ...session, vocabularyStreamRows: [{ ...rows[1], answeredAt }] }).vocabularyStreamRows[0].answeredAt, null, "不正な回答日時を空にする");
  }
}
assert.deepEqual(normalizeBrowserSession(session), normalizeWorkerSession(session), "画面側と保存側で同じ途中記録を扱う");
for (const studyMode of ["memorize", "listen-answer"]) {
  const original = { ...session, studyMode };
  assert.deepEqual(switchStudySessionMode(original, studyMode).vocabularyStreamRows, rows.slice(0, 11), "同じ学習方法の再開では表示行を保持する");
  const nextMode = studyMode === "memorize" ? "listen-answer" : "memorize";
  const switched = switchStudySessionMode(original, nextMode);
  assert.equal(switched.vocabularyStreamEnabled, true, "学習方法を変えても3語表示の選択を保持する");
  assert.deepEqual(switched.vocabularyStreamRows, [], "別の学習方法の回答履歴を訂正させない");
  assert.equal(switched.studyMode, nextMode);
}
assert.equal(switchStudySessionMode({ tasks, studyMode: "memorize" }, "listen-answer").vocabularyStreamRows, undefined, "従来の途中記録へ新しい項目を追加しない");
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
const events = [
  { eventId: "answer-1", datasetVersion: "en-test", questionId: "EN-1-B01", studyMode: "memorize", rating: "good" },
  { eventId: "listening-1", datasetVersion: "en-test", questionId: "EN-1-B01", studyMode: "listen-answer", rating: null },
];
const env = {
  SYNC_TOKEN: "test-key",
  DB: {
    prepare(sql) {
      return {
        sql, values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          queries.push(this);
          if (!sql.includes("SELECT event_id FROM study_activity_events") || !existingEvent) return null;
          const [eventId, datasetVersion, questionId, studyMode] = this.values;
          const event = events.find(value => value.eventId === eventId && value.datasetVersion === datasetVersion &&
            value.questionId === questionId && value.studyMode === studyMode);
          return event ? { event_id: event.eventId } : null;
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
assert.deepEqual(updated.values, ["easy", null, "answer-1", "en-test", "EN-1-B01", "memorize"]);
assert.ok(updated.sql.includes("analysis_json = COALESCE(analysis_json, ?)"), "既存の分析情報を上書きしない");
assert.ok(updated.sql.includes("study_mode = ?"));
assert.ok(queries[0].sql.includes("dataset_version = ? AND question_id = ? AND study_mode = ?"));
assert.deepEqual(queries[0].values, ["answer-1", "en-test", "EN-1-B01", "memorize"]);
assert.equal(batches[0].some(({ sql }) => sql.includes("INSERT INTO study_activity_events") || sql.includes("DELETE FROM study_activity_events")), false, "履歴件数と回答日時を変えずに評価を修正する");
assert.equal((await save({
  studyMode: "listen-answer", session: { ...session, studyMode: "listen-answer" }, reviseActivityId: "listening-1",
  reviseAnalysis: analysis,
})).status, 200, "未評価の聞き流しの履歴にも後から評価を付けられる");
const listeningUpdate = batches.at(-1).find(({ sql }) => sql.includes("UPDATE study_activity_events SET rating"));
assert.deepEqual(listeningUpdate.values, ["easy", JSON.stringify(normalizedAnalysis), "listening-1", "en-test", "EN-1-B01", "listen-answer"]);
assert.ok(listeningUpdate.sql.includes("analysis_json = COALESCE(analysis_json, ?)"), "未評価の履歴で不足する分析情報だけを補完する");
assert.equal(/occurred_at\s*=|study_date\s*=|study_seconds\s*=/.test(listeningUpdate.sql), false, "元の回答日時と学習時間は変更しない");
assert.equal(batches.at(-1).some(({ sql }) => /INSERT INTO study_activity_events|DELETE FROM study_activity_events|INSERT INTO study_time_events/.test(sql)), false, "後からの評価で回答回数と日時・学習時間を増やさない");
// 同じ評価の押し直しによる取り消しは、回答履歴を残したまま評価なしへ戻し、問題記録を回答前の内容にする。
assert.equal((await save({ record: previousRecord, reviseRating: "" })).status, 200, "同じ評価の押し直しで評価なしへ戻す");
const cancelled = batches.at(-1).find(({ sql }) => sql.includes("UPDATE study_activity_events SET rating"));
assert.deepEqual(cancelled.values, [null, null, "answer-1", "en-test", "EN-1-B01", "memorize"]);
assert.equal(batches.at(-1).some(({ sql }) => /INSERT INTO study_activity_events|DELETE FROM study_activity_events/.test(sql)), false, "取り消しでも回答履歴の件数を変えない");
assert.equal((await save({ record: null, reviseRating: null })).status, 200, "回答前の記録がなければ問題記録を消して評価なしへ戻す");
assert.ok(batches.at(-1).some(({ sql }) => sql.includes("DELETE FROM question_progress")));
assert.equal((await save({ reviseRating: "easy" })).status, 200, "修正後の評価を明示しても問題記録と一致すれば受け付ける");
assert.deepEqual(batches.at(-1).find(({ sql }) => sql.includes("UPDATE study_activity_events SET rating")).values[0], "easy");
const batchCount = batches.length;
existingEvent = false;
assert.equal((await save()).status, 409, "存在しない履歴の修正は拒否する");
existingEvent = true;
assert.equal((await save({
  studyMode: "listen-answer", session: { ...session, studyMode: "listen-answer" },
})).status, 409, "暗記の履歴を聞き流しから修正しない");
assert.equal((await save({ reviseActivityId: "listening-1" })).status, 409, "聞き流しの履歴を暗記から修正しない");
for (const change of [
  { reviseActivityId: "" }, { reviseActivityId: "不正" }, { record: null },
  { reviseAnalysis: null }, { reviseAnalysis: [] }, { reviseAnalysis: "invalid" },
  { reviseAnalysis: {} }, { reviseAnalysis: { ...analysis, dimensions: [] } },
  { reviseAnalysis: analysis, reviseActivityId: null },
  { record: { ...previousRecord, lastRating: null } },
  { reviseRating: "good" }, { reviseRating: "invalid" }, { reviseRating: "", reviseActivityId: null },
  { studyMode: "invalid", session: null },
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
  assert.equal(Object.hasOwn(sent, "reviseAnalysis"), false, "分析情報のない既存の評価訂正も送信できる");
  await saveCloudStudyAnswer("en-test", tasks[0].questionId, previousRecord, { ...session, studyMode: "listen-answer" }, {
    studyMode: "listen-answer", reviseActivityId: "listening-1", reviseAnalysis: analysis,
  });
  assert.equal(sent.studyMode, "listen-answer");
  assert.equal(sent.reviseActivityId, "listening-1");
  assert.deepEqual(sent.reviseAnalysis, analysis, "未評価の聞き流しに付ける分析情報を送信する");
  await saveCloudStudyAnswer("en-test", tasks[0].questionId, previousRecord, session, { reviseAnalysis: analysis });
  assert.equal(Object.hasOwn(sent, "reviseAnalysis"), false, "過去の評価訂正以外では補完用の分析情報を送信しない");
} finally {
  globalThis.window = originalWindow;
  globalThis.fetch = originalFetch;
}
console.log("英単語3行画面の設定・暗記と聞き流しの途中記録・学習方法切替・過去の評価修正を確認しました。");
