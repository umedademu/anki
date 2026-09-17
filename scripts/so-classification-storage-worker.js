// 分類作業中だけ使用する、認証付きのCloudflare保存窓口。
export default {
  async fetch(request, env) {
    if (request.method !== "POST" || request.headers.get("Authorization") !== `Bearer ${env.ACCESS_TOKEN}`) {
      return new Response("Unauthorized", { status: 401 });
    }
    const { action, key, value, expectedEtag } = await request.json();
    const allowedRead = key === "index.json" || /^subjects\/world-history-so\/[a-zA-Z0-9_/-]+\.json$/.test(key);
    const allowedWrite = key.startsWith("subjects/world-history-so/question-types/") && allowedRead;
    if (!allowedRead) return new Response("Forbidden", { status: 403 });
    if (action === "read") {
      const object = await env.BUCKET.get(key);
      return object ? Response.json({ value: await object.json(), etag: object.etag }) : new Response("Missing", { status: 404 });
    }
    if (action !== "put" || (!allowedWrite && !(key === "index.json" && typeof expectedEtag === "string"))) {
      return new Response("Forbidden", { status: 403 });
    }
    if (key === "index.json") {
      const current = await env.BUCKET.get(key);
      if (!current || current.etag !== expectedEtag) return new Response("Conflict", { status: 409 });
      const original = await current.json();
      const others = (catalog) => catalog.subjects.filter(subject => subject.id !== "world-history-so");
      if (JSON.stringify(others(original)) !== JSON.stringify(others(value))) return new Response("Other subjects changed", { status: 400 });
    }
    const result = await env.BUCKET.put(key, JSON.stringify(value) + "\n", {
      httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "no-cache" },
      ...(expectedEtag ? { onlyIf: { etagMatches: expectedEtag } } : {}),
    });
    return result ? Response.json({ etag: result.etag }) : new Response("Conflict", { status: 409 });
  },
};
