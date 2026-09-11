import assert from "node:assert/strict";
import { createAnswerMap } from "./create-answer-map.mjs";
import { runInNewContext } from "node:vm";
import { readFile } from "node:fs/promises";
import { loadWorldHistorySODecks, parseCsv, parseSimpleQuestions } from "./build-learning-data.mjs";
import {
  createEmptyProgress, createQuestionQueue, filterTermsBySelection,
  getQuestionAnswerDisplayText, getQuestionExplanation, rateQuestion,
  serializeProgress, deserializeProgress,
} from "../public/learning-engine.js";

const { terms, decks } = await loadWorldHistorySODecks();
const sourceRows = parseCsv(decks[0].sourceText).slice(1);
assert.equal(terms.length, sourceRows.length);
assert.equal(new Set(terms.map((term) => term.id)).size, terms.length);
for (const [index, term] of terms.entries()) {
  assert.equal(term.stages.beginner.length, 1);
  assert.deepEqual(term.stages.reverse, []);
  assert.deepEqual(term.stages.integrated, []);
  const question = term.stages.beginner[0];
  assert.deepEqual([question.prompt, question.answer, question.explanation, term.category], sourceRows[index]);
  assert.equal(getQuestionAnswerDisplayText(question), sourceRows[index][1]);
  assert.equal(getQuestionExplanation(term, question), sourceRows[index][2].trim());
}
const sample = '\uFEFF問題,回答,説明,カテゴリ\n"問,1","答""1","説明\n続き",イスラーム世界\n問2,答2,,中国史\n';
const parsed = parseSimpleQuestions(sample);
assert.equal(parsed[0].stages.beginner[0].prompt, "問,1");
assert.equal(parsed[0].stages.beginner[0].answer, '答"1');
assert.equal(parsed[0].stages.beginner[0].explanation, "説明\n続き");
assert.equal(filterTermsBySelection(parsed, { category: "中国史" }).length, 1);
const edited = parseSimpleQuestions("問題,回答,解説,カテゴリ\n問2,修正答,追記,欧州史\n問3,答3,,欧州史\n");
assert.equal(edited[0].id, parsed[1].id);
assert.equal(parseSimpleQuestions("問題,回答,解説\n問,答,説明", "イスラーム世界")[0].category, "イスラーム世界");
for (const csv of [
  "問題,回答,解説\n問,答,説明",
  "問題,回答,解説,カテゴリ\n問,,説明,分類",
  "問題,回答,解説,カテゴリ\n問,答,説明,分類,余分",
  "問題,回答,解説,カテゴリ\n問,答,,分類\n問,別答,,別分類",
  '問題,回答,解説,カテゴリ\n"閉じない,答,説明,分類',
]) assert.throws(() => parseSimpleQuestions(csv));

const progress = createEmptyProgress();
const queue = createQuestionQueue(terms, progress, 2);
assert.equal(queue.length, terms.length);
assert.ok(queue.every((task) => task.stage === "beginner"));
const firstId = terms[0].stages.beginner[0].id;
rateQuestion(progress, firstId, "good", 2);
assert.equal(createQuestionQueue(terms, progress, 2).length, terms.length - 1);
assert.equal(deserializeProgress(serializeProgress(progress)).questions[firstId].lastRating, "good");

const catalog = JSON.parse(await readFile(new URL("../public/data/index.json", import.meta.url), "utf8"));
const entry = catalog.subjects.find((subject) => subject.id === "world-history-so");
assert.equal(entry.title, "世界史SO");
assert.equal(entry.questionCount, terms.length);
const subject = JSON.parse(await readFile(new URL(`../public/data/${entry.indexPath}`, import.meta.url), "utf8"));
assert.equal(subject.simpleQuestions, true);
assert.equal(subject.version, decks[0].version);
assert.deepEqual(subject.availableStages, ["beginner"]);
const generated = [];
for (const deck of entry.decks) {
  const deckIndex = JSON.parse(await readFile(new URL(`../public/data/${deck.indexPath}`, import.meta.url), "utf8"));
  for (const chunk of deckIndex.chunks) {
    const data = JSON.parse(await readFile(new URL(`../public/data/${chunk.path}`, import.meta.url), "utf8"));
    assert.equal(data.subjectId, "world-history-so");
    generated.push(...data.terms);
  }
}
assert.deepEqual(generated, decks.flatMap((deck) => deck.terms));
console.log(`世界史SO: ${terms.length}問の全文一致、カテゴリ、追記時の識別番号、出題・評価・復習、CSVの異常検知を確認しました。`);

