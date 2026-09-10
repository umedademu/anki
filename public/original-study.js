export function parseOriginalQuestions(text) {
  const questions = [];
  const errors = [];
  String(text).replace(/^\uFEFF/, "").split(/\r\n|\n|\r/).forEach((line, index) => {
    if (!line.trim()) return;
    const columns = line.split("\t").map((value) => value.trim());
    if (columns.length < 2 || columns.length > 3) {
      errors.push(`${index + 1}行目：問題・回答（・解説）の2列または3列をタブで区切ってください。`);
    } else if (!columns[0] || !columns[1]) {
      errors.push(`${index + 1}行目：${!columns[0] ? "問題" : "回答"}がありません。`);
    } else {
      questions.push({ prompt: columns[0], answer: columns[1], explanation: columns[2] ?? "" });
    }
  });
  if (questions.length > 10000) errors.push("一度に読み込める問題は10,000問までです。分けて貼り付けてください。");
  return { questions, errors };
}

export function createOriginalDeck(questions, version) {
  return {
    subject: {
      id: "original", title: "オリジナル", version,
      learningType: "history", simpleQuestions: true, masteryTarget: 2,
      availableStages: ["beginner"], stageLabels: { beginner: "一問一答" },
      filterLabels: {}, termCount: questions.length, questionCount: questions.length,
    },
    terms: questions.map((question, index) => {
      const id = `original-term-${index + 1}`;
      return {
        id, datasetLabel: "オリジナル｜今回の問題", importanceRank: index + 1,
        term: question.prompt, reading: "", aliases: [], category: "オリジナル", era: "",
        geography: { macroRegion: "", macroRegions: [], regionDetail: "" },
        chronology: { displayPeriod: "", sortYear: index + 1 },
        stages: {
          beginner: [{ ...question, id: `${id}-B01`, stage: "beginner", focus: "一問一答",
            type: "short_answer", label: "一問一答", keywords: [], acceptedAnswers: [],
            answerNote: "", yearMnemonic: "", hideTermUntilAnswer: true }],
          reverse: [], integrated: [],
        },
      };
    }),
  };
}

export const originalQuestionsStorageKey = "anki-original-questions:v1";

// 入力だけを端末に保存し、出題・音声・評価は他教科と同じ画面に渡す。
export function createOriginalStudy(
  panel, onExit, onStart, getStorage = () => window.localStorage,
) {
  const find = (name) => panel.querySelector(`[data-original="${name}"]`);
  const input = find("input");
  let starting = false;
  function validate() {
    const result = parseOriginalQuestions(input.value);
    find("status").textContent = result.errors.length ? result.errors.join("\n")
      : result.questions.length ? `${result.questions.length}問を読み込みました。` : "問題を貼り付けてください。";
    input.setAttribute("aria-invalid", String(result.errors.length > 0));
    find("start").disabled = starting || result.errors.length > 0 || !result.questions.length;
    return result;
  }
  function saveInput() {
    try {
      const storage = getStorage();
      if (input.value) storage.setItem(originalQuestionsStorageKey, input.value);
      else storage.removeItem(originalQuestionsStorageKey);
      find("storage-status").textContent = input.value
        ? "このブラウザーに自動保存しました。" : "保存した問題はありません。";
    } catch {
      find("storage-status").textContent = "端末に保存できませんでした。保存容量やブラウザーの設定を確認してください。今回の入力は、画面を離れる前にコピーして控えてください。";
    }
  }
  input.addEventListener("input", () => { validate(); saveInput(); });
  find("delete").addEventListener("click", () => {
    if (starting) return;
    try {
      getStorage().removeItem(originalQuestionsStorageKey);
      clear();
      find("storage-status").textContent = "保存した問題を削除しました。";
      input.focus();
    } catch {
      find("storage-status").textContent = "保存した問題を削除できませんでした。ブラウザーの設定を確認して、もう一度お試しください。";
    }
  });
  find("exit").addEventListener("click", onExit);
  find("start").addEventListener("click", async () => {
    if (starting) return;
    const parsed = validate();
    if (parsed.errors.length || !parsed.questions.length) return;
    starting = true;
    find("start").disabled = true;
    try { await onStart(parsed.questions); }
    catch (error) { find("status").textContent = error.message; }
    finally { starting = false; find("start").disabled = false; }
  });
  // 画面を閉じるときの片付けでは、保存済みの入力を削除しない。
  function clear() {
    input.value = "";
    find("storage-status").textContent = "";
    validate();
  }
  return { clear, open() {
    clear();
    try {
      input.value = getStorage().getItem(originalQuestionsStorageKey) ?? "";
      find("storage-status").textContent = input.value
        ? "このブラウザーに保存した問題を復元しました。" : "入力すると、このブラウザーに自動保存します。";
    } catch {
      find("storage-status").textContent = "保存した問題を読み込めませんでした。ブラウザーの設定を確認してください。";
    }
    validate();
    input.focus();
  } };

}
