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
const resumeAfterAssetUpload = process.argv.includes("--resume-after-asset-upload");
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
  const allowedExactKeys = new Set(["index.json", "term-images.json"]);
  if (
    !allowedExactKeys.has(key) &&
    !(
      /^subjects\/[a-z0-9-]+\//.test(key) &&
      key.endsWith(".json")
    ) &&
    !key.startsWith("term-images/")
  ) {
    throw new Error(`問題集以外の削除候補を検出しました: ${key}`);
  }
  if (key.includes("..") || key.startsWith("/") || key.startsWith("speech-cache/")) {
    throw new Error(`安全でない削除候補を検出しました: ${key}`);
  }
  return key;
};

const deckEntriesFor = (subjectEntry) =>
  Array.isArray(subjectEntry.decks) && subjectEntry.decks.length > 0
    ? subjectEntry.decks
    : [subjectEntry];

const loadDeckIndexes = async (catalog, reader) => {
  if (
    catalog.schemaVersion !== 3 ||
    !Array.isArray(catalog.subjects) ||
    catalog.subjects.length === 0
  ) {
    throw new Error("科目一覧の形式が正しくありません。");
  }
  const deckEntries = catalog.subjects.flatMap((subjectEntry) =>
    deckEntriesFor(subjectEntry).map((deckEntry) => ({
      subjectEntry,
      deckEntry,
    })),
  );
  const deckIndexes = await Promise.all(
    deckEntries.map(async ({ subjectEntry, deckEntry }) => ({
      subjectEntry,
      entry: deckEntry,
      index: await reader(normalizeKey(deckEntry.indexPath)),
    })),
  );
  return { subjectEntries: catalog.subjects, deckEntries, deckIndexes };
};

const localCatalogPath = path.join(dataRoot, "index.json");
const localCatalog = await readJson(localCatalogPath);
const localDeckData = await loadDeckIndexes(localCatalog, (key) =>
  readJson(path.join(dataRoot, key)),
);
const localManifestPath = path.join(dataRoot, "term-images.json");
const localManifest = await readJson(localManifestPath);

const localAssetJobs = localManifest.assets.map((asset) => ({
  key: normalizeKey(asset.path),
  filePath: path.join(dataRoot, asset.path),
  cacheControl: "public, max-age=31536000, immutable",
}));
const localChunkJobs = localDeckData.deckIndexes.flatMap(({ index }) =>
  index.chunks.map((chunk) => ({
    key: normalizeKey(chunk.path),
    filePath: path.join(dataRoot, chunk.path),
    cacheControl: "no-cache",
  })),
);
const localDeckIndexJobs = localDeckData.deckIndexes.map(({ entry }) => ({
    key: normalizeKey(entry.indexPath),
    filePath: path.join(dataRoot, entry.indexPath),
    cacheControl: "no-cache",
}));
const localManifestJob = {
  key: "term-images.json",
  filePath: localManifestPath,
  cacheControl: "no-cache",
};
const localCatalogJob = {
  key: "index.json",
  filePath: localCatalogPath,
  cacheControl: "no-cache",
};
const localJobs = [
  ...localAssetJobs,
  ...localChunkJobs,
  ...localDeckIndexJobs,
  localManifestJob,
  localCatalogJob,
];
localJobs.forEach((job) => assertLearningDataKey(job.key));

const [remoteCatalog, remoteManifest] = await Promise.all([
  fetchRemoteJson("index.json"),
  fetchRemoteJson("term-images.json"),
]);
const remoteDeckData = await loadDeckIndexes(remoteCatalog, fetchRemoteJson);
const remoteAssetKeys = new Set(
  remoteManifest.assets.map((asset) => normalizeKey(asset.path)),
);
const assetUploadJobs = localAssetJobs.filter((job) => !remoteAssetKeys.has(job.key));
const remoteKeys = new Set([
  "index.json",
  ...remoteDeckData.deckIndexes.flatMap(({ entry, index }) => [
    normalizeKey(entry.indexPath),
    ...index.chunks.map((chunk) => normalizeKey(chunk.path)),
  ]),
  "term-images.json",
  ...remoteManifest.assets.map((asset) => normalizeKey(asset.path)),
]);
for (const key of remoteKeys) {
  assertLearningDataKey(key);
}
const localKeys = new Set(localJobs.map((job) => job.key));
const staleKeys = [...remoteKeys].filter((key) => !localKeys.has(key)).sort();
const localTermCount = localDeckData.deckIndexes.reduce(
  (sum, deck) => sum + deck.index.termCount,
  0,
);
const localQuestionCount = localDeckData.deckIndexes.reduce(
  (sum, deck) => sum + deck.index.questionCount,
  0,
);
const remoteTermCount = remoteDeckData.deckIndexes.reduce(
  (sum, deck) => sum + deck.index.termCount,
  0,
);
const remoteQuestionCount = remoteDeckData.deckIndexes.reduce(
  (sum, deck) => sum + deck.index.questionCount,
  0,
);

