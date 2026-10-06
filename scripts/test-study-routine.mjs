import {
  applyStudyRoutineMultiplier,
  applyStudyRoutineVideoSkip,
  assignStudyRoutineVideo,
  completeStudyRoutineVideo,
  continueStudyRoutineOnDate,
  countsTowardStudyRoutine,
  createStudyRoutineRun,
  currentStudyRoutineItem,
  defaultStudyRoutineOvertimeSeconds,
  defaultStudyRoutinePlan,
  defaultStudyRoutineVideos,
  defaultStudyRoutineVideoShuffle,
  drawStudyRoutineVideo,
  extractYouTubeVideoId,
  migrateLegacyStudyRoutineRun,
  normalizeStudyRoutineMultiplier,
  normalizeStudyRoutineOvertimeSeconds,
  normalizeStudyRoutinePlan,
  normalizeStudyRoutineRun,
  recordStudyRoutineQuestion,
  scaleStudyRoutinePlan,
  scaledStudyRoutineQuestionTarget,
  studyRoutineTotals,
} from "../public/study-routine.js";

if (
  defaultStudyRoutineOvertimeSeconds !== 600 ||
  normalizeStudyRoutineOvertimeSeconds(-1) !== 0 ||
  normalizeStudyRoutineOvertimeSeconds(90_000) !== 86_400
) {
  throw new Error("目標達成後の復習猶予を安全な範囲へ整形できませんでした。");
}
if (
  normalizeStudyRoutineMultiplier(0.72) !== 0.7 ||
  normalizeStudyRoutineMultiplier(0.73) !== 0.75 ||
  normalizeStudyRoutineMultiplier(0.76) !== 0.75 ||
  normalizeStudyRoutineMultiplier(0.78) !== 0.8 ||
  normalizeStudyRoutineMultiplier(null) !== 1 ||
  normalizeStudyRoutineMultiplier(0.01) !== 0.1 ||
  normalizeStudyRoutineMultiplier(4) !== 3 ||
  scaledStudyRoutineQuestionTarget(100, 0.1) !== 10 ||
  scaledStudyRoutineQuestionTarget(100, 0.15) !== 15 ||
  scaledStudyRoutineQuestionTarget(100, 0.5) !== 50 ||
  scaledStudyRoutineQuestionTarget(100, 0.75) !== 75 ||
  scaledStudyRoutineQuestionTarget(100, 2) !== 200 ||
  scaledStudyRoutineQuestionTarget(100, 3) !== 300 ||
  scaledStudyRoutineQuestionTarget(1, 0.5) !== 1
) {
  throw new Error("毎日のメニューの学習量を0.1倍から3倍へ0.05刻みで調整できませんでした。");
}
if (
  countsTowardStudyRoutine("again") ||
  !countsTowardStudyRoutine("hard") ||
  !countsTowardStudyRoutine("good") ||
  !countsTowardStudyRoutine("easy") ||
  !countsTowardStudyRoutine("") ||
  countsTowardStudyRoutine("invalid")
) {
  throw new Error("毎日のメニューへ加算する回答を判定できませんでした。");
}

const expectedSubjects = [
  "world-history",
  "english-vocabulary",
  "geography",
  "classical-japanese",
  "japanese-history",
  "politics-economics",
  "english-vocabulary",
  "world-history",
  "earth-science-basics",
  "geography",
  "japanese-history",
  "english-vocabulary",
  "geography",
  "classical-chinese",
  "world-history",
  "japanese-history",
  "biology-basics",
  "geography",
  "english-vocabulary",
  "japanese-history",
  "english-vocabulary",
  "world-history",
];

if (
  defaultStudyRoutinePlan.length !== 44 ||
  defaultStudyRoutinePlan.filter((item) => item.kind === "study")
    .map((item) => item.subjectId).join(",") !==
    expectedSubjects.join(",") ||
  defaultStudyRoutinePlan.filter((item) => item.kind === "study")
    .some((item) => item.questionTarget !== 100) ||
  defaultStudyRoutinePlan.filter((item) => item.kind === "video").length !== 22
) {
  throw new Error("22件の科目学習それぞれの後に動画がある初期メニューになっていません。");
}

