import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { createStudyRoutineRun } from "../public/study-routine.js";
import { normalizeSetupPreferences, normalizeStudySession } from "../worker/src/index.js";

const root = path.resolve(import.meta.dirname, "..", "public");
const off = {
  history: { question: false, answer: false, explanation: false, mnemonic: false },
  vocabulary: { word: false, meaning: false, exampleEnglish: false, exampleJapanese: false },
};
const ratings = ["again", "hard", "good", "easy"];
const words = ["apple", "bright", "create", "demand", "eager", "freedom", "gather", "honest", "improve", "journey", "knowledge", "little"];
const meanings = ["りんご", "明るい", "作る", "要求する", "熱心な", "自由", "集める", "正直な", "改善する", "旅", "知識", "小さい"];
words[1] = "pneumonoultramicroscopicsilicovolcanoconiosis";
words[2] = "antidisestablishmentarianism";
meanings[1] = "非常に細かな粒子を吸い込むことで生じる病気を表す、特に長い英単語の意味。長い説明が複数行に折り返されても、各単語に付いている四つの評価ボタンを画面内に残し、説明の最後の文字までたどり着けることを確認するための試験用の和訳です。最後まで表示。";
meanings[2] = "国教会制度の廃止に反対する立場や考え方を表す言葉。日本語訳がこのように長い文章になり、画面の高さだけでは一度にすべての内容を表示できない場合でも、訳の欄だけを上下に動かして末尾まで読むことができ、他の二つの単語や十二個の評価ボタンが隠れないことを確認します。確認用の末尾。";
const terms = words.map((word, index) => {
  const exampleEnglish = `This is a test example for ${word}.`;
  const exampleJapanese = `表示してはいけない例文${index}`;
  const question = (stage, prompt, answer) => ({
    id: `${stage === "beginner" ? "q" : stage === "reverse" ? "r" : "i"}${index}`,
    stage, type: stage === "beginner" ? "identify" : stage,
    prompt, answer, acceptedAnswers: [], keywords: [answer],
    answerNote: `品詞：試験\n例文：${exampleEnglish}\n和訳：${exampleJapanese}`,
    hideTermUntilAnswer: stage === "reverse",
    speech: {
      question: [{ text: prompt, language: stage === "reverse" ? "ja-JP" : "en-US" }],
      answer: [{ text: answer, language: stage === "reverse" ? "en-US" : "ja-JP" },
        { text: exampleEnglish, language: "en-US" }, { text: exampleJapanese, language: "ja-JP" }],
    },
  });
  return {
    id: `t${index}`, term: word, reading: "品詞：試験", category: "試験", importanceRank: index + 1,
    geography: {}, chronology: { sortYear: index + 1 },
    stages: {
      beginner: [question("beginner", word, meanings[index])],
      reverse: [question("reverse", meanings[index], word)],
      integrated: [question("integrated", exampleEnglish, exampleJapanese)],
    },
  };
});

// /data はこの試験専用の人工問題だけを返す。本番の問題集も保存先も使用しない。
const vocabularyDeck = { id: "deck-1", number: 1, datasetLabel: "試験用英単語", indexPath: "vocabulary/index.json", version: "stream-vocabulary-v1", termCount: terms.length, questionCount: terms.length * 3 };
const historyDeck = { id: "deck-1", number: 1, datasetLabel: "試験用歴史", indexPath: "history/index.json", version: "stream-history-v1", termCount: 1, questionCount: 1 };
const objects = new Map([
  ["index.json", { schemaVersion: 3, version: "stream-test", subjects: [
    { id: "english-vocabulary", title: "英単語", learningType: "vocabulary", defaultDeckId: "deck-1", decks: [vocabularyDeck] },
    { id: "test-history", title: "試験用歴史", learningType: "history", defaultDeckId: "deck-1", decks: [historyDeck] },
  ] }],
  ["vocabulary/index.json", { id: "english-vocabulary", title: "英単語", deckId: "deck-1", version: vocabularyDeck.version,
    learningType: "vocabulary", masteryTarget: 2, availableStages: ["beginner", "reverse", "integrated"], chunks: [{ path: "vocabulary/chunk.json" }] }],
  ["vocabulary/chunk.json", { terms }],
  ["history/index.json", { id: "test-history", title: "試験用歴史", deckId: "deck-1", version: historyDeck.version,
    learningType: "history", masteryTarget: 2, simpleQuestions: true, availableStages: ["beginner"], chunks: [{ path: "history/chunk.json" }] }],
  ["history/chunk.json", { terms: [{ id: "history-term", term: "試験用語", category: "試験", geography: {},
    stages: { beginner: [{ id: "history-question", stage: "beginner", type: "identify", prompt: "試験問題", answer: "試験回答" }], reverse: [], integrated: [] } }] }],
  ["term-images.json", { schemaVersion: 2, assets: [], assignments: [] }],
]);

