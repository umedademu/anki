import {
  escapeSsml,
  hasExpectedRatingSoundSignature,
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
import {
  normalizeRatingSoundContentType,
  normalizeRatingSounds,
  normalizeRatingSoundVolume,
  ratingSoundFileExtension,
} from "../public/rating-sound-settings.js";
import worker from "../worker/src/index.js";
import {
  normalizeSetupPreferences as normalizeBrowserSetupPreferences,
  normalizeSharedSettings,
  normalizeRoundProgress,
  normalizeStudyHistory,
  normalizeSpeechParts as normalizeBrowserSpeechParts,
  normalizeStudySession as normalizeBrowserStudySession,
  normalizeStudySessions,
  switchStudySessionMode,
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
  roundId: "round-1",
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
  ratingCounts: { again: 2, hard: "3", good: 4, easy: -1 },
  studySeconds: 4264,
  screenStudySeconds: 90,
  savedScreenStudySeconds: 80,
  studyTimeEventId: "study-time-event-1",
  answerVisible: true,
  routineOvertimeEndsAt: "2026-08-25T00:10:00.000Z",
  startedAt: "2026-08-22T00:00:00.000Z",
};
for (const session of [
  normalizeWorkerStudySession(studySessionInput),
  normalizeBrowserStudySession(studySessionInput),
]) {
  if (
    session.roundId !== "round-1" ||
    session.studyMode !== "memorize" ||
    session.deckIds.join(",") !== "deck-1,deck-2" ||
    session.tasks.length !== 2 ||
    session.queue.length !== 1 ||
    session.currentTask.questionId !== "WH-Q-000001" ||
    session.retryQuestionIds[0] !== "WH-Q-000001" ||
    session.answeredCount !== 12 ||
    session.ratingCounts.again !== 2 ||
    session.ratingCounts.hard !== 3 ||
    session.ratingCounts.good !== 4 ||
    session.ratingCounts.easy !== 0 ||
    session.studySeconds !== 4264 ||
    session.screenStudySeconds !== 90 ||
    session.savedScreenStudySeconds !== 80 ||
    session.studyTimeEventId !== "study-time-event-1" ||
    session.routineOvertimeEndsAt !== "2026-08-25T00:10:00.000Z" ||
    !session.autoSpeechEnabled ||
    !session.answerVisible
  ) {
    throw new Error("Cloudflareへ保存する一周を正規化できませんでした。");
  }
}

if (
  normalizeRoundProgress({ completedCount: "3" }).completedCount !== 3 ||
  normalizeRoundProgress({ completedCount: -1 }).completedCount !== 0
) {
  throw new Error("完了した周回数を正しく整形できませんでした。");
}

const listeningSessionInput = {
  ...studySessionInput,
  studyMode: "listen-answer",
  answeredCount: 5,
  answerVisible: false,
  updatedAt: "2026-08-25T01:00:00.000Z",
};
const sharedStudySessions = normalizeStudySessions({
  memorize: {
    ...studySessionInput,
    updatedAt: "2026-08-25T00:00:00.000Z",
  },
  "listen-answer": listeningSessionInput,
});
if (
  sharedStudySessions.memorize?.answeredCount !== 5 ||
  sharedStudySessions["listen-answer"]?.answeredCount !== 5 ||
  sharedStudySessions.memorize.studyMode !== "listen-answer" ||
  sharedStudySessions.memorize !== sharedStudySessions["listen-answer"]
) {
  throw new Error("暗記と聞き流しで最新の一周を共有できませんでした。");
}
const legacyStudySessions = normalizeStudySessions(null, listeningSessionInput);
if (
  legacyStudySessions.memorize?.answeredCount !== 5 ||
  legacyStudySessions["listen-answer"]?.answeredCount !== 5
) {
  throw new Error("従来の一周を両方の学習モードへ引き継げませんでした。");
}
const switchedStudySession = switchStudySessionMode(
  sharedStudySessions.memorize,
  "memorize",
);
if (
  switchedStudySession.studyMode !== "memorize" ||
  switchedStudySession.roundId !== "round-1" ||
  switchedStudySession.currentTask.questionId !== "WH-Q-000001" ||
  switchedStudySession.queue[0].questionId !== "WH-Q-000002" ||
  switchedStudySession.answerVisible ||
  switchedStudySession.screenStudySeconds !== 0 ||
  switchedStudySession.savedScreenStudySeconds !== 0 ||
  switchedStudySession.studyTimeEventId !== ""
) {
  throw new Error("一周の位置を保ったまま学習モードを切り替えられませんでした。");
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
  studyTimeEntry.studySeconds !== 90 ||
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
if (
  normalizeRatingSoundContentType("audio/x-wav") !== "audio/wav" ||
  normalizeRatingSoundContentType("", "coin.mp3") !== "audio/mpeg" ||
  ratingSoundFileExtension("audio/mp4") !== "m4a" ||
  normalizeRatingSoundVolume(9) !== 2 ||
  !hasExpectedRatingSoundSignature(
    Uint8Array.from([0x49, 0x44, 0x33, 0x04]),
    "audio/mpeg",
  ) ||
  !hasExpectedRatingSoundSignature(
    new TextEncoder().encode("RIFF1234WAVE"),
    "audio/wav",
  ) ||
  hasExpectedRatingSoundSignature(
    new TextEncoder().encode("not audio"),
    "audio/wav",
  )
) {
  throw new Error("登録する評価音の形式を安全に検査できませんでした。");
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
  listeningQuestionIntervalSeconds: 1.5,
  studyRoutineOvertimeSeconds: 900,
  studyTimeLimitSeconds: 90,
  ratingSoundVolume: 1.75,
  ratingSounds: {
    good: {
      storageKey: "rating-sounds/good/test-id.mp3",
      fileName: "正解音.mp3",
      contentType: "audio/mpeg",
      size: 12345,
      updatedAt: "2026-08-26T00:00:00.000Z",
    },
    easy: { storageKey: "speech-cache/private.mp3" },
  },
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
    routineMultiplier: 2.75,
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
    routineVideos: [
      {
        youtubeId: "HfOoVw-ef_o",
        title: "イスラーム世界史",
        authorName: "法念の世界史ちゃんねる",
      },
      { youtubeId: "invalid", title: "不正" },
    ],
    routineVideoShuffle: {
      remainingYoutubeIds: ["HfOoVw-ef_o", "invalid"],
      lastYoutubeId: "_mv5r0wix3M",
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
  !settings.autoSpeechEnabled ||
  settings.listeningPauseSeconds !== 2.5 ||
  settings.listeningQuestionIntervalSeconds !== 1.5 ||
  settings.studyRoutineOvertimeSeconds !== 900 ||
  settings.studyTimeLimitSeconds !== 90 ||
  settings.ratingSoundVolume !== 1.75 ||
  settings.ratingSounds.good?.fileName !== "正解音.mp3" ||
  settings.ratingSounds.easy !== null ||
  settings.speechParts.history.question ||
  !settings.speechParts.history.explanation ||
  settings.speechParts.vocabulary.meaning ||
  !settings.speechParts.vocabulary.exampleEnglish ||
  settings.setupPreferences.lastSubjectId !== "world-history" ||
  settings.setupPreferences.routineMultiplier !== 2.8 ||
  settings.setupPreferences.subjects["world-history"].lastDeckId !== "deck-2" ||
  settings.setupPreferences.subjects["world-history"].selectedDeckIds.join(",") !==
    "deck-2,deck-3" ||
  settings.setupPreferences.subjects["world-history"].studyMode !== "listen-answer" ||
  settings.setupPreferences.subjects["world-history"].decks["deck-2"].questionAmountMode !==
    "one-per-term" ||
  settings.setupPreferences.routineVideos.length !== 1 ||
  settings.setupPreferences.routineVideoShuffle.remainingYoutubeIds[0] !==
    "HfOoVw-ef_o" ||
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
  !browserSettings.autoSpeechEnabled ||
  browserSettings.listeningPauseSeconds !== 2.5 ||
  browserSettings.listeningQuestionIntervalSeconds !== 1.5 ||
  browserSettings.studyRoutineOvertimeSeconds !== 900 ||
  browserSettings.studyTimeLimitSeconds !== 90 ||
  browserSettings.ratingSoundVolume !== 1.75 ||
  browserSettings.ratingSounds.good?.size !== 12345 ||
  normalizeRatingSounds(browserSettings.ratingSounds).easy !== null ||
  browserSettings.speechParts.history.mnemonic ||
  browserSettings.speechParts.vocabulary.exampleJapanese ||
  browserSettings.setupPreferences.subjects["world-history"].selectedDeckIds.length !== 2 ||
  browserSettings.setupPreferences.routineMultiplier !== 2.8 ||
  browserSettings.setupPreferences.subjects["world-history"].decks["deck-2"]
    .regionDetail !== "東アジア" ||
  browserSettings.setupPreferences.routineVideos[0].youtubeId !== "HfOoVw-ef_o"
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
    normalized.routineMultiplier !== 1 ||
    normalized.subjects["world-history"].studyMode !== "memorize" ||
    normalized.subjects["world-history"].selectedDeckIds[0] !== "deck-2" ||
    deck.macroRegion.length !== 200 ||
    deck.questionStyle !== "" ||
    deck.questionAmountMode !== "all"
  ) {
    throw new Error("開始前の保存値を安全な範囲へ補正できませんでした。");
  }
}

const legacyRoutinePreferences = {
  routinePlan: [
    { id: "first", kind: "study", subjectId: "world-history", questionTarget: 1 },
    { id: "first-video", kind: "video" },
    { id: "second", kind: "study", subjectId: "geography", questionTarget: 1 },
  ],
  routineRun: {
    schemaVersion: 1,
    id: "legacy-run",
    studyDate: "2026-08-25",
    items: [
      {
        id: "first",
        subjectId: "world-history",
        questionTarget: 1,
        completedCount: 1,
      },
      {
        id: "second",
        subjectId: "geography",
        questionTarget: 1,
        completedCount: 0,
      },
    ],
  },
};
for (const normalized of [
  normalizeWorkerSetupPreferences(legacyRoutinePreferences),
  normalizeBrowserSetupPreferences(legacyRoutinePreferences),
]) {
  if (
    normalized.routineRun.items.length !== 3 ||
    normalized.routineRun.items[1].kind !== "video" ||
    normalized.routineRun.currentIndex !== 1
  ) {
    throw new Error("動画追加前の進行中メニューをCloudflareと画面で同じように移行できませんでした。");
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
  "Cloudflare窓口検証完了: 学習記録・開始設定・Azure音声・評価音を確認",
);
