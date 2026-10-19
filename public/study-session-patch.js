// 一周の途中記録を、前回保存した内容との違い（差分）だけでCloudflareへ送るための共通処理。
// ブラウザー側で差分を作り、保存窓口側で同じ規則で当てはめる。
// 途中記録には出題対象・出題順・未出題の一覧が入り、英単語8冊なら1回の保存が約700KBになる。
// 聞き流しでは1語ごとに保存するため、全体を送る方式では通信の往復が読み上げの間に追いつかず、
// 読み上げの間が単語を重ねるほど長くなっていた。差分なら1語あたり数百バイトで済む。

export const studySessionPatchVersion = 1;

// 差分で当てはめられる項目。これ以外の名前は無視し、特別な名前（__proto__など）も受け付けない。
export const studySessionPatchFields = Object.freeze([
  "roundId",
  "studyMode",
  "vocabularyStreamEnabled",
  "vocabularyStreamRows",
  "deckIds",
  "excludeTimeQuestions",
  "selectedQuestionTypes",
  "selectedStage",
  "questionAmountMode",
  "shuffleEnabled",
  "sequentialEnabled",
  "deckOrder",
  "questionLimit",
  "questionBatch",
  "questionLimitStart",
  "questionLimitRatings",
  "questionLimitSeconds",
  "autoSpeechEnabled",
  "filters",
  "termIds",
  "tasks",
  "queue",
  "currentTask",
  "unseenQuestionIds",
  "retryQuestionIds",
  "answeredCount",
  "ratingCounts",
  "studySeconds",
  "screenStudySeconds",
  "savedScreenStudySeconds",
  "studyTimeEventId",
  "answerVisible",
  "routineOvertimeEndsAt",
  "startedAt",
]);
const patchFieldSet = new Set(studySessionPatchFields);

// 一覧として差分を取る項目と、要素を見分ける名前。null は文字列の一覧。
const listFields = Object.freeze({
  tasks: "questionId",
  queue: "questionId",
  termIds: null,
  deckIds: null,
  unseenQuestionIds: null,
  retryQuestionIds: null,
});

function listKey(field, item) {
  const name = listFields[field];
  return name ? String(item?.[name] ?? "") : String(item ?? "");
}

function listOf(value) {
  return Array.isArray(value) ? value : [];
}

// 保存窓口とブラウザーが同じ途中記録を持っているかを、軽い要約で確かめる。
// 全体の文字列を比べると1回ごとに数百KBを作り直すことになるため、件数と要所の番号だけで比べる。
export function studySessionFingerprint(session) {
  if (!session || typeof session !== "object") return "";
  const tasks = listOf(session.tasks);
  const queue = listOf(session.queue);
  const unseen = listOf(session.unseenQuestionIds);
  const retry = listOf(session.retryQuestionIds);
  const rows = listOf(session.vocabularyStreamRows);
  const batch = session.questionBatch && typeof session.questionBatch === "object"
    ? session.questionBatch
    : null;
  const counts = session.ratingCounts && typeof session.ratingCounts === "object"
    ? session.ratingCounts
    : {};
  return [
    String(session.roundId ?? ""),
    String(session.studyMode ?? ""),
    tasks.length,
    listKey("tasks", tasks[0]),
    listKey("tasks", tasks[tasks.length - 1]),
    listOf(session.termIds).length,
    listOf(session.deckIds).length,
    queue.length,
    listKey("queue", queue[0]),
    listKey("queue", queue[queue.length - 1]),
    unseen.length,
    String(unseen[0] ?? ""),
    String(unseen[unseen.length - 1] ?? ""),
    retry.length,
    String(retry[0] ?? ""),
    String(retry[retry.length - 1] ?? ""),
    String(session.currentTask?.questionId ?? ""),
    Number(session.answeredCount) || 0,
    session.answerVisible === true ? 1 : 0,
    String(session.studyTimeEventId ?? ""),
    Number(session.studySeconds) || 0,
    Number(session.screenStudySeconds) || 0,
    Number(session.savedScreenStudySeconds) || 0,
    ["again", "hard", "good", "easy"].map((rating) => Number(counts[rating]) || 0).join("/"),
    rows
      .map((row) =>
        `${row?.questionId ?? ""}:${row?.rating ?? ""}:${row?.answerVisible === true ? 1 : 0}:${row?.activityId ?? ""}`,
      )
      .join(","),
    batch
      ? `${listOf(batch.questionIds).length}/${listOf(batch.completedQuestionIds).length}`
      : "-",
    session.vocabularyStreamEnabled === true ? 1 : 0,
    String(session.selectedStage ?? ""),
    String(session.questionLimit ?? ""),
  ].join("|");
}

function sameList(field, before, after) {
  if (before.length !== after.length) return false;
  for (let index = 0; index < before.length; index += 1) {
    if (listKey(field, before[index]) !== listKey(field, after[index])) return false;
  }
  return true;
}

