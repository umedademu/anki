import {
  defaultStudyRoutineOvertimeSeconds,
  defaultStudyRoutinePlan,
  defaultStudyRoutineVideos,
  defaultStudyRoutineVideoShuffle,
  extractYouTubeVideoId,
  normalizeStudyRoutinePlan,
  normalizeStudyRoutineRun,
  normalizeStudyRoutineVideoLibrary,
  normalizeStudyRoutineVideoShuffle,
  migrateLegacyStudyRoutineRun,
  normalizeStudyRoutineOvertimeSeconds,
} from "../../public/study-routine.js";
import { normalizeRatingCounts } from "../../public/rating-results.js";
import {
  createRatingSoundMetadata,
  defaultRatingSoundVolume,
  maximumRatingSoundFileBytes,
  normalizeRatingSoundContentType,
  normalizeRatingSoundFileName,
  normalizeRatingSoundKey,
  normalizeRatingSounds,
  normalizeRatingSoundVolume,
  ratingSoundFileExtension,
} from "../../public/rating-sound-settings.js";

const defaultAzureSpeechVoice = "ja-JP-NanamiNeural";
const defaultEnglishAzureSpeechVoice = "en-US-JennyNeural";
const japaneseAzureSpeechVoices = new Set([
  defaultAzureSpeechVoice,
  "ja-JP-AoiNeural",
  "ja-JP-MayuNeural",
  "ja-JP-ShioriNeural",
  "ja-JP-KeitaNeural",
  "ja-JP-DaichiNeural",
  "ja-JP-NaokiNeural",
]);
const englishAzureSpeechVoices = new Set([
  defaultEnglishAzureSpeechVoice,
  "en-US-GuyNeural",
  "en-GB-SoniaNeural",
  "en-GB-RyanNeural",
]);
const azureSpeechVoices = new Set([
  ...japaneseAzureSpeechVoices,
  ...englishAzureSpeechVoices,
]);

const defaultSpeechParts = Object.freeze({
  history: Object.freeze({
    question: true,
    answer: true,
    mnemonic: true,
    explanation: false,
  }),
  vocabulary: Object.freeze({
    word: true,
    meaning: true,
    exampleEnglish: false,
    exampleJapanese: false,
  }),
});

const defaultSetupPreferences = Object.freeze({
  schemaVersion: 1,
  lastSubjectId: "",
  subjects: Object.freeze({}),
  routinePlan: defaultStudyRoutinePlan,
  routineRun: null,
  routineVideos: defaultStudyRoutineVideos,
  routineVideoShuffle: defaultStudyRoutineVideoShuffle,
});

const setupPreferenceIdPattern = /^[A-Za-z0-9_-]{1,100}$/;
const setupStudyModes = new Set(["memorize", "listen-answer"]);
const setupQuestionStyles = new Set(["", "beginner", "reverse", "integrated"]);
const setupQuestionAmountModes = new Set(["all", "one-per-term"]);
const studySessionTaskLimit = 10_000;
const defaultStudyTimeLimitSeconds = 30;
const maximumStudyTimeLimitSeconds = 3600;

const defaultSettings = {
  againSeconds: 60,
  hardSeconds: 4 * 60 * 60,
  goodSeconds: 12 * 60 * 60,
  easySeconds: 6 * 24 * 60 * 60,
  source: "cloud",
  azureVoiceId: defaultAzureSpeechVoice,
  englishAzureVoiceId: defaultEnglishAzureSpeechVoice,
  voiceId: "",
  englishVoiceId: "",
  rate: 1,
  shuffleEnabled: false,
  autoSpeechEnabled: true,
  listeningPauseSeconds: 0,
  listeningQuestionIntervalSeconds: 0,
  studyRoutineOvertimeSeconds: defaultStudyRoutineOvertimeSeconds,
  studyTimeLimitSeconds: defaultStudyTimeLimitSeconds,
  ratingSoundVolume: defaultRatingSoundVolume,
  ratingSounds: normalizeRatingSounds(),
  speechParts: defaultSpeechParts,
  setupPreferences: defaultSetupPreferences,
};

const ratingValues = new Set(["again", "hard", "good", "easy"]);
const studyActivityIdPattern = /^[A-Za-z0-9_-]{1,100}$/;

function normalizeStudyRoundId(value) {
  const id = String(value ?? "");
  return studyActivityIdPattern.test(id) ? id : "";
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const headers = {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
  };
  if (origin && origin === env.ALLOWED_ORIGIN) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
    headers["Access-Control-Allow-Methods"] =
      "GET, PUT, PATCH, POST, DELETE, OPTIONS";
    headers["Access-Control-Max-Age"] = "86400";
  }
  return headers;
}

function audioHeaders(request, env, cacheStatus) {
  const headers = corsHeaders(request, env);
  headers["Content-Type"] = "audio/mpeg";
  headers["Cache-Control"] = "private, max-age=604800";
  headers["X-Speech-Cache"] = cacheStatus;
  return headers;
}

function ratingSoundAudioHeaders(request, env, contentType) {
  const headers = corsHeaders(request, env);
  headers["Content-Type"] = contentType;
  headers["Cache-Control"] = "private, no-store";
  return headers;
}

export function hasExpectedRatingSoundSignature(value, contentType) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  if (contentType === "audio/mpeg") {
    return (
      (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) ||
      (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
    );
  }
  if (contentType === "audio/wav") {
    return (
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WAVE"
    );
  }
  if (contentType === "audio/mp4") {
    return (
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(4, 8)) === "ftyp"
    );
  }
  return false;
}

function json(request, env, payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: corsHeaders(request, env),
  });
}

async function isAuthorized(request, env) {
  const authorization = request.headers.get("Authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  if (!supplied || !env.SYNC_TOKEN) {
    return false;
  }
  const encoder = new TextEncoder();
  const [suppliedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(supplied)),
    crypto.subtle.digest("SHA-256", encoder.encode(env.SYNC_TOKEN)),
  ]);
  const left = new Uint8Array(suppliedHash);
  const right = new Uint8Array(expectedHash);
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

function integer(value, fallback, minimum = 0, maximum = 1_000_000_000) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallback;
}

function decimal(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallback;
}

function optionalDate(value) {
  if (value == null || value === "") {
    return null;
  }
  const text = String(value);
  if (!Number.isFinite(Date.parse(text))) {
    throw new Error("日時の形式が正しくありません。");
  }
  return new Date(text).toISOString();
}

function normalizeSpeechPartGroup(value, defaults) {
  const source = value && typeof value === "object" ? value : {};
  const normalized = Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => [
      key,
      source[key] == null ? fallback : source[key] === true,
    ]),
  );
  return Object.values(normalized).some(Boolean)
    ? normalized
    : { ...defaults };
}

function normalizeSpeechParts(value) {
  let source = value;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      source = {};
    }
  }
  source = source && typeof source === "object" ? source : {};
  return {
    history: normalizeSpeechPartGroup(
      source.history,
      defaultSpeechParts.history,
    ),
    vocabulary: normalizeSpeechPartGroup(
      source.vocabulary,
      defaultSpeechParts.vocabulary,
    ),
  };
}

function normalizeSetupPreferenceId(value) {
  const id = String(value ?? "");
  return setupPreferenceIdPattern.test(id) ? id : "";
}

function normalizeSetupSelection(value) {
  return String(value ?? "").trim().slice(0, 200);
}

