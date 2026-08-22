import {
  createEmptyProgress,
  defaultReviewSettings,
  normalizeProgress,
  normalizeReviewSettings,
} from "./learning-engine.js";
import {
  defaultSpeechSettings,
  normalizeSpeechSettings,
} from "./speech-settings.js";
import {
  maxStudySecondsPerScreen,
  normalizeStudySeconds,
} from "./study-time.js";

export const accessKeyStorageKey = "anki-cloud-access-key:v1";

export const defaultSpeechParts = Object.freeze({
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

export const defaultSetupPreferences = Object.freeze({
  schemaVersion: 1,
  lastSubjectId: "",
  subjects: Object.freeze({}),
});

const setupPreferenceIdPattern = /^[A-Za-z0-9_-]{1,100}$/;
const studyModes = new Set(["memorize", "listen-answer"]);
const questionStyles = new Set(["", "beginner", "reverse", "integrated"]);
const questionAmountModes = new Set(["all", "one-per-term"]);
const studySessionIdPattern = /^[A-Za-z0-9_-]{1,100}$/;
const studySessionTaskLimit = 10_000;

function normalizeStudyHistoryRow(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const studyDate = String(value.studyDate ?? "");
  const subjectId = normalizeStudySessionId(value.subjectId);
  const deckId = normalizeStudySessionId(value.deckId);
  const studyMode = studyModes.has(value.studyMode) ? value.studyMode : "";
  const subjectTitle = String(value.subjectTitle ?? "").trim().slice(0, 200);
  const deckTitle = String(value.deckTitle ?? "").trim().slice(0, 200);
  const answeredCount = Math.min(
    1_000_000_000,
    Math.max(0, Number.parseInt(value.answeredCount, 10) || 0),
  );
  const studySeconds = normalizeStudySeconds(value.studySeconds);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(studyDate) ||
    !subjectId ||
    !deckId ||
    !studyMode ||
    !subjectTitle ||
    !deckTitle ||
    (answeredCount === 0 && studySeconds === 0)
  ) {
    return null;
  }
  return {
    studyDate,
    subjectId,
    subjectTitle,
    deckId,
    deckTitle,
    studyMode,
    answeredCount,
    studySeconds,
    firstOccurredAt: typeof value.firstOccurredAt === "string"
      ? value.firstOccurredAt
      : null,
    lastOccurredAt: typeof value.lastOccurredAt === "string"
      ? value.lastOccurredAt
      : null,
  };
}

export function normalizeStudyHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    const normalized = normalizeStudyHistoryRow(row);
    return normalized ? [normalized] : [];
  });
}

function normalizeStudySessionId(value) {
  const id = String(value ?? "");
  return studySessionIdPattern.test(id) ? id : "";
}

function normalizeStudySessionTask(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const termId = normalizeStudySessionId(value.termId);
  const questionId = normalizeStudySessionId(value.questionId);
  const stage = questionStyles.has(value.stage) && value.stage ? value.stage : "";
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
  return [...new Set(value.map(normalizeStudySessionId).filter((id) => validQuestionIds.has(id)))];
}

