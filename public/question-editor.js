import { orderedEditorRows, createEditorRowDrag } from "./editor-row-order.js?v=0.276";
import { cloudRequest } from "./cloud-progress.js";
import { getQuestionExplanation } from "./learning-engine.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const subjectId = params.get("subject") ?? "";
const initialDecks = params.getAll("deck");
const pageSize = 30;
const saveDelay = 700;
const fields = ["prompt", "answer", "explanation", "category", "term", "stage", "macroRegion", "regionDetail", "acceptedAnswers", "answerNote", "yearMnemonic"];
const labels = { targetDeckId: "デッキ", prompt: "問題文", answer: "回答", explanation: "解説", category: "分類", term: "用語・見出し", stage: "問題形式", macroRegion: "大分類", regionDetail: "小分類", acceptedAnswers: "別の正答", answerNote: "回答の補足", yearMnemonic: "語呂合わせ" };
const sharedFields = new Set(["term", "category", "macroRegion", "regionDetail"]);
const state = { data: null, rows: [], page: 0, loading: true, running: null, operation: null, timer: null, error: null, paused: false, undoId: null, message: "", allowUnload: false };
const returnParams = new URLSearchParams({ subject: subjectId });
if (params.get("routine") === "1") returnParams.set("routine", "1");
$("return-to-study").href = `/?${returnParams}`;
const option = (value, text) => new Option(text, value);
const deckName = (deck) => deck.entry.difficultyLabel || deck.entry.datasetLabel || deck.entry.id;
const valueOf = (row, field) => row.edits.get(field)?.value ?? row.base[field] ?? "";
const pending = (row) => row.isNew || row.edits.size > 0;
const hasPending = () => state.rows.some(pending) || Boolean(state.running || state.operation);
const getDeck = (id) => state.data?.decks.find((deck) => deck.entry.id === id);
const canSave = (row) => pending(row) && !rowProblem(row) && !row.composing.size && !row.removing;

function rowProblem(row) {
  if (!valueOf(row, "targetDeckId")) return "デッキを選択";
  if (!valueOf(row, "prompt").trim() || !valueOf(row, "answer").trim()) return "問題文・回答を入力";
  return "";
}

function updateStatus() {
  const count = state.rows.filter(pending).length;
  const incomplete = state.rows.some((row) => pending(row) && rowProblem(row));
  $("editor-status").textContent = state.loading ? "問題を読み込んでいます。" : state.error
    ? `${state.error.message} 入力内容はこの画面に残っています。`
    : state.running ? `自動保存中…${count ? `（未保存 ${count}行）` : ""}`
    : count ? `未保存 ${count}行。${incomplete ? "デッキ・問題文・回答がそろった行から自動保存します。" : "順に自動保存します。"}`
    : state.message || "すべて保存済みです。セルを直接編集できます。";
  $("editor-status").parentElement.classList.toggle("is-error", Boolean(state.error));
  $("retry-save").hidden = !state.error || !state.operation || state.error.status === 409;
  $("retry-save").disabled = Boolean(state.running);
  $("undo-delete").hidden = !state.undoId;
  $("undo-delete").disabled = Boolean(state.running || state.error || count || state.loading);
  $("reload-editor").disabled = Boolean(state.running || state.loading);
  for (const id of ["editor-deck", "editor-search", "editor-category", "add-question", "show-details"]) $(id).disabled = state.loading || !state.data;
  for (const row of state.rows) updateRowStatus(row);
}

function updateRowStatus(row) {
  if (!row.element) return;
  row.element.querySelector(".number-column").setAttribute("aria-disabled", String(!canReorder() || row.isNew));
  row.element.querySelector(".row-delete").disabled = Boolean(state.loading || state.running || state.paused || state.error);
  for (const input of row.element.querySelectorAll("[data-field]")) {
    input.disabled = state.loading;
    const required = ["prompt", "answer", "targetDeckId"].includes(input.dataset.field);
    input.setAttribute("aria-invalid", String(required && pending(row) && !valueOf(row, input.dataset.field).trim()));
  }
}

function readFields(deck, term, question, stage) {
  return { targetDeckId: deck.entry.id, prompt: question.prompt ?? "", answer: question.answer ?? "", explanation: question.explanation ?? "",
    category: term.category ?? "", term: term.term ?? "", stage, macroRegion: term.geography?.macroRegion ?? "", regionDetail: term.geography?.regionDetail ?? "",
    acceptedAnswers: (question.acceptedAnswers ?? []).join("\n"), answerNote: question.answerNote ?? "", yearMnemonic: question.yearMnemonic ?? "" };
}

