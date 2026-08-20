import {
  defaultReviewSettings,
  normalizeReviewSettings,
} from "./learning-engine.js";
import {
  getStoredAccessKey,
  loadCloudState,
  requestCloudSpeech,
  saveCloudSettings,
  storeAccessKey,
} from "./cloud-progress.js";
import { createSpeechController } from "./speech.js";
import {
  getJapaneseVoices,
  getVoiceId,
  loadSpeechSettings,
  normalizeSpeechSettings,
  saveSpeechSettings,
} from "./speech-settings.js";

const elements = {
  accessKey: document.querySelector("#access-key"),
  connectCloud: document.querySelector("#connect-cloud"),
  form: document.querySelector("#review-settings-form"),
  saveSettings: document.querySelector("#save-settings"),
  status: document.querySelector("#settings-status"),
  againValue: document.querySelector("#again-value"),
  againUnit: document.querySelector("#again-unit"),
  hardValue: document.querySelector("#hard-value"),
  hardUnit: document.querySelector("#hard-unit"),
  goodValue: document.querySelector("#good-value"),
  goodUnit: document.querySelector("#good-unit"),
  easyValue: document.querySelector("#easy-value"),
  easyUnit: document.querySelector("#easy-unit"),
  speechSource: document.querySelector("#speech-source"),
  deviceVoice: document.querySelector("#device-voice"),
  speechRate: document.querySelector("#speech-rate"),
  speechRateOutput: document.querySelector("#speech-rate-output"),
  previewSpeech: document.querySelector("#preview-speech"),
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

function readSpeechForm() {
  return normalizeSpeechSettings({
    source: elements.speechSource.value,
    voiceId: elements.deviceVoice.value,
    rate: Number(elements.speechRate.value),
  });
}

function setSpeechStatus(message, isError = false) {
  elements.speechStatus.textContent = message;
  elements.speechStatus.classList.toggle("is-error", isError);
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
}

function fillSpeechForm(settings) {
  speechSettings = normalizeSpeechSettings(settings);
  elements.speechSource.value = speechSettings.source;
  elements.speechRate.value = String(speechSettings.rate);
  populateDeviceVoices();
  elements.deviceVoice.value = [...elements.deviceVoice.options].some(
    (option) => option.value === speechSettings.voiceId,
  )
    ? speechSettings.voiceId
    : "";
  updateSpeechRateOutput();
}

const previewController = createSpeechController({
  requestCloudAudio: requestCloudSpeech,
  getSettings: readSpeechForm,
  onTargetChange(target) {
    const active = target === "preview";
    elements.previewSpeech.textContent = active
      ? "試聴を止める"
      : "選んだ音声を試す";
    if (!active && previewStarted) {
      previewStarted = false;
      if (!cloudFallbackMessage) {
        setSpeechStatus("試聴が完了しました。");
      }
    }
  },
  onFallback(error) {
    cloudFallbackMessage = error.message;
    setSpeechStatus(
      `Cloudflare音声を利用できなかったため、端末音声へ切り替えました。${error.message}`,
      true,
    );
  },
});

function setBusy(busy) {
  elements.connectCloud.disabled = busy;
  elements.saveSettings.disabled = busy;
}

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle("is-error", isError);
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
    elements.accessKey.value = "";
    elements.accessKey.placeholder = "保存済み";
    setStatus("Cloudflareへ接続しました。学習記録と復習設定を同期できます。");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    setBusy(false);
  }
}

elements.connectCloud.addEventListener("click", connect);
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
  if (previewController.currentTarget === "preview") {
    previewStarted = false;
    previewController.stop();
    setSpeechStatus("試聴を停止しました。");
    return;
  }
  cloudFallbackMessage = "";
  setSpeechStatus("選んだ音声を再生しています。");
  previewController.speak([
    {
      target: "preview",
      text: "王安石(おうあんせき)の低利融資政策を青苗法(せいびょうほう)という。",
    },
  ]);
  previewStarted = previewController.currentTarget === "preview";
});
elements.saveSpeechSettings.addEventListener("click", () => {
  try {
    speechSettings = saveSpeechSettings(readSpeechForm());
    fillSpeechForm(speechSettings);
    setSpeechStatus("この端末の音声設定を保存しました。");
  } catch {
    setSpeechStatus("音声設定をこの端末へ保存できませんでした。", true);
  }
});

globalThis.speechSynthesis?.addEventListener?.("voiceschanged", populateDeviceVoices);
window.addEventListener("pagehide", () => previewController.stop());

fillForm(defaultReviewSettings);
fillSpeechForm(speechSettings);
if (getStoredAccessKey()) {
  elements.accessKey.placeholder = "保存済み";
  void connect();
} else {
  setStatus("アクセスキーを入力して、Cloudflareへの接続を確認してください。");
}
