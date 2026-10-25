import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { createStudyRoutineRun } from "../public/study-routine.js";
import { normalizeSetupPreferences, normalizeStudySession } from "../worker/src/index.js";

const root = path.resolve(import.meta.dirname, "..", "public");
const off = { history: { question: false, answer: false, explanation: false, mnemonic: false },
  vocabulary: { word: false, meaning: false, exampleEnglish: false, exampleJapanese: false } };
const objects = new Map();
const deckIds = Array.from({ length: 6 }, (_, i) => `part-${i + 1}`);
const decks = deckIds.map((id, i) => {
  const count = i === 3 ? 12 : 2;
  const terms = Array.from({ length: count }, (_, j) => ({ id: `${id}-t${j}`, term: `${id}の言葉${j}`,
    geography: {}, category: "試験", stages: { beginner: [{ id: `${id}-q${j}`, stage: "beginner", type: "identify", prompt: `${id}の問題${j}`, answer: `答え${j}` }], reverse: [], integrated: [] } }));
  const entry = { id, number: i + 1, datasetLabel: `試験｜パート${i + 1}`, indexPath: `${id}/index.json`, version: `${id}-v1`, questionCount: count, termCount: count };
  objects.set(`${id}/index.json`, JSON.stringify({ id: "test", deckId: id, version: entry.version, title: "試験科目", learningType: "history", masteryTarget: 2, simpleQuestions: true,
    availableStages: ["beginner"], chunks: [{ path: `${id}/chunk.json` }] }));
  objects.set(`${id}/chunk.json`, JSON.stringify({ terms }));
  return entry;
});
// 3語表示を確かめる英単語の２デッキ（各２語）。
const vocabDeckIds = ["vocab-1", "vocab-2"];
const vocabDecks = vocabDeckIds.map((id, i) => {
  const terms = [0, 1].map(j => {
    const word = `${id}-word${j}`, meaning = `${id}の意味${j}`;
    const question = (stage, prompt, answer, prefix) => ({ id: `${id}-${prefix}${j}`, stage, type: stage === "beginner" ? "identify" : stage,
      prompt, answer, acceptedAnswers: [], keywords: [answer], answerNote: "品詞：試験", hideTermUntilAnswer: stage === "reverse" });
    return { id: `${id}-t${j}`, term: word, reading: "品詞：試験", category: "試験", importanceRank: j + 1, geography: {}, chronology: { sortYear: j + 1 },
      stages: { beginner: [question("beginner", word, meaning, "q")], reverse: [question("reverse", meaning, word, "r")], integrated: [] } };
  });
  const entry = { id, number: i + 1, datasetLabel: `試験用英単語${i + 1}`, indexPath: `${id}/index.json`, version: `${id}-v1`, questionCount: 4, termCount: 2 };
  objects.set(`${id}/index.json`, JSON.stringify({ id: "vocab", deckId: id, version: entry.version, title: "試験用英単語", learningType: "vocabulary", masteryTarget: 2,
    availableStages: ["beginner", "reverse"], chunks: [{ path: `${id}/chunk.json` }] }));
  objects.set(`${id}/chunk.json`, JSON.stringify({ terms }));
  return entry;
});
objects.set("index.json", JSON.stringify({ schemaVersion: 3, version: "test-v1", subjects: [{ id: "test", title: "試験科目", learningType: "history", defaultDeckId: deckIds[0], decks,
  chapterGroups: [{ id: "chapter-1", number: 1, title: "第1章 試験", deckIds }] },
  { id: "vocab", title: "試験用英単語", learningType: "vocabulary", defaultDeckId: vocabDeckIds[0], decks: vocabDecks }] }));
