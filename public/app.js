import {
  createEmptyProgress,
  createQuestionQueue,
  createRatingUndoSnapshot,
  createTermQuestionQueue,
  defaultReviewSettings,
  deserializeProgress,
  enqueueUniqueTasks,
  filterTermsBySelection,
  getMacroRegionTags,
  getNextDueAt,
  getOverallMastery,
  getQuestionAnswerDisplayText,
  getQuestionAnswerParts,
  getQuestionAnswerSpeechParts,
  getQuestionAnswerSpeechText,
  getQuestionPromptForDisplay,
  getQuestionExplanation,
  getQuestionYearMnemonic,
  getTasksForStage,
  getTermStage,
  isQuestionDue,
  learningStages,
  normalizeReviewSettings,
  rateQuestion,
  restoreRatingUndoSnapshot,
  shuffleTasks,
  shouldHideTerm,
} from "./learning-engine.js";
import {
  deleteCloudStudySession,
  getStoredAccessKey,
  importCloudProgress,
  loadCloudState,
  normalizeListeningPauseSeconds,
  normalizeListeningQuestionIntervalSeconds,
  normalizeSetupPreferences,
  normalizeSpeechParts,
  normalizeStudySession,
  requestCloudRatingSound,
  switchStudySessionMode,
  resetCloudProgress,
  requestCloudSpeech,
  saveCloudStudyActivity,
  saveCloudStudyAnswer,
  saveCloudStudyRoutine,
  saveCloudSettings,
  saveCloudStudySession,
  saveCloudStudyTime,
  undoCloudStudyActivity,
} from "./cloud-progress.js";
import {
  createHistorySpeechReadings,
  createSpeechController,
  createVocabularyAutomaticAnswerSequence,
  createVocabularySpeechGroups,
  prepareMnemonicDisplayText,
  prepareMnemonicSpeechText,
  vocabularySpeechLayoutByStage,
} from "./speech.js";
import {
  loadSpeechSettings,
  normalizeSpeechSettings,
  saveSpeechSettings,
} from "./speech-settings.js";
import {
  addStudySeconds,
  defaultStudyTimeLimitSeconds,
  formatStudyDuration,
  normalizeStudyTimeLimitSeconds,
} from "./study-time.js";
import {
  createSessionDatasetVersion,
  mergeDeckProgress,
  normalizeDeckSelection,
} from "./deck-selection.js";
import {
  assignStudyRoutineVideo,
  completeStudyRoutineVideo,
  continueStudyRoutineOnDate,
  countsTowardStudyRoutine,
  createStudyRoutineRun,
  currentStudyRoutineItem,
  defaultStudyRoutineOvertimeSeconds,
  drawStudyRoutineVideo,
  normalizeStudyRoutineOvertimeSeconds,
  normalizeStudyRoutineRun,
  recordStudyRoutineQuestion,
  studyRoutineTotals,
} from "./study-routine.js";
import { createRatingSoundPlayer } from "./rating-sound.js";
import {
  defaultRatingSoundVolume,
  normalizeRatingSounds,
  normalizeRatingSoundVolume,
  ratingSoundKeys,
} from "./rating-sound-settings.js";
import {
  addRatingCount,
  createEmptyRatingCounts,
  normalizeRatingCounts,
} from "./rating-results.js";

const elements = {
  homeLink: document.querySelector("#home-link"),
  loadingPanel: document.querySelector("#loading-panel"),
  subjectPanel: document.querySelector("#subject-panel"),
  subjectOptions: document.querySelector("#subject-options"),
  routineDashboard: document.querySelector("#routine-dashboard"),
  routineDashboardTitle: document.querySelector("#routine-dashboard-title"),
  routineDashboardSummary: document.querySelector("#routine-dashboard-summary"),
  routineDashboardProgress: document.querySelector("#routine-dashboard-progress"),
  routineDashboardList: document.querySelector("#routine-dashboard-list"),
  startRoutine: document.querySelector("#start-routine"),
  continueRoutine: document.querySelector("#continue-routine"),
  setupPanel: document.querySelector("#setup-panel"),
  setupEyebrow: document.querySelector("#setup-eyebrow"),
  setupTitle: document.querySelector("#setup-title"),
  setupDescription: document.querySelector("#setup-description"),
  routineSetupBanner: document.querySelector("#routine-setup-banner"),
  routineSetupTitle: document.querySelector("#routine-setup-title"),
  routineSetupProgress: document.querySelector("#routine-setup-progress"),
  studyShell: document.querySelector("#study-shell"),
  studyMenuTrigger: document.querySelector("#study-menu-trigger"),
  studyMenuLayer: document.querySelector("#study-menu-layer"),
  studyMenuBackdrop: document.querySelector("#study-menu-backdrop"),
  studyMenuClose: document.querySelector("#study-menu-close"),
  studyMenuSetup: document.querySelector("#study-menu-setup"),
  studyMenuHome: document.querySelector("#study-menu-home"),
  studyMenuSettings: document.querySelector("#study-menu-settings"),
  studyMenuSave: document.querySelector("#study-menu-save"),
  studyMenuStatus: document.querySelector("#study-menu-status"),
  studyMenuSpeechRate: document.querySelector("#study-menu-speech-rate"),
  studyMenuSpeechRateOutput: document.querySelector(
    "#study-menu-speech-rate-output",
  ),
  studyMenuQuestionIntervalSeconds: document.querySelector(
    "#study-menu-question-interval-seconds",
  ),
  studyMenuAgainValue: document.querySelector("#study-menu-again-value"),
  studyMenuAgainUnit: document.querySelector("#study-menu-again-unit"),
  studyMenuHardValue: document.querySelector("#study-menu-hard-value"),
  studyMenuHardUnit: document.querySelector("#study-menu-hard-unit"),
  studyMenuGoodValue: document.querySelector("#study-menu-good-value"),
  studyMenuGoodUnit: document.querySelector("#study-menu-good-unit"),
  studyMenuEasyValue: document.querySelector("#study-menu-easy-value"),
  studyMenuEasyUnit: document.querySelector("#study-menu-easy-unit"),
  errorPanel: document.querySelector("#error-panel"),
  errorMessage: document.querySelector("#error-message"),
  retryButton: document.querySelector("#retry-button"),
  deckFilter: document.querySelector("#deck-filter"),
  macroRegionField: document.querySelector("#macro-region-field"),
  macroRegionLabel: document.querySelector("#macro-region-label"),
  macroRegionFilter: document.querySelector("#macro-region-filter"),
  regionDetailField: document.querySelector("#region-detail-field"),
  regionDetailLabel: document.querySelector("#region-detail-label"),
  regionDetailFilter: document.querySelector("#region-detail-filter"),
  categoryField: document.querySelector("#category-field"),
  categoryLabel: document.querySelector("#category-label"),
  categoryFilter: document.querySelector("#category-filter"),
  questionStyleFilter: document.querySelector("#question-style-filter"),
  questionAmountField: document.querySelector("#question-amount-field"),
  questionAmountFilter: document.querySelector("#question-amount-filter"),
  studyModeOptions: document.querySelectorAll('input[name="study-mode"]'),
  listeningAnswerDescription: document.querySelector(
    "#listening-answer-description",
  ),
  setupShuffle: document.querySelector("#setup-shuffle"),
  selectionSummary: document.querySelector("#selection-summary"),
  resumeStudy: document.querySelector("#resume-study"),
  startStudy: document.querySelector("#start-study"),
  resetProgress: document.querySelector("#reset-progress"),
  changeSubject: document.querySelector("#change-subject"),
  routineVideoPanel: document.querySelector("#routine-video-panel"),
  routineVideoEyebrow: document.querySelector("#routine-video-eyebrow"),
  routineVideoTitle: document.querySelector("#routine-video-title"),
  routineVideoAuthor: document.querySelector("#routine-video-author"),
  routineVideoPlayerFrame: document.querySelector("#routine-video-player-frame"),
  routineVideoMessage: document.querySelector("#routine-video-message"),
  routineVideoComplete: document.querySelector("#routine-video-complete"),
  routineVideoYoutubeLink: document.querySelector("#routine-video-youtube-link"),
  routineVideoHome: document.querySelector("#routine-video-home"),
  cloudStatus: document.querySelector("#cloud-status"),
  subjectName: document.querySelector("#subject-name"),
  deckProgressName: document.querySelector("#deck-progress-name"),
  contextCard: document.querySelector("#context-card"),
  stageName: document.querySelector("#stage-name"),
  termTitle: document.querySelector("#term-title"),
  termReading: document.querySelector("#term-reading"),
  overallProgress: document.querySelector("#overall-progress"),
  termProgress: document.querySelector("#term-progress"),
  routineProgress: document.querySelector("#routine-progress"),
  queueProgress: document.querySelector("#queue-progress"),
  studyTime: document.querySelector("#study-time"),
  progressBar: document.querySelector("#progress-bar"),
  questionCard: document.querySelector("#question-card"),
  questionNumber: document.querySelector("#question-number"),
  questionText: document.querySelector("#question-text"),
  questionSpeech: document.querySelector("#question-speech"),
  answerPanel: document.querySelector("#answer-panel"),
  answerText: document.querySelector("#answer-text"),
  answerSpeech: document.querySelector("#answer-speech"),
  vocabularySpeechGroups: document.querySelector("#vocabulary-speech-groups"),
  vocabularySpeechButtons: document.querySelectorAll("[data-vocabulary-speech]"),
  answerNote: document.querySelector("#answer-note"),
  termOverview: document.querySelector("#term-overview"),
  termOverviewMain: document.querySelector("#term-overview-main"),
  termOverviewText: document.querySelector("#term-overview-text"),
  yearMnemonic: document.querySelector("#year-mnemonic"),
  yearMnemonicText: document.querySelector("#year-mnemonic-text"),
  yearMnemonicSpeech: document.querySelector("#year-mnemonic-speech"),
  termImage: document.querySelector("#term-image"),
  termImageContent: document.querySelector("#term-image-content"),
  termImageCaption: document.querySelector("#term-image-caption"),
  termImageCreator: document.querySelector("#term-image-creator"),
  termImageLicense: document.querySelector("#term-image-license"),
  termTags: document.querySelector("#term-tags"),
  overviewSpeech: document.querySelector("#overview-speech"),
  actionDock: document.querySelector("#action-dock"),
  actionButtons: document.querySelector("#action-buttons"),
  studyStop: document.querySelector("#study-stop"),
  backAction: document.querySelector("#back-action"),
  nextAction: document.querySelector("#next-action"),
  ratingButtons: document.querySelector("#rating-buttons"),
  ratingActions: document.querySelectorAll("[data-rating]"),
  listeningDock: document.querySelector("#listening-dock"),
  listeningRatingButtons: document.querySelector("#listening-rating-buttons"),
  listeningBackAction: document.querySelector("#listening-back-action"),
  listeningToggleAction: document.querySelector("#listening-toggle-action"),
  listeningNextAction: document.querySelector("#listening-next-action"),
  completionCard: document.querySelector("#completion-card"),
  completionEyebrow: document.querySelector("#completion-eyebrow"),
  completionTitle: document.querySelector("#completion-title"),
  completionMessage: document.querySelector("#completion-message"),
  completionReturn: document.querySelector("#completion-return"),
  completionHome: document.querySelector("#completion-home"),
  routineResultSummary: document.querySelector("#routine-result-summary"),
  routineResultPrimaryLabel: document.querySelector("#routine-result-primary-label"),
  routineResultQuestions: document.querySelector("#routine-result-questions"),
  routineResultTime: document.querySelector("#routine-result-time"),
  routineResultTotal: document.querySelector("#routine-result-total"),
  ratingResultSummary: document.querySelector("#rating-result-summary"),
  ratingResultAgain: document.querySelector("#rating-result-again"),
  ratingResultHard: document.querySelector("#rating-result-hard"),
  ratingResultGood: document.querySelector("#rating-result-good"),
  ratingResultEasy: document.querySelector("#rating-result-easy"),
  unlockNotice: document.querySelector("#unlock-notice"),
  listeningPlaybackFeedback: document.querySelector(
    "#listening-playback-feedback",
  ),
};

const state = {
  catalog: null,
  subjectEntries: [],
  activeSubjectId: "",
  deckEntries: [],
  activeDeckId: "",
  activeDeckIds: [],
  loadedDecks: new Map(),
  questionDeckById: new Map(),
  termDeckById: new Map(),
  sessionDatasetVersion: "",
  deckLoadToken: 0,
  subject: null,
  allTerms: [],
  historySpeechReadings: {},
  terms: [],
  termById: new Map(),
  questionById: new Map(),
  questionImages: new Map(),
  progress: createEmptyProgress(),
  reviewSettings: { ...defaultReviewSettings },
  cloudReady: false,
  cloudConnected: false,
  cloudError: "",
  saving: false,
  queue: [],
  currentTask: null,
  sessionTasks: [],
  unseenQuestionIds: new Set(),
  retryQuestionIds: new Set(),
  sessionStartedAt: null,
  activeSession: false,
  savedSessions: createEmptySavedSessions(),
  answerVisible: false,
  shuffleEnabled: false,
  listeningPauseSeconds: 0,
  listeningQuestionIntervalSeconds: 0,
  studyTimeLimitSeconds: defaultStudyTimeLimitSeconds,
  studyRoutineOvertimeSeconds: defaultStudyRoutineOvertimeSeconds,
  routineOvertimeEndsAt: null,
  speechParts: normalizeSpeechParts(),
  setupPreferences: normalizeSetupPreferences(),
  routineRun: null,
  routineStudyDate: "",
  inRoutine: false,
  routineCompletionAction: "",
  routineTransition: null,
  routineVideoStartedAt: 0,
  routineVideoCompleting: false,
  standaloneVideoMode: false,
  studyMode: "memorize",
  listeningPaused: false,
  pendingListeningActivity: null,
  listeningTimer: null,
  listeningRunId: 0,
  selectedStage: "",
  questionAmountMode: "all",
  answeredThisSession: 0,
  ratingCounts: createEmptyRatingCounts(),
  studySeconds: 0,
  screenStudySeconds: 0,
  studyTimeEventId: "",
  studyTimeSavedSeconds: 0,
  unlockMessage: "",
  history: [],
  answerRevealedAt: 0,
  studyMenuOpen: false,
  resumeListeningAfterMenu: false,
};

const historyLimit = 200;
const halfScreenRatingDelay = 400;
let setupPreferenceSave = Promise.resolve();
let setupPreferenceSaveVersion = 0;
let speechPartsSaveVersion = 0;
let speechPartNoticeTimer = null;
let listeningPlaybackFeedbackTimer = null;
let startingStudy = false;
let studySessionSave = Promise.resolve();
let studySessionSaveVersion = 0;
let pendingReviewTimer = null;
let studyClockTimer = null;
let studyClockLastTick = 0;
let studyTimeSave = Promise.resolve();
let listeningTouchStart = null;
let suppressNextListeningClick = false;
let studyMenuLastFocused = null;
let routineVideoPlayer = null;
let routineVideoPlayerLoadId = 0;
let youtubePlayerApiPromise = null;
const speechController = createSpeechController({
  requestCloudAudio: requestCloudSpeech,
  getSettings: loadSpeechSettings,
  getHistoryReadings: () => state.historySpeechReadings,
  onTargetChange: updateSpeechButtons,
});
const ratingSoundPlayer = createRatingSoundPlayer();
const loadedRatingSoundVersions = new Map();

async function syncRatingSoundSettings(settings = {}) {
  ratingSoundPlayer.setVolume(
    normalizeRatingSoundVolume(settings.ratingSoundVolume),
  );
  const sounds = normalizeRatingSounds(settings.ratingSounds);
  await Promise.all(
    ratingSoundKeys.map(async (rating) => {
      const metadata = sounds[rating];
      if (!metadata) {
        loadedRatingSoundVersions.delete(rating);
        ratingSoundPlayer.clearCustomSound(rating);
        return;
      }
      if (loadedRatingSoundVersions.get(rating) === metadata.updatedAt) {
        return;
      }
      try {
        const audio = await requestCloudRatingSound(rating);
        await ratingSoundPlayer.setCustomSound(rating, await audio.arrayBuffer());
        loadedRatingSoundVersions.set(rating, metadata.updatedAt);
      } catch {
        loadedRatingSoundVersions.delete(rating);
        ratingSoundPlayer.clearCustomSound(rating);
      }
    }),
  );
}

const listeningModes = new Set(["listen-answer"]);
const oneQuestionPerTermMode = "one-per-term";
const studyMenuReviewFields = {
  againSeconds: [elements.studyMenuAgainValue, elements.studyMenuAgainUnit],
  hardSeconds: [elements.studyMenuHardValue, elements.studyMenuHardUnit],
  goodSeconds: [elements.studyMenuGoodValue, elements.studyMenuGoodUnit],
  easySeconds: [elements.studyMenuEasyValue, elements.studyMenuEasyUnit],
};
const vocabularySpeechLabels = {
  word: "英語",
  meaning: "日本語",
  "example-english": "例文英語",
  "example-japanese": "例文日本語",
};
const speechPartDefinitions = {
  history: [
    { key: "question", label: "問題" },
    { key: "answer", label: "回答" },
    { key: "mnemonic", label: "語呂合わせ" },
    { key: "explanation", label: "解説" },
  ],
  vocabulary: [
    { key: "word", label: "英語" },
    { key: "meaning", label: "日本語" },
    { key: "exampleEnglish", label: "例文英語" },
    { key: "exampleJapanese", label: "例文日本語" },
  ],
};

function selectedStudyMode() {
  return (
    [...elements.studyModeOptions].find((option) => option.checked)?.value ??
    "memorize"
  );
}

function createEmptySavedSessions() {
  return { memorize: null, "listen-answer": null };
}

function savedSessionForMode(studyMode = selectedStudyMode()) {
  return state.savedSessions?.[studyMode] ??
    state.savedSessions?.memorize ??
    state.savedSessions?.["listen-answer"] ??
    null;
}

function isCompletedListeningSession(session) {
  return Boolean(
    session?.studyMode === "listen-answer" &&
    session.tasks.length > 0 &&
    !session.currentTask &&
    session.queue.length === 0 &&
    session.retryQuestionIds.length === 0
  );
}

function setSavedSessionForMode(_studyMode, session) {
  state.savedSessions = {
    memorize: session,
    "listen-answer": session,
  };
  return session;
}

function supportsOneQuestionPerTerm() {
  return state.subject?.learningType !== "vocabulary";
}

function termUnitLabel(subject = state.subject) {
  return String(subject?.termUnitLabel ?? "語");
}

function availableQuestionStages() {
  const configured = Array.isArray(state.subject?.availableStages)
    ? state.subject.availableStages.filter((stage) =>
        learningStages.includes(stage),
      )
    : [];
  return configured.length > 0 ? configured : learningStages;
}

function selectedQuestionAmountMode() {
  return supportsOneQuestionPerTerm() &&
    elements.questionAmountFilter.value === oneQuestionPerTermMode
    ? oneQuestionPerTermMode
    : "all";
}

function usesOneQuestionPerTerm() {
  return state.questionAmountMode === oneQuestionPerTermMode &&
    supportsOneQuestionPerTerm();
}

function clearPendingReviewTimer() {
  if (pendingReviewTimer !== null) {
    window.clearTimeout(pendingReviewTimer);
    pendingReviewTimer = null;
  }
}

function cloneTask(task) {
  return task ? { ...task } : null;
}

function selectedDeckIds() {
  return [...elements.deckFilter.querySelectorAll('input[type="checkbox"]:checked')]
    .map((input) => input.value)
    .filter((deckId) => state.deckEntries.some((deck) => deck.id === deckId));
}

function deckForQuestion(questionId) {
  return state.questionDeckById.get(questionId) ?? null;
}

function datasetVersionForQuestion(questionId) {
  return deckForQuestion(questionId)?.subject.version ?? state.sessionDatasetVersion;
}

