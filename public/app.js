import {
  createEmptyProgress,
  createQuestionQueue,
  deserializeProgress,
  enqueueUniqueTasks,
  filterTermsBySelection,
  getIntegratedExplanationQuestion,
  getMacroRegionTags,
  getOverallMastery,
  getTasksForCurrentTermStage,
  getTermMastery,
  getTermStage,
  isQuestionMastered,
  learningStages,
  rateQuestion,
  scheduleRetryTask,
  serializeProgress,
  shuffleTasks,
  shouldHideTerm,
  stageLabels,
} from "./learning-engine.js";

const elements = {
  loadingPanel: document.querySelector("#loading-panel"),
  setupPanel: document.querySelector("#setup-panel"),
  studyShell: document.querySelector("#study-shell"),
  errorPanel: document.querySelector("#error-panel"),
  errorMessage: document.querySelector("#error-message"),
  retryButton: document.querySelector("#retry-button"),
  macroRegionFilter: document.querySelector("#macro-region-filter"),
  regionDetailFilter: document.querySelector("#region-detail-filter"),
  categoryFilter: document.querySelector("#category-filter"),
  questionStyleFilter: document.querySelector("#question-style-filter"),
  setupShuffle: document.querySelector("#setup-shuffle"),
  selectionSummary: document.querySelector("#selection-summary"),
  startStudy: document.querySelector("#start-study"),
  resetProgress: document.querySelector("#reset-progress"),
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
  answerPanel: document.querySelector("#answer-panel"),
  answerText: document.querySelector("#answer-text"),
  acceptedPanel: document.querySelector("#accepted-panel"),
  acceptedText: document.querySelector("#accepted-text"),
  answerNote: document.querySelector("#answer-note"),
  termOverview: document.querySelector("#term-overview"),
  termOverviewText: document.querySelector("#term-overview-text"),
  masteryPanel: document.querySelector("#mastery-panel"),
  masteryStages: document.querySelector("#mastery-stages"),
  actionDock: document.querySelector("#action-dock"),
  revealAction: document.querySelector("#reveal-action"),
  ratingActions: document.querySelector("#rating-actions"),
  againAction: document.querySelector("#again-action"),
  rememberedAction: document.querySelector("#remembered-action"),
  completionCard: document.querySelector("#completion-card"),
  completionTitle: document.querySelector("#completion-title"),
  completionReset: document.querySelector("#completion-reset"),
  unlockNotice: document.querySelector("#unlock-notice"),
};

const state = {
  subject: null,
  allTerms: [],
  terms: [],
  termById: new Map(),
  questionById: new Map(),
  progress: createEmptyProgress(),
  progressKey: "",
  queue: [],
  currentTask: null,
  answerVisible: false,
  shuffleEnabled: false,
  selectedStage: "",
  answeredThisSession: 0,
  unlockMessage: "",
};

