import {
  addRatingCount,
  createEmptyRatingCounts,
  normalizeRatingCounts,
  ratingValues,
} from "./rating-results.js";

const routineIdPattern = /^[A-Za-z0-9_-]{1,100}$/;
const youtubeIdPattern = /^[A-Za-z0-9_-]{11}$/;
const routineItemLimit = 100;
const routineVideoLimit = 200;
const routineQuestionTargetLimit = 10_000;
const routineStudySecondsLimit = 365 * 24 * 60 * 60;

export const defaultStudyRoutineOvertimeSeconds = 10 * 60;
export const maximumStudyRoutineOvertimeSeconds = 24 * 60 * 60;

const defaultSubjects = [
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

const initialVideos = [
  ["0djQ-8zHnAY", "ラップで覚える「漢の武帝の時代」【東大生ラッパー】prod by HANEY PATH FRIEND", "法念の世界史ちゃんねる"],
  ["HXRpVe-ZHU8", "東大生とラップで覚えるアテネ政治史【参考書『ラップで学ぶ世界史』発売中（概要欄でチェック！）】（prod. A$AMINE BEAZ）", "法念の世界史ちゃんねる"],
  ["6Wx07rE4ZZM", "【語呂合わせ】ラップで覚える「ローマ文化史」【東大生ラッパー】Beats by MastPOP", "法念の世界史ちゃんねる"],
  ["OchmHspbrYY", "【語呂合わせ】世界史超重要年号８選ラップ（人物編）【東大生ラッパー】Prod by Tambourine Man", "法念の世界史ちゃんねる"],
  ["37JGQk_prYk", "【語呂合わせ】世界史超重要年号８選ラップ（出来事編）【東大生ラッパー】Prod by Tambourine Man", "法念の世界史ちゃんねる"],
  ["4Qz_uDvbz7M", "【語呂合わせ】ラップで覚える「中世ヨーロッパ文化史」【東大生ラッパー】Prod. by Pegunjo Music", "法念の世界史ちゃんねる"],
  ["_PifI8GjNUE", "東大生が教える日本史重要年号ラップ（平安時代編）Prod. by Pegunjo Music", "法念の世界史ちゃんねる"],
  ["iP76VwU6uPA", "【語呂合わせ】ラップで覚える「ルネサンス」文化史【東大生ラッパー】Prod. Tambourine Man", "法念の世界史ちゃんねる"],
  ["A1CuzBxnw1o", "【語呂合わせ】ラップで覚える「イスラーム文化史」【東大生ラッパー】（Prod. by S.M.S）", "法念の世界史ちゃんねる"],
  ["1eXGq31w-lk", "【語呂合わせ】ラップで覚える「19世紀ヨーロッパ文化史・前編」（文学・美術編）【東大生ラッパー】（prod. BKOJ!）", "法念の世界史ちゃんねる"],
  ["XUb2ymi0ly8", "【語呂合わせ】ラップで覚える「17〜18世紀ヨーロッパ文化史・前編」（科学・芸術編）【東大生ラッパー】（prod. by DRAG）", "法念の世界史ちゃんねる"],
  ["xXMmRmM_IRc", "【語呂合わせ】ラップで覚える「ヨーロッパ建築史」【東大生ラッパー】（prod. BKOJ!）", "法念の世界史ちゃんねる"],
  ["PMiyAnphuac", "【語呂合わせ】ラップで覚える「明清文化史」【東大生ラッパー】Prod. Tambourine Man", "法念の世界史ちゃんねる"],
  ["IHJba4ZZeiI", "【語呂合わせ】ラップで覚える「19世紀ヨーロッパ文化史・後編」（思想・科学技術編）【東大生ラッパー】（prod. BKOJ!）", "法念の世界史ちゃんねる"],
  ["HfOoVw-ef_o", "【世界史替え歌】東大生の世界史ラップ「イスラーム世界史」【全部俺】", "法念の世界史ちゃんねる"],
  ["_mv5r0wix3M", "東大生とラップで覚える「歴代アメリカ合衆国大統領」【参考書『ラップで学ぶ世界史』発売中（概要欄でチェック！）】", "法念の世界史ちゃんねる"],
  ["I4enQyck0Xo", "【語呂合わせ】ラップで覚える「唐宋文化史」【東大生ラッパー】（Prod by KOHZO）", "法念の世界史ちゃんねる"],
  ["nplcU6NFPpg", "【語呂合わせ】ラップで覚える「古代中国文化史」【東大生ラッパー】Prod. Tambourine Man", "法念の世界史ちゃんねる"],
  ["Q3DilierZMw", "【語呂合わせ】ラップで覚える「歴代清朝皇帝」【東大生ラッパー】", "法念の世界史ちゃんねる"],
  ["J4tRQr7Ie2M", "【イスラーム王朝】替え歌で覚える歴史【チキチキバンバン】", "とある社会の替歌目録"],
  ["SFCt774SVio", "【語呂合わせ】ラップで覚えるギリシア文化史【東大生ラッパー】（Prod. by gaga sss）", "法念の世界史ちゃんねる"],
  ["_Tip3hxT-40", "【語呂合わせ】ラップで覚える「19世紀ロシア皇帝」【東大生ラッパー】[Prod. P.J INLAND]", "法念の世界史ちゃんねる"],
  ["2ohIsEH7Iiw", "【語呂合わせ】ラップで覚える「魏晋南北朝時代の文化史」【東大生ラッパー】（prod. BKOJ!）", "法念の世界史ちゃんねる"],
  ["u5Mdnw2vcpc", "【語呂合わせ】ラップで覚える「20世紀文化史」【東大生ラッパー】（prod. BKOJ!）", "法念の世界史ちゃんねる"],
  ["1YwdL9bxl_E", "【語呂合わせ】ラップで覚える「インド文化史」【東大生ラッパー】Prod. Tambourine Man", "法念の世界史ちゃんねる"],
  ["-jq-1K2nbzU", "【語呂合わせ】ラップで覚える歴代イギリス王朝【東大生ラッパー】（Produced by AK BEATZ）", "法念の世界史ちゃんねる"],
  ["7-SIArJukeo", "【語呂合わせ】ラップで覚える「産業革命」【東大生ラッパー】（Prod. K3NTA）", "法念の世界史ちゃんねる"],
];

export const defaultStudyRoutineVideos = Object.freeze(
  initialVideos.map(([youtubeId, title, authorName]) =>
    Object.freeze({ youtubeId, title, authorName }),
  ),
);

export const defaultStudyRoutinePlan = Object.freeze(
  defaultSubjects.flatMap((subjectId, index) => {
    const number = String(index + 1).padStart(2, "0");
    return [
      Object.freeze({
        id: `default-${number}`,
        kind: "study",
        subjectId,
        questionTarget: 100,
      }),
      Object.freeze({
        id: `default-video-${number}`,
        kind: "video",
      }),
    ];
  }),
);

export const defaultStudyRoutineVideoShuffle = Object.freeze({
  schemaVersion: 1,
  remainingYoutubeIds: Object.freeze([]),
  lastYoutubeId: "",
});

function normalizeRoutineId(value) {
  const id = String(value ?? "");
  return routineIdPattern.test(id) ? id : "";
}

function normalizeYoutubeId(value) {
  const youtubeId = String(value ?? "");
  return youtubeIdPattern.test(youtubeId) ? youtubeId : "";
}

function normalizeVideoText(value, maximumLength) {
  return String(value ?? "").trim().slice(0, maximumLength);
}

function normalizeQuestionTarget(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed)
    ? Math.min(routineQuestionTargetLimit, Math.max(1, parsed))
    : 100;
}

