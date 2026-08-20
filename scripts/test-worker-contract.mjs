import {
  audioBytesFrom,
  normalizeDatasetVersion,
  normalizeQuestionRecord,
  normalizeSettings,
  normalizeSpeechPrompt,
} from "../worker/src/index.js";
import worker from "../worker/src/index.js";

if (normalizeDatasetVersion("d5d13f1099e9") !== "d5d13f1099e9") {
  throw new Error("問題集の版を保存範囲として扱えませんでした。");
}

const record = normalizeQuestionRecord({
  streak: "2",
  attempts: "4",
  rememberedCount: "3",
  lastRating: "easy",
  lastAnsweredAt: "2026-08-21T00:00:00.000Z",
  nextReviewAt: "2026-08-27T00:00:00.000Z",
  everMastered: true,
});

if (
  record.streak !== 2 ||
  record.attempts !== 4 ||
  record.lastRating !== "easy" ||
  !record.everMastered
) {
  throw new Error("Cloudflareへ保存する問題記録を正規化できませんでした。");
}

if (
  normalizeSpeechPrompt("  王安石  の政策  ") !== "王安石 の政策" ||
  (await audioBytesFrom({ audio: "AQID" })).join(",") !== "1,2,3"
) {
  throw new Error("Cloudflare音声の文章または音声データを処理できませんでした。");
}
for (const invalidPrompt of ["", "あ".repeat(2001)]) {
  let failed = false;
  try {
    normalizeSpeechPrompt(invalidPrompt);
  } catch {
    failed = true;
  }
  if (!failed) {
    throw new Error("不正なCloudflare音声の文章を拒否できませんでした。");
  }
}

let aiRunCount = 0;
const speechObjects = new Map();
const speechEnv = {
  ALLOWED_ORIGIN: "https://anki-ume.vercel.app",
  SYNC_TOKEN: "test-key",
  AI: {
    async run(model, input) {
      aiRunCount += 1;
      if (
        model !== "@cf/myshell-ai/melotts" ||
        input.lang !== "JP" ||
        input.prompt !== "王安石の政策"
      ) {
        throw new Error("Cloudflare音声モデルへの入力が不正です。");
      }
      return { audio: "AQID" };
    },
  },
  SPEECH_CACHE: {
    async get(key) {
      const value = speechObjects.get(key);
      return value ? { body: value } : null;
    },
    async put(key, value) {
      speechObjects.set(key, Uint8Array.from(value));
    },
  },
};
const speechRequest = () =>
  new Request("https://anki-progress-api.example/v1/speech", {
    method: "POST",
    headers: {
      Authorization: "Bearer test-key",
      "Content-Type": "application/json",
      Origin: "https://anki-ume.vercel.app",
    },
    body: JSON.stringify({ text: "王安石の政策" }),
  });
const firstSpeechResponse = await worker.fetch(speechRequest(), speechEnv);
const secondSpeechResponse = await worker.fetch(speechRequest(), speechEnv);
if (
  firstSpeechResponse.status !== 200 ||
  firstSpeechResponse.headers.get("Content-Type") !== "audio/mpeg" ||
  firstSpeechResponse.headers.get("X-Speech-Cache") !== "MISS" ||
  secondSpeechResponse.headers.get("X-Speech-Cache") !== "HIT" ||
  secondSpeechResponse.headers.get("Access-Control-Allow-Origin") !==
    "https://anki-ume.vercel.app" ||
  aiRunCount !== 1 ||
  new Uint8Array(await secondSpeechResponse.arrayBuffer()).join(",") !== "1,2,3"
) {
  throw new Error("Cloudflare音声の生成・再利用・読取許可が不正です。");
}

const settings = normalizeSettings({
  againSeconds: 90,
  hardSeconds: 7200,
  goodSeconds: 21600,
  easySeconds: 259200,
});
if (
  settings.againSeconds !== 90 ||
  settings.hardSeconds !== 7200 ||
  settings.goodSeconds !== 21600 ||
  settings.easySeconds !== 259200
) {
  throw new Error("Cloudflareへ保存する復習間隔を正規化できませんでした。");
}

for (const invalid of [
  { lastRating: "unknown" },
  { lastAnsweredAt: "invalid-date" },
]) {
  let failed = false;
  try {
    normalizeQuestionRecord(invalid);
  } catch {
    failed = true;
  }
  if (!failed) {
    throw new Error("不正なCloudflare保存値を拒否できませんでした。");
  }
}

console.log(
  "Cloudflare窓口検証完了: 学習記録・復習設定・音声生成の入力検査を確認",
);
