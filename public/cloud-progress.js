import {
  createEmptyProgress,
  normalizeProgress,
  normalizeReviewSettings,
} from "./learning-engine.js";

export const accessKeyStorageKey = "anki-cloud-access-key:v1";

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

export async function requestCloudSpeech(text, voice) {
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
    settings: normalizeReviewSettings(payload.settings),
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
    method: "PUT",
    body: JSON.stringify(normalizeReviewSettings(settings)),
  });
  return normalizeReviewSettings(payload.settings);
}
