import {
  createHistorySpeechReadings,
  prepareMnemonicSpeechText,
  prepareSpeechText,
} from "../public/speech.js";
import { requiredHistoryReadings } from "../public/reading-rules.js";

const dataBaseUrl = "https://pub-76ffbe2829114a5cbaa433db45872267.r2.dev";
const productionOrigin = "https://anki-ume.vercel.app";
const historyFields = [
  ["問題", "prompt"],
  ["回答", "answer"],
  ["語呂合わせ", "yearMnemonic"],
];
const remainingReadingPattern = /\([ぁ-ゖー]+(?:[・\s][ぁ-ゖー]+)*\)/u;
const previousAnnotatedReadingPattern =
  /([\p{Script=Han}\p{Script=Katakana}\p{Script=Latin}々ヶー＝・0-9０-９]+)\(([\p{Script=Hiragana}ー・\s]+)\)/gu;
const previousRemainingReadingPattern = /\([\p{Script=Hiragana}ー・\s]+\)/gu;

async function readCloudflareJson(relativePath) {
  const response = await fetch(
    `${dataBaseUrl}/${relativePath}?speech-audit=${Date.now()}`,
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

function speechTextFor(fieldName, value, readings) {
  const source =
    fieldName === "yearMnemonic" ? prepareMnemonicSpeechText(value) : value;
  return prepareSpeechText(source, "ja-JP", readings);
}

function previousSpeechTextFor(fieldName, value) {
  let text = String(
    fieldName === "yearMnemonic" ? prepareMnemonicSpeechText(value) : value,
  ).replaceAll("**", "");
  for (const [term, reading] of Object.entries(requiredHistoryReadings).sort(
    ([left], [right]) => right.length - left.length,
  )) {
    text = text.replaceAll(`${term}(${reading})`, reading);
  }
  return text
    .replace(previousAnnotatedReadingPattern, (_, __, reading) => reading)
    .replace(previousRemainingReadingPattern, "")
    .replace(/[\r\n]+/g, "。")
    .replace(/[|]/g, "、")
    .replace(/〜/g, "から")
    .replace(/[`#_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const catalog = await readCloudflareJson("index.json");
const historySubjects = catalog.subjects.filter(
  (subject) => subject.learningType === "history",
);
if (historySubjects.length === 0) {
  throw new Error("Cloudflare上に世界史・日本史の問題集がありません。");
}

const failures = [];
const summaries = [];
let totalQuestions = 0;
let totalFields = 0;
let totalCorrectedFields = 0;
let totalAnnotations = 0;
const correctedTermAnnotations = new Set();
const fieldSummaries = new Map(
  historyFields.map(([fieldLabel]) => [
    fieldLabel,
    { checked: 0, corrected: 0 },
  ]),
);

for (const subject of historySubjects) {
  for (const deck of deckEntriesFor(subject)) {
    const index = await readCloudflareJson(deck.indexPath);
    const chunks = await Promise.all(
      index.chunks.map((chunk) => readCloudflareJson(chunk.path)),
    );
    const terms = chunks.flatMap((chunk) => chunk.terms);
    const readings = createHistorySpeechReadings(terms);
    let questionCount = 0;
    let fieldCount = 0;
    let correctedFieldCount = 0;

    for (const term of terms) {
      for (const questions of Object.values(term.stages)) {
        for (const question of questions) {
          questionCount += 1;
          for (const [fieldLabel, fieldName] of historyFields) {
            const value = String(question[fieldName] ?? "");
            if (!value) {
              continue;
            }
            fieldCount += 1;
            fieldSummaries.get(fieldLabel).checked += 1;
            const speechText = speechTextFor(fieldName, value, readings);
            const previousSpeechText = previousSpeechTextFor(fieldName, value);
            if (speechText !== previousSpeechText) {
              correctedFieldCount += 1;
              fieldSummaries.get(fieldLabel).corrected += 1;
            }
            if (!speechText) {
              failures.push(
                `${subject.title} ${deck.id} ${question.id}の${fieldLabel}が空になりました。`,
              );
            }
            if (remainingReadingPattern.test(speechText)) {
              failures.push(
                `${subject.title} ${deck.id} ${question.id}の${fieldLabel}に読み仮名が残りました。`,
              );
            }
          }
        }
      }

      const annotation = `${term.term}(${term.reading})`;
      const annotationCount = Object.values(term.stages)
        .flat()
        .flatMap((question) =>
          historyFields.map(([, fieldName]) => String(question[fieldName] ?? "")),
        )
        .reduce(
          (count, value) => count + value.split(annotation).length - 1,
          0,
        );
      totalAnnotations += annotationCount;
      if (
        annotationCount > 0 &&
        previousSpeechTextFor("answer", annotation) !== term.reading
      ) {
        correctedTermAnnotations.add(annotation);
      }
      if (
        annotationCount > 0 &&
        prepareSpeechText(annotation, "ja-JP", readings) !== term.reading
      ) {
        failures.push(
          `${subject.title} ${deck.id}の「${annotation}」を一まとまりで読めません。`,
        );
      }
    }

    if (questionCount !== index.questionCount) {
      failures.push(
        `${subject.title} ${deck.id}の問題数が索引と一致しません（${questionCount}/${index.questionCount}）。`,
      );
    }
    totalQuestions += questionCount;
    totalFields += fieldCount;
    totalCorrectedFields += correctedFieldCount;
    summaries.push(
      `${subject.title} ${deck.id}: ${questionCount}問・${fieldCount}項目を確認、${correctedFieldCount}項目の読み上げを補正`,
    );
  }
}

if (failures.length > 0) {
  throw new AggregateError(
    failures.map((message) => new Error(message)),
    `音声読み上げ検査で${failures.length}件の問題が見つかりました。`,
  );
}

console.log(summaries.join("\n"));
console.log(
  [...fieldSummaries]
    .map(
      ([fieldLabel, summary]) =>
        `${fieldLabel}: ${summary.checked}項目を確認、${summary.corrected}項目を補正`,
    )
    .join("\n"),
);
console.log(
  `Cloudflare音声検査完了: ${totalQuestions}問・${totalFields}項目・用語読み${totalAnnotations}箇所を確認、${correctedTermAnnotations.size}種類・${totalCorrectedFields}項目の読み上げを補正`,
);
