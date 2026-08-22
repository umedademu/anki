import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, requiredHeaders } from "./build-learning-data.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteApiBase = "https://goroawase-master.com/wp-json/wp/v2";
const cloudflareBaseUrl =
  "https://pub-76ffbe2829114a5cbaa433db45872267.r2.dev";
const productionOrigin = "https://anki-ume.vercel.app";
const japaneseHistoryCategoryId = 6;
const applyChanges = process.argv.includes("--apply");

const subjectDirectories = new Map([
  ["world-history", path.join(projectRoot, "data", "source", "world-history")],
  [
    "japanese-history",
    path.join(projectRoot, "data", "source", "japanese-history"),
  ],
]);

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'");
}

export function extractSiteMnemonic(content) {
  const match = String(content ?? "").match(
    /<div class="cap_box_ttl"><span>語呂合わせ<\/span><\/div><div class="cap_box_content">\s*<p[^>]*>(.*?)<\/p>/su,
  );
  if (!match) return "";
  return decodeHtml(
    match[1]
      .replace(/<rt>.*?<\/rt>/gsu, "")
      .replace(/<[^>]+>/gsu, ""),
  )
    .replace(/\s+/g, " ")
    .trim();
}

export function parseSiteTitle(title) {
  const decodedTitle = decodeHtml(title).trim();
  const match = decodedTitle.match(
    /^((?:紀元前|前)?\d+年(?:頃)?)\s+(.+)$/u,
  );
  return match ? { date: match[1], event: match[2] } : null;
}

export function normalizeDate(value) {
  return String(value ?? "")
    .replaceAll("**", "")
    .replace(/^紀元前/u, "前")
    .replace(/^BC\s*/iu, "前")
    .replace(/\s+/g, "")
    .trim();
}

export function normalizeEvent(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\s・･「」『』（）()\[\]【】〈〉《》、，,。.\-―‐〜～]/g, "")
    .toLowerCase();
}

export function eventMatchesTerm(event, term) {
  const normalizedEvent = normalizeEvent(event);
  return [term?.term, ...(term?.aliases ?? [])]
    .map(normalizeEvent)
    .filter(Boolean)
    .some((name) =>
      name.length === 1
        ? normalizedEvent.startsWith(name)
        : normalizedEvent.includes(name) || name.includes(normalizedEvent),
    );
}

export function formatPreferredMnemonic(date, mnemonic) {
  const normalizedMnemonic = String(mnemonic ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const match = normalizedMnemonic.match(/^(.*?)\s*([（(][^）)]+[）)])(.*)$/u);
  if (!match || !/\d/u.test(match[2])) {
    throw new Error(`数字との対応を取り出せない語呂合わせです: ${mnemonic}`);
  }
  const phrase = match[1].replace(/[「」『』]/g, "").trim();
  if (!phrase) {
    throw new Error(`数字に対応する読みが空です: ${mnemonic}`);
  }
  return `${date}：「${phrase}」${match[2]}${match[3]}`;
}

function dateKey(value) {
  const normalized = normalizeDate(value).normalize("NFKC");
  const year = normalized.match(/\d+/u)?.[0] ?? "";
  return { year, beforeCommonEra: normalized.startsWith("前") };
}

export function answerContainsDate(answer, date) {
  const { year, beforeCommonEra } = dateKey(date);
  if (!year) return false;
  const normalizedAnswer = String(answer ?? "")
    .replaceAll("**", "")
    .normalize("NFKC")
    .replaceAll("紀元前", "前")
    .replace(/\s+/g, "");
  const pattern = beforeCommonEra
    ? new RegExp(
        `前${year}(?=年|頃|代|世紀|千年紀|[〜～~）)]|$)`,
        "u",
      )
    : new RegExp(
        `(?<!前)(?<![0-9])${year}(?=年|頃|代|世紀|千年紀|[〜～~）)]|$)`,
        "u",
      );
  return pattern.test(normalizedAnswer);
}

function mnemonicPhraseAndMarker(mnemonic) {
  const match = String(mnemonic ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .match(/^(.*?)\s*([（(][^）)]+[）)])(.*)$/u);
  return match && /\d/u.test(match[2])
    ? { phrase: match[1].replace(/[「」『』]/g, "").trim(), marker: match[2] }
    : null;
}

export function mergePreferredMnemonic(oldMnemonic, date, siteMnemonic) {
  const preferred = mnemonicPhraseAndMarker(siteMnemonic);
  if (!preferred?.phrase) return "";
  const quotedPhrasePattern = /「([^」]+)」\s*([（(][^）)]+[）)])/gu;
  let matched = false;
  const merged = String(oldMnemonic).replace(
    quotedPhrasePattern,
    (whole, _phrase, marker) => {
      const markerYearCount =
        marker.normalize("NFKC").match(/\d+/gu)?.length ?? 0;
      if (
        matched ||
        markerYearCount !== 1 ||
        !answerContainsDate(marker, date)
      ) {
        return whole;
      }
      matched = true;
      return `「${preferred.phrase}」${preferred.marker}`;
    },
  );
  return matched ? merged : "";
}

function questionList(term) {
  return Object.values(term?.stages ?? {}).flat();
}