function getConfig() {
  const config = window.ANKI_CONFIG ?? {};
  const dataBaseUrl = String(config.dataBaseUrl ?? "").replace(/\/$/, "");
  if (!dataBaseUrl) {
    throw new Error("Cloudflareの学習データ読込先が設定されていません。");
  }
  return {
    dataBaseUrl,
    subjectId: String(config.subjectId ?? "world-history"),
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

function showOnly(panel) {
  [
    elements.loadingPanel,
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
    while (
      card.scrollHeight > card.clientHeight &&
      fontSizes.some((fontSize) => fontSize > 8)
    ) {
      targets.forEach((element, index) => {
        fontSizes[index] = Math.max(8, fontSizes[index] - 0.5);
        element.style.fontSize = `${fontSizes[index]}px`;
        element.style.lineHeight = "1.18";
      });
    }
  });
}

function loadStoredProgress() {
  try {
    const saved = window.localStorage.getItem(state.progressKey);
    state.progress = deserializeProgress(saved);
  } catch {
    state.progress = createEmptyProgress();
  }
}

function saveProgress() {
  try {
    window.localStorage.setItem(state.progressKey, serializeProgress(state.progress));
  } catch {
    // 保存できない環境でも、その場の学習は続けられるようにする。
  }
}

function loadShufflePreference() {
  try {
    state.shuffleEnabled =
      window.localStorage.getItem(`anki-shuffle:${state.subject.id}`) === "true";
  } catch {
    state.shuffleEnabled = false;
  }
}

function saveShufflePreference() {
  try {
    window.localStorage.setItem(
      `anki-shuffle:${state.subject.id}`,
      String(state.shuffleEnabled),
    );
  } catch {
    // 設定の保存に失敗しても出題は継続する。
  }
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

function selectedFilters() {
  return {
    macroRegion: elements.macroRegionFilter.value,
    regionDetail: elements.regionDetailFilter.value,
    category: elements.categoryFilter.value,
  };
}

const questionStyleLabels = {
  "": "三段階すべて",
  beginner: "通常の一問一答",
  reverse: "逆一問一答",
  integrated: "統合説明",
};

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
  const stages = learningStages.includes(selectedStage)
    ? [selectedStage]
    : learningStages;
  const questions = countQuestions(terms, stages);
  const beginnerQuestions = terms.reduce(
    (total, term) => total + (term.stages.beginner?.length ?? 0),
    0,
  );
  elements.startStudy.disabled = terms.length === 0;
  elements.selectionSummary.textContent =
    terms.length === 0
      ? "条件に合う用語がありません。選択を変更してください。"
      : selectedStage
        ? `${terms.length}語・${questions}問（${questionStyleLabels[selectedStage]}）`
        : `${terms.length}語・${questions}問（開始時は通常の一問一答 ${beginnerQuestions}問）`;
}

function configureSetup() {
  const macroRegions = sortedUnique(
    state.allTerms.flatMap((term) => getMacroRegionTags(term)),
  );
  const categories = sortedUnique(state.allTerms.map((term) => term.category));
  setSelectOptions(elements.macroRegionFilter, macroRegions, "すべての大分類");
  setSelectOptions(elements.categoryFilter, categories, "すべてのカテゴリ");
  updateRegionDetailOptions();
  elements.setupShuffle.checked = state.shuffleEnabled;
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

function renderTermMastery(term) {
  const mastery = getTermMastery(
    term,
    state.progress,
    state.subject.masteryTarget,
  );
  elements.masteryStages.replaceChildren(
    ...learningStages.map((stage) => {
      const item = document.createElement("span");
      const stats = mastery[stage];
      item.textContent = `${stageLabels[stage]} ${stats.mastered}/${stats.total}`;
      item.classList.toggle("is-mastered", stats.total > 0 && stats.mastered === stats.total);
      return item;
    }),
  );
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
  elements.stageName.textContent = questionStyleLabels[question.stage];
  elements.termTitle.textContent = hidesTerm ? "通常の一問一答" : term.term;
  elements.termReading.textContent = hidesTerm
    ? "問題文とは別の用語欄と読みは、答えを見るまで表示されません"
    : term.reading;
  elements.contextCard.classList.toggle("reveals-term", !hidesTerm);

  elements.questionNumber.textContent = `出題 ${state.answeredThisSession + 1}`;
  elements.questionAxis.textContent = question.focus || question.label;
  elements.questionText.textContent = question.prompt;
  renderEmphasizedText(elements.answerText, question.answer);
  elements.answerPanel.classList.toggle("is-hidden", !state.answerVisible);
  elements.masteryPanel.classList.toggle("is-hidden", !state.answerVisible);

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

  const integratedExplanation = getIntegratedExplanationQuestion(term, question);
  const showsTermOverview = state.answerVisible && Boolean(integratedExplanation);
  elements.termOverview.classList.toggle("is-hidden", !showsTermOverview);
  renderEmphasizedText(
    elements.termOverviewText,
    integratedExplanation?.answer ?? "",
  );

  if (state.answerVisible) {
    renderTermMastery(term);
  }

  elements.revealAction.classList.toggle("is-hidden", state.answerVisible);
  elements.ratingActions.classList.toggle("is-hidden", !state.answerVisible);
  elements.queueProgress.textContent = `この回の残り ${state.queue.length + 1}問`;
  elements.unlockNotice.textContent = state.unlockMessage;
  elements.unlockNotice.classList.toggle("is-hidden", !state.unlockMessage);
  state.unlockMessage = "";

  updateOverallProgress();
  setContentDensity(
    elements.questionCard,
    question.prompt,
    question.answer,
    integratedExplanation?.answer,
  );
  fitTextInsideCard(
    elements.questionCard,
    showsTermOverview
      ? [elements.answerText, elements.termOverviewText]
      : elements.answerText,
    state.answerVisible,
  );
}

function renderCompletion() {
  state.currentTask = null;
  elements.contextCard.classList.add("is-hidden");
  elements.questionCard.classList.add("is-hidden");
  elements.actionDock.classList.add("is-hidden");
  elements.completionCard.classList.remove("is-hidden");
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

function takeNextTask() {
  if (state.queue.length === 0) {
    buildQueue();
  }
  state.currentTask = state.queue.shift() ?? null;
  state.answerVisible = false;
  renderQuestion();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function rateCurrentQuestion(remembered) {
  const term = currentTerm();
  const question = currentQuestion();
  if (!term || !question || !state.answerVisible) {
    return;
  }

  const stageBefore = state.selectedStage
    ? null
    : getTermStage(term, state.progress, state.subject.masteryTarget);
  rateQuestion(
    state.progress,
    question.id,
    remembered,
    state.subject.masteryTarget,
  );
  saveProgress();

  if (
    !isQuestionMastered(
      state.progress,
      question.id,
      state.subject.masteryTarget,
    )
  ) {
    state.queue = scheduleRetryTask(state.queue, state.currentTask, remembered);
  }

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
        state.unlockMessage = `${term.term}の「${stageLabels[stageAfter]}」を解放しました。`;
        state.queue = enqueueUniqueTasks(
          state.queue,
          getTasksForCurrentTermStage(
            term,
            state.progress,
            state.subject.masteryTarget,
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
  renderQuestion();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetAllProgress() {
  state.progress = createEmptyProgress();
  try {
    window.localStorage.removeItem(state.progressKey);
  } catch {
    // 端末内保存が使えなくても画面内の記録は初期化する。
  }
  state.answeredThisSession = 0;
  state.unlockMessage = "学習記録を初期化しました。";
  buildQueue();
  state.currentTask = state.queue.shift() ?? null;
  state.answerVisible = false;
  renderQuestion();
}

function beginStudy() {
  const selectedTerms = filterTermsBySelection(
    state.allTerms,
    selectedFilters(),
  );
  if (selectedTerms.length === 0) {
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
  state.shuffleEnabled = elements.setupShuffle.checked;
  saveShufflePreference();
  buildQueue();
  state.currentTask = state.queue.shift() ?? null;
  state.answerVisible = false;
  state.answeredThisSession = 0;
  state.unlockMessage = "";

  const questionCount = countQuestions(state.terms, activeStages());
  const selectedStyle = questionStyleLabels[state.selectedStage];
  elements.completionTitle.textContent = state.selectedStage
    ? `${selectedStyle}：${state.terms.length}語・${questionCount}問を習得しました`
    : `${state.terms.length}語・${questionCount}問を完全習得しました`;
  renderQuestion();
  showOnly(elements.studyShell);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function start() {
  showOnly(elements.loadingPanel);
  try {
    const { subjectId } = getConfig();
    const catalog = await fetchJson("index.json");
    const subjectEntry = catalog.subjects.find((subject) => subject.id === subjectId);
    if (!subjectEntry) {
      throw new Error("指定された科目が見つかりません。");
    }

    state.subject = await fetchJson(subjectEntry.indexPath);
    const chunks = await Promise.all(
      state.subject.chunks.map((chunk) => fetchJson(chunk.path)),
    );
    state.allTerms = chunks.flatMap((chunk) => chunk.terms);
    state.terms = [];
    state.termById = new Map();
    state.questionById = new Map();
    state.progressKey = `anki-progress:${state.subject.id}:${state.subject.version}:v1`;
    loadStoredProgress();
    loadShufflePreference();
    state.queue = [];
    state.currentTask = null;
    state.answerVisible = false;
    state.answeredThisSession = 0;
    state.unlockMessage = "";

    elements.subjectName.textContent = state.subject.title;
    configureSetup();
    showOnly(elements.setupPanel);
  } catch (error) {
    elements.errorMessage.textContent = error.message;
    showOnly(elements.errorPanel);
  }
}

elements.macroRegionFilter.addEventListener("change", () => {
  updateRegionDetailOptions(true);
  updateSetupPreview();
});
elements.regionDetailFilter.addEventListener("change", updateSetupPreview);
elements.categoryFilter.addEventListener("change", updateSetupPreview);
elements.questionStyleFilter.addEventListener("change", updateSetupPreview);
elements.setupShuffle.addEventListener("change", updateSetupPreview);
elements.startStudy.addEventListener("click", beginStudy);

elements.revealAction.addEventListener("click", () => {
  state.answerVisible = true;
  renderQuestion();
});

elements.againAction.addEventListener("click", () => rateCurrentQuestion(false));
elements.rememberedAction.addEventListener("click", () => rateCurrentQuestion(true));

elements.resetProgress.addEventListener("click", () => {
  if (window.confirm("すべての学習記録を初期化しますか？")) {
    resetAllProgress();
  }
});
elements.completionReset.addEventListener("click", resetAllProgress);
elements.retryButton.addEventListener("click", start);

elements.studyShell.addEventListener("click", (event) => {
  const usesHalfScreenNavigation = window.matchMedia(
    "(orientation: landscape) and (max-height: 600px)",
  ).matches;
  if (
    !usesHalfScreenNavigation ||
    event.target.closest("button, a, input, select, textarea, label")
  ) {
    return;
  }
  if (!state.answerVisible && event.clientX >= window.innerWidth / 2) {
    elements.revealAction.click();
  } else if (state.answerVisible) {
    (event.clientX < window.innerWidth / 2
      ? elements.againAction
      : elements.rememberedAction
    ).click();
  }
});

window.addEventListener("keydown", (event) => {
  if (!state.currentTask || event.target.closest("input, textarea, select")) {
    return;
  }
  if ((event.key === " " || event.key === "Enter") && !state.answerVisible) {
    event.preventDefault();
    elements.revealAction.click();
  } else if (state.answerVisible && event.key === "ArrowLeft") {
    elements.againAction.click();
  } else if (state.answerVisible && event.key === "ArrowRight") {
    elements.rememberedAction.click();
  }
});

window.addEventListener("resize", () => {
  if (state.currentTask && state.answerVisible) {
    const question = currentQuestion();
    const explanation = getIntegratedExplanationQuestion(currentTerm(), question);
    fitTextInsideCard(
      elements.questionCard,
      explanation
        ? [elements.answerText, elements.termOverviewText]
        : elements.answerText,
      true,
    );
  }
});

start();
