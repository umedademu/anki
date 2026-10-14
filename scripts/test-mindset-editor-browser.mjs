import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import worker from "../worker/src/index.js";
import { loadEditableSubject } from "../worker/src/question-editor.js";
import { createStudyRoutineRun } from "../public/study-routine.js";
import { mindsetEditorFixture } from "./question-editor-fixture.mjs";

const root = path.resolve(import.meta.dirname, "..", "public");
const fixture = mindsetEditorFixture([34, 2]);
const off = { history: { question: false, answer: false, explanation: false, mnemonic: false }, vocabulary: { word: false, meaning: false, exampleEnglish: false, exampleJapanese: false } };
const studyDate = "2026-10-14";
let settings = { autoSpeechEnabled: false, speechParts: off, ratingSoundVolume: 0, setupPreferences: { subjects: {}, mindsetResume: { lastCompletedItemId: "MS-000033" } } };
const controls = { failPost: false, dropPost: false, delay: 0, posts: [] };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const json = (value, status = 200) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(value)); };
    if (url.pathname.startsWith("/v1/")) {
      const buffers = []; for await (const part of req) buffers.push(part);
      const body = buffers.length ? JSON.parse(Buffer.concat(buffers).toString()) : {};
      if (url.pathname === "/v1/state") { json({ settings, progress: { questions: {} }, sessions: {}, session: null, studyDate }); return; }
      if (url.pathname === "/v1/settings") { settings = { ...settings, ...body, autoSpeechEnabled: false, speechParts: off }; json({ settings }); return; }
      if (url.pathname === "/v1/study-routine") { settings.setupPreferences = { ...settings.setupPreferences, ...body }; json({ setupPreferences: settings.setupPreferences, studyDate }); return; }
      if (url.pathname === "/v1/question-editor") {
        const post = req.method === "POST";
        if (post) controls.posts.push(body);
        if (post && controls.delay) await new Promise(resolve => setTimeout(resolve, controls.delay));
        if (post && controls.failPost) { json({ error: "試験用の通信失敗です。" }, 503); return; }
        const response = await worker.fetch(new Request(`http://127.0.0.1:${server.address().port}${req.url}`, { method: req.method, headers: req.headers, ...(post ? { body: JSON.stringify(body) } : {}) }), fixture.env);
        if (post && controls.dropPost) { controls.dropPost = false; res.writeHead(200, { "Content-Type": "application/json" }); res.end("{"); return; }
        res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text()); return;
      }
      throw new Error(`未対応の試験用通信: ${url.pathname}`);
    }
    if (url.pathname === "/config.js") {
      res.setHeader("Content-Type", "text/javascript"); res.end(`window.ANKI_CONFIG={dataBaseUrl:"/data",progressApiBaseUrl:"http://127.0.0.1:${server.address().port}"};`); return;
    }
    // /dataは、この試験専用の架空データだけを返す。本番の読み書きには使わない。
    if (url.pathname.startsWith("/data/")) { const body = fixture.objects.get(url.pathname.slice(6)); res.writeHead(body ? 200 : 404, { "Content-Type": "application/json" }); res.end(body ?? "{}"); return; }
    const target = path.resolve(root, "." + (url.pathname === "/" ? "/index.html" : url.pathname));
    if (!target.startsWith(root + path.sep)) throw new Error("公開フォルダー外");
    const types = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };
    res.setHeader("Content-Type", `${types[path.extname(target)] ?? "text/plain"}; charset=utf-8`); res.end(await readFile(target));
  } catch (error) { res.writeHead(500); res.end(error.message); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
fixture.env.ALLOWED_ORIGIN = base;
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  context.setDefaultTimeout(15000);
  // 試験開始前に自動読み上げをOFFにする。読み上げ内容のみ確認し、音声は再生しない。
  await context.addInitScript(parts => {
    if (!["http:", "https:"].includes(location.protocol)) return;
    localStorage.setItem("anki-cloud-access-key:v1", "editor-test-key");
    localStorage.setItem("anki-speech-settings:v1", JSON.stringify({ autoSpeechEnabled: false, speechParts: parts }));
    window.__actualAudioCalls = 0;
    const forbidden = () => { window.__actualAudioCalls++; throw new Error("試験中の音声再生は禁止"); };
    speechSynthesis.cancel(); speechSynthesis.speak = forbidden; HTMLMediaElement.prototype.play = forbidden;
    if (window.AudioScheduledSourceNode) AudioScheduledSourceNode.prototype.start = forbidden;
  }, off);
  await context.route("https://**/*", route => route.abort());
  const speechModule = (await readFile(path.join(root, "speech.js"), "utf8")).replace("export function createSpeechController(", "function unusedSpeechController(");
  await context.route("**/speech.js*", route => route.fulfill({ contentType: "text/javascript", body: speechModule + `
    export function createSpeechController() {
      return window.__testSpeech = { supported: true, currentTarget: null, paused: false, calls: [],
        stop() { this.currentTarget = null; this.paused = false; }, unlock() {}, preload() { return Promise.resolve(); },
        pause() { this.paused = true; return true; }, resume() { this.paused = false; return true; },
        speak(segments) { this.calls.push(segments); this.currentTarget = segments[0]?.target; return true; } };
    }` }));
  const page = await context.newPage(), errors = [];
  context.on("page", target => target.on("pageerror", error => errors.push(error.message)));
  page.on("pageerror", error => errors.push(error.message));
  const cloud = () => loadEditableSubject(fixture.env, "mindset");
  const item = async id => (await cloud()).decks.flatMap(d => d.terms).find(t => t.id === id);
  const saved = (target = page) => target.waitForFunction(() => document.querySelector("#editor-status")?.textContent.startsWith("すべて保存済み"));
  const row = (id, target = page) => target.locator(`tr[data-question-id="${id}"]`);
  const cell = (id, field, target = page) => row(id, target).locator(`[data-field="${field}"]`);
  const shown = id => page.locator(`#${id}`).waitFor({ state: "visible" });
  const openEditor = async () => { await page.locator("#mindset-edit").click(); await saved(); };
  const resumeId = () => settings.setupPreferences.mindsetResume.lastCompletedItemId;

  await page.goto(`${base}/?subject=mindset`); await shown("mindset-player-panel");
  assert.equal(await page.locator("#mindset-text").textContent(), "確認用の言葉34");
  assert.equal(await page.evaluate(() => window.__testSpeech.calls.length), 0);
  await openEditor();
  assert.equal(await page.locator("#editor-title").textContent(), "言葉を編集");
  assert.equal(await page.locator("#show-details").isVisible(), false);
  assert.equal(await page.locator('[data-field="answer"], [data-field="prompt"], [data-field="stage"]').count(), 0);
  assert.equal(await page.locator("#question-rows tr").count(), 30);
  await page.locator("#next-page").click(); assert.equal(await page.locator("#question-rows tr").count(), 4);
  await page.locator("#previous-page").click();
  const editedText = "修正した言葉\n\n努力=成長 <b>文字のまま</b>";
  await cell("MS-000034", "content").fill(editedText); await saved();
  assert.equal((await item("MS-000034")).content, editedText);
  assert.equal((await item("MS-000034")).term, editedText);
  assert.equal(await cell("MS-000034", "content").evaluate(input => input === document.activeElement), true);
  await cell("MS-000034", "category").fill("継続"); await saved();
  await page.locator("#editor-category").selectOption("継続"); assert.equal(await page.locator("#question-rows tr").count(), 1);
  await page.locator("#editor-category").selectOption("");
  await page.locator("#editor-search").fill("努力=成長"); assert.equal(await page.locator("#question-rows tr").count(), 1);
  await page.locator("#editor-search").fill("");

  controls.delay = 350;
  const firstPost = page.waitForRequest(request => request.method() === "POST" && request.url().endsWith("/v1/question-editor"));
  await cell("MS-000034", "content").fill("送信中の文章"); await firstPost;
  await cell("MS-000034", "content").fill(editedText); await saved();
  assert.equal((await item("MS-000034")).content, editedText, "保存中の追加入力を保つ"); controls.delay = 0;
  const beforeComposition = controls.posts.length;
  await cell("MS-000034", "category").dispatchEvent("compositionstart");
  await cell("MS-000034", "category").fill("日本語変換中");
  await page.waitForTimeout(850); assert.equal(controls.posts.length, beforeComposition);
  await cell("MS-000034", "category").dispatchEvent("compositionend"); await saved();

  await page.locator("#editor-deck").selectOption("all"); await page.locator("#add-question").click();
  const draft = page.locator('tr[data-row-key^="draft-"]').first(), draftKey = await draft.getAttribute("data-row-key");
  const postsBeforeDraft = controls.posts.length;
  await draft.locator('[data-field="content"]').fill("追加した言葉"); await page.waitForTimeout(850);
  assert.equal(controls.posts.length, postsBeforeDraft, "本文だけで保存先が未選択なら待機する");
  controls.dropPost = true; await draft.locator('[data-field="targetDeckId"]').selectOption("deck-1");
  await page.locator("#retry-save:not([hidden])").waitFor();
  const createId = controls.posts.at(-1).operationId;
  await page.locator("#retry-save").click(); await saved();
  assert.equal(controls.posts.at(-1).operationId, createId);
  const addedId = await page.locator(`tr[data-row-key="${draftKey}"]`).getAttribute("data-question-id");
  assert.match(addedId, /^MS-EDIT-/);
  assert.equal((await cloud()).decks.flatMap(d => d.terms).filter(t => t.content === "追加した言葉").length, 1);
  await page.reload(); await saved();
  assert.equal(await page.locator("#question-rows tr").first().getAttribute("data-question-id"), addedId);
  await page.locator("#editor-deck").selectOption("all");
  await cell(addedId, "targetDeckId").selectOption("deck-2"); await saved();
  assert.ok((await cloud()).decks[1].terms.some(t => t.id === addedId));
  controls.failPost = true; await cell(addedId, "content").fill("通信失敗時の入力");
  await page.locator("#retry-save:not([hidden])").waitFor();
  assert.equal(await cell(addedId, "content").inputValue(), "通信失敗時の入力");
  controls.failPost = false; await page.locator("#retry-save").click(); await saved();
  assert.equal((await item(addedId)).content, "通信失敗時の入力");
  await row(addedId).getByRole("button", { name: "削除", exact: true }).click();
  await page.locator('#editor-confirm button[value="cancel"]').click(); assert.ok(await item(addedId));
  await row(addedId).getByRole("button", { name: "削除", exact: true }).click();
  await page.locator("#confirm-proceed").click();
  await page.waitForFunction(() => document.querySelector("#editor-status").textContent.startsWith("削除しました"));
  assert.equal(await item(addedId), undefined);
  await page.locator("#undo-delete").click();
  await page.waitForFunction(() => document.querySelector("#editor-status").textContent.includes("元に戻しました"));
  assert.equal((await item(addedId)).content, "通信失敗時の入力");

  await page.locator("#editor-search").fill("修正した言葉");
  const other = await context.newPage(); await other.goto(`${base}/question-editor.html?subject=mindset&deck=deck-1`); await saved(other);
  await cell("MS-000034", "category", other).fill("別画面で保存"); await saved(other);
  await cell("MS-000034", "category").fill("競合時の入力");
  await page.waitForFunction(() => document.querySelector("#editor-status").textContent.includes("別の画面"));
  assert.equal(await cell("MS-000034", "category").inputValue(), "競合時の入力");
  assert.equal((await item("MS-000034")).category, "別画面で保存");
  await page.locator("#reload-editor").click(); await page.locator("#confirm-proceed").click(); await saved(); await other.close();
  await page.locator("#editor-search").fill("");
  await row("MS-000034").locator(".number-column").press("ArrowUp"); await saved();
  assert.ok((await cloud()).subject.editorQuestionOrder.includes("MS-000034"));
  await page.locator("#editor-search").fill("");
  await page.setViewportSize({ width: 390, height: 844 });
  await mkdir(path.resolve(root, "..", ".wrangler", "mindset-editor-check"), { recursive: true });
  await page.screenshot({ path: path.resolve(root, "..", ".wrangler", "mindset-editor-check", "mobile.png") });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "小画面でページ全体が横へはみ出さない");
  assert.ok(await page.locator("#editor-table-scroll").evaluate(el => el.scrollWidth > el.clientWidth), "表は横へ動かせる");
  await page.setViewportSize({ width: 1440, height: 900 });
  assert.equal(resumeId(), "MS-000033");
  await page.locator("#return-to-study").click(); await shown("mindset-player-panel");
  assert.equal(await page.locator("#mindset-text").textContent(), editedText);
  assert.equal(await page.locator("#mindset-text b").count(), 0);
  assert.equal(await page.locator("#mindset-text").evaluate(el => getComputedStyle(el).whiteSpace), "pre-wrap");
  await page.locator("#mindset-resume").click();
  assert.equal(await page.evaluate(() => window.__testSpeech.calls[0][0].text), editedText.replace(/=/g, "イコール"));
  await openEditor(); assert.equal(resumeId(), "MS-000033");

  const plan = [{ id: "mindset-step", kind: "study", subjectId: "mindset", questionTarget: 10 }, { id: "next-step", kind: "study", subjectId: "test", questionTarget: 3 }];
  const run = createStudyRoutineRun(plan, studyDate, "mindset-editor-run"); run.items[0].completedCount = 2;
  settings.setupPreferences = { ...settings.setupPreferences, routinePlan: plan, routineRun: run };
  await page.goto(base); await page.waitForFunction(() => !document.querySelector("#continue-routine").disabled);
  await page.locator("#continue-routine").click(); await shown("mindset-player-panel");
  const completed = settings.setupPreferences.routineRun.items[0].completedCount;
  await openEditor(); assert.equal(new URL(page.url()).searchParams.get("routine"), "1");
  await cell("MS-000034", "content").fill("毎日のメニューから編集した言葉"); await saved();
  await page.locator("#return-to-study").click(); await shown("mindset-player-panel");
  assert.equal(await page.locator("#mindset-text").textContent(), "毎日のメニューから編集した言葉");
  assert.equal(settings.setupPreferences.routineRun.items[0].completedCount, completed);
  assert.equal(resumeId(), "MS-000033");
  // 全件を削除した後も、再生画面から新しい言葉を追加できる。
  const emptyFixture = mindsetEditorFixture([0]);
  fixture.objects.clear(); for (const [key, value] of emptyFixture.objects) fixture.objects.set(key, value);
  settings.setupPreferences.routineRun = null;
  await page.goto(`${base}/?subject=mindset`); await shown("mindset-player-panel");
  assert.equal(await page.locator("#mindset-toggle").isEnabled(), false);
  await openEditor(); assert.equal(await page.locator("#editor-empty").isVisible(), true);
  await page.locator("#add-question").click();
  await page.locator('tr[data-row-key^="draft-"] [data-field="content"]').fill("空の集から追加した言葉"); await saved();
  assert.equal((await cloud()).subject.termCount, 1);
  await page.locator("#return-to-study").click(); await shown("mindset-player-panel");
  assert.equal(await page.locator("#mindset-text").textContent(), "空の集から追加した言葉");
  assert.equal((await cloud()).subject.questionCount, 0);
  assert.equal(fixture.dbCalls.length, 0);
  assert.equal(await page.evaluate(() => window.__actualAudioCalls), 0);
  assert.deepEqual(errors, []);
  console.log("マインドセット編集画面：直接学習と毎日のメニュー、本文・分類の自動保存、追加・移動・削除・復元、競合・再送・無音の読み上げ反映を確認しました。");
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
