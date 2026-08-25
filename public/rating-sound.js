import {
  maximumRatingSoundDurationSeconds,
  normalizeRatingSoundKey,
  normalizeRatingSoundVolume,
} from "./rating-sound-settings.js";
import { createAudioOutput } from "./audio-output.js";

const silenceGain = 0.0001;

export const ratingSoundMasterVolume = 1.65;

function freezePattern(notes) {
  return Object.freeze(notes.map((note) => Object.freeze(note)));
}

export const ratingSoundPatterns = Object.freeze({
  again: freezePattern([
    {
      delaySeconds: 0,
      durationSeconds: 0.2,
      glideSeconds: 0.05,
      startFrequency: 659,
      endFrequency: 587,
      wave: "triangle",
      volume: 0.18,
    },
    {
      delaySeconds: 0,
      durationSeconds: 0.13,
      glideSeconds: 0.05,
      startFrequency: 1318,
      endFrequency: 1174,
      wave: "sine",
      volume: 0.065,
    },
    {
      delaySeconds: 0.075,
      durationSeconds: 0.44,
      glideSeconds: 0.07,
      startFrequency: 587,
      endFrequency: 523,
      wave: "triangle",
      volume: 0.175,
    },
    {
      delaySeconds: 0.075,
      durationSeconds: 0.24,
      glideSeconds: 0.07,
      startFrequency: 1174,
      endFrequency: 1046,
      wave: "sine",
      volume: 0.06,
    },
  ]),
  hard: freezePattern([
    {
      delaySeconds: 0,
      durationSeconds: 0.2,
      glideSeconds: 0.05,
      startFrequency: 659,
      endFrequency: 698,
      wave: "triangle",
      volume: 0.18,
    },
    {
      delaySeconds: 0,
      durationSeconds: 0.13,
      glideSeconds: 0.05,
      startFrequency: 1318,
      endFrequency: 1396,
      wave: "sine",
      volume: 0.062,
    },
    {
      delaySeconds: 0.085,
      durationSeconds: 0.38,
      glideSeconds: 0.06,
      startFrequency: 784,
      endFrequency: 830,
      wave: "triangle",
      volume: 0.18,
    },
    {
      delaySeconds: 0.085,
      durationSeconds: 0.21,
      glideSeconds: 0.06,
      startFrequency: 1568,
      endFrequency: 1660,
      wave: "sine",
      volume: 0.06,
    },
    {
      delaySeconds: 0.18,
      durationSeconds: 0.42,
      glideSeconds: 0.07,
      startFrequency: 932,
      endFrequency: 988,
      wave: "triangle",
      volume: 0.16,
    },
    {
      delaySeconds: 0.18,
      durationSeconds: 0.24,
      glideSeconds: 0.07,
      startFrequency: 1864,
      endFrequency: 1976,
      wave: "sine",
      volume: 0.052,
    },
  ]),
  good: freezePattern([
    {
      delaySeconds: 0,
      durationSeconds: 0.18,
      glideSeconds: 0.04,
      startFrequency: 1046,
      endFrequency: 1174,
      wave: "triangle",
      volume: 0.185,
    },
    {
      delaySeconds: 0,
      durationSeconds: 0.11,
      glideSeconds: 0.04,
      startFrequency: 2092,
      endFrequency: 2348,
      wave: "sine",
      volume: 0.055,
    },
    {
      delaySeconds: 0.065,
      durationSeconds: 0.2,
      glideSeconds: 0.04,
      startFrequency: 1318,
      endFrequency: 1396,
      wave: "triangle",
      volume: 0.19,
    },
    {
      delaySeconds: 0.065,
      durationSeconds: 0.12,
      glideSeconds: 0.04,
      startFrequency: 2636,
      endFrequency: 2792,
      wave: "sine",
      volume: 0.056,
    },
    {
      delaySeconds: 0.13,
      durationSeconds: 0.24,
      glideSeconds: 0.05,
      startFrequency: 1568,
      endFrequency: 1760,
      wave: "triangle",
      volume: 0.195,
    },
    {
      delaySeconds: 0.13,
      durationSeconds: 0.14,
      glideSeconds: 0.05,
      startFrequency: 3136,
      endFrequency: 3520,
      wave: "sine",
      volume: 0.058,
    },
    {
      delaySeconds: 0.205,
      durationSeconds: 0.46,
      glideSeconds: 0.07,
      startFrequency: 2092,
      endFrequency: 2348,
      wave: "triangle",
      volume: 0.22,
    },
    {
      delaySeconds: 0.205,
      durationSeconds: 0.27,
      glideSeconds: 0.07,
      startFrequency: 4184,
      endFrequency: 4696,
      wave: "sine",
      volume: 0.068,
    },
    {
      delaySeconds: 0.205,
      durationSeconds: 0.46,
      glideSeconds: 0.07,
      startFrequency: 2636,
      endFrequency: 2792,
      wave: "sine",
      volume: 0.09,
    },
  ]),
  easy: freezePattern([
    {
      delaySeconds: 0,
      durationSeconds: 0.16,
      glideSeconds: 0.035,
      startFrequency: 1046,
      endFrequency: 1174,
      wave: "triangle",
      volume: 0.18,
    },
    {
      delaySeconds: 0,
      durationSeconds: 0.1,
      glideSeconds: 0.035,
      startFrequency: 2092,
      endFrequency: 2348,
      wave: "sine",
      volume: 0.055,
    },
    {
      delaySeconds: 0.055,
      durationSeconds: 0.18,
      glideSeconds: 0.04,
      startFrequency: 1318,
      endFrequency: 1568,
      wave: "triangle",
      volume: 0.185,
    },
    {
      delaySeconds: 0.055,
      durationSeconds: 0.11,
      glideSeconds: 0.04,
      startFrequency: 2636,
      endFrequency: 3136,
      wave: "sine",
      volume: 0.056,
    },
    {
      delaySeconds: 0.11,
      durationSeconds: 0.2,
      glideSeconds: 0.04,
      startFrequency: 1568,
      endFrequency: 1760,
      wave: "triangle",
      volume: 0.19,
    },
    {
      delaySeconds: 0.11,
      durationSeconds: 0.12,
      glideSeconds: 0.04,
      startFrequency: 3136,
      endFrequency: 3520,
      wave: "sine",
      volume: 0.058,
    },
    {
      delaySeconds: 0.17,
      durationSeconds: 0.24,
      glideSeconds: 0.05,
      startFrequency: 2092,
      endFrequency: 2348,
      wave: "triangle",
      volume: 0.2,
    },
    {
      delaySeconds: 0.17,
      durationSeconds: 0.14,
      glideSeconds: 0.05,
      startFrequency: 4184,
      endFrequency: 4696,
      wave: "sine",
      volume: 0.062,
    },
    {
      delaySeconds: 0.24,
      durationSeconds: 0.55,
      glideSeconds: 0.075,
      startFrequency: 2636,
      endFrequency: 3136,
      wave: "triangle",
      volume: 0.225,
    },
    {
      delaySeconds: 0.24,
      durationSeconds: 0.3,
      glideSeconds: 0.075,
      startFrequency: 5272,
      endFrequency: 6272,
      wave: "sine",
      volume: 0.07,
    },
    {
      delaySeconds: 0.24,
      durationSeconds: 0.55,
      glideSeconds: 0.075,
      startFrequency: 2092,
      endFrequency: 2348,
      wave: "sine",
      volume: 0.12,
    },
  ]),
});

