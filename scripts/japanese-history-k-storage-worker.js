// 日本史Kの確認済みデータの追加・置換だけを許可する一時窓口。
import { readJsonBinding } from "./japanese-history-k-bindings.js";
const subjectId = "japanese-history-k";
const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
const isHashMap = value => isRecord(value) && Object.values(value).every(entry => typeof entry === "string" && /^[a-f0-9]{64}$/.test(entry));
const hash = async value => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value))))].map(byte => byte.toString(16).padStart(2, "0")).join("");
const metadata = { contentType: "application/json; charset=utf-8", cacheControl: "no-cache" };
export default {
  async fetch(request, env) {
    if (request.method !== "POST" || request.headers.get("Authorization") !== `Bearer ${env.ACCESS_TOKEN}`) return new Response("Unauthorized", { status: 401 });
    let input;
    try { input = await request.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }
    const { action, key, value, expectedEtag } = input;
    let hashes, previousHashes, subject;
    try {
      hashes = readJsonBinding(env, "OBJECT_HASHES");
      previousHashes = readJsonBinding(env, "PREVIOUS_OBJECT_HASHES", "{}");
      subject = readJsonBinding(env, "ADDITION_JSON");
      if (!isHashMap(hashes) || !isHashMap(previousHashes) || !isRecord(subject) || subject.id !== subjectId || !Array.isArray(subject.decks) || !Array.isArray(subject.chapterGroups)) throw new Error("Invalid settings shape");
    } catch { return new Response("Invalid registration settings", { status: 500 }); }
    const isNewData = Object.hasOwn(hashes, key) && key.startsWith(`subjects/${subjectId}/imports/`);
    const isPreviousData = Object.hasOwn(previousHashes, key) && key.startsWith(`subjects/${subjectId}/`);
    if (key !== "index.json" && !isNewData && !(action === "read" && isPreviousData)) return new Response("Forbidden", { status: 403 });
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
    const before = await current.json();
    if (before.schemaVersion !== 3 || !Array.isArray(before.subjects)) return new Response("Invalid catalog", { status: 400 });
    const previous = before.subjects.filter(entry => entry.id === subjectId);
    if (env.PREVIOUS_SUBJECT_HASH ? previous.length !== 1 || await hash(previous[0]) !== env.PREVIOUS_SUBJECT_HASH : previous.length !== 0) return new Response("Previous subject changed", { status: 409 });
    if (env.PRESERVE_EXISTING_DECKS === "true") {
      if (previous.length !== 1 || !Array.isArray(subject.decks) || previous[0].decks.some(deck => JSON.stringify(subject.decks.find(item => item.id === deck.id)) !== JSON.stringify(deck))) return new Response("Existing decks changed", { status: 400 });
      for (const [field, entry] of Object.entries(previous[0])) {
        if (["decks", "chapterGroups", "termCount", "questionCount"].includes(field)) continue;
        if (JSON.stringify(subject[field]) !== JSON.stringify(entry)) return new Response("Existing subject metadata changed", { status: 400 });
      }
      for (const group of previous[0].chapterGroups) {
        const currentGroup = subject.chapterGroups.find(item => item.id === group.id);
        if (!currentGroup || group.deckIds.some(id => !currentGroup.deckIds.includes(id)) || Object.entries(group).some(([field, entry]) => field !== "deckIds" && JSON.stringify(currentGroup[field]) !== JSON.stringify(entry))) return new Response("Existing chapter changed", { status: 400 });
      }
    }
    const subjects = previous.length ? before.subjects.map(entry => entry.id === subjectId ? subject : entry) : [...before.subjects, subject];
    const expected = { ...before, subjects, version: (await hash(subjects)).slice(0, 20) };
    if (JSON.stringify(expected) !== JSON.stringify(value)) return new Response("Other fields changed", { status: 400 });
    for (const [objectKey, expectedHash] of Object.entries({ ...previousHashes, ...hashes })) {
      const object = await env.BUCKET.get(objectKey);
      if (!object || await hash(await object.json()) !== expectedHash) return new Response("Data not verified", { status: 400 });
    }
    // 切替前の索引を復旧用に残し、並行する編集があれば切替を中止する。
    await env.BUCKET.put(`subjects/${subjectId}/imports/history/${expectedEtag}.json`, JSON.stringify(before) + "\n", { onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: metadata });
    const saved = await env.BUCKET.put(key, JSON.stringify(value) + "\n", { onlyIf: { etagMatches: expectedEtag }, httpMetadata: metadata });
    return saved ? Response.json({ etag: saved.etag }) : new Response("Conflict", { status: 409 });
  },
};
