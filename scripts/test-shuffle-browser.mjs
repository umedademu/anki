import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { createSessionDatasetVersion } from "../public/deck-selection.js";
import { normalizeSetupPreferences, normalizeStudySession } from "../worker/src/index.js";

// 実際のCloudflareの科目一覧にある、問題を解く全14科目と同じ画面分岐を試す。
const subjects = [
  ["english-vocabulary", "英単語", "vocabulary"],
  ["world-history", "世界史", "history"], ["world-history-s", "世界史S", "history"],
  ["world-history-so", "世界史SO", "cards", true], ["japanese-history", "日本史", "history"],
  ["geography", "地理", "cards"], ["politics-economics", "政治・経済", "cards"],
  ["biology-basics", "生物基礎", "cards"], ["earth-science-basics", "地学基礎", "cards"],
  ["classical-japanese", "古文", "cards"], ["classical-chinese", "漢文", "cards"],
  ["funda", "ファンダ", "cards"], ["japanese-history-k", "日本史K", "history", true],
  ["politics-economics-k", "政治経済K", "history", true],
];
const root = path.resolve(import.meta.dirname, "..", "public"), objects = new Map(), fixtures = new Map();
const words = ["apple", "boat", "cat", "dog", "egg", "fish", "girl", "house", "ice", "juice", "king", "lemon"];
const catalog = [];
for (const [id, title, learningType, grouped] of subjects) {
  const terms = [], tasks = [], decks = ["deck-1", "deck-2"].map((deckId, deckIndex) => {
    const prefix = `${id}-${deckId}`;
    const deckTerms = words.map((word, index) => {
      const termId = `${prefix}-t${index}`, questionId = `${prefix}-q${index}`;
      tasks.push({ termId, questionId, stage: "beginner" });
      return { id: termId, term: word, reading: "", category: "試験", geography: {},
        vocabulary: { meaning: "意味", exampleEnglish: "Example.", exampleJapanese: "例文です。" },
        stages: { beginner: [{ id: questionId, stage: "beginner", type: "identify", prompt: `${word} ${deckIndex}`, answer: "意味" }], reverse: [], integrated: [] } };
    });
    terms.push(...deckTerms);
    const entry = { id: deckId, number: deckIndex + 1, datasetLabel: `${title}｜${deckId}`, version: `${prefix}-v1`,
      indexPath: `${prefix}/index.json`, termCount: 12, questionCount: 12 };
    objects.set(entry.indexPath, JSON.stringify({ ...entry, id, title, deckId, schemaVersion: 3, learningType,
      simpleQuestions: learningType === "cards", masteryTarget: 2, availableStages: ["beginner"],
      chunks: [{ path: `${prefix}/chunk.json` }] }));
    objects.set(`${prefix}/chunk.json`, JSON.stringify({ terms: deckTerms }));
    return entry;
  });
  catalog.push({ id, title, learningType, defaultDeckId: "deck-1", decks,
    ...(grouped ? { chapterGroups: [{ id: "chapter-1", number: 1, title: "第1章 試験", deckIds: ["deck-1", "deck-2"] }] } : {}) });
  fixtures.set(id, { terms, tasks, dataset: createSessionDatasetVersion(id, ["deck-1", "deck-2"], new Map(decks.map(deck => [deck.id, deck.version]))) });
}
objects.set("index.json", JSON.stringify({ schemaVersion: 3, subjects: catalog }));
objects.set("term-images.json", JSON.stringify({ schemaVersion: 2, assets: [], assignments: [] }));
const off = { history: { question: false, answer: false, explanation: false, mnemonic: false }, vocabulary: { word: false, meaning: false, exampleEnglish: false, exampleJapanese: false } };
let settings, sessions, progress;
const requests = [];
function reset(id, mode, sequentialEnabled, resumed) {
  const fixture = fixtures.get(id);
  sessions = new Map(); progress = new Map();
  settings = { shuffleEnabled: true, autoSpeechEnabled: false, speechParts: off, ratingSoundVolume: 0,
    studyTimeLimitSeconds: 600, goodSeconds: 86400, setupPreferences: normalizeSetupPreferences({ subjects: {
      [id]: { selectedDeckIds: ["deck-1", "deck-2"], selectedQuestionTypes: ["identify"], sequentialEnabled,
        deckOrder: ["deck-1", "deck-2"], studyMode: mode, decks: { "deck-1": { questionStyle: "beginner" } } },
    } }) };
  if (resumed) sessions.set(fixture.dataset, normalizeStudySession({
    tasks: fixture.tasks, queue: (sequentialEnabled ? fixture.tasks.slice(0, 12) : fixture.tasks).slice(1), currentTask: fixture.tasks[0],
    termIds: fixture.terms.map(term => term.id), deckIds: ["deck-1", "deck-2"], unseenQuestionIds: fixture.tasks.map(task => task.questionId),
    shuffleEnabled: false, sequentialEnabled, selectedStage: "beginner", studyMode: mode, deckOrder: ["deck-1", "deck-2"], roundId: "shuffle-round",
  }));
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost"); requests.push(url.pathname);
    const reply = value => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(value)); };
    if (url.pathname.startsWith("/v1/")) {
      const buffers = []; for await (const part of req) buffers.push(part);
      const body = buffers.length ? JSON.parse(Buffer.concat(buffers).toString()) : {};
      const dataset = url.searchParams.get("dataset"), sessionDataset = body.sessionDatasetVersion ?? dataset;
      if (url.pathname === "/v1/state") { reply({ settings, progress: { questions: progress.get(dataset) ?? {} }, session: sessions.get(dataset), studyDate: "2026-10-13" }); return; }
      if (url.pathname === "/v1/settings") { settings = { ...settings, ...body, autoSpeechEnabled: false, speechParts: off }; reply({ settings }); return; }
      if (url.pathname.startsWith("/v1/study-answer/")) {
        progress.set(dataset, { ...progress.get(dataset), [decodeURIComponent(url.pathname.split("/").pop())]: body.record });
      } else if (!url.pathname.startsWith("/v1/study-time/") && !url.pathname.startsWith("/v1/study-activity/") && url.pathname !== "/v1/study-session") throw new Error("試験用の未対応通信 " + url.pathname);
      const session = url.pathname === "/v1/study-session" ? body : body.session;
      if (session == null || req.method === "DELETE") sessions.delete(sessionDataset);
      else sessions.set(sessionDataset, normalizeStudySession(session));
      reply({ session: sessions.get(sessionDataset), updatedAt: new Date().toISOString() }); return;
    }
    if (url.pathname === "/config.js") { res.setHeader("Content-Type", "text/javascript"); res.end(`window.ANKI_CONFIG={dataBaseUrl:"/data",progressApiBaseUrl:"http://127.0.0.1:${server.address().port}"};`); return; }
    if (url.pathname.startsWith("/data/")) { res.setHeader("Content-Type", "application/json"); res.end(objects.get(url.pathname.slice(6)) ?? "{}"); return; }
    const target = path.resolve(root, "." + (url.pathname === "/" ? "/index.html" : url.pathname));
    if (!target.startsWith(root + path.sep)) throw new Error("公開範囲の外");
    res.setHeader("Content-Type", ({ ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" })[path.extname(target)] ?? "text/plain");
    res.end(await readFile(target));
  } catch (error) { res.writeHead(500); res.end(error.message); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext(); context.setDefaultTimeout(15000);
  // 試験開始前に読み上げをOFFにし、音声取得と実音声を止める。
  await context.addInitScript(parts => {
    localStorage.setItem("anki-cloud-access-key:v1", "shuffle-test-key");
    localStorage.setItem("anki-speech-settings:v1", JSON.stringify({ autoSpeechEnabled: false, speechParts: parts }));
    speechSynthesis.speak = () => {}; HTMLMediaElement.prototype.play = async () => {};
    if (window.AudioScheduledSourceNode) AudioScheduledSourceNode.prototype.start = () => {};
    let seed = 143;
    Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  }, off);
  await context.route("https://**/*", route => route.abort());
  const speech = (await readFile(path.join(root, "speech.js"), "utf8")).replace("export function createSpeechController(", "function unusedSpeechController(");
  await context.route("**/speech.js*", route => route.fulfill({ contentType: "text/javascript", body: speech + `\nexport function createSpeechController() { return { supported:true,paused:false,currentTarget:null,stop(){},unlock(){},pause(){return false},resume(){return false},speak(){return true},preload(){return Promise.resolve()}, stage(){return false} }; }` }));
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const setup = async id => {
    await page.goto(`${base}/?subject=${id}&view=setup&deck=deck-1&deck=deck-2`);
    await page.locator("#setup-panel").waitFor({ state: "visible" });
    await page.waitForFunction(() => !document.querySelector("#start-study").disabled);
  };
  let checked = 0;
  for (const [id, title] of (process.argv.includes("--extras-only") ? [] : subjects)) for (const mode of ["memorize", "listen-answer"]) for (const sequential of [false, true]) {
    reset(id, mode, sequential, true); await setup(id);
    assert.equal(await page.locator("#setup-shuffle").isChecked(), true);
    await page.locator("#resume-study").click();
    await page.waitForFunction(() => !document.querySelector("#study-shell").classList.contains("is-hidden") && !document.querySelector("#study-menu-trigger").disabled);
    const fixture = fixtures.get(id), saved = sessions.get(fixture.dataset);
    assert.equal(saved.shuffleEnabled, true, `${title}・${mode}・順番学習${sequential}：現在のチェックを古い途中記録で解除しない`);
    assert.equal(await page.locator("#setup-shuffle").isChecked(), true);
    const expectedIds = (sequential ? fixture.tasks.slice(0, 12) : fixture.tasks).map(task => task.questionId);
    const actualIds = [saved.currentTask, ...saved.queue].map(task => task.questionId);
    assert.deepEqual(new Set(actualIds), new Set(expectedIds), "問題を欠落・重複させず同じ出題範囲を保つ");
    assert.notDeepEqual(actualIds, expectedIds, `${title}：元の掲載順に戻さない`);
    const orderBefore = [...actualIds];
    await page.reload();
    await page.waitForFunction(() => !document.querySelector("#question-card").classList.contains("is-hidden"));
    if (!sequential) {
      const restored = sessions.get(fixture.dataset);
      assert.deepEqual([restored.currentTask, ...restored.queue].map(task => task.questionId), orderBefore, "再読み込みで保存済みの順序を作り直さない");
    }

    reset(id, mode, sequential, false); await setup(id);
    await page.locator("#start-study").click();
    await page.waitForFunction(() => !document.querySelector("#study-shell").classList.contains("is-hidden") && !document.querySelector("#study-menu-trigger").disabled);
    const fresh = sessions.get(fixture.dataset);
    assert.equal(fresh.shuffleEnabled, true);
    assert.notDeepEqual([fresh.currentTask, ...fresh.queue].map(task => task.questionId), expectedIds, `${title}：はじめからの開始も混ぜる`);
    assert.deepEqual(new Set([fresh.currentTask, ...fresh.queue].map(task => task.questionId)), new Set(expectedIds));
    checked++;
  }

  // オフへの切り替えも開始画面を優先し、現在の問題を保って残りを掲載順に戻す。
  reset("english-vocabulary", "memorize", false, true);
  settings.shuffleEnabled = false;
  const fixture = fixtures.get("english-vocabulary");
  const oldSession = sessions.get(fixture.dataset);
  oldSession.shuffleEnabled = true; oldSession.queue.reverse();
  oldSession.answeredCount = 7; oldSession.studySeconds = 45;
  await setup("english-vocabulary");
  assert.equal(await page.locator("#setup-shuffle").isChecked(), false);
  await page.locator("#resume-study").click();
  await page.waitForFunction(() => !document.querySelector("#study-shell").classList.contains("is-hidden") && !document.querySelector("#study-menu-trigger").disabled);
  const disabled = sessions.get(fixture.dataset);
  assert.equal(disabled.shuffleEnabled, false);
  assert.equal(disabled.answeredCount, 7); assert.equal(disabled.studySeconds, 45);
  assert.deepEqual([disabled.currentTask, ...disabled.queue].map(task => task.questionId), fixture.tasks.map(task => task.questionId));

  // オリジナルの問題も同じ再開処理を使い、シャッフルを変更して続けられる。
  reset("world-history", "memorize", false, false); settings.shuffleEnabled = false;
  await page.goto(base); await page.locator('[data-original-study]').click();
  await page.locator("#original-input").fill(words.map(word => `${word}\t意味`).join("\n"));
  await page.locator('[data-original="start"]').click();
  await page.locator("#setup-panel").waitFor({ state: "visible" });
  await page.waitForFunction(() => !document.querySelector("#start-study").disabled);
  await page.locator("#question-limit").fill("1"); await page.locator("#start-study").click();
  await page.locator("#next-action").click(); await page.locator("#good-action").click();
  await page.locator("#completion-return").click(); await page.locator("#setup-panel").waitFor({ state: "visible" });
  await page.locator("#setup-shuffle").check(); await page.locator("#question-limit").fill("5");
  await page.locator("#resume-study").click();
  await page.waitForFunction(() => !document.querySelector("#study-menu-trigger").disabled && document.body.classList.contains("is-studying"));
  assert.equal(await page.locator("#setup-shuffle").isChecked(), true, "オリジナルの古い途中記録でオフに戻さない");
  const shownWords = [];
  for (let i = 0; i < 5; i++) {
    shownWords.push(await page.locator("#question-text").textContent());
    await page.locator("#next-action").click(); await page.locator("#good-action").click();
    await page.waitForFunction(() => !document.querySelector("#completion-card").classList.contains("is-hidden") || !document.querySelector("#next-action").disabled);
  }
  assert.notDeepEqual(shownWords, words.slice(1, 6), "オリジナルの残りも掲載順のままにしない");
  assert.deepEqual(errors, []);
  assert.equal(requests.some(url => /\/v1\/.*(speech|rating-sound)/.test(url)), false);
  console.log(`${checked ? `全${subjects.length}科目・${checked}条件の新規開始と途中再開、` : ""}シャッフルのオン・オフ変更、現在の問題と回答数・時間の保持、オリジナルを無音で確認しました。`);
} finally { await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
