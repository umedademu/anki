import {
  createSpeechController,
  prepareSpeechText,
  selectJapaneseVoice,
} from "../public/speech.js";
import {
  azureSpeechVoices,
  defaultAzureSpeechVoiceId,
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

const voices = [
  { name: "English", lang: "en-US", voiceURI: "english" },
  { name: "日本語", lang: "ja-JP", voiceURI: "japanese-default", default: true },
  { name: "日本語 高品質", lang: "ja-JP", voiceURI: "japanese-natural" },
];
if (selectJapaneseVoice(voices)?.name !== "日本語") {
  throw new Error("日本語音声を優先して選べませんでした。");
}
if (
  selectJapaneseVoice(voices, "japanese-natural")?.name !== "日本語 高品質" ||
  getJapaneseVoices({ getVoices: () => voices }).length !== 2 ||
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
    voiceId: "japanese-natural",
    rate: 0.9,
  },
  fakeStorage,
);
if (
  loadSpeechSettings(fakeStorage).voiceId !== "japanese-natural" ||
  loadSpeechSettings(fakeStorage).azureVoiceId !== "ja-JP-KeitaNeural" ||
  savedSpeechSettings.rate !== 0.9 ||
  normalizeSpeechSettings({ source: "invalid", rate: 9 }).source !== "cloud" ||
  normalizeSpeechSettings({ azureVoiceId: "invalid" }).azureVoiceId !==
    defaultAzureSpeechVoiceId ||
  azureSpeechVoices.length !== 7 ||
  azureSpeechVoices.filter((voice) => voice.label.includes("男性")).length !== 3 ||
  normalizeSpeechSettings({ rate: 9 }).rate !== 1.2
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
    rate: 0.9,
  }),
  onTargetChange: (target) => targetChanges.push(target),
});
if (!controller.supported) {
  throw new Error("利用可能な読み上げ機能を認識できませんでした。");
}
controller.speak([
  { target: "answer", text: "康熙帝(こうきてい)" },
  { target: "overview", text: "鄭氏台湾(ていしたいわん)" },
]);
if (
  spoken.length !== 2 ||
  spoken[0].text !== "こうきてい" ||
  spoken[1].text !== "ていしたいわん" ||
  spoken.some(
    (item) =>
      item.lang !== "ja-JP" ||
      item.rate !== 0.9 ||
      item.voice !== "日本語 高品質",
  ) ||
  targetChanges.at(-1) !== ""
) {
  throw new Error("回答と解説を順番に日本語で読み上げられませんでした。");
}

const cloudRequests = [];
const cloudTargets = [];
const revokedUrls = [];
class FakeAudio {
  constructor(url) {
    this.url = url;
    this.playbackRate = 1;
    this.onended = null;
    this.onerror = null;
  }

  async play() {
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
    rate: 1.05,
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
  revokedUrls.length !== 2
) {
  throw new Error("Azure音声を回答から解説へ順番に再生できませんでした。");
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
controller.stop();
if (controller.currentTarget !== "" || synthesis.cancelCount < 2) {
  throw new Error("読み上げを停止できませんでした。");
}

const unsupported = createSpeechController({ synthesis: null, Utterance: null });
if (unsupported.supported || unsupported.speak([{ target: "question", text: "問題" }])) {
  throw new Error("読み上げ非対応端末の判定が不正です。");
}

console.log(
  "音声読み上げ検証完了: Azure音声・端末音声選択・自動切替・停止を確認",
);