function normalizeSetupPreferences(value) {
  let source = value;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      source = {};
    }
  }
  source = source && typeof source === "object" && !Array.isArray(source)
    ? source
    : {};
  const sourceSubjects =
    source.subjects && typeof source.subjects === "object"
      ? source.subjects
      : {};
  const subjects = {};
  for (const [rawSubjectId, rawSubject] of Object.entries(sourceSubjects).slice(0, 50)) {
    const subjectId = normalizeSetupPreferenceId(rawSubjectId);
    if (!subjectId || !rawSubject || typeof rawSubject !== "object") continue;
    const rawDecks =
      rawSubject.decks && typeof rawSubject.decks === "object"
        ? rawSubject.decks
        : {};
    const decks = {};
    for (const [rawDeckId, rawDeck] of Object.entries(rawDecks).slice(0, 100)) {
      const deckId = normalizeSetupPreferenceId(rawDeckId);
      if (!deckId || !rawDeck || typeof rawDeck !== "object") continue;
      decks[deckId] = {
        macroRegion: normalizeSetupSelection(rawDeck.macroRegion),
        regionDetail: normalizeSetupSelection(rawDeck.regionDetail),
        category: normalizeSetupSelection(rawDeck.category),
        questionStyle: setupQuestionStyles.has(rawDeck.questionStyle)
          ? rawDeck.questionStyle
          : "",
        questionAmountMode: setupQuestionAmountModes.has(rawDeck.questionAmountMode)
          ? rawDeck.questionAmountMode
          : "all",
      };
    }
    const lastDeckId = normalizeSetupPreferenceId(rawSubject.lastDeckId);
    const selectedDeckIds = [...new Set(
      (Array.isArray(rawSubject.selectedDeckIds)
        ? rawSubject.selectedDeckIds
        : lastDeckId
          ? [lastDeckId]
          : [])
        .map(normalizeSetupPreferenceId)
        .filter(Boolean),
    )].slice(0, 100);
    subjects[subjectId] = {
      lastDeckId,
      selectedDeckIds,
      studyMode: setupStudyModes.has(rawSubject.studyMode)
        ? rawSubject.studyMode
        : "memorize",
      decks,
    };
  }
  const lastSubjectId = normalizeSetupPreferenceId(source.lastSubjectId);
  const routineVideos = normalizeStudyRoutineVideoLibrary(source.routineVideos);
  const routinePlan = normalizeStudyRoutinePlan(source.routinePlan);
  const routineRun = migrateLegacyStudyRoutineRun(
    source.routineRun,
    routinePlan,
  ).run;
  return {
    schemaVersion: 1,
    lastSubjectId: lastSubjectId in subjects ? lastSubjectId : "",
    subjects,
    routinePlan,
    routineRun,
    routineVideos,
    routineVideoShuffle: normalizeStudyRoutineVideoShuffle(
      source.routineVideoShuffle,
      routineVideos,
    ),
  };
}

function normalizeQuestionRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("学習記録の形式が正しくありません。");
  }
  const lastRating = value.lastRating == null ? null : String(value.lastRating);
  if (lastRating && !ratingValues.has(lastRating)) {
    throw new Error("評価の値が正しくありません。");
  }
  return {
    streak: integer(value.streak, 0),
    attempts: integer(value.attempts, 0),
    rememberedCount: integer(value.rememberedCount, 0),
    lastRating,
    lastAnsweredAt: optionalDate(value.lastAnsweredAt),
    nextReviewAt: optionalDate(value.nextReviewAt),
    everMastered: Boolean(value.everMastered),
  };
}

function normalizeStudyActivityTitle(value, label) {
  const title = String(value ?? "").trim().slice(0, 200);
  if (!title) {
    throw new Error(`${label}が空です。`);
  }
  return title;
}

export function normalizeStudyActivity(value, datasetVersion, eventId) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("日別学習記録の形式が正しくありません。");
  }
  const normalizedEventId = String(eventId ?? "");
  const subjectId = String(value.subjectId ?? "");
  const deckId = String(value.deckId ?? "");
  const questionId = String(value.questionId ?? "");
  if (
    !studyActivityIdPattern.test(normalizedEventId) ||
    !studyActivityIdPattern.test(subjectId) ||
    !studyActivityIdPattern.test(deckId) ||
    !studyActivityIdPattern.test(questionId)
  ) {
    throw new Error("日別学習記録の識別情報が正しくありません。");
  }
  if (!setupStudyModes.has(value.studyMode)) {
    throw new Error("日別学習記録の学習方法が正しくありません。");
  }
  return {
    eventId: normalizedEventId,
    subjectId,
    subjectTitle: normalizeStudyActivityTitle(value.subjectTitle, "科目名"),
    deckId,
    deckTitle: normalizeStudyActivityTitle(value.deckTitle, "デッキ名"),
    datasetVersion: normalizeDatasetVersion(datasetVersion),
    studyMode: value.studyMode,
    questionId,
  };
}

export function normalizeStudyTimeEntry(value, datasetVersion, eventId) {
  const activity = normalizeStudyActivity(value, datasetVersion, eventId);
  const studySeconds = integer(
    value.studySeconds,
    0,
    1,
    maximumStudyTimeLimitSeconds,
  );
  if (studySeconds === 0) {
    throw new Error("学習時間は1秒以上で指定してください。");
  }
  return {
    ...activity,
    studySeconds,
  };
}

export function studyDateAtFourJst(value) {
  const occurredAt = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(occurredAt.getTime())) {
    throw new Error("学習日時の形式が正しくありません。");
  }
  return new Date(occurredAt.getTime() + 5 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function normalizeStudySessionTask(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const termId = normalizeSetupPreferenceId(value.termId);
  const questionId = normalizeSetupPreferenceId(value.questionId);
  const stage = setupQuestionStyles.has(value.stage) && value.stage
    ? value.stage
    : "";
  return termId && questionId && stage ? { termId, questionId, stage } : null;
}

function normalizeStudySessionTasks(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.slice(0, studySessionTaskLimit).flatMap((item) => {
    const task = normalizeStudySessionTask(item);
    if (!task || seen.has(task.questionId)) return [];
    seen.add(task.questionId);
    return [task];
  });
}

function normalizeStudySessionQuestionIds(value, validQuestionIds) {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .map(normalizeSetupPreferenceId)
      .filter((questionId) => validQuestionIds.has(questionId)),
  )];
}