console.log(
  `更新対象: 旧${remoteTermCount}語・${remoteQuestionCount}問から、新${localTermCount}語・${localQuestionCount}問`,
);
console.log(
  `Cloudflare操作: 上書き・追加${localJobs.length - localAssetJobs.length + assetUploadJobs.length}件、旧問題集だけの削除${staleKeys.length}件`,
);
if (localAssetJobs.length > assetUploadJobs.length) {
  console.log(
    `登録済み画像: ${localAssetJobs.length - assetUploadJobs.length}件は再送しません。`,
  );
}
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
const uploadJobs = (jobs, progressLabel) =>
  runPool(
    jobs,
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
    progressLabel,
  );

const digest = (buffer) => createHash("sha256").update(buffer).digest("hex");
const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
let verificationQueue = Promise.resolve();
let nextVerificationAt = 0;
const waitForVerificationSlot = async () => {
  const turn = verificationQueue.then(async () => {
    while (nextVerificationAt > Date.now()) {
      await delay(nextVerificationAt - Date.now());
    }
    nextVerificationAt = Date.now() + 100;
  });
  verificationQueue = turn.catch(() => {});
  await turn;
};
const fetchForVerification = async (key) => {
  let lastFailure = "応答なし";
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    await waitForVerificationSlot();
    const response = await fetch(`${baseUrl}/${key}?verify=${Date.now()}`, {
      cache: "no-store",
      headers: { Origin: productionOrigin },
    });
    if (response.ok) return response;
    lastFailure = String(response.status);
    if (response.status !== 429) break;
    const retryAfterSeconds = Number.parseInt(
      response.headers.get("retry-after") ?? "",
      10,
    );
    const retryMilliseconds = Number.isFinite(retryAfterSeconds)
      ? retryAfterSeconds * 1_000
      : attempt * 1_000;
    nextVerificationAt = Math.max(nextVerificationAt, Date.now() + retryMilliseconds);
  }
  throw new Error(`${key}を取得できません（${lastFailure}）。`);
};
const verifyJobs = (jobs, progressLabel) =>
  runPool(
    jobs,
    async (job) => {
      const local = await readFile(job.filePath);
      const response = await fetchForVerification(job.key);
      const remote = Buffer.from(await response.arrayBuffer());
      if (digest(local) !== digest(remote)) {
        throw new Error(`${job.key}が手元の正本と一致しません。`);
      }
    },
    progressLabel,
  );
const uploadAndVerify = async (jobs, uploadLabel, verifyLabel) => {
  await uploadJobs(jobs, uploadLabel);
  await verifyJobs(jobs, verifyLabel);
};

// 参照先を先に揃えて照合し、利用者が途中状態の索引を読む時間を作らない。
const assetAndChunkJobs = [...assetUploadJobs, ...localChunkJobs];
if (resumeAfterAssetUpload) {
  console.log("登録済みの画像・分割データの照合から再開します。");
  await verifyJobs(assetAndChunkJobs, "画像・分割データ照合");
} else {
  await uploadAndVerify(
    assetAndChunkJobs,
    "画像・分割データ登録",
    "画像・分割データ照合",
  );
}
await uploadAndVerify(localDeckIndexJobs, "Deck索引登録", "Deck索引照合");
await uploadAndVerify([localManifestJob], "画像一覧登録", "画像一覧照合");
await uploadAndVerify(
  [localCatalogJob],
  "開始画面用索引登録",
  "開始画面用索引照合",
);

await runPool(
  staleKeys,
  (key) =>
    runWrangler(
      ["r2", "object", "delete", `${bucket}/${key}`, "--remote"],
      `${key}の削除`,
    ),
  "旧データ削除",
);

console.log(
  `Cloudflare置換完了: ${localTermCount}語・${localQuestionCount}問、旧問題集データ${staleKeys.length}件を削除`,
);
