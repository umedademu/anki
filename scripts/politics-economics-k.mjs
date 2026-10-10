import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

export const politicsKSubjectId = "politics-economics-k";
const root = path.resolve(import.meta.dirname, "..");
const stages = ["beginner", "reverse", "integrated"];
export const contentHash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
// 原文の装飾（色・下線・振り仮名・強調・引用記号）を除き、本文の文字だけで照合する。
const plain = text => String(text).normalize("NFKC").replace(/<rt>[\s\S]*?<\/rt>/g, "").replace(/<[^>]+>/g, "").replace(/\*\*|[>#\s]/g, "");
const withoutReadings = text => String(text).replace(/\([ぁ-ゖー]+\)/g, "");
const answerKeywords = answer => [...new Set([...answer.matchAll(/\*\*([^*]+)\*\*/g)].map(match => withoutReadings(match[1])))];
const twoDigits = number => String(number).padStart(2, "0");
const partCode = bank => `${twoDigits(bank.item.number)}-${twoDigits(bank.heading.number)}`;

// 原文全体は公開リポジトリへ入れず、小見出しごとの抜粋だけを保存する（日本史Kと同じ扱い）。
export const politicsKExcerptPath = bank => `sources/seikei/抜粋/${partCode(bank)}_${bank.heading.title}_原文抜粋.md`;

// 小見出しの範囲だけを頁ごとに取り出して抜粋を作る。範囲外の記述は出題の根拠にしない。
export function buildPoliticsKExcerpt(sourceText, bank) {
  const ranges = bank.source.ranges.map(({ start, end }) => `「${start}」${end === null ? "から末尾まで" : `から「${end}」の直前まで`}`);
  const lines = [`# ${bank.item.number}-${bank.heading.number}「${bank.heading.title}」原文抜粋`, "", `「${path.basename(bank.source.file)}」の${ranges.join("と、")}を抜き出した。`, ""];
  for (const { start, end } of bank.source.ranges) {
    const from = sourceText.indexOf(start);
    assert.ok(from >= 0, `原文に範囲の開始がありません: ${start}`);
    const to = end === null ? sourceText.length : sourceText.indexOf(end, from + start.length);
    assert.ok(to > from, `原文に範囲の終わりがありません: ${end}`);
    const before = [...sourceText.slice(0, from).matchAll(/^## (\d{3})\s*$/gm)].at(-1);
    assert.ok(before, `範囲の開始頁がありません: ${start}`);
    let page = before[1];
    for (const [index, block] of sourceText.slice(from, to).split(/^## (\d{3})\s*$/m).entries()) {
      if (index % 2) { page = block; continue; }
      if (block.trim()) lines.push(`## ${page}`, "", block.trim(), "");
    }
  }
  return lines.join("\n");
}

function excerptPages(excerpt) {
  const pages = new Map(), parts = excerpt.split(/^## (\d{3})\s*$/m);
  for (let index = 1; index < parts.length; index += 2) {
    const page = Number(parts[index]);
    pages.set(page, (pages.get(page) ?? "") + plain(parts[index + 1]));
  }
  return pages;
}

export function validatePoliticsKBank(bank, excerpt) {
  assert.equal(bank.schemaVersion, 1);
  assert.equal(bank.subjectId, politicsKSubjectId);
  assert.ok([1, 2, 3].includes(bank.lecture.number) && bank.lecture.title);
  assert.ok(Number.isInteger(bank.item.number) && bank.item.number >= 1 && bank.item.number <= 23 && bank.item.title);
  assert.ok(Number.isInteger(bank.heading.number) && bank.heading.number >= 1 && bank.heading.number <= 22 && bank.heading.title);
  const pages = excerptPages(excerpt);
  assert.deepEqual([...pages.keys()].sort((a, b) => a - b), [...bank.source.pages].sort((a, b) => a - b), "出題範囲の頁が原文の範囲と一致しません。");
  const facts = new Map();
  for (const fact of bank.facts) {
    assert.ok(!facts.has(fact.id), `根拠番号が重複しています: ${fact.id}`);
    assert.ok(fact.quote && pages.get(fact.page)?.includes(plain(fact.quote)), `原文${fact.page}頁の範囲に引用がありません: ${fact.id}`);
    facts.set(fact.id, fact);
  }
  const unitIds = new Set(), questionIds = new Set(), prompts = new Set(), usedFacts = new Set();
  for (const unit of bank.units) {
    assert.match(unit.id, /^\d{2}$/);
    assert.ok(!unitIds.has(unit.id), `学習項目の番号が重複しています: ${unit.id}`); unitIds.add(unit.id);
    assert.ok(unit.term && /^[ぁ-ゖー]+$/.test(unit.reading) && unit.category, `学習項目の必須項目が不足しています: ${unit.id}`);
    assert.ok(unit.questions.length >= 1 && unit.questions.length <= 4, `説明問題の数が適切ではありません: ${unit.id}`);
    for (const question of unit.questions) {
      const id = `${unit.id}-${question.id}`;
      // 政治経済Kは「逆向きの説明」だけで構成する。
      assert.equal(question.stage, "reverse", `逆向きの説明以外の問題です: ${id}`);
      assert.equal(question.type, "reverse", `逆向きの説明以外の種類です: ${id}`);
      assert.match(question.id, /^R\d{2}$/);
      assert.ok(!questionIds.has(id), `問題番号が重複しています: ${id}`); questionIds.add(id);
      assert.ok(!prompts.has(plain(question.prompt)), `問題文が重複しています: ${id}`); prompts.add(plain(question.prompt));
      assert.ok(question.prompt && question.answer && question.form, `問題の必須項目が不足しています: ${id}`);
      assert.ok(!/原文|本文|本書|この章|本章|前述|上記|前の問題/.test(question.prompt), `元資料や別の問題に依存しています: ${id}`);
      assert.ok(question.prompt.includes(unit.term), `問題文に対象の用語がありません: ${id}`);
      assert.ok(question.evidence?.length && question.evidence.every(evidence => facts.has(evidence)), `原文の根拠が不足しています: ${id}`);
      question.evidence.forEach(evidence => usedFacts.add(evidence));
      assert.deepEqual(question.keywords, answerKeywords(question.answer), `重要語と強調が一致しません: ${id}`);
      assert.ok(question.keywords.length, `説明回答に重要語の強調がありません: ${id}`);
      assert.ok((question.answer.match(/。/g) ?? []).length <= 4, `説明回答が長すぎます: ${id}`);
    }
  }
  const unused = [...facts.keys()].filter(key => !usedFacts.has(key));
  assert.deepEqual(unused, [], `どの問題にも使っていない根拠があります: ${unused.join("、")}`);
  return facts;
}

export function buildPoliticsEconomicsK(bank, excerpt) {
  const facts = validatePoliticsKBank(bank, excerpt);
  const code = partCode(bank), deckId = `pek-${code}`;
  const historyVersion = `${politicsKSubjectId}-${deckId}-v1`;
  const contentVersion = contentHash(bank).slice(0, 20);
  const itemTitle = `${bank.item.number} ${bank.item.title}`;
  const datasetLabel = `${bank.subjectTitle}｜${bank.item.number}-${bank.heading.number} ${bank.heading.title}`;
  const definition = {
    id: politicsKSubjectId, title: bank.subjectTitle, description: "原文の範囲で用語の意味・理由・違いを説明できるようにする共通テスト対策の政治・経済",
    learningType: "history", termUnitLabel: "用語", datasetLabel,
    filterLabels: { macroRegion: "", regionDetail: "", category: "分野" },
    stageLabels: { all: "逆向きの説明", reverse: "逆向きの説明" }, availableStages: ["reverse"],
    defaultDeckId: deckId,
    chapterGroups: [{ id: `item-${twoDigits(bank.item.number)}`, number: bank.item.number, title: itemTitle, label: `項目${bank.item.number}`, deckIds: [deckId] }],
  };
  const terms = bank.units.map((unit, index) => {
    const id = `PEK-${code}-U${unit.id}`;
    return {
      id, datasetLabel, importanceRank: 1, difficultyLabel: "共通テスト対策", category: unit.category,
      term: unit.term, reading: unit.reading, aliases: [], era: bank.heading.title,
      geography: { macroRegion: bank.lecture.title, macroRegions: [bank.lecture.title], regionDetail: itemTitle, splitMacroRegion: false },
      chronology: { displayPeriod: "", sortYear: index + 1 },
      stages: Object.fromEntries(stages.map(stage => [stage, unit.questions.filter(question => question.stage === stage).map(question => {
        const evidence = question.evidence.map(key => facts.get(key));
        const pages = [...new Set(evidence.map(fact => fact.page))].sort((a, b) => a - b);
        return {
          id: `${id}-${question.id}`, stage, focus: question.form, type: question.type, label: "逆向きの説明",
          prompt: question.prompt, answer: question.answer,
          explanation: [question.note, `原文の根拠：${evidence.map(fact => `${fact.page}頁「${fact.quote}」`).join("\n")}`].filter(Boolean).join("\n\n"),
          keywords: [...question.keywords], acceptedAnswers: [], answerNote: "", yearMnemonic: "", hideTermUntilAnswer: false,
          source: { name: `${itemTitle}／${bank.heading.title}（${pages.join("・")}頁）`, url: "", file: bank.source.file, pages, evidence: evidence.map(fact => fact.id) },
        };
      })])),
    };
  });
  const questionCount = terms.reduce((sum, term) => sum + term.stages.reverse.length, 0);
  const questionCounts = { beginner: 0, reverse: questionCount, integrated: 0 };
  const deck = {
    id: deckId, number: bank.item.number * 100 + bank.heading.number, datasetLabel, difficultyLabel: "共通テスト対策",
    version: historyVersion, contentVersion, sourceFile: `data/source/${politicsKSubjectId}/${code}.json`, terms,
  };
  const prefix = `subjects/${politicsKSubjectId}/imports/${deckId}/${contentVersion}`;
  const chunks = [], objects = [];
  for (let offset = 0; offset < terms.length; offset += 50) {
    const number = chunks.length + 1, chunkTerms = terms.slice(offset, offset + 50);
    const key = `${prefix}/chunks/${String(number).padStart(4, "0")}.json`;
    chunks.push({ number, path: key, count: chunkTerms.length, firstTerm: chunkTerms[0].term, lastTerm: chunkTerms.at(-1).term });
    objects.push({ key, value: { schemaVersion: 3, subjectId: politicsKSubjectId, deckId, chunkNumber: number, terms: chunkTerms } });
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

// 作成用原稿を読み込む。本番の既存問題は公開処理でCloudflareから別途取得する。
export async function loadPoliticsEconomicsK() {
  const directory = path.join(root, `data/source/${politicsKSubjectId}`);
  const names = (await readdir(directory)).filter(name => /^\d{2}-\d{2}\.json$/.test(name)).sort();
  return Promise.all(names.map(async name => {
    const bank = JSON.parse(await readFile(path.join(directory, name), "utf8"));
    assert.equal(name, `${partCode(bank)}.json`, "原稿名と小見出しの番号が一致しません。");
    const excerpt = await readFile(path.join(root, politicsKExcerptPath(bank)), "utf8");
    // 原文全体がある端末では、抜粋が原文の指定範囲と一字一句一致することも確かめる。
    const hasSource = await access(path.join(root, bank.source.file)).then(() => true, () => false);
    if (hasSource) assert.equal(excerpt, buildPoliticsKExcerpt(await readFile(path.join(root, bank.source.file), "utf8"), bank), `抜粋が原文と一致しません。npm run prepare:excerpts:politics-economics-kで作り直してください: ${name}`);
    return buildPoliticsEconomicsK(bank, excerpt);
  }));
}

// 初回は科目を新設し、以後は未登録の小見出しだけを追加する。登録済みのパートは上書きしない。
export function appendPoliticsKDecks(catalog, additions) {
  assert.equal(catalog.schemaVersion, 3);
  assert.ok(additions.length, "追加する問題原稿がありません。");
  const next = structuredClone(catalog);
  let subject = next.subjects.find(entry => entry.id === politicsKSubjectId);
  const before = subject ? contentHash(subject) : null;
  if (!subject) {
    subject = { ...structuredClone(additions[0].subject), decks: [], chapterGroups: [] };
    next.subjects.push(subject);
  }
  const seen = new Set();
  for (const addition of additions) {
    assert.equal(addition.subject.id, politicsKSubjectId);
    assert.equal(addition.subject.decks.length, 1);
    const entry = addition.subject.decks[0];
    assert.ok(!seen.has(entry.id), "追加する小見出しが重複しています。"); seen.add(entry.id);
    const registered = subject.decks.find(deck => deck.id === entry.id);
    if (registered) {
      assert.deepEqual(registered, entry, "登録済みパートの編集を上書きしません。");
      continue;
    }
    subject.decks.push(structuredClone(entry));
    const definition = addition.definition.chapterGroups[0];
    let group = subject.chapterGroups.find(item => item.id === definition.id);
    if (!group) { group = { ...definition, deckIds: [] }; subject.chapterGroups.push(group); }
    group.deckIds.push(entry.id);
  }
  subject.decks.sort((a, b) => a.number - b.number);
  subject.chapterGroups.sort((a, b) => a.number - b.number);
  for (const group of subject.chapterGroups) group.deckIds.sort((a, b) => subject.decks.find(deck => deck.id === a).number - subject.decks.find(deck => deck.id === b).number);
  subject.termCount = subject.decks.reduce((sum, deck) => sum + deck.termCount, 0);
  subject.questionCount = subject.decks.reduce((sum, deck) => sum + deck.questionCount, 0);
  if (before !== contentHash(subject)) next.version = contentHash(next.subjects).slice(0, 20);
  return next;
}
