import { normalizeRatingCounts } from "./rating-results.js";

const ratings = [
  ["again", "× 不正解", "incorrect"],
  ["hard", "△ 難しい", "hard"],
  ["good", "○ 正解", "good"],
  ["easy", "◎ 簡単", "easy"],
];

// 同じ回答の評価を訂正する。回答した回数そのものは増やさない。
export function reviseRatingCounts(value, previous, next) {
  const counts = normalizeRatingCounts(value);
  if (previous === next) return counts;
  if (Object.hasOwn(counts, previous)) counts[previous] = Math.max(0, counts[previous] - 1);
  if (Object.hasOwn(counts, next)) counts[next] += 1;
  return counts;
}

export function createVocabularyStreamView(panel, { reveal, rate, back, toggle, advance }) {
  const list = document.createElement("div");
  list.className = "vocabulary-stream-list";
  panel.append(list);
  let renderedHeader = null;
  let previousRows = [];
  let cardsByRow = new Map();
  const activeAnimations = new Map();
  panel.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button || button.disabled) return;
    if (button.hasAttribute("data-stream-reveal")) reveal();
    else if (button.hasAttribute("data-stream-rating")) {
      rate(Number(button.closest(".vocabulary-stream-row").dataset.streamRow), button.dataset.streamRating);
    } else if (button.id === "vocabulary-stream-back") back();
    else if (button.id === "vocabulary-stream-toggle") toggle();
    else if (button.id === "vocabulary-stream-next") advance();
  });

  return {
    render({ rows, currentTask, answerVisible, saving, canGoBack, summary, resolve, interval, listening = false, paused = false, ratingSaving = false }) {
      const motionDuration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 160 : 280;
      const addsNewRow = previousRows.length > 0 && rows[0] !== previousRows[0] && rows[1] === previousRows[0];
      const sameRows = rows.length === previousRows.length && rows.every((row, index) => row === previousRows[index]);
      const previousTops = new Map();
      if (addsNewRow) {
        for (const [row, card] of cardsByRow) previousTops.set(row, card.getBoundingClientRect().top);
      }
      if (!sameRows) {
        activeAnimations.forEach(animation => animation.cancel());
        activeAnimations.clear();
      }
      const header = document.createElement("div");
      header.className = "vocabulary-stream-heading";
      const title = document.createElement("strong");
      title.textContent = `${listening ? "聞き流し" : "暗記モード"}・3語表示`;
      const progress = document.createElement("span");
      progress.className = "vocabulary-stream-summary";
      progress.append(...[].concat(summary));
      const backButton = document.createElement("button");
      backButton.id = "vocabulary-stream-back";
      backButton.type = "button";
      backButton.className = "secondary-button";
      backButton.textContent = "一手戻る";
      backButton.disabled = saving || !canGoBack;
      header.append(title, progress, backButton);
      if (listening) {
        const toggleButton = document.createElement("button");
        toggleButton.id = "vocabulary-stream-toggle";
        toggleButton.type = "button";
        toggleButton.className = "secondary-button";
        toggleButton.textContent = paused ? "再生" : "一時停止";
        toggleButton.setAttribute("aria-label", paused ? "聞き流しを再生" : "聞き流しを一時停止");
        toggleButton.disabled = saving;
        const nextButton = document.createElement("button");
        nextButton.id = "vocabulary-stream-next";
        nextButton.type = "button";
        nextButton.className = "secondary-button";
        nextButton.textContent = "次へ";
        nextButton.disabled = saving || !answerVisible;
        header.append(toggleButton, nextButton);
      }

      const nextCardsByRow = new Map();
      for (const [index, row] of rows.entries()) {
        const content = resolve(row);
        if (!content) continue;
        const current = index === 0 && !row.activityId && row.questionId === currentTask?.questionId;
        const visible = current ? answerVisible : row.answerVisible;
        // 同じ問題を再出題したら、古い出現から新しい評価を上書きさせない。
        const superseded = rows.slice(0, index).some(newer => newer.questionId === row.questionId);
        const card = cardsByRow.get(row) ?? document.createElement("article");
        card.className = "vocabulary-stream-row";
        card.classList.toggle("is-current", current);
        card.dataset.questionId = row.questionId;
        card.dataset.streamRow = String(index);
        card.setAttribute("aria-label", `${index === 0 ? "最新" : `${index}つ前`}の単語`);
        const pair = document.createElement("div");
        pair.className = "vocabulary-stream-pair";
        const word = document.createElement("div");
        word.className = "vocabulary-stream-word";
        word.lang = "en";
        word.textContent = content.word;
        const answer = document.createElement("div");
        answer.className = "vocabulary-stream-answer";
        const meaning = document.createElement("div");
        meaning.className = "vocabulary-stream-meaning";
        // 未公開の訳は画面外や読み上げ用の要素にも埋め込まない。
        meaning.textContent = visible ? content.meaning : "";
        meaning.hidden = !visible;
        answer.append(meaning);
        if (current && !visible && !listening) {
          const revealButton = document.createElement("button");
          revealButton.type = "button";
          revealButton.className = "primary-button vocabulary-stream-reveal";
          revealButton.dataset.streamReveal = "";
          revealButton.textContent = "答えを表示";
          revealButton.disabled = saving;
          answer.append(revealButton);
        }
        pair.append(word, answer);
        const actions = document.createElement("div");
        actions.className = "vocabulary-stream-ratings";
        for (const [rating, label, style] of ratings) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = `rating-action rating-${style}`;
          button.dataset.streamRating = rating;
          button.disabled = saving || ratingSaving || !visible || superseded;
          button.setAttribute("aria-pressed", String(row.rating === rating));
          button.setAttribute("aria-label", `${content.word}：${label.slice(2)}`);
          if (superseded) button.title = "同じ単語の最新の表示から評価してください";
          const name = document.createElement("span");
          name.textContent = label;
          const due = document.createElement("small");
          due.textContent = interval(rating);
          button.append(name, due);
          actions.append(button);
        }
        card.replaceChildren(pair, actions);
        nextCardsByRow.set(row, card);
      }
      if (renderedHeader) renderedHeader.replaceWith(header);
      else panel.prepend(header);
      renderedHeader = header;
      const cards = [...nextCardsByRow.values()];
      for (const card of [...list.children]) if (!cards.includes(card)) card.remove();
      cards.forEach((card, index) => {
        if (list.children[index] !== card) list.insertBefore(card, list.children[index] ?? null);
      });
      if (addsNewRow) {
        const gap = Number.parseFloat(window.getComputedStyle(list).rowGap) || 0;
        for (const [row, card] of nextCardsByRow) {
          const rect = card.getBoundingClientRect();
          const previousTop = previousTops.get(row);
          const offset = previousTop === undefined ? -(rect.height + gap) : previousTop - rect.top;
          const animation = card.animate([
            { transform: `translateY(${offset}px)` },
            { transform: "translateY(0)" },
          ], { duration: motionDuration, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)", fill: "both" });
          activeAnimations.set(card, animation);
          animation.finished.then(() => {
            if (activeAnimations.get(card) === animation) {
              animation.cancel();
              activeAnimations.delete(card);
            }
          }, () => {});
        }
      }
      // 行そのものを残し、音声や保存状態の更新で進行中の動きを消さない。
      cardsByRow = nextCardsByRow;
      previousRows = [...rows];
    },
  };
}