// 保存結果は項目ごとに取り込み、送信後に入力された内容と入力位置を保つ。
function mergeData(data, reorder = false) {
  state.data = data;
  const existing = new Map(state.rows.filter((row) => row.questionId).map((row) => [row.questionId, row]));
  const found = new Set();
  for (const deck of data.decks) for (const term of deck.terms) for (const [stage, questions] of Object.entries(term.stages)) for (const question of questions) {
    let row = existing.get(question.id);
    if (!row) {
      row = { key: question.id, edits: new Map(), sequence: 0, composing: new Set(), readyAt: 0 };
      state.rows.push(row);
    }
    Object.assign(row, { questionId: question.id, deckId: deck.entry.id, term, question, isNew: false, base: readFields(deck, term, question, stage) });
    found.add(row);
  }
  state.rows = state.rows.filter((row) => row.isNew || found.has(row) || row.edits.size);
  if (reorder) state.rows = orderedEditorRows(state.rows, data.subject.editorQuestionOrder);
  $("editor-subject").textContent = `${data.subject.title}｜問題の管理`;
  document.title = `Anki | ${data.subject.title}の問題を編集`;
  for (const row of state.rows) syncCells(row);
}

function activeDeckIds() {
  const selected = $("editor-deck").value;
  return state.data.decks.filter((deck) => selected === "all" || (selected === "selected" ? initialDecks.includes(deck.entry.id) : deck.entry.id === selected)).map((deck) => deck.entry.id);
}

