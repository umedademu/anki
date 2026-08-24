import {
  defaultReviewSettings,
  normalizeReviewSettings,
} from "./learning-engine.js";
import {
  getStoredAccessKey,
  loadCloudState,
  normalizeListeningPauseSeconds,
  requestCloudSpeech,
  saveCloudSettings,
  saveCloudStudyRoutine,
  storeAccessKey,
} from "./cloud-progress.js";
import { createSpeechController } from "./speech.js";
import {
  azureSpeechVoices,
  englishAzureSpeechVoices,
  getEnglishVoices,
  getJapaneseVoices,
  getVoiceId,
  loadSpeechSettings,
  normalizeSpeechSettings,
  saveSpeechSettings,
} from "./speech-settings.js";
import {
  defaultStudyTimeLimitSeconds,
  normalizeStudyTimeLimitSeconds,
} from "./study-time.js";
import {
  defaultStudyRoutinePlan,
  normalizeStudyRoutinePlan,
} from "./study-routine.js";

const elements = {
  accessKey: document.querySelector("#access-key"),
  connectCloud: document.querySelector("#connect-cloud"),
  form: document.querySelector("#review-settings-form"),
  saveSettings: document.querySelector("#save-settings"),
  status: document.querySelector("#settings-status"),
  studyTimeForm: document.querySelector("#study-time-settings-form"),
  studyTimeLimitSeconds: document.querySelector("#study-time-limit-seconds"),
  saveStudyTimeSettings: document.querySelector("#save-study-time-settings"),
  studyTimeStatus: document.querySelector("#study-time-settings-status"),
  routineEditor: document.querySelector("#routine-editor"),
  addRoutineItem: document.querySelector("#add-routine-item"),
  saveRoutine: document.querySelector("#save-routine"),
  routineStatus: document.querySelector("#routine-status"),
  againValue: document.querySelector("#again-value"),
  againUnit: document.querySelector("#again-unit"),
  hardValue: document.querySelector("#hard-value"),
  hardUnit: document.querySelector("#hard-unit"),
  goodValue: document.querySelector("#good-value"),
  goodUnit: document.querySelector("#good-unit"),
  easyValue: document.querySelector("#easy-value"),
  easyUnit: document.querySelector("#easy-unit"),
  speechSource: document.querySelector("#speech-source"),
  azureVoice: document.querySelector("#azure-voice"),
  englishAzureVoice: document.querySelector("#english-azure-voice"),
  deviceVoice: document.querySelector("#device-voice"),
  englishDeviceVoice: document.querySelector("#english-device-voice"),
  speechRate: document.querySelector("#speech-rate"),
  speechRateOutput: document.querySelector("#speech-rate-output"),
  listeningPauseSeconds: document.querySelector("#listening-pause-seconds"),
  previewSpeech: document.querySelector("#preview-speech"),
  previewEnglishSpeech: document.querySelector("#preview-english-speech"),
  saveSpeechSettings: document.querySelector("#save-speech-settings"),
  speechStatus: document.querySelector("#speech-settings-status"),
};

const fieldPairs = {
  againSeconds: [elements.againValue, elements.againUnit],
  hardSeconds: [elements.hardValue, elements.hardUnit],
  goodSeconds: [elements.goodValue, elements.goodUnit],
  easySeconds: [elements.easyValue, elements.easyUnit],
};

let speechSettings = loadSpeechSettings();
let cloudFallbackMessage = "";
let previewStarted = false;
let routinePlan = normalizeStudyRoutinePlan(defaultStudyRoutinePlan);
let routineSubjects = [];
let draggedRoutineItemId = "";

function readSpeechForm() {
  return normalizeSpeechSettings({
    source: elements.speechSource.value,
    azureVoiceId: elements.azureVoice.value,
    englishAzureVoiceId: elements.englishAzureVoice.value,
    voiceId: elements.deviceVoice.value,
    englishVoiceId: elements.englishDeviceVoice.value,
    rate: Number(elements.speechRate.value),
  });
}

function readSharedSpeechForm() {
  return {
    ...readSpeechForm(),
    listeningPauseSeconds: normalizeListeningPauseSeconds(
      elements.listeningPauseSeconds.value,
    ),
  };
}

function setSpeechStatus(message, isError = false) {
  elements.speechStatus.textContent = message;
  elements.speechStatus.classList.toggle("is-error", isError);
}

function setStudyTimeStatus(message, isError = false) {
  elements.studyTimeStatus.textContent = message;
  elements.studyTimeStatus.classList.toggle("is-error", isError);
}

