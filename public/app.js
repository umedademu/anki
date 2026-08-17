const elements = {
  loadingPanel: document.querySelector("#loading-panel"),
  studyShell: document.querySelector("#study-shell"),
  errorPanel: document.querySelector("#error-panel"),
  errorMessage: document.querySelector("#error-message"),
  retryButton: document.querySelector("#retry-button"),
  subjectName: document.querySelector("#subject-name"),
  termProgress: document.querySelector("#term-progress"),
  questionProgress: document.querySelector("#question-progress"),
  progressBar: document.querySelector("#progress-bar"),
  term: document.querySelector("#term"),
  questionCard: document.querySelector("#question-card"),
  questionNumber: document.querySelector("#question-number"),
  questionAxis: document.querySelector("#question-axis"),
  questionText: document.querySelector("#question-text"),
  answerPanel: document.querySelector("#answer-panel"),
  answerText: document.querySelector("#answer-text"),
  questionAction: document.querySelector("#question-action"),
  summaryCard: document.querySelector("#summary-card"),
  integratedQuestion: document.querySelector("#integrated-question"),
  integratedAnswer: document.querySelector("#integrated-answer"),
  keywords: document.querySelector("#keywords"),
  nextTerm: document.querySelector("#next-term"),
};

const state = {
  subject: null,
  chunkIndex: 0,
  terms: [],
  termIndex: 0,
  completedTerms: 0,
  questionIndex: 0,
  answerVisible: false,
};

function getConfig() {
  const config = window.ANKI_CONFIG ?? {};
  return {
    dataBaseUrl: String(config.dataBaseUrl ?? "/data").replace(/\/$/, ""),
    subjectId: String(config.subjectId ?? "world-history"),
  };
}

async function fetchJson(relativePath) {
  const { dataBaseUrl } = getConfig();
  const response = await fetch(`${dataBaseUrl}/${relativePath}`, {
    cache: "no-store",
  });

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

async function loadChunk(index) {
  const chunk = state.subject.chunks[index];
  const payload = await fetchJson(chunk.path);
  state.chunkIndex = index;
  state.terms = payload.terms;
  state.termIndex = 0;
}

function currentTerm() {
  return state.terms[state.termIndex];
}

function renderQuestion() {
  const term = currentTerm();
  const question = term.questions[state.questionIndex];
  const termNumber = Math.min(state.completedTerms + 1, state.subject.termCount);
  const questionNumber = state.questionIndex + 1;

  elements.term.textContent = term.term;
  elements.termProgress.textContent = `用語 ${termNumber} / ${state.subject.termCount}`;
  elements.questionProgress.textContent = `質問 ${questionNumber} / ${term.questions.length}`;
  elements.progressBar.style.width = `${(questionNumber / term.questions.length) * 100}%`;
  elements.questionNumber.textContent = `質問 ${questionNumber}`;
  elements.questionAxis.textContent = question.axis || "確認";
  elements.questionText.textContent = question.prompt;
  elements.answerText.textContent = question.answer;
  elements.answerPanel.classList.toggle("is-hidden", !state.answerVisible);
  elements.questionAction.textContent = state.answerVisible
    ? questionNumber === term.questions.length
      ? "統合説明へ"
      : "次の質問へ"
    : "答えを見る";
  elements.questionCard.classList.remove("is-hidden");
  elements.summaryCard.classList.add("is-hidden");
}

function renderSummary() {
  const term = currentTerm();
  elements.questionProgress.textContent = "全質問 完了";
  elements.progressBar.style.width = "100%";
  elements.questionCard.classList.add("is-hidden");
  elements.summaryCard.classList.remove("is-hidden");
  elements.integratedQuestion.textContent =
    term.integrated.prompt || `${term.term}について、学んだ内容をつなげて説明してみましょう。`;
  elements.integratedAnswer.textContent = term.integrated.explanation;
  elements.keywords.replaceChildren(
    ...term.keywords.map((keyword) => {
      const span = document.createElement("span");
      span.textContent = keyword;
      return span;
    }),
  );
  elements.nextTerm.textContent =
    state.completedTerms + 1 >= state.subject.termCount ? "最初の用語へ戻る" : "次の用語へ";
}

async function moveToNextTerm() {
  state.completedTerms += 1;
  state.questionIndex = 0;
  state.answerVisible = false;

  if (state.termIndex + 1 < state.terms.length) {
    state.termIndex += 1;
  } else if (state.chunkIndex + 1 < state.subject.chunks.length) {
    await loadChunk(state.chunkIndex + 1);
  } else {
    state.completedTerms = 0;
    await loadChunk(0);
  }

  renderQuestion();
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
    state.chunkIndex = 0;
    state.termIndex = 0;
    state.completedTerms = 0;
    state.questionIndex = 0;
    state.answerVisible = false;
    await loadChunk(0);

    elements.subjectName.textContent = state.subject.title;
    renderQuestion();
    showOnly(elements.studyShell);
  } catch (error) {
    elements.errorMessage.textContent = error.message;
    showOnly(elements.errorPanel);
  }
}

elements.questionAction.addEventListener("click", () => {
  if (!state.answerVisible) {
    state.answerVisible = true;
    renderQuestion();
    return;
  }

  if (state.questionIndex + 1 < currentTerm().questions.length) {
    state.questionIndex += 1;
    state.answerVisible = false;
    renderQuestion();
  } else {
    renderSummary();
  }
});

elements.nextTerm.addEventListener("click", async () => {
  elements.nextTerm.disabled = true;
  try {
    await moveToNextTerm();
  } finally {
    elements.nextTerm.disabled = false;
  }
});

elements.retryButton.addEventListener("click", start);

start();
