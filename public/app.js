import {
  createEmptyProgress,
  createQuestionQueue,
  deserializeProgress,
  enqueueUniqueTasks,
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
  studyShell: document.querySelector("#study-shell"),
  errorPanel: document.querySelector("#error-panel"),
  errorMessage: document.querySelector("#error-message"),
  retryButton: document.querySelector("#retry-button"),
  shuffleToggle: document.querySelector("#shuffle-toggle"),
  shuffleLabel: document.querySelector("#shuffle-label"),
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
  masteryPanel: document.querySelector("#mastery-panel"),
  masteryTerm: document.querySelector("#mastery-term"),
  masteryStages: document.querySelector("#mastery-stages"),
  currentStreak: document.querySelector("#current-streak"),
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
  terms: [],
  termById: new Map(),
  questionById: new Map(),
  progress: createEmptyProgress(),
  progressKey: "",
  queue: [],
  currentTask: null,
  answerVisible: false,
  shuffleEnabled: false,
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
  [elements.loadingPanel, elements.studyShell, elements.errorPanel].forEach(
    (candidate) => candidate.classList.toggle("is-hidden", candidate !== panel),
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

function fitTextInsideCard(card, textElement, shouldFit = true) {
  textElement.style.removeProperty("font-size");
  textElement.style.removeProperty("line-height");
  if (
    !shouldFit ||
    !window.matchMedia("(orientation: landscape) and (max-height: 600px)").matches
  ) {
    return;
  }

  window.requestAnimationFrame(() => {
    let fontSize = Number.parseFloat(window.getComputedStyle(textElement).fontSize);
    while (card.scrollHeight > card.clientHeight && fontSize > 8) {
      fontSize -= 0.5;
      textElement.style.fontSize = `${fontSize}px`;
      textElement.style.lineHeight = "1.18";
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

function updateShuffleButton() {
  elements.shuffleToggle.setAttribute("aria-pressed", String(state.shuffleEnabled));
  elements.shuffleLabel.textContent = `シャッフル：${state.shuffleEnabled ? "オン" : "オフ"}`;
}

function updateOverallProgress() {
  const mastery = getOverallMastery(
    state.terms,
    state.progress,
    state.subject.masteryTarget,
  );
  const percent =
    mastery.totalQuestions === 0
      ? 0
      : (mastery.masteredQuestions / mastery.totalQuestions) * 100;
  elements.overallProgress.textContent = `習得 ${mastery.masteredQuestions} / ${mastery.totalQuestions}問`;
  elements.termProgress.textContent = `完全習得 ${mastery.masteredTerms} / ${mastery.totalTerms}語`;
  elements.progressBar.style.width = `${percent}%`;
}

function renderTermMastery(term, question) {
  const mastery = getTermMastery(
    term,
    state.progress,
    state.subject.masteryTarget,
  );
  elements.masteryTerm.textContent = `${term.term}の習得状況`;
  elements.masteryStages.replaceChildren(
    ...learningStages.map((stage) => {
      const item = document.createElement("span");
      const stats = mastery[stage];
      item.textContent = `${stageLabels[stage]} ${stats.mastered}/${stats.total}`;
      item.classList.toggle("is-mastered", stats.total > 0 && stats.mastered === stats.total);
      return item;
    }),
  );

  const record = state.progress.questions[question.id] ?? { streak: 0 };
  const remaining = Math.max(0, state.subject.masteryTarget - record.streak);
  elements.currentStreak.textContent =
    remaining === 0
      ? "この問題は習得済みです。"
      : `この問題は、あと${remaining}回連続で「覚えた」を選ぶと習得です。`;
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

  const hidesTerm = shouldHideTerm(question, state.answerVisible);
  elements.stageName.textContent = stageLabels[question.stage];
  elements.termTitle.textContent = hidesTerm ? "通常の一問一答" : term.term;
  elements.termReading.textContent = hidesTerm ? "答えを見るまで関連用語は表示されません" : term.reading;
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

  if (state.answerVisible) {
    renderTermMastery(term, question);
  }

  elements.revealAction.classList.toggle("is-hidden", state.answerVisible);
  elements.ratingActions.classList.toggle("is-hidden", !state.answerVisible);
  elements.queueProgress.textContent = `この回の残り ${state.queue.length + 1}問`;
  elements.unlockNotice.textContent = state.unlockMessage;
  elements.unlockNotice.classList.toggle("is-hidden", !state.unlockMessage);
  state.unlockMessage = "";

  updateOverallProgress();
  setContentDensity(elements.questionCard, question.prompt, question.answer);
  fitTextInsideCard(elements.questionCard, elements.answerText, state.answerVisible);
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

  const stageBefore = getTermStage(
    term,
    state.progress,
    state.subject.masteryTarget,
  );
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
    state.terms = chunks.flatMap((chunk) => chunk.terms);
    state.termById = new Map(state.terms.map((term) => [term.id, term]));
    state.questionById = new Map(
      state.terms.flatMap((term) =>
        learningStages.flatMap((stage) =>
          term.stages[stage].map((question) => [question.id, question]),
        ),
      ),
    );
    state.progressKey = `anki-progress:${state.subject.id}:${state.subject.version}:v1`;
    loadStoredProgress();
    loadShufflePreference();
    buildQueue();
    state.currentTask = state.queue.shift() ?? null;
    state.answerVisible = false;
    state.answeredThisSession = 0;
    state.unlockMessage = "";

    elements.subjectName.textContent = state.subject.title;
    elements.completionTitle.textContent = `${state.subject.termCount}語・${state.subject.questionCount}問を完全習得しました`;
    updateShuffleButton();
    renderQuestion();
    showOnly(elements.studyShell);
  } catch (error) {
    elements.errorMessage.textContent = error.message;
    showOnly(elements.errorPanel);
  }
}

elements.revealAction.addEventListener("click", () => {
  state.answerVisible = true;
  renderQuestion();
});

elements.againAction.addEventListener("click", () => rateCurrentQuestion(false));
elements.rememberedAction.addEventListener("click", () => rateCurrentQuestion(true));

elements.shuffleToggle.addEventListener("click", () => {
  state.shuffleEnabled = !state.shuffleEnabled;
  saveShufflePreference();
  updateShuffleButton();
  buildQueue();
  state.currentTask = state.queue.shift() ?? null;
  state.answerVisible = false;
  state.answeredThisSession = 0;
  renderQuestion();
});

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
    fitTextInsideCard(elements.questionCard, elements.answerText, true);
  }
});

start();
