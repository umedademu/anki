import { normalizeSubjectOrder } from "./subject-order.js";
import { normalizeDeckOrder, normalizeQuestionLimit } from "./sequential-study.js";
import { normalizeQuestionBatch } from "./question-batch.js";
import {
  combinedQuestionStyles,
  createEmptyProgress,
  defaultReviewSettings,
  learningStages,
  normalizeProgress,
  normalizeReviewSettings,
  normalizeSubjectReviewSettings,
} from "./learning-engine.js";
import { normalizeRatingCounts } from "./rating-results.js";
import {
  defaultSpeechSettings,
  normalizeSpeechSettings,
  normalizeSubjectSpeechRate,
} from "./speech-settings.js";
import {
  defaultStudyTimeLimitSeconds,
  maximumStudyTimeLimitSeconds,
  normalizeStudySeconds,
  normalizeStudyTimeLimitSeconds,
} from "./study-time.js";
import {
  defaultStudyRoutineMultiplier,
  defaultStudyRoutineOvertimeSeconds,
  defaultStudyRoutinePlan,
  defaultStudyRoutineVideos,
  defaultStudyRoutineVideoShuffle,
  migrateLegacyStudyRoutineRun,
  normalizeStudyRoutineMultiplier,
  normalizeStudyRoutineOvertimeSeconds,
  normalizeStudyRoutinePlan,
  normalizeStudyRoutineRun,
  normalizeStudyRoutineVideoLibrary,
  normalizeStudyRoutineVideoShuffle,
} from "./study-routine.js";
import {
  defaultRatingSoundVolume,
  normalizeRatingSoundContentType,
  normalizeRatingSoundKey,
  normalizeRatingSounds,
  normalizeRatingSoundVolume,
} from "./rating-sound-settings.js";
import { normalizeRatingAnalysis } from "./analysis-core.js";
import {
  createStudySessionPatch,
  studySessionPatchVersion,
} from "./study-session-patch.js";

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
  subjectOrder: Object.freeze([]),
  subjects: Object.freeze({}),
  mindsetResume: Object.freeze({ lastCompletedItemId: "" }),
  routinePlan: defaultStudyRoutinePlan,
  routineRun: null,
  routineMultiplier: defaultStudyRoutineMultiplier,
  routineSkipVideos: false,
  routineVideos: defaultStudyRoutineVideos,
  routineVideoShuffle: defaultStudyRoutineVideoShuffle,
});

const setupPreferenceIdPattern = /^[A-Za-z0-9_-]{1,100}$/;
const studyModes = new Set(["memorize", "listen-answer"]);
const questionStages = new Set(learningStages);
const questionStyles = new Set(["", ...learningStages, ...Object.keys(combinedQuestionStyles)]);
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

export function normalizeRoundProgress(value) {
  return {
    completedCount: Math.min(
      1_000_000_000,
      Math.max(0, Number.parseInt(value?.completedCount, 10) || 0),
    ),
  };
}

function normalizeStudySessionId(value) {
  const id = String(value ?? "");
  return studySessionIdPattern.test(id) ? id : "";
}

function hasOnlyTaskFields(value) {
  for (const key in value) {
    if (key !== "termId" && key !== "questionId" && key !== "stage") return false;
  }
  return true;
}

function normalizeStudySessionTask(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const termId = normalizeStudySessionId(value.termId);
  const questionId = normalizeStudySessionId(value.questionId);
  const stage = questionStages.has(value.stage) ? value.stage : "";
  if (!(termId && questionId && stage)) return null;
  // 既に正規化済みの形はそのまま使い回し、聞き流しの1語ごとに数千件を作り直さない。
  // 学習中の問題は書き換えずに複製して扱うため、同じ物を共有しても内容は変わらない。
  if (
    value.termId === termId &&
    value.questionId === questionId &&
    value.stage === stage &&
    hasOnlyTaskFields(value)
  ) {
    return value;
  }
  return { termId, questionId, stage };
}

