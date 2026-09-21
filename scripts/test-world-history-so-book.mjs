import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseCsv,toObjects,loadWorldHistorySODecks } from "./build-learning-data.mjs";
import { parseSOContents,importSOBookFiles,readSOBookFiles,appendSOBookDecks,replaceSOBookChapter,replaceSOBookChapters } from "./world-history-so-book.mjs";
import { questionTypes } from "../public/question-types.js";
import { groupSODecks,soStudyLabel } from "../public/so-chapters.js";
import { createSessionDatasetVersion } from "../public/deck-selection.js";
import storage, { validChapterReplacement } from "./so-book-storage-worker.js";

const contents=await readFile(new URL("../data/source/world-history-so/sekai_shi_tankyu_mokuji.md",import.meta.url),"utf8");
const files=await readSOBookFiles(fileURLToPath(new URL("../data/source/world-history-so/book/",import.meta.url)));
const imported=importSOBookFiles(files,contents);
assert.equal(parseSOContents(contents).find(c=>c.number===1).lessons.flatMap(l=>l.parts).length,12);
assert.deepEqual(imported.filter(d=>d.chapter.number===1).map(d=>d.terms.length),[23,97,96,30,93,53,69,96,30,123,251,41]);
assert.deepEqual(imported.filter(d=>d.chapter.number===2).map(d=>d.terms.length),[71,70,31,77,92,38,80,96,64,39,44,46,23,129,77,81,46,89,82,94]);
assert.equal(imported.filter(d=>d.chapter.number===2).reduce((n,d)=>n+d.sourceTermCount,0),213);
assert.deepEqual(imported.filter(d=>d.chapter.number===3).map(d=>d.terms.length),[60,77,78,123,126,162,118,119,43,127,62,90,78,97,56,119]);
assert.equal(imported.filter(d=>d.chapter.number===3).reduce((n,d)=>n+d.sourceTermCount,0),230);
assert.deepEqual(imported.filter(d=>d.chapter.number===4).map(d=>d.terms.length),[111,185,105,124,127,143,78,61,57,230,175,179,157,170,103,163,135,87]);
assert.equal(imported.filter(d=>d.chapter.number===4).reduce((n,d)=>n+d.sourceTermCount,0),343);
assert.equal(imported.reduce((n,d)=>n+d.sourceTermCount,0),1911);
assert.deepEqual(imported.filter(d=>d.chapter.number===5).map(d=>d.terms.length),[94,177,50,112,222,177,94,103,60,121,157,75,480,99,59,137,63,172]);
assert.equal(imported.filter(d=>d.chapter.number===5).reduce((n,d)=>n+d.sourceTermCount,0),375);
assert.equal(imported.filter(d=>d.chapter.number===7).reduce((n,d)=>n+d.sourceTermCount,0),620);
assert.deepEqual(imported.filter(d=>d.chapter.number===7).map(d=>d.terms.length),[124,111,228,74,182,88,158,59,125,41,58,97,170,157,63,180,78,99,96,205,61,122,107,276,129,123,84,135,180,89,127,156,149,115,155]);
const questions=imported.flatMap(d=>d.terms.map(t=>t.stages.beginner[0]));
assert.equal(questions.length,13149);
assert.equal(new Set(questions.map(q=>q.id)).size,13149);
const combinedSource = await loadWorldHistorySODecks({ includeBook:true });
assert.equal(combinedSource.terms.length,13506);
assert.equal(combinedSource.decks.length,128);
assert.deepEqual(combinedSource.definition.chapterGroups.map(group=>group.number),[1,2,3,4,5,6,7]);
assert.equal(combinedSource.definition.defaultDeckId,"deck-1");
const typeCounts={};
for(const deck of imported) {
  const sourceFile=files.find(f=>f.name===deck.sourceFile);
  if (deck.sourceTermCount === null) {
    const parsed=parseCsv(sourceFile.text.replace(/^\uFEFF/, ""));
    const rows=parsed.slice(1).map(cells=>parsed[0][0]==="question_id" ? [cells[0],cells[5],cells[4],cells[1],cells[2],cells[3],...cells.slice(6)] : cells);
    assert.equal(rows.length,deck.terms.length);
    for (const [index,term] of deck.terms.entries()) {
      const q=term.stages.beginner[0];
      assert.deepEqual([q.source.originalQuestionId,q.source.originalStyle,questionTypes[q.type],q.prompt,q.answer,q.explanation,q.source.url,q.source.name,q.source.page,q.source.line],rows[index]);
      assert.equal(q.stage,"beginner");assert.equal(q.hideTermUntilAnswer,true);
      assert.deepEqual(term.stages.reverse,[]);assert.deepEqual(term.stages.integrated,[]);
      typeCounts[q.type]=(typeCounts[q.type]??0)+1;
    }
    continue;
  }
  const rows=toObjects(parseCsv(sourceFile.text));
  for(const [index,term] of deck.terms.entries()) {
    const q=term.stages.beginner[0],row=rows[index];
    assert.equal(q.prompt,row.question);assert.equal(q.answer,row.answer);assert.equal(q.type,row.question_type);
    assert.equal(q.source.originalQuestionId,row.question_id);assert.equal(q.source.originalStage,row.stage);
    assert.equal(q.source.originalTermId,row.term_id);assert.equal(term.term,row.term);assert.equal(term.reading,row.reading);
    assert.equal(q.answerNote,row.answer_note);assert.equal(q.yearMnemonic,row.year_mnemonic);
    assert.equal(q.stage,"beginner");assert.equal(q.hideTermUntilAnswer,true);
    typeCounts[q.type]=(typeCounts[q.type]??0)+1;
  }
}
assert.throws(()=>importSOBookFiles([...files,files[0]],contents),/重複/);
assert.throws(()=>importSOBookFiles([{...files[0],name:files[0].name.replace("古代オリエント世界の特徴","誤った見出し")}],contents),/見出し/);
const chapter3File=files.find(file=>file.name.startsWith("第08回_01_"));
assert.throws(()=>importSOBookFiles([{...chapter3File,text:chapter3File.text.replaceAll("第3章_", "第2章_")}],contents),/所属/);
const chapter4File=files.find(file=>file.name.startsWith("第11回_01_"));
assert.throws(()=>importSOBookFiles([{...chapter4File,text:chapter4File.text.replaceAll("第4章 第", "第3章 第")}],contents),/所属/);
for(const [lesson,wrongLesson] of [[16,17],[22,23]]) {
  const file=files.find(f=>f.name.startsWith('第'+lesson+'回_01_'));
  const reject=(text,pattern)=>assert.throws(()=>importSOBookFiles([{...file,text}],contents),pattern);
  reject(file.text.replaceAll('第'+lesson+'回_', '第'+wrongLesson+'回_'),/所属/);
  reject(file.text.replace(',identify,', ',unknown,'),/question_type/);
  reject(file.text.replace('question_id,', 'unknown,'),/列/);
  const rows=toObjects(parseCsv(file.text));
  reject(file.text.replace(rows[1].question_id,rows[0].question_id),/重複/);
}
// 以前の10列形式も引き続き読み込める。
const legacyRows=[
  {name:'第16回_01_五代十国と社会の変動.csv',text:'問題番号,問題スタイル,種類,問題文,回答,解説,出典URL,出典ファイル,出典ページ,出典行\nWHSO-05-16-01-001,一問一答,用語の特定,旧形式の問い,旧形式の答え,解説,,出典,1,1'},
  {name:'第22回_01_イタリア＝ルネサンス.csv',text:'question_id,question,answer,explanation,type,style,source_url,source_file,source_page,source_line\nWH-22-01-001,旧形式の問い,旧形式の答え,解説,用語の特定,一問一答,,出典,1,1'}
];
assert.ok(importSOBookFiles(legacyRows,contents).every(d=>d.terms[0].stages.beginner[0].explanation==='解説'));
// 次章の資料が同じ元の問題番号を使っても、別の学習履歴を割り当てる。
const extra={name:"第04回_01_エーゲ文明_3語.csv",text:files[0].text.replaceAll("世界史探究_第1章_第01回_01_古代オリエント世界の特徴","世界史探究_第2章_第04回_01_エーゲ文明")};
const future=importSOBookFiles([files[0],extra],contents);
assert.notEqual(future[0].terms[0].id,future[1].terms[0].id);
const old={id:"deck-1",number:1,version:"old-history-v1",indexPath:"subjects/world-history-so/old.json",termCount:1,questionCount:1};
const oldTerm={id:"old",stages:{beginner:[{id:"old-q",prompt:"編集済みの問題",answer:"編集済みの回答",questionMap:{path:"old-map.svg"}}],reverse:[],integrated:[]}};
const current=[{entry:old,index:{id:"world-history-so",learningType:"cards",simpleQuestions:true,version:old.version,masteryTarget:2},chunks:[{terms:[oldTerm]}]}];
const catalog={schemaVersion:3,subjects:[{id:"other",untouched:true},{id:"world-history-so",defaultDeckId:old.id,indexPath:old.indexPath,decks:[old],termCount:1,questionCount:1,deckSelectionAliases:{"deck-4":["deck-1"]}}]};
const before=JSON.stringify({catalog,current});
const result=appendSOBookDecks(catalog,current,imported),subject=result.next.subjects[1];
assert.equal(JSON.stringify({catalog,current}),before);
assert.deepEqual(subject.decks.find(d=>d.id===old.id),old);
assert.deepEqual(result.next.subjects[0],catalog.subjects[0]);
assert.deepEqual(subject.chapterGroups.map(g=>[g.number,g.deckIds.length]),[[1,12],[2,20],[3,16],[4,18],[5,18],[6,1],[7,35]]);
assert.equal(subject.questionCount,13150);assert.equal(subject.defaultDeckId,"deck-1");
const now=[...current,...result.additions.map(entry=>{
  const index=result.staged.find(s=>s.path===entry.indexPath).value;
  return {entry,index,chunks:index.chunks.map(c=>result.staged.find(s=>s.path===c.path).value)};
})];
assert.deepEqual(appendSOBookDecks(result.next,now,imported).next,result.next);
assert.equal(appendSOBookDecks(result.next,now,imported).staged.length,0);
const edited=structuredClone(now);edited[1].chunks[0].terms[0].stages.beginner[0].answer="追加後に編集された回答";
assert.throws(()=>appendSOBookDecks(result.next,edited,imported),/既存の編集/);
assert.equal(soStudyLabel(subject.decks,subject.chapterGroups),"7デッキ");
assert.equal(soStudyLabel([old],subject.chapterGroups),"第6章 イスラーム世界");
assert.equal(groupSODecks(subject.decks,subject.chapterGroups)[0].decks.length,12);
const ids=subject.decks.map(d=>d.id),versions=new Map(subject.decks.map(d=>[d.id,d.version]));
const combined=createSessionDatasetVersion("world-history-so",ids,versions);
assert.ok(combined.length<=100);assert.equal(combined,createSessionDatasetVersion("world-history-so",ids.toReversed(),versions));
assert.notEqual(combined,createSessionDatasetVersion("world-history-so",ids.slice(1),versions));
assert.equal(createSessionDatasetVersion("world-history-so",["deck-1"],versions),old.version);
const legacy=[1,2,3,5,7,8,9,12,13].map(n=>`deck-${n}`);
assert.equal(createSessionDatasetVersion("world-history-so",legacy,new Map()),"mix-world-history-so-deck-1-deck-12-deck-13-deck-2-deck-3-deck-5-deck-7-deck-8-deck-9");
const calls=[],env={ACCESS_TOKEN:"test",BUCKET:{get:async()=>({etag:"current",json:async()=>catalog}),put:async(...args)=>{calls.push(args);return {etag:"saved"};}}};
const send=(value,expectedEtag="current",token="test")=>storage.fetch(new Request("https://example.org",{method:"POST",headers:{Authorization:`Bearer ${token}`},body:JSON.stringify({action:"commit",key:"index.json",expectedEtag,value})}),env);
assert.equal((await send(result.next,"current","wrong")).status,401);
assert.equal((await send(result.next,"old")).status,409);
const invalid=structuredClone(result.next);invalid.subjects[0].untouched=false;
assert.equal((await send(invalid)).status,400);
const changed=structuredClone(result.next);changed.subjects[1].decks.find(d=>d.id===old.id).version="changed";
assert.equal((await send(changed)).status,400);assert.equal(calls.length,0);
console.log("第1〜5・7章確認完了：119パート・13,149問の全文と種類、番号の分離、再登録、既存編集・他科目・保存範囲の保持、全パートの組合せ");
console.log("種類ごとの問題数:",typeCounts);

