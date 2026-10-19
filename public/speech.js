import { requiredHistoryReadings } from "./reading-rules.js?v=0.417";
import {
  defaultSpeechSettings,
  getVoiceId,
  normalizeSpeechSettings,
} from "./speech-settings.js";

const annotatedReadingPattern =
  /([\p{Script=Han}\p{Script=Katakana}\p{Script=Latin}々ヶー0-9０-９]+)[(（]([\p{Script=Hiragana}ー・\s]+)[)）]/gu;
const remainingReadingPattern = /[(（][\p{Script=Hiragana}ー・\s]+[)）]/gu;
const fixedJapaneseSpeechReadings = Object.freeze({
  "戦い": "たたかい",
});

function applyFixedJapaneseSpeechReadings(value) {
  let text = value;
  for (const [written, reading] of Object.entries(fixedJapaneseSpeechReadings)) {
    text = text.replaceAll(written, reading);
  }
  return text;
}

function applyDynastySpeechReadings(value, additionalReadings = {}) {
  let text = value;
  for (const [written, reading] of readingEntries(additionalReadings)) {
    if (written.endsWith("朝") && reading.endsWith("ちょう")) {
      text = text.replaceAll(written, reading);
    }
  }
  return text.replace(/([\p{Script=Katakana}ー＝・])朝/gu, "$1ちょう");
}

// 読み補正の一覧は読み上げのたびに作り直すと重いため、同じ一覧には並べ替え済みの結果を使い回す。
const readingEntriesCache = new WeakMap();
const emptyReadingsKey = {};

function readingEntries(additionalReadings = {}) {
  const cacheKey =
    additionalReadings && typeof additionalReadings === "object"
      ? additionalReadings
      : emptyReadingsKey;
  const cached = readingEntriesCache.get(cacheKey);
  if (cached) return cached;
  const sorted = buildReadingEntries(additionalReadings);
  readingEntriesCache.set(cacheKey, sorted);
  return sorted;
}

function buildReadingEntries(additionalReadings = {}) {
  const entries =
    additionalReadings instanceof Map
      ? [...additionalReadings.entries()]
      : Object.entries(additionalReadings ?? {});
  const readings = new Map(Object.entries(requiredHistoryReadings));
  for (const [term, reading] of entries) {
    const normalizedTerm = String(term ?? "").trim();
    const normalizedReading = String(reading ?? "").trim();
    if (normalizedTerm && normalizedReading) {
      readings.set(normalizedTerm, normalizedReading);
    }
  }
  return [...readings.entries()].sort(
    ([left], [right]) => right.length - left.length,
  );
}

export function createHistorySpeechReadings(terms) {
  return Object.fromEntries(
    Array.from(terms ?? [])
      .flatMap((term) => [
        [
          String(term?.term ?? "").trim(),
          String(term?.reading ?? "").trim(),
        ],
        ...Object.entries(term?.speechReadings ?? {}),
      ])
      .filter(([term, reading]) => term && reading),
  );
}

