export const speechSettingsStorageKey = "anki-speech-settings:v1";

export const azureSpeechVoices = Object.freeze([
  { id: "ja-JP-NanamiNeural", label: "Nanami（女性）" },
  { id: "ja-JP-AoiNeural", label: "Aoi（女性）" },
  { id: "ja-JP-MayuNeural", label: "Mayu（女性）" },
  { id: "ja-JP-ShioriNeural", label: "Shiori（女性）" },
  { id: "ja-JP-KeitaNeural", label: "Keita（男性）" },
  { id: "ja-JP-DaichiNeural", label: "Daichi（男性）" },
  { id: "ja-JP-NaokiNeural", label: "Naoki（男性）" },
]);

export const englishAzureSpeechVoices = Object.freeze([
  { id: "en-US-JennyNeural", label: "Jenny（米国・女性）" },
  { id: "en-US-GuyNeural", label: "Guy（米国・男性）" },
  { id: "en-GB-SoniaNeural", label: "Sonia（英国・女性）" },
  { id: "en-GB-RyanNeural", label: "Ryan（英国・男性）" },
]);

export const defaultAzureSpeechVoiceId = azureSpeechVoices[0].id;
export const defaultEnglishAzureSpeechVoiceId = englishAzureSpeechVoices[0].id;

export const defaultSpeechSettings = Object.freeze({
  source: "cloud",
  azureVoiceId: defaultAzureSpeechVoiceId,
  englishAzureVoiceId: defaultEnglishAzureSpeechVoiceId,
  voiceId: "",
  englishVoiceId: "",
  rate: 1,
});

export function getVoiceId(voice) {
  const voiceUri = String(voice?.voiceURI ?? "").trim();
  if (voiceUri) {
    return voiceUri;
  }
  return `${String(voice?.name ?? "")}::${String(voice?.lang ?? "")}`;
}

export function normalizeSpeechSettings(value) {
  const source = value && typeof value === "object" ? value : {};
  const rate = Number(source.rate);
  const requestedAzureVoiceId = String(source.azureVoiceId ?? "");
  const requestedEnglishAzureVoiceId = String(source.englishAzureVoiceId ?? "");
  return {
    source: source.source === "device" ? "device" : "cloud",
    azureVoiceId: azureSpeechVoices.some(
      (voice) => voice.id === requestedAzureVoiceId,
    )
      ? requestedAzureVoiceId
      : defaultAzureSpeechVoiceId,
    englishAzureVoiceId: englishAzureSpeechVoices.some(
      (voice) => voice.id === requestedEnglishAzureVoiceId,
    )
      ? requestedEnglishAzureVoiceId
      : defaultEnglishAzureSpeechVoiceId,
    voiceId: String(source.voiceId ?? "").slice(0, 500),
    englishVoiceId: String(source.englishVoiceId ?? "").slice(0, 500),
    rate: Number.isFinite(rate) ? Math.min(3, Math.max(0.7, rate)) : 1,
  };
}

export function getVoicesForLanguage(
  language,
  synthesis = globalThis.speechSynthesis,
) {
  const prefix = String(language ?? "").toLowerCase().split("-")[0];
  const voices = Array.from(synthesis?.getVoices?.() ?? []).filter((voice) =>
    String(voice.lang ?? "").toLowerCase().startsWith(prefix),
  );
  return voices.sort((left, right) => {
    if (Boolean(left.default) !== Boolean(right.default)) {
      return left.default ? -1 : 1;
    }
    return String(left.name).localeCompare(String(right.name), "ja");
  });
}

export function getJapaneseVoices(synthesis = globalThis.speechSynthesis) {
  return getVoicesForLanguage("ja-JP", synthesis);
}

export function getEnglishVoices(synthesis = globalThis.speechSynthesis) {
  return getVoicesForLanguage("en-US", synthesis);
}

export function loadSpeechSettings(storage = globalThis.localStorage) {
  try {
    const stored = storage?.getItem?.(speechSettingsStorageKey);
    return stored
      ? normalizeSpeechSettings(JSON.parse(stored))
      : { ...defaultSpeechSettings };
  } catch {
    return { ...defaultSpeechSettings };
  }
}

export function saveSpeechSettings(value, storage = globalThis.localStorage) {
  const normalized = normalizeSpeechSettings(value);
  storage?.setItem?.(speechSettingsStorageKey, JSON.stringify(normalized));
  return normalized;
}