// 同じ一覧を同じ内容のまま渡された時は、前回の正規化結果を使い回す。
// 途中記録は1語ごとに2〜3回作るため、出題対象や用語の一覧（数千件）を毎回作り直さないようにする。
const normalizedListCache = new WeakMap();

function memoizeListNormalization(value, compute) {
  const cached = normalizedListCache.get(value);
  if (
    cached &&
    cached.source.length === value.length &&
    cached.source.every((item, index) => item === value[index])
  ) {
    return cached.result;
  }
  const result = compute(value);
  normalizedListCache.set(value, { source: value.slice(), result });
  return result;
}

function normalizeStudySessionTasks(value) {
  if (!Array.isArray(value)) return [];
  return memoizeListNormalization(value, (items) => {
    const seen = new Set();
    return items.slice(0, studySessionTaskLimit).flatMap((item) => {
      const task = normalizeStudySessionTask(item);
      if (!task || seen.has(task.questionId)) return [];
      seen.add(task.questionId);
      return [task];
    });
  });
}

function normalizeStudySessionTermIds(value) {
  if (!Array.isArray(value)) return [];
  return memoizeListNormalization(value, (items) =>
    [...new Set(items.map(normalizeStudySessionId).filter(Boolean))].slice(
      0,
      studySessionTaskLimit,
    ),
  );
}

// 出題対象の一覧から引く索引。同じ一覧には同じ索引を使い回す。
const taskIndexCache = new WeakMap();

function indexStudySessionTasks(tasks) {
  let cached = taskIndexCache.get(tasks);
  if (!cached) {
    cached = {
      validQuestionIds: new Set(tasks.map((task) => task.questionId)),
      taskByQuestionId: new Map(tasks.map((task) => [task.questionId, task])),
    };
    taskIndexCache.set(tasks, cached);
  }
  return cached;
}

function normalizeStudySessionQuestionIds(value, validQuestionIds) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeStudySessionId).filter((id) => validQuestionIds.has(id)))];
}

function normalizeVocabularyStreamPreviousRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const lastRating = value.lastRating == null ? null : String(value.lastRating);
  if (lastRating && !["again", "hard", "good", "easy"].includes(lastRating)) return null;
  const normalizeDate = (date) => {
    if (date == null || date === "") return null;
    return Number.isFinite(Date.parse(String(date))) ? new Date(String(date)).toISOString() : "";
  };
  const lastAnsweredAt = normalizeDate(value.lastAnsweredAt);
  const nextReviewAt = normalizeDate(value.nextReviewAt);
  if (lastAnsweredAt === "" || nextReviewAt === "") return null;
  const count = (number) => Math.min(1_000_000_000, Math.max(0, Number.parseInt(number, 10) || 0));
  return {
    streak: count(value.streak),
    attempts: count(value.attempts),
    rememberedCount: count(value.rememberedCount),
    lastRating,
    lastAnsweredAt,
    nextReviewAt,
    everMastered: Boolean(value.everMastered),
  };
}

