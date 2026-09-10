import assert from "node:assert/strict";
import { parseOriginalQuestions, createOriginalStudy } from "../public/original-study.js";

assert.deepEqual(parseOriginalQuestions("\uFEFF問1\t答1\r\n\r\n問2\t答2\t解説\r問3\t答3\t"), {
  questions: [
    { prompt: "問1", answer: "答1", explanation: "" },
    { prompt: "問2", answer: "答2", explanation: "解説" },
    { prompt: "問3", answer: "答3", explanation: "" },
  ], errors: [],
});
assert.equal(parseOriginalQuestions(" \n\t\n").questions.length, 0);
const invalid = parseOriginalQuestions("問題だけ\n問\t\n\t答\n問\t答\t説明\t余分");
assert.equal(invalid.errors.length, 4);
assert.ok(invalid.errors.every((error, index) => error.startsWith(`${index + 1}行目`)));

// 保存・音声の窓口を一切渡さずに、入力から再出題・破棄までを確認する。
const nodes = new Map();
function node(name) {
  if (!nodes.has(name)) {
    const classes = new Set();
    nodes.set(name, {
      value: "", textContent: "", checked: false, disabled: false, handlers: {},
      classList: {
        add: (value) => classes.add(value), remove: (value) => classes.delete(value),
        contains: (value) => classes.has(value),
        toggle(value, enabled) { enabled ? classes.add(value) : classes.delete(value); },
      },
      setAttribute() {}, focus() {},
      querySelector: () => ({ focus() {} }),
      addEventListener(event, handler) { this.handlers[event] = handler; },
    });
  }
  return nodes.get(name);
}
const panel = { querySelector: (selector) => node(selector.match(/"([^"]+)"/)[1]) };
let exited = false;
const study = createOriginalStudy(panel, () => { exited = true; study.clear(); });
const click = (name) => node(name).handlers.click();
const rate = (rating) => node("ratings").handlers.click({ target: { closest: () => ({ dataset: { originalRating: String(rating) } }) } });
study.open();
assert.equal(node("start").disabled, true);
node("input").value = "<b>問1</b>\t答1\t解説1\n問2\t答2";
node("input").handlers.input();
assert.equal(node("status").textContent, "2問を読み込みました。");
click("start");
assert.equal(node("prompt").textContent, "<b>問1</b>");
assert.equal(node("answer").textContent, "");
rate(2); // 回答を見る前には評価できない。
assert.equal(node("prompt").textContent, "<b>問1</b>");
click("reveal");
assert.equal(node("explanation").textContent, "解説1");
rate(0);
assert.equal(node("prompt").textContent, "問2");
click("reveal");
assert.equal(node("explanation-area").classList.contains("is-hidden"), true);
rate(1);
assert.equal(node("prompt").textContent, "<b>問1</b>");
click("reveal"); rate(3);
assert.equal(node("completion").classList.contains("is-hidden"), false);
assert.match(node("result").textContent, /不正解 1回・難しい 1回・正解 0回・簡単 1回/);
click("again");
assert.equal(node("prompt").textContent, "<b>問1</b>");
click("reveal"); rate(2); click("reveal"); rate(2);
assert.match(node("result").textContent, /正解 2回/);
click("edit");
assert.equal(node("setup").classList.contains("is-hidden"), false);
node("input").value = "不正な行";
node("input").handlers.input();
assert.equal(node("start").disabled, true);
click("start");
assert.equal(node("setup").classList.contains("is-hidden"), false);
click("exit");
assert.ok(exited);
assert.equal(node("input").value, "");
assert.equal(node("answer").textContent, "");
assert.equal(node("result").textContent, "");
console.log("オリジナル問題検証完了: 列数・空欄・混在・安全な文字表示・評価・再出題・再挑戦・入力破棄を確認");
