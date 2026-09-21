import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parseCsv, toObjects, groupTerms } from "./build-learning-data.mjs";
import { questionTypes } from "../public/question-types.js";
import { groupSODecks } from "../public/so-chapters.js";

const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0,20);
const pad = n => String(n).padStart(2,"0");
const replacedChapters = new Set([2, 3, 4, 5, 7]);

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
  const englishHeaders = rows[0]?.[0] === "question_id";
  const headers = englishHeaders
    ? ["question_id", "question", "answer", "explanation", "type", "style", "source_url", "source_file", "source_page", "source_line"]
    : ["問題番号", "問題スタイル", "種類", "問題文", "回答", "解説", "出典URL", "出典ファイル", "出典ページ", "出典行"];
  assert.deepEqual(rows[0], headers, `${file.name}の列名が不正です。`);
  assert.ok(rows.length > 1, "問題がありません。");
  const types = new Map(Object.entries(questionTypes).map(([key, label]) => [label, key]));
  const seen = new Set(), datasetLabel = `世界史SO｜第${lessonNumber}回 ${partNumber} ${part.title}`;
  const terms = rows.slice(1).map((cells, index) => {
    assert.equal(cells.length, headers.length, `${file.name}の列数が不正です。`);
    const [originalId, style, label, prompt, answer, explanation, url, name, page, line] = englishHeaders
      ? [cells[0], cells[5], cells[4], cells[1], cells[2], cells[3], ...cells.slice(6)] : cells;
    const rawMatch = englishHeaders ? originalId.match(/^WH-(\d+)-(\d+)-(\d+)$/) : null;
    const match = englishHeaders
      ? rawMatch && [rawMatch[0], String(chapter.number), ...rawMatch.slice(1)]
      : originalId.match(/^WHSO-(\d+)-(\d+)-(\d+)-(\d+)$/);
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
    const originalTerms = groupTerms(rows, { allowMissingSourceUrl: true, allowMissingKeywords: replacedChapters.has(chapter.number) });
    assert.equal(originalTerms.length, Number(match[4]), `${file.name}の用語数がファイル名と異なります。`);
    const datasetLabel = `世界史SO｜第${lessonNumber}回 ${partNumber} ${part.title}`;
    const originalById = new Map(originalTerms.map(t => [t.id,t]));
    const terms = rows.map((row,index) => {
      const lessonLabel = row.dataset_label.match(/^(?:世界史探究_)?第(\d+)回_(\d+)_/);
      const label = row.dataset_label.match(/^(?:世界史探究_)?第(\d+)章_第(\d+)回_(\d+)_/)
        ?? row.dataset_label.match(/^世界史探究 第(\d+)章 第(\d+)回-(\d+) /)
        ?? row.dataset_label.match(/^第(\d+)章\s+[^｜]+｜第(\d+)回\s+[^｜]+｜(\d+)\s+/)
        ?? row.dataset_label.match(/^第(\d+)章\s+[^｜]+｜第(\d+)回\s+(\d+)\s+/)
        ?? (lessonLabel && [lessonLabel[0], String(chapter.number), ...lessonLabel.slice(1)]);
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
    // 2026年9月21日の全面差し替え対象は、旧番号の履歴を混ぜずに学習する。
    const revision = replacedChapters.has(chapter.number) ? 2 : 1;
    const version = `world-history-so-${id}-v${revision}`;
    return { id, number: lessonNumber * 100 + partNumber, datasetLabel, difficultyLabel: part.title,
      version, contentVersion: revision === 1 ? hash(terms) : hash({version, terms}), sourceFile: file.name,
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

export function replaceSOBookChapter(catalog, currentDecks, imported, chapterNumber) {
  assert.ok(Number.isInteger(chapterNumber) && imported.length);
  assert.ok(imported.every(d => d.chapter.number === chapterNumber), "置換対象以外の章が含まれています。");
  const original = catalog.subjects.find(s => s.id === "world-history-so");
  assert.deepEqual(currentDecks.map(d => d.entry.id).sort(), original.decks.map(d => d.id).sort(), "現行全パートの取得が必要です。");
  const group = original.chapterGroups.find(g => g.number === chapterNumber);
  assert.ok(group, "置換する章がありません。");
  assert.deepEqual(imported.map(d => d.id).sort(), [...group.deckIds].sort(), "章の全パートが必要です。");
  const removed = new Set(group.deckIds);
  const targets = currentDecks.filter(d => removed.has(d.entry.id));
  if (targets.every(d => {
    const replacement = imported.find(i => i.id === d.entry.id);
    return d.entry.version === replacement.version && JSON.stringify(d.chunks.flatMap(c => c.terms)) === JSON.stringify(replacement.terms);
  })) return { next: structuredClone(catalog), staged: [], additions: [] };
  assert.ok(targets.every(d => d.entry.version !== imported.find(i => i.id === d.entry.id).version), "同じ履歴版の編集済み問題は置換できません。");
  assert.ok(!removed.has(original.defaultDeckId), "初期選択の章はこの処理で置換できません。");
  const base = structuredClone(catalog), subject = base.subjects.find(s => s.id === original.id);
  subject.decks = subject.decks.filter(d => !removed.has(d.id));
  subject.chapterGroups = subject.chapterGroups.filter(g => g.number !== chapterNumber);
  const result = appendSOBookDecks(base, currentDecks.filter(d => !removed.has(d.entry.id)), imported);
  assert.deepEqual(result.next.subjects.filter(s => s.id !== original.id), catalog.subjects.filter(s => s.id !== original.id));
  return result;
}

export function replaceSOBookChapters(catalog, currentDecks, imported, chapterNumbers) {
  assert.ok(Array.isArray(chapterNumbers) && chapterNumbers.length);
  assert.equal(new Set(chapterNumbers).size, chapterNumbers.length, "置換する章番号が重複しています。");
  assert.ok(imported.every(d => chapterNumbers.includes(d.chapter.number)), "置換対象以外の章が含まれています。");
  let next = catalog, current = currentDecks;
  const staged = [], additions = [];
  for (const chapterNumber of chapterNumbers) {
    const result = replaceSOBookChapter(next, current, imported.filter(d => d.chapter.number === chapterNumber), chapterNumber);
    next = result.next; staged.push(...result.staged); additions.push(...result.additions);
    if (!result.additions.length) continue;
    const replaced = new Set(result.additions.map(d => d.id));
    const values = new Map(result.staged.map(o => [o.path, o.value]));
    current = current.filter(d => !replaced.has(d.entry.id)).concat(result.additions.map(entry => {
      const index = values.get(entry.indexPath);
      return {entry, index, chunks:index.chunks.map(c => values.get(c.path))};
    }));
  }
  return {next, staged, additions};
}
