export const speechSettingsStorageKey = "anki-speech-settings:v1";

export const defaultSpeechSettings = Object.freeze({
  source: "cloud",
  voiceId: "",
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
  return {
    source: source.source === "device" ? "device" : "cloud",
    voiceId: String(source.voiceId ?? "").slice(0, 500),
    rate: Number.isFinite(rate) ? Math.min(1.2, Math.max(0.7, rate)) : 1,
  };
}

export function getJapaneseVoices(synthesis = globalThis.speechSynthesis) {
  const voices = Array.from(synthesis?.getVoices?.() ?? []).filter((voice) =>
    String(voice.lang ?? "").toLowerCase().startsWith("ja"),
  );
  return voices.sort((left, right) => {
    if (Boolean(left.default) !== Boolean(right.default)) {
      return left.default ? -1 : 1;
    }
    return String(left.name).localeCompare(String(right.name), "ja");
  });
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
