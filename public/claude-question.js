// 答えの表示中に、今の問題を claude.ai の入力欄へ入れた状態で開くための文章とURLを作る。
// 返事は claude.ai 側に表示され、アプリの評価や学習記録には触れない。

const claudeNewChatUrl = "https://claude.ai/new";

// 英単語・古文・漢文・マインドセットは対象外にする。科目IDか学習の種類で判定する。
const excludedSubjectIds = new Set([
  "english-vocabulary",
  "classical-japanese",
  "classical-chinese",
  "mindset",
]);
const excludedLearningTypes = new Set(["vocabulary", "mindset"]);

export function showsClaudeQuestion(subject) {
  if (!subject) return false;
  return !excludedSubjectIds.has(subject.id) &&
    !excludedLearningTypes.has(subject.learningType);
}

// 問題文の読み仮名「(ひらがな)」は表示前と同じ規則で外す。
const readingPattern = /\([ぁ-ゖー]+(?:[・\s][ぁ-ゖー]+)*\)/g;
const htmlTagPattern = /<[^>]*>/g;
const hashtagLinePattern = /^[#＃]\S/u;

export function plainClaudeText(value) {
  return String(value ?? "")
    .replace(htmlTagPattern, "")
    .replace(readingPattern, "")
    .replaceAll("**", "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !hashtagLinePattern.test(line))
    .join("\n")
    .trim();
}

export function buildClaudeQuestionText({ prompt, answer, explanation }) {
  const lines = [
    "次の一問一答について質問します。",
    `問題：${plainClaudeText(prompt)}`,
    `答え：${plainClaudeText(answer)}`,
  ];
  const plainExplanation = plainClaudeText(explanation);
  if (plainExplanation) lines.push(`解説：${plainExplanation}`);
  lines.push("質問：");
  return lines.join("\n");
}

export function claudeQuestionUrl(fields) {
  return `${claudeNewChatUrl}?q=${encodeURIComponent(buildClaudeQuestionText(fields))}`;
}
