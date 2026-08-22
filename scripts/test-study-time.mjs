import {
  addStudySeconds,
  formatStudyDuration,
  maxStudySecondsPerScreen,
  normalizeStudySeconds,
} from "../public/study-time.js";

const firstScreen = addStudySeconds(0, 0, 90);
const cappedScreen = addStudySeconds(
  firstScreen.totalSeconds,
  firstScreen.screenSeconds,
  20,
);
const nextScreen = addStudySeconds(firstScreen.totalSeconds, 0, 12);

if (
  maxStudySecondsPerScreen !== 30 ||
  firstScreen.totalSeconds !== 30 ||
  firstScreen.screenSeconds !== 30 ||
  cappedScreen.addedSeconds !== 0 ||
  cappedScreen.totalSeconds !== 30 ||
  nextScreen.totalSeconds !== 42 ||
  nextScreen.screenSeconds !== 12 ||
  normalizeStudySeconds(-1) !== 0 ||
  formatStudyDuration(4264) !== "01:11:04"
) {
  throw new Error("学習時間の30秒上限または時分秒表示が正しくありません。");
}

console.log("学習時間検証完了: 画面ごとの30秒上限と時分秒表示を確認");