function createEventId() {
  return window.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function routineSubjectTitle(subjectId) {
  return state.subjectEntries.find((subject) => subject.id === subjectId)?.title ??
    subjectId;
}

function routineItemTitle(item) {
  return item?.kind === "video"
    ? item.videoTitle || "覚え歌をランダム再生"
    : routineSubjectTitle(item?.subjectId);
}

function routineItemSummary(item) {
  return item?.kind === "video"
    ? "動画を1本見る"
    : `${item.questionTarget}問`;
}

function syncRoutinePreferences(preferences, studyDate = "") {
  state.setupPreferences = normalizeSetupPreferences(preferences);
  state.routineRun = normalizeStudyRoutineRun(state.setupPreferences.routineRun);
  if (/^\d{4}-\d{2}-\d{2}$/.test(studyDate)) {
    state.routineStudyDate = studyDate;
  }
}

function activeRoutineItem() {
  if (!state.inRoutine) return null;
  const item = currentStudyRoutineItem(state.routineRun);
  return item?.kind === "study" && item.subjectId === state.activeSubjectId
    ? item
    : null;
}

function routineRemainingCount(item = activeRoutineItem()) {
  return item ? Math.max(0, item.questionTarget - item.completedCount) : 0;
}

function routineOvertimeCutoffAt() {
  if (!state.inRoutine || isListeningMode() || !state.routineOvertimeEndsAt) {
    return null;
  }
  const cutoffAt = Date.parse(state.routineOvertimeEndsAt);
  return Number.isFinite(cutoffAt) ? cutoffAt : null;
}

function routineOvertimeReviewTasks(cutoffAt) {
  if (!Number.isFinite(cutoffAt)) return [];
  return state.sessionTasks
    .filter((task) => {
      if (state.unseenQuestionIds.has(task.questionId)) return false;
      const record = state.progress.questions[task.questionId];
      const nextReviewAt = Date.parse(record?.nextReviewAt ?? "");
      return (
        record?.lastAnsweredAt &&
        Number.isFinite(nextReviewAt) &&
        nextReviewAt <= cutoffAt
      );
    })
    .sort((left, right) => {
      const leftAt = Date.parse(
        state.progress.questions[left.questionId]?.nextReviewAt ?? "",
      );
      const rightAt = Date.parse(
        state.progress.questions[right.questionId]?.nextReviewAt ?? "",
      );
      return leftAt - rightAt;
    })
    .map(cloneTask);
}

function hasPendingRoutineOvertimeReview() {
  return (
    routineOvertimeCutoffAt() !== null &&
    Boolean(state.currentTask || state.queue.length > 0)
  );
}

function clearRoutineOvertime() {
  state.routineOvertimeEndsAt = null;
}

function startRoutineOvertimeIfNeeded(rating) {
  const item = activeRoutineItem();
  const overtimeSeconds = normalizeStudyRoutineOvertimeSeconds(
    state.studyRoutineOvertimeSeconds,
  );
  if (
    !item ||
    item.overtimePending ||
    routineRemainingCount(item) !== 1 ||
    overtimeSeconds === 0 ||
    !countsTowardStudyRoutine(rating)
  ) {
    return false;
  }
  const cutoffAt = Date.now() + overtimeSeconds * 1000;
  const reviewTasks = routineOvertimeReviewTasks(cutoffAt);
  if (reviewTasks.length === 0) return false;
  state.routineOvertimeEndsAt = new Date(cutoffAt).toISOString();
  state.activeSession = true;
  state.currentTask = null;
  state.queue = reviewTasks;
  state.currentTask = state.queue.shift() ?? null;
  return true;
}

function renderRoutineDashboard() {
  const run = normalizeStudyRoutineRun(state.routineRun);
  const activeItem = currentStudyRoutineItem(run);
  const plan = run?.items ?? state.setupPreferences.routinePlan;
  const totals = run
    ? studyRoutineTotals(run)
    : plan.reduce(
        (summary, item) => ({
          ...summary,
          target: summary.target + (item.kind === "study" ? item.questionTarget : 0),
          totalItems: summary.totalItems + 1,
          totalVideos: summary.totalVideos + (item.kind === "video" ? 1 : 0),
        }),
        { completed: 0, target: 0, completedItems: 0, totalItems: 0, totalVideos: 0 },
      );
  const completed = Boolean(run && run.currentIndex >= run.items.length);
  const previousDay = Boolean(
    activeItem &&
    state.routineStudyDate &&
    run.studyDate !== state.routineStudyDate,
  );
  const connected = state.cloudConnected && Boolean(state.routineStudyDate);

  elements.startRoutine.disabled = !connected || plan.length === 0;
  elements.continueRoutine.disabled = !connected || !activeItem;
  elements.continueRoutine.classList.toggle("is-hidden", !activeItem);
  elements.startRoutine.textContent = run
    ? completed
      ? "もう一度1番から始める"
      : "1番からやり直す"
    : "1番から始める";
  elements.continueRoutine.textContent = previousDay
    ? "前回の続きを今日進める"
    : "続きから始める";

  if (!connected) {
    elements.routineDashboardTitle.textContent = "今日の順番で学習する";
    elements.routineDashboardSummary.textContent =
      "設定ページでCloudflareへ接続すると、毎日のメニューを開始できます。";
  } else if (completed) {
    elements.routineDashboardTitle.textContent = "メニューをすべて完了しました";
    elements.routineDashboardSummary.textContent =
      `${run.items.length}項目・${totals.target}問・動画${totals.totalVideos}本をすべて進めました。`;
  } else if (activeItem && previousDay) {
    elements.routineDashboardTitle.textContent = "新しい学習日になりました";
    elements.routineDashboardSummary.textContent = activeItem.kind === "video"
      ? `1番から始めるか、前回の${run.currentIndex + 1}番「${routineItemTitle(activeItem)}」から続けるか選べます。`
      : `1番から始めるか、前回の${run.currentIndex + 1}番「${routineItemTitle(activeItem)}」${activeItem.completedCount}／${activeItem.questionTarget}問から続けるか選べます。`;
  } else if (activeItem) {
    elements.routineDashboardTitle.textContent =
      `${run.currentIndex + 1}番「${routineItemTitle(activeItem)}」の途中です`;
    elements.routineDashboardSummary.textContent = activeItem.kind === "video"
      ? "選ばれた覚え歌を視聴すると次へ進みます。"
      : `${activeItem.completedCount}／${activeItem.questionTarget}問完了・残り${routineRemainingCount(activeItem)}問です。`;
  } else {
    elements.routineDashboardTitle.textContent = "今日の順番で学習する";
    elements.routineDashboardSummary.textContent =
      `${plan.length}項目・合計${totals.target}問・動画${totals.totalVideos}本のメニューです。`;
  }

  const completedUnits = run
    ? run.items.reduce(
        (sum, item) => sum + (item.kind === "video"
          ? item.completed ? 1 : 0
          : item.completedCount / item.questionTarget),
        0,
      )
    : 0;
  const percent = plan.length > 0 ? (completedUnits / plan.length) * 100 : 0;
  elements.routineDashboardProgress.style.width = `${Math.min(100, percent)}%`;
  const previewStart = activeItem ? run.currentIndex : 0;
  const previewItems = plan.slice(previewStart, previewStart + 6);
  elements.routineDashboardList.replaceChildren(
    ...previewItems.map((item, index) => {
      const listItem = document.createElement("li");
      listItem.classList.toggle("is-current", index === 0 && Boolean(activeItem));
      listItem.textContent =
        `${previewStart + index + 1}. ${routineItemTitle(item)} ${routineItemSummary(item)}`;
      return listItem;
    }),
  );
}

function renderRoutineSetupContext() {
  const item = activeRoutineItem();
  elements.routineSetupBanner.classList.toggle("is-hidden", !item);
  elements.routineProgress.classList.toggle("is-hidden", !item);
  if (!item) return;
  const run = normalizeStudyRoutineRun(state.routineRun);
  elements.routineSetupTitle.textContent =
    `毎日のメニュー ${run.currentIndex + 1}／${run.items.length}｜${routineSubjectTitle(item.subjectId)}`;
  elements.routineSetupProgress.textContent =
    `${item.completedCount}／${item.questionTarget}問完了・残り${routineRemainingCount(item)}問。今回のデッキと学習方法を選んでください。`;
  elements.routineProgress.textContent =
    `メニュー ${item.completedCount} / ${item.questionTarget}問`;
}

async function persistRoutineRun(run) {
  const saved = await saveCloudStudyRoutine({ routineRun: run });
  syncRoutinePreferences(saved.setupPreferences, saved.studyDate);
  return state.routineRun;
}

function restoreRoutineRun(run) {
  state.routineRun = normalizeStudyRoutineRun(run);
  state.setupPreferences = normalizeSetupPreferences({
    ...state.setupPreferences,
    routineRun: state.routineRun,
  });
}

function recordActiveRoutineQuestion(
  questionId,
  studySeconds = 0,
  rating = "",
  options = {},
) {
  const item = activeRoutineItem();
  if (!item) return null;
  const change = recordStudyRoutineQuestion(
    state.routineRun,
    state.activeSubjectId,
    datasetVersionForQuestion(questionId),
    questionId,
    studySeconds,
    rating,
    options,
  );
  if (!change.changed) return change;
  restoreRoutineRun(change.run);
  return change;
}

function renderRatingResult(value = state.ratingCounts) {
  const counts = normalizeRatingCounts(value);
  elements.ratingResultSummary.classList.remove("is-hidden");
  elements.ratingResultAgain.textContent = `${counts.again}回`;
  elements.ratingResultHard.textContent = `${counts.hard}回`;
  elements.ratingResultGood.textContent = `${counts.good}回`;
  elements.ratingResultEasy.textContent = `${counts.easy}回`;
}

function showRoutineStepCompletion(change) {
  clearRoutineOvertime();
  stopListeningSequence();
  stopStudyClock();
  state.listeningPaused = true;
  state.routineTransition = change;
  state.routineCompletionAction = change.nextItem ? "next" : "done";
  elements.contextCard.classList.add("is-hidden");
  elements.questionCard.classList.add("is-hidden");
  elements.actionDock.classList.add("is-hidden");
  elements.listeningDock.classList.add("is-hidden");
  elements.completionCard.classList.remove("is-hidden");
  elements.completionReturn.classList.remove("is-hidden");
  elements.routineResultSummary.classList.remove("is-hidden");
  renderRatingResult(change.completedItem.ratingCounts);
  elements.routineResultPrimaryLabel.textContent = "進めた問題";
  elements.completionEyebrow.textContent = "メニューの1項目を完了";
  elements.completionTitle.textContent =
    `${routineSubjectTitle(change.completedItem.subjectId)}を${change.completedItem.questionTarget}問進めました`;
  const totals = studyRoutineTotals(change.run);
  elements.routineResultQuestions.textContent =
    `${change.completedItem.completedCount}問`;
  elements.routineResultTime.textContent =
    formatStudyDuration(change.completedItem.studySeconds);
  elements.routineResultTotal.textContent =
    `${totals.completed} / ${totals.target}問`;
  if (change.nextItem) {
    elements.completionMessage.textContent = change.nextItem.kind === "video"
      ? "次は登録動画から重複なく選ばれた覚え歌を見ます。"
      : `次は${routineSubjectTitle(change.nextItem.subjectId)}を${change.nextItem.questionTarget}問進めます。開始前にデッキや学習方法を選べます。`;
    elements.completionReturn.textContent = "次の学習内容を選ぶ";
    elements.completionHome.classList.remove("is-hidden");
  } else {
    elements.completionEyebrow.textContent = "毎日のメニュー完了";
    elements.completionMessage.textContent =
      `${change.run.items.length}項目・${totals.target}問・動画${totals.totalVideos}本をすべて進めました。`;
    elements.completionReturn.textContent = "科目選択へ戻る";
    elements.completionHome.classList.add("is-hidden");
  }
}

function destroyRoutineVideoPlayer() {
  routineVideoPlayerLoadId += 1;
  if (routineVideoPlayer?.destroy) {
    routineVideoPlayer.destroy();
  }
  routineVideoPlayer = null;
  elements.routineVideoPlayerFrame.replaceChildren();
}

function loadYouTubePlayerApi() {
  if (globalThis.YT?.Player) return Promise.resolve(globalThis.YT);
  if (youtubePlayerApiPromise) return youtubePlayerApiPromise;
  youtubePlayerApiPromise = new Promise((resolve, reject) => {
    const previousReady = globalThis.onYouTubeIframeAPIReady;
    globalThis.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      resolve(globalThis.YT);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => reject(new Error("YouTubeの再生機能を読み込めませんでした。"));
    document.head.append(script);
  });
  return youtubePlayerApiPromise;
}

async function createRoutineVideoPlayer(video) {
  const loadId = ++routineVideoPlayerLoadId;
  const holder = document.createElement("div");
  holder.id = `routine-video-player-${loadId}`;
  elements.routineVideoPlayerFrame.replaceChildren(holder);
  const YT = await loadYouTubePlayerApi();
  if (loadId !== routineVideoPlayerLoadId) return;
  routineVideoPlayer = new YT.Player(holder, {
    host: "https://www.youtube-nocookie.com",
    videoId: video.youtubeId,
    playerVars: {
      playsinline: 1,
      rel: 0,
      enablejsapi: 1,
      origin: window.location.origin,
    },
    events: {
      onStateChange(event) {
        if (event.data === YT.PlayerState.ENDED) {
          if (state.standaloneVideoMode) {
            elements.routineVideoMessage.textContent =
              "視聴が終わりました。別の動画を選ぶか、科目選択へ戻れます。";
          } else {
            void completeCurrentRoutineVideo();
          }
        }
      },
      onError() {
        elements.routineVideoMessage.textContent = state.standaloneVideoMode
          ? "アプリ内で再生できません。YouTubeで開くか、別の動画を選んでください。"
          : "アプリ内で再生できません。YouTubeで開くか、視聴完了ボタンで次へ進めます。";
        elements.routineVideoMessage.classList.add("is-error");
      },
    },
  });
}

function showRoutineVideoCompletion(change) {
  const totals = studyRoutineTotals(change.run);
  state.activeSession = false;
  state.currentTask = null;
  state.routineTransition = change;
  state.routineCompletionAction = change.nextItem ? "next" : "done";
  showOnly(elements.studyShell);
  elements.contextCard.classList.add("is-hidden");
  elements.questionCard.classList.add("is-hidden");
  elements.actionDock.classList.add("is-hidden");
  elements.listeningDock.classList.add("is-hidden");
  elements.completionCard.classList.remove("is-hidden");
  elements.completionReturn.classList.remove("is-hidden");
  elements.routineResultSummary.classList.remove("is-hidden");
  elements.ratingResultSummary.classList.add("is-hidden");
  elements.completionEyebrow.textContent = change.nextItem
    ? "メニューの動画を完了"
    : "毎日のメニュー完了";
  elements.completionTitle.textContent = "覚え歌を1本視聴しました";
  elements.routineResultPrimaryLabel.textContent = "視聴した動画";
  elements.routineResultQuestions.textContent = "1本";
  elements.routineResultTime.textContent =
    formatStudyDuration(change.completedItem.studySeconds);
  elements.routineResultTotal.textContent =
    `${totals.completedItems} / ${totals.totalItems}項目`;
  if (change.nextItem) {
    elements.completionMessage.textContent = change.nextItem.kind === "video"
      ? "次も登録動画から重複なく選ばれた覚え歌を見ます。"
      : `次は${routineSubjectTitle(change.nextItem.subjectId)}を${change.nextItem.questionTarget}問進めます。`;
    elements.completionReturn.textContent = "次の学習内容へ進む";
    elements.completionHome.classList.remove("is-hidden");
  } else {
    elements.completionMessage.textContent =
      `${change.run.items.length}項目・${totals.target}問・動画${totals.totalVideos}本をすべて進めました。`;
    elements.completionReturn.textContent = "科目選択へ戻る";
    elements.completionHome.classList.add("is-hidden");
  }
}

async function completeCurrentRoutineVideo() {
  if (state.routineVideoCompleting) return;
  const elapsedSeconds = state.routineVideoStartedAt > 0
    ? Math.max(0, Math.round((Date.now() - state.routineVideoStartedAt) / 1000))
    : 0;
  const change = completeStudyRoutineVideo(state.routineRun, elapsedSeconds);
  if (!change.changed) return;
  state.routineVideoCompleting = true;
  elements.routineVideoComplete.disabled = true;
  elements.routineVideoMessage.classList.remove("is-error");
  elements.routineVideoMessage.textContent = "視聴完了をCloudflareへ保存しています。";
  try {
    await persistRoutineRun(change.run);
    destroyRoutineVideoPlayer();
    showRoutineVideoCompletion({
      ...change,
      run: state.routineRun,
      nextItem: currentStudyRoutineItem(state.routineRun),
    });
  } catch (error) {
    elements.routineVideoMessage.textContent = error.message;
    elements.routineVideoMessage.classList.add("is-error");
  } finally {
    state.routineVideoCompleting = false;
    elements.routineVideoComplete.disabled = false;
  }
}

async function showRoutineVideoStep() {
  stopListeningSequence();
  stopStudyClock();
  clearPendingReviewTimer();
  const assignment = assignStudyRoutineVideo(
    state.routineRun,
    state.setupPreferences.routineVideos,
    state.setupPreferences.routineVideoShuffle,
  );
  if (!assignment.video) {
    throw new Error("設定ページでランダム再生する動画を1本以上登録してください。");
  }
  if (assignment.changed) {
    const saved = await saveCloudStudyRoutine({
      routineRun: assignment.run,
      routineVideoShuffle: assignment.videoShuffle,
    });
    syncRoutinePreferences(saved.setupPreferences, saved.studyDate);
  }
  const item = currentStudyRoutineItem(state.routineRun);
  const video = assignment.changed
    ? {
        youtubeId: item.youtubeId,
        title: item.videoTitle,
        authorName: item.videoAuthorName,
      }
    : assignment.video;
  state.routineVideoStartedAt = Date.now();
  state.routineVideoCompleting = false;
  state.standaloneVideoMode = false;
  state.activeSession = false;
  state.currentTask = null;
  state.queue = [];
  elements.subjectName.textContent = "覚え歌";
  elements.routineVideoEyebrow.textContent =
    `毎日のメニュー ${state.routineRun.currentIndex + 1}／${state.routineRun.items.length}｜覚え歌`;
  elements.routineVideoTitle.textContent = video.title;
  elements.routineVideoAuthor.textContent = video.authorName;
  elements.routineVideoMessage.textContent =
    "再生ボタンを押して動画を見てください。最後まで再生すると自動で完了します。";
  elements.routineVideoMessage.classList.remove("is-error");
  elements.routineVideoYoutubeLink.href =
    `https://www.youtube.com/watch?v=${video.youtubeId}`;
  elements.routineVideoComplete.disabled = false;
  elements.routineVideoComplete.textContent = "視聴を完了して次へ";
  elements.routineVideoHome.textContent = "トップへ戻る";
  showOnly(elements.routineVideoPanel);
  window.scrollTo({ top: 0, behavior: "smooth" });
  try {
    await createRoutineVideoPlayer(video);
  } catch (error) {
    elements.routineVideoMessage.textContent =
      `${error.message} YouTubeで開くか、視聴完了ボタンで次へ進めます。`;
    elements.routineVideoMessage.classList.add("is-error");
  }
}

async function showStandaloneRandomVideo() {
  if (!state.cloudConnected) {
    throw new Error(
      "設定ページでCloudflareへ接続すると、覚え歌をランダム再生できます。",
    );
  }
  stopListeningSequence();
  stopStudyClock();
  clearPendingReviewTimer();
  destroyRoutineVideoPlayer();
  showOnly(elements.loadingPanel);
  const draw = drawStudyRoutineVideo(
    state.setupPreferences.routineVideos,
    state.setupPreferences.routineVideoShuffle,
  );
  if (!draw.video) {
    throw new Error("設定ページでランダム再生する動画を1本以上登録してください。");
  }
  const saved = await saveCloudStudyRoutine({
    routineVideoShuffle: draw.videoShuffle,
  });
  syncRoutinePreferences(saved.setupPreferences, saved.studyDate);
  state.inRoutine = false;
  state.standaloneVideoMode = true;
  state.routineVideoStartedAt = 0;
  state.routineVideoCompleting = false;
  state.activeSession = false;
  state.currentTask = null;
  state.queue = [];
  elements.subjectName.textContent = "覚え歌";
  elements.routineVideoEyebrow.textContent = "科目選択｜覚え歌をランダム再生";
  elements.routineVideoTitle.textContent = draw.video.title;
  elements.routineVideoAuthor.textContent = draw.video.authorName;
  elements.routineVideoMessage.textContent =
    "再生ボタンを押して動画を見てください。一巡するまで同じ動画は選ばれません。";
  elements.routineVideoMessage.classList.remove("is-error");
  elements.routineVideoYoutubeLink.href =
    `https://www.youtube.com/watch?v=${draw.video.youtubeId}`;
  elements.routineVideoComplete.disabled = false;
  elements.routineVideoComplete.textContent = "別の動画をランダム再生";
  elements.routineVideoHome.textContent = "科目選択へ戻る";
  showOnly(elements.routineVideoPanel);
  window.scrollTo({ top: 0, behavior: "smooth" });
  try {
    await createRoutineVideoPlayer(draw.video);
  } catch (error) {
    elements.routineVideoMessage.textContent =
      `${error.message} YouTubeで開くか、別の動画を選んでください。`;
    elements.routineVideoMessage.classList.add("is-error");
  }
}

async function launchRoutineCurrentStep() {
  const item = currentStudyRoutineItem(state.routineRun);
  if (!item) {
    showSubjectSelection();
    return;
  }
  state.inRoutine = true;
  state.routineCompletionAction = "";
  state.routineTransition = null;
  if (item.kind === "video") {
    await showRoutineVideoStep();
    return;
  }
  showOnly(elements.loadingPanel);
  await activateSubject(item.subjectId);
  showOnly(elements.setupPanel);
  renderRoutineSetupContext();
  queueVisibleSetupPreferenceSave();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function startRoutineFromBeginning() {
  if (!state.cloudConnected || !state.routineStudyDate) return;
  if (
    state.routineRun &&
    currentStudyRoutineItem(state.routineRun) &&
    !window.confirm("現在の毎日のメニューを終了し、1番からやり直しますか？")
  ) {
    return;
  }
  elements.startRoutine.disabled = true;
  try {
    const run = createStudyRoutineRun(
      state.setupPreferences.routinePlan,
      state.routineStudyDate,
    );
    await persistRoutineRun(run);
    await launchRoutineCurrentStep();
  } catch (error) {
    elements.errorMessage.textContent = error.message;
    showOnly(elements.errorPanel);
  }
}

async function continueRoutine() {
  const current = normalizeStudyRoutineRun(state.routineRun);
  if (!currentStudyRoutineItem(current)) return;
  elements.continueRoutine.disabled = true;
  try {
    if (current.studyDate !== state.routineStudyDate) {
      await persistRoutineRun(
        continueStudyRoutineOnDate(current, state.routineStudyDate),
      );
    }
    await launchRoutineCurrentStep();
  } catch (error) {
    elements.errorMessage.textContent = error.message;
    showOnly(elements.errorPanel);
  }
}

function updateStudyTimeDisplay() {
  elements.studyTime.textContent = formatStudyDuration(state.studySeconds);
}

function canCountStudyTime({ includeHidden = false } = {}) {
  return (
    state.activeSession &&
    Boolean(state.currentTask) &&
    document.body.classList.contains("is-studying") &&
    (includeHidden || !document.hidden) &&
    !state.saving &&
    state.screenStudySeconds < state.studyTimeLimitSeconds
  );
}

function tickStudyClock(
  now = window.performance.now(),
  { includeHidden = false } = {},
) {
  if (!canCountStudyTime({ includeHidden })) {
    studyClockLastTick = now;
    return;
  }
  const elapsedSeconds = Math.floor((now - studyClockLastTick) / 1000);
  if (elapsedSeconds < 1) return;
  studyClockLastTick += elapsedSeconds * 1000;
  const next = addStudySeconds(
    state.studySeconds,
    state.screenStudySeconds,
    elapsedSeconds,
    state.studyTimeLimitSeconds,
  );
  state.studySeconds = next.totalSeconds;
  state.screenStudySeconds = next.screenSeconds;
  updateStudyTimeDisplay();
  if (state.screenStudySeconds >= state.studyTimeLimitSeconds) {
    stopStudyClock({ capture: false });
    void queueCurrentStudyTimeSave().catch((error) => {
      state.unlockMessage = error.message;
    });
  }
}

function startStudyClock() {
  if (
    studyClockTimer !== null ||
    !state.activeSession ||
    !state.currentTask ||
    state.screenStudySeconds >= state.studyTimeLimitSeconds
  ) {
    updateStudyTimeDisplay();
    return;
  }
  studyClockLastTick = window.performance.now();
  studyClockTimer = window.setInterval(() => tickStudyClock(), 250);
  updateStudyTimeDisplay();
}

function stopStudyClock({ capture = true, includeHidden = false } = {}) {
  if (capture && studyClockTimer !== null) {
    tickStudyClock(window.performance.now(), { includeHidden });
  }
  if (studyClockTimer !== null) {
    window.clearInterval(studyClockTimer);
    studyClockTimer = null;
  }
}

function startNewStudyScreen() {
  stopStudyClock({ capture: false });
  state.screenStudySeconds = 0;
  state.studyTimeSavedSeconds = 0;
  state.studyTimeEventId = state.activeSession && state.currentTask
    ? createEventId()
    : "";
  updateStudyTimeDisplay();
  startStudyClock();
}

function ensureCurrentStudyScreen() {
  if (!state.activeSession || !state.currentTask) {
    startNewStudyScreen();
    return;
  }
  if (!state.studyTimeEventId) {
    startNewStudyScreen();
    return;
  }
  updateStudyTimeDisplay();
  startStudyClock();
}

function setStudyTerms(terms) {
  state.terms = terms;
  state.termById = new Map(state.terms.map((term) => [term.id, term]));
  state.questionById = new Map(
    state.terms.flatMap((term) =>
      learningStages.flatMap((stage) =>
        (term.stages[stage] ?? []).map((question) => [question.id, question]),
      ),
    ),
  );
}

function captureActiveSession() {
  if (!state.activeSession || state.sessionTasks.length === 0) return null;
  return normalizeStudySession({
    schemaVersion: 1,
    studyMode: state.studyMode,
    deckIds: state.activeDeckIds,
    selectedStage: state.selectedStage,
    questionAmountMode: state.questionAmountMode,
    shuffleEnabled: state.shuffleEnabled,
    autoSpeechEnabled: true,
    filters: selectedFilters(),
    termIds: state.terms.map((term) => term.id),
    tasks: state.sessionTasks,
    queue: state.queue,
    currentTask: state.currentTask,
    unseenQuestionIds: [...state.unseenQuestionIds],
    retryQuestionIds: [...state.retryQuestionIds],
    answeredCount: state.answeredThisSession,
    ratingCounts: state.ratingCounts,
    studySeconds: state.studySeconds,
    screenStudySeconds: state.screenStudySeconds,
    savedScreenStudySeconds: state.studyTimeSavedSeconds,
    studyTimeEventId: state.studyTimeEventId,
    answerVisible: state.answerVisible,
    routineOvertimeEndsAt: state.routineOvertimeEndsAt,
    startedAt: state.sessionStartedAt,
  });
}

function createStudyActivity(questionId, eventId = createEventId()) {
  const subjectEntry = state.subjectEntries.find(
    (subject) => subject.id === state.activeSubjectId,
  );
  const deck = deckForQuestion(questionId);
  const deckEntry = deck?.entry ??
    state.deckEntries.find((item) => item.id === state.activeDeckId);
  return {
    eventId,
    subjectId: state.activeSubjectId,
    subjectTitle: subjectEntry?.title ?? state.subject?.title ?? state.activeSubjectId,
    deckId: deckEntry?.id ?? state.activeDeckId,
    deckTitle: deckDisplayLabel(deckEntry),
    studyMode: state.studyMode,
    questionId,
  };
}

function createRatingActivity(questionId) {
  return createStudyActivity(questionId, state.studyTimeEventId || undefined);
}

function captureStudyTimeEntry() {
  if (
    !state.currentTask ||
    !state.studyTimeEventId ||
    state.screenStudySeconds < 1
  ) {
    return null;
  }
  return {
    ...createStudyActivity(
      state.currentTask.questionId,
      state.studyTimeEventId,
    ),
    studySeconds: state.screenStudySeconds,
  };
}

function queueCurrentStudyTimeSave({ keepalive = false } = {}) {
  const timeEntry = captureStudyTimeEntry();
  const activeSession = captureActiveSession();
  if (
    !timeEntry ||
    !activeSession ||
    timeEntry.studySeconds <= state.studyTimeSavedSeconds
  ) {
    return studyTimeSave;
  }
  const session = normalizeStudySession({
    ...activeSession,
    savedScreenStudySeconds: timeEntry.studySeconds,
  });
  const eventId = timeEntry.eventId;
  const savedSeconds = timeEntry.studySeconds;
  const studyMode = session.studyMode;
  const datasetVersion = datasetVersionForQuestion(timeEntry.questionId);
  const sessionDatasetVersion = state.sessionDatasetVersion;
  const saveVersion = ++studySessionSaveVersion;
  studySessionSave = studySessionSave
    .catch(() => {})
    .then(() => saveCloudStudyTime(
      datasetVersion,
      timeEntry,
      session,
      { keepalive, sessionDatasetVersion },
    ))
    .then((saved) => {
      if (state.studyTimeEventId === eventId) {
        state.studyTimeSavedSeconds = Math.max(
          state.studyTimeSavedSeconds,
          savedSeconds,
        );
      }
      if (
        saveVersion === studySessionSaveVersion &&
        state.sessionDatasetVersion === sessionDatasetVersion
      ) {
        setSavedSessionForMode(studyMode, saved.session);
      }
      return saved;
    });
  studyTimeSave = studySessionSave;
  return studyTimeSave;
}

function setupMatchesSession(session, selectedTerms) {
  const filters = selectedFilters();
  const selectedTermIds = new Set(selectedTerms.map((term) => term.id));
  const sessionDeckIds = session?.deckIds?.length
    ? session.deckIds
    : state.activeDeckIds.length === 1
      ? state.activeDeckIds
      : [];
  return (
    session &&
    sessionDeckIds.length === state.activeDeckIds.length &&
    sessionDeckIds.every((deckId) => state.activeDeckIds.includes(deckId)) &&
    session.selectedStage === elements.questionStyleFilter.value &&
    session.questionAmountMode === selectedQuestionAmountMode() &&
    session.shuffleEnabled === elements.setupShuffle.checked &&
    session.filters.macroRegion === filters.macroRegion &&
    session.filters.regionDetail === filters.regionDetail &&
    session.filters.category === filters.category &&
    session.termIds.length === selectedTermIds.size &&
    session.termIds.every((termId) => selectedTermIds.has(termId))
  );
}

function setSetupControlsFromSession(session) {
  setAvailableSelectValue(elements.macroRegionFilter, session.filters.macroRegion);
  updateRegionDetailOptions();
  setAvailableSelectValue(elements.regionDetailFilter, session.filters.regionDetail);
  setAvailableSelectValue(elements.categoryFilter, session.filters.category);
  setAvailableSelectValue(elements.questionStyleFilter, session.selectedStage);
  setAvailableSelectValue(elements.questionAmountFilter, session.questionAmountMode);
  for (const option of elements.studyModeOptions) {
    option.checked = option.value === session.studyMode;
  }
  elements.setupShuffle.checked = session.shuffleEnabled;
}

function restoreActiveSession(value, { updateControls = true } = {}) {
  const session = normalizeStudySession(value);
  if (!session) return false;
  const sessionDeckIds = session.deckIds.length
    ? session.deckIds
    : state.activeDeckIds.length === 1
      ? state.activeDeckIds
      : [];
  if (
    sessionDeckIds.length !== state.activeDeckIds.length ||
    !sessionDeckIds.every((deckId) => state.activeDeckIds.includes(deckId))
  ) {
    return false;
  }
  const termIds = new Set(session.termIds);
  const terms = state.allTerms.filter((term) => termIds.has(term.id));
  if (terms.length === 0) return false;
  setStudyTerms(terms);
  const taskByQuestionId = new Map(
    session.tasks
      .filter(
        (task) =>
          state.termById.has(task.termId) && state.questionById.has(task.questionId),
      )
      .map((task) => [task.questionId, cloneTask(task)]),
  );
  if (taskByQuestionId.size === 0) return false;
  const currentTask = session.currentTask
    ? taskByQuestionId.get(session.currentTask.questionId) ?? null
    : null;
  const queuedIds = new Set();
  state.queue = session.queue.flatMap((task) => {
    const restored = taskByQuestionId.get(task.questionId);
    if (
      !restored ||
      restored.questionId === currentTask?.questionId ||
      queuedIds.has(restored.questionId)
    ) {
      return [];
    }
    queuedIds.add(restored.questionId);
    return [cloneTask(restored)];
  });
  state.sessionTasks = [...taskByQuestionId.values()].map(cloneTask);
  state.currentTask = cloneTask(currentTask);
  state.unseenQuestionIds = new Set(
    session.unseenQuestionIds.filter((questionId) => taskByQuestionId.has(questionId)),
  );
  state.retryQuestionIds = new Set(
    session.retryQuestionIds.filter((questionId) => taskByQuestionId.has(questionId)),
  );
  state.studyMode = session.studyMode;
  state.selectedStage = session.selectedStage;
  state.questionAmountMode = session.questionAmountMode;
  state.shuffleEnabled = session.shuffleEnabled;
  state.answeredThisSession = session.answeredCount;
  state.ratingCounts = normalizeRatingCounts(session.ratingCounts);
  state.studySeconds = session.studySeconds;
  state.screenStudySeconds = Math.min(
    session.screenStudySeconds,
    state.studyTimeLimitSeconds,
  );
  state.studyTimeEventId = session.studyTimeEventId;
  state.studyTimeSavedSeconds = Math.min(
    session.savedScreenStudySeconds,
    state.screenStudySeconds,
  );
  state.answerVisible = session.answerVisible && session.studyMode === "memorize";
  state.routineOvertimeEndsAt = session.routineOvertimeEndsAt;
  state.sessionStartedAt = session.startedAt ?? new Date().toISOString();
  state.activeSession = true;
  setSavedSessionForMode(session.studyMode, session);
  state.history = [];
  state.pendingListeningActivity = null;
  state.answerRevealedAt = 0;
  if (updateControls) setSetupControlsFromSession(session);
  return true;
}

function queueActiveSessionSave() {
  const session = captureActiveSession();
  if (!session) return Promise.resolve(null);
  const studyMode = session.studyMode;
  const sessionDatasetVersion = state.sessionDatasetVersion;
  const saveVersion = ++studySessionSaveVersion;
  studySessionSave = studySessionSave
    .catch(() => {})
    .then(async () => {
      const saved = await saveCloudStudySession(sessionDatasetVersion, session);
      if (
        saveVersion === studySessionSaveVersion &&
        state.sessionDatasetVersion === sessionDatasetVersion
      ) {
        setSavedSessionForMode(studyMode, saved);
      }
      return saved;
    });
  return studySessionSave;
}

function queueActiveStudyActivity(
  activity,
  { completeSession = false, routineRun } = {},
) {
  const session = captureActiveSession();
  const studyMode = state.studyMode;
  const datasetVersion = datasetVersionForQuestion(activity.questionId);
  const sessionDatasetVersion = state.sessionDatasetVersion;
  const saveVersion = ++studySessionSaveVersion;
  studySessionSave = studySessionSave
    .catch(() => {})
    .then(async () => {
      const saved = await saveCloudStudyActivity(
        datasetVersion,
        activity,
        session,
        { sessionDatasetVersion, completeSession, routineRun },
      );
      if (
        saveVersion === studySessionSaveVersion &&
        state.sessionDatasetVersion === sessionDatasetVersion
      ) {
        setSavedSessionForMode(studyMode, saved.session);
      }
      return saved.session;
    });
  return studySessionSave;
}

function addTasksToActiveSession(tasks, { unseen = true } = {}) {
  const knownIds = new Set(state.sessionTasks.map((task) => task.questionId));
  const added = [];
  for (const task of tasks) {
    if (!task || knownIds.has(task.questionId)) continue;
    const cloned = cloneTask(task);
    state.sessionTasks.push(cloned);
    knownIds.add(cloned.questionId);
    if (unseen) state.unseenQuestionIds.add(cloned.questionId);
    added.push(cloned);
  }
  state.queue = enqueueUniqueTasks(
    state.queue,
    added,
    state.currentTask ? [state.currentTask.questionId] : [],
  );
}

function ensureUnseenTasksQueued() {
  if (routineOvertimeCutoffAt() !== null) return;
  const queuedIds = new Set([
    state.currentTask?.questionId,
    ...state.queue.map((task) => task.questionId),
  ]);
  const missing = state.sessionTasks.filter(
    (task) =>
      state.unseenQuestionIds.has(task.questionId) && !queuedIds.has(task.questionId),
  );
  state.queue.push(...missing.map(cloneTask));
}

function enqueueDueSessionTasks(now = new Date()) {
  if (!state.activeSession || isListeningMode()) return;
  if (routineOvertimeCutoffAt() !== null) return;
  const queuedIds = new Set([
    state.currentTask?.questionId,
    ...state.queue.map((task) => task.questionId),
  ]);
  const dueTasks = state.sessionTasks
    .filter((task) => {
      const record = state.progress.questions[task.questionId];
      return (
        record?.lastAnsweredAt &&
        !queuedIds.has(task.questionId) &&
        isQuestionDue(state.progress, task.questionId, now)
      );
    })
    .sort((left, right) => {
      const leftAt = Date.parse(state.progress.questions[left.questionId]?.nextReviewAt ?? "");
      const rightAt = Date.parse(state.progress.questions[right.questionId]?.nextReviewAt ?? "");
      return leftAt - rightAt;
    });
  state.queue = [...dueTasks.map(cloneTask), ...state.queue];
}

function nextPendingRetryAt() {
  return [...state.retryQuestionIds].reduce((earliest, questionId) => {
    const nextReviewAt = Date.parse(
      state.progress.questions[questionId]?.nextReviewAt ?? "",
    );
    if (!Number.isFinite(nextReviewAt)) return earliest;
    return earliest === null ? nextReviewAt : Math.min(earliest, nextReviewAt);
  }, null);
}

function schedulePendingReview() {
  clearPendingReviewTimer();
  if (
    !state.activeSession ||
    isListeningMode() ||
    state.currentTask ||
    state.retryQuestionIds.size === 0
  ) {
    return;
  }
  const nextReviewAt = nextPendingRetryAt();
  if (nextReviewAt === null) return;
  const waitMilliseconds = Math.max(0, nextReviewAt - Date.now());
  pendingReviewTimer = window.setTimeout(() => {
    pendingReviewTimer = null;
    enqueueDueSessionTasks();
    state.currentTask = state.queue.shift() ?? null;
    if (state.currentTask) {
      state.answerVisible = false;
      startNewStudyScreen();
      void queueActiveSessionSave().catch((error) => {
        state.unlockMessage = error.message;
      });
      renderQuestion();
      autoSpeakQuestion();
    } else {
      schedulePendingReview();
    }
  }, Math.min(waitMilliseconds, 2_147_000_000));
}

function speechPartSubjectKey() {
  return state.subject?.learningType === "vocabulary"
    ? "vocabulary"
    : "history";
}

function currentSpeechPartDefinitions() {
  return speechPartDefinitions[speechPartSubjectKey()];
}

function currentSpeechPartSettings() {
  return state.speechParts[speechPartSubjectKey()];
}

function listeningContentLabel() {
  const settings = currentSpeechPartSettings();
  return currentSpeechPartDefinitions()
    .filter(({ key }) => settings[key])
    .map(({ label }) => label)
    .join("＋");
}

function vocabularySpeechPartKey(group) {
  return {
    word: "word",
    meaning: "meaning",
    "example-english": "exampleEnglish",
    "example-japanese": "exampleJapanese",
  }[group];
}

function currentQuestionSpeechEnabled(question = currentQuestion()) {
  const settings = currentSpeechPartSettings();
  if (state.subject?.learningType !== "vocabulary") {
    return settings.question;
  }
  const group = vocabularySpeechLayout(question)?.question;
  return Boolean(settings[vocabularySpeechPartKey(group)]);
}

function isListeningMode() {
  return listeningModes.has(state.studyMode);
}

function clearListeningTimer() {
  if (state.listeningTimer !== null) {
    window.clearTimeout(state.listeningTimer);
    state.listeningTimer = null;
  }
}

function stopListeningSequence() {
  state.listeningRunId += 1;
  clearListeningTimer();
  speechController.stop();
}

function hideListeningPlaybackFeedback() {
  if (listeningPlaybackFeedbackTimer !== null) {
    window.clearTimeout(listeningPlaybackFeedbackTimer);
    listeningPlaybackFeedbackTimer = null;
  }
  elements.listeningPlaybackFeedback.classList.add("is-hidden");
}

function showListeningPlaybackFeedback(feedback) {
  if (listeningPlaybackFeedbackTimer !== null) {
    window.clearTimeout(listeningPlaybackFeedbackTimer);
  }
  const isPlayFeedback = feedback === "play";
  elements.listeningPlaybackFeedback.dataset.feedback = isPlayFeedback
    ? "play"
    : "pause";
  elements.listeningPlaybackFeedback.textContent = isPlayFeedback ? "▶" : "Ⅱ";
  elements.listeningPlaybackFeedback.setAttribute(
    "aria-label",
    isPlayFeedback ? "再生" : "一時停止",
  );
  elements.listeningPlaybackFeedback.classList.remove("is-hidden");
  listeningPlaybackFeedbackTimer = window.setTimeout(() => {
    listeningPlaybackFeedbackTimer = null;
    elements.listeningPlaybackFeedback.classList.add("is-hidden");
  }, 1000);
}

function chooseStudyMenuIntervalUnit(seconds) {
  if (seconds % 86400 === 0) return 86400;
  if (seconds % 3600 === 0) return 3600;
  if (seconds % 60 === 0) return 60;
  return 1;
}

function updateStudyMenuSpeechRateOutput() {
  elements.studyMenuSpeechRateOutput.value =
    `${Number(elements.studyMenuSpeechRate.value).toFixed(2)}倍`;
}

function fillStudyMenuSettings(settings = {}) {
  const reviewSettings = normalizeReviewSettings({
    ...state.reviewSettings,
    ...settings,
  });
  const speechSettings = normalizeSpeechSettings({
    ...loadSpeechSettings(),
    ...settings,
  });
  elements.studyMenuSpeechRate.value = String(speechSettings.rate);
  elements.studyMenuQuestionIntervalSeconds.value = String(
    normalizeListeningQuestionIntervalSeconds(
      settings.listeningQuestionIntervalSeconds ??
        state.listeningQuestionIntervalSeconds,
    ),
  );
  for (const [key, [valueInput, unitSelect]] of Object.entries(
    studyMenuReviewFields,
  )) {
    const unit = chooseStudyMenuIntervalUnit(reviewSettings[key]);
    unitSelect.value = String(unit);
    valueInput.value = String(reviewSettings[key] / unit);
  }
  updateStudyMenuSpeechRateOutput();
}

function readStudyMenuSettings() {
  const reviewSettings = normalizeReviewSettings(
    Object.fromEntries(
      Object.entries(studyMenuReviewFields).map(
        ([key, [valueInput, unitSelect]]) => [
          key,
          Number(valueInput.value) * Number(unitSelect.value),
        ],
      ),
    ),
  );
  const speechSettings = normalizeSpeechSettings({
    ...loadSpeechSettings(),
    rate: Number(elements.studyMenuSpeechRate.value),
  });
  return {
    ...reviewSettings,
    ...speechSettings,
    listeningQuestionIntervalSeconds:
      normalizeListeningQuestionIntervalSeconds(
        elements.studyMenuQuestionIntervalSeconds.value,
      ),
  };
}

function setStudyMenuStatus(message, isError = false) {
  elements.studyMenuStatus.textContent = message;
  elements.studyMenuStatus.classList.toggle("is-error", isError);
}

function openStudyMenu() {
  if (
    state.studyMenuOpen ||
    state.saving ||
    !document.body.classList.contains("is-studying")
  ) {
    return;
  }
  state.studyMenuOpen = true;
  state.resumeListeningAfterMenu =
    isListeningMode() && Boolean(state.currentTask) && !state.listeningPaused;
  studyMenuLastFocused = document.activeElement;
  if (isListeningMode()) {
    state.listeningPaused = true;
    stopListeningSequence();
  } else {
    speechController.stop();
  }
  stopStudyClock();
  fillStudyMenuSettings();
  setStudyMenuStatus("");
  elements.studyMenuLayer.classList.remove("is-hidden");
  elements.studyMenuTrigger.setAttribute("aria-expanded", "true");
  document.body.classList.add("is-study-menu-open");
  window.requestAnimationFrame(() => elements.studyMenuClose.focus());
}

function closeStudyMenu({ resumeStudy = true } = {}) {
  if (!state.studyMenuOpen) return;
  const resumesListening = state.resumeListeningAfterMenu;
  state.studyMenuOpen = false;
  state.resumeListeningAfterMenu = false;
  elements.studyMenuLayer.classList.add("is-hidden");
  elements.studyMenuTrigger.setAttribute("aria-expanded", "false");
  document.body.classList.remove("is-study-menu-open");
  if (resumeStudy && document.body.classList.contains("is-studying")) {
    startStudyClock();
    if (resumesListening) {
      toggleListening();
    }
  }
  if (resumeStudy && studyMenuLastFocused instanceof HTMLElement) {
    studyMenuLastFocused.focus();
  }
  studyMenuLastFocused = null;
}

async function saveStudyMenuSettings() {
  elements.studyMenuSave.disabled = true;
  setStudyMenuStatus("Cloudflareへ保存しています。");
  try {
    const saved = await saveCloudSettings(readStudyMenuSettings());
    state.reviewSettings = normalizeReviewSettings(saved);
    state.listeningQuestionIntervalSeconds =
      normalizeListeningQuestionIntervalSeconds(
        saved.listeningQuestionIntervalSeconds,
      );
    saveSpeechSettings(saved);
    fillStudyMenuSettings(saved);
    updateRatingIntervals();
    setStudyMenuStatus("設定をCloudflareへ保存し、この学習から反映しました。");
  } catch (error) {
    setStudyMenuStatus(`保存できませんでした。${error.message}`, true);
  } finally {
    elements.studyMenuSave.disabled = false;
  }
}

function getConfig() {
  const config = window.ANKI_CONFIG ?? {};
  const dataBaseUrl = String(config.dataBaseUrl ?? "").replace(/\/$/, "");
  const progressApiBaseUrl = String(config.progressApiBaseUrl ?? "").replace(
    /\/$/,
    "",
  );
  if (!dataBaseUrl) {
    throw new Error("Cloudflareの学習データ読込先が設定されていません。");
  }
  if (!progressApiBaseUrl) {
    throw new Error("Cloudflareの学習記録保存先が設定されていません。");
  }
  return {
    dataBaseUrl,
    progressApiBaseUrl,
  };
}

async function fetchJson(relativePath) {
  const { dataBaseUrl } = getConfig();
  const response = await fetch(`${dataBaseUrl}/${relativePath}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`データ取得に失敗しました（${response.status}）。`);
  }
  return response.json();
}

function getDataUrl(relativePath) {
  const { dataBaseUrl } = getConfig();
  return `${dataBaseUrl}/${String(relativePath).replace(/^\/+/, "")}`;
}

async function loadQuestionImages() {
  try {
    const manifest = await fetchJson("term-images.json");
    if (
      manifest.schemaVersion !== 2 ||
      !Array.isArray(manifest.assets) ||
      !Array.isArray(manifest.assignments)
    ) {
      throw new Error("関連画像データの形式が正しくありません。");
    }
    const assets = new Map(
      manifest.assets
        .filter((image) => image?.id && image?.path)
        .map((image) => [image.id, image]),
    );
    return new Map(
      manifest.assignments
        .filter(
          (assignment) =>
            assignment?.questionId && assets.has(assignment?.assetId),
        )
        .map((assignment) => [assignment.questionId, assets.get(assignment.assetId)]),
    );
  } catch (error) {
    console.warn("関連画像を読み込めませんでした。画像なしで学習を続けます。", error);
    return new Map();
  }
}

function showOnly(panel) {
  if (panel !== elements.studyShell && state.studyMenuOpen) {
    closeStudyMenu({ resumeStudy: false });
  }
  if (panel !== elements.studyShell) {
    speechController.stop();
    stopStudyClock();
    hideListeningPlaybackFeedback();
  }
  if (panel !== elements.routineVideoPanel && routineVideoPlayer) {
    destroyRoutineVideoPlayer();
  }
  document.body.classList.toggle("is-studying", panel === elements.studyShell);
  document.body.classList.toggle(
    "is-listening",
    panel === elements.studyShell && isListeningMode(),
  );
  [
    elements.loadingPanel,
    elements.subjectPanel,
    elements.setupPanel,
    elements.routineVideoPanel,
    elements.studyShell,
    elements.errorPanel,
  ].forEach((candidate) =>
    candidate.classList.toggle("is-hidden", candidate !== panel),
  );
  if (panel === elements.studyShell) {
    startStudyClock();
  }
}

function renderEmphasizedText(element, text) {
  const parts = String(text ?? "").split("**");
  element.replaceChildren(
    ...parts.map((part, index) => {
      if (index % 2 === 0) {
        return document.createTextNode(part);
      }
      const strong = document.createElement("strong");
      strong.textContent = part;
      return strong;
    }),
  );
}

function setContentDensity(element, ...texts) {
  const length = texts
    .map((text) => String(text ?? "").replaceAll("**", "").length)
    .reduce((total, value) => total + value, 0);
  element.dataset.contentDensity =
    length >= 150 ? "compact" : length >= 100 ? "dense" : "normal";
}

function fitTextInsideCard(card, textElements, shouldFit = true) {
  const targets = Array.isArray(textElements) ? textElements : [textElements];
  targets.forEach((element) => {
    element.style.removeProperty("font-size");
    element.style.removeProperty("line-height");
  });
  if (
    !shouldFit ||
    !window.matchMedia("(orientation: landscape) and (max-height: 600px)").matches
  ) {
    return;
  }

  window.requestAnimationFrame(() => {
    const fontSizes = targets.map((element) =>
      Number.parseFloat(window.getComputedStyle(element).fontSize),
    );
    const minimumFontSize = 15;
    while (
      card.scrollHeight > card.clientHeight &&
      fontSizes.some((fontSize) => fontSize > minimumFontSize)
    ) {
      targets.forEach((element, index) => {
        fontSizes[index] = Math.max(minimumFontSize, fontSizes[index] - 0.5);
        element.style.fontSize = `${fontSizes[index]}px`;
        element.style.lineHeight = "1.18";
      });
    }
  });
}

function legacyProgressKey(deck) {
  return `anki-progress:${deck.subject.id}:${deck.subject.version}:v1`;
}

function readLegacyProgress(deck) {
  try {
    const saved = window.localStorage.getItem(legacyProgressKey(deck));
    return deserializeProgress(saved, state.subject.masteryTarget);
  } catch {
    return createEmptyProgress();
  }
}

function clearLegacyProgress(deck) {
  try {
    window.localStorage.removeItem(legacyProgressKey(deck));
  } catch {
    // 旧記録を消せない環境でもCloudflare上の記録を優先する。
  }
}

async function loadProgressFromCloud() {
  state.cloudReady = false;
  state.cloudError = "";
  if (!getStoredAccessKey()) {
    state.progress = createEmptyProgress();
    state.savedSessions = createEmptySavedSessions();
    state.reviewSettings = { ...defaultReviewSettings };
    state.shuffleEnabled = false;
    state.listeningPauseSeconds = 0;
    state.listeningQuestionIntervalSeconds = 0;
    state.studyRoutineOvertimeSeconds = defaultStudyRoutineOvertimeSeconds;
    state.studyTimeLimitSeconds = defaultStudyTimeLimitSeconds;
    state.speechParts = normalizeSpeechParts();
    await syncRatingSoundSettings({
      ratingSoundVolume: defaultRatingSoundVolume,
      ratingSounds: normalizeRatingSounds(),
    });
    syncRoutinePreferences(normalizeSetupPreferences());
    state.cloudConnected = false;
    return;
  }

  const loadedDecks = state.activeDeckIds.map((deckId) => state.loadedDecks.get(deckId));
  const deckCloudStates = await Promise.all(
    loadedDecks.map((deck) =>
      loadCloudState(state.subject.masteryTarget, deck.subject.version),
    ),
  );
  const sessionCloudState =
    loadedDecks.length === 1 &&
    loadedDecks[0].subject.version === state.sessionDatasetVersion
      ? deckCloudStates[0]
      : await loadCloudState(
          state.subject.masteryTarget,
          state.sessionDatasetVersion,
        );
  state.progress = mergeDeckProgress(deckCloudStates);
  state.savedSessions = sessionCloudState.sessions;
  if (isCompletedListeningSession(state.savedSessions["listen-answer"])) {
    await deleteCloudStudySession(
      state.sessionDatasetVersion,
    );
    setSavedSessionForMode("listen-answer", null);
  }
  state.reviewSettings = normalizeReviewSettings(sessionCloudState.settings);
  state.shuffleEnabled = sessionCloudState.settings.shuffleEnabled;
  state.listeningPauseSeconds = normalizeListeningPauseSeconds(
    sessionCloudState.settings.listeningPauseSeconds,
  );
  state.listeningQuestionIntervalSeconds =
    normalizeListeningQuestionIntervalSeconds(
      sessionCloudState.settings.listeningQuestionIntervalSeconds,
    );
  state.studyRoutineOvertimeSeconds = normalizeStudyRoutineOvertimeSeconds(
    sessionCloudState.settings.studyRoutineOvertimeSeconds,
  );
  state.studyTimeLimitSeconds = normalizeStudyTimeLimitSeconds(
    sessionCloudState.settings.studyTimeLimitSeconds,
  );
  state.speechParts = normalizeSpeechParts(sessionCloudState.settings.speechParts);
  syncRoutinePreferences(
    sessionCloudState.settings.setupPreferences,
    sessionCloudState.studyDate,
  );
  saveSpeechSettings(sessionCloudState.settings);
  await syncRatingSoundSettings(sessionCloudState.settings);

  for (const deck of loadedDecks) {
    const legacyProgress = readLegacyProgress(deck);
    const missingLegacyQuestions = Object.fromEntries(
      Object.entries(legacyProgress.questions).filter(
        ([questionId]) => !(questionId in state.progress.questions),
      ),
    );
    if (Object.keys(missingLegacyQuestions).length > 0) {
      await importCloudProgress(deck.subject.version, {
        questions: missingLegacyQuestions,
        updatedAt: legacyProgress.updatedAt,
      });
      state.progress.questions = {
        ...missingLegacyQuestions,
        ...state.progress.questions,
      };
    }
    clearLegacyProgress(deck);
  }
  state.cloudReady = true;
  state.cloudConnected = true;
  return {
    progress: state.progress,
    sessions: state.savedSessions,
    settings: sessionCloudState.settings,
  };
}

function pushHistory(entry) {
  state.history.push(entry);
  if (state.history.length > historyLimit) {
    state.history.shift();
  }
}

function renderActionControls() {
  const hasQuestion = Boolean(state.currentTask);
  const listening = isListeningMode();
  const canGoBack = state.history.length > 0;
  const showsRatingActions = !listening && hasQuestion && state.answerVisible;
  const showsListeningRatingActions = listening && hasQuestion && state.answerVisible;
  const showsListeningControls = listening && hasQuestion;
  elements.actionDock.classList.toggle("is-answer-visible", showsRatingActions);
  elements.actionDock.classList.toggle("is-back-only", !hasQuestion);
  elements.actionDock.classList.toggle(
    "is-hidden",
    listening || (!hasQuestion && !canGoBack),
  );
  elements.listeningDock.classList.toggle(
    "is-hidden",
    !showsListeningControls,
  );
  elements.listeningRatingButtons.classList.toggle(
    "is-hidden",
    !showsListeningRatingActions,
  );
  document.body.classList.toggle(
    "is-listening-answer-visible",
    showsListeningRatingActions,
  );
  elements.backAction.disabled = !canGoBack || state.saving;
  elements.nextAction.classList.toggle(
    "is-hidden",
    !hasQuestion || state.answerVisible,
  );
  elements.nextAction.disabled = state.saving;
  elements.ratingButtons.classList.toggle("is-hidden", !showsRatingActions);
  elements.ratingActions.forEach((button) => {
    button.disabled = state.saving;
  });
  elements.listeningBackAction.disabled = !canGoBack || state.saving;
  elements.listeningToggleAction.disabled = state.saving;
  elements.listeningNextAction.disabled = state.saving;
  elements.studyMenuTrigger.disabled = state.saving;
}

function revealCurrentAnswer() {
  if (
    isListeningMode() ||
    !state.currentTask ||
    state.answerVisible ||
    state.saving
  ) {
    return;
  }
  speechController.stop();
  pushHistory({
    type: "reveal",
    currentTask: { ...state.currentTask },
  });
  state.answerVisible = true;
  state.answerRevealedAt = window.performance.now();
  renderQuestion();
  autoSpeakAnswerAndOverview();
  void queueActiveSessionSave().catch((error) => {
    state.unlockMessage = error.message;
    renderQuestion();
  });
}

async function goBackOneStep() {
  if (isListeningMode() || state.saving) {
    return;
  }
  speechController.stop();
  const snapshot = state.history.at(-1);
  if (!snapshot) {
    renderActionControls();
    return;
  }

  if (snapshot.type === "reveal") {
    state.history.pop();
    state.currentTask = snapshot.currentTask
      ? { ...snapshot.currentTask }
      : state.currentTask;
    state.answerVisible = false;
    void queueActiveSessionSave().catch((error) => {
      state.unlockMessage = error.message;
    });
  } else if (snapshot.type === "rating") {
    stopStudyClock();
    state.saving = true;
    renderActionControls();
    await studySessionSave.catch(() => {});
    try {
      await queueCurrentStudyTimeSave();
    } catch (error) {
      state.unlockMessage = error.message;
      state.saving = false;
      startStudyClock();
      renderQuestion();
      return;
    }
    const forwardStudySeconds = state.studySeconds;
    state.history.pop();
    const remainingHistory = [...state.history];
    const restored = restoreRatingUndoSnapshot(state.progress, snapshot);
    if (!restored) {
      state.saving = false;
      startStudyClock();
      renderActionControls();
      return;
    }
    if (!restoreActiveSession(snapshot.studySession, { updateControls: false })) {
      state.queue = restored.queue;
      state.currentTask = restored.currentTask;
      state.answerVisible = restored.answerVisible;
      state.answeredThisSession = restored.answeredThisSession;
      state.ratingCounts = normalizeRatingCounts(restored.ratingCounts);
      state.unlockMessage = restored.unlockMessage;
    }
    if (Object.hasOwn(snapshot, "routineRun")) {
      restoreRoutineRun(snapshot.routineRun);
    }
    state.history = remainingHistory;
    state.studySeconds = Math.max(state.studySeconds, forwardStudySeconds);
    startNewStudyScreen();
    try {
      const saved = await saveCloudStudyAnswer(
        datasetVersionForQuestion(snapshot.questionId),
        snapshot.questionId,
        snapshot.previousQuestionRecord,
        captureActiveSession(),
        {
          studyMode: "memorize",
          deleteActivityId: snapshot.studyActivityEventId,
          sessionDatasetVersion: state.sessionDatasetVersion,
          routineRun: state.inRoutine ? state.routineRun : undefined,
        },
      );
      setSavedSessionForMode("memorize", saved.session);
    } catch (error) {
      const cloudState = await loadProgressFromCloud().catch(() => null);
      if (cloudState) {
        if (!restoreActiveSession(cloudState.sessions.memorize, { updateControls: false })) {
          state.activeSession = false;
          setSavedSessionForMode("memorize", null);
          state.queue = [];
          state.currentTask = null;
          state.answerVisible = false;
        }
        state.history = [];
      } else {
        state.history.push(snapshot);
      }
      state.unlockMessage = error.message;
    } finally {
      state.saving = false;
      ensureCurrentStudyScreen();
    }
  }

  state.answerRevealedAt = 0;
  renderQuestion();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function performRightSideAction(fromHalfScreen = false) {
  if (isListeningMode() || !state.currentTask) {
    return;
  }
  if (!state.answerVisible) {
    revealCurrentAnswer();
    return;
  }
  if (
    fromHalfScreen &&
    window.performance.now() - state.answerRevealedAt < halfScreenRatingDelay
  ) {
    return;
  }
  rateCurrentQuestion("again");
}

function queueSetupPreferenceSave() {
  const saveVersion = ++setupPreferenceSaveVersion;
  state.shuffleEnabled = elements.setupShuffle.checked;
  state.setupPreferences = captureSetupPreferences();
  const patch = {
    shuffleEnabled: state.shuffleEnabled,
    autoSpeechEnabled: true,
    setupPreferences: state.setupPreferences,
  };
  setupPreferenceSave = setupPreferenceSave
    .catch(() => {})
    .then(async () => {
      const saved = await saveCloudSettings(patch);
      if (saveVersion === setupPreferenceSaveVersion) {
        state.shuffleEnabled = saved.shuffleEnabled;
        syncRoutinePreferences(saved.setupPreferences);
        elements.cloudStatus.textContent = "開始設定をCloudflareへ共有しました。";
      }
      return saved;
    });
  return setupPreferenceSave;
}

function captureSetupPreferences() {
  const current = normalizeSetupPreferences(state.setupPreferences);
  if (!state.activeSubjectId || state.activeDeckIds.length === 0) return current;
  const currentSubject = current.subjects[state.activeSubjectId] ?? {
    lastDeckId: "",
    selectedDeckIds: [],
    studyMode: "memorize",
    decks: {},
  };
  const studyMode =
    !speechController.supported &&
    listeningModes.has(currentSubject.studyMode)
      ? currentSubject.studyMode
      : selectedStudyMode();
  return normalizeSetupPreferences({
    ...current,
    lastSubjectId: state.activeSubjectId,
    subjects: {
      ...current.subjects,
      [state.activeSubjectId]: {
        ...currentSubject,
        lastDeckId: state.activeDeckIds[0],
        selectedDeckIds: state.activeDeckIds,
        studyMode,
        decks: Object.fromEntries([
          ...Object.entries(currentSubject.decks),
          ...state.activeDeckIds.map((deckId) => [
            deckId,
            {
              ...selectedFilters(),
              questionStyle: elements.questionStyleFilter.value,
              questionAmountMode: selectedQuestionAmountMode(),
            },
          ]),
        ]),
      },
    },
  });
}

function queueVisibleSetupPreferenceSave() {
  void queueSetupPreferenceSave().catch((error) => {
    elements.cloudStatus.textContent = `開始設定を共有できませんでした。${error.message}`;
  });
}

function queueSpeechPartsSave() {
  const saveVersion = ++speechPartsSaveVersion;
  const speechParts = normalizeSpeechParts(state.speechParts);
  setupPreferenceSave = setupPreferenceSave
    .catch(() => {})
    .then(async () => {
      const saved = await saveCloudSettings({ speechParts });
      if (saveVersion === speechPartsSaveVersion) {
        state.speechParts = normalizeSpeechParts(saved.speechParts);
        updateSpeechButtons();
      }
      return saved;
    });
  return setupPreferenceSave;
}

function speechPartKeyForTarget(target) {
  if (state.subject?.learningType === "vocabulary") {
    const group = target.startsWith("vocabulary-")
      ? target.slice("vocabulary-".length)
      : vocabularySpeechLayout()?.[target];
    return vocabularySpeechPartKey(group);
  }
  return {
    question: "question",
    answer: "answer",
    mnemonic: "mnemonic",
    overview: "explanation",
  }[target];
}

function updateSpeechButtons(activeTarget = speechController.currentTarget) {
  const settings = currentSpeechPartSettings();
  const controls = [
    [elements.questionSpeech, "question", "問題"],
    [elements.answerSpeech, "answer", "回答"],
    [elements.yearMnemonicSpeech, "mnemonic", "年号の語呂合わせ"],
    [elements.overviewSpeech, "overview", "解説"],
    ...Array.from(elements.vocabularySpeechButtons, (button) => {
      const group = button.dataset.vocabularySpeech;
      return [button, `vocabulary-${group}`, vocabularySpeechLabels[group]];
    }),
  ];
  for (const [button, target, label] of controls) {
    const partKey = speechPartKeyForTarget(target);
    const enabled = Boolean(partKey && settings[partKey]);
    const speaking = enabled && activeTarget === target;
    button.classList.toggle("is-enabled", enabled);
    button.classList.toggle("is-speaking", speaking);
    button.setAttribute("aria-pressed", String(enabled));
    button.setAttribute(
      "aria-label",
      enabled
        ? `${label}の自動読み上げをOFFにする`
        : `${label}の自動読み上げをONにする`,
    );
    button.title = enabled
      ? `${label}の自動読み上げ：ON`
      : `${label}の自動読み上げ：OFF`;
    const icon = button.querySelector("span");
    if (icon) {
      icon.textContent = enabled ? "🔊" : "🔇";
    }
  }
}

function vocabularySpeechGroups(term = currentTerm()) {
  return createVocabularySpeechGroups(term);
}

function vocabularySpeechLayout(question = currentQuestion()) {
  return vocabularySpeechLayoutByStage[question?.stage] ?? null;
}

function renderVocabularySpeechGroups() {
  const vocabularyMode = state.subject?.learningType === "vocabulary";
  const showGroups =
    vocabularyMode &&
    state.answerVisible &&
    speechController.supported;
  elements.vocabularySpeechGroups.classList.toggle("is-hidden", !showGroups);
  if (vocabularyMode) {
    elements.questionSpeech.classList.toggle("is-hidden", showGroups);
    elements.answerSpeech.classList.toggle("is-hidden", showGroups);
  }
  const groups = vocabularySpeechGroups();
  for (const button of elements.vocabularySpeechButtons) {
    const group = button.dataset.vocabularySpeech;
    button.disabled = !groups[group]?.text;
  }
  if (showGroups) {
    updateSpeechButtons(speechController.currentTarget);
  }
}

function shouldPreferHistoryFullName(term, question) {
  return (
    state.subject?.learningType === "history" &&
    (question?.type === "person" ||
      (term?.category === "人物" && question?.type === "identify"))
  );
}

function speechSegmentsFor(target, task = state.currentTask) {
  const question = questionForTask(task);
  const term = termForTask(task);
  if (!question || !term) {
    return [];
  }
  const yearMnemonic = getQuestionYearMnemonic(term, question);
  if (state.subject?.learningType === "vocabulary") {
    const groups = vocabularySpeechGroups(term);
    const layout = vocabularySpeechLayout(question);
    const group = target.startsWith("vocabulary-")
      ? target.slice("vocabulary-".length)
      : layout?.[target];
    const segment = groups[group];
    if (segment?.text) {
      return [{ ...segment, target }];
    }
  }
  const includeAcceptedAnswers =
    state.subject?.learningType !== "vocabulary";
  const preferFullName =
    target === "answer" && shouldPreferHistoryFullName(term, question);
  const answerSpeechParts =
    target === "answer"
      ? getQuestionAnswerSpeechParts(question, {
          includeAcceptedAnswers,
          preferFullName,
          term,
        })
      : [];
  const configuredSegments = question.speech?.[target];
  if (Array.isArray(configuredSegments) && configuredSegments.length > 0) {
    const primaryAnswer = getQuestionAnswerParts(question)[0] ?? "";
    const replacePrimaryAnswer =
      target === "answer" &&
      answerSpeechParts.length === 1 &&
      answerSpeechParts[0] !== primaryAnswer;
    return configuredSegments.map((segment, index) => ({
      target,
      text:
        index === 0
          ? [
              replacePrimaryAnswer ? answerSpeechParts[0] : segment.text,
              ...(replacePrimaryAnswer ? [] : answerSpeechParts.slice(1)),
            ]
              .filter(Boolean)
              .join("。")
          : segment.text,
      language: segment.language ?? "ja-JP",
    }));
  }
  if (target === "question") {
    return [{ target, text: question.prompt, language: "ja-JP" }];
  }
  if (target === "answer") {
    return [
      {
        target,
        text: getQuestionAnswerSpeechText(question, {
          includeAcceptedAnswers,
          preferFullName,
          term,
        }),
        language: "ja-JP",
      },
    ];
  }
  if (target === "mnemonic") {
    return [
      ...(yearMnemonic
        ? [
            {
              target,
              text: prepareMnemonicSpeechText(yearMnemonic),
              language: "ja-JP",
            },
          ]
        : []),
    ];
  }
  if (target === "overview") {
    const explanation = getQuestionExplanation(term, question);
    return explanation
      ? [{ target, text: explanation, language: "ja-JP" }]
      : [];
  }
  return [];
}

function answerSpeechSequence(task = state.currentTask) {
  const question = questionForTask(task);
  const term = termForTask(task);
  const settings = currentSpeechPartSettings();
  if (state.subject?.learningType === "vocabulary") {
    const layout = vocabularySpeechLayout(question);
    return createVocabularyAutomaticAnswerSequence(
      term,
      question?.stage,
      {
        answer: Boolean(
          settings[vocabularySpeechPartKey(layout?.answer)],
        ),
        exampleEnglish: settings.exampleEnglish,
        exampleJapanese: settings.exampleJapanese,
      },
    );
  }
  return [
    ...(settings.answer ? speechSegmentsFor("answer", task) : []),
    ...(settings.mnemonic ? speechSegmentsFor("mnemonic", task) : []),
    ...(settings.explanation ? speechSegmentsFor("overview", task) : []),
  ];
}

function listeningQuestionSpeechSequence(task = state.currentTask) {
  const question = questionForTask(task);
  return currentQuestionSpeechEnabled(question)
    ? speechSegmentsFor("question", task)
    : [];
}

function preloadListeningTask(task) {
  if (!task) {
    return;
  }
  void speechController.preload([
    ...listeningQuestionSpeechSequence(task),
    ...answerSpeechSequence(task),
  ]);
}

function autoSpeakQuestion() {
  if (
    speechController.supported &&
    !isListeningMode() &&
    currentQuestionSpeechEnabled()
  ) {
    speechController.speak(speechSegmentsFor("question"));
  }
}

function autoSpeakAnswerAndOverview() {
  if (!speechController.supported || isListeningMode()) {
    return;
  }
  speechController.speak(answerSpeechSequence());
}

async function goBackListeningOneStep() {
  if (!isListeningMode() || state.saving) {
    return;
  }
  const snapshot = state.history.at(-1);
  if (
    !snapshot ||
    !["reveal", "listening-advance", "rating"].includes(snapshot.type)
  ) {
    renderActionControls();
    return;
  }

  let forwardSession = captureActiveSession();
  const forwardAnswerVisible = state.answerVisible;
  const previousHistory = [...state.history];
  stopListeningSequence();
  stopStudyClock();
  state.listeningPaused = true;
  state.pendingListeningActivity = null;
  state.saving = true;
  renderActionControls();
  await studySessionSave.catch(() => {});

  try {
    await queueCurrentStudyTimeSave();
    forwardSession = captureActiveSession();
    const forwardStudySeconds = state.studySeconds;
    state.history.pop();
    if (snapshot.type === "reveal") {
      state.currentTask = snapshot.currentTask
        ? { ...snapshot.currentTask }
        : state.currentTask;
      state.answerVisible = false;
      const saved = await saveCloudStudySession(
        state.sessionDatasetVersion,
        captureActiveSession(),
      );
      setSavedSessionForMode("listen-answer", saved);
    } else if (snapshot.type === "listening-advance") {
      const remainingHistory = [...state.history];
      if (!restoreActiveSession(snapshot.studySession, { updateControls: false })) {
        throw new Error("前の問題を復元できませんでした。");
      }
      if (Object.hasOwn(snapshot, "routineRun")) {
        restoreRoutineRun(snapshot.routineRun);
      }
      state.history = remainingHistory;
      state.studySeconds = Math.max(state.studySeconds, forwardStudySeconds);
      state.answerVisible = true;
      state.listeningPaused = true;
      startNewStudyScreen();
      const saved = await undoCloudStudyActivity(
        snapshot.studyActivityDatasetVersion ??
          datasetVersionForQuestion(snapshot.studySession?.currentTask?.questionId),
        snapshot.studyActivityEventId,
        captureActiveSession(),
        {
          sessionDatasetVersion: state.sessionDatasetVersion,
          routineRun: state.inRoutine ? state.routineRun : undefined,
        },
      );
      setSavedSessionForMode("listen-answer", saved.session);
    } else {
      const remainingHistory = [...state.history];
      const restored = restoreRatingUndoSnapshot(state.progress, snapshot);
      if (
        !restored ||
        !restoreActiveSession(snapshot.studySession, { updateControls: false })
      ) {
        throw new Error("評価前の問題を復元できませんでした。");
      }
      if (Object.hasOwn(snapshot, "routineRun")) {
        restoreRoutineRun(snapshot.routineRun);
      }
      state.history = remainingHistory;
      state.studySeconds = Math.max(state.studySeconds, forwardStudySeconds);
      state.answerVisible = true;
      state.listeningPaused = true;
      startNewStudyScreen();
      const saved = await saveCloudStudyAnswer(
        snapshot.studyActivityDatasetVersion ??
          datasetVersionForQuestion(snapshot.questionId),
        snapshot.questionId,
        snapshot.previousQuestionRecord,
        captureActiveSession(),
        {
          studyMode: "listen-answer",
          deleteActivityId: snapshot.studyActivityEventId,
          sessionDatasetVersion: state.sessionDatasetVersion,
          routineRun: state.inRoutine ? state.routineRun : undefined,
        },
      );
      setSavedSessionForMode("listen-answer", saved.session);
    }
  } catch (error) {
    const cloudState = await loadProgressFromCloud().catch(() => null);
    const cloudSession = cloudState?.sessions?.["listen-answer"] ?? null;
    if (cloudSession && restoreActiveSession(cloudSession, { updateControls: false })) {
      state.answerVisible = cloudSession.answerVisible;
      state.history = [];
    } else if (
      forwardSession &&
      restoreActiveSession(forwardSession, { updateControls: false })
    ) {
      state.answerVisible = forwardAnswerVisible;
      state.history = previousHistory;
    } else if (cloudState) {
      state.activeSession = false;
      state.currentTask = null;
      state.queue = [];
      state.answerVisible = false;
      state.history = [];
    }
    state.unlockMessage = error.message;
  } finally {
    state.pendingListeningActivity = null;
    state.listeningPaused = true;
    state.saving = false;
  }

  startStudyClock();
  renderQuestion();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function advanceListening(runId) {
  if (
    runId !== state.listeningRunId ||
    state.listeningPaused ||
    !isListeningMode() ||
    !state.currentTask
  ) {
    return;
  }
  const completedTask = state.currentTask;
  const activity = state.pendingListeningActivity ??
    createStudyActivity(completedTask.questionId);
  stopStudyClock();
  state.saving = true;
  renderActionControls();
  await studySessionSave.catch(() => {});
  try {
    await queueCurrentStudyTimeSave();
  } catch (error) {
    state.answerVisible = true;
    state.listeningPaused = true;
    stopListeningSequence();
    state.saving = false;
    state.unlockMessage = error.message;
    startStudyClock();
    renderQuestion();
    return;
  }
  const undoSnapshot = {
    type: "listening-advance",
    studyActivityEventId: activity.eventId,
    studyActivityDatasetVersion: datasetVersionForQuestion(activity.questionId),
    studySession: captureActiveSession(),
    ...(state.inRoutine
      ? { routineRun: normalizeStudyRoutineRun(state.routineRun) }
      : {}),
  };
  const historyBefore = [...state.history];
  const previousQueue = state.queue.map(cloneTask);
  const previousUnseenQuestionIds = new Set(state.unseenQuestionIds);
  const previousAnsweredCount = state.answeredThisSession;
  state.pendingListeningActivity = activity;
  state.unseenQuestionIds.delete(completedTask.questionId);
  state.answeredThisSession += 1;
  state.currentTask = state.queue.shift() ?? null;
  const routineChange = recordActiveRoutineQuestion(
    completedTask.questionId,
    state.screenStudySeconds,
  );
  const listeningPassComplete = !state.currentTask;
  const sessionComplete =
    listeningPassComplete && state.retryQuestionIds.size === 0;
  state.answerVisible = false;
  startNewStudyScreen();
  try {
    await queueActiveStudyActivity(activity, {
      completeSession: sessionComplete,
      routineRun: routineChange?.changed ? state.routineRun : undefined,
    });
    state.pendingListeningActivity = null;
    pushHistory(undoSnapshot);
  } catch (error) {
    if (!restoreActiveSession(undoSnapshot.studySession, { updateControls: false })) {
      state.currentTask = completedTask;
      state.queue = previousQueue;
      state.unseenQuestionIds = previousUnseenQuestionIds;
      state.answeredThisSession = previousAnsweredCount;
    }
    state.history = historyBefore;
    if (Object.hasOwn(undoSnapshot, "routineRun")) {
      restoreRoutineRun(undoSnapshot.routineRun);
    }
    state.answerVisible = true;
    state.listeningPaused = true;
    stopListeningSequence();
    state.saving = false;
    state.unlockMessage = error.message;
    startStudyClock();
    renderQuestion();
    return;
  }
  state.saving = false;
  if (routineChange?.completedItem) {
    if (sessionComplete) {
      state.activeSession = false;
      setSavedSessionForMode("listen-answer", null);
    }
    showRoutineStepCompletion(routineChange);
    return;
  }
  if (listeningPassComplete) {
    stopListeningSequence();
    state.listeningPaused = true;
    if (sessionComplete) {
      state.activeSession = false;
      setSavedSessionForMode("listen-answer", null);
    }
    startNewStudyScreen();
    renderQuestion();
    return;
  }
  startStudyClock();
  if (runId !== state.listeningRunId || state.listeningPaused) {
    renderQuestion();
    return;
  }
  beginListeningQuestion();
}

function speakListeningAnswer(runId) {
  if (
    runId !== state.listeningRunId ||
    state.listeningPaused ||
    !isListeningMode()
  ) {
    return;
  }
  if (!state.answerVisible) {
    pushHistory({
      type: "reveal",
      currentTask: { ...state.currentTask },
    });
  }
  state.answerVisible = true;
  renderQuestion();
  const segments = answerSpeechSequence();
  preloadListeningTask(state.queue[0]);
  const started = speechController.speak(segments, {
    onComplete: () => {
      if (runId !== state.listeningRunId) {
        return;
      }
      state.listeningTimer = window.setTimeout(() => {
        state.listeningTimer = null;
        void advanceListening(runId);
      }, state.listeningQuestionIntervalSeconds * 1000);
    },
    onError: (error) => pauseListeningAfterSpeechFailure(runId, error),
  });
  if (!started) {
    state.listeningTimer = window.setTimeout(() => {
      state.listeningTimer = null;
      void advanceListening(runId);
    }, state.listeningQuestionIntervalSeconds * 1000);
  }
}

function pauseListeningAfterSpeechFailure(runId, error = null) {
  if (
    runId !== state.listeningRunId ||
    state.listeningPaused ||
    !isListeningMode()
  ) {
    return;
  }
  state.listeningPaused = true;
  stopListeningSequence();
  state.unlockMessage =
    error?.name === "NotAllowedError"
      ? "音声の再生許可が必要です。画面中央を押すと、同じ問題から読み上げを再開します。"
      : "音声を再生できなかったため、この問題で一時停止しました。画面中央を押すと、同じ問題からもう一度読み上げます。";
  renderQuestion();
}

function beginListeningQuestion() {
  if (state.listeningPaused || !isListeningMode() || !state.currentTask) {
    return;
  }
  clearListeningTimer();
  const runId = ++state.listeningRunId;
  state.answerVisible = false;
  renderQuestion();
  const questionSegments = listeningQuestionSpeechSequence();
  void speechController.preload(answerSpeechSequence());
  const started = speechController.speak(questionSegments, {
    onComplete: () => {
      if (
        runId !== state.listeningRunId ||
        state.listeningPaused ||
        !isListeningMode()
      ) {
        return;
      }
      const pauseSeconds = state.listeningPauseSeconds;
      state.listeningTimer = window.setTimeout(() => {
        state.listeningTimer = null;
        speakListeningAnswer(runId);
      }, pauseSeconds * 1000);
    },
    onError: (error) => pauseListeningAfterSpeechFailure(runId, error),
  });
  if (!started) {
    speakListeningAnswer(runId);
  }
}

function showSpeechPartNotice(message) {
  if (speechPartNoticeTimer !== null) {
    window.clearTimeout(speechPartNoticeTimer);
  }
  elements.unlockNotice.textContent = message;
  elements.unlockNotice.classList.remove("is-hidden");
  speechPartNoticeTimer = window.setTimeout(() => {
    speechPartNoticeTimer = null;
    elements.unlockNotice.classList.add("is-hidden");
  }, 2200);
}

function toggleSpeechPart(target) {
  if (!speechController.supported) {
    return;
  }
  const subjectKey = speechPartSubjectKey();
  const partKey = speechPartKeyForTarget(target);
  if (!partKey) {
    return;
  }
  const nextGroup = {
    ...state.speechParts[subjectKey],
    [partKey]: !state.speechParts[subjectKey][partKey],
  };
  if (!Object.values(nextGroup).some(Boolean)) {
    showSpeechPartNotice("読み上げ対象を1つ以上ONにしてください");
    return;
  }

  state.speechParts = {
    ...state.speechParts,
    [subjectKey]: nextGroup,
  };
  updateSpeechButtons();

  if (speechController.currentTarget || isListeningMode()) {
    const wasListening = isListeningMode() && !state.listeningPaused;
    const answerWasVisible = state.answerVisible;
    stopListeningSequence();
    if (wasListening) {
      const runId = state.listeningRunId;
      state.listeningTimer = window.setTimeout(() => {
        state.listeningTimer = null;
        if (answerWasVisible) {
          void advanceListening(runId);
        } else {
          speakListeningAnswer(runId);
        }
      }, 0);
    }
  }

  void queueSpeechPartsSave().catch((error) => {
    showSpeechPartNotice(`保存できませんでした。${error.message}`);
  });
}

function toggleListening() {
  if (!isListeningMode() || !state.currentTask || state.saving) {
    return;
  }
  speechController.unlock();
  if (state.listeningPaused) {
    state.listeningPaused = false;
    showListeningPlaybackFeedback("play");
    startStudyClock();
    if (state.answerVisible) {
      const runId = ++state.listeningRunId;
      speakListeningAnswer(runId);
    } else {
      beginListeningQuestion();
    }
    return;
  }
  state.listeningPaused = true;
  stopListeningSequence();
  showListeningPlaybackFeedback("pause");
  void queueCurrentStudyTimeSave().catch((error) => {
    state.unlockMessage = error.message;
  });
}

function advanceListeningManually() {
  if (!isListeningMode() || !state.currentTask || state.saving) {
    return;
  }
  stopListeningSequence();
  state.listeningPaused = false;
  if (!state.answerVisible) {
    speakListeningAnswer(state.listeningRunId);
    return;
  }
  void advanceListening(state.listeningRunId);
}

async function returnToSetup() {
  stopListeningSequence();
  stopStudyClock();
  clearPendingReviewTimer();
  state.listeningPaused = false;
  state.pendingListeningActivity = null;
  if (state.activeSession) {
    try {
      await queueCurrentStudyTimeSave();
      await queueActiveSessionSave();
    } catch (error) {
      state.unlockMessage = error.message;
    }
  }
  showOnly(elements.setupPanel);
  updateSetupPreview();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function returnToSubjectSelection() {
  stopListeningSequence();
  stopStudyClock();
  clearPendingReviewTimer();
  state.listeningPaused = false;
  state.pendingListeningActivity = null;
  if (state.activeSession) {
    try {
      await queueCurrentStudyTimeSave();
      await queueActiveSessionSave();
    } catch (error) {
      state.unlockMessage = error.message;
    }
  }
  showSubjectSelection();
}

function renderTermTags(term, question, visible) {
  const tags = [
    term.chronology?.displayPeriod,
    ...getMacroRegionTags(term),
    term.geography?.regionDetail,
    term.era,
    term.category,
    term.subunit,
    questionStyleLabel(question.stage),
    question.focus,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);

  elements.termTags.replaceChildren(
    ...tags.map((tag) => {
      const item = document.createElement("span");
      item.textContent = `#${tag.replaceAll(" ", "")}`;
      return item;
    }),
  );
  elements.termTags.classList.toggle("is-hidden", !visible || tags.length === 0);
}

