import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { createStudyRoutineRun } from "../public/study-routine.js";
import { normalizeSetupPreferences, normalizeStudySession } from "../worker/src/index.js";

const root = path.resolve(import.meta.dirname, "..", "public");
const diagnoseMotion = process.env.ANKI_STREAM_DIAGNOSE === "1";
const diagnosticViewSource = diagnoseMotion ? await readFile(path.join(root, "vocabulary-stream.js"), "utf8") : null;
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
let holdNextRevision = false, holdNextActivity = false, releaseRevision = null, releaseActivity = null;
const routinePlan = [{ id: "vocabulary", subjectId: "english-vocabulary", questionTarget: 8 }, { id: "history", subjectId: "test-history", questionTarget: 1 }];
function reset({ routine = false } = {}) {
  releaseRevision?.(); releaseActivity?.(); releaseRevision = null; releaseActivity = null;
  holdNextRevision = false; holdNextActivity = false;
  records = new Map(); sessions = new Map(); activities = new Map(); answerRequests = []; failSave = false;
  settings = {
    autoSpeechEnabled: false, speechParts: off, ratingSoundVolume: 0, shuffleEnabled: false,
    againSeconds: 86400, hardSeconds: 86400, goodSeconds: 86400, easySeconds: 86400,
    studyTimeLimitSeconds: 86400, listeningPauseSeconds: 0, listeningQuestionIntervalSeconds: 0,
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
        if (holdNextRevision && body.reviseActivityId) {
          holdNextRevision = false;
          await new Promise(resolve => { releaseRevision = resolve; });
          releaseRevision = null;
        }
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
      } else if (url.pathname.startsWith("/v1/study-activity/")) {
        if (holdNextActivity && !url.pathname.endsWith("/undo")) {
          holdNextActivity = false;
          await new Promise(resolve => { releaseActivity = resolve; });
          releaseActivity = null;
        }
        if (failSave) { reply({ error: "試験用の保存失敗" }, 503); return; }
        if (url.pathname.endsWith("/undo")) activities.delete(decodeURIComponent(url.pathname.split("/").at(-2)));
        else if (body.activity) activities.set(body.activity.eventId, { ...body.activity });
      } else if (url.pathname !== "/v1/study-session" && !url.pathname.startsWith("/v1/study-time/")) {
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
  const screenshotDirectory = await mkdtemp(path.join(tmpdir(), "anki-vocabulary-stream-"));
  const context = await browser.newContext({ viewport: { width: 812, height: 375 },
    ...(diagnoseMotion ? { recordVideo: { dir: screenshotDirectory, size: { width: 812, height: 375 } } } : {}) });
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
  if (diagnoseMotion) await context.route("**/vocabulary-stream.js*", route => route.fulfill({ contentType: "text/javascript", body: diagnosticViewSource }));
  const speech = (await readFile(path.join(root, "speech.js"), "utf8")).replace("export function createSpeechController(", "function unusedSpeechController(");
  await context.route("**/speech.js*", route => route.fulfill({ contentType: "text/javascript", body: speech + `
export function createSpeechController(){
  let paused = false;
  const control = window.__streamSpeechTest = {
    pending: null,
    preparations: [],
    complete() {
      if (paused || !this.pending) return false;
      const done = this.pending; this.pending = null; done(); return true;
    },
  };
  return {
    supported:true, get paused(){return paused;}, currentTarget:null,
    stop(){control.pending = null; paused = false;},
    unlock(options = {}) { control.preparations.push({ reset: options.reset === true, probe: options.probe === true, gesture: navigator.userActivation?.isActive }); },
    release() { control.releases = (control.releases ?? 0) + 1; control.pending = null; paused = false; return false; },
    pause(){paused = true; return true;},
    resume(){if (!paused) return false; paused = false; return true;},
    speak(_segments, callbacks = {}){paused = false; control.pending = callbacks.onComplete ?? callbacks.onEnd ?? null; return true;},
    preload(){return Promise.resolve()}, stage(){return false},
  };
}` }));
  // 評価音は鳴動指示だけを記録し、取得・音声の生成・実際の再生は行わない。
  await context.route("**/rating-sound.js*", route => route.fulfill({ contentType: "text/javascript", body: `
export function createRatingSoundPlayer(){
  const calls = window.__streamRatingSounds = [];
  return {
    play(rating){calls.push(rating); return true;},
    setVolume(value){return value;}, setCustomSound(){return Promise.resolve();},
    clearCustomSound(){return false;}, hasCustomSound(){return false;}, close(){return Promise.resolve();},
    releaseOutput(){ window.__streamRatingReleases = (window.__streamRatingReleases ?? 0) + 1; return Promise.resolve(); },
  };
}` }));
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const screenshotPath = path.join(screenshotDirectory, "vocabulary-stream-812x375.png");
  const setupScreenshotPath = path.join(screenshotDirectory, "vocabulary-stream-setup-812x375.png");
  const listeningScreenshotPath = path.join(screenshotDirectory, "vocabulary-stream-listening-812x375.png");
  const viewports = [{ width: 667, height: 375 }, { width: 812, height: 375 }, { width: 932, height: 430 }, { width: 1366, height: 768 }];
  const rows = () => page.locator("#vocabulary-stream-panel .vocabulary-stream-row");
  const current = () => rows().first();
  const streamToggle = () => page.locator('input#vocabulary-stream-enabled, #vocabulary-stream-enabled input[type="checkbox"][role="switch"]');
  const savedSession = () => sessions.get(vocabularyDeck.version);
  const progress = () => records.get(vocabularyDeck.version) ?? {};
  const ids = () => rows().evaluateAll(nodes => nodes.map(node => node.dataset.questionId));
  async function setup(subject = "english-vocabulary") {
    await page.goto(`${base}/?subject=${subject}&view=setup&deck=deck-1`);
    await page.locator("#setup-panel").waitFor({ state: "visible" });
    await page.waitForFunction(() => !document.querySelector("#start-study").disabled);
  }
  async function ready(id, mode = "memorize") {
    await page.waitForFunction(({ expected, mode }) => {
      const panel = document.querySelector("#vocabulary-stream-panel"), row = panel?.querySelector(".vocabulary-stream-row");
      const action = mode === "listen-answer" ? panel?.querySelector("#vocabulary-stream-toggle") : row?.querySelector("[data-stream-reveal]");
      return panel && !panel.classList.contains("is-hidden") && row?.dataset.questionId === expected && action && !action.disabled;
    }, { expected: id, mode });
  }
  async function start(count = 8, mode = "memorize") {
    await setup(); await page.locator(`input[name="study-mode"][value="${mode}"]`).check(); await streamToggle().check();
    await page.locator("#question-limit").fill(String(count));
    await page.locator("#start-study").click(); await ready("q0", mode);
  }
  async function reveal() {
    await current().locator("[data-stream-reveal]").click();
    await current().locator('[data-stream-rating="good"]').waitFor({ state: "visible" });
    await page.waitForFunction(() => !document.querySelector('.vocabulary-stream-row [data-stream-rating="good"]').disabled);
  }
  async function rate(rating, nextId) {
    await reveal(); await assertSoundClick(current().locator(`[data-stream-rating="${rating}"]`), rating); await ready(nextId);
  }
  async function revise(index, rating) {
    await assertSoundClick(rows().nth(index).locator(`[data-stream-rating="${rating}"]`), rating);
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

  async function saveSetupChange(action, mode, enabled) {
    const saved = page.waitForResponse(response => {
      if (!response.url().includes("/v1/settings") || !response.ok()) return false;
      const subject = response.request().postDataJSON()?.setupPreferences?.subjects?.["english-vocabulary"];
      return subject?.studyMode === mode && subject.vocabularyStreamEnabled === enabled;
    });
    await action(); await saved;
    assert.equal(settings.setupPreferences.subjects["english-vocabulary"].studyMode, mode);
    assert.equal(settings.setupPreferences.subjects["english-vocabulary"].vocabularyStreamEnabled, enabled);
  }
  async function listeningNext(nextId = null) {
    const next = page.locator("#vocabulary-stream-next");
    assert.equal((await next.textContent()).trim(), "次へ", "聞き流しの上部は常に次へと表示する");
    assert.equal(await page.locator("#vocabulary-stream-panel [data-stream-reveal]").count(), 0, "聞き流しに答え表示ボタンを作らない");
    if (!await current().locator(".vocabulary-stream-meaning").isVisible()) {
      assert.equal(await next.isDisabled(), true, "訳の自動表示前は次へを無効にする");
      await finishSpeech();
    }
    await page.waitForFunction(() => !document.querySelector("#vocabulary-stream-next").disabled &&
      !document.querySelector('.vocabulary-stream-row [data-stream-rating="good"]').disabled);
    if (nextId) { await next.click(); await ready(nextId, "listen-answer"); }
  }
  async function finishSpeech() {
    await page.waitForFunction(() => Boolean(window.__streamSpeechTest?.pending));
    assert.equal(await page.evaluate(() => window.__streamSpeechTest.complete()), true, "試験用の完了通知だけで聞き流しを進める");
  }
  async function assertPlayback(paused) {
    await page.waitForFunction(paused => document.querySelector("#vocabulary-stream-toggle")?.textContent.includes(paused ? "再生" : "一時停止"), paused);
  }
  async function savedWhen(predicate) {
    const deadline = Date.now() + 5000;
    while (!predicate()) {
      assert.ok(Date.now() < deadline, "試験用の保存が完了する");
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }
  async function assertSoundClick(button, rating = null) {
    const sounds = await button.evaluate(node => {
      const before = window.__streamRatingSounds.length;
      node.click();
      return window.__streamRatingSounds.slice(before);
    });
    assert.deepEqual(sounds, rating ? [rating] : [], rating ? "有効な評価は選んだ音の鳴動指示を同期で1回だけ出す" : "無効な評価は音の鳴動指示を出さない");
  }
  async function assertLayout(viewport, listening = false) {
    await page.setViewportSize(viewport);
    await page.waitForFunction(() => !document.querySelector("#vocabulary-stream-panel").getAnimations({ subtree: true })
      .some(animation => animation.playState === "running" || animation.playState === "pending"));
    await page.evaluate(() => window.scrollTo(0, 0));
    const layout = await page.locator("#vocabulary-stream-panel").evaluate(panel => {
      const box = node => {
        const rect = node.getBoundingClientRect(); return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
      };
      return {
        width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth,
        boxes: [...panel.querySelectorAll(".vocabulary-stream-row, [data-stream-rating]")].map(box),
        heading: [...panel.querySelector(".vocabulary-stream-heading").children].map(box),
      };
    });
    assert.equal(layout.boxes.length, 15);
    assert.equal(layout.overflow, false, `${viewport.width}×${viewport.height}で横にはみ出さない`);
    for (const box of layout.boxes) assert.ok(box.width > 0 && box.height > 0 && box.left >= -1 && box.top >= -1 && box.right <= layout.width + 1 && box.bottom <= layout.height + 1,
      `${viewport.width}×${viewport.height}で3行と12ボタンが画面に収まる：${JSON.stringify(box)}`);
    if (listening) {
      assert.equal(layout.heading.length, 5, "聞き流しの見出しと進捗と3つの操作を表示する");
      for (const box of layout.heading) assert.ok(box.width > 0 && box.height > 0 && box.left >= -1 && box.top >= -1 && box.right <= layout.width + 1 && box.bottom <= layout.height + 1,
        `${viewport.width}×${viewport.height}で上部操作を画面内に表示する`);
      for (let i = 0; i < layout.heading.length; i++) for (let j = i + 1; j < layout.heading.length; j++) {
        const a = layout.heading[i], b = layout.heading[j];
        assert.ok(Math.min(a.right, b.right) - Math.max(a.left, b.left) <= 1 || Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) <= 1,
          `${viewport.width}×${viewport.height}で上部の見出し・進捗・操作が重ならない`);
      }
      assert.ok(Math.max(...layout.heading.map(box => box.bottom)) <= layout.boxes[0].top + 1, "上部操作と最新の単語が重ならない");
    }
    await assertFullTextReachable(rows().nth(1), 2, viewport);
    await assertFullTextReachable(rows().nth(2), 1, viewport);
  }
  async function measureMotion(mode, reducedMotion, captureFrames = false) {
    reset(); await page.emulateMedia({ reducedMotion }); await page.setViewportSize({ width: 812, height: 375 }); await start(8, mode);
    if (mode === "memorize") await reveal(); else await listeningNext();
    await page.waitForFunction(() => !document.querySelector("#vocabulary-stream-panel").getAnimations({ subtree: true }).some(animation => animation.playState === "running"));
    if (captureFrames) await page.screenshot({ path: path.join(screenshotDirectory, "motion-before.png") });
    await page.evaluate(mode => {
      const panel = document.querySelector("#vocabulary-stream-panel");
      const originalRow = panel.querySelector('[data-question-id="q0"]');
      let originalAnimation = null;
      const measure = label => {
        const row = panel.querySelector('[data-question-id="q0"]');
        const animations = row.getAnimations();
        if (label === "immediate") originalAnimation = animations[0] ?? null;
        return { label, now: performance.now(), top: row.getBoundingClientRect().top,
          sameNode: row === originalRow, sameAnimation: Boolean(originalAnimation && animations.includes(originalAnimation)),
          transform: getComputedStyle(row).transform, reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
          animations: animations.map(animation => ({ state: animation.playState, currentTime: animation.currentTime, duration: animation.effect.getTiming().duration })) };
      };
      const result = window.__streamMotionDiagnosis = { samples: [measure("before")] };
      const observer = new MutationObserver(() => {
        if (panel.querySelector(".vocabulary-stream-row")?.dataset.questionId !== "q1") return;
        observer.disconnect(); result.samples.push(measure("immediate"));
        for (const delay of [60, 120, 240, 360]) setTimeout(() => {
          result.samples.push(measure(String(delay)));
          // 保存や音声の状態が更新される場合と同じ実操作で再描画を挟む。
          const redraw = delay === 60 ? panel.querySelector(mode === "memorize" ? ".vocabulary-stream-row [data-stream-reveal]" : "#vocabulary-stream-toggle")
            : delay === 120 && mode === "listen-answer" ? panel.querySelector("#vocabulary-stream-toggle") : null;
          if (redraw) {
            const clicked = !redraw.disabled; redraw.click();
            result.samples.push({ ...measure(`after-${delay}-redraw`), redrawTriggered: clicked });
          }
        }, delay);
      });
      observer.observe(panel, { childList: true, subtree: true });
    }, mode);
    if (mode === "memorize") await assertSoundClick(current().locator('[data-stream-rating="good"]'), "good"); else await finishSpeech();
    if (captureFrames) {
      await page.waitForFunction(() => window.__streamMotionDiagnosis.samples.some(sample => sample.label === "60"));
      await page.screenshot({ path: path.join(screenshotDirectory, "motion-middle.png") });
    }
    await page.waitForFunction(() => window.__streamMotionDiagnosis.samples.some(sample => sample.label === "360"));
    if (captureFrames) await page.screenshot({ path: path.join(screenshotDirectory, "motion-after.png") });
    return { mode, preference: reducedMotion, ...(await page.evaluate(() => window.__streamMotionDiagnosis)) };
  }
  function assertMotion(result) {
    const sample = label => result.samples.find(item => item.label === label);
    const before = sample("before"), immediate = sample("immediate"), middle = sample(result.preference === "reduce" ? "60" : "120"), final = sample("360");
    const context = `${result.mode}・${result.preference}`;
    assert.ok(final.top - before.top > 50, `${context}で前の単語が実際に1段下へ移動する`);
    assert.ok(immediate.top < final.top - 10, `${context}で新しい単語の出現直後に終点へ飛ばない`);
    assert.ok(middle.top > before.top + 2 && middle.top < final.top - 2, `${context}で途中の位置が開始位置と終点の両方から変わる`);
    assert.ok(middle.animations.some(animation => animation.state === "running"), `${context}の途中では実際の移動が進行中である`);
    assert.ok(result.samples.every(item => item.sameNode), `${context}で前の単語の行そのものを保持する`);
    const redraw = sample("after-60-redraw");
    assert.ok(redraw?.redrawTriggered && redraw.sameAnimation, `${context}で状態の再描画後も同じ移動を維持する`);
    assert.ok(Math.abs(final.top - sample("240").top) < (result.preference === "reduce" ? 1 : 4), `${context}の移動が終点で止まる`);
  }

  if (diagnoseMotion) {
    const diagnosis = [];
    for (const reducedMotion of ["no-preference", "reduce"]) for (const mode of ["memorize", "listen-answer"]) {
      const result = await measureMotion(mode, reducedMotion, mode === "memorize" && reducedMotion === "no-preference");
      diagnosis.push(result);
      assertMotion(result);
      await page.screenshot({ path: path.join(screenshotDirectory, `motion-${mode}-${reducedMotion}.png`) });
    }
    const jsonPath = path.join(screenshotDirectory, "motion-diagnosis.json");
    await writeFile(jsonPath, JSON.stringify(diagnosis, null, 2));
    console.log(JSON.stringify(diagnosis));
    console.log("動きの計測：" + jsonPath); console.log("動きの動画：" + await page.video().path());
  } else {
  // 暗記・聞き流しの2択を維持し、3語表示は英単語だけに独立した切替として表示する。
  await setup("test-history");
  assert.equal(await streamToggle().isVisible(), false);
  assert.deepEqual(await page.locator('input[name="study-mode"]').evaluateAll(nodes => nodes.map(node => node.value)), ["memorize", "listen-answer"]);
  for (const mode of ["memorize", "listen-answer"]) assert.equal(await page.locator(`input[name="study-mode"][value="${mode}"]`).isVisible(), true);
  await setup(); assert.equal(await streamToggle().isVisible(), true); assert.equal(await streamToggle().getAttribute("role"), "switch");
  await saveSetupChange(() => streamToggle().check(), "memorize", true);
  await saveSetupChange(() => page.locator('input[name="study-mode"][value="listen-answer"]').check(), "listen-answer", true);
  assert.equal(await streamToggle().isChecked(), true, "聞き流しへ切り替えても3語表示の選択を保持する");
  await saveSetupChange(() => streamToggle().uncheck(), "listen-answer", false);
  await saveSetupChange(() => page.locator('input[name="study-mode"][value="memorize"]').check(), "memorize", false);
  assert.equal(await streamToggle().isChecked(), false, "暗記へ切り替えても3語表示OFFを保持する");
  await saveSetupChange(() => streamToggle().check(), "memorize", true);
  await page.screenshot({ path: setupScreenshotPath, fullPage: true });
  await start();
  assert.equal(await rows().count(), 1); assert.deepEqual(await ids(), ["q0"]);
  assert.equal(await current().locator(".vocabulary-stream-word").textContent(), words[0]);
  await assertHiddenMeaning(current());
  for (const rating of ratings) {
    const button = current().locator(`[data-stream-rating="${rating}"]`);
    assert.equal(await button.isDisabled(), true); await assertSoundClick(button);
  }
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
  for (const viewport of viewports) {
    await assertLayout(viewport);
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
    await streamToggle().uncheck();
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
  for (const rating of ratings) {
    const button = rows().nth(1).locator(`[data-stream-rating="${rating}"]`);
    assert.equal(await button.isDisabled(), true); await assertSoundClick(button);
  }
  assert.equal(progress().q0.attempts, 1); assert.equal(activities.size, 1);

  // 聞き流しでも3語を残し、手動操作と無音の完了通知のどちらでも訳を順番に出す。
  reset(); await start(8, "listen-answer");
  assert.equal(await rows().count(), 1); await assertHiddenMeaning(current()); await assertPlayback(false);
  assert.equal(await page.locator("#vocabulary-stream-panel [data-stream-reveal]").count(), 0);
  assert.equal((await page.locator("#vocabulary-stream-next").textContent()).trim(), "次へ");
  assert.equal(await page.locator("#vocabulary-stream-next").isDisabled(), true);
  assert.equal(savedSession().studyMode, "listen-answer"); assert.equal(savedSession().vocabularyStreamEnabled, true);
  await listeningNext(); assert.equal(await current().locator(".vocabulary-stream-meaning").textContent(), meanings[0]);
  await listeningNext("q1"); assert.deepEqual(await ids(), ["q1", "q0"]); await assertHiddenMeaning(current());
  await listeningNext(); await listeningNext("q2");
  await listeningNext(); await listeningNext("q3");
  assert.deepEqual(await ids(), ["q3", "q2", "q1"]);
  assert.equal(await page.locator("#vocabulary-stream-panel [data-stream-rating]").count(), 12);
  assert.equal((await page.locator("#vocabulary-stream-panel").textContent()).includes("表示してはいけない例文"), false);
  for (const viewport of viewports) {
    await assertLayout(viewport, true);
    if (viewport.width === 812) await page.screenshot({ path: listeningScreenshotPath });
  }
  await assertHiddenMeaning(current()); await finishSpeech();
  await page.waitForFunction(() => !document.querySelector('.vocabulary-stream-row .vocabulary-stream-meaning').hidden);
  assert.equal(await current().locator(".vocabulary-stream-meaning").textContent(), meanings[3]);
  await finishSpeech(); await ready("q4", "listen-answer"); await savedWhen(() => activities.size === 4);
  assert.deepEqual(await ids(), ["q4", "q3", "q2"]); await assertHiddenMeaning(current());
  assert.equal(progress().q2, undefined, "聞き終えただけでは回答評価を記録しない");
  assert.equal([...activities.values()].find(activity => activity.questionId === "q2").rating ?? "", "");

  // 表示中の未評価の過去語へ後付けし、再訂正しても現在語や再生を進めない。
  const listenedCount = savedSession().answeredCount;
  await revise(2, "good");
  assert.deepEqual(await ids(), ["q4", "q3", "q2"]); await assertHiddenMeaning(current()); await assertPlayback(false);
  assert.equal(progress().q2.attempts, 1); assert.equal(savedSession().answeredCount, listenedCount);
  assert.equal(activities.size, 4); assert.equal([...activities.values()].find(activity => activity.questionId === "q2").rating, "good");
  assert.equal(answerRequests.at(-1).studyMode, "listen-answer"); assert.ok(answerRequests.at(-1).reviseActivityId);
  await revise(2, "easy");
  assert.equal(progress().q2.attempts, 1); assert.equal(savedSession().answeredCount, listenedCount); assert.equal(activities.size, 4);
  assert.deepEqual(savedSession().ratingCounts, { again: 0, hard: 0, good: 0, easy: 1 });
  await assertHiddenMeaning(current()); await assertPlayback(false);

  // 再読み込みで聞き流しと3語表示・並び・過去評価・未公開の訳を復元する。
  await page.reload(); await ready("q4", "listen-answer");
  assert.deepEqual(await ids(), ["q4", "q3", "q2"]); await assertHiddenMeaning(current());
  assert.equal(await rows().nth(2).locator('[data-stream-rating="easy"]').getAttribute("aria-pressed"), "true");
  assert.equal(savedSession().studyMode, "listen-answer"); assert.equal(savedSession().vocabularyStreamEnabled, true);
  await assertPlayback(true); await page.locator("#vocabulary-stream-toggle").click(); await assertPlayback(false); await finishSpeech();
  await page.waitForFunction(() => !document.querySelector('.vocabulary-stream-row .vocabulary-stream-meaning').hidden);
  assert.equal(await current().locator(".vocabulary-stream-meaning").textContent(), meanings[4]);
  await page.locator("#vocabulary-stream-toggle").click(); await assertPlayback(true);
  await revise(1, "hard");
  assert.deepEqual(await ids(), ["q4", "q3", "q2"]); await assertPlayback(true);
  assert.equal(await current().locator(".vocabulary-stream-meaning").textContent(), meanings[4]);
  assert.equal(await current().locator(".vocabulary-stream-meaning").isVisible(), true, "一時停止中の後付け評価で現在の訳を隠さない");
  assert.equal(progress().q3.attempts, 1); assert.equal(savedSession().answeredCount, listenedCount); assert.equal(activities.size, 4);

  // 訂正に失敗したら現在の語と公開済みの訳・過去評価を復元して一時停止する。
  await page.locator("#vocabulary-stream-toggle").click(); await assertPlayback(false);
  const listeningRecords = structuredClone(progress()), listeningActivities = structuredClone([...activities]);
  const listeningRatings = structuredClone(savedSession().ratingCounts);
  failSave = true;
  await rows().nth(2).locator('[data-stream-rating="again"]').click();
  await page.waitForFunction(() => document.querySelector("#unlock-notice").textContent.includes("保存失敗") &&
    !document.querySelectorAll(".vocabulary-stream-row")[2].querySelector('[data-stream-rating="easy"]').disabled);
  await assertPlayback(true); assert.deepEqual(await ids(), ["q4", "q3", "q2"]);
  assert.equal(await current().locator(".vocabulary-stream-meaning").textContent(), meanings[4]);
  assert.equal(await current().locator(".vocabulary-stream-meaning").isVisible(), true);
  assert.equal(await rows().nth(2).locator('[data-stream-rating="easy"]').getAttribute("aria-pressed"), "true");
  assert.deepEqual(progress(), listeningRecords); assert.deepEqual([...activities], listeningActivities);
  assert.deepEqual(savedSession().ratingCounts, listeningRatings); assert.equal(savedSession().answeredCount, listenedCount);
  failSave = false;

  // 聞き流しの一手戻りでも行と訳を戻し、現在語の評価で次へ進められる。
  reset(); await start(8, "listen-answer"); await listeningNext(); await listeningNext("q1");
  await savedWhen(() => activities.size === 1);
  await page.locator("#vocabulary-stream-back").click();
  await ready("q0", "listen-answer"); await assertPlayback(true);
  assert.deepEqual(await ids(), ["q0"]); assert.equal(await current().locator(".vocabulary-stream-meaning").textContent(), meanings[0]);
  await savedWhen(() => activities.size === 0);
  await current().locator('[data-stream-rating="good"]').click(); await ready("q1", "listen-answer");
  await savedWhen(() => activities.size === 1 && progress().q0?.lastRating === "good");
  assert.equal(progress().q0.attempts, 1); assert.equal(savedSession().studyMode, "listen-answer");

  // iPhoneの「続きから」では、保存通信を待つ前の利用者操作中に音声を準備し直す。
  await setup();
  await page.locator("#resume-study").click(); await ready("q1", "listen-answer");
  const reconnectPreparation = await page.evaluate(() => window.__streamSpeechTest.preparations.find(entry => entry.reset));
  assert.equal(reconnectPreparation?.gesture, true, "再開ボタンを押した時の操作中に再生許可を準備する");
  assert.equal(reconnectPreparation?.probe, true, "再開ボタンを押した時の操作中に無音の準備音を鳴らす");
  assert.deepEqual(await ids(), ["q1", "q0"], "音声の再準備で途中の表示行や問題を変えない");
  await assertPlayback(false);

  // 訂正の保存応答を保留しても現在語の再生を続け、自動送りの保存で訂正を消さない。
  reset(); await start(8, "listen-answer");
  await listeningNext(); await listeningNext("q1"); await listeningNext(); await listeningNext("q2");
  await savedWhen(() => activities.size === 2);
  holdNextRevision = true;
  await rows().nth(1).locator('[data-stream-rating="easy"]').click(); await savedWhen(() => Boolean(releaseRevision));
  await assertPlayback(false); await assertHiddenMeaning(current());
  await finishSpeech();
  await page.waitForFunction(() => !document.querySelector('.vocabulary-stream-row .vocabulary-stream-meaning').hidden);
  assert.equal(await current().locator(".vocabulary-stream-meaning").textContent(), meanings[2]);
  await finishSpeech();
  assert.equal(activities.size, 2, "訂正の保存前に後続の活動を保存しない");
  releaseRevision();
  await ready("q3", "listen-answer");
  await savedWhen(() => activities.size === 3 && progress().q1?.lastRating === "easy" && savedSession()?.currentTask?.questionId === "q3");
  assert.deepEqual(await ids(), ["q3", "q2", "q1"]); await assertHiddenMeaning(current()); await assertPlayback(false);
  assert.deepEqual(savedSession().ratingCounts, { again: 0, hard: 0, good: 0, easy: 1 });
  assert.equal(savedSession().vocabularyStreamRows.find(row => row.questionId === "q1").rating, "easy");
  assert.equal(progress().q1.attempts, 1);
  await page.reload(); await ready("q3", "listen-answer");
  assert.deepEqual(await ids(), ["q3", "q2", "q1"]);
  assert.equal(await rows().nth(2).locator('[data-stream-rating="easy"]').getAttribute("aria-pressed"), "true");
  assert.deepEqual(savedSession().ratingCounts, { again: 0, hard: 0, good: 0, easy: 1 });

  // 直前の活動保存が遅い場合も、訂正の準備前に次の途中記録を作らない。
  reset(); await start(8, "listen-answer"); holdNextActivity = true;
  await listeningNext(); await listeningNext("q1"); await savedWhen(() => Boolean(releaseActivity));
  await rows().nth(1).locator('[data-stream-rating="good"]').click();
  await finishSpeech();
  await page.waitForFunction(() => !document.querySelector('.vocabulary-stream-row .vocabulary-stream-meaning').hidden);
  await finishSpeech();
  await page.waitForTimeout(80);
  assert.deepEqual(await ids(), ["q1", "q0"], "訂正前の保存を待つ間は自動送りの境界で待機する");
  await assertPlayback(false);
  releaseActivity(); await ready("q2", "listen-answer");
  await savedWhen(() => activities.size === 2 && progress().q0?.lastRating === "good" && savedSession()?.currentTask?.questionId === "q2");
  assert.deepEqual(await ids(), ["q2", "q1", "q0"]); await assertHiddenMeaning(current());
  assert.deepEqual(savedSession().ratingCounts, { again: 0, hard: 0, good: 1, easy: 0 });
  assert.equal(savedSession().vocabularyStreamRows.find(row => row.questionId === "q0").rating, "good");
  assert.equal(progress().q0.attempts, 1); assert.equal(activities.size, 2);
  await page.reload(); await ready("q2", "listen-answer");
  assert.equal(await rows().nth(2).locator('[data-stream-rating="good"]').getAttribute("aria-pressed"), "true");
  assert.deepEqual(savedSession().ratingCounts, { again: 0, hard: 0, good: 1, easy: 0 });

  // 両方の学習方法で、4段階の最新評価・過去評価・同じ評価の押し直しを無音で調べる。
  for (const mode of ["memorize", "listen-answer"]) {
    reset(); await start(8, mode);
    for (const rating of ratings) {
      const button = current().locator(`[data-stream-rating="${rating}"]`);
      assert.equal(await button.isDisabled(), true); await assertSoundClick(button);
    }
    for (const [index, rating] of ratings.entries()) {
      if (mode === "memorize") await reveal(); else await listeningNext();
      await assertSoundClick(current().locator(`[data-stream-rating="${rating}"]`), rating);
      await ready(`q${index + 1}`, mode);
      await savedWhen(() => progress()[`q${index}`]?.lastRating === rating);
      const beforeRepeat = { record: structuredClone(progress()[`q${index}`]), count: savedSession().answeredCount,
        ratings: structuredClone(savedSession().ratingCounts), activities: structuredClone([...activities]), requests: answerRequests.length };
      await assertSoundClick(rows().nth(1).locator(`[data-stream-rating="${rating}"]`), rating);
      assert.deepEqual(progress()[`q${index}`], beforeRepeat.record, "同じ評価の押し直しは学習記録を増やさない");
      assert.equal(savedSession().answeredCount, beforeRepeat.count); assert.deepEqual(savedSession().ratingCounts, beforeRepeat.ratings);
      assert.deepEqual([...activities], beforeRepeat.activities); assert.equal(answerRequests.length, beforeRepeat.requests);
      const revised = ratings[(index + 1) % ratings.length];
      await revise(1, revised);
      assert.equal(progress()[`q${index}`].lastRating, revised); assert.equal(progress()[`q${index}`].attempts, 1);
      assert.equal(savedSession().answeredCount, beforeRepeat.count); assert.equal(activities.size, beforeRepeat.activities.length);
      assert.equal((await ids())[0], `q${index + 1}`, "音を付けるために現在の問題を進めない");
      await assertHiddenMeaning(current());
      if (mode === "listen-answer") {
        assert.equal(await page.locator("#vocabulary-stream-panel [data-stream-reveal]").count(), 0);
        assert.equal(await page.locator("#vocabulary-stream-next").isDisabled(), true);
      }
    }
  }

  // 毎日のメニューでも学習方法を復元し、過去の評価訂正で達成数と内訳を修正する。
  reset({ routine: true });
  await page.goto(base); await page.locator("#continue-routine").waitFor({ state: "visible" });
  await page.locator("#continue-routine").click();
  await page.locator("#setup-panel").waitFor({ state: "visible" });
  await page.waitForFunction(() => !document.querySelector("#start-study").disabled);
  assert.equal(await streamToggle().isChecked(), true, "保存済みの英単語3語表示をメニュー開始時にも復元する");
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
  // 中間位置を測り、完了を待つだけでは見逃す「コマ送り」への逆戻りを検知する。
  const motionResults = [];
  for (const reducedMotion of ["no-preference", "reduce"]) for (const mode of ["memorize", "listen-answer"]) {
    const result = await measureMotion(mode, reducedMotion); assertMotion(result); motionResults.push(result);
  }
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await writeFile(path.join(screenshotDirectory, "motion-regression.json"), JSON.stringify(motionResults, null, 2));
  assert.equal(speechRequests, 0); assert.deepEqual(errors, []);
  console.log("英単語3段の画面確認：暗記と聞き流しの2択・独立した3語表示切替・訳の順次表示・最大3行と12評価・過去の評価修正・保存失敗の復元・再読み込み・一手戻り・同問の再出題・スマートフォン横画面3サイズとパソコン・長い本文の末尾への到達・聞き流しの手動と自動進行と後付け評価と再生状態維持・聞き流しの答え表示ボタン省略と訳前の次へ無効・最新と過去の4評価の鳴動指示・同じ評価の押し直し・無効操作の無音・毎日のメニューの達成数と内訳訂正・通常と動作軽減設定の途中座標と再描画中の移動継続・実音声なしを確認しました。");
  console.log("画面画像：" + screenshotPath);
  console.log("開始画面の画像：" + setupScreenshotPath);
  console.log("聞き流しの画像：" + listeningScreenshotPath);
  console.log("動きの実測：" + path.join(screenshotDirectory, "motion-regression.json"));
  }
} finally {
  releaseRevision?.(); releaseActivity?.();
  await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