function normalizeVocabularyStreamRows(value, taskByQuestionId) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, studySessionTaskLimit).flatMap((row) => {
    const task = normalizeStudySessionTask(row);
    const validTask = task && taskByQuestionId.get(task.questionId);
    if (!validTask || task.stage !== "beginner" || task.termId !== validTask.termId ||
      task.stage !== validTask.stage) return [];
    return [{
      ...task,
      answerVisible: row.answerVisible === true,
      rating: ["again", "hard", "good", "easy"].includes(row.rating) ? row.rating : "",
      activityId: normalizeStudySessionId(row.activityId),
      answeredAt: typeof row.answeredAt === "string" && Number.isFinite(Date.parse(row.answeredAt))
        ? new Date(row.answeredAt).toISOString() : null,
      previousRecord: normalizeVocabularyStreamPreviousRecord(row.previousRecord),
      routineCounted: row.routineCounted === true,
    }];
  // 画面に出す3行に加え、スワイプで戻れる10個前までを残す。
  }).slice(0, 11);
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
  const { validQuestionIds, taskByQuestionId } = indexStudySessionTasks(tasks);
  const queue = normalizeStudySessionTasks(source.queue).filter((task) =>
    validQuestionIds.has(task.questionId),
  );
  const currentTask = normalizeStudySessionTask(source.currentTask);
  const normalizedCurrentTask = currentTask && validQuestionIds.has(currentTask.questionId)
    ? taskByQuestionId.get(currentTask.questionId)
    : null;
  const vocabularyStreamEnabled = source.vocabularyStreamEnabled === true;
  return {
    schemaVersion: 1,
    roundId: normalizeStudySessionId(source.roundId),
    studyMode: studyModes.has(source.studyMode) ? source.studyMode : "memorize",
    ...(source.vocabularyStreamEnabled !== undefined || source.vocabularyStreamRows !== undefined
      ? {
          vocabularyStreamEnabled,
          vocabularyStreamRows: vocabularyStreamEnabled
            ? normalizeVocabularyStreamRows(source.vocabularyStreamRows, taskByQuestionId)
            : [],
        }
      : {}),
    deckIds: [...new Set(
      (Array.isArray(source.deckIds) ? source.deckIds : [])
        .map(normalizeStudySessionId)
        .filter(Boolean),
    )].slice(0, 1000),
    excludeTimeQuestions: source.excludeTimeQuestions !== false,
    selectedQuestionTypes: Array.isArray(source.selectedQuestionTypes)
      ? [...new Set(source.selectedQuestionTypes.filter(value => typeof value === "string" && /^[a-z_]+$/.test(value) && value.length <= 50))].slice(0, 100)
      : null,
    selectedStage: vocabularyStreamEnabled ? "beginner"
      : questionStyles.has(source.selectedStage) ? source.selectedStage : "",
    questionAmountMode: questionAmountModes.has(source.questionAmountMode)
      ? source.questionAmountMode
      : "all",
    shuffleEnabled: source.shuffleEnabled === true,
    sequentialEnabled: source.sequentialEnabled === true,
    deckOrder: normalizeDeckOrder(source.deckOrder),
    questionLimit: normalizeQuestionLimit(source.questionLimit),
    questionBatch: normalizeQuestionBatch(source.questionBatch, validQuestionIds),
    questionLimitStart: Math.min(1_000_000_000, Math.max(0, Number.parseInt(source.questionLimitStart, 10) || 0)),
    questionLimitRatings: normalizeRatingCounts(source.questionLimitRatings),
    questionLimitSeconds: normalizeStudySeconds(source.questionLimitSeconds),
    autoSpeechEnabled: true,
    filters: {
      macroRegion: normalizeSetupSelection(source.filters?.macroRegion),
      regionDetail: normalizeSetupSelection(source.filters?.regionDetail),
      category: normalizeSetupSelection(source.filters?.category),
    },
    termIds: normalizeStudySessionTermIds(source.termIds),
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
    ratingCounts: normalizeRatingCounts(source.ratingCounts),
    studySeconds: normalizeStudySeconds(source.studySeconds),
    screenStudySeconds: normalizeStudySeconds(
      source.screenStudySeconds,
      maximumStudyTimeLimitSeconds,
    ),
    savedScreenStudySeconds: normalizeStudySeconds(
      source.savedScreenStudySeconds,
      maximumStudyTimeLimitSeconds,
    ),
    studyTimeEventId: normalizeStudySessionId(source.studyTimeEventId),
    answerVisible: source.answerVisible === true,
    routineOvertimeEndsAt:
      typeof source.routineOvertimeEndsAt === "string" &&
      Number.isFinite(Date.parse(source.routineOvertimeEndsAt))
        ? new Date(source.routineOvertimeEndsAt).toISOString()
        : null,
    startedAt: typeof source.startedAt === "string" ? source.startedAt : null,
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : null,
  };
}

