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
  playbackRate = new FakeAudioParameter();
  starts = [];
  playbackRateAtStart = [];

  start(time) {
    this.playbackRateAtStart.push(this.playbackRate.events.map((event) => [...event]));
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
assert.deepEqual(context.bufferSources[0].playbackRateAtStart, [[["set", 1, context.currentTime]]], "速度取得を省略した差替音は1倍で再生する");
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

function assertNear(actual, expected, message) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-9,
    `${message}: ${actual} / ${expected}`);
}

function assertParameterEvent(actual, type, value, time, message) {
  assert.equal(actual?.[0], type, message);
  assertNear(actual?.[1], value, `${message}の値`);
  assertNear(actual?.[2], time, `${message}の時刻`);
}

function assertScheduledPattern(context, rating, rate, noteStart, gainStart, currentTime) {
  const notes = ratingSoundPatterns[rating];
  const oscillators = context.oscillators.slice(noteStart);
  const gains = context.gains.slice(gainStart);
  assert.equal(oscillators.length, notes.length, `${rating}の音数を維持する`);
  assert.equal(gains.length, notes.length);
  for (const [index, note] of notes.entries()) {
    const oscillator = oscillators[index];
    const gain = gains[index];
    const startTime = currentTime + 0.005 + note.delaySeconds / rate;
    const endTime = startTime + note.durationSeconds / rate;
    const glideTime = Math.min(startTime + note.glideSeconds / rate, endTime);
    const attackTime = Math.min(startTime + 0.008 / rate, endTime);
    assert.equal(oscillator.type, note.wave, "速度を変えても音色を維持する");
    assert.equal(oscillator.starts.length, 1);
    assert.equal(oscillator.stops.length, 1);
    assertNear(oscillator.starts[0], startTime, "速度に合わせた各音の開始時刻");
    assertNear(oscillator.stops[0], endTime + 0.02 / rate, "余韻まで同じ割合で短くする");
    assert.equal(oscillator.frequency.events.length, 3);
    assertParameterEvent(oscillator.frequency.events[0], "set", note.startFrequency, startTime, "開始音程を維持する");
    assertParameterEvent(oscillator.frequency.events[1], "exponential", note.endFrequency, glideTime, "音程を維持して変化の時間だけを短くする");
    assertParameterEvent(oscillator.frequency.events[2], "set", note.endFrequency, endTime, "終了音程を維持する");
    assert.equal(gain.gain.events.length, 3);
    assertParameterEvent(gain.gain.events[0], "set", 0.0001, startTime, "音量の開始");
    assertParameterEvent(gain.gain.events[1], "linear", note.volume, attackTime, "音量の立ち上がりも速度に合わせる");
    assertParameterEvent(gain.gain.events[2], "exponential", 0.0001, endTime, "速度に合わせた終了時刻");
  }
}

// 同じ再生器を使い続け、途中で変更した読み上げ速度を次の評価音へ反映する。
let playbackRate = 0.7;
let rateReadCount = 0;
const speedPlayer = createRatingSoundPlayer({
  AudioContextClass: FakeAudioContext,
  getPlaybackRate() { rateReadCount += 1; return playbackRate; },
});
let speedContext = null;
let expectedRateReads = 0;
const speeds = [0.7, 1, 1.5, 3, 1];
for (const speed of speeds) {
  playbackRate = speed;
  for (const rating of Object.keys(ratingSoundPatterns)) {
    const noteStart = speedContext?.oscillators.length ?? 0;
    const gainStart = speedContext?.gains.length ?? 2;
    const currentTime = speedContext?.currentTime ?? 10;
    assert.equal(speedPlayer.play(rating), true);
    speedContext ??= FakeAudioContext.instances.at(-1);
    expectedRateReads += 1;
    assert.equal(rateReadCount, expectedRateReads, "速度は評価音を鳴らすたびに取得する");
    assertScheduledPattern(speedContext, rating, Math.max(1, speed), noteStart, gainStart, currentTime);
    speedContext.currentTime += 2;
  }
}

