import {
  createVocabularyAutomaticAnswerSequence,
  createVocabularySpeechGroups,
  createHistorySpeechReadings,
  createSpeechController,
  findAudioBounds,
  prepareClassicalChineseSpeechText,
  prepareMnemonicDisplayText,
  prepareMnemonicSpeechText,
  prepareSpeechText,
  prepareVocabularyMeaningSpeechText,
  selectJapaneseVoice,
  selectVoice,
} from "../public/speech.js";
import {
  azureSpeechVoices,
  defaultAzureSpeechVoiceId,
  defaultEnglishAzureSpeechVoiceId,
  englishAzureSpeechVoices,
  getEnglishVoices,
  getJapaneseVoices,
  getVoiceId,
  loadSpeechSettings,
  normalizeSpeechSettings,
  saveSpeechSettings,
} from "../public/speech-settings.js";

const textChecks = new Map([
  ["**鄭氏台湾(ていしたいわん)**を併合", "ていしたいわんを併合"],
  ["異教祭祀(さいし)を禁止", "異教さいしを禁止"],
  [
    "康熙帝・雍正帝・乾隆帝(こうきてい・ようせいてい・けんりゅうてい)",
    "こうきてい・ようせいてい・けんりゅうてい",
  ],
  ["坤輿万国全図(こんよばんこくぜんず)", "こんよばんこくぜんず"],
  [
    "内乱の1世紀を終わらせて元首政(げんしゅせい)を始めた人物は？",
    "内乱の1世紀を終わらせてげんしゅせいを始めた人物は？",
  ],
  [
    "カエサル暗殺と内戦を経て**オクタウィアヌス**が勝利し、共和政から**元首政(げんしゅせい)**へ移行した。",
    "カエサル暗殺と内戦を経てオクタウィアヌスが勝利し、共和政からげんしゅせいへ移行した。",
  ],
  ["古代中国・周(しゅう)を主な舞台に", "古代中国・しゅうを主な舞台に"],
  [
    "斉・楚・燕・韓・魏・趙・秦(しん)の七国",
    "斉・楚・燕・韓・魏・趙・しんの七国",
  ],
  [
    "中央集権化・徴兵・殖産興業(しょくさんこうぎょう)を進めた",
    "中央集権化・徴兵・しょくさんこうぎょうを進めた",
  ],
  ["この戦いで勝利した人物は？", "このたたかいで勝利した人物は？"],
  ["戦い方を変えた", "たたかい方を変えた"],
  ["ササン朝を破った", "ササンちょうを破った"],
  [
    "遼の王族・耶律大石（やりつたいせき）が中央アジアに建てた王朝。",
    "遼の王族・やりつたいせきが中央アジアに建てた王朝。",
  ],
  ["源頼朝は朝食後に出発した", "源頼朝は朝食後に出発した"],
  ["1914〜1918年", "1914から1918年"],
]);

for (const [source, expected] of textChecks) {
  const actual = prepareSpeechText(source);
  if (actual !== expected) {
    throw new Error(`読み上げ用文章が不正です: ${source} -> ${actual}`);
  }
}

if (prepareSpeechText("battle", "en-US") !== "battle") {
  throw new Error("日本語の発音補正が英語の読み上げに混ざっています。");
}

if (
  prepareClassicalChineseSpeechText("未〜・～べからず") !==
  "未ナニナニ・ナニナニべからず"
) {
  throw new Error("漢文の波線をナニナニへ置き換えられませんでした。");
}

const historySpeechReadings = createHistorySpeechReadings([
  { term: "アフリカの年", reading: "あふりかのとし" },
  { term: "キリスト教の国教化", reading: "きりすときょうのこっきょうか" },
  { term: "承久の乱", reading: "じょうきゅうのらん" },
  { term: "関ヶ原の戦い", reading: "せきがはらのたたかい" },
  { term: "アッバース朝", reading: "あっばーすちょう" },
]);
for (const subject of ["世界史", "世界史S", "世界史SO"]) {
  const readings = createHistorySpeechReadings([{ term: "後ウマイヤ朝", reading: "あとうまいやちょう" }]);
  for (const written of ["後ウマイヤ朝", "後ウマイヤ朝(あとうまいやちょう)", "後ウマイヤ朝（あとうまいやちょう）"]) {
    for (const tail of ["の建国者は？", "。", "はコルドバを都とした。\n後ウマイヤ朝について学ぶ。"] ) {
      const spoken = prepareSpeechText(written + tail, "ja-JP", readings);
      if (spoken !== ("こううまいやちょう" + tail).replaceAll("後ウマイヤ朝", "こううまいやちょう").replaceAll("\n", "。")) {
        throw new Error(`${subject}の後ウマイヤ朝の読みが不正です: ${spoken}`);
      }
    }
  }
}
const historyTermTextChecks = new Map([
  [
    "「アフリカの年(あふりかのとし)」について、この年に独立した国の多くの旧宗主国は？",
    "「あふりかのとし」について、この年に独立した国の多くの旧宗主国は？",
  ],
  [
    "**キリスト教の国教化(きりすときょうのこっきょうか)**へ移行した。",
    "きりすときょうのこっきょうかへ移行した。",
  ],
  ["承久の乱(じょうきゅうのらん)", "じょうきゅうのらん"],
  ["関ヶ原の戦い(せきがはらのたたかい)", "せきがはらのたたかい"],
  ["アッバース朝はバグダードを都とした", "あっばーすちょうはバグダードを都とした"],
  ["中国の黄河(こうが)流域", "中国のこうが流域"],
]);

for (const [source, expected] of historyTermTextChecks) {
  const actual = prepareSpeechText(source, "ja-JP", historySpeechReadings);
  if (actual !== expected) {
    throw new Error(`用語全体の読み上げ用文章が不正です: ${source} -> ${actual}`);
  }
}

const mnemonicSpeechChecks = new Map([
  [
    "**年号の語呂合わせ**\n**1600年：「ヒーロー丸々」（1600）関ヶ原の戦い**",
    "ヒーロー丸々関ヶ原の戦い",
  ],
  [
    "前27年〜後14年在位：「担う」（前27）から「いよ」（14年）までのアウグストゥス",
    "担うからいよまでのアウグストゥス",
  ],
  [
    "794年：「鳴くよ」（794）ウグイス、平安京|894年：「白紙」（894）にしよう、遣唐使",
    "鳴くよウグイス平安京。白紙にしよう遣唐使",
  ],
]);

for (const [source, expected] of mnemonicSpeechChecks) {
  const actual = prepareMnemonicSpeechText(source);
  if (actual !== expected) {
    throw new Error(`語呂合わせの読み上げ用文章が不正です: ${source} -> ${actual}`);
  }
}

const mnemonicDisplayChecks = new Map([
  [
    "1917年：行く、いいな（1917）ロシア革命",
    "行く、いいな（1917）ロシア革命",
  ],
  [
    "794年：「鳴くよ」（794）ウグイス、平安京|894年：「白紙」（894）にしよう、遣唐使",
    "鳴くよ（794）ウグイス、平安京 ／ 白紙（894）にしよう、遣唐使",
  ],
  [
    "**年号の語呂合わせ**\n**1600年：「ヒーロー丸々」（1600）関ヶ原の戦い**",
    "ヒーロー丸々（1600）関ヶ原の戦い",
  ],
]);

for (const [source, expected] of mnemonicDisplayChecks) {
  const actual = prepareMnemonicDisplayText(source);
  if (actual !== expected) {
    throw new Error(`語呂合わせの表示用文章が不正です: ${source} -> ${actual}`);
  }
}

if (
  prepareVocabularyMeaningSpeechText("～まで") !== "まで" ||
  prepareVocabularyMeaningSpeechText("〜から") !== "から" ||
  prepareVocabularyMeaningSpeechText("どちらも〜ない") !== "どちらもない"
) {
  throw new Error("英単語の日本語訳から省略記号の波線を除けませんでした。");
}

const vocabularyTerm = {
  term: "although",
  stages: {
    beginner: [
      {
        answer: "〜だけれども",
        acceptedAnswers: ["とはいえ", "にもかかわらず"],
        speech: {
          question: [{ text: "although", language: "en-US" }],
          answer: [
            { text: "〜だけれども", language: "ja-JP" },
            {
              text: "Although it was raining, we went for a walk.",
              language: "en-US",
            },
            {
              text: "雨が降っていたが、私たちは散歩に出かけた。",
              language: "ja-JP",
            },
          ],
        },
      },
    ],
  },
};
const vocabularySpeechGroups = createVocabularySpeechGroups(vocabularyTerm);
if (
  Object.keys(vocabularySpeechGroups).length !== 4 ||
  vocabularySpeechGroups.word.text !== "although" ||
  vocabularySpeechGroups.meaning.text !== "だけれども" ||
  vocabularySpeechGroups["example-english"].language !== "en-US" ||
  vocabularySpeechGroups["example-japanese"].text !==
    "雨が降っていたが、私たちは散歩に出かけた。"
) {
  throw new Error("英単語の4種類の読み上げ対象を分離できませんでした。");
}

