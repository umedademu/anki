import { requiredHistoryReadings } from "./reading-rules.js";
import {
  defaultSpeechSettings,
  getVoiceId,
  normalizeSpeechSettings,
} from "./speech-settings.js";

const annotatedReadingPattern =
  /([\p{Script=Han}\p{Script=Katakana}\p{Script=Latin}々ヶー0-9０-９]+)\(([\p{Script=Hiragana}ー・\s]+)\)/gu;
const remainingReadingPattern = /\([\p{Script=Hiragana}ー・\s]+\)/gu;
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

function readingEntries(additionalReadings = {}) {
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

  for (const [term, reading] of readingEntries(additionalReadings)) {
    text = text.replaceAll(`${term}(${reading})`, reading);
  }

  return applyFixedJapaneseSpeechReadings(
    text
      .replace(annotatedReadingPattern, (_, __, reading) => reading)
      .replace(remainingReadingPattern, ""),
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

export function createVocabularySpeechGroups(term) {
  const beginnerQuestion = term?.stages?.beginner?.[0];
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
  } = {},
) {
  const layout = vocabularySpeechLayoutByStage[stage];
  if (!layout) {
    return [];
  }
  const groups = createVocabularySpeechGroups(term);
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

export function createSpeechController({
  synthesis = globalThis.speechSynthesis,
  Utterance = globalThis.SpeechSynthesisUtterance,
  AudioPlayer = globalThis.Audio,
  createObjectUrl = (audio) => globalThis.URL.createObjectURL(audio),
  revokeObjectUrl = (url) => globalThis.URL.revokeObjectURL(url),
  requestCloudAudio = null,
  audioOutput = null,
  getSettings = () => defaultSpeechSettings,
  getHistoryReadings = () => ({}),
  onTargetChange = () => {},
  onFallback = () => {},
  deviceStartTimeoutMs = 1500,
  cloudStartTimeoutMs = 3000,
} = {}) {
  const deviceSupported = Boolean(
    synthesis &&
      typeof synthesis.speak === "function" &&
      typeof synthesis.cancel === "function" &&
      typeof Utterance === "function",
  );
  const sharedCloudSupported = Boolean(
    audioOutput &&
      typeof audioOutput.getContext === "function" &&
      typeof audioOutput.resume === "function" &&
      typeof audioOutput.decode === "function",
  );
  const legacyCloudSupported = Boolean(
    typeof AudioPlayer === "function" &&
      typeof createObjectUrl === "function" &&
      typeof revokeObjectUrl === "function",
  );
  const cloudSupported = Boolean(
    typeof requestCloudAudio === "function" &&
      (sharedCloudSupported || legacyCloudSupported),
  );
  const supported = deviceSupported || cloudSupported;
  let generation = 0;
  let currentTarget = "";
  let activeAudio = null;
  let activeAudioUrl = "";
  const cloudAudioCache = new Map();
  const cloudAudioCacheLimit = 12;
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
    if (deviceSupported && cancelDevice) {
      synthesis.cancel();
    }
    if (activeAudio) {
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

  async function prepareCloudAudio(audio) {
    if (!sharedCloudSupported) {
      return { audio, buffer: null };
    }
    try {
      return { audio, buffer: await audioOutput.decode(audio) };
    } catch {
      return { audio, buffer: null };
    }
  }

  function loadCloudAudio(segment, settings) {
    const voice = cloudVoiceFor(segment, settings);
    const cacheKey = JSON.stringify([segment.text, voice, segment.language]);
    const cached = cloudAudioCache.get(cacheKey);
    if (cached) {
      cloudAudioCache.delete(cacheKey);
      cloudAudioCache.set(cacheKey, cached);
      return cached;
    }

    const request = Promise.resolve()
      .then(() => requestCloudAudio(segment.text, voice, segment.language))
      .then(prepareCloudAudio)
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

  function createSharedCloudPlayer(buffer) {
    let source = null;
    let stopped = false;
    let finished = false;
    const player = {
      playbackRate: 1,
      onplaying: null,
      onended: null,
      onerror: null,
      async play() {
        const context = audioOutput.getContext();
        if (!context || typeof context.createBufferSource !== "function") {
          throw new Error("自然音声の共通再生先を利用できません。");
        }
        source = context.createBufferSource();
        source.buffer = buffer;
        const rate = Number(player.playbackRate);
        const normalizedRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
        if (source.playbackRate?.setValueAtTime) {
          source.playbackRate.setValueAtTime(normalizedRate, context.currentTime);
        } else if (source.playbackRate) {
          source.playbackRate.value = normalizedRate;
        }
        source.connect(context.destination);
        const handleEnded = () => {
          source?.disconnect?.();
          source = null;
          if (!stopped && !finished) {
            finished = true;
            player.onended?.();
          }
        };
        source.addEventListener?.("ended", handleEnded, { once: true });
        if (!("addEventListener" in source)) {
          source.onended = handleEnded;
        }
        const resumePromise = audioOutput.resume();
        source.start(context.currentTime);
        player.onplaying?.();
        await resumePromise;
      },
      pause() {
        stopped = true;
        finished = true;
        try {
          source?.stop?.();
        } catch {}
        source?.disconnect?.();
        source = null;
      },
    };
    return player;
  }

  function preload(segments) {
    if (!cloudSupported) {
      return Promise.resolve([]);
    }
    const settings = normalizeSpeechSettings(getSettings());
    if (settings.source !== "cloud") {
      return Promise.resolve([]);
    }
    return Promise.allSettled(
      normalizedSegments(segments).map((segment) =>
        loadCloudAudio(segment, settings),
      ),
    );
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
    void preload(queue);

    function continueAfterPlayback(callback) {
      scheduleContinuation(() => {
        if (ticket === generation) {
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
      if (audioUrl) {
        revokeObjectUrl(audioUrl);
      }
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
      let startTimer = null;
      const clearStartTimer = () => {
        if (startTimer !== null) {
          globalThis.clearTimeout(startTimer);
          startTimer = null;
        }
      };
      const markStarted = () => {
        clearStartTimer();
      };
      const finish = () => {
        if (finished) {
          return;
        }
        markStarted();
        finished = true;
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
      const startTimeoutMs = Number(deviceStartTimeoutMs);
      if (Number.isFinite(startTimeoutMs) && startTimeoutMs >= 0) {
        startTimer = globalThis.setTimeout(
          handleStartTimeout,
          startTimeoutMs,
        );
      }
      try {
        synthesis.resume?.();
        synthesis.speak(utterance);
      } catch {
        retryOrFail(new Error("端末音声の再生を開始できませんでした。"));
      }
    }

    async function speakWithCloud(segment, settings, done, fail) {
      if (!cloudSupported || ticket !== generation) {
        onFallback(new Error("Azure音声を利用できません。"));
        speakWithDevice(segment, settings, done, fail);
        return;
      }
      try {
        const preparedAudio = await loadCloudAudio(segment, settings);
        if (ticket !== generation) {
          return;
        }
        let audioUrl = "";
        let audio = null;
        if (preparedAudio.buffer && sharedCloudSupported) {
          audio = createSharedCloudPlayer(preparedAudio.buffer);
        } else if (legacyCloudSupported) {
          audioUrl = createObjectUrl(preparedAudio.audio);
          audio = new AudioPlayer(audioUrl);
        } else {
          throw new Error("自然音声を再生できません。");
        }
        activeAudio = audio;
        activeAudioUrl = audioUrl;
        audio.playbackRate = settings.rate;
        let finished = false;
        let startTimer = null;
        const clearStartTimer = () => {
          if (startTimer !== null) {
            globalThis.clearTimeout(startTimer);
            startTimer = null;
          }
        };
        const finish = () => {
          if (finished) {
            return;
          }
          finished = true;
          clearStartTimer();
          finishCloudAudio(audio, audioUrl);
          continueAfterPlayback(done);
        };
        const fallback = (error) => {
          if (finished) {
            return;
          }
          finished = true;
          clearStartTimer();
          finishCloudAudio(audio, audioUrl);
          onFallback(error instanceof Error ? error : new Error("音声を再生できません。"));
          continueAfterPlayback(() =>
            speakWithDevice(segment, settings, done, fail),
          );
        };
        audio.onplaying = clearStartTimer;
        audio.onended = finish;
        audio.onerror = fallback;
        const startTimeoutMs = Number(cloudStartTimeoutMs);
        if (Number.isFinite(startTimeoutMs) && startTimeoutMs >= 0) {
          startTimer = globalThis.setTimeout(() => {
            fallback(new Error("自然音声の再生を開始できませんでした。"));
          }, startTimeoutMs);
        }
        try {
          await audio.play();
          clearStartTimer();
        } catch (error) {
          fallback(error);
        }
      } catch (error) {
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
    preload,
    speak,
    stop,
  };
}
