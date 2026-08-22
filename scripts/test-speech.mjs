import {
  createVocabularyAutomaticAnswerSequence,
  createVocabularySpeechGroups,
  createSpeechController,
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
  ["1914〜1918年", "1914から1918年"],
]);

for (const [source, expected] of textChecks) {
  const actual = prepareSpeechText(source);
  if (actual !== expected) {
    throw new Error(`読み上げ用文章が不正です: ${source} -> ${actual}`);
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

const cloudRequests = [];
const cloudTargets = [];
const revokedUrls = [];
const playedRates = [];
class FakeAudio {
  constructor(url) {
    this.url = url;
    this.playbackRate = 1;
    this.onended = null;
    this.onerror = null;
  }

  async play() {
    playedRates.push(this.playbackRate);
    queueMicrotask(() => this.onended?.());
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
]);
await new Promise((resolve) => setTimeout(resolve, 0));
if (
  cloudRequests.map((request) => request.text).join("|") !==
    "こうきてい|ていしたいわん" ||
  cloudRequests.some(
    (request) => request.voice !== "ja-JP-KeitaNeural",
  ) ||
  cloudTargets.at(-1) !== "" ||
  playedRates.length !== 2 ||
  playedRates.some((rate) => rate !== 3) ||
  revokedUrls.length !== 2
) {
  throw new Error("Azure音声を回答から解説へ順番に再生できませんでした。");
}

const preloadRequests = [];
const preloadResolvers = [];
const preloadPlayers = [];
class PreloadAudio {
  constructor(url) {
    this.url = url;
    this.playbackRate = 1;
    this.onended = null;
    this.onerror = null;
    preloadPlayers.push(this);
  }

  async play() {}

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
if (preloadPlayers.length !== 2) {
  throw new Error("先読みした別パーツを待ち時間なく続けて再生できませんでした。");
}
preloadPlayers[1].onended();

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
controller.stop();
if (controller.currentTarget !== "" || synthesis.cancelCount < 1) {
  throw new Error("読み上げを停止できませんでした。");
}

const unsupported = createSpeechController({ synthesis: null, Utterance: null });
if (unsupported.supported || unsupported.speak([{ target: "question", text: "問題" }])) {
  throw new Error("読み上げ非対応端末の判定が不正です。");
}

console.log(
  "音声読み上げ検証完了: Azure音声・端末音声選択・自動切替・停止を確認",
);
