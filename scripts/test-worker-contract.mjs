import {
  escapeSsml,
  normalizeAzureSpeechVoice,
  normalizeEnglishAzureSpeechVoice,
  normalizeDatasetVersion,
  normalizeQuestionRecord,
  normalizeSettings,
  normalizeSpeechParts as normalizeWorkerSpeechParts,
  normalizeSpeechPrompt,
} from "../worker/src/index.js";
import worker from "../worker/src/index.js";
import {
  normalizeSharedSettings,
  normalizeSpeechParts as normalizeBrowserSpeechParts,
} from "../public/cloud-progress.js";

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
if (
  normalizeEnglishAzureSpeechVoice("en-US-GuyNeural") !== "en-US-GuyNeural" ||
  normalizeEnglishAzureSpeechVoice("invalid") !== "en-US-JennyNeural"
) {
  throw new Error("英語のAzure音声を正規化できませんでした。");
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
    const voice = [
      "ja-JP-KeitaNeural",
      "ja-JP-NaokiNeural",
      "en-US-GuyNeural",
    ].find(
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
      (!options.body.includes("王安石の政策") &&
        !options.body.includes("although"))
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
const speechRequest = (
  voice = "ja-JP-KeitaNeural",
  text = "王安石の政策",
  language = "ja-JP",
) =>
  new Request("https://anki-progress-api.example/v1/speech", {
    method: "POST",
    headers: {
      Authorization: "Bearer test-key",
      "Content-Type": "application/json",
      Origin: "https://anki-ume.vercel.app",
    },
    body: JSON.stringify({ text, voice, language }),
  });
const firstSpeechResponse = await worker.fetch(speechRequest(), speechEnv);
const secondSpeechResponse = await worker.fetch(speechRequest(), speechEnv);
const alternateSpeechResponse = await worker.fetch(
  speechRequest("ja-JP-NaokiNeural"),
  speechEnv,
);
const englishSpeechResponse = await worker.fetch(
  speechRequest("en-US-GuyNeural", "although", "en-US"),
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
  englishSpeechResponse.headers.get("X-Speech-Cache") !== "MISS" ||
  azureRequestCount !== 3 ||
  requestedAzureVoices.join("|") !==
    "ja-JP-KeitaNeural|ja-JP-NaokiNeural|en-US-GuyNeural" ||
  speechObjects.size !== 3 ||
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
  englishAzureVoiceId: "en-US-GuyNeural",
  voiceId: "device-voice-id",
  englishVoiceId: "english-device-voice-id",
  rate: 9,
  shuffleEnabled: true,
  autoSpeechEnabled: false,
  listeningPauseSeconds: 2.5,
  speechParts: {
    history: {
      question: false,
      answer: true,
      mnemonic: false,
      explanation: true,
    },
    vocabulary: {
      word: true,
      meaning: false,
      exampleEnglish: true,
      exampleJapanese: false,
    },
  },
});
if (
  settings.againSeconds !== 90 ||
  settings.hardSeconds !== 7200 ||
  settings.goodSeconds !== 21600 ||
  settings.easySeconds !== 259200 ||
  settings.source !== "device" ||
  settings.azureVoiceId !== "ja-JP-NaokiNeural" ||
  settings.englishAzureVoiceId !== "en-US-GuyNeural" ||
  settings.voiceId !== "device-voice-id" ||
  settings.englishVoiceId !== "english-device-voice-id" ||
  settings.rate !== 3 ||
  !settings.shuffleEnabled ||
  settings.autoSpeechEnabled ||
  settings.listeningPauseSeconds !== 2.5 ||
  settings.speechParts.history.question ||
  !settings.speechParts.history.explanation ||
  settings.speechParts.vocabulary.meaning ||
  !settings.speechParts.vocabulary.exampleEnglish
) {
  throw new Error("Cloudflareへ保存する共通設定を正規化できませんでした。");
}

const browserSettings = normalizeSharedSettings(settings);
if (
  browserSettings.source !== "device" ||
  browserSettings.azureVoiceId !== "ja-JP-NaokiNeural" ||
  browserSettings.englishAzureVoiceId !== "en-US-GuyNeural" ||
  browserSettings.voiceId !== "device-voice-id" ||
  browserSettings.englishVoiceId !== "english-device-voice-id" ||
  browserSettings.rate !== 3 ||
  !browserSettings.shuffleEnabled ||
  browserSettings.autoSpeechEnabled ||
  browserSettings.listeningPauseSeconds !== 2.5 ||
  browserSettings.speechParts.history.mnemonic ||
  browserSettings.speechParts.vocabulary.exampleJapanese
) {
  throw new Error("Cloudflareの共通設定をブラウザー側へ反映できませんでした。");
}

const workerStoredSpeechParts = normalizeWorkerSpeechParts(
  JSON.stringify(settings.speechParts),
);
const browserFallbackSpeechParts = normalizeBrowserSpeechParts({
  history: {
    question: false,
    answer: false,
    mnemonic: false,
    explanation: false,
  },
  vocabulary: {
    word: false,
    meaning: false,
    exampleEnglish: false,
    exampleJapanese: false,
  },
});
if (
  !workerStoredSpeechParts.history.explanation ||
  !workerStoredSpeechParts.vocabulary.exampleEnglish ||
  !browserFallbackSpeechParts.history.question ||
  browserFallbackSpeechParts.history.explanation ||
  !browserFallbackSpeechParts.vocabulary.word ||
  browserFallbackSpeechParts.vocabulary.exampleEnglish
) {
  throw new Error("読み上げ対象の保存値または最低1項目の初期値が不正です。");
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
