import {
  createSessionDatasetVersion,
  mergeDeckProgress,
  normalizeDeckSelection,
} from "../public/deck-selection.js";
import {
  createEmptyProgress,
  createQuestionQueue,
  shuffleTasks,
} from "../public/learning-engine.js";

const availableDeckIds = ["deck-1", "deck-2", "deck-3"];
if (
  normalizeDeckSelection(
    availableDeckIds,
    ["deck-3", "deck-1", "deck-3", "unknown"],
  ).join(",") !== "deck-1,deck-3" ||
  normalizeDeckSelection(availableDeckIds, [], "deck-2").join(",") !== "deck-2"
) {
  throw new Error("複数デッキの選択値を正しく整形できませんでした。");
}

const versions = new Map([
  ["deck-1", "version-one"],
  ["deck-2", "version-two"],
  ["deck-3", "version-three"],
]);
if (
  createSessionDatasetVersion("world-history", ["deck-1"], versions) !==
    "version-one" ||
  createSessionDatasetVersion(
    "world-history",
    ["deck-3", "deck-1", "deck-2"],
    versions,
  ) !== "mix-world-history-deck-1-deck-2-deck-3"
) {
  throw new Error("デッキの組合せごとの途中状態を分離できませんでした。");
}

const merged = mergeDeckProgress([
  {
    progress: {
      questions: { "question-1": { attempts: 1 } },
      updatedAt: "2026-08-22T01:00:00.000Z",
    },
  },
  {
    progress: {
      questions: { "question-2": { attempts: 2 } },
      updatedAt: "2026-08-22T02:00:00.000Z",
    },
  },
]);
if (
  merged.questions["question-1"].attempts !== 1 ||
  merged.questions["question-2"].attempts !== 2 ||
  merged.updatedAt !== "2026-08-22T02:00:00.000Z"
) {
  throw new Error("選択デッキごとの進捗を混合学習用に結合できませんでした。");
}

const combinedTerms = availableDeckIds.map((deckId, index) => ({
  id: `${deckId}-term`,
  stages: {
    beginner: [{ id: `${deckId}-question-${index + 1}` }],
    reverse: [],
    integrated: [],
  },
}));
const combinedQueue = createQuestionQueue(
  combinedTerms,
  createEmptyProgress(),
  2,
  "beginner",
);
const shuffledQueue = shuffleTasks(combinedQueue, () => 0);
if (
  new Set(shuffledQueue.map((task) => task.termId)).size !== 3 ||
  shuffledQueue.map((task) => task.termId).join(",") ===
    combinedQueue.map((task) => task.termId).join(",")
) {
  throw new Error("選択した全デッキの問題を混ぜて出題できませんでした。");
}

console.log("複数デッキ検証完了: 複数選択・ランダム混合・途中状態・進捗結合を確認");