export function switchStudySessionMode(value, studyMode) {
  const session = normalizeStudySession(value);
  if (!session || !studyModes.has(studyMode)) return null;
  const modeChanged = session.studyMode !== studyMode;
  return normalizeStudySession({
    ...session,
    studyMode,
    ...(modeChanged && session.vocabularyStreamRows !== undefined
      ? { vocabularyStreamRows: [] } : {}),
    answerVisible: modeChanged ? false : session.answerVisible,
    screenStudySeconds: modeChanged ? 0 : session.screenStudySeconds,
    savedScreenStudySeconds: modeChanged ? 0 : session.savedScreenStudySeconds,
    studyTimeEventId: modeChanged ? "" : session.studyTimeEventId,
  });
}

export function normalizeStudySessions(value, legacySession = null) {
  const candidates = [];
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const studyMode of studyModes) {
      const session = normalizeStudySession(value[studyMode]);
      if (session) candidates.push(session);
    }
  }
  const normalizedLegacySession = normalizeStudySession(legacySession);
  if (normalizedLegacySession) candidates.push(normalizedLegacySession);
  const sharedSession = candidates.reduce((newest, session) => {
    if (!newest) return session;
    const newestAt = Date.parse(newest.updatedAt ?? "");
    const sessionAt = Date.parse(session.updatedAt ?? "");
    if (!Number.isFinite(sessionAt)) return newest;
    return !Number.isFinite(newestAt) || sessionAt >= newestAt ? session : newest;
  }, null);
  return {
    memorize: sharedSession,
    "listen-answer": sharedSession,
  };
}

function normalizeSetupPreferenceId(value) {
  const id = String(value ?? "");
  return setupPreferenceIdPattern.test(id) ? id : "";
}

function normalizeSetupSelection(value) {
  return String(value ?? "").trim().slice(0, 200);
}

function normalizeMindsetResume(value) {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
  return {
    lastCompletedItemId: normalizeSetupPreferenceId(
      source.lastCompletedItemId,
    ),
  };
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
    for (const [rawDeckId, rawDeck] of Object.entries(rawDecks).slice(0, 1000)) {
      const deckId = normalizeSetupPreferenceId(rawDeckId);
      if (!deckId || !rawDeck || typeof rawDeck !== "object") continue;
      decks[deckId] = {
        macroRegion: normalizeSetupSelection(rawDeck.macroRegion),
        regionDetail: normalizeSetupSelection(rawDeck.regionDetail),
        category: normalizeSetupSelection(rawDeck.category),
        excludeTimeQuestions: rawDeck.excludeTimeQuestions !== false,
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
    )].slice(0, 1000);
    subjects[subjectId] = {
      lastDeckId,
      speechRate: normalizeSubjectSpeechRate(rawSubject.speechRate),
      vocabularyStreamEnabled: subjectId === "english-vocabulary" && rawSubject.vocabularyStreamEnabled === true,
      sequentialEnabled: rawSubject.sequentialEnabled === true,
      deckOrder: normalizeDeckOrder(rawSubject.deckOrder),
      questionLimit: normalizeQuestionLimit(rawSubject.questionLimit),
      selectedQuestionTypes: Array.isArray(rawSubject.selectedQuestionTypes)
        ? [...new Set(rawSubject.selectedQuestionTypes.filter(value => typeof value === "string" && /^[a-z_]+$/.test(value) && value.length <= 50))].slice(0, 100)
        : null,
      selectedDeckIds,
      studyMode: studyModes.has(rawSubject.studyMode)
        ? rawSubject.studyMode
        : "memorize",
      reviewSettings: normalizeSubjectReviewSettings(
        rawSubject.reviewSettings,
      ),
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
    subjectOrder: normalizeSubjectOrder(source.subjectOrder),
    subjects,
    mindsetResume: normalizeMindsetResume(source.mindsetResume),
    routinePlan,
    routineRun,
    routineMultiplier: normalizeStudyRoutineMultiplier(source.routineMultiplier),
    routineSkipVideos: source.routineSkipVideos === true,
    routineVideos,
    routineVideoShuffle: normalizeStudyRoutineVideoShuffle(
      source.routineVideoShuffle,
      routineVideos,
    ),
  };
}