function normalizeRoutineItem(value, index, usedIds) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const kind = value.kind === "video" ? "video" : "study";
  const subjectId = kind === "study" ? normalizeRoutineId(value.subjectId) : "";
  if (kind === "study" && !subjectId) return null;
  const requestedId = normalizeRoutineId(value.id);
  let id = requestedId || `routine-${String(index + 1).padStart(2, "0")}`;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${(requestedId || "routine").slice(0, 90)}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(id);
  return kind === "video"
    ? { id, kind }
    : {
        id,
        kind,
        subjectId,
        questionTarget: normalizeQuestionTarget(value.questionTarget),
      };
}

function cloneDefaultPlan() {
  return defaultStudyRoutinePlan.map((item) => ({ ...item }));
}

function cloneDefaultVideos() {
  return defaultStudyRoutineVideos.map((video) => ({ ...video }));
}

export function normalizeStudyRoutinePlan(value, { fallbackToDefault = true } = {}) {
  if (!Array.isArray(value)) {
    return fallbackToDefault ? cloneDefaultPlan() : [];
  }
  const usedIds = new Set();
  const plan = value.slice(0, routineItemLimit).flatMap((item, index) => {
    const normalized = normalizeRoutineItem(item, index, usedIds);
    return normalized ? [normalized] : [];
  });
  return plan.length > 0 || !fallbackToDefault ? plan : cloneDefaultPlan();
}