function renderQuestionImage(question, visible) {
  const image = state.questionImages.get(question.id);
  const showsImage = visible && Boolean(image);
  elements.termImage.classList.toggle("is-hidden", !showsImage);
  elements.termOverview.classList.toggle("has-image", showsImage);
  elements.termOverviewMain.classList.toggle("has-image", showsImage);
  elements.termOverviewMain.classList.toggle(
    "image-only",
    showsImage && elements.termOverviewText.classList.contains("is-hidden"),
  );
  if (!showsImage) {
    elements.termImageContent.removeAttribute("src");
    elements.termImageContent.alt = "";
    elements.termImageLicense.removeAttribute("href");
    return false;
  }

  elements.termImageContent.src = getDataUrl(image.path);
  elements.termImageContent.alt = image.alt;
  elements.termImageCaption.textContent = image.caption;
  elements.termImageCreator.textContent = image.creator;
  elements.termImageLicense.textContent = image.license;
  elements.termImageLicense.href = image.licenseUrl;
  return true;
}

function questionForTask(task) {
  if (!task) {
    return null;
  }
  return state.questionById.get(task.questionId) ?? null;
}

function termForTask(task) {
  if (!task) {
    return null;
  }
  return state.termById.get(task.termId) ?? null;
}

function currentQuestion() {
  return questionForTask(state.currentTask);
}

