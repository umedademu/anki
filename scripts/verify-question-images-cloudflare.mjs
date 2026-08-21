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
const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
let requestQueue = Promise.resolve();
let nextRequestAt = 0;
const waitForRequestSlot = async () => {
  const turn = requestQueue.then(async () => {
    while (nextRequestAt > Date.now()) {
      await delay(nextRequestAt - Date.now());
    }
    nextRequestAt = Date.now() + 100;
  });
  requestQueue = turn.catch(() => {});
  await turn;
};
const fetchForVerification = async (key) => {
  let lastFailure = "応答なし";
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    await waitForRequestSlot();
    const response = await fetch(`${baseUrl}/${key}?verify=${Date.now()}`, {
      cache: "no-store",
      headers: { Origin: productionOrigin },
    });
    if (response.ok) return response;
    lastFailure = `HTTP ${response.status}`;
    if (response.status !== 429) break;
    const retryAfterSeconds = Number.parseInt(
      response.headers.get("retry-after") ?? "",
      10,
    );
    const retryMilliseconds = Number.isFinite(retryAfterSeconds)
      ? retryAfterSeconds * 1_000
      : attempt * 1_000;
    nextRequestAt = Math.max(nextRequestAt, Date.now() + retryMilliseconds);
  }
  throw new Error(lastFailure);
};

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
      const response = await fetchForVerification(job.key);
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

await Promise.all(Array.from({ length: 4 }, () => worker()));
if (failures.length > 0) {
  throw new AggregateError(failures, `${failures.length}件の照合に失敗しました。`);
}
console.log(`Cloudflare照合完了: 画像${manifest.assets.length}点・一覧1件`);
