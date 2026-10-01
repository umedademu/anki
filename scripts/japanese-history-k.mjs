import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const japaneseKSubjectId = "japanese-history-k";
export const japaneseKDeckId = "book-06-01-01";
export const japaneseKHistoryVersion = "japanese-history-k-book-06-01-01-v3";
export const japaneseKPreviousSubjectHash = "e7a84a8684f77ba5b157c9351c6cb641266ab9a4b00985506c072cc94fa518a2";
const stages = ["beginner", "reverse", "integrated"];
const root = path.resolve(import.meta.dirname, "..");
const types = new Set(["identify", "time", "place", "person", "actor", "cause", "content", "result", "relation", "reverse", "integrated"]);
const labels = { identify: "用語", time: "時期", place: "場所", person: "人物", actor: "主体", cause: "原因", content: "内容", result: "結果", relation: "関連", reverse: "逆向きの説明", integrated: "統合説明" };
export const contentHash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const normalize = text => String(text).normalize("NFKC").replace(/\*\*|\s/g, "");
const withoutReadings = text => String(text).replace(/\([ぁ-ゖー]+\)/g, "");
const answerKeywords = answer => [...new Set([...answer.matchAll(/\*\*([^*]+)\*\*/g)].map(match => withoutReadings(match[1])))];
const displayQuote = quote => quote.replace(/<br\s*\/?>/gi, "、").replace(/^\|\s*|\s*\|$/g, "").replace(/\s*\|\s*/g, "／");