export function mindsetResumeStartIndex(items, lastCompletedItemId) {
  if (!Array.isArray(items) || items.length === 0) return 0;
  const completedIndex = items.findIndex(
    (item) => item?.id === lastCompletedItemId,
  );
  return completedIndex >= 0 ? (completedIndex + 1) % items.length : 0;
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
  listeningQuestionIntervalSeconds: 0,
  studyRoutineOvertimeSeconds: defaultStudyRoutineOvertimeSeconds,
  studyTimeLimitSeconds: defaultStudyTimeLimitSeconds,
  ratingSoundVolume: defaultRatingSoundVolume,
  ratingSounds: Object.freeze(normalizeRatingSounds()),
  speechParts: defaultSpeechParts,
  setupPreferences: defaultSetupPreferences,
});

export function normalizeListeningPauseSeconds(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) ? Math.min(60, Math.max(0, seconds)) : 0;
}

export function normalizeListeningQuestionIntervalSeconds(value) {
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
    autoSpeechEnabled: true,
    listeningPauseSeconds: normalizeListeningPauseSeconds(
      source.listeningPauseSeconds,
    ),
    listeningQuestionIntervalSeconds: normalizeListeningQuestionIntervalSeconds(
      source.listeningQuestionIntervalSeconds,
    ),
    studyRoutineOvertimeSeconds: normalizeStudyRoutineOvertimeSeconds(
      source.studyRoutineOvertimeSeconds,
    ),
    studyTimeLimitSeconds: normalizeStudyTimeLimitSeconds(
      source.studyTimeLimitSeconds,
    ),
    ratingSoundVolume: normalizeRatingSoundVolume(source.ratingSoundVolume),
    ratingSounds: normalizeRatingSounds(source.ratingSounds),
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

export async function cloudRequest(path, options = {}) {
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
    throw Object.assign(
      new Error(payload.error || `Cloudflareへの保存に失敗しました（${response.status}）。`),
      { status: response.status, ...(payload.code ? { code: payload.code } : {}) },
    );
  }
  return payload;
}

// 保存窓口が持っている途中記録の控え。次の保存で差分を作る前提に使い、保存に失敗した時は捨てる。
// 問題集の版（複数デッキの組合せ）ごとに持ち、直近の数件だけを残す。
const cloudSessionMirror = new Map();
const cloudSessionMirrorLimit = 8;
let studySessionPatchSupported = false;

export function rememberCloudSession(datasetVersion, session) {
  const key = String(datasetVersion ?? "");
  if (!key) return;
  cloudSessionMirror.delete(key);
  if (!session) return;
  cloudSessionMirror.set(key, session);
  while (cloudSessionMirror.size > cloudSessionMirrorLimit) {
    cloudSessionMirror.delete(cloudSessionMirror.keys().next().value);
  }
}

export function forgetCloudSession(datasetVersion) {
  if (datasetVersion == null) cloudSessionMirror.clear();
  else cloudSessionMirror.delete(String(datasetVersion));
}

export function isStudySessionPatchSupported() {
  return studySessionPatchSupported;
}

export function setStudySessionPatchSupported(value) {
  studySessionPatchSupported = value === true;
}

