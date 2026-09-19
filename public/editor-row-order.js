// 学習用の用語構造を崩さず、編集画面の一行単位の順番を扱う。
export function orderedEditorRows(rows, savedOrder = []) {
  const ranks = new Map((Array.isArray(savedOrder) ? savedOrder : []).map((id, i) => [id, i]));
  return [...rows].sort((a, b) => (ranks.get(a.questionId) ?? Infinity) - (ranks.get(b.questionId) ?? Infinity));
}
export function moveEditorQuestion(ids, source, target, placement) {
  if (source === target || !ids.includes(source) || !ids.includes(target) || !["before", "after"].includes(placement)) throw new Error("並べ替える行を確認してください。");
  const next = ids.filter(id => id !== source);
  next.splice(next.indexOf(target) + (placement === "after" ? 1 : 0), 0, source);
  return next;
}

export function createEditorRowDrag(body, scroll, { enabled, move, page }) {
  let drag = null, frame = 0;
  const clearMarks = () => body.querySelectorAll('.row-drop-before,.row-drop-after').forEach(row => row.classList.remove('row-drop-before','row-drop-after'));
  function targetAtPointer() {
    clearMarks(); drag.target = null;
    const row = document.elementFromPoint(drag.x, drag.y)?.closest('tr[data-question-id]');
    if (!row || !body.contains(row) || !row.dataset.questionId || row.dataset.questionId === drag.id) return;
    const box = row.getBoundingClientRect();
    drag.target = row.dataset.questionId;
    drag.placement = drag.y < box.top + box.height / 2 ? 'before' : 'after';
    row.classList.add('row-drop-' + drag.placement);
  }
  function tick(time) {
    frame = 0;
    if (!drag?.moved) return;
    const box = scroll.getBoundingClientRect(), top = Math.max(box.top + 65, 40), bottom = Math.min(box.bottom - 32, window.innerHeight - 32);
    const direction = drag.y < top ? -1 : drag.y > bottom ? 1 : 0;
    if (direction) {
      if ((direction > 0 && box.bottom > window.innerHeight) || (direction < 0 && box.top < 0)) {
        const before = window.scrollY;
        window.scrollBy({top: direction * 14, behavior: "instant"});
        if (before !== window.scrollY) { targetAtPointer(); frame = requestAnimationFrame(tick); return; }
      }
      const before = scroll.scrollTop;
      scroll.scrollTop += direction * 14;
      if (before === scroll.scrollTop) {
        if (drag.edgeDirection !== direction) { drag.edgeDirection = direction; drag.edgeSince = time; }
        if (time - drag.edgeSince > 800) {
          if (page(direction)) scroll.scrollTop = direction > 0 ? 0 : scroll.scrollHeight;
          drag.edgeSince = time;
        }
      } else drag.edgeDirection = 0;
      targetAtPointer();
    } else drag.edgeDirection = 0;
    frame = requestAnimationFrame(tick);
  }
  function finish(cancel = false) {
    if (!drag) return;
    const old = drag; drag = null; cancelAnimationFrame(frame); frame = 0;
    clearMarks(); old.element.classList.remove('row-dragging');
    if (body.hasPointerCapture(old.pointer)) body.releasePointerCapture(old.pointer);
    if (!cancel && old.moved && old.target) void move(old.id, old.target, old.placement);
  }
  body.addEventListener('pointerdown', event => {
    const handle = event.target.closest('.number-column'), row = handle?.closest('tr');
    if (!handle || event.button !== 0 || drag || !enabled() || !row.dataset.questionId) return;
    event.preventDefault(); handle.focus({preventScroll:true});
    drag = { id: row.dataset.questionId, element: row, pointer: event.pointerId, x: event.clientX, y: event.clientY,
      startX: event.clientX, startY: event.clientY, moved: false, edgeDirection: 0 };
    body.setPointerCapture(event.pointerId);
  });
  body.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointer) return;
    drag.x = event.clientX; drag.y = event.clientY;
    if (!drag.moved && Math.hypot(drag.x-drag.startX,drag.y-drag.startY) < 6) return;
    drag.moved = true; event.preventDefault(); drag.element.classList.add('row-dragging');
    targetAtPointer(); if (!frame) frame = requestAnimationFrame(tick);
  });
  window.addEventListener('pointerup', event => { if (event.pointerId === drag?.pointer) finish(); });
  window.addEventListener('pointercancel', event => { if (event.pointerId === drag?.pointer) finish(true); });
  body.addEventListener('lostpointercapture', event => { if (event.target === body) finish(true); });
  window.addEventListener('blur', () => finish(true));
  window.addEventListener('keydown', event => { if (event.key === 'Escape' && drag) { event.preventDefault(); finish(true); } });
  body.addEventListener('keydown', event => {
    if (!event.target.matches('.number-column') || !enabled() || !['ArrowUp','ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const rows = [...body.querySelectorAll('tr[data-question-id]')], row = event.target.closest('tr');
    const target = rows[rows.indexOf(row) + (event.key === 'ArrowUp' ? -1 : 1)];
    if (target) void move(row.dataset.questionId,target.dataset.questionId,event.key === 'ArrowUp' ? 'before' : 'after');
  });
  return { cancel: () => finish(true) };
}
