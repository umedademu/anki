import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { editorFixture } from "./question-editor-fixture.mjs";

const root = path.resolve(import.meta.dirname, "..", "public");
const { objects } = editorFixture();
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
    if (url.pathname.startsWith("/v1/")) {
      const buffers = []; for await (const part of req) buffers.push(part);
      const body = buffers.length ? JSON.parse(Buffer.concat(buffers).toString()) : {};
      const dataset = url.searchParams.get("dataset");
      if (url.pathname === "/v1/state") {
        if (!dataset) await sleep(controls.settingsDelay);
        reply({ settings, progress: { questions: progress.get(dataset) ?? {} }, session: sessions.get(dataset), studyDate: "2026-09-17" }); return;
      }
      if (url.pathname === "/v1/settings") {
        if (controls.failOrderSave) { reply({error:"保存試験"},503); return; }
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
    localStorage.setItem("anki-cloud-access-key:v1", "navigation-test-key");
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


  await page.goto(base);
  await page.waitForFunction(() => document.querySelector('.subject-options.can-sort'));
  const ids = () => page.locator('[data-sort-subject]').evaluateAll(nodes => nodes.map(n => n.dataset.sortSubject));
  const saved = () => page.waitForFunction(() => document.querySelector('#subject-order-status').textContent === '並び順を保存しました。');
  assert.deepEqual(await ids(), ['original','test','other']);
  async function dragTo(from, to, handle = false) {
    const source = await page.locator('[data-sort-subject="'+from+'"]' + (handle ? ' .subject-drag-handle' : ' .subject-choice')).boundingBox();
    const target = await page.locator('[data-sort-subject="'+to+'"]').boundingBox();
    await page.mouse.move(source.x + (handle ? source.width/2 : 25),source.y + source.height/2);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width/2,target.y + target.height/2,{steps:12});
    await page.mouse.up();
  }
  await page.screenshot({path:'.wrangler/subject-order-desktop.png',fullPage:true});
  await dragTo('original','other'); await saved();
  assert.deepEqual(await ids(),['test','other','original']);
  assert.deepEqual(settings.setupPreferences.subjectOrder,['test','other','original']);
  assert.ok(await page.locator('#subject-panel').isVisible(),'移動後に科目を開かない');
  await page.reload(); await page.waitForFunction(() => document.querySelector('.subject-options.can-sort'));
  assert.deepEqual(await ids(),['test','other','original']);
  await page.locator('[data-sort-subject="original"] .subject-drag-handle').press('ArrowLeft'); await saved();
  assert.deepEqual(await ids(),['test','original','other']);
  controls.failOrderSave = true;
  await dragTo('test','other');
  await page.waitForFunction(() => document.querySelector('#subject-order-status').textContent.includes('元の順番に戻しました'));
  assert.deepEqual(await ids(),['test','original','other']);
  controls.failOrderSave = false;
  await page.setViewportSize({width:390,height:844});
  await page.locator('#subject-options').scrollIntoViewIfNeeded();
  await dragTo('other','test',true); await saved();
  assert.deepEqual(await ids(),['other','test','original']);
  const touch = await context.newCDPSession(page);
  await touch.send('Emulation.setTouchEmulationEnabled',{enabled:true});
  const source = await page.locator('[data-sort-subject="original"] .subject-drag-handle').boundingBox();
  const target = await page.locator('[data-sort-subject="test"]').boundingBox();
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:source.x+20,y:source.y+20}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:target.x+target.width/2,y:target.y+target.height/2}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await saved();
  assert.deepEqual(await ids(),['other','original','test']);
  await touch.send('Emulation.setTouchEmulationEnabled',{enabled:false});
  await page.screenshot({path:'.wrangler/subject-order-mobile.png',fullPage:true});
  await page.locator('[data-subject-id="test"]').click(); await shown('setup-panel'); await ready();
  assert.deepEqual(errors,[]);
  assert.equal(requests.some(url=>/\/v1\/.*(speech|rating-sound)/.test(url)),false);
  console.log('教科並べ替え確認完了：ドラッグ・順序保存・再読込・矢印キー・失敗時復元・狭い画面・タッチ操作・クリック遷移');
} finally {
  await browser?.close(); server.closeAllConnections();
  await new Promise(resolve=>server.close(resolve));
}