export function createRatingSoundPlayer({
  AudioContextClass =
    globalThis.AudioContext ?? globalThis.webkitAudioContext ?? null,
  audioOutput = null,
  initialVolume = 1,
} = {}) {
  const ownsAudioOutput = !audioOutput;
  const output = audioOutput ?? createAudioOutput({ AudioContextClass });
  let audioContext = null;
  let outputNodes = null;
  let volume = normalizeRatingSoundVolume(initialVolume);
  const customBuffers = new Map();
  const activeRatingSources = new Set();

  function resumeActiveRatingAudio() {
    if (
      activeRatingSources.size > 0 &&
      ["suspended", "interrupted"].includes(audioContext?.state)
    ) {
      void output.resume().catch(() => {});
    }
  }

  function trackRatingSource(source, cleanup = () => {}) {
    activeRatingSources.add(source);
    source.addEventListener?.(
      "ended",
      () => {
        activeRatingSources.delete(source);
        cleanup();
      },
      { once: true },
    );
  }

  function applyOutputVolume(context) {
    if (!outputNodes) return;
    outputNodes.builtIn.gain.setValueAtTime(
      ratingSoundMasterVolume * volume,
      context.currentTime,
    );
    outputNodes.custom.gain.setValueAtTime(volume, context.currentTime);
  }

  function createOutputNodes(context) {
    const builtIn = context.createGain();
    const custom = context.createGain();
    context.addEventListener?.("statechange", resumeActiveRatingAudio);

    if (typeof context.createDynamicsCompressor !== "function") {
      builtIn.connect(context.destination);
      custom.connect(context.destination);
      outputNodes = { builtIn, custom };
      applyOutputVolume(context);
      return outputNodes;
    }

    const compressor = context.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-6, context.currentTime);
    compressor.knee.setValueAtTime(10, context.currentTime);
    compressor.ratio.setValueAtTime(10, context.currentTime);
    compressor.attack.setValueAtTime(0.003, context.currentTime);
    compressor.release.setValueAtTime(0.18, context.currentTime);
    builtIn.connect(compressor);
    custom.connect(compressor);
    compressor.connect(context.destination);
    outputNodes = { builtIn, custom };
    applyOutputVolume(context);
    return outputNodes;
  }

  function ensureAudioContext() {
    const nextContext = output.getContext();
    if (nextContext !== audioContext) {
      audioContext?.removeEventListener?.(
        "statechange",
        resumeActiveRatingAudio,
      );
      audioContext = nextContext;
      outputNodes = null;
      if (audioContext) {
        createOutputNodes(audioContext);
      }
    }
    return audioContext;
  }

  function scheduleNote(context, note, baseTime) {
    const startTime = baseTime + note.delaySeconds;
    const endTime = startTime + note.durationSeconds;
    const attackEndTime = Math.min(startTime + 0.008, endTime);
    const glideEndTime = Math.min(
      startTime + (note.glideSeconds ?? note.durationSeconds),
      endTime,
    );
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = note.wave;
    oscillator.frequency.setValueAtTime(note.startFrequency, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(
      note.endFrequency,
      glideEndTime,
    );
    oscillator.frequency.setValueAtTime(note.endFrequency, endTime);
    gain.gain.setValueAtTime(silenceGain, startTime);
    gain.gain.linearRampToValueAtTime(note.volume, attackEndTime);
    gain.gain.exponentialRampToValueAtTime(silenceGain, endTime);
    oscillator.connect(gain);
    gain.connect(outputNodes?.builtIn ?? context.destination);
    trackRatingSource(oscillator, () => {
      oscillator.disconnect?.();
      gain.disconnect?.();
    });
    oscillator.start(startTime);
    oscillator.stop(endTime + 0.02);
  }

  function play(rating) {
    const normalizedRating = normalizeRatingSoundKey(rating);
    const pattern = ratingSoundPatterns[normalizedRating];
    if (!pattern) {
      return false;
    }
    try {
      const context = ensureAudioContext();
      if (!context) {
        return false;
      }
      if (["suspended", "interrupted"].includes(context.state)) {
        void output.resume().catch(() => {});
      }
      const customBuffer = customBuffers.get(normalizedRating);
      if (customBuffer && typeof context.createBufferSource === "function") {
        const source = context.createBufferSource();
        source.buffer = customBuffer;
        source.connect(outputNodes?.custom ?? context.destination);
        trackRatingSource(source, () => source.disconnect?.());
        source.start(context.currentTime + 0.005);
        return true;
      }
      const baseTime = context.currentTime + 0.005;
      for (const note of pattern) {
        scheduleNote(context, note, baseTime);
      }
      return true;
    } catch {
      audioContext?.removeEventListener?.(
        "statechange",
        resumeActiveRatingAudio,
      );
      audioContext = null;
      outputNodes = null;
      activeRatingSources.clear();
      return false;
    }
  }

  async function setCustomSound(rating, audioData) {
    const normalizedRating = normalizeRatingSoundKey(rating);
    const context = ensureAudioContext();
    if (
      !normalizedRating ||
      !context ||
      typeof context.decodeAudioData !== "function"
    ) {
      throw new Error("この端末では評価音を読み込めません。");
    }
    const source = audioData instanceof ArrayBuffer
      ? audioData
      : ArrayBuffer.isView(audioData)
        ? audioData.buffer.slice(
            audioData.byteOffset,
            audioData.byteOffset + audioData.byteLength,
          )
        : null;
    if (!source?.byteLength) {
      throw new Error("評価音の内容が空です。");
    }
    let buffer;
    try {
      buffer = await output.decode(source);
    } catch {
      throw new Error("この端末で再生できるMP3・WAV・M4Aを選んでください。");
    }
    if (
      !Number.isFinite(buffer?.duration) ||
      buffer.duration <= 0 ||
      buffer.duration > maximumRatingSoundDurationSeconds
    ) {
      throw new Error(`評価音は${maximumRatingSoundDurationSeconds}秒以内にしてください。`);
    }
    customBuffers.set(normalizedRating, buffer);
    return { duration: buffer.duration };
  }

  function clearCustomSound(rating) {
    const normalizedRating = normalizeRatingSoundKey(rating);
    return normalizedRating ? customBuffers.delete(normalizedRating) : false;
  }

  function hasCustomSound(rating) {
    return customBuffers.has(normalizeRatingSoundKey(rating));
  }

  function setVolume(value) {
    volume = normalizeRatingSoundVolume(value);
    if (audioContext && outputNodes) {
      applyOutputVolume(audioContext);
    }
    return volume;
  }

  function close() {
    audioContext?.removeEventListener?.(
      "statechange",
      resumeActiveRatingAudio,
    );
    audioContext = null;
    outputNodes = null;
    customBuffers.clear();
    activeRatingSources.clear();
    return ownsAudioOutput ? output.close() : Promise.resolve();
  }

  return {
    play,
    close,
    setCustomSound,
    clearCustomSound,
    hasCustomSound,
    setVolume,
  };
}