// 途中記録を本文へ入れる形を決める。差分で送れる時は { sessionPatch }、それ以外は { session }。
function studySessionBody(datasetVersion, session, { allowPatch = true } = {}) {
  if (!session) return { fields: { session: null }, patched: false };
  if (allowPatch && studySessionPatchSupported) {
    const base = cloudSessionMirror.get(String(datasetVersion ?? ""));
    const sessionPatch = base ? createStudySessionPatch(base, session) : null;
    if (sessionPatch) return { fields: { sessionPatch }, patched: true };
  }
  return { fields: { session }, patched: false };
}

// 返答から途中記録を取り出す。差分で送った時は返答に途中記録が入らないため、送った内容に更新日時を付けて使う。
function studySessionFromReply(payload, sent) {
  if (payload?.sessionPatched === true) {
    if (!sent) return null;
    const updatedAt = typeof payload.sessionUpdatedAt === "string"
      ? payload.sessionUpdatedAt
      : payload.updatedAt ?? payload.occurredAt ?? null;
    return { ...sent, updatedAt };
  }
  return normalizeStudySession(payload?.session);
}

// 途中記録を含む保存を送る。差分が拒否された時（409）や保存窓口側の失敗（5xx）は、全体で1回だけ送り直す。
// 成功したら保存された途中記録を控えとして覚え、失敗したら控えを捨てて次回は全体を送る。
async function requestWithStudySession(path, datasetVersion, session, buildOptions) {
  const first = studySessionBody(datasetVersion, session);
  let payload;
  try {
    payload = await cloudRequest(path, buildOptions(first.fields, first.patched));
  } catch (error) {
    forgetCloudSession(datasetVersion);
    if (!first.patched || !(error.status === 409 || error.status >= 500)) {
      throw error;
    }
    const retry = studySessionBody(datasetVersion, session, { allowPatch: false });
    payload = await cloudRequest(path, buildOptions(retry.fields, retry.patched));
  }
  const saved = studySessionFromReply(payload, session);
  rememberCloudSession(datasetVersion, saved);
  return { payload, session: saved };
}

