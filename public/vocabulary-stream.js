import { normalizeRatingCounts } from "./rating-results.js";

const ratings = [
  ["again", "× 不正解", "incorrect"],
  ["hard", "△ 難しい", "hard"],
  ["good", "○ 正解", "good"],
  ["easy", "◎ 簡単", "easy"],
];
// 画面に同時に置く行数と、途中記録に残す行数（最新の単語と10個前まで）。
export const vocabularyStreamVisibleRows = 3;
export const vocabularyStreamRowLimit = 11;
const scrollableSelector = ".vocabulary-stream-word, .vocabulary-stream-answer";
// ここを押した時は今まで通りの操作にし、一時停止・再生を切り替えない。
const interactiveSelector = "button, a, input, select, textarea, label, summary, [contenteditable], [role='button']";
// 押してから離すまでの指の移動がこれ以内ならタップとみなす。
const tapSlop = 10;

// 同じ回答の評価を訂正する。回答した回数そのものは増やさない。
export function reviseRatingCounts(value, previous, next) {
  const counts = normalizeRatingCounts(value);
  if (previous === next) return counts;
  if (Object.hasOwn(counts, previous)) counts[previous] = Math.max(0, counts[previous] - 1);
  if (Object.hasOwn(counts, next)) counts[next] += 1;
  return counts;
}

function overflowing(element) {
  return element && element.scrollHeight > element.clientHeight + 1 ? element : null;
}

