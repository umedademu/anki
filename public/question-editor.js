import { cloudRequest } from "./cloud-progress.js";
import { getQuestionExplanation } from "./learning-engine.js";

const $ = (id) => document.getElementById(id);
const form = $("question-form");
const params = new URLSearchParams(location.search);
const subjectId = params.get("subject") ?? "";
const initialDecks = params.getAll("deck");
const state = { data: null, rows: [], selected: null, clean: "", busy: false, page: 0, undoId: null, operation: null };
const pageSize = 30;
const keys = ["prompt", "answer", "explanation", "term", "category", "macroRegion", "regionDetail", "stage", "acceptedAnswers", "answerNote", "yearMnemonic"];
const returnParams = new URLSearchParams({ subject: subjectId });
if (params.get("routine") === "1") returnParams.set("routine", "1");
$("return-to-study").href = `/?${returnParams}`;

function status(message, error = false) {
  $("editor-status").textContent = message;
  $("editor-status").parentElement.classList.toggle("is-error", error);
}
function values() { return Object.fromEntries(["targetDeckId", ...keys].map((key) => [key, form.elements.namedItem(key).value])); }
function dirty() { return !form.hidden && JSON.stringify(values()) !== state.clean; }
function refreshDirty() { $("dirty-status").textContent = dirty() ? "未保存の変更があります" : ""; }
function setBusy(value) {
  state.busy = value;
  $("editor-fields").disabled = value;
  for (const id of ["editor-deck", "editor-search", "editor-category", "add-question", "reload-editor", "undo-delete", "close-form"]) $(id).disabled = value || (!state.data && id !== "reload-editor");
  renderList();
}
function confirmAction(title, message, label) {
  $("confirm-title").textContent = title;
  $("confirm-message").textContent = message;
  $("confirm-proceed").textContent = label;
  const dialog = $("editor-confirm");
  dialog.returnValue = "cancel";
  dialog.showModal();
  return new Promise((resolve) => dialog.addEventListener("close", () => resolve(dialog.returnValue === "proceed"), { once: true }));
}
async function canLeave() {
  return !state.busy && (!dirty() || await confirmAction("変更を保存せずに移動しますか？", "入力中の変更は保存されません。", "保存せずに移動"));
}
function deckName(deck) { return deck.entry.difficultyLabel || deck.entry.datasetLabel || deck.entry.id; }
function option(value, text) { return new Option(text, value); }
function activeDecks() {
  const selected = $("editor-deck").value;
  if (selected === "selected") return state.data.decks.filter((d) => initialDecks.includes(d.entry.id));
  return state.data.decks.filter((d) => selected === "all" || selected === d.entry.id);
}
function categoryOptions() {
  const previous = $("editor-category").value;
  const categories = [...new Set(activeDecks().flatMap((d) => d.terms.map((t) => t.category)).filter(Boolean))].sort((a,b) => a.localeCompare(b, "ja"));
  $("editor-category").replaceChildren(option("", "すべての分類"), ...categories.map((c) => option(c,c)));
  if (categories.includes(previous)) $("editor-category").value = previous;
  $("category-suggestions").replaceChildren(...categories.map((c) => option(c,c)));
}
function renderList() {
  if (!state.data) return;
  const ids = new Set(activeDecks().map((d) => d.entry.id));
  const query = $("editor-search").value.trim().normalize("NFKC").toLocaleLowerCase();
  const category = $("editor-category").value;
  const matches = state.rows.filter((row) => ids.has(row.deck.entry.id) && (!category || row.term.category === category) && (!query || row.search.includes(query)));
  const pages = Math.max(1, Math.ceil(matches.length / pageSize));
  state.page = Math.max(0, Math.min(state.page, pages - 1));
  $("editor-count").textContent = `${matches.length.toLocaleString()}問`;
  $("page-position").textContent = `${state.page + 1} / ${pages}`;
  $("previous-page").disabled = state.busy || state.page === 0;
  $("next-page").disabled = state.busy || state.page === pages - 1;
  $("question-list").replaceChildren(...matches.slice(state.page * pageSize, (state.page + 1) * pageSize).map((row) => {
    const button = document.createElement("button");
    button.type = "button"; button.className = "question-row"; button.disabled = state.busy;
    button.setAttribute("aria-current", String(state.selected?.question.id === row.question.id));
    const deck = document.createElement("span"); deck.className = "question-deck"; deck.textContent = `${deckName(row.deck)} · ${row.deck.index.stageLabels?.[row.stage] ?? row.stage}`;
    const prompt = document.createElement("strong"); prompt.textContent = row.question.prompt;
    const answer = document.createElement("span"); answer.className = "question-answer"; answer.textContent = row.question.answer;
    button.append(deck, prompt, answer);
    button.addEventListener("click", async () => { if (await canLeave()) openForm(row); });
    return button;
  }));
  if (!matches.length) $("question-list").textContent = "該当する問題はありません。検索や絞り込みを変更するか、問題を追加してください。";
}
function configureFields(deck, stage) {
  const index = deck?.index ?? state.data.decks[0].index;
  $("question-stage").replaceChildren(...(index.availableStages ?? ["beginner", "reverse", "integrated"]).map((s) => option(s, index.stageLabels?.[s] ?? s)));
  if ([...$("question-stage").options].some((item) => item.value === stage)) $("question-stage").value = stage;
  $("category-label").textContent = index.filterLabels?.category ?? "分類";
  for (const [field, prefix] of [["macroRegion", "macro-region"], ["regionDetail", "region-detail"]]) {
    $(`${prefix}-field`).hidden = !index.filterLabels?.[field];
    $(`${prefix}-label`).textContent = index.filterLabels?.[field] ?? "分類";
  }
}
function openForm(row = null, focus = true) {
  state.selected = row; state.operation = null;
  const selectedDecks = activeDecks();
  const deck = row?.deck ?? (selectedDecks.length === 1 ? selectedDecks[0] : null);
  form.reset();
  $("target-deck").replaceChildren(option("", "追加先のデッキを選択"), ...state.data.decks.map((d) => option(d.entry.id, deckName(d))));
  $("target-deck").value = deck?.entry.id ?? "";
  configureFields(deck, row?.stage);
  const q = row?.question ?? {};
  const t = row?.term ?? {};
  const data = { ...q, term: t.term ?? "", category: t.category ?? "", macroRegion: t.geography?.macroRegion ?? "", regionDetail: t.geography?.regionDetail ?? "", acceptedAnswers: (q.acceptedAnswers ?? []).join("\n"), stage: row?.stage ?? $("question-stage").value };
  for (const key of keys) form.elements.namedItem(key).value = data[key] ?? "";
  const siblings = row ? Object.values(t.stages).flat().length : 1;
  $("shared-term-note").textContent = siblings > 1 ? `この用語には${siblings}問あります。用語・見出しと分類の変更は、同じ用語の問題にも反映されます。別デッキへ移動する場合は、この１問だけを移動します。` : "問題の分類や表示する補足を設定できます。";
  if (subjectId === "classical-chinese" && q.focus === "意味瞬発") {
    $("shared-term-note").textContent += " この問題の出題面には「用語・見出し」を表示します。";
  }
  const inheritedExplanation = row && !q.explanation ? getQuestionExplanation(t, q) : "";
  $("explanation-help").hidden = !inheritedExplanation;
  $("explanation-help").textContent = inheritedExplanation ? `空欄の場合は共通の解説を表示します：${inheritedExplanation}` : "";
  $("form-title").textContent = row ? "問題を編集" : "問題を追加";
  $("delete-question").hidden = !row;
  $("editor-details").open = false;
  $("editor-placeholder").hidden = true; form.hidden = false;
  $("editor-layout").classList.add("is-editing");
  state.clean = JSON.stringify(values()); refreshDirty(); renderList();
  if (focus) { $("form-title").focus(); if (matchMedia("(max-width: 760px)").matches) $("editor-layout").scrollIntoView(); }
}
function closeForm() {
  state.selected = null; state.operation = null; form.hidden = true;
  $("editor-placeholder").hidden = false; $("editor-layout").classList.remove("is-editing"); renderList();
}
async function loadData({ initial = false } = {}) {
  const data = await cloudRequest(`/v1/question-editor?subject=${encodeURIComponent(subjectId)}`);
  state.data = data;
  state.rows = data.decks.flatMap((deck) => deck.terms.flatMap((term) => Object.entries(term.stages).flatMap(([stage, questions]) => questions.map((question) => ({ deck, term, stage, question, search: `${question.prompt}\n${question.answer}\n${term.term}\n${question.explanation ?? ""}`.normalize("NFKC").toLocaleLowerCase() })))));
  $("editor-subject").textContent = `${data.subject.title}｜問題の管理`;
  document.title = `Anki | ${data.subject.title}の問題を編集`;
  const previous = $("editor-deck").value;
  const validInitial = data.decks.filter((d) => initialDecks.includes(d.entry.id));
  $("editor-deck").replaceChildren(option("all", "すべてのデッキ"), ...(validInitial.length > 1 ? [option("selected", "学習で選択中のデッキ")] : []), ...data.decks.map((d) => option(d.entry.id, deckName(d))));
  $("editor-deck").value = initial ? (validInitial.length === 1 ? validInitial[0].entry.id : validInitial.length > 1 ? "selected" : "all") : previous;
  if (!$("editor-deck").value) $("editor-deck").value = "all";
  categoryOptions(); renderList();
}
async function save(action) {
  if (state.busy) return;
  const row = state.selected;
  if (action === "delete" && !await confirmAction("この問題を削除しますか？", `${row.question.prompt}\n\n削除後は出題されなくなります。学習履歴は保持します。`, "削除する")) return;
  if (action === "undo" && !await canLeave()) return;
  const current = values();
  const input = action === "undo" ? { undoId: state.undoId } : {
    deckId: row?.deck.entry.id ?? current.targetDeckId, targetDeckId: current.targetDeckId,
    questionId: row?.question.id, fields: Object.fromEntries(keys.map((key) => [key, current[key]])),
  };
  const payload = { subjectId, revision: state.data.revision, action, ...input };
  const signature = JSON.stringify(payload);
  if (state.operation?.signature !== signature) state.operation = { signature, id: crypto.randomUUID() };
  payload.operationId = state.operation.id;
  setBusy(true); status("保存しています。画面を閉じずにお待ちください。");
  try {
    const result = await cloudRequest("/v1/question-editor", { method: "POST", body: JSON.stringify(payload) });
    state.undoId = result.undoId ?? null;
    $("undo-delete").hidden = !state.undoId;
    closeForm();
    try {
      await loadData();
      if (action === "create" || action === "update") {
        const updated = state.rows.find((item) => item.question.id === result.questionId);
        if (updated) openForm(updated, false);
      }
      status(action === "delete" ? "削除しました。次の保存操作を行うまでは元に戻せます。" : action === "undo" ? "削除した問題を元に戻しました。" : "保存しました。");
    } catch (error) { state.data = null; status(`保存は完了しました。一覧を更新できませんでした。「再読込」を押してください。${error.message}`, true); }
  } catch (error) { status(error.message, true); }
  finally { setBusy(false); refreshDirty(); }
}