// 一覧の変化を「消す・先頭に足す・末尾に足す」で表す。
// 変更後の一覧の中で、変更前と同じ並びのまま残っている最も長い続きの部分を「残す部分」とし、
// 変更前にあってそこに含まれない要素は消し、残す部分の前後にある要素は足す。位置が動いた要素は
// 消してから足し直す形になる。並びが大きく入れ替わって差分の方が長くなる時は一覧全体を送る。
function createListPatch(field, beforeValue, afterValue) {
  const before = listOf(beforeValue);
  const after = listOf(afterValue);
  if (sameList(field, before, after)) return null;
  const beforeIndex = new Map();
  before.forEach((item, index) => {
    const key = listKey(field, item);
    if (!beforeIndex.has(key)) beforeIndex.set(key, index);
  });
  const afterKeys = new Set();
  let unique = true;
  for (const item of after) {
    const key = listKey(field, item);
    if (afterKeys.has(key)) unique = false;
    afterKeys.add(key);
  }
  if (!unique) return { set: after };
  let bestStart = 0;
  let bestEnd = 0;
  let runStart = -1;
  let previousIndex = -1;
  for (let position = 0; position <= after.length; position += 1) {
    const index = position < after.length
      ? beforeIndex.get(listKey(field, after[position])) ?? -1
      : -1;
    const continues = index >= 0 && (runStart < 0 || index > previousIndex);
    if (!continues) {
      if (runStart >= 0 && position - runStart > bestEnd - bestStart) {
        bestStart = runStart;
        bestEnd = position;
      }
      runStart = index >= 0 ? position : -1;
    } else if (runStart < 0) {
      runStart = position;
    }
    previousIndex = index;
  }
  const keptKeys = new Set(
    after.slice(bestStart, bestEnd).map((item) => listKey(field, item)),
  );
  const remove = before
    .map((item) => listKey(field, item))
    .filter((key) => !keptKeys.has(key));
  const unshift = after.slice(0, bestStart);
  const push = after.slice(bestEnd);
  const operation = {};
  if (remove.length > 0) operation.remove = remove;
  if (unshift.length > 0) operation.unshift = unshift;
  if (push.length > 0) operation.push = push;
  if (JSON.stringify(operation).length < JSON.stringify(after).length) {
    return operation;
  }
  return { set: after };
}

function sameValue(before, after) {
  return JSON.stringify(before === undefined ? null : before) ===
    JSON.stringify(after === undefined ? null : after);
}

// 保存窓口が持っている途中記録（base）から、今の途中記録（next）へ変える差分を作る。
// 作れない時はnullを返し、呼び出し側は全体を送る。
export function createStudySessionPatch(base, next) {
  if (!base || typeof base !== "object" || !next || typeof next !== "object") return null;
  if (String(base.roundId ?? "") !== String(next.roundId ?? "")) return null;
  if (listOf(next.tasks).length === 0) return null;
  const set = {};
  const unset = [];
  const lists = {};
  for (const field of studySessionPatchFields) {
    const before = base[field];
    const after = next[field];
    if (Object.hasOwn(listFields, field)) {
      const operation = createListPatch(field, before, after);
      if (operation) lists[field] = operation;
      continue;
    }
    if (!Object.hasOwn(next, field) || after === undefined) {
      if (Object.hasOwn(base, field) && base[field] !== undefined) unset.push(field);
      continue;
    }
    if (!sameValue(before, after)) set[field] = after;
  }
  const patch = {
    version: studySessionPatchVersion,
    base: studySessionFingerprint(base),
    expect: studySessionFingerprint(next),
  };
  if (Object.keys(set).length > 0) patch.set = set;
  if (unset.length > 0) patch.unset = unset;
  if (Object.keys(lists).length > 0) patch.lists = lists;
  return patch;
}

function patchError(message, code) {
  return Object.assign(new Error(message), { code });
}

// 差分を途中記録へ当てはめる。前提が合わない時は理由付きの失敗にし、呼び出し側が全体の送り直しを求める。
// 返す内容は正規化前のため、保存窓口では既存の正規化処理に通してから保存する。
export function applyStudySessionPatch(base, patch) {
  if (!base || typeof base !== "object") {
    throw patchError("差分を当てはめる途中記録がありません。", "study-session-patch-missing");
  }
  if (!patch || typeof patch !== "object" || patch.version !== studySessionPatchVersion) {
    throw patchError("途中記録の差分の形式に対応していません。", "study-session-patch-version");
  }
  if (typeof patch.base !== "string" || patch.base !== studySessionFingerprint(base)) {
    throw patchError("途中記録の差分の前提が保存内容と一致しません。", "study-session-patch-base");
  }
  const next = {};
  for (const [field, value] of Object.entries(base)) {
    if (field !== "updatedAt") next[field] = value;
  }
  for (const field of listOf(patch.unset)) {
    if (patchFieldSet.has(field)) delete next[field];
  }
  const set = patch.set && typeof patch.set === "object" && !Array.isArray(patch.set) ? patch.set : {};
  for (const field of Object.keys(set)) {
    if (!patchFieldSet.has(field)) continue;
    next[field] = set[field];
  }
  const lists = patch.lists && typeof patch.lists === "object" && !Array.isArray(patch.lists)
    ? patch.lists
    : {};
  for (const field of Object.keys(lists)) {
    if (!Object.hasOwn(listFields, field)) continue;
    const operation = lists[field];
    if (!operation || typeof operation !== "object") continue;
    if (Array.isArray(operation.set)) {
      next[field] = operation.set;
      continue;
    }
    let items = listOf(next[field]);
    if (Array.isArray(operation.remove)) {
      const removed = new Set(operation.remove.map((key) => String(key)));
      items = items.filter((item) => !removed.has(listKey(field, item)));
    }
    next[field] = [...listOf(operation.unshift), ...items, ...listOf(operation.push)];
  }
  return next;
}

// 当てはめた結果がブラウザー側の途中記録と一致しているかを確かめる。
export function studySessionPatchMatches(patch, session) {
  return typeof patch?.expect === "string" && patch.expect === studySessionFingerprint(session);
}
