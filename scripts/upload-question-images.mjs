import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = path.join(projectRoot, "public", "data");
const manifestPath = path.join(dataRoot, "term-images.json");
const bucket = "anki-world-history";
const wranglerPath = path.join(
  projectRoot,
  "node_modules",
  "wrangler",
  "bin",
  "wrangler.js",
);

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.schemaVersion !== 2 || !Array.isArray(manifest.assets)) {
  throw new Error("問題別画像一覧の形式が正しくありません。");
}

const contentTypeFor = (filePath) => {
  const extension = path.extname(filePath).toLowerCase();
  return {
    ".json": "application/json; charset=utf-8",
    ".webp": "image/webp",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
  }[extension] ?? "application/octet-stream";
};

const jobs = [
  {
    key: "term-images.json",
    filePath: manifestPath,
    cacheControl: "no-cache",
  },
  ...manifest.assets.map((asset) => ({
    key: asset.path.replaceAll("\\", "/"),
    filePath: path.join(dataRoot, asset.path),
    cacheControl: "public, max-age=31536000, immutable",
  })),
];

const runWrangler = (job) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        wranglerPath,
        "r2",
        "object",
        "put",
        `${bucket}/${job.key}`,
        "--file",
        job.filePath,
        "--content-type",
        contentTypeFor(job.filePath),
        "--cache-control",
        job.cacheControl,
        "--remote",
        "--force",
      ],
      { cwd: projectRoot, stdio: ["ignore", "pipe", "pipe"] },
    );
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${job.key}の登録に失敗しました。\n${output.trim()}`));
    });
  });

let nextJob = 0;
let completed = 0;
const failures = [];
const worker = async () => {
  while (nextJob < jobs.length) {
    const jobIndex = nextJob;
    nextJob += 1;
    const job = jobs[jobIndex];
    try {
      await runWrangler(job);
      completed += 1;
      if (completed % 25 === 0 || completed === jobs.length) {
        console.log(`Cloudflare登録: ${completed}/${jobs.length}`);
      }
    } catch (error) {
      failures.push(error);
    }
  }
};

await Promise.all(Array.from({ length: 8 }, () => worker()));
if (failures.length > 0) {
  throw new AggregateError(failures, `${failures.length}件の登録に失敗しました。`);
}
console.log(`Cloudflare登録完了: 画像${manifest.assets.length}点・問題${manifest.assignments.length}問`);
