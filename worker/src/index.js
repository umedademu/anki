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
});

const setupPreferenceIdPattern = /^[A-Za-z0-9_-]{1,100}$/;
const setupStudyModes = new Set(["memorize", "listen-answer"]);
const setupQuestionStyles = new Set(["", "beginner", "reverse", "integrated"]);
const setupQuestionAmountModes = new Set(["all", "one-per-term"]);

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
  speechParts: defaultSpeechParts,
  setupPreferences: defaultSetupPreferences,
};

const ratingValues = new Set(["again", "hard", "good", "easy"]);

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
    subjects[subjectId] = {
      lastDeckId: normalizeSetupPreferenceId(rawSubject.lastDeckId),
      studyMode: setupStudyModes.has(rawSubject.studyMode)
        ? rawSubject.studyMode
        : "memorize",
      decks,
    };
  }
  const lastSubjectId = normalizeSetupPreferenceId(source.lastSubjectId);
  return {
    schemaVersion: 1,
    lastSubjectId: lastSubjectId in subjects ? lastSubjectId : "",
    subjects,
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
    autoSpeechEnabled:
      source.autoSpeechEnabled == null ? true : source.autoSpeechEnabled === true,
    listeningPauseSeconds: decimal(source.listeningPauseSeconds, 0, 0, 60),
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

async function readState(env, datasetVersion) {
  const [progressRows, settingsRow] = await Promise.all([
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
        speech_parts_json, setup_preferences_json, updated_at
       FROM review_settings WHERE profile_id = 1`,
    ).first(),
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
  return {
    progress: { questions, updatedAt: newestUpdate },
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
          autoSpeechEnabled: Boolean(settingsRow.auto_speech_enabled),
          listeningPauseSeconds: settingsRow.listening_pause_seconds,
          speechParts: normalizeSpeechParts(settingsRow.speech_parts_json),
          setupPreferences: normalizeSetupPreferences(
            settingsRow.setup_preferences_json,
          ),
          updatedAt: settingsRow.updated_at,
        }
      : defaultSettings,
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
      speech_parts_json, setup_preferences_json, updated_at
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

  if (url.pathname === "/v1/state" && request.method === "GET") {
    const datasetVersion = url.searchParams.get("dataset");
    return json(
      request,
      env,
      datasetVersion
        ? await readState(env, normalizeDatasetVersion(datasetVersion))
        : { progress: { questions: {}, updatedAt: null }, settings: (await readState(env, "__settings_only__")).settings },
    );
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
    await env.DB.prepare("DELETE FROM question_progress WHERE dataset_version = ?")
      .bind(datasetVersion)
      .run();
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
  normalizeSettings,
  normalizeSetupPreferences,
  normalizeSpeechParts,
  normalizeSpeechPrompt,
};
