// 答えの表示中に、今の問題についてアプリの中でAIと会話する。
// 答えるのは利用者のPCで動く中継役（ai-relay）で、PCのサブスクの Claude Code か Codex（ChatGPT）を使う。
// APIの従量課金は使わない。中継役の接続先は Worker から受け取り、既存のアクセスキーで認証する。
// 評価・学習記録・出題位置には触れない。

export const aiServices = {
  claude: "Claude",
  codex: "ChatGPT",
};
const serviceStorageKey = "anki-ai-question-service:v1";
export const relayOfflineMessage =
  "PCのAIに接続できません。PCで中継役（ai-relay の start.cmd）が動いているか確かめてください。";

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

export function aiQuestionContext({ prompt, answer, explanation }) {
  return {
    prompt: plainAiQuestionText(prompt),
    answer: plainAiQuestionText(answer),
    explanation: plainAiQuestionText(explanation),
  };
}

// 中継役の返事（1行ずつのJSON）を読み、そこまでの全文を onText に渡す。
export async function readRelayStream(response, onText) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", text = "", finished = null;
  const handle = (line) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === "delta" || event.type === "done") {
      text = String(event.text ?? "");
      onText(text);
      if (event.type === "done") finished = { ok: true, text };
    } else if (event.type === "error") {
      finished = { ok: false, message: String(event.message || "AIが答えられませんでした。") };
    }
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index;
    while ((index = buffer.indexOf("\n")) >= 0) {
      handle(buffer.slice(0, index));
      buffer = buffer.slice(index + 1);
    }
  }
  handle(buffer + decoder.decode());
  return finished ?? { ok: false, message: "返事の途中で接続が切れました。もう一度聞いてください。" };
}

function readStoredService() {
  try {
    const value = window.localStorage.getItem(serviceStorageKey);
    return value in aiServices ? value : "claude";
  } catch {
    return "claude";
  }
}
function storeService(value) {
  try { window.localStorage.setItem(serviceStorageKey, value); } catch {}
}

// マウスの無いタッチ画面（スマートフォン・タブレット）。ここでは Enter を改行に使う。
function usesTouchKeyboard() {
  try {
    return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  } catch {
    return false;
  }
}

// 「**強調**」だけを太字にし、ほかは文字のまま表示する。
function renderAnswerText(element, text) {
  const parts = String(text ?? "").split("**");
  element.replaceChildren(...parts.map((part, index) => {
    if (index % 2 === 0) return document.createTextNode(part);
    const strong = document.createElement("strong");
    strong.textContent = part;
    return strong;
  }));
}