// 引用の掲載ページと出題根拠を原文抜粋で検査する。外部の知識は補わない。
export function validateJapaneseKBank(bank, excerpt) {
  assert.equal(bank.schemaVersion, 2);
  assert.equal(bank.subjectId, japaneseKSubjectId);
  assert.equal(bank.chapter.number, 6);
  assert.equal(bank.section.number, 1);
  assert.equal(bank.part.number, 1);
  const pages = new Map([...excerpt.matchAll(/^## (\d+)\s*\n([\s\S]*?)(?=^## \d+\s*$|$(?![\s\S]))/gm)].map(match => [Number(match[1]), normalize(match[2])]));
  const facts = new Map();
  for (const fact of bank.facts) {
    assert.ok(!facts.has(fact.id), `根拠番号が重複しています: ${fact.id}`);
    assert.ok(bank.source.pages.includes(fact.page), `出題範囲外のページです: ${fact.page}`);
    assert.ok(fact.quote && pages.get(fact.page)?.includes(normalize(fact.quote)), `原文${fact.page}頁に引用がありません: ${fact.id}`);
    facts.set(fact.id, fact);
  }
  const unitIds = new Set(), questionIds = new Set(), prompts = new Set();
  for (const unit of bank.units) {
    assert.match(unit.id, /^\d{2}$/);
    assert.ok(!unitIds.has(unit.id)); unitIds.add(unit.id);
    assert.ok(unit.term && unit.reading && unit.category && unit.explanation && unit.questions.length);
    assert.ok(unit.chronology?.displayPeriod && Number.isInteger(unit.chronology.sortYear), `時期が不足しています: ${unit.id}`);
    const beginner = unit.questions.filter(question => question.stage === "beginner");
    const reverse = unit.questions.filter(question => question.stage === "reverse");
    const integrated = unit.questions.filter(question => question.stage === "integrated");
    assert.ok(beginner.length >= 3 && beginner.length <= 7, `基礎問題の数が適切ではありません: ${unit.id}`);
    assert.ok(reverse.length >= 1 && reverse.length <= 4, `説明問題の数が適切ではありません: ${unit.id}`);
    assert.equal(integrated.length, 1, `統合説明が不足しています: ${unit.id}`);
    const learnedFacts = new Set([...beginner, ...reverse].flatMap(question => question.evidence ?? []));
    const learnedAnswers = [...beginner, ...reverse].map(question => normalize(withoutReadings(question.answer))).join("\n");
    for (const question of unit.questions) {
      assert.ok(stages.includes(question.stage));
      assert.match(question.id, new RegExp(`^${{ beginner: "B", reverse: "R", integrated: "I" }[question.stage]}\\d{2}$`));
      const id = `${unit.id}-${question.id}`;
      assert.ok(!questionIds.has(id), `問題番号が重複しています: ${id}`); questionIds.add(id);
      assert.ok(!prompts.has(normalize(question.prompt)), `問題文が重複しています: ${id}`); prompts.add(normalize(question.prompt));
      assert.ok(types.has(question.type) && question.prompt && question.answer && question.form, `問題の必須項目が不足しています: ${id}`);
      assert.ok(!/原文|本文|本書|この章|本章|前述|上記|前の問題/.test(question.prompt), `元資料や別の問題に依存しています: ${id}`);
      assert.equal(["reverse", "integrated"].includes(question.type) ? question.type : "beginner", question.stage, `種類と段階が一致しません: ${id}`);
      assert.ok(question.evidence?.length && question.evidence.every(evidence => facts.has(evidence)), `原文の根拠が不足しています: ${id}`);
      assert.deepEqual(question.keywords, answerKeywords(question.answer), `重要語と強調が一致しません: ${id}`);
      if (question.stage === "beginner" && question.type !== "identify") assert.ok(question.prompt.includes(unit.term), `問題文に対象の項目名がありません: ${id}`);
      if (question.stage !== "beginner") assert.ok(question.keywords.length, `説明回答に重要語の強調がありません: ${id}`);
      if (question.stage === "integrated") {
        assert.equal(question.prompt, `日本の占領期の「${unit.term}」について説明せよ。`, `統合の答え方を誘導しています: ${id}`);
        assert.match(question.answer, /\d{3,4}(?:[〜～~－-]\d{3,4})?年|\d{1,2}世紀/, `統合回答に時期がありません: ${id}`);
        assert.ok(question.answer.includes("日本"), `統合回答に場所がありません: ${id}`);
        assert.ok(question.evidence.every(key => learnedFacts.has(key)), `統合だけに新しい根拠があります: ${id}`);
        assert.ok(question.keywords.every(keyword => learnedAnswers.includes(normalize(keyword))), `統合だけに新しい重要語があります: ${id}`);
        const periods = question.answer.match(/\d{3,4}(?:[〜～~－-]\d{3,4})?年|\d{1,2}世紀/g) ?? [];
        assert.ok(periods.every(period => learnedAnswers.includes(normalize(period))), `統合だけに新しい時期があります: ${id}`);
        assert.ok((question.answer.match(/。/g) ?? []).length <= 3, `統合回答が長すぎます: ${id}`);
      }
    }
  }
  assert.ok(bank.units.length && questionIds.size);
  return facts;
}

export function buildJapaneseHistoryK(bank, excerpt) {
  const facts = validateJapaneseKBank(bank, excerpt);
  const contentVersion = contentHash(bank).slice(0, 20);
  const datasetLabel = `${bank.subjectTitle}｜1 イ ${bank.part.title}`;
  const definition = {
    id: japaneseKSubjectId, title: bank.subjectTitle, description: "原文の範囲で基礎知識から改革の内容・関係の説明へ進む日本史",
    learningType: "history", termUnitLabel: "項目", datasetLabel,
    filterLabels: { macroRegion: "章", regionDetail: "節", category: "分野" },
    stageLabels: { all: "習熟度に応じて自動", beginner: "基礎の一問一答", reverse: "逆向きの説明", integrated: "統合説明" }, availableStages: stages,
    defaultDeckId: japaneseKDeckId,
    chapterGroups: [{ id: "chapter-6", number: 6, title: bank.chapter.title, deckIds: [japaneseKDeckId] }],
  };
  const terms = bank.units.map(unit => {
    const id = `JHK3-06-01-01-U${unit.id}`;
    return {
      id, datasetLabel, importanceRank: 1, difficultyLabel: "共通テスト対策", category: unit.category,
      term: unit.term, reading: unit.reading, aliases: [], era: bank.section.title,
      geography: { macroRegion: bank.chapter.title, macroRegions: [bank.chapter.title], regionDetail: bank.section.title, splitMacroRegion: false },
      chronology: { ...unit.chronology },
      stages: Object.fromEntries(stages.map(stage => [stage, unit.questions.filter(question => question.stage === stage).map(question => {
        const evidence = question.evidence.map(key => facts.get(key));
        const pages = [...new Set(evidence.map(fact => fact.page))].sort((a, b) => a - b);
        return {
          id: `${id}-${question.id}`, stage, focus: question.form, type: question.type, label: labels[question.type],
          prompt: question.prompt, answer: question.answer,
          explanation: [question.note || (stage === "integrated" ? unit.explanation : ""), `原文の根拠：${evidence.map(fact => `${fact.page}頁「${displayQuote(fact.quote)}」`).join("\n")}`].filter(Boolean).join("\n\n"),
          keywords: [...question.keywords], acceptedAnswers: [...(question.acceptedAnswers ?? [])], answerNote: "", yearMnemonic: "", hideTermUntilAnswer: stage === "beginner",
          source: { name: `第6章 現代／${bank.part.title}（${pages.join("・")}頁）`, url: "", file: bank.source.originalFile, pages, evidence },
        };
      })])),
    };
  });
  const questionCounts = Object.fromEntries(stages.map(stage => [stage, terms.reduce((sum, term) => sum + term.stages[stage].length, 0)]));
  const questionCount = Object.values(questionCounts).reduce((sum, count) => sum + count, 0);
  const deck = {
    id: japaneseKDeckId, number: 1, datasetLabel, difficultyLabel: "共通テスト対策",
    version: japaneseKHistoryVersion, contentVersion, sourceFile: "data/source/japanese-history-k/06-01-01.json", terms,
  };
  const prefix = `subjects/${japaneseKSubjectId}/imports/${japaneseKDeckId}/${contentVersion}`;
  const chunks = [], objects = [];
  for (let offset = 0; offset < terms.length; offset += 50) {
    const number = chunks.length + 1, chunkTerms = terms.slice(offset, offset + 50);
    const key = `${prefix}/chunks/${String(number).padStart(4, "0")}.json`;
    chunks.push({ number, path: key, count: chunkTerms.length, firstTerm: chunkTerms[0].term, lastTerm: chunkTerms.at(-1).term });
    objects.push({ key, value: { schemaVersion: 3, subjectId: japaneseKSubjectId, deckId: japaneseKDeckId, chunkNumber: number, terms: chunkTerms } });
  }
  const indexPath = `${prefix}/index.json`;
  const index = {
    ...definition, schemaVersion: 3, deckId: deck.id, deckNumber: deck.number,
    difficultyLabel: deck.difficultyLabel, version: deck.version, contentVersion,
    sourceFile: deck.sourceFile, termCount: terms.length, questionCount,
    questionCounts, masteryTarget: 2, chunks,
  };
  objects.push({ key: indexPath, value: index });
  const entry = {
    id: deck.id, number: deck.number, datasetLabel, difficultyLabel: deck.difficultyLabel, version: deck.version,
    contentVersion, termCount: terms.length, questionCount, indexPath,
  };
  const { filterLabels, stageLabels, availableStages, ...catalogDefinition } = definition;
  const subject = { ...catalogDefinition, termCount: terms.length, questionCount, indexPath, decks: [entry] };
  return { definition, decks: [deck], terms, subject, index, objects, unitCount: bank.units.length };
}

export async function loadJapaneseHistoryK() {
  const bank = JSON.parse(await readFile(path.join(root, "data/source/japanese-history-k/06-01-01.json"), "utf8"));
  return buildJapaneseHistoryK(bank, await readFile(path.join(root, bank.source.file), "utf8"));
}

export function appendJapaneseKSubject(catalog, subject) {
  assert.equal(catalog.schemaVersion, 3);
  assert.ok(Array.isArray(catalog.subjects));
  assert.ok(!catalog.subjects.some(entry => entry.id === japaneseKSubjectId), "日本史Kは登録済みです。既存データを上書きしません。");
  const next = structuredClone(catalog);
  next.subjects.push(subject);
  next.version = contentHash(next.subjects).slice(0, 20);
  return next;
}

export function replaceJapaneseKSubject(catalog, subject, expectedPreviousHash = japaneseKPreviousSubjectHash) {
  assert.equal(catalog.schemaVersion, 3);
  const existing = catalog.subjects.filter(entry => entry.id === japaneseKSubjectId);
  assert.equal(existing.length, 1, "置換対象は日本史Kの1科目だけです。");
  assert.equal(contentHash(existing[0]), expectedPreviousHash, "日本史Kは確認後に編集されています。既存の編集を上書きしません。");
  const next = structuredClone(catalog);
  next.subjects = next.subjects.map(entry => entry.id === japaneseKSubjectId ? subject : entry);
  next.version = contentHash(next.subjects).slice(0, 20);
  return next;
}
