export const maxStudySecondsPerScreen = 30;
const maxRecordedStudySeconds = 1_000_000_000;

export function normalizeStudySeconds(value, maximum = maxRecordedStudySeconds) {
  const seconds = Number.parseInt(value, 10);
  return Number.isFinite(seconds)
    ? Math.min(maximum, Math.max(0, seconds))
    : 0;
}

export function addStudySeconds(totalSeconds, screenSeconds, elapsedSeconds) {
  const total = normalizeStudySeconds(totalSeconds);
  const screen = normalizeStudySeconds(
    screenSeconds,
    maxStudySecondsPerScreen,
  );
  const elapsed = normalizeStudySeconds(
    elapsedSeconds,
    maxStudySecondsPerScreen,
  );
  const addedSeconds = Math.min(
    elapsed,
    maxStudySecondsPerScreen - screen,
  );
  return {
    totalSeconds: normalizeStudySeconds(total + addedSeconds),
    screenSeconds: screen + addedSeconds,
    addedSeconds,
  };
}

export function formatStudyDuration(value) {
  const seconds = normalizeStudySeconds(value);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return [hours, minutes, remainingSeconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}