if (
  defaultStudyRoutineVideos.length !== 27 ||
  new Set(defaultStudyRoutineVideos.map((video) => video.youtubeId)).size !== 27 ||
  extractYouTubeVideoId("https://youtu.be/HfOoVw-ef_o?si=test") !== "HfOoVw-ef_o" ||
  extractYouTubeVideoId("https://www.youtube.com/watch?v=_mv5r0wix3M") !==
    "_mv5r0wix3M"
) {
  throw new Error("指定された27本の動画またはYouTubeのURL判定が正しくありません。");
}

const standaloneDraw = drawStudyRoutineVideo(
  defaultStudyRoutineVideos,
  defaultStudyRoutineVideoShuffle,
  () => 0,
);
if (
  !standaloneDraw.changed ||
  !standaloneDraw.video ||
  standaloneDraw.videoShuffle.remainingYoutubeIds.length !== 26 ||
  standaloneDraw.videoShuffle.lastYoutubeId !== standaloneDraw.video.youtubeId
) {
  throw new Error("科目選択から登録動画をランダムに1本選べませんでした。");
}

const normalizedPlan = normalizeStudyRoutinePlan([
  { id: "first", subjectId: "world-history", questionTarget: 100 },
  { id: "first", subjectId: "english-vocabulary", questionTarget: 80 },
  { id: "video", kind: "video" },
  { id: "invalid", subjectId: "不正な科目", questionTarget: 0 },
]);
if (
  normalizedPlan.length !== 3 ||
  normalizedPlan[0].id === normalizedPlan[1].id ||
  normalizedPlan[1].questionTarget !== 80
) {
  throw new Error("メニューの科目・問題数・重複番号を安全に整形できませんでした。");
}

const scaledPlan = scaleStudyRoutinePlan(normalizedPlan, 0.7);
if (
  scaledPlan[0].questionTarget !== 70 ||
  scaledPlan[1].questionTarget !== 56 ||
  scaledPlan[2].kind !== "video"
) {
  throw new Error("登録メニュー全体へ同じ学習量を反映できませんでした。");
}

const partiallyCompletedRun = normalizeStudyRoutineRun({
  schemaVersion: 4,
  id: "multiplier-run",
  studyDate: "2026-08-27",
  routineMultiplier: 1,
  items: [
    {
      id: "multiplier-study",
      kind: "study",
      subjectId: "world-history",
      baseQuestionTarget: 100,
      questionTarget: 100,
      completedCount: 75,
    },
    { id: "multiplier-video", kind: "video" },
  ],
});
const reducedRun = applyStudyRoutineMultiplier(partiallyCompletedRun, 0.5);
const ambitiousRun = applyStudyRoutineMultiplier(reducedRun, 2);
if (
  reducedRun.items[0].questionTarget !== 50 ||
  reducedRun.items[0].completedCount !== 75 ||
  reducedRun.currentIndex !== 1 ||
  studyRoutineTotals(reducedRun).completed !== 50 ||
  ambitiousRun.items[0].questionTarget !== 200 ||
  ambitiousRun.items[0].completedCount !== 75 ||
  ambitiousRun.currentIndex !== 0
) {
  throw new Error("進行中メニューの件数を保ったまま学習量を変更できませんでした。");
}

const skippedVideoRun = applyStudyRoutineVideoSkip(reducedRun, true);
const restoredVideoRun = applyStudyRoutineVideoSkip(skippedVideoRun, false);
const skippedVideoTotals = studyRoutineTotals(skippedVideoRun);
if (
  !skippedVideoRun.skipVideos ||
  skippedVideoRun.currentIndex !== skippedVideoRun.items.length ||
  skippedVideoRun.items[1].completed ||
  skippedVideoTotals.completedItems !== 2 ||
  skippedVideoTotals.completedVideos !== 0 ||
  skippedVideoTotals.skippedVideos !== 1 ||
  restoredVideoRun.skipVideos ||
  restoredVideoRun.currentIndex !== 1 ||
  restoredVideoRun.items[1].completed
) {
  throw new Error("動画を視聴済みにせず一括で飛ばし、未視聴動画を対象へ戻せませんでした。");
}

