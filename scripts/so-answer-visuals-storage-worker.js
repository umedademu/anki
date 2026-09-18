// 作業中だけ公開する、世界史SOの解答画像専用の保存窓口。
const manifestKey = "subjects/world-history-so/answer-visuals/index.json";
export default {
  async fetch(request, env) {
    if (request.method !== "POST" || request.headers.get("Authorization") !== `Bearer ${env.ACCESS_TOKEN}`) return new Response("Unauthorized", { status: 401 });
    const { action, key, text, expectedEtag, catalogEtag, imagesEtag } = await request.json();
    const allowedRead = ["index.json", "term-images.json", manifestKey].includes(key) || /^subjects\/world-history-so\/[a-zA-Z0-9_/-]+\.(json|svg)$/.test(key);
    if (!allowedRead) return new Response("Forbidden", { status: 403 });
    if (action === "read") {
      const object = await env.BUCKET.get(key);
      return Response.json(object ? { text: await object.text(), etag: object.etag } : { text: null, etag: null });
    }
    if (action === "map" && /^subjects\/world-history-so\/answer-visuals\/maps\/[a-f0-9]{20}\.svg$/.test(key) && typeof text === "string") {
      const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map(n => n.toString(16).padStart(2, "0")).join("").slice(0,20);
      if (!key.endsWith(`/${digest}.svg`) || !text.startsWith("<svg") || /<script|<foreignObject|\son\w+=|(?:href|src)=/i.test(text)) return new Response("Invalid map", { status: 400 });
      await env.BUCKET.put(key, text, { httpMetadata: { contentType: "image/svg+xml", cacheControl: "public, max-age=31536000, immutable" } });
      return Response.json({ saved: true });
    }
    if (action !== "commit" || key !== manifestKey) return new Response("Forbidden", { status: 403 });
    const [catalog, images, previous] = await Promise.all([env.BUCKET.head("index.json"), env.BUCKET.head("term-images.json"), env.BUCKET.get(key)]);
    if (catalog?.etag !== catalogEtag || images?.etag !== imagesEtag || (previous?.etag ?? null) !== expectedEtag) return new Response("Conflict", { status: 409 });
    const value = JSON.parse(text);
    if (value.subjectId !== "world-history-so" || value.schemaVersion !== 1 || value.assignments?.length !== value.questionCount) return new Response("Invalid manifest", { status: 400 });
    if (previous) await env.BUCKET.put(`subjects/world-history-so/answer-visuals/history/${previous.etag}.json`, await previous.text(), { httpMetadata: { contentType: "application/json" } });
    const saved = await env.BUCKET.put(key, text, { onlyIf: expectedEtag ? { etagMatches: expectedEtag } : { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "no-cache" } });
    return saved ? Response.json({ etag: saved.etag }) : new Response("Conflict", { status: 409 });
  },
};
