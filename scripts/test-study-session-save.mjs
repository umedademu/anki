import assert from "node:assert/strict";
import worker from "../worker/src/index.js";
import {
  createStudySessionPatch,
  studySessionFingerprint,
} from "../public/study-session-patch.js";
import {
  forgetCloudSession,
  isStudySessionPatchSupported,
  loadCloudState,
  normalizeStudySession as normalizeBrowserSession,
  rememberCloudSession,
  saveCloudStudyActivity,
  saveCloudStudyAnswer,
  saveCloudStudySession,
  saveCloudStudyTime,
  setStudySessionPatchSupported,
  undoCloudStudyActivity,
} from "../public/cloud-progress.js";

// 途中記録の差分保存：保存窓口が差分を当てはめて保存し、前提が合わない時は409で全体の送り直しを求めること、
// ブラウザー側が対応する窓口にだけ差分を送り、拒否や失敗の後は全体を送り直すことを確かめる。
const count = 300;
const tasks = Array.from({ length: count }, (_, index) => ({
  termId: `EN-${String(index + 1).padStart(6, "0")}`,
  questionId: `EN-${String(index + 1).padStart(6, "0")}-B01`,
  stage: "beginner",
}));
const activity = {
  subjectId: "english-vocabulary", subjectTitle: "英単語", deckId: "deck-1", deckTitle: "Deck 1",
  studyMode: "listen-answer", questionId: tasks[0].questionId,
};
function makeSession(answered = 0, overrides = {}) {
  return normalizeBrowserSession({
    schemaVersion: 1, roundId: "round-1", studyMode: "listen-answer",
    vocabularyStreamEnabled: true, vocabularyStreamRows: [],
    deckIds: ["deck-1"], termIds: tasks.map((task) => task.termId), tasks,
    queue: tasks.slice(answered + 1), currentTask: tasks[answered],
    unseenQuestionIds: tasks.slice(answered).map((task) => task.questionId), retryQuestionIds: [],
    answeredCount: answered, studyTimeEventId: `screen-${answered + 1}`,
    ...overrides,
  });
}