function fillStudyTimeForm(settings) {
  elements.studyTimeLimitSeconds.value = String(
    normalizeStudyTimeLimitSeconds(settings?.studyTimeLimitSeconds),
  );
}

function readStudyTimeForm() {
  return {
    studyTimeLimitSeconds: normalizeStudyTimeLimitSeconds(
      elements.studyTimeLimitSeconds.value,
    ),
  };
}

function updateSpeechRateOutput() {
  elements.speechRateOutput.value = `${Number(elements.speechRate.value).toFixed(2)}倍`;
}

function populateDeviceVoices() {
  const selectedVoiceId = elements.deviceVoice.value || speechSettings.voiceId;
  const voices = getJapaneseVoices();
  elements.deviceVoice.replaceChildren();
  const automatic = document.createElement("option");
  automatic.value = "";
  automatic.textContent = "端末の推奨日本語音声";
  elements.deviceVoice.append(automatic);
  for (const voice of voices) {
    const option = document.createElement("option");
    option.value = getVoiceId(voice);
    option.textContent = `${voice.name}${voice.default ? "（端末標準）" : ""}`;
    elements.deviceVoice.append(option);
  }
  const availableIds = new Set(["", ...voices.map(getVoiceId)]);
  elements.deviceVoice.value = availableIds.has(selectedVoiceId)
    ? selectedVoiceId
    : "";
  elements.deviceVoice.disabled = voices.length === 0;

  const selectedEnglishVoiceId =
    elements.englishDeviceVoice.value || speechSettings.englishVoiceId;
  const englishVoices = getEnglishVoices();
  elements.englishDeviceVoice.replaceChildren();
  const englishAutomatic = document.createElement("option");
  englishAutomatic.value = "";
  englishAutomatic.textContent = "端末の推奨英語音声";
  elements.englishDeviceVoice.append(englishAutomatic);
  for (const voice of englishVoices) {
    const option = document.createElement("option");
    option.value = getVoiceId(voice);
    option.textContent = `${voice.name}（${voice.lang}）${
      voice.default ? "（端末標準）" : ""
    }`;
    elements.englishDeviceVoice.append(option);
  }
  const availableEnglishIds = new Set([
    "",
    ...englishVoices.map(getVoiceId),
  ]);
  elements.englishDeviceVoice.value = availableEnglishIds.has(
    selectedEnglishVoiceId,
  )
    ? selectedEnglishVoiceId
    : "";
  elements.englishDeviceVoice.disabled = englishVoices.length === 0;
}

function populateAzureVoices() {
  elements.azureVoice.replaceChildren();
  for (const voice of azureSpeechVoices) {
    const option = document.createElement("option");
    option.value = voice.id;
    option.textContent = voice.label;
    elements.azureVoice.append(option);
  }
  elements.englishAzureVoice.replaceChildren();
  for (const voice of englishAzureSpeechVoices) {
    const option = document.createElement("option");
    option.value = voice.id;
    option.textContent = voice.label;
    elements.englishAzureVoice.append(option);
  }
}

function fillSpeechForm(settings) {
  speechSettings = normalizeSpeechSettings(settings);
  elements.speechSource.value = speechSettings.source;
  elements.azureVoice.value = speechSettings.azureVoiceId;
  elements.englishAzureVoice.value = speechSettings.englishAzureVoiceId;
  elements.speechRate.value = String(speechSettings.rate);
  elements.listeningPauseSeconds.value = String(
    normalizeListeningPauseSeconds(settings?.listeningPauseSeconds),
  );
  populateDeviceVoices();
  elements.deviceVoice.value = [...elements.deviceVoice.options].some(
    (option) => option.value === speechSettings.voiceId,
  )
    ? speechSettings.voiceId
    : "";
  elements.englishDeviceVoice.value = [
    ...elements.englishDeviceVoice.options,
  ].some((option) => option.value === speechSettings.englishVoiceId)
    ? speechSettings.englishVoiceId
    : "";
  updateSpeechRateOutput();
}

const previewController = createSpeechController({
  requestCloudAudio: requestCloudSpeech,
  getSettings: readSpeechForm,
  onTargetChange(target) {
    const japaneseActive = target === "preview-japanese";
    const englishActive = target === "preview-english";
    elements.previewSpeech.textContent = japaneseActive
      ? "試聴を止める"
      : "日本語音声を試す";
    elements.previewEnglishSpeech.textContent = englishActive
      ? "試聴を止める"
      : "英語音声を試す";
    if (!japaneseActive && !englishActive && previewStarted) {
      previewStarted = false;
      if (!cloudFallbackMessage) {
        setSpeechStatus("試聴が完了しました。");
      }
    }
  },
  onFallback(error) {
    cloudFallbackMessage = error.message;
    setSpeechStatus(
      `Azure音声を利用できなかったため、端末音声へ切り替えました。${error.message}`,
      true,
    );
  },
});

