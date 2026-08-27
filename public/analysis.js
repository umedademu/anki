import {
  getStoredAccessKey,
  loadCloudRatingAnalysis,
} from "./cloud-progress.js";
import {
  analysisRatingValues,
  buildLegacyWeaknessSections,
  buildWeaknessSections,
  createLegacyAnalysisRow,
  createEmptyAnalysisCounts,
  totalAnalysisAnswers,
} from "./analysis-core.js";

const elements = {
  subject: document.querySelector("#analysis-subject"),
  period: document.querySelector("#analysis-period"),
  status: document.querySelector("#analysis-status"),
  results: document.querySelector("#analysis-results"),
  legacySummary: document.querySelector("#analysis-legacy-summary"),
  legacyNote: document.querySelector("#analysis-legacy-note"),
  legacyEmpty: document.querySelector("#analysis-legacy-empty"),
  legacySectionList: document.querySelector("#analysis-legacy-section-list"),
  summary: document.querySelector("#analysis-summary"),
  dataNote: document.querySelector("#analysis-data-note"),
  exactEmpty: document.querySelector("#analysis-exact-empty"),
  sectionList: document.querySelector("#analysis-section-list"),
};

const ratingDisplays = {
  again: { symbol: "×", label: "不正解" },
  hard: { symbol: "△", label: "難しい" },
  good: { symbol: "○", label: "正解" },
  easy: { symbol: "◎", label: "簡単" },
};

let currentAnalysis = null;
let legacyAnalysis = { rows: [], unmatchedAttempts: 0, unmatchedQuestions: 0 };
let selectedSubjectId = "";
const legacyDeckPromises = new Map();

function showStatus(message, kind = "") {
  elements.status.className = `analysis-status${kind ? ` is-${kind}` : ""}`;
  elements.status.textContent = message;
  elements.results.classList.add("is-hidden");
}

function setBusy(busy) {
  elements.subject.disabled = busy || elements.subject.options.length <= 1;
  elements.period.disabled = busy;
}

function learningDataBaseUrl() {
  const baseUrl = String(window.ANKI_CONFIG?.dataBaseUrl ?? "").replace(/\/$/, "");
  if (!baseUrl) {
    throw new Error("Cloudflareの学習データ読込先が設定されていません。");
  }
  return baseUrl;
}

