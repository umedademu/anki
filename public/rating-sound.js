const silenceGain = 0.0001;

export const ratingSoundPatterns = Object.freeze({
  again: Object.freeze([
    Object.freeze({
      delaySeconds: 0,
      durationSeconds: 0.38,
      glideSeconds: 0.12,
      startFrequency: 392,
      endFrequency: 330,
      wave: "triangle",
      volume: 0.11,
    }),
    Object.freeze({
      delaySeconds: 0,
      durationSeconds: 0.24,
      glideSeconds: 0.12,
      startFrequency: 784,
      endFrequency: 660,
      wave: "sine",
      volume: 0.032,
    }),
    Object.freeze({
      delaySeconds: 0.1,
      durationSeconds: 0.4,
      glideSeconds: 0.11,
      startFrequency: 330,
      endFrequency: 294,
      wave: "sine",
      volume: 0.095,
    }),
  ]),
  hard: Object.freeze([
    Object.freeze({
      delaySeconds: 0,
      durationSeconds: 0.36,
      glideSeconds: 0.09,
      startFrequency: 392,
      endFrequency: 415,
      wave: "triangle",
      volume: 0.105,
    }),
    Object.freeze({
      delaySeconds: 0,
      durationSeconds: 0.22,
      glideSeconds: 0.09,
      startFrequency: 784,
      endFrequency: 830,
      wave: "sine",
      volume: 0.028,
    }),
    Object.freeze({
      delaySeconds: 0.11,
      durationSeconds: 0.44,
      glideSeconds: 0.1,
      startFrequency: 440,
      endFrequency: 466,
      wave: "sine",
      volume: 0.1,
    }),
    Object.freeze({
      delaySeconds: 0.11,
      durationSeconds: 0.25,
      glideSeconds: 0.1,
      startFrequency: 880,
      endFrequency: 932,
      wave: "sine",
      volume: 0.025,
    }),
  ]),
  good: Object.freeze([
    Object.freeze({
      delaySeconds: 0,
      durationSeconds: 0.32,
      glideSeconds: 0.09,
      startFrequency: 523,
      endFrequency: 587,
      wave: "sine",
      volume: 0.11,
    }),
    Object.freeze({
      delaySeconds: 0,
      durationSeconds: 0.2,
      glideSeconds: 0.09,
      startFrequency: 1046,
      endFrequency: 1174,
      wave: "sine",
      volume: 0.028,
    }),
    Object.freeze({
      delaySeconds: 0.1,
      durationSeconds: 0.38,
      glideSeconds: 0.09,
      startFrequency: 659,
      endFrequency: 698,
      wave: "sine",
      volume: 0.11,
    }),
    Object.freeze({
      delaySeconds: 0.1,
      durationSeconds: 0.22,
      glideSeconds: 0.09,
      startFrequency: 1318,
      endFrequency: 1396,
      wave: "sine",
      volume: 0.026,
    }),
    Object.freeze({
      delaySeconds: 0.2,
      durationSeconds: 0.48,
      glideSeconds: 0.12,
      startFrequency: 784,
      endFrequency: 880,
      wave: "sine",
      volume: 0.12,
    }),
    Object.freeze({
      delaySeconds: 0.2,
      durationSeconds: 0.27,
      glideSeconds: 0.12,
      startFrequency: 1568,
      endFrequency: 1760,
      wave: "sine",
      volume: 0.03,
    }),
  ]),
  easy: Object.freeze([
    Object.freeze({
      delaySeconds: 0,
      durationSeconds: 0.28,
      glideSeconds: 0.08,
      startFrequency: 523,
      endFrequency: 659,
      wave: "sine",
      volume: 0.105,
    }),
    Object.freeze({
      delaySeconds: 0,
      durationSeconds: 0.17,
      glideSeconds: 0.08,
      startFrequency: 1046,
      endFrequency: 1318,
      wave: "sine",
      volume: 0.026,
    }),
    Object.freeze({
      delaySeconds: 0.075,
      durationSeconds: 0.34,
      glideSeconds: 0.09,
      startFrequency: 659,
      endFrequency: 784,
      wave: "sine",
      volume: 0.108,
    }),
    Object.freeze({
      delaySeconds: 0.075,
      durationSeconds: 0.19,
      glideSeconds: 0.09,
      startFrequency: 1318,
      endFrequency: 1568,
      wave: "sine",
      volume: 0.027,
    }),
    Object.freeze({
      delaySeconds: 0.15,
      durationSeconds: 0.4,
      glideSeconds: 0.1,
      startFrequency: 784,
      endFrequency: 1046,
      wave: "sine",
      volume: 0.112,
    }),
    Object.freeze({
      delaySeconds: 0.15,
      durationSeconds: 0.22,
      glideSeconds: 0.1,
      startFrequency: 1568,
      endFrequency: 2092,
      wave: "sine",
      volume: 0.028,
    }),
    Object.freeze({
      delaySeconds: 0.24,
      durationSeconds: 0.52,
      glideSeconds: 0.12,
      startFrequency: 1046,
      endFrequency: 1318,
      wave: "sine",
      volume: 0.118,
    }),
    Object.freeze({
      delaySeconds: 0.24,
      durationSeconds: 0.28,
      glideSeconds: 0.12,
      startFrequency: 2092,
      endFrequency: 2636,
      wave: "sine",
      volume: 0.03,
    }),
  ]),
});

export function createRatingSoundPlayer({
  AudioContextClass =
    globalThis.AudioContext ?? globalThis.webkitAudioContext ?? null,
} = {}) {
  let audioContext = null;

  function ensureAudioContext() {
    if (audioContext?.state === "closed") {
      audioContext = null;
    }
    if (!audioContext && typeof AudioContextClass === "function") {
      audioContext = new AudioContextClass();
    }
    return audioContext;
  }

  function scheduleNote(context, note, baseTime) {
    const startTime = baseTime + note.delaySeconds;
    const endTime = startTime + note.durationSeconds;
    const attackEndTime = Math.min(startTime + 0.012, endTime);
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
    gain.connect(context.destination);
    oscillator.start(startTime);
    oscillator.stop(endTime + 0.02);
    oscillator.addEventListener?.(
      "ended",
      () => {
        oscillator.disconnect?.();
        gain.disconnect?.();
      },
      { once: true },
    );
  }

  function play(rating) {
    const pattern = ratingSoundPatterns[rating];
    if (!pattern) {
      return false;
    }
    try {
      const context = ensureAudioContext();
      if (!context) {
        return false;
      }
      if (context.state === "suspended") {
        void context.resume?.().catch?.(() => {});
      }
      const baseTime = context.currentTime + 0.005;
      for (const note of pattern) {
        scheduleNote(context, note, baseTime);
      }
      return true;
    } catch {
      audioContext = null;
      return false;
    }
  }

  function close() {
    const context = audioContext;
    audioContext = null;
    if (!context || context.state === "closed") {
      return Promise.resolve();
    }
    try {
      return Promise.resolve(context.close?.()).catch(() => {});
    } catch {
      return Promise.resolve();
    }
  }

  return { play, close };
}
