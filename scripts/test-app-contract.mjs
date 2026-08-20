import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(path.join(projectRoot, "public", "index.html"), "utf8");
const changelog = await readFile(
  path.join(projectRoot, "public", "changelog.html"),
  "utf8",
);
const settingsHtml = await readFile(
  path.join(projectRoot, "public", "settings.html"),
  "utf8",
);
const settingsApp = await readFile(
  path.join(projectRoot, "public", "settings.js"),
  "utf8",
);
const speech = await readFile(
  path.join(projectRoot, "public", "speech.js"),
  "utf8",
);
const speechSettings = await readFile(
  path.join(projectRoot, "public", "speech-settings.js"),
  "utf8",
);
const worker = await readFile(
  path.join(projectRoot, "worker", "src", "index.js"),
  "utf8",
);
const wrangler = await readFile(
  path.join(projectRoot, "worker", "wrangler.jsonc"),
  "utf8",
);
const sharedSettingsMigration = await readFile(
  path.join(projectRoot, "worker", "migrations", "0003_shared_settings.sql"),
  "utf8",
);
const app = await readFile(path.join(projectRoot, "public", "app.js"), "utf8");
const cloudProgress = await readFile(
  path.join(projectRoot, "public", "cloud-progress.js"),
  "utf8",
);
const config = await readFile(path.join(projectRoot, "public", "config.js"), "utf8");
const styles = await readFile(path.join(projectRoot, "public", "styles.css"), "utf8");
const speechSegmentsBlock = app.match(
  /function speechSegmentsFor\(target\)[\s\S]*?function speakTarget\(target\)/,
)?.[0];
const generationPrompt = await readFile(
  path.join(projectRoot, "docs", "prompts", "world-history-csv-generation.md"),
  "utf8",
);

const htmlIds = new Set(
  [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]),
);
const selectedIds = [
  ...app.matchAll(/document\.querySelector\("#([^"]+)"\)/g),
].map((match) => match[1]);
const missingIds = selectedIds.filter((id) => !htmlIds.has(id));