export function prepareSpeechText(
  value,
  language = "ja-JP",
  additionalReadings = {},
) {
  let text = String(value ?? "").replaceAll("**", "");
  if (String(language).toLowerCase().startsWith("en")) {
    return text
      .replace(/[\r\n]+/g, ". ")
      .replace(/[|]/g, ", ")
      .replace(/[`#_]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // 保存済みの古い読みや括弧内の振り仮名より、利用者指定の発音を優先する。
  text = text.replace(/後ウマイヤ朝(?:[(（][\p{Script=Hiragana}ー・\s]+[)）])?/gu,
    requiredHistoryReadings["後ウマイヤ朝"]);
  for (const [term, reading] of readingEntries(additionalReadings)) {
    text = text.replaceAll(`${term}(${reading})`, reading);
  }

  return applyFixedJapaneseSpeechReadings(
    applyDynastySpeechReadings(
      text
        .replace(annotatedReadingPattern, (_, __, reading) => reading)
        .replace(remainingReadingPattern, ""),
      additionalReadings,
    ),
  )
    .replace(/[\r\n]+/g, "。")
    .replace(/[|]/g, "、")
    .replace(/〜/g, "から")
    .replace(/[`#_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function prepareMnemonicSpeechText(value) {
  return String(value ?? "")
    .split("|")
    .map((mnemonic) =>
      mnemonic
        .replaceAll("**", "")
        .split(/[\r\n]+/u)
        .map((line) => line.trim())
        .filter((line) => line && line !== "年号の語呂合わせ")
        .join(""),
    )
    .map((mnemonic) =>
      mnemonic
        .replace(/^年号の語呂合わせ\s*[。:：]?\s*/u, "")
        .replace(/^\s*(?=[^:：\r\n]*\d)[^:：\r\n]+[：:]\s*/u, "")
        .replace(
          /[（(]\s*(?=[^）)]*[0-9０-９])(?:紀元前|前|BC)?[0-9０-９年月日世紀千年紀頃代・.\-−〜～/~]+\s*[）)]/giu,
          "",
        )
        .replace(/[「」『』“”"]/gu, "")
        .replace(/[、，,\s]+/gu, "")
        .replace(/^[。:：]+|[。:：]+$/gu, "")
        .trim(),
    )
    .filter(Boolean)
    .join("。");
}

export function prepareMnemonicDisplayText(value) {
  return String(value ?? "")
    .split("|")
    .map((mnemonic) =>
      mnemonic
        .replaceAll("**", "")
        .split(/[\r\n]+/u)
        .map((line) => line.trim())
        .filter((line) => line && line !== "年号の語呂合わせ")
        .join(""),
    )
    .map((mnemonic) =>
      mnemonic
        .replace(/^年号の語呂合わせ\s*[。:：]?\s*/u, "")
        .replace(/^\s*(?=[^:：\r\n]*\d)[^:：\r\n]+[：:]\s*/u, "")
        .replace(/[「」『』“”"]/gu, "")
        .replace(/\s+/gu, " ")
        .trim(),
    )
    .filter(Boolean)
    .join(" ／ ");
}

export function selectVoice(voices, language, preferredVoiceId = "") {
  const candidates = Array.from(voices ?? []);
  const languagePrefix = String(language ?? "ja-JP").toLowerCase().split("-")[0];
  const exactLanguage = String(language ?? "ja-JP").toLowerCase();
  const preferred = candidates.find(
    (voice) =>
      String(voice.lang).toLowerCase().startsWith(languagePrefix) &&
      getVoiceId(voice) === preferredVoiceId,
  );
  return (
    preferred ??
    candidates.find(
      (voice) => String(voice.lang).toLowerCase() === exactLanguage,
    ) ??
    candidates.find((voice) =>
      String(voice.lang).toLowerCase().startsWith(languagePrefix),
    ) ??
    null
  );
}

export function selectJapaneseVoice(voices, preferredVoiceId = "") {
  return selectVoice(voices, "ja-JP", preferredVoiceId);
}

export const vocabularySpeechGroupOrder = [
  "word",
  "meaning",
  "example-english",
  "example-japanese",
];

export const vocabularySpeechLayoutByStage = {
  beginner: { question: "word", answer: "meaning" },
  reverse: { question: "meaning", answer: "word" },
  integrated: { question: "example-english", answer: "example-japanese" },
};

export function prepareVocabularyMeaningSpeechText(value) {
  return String(value ?? "").replace(/[〜～]/g, "");
}

export function prepareClassicalChineseSpeechText(value) {
  return String(value ?? "").replace(/[〜～]/gu, "ナニナニ");
}

export function createVocabularySpeechGroups(term, currentQuestion = null) {
  const beginnerQuestion = term?.stages?.beginner?.[0];
  if (currentQuestion?.editorModified) {
    const groups = createVocabularySpeechGroups(term);
    const layout = vocabularySpeechLayoutByStage[currentQuestion.stage];
    if (layout) for (const [side, text] of [["question", currentQuestion.prompt], ["answer", currentQuestion.answer]]) {
      const group = layout[side];
      groups[group] = { target: `vocabulary-${group}`, text: group === "meaning" ? prepareVocabularyMeaningSpeechText(text) : text,
        language: group === "word" || group === "example-english" ? "en-US" : "ja-JP" };
    }
    return groups;
  }
  if (!beginnerQuestion) {
    return {};
  }
  const questionSegments = beginnerQuestion.speech?.question ?? [];
  const answerSegments = beginnerQuestion.speech?.answer ?? [];
  const exampleSegments = answerSegments.slice(1);
  const segmentFor = (group, segment, fallbackText, fallbackLanguage) => ({
    target: `vocabulary-${group}`,
    text: segment?.text ?? fallbackText ?? "",
    language: segment?.language ?? fallbackLanguage,
  });
  const meaning = segmentFor(
    "meaning",
    answerSegments[0],
    beginnerQuestion.answer,
    "ja-JP",
  );
  meaning.text = prepareVocabularyMeaningSpeechText(meaning.text);
  return {
    word: segmentFor("word", questionSegments[0], term.term, "en-US"),
    meaning,
    "example-english": segmentFor(
      "example-english",
      exampleSegments.find((segment) =>
        String(segment?.language).toLowerCase().startsWith("en"),
      ),
      "",
      "en-US",
    ),
    "example-japanese": segmentFor(
      "example-japanese",
      exampleSegments.find((segment) =>
        String(segment?.language).toLowerCase().startsWith("ja"),
      ),
      "",
      "ja-JP",
    ),
  };
}

export function createVocabularyAutomaticAnswerSequence(
  term,
  stage,
  {
    answer = true,
    exampleEnglish = false,
    exampleJapanese = false,
    question = null,
  } = {},
) {
  const layout = vocabularySpeechLayoutByStage[stage];
  if (!layout) {
    return [];
  }
  const groups = createVocabularySpeechGroups(term, question);
  const supplementalGroups = [
    ...(exampleEnglish ? ["example-english"] : []),
    ...(exampleJapanese ? ["example-japanese"] : []),
  ].filter(
    (group) => group !== layout.question && group !== layout.answer,
  );
  const groupNames = [...(answer ? [layout.answer] : []), ...supplementalGroups];
  return [...new Set(groupNames)]
    .map((group) => groups[group])
    .filter((segment) => segment?.text);
}

// 復号した波形から、声の始まりと終わりの位置を探す。MP3の詰め物やAzureが残した無音を
// 再生で飛ばすために使う。しきい値は語尾の「s」「f」のような小さな音も声として残る大きさにする。
export const audioSilenceThreshold = 0.004;

export function findAudioBounds(samples, sampleRate, threshold = audioSilenceThreshold) {
  const length = Number(samples?.length ?? 0);
  const rate = Number(sampleRate);
  if (!length || !Number.isFinite(rate) || rate <= 0) return null;
  let first = -1;
  for (let index = 0; index < length; index += 1) {
    if (Math.abs(samples[index]) > threshold) {
      first = index;
      break;
    }
  }
  const durationSeconds = length / rate;
  if (first < 0) {
    return { leadSeconds: 0, soundEndSeconds: durationSeconds, tailSeconds: 0, durationSeconds };
  }
  let last = length - 1;
  while (last > first && Math.abs(samples[last]) <= threshold) last -= 1;
  const soundEndSeconds = (last + 1) / rate;
  return {
    leadSeconds: first / rate,
    soundEndSeconds,
    tailSeconds: Math.max(0, durationSeconds - soundEndSeconds),
    durationSeconds,
  };
}

// 解析は音を出さない復号専用の処理で行い、端末の音声出力やiPhoneの消音スイッチの扱いに影響させない。
const maximumAnalyzedAudioBytes = 600_000;
let sharedOfflineAudioContext = null;
let offlineAudioUnavailable = false;

async function decodeCloudAudioBounds(blob) {
  const Offline =
    globalThis.OfflineAudioContext ?? globalThis.webkitOfflineAudioContext;
  if (
    offlineAudioUnavailable ||
    typeof Offline !== "function" ||
    typeof blob?.arrayBuffer !== "function" ||
    Number(blob.size) > maximumAnalyzedAudioBytes
  ) {
    return null;
  }
  try {
    sharedOfflineAudioContext ??= new Offline(1, 1, 48000);
  } catch {
    offlineAudioUnavailable = true;
    return null;
  }
  const encoded = await blob.arrayBuffer();
  const decoded = await new Promise((resolve, reject) => {
    const result = sharedOfflineAudioContext.decodeAudioData(encoded, resolve, reject);
    if (result && typeof result.then === "function") result.then(resolve, reject);
  });
  return findAudioBounds(decoded.getChannelData(0), decoded.sampleRate);
}

export function createSpeechController({
  synthesis = globalThis.speechSynthesis,
  Utterance = globalThis.SpeechSynthesisUtterance,
  AudioPlayer = globalThis.Audio,
  createObjectUrl = (audio) => globalThis.URL.createObjectURL(audio),
  revokeObjectUrl = (url) => globalThis.URL.revokeObjectURL(url),
  requestCloudAudio = null,
  getSettings = () => defaultSpeechSettings,
  getHistoryReadings = () => ({}),
  // 聞き流しで問題・回答・次の問題がつながるよう、Azure音声の前後の無音を削る。
  trimCloudSilence = true,
  onTargetChange = () => {},
  onFallback = () => {},
  deviceStartTimeoutMs = 1500,
  cloudStartTimeoutMs = 3000,
  cloudPlaybackTimeoutMs = 60000,
  decodeAudioBounds = decodeCloudAudioBounds,
  // 飛ばす価値のある無音の長さと、声を欠けさせないための余白。
  minimumSkippedSilenceSeconds = 0.05,
  leadSilenceMarginSeconds = 0.015,
  tailSilenceMarginSeconds = 0.03,
} = {}) {
  const deviceSupported = Boolean(
    synthesis &&
      typeof synthesis.speak === "function" &&
      typeof synthesis.cancel === "function" &&
      typeof Utterance === "function",
  );
  const cloudSupported = Boolean(
    typeof requestCloudAudio === "function" &&
      typeof AudioPlayer === "function" &&
      typeof createObjectUrl === "function" &&
      typeof revokeObjectUrl === "function",
  );
  const supported = deviceSupported || cloudSupported;
  let generation = 0;
  let currentTarget = "";
  let activeAudio = null;
  let activeAudioUrl = "";
  // 自然音声の再生器は2台を交互に使う。片方が鳴っている間にもう片方へ次の音声を
  // 読み込んでおき、切り替え時の読み込み待ちをなくす。
  const cloudAudioPool = [];
  const cloudAudioPoolSize = 2;
  const blessedCloudAudios = new WeakSet();
  let lastActiveAudioIndex = -1;
  const stagedByAudio = new Map();
  let stagedHint = null;
  let activeQueue = null;
  const audioBoundsByBlob = new WeakMap();
  const audioBoundsPending = new WeakMap();
  let activeCloudCancel = null;
  let playbackPaused = false;
  let activePlaybackType = "";
  let activePlaybackPause = null;
  let activePlaybackResume = null;
  let pausedContinuation = null;
  const cloudAudioCache = new Map();
  const readyCloudAudioBlobs = new WeakMap();
  const cloudAudioCacheLimit = 24;
  const scheduleContinuation =
    typeof globalThis.queueMicrotask === "function"
      ? (callback) => globalThis.queueMicrotask(callback)
      : (callback) => Promise.resolve().then(callback);

  function setCurrentTarget(target) {
    currentTarget = target;
    onTargetChange(target);
  }

  function resetPlayback(cancelDevice = true) {
    generation += 1;
    playbackPaused = false;
    activePlaybackType = "";
    activePlaybackPause = null;
    activePlaybackResume = null;
    pausedContinuation = null;
    activeQueue = null;
    if (deviceSupported && cancelDevice) {
      synthesis.cancel();
    }
    if (activeCloudCancel) {
      const cancel = activeCloudCancel;
      activeCloudCancel = null;
      cancel();
    } else if (activeAudio) {
      activeAudio.onplaying = null;
      activeAudio.onended = null;
      activeAudio.onerror = null;
      activeAudio.pause?.();
      activeAudio = null;
    }
    if (activeAudioUrl) {
      revokeObjectUrl(activeAudioUrl);
      activeAudioUrl = "";
    }
    setCurrentTarget("");
  }

  function stop() {
    resetPlayback();
  }

  function pause() {
    if (!currentTarget) {
      return false;
    }
    if (playbackPaused) {
      return true;
    }
    if (
      activePlaybackType === "device" &&
      typeof activePlaybackPause !== "function"
    ) {
      return false;
    }
    playbackPaused = true;
    try {
      activePlaybackPause?.();
      return true;
    } catch {
      playbackPaused = false;
      return false;
    }
  }

  function resume() {
    if (!playbackPaused) {
      return false;
    }
    const hadPausedPlayback = Boolean(
      currentTarget || activePlaybackResume || pausedContinuation,
    );
    playbackPaused = false;
    try {
      activePlaybackResume?.();
    } catch {
      return false;
    }
    if (pausedContinuation) {
      const continuation = pausedContinuation;
      pausedContinuation = null;
      scheduleContinuation(() => {
        if (!playbackPaused) {
          continuation();
        }
      });
    }
    return hadPausedPlayback;
  }

  function clearPlaybackControls(pauseHandler, resumeHandler) {
    const ownsControls =
      activePlaybackPause === pauseHandler ||
      activePlaybackResume === resumeHandler;
    if (activePlaybackPause === pauseHandler) {
      activePlaybackPause = null;
    }
    if (activePlaybackResume === resumeHandler) {
      activePlaybackResume = null;
    }
    if (ownsControls) {
      activePlaybackType = "";
    }
  }

  function ensureCloudAudio() {
    while (cloudAudioPool.length < cloudAudioPoolSize) {
      const audio = new AudioPlayer();
      audio.preload = "auto";
      cloudAudioPool.push(audio);
    }
    return cloudAudioPool;
  }

  // 鳴っていない方の再生器。どちらも空いていれば、前回使わなかった方を選ぶ。
  function idleCloudAudio() {
    const pool = ensureCloudAudio();
    for (let offset = 1; offset <= pool.length; offset += 1) {
      const audio = pool[(lastActiveAudioIndex + offset) % pool.length];
      if (audio !== activeAudio) return audio;
    }
    return null;
  }

  function analysisFor(blob) {
    return blob ? audioBoundsByBlob.get(blob) ?? null : null;
  }

  function analyzeCloudAudio(blob) {
    if (!blob) return Promise.resolve(null);
    if (audioBoundsByBlob.has(blob)) return Promise.resolve(analysisFor(blob));
    const pending = audioBoundsPending.get(blob);
    if (pending) return pending;
    const promise = Promise.resolve()
      .then(() => decodeAudioBounds(blob))
      .then((bounds) => bounds ?? null)
      .catch(() => null)
      .then((bounds) => {
        audioBoundsByBlob.set(blob, bounds);
        audioBoundsPending.delete(blob);
        return bounds;
      });
    audioBoundsPending.set(blob, promise);
    return promise;
  }

  function clearStaging(audio) {
    const entry = stagedByAudio.get(audio);
    if (!entry) return;
    stagedByAudio.delete(audio);
    try {
      audio.onloadedmetadata = null;
    } catch {}
    if (!entry.url) return;
    revokeObjectUrl(entry.url);
    try {
      if (typeof audio.removeAttribute === "function") {
        audio.removeAttribute("src");
      } else {
        audio.src = "";
      }
      audio.load?.();
    } catch {}
  }

  // 読み込み済みの再生器の位置を、声の始まる直前へ進めておく。
  function applyLeadSkip(audio, entry) {
    const lead = entry.analysis?.leadSeconds;
    if (!(lead > minimumSkippedSilenceSeconds) || entry.seekApplied) return;
    const seek = () => {
      if (stagedByAudio.get(audio) !== entry || entry.seekApplied) return;
      try {
        audio.currentTime = Math.max(0, lead - leadSilenceMarginSeconds);
        entry.seekApplied = true;
      } catch {}
    };
    if (Number(audio.readyState) >= 1) {
      seek();
    } else {
      try {
        audio.onloadedmetadata = seek;
      } catch {}
    }
  }

  // 空いている再生器へ次の音声を読み込んでおく。同じ音声が入っていれば何もしない。
  function stageSegment(audio, segment, settings) {
    const cacheKey = cloudAudioCacheKey(segment, settings);
    if (stagedByAudio.get(audio)?.cacheKey === cacheKey) return;
    clearStaging(audio);
    const entry = {
      cacheKey,
      blob: null,
      url: "",
      ready: false,
      analysis: null,
      seekApplied: false,
    };
    stagedByAudio.set(audio, entry);
    const apply = (blob) => {
      if (stagedByAudio.get(audio) !== entry || activeAudio === audio) return;
      try {
        const url = createObjectUrl(blob);
        entry.blob = blob;
        entry.url = url;
        audio.src = url;
        audio.load?.();
        entry.ready = true;
      } catch {
        stagedByAudio.delete(audio);
        return;
      }
      void analyzeCloudAudio(blob).then((bounds) => {
        if (stagedByAudio.get(audio) !== entry) return;
        entry.analysis = bounds;
        applyLeadSkip(audio, entry);
      });
    };
    const ready = readyCloudAudio(segment, settings);
    if (ready) {
      apply(ready);
      return;
    }
    loadCloudAudio(segment, settings).then(apply, () => {
      if (stagedByAudio.get(audio) === entry) stagedByAudio.delete(audio);
    });
  }

  // 今の列の残り、なければ利用者側から知らされた次の読み上げを、空いている再生器へ読み込む。
  function stageUpcoming(queue = activeQueue) {
    if (!cloudSupported) return;
    const nextSegment = queue?.[0] ?? stagedHint?.[0] ?? null;
    if (!nextSegment) return;
    const settings = normalizeSpeechSettings(getSettings());
    if (settings.source !== "cloud") return;
    const audio = idleCloudAudio();
    if (audio) stageSegment(audio, nextSegment, settings);
  }

  // 次に読み上げる予定の内容を知らせる。取り寄せと再生器への読み込みを先に済ませておく。
  function stage(segments) {
    if (!cloudSupported) return false;
    const settings = normalizeSpeechSettings(getSettings());
    if (settings.source !== "cloud") return false;
    const hint = normalizedSegments(segments);
    if (hint.length === 0) {
      stagedHint = null;
      return false;
    }
    stagedHint = hint;
    void preloadNormalized(hint, settings);
    stageUpcoming();
    return true;
  }

  function takeStaged(audio, segment, settings) {
    const entry = stagedByAudio.get(audio);
    if (!entry?.ready || entry.cacheKey !== cloudAudioCacheKey(segment, settings)) {
      return null;
    }
    stagedByAudio.delete(audio);
    try {
      audio.onloadedmetadata = null;
    } catch {}
    return entry;
  }

  function unlock() {
    if (!cloudSupported) {
      return false;
    }
    try {
      // 利用者の操作の中で一度読み込みを行った再生器は、以後は操作なしでも再生できる。
      // 2台とも許可しておき、どちらへ切り替えても自動再生が止まらないようにする。
      for (const audio of ensureCloudAudio()) {
        if (audio === activeAudio || blessedCloudAudios.has(audio)) continue;
        clearStaging(audio);
        audio.load?.();
        blessedCloudAudios.add(audio);
      }
      return true;
    } catch (error) {
      onFallback(
        error instanceof Error
          ? error
          : new Error("自然音声の再生準備に失敗しました。"),
      );
      return false;
    }
  }

  function normalizedSegments(segments) {
    return Array.from(segments ?? [])
      .map((segment) => ({
        target: String(segment?.target ?? ""),
        language: String(segment?.language ?? "ja-JP"),
        text: prepareSpeechText(
          segment?.text,
          String(segment?.language ?? "ja-JP"),
          getHistoryReadings(),
        ),
      }))
      .filter((segment) => segment.target && segment.text);
  }

  function cloudVoiceFor(segment, settings) {
    return segment.language.toLowerCase().startsWith("en")
      ? settings.englishAzureVoiceId
      : settings.azureVoiceId;
  }

  function cloudAudioCacheKey(segment, settings) {
    return JSON.stringify([
      segment.text,
      cloudVoiceFor(segment, settings),
      segment.language,
      Boolean(trimCloudSilence),
    ]);
  }

  // 取り寄せ済みの音声は待たずに渡し、次の音声をその場で再生し始められるようにする。
  function readyCloudAudio(segment, settings) {
    const cacheKey = cloudAudioCacheKey(segment, settings);
    const request = cloudAudioCache.get(cacheKey);
    const blob = request ? readyCloudAudioBlobs.get(request) : null;
    if (!blob) return null;
    cloudAudioCache.delete(cacheKey);
    cloudAudioCache.set(cacheKey, request);
    return blob;
  }

  function loadCloudAudio(segment, settings) {
    const voice = cloudVoiceFor(segment, settings);
    const trimSilence = Boolean(trimCloudSilence);
    const cacheKey = cloudAudioCacheKey(segment, settings);
    const cached = cloudAudioCache.get(cacheKey);
    if (cached) {
      cloudAudioCache.delete(cacheKey);
      cloudAudioCache.set(cacheKey, cached);
      return cached;
    }

    const request = Promise.resolve()
      .then(() =>
        requestCloudAudio(segment.text, voice, segment.language, {
          trimSilence,
        }),
      )
      .then((blob) => {
        readyCloudAudioBlobs.set(request, blob);
        void analyzeCloudAudio(blob);
        return blob;
      })
      .catch((error) => {
        if (cloudAudioCache.get(cacheKey) === request) {
          cloudAudioCache.delete(cacheKey);
        }
        throw error;
      });
    cloudAudioCache.set(cacheKey, request);
    while (cloudAudioCache.size > cloudAudioCacheLimit) {
      cloudAudioCache.delete(cloudAudioCache.keys().next().value);
    }
    return request;
  }

  function preloadNormalized(queue, settings) {
    return Promise.allSettled(
      queue.map((segment) => loadCloudAudio(segment, settings)),
    );
  }

  function preload(segments) {
    if (!cloudSupported) {
      return Promise.resolve([]);
    }
    const settings = normalizeSpeechSettings(getSettings());
    if (settings.source !== "cloud") {
      return Promise.resolve([]);
    }
    return preloadNormalized(normalizedSegments(segments), settings);
  }

  function speak(
    segments,
    { onComplete = () => {}, onError = () => {} } = {},
  ) {
    if (!supported) {
      return false;
    }
    const queue = normalizedSegments(segments);
    if (queue.length === 0) {
      stop();
      return false;
    }

    resetPlayback();
    const ticket = ++generation;
    activeQueue = queue;
    stagedHint = null;
    void preload(queue);

    function continueAfterPlayback(callback) {
      scheduleContinuation(() => {
        if (ticket === generation) {
          if (playbackPaused) {
            pausedContinuation = callback;
            return;
          }
          callback();
        }
      });
    }

    function failPlayback(error) {
      if (ticket !== generation) {
        return;
      }
      setCurrentTarget("");
      onError(
        error instanceof Error
          ? error
          : new Error("音声を再生できませんでした。"),
      );
    }

    function finishCloudAudio(audio, audioUrl) {
      if (activeAudio === audio) {
        activeAudio = null;
      }
      if (activeAudioUrl === audioUrl) {
        activeAudioUrl = "";
      }
      audio.onended = null;
      audio.onerror = null;
      audio.onplaying = null;
      audio.pause?.();
      revokeObjectUrl(audioUrl);
      try {
        if (typeof audio.removeAttribute === "function") {
          audio.removeAttribute("src");
        } else {
          audio.src = "";
        }
        audio.load?.();
      } catch {}
    }

    function speakWithDevice(
      segment,
      settings,
      done,
      fail,
      retryCount = 0,
    ) {
      if (ticket !== generation) {
        return;
      }
      activePlaybackType = "device";
      if (!deviceSupported) {
        fail(new Error("端末音声を利用できません。"));
        return;
      }
      const utterance = new Utterance(segment.text);
      utterance.lang = segment.language;
      utterance.rate = settings.rate;
      const preferredVoiceId = segment.language.toLowerCase().startsWith("en")
        ? settings.englishVoiceId
        : settings.voiceId;
      const voice = selectVoice(
        synthesis.getVoices?.() ?? [],
        segment.language,
        preferredVoiceId,
      );
      if (voice) {
        utterance.voice = voice;
      }
      let finished = false;
      let started = false;
      let startTimer = null;
      const clearStartTimer = () => {
        if (startTimer !== null) {
          globalThis.clearTimeout(startTimer);
          startTimer = null;
        }
      };
      const markStarted = () => {
        started = true;
        clearStartTimer();
      };
      const armStartTimer = () => {
        clearStartTimer();
        if (playbackPaused || started) {
          return;
        }
        const startTimeoutMs = Number(deviceStartTimeoutMs);
        if (Number.isFinite(startTimeoutMs) && startTimeoutMs >= 0) {
          startTimer = globalThis.setTimeout(
            handleStartTimeout,
            startTimeoutMs,
          );
        }
      };
      const pausePlayback = () => {
        clearStartTimer();
        synthesis.pause?.();
      };
      const resumePlayback = () => {
        synthesis.resume?.();
        armStartTimer();
      };
      const finish = () => {
        if (finished) {
          return;
        }
        markStarted();
        finished = true;
        clearPlaybackControls(pausePlayback, resumePlayback);
        continueAfterPlayback(done);
      };
      const retryOrFail = (error) => {
        if (finished || ticket !== generation) {
          return;
        }
        finished = true;
        clearStartTimer();
        utterance.onstart = null;
        utterance.onboundary = null;
        utterance.onend = null;
        utterance.onerror = null;
        synthesis.cancel();
        clearPlaybackControls(pausePlayback, resumePlayback);
        if (retryCount < 1) {
          globalThis.setTimeout(() => {
            if (ticket === generation) {
              speakWithDevice(
                segment,
                settings,
                done,
                fail,
                retryCount + 1,
              );
            }
          }, 0);
          return;
        }
        continueAfterPlayback(() =>
          fail(
            error instanceof Error
              ? error
              : new Error("端末音声の再生を開始できませんでした。"),
          ),
        );
      };
      const handleStartTimeout = () => {
        if (synthesis.speaking === true) {
          markStarted();
          return;
        }
        retryOrFail(
          new Error("端末音声の再生を開始できませんでした。"),
        );
      };
      utterance.onstart = markStarted;
      utterance.onboundary = markStarted;
      utterance.onend = finish;
      utterance.onerror = () =>
        retryOrFail(new Error("端末音声の再生中に問題が発生しました。"));
      const canPauseAndResume =
        typeof synthesis.pause === "function" &&
        typeof synthesis.resume === "function";
      activePlaybackPause = canPauseAndResume ? pausePlayback : null;
      activePlaybackResume = canPauseAndResume ? resumePlayback : null;
      armStartTimer();
      try {
        if (playbackPaused) {
          synthesis.pause?.();
        } else {
          synthesis.resume?.();
        }
        synthesis.speak(utterance);
      } catch {
        retryOrFail(new Error("端末音声の再生を開始できませんでした。"));
      }
    }

    async function speakWithCloud(segment, settings, done, fail) {
      activePlaybackType = "cloud";
      if (!cloudSupported || ticket !== generation) {
        onFallback(new Error("Azure音声を利用できません。"));
        speakWithDevice(segment, settings, done, fail);
        return;
      }
      let reservedAudio = null;
      try {
        const audio = idleCloudAudio();
        // この再生器を使う予定にし、待っている間に次の音声の読み込み先へ選ばれないようにする。
        reservedAudio = audio;
        activeAudio = audio;
        lastActiveAudioIndex = cloudAudioPool.indexOf(audio);
        // 空いている再生器へ読み込み済みなら、通信も読み込みも待たずにそのまま鳴らす。
        const staged = takeStaged(audio, segment, settings);
        let blob = staged?.blob ?? null;
        let audioUrl = staged?.url ?? "";
        if (!staged) {
          clearStaging(audio);
          blob =
            readyCloudAudio(segment, settings) ??
            (await loadCloudAudio(segment, settings));
          if (ticket !== generation) {
            return;
          }
          clearStaging(audio);
          audioUrl = createObjectUrl(blob);
        }
        activeAudioUrl = audioUrl;
        let finished = false;
        let playAttempt = 0;
        let startTimer = null;
        let playbackTimer = null;
        let earlyFinishTimer = null;
        const clearEarlyFinishTimer = () => {
          if (earlyFinishTimer !== null) {
            globalThis.clearTimeout(earlyFinishTimer);
            earlyFinishTimer = null;
          }
        };
        // 声が終わった後の無音は待たず、終わりの位置に合わせて次へ進む。
        const armEarlyFinish = () => {
          clearEarlyFinishTimer();
          const bounds = analysisFor(blob);
          const position = Number(audio.currentTime);
          if (
            !bounds ||
            !(bounds.tailSeconds > minimumSkippedSilenceSeconds) ||
            !Number.isFinite(position)
          ) {
            return;
          }
          const rate = Number(audio.playbackRate) > 0 ? Number(audio.playbackRate) : 1;
          const remainingSeconds =
            Math.max(0, bounds.soundEndSeconds + tailSilenceMarginSeconds - position) / rate;
          earlyFinishTimer = globalThis.setTimeout(() => {
            earlyFinishTimer = null;
            if (!finished && !playbackPaused && ticket === generation) {
              finish();
            }
          }, remainingSeconds * 1000);
        };
        const clearStartTimer = () => {
          if (startTimer !== null) {
            globalThis.clearTimeout(startTimer);
            startTimer = null;
          }
        };
        const clearPlaybackTimer = () => {
          if (playbackTimer !== null) {
            globalThis.clearTimeout(playbackTimer);
            playbackTimer = null;
          }
        };
        const clearPlaybackTimers = () => {
          clearStartTimer();
          clearPlaybackTimer();
          clearEarlyFinishTimer();
        };
        const armPlaybackTimer = () => {
          clearStartTimer();
          const minimumTimeoutMs = Number(cloudPlaybackTimeoutMs);
          if (!Number.isFinite(minimumTimeoutMs) || minimumTimeoutMs < 0) {
            return;
          }
          const durationSeconds = Number(audio.duration);
          const rate = Number(audio.playbackRate);
          const expectedTimeoutMs =
            Number.isFinite(durationSeconds) && durationSeconds > 0
              ? (durationSeconds / (Number.isFinite(rate) && rate > 0 ? rate : 1)) *
                  1000 +
                5000
              : 0;
          playbackTimer = globalThis.setTimeout(() => {
            fallback(new Error("自然音声の再生が完了しませんでした。"));
          }, Math.max(minimumTimeoutMs, expectedTimeoutMs));
        };
        const clearCloudControls = () => {
          clearPlaybackControls(pausePlayback, resumePlayback);
        };
        const finish = () => {
          if (finished) {
            return;
          }
          finished = true;
          clearPlaybackTimers();
          if (activeCloudCancel === cancel) {
            activeCloudCancel = null;
          }
          clearCloudControls();
          finishCloudAudio(audio, audioUrl);
          continueAfterPlayback(done);
        };
        const fallback = (error) => {
          if (finished) {
            return;
          }
          finished = true;
          clearPlaybackTimers();
          if (activeCloudCancel === cancel) {
            activeCloudCancel = null;
          }
          clearCloudControls();
          finishCloudAudio(audio, audioUrl);
          onFallback(error instanceof Error ? error : new Error("音声を再生できません。"));
          if (error?.name === "NotAllowedError") {
            continueAfterPlayback(() => fail(error));
            return;
          }
          continueAfterPlayback(() =>
            speakWithDevice(segment, settings, done, fail),
          );
        };
        const cancel = () => {
          if (finished) {
            return;
          }
          finished = true;
          clearPlaybackTimers();
          playAttempt += 1;
          clearCloudControls();
          finishCloudAudio(audio, audioUrl);
        };
        const armStartTimer = () => {
          clearStartTimer();
          if (playbackPaused) {
            return;
          }
          const startTimeoutMs = Number(cloudStartTimeoutMs);
          if (Number.isFinite(startTimeoutMs) && startTimeoutMs >= 0) {
            startTimer = globalThis.setTimeout(() => {
              fallback(new Error("自然音声の再生を開始できませんでした。"));
            }, startTimeoutMs);
          }
        };
        const beginPlayback = () => {
          if (finished || ticket !== generation || playbackPaused) {
            return;
          }
          const attempt = ++playAttempt;
          armStartTimer();
          try {
            Promise.resolve(audio.play()).catch((error) => {
              if (
                attempt === playAttempt &&
                !playbackPaused &&
                !finished &&
                ticket === generation
              ) {
                fallback(error);
              }
            });
          } catch (error) {
            if (attempt === playAttempt && !playbackPaused) {
              fallback(error);
            }
          }
        };
        const pausePlayback = () => {
          playAttempt += 1;
          clearPlaybackTimers();
          audio.pause?.();
        };
        const resumePlayback = () => {
          beginPlayback();
        };
        activeCloudCancel = cancel;
        activePlaybackPause = pausePlayback;
        activePlaybackResume = resumePlayback;
        audio.onplaying = () => {
          if (playbackPaused) {
            audio.pause?.();
            return;
          }
          armPlaybackTimer();
          armEarlyFinish();
          // 鳴り始めたら、もう片方の再生器へ次の音声を読み込んでおく。
          stageUpcoming(queue);
        };
        audio.onended = finish;
        audio.onerror = fallback;
        try {
          if (!staged) {
            audio.src = audioUrl;
            audio.load?.();
          }
          audio.defaultPlaybackRate = settings.rate;
          audio.playbackRate = settings.rate;
        } catch (error) {
          fallback(error);
          return;
        }
        beginPlayback();
      } catch (error) {
        if (reservedAudio && activeAudio === reservedAudio) {
          activeAudio = null;
        }
        if (ticket !== generation) {
          return;
        }
        onFallback(error instanceof Error ? error : new Error("Azure音声を利用できません。"));
        speakWithDevice(segment, settings, done, fail);
      }
    }

    function speakNext() {
      if (ticket !== generation) {
        return;
      }
      const segment = queue.shift();
      if (!segment) {
        setCurrentTarget("");
        onComplete();
        return;
      }

      setCurrentTarget(segment.target);
      const settings = normalizeSpeechSettings(getSettings());
      if (settings.source === "cloud") {
        void speakWithCloud(segment, settings, speakNext, failPlayback);
      } else {
        speakWithDevice(segment, settings, speakNext, failPlayback);
      }
    }

    speakNext();
    return true;
  }

  return {
    supported,
    deviceSupported,
    cloudSupported,
    get currentTarget() {
      return currentTarget;
    },
    get paused() {
      return playbackPaused;
    },
    preload,
    stage,
    speak,
    stop,
    pause,
    resume,
    unlock,
  };
}
