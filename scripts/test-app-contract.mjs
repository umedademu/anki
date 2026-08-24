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
const historyHtml = await readFile(
  path.join(projectRoot, "public", "history.html"),
  "utf8",
);
const historyApp = await readFile(
  path.join(projectRoot, "public", "history.js"),
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
const listeningPauseMigration = await readFile(
  path.join(projectRoot, "worker", "migrations", "0004_listening_pause.sql"),
  "utf8",
);
const englishSpeechMigration = await readFile(
  path.join(projectRoot, "worker", "migrations", "0005_english_speech.sql"),
  "utf8",
);
const speechPartsMigration = await readFile(
  path.join(projectRoot, "worker", "migrations", "0006_speech_parts.sql"),
  "utf8",
);
const setupPreferencesMigration = await readFile(
  path.join(projectRoot, "worker", "migrations", "0007_setup_preferences.sql"),
  "utf8",
);
const studySessionsMigration = await readFile(
  path.join(projectRoot, "worker", "migrations", "0008_study_sessions.sql"),
  "utf8",
);
const dailyStudyHistoryMigration = await readFile(
  path.join(projectRoot, "worker", "migrations", "0009_daily_study_history.sql"),
  "utf8",
);
const studySessionsByModeMigration = await readFile(
  path.join(projectRoot, "worker", "migrations", "0010_study_sessions_by_mode.sql"),
  "utf8",
);
const studyTimeMigration = await readFile(
  path.join(projectRoot, "worker", "migrations", "0011_study_time.sql"),
  "utf8",
);
const studyTimeLimitMigration = await readFile(
  path.join(projectRoot, "worker", "migrations", "0012_study_time_limit.sql"),
  "utf8",
);
const listeningQuestionIntervalMigration = await readFile(
  path.join(
    projectRoot,
    "worker",
    "migrations",
    "0013_listening_question_interval.sql",
  ),
  "utf8",
);
const app = await readFile(path.join(projectRoot, "public", "app.js"), "utf8");
const ratingSound = await readFile(
  path.join(projectRoot, "public", "rating-sound.js"),
  "utf8",
);
const cloudProgress = await readFile(
  path.join(projectRoot, "public", "cloud-progress.js"),
  "utf8",
);
const config = await readFile(path.join(projectRoot, "public", "config.js"), "utf8");
const styles = await readFile(path.join(projectRoot, "public", "styles.css"), "utf8");
const speechSegmentsBlock = app.match(
  /function speechSegmentsFor\(target,[\s\S]*?function answerSpeechSequence\(/,
)?.[0];
const automaticAnswerSpeechBlock = app.match(
  /function autoSpeakAnswerAndOverview\(\)[\s\S]*?async function goBackListeningOneStep/,
)?.[0];
const answerSpeechSequenceBlock = app.match(
  /function answerSpeechSequence\([\s\S]*?function autoSpeakQuestion\(\)/,
)?.[0];
const listeningAnswerSpeechBlock = app.match(
  /function speakListeningAnswer\(runId\)[\s\S]*?function beginListeningQuestion/,
)?.[0];
const listeningQuestionSpeechBlock = app.match(
  /function beginListeningQuestion\(\)[\s\S]*?function showSpeechPartNotice/,
)?.[0];
const listeningPlaybackFeedbackBlock = app.match(
  /function hideListeningPlaybackFeedback\(\)[\s\S]*?function getConfig/,
)?.[0];
const toggleListeningBlock = app.match(
  /function toggleListening\(\)[\s\S]*?async function returnToSetup/,
)?.[0];
const studyClockBlock = app.match(
  /function canCountStudyTime\([\s\S]*?function startNewStudyScreen/,
)?.[0];
const deckProgressStyleBlock = styles.match(
  /\.deck-progress-name\s*\{[^}]*\}/,
)?.[0];
const listeningBackBlock = app.match(
  /async function goBackListeningOneStep\(\)[\s\S]*?async function advanceListening/,
)?.[0];
const advanceListeningBlock = app.match(
  /async function advanceListening\(runId\)[\s\S]*?function speakListeningAnswer/,
)?.[0];
const startBlock = app.match(
  /async function start\(\)[\s\S]*?\n}\n\nelements\.subjectOptions/,
)?.[0];
const rateCurrentQuestionBlock = app.match(
  /async function rateCurrentQuestion\(rating\)[\s\S]*?async function resetAllProgress/,
)?.[0];
const rateListeningQuestionBlock = app.match(
  /async function rateListeningQuestion\(rating\)[\s\S]*?async function rateCurrentQuestion/,
)?.[0];
const studyShellClickBlock = app.match(
  /elements\.studyShell\.addEventListener\("click"[\s\S]*?window\.addEventListener\("keydown"/,
)?.[0];
const beginStudyBlock = app.match(
  /async function beginStudy\(\)[\s\S]*?async function resumeStudy/,
)?.[0];
const resumeStudyBlock = app.match(
  /async function resumeStudy\(\)[\s\S]*?async function activateDecks/,
)?.[0];
const generationPrompt = await readFile(
  path.join(projectRoot, "docs", "prompts", "world-history-csv-generation.md"),
  "utf8",
);
const englishGenerationPrompt = await readFile(
  path.join(projectRoot, "docs", "prompts", "english-vocabulary-csv-generation.md"),
  "utf8",
);
const japaneseHistoryGenerationPrompt = await readFile(
  path.join(projectRoot, "docs", "prompts", "japanese-history-csv-generation.md"),
  "utf8",
);
const geographyGenerationPrompt = await readFile(
  path.join(projectRoot, "docs", "prompts", "geography-csv-generation.md"),
  "utf8",
);
const biologyGenerationPrompt = await readFile(
  path.join(projectRoot, "docs", "prompts", "biology-basics-csv-generation.md"),
  "utf8",
);
const earthScienceGenerationPrompt = await readFile(
  path.join(projectRoot, "docs", "prompts", "earth-science-basics-csv-generation.md"),
  "utf8",
);
const cloudflareReplacement = await readFile(
  path.join(projectRoot, "scripts", "replace-learning-data-cloudflare.mjs"),
  "utf8",
);

const largeListeningTasks = Array.from({ length: 400 }, (_, index) => ({
  termId: `WH-D1-T-${String(index + 1).padStart(6, "0")}`,
  questionId: `WH-D1-Q-${String(index + 1).padStart(6, "0")}`,
  stage: "beginner",
}));
const largeListeningSaveBytes = Buffer.byteLength(
  JSON.stringify({
    activity: {
      eventId: "large-listening-test",
      subjectId: "world-history",
      subjectTitle: "世界史",
      deckId: "deck-1",
      deckTitle: "Deck 1 最重要骨格",
      studyMode: "listen-answer",
      questionId: largeListeningTasks[0].questionId,
    },
    session: {
      studyMode: "listen-answer",
      termIds: largeListeningTasks.map((task) => task.termId),
      tasks: largeListeningTasks,
      queue: largeListeningTasks.slice(1),
      currentTask: largeListeningTasks[0],
      unseenQuestionIds: largeListeningTasks.map((task) => task.questionId),
      retryQuestionIds: [],
    },
  }),
  "utf8",
);
if (largeListeningSaveBytes <= 64 * 1024) {
  throw new Error("400問の聞き流し保存が終了時向け通信の上限を超える試験条件になっていません。");
}

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
  !html.includes('id="subject-panel"') ||
  !html.includes('id="subject-options"') ||
  !html.includes('id="change-subject"') ||
  !html.includes('id="start-study"') ||
  !html.includes('id="deck-filter"') ||
  !html.includes('id="question-style-filter"') ||
  !html.includes('href="/changelog.html"') ||
  !html.includes('href="/settings.html"') ||
  !html.includes("v0.124") ||
  !changelog.includes("v0.124") ||
  !settingsHtml.includes("v0.124") ||
  !historyHtml.includes("v0.124")
) {
  throw new Error("開始前の条件選択画面、更新情報ページ、版番号が揃っていません。");
}
if (
  !app.includes('import { createRatingSoundPlayer } from "./rating-sound.js"') ||
  !rateCurrentQuestionBlock?.includes("ratingSoundPlayer.play(rating)") ||
  !rateListeningQuestionBlock?.includes("ratingSoundPlayer.play(rating)") ||
  !ratingSound.includes("again: Object.freeze") ||
  !ratingSound.includes("hard: Object.freeze") ||
  !ratingSound.includes("good: Object.freeze") ||
  !ratingSound.includes("easy: Object.freeze")
) {
  throw new Error("4段階評価ごとの効果音と、暗記・聞き流しへの接続が揃っていません。");
}
if (
  !html.includes('id="routine-dashboard"') ||
  !html.includes('id="start-routine"') ||
  !html.includes('id="continue-routine"') ||
  !html.includes('id="routine-setup-banner"') ||
  !html.includes('id="routine-progress"') ||
  !html.includes('id="routine-result-summary"') ||
  !html.includes('id="routine-result-time"') ||
  !html.includes('id="routine-result-total"') ||
  !html.includes('id="completion-home"') ||
  !settingsHtml.includes('id="routine-editor"') ||
  !settingsHtml.includes('id="add-routine-item"') ||
  !settingsHtml.includes('id="save-routine"') ||
  !settingsApp.includes("handleRoutineFieldChange") ||
  !settingsApp.includes('addEventListener("input", handleRoutineFieldChange)') ||
  !app.includes("recordActiveRoutineQuestion") ||
  !app.includes("showRoutineStepCompletion") ||
  !app.includes("change.completedItem.studySeconds") ||
  !app.includes('completionHome.addEventListener("click"') ||
  !app.includes('state.routineCompletionAction = "reselect"') ||
  !app.includes("continueStudyRoutineOnDate") ||
  !cloudProgress.includes("export async function saveCloudStudyRoutine") ||
  !cloudProgress.includes('cloudRequest("/v1/study-routine"') ||
  !worker.includes('url.pathname === "/v1/study-routine"') ||
  !worker.includes("studyRoutineRunStatement") ||
  !worker.includes("json_set(")
) {
  throw new Error("毎日の学習メニューの編集、進行、Cloudflare保存が揃っていません。");
}
if (
  !html.includes('href="/history.html"') ||
  !historyHtml.includes('id="history-list"') ||
  !historyHtml.includes("午前4時で日付を切替") ||
  !historyApp.includes("loadCloudStudyHistory") ||
  !historyApp.includes('memorize: "暗記モード"') ||
  !historyApp.includes('"listen-answer": "聞き流し"') ||
  !app.includes("function createStudyActivity(questionId") ||
  !app.includes("queueActiveStudyActivity(activity,") ||
  !app.includes("studyActivityEventId") ||
  !cloudProgress.includes('cloudRequest("/v1/study-history")') ||
  !cloudProgress.includes("saveCloudStudyActivity") ||
  cloudProgress.includes("keepalive: true") ||
  !cloudProgress.includes("Cloudflareへ接続できませんでした。通信状態を確認して、もう一度お試しください。") ||
  !worker.includes('url.pathname === "/v1/study-history"') ||
  !worker.includes("studyDateAtFourJst") ||
  !dailyStudyHistoryMigration.includes("CREATE TABLE IF NOT EXISTS study_activity_events")
) {
  throw new Error("午前4時区切りの日別学習記録または表示画面が揃っていません。");
}
if (
  !html.match(
    /class="progress-summary"[^>]*>[\s\S]*?id="deck-progress-name"[\s\S]*?id="queue-progress"[\s\S]*?id="study-time"/,
  ) ||
  !styles.includes(".study-time {") ||
  !styles.includes("font-variant-numeric: tabular-nums") ||
  !app.includes('studyTime: document.querySelector("#study-time")') ||
  !studyClockBlock ||
  !app.includes("function tickStudyClock") ||
  !studyClockBlock.includes("state.screenStudySeconds < state.studyTimeLimitSeconds") ||
  !studyClockBlock.includes("state.studyTimeLimitSeconds,") ||
  studyClockBlock.includes("state.listeningPaused") ||
  !app.includes("queueCurrentStudyTimeSave({ keepalive: true })") ||
  !cloudProgress.includes("export async function saveCloudStudyTime") ||
  !worker.includes("studyTimeMatch") ||
  !worker.includes("SUM(study_seconds) AS study_seconds") ||
  !studyTimeMigration.includes("CREATE TABLE IF NOT EXISTS study_time_events") ||
  !studyTimeMigration.includes("study_seconds INTEGER NOT NULL") ||
  !studyTimeLimitMigration.includes("study_time_limit_seconds") ||
  !studyTimeLimitMigration.includes("study_seconds BETWEEN 1 AND 3600") ||
  !historyApp.includes("formatStudyDuration")
) {
  throw new Error("学習時間の同一行表示、共通上限、Cloudflare保存が揃っていません。");
}
if (
  !html.includes('id="resume-study"') ||
  !html.includes("前回の続きから") ||
  !html.includes('id="study-stop"') ||
  !html.includes('id="completion-return"') ||
  !app.includes("async function resumeStudy()") ||
  !app.includes("function enqueueDueSessionTasks") ||
  !app.includes("function schedulePendingReview") ||
  !app.includes("saveCloudStudyAnswer") ||
  !app.includes("saveCloudStudySession") ||
  !app.includes("savedSessionForMode(studyMode)") ||
  !app.includes("switchStudySessionMode(") ||
  !cloudProgress.includes("export function switchStudySessionMode") ||
  !cloudProgress.includes("modeChanged ? 0 : session.screenStudySeconds") ||
  !app.includes('memorize: session,\n    "listen-answer": session') ||
  app.includes("savedSession: null") ||
  !cloudProgress.includes("normalizeStudySessions") ||
  !cloudProgress.includes('memorize: sharedSession') ||
  cloudProgress.includes("&mode=${encodeURIComponent(studyMode)}") ||
  !worker.includes('url.pathname === "/v1/study-session"') ||
  !worker.includes("studyAnswerMatch") ||
  !studySessionsMigration.includes("CREATE TABLE IF NOT EXISTS study_sessions") ||
  !studySessionsByModeMigration.includes("CREATE TABLE IF NOT EXISTS study_sessions_by_mode") ||
  !studySessionsByModeMigration.includes("PRIMARY KEY (dataset_version, study_mode)") ||
  !studySessionsByModeMigration.includes("json_extract(session_json, '$.studyMode')") ||
  studySessionsByModeMigration.includes("DROP TABLE study_sessions") ||
  !worker.includes("ON CONFLICT(dataset_version) DO UPDATE SET") ||
  !worker.includes("function deleteStudySessionStatements") ||
  !worker.includes("legacySessionRows")
) {
  throw new Error("暗記・聞き流し共通の一周保存、切替再開、期限到来時の再出題が揃っていません。");
}
if (
  !html.includes("デッキ（複数選択可）") ||
  !styles.includes(".deck-filter-choice:has(input:checked)") ||
  !app.includes("function setDeckOptions(decks, selectedDeckIds)") ||
  !app.includes("function selectedDeckIds()") ||
  !app.includes("async function activateDecks(deckIds)") ||
  !app.includes("createSessionDatasetVersion") ||
  !app.includes("datasetVersionForQuestion") ||
  !app.includes("state.allTerms = loaded.flatMap") ||
  !app.includes("state.shuffleEnabled ? shuffleTasks(tasks) : tasks") ||
  !app.includes("async function activateSubject(subjectId)") ||
  !app.includes("function showSubjectSelection()") ||
  !app.includes("subjectEntry.defaultDeckId") ||
  !app.includes("sessionDatasetVersion: state.sessionDatasetVersion") ||
  !cloudProgress.includes("sessionDatasetVersion") ||
  !worker.includes("body.sessionDatasetVersion ?? datasetVersion") ||
  !app.includes('elements.deckFilter.addEventListener("change"')
) {
  throw new Error("複数デッキの選択・混合出題・デッキ別の進捗保存が揃っていません。");
}
if (
  !cloudflareReplacement.includes('process.argv.includes("--resume-after-asset-upload")') ||
  !cloudflareReplacement.includes("await waitForVerificationSlot()") ||
  !cloudflareReplacement.includes("while (nextVerificationAt > Date.now())") ||
  !cloudflareReplacement.includes("response.status !== 429") ||
  !cloudflareReplacement.includes("assetUploadJobs") ||
  !cloudflareReplacement.includes("remoteAssetKeys") ||
  !cloudflareReplacement.includes("await uploadAndVerify(localDeckIndexJobs") ||
  !cloudflareReplacement.includes("await uploadAndVerify([localManifestJob]") ||
  !cloudflareReplacement.includes("await uploadAndVerify(\n  [localCatalogJob]") ||
  cloudflareReplacement.indexOf("await uploadAndVerify(localDeckIndexJobs") >=
    cloudflareReplacement.indexOf("await uploadAndVerify([localManifestJob]") ||
  cloudflareReplacement.indexOf("await uploadAndVerify([localManifestJob]") >=
    cloudflareReplacement.indexOf("await uploadAndVerify(\n  [localCatalogJob]")
) {
  throw new Error("Cloudflareの段階的な登録・照合・再開処理が揃っていません。");
}
if (
  !html.includes('href="/styles.css?v=0.124"') ||
  !styles.includes("-webkit-text-size-adjust: 100%") ||
  !styles.includes("text-size-adjust: 100%")
) {
  throw new Error("Safariの文字自動拡大防止または装飾ファイルの版指定がありません。");
}
if (
  !html.includes('id="question-amount-field"') ||
  !html.includes('id="question-amount-filter"') ||
  !html.includes('value="one-per-term"') ||
  !app.includes("createTermQuestionQueue") ||
  !app.includes('state.subject?.learningType !== "vocabulary"') ||
  !app.includes("state.selectedStage || usesOneQuestionPerTerm()") ||
  !app.includes('if (rating === "again")') ||
  !app.includes("elements.questionAmountFilter,")
) {
  throw new Error("英単語以外で利用する1項目1問の開始設定と一周制御が揃っていません。");
}
if (app.includes("をデッキへ追加しました。")) {
  throw new Error("不要な段階解放通知が残っています。");
}
if (
  !html.includes('id="vocabulary-speech-groups"') ||
  (html.match(/data-vocabulary-speech=/g) ?? []).length !== 4 ||
  !app.includes("answerSpeechSequence") ||
  !app.includes("createVocabularySpeechGroups")
) {
  throw new Error("英単語の4種類の個別読み上げが揃っていません。");
}
if (
  !generationPrompt.includes("冒頓単于(ぼくとつぜんう)") ||
  !generationPrompt.includes("坤輿万国全図(こんよばんこくぜんず)") ||
  !generationPrompt.includes("鄭氏台湾(ていしたいわん)") ||
  !generationPrompt.includes("王安石(おうあんせき)の低利融資政策を何という？") ||
  !generationPrompt.includes("問題文の読み仮名は回答表示時だけWebアプリに表示されます") ||
  !generationPrompt.includes("段階別デッキシリーズ全体での累計重要度順位") ||
  !generationPrompt.includes("Deck 2は401〜800") ||
  !generationPrompt.includes("https://goroawase-master.com/") ||
  !generationPrompt.includes("同じ年・同じ出来事")
) {
  throw new Error("問題集生成用プロンプトの読み仮名・語呂合わせ規則が不足しています。");
}
if (
  !englishGenerationPrompt.includes("1英単語につき1行、全10列") ||
  !englishGenerationPrompt.includes("添付されたすべての既存CSV") ||
  !englishGenerationPrompt.includes("EN-000501") ||
  !englishGenerationPrompt.includes(
    "dataset_label\nterm_id\nimportance_rank\ndifficulty_label\nword\npart_of_speech\nmeaning\naccepted_answers\nexample_sentence\nexample_translation",
  ) ||
  !englishGenerationPrompt.includes("Deck 1の500行を新しいCSVへ含めて") ||
  !englishGenerationPrompt.includes("同一の`meaning`を追加しない") ||
  !englishGenerationPrompt.includes("`accepted_answers`の先頭へ`meaning`と同じ文字列") ||
  !englishGenerationPrompt.includes("発音記号、カタカナ発音、音声ファイル名") ||
  !englishGenerationPrompt.includes("CSV以外の前置き、作業報告、選定理由")
) {
  throw new Error("英単語Deck生成用プロンプトの重複防止・三方向出題・CSV規則が不足しています。");
}
if (
  !japaneseHistoryGenerationPrompt.includes("# 日本史段階別デッキ用CSV生成プロンプト") ||
  !japaneseHistoryGenerationPrompt.includes("今回指定されたDeckの新しい用語と問題行だけ") ||
  !japaneseHistoryGenerationPrompt.includes("添付されたすべての作成済みCSV") ||
  !japaneseHistoryGenerationPrompt.includes("このプロンプトは段階数、最終的な総語数、各Deckの位置づけを固定しません") ||
  !japaneseHistoryGenerationPrompt.includes("JH-000401〜JH-000800") ||
  !japaneseHistoryGenerationPrompt.includes("各用語について、原則として3〜7問程度") ||
  !japaneseHistoryGenerationPrompt.includes("各用語について、**1〜4問**") ||
  !japaneseHistoryGenerationPrompt.includes("統合説明だけに新しい重要情報を追加しない") ||
  !japaneseHistoryGenerationPrompt.includes(
    "dataset_label\nterm_id\nimportance_rank\ndifficulty_label\ncategory\nterm\nreading\naliases\nera\nmacro_region\nregion_detail\ndisplay_period\nsort_year\nquestion_id\nstage\nfocus\nquestion_type\nquestion\nanswer\nkeywords\naccepted_answers\nanswer_note\nyear_mnemonic\nsource_name\nsource_url",
  ) ||
  !japaneseHistoryGenerationPrompt.includes("国立公文書館デジタルアーカイブ") ||
  !japaneseHistoryGenerationPrompt.includes("東京大学史料編纂所") ||
  !japaneseHistoryGenerationPrompt.includes("墾田永年私財法(こんでんえいねんしざいほう)") ||
  !japaneseHistoryGenerationPrompt.includes("https://goroawase-master.com/") ||
  !japaneseHistoryGenerationPrompt.includes("同じ年・同じ出来事") ||
  japaneseHistoryGenerationPrompt.includes("https://www.y-history.net/") ||
  japaneseHistoryGenerationPrompt.includes("Deck 10") ||
  japaneseHistoryGenerationPrompt.includes("3,600語")
) {
  throw new Error("日本史Deck生成用プロンプトの三段階・小分け作成・出典規則が不足しています。");
}
if (
  !geographyGenerationPrompt.includes("# 地理・暗記カードCSV生成プロンプト") ||
  !geographyGenerationPrompt.includes("初見の地図・統計の分析") ||
  !geographyGenerationPrompt.includes("`item_id`は`GE-`") ||
  !geographyGenerationPrompt.includes("CSVの29列") ||
  !geographyGenerationPrompt.includes("reading_map")
) {
  throw new Error("地理Deck生成用プロンプトの暗記範囲・29列・読み規則が不足しています。");
}
if (
  !biologyGenerationPrompt.includes("# 生物基礎・暗記カードCSV生成プロンプト") ||
  !biologyGenerationPrompt.includes("実験考察") ||
  !biologyGenerationPrompt.includes("`item_id`は`BB-`") ||
  !biologyGenerationPrompt.includes("CSVの25列") ||
  !biologyGenerationPrompt.includes("reading_map")
) {
  throw new Error("生物基礎Deck生成用プロンプトの暗記範囲・25列・読み規則が不足しています。");
}
if (
  !earthScienceGenerationPrompt.includes("# 地学基礎・暗記カードCSV生成プロンプト") ||
  !earthScienceGenerationPrompt.includes("初見の地図・断面図・柱状図") ||
  !earthScienceGenerationPrompt.includes("`item_id`は`ES-`") ||
  !earthScienceGenerationPrompt.includes("CSVの27列") ||
  !earthScienceGenerationPrompt.includes("reading_map")
) {
  throw new Error("地学基礎Deck生成用プロンプトの暗記範囲・27列・読み規則が不足しています。");
}
if (
  !html.includes('id="setup-speech"') ||
  !html.includes('id="question-speech"') ||
  !html.includes('id="answer-speech"') ||
  !html.includes('id="overview-speech"') ||
  !app.includes("createSpeechController") ||
  !app.includes("getQuestionExplanation") ||
  app.includes("integratedExplanation") ||
  app.includes("getIntegratedExplanationQuestion") ||
  !app.includes("autoSpeakQuestion") ||
  !app.includes("autoSpeakAnswerAndOverview") ||
  !app.includes("prepareMnemonicSpeechText(yearMnemonic)") ||
  !speech.includes("export function prepareMnemonicSpeechText") ||
  !app.includes("function toggleSpeechPart(target)") ||
  !app.includes('icon.textContent = enabled ? "🔊" : "🔇"') ||
  !html.includes('aria-pressed="true"') ||
  !html.includes('aria-pressed="false"') ||
  !speechSettings.includes("englishAzureSpeechVoices") ||
  !speechSettings.includes('en-US-JennyNeural') ||
  !speech.includes("segment.language") ||
  !worker.includes("normalizeEnglishAzureSpeechVoice") ||
  !styles.includes(".speech-button")
) {
  throw new Error("問題・回答・解説の音声読み上げ操作が揃っていません。");
}
if (
  !settingsHtml.includes('id="speech-source"') ||
  !settingsHtml.includes('id="azure-voice"') ||
  !settingsHtml.includes('id="english-azure-voice"') ||
  !settingsHtml.includes('id="device-voice"') ||
  !settingsHtml.includes('id="english-device-voice"') ||
  !settingsHtml.includes('id="speech-rate"') ||
  !settingsHtml.includes('id="speech-rate" type="range" min="0.7" max="3"') ||
  !settingsHtml.includes('id="preview-speech"') ||
  !settingsApp.includes("getJapaneseVoices") ||
  !settingsApp.includes("saveSpeechSettings") ||
  !speechSettings.includes('source: "cloud"') ||
  !speechSettings.includes('id: "ja-JP-KeitaNeural"') ||
  !speechSettings.includes('id: "ja-JP-NaokiNeural"') ||
  !speechSettings.includes("Math.min(3, Math.max(0.7, rate))") ||
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
  !html.includes('<div class="answer-line">') ||
  html.includes("別解：") ||
  html.includes('id="accepted-panel"') ||
  styles.includes(".accepted-answer") ||
  !app.includes("getQuestionAnswerDisplayText") ||
  !app.includes("getQuestionAnswerSpeechText") ||
  !styles.includes("[data-content-density=\"dense\"] #answer-text") ||
  !/#answer-text\s*\{[^}]*font-weight:\s*850;/s.test(styles) ||
  !styles.includes("font-size: clamp(0.95rem, 2vw, 1rem)") ||
  !app.includes("const minimumFontSize = 15")
) {
  throw new Error("回答・解説の見出し撤去または横向きの文字サイズ調整が不完全です。");
}
if (
  !app.includes('elements.questionCard.classList.toggle("is-vocabulary", vocabularyMode)') ||
  !styles.includes(".question-card.is-vocabulary h2") ||
  !styles.includes("font-size: clamp(1.35rem, 3.4vw, 1.62rem)") ||
  !styles.includes(".question-card.is-vocabulary #answer-text") ||
  !styles.includes("font-size: clamp(1.35rem, 3vw, 1.5rem)") ||
  !styles.includes(".question-card.is-vocabulary .answer-note") ||
  !styles.includes("font-size: clamp(0.95rem, 2vw, 1rem)")
) {
  throw new Error("英単語の横向き画面で問題・回答・例文を拡大する指定が不足しています。");
}
if (
  !html.includes('id="term-tags"') ||
  !app.includes("function renderTermTags(term, question, visible)") ||
  !app.includes("const tags = [\n    term.chronology?.displayPeriod,\n    ...getMacroRegionTags(term),") ||
  !app.includes("questionStyleLabel(question.stage)") ||
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
  !app.includes('elements.contextCard.classList.toggle("is-vocabulary", vocabularyMode)') ||
  !app.includes('elements.contextCard.classList.toggle("is-hidden", vocabularyMode && hidesTerm)') ||
  !app.includes('elements.stageName.classList.toggle("is-hidden", vocabularyMode)') ||
  html.includes('id="question-axis"') ||
  app.includes("questionAxis") ||
  styles.includes(".axis-badge") ||
  !styles.includes(".context-card.is-vocabulary .context-heading") ||
  app.includes("? questionStyleLabel(question.stage)\n      : \"通常の一問一答\"")
) {
  throw new Error("全科目の学習画面から問題種別表示を除く構成が揃っていません。");
}
if (
  !html.includes('id="term-image"') ||
  !html.includes('id="term-image-content"') ||
  !html.includes('class="term-image-frame"') ||
  html.includes('id="term-image-link"') ||
  !html.includes('id="term-image-license"') ||
  !app.includes('fetchJson("term-images.json")') ||
  !app.includes("function renderQuestionImage(question, visible)") ||
  !app.includes("const image = state.questionImages.get(question.id)") ||
  app.includes("elements.termImageLink") ||
  app.includes("image.sourcePageUrl") ||
  !app.includes('elements.termOverview.classList.toggle("has-image", showsImage)') ||
  !app.includes("state.answerVisible && (Boolean(explanation) || showsYearMnemonic)") ||
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
  !html.includes('id="year-mnemonic"') ||
  !html.includes('id="year-mnemonic-text"') ||
  !html.includes('id="year-mnemonic-speech"') ||
  html.includes("<span>年号の語呂合わせ</span>") ||
  !app.includes("getQuestionYearMnemonic") ||
  !app.includes("prepareMnemonicDisplayText") ||
  !app.includes('if (target === "mnemonic")') ||
  !app.includes('toggleSpeechPart("mnemonic")') ||
  !app.includes('.join("。")') ||
  !app.includes('elements.yearMnemonic.classList.toggle("is-hidden", !showsYearMnemonic)') ||
  !styles.includes(".year-mnemonic") ||
  !styles.includes("white-space: nowrap") ||
  !styles.includes("overflow-x: auto") ||
  !speechSegmentsBlock.includes("getQuestionYearMnemonic(term, question)") ||
  !automaticAnswerSpeechBlock?.includes("answerSpeechSequence()") ||
  !answerSpeechSequenceBlock ||
  answerSpeechSequenceBlock.indexOf('speechSegmentsFor("answer"') >=
    answerSpeechSequenceBlock.indexOf('speechSegmentsFor("mnemonic"') ||
  answerSpeechSequenceBlock.indexOf('speechSegmentsFor("mnemonic"') >=
    answerSpeechSequenceBlock.indexOf('speechSegmentsFor("overview"')
) {
  throw new Error("年号の語呂合わせの独立表示または回答直後の読み上げが揃っていません。");
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
  !generationPrompt.includes("year_mnemonic") ||
  !generationPrompt.includes("対象と同じ年・同じ出来事の語呂合わせが実際に掲載されている場合だけ") ||
  !generationPrompt.includes("`前550〜前330年`のような期間") ||
  !generationPrompt.includes("`485年以降`のような開始時期") ||
  !generationPrompt.includes("`11世紀`のような世紀") ||
  !generationPrompt.includes("`前1千年紀`のような千年紀") ||
  !generationPrompt.includes("太字記号`**`を除いた`answer`") ||
  !generationPrompt.includes("サイトに同じ対象年の掲載がなければ空欄") ||
  !generationPrompt.includes("文字単位で同じ`year_mnemonic`") ||
  !generationPrompt.includes("問題行で作った表現を言い換えずに並べてください") ||
  !generationPrompt.includes("問題文に年号が手掛かりとして書かれているだけ") ||
  !generationPrompt.includes("ChatGPTが作った独自の語呂") ||
  !generationPrompt.includes("開始点だけに掲載があれば開始点だけ") ||
  !generationPrompt.includes("同じ出来事・同じ年に複数の掲載候補がある場合は併記せず") ||
  !generationPrompt.includes("最も良い1件だけを記録する") ||
  !generationPrompt.includes("https://adx50150.wixsite.com/sekaishi-goro") ||
  !generationPrompt.includes("語呂合わせサイトのURLを`source_url`へ記録してはいけません") ||
  !generationPrompt.includes("ほかのサイトの語呂や独自作成の語呂で補ってはいけません")
) {
  throw new Error("問題集生成用プロンプトの年号語呂合わせ規則が不足しています。");
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
  !html.includes('id="listening-incorrect-action"') ||
  !html.includes('id="listening-hard-action"') ||
  !html.includes('id="listening-good-action"') ||
  !html.includes('id="listening-easy-action"') ||
  (html.match(/data-rating=/g) ?? []).length !== 8 ||
  !styles.includes("grid-template-columns: repeat(4, minmax(0, 1fr))") ||
  !styles.includes(".listening-rating-buttons") ||
  !app.includes('button.dataset.rating') ||
  html.includes('id="again-action"') ||
  html.includes('id="remembered-action"')
) {
  throw new Error("4段階評価または横一列の評価ボタンが揃っていません。");
}
if (
  !settingsHtml.includes('id="review-settings-form"') ||
  !settingsHtml.includes('id="study-time-settings-form"') ||
  !settingsHtml.includes('id="study-time-limit-seconds"') ||
  !settingsHtml.includes('id="save-study-time-settings"') ||
  !settingsHtml.includes('id="access-key"') ||
  !settingsApp.includes("normalizeStudyTimeLimitSeconds") ||
  !settingsApp.includes("saveCloudSettings(readStudyTimeForm())") ||
  !cloudProgress.includes("studyTimeLimitSeconds: defaultStudyTimeLimitSeconds") ||
  !worker.includes("study_time_limit_seconds") ||
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
  !settingsApp.includes("saveCloudSettings(readSharedSpeechForm())") ||
  !settingsApp.includes("fillSpeechForm(saved)") ||
  !app.includes("queueSetupPreferenceSave") ||
  app.includes("anki-shuffle:") ||
  app.includes("anki-auto-speech:v1") ||
  !worker.includes("shuffle_enabled") ||
  !worker.includes("auto_speech_enabled") ||
  !sharedSettingsMigration.includes("speech_source") ||
  !sharedSettingsMigration.includes("azure_voice_id") ||
  !sharedSettingsMigration.includes("device_voice_id") ||
  !sharedSettingsMigration.includes("speech_rate") ||
  !listeningPauseMigration.includes("listening_pause_seconds") ||
  !englishSpeechMigration.includes("english_azure_voice_id") ||
  !englishSpeechMigration.includes("english_device_voice_id") ||
  !speechPartsMigration.includes("speech_parts_json") ||
  !worker.includes("speech_parts_json") ||
  !setupPreferencesMigration.includes("setup_preferences_json") ||
  !worker.includes("setup_preferences_json") ||
  !worker.includes("normalizeSetupPreferences") ||
  !cloudProgress.includes("normalizeSetupPreferences") ||
  !app.includes("function captureSetupPreferences()") ||
  !app.includes("function applySetupPreferences()") ||
  !app.includes("queueVisibleSetupPreferenceSave()")
) {
  throw new Error("設定画面と開始前の選択をCloudflareで共有する構成が揃っていません。");
}
if (
  !html.includes('id="home-link" href="/" aria-label="科目選択へ戻る"') ||
  !app.includes("async function returnToSubjectSelection()") ||
  !app.includes('elements.homeLink.addEventListener("click"') ||
  !app.includes("event.preventDefault()") ||
  !app.includes("state.activeSession = false") ||
  !startBlock ||
  !startBlock.includes("showSubjectSelection()") ||
  startBlock.includes("activateSubject(") ||
  !app.includes("await queueActiveSessionSave()")
) {
  throw new Error("起動時とAnkiロゴから科目選択へ戻る処理が揃っていません。");
}
if (
  !html.includes('id="study-menu-trigger"') ||
  !html.includes('id="study-menu-layer"') ||
  !html.includes('id="study-menu-setup"') ||
  !html.includes('id="study-menu-home"') ||
  !html.includes('id="study-menu-speech-rate"') ||
  !html.includes('id="study-menu-question-interval-seconds"') ||
  !html.includes('id="study-menu-again-value"') ||
  !html.includes('id="study-menu-hard-value"') ||
  !html.includes('id="study-menu-good-value"') ||
  !html.includes('id="study-menu-easy-value"') ||
  !app.includes("function openStudyMenu()") ||
  !app.includes("function closeStudyMenu(") ||
  !app.includes("async function saveStudyMenuSettings()") ||
  !app.includes("saveCloudSettings(readStudyMenuSettings())") ||
  !app.includes("state.reviewSettings = normalizeReviewSettings(saved)") ||
  !styles.includes(".study-menu-trigger {") ||
  !styles.includes(".study-menu-layer {") ||
  !styles.includes("width: min(46vw, 330px)")
) {
  throw new Error("学習中メニューの移動・音声・復習間隔の操作が揃っていません。");
}
if (
  !speechSegmentsBlock ||
  !speechSegmentsBlock.includes("const includeAcceptedAnswers =") ||
  speechSegmentsBlock.includes("includesAcceptedAnswers") ||
  !speechSegmentsBlock.includes(
    "getQuestionAnswerSpeechParts(question, {",
  ) ||
  !speechSegmentsBlock.includes("preferFullName") ||
  !speechSegmentsBlock.includes("term,") ||
  !app.includes("function shouldPreferHistoryFullName(term, question)")
) {
  throw new Error("回答音声の別解設定に宣言と異なる指定名が含まれています。");
}
if (
  !rateCurrentQuestionBlock ||
  !beginStudyBlock ||
  !resumeStudyBlock ||
  rateCurrentQuestionBlock.indexOf("autoSpeakQuestion();") >=
    rateCurrentQuestionBlock.indexOf("await saveCloudStudyAnswer(") ||
  rateCurrentQuestionBlock.indexOf("autoSpeakQuestion();") >=
    rateCurrentQuestionBlock.indexOf("await pendingStudySessionSave") ||
  rateCurrentQuestionBlock.indexOf("autoSpeakQuestion();") >=
    rateCurrentQuestionBlock.indexOf("await pendingStudyTimeSave") ||
  beginStudyBlock.indexOf("autoSpeakQuestion();") >=
    beginStudyBlock.indexOf("await saveCloudStudySession(") ||
  resumeStudyBlock.indexOf("autoSpeakQuestion();") >=
    resumeStudyBlock.indexOf("await saveCloudStudySession(") ||
  !app.includes("elements.nextAction.disabled = state.saving") ||
  !app.includes("elements.backAction.disabled = !canGoBack || state.saving") ||
  !app.includes("state.answerVisible ||\n    state.saving")
) {
  throw new Error("暗記モードの次問音声をCloudflare保存より先に開始する処理が揃っていません。");
}
if (
  !html.includes('name="study-mode" value="memorize"') ||
  !html.includes('name="study-mode" value="listen-answer"') ||
  html.includes('name="study-mode" value="listen-explanation"') ||
  (html.match(/name="study-mode"/g) ?? []).length !== 2 ||
  !html.includes('id="listening-answer-description"') ||
  html.includes('id="speech-part-controls"') ||
  (html.match(/data-speech-part-option/g) ?? []).length !== 0 ||
  !html.includes('id="listening-dock"') ||
  !html.includes('id="listening-playback-feedback"') ||
  html.includes('id="listening-status"') ||
  html.includes('id="listening-back"') ||
  html.includes('id="listening-toggle"') ||
  html.includes('id="listening-stop"') ||
  !settingsHtml.includes('id="listening-pause-seconds"') ||
  !settingsHtml.includes('id="listening-question-interval-seconds"') ||
  !app.includes("function beginListeningQuestion()") ||
  !app.includes("function speakListeningAnswer(runId)") ||
  app.includes('"listen-explanation"') ||
  !app.includes("createVocabularyAutomaticAnswerSequence") ||
  !app.includes("function toggleSpeechPart(target)") ||
  app.includes("function handleSpeechPartChange(event)") ||
  app.includes("function speakTarget(target)") ||
  !app.includes("function queueSpeechPartsSave()") ||
  !app.includes("function currentQuestionSpeechEnabled(") ||
  !app.includes('button.setAttribute("aria-pressed", String(enabled))') ||
  !styles.includes(".speech-button.is-enabled") ||
  styles.includes("body.is-listening .speech-button") ||
  !app.includes("normalizeSpeechParts") ||
  !listeningAnswerSpeechBlock?.includes("answerSpeechSequence()") ||
  !listeningAnswerSpeechBlock?.includes("preloadListeningTask(state.queue[0])") ||
  !listeningAnswerSpeechBlock?.includes("window.setTimeout") ||
  !listeningQuestionSpeechBlock?.includes(
    "speechController.preload(answerSpeechSequence())",
  ) ||
  listeningQuestionSpeechBlock?.includes("if (pauseSeconds === 0)") ||
  !listeningQuestionSpeechBlock?.includes("window.setTimeout") ||
  !speech.includes("function preload(segments)") ||
  !speech.includes("const cloudAudioCacheLimit = 12") ||
  !speech.includes("resetPlayback();") ||
  speech.includes("resetPlayback(Boolean(currentTarget))") ||
  !speech.includes("deviceStartTimeoutMs = 1500") ||
  !speech.includes("cloudStartTimeoutMs = 3000") ||
  !speech.includes("utterance.onstart = markStarted") ||
  !speech.includes("utterance.onboundary = markStarted") ||
  !speech.includes("synthesis.resume?.()") ||
  !speech.includes("retryCount < 1") ||
  !speech.includes("export function createHistorySpeechReadings(terms)") ||
  !speech.includes("getHistoryReadings = () => ({})") ||
  !app.includes("createHistorySpeechReadings(state.allTerms)") ||
  !app.includes("getHistoryReadings: () => state.historySpeechReadings") ||
  !cloudProgress.includes("defaultSpeechParts") ||
  !cloudProgress.includes("normalizeSpeechParts") ||
  app.includes("unavailableForSubject") ||
  !app.includes("createQuestionQueue") ||
  !cloudProgress.includes("listeningPauseSeconds: 0") ||
  !cloudProgress.includes("listeningQuestionIntervalSeconds: 0") ||
  !app.includes("state.listeningQuestionIntervalSeconds * 1000") ||
  !worker.includes("listening_pause_seconds") ||
  !worker.includes("listening_question_interval_seconds") ||
  !listeningQuestionIntervalMigration.includes(
    "listening_question_interval_seconds",
  ) ||
  !styles.includes(".study-mode-options") ||
  !styles.includes(".listening-dock") ||
  !styles.includes(".listening-playback-feedback") ||
  styles.includes(".listening-dock p") ||
  app.includes("setListeningStatus(") ||
  !styles.includes("min-height: calc(76px + env(safe-area-inset-bottom))") ||
  !styles.includes("body.is-listening .page") ||
  !styles.includes("padding-bottom: max(3px, env(safe-area-inset-bottom))")
) {
  throw new Error("聞き流しモード、読み上げ内容、回答待ち時間の構成が揃っていません。");
}
if (
  !listeningPlaybackFeedbackBlock ||
  !toggleListeningBlock ||
  !listeningPlaybackFeedbackBlock.includes('textContent = isPlayFeedback ? "▶" : "Ⅱ"') ||
  !listeningPlaybackFeedbackBlock.includes("}, 1000);") ||
  !toggleListeningBlock.includes('showListeningPlaybackFeedback("play")') ||
  !toggleListeningBlock.includes('showListeningPlaybackFeedback("pause")') ||
  toggleListeningBlock.includes("stopStudyClock();") ||
  !styles.includes("background: rgb(25 31 27 / 48%)") ||
  !styles.includes("top: 50%") ||
  !styles.includes("left: 50%")
) {
  throw new Error("聞き流しの一時停止・再開を示す中央の一時表示が揃っていません。");
}
if (
  html.includes('id="completion-back"') ||
  !listeningBackBlock ||
  !listeningBackBlock.includes('"rating"') ||
  !listeningBackBlock.includes("state.answerVisible = false") ||
  !listeningBackBlock.includes("restoreActiveSession(snapshot.studySession") ||
  !listeningBackBlock.includes("undoCloudStudyActivity(") ||
  !listeningBackBlock.includes("saveCloudStudyAnswer(") ||
  !listeningBackBlock.includes("deleteActivityId: snapshot.studyActivityEventId") ||
  !listeningBackBlock.includes("state.listeningPaused = true") ||
  !app.includes('type: "listening-advance"') ||
  !app.includes('type: "reveal"') ||
  !app.includes("function isCompletedListeningSession(session)") ||
  !app.includes('setSavedSessionForMode("listen-answer", null)') ||
  !app.includes("completeSession: sessionComplete") ||
  !app.includes('elements.completionEyebrow.textContent = "一巡完了"') ||
  app.includes("state.queue = state.sessionTasks.map(cloneTask)") ||
  !app.includes("usesListeningResultHalfScreenBack") ||
  !app.includes('window.matchMedia("(pointer: coarse)").matches') ||
  !studyShellClickBlock?.includes("} else if (isListeningMode())") ||
  !studyShellClickBlock?.includes("toggleListening();") ||
  !app.includes('window.matchMedia("(orientation: portrait) and (pointer: coarse)")') ||
  !app.includes("horizontalDistance < 60") ||
  !app.includes("void goBackListeningOneStep();") ||
  !cloudProgress.includes("export async function undoCloudStudyActivity") ||
  !cloudProgress.includes("completeSession = false") ||
  !cloudProgress.includes("/undo?dataset=") ||
  !worker.includes("studyActivityUndoMatch") ||
  !worker.includes("body.completeSession === true") ||
  !worker.includes('activity.studyMode !== "listen-answer"') ||
  !worker.includes("DELETE FROM study_activity_events") ||
  !worker.includes("studyMode !== \"listen-answer\"")
) {
  throw new Error("聞き流しを回答表示と問題完了の単位で1手戻す構成が不足しています。");
}
if (
  !rateListeningQuestionBlock ||
  !advanceListeningBlock ||
  !rateListeningQuestionBlock.includes("applyQuestionRating(term, question, rating)") ||
  !rateListeningQuestionBlock.includes("stopListeningSequence();") ||
  !rateListeningQuestionBlock.includes("await saveCloudStudyAnswer(") ||
  !rateListeningQuestionBlock.includes('studyMode: "listen-answer"') ||
  !rateListeningQuestionBlock.includes("activity,") ||
  !rateListeningQuestionBlock.includes('setSavedSessionForMode("listen-answer", saved.session)') ||
  !rateListeningQuestionBlock.includes("restoreRatingUndoSnapshot(state.progress, snapshot)") ||
  !rateListeningQuestionBlock.includes("const resumesFromPause = state.listeningPaused") ||
  !rateListeningQuestionBlock.includes("state.listeningPaused = false") ||
  !rateListeningQuestionBlock.includes("if (resumesFromPause)") ||
  !rateListeningQuestionBlock.includes('showListeningPlaybackFeedback("play")') ||
  rateListeningQuestionBlock.indexOf("state.listeningPaused = false") >=
    rateListeningQuestionBlock.indexOf("beginListeningQuestion();") ||
  rateListeningQuestionBlock.includes("queueActiveStudyActivity(") ||
  !advanceListeningBlock.includes("queueActiveStudyActivity(activity,") ||
  advanceListeningBlock.includes("applyQuestionRating(") ||
  advanceListeningBlock.includes("saveCloudStudyAnswer(") ||
  !app.includes("const showsListeningRatingActions = listening && hasQuestion && state.answerVisible") ||
  !app.includes('elements.listeningDock.classList.toggle(\n    "is-hidden",\n    !showsListeningRatingActions') ||
  !app.includes('state.currentTask &&\n      state.answerVisible &&\n      /^[1-4]$/.test(event.key)') ||
  !worker.includes("if (!setupStudyModes.has(studyMode))")
) {
  throw new Error("聞き流しの任意評価またはCloudflareへの一括保存が揃っていません。");
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
  !styles.includes(".action-dock,\n  .listening-dock {\n    position: static;\n    min-height: 0;\n    padding: 0;\n    grid-row: 4;")
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
  !html.match(
    /class="progress-summary"[^>]*>[\s\S]*?id="deck-progress-name"[\s\S]*?id="overall-progress"[\s\S]*?id="queue-progress"/,
  ) ||
  !app.includes('deckProgressName: document.querySelector("#deck-progress-name")') ||
  !app.includes('elements.deckProgressName.textContent = currentDeckName.replaceAll("｜", " ")') ||
  !app.includes("elements.deckProgressName.title = currentDeckName") ||
  !deckProgressStyleBlock ||
  !deckProgressStyleBlock.includes("text-overflow: ellipsis") ||
  !deckProgressStyleBlock.includes("white-space: nowrap") ||
  deckProgressStyleBlock.includes("font-size") ||
  !/\.progress-summary\s*\{[^}]*flex-wrap:\s*nowrap;/s.test(styles)
) {
  throw new Error("デッキ名を進捗と同じ一行・同じ文字サイズで表示する構成が不足しています。");
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
  "画面構成検証完了: 4段階評価・開始前全項目・Cloudflare共通設定を確認",
);