export function createVocabularyStreamView(panel, { reveal, rate, back, toggle, advance, togglePlayback, pausePlayback }) {
  const list = document.createElement("div");
  list.className = "vocabulary-stream-list";
  const position = document.createElement("button");
  position.id = "vocabulary-stream-latest";
  position.type = "button";
  position.className = "vocabulary-stream-position";
  position.hidden = true;
  // 一時停止中は、一番上の行の右上に止まっていることを出し続ける。
  const pausedLabel = document.createElement("span");
  pausedLabel.id = "vocabulary-stream-paused";
  pausedLabel.className = "vocabulary-stream-paused";
  pausedLabel.setAttribute("role", "status");
  pausedLabel.hidden = true;
  panel.append(list, position, pausedLabel);
  let renderedHeader = null;
  let previousRows = [];
  let previousOffset = 0;
  // 上から何個前の単語を一番上に置いているか。0なら最新の単語を表示している。
  let offset = 0;
  let topRow = null;
  let lastArguments = null;
  let cardsByRow = new Map();
  const activeAnimations = new Map();
  let suppressClick = false;
  let gesture = null;
  let wheelDistance = 0;
  let wheelTimer = 0;
  let wheelCooldownUntil = 0;
  let tap = null;

  panel.addEventListener("click", event => {
    // スワイプの終わりに起きるクリックで、指の下のボタンを押した扱いにしない。
    if (suppressClick) return;
    const button = event.target.closest("button");
    if (!button || button.disabled) return;
    if (button.hasAttribute("data-stream-reveal")) reveal();
    else if (button.hasAttribute("data-stream-rating")) {
      rate(Number(button.closest(".vocabulary-stream-row").dataset.streamRow), button.dataset.streamRating);
    } else if (button.id === "vocabulary-stream-back") back();
    else if (button.id === "vocabulary-stream-toggle") toggle();
    else if (button.id === "vocabulary-stream-next") advance();
    else if (button.id === "vocabulary-stream-latest") setOffset(0);
  });

  function rowStep() {
    const card = list.firstElementChild;
    const gap = Number.parseFloat(window.getComputedStyle(list).rowGap) || 0;
    return card ? card.getBoundingClientRect().height + gap : 120;
  }
  // スワイプやホイールで過去へ遡り始めたら一時停止する。再開はタップだけで行う。
  function setOffset(next, { byGesture = false } = {}) {
    const max = Math.max(0, previousRows.length - vocabularyStreamVisibleRows);
    const clamped = Math.max(0, Math.min(max, next));
    if (clamped === offset) return;
    if (byGesture && clamped > offset) pausePlayback?.();
    offset = clamped;
    topRow = previousRows[offset] ?? null;
    if (lastArguments) view.render(lastArguments);
  }

  // 上下のスワイプで過去の単語へ移動する。長い本文の欄の中では、欄の中身を上下に動かす。
  list.addEventListener("pointerdown", event => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    const scroller = overflowing(event.target.closest(scrollableSelector));
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, offset, moved: false,
      scroller, scrollTop: scroller?.scrollTop ?? 0 };
  });
  list.addEventListener("pointermove", event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    const dy = event.clientY - gesture.y;
    const dx = event.clientX - gesture.x;
    if (gesture.scroller) {
      gesture.scroller.scrollTop = gesture.scrollTop - dy;
      if (Math.abs(dy) > 8) gesture.moved = true;
      return;
    }
    if (!gesture.moved) {
      if (Math.abs(dy) < 14 || Math.abs(dy) <= Math.abs(dx) * 1.2) return;
      gesture.moved = true;
      try { list.setPointerCapture(event.pointerId); } catch { /* 取得できなくても移動は続ける */ }
    }
    // 短いスワイプで1つ、行の高さを超える長いスワイプではその分だけまとめて動かす。
    const rowsMoved = Math.max(1, Math.round(Math.abs(dy) / rowStep()));
    setOffset(gesture.offset + (dy < 0 ? rowsMoved : -rowsMoved), { byGesture: true });
  });
  const endGesture = event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    if (gesture.moved) {
      suppressClick = true;
      window.setTimeout(() => { suppressClick = false; }, 0);
    }
    gesture = null;
  };
  list.addEventListener("pointerup", endGesture);
  list.addEventListener("pointercancel", endGesture);
  // パソコンではマウスのホイールでも1つずつ移動する。
  list.addEventListener("wheel", event => {
    if (overflowing(event.target.closest(scrollableSelector))) return;
    if (previousRows.length <= vocabularyStreamVisibleRows) return;
    event.preventDefault();
    const now = performance.now();
    if (now < wheelCooldownUntil) return;
    wheelDistance += event.deltaY;
    window.clearTimeout(wheelTimer);
    wheelTimer = window.setTimeout(() => { wheelDistance = 0; }, 200);
    if (Math.abs(wheelDistance) < 40) return;
    setOffset(offset + Math.sign(wheelDistance), { byGesture: true });
    wheelDistance = 0;
    wheelCooldownUntil = now + 220;
  }, { passive: false });

  // 3語表示が出ている間は、ボタンや入力欄以外のどこをタップしても一時停止・再生を切り替える。
  // 指が動いた操作（スワイプや欄の中のスクロール）はタップとして扱わない。
  const page = panel.ownerDocument;
  const showing = () => panel.isConnected && !panel.classList.contains("is-hidden") && panel.getClientRects().length > 0;
  page.addEventListener("pointerdown", event => {
    tap = event.isPrimary && showing() ? { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false } : null;
  });
  page.addEventListener("pointermove", event => {
    if (!tap || event.pointerId !== tap.id) return;
    if (Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > tapSlop) tap.moved = true;
  });
  page.addEventListener("pointercancel", () => { tap = null; });
  page.addEventListener("click", event => {
    const start = tap;
    tap = null;
    if (!togglePlayback || suppressClick || !showing() || start?.moved || event.button !== 0) return;
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > tapSlop) return;
    if (!(event.target instanceof Element) || event.target.closest(interactiveSelector)) return;
    togglePlayback(event.target);
  });

  const view = {
    render(renderArguments) {
      lastArguments = renderArguments;
      const { rows, currentTask, answerVisible, saving, canGoBack, summary, resolve, interval,
        listening = false, paused = false, savingRows = new Set() } = renderArguments;
      const motionDuration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 160 : 280;
      const addsNewRow = previousRows.length > 0 && rows[0] !== previousRows[0] && rows[1] === previousRows[0];
      const sameRows = rows.length === previousRows.length && rows.every((row, index) => row === previousRows[index]);
      // 最新を見ている時は最新に留まり、過去を見ている時は同じ単語を一番上に残す。
      if (offset > 0) {
        const index = rows.indexOf(topRow);
        offset = index >= 0 ? index : 0;
      }
      offset = Math.max(0, Math.min(offset, rows.length - vocabularyStreamVisibleRows));
      topRow = rows[offset] ?? null;
      const windowMoved = sameRows && offset !== previousOffset;
      const animates = addsNewRow || windowMoved;
      const previousTops = new Map();
      if (animates) {
        for (const [row, card] of cardsByRow) previousTops.set(row, card.getBoundingClientRect().top);
      }
      if (!sameRows || windowMoved) {
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
      const visibleRows = rows.slice(offset, offset + vocabularyStreamVisibleRows);
      for (const [position, row] of visibleRows.entries()) {
        const index = offset + position;
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
          // 保存中に止めるのは押した行だけにし、ほかの行はすぐ押せるようにする。
          button.disabled = saving || savingRows.has(row) || !visible || superseded;
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
      const oldest = Math.min(rows.length - 1, offset + vocabularyStreamVisibleRows - 1);
      position.hidden = offset === 0;
      position.textContent = offset > 0 ? `${offset}〜${oldest}つ前の単語を表示中 ▼ 最新へ戻る` : "";
      position.setAttribute("aria-label", "最新の単語へ戻る");
      if (offset > 0) position.style.top = `${list.offsetTop + 4}px`;
      pausedLabel.hidden = !paused;
      pausedLabel.textContent = paused ? "Ⅱ 一時停止中" : "";
      if (paused) pausedLabel.style.top = `${list.offsetTop + 4}px`;
      if (animates) {
        const gap = Number.parseFloat(window.getComputedStyle(list).rowGap) || 0;
        for (const [row, card] of nextCardsByRow) {
          const rect = card.getBoundingClientRect();
          const previousTop = previousTops.get(row);
          let travel;
          if (previousTop === undefined) {
            // 新しく現れた行は、前の表示位置が上なら上から、下なら下から入る。
            const index = Number(card.dataset.streamRow);
            const previousPosition = (addsNewRow ? index - 1 : index) - previousOffset;
            travel = (previousPosition < 0 ? -1 : 1) * (rect.height + gap);
          } else travel = previousTop - rect.top;
          if (Math.abs(travel) < 1) continue;
          const animation = card.animate([
            { transform: `translateY(${travel}px)` },
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
      previousOffset = offset;
    },
  };
  return view;
}
