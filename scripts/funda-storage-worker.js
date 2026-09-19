// ファンダの新規登録だけを許可する、作業中限定の認証付き保存窓口。
export default {
  async fetch(request, env) {
    if (request.method !== "POST" || request.headers.get("Authorization") !== `Bearer ${env.ACCESS_TOKEN}`) return new Response("Unauthorized", { status: 401 });
    const { action, key, value, expectedEtag } = await request.json();
    const isNewData = /^subjects\/funda\/imports\/[a-f0-9]{20}\/(index|chunks\/0001)\.json$/.test(key);
    if (key !== "index.json" && !isNewData) return new Response("Forbidden", { status: 403 });
    if (action === "read") {
      const object = await env.BUCKET.get(key);
      return object ? Response.json({ value: await object.json(), etag: object.etag }) : new Response("Missing", { status: 404 });
    }
    const metadata = { contentType: "application/json; charset=utf-8", cacheControl: "no-cache" };
    if (action === "stage" && isNewData) {
      const text = JSON.stringify(value) + "\n", existing = await env.BUCKET.get(key);
      if (existing) return await existing.text() === text ? Response.json({ saved: true }) : new Response("Conflict", { status: 409 });
      const saved = await env.BUCKET.put(key, text, { onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: metadata });
      return saved ? Response.json({ saved: true }) : new Response("Conflict", { status: 409 });
    }
    if (action !== "commit" || key !== "index.json" || typeof expectedEtag !== "string") return new Response("Forbidden", { status: 403 });
    const current = await env.BUCKET.get(key);
    if (!current || current.etag !== expectedEtag) return new Response("Conflict", { status: 409 });
    const before = await current.json(), added = value.subjects?.filter(s => s.id === "funda");
    if (before.subjects.some(s => s.id === "funda") || added?.length !== 1 || added[0].questionCount !== 1 ||
      JSON.stringify(before.subjects) !== JSON.stringify(value.subjects.filter(s => s.id !== "funda"))) return new Response("Invalid additions", { status: 400 });
    const expected = { ...before, subjects: [...before.subjects, added[0]], version: value.version };
    if (JSON.stringify(expected) !== JSON.stringify(value)) return new Response("Other fields changed", { status: 400 });
    await env.BUCKET.put(`subjects/funda/imports/history/${expectedEtag}.json`, JSON.stringify(before) + "\n", { httpMetadata: metadata });
    const saved = await env.BUCKET.put(key, JSON.stringify(value) + "\n", { onlyIf: { etagMatches: expectedEtag }, httpMetadata: metadata });
    return saved ? Response.json({ etag: saved.etag }) : new Response("Conflict", { status: 409 });
  },
};