export function createReplacements(siteItems, remoteTerms) {
  const replacements = new Map();
  const matchedArticles = new Set();
  const matchedTerms = new Set();
  for (const siteItem of siteItems) {
    const parsedTitle = parseSiteTitle(siteItem.title);
    if (!parsedTitle) continue;
    for (const remote of remoteTerms) {
      if (
        remote.subjectId !== siteItem.subjectId ||
        !eventMatchesTerm(parsedTitle.event, remote.term)
      ) {
        continue;
      }
      const matchingQuestions = questionList(remote.term).filter((question) => {
        const exactDate =
          normalizeDate(question.answer) === normalizeDate(parsedTitle.date);
        return (
          exactDate ||
          (question.type === "time" &&
            answerContainsDate(question.answer, parsedTitle.date))
        );
      });
      if (matchingQuestions.length === 0) continue;
      const oldMnemonics = new Set(
        matchingQuestions.map((question) => question.yearMnemonic.trim()),
      );
      if (oldMnemonics.size !== 1 || oldMnemonics.has("")) {
        throw new Error(
          `${remote.term.id}の${parsedTitle.date}に統一した語呂合わせがありません。`,
        );
      }
      const oldMnemonic = [...oldMnemonics][0];
      const exactDate = matchingQuestions.every(
        (question) =>
          normalizeDate(question.answer) === normalizeDate(parsedTitle.date),
      );
      const key = `${remote.subjectId}\0${remote.term.id}\0${oldMnemonic}`;
      const existing = replacements.get(key);
      const replacementBase = existing?.newMnemonic ?? oldMnemonic;
      const newMnemonic = exactDate
        ? formatPreferredMnemonic(parsedTitle.date, siteItem.mnemonic)
        : mergePreferredMnemonic(
            replacementBase,
            parsedTitle.date,
            siteItem.mnemonic,
          );
      if (!newMnemonic) continue;
      matchedArticles.add(siteItem.url);
      matchedTerms.add(`${remote.subjectId}\0${remote.term.id}`);
      if (newMnemonic === replacementBase) continue;
      const replacement = {
        subjectId: remote.subjectId,
        termId: remote.term.id,
        term: remote.term.term,
        questionIds: [
          ...new Set([
            ...(existing?.questionIds ?? []),
            ...matchingQuestions.map((question) => question.id),
          ]),
        ],
        oldMnemonic,
        newMnemonic,
        articleTitles: [
          ...new Set([...(existing?.articleTitles ?? []), siteItem.title]),
        ],
        articleUrls: [
          ...new Set([...(existing?.articleUrls ?? []), siteItem.url]),
        ],
      };
      replacements.set(key, replacement);
    }
  }
  return {
    replacements: [...replacements.values()],
    matchedArticles,
    matchedTerms,
  };
}

function encodeCsvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function serializeCsv(rows, newline) {
  return `${rows.map((row) => row.map(encodeCsvCell).join(",")).join(newline)}${newline}`;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`${url}を取得できませんでした（${response.status}）。`);
  }
  return { value: await response.json(), headers: response.headers };
}

async function fetchSiteItems() {
  const fields = "id,link,title,categories,content";
  const first = await fetchJson(
    `${siteApiBase}/posts?per_page=100&page=1&_fields=${fields}`,
    { headers: { "User-Agent": "AnkiLearningDataMaintainer/1.0" } },
  );
  const totalPages = Number(first.headers.get("x-wp-totalpages") ?? 1);
  const pages = [first.value];
  for (let page = 2; page <= totalPages; page += 1) {
    pages.push(
      (
        await fetchJson(
          `${siteApiBase}/posts?per_page=100&page=${page}&_fields=${fields}`,
          { headers: { "User-Agent": "AnkiLearningDataMaintainer/1.0" } },
        )
      ).value,
    );
  }
  return pages
    .flat()
    .map((post) => ({
      subjectId: post.categories.includes(japaneseHistoryCategoryId)
        ? "japanese-history"
        : "world-history",
      title: decodeHtml(post.title.rendered),
      mnemonic: extractSiteMnemonic(post.content.rendered),
      url: post.link,
    }))
    .filter((item) => item.mnemonic && parseSiteTitle(item.title));
}

async function fetchCloudflareTerms() {
  const cacheBust = () => `sync=${Date.now()}-${Math.random()}`;
  const headers = { Origin: productionOrigin };
  const catalog = (
    await fetchJson(`${cloudflareBaseUrl}/index.json?${cacheBust()}`, { headers })
  ).value;
  const remoteTerms = [];
  for (const subject of catalog.subjects.filter((entry) =>
    subjectDirectories.has(entry.id),
  )) {
    for (const deck of subject.decks) {
      const index = (
        await fetchJson(
          `${cloudflareBaseUrl}/${deck.indexPath}?${cacheBust()}`,
          { headers },
        )
      ).value;
      const chunks = await Promise.all(
        index.chunks.map(async (chunk) =>
          (
            await fetchJson(
              `${cloudflareBaseUrl}/${chunk.path}?${cacheBust()}`,
              { headers },
            )
          ).value,
        ),
      );
      for (const term of chunks.flatMap((chunk) => chunk.terms)) {
        remoteTerms.push({ subjectId: subject.id, term });
      }
    }
  }
  return remoteTerms;
}