objects.set("term-images.json", JSON.stringify({ schemaVersion: 2, assets: [], assignments: [] }));
const basicPlan = [{ id: "study", subjectId: "test", questionTarget: 100 }, { id: "next", subjectId: "test", questionTarget: 10 }];
let settings, progress, sessions, answers, requests, failAnswer, failRoutine;
function reset({ learned = false, routine = false, completed = 0, plan = basicPlan } = {}) {
  progress = new Map(); sessions = new Map(); answers = []; requests = []; failAnswer = false; failRoutine = false;
  const future = new Date(Date.now() + 86400000).toISOString();
  const past = new Date(Date.now() - 86400000).toISOString();
  if (learned) for (const id of deckIds.slice(0, 3)) {
    progress.set(`${id}-v1`, Object.fromEntries([0, 1].map(i => [`${id}-q${i}`, { lastRating: "good", streak: 1, attempts: 1, rememberedCount: 1, lastAnsweredAt: new Date(Date.now() - 1000).toISOString(), nextReviewAt: future }])));
  }
  if (learned) {
    // この２問だけが開始時点で復習時期に達している。
    for (const id of ["part-1", "part-3"]) progress.get(`${id}-v1`)[`${id}-q0`].lastAnsweredAt = new Date(Date.now() - 2 * 86400000).toISOString();
  }
  const run = routine ? createStudyRoutineRun(plan, "2026-10-13", "sequential-run") : null;
  if (run) run.items[0].completedCount = completed;
  settings = { autoSpeechEnabled: false, speechParts: off, ratingSoundVolume: 0, studyTimeLimitSeconds: 600,
    studyRoutineOvertimeSeconds: 86400, goodSeconds: 86400, hardSeconds: 86400, easySeconds: 86400,
    setupPreferences: normalizeSetupPreferences({ subjects: { test: { selectedDeckIds: deckIds, sequentialEnabled: true, deckOrder: deckIds },
      vocab: { selectedDeckIds: vocabDeckIds, sequentialEnabled: true, deckOrder: vocabDeckIds } }, routinePlan: plan, routineRun: run }) };
}
reset();
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost"); requests.push(url.pathname);
    const reply = (body, status = 200) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
    if (url.pathname.startsWith("/v1/")) {
      const parts = []; for await (const part of req) parts.push(part);
      const body = parts.length ? JSON.parse(Buffer.concat(parts).toString()) : {};
      const dataset = url.searchParams.get("dataset"), sessionDataset = body.sessionDatasetVersion ?? dataset;
      if (url.pathname === "/v1/state") { reply({ settings, progress: { questions: progress.get(dataset) ?? {} }, session: sessions.get(dataset), studyDate: "2026-10-13" }); return; }
      if (url.pathname === "/v1/settings") { settings = { ...settings, ...body, autoSpeechEnabled: false, speechParts: off }; settings.setupPreferences = normalizeSetupPreferences(settings.setupPreferences); reply({ settings }); return; }
      if (url.pathname === "/v1/study-routine") {
        if (failRoutine) { reply({ error: "試験用の目標保存失敗" }, 503); return; }
        settings.setupPreferences = normalizeSetupPreferences({ ...settings.setupPreferences, ...body });
        reply({ setupPreferences: settings.setupPreferences, studyDate: "2026-10-13" }); return;
      }
      if (url.pathname.startsWith("/v1/study-answer/")) {
        if (failAnswer) { reply({ error: "試験用の回答保存失敗" }, 503); return; }
        const id = decodeURIComponent(url.pathname.split("/").pop());
        if (body.deleteActivityId) answers.pop(); else answers.push(id);
        const records = { ...progress.get(dataset) };
        if (body.record == null) delete records[id]; else records[id] = body.record;
        progress.set(dataset, records);
      } else if (!['/v1/study-session', '/v1/study-time/' + body.eventId].includes(url.pathname) &&
        !url.pathname.startsWith('/v1/study-time/') && !url.pathname.startsWith('/v1/study-activity/')) throw new Error("未対応の試験通信 " + url.pathname);
      if (body.routineRun) settings.setupPreferences = normalizeSetupPreferences({ ...settings.setupPreferences, routineRun: body.routineRun });
      const session = url.pathname === "/v1/study-session" ? body : body.session;
      if (req.method === "DELETE" || session == null) sessions.delete(sessionDataset);
      else sessions.set(sessionDataset, normalizeStudySession(session));
      reply({ session: sessions.get(sessionDataset), updatedAt: new Date().toISOString() }); return;
    }
    if (url.pathname === "/config.js") {
      res.setHeader("Content-Type", "text/javascript"); res.end(`window.ANKI_CONFIG={dataBaseUrl:"/data",progressApiBaseUrl:"http://127.0.0.1:${server.address().port}"};`); return;
    }
    if (url.pathname.startsWith("/data/")) {
      const body = objects.get(url.pathname.slice(6)); res.writeHead(body ? 200 : 404, { "Content-Type": "application/json" }); res.end(body ?? "{}"); return;
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
  const context = await browser.newContext();
  context.setDefaultTimeout(15000);
  // 試験の最初から自動読み上げをOFFにし、音声取得と実音声を止める。
  await context.addInitScript(off => {
    localStorage.setItem("anki-cloud-access-key:v1", "test-key");
    localStorage.setItem("anki-auto-speech:v1", "false");
    localStorage.setItem("anki-speech-parts:v1", JSON.stringify(off));
    speechSynthesis.speak = () => {};
    HTMLMediaElement.prototype.play = async () => {};
    if (window.AudioScheduledSourceNode) AudioScheduledSourceNode.prototype.start = () => {};
  }, off);
  await context.route("https://**/*", route => route.abort());
  const speech = (await readFile(path.join(root, "speech.js"), "utf8")).replace("export function createSpeechController(", "function unusedSpeechController(");
  await context.route("**/speech.js*", route => route.fulfill({ contentType: "text/javascript", body: speech + `\nexport function createSpeechController() { return { supported:true,paused:false,currentTarget:null,stop(){},unlock(){},pause(){return false},resume(){return false},speak(){return true},preload(){return Promise.resolve()}, stage(){return false} }; }` }));
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const shown = id => page.locator(`#${id}`).waitFor({ state: "visible" });
  const text = id => page.locator(`#${id}`).textContent();
  const setup = async () => {
    await page.goto(base + "/?subject=test&view=setup&" + deckIds.map(id => `deck=${id}`).join("&"));
    try {
      await shown("setup-panel"); await page.waitForFunction(() => !document.querySelector("#start-study").disabled);
    } catch (error) {
      console.error({ errors, errorPanel: await page.locator("#error-panel").textContent() });
      throw error;
    }
  };
  const answer = async rating => {
    if (!await page.locator("#answer-panel").isVisible()) await page.locator("#next-action").click();
    await page.locator(`#rating-buttons [data-rating="${rating}"]`).click();
    await page.waitForFunction(() => !document.querySelector("#study-shell").classList.contains("is-hidden") &&
      (!document.querySelector("#completion-card").classList.contains("is-hidden") || !document.querySelector("#next-action").disabled));
  };
  const start = async count => { await page.locator("#question-limit").fill(String(count)); await page.locator("#start-study").click(); await shown("study-shell"); await page.waitForFunction(() => !document.querySelector("#next-action").disabled); };

  // 難しい・正解を１度ずつ付ければ、同じ回で次のパートを開く。
  await setup(); assert.equal(await page.locator("#sequential-study").isChecked(), true);
  await start(3); assert.equal(await text("question-text"), "part-1の問題0");
  await answer("hard"); assert.equal(await text("question-text"), "part-1の問題1");
  await answer("good"); assert.equal(await text("question-text"), "part-2の問題0");
  await answer("good"); await shown("completion-card"); assert.equal(answers.length, 3);

  // 次のパートへ移った直後でも、一手戻りで元の問題と習得状態を復元する。
  reset(); await setup(); await start(4);
  await answer("good"); await answer("good");
  assert.equal(await text("question-text"), "part-2の問題0");
  await page.locator("#back-action").click();
  await page.waitForFunction(() => document.querySelector("#question-text").textContent === "part-1の問題1" && !document.querySelector("#good-action").disabled);
  assert.equal(progress.get("part-1-v1")["part-1-q1"], undefined);
  // パートの残りが不正解の問題だけなら、次のパートの問題を間にはさんで連続させない。
  await answer("again"); assert.equal(await text("question-text"), "part-2の問題0");
  await answer("good"); assert.equal(await text("question-text"), "part-1の問題1");
  await answer("good"); assert.equal(await text("question-text"), "part-2の問題1");

  // シャッフルONで、問題数の指定なし・指定あり・毎日のメニュー（10問）のいずれでも、
  // 不正解にした問題をすぐ次に出さない。パートの途中と、残りが不正解だけになった時の両方を確かめる。
  const menuPlan = [{ id: "study", subjectId: "test", questionTarget: 10 }, { id: "next", subjectId: "test", questionTarget: 10 }];
  for (const way of ["指定なし", "3問", "メニュー10問"]) {
    const begin = async () => {
      if (way === "メニュー10問") {
        reset({ routine: true, plan: menuPlan });
        await page.goto(base); await shown("continue-routine"); await page.locator("#continue-routine").click(); await shown("setup-panel");
        await page.waitForFunction(() => !document.querySelector("#start-study").disabled);
        assert.equal(await page.locator("#question-limit").inputValue(), "10");
      } else {
        reset(); await setup(); await page.locator("#question-limit").fill(way === "3問" ? "3" : "");
      }
      if (!await page.locator("#setup-shuffle").isChecked()) await page.locator("#setup-shuffle").click();
      await page.locator("#start-study").click();
      await shown("study-shell"); await page.waitForFunction(() => !document.querySelector("#next-action").disabled);
      const first = await text("question-text");
      assert.match(first, /^part-1の問題[01]$/);
      return [first, first.endsWith("0") ? "part-1の問題1" : "part-1の問題0"];
    };
    let [first, other] = await begin();
    await answer("again"); assert.equal(await text("question-text"), other, `${way}・パートの途中：不正解の直後は未出題の問題を出す`);
    [first, other] = await begin();
    await answer("good"); assert.equal(await text("question-text"), other);
    await answer("again");
    const between = await text("question-text");
    assert.notEqual(between, other, `${way}・残りが不正解だけ：同じ問題を続けて出さない`);
    assert.match(between, /^part-2の問題[01]$/, `${way}・残りが不正解だけ：次のパートの問題を間にはさむ`);
    assert.match(await text("term-progress"), /マスター 0 \//, `${way}：不正解が残るパートは習得扱いにしない`);
    await answer("again"); assert.equal(await text("question-text"), other, `${way}：はさんだ問題の後で不正解を再出題する`);
    await answer("again"); assert.notEqual(await text("question-text"), other, `${way}：もう一度不正解にしても続けて出さない`);
    if (way === "3問") assert.equal(await text("question-text"), between, `${way}：固定した問題が不正解２問だけなら交互に出す`);
  }

  // 英単語の3語表示でも、不正解にした単語をすぐ次の行に出さない。
  for (const limit of ["", "3"]) {
    const label = `3語表示・問題数${limit || "指定なし"}`;
    const top = () => page.locator(".vocabulary-stream-row").first();
    const topId = async () => {
      await page.waitForFunction(() => !document.querySelector(".vocabulary-stream-row [data-stream-reveal]")?.disabled);
      return top().getAttribute("data-question-id");
    };
    const rate = async rating => {
      await top().locator("[data-stream-reveal]").click();
      await top().locator(`[data-stream-rating="${rating}"]`).click();
      await page.waitForFunction(() => !document.querySelector(".vocabulary-stream-row [data-stream-reveal]")?.disabled ||
        !document.querySelector("#completion-card").classList.contains("is-hidden"));
    };
    const begin = async () => {
      reset();
      await page.goto(base + "/?subject=vocab&view=setup&" + vocabDeckIds.map(id => `deck=${id}`).join("&"));
      await shown("setup-panel"); await page.waitForFunction(() => !document.querySelector("#start-study").disabled);
      assert.equal(await page.locator("#sequential-study").isChecked(), true);
      await page.locator('input#vocabulary-stream-enabled, #vocabulary-stream-enabled input[type="checkbox"][role="switch"]').check();
      if (!await page.locator("#setup-shuffle").isChecked()) await page.locator("#setup-shuffle").click();
      await page.locator("#question-limit").fill(limit); await page.locator("#start-study").click();
      await shown("vocabulary-stream-panel");
      const first = await topId();
      assert.match(first, /^vocab-1-q[01]$/);
      return [first, first.endsWith("0") ? "vocab-1-q1" : "vocab-1-q0"];
    };
    let [first, other] = await begin();
    await rate("again"); assert.equal(await topId(), other, `${label}・デッキの途中：不正解の直後は未出題の単語を出す`);
    [first, other] = await begin();
    await rate("good"); assert.equal(await topId(), other);
    await rate("again");
    assert.match(await topId(), /^vocab-2-q[01]$/, `${label}・残りが不正解だけ：次のデッキの単語をはさんで続けて出さない`);
    await rate("good"); assert.equal(await topId(), other, `${label}：はさんだ単語の後で不正解を再出題する`);
  }

  // 不正解の問題は、今のパートの未出題問題の後ろで再出題し、すぐ次に繰り返さない。
  for (const limit of ["3", ""]) for (const shuffle of [false, true]) {
    reset(); await setup();
    if (await page.locator("#setup-shuffle").isChecked() !== shuffle) await page.locator("#setup-shuffle").click();
    await page.locator("#question-limit").fill(limit); await page.locator("#start-study").click();
    await shown("study-shell"); await page.waitForFunction(() => !document.querySelector("#next-action").disabled);
    const first = await text("question-text"), other = first.endsWith("0") ? "part-1の問題1" : "part-1の問題0";
    assert.match(first, /^part-1の問題[01]$/);
    const label = `問題数${limit || "指定なし"}・シャッフル${shuffle ? "ON" : "OFF"}`;
    await answer("again"); assert.equal(await text("question-text"), other, `${label}：不正解の直後は未出題の問題を出す`);
    await answer("good"); assert.equal(await text("question-text"), first, `${label}：未出題がなくなれば不正解を再出題する`);
    await answer("good"); assert.match(await text("question-text"), shuffle ? /^part-2の問題[01]$/ : /^part-2の問題0$/, `${label}：全問が不正解以外で次のパートへ進む`);
    assert.equal(answers.length, 3);
  }

  // ２問の復習の後でパート４を８問進め、10問で止める。
  reset({ learned: true }); await setup(); await start(10);
  for (let i = 0; i < 10; i++) await answer("good");
  await shown("completion-card");
  assert.deepEqual(answers.slice(0, 2), ["part-1-q0", "part-3-q0"]);
  assert.equal(answers.slice(2).every(id => id.startsWith("part-4-")), true);
  assert.equal(answers.length, 10); assert.match(await text("completion-title"), /10問/);
  await page.reload(); await shown("completion-card"); assert.equal(answers.length, 10, "再読み込みで制限を解除しない");
  await page.locator("#completion-return").click(); await shown("setup-panel");
  assert.equal(await page.locator("#question-limit").inputValue(), "10", "直接学習の問題数を保存する");
  await page.locator("#resume-study").click(); await shown("question-card");
  const before = await text("question-text"), count = answers.length;
  failAnswer = true; await answer("good");
  await page.waitForFunction(() => document.querySelector("#question-text").textContent === "part-4の問題8");
  assert.equal(await text("question-text"), before); assert.equal(answers.length, count, "保存失敗で進まない");
  failAnswer = false; await answer("good"); assert.equal(answers.length, count + 1);

  // 学習順を変えると次に覚える対象が変わり、科目設定へ保存される。
  reset({ learned: true }); await setup();
  for (let i = 0; i < 5; i++) await page.locator('button[data-sequential-deck="part-6"][data-direction="-1"]').click();
  await page.waitForFunction(() => document.querySelector("#sequential-status").textContent.includes("パート6"));
  await start(3); await answer("good"); await answer("good");
  assert.equal(await text("question-text"), "part-6の問題0");
  assert.equal(settings.setupPreferences.subjects.test.deckOrder[0], "part-6");

  // メニューの100問を開始画面へ引き継ぎ、今回だけ10問に変更する。
  reset({ learned: true, routine: true });
  await page.goto(base); await shown("continue-routine"); await page.locator("#continue-routine").click(); await shown("setup-panel");
  await page.waitForFunction(() => !document.querySelector("#start-study").disabled);
  assert.equal(await page.locator("#question-limit").inputValue(), "100");
  await start(10); for (let i = 0; i < 10; i++) await answer("good"); await shown("completion-card");
  assert.equal(answers.length, 10, "復習猶予で指定数を超えない");
  assert.equal(settings.setupPreferences.routineRun.items[0].questionTarget, 10);
  assert.equal(settings.setupPreferences.routineRun.currentIndex, 1);
  assert.equal(settings.setupPreferences.routinePlan[0].questionTarget, 100, "毎日の基本設定は変えない");

  // メニューの途中記録を含めて目標を数え、失敗した変更は開始しない。
  reset({ learned: true, routine: true, completed: 3 });
  await page.goto(base); await shown("continue-routine"); await page.locator("#continue-routine").click(); await shown("setup-panel");
  await page.waitForFunction(() => !document.querySelector("#start-study").disabled);
  failRoutine = true; await page.locator("#question-limit").fill("6"); await page.locator("#start-study").click();
  await page.waitForFunction(() => document.querySelector("#cloud-status").textContent.includes("共有できません"));
  assert.equal(await page.locator("#setup-panel").isVisible(), true); assert.equal(answers.length, 0);
  failRoutine = false; await page.locator("#start-study").click(); await shown("study-shell");
  for (let i = 0; i < 3; i++) await answer("good"); await shown("completion-card");
  assert.equal(settings.setupPreferences.routineRun.items[0].completedCount, 6); assert.equal(answers.length, 3);

  // 達成数より低い目標へ変更した場合は、新しい回答を加えず完了する。
  reset({ learned: true, routine: true, completed: 3 });
  await page.goto(base); await shown("continue-routine"); await page.locator("#continue-routine").click(); await shown("setup-panel");
  await page.waitForFunction(() => !document.querySelector("#start-study").disabled);
  await page.locator("#question-limit").fill("2"); await page.locator("#start-study").click(); await shown("completion-card");
  assert.equal(settings.setupPreferences.routineRun.items[0].completedCount, 3); assert.equal(answers.length, 0);

  // 聞き流しでも評価で習得を判定し、評価なしで次の未回答パートを開かない。
  reset(); await setup(); await page.locator('input[name="study-mode"][value="listen-answer"]').check();
  await start(3); await shown("listening-dock");
  for (let i = 0; i < 3; i++) {
    assert.equal(await text("question-text"), i < 2 ? `part-1の問題${i}` : "part-2の問題0");
    await page.locator("#listening-next-action").click();
    await page.locator("#listening-good-action").click();
    await page.waitForFunction(() => !document.querySelector("#completion-card").classList.contains("is-hidden") || !document.querySelector("#listening-next-action").disabled);
  }
  await shown("completion-card"); assert.equal(answers.length, 3);
  reset(); await setup(); await page.locator('input[name="study-mode"][value="listen-answer"]').check();
  await start(3);
  for (let i = 0; i < 2; i++) {
    assert.equal(await text("question-text"), `part-1の問題${i}`);
    await page.locator("#listening-next-action").click();
    await page.locator("#listening-next-action").click();
  }
  await shown("completion-card"); assert.match(await text("completion-message"), /今のパートの全問題/);
  assert.equal(answers.length, 0, "評価なしの聞き流しを習得にしない");

  await page.setViewportSize({ width: 390, height: 844 }); reset(); await setup();
  assert.equal(await page.locator("#sequential-order").isVisible(), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "スマートフォン幅で横にはみ出さない");
  assert.deepEqual(errors, []);
  assert.equal(requests.some(url => /\/v1\/.*(speech|rating-sound)/.test(url)), false);
  console.log("順番学習の画面確認：段階をまたぐ習得・不正解の再出題位置・不正解の問題を続けて出さない（指定なし・指定あり・メニュー10問・3語表示）・復習２問と新規８問・指定数終了・再読み込み・保存失敗・学習順保存・メニュー100問の引継ぎと今回だけの変更・途中件数・スマートフォン幅・無音を確認しました。");
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
