import {
  getStoredAccessKey,
  loadCloudRatingAnalysis,
} from "./cloud-progress.js";
import {
  analysisRatingValues,
  buildWeaknessSections,
  createEmptyAnalysisCounts,
  totalAnalysisAnswers,
} from "./analysis-core.js";

const elements = {
  subject: document.querySelector("#analysis-subject"),
  period: document.querySelector("#analysis-period"),
  status: document.querySelector("#analysis-status"),
  results: document.querySelector("#analysis-results"),
  summary: document.querySelector("#analysis-summary"),
  dataNote: document.querySelector("#analysis-data-note"),
  sectionList: document.querySelector("#analysis-section-list"),
};

const ratingDisplays = {
  again: { symbol: "×", label: "不正解" },
  hard: { symbol: "△", label: "難しい" },
  good: { symbol: "○", label: "正解" },
  easy: { symbol: "◎", label: "簡単" },
};

let currentAnalysis = null;
let selectedSubjectId = "";

function showStatus(message, kind = "") {
  elements.status.className = `analysis-status${kind ? ` is-${kind}` : ""}`;
  elements.status.textContent = message;
  elements.results.classList.add("is-hidden");
}

function setBusy(busy) {
  elements.subject.disabled = busy || elements.subject.options.length <= 1;
  elements.period.disabled = busy;
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
  const subjects = subjectsFromRows(currentAnalysis?.rows ?? []);
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

function renderResults() {
  const rows = selectedRows();
  renderSummary(rows);
  const sections = buildWeaknessSections(rows, selectedSubjectId);
  elements.sectionList.replaceChildren(...sections.map(createWeaknessSection));
  const excluded = currentAnalysis?.unratedAnswerCount ?? 0;
  elements.dataNote.textContent = excluded > 0
    ? `この期間には、更新前の記録または4段階評価を選ばなかった聞き流しが${excluded.toLocaleString("ja-JP")}件あります。これらは苦手度の計算に含めていません。`
    : "分析は、この機能の公開後に保存された4段階評価を対象にしています。";
  elements.dataNote.classList.remove("is-hidden");
  elements.status.classList.add("is-hidden");
  elements.results.classList.remove("is-hidden");
}

async function loadAnalysis(period) {
  setBusy(true);
  showStatus("Cloudflareから評価記録を読み込んでいます。");
  try {
    currentAnalysis = await loadCloudRatingAnalysis(period);
    if (currentAnalysis.rows.length === 0) {
      showStatus(
        "まだ分析できる4段階評価がありません。次の学習から記録がたまります。",
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
