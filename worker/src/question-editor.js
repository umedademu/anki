// 元の分割データを残し、新しい索引への切り替えだけを条件付きで確定する。
const stages = ["beginner", "reverse", "integrated"];
const jsonMetadata = { contentType: "application/json; charset=utf-8", cacheControl: "no-cache" };
const uuidPattern = /^[a-f0-9-]{36}$/;
const conflict = () => Object.assign(new Error("別の画面で問題集が更新されました。入力を控えてから「再読込」を押してください。"), { status: 409 });

async function readObject(bucket, key) {
  if (key !== "index.json" && !/^subjects\/[A-Za-z0-9_/-]+\.json$/.test(key)) {
    throw new Error("問題集の保存先が正しくありません。");
  }
  const object = await bucket.get(key);
  if (!object) throw new Error("Cloudflare上の問題集が見つかりません。");
  return { value: await object.json(), etag: object.etag };
}

function entries(subject) {
  return subject.decks?.length ? subject.decks : [{ ...subject, id: "deck-1" }];
}

async function readDeck(bucket, entry) {
  const { value: index } = await readObject(bucket, entry.indexPath);
  const chunks = await Promise.all(index.chunks.map((chunk) => readObject(bucket, chunk.path)));
  return { entry: { ...entry }, index, terms: chunks.flatMap(({ value }) => value.terms) };
}

function findSubject(catalog, id) {
  const subject = catalog.subjects.find((item) => item.id === id);
  if (!subject || subject.learningType === "mindset") throw new Error("編集できる科目を選択してください。");
  return subject;
}

export async function loadEditableSubject(env, subjectId) {
  const { value: catalog, etag } = await readObject(env.SPEECH_CACHE, "index.json");
  const subject = findSubject(catalog, subjectId);
  const decks = await Promise.all(entries(subject).map((entry) => readDeck(env.SPEECH_CACHE, entry)));
  return { subject, decks, revision: etag };
}

function field(value, name, required = false, max = 20000) {
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) {
    throw new Error(`${name}を${required ? "空欄にせず、" : ""}${max}文字以内で入力してください。`);
  }
  return value.trim();
}

function normalizeFields(input, deck) {
  const result = {};
  for (const [key, label] of Object.entries({ prompt: "問題文", answer: "回答", explanation: "解説", answerNote: "回答の補足", yearMnemonic: "語呂合わせ" })) {
    result[key] = field(input[key], label, key === "prompt" || key === "answer");
  }
  for (const [key, label] of Object.entries({ term: "用語・見出し", category: "分類", macroRegion: "大分類", regionDetail: "小分類" })) {
    result[key] = field(input[key], label, false, 500);
  }
  result.acceptedAnswers = field(input.acceptedAnswers, "別の正答").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  result.stage = input.stage;
  if (!(deck.index.availableStages ?? stages).includes(result.stage) || !stages.includes(result.stage)) {
    throw new Error("このデッキで使用できる問題形式を選択してください。");
  }
  return result;
}

function questionCount(term) {
  return stages.reduce((total, stage) => total + (term.stages[stage]?.length ?? 0), 0);
}

function locateQuestion(deck, id) {
  for (const term of deck.terms) for (const stage of stages) {
    const question = term.stages[stage]?.find((item) => item.id === id);
    if (question) return { term, stage, question };
  }
  throw new Error("対象の問題が見つかりません。再読込してください。");
}

function removeQuestion(deck, found) {
  found.term.stages[found.stage] = found.term.stages[found.stage].filter((q) => q.id !== found.question.id);
  if (!questionCount(found.term)) deck.terms = deck.terms.filter((term) => term !== found.term);
}

async function saveDeck(bucket, deck, revision) {
  const folder = `subjects/${deck.index.id}/editor/${revision}/${deck.entry.id}`;
  const chunks = [];
  for (let offset = 0; offset < deck.terms.length; offset += 200) {
    const terms = deck.terms.slice(offset, offset + 200);
    const number = chunks.length + 1;
    const path = `${folder}/chunk-${number}.json`;
    await putVerified(bucket, path, { schemaVersion: 3, subjectId: deck.index.id, deckId: deck.entry.id, chunkNumber: number, terms });
    chunks.push({ number, path, count: terms.length, firstTerm: terms[0].term, lastTerm: terms.at(-1).term });
  }
  const questionCounts = Object.fromEntries(stages.map((stage) => [stage, deck.terms.reduce((sum, term) => sum + (term.stages[stage]?.length ?? 0), 0)]));
  const counts = { termCount: deck.terms.length, questionCount: Object.values(questionCounts).reduce((a, b) => a + b, 0) };
  deck.index = { ...deck.index, ...counts, contentVersion: revision, questionCounts, chunks };
  const indexPath = `${folder}/index.json`;
  await putVerified(bucket, indexPath, deck.index);
  return { ...deck.entry, ...counts, contentVersion: revision, indexPath };
}

