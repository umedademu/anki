// 新しいパートだけを追加する、作業中限定の認証付き保存窓口。
export default {
  async fetch(request, env) {
    if(request.method!=="POST" || request.headers.get("Authorization")!==`Bearer ${env.ACCESS_TOKEN}`) return new Response("Unauthorized",{status:401});
    const { action,key,value,expectedEtag } = await request.json();
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
    if(action!=="commit" || key!=="index.json" || typeof expectedEtag!=="string") return new Response("Forbidden",{status:403});
    const current=await env.BUCKET.get(key);
    if(!current || current.etag!==expectedEtag) return new Response("Conflict",{status:409});
    const before=await current.json(), others=c=>c.subjects.filter(s=>s.id!=="world-history-so");
    if(JSON.stringify(others(before))!==JSON.stringify(others(value))) return new Response("Other subjects changed",{status:400});
    const previous=before.subjects.find(s=>s.id==="world-history-so"), next=value.subjects.find(s=>s.id==="world-history-so");
    if(!next || previous.decks.some(deck=>JSON.stringify(next.decks.find(d=>d.id===deck.id))!==JSON.stringify(deck)) || next.defaultDeckId!==previous.defaultDeckId || next.indexPath!==previous.indexPath) return new Response("Existing decks changed",{status:400});
    if(next.decks.filter(d=>!previous.decks.some(old=>old.id===d.id)).some(d=>!d.indexPath.startsWith(`subjects/world-history-so/imports/${d.id}/`))) return new Response("Invalid additions",{status:400});
    await env.BUCKET.put(`subjects/world-history-so/imports/history/${expectedEtag}.json`,JSON.stringify(before)+"\n",{httpMetadata:{contentType:"application/json"}});
    const saved=await env.BUCKET.put(key,JSON.stringify(value)+"\n",{onlyIf:{etagMatches:expectedEtag},httpMetadata:{contentType:"application/json; charset=utf-8",cacheControl:"no-cache"}});
    return saved ? Response.json({etag:saved.etag}) : new Response("Conflict",{status:409});
  },
};
