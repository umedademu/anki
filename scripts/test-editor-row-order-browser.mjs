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

  await page.goto(editorUrl); await saved();
  const ids = () => page.locator('#question-rows tr').evaluateAll(rows=>rows.map(r=>r.dataset.questionId));
  async function drag(from,to,after=false) {
    await row(from).locator('.number-column').scrollIntoViewIfNeeded();
    const a=await row(from).locator('.number-column').boundingBox(), b=await row(to).locator('.number-column').boundingBox();
    await page.mouse.move(a.x+a.width/2,a.y+a.height/2); await page.mouse.down();
    await page.mouse.move(b.x+b.width/2,b.y+b.height*(after?.8:.2),{steps:8}); await page.mouse.up();
  }
  const before = await cloud();
  await drag('q2','q1'); await saved();
  assert.deepEqual((await ids()).slice(0,3),['q2','q1','q3']);
  assert.deepEqual((await cloud()).decks,before.decks);
  await page.reload(); await saved();
  assert.deepEqual((await ids()).slice(0,3),['q2','q1','q3']);
  controls.failPost=true;
  await drag('q3','q2'); await page.locator('#retry-save').waitFor();
  assert.deepEqual((await ids()).slice(0,3),['q2','q1','q3']);
  controls.failPost=false; await page.locator('#retry-save').click(); await saved();
  assert.deepEqual((await ids()).slice(0,3),['q3','q2','q1']);
  controls.dropPost=true;
  await drag('q1','q3'); await page.locator('#retry-save').waitFor();
  const op=controls.posts.at(-1).operationId;
  await page.locator('#retry-save').click(); await saved();
  assert.equal(controls.posts.at(-1).operationId,op);
  assert.deepEqual((await ids()).slice(0,3),['q1','q3','q2']);
  // ドラッグ中に表の末尾へスクロールし、次のページまで移動できる。
  await row('q1').locator('.number-column').scrollIntoViewIfNeeded();
  const source=await row('q1').locator('.number-column').boundingBox();
  const beforeScroll=await page.evaluate(()=>window.scrollY);
  await page.mouse.move(source.x+20,source.y+20); await page.mouse.down();
  await page.mouse.move(source.x+20,988,{steps:8});
  await page.waitForFunction(before=>window.scrollY>before,beforeScroll);
  await page.waitForFunction(()=>document.querySelector('#page-position').textContent==='2 / 2');
  await page.waitForFunction(()=>document.querySelector('#question-rows tr:last-child').getBoundingClientRect().bottom<=innerHeight);
  assert.equal(await page.locator('.editor-table-scroll').evaluate(s=>s.scrollTop),0);
  const target=await row('extra-32').locator('.number-column').boundingBox();
  await page.mouse.move(target.x+20,target.y+target.height*.8); await page.mouse.up(); await saved();
  assert.equal((await cloud()).subject.editorQuestionOrder.at(-1),'q1');
  // 検索で隠れている行の相対順序を維持する。
  await page.locator('#editor-search').fill('確認用');
  await drag('extra-1','extra-0'); await saved();
  const filtered=(await cloud()).subject.editorQuestionOrder;
  assert.deepEqual(filtered.slice(0,4),['q3','q2','extra-1','extra-0']);
  await page.locator('#editor-search').fill('');
  await page.setViewportSize({width:390,height:844});
  await row('q3').locator('.number-column').scrollIntoViewIfNeeded();
  const touch=await context.newCDPSession(page);
  await touch.send('Emulation.setTouchEmulationEnabled',{enabled:true});
  const a=await row('q3').locator('.number-column').boundingBox(), b=await row('q2').locator('.number-column').boundingBox();
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:a.x+20,y:a.y+20}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:b.x+20,y:b.y+b.height*.8}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await saved();
  assert.deepEqual((await ids()).slice(0,2),['q2','q3']);
  await mkdir(path.join(root,'.wrangler','editor-row-order'),{recursive:true});
  await page.screenshot({path:path.join(root,'.wrangler','editor-row-order','mobile.png'),fullPage:true});
  await touch.send('Emulation.setTouchEmulationEnabled',{enabled:false});
  await row('q3').locator('.number-column').press('ArrowUp'); await saved();
  assert.deepEqual((await ids()).slice(0,2),['q3','q2']);
  await cell('q3','answer').fill('並べ替え後の回答'); await saved();
  assert.equal(question(await cloud(),'q3').answer,'並べ替え後の回答');
  assert.deepEqual(errors,[]);
  console.log('行ドラッグ：保存・再読込・通信失敗・同一操作再送・ページ横断・検索・タッチ・矢印キー・並べ替え後の編集を無音で確認しました。');
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(resolve=>server.close(resolve));
}
