// パート追加・明示した章の全面置換に使う、作業中限定の認証付き保存窓口。
export function validChapterReplacement(previous, next, chapterNumber) {
  const numbers = Array.isArray(chapterNumber) ? chapterNumber : [chapterNumber];
  if (!numbers.length || new Set(numbers).size!==numbers.length || numbers.some(n=>!Number.isInteger(n) || n<1)) return false;
  const groups = numbers.map(n=>previous.chapterGroups?.find(g=>g.number===n));
  if (groups.some(g=>!g || g.deckIds.includes(previous.defaultDeckId))) return false;
  const ids = new Set(groups.flatMap(g=>g.deckIds)), equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  const withoutCounts = s => {
    const {decks, termCount, questionCount, ...rest} = s;
    return rest;
  };
  if (!equal(withoutCounts(previous), withoutCounts(next)) || next.decks.length !== previous.decks.length) return false;
  if (new Set(next.decks.map(d => d.id)).size !== next.decks.length) return false;
  for (let i=0; i<previous.decks.length; i++) {
    const old = previous.decks[i], deck = next.decks[i];
    if (!ids.has(old.id)) { if (!equal(old,deck)) return false; continue; }
    if (deck.id !== old.id || deck.bookChapter !== old.bookChapter || !numbers.includes(deck.bookChapter) || deck.lesson !== old.lesson || deck.part !== old.part || deck.version === old.version) return false;
    if (!Number.isInteger(deck.questionCount) || deck.questionCount<1 || deck.termCount!==deck.questionCount) return false;
    if (!/^[a-f0-9]{20}$/.test(deck.contentVersion) || deck.indexPath!==`subjects/world-history-so/imports/${deck.id}/${deck.contentVersion}/index.json`) return false;
  }
  return next.questionCount===next.decks.reduce((n,d)=>n+d.questionCount,0) && next.termCount===next.decks.reduce((n,d)=>n+d.termCount,0);
}
export default {
  async fetch(request, env) {
    if(request.method!=="POST" || request.headers.get("Authorization")!==`Bearer ${env.ACCESS_TOKEN}`) return new Response("Unauthorized",{status:401});
    const { action,key,value,expectedEtag,chapterNumber } = await request.json();
    if(key!=="index.json" && !/^subjects\/world-history-so\/[A-Za-z0-9_/-]+\.json$/.test(key)) return new Response("Forbidden",{status:403});
    if(action==="read") {
      const object=await env.BUCKET.get(key);
      return object ? Response.json({value:await object.json(),etag:object.etag}) : new Response("Missing",{status:404});
    }
    if(action==="stage" && /^subjects\/world-history-so\/imports\/book-\d+-\d+-\d+\/[a-f0-9]{20}\/(index|chunks\/\d+)\.json$/.test(key)) {
      const text=JSON.stringify(value)+"\n", existing=await env.BUCKET.get(key);
      if(existing) return await existing.text()===text ? Response.json({saved:true}) : new Response("Conflict",{status:409});
      const saved=await env.BUCKET.put(key,text,{onlyIf:{etagDoesNotMatch:"*"},httpMetadata:{contentType:"application/json; charset=utf-8",cacheControl:"no-cache"}});
      return saved ? Response.json({saved:true}) : new Response("Conflict",{status:409});
    }
    if(!["commit","replace"].includes(action) || key!=="index.json" || typeof expectedEtag!=="string") return new Response("Forbidden",{status:403});
    const current=await env.BUCKET.get(key);
    if(!current || current.etag!==expectedEtag) return new Response("Conflict",{status:409});
    const before=await current.json(), others=c=>c.subjects.filter(s=>s.id!=="world-history-so");
    if(JSON.stringify(others(before))!==JSON.stringify(others(value))) return new Response("Other subjects changed",{status:400});
    const previous=before.subjects.find(s=>s.id==="world-history-so"), next=value.subjects.find(s=>s.id==="world-history-so");
    if(!next) return new Response("Missing subject",{status:400});
    if(action==="replace") {
      if(!validChapterReplacement(previous,next,chapterNumber)) return new Response("Invalid chapter replacement",{status:400});
      const numbers=Array.isArray(chapterNumber) ? chapterNumber : [chapterNumber];
      for(const deck of next.decks.filter(d=>numbers.includes(d.bookChapter))) {
        const stored=await env.BUCKET.get(deck.indexPath);
        if(!stored) return new Response("Missing staged index",{status:400});
        const index=await stored.json();
        if(index.deckId!==deck.id || index.version!==deck.version || index.contentVersion!==deck.contentVersion || index.questionCount!==deck.questionCount) return new Response("Invalid staged index",{status:400});
      }
    } else if(previous.decks.some(deck=>JSON.stringify(next.decks.find(d=>d.id===deck.id))!==JSON.stringify(deck)) || next.defaultDeckId!==previous.defaultDeckId || next.indexPath!==previous.indexPath) return new Response("Existing decks changed",{status:400});
    if(next.decks.filter(d=>!previous.decks.some(old=>old.id===d.id)).some(d=>!d.indexPath.startsWith(`subjects/world-history-so/imports/${d.id}/`))) return new Response("Invalid additions",{status:400});
    await env.BUCKET.put(`subjects/world-history-so/imports/history/${expectedEtag}.json`,JSON.stringify(before)+"\n",{httpMetadata:{contentType:"application/json"}});
    const saved=await env.BUCKET.put(key,JSON.stringify(value)+"\n",{onlyIf:{etagMatches:expectedEtag},httpMetadata:{contentType:"application/json; charset=utf-8",cacheControl:"no-cache"}});
    return saved ? Response.json({etag:saved.etag}) : new Response("Conflict",{status:409});
  },
};
