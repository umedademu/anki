import * as cloud from "./cloud-progress.js";
import {
  createEmptyProgress, normalizeProgress, normalizeSubjectReviewSettings,
  rescheduleReviewProgress, resolveSubjectReviewSettings,
} from "./learning-engine.js";
import { originalProgressStorageKey } from "./original-study.js";
export * from "./cloud-progress.js";

let temporary = null;
const copy = (value) => structuredClone(value);
export const isOriginalSession = () => temporary !== null;
export const originalSettings = () => temporary ? copy(temporary.settings) : null;
export const originalReviewStorageKey = "anki-original-review:v1";
export const originalReviewStorageNotice = () => temporary?.reviewStorageNotice ?? "";
export async function beginOriginalSession(settings, questions, getStorage = () => window.localStorage) {
  const content = JSON.stringify(questions.map(({ prompt, answer, explanation }) => [prompt, answer, explanation ?? ""]));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  const fingerprint = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  let storageValue;
  let saved;
  try {
    storageValue = getStorage().getItem(originalProgressStorageKey);
    saved = storageValue === null ? null : JSON.parse(storageValue);
    if (storageValue !== null && (!saved || saved.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(saved.fingerprint) ||
        !/^original-[a-f0-9-]{36}$/.test(saved.version) ||
        !saved.progress?.questions || typeof saved.progress.questions !== "object" ||
        Array.isArray(saved.progress.questions) || !Array.isArray(saved.rounds) ||
        saved.rounds.some((id) => typeof id !== "string") ||
        (saved.session != null && !cloud.normalizeStudySession(saved.session)))) {
      throw new Error("学習記録の形式が不正です");
    }
  } catch {
    throw new Error("オリジナルの学習記録を読み込めませんでした。保存内容は変更していません。ブラウザーの設定を確認してください。");
  }
  const restored = saved?.fingerprint === fingerprint ? saved : null;
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
  const store = {
    version: restored?.version ?? `original-${crypto.randomUUID()}`,
    fingerprint, storageValue,
    settings: normalized, getStorage, reviewStorageNotice,
    progress: normalizeProgress(restored?.progress),
    session: cloud.normalizeStudySession(restored?.session),
    rounds: new Set((restored?.rounds ?? []).filter((id) => typeof id === "string")),
  };
  refreshOriginalReviewSchedule(store);
  persist(store);
  temporary = store;
  return store.version;
}
export function endOriginalSession() { temporary = null; }
function memory(version) {
  if (!String(version).startsWith("original-")) return null;
  if (!temporary || temporary.version !== version) throw new Error("今回の学習は終了しています。オリジナルを開き直してください。");
  assertCurrentStorage(temporary);
  return temporary;
}
function assertCurrentStorage(store) {
  let current;
  try { current = store.getStorage().getItem(originalProgressStorageKey); }
  catch { throw new Error("学習記録を読み込めませんでした。ブラウザーの設定を確認してください。"); }
  if (current !== store.storageValue) {
    throw new Error("別の画面でオリジナルの問題や学習記録が変更されました。再読み込みしてから再開してください。");
  }
}
function persist(store) {
  assertCurrentStorage(store);
  const serialized = JSON.stringify({
    schemaVersion: 1, fingerprint: store.fingerprint, version: store.version,
    progress: store.progress, session: store.session, rounds: [...store.rounds],
  });
  try { store.getStorage().setItem(originalProgressStorageKey, serialized); }
  catch { throw new Error("学習記録をこのブラウザーに保存できませんでした。保存容量やブラウザーの設定を確認して、もう一度お試しください。"); }
  store.storageValue = serialized;
}
function changeStoredProgress(store, change) {
  const next = { ...store, progress: copy(store.progress), session: copy(store.session), rounds: new Set(store.rounds) };
  const response = change(next);
  persist(next);
  Object.assign(store, next);
  return response;
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
function refreshOriginalReviewSchedule(store) {
  rescheduleReviewProgress(store.progress, resolveSubjectReviewSettings(
    store.settings, store.settings.setupPreferences.subjects.original?.reviewSettings,
  ));
}
export async function loadCloudState(masteryTarget, version) {
  const store = memory(version);
  if (!store) return cloud.loadCloudState(masteryTarget, version);
  refreshOriginalReviewSchedule(store);
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
  assertCurrentStorage(temporary);
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
  refreshOriginalReviewSchedule(temporary);
  return copy(temporary.settings);
}
export async function saveCloudStudySession(version, session) {
  const store = memory(version);
  return store ? changeStoredProgress(store, (next) => result(next, session).session) : cloud.saveCloudStudySession(version, session);
}
// ページを閉じる直前にも、通信待ちなしで現在位置を保存する。
export function saveOriginalSessionSnapshot(version, session) {
  const store = memory(version);
  if (!store) return;
  changeStoredProgress(store, (next) => result(next, session));
}
export async function deleteCloudStudySession(version) {
  const store = memory(version);
  if (!store) return cloud.deleteCloudStudySession(version);
  changeStoredProgress(store, (next) => { next.session = null; });
}
export async function saveCloudStudyAnswer(version, questionId, record, session, change = {}) {
  const store = memory(version);
  if (!store) return cloud.saveCloudStudyAnswer(version, questionId, record, session, change);
  return changeStoredProgress(store, (next) => {
    if (record) next.progress.questions[questionId] = copy(record);
    else delete next.progress.questions[questionId];
    next.progress.updatedAt = new Date().toISOString();
    refreshOriginalReviewSchedule(next);
    return result(next, session, change);
  });
}
export async function saveCloudStudyActivity(version, activity, session, change = {}) {
  const store = memory(version);
  if (!store) return cloud.saveCloudStudyActivity(version, activity, session, change);
  return changeStoredProgress(store, (next) => result(next, change.completeSession ? null : session, {
    ...change, completeRoundId: change.completeRoundId ?? (change.completeSession ? session?.roundId : null),
  }));
}
export async function saveCloudStudyTime(version, entry, session, options) {
  const store = memory(version);
  if (!store) return cloud.saveCloudStudyTime(version, entry, session, options);
  // 日別の時間だけを共有し、問題本文や一周の途中状態は端末に保持する。
  const saved = await cloud.saveCloudStudyTime(version, entry, null, options);
  const local = changeStoredProgress(store, (next) => result(next, session));
  return { ...local, updatedAt: saved.updatedAt, studyDate: saved.studyDate };
}
export async function undoCloudStudyActivity(version, eventId, session, change = {}) {
  const store = memory(version);
  return store ? changeStoredProgress(store, (next) => result(next, session, change)) : cloud.undoCloudStudyActivity(version, eventId, session, change);
}
export async function resetCloudProgress(version) {
  const store = memory(version);
  if (!store) return cloud.resetCloudProgress(version);
  changeStoredProgress(store, (next) => {
    next.progress = createEmptyProgress();
    next.session = null;
    next.rounds.clear();
  });
}
export async function importCloudProgress(version, progress) {
  if (memory(version)) throw new Error("オリジナルには通常教科の記録を取り込みません。");
  return cloud.importCloudProgress(version, progress);
}
