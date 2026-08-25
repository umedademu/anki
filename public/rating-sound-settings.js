export const ratingSoundKeys = Object.freeze([
  "again",
  "hard",
  "good",
  "easy",
]);

export const defaultRatingSoundVolume = 1;
export const minimumRatingSoundVolume = 0.25;
export const maximumRatingSoundVolume = 2;
export const maximumRatingSoundFileBytes = 2 * 1024 * 1024;
export const maximumRatingSoundDurationSeconds = 5;

const ratingSoundKeySet = new Set(ratingSoundKeys);
const contentTypeExtensions = Object.freeze({
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/mp4": "m4a",
});

export function normalizeRatingSoundKey(value) {
  const key = String(value ?? "");
  return ratingSoundKeySet.has(key) ? key : "";
}

export function normalizeRatingSoundVolume(value) {
  const volume = Number(value);
  if (!Number.isFinite(volume)) return defaultRatingSoundVolume;
  return Math.min(
    maximumRatingSoundVolume,
    Math.max(minimumRatingSoundVolume, volume),
  );
}

export function normalizeRatingSoundContentType(value, fileName = "") {
  const contentType = String(value ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (contentType === "audio/mp3") return "audio/mpeg";
  if (["audio/x-wav", "audio/wave", "audio/vnd.wave"].includes(contentType)) {
    return "audio/wav";
  }
  if (["audio/x-m4a", "audio/m4a"].includes(contentType)) {
    return "audio/mp4";
  }
  if (contentType in contentTypeExtensions) return contentType;
  const extension = String(fileName ?? "").toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (extension === "mp3") return "audio/mpeg";
  if (extension === "wav") return "audio/wav";
  if (["m4a", "mp4"].includes(extension)) return "audio/mp4";
  return "";
}

export function ratingSoundFileExtension(contentType) {
  return contentTypeExtensions[normalizeRatingSoundContentType(contentType)] ?? "";
}

export function normalizeRatingSoundFileName(value, contentType = "") {
  const fallbackExtension = ratingSoundFileExtension(contentType);
  const normalized = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]/g, "-")
    .trim()
    .slice(0, 120);
  return normalized || `評価音.${fallbackExtension || "mp3"}`;
}

function normalizeRatingSoundFile(value, rating) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const contentType = normalizeRatingSoundContentType(
    value.contentType,
    value.fileName,
  );
  const extension = ratingSoundFileExtension(contentType);
  const storageKey = String(value.storageKey ?? "");
  const expectedPrefix = `rating-sounds/${rating}/`;
  const size = Number.parseInt(value.size, 10);
  const updatedAt = String(value.updatedAt ?? "");
  if (
    !extension ||
    !storageKey.startsWith(expectedPrefix) ||
    !storageKey.endsWith(`.${extension}`) ||
    storageKey.length > 220 ||
    !/^[A-Za-z0-9_./-]+$/.test(storageKey) ||
    !Number.isFinite(size) ||
    size < 1 ||
    size > maximumRatingSoundFileBytes ||
    !Number.isFinite(Date.parse(updatedAt))
  ) {
    return null;
  }
  return {
    storageKey,
    fileName: normalizeRatingSoundFileName(value.fileName, contentType),
    contentType,
    size,
    updatedAt: new Date(updatedAt).toISOString(),
  };
}

export function normalizeRatingSounds(value) {
  let source = value;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      source = {};
    }
  }
  source = source && typeof source === "object" && !Array.isArray(source)
    ? source
    : {};
  return Object.fromEntries(
    ratingSoundKeys.map((rating) => [
      rating,
      normalizeRatingSoundFile(source[rating], rating),
    ]),
  );
}

export function createRatingSoundMetadata({
  rating,
  storageKey,
  fileName,
  contentType,
  size,
  updatedAt = new Date().toISOString(),
}) {
  const normalizedRating = normalizeRatingSoundKey(rating);
  if (!normalizedRating) {
    throw new Error("評価の種類が正しくありません。");
  }
  const metadata = normalizeRatingSounds({
    [normalizedRating]: {
      storageKey,
      fileName,
      contentType,
      size,
      updatedAt,
    },
  })[normalizedRating];
  if (!metadata) {
    throw new Error("評価音の情報が正しくありません。");
  }
  return metadata;
}
