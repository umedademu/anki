import {
  escapeSsml,
  normalizeAzureSpeechVoice,
  normalizeDatasetVersion,
  normalizeQuestionRecord,
  normalizeSettings,
  normalizeSpeechPrompt,
} from "../worker/src/index.js";
import worker from "../worker/src/index.js";
import { normalizeSharedSettings } from "../public/cloud-progress.js";

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
  escapeSsml("王安石の政策<&\"") !== "王安石の政策&lt;&amp;&quot;" ||
  normalizeAzureSpeechVoice("ja-JP-KeitaNeural") !== "ja-JP-KeitaNeural" ||
  normalizeAzureSpeechVoice("invalid") !== "ja-JP-NanamiNeural"
) {
  throw new Error("Azure音声の文章または読み上げ形式を処理できませんでした。");
}
for (const invalidPrompt of ["", "あ".repeat(2001)]) {
  let failed = false;
  try {
    normalizeSpeechPrompt(invalidPrompt);
  } catch {
    failed = true;
  }
  if (!failed) {
    throw new Error("不正なAzure音声の文章を拒否できませんでした。");
  }
}

let azureRequestCount = 0;
const requestedAzureVoices = [];
const speechObjects = new Map();
const speechEnv = {
  ALLOWED_ORIGIN: "https://anki-ume.vercel.app",
  SYNC_TOKEN: "test-key",
  AZURE_SPEECH_KEY: "test-azure-key",
  AZURE_SPEECH_REGION: "japaneast",
  async AZURE_SPEECH_FETCH(url, options) {
    azureRequestCount += 1;
    const voice = ["ja-JP-KeitaNeural", "ja-JP-NaokiNeural"].find(
      (candidate) => options.body.includes(`voice name="${candidate}"`),
    );
    requestedAzureVoices.push(voice);
    if (
      url !==
        "https://japaneast.tts.speech.microsoft.com/cognitiveservices/v1" ||
      options.method !== "POST" ||
      options.headers["Ocp-Apim-Subscription-Key"] !== "test-azure-key" ||
      options.headers["X-Microsoft-OutputFormat"] !==
        "audio-24khz-48kbitrate-mono-mp3" ||
      !voice ||
      !options.body.includes("王安石の政策")
    ) {
      throw new Error("Azure音声への入力が不正です。");
    }
    return new Response(Uint8Array.from([1, 2, 3]), {
      status: 200,
      headers: { "Content-Type": "audio/mpeg" },
    });
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
const speechRequest = (voice = "ja-JP-KeitaNeural") =>
  new Request("https://anki-progress-api.example/v1/speech", {
    method: "POST",
    headers: {
      Authorization: "Bearer test-key",
      "Content-Type": "application/json",
      Origin: "https://anki-ume.vercel.app",
    },
    body: JSON.stringify({ text: "王安石の政策", voice }),
  });
const firstSpeechResponse = await worker.fetch(speechRequest(), speechEnv);
const secondSpeechResponse = await worker.fetch(speechRequest(), speechEnv);
const alternateSpeechResponse = await worker.fetch(
  speechRequest("ja-JP-NaokiNeural"),
  speechEnv,
);
if (
  firstSpeechResponse.status !== 200 ||
  firstSpeechResponse.headers.get("Content-Type") !== "audio/mpeg" ||
  firstSpeechResponse.headers.get("X-Speech-Cache") !== "MISS" ||
  secondSpeechResponse.headers.get("X-Speech-Cache") !== "HIT" ||
  secondSpeechResponse.headers.get("Access-Control-Allow-Origin") !==
    "https://anki-ume.vercel.app" ||
  alternateSpeechResponse.headers.get("X-Speech-Cache") !== "MISS" ||
  azureRequestCount !== 2 ||
  requestedAzureVoices.join("|") !==
    "ja-JP-KeitaNeural|ja-JP-NaokiNeural" ||
  speechObjects.size !== 2 ||
  new Uint8Array(await secondSpeechResponse.arrayBuffer()).join(",") !== "1,2,3"
) {
  throw new Error("Azure音声の生成・再利用・読取許可が不正です。");
}

const settings = normalizeSettings({
  againSeconds: 90,
  hardSeconds: 7200,
  goodSeconds: 21600,
  easySeconds: 259200,
  source: "device",
  azureVoiceId: "ja-JP-NaokiNeural",
  voiceId: "device-voice-id",
  rate: 1.2,
  shuffleEnabled: true,
  autoSpeechEnabled: false,
});
if (
  settings.againSeconds !== 90 ||
  settings.hardSeconds !== 7200 ||
  settings.goodSeconds !== 21600 ||
  settings.easySeconds !== 259200 ||
  settings.source !== "device" ||
  settings.azureVoiceId !== "ja-JP-NaokiNeural" ||
  settings.voiceId !== "device-voice-id" ||
  settings.rate !== 1.2 ||
  !settings.shuffleEnabled ||
  settings.autoSpeechEnabled
) {
  throw new Error("Cloudflareへ保存する共通設定を正規化できませんでした。");
}

const browserSettings = normalizeSharedSettings(settings);
if (
  browserSettings.source !== "device" ||
  browserSettings.azureVoiceId !== "ja-JP-NaokiNeural" ||
  browserSettings.voiceId !== "device-voice-id" ||
  browserSettings.rate !== 1.2 ||
  !browserSettings.shuffleEnabled ||
  browserSettings.autoSpeechEnabled
) {
  throw new Error("Cloudflareの共通設定をブラウザー側へ反映できませんでした。");
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
  "Cloudflare窓口検証完了: 学習記録・共通設定・Azure音声生成を確認",
);
