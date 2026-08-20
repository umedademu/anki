import {
  defaultReviewSettings,
  normalizeReviewSettings,
} from "./learning-engine.js";
import {
  getStoredAccessKey,
  loadCloudState,
  saveCloudSettings,
  storeAccessKey,
} from "./cloud-progress.js";

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
};

const fieldPairs = {
  againSeconds: [elements.againValue, elements.againUnit],
  hardSeconds: [elements.hardValue, elements.hardUnit],
  goodSeconds: [elements.goodValue, elements.goodUnit],
  easySeconds: [elements.easyValue, elements.easyUnit],
};

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

fillForm(defaultReviewSettings);
if (getStoredAccessKey()) {
  elements.accessKey.placeholder = "保存済み";
  void connect();
} else {
  setStatus("アクセスキーを入力して、Cloudflareへの接続を確認してください。");
}
