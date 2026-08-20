import { requiredHistoryReadings } from "./reading-rules.js";
import {
  defaultSpeechSettings,
  getVoiceId,
  normalizeSpeechSettings,
} from "./speech-settings.js";

const annotatedReadingPattern =
  /([^\s。、！？「」『』【】（）()]+)\(([\p{Script=Hiragana}ー・\s]+)\)/gu;

export function prepareSpeechText(value) {
  let text = String(value ?? "").replaceAll("**", "");
  const readings = Object.entries(requiredHistoryReadings).sort(
    ([left], [right]) => right.length - left.length,
  );

  for (const [term, reading] of readings) {
    text = text.replaceAll(`${term}(${reading})`, reading);
  }

  return text
    .replace(annotatedReadingPattern, (_, __, reading) => reading)
    .replace(/[\r\n]+/g, "。")
    .replace(/[|]/g, "、")
    .replace(/〜/g, "から")
    .replace(/[`#_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function selectJapaneseVoice(voices, preferredVoiceId = "") {
  const candidates = Array.from(voices ?? []);
  const preferred = candidates.find(
    (voice) =>
      String(voice.lang).toLowerCase().startsWith("ja") &&
      getVoiceId(voice) === preferredVoiceId,
  );
  return (
    preferred ??
    candidates.find((voice) => String(voice.lang).toLowerCase() === "ja-jp") ??
    candidates.find((voice) => String(voice.lang).toLowerCase().startsWith("ja")) ??
    null
  );
}

export function createSpeechController({
  synthesis = globalThis.speechSynthesis,
  Utterance = globalThis.SpeechSynthesisUtterance,
  AudioPlayer = globalThis.Audio,
  createObjectUrl = (audio) => globalThis.URL.createObjectURL(audio),
  revokeObjectUrl = (url) => globalThis.URL.revokeObjectURL(url),
  requestCloudAudio = null,
  getSettings = () => defaultSpeechSettings,
  onTargetChange = () => {},
  onFallback = () => {},
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

  function setCurrentTarget(target) {
    currentTarget = target;
    onTargetChange(target);
  }

  function stop() {
    generation += 1;
    if (deviceSupported) {
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

  function speak(segments) {
    if (!supported) {
      return false;
    }
    const queue = Array.from(segments ?? [])
      .map((segment) => ({
        target: String(segment?.target ?? ""),
        text: prepareSpeechText(segment?.text),
      }))
      .filter((segment) => segment.target && segment.text);
    if (queue.length === 0) {
      stop();
      return false;
    }

    stop();
    const ticket = ++generation;

    function finishCloudAudio(audio, audioUrl) {
      if (activeAudio === audio) {
        activeAudio = null;
      }
      if (activeAudioUrl === audioUrl) {
        activeAudioUrl = "";
      }
      audio.onended = null;
      audio.onerror = null;
      audio.pause?.();
      revokeObjectUrl(audioUrl);
    }

    function speakWithDevice(segment, settings, done) {
      if (!deviceSupported || ticket !== generation) {
        done();
        return;
      }
      const utterance = new Utterance(segment.text);
      utterance.lang = "ja-JP";
      utterance.rate = settings.rate;
      const voice = selectJapaneseVoice(
        synthesis.getVoices?.() ?? [],
        settings.voiceId,
      );
      if (voice) {
        utterance.voice = voice;
      }
      utterance.onend = done;
      utterance.onerror = done;
      synthesis.speak(utterance);
    }

    async function speakWithCloud(segment, settings, done) {
      if (!cloudSupported || ticket !== generation) {
        onFallback(new Error("Azure音声を利用できません。"));
        speakWithDevice(segment, settings, done);
        return;
      }
      try {
        const blob = await requestCloudAudio(
          segment.text,
          settings.azureVoiceId,
        );
        if (ticket !== generation) {
          return;
        }
        const audioUrl = createObjectUrl(blob);
        const audio = new AudioPlayer(audioUrl);
        activeAudio = audio;
        activeAudioUrl = audioUrl;
        audio.playbackRate = settings.rate;
        let finished = false;
        const finish = () => {
          if (finished) {
            return;
          }
          finished = true;
          finishCloudAudio(audio, audioUrl);
          done();
        };
        const fallback = (error) => {
          if (finished) {
            return;
          }
          finished = true;
          finishCloudAudio(audio, audioUrl);
          onFallback(error instanceof Error ? error : new Error("音声を再生できません。"));
          speakWithDevice(segment, settings, done);
        };
        audio.onended = finish;
        audio.onerror = fallback;
        try {
          await audio.play();
        } catch (error) {
          fallback(error);
        }
      } catch (error) {
        if (ticket !== generation) {
          return;
        }
        onFallback(error instanceof Error ? error : new Error("Azure音声を利用できません。"));
        speakWithDevice(segment, settings, done);
      }
    }

    function speakNext() {
      if (ticket !== generation) {
        return;
      }
      const segment = queue.shift();
      if (!segment) {
        setCurrentTarget("");
        return;
      }

      setCurrentTarget(segment.target);
      const settings = normalizeSpeechSettings(getSettings());
      if (settings.source === "cloud") {
        void speakWithCloud(segment, settings, speakNext);
      } else {
        speakWithDevice(segment, settings, speakNext);
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
    speak,
    stop,
  };
}