async function putVerified(bucket, key, value) {
  const body = JSON.stringify(value);
  await bucket.put(key, body, { httpMetadata: jsonMetadata });
  const saved = await bucket.get(key);
  if (!saved || await saved.text() !== body) throw new Error("保存内容の照合に失敗しました。問題集は切り替えていません。");
}

async function copyProgress(env, source, destination, questionId) {
  if (source.index.version === destination.index.version) return;
  // 元の記録を残す。移動先にさらに新しい回答がある場合も巻き戻さない。
  await env.DB.prepare(`INSERT INTO question_progress
    (dataset_version, question_id, streak, attempts, remembered_count, last_rating, last_answered_at, next_review_at, ever_mastered, updated_at)
    SELECT ?, question_id, streak, attempts, remembered_count, last_rating, last_answered_at, next_review_at, ever_mastered, updated_at
    FROM question_progress WHERE dataset_version = ? AND question_id = ?
    ON CONFLICT(dataset_version, question_id) DO UPDATE SET
      streak=excluded.streak, attempts=excluded.attempts, remembered_count=excluded.remembered_count,
      last_rating=excluded.last_rating, last_answered_at=excluded.last_answered_at,
      next_review_at=excluded.next_review_at, ever_mastered=excluded.ever_mastered, updated_at=excluded.updated_at
    WHERE excluded.updated_at > question_progress.updated_at`).bind(destination.index.version, source.index.version, questionId).run();
}

