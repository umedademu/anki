import {
  addStudySeconds,
  defaultStudyTimeLimitSeconds,
  formatStudyDuration,
  maximumStudyTimeLimitSeconds,
  normalizeStudySeconds,
  normalizeStudyTimeLimitSeconds,
} from "../public/study-time.js";

const firstScreen = addStudySeconds(0, 0, 90);
const cappedScreen = addStudySeconds(
  firstScreen.totalSeconds,
  firstScreen.screenSeconds,
  20,
);
const nextScreen = addStudySeconds(firstScreen.totalSeconds, 0, 12);
const customLimitScreen = addStudySeconds(0, 0, 120, 90);
const cappedCustomLimitScreen = addStudySeconds(
  customLimitScreen.totalSeconds,
  customLimitScreen.screenSeconds,
  20,
  90,
);

if (
  defaultStudyTimeLimitSeconds !== 30 ||
  maximumStudyTimeLimitSeconds !== 3600 ||
  firstScreen.totalSeconds !== 30 ||
  firstScreen.screenSeconds !== 30 ||
  cappedScreen.addedSeconds !== 0 ||
  cappedScreen.totalSeconds !== 30 ||
  nextScreen.totalSeconds !== 42 ||
  nextScreen.screenSeconds !== 12 ||
  customLimitScreen.totalSeconds !== 90 ||
  customLimitScreen.screenSeconds !== 90 ||
  cappedCustomLimitScreen.addedSeconds !== 0 ||
  normalizeStudyTimeLimitSeconds(0) !== 1 ||
  normalizeStudyTimeLimitSeconds(4000) !== 3600 ||
  normalizeStudyTimeLimitSeconds("不正") !== 30 ||
  normalizeStudySeconds(-1) !== 0 ||
  formatStudyDuration(4264) !== "01:11:04"
) {
  throw new Error("学習時間の共通上限または時分秒表示が正しくありません。");
}

console.log("学習時間検証完了: 画面ごとの共通上限と時分秒表示を確認");