let settings, records, sessions, activities, answerRequests, failSave;
const routinePlan = [{ id: "vocabulary", subjectId: "english-vocabulary", questionTarget: 8 }, { id: "history", subjectId: "test-history", questionTarget: 1 }];
function reset({ routine = false } = {}) {
  records = new Map(); sessions = new Map(); activities = new Map(); answerRequests = []; failSave = false;
  settings = {
    autoSpeechEnabled: false, speechParts: off, ratingSoundVolume: 0, shuffleEnabled: false,
    againSeconds: 86400, hardSeconds: 86400, goodSeconds: 86400, easySeconds: 86400,
    studyTimeLimitSeconds: 86400,
    setupPreferences: normalizeSetupPreferences({ routinePlan,
      routineRun: routine ? createStudyRoutineRun(routinePlan, "2026-10-19", "vocabulary-stream-run") : null,
      subjects: {
      "english-vocabulary": { selectedDeckIds: ["deck-1"], vocabularyStreamEnabled: routine, questionLimit: 8, decks: { "deck-1": { questionStyle: "all" } } },
      "test-history": { selectedDeckIds: ["deck-1"] },
    } }),
  };
}
reset();
let speechRequests = 0;
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const reply = (body, status = 200) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
    if (url.pathname.startsWith("/v1/")) {
      const parts = []; for await (const part of req) parts.push(part);
      const body = parts.length ? JSON.parse(Buffer.concat(parts).toString()) : {};
      const dataset = url.searchParams.get("dataset");
      const sessionDataset = body.sessionDatasetVersion ?? dataset;
      if (/speech|rating-sound/.test(url.pathname)) { speechRequests++; reply({ error: "試験中の音声取得は禁止" }, 500); return; }
      if (url.pathname === "/v1/state") {
        reply({ settings, progress: { questions: records.get(dataset) ?? {} }, session: sessions.get(dataset), studyDate: "2026-10-19" }); return;
      }
      if (url.pathname === "/v1/settings") {
        settings = { ...settings, ...body, autoSpeechEnabled: false, speechParts: off, ratingSoundVolume: 0 };
        settings.setupPreferences = normalizeSetupPreferences(settings.setupPreferences);
        reply({ settings }); return;
      }
      if (url.pathname === "/v1/study-routine") {
        settings.setupPreferences = normalizeSetupPreferences({ ...settings.setupPreferences, ...body });
        reply({ setupPreferences: settings.setupPreferences, studyDate: "2026-10-19" }); return;
      }
      if (url.pathname.startsWith("/v1/study-answer/")) {
        answerRequests.push(structuredClone(body));
        if (failSave) { reply({ error: "試験用の保存失敗" }, 503); return; }
        const id = decodeURIComponent(url.pathname.split("/").pop());
        const progress = { ...records.get(dataset) };
        if (body.record == null) delete progress[id]; else progress[id] = structuredClone(body.record);
        records.set(dataset, progress);
        if (body.deleteActivityId) activities.delete(body.deleteActivityId);
        else if (body.reviseActivityId) {
          assert.ok(activities.has(body.reviseActivityId), "修正前の評価記録が存在する");
          activities.set(body.reviseActivityId, { ...activities.get(body.reviseActivityId), rating: body.record.lastRating, questionId: id });
        } else if (body.activity) activities.set(body.activity.eventId, { ...body.activity, questionId: id });
      } else if (url.pathname !== "/v1/study-session" && !url.pathname.startsWith("/v1/study-time/") && !url.pathname.startsWith("/v1/study-activity/")) {
        throw new Error("未対応の試験通信：" + url.pathname);
      }
      if (body.routineRun) settings.setupPreferences = normalizeSetupPreferences({ ...settings.setupPreferences, routineRun: body.routineRun });
      if (url.pathname === "/v1/study-session") {
        if (req.method === "DELETE") sessions.delete(sessionDataset);
        else sessions.set(sessionDataset, normalizeStudySession(body));
      } else if (Object.hasOwn(body, "session")) {
        if (body.session == null) sessions.delete(sessionDataset);
        else sessions.set(sessionDataset, normalizeStudySession(body.session));
      }
      reply({ session: sessions.get(sessionDataset), updatedAt: new Date().toISOString() }); return;
    }
    if (url.pathname === "/config.js") {
      res.setHeader("Content-Type", "text/javascript");
      res.end(`window.ANKI_CONFIG={dataBaseUrl:"/data",progressApiBaseUrl:"http://127.0.0.1:${server.address().port}"};`); return;
    }
    if (url.pathname.startsWith("/data/")) {
      const body = objects.get(url.pathname.slice(6)); reply(body ?? {}, body ? 200 : 404); return;
    }
    const target = path.resolve(root, "." + (url.pathname === "/" ? "/index.html" : url.pathname));
    if (!target.startsWith(root + path.sep)) throw new Error("公開範囲の外");
    res.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" })[path.extname(target)] ?? "text/plain");
    res.end(await readFile(target));
  } catch (error) { res.writeHead(500); res.end(error.message); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 812, height: 375 } });
  context.setDefaultTimeout(15000);
  // 最初のページを開く前から自動読み上げをOFFにし、全ての読み上げ対象・音声再生を止める。
  await context.addInitScript(parts => {
    localStorage.setItem("anki-cloud-access-key:v1", "stream-test-key");
    localStorage.setItem("anki-auto-speech:v1", "false");
    localStorage.setItem("anki-speech-parts:v1", JSON.stringify(parts));
    localStorage.setItem("anki-speech-settings:v1", JSON.stringify({ autoSpeechEnabled: false, speechParts: parts }));
    const forbidden = () => { throw new Error("試験中の音声再生は禁止"); };
    speechSynthesis.cancel(); speechSynthesis.speak = forbidden;
    HTMLMediaElement.prototype.play = forbidden;
    if (window.AudioScheduledSourceNode) AudioScheduledSourceNode.prototype.start = forbidden;
  }, off);
  // 試験サーバー以外へ一切通信しない。特に実際のCloudflareへの書き込みを防ぐ。
  await context.route("**/*", route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  const speech = (await readFile(path.join(root, "speech.js"), "utf8")).replace("export function createSpeechController(", "function unusedSpeechController(");
  await context.route("**/speech.js*", route => route.fulfill({ contentType: "text/javascript", body: speech + "\nexport function createSpeechController(){return {supported:true,paused:false,currentTarget:null,stop(){},unlock(){},pause(){return false},resume(){return false},speak(){return true},preload(){return Promise.resolve()}};}" }));
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const rows = () => page.locator("#vocabulary-stream-panel .vocabulary-stream-row");
  const current = () => rows().first();
  const streamRadio = () => page.locator('input[name="study-mode"][value="vocabulary-stream"]');
  const savedSession = () => sessions.get(vocabularyDeck.version);
  const progress = () => records.get(vocabularyDeck.version) ?? {};
  const ids = () => rows().evaluateAll(nodes => nodes.map(node => node.dataset.questionId));
  async function setup(subject = "english-vocabulary") {
    await page.goto(`${base}/?subject=${subject}&view=setup&deck=deck-1`);
    await page.locator("#setup-panel").waitFor({ state: "visible" });
    await page.waitForFunction(() => !document.querySelector("#start-study").disabled);
  }
  async function ready(id) {
    await page.waitForFunction(expected => {
      const panel = document.querySelector("#vocabulary-stream-panel"), row = panel?.querySelector(".vocabulary-stream-row");
      const reveal = row?.querySelector("[data-stream-reveal]");
      return panel && !panel.classList.contains("is-hidden") && row?.dataset.questionId === expected && reveal && !reveal.disabled;
    }, id);
  }
  async function start(count = 8) {
    await setup(); await streamRadio().check();
    await page.locator("#question-limit").fill(String(count));
    await page.locator("#start-study").click(); await ready("q0");
  }
  async function reveal() {
    await current().locator("[data-stream-reveal]").click();
    await current().locator('[data-stream-rating="good"]').waitFor({ state: "visible" });
    await page.waitForFunction(() => !document.querySelector('.vocabulary-stream-row [data-stream-rating="good"]').disabled);
  }
  async function rate(rating, nextId) {
    await reveal(); await current().locator(`[data-stream-rating="${rating}"]`).click(); await ready(nextId);
  }
  async function revise(index, rating) {
    await rows().nth(index).locator(`[data-stream-rating="${rating}"]`).click();
    await page.waitForFunction(({ index, rating }) => {
      const button = document.querySelectorAll(".vocabulary-stream-row")[index]?.querySelector(`[data-stream-rating="${rating}"]`);
      return button && !button.disabled && button.getAttribute("aria-pressed") === "true";
    }, { index, rating });
  }
  async function assertHiddenMeaning(row) {
    const meaning = row.locator(".vocabulary-stream-meaning");
    assert.equal((await meaning.textContent()).trim() === "" || !await meaning.isVisible(), true, "回答前の日本語訳を見せない");
  }
  async function assertFullTextReachable(row, index, viewport) {
    assert.equal(await row.locator(".vocabulary-stream-word").textContent(), words[index]);
    assert.equal(await row.locator(".vocabulary-stream-meaning").textContent(), meanings[index]);
    for (const selector of [".vocabulary-stream-word", ".vocabulary-stream-answer"]) {
      const content = await row.locator(selector).evaluate(container => {
        const text = container.matches(".vocabulary-stream-word") ? container.firstChild : container.querySelector(".vocabulary-stream-meaning").firstChild;
        container.scrollTop = container.scrollHeight;
        const range = document.createRange();
        range.setStart(text, text.textContent.length - 1); range.setEnd(text, text.textContent.length);
        const end = range.getBoundingClientRect(), box = container.getBoundingClientRect();
        const result = { overflow: getComputedStyle(container).overflowY, height: container.clientHeight, scrollHeight: container.scrollHeight,
          endVisible: end.top >= box.top - 2 && end.bottom <= box.bottom + 2 };
        container.scrollTop = 0; return result;
      });
      assert.ok(content.height > 0 && content.endVisible, `${viewport.width}×${viewport.height}で長い単語と訳の末尾まで読める：${selector} ${JSON.stringify(content)}`);
      if (content.scrollHeight > content.height) assert.ok(["auto", "scroll"].includes(content.overflow), "長い本文を上下に動かせる");
    }
  }

  // 追加モードは英単語だけに表示し、既存の選択肢を維持する。
  await setup("test-history");
  assert.equal(await streamRadio().isVisible(), false);
  for (const mode of ["memorize", "listen-answer"]) assert.equal(await page.locator(`input[name="study-mode"][value="${mode}"]`).isVisible(), true);
  await start();
  assert.equal(await rows().count(), 1); assert.deepEqual(await ids(), ["q0"]);
  assert.equal(await current().locator(".vocabulary-stream-word").textContent(), words[0]);
  await assertHiddenMeaning(current());
  for (const rating of ratings) assert.equal(await current().locator(`[data-stream-rating="${rating}"]`).isDisabled(), true);
  assert.equal(savedSession().vocabularyStreamEnabled, true);
  assert.equal(savedSession().tasks.every(task => task.questionId.startsWith("q")), true, "英語から日本語の問題だけを対象にする");
  await reveal();
  assert.equal(await current().locator(".vocabulary-stream-meaning").textContent(), meanings[0]);
  assert.equal((await page.locator("#vocabulary-stream-panel").textContent()).includes("This is a test example"), false);
  assert.equal((await page.locator("#vocabulary-stream-panel").textContent()).includes("表示してはいけない例文"), false);
  await current().locator('[data-stream-rating="good"]').click(); await ready("q1");
  assert.deepEqual(await ids(), ["q1", "q0"]); await assertHiddenMeaning(current());
  await rate("hard", "q2"); assert.deepEqual(await ids(), ["q2", "q1", "q0"]);
  await rate("easy", "q3"); assert.deepEqual(await ids(), ["q3", "q2", "q1"]);
  assert.equal(await page.locator("#vocabulary-stream-panel [data-stream-rating]").count(), 12);
  assert.equal(activities.size, 3);
  assert.equal(answerRequests.every(body => body.studyMode === "memorize"), true, "通常暗記と同じ保存窓口を使う");

  // スマートフォンの横画面とパソコンで3行・12個の評価ボタンを同時に表示する。
  const screenshotPath = path.join(await mkdtemp(path.join(tmpdir(), "anki-vocabulary-stream-")), "vocabulary-stream-812x375.png");
  for (const viewport of [{ width: 667, height: 375 }, { width: 812, height: 375 }, { width: 932, height: 430 }, { width: 1366, height: 768 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.scrollTo(0, 0));
    const layout = await page.locator("#vocabulary-stream-panel").evaluate(panel => ({
      width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth,
      boxes: [...panel.querySelectorAll(".vocabulary-stream-row, [data-stream-rating]")].map(node => {
        const rect = node.getBoundingClientRect(); return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
      }),
    }));
    assert.equal(layout.boxes.length, 15);
    assert.equal(layout.overflow, false, `${viewport.width}×${viewport.height}で横にはみ出さない`);
    for (const box of layout.boxes) assert.ok(box.width > 0 && box.height > 0 && box.left >= -1 && box.top >= -1 && box.right <= layout.width + 1 && box.bottom <= layout.height + 1,
      `${viewport.width}×${viewport.height}で3行と12ボタンが画面に収まる：${JSON.stringify(box)}`);
    await assertFullTextReachable(rows().nth(1), 2, viewport);
    await assertFullTextReachable(rows().nth(2), 1, viewport);
    if (viewport.width === 812) await page.screenshot({ path: screenshotPath });
  }

  // 過去の評価を直しても新しい回答として数えず、現在の問題を進めない。
  const beforeCount = savedSession().answeredCount, beforeAttempts = progress().q2.attempts;
  await revise(1, "good");
  assert.deepEqual(await ids(), ["q3", "q2", "q1"]);
  assert.equal(savedSession().answeredCount, beforeCount); assert.equal(progress().q2.attempts, beforeAttempts);
  assert.equal(progress().q2.lastRating, "good"); assert.equal(activities.size, 3);
  assert.equal([...activities.values()].find(activity => activity.questionId === "q2").rating, "good", "保存した過去の評価記録も更新する");
  assert.deepEqual(savedSession().ratingCounts, { again: 0, hard: 1, good: 2, easy: 0 });
  assert.ok(answerRequests.at(-1).reviseActivityId);
  await assertHiddenMeaning(current());

  // 保存失敗時は過去行の選択・件数・進行を変更前へ戻す。
  const beforeSession = structuredClone(savedSession()), beforeRecords = structuredClone(progress()), beforeActivities = structuredClone([...activities]);
  failSave = true;
  await rows().nth(2).locator('[data-stream-rating="again"]').click();
  await page.waitForFunction(() => document.querySelector("#unlock-notice").textContent.includes("保存失敗"));
  await page.waitForFunction(() => !document.querySelectorAll(".vocabulary-stream-row")[2].querySelector('[data-stream-rating="hard"]').disabled);
  assert.equal(await rows().nth(2).locator('[data-stream-rating="hard"]').getAttribute("aria-pressed"), "true");
  assert.deepEqual(savedSession(), beforeSession); assert.deepEqual(progress(), beforeRecords); assert.deepEqual([...activities], beforeActivities);
  failSave = false;

  // 再読み込みで並びと過去の評価を復元し、新しい単語の訳は隠したままにする。
  await page.reload(); await ready("q3");
  assert.deepEqual(await ids(), ["q3", "q2", "q1"]); await assertHiddenMeaning(current());
  assert.equal(await rows().nth(1).locator('[data-stream-rating="good"]').getAttribute("aria-pressed"), "true");
  assert.equal(await rows().nth(2).locator('[data-stream-rating="hard"]').getAttribute("aria-pressed"), "true");

  // 最新の単語の評価が保存できなければ、訳を公開した状態と既存の3行へ戻す。
  const revealed = page.waitForResponse(response => response.url().includes("/v1/study-session") && response.ok());
  await reveal(); await revealed;
  const beforeCurrentSession = structuredClone(savedSession()), beforeCurrentRecords = structuredClone(progress()), beforeCurrentActivities = structuredClone([...activities]);
  assert.equal(beforeCurrentSession.answerVisible, true);
  failSave = true;
  await current().locator('[data-stream-rating="good"]').click();
  await page.waitForFunction(() => document.querySelector("#unlock-notice").textContent.includes("保存失敗") &&
    document.querySelector(".vocabulary-stream-row")?.dataset.questionId === "q3" &&
    !document.querySelector('.vocabulary-stream-row [data-stream-rating="good"]').disabled);
  assert.deepEqual(await ids(), ["q3", "q2", "q1"]);
  assert.equal(await current().locator(".vocabulary-stream-meaning").textContent(), meanings[3]);
  assert.equal(await current().locator(".vocabulary-stream-meaning").isVisible(), true);
  for (const field of ["currentTask", "vocabularyStreamRows", "answeredCount", "ratingCounts", "answerVisible"]) {
    assert.deepEqual(savedSession()[field], beforeCurrentSession[field], `現在語の保存失敗で${field}を維持する`);
  }
  assert.deepEqual(progress(), beforeCurrentRecords); assert.deepEqual([...activities], beforeCurrentActivities);
  failSave = false;

  // 通常暗記・聞き流しへ切り替えられる。
  for (const mode of ["memorize", "listen-answer"]) {
    await setup(); await page.locator(`input[name="study-mode"][value="${mode}"]`).check();
    await page.locator("#resume-study").click(); await page.locator("#question-card").waitFor({ state: "visible" });
    assert.equal(await page.locator("#vocabulary-stream-panel").isVisible(), false);
    assert.equal(savedSession().vocabularyStreamEnabled, false);
  }

  // 一手戻りで直前の問題・行と評価前の学習記録を復元する。
  reset(); await start(); await rate("good", "q1"); await rate("good", "q2");
  await page.locator("#vocabulary-stream-back").click();
  await page.waitForFunction(() => document.querySelector(".vocabulary-stream-row")?.dataset.questionId === "q1" &&
    !document.querySelector('.vocabulary-stream-row [data-stream-rating="good"]').disabled);
  assert.deepEqual(await ids(), ["q1", "q0"]);
  assert.equal(progress().q1, undefined); assert.equal(savedSession().answeredCount, 1); assert.equal(activities.size, 1);

  // 同じ問題が再出題されたら、前の出現行から古い評価を変更できない。
  reset(); await start(1); await rate("again", "q0");
  assert.deepEqual(await ids(), ["q0", "q0"]); await assertHiddenMeaning(current());
  for (const rating of ratings) assert.equal(await rows().nth(1).locator(`[data-stream-rating="${rating}"]`).isDisabled(), true);
  assert.equal(progress().q0.attempts, 1); assert.equal(activities.size, 1);

  // 毎日のメニューでも学習方法を復元し、過去の評価訂正で達成数と内訳を修正する。
  reset({ routine: true });
  await page.goto(base); await page.locator("#continue-routine").waitFor({ state: "visible" });
  await page.locator("#continue-routine").click();
  await page.locator("#setup-panel").waitFor({ state: "visible" });
  await page.waitForFunction(() => !document.querySelector("#start-study").disabled);
  assert.equal(await streamRadio().isChecked(), true, "保存済みの英単語3語表示をメニュー開始時にも復元する");
  assert.equal(await page.locator("#question-limit").inputValue(), "8");
  await page.locator("#start-study").click(); await ready("q0");
  await rate("good", "q1"); await rate("hard", "q2"); await rate("good", "q3");
  const routine = () => settings.setupPreferences.routineRun;
  assert.deepEqual(await ids(), ["q3", "q2", "q1"]);
  assert.equal(routine().items[0].completedCount, 3); assert.equal(routine().currentIndex, 0);
  assert.deepEqual(routine().items[0].ratingCounts, { again: 0, hard: 1, good: 2, easy: 0 });
  const routineAnswered = savedSession().answeredCount, routineAttempts = progress().q2.attempts;
  await revise(1, "again");
  assert.deepEqual(await ids(), ["q3", "q2", "q1"]); await assertHiddenMeaning(current());
  assert.equal(routine().items[0].completedCount, 2, "過去の正解を不正解へ変更したらメニューの達成数を減らす");
  assert.equal(routine().items[0].completedQuestionKeys.length, 2);
  assert.deepEqual(routine().items[0].ratingCounts, { again: 1, hard: 1, good: 1, easy: 0 });
  assert.equal(savedSession().answeredCount, routineAnswered); assert.equal(progress().q2.attempts, routineAttempts);
  assert.equal([...activities.values()].find(activity => activity.questionId === "q2").rating, "again");
  await revise(1, "easy");
  assert.deepEqual(await ids(), ["q3", "q2", "q1"]); await assertHiddenMeaning(current());
  assert.equal(routine().items[0].completedCount, 3, "不正解を再び正解へ直したら達成数を戻す");
  assert.equal(routine().items[0].completedQuestionKeys.length, 3);
  assert.deepEqual(routine().items[0].ratingCounts, { again: 0, hard: 1, good: 1, easy: 1 });
  assert.equal(routine().currentIndex, 0); assert.equal(routine().items[1].completedCount, 0);
  assert.equal(savedSession().answeredCount, routineAnswered); assert.equal(progress().q2.attempts, routineAttempts);
  assert.equal(activities.size, 3);
  const routineBeforeFailure = structuredClone(routine()), routineSessionBeforeFailure = structuredClone(savedSession());
  const routineRecordsBeforeFailure = structuredClone(progress()), routineActivitiesBeforeFailure = structuredClone([...activities]);
  failSave = true;
  await rows().nth(2).locator('[data-stream-rating="again"]').click();
  await page.waitForFunction(() => document.querySelector("#unlock-notice").textContent.includes("保存失敗") &&
    !document.querySelectorAll(".vocabulary-stream-row")[2].querySelector('[data-stream-rating="hard"]').disabled);
  assert.equal(await rows().nth(2).locator('[data-stream-rating="hard"]').getAttribute("aria-pressed"), "true");
  assert.deepEqual(routine(), routineBeforeFailure, "訂正の保存失敗でメニューの達成数と評価内訳を復元する");
  assert.deepEqual(savedSession(), routineSessionBeforeFailure); assert.deepEqual(progress(), routineRecordsBeforeFailure);
  assert.deepEqual([...activities], routineActivitiesBeforeFailure); assert.deepEqual(await ids(), ["q3", "q2", "q1"]);
  failSave = false;
  await revise(1, "good");
  assert.equal(routine().items[0].completedCount, 3, "失敗後の訂正も復元されたメニューの達成数を維持する");
  assert.deepEqual(routine().items[0].ratingCounts, { again: 0, hard: 1, good: 2, easy: 0 }, "失敗後の訂正で画面側に保存失敗の内訳が残らない");
  assert.deepEqual(await ids(), ["q3", "q2", "q1"]); assert.equal(activities.size, 3);
  assert.equal(speechRequests, 0); assert.deepEqual(errors, []);
  console.log("英単語3段の画面確認：英単語限定・訳の順次表示・最大3行と12評価・過去の評価修正・過去と現在の保存失敗の復元・再読み込み・既存モード・一手戻り・同問の再出題・スマートフォン横画面3サイズとパソコン・長い単語と訳の末尾への到達・毎日のメニューの学習方法復元と訂正時の達成数と内訳と失敗復元・無音を確認しました。");
  console.log("画面画像：" + screenshotPath);
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
