import * as cloud from "./cloud-progress.js";
import { createEmptyProgress, normalizeSubjectReviewSettings } from "./learning-engine.js";
export * from "./cloud-progress.js";

let temporary = null;
const copy = (value) => structuredClone(value);
export const isOriginalSession = () => temporary !== null;
export const originalSettings = () => temporary ? copy(temporary.settings) : null;
export const originalReviewStorageKey = "anki-original-review:v1";
export const originalReviewStorageNotice = () => temporary?.reviewStorageNotice ?? "";
export function beginOriginalSession(settings, getStorage = () => window.localStorage) {
  const normalized = cloud.normalizeSharedSettings(settings);
  let reviewStorageNotice = "";
  try {
    const raw = getStorage().getItem(originalReviewStorageKey);
    if (raw !== null) {
      const saved = JSON.parse(raw);
      const review = normalizeSubjectReviewSettings(saved?.reviewSettings);
      if (saved?.schemaVersion !== 1 || !Object.hasOwn(saved, "reviewSettings") ||
          (saved.reviewSettings !== null && (!review || Object.keys(review).some(
            (key) => saved.reviewSettings[key] !== review[key],
          )))) throw new Error("復習間隔の形式が不正です");
      normalized.setupPreferences.subjects.original = {
        ...normalized.setupPreferences.subjects.original, reviewSettings: review,
      };
    }
  } catch {
    reviewStorageNotice = "保存した復習間隔を復元できませんでした。ブラウザーの設定を確認し、復習間隔を設定し直してください。";
  }
  temporary = {
    version: `original-${crypto.randomUUID()}`,
    settings: normalized, getStorage, reviewStorageNotice,
    progress: createEmptyProgress(), session: null, rounds: new Set(),
  };
  return temporary.version;
}
export function endOriginalSession() { temporary = null; }
function memory(version) {
  if (!String(version).startsWith("original-")) return null;
  if (!temporary || temporary.version !== version) throw new Error("今回の問題は終了しています。もう一度貼り付けてください。");
  return temporary;
}
function result(store, session, change = {}) {
  store.session = cloud.normalizeStudySession(copy(session));
  if (change.completeRoundId) store.rounds.add(change.completeRoundId);
  if (change.deleteRoundId) store.rounds.delete(change.deleteRoundId);
  return {
    session: copy(store.session), updatedAt: new Date().toISOString(),
    roundProgress: { completedCount: store.rounds.size },
  };
}
export async function loadCloudState(masteryTarget, version) {
  const store = memory(version);
  if (!store) return cloud.loadCloudState(masteryTarget, version);
  return {
    progress: copy(store.progress), settings: copy(store.settings),
    session: copy(store.session), sessions: cloud.normalizeStudySessions(null, store.session),
    roundProgress: { completedCount: store.rounds.size }, studyDate: "",
  };
}
export async function saveCloudSettings(settings) {
  if (!temporary) {
    // 終了後に遅れて呼ばれても、一時科目の設定を共有しない。
    if (settings.setupPreferences?.subjects?.original) throw new Error("今回の設定は終了しています。");
    return cloud.saveCloudSettings(settings);
  }
  const next = cloud.normalizeSharedSettings({ ...temporary.settings, ...copy(settings) });
  const review = next.setupPreferences.subjects.original?.reviewSettings ?? null;
  const previousReview = temporary.settings.setupPreferences.subjects.original?.reviewSettings ?? null;
  if (JSON.stringify(review) !== JSON.stringify(previousReview)) {
    try {
      temporary.getStorage().setItem(originalReviewStorageKey, JSON.stringify({
        schemaVersion: 1, reviewSettings: review,
      }));
      temporary.reviewStorageNotice = "";
    } catch {
      throw new Error("復習間隔をこのブラウザーに保存できませんでした。保存容量やブラウザーの設定を確認して、もう一度設定してください。");
    }
  }
  temporary.settings = next;
  return copy(temporary.settings);
}
export async function saveCloudStudySession(version, session) {
  const store = memory(version);
  return store ? result(store, session).session : cloud.saveCloudStudySession(version, session);
}
export async function deleteCloudStudySession(version) {
  const store = memory(version);
  if (!store) return cloud.deleteCloudStudySession(version);
  store.session = null;
}
export async function saveCloudStudyAnswer(version, questionId, record, session, change = {}) {
  const store = memory(version);
  if (!store) return cloud.saveCloudStudyAnswer(version, questionId, record, session, change);
  if (record) store.progress.questions[questionId] = copy(record);
  else delete store.progress.questions[questionId];
  store.progress.updatedAt = new Date().toISOString();
  return result(store, session, change);
}
export async function saveCloudStudyActivity(version, activity, session, change = {}) {
  const store = memory(version);
  if (!store) return cloud.saveCloudStudyActivity(version, activity, session, change);
  return result(store, change.completeSession ? null : session, {
    ...change, completeRoundId: change.completeRoundId ?? (change.completeSession ? session?.roundId : null),
  });
}
export async function saveCloudStudyTime(version, entry, session, options) {
  const store = memory(version);
  return store ? result(store, session) : cloud.saveCloudStudyTime(version, entry, session, options);
}
export async function undoCloudStudyActivity(version, eventId, session, change = {}) {
  const store = memory(version);
  return store ? result(store, session, change) : cloud.undoCloudStudyActivity(version, eventId, session, change);
}
export async function resetCloudProgress(version) {
  const store = memory(version);
  if (!store) return cloud.resetCloudProgress(version);
  store.progress = createEmptyProgress();
  store.session = null;
  store.rounds.clear();
}
export async function importCloudProgress(version, progress) {
  if (memory(version)) throw new Error("今回だけの問題には過去の記録を取り込みません。");
  return cloud.importCloudProgress(version, progress);
}
