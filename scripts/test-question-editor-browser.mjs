import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import worker from "../worker/src/index.js";
import { loadEditableSubject } from "../worker/src/question-editor.js";
import { editorFixture } from "./question-editor-fixture.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = editorFixture();
// ページをまたいだ編集も確認できるよう、架空の問題を追加する。
const fixtureChunk = JSON.parse(fixture.objects.get("subjects/test/deck-2/chunk.json"));
for (let i = 0; i < 33; i++) {
  const term = structuredClone(fixtureChunk.terms[0]); term.id = `extra-term-${i}`;
  term.stages.beginner[0].id = `extra-${i}`; term.stages.beginner[0].prompt = `確認用の問題 ${i + 1}`;
  fixtureChunk.terms.push(term);
}
fixture.objects.set("subjects/test/deck-2/chunk.json", JSON.stringify(fixtureChunk));
const off = { history: { question: false, answer: false, explanation: false, mnemonic: false }, vocabulary: { word: false, meaning: false, exampleEnglish: false, exampleJapanese: false } };
const controls = { delay: 0, failPost: false, dropPost: false, failRefresh: false, failGet: false, active: 0, maxActive: 0, posts: [] };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1:4173");
    if (url.pathname === "/v1/state" || url.pathname === "/v1/settings") {
      req.resume(); res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ settings: { autoSpeechEnabled: false, speechParts: off, setupPreferences: { subjects: {} } }, questions: {}, sessions: {}, studyDate: "2026-09-17" })); return;
    }
    if (url.pathname === "/v1/question-editor") {
      const buffers = []; for await (const part of req) buffers.push(part);
      const post = req.method === "POST";
      if (post) { controls.posts.push(JSON.parse(Buffer.concat(buffers).toString())); controls.active++; controls.maxActive = Math.max(controls.maxActive, controls.active); }
      try {
        if (post && controls.delay) await sleep(controls.delay);
        if ((post && controls.failPost) || (!post && controls.failGet)) {
          controls.failGet = false; res.writeHead(503, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "試験用の通信失敗です。" })); return;
        }
        const response = await worker.fetch(new Request(url, { method: req.method, headers: req.headers, ...(post ? { body: Buffer.concat(buffers) } : {}) }), fixture.env);
        if (post && controls.dropPost) { controls.dropPost = false; res.writeHead(200, { "Content-Type": "application/json" }); res.end("{"); return; }
        if (post && controls.failRefresh) { controls.failRefresh = false; controls.failGet = true; }
        res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text()); return;
      } finally { if (post) controls.active--; }
    }
    if (url.pathname === "/config.js") {
      res.setHeader("Content-Type", "text/javascript"); res.end('window.ANKI_CONFIG={dataBaseUrl:"/data",progressApiBaseUrl:"http://127.0.0.1:4173"};'); return;
    }
    if (url.pathname.startsWith("/data/")) {
      const body = fixture.objects.get(url.pathname.slice(6));
      res.writeHead(body ? 200 : 404, { "Content-Type": "application/json" }); res.end(body ?? "{}"); return;
    }
    const target = path.resolve(root, "public", url.pathname === "/" ? "index.html" : `.${url.pathname}`);
    if (!target.startsWith(path.join(root, "public") + path.sep)) throw new Error("outside public");
    const types = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };
    res.setHeader("Content-Type", `${types[path.extname(target)] ?? "text/plain"}; charset=utf-8`); res.end(await readFile(target));
  } catch (error) { res.writeHead(500); res.end(error.message); }
});
await new Promise((resolve) => server.listen(4173, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ channel: process.env.EDITOR_BROWSER_CHANNEL || "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  context.setDefaultTimeout(10000);
  await context.addInitScript((parts) => {
    localStorage.setItem("anki-cloud-access-key:v1", "editor-test-key");
    localStorage.setItem("anki-speech-settings:v1", JSON.stringify({ autoSpeechEnabled: false, speechParts: parts }));
    speechSynthesis.cancel(); speechSynthesis.speak = () => {};
    HTMLMediaElement.prototype.play = () => Promise.resolve();
  }, off);
  await context.route("https://**/*", (route) => route.abort());
  const page = await context.newPage(), errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const editorUrl = "http://127.0.0.1:4173/question-editor.html?subject=test&deck=deck-1&deck=deck-2";
  const saved = (target = page) => target.waitForFunction(() => document.querySelector("#editor-status")?.textContent.startsWith("すべて保存済み"));
  const row = (id, target = page) => target.locator(`tr[data-question-id="${id}"]`);
  const cell = (id, field, target = page) => row(id, target).locator(`[data-field="${field}"]`);
  const cloud = () => loadEditableSubject(fixture.env, "test");
  const question = (data, id) => data.decks.flatMap((deck) => deck.terms.flatMap((term) => Object.values(term.stages).flat())).find((q) => q.id === id);
  async function checkPageScroll() {
    assert.ok(await page.locator('#editor-table-scroll').evaluate(element => element.scrollHeight <= element.clientHeight + 1), '表内には縦のスクロール領域を作らない');
    const handle = page.locator('#question-rows .number-column').first();
    await handle.scrollIntoViewIfNeeded();
    const box = await handle.boundingBox(), before = await page.evaluate(() => window.scrollY);
    await page.mouse.move(box.x + 20, box.y + 20); await page.mouse.wheel(0, 500);
    await page.waitForFunction(value => window.scrollY > value, before);
    assert.equal(await page.locator('#editor-table-scroll').evaluate(element => element.scrollTop), 0);
  }
  await page.goto(editorUrl); await saved();
  assert.equal(await page.locator("#editor-deck").inputValue(), "selected");
  assert.equal(await page.locator("#question-rows tr").count(), 30);
  assert.equal(await page.locator("#question-form").count(), 0);
  await checkPageScroll();
  await cell("q1", "prompt").focus(); await page.keyboard.press("Tab");
  assert.equal(await cell("q1", "answer").evaluate((input) => input === document.activeElement), true);
  await cell("q1", "answer").fill("セルから自動保存した回答"); await saved();
  assert.equal(question(await cloud(), "q1").answer, "セルから自動保存した回答");
  assert.equal(await cell("q1", "answer").evaluate((input) => input === document.activeElement), true);

  // 保存中の追加入力、ほかの行の編集、元の値への戻しを取りこぼさない。
  controls.delay = 450;
  const firstRequest = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/v1/question-editor"));
  await cell("q1", "answer").fill("送信途中の文章"); await firstRequest;
  await cell("q1", "answer").fill("セルから自動保存した回答");
  await cell("q2", "answer").fill("別の行も続けて変更");
  await cell("q2", "answer").evaluate((input) => input.setSelectionRange(3, 6));
  await saved();
  assert.equal(question(await cloud(), "q1").answer, "セルから自動保存した回答");
  assert.equal(question(await cloud(), "q2").answer, "別の行も続けて変更");
  assert.deepEqual(await cell("q2", "answer").evaluate((input) => [input.selectionStart, input.selectionEnd]), [3, 6]);
  assert.equal(controls.maxActive, 1);
  const categoryRequest = page.waitForRequest((r) => r.method() === "POST");
  await cell("q1", "category").fill("変更後の共通分類"); await categoryRequest;
  await cell("q2", "explanation").fill("ほかのセルも変更"); await saved();
  assert.equal((await cloud()).decks[0].terms[0].category, "変更後の共通分類");
  assert.equal(question(await cloud(), "q2").explanation, "ほかのセルも変更");
  controls.delay = 0;

  const beforeComposition = controls.posts.length;
  await cell("q1", "prompt").dispatchEvent("compositionstart");
  await cell("q1", "prompt").fill("日本語の変換中"); await sleep(850);
  assert.equal(controls.posts.length, beforeComposition);
  await cell("q1", "prompt").dispatchEvent("compositionend"); await saved();
  assert.equal(question(await cloud(), "q1").prompt, "日本語の変換中");

  await cell("q2", "answer").fill("別ページへ移動しても保存");
  await page.locator("#next-page").click(); await saved();
  assert.equal(question(await cloud(), "q2").answer, "別ページへ移動しても保存");
  await page.locator("#previous-page").click();
  assert.ok(await page.locator('#question-rows tr').first().evaluate(row => { const box = row.getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight; }), 'ページ切り替え後は表の先頭を表示する');
  await page.locator("#editor-search").fill("別のデッキ");
  assert.equal(await page.locator("#question-rows tr").count(), 30);
  // 回答にも同じ文字列があるため、検索結果は30行ずつ表示される。
  await page.locator("#editor-search").fill("日本語の変換中");
  assert.equal(await page.locator("#question-rows tr").count(), 1);
  await page.locator("#editor-search").fill("");

  await page.locator("#editor-deck").selectOption("all"); await page.locator("#add-question").click();
  const draft = page.locator('tr[data-row-key^="draft-"]').first();
  const draftKey = await draft.getAttribute("data-row-key");
  const postsBeforeDraft = controls.posts.length;
  assert.equal(await draft.locator('[data-field="targetDeckId"]').inputValue(), "");
  await draft.locator('[data-field="prompt"]').fill("新しく追加した問題"); await sleep(850);
  assert.equal(controls.posts.length, postsBeforeDraft);
  await draft.locator('[data-field="targetDeckId"]').selectOption("deck-2");
  controls.dropPost = true;
  await draft.locator('[data-field="answer"]').fill("応答が失われても二重登録しない");
  await page.locator("#retry-save:not([hidden])").waitFor();
  const createId = controls.posts.at(-1).operationId;
  await page.locator("#retry-save").click(); await saved();
  assert.equal(controls.posts.at(-1).operationId, createId);
  const addedId = await page.locator(`tr[data-row-key="${draftKey}"]`).getAttribute("data-question-id");
  assert.equal((await cloud()).decks.flatMap((deck) => deck.terms.flatMap((term) => Object.values(term.stages).flat())).filter((q) => q.prompt === "新しく追加した問題").length, 1);
  await cell(addedId, "targetDeckId").selectOption("deck-1"); await saved();
  assert.ok((await cloud()).decks[0].terms.some((term) => term.stages.beginner.some((q) => q.id === addedId)));

  controls.failPost = true;
  await cell(addedId, "answer").fill("通信失敗しても入力を保持");
  await page.locator("#retry-save:not([hidden])").waitFor();
  await cell("q2", "answer").fill("待機中の別の行");
  assert.equal(await cell(addedId, "answer").inputValue(), "通信失敗しても入力を保持");
  controls.failPost = false;
  await page.locator("#retry-save").click(); await saved();
  assert.equal(question(await cloud(), "q2").answer, "待機中の別の行");
  controls.failRefresh = true;
  await cell(addedId, "explanation").fill("保存後の読み直しに失敗しても再登録しない");
  await page.locator("#retry-save:not([hidden])").waitFor();
  const postsAfterSuccess = controls.posts.length;
  await page.locator("#retry-save").click(); await saved();
  assert.equal(controls.posts.length, postsAfterSuccess);

  await cell(addedId, "answer").fill(""); await sleep(850);
  await page.locator("#return-to-study").click();
  await page.locator('#editor-confirm button[value="cancel"]').click();
  assert.equal(await cell(addedId, "answer").inputValue(), "");
  await row(addedId).getByRole("button", { name: "削除", exact: true }).click();
  await page.getByRole("button", { name: "削除する", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("#editor-status").textContent.startsWith("削除しました"));
  assert.equal(question(await cloud(), addedId), undefined);
  await page.locator("#undo-delete").click();
  await page.waitForFunction(() => document.querySelector("#editor-status").textContent.includes("元に戻しました"));
  assert.equal(question(await cloud(), addedId).answer, "通信失敗しても入力を保持");

  const otherPage = await context.newPage(); await otherPage.goto(editorUrl); await saved(otherPage);
  await cell("q1", "answer", otherPage).fill("別画面での変更"); await saved(otherPage);
  await cell("q1", "answer").fill("競合しても残る入力");
  await page.waitForFunction(() => document.querySelector("#editor-status").textContent.includes("別の画面"));
  assert.equal(await cell("q1", "answer").inputValue(), "競合しても残る入力");
  assert.equal(question(await cloud(), "q1").answer, "別画面での変更");
  await page.locator("#reload-editor").click(); await page.getByRole("button", { name: "破棄して再読込" }).click(); await saved();

  await page.locator("#show-details").check();
  await cell("q1", "answerNote").fill("詳細列も自動保存"); await saved();
  assert.equal(question(await cloud(), "q1").answerNote, "詳細列も自動保存");
  await page.locator("#show-details").uncheck();
  await page.locator("#editor-table-scroll").evaluate((element) => { element.scrollLeft = 0; element.scrollTop = 0; });
  const artifacts = path.join(root, ".wrangler", "editor-check"); await mkdir(artifacts, { recursive: true });
  await page.screenshot({ path: path.join(artifacts, "desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await checkPageScroll();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.ok(await page.locator("#editor-table-scroll").evaluate((element) => element.scrollWidth > element.clientWidth));
  await cell("q1", "answer").fill("スマートフォンから直接編集"); await saved();
  assert.equal(question(await cloud(), "q1").answer, "スマートフォンから直接編集");
  await page.screenshot({ path: path.join(artifacts, "mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "ダークモードに切り替える" }).click();
  await page.screenshot({ path: path.join(artifacts, "mobile-dark.png"), fullPage: true });
  await page.goto("http://127.0.0.1:4173/?subject=test"); await page.locator("#setup-panel:not(.is-hidden)").waitFor();
  await page.getByRole("link", { name: "問題を編集", exact: true }).click(); await saved();
  assert.equal(await page.locator("#editor-deck").inputValue(), "deck-1");
  assert.deepEqual(errors, []);
  console.log("表形式の編集：直接入力・自動保存・連続編集・変換中の待機・保存中の追加入力・共有分類・ページ移動・再送・失敗後の再試行・競合・削除と復元・スマートフォンを無音で確認しました。");
  console.log(`画面確認用画像: ${artifacts}`);
} catch (error) {
  const lastPage = browser?.contexts()[0]?.pages()[0];
  if (lastPage) console.error("画面の状態:", await lastPage.locator("#editor-status").textContent().catch(() => "画面なし"));
  console.error("直近の試験送信:", controls.posts.slice(-3).map((item) => ({ action: item.action, questionId: item.questionId, operationId: item.operationId })));
  throw error;
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
}
