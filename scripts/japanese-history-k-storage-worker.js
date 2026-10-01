// 日本史Kの確認済み新データと、科目一覧への追加だけを許可する一時窓口。
const subjectId = "japanese-history-k";
const hash = async value => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value))))].map(byte => byte.toString(16).padStart(2, "0")).join("");
const metadata = { contentType: "application/json; charset=utf-8", cacheControl: "no-cache" };
export default {
  async fetch(request, env) {
    if (request.method !== "POST" || request.headers.get("Authorization") !== `Bearer ${env.ACCESS_TOKEN}`) return new Response("Unauthorized", { status: 401 });
    let input;
    try { input = await request.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }
    const { action, key, value, expectedEtag } = input;
    const hashes = JSON.parse(env.OBJECT_HASHES);
    const isNewData = Object.hasOwn(hashes, key) && key.startsWith(`subjects/${subjectId}/imports/`);
    if (key !== "index.json" && !isNewData) return new Response("Forbidden", { status: 403 });
    if (action === "read") {
      const object = await env.BUCKET.get(key);
      return object ? Response.json({ value: await object.json(), etag: object.etag }) : new Response("Missing", { status: 404 });
    }
    if (action === "stage" && isNewData) {
      if (await hash(value) !== hashes[key]) return new Response("Unexpected content", { status: 400 });
      const text = JSON.stringify(value) + "\n", existing = await env.BUCKET.get(key);
      if (existing) return await existing.text() === text ? Response.json({ saved: true }) : new Response("Conflict", { status: 409 });
      const saved = await env.BUCKET.put(key, text, { onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: metadata });
      return saved ? Response.json({ saved: true }) : new Response("Conflict", { status: 409 });
    }
    if (action !== "commit" || key !== "index.json" || typeof expectedEtag !== "string") return new Response("Forbidden", { status: 403 });
    const current = await env.BUCKET.get(key);
    if (!current || current.etag !== expectedEtag) return new Response("Conflict", { status: 409 });
    const before = await current.json(), subject = JSON.parse(env.ADDITION_JSON);
    if (before.schemaVersion !== 3 || !Array.isArray(before.subjects) || before.subjects.some(entry => entry.id === subjectId)) return new Response("Invalid catalog", { status: 400 });
    const subjects = [...before.subjects, subject];
    const expected = { ...before, subjects, version: (await hash(subjects)).slice(0, 20) };
    if (JSON.stringify(expected) !== JSON.stringify(value)) return new Response("Other fields changed", { status: 400 });
    for (const [objectKey, expectedHash] of Object.entries(hashes)) {
      const object = await env.BUCKET.get(objectKey);
      if (!object || await hash(await object.json()) !== expectedHash) return new Response("Data not verified", { status: 400 });
    }
    // 切替前の索引を復旧用に残し、並行する編集があれば切替を中止する。
    await env.BUCKET.put(`subjects/${subjectId}/imports/history/${expectedEtag}.json`, JSON.stringify(before) + "\n", { onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: metadata });
    const saved = await env.BUCKET.put(key, JSON.stringify(value) + "\n", { onlyIf: { etagMatches: expectedEtag }, httpMetadata: metadata });
    return saved ? Response.json({ etag: saved.etag }) : new Response("Conflict", { status: 409 });
  },
};
