// 作業中だけ使用する、確認済みの関連画像一覧専用の保存窓口。
const keyForImages = "term-images.json";
const digest = async text => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map(value => value.toString(16).padStart(2, "0")).join("");
const binaryDigest = async bytes => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(value => value.toString(16).padStart(2, "0")).join("");
export default {
  async fetch(request, env) {
    if (request.method !== "POST" || request.headers.get("Authorization") !== `Bearer ${env.ACCESS_TOKEN}`) return new Response("Unauthorized", { status: 401 });
    const { action, key, text, base64, expectedEtag, catalogEtag } = await request.json();
    const allowedRead = JSON.parse(env.READ_KEYS);
    const newImages = JSON.parse(env.NEW_IMAGES ?? "{}");
    if (action === "image" && Object.hasOwn(newImages, key)) {
      if (!/^term-images\/japanese-history-k\/JHKS-[a-f0-9]{20}\.jpg$/.test(key) || typeof base64 !== "string" || base64.length > 700000) return new Response("Invalid image", { status: 400 });
      let bytes; try { bytes = Uint8Array.from(atob(base64), value => value.charCodeAt(0)); } catch { return new Response("Invalid image", { status: 400 }); }
      if (await binaryDigest(bytes) !== newImages[key] || bytes[0] !== 255 || bytes[1] !== 216) return new Response("Invalid image", { status: 400 });
      const previous = await env.BUCKET.get(key);
      if (previous) return await binaryDigest(await previous.arrayBuffer()) === newImages[key] ? Response.json({ unchanged: true }) : new Response("Conflict", { status: 409 });
      const saved = await env.BUCKET.put(key, bytes, { onlyIf: new Headers({ "If-None-Match": "*" }), httpMetadata: { contentType: "image/jpeg", cacheControl: "public, max-age=31536000, immutable" } });
      return saved ? Response.json({ etag: saved.etag }) : new Response("Conflict", { status: 409 });
    }
    if (action === "image-check" && Object.hasOwn(newImages, key)) {
      const object = await env.BUCKET.get(key);
      return object ? Response.json({ sha256: await binaryDigest(await object.arrayBuffer()) }) : new Response("Not found", { status: 404 });
    }
    if (action === "read" && allowedRead.includes(key)) {
      const object = await env.BUCKET.get(key);
      return Response.json(object ? { text: await object.text(), etag: object.etag } : { text: null, etag: null });
    }
    if (action !== "commit" || key !== keyForImages) return new Response("Forbidden", { status: 403 });
    if (typeof text !== "string" || await digest(text) !== env.NEXT_IMAGES_HASH) return new Response("Invalid manifest", { status: 400 });
    const [catalog, previous] = await Promise.all([env.BUCKET.head("index.json"), env.BUCKET.get(key)]);
    if (!previous || previous.etag !== expectedEtag || catalog?.etag !== catalogEtag) return new Response("Conflict", { status: 409 });
    const previousText = await previous.text();
    if (await digest(previousText) !== env.PREVIOUS_IMAGES_HASH) return new Response("Conflict", { status: 409 });
    const old = JSON.parse(previousText), value = JSON.parse(text);
    if (value.schemaVersion !== 2 || !Array.isArray(value.assets) || !Array.isArray(value.assignments) ||
      JSON.stringify(value.termFallbacks) !== JSON.stringify(old.termFallbacks) ||
      JSON.stringify(value.assets.slice(0, old.assets.length)) !== JSON.stringify(old.assets) ||
      JSON.stringify(value.assignments.slice(0, old.assignments.length)) !== JSON.stringify(old.assignments) ||
      !value.assignments.slice(old.assignments.length).every(item => JSON.parse(env.QUESTION_IDS).includes(item.questionId))) return new Response("Invalid scope", { status: 400 });
    for (const [imageKey, expectedHash] of Object.entries(newImages)) {
      const object = await env.BUCKET.get(imageKey);
      if (!object || await binaryDigest(await object.arrayBuffer()) !== expectedHash) return new Response("Unverified image", { status: 409 });
    }
    await env.BUCKET.put(`term-images-history/japanese-history-k/${previous.etag}.json`, previousText, { httpMetadata: { contentType: "application/json; charset=utf-8" } });
    const saved = await env.BUCKET.put(key, text, {
      onlyIf: { etagMatches: expectedEtag },
      httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "no-cache" },
    });
    return saved ? Response.json({ etag: saved.etag }) : new Response("Conflict", { status: 409 });
  },
};
