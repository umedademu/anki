import { readJsonBinding } from "./japanese-history-k-bindings.js";
const subjectId = "english-vocabulary", metadata = { contentType: "application/json; charset=utf-8", cacheControl: "no-cache" };
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const hashMap = value => record(value) && Object.values(value).every(hash => typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash));
const hash = async value => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value))))].map(byte => byte.toString(16).padStart(2, "0")).join("");

// 確認したDeck 5の追加だけを受け付け、既存問題や他科目は参照・照合に限る。
export default {
  async fetch(request, env) {
    if (request.method !== "POST" || request.headers.get("Authorization") !== `Bearer ${env.ACCESS_TOKEN}`) return new Response("Unauthorized", { status: 401 });
    let input, hashes, previousHashes, subject;
    try { input = await request.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }
    try {
      hashes = readJsonBinding(env, "OBJECT_HASHES"); previousHashes = readJsonBinding(env, "PREVIOUS_OBJECT_HASHES"); subject = readJsonBinding(env, "ADDITION_JSON");
      if (!hashMap(hashes) || !hashMap(previousHashes) || !record(subject) || subject.id !== subjectId || !Array.isArray(subject.decks)
        || subject.decks.map(deck => deck.id).join(",") !== "deck-1,deck-2,deck-3,deck-4,deck-5") throw new Error("Invalid settings");
    } catch { return new Response("Invalid settings", { status: 500 }); }
    const { action, key, value, expectedEtag } = input;
    const fresh = Object.hasOwn(hashes, key) && /^subjects\/english-vocabulary\/imports\/deck-5\/[a-f0-9]{12}\/(?:index|chunks\/\d{4})\.json$/.test(key);
    const previous = Object.hasOwn(previousHashes, key) && key.startsWith(`subjects/${subjectId}/`);
    if (key !== "index.json" && !fresh && !(action === "read" && previous)) return new Response("Forbidden", { status: 403 });
    if (action === "read") { const object = await env.BUCKET.get(key); return object ? Response.json({ value: await object.json(), etag: object.etag }) : new Response("Missing", { status: 404 }); }
    if (action === "stage" && fresh) {
      if (await hash(value) !== hashes[key]) return new Response("Unexpected content", { status: 400 });
      const text = JSON.stringify(value) + "\n", existing = await env.BUCKET.get(key);
      if (existing) return await existing.text() === text ? Response.json({ saved: true }) : new Response("Conflict", { status: 409 });
      const saved = await env.BUCKET.put(key, text, { onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: metadata });
      return saved ? Response.json({ saved: true }) : new Response("Conflict", { status: 409 });
    }
    if (action !== "commit" || key !== "index.json" || typeof expectedEtag !== "string") return new Response("Forbidden", { status: 403 });
    const current = await env.BUCKET.get(key);
    if (!current || current.etag !== expectedEtag) return new Response("Conflict", { status: 409 });
    const before = await current.json(), old = before.subjects?.find(item => item.id === subjectId);
    if (before.schemaVersion !== 3 || !Array.isArray(before.subjects) || !old || await hash(old) !== env.PREVIOUS_SUBJECT_HASH) return new Response("Previous subject changed", { status: 409 });
    if (old.decks?.map(deck => deck.id).join(",") !== "deck-1,deck-2,deck-3,deck-4" || JSON.stringify(subject.decks.slice(0, 4)) !== JSON.stringify(old.decks)) return new Response("Existing decks changed", { status: 400 });
    for (const [field, entry] of Object.entries(old)) {
      if (!["decks", "datasetLabel", "termCount", "questionCount"].includes(field) && JSON.stringify(subject[field]) !== JSON.stringify(entry)) return new Response("Subject metadata changed", { status: 400 });
    }
    const added = subject.decks[4];
    if (added.number !== 5 || added.version !== "english-vocabulary-deck-5-v1" || added.termCount !== 500 || added.questionCount !== 1500
      || subject.termCount !== old.termCount + 500 || subject.questionCount !== old.questionCount + 1500 || subject.datasetLabel !== "英単語段階別デッキ｜Deck 1〜5"
      || !Object.hasOwn(hashes, added.indexPath)) return new Response("Invalid addition", { status: 400 });
    const subjects = before.subjects.map(item => item.id === subjectId ? subject : item);
    const expected = { ...before, subjects, version: (await hash(subjects)).slice(0, 20) };
    if (JSON.stringify(expected) !== JSON.stringify(value)) return new Response("Other fields changed", { status: 400 });
    for (const [objectKey, expectedHash] of Object.entries({ ...previousHashes, ...hashes })) {
      const object = await env.BUCKET.get(objectKey);
      if (!object || await hash(await object.json()) !== expectedHash) return new Response("Data not verified", { status: 400 });
    }
    await env.BUCKET.put(`subjects/${subjectId}/imports/history/${expectedEtag}.json`, JSON.stringify(before) + "\n", { onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: metadata });
    const saved = await env.BUCKET.put(key, JSON.stringify(value) + "\n", { onlyIf: { etagMatches: expectedEtag }, httpMetadata: metadata });
    return saved ? Response.json({ etag: saved.etag }) : new Response("Conflict", { status: 409 });
  },
};
