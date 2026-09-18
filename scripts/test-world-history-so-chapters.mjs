import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { loadWorldHistorySODecks } from "./build-learning-data.mjs";
import { createSessionDatasetVersion } from "../public/deck-selection.js";

const { terms, decks, classification } = await loadWorldHistorySODecks();
const matches = JSON.parse(await readFile(new URL("../data/source/world-history-so/source-matches.json", import.meta.url), "utf8"));
assert.equal(matches.length, 356);
assert.equal(matches.filter((item) => item.status === "追加").length, 246);
assert.equal(terms.length, 357);
assert.equal(decks.length, 9);
assert.equal(new Set(decks.flatMap((deck) => deck.terms.map((term) => term.id))).size, 357);
assert.equal(classification.questions.filter((item) => item.legacyQuestionId).length, 111);
const byPrompt = new Map(decks.flatMap((deck) => deck.terms.map((term) => [term.stages.beginner[0].prompt, deck.number])));
for (const match of matches) assert.equal(byPrompt.get(match.prompt), match.chapter);
for (const [prompt, chapter] of [
  ["ウマイヤ朝の都は？", 2], ["イスラム史において最も多い王朝は何系？", 3],
  ["サーマーン朝の都は？", 3], ["カラ＝キタイについて説明しなさい", 3],
  ["オスマン帝国で、スルタン直属の常備歩兵軍団を何というか？", 7],
  ["チャルディラーンの戦いでサファヴィー朝を破り、東アナトリアを獲得したオスマン帝国のスルタンは？", 7],
]) assert.equal(byPrompt.get(prompt), chapter);
// 全入力行の対応を確認し、空白区切りの回答も取りこぼさない。
const sourceRoot = new URL("../SekaishiSO/", import.meta.url);
const sourceKeys = new Set();
const questionByPrompt = new Map(terms.map((term) => [term.stages.beginner[0].prompt, term.stages.beginner[0]]));
for (const file of (await readdir(sourceRoot)).filter((name) => /^QA_\d+\.md$/.test(name))) {
  const lines = (await readFile(new URL(file, sourceRoot), "utf8")).split(/\r?\n/);
  for (const [i, line] of lines.entries()) {
    if (!line.trim()) continue;
    const key = `SekaishiSO/${file}:${i + 1}`;
    sourceKeys.add(key);
    const found = matches.filter((match) => `${match.source}:${match.line}` === key);
    assert.equal(found.length, 1, key);
    const match = found[0];
    assert.ok(questionByPrompt.has(match.prompt), key);
    if (match.release === "0.233") {
      const [prompt, answer] = line.includes("\t") ? line.split("\t") : line.split(/(?<=？) /);
      assert.equal(match.originalPrompt, prompt.trim(), key);
      if (match.status === "追加") assert.equal(questionByPrompt.get(match.prompt).answer, answer.trim(), key);
    }
  }
}
assert.equal(sourceKeys.size, matches.length);
assert.equal(matches.filter((match) => match.release === "0.233" && match.status === "追加").length, 183);
assert.equal(matches.filter((match) => match.release === "0.233" && match.status === "同義").length, 4);
const maps = terms.filter((term) => term.stages.beginner[0].questionMap);
assert.deepEqual(maps.map((term) => byPrompt.get(term.stages.beginner[0].prompt)), [3, 3, 3, 3, 3, 5]);
const versions = new Map(decks.map((deck) => [deck.id, deck.version]));
assert.equal(new Set(decks.map((deck) => createSessionDatasetVersion("world-history-so", [deck.id], versions))).size, 9);
assert.ok(createSessionDatasetVersion("world-history-so", decks.map((deck) => deck.id), versions).length <= 100);

// 9パートの選択順に依存せず、安定した保存先を使用する。
const oldDeckIds = decks.slice(0, 10).map((deck) => deck.id);
assert.equal(createSessionDatasetVersion("world-history-so", oldDeckIds, versions),
  `mix-world-history-so-${[...oldDeckIds].sort().join("-")}`);
const allDeckIds = decks.map((deck) => deck.id);
const combined = createSessionDatasetVersion("world-history-so", allDeckIds, versions);
assert.equal(combined, createSessionDatasetVersion("world-history-so", [...allDeckIds].reverse(), versions));
assert.notEqual(combined, createSessionDatasetVersion("world-history-so", allDeckIds.slice(1), versions));

console.log("世界史SO検証完了: 元356問との照合、357問の所属、9パート、地図6問を確認");