if (missingIds.length > 0) {
  throw new Error(`画面に存在しない部品を参照しています: ${missingIds.join(", ")}`);
}
if (!html.includes('<script src="/app.js" type="module"></script>')) {
  throw new Error("学習処理が部品分割に対応した読込方法になっていません。");
}
if (
  !html.includes('id="setup-panel"') ||
  !html.includes('id="start-study"') ||
  !html.includes('id="question-style-filter"') ||
  !html.includes('href="/changelog.html"') ||
  !html.includes('href="/settings.html"') ||
  !html.includes("v0.031") ||
  !changelog.includes("v0.031") ||
  !settingsHtml.includes("v0.031")
) {
  throw new Error("開始前の条件選択画面、更新情報ページ、版番号が揃っていません。");
}
if (
  !html.includes('href="/styles.css?v=0.031"') ||
  !styles.includes("-webkit-text-size-adjust: 100%") ||
  !styles.includes("text-size-adjust: 100%")
) {
  throw new Error("Safariの文字自動拡大防止または装飾ファイルの版指定がありません。");
}
if (
  !generationPrompt.includes("冒頓単于(ぼくとつぜんう)") ||
  !generationPrompt.includes("坤輿万国全図(こんよばんこくぜんず)") ||
  !generationPrompt.includes("鄭氏台湾(ていしたいわん)") ||
  !generationPrompt.includes("王安石(おうあんせき)の低利融資政策を何という？") ||
  !generationPrompt.includes("問題文の読み仮名は回答表示時だけWebアプリに表示されます")
) {
  throw new Error("問題集生成用プロンプトの読み仮名規則が不足しています。");
}
if (
  !html.includes('id="setup-speech"') ||
  !html.includes('id="question-speech"') ||
  !html.includes('id="answer-speech"') ||
  !html.includes('id="overview-speech"') ||
  !app.includes("createSpeechController") ||
  !app.includes("autoSpeakQuestion") ||
  !app.includes("autoSpeakAnswerAndOverview") ||
  !styles.includes(".speech-button")
) {
  throw new Error("問題・回答・解説の音声読み上げ操作が揃っていません。");
}
if (
  !settingsHtml.includes('id="speech-source"') ||
  !settingsHtml.includes('id="azure-voice"') ||
  !settingsHtml.includes('id="device-voice"') ||
  !settingsHtml.includes('id="speech-rate"') ||
  !settingsHtml.includes('id="preview-speech"') ||
  !settingsApp.includes("getJapaneseVoices") ||
  !settingsApp.includes("saveSpeechSettings") ||
  !speechSettings.includes('source: "cloud"') ||
  !speechSettings.includes('id: "ja-JP-KeitaNeural"') ||
  !speechSettings.includes('id: "ja-JP-NaokiNeural"') ||
  !speech.includes("requestCloudAudio") ||
  !speech.includes("onFallback") ||
  !cloudProgress.includes("requestCloudSpeech") ||
  !worker.includes('url.pathname === "/v1/speech"') ||
  !worker.includes("tts.speech.microsoft.com/cognitiveservices/v1") ||
  !worker.includes('"ja-JP-NanamiNeural"') ||
  !wrangler.includes('"AZURE_SPEECH_REGION": "japaneast"') ||
  !wrangler.includes('"AZURE_SPEECH_KEY"') ||
  !wrangler.includes('"binding": "SPEECH_CACHE"')
) {
  throw new Error("Azure音声と端末音声を選択・自動切替する構成が揃っていません。");
}
if (
  html.includes('class="answer-label"') ||
  html.includes('class="term-overview-label"') ||
  !styles.includes("[data-content-density=\"dense\"] #answer-text") ||
  !/#answer-text\s*\{[^}]*font-weight:\s*850;/s.test(styles) ||
  !styles.includes("font-size: clamp(0.95rem, 2vw, 1rem)") ||
  !app.includes("const minimumFontSize = 15")
) {
  throw new Error("回答・解説の見出し撤去または横向きの文字サイズ調整が不完全です。");
}
if (
  !html.includes('id="term-tags"') ||
  !app.includes("function renderTermTags(term, question, visible)") ||
  !app.includes("const tags = [\n    term.chronology?.displayPeriod,\n    ...getMacroRegionTags(term),") ||
  !app.includes("stageLabels[question.stage]") ||
  !app.includes("question.focus") ||
  !styles.includes(".term-tags") ||
  !styles.includes("font-size: 0.52rem") ||
  !speechSegmentsBlock ||
  speechSegmentsBlock.includes("termTags") ||
  speechSegmentsBlock.includes("renderTermTags")
) {
  throw new Error("解説欄の分類タグ表示が揃っていません。");
}
if (
  !html.includes('id="term-image"') ||
  !html.includes('id="term-image-content"') ||
  !html.includes('id="term-image-license"') ||
  !app.includes('fetchJson("term-images.json")') ||
  !app.includes("function renderQuestionImage(question, visible)") ||
  !app.includes("const image = state.questionImages.get(question.id)") ||
  !app.includes('elements.termOverview.classList.toggle("has-image", showsImage)') ||
  !app.includes("const showsTermImage = renderQuestionImage(question, state.answerVisible)") ||
  !styles.includes(".term-overview-main.has-image") ||
  !styles.includes(".term-overview.has-image .term-image img") ||
  !styles.includes("grid-template-columns: minmax(0, 3fr) minmax(240px, 2fr)") ||
  !styles.includes(".term-image figcaption") ||
  speechSegmentsBlock.includes("termImage")
) {
  throw new Error("回答後の関連画像、出典表示、読み上げ除外が揃っていません。");
}
if (
  !generationPrompt.includes("すべての統合説明の回答本文には、次の2点を例外なく明記してください") ||
  !generationPrompt.includes("西暦・紀元前の年、年代、世紀、または期間") ||
  !generationPrompt.includes("国・地域・都市・海域") ||
  !generationPrompt.includes("統合説明の本文自体へ自然な文章として含めてください")
) {
  throw new Error("今後の統合説明へ時期と場所を含める規則が不足しています。");
}
if (
  !html.includes('id="back-action"') ||
  !html.includes('id="next-action"') ||
  html.includes('id="reveal-action"') ||
  !app.includes("createRatingUndoSnapshot") ||
  !app.includes("restoreRatingUndoSnapshot") ||
  !app.includes("function goBackOneStep()") ||
  !app.includes("performRightSideAction(true)") ||
  styles.includes(".back-action::before") ||
  !styles.includes(".rating-buttons")
) {
  throw new Error("一手戻しまたは横向きの左右タップ操作が揃っていません。");
}
if (
  !html.includes('id="incorrect-action"') ||
  !html.includes('id="hard-action"') ||
  !html.includes('id="good-action"') ||
  !html.includes('id="easy-action"') ||
  !styles.includes("grid-template-columns: repeat(4, minmax(0, 1fr))") ||
  !app.includes('rateCurrentQuestion("again")') ||
  !app.includes('rateCurrentQuestion("hard")') ||
  !app.includes('rateCurrentQuestion("good")') ||
  !app.includes('rateCurrentQuestion("easy")') ||
  html.includes('id="again-action"') ||
  html.includes('id="remembered-action"')
) {
  throw new Error("4段階評価または横一列の評価ボタンが揃っていません。");
}
if (
  !settingsHtml.includes('id="review-settings-form"') ||
  !settingsHtml.includes('id="access-key"') ||
  !cloudProgress.includes("saveCloudSettings") ||
  !cloudProgress.includes("saveCloudQuestion") ||
  !app.includes("loadProgressFromCloud") ||
  app.includes("window.localStorage.setItem(state.progressKey")
) {
  throw new Error("Cloudflare上の学習記録または専用の復習設定ページが揃っていません。");
}
if (
  !cloudProgress.includes("normalizeSharedSettings") ||
  !cloudProgress.includes('method: "PATCH"') ||
  !settingsApp.includes("saveCloudSettings(readSpeechForm())") ||
  !app.includes("queueSetupPreferenceSave") ||
  app.includes("anki-shuffle:") ||
  app.includes("anki-auto-speech:v1") ||
  !worker.includes("shuffle_enabled") ||
  !worker.includes("auto_speech_enabled") ||
  !sharedSettingsMigration.includes("speech_source") ||
  !sharedSettingsMigration.includes("azure_voice_id") ||
  !sharedSettingsMigration.includes("device_voice_id") ||
  !sharedSettingsMigration.includes("speech_rate")
) {
  throw new Error("設定画面と開始前の選択をCloudflareで共有する構成が揃っていません。");
}
if (
  !app.includes(
    'document.body.classList.toggle("is-studying", panel === elements.studyShell)',
  ) ||
  !styles.includes("body.is-studying .site-header") ||
  !styles.includes("body.is-studying .page")
) {
  throw new Error("学習開始後にヘッダーを隠して上部余白を縮める処理がありません。");
}
if (
  !styles.includes(".progress-track {\n    height: 3px;\n    margin: 0;\n    grid-row: 2;") ||
  !styles.includes(".question-card {\n    display: flex;\n    flex-direction: column;\n    min-height: 0;\n    padding: 5px 12px;\n    grid-row: 3;") ||
  !styles.includes(".action-dock {\n    position: static;\n    min-height: 0;\n    padding: 0;\n    grid-row: 4;")
) {
  throw new Error("横向き画面の問題・操作欄に固定の配置行がありません。");
}
if (
  !app.includes('question.stage === "beginner"') ||
  !styles.includes(".context-card.is-beginner-stage") ||
  !styles.includes(".context-card.is-beginner-stage {\n  display: none;")
) {
  throw new Error("通常の一問一答の不要な上部枠を隠す処理が見つかりません。");
}
if (
  !html.match(/class="question-heading"[\s\S]*?class="progress-summary"/) ||
  html.includes('id="completion-reset"') ||
  html.indexOf('id="reset-progress"') > html.indexOf('id="study-shell"')
) {
  throw new Error("進捗または記録初期化の表示位置が正しくありません。");
}
if (
  styles.includes(
    "grid-template-columns: minmax(250px, 0.85fr) minmax(0, 1.45fr)",
  )
) {
  throw new Error("大きな画面向けの左右二列表示が残っています。");
}
if (
  html.includes('id="mastery-panel"') ||
  html.includes('id="mastery-stages"') ||
  html.includes('id="mastery-term"') ||
  html.includes('id="current-streak"') ||
  app.includes("renderTermMastery") ||
  app.includes("あと${remaining}回連続")
) {
  throw new Error("問題ごとの習得状況表示が残っています。");
}
if (
  html.includes('id="change-conditions"') ||
  html.includes('id="shuffle-toggle"') ||
  html.includes('id="completion-change-conditions"')
) {
  throw new Error("開始後の画面に条件変更またはシャッフル操作が残っています。");
}
const configForHostname = (hostname) => {
  const context = { window: { location: { hostname } } };
  runInNewContext(config, context);
  return context.window.ANKI_CONFIG;
};
const productionConfig = configForHostname("anki-ume.vercel.app");
const localhostConfig = configForHostname("localhost");
const loopbackConfig = configForHostname("127.0.0.1");

if (
  productionConfig.dataBaseUrl !==
  "https://pub-76ffbe2829114a5cbaa433db45872267.r2.dev"
) {
  throw new Error("本番の学習データ読込先がCloudflareに設定されていません。");
}
if (
  productionConfig.progressApiBaseUrl !==
  "https://anki-progress-api.umedademu.workers.dev"
) {
  throw new Error("本番の学習記録保存先がCloudflareに設定されていません。");
}
if (app.includes('config.dataBaseUrl ?? "/data"')) {
  throw new Error("本番でローカルデータへ暗黙に切り替わる処理が残っています。");
}
if (localhostConfig.dataBaseUrl !== "/data" || loopbackConfig.dataBaseUrl !== "/data") {
  throw new Error("手元確認だけに限定したローカルデータ設定が見つかりません。");
}
if (
  localhostConfig.progressApiBaseUrl !== "http://localhost:8787" ||
  loopbackConfig.progressApiBaseUrl !== "http://localhost:8787"
) {
  throw new Error("手元確認用のCloudflare保存窓口が設定されていません。");
}
console.log(
  "画面構成検証完了: 4段階評価・Azure音声選択・Cloudflare共通設定を確認",
);