const answerOnlySequence = createVocabularyAutomaticAnswerSequence(
  vocabularyTerm,
  "beginner",
);
const answerAndExamplesSequence = createVocabularyAutomaticAnswerSequence(
  vocabularyTerm,
  "beginner",
  { answer: true, exampleEnglish: true, exampleJapanese: true },
);
const integratedSequence = createVocabularyAutomaticAnswerSequence(
  vocabularyTerm,
  "integrated",
  { answer: true, exampleEnglish: true, exampleJapanese: true },
);
const japaneseExampleOnlySequence = createVocabularyAutomaticAnswerSequence(
  vocabularyTerm,
  "beginner",
  { answer: false, exampleJapanese: true },
);
if (
  answerOnlySequence.length !== 1 ||
  answerOnlySequence[0].target !== "vocabulary-meaning" ||
  answerOnlySequence[0].text !== "だけれども" ||
  answerAndExamplesSequence.map((segment) => segment.target).join("|") !==
    "vocabulary-meaning|vocabulary-example-english|vocabulary-example-japanese" ||
  integratedSequence.length !== 1 ||
  integratedSequence[0].target !== "vocabulary-example-japanese" ||
  japaneseExampleOnlySequence.length !== 1 ||
  japaneseExampleOnlySequence[0].target !== "vocabulary-example-japanese"
) {
  throw new Error("英単語の4種類の自動読み上げ対象を個別に選べませんでした。");
}

const voices = [
  { name: "English", lang: "en-US", voiceURI: "english" },
  { name: "日本語", lang: "ja-JP", voiceURI: "japanese-default", default: true },
  { name: "日本語 高品質", lang: "ja-JP", voiceURI: "japanese-natural" },
  { name: "English Natural", lang: "en-US", voiceURI: "english-natural" },
];
if (selectJapaneseVoice(voices)?.name !== "日本語") {
  throw new Error("日本語音声を優先して選べませんでした。");
}
if (
  selectJapaneseVoice(voices, "japanese-natural")?.name !== "日本語 高品質" ||
  getJapaneseVoices({ getVoices: () => voices }).length !== 2 ||
  getEnglishVoices({ getVoices: () => voices }).length !== 2 ||
  selectVoice(voices, "en-US", "english-natural")?.name !== "English Natural" ||
  getVoiceId(voices[2]) !== "japanese-natural"
) {
  throw new Error("端末内の日本語音声を一覧化・選択できませんでした。");
}

const storedValues = new Map();
const fakeStorage = {
  getItem: (key) => storedValues.get(key) ?? null,
  setItem: (key, value) => storedValues.set(key, value),
};
const savedSpeechSettings = saveSpeechSettings(
  {
    source: "device",
    azureVoiceId: "ja-JP-KeitaNeural",
    englishAzureVoiceId: "en-US-GuyNeural",
    voiceId: "japanese-natural",
    englishVoiceId: "english-natural",
    rate: 0.9,
  },
  fakeStorage,
);
if (
  loadSpeechSettings(fakeStorage).voiceId !== "japanese-natural" ||
  loadSpeechSettings(fakeStorage).azureVoiceId !== "ja-JP-KeitaNeural" ||
  loadSpeechSettings(fakeStorage).englishAzureVoiceId !== "en-US-GuyNeural" ||
  loadSpeechSettings(fakeStorage).englishVoiceId !== "english-natural" ||
  savedSpeechSettings.rate !== 0.9 ||
  normalizeSpeechSettings({ source: "invalid", rate: 9 }).source !== "cloud" ||
  normalizeSpeechSettings({ azureVoiceId: "invalid" }).azureVoiceId !==
    defaultAzureSpeechVoiceId ||
  azureSpeechVoices.length !== 7 ||
  englishAzureSpeechVoices.length !== 4 ||
  normalizeSpeechSettings({ englishAzureVoiceId: "invalid" })
    .englishAzureVoiceId !== defaultEnglishAzureSpeechVoiceId ||
  azureSpeechVoices.filter((voice) => voice.label.includes("男性")).length !== 3 ||
  normalizeSpeechSettings({ rate: 9 }).rate !== 3
) {
  throw new Error("Azure・端末音声の設定を安全に保存・復元できませんでした。");
}

class FakeUtterance {
  constructor(text) {
    this.text = text;
    this.lang = "";
    this.rate = 0;
    this.voice = null;
    this.onend = null;
    this.onerror = null;
  }
}

const spoken = [];
const targetChanges = [];
const synthesis = {
  cancelCount: 0,
  cancel() {
    this.cancelCount += 1;
  },
  getVoices() {
    return voices;
  },
  speak(utterance) {
    spoken.push({
      text: utterance.text,
      lang: utterance.lang,
      rate: utterance.rate,
      voice: utterance.voice?.name,
    });
    utterance.onend();
  },
};

const controller = createSpeechController({
  synthesis,
  Utterance: FakeUtterance,
  getSettings: () => ({
    source: "device",
    voiceId: "japanese-natural",
    englishVoiceId: "english-natural",
    rate: 3,
  }),
  onTargetChange: (target) => targetChanges.push(target),
});
if (!controller.supported) {
  throw new Error("利用可能な読み上げ機能を認識できませんでした。");
}
let completionCount = 0;
controller.speak(
  [
    { target: "answer", text: "康熙帝(こうきてい)" },
    {
      target: "answer",
      text: "Although it was raining, we went for a walk.",
      language: "en-US",
    },
    { target: "mnemonic", text: "1492年。意欲に燃えるコロンブス" },
    { target: "overview", text: "鄭氏台湾(ていしたいわん)" },
  ],
  { onComplete: () => completionCount += 1 },
);
await new Promise((resolve) => setTimeout(resolve, 0));
if (
  spoken.length !== 4 ||
  spoken[0].text !== "こうきてい" ||
  spoken[1].text !== "Although it was raining, we went for a walk." ||
  spoken[1].lang !== "en-US" ||
  spoken[1].voice !== "English Natural" ||
  spoken[2].text !== "1492年。意欲に燃えるコロンブス" ||
  spoken[3].text !== "ていしたいわん" ||
  [spoken[0], spoken[2], spoken[3]].some(
    (item) =>
      item.lang !== "ja-JP" ||
      item.rate !== 3 ||
      item.voice !== "日本語 高品質",
  ) ||
  targetChanges.at(-1) !== "" ||
  completionCount !== 1
) {
  throw new Error("回答、語呂合わせ、解説を順番に読み上げられませんでした。");
}

const guardedSpoken = [];
let dispatchingSpeechEnd = false;
const guardedSynthesis = {
  cancel() {},
  getVoices() {
    return [];
  },
  speak(utterance) {
    if (dispatchingSpeechEnd) {
      return;
    }
    guardedSpoken.push(utterance.text);
    dispatchingSpeechEnd = true;
    utterance.onend();
    dispatchingSpeechEnd = false;
  },
};
const guardedController = createSpeechController({
  synthesis: guardedSynthesis,
  Utterance: FakeUtterance,
  getSettings: () => ({ source: "device", rate: 1 }),
});
guardedController.speak(
  [
    { target: "question", text: "問題前半" },
    { target: "question", text: "問題後半" },
  ],
  {
    onComplete: () => {
      guardedController.speak([{ target: "answer", text: "回答" }]);
    },
  },
);
await new Promise((resolve) => setTimeout(resolve, 0));
if (guardedSpoken.join("|") !== "問題前半|問題後半|回答") {
  throw new Error("音声の終了処理後に次のパーツと回答の読み上げを継続できませんでした。");
}

const resetRequiredSpoken = [];
let canStartResetRequiredSpeech = true;
const resetRequiredSynthesis = {
  cancel() {
    canStartResetRequiredSpeech = true;
  },
  getVoices() {
    return [];
  },
  speak(utterance) {
    if (!canStartResetRequiredSpeech) {
      return;
    }
    canStartResetRequiredSpeech = false;
    resetRequiredSpoken.push(utterance.text);
    utterance.onend();
  },
};
const resetRequiredController = createSpeechController({
  synthesis: resetRequiredSynthesis,
  Utterance: FakeUtterance,
  getSettings: () => ({ source: "device", rate: 1 }),
});
resetRequiredController.speak(
  [{ target: "question", text: "問題" }],
  {
    onComplete: () => {
      resetRequiredController.speak([{ target: "answer", text: "回答" }]);
    },
  },
);
await new Promise((resolve) => setTimeout(resolve, 0));
if (resetRequiredSpoken.join("|") !== "問題|回答") {
  throw new Error("次の音声前に端末の読み上げ機能を初期化できませんでした。");
}

