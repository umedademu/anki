import {
  assignStudyRoutineVideo,
  completeStudyRoutineVideo,
  continueStudyRoutineOnDate,
  createStudyRoutineRun,
  currentStudyRoutineItem,
  defaultStudyRoutinePlan,
  defaultStudyRoutineVideos,
  defaultStudyRoutineVideoShuffle,
  extractYouTubeVideoId,
  migrateLegacyStudyRoutineRun,
  normalizeStudyRoutinePlan,
  normalizeStudyRoutineRun,
  recordStudyRoutineQuestion,
  studyRoutineTotals,
} from "../public/study-routine.js";

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
  migratedLegacyRun.run.countedQuestionKeys[0] !== "world-deck::question-1"
) {
  throw new Error("動画追加前から進行中のメニューへ、達成状況を保って動画を補えませんでした。");
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
  !change.counted ||
  run.items[0].completedCount !== 1 ||
  run.items[0].studySeconds !== 12 ||
  run.items[0].ratingCounts.again !== 1
) {
  throw new Error("最初に進めた問題をメニューへ加算できませんでした。");
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
  change.counted ||
  run.items[0].completedCount !== 1 ||
  run.items[0].studySeconds !== 15 ||
  run.items[0].ratingCounts.good !== 1
) {
  throw new Error("同じ問題の再出題件数または学習時間を正しく集計できませんでした。");
}

for (let index = 2; index <= 100; index += 1) {
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
  change.completedItem.studySeconds !== 15 ||
  change.completedItem.ratingCounts.again !== 1 ||
  change.completedItem.ratingCounts.good !== 1 ||
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
  studyRoutineTotals(continued).studySeconds !== 15 ||
  !normalizeStudyRoutineRun(JSON.stringify(continued))
) {
  throw new Error("午前4時後に前回の続きへ引き継げませんでした。");
}

console.log("毎日のメニュー検証完了: 学習後動画・27本一巡・連続防止・Cloudflare用状態を確認");
