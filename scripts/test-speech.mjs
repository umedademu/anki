import {
  createVocabularyAutomaticAnswerSequence,
  createVocabularySpeechGroups,
  createHistorySpeechReadings,
  createSpeechController,
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
]);
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
    pausedCloudAudio = this;
  }

  async play() {
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

  async play() {}

  load() {}

  removeAttribute(name) {
    if (name === "src") {
      this.src = "";
    }
  }

  pause() {}
}
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
await new Promise((resolve) => setTimeout(resolve, 0));
if (preloadRequests.length !== 2 || preloadPlayers.length !== 1) {
  throw new Error("先読みした音声を再取得せずに再生できませんでした。");
}
preloadPlayers[0].onended();
await new Promise((resolve) => setTimeout(resolve, 0));
if (preloadPlayers.length !== 1) {
  throw new Error("先読みした別パーツを同じ音声再生器で続けて再生できませんでした。");
}
preloadPlayers[0].onended();

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
  iosAudioPlayers !== 1 ||
  iosCloudRequests !== 2 ||
  iosDeviceAttempts !== 0 ||
  iosPlaybackErrors !== 1 ||
  iosPlaybackCompletions !== 2 ||
  iosPlayResults.join("|") !== "blocked|played|played" ||
  iosPlayedRates.some((rate) => rate !== 1.75)
) {
  throw new Error("iPhoneで同じ音声再生器と設定速度を維持できませんでした。");
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

console.log(
  "音声読み上げ検証完了: Azure音声・端末音声選択・自動切替・停止・途中再開を確認",
);