const skipBetweenStudiesRun = createStudyRoutineRun(
  [
    { id: "skip-first", kind: "study", subjectId: "world-history", questionTarget: 1 },
    { id: "skip-video", kind: "video" },
    { id: "skip-second", kind: "study", subjectId: "geography", questionTarget: 1 },
  ],
  "2026-08-27",
  "skip-between-studies-run",
  1,
  true,
);
const skipBetweenStudiesChange = recordStudyRoutineQuestion(
  skipBetweenStudiesRun,
  "world-history",
  "world-deck-1",
  "skip-question-1",
  0,
  "good",
);
if (
  skipBetweenStudiesChange.run.currentIndex !== 2 ||
  currentStudyRoutineItem(skipBetweenStudiesChange.run)?.subjectId !== "geography"
) {
  throw new Error("動画の一括スキップ中に次の科目へ直接進めませんでした。");
}

const planWithAddedVideos = [
  { id: "legacy-first", kind: "study", subjectId: "world-history", questionTarget: 2 },
  { id: "legacy-video-first", kind: "video" },
  { id: "legacy-second", kind: "study", subjectId: "geography", questionTarget: 2 },
  { id: "legacy-video-second", kind: "video" },
];
const legacyRun = normalizeStudyRoutineRun({
  schemaVersion: 1,
  id: "legacy-run",
  studyDate: "2026-08-25",
  items: [
    {
      id: "legacy-first",
      subjectId: "world-history",
      questionTarget: 2,
      completedCount: 2,
      studySeconds: 20,
      ratingCounts: { good: 2 },
    },
    {
      id: "legacy-second",
      subjectId: "geography",
      questionTarget: 2,
      completedCount: 0,
      studySeconds: 0,
    },
  ],
  countedQuestionKeys: ["world-deck::question-1"],
});
const migratedLegacyRun = migrateLegacyStudyRoutineRun(
  legacyRun,
  planWithAddedVideos,
);
if (
  !migratedLegacyRun.changed ||
  migratedLegacyRun.run.items.length !== 4 ||
  migratedLegacyRun.run.items[0].completedCount !== 2 ||
  migratedLegacyRun.run.items[0].studySeconds !== 20 ||
  migratedLegacyRun.run.items[0].ratingCounts.good !== 2 ||
  migratedLegacyRun.run.items[1].kind !== "video" ||
  migratedLegacyRun.run.items[1].completed ||
  currentStudyRoutineItem(migratedLegacyRun.run)?.id !== "legacy-video-first" ||
  Object.hasOwn(migratedLegacyRun.run, "countedQuestionKeys")
) {
  throw new Error("従来の重複記録を除き、達成状況を保って動画を補えませんでした。");
}

const partiallyStartedLegacyRun = normalizeStudyRoutineRun({
  ...legacyRun,
  items: legacyRun.items.map((item, index) =>
    index === 1 ? { ...item, completedCount: 1 } : item,
  ),
});
const migratedPartiallyStartedRun = migrateLegacyStudyRoutineRun(
  partiallyStartedLegacyRun,
  planWithAddedVideos,
).run;
if (
  !migratedPartiallyStartedRun.items[1].completed ||
  currentStudyRoutineItem(migratedPartiallyStartedRun)?.id !== "legacy-second"
) {
  throw new Error("着手済みの学習を動画移行で巻き戻しました。");
}

const unmatchedLegacyRun = migrateLegacyStudyRoutineRun(legacyRun, [
  { id: "different", kind: "study", subjectId: "world-history", questionTarget: 2 },
  { id: "different-video", kind: "video" },
]);
if (unmatchedLegacyRun.changed || unmatchedLegacyRun.run.items.length !== 2) {
  throw new Error("内容が異なる進行中メニューへ動画を誤って差し込みました。");
}