export function normalizeStudyRoutineVideoLibrary(
  value,
  { fallbackToDefault = true } = {},
) {
  if (!Array.isArray(value)) {
    return fallbackToDefault ? cloneDefaultVideos() : [];
  }
  const usedIds = new Set();
  return value.slice(0, routineVideoLimit).flatMap((video) => {
    if (!video || typeof video !== "object" || Array.isArray(video)) return [];
    const youtubeId = normalizeYoutubeId(video.youtubeId);
    const title = normalizeVideoText(video.title, 300);
    if (!youtubeId || !title || usedIds.has(youtubeId)) return [];
    usedIds.add(youtubeId);
    return [{
      youtubeId,
      title,
      authorName: normalizeVideoText(video.authorName, 200),
    }];
  });
}

export function normalizeStudyRoutineVideoShuffle(value, videoLibrary) {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
  const allowedIds = new Set(
    normalizeStudyRoutineVideoLibrary(videoLibrary, { fallbackToDefault: false })
      .map((video) => video.youtubeId),
  );
  const remainingYoutubeIds = [...new Set(
    (Array.isArray(source.remainingYoutubeIds)
      ? source.remainingYoutubeIds
      : [])
      .map(normalizeYoutubeId)
      .filter((youtubeId) => youtubeId && allowedIds.has(youtubeId)),
  )];
  return {
    schemaVersion: 1,
    remainingYoutubeIds,
    lastYoutubeId: normalizeYoutubeId(source.lastYoutubeId),
  };
}

export function extractYouTubeVideoId(value) {
  const input = String(value ?? "").trim();
  if (youtubeIdPattern.test(input)) return input;
  let url;
  try {
    url = new URL(input);
  } catch {
    return "";
  }
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  let candidate = "";
  if (hostname === "youtu.be") {
    candidate = url.pathname.split("/").filter(Boolean)[0] ?? "";
  } else if (["youtube.com", "m.youtube.com", "music.youtube.com"].includes(hostname)) {
    candidate = url.searchParams.get("v") ?? "";
    if (!candidate) {
      const parts = url.pathname.split("/").filter(Boolean);
      if (["embed", "shorts", "live"].includes(parts[0])) {
        candidate = parts[1] ?? "";
      }
    }
  }
  return normalizeYoutubeId(candidate);
}

function normalizeStudyDate(value) {
  const date = String(value ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function normalizeRoutineStudySeconds(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed)
    ? Math.min(routineStudySecondsLimit, Math.max(0, parsed))
    : 0;
}

export function normalizeStudyRoutineOvertimeSeconds(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed)
    ? Math.min(maximumStudyRoutineOvertimeSeconds, Math.max(0, parsed))
    : defaultStudyRoutineOvertimeSeconds;
}

function routineItemComplete(item) {
  return item.kind === "video"
    ? item.completed === true
    : item.completedCount >= item.questionTarget && !item.overtimePending;
}

