import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = path.join(projectRoot, "public", "data");
const manifestPath = path.join(dataRoot, "term-images.json");
const baseUrl = "https://pub-76ffbe2829114a5cbaa433db45872267.r2.dev";
const productionOrigin = "https://anki-ume.vercel.app";
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

const jobs = [
  { key: "term-images.json", filePath: manifestPath },
  ...manifest.assets.map((asset) => ({
    key: asset.path.replaceAll("\\", "/"),
    filePath: path.join(dataRoot, asset.path),
  })),
];
const digest = (buffer) => createHash("sha256").update(buffer).digest("hex");

let nextJob = 0;
let completed = 0;
const failures = [];
const worker = async () => {
  while (nextJob < jobs.length) {
    const jobIndex = nextJob;
    nextJob += 1;
    const job = jobs[jobIndex];
    try {
      const local = await readFile(job.filePath);
      const response = await fetch(`${baseUrl}/${job.key}`, {
        cache: "no-store",
        headers: { Origin: productionOrigin },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      if (response.headers.get("access-control-allow-origin") !== productionOrigin) {
        throw new Error("本番URL向けの読み込み許可がありません。");
      }
      const remote = Buffer.from(await response.arrayBuffer());
      if (digest(local) !== digest(remote)) {
        throw new Error("手元の正本と内容が一致しません。");
      }
      completed += 1;
      if (completed % 50 === 0 || completed === jobs.length) {
        console.log(`Cloudflare照合: ${completed}/${jobs.length}`);
      }
    } catch (error) {
      failures.push(new Error(`${job.key}: ${error.message}`));
    }
  }
};

await Promise.all(Array.from({ length: 12 }, () => worker()));
if (failures.length > 0) {
  throw new AggregateError(failures, `${failures.length}件の照合に失敗しました。`);
}
console.log(`Cloudflare照合完了: 画像${manifest.assets.length}点・一覧1件`);