function normalizeStudySession(value) {
  let source = value;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      throw new Error("一周の保存内容が正しくありません。");
    }
  }
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error("一周の保存内容が正しくありません。");
  }
  const tasks = normalizeStudySessionTasks(source.tasks);
  if (tasks.length === 0) {
    throw new Error("一周の出題内容が空です。");
  }
  const validQuestionIds = new Set(tasks.map((task) => task.questionId));
  const taskByQuestionId = new Map(tasks.map((task) => [task.questionId, task]));
  const currentTask = normalizeStudySessionTask(source.currentTask);
  const studyTimeEventId = String(source.studyTimeEventId ?? "");
  return {
    schemaVersion: 1,
    roundId: normalizeStudyRoundId(source.roundId),
    studyMode: setupStudyModes.has(source.studyMode) ? source.studyMode : "memorize",
    deckIds: [...new Set(
      (Array.isArray(source.deckIds) ? source.deckIds : [])
        .map(normalizeSetupPreferenceId)
        .filter(Boolean),
    )].slice(0, 100),
    selectedStage: setupQuestionStyles.has(source.selectedStage)
      ? source.selectedStage
      : "",
    questionAmountMode: setupQuestionAmountModes.has(source.questionAmountMode)
      ? source.questionAmountMode
      : "all",
    shuffleEnabled: source.shuffleEnabled === true,
    autoSpeechEnabled: true,
    filters: {
      macroRegion: normalizeSetupSelection(source.filters?.macroRegion),
      regionDetail: normalizeSetupSelection(source.filters?.regionDetail),
      category: normalizeSetupSelection(source.filters?.category),
    },
    termIds: [...new Set(
      (Array.isArray(source.termIds) ? source.termIds : [])
        .map(normalizeSetupPreferenceId)
        .filter(Boolean),
    )].slice(0, studySessionTaskLimit),
    tasks,
    queue: normalizeStudySessionTasks(source.queue).filter((task) =>
      validQuestionIds.has(task.questionId),
    ),
    currentTask: currentTask && validQuestionIds.has(currentTask.questionId)
      ? taskByQuestionId.get(currentTask.questionId)
      : null,
    unseenQuestionIds: normalizeStudySessionQuestionIds(
      source.unseenQuestionIds,
      validQuestionIds,
    ),
    retryQuestionIds: normalizeStudySessionQuestionIds(
      source.retryQuestionIds,
      validQuestionIds,
    ),
    answeredCount: integer(source.answeredCount, 0),
    ratingCounts: normalizeRatingCounts(source.ratingCounts),
    studySeconds: integer(source.studySeconds, 0),
    screenStudySeconds: integer(
      source.screenStudySeconds,
      0,
      0,
      maximumStudyTimeLimitSeconds,
    ),
    savedScreenStudySeconds: integer(
      source.savedScreenStudySeconds,
      0,
      0,
      maximumStudyTimeLimitSeconds,
    ),
    studyTimeEventId: studyActivityIdPattern.test(studyTimeEventId)
      ? studyTimeEventId
      : "",
    answerVisible: source.answerVisible === true,
    routineOvertimeEndsAt: source.routineOvertimeEndsAt == null
      ? null
      : optionalDate(source.routineOvertimeEndsAt),
    startedAt: source.startedAt == null ? null : optionalDate(source.startedAt),
    updatedAt: source.updatedAt == null ? null : optionalDate(source.updatedAt),
  };
}

function normalizeSettings(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    againSeconds: integer(
      source.againSeconds,
      defaultSettings.againSeconds,
      1,
      365 * 24 * 60 * 60,
    ),
    hardSeconds: integer(
      source.hardSeconds,
      defaultSettings.hardSeconds,
      1,
      365 * 24 * 60 * 60,
    ),
    goodSeconds: integer(
      source.goodSeconds,
      defaultSettings.goodSeconds,
      1,
      365 * 24 * 60 * 60,
    ),
    easySeconds: integer(
      source.easySeconds,
      defaultSettings.easySeconds,
      1,
      365 * 24 * 60 * 60,
    ),
    source: source.source === "device" ? "device" : "cloud",
    azureVoiceId: normalizeAzureSpeechVoice(source.azureVoiceId),
    englishAzureVoiceId: normalizeEnglishAzureSpeechVoice(
      source.englishAzureVoiceId,
    ),
    voiceId: String(source.voiceId ?? "").slice(0, 500),
    englishVoiceId: String(source.englishVoiceId ?? "").slice(0, 500),
    rate: decimal(source.rate, 1, 0.7, 3),
    shuffleEnabled: source.shuffleEnabled === true,
    autoSpeechEnabled: true,
    listeningPauseSeconds: decimal(source.listeningPauseSeconds, 0, 0, 60),
    listeningQuestionIntervalSeconds: decimal(
      source.listeningQuestionIntervalSeconds,
      0,
      0,
      60,
    ),
    studyRoutineOvertimeSeconds: normalizeStudyRoutineOvertimeSeconds(
      source.studyRoutineOvertimeSeconds,
    ),
    studyTimeLimitSeconds: integer(
      source.studyTimeLimitSeconds,
      defaultStudyTimeLimitSeconds,
      1,
      maximumStudyTimeLimitSeconds,
    ),
    ratingSoundVolume: normalizeRatingSoundVolume(source.ratingSoundVolume),
    ratingSounds: normalizeRatingSounds(source.ratingSounds),
    speechParts: normalizeSpeechParts(source.speechParts),
    setupPreferences: normalizeSetupPreferences(source.setupPreferences),
  };
}

function normalizeDatasetVersion(value) {
  const datasetVersion = String(value ?? "");
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(datasetVersion)) {
    throw new Error("問題集の版が正しくありません。");
  }
  return datasetVersion;
}

function normalizeSpeechPrompt(value) {
  const prompt = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!prompt) {
    throw new Error("読み上げる文章が空です。");
  }
  if (prompt.length > 2000) {
    throw new Error("一度に読み上げられる文章は2000文字までです。");
  }
  return prompt;
}

const azureSpeechOutputFormat = "audio-24khz-48kbitrate-mono-mp3";

function normalizeAzureSpeechVoice(value) {
  const voice = String(value ?? "");
  return japaneseAzureSpeechVoices.has(voice) ? voice : defaultAzureSpeechVoice;
}

function normalizeEnglishAzureSpeechVoice(value) {
  const voice = String(value ?? "");
  return englishAzureSpeechVoices.has(voice)
    ? voice
    : defaultEnglishAzureSpeechVoice;
}

async function speechCacheKey(prompt, voice) {
  const input = new TextEncoder().encode(
    `azure-speech-v1\0${voice}\0${prompt}`,
  );
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  return `speech-cache/azure-speech-v1/${[...digest]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}.mp3`;
}