export function normalizeStudyRoutineRun(value) {
  let source = value;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      return null;
    }
  }
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return null;
  }
  const id = normalizeRoutineId(source.id);
  const studyDate = normalizeStudyDate(source.studyDate);
  const normalizedPlan = normalizeStudyRoutinePlan(source.items, {
    fallbackToDefault: false,
  });
  const items = normalizedPlan.map((item, index) => {
    const sourceItem = source.items?.[index] ?? {};
    if (item.kind === "video") {
      return {
        ...item,
        youtubeId: normalizeYoutubeId(sourceItem.youtubeId),
        videoTitle: normalizeVideoText(sourceItem.videoTitle, 300),
        videoAuthorName: normalizeVideoText(sourceItem.videoAuthorName, 200),
        completed: sourceItem.completed === true,
        studySeconds: normalizeRoutineStudySeconds(sourceItem.studySeconds),
      };
    }
    return {
      ...item,
      completedCount: Math.min(
        item.questionTarget,
        Math.max(0, Number.parseInt(sourceItem.completedCount, 10) || 0),
      ),
      overtimePending:
        sourceItem.overtimePending === true &&
        Number.parseInt(sourceItem.completedCount, 10) >= item.questionTarget,
      studySeconds: normalizeRoutineStudySeconds(sourceItem.studySeconds),
      ratingCounts: normalizeRatingCounts(sourceItem.ratingCounts),
    };
  });
  if (!id || !studyDate || items.length === 0) return null;
  const firstIncompleteIndex = items.findIndex((item) => !routineItemComplete(item));
  return {
    schemaVersion: 3,
    id,
    studyDate,
    currentIndex: firstIncompleteIndex < 0 ? items.length : firstIncompleteIndex,
    items,
  };
}

export function migrateLegacyStudyRoutineRun(run, plan) {
  const normalized = normalizeStudyRoutineRun(run);
  const normalizedPlan = normalizeStudyRoutinePlan(plan, {
    fallbackToDefault: false,
  });
  if (
    !normalized ||
    normalized.items.some((item) => item.kind === "video") ||
    !normalizedPlan.some((item) => item.kind === "video")
  ) {
    return { run: normalized, changed: false };
  }

  const legacyStudyItems = normalized.items.filter((item) => item.kind === "study");
  const plannedStudyItems = normalizedPlan.filter((item) => item.kind === "study");
  if (
    legacyStudyItems.length !== plannedStudyItems.length ||
    legacyStudyItems.some((item, index) => item.id !== plannedStudyItems[index].id)
  ) {
    return { run: normalized, changed: false };
  }

  const activeStudyIndex = legacyStudyItems.findIndex(
    (item) => item.completedCount < item.questionTarget,
  );
  const activeStudy = legacyStudyItems[activeStudyIndex] ?? null;
  let pendingVideoStart = normalizedPlan.length;
  if (activeStudy) {
    const activePlanIndex = normalizedPlan.findIndex(
      (item) => item.kind === "study" && item.id === activeStudy.id,
    );
    if (activeStudy.completedCount > 0) {
      pendingVideoStart = activePlanIndex + 1;
    } else if (activeStudyIndex > 0) {
      const previousStudyId = legacyStudyItems[activeStudyIndex - 1].id;
      pendingVideoStart = normalizedPlan.findIndex(
        (item) => item.kind === "study" && item.id === previousStudyId,
      ) + 1;
    } else {
      pendingVideoStart = 0;
    }
  } else if (legacyStudyItems.length > 0) {
    const lastStudyId = legacyStudyItems.at(-1).id;
    pendingVideoStart = normalizedPlan.findIndex(
      (item) => item.kind === "study" && item.id === lastStudyId,
    ) + 1;
  }

  const studyItemsById = new Map(
    legacyStudyItems.map((item) => [item.id, item]),
  );
  const items = normalizedPlan.map((item, index) =>
    item.kind === "study"
      ? { ...studyItemsById.get(item.id) }
      : {
          ...item,
          youtubeId: "",
          videoTitle: "",
          videoAuthorName: "",
          completed: index < pendingVideoStart,
          studySeconds: 0,
        },
  );
  return {
    run: normalizeStudyRoutineRun({ ...normalized, items }),
    changed: true,
  };
}