// 数値でない設定や無限大でも予定時刻を壊さず、1倍で再生する。
for (const invalidRate of [NaN, Infinity, -Infinity, undefined, null, "速い", -1, 0]) {
  playbackRate = invalidRate;
  const noteStart = speedContext.oscillators.length;
  const gainStart = speedContext.gains.length;
  const currentTime = speedContext.currentTime;
  assert.equal(speedPlayer.play("good"), true, "不正な速度でも既定音を再生できる");
  expectedRateReads += 1;
  assertScheduledPattern(speedContext, "good", 1, noteStart, gainStart, currentTime);
  speedContext.currentTime += 2;
}

for (const rating of Object.keys(ratingSoundPatterns)) {
  await speedPlayer.setCustomSound(rating, Uint8Array.from([1, 2, 3]));
}
const builtInCount = speedContext.oscillators.length;
for (const speed of [...speeds, NaN, Infinity, undefined, "速い", -1]) {
  playbackRate = speed;
  const expectedRate = Number.isFinite(speed) ? Math.max(1, speed) : 1;
  for (const rating of Object.keys(ratingSoundPatterns)) {
    const currentTime = speedContext.currentTime;
    const previousSourceCount = speedContext.bufferSources.length;
    assert.equal(speedPlayer.play(rating), true, "差替音も速度変更後に再生できる");
    expectedRateReads += 1;
    const source = speedContext.bufferSources.at(-1);
    assert.equal(speedContext.bufferSources.length, previousSourceCount + 1);
    assert.equal(speedContext.oscillators.length, builtInCount, "差替音と既定音を重ねて再生しない");
    assert.equal(source.buffer.duration, 0.8, "元の音声を変更せず再生速度を変える");
    assert.deepEqual(source.playbackRate.events, [["set", expectedRate, currentTime]], "現在の速度を差替音の再生係数に反映する");
    assert.deepEqual(source.playbackRateAtStart, [[["set", expectedRate, currentTime]]], "開始する前に再生係数を設定する");
    assertNear(source.starts[0], currentTime + 0.005, "差替音の再生開始時刻");
    speedContext.currentTime += 2;
  }
}
assert.equal(rateReadCount, expectedRateReads);
await speedPlayer.close();

// iPhoneで通話やイヤホンの付け外しの後に「interrupted」で止まった評価音の出力も、鳴らす直前に再開を頼む。
{
  const interruptedPlayer = createRatingSoundPlayer({ AudioContextClass: FakeAudioContext });
  assert.equal(interruptedPlayer.play("good"), true);
  const interruptedContext = FakeAudioContext.instances.at(-1);
  assert.equal(interruptedContext.resumeCount, 1);
  interruptedContext.state = "interrupted";
  assert.equal(interruptedPlayer.play("easy"), true);
  assert.equal(interruptedContext.resumeCount, 2, "中断状態の評価音の出力にも再開を頼む");
  assert.equal(interruptedContext.state, "running");
  assert.equal(interruptedPlayer.play("hard"), true);
  assert.equal(interruptedContext.resumeCount, 2, "再生中の出力には再開を頼まない");
  await interruptedPlayer.close();
}

// 学習の開始・再開と学習画面を離れる時は出力だけを閉じ、登録済みの評価音は保持して次の評価音で作り直す。
{
  const releasedPlayer = createRatingSoundPlayer({ AudioContextClass: FakeAudioContext });
  await releasedPlayer.setCustomSound("good", Uint8Array.from([1, 2, 3]));
  const firstContext = FakeAudioContext.instances.at(-1);
  await releasedPlayer.releaseOutput();
  assert.equal(firstContext.state, "closed", "出力を閉じて端末の音声出力権を握り続けない");
  assert.equal(releasedPlayer.hasCustomSound("good"), true, "登録済みの評価音は保持する");
  await releasedPlayer.releaseOutput();
  assert.equal(releasedPlayer.play("good"), true);
  const secondContext = FakeAudioContext.instances.at(-1);
  assert.notEqual(secondContext, firstContext, "次の評価音で出力を作り直す");
  assert.equal(secondContext.bufferSources.length, 1, "保持した登録音をそのまま鳴らす");
  await releasedPlayer.close();
}

console.log("4段階評価の既定音・差替音の速度追従、音程維持、途中変更と1倍の下限、中断後の再開を確認しました。");