function currentTerm() {
  return termForTask(state.currentTask);
}

function sortedUnique(values) {
  return [...new Set(values.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, "ja"),
  );
}

function setSelectOptions(select, values, firstLabel) {
  const previousValue = select.value;
  const firstOption = document.createElement("option");
  firstOption.value = "";
  firstOption.textContent = firstLabel;
  select.replaceChildren(
    firstOption,
    ...values.map((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      return option;
    }),
  );
  if (values.includes(previousValue)) {
    select.value = previousValue;
  }
}

function deckDisplayLabel(deck) {
  const labelParts = String(deck?.datasetLabel ?? "").split("｜");
  return labelParts.length > 1
    ? labelParts.slice(1).join("｜")
    : String(deck?.difficultyLabel ?? deck?.id ?? "デッキ");
}

function setDeckOptions(decks, selectedDeckIds) {
  const selected = new Set(selectedDeckIds);
  elements.deckFilter.replaceChildren(
    ...decks.map((deck) => {
      const label = document.createElement("label");
      label.className = "deck-filter-choice";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = "deck-filter";
      input.value = deck.id;
      input.checked = selected.has(deck.id);
      const text = document.createElement("span");
      text.textContent = deckDisplayLabel(deck).replaceAll("｜", " ");
      label.append(input, text);
      return label;
    }),
  );
}

