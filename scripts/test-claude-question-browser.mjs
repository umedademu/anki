import worker from "../worker/src/index.js";
import {loadEditableSubject} from "../worker/src/question-editor.js";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { editorFixture } from "./question-editor-fixture.mjs";

const root = path.resolve(import.meta.dirname, "..", "public");
const fixture=editorFixture(); const {objects}=fixture;
for (const number of [1, 2]) {
  const chunkPath = `subjects/test/deck-${number}/chunk.json`, chunk = JSON.parse(objects.get(chunkPath));
  for (const question of chunk.terms.flatMap((term) => term.stages.beginner)) {
    if (question.id === "q1") Object.assign(question, { prompt: "東ローマ帝国とも呼ばれる国(くに)は？", answer: "**ビザンツ帝国**", explanation: "首都は<b>コンスタンティノープル</b>。\n#世界史" });
    else question.explanation = "";
  }
  objects.set(chunkPath, JSON.stringify(chunk));
}
objects.set("term-images.json", JSON.stringify({ schemaVersion: 2, assets: [], assignments: [] }));
const off = { history: { question: false, answer: false, explanation: false, mnemonic: false }, vocabulary: { word: false, meaning: false, exampleEnglish: false, exampleJapanese: false } };
let settings = { autoSpeechEnabled: false, speechParts: off, setupPreferences: { subjects: {} }, studyTimeLimitSeconds: 600, ratingSoundVolume: 0 };
const sessions = new Map();
const progress = new Map();
const requests = [];
const controls = { catalogDelay: 0, settingsDelay: 0, imagesDelay: 0, catalogFailure: false, deckDelay: 0, failSessionSave: false };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    requests.push(url.pathname + url.search);
    const reply = (value, status = 200) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(value)); };
    if(url.pathname==='/v1/question-editor') {
      const buffers=[];for await(const part of req)buffers.push(part);
      const body=Buffer.concat(buffers).toString();
      if(req.method==='POST' && controls.failEdit){reply({error:'試験用の保存失敗'},503);return;}
      const response=await worker.fetch(new Request(url,{method:req.method,headers:req.headers,...(body?{body}:{})}),fixture.env);
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
    }
    if (url.pathname.startsWith("/v1/")) {
      const buffers = []; for await (const part of req) buffers.push(part);
      const body = buffers.length ? JSON.parse(Buffer.concat(buffers).toString()) : {};
      const dataset = url.searchParams.get("dataset");
      if (url.pathname === "/v1/state") {
        if (!dataset) await sleep(controls.settingsDelay);
        reply({ settings, progress: { questions: progress.get(dataset) ?? {} }, session: sessions.get(dataset), studyDate: "2026-09-17" }); return;
      }
      if (url.pathname === "/v1/settings") {
        settings = { ...settings, ...body, autoSpeechEnabled: false, speechParts: off };
        reply({ settings }); return;
      }
      if (url.pathname.startsWith("/v1/study-answer/")) {
        sessions.set(body.sessionDatasetVersion ?? dataset, body.session);
        progress.set(dataset, { ...progress.get(dataset), [decodeURIComponent(url.pathname.split("/").pop())]: body.record });
        reply({ session: body.session, updatedAt: new Date().toISOString() }); return;
      }
      if (url.pathname === "/v1/study-session") {
        if (controls.failSessionSave) { reply({ error: "試験用の保存失敗" }, 503); return; }
        if (req.method === "DELETE") sessions.delete(dataset);
        else sessions.set(dataset, body);
        reply({ session: sessions.get(dataset) }); return;
      }
      if (url.pathname.startsWith("/v1/study-time/")) {
        if (body.session) sessions.set(body.sessionDatasetVersion ?? dataset, body.session);
        reply({ session: body.session, studyDate: "2026-09-17" }); return;
      }
      if (url.pathname.startsWith("/v1/study-activity/")) { reply({ ok: true }); return; }
      throw new Error("未対応の試験用通信: " + url.pathname);
    }
    if (url.pathname === "/config.js") {
      res.setHeader("Content-Type", "text/javascript");
      res.end(`window.ANKI_CONFIG={dataBaseUrl:"/data",progressApiBaseUrl:"http://127.0.0.1:${server.address().port}"};`); return;
    }
    if (url.pathname.startsWith("/data/")) {
      if (url.pathname === "/data/index.json") {
        await sleep(controls.catalogDelay);
        if (controls.catalogFailure) { reply({ error: "試験用の通信失敗" }, 503); return; }
      } else if (url.pathname === "/data/term-images.json") await sleep(controls.imagesDelay);
      else await sleep(controls.deckDelay);
      const body = objects.get(url.pathname.slice(6));
      res.writeHead(body ? 200 : 404, { "Content-Type": "application/json" }); res.end(body ?? "{}"); return;
    }
    const target = path.resolve(root, "." + (url.pathname === "/" ? "/index.html" : url.pathname));
    if (!target.startsWith(root + path.sep)) throw new Error("公開フォルダー外");
    const types = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };
    res.setHeader("Content-Type", types[path.extname(target)] ?? "text/plain"); res.end(await readFile(target));
  } catch (error) { res.writeHead(500); res.end(error.message); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext();
  context.setDefaultTimeout(15000);
  // 試験開始前に自動読み上げをOFFにし、実音声も再生させない。
  await context.addInitScript((parts) => {
    localStorage.setItem("anki-cloud-access-key:v1", "editor-test-key");
    localStorage.setItem("anki-speech-settings:v1", JSON.stringify({ autoSpeechEnabled: false, speechParts: parts }));
    speechSynthesis.cancel(); speechSynthesis.speak = () => {};
    HTMLMediaElement.prototype.play = () => Promise.resolve();
    if (window.AudioScheduledSourceNode) AudioScheduledSourceNode.prototype.start = () => {};
  }, off);
  await context.route("https://**/*", (route) => route.abort());
  const speechModule = (await readFile(path.join(root, "speech.js"), "utf8"))
    .replace("export function createSpeechController(", "function unusedSpeechController(");
  await context.route("**/speech.js*", (route) => route.fulfill({
    contentType: "text/javascript",
    body: speechModule + `\nexport function createSpeechController() {
      return { supported: true, paused: false, currentTarget: null,
        stop() {}, unlock() {}, pause() { return false; }, resume() { return false; },
        speak() { return true; }, preload() { return Promise.resolve(); }, stage() { return false; } };
    }`,
  }));
  const page = await context.newPage(), errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const shown = (id) => page.locator("#" + id).waitFor({ state: "visible" });
  const ready = () => page.waitForFunction(() => !document.querySelector("#start-study").disabled);
  const checkRoute = (view, subject = "test") => {
    const url = new URL(page.url());
    assert.equal(url.searchParams.get("view"), view);
    assert.equal(url.searchParams.get("subject"), subject);
  };


  // 外部の claude.ai へは出ず、開こうとしたURLだけを記録する。
  const claudeOpened = [];
  await context.route('https://claude.ai/**', (route) => { claudeOpened.push(route.request().url()); return route.fulfill({ contentType: 'text/html', body: '<p>claude</p>' }); });
  const link = page.locator('#claude-question-link');
  const studyUrl = new URL(base + '/?subject=test');
  studyUrl.searchParams.set('order', 'sequential');
  await page.goto(base + '/?subject=test'); await shown('setup-panel'); await ready();
  await page.locator('#start-study').click(); await shown('study-shell');
  // 答えを表示する前は出さない。
  assert.equal(await link.isVisible(), false);
  await page.locator('#next-action').click();
  await link.waitFor({ state: 'visible' });
  const href = await link.getAttribute('href');
  assert.ok(href.startsWith('https://claude.ai/new?q='));
  const text = decodeURIComponent(href.slice('https://claude.ai/new?q='.length));
  const prompt = await page.locator('#question-text').textContent();
  assert.match(text, /^次の一問一答について質問します。\n問題：.+\n答え：.+\n(解説：.+\n)?質問：$/);
  assert.ok(!/[<>*#]|\(くに\)/.test(text), text);
  if (prompt.startsWith('東ローマ')) {
    assert.equal(text, '次の一問一答について質問します。\n問題：東ローマ帝国とも呼ばれる国は？\n答え：ビザンツ帝国\n解説：首都はコンスタンティノープル。\n質問：');
  } else {
    assert.equal(text, `次の一問一答について質問します。\n問題：${prompt}\n答え：回答：${prompt}\n質問：`);
  }
  assert.equal(await link.getAttribute('target'), '_blank');
  // 押しても評価・学習記録・表示中の問題は変わらない。
  const progressBefore = await page.locator('#queue-progress').textContent();
  const answerRequests = requests.filter((url) => url.startsWith('/v1/study-answer/')).length;
  const [popup] = await Promise.all([page.waitForEvent('popup'), link.click()]);
  await popup.waitForLoadState();
  assert.equal(popup.url(), href);
  assert.equal(claudeOpened.at(-1), href);
  await popup.close();
  assert.equal(await page.locator('#question-text').textContent(), prompt);
  assert.equal(await page.locator('#queue-progress').textContent(), progressBefore);
  assert.ok(await page.locator('#answer-panel').isVisible());
  assert.equal(requests.filter((url) => url.startsWith('/v1/study-answer/')).length, answerRequests);
  assert.notEqual(await page.evaluate(() => document.activeElement?.id), 'claude-question-link');
  // 4段階評価はそのまま使える。
  await page.keyboard.press('3');
  await page.waitForFunction((before) => document.querySelector('#question-text').textContent !== before, prompt);
  assert.equal(await link.isVisible(), false);

  // スマートフォンの縦・横で、ボタン同士や答えの文字と重ならない。
  await page.locator('#next-action').click(); await link.waitFor({ state: 'visible' });
  for (const [width, height, name] of [[390, 844, 'portrait'], [844, 390, 'landscape'], [1280, 800, 'desktop']]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(100);
    const boxes = await page.evaluate(() => Object.fromEntries(['#claude-question-link', '#answer-panel [data-edit-study="answer"]', '#answer-speech', '#answer-text', '#answer-panel']
      .map((selector) => { const r = document.querySelector(selector).getBoundingClientRect(); return [selector, { left: r.left, right: r.right, top: r.top, bottom: r.bottom }]; })));
    const claude = boxes['#claude-question-link'], edit = boxes['#answer-panel [data-edit-study="answer"]'], speech = boxes['#answer-speech'], answer = boxes['#answer-text'], panel = boxes['#answer-panel'];
    const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    assert.ok(!overlaps(claude, edit) && !overlaps(claude, speech), `${name}: ボタンが重なっています`);
    assert.ok(!overlaps(claude, answer), `${name}: 答えの文字と重なっています ${JSON.stringify(boxes)}`);
    assert.ok(claude.left >= panel.left && claude.right <= panel.right && claude.top >= panel.top - 1, `${name}: 回答欄からはみ出しています`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${name}: 横にはみ出しています`);
    await page.screenshot({ path: `.wrangler/claude-question-${name}.png` });
  }

  // 聞き流しでは押すと一時停止し、もう一度押しても再開しない。
  const listenUrl = new URL(page.url()); listenUrl.searchParams.set('mode', 'listen-answer');
  await page.goto(listenUrl.href); await shown('study-shell');
  // 進むで答えを出すと、読み上げ中（試験では終わらない無音の読み上げ）の状態になる。
  if (!(await link.isVisible())) await page.locator('#listening-next-action').click();
  await link.waitFor({ state: 'visible' });
  const listeningPrompt = await page.locator('#question-text').textContent();
  for (let count = 0; count < 2; count += 1) {
    const [listenPopup] = await Promise.all([page.waitForEvent('popup'), link.click()]);
    await listenPopup.close();
    assert.equal(await page.locator('#listening-playback-feedback').getAttribute('data-feedback'), 'pause');
  }
  await page.waitForTimeout(3000);
  assert.equal(await page.locator('#question-text').textContent(), listeningPrompt);
  assert.ok(await link.isVisible());
  assert.deepEqual(errors, []);
  console.log('Claudeへ質問：答えの表示中だけ表示・文章（読み仮名とタグなし、解説なしの省略）・評価と記録に影響なし・スマートフォン縦横・聞き流しの一時停止を確認しました。');
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
