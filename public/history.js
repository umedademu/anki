import {
  getStoredAccessKey,
  loadCloudStudyHistory,
} from "./cloud-progress.js";

const status = document.querySelector("#history-status");
const historyList = document.querySelector("#history-list");
const modeLabels = {
  memorize: "暗記モード",
  "listen-answer": "聞き流し",
};

function formatStudyDate(studyDate) {
  const date = new Date(`${studyDate}T12:00:00+09:00`);
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Tokyo",
  }).format(date);
}

function groupHistory(rows) {
  const days = new Map();
  for (const row of rows) {
    if (!days.has(row.studyDate)) {
      days.set(row.studyDate, {
        studyDate: row.studyDate,
        answeredCount: 0,
        subjects: new Map(),
      });
    }
    const day = days.get(row.studyDate);
    const subjectKey = `${row.subjectId}\0${row.subjectTitle}`;
    if (!day.subjects.has(subjectKey)) {
      day.subjects.set(subjectKey, {
        title: row.subjectTitle,
        answeredCount: 0,
        rows: [],
      });
    }
    const subject = day.subjects.get(subjectKey);
    day.answeredCount += row.answeredCount;
    subject.answeredCount += row.answeredCount;
    subject.rows.push(row);
  }
  return [...days.values()];
}

function createHistoryDay(day) {
  const card = document.createElement("article");
  card.className = "history-day-card";

  const heading = document.createElement("div");
  heading.className = "history-day-heading";
  const date = document.createElement("h2");
  date.textContent = formatStudyDate(day.studyDate);
  const total = document.createElement("strong");
  total.textContent = `合計 ${day.answeredCount.toLocaleString("ja-JP")}問`;
  heading.append(date, total);
  card.append(heading);

  for (const subject of day.subjects.values()) {
    const section = document.createElement("section");
    section.className = "history-subject";
    const subjectHeading = document.createElement("h3");
    subjectHeading.textContent = `${subject.title}　${subject.answeredCount.toLocaleString("ja-JP")}問`;
    const rows = document.createElement("ul");
    rows.className = "history-rows";
    for (const row of subject.rows) {
      const item = document.createElement("li");
      const details = document.createElement("div");
      const deck = document.createElement("span");
      deck.className = "history-deck-name";
      deck.textContent = row.deckTitle;
      const mode = document.createElement("span");
      mode.className = "history-mode";
      mode.textContent = modeLabels[row.studyMode];
      details.append(deck, mode);
      const count = document.createElement("strong");
      count.textContent = `${row.answeredCount.toLocaleString("ja-JP")}問`;
      item.append(details, count);
      rows.append(item);
    }
    section.append(subjectHeading, rows);
    card.append(section);
  }
  return card;
}

function showStatus(message, kind = "") {
  status.className = `history-status${kind ? ` is-${kind}` : ""}`;
  status.textContent = message;
  historyList.classList.add("is-hidden");
}

async function start() {
  if (!getStoredAccessKey()) {
    showStatus("設定ページでCloudflareのアクセスキーを登録すると学習記録を表示できます。", "error");
    return;
  }
  try {
    const { history } = await loadCloudStudyHistory();
    if (history.length === 0) {
      showStatus("まだ日別の学習記録はありません。学習を始めるとここへ残ります。", "empty");
      return;
    }
    historyList.replaceChildren(...groupHistory(history).map(createHistoryDay));
    status.classList.add("is-hidden");
    historyList.classList.remove("is-hidden");
  } catch (error) {
    showStatus(`学習記録を読み込めませんでした。${error.message}`, "error");
  }
}

void start();
