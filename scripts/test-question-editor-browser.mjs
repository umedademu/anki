import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import worker from "../worker/src/index.js";
import { editorFixture } from "./question-editor-fixture.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = editorFixture();
const off = { history: { question: false, answer: false, explanation: false, mnemonic: false }, vocabulary: { word: false, meaning: false, exampleEnglish: false, exampleJapanese: false } };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1:4173");
    if (url.pathname === "/v1/state" || url.pathname === "/v1/settings") {
      req.resume(); res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ settings: { autoSpeechEnabled: false, speechParts: off, setupPreferences: { subjects: {} } }, questions: {}, sessions: {}, studyDate: "2026-09-17" })); return;
    }
    if (url.pathname === "/v1/question-editor") {
      const buffers = []; for await (const part of req) buffers.push(part);
      const response = await worker.fetch(new Request(url, { method: req.method, headers: req.headers, ...(req.method === "POST" ? { body: Buffer.concat(buffers) } : {}) }), fixture.env);
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text()); return;
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
    res.setHeader("Content-Type", `${types[path.extname(target)] ?? "text/plain"}; charset=utf-8`);
    res.end(await readFile(target));
  } catch (error) { res.writeHead(500); res.end(error.message); }
});
await new Promise((resolve) => server.listen(4173, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ channel: process.env.EDITOR_BROWSER_CHANNEL || "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  await context.addInitScript((parts) => {
    localStorage.setItem("anki-cloud-access-key:v1", "editor-test-key");
    localStorage.setItem("anki-speech-settings:v1", JSON.stringify({ autoSpeechEnabled: false, speechParts: parts }));
    // 試験開始前に自動読み上げを無効化し、音声再生も防ぐ。
    speechSynthesis.cancel(); speechSynthesis.speak = () => {};
    HTMLMediaElement.prototype.play = () => Promise.resolve();
  }, off);
  await context.route("https://**/*", (route) => route.abort());
  const page = await context.newPage(), errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const editorUrl = "http://127.0.0.1:4173/question-editor.html?subject=test&deck=deck-1&deck=deck-2";
  const ready = async () => page.waitForFunction(() => document.querySelector("#editor-status")?.textContent.includes("問題を選ぶか"));
  const saved = async () => page.waitForFunction(() => document.querySelector("#editor-status").textContent === "保存しました。");
  await page.goto(editorUrl); await ready();
  assert.equal(await page.locator("#editor-deck").inputValue(), "selected");
  assert.equal(await page.locator(".question-row").count(), 3);
  await page.getByRole("button", { name: /最初の問題/ }).click();
  assert.equal(await page.locator("#dirty-status").textContent(), "");
  await page.locator('[name="answer"]').fill("ブラウザーで修正した回答");
  assert.match(await page.locator("#dirty-status").textContent(), /未保存/);
  await page.getByRole("button", { name: "保存", exact: true }).click(); await saved();
  assert.equal(await page.locator('[name="answer"]').inputValue(), "ブラウザーで修正した回答");
  assert.equal(await page.locator("#dirty-status").textContent(), "");
  assert.equal(await page.locator("#save-question").isEnabled(), true);
  await page.locator('[name="prompt"]').fill("保存しない入力");
  await page.getByRole("button", { name: "一覧へ戻る" }).click();
  await page.locator('#editor-confirm button[value="cancel"]').click();
  assert.equal(await page.locator('[name="prompt"]').inputValue(), "保存しない入力");
  await page.getByRole("button", { name: "一覧へ戻る" }).click();
  await page.getByRole("button", { name: "保存せずに移動" }).click();
  await page.locator("#editor-search").fill("別のデッキ");
  assert.equal(await page.locator(".question-row").count(), 1);
  await page.locator("#editor-search").fill("");
  await page.locator("#editor-deck").selectOption("all");
  await page.getByRole("button", { name: "＋ 問題を追加" }).click();
  assert.equal(await page.locator("#target-deck").inputValue(), "");
  await page.locator("#target-deck").selectOption("deck-2");
  await page.locator('[name="prompt"]').fill("追加した問題");
  await page.locator('[name="answer"]').fill("追加した回答");
  await page.getByRole("button", { name: "保存", exact: true }).click(); await saved();
  assert.equal(await page.locator(".question-row").count(), 4);
  await page.locator("#target-deck").selectOption("deck-1");
  await page.getByRole("button", { name: "保存", exact: true }).click(); await saved();
  assert.equal(await page.locator("#target-deck").inputValue(), "deck-1");
  await page.getByRole("button", { name: "この問題を削除" }).click();
  await page.getByRole("button", { name: "削除する", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("#editor-status").textContent.startsWith("削除しました"));
  assert.equal(await page.locator(".question-row").count(), 3);
  await page.getByRole("button", { name: "削除を元に戻す" }).click();
  await page.waitForFunction(() => document.querySelector("#editor-status").textContent.includes("元に戻しました"));
  assert.equal(await page.locator(".question-row").count(), 4);
  await page.getByRole("button", { name: /追加した問題/ }).click();
  await page.locator('[name="answer"]').fill("通信に失敗しても残る入力");
  await page.route("**/v1/question-editor", (route) => route.request().method() === "POST" ? route.abort() : route.continue());
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("#editor-status").textContent.includes("接続できません"));
  assert.equal(await page.locator('[name="answer"]').inputValue(), "通信に失敗しても残る入力");
  assert.equal(await page.locator("#save-question").isEnabled(), true);
  await page.unroute("**/v1/question-editor");
  await page.getByRole("button", { name: "保存", exact: true }).click(); await saved();

  const otherPage = await context.newPage(); await otherPage.goto(editorUrl);
  await otherPage.getByRole("button", { name: /最初の問題/ }).click();
  await otherPage.locator('[name="answer"]').fill("別画面の保存");
  await otherPage.getByRole("button", { name: "保存", exact: true }).click();
  await otherPage.waitForFunction(() => document.querySelector("#editor-status").textContent === "保存しました。");
  await page.locator('[name="answer"]').fill("競合しても残る入力");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("#editor-status").textContent.includes("別の画面"));
  assert.equal(await page.locator('[name="answer"]').inputValue(), "競合しても残る入力");
  await page.locator("#reload-editor").click(); await page.getByRole("button", { name: "保存せずに移動" }).click();
  await page.waitForFunction(() => document.querySelector("#editor-status").textContent.includes("最新の問題"));
  await page.getByRole("button", { name: /最初の問題/ }).click();
  const artifacts = path.join(root, ".wrangler", "editor-check"); await mkdir(artifacts, { recursive: true });
  await page.screenshot({ path: path.join(artifacts, "desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator(".editor-list-panel").isVisible(), false);
  assert.equal(await page.locator(".editor-form-panel").isVisible(), true);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: path.join(artifacts, "mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "一覧へ戻る" }).click();
  assert.equal(await page.locator(".editor-list-panel").isVisible(), true);
  await page.getByRole("button", { name: "ダークモードに切り替える" }).click();
  await page.screenshot({ path: path.join(artifacts, "mobile-dark.png"), fullPage: true });
  await page.goto("http://127.0.0.1:4173/?subject=test");
  await page.locator("#setup-panel:not(.is-hidden)").waitFor();
  assert.equal(await page.getByRole("link", { name: "問題を編集", exact: true }).isVisible(), true);
  await page.getByRole("link", { name: "問題を編集", exact: true }).click(); await ready();
  assert.equal(await page.locator("#editor-deck").inputValue(), "deck-1");
  await page.goto("http://127.0.0.1:4173/");
  await page.locator("#subject-panel:not(.is-hidden)").waitFor();
  assert.deepEqual(errors, []);
  console.log("ブラウザー検証：入口・初期デッキ・検索・追加・編集・移動・削除・復元・未保存確認・通信失敗・同時編集・スマートフォン・暗い配色を無音で確認しました。");
  console.log(`画面確認用画像: ${artifacts}`);
} finally {
  await browser?.close();
  server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
}