// 地図の問題面から答えが漏れず、次の通常問題へ図が残らないことを確認する。
const maps = terms.flatMap((term) => term.stages.beginner).filter((question) => question.questionMap);
assert.equal(maps.length, 6);
const expectedMaps = [
  ["後ウマイヤ朝", "イドリース朝", "アッバース朝", "バグダード", "サーマーン朝"],
  ["後ウマイヤ朝", "ファーティマ朝", "アッバース朝", "バグダード", "ブワイフ朝", "サーマーン朝", "カラ=ハン朝"],
  ["ムラービト朝", "ファーティマ朝", "セルジューク朝", "カラ=ハン朝", "ガズナ朝"],
  ["ムワッヒド朝", "ルーム=セルジューク朝", "アイユーブ朝", "バグダード", "アッバース朝カリフ領", "ホラズム朝", "カラ=キタイ（西遼）", "ゴール朝"],
  ["ナスル朝", "マムルーク朝", "イル=ハン国", "チャガタイ=ハン国", "奴隷王朝"],
  ["コンスタンティノープル（ビザンツ帝国）", "オスマン朝", "アンカラの戦い（1402年）", "カイロ", "マムルーク朝", "メッカ", "サマルカンド", "ティムール朝", "ヘラート", "トゥグルク朝"],
];
const mapNumbers = "①②③④⑤⑥⑦⑧⑨⑩";
for (const [index, mapQuestion] of maps.entries()) {
  const names = expectedMaps[index];
  assert.equal(mapQuestion.answer, names.map((name, i) => mapNumbers[i] + " " + name).join("\n"));
  const svg = await readFile(new URL(`../public/data/${mapQuestion.questionMap.path}`, import.meta.url), "utf8");
  for (const name of names) {
    assert.ok(!svg.includes(name));
    assert.ok(!mapQuestion.questionMap.alt.includes(name));
    assert.ok(!mapQuestion.prompt.includes(name));
  }
  for (const number of mapNumbers.slice(0, names.length)) assert.ok(svg.includes(number));
  assert.ok(!/<image|<script|href=/i.test(svg));
  const answerSvg = await readFile(new URL(`../public/data/${mapQuestion.questionMap.answerPath}`, import.meta.url), "utf8");
  assert.equal(answerSvg, createAnswerMap(svg, mapQuestion.answer));
  const visibleAnswers = [...answerSvg.matchAll(/<tspan[^>]*>(.*?)<\/tspan>/g)].map((match) => match[1]).join("");
  for (const name of names) assert.ok(visibleAnswers.includes(name), name);
  assert.ok(!/<image|<script|href=/i.test(answerSvg));
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.ok(app.includes("renderQuestionMap(question, state.answerVisible)"));
  const renderMap = app.slice(app.indexOf("function renderQuestionMap("), app.indexOf("function renderQuestionImage("));
  const element = { hidden: true, src: "", alt: "", classList: { toggle(name, value) { element.hidden = value; } }, removeAttribute(name) { delete this[name]; } };
  const context = { elements: { questionMap: element }, getDataUrl: (path) => "https://example.r2.dev/" + path };
  runInNewContext(renderMap + ";this.renderMap = renderQuestionMap;", context);
  context.renderMap(mapQuestion);
  assert.equal(element.hidden, false);
  assert.equal(element.src, "https://example.r2.dev/" + mapQuestion.questionMap.path);
  context.renderMap(mapQuestion, true);
  assert.equal(element.src, "https://example.r2.dev/" + mapQuestion.questionMap.answerPath);
  assert.equal(element.alt, mapQuestion.questionMap.answerAlt);
  context.renderMap(mapQuestion, false);
  assert.equal(element.src, "https://example.r2.dev/" + mapQuestion.questionMap.path);
  assert.equal(element.alt, mapQuestion.questionMap.alt);
  context.renderMap({ questionMap: { path: mapQuestion.questionMap.path, alt: "旧形式" } }, true);
  assert.equal(element.src, "https://example.r2.dev/" + mapQuestion.questionMap.path);
  context.renderMap(terms[0].stages.beginner[0]);
  assert.equal(element.hidden, true);
  assert.equal(element.src, undefined);
  assert.equal(element.alt, "");
}
console.log("９世紀の５回答・10世紀の７回答・11世紀の５回答・12世紀の８回答・13世紀の５回答・14〜15世紀の10回答、答えの非表示、解答地図への切替、伏せた地図への復帰、通常問題への切替を確認しました。");

assert.throws(() => createAnswerMap("<svg></svg>", "① 答え"));
assert.throws(() => createAnswerMap("<svg></svg>", "番号なし"));