export function normalizeStudySession(value) {
  let source = value;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      return null;
    }
  }
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const tasks = normalizeStudySessionTasks(source.tasks);
  if (tasks.length === 0) return null;
  const validQuestionIds = new Set(tasks.map((task) => task.questionId));
  const taskByQuestionId = new Map(tasks.map((task) => [task.questionId, task]));
  const queue = normalizeStudySessionTasks(source.queue).filter((task) =>
    validQuestionIds.has(task.questionId),
  );
  const currentTask = normalizeStudySessionTask(source.currentTask);
  const normalizedCurrentTask = currentTask && validQuestionIds.has(currentTask.questionId)
    ? taskByQuestionId.get(currentTask.questionId)
    : null;
  return {
    schemaVersion: 1,
    studyMode: studyModes.has(source.studyMode) ? source.studyMode : "memorize",
    deckIds: [...new Set(
      (Array.isArray(source.deckIds) ? source.deckIds : [])
        .map(normalizeStudySessionId)
        .filter(Boolean),
    )].slice(0, 100),
    selectedStage: questionStyles.has(source.selectedStage) ? source.selectedStage : "",
    questionAmountMode: questionAmountModes.has(source.questionAmountMode)
      ? source.questionAmountMode
      : "all",
    shuffleEnabled: source.shuffleEnabled === true,
    autoSpeechEnabled: source.autoSpeechEnabled == null
      ? true
      : source.autoSpeechEnabled === true,
    filters: {
      macroRegion: normalizeSetupSelection(source.filters?.macroRegion),
      regionDetail: normalizeSetupSelection(source.filters?.regionDetail),
      category: normalizeSetupSelection(source.filters?.category),
    },
    termIds: [...new Set(
      (Array.isArray(source.termIds) ? source.termIds : [])
        .map(normalizeStudySessionId)
        .filter(Boolean),
    )].slice(0, studySessionTaskLimit),
    tasks,
    queue,
    currentTask: normalizedCurrentTask,
    unseenQuestionIds: normalizeStudySessionQuestionIds(
      source.unseenQuestionIds,
      validQuestionIds,
    ),
    retryQuestionIds: normalizeStudySessionQuestionIds(
      source.retryQuestionIds,
      validQuestionIds,
    ),
    answeredCount: Math.min(
      1_000_000_000,
      Math.max(0, Number.parseInt(source.answeredCount, 10) || 0),
    ),
    studySeconds: normalizeStudySeconds(source.studySeconds),
    screenStudySeconds: normalizeStudySeconds(
      source.screenStudySeconds,
      maxStudySecondsPerScreen,
    ),
    savedScreenStudySeconds: normalizeStudySeconds(
      source.savedScreenStudySeconds,
      maxStudySecondsPerScreen,
    ),
    studyTimeEventId: normalizeStudySessionId(source.studyTimeEventId),
    answerVisible: source.answerVisible === true,
    startedAt: typeof source.startedAt === "string" ? source.startedAt : null,
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : null,
  };
}

export function normalizeStudySessions(value, legacySession = null) {
  const sessions = { memorize: null, "listen-answer": null };
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const studyMode of studyModes) {
      const session = normalizeStudySession(value[studyMode]);
      if (session?.studyMode === studyMode) {
        sessions[studyMode] = session;
      }
    }
  }
  const normalizedLegacySession = normalizeStudySession(legacySession);
  if (
    normalizedLegacySession &&
    !sessions[normalizedLegacySession.studyMode]
  ) {
    sessions[normalizedLegacySession.studyMode] = normalizedLegacySession;
  }
  return sessions;
}

function normalizeSetupPreferenceId(value) {
  const id = String(value ?? "");
  return setupPreferenceIdPattern.test(id) ? id : "";
}

function normalizeSetupSelection(value) {
  return String(value ?? "").trim().slice(0, 200);
}

export function normalizeSetupPreferences(value) {
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
        questionStyle: questionStyles.has(rawDeck.questionStyle)
          ? rawDeck.questionStyle
          : "",
        questionAmountMode: questionAmountModes.has(rawDeck.questionAmountMode)
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
      studyMode: studyModes.has(rawSubject.studyMode)
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

function normalizeSpeechPartGroup(value, defaults) {
  const source = value && typeof value === "object" ? value : {};
  const normalized = Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => [
      key,
      source[key] == null
        ? fallback
        : source[key] === true || source[key] === "true",
    ]),
  );
  return Object.values(normalized).some(Boolean)
    ? normalized
    : { ...defaults };
}

export function normalizeSpeechParts(value) {
  const source = value && typeof value === "object" ? value : {};
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

export const defaultSharedSettings = Object.freeze({
  ...defaultReviewSettings,
  ...defaultSpeechSettings,
  shuffleEnabled: false,
  autoSpeechEnabled: true,
  listeningPauseSeconds: 0,
  speechParts: defaultSpeechParts,
  setupPreferences: defaultSetupPreferences,
});

export function normalizeListeningPauseSeconds(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) ? Math.min(60, Math.max(0, seconds)) : 0;
}

