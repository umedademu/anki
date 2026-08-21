import {
  createEmptyProgress,
  createQuestionQueue,
  createRatingUndoSnapshot,
  defaultReviewSettings,
  deserializeProgress,
  enqueueUniqueTasks,
  filterTermsBySelection,
  getIntegratedExplanationQuestion,
  getMacroRegionTags,
  getNextDueAt,
  getOverallMastery,
  getQuestionPromptForDisplay,
  getTasksForStage,
  getTermStage,
  learningStages,
  normalizeReviewSettings,
  rateQuestion,
  restoreRatingUndoSnapshot,
  shuffleTasks,
  shouldHideTerm,
} from "./learning-engine.js";
import {
  deleteCloudQuestion,
  getStoredAccessKey,
  importCloudProgress,
  loadCloudState,
  normalizeListeningPauseSeconds,
  resetCloudProgress,
  requestCloudSpeech,
  saveCloudSettings,
  saveCloudQuestion,
} from "./cloud-progress.js";
import {
  createSpeechController,
  createVocabularyListeningAnswerSequence,
  createVocabularySpeechGroups,
  vocabularySpeechGroupOrder,
  vocabularySpeechLayoutByStage,
} from "./speech.js";
import { loadSpeechSettings, saveSpeechSettings } from "./speech-settings.js";

const elements = {
  loadingPanel: document.querySelector("#loading-panel"),
  subjectPanel: document.querySelector("#subject-panel"),
  subjectOptions: document.querySelector("#subject-options"),
  setupPanel: document.querySelector("#setup-panel"),
  setupEyebrow: document.querySelector("#setup-eyebrow"),
  setupTitle: document.querySelector("#setup-title"),
  setupDescription: document.querySelector("#setup-description"),
  studyShell: document.querySelector("#study-shell"),
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
  studyModeOptions: document.querySelectorAll('input[name="study-mode"]'),
  listeningAnswerDescription: document.querySelector(
    "#listening-answer-description",
  ),
  listeningDetailTitle: document.querySelector("#listening-detail-title"),
  listeningDetailDescription: document.querySelector(
    "#listening-detail-description",
  ),
  setupShuffle: document.querySelector("#setup-shuffle"),
  setupSpeech: document.querySelector("#setup-speech"),
  speechChoice: document.querySelector(".speech-choice"),
  selectionSummary: document.querySelector("#selection-summary"),
  startStudy: document.querySelector("#start-study"),
  resetProgress: document.querySelector("#reset-progress"),
  changeSubject: document.querySelector("#change-subject"),
  cloudStatus: document.querySelector("#cloud-status"),
  subjectName: document.querySelector("#subject-name"),
  contextCard: document.querySelector("#context-card"),
  stageName: document.querySelector("#stage-name"),
  termTitle: document.querySelector("#term-title"),
  termReading: document.querySelector("#term-reading"),
  overallProgress: document.querySelector("#overall-progress"),
  termProgress: document.querySelector("#term-progress"),
  queueProgress: document.querySelector("#queue-progress"),
  progressBar: document.querySelector("#progress-bar"),
  questionCard: document.querySelector("#question-card"),
  questionNumber: document.querySelector("#question-number"),
  questionAxis: document.querySelector("#question-axis"),
  questionText: document.querySelector("#question-text"),
  questionSpeech: document.querySelector("#question-speech"),
  answerPanel: document.querySelector("#answer-panel"),
  answerText: document.querySelector("#answer-text"),
  answerSpeech: document.querySelector("#answer-speech"),
  vocabularySpeechGroups: document.querySelector("#vocabulary-speech-groups"),
  vocabularySpeechButtons: document.querySelectorAll("[data-vocabulary-speech]"),
  acceptedPanel: document.querySelector("#accepted-panel"),
  acceptedText: document.querySelector("#accepted-text"),
  answerNote: document.querySelector("#answer-note"),
  termOverview: document.querySelector("#term-overview"),
  termOverviewMain: document.querySelector("#term-overview-main"),
  termOverviewText: document.querySelector("#term-overview-text"),
  yearMnemonic: document.querySelector("#year-mnemonic"),
  yearMnemonicText: document.querySelector("#year-mnemonic-text"),
  yearMnemonicSpeech: document.querySelector("#year-mnemonic-speech"),
  termImage: document.querySelector("#term-image"),
  termImageLink: document.querySelector("#term-image-link"),
  termImageContent: document.querySelector("#term-image-content"),
  termImageCaption: document.querySelector("#term-image-caption"),
  termImageCreator: document.querySelector("#term-image-creator"),
  termImageLicense: document.querySelector("#term-image-license"),
  termTags: document.querySelector("#term-tags"),
  overviewSpeech: document.querySelector("#overview-speech"),
  actionDock: document.querySelector("#action-dock"),
  actionButtons: document.querySelector("#action-buttons"),
  backAction: document.querySelector("#back-action"),
  nextAction: document.querySelector("#next-action"),
  ratingButtons: document.querySelector("#rating-buttons"),
  incorrectAction: document.querySelector("#incorrect-action"),
  hardAction: document.querySelector("#hard-action"),
  goodAction: document.querySelector("#good-action"),
  easyAction: document.querySelector("#easy-action"),
  listeningDock: document.querySelector("#listening-dock"),
  listeningStatus: document.querySelector("#listening-status"),
  listeningToggle: document.querySelector("#listening-toggle"),
  listeningStop: document.querySelector("#listening-stop"),
  completionCard: document.querySelector("#completion-card"),
  completionTitle: document.querySelector("#completion-title"),
  completionMessage: document.querySelector("#completion-message"),
  unlockNotice: document.querySelector("#unlock-notice"),
};

