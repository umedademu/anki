const dataBaseUrl = "https://pub-76ffbe2829114a5cbaa433db45872267.r2.dev";
const productionOrigin = "https://anki-ume.vercel.app";
const targetText = process.argv.slice(2).join(" ").trim();

async function readCloudflareJson(relativePath) {
  const response = await fetch(
    `${dataBaseUrl}/${relativePath}?answer-note-audit=${Date.now()}`,
    {
      cache: "no-store",
      headers: { Origin: productionOrigin },
    },
  );
  if (!response.ok) {
    throw new Error(
      `Cloudflare上の${relativePath}を確認できません（${response.status}）。`,
    );
  }
  return response.json();
}

function deckEntriesFor(subject) {
  return Array.isArray(subject.decks) && subject.decks.length > 0
    ? subject.decks
    : [subject];
}

function questionsFor(term) {
  return Object.values(term.stages ?? {}).flatMap((questions) =>
    Array.isArray(questions) ? questions : [],
  );
}

const catalog = await readCloudflareJson("index.json");
if (!Array.isArray(catalog.subjects) || catalog.subjects.length === 0) {
  throw new Error("Cloudflare上に科目一覧がありません。");
}

const summaries = [];
const matches = [];
let totalQuestions = 0;
let totalAnswerNotes = 0;

for (const subject of catalog.subjects) {
  let subjectQuestions = 0;
  let subjectAnswerNotes = 0;

  for (const deck of deckEntriesFor(subject)) {
    const index = await readCloudflareJson(deck.indexPath);
    const chunks = await Promise.all(
      index.chunks.map((chunk) => readCloudflareJson(chunk.path)),
    );
    const questions = chunks
      .flatMap((chunk) => chunk.terms ?? [])
      .flatMap(questionsFor);
    const answerNotes = questions.filter((question) =>
      String(question.answerNote ?? "").trim(),
    );

    subjectQuestions += questions.length;
    subjectAnswerNotes += answerNotes.length;
    for (const question of answerNotes) {
      const answerNote = String(question.answerNote).trim();
      if (targetText && answerNote.includes(targetText)) {
        matches.push(
          `${subject.title} ${deck.id} ${question.id}: ${answerNote}`,
        );
      }
    }

    if (questions.length !== index.questionCount) {
      throw new Error(
        `${subject.title} ${deck.id}の問題数が索引と一致しません（${questions.length}/${index.questionCount}）。`,
      );
    }
  }

  totalQuestions += subjectQuestions;
  totalAnswerNotes += subjectAnswerNotes;
  summaries.push(
    `${subject.title}: ${subjectQuestions}問を確認、補足文${subjectAnswerNotes}件`,
  );
}

console.log(summaries.join("\n"));
if (targetText) {
  console.log(`指定文の一致: ${matches.length}件`);
  if (matches.length > 0) {
    console.log(matches.join("\n"));
  }
}
console.log(
  `Cloudflare補足文検査完了: 全${catalog.subjects.length}科目・${totalQuestions}問を確認、補足文${totalAnswerNotes}件`,
);