function escapeSsml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function generateSpeech(env, prompt, voice) {
  const region = String(env.AZURE_SPEECH_REGION ?? "").trim().toLowerCase();
  if (!env.AZURE_SPEECH_KEY || !/^[a-z0-9-]+$/.test(region)) {
    throw new Error("Azure音声の接続設定がありません。");
  }
  const requestSpeech = env.AZURE_SPEECH_FETCH ?? fetch;
  const response = await requestSpeech(
    `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/ssml+xml",
        "Ocp-Apim-Subscription-Key": env.AZURE_SPEECH_KEY,
        "X-Microsoft-OutputFormat": azureSpeechOutputFormat,
        "User-Agent": "anki-world-history",
      },
      body: `<speak version="1.0" xml:lang="${voice.slice(0, 5)}"><voice name="${voice}">${escapeSsml(prompt)}</voice></speak>`,
    },
  );
  if (!response.ok) {
    throw new Error(`Azure音声の生成に失敗しました（${response.status}）。`);
  }
  const audio = new Uint8Array(await response.arrayBuffer());
  if (audio.byteLength === 0) {
    throw new Error("Azureから空の音声が返されました。");
  }
  return audio;
}

async function handleSpeech(request, env) {
  if (!env.AZURE_SPEECH_KEY || !env.AZURE_SPEECH_REGION || !env.SPEECH_CACHE) {
    throw new Error("Azure音声の接続設定がありません。");
  }
  const body = await request.json();
  const prompt = normalizeSpeechPrompt(body.text);
  const requestedVoice = String(body.voice ?? "");
  const requestedLanguage = String(body.language ?? "ja-JP").toLowerCase();
  const voice = requestedLanguage.startsWith("en")
    ? normalizeEnglishAzureSpeechVoice(requestedVoice)
    : normalizeAzureSpeechVoice(requestedVoice);
  const key = await speechCacheKey(prompt, voice);
  const cached = await env.SPEECH_CACHE.get(key);
  if (cached) {
    return new Response(cached.body, {
      headers: audioHeaders(request, env, "HIT"),
    });
  }
  const audio = await generateSpeech(env, prompt, voice);
  await env.SPEECH_CACHE.put(key, audio, {
    httpMetadata: { contentType: "audio/mpeg" },
    customMetadata: {
      generatedBy: "azure-speech",
      voice,
    },
  });
  return new Response(audio, {
    headers: audioHeaders(request, env, "MISS"),
  });
}

async function handleRatingSoundRead(request, env, rating) {
  if (!env.SPEECH_CACHE) {
    throw new Error("Cloudflareの評価音保管先がありません。");
  }
  const current = (await readState(env, "__settings_only__")).settings;
  const metadata = normalizeRatingSounds(current.ratingSounds)[rating];
  if (!metadata) {
    return json(request, env, { error: "この評価には独自の音が登録されていません。" }, 404);
  }
  const stored = await env.SPEECH_CACHE.get(metadata.storageKey);
  if (!stored) {
    return json(request, env, { error: "登録した評価音が見つかりません。" }, 404);
  }
  return new Response(stored.body, {
    headers: ratingSoundAudioHeaders(request, env, metadata.contentType),
  });
}

async function handleRatingSoundUpload(request, env, rating, url) {
  if (!env.SPEECH_CACHE) {
    throw new Error("Cloudflareの評価音保管先がありません。");
  }
  const contentLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(contentLength) && contentLength > maximumRatingSoundFileBytes) {
    return json(request, env, { error: "評価音は1ファイル2MBまでです。" }, 413);
  }
  const fileName = normalizeRatingSoundFileName(
    url.searchParams.get("name"),
    request.headers.get("Content-Type"),
  );
  const contentType = normalizeRatingSoundContentType(
    request.headers.get("Content-Type"),
    fileName,
  );
  const extension = ratingSoundFileExtension(contentType);
  if (!extension) {
    return json(request, env, { error: "MP3・WAV・M4Aの音声を選んでください。" }, 415);
  }
  const audio = new Uint8Array(await request.arrayBuffer());
  if (audio.byteLength === 0 || audio.byteLength > maximumRatingSoundFileBytes) {
    return json(request, env, { error: "評価音は1バイト以上2MB以下にしてください。" }, 413);
  }
  if (!hasExpectedRatingSoundSignature(audio, contentType)) {
    return json(request, env, { error: "選んだファイルは正しい音声形式ではありません。" }, 400);
  }

  const current = (await readState(env, "__settings_only__")).settings;
  const currentSounds = normalizeRatingSounds(current.ratingSounds);
  const previous = currentSounds[rating];
  const updatedAt = new Date().toISOString();
  const storageKey = `rating-sounds/${rating}/${crypto.randomUUID()}.${extension}`;
  const metadata = createRatingSoundMetadata({
    rating,
    storageKey,
    fileName,
    contentType,
    size: audio.byteLength,
    updatedAt,
  });
  await env.SPEECH_CACHE.put(storageKey, audio, {
    httpMetadata: { contentType },
    customMetadata: {
      kind: "rating-sound",
      rating,
      fileName: metadata.fileName,
    },
  });

  let settings;
  try {
    settings = await saveSettings(env, {
      ratingSounds: { ...currentSounds, [rating]: metadata },
    });
  } catch (error) {
    await env.SPEECH_CACHE.delete(storageKey).catch(() => {});
    throw error;
  }
  if (previous?.storageKey && previous.storageKey !== storageKey) {
    await env.SPEECH_CACHE.delete(previous.storageKey).catch(() => {});
  }
  return json(request, env, {
    ok: true,
    sound: settings.ratingSounds[rating],
    settings,
  });
}

async function handleRatingSoundDelete(request, env, rating) {
  if (!env.SPEECH_CACHE) {
    throw new Error("Cloudflareの評価音保管先がありません。");
  }
  const current = (await readState(env, "__settings_only__")).settings;
  const currentSounds = normalizeRatingSounds(current.ratingSounds);
  const previous = currentSounds[rating];
  const settings = await saveSettings(env, {
    ratingSounds: { ...currentSounds, [rating]: null },
  });
  if (previous?.storageKey) {
    await env.SPEECH_CACHE.delete(previous.storageKey).catch(() => {});
  }
  return json(request, env, { ok: true, settings });
}

async function fetchYouTubeVideoMetadata(value, env) {
  const youtubeId = extractYouTubeVideoId(value);
  if (!youtubeId) {
    throw new Error("YouTube動画のURLを正しく入力してください。");
  }
  const metadataFetch = env.YOUTUBE_METADATA_FETCH ?? fetch;
  const watchUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
  const response = await metadataFetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`,
    { headers: { Accept: "application/json" } },
  );
  if (!response.ok) {
    throw new Error("動画の題名をYouTubeから取得できませんでした。");
  }
  const metadata = await response.json();
  const [video] = normalizeStudyRoutineVideoLibrary(
    [{
      youtubeId,
      title: metadata.title,
      authorName: metadata.author_name,
    }],
    { fallbackToDefault: false },
  );
  if (!video) {
    throw new Error("YouTubeから取得した動画情報の形式が正しくありません。");
  }
  return video;
}

function progressStatement(env, datasetVersion, questionId, record, updatedAt) {
  return env.DB.prepare(
    `INSERT INTO question_progress (
      dataset_version, question_id, streak, attempts, remembered_count, last_rating,
      last_answered_at, next_review_at, ever_mastered, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(dataset_version, question_id) DO UPDATE SET
      streak = excluded.streak,
      attempts = excluded.attempts,
      remembered_count = excluded.remembered_count,
      last_rating = excluded.last_rating,
      last_answered_at = excluded.last_answered_at,
      next_review_at = excluded.next_review_at,
      ever_mastered = excluded.ever_mastered,
      updated_at = excluded.updated_at`,
  ).bind(
    datasetVersion,
    questionId,
    record.streak,
    record.attempts,
    record.rememberedCount,
    record.lastRating,
    record.lastAnsweredAt,
    record.nextReviewAt,
    record.everMastered ? 1 : 0,
    updatedAt,
  );
}

function studySessionStatement(env, datasetVersion, session, updatedAt) {
  return env.DB.prepare(
    `INSERT INTO study_sessions (dataset_version, session_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(dataset_version) DO UPDATE SET
       session_json = excluded.session_json,
       updated_at = excluded.updated_at`,
  ).bind(
    datasetVersion,
    JSON.stringify({ ...session, updatedAt }),
    updatedAt,
  );
}

function deleteStudySessionStatements(env, datasetVersion) {
  return [
    env.DB.prepare("DELETE FROM study_sessions WHERE dataset_version = ?")
      .bind(datasetVersion),
    env.DB.prepare(
      "DELETE FROM study_sessions_by_mode WHERE dataset_version = ?",
    ).bind(datasetVersion),
  ];
}

function studyActivityStatement(env, activity, occurredAt) {
  return env.DB.prepare(
    `INSERT INTO study_activity_events (
      event_id, occurred_at, study_date, subject_id, subject_title,
      deck_id, deck_title, dataset_version, study_mode, question_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(event_id) DO NOTHING`,
  ).bind(
    activity.eventId,
    occurredAt,
    studyDateAtFourJst(occurredAt),
    activity.subjectId,
    activity.subjectTitle,
    activity.deckId,
    activity.deckTitle,
    activity.datasetVersion,
    activity.studyMode,
    activity.questionId,
  );
}

function studyRoundCompletionStatement(
  env,
  datasetVersion,
  roundId,
  completedAt,
) {
  return env.DB.prepare(
    `INSERT INTO study_round_events (dataset_version, round_id, completed_at)
     VALUES (?, ?, ?)
     ON CONFLICT(dataset_version, round_id) DO NOTHING`,
  ).bind(datasetVersion, roundId, completedAt);
}

function deleteStudyRoundStatement(env, datasetVersion, roundId) {
  return env.DB.prepare(
    "DELETE FROM study_round_events WHERE dataset_version = ? AND round_id = ?",
  ).bind(datasetVersion, roundId);
}

