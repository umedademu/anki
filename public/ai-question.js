// 答えの表示中に、アプリ内で書いた質問を今の問題と一緒に Claude か ChatGPT へ渡す。
// URLで開くだけでAPIは使わない。返事は開いた先に表示され、アプリの評価や学習記録には触れない。

export const aiQuestionServices = {
  claude: "https://claude.ai/new",
  chatgpt: "https://chatgpt.com/",
};

// 英単語・古文・漢文・マインドセットは対象外にする。科目IDか学習の種類で判定する。
const excludedSubjectIds = new Set([
  "english-vocabulary",
  "classical-japanese",
  "classical-chinese",
  "mindset",
]);
const excludedLearningTypes = new Set(["vocabulary", "mindset"]);

export function showsAiQuestion(subject) {
  if (!subject) return false;
  return !excludedSubjectIds.has(subject.id) &&
    !excludedLearningTypes.has(subject.learningType);
}

// 問題文の読み仮名「(ひらがな)」は表示前と同じ規則で外す。
const readingPattern = /\([ぁ-ゖー]+(?:[・\s][ぁ-ゖー]+)*\)/g;
const htmlTagPattern = /<[^>]*>/g;
const hashtagLinePattern = /^[#＃]\S/u;

export function plainAiQuestionText(value) {
  return String(value ?? "")
    .replace(htmlTagPattern, "")
    .replace(readingPattern, "")
    .replaceAll("**", "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !hashtagLinePattern.test(line))
    .join("\n")
    .trim();
}

export function buildAiQuestionText({ prompt, answer, explanation, question = "" }) {
  const lines = [
    "次の一問一答について質問します。",
    `問題：${plainAiQuestionText(prompt)}`,
    `答え：${plainAiQuestionText(answer)}`,
  ];
  const plainExplanation = plainAiQuestionText(explanation);
  if (plainExplanation) lines.push(`解説：${plainExplanation}`);
  // 利用者の質問は書いたままの改行を保つ。
  lines.push(`質問：${String(question ?? "").trim()}`);
  return lines.join("\n");
}

export function aiQuestionUrl(service, fields) {
  const base = aiQuestionServices[service];
  if (!base) throw new Error(`未対応の送り先です: ${service}`);
  return `${base}?q=${encodeURIComponent(buildAiQuestionText(fields))}`;
}

// 質問を書く欄。開いている間は学習画面の操作を受け付けず、入力中のキーも学習画面へ渡さない。
export function createAiQuestionDialog({
  dialog,
  getFields,
  onOpen = () => {},
  openUrl = (url) => window.open(url, "_blank", "noopener,noreferrer"),
}) {
  const input = dialog.querySelector("textarea");
  const sendButtons = [...dialog.querySelectorAll("[data-ai-service]")];
  let fields = null;
  let draftKey = null;

  function update() {
    const empty = !input.value.trim();
    sendButtons.forEach((button) => { button.disabled = empty; });
  }

  // スマートフォンでキーボードが出た時も、見えている範囲に欄とボタンを収める。
  function fitVisibleViewport() {
    const viewport = window.visualViewport;
    if (!viewport || !dialog.open) return;
    dialog.style.setProperty("--ai-question-top", `${Math.round(viewport.offsetTop) + 8}px`);
    dialog.style.setProperty("--ai-question-max-height", `${Math.max(120, Math.floor(viewport.height) - 16)}px`);
  }

  function open() {
    if (dialog.open) return;
    fields = getFields();
    if (!fields) return;
    // 同じ問題なら書きかけの質問を残し、別の問題では空から書く。
    if (fields.key !== draftKey) input.value = "";
    draftKey = fields.key;
    onOpen();
    update();
    dialog.showModal();
    fitVisibleViewport();
    input.focus();
  }

  function close() {
    if (dialog.open) dialog.close();
  }

  function send(service) {
    const question = input.value.trim();
    if (!fields || !question) return;
    openUrl(aiQuestionUrl(service, { ...fields, question }));
    close();
  }

  input.addEventListener("input", update);
  sendButtons.forEach((button) => button.addEventListener("click", () => send(button.dataset.aiService)));
  dialog.querySelector("[data-ai-question='close']").addEventListener("click", close);
  // 欄の外（背景）をタップした時も閉じる。
  dialog.addEventListener("click", (event) => { if (event.target === dialog) close(); });
  dialog.addEventListener("keydown", (event) => event.stopPropagation());
  for (const name of ["pointerdown", "pointerup", "touchstart", "touchend"]) {
    dialog.addEventListener(name, (event) => event.stopPropagation());
  }
  // 閉じた後に開くボタンへ焦点が戻ると評価のキー操作が効かないため、焦点を外す。
  dialog.addEventListener("close", () => {
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  });
  window.visualViewport?.addEventListener("resize", fitVisibleViewport);
  window.visualViewport?.addEventListener("scroll", fitVisibleViewport);

  return {
    open,
    close,
    get isOpen() { return dialog.open; },
  };
}