function setBusy(busy) {
  elements.connectCloud.disabled = busy;
  elements.saveSettings.disabled = busy;
  elements.saveStudyTimeSettings.disabled = busy;
  elements.saveSpeechSettings.disabled = busy;
  elements.saveRoutine.disabled = busy || routinePlan.length === 0;
  elements.addRoutineItem.disabled = busy;
}

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle("is-error", isError);
}

function setRoutineStatus(message, isError = false) {
  elements.routineStatus.textContent = message;
  elements.routineStatus.classList.toggle("is-error", isError);
}

function createRoutineItemId() {
  return `routine-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function routineSubjectTitle(subjectId) {
  return routineSubjects.find((subject) => subject.id === subjectId)?.title ??
    subjectId;
}

function createRoutineSubjectSelect(item) {
  const select = document.createElement("select");
  select.className = "routine-subject-select";
  select.setAttribute("aria-label", "科目");
  const availableSubjects = routineSubjects.some(
    (subject) => subject.id === item.subjectId,
  )
    ? routineSubjects
    : [{ id: item.subjectId, title: item.subjectId }, ...routineSubjects];
  for (const subject of availableSubjects) {
    const option = document.createElement("option");
    option.value = subject.id;
    option.textContent = subject.title;
    select.append(option);
  }
  select.value = item.subjectId;
  return select;
}

function renderRoutineEditor() {
  elements.routineEditor.replaceChildren(
    ...routinePlan.map((item, index) => {
      const row = document.createElement("article");
      row.className = "routine-editor-item";
      row.dataset.routineItemId = item.id;

      const handle = document.createElement("button");
      handle.type = "button";
      handle.className = "routine-drag-handle";
      handle.draggable = true;
      handle.setAttribute("aria-label", `${index + 1}番をつかんで並べ替える`);
      handle.textContent = "☰";

      const order = document.createElement("strong");
      order.className = "routine-order";
      order.textContent = String(index + 1);

      const subject = createRoutineSubjectSelect(item);
      subject.dataset.routineField = "subjectId";

      const amount = document.createElement("label");
      amount.className = "routine-amount";
      const input = document.createElement("input");
      input.type = "number";
      input.min = "1";
      input.max = "10000";
      input.step = "1";
      input.inputMode = "numeric";
      input.value = String(item.questionTarget);
      input.dataset.routineField = "questionTarget";
      input.setAttribute("aria-label", `${routineSubjectTitle(item.subjectId)}の問題数`);
      amount.append(input, document.createTextNode("問"));

      const actions = document.createElement("div");
      actions.className = "routine-item-actions";
      const actionDefinitions = [
        ["up", "↑", "上へ"],
        ["down", "↓", "下へ"],
        ["copy", "複製", "複製"],
        ["delete", "削除", "削除"],
      ];
      for (const [action, text, label] of actionDefinitions) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.routineAction = action;
        button.textContent = text;
        button.setAttribute("aria-label", `${index + 1}番を${label}`);
        button.disabled =
          (action === "up" && index === 0) ||
          (action === "down" && index === routinePlan.length - 1);
        actions.append(button);
      }

      row.append(handle, order, subject, amount, actions);
      return row;
    }),
  );
  elements.saveRoutine.disabled = routinePlan.length === 0;
}

function fillRoutinePlan(value) {
  routinePlan = normalizeStudyRoutinePlan(value);
  renderRoutineEditor();
}

function updateRoutineItem(itemId, patch) {
  routinePlan = routinePlan.map((item) =>
    item.id === itemId ? { ...item, ...patch } : item,
  );
}

function moveRoutineItem(itemId, nextIndex) {
  const currentIndex = routinePlan.findIndex((item) => item.id === itemId);
  if (currentIndex < 0) return;
  const boundedIndex = Math.max(0, Math.min(routinePlan.length - 1, nextIndex));
  if (boundedIndex === currentIndex) return;
  const next = [...routinePlan];
  const [item] = next.splice(currentIndex, 1);
  next.splice(boundedIndex, 0, item);
  routinePlan = next;
  renderRoutineEditor();
}

async function loadRoutineSubjects() {
  const dataBaseUrl = String(window.ANKI_CONFIG?.dataBaseUrl ?? "").replace(/\/$/, "");
  if (!dataBaseUrl) {
    throw new Error("Cloudflareの学習データ読込先が設定されていません。");
  }
  const response = await fetch(`${dataBaseUrl}/index.json`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`科目一覧を読み込めませんでした（${response.status}）。`);
  }
  const catalog = await response.json();
  if (!Array.isArray(catalog.subjects) || catalog.subjects.length === 0) {
    throw new Error("科目一覧の形式が正しくありません。");
  }
  routineSubjects = catalog.subjects.map(({ id, title }) => ({ id, title }));
  renderRoutineEditor();
}

function chooseUnit(seconds) {
  if (seconds % 86400 === 0) {
    return 86400;
  }
  if (seconds % 3600 === 0) {
    return 3600;
  }
  if (seconds % 60 === 0) {
    return 60;
  }
  return 1;
}

function fillForm(settings) {
  const normalized = normalizeReviewSettings(settings);
  for (const [key, [valueInput, unitSelect]] of Object.entries(fieldPairs)) {
    const unit = chooseUnit(normalized[key]);
    unitSelect.value = String(unit);
    valueInput.value = String(normalized[key] / unit);
  }
}

function readForm() {
  return normalizeReviewSettings(
    Object.fromEntries(
      Object.entries(fieldPairs).map(([key, [valueInput, unitSelect]]) => [
        key,
        Number(valueInput.value) * Number(unitSelect.value),
      ]),
    ),
  );
}

async function connect() {
  setBusy(true);
  try {
    if (elements.accessKey.value.trim()) {
      storeAccessKey(elements.accessKey.value);
    }
    const cloudState = await loadCloudState();
    fillForm(cloudState.settings);
    fillStudyTimeForm(cloudState.settings);
    speechSettings = saveSpeechSettings(cloudState.settings);
    fillSpeechForm(cloudState.settings);
    fillRoutinePlan(cloudState.settings.setupPreferences.routinePlan);
    elements.accessKey.value = "";
    elements.accessKey.placeholder = "保存済み";
    setStatus("Cloudflareへ接続しました。学習記録と設定を端末間で共有します。");
    setStudyTimeStatus("Cloudflareから学習時間の上限を読み込みました。");
    setSpeechStatus("Cloudflareから共有設定を読み込みました。");
    setRoutineStatus("Cloudflareから毎日のメニューを読み込みました。");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    setBusy(false);
  }
}

function handleRoutineFieldChange(event) {
  const row = event.target.closest("[data-routine-item-id]");
  const field = event.target.dataset.routineField;
  if (!row || !field) return;
  updateRoutineItem(row.dataset.routineItemId, {
    [field]: field === "questionTarget"
      ? Number.parseInt(event.target.value, 10) || 1
      : event.target.value,
  });
  setRoutineStatus("変更があります。「メニューを保存」を押してください。");
}

elements.routineEditor.addEventListener("input", handleRoutineFieldChange);
elements.routineEditor.addEventListener("change", handleRoutineFieldChange);

elements.routineEditor.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-routine-action]");
  const row = event.target.closest("[data-routine-item-id]");
  if (!button || !row) return;
  const itemId = row.dataset.routineItemId;
  const index = routinePlan.findIndex((item) => item.id === itemId);
  if (index < 0) return;
  if (button.dataset.routineAction === "up") {
    moveRoutineItem(itemId, index - 1);
  } else if (button.dataset.routineAction === "down") {
    moveRoutineItem(itemId, index + 1);
  } else if (button.dataset.routineAction === "copy") {
    const next = [...routinePlan];
    next.splice(index + 1, 0, {
      ...routinePlan[index],
      id: createRoutineItemId(),
    });
    routinePlan = next;
    renderRoutineEditor();
  } else if (button.dataset.routineAction === "delete") {
    routinePlan = routinePlan.filter((item) => item.id !== itemId);
    renderRoutineEditor();
  }
  setRoutineStatus("変更があります。「メニューを保存」を押してください。");
});

elements.routineEditor.addEventListener("dragstart", (event) => {
  const row = event.target.closest("[data-routine-item-id]");
  if (!row || !event.target.closest(".routine-drag-handle")) return;
  draggedRoutineItemId = row.dataset.routineItemId;
  row.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
});

elements.routineEditor.addEventListener("dragend", () => {
  draggedRoutineItemId = "";
  elements.routineEditor.querySelector(".is-dragging")?.classList.remove("is-dragging");
});

elements.routineEditor.addEventListener("dragover", (event) => {
  if (!draggedRoutineItemId) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
});

elements.routineEditor.addEventListener("drop", (event) => {
  const targetRow = event.target.closest("[data-routine-item-id]");
  if (!draggedRoutineItemId || !targetRow) return;
  event.preventDefault();
  const targetIndex = routinePlan.findIndex(
    (item) => item.id === targetRow.dataset.routineItemId,
  );
  moveRoutineItem(draggedRoutineItemId, targetIndex);
  setRoutineStatus("並び順を変更しました。「メニューを保存」を押してください。");
});

elements.addRoutineItem.addEventListener("click", () => {
  const subjectId = routineSubjects[0]?.id ?? "world-history";
  routinePlan = [
    ...routinePlan,
    { id: createRoutineItemId(), subjectId, questionTarget: 100 },
  ];
  renderRoutineEditor();
  elements.routineEditor.lastElementChild?.scrollIntoView({
    behavior: "smooth",
    block: "nearest",
  });
  setRoutineStatus("科目を追加しました。「メニューを保存」を押してください。");
});

elements.saveRoutine.addEventListener("click", async () => {
  const normalized = normalizeStudyRoutinePlan(routinePlan, {
    fallbackToDefault: false,
  });
  if (normalized.length === 0) {
    setRoutineStatus("科目を1つ以上追加してください。", true);
    return;
  }
  setBusy(true);
  try {
    const saved = await saveCloudStudyRoutine({ routinePlan: normalized });
    fillRoutinePlan(saved.setupPreferences.routinePlan);
    setRoutineStatus(
      "毎日のメニューをCloudflareへ保存しました。次に1番から始めるときに使います。",
    );
  } catch (error) {
    setRoutineStatus(error.message, true);
  } finally {
    setBusy(false);
  }
});

elements.connectCloud.addEventListener("click", connect);
elements.studyTimeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy(true);
  try {
    const saved = await saveCloudSettings(readStudyTimeForm());
    fillStudyTimeForm(saved);
    setStudyTimeStatus(
      "学習時間の上限をCloudflareへ保存し、暗記・聞き流しで共有しました。",
    );
  } catch (error) {
    setStudyTimeStatus(error.message, true);
  } finally {
    setBusy(false);
  }
});
elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy(true);
  try {
    const saved = await saveCloudSettings(readForm());
    fillForm(saved);
    setStatus("4段階の復習間隔をCloudflareへ保存しました。");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    setBusy(false);
  }
});

elements.speechRate.addEventListener("input", updateSpeechRateOutput);
elements.previewSpeech.addEventListener("click", () => {
  if (previewController.currentTarget === "preview-japanese") {
    previewStarted = false;
    previewController.stop();
    setSpeechStatus("試聴を停止しました。");
    return;
  }
  cloudFallbackMessage = "";
  setSpeechStatus("選んだ音声を再生しています。");
  previewController.speak([
    {
      target: "preview-japanese",
      text: "王安石(おうあんせき)の低利融資政策を青苗法(せいびょうほう)という。",
      language: "ja-JP",
    },
  ]);
  previewStarted = previewController.currentTarget === "preview-japanese";
});
elements.previewEnglishSpeech.addEventListener("click", () => {
  if (previewController.currentTarget === "preview-english") {
    previewStarted = false;
    previewController.stop();
    setSpeechStatus("試聴を停止しました。");
    return;
  }
  cloudFallbackMessage = "";
  setSpeechStatus("選んだ英語音声を再生しています。");
  previewController.speak([
    {
      target: "preview-english",
      text: "Although it was raining, we went for a walk.",
      language: "en-US",
    },
  ]);
  previewStarted = previewController.currentTarget === "preview-english";
});
elements.saveSpeechSettings.addEventListener("click", async () => {
  setBusy(true);
  try {
    const saved = await saveCloudSettings(readSharedSpeechForm());
    speechSettings = saveSpeechSettings(saved);
    fillSpeechForm(saved);
    setSpeechStatus("音声設定をCloudflareへ保存し、端末間で共有しました。");
  } catch (error) {
    setSpeechStatus(error.message, true);
  } finally {
    setBusy(false);
  }
});

globalThis.speechSynthesis?.addEventListener?.("voiceschanged", populateDeviceVoices);
window.addEventListener("pagehide", () => previewController.stop());

fillForm(defaultReviewSettings);
fillStudyTimeForm({ studyTimeLimitSeconds: defaultStudyTimeLimitSeconds });
fillRoutinePlan(defaultStudyRoutinePlan);
populateAzureVoices();
fillSpeechForm(speechSettings);
void loadRoutineSubjects().catch((error) => {
  setRoutineStatus(error.message, true);
});
if (getStoredAccessKey()) {
  elements.accessKey.placeholder = "保存済み";
  void connect();
} else {
  setStatus("アクセスキーを入力して、Cloudflareへの接続を確認してください。");
}