const delayedStartSpoken = [];
let delayedStartAttempts = 0;
const delayedStartSynthesis = {
  cancel() {},
  resume() {},
  getVoices() {
    return [];
  },
  speak(utterance) {
    delayedStartAttempts += 1;
    if (delayedStartAttempts === 1) {
      return;
    }
    delayedStartSpoken.push(utterance.text);
    utterance.onstart();
    utterance.onend();
  },
};
let delayedStartCompletions = 0;
const delayedStartController = createSpeechController({
  synthesis: delayedStartSynthesis,
  Utterance: FakeUtterance,
  deviceStartTimeoutMs: 1,
  getSettings: () => ({ source: "device", rate: 1 }),
});
delayedStartController.speak(
  [{ target: "answer", text: "一秒待機後の回答" }],
  { onComplete: () => delayedStartCompletions += 1 },
);
await new Promise((resolve) => setTimeout(resolve, 20));
if (
  delayedStartAttempts !== 2 ||
  delayedStartSpoken.join("|") !== "一秒待機後の回答" ||
  delayedStartCompletions !== 1
) {
  throw new Error("待機後に始まらない端末音声を自動で再試行できませんでした。");
}

let neverStartAttempts = 0;
let neverStartCompletions = 0;
let neverStartErrors = 0;
const neverStartController = createSpeechController({
  synthesis: {
    cancel() {},
    resume() {},
    getVoices() {
      return [];
    },
    speak() {
      neverStartAttempts += 1;
    },
  },
  Utterance: FakeUtterance,
  deviceStartTimeoutMs: 1,
  getSettings: () => ({ source: "device", rate: 1 }),
});
neverStartController.speak(
  [{ target: "answer", text: "開始できない回答" }],
  {
    onComplete: () => neverStartCompletions += 1,
    onError: () => neverStartErrors += 1,
  },
);
await new Promise((resolve) => setTimeout(resolve, 80));
if (
  neverStartAttempts !== 2 ||
  neverStartCompletions !== 0 ||
  neverStartErrors !== 1
) {
  throw new Error("端末音声の再試行失敗を読み上げ完了として扱っています。");
}

let pausedDeviceUtterance = null;
let pausedDeviceCompletions = 0;
const pausedDeviceSynthesis = {
  cancelCount: 0,
  pauseCount: 0,
  resumeCount: 0,
  cancel() {
    this.cancelCount += 1;
  },
  pause() {
    this.pauseCount += 1;
  },
  resume() {
    this.resumeCount += 1;
  },
  getVoices() {
    return [];
  },
  speak(utterance) {
    pausedDeviceUtterance = utterance;
    utterance.onstart();
  },
};
const pausedDeviceController = createSpeechController({
  synthesis: pausedDeviceSynthesis,
  Utterance: FakeUtterance,
  getSettings: () => ({ source: "device", rate: 1 }),
});
pausedDeviceController.speak(
  [{ target: "answer", text: "ニューディール政策" }],
  { onComplete: () => pausedDeviceCompletions += 1 },
);
const deviceCancelCountBeforePause = pausedDeviceSynthesis.cancelCount;
if (
  !pausedDeviceController.pause() ||
  !pausedDeviceController.paused ||
  pausedDeviceSynthesis.pauseCount !== 1 ||
  pausedDeviceSynthesis.cancelCount !== deviceCancelCountBeforePause
) {
  throw new Error("端末音声を読み上げ位置を失わずに一時停止できませんでした。");
}
if (
  !pausedDeviceController.resume() ||
  pausedDeviceController.paused ||
  pausedDeviceSynthesis.resumeCount !== 2
) {
  throw new Error("端末音声を一時停止した位置から再開できませんでした。");
}
pausedDeviceUtterance.onend();
await new Promise((resolve) => setTimeout(resolve, 0));
if (pausedDeviceCompletions !== 1) {
  throw new Error("再開した端末音声を最後まで完了できませんでした。");
}

const hangingCloudFallbackSpoken = [];
let hangingCloudCompletions = 0;
class HangingCloudAudio {
  constructor() {
    this.playbackRate = 1;
    this.onplaying = null;
    this.onended = null;
    this.onerror = null;
  }

  async play() {
    await new Promise(() => {});
  }

  pause() {}
}
const hangingCloudController = createSpeechController({
  synthesis: {
    cancel() {},
    resume() {},
    getVoices() {
      return [];
    },
    speak(utterance) {
      hangingCloudFallbackSpoken.push(utterance.text);
      utterance.onstart();
      utterance.onend();
    },
  },
  Utterance: FakeUtterance,
  AudioPlayer: HangingCloudAudio,
  createObjectUrl: () => "blob:hanging-cloud",
  revokeObjectUrl: () => {},
  requestCloudAudio: async () => ({ type: "audio/mpeg", size: 100 }),
  cloudStartTimeoutMs: 1,
  deviceStartTimeoutMs: 1,
  getSettings: () => ({
    source: "cloud",
    azureVoiceId: "ja-JP-KeitaNeural",
    rate: 1,
  }),
});
hangingCloudController.speak(
  [{ target: "answer", text: "自然音声が始まらない回答" }],
  { onComplete: () => hangingCloudCompletions += 1 },
);
await new Promise((resolve) => setTimeout(resolve, 20));
if (
  hangingCloudFallbackSpoken.join("|") !== "自然音声が始まらない回答" ||
  hangingCloudCompletions !== 1
) {
  throw new Error("始まらない自然音声から端末音声へ自動切替できませんでした。");
}

const silentCloudFallbackSpoken = [];
let silentCloudCompletions = 0;
class SilentCloudAudio {
  constructor() {
    this.src = "";
    this.playbackRate = 1;
    this.onplaying = null;
    this.onended = null;
    this.onerror = null;
  }

  async play() {}

  load() {}

  removeAttribute(name) {
    if (name === "src") {
      this.src = "";
    }
  }

  pause() {}
}
const silentCloudController = createSpeechController({
  synthesis: {
    cancel() {},
    resume() {},
    getVoices() {
      return [];
    },
    speak(utterance) {
      silentCloudFallbackSpoken.push(utterance.text);
      utterance.onstart();
      utterance.onend();
    },
  },
  Utterance: FakeUtterance,
  AudioPlayer: SilentCloudAudio,
  createObjectUrl: () => "blob:silent-cloud",
  revokeObjectUrl: () => {},
  requestCloudAudio: async () => ({ type: "audio/mpeg", size: 100 }),
  cloudStartTimeoutMs: 1,
  deviceStartTimeoutMs: 1,
  getSettings: () => ({
    source: "cloud",
    azureVoiceId: "ja-JP-KeitaNeural",
    rate: 1,
  }),
});
silentCloudController.speak(
  [{ target: "answer", text: "成功扱いでも無音の回答" }],
  { onComplete: () => silentCloudCompletions += 1 },
);
await new Promise((resolve) => setTimeout(resolve, 20));
if (
  silentCloudFallbackSpoken.join("|") !== "成功扱いでも無音の回答" ||
  silentCloudCompletions !== 1
) {
  throw new Error("成功扱いでも始まらない自然音声を検知できませんでした。");
}

const unfinishedCloudFallbackSpoken = [];
let unfinishedCloudCompletions = 0;
class UnfinishedCloudAudio extends SilentCloudAudio {
  async play() {
    this.onplaying?.();
  }
}
const unfinishedCloudController = createSpeechController({
  synthesis: {
    cancel() {},
    resume() {},
    getVoices() {
      return [];
    },
    speak(utterance) {
      unfinishedCloudFallbackSpoken.push(utterance.text);
      utterance.onstart();
      utterance.onend();
    },
  },
  Utterance: FakeUtterance,
  AudioPlayer: UnfinishedCloudAudio,
  createObjectUrl: () => "blob:unfinished-cloud",
  revokeObjectUrl: () => {},
  requestCloudAudio: async () => ({ type: "audio/mpeg", size: 100 }),
  cloudStartTimeoutMs: 1,
  cloudPlaybackTimeoutMs: 1,
  deviceStartTimeoutMs: 1,
  getSettings: () => ({
    source: "cloud",
    azureVoiceId: "ja-JP-KeitaNeural",
    rate: 1,
  }),
});
unfinishedCloudController.speak(
  [{ target: "answer", text: "終了しない自然音声" }],
  { onComplete: () => unfinishedCloudCompletions += 1 },
);
await new Promise((resolve) => setTimeout(resolve, 20));
if (
  unfinishedCloudFallbackSpoken.join("|") !== "終了しない自然音声" ||
  unfinishedCloudCompletions !== 1
) {
  throw new Error("終了しない自然音声を時間切れにできませんでした。");
}

