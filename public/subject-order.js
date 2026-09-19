export function normalizeSubjectOrder(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .filter(id => typeof id === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(id)))].slice(0, 100);
}

export function orderSubjects(subjects, order) {
  const remaining = new Map(subjects.map(subject => [subject.id, subject]));
  const result = [];
  for (const id of normalizeSubjectOrder(order)) {
    if (!remaining.has(id)) continue;
    result.push(remaining.get(id));
    remaining.delete(id);
  }
  return [...result, ...remaining.values()];
}

// 押しただけなら科目を開き、移動を始めた場合だけ並べ替える。
export function createSubjectSorter(container, status, saveOrder) {
  let enabled = false, saving = false, drag = null, suppressClick = false, scrollFrame = 0;
  const tiles = () => [...container.querySelectorAll("[data-sort-subject]")];
  const order = () => tiles().map(tile => tile.dataset.sortSubject);
  function arrange(ids) {
    const map = new Map(tiles().map(tile => [tile.dataset.sortSubject, tile]));
    const anchor = container.querySelector("[data-random-video-action]");
    for (const id of ids) if (map.has(id)) container.insertBefore(map.get(id), anchor);
  }
  function updateControls() {
    for (const handle of container.querySelectorAll(".subject-drag-handle")) handle.disabled = !enabled || saving;
    container.classList.toggle("can-sort", enabled && !saving);
  }
  async function commit(previous, focusId) {
    const next = order();
    if (next.join("|") === previous.join("|")) return;
    saving = true; updateControls();
    status.textContent = "並び順を保存しています…";
    try {
      await saveOrder(next);
      status.textContent = "並び順を保存しました。";
    } catch (error) {
      arrange(previous);
      status.textContent = `並び順を保存できませんでした。元の順番に戻しました。もう一度お試しください。${error.message}`;
    } finally {
      saving = false; updateControls();
      if (focusId) tiles().find(tile => tile.dataset.sortSubject === focusId)?.querySelector(".subject-drag-handle").focus({ preventScroll: true });
    }
  }
  function finish(cancel = false) {
    if (!drag) return;
    const previous = drag.previous, moved = drag.moved, tile = drag.tile, handle = drag.handle;
    const capture = drag.capture, pointerId = drag.pointerId;
    drag = null;
    cancelAnimationFrame(scrollFrame);
    scrollFrame = 0;
    tile.classList.remove("is-dragging");
    if (capture.hasPointerCapture(pointerId)) capture.releasePointerCapture(pointerId);
    if (!moved) return;
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    if (cancel) { arrange(previous); status.textContent = "並べ替えを取り消しました。"; }
    else void commit(previous, handle ? tile.dataset.sortSubject : null);
  }
  container.addEventListener("pointerdown", event => {
    if (!enabled || saving || event.button !== 0 || drag) return;
    const tile = event.target.closest("[data-sort-subject]");
    const handle = event.target.closest(".subject-drag-handle");
    if (!tile || (event.pointerType !== "mouse" && !handle)) return;
    if (handle) event.preventDefault();
    drag = { tile, handle, capture: container, pointerId: event.pointerId,
      x: event.clientX, y: event.clientY, moved: false, previous: order(), lastTarget: null };
  });
  container.addEventListener("pointermove", event => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 8) return;
    if (!drag.moved) {
      drag.moved = true;
      drag.capture.setPointerCapture(event.pointerId);
      drag.tile.classList.add("is-dragging");
    }
    event.preventDefault();
    drag.clientX = event.clientX; drag.clientY = event.clientY;
    moveAtPointer();
    if (!scrollFrame) scrollFrame = requestAnimationFrame(autoScroll);
  });
  function moveAtPointer() {
    const target = document.elementFromPoint(drag.clientX, drag.clientY)?.closest("[data-sort-subject]");
    if (!target || !container.contains(target) || target === drag.tile) { drag.lastTarget = null; return; }
    if (target === drag.lastTarget) return;
    drag.lastTarget = target;
    const current = tiles(), from = current.indexOf(drag.tile), to = current.indexOf(target);
    container.insertBefore(drag.tile, from < to ? target.nextSibling : target);
    status.textContent = drag.tile.querySelector("strong").textContent + "を" + (to + 1) + "番目へ移動";
  }
  function autoScroll() {
    scrollFrame = 0;
    if (!drag?.moved) return;
    const y = drag.clientY, margin = 65;
    const amount = y < margin ? -12 : y > window.innerHeight - margin ? 12 : 0;
    if (amount) {
      const before = window.scrollY;
      window.scrollBy({ top: amount, behavior: "instant" });
      if (window.scrollY !== before) moveAtPointer();
    }
    scrollFrame = requestAnimationFrame(autoScroll);
  }
  window.addEventListener("pointerup", event => { if (event.pointerId === drag?.pointerId) finish(); });
  window.addEventListener("pointercancel", event => { if (event.pointerId === drag?.pointerId) finish(true); });
  window.addEventListener("blur", () => finish(true));
  container.addEventListener("lostpointercapture", event => { if (event.target === container) finish(true); });
  container.addEventListener("dragstart", event => event.preventDefault());
  container.addEventListener("click", event => {
    if (suppressClick || event.target.closest(".subject-drag-handle")) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  container.addEventListener("keydown", event => {
    if (event.key === "Escape" && drag) { event.preventDefault(); finish(true); return; }
    const handle = event.target.closest(".subject-drag-handle");
    if (!handle || !enabled || saving || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const previous = order(), tile = handle.closest("[data-sort-subject]"), from = previous.indexOf(tile.dataset.sortSubject);
    const to = from + (["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1);
    if (to < 0 || to >= previous.length) return;
    const next = [...previous]; next.splice(to, 0, next.splice(from, 1)[0]); arrange(next);
    void commit(previous, tile.dataset.sortSubject);
  });
  return {
    beforeRender() { finish(true); },
    setEnabled(value) { enabled = value; updateControls(); },
  };
}