export function normalizeSharedSettings(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    ...normalizeReviewSettings(source),
    ...normalizeSpeechSettings(source),
    shuffleEnabled:
      source.shuffleEnabled === true || source.shuffleEnabled === "true",
    autoSpeechEnabled:
      source.autoSpeechEnabled == null
        ? true
        : source.autoSpeechEnabled === true || source.autoSpeechEnabled === "true",
    listeningPauseSeconds: normalizeListeningPauseSeconds(
      source.listeningPauseSeconds,
    ),
    speechParts: normalizeSpeechParts(source.speechParts),
    setupPreferences: normalizeSetupPreferences(source.setupPreferences),
  };
}

function getApiBaseUrl() {
  const apiBaseUrl = String(window.ANKI_CONFIG?.progressApiBaseUrl ?? "").replace(
    /\/$/,
    "",
  );
  if (!apiBaseUrl) {
    throw new Error("Cloudflareの学習記録保存先が設定されていません。");
  }
  return apiBaseUrl;
}

export function getStoredAccessKey() {
  try {
    return window.localStorage.getItem(accessKeyStorageKey) ?? "";
  } catch {
    return "";
  }
}

export function storeAccessKey(accessKey) {
  const normalized = String(accessKey ?? "").trim();
  if (!normalized) {
    throw new Error("アクセスキーを入力してください。");
  }
  window.localStorage.setItem(accessKeyStorageKey, normalized);
  return normalized;
}

export function clearStoredAccessKey() {
  try {
    window.localStorage.removeItem(accessKeyStorageKey);
  } catch {
    // 保存領域が使えない場合も画面上の操作は続ける。
  }
}

async function cloudRequest(path, options = {}) {
  const accessKey = getStoredAccessKey();
  if (!accessKey) {
    throw new Error("設定ページでCloudflareのアクセスキーを登録してください。");
  }
  let response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...options,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${accessKey}`,
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    });
  } catch {
    throw new Error(
      "Cloudflareへ接続できませんでした。通信状態を確認して、もう一度お試しください。",
    );
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Cloudflareのアクセスキーが正しくありません。");
    }
    throw new Error(payload.error || `Cloudflareへの保存に失敗しました（${response.status}）。`);
  }
  return payload;
}

export async function requestCloudSpeech(text, voice, language = "ja-JP") {
  const accessKey = getStoredAccessKey();
  if (!accessKey) {
    throw new Error("Cloudflareのアクセスキーが登録されていません。");
  }
  const response = await fetch(`${getApiBaseUrl()}/v1/speech`, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${accessKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: String(text ?? ""),
      voice: String(voice ?? ""),
      language: String(language ?? ""),
    }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      throw new Error("Cloudflareのアクセスキーが正しくありません。");
    }
    throw new Error(
      payload.error || `Azure音声の生成に失敗しました（${response.status}）。`,
    );
  }
  const audio = await response.blob();
  if (!audio.type.startsWith("audio/") || audio.size === 0) {
    throw new Error("Azureから音声を受け取れませんでした。");
  }
  return audio;
}

export async function loadCloudState(masteryTarget = 2, datasetVersion = "") {
  const query = datasetVersion
    ? `?dataset=${encodeURIComponent(datasetVersion)}`
    : "";
  const payload = await cloudRequest(`/v1/state${query}`);
  return {
    progress: normalizeProgress(payload.progress ?? createEmptyProgress(), masteryTarget),
    settings: normalizeSharedSettings(payload.settings),
    sessions: normalizeStudySessions(payload.sessions, payload.session),
    session: normalizeStudySession(payload.session),
  };
}

export async function loadCloudStudyHistory() {
  const payload = await cloudRequest("/v1/study-history");
  return {
    cutoffHour: 4,
    timeZone: "Asia/Tokyo",
    history: normalizeStudyHistory(payload.history),
  };
}

export async function saveCloudQuestion(datasetVersion, questionId, record) {
  return cloudRequest(
    `/v1/progress/${encodeURIComponent(questionId)}?dataset=${encodeURIComponent(datasetVersion)}`,
    {
    method: "PUT",
    body: JSON.stringify(record),
    },
  );
}

export async function deleteCloudQuestion(datasetVersion, questionId) {
  return cloudRequest(
    `/v1/progress/${encodeURIComponent(questionId)}?dataset=${encodeURIComponent(datasetVersion)}`,
    { method: "DELETE" },
  );
}

export async function importCloudProgress(datasetVersion, progress) {
  const entries = Object.entries(progress.questions ?? {});
  for (let index = 0; index < entries.length; index += 40) {
    await cloudRequest("/v1/progress/import", {
      method: "POST",
      body: JSON.stringify({
        datasetVersion,
        questions: Object.fromEntries(entries.slice(index, index + 40)),
      }),
    });
  }
}

export async function resetCloudProgress(datasetVersion) {
  return cloudRequest(`/v1/progress?dataset=${encodeURIComponent(datasetVersion)}`, {
    method: "DELETE",
  });
}

export async function saveCloudStudySession(datasetVersion, session) {
  const payload = await cloudRequest(
    `/v1/study-session?dataset=${encodeURIComponent(datasetVersion)}`,
    {
      method: "PUT",
      body: JSON.stringify(session),
    },
  );
  return normalizeStudySession(payload.session);
}

export async function deleteCloudStudySession(datasetVersion, studyMode) {
  return cloudRequest(
    `/v1/study-session?dataset=${encodeURIComponent(datasetVersion)}&mode=${encodeURIComponent(studyMode)}`,
    { method: "DELETE" },
  );
}

export async function saveCloudStudyAnswer(
  datasetVersion,
  questionId,
  record,
  session,
  historyChange = {},
) {
  const payload = await cloudRequest(
    `/v1/study-answer/${encodeURIComponent(questionId)}?dataset=${encodeURIComponent(datasetVersion)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        record,
        session,
        studyMode: historyChange.studyMode ?? session?.studyMode ?? null,
        activity: historyChange.activity ?? null,
        deleteActivityId: historyChange.deleteActivityId ?? null,
        sessionDatasetVersion:
          historyChange.sessionDatasetVersion ?? datasetVersion,
      }),
    },
  );
  return {
    updatedAt: payload.updatedAt,
    session: normalizeStudySession(payload.session),
  };
}