// 全面置換は対象章だけを切り替え、古い番号の学習履歴を再利用しない。
const oldCatalog=structuredClone(result.next),oldDecks=structuredClone(now);
for(const d of oldCatalog.subjects[1].decks.filter(d=>d.bookChapter===2)) d.version=d.version.replace(/v2$/, "v1");
for(const d of oldDecks.filter(d=>d.entry.bookChapter===2)) {
  d.entry.version=d.entry.version.replace(/v2$/, "v1");d.index.version=d.entry.version;
  d.chunks[0].terms[0].stages.beginner[0].answer="旧版の答え";
}
const chapter2=imported.filter(d=>d.chapter.number===2);
const replacement=replaceSOBookChapter(oldCatalog,oldDecks,chapter2,2);
assert.equal(replacement.additions.length,20);
assert.ok(validChapterReplacement(oldCatalog.subjects[1],replacement.next.subjects[1],2));
assert.throws(()=>replaceSOBookChapter(oldCatalog,oldDecks,chapter2.slice(1),2),/全パート/);
assert.throws(()=>replaceSOBookChapter(oldCatalog,oldDecks,imported,2),/対象以外/);
const replacedNow=oldDecks.filter(d=>d.entry.bookChapter!==2).concat(replacement.additions.map(entry=>{
  const index=replacement.staged.find(s=>s.path===entry.indexPath).value;
  return {entry,index,chunks:index.chunks.map(c=>replacement.staged.find(s=>s.path===c.path).value)};
}));
assert.equal(replaceSOBookChapter(replacement.next,replacedNow,chapter2,2).staged.length,0);
const userEdited=structuredClone(replacedNow);userEdited.find(d=>d.entry.bookChapter===2).chunks[0].terms[0].stages.beginner[0].answer="後から編集した答え";
assert.throws(()=>replaceSOBookChapter(replacement.next,userEdited,chapter2,2),/編集済み/);
const invalidOther=structuredClone(replacement.next);invalidOther.subjects[1].decks.find(d=>d.bookChapter===1).version="changed";
assert.equal(validChapterReplacement(oldCatalog.subjects[1],invalidOther.subjects[1],2),false);
const replaceWrites=[],objects=new Map(replacement.staged.map(o=>[o.path,o.value]));
const replaceEnv={ACCESS_TOKEN:"test",BUCKET:{
  get:async key=>key==="index.json" ? {etag:"current",json:async()=>oldCatalog} : objects.has(key) ? {json:async()=>objects.get(key)} : null,
  put:async(...args)=>{replaceWrites.push(args);return {etag:"saved"};}
}};
const sendReplacement=(value,expectedEtag="current",token="test")=>storage.fetch(new Request("https://example.org",{method:"POST",headers:{Authorization:`Bearer ${token}`},body:JSON.stringify({action:"replace",key:"index.json",chapterNumber:2,expectedEtag,value})}),replaceEnv);
assert.equal((await sendReplacement(replacement.next,"current","wrong")).status,401);
assert.equal((await sendReplacement(replacement.next,"stale")).status,409);
assert.equal((await sendReplacement(invalidOther)).status,400);
const indexKey=replacement.additions[0].indexPath,stagedIndex=objects.get(indexKey);objects.delete(indexKey);
assert.equal((await sendReplacement(replacement.next)).status,400);assert.equal(replaceWrites.length,0);
objects.set(indexKey,stagedIndex);
assert.equal((await sendReplacement(replacement.next)).status,200);
assert.equal(replaceWrites.length,2);assert.equal(replaceWrites[1][2].onlyIf.etagMatches,"current");
console.log("第2章置換：全20パート・履歴版分離・再実行・編集保護・他章保持・認証・競合・登録未完了の拒否を確認");

