import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parseCsv, toObjects, groupTerms } from "./build-learning-data.mjs";
import { questionTypes } from "../public/question-types.js";
import { groupSODecks } from "../public/so-chapters.js";

const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0,20);
const pad = n => String(n).padStart(2,"0");

export function parseSOContents(text) {
  const chapters = []; let chapter, lesson;
  for (const line of text.split(/\r?\n/)) {
    let match = line.match(/^## 第(\d+)章\s+(.+)$/);
    if (match) {
      chapter = { id: `chapter-${Number(match[1])}`, number: Number(match[1]), title: `第${Number(match[1])}章 ${match[2].replace(/\s*[（(]\d+[）)]\s*$/, "").trim()}`, lessons: [] };
      chapters.push(chapter); lesson = null; continue;
    }
    match = line.match(/^### 第(\d+)回\s+(.+?)\s+……\s+(\d+)/);
    if (match && chapter) {
      lesson = { number: Number(match[1]), title: match[2], page: Number(match[3]), parts: [] };
      chapter.lessons.push(lesson); continue;
    }
    match = line.match(/^\*\s+(\d+)\s+(.+?)\s+……\s+(\d+)/);
    if (match && lesson) lesson.parts.push({ number: Number(match[1]), title: match[2], page: Number(match[3]) });
  }
  assert.ok(chapters.length);
  const numbers = chapters.flatMap(chapter => chapter.lessons.map(lesson => lesson.number));
  assert.equal(new Set(numbers).size, numbers.length, "目次の回番号が重複しています。");
  return chapters;
}

export async function readSOBookFiles(directory) {
  const names = (await readdir(directory, { withFileTypes: true })).filter(entry => entry.isFile() && entry.name.endsWith(".csv")).map(entry => entry.name).sort();
  assert.ok(names.length, "登録するCSVがありません。");
  return Promise.all(names.map(async name => ({ name, text: await readFile(path.join(directory,name),"utf8") })));
}

function importQuestionRows(file, chapter, lessonNumber, partNumber, part, id) {
  const rows = parseCsv(file.text.replace(/^\uFEFF/, ""));
  const headers = ["問題番号", "問題スタイル", "種類", "問題文", "回答", "解説", "出典URL", "出典ファイル", "出典ページ", "出典行"];
  assert.deepEqual(rows[0], headers, `${file.name}の列名が不正です。`);
  assert.ok(rows.length > 1, "問題がありません。");
  const types = new Map(Object.entries(questionTypes).map(([key, label]) => [label, key]));
  const seen = new Set(), datasetLabel = `世界史SO｜第${lessonNumber}回 ${partNumber} ${part.title}`;
  const terms = rows.slice(1).map((cells, index) => {
    assert.equal(cells.length, headers.length, `${file.name}の列数が不正です。`);
    const [originalId, style, label, prompt, answer, explanation, url, name, page, line] = cells;
    const match = originalId.match(/^WHSO-(\d+)-(\d+)-(\d+)-(\d+)$/);
    assert.ok(match && Number(match[1]) === chapter.number && Number(match[2]) === lessonNumber && Number(match[3]) === partNumber, "問題番号の所属が目次と一致しません。");
    assert.ok(!seen.has(originalId), "問題番号が重複しています。"); seen.add(originalId);
    assert.equal(style, "一問一答", "問題スタイルが不正です。");
    assert.ok(types.has(label), `未知の問題種類です: ${label}`);
    assert.ok(prompt.trim() && answer.trim(), "問題文または回答が空欄です。");
    const questionId = `WHSO-C${pad(chapter.number)}-L${pad(lessonNumber)}-P${pad(partNumber)}-${originalId}`;
    const source = { name, url, page, line, chapterNumber: chapter.number, lessonNumber, partNumber,
      originalQuestionId: originalId, originalStyle: style, file: file.name };
    return { id: `${questionId}-T`, datasetLabel, importanceRank: index + 1, difficultyLabel: part.title,
      category: part.title, term: prompt, reading: "", aliases: [], era: "",
      geography: { macroRegion: "", macroRegions: [], regionDetail: "" },
      chronology: { displayPeriod: "", sortYear: index + 1 }, source,
      stages: { beginner: [{ id: questionId, stage: "beginner", focus: label, type: types.get(label), label: style,
        prompt, answer, explanation, keywords: [], acceptedAnswers: [], answerNote: "", yearMnemonic: "", source,
        hideTermUntilAnswer: true }], reverse: [], integrated: [] } };
  });
  return { id, number: lessonNumber * 100 + partNumber, datasetLabel, difficultyLabel: part.title,
    version: `world-history-so-${id}-v1`, contentVersion: hash(terms), sourceFile: file.name,
    chapter: { id: chapter.id, number: chapter.number, title: chapter.title }, lesson: lessonNumber, part: partNumber,
    sourceTermCount: null, terms };
}

export function importSOBookFiles(files, contentsText) {
  const contents = parseSOContents(contentsText), seen = new Set();
  return files.map(file => {
    const match = file.name.match(/^第(\d+)回_(\d+)_(.+?)(?:_(\d+)語)?\.csv$/);
    assert.ok(match, `回・パート番号を読み取れません: ${file.name}`);
    const lessonNumber = Number(match[1]), partNumber = Number(match[2]);
    const chapter = contents.find(c => c.lessons.some(l => l.number === lessonNumber));
    const lesson = chapter?.lessons.find(l => l.number === lessonNumber), part = lesson?.parts.find(p => p.number === partNumber);
    assert.ok(part, `目次にない回・パートです: ${file.name}`);
    assert.equal(match[3], part.title, `目次と見出しが一致しません: ${file.name}`);
    const id = `book-${pad(chapter.number)}-${pad(lessonNumber)}-${pad(partNumber)}`;
    assert.ok(!seen.has(id), "同じパートのファイルが重複しています。"); seen.add(id);
    if (!match[4]) return importQuestionRows(file, chapter, lessonNumber, partNumber, part, id);
    const rows = toObjects(parseCsv(file.text));
    const originalTerms = groupTerms(rows, { allowMissingSourceUrl: true });
    assert.equal(originalTerms.length, Number(match[4]), `${file.name}の用語数がファイル名と異なります。`);
    const datasetLabel = `世界史SO｜第${lessonNumber}回 ${partNumber} ${part.title}`;
    const originalById = new Map(originalTerms.map(t => [t.id,t]));
    const terms = rows.map((row,index) => {
      const label = row.dataset_label.match(/^世界史探究_第(\d+)章_第(\d+)回_(\d+)_/)
        ?? row.dataset_label.match(/^第(\d+)章\s+[^｜]+｜第(\d+)回\s+[^｜]+｜(\d+)\s+/)
        ?? row.dataset_label.match(/^第(\d+)章\s+[^｜]+｜第(\d+)回\s+(\d+)\s+/);
      assert.ok(label && Number(label[1]) === chapter.number && Number(label[2]) === lessonNumber && Number(label[3]) === partNumber, `CSVの所属が目次と一致しません: ${file.name}`);
      assert.match(row.question_id,/^[A-Za-z0-9_-]{1,55}$/);
      const original = originalById.get(row.term_id), question = original.stages[row.stage].find(q => q.id === row.question_id);
      const questionId = `WHSO-C${pad(chapter.number)}-L${pad(lessonNumber)}-P${pad(partNumber)}-${row.question_id}`;
      const source = { ...question.source, chapterNumber: chapter.number, lessonNumber, partNumber,
        originalTermId: row.term_id, originalQuestionId: row.question_id, originalStage: row.stage, file: file.name };
      // 一行一問に揃え、逆向き・統合説明も習熟度による待ち時間なしで選べるようにする。
      return { ...structuredClone(original), id: `${questionId}-T`, datasetLabel, importanceRank: index + 1,
        sourceImportanceRank: original.importanceRank, source,
        stages: { beginner: [{ ...structuredClone(question), id: questionId, stage: "beginner", source,
          hideTermUntilAnswer: true }], reverse: [], integrated: [] } };
    });
    assert.equal(terms.length, rows.length);
    return { id, number: lessonNumber * 100 + partNumber, datasetLabel, difficultyLabel: part.title,
      version: `world-history-so-${id}-v1`, contentVersion: hash(terms), sourceFile: file.name,
      chapter: { id: chapter.id, number: chapter.number, title: chapter.title }, lesson: lessonNumber, part: partNumber,
      sourceTermCount: originalTerms.length, terms };
  }).sort((a,b) => a.chapter.number - b.chapter.number || a.lesson - b.lesson || a.part - b.part);
}

export function appendSOBookDecks(catalog, currentDecks, imported) {
  const next = structuredClone(catalog), subject = next.subjects.find(s => s.id === "world-history-so");
  assert.ok(subject && currentDecks.length);
  assert.deepEqual(currentDecks.map(d => d.entry.id).sort(), subject.decks.map(d => d.id).sort());
  const template = currentDecks[0].index, staged = [], additions = [];
  const existingQuestions = new Set(currentDecks.flatMap(d => d.chunks.flatMap(c => c.terms.flatMap(t => Object.values(t.stages).flat().map(q => q.id)))));
  const groups = groupSODecks(subject.decks, subject.chapterGroups).map(({ decks, ...group }) => group);
  for (const deck of imported) {
    const existing = currentDecks.find(d => d.entry.id === deck.id);
    if (existing) {
      assert.deepEqual(existing.chunks.flatMap(c => c.terms), deck.terms, `${deck.datasetLabel}は登録済みで内容が異なります。既存の編集を保持するため追加を中止しました。`);
      assert.equal(existing.index.version, deck.version);
      continue;
    }
    for (const term of deck.terms) for (const q of term.stages.beginner) {
      assert.ok(!existingQuestions.has(q.id), `既存問題と番号が重複しています: ${q.id}`); existingQuestions.add(q.id);
    }
    const prefix = `subjects/world-history-so/imports/${deck.id}/${deck.contentVersion}`;
    const chunks = [];
    for (let offset=0; offset<deck.terms.length; offset+=100) {
      const number = chunks.length + 1, terms = deck.terms.slice(offset,offset+100), key = `${prefix}/chunks/${pad(number)}.json`;
      chunks.push({ number, path: key, count: terms.length, firstTerm: terms[0].term, lastTerm: terms.at(-1).term });
      staged.push({ path: key, value: { schemaVersion:3, subjectId:subject.id, deckId:deck.id, chunkNumber:number, terms } });
    }
    const entry = { id:deck.id, number:deck.number, datasetLabel:deck.datasetLabel, difficultyLabel:deck.difficultyLabel,
      version:deck.version, contentVersion:deck.contentVersion, termCount:deck.terms.length, questionCount:deck.terms.length,
      indexPath:`${prefix}/index.json`, bookChapter:deck.chapter.number, lesson:deck.lesson, part:deck.part };
    staged.push({ path:entry.indexPath, value: { ...structuredClone(template), deckId:entry.id, deckNumber:entry.number,
      datasetLabel:entry.datasetLabel, difficultyLabel:entry.difficultyLabel, version:entry.version, contentVersion:entry.contentVersion,
      sourceFile:deck.sourceFile, termCount:entry.termCount, questionCount:entry.questionCount,
      questionCounts:{ beginner:entry.questionCount, reverse:0, integrated:0 }, chunks } });
    subject.decks.push(entry); additions.push(entry);
    let group = groups.find(g => g.id === deck.chapter.id);
    if (!group) { group = { ...deck.chapter, deckIds: [] }; groups.push(group); }
    group.deckIds.push(deck.id);
  }
  if (!additions.length) return { next: structuredClone(catalog), staged: [], additions: [] };
  groups.sort((a,b) => a.number-b.number);
  const byId = new Map(subject.decks.map(d => [d.id,d]));
  for(const group of groups) group.deckIds.sort((a,b) => {
    const left=byId.get(a),right=byId.get(b); return (left.lesson ?? 0)-(right.lesson ?? 0) || (left.part ?? left.number)-(right.part ?? right.number);
  });
  subject.chapterGroups = groups;
  subject.decks = groups.flatMap(group => group.deckIds.map(id => byId.get(id)));
  assert.equal(new Set(subject.decks.map(d=>d.id)).size, byId.size);
  subject.questionCount = subject.decks.reduce((n,d)=>n+d.questionCount,0);
  subject.termCount = subject.decks.reduce((n,d)=>n+d.termCount,0);
  subject.datasetLabel = `世界史SO｜${groups.length}デッキ・${subject.decks.length}パート`;
  next.version = hash(next.subjects);
  assert.deepEqual(next.subjects.filter(s=>s.id!==subject.id),catalog.subjects.filter(s=>s.id!==subject.id));
  for(const old of catalog.subjects.find(s=>s.id===subject.id).decks) assert.deepEqual(subject.decks.find(d=>d.id===old.id),old);
  return { next, staged, additions };
}
