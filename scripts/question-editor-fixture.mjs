import { createHash } from "node:crypto";

export function editorFixture() {
  const objects = new Map();
  const question = (id, prompt) => ({ id, stage: "beginner", prompt, answer: `回答：${prompt}`, explanation: "解説です。", acceptedAnswers: [], answerNote: "", yearMnemonic: "", type: "identify" });
  const term = (id, questions) => ({ id, term: "試験用語", category: "試験分類", geography: { macroRegion: "アジア", regionDetail: "西アジア" }, stages: { beginner: questions, reverse: [], integrated: [] }, chronology: { sortYear: 1 } });
  const decks = [1, 2].map((number) => {
    const id = `deck-${number}`, indexPath = `subjects/test/${id}/index.json`, chunkPath = `subjects/test/${id}/chunk.json`;
    const terms = [term(`term-${number}`, number === 1 ? [question("q1", "最初の問題"), question("q2", "関連する問題")] : [question("q3", "別のデッキの問題")])];
    const entry = { id, number, indexPath, version: `test-deck-${number}-v1`, difficultyLabel: `第${number}章`, termCount: 1, questionCount: terms[0].stages.beginner.length };
    objects.set(indexPath, JSON.stringify({ ...entry, id: "test", deckId: id, title: "試験科目", schemaVersion: 3, learningType: "history", masteryTarget: 2,
      availableStages: ["beginner", "reverse", "integrated"], stageLabels: { beginner: "一問一答", reverse: "逆一問一答", integrated: "統合説明" },
      filterLabels: { category: "分類", macroRegion: "大分類", regionDetail: "小分類" }, chunks: [{ path: chunkPath }], contentVersion: "old" }));
    objects.set(chunkPath, JSON.stringify({ schemaVersion: 3, subjectId: "test", deckId: id, terms }));
    return entry;
  });
  objects.set("index.json", JSON.stringify({ schemaVersion: 3, version: "initial", subjects: [{ id: "test", title: "試験科目", learningType: "history", defaultDeckId: "deck-1", indexPath: decks[0].indexPath, decks, termCount: 2, questionCount: 3 }, { id: "other", title: "別科目", decks: [] }] }));
  const etag = (body) => createHash("sha256").update(body).digest("hex");
  const dbCalls = [];
  const bucket = {
    failPut: null, conflictOnCommit: false,
    async get(key) {
      const body = objects.get(key);
      return body === undefined ? null : { etag: etag(body), json: async () => JSON.parse(body), text: async () => body };
    },
    async put(key, body, options = {}) {
      if (this.failPut?.(key)) throw new Error("試験用の保存失敗");
      if (options.onlyIf && (this.conflictOnCommit || etag(objects.get(key)) !== options.onlyIf.etagMatches)) return null;
      objects.set(key, body); return { etag: etag(body) };
    },
  };
  return { objects, dbCalls, bucket, env: { SYNC_TOKEN: "editor-test-key", ALLOWED_ORIGIN: "http://127.0.0.1:4173", SPEECH_CACHE: bucket,
    DB: { prepare(sql) { return { bind(...args) { return { async run() { dbCalls.push({ sql, args }); return { success: true }; } }; } }; } } } };
}
