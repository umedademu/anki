import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { loadJapaneseHistoryK, loadJapaneseKAdditions, appendJapaneseKDecks } from "./japanese-history-k.mjs";
import { filterQuestionTypes, resolveQuestionTypes } from "../public/question-types.js";
import { groupSODecks } from "../public/so-chapters.js";

const root = path.resolve(import.meta.dirname, "../public"), plan = await loadJapaneseHistoryK();
const additions = await loadJapaneseKAdditions();
const countQuestions = terms => terms.reduce((sum, term) => sum + Object.values(term.stages).flat().length, 0);
const countStage = (terms, stage) => terms.reduce((sum, term) => sum + term.stages[stage].length, 0);
const defaultTerms = filterQuestionTypes(plan.terms, resolveQuestionTypes());
const plain = text => String(text).replaceAll("**", "");
const objects = new Map(), cloudBase = "https://pub-76ffbe2829114a5cbaa433db45872267.r2.dev";
async function cloudJson(key) {
  const response = await fetch(`${cloudBase}/${key}?japaneseKTest=${Date.now()}`, { signal: AbortSignal.timeout(30000) });
  assert.ok(response.ok, `Cloudflareの${key}を取得できません。`);
  const value = await response.json(); objects.set(key, JSON.stringify(value)); return value;
}
// 現行科目一覧をCloudflareから取得し、新規原稿を試験用の通信へ組み合わせる。
const original = await cloudJson("index.json");
const existing = original.subjects.find(subject => subject.id === plan.subject.id);
assert.ok(existing, "Cloudflare上の既存日本史Kを使います。");
const catalog = appendJapaneseKDecks(original, additions);
const combinedSubject = catalog.subjects.find(subject => subject.id === plan.subject.id);
const groups = groupSODecks(combinedSubject.decks, combinedSubject.chapterGroups);
const plansById = new Map([plan, ...additions].map(value => [value.index.deckId, value]));
objects.set("index.json", JSON.stringify(catalog));
for (const object of plan.objects) objects.set(object.key, JSON.stringify(object.value));
for (const addition of additions) for (const object of addition.objects) objects.set(object.key, JSON.stringify(object.value));
objects.set("term-images.json", JSON.stringify({ schemaVersion: 2, assets: [], assignments: [] }));
const off = { history: { question: false, answer: false, explanation: false, mnemonic: false }, vocabulary: { word: false, meaning: false, exampleEnglish: false, exampleJapanese: false } };
let settings = { autoSpeechEnabled: false, speechParts: off, setupPreferences: { subjects: {} }, studyTimeLimitSeconds: 600, ratingSoundVolume: 0 };
const sessions = new Map(), progress = new Map(), answers = [], requests = [];
const oldVersion = "japanese-history-k-book-06-01-01-v2", oldSession = { oldTrial: true };
sessions.set(oldVersion, oldSession);
progress.set(oldVersion, { "JHK2-06-01-01-U01-B01": { everMastered: true, attempts: 10 } });
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost"); requests.push(url.pathname);
    const reply = (value, status = 200) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(value)); };
    if (url.pathname.startsWith("/v1/")) {
      const buffers = []; for await (const part of req) buffers.push(part);
      const body = buffers.length ? JSON.parse(Buffer.concat(buffers).toString()) : {}, dataset = url.searchParams.get("dataset");
      if (url.pathname === "/v1/state") { reply({ settings, progress: { questions: progress.get(dataset) ?? {} }, session: sessions.get(dataset), studyDate: "2026-10-02" }); return; }
      if (url.pathname === "/v1/settings") { settings = { ...settings, ...body, autoSpeechEnabled: false, speechParts: off }; reply({ settings }); return; }
      if (url.pathname === "/v1/study-session") {
        if (req.method === "DELETE") sessions.delete(dataset); else sessions.set(dataset, body);
        reply({ session: sessions.get(dataset) }); return;
      }
      if (url.pathname.startsWith("/v1/study-answer/")) {
        answers.push({ dataset, body }); sessions.set(body.sessionDatasetVersion ?? dataset, body.session);
        const id = decodeURIComponent(url.pathname.split("/").pop());
        progress.set(dataset, { ...progress.get(dataset), [id]: body.record });
        reply({ session: body.session, updatedAt: new Date().toISOString() }); return;
      }
      if (url.pathname.startsWith("/v1/study-time/")) {
        if (body.session) sessions.set(body.sessionDatasetVersion ?? dataset, body.session);
        reply({ session: body.session, studyDate: "2026-10-02" }); return;
      }
      throw new Error("未対応の試験用通信: " + url.pathname);
    }
    if (url.pathname === "/config.js") {
      res.setHeader("Content-Type", "text/javascript");
      res.end(`window.ANKI_CONFIG={dataBaseUrl:"/data",progressApiBaseUrl:"http://127.0.0.1:${server.address().port}"};`); return;
    }
    if (url.pathname.startsWith("/data/")) {
      const key = url.pathname.slice(6);
      if (!objects.has(key)) await cloudJson(key);
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(objects.get(key)); return;
    }
    const target = path.resolve(root, "." + (url.pathname === "/" ? "/index.html" : url.pathname));
    if (!target.startsWith(root + path.sep)) throw new Error("公開フォルダー外");
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
  const audioAttempts = [];
  await context.exposeBinding("reportTestAudioAttempt", (_source, kind) => { audioAttempts.push(kind); });
  // 試験開始前に全自動音声をOFFにし、実際の音声再生も遮断する。
  await context.addInitScript(parts => {
    localStorage.setItem("anki-cloud-access-key:v1", "japanese-k-test-only");
    localStorage.setItem("anki-speech-settings:v1", JSON.stringify({ autoSpeechEnabled: false, speechParts: parts }));
    window.testAudioAttempts = 0;
    const blocked = kind => { window.testAudioAttempts++; void window.reportTestAudioAttempt(kind); };
    speechSynthesis.cancel(); speechSynthesis.speak = () => { blocked("音声読み上げ"); };
    HTMLMediaElement.prototype.play = () => { blocked("音声ファイル"); return Promise.resolve(); };
    if (window.AudioScheduledSourceNode) AudioScheduledSourceNode.prototype.start = () => { blocked("効果音"); };
  }, off);
  await context.route("https://**/*", route => route.abort());
  const cloudProgress = (await readFile(path.join(root, "cloud-progress.js"), "utf8")).replace("export function normalizeSpeechParts(value)", "function unusedNormalizeSpeechParts(value)");
  await context.route("**/cloud-progress.js*", route => route.fulfill({ contentType: "text/javascript", body: cloudProgress + `\nexport function normalizeSpeechParts() { return ${JSON.stringify(off)}; }` }));
  const speechModule = (await readFile(path.join(root, "speech.js"), "utf8")).replace("export function createSpeechController(", "function unusedSpeechController(");
  await context.route("**/speech.js*", route => route.fulfill({ contentType: "text/javascript", body: speechModule + `\nexport function createSpeechController() { return { supported: true, paused: false, currentTarget: null, stop() {}, unlock() {}, pause() { return false; }, resume() { return false; }, speak(segments = []) { if (segments.some(segment => String(segment?.text ?? "").trim())) { window.testAudioAttempts++; void window.reportTestAudioAttempt("読み上げ要求"); } return false; }, preload() { return Promise.resolve(); } }; }` }));
  // 音量ゼロでも内部で音源を開始するため、試験では評価音の処理も無音の代替にする。
  const ratingSoundModule = (await readFile(path.join(root, "rating-sound.js"), "utf8")).replace("export function createRatingSoundPlayer(", "function unusedRatingSoundPlayer(");
  await context.route("**/rating-sound.js*", route => route.fulfill({ contentType: "text/javascript", body: ratingSoundModule + `\nexport function createRatingSoundPlayer() { return { play() { return false; }, setVolume(value) { return value; }, clearCustomSound() {}, setCustomSound() { return Promise.resolve(false); }, close() { return Promise.resolve(); } }; }` }));
  const page = await context.newPage(), errors = []; page.on("pageerror", error => errors.push(error.message));
  const shown = id => page.locator("#" + id).waitFor({ state: "visible" });
  const ready = () => page.waitForFunction(() => document.querySelector("#setup-panel").getAttribute("aria-busy") !== "true" && !document.querySelector("#start-study").disabled);
  const assertSummary = async terms => {
    const summary = await page.locator("#selection-summary").textContent();
    assert.ok(summary.includes(`${terms.length}項目・${countQuestions(terms)}問`), summary);
    assert.ok(summary.includes(`基礎の一問一答 ${countStage(terms, "beginner")}問`), summary);
  };
  const assertTextClearOfButtons = async ids => {
    const results = await page.evaluate(textIds => textIds.map(id => {
      const text = document.getElementById(id);
      const container = text.closest(".question-spoken-block, .answer, .term-overview");
      const buttons = [...container.querySelectorAll(":scope > .study-edit-button, :scope > .speech-button")]
        .filter(button => button.getClientRects().length && getComputedStyle(button).visibility !== "hidden")
        .map(button => ({ label: button.getAttribute("aria-label"), rect: button.getBoundingClientRect() }));
      const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT), range = document.createRange();
      const overlaps = []; let characters = 0, node;
      // 要素全体の余白ではなく、改行・太字・読みを含む一文字ずつの表示範囲を調べる。
      while ((node = walker.nextNode())) {
        let offset = 0;
        for (const character of node.textContent) {
          const start = offset; offset += character.length;
          if (/\s/u.test(character)) continue;
          range.setStart(node, start); range.setEnd(node, offset);
          for (const rect of range.getClientRects()) {
            if (!rect.width || !rect.height) continue;
            characters++;
            for (const button of buttons) {
              const overlapWidth = Math.min(rect.right, button.rect.right) - Math.max(rect.left, button.rect.left);
              const overlapHeight = Math.min(rect.bottom, button.rect.bottom) - Math.max(rect.top, button.rect.top);
              if (overlapWidth > 0.5 && overlapHeight > 0.5 && overlaps.length < 3) overlaps.push({ id, character, button: button.label });
            }
          }
        }
      }
      return { id, characters, buttonCount: buttons.length, overlaps };
    }), ids);
    for (const result of results) {
      assert.ok(result.characters > 0, `${result.id}の表示中の文字を検査します。`);
      assert.equal(result.buttonCount, 2, `${result.id}の編集・読み上げボタンを検査します。`);
      assert.deepEqual(result.overlaps, [], `${result.id}の文字に編集・読み上げボタンが重なりません。`);
    }
  };
  const assertStudyDisplay = async (question, answerVisible) => {
    await page.waitForFunction(() => !document.querySelector("#next-action").disabled);
    assert.equal(await page.locator("#context-card").isVisible(), false, "上部の用語枠は全段階で表示しません。");
    assert.equal(await page.locator("#question-speech").getAttribute("aria-pressed"), "false");
    assert.equal(await page.locator("#answer-speech").getAttribute("aria-pressed"), "false");
    assert.equal(await page.locator("#overview-speech").getAttribute("aria-pressed"), "false");
    assert.equal(await page.locator("#answer-panel").isVisible(), answerVisible);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await assertTextClearOfButtons(answerVisible ? ["question-text", "answer-text", "term-overview-text"] : ["question-text"]);
    if (answerVisible) {
      assert.equal(await page.locator("#answer-text").textContent(), plain(question.answer));
      if (question.stage !== "beginner") assert.ok(await page.locator("#answer-text strong").count() > 0, "説明回答の重要語が太字で表示されます。");
      assert.doesNotMatch(await page.locator("#answer-text").textContent(), /\*\*/);
      assert.match(await page.locator("#term-overview-text").textContent(), /原文の根拠：[0-9]+頁/);
      assert.doesNotMatch(await page.locator("#term-overview-text").textContent(), /<br\s*\/?>|\|/i, "引用の表の記号をそのまま表示しません。");
    }
  };
  await page.goto(base + "/");
  await page.getByRole("button", { name: "日本史K", exact: true }).click(); await shown("setup-panel"); await ready();
  assert.deepEqual(await page.locator("#deck-filter .deck-filter-name").allTextContents(), ["第5章 近代", "第6章 現代"]);
  assert.deepEqual(await page.locator("#deck-filter .deck-filter-count").allTextContents(), groups.map(group => `${group.decks.reduce((sum, deck) => sum + deck.questionCount, 0).toLocaleString("ja-JP")}問`));
  const picker = number => page.locator(`.chapter-picker[data-chapter-id="chapter-${number}"]`);
  assert.equal(await picker(6).locator("summary").textContent(), "第6章のパート：1 / 15パート");
  assert.equal(await picker(5).locator("summary").textContent(), `第5章のパート：0 / ${groups.find(group => group.number === 5).decks.length}パート`);
  await assertSummary(defaultTerms);
  assert.equal(await page.locator("#question-style-filter").inputValue(), "");
  assert.equal(await page.locator("#question-type-field").isVisible(), true);
  for (const group of groups) {
    assert.deepEqual(await picker(group.number).locator(".deck-filter-name").allTextContents(), group.deckIds.map(id => plansById.get(id).index.datasetLabel.split("｜")[1]));
  }
  await picker(6).locator("summary").click();
  await picker(6).getByRole("button", { name: "全パートを解除" }).click();
  assert.equal(await page.locator("#start-study").isDisabled(), true);
  await page.locator('#deck-filter input[value="chapter-5"]').check(); await ready();
  await assertSummary(filterQuestionTypes(additions.filter(value => value.index.deckId.startsWith("book-05-")).flatMap(value => value.terms), resolveQuestionTypes()));
  for (const group of groups) {
    for (const other of groups) if (other.id !== group.id && await picker(other.number).isVisible() && await picker(other.number).evaluate(element => element.open)) await picker(other.number).locator("summary").click();
    if (!await picker(group.number).evaluate(element => element.open)) await picker(group.number).locator("summary").click();
    await picker(group.number).getByRole("button", { name: "全パートを選択" }).click(); await ready();
    await picker(group.number).locator("summary").click();
  }
  await assertSummary(filterQuestionTypes([plan, ...additions].flatMap(item => item.terms), resolveQuestionTypes()));
  for (const group of groups) assert.equal(await picker(group.number).locator("summary").textContent(), `第${group.number}章：全${group.decks.length}パート`);
  // GHQの既存の動作確認は一小項目に絞り、新規問題は後で個別に確認する。
  for (const addition of additions) {
    const number = addition.definition.chapterGroups[0].number;
    for (const other of groups) if (other.number !== number && await picker(other.number).isVisible() && await picker(other.number).evaluate(element => element.open)) await picker(other.number).locator("summary").click();
    if (!await picker(number).evaluate(element => element.open)) await picker(number).locator("summary").click();
    await page.locator(`.chapter-picker input[value="${addition.index.deckId}"]`).uncheck(); await ready();
  }
  for (const group of groups) if (await picker(group.number).isVisible() && await picker(group.number).evaluate(element => element.open)) await picker(group.number).locator("summary").click();
  await page.locator("#question-type-summary").click();
  for (const [type, label] of [["time", "時期"], ["reverse", "逆向きの説明"], ["integrated", "統合説明"]]) {
    const count = plan.terms.flatMap(term => Object.values(term.stages).flat()).filter(question => question.type === type).length;
    assert.ok((await page.locator('#question-type-options label').filter({ hasText: label }).textContent()).includes(`${count}問`));
  }
  await page.locator('[data-question-types="none"]').click();
  assert.equal(await page.locator("#start-study").isDisabled(), true);
  await page.locator('#question-type-options input[value="relation"]').check(); await ready();
  assert.match(await page.locator("#selection-summary").textContent(), /基礎の一問一答/);
  await page.locator('[data-question-types="all"]').click();
  await assertSummary(plan.terms);
  await page.locator("#setup-shuffle").uncheck();
  const images = path.resolve(import.meta.dirname, "../.wrangler/japanese-history-k/screenshots"); await mkdir(images, { recursive: true });
  await page.screenshot({ path: path.join(images, "setup-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: path.join(images, "setup-mobile.png"), fullPage: true });
  await page.locator("#start-study").click(); await shown("study-shell");
  assert.equal(await page.locator("#subject-name").textContent(), "日本史K｜第6章 現代");
  assert.equal(await page.locator("#question-speech").getAttribute("aria-pressed"), "false");
  assert.equal(await page.locator("#question-text").textContent(), plan.terms[0].stages.beginner[0].prompt);
  assert.equal(await page.locator("#term-overview").isVisible(), false);
  await assertStudyDisplay(plan.terms[0].stages.beginner[0], false);
  await page.locator("#next-action").click();
  await assertStudyDisplay(plan.terms[0].stages.beginner[0], true);
  await page.screenshot({ path: path.join(images, "answer-mobile.png"), fullPage: true });
  await page.locator("#good-action").click();
  await page.waitForFunction(prompt => document.querySelector("#question-text").textContent === prompt, plan.terms[1].stages.beginner[0].prompt);
  await page.waitForFunction(() => !document.querySelector("#next-action").disabled);
  assert.equal(answers.length, 1);
  assert.equal(answers[0].dataset, plan.index.version);
  assert.equal(answers[0].body.activity.subjectId, plan.subject.id);
  assert.ok(answers[0].body.session.tasks.every(task => task.stage === "beginner"));
  await page.reload(); await shown("study-shell");
  assert.equal(await page.locator("#question-text").textContent(), plan.terms[1].stages.beginner[0].prompt);
  // 一項目を基礎から説明へ進め、実際の画面で自動移行を確認する。
  await page.locator("#study-stop").click(); await shown("setup-panel"); await ready();
  // 保存再開の試験と分け、新しい版の試験用記録だけを空にする。旧版は保持する。
  sessions.delete(plan.index.version); progress.delete(plan.index.version);
  await page.goto(`${base}/?subject=${plan.subject.id}&view=setup`); await shown("setup-panel"); await ready();
  const focused = plan.terms[0];
  assert.equal(focused.category, "占領統治");
  assert.equal(plan.terms.filter(term => term.category === focused.category).length, 1);
  assert.ok(focused.stages.reverse.length > 1, "全説明問題を習得するまで統合へ進まない条件を画面で検証します。");
  await page.locator("#category-filter").selectOption(focused.category);
  await assertSummary([focused]);
  await page.locator("#start-study").click(); await shown("study-shell");
  for (const question of [...focused.stages.beginner, ...focused.stages.reverse]) {
    await page.waitForFunction(prompt => document.querySelector("#question-text").textContent === prompt, question.prompt);
    await assertStudyDisplay(question, false);
    assert.equal(sessions.get(plan.index.version).currentTask.stage, question.stage);
    await page.locator("#next-action").click();
    await assertStudyDisplay(question, true);
    await page.locator("#easy-action").click();
  }
  await page.waitForFunction(prompt => document.querySelector("#question-text").textContent === prompt, focused.stages.integrated[0].prompt);
  await page.waitForFunction(() => !document.querySelector("#next-action").disabled);
  assert.equal(sessions.get(plan.index.version).currentTask.stage, "integrated");
  assert.ok(sessions.get(plan.index.version).tasks.some(task => task.stage === "reverse"));
  assert.ok(focused.stages.reverse.every(question => progress.get(plan.index.version)[question.id]?.everMastered));
  await assertStudyDisplay(focused.stages.integrated[0], false);
  await page.screenshot({ path: path.join(images, "integrated-mobile.png"), fullPage: true });
  await page.reload(); await shown("study-shell");
  assert.equal(await page.locator("#question-text").textContent(), focused.stages.integrated[0].prompt);
  await assertStudyDisplay(focused.stages.integrated[0], false);
  await page.locator("#next-action").click();
  await assertStudyDisplay(focused.stages.integrated[0], true);
  assert.ok(focused.stages.integrated[0].source.evidence.some(fact => fact.quote.includes("<br>")), "原文の改行指定を含む引用が保持されています。");
  assert.ok((await page.locator("#term-overview-text").textContent()).includes("1945／GHQによる占領、五大改革指令／財閥解体、農地改革指令"), "年表の原文を内容を変えず読める形で表示します。");
  await page.screenshot({ path: path.join(images, "integrated-answer-mobile.png"), fullPage: true });
  assert.deepEqual(sessions.get(oldVersion), oldSession);
  assert.equal(progress.get(oldVersion)["JHK2-06-01-01-U01-B01"].attempts, 10);
  const ghqRecords = structuredClone(progress.get(plan.index.version));
  for (const addition of additions) {
    await page.locator("#study-stop").click(); await shown("setup-panel"); await ready();
    await page.goto(`${base}/?subject=${plan.subject.id}&deck=${addition.index.deckId}&view=setup`); await shown("setup-panel"); await ready();
    await page.locator("#category-filter").selectOption("");
    await page.locator("#question-style-filter").selectOption("");
    await page.locator("#setup-shuffle").uncheck();
    await page.locator("#question-type-summary").click();
    await page.locator('[data-question-types="all"]').click();
    await assertSummary(addition.terms);
    await page.locator("#start-study").click(); await shown("study-shell");
    const firstQuestion = addition.terms[0].stages.beginner[0];
    assert.equal(await page.locator("#question-text").textContent(), firstQuestion.prompt);
    await assertStudyDisplay(firstQuestion, false);
    await page.locator("#next-action").click(); await assertStudyDisplay(firstQuestion, true);
    await page.locator("#good-action").click();
    await page.waitForFunction(prompt => document.querySelector("#question-text").textContent !== prompt, firstQuestion.prompt);
    await page.waitForFunction(() => !document.querySelector("#next-action").disabled);
    assert.equal(answers.at(-1).dataset, addition.index.version);
    const nextPrompt = await page.locator("#question-text").textContent();
    await page.reload(); await shown("study-shell");
    assert.equal(await page.locator("#question-text").textContent(), nextPrompt);
    await page.locator("#study-stop").click(); await shown("setup-panel"); await ready();
    await page.locator("#question-style-filter").selectOption("integrated");
    page.once("dialog", async dialog => { assert.match(dialog.message(), /前回の一周を終了/); await dialog.accept(); });
    await page.locator("#start-study").click(); await shown("study-shell");
    const integratedQuestion = addition.terms[0].stages.integrated[0];
    assert.equal(await page.locator("#subject-name").textContent(), `日本史K｜${addition.definition.chapterGroups[0].title}`);
    assert.equal(await page.locator("#question-text").textContent(), integratedQuestion.prompt);
    await assertStudyDisplay(integratedQuestion, false);
    await page.locator("#next-action").click(); await assertStudyDisplay(integratedQuestion, true);
    if (addition.index.deckId === "book-06-02-06") {
      const previousPadding = await page.locator("#question-text").evaluate(element => {
        const previous = element.style.paddingRight; element.style.paddingRight = "58px"; return previous;
      });
      try {
        await assert.rejects(() => assertTextClearOfButtons(["question-text"]), /文字に編集・読み上げボタンが重なりません/, "以前の狭い余白で実際に文字が隠れる配置を検出します。");
      } finally {
        await page.locator("#question-text").evaluate((element, previous) => { element.style.paddingRight = previous; }, previousPadding);
      }
      await assertTextClearOfButtons(["question-text"]);
    }
    await page.screenshot({ path: path.join(images, `${addition.index.deckId}-integrated-mobile.png`), fullPage: true });
  }
  assert.deepEqual(progress.get(plan.index.version), ghqRecords, "新規小項目の回答でGHQの学習記録を変更しません。");
  // 共有化した章表示が、既存の世界史SOにも同じ章名で適用される。
  const so = catalog.subjects.find(subject => subject.id === "world-history-so");
  await page.goto(`${base}/?subject=world-history-so&deck=${so.defaultDeckId}&view=setup`); await shown("setup-panel"); await ready();
  assert.deepEqual(await page.locator("#deck-filter .deck-filter-name").allTextContents(), so.chapterGroups.map(group => group.title));
  assert.equal(await page.locator("#question-type-field").isVisible(), true);
  assert.deepEqual(errors, []);
  assert.equal(await page.evaluate(() => window.testAudioAttempts), 0);
  assert.deepEqual(audioAttempts, [], "画面の移動や再読み込みを含め、一度も音声を再生しません。");
  assert.equal(requests.some(url => /\/v1\/.*(speech|rating-sound)/.test(url)), false);
  assert.ok([...sessions.keys()].every(key => [oldVersion, plan.index.version, ...additions.map(item => item.index.version)].includes(key)));
  console.log(`日本史Kの画面確認：${combinedSubject.decks.length}小項目・${combinedSubject.questionCount}問の選択、全小項目の出題・回答・保存再開・統合説明、GHQの全説明問題習得後の移行、用語枠非表示と太字、既存記録保持、スマートフォン幅、世界史SOの章表示、音声停止を確認しました。`);
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