form.addEventListener("input", refreshDirty);
$("target-deck").addEventListener("change", () => { configureFields(state.data.decks.find((d) => d.entry.id === $("target-deck").value), $("question-stage").value); refreshDirty(); });
form.addEventListener("submit", (event) => { event.preventDefault(); void save(state.selected ? "update" : "create"); });
$("delete-question").addEventListener("click", () => void save("delete"));
$("undo-delete").addEventListener("click", () => void save("undo"));
$("add-question").addEventListener("click", async () => { if (await canLeave()) openForm(); });
for (const id of ["cancel-edit", "close-form"]) $(id).addEventListener("click", async () => { if (await canLeave()) { closeForm(); $("add-question").focus(); } });
$("editor-deck").addEventListener("change", () => { state.page = 0; categoryOptions(); renderList(); });
for (const id of ["editor-search", "editor-category"]) $(id).addEventListener("input", () => { state.page = 0; renderList(); });
$("previous-page").addEventListener("click", () => { state.page--; renderList(); });
$("next-page").addEventListener("click", () => { state.page++; renderList(); });
$("reload-editor").addEventListener("click", async () => {
  if (!await canLeave()) return;
  setBusy(true); status("問題を読み込んでいます。");
  try { await loadData({ initial: !state.data }); closeForm(); state.undoId = null; $("undo-delete").hidden = true; status("最新の問題を読み込みました。"); }
  catch (error) { status(error.message, true); }
  finally { setBusy(false); }
});
document.addEventListener("click", async (event) => {
  const link = event.target.closest("a[href]");
  if (!link || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (dirty() || state.busy) { event.preventDefault(); if (await canLeave()) { state.clean = JSON.stringify(values()); location.assign(link.href); } }
});
window.addEventListener("beforeunload", (event) => { if (dirty() || state.busy) { event.preventDefault(); event.returnValue = ""; } });

setBusy(true);
loadData({ initial: true }).then(() => status("問題を選ぶか、「問題を追加」を押してください。"))
  .catch((error) => status(error.message, true)).finally(() => setBusy(false));
