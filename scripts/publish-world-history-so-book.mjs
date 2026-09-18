import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir,readFile,writeFile,unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { importSOBookFiles,readSOBookFiles,appendSOBookDecks } from "./world-history-so-book.mjs";

const apply=process.argv.includes("--apply"), work=new URL("../.wrangler/so-book/",import.meta.url);
await mkdir(work,{recursive:true});
const contents=await readFile(new URL("../data/source/world-history-so/sekai_shi_tankyu_mokuji.md",import.meta.url),"utf8");
const imported=importSOBookFiles(await readSOBookFiles(fileURLToPath(new URL("../data/source/world-history-so/book/",import.meta.url))),contents);
const configPath=new URL("writer.json",work),token=randomBytes(32).toString("hex");
let endpoint;
async function wrangler(...args) {
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js",import.meta.url)),...args,"--config",fileURLToPath(configPath)],{stdio:["ignore","pipe","pipe"]});
    let output=""; child.stdout.on("data",p=>output+=p);child.stderr.on("data",p=>output+=p);
    child.on("error",reject);child.on("close",code=>code===0?resolve(output):reject(new Error(output.replaceAll(token,"[非公開]"))));
  });
}
async function request(input) {
  for(let attempt=0;attempt<6;attempt++) {
    const response=await fetch(endpoint,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(input),signal:AbortSignal.timeout(45000)});
    if(input.action==="read" && [404,429,500,502,503,504].includes(response.status) && attempt<5) {
      await response.arrayBuffer();await new Promise(resolve=>setTimeout(resolve,Math.min(8000,2000*(attempt+1))));continue;
    }
    assert.ok(response.ok,`Cloudflareの${input.action}が失敗しました（${response.status}）。`);return response.json();
  }
}
async function read(key) {
  if(endpoint)return request({action:"read",key});
  const response=await fetch(`https://pub-76ffbe2829114a5cbaa433db45872267.r2.dev/${key}?book=${Date.now()}`,{cache:"no-store",signal:AbortSignal.timeout(30000)});
  assert.ok(response.ok,`Cloudflareの${key}を取得できません（${response.status}）。`);
  return {value:await response.json(),etag:response.headers.get("etag")};
}
try {
  if(apply) {
    await writeFile(configPath,JSON.stringify({name:"anki-so-book-import",compatibility_date:"2026-08-20",main:fileURLToPath(new URL("so-book-storage-worker.js",import.meta.url)),workers_dev:true,preview_urls:false,vars:{ACCESS_TOKEN:token},r2_buckets:[{binding:"BUCKET",bucket_name:"anki-world-history"}]}));
    const deployed=await wrangler("deploy");endpoint=deployed.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/)?.[0];assert.ok(endpoint);
  }
  const original=await read("index.json"),subject=original.value.subjects.find(s=>s.id==="world-history-so");
  assert.ok(subject);
  const current=await Promise.all(subject.decks.map(async entry=>{
    const {value:index}=await read(entry.indexPath);
    return {entry,index,chunks:await Promise.all(index.chunks.map(async c=>(await read(c.path)).value))};
  }));
  const result=appendSOBookDecks(original.value,current,imported);
  const after=result.next.subjects.find(s=>s.id===subject.id);
  const report={parts:imported.map(({terms,...d})=>({...d,questionCount:terms.length})),added:result.additions.length,addedQuestions:result.additions.reduce((n,d)=>n+d.questionCount,0),totalQuestions:after.questionCount};
  await writeFile(new URL("report.json",work),JSON.stringify(report,null,2)+"\n");
  await writeFile(new URL("plan.json",work),JSON.stringify(result));
  await writeFile(new URL("current.json",work),JSON.stringify({catalog:original.value,decks:current}));
  for(const deck of imported)console.log(`${deck.datasetLabel}：${deck.terms.length}問`);
  console.log(`追加${report.added}パート・${report.addedQuestions}問、世界史SOの合計${after.questionCount}問。`);
  if(!result.additions.length)console.log("すべて登録済みで内容も一致しています。変更しません。");
  else if(!apply)console.log("確認のみです。--apply でCloudflareへ追加します。");
  else {
    await writeFile(new URL(`before-${original.etag}.json`,work),JSON.stringify({original,current}));
    for(const object of result.staged) {
      await request({action:"stage",key:object.path,value:object.value});
      assert.deepEqual((await read(object.path)).value,object.value);
    }
    await request({action:"commit",key:"index.json",value:result.next,expectedEtag:original.etag});
    assert.deepEqual((await read("index.json")).value,result.next);
    for(const deck of current) {
      assert.deepEqual((await read(deck.entry.indexPath)).value,deck.index);
      for(let i=0;i<deck.chunks.length;i++)assert.deepEqual((await read(deck.index.chunks[i].path)).value,deck.chunks[i]);
    }
    console.log("追加内容と既存全パートをCloudflareで照合しました。既存問題・履歴版・地図・学習記録は維持しています。");
  }
} finally {
  if(endpoint){await wrangler("delete","--force");await unlink(configPath);console.log("作業用保存窓口を削除しました。");}
}