function categoryOptions() {
  const select = $("editor-category"), previous = select.value;
  const ids = new Set(activeDeckIds());
  const categories = [...new Set(state.rows.filter((row) => ids.has(valueOf(row, "targetDeckId"))).map((row) => valueOf(row, "category")).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja"));
  if (previous && !categories.includes(previous)) categories.push(previous);
  select.replaceChildren(option("", "すべての分類"), ...categories.map((value) => option(value, value)));
  if (categories.includes(previous)) select.value = previous;
}

function renderTable() {
  if (!state.data) return;
  const ids = new Set(activeDeckIds()), category = $("editor-category").value;
  const query = $("editor-search").value.trim().normalize("NFKC").toLocaleLowerCase();
  const matches = state.rows.filter((row) => row.isNew || (ids.has(valueOf(row, "targetDeckId")) && (!category || valueOf(row, "category") === category)
    && (!query || ["prompt", "answer", "term", "explanation"].map((field) => valueOf(row, field)).join("\n").normalize("NFKC").toLocaleLowerCase().includes(query))));
  const pages = Math.max(1, Math.ceil(matches.length / pageSize));
  state.page = Math.min(Math.max(0, state.page), pages - 1);
  const visible = matches.slice(state.page * pageSize, (state.page + 1) * pageSize);
  $("editor-count").textContent = `${matches.length.toLocaleString()}行`;
  $("page-position").textContent = `${state.page + 1} / ${pages}`;
  $("previous-page").disabled = state.page === 0;
  $("next-page").disabled = state.page === pages - 1;
  $("editor-empty").hidden = matches.length > 0;
  const nodes = visible.map((row, index) => {
    if (!row.element) row.element = createRow(row);
    const number = row.element.querySelector(".number-column");
    number.textContent = String(state.page * pageSize + index + 1);
    number.setAttribute("aria-label", `${number.textContent}行目の並び順を変更`);
    syncCells(row);
    return row.element;
  });
  const body = $("question-rows");
  for (const node of [...body.children]) if (!nodes.includes(node)) node.remove();
  nodes.forEach((node, index) => { if (body.children[index] !== node) body.insertBefore(node, body.children[index] ?? null); });
  updateStatus();
}

function stageOptions(row, select) {
  const deck = getDeck(valueOf(row, "targetDeckId")) ?? state.data.decks[0];
  const stages = deck.index.availableStages ?? ["beginner", "reverse", "integrated"];
  if (select.dataset.deck !== deck.entry.id) {
    select.replaceChildren(...stages.map((stage) => option(stage, deck.index.stageLabels?.[stage] ?? stage)));
    select.dataset.deck = deck.entry.id;
  }
}

function createRow(row) {
  const tr = document.createElement("tr"); tr.dataset.rowKey = row.key;
  const number = document.createElement("th"); number.scope = "row"; number.className = "number-column";
  number.tabIndex = 0; number.title = "ドラッグで行を移動（矢印キーでも変更できます）";
  tr.append(number);
  for (const field of ["targetDeckId", ...fields]) {
    const cell = document.createElement("td");
    cell.className = field === "targetDeckId" ? "deck-column" : ["prompt", "answer", "explanation", "category"].includes(field) ? `${field}-column` : "detail-column";
    const input = document.createElement(field === "stage" || field === "targetDeckId" ? "select" : "textarea");
    input.dataset.field = field; input.setAttribute("aria-label", labels[field]);
    if (field === "targetDeckId") input.replaceChildren(option("", "デッキを選択"), ...state.data.decks.map((deck) => option(deck.entry.id, deckName(deck))));
    else if (field === "stage") stageOptions(row, input);
    else { input.rows = 3; input.maxLength = sharedFields.has(field) ? 500 : 20000; input.spellcheck = false; }
    input.addEventListener("compositionstart", () => row.composing.add(field));
    input.addEventListener("compositionend", () => { row.composing.delete(field); editCell(row, field, input.value); });
    input.addEventListener(field === "stage" || field === "targetDeckId" ? "change" : "input", () => editCell(row, field, input.value));
    input.addEventListener("blur", () => {
      if (!row.composing.size) { row.readyAt = 0; scheduleSave(); queueMicrotask(() => syncCells(row)); }
    });
    cell.append(input); tr.append(cell);
  }
  const cell = document.createElement("td"); cell.className = "action-column";
  const remove = document.createElement("button"); remove.type = "button"; remove.className = "row-delete"; remove.textContent = "削除";
  remove.addEventListener("click", () => void deleteRow(row)); cell.append(remove); tr.append(cell);
  return tr;
}

function syncCells(row) {
  if (!row.element) return;
  row.element.dataset.questionId = row.questionId ?? "";
  for (const input of row.element.querySelectorAll("[data-field]")) {
    const field = input.dataset.field;
    if (input === document.activeElement || row.composing.has(field)) continue;
    if (field === "stage") stageOptions(row, input);
    if (input.value !== valueOf(row, field)) input.value = valueOf(row, field);
    if (field === "explanation") input.title = !valueOf(row, field) && row.term ? `空欄の場合の共通解説：${getQuestionExplanation(row.term, row.question) || "なし"}` : "";
    if (sharedFields.has(field)) input.title = "同じ用語の問題にも反映されます。";
    if (field === "prompt" && subjectId === "classical-chinese" && row.question?.focus === "意味瞬発") input.title = "この問題の出題面には、詳細列の「用語・見出し」を表示します。";
  }
  updateRowStatus(row);
}

function editCell(row, field, value) {
  // 送信中の値と同じに戻した場合も、新しい入力として記録する。
  if (value === row.base[field] && state.operation?.row !== row) row.edits.delete(field);
  else row.edits.set(field, { value, sequence: ++row.sequence });
  row.readyAt = Date.now() + saveDelay; state.message = "";
  if (field === "targetDeckId") {
    const deck = getDeck(value), stages = deck?.index.availableStages ?? ["beginner", "reverse", "integrated"];
    if (deck && !stages.includes(valueOf(row, "stage"))) row.edits.set("stage", { value: stages[0], sequence: ++row.sequence });
    syncCells(row);
  }
  updateStatus(); scheduleSave();
}

function scheduleSave() {
  clearTimeout(state.timer);
  if (state.loading || state.running || state.error || state.paused) return;
  const ready = state.rows.filter(canSave);
  if (!ready.length) return;
  state.timer = setTimeout(() => void saveNext(), Math.max(0, Math.min(...ready.map((row) => row.readyAt)) - Date.now()));
}

function saveNext(force = false) {
  if (state.running) return state.running;
  if (state.error || state.paused || state.loading) return Promise.resolve();
  const row = state.rows.find((row) => canSave(row) && (force || row.readyAt <= Date.now()));
  if (!row) { scheduleSave(); return Promise.resolve(); }
  const all = Object.fromEntries(["targetDeckId", ...fields].map((field) => [field, valueOf(row, field)]));
  return runOperation({ row, edits: new Map(row.edits), payload: { subjectId, revision: state.data.revision, operationId: crypto.randomUUID(),
    action: row.isNew ? "create" : "update", deckId: row.deckId ?? all.targetDeckId, targetDeckId: all.targetDeckId, questionId: row.questionId,
    fields: Object.fromEntries(fields.map((field) => [field, all[field]])) } });
}

function runOperation(operation) {
  clearTimeout(state.timer); state.operation = operation; state.error = null;
  state.running = executeOperation(operation).catch((error) => { state.error = error; }).finally(() => {
    state.running = null; updateStatus(); scheduleSave();
  });
  updateStatus(); return state.running;
}

async function executeOperation(operation) {
  // 応答が失われた場合は同じ操作番号で再送し、追加の二重登録を防ぐ。
  if (!operation.result) {
    const result = await cloudRequest("/v1/question-editor", { method: "POST", body: JSON.stringify(operation.payload) });
    if (result.ok !== true || typeof result.revision !== "string" || !result.revision
      || (["create", "update"].includes(operation.payload.action) && !result.questionId)) {
      throw new Error("保存結果を確認できませんでした。「保存を再試行」を押してください。");
    }
    operation.result = result;
  }
  const data = await fetchData();
  if (data.revision !== operation.result.revision) throw Object.assign(new Error("別の画面で問題集が更新されました。入力を控えてから再読込してください。"), { status: 409 });
  const { row, payload, result } = operation;
  if (row && (payload.action === "update" || payload.action === "create")) {
    row.questionId = result.questionId;
    for (const [field, sent] of operation.edits) if (row.edits.get(field)?.sequence === sent.sequence) row.edits.delete(field);
  }
  if (payload.action === "delete") state.rows = state.rows.filter((item) => item !== row);
  state.undoId = result.undoId ?? null; state.operation = null;
  mergeData(data, ["reorder", "undo"].includes(payload.action));
  if (document.activeElement !== $("editor-category")) categoryOptions();
  state.message = payload.action === "delete" ? "削除しました。次の自動保存までは元に戻せます。" : payload.action === "undo" ? "削除した行を元に戻しました。" : "すべて保存済みです。";
  // 自動保存のたびに表を作り直さず、入力位置・選択範囲・横スクロールを維持する。
  if (payload.action === "reorder" || payload.action === "delete" || payload.action === "undo" || !document.activeElement?.closest("tr[data-row-key]")) renderTable();
}

async function flushAll(except = null) {
  clearTimeout(state.timer);
  if (state.running) await state.running;
  while (!state.error && !state.loading && !state.paused && state.rows.some(canSave)) await saveNext(true);
  return !state.loading && !state.rows.some((row) => row !== except && pending(row)) && !state.operation;
}

async function confirmAction(title, message, label) {
  state.paused = true; clearTimeout(state.timer); updateStatus();
  $("confirm-title").textContent = title; $("confirm-message").textContent = message; $("confirm-proceed").textContent = label;
  const dialog = $("editor-confirm"); dialog.returnValue = "cancel"; dialog.showModal();
  const result = await new Promise((resolve) => dialog.addEventListener("close", () => resolve(dialog.returnValue === "proceed"), { once: true }));
  state.paused = false; updateStatus(); scheduleSave(); return result;
}

async function deleteRow(row) {
  if (state.running || state.error) return;
  if (!await confirmAction("この行を削除しますか？", `${valueOf(row, "prompt") || "入力中の新しい行"}\n\n削除後は出題されなくなります。学習履歴は保持します。`, "削除する")) return;
  if (row.isNew) { state.rows = state.rows.filter((item) => item !== row); renderTable(); scheduleSave(); return; }
  // 削除対象の未保存入力は送らず、ほかの行の保存を先に完了する。
  row.removing = true;
  if (!await flushAll(row)) { row.removing = false; state.message = "削除する前に、入力待ちの行を完成させてください。"; updateStatus(); scheduleSave(); return; }
  await runOperation({ row, payload: { subjectId, revision: state.data.revision, operationId: crypto.randomUUID(), action: "delete", deckId: row.deckId, questionId: row.questionId } });
}

function addRow() {
  const deckIds = activeDeckIds(), targetDeckId = deckIds.length === 1 ? deckIds[0] : "";
  const row = { key: `draft-${crypto.randomUUID()}`, isNew: true, edits: new Map(), sequence: 0, composing: new Set(), readyAt: 0,
    base: Object.fromEntries(["targetDeckId", ...fields].map((field) => [field, field === "targetDeckId" ? targetDeckId : field === "stage" ? (getDeck(targetDeckId)?.index.availableStages?.[0] ?? "beginner") : ""])) };
  state.rows.unshift(row); state.page = 0; renderTable();
  row.element.querySelector(`[data-field="${targetDeckId ? "prompt" : "targetDeckId"}"]`).focus();
}

const fetchData = () => cloudRequest(`/v1/question-editor?subject=${encodeURIComponent(subjectId)}`);
async function reloadData() {
  state.loading = true; updateStatus();
  try {
    const data = await fetchData(), previous = $("editor-deck").value, first = !state.data;
    state.rows = []; state.operation = null; state.error = null; state.undoId = null;
    mergeData(data, true);
    const valid = data.decks.filter((deck) => initialDecks.includes(deck.entry.id));
    $("editor-deck").replaceChildren(option("all", "すべてのデッキ"), ...(valid.length > 1 ? [option("selected", "学習で選択中のデッキ")] : []), ...data.decks.map((deck) => option(deck.entry.id, deckName(deck))));
    $("editor-deck").value = first ? (valid.length === 1 ? valid[0].entry.id : valid.length > 1 ? "selected" : "all") : previous;
    if (!$("editor-deck").value) $("editor-deck").value = "all";
    const index = data.decks[0].index;
    $("macro-region-label").textContent = index.filterLabels?.macroRegion ?? "大分類";
    $("region-detail-label").textContent = index.filterLabels?.regionDetail ?? "小分類";
    categoryOptions(); renderTable(); state.message = "すべて保存済みです。セルを直接編集できます。";
  } catch (error) { state.error = error; }
  finally { state.loading = false; updateStatus(); }
}

function canReorder() {
  return Boolean(state.data && !state.loading && !state.paused && !state.error && !hasPending());
}
async function reorderRows(questionId, targetQuestionId, placement) {
  if (!canReorder()) return;
  await runOperation({ payload: { subjectId, revision: state.data.revision, operationId: crypto.randomUUID(),
    action: "reorder", questionId, targetQuestionId, placement } });
}
const rowDrag = createEditorRowDrag($("question-rows"), document.querySelector(".editor-table-scroll"), {
  enabled: canReorder, move: reorderRows,
  page(direction) {
    const button = $(direction > 0 ? "next-page" : "previous-page");
    if (button.disabled) return false;
    state.page += direction; renderTable(); return true;
  },
});
for (const id of ["editor-deck", "editor-search", "editor-category", "reload-editor", "add-question", "previous-page", "next-page"]) {
  $(id).addEventListener("pointerdown", rowDrag.cancel);
}

$("add-question").addEventListener("click", addRow);
$("editor-deck").addEventListener("change", () => { state.page = 0; categoryOptions(); renderTable(); });
for (const id of ["editor-search", "editor-category"]) $(id).addEventListener("input", () => { state.page = 0; renderTable(); });
$("show-details").addEventListener("change", () => $("question-table").classList.toggle("show-details", $("show-details").checked));
$("previous-page").addEventListener("click", () => { state.page--; renderTable(); });
$("next-page").addEventListener("click", () => { state.page++; renderTable(); });
$("retry-save").addEventListener("click", () => { if (state.operation && !state.running) void runOperation(state.operation); });
$("undo-delete").addEventListener("click", () => {
  if (!hasPending() && state.undoId) void runOperation({ payload: { subjectId, revision: state.data.revision, operationId: crypto.randomUUID(), action: "undo", undoId: state.undoId } });
});
$("reload-editor").addEventListener("click", async () => {
  if (state.running) return;
  if (hasPending() && !await confirmAction("未保存の入力を破棄して再読込しますか？", "未保存のセルの内容は失われます。必要な入力をコピーしてから再読込してください。", "破棄して再読込")) return;
  clearTimeout(state.timer); await reloadData();
});
document.addEventListener("click", async (event) => {
  const link = event.target.closest("a[href]");
  if (!link || event.ctrlKey || event.metaKey || event.shiftKey || !hasPending()) return;
  event.preventDefault();
  if (await flushAll() || await confirmAction("未保存の入力を残して移動しますか？", "保存できていないセルがあります。この画面を離れると未保存の入力は失われます。", "保存せずに移動")) {
    state.allowUnload = true; clearTimeout(state.timer); location.assign(link.href);
  }
});
window.addEventListener("beforeunload", (event) => { if (!state.allowUnload && hasPending()) { event.preventDefault(); event.returnValue = ""; } });
void reloadData();