let run = createStudyRoutineRun(
  defaultStudyRoutinePlan,
  "2026-08-24",
  "routine-test",
);
let change = recordStudyRoutineQuestion(
  run,
  "world-history",
  "world-deck-1",
  "question-1",
  12,
  "again",
);
run = change.run;
if (
  !change.changed ||
  change.counted ||
  run.items[0].completedCount !== 0 ||
  run.items[0].studySeconds !== 12 ||
  run.items[0].ratingCounts.again !== 1
) {
  throw new Error("不正解をメニュー件数へ加算せず記録できませんでした。");
}

change = recordStudyRoutineQuestion(
  run,
  "world-history",
  "world-deck-1",
  "question-1",
  3,
  "good",
);
run = change.run;
if (
  !change.changed ||
  !change.counted ||
  run.items[0].completedCount !== 1 ||
  run.items[0].studySeconds !== 15 ||
  run.items[0].ratingCounts.good !== 1
) {
  throw new Error("不正解後の正答側評価をメニューへ加算できませんでした。");
}

change = recordStudyRoutineQuestion(
  run,
  "world-history",
  "world-deck-1",
  "question-1",
  2,
  "hard",
);
run = change.run;
if (
  !change.counted ||
  run.items[0].completedCount !== 2 ||
  run.items[0].studySeconds !== 17 ||
  run.items[0].ratingCounts.hard !== 1
) {
  throw new Error("同じ問題への正答側評価を回答ごとに加算できませんでした。");
}

let overtimeRun = createStudyRoutineRun(
  [
    { id: "overtime-study", subjectId: "world-history", questionTarget: 1 },
    { id: "overtime-video", kind: "video" },
  ],
  "2026-08-25",
  "overtime-test",
);
let overtimeChange = recordStudyRoutineQuestion(
  overtimeRun,
  "world-history",
  "world-deck-1",
  "overtime-question",
  5,
  "again",
  { deferCompletion: true },
);
overtimeRun = overtimeChange.run;
if (
  overtimeChange.completedItem ||
  currentStudyRoutineItem(overtimeRun)?.overtimePending ||
  currentStudyRoutineItem(overtimeRun)?.completedCount !== 0
) {
  throw new Error("不正解で追加復習を開始してしまいました。");
}
overtimeChange = recordStudyRoutineQuestion(
  overtimeRun,
  "world-history",
  "world-deck-1",
  "overtime-question",
  3,
  "good",
  { deferCompletion: true },
);
overtimeRun = overtimeChange.run;
if (
  overtimeChange.completedItem ||
  !currentStudyRoutineItem(overtimeRun)?.overtimePending ||
  currentStudyRoutineItem(overtimeRun)?.completedCount !== 1
) {
  throw new Error("正答側評価で目標へ達した項目を追加復習中として維持できませんでした。");
}
overtimeChange = recordStudyRoutineQuestion(
  overtimeRun,
  "world-history",
  "world-deck-1",
  "overtime-question",
  2,
  "hard",
);
if (
  !overtimeChange.completedItem ||
  currentStudyRoutineItem(overtimeChange.run)?.kind !== "video" ||
  overtimeChange.completedItem.completedCount !== 1 ||
  overtimeChange.completedItem.studySeconds !== 10
) {
  throw new Error("追加復習で目標数を超えず次の項目へ進めませんでした。");
}

for (let index = 2; index <= 99; index += 1) {
  change = recordStudyRoutineQuestion(
    run,
    "world-history",
    "world-deck-1",
    `question-${index}`,
  );
  run = change.run;
}
if (
  !change.completedItem ||
  change.completedItem.subjectId !== "world-history" ||
  change.completedItem.studySeconds !== 17 ||
  change.completedItem.ratingCounts.again !== 1 ||
  change.completedItem.ratingCounts.good !== 1 ||
  change.completedItem.ratingCounts.hard !== 1 ||
  currentStudyRoutineItem(run)?.kind !== "video" ||
  run.currentIndex !== 1
) {
  throw new Error("100問完了後に次の動画へ進めませんでした。");
}