function selectedFilters() {
  return {
    macroRegion: elements.macroRegionFilter.value,
    regionDetail: elements.regionDetailFilter.value,
    category: elements.categoryFilter.value,
  };
}

const defaultQuestionStyleLabels = {
  "": "三段階すべて",
  beginner: "通常の一問一答",
  reverse: "逆一問一答",
  integrated: "統合説明",
};

function questionStyleLabel(stage) {
  const labels = state.subject?.stageLabels ?? defaultQuestionStyleLabels;
  return labels[stage || "all"] ?? defaultQuestionStyleLabels[stage] ?? stage;
}

function setQuestionStyleOptions() {
  const selected = elements.questionStyleFilter.value;
  const availableStages = availableQuestionStages();
  elements.questionStyleFilter.replaceChildren(
    ...[
      ["", questionStyleLabel("")],
      ...availableStages.map((stage) => [stage, questionStyleLabel(stage)]),
    ].map(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      return option;
    }),
  );
  elements.questionStyleFilter.value = ["", ...availableStages].includes(selected)
    ? selected
    : "";
}

function setAvailableSelectValue(select, value) {
  select.value = [...select.options].some((option) => option.value === value)
    ? value
    : "";
}

function applySetupPreferences() {
  const preferences = normalizeSetupPreferences(state.setupPreferences);
  const subject = preferences.subjects[state.activeSubjectId];
  const deck = subject?.decks?.[state.activeDeckIds[0]] ?? {};
  setAvailableSelectValue(elements.macroRegionFilter, deck.macroRegion ?? "");
  updateRegionDetailOptions();
  setAvailableSelectValue(elements.regionDetailFilter, deck.regionDetail ?? "");
  setAvailableSelectValue(elements.categoryFilter, deck.category ?? "");
  setAvailableSelectValue(elements.questionStyleFilter, deck.questionStyle ?? "");
  elements.questionAmountFilter.value =
    supportsOneQuestionPerTerm() &&
    deck.questionAmountMode === oneQuestionPerTermMode
      ? oneQuestionPerTermMode
      : "all";
  const savedMode = subject?.studyMode ?? "memorize";
  const restoredMode =
    listeningModes.has(savedMode) && !speechController.supported
      ? "memorize"
      : savedMode;
  for (const option of elements.studyModeOptions) {
    option.checked = option.value === restoredMode;
  }
}