export async function mutateEditableSubject(env, input) {
  if (!uuidPattern.test(input.operationId ?? "")) throw new Error("保存操作の識別情報が正しくありません。");
  const bucket = env.SPEECH_CACHE;
  const { value: catalog, etag } = await readObject(bucket, "index.json");
  const subject = findSubject(catalog, input.subjectId);
  if (catalog.editorLastOperation?.id === input.operationId && catalog.editorLastOperation.subjectId === input.subjectId) {
    return { ok: true, revision: etag, ...catalog.editorLastOperation.result };
  }
  if (input.revision !== etag) throw conflict();
  if (input.action === "undo") {
    if (!uuidPattern.test(input.undoId ?? "")) throw new Error("元に戻す対象が正しくありません。");
    const backupObject = await bucket.get(`editor-history/${input.undoId}.json`);
    const backup = backupObject && await backupObject.json();
    if (!backup || backup.subjectId !== subject.id || backup.expectedVersion !== catalog.version) throw conflict();
    const restored = { ...backup.catalog, version: crypto.randomUUID(), editorLastOperation: { id: input.operationId, subjectId: subject.id, result: {} } };
    const committed = await bucket.put("index.json", JSON.stringify(restored), { httpMetadata: jsonMetadata, onlyIf: { etagMatches: etag } });
    if (!committed) throw conflict();
    return { ok: true, revision: committed.etag };
  }
  if (!["create", "update", "delete"].includes(input.action)) throw new Error("編集操作が正しくありません。");
  const catalogEntries = entries(subject);
  const sourceEntry = catalogEntries.find((entry) => entry.id === input.deckId);
  const destinationEntry = catalogEntries.find((entry) => entry.id === (input.targetDeckId ?? input.deckId));
  if (!sourceEntry || !destinationEntry) throw new Error("保存先のデッキを選択してください。");
  const source = await readDeck(bucket, sourceEntry);
  const destination = sourceEntry.id === destinationEntry.id ? source : await readDeck(bucket, destinationEntry);
  if (source.index.learningType !== destination.index.learningType) throw new Error("学習方式の異なるデッキには移動できません。");
  const changed = new Set([source]);
  let questionId = input.questionId;
  if (input.action === "delete") {
    removeQuestion(source, locateQuestion(source, questionId));
  } else {
    const fields = normalizeFields(input.fields ?? {}, destination);
    const found = input.action === "update" ? locateQuestion(source, questionId) : null;
    const originalPosition = found?.term.stages[found.stage].findIndex((q) => q.id === questionId) ?? -1;
    let term = found?.term;
    let question = found?.question;
    if (!found || source !== destination) {
      if (found) removeQuestion(source, found);
      // 同じ用語の別問題と番号が重ならないよう、移動した一問は独立した項目にする。
      term = found ? { ...structuredClone(term), id: `EDIT-${crypto.randomUUID()}`, stages: { beginner: [], reverse: [], integrated: [] } } : {
        id: `EDIT-${crypto.randomUUID()}`, importanceRank: destination.terms.length + 1,
        term: "", reading: "", aliases: [], era: "", geography: {}, chronology: { displayPeriod: "", sortYear: destination.terms.length + 1 },
        stages: { beginner: [], reverse: [], integrated: [] }, integratedAsExplanation: false,
      };
      term.datasetLabel = destination.index.datasetLabel;
      term.difficultyLabel = destination.index.difficultyLabel;
      destination.terms.push(term);
      changed.add(destination);
    } else {
      term.stages[found.stage] = term.stages[found.stage].filter((q) => q.id !== questionId);
    }
    questionId = question?.id ?? `EDIT-${crypto.randomUUID()}`;
    const { term: termText, category, macroRegion, regionDetail, ...questionFields } = fields;
    question = { ...question, ...questionFields, id: questionId, editorModified: true,
      type: question?.type ?? "short_answer", label: destination.index.stageLabels?.[fields.stage] ?? "一問一答",
      focus: question?.focus ?? "一問一答", keywords: question?.keywords ?? [],
      hideTermUntilAnswer: question?.hideTermUntilAnswer ?? true,
    };
    // 表示文を修正した時に古い文章の音声が残らないようにする。
    if (question.speech) {
      const englishQuestion = destination.index.learningType === "vocabulary" && fields.stage !== "reverse";
      const englishAnswer = destination.index.learningType === "vocabulary" && fields.stage === "reverse";
      question.speech.question = [{ text: fields.prompt, language: englishQuestion ? "en-US" : "ja-JP" }];
      question.speech.answer = [{ text: fields.answer, language: englishAnswer ? "en-US" : "ja-JP" }, ...(question.speech.answer?.slice(1) ?? [])];
    }
    term.term = termText || (destination.index.simpleQuestions ? fields.prompt : fields.answer);
    term.category = category;
    term.geography = { ...term.geography, macroRegion, regionDetail };
    if (found && source === destination && fields.stage === found.stage) term.stages[fields.stage].splice(originalPosition, 0, question);
    else term.stages[fields.stage].push(question);
    if (found && source !== destination) await copyProgress(env, source, destination, questionId);
  }
  const version = crypto.randomUUID();
  const updatedEntries = new Map();
  for (const deck of changed) updatedEntries.set(deck.entry.id, await saveDeck(bucket, deck, version));
  const decks = catalogEntries.map((entry) => updatedEntries.get(entry.id) ?? entry);
  const updatedSubject = { ...subject, decks, indexPath: decks.find((deck) => deck.id === subject.defaultDeckId)?.indexPath ?? decks[0].indexPath,
    termCount: decks.reduce((sum, deck) => sum + deck.termCount, 0), questionCount: decks.reduce((sum, deck) => sum + deck.questionCount, 0) };
  const undoId = input.action === "delete" ? crypto.randomUUID() : null;
  const result = { questionId, undoId };
  const updatedCatalog = { ...catalog, version,
    subjects: catalog.subjects.map((item) => item.id === subject.id ? updatedSubject : item),
    editorLastOperation: { id: input.operationId, subjectId: subject.id, result } };
  // 取り消しは、削除後に別の保存が行われていない場合にだけ受け付ける。
  if (undoId) await putVerified(bucket, `editor-history/${undoId}.json`, { subjectId: subject.id, expectedVersion: version, catalog });
  const committed = await bucket.put("index.json", JSON.stringify(updatedCatalog), { httpMetadata: jsonMetadata, onlyIf: { etagMatches: etag } });
  if (!committed) throw conflict();
  return { ok: true, revision: committed.etag, ...result };
}