async function fetchLearningData(relativePath) {
  const path = String(relativePath ?? "").replace(/^\/+/, "");
  const response = await fetch(`${learningDataBaseUrl()}/${path}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`学習データを読み込めませんでした（${response.status}）。`);
  }
  return response.json();
}

function questionsFromTerm(term) {
  return Object.values(term?.stages ?? {}).flatMap((questions) =>
    Array.isArray(questions) ? questions : [],
  );
}

function currentDecksFromManifest(manifest) {
  return (Array.isArray(manifest?.subjects) ? manifest.subjects : []).flatMap(
    (subject) => (Array.isArray(subject.decks) ? subject.decks : []).map((deck) => ({
      ...deck,
      subjectId: subject.id,
      subjectTitle: subject.title,
    })),
  );
}

async function loadLegacyDeck(deck) {
  if (!legacyDeckPromises.has(deck.version)) {
    legacyDeckPromises.set(deck.version, (async () => {
      const subject = await fetchLearningData(deck.indexPath);
      const chunks = await Promise.all(
        (subject.chunks ?? []).map((chunk) => fetchLearningData(chunk.path)),
      );
      const questions = new Map();
      for (const term of chunks.flatMap((chunk) => chunk.terms ?? [])) {
        for (const question of questionsFromTerm(term)) {
          questions.set(question.id, { term, question });
        }
      }
      return { subject, questions };
    })());
  }
  return legacyDeckPromises.get(deck.version);
}

async function buildLegacyAnalysis(progressRows) {
  if (progressRows.length === 0) {
    return { rows: [], unmatchedAttempts: 0, unmatchedQuestions: 0 };
  }
  const manifest = await fetchLearningData("index.json");
  const deckByVersion = new Map(
    currentDecksFromManifest(manifest).map((deck) => [deck.version, deck]),
  );
  const progressByVersion = new Map();
  for (const progress of progressRows) {
    if (!progressByVersion.has(progress.datasetVersion)) {
      progressByVersion.set(progress.datasetVersion, []);
    }
    progressByVersion.get(progress.datasetVersion).push(progress);
  }
  const rows = [];
  let unmatchedAttempts = 0;
  let unmatchedQuestions = 0;
  await Promise.all([...progressByVersion.entries()].map(async ([version, records]) => {
    const deck = deckByVersion.get(version);
    if (!deck) {
      unmatchedAttempts += records.reduce((total, row) => total + row.attempts, 0);
      unmatchedQuestions += records.length;
      return;
    }
    const loaded = await loadLegacyDeck(deck);
    for (const progress of records) {
      const context = loaded.questions.get(progress.questionId);
      if (!context) {
        unmatchedAttempts += progress.attempts;
        unmatchedQuestions += 1;
        continue;
      }
      const row = createLegacyAnalysisRow({
        progress,
        subject: loaded.subject,
        deck,
        term: context.term,
        question: context.question,
      });
      if (row) rows.push(row);
    }
  }));
  return { rows, unmatchedAttempts, unmatchedQuestions };
}

function subjectsFromRows(rows) {
  const subjects = new Map();
  for (const row of rows) {
    subjects.set(row.subjectId, row.subjectTitle);
  }
  return [...subjects.entries()]
    .map(([id, title]) => ({ id, title }))
    .sort((left, right) => left.title.localeCompare(right.title, "ja"));
}

function renderSubjectOptions() {
  const subjects = subjectsFromRows([
    ...(currentAnalysis?.rows ?? []),
    ...legacyAnalysis.rows,
  ]);
  if (!subjects.some((subject) => subject.id === selectedSubjectId)) {
    selectedSubjectId = subjects[0]?.id ?? "";
  }
  elements.subject.replaceChildren(
    ...subjects.map((subject) => {
      const option = document.createElement("option");
      option.value = subject.id;
      option.textContent = subject.title;
      option.selected = subject.id === selectedSubjectId;
      return option;
    }),
  );
  elements.subject.disabled = subjects.length <= 1;
}

function selectedRows() {
  return (currentAnalysis?.rows ?? []).filter(
    (row) => row.subjectId === selectedSubjectId,
  );
}

function selectedLegacyRows() {
  return legacyAnalysis.rows.filter((row) => row.subjectId === selectedSubjectId);
}

function combinedCounts(rows) {
  const counts = createEmptyAnalysisCounts();
  for (const row of rows) counts[row.rating] += row.answerCount;
  return counts;
}

function createSummaryItem(label, value, className = "") {
  const item = document.createElement("article");
  item.className = `analysis-summary-item${className ? ` ${className}` : ""}`;
  const heading = document.createElement("span");
  heading.textContent = label;
  const strong = document.createElement("strong");
  strong.textContent = value;
  item.append(heading, strong);
  return item;
}

function renderSummary(rows) {
  const counts = combinedCounts(rows);
  elements.summary.replaceChildren(
    createSummaryItem("評価した回数", `${totalAnalysisAnswers(counts).toLocaleString("ja-JP")}回`),
    ...analysisRatingValues.map((rating) =>
      createSummaryItem(
        `${ratingDisplays[rating].symbol} ${ratingDisplays[rating].label}`,
        `${counts[rating].toLocaleString("ja-JP")}回`,
        `is-${rating}`,
      ),
    ),
  );
}

function renderLegacySummary(rows) {
  const attempts = rows.reduce((total, row) => total + row.attempts, 0);
  const remembered = rows.reduce((total, row) => total + row.rememberedCount, 0);
  const incorrect = Math.max(0, attempts - remembered);
  const unmastered = rows.filter((row) => !row.currentlyMastered).length;
  elements.legacySummary.replaceChildren(
    createSummaryItem("総回答回数", `${attempts.toLocaleString("ja-JP")}回`),
    createSummaryItem("× 不正解", `${incorrect.toLocaleString("ja-JP")}回`, "is-again"),
    createSummaryItem(
      "不正解以外",
      `${remembered.toLocaleString("ja-JP")}回`,
      "is-remembered",
    ),
    createSummaryItem("回答した問題", `${rows.length.toLocaleString("ja-JP")}問`),
    createSummaryItem("まだ未習得", `${unmastered.toLocaleString("ja-JP")}問`, "is-unmastered"),
  );
}

function createRatingCounts(counts) {
  const list = document.createElement("div");
  list.className = "analysis-rating-counts";
  for (const rating of analysisRatingValues) {
    const item = document.createElement("span");
    item.className = `is-${rating}`;
    item.textContent = `${ratingDisplays[rating].symbol}${counts[rating]}`;
    item.title = `${ratingDisplays[rating].label} ${counts[rating]}回`;
    list.append(item);
  }
  return list;
}

function createWeaknessItem(item, rank = null) {
  const row = document.createElement("li");
  row.className = rank == null ? "is-collecting" : "";
  const main = document.createElement("div");
  main.className = "analysis-item-main";
  const heading = document.createElement("div");
  heading.className = "analysis-item-heading";
  const rankLabel = document.createElement("span");
  rankLabel.className = "analysis-rank";
  rankLabel.textContent = rank == null ? "参考" : `${rank}位`;
  const name = document.createElement("strong");
  name.textContent = item.name;
  const score = document.createElement("span");
  score.className = "analysis-score";
  score.textContent = `苦手度 ${item.weaknessScore}`;
  heading.append(rankLabel, name, score);
  const meter = document.createElement("div");
  meter.className = "analysis-score-meter";
  const fill = document.createElement("span");
  fill.style.width = `${item.weaknessScore}%`;
  meter.append(fill);
  main.append(heading, meter);
  const details = document.createElement("div");
  details.className = "analysis-item-details";
  const total = document.createElement("span");
  total.textContent = `${item.answerCount}回`;
  details.append(createRatingCounts(item.counts), total);
  row.append(main, details);
  return row;
}

function createLegacyWeaknessItem(item, rank = null) {
  const row = document.createElement("li");
  row.className = rank == null ? "is-collecting" : "";
  const main = document.createElement("div");
  main.className = "analysis-item-main";
  const heading = document.createElement("div");
  heading.className = "analysis-item-heading";
  const rankLabel = document.createElement("span");
  rankLabel.className = "analysis-rank";
  rankLabel.textContent = rank == null ? "参考" : `${rank}位`;
  const name = document.createElement("strong");
  name.textContent = item.name;
  const score = document.createElement("span");
  score.className = "analysis-score";
  score.textContent = `不正解率 ${item.incorrectRate}%`;
  heading.append(rankLabel, name, score);
  const meter = document.createElement("div");
  meter.className = "analysis-score-meter";
  const fill = document.createElement("span");
  fill.style.width = `${item.incorrectRate}%`;
  meter.append(fill);
  main.append(heading, meter);
  const details = document.createElement("div");
  details.className = "analysis-item-details analysis-legacy-details";
  const counts = document.createElement("span");
  counts.className = "analysis-legacy-counts";
  counts.textContent = `不正解 ${item.incorrectCount} / 全${item.attempts}回`;
  const questions = document.createElement("span");
  questions.textContent = `未習得 ${item.unmasteredQuestionCount} / ${item.questionCount}問`;
  details.append(counts, questions);
  row.append(main, details);
  return row;
}

function createWeaknessSection(section) {
  const card = document.createElement("article");
  card.className = "analysis-section";
  const heading = document.createElement("div");
  heading.className = "analysis-section-heading";
  const title = document.createElement("h2");
  title.textContent = `苦手な${section.label} TOP10`;
  const note = document.createElement("span");
  note.textContent = "5回以上を順位化";
  heading.append(title, note);
  const list = document.createElement("ol");
  list.className = "analysis-ranking";
  if (section.ranked.length > 0) {
    list.append(...section.ranked.map((item, index) =>
      createWeaknessItem(item, index + 1),
    ));
  } else {
    const empty = document.createElement("li");
    empty.className = "analysis-section-empty";
    empty.textContent = "順位を出すには、この分類の評価が5回以上必要です。";
    list.append(empty);
  }
  card.append(heading, list);
  if (section.collecting.length > 0) {
    const collectingTitle = document.createElement("p");
    collectingTitle.className = "analysis-collecting-title";
    collectingTitle.textContent = "記録を収集中の項目";
    const collecting = document.createElement("ul");
    collecting.className = "analysis-ranking analysis-collecting";
    collecting.append(...section.collecting.map((item) => createWeaknessItem(item)));
    card.append(collectingTitle, collecting);
  }
  return card;
}

function createLegacyWeaknessSection(section) {
  const card = document.createElement("article");
  card.className = "analysis-section analysis-legacy-section";
  const heading = document.createElement("div");
  heading.className = "analysis-section-heading";
  const title = document.createElement("h3");
  title.textContent = `不正解率が高い${section.label} TOP10`;
  const note = document.createElement("span");
  note.textContent = "回答5回以上を順位化";
  heading.append(title, note);
  const list = document.createElement("ol");
  list.className = "analysis-ranking";
  if (section.ranked.length > 0) {
    list.append(...section.ranked.map((item, index) =>
      createLegacyWeaknessItem(item, index + 1),
    ));
  } else {
    const empty = document.createElement("li");
    empty.className = "analysis-section-empty";
    empty.textContent = "順位を出すには、この分類の回答が5回以上必要です。";
    list.append(empty);
  }
  card.append(heading, list);
  if (section.collecting.length > 0) {
    const collectingTitle = document.createElement("p");
    collectingTitle.className = "analysis-collecting-title";
    collectingTitle.textContent = "回答回数が5回未満の参考値";
    const collecting = document.createElement("ul");
    collecting.className = "analysis-ranking analysis-collecting";
    collecting.append(...section.collecting.map((item) =>
      createLegacyWeaknessItem(item),
    ));
    card.append(collectingTitle, collecting);
  }
  return card;
}

function renderLegacyResults() {
  const rows = selectedLegacyRows();
  const hasRows = rows.length > 0;
  elements.legacySummary.classList.toggle("is-hidden", !hasRows);
  elements.legacySectionList.classList.toggle("is-hidden", !hasRows);
  elements.legacyEmpty.classList.toggle("is-hidden", hasRows);
  if (!hasRows) {
    elements.legacyEmpty.textContent =
      "この科目には、現在の問題集と照合できる過去の回答記録がありません。";
    elements.legacySectionList.replaceChildren();
  } else {
    renderLegacySummary(rows);
    const sections = buildLegacyWeaknessSections(rows, selectedSubjectId);
    elements.legacySectionList.replaceChildren(
      ...sections.map(createLegacyWeaknessSection),
    );
  }
  const hasUnmatched = legacyAnalysis.unmatchedQuestions > 0;
  elements.legacyNote.classList.toggle("is-hidden", !hasUnmatched);
  if (hasUnmatched) {
    elements.legacyNote.textContent =
      `問題集の更新により現在の分類へ照合できない記録が、全科目で${legacyAnalysis.unmatchedQuestions.toLocaleString("ja-JP")}問・${legacyAnalysis.unmatchedAttempts.toLocaleString("ja-JP")}回答あります。正確さを保つため順位には含めていません。`;
  }
}

function renderExactResults() {
  const rows = selectedRows();
  const hasRows = rows.length > 0;
  elements.summary.classList.toggle("is-hidden", !hasRows);
  elements.sectionList.classList.toggle("is-hidden", !hasRows);
  elements.exactEmpty.classList.toggle("is-hidden", hasRows);
  if (hasRows) {
    renderSummary(rows);
    const sections = buildWeaknessSections(rows, selectedSubjectId);
    elements.sectionList.replaceChildren(...sections.map(createWeaknessSection));
  } else {
    elements.exactEmpty.textContent =
      "この科目・期間には、まだ4段階評価による詳細分析の記録がありません。";
    elements.sectionList.replaceChildren();
  }
  const excluded = currentAnalysis?.unratedAnswerCount ?? 0;
  elements.dataNote.textContent = excluded > 0
    ? `この期間には、4段階の内訳がない記録が全科目で${excluded.toLocaleString("ja-JP")}件あります。これらは4段階の苦手度には含めず、引き継げた問題別の回答回数だけを上の全期間分析で別に集計しています。`
    : "4段階の詳細分析は、v0.170以降に保存された評価を対象にしています。";
  elements.dataNote.classList.remove("is-hidden");
}

function renderResults() {
  renderLegacyResults();
  renderExactResults();
  elements.status.classList.add("is-hidden");
  elements.results.classList.remove("is-hidden");
}

async function loadAnalysis(period) {
  setBusy(true);
  showStatus("Cloudflareから評価記録を読み込んでいます。");
  try {
    currentAnalysis = await loadCloudRatingAnalysis(period);
    showStatus("過去の学習記録を現在の問題分類へ照合しています。");
    legacyAnalysis = await buildLegacyAnalysis(currentAnalysis.legacyProgressRows);
    if (currentAnalysis.rows.length === 0 && legacyAnalysis.rows.length === 0) {
      showStatus(
        legacyAnalysis.unmatchedQuestions > 0
          ? `過去の回答記録はありますが、現在の問題集へ照合できる記録がありませんでした。照合対象外は${legacyAnalysis.unmatchedQuestions.toLocaleString("ja-JP")}問・${legacyAnalysis.unmatchedAttempts.toLocaleString("ja-JP")}回答です。`
          : "まだ分析できる回答記録がありません。次の学習から記録がたまります。",
        "empty",
      );
      return;
    }
    renderSubjectOptions();
    renderResults();
  } catch (error) {
    showStatus(`分析記録を読み込めませんでした。${error.message}`, "error");
  } finally {
    setBusy(false);
  }
}

elements.subject.addEventListener("change", () => {
  selectedSubjectId = elements.subject.value;
  renderResults();
});

elements.period.addEventListener("change", (event) => {
  if (event.target.name === "period" && event.target.checked) {
    void loadAnalysis(event.target.value);
  }
});

if (!getStoredAccessKey()) {
  showStatus(
    "設定ページでCloudflareのアクセスキーを登録すると分析を表示できます。",
    "error",
  );
  setBusy(false);
} else {
  void loadAnalysis(30);
}