// 会話欄。開いている間は学習画面の操作を受け付けず、入力中のキーも学習画面へ渡さない。
export function createAiChat({
  dialog,
  getContext,
  getAccessKey,
  requestRelayUrl,
  onOpen = () => {},
  fetchImpl = (...args) => window.fetch(...args),
}) {
  const input = dialog.querySelector("textarea");
  const sendButton = dialog.querySelector("[data-ai-chat='send']");
  const log = dialog.querySelector("[data-ai-chat='log']");
  const status = dialog.querySelector("[data-ai-chat='status']");
  const contextLine = dialog.querySelector("[data-ai-chat='context']");
  const serviceButtons = [...dialog.querySelectorAll("[data-ai-service]")];
  let service = readStoredService();
  if (!usesTouchKeyboard()) input.placeholder = "質問を書く（Enterで送る・Shift+Enterで改行）";
  let conversation = null; // {key, context, messages: [{role, text, service}]}
  let pending = null; // {controller}
  let relayUrl = null;

  function update() {
    sendButton.disabled = Boolean(pending) || !input.value.trim();
    serviceButtons.forEach((button) => {
      const selected = button.dataset.aiService === service;
      button.setAttribute("aria-pressed", String(selected));
      button.disabled = Boolean(pending);
    });
  }

  function setStatus(message = "", kind = "") {
    status.textContent = message;
    status.dataset.kind = kind;
    status.hidden = !message;
  }

  function bubble(role, text, label) {
    const item = document.createElement("div");
    item.className = `ai-chat-message is-${role}`;
    if (label) {
      const name = document.createElement("span");
      name.className = "ai-chat-speaker";
      name.textContent = label;
      item.append(name);
    }
    const body = document.createElement("p");
    if (role === "assistant") renderAnswerText(body, text);
    else body.textContent = text;
    item.append(body);
    log.append(item);
    log.scrollTop = log.scrollHeight;
    return body;
  }

  function renderConversation() {
    log.replaceChildren();
    for (const message of conversation.messages) {
      bubble(message.role, message.text, message.role === "assistant" ? aiServices[message.service] : "");
    }
    if (!conversation.messages.length) {
      const hint = document.createElement("p");
      hint.className = "ai-chat-hint";
      hint.textContent = "この問題について聞きたいことを書いてください。例：ビザンツ帝国って東ローマの事ですよね？";
      log.append(hint);
    }
    contextLine.textContent = `問題：${conversation.context.prompt}　答え：${conversation.context.answer}`;
  }

  // スマートフォンでキーボードが出た時も、見えている範囲に欄と送るボタンを収める。
  function fitVisibleViewport() {
    const viewport = window.visualViewport;
    if (!viewport || !dialog.open) return;
    dialog.style.setProperty("--ai-chat-top", `${Math.round(viewport.offsetTop) + 8}px`);
    dialog.style.setProperty("--ai-chat-max-height", `${Math.max(160, Math.floor(viewport.height) - 16)}px`);
  }

  function open() {
    if (dialog.open) return;
    const next = getContext();
    if (!next) return;
    // 同じ問題なら会話を続け、別の問題では新しく始める。
    if (conversation?.key !== next.key) {
      conversation = { key: next.key, context: aiQuestionContext(next), messages: [] };
      input.value = "";
    }
    renderConversation();
    setStatus();
    onOpen();
    update();
    dialog.showModal();
    fitVisibleViewport();
    input.focus();
    log.scrollTop = log.scrollHeight;
  }

  function close() {
    if (dialog.open) dialog.close();
  }

  async function relayAddress(refresh = false) {
    if (relayUrl && !refresh) return relayUrl;
    let result;
    try {
      result = await requestRelayUrl();
    } catch (error) {
      throw Object.assign(new Error(error.message || relayOfflineMessage), { offline: true });
    }
    relayUrl = result?.url || null;
    if (!relayUrl) throw Object.assign(new Error(relayOfflineMessage), { offline: true });
    return relayUrl;
  }

  async function post(body, signal, refresh = false) {
    const base = await relayAddress(refresh);
    try {
      return await fetchImpl(`${base}/v1/ask`, {
        method: "POST",
        cache: "no-store",
        signal,
        headers: { Authorization: `Bearer ${getAccessKey()}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (error) {
      if (error.name === "AbortError") throw error;
      // PCを起動し直すと接続先が変わるので、1回だけ接続先を取り直す。
      if (!refresh) return post(body, signal, true);
      throw Object.assign(new Error(relayOfflineMessage), { offline: true });
    }
  }

  async function send() {
    const text = input.value.trim();
    if (!text || pending || !conversation) return;
    if (!getAccessKey()) {
      setStatus("設定ページでCloudflareのアクセスキーを登録してください。", "error");
      return;
    }
    const current = conversation;
    const asked = { role: "user", text };
    current.messages.push(asked);
    if (log.querySelector(".ai-chat-hint")) log.replaceChildren();
    bubble("user", text);
    const answerBody = bubble("assistant", "考え中…", aiServices[service]);
    answerBody.parentElement.classList.add("is-thinking");
    input.value = "";
    setStatus();
    const controller = new AbortController();
    pending = { controller };
    update();
    const usedService = service;
    let failure = "";
    try {
      const response = await post({
        service: usedService,
        context: current.context,
        messages: current.messages.map(({ role, text: messageText }) => ({ role, text: messageText })),
      }, controller.signal);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        failure = response.status === 401
          ? "アクセスキーが、PCの中継役に登録したものと違います。PCで ai-relay の setup.cmd を実行し直してください。"
          : payload.error || `AIに質問できませんでした（${response.status}）。`;
      } else {
        const result = await readRelayStream(response, (partial) => {
          if (conversation !== current) return;
          answerBody.parentElement.classList.remove("is-thinking");
          renderAnswerText(answerBody, partial);
          log.scrollTop = log.scrollHeight;
        });
        if (result.ok) current.messages.push({ role: "assistant", text: result.text, service: usedService });
        else failure = result.message;
      }
    } catch (error) {
      failure = error.name === "AbortError" ? "" : error.offline ? error.message : relayOfflineMessage;
      if (error.name === "AbortError") failure = "質問を取り消しました。";
    } finally {
      pending = null;
    }
    if (failure) {
      // 答えられなかった質問は会話から外し、入力欄へ戻して送り直せるようにする。
      current.messages.splice(current.messages.indexOf(asked), 1);
      if (conversation === current) {
        renderConversation();
        if (!input.value.trim()) input.value = text;
        setStatus(failure, "error");
      }
    }
    update();
    if (dialog.open) input.focus();
  }

  input.addEventListener("input", update);
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    // 日本語入力の変換を確定する Enter では送らない。
    if (event.isComposing || event.keyCode === 229) return;
    // Shift + Enter は改行。スマートフォンなどのタッチ画面では、キーボードの改行キーは改行のままにし、
    // 送るボタンで送る（変換や改行のつもりで押した時に送ってしまわないように）。Ctrl（⌘）+ Enter はどちらでも送る。
    const sends = event.ctrlKey || event.metaKey || (!event.shiftKey && !usesTouchKeyboard());
    if (!sends) return;
    event.preventDefault();
    void send();
  });
  sendButton.addEventListener("click", () => void send());
  serviceButtons.forEach((button) => button.addEventListener("click", () => {
    if (pending) return;
    service = button.dataset.aiService;
    storeService(service);
    update();
    input.focus();
  }));
  dialog.querySelector("[data-ai-chat='close']").addEventListener("click", close);
  // 欄の外（背景）をタップした時も閉じる。
  dialog.addEventListener("click", (event) => { if (event.target === dialog) close(); });
  dialog.addEventListener("keydown", (event) => event.stopPropagation());
  for (const name of ["pointerdown", "pointerup", "touchstart", "touchend"]) {
    dialog.addEventListener(name, (event) => event.stopPropagation());
  }
  dialog.addEventListener("close", () => {
    // 閉じたら答えている途中の質問も止める。焦点を外し、評価のキー操作が効くようにする。
    pending?.controller.abort();
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