const state = {
  catalog: null,
  subjectEntries: [],
  activeSubjectId: "",
  deckEntries: [],
  activeDeckId: "",
  deckLoadToken: 0,
  subject: null,
  allTerms: [],
  terms: [],
  termById: new Map(),
  questionById: new Map(),
  questionImages: new Map(),
  progress: createEmptyProgress(),
  progressKey: "",
  reviewSettings: { ...defaultReviewSettings },
  cloudReady: false,
  cloudError: "",
  saving: false,
  queue: [],
  currentTask: null,
  answerVisible: false,
  shuffleEnabled: false,
  autoSpeechEnabled: true,
  listeningPauseSeconds: 0,
  studyMode: "memorize",
  listeningPaused: false,
  listeningTimer: null,
  listeningRunId: 0,
  selectedStage: "",
  answeredThisSession: 0,
  unlockMessage: "",
  history: [],
  answerRevealedAt: 0,
};

const historyLimit = 200;
const halfScreenRatingDelay = 400;
let setupPreferenceSave = Promise.resolve();
let startingStudy = false;
const speechController = createSpeechController({
  requestCloudAudio: requestCloudSpeech,
  getSettings: loadSpeechSettings,
  onTargetChange: updateSpeechButtons,
});

const listeningModes = new Set(["listen-answer", "listen-explanation"]);
const vocabularySpeechLabels = {
  word: "英語",
  meaning: "日本語",
  "example-english": "例文英語",
  "example-japanese": "例文日本語",
};

function selectedStudyMode() {
  return (
    [...elements.studyModeOptions].find((option) => option.checked)?.value ??
    "memorize"
  );
}