const studiedRun = run;
let videoShuffle = defaultStudyRoutineVideoShuffle;
const playedYoutubeIds = [];
for (let index = 0; index < defaultStudyRoutineVideos.length; index += 1) {
  const videoChange = assignStudyRoutineVideo(
    run,
    defaultStudyRoutineVideos,
    videoShuffle,
    () => 0,
  );
  if (!videoChange.changed || !videoChange.video) {
    throw new Error("動画を一巡分シャッフルして割り当てられませんでした。");
  }
  playedYoutubeIds.push(videoChange.video.youtubeId);
  videoShuffle = videoChange.videoShuffle;
  const completion = completeStudyRoutineVideo(videoChange.run, 30);
  if (!completion.changed) {
    throw new Error("動画の視聴完了を記録できませんでした。");
  }
  run = index === defaultStudyRoutineVideos.length - 1
    ? completion.run
    : createStudyRoutineRun(
        [{ id: `video-${index}`, kind: "video" }],
        "2026-08-24",
        `video-run-${index}`,
      );
}
if (
  new Set(playedYoutubeIds).size !== defaultStudyRoutineVideos.length ||
  videoShuffle.remainingYoutubeIds.length !== 0
) {
  throw new Error("一巡する前に同じ動画が重複しました。");
}

const nextCycleRun = createStudyRoutineRun(
  [{ id: "next-cycle-video", kind: "video" }],
  "2026-08-25",
  "next-cycle-run",
);
const nextCycle = assignStudyRoutineVideo(
  nextCycleRun,
  defaultStudyRoutineVideos,
  videoShuffle,
  () => 0,
);
if (nextCycle.video.youtubeId === playedYoutubeIds.at(-1)) {
  throw new Error("一巡の境目で同じ動画が連続しました。");
}

const continued = continueStudyRoutineOnDate(studiedRun, "2026-08-25");
if (
  continued.studyDate !== "2026-08-25" ||
  continued.currentIndex !== 1 ||
  continued.items[0].completedCount !== 100 ||
  studyRoutineTotals(continued).target !== 2200 ||
  studyRoutineTotals(continued).studySeconds !== 17 ||
  !normalizeStudyRoutineRun(JSON.stringify(continued))
) {
  throw new Error("午前4時後に前回の続きへ引き継げませんでした。");
}

const deckPlan = normalizeStudyRoutinePlan([
  { id: "parts", subjectId: "japanese-history-k", questionTarget: 80, targetUnit: "decks", deckTarget: 2 },
  { id: "invalid-unit", subjectId: "geography", questionTarget: 30, targetUnit: "unknown", deckTarget: 4 },
  { id: "deck-limit", subjectId: "world-history-so", targetUnit: "decks", deckTarget: 0 },
  { id: "deck-video", kind: "video" },
]);
if (
  deckPlan[0].targetUnit !== "decks" ||
  deckPlan[0].deckTarget !== 2 ||
  deckPlan[0].questionTarget !== 80 ||
  Object.hasOwn(deckPlan[1], "targetUnit") ||
  Object.hasOwn(deckPlan[1], "deckTarget") ||
  deckPlan[2].deckTarget !== 1 ||
  scaleStudyRoutinePlan(deckPlan, 2)[0].deckTarget !== 2
) {
  throw new Error("問題数とデッキ数の目標を安全に整形できませんでした。");
}