function activeStages() {
  const availableStages = availableQuestionStages();
  return availableStages.includes(state.selectedStage)
    ? [state.selectedStage]
    : availableStages;
}

function countQuestions(terms, stages = learningStages) {
  return terms.reduce(
    (total, term) =>
      total +
      stages.reduce(
        (termTotal, stage) => termTotal + (term.stages[stage]?.length ?? 0),
        0,
      ),
    0,
  );
}

function updateRegionDetailOptions(resetSelection = false) {
  const macroRegion = elements.macroRegionFilter.value;
  const filterLabels = state.subject?.filterLabels ?? {};
  if (!macroRegion) {
    setSelectOptions(
      elements.regionDetailFilter,
      [],
      `${filterLabels.macroRegion ?? "大分類"}を選ぶと選択できます`,
    );
    elements.regionDetailFilter.disabled = true;
    return;
  }

  const matchingTerms = filterTermsBySelection(state.allTerms, { macroRegion });
  const details = sortedUnique(
    matchingTerms.map((term) => term.geography?.regionDetail),
  );
  if (resetSelection) {
    elements.regionDetailFilter.value = "";
  }
  setSelectOptions(
    elements.regionDetailFilter,
    details,
    `すべての${filterLabels.regionDetail ?? "小分類"}`,
  );
  elements.regionDetailFilter.disabled = false;
}

function updateSetupPreview() {
  const terms = filterTermsBySelection(state.allTerms, selectedFilters());
  const selectedStage = elements.questionStyleFilter.value;
  const studyMode = selectedStudyMode();
  const listening = listeningModes.has(studyMode);
  const questionAmountMode = selectedQuestionAmountMode();
  const stages = learningStages.includes(selectedStage)
    ? [selectedStage]
    : availableQuestionStages();
  const questions = countQuestions(terms, stages);
  const dueQuestions = (
    questionAmountMode === oneQuestionPerTermMode
      ? createTermQuestionQueue
      : createQuestionQueue
  )(
    terms,
    state.progress,
    state.subject.masteryTarget,
    selectedStage,
  ).length;
  const beginnerQuestions = terms.reduce(
    (total, term) => total + (term.stages.beginner?.length ?? 0),
    0,
  );
  const savedSession = savedSessionForMode(studyMode);
  const hasSavedSession = Boolean(savedSession);
  const restartsSavedSession = setupMatchesSession(savedSession, terms);
  elements.resumeStudy.classList.toggle("is-hidden", !hasSavedSession);
  elements.resumeStudy.disabled = !state.cloudReady || !hasSavedSession;
  elements.startStudy.disabled =
    terms.length === 0 ||
    !state.cloudReady ||
    (listening &&
      (!speechController.supported ||
        (dueQuestions === 0 && !restartsSavedSession)));
  elements.startStudy.textContent = hasSavedSession
    ? "はじめから"
    : listening
      ? "聞き流しを開始"
      : "暗記モードを開始";
  const routineItem = activeRoutineItem();
  if (routineItem) {
    const remaining = routineRemainingCount(routineItem);
    if (routineItem.overtimePending) {
      elements.startStudy.disabled = true;
      elements.startStudy.textContent = "追加復習中は続きから再開";
      elements.resumeStudy.textContent = "追加の復習を再開";
    } else {
      elements.startStudy.textContent = hasSavedSession
        ? `残り${remaining}問をはじめから進める`
        : `残り${remaining}問を開始`;
      elements.resumeStudy.textContent = `前回の続きから（残り${remaining}問）`;
    }
  } else {
    elements.resumeStudy.textContent = "前回の続きから";
  }
  elements.selectionSummary.textContent =
    terms.length === 0
      ? `条件に合う${termUnitLabel()}がありません。選択を変更してください。`
      : listening && !speechController.supported
        ? "この端末では音声読み上げを利用できません。"
        : listening && dueQuestions === 0
          ? "現在、復習時刻を迎えた読み上げ対象の問題はありません。"
          : listening
            ? `${terms.length}${termUnitLabel()}・読み上げ対象 ${dueQuestions}問（読み上げ：${listeningContentLabel()}${
                questionAmountMode === oneQuestionPerTermMode
                  ? "・1項目につき1問"
                  : ""
              }）`
      : questionAmountMode === oneQuestionPerTermMode
        ? `${terms.length}${termUnitLabel()}・今回${dueQuestions}問（1項目につき1問・最大${terms.length}問）`
      : selectedStage
        ? `${terms.length}${termUnitLabel()}・${questions}問（${questionStyleLabel(selectedStage)}）`
        : `${terms.length}${termUnitLabel()}・${questions}問（開始時は${questionStyleLabel("beginner")} ${beginnerQuestions}問）`;
  if (routineItem?.overtimePending) {
    elements.selectionSummary.textContent =
      "目標問題数は達成済みです。続きから追加の復習を再開してください。";
  }
  elements.cloudStatus.classList.toggle("is-connected", state.cloudReady);
  elements.cloudStatus.innerHTML = state.cloudReady
    ? "学習記録：Cloudflareに接続済み"
    : '学習記録：未接続　<a href="/settings.html">設定ページでアクセスキーを登録</a>';
}

function formatInterval(seconds) {
  if (seconds % 86400 === 0) {
    return `${seconds / 86400}日後`;
  }
  if (seconds % 3600 === 0) {
    return `${seconds / 3600}時間後`;
  }
  if (seconds % 60 === 0) {
    return `${seconds / 60}分後`;
  }
  return `${seconds}秒後`;
}

function updateRatingIntervals() {
  const intervalSecondsByRating = {
    again: state.reviewSettings.againSeconds,
    hard: state.reviewSettings.hardSeconds,
    good: state.reviewSettings.goodSeconds,
    easy: state.reviewSettings.easySeconds,
  };
  for (const button of elements.ratingActions) {
    const interval = button.querySelector("small");
    if (interval) {
      interval.textContent = formatInterval(
        intervalSecondsByRating[button.dataset.rating],
      );
    }
  }
}

function configureSetup() {
  const filterLabels = state.subject?.filterLabels ?? {};
  const fieldMappings = [
    [elements.macroRegionField, elements.macroRegionLabel, filterLabels.macroRegion],
    [elements.regionDetailField, elements.regionDetailLabel, filterLabels.regionDetail],
    [elements.categoryField, elements.categoryLabel, filterLabels.category],
  ];
  for (const [field, label, text] of fieldMappings) {
    field.classList.toggle("is-hidden", !text);
    if (text) label.textContent = text;
  }
  setQuestionStyleOptions();
  elements.questionAmountField.classList.toggle(
    "is-hidden",
    !supportsOneQuestionPerTerm(),
  );
  const macroRegions = sortedUnique(
    state.allTerms.flatMap((term) => getMacroRegionTags(term)),
  );
  const categories = sortedUnique(state.allTerms.map((term) => term.category));
  setSelectOptions(
    elements.macroRegionFilter,
    macroRegions,
    `すべての${filterLabels.macroRegion ?? "大分類"}`,
  );
  setSelectOptions(
    elements.categoryFilter,
    categories,
    filterLabels.category ? `すべての${filterLabels.category}` : "すべて",
  );
  updateRegionDetailOptions();
  elements.setupShuffle.checked = state.shuffleEnabled;
  elements.listeningAnswerDescription.textContent =
    "保存済みの読み上げ対象を繰り返し再生する";
  for (const option of elements.studyModeOptions) {
    option.closest(".study-mode-choice")?.classList.remove("is-hidden");
    if (listeningModes.has(option.value)) {
      option.disabled = !speechController.supported;
    }
  }
  applySetupPreferences();
  [
    elements.questionSpeech,
    elements.answerSpeech,
    elements.yearMnemonicSpeech,
    elements.overviewSpeech,
  ].forEach(
    (button) => button.classList.toggle("is-hidden", !speechController.supported),
  );
  updateSpeechButtons();
  updateRatingIntervals();
  updateSetupPreview();
  renderRoutineSetupContext();
}

function updateOverallProgress() {
  const mastery = getOverallMastery(
    state.terms,
    state.progress,
    state.subject.masteryTarget,
    activeStages(),
  );
  const percent =
    mastery.totalQuestions === 0
      ? 0
      : (mastery.masteredQuestions / mastery.totalQuestions) * 100;
  elements.overallProgress.textContent = `習得 ${mastery.masteredQuestions} / ${mastery.totalQuestions}問`;
  elements.termProgress.textContent = state.selectedStage
    ? `このスタイル習得 ${mastery.masteredTerms} / ${mastery.totalTerms}${termUnitLabel()}`
    : `完全習得 ${mastery.masteredTerms} / ${mastery.totalTerms}${termUnitLabel()}`;
  elements.progressBar.style.width = `${percent}%`;
}

function renderQuestion() {
  const term = currentTerm();
  const question = currentQuestion();
  if (!term || !question) {
    renderCompletion();
    return;
  }
  const vocabularyMode = state.subject?.learningType === "vocabulary";
  state.routineCompletionAction = "";
  state.routineTransition = null;
  const currentDeckEntry = deckForQuestion(question.id)?.entry;
  if (currentDeckEntry) {
    const currentDeckName = deckDisplayLabel(currentDeckEntry);
    elements.deckProgressName.textContent = currentDeckName.replaceAll("｜", " ");
    elements.deckProgressName.title = currentDeckName;
  }

  elements.completionCard.classList.add("is-hidden");
  elements.contextCard.classList.remove("is-hidden");
  elements.questionCard.classList.remove("is-hidden");
  elements.questionCard.classList.toggle("is-vocabulary", vocabularyMode);
  elements.actionDock.classList.remove("is-hidden");
  updateSpeechButtons();

  elements.contextCard.classList.toggle(
    "is-beginner-stage",
    question.stage === "beginner",
  );
  const hidesTerm = shouldHideTerm(question, state.answerVisible);
  elements.contextCard.classList.toggle("is-vocabulary", vocabularyMode);
  elements.contextCard.classList.toggle("is-hidden", vocabularyMode && hidesTerm);
  elements.stageName.classList.toggle("is-hidden", vocabularyMode);
  elements.stageName.textContent = vocabularyMode
    ? ""
    : questionStyleLabel(question.stage);
  elements.termTitle.textContent = hidesTerm
    ? vocabularyMode
      ? ""
      : questionStyleLabel(question.stage)
    : term.term;
  elements.termReading.textContent = hidesTerm
    ? vocabularyMode
      ? "答えを表示すると単語と品詞を確認できます"
      : "問題文とは別の用語欄と読みは、回答を表示するまで表示されません"
    : term.reading;
  elements.contextCard.classList.toggle("reveals-term", !hidesTerm);

  elements.questionNumber.textContent = `${
    isListeningMode() ? "聞き流し" : "出題"
  } ${state.answeredThisSession + 1}`;
  updateStudyTimeDisplay();
  const displayedQuestionPrompt = getQuestionPromptForDisplay(
    question,
    state.answerVisible,
  );
  elements.questionText.textContent = displayedQuestionPrompt;
  const answerDisplayText = getQuestionAnswerDisplayText(question);
  renderEmphasizedText(elements.answerText, answerDisplayText);
  elements.answerPanel.classList.toggle("is-hidden", !state.answerVisible);
  elements.answerNote.classList.toggle(
    "is-hidden",
    !state.answerVisible || !question.answerNote,
  );
  elements.answerNote.textContent = question.answerNote;
  renderVocabularySpeechGroups();

  const explanation = getQuestionExplanation(term, question);
  const yearMnemonic = getQuestionYearMnemonic(term, question);
  const showsYearMnemonic =
    state.answerVisible && Boolean(yearMnemonic);
  const showsTermOverview =
    state.answerVisible && (Boolean(explanation) || showsYearMnemonic);
  elements.termOverviewText.classList.toggle(
    "is-hidden",
    !state.answerVisible || !explanation,
  );
  elements.yearMnemonic.classList.toggle("is-hidden", !showsYearMnemonic);
  elements.yearMnemonicSpeech.classList.toggle(
    "is-hidden",
    !speechController.supported || !showsYearMnemonic,
  );
  elements.yearMnemonicText.textContent = prepareMnemonicDisplayText(
    yearMnemonic,
  );
  elements.overviewSpeech.classList.toggle(
    "is-hidden",
    !speechController.supported || !explanation,
  );
  renderEmphasizedText(
    elements.termOverviewText,
    explanation,
  );
  const showsTermImage = renderQuestionImage(question, state.answerVisible);
  const showsSupplement = showsTermOverview || showsTermImage;
  elements.termOverview.classList.toggle("is-hidden", !showsSupplement);
  renderTermTags(term, question, showsSupplement);

  renderActionControls();
  elements.queueProgress.textContent = isListeningMode()
    ? `一巡の残り ${state.queue.length + 1}問`
    : `この回の残り ${state.queue.length + 1}問`;
  renderRoutineSetupContext();
  elements.unlockNotice.textContent = state.unlockMessage;
  elements.unlockNotice.classList.toggle("is-hidden", !state.unlockMessage);
  state.unlockMessage = "";

  updateOverallProgress();
  setContentDensity(
    elements.questionCard,
    displayedQuestionPrompt,
    answerDisplayText,
    explanation,
    yearMnemonic,
  );
  const fittedAnswerElements = [elements.answerText];
  if (explanation) {
    fittedAnswerElements.push(elements.termOverviewText);
  }
  if (showsYearMnemonic) {
    fittedAnswerElements.push(elements.yearMnemonicText);
  }
  fitTextInsideCard(
    elements.questionCard,
    fittedAnswerElements,
    state.answerVisible,
  );
}

function renderCompletion() {
  speechController.stop();
  state.currentTask = null;
  elements.contextCard.classList.add("is-hidden");
  elements.questionCard.classList.add("is-hidden");
  elements.completionCard.classList.remove("is-hidden");
  const listening = isListeningMode();
  elements.completionReturn.classList.remove("is-hidden");
  elements.completionHome.classList.add("is-hidden");
  elements.routineResultSummary.classList.add("is-hidden");
  renderRatingResult(
    activeRoutineItem()?.ratingCounts ?? state.ratingCounts,
  );
  const routineItem = activeRoutineItem();
  const waitsForMemorizeRetry =
    !listening && state.activeSession && state.retryQuestionIds.size > 0;
  if (
    routineItem &&
    routineRemainingCount(routineItem) > 0 &&
    !waitsForMemorizeRetry
  ) {
    state.routineCompletionAction = "reselect";
    state.routineTransition = null;
    elements.actionDock.classList.add("is-hidden");
    elements.listeningDock.classList.add("is-hidden");
    elements.completionEyebrow.textContent = "学習内容を選び直す";
    elements.completionTitle.textContent =
      `${routineSubjectTitle(routineItem.subjectId)}の現在出題できる問題をすべて終えました`;
    elements.completionMessage.textContent =
      `この項目は${routineItem.completedCount}／${routineItem.questionTarget}問まで完了しています。残り${routineRemainingCount(routineItem)}問を進めるデッキや学習方法を選んでください。`;
    elements.completionReturn.textContent =
      `残り${routineRemainingCount(routineItem)}問の学習内容を選ぶ`;
    updateOverallProgress();
    return;
  }
  state.routineCompletionAction = "";
  elements.completionReturn.textContent = "開始画面に戻る";
  if (listening) {
    elements.queueProgress.textContent = "一巡の残り 0問";
    elements.completionEyebrow.textContent = "一巡完了";
    elements.completionTitle.textContent = `聞き流しを${state.sessionTasks.length}問完了しました`;
    elements.completionMessage.textContent = `今回選んだ${state.terms.length}${termUnitLabel()}・${state.sessionTasks.length}問を一通り聞き終えました。学習時間は${formatStudyDuration(state.studySeconds)}です。`;
    renderActionControls();
    updateOverallProgress();
    return;
  }
  elements.completionEyebrow.textContent = "全段階完了";
  if (state.activeSession && state.retryQuestionIds.size > 0) {
    const nextReviewAt = nextPendingRetryAt();
    elements.completionTitle.textContent =
      "不正解だった問題の再出題を待っています";
    elements.completionMessage.textContent = nextReviewAt
      ? `${new Intl.DateTimeFormat("ja-JP", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(nextReviewAt))}以降に、この一周の続きとして再出題します。アプリを閉じても進行状況は保存されます。`
      : "復習時刻を確認できませんでした。開始画面へ戻って、前回の続きから再開してください。";
    schedulePendingReview();
    renderActionControls();
    updateOverallProgress();
    return;
  }
  const nextDueAt = getNextDueAt(
    state.terms,
    state.progress,
    state.subject.masteryTarget,
    state.selectedStage,
  );
  const mastery = getOverallMastery(
    state.terms,
    state.progress,
    state.subject.masteryTarget,
    activeStages(),
  );
  if (nextDueAt) {
    elements.completionTitle.textContent = "現在、復習時刻を迎えた問題はありません";
    elements.completionMessage.textContent = `次の復習は ${new Intl.DateTimeFormat("ja-JP", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(nextDueAt))} です。`;
  } else if (mastery.masteredTerms === mastery.totalTerms) {
    elements.completionMessage.textContent =
      "今回選んだ範囲を完全習得しました。復習予定は設定した間隔で追加されます。";
  } else {
    elements.completionTitle.textContent = "現在出題できる問題はありません";
    elements.completionMessage.textContent =
      "前段階の問題を習得すると、次の段階がデッキへ追加されます。";
  }
  renderActionControls();
  updateOverallProgress();
}