export async function requestCloudSpeech(
  text,
  voice,
  language = "ja-JP",
  { trimSilence = false } = {},
) {
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
      trimSilence: trimSilence === true,
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

export async function requestCloudRatingSound(rating) {
  const normalizedRating = normalizeRatingSoundKey(rating);
  if (!normalizedRating) {
    throw new Error("評価の種類が正しくありません。");
  }
  const accessKey = getStoredAccessKey();
  if (!accessKey) {
    throw new Error("Cloudflareのアクセスキーが登録されていません。");
  }
  let response;
  try {
    response = await fetch(
      `${getApiBaseUrl()}/v1/rating-sounds/${normalizedRating}`,
      {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${accessKey}`,
          Accept: "audio/*",
        },
      },
    );
  } catch {
    throw new Error("Cloudflareから評価音を読み込めませんでした。");
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      throw new Error("Cloudflareのアクセスキーが正しくありません。");
    }
    throw new Error(
      payload.error || `評価音を読み込めませんでした（${response.status}）。`,
    );
  }
  const audio = await response.blob();
  if (!audio.type.startsWith("audio/") || audio.size === 0) {
    throw new Error("Cloudflareから正しい評価音を受け取れませんでした。");
  }
  return audio;
}

export async function uploadCloudRatingSound(rating, file) {
  const normalizedRating = normalizeRatingSoundKey(rating);
  if (!normalizedRating) {
    throw new Error("評価の種類が正しくありません。");
  }
  const fileName = String(file?.name ?? "").trim();
  const contentType = normalizeRatingSoundContentType(file?.type, fileName);
  if (!contentType || !file || typeof file.arrayBuffer !== "function") {
    throw new Error("MP3・WAV・M4Aの音声を選んでください。");
  }
  const payload = await cloudRequest(
    `/v1/rating-sounds/${normalizedRating}?name=${encodeURIComponent(fileName)}`,
    {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: file,
    },
  );
  return {
    sound: normalizeRatingSounds({ [normalizedRating]: payload.sound })[
      normalizedRating
    ],
    settings: normalizeSharedSettings(payload.settings),
  };
}

export async function deleteCloudRatingSound(rating) {
  const normalizedRating = normalizeRatingSoundKey(rating);
  if (!normalizedRating) {
    throw new Error("評価の種類が正しくありません。");
  }
  const payload = await cloudRequest(
    `/v1/rating-sounds/${normalizedRating}`,
    { method: "DELETE" },
  );
  return normalizeSharedSettings(payload.settings);
}

export async function loadCloudState(masteryTarget = 2, datasetVersion = "") {
  const query = datasetVersion
    ? `?dataset=${encodeURIComponent(datasetVersion)}`
    : "";
  const payload = await cloudRequest(`/v1/state${query}`);
  studySessionPatchSupported =
    payload.features?.studySessionPatch === studySessionPatchVersion;
  const sessions = normalizeStudySessions(payload.sessions, payload.session);
  // 読み込んだ途中記録を控えとして覚え、再開後の最初の保存から差分で送れるようにする。
  if (datasetVersion) rememberCloudSession(datasetVersion, sessions["listen-answer"]);
  return {
    progress: normalizeProgress(payload.progress ?? createEmptyProgress(), masteryTarget),
    roundProgress: normalizeRoundProgress(payload.roundProgress),
    settings: normalizeSharedSettings(payload.settings),
    sessions,
    session: normalizeStudySession(payload.session),
    studyDate: typeof payload.studyDate === "string" ? payload.studyDate : "",
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

export async function loadCloudRatingAnalysis(period = 30) {
  const normalizedPeriod = period === "all" ? "all" : Number(period) === 90 ? 90 : 30;
  const payload = await cloudRequest(
    `/v1/analysis?period=${encodeURIComponent(normalizedPeriod)}`,
  );
  return normalizeRatingAnalysis(payload);
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
  forgetCloudSession(datasetVersion);
  return cloudRequest(`/v1/progress?dataset=${encodeURIComponent(datasetVersion)}`, {
    method: "DELETE",
  });
}

export async function saveCloudStudySession(datasetVersion, session) {
  const { session: saved } = await requestWithStudySession(
    `/v1/study-session?dataset=${encodeURIComponent(datasetVersion)}`,
    datasetVersion,
    session,
    (fields, patched) => ({
      method: "PUT",
      // この窓口は本文が途中記録そのもの。差分の時だけ { sessionPatch } の形にする。
      body: JSON.stringify(patched ? fields : session),
    }),
  );
  return saved;
}

export async function deleteCloudStudySession(datasetVersion) {
  forgetCloudSession(datasetVersion);
  return cloudRequest(
    `/v1/study-session?dataset=${encodeURIComponent(datasetVersion)}`,
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
  const { payload, session: saved } = await requestWithStudySession(
    `/v1/study-answer/${encodeURIComponent(questionId)}?dataset=${encodeURIComponent(datasetVersion)}`,
    historyChange.sessionDatasetVersion ?? datasetVersion,
    session,
    (sessionFields) => ({
      method: "PUT",
      body: JSON.stringify({
        record,
        ...sessionFields,
        studyMode: historyChange.studyMode ?? session?.studyMode ?? null,
        activity: historyChange.activity ?? null,
        deleteActivityId: historyChange.deleteActivityId ?? null,
        ...(historyChange.replaceActivityId
          ? { replaceActivityId: historyChange.replaceActivityId }
          : {}),
        ...(historyChange.reviseActivityId
          ? {
              reviseActivityId: historyChange.reviseActivityId,
              ...(historyChange.reviseAnalysis !== undefined
                ? { reviseAnalysis: historyChange.reviseAnalysis } : {}),
            }
          : {}),
        completeRoundId: historyChange.completeRoundId ?? null,
        deleteRoundId: historyChange.deleteRoundId ?? null,
        sessionDatasetVersion:
          historyChange.sessionDatasetVersion ?? datasetVersion,
        routineRun: historyChange.routineRun,
      }),
    }),
  );
  return {
    updatedAt: payload.updatedAt,
    session: saved,
    roundProgress: normalizeRoundProgress(payload.roundProgress),
  };
}

export async function saveCloudStudyActivity(
  datasetVersion,
  activity,
  session,
  {
    sessionDatasetVersion = datasetVersion,
    completeSession = false,
    completeRoundId = completeSession ? session?.roundId : null,
    routineRun,
    timeEntry = null,
  } = {},
) {
  const { payload, session: saved } = await requestWithStudySession(
    `/v1/study-activity/${encodeURIComponent(activity.eventId)}?dataset=${encodeURIComponent(datasetVersion)}`,
    sessionDatasetVersion,
    session,
    (sessionFields) => ({
      method: "PUT",
      body: JSON.stringify({
        activity,
        ...sessionFields,
        sessionDatasetVersion,
        completeSession,
        completeRoundId,
        routineRun,
        ...(timeEntry ? { timeEntry } : {}),
      }),
    }),
  );
  return {
    occurredAt: payload.occurredAt,
    studyDate: payload.studyDate,
    session: saved,
    roundProgress: normalizeRoundProgress(payload.roundProgress),
  };
}

export async function saveCloudStudyTime(
  datasetVersion,
  timeEntry,
  session,
  { keepalive = false, sessionDatasetVersion = datasetVersion } = {},
) {
  const { payload, session: saved } = await requestWithStudySession(
    `/v1/study-time/${encodeURIComponent(timeEntry.eventId)}?dataset=${encodeURIComponent(datasetVersion)}`,
    sessionDatasetVersion,
    session,
    (sessionFields) => ({
      method: "PUT",
      body: JSON.stringify({ timeEntry, ...sessionFields, sessionDatasetVersion }),
      keepalive,
    }),
  );
  return {
    updatedAt: payload.updatedAt,
    studyDate: payload.studyDate,
    session: saved,
  };
}

export async function undoCloudStudyActivity(
  datasetVersion,
  eventId,
  session,
  { sessionDatasetVersion = datasetVersion, deleteRoundId = null, routineRun } = {},
) {
  const { payload, session: saved } = await requestWithStudySession(
    `/v1/study-activity/${encodeURIComponent(eventId)}/undo?dataset=${encodeURIComponent(datasetVersion)}`,
    sessionDatasetVersion,
    session,
    (sessionFields) => ({
      method: "PUT",
      body: JSON.stringify({
        ...sessionFields,
        sessionDatasetVersion,
        deleteRoundId,
        routineRun,
      }),
    }),
  );
  return {
    updatedAt: payload.updatedAt,
    session: saved,
    roundProgress: normalizeRoundProgress(payload.roundProgress),
  };
}

export async function saveCloudStudyRoutine(patch) {
  const payload = await cloudRequest("/v1/study-routine", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return {
    setupPreferences: normalizeSetupPreferences(payload.setupPreferences),
    studyDate: typeof payload.studyDate === "string" ? payload.studyDate : "",
  };
}

export async function addCloudStudyRoutineVideo(url) {
  const payload = await cloudRequest("/v1/study-routine/videos", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
  return {
    video: payload.video && typeof payload.video === "object"
      ? payload.video
      : null,
    setupPreferences: normalizeSetupPreferences(payload.setupPreferences),
  };
}

export async function deleteCloudStudyRoutineVideo(youtubeId) {
  const payload = await cloudRequest(
    `/v1/study-routine/videos/${encodeURIComponent(youtubeId)}`,
    { method: "DELETE" },
  );
  return {
    setupPreferences: normalizeSetupPreferences(payload.setupPreferences),
  };
}

export async function saveCloudSettings(settings) {
  const payload = await cloudRequest("/v1/settings", {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
  return normalizeSharedSettings(payload.settings);
}