let deckRun = createStudyRoutineRun(deckPlan, "2026-10-07", "deck-run", 0.5);
if (
  deckRun.items[0].deckTarget !== 2 ||
  deckRun.items[0].completedDeckIds.length !== 0 ||
  Object.hasOwn(deckRun.items[1], "completedDeckIds") ||
  studyRoutineTotals(deckRun).deckTarget !== 3 ||
  studyRoutineTotals(deckRun).target !== 15
) {
  throw new Error("デッキ数の項目を倍率の対象外として開始できませんでした。");
}
for (let index = 1; index <= 120; index += 1) {
  const deckChange = recordStudyRoutineQuestion(
    deckRun,
    "japanese-history-k",
    "japanese-history-k-book-01-01-01-v1",
    `deck-question-${index}`,
    1,
    index === 1 ? "again" : "good",
  );
  if (deckChange.completedItem) {
    throw new Error("一周を終える前にデッキ数の項目を完了しました。");
  }
  deckRun = deckChange.run;
}
if (
  deckRun.items[0].completedCount !== 119 ||
  deckRun.items[0].studySeconds !== 120 ||
  deckRun.currentIndex !== 0
) {
  throw new Error("デッキ数の項目で問題数の上限に止められず回答を記録できませんでした。");
}
let deckChange = recordStudyRoutineQuestion(
  deckRun,
  "japanese-history-k",
  "japanese-history-k-book-01-01-01-v1",
  "deck-question-last",
  1,
  "good",
  { completedDeckIds: ["book-01-01-01"] },
);
deckRun = deckChange.run;
const repeatedDeck = recordStudyRoutineQuestion(
  deckRun,
  "japanese-history-k",
  "japanese-history-k-book-01-01-01-v1",
  "deck-question-again",
  1,
  "good",
  { completedDeckIds: ["book-01-01-01"] },
);
if (
  deckChange.completedItem ||
  deckRun.items[0].completedDeckIds.join(",") !== "book-01-01-01" ||
  repeatedDeck.completedItem ||
  repeatedDeck.run.items[0].completedDeckIds.length !== 1 ||
  studyRoutineTotals(deckRun).completedDecks !== 1
) {
  throw new Error("一周したパートを1つとして数え、同じパートを二重に数えない処理になっていません。");
}
deckChange = recordStudyRoutineQuestion(
  deckRun,
  "japanese-history-k",
  "japanese-history-k-book-01-01-02-v1",
  "deck-question-second",
  1,
  "hard",
  { completedDeckIds: ["book-01-01-02"], deferCompletion: true },
);
if (
  deckChange.completedItem ||
  !deckChange.run.items[0].overtimePending ||
  deckChange.run.currentIndex !== 0 ||
  !normalizeStudyRoutineRun(JSON.stringify(deckChange.run)).items[0].overtimePending
) {
  throw new Error("目標のパート数へ達した後の追加復習を維持できませんでした。");
}
deckChange = recordStudyRoutineQuestion(
  deckChange.run,
  "japanese-history-k",
  "japanese-history-k-book-01-01-02-v1",
  "deck-question-second",
  1,
  "good",
);
if (
  !deckChange.completedItem ||
  deckChange.completedItem.completedDeckIds.length !== 2 ||
  deckChange.run.currentIndex !== 1 ||
  studyRoutineTotals(deckChange.run).completedDecks !== 2
) {
  throw new Error("目標のパート数を一周した後に次の項目へ進めませんでした。");
}
const multiDeckRun = createStudyRoutineRun(deckPlan, "2026-10-07", "multi-deck-run");
const multiDeck = recordStudyRoutineQuestion(
  multiDeckRun,
  "japanese-history-k",
  "japanese-history-k-book-01-01-01-v1",
  "multi-deck-question",
  1,
  "good",
  { completedDeckIds: ["book-01-01-01", "book-01-01-02", "book-01-01-03"] },
);
if (
  !multiDeck.completedItem ||
  multiDeck.completedItem.completedDeckIds.length !== 3 ||
  studyRoutineTotals(multiDeck.run).completedDecks !== 2
) {
  throw new Error("複数のパートを選んで一周した時に選んだ数だけ進められませんでした。");
}

console.log("毎日のメニュー検証完了: 学習量調整・動画一括スキップ・27本一巡・連続防止・パート数の目標を確認");