async function sourceCsvPaths() {
  const entries = [];
  for (const [subjectId, directory] of subjectDirectories) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith(".csv")) {
        entries.push({ subjectId, filePath: path.join(directory, entry.name) });
      }
    }
  }
  return entries;
}

async function updateSourceCsvFiles(replacements) {
  let changedRows = 0;
  let changedFiles = 0;
  const verifiedQuestionIds = new Set();
  for (const { subjectId, filePath } of await sourceCsvPaths()) {
    const original = await readFile(filePath, "utf8");
    const hasBom = original.startsWith("\uFEFF");
    const body = hasBom ? original.slice(1) : original;
    const newline = body.includes("\r\n") ? "\r\n" : "\n";
    const rows = parseCsv(body);
    const header = rows[0].map((value) => value.trim());
    if (
      header.length !== requiredHeaders.length ||
      header.some((value, index) => value !== requiredHeaders[index])
    ) {
      throw new Error(`${path.basename(filePath)}の見出しが25列形式ではありません。`);
    }
    const serializedOriginal = serializeCsv(rows, newline);
    if (serializedOriginal !== body) {
      throw new Error(
        `${path.basename(filePath)}は内容を保ったまま再保存できないため処理を中止しました。`,
      );
    }
    const termIdIndex = header.indexOf("term_id");
    const questionIdIndex = header.indexOf("question_id");
    const mnemonicIndex = header.indexOf("year_mnemonic");
    const fileReplacements = replacements.filter(
      (replacement) => replacement.subjectId === subjectId,
    );
    let fileChanged = false;
    for (const replacement of fileReplacements) {
      for (const row of rows.slice(1)) {
        if (row[termIdIndex] !== replacement.termId) continue;
        if (replacement.questionIds.includes(row[questionIdIndex])) {
          if (row[mnemonicIndex] !== replacement.oldMnemonic) {
            throw new Error(
              `${row[questionIdIndex]}の手元とCloudflareの語呂合わせが一致しません。`,
            );
          }
          verifiedQuestionIds.add(row[questionIdIndex]);
        }
        const mnemonics = row[mnemonicIndex]
          .split("|")
          .map((mnemonic) => mnemonic.trim());
        const nextMnemonics = mnemonics.map((mnemonic) =>
          mnemonic === replacement.oldMnemonic
            ? replacement.newMnemonic
            : mnemonic,
        );
        if (nextMnemonics.join("|") !== row[mnemonicIndex]) {
          row[mnemonicIndex] = nextMnemonics.join("|");
          changedRows += 1;
          fileChanged = true;
        }
      }
    }
    if (fileChanged) {
      changedFiles += 1;
      if (applyChanges) {
        await writeFile(
          filePath,
          `${hasBom ? "\uFEFF" : ""}${serializeCsv(rows, newline)}`,
          "utf8",
        );
      }
    }
  }
  const expectedQuestionIds = new Set(
    replacements.flatMap((replacement) => replacement.questionIds),
  );
  const missingQuestionIds = [...expectedQuestionIds].filter(
    (questionId) => !verifiedQuestionIds.has(questionId),
  );
  if (missingQuestionIds.length > 0) {
    throw new Error(
      `Cloudflareにある問題が元CSVにありません: ${missingQuestionIds.join(", ")}`,
    );
  }
  return { changedRows, changedFiles };
}

export async function main() {
  const [siteItems, remoteTerms] = await Promise.all([
    fetchSiteItems(),
    fetchCloudflareTerms(),
  ]);
  const { replacements, matchedArticles, matchedTerms } = createReplacements(
    siteItems,
    remoteTerms,
  );
  const { changedRows, changedFiles } = await updateSourceCsvFiles(replacements);
  const worldTerms = new Set(
    [...matchedTerms]
      .filter((key) => key.startsWith("world-history\0"))
      .map((key) => key.split("\0")[1]),
  );
  const japaneseTerms = new Set(
    [...matchedTerms]
      .filter((key) => key.startsWith("japanese-history\0"))
      .map((key) => key.split("\0")[1]),
  );
  console.log(
    `指定サイト${siteItems.length}記事とCloudflare上の世界史・日本史${remoteTerms.length}語を照合しました。`,
  );
  console.log(
    `一致: ${matchedArticles.size}記事、世界史${worldTerms.size}語、日本史${japaneseTerms.size}語、変更${changedRows}行（${changedFiles}ファイル）`,
  );
  console.log(
    applyChanges
      ? "元CSVへ反映しました。"
      : "予行表示のみです。反映するには--applyを付けてください。",
  );
  if (process.argv.includes("--verbose")) {
    console.log(`一致した用語: ${[...matchedTerms].join(", ")}`);
    for (const replacement of replacements) {
      console.log(
        `${replacement.subjectId} ${replacement.termId} ${replacement.articleTitles.join(" / ")}: ${replacement.oldMnemonic} → ${replacement.newMnemonic}`,
      );
    }
  }
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main();
}