// 四章の登録が揃ってから一度だけ索引を切り替える。
const numbers=[3,4,5,7],batchCatalog=structuredClone(result.next),batchDecks=structuredClone(now);
for(const deck of batchCatalog.subjects[1].decks.filter(d=>numbers.includes(d.bookChapter))) deck.version=deck.version.replace(/v2$/,"v1");
for(const d of batchDecks.filter(d=>numbers.includes(d.entry.bookChapter))) {
  d.entry.version=d.entry.version.replace(/v2$/,"v1");d.index.version=d.entry.version;
  d.chunks[0].terms[0].stages.beginner[0].answer="差し替え前の答え";
}
const batchImported=imported.filter(d=>numbers.includes(d.chapter.number));
const batch=replaceSOBookChapters(batchCatalog,batchDecks,batchImported,numbers);
assert.equal(batch.additions.length,87);
assert.equal(batch.additions.reduce((n,d)=>n+d.questionCount,0),10778);
assert.ok(validChapterReplacement(batchCatalog.subjects[1],batch.next.subjects[1],numbers));
assert.equal(validChapterReplacement(batchCatalog.subjects[1],batch.next.subjects[1],[3,4,5]),false);
assert.equal(validChapterReplacement(batchCatalog.subjects[1],batch.next.subjects[1],[3,4,5,7,7]),false);
assert.throws(()=>replaceSOBookChapters(batchCatalog,batchDecks,batchImported.filter(d=>d.id!=="book-07-30-04"),numbers),/全パート/);
const batchObjects=new Map(batch.staged.map(o=>[o.path,o.value]));
const batchNow=batchDecks.filter(d=>!numbers.includes(d.entry.bookChapter)).concat(batch.additions.map(entry=>{
  const index=batchObjects.get(entry.indexPath);return {entry,index,chunks:index.chunks.map(c=>batchObjects.get(c.path))};
}));
assert.equal(replaceSOBookChapters(batch.next,batchNow,batchImported,numbers).staged.length,0);
assert.deepEqual(batch.next.subjects[1].decks.filter(d=>!numbers.includes(d.bookChapter)),batchCatalog.subjects[1].decks.filter(d=>!numbers.includes(d.bookChapter)));
const onlyThree=replaceSOBookChapters(batchCatalog,batchDecks,batchImported.filter(d=>d.chapter.number===3),[3]);
const partialCurrent=batchDecks.filter(d=>d.entry.bookChapter!==3).concat(batchNow.filter(d=>d.entry.bookChapter===3));
const remaining=replaceSOBookChapters(onlyThree.next,partialCurrent,batchImported,numbers);
assert.deepEqual([...new Set(remaining.additions.map(d=>d.bookChapter))],[4,5,7]);
assert.ok(validChapterReplacement(onlyThree.next.subjects[1],remaining.next.subjects[1],[4,5,7]));
assert.deepEqual(remaining.next,batch.next);
const batchWrites=[],batchEnv={ACCESS_TOKEN:"test",BUCKET:{
  get:async key=>key==="index.json" ? {etag:"batch",json:async()=>batchCatalog} : batchObjects.has(key) ? {json:async()=>batchObjects.get(key)} : null,
  put:async(...args)=>{batchWrites.push(args);return {etag:"saved"};}
}};
const sendBatch=()=>storage.fetch(new Request("https://example.org",{method:"POST",headers:{Authorization:"Bearer test"},body:JSON.stringify({action:"replace",key:"index.json",chapterNumber:numbers,expectedEtag:"batch",value:batch.next})}),batchEnv);
const lastKey=batch.additions.at(-1).indexPath,lastIndex=batchObjects.get(lastKey);batchObjects.delete(lastKey);
assert.equal((await sendBatch()).status,400);assert.equal(batchWrites.length,0);
batchObjects.set(lastKey,lastIndex);assert.equal((await sendBatch()).status,200);
assert.equal(batchWrites.filter(([key])=>key==="index.json").length,1);
assert.equal(batchWrites.at(-1)[2].onlyIf.etagMatches,"batch");
console.log("第3・4・5・7章置換：87パート・10,778問、四章同時切替、部分登録・対象外変更の拒否、再実行、他章と履歴版の保持を確認");
