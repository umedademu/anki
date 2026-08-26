import assert from "node:assert/strict";
import {
  createRatingSoundPlayer,
  ratingSoundMasterVolume,
  ratingSoundPatterns,
} from "../public/rating-sound.js";

class FakeAudioParameter {
  events = [];

  setValueAtTime(value, time) {
    this.events.push(["set", value, time]);
  }

  linearRampToValueAtTime(value, time) {
    this.events.push(["linear", value, time]);
  }

  exponentialRampToValueAtTime(value, time) {
    this.events.push(["exponential", value, time]);
  }
}

class FakeAudioNode {
  connections = [];

  connect(target) {
    this.connections.push(target);
  }

  disconnect() {}
}

class FakeOscillator extends FakeAudioNode {
  frequency = new FakeAudioParameter();
  starts = [];
  stops = [];

  start(time) {
    this.starts.push(time);
  }

  stop(time) {
    this.stops.push(time);
  }

  addEventListener() {}
}

class FakeGain extends FakeAudioNode {
  gain = new FakeAudioParameter();
}

class FakeDynamicsCompressor extends FakeAudioNode {
  threshold = new FakeAudioParameter();
  knee = new FakeAudioParameter();
  ratio = new FakeAudioParameter();
  attack = new FakeAudioParameter();
  release = new FakeAudioParameter();
}

class FakeBufferSource extends FakeAudioNode {
  buffer = null;
  starts = [];

  start(time) {
    this.starts.push(time);
  }

  addEventListener() {}
}

class FakeAudioContext {
  static instances = [];

  constructor() {
    this.state = "suspended";
    this.currentTime = 10;
    this.destination = new FakeAudioNode();
    this.oscillators = [];
    this.gains = [];
    this.compressors = [];
    this.bufferSources = [];
    this.nextDecodeDuration = 0.8;
    this.resumeCount = 0;
    FakeAudioContext.instances.push(this);
  }

  createOscillator() {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }

  createGain() {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }

  createDynamicsCompressor() {
    const compressor = new FakeDynamicsCompressor();
    this.compressors.push(compressor);
    return compressor;
  }

  createBufferSource() {
    const source = new FakeBufferSource();
    this.bufferSources.push(source);
    return source;
  }

  async decodeAudioData() {
    return { duration: this.nextDecodeDuration };
  }

  resume() {
    this.resumeCount += 1;
    this.state = "running";
    return Promise.resolve();
  }

  close() {
    this.state = "closed";
    return Promise.resolve();
  }
}

assert.deepEqual(Object.keys(ratingSoundPatterns), [
  "again",
  "hard",
  "good",
  "easy",
]);
const distinctPatterns = new Set(
  Object.values(ratingSoundPatterns).map((pattern) => JSON.stringify(pattern)),
);
assert.equal(distinctPatterns.size, 4);
const allNotes = Object.values(ratingSoundPatterns).flat();
assert.ok(allNotes.every((note) => note.glideSeconds > 0));
assert.ok(allNotes.every((note) => note.durationSeconds >= 0.1));
assert.ok(
  Object.values(ratingSoundPatterns).every(
    (pattern) => Math.max(...pattern.map((note) => note.volume)) >= 0.16,
  ),
);
assert.ok(ratingSoundMasterVolume >= 1.6);
assert.ok(
  Math.max(
    ...ratingSoundPatterns.good.map(
      (note) => note.delaySeconds + note.durationSeconds,
    ),
  ) >= 0.65,
);
assert.ok(
  Math.max(
    ...ratingSoundPatterns.easy.map(
      (note) => note.delaySeconds + note.durationSeconds,
    ),
  ) >= 0.75,
);
assert.ok(ratingSoundPatterns.good.length >= 6);
assert.ok(ratingSoundPatterns.easy.length >= 10);

const player = createRatingSoundPlayer({ AudioContextClass: FakeAudioContext });
for (const rating of Object.keys(ratingSoundPatterns)) {
  assert.equal(player.play(rating), true);
}
assert.equal(player.play("unknown"), false);

const context = FakeAudioContext.instances[0];
const expectedNoteCount = Object.values(ratingSoundPatterns).reduce(
  (total, notes) => total + notes.length,
  0,
);
assert.equal(FakeAudioContext.instances.length, 1);
assert.equal(context.resumeCount, 1);
assert.equal(context.oscillators.length, expectedNoteCount);
assert.equal(context.gains.length, expectedNoteCount + 2);
assert.equal(context.compressors.length, 1);
assert.ok(
  context.oscillators.every((oscillator) => oscillator.starts.length === 1),
);
assert.ok(
  context.oscillators.every((oscillator) => oscillator.stops.length === 1),
);
assert.ok(
  context.oscillators.every(
    (oscillator) => oscillator.frequency.events.length === 3,
  ),
);
const [builtInGain, customGain, ...noteGains] = context.gains;
assert.deepEqual(builtInGain.gain.events[0], [
  "set",
  ratingSoundMasterVolume,
  context.currentTime,
]);
assert.deepEqual(customGain.gain.events[0], ["set", 1, context.currentTime]);
assert.equal(builtInGain.connections[0], context.compressors[0]);
assert.equal(customGain.connections[0], context.compressors[0]);
assert.equal(context.compressors[0].connections[0], context.destination);
assert.deepEqual(context.compressors[0].threshold.events[0], [
  "set",
  -6,
  context.currentTime,
]);
assert.deepEqual(context.compressors[0].ratio.events[0], [
  "set",
  10,
  context.currentTime,
]);
assert.ok(noteGains.every((gain) => gain.connections[0] === builtInGain));

assert.deepEqual(
  await player.setCustomSound("good", Uint8Array.from([1, 2, 3])),
  { duration: 0.8 },
);
assert.equal(player.hasCustomSound("good"), true);
const oscillatorCountBeforeCustomPlay = context.oscillators.length;
assert.equal(player.play("good"), true);
assert.equal(context.oscillators.length, oscillatorCountBeforeCustomPlay);
assert.equal(context.bufferSources.length, 1);
assert.equal(context.bufferSources[0].connections[0], customGain);
assert.equal(context.bufferSources[0].starts.length, 1);
assert.equal(player.setVolume(1.5), 1.5);
assert.deepEqual(builtInGain.gain.events.at(-1), [
  "set",
  ratingSoundMasterVolume * 1.5,
  context.currentTime,
]);
assert.deepEqual(customGain.gain.events.at(-1), ["set", 1.5, context.currentTime]);
assert.equal(player.clearCustomSound("good"), true);
assert.equal(player.hasCustomSound("good"), false);
context.nextDecodeDuration = 6;
await assert.rejects(
  player.setCustomSound("easy", Uint8Array.from([1])),
  /5秒以内/,
);

await player.close();
assert.equal(context.state, "closed");

const silentPlayer = createRatingSoundPlayer({ AudioContextClass: null });
assert.equal(silentPlayer.play("good"), false);

console.log("4段階評価の効果音テストに成功しました。");