const cloudRequests = [];
const cloudTargets = [];
const revokedUrls = [];
const playedRates = [];
class FakeAudio {
  constructor() {
    this.src = "";
    this.playbackRate = 1;
    this.onplaying = null;
    this.onended = null;
    this.onerror = null;
  }

  async play() {
    playedRates.push(this.playbackRate);
    this.onplaying?.();
    queueMicrotask(() => this.onended?.());
  }

  load() {}

  removeAttribute(name) {
    if (name === "src") {
      this.src = "";
    }
  }

  pause() {}
}
const cloudController = createSpeechController({
  synthesis,
  Utterance: FakeUtterance,
  AudioPlayer: FakeAudio,
  createObjectUrl: () => `blob:test-${cloudRequests.length}`,
  revokeObjectUrl: (url) => revokedUrls.push(url),
  requestCloudAudio: async (text, voice) => {
    cloudRequests.push({ text, voice });
    return { type: "audio/mpeg", size: 100 };
  },
  getSettings: () => ({
    source: "cloud",
    azureVoiceId: "ja-JP-KeitaNeural",
    voiceId: "",
    rate: 3,
  }),
  onTargetChange: (target) => cloudTargets.push(target),
});
cloudController.speak([
  { target: "answer", text: "康熙帝(こうきてい)" },
  { target: "overview", text: "鄭氏台湾(ていしたいわん)" },
  { target: "question", text: "この戦いで勝利した人物は？" },
]);
await new Promise((resolve) => setTimeout(resolve, 0));
if (
  cloudRequests.map((request) => request.text).join("|") !==
    "こうきてい|ていしたいわん|このたたかいで勝利した人物は？" ||
  cloudRequests.some(
    (request) => request.voice !== "ja-JP-KeitaNeural",
  ) ||
  cloudTargets.at(-1) !== "" ||
  playedRates.length !== 3 ||
  playedRates.some((rate) => rate !== 3) ||
  revokedUrls.length !== 3
) {
  throw new Error("Azure音声を回答から解説へ順番に再生できませんでした。");
}

let pausedCloudAudio = null;
let pausedCloudCompletions = 0;
const pausedCloudRevokedUrls = [];
class PausedCloudAudio {
  constructor() {
    this.src = "";
    this.currentTime = 0;
    this.playbackRate = 1;
    this.playCount = 0;
    this.pauseCount = 0;
    this.onplaying = null;
    this.onended = null;
    this.onerror = null;
  }

  async play() {
    // 再生器は2台あるため、実際に鳴っている方を確認対象にする。
    pausedCloudAudio = this;
    this.playCount += 1;
    this.onplaying?.();
  }

  pause() {
    this.pauseCount += 1;
  }

  load() {}

  removeAttribute(name) {
    if (name === "src") {
      this.src = "";
    }
  }
}
const pausedCloudController = createSpeechController({
  synthesis: null,
  Utterance: null,
  AudioPlayer: PausedCloudAudio,
  createObjectUrl: () => "blob:paused-cloud",
  revokeObjectUrl: (url) => pausedCloudRevokedUrls.push(url),
  requestCloudAudio: async () => ({ type: "audio/mpeg", size: 100 }),
  getSettings: () => ({
    source: "cloud",
    azureVoiceId: "ja-JP-NanamiNeural",
    rate: 1,
  }),
});
pausedCloudController.speak(
  [{ target: "answer", text: "ニューディール政策" }],
  { onComplete: () => pausedCloudCompletions += 1 },
);
await new Promise((resolve) => setTimeout(resolve, 0));
pausedCloudAudio.currentTime = 1.25;
const pausedCloudSource = pausedCloudAudio.src;
if (
  !pausedCloudController.pause() ||
  !pausedCloudController.paused ||
  pausedCloudAudio.pauseCount !== 1 ||
  pausedCloudAudio.currentTime !== 1.25 ||
  pausedCloudAudio.src !== pausedCloudSource ||
  pausedCloudRevokedUrls.length !== 0
) {
  throw new Error("自然音声の再生位置と音声本体を保持して一時停止できませんでした。");
}
if (
  !pausedCloudController.resume() ||
  pausedCloudController.paused ||
  pausedCloudAudio.playCount !== 2 ||
  pausedCloudAudio.currentTime !== 1.25 ||
  pausedCloudAudio.src !== pausedCloudSource
) {
  throw new Error("自然音声を一時停止した位置から再開できませんでした。");
}
pausedCloudAudio.onended();
await new Promise((resolve) => setTimeout(resolve, 0));
if (
  pausedCloudCompletions !== 1 ||
  pausedCloudRevokedUrls.join("|") !== "blob:paused-cloud"
) {
  throw new Error("再開した自然音声を最後まで完了できませんでした。");
}

const preloadRequests = [];
const preloadResolvers = [];
const preloadPlayers = [];
class PreloadAudio {
  constructor() {
    this.src = "";
    this.playbackRate = 1;
    this.onplaying = null;
    this.onended = null;
    this.onerror = null;
    preloadPlayers.push(this);
  }

  async play() {
    preloadPlayCalls += 1;
  }

  load() {}

  removeAttribute(name) {
    if (name === "src") {
      this.src = "";
    }
  }

  pause() {}
}
let preloadPlayCalls = 0;
const preloadController = createSpeechController({
  synthesis,
  Utterance: FakeUtterance,
  AudioPlayer: PreloadAudio,
  createObjectUrl: () => `blob:preload-${preloadPlayers.length}`,
  revokeObjectUrl: () => {},
  requestCloudAudio: (text) => {
    preloadRequests.push(text);
    return new Promise((resolve) => preloadResolvers.push(resolve));
  },
  getSettings: () => ({
    source: "cloud",
    azureVoiceId: "ja-JP-KeitaNeural",
    rate: 3,
  }),
});
const preloadSegments = [
  { target: "question", text: "問題" },
  { target: "answer", text: "回答" },
];
const preloadResult = preloadController.preload(preloadSegments);
await new Promise((resolve) => setTimeout(resolve, 0));
if (preloadRequests.join("|") !== "問題|回答") {
  throw new Error("次の音声パーツを並行して先読みできませんでした。");
}
for (const resolve of preloadResolvers) {
  resolve({ type: "audio/mpeg", size: 100 });
}
await preloadResult;
preloadController.speak(preloadSegments);
// 取り寄せ済みの音声は、通信の完了を待つ処理を挟まずにその場で再生を始める。
if (preloadPlayCalls !== 1) {
  throw new Error("取り寄せ済みの音声をその場で再生し始められませんでした。");
}
await new Promise((resolve) => setTimeout(resolve, 0));
if (preloadRequests.length !== 2 || preloadPlayers.length !== 2) {
  throw new Error("先読みした音声を再取得せずに再生できませんでした。");
}
preloadPlayers[0].onended();
await new Promise((resolve) => setTimeout(resolve, 0));
// 再生器は最初に用意した2台だけを交互に使い、パーツごとに作り直さない。
if (preloadPlayers.length !== 2 || preloadPlayCalls !== 2) {
  throw new Error("先読みした別パーツを2台の音声再生器で交互に再生できませんでした。");
}
preloadPlayers[1].onended();

// Azure音声は前後の無音を削った音声を頼み、削らない設定の音声とは別に覚えておく。
const trimRequests = [];
const createTrimController = (options = {}) => createSpeechController({
  synthesis,
  Utterance: FakeUtterance,
  AudioPlayer: PreloadAudio,
  createObjectUrl: () => "blob:trim",
  revokeObjectUrl: () => {},
  requestCloudAudio: async (text, voice, language, options) => {
    trimRequests.push(`${text}:${options?.trimSilence === true}`);
    return { type: "audio/mpeg", size: 100 };
  },
  getSettings: () => ({
    source: "cloud",
    englishAzureVoiceId: "en-US-GuyNeural",
  }),
  ...options,
});
const trimSegments = [{ target: "question", text: "although", language: "en-US" }];
const trimController = createTrimController();
await trimController.preload(trimSegments);
await trimController.preload(trimSegments);
await createTrimController({ trimCloudSilence: false }).preload(trimSegments);
if (trimRequests.join("|") !== "although:true|although:false") {
  throw new Error("前後の無音を削る音声を既定で取り寄せ、同じ音声を再取得しない処理が不正です。");
}

let iosGestureActive = false;
let iosAudioPlayers = 0;
let iosCloudRequests = 0;
let iosDeviceAttempts = 0;
let iosPlaybackErrors = 0;
let iosPlaybackCompletions = 0;
const iosPlayResults = [];
const iosPlayedRates = [];
class IosRestrictedAudio {
  constructor() {
    iosAudioPlayers += 1;
    this.src = "";
    this.playbackRate = 1;
    this.onplaying = null;
    this.onended = null;
    this.onerror = null;
    this.unlocked = false;
  }

