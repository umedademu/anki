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
} = {}) {
  let audioContext = null;
  let outputNode = null;

  function createOutputNode(context) {
    const masterGain = context.createGain();
    masterGain.gain.setValueAtTime(
      ratingSoundMasterVolume,
      context.currentTime,
    );

    if (typeof context.createDynamicsCompressor !== "function") {
      masterGain.connect(context.destination);
      return masterGain;
    }

    const compressor = context.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-6, context.currentTime);
    compressor.knee.setValueAtTime(10, context.currentTime);
    compressor.ratio.setValueAtTime(10, context.currentTime);
    compressor.attack.setValueAtTime(0.003, context.currentTime);
    compressor.release.setValueAtTime(0.18, context.currentTime);
    masterGain.connect(compressor);
    compressor.connect(context.destination);
    return masterGain;
  }

  function ensureAudioContext() {
    if (audioContext?.state === "closed") {
      audioContext = null;
      outputNode = null;
    }
    if (!audioContext && typeof AudioContextClass === "function") {
      audioContext = new AudioContextClass();
      outputNode = createOutputNode(audioContext);
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
    gain.connect(outputNode ?? context.destination);
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
      outputNode = null;
      return false;
    }
  }

  function close() {
    const context = audioContext;
    audioContext = null;
    outputNode = null;
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
