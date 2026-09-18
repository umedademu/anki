import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { importSOBookFiles, readSOBookFiles, appendSOBookDecks } from "./world-history-so-book.mjs";
import { editorFixture } from "./question-editor-fixture.mjs";

const root = path.resolve(import.meta.dirname, "..", "public");
const { objects } = editorFixture();
objects.set("term-images.json", JSON.stringify({ schemaVersion: 2, assets: [], assignments: [] }));
// 本番の問題はCloudflareから読み取り、試験中の保存は手元の模擬窓口だけに行う。
const cloudBase = "https://pub-76ffbe2829114a5cbaa433db45872267.r2.dev";
async function cloudJson(key) {
  const response = await fetch(`${cloudBase}/${key}`);
  assert.ok(response.ok);
  const value = await response.json();
  objects.set(key, JSON.stringify(value));
  return value;
}
const original = await cloudJson("index.json");
const existing = original.subjects.find(subject => subject.id === "world-history-so");
const current = await Promise.all(existing.decks.map(async entry => {
  const index = await cloudJson(entry.indexPath);
  return { entry, index, chunks: await Promise.all(index.chunks.map(chunk => cloudJson(chunk.path))) };
}));
const imported = importSOBookFiles(await readSOBookFiles(path.join(root, "../data/source/world-history-so/book")), await readFile(path.join(root, "../data/source/world-history-so/sekai_shi_tankyu_mokuji.md"), "utf8"));
const plan = appendSOBookDecks(original, current, imported);
const so = plan.next.subjects.find(subject => subject.id === "world-history-so");
objects.set("index.json", JSON.stringify(plan.next));
for (const object of plan.staged) objects.set(object.path, JSON.stringify(object.value));
await cloudJson("subjects/world-history-so/answer-visuals/index.json");
const firstChapter = so.chapterGroups.find(group => group.number === 1), islamicChapter = so.chapterGroups.find(group => group.number === 6);
assert.equal(so.questionCount, 2624);
assert.deepEqual(so.chapterGroups.map(group => group.deckIds.length), [12, 20, 9]);
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
  const cloudProgress = (await readFile(path.join(root, "cloud-progress.js"), "utf8")).replace("export function normalizeSpeechParts(value)", "function unusedNormalizeSpeechParts(value)");
  await context.route("**/cloud-progress.js*", route => route.fulfill({ contentType: "text/javascript", body: cloudProgress + `\nexport function normalizeSpeechParts() { return ${JSON.stringify(off)}; }` }));
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
  page.on("pageerror", error => errors.push(error.message));
  const shown = id => page.locator("#" + id).waitFor({ state: "visible" });
  const settled = () => page.waitForFunction(() => document.querySelector("#setup-panel").getAttribute("aria-busy") !== "true" && !document.querySelector("#start-study").disabled);
  const picker = number => page.locator(`.chapter-picker[data-chapter-id="chapter-${number}"]`);
  const chapter = number => page.locator(`input[name="chapter-deck-filter"][value="chapter-${number}"]`);
  async function deselectChapter(number) {
    if(await chapter(number).evaluate(input=>input.indeterminate)) { await chapter(number).click(); await settled(); }
    await chapter(number).uncheck(); await settled();
  }
  await page.goto(base + "/?subject=world-history-so&deck=deck-1&view=setup");
  await shown("setup-panel"); await settled();
  assert.deepEqual(await page.locator("#deck-filter .deck-filter-name").allTextContents(), so.chapterGroups.map(group => group.title));
  assert.deepEqual(await page.locator("#deck-filter .deck-filter-count").allTextContents(), ["1,002問", "1,265問", "357問"]);
  assert.equal(await chapter(1).isChecked(), false);
  assert.equal(await picker(1).isVisible(), false);
  await chapter(1).check(); await settled(); await deselectChapter(6);
  assert.equal(await picker(1).isVisible(), true); assert.equal(await picker(6).isVisible(), false);
  assert.equal(await picker(1).locator("input:checked").count(), 12);
  await page.locator("#question-type-summary").click();
  assert.match(await page.locator('#question-type-options label').filter({hasText:"時期"}).textContent(), /68問/);
  await page.locator('[data-question-types="all"]').click();
  await page.locator("#question-type-summary").click();
  assert.match(await page.locator("#selection-summary").textContent(), /1,?002/);
  await picker(1).locator("summary").click();
  assert.deepEqual(await picker(1).locator(".deck-filter-count").allTextContents(),["23問","97問","96問","30問","93問","53問","69問","96問","30問","123問","251問","41問"]);
  await picker(1).locator("summary").click();
  await page.locator("#question-limit").fill("1");
  await page.locator("#start-study").click(); await shown("study-shell");
  assert.equal(await page.locator("#subject-name").textContent(), "世界史SO｜第1章 オリエント・インドの古代文明");
  assert.equal(await page.locator("#question-speech").getAttribute("aria-pressed"), "false");
  assert.match(await page.locator("#question-text").textContent(), /日の昇るところ/);
  await page.locator("#next-action").click(); await shown("answer-panel");
  assert.equal((await page.locator("#answer-text").textContent()).trim(), "オリエント");
  assert.equal(await page.locator("#answer-map").isVisible(), false, "未登録の他章の地図を誤表示しない");
  await page.locator("#good-action").click(); await shown("completion-card");
  assert.ok([...progress.keys()].some(key => key === "world-history-so-book-01-01-01-v1"));
  assert.ok([...sessions.keys()].some(key => key.startsWith("mix-world-history-so-selection-") && key.length <= 100));
  await page.locator("#completion-return").click(); await shown("setup-panel"); await settled();
  await page.reload(); await shown("setup-panel"); await settled();
  assert.equal(await picker(1).locator("input:checked").count(),12);
  assert.equal(await chapter(6).isChecked(),false);
  // 一部パートに絞った後も、選択・種類・本文を維持する。
  await picker(1).locator("summary").click();
  for(const id of firstChapter.deckIds.slice(2)) { await picker(1).locator(`input[value="${id}"]`).uncheck(); await settled(); }
  assert.match(await picker(1).locator("summary").textContent(), /2 \/ 12パート/);
  await picker(1).locator("summary").click();
  assert.match(await page.locator("#selection-summary").textContent(), /120/);
  await page.reload(); await shown("setup-panel"); await settled();
  assert.equal(await picker(1).locator("input:checked").count(),2);
  await chapter(6).check(); await settled();
  assert.equal(await picker(6).locator("input:checked").count(),9);
  await picker(1).locator("summary").click();
  await picker(1).getByRole("button",{name:"全パートを選択"}).click(); await settled();
  await picker(1).locator("summary").click();
  assert.equal(await page.locator('.chapter-picker input:checked').count(),21);
  await picker(1).locator("summary").click();
  await picker(1).getByRole("button", {name:"全パートを解除"}).click(); await settled();
  assert.equal(await picker(1).locator("input:checked").count(),0);
  assert.equal(await picker(6).locator("input:checked").count(),9);
  assert.equal(await picker(1).isVisible(),true);
  await picker(1).locator("summary").click();
  await picker(6).locator("summary").click();
  await picker(6).getByRole("button", {name:"全パートを解除"}).click();
  await page.waitForFunction(() => document.querySelector("#setup-panel").getAttribute("aria-busy") !== "true");
  assert.equal(await page.locator('.chapter-picker input:checked').count(),0);
  assert.equal(await page.locator("#start-study").isDisabled(),true);
  assert.equal(await page.locator("#resume-study").isDisabled(),true);
  await picker(6).locator("summary").click();
  await picker(1).locator("summary").click();
  await picker(1).locator("input").first().check(); await settled();
  assert.equal(await picker(1).locator("input:checked").count(),1);
  await page.reload(); await shown("setup-panel"); await settled();
  assert.equal(await picker(1).locator("input:checked").count(),1);
  assert.equal(await picker(6).locator("input:checked").count(),0);
  await picker(1).locator("summary").click();
  await picker(1).getByRole("button", {name:"全パートを選択"}).click(); await settled();
  await picker(1).locator("summary").click();
  await chapter(6).check(); await settled();

  assert.match(await page.locator("#selection-summary").textContent(),/1,?359/);
  const output=path.join(root,"../.wrangler/so-book/screenshots"); await mkdir(output,{recursive:true});
  await page.setViewportSize({width:1280,height:1000});
  await page.locator("#setup-panel").screenshot({path:path.join(output,"desktop-setup.png")});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true);
  await page.locator("#setup-panel").screenshot({path:path.join(output,"mobile-setup.png")});
  await page.locator("#start-study").click(); await shown("study-shell");
  assert.equal(await page.locator("#subject-name").textContent(),"世界史SO｜2デッキ");
  assert.ok([...sessions.values()].some(session=>session.deckIds?.length===21));
  await page.locator("#study-stop").click(); await shown("setup-panel"); await settled();
  controls.deckDelay=80;
  await chapter(1).uncheck(); await chapter(1).check(); await settled();
  assert.equal(await page.locator('.chapter-picker input:checked').count(),21);
  controls.deckDelay=0;
  await deselectChapter(1);
  await chapter(6).click();
  assert.equal(await chapter(6).isChecked(),true);
  assert.match(await page.locator("#cloud-status").textContent(),/デッキは1つ以上/);
  // 第2章の20パートを選択し、原本どおりの最初の問いと答えを確認する。
  await chapter(2).check(); await settled(); await deselectChapter(6);
  assert.equal(await picker(2).locator("input:checked").count(),20);
  await page.reload(); await shown("setup-panel"); await settled();
  assert.equal(await picker(2).locator("input:checked").count(),20);
  await page.locator("#question-limit").fill("1");
  await page.locator("#start-study").click(); await shown("study-shell");
  assert.equal(await page.locator("#subject-name").textContent(),"世界史SO｜第2章 古代の地中海世界");
  assert.match(await page.locator("#question-text").textContent(), /クレタ文明やミケーネ文明/);
  await page.locator("#next-action").click(); await shown("answer-panel");
  assert.equal((await page.locator("#answer-text").textContent()).trim(),"エーゲ文明");
  assert.equal(await page.locator("#answer-map").isVisible(),false);
  await page.locator("#good-action").click(); await shown("completion-card");
  assert.ok([...progress.keys()].some(key=>key==="world-history-so-book-02-04-01-v1"));
  await page.locator("#completion-return").click(); await shown("setup-panel"); await settled();
  await chapter(1).check(); await settled(); await chapter(6).check(); await settled();
  assert.equal(await page.locator('.chapter-picker input:checked').count(),41);
  await page.locator("#start-study").click(); await shown("study-shell");
  assert.equal(await page.locator("#subject-name").textContent(),"世界史SO｜3デッキ");
  assert.ok([...sessions.values()].some(session=>session.deckIds?.length===41));
  assert.deepEqual(errors,[]);
  assert.equal(requests.some(url=>/\/v1\/.*(speech|rating-sound)/.test(url)),false);
  console.log("複数章の画面確認完了：3デッキ・41パート・2,624問、章とパートの選択、68問の時期問題、保存復元、本文・回答・評価、既存章、全パートの学習、狭い画面、音声停止");
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(resolve=>server.close(resolve));
}
