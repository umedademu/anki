import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(path.join(projectRoot, "public", "index.html"), "utf8");
const changelog = await readFile(
  path.join(projectRoot, "public", "changelog.html"),
  "utf8",
);
const app = await readFile(path.join(projectRoot, "public", "app.js"), "utf8");
const config = await readFile(path.join(projectRoot, "public", "config.js"), "utf8");
const styles = await readFile(path.join(projectRoot, "public", "styles.css"), "utf8");

const htmlIds = new Set(
  [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]),
);
const selectedIds = [
  ...app.matchAll(/document\.querySelector\("#([^"]+)"\)/g),
].map((match) => match[1]);
const missingIds = selectedIds.filter((id) => !htmlIds.has(id));

if (missingIds.length > 0) {
  throw new Error(`画面に存在しない部品を参照しています: ${missingIds.join(", ")}`);
}
if (!html.includes('<script src="/app.js" type="module"></script>')) {
  throw new Error("学習処理が部品分割に対応した読込方法になっていません。");
}
if (
  !html.includes('id="setup-panel"') ||
  !html.includes('id="start-study"') ||
  !html.includes('id="question-style-filter"') ||
  !html.includes('href="/changelog.html"') ||
  !html.includes("v0.013") ||
  !changelog.includes("v0.013")
) {
  throw new Error("開始前の条件選択画面、更新情報ページ、版番号が揃っていません。");
}
if (
  !html.includes('href="/styles.css?v=0.013"') ||
  !styles.includes("-webkit-text-size-adjust: 100%") ||
  !styles.includes("text-size-adjust: 100%")
) {
  throw new Error("Safariの文字自動拡大防止または装飾ファイルの版指定がありません。");
}
if (
  html.includes('class="answer-label"') ||
  html.includes('class="term-overview-label"') ||
  !styles.includes("[data-content-density=\"dense\"] #answer-text") ||
  !styles.includes("font-size: clamp(0.95rem, 2vw, 1rem)") ||
  !app.includes("const minimumFontSize = 15")
) {
  throw new Error("回答・解説の見出し撤去または横向きの文字サイズ調整が不完全です。");
}
if (
  !html.includes('id="back-action"') ||
  !html.includes('id="next-action"') ||
  html.includes('id="reveal-action"') ||
  !app.includes("createRatingUndoSnapshot") ||
  !app.includes("restoreRatingUndoSnapshot") ||
  !app.includes("function goBackOneStep()") ||
  !app.includes("performRightSideAction(true)") ||
  !styles.includes(".back-action::before") ||
  !styles.includes(".next-action,\n  .again-action")
) {
  throw new Error("一手戻しまたは横向きの左右タップ操作が揃っていません。");
}
if (
  !app.includes(
    'document.body.classList.toggle("is-studying", panel === elements.studyShell)',
  ) ||
  !styles.includes("body.is-studying .site-header") ||
  !styles.includes("body.is-studying .page")
) {
  throw new Error("学習開始後にヘッダーを隠して上部余白を縮める処理がありません。");
}
if (
  !styles.includes(".progress-track {\n    height: 3px;\n    margin: 0;\n    grid-row: 2;") ||
  !styles.includes(".question-card {\n    min-height: 0;\n    padding: 5px 12px;\n    grid-row: 3;") ||
  !styles.includes(".action-dock {\n    position: static;\n    min-height: 0;\n    padding: 0;\n    grid-row: 4;")
) {
  throw new Error("横向き画面の問題・操作欄に固定の配置行がありません。");
}
if (
  !app.includes('question.stage === "beginner"') ||
  !styles.includes(".context-card.is-beginner-stage") ||
  !styles.includes(".context-card.is-beginner-stage {\n  display: none;")
) {
  throw new Error("通常の一問一答の不要な上部枠を隠す処理が見つかりません。");
}
if (
  !html.match(/class="question-heading"[\s\S]*?class="progress-summary"/) ||
  html.includes('id="completion-reset"') ||
  html.indexOf('id="reset-progress"') > html.indexOf('id="study-shell"')
) {
  throw new Error("進捗または記録初期化の表示位置が正しくありません。");
}
if (
  styles.includes(
    "grid-template-columns: minmax(250px, 0.85fr) minmax(0, 1.45fr)",
  )
) {
  throw new Error("大きな画面向けの左右二列表示が残っています。");
}
if (
  html.includes('id="mastery-term"') ||
  html.includes('id="current-streak"') ||
  app.includes("あと${remaining}回連続")
) {
  throw new Error("習得件数以外の補足表示が残っています。");
}
if (
  html.includes('id="change-conditions"') ||
  html.includes('id="shuffle-toggle"') ||
  html.includes('id="completion-change-conditions"')
) {
  throw new Error("開始後の画面に条件変更またはシャッフル操作が残っています。");
}
const configForHostname = (hostname) => {
  const context = { window: { location: { hostname } } };
  runInNewContext(config, context);
  return context.window.ANKI_CONFIG;
};
const productionConfig = configForHostname("anki-ume.vercel.app");
const localhostConfig = configForHostname("localhost");
const loopbackConfig = configForHostname("127.0.0.1");

if (
  productionConfig.dataBaseUrl !==
  "https://pub-76ffbe2829114a5cbaa433db45872267.r2.dev"
) {
  throw new Error("本番の学習データ読込先がCloudflareに設定されていません。");
}
if (app.includes('config.dataBaseUrl ?? "/data"')) {
  throw new Error("本番でローカルデータへ暗黙に切り替わる処理が残っています。");
}
if (localhostConfig.dataBaseUrl !== "/data" || loopbackConfig.dataBaseUrl !== "/data") {
  throw new Error("手元確認だけに限定したローカルデータ設定が見つかりません。");
}
console.log(
  "画面構成検証完了: 条件選択画面・更新情報・画面部品・Cloudflare読込設定を確認",
);