// 手元の仮の記録領域で本物の保存処理を動かす。
const store = { sessions: new Map(), batches: [] };
function execute(sql, values) {
  if (sql.includes("INSERT INTO study_sessions (")) store.sessions.set(values[0], { session_json: values[1], updated_at: values[2] });
  else if (sql.startsWith("DELETE FROM study_sessions WHERE")) store.sessions.delete(values[0]);
}
const env = {
  SYNC_TOKEN: "test-key",
  DB: {
    prepare(sql) {
      return {
        sql, values: [],
        bind(...values) { this.values = values; return this; },
        async all() { return { results: [] }; },
        async first() {
          if (sql.includes("FROM study_sessions WHERE dataset_version")) {
            const row = store.sessions.get(this.values[0]);
            return row ? { ...row } : null;
          }
          if (sql.includes("COUNT(*) AS completed_count")) return { completed_count: 0 };
          return null;
        },
        async run() { execute(sql, this.values); return { success: true }; },
      };
    },
    async batch(statements) {
      store.batches.push(statements);
      for (const statement of statements) execute(statement.sql, statement.values);
      return statements.map(() => ({ success: true }));
    },
  },
};
const origin = "https://anki-progress-api.example";
const request = (path, body, method = "PUT") => worker.fetch(new Request(`${origin}${path}`, {
  method, headers: { Authorization: "Bearer test-key", "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
}), env);
const stored = () => JSON.parse(store.sessions.get("en-test")?.session_json ?? "null");

// 保存窓口：全体で保存した後、差分を当てはめて保存する。
const base = makeSession(0);
let response = await request("/v1/study-session?dataset=en-test", base);
assert.equal(response.status, 200);
let payload = await response.json();
assert.equal(payload.session.answeredCount, 0, "全体を受け取った時は途中記録を返す");
assert.equal(stored().answeredCount, 0);

const advanced = makeSession(1);
const patch = createStudySessionPatch(base, advanced);
response = await request("/v1/study-activity/activity-1?dataset=en-test", {
  activity: { ...activity, eventId: "activity-1" }, sessionPatch: patch, sessionDatasetVersion: "en-test",
  timeEntry: { ...activity, eventId: "screen-1", studySeconds: 3 },
});
assert.equal(response.status, 200, "差分の途中記録を受け付ける");
const replyText = await response.text();
payload = JSON.parse(replyText);
assert.equal(payload.session, null, "差分の時は途中記録を返さない");
assert.equal(payload.sessionPatched, true);
assert.equal(typeof payload.sessionUpdatedAt, "string");
assert.equal(payload.sessionFingerprint, studySessionFingerprint(advanced), "当てはめた結果の要約を返す");
assert.ok(replyText.length < 1000, `差分の返答は小さい（${replyText.length}バイト）`);
assert.equal(stored().answeredCount, 1, "差分を当てはめた途中記録を保存する");
assert.equal(stored().queue.length, count - 2);
assert.equal(stored().currentTask.questionId, tasks[1].questionId);
assert.equal(stored().tasks.length, count, "送っていない出題対象は保存済みの内容を保つ");
assert.ok(store.batches.at(-1).some(({ sql }) => sql.includes("INSERT INTO study_activity_events")), "日別学習記録も同じ通信で保存する");
assert.ok(store.batches.at(-1).some(({ sql }) => sql.includes("INSERT INTO study_time_events")), "学習時間も同じ通信で保存する");

// 前提が合わない差分は409で拒否し、何も保存しない。
const batchCount = store.batches.length;
response = await request("/v1/study-activity/activity-2?dataset=en-test", {
  activity: { ...activity, eventId: "activity-2" }, sessionPatch: patch, sessionDatasetVersion: "en-test",
});
assert.equal(response.status, 409, "古い前提の差分を拒否する");
payload = await response.json();
assert.equal(payload.code, "study-session-patch-base");
assert.equal(store.batches.length, batchCount, "拒否した時は日別学習記録も途中記録も書かない");
const nextPatch = createStudySessionPatch(advanced, makeSession(2));
response = await request("/v1/study-activity/activity-2?dataset=en-test", {
  activity: { ...activity, eventId: "activity-2" }, sessionPatch: { ...nextPatch, expect: "違う要約" }, sessionDatasetVersion: "en-test",
});
assert.equal(response.status, 409);
assert.equal((await response.json()).code, "study-session-patch-result", "当てはめた結果が合わない差分を拒否する");
response = await request("/v1/study-activity/activity-2?dataset=en-test", {
  activity: { ...activity, eventId: "activity-2" }, sessionPatch: { ...nextPatch, version: 99 }, sessionDatasetVersion: "en-test",
});
assert.equal((await response.json()).code, "study-session-patch-version");
response = await request("/v1/study-activity/activity-2?dataset=en-other", {
  activity: { ...activity, eventId: "activity-2" }, sessionPatch: nextPatch, sessionDatasetVersion: "en-other",
});
assert.equal(response.status, 409);
assert.equal((await response.json()).code, "study-session-patch-missing", "保存済みの途中記録がない時は差分を拒否する");
assert.equal(store.batches.length, batchCount);

// 学習時間・一手戻り・回答保存・途中記録の窓口でも差分を受け付ける。
const second = makeSession(2);
response = await request("/v1/study-time/screen-3?dataset=en-test", {
  timeEntry: { ...activity, questionId: tasks[2].questionId, eventId: "screen-3", studySeconds: 5 },
  sessionPatch: createStudySessionPatch(advanced, makeSession(2, { screenStudySeconds: 5, savedScreenStudySeconds: 5, studySeconds: 5 })),
  sessionDatasetVersion: "en-test",
});
assert.equal(response.status, 200, `学習時間の窓口でも差分を受け付ける：${await response.clone().text()}`);
assert.equal((await response.json()).sessionPatched, true);
assert.equal(stored().savedScreenStudySeconds, 5);
const afterTime = normalizeBrowserSession(stored());
response = await request("/v1/study-activity/activity-1/undo?dataset=en-test", {
  sessionPatch: createStudySessionPatch(afterTime, second), sessionDatasetVersion: "en-test",
});
assert.equal(response.status, 200, "一手戻りの窓口でも差分を受け付ける");
assert.equal(stored().studySeconds, 0);
response = await request(`/v1/study-answer/${tasks[1].questionId}?dataset=en-test`, {
  record: { streak: 1, attempts: 1, rememberedCount: 1, lastRating: "good", lastAnsweredAt: "2026-10-20T00:00:00.000Z", nextReviewAt: "2026-10-21T00:00:00.000Z", everMastered: false },
  sessionPatch: createStudySessionPatch(second, makeSession(2, { ratingCounts: { again: 0, hard: 0, good: 1, easy: 0 } })),
  studyMode: "listen-answer", sessionDatasetVersion: "en-test",
});
assert.equal(response.status, 200, "回答保存の窓口でも差分を受け付ける");
assert.equal(stored().ratingCounts.good, 1);
response = await request("/v1/study-session?dataset=en-test", {
  sessionPatch: createStudySessionPatch(normalizeBrowserSession(stored()), makeSession(3)),
});
assert.equal(response.status, 200, "途中記録の窓口は差分の本文も受け付ける");
assert.equal(stored().answeredCount, 3);

// 一周の完了は途中記録を消し、差分で受け取っていても途中記録なしと返す。
response = await request("/v1/study-activity/activity-last?dataset=en-test", {
  activity: { ...activity, eventId: "activity-last" }, sessionPatch: createStudySessionPatch(normalizeBrowserSession(stored()), makeSession(4)),
  sessionDatasetVersion: "en-test", completeSession: true,
});
assert.equal(response.status, 200);
payload = await response.json();
assert.equal(payload.session, null);
assert.equal(payload.sessionPatched, undefined);
assert.equal(store.sessions.has("en-test"), false, "完了した一周の途中記録を消す");

// 窓口は差分へ対応していることを表示する。
response = await request("/v1/state?dataset=en-test", undefined, "GET");
assert.equal((await response.json()).features?.studySessionPatch, 1);

// ブラウザー側：対応する窓口へは差分を送り、拒否・失敗の後は全体を送り直す。
const originalWindow = globalThis.window;
const originalFetch = globalThis.fetch;
try {
  globalThis.window = {
    ANKI_CONFIG: { progressApiBaseUrl: origin },
    localStorage: { getItem: () => "test-key" },
  };
  const sent = [];
  let failNext = 0;
  globalThis.fetch = async (url, options) => {
    sent.push({ url: String(url), body: options.body == null ? null : JSON.parse(options.body), keepalive: options.keepalive === true });
    if (failNext > 0) {
      failNext -= 1;
      return new Response(JSON.stringify({ error: "試験用の失敗" }), { status: 503 });
    }
    return worker.fetch(new Request(url, options), env);
  };
  const bodyOf = (entry) => Buffer.byteLength(JSON.stringify(entry.body));

  forgetCloudSession();
  store.sessions.clear();
  await request("/v1/study-session?dataset=en-test", base);
  const loaded = await loadCloudState(2, "en-test");
  assert.equal(isStudySessionPatchSupported(), true, "窓口の表示から差分の対応を読み取る");
  assert.equal(loaded.sessions["listen-answer"].answeredCount, 0);

  let saved = await saveCloudStudyActivity("en-test", { ...activity, eventId: "client-1" }, advanced, { sessionDatasetVersion: "en-test" });
  assert.ok(sent.at(-1).body.sessionPatch, "読み込んだ途中記録を前提に差分を送る");
  assert.equal(Object.hasOwn(sent.at(-1).body, "session"), false);
  assert.ok(bodyOf(sent.at(-1)) < 2000, `差分の本文は小さい（${bodyOf(sent.at(-1))}バイト）`);
  assert.equal(saved.session.answeredCount, 1, "送った途中記録を保存結果として使う");
  assert.equal(typeof saved.session.updatedAt, "string", "保存窓口の更新日時を付ける");
  assert.equal(stored().answeredCount, 1);

  saved = await saveCloudStudyTime("en-test", { ...activity, questionId: tasks[1].questionId, eventId: "screen-2", studySeconds: 4 },
    makeSession(1, { screenStudySeconds: 4, savedScreenStudySeconds: 4, studySeconds: 4 }), { keepalive: true, sessionDatasetVersion: "en-test" });
  assert.ok(sent.at(-1).body.sessionPatch, "学習時間の保存も差分で送る");
  assert.equal(sent.at(-1).keepalive, true);
  assert.equal(saved.session.savedScreenStudySeconds, 4);

  // 別の端末が先に進めていた（保存内容が前提と違う）時は、拒否を受けて全体を送り直す。
  const requestCount = sent.length;
  store.sessions.set("en-test", { session_json: JSON.stringify({ ...makeSession(5), updatedAt: "2026-10-20T01:00:00.000Z" }), updated_at: "2026-10-20T01:00:00.000Z" });
  saved = await saveCloudStudyActivity("en-test", { ...activity, eventId: "client-2" }, makeSession(2), { sessionDatasetVersion: "en-test" });
  assert.equal(sent.length - requestCount, 2, "拒否された差分は全体で1回だけ送り直す");
  assert.ok(sent.at(-2).body.sessionPatch);
  assert.ok(sent.at(-1).body.session, "送り直しは途中記録の全体を含む");
  assert.equal(stored().answeredCount, 2);
  assert.equal(saved.session.answeredCount, 2, "全体で保存した時は返ってきた途中記録を使う");

  saved = await saveCloudStudyActivity("en-test", { ...activity, eventId: "client-3" }, makeSession(3), { sessionDatasetVersion: "en-test" });
  assert.ok(sent.at(-1).body.sessionPatch, "送り直した後は再び差分で送る");

  // 保存窓口側の失敗（5xx）でも全体で送り直し、それも失敗したら控えを捨てて次回は全体を送る。
  failNext = 2;
  await assert.rejects(saveCloudStudyActivity("en-test", { ...activity, eventId: "client-4" }, makeSession(4), { sessionDatasetVersion: "en-test" }));
  assert.ok(sent.at(-2).body.sessionPatch);
  assert.ok(sent.at(-1).body.session, "窓口の失敗後は全体で送り直す");
  saved = await saveCloudStudyActivity("en-test", { ...activity, eventId: "client-4" }, makeSession(4), { sessionDatasetVersion: "en-test" });
  assert.ok(sent.at(-1).body.session, "失敗の後の最初の保存は全体を送る");
  assert.equal(saved.session.answeredCount, 4);

  // 途中記録を消す保存（回答保存で session: null）の後は、控えがないため全体を送る。
  await saveCloudStudyAnswer("en-test", tasks[4].questionId, null, null, { studyMode: "listen-answer", sessionDatasetVersion: "en-test" });
  assert.equal(sent.at(-1).body.session, null);
  assert.equal(store.sessions.has("en-test"), false);
  await saveCloudStudySession("en-test", makeSession(5));
  assert.equal(Object.hasOwn(sent.at(-1).body, "sessionPatch"), false, "控えがない時は途中記録の全体を送る");
  assert.equal(sent.at(-1).body.answeredCount, 5);
  saved = await undoCloudStudyActivity("en-test", "client-4", makeSession(4), { sessionDatasetVersion: "en-test" });
  assert.ok(sent.at(-1).body.sessionPatch, "一手戻りも差分で送る");
  assert.equal(saved.session.answeredCount, 4);

  // 差分に対応していない窓口（表示がない）へは全体を送る。
  setStudySessionPatchSupported(false);
  rememberCloudSession("en-test", makeSession(4));
  await saveCloudStudyActivity("en-test", { ...activity, eventId: "client-5" }, makeSession(5), { sessionDatasetVersion: "en-test" });
  assert.ok(sent.at(-1).body.session, "対応表示のない窓口へは全体を送る");
  assert.equal(Object.hasOwn(sent.at(-1).body, "sessionPatch"), false);
} finally {
  globalThis.window = originalWindow;
  globalThis.fetch = originalFetch;
}
console.log("途中記録の差分保存を確認しました：保存窓口の当てはめと拒否、ブラウザー側の差分送信と全体の送り直し");
