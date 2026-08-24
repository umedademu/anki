const silenceGain = 0.0001;

export const ratingSoundPatterns = Object.freeze({
  again: Object.freeze([
    Object.freeze({
      delaySeconds: 0,
      durationSeconds: 0.18,
      startFrequency: 260,
      endFrequency: 150,
      wave: "triangle",
      volume: 0.055,
    }),
  ]),
  hard: Object.freeze([
    Object.freeze({
      delaySeconds: 0,
      durationSeconds: 0.11,
      startFrequency: 349,
      endFrequency: 330,
      wave: "triangle",
      volume: 0.05,
    }),
    Object.freeze({
      delaySeconds: 0.1,
      durationSeconds: 0.14,
      startFrequency: 294,
      endFrequency: 262,
      wave: "triangle",
      volume: 0.05,
    }),
  ]),
  good: Object.freeze([
    Object.freeze({
      delaySeconds: 0,
      durationSeconds: 0.11,
      startFrequency: 523,
      endFrequency: 587,
      wave: "sine",
      volume: 0.055,
    }),
    Object.freeze({
      delaySeconds: 0.09,
      durationSeconds: 0.15,
      startFrequency: 659,
      endFrequency: 698,
      wave: "sine",
      volume: 0.055,
    }),
  ]),
  easy: Object.freeze([
    Object.freeze({
      delaySeconds: 0,
      durationSeconds: 0.1,
      startFrequency: 523,
      endFrequency: 587,
      wave: "sine",
      volume: 0.05,
    }),
    Object.freeze({
      delaySeconds: 0.075,
      durationSeconds: 0.12,
      startFrequency: 659,
      endFrequency: 698,
      wave: "sine",
      volume: 0.05,
    }),
    Object.freeze({
      delaySeconds: 0.16,
      durationSeconds: 0.16,
      startFrequency: 784,
      endFrequency: 880,
      wave: "sine",
      volume: 0.05,
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
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = note.wave;
    oscillator.frequency.setValueAtTime(note.startFrequency, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(
      note.endFrequency,
      endTime,
    );
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