function buildQueue() {
  const tasks = (usesOneQuestionPerTerm()
    ? createTermQuestionQueue
    : createQuestionQueue)(
    state.terms,
    state.progress,
    state.subject.masteryTarget,
    state.selectedStage,
  );
  state.queue = state.shuffleEnabled ? shuffleTasks(tasks) : tasks;
}

function applyQuestionRating(term, question, rating) {
  const stageBefore = state.selectedStage
    ? null
    : getTermStage(term, state.progress, state.subject.masteryTarget);
  rateQuestion(
    state.progress,
    question.id,
    rating,
    state.subject.masteryTarget,
    state.reviewSettings,
  );
  if (state.selectedStage || usesOneQuestionPerTerm()) {
    return;
  }
  const stageAfter = getTermStage(
    term,
    state.progress,
    state.subject.masteryTarget,
  );
  if (stageAfter === stageBefore) {
    return;
  }
  if (stageAfter === "complete") {
    state.unlockMessage = `${term.term}を完全習得しました。`;
    return;
  }
  addTasksToActiveSession(
    getTasksForStage(term, stageAfter, state.progress),
  );
}

async function rateListeningQuestion(rating) {
  const term = currentTerm();
  const question = currentQuestion();
  if (!term || !question || !state.answerVisible || state.saving) {
    return;
  }
  const resumesFromPause = state.listeningPaused;
  stopListeningSequence();
  ratingSoundPlayer.play(rating);
  stopStudyClock();
  state.saving = true;
  renderActionControls();
  const pendingStudySessionSave = studySessionSave.catch(() => {});
  const pendingStudyTimeSave = queueCurrentStudyTimeSave();
  const snapshot = createRatingUndoSnapshot({
    progress: state.progress,
    questionId: question.id,
    queue: state.queue,
    currentTask: state.currentTask,
    answerVisible: state.answerVisible,
    answeredThisSession: state.answeredThisSession,
    ratingCounts: state.ratingCounts,
    unlockMessage: state.unlockMessage,
  });
  snapshot.studySession = captureActiveSession();
  if (state.inRoutine) {
    snapshot.routineRun = normalizeStudyRoutineRun(state.routineRun);
  }
  const activity = createRatingActivity(question.id);
  snapshot.studyActivityEventId = activity.eventId;
  snapshot.studyActivityDatasetVersion = datasetVersionForQuestion(question.id);
  const historyBefore = [...state.history];

  state.ratingCounts = addRatingCount(state.ratingCounts, rating);
  applyQuestionRating(term, question, rating);
  state.unseenQuestionIds.delete(question.id);
  state.retryQuestionIds.delete(question.id);
  state.answeredThisSession += 1;
  state.currentTask = null;
  ensureUnseenTasksQueued();
  state.currentTask = state.queue.shift() ?? null;
  state.answerVisible = false;
  state.answerRevealedAt = 0;
  const routineChange = recordActiveRoutineQuestion(
    question.id,
    state.screenStudySeconds,
    rating,
  );
  const listeningPassComplete = !state.currentTask;
  const sessionComplete =
    listeningPassComplete && state.retryQuestionIds.size === 0;
  if (sessionComplete) {
    state.activeSession = false;
    state.listeningPaused = true;
  }
  startNewStudyScreen();
  if (!routineChange?.completedItem) {
    renderQuestion();
  }
  window.scrollTo({ top: 0, behavior: "smooth" });

  try {
    await pendingStudySessionSave;
    await pendingStudyTimeSave;
    const saved = await saveCloudStudyAnswer(
      snapshot.studyActivityDatasetVersion,
      question.id,
      state.progress.questions[question.id],
      captureActiveSession(),
      {
        studyMode: "listen-answer",
        activity,
        sessionDatasetVersion: state.sessionDatasetVersion,
        routineRun: routineChange?.changed ? state.routineRun : undefined,
      },
    );
    setSavedSessionForMode("listen-answer", saved.session);
  } catch (error) {
    restoreRatingUndoSnapshot(state.progress, snapshot);
    restoreActiveSession(snapshot.studySession, { updateControls: false });
    if (Object.hasOwn(snapshot, "routineRun")) {
      restoreRoutineRun(snapshot.routineRun);
    }
    state.history = historyBefore;
    state.answerVisible = true;
    state.listeningPaused = true;
    state.unlockMessage = error.message;
    state.saving = false;
    ensureCurrentStudyScreen();
    renderQuestion();
    return;
  }

  pushHistory(snapshot);
  state.saving = false;
  if (routineChange?.completedItem) {
    if (sessionComplete) {
      setSavedSessionForMode("listen-answer", null);
    }
    showRoutineStepCompletion(routineChange);
    return;
  }
  if (listeningPassComplete) {
    state.listeningPaused = true;
    if (sessionComplete) {
      setSavedSessionForMode("listen-answer", null);
    }
    renderActionControls();
    return;
  }
  state.listeningPaused = false;
  if (resumesFromPause) {
    showListeningPlaybackFeedback("play");
  }
  startStudyClock();
  const nextQuestionRunId = ++state.listeningRunId;
  state.listeningTimer = window.setTimeout(() => {
    state.listeningTimer = null;
    if (
      nextQuestionRunId === state.listeningRunId &&
      !state.listeningPaused &&
      isListeningMode()
    ) {
      beginListeningQuestion();
    }
  }, state.listeningQuestionIntervalSeconds * 1000);
}

