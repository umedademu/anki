import {
  escapeSsml,
  normalizeAzureSpeechVoice,
  normalizeEnglishAzureSpeechVoice,
  normalizeDatasetVersion,
  normalizeQuestionRecord,
  normalizeStudyActivity,
  normalizeStudyTimeEntry,
  normalizeStudySession as normalizeWorkerStudySession,
  normalizeSetupPreferences as normalizeWorkerSetupPreferences,
  normalizeSettings,
  normalizeSpeechParts as normalizeWorkerSpeechParts,
  normalizeSpeechPrompt,
  studyDateAtFourJst,
} from "../worker/src/index.js";
import worker from "../worker/src/index.js";
import {
  normalizeSetupPreferences as normalizeBrowserSetupPreferences,
  normalizeSharedSettings,
  normalizeStudyHistory,
  normalizeSpeechParts as normalizeBrowserSpeechParts,
  normalizeStudySession as normalizeBrowserStudySession,
  normalizeStudySessions,
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

const studySessionInput = {
  studyMode: "memorize",
  deckIds: ["deck-1", "deck-2", "deck-1", "不正なデッキ"],
  selectedStage: "beginner",
  questionAmountMode: "one-per-term",
  shuffleEnabled: true,
  autoSpeechEnabled: false,
  filters: { macroRegion: "アジア", regionDetail: "東アジア", category: "政治" },
  termIds: ["WH-000001", "WH-000002"],
  tasks: [
    { termId: "WH-000001", questionId: "WH-Q-000001", stage: "beginner" },
    { termId: "WH-000002", questionId: "WH-Q-000002", stage: "beginner" },
  ],
  queue: [
    { termId: "WH-000002", questionId: "WH-Q-000002", stage: "beginner" },
  ],
  currentTask: {
    termId: "WH-000001",
    questionId: "WH-Q-000001",
    stage: "beginner",
  },
  unseenQuestionIds: ["WH-Q-000001", "WH-Q-000002"],
  retryQuestionIds: ["WH-Q-000001"],
  answeredCount: 12,
  studySeconds: 4264,
  screenStudySeconds: 30,
  savedScreenStudySeconds: 25,
  studyTimeEventId: "study-time-event-1",
  answerVisible: true,
  startedAt: "2026-08-22T00:00:00.000Z",
};
for (const session of [
  normalizeWorkerStudySession(studySessionInput),
  normalizeBrowserStudySession(studySessionInput),
]) {
  if (
    session.studyMode !== "memorize" ||
    session.deckIds.join(",") !== "deck-1,deck-2" ||
    session.tasks.length !== 2 ||
    session.queue.length !== 1 ||
    session.currentTask.questionId !== "WH-Q-000001" ||
    session.retryQuestionIds[0] !== "WH-Q-000001" ||
    session.answeredCount !== 12 ||
    session.studySeconds !== 4264 ||
    session.screenStudySeconds !== 30 ||
    session.savedScreenStudySeconds !== 25 ||
    session.studyTimeEventId !== "study-time-event-1" ||
    !session.answerVisible
  ) {
    throw new Error("Cloudflareへ保存する一周を正規化できませんでした。");
  }
}

const listeningSessionInput = {
  ...studySessionInput,
  studyMode: "listen-answer",
  answeredCount: 5,
  answerVisible: false,
};
const separateStudySessions = normalizeStudySessions({
  memorize: studySessionInput,
  "listen-answer": listeningSessionInput,
});
if (
  separateStudySessions.memorize?.answeredCount !== 12 ||
  separateStudySessions["listen-answer"]?.answeredCount !== 5 ||
  separateStudySessions.memorize.studyMode !== "memorize" ||
  separateStudySessions["listen-answer"].studyMode !== "listen-answer"
) {
  throw new Error("暗記と聞き流しの一周を別々に読み込めませんでした。");
}
const legacyStudySessions = normalizeStudySessions(null, listeningSessionInput);
if (
  legacyStudySessions.memorize !== null ||
  legacyStudySessions["listen-answer"]?.answeredCount !== 5
) {
  throw new Error("従来の一周を記録済みの学習モードへ引き継げませんでした。");
}

const studyActivity = normalizeStudyActivity(
  {
    subjectId: "world-history",
    subjectTitle: "世界史",
    deckId: "deck-2",
    deckTitle: "Deck 2 共通テスト基礎",
    studyMode: "listen-answer",
    questionId: "WH-Q-000001",
  },
  "world-history-deck-2-v1",
  "study-event-1",
);
const studyTimeEntry = normalizeStudyTimeEntry(
  {
    ...studyActivity,
    studySeconds: 90,
  },
  "world-history-deck-2-v1",
  "study-time-event-1",
);
if (
  studyActivity.subjectTitle !== "世界史" ||
  studyActivity.deckId !== "deck-2" ||
  studyActivity.studyMode !== "listen-answer" ||
  studyActivity.datasetVersion !== "world-history-deck-2-v1" ||
  studyTimeEntry.studySeconds !== 30 ||
  studyDateAtFourJst("2026-08-22T18:59:59.999Z") !== "2026-08-22" ||
  studyDateAtFourJst("2026-08-22T19:00:00.000Z") !== "2026-08-23"
) {
  throw new Error("日別学習記録または午前4時の切替を処理できませんでした。");
}

const browserHistory = normalizeStudyHistory([
  {
    studyDate: "2026-08-22",
    subjectId: "world-history",
    subjectTitle: "世界史",
    deckId: "deck-2",
    deckTitle: "Deck 2 共通テスト基礎",
    studyMode: "memorize",
    answeredCount: "12",
    studySeconds: "4264",
  },
  {
    studyDate: "2026-08-22",
    subjectId: "world-history",
    subjectTitle: "世界史",
    deckId: "deck-2",
    deckTitle: "Deck 2 共通テスト基礎",
    studyMode: "listen-answer",
    answeredCount: 0,
    studySeconds: 15,
  },
  { studyDate: "invalid", answeredCount: 3 },
]);
if (
  browserHistory.length !== 2 ||
  browserHistory[0].answeredCount !== 12 ||
  browserHistory[0].studySeconds !== 4264 ||
  browserHistory[0].studyMode !== "memorize" ||
  browserHistory[1].answeredCount !== 0 ||
  browserHistory[1].studySeconds !== 15
) {
  throw new Error("日別学習記録の読込値を安全に整形できませんでした。");
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
  setupPreferences: {
    schemaVersion: 1,
    lastSubjectId: "world-history",
    subjects: {
      "world-history": {
        lastDeckId: "deck-2",
        selectedDeckIds: ["deck-2", "deck-3", "deck-2", "不正なデッキ"],
        studyMode: "listen-answer",
        decks: {
          "deck-2": {
            macroRegion: "アジア",
            regionDetail: "東アジア",
            category: "政治",
            questionStyle: "reverse",
            questionAmountMode: "one-per-term",
          },
        },
      },
      "不正な科目ID": {
        lastDeckId: "deck-9",
      },
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
  !settings.speechParts.vocabulary.exampleEnglish ||
  settings.setupPreferences.lastSubjectId !== "world-history" ||
  settings.setupPreferences.subjects["world-history"].lastDeckId !== "deck-2" ||
  settings.setupPreferences.subjects["world-history"].selectedDeckIds.join(",") !==
    "deck-2,deck-3" ||
  settings.setupPreferences.subjects["world-history"].studyMode !== "listen-answer" ||
  settings.setupPreferences.subjects["world-history"].decks["deck-2"].questionAmountMode !==
    "one-per-term" ||
  "不正な科目ID" in settings.setupPreferences.subjects
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
  browserSettings.speechParts.vocabulary.exampleJapanese ||
  browserSettings.setupPreferences.subjects["world-history"].selectedDeckIds.length !== 2 ||
  browserSettings.setupPreferences.subjects["world-history"].decks["deck-2"]
    .regionDetail !== "東アジア"
) {
  throw new Error("Cloudflareの共通設定をブラウザー側へ反映できませんでした。");
}

const invalidSetupPreferences = {
  lastSubjectId: "world-history",
  subjects: {
    "world-history": {
      lastDeckId: "deck-2",
      studyMode: "unknown",
      decks: {
        "deck-2": {
          macroRegion: "x".repeat(300),
          questionStyle: "unknown",
          questionAmountMode: "unknown",
        },
      },
    },
  },
};
for (const normalized of [
  normalizeWorkerSetupPreferences(JSON.stringify(invalidSetupPreferences)),
  normalizeBrowserSetupPreferences(invalidSetupPreferences),
]) {
  const deck = normalized.subjects["world-history"].decks["deck-2"];
  if (
    normalized.subjects["world-history"].studyMode !== "memorize" ||
    normalized.subjects["world-history"].selectedDeckIds[0] !== "deck-2" ||
    deck.macroRegion.length !== 200 ||
    deck.questionStyle !== "" ||
    deck.questionAmountMode !== "all"
  ) {
    throw new Error("開始前の保存値を安全な範囲へ補正できませんでした。");
  }
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
  "Cloudflare窓口検証完了: 学習記録・開始設定・Azure音声生成を確認",
);