function listeningContentLabel(studyMode = selectedStudyMode()) {
  if (studyMode !== "listen-explanation") {
    return state.subject?.learningType === "vocabulary"
      ? "問題文＋回答"
      : "問題文＋回答＋語呂合わせ";
  }
  return state.subject?.learningType === "vocabulary"
    ? "問題文＋回答＋例文"
    : "問題文＋回答＋語呂合わせ＋解説";
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
  if (panel !== elements.studyShell) {
    speechController.stop();
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
    elements.studyShell,
    elements.errorPanel,
  ].forEach((candidate) =>
    candidate.classList.toggle("is-hidden", candidate !== panel),
  );
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

function readLegacyProgress() {
  try {
    const saved = window.localStorage.getItem(state.progressKey);
    return deserializeProgress(saved, state.subject.masteryTarget);
  } catch {
    return createEmptyProgress();
  }
}

function clearLegacyProgress() {
  try {
    window.localStorage.removeItem(state.progressKey);
  } catch {
    // 旧記録を消せない環境でもCloudflare上の記録を優先する。
  }
}

async function loadProgressFromCloud() {
  state.cloudReady = false;
  state.cloudError = "";
  if (!getStoredAccessKey()) {
    state.progress = createEmptyProgress();
    state.reviewSettings = { ...defaultReviewSettings };
    state.shuffleEnabled = false;
    state.autoSpeechEnabled = true;
    state.listeningPauseSeconds = 0;
    return;
  }

  const cloudState = await loadCloudState(
    state.subject.masteryTarget,
    state.subject.version,
  );
  state.progress = cloudState.progress;
  state.reviewSettings = normalizeReviewSettings(cloudState.settings);
  state.shuffleEnabled = cloudState.settings.shuffleEnabled;
  state.autoSpeechEnabled = cloudState.settings.autoSpeechEnabled;
  state.listeningPauseSeconds = normalizeListeningPauseSeconds(
    cloudState.settings.listeningPauseSeconds,
  );
  saveSpeechSettings(cloudState.settings);

  const legacyProgress = readLegacyProgress();
  const missingLegacyQuestions = Object.fromEntries(
    Object.entries(legacyProgress.questions).filter(
      ([questionId]) => !(questionId in state.progress.questions),
    ),
  );
  if (Object.keys(missingLegacyQuestions).length > 0) {
    await importCloudProgress(state.subject.version, {
      questions: missingLegacyQuestions,
      updatedAt: legacyProgress.updatedAt,
    });
    state.progress.questions = {
      ...missingLegacyQuestions,
      ...state.progress.questions,
    };
  }
  clearLegacyProgress();
  state.cloudReady = true;
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
  const showsRatingActions = hasQuestion && state.answerVisible;
  elements.actionDock.classList.toggle("is-answer-visible", showsRatingActions);
  elements.actionDock.classList.toggle("is-back-only", !hasQuestion);
  elements.actionDock.classList.toggle(
    "is-hidden",
    listening || (!hasQuestion && !canGoBack),
  );
  elements.listeningDock.classList.toggle(
    "is-hidden",
    !listening || !hasQuestion,
  );
  elements.backAction.disabled = !canGoBack;
  elements.nextAction.classList.toggle(
    "is-hidden",
    !hasQuestion || state.answerVisible,
  );
  elements.ratingButtons.classList.toggle("is-hidden", !showsRatingActions);
  [
    elements.incorrectAction,
    elements.hardAction,
    elements.goodAction,
    elements.easyAction,
  ].forEach((button) => {
    button.disabled = state.saving;
  });
}

function revealCurrentAnswer() {
  if (isListeningMode() || !state.currentTask || state.answerVisible) {
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
}

async function goBackOneStep() {
  if (isListeningMode() || state.saving) {
    return;
  }
  speechController.stop();
  const snapshot = state.history.pop();
  if (!snapshot) {
    renderActionControls();
    return;
  }

  if (snapshot.type === "reveal") {
    state.currentTask = snapshot.currentTask
      ? { ...snapshot.currentTask }
      : state.currentTask;
    state.answerVisible = false;
  } else if (snapshot.type === "rating") {
    const restored = restoreRatingUndoSnapshot(state.progress, snapshot);
    if (!restored) {
      renderActionControls();
      return;
    }
    state.queue = restored.queue;
    state.currentTask = restored.currentTask;
    state.answerVisible = restored.answerVisible;
    state.answeredThisSession = restored.answeredThisSession;
    state.unlockMessage = restored.unlockMessage;
    state.saving = true;
    renderActionControls();
    try {
      if (snapshot.previousQuestionRecord) {
        await saveCloudQuestion(
          state.subject.version,
          snapshot.questionId,
          snapshot.previousQuestionRecord,
        );
      } else {
        await deleteCloudQuestion(state.subject.version, snapshot.questionId);
      }
    } catch (error) {
      const cloudState = await loadCloudState(
        state.subject.masteryTarget,
        state.subject.version,
      ).catch(() => null);
      if (cloudState) {
        state.progress = cloudState.progress;
        state.reviewSettings = cloudState.settings;
        buildQueue();
        state.currentTask = state.queue.shift() ?? null;
        state.answerVisible = false;
        state.history = [];
      } else {
        state.history.push(snapshot);
      }
      state.unlockMessage = error.message;
    } finally {
      state.saving = false;
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
  state.shuffleEnabled = elements.setupShuffle.checked;
  state.autoSpeechEnabled = elements.setupSpeech.checked;
  const patch = {
    shuffleEnabled: state.shuffleEnabled,
    autoSpeechEnabled: state.autoSpeechEnabled,
  };
  setupPreferenceSave = setupPreferenceSave
    .catch(() => {})
    .then(async () => {
      const saved = await saveCloudSettings(patch);
      state.shuffleEnabled = saved.shuffleEnabled;
      state.autoSpeechEnabled = saved.autoSpeechEnabled;
      elements.cloudStatus.textContent = "開始設定をCloudflareへ共有しました。";
      return saved;
    });
  return setupPreferenceSave;
}

function updateSpeechButtons(activeTarget = "") {
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
    const active = activeTarget === target;
    button.classList.toggle("is-speaking", active);
    button.setAttribute(
      "aria-label",
      active ? `${label}の読み上げを止める` : `${label}を読み上げる`,
    );
    button.title = active ? "読み上げを止める" : `${label}を読み上げる`;
    const icon = button.querySelector("span");
    if (icon) {
      icon.textContent = active ? "■" : "🔊";
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
    speechController.supported &&
    !isListeningMode();
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

function speechSegmentsFor(target) {
  const question = currentQuestion();
  const term = currentTerm();
  if (!question || !term) {
    return [];
  }
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
  const configuredSegments = question.speech?.[target];
  if (Array.isArray(configuredSegments) && configuredSegments.length > 0) {
    return configuredSegments.map((segment) => ({
      target,
      text: segment.text,
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
        text: [question.answer, question.answerNote].filter(Boolean).join("。"),
        language: "ja-JP",
      },
    ];
  }
  if (target === "mnemonic") {
    return [
      ...(question.yearMnemonic
        ? [
            {
              target,
              text: `年号の語呂合わせ。${question.yearMnemonic
                .split("|")
                .map((mnemonic) => mnemonic.trim())
                .filter(Boolean)
                .join("。")}`,
              language: "ja-JP",
            },
          ]
        : []),
    ];
  }
  if (target === "overview") {
    const explanation = getIntegratedExplanationQuestion(term, question);
    return explanation
      ? [{ target, text: explanation.answer, language: "ja-JP" }]
      : [];
  }
  return [];
}

function answerSpeechSequence() {
  if (state.subject?.learningType !== "vocabulary") {
    return speechSegmentsFor("answer");
  }
  const layout = vocabularySpeechLayout();
  if (!layout) {
    return speechSegmentsFor("answer");
  }
  const remainingGroups = vocabularySpeechGroupOrder.filter(
    (group) => group !== layout.question && group !== layout.answer,
  );
  return [layout.answer, ...remainingGroups].flatMap((group) =>
    speechSegmentsFor(`vocabulary-${group}`),
  );
}

function speakTarget(target) {
  if (!speechController.supported) {
    return;
  }
  if (speechController.currentTarget === target) {
    speechController.stop();
    return;
  }
  speechController.speak(speechSegmentsFor(target));
}

function autoSpeakQuestion() {
  if (state.autoSpeechEnabled && !isListeningMode()) {
    speechController.speak(speechSegmentsFor("question"));
  }
}

function autoSpeakAnswerAndOverview() {
  if (!state.autoSpeechEnabled || isListeningMode()) {
    return;
  }
  speechController.speak([
    ...answerSpeechSequence(),
    ...speechSegmentsFor("mnemonic"),
    ...speechSegmentsFor("overview"),
  ]);
}

function setListeningStatus(message) {
  elements.listeningStatus.textContent = message;
}

function advanceListening(runId) {
  if (
    runId !== state.listeningRunId ||
    state.listeningPaused ||
    !isListeningMode()
  ) {
    return;
  }
  state.answeredThisSession += 1;
  state.currentTask = state.queue.shift() ?? null;
  if (!state.currentTask) {
    buildQueue();
    state.currentTask = state.queue.shift() ?? null;
  }
  if (!state.currentTask) {
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
  state.answerVisible = true;
  renderQuestion();
  const vocabularyMode = state.subject?.learningType === "vocabulary";
  const includesDetails = state.studyMode === "listen-explanation";
  const includesMnemonic =
    !vocabularyMode && Boolean(currentQuestion()?.yearMnemonic);
  setListeningStatus(
    includesDetails
      ? vocabularyMode
        ? "回答と例文を読み上げています"
        : includesMnemonic
          ? "回答、語呂合わせ、解説を読み上げています"
          : "回答と解説を読み上げています"
      : includesMnemonic
        ? "回答と語呂合わせを読み上げています"
        : "回答を読み上げています",
  );
  const answerSegments = vocabularyMode
    ? createVocabularyListeningAnswerSequence(
        currentTerm(),
        currentQuestion()?.stage,
        { includeExamples: includesDetails },
      )
    : answerSpeechSequence();
  const segments = [
    ...answerSegments,
    ...(!vocabularyMode ? speechSegmentsFor("mnemonic") : []),
    ...(!vocabularyMode && includesDetails
      ? speechSegmentsFor("overview")
      : []),
  ];
  const started = speechController.speak(segments, {
    onComplete: () => {
      if (runId !== state.listeningRunId) {
        return;
      }
      state.listeningTimer = window.setTimeout(() => {
        state.listeningTimer = null;
        advanceListening(runId);
      }, 0);
    },
  });
  if (!started) {
    advanceListening(runId);
  }
}

function beginListeningQuestion() {
  if (state.listeningPaused || !isListeningMode() || !state.currentTask) {
    return;
  }
  clearListeningTimer();
  const runId = ++state.listeningRunId;
  state.answerVisible = false;
  renderQuestion();
  setListeningStatus("問題を読み上げています");
  const started = speechController.speak(speechSegmentsFor("question"), {
    onComplete: () => {
      if (
        runId !== state.listeningRunId ||
        state.listeningPaused ||
        !isListeningMode()
      ) {
        return;
      }
      const pauseSeconds = state.listeningPauseSeconds;
      setListeningStatus(
        pauseSeconds > 0
          ? `${pauseSeconds}秒後に回答を読み上げます`
          : "回答を読み上げます",
      );
      state.listeningTimer = window.setTimeout(() => {
        state.listeningTimer = null;
        speakListeningAnswer(runId);
      }, pauseSeconds * 1000);
    },
  });
  if (!started) {
    speakListeningAnswer(runId);
  }
}

function toggleListening() {
  if (!isListeningMode() || !state.currentTask) {
    return;
  }
  if (state.listeningPaused) {
    state.listeningPaused = false;
    elements.listeningToggle.textContent = "一時停止";
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
  elements.listeningToggle.textContent = "再開";
  setListeningStatus("聞き流しを一時停止しています");
}

function returnToSetup() {
  stopListeningSequence();
  state.listeningPaused = false;
  state.currentTask = null;
  state.queue = [];
  state.answerVisible = false;
  state.answeredThisSession = 0;
  elements.listeningToggle.textContent = "一時停止";
  showOnly(elements.setupPanel);
  updateSetupPreview();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderTermTags(term, question, visible) {
  const tags = [
    term.chronology?.displayPeriod,
    ...getMacroRegionTags(term),
    term.geography?.regionDetail,
    term.era,
    term.category,
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
    elements.termImageLink.removeAttribute("href");
    elements.termImageLicense.removeAttribute("href");
    return false;
  }

  elements.termImageContent.src = getDataUrl(image.path);
  elements.termImageContent.alt = image.alt;
  elements.termImageLink.href = image.sourcePageUrl;
  elements.termImageCaption.textContent = image.caption;
  elements.termImageCreator.textContent = image.creator;
  elements.termImageLicense.textContent = image.license;
  elements.termImageLicense.href = image.licenseUrl;
  return true;
}

function currentQuestion() {
  if (!state.currentTask) {
    return null;
  }
  return state.questionById.get(state.currentTask.questionId) ?? null;
}

function currentTerm() {
  if (!state.currentTask) {
    return null;
  }
  return state.termById.get(state.currentTask.termId) ?? null;
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

function setDeckOptions(decks, selectedDeckId) {
  elements.deckFilter.replaceChildren(
    ...decks.map((deck) => {
      const option = document.createElement("option");
      option.value = deck.id;
      option.textContent = deckDisplayLabel(deck);
      return option;
    }),
  );
  elements.deckFilter.value = selectedDeckId;
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
  elements.questionStyleFilter.replaceChildren(
    ...[
      ["", questionStyleLabel("")],
      ...learningStages.map((stage) => [stage, questionStyleLabel(stage)]),
    ].map(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      return option;
    }),
  );
  elements.questionStyleFilter.value = ["", ...learningStages].includes(selected)
    ? selected
    : "";
}

function activeStages() {
  return learningStages.includes(state.selectedStage)
    ? [state.selectedStage]
    : learningStages;
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
  if (!macroRegion) {
    setSelectOptions(
      elements.regionDetailFilter,
      [],
      "大分類を選ぶと選択できます",
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
  setSelectOptions(elements.regionDetailFilter, details, "すべての小分類");
  elements.regionDetailFilter.disabled = false;
}

function updateSetupPreview() {
  const terms = filterTermsBySelection(state.allTerms, selectedFilters());
  const selectedStage = elements.questionStyleFilter.value;
  const studyMode = selectedStudyMode();
  const listening = listeningModes.has(studyMode);
  const stages = learningStages.includes(selectedStage)
    ? [selectedStage]
    : learningStages;
  const questions = countQuestions(terms, stages);
  const dueQuestions = createQuestionQueue(
    terms,
    state.progress,
    state.subject.masteryTarget,
    selectedStage,
  ).length;
  const beginnerQuestions = terms.reduce(
    (total, term) => total + (term.stages.beginner?.length ?? 0),
    0,
  );
  elements.startStudy.disabled =
    terms.length === 0 ||
    !state.cloudReady ||
    (listening && (!speechController.supported || dueQuestions === 0));
  elements.startStudy.textContent = listening
    ? "聞き流しを開始"
    : "暗記モードを開始";
  elements.selectionSummary.textContent =
    terms.length === 0
      ? "条件に合う用語がありません。選択を変更してください。"
      : listening && !speechController.supported
        ? "この端末では音声読み上げを利用できません。"
        : listening && dueQuestions === 0
          ? "現在、復習時刻を迎えた読み上げ対象の問題はありません。"
          : listening
            ? `${terms.length}語・読み上げ対象 ${dueQuestions}問（${listeningContentLabel(
                studyMode,
              )}）`
      : selectedStage
        ? `${terms.length}語・${questions}問（${questionStyleLabel(selectedStage)}）`
        : `${terms.length}語・${questions}問（開始時は${questionStyleLabel("beginner")} ${beginnerQuestions}問）`;
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
  const mappings = [
    [elements.incorrectAction, state.reviewSettings.againSeconds],
    [elements.hardAction, state.reviewSettings.hardSeconds],
    [elements.goodAction, state.reviewSettings.goodSeconds],
    [elements.easyAction, state.reviewSettings.easySeconds],
  ];
  for (const [button, seconds] of mappings) {
    const interval = button.querySelector("small");
    if (interval) {
      interval.textContent = formatInterval(seconds);
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
  const macroRegions = sortedUnique(
    state.allTerms.flatMap((term) => getMacroRegionTags(term)),
  );
  const categories = sortedUnique(state.allTerms.map((term) => term.category));
  setSelectOptions(elements.macroRegionFilter, macroRegions, "すべての大分類");
  setSelectOptions(
    elements.categoryFilter,
    categories,
    filterLabels.category ? `すべての${filterLabels.category}` : "すべて",
  );
  updateRegionDetailOptions();
  elements.setupShuffle.checked = state.shuffleEnabled;
  elements.setupSpeech.checked = state.autoSpeechEnabled;
  elements.setupSpeech.disabled = !speechController.supported;
  const vocabularyMode = state.subject?.learningType === "vocabulary";
  elements.listeningAnswerDescription.textContent = vocabularyMode
    ? "問題文＋回答を繰り返し読み上げる"
    : "問題文＋回答＋語呂合わせを繰り返し読み上げる";
  elements.listeningDetailTitle.textContent = vocabularyMode
    ? "聞き流し＋例文"
    : "聞き流し＋解説";
  elements.listeningDetailDescription.textContent = vocabularyMode
    ? "問題文＋回答＋英語例文＋日本語例文を繰り返し読み上げる"
    : "問題文＋回答＋語呂合わせ＋解説を繰り返し読み上げる";
  for (const option of elements.studyModeOptions) {
    option.closest(".study-mode-choice")?.classList.remove("is-hidden");
    if (listeningModes.has(option.value)) {
      option.disabled = !speechController.supported;
    }
  }
  elements.speechChoice.classList.toggle(
    "is-hidden",
    !speechController.supported || listeningModes.has(selectedStudyMode()),
  );
  [
    elements.questionSpeech,
    elements.answerSpeech,
    elements.yearMnemonicSpeech,
    elements.overviewSpeech,
  ].forEach(
    (button) => button.classList.toggle("is-hidden", !speechController.supported),
  );
  updateRatingIntervals();
  updateSetupPreview();
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
    ? `このスタイル習得 ${mastery.masteredTerms} / ${mastery.totalTerms}語`
    : `完全習得 ${mastery.masteredTerms} / ${mastery.totalTerms}語`;
  elements.progressBar.style.width = `${percent}%`;
}

function renderQuestion() {
  const term = currentTerm();
  const question = currentQuestion();
  if (!term || !question) {
    renderCompletion();
    return;
  }

  elements.completionCard.classList.add("is-hidden");
  elements.contextCard.classList.remove("is-hidden");
  elements.questionCard.classList.remove("is-hidden");
  elements.actionDock.classList.remove("is-hidden");

  elements.contextCard.classList.toggle(
    "is-beginner-stage",
    question.stage === "beginner",
  );
  const hidesTerm = shouldHideTerm(question, state.answerVisible);
  elements.stageName.textContent = questionStyleLabel(question.stage);
  const vocabularyMode = state.subject?.learningType === "vocabulary";
  elements.termTitle.textContent = hidesTerm
    ? vocabularyMode
      ? questionStyleLabel(question.stage)
      : "通常の一問一答"
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
  elements.questionAxis.textContent = question.focus || question.label;
  const displayedQuestionPrompt = getQuestionPromptForDisplay(
    question,
    state.answerVisible,
  );
  elements.questionText.textContent = displayedQuestionPrompt;
  renderEmphasizedText(elements.answerText, question.answer);
  elements.answerPanel.classList.toggle("is-hidden", !state.answerVisible);

  const acceptedText = question.acceptedAnswers.join("・");
  elements.acceptedPanel.classList.toggle(
    "is-hidden",
    !state.answerVisible || acceptedText.length === 0,
  );
  elements.acceptedText.textContent = acceptedText;
  elements.answerNote.classList.toggle(
    "is-hidden",
    !state.answerVisible || !question.answerNote,
  );
  elements.answerNote.textContent = question.answerNote;
  renderVocabularySpeechGroups();

  const integratedExplanation = getIntegratedExplanationQuestion(term, question);
  const showsYearMnemonic =
    state.answerVisible && Boolean(question.yearMnemonic);
  const showsTermOverview =
    state.answerVisible && (Boolean(integratedExplanation) || showsYearMnemonic);
  elements.termOverviewText.classList.toggle(
    "is-hidden",
    !state.answerVisible || !integratedExplanation,
  );
  elements.yearMnemonic.classList.toggle("is-hidden", !showsYearMnemonic);
  elements.yearMnemonicSpeech.classList.toggle(
    "is-hidden",
    !speechController.supported || !showsYearMnemonic,
  );
  elements.yearMnemonicText.textContent = (question.yearMnemonic ?? "")
    .split("|")
    .map((mnemonic) => mnemonic.trim())
    .filter(Boolean)
    .join("\n");
  elements.overviewSpeech.classList.toggle(
    "is-hidden",
    !speechController.supported || !integratedExplanation,
  );
  renderEmphasizedText(
    elements.termOverviewText,
    integratedExplanation?.answer ?? "",
  );
  const showsTermImage = renderQuestionImage(question, state.answerVisible);
  const showsSupplement = showsTermOverview || showsTermImage;
  elements.termOverview.classList.toggle("is-hidden", !showsSupplement);
  renderTermTags(term, question, showsSupplement);

  renderActionControls();
  elements.queueProgress.textContent = isListeningMode()
    ? `一巡の残り ${state.queue.length + 1}問`
    : `この回の残り ${state.queue.length + 1}問`;
  elements.unlockNotice.textContent = state.unlockMessage;
  elements.unlockNotice.classList.toggle("is-hidden", !state.unlockMessage);
  state.unlockMessage = "";

  updateOverallProgress();
  setContentDensity(
    elements.questionCard,
    displayedQuestionPrompt,
    question.answer,
    integratedExplanation?.answer,
    question.yearMnemonic,
  );
  const fittedAnswerElements = [elements.answerText];
  if (integratedExplanation) {
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
  const tasks = createQuestionQueue(
    state.terms,
    state.progress,
    state.subject.masteryTarget,
    state.selectedStage,
  );
  state.queue = state.shuffleEnabled ? shuffleTasks(tasks) : tasks;
}

async function rateCurrentQuestion(rating) {
  const term = currentTerm();
  const question = currentQuestion();
  if (
    isListeningMode() ||
    !term ||
    !question ||
    !state.answerVisible ||
    state.saving
  ) {
    return;
  }
  speechController.stop();

  const stageBefore = state.selectedStage
    ? null
    : getTermStage(term, state.progress, state.subject.masteryTarget);
  const snapshot = createRatingUndoSnapshot({
    progress: state.progress,
    questionId: question.id,
    queue: state.queue,
    currentTask: state.currentTask,
    answerVisible: state.answerVisible,
    answeredThisSession: state.answeredThisSession,
    unlockMessage: state.unlockMessage,
  });
  rateQuestion(
    state.progress,
    question.id,
    rating,
    state.subject.masteryTarget,
    state.reviewSettings,
  );
  state.saving = true;
  renderActionControls();
  try {
    await saveCloudQuestion(
      state.subject.version,
      question.id,
      state.progress.questions[question.id],
    );
  } catch (error) {
    restoreRatingUndoSnapshot(state.progress, snapshot);
    state.unlockMessage = error.message;
    state.saving = false;
    renderQuestion();
    return;
  }
  state.saving = false;
  pushHistory(snapshot);

  if (!state.selectedStage) {
    const stageAfter = getTermStage(
      term,
      state.progress,
      state.subject.masteryTarget,
    );
    if (stageAfter !== stageBefore) {
      if (stageAfter === "complete") {
        state.unlockMessage = `${term.term}を完全習得しました。`;
      } else {
        state.queue = enqueueUniqueTasks(
          state.queue,
          getTasksForStage(
            term,
            stageAfter,
            state.progress,
          ),
          [state.currentTask.questionId],
        );
      }
    }
  }

  state.answeredThisSession += 1;
  state.currentTask = state.queue.shift() ?? null;
  if (!state.currentTask) {
    buildQueue();
    state.currentTask = state.queue.shift() ?? null;
  }
  state.answerVisible = false;
  state.answerRevealedAt = 0;
  renderQuestion();
  autoSpeakQuestion();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function resetAllProgress() {
  if (!state.cloudReady || state.saving) {
    return;
  }
  state.saving = true;
  elements.resetProgress.disabled = true;
  try {
    await resetCloudProgress(state.subject.version);
  } catch (error) {
    elements.selectionSummary.textContent = error.message;
    state.saving = false;
    elements.resetProgress.disabled = false;
    return;
  }
  state.progress = createEmptyProgress();
  clearLegacyProgress();
  state.answeredThisSession = 0;
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

  state.terms = selectedTerms;
  state.termById = new Map(state.terms.map((term) => [term.id, term]));
  state.questionById = new Map(
    state.terms.flatMap((term) =>
      learningStages.flatMap((stage) =>
        term.stages[stage].map((question) => [question.id, question]),
      ),
    ),
  );
  state.selectedStage = elements.questionStyleFilter.value;
  state.studyMode = selectedStudyMode();
  state.shuffleEnabled = elements.setupShuffle.checked;
  state.autoSpeechEnabled =
    speechController.supported && elements.setupSpeech.checked;
  speechController.stop();
  buildQueue();
  state.currentTask = state.queue.shift() ?? null;
  state.answerVisible = false;
  state.answeredThisSession = 0;
  state.unlockMessage = "";
  state.history = [];
  state.answerRevealedAt = 0;
  state.listeningPaused = false;
  clearListeningTimer();
  elements.listeningToggle.textContent = "一時停止";

  const questionCount = countQuestions(state.terms, activeStages());
  const selectedStyle = questionStyleLabel(state.selectedStage);
  elements.completionTitle.textContent = state.selectedStage
    ? `${selectedStyle}：${state.terms.length}語・${questionCount}問を習得しました`
    : `${state.terms.length}語・${questionCount}問を完全習得しました`;
  showOnly(elements.studyShell);
  if (isListeningMode()) {
    beginListeningQuestion();
  } else {
    renderQuestion();
    autoSpeakQuestion();
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
  startingStudy = false;
}

async function activateDeck(deckId) {
  const deckEntry = state.deckEntries.find((deck) => deck.id === deckId);
  if (!deckEntry) {
    throw new Error("選択したデッキが見つかりません。");
  }
  const loadToken = state.deckLoadToken + 1;
  state.deckLoadToken = loadToken;
  elements.deckFilter.disabled = true;

  const subject = await fetchJson(deckEntry.indexPath);
  const chunks = await Promise.all(
    subject.chunks.map((chunk) => fetchJson(chunk.path)),
  );
  if (loadToken !== state.deckLoadToken) return;

  state.activeDeckId = deckEntry.id;
  state.subject = subject;
  state.allTerms = chunks.flatMap((chunk) => chunk.terms);
  state.terms = [];
  state.termById = new Map();
  state.questionById = new Map();
  state.progressKey = `anki-progress:${state.subject.id}:${state.subject.version}:v1`;
  try {
    await loadProgressFromCloud();
  } catch (error) {
    state.progress = createEmptyProgress();
    state.reviewSettings = { ...defaultReviewSettings };
    state.shuffleEnabled = false;
    state.autoSpeechEnabled = true;
    state.listeningPauseSeconds = 0;
    state.cloudReady = false;
    state.cloudError = error.message;
  }
  if (loadToken !== state.deckLoadToken) return;

  state.queue = [];
  state.currentTask = null;
  state.answerVisible = false;
  state.answeredThisSession = 0;
  state.unlockMessage = "";
  state.history = [];
  state.answerRevealedAt = 0;
  state.studyMode = "memorize";
  state.listeningPaused = false;
  clearListeningTimer();
  state.saving = false;
  elements.macroRegionFilter.value = "";
  elements.regionDetailFilter.value = "";
  elements.categoryFilter.value = "";
  elements.deckFilter.value = deckEntry.id;
  elements.deckFilter.disabled = false;
  elements.subjectName.textContent = `${state.subject.title}｜${deckDisplayLabel(deckEntry).split("｜")[0]}`;
  elements.setupEyebrow.textContent = `v0.046｜${state.subject.title}を学ぶ`;
  elements.setupTitle.textContent = `${state.subject.title}の学習範囲を選ぶ`;
  elements.setupDescription.textContent =
    state.subject.learningType === "vocabulary"
      ? "デッキ、品詞、出題方向を選んで学習できます。すべてを選んだまま始めることもできます。"
      : "すべてを選んだまま始めることも、地域や種類を絞って集中することもできます。";
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
      description.textContent = `${subject.description}（${subject.termCount}語・${subject.questionCount}問）`;
      button.append(title, description);
      return button;
    }),
  );
}

function showSubjectSelection() {
  stopListeningSequence();
  state.currentTask = null;
  state.queue = [];
  state.answerVisible = false;
  elements.subjectName.textContent = "科目を選択";
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
  setDeckOptions(state.deckEntries, defaultDeckId);
  await activateDeck(defaultDeckId);
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
    showSubjectSelection();
  } catch (error) {
    elements.errorMessage.textContent = error.message;
    showOnly(elements.errorPanel);
  }
}

elements.subjectOptions.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-subject-id]");
  if (!button) return;
  showOnly(elements.loadingPanel);
  void activateSubject(button.dataset.subjectId)
    .then(() => showOnly(elements.setupPanel))
    .catch((error) => {
      elements.errorMessage.textContent = error.message;
      showOnly(elements.errorPanel);
    });
});

elements.deckFilter.addEventListener("change", () => {
  const deckId = elements.deckFilter.value;
  showOnly(elements.loadingPanel);
  void activateDeck(deckId)
    .then(() => showOnly(elements.setupPanel))
    .catch((error) => {
      elements.errorMessage.textContent = error.message;
      showOnly(elements.errorPanel);
    });
});
elements.macroRegionFilter.addEventListener("change", () => {
  updateRegionDetailOptions(true);
  updateSetupPreview();
});
elements.regionDetailFilter.addEventListener("change", updateSetupPreview);
elements.categoryFilter.addEventListener("change", updateSetupPreview);
elements.questionStyleFilter.addEventListener("change", updateSetupPreview);
for (const option of elements.studyModeOptions) {
  option.addEventListener("change", () => {
    elements.speechChoice.classList.toggle(
      "is-hidden",
      !speechController.supported || listeningModes.has(selectedStudyMode()),
    );
    updateSetupPreview();
  });
}
elements.setupShuffle.addEventListener("change", () => {
  updateSetupPreview();
  void queueSetupPreferenceSave().catch((error) => {
    elements.cloudStatus.textContent = `開始設定を共有できませんでした。${error.message}`;
  });
});
elements.setupSpeech.addEventListener("change", () => {
  state.autoSpeechEnabled = elements.setupSpeech.checked;
  void queueSetupPreferenceSave().catch((error) => {
    elements.cloudStatus.textContent = `開始設定を共有できませんでした。${error.message}`;
  });
});
elements.startStudy.addEventListener("click", () => void beginStudy());
elements.changeSubject.addEventListener("click", showSubjectSelection);

elements.backAction.addEventListener("click", goBackOneStep);
elements.nextAction.addEventListener("click", revealCurrentAnswer);
elements.questionSpeech.addEventListener("click", () => speakTarget("question"));
elements.answerSpeech.addEventListener("click", () => speakTarget("answer"));
elements.yearMnemonicSpeech.addEventListener("click", () =>
  speakTarget("mnemonic"),
);
for (const button of elements.vocabularySpeechButtons) {
  button.addEventListener("click", () =>
    speakTarget(`vocabulary-${button.dataset.vocabularySpeech}`),
  );
}
elements.overviewSpeech.addEventListener("click", () => speakTarget("overview"));
elements.termImageContent.addEventListener("error", () => {
  elements.termImage.classList.add("is-hidden");
  elements.termOverviewMain.classList.remove("has-image", "image-only");
});
elements.incorrectAction.addEventListener("click", () => rateCurrentQuestion("again"));
elements.hardAction.addEventListener("click", () => rateCurrentQuestion("hard"));
elements.goodAction.addEventListener("click", () => rateCurrentQuestion("good"));
elements.easyAction.addEventListener("click", () => rateCurrentQuestion("easy"));
elements.listeningToggle.addEventListener("click", toggleListening);
elements.listeningStop.addEventListener("click", returnToSetup);

elements.resetProgress.addEventListener("click", () => {
  if (window.confirm("すべての学習記録を初期化しますか？")) {
    void resetAllProgress();
  }
});
elements.retryButton.addEventListener("click", start);

elements.studyShell.addEventListener("click", (event) => {
  if (isListeningMode()) {
    return;
  }
  const usesHalfScreenNavigation = window.matchMedia(
    "(orientation: landscape) and (max-height: 600px)",
  ).matches;
  if (
    !usesHalfScreenNavigation ||
    event.target.closest("button, a, input, select, textarea, label")
  ) {
    return;
  }
  if (event.clientX < window.innerWidth / 2) {
    goBackOneStep();
  } else {
    performRightSideAction(true);
  }
});

window.addEventListener("keydown", (event) => {
  if (event.target.closest("input, textarea, select") || event.repeat) {
    return;
  }
  if (isListeningMode()) {
    if (state.currentTask && (event.key === " " || event.key === "Enter")) {
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
    const explanation = getIntegratedExplanationQuestion(currentTerm(), question);
    const targets = [elements.answerText];
    if (explanation) {
      targets.push(elements.termOverviewText);
    }
    if (question.yearMnemonic) {
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
  if (document.hidden && !isListeningMode()) {
    speechController.stop();
  }
});

start();