async function rateCurrentQuestion(rating) {
  if (isListeningMode()) {
    await rateListeningQuestion(rating);
    return;
  }
  const term = currentTerm();
  const question = currentQuestion();
  if (
    !term ||
    !question ||
    !state.answerVisible ||
    state.saving
  ) {
    return;
  }
  speechController.stop();
  ratingSoundPlayer.play(rating);
  stopStudyClock();
  state.saving = true;
  renderActionControls();
  const pendingStudySessionSave = studySessionSave.catch(() => {});
  const pendingStudyTimeSave = queueCurrentStudyTimeSave();

  const snapshot = createRatingUndoSnapshot({
    progress: state.progress,
    questionId: question.id,
    queue: state.queue,
    currentTask: state.currentTask,
    answerVisible: state.answerVisible,
    answeredThisSession: state.answeredThisSession,
    ratingCounts: state.ratingCounts,
    unlockMessage: state.unlockMessage,
  });
  snapshot.studySession = captureActiveSession();
  if (state.inRoutine) {
    snapshot.routineRun = normalizeStudyRoutineRun(state.routineRun);
  }
  const activity = createRatingActivity(question.id);
  snapshot.studyActivityEventId = activity.eventId;
  const historyBefore = [...state.history];
  state.ratingCounts = addRatingCount(state.ratingCounts, rating);
  applyQuestionRating(term, question, rating);

  state.unseenQuestionIds.delete(question.id);
  if (rating === "again") {
    state.retryQuestionIds.add(question.id);
  } else {
    state.retryQuestionIds.delete(question.id);
  }
  state.answeredThisSession += 1;
  state.currentTask = null;
  enqueueDueSessionTasks();
  ensureUnseenTasksQueued();
  state.currentTask = state.queue.shift() ?? null;
  state.answerVisible = false;
  state.answerRevealedAt = 0;
  if (
    !state.currentTask &&
    state.unseenQuestionIds.size === 0 &&
    state.retryQuestionIds.size === 0
  ) {
    state.activeSession = false;
  }
  startRoutineOvertimeIfNeeded(rating);
  const routineChange = recordActiveRoutineQuestion(
    question.id,
    state.screenStudySeconds,
    rating,
    { deferCompletion: hasPendingRoutineOvertimeReview() },
  );
  if (routineChange?.completedItem) clearRoutineOvertime();
  startNewStudyScreen();

  if (!routineChange?.completedItem) {
    renderQuestion();
    autoSpeakQuestion();
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
  try {
    await pendingStudySessionSave;
    await pendingStudyTimeSave;
    const saved = await saveCloudStudyAnswer(
      datasetVersionForQuestion(question.id),
      question.id,
      state.progress.questions[question.id],
      captureActiveSession(),
      {
        studyMode: "memorize",
        activity,
        sessionDatasetVersion: state.sessionDatasetVersion,
        routineRun: routineChange?.changed ? state.routineRun : undefined,
      },
    );
    setSavedSessionForMode("memorize", saved.session);
  } catch (error) {
    speechController.stop();
    restoreRatingUndoSnapshot(state.progress, snapshot);
    restoreActiveSession(snapshot.studySession, { updateControls: false });
    if (Object.hasOwn(snapshot, "routineRun")) {
      restoreRoutineRun(snapshot.routineRun);
    }
    state.history = historyBefore;
    state.unlockMessage = error.message;
    state.saving = false;
    ensureCurrentStudyScreen();
    renderQuestion();
    return;
  }
  state.saving = false;
  pushHistory(snapshot);
  if (routineChange?.completedItem) {
    showRoutineStepCompletion(routineChange);
    return;
  }
  startStudyClock();
  renderActionControls();
}

async function resetAllProgress() {
  if (!state.cloudReady || state.saving) {
    return;
  }
  state.saving = true;
  elements.resetProgress.disabled = true;
  try {
    const datasetVersions = new Set([
      state.sessionDatasetVersion,
      ...state.activeDeckIds.map(
        (deckId) => state.loadedDecks.get(deckId)?.subject.version,
      ),
    ]);
    await Promise.all(
      [...datasetVersions].filter(Boolean).map(resetCloudProgress),
    );
  } catch (error) {
    elements.selectionSummary.textContent = error.message;
    state.saving = false;
    elements.resetProgress.disabled = false;
    return;
  }
  state.progress = createEmptyProgress();
  state.savedSessions = createEmptySavedSessions();
  state.activeSession = false;
  state.sessionTasks = [];
  state.unseenQuestionIds = new Set();
  state.retryQuestionIds = new Set();
  state.sessionStartedAt = null;
  clearRoutineOvertime();
  clearPendingReviewTimer();
  state.activeDeckIds.forEach((deckId) => {
    const deck = state.loadedDecks.get(deckId);
    if (deck) clearLegacyProgress(deck);
  });
  state.answeredThisSession = 0;
  state.ratingCounts = createEmptyRatingCounts();
  state.studySeconds = 0;
  state.screenStudySeconds = 0;
  state.studyTimeEventId = "";
  state.studyTimeSavedSeconds = 0;
  state.unlockMessage = "";
  state.queue = [];
  state.currentTask = null;
  state.answerVisible = false;
  state.history = [];
  state.answerRevealedAt = 0;
  state.saving = false;
  elements.resetProgress.disabled = false;
  updateSetupPreview();
  elements.cloudStatus.textContent = "学習記録をCloudflare上で初期化しました。";
}

async function beginStudy() {
  if (startingStudy) {
    return;
  }
  const selectedTerms = filterTermsBySelection(
    state.allTerms,
    selectedFilters(),
  );
  if (selectedTerms.length === 0 || !state.cloudReady) {
    updateSetupPreview();
    return;
  }
  const studyMode = selectedStudyMode();
  const savedSession = switchStudySessionMode(
    savedSessionForMode(studyMode),
    studyMode,
  );
  if (
    savedSession &&
    !window.confirm(
      "前回の一周を終了し、現在の条件ではじめから学習しますか？\n問題ごとの正誤記録と復習日時は消えません。",
    )
  ) {
    return;
  }

  startingStudy = true;
  elements.startStudy.disabled = true;
  try {
    await queueSetupPreferenceSave();
  } catch (error) {
    elements.cloudStatus.textContent = `開始設定を共有できませんでした。${error.message}`;
    startingStudy = false;
    updateSetupPreview();
    return;
  }

  setStudyTerms(selectedTerms);
  state.selectedStage = elements.questionStyleFilter.value;
  state.questionAmountMode = selectedQuestionAmountMode();
  state.studyMode = studyMode;
  state.shuffleEnabled = elements.setupShuffle.checked;
  speechController.stop();
  clearPendingReviewTimer();
  if (setupMatchesSession(savedSession, selectedTerms)) {
    const validQuestionIds = new Set(state.questionById.keys());
    state.queue = savedSession.tasks
      .filter((task) => validQuestionIds.has(task.questionId))
      .map(cloneTask);
  } else {
    buildQueue();
  }
  state.sessionTasks = state.queue.map(cloneTask);
  state.unseenQuestionIds = new Set(
    state.sessionTasks.map((task) => task.questionId),
  );
  state.retryQuestionIds = new Set();
  state.currentTask = state.queue.shift() ?? null;
  clearRoutineOvertime();
  state.answerVisible = false;
  state.answeredThisSession = 0;
  state.ratingCounts = createEmptyRatingCounts();
  state.studySeconds = 0;
  state.screenStudySeconds = 0;
  state.studyTimeEventId = "";
  state.studyTimeSavedSeconds = 0;
  state.unlockMessage = "";
  state.history = [];
  state.answerRevealedAt = 0;
  state.listeningPaused = false;
  state.pendingListeningActivity = null;
  state.sessionStartedAt = new Date().toISOString();
  state.activeSession = state.sessionTasks.length > 0;
  startNewStudyScreen();
  clearListeningTimer();
  const startsMemorizeScreenBeforeSave = !isListeningMode();
  if (startsMemorizeScreenBeforeSave) {
    state.saving = true;
    showOnly(elements.studyShell);
    renderQuestion();
    autoSpeakQuestion();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  try {
    if (state.activeSession) {
      const saved = await saveCloudStudySession(
        state.sessionDatasetVersion,
        captureActiveSession(),
      );
      setSavedSessionForMode(studyMode, saved);
    } else {
      await deleteCloudStudySession(state.sessionDatasetVersion);
      setSavedSessionForMode(studyMode, null);
    }
  } catch (error) {
    speechController.stop();
    stopStudyClock({ capture: false });
    state.activeSession = false;
    state.saving = false;
    elements.cloudStatus.textContent = `一周を保存できませんでした。${error.message}`;
    startingStudy = false;
    showOnly(elements.setupPanel);
    updateSetupPreview();
    return;
  }

  const questionCount = countQuestions(state.terms, activeStages());
  const selectedStyle = questionStyleLabel(state.selectedStage);
  elements.completionTitle.textContent = state.selectedStage
    ? `${selectedStyle}：${state.terms.length}${termUnitLabel()}・${questionCount}問を習得しました`
    : `${state.terms.length}${termUnitLabel()}・${questionCount}問を完全習得しました`;
  if (!startsMemorizeScreenBeforeSave) {
    showOnly(elements.studyShell);
    beginListeningQuestion();
  } else {
    state.saving = false;
    renderActionControls();
  }
  if (!startsMemorizeScreenBeforeSave) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  startingStudy = false;
}

async function resumeStudy() {
  const requestedStudyMode = selectedStudyMode();
  const savedStudySession = savedSessionForMode(requestedStudyMode);
  const studyMode = activeRoutineItem()?.overtimePending
    ? savedStudySession?.studyMode ?? requestedStudyMode
    : requestedStudyMode;
  const savedSession = switchStudySessionMode(
    savedStudySession,
    studyMode,
  );
  if (startingStudy || !savedSession || !state.cloudReady) return;
  startingStudy = true;
  elements.resumeStudy.disabled = true;
  elements.startStudy.disabled = true;
  clearPendingReviewTimer();
  speechController.stop();
  if (!restoreActiveSession(savedSession)) {
    await deleteCloudStudySession(state.sessionDatasetVersion).catch(() => {});
    setSavedSessionForMode(studyMode, null);
    state.activeSession = false;
    elements.cloudStatus.textContent = "前回の一周を復元できなかったため、はじめから開始してください。";
    startingStudy = false;
    updateSetupPreview();
    return;
  }
  if (isListeningMode() && !speechController.supported) {
    elements.cloudStatus.textContent = "この端末では、前回の聞き流しを再開できません。";
    startingStudy = false;
    updateSetupPreview();
    return;
  }
  enqueueDueSessionTasks();
  ensureUnseenTasksQueued();
  if (!state.currentTask) {
    state.currentTask = state.queue.shift() ?? null;
  }
  if (
    isListeningMode() &&
    !state.currentTask &&
    state.retryQuestionIds.size === 0
  ) {
    await deleteCloudStudySession(
      state.sessionDatasetVersion,
    ).catch(() => {});
    setSavedSessionForMode("listen-answer", null);
    state.activeSession = false;
    elements.cloudStatus.textContent = "前回の聞き流しは一巡を完了しています。はじめから開始してください。";
    startingStudy = false;
    updateSetupPreview();
    return;
  }
  ensureCurrentStudyScreen();
  state.answerVisible = state.answerVisible && Boolean(state.currentTask);
  state.listeningPaused = false;
  clearListeningTimer();
  const resumesMemorizeScreenBeforeSave = !isListeningMode();
  if (resumesMemorizeScreenBeforeSave) {
    state.saving = true;
    showOnly(elements.studyShell);
    renderQuestion();
    autoSpeakQuestion();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  try {
    const saved = await saveCloudStudySession(
      state.sessionDatasetVersion,
      captureActiveSession(),
    );
    setSavedSessionForMode(studyMode, saved);
  } catch (error) {
    speechController.stop();
    stopStudyClock({ capture: false });
    state.saving = false;
    elements.cloudStatus.textContent = `前回の一周を再開できませんでした。${error.message}`;
    startingStudy = false;
    showOnly(elements.setupPanel);
    updateSetupPreview();
    return;
  }
  if (!resumesMemorizeScreenBeforeSave) {
    showOnly(elements.studyShell);
    beginListeningQuestion();
  } else {
    state.saving = false;
    renderActionControls();
  }
  if (!resumesMemorizeScreenBeforeSave) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  startingStudy = false;
}

async function activateDecks(deckIds) {
  const selected = new Set(deckIds);
  const deckEntries = state.deckEntries.filter((deck) => selected.has(deck.id));
  if (deckEntries.length === 0) {
    throw new Error("学習するデッキを1つ以上選択してください。");
  }
  const loadToken = state.deckLoadToken + 1;
  state.deckLoadToken = loadToken;
  const deckInputs = [...elements.deckFilter.querySelectorAll("input")];
  deckInputs.forEach((input) => {
    input.disabled = true;
  });

  const loaded = await Promise.all(
    deckEntries.map(async (entry) => {
      const subject = await fetchJson(entry.indexPath);
      const chunks = await Promise.all(
        subject.chunks.map((chunk) => fetchJson(chunk.path)),
      );
      return { entry, subject, terms: chunks.flatMap((chunk) => chunk.terms) };
    }),
  );
  if (loadToken !== state.deckLoadToken) return;

  const firstSubject = loaded[0].subject;
  if (
    loaded.some(
      (deck) =>
        deck.subject.id !== firstSubject.id ||
        deck.subject.learningType !== firstSubject.learningType ||
        deck.subject.masteryTarget !== firstSubject.masteryTarget,
    )
  ) {
    throw new Error("学習方式の異なるデッキは同時に選択できません。");
  }
  const questionDeckById = new Map();
  const termDeckById = new Map();
  for (const deck of loaded) {
    for (const term of deck.terms) {
      if (termDeckById.has(term.id)) {
        throw new Error(`複数デッキで用語番号が重複しています（${term.id}）。`);
      }
      termDeckById.set(term.id, deck);
      for (const stage of learningStages) {
        for (const question of term.stages[stage] ?? []) {
          if (questionDeckById.has(question.id)) {
            throw new Error(`複数デッキで問題番号が重複しています（${question.id}）。`);
          }
          questionDeckById.set(question.id, deck);
        }
      }
    }
  }
  state.activeDeckIds = deckEntries.map((deck) => deck.id);
  state.activeDeckId = state.activeDeckIds[0];
  state.loadedDecks = new Map(loaded.map((deck) => [deck.entry.id, deck]));
  state.questionDeckById = questionDeckById;
  state.termDeckById = termDeckById;
  state.sessionDatasetVersion = createSessionDatasetVersion(
    state.activeSubjectId,
    state.activeDeckIds,
    new Map(
      loaded.map((deck) => [deck.entry.id, deck.subject.version]),
    ),
  );
  state.subject = {
    ...firstSubject,
    version: state.sessionDatasetVersion,
    termCount: loaded.reduce((total, deck) => total + deck.terms.length, 0),
    questionCount: loaded.reduce(
      (total, deck) => total + countQuestions(deck.terms),
      0,
    ),
  };
  state.allTerms = loaded.flatMap((deck) => deck.terms);
  state.historySpeechReadings =
    state.subject.learningType !== "vocabulary"
      ? createHistorySpeechReadings(state.allTerms)
      : {};
  state.terms = [];
  state.termById = new Map();
  state.questionById = new Map();
  try {
    await loadProgressFromCloud();
  } catch (error) {
    state.progress = createEmptyProgress();
    state.savedSessions = createEmptySavedSessions();
    state.reviewSettings = { ...defaultReviewSettings };
    state.shuffleEnabled = false;
    state.listeningPauseSeconds = 0;
    state.listeningQuestionIntervalSeconds = 0;
    state.studyRoutineOvertimeSeconds = defaultStudyRoutineOvertimeSeconds;
    state.studyTimeLimitSeconds = defaultStudyTimeLimitSeconds;
    state.speechParts = normalizeSpeechParts();
    syncRoutinePreferences(normalizeSetupPreferences());
    state.cloudReady = false;
    state.cloudError = error.message;
  }
  if (loadToken !== state.deckLoadToken) return;

  state.queue = [];
  state.currentTask = null;
  state.sessionTasks = [];
  state.unseenQuestionIds = new Set();
  state.retryQuestionIds = new Set();
  state.sessionStartedAt = null;
  clearRoutineOvertime();
  state.activeSession = false;
  clearPendingReviewTimer();
  state.answerVisible = false;
  state.answeredThisSession = 0;
  state.ratingCounts = createEmptyRatingCounts();
  state.studySeconds = 0;
  state.screenStudySeconds = 0;
  state.studyTimeEventId = "";
  state.studyTimeSavedSeconds = 0;
  state.unlockMessage = "";
  state.history = [];
  state.answerRevealedAt = 0;
  state.studyMode = "memorize";
  state.listeningPaused = false;
  state.pendingListeningActivity = null;
  clearListeningTimer();
  state.saving = false;
  elements.macroRegionFilter.value = "";
  elements.regionDetailFilter.value = "";
  elements.categoryFilter.value = "";
  deckInputs.forEach((input) => {
    input.checked = state.activeDeckIds.includes(input.value);
    input.disabled = false;
  });
  const deckNames = deckEntries.map(deckDisplayLabel);
  const shortDeckNames = deckNames.map((name) => name.split("｜")[0]);
  elements.subjectName.textContent = `${state.subject.title}｜${
    deckEntries.length === 1 ? shortDeckNames[0] : `${deckEntries.length}デッキ`
  }`;
  elements.deckProgressName.textContent = shortDeckNames.join("・");
  elements.deckProgressName.title = deckNames.join("／");
  elements.setupEyebrow.textContent = `v0.146｜${state.subject.title}を学ぶ`;
  elements.setupTitle.textContent = `${state.subject.title}の学習範囲を選ぶ`;
  const cardFilterLabels = Object.values(state.subject.filterLabels ?? {})
    .filter(Boolean)
    .join("、");
  elements.setupDescription.textContent =
    state.subject.learningType === "vocabulary"
      ? "複数のデッキ、品詞、出題方向を選んで学習できます。シャッフル時は選択デッキ全体を混ぜて出題します。"
      : state.subject.learningType === "cards"
        ? `複数のデッキ${cardFilterLabels ? `、${cardFilterLabels}` : ""}を選んで学習できます。シャッフル時は選択デッキ全体を混ぜて出題します。`
        : "複数のデッキをまとめて学習できます。シャッフル時は選択デッキ全体を混ぜて出題します。";
  configureSetup();
  if (!state.cloudReady && state.cloudError) {
    elements.cloudStatus.innerHTML = `${state.cloudError}　<a href="/settings.html">設定ページを開く</a>`;
  }
}

function renderSubjectOptions() {
  elements.subjectOptions.replaceChildren(
    ...state.subjectEntries.map((subject) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "subject-choice";
      button.dataset.subjectId = subject.id;
      const title = document.createElement("strong");
      title.textContent = subject.title;
      const description = document.createElement("small");
      description.textContent = `${subject.description}（${subject.termCount}${termUnitLabel(subject)}・${subject.questionCount}問）`;
      button.append(title, description);
      return button;
    }),
    (() => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "subject-choice random-video-choice";
      button.dataset.randomVideoAction = "play";
      const title = document.createElement("strong");
      title.textContent = "覚え歌をランダム再生";
      const description = document.createElement("small");
      description.textContent = "登録動画から重複なく1本を選んで再生する";
      button.append(title, description);
      return button;
    })(),
  );
}

function showSubjectSelection() {
  stopListeningSequence();
  state.inRoutine = false;
  state.standaloneVideoMode = false;
  state.routineCompletionAction = "";
  state.routineTransition = null;
  state.activeSession = false;
  state.currentTask = null;
  state.queue = [];
  state.answerVisible = false;
  elements.subjectName.textContent = "科目を選択";
  renderRoutineDashboard();
  renderSubjectOptions();
  showOnly(elements.subjectPanel);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function activateSubject(subjectId) {
  const subjectEntry = state.subjectEntries.find(
    (subject) => subject.id === subjectId,
  );
  if (!subjectEntry) {
    throw new Error("選択した科目が見つかりません。");
  }
  state.activeSubjectId = subjectEntry.id;
  state.deckEntries =
    Array.isArray(subjectEntry.decks) && subjectEntry.decks.length > 0
      ? subjectEntry.decks
      : [{ ...subjectEntry, id: "deck-1" }];
  const defaultDeckId = subjectEntry.defaultDeckId ?? state.deckEntries[0].id;
  const savedSubject = state.setupPreferences.subjects[subjectEntry.id];
  const requestedDeckIds = savedSubject?.selectedDeckIds?.length
    ? savedSubject.selectedDeckIds
    : [savedSubject?.lastDeckId];
  const selectedDeckIds = normalizeDeckSelection(
    state.deckEntries.map((deck) => deck.id),
    requestedDeckIds,
    defaultDeckId,
  );
  setDeckOptions(state.deckEntries, selectedDeckIds);
  await activateDecks(selectedDeckIds);
}

async function start() {
  showOnly(elements.loadingPanel);
  try {
    const [catalog, questionImages] = await Promise.all([
      fetchJson("index.json"),
      loadQuestionImages(),
    ]);
    if (
      catalog.schemaVersion !== 3 ||
      !Array.isArray(catalog.subjects) ||
      catalog.subjects.length === 0
    ) {
      throw new Error("科目一覧の形式が正しくありません。");
    }
    state.catalog = catalog;
    state.subjectEntries = catalog.subjects;
    state.questionImages = questionImages;
    if (getStoredAccessKey()) {
      try {
        const cloudState = await loadCloudState();
        state.shuffleEnabled = cloudState.settings.shuffleEnabled;
        state.listeningPauseSeconds = normalizeListeningPauseSeconds(
          cloudState.settings.listeningPauseSeconds,
        );
        state.listeningQuestionIntervalSeconds =
          normalizeListeningQuestionIntervalSeconds(
            cloudState.settings.listeningQuestionIntervalSeconds,
          );
        state.studyRoutineOvertimeSeconds = normalizeStudyRoutineOvertimeSeconds(
          cloudState.settings.studyRoutineOvertimeSeconds,
        );
        state.studyTimeLimitSeconds = normalizeStudyTimeLimitSeconds(
          cloudState.settings.studyTimeLimitSeconds,
        );
        state.speechParts = normalizeSpeechParts(cloudState.settings.speechParts);
        syncRoutinePreferences(
          cloudState.settings.setupPreferences,
          cloudState.studyDate,
        );
        state.cloudConnected = true;
        saveSpeechSettings(cloudState.settings);
        await syncRatingSoundSettings(cloudState.settings);
      } catch {
        syncRoutinePreferences(normalizeSetupPreferences());
        await syncRatingSoundSettings({
          ratingSoundVolume: defaultRatingSoundVolume,
          ratingSounds: normalizeRatingSounds(),
        });
        state.cloudConnected = false;
      }
    } else {
      await syncRatingSoundSettings({
        ratingSoundVolume: defaultRatingSoundVolume,
        ratingSounds: normalizeRatingSounds(),
      });
      state.cloudConnected = false;
    }
    showSubjectSelection();
  } catch (error) {
    elements.errorMessage.textContent = error.message;
    showOnly(elements.errorPanel);
  }
}

elements.subjectOptions.addEventListener("click", (event) => {
  const randomVideoButton = event.target.closest(
    "button[data-random-video-action='play']",
  );
  if (randomVideoButton) {
    randomVideoButton.disabled = true;
    void showStandaloneRandomVideo().catch((error) => {
      state.standaloneVideoMode = false;
      elements.errorMessage.textContent = error.message;
      showOnly(elements.errorPanel);
    });
    return;
  }
  const button = event.target.closest("button[data-subject-id]");
  if (!button) return;
  state.inRoutine = false;
  showOnly(elements.loadingPanel);
  void setupPreferenceSave
    .catch(() => {})
    .then(() => activateSubject(button.dataset.subjectId))
    .then(() => {
      showOnly(elements.setupPanel);
      queueVisibleSetupPreferenceSave();
    })
    .catch((error) => {
      elements.errorMessage.textContent = error.message;
      showOnly(elements.errorPanel);
    });
});
document.addEventListener(
  "click",
  () => {
    speechController.unlock();
  },
  { capture: true },
);
elements.startRoutine.addEventListener("click", () => {
  void startRoutineFromBeginning();
});
elements.continueRoutine.addEventListener("click", () => {
  void continueRoutine();
});
elements.routineVideoComplete.addEventListener("click", () => {
  if (state.standaloneVideoMode) {
    elements.routineVideoComplete.disabled = true;
    void showStandaloneRandomVideo().catch((error) => {
      state.standaloneVideoMode = false;
      elements.errorMessage.textContent = error.message;
      showOnly(elements.errorPanel);
    });
  } else {
    void completeCurrentRoutineVideo();
  }
});
elements.routineVideoHome.addEventListener("click", () => {
  showSubjectSelection();
});

elements.deckFilter.addEventListener("change", () => {
  const deckIds = selectedDeckIds();
  if (deckIds.length === 0) {
    const fallback = state.activeDeckIds[0] ?? state.deckEntries[0]?.id;
    const input = elements.deckFilter.querySelector(`input[value="${fallback}"]`);
    if (input) input.checked = true;
    elements.cloudStatus.textContent = "デッキは1つ以上選択してください。";
    return;
  }
  showOnly(elements.loadingPanel);
  void setupPreferenceSave
    .catch(() => {})
    .then(() => activateDecks(deckIds))
    .then(() => {
      showOnly(elements.setupPanel);
      queueVisibleSetupPreferenceSave();
    })
    .catch((error) => {
      elements.errorMessage.textContent = error.message;
      showOnly(elements.errorPanel);
    });
});
elements.macroRegionFilter.addEventListener("change", () => {
  updateRegionDetailOptions(true);
  updateSetupPreview();
  queueVisibleSetupPreferenceSave();
});
for (const control of [
  elements.regionDetailFilter,
  elements.categoryFilter,
  elements.questionStyleFilter,
  elements.questionAmountFilter,
]) {
  control.addEventListener("change", () => {
    updateSetupPreview();
    queueVisibleSetupPreferenceSave();
  });
}
for (const option of elements.studyModeOptions) {
  option.addEventListener("change", () => {
    updateSetupPreview();
    queueVisibleSetupPreferenceSave();
  });
}
elements.setupShuffle.addEventListener("change", () => {
  updateSetupPreview();
  queueVisibleSetupPreferenceSave();
});
elements.startStudy.addEventListener("click", () => void beginStudy());
elements.resumeStudy.addEventListener("click", () => void resumeStudy());
elements.homeLink.addEventListener("click", (event) => {
  event.preventDefault();
  void returnToSubjectSelection();
});
elements.changeSubject.addEventListener("click", () => {
  void returnToSubjectSelection();
});

elements.studyMenuTrigger.addEventListener("click", openStudyMenu);
elements.studyMenuClose.addEventListener("click", () => closeStudyMenu());
elements.studyMenuBackdrop.addEventListener("click", () => closeStudyMenu());
elements.studyMenuSetup.addEventListener("click", () => {
  closeStudyMenu({ resumeStudy: false });
  void returnToSetup();
});
elements.studyMenuHome.addEventListener("click", () => {
  closeStudyMenu({ resumeStudy: false });
  void returnToSubjectSelection();
});
elements.studyMenuSpeechRate.addEventListener(
  "input",
  updateStudyMenuSpeechRateOutput,
);
elements.studyMenuSettings.addEventListener("submit", (event) => {
  event.preventDefault();
  void saveStudyMenuSettings();
});
elements.studyStop.addEventListener("click", () => void returnToSetup());
elements.backAction.addEventListener("click", goBackOneStep);
elements.nextAction.addEventListener("click", revealCurrentAnswer);
elements.listeningBackAction.addEventListener("click", () =>
  void goBackListeningOneStep(),
);
elements.listeningToggleAction.addEventListener("click", toggleListening);
elements.listeningNextAction.addEventListener("click", advanceListeningManually);
elements.questionSpeech.addEventListener("click", () =>
  toggleSpeechPart("question"),
);
elements.answerSpeech.addEventListener("click", () =>
  toggleSpeechPart("answer"),
);
elements.yearMnemonicSpeech.addEventListener("click", () =>
  toggleSpeechPart("mnemonic"),
);
for (const button of elements.vocabularySpeechButtons) {
  button.addEventListener("click", () =>
    toggleSpeechPart(`vocabulary-${button.dataset.vocabularySpeech}`),
  );
}
elements.overviewSpeech.addEventListener("click", () =>
  toggleSpeechPart("overview"),
);
elements.termImageContent.addEventListener("error", () => {
  elements.termImage.classList.add("is-hidden");
  elements.termOverviewMain.classList.remove("has-image", "image-only");
});
for (const button of elements.ratingActions) {
  button.addEventListener("click", () =>
    void rateCurrentQuestion(button.dataset.rating),
  );
}
elements.completionReturn.addEventListener("click", () => {
  if (state.routineCompletionAction === "next") {
    void launchRoutineCurrentStep().catch((error) => {
      elements.errorMessage.textContent = error.message;
      showOnly(elements.errorPanel);
    });
    return;
  }
  if (state.routineCompletionAction === "done") {
    showSubjectSelection();
    return;
  }
  void returnToSetup();
});
elements.completionHome.addEventListener("click", () => {
  void returnToSubjectSelection();
});

elements.resetProgress.addEventListener("click", () => {
  if (
    window.confirm(
      "選択中のデッキの正誤記録と復習予定を初期化しますか？\n日別の学習記録は残ります。",
    )
  ) {
    void resetAllProgress();
  }
});
elements.retryButton.addEventListener("click", start);

elements.studyShell.addEventListener("pointerdown", (event) => {
  if (
    !isListeningMode() ||
    !state.currentTask ||
    !window.matchMedia("(orientation: portrait) and (pointer: coarse)").matches ||
    event.target.closest("button, a, input, select, textarea, label")
  ) {
    listeningTouchStart = null;
    return;
  }
  listeningTouchStart = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
  };
});

elements.studyShell.addEventListener("pointerup", (event) => {
  const start = listeningTouchStart;
  listeningTouchStart = null;
  if (!start || start.pointerId !== event.pointerId) {
    return;
  }
  const horizontalDistance = event.clientX - start.x;
  const absoluteHorizontalDistance = Math.abs(horizontalDistance);
  const verticalDistance = Math.abs(event.clientY - start.y);
  if (
    absoluteHorizontalDistance < 60 ||
    absoluteHorizontalDistance <= verticalDistance * 1.2
  ) {
    return;
  }
  suppressNextListeningClick = true;
  window.setTimeout(() => {
    suppressNextListeningClick = false;
  }, 0);
  if (horizontalDistance > 0) {
    void goBackListeningOneStep();
  } else {
    advanceListeningManually();
  }
});

elements.studyShell.addEventListener("pointercancel", () => {
  listeningTouchStart = null;
});

elements.studyShell.addEventListener("click", (event) => {
  if (suppressNextListeningClick) {
    suppressNextListeningClick = false;
    return;
  }
  const usesStudyHalfScreenNavigation = window.matchMedia(
    "(orientation: landscape) and (max-height: 600px)",
  ).matches;
  const usesLandscapeListeningThirds =
    isListeningMode() &&
    Boolean(state.currentTask) &&
    usesStudyHalfScreenNavigation;
  const usesPortraitListeningTap =
    isListeningMode() &&
    Boolean(state.currentTask) &&
    window.matchMedia("(orientation: portrait) and (pointer: coarse)").matches;
  const usesListeningResultHalfScreenBack =
    isListeningMode() &&
    !state.currentTask &&
    window.matchMedia("(pointer: coarse)").matches;
  if (
    (!usesStudyHalfScreenNavigation &&
      !usesLandscapeListeningThirds &&
      !usesPortraitListeningTap &&
      !usesListeningResultHalfScreenBack) ||
    event.target.closest("button, a, input, select, textarea, label")
  ) {
    return;
  }
  if (usesPortraitListeningTap) {
    toggleListening();
    return;
  }
  if (usesLandscapeListeningThirds) {
    const touchZone = Math.min(
      2,
      Math.floor(event.clientX / (window.innerWidth / 3)),
    );
    if (touchZone === 0) {
      void goBackListeningOneStep();
    } else if (touchZone === 1) {
      toggleListening();
    } else {
      advanceListeningManually();
    }
    return;
  }
  if (event.clientX < window.innerWidth / 2) {
    if (isListeningMode()) {
      void goBackListeningOneStep();
    } else {
      goBackOneStep();
    }
  } else if (isListeningMode()) {
    toggleListening();
  } else {
    performRightSideAction(true);
  }
});

window.addEventListener("keydown", (event) => {
  if (state.studyMenuOpen) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeStudyMenu();
    }
    return;
  }
  if (
    event.target.closest("button, a, input, textarea, select") ||
    event.repeat
  ) {
    return;
  }
  if (isListeningMode()) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      void goBackListeningOneStep();
    } else if (
      state.currentTask && event.key === "ArrowRight"
    ) {
      event.preventDefault();
      advanceListeningManually();
    } else if (
      state.currentTask &&
      state.answerVisible &&
      /^[1-4]$/.test(event.key)
    ) {
      event.preventDefault();
      void rateCurrentQuestion(
        ["again", "hard", "good", "easy"][Number(event.key) - 1],
      );
    } else if (state.currentTask && (event.key === " " || event.key === "Enter")) {
      event.preventDefault();
      toggleListening();
    }
    return;
  }
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    goBackOneStep();
  } else if (state.currentTask && event.key === "ArrowRight") {
    event.preventDefault();
    performRightSideAction();
  } else if (state.currentTask && (event.key === " " || event.key === "Enter")) {
    event.preventDefault();
    if (state.answerVisible) {
      rateCurrentQuestion("good");
    } else {
      revealCurrentAnswer();
    }
  } else if (state.currentTask && state.answerVisible && /^[1-4]$/.test(event.key)) {
    event.preventDefault();
    rateCurrentQuestion(["again", "hard", "good", "easy"][Number(event.key) - 1]);
  }
});

window.addEventListener("resize", () => {
  if (state.currentTask && state.answerVisible) {
    const question = currentQuestion();
    const term = currentTerm();
    const explanation = getQuestionExplanation(term, question);
    const yearMnemonic = getQuestionYearMnemonic(term, question);
    const targets = [elements.answerText];
    if (explanation) {
      targets.push(elements.termOverviewText);
    }
    if (yearMnemonic) {
      targets.push(elements.yearMnemonicText);
    }
    fitTextInsideCard(
      elements.questionCard,
      targets,
      true,
    );
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopStudyClock({ includeHidden: true });
    void queueCurrentStudyTimeSave({ keepalive: true }).catch(() => {});
    if (!isListeningMode()) {
      speechController.stop();
    }
  } else {
    startStudyClock();
  }
});

window.addEventListener("pagehide", () => {
  stopStudyClock({ includeHidden: true });
  void queueCurrentStudyTimeSave({ keepalive: true }).catch(() => {});
  void ratingSoundPlayer.close();
});

start();
