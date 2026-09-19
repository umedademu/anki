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
        speak() { return false; }, preload() { return Promise.resolve(); } };
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


  await page.goto(base+'/?subject=test');await shown('setup-panel');await ready();
  await page.locator('#start-study').click();await shown('study-shell');
  const initial=await page.locator('#question-text').textContent();
  const remaining=await page.locator('#queue-progress').textContent();
  async function edit(field,value){
    await page.locator('[data-edit-study="'+field+'"]').click();
    const form=page.locator('.study-field-form');
    await form.locator('textarea').fill(value);
    await form.getByRole('button',{name:'保存',exact:true}).click();
    await form.waitFor({state:'detached'});
  }
  await edit('prompt','編集した問題文');
  assert.equal(await page.locator('#question-text').textContent(),'編集した問題文');
  assert.equal(await page.locator('#queue-progress').textContent(),remaining);
  await page.locator('#next-action').click();
  await edit('answer','編集した回答');
  assert.equal(await page.locator('#answer-text').textContent(),'編集した回答');
  await edit('explanation','編集した解説');
  assert.equal(await page.locator('#term-overview-text').textContent(),'編集した解説');
  await edit('explanation','');
  assert.ok(await page.locator('[data-edit-study="explanation"]').isVisible());
  controls.failEdit=true;
  await page.locator('[data-edit-study="answer"]').click();
  await page.locator('.study-field-form textarea').fill('再試行した回答');
  await page.locator('.study-field-form').getByRole('button',{name:'保存',exact:true}).click();
  await page.locator('.study-field-form').getByRole('button',{name:'保存を再試行'}).waitFor();
  assert.equal(await page.locator('.study-field-form textarea').inputValue(),'再試行した回答');
  controls.failEdit=false;
  await page.locator('.study-field-form').getByRole('button',{name:'保存を再試行'}).click();
  await page.locator('.study-field-form').waitFor({state:'detached'});
  const cloud=await loadEditableSubject(fixture.env,'test');
  const edited=cloud.decks.flatMap(d=>d.terms.flatMap(t=>Object.values(t.stages).flat())).find(q=>q.prompt==='編集した問題文');
  assert.equal(edited.answer,'再試行した回答');
  assert.equal(edited.explanation,'');
  await page.locator('[data-edit-study="prompt"]').click();
  await page.locator('.study-field-form textarea').fill('取り消す内容');
  await page.locator('.study-field-form').getByRole('button',{name:'キャンセル'}).click();
  assert.equal(await page.locator('#question-text').textContent(),'編集した問題文');
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-edit-study="answer"]').click();
  await page.locator('.study-field-form textarea').fill('小さい画面の回答');
  await page.screenshot({path:'.wrangler/study-field-mobile.png',fullPage:true});
  await page.locator('.study-field-form').getByRole('button',{name:'キャンセル'}).click();
  const listenUrl=new URL(page.url());listenUrl.searchParams.set('mode','listen-answer');
  await page.goto(listenUrl.href);await shown('study-shell');
  await edit('prompt','聞き流しで編集した問題');
  assert.match(await page.locator('#listening-toggle-action').getAttribute('aria-label')??await page.locator('#listening-toggle-action').textContent(),/再生|再開/);
  await page.goto(base);
  await page.locator('[data-original-study]').click();
  await page.locator('#original-input').fill('オリジナル問題\t回答');
  await page.locator('[data-original="start"]').click();await ready();
  await page.locator('#start-study').click();await shown('study-shell');
  await edit('prompt','改行を含む\n編集した問題');
  assert.equal(await page.locator('#question-text').textContent(),'改行を含む\n編集した問題');
  await page.reload();await shown('study-shell');
  assert.equal(await page.locator('#question-text').textContent(),'改行を含む\n編集した問題');
  assert.deepEqual(errors,[]);
  assert.equal(requests.some(url=>/\/v1\/.*(speech|rating-sound)/.test(url)),false);
  console.log('学習中編集：３項目・保存と取消・失敗再試行・学習位置維持・スマートフォン・聞き流し停止・オリジナル再読込を無音で確認しました。');
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