async function readRoundProgress(env, datasetVersion) {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS completed_count
     FROM study_round_events
     WHERE dataset_version = ?`,
  ).bind(datasetVersion).first();
  return { completedCount: Number(row?.completed_count) || 0 };
}

function studyTimeStatement(env, timeEntry, occurredAt) {
  return env.DB.prepare(
    `INSERT INTO study_time_events (
      event_id, occurred_at, study_date, subject_id, subject_title,
      deck_id, deck_title, dataset_version, study_mode, question_id,
      study_seconds
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(event_id) DO UPDATE SET
      study_seconds = MAX(study_time_events.study_seconds, excluded.study_seconds)`,
  ).bind(
    timeEntry.eventId,
    occurredAt,
    studyDateAtFourJst(occurredAt),
    timeEntry.subjectId,
    timeEntry.subjectTitle,
    timeEntry.deckId,
    timeEntry.deckTitle,
    timeEntry.datasetVersion,
    timeEntry.studyMode,
    timeEntry.questionId,
    timeEntry.studySeconds,
  );
}

function studyRoutineRunStatement(env, routineRun, updatedAt) {
  return env.DB.prepare(
    `UPDATE review_settings
     SET setup_preferences_json = json_set(
       CASE
         WHEN json_valid(setup_preferences_json) THEN setup_preferences_json
         ELSE '{}'
       END,
       '$.routineRun',
       json(?)
     ), updated_at = ?
     WHERE profile_id = 1`,
  ).bind(JSON.stringify(routineRun), updatedAt);
}

async function readStudyHistory(env) {
  const rows = await env.DB.prepare(
    `WITH answered AS (
       SELECT study_date, subject_id, subject_title, deck_id, deck_title,
         study_mode, COUNT(*) AS answered_count,
         MIN(occurred_at) AS first_occurred_at,
         MAX(occurred_at) AS last_occurred_at
       FROM study_activity_events
       GROUP BY study_date, subject_id, subject_title, deck_id, deck_title, study_mode
     ), timed AS (
       SELECT study_date, subject_id, subject_title, deck_id, deck_title,
         study_mode, SUM(study_seconds) AS study_seconds,
         MIN(occurred_at) AS first_occurred_at,
         MAX(occurred_at) AS last_occurred_at
       FROM study_time_events
       GROUP BY study_date, subject_id, subject_title, deck_id, deck_title, study_mode
     ), history_keys AS (
       SELECT study_date, subject_id, subject_title, deck_id, deck_title, study_mode
       FROM answered
       UNION
       SELECT study_date, subject_id, subject_title, deck_id, deck_title, study_mode
       FROM timed
     )
     SELECT history_keys.study_date, history_keys.subject_id,
       history_keys.subject_title, history_keys.deck_id, history_keys.deck_title,
       history_keys.study_mode,
       COALESCE(answered.answered_count, 0) AS answered_count,
       COALESCE(timed.study_seconds, 0) AS study_seconds,
       COALESCE(answered.first_occurred_at, timed.first_occurred_at) AS first_occurred_at,
       COALESCE(answered.last_occurred_at, timed.last_occurred_at) AS last_occurred_at
     FROM history_keys
     LEFT JOIN answered USING (
       study_date, subject_id, subject_title, deck_id, deck_title, study_mode
     )
     LEFT JOIN timed USING (
       study_date, subject_id, subject_title, deck_id, deck_title, study_mode
     )
     ORDER BY history_keys.study_date DESC, history_keys.subject_title,
       history_keys.deck_title, history_keys.study_mode`,
  ).all();
  return (rows.results ?? []).map((row) => ({
    studyDate: row.study_date,
    subjectId: row.subject_id,
    subjectTitle: row.subject_title,
    deckId: row.deck_id,
    deckTitle: row.deck_title,
    studyMode: row.study_mode,
    answeredCount: Number(row.answered_count) || 0,
    studySeconds: Number(row.study_seconds) || 0,
    firstOccurredAt: row.first_occurred_at,
    lastOccurredAt: row.last_occurred_at,
  }));
}

async function readState(env, datasetVersion) {
  const [
    progressRows,
    settingsRow,
    sharedSessionRow,
    legacySessionRows,
    roundProgress,
  ] = await Promise.all([
      env.DB.prepare(
        `SELECT question_id, streak, attempts, remembered_count, last_rating,
          last_answered_at, next_review_at, ever_mastered, updated_at
         FROM question_progress WHERE dataset_version = ?`,
      ).bind(datasetVersion).all(),
      env.DB.prepare(
        `SELECT again_seconds, hard_seconds, good_seconds, easy_seconds,
          speech_source, azure_voice_id, english_azure_voice_id,
          device_voice_id, english_device_voice_id, speech_rate,
          shuffle_enabled, auto_speech_enabled, listening_pause_seconds,
          listening_question_interval_seconds,
          study_routine_overtime_seconds,
          study_time_limit_seconds,
          rating_sound_volume, rating_sounds_json,
          speech_parts_json, setup_preferences_json, updated_at
         FROM review_settings WHERE profile_id = 1`,
      ).first(),
      env.DB.prepare(
        `SELECT session_json, updated_at
         FROM study_sessions WHERE dataset_version = ?`,
      ).bind(datasetVersion).first(),
      env.DB.prepare(
        `SELECT study_mode, session_json, updated_at
         FROM study_sessions_by_mode WHERE dataset_version = ?`,
      ).bind(datasetVersion).all(),
      readRoundProgress(env, datasetVersion),
    ]);
  let newestUpdate = null;
  const questions = Object.fromEntries(
    (progressRows.results ?? []).map((row) => {
      if (!newestUpdate || row.updated_at > newestUpdate) {
        newestUpdate = row.updated_at;
      }
      return [
        row.question_id,
        {
          streak: row.streak,
          attempts: row.attempts,
          rememberedCount: row.remembered_count,
          lastRating: row.last_rating,
          lastAnsweredAt: row.last_answered_at,
          nextReviewAt: row.next_review_at,
          everMastered: Boolean(row.ever_mastered),
        },
      ];
    }),
  );
  const sessionRows = [
    ...(sharedSessionRow ? [sharedSessionRow] : []),
    ...(legacySessionRows.results ?? []),
  ];
  let newestSession = null;
  for (const row of sessionRows) {
    const session = normalizeStudySession({
      ...JSON.parse(row.session_json),
      updatedAt: row.updated_at,
    });
    if (!newestSession || row.updated_at > newestSession.updatedAt) {
      newestSession = session;
    }
  }
  const sessions = {
    memorize: newestSession,
    "listen-answer": newestSession,
  };
  return {
    progress: { questions, updatedAt: newestUpdate },
    roundProgress,
    settings: settingsRow
      ? {
          againSeconds: settingsRow.again_seconds,
          hardSeconds: settingsRow.hard_seconds,
          goodSeconds: settingsRow.good_seconds,
          easySeconds: settingsRow.easy_seconds,
          source: settingsRow.speech_source,
          azureVoiceId: settingsRow.azure_voice_id,
          englishAzureVoiceId: settingsRow.english_azure_voice_id,
          voiceId: settingsRow.device_voice_id,
          englishVoiceId: settingsRow.english_device_voice_id,
          rate: settingsRow.speech_rate,
          shuffleEnabled: Boolean(settingsRow.shuffle_enabled),
          autoSpeechEnabled: true,
          listeningPauseSeconds: settingsRow.listening_pause_seconds,
          listeningQuestionIntervalSeconds:
            settingsRow.listening_question_interval_seconds,
          studyRoutineOvertimeSeconds:
            settingsRow.study_routine_overtime_seconds,
          studyTimeLimitSeconds: settingsRow.study_time_limit_seconds,
          ratingSoundVolume: settingsRow.rating_sound_volume,
          ratingSounds: normalizeRatingSounds(settingsRow.rating_sounds_json),
          speechParts: normalizeSpeechParts(settingsRow.speech_parts_json),
          setupPreferences: normalizeSetupPreferences(
            settingsRow.setup_preferences_json,
          ),
          updatedAt: settingsRow.updated_at,
        }
      : defaultSettings,
    sessions,
    session: newestSession,
  };
}

async function saveSettings(env, patch) {
  const current = (await readState(env, "__settings_only__")).settings;
  const settings = normalizeSettings({ ...current, ...patch });
  const updatedAt = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO review_settings (
      profile_id, again_seconds, hard_seconds, good_seconds, easy_seconds,
      speech_source, azure_voice_id, english_azure_voice_id,
      device_voice_id, english_device_voice_id, speech_rate,
      shuffle_enabled, auto_speech_enabled, listening_pause_seconds,
      listening_question_interval_seconds,
      study_routine_overtime_seconds,
      study_time_limit_seconds,
      rating_sound_volume, rating_sounds_json,
      speech_parts_json, setup_preferences_json, updated_at
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(profile_id) DO UPDATE SET
      again_seconds = excluded.again_seconds,
      hard_seconds = excluded.hard_seconds,
      good_seconds = excluded.good_seconds,
      easy_seconds = excluded.easy_seconds,
      speech_source = excluded.speech_source,
      azure_voice_id = excluded.azure_voice_id,
      english_azure_voice_id = excluded.english_azure_voice_id,
      device_voice_id = excluded.device_voice_id,
      english_device_voice_id = excluded.english_device_voice_id,
      speech_rate = excluded.speech_rate,
      shuffle_enabled = excluded.shuffle_enabled,
      auto_speech_enabled = excluded.auto_speech_enabled,
      listening_pause_seconds = excluded.listening_pause_seconds,
      listening_question_interval_seconds = excluded.listening_question_interval_seconds,
      study_routine_overtime_seconds = excluded.study_routine_overtime_seconds,
      study_time_limit_seconds = excluded.study_time_limit_seconds,
      rating_sound_volume = excluded.rating_sound_volume,
      rating_sounds_json = excluded.rating_sounds_json,
      speech_parts_json = excluded.speech_parts_json,
      setup_preferences_json = excluded.setup_preferences_json,
      updated_at = excluded.updated_at`,
  )
    .bind(
      settings.againSeconds,
      settings.hardSeconds,
      settings.goodSeconds,
      settings.easySeconds,
      settings.source,
      settings.azureVoiceId,
      settings.englishAzureVoiceId,
      settings.voiceId,
      settings.englishVoiceId,
      settings.rate,
      settings.shuffleEnabled ? 1 : 0,
      settings.autoSpeechEnabled ? 1 : 0,
      settings.listeningPauseSeconds,
      settings.listeningQuestionIntervalSeconds,
      settings.studyRoutineOvertimeSeconds,
      settings.studyTimeLimitSeconds,
      settings.ratingSoundVolume,
      JSON.stringify(settings.ratingSounds),
      JSON.stringify(settings.speechParts),
      JSON.stringify(settings.setupPreferences),
      updatedAt,
    )
    .run();
  return { ...settings, updatedAt };
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") {
    return request.headers.get("Origin") === env.ALLOWED_ORIGIN
      ? new Response(null, { status: 204, headers: corsHeaders(request, env) })
      : json(request, env, { error: "許可されていない接続元です。" }, 403);
  }
  if (url.pathname === "/health" && request.method === "GET") {
    return json(request, env, { ok: true });
  }
  if (!(await isAuthorized(request, env))) {
    return json(request, env, { error: "認証に失敗しました。" }, 401);
  }

  if (url.pathname === "/v1/speech" && request.method === "POST") {
    return handleSpeech(request, env);
  }

  const ratingSoundMatch = url.pathname.match(
    /^\/v1\/rating-sounds\/(again|hard|good|easy)$/,
  );
  if (ratingSoundMatch) {
    const rating = normalizeRatingSoundKey(ratingSoundMatch[1]);
    if (request.method === "GET") {
      return handleRatingSoundRead(request, env, rating);
    }
    if (request.method === "PUT") {
      return handleRatingSoundUpload(request, env, rating, url);
    }
    if (request.method === "DELETE") {
      return handleRatingSoundDelete(request, env, rating);
    }
  }

  if (url.pathname === "/v1/state" && request.method === "GET") {
    const datasetVersion = url.searchParams.get("dataset");
    const state = datasetVersion
      ? await readState(env, normalizeDatasetVersion(datasetVersion))
      : {
          progress: { questions: {}, updatedAt: null },
          settings: (await readState(env, "__settings_only__")).settings,
          sessions: { memorize: null, "listen-answer": null },
          session: null,
          roundProgress: { completedCount: 0 },
        };
    return json(
      request,
      env,
      { ...state, studyDate: studyDateAtFourJst(new Date()) },
    );
  }

  if (url.pathname === "/v1/study-routine" && request.method === "PATCH") {
    const patch = await request.json();
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      return json(request, env, { error: "毎日のメニューの形式が正しくありません。" }, 400);
    }
    const current = (await readState(env, "__settings_only__")).settings;
    const currentPreferences = normalizeSetupPreferences(current.setupPreferences);
    const setupPreferences = normalizeSetupPreferences({
      ...currentPreferences,
      ...(Object.hasOwn(patch, "routinePlan")
        ? { routinePlan: normalizeStudyRoutinePlan(patch.routinePlan) }
        : {}),
      ...(Object.hasOwn(patch, "routineRun")
        ? { routineRun: normalizeStudyRoutineRun(patch.routineRun) }
        : {}),
      ...(Object.hasOwn(patch, "routineVideos")
        ? {
            routineVideos: normalizeStudyRoutineVideoLibrary(
              patch.routineVideos,
              { fallbackToDefault: false },
            ),
          }
        : {}),
      ...(Object.hasOwn(patch, "routineVideoShuffle")
        ? { routineVideoShuffle: patch.routineVideoShuffle }
        : {}),
    });
    const settings = await saveSettings(env, { setupPreferences });
    return json(request, env, {
      ok: true,
      setupPreferences: settings.setupPreferences,
      studyDate: studyDateAtFourJst(settings.updatedAt),
    });
  }

  if (url.pathname === "/v1/study-routine/videos" && request.method === "POST") {
    const body = await request.json();
    const video = await fetchYouTubeVideoMetadata(body?.url, env);
    const current = (await readState(env, "__settings_only__")).settings;
    const currentPreferences = normalizeSetupPreferences(current.setupPreferences);
    const existingIndex = currentPreferences.routineVideos.findIndex(
      (candidate) => candidate.youtubeId === video.youtubeId,
    );
    const routineVideos = [...currentPreferences.routineVideos];
    if (existingIndex >= 0) {
      routineVideos[existingIndex] = video;
    } else {
      routineVideos.push(video);
    }
    const setupPreferences = normalizeSetupPreferences({
      ...currentPreferences,
      routineVideos,
    });
    const settings = await saveSettings(env, { setupPreferences });
    return json(request, env, {
      ok: true,
      video,
      setupPreferences: settings.setupPreferences,
    });
  }

  const routineVideoDeleteMatch = url.pathname.match(
    /^\/v1\/study-routine\/videos\/([A-Za-z0-9_-]{11})$/,
  );
  if (routineVideoDeleteMatch && request.method === "DELETE") {
    const youtubeId = routineVideoDeleteMatch[1];
    const current = (await readState(env, "__settings_only__")).settings;
    const currentPreferences = normalizeSetupPreferences(current.setupPreferences);
    const routineVideos = currentPreferences.routineVideos.filter(
      (video) => video.youtubeId !== youtubeId,
    );
    const setupPreferences = normalizeSetupPreferences({
      ...currentPreferences,
      routineVideos,
      routineVideoShuffle: normalizeStudyRoutineVideoShuffle(
        currentPreferences.routineVideoShuffle,
        routineVideos,
      ),
    });
    const settings = await saveSettings(env, { setupPreferences });
    return json(request, env, {
      ok: true,
      setupPreferences: settings.setupPreferences,
    });
  }

  if (url.pathname === "/v1/study-history" && request.method === "GET") {
    return json(request, env, {
      cutoffHour: 4,
      timeZone: "Asia/Tokyo",
      history: await readStudyHistory(env),
    });
  }

  if (url.pathname === "/v1/study-session") {
    const datasetVersion = normalizeDatasetVersion(url.searchParams.get("dataset"));
    if (request.method === "PUT") {
      const session = normalizeStudySession(await request.json());
      const updatedAt = new Date().toISOString();
      await studySessionStatement(env, datasetVersion, session, updatedAt).run();
      return json(request, env, {
        ok: true,
        session: { ...session, updatedAt },
      });
    }
    if (request.method === "DELETE") {
      const studyMode = url.searchParams.get("mode");
      if (studyMode != null && !setupStudyModes.has(studyMode)) {
        return json(request, env, { error: "学習モードが正しくありません。" }, 400);
      }
      await env.DB.batch(deleteStudySessionStatements(env, datasetVersion));
      return json(request, env, { ok: true });
    }
  }

  const studyTimeMatch = url.pathname.match(/^\/v1\/study-time\/([^/]+)$/);
  if (studyTimeMatch && request.method === "PUT") {
    const eventId = decodeURIComponent(studyTimeMatch[1]);
    const datasetVersion = normalizeDatasetVersion(url.searchParams.get("dataset"));
    const body = await request.json();
    const timeEntry = normalizeStudyTimeEntry(
      body.timeEntry,
      datasetVersion,
      eventId,
    );
    const settings = (await readState(env, "__settings_only__")).settings;
    if (timeEntry.studySeconds > settings.studyTimeLimitSeconds) {
      return json(
        request,
        env,
        { error: "学習時間が設定した上限を超えています。" },
        400,
      );
    }
    const session = normalizeStudySession(body.session);
    const sessionDatasetVersion = normalizeDatasetVersion(
      body.sessionDatasetVersion ?? datasetVersion,
    );
    if (session.studyMode !== timeEntry.studyMode) {
      return json(request, env, { error: "学習時間と一周の学習方法が一致しません。" }, 400);
    }
    if (session.currentTask?.questionId !== timeEntry.questionId) {
      return json(request, env, { error: "学習時間と現在の問題が一致しません。" }, 400);
    }
    if (session.studyTimeEventId !== eventId) {
      return json(request, env, { error: "学習時間の識別情報が一致しません。" }, 400);
    }
    if (
      session.screenStudySeconds !== timeEntry.studySeconds ||
      session.savedScreenStudySeconds !== timeEntry.studySeconds ||
      session.studySeconds < timeEntry.studySeconds
    ) {
      return json(request, env, { error: "学習時間と一周の秒数が一致しません。" }, 400);
    }
    const updatedAt = new Date().toISOString();
    await env.DB.batch([
      studyTimeStatement(env, timeEntry, updatedAt),
      studySessionStatement(env, sessionDatasetVersion, session, updatedAt),
    ]);
    return json(request, env, {
      ok: true,
      updatedAt,
      studyDate: studyDateAtFourJst(updatedAt),
      session: { ...session, updatedAt },
    });
  }

  const studyActivityUndoMatch = url.pathname.match(
    /^\/v1\/study-activity\/([^/]+)\/undo$/,
  );
  if (studyActivityUndoMatch && request.method === "PUT") {
    const eventId = decodeURIComponent(studyActivityUndoMatch[1]);
    const datasetVersion = normalizeDatasetVersion(url.searchParams.get("dataset"));
    if (!studyActivityIdPattern.test(eventId)) {
      return json(request, env, { error: "取り消す日別学習記録が正しくありません。" }, 400);
    }
    const body = await request.json();
    const session = normalizeStudySession(body.session);
    const sessionDatasetVersion = normalizeDatasetVersion(
      body.sessionDatasetVersion ?? datasetVersion,
    );
    const deleteRoundId = normalizeStudyRoundId(
      body.deleteRoundId ?? eventId,
    );
    const routineRun = body.routineRun === undefined
      ? undefined
      : normalizeStudyRoutineRun(body.routineRun);
    if (body.routineRun !== undefined && !routineRun) {
      return json(request, env, { error: "毎日のメニューの進み方が正しくありません。" }, 400);
    }
    if (session.studyMode !== "listen-answer") {
      return json(request, env, { error: "聞き流しの一周ではありません。" }, 400);
    }
    const updatedAt = new Date().toISOString();
    const statements = [
      env.DB.prepare(
        `DELETE FROM study_activity_events
         WHERE event_id = ? AND dataset_version = ? AND study_mode = 'listen-answer'`,
      ).bind(eventId, datasetVersion),
      studySessionStatement(env, sessionDatasetVersion, session, updatedAt),
    ];
    if (deleteRoundId) {
      statements.push(
        deleteStudyRoundStatement(env, sessionDatasetVersion, deleteRoundId),
      );
    }
    if (routineRun) {
      statements.push(studyRoutineRunStatement(env, routineRun, updatedAt));
    }
    await env.DB.batch(statements);
    return json(request, env, {
      ok: true,
      updatedAt,
      session: { ...session, updatedAt },
      roundProgress: await readRoundProgress(env, sessionDatasetVersion),
    });
  }

  const studyActivityMatch = url.pathname.match(/^\/v1\/study-activity\/([^/]+)$/);
  if (studyActivityMatch && request.method === "PUT") {
    const eventId = decodeURIComponent(studyActivityMatch[1]);
    const datasetVersion = normalizeDatasetVersion(url.searchParams.get("dataset"));
    const body = await request.json();
    const activity = normalizeStudyActivity(body.activity, datasetVersion, eventId);
    const session = body.session == null ? null : normalizeStudySession(body.session);
    const sessionDatasetVersion = normalizeDatasetVersion(
      body.sessionDatasetVersion ?? datasetVersion,
    );
    const completeSession = body.completeSession === true;
    const completeRoundId = completeSession
      ? normalizeStudyRoundId(body.completeRoundId) ||
        session?.roundId ||
        activity.eventId
      : "";
    const routineRun = body.routineRun === undefined
      ? undefined
      : normalizeStudyRoutineRun(body.routineRun);
    if (body.routineRun !== undefined && !routineRun) {
      return json(request, env, { error: "毎日のメニューの進み方が正しくありません。" }, 400);
    }
    if (completeSession && activity.studyMode !== "listen-answer") {
      return json(request, env, { error: "聞き流し以外の一周は完了できません。" }, 400);
    }
    const occurredAt = new Date().toISOString();
    const statements = [studyActivityStatement(env, activity, occurredAt)];
    if (routineRun) {
      statements.push(studyRoutineRunStatement(env, routineRun, occurredAt));
    }
    if (completeSession) {
      statements.push(
        studyRoundCompletionStatement(
          env,
          sessionDatasetVersion,
          completeRoundId,
          occurredAt,
        ),
        ...deleteStudySessionStatements(env, sessionDatasetVersion),
      );
    } else if (session) {
      statements.push(
        studySessionStatement(env, sessionDatasetVersion, session, occurredAt),
      );
    }
    await env.DB.batch(statements);
    return json(request, env, {
      ok: true,
      occurredAt,
      studyDate: studyDateAtFourJst(occurredAt),
      session: !completeSession && session
        ? { ...session, updatedAt: occurredAt }
        : null,
      roundProgress: await readRoundProgress(env, sessionDatasetVersion),
    });
  }

  const studyAnswerMatch = url.pathname.match(/^\/v1\/study-answer\/([^/]+)$/);
  if (studyAnswerMatch && request.method === "PUT") {
    const questionId = decodeURIComponent(studyAnswerMatch[1]);
    const datasetVersion = normalizeDatasetVersion(url.searchParams.get("dataset"));
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(questionId)) {
      return json(request, env, { error: "問題番号が正しくありません。" }, 400);
    }
    const body = await request.json();
    const record = body.record == null ? null : normalizeQuestionRecord(body.record);
    const session = body.session == null ? null : normalizeStudySession(body.session);
    const sessionDatasetVersion = normalizeDatasetVersion(
      body.sessionDatasetVersion ?? datasetVersion,
    );
    const activity = body.activity == null
      ? null
      : normalizeStudyActivity(
          body.activity,
          datasetVersion,
          body.activity.eventId,
        );
    const deleteActivityId = body.deleteActivityId == null
      ? null
      : String(body.deleteActivityId);
    const completeRoundId = normalizeStudyRoundId(body.completeRoundId) ||
      (!session && activity ? activity.eventId : "");
    const deleteRoundId = normalizeStudyRoundId(
      body.deleteRoundId ?? deleteActivityId,
    );
    const studyMode = body.studyMode ?? session?.studyMode ?? activity?.studyMode ?? "memorize";
    const routineRun = body.routineRun === undefined
      ? undefined
      : normalizeStudyRoutineRun(body.routineRun);
    if (body.routineRun !== undefined && !routineRun) {
      return json(request, env, { error: "毎日のメニューの進み方が正しくありません。" }, 400);
    }
    if (!setupStudyModes.has(studyMode)) {
      return json(request, env, { error: "学習モードが正しくありません。" }, 400);
    }
    if (session && session.studyMode !== studyMode) {
      return json(request, env, { error: "一周の学習モードが一致しません。" }, 400);
    }
    if (activity && activity.studyMode !== studyMode) {
      return json(request, env, { error: "日別学習記録の学習モードが一致しません。" }, 400);
    }
    if (deleteActivityId && !studyActivityIdPattern.test(deleteActivityId)) {
      return json(request, env, { error: "取り消す日別学習記録が正しくありません。" }, 400);
    }
    if (activity && activity.questionId !== questionId) {
      return json(request, env, { error: "問題と日別学習記録が一致しません。" }, 400);
    }
    if (activity && deleteActivityId) {
      return json(request, env, { error: "日別学習記録の追加と取消は同時に行えません。" }, 400);
    }
    if (completeRoundId && deleteRoundId) {
      return json(request, env, { error: "周回完了の追加と取消は同時に行えません。" }, 400);
    }
    const updatedAt = new Date().toISOString();
    const statements = [
      record
        ? progressStatement(env, datasetVersion, questionId, record, updatedAt)
        : env.DB.prepare(
            "DELETE FROM question_progress WHERE dataset_version = ? AND question_id = ?",
          ).bind(datasetVersion, questionId),
    ];
    if (session) {
      statements.push(
        studySessionStatement(env, sessionDatasetVersion, session, updatedAt),
      );
    } else {
      statements.push(
        ...deleteStudySessionStatements(env, sessionDatasetVersion),
      );
    }
    if (activity) {
      statements.push(studyActivityStatement(env, activity, updatedAt));
    }
    if (deleteActivityId) {
      statements.push(
        env.DB.prepare("DELETE FROM study_activity_events WHERE event_id = ?").bind(
          deleteActivityId,
        ),
      );
    }
    if (completeRoundId) {
      statements.push(
        studyRoundCompletionStatement(
          env,
          sessionDatasetVersion,
          completeRoundId,
          updatedAt,
        ),
      );
    }
    if (deleteRoundId) {
      statements.push(
        deleteStudyRoundStatement(env, sessionDatasetVersion, deleteRoundId),
      );
    }
    if (routineRun) {
      statements.push(studyRoutineRunStatement(env, routineRun, updatedAt));
    }
    await env.DB.batch(statements);
    return json(request, env, {
      ok: true,
      updatedAt,
      session: session ? { ...session, updatedAt } : null,
      roundProgress: await readRoundProgress(env, sessionDatasetVersion),
    });
  }

  const questionMatch = url.pathname.match(/^\/v1\/progress\/([^/]+)$/);
  if (questionMatch) {
    const questionId = decodeURIComponent(questionMatch[1]);
    const datasetVersion = normalizeDatasetVersion(url.searchParams.get("dataset"));
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(questionId)) {
      return json(request, env, { error: "問題番号が正しくありません。" }, 400);
    }
    if (request.method === "PUT") {
      const record = normalizeQuestionRecord(await request.json());
      const updatedAt = new Date().toISOString();
      await progressStatement(env, datasetVersion, questionId, record, updatedAt).run();
      return json(request, env, { ok: true, updatedAt });
    }
    if (request.method === "DELETE") {
      await env.DB.prepare(
        "DELETE FROM question_progress WHERE dataset_version = ? AND question_id = ?",
      )
        .bind(datasetVersion, questionId)
        .run();
      return json(request, env, { ok: true });
    }
  }

  if (url.pathname === "/v1/progress/import" && request.method === "POST") {
    const body = await request.json();
    const datasetVersion = normalizeDatasetVersion(body.datasetVersion);
    const entries = Object.entries(body.questions ?? {});
    if (entries.length === 0 || entries.length > 40) {
      return json(request, env, { error: "一度に取り込める記録は1〜40問です。" }, 400);
    }
    const updatedAt = new Date().toISOString();
    await env.DB.batch(
      entries.map(([questionId, value]) => {
        if (!/^[A-Za-z0-9_-]{1,100}$/.test(questionId)) {
          throw new Error("問題番号が正しくありません。");
        }
        return progressStatement(
          env,
          datasetVersion,
          questionId,
          normalizeQuestionRecord(value),
          updatedAt,
        );
      }),
    );
    return json(request, env, { ok: true, imported: entries.length, updatedAt });
  }

  if (url.pathname === "/v1/progress" && request.method === "DELETE") {
    const datasetVersion = normalizeDatasetVersion(url.searchParams.get("dataset"));
    await env.DB.batch([
      env.DB.prepare("DELETE FROM question_progress WHERE dataset_version = ?").bind(
        datasetVersion,
      ),
      env.DB.prepare("DELETE FROM study_sessions WHERE dataset_version = ?").bind(
        datasetVersion,
      ),
      env.DB.prepare(
        "DELETE FROM study_sessions_by_mode WHERE dataset_version = ?",
      ).bind(datasetVersion),
      env.DB.prepare(
        "DELETE FROM study_round_events WHERE dataset_version = ?",
      ).bind(datasetVersion),
    ]);
    return json(request, env, { ok: true });
  }

  if (
    url.pathname === "/v1/settings" &&
    ["PATCH", "PUT"].includes(request.method)
  ) {
    const patch = await request.json();
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      return json(request, env, { error: "設定の形式が正しくありません。" }, 400);
    }
    const settings = await saveSettings(env, patch);
    return json(request, env, { ok: true, settings });
  }

  return json(request, env, { error: "該当する処理がありません。" }, 404);
}

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      return json(request, env, { error: error.message || "処理に失敗しました。" }, 400);
    }
  },
};

export {
  escapeSsml,
  normalizeAzureSpeechVoice,
  normalizeEnglishAzureSpeechVoice,
  normalizeDatasetVersion,
  normalizeQuestionRecord,
  normalizeStudySession,
  normalizeSettings,
  normalizeSetupPreferences,
  normalizeSpeechParts,
  normalizeSpeechPrompt,
};
