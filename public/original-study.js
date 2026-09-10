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
  return { questions, errors };
}

// 問題も評価もこの画面のメモリー内だけに保持する。
export function createOriginalStudy(panel, onExit) {
  const find = (name) => panel.querySelector(`[data-original="${name}"]`);
  const input = find("input");
  let questions = [];
  let queue = [];
  let completed = 0;
  let ratings = [0, 0, 0, 0];
  let revealed = false;
  const show = (name) => {
    for (const section of ["setup", "study", "completion"]) {
      find(section).classList.toggle("is-hidden", section !== name);
    }
  };
  function validate() {
    const result = parseOriginalQuestions(input.value);
    find("status").textContent = result.errors.length
      ? result.errors.join("\n")
      : result.questions.length ? `${result.questions.length}問を読み込みました。` : "問題を貼り付けてください。";
    input.setAttribute("aria-invalid", String(result.errors.length > 0));
    find("start").disabled = result.errors.length > 0 || result.questions.length === 0;
    return result;
  }
  function render() {
    revealed = false;
    if (!queue.length) {
      show("completion");
      find("result").textContent = `${questions.length}問を学習しました。不正解 ${ratings[0]}回・難しい ${ratings[1]}回・正解 ${ratings[2]}回・簡単 ${ratings[3]}回。`;
      find("again").focus();
      return;
    }
    show("study");
    find("progress").textContent = `完了 ${completed} / ${questions.length}問・残り ${queue.length}問`;
    find("prompt").textContent = queue[0].prompt;
    find("answer").textContent = "";
    find("explanation").textContent = "";
    find("answer-area").classList.add("is-hidden");
    find("ratings").classList.add("is-hidden");
    find("reveal").classList.remove("is-hidden");
    find("reveal").focus();
  }
  function begin() {
    const result = validate();
    if (result.errors.length || !result.questions.length) return;
    questions = result.questions;
    queue = [...questions];
    if (find("shuffle").checked) {
      for (let i = queue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [queue[i], queue[j]] = [queue[j], queue[i]];
      }
    }
    completed = 0;
    ratings = [0, 0, 0, 0];
    render();
  }
  function clear() {
    input.value = "";
    questions = [];
    queue = [];
    completed = 0;
    ratings = [0, 0, 0, 0];
    revealed = false;
    find("shuffle").checked = false;
    for (const name of ["prompt", "answer", "explanation", "progress", "result"]) find(name).textContent = "";
    validate();
    show("setup");
  }
  input.addEventListener("input", validate);
  find("start").addEventListener("click", begin);
  find("again").addEventListener("click", begin);
  find("edit").addEventListener("click", () => { show("setup"); input.focus(); });
  find("exit").addEventListener("click", onExit);
  find("reveal").addEventListener("click", () => {
    if (!queue.length || revealed) return;
    revealed = true;
    find("answer").textContent = queue[0].answer;
    find("explanation").textContent = queue[0].explanation;
    find("explanation-area").classList.toggle("is-hidden", !queue[0].explanation);
    find("answer-area").classList.remove("is-hidden");
    find("ratings").classList.remove("is-hidden");
    find("reveal").classList.add("is-hidden");
    find("ratings").querySelector("button").focus();
  });
  find("ratings").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-original-rating]");
    if (!button || !revealed || !queue.length) return;
    const rating = Number(button.dataset.originalRating);
    ratings[rating]++;
    const question = queue.shift();
    if (rating === 0) queue.push(question);
    else completed++;
    render();
  });
  return { clear, open() { clear(); input.focus(); } };
}
