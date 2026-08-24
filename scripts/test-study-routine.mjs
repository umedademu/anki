import {
  continueStudyRoutineOnDate,
  createStudyRoutineRun,
  currentStudyRoutineItem,
  defaultStudyRoutinePlan,
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
  defaultStudyRoutinePlan.length !== 22 ||
  defaultStudyRoutinePlan.map((item) => item.subjectId).join(",") !==
    expectedSubjects.join(",") ||
  defaultStudyRoutinePlan.some((item) => item.questionTarget !== 100)
) {
  throw new Error("指定された22項目・各100問の初期メニューになっていません。");
}

const normalizedPlan = normalizeStudyRoutinePlan([
  { id: "first", subjectId: "world-history", questionTarget: 100 },
  { id: "first", subjectId: "english-vocabulary", questionTarget: 80 },
  { id: "invalid", subjectId: "不正な科目", questionTarget: 0 },
]);
if (
  normalizedPlan.length !== 2 ||
  normalizedPlan[0].id === normalizedPlan[1].id ||
  normalizedPlan[1].questionTarget !== 80
) {
  throw new Error("メニューの科目・問題数・重複番号を安全に整形できませんでした。");
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
);
run = change.run;
if (!change.counted || run.items[0].completedCount !== 1) {
  throw new Error("最初に進めた問題をメニューへ加算できませんでした。");
}

change = recordStudyRoutineQuestion(
  run,
  "world-history",
  "world-deck-1",
  "question-1",
);
if (change.counted || change.run.items[0].completedCount !== 1) {
  throw new Error("同じ問題の再出題がメニューへ重複加算されました。");
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
  currentStudyRoutineItem(run)?.subjectId !== "english-vocabulary" ||
  run.currentIndex !== 1
) {
  throw new Error("100問完了後に次の科目へ進めませんでした。");
}

const continued = continueStudyRoutineOnDate(run, "2026-08-25");
if (
  continued.studyDate !== "2026-08-25" ||
  continued.currentIndex !== 1 ||
  continued.items[0].completedCount !== 100 ||
  studyRoutineTotals(continued).target !== 2200 ||
  !normalizeStudyRoutineRun(JSON.stringify(continued))
) {
  throw new Error("午前4時後に前回の続きへ引き継げませんでした。");
}

console.log("毎日のメニュー検証完了: 初期22項目・重複除外・次科目・翌日継続を確認");
