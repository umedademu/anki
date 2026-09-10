import * as cloud from "./cloud-progress.js";
import { createEmptyProgress } from "./learning-engine.js";
export * from "./cloud-progress.js";

let temporary = null;
const copy = (value) => structuredClone(value);
export const isOriginalSession = () => temporary !== null;
export const originalSettings = () => temporary ? copy(temporary.settings) : null;
export function beginOriginalSession(settings) {
  temporary = {
    version: `original-${crypto.randomUUID()}`,
    settings: cloud.normalizeSharedSettings(settings),
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
  temporary.settings = cloud.normalizeSharedSettings({ ...temporary.settings, ...copy(settings) });
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
