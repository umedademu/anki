import {
  createEmptyProgress,
  defaultReviewSettings,
  normalizeProgress,
  normalizeReviewSettings,
} from "./learning-engine.js";
import {
  defaultSpeechSettings,
  normalizeSpeechSettings,
} from "./speech-settings.js";

export const accessKeyStorageKey = "anki-cloud-access-key:v1";

export const defaultSpeechParts = Object.freeze({
  history: Object.freeze({
    question: true,
    answer: true,
    mnemonic: true,
    explanation: false,
  }),
  vocabulary: Object.freeze({
    word: true,
    meaning: true,
    exampleEnglish: false,
    exampleJapanese: false,
  }),
});

function normalizeSpeechPartGroup(value, defaults) {
  const source = value && typeof value === "object" ? value : {};
  const normalized = Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => [
      key,
      source[key] == null
        ? fallback
        : source[key] === true || source[key] === "true",
    ]),
  );
  return Object.values(normalized).some(Boolean)
    ? normalized
    : { ...defaults };
}

export function normalizeSpeechParts(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    history: normalizeSpeechPartGroup(
      source.history,
      defaultSpeechParts.history,
    ),
    vocabulary: normalizeSpeechPartGroup(
      source.vocabulary,
      defaultSpeechParts.vocabulary,
    ),
  };
}

export const defaultSharedSettings = Object.freeze({
  ...defaultReviewSettings,
  ...defaultSpeechSettings,
  shuffleEnabled: false,
  autoSpeechEnabled: true,
  listeningPauseSeconds: 0,
  speechParts: defaultSpeechParts,
});

export function normalizeListeningPauseSeconds(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) ? Math.min(60, Math.max(0, seconds)) : 0;
}

export function normalizeSharedSettings(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    ...normalizeReviewSettings(source),
    ...normalizeSpeechSettings(source),
    shuffleEnabled:
      source.shuffleEnabled === true || source.shuffleEnabled === "true",
    autoSpeechEnabled:
      source.autoSpeechEnabled == null
        ? true
        : source.autoSpeechEnabled === true || source.autoSpeechEnabled === "true",
    listeningPauseSeconds: normalizeListeningPauseSeconds(
      source.listeningPauseSeconds,
    ),
    speechParts: normalizeSpeechParts(source.speechParts),
  };
}

function getApiBaseUrl() {
  const apiBaseUrl = String(window.ANKI_CONFIG?.progressApiBaseUrl ?? "").replace(
    /\/$/,
    "",
  );
  if (!apiBaseUrl) {
    throw new Error("Cloudflareの学習記録保存先が設定されていません。");
  }
  return apiBaseUrl;
}

export function getStoredAccessKey() {
  try {
    return window.localStorage.getItem(accessKeyStorageKey) ?? "";
  } catch {
    return "";
  }
}

export function storeAccessKey(accessKey) {
  const normalized = String(accessKey ?? "").trim();
  if (!normalized) {
    throw new Error("アクセスキーを入力してください。");
  }
  window.localStorage.setItem(accessKeyStorageKey, normalized);
  return normalized;
}

export function clearStoredAccessKey() {
  try {
    window.localStorage.removeItem(accessKeyStorageKey);
  } catch {
    // 保存領域が使えない場合も画面上の操作は続ける。
  }
}

async function cloudRequest(path, options = {}) {
  const accessKey = getStoredAccessKey();
  if (!accessKey) {
    throw new Error("設定ページでCloudflareのアクセスキーを登録してください。");
  }
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...options,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${accessKey}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Cloudflareのアクセスキーが正しくありません。");
    }
    throw new Error(payload.error || `Cloudflareへの保存に失敗しました（${response.status}）。`);
  }
  return payload;
}

export async function requestCloudSpeech(text, voice, language = "ja-JP") {
  const accessKey = getStoredAccessKey();
  if (!accessKey) {
    throw new Error("Cloudflareのアクセスキーが登録されていません。");
  }
  const response = await fetch(`${getApiBaseUrl()}/v1/speech`, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${accessKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: String(text ?? ""),
      voice: String(voice ?? ""),
      language: String(language ?? ""),
    }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      throw new Error("Cloudflareのアクセスキーが正しくありません。");
    }
    throw new Error(
      payload.error || `Azure音声の生成に失敗しました（${response.status}）。`,
    );
  }
  const audio = await response.blob();
  if (!audio.type.startsWith("audio/") || audio.size === 0) {
    throw new Error("Azureから音声を受け取れませんでした。");
  }
  return audio;
}

export async function loadCloudState(masteryTarget = 2, datasetVersion = "") {
  const query = datasetVersion
    ? `?dataset=${encodeURIComponent(datasetVersion)}`
    : "";
  const payload = await cloudRequest(`/v1/state${query}`);
  return {
    progress: normalizeProgress(payload.progress ?? createEmptyProgress(), masteryTarget),
    settings: normalizeSharedSettings(payload.settings),
  };
}

export async function saveCloudQuestion(datasetVersion, questionId, record) {
  return cloudRequest(
    `/v1/progress/${encodeURIComponent(questionId)}?dataset=${encodeURIComponent(datasetVersion)}`,
    {
    method: "PUT",
    body: JSON.stringify(record),
    },
  );
}

export async function deleteCloudQuestion(datasetVersion, questionId) {
  return cloudRequest(
    `/v1/progress/${encodeURIComponent(questionId)}?dataset=${encodeURIComponent(datasetVersion)}`,
    { method: "DELETE" },
  );
}

export async function importCloudProgress(datasetVersion, progress) {
  const entries = Object.entries(progress.questions ?? {});
  for (let index = 0; index < entries.length; index += 40) {
    await cloudRequest("/v1/progress/import", {
      method: "POST",
      body: JSON.stringify({
        datasetVersion,
        questions: Object.fromEntries(entries.slice(index, index + 40)),
      }),
    });
  }
}

export async function resetCloudProgress(datasetVersion) {
  return cloudRequest(`/v1/progress?dataset=${encodeURIComponent(datasetVersion)}`, {
    method: "DELETE",
  });
}

export async function saveCloudSettings(settings) {
  const payload = await cloudRequest("/v1/settings", {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
  return normalizeSharedSettings(payload.settings);
}