  load() {
    if (this.src) {
      this.playbackRate = 1;
    }
    if (iosGestureActive) {
      this.unlocked = true;
    }
  }

  async play() {
    if (!this.unlocked) {
      iosPlayResults.push("blocked");
      const error = new Error("利用者操作が必要です。");
      error.name = "NotAllowedError";
      throw error;
    }
    iosPlayResults.push("played");
    iosPlayedRates.push(this.playbackRate);
    this.onplaying?.();
    queueMicrotask(() => this.onended?.());
  }

  removeAttribute(name) {
    if (name === "src") {
      this.src = "";
    }
  }

  pause() {}
}
const iosController = createSpeechController({
  synthesis: {
    cancel() {},
    resume() {},
    getVoices() {
      return [];
    },
    speak() {
      iosDeviceAttempts += 1;
    },
  },
  Utterance: FakeUtterance,
  AudioPlayer: IosRestrictedAudio,
  createObjectUrl: () => "blob:ios-restricted",
  revokeObjectUrl: () => {},
  requestCloudAudio: async () => {
    iosCloudRequests += 1;
    return { type: "audio/mpeg", size: 100 };
  },
  cloudStartTimeoutMs: 5,
  cloudPlaybackTimeoutMs: 20,
  getSettings: () => ({
    source: "cloud",
    azureVoiceId: "ja-JP-NanamiNeural",
    rate: 1.75,
  }),
});
const iosFirstSegment = [{ target: "question", text: "最初の問題" }];
iosController.speak(iosFirstSegment, {
  onComplete: () => iosPlaybackCompletions += 1,
  onError: () => iosPlaybackErrors += 1,
});
await new Promise((resolve) => setTimeout(resolve, 0));
iosGestureActive = true;
iosController.unlock();
iosGestureActive = false;
iosController.speak(iosFirstSegment, {
  onComplete: () => iosPlaybackCompletions += 1,
  onError: () => iosPlaybackErrors += 1,
});
await new Promise((resolve) => setTimeout(resolve, 0));
iosController.speak([{ target: "question", text: "次の問題" }], {
  onComplete: () => iosPlaybackCompletions += 1,
  onError: () => iosPlaybackErrors += 1,
});
await new Promise((resolve) => setTimeout(resolve, 0));
if (
  iosAudioPlayers !== 2 ||
  iosCloudRequests !== 2 ||
  iosDeviceAttempts !== 0 ||
  iosPlaybackErrors !== 1 ||
  iosPlaybackCompletions !== 2 ||
  iosPlayResults.join("|") !== "blocked|played|played" ||
  iosPlayedRates.some((rate) => rate !== 1.75)
) {
  throw new Error("iPhoneで最初に許可した2台の音声再生器と設定速度を維持できませんでした。");
}

const fallbackSpokenBefore = spoken.length;
const fallbackMessages = [];
const fallbackController = createSpeechController({
  synthesis,
  Utterance: FakeUtterance,
  AudioPlayer: FakeAudio,
  createObjectUrl: () => "blob:fallback",
  revokeObjectUrl: () => {},
  requestCloudAudio: async () => {
    throw new Error("Cloudflare停止中");
  },
  getSettings: () => ({
    source: "cloud",
    voiceId: "japanese-natural",
    rate: 1,
  }),
  onFallback: (error) => fallbackMessages.push(error.message),
});
fallbackController.speak([{ target: "question", text: "問題" }]);
await new Promise((resolve) => setTimeout(resolve, 0));
if (
  fallbackMessages[0] !== "Cloudflare停止中" ||
  spoken.length !== fallbackSpokenBefore + 1 ||
  spoken.at(-1).voice !== "日本語 高品質"
) {
  throw new Error("Cloudflare失敗時に選択した端末音声へ切り替えられませんでした。");
}

let unavailableCloudCompletions = 0;
let unavailableCloudErrors = 0;
const unavailableCloudController = createSpeechController({
  synthesis: null,
  Utterance: null,
  AudioPlayer: FakeAudio,
  createObjectUrl: () => "blob:unavailable-cloud",
  revokeObjectUrl: () => {},
  requestCloudAudio: async () => {
    throw new Error("自然音声を取得できません");
  },
  getSettings: () => ({
    source: "cloud",
    azureVoiceId: "ja-JP-KeitaNeural",
    rate: 1,
  }),
});
unavailableCloudController.speak(
  [{ target: "question", text: "読み飛ばしてはいけない問題" }],
  {
    onComplete: () => unavailableCloudCompletions += 1,
    onError: () => unavailableCloudErrors += 1,
  },
);
await new Promise((resolve) => setTimeout(resolve, 0));
if (unavailableCloudCompletions !== 0 || unavailableCloudErrors !== 1) {
  throw new Error("再生できない自然音声を読み上げ完了として扱っています。");
}
controller.stop();
if (controller.currentTarget !== "" || synthesis.cancelCount < 1) {
  throw new Error("読み上げを停止できませんでした。");
}

const unsupported = createSpeechController({ synthesis: null, Utterance: null });
if (unsupported.supported || unsupported.speak([{ target: "question", text: "問題" }])) {
  throw new Error("読み上げ非対応端末の判定が不正です。");
}

// 波形から声の範囲を探す。しきい値以下の小さな揺れは無音として扱う。
{
  const samples = new Float32Array(1000);
  samples.fill(0.001, 0, 100);
  samples.fill(0.3, 100, 700);
  samples[750] = 0.002;
  const bounds = findAudioBounds(samples, 1000);
  if (
    Math.abs(bounds.leadSeconds - 0.1) > 1e-9 ||
    Math.abs(bounds.soundEndSeconds - 0.7) > 1e-9 ||
    Math.abs(bounds.tailSeconds - 0.3) > 1e-9 ||
    findAudioBounds(new Float32Array(10), 1000).tailSeconds !== 0 ||
    findAudioBounds([], 1000) !== null
  ) {
    throw new Error("波形から声の始まりと終わりを求められませんでした。");
  }
}

// 2台の再生器を交互に使い、次の音声を先に読み込んで待ちなしで切り替える。無音は解析結果で飛ばす。
const stagedPlayers = [];
const stagedEvents = [];
class StagedAudio {
  constructor() {
    this.index = stagedPlayers.length;
    stagedPlayers.push(this);
    this.src = "";
    this.playbackRate = 1;
    this.defaultPlaybackRate = 1;
    this.position = 0;
    this.playStartedAt = 0;
    this.readyState = 0;
    this.loads = 0;
    this.playing = false;
    this.onplaying = null;
    this.onended = null;
    this.onerror = null;
    this.onloadedmetadata = null;
  }

  // 本物の再生器と同じく、鳴っている間は再生位置が速度に応じて進む。
  get currentTime() {
    if (!this.playing) return this.position;
    return this.position + ((Date.now() - this.playStartedAt) / 1000) * this.playbackRate;
  }

  set currentTime(value) {
    this.position = Number(value);
    if (this.playing) this.playStartedAt = Date.now();
  }

  load() {
    this.loads += 1;
    if (this.src) {
      this.readyState = 1;
      queueMicrotask(() => this.onloadedmetadata?.());
    } else {
      this.readyState = 0;
    }
  }

  async play() {
    stagedEvents.push(`再生:${this.index}:${this.src}:${this.currentTime.toFixed(3)}`);
    this.playing = true;
    this.playStartedAt = Date.now();
    queueMicrotask(() => this.onplaying?.());
  }

  pause() {
    if (this.playing) this.position = this.currentTime;
    this.playing = false;
  }

