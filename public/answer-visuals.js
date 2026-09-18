const manifestPath = "subjects/world-history-so/answer-visuals/index.json";

export function parseAnswerVisuals(value) {
  if (value?.schemaVersion !== 1 || value.subjectId !== "world-history-so" || !Array.isArray(value.assignments)) {
    throw new Error("解答用の地図一覧を確認できませんでした。");
  }
  const entries = new Map();
  for (const entry of value.assignments) {
    if (typeof entry.questionId !== "string" || entries.has(entry.questionId)) throw new Error("地図の問題番号が不正です。");
    if (entry.map && (!/^subjects\/world-history-so\/answer-visuals\/maps\/[a-f0-9]+\.svg$/.test(entry.map.path) ||
      typeof entry.map.alt !== "string" || !Array.isArray(entry.map.places))) throw new Error("地図の情報が不正です。");
    if (entry.relatedImage && !/^term-images\/[a-zA-Z0-9_/-]+\.(webp|png|jpe?g)$/.test(entry.relatedImage.path)) throw new Error("関連画像の情報が不正です。");
    entries.set(entry.questionId, entry);
  }
  return entries;
}

export function createAnswerVisuals({ root, dialog, fetchJson, getDataUrl }) {
  const get = name => root.querySelector(`[data-map="${name}"]`);
  const picture = get("image"), openButton = get("open"), heading = get("heading");
  const error = get("error"), retry = get("retry"), details = get("details"), places = get("places");
  const zoomImage = dialog.querySelector("img"), viewport = dialog.querySelector(".answer-map-viewport");
  const zoomLabel = dialog.querySelector("output");
  let entries = new Map(), pending = null, loaded = false, current = null, displayed = null, zoom = 1;
  function close() {
    if (dialog.open) dialog.close();
    zoomImage.removeAttribute("src"); zoomImage.alt = "";
  }
  function clear() {
    close(); displayed = null;
    root.classList.add("is-hidden"); picture.removeAttribute("src"); picture.alt = "";
    heading.textContent = ""; places.replaceChildren(); details.open = false;
    error.classList.add("is-hidden");
  }
  async function load() {
    if (loaded) return true;
    pending ??= (async () => {
      try { entries = parseAnswerVisuals(await fetchJson(manifestPath)); loaded = true; return true; }
      catch (cause) { console.warn("解答用の地図を取得できませんでした。", cause); return false; }
      finally { pending = null; }
    })();
    return pending;
  }
  function showError() {
    openButton.classList.add("is-hidden"); error.classList.remove("is-hidden"); close();
  }
  function render(question, visible, subjectId) {
    current = { question, visible, subjectId };
    if (!visible || subjectId !== "world-history-so" || !question || question.questionMap ||
      (!entries.has(question.id) && (loaded || (question.source?.chapterNumber && question.source.chapterNumber !== 6)))) { clear(); return; }
    const map = entries.get(question.id)?.map;
    if (displayed === question.id && map && picture.hasAttribute("src")) return;
    clear(); displayed = question.id;
    root.classList.remove("is-hidden");
    heading.textContent = map?.title ?? "この問題の位置関係";
    if (!map) { showError(); return; }
    openButton.classList.remove("is-hidden");
    picture.alt = map.alt;
    picture.src = getDataUrl(map.path);
    for (const place of map.places) {
      const item = document.createElement("li"), name = document.createElement("strong");
      name.textContent = place.name;
      item.append(name, document.createTextNode(`：${place.note}`)); places.append(item);
    }
  }
  function setZoom(value) {
    zoom = Math.max(1, Math.min(3, value));
    zoomImage.style.width = `${Math.max(900, viewport.clientWidth) * zoom}px`;
    zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
    dialog.querySelector('[data-zoom="out"]').disabled = zoom === 1;
    dialog.querySelector('[data-zoom="in"]').disabled = zoom === 3;
  }
  openButton.addEventListener("click", () => {
    if (!current?.visible || !picture.hasAttribute("src")) return;
    zoomImage.src = picture.src; zoomImage.alt = picture.alt;
    dialog.showModal(); setZoom(1); viewport.scrollTo(0, 0);
  });
  dialog.querySelector('[data-zoom="close"]').addEventListener("click", close);
  dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
  dialog.querySelector('[data-zoom="in"]').addEventListener("click", () => setZoom(zoom + .5));
  dialog.querySelector('[data-zoom="out"]').addEventListener("click", () => setZoom(zoom - .5));
  dialog.querySelector('[data-zoom="reset"]').addEventListener("click", () => { setZoom(1); viewport.scrollTo(0, 0); });
  dialog.addEventListener("close", () => { zoomImage.removeAttribute("src"); zoomImage.alt = ""; });
  picture.addEventListener("error", showError);
  retry.addEventListener("click", async () => {
    retry.disabled = true;
    try {
      await load();
      picture.removeAttribute("src"); displayed = null;
      if (current) render(current.question, current.visible, current.subjectId);
    } finally { retry.disabled = false; }
  });
  // 地図の拡大・説明の開閉を、画面左右の回答操作へ渡さない。
  for (const element of [root, dialog]) for (const event of ["click", "touchstart", "touchend", "pointerdown", "pointerup"]) element.addEventListener(event, e => e.stopPropagation());
  return { load, render, reset() { current = null; clear(); }, get modalOpen() { return dialog.open; },
    relatedImage(questionId, subjectId) { return subjectId === "world-history-so" ? entries.get(questionId)?.relatedImage : null; } };
}
