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
      if (url.pathname === "/v1/ai-relay") { reply({ url: controls.relayUrl ?? null, updatedAt: null }); return; }
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


  // 偽の中継役（PC）。アクセスキーと接続元を確かめ、返事を少しずつ返す。
  const relayRequests = [];
  const relay = createServer(async (req, res) => {
    const cors = { "Access-Control-Allow-Origin": base, "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
    if (req.method === "OPTIONS") { res.writeHead(204, cors); res.end(); return; }
    const chunks = []; for await (const part of req) chunks.push(part);
    const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
    relayRequests.push({ auth: req.headers.authorization, body });
    if (req.headers.authorization !== "Bearer editor-test-key") { res.writeHead(401, { ...cors, "Content-Type": "application/json" }); res.end('{"error":"x"}'); return; }
    res.writeHead(200, { ...cors, "Content-Type": "application/x-ndjson" });
    const question = body.messages.at(-1).text;
    if (question.includes("失敗")) { res.end(JSON.stringify({ type: "error", message: "Claudeの利用上限に達しているようです。" }) + "\n"); return; }
    const name = body.service === "claude" ? "Claude" : "ChatGPT";
    const full = `${name}の答え（${body.messages.length}件目）：**はい**、そうです。`;
    res.write(JSON.stringify({ type: "start" }) + "\n");
    await sleep(80);
    res.write(JSON.stringify({ type: "delta", text: full.slice(0, 8) }) + "\n");
    await sleep(relayDelay);
    res.write(JSON.stringify({ type: "delta", text: full }) + "\n");
    res.end(JSON.stringify({ type: "done", text: full }) + "\n");
  });
  let relayDelay = 120;
  await new Promise((resolve) => relay.listen(0, "127.0.0.1", resolve));
  const relayBase = `http://127.0.0.1:${relay.address().port}`;
  controls.relayUrl = relayBase;

  const button = page.locator('#ai-question-button');
  const dialog = page.locator('#ai-question-dialog');
  const input = dialog.locator('textarea');
  const send = dialog.getByRole('button', { name: '送る', exact: true });
  const claudeChoice = dialog.getByRole('button', { name: 'Claude', exact: true });
  const chatgptChoice = dialog.getByRole('button', { name: 'ChatGPT', exact: true });
  const status = dialog.locator('[data-ai-chat="status"]');
  const assistantTexts = () => dialog.locator('.ai-chat-message.is-assistant p').allTextContents();
  async function ask(text) {
    await input.fill(text);
    await send.click();
    await page.waitForFunction(() => !document.querySelector('.ai-chat-message.is-thinking') && [...document.querySelectorAll('[data-ai-service]')].every((b) => !b.disabled));
  }

  await page.goto(base + '/?subject=test'); await shown('setup-panel'); await ready();
  await page.locator('#start-study').click(); await shown('study-shell');
  // 答えを表示する前は出さない。
  assert.equal(await button.isVisible(), false);
  await page.locator('#next-action').click();
  await button.waitFor({ state: 'visible' });
  assert.equal(await button.getAttribute('aria-label'), 'AIに質問');
  const prompt = await page.locator('#question-text').textContent();
  const progressBefore = await page.locator('#queue-progress').textContent();
  const answerRequests = () => requests.filter((url) => url.startsWith('/v1/study-answer/')).length;
  const answerRequestsBefore = answerRequests();

  // 欄を開くと、空の間は送れない。入力中のキーは学習画面のショートカットにならない。
  await button.click();
  await dialog.waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'ai-question-input');
  assert.ok(await send.isDisabled());
  assert.equal(await claudeChoice.getAttribute('aria-pressed'), 'true');
  assert.match(await dialog.locator('[data-ai-chat="context"]').textContent(), /^問題：.+　答え：.+/);
  await input.fill('   ');
  assert.ok(await send.isDisabled());
  await input.fill('');
  await page.keyboard.type('3 1 4 ');
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('End'); await page.keyboard.press('Shift+Enter');
  assert.equal(await input.inputValue(), '3 1 4 \n', 'Shift+Enter は改行');
  assert.match(await input.getAttribute('placeholder'), /Enterで送る・Shift\+Enterで改行/);
  assert.equal(await page.locator('#question-text').textContent(), prompt);
  assert.equal(answerRequests(), answerRequestsBefore);

  // Claude に聞く。返事は少しずつ表示され、問題・答え・解説（飾りなし）と質問が中継役に届く。
  await input.fill('ビザンツ帝国って東ローマの事ですよね？');
  relayDelay = 600;
  await send.click();
  await dialog.locator('.ai-chat-message.is-user').first().waitFor();
  assert.ok(await send.isDisabled(), '答えている間は送れない');
  await page.waitForFunction(() => document.querySelector('.ai-chat-message.is-assistant p')?.textContent.startsWith('Claudeの答え'));
  await page.waitForFunction(() => document.querySelector('.ai-chat-message.is-assistant p')?.textContent.endsWith('そうです。'));
  relayDelay = 120;
  await page.waitForFunction(() => [...document.querySelectorAll('[data-ai-service]')].every((b) => !b.disabled));
  assert.deepEqual(await assistantTexts(), ['Claudeの答え（1件目）：はい、そうです。']);
  assert.equal(await dialog.locator('.ai-chat-message.is-assistant strong').first().textContent(), 'はい');
  assert.equal(await dialog.locator('.ai-chat-speaker').first().textContent(), 'Claude');
  const first = relayRequests.at(-1);
  assert.equal(first.auth, 'Bearer editor-test-key');
  assert.equal(first.body.service, 'claude');
  assert.deepEqual(first.body.messages, [{ role: 'user', text: 'ビザンツ帝国って東ローマの事ですよね？' }]);
  if (prompt.startsWith('東ローマ')) {
    assert.deepEqual(first.body.context, { prompt: '東ローマ帝国とも呼ばれる国は？', answer: 'ビザンツ帝国', explanation: '首都はコンスタンティノープル。' });
  } else {
    assert.deepEqual(first.body.context, { prompt, answer: `回答：${prompt}`, explanation: '' });
  }
  // 日本語入力の変換を確定する Enter では送らない。
  const sentBefore = relayRequests.length;
  await input.fill('しゅと');
  await input.evaluate((element) => element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, isComposing: true, bubbles: true, cancelable: true })));
  await page.waitForTimeout(300);
  assert.equal(relayRequests.length, sentBefore);
  assert.equal(await input.inputValue(), 'しゅと');
  // タッチ画面（スマートフォン）では、キーボードの改行キーは改行のまま。
  await page.evaluate(() => { window.__matchMedia = window.matchMedia; window.matchMedia = (query) => ({ matches: query.includes('pointer: coarse'), media: query, addEventListener() {}, removeEventListener() {} }); });
  await input.focus(); await page.keyboard.press('End'); await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  assert.equal(relayRequests.length, sentBefore);
  assert.equal(await input.inputValue(), 'しゅと\n');
  await page.evaluate(() => { window.matchMedia = window.__matchMedia; });
  // 続けて質問すると、前のやりとりも一緒に送る。パソコンでは Enter で送る。
  await input.fill('首都は？');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.querySelector('.ai-chat-message.is-thinking') && [...document.querySelectorAll('[data-ai-service]')].every((b) => !b.disabled) && document.querySelectorAll('.ai-chat-message.is-assistant').length === 2);
  assert.equal(await input.inputValue(), '');
  assert.deepEqual(relayRequests.at(-1).body.messages.map((m) => m.role), ['user', 'assistant', 'user']);
  assert.equal(relayRequests.at(-1).body.messages[1].text, 'Claudeの答え（1件目）：**はい**、そうです。');
  // ChatGPT に切り替えて聞く。
  await chatgptChoice.click();
  assert.equal(await chatgptChoice.getAttribute('aria-pressed'), 'true');
  await ask('いつ滅びた？');
  assert.equal(relayRequests.at(-1).body.service, 'codex');
  assert.equal(await dialog.locator('.ai-chat-speaker').last().textContent(), 'ChatGPT');
  assert.equal((await assistantTexts()).length, 3);

  // Esc で閉じて開き直しても会話は残る。欄の外のタップでも閉じる。学習画面のタップは働かない。
  await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
  await button.click();
  assert.equal((await assistantTexts()).length, 3);
  assert.equal(await chatgptChoice.getAttribute('aria-pressed'), 'true', '選んだAIを覚える');
  await page.setViewportSize({ width: 844, height: 390 });
  await page.mouse.click(30, 385);
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#question-text').textContent(), prompt);
  assert.ok(await page.locator('#answer-panel').isVisible());
  await page.setViewportSize({ width: 1280, height: 800 });

  // 中継役の返事が失敗なら、説明を出して質問を入力欄に戻す。
  await button.click();
  await ask('失敗させて');
  assert.match(await status.textContent(), /利用上限/);
  assert.equal(await input.inputValue(), '失敗させて');
  assert.equal((await assistantTexts()).length, 3);
  // PCが止まっている（中継役につながらない）時は「PCのAIに接続できません」。
  const closedPort = createServer(); await new Promise((resolve) => closedPort.listen(0, '127.0.0.1', resolve));
  const deadUrl = `http://127.0.0.1:${closedPort.address().port}`; await new Promise((resolve) => closedPort.close(resolve));
  controls.relayUrl = deadUrl;
  await page.reload(); await shown('study-shell');
  if (!(await button.isVisible())) await page.locator('#next-action').click();
  await button.click();
  await ask('つながる？');
  assert.match(await status.textContent(), /^PCのAIに接続できません/);
  assert.equal(await input.inputValue(), 'つながる？');
  controls.relayUrl = null;
  await ask('つながる？');
  assert.match(await status.textContent(), /^PCのAIに接続できません/);
  // PCが起動し直して接続先が変わっても、取り直してつながる。
  controls.relayUrl = relayBase;
  await ask('つながる？');
  assert.equal(await status.isVisible(), false);
  assert.match((await assistantTexts()).at(-1), /^ChatGPTの答え/);
  await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });

  // ここまで評価・学習記録は変わらない。閉じた後は評価のキーが使え、次の問題では新しい会話になる。
  const promptNow = await page.locator('#question-text').textContent();
  assert.equal(answerRequests(), answerRequestsBefore);
  assert.equal(await page.evaluate(() => document.activeElement?.id ?? ''), '');
  await page.keyboard.press('3');
  await page.waitForFunction((before) => document.querySelector('#question-text').textContent !== before, promptNow);
  assert.equal(await button.isVisible(), false);
  assert.equal(answerRequests(), answerRequestsBefore + 1);
  await page.locator('#next-action').click(); await button.waitFor({ state: 'visible' });
  await button.click();
  assert.equal((await assistantTexts()).length, 0);
  assert.equal(await input.inputValue(), '');
  assert.ok(await dialog.locator('.ai-chat-hint').isVisible());
  await ask('この問題のポイントは？');
  await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });

  // スマートフォンの縦・横で、ボタン同士や答えの文字と重ならない。会話欄・入力欄・送るボタンは画面内に収まる。
  for (const [width, height, name] of [[390, 844, 'portrait'], [844, 390, 'landscape'], [1280, 800, 'desktop']]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(100);
    const boxes = await page.evaluate(() => Object.fromEntries(['#ai-question-button', '#answer-panel [data-edit-study="answer"]', '#answer-speech', '#answer-text', '#answer-panel']
      .map((selector) => { const r = document.querySelector(selector).getBoundingClientRect(); return [selector, { left: r.left, right: r.right, top: r.top, bottom: r.bottom }]; })));
    const ai = boxes['#ai-question-button'], edit = boxes['#answer-panel [data-edit-study="answer"]'], speech = boxes['#answer-speech'], answer = boxes['#answer-text'], panel = boxes['#answer-panel'];
    const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    assert.ok(!overlaps(ai, edit) && !overlaps(ai, speech), `${name}: ボタンが重なっています`);
    assert.ok(!overlaps(ai, answer), `${name}: 答えの文字と重なっています ${JSON.stringify(boxes)}`);
    assert.ok(ai.left >= panel.left && ai.right <= panel.right && ai.top >= panel.top - 1, `${name}: 回答欄からはみ出しています`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${name}: 横にはみ出しています`);
    await page.screenshot({ path: `.wrangler/ai-question-${name}.png` });
    // キーボードが出て見える高さが減った時を、画面の高さを縮めて確かめる。
    await button.click(); await input.fill('質問');
    for (const visibleHeight of [height, Math.round(height * 0.45)]) {
      await page.setViewportSize({ width, height: visibleHeight });
      await page.waitForTimeout(150);
      const inside = await page.evaluate(() => [...document.querySelectorAll('#ai-question-dialog textarea, #ai-question-dialog [data-ai-chat="send"], #ai-question-dialog [data-ai-chat="close"], #ai-question-dialog [data-ai-service]')]
        .every((element) => { const r = element.getBoundingClientRect(), d = document.querySelector('#ai-question-dialog').getBoundingClientRect(); return r.top >= Math.max(0, d.top) && r.bottom <= Math.min(window.innerHeight, d.bottom) && r.left >= 0 && r.right <= window.innerWidth && r.height > 20; }));
      await page.screenshot({ path: `.wrangler/ai-question-${name}-${visibleHeight}-dialog.png` });
      assert.ok(inside, `${name}（高さ${visibleHeight}）: 欄かボタンが画面外です`);
    }
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    await page.setViewportSize({ width, height });
  }
  await page.setViewportSize({ width: 1280, height: 800 });

  // 聞き流しでは開くと一時停止し、閉じても再開しない。
  const listenUrl = new URL(page.url()); listenUrl.searchParams.set('mode', 'listen-answer');
  await page.goto(listenUrl.href); await shown('study-shell');
  // 進むで答えを出すと、読み上げ中（試験では終わらない無音の読み上げ）の状態になる。
  if (!(await button.isVisible())) await page.locator('#listening-next-action').click();
  await button.waitFor({ state: 'visible' });
  const listeningPrompt = await page.locator('#question-text').textContent();
  await button.click();
  assert.equal(await page.locator('#listening-playback-feedback').getAttribute('data-feedback'), 'pause');
  await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
  await button.click();
  assert.equal(await page.locator('#listening-playback-feedback').getAttribute('data-feedback'), 'pause');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);
  assert.equal(await page.locator('#question-text').textContent(), listeningPrompt);
  assert.ok(await button.isVisible());
  assert.deepEqual(errors, []);
  relay.close();
  console.log('AIとの会話：答えの表示中だけ表示・空欄では送れない・入力中のキーと欄の外のタップは学習画面に効かない・少しずつの返事・続けての質問・Claude/ChatGPTの切り替え・失敗とPC停止の表示と入力の復元・接続先の取り直し・評価と記録に影響なし・次の問題で新しい会話・スマートフォン縦横とキーボード表示時・聞き流しの一時停止を確認しました。');
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