  removeAttribute(name) {
    if (name === "src") {
      this.src = "";
    }
  }
}
const stagedBounds = {
  "問題A": null,
  "回答A": { leadSeconds: 0.1, soundEndSeconds: 0.5, tailSeconds: 0.2, durationSeconds: 0.7 },
  "問題B": { leadSeconds: 0.08, soundEndSeconds: 0.4, tailSeconds: 0.01, durationSeconds: 0.41 },
};
let stagedUrlCount = 0;
const stagedController = createSpeechController({
  synthesis,
  Utterance: FakeUtterance,
  AudioPlayer: StagedAudio,
  createObjectUrl: (blob) => `blob:staged-${blob.text}-${++stagedUrlCount}`,
  revokeObjectUrl: (url) => stagedEvents.push(`解放:${url}`),
  requestCloudAudio: async (text) => {
    stagedEvents.push(`取得:${text}`);
    return { type: "audio/mpeg", size: 100, text };
  },
  decodeAudioBounds: async (blob) => stagedBounds[blob.text] ?? null,
  getSettings: () => ({ source: "cloud", azureVoiceId: "ja-JP-KeitaNeural", rate: 2 }),
});
const settleStaged = async (times = 3) => {
  for (let index = 0; index < times; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};
const stagedCompletions = [];
const speakStaged = (text, target) =>
  stagedController.speak([{ target, text }], {
    onComplete: () => stagedCompletions.push({ text, at: Date.now() }),
  });
stagedController.unlock();
if (stagedPlayers.length !== 2 || stagedPlayers.some((player) => player.loads !== 1)) {
  throw new Error("2台の音声再生器を最初の操作でまとめて許可できませんでした。");
}
speakStaged("問題A", "question");
stagedController.stage([{ target: "answer", text: "回答A" }]);
await settleStaged();
const answerPlayer = stagedPlayers[1];
if (
  !stagedPlayers[0].playing ||
  !answerPlayer.src.startsWith("blob:staged-回答A") ||
  Math.abs(answerPlayer.currentTime - 0.085) > 0.001
) {
  throw new Error("次の音声を空いている再生器へ読み込み、声の直前へ位置を進められませんでした。");
}
const fetchesBeforeAnswer = stagedEvents.filter((event) => event.startsWith("取得:")).length;
stagedPlayers[0].onended();
await new Promise((resolve) => queueMicrotask(resolve));
if (stagedCompletions.length !== 1 || stagedCompletions[0].text !== "問題A") {
  throw new Error("問題Aの読み上げ完了を知らせられませんでした。");
}
// 問題Aの終了直後に、利用者側が回答Aの読み上げを頼む。
const answerStartedAt = Date.now();
speakStaged("回答A", "answer");
if (
  stagedEvents.at(-1) !== `再生:1:${answerPlayer.src}:0.085` ||
  stagedEvents.filter((event) => event.startsWith("取得:")).length !== fetchesBeforeAnswer ||
  answerPlayer.playbackRate !== 2
) {
  throw new Error("読み込み済みの再生器を、通信や読み込みを待たずにその場で再生できませんでした。");
}
stagedController.stage([{ target: "question", text: "問題B" }]);
await settleStaged();
if (
  !stagedPlayers[0].src.startsWith("blob:staged-問題B") ||
  Math.abs(stagedPlayers[0].currentTime - 0.065) > 0.001
) {
  throw new Error("回答の再生中に次の問題を空いた再生器へ読み込めませんでした。");
}
// 回答Aは声の終わり0.5秒＋余白0.03秒を2倍速で再生した約0.22秒後に、無音を待たず終了扱いになる。
await new Promise((resolve) => setTimeout(resolve, 320));
const answerCompletion = stagedCompletions.find((entry) => entry.text === "回答A");
const answerCompletedAfterMs = answerCompletion ? answerCompletion.at - answerStartedAt : -1;
if (
  !answerCompletion ||
  answerPlayer.playing ||
  answerCompletedAfterMs < 150 ||
  answerCompletedAfterMs > 310
) {
  throw new Error(`声の終わりに合わせて次へ進めませんでした（${answerCompletedAfterMs}ms）。`);
}
// 読み込み済みの内容と違う音声を頼んだ時は、その読み込みを捨てて同じ再生器を使い直す。
const staleUrl = stagedPlayers[0].src;
speakStaged("問題C", "question");
await settleStaged();
if (
  !stagedEvents.includes(`解放:${staleUrl}`) ||
  !stagedPlayers[0].src.startsWith("blob:staged-問題C") ||
  !stagedPlayers[0].playing
) {
  throw new Error("読み込み済みと違う音声を頼んだ時に再生器を使い直せませんでした。");
}
stagedController.stop();

// イヤホンの付け外しで端末側の音声経路が切り替わる状況を、実音声なしで再現する。
// 音の出力先は再生器ではなく端末側の音声セッションで決まり、利用者の操作の中で鳴らすと取り直せるものとして模擬する。
let outputSessionReady = true;
let outputGesture = false;
let outputRequests = 0;
let outputCompletions = 0;
let outputErrors = 0;
const outputErrorDetails = [];
const outputPlayers = [];
const outputRevocations = [];
const probeBlobSizes = [];
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
class ReconnectedAudio {
  constructor() {
    this.src = "";
    this.paused = true;
    this.currentTime = 0;
    this.playbackRate = 1;
    this.permitted = false;
    this.plays = 0;
    outputPlayers.push(this);
  }
  load() { if (outputGesture) this.permitted = true; }
  async play() {
    if (!this.permitted) {
      const error = new Error("再生許可が必要です。"); error.name = "NotAllowedError"; throw error;
    }
    this.plays += 1;
    this.paused = false;
    // 利用者の操作の中で鳴らした時だけ、端末側の音声の出力権を取り直せる。
    if (outputGesture) outputSessionReady = true;
    this.audible = outputSessionReady;
    this.onplaying?.();
  }
  pause() { this.paused = true; queueMicrotask(() => this.onpause?.()); }
  removeAttribute(name) { if (name === "src") this.src = ""; }
}
const fakeAudioSession = {
  type: "auto", state: "inactive", listeners: [],
  addEventListener(name, listener) { if (name === "statechange") this.listeners.push(listener); },
  change(state) { this.state = state; for (const listener of this.listeners) listener(); },
};
const outputController = createSpeechController({
  synthesis: null, Utterance: null, AudioPlayer: ReconnectedAudio,
  // 準備音は本物のBlobで渡されるため、試験用の印は文字列の名前がある時だけ使い、準備音の大きさを記録する。
  createObjectUrl: blob => {
    if (typeof blob.text !== "string") probeBlobSizes.push(Number(blob.size));
    return `blob:output-${typeof blob.text === "string" ? blob.text : "準備音"}-${outputPlayers.length}`;
  },
  revokeObjectUrl: url => outputRevocations.push(url),
  requestCloudAudio: async text => { outputRequests++; return { text, type: "audio/mpeg", size: 100 }; },
  decodeAudioBounds: async () => null,
  audioSession: fakeAudioSession,
  getSettings: () => ({ source: "cloud", rate: 1.6 }),
});
// 音声セッションの種類は既定では変更しない（v0.421の「再生用」宣言は出だしが弱く聞こえるためv0.422でやめた）。
if (fakeAudioSession.type !== "auto") throw new Error("音声セッションの種類を既定で書き換えてしまいました。");
{
  const declared = { type: "auto", state: "inactive", addEventListener() {} };
  createSpeechController({ synthesis: null, Utterance: null, AudioPlayer: ReconnectedAudio, createObjectUrl: () => "blob:declared", revokeObjectUrl: () => {}, requestCloudAudio: async () => ({}), audioSession: declared, audioSessionType: "playback", getSettings: () => ({ source: "cloud" }) });
  if (declared.type !== "playback") throw new Error("明示した時だけ音声セッションの種類を宣言できませんでした。");
  outputPlayers.splice(0);
}
const outputSegments = [{ target: "question", text: "apple", language: "en-US" }, { target: "answer", text: "りんご" }];
outputGesture = true; outputController.unlock(); outputGesture = false;
await outputController.preload(outputSegments);
const outputHandlers = {
  onComplete: () => outputCompletions++,
  onError: error => { outputErrors++; outputErrorDetails.push(String(error.detail ?? "")); },
};
outputController.speak(outputSegments, outputHandlers);
await tick();
const oldActive = outputPlayers.find(player => !player.paused);
const oldStandby = outputPlayers.find(player => player !== oldActive);
const oldStandbyUrl = oldStandby.src;
const oldEnd = oldActive.onended;
if (!oldActive.audible || !oldStandbyUrl) throw new Error("接続変更の試験用音声を準備できませんでした。");
// イヤホンOFF：端末側が再生を止め、音声セッションは中断になる。
outputSessionReady = false;
fakeAudioSession.change("interrupted");
oldActive.paused = true; oldActive.onpause();
await tick();
if (
  outputErrors !== 1 || outputCompletions !== 0 || outputController.currentTarget ||
  !outputErrorDetails[0].includes("端末側で一時停止") || !outputErrorDetails[0].includes("音声セッション:interrupted")
) {
  throw new Error("端末側の一時停止を検出して止め、理由と音声セッションの状態を添えられませんでした。");
}
// イヤホンON → 「前回の続きから」：操作の中で先読みを捨て、専用の再生器で準備音を鳴らす。読み上げ用の2台は作り直さない。
fakeAudioSession.change("inactive");
outputGesture = true; outputController.unlock({ reset: true, probe: true }); outputGesture = false;
const pool = outputPlayers.slice(0, 2);
const probePlayer = outputPlayers[2];
if (
  outputPlayers.length !== 3 || !probePlayer || probePlayer.paused || !probePlayer.src.includes("準備音") || !probePlayer.audible ||
  !outputRevocations.includes(oldStandbyUrl) || pool.some(player => player.src || !player.paused)
) {
  throw new Error("再開操作中に専用の再生器で準備音を鳴らし、読み上げ用の2台の先読みを解放できませんでした。");
}
// 準備音はWebKitが出力権を手放す条件（0.95秒より長い音声の自然終了）を満たす長さにする。
if (probeBlobSizes.length !== 1 || probeBlobSizes[0] <= 44 + Math.ceil(0.95 * 16000) * 2) {
  throw new Error(`準備音が0.95秒より長くありません（${probeBlobSizes[0]}バイト）。`);
}
// 通信待ちの後の最初の読み上げは、準備音が自然に終わるまで鳴らさない（出力権を手放してから取り直す順番）。
await tick();
outputController.speak(outputSegments, outputHandlers);
await tick(); await tick();
if (pool.some(player => !player.paused) || outputRequests !== 2) {
  throw new Error("準備音が終わる前に最初の読み上げを始めてしまいました。");
}
probePlayer.onended();
if (probePlayer.src || !outputRevocations.some(url => url.includes("準備音"))) {
  throw new Error("鳴り終えた準備音を片付けられませんでした。");
}
oldEnd();
if (outputCompletions !== 0) throw new Error("古い終了通知で進行を進めてしまいました。");
await tick();
const newQuestion = pool.find(player => !player.paused);
if (!newQuestion?.audible || newQuestion.playbackRate !== 1.6) throw new Error("準備音の終了後に、再接続後の問題を保存した速度で再生できませんでした。");
newQuestion.onended();
await tick();
const newAnswer = pool.find(player => !player.paused);
if (!newAnswer?.audible || newAnswer === newQuestion) throw new Error("再接続後の回答をもう一方の再生器で再生できませんでした。");
newAnswer.onended();
await tick();
if (outputCompletions !== 1 || outputErrors !== 1 || outputRequests !== 2 || outputPlayers.length !== 3) {
  throw new Error("再接続時に音声を再取得せず、古い通知で進行を重複させずに再開できませんでした。");
}
// 学習画面を離れる時は同じ専用の再生器で準備音を鳴らし、出力権を手放す。
if (!outputController.release() || probePlayer.paused || !probePlayer.src.includes("準備音") || outputPlayers.length !== 3) {
  throw new Error("学習画面を離れる時に準備音で出力権を手放せませんでした。");
}
probePlayer.onended();
// 次の明示的な開始でも同じ専用の再生器で準備音を鳴らし直し、その結果は後の失敗の理由にも添える。
outputGesture = true; outputController.unlock({ reset: true, probe: true }); outputGesture = false;
if (probePlayer.paused || !probePlayer.src.includes("準備音") || outputPlayers.length !== 3 || probeBlobSizes.length !== 3) {
  throw new Error("開始の操作ごとに専用の再生器で準備音を鳴らし直せませんでした。");
}
probePlayer.onended();
outputController.speak(outputSegments, outputHandlers);
await tick();
const haltedPlayer = pool.find(player => !player.paused);
haltedPlayer.paused = true; haltedPlayer.onpause();
await tick();
if (outputErrors !== 2 || !outputErrorDetails[1].includes("準備音:完走") || !outputErrorDetails[1].includes("終了時セッション:inactive")) {
  throw new Error("準備音の結果と終了時のセッション状態を失敗の理由に添えられませんでした。");
}
outputController.stop();

// 端末音声の設定では準備音を鳴らさない。
{
  const devicePlayers = [];
  class DeviceOnlyAudio {
    constructor() { this.src = ""; this.plays = 0; devicePlayers.push(this); }
    load() {}
    async play() { this.plays += 1; }
    pause() {}
    removeAttribute(name) { if (name === "src") this.src = ""; }
  }
  const deviceController = createSpeechController({
    synthesis, Utterance: FakeUtterance, AudioPlayer: DeviceOnlyAudio,
    createObjectUrl: () => "blob:device", revokeObjectUrl: () => {},
    requestCloudAudio: async () => ({ type: "audio/mpeg", size: 100 }),
    getSettings: () => ({ source: "device", rate: 1 }),
  });
  deviceController.unlock({ reset: true, probe: true });
  if (devicePlayers.length !== 2 || devicePlayers.some(player => player.plays > 0 || player.src)) {
    throw new Error("端末音声の設定で準備音を鳴らしてしまいました。");
  }
}

// 準備音は明示的な開始の操作ごとに専用の再生器で鳴らし、単語ごとの切り替えでは鳴らさない。
// 最初の読み上げは準備音の自然な終了を待ち、終了が来ない時は見張り時間の後に進む。
{
  const firstPlayers = [];
  class FirstStartAudio {
    constructor() { this.src = ""; this.paused = true; this.playbackRate = 1; this.currentTime = 0; this.plays = 0; firstPlayers.push(this); }
    load() {}
    async play() { this.plays += 1; this.paused = false; this.onplaying?.(); }
    pause() { this.paused = true; }
    removeAttribute(name) { if (name === "src") this.src = ""; }
  }
  const firstController = createSpeechController({
    synthesis: null, Utterance: null, AudioPlayer: FirstStartAudio,
    createObjectUrl: blob => (typeof blob.text === "string" ? `blob:${blob.text}` : "blob:first-probe"),
    revokeObjectUrl: () => {},
    requestCloudAudio: async text => ({ text, type: "audio/mpeg", size: 100 }),
    decodeAudioBounds: async () => null,
    probeTimeoutMs: 40,
    getSettings: () => ({ source: "cloud", rate: 1 }),
  });
  const poolPlays = () => firstPlayers.slice(0, 2).reduce((total, player) => total + player.plays, 0);
  firstController.unlock({ reset: true, probe: true });
  const firstProbe = firstPlayers[2];
  if (firstPlayers.length !== 3 || firstProbe?.src !== "blob:first-probe" || firstProbe.plays !== 1) {
    throw new Error("最初の開始で専用の再生器の準備音を鳴らせませんでした。");
  }
  firstProbe.onended();
  for (const text of ["単語1", "単語2", "単語3"]) {
    firstController.speak([{ target: "question", text }], {});
    await new Promise(resolve => setTimeout(resolve, 0));
    firstPlayers.slice(0, 2).find(player => !player.paused)?.onended();
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  if (poolPlays() !== 3 || firstProbe.plays !== 1 || firstProbe.src) {
    throw new Error("単語ごとの切り替えで準備音を鳴らしてしまいました。");
  }
  // 次の明示的な開始では再び準備音を鳴らし、最初の読み上げはその終了を待つ。
  firstController.unlock({ reset: true, probe: true });
  firstController.speak([{ target: "question", text: "単語4" }], {});
  await new Promise(resolve => setTimeout(resolve, 10));
  if (firstProbe.plays !== 2 || poolPlays() !== 3) {
    throw new Error("準備音の終了を待たずに最初の読み上げを始めてしまいました。");
  }
  firstProbe.onended();
  await new Promise(resolve => setTimeout(resolve, 0));
  if (poolPlays() !== 4) throw new Error("準備音の終了後に最初の読み上げを始められませんでした。");
  firstPlayers.slice(0, 2).find(player => !player.paused)?.onended();
  // 準備音の終了通知が来ない端末では、見張り時間の後に読み上げへ進む。
  firstController.unlock({ reset: true, probe: true });
  firstController.speak([{ target: "question", text: "単語5" }], {});
  await new Promise(resolve => setTimeout(resolve, 10));
  if (poolPlays() !== 4) throw new Error("見張り時間の前に読み上げを始めてしまいました。");
  await new Promise(resolve => setTimeout(resolve, 80));
  if (poolPlays() !== 5 || firstProbe.src) {
    throw new Error("準備音の終了通知が来ない時に、見張り時間の後で読み上げへ進めませんでした。");
  }
  firstController.stop();
}

// 再生通知と再生位置が進んでいても、ブラウザー自身が音声セッションを有効と見なしていなければ無音の再生として止める。
// 端末の先（イヤホン）で実際に鳴っているかはWebアプリから分からないため、確認はこの範囲に限られる。
{
  let deviceSpeaks = 0;
  const completions = [];
  const errors = [];
  class AdvancingAudio {
    constructor() { this.src = ""; this.paused = true; this.playbackRate = 1; this.position = 0; this.startedAt = 0; }
    get currentTime() { return this.paused ? this.position : this.position + (Date.now() - this.startedAt) / 1000; }
    set currentTime(value) { this.position = Number(value); if (!this.paused) this.startedAt = Date.now(); }
    load() {}
    async play() { this.paused = false; this.startedAt = Date.now(); queueMicrotask(() => this.onplaying?.()); }
    pause() { if (!this.paused) this.position = this.currentTime; this.paused = true; }
    removeAttribute(name) { if (name === "src") this.src = ""; }
  }
  const inactiveSession = createSpeechController({
    synthesis: { cancel() {}, resume() {}, getVoices() { return []; }, speak() { deviceSpeaks += 1; } },
    Utterance: FakeUtterance, AudioPlayer: AdvancingAudio,
    createObjectUrl: () => "blob:inactive-session", revokeObjectUrl: () => {},
    requestCloudAudio: async () => ({ type: "audio/mpeg", size: 100 }),
    decodeAudioBounds: async () => null,
    cloudStallTimeoutMs: 1000, cloudStallCheckIntervalMs: 10,
    audioSession: { type: "auto", state: "inactive", addEventListener() {} },
    getSettings: () => ({ source: "cloud", rate: 1 }),
  });
  inactiveSession.speak([{ target: "question", text: "鳴らない再生" }], {
    onComplete: () => completions.push(1),
    onError: error => errors.push(error),
  });
  await new Promise(resolve => setTimeout(resolve, 120));
  if (
    completions.length !== 0 || errors.length !== 1 || deviceSpeaks !== 0 || inactiveSession.currentTarget ||
    !String(errors[0].detail).includes("再生中も音声セッションがinactive")
  ) {
    throw new Error("音声セッションが有効にならないまま進む再生を、次へ進めずに止められませんでした。");
  }
}

// 開始通知の後に再生位置が進まない音声は、音が出ていないとみなして次へ進めずに止める。端末音声へも切り替えない。
{
  let deviceSpeaks = 0;
  const completions = [];
  const errors = [];
  class StalledAudio {
    constructor() { this.src = ""; this.currentTime = 0; this.paused = true; this.playbackRate = 1; }
    load() {}
    async play() { this.paused = false; queueMicrotask(() => this.onplaying?.()); }
    pause() { this.paused = true; }
    removeAttribute(name) { if (name === "src") this.src = ""; }
  }
  const stalled = createSpeechController({
    synthesis: { cancel() {}, resume() {}, getVoices() { return []; }, speak() { deviceSpeaks += 1; } },
    Utterance: FakeUtterance, AudioPlayer: StalledAudio,
    createObjectUrl: () => "blob:stalled", revokeObjectUrl: () => {},
    requestCloudAudio: async () => ({ type: "audio/mpeg", size: 100 }),
    decodeAudioBounds: async () => null,
    cloudStallTimeoutMs: 40, cloudStallCheckIntervalMs: 10,
    getSettings: () => ({ source: "cloud", rate: 1 }),
  });
  stalled.speak([{ target: "question", text: "止まる音声" }], {
    onComplete: () => completions.push(1),
    onError: error => errors.push(error),
  });
  await new Promise(resolve => setTimeout(resolve, 150));
  if (
    completions.length !== 0 || errors.length !== 1 || deviceSpeaks !== 0 || stalled.currentTarget ||
    !String(errors[0].detail).includes("再生位置が0.00秒で停止")
  ) {
    throw new Error("再生位置が進まない音声を、次へ進めずに止められませんでした。");
  }
}

// 無音の飛ばしは時計だけで終わりにせず、実際の再生位置が声の終わりへ届くまで待ち直す。
{
  const completions = [];
  class LaggingAudio {
    constructor() { this.src = ""; this.paused = true; this.playbackRate = 1; this.defaultPlaybackRate = 1; this.readyState = 1; this.position = 0; this.startedAt = 0; }
    // 端末の都合で実際の進みが半分の速さになった再生器。
    get currentTime() { return this.paused ? this.position : this.position + ((Date.now() - this.startedAt) / 1000) * 0.5; }
    set currentTime(value) { this.position = Number(value); if (!this.paused) this.startedAt = Date.now(); }
    load() {}
    async play() { this.paused = false; this.startedAt = Date.now(); queueMicrotask(() => this.onplaying?.()); }
    pause() { if (!this.paused) this.position = this.currentTime; this.paused = true; }
    removeAttribute(name) { if (name === "src") this.src = ""; }
  }
  const lagging = createSpeechController({
    synthesis: null, Utterance: null, AudioPlayer: LaggingAudio,
    createObjectUrl: () => "blob:lagging", revokeObjectUrl: () => {},
    requestCloudAudio: async () => ({ type: "audio/mpeg", size: 100 }),
    decodeAudioBounds: async () => ({ leadSeconds: 0, soundEndSeconds: 0.3, tailSeconds: 0.2, durationSeconds: 0.5 }),
    getSettings: () => ({ source: "cloud", rate: 1 }),
  });
  const laggingSegments = [{ target: "answer", text: "遅れる音声" }];
  await lagging.preload(laggingSegments);
  await tick(); await tick();
  const startedAt = Date.now();
  lagging.speak(laggingSegments, {
    onComplete: () => completions.push(Date.now() - startedAt),
    onError: error => { throw error; },
  });
  await new Promise(resolve => setTimeout(resolve, 1000));
  // 時計だけなら約330ミリ秒で終わるが、実際の位置が声の終わりへ届く約580ミリ秒まで待つ。
  if (completions.length !== 1 || completions[0] < 500 || completions[0] > 900) {
    throw new Error(`実際の再生位置に合わせて終了を待ち直せませんでした（${completions[0]}ms）。`);
  }
}

// 再生の受付が一度だけ中止された時は、同じ再生器で同じ音声をやり直し、端末音声へ切り替えない。
{
  let plays = 0;
  let deviceSpeaks = 0;
  const completions = [];
  class AbortingAudio {
    constructor() { this.src = ""; this.paused = true; this.playbackRate = 1; this.currentTime = 0; }
    load() {}
    async play() {
      plays += 1;
      if (plays === 1) { const error = new Error("受付中止"); error.name = "AbortError"; throw error; }
      this.paused = false;
      this.onplaying?.();
      queueMicrotask(() => this.onended?.());
    }
    pause() { this.paused = true; }
    removeAttribute(name) { if (name === "src") this.src = ""; }
  }
  const aborting = createSpeechController({
    synthesis: { cancel() {}, resume() {}, getVoices() { return []; }, speak() { deviceSpeaks += 1; } },
    Utterance: FakeUtterance, AudioPlayer: AbortingAudio,
    createObjectUrl: () => "blob:aborting", revokeObjectUrl: () => {},
    requestCloudAudio: async () => ({ type: "audio/mpeg", size: 100 }),
    decodeAudioBounds: async () => null, playRetryDelayMs: 5,
    getSettings: () => ({ source: "cloud", rate: 1 }),
  });
  aborting.speak([{ target: "question", text: "やり直す音声" }], {
    onComplete: () => completions.push(1),
    onError: error => { throw error; },
  });
  await new Promise(resolve => setTimeout(resolve, 60));
  if (plays !== 2 || completions.length !== 1 || deviceSpeaks !== 0) {
    throw new Error("再生の受付が中止された時に同じ音声をやり直せませんでした。");
  }
}

// 再生許可の拒否はやり直さず、同じ問題で止めて理由と音声セッションの状態を添える。
{
  let plays = 0;
  let deviceSpeaks = 0;
  const errors = [];
  class RefusingAudio {
    constructor() { this.src = ""; this.paused = true; this.playbackRate = 1; this.currentTime = 0; }
    load() {}
    async play() { plays += 1; const error = new Error("利用者操作が必要です。"); error.name = "NotAllowedError"; throw error; }
    pause() { this.paused = true; }
    removeAttribute(name) { if (name === "src") this.src = ""; }
  }
  const refusing = createSpeechController({
    synthesis: { cancel() {}, resume() {}, getVoices() { return []; }, speak() { deviceSpeaks += 1; } },
    Utterance: FakeUtterance, AudioPlayer: RefusingAudio,
    createObjectUrl: () => "blob:refusing", revokeObjectUrl: () => {},
    requestCloudAudio: async () => ({ type: "audio/mpeg", size: 100 }),
    decodeAudioBounds: async () => null, playRetryDelayMs: 5,
    audioSession: { type: "auto", state: "interrupted", addEventListener() {} },
    getSettings: () => ({ source: "cloud", rate: 1 }),
  });
  refusing.speak([{ target: "question", text: "拒否される音声" }], { onError: error => errors.push(error) });
  await new Promise(resolve => setTimeout(resolve, 30));
  const detail = String(errors[0]?.detail ?? "");
  if (plays !== 1 || deviceSpeaks !== 0 || errors.length !== 1 || !detail.includes("再生を拒否(NotAllowedError)") || !detail.includes("音声セッション:interrupted")) {
    throw new Error("再生許可の拒否を、やり直さずに理由付きで止められませんでした。");
  }
}

console.log(
  "音声読み上げ検証完了: Azure音声・端末音声選択・自動切替・停止・途中再開・2台の先読み切替・無音の飛ばし（実際の再生位置で確認）・開始操作ごとの専用再生器での準備音（0.95秒超・自然終了待ち・見張り）・学習画面を離れる時の出力権の解放・中断と進行停止時の停止・音声セッションが有効にならない再生の停止・受付中止のやり直し・診断を確認",
);
