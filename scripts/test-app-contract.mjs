import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(path.join(projectRoot, "public", "index.html"), "utf8");
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
console.log("画面構成検証完了: 画面部品とCloudflare読込設定を確認");
