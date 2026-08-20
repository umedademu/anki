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
  !html.includes('href="/changelog.html"') ||
  !html.includes("v0.002") ||
  !changelog.includes("v0.002")
) {
  throw new Error("開始前の条件選択画面、更新情報ページ、版番号が揃っていません。");
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