export async function saveCloudStudyActivity(
  datasetVersion,
  activity,
  session,
  { sessionDatasetVersion = datasetVersion } = {},
) {
  const payload = await cloudRequest(
    `/v1/study-activity/${encodeURIComponent(activity.eventId)}?dataset=${encodeURIComponent(datasetVersion)}`,
    {
      method: "PUT",
      body: JSON.stringify({ activity, session, sessionDatasetVersion }),
    },
  );
  return {
    occurredAt: payload.occurredAt,
    studyDate: payload.studyDate,
    session: normalizeStudySession(payload.session),
  };
}

export async function saveCloudStudyTime(
  datasetVersion,
  timeEntry,
  session,
  { keepalive = false, sessionDatasetVersion = datasetVersion } = {},
) {
  const payload = await cloudRequest(
    `/v1/study-time/${encodeURIComponent(timeEntry.eventId)}?dataset=${encodeURIComponent(datasetVersion)}`,
    {
      method: "PUT",
      body: JSON.stringify({ timeEntry, session, sessionDatasetVersion }),
      keepalive,
    },
  );
  return {
    updatedAt: payload.updatedAt,
    studyDate: payload.studyDate,
    session: normalizeStudySession(payload.session),
  };
}

export async function undoCloudStudyActivity(
  datasetVersion,
  eventId,
  session,
  { sessionDatasetVersion = datasetVersion } = {},
) {
  const payload = await cloudRequest(
    `/v1/study-activity/${encodeURIComponent(eventId)}/undo?dataset=${encodeURIComponent(datasetVersion)}`,
    {
      method: "PUT",
      body: JSON.stringify({ session, sessionDatasetVersion }),
    },
  );
  return {
    updatedAt: payload.updatedAt,
    session: normalizeStudySession(payload.session),
  };
}

export async function saveCloudSettings(settings) {
  const payload = await cloudRequest("/v1/settings", {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
  return normalizeSharedSettings(payload.settings);
}
