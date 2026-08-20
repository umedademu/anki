import { requiredHistoryReadings } from "./reading-rules.js";

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

export function selectJapaneseVoice(voices) {
  const candidates = Array.from(voices ?? []);
  return (
    candidates.find((voice) => String(voice.lang).toLowerCase() === "ja-jp") ??
    candidates.find((voice) => String(voice.lang).toLowerCase().startsWith("ja")) ??
    null
  );
}

export function createSpeechController({
  synthesis = globalThis.speechSynthesis,
  Utterance = globalThis.SpeechSynthesisUtterance,
  onTargetChange = () => {},
} = {}) {
  const supported = Boolean(
    synthesis &&
      typeof synthesis.speak === "function" &&
      typeof synthesis.cancel === "function" &&
      typeof Utterance === "function",
  );
  let generation = 0;
  let currentTarget = "";

  function setCurrentTarget(target) {
    currentTarget = target;
    onTargetChange(target);
  }

  function stop() {
    generation += 1;
    if (supported) {
      synthesis.cancel();
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

    function speakNext() {
      if (ticket !== generation) {
        return;
      }
      const segment = queue.shift();
      if (!segment) {
        setCurrentTarget("");
        return;
      }

      const utterance = new Utterance(segment.text);
      utterance.lang = "ja-JP";
      utterance.rate = 1;
      const voice = selectJapaneseVoice(synthesis.getVoices?.() ?? []);
      if (voice) {
        utterance.voice = voice;
      }
      utterance.onend = speakNext;
      utterance.onerror = speakNext;
      setCurrentTarget(segment.target);
      synthesis.speak(utterance);
    }

    speakNext();
    return true;
  }

  return {
    supported,
    get currentTarget() {
      return currentTarget;
    },
    speak,
    stop,
  };
}
