import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = path.join(projectRoot, "public", "data");
const bucket = "anki-world-history";
const baseUrl = "https://pub-76ffbe2829114a5cbaa433db45872267.r2.dev";
const productionOrigin = "https://anki-ume.vercel.app";
const applyChanges = process.argv.includes("--apply");
const wranglerPath = path.join(
  projectRoot,
  "node_modules",
  "wrangler",
  "bin",
  "wrangler.js",
);

const readJson = async (filePath) =>
  JSON.parse(await readFile(filePath, "utf8"));
const fetchRemoteJson = async (key) => {
  const response = await fetch(`${baseUrl}/${key}?replace=${Date.now()}`, {
    cache: "no-store",
    headers: { Origin: productionOrigin },
  });
  if (!response.ok) {
    throw new Error(`Cloudflare上の${key}を確認できません（${response.status}）。`);
  }
  return response.json();
};
const normalizeKey = (key) => String(key ?? "").replaceAll("\\", "/");
const assertLearningDataKey = (key) => {
  const allowedExactKeys = new Set([
    "index.json",
    "term-images.json",
    "subjects/world-history/index.json",
  ]);
  if (
    !allowedExactKeys.has(key) &&
    !key.startsWith("subjects/world-history/chunks/") &&
    !key.startsWith("term-images/")
  ) {
    throw new Error(`問題集以外の削除候補を検出しました: ${key}`);
  }
  if (key.includes("..") || key.startsWith("/") || key.startsWith("speech-cache/")) {
    throw new Error(`安全でない削除候補を検出しました: ${key}`);
  }
  return key;
};

const localCatalogPath = path.join(dataRoot, "index.json");
const localCatalog = await readJson(localCatalogPath);
if (localCatalog.schemaVersion !== 3 || localCatalog.subjects.length !== 1) {
  throw new Error("手元の科目一覧が正しくありません。先にnpm run build:dataを実行してください。");
}
const localSubjectKey = normalizeKey(localCatalog.subjects[0].indexPath);
const localSubjectPath = path.join(dataRoot, localSubjectKey);
const localSubject = await readJson(localSubjectPath);
const localManifestPath = path.join(dataRoot, "term-images.json");
const localManifest = await readJson(localManifestPath);

const localJobs = [
  { key: "index.json", filePath: localCatalogPath, cacheControl: "no-cache" },
  { key: localSubjectKey, filePath: localSubjectPath, cacheControl: "no-cache" },
  ...localSubject.chunks.map((chunk) => ({
    key: normalizeKey(chunk.path),
    filePath: path.join(dataRoot, chunk.path),
    cacheControl: "no-cache",
  })),
  { key: "term-images.json", filePath: localManifestPath, cacheControl: "no-cache" },
  ...localManifest.assets.map((asset) => ({
    key: normalizeKey(asset.path),
    filePath: path.join(dataRoot, asset.path),
    cacheControl: "public, max-age=31536000, immutable",
  })),
];
localJobs.forEach((job) => assertLearningDataKey(job.key));

const [remoteSubject, remoteManifest] = await Promise.all([
  fetchRemoteJson("subjects/world-history/index.json"),
  fetchRemoteJson("term-images.json"),
]);
const remoteKeys = new Set([
  "index.json",
  "subjects/world-history/index.json",
  ...remoteSubject.chunks.map((chunk) => normalizeKey(chunk.path)),
  "term-images.json",
  ...remoteManifest.assets.map((asset) => normalizeKey(asset.path)),
]);
for (const key of remoteKeys) {
  assertLearningDataKey(key);
}
const localKeys = new Set(localJobs.map((job) => job.key));
const staleKeys = [...remoteKeys].filter((key) => !localKeys.has(key)).sort();

console.log(
  `更新対象: 旧${remoteSubject.termCount}語・${remoteSubject.questionCount}問から、新${localSubject.termCount}語・${localSubject.questionCount}問`,
);
console.log(
  `Cloudflare操作: 上書き・追加${localJobs.length}件、旧問題集だけの削除${staleKeys.length}件`,
);
if (!applyChanges) {
  console.log("予行表示のみです。実行するには--applyを付けてください。");
  process.exit(0);
}

const runWrangler = (args, label) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [wranglerPath, ...args], {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
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
      reject(new Error(`${label}に失敗しました。\n${output.trim()}`));
    });
  });

const runPool = async (items, work, progressLabel) => {
  let nextIndex = 0;
  let completed = 0;
  const failures = [];
  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        await work(items[index]);
        completed += 1;
        if (completed % 25 === 0 || completed === items.length) {
          console.log(`${progressLabel}: ${completed}/${items.length}`);
        }
      } catch (error) {
        failures.push(error);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, items.length || 1) }, () => worker()));
  if (failures.length > 0) {
    throw new AggregateError(failures, `${progressLabel}で${failures.length}件失敗しました。`);
  }
};

await runPool(
  staleKeys,
  (key) =>
    runWrangler(
      ["r2", "object", "delete", `${bucket}/${key}`, "--remote"],
      `${key}の削除`,
    ),
  "旧データ削除",
);

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
await runPool(
  localJobs,
  (job) =>
    runWrangler(
      [
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
      `${job.key}の登録`,
    ),
  "新データ登録",
);

const digest = (buffer) => createHash("sha256").update(buffer).digest("hex");
await runPool(
  localJobs,
  async (job) => {
    const local = await readFile(job.filePath);
    const response = await fetch(`${baseUrl}/${job.key}?verify=${Date.now()}`, {
      cache: "no-store",
      headers: { Origin: productionOrigin },
    });
    if (!response.ok) {
      throw new Error(`${job.key}を取得できません（${response.status}）。`);
    }
    const remote = Buffer.from(await response.arrayBuffer());
    if (digest(local) !== digest(remote)) {
      throw new Error(`${job.key}が手元の正本と一致しません。`);
    }
  },
  "登録内容照合",
);

console.log(
  `Cloudflare置換完了: ${localSubject.termCount}語・${localSubject.questionCount}問、旧問題画像${staleKeys.length}件を削除`,
);