function createRoutineRunId() {
  return globalThis.crypto?.randomUUID?.() ??
    `routine-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createStudyRoutineRun(plan, studyDate, id = createRoutineRunId()) {
  const items = normalizeStudyRoutinePlan(plan).map((item) =>
    item.kind === "video"
      ? {
          ...item,
          youtubeId: "",
          videoTitle: "",
          videoAuthorName: "",
          completed: false,
          studySeconds: 0,
        }
      : {
          ...item,
          completedCount: 0,
          studySeconds: 0,
          ratingCounts: createEmptyRatingCounts(),
        },
  );
  return normalizeStudyRoutineRun({
    schemaVersion: 3,
    id,
    studyDate,
    currentIndex: 0,
    items,
  });
}

export function currentStudyRoutineItem(run) {
  const normalized = normalizeStudyRoutineRun(run);
  return normalized?.items[normalized.currentIndex] ?? null;
}

export function studyRoutineTotals(run) {
  const normalized = normalizeStudyRoutineRun(run);
  if (!normalized) {
    return {
      completed: 0,
      target: 0,
      studySeconds: 0,
      completedItems: 0,
      totalItems: 0,
      completedVideos: 0,
      totalVideos: 0,
    };
  }
  return normalized.items.reduce(
    (totals, item) => ({
      completed: totals.completed + (item.kind === "study" ? item.completedCount : 0),
      target: totals.target + (item.kind === "study" ? item.questionTarget : 0),
      studySeconds: totals.studySeconds + item.studySeconds,
      completedItems: totals.completedItems + (routineItemComplete(item) ? 1 : 0),
      totalItems: totals.totalItems + 1,
      completedVideos: totals.completedVideos +
        (item.kind === "video" && item.completed ? 1 : 0),
      totalVideos: totals.totalVideos + (item.kind === "video" ? 1 : 0),
    }),
    {
      completed: 0,
      target: 0,
      studySeconds: 0,
      completedItems: 0,
      totalItems: 0,
      completedVideos: 0,
      totalVideos: 0,
    },
  );
}

export function continueStudyRoutineOnDate(run, studyDate) {
  const normalized = normalizeStudyRoutineRun(run);
  const nextStudyDate = normalizeStudyDate(studyDate);
  return normalized && nextStudyDate
    ? { ...normalized, studyDate: nextStudyDate }
    : null;
}

function shuffledIds(ids, random) {
  const shuffled = [...ids];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomValue = Math.max(0, Math.min(0.999999999, Number(random()) || 0));
    const swapIndex = Math.floor(randomValue * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export function drawStudyRoutineVideo(
  videoLibrary,
  videoShuffle,
  random = Math.random,
) {
  const videos = normalizeStudyRoutineVideoLibrary(videoLibrary, {
    fallbackToDefault: false,
  });
  const shuffle = normalizeStudyRoutineVideoShuffle(videoShuffle, videos);
  if (videos.length === 0) {
    return { videoShuffle: shuffle, video: null, changed: false };
  }
  let remainingYoutubeIds = [...shuffle.remainingYoutubeIds];
  if (remainingYoutubeIds.length === 0) {
    remainingYoutubeIds = shuffledIds(
      videos.map((video) => video.youtubeId),
      random,
    );
    if (
      remainingYoutubeIds.length > 1 &&
      remainingYoutubeIds[0] === shuffle.lastYoutubeId
    ) {
      const swapIndex = remainingYoutubeIds.findIndex(
        (youtubeId) => youtubeId !== shuffle.lastYoutubeId,
      );
      [remainingYoutubeIds[0], remainingYoutubeIds[swapIndex]] =
        [remainingYoutubeIds[swapIndex], remainingYoutubeIds[0]];
    }
  }
  const youtubeId = remainingYoutubeIds.shift();
  const video = videos.find((candidate) => candidate.youtubeId === youtubeId);
  return {
    videoShuffle: {
      schemaVersion: 1,
      remainingYoutubeIds,
      lastYoutubeId: video.youtubeId,
    },
    video,
    changed: true,
  };
}

export function assignStudyRoutineVideo(
  run,
  videoLibrary,
  videoShuffle,
  random = Math.random,
) {
  const normalized = normalizeStudyRoutineRun(run);
  const item = currentStudyRoutineItem(normalized);
  const videos = normalizeStudyRoutineVideoLibrary(videoLibrary, {
    fallbackToDefault: false,
  });
  const shuffle = normalizeStudyRoutineVideoShuffle(videoShuffle, videos);
  if (!normalized || item?.kind !== "video") {
    return { run: normalized, videoShuffle: shuffle, video: null, changed: false };
  }
  if (item.youtubeId) {
    const savedVideo = videos.find((video) => video.youtubeId === item.youtubeId);
    return {
      run: normalized,
      videoShuffle: shuffle,
      video: savedVideo ?? {
        youtubeId: item.youtubeId,
        title: item.videoTitle || "YouTube動画",
        authorName: item.videoAuthorName,
      },
      changed: false,
    };
  }
  if (videos.length === 0) {
    return { run: normalized, videoShuffle: shuffle, video: null, changed: false };
  }
  const draw = drawStudyRoutineVideo(videos, shuffle, random);
  const video = draw.video;
  const items = normalized.items.map((candidate, index) =>
    index === normalized.currentIndex
      ? {
          ...candidate,
          youtubeId: video.youtubeId,
          videoTitle: video.title,
          videoAuthorName: video.authorName,
        }
      : { ...candidate },
  );
  return {
    run: { ...normalized, items },
    videoShuffle: draw.videoShuffle,
    video,
    changed: true,
  };
}

export function completeStudyRoutineVideo(run, studySeconds = 0) {
  const normalized = normalizeStudyRoutineRun(run);
  const item = currentStudyRoutineItem(normalized);
  if (!normalized || item?.kind !== "video" || !item.youtubeId || item.completed) {
    return {
      run: normalized,
      changed: false,
      completedItem: null,
      nextItem: item,
    };
  }
  const items = normalized.items.map((candidate, index) =>
    index === normalized.currentIndex
      ? {
          ...candidate,
          completed: true,
          studySeconds: Math.min(
            routineStudySecondsLimit,
            candidate.studySeconds + normalizeRoutineStudySeconds(studySeconds),
          ),
        }
      : { ...candidate },
  );
  const currentIndex = Math.min(items.length, normalized.currentIndex + 1);
  const next = { ...normalized, currentIndex, items };
  return {
    run: next,
    changed: true,
    completedItem: items[normalized.currentIndex],
    nextItem: items[currentIndex] ?? null,
  };
}

export function countsTowardStudyRoutine(rating = "") {
  return rating === "" ||
    (ratingValues.includes(rating) && rating !== "again");
}

export function recordStudyRoutineQuestion(
  run,
  subjectId,
  datasetVersion,
  questionId,
  studySeconds = 0,
  rating = "",
  { deferCompletion = false } = {},
) {
  const normalized = normalizeStudyRoutineRun(run);
  const item = currentStudyRoutineItem(normalized);
  const normalizedDatasetVersion = normalizeRoutineId(datasetVersion);
  const normalizedQuestionId = normalizeRoutineId(questionId);
  if (
    !normalized ||
    item?.kind !== "study" ||
    item.subjectId !== normalizeRoutineId(subjectId) ||
    !normalizedDatasetVersion ||
    !normalizedQuestionId
  ) {
    return {
      run: normalized,
      changed: false,
      counted: false,
      completedItem: null,
      nextItem: item,
    };
  }
  const counted =
    item.completedCount < item.questionTarget &&
    countsTowardStudyRoutine(rating);
  const addedStudySeconds = normalizeRoutineStudySeconds(studySeconds);
  const hasRating = ratingValues.includes(rating);
  const items = normalized.items.map((candidate, index) =>
    index === normalized.currentIndex
      ? (() => {
          const completedCount = Math.min(
            candidate.questionTarget,
            candidate.completedCount + (counted ? 1 : 0),
          );
          return {
            ...candidate,
            completedCount,
            overtimePending:
              completedCount >= candidate.questionTarget && deferCompletion,
            studySeconds: Math.min(
              routineStudySecondsLimit,
              candidate.studySeconds + addedStudySeconds,
            ),
            ratingCounts: hasRating
              ? addRatingCount(candidate.ratingCounts, rating)
              : normalizeRatingCounts(candidate.ratingCounts),
          };
        })()
      : { ...candidate },
  );
  const completedItem = items[normalized.currentIndex].completedCount >=
      items[normalized.currentIndex].questionTarget &&
      !items[normalized.currentIndex].overtimePending
    ? items[normalized.currentIndex]
    : null;
  const currentIndex = completedItem
    ? Math.min(items.length, normalized.currentIndex + 1)
    : normalized.currentIndex;
  const next = {
    ...normalized,
    currentIndex,
    items,
  };
  return {
    run: next,
    changed:
      counted ||
      addedStudySeconds > 0 ||
      hasRating ||
      (normalized.items[normalized.currentIndex].overtimePending &&
        Boolean(completedItem)),
    counted,
    completedItem,
    nextItem: next.items[next.currentIndex] ?? null,
  };
}
