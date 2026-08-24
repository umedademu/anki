import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, requiredHeaders } from "./build-learning-data.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const goroawaseMasterApiBase = "https://goroawase-master.com/wp-json/wp/v2";
const worldHistoryWixBase = "https://adx50150.wixsite.com/sekaishi-goro";
const japaneseHistoryWixBase = "https://adx50150.wixsite.com/nihonshi-goro";
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

const wixSites = [
  {
    id: "sekaishi-goro",
    subjectId: "world-history",
    baseUrl: worldHistoryWixBase,
    expectedItemCount: 430,
    excludedPaths: new Set(["/sekaishi-goro/chart"]),
  },
  {
    id: "nihonshi-goro",
    subjectId: "japanese-history",
    baseUrl: japaneseHistoryWixBase,
    expectedItemCount: 200,
    excludedPaths: new Set(["/nihonshi-goro/periods"]),
  },
];

export function decodeHtml(value) {
  return String(value ?? "")
    .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/giu, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'");
}

function cleanText(value) {
  return decodeHtml(value)
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function htmlLines(value) {
  return decodeHtml(
    String(value ?? "")
      .replace(/<rt[^>]*>.*?<\/rt>/gsu, "")
      .replace(/<script[^>]*>.*?<\/script>/gsu, "")
      .replace(/<style[^>]*>.*?<\/style>/gsu, "")
      .replace(/<br\s*\/?\s*>/giu, "\n")
      .replace(/<\/(?:p|li|h[1-6])>/giu, "\n")
      .replace(/<[^>]+>/gsu, ""),
  )
    .split(/[\r\n]+/u)
    .map(cleanText)
    .filter(Boolean);
}

export function extractMasterMnemonic(content) {
  const match = String(content ?? "").match(
    /<div class="cap_box_ttl"><span>語呂合わせ<\/span><\/div><div class="cap_box_content">\s*<p[^>]*>(.*?)<\/p>/su,
  );
  if (!match) return "";
  return cleanText(
    match[1]
      .replace(/<rt>.*?<\/rt>/gsu, "")
      .replace(/<[^>]+>/gsu, ""),
  );
}

export function parseMasterTitle(title) {
  const decodedTitle = cleanText(title);
  const match = decodedTitle.match(/^((?:紀元前|前)?\d+年(?:頃)?)\s+(.+)$/u);
  return match ? { date: match[1], event: match[2] } : null;
}

export function normalizeDate(value) {
  return cleanText(value)
    .replaceAll("**", "")
    .replace(/^紀元前/u, "前")
    .replace(/^BC\s*/iu, "前")
    .replace(/\s+/gu, "")
    .trim();
}

function dateKey(value) {
  const normalized = normalizeDate(value);
  const year = normalized.match(/\d+/u)?.[0] ?? "";
  return { year, beforeCommonEra: normalized.startsWith("前") };
}

export function answerContainsDate(answer, date) {
  const { year, beforeCommonEra } = dateKey(date);
  if (!year) return false;
  const normalizedAnswer = cleanText(answer)
    .replaceAll("**", "")
    .replaceAll("紀元前", "前")
    .replace(/\s+/gu, "");
  const pattern = beforeCommonEra
    ? new RegExp(`前${year}(?=年|頃|代|世紀|千年紀|[〜～~）)]|$)`, "u")
    : new RegExp(
        `(?<!前)(?<![0-9])${year}(?=年|頃|代|世紀|千年紀|[〜～~）)]|$)`,
        "u",
      );
  return pattern.test(normalizedAnswer);
}

export function parseWixDateExpression(value) {
  const normalized = cleanText(value)
    .replace(/B\.?C\.?/giu, "BC")
    .replace(/紀元前/gu, "BC")
    .replace(/[（(][^）)]*[）)]/gu, "")
    .replace(/[‐‑‒–—―−]/gu, "-");
  const matches = [
    ...normalized.matchAll(
      /(BC|前)?\s*(\d{1,4})(?=\s*年|\s*[-〜～~/・]|\s*$)/giu,
    ),
  ];
  let inheritedBeforeCommonEra = false;
  const dates = [];
  for (const match of matches) {
    const explicitBeforeCommonEra = Boolean(match[1]);
    if (dates.length === 0) inheritedBeforeCommonEra = explicitBeforeCommonEra;
    const beforeCommonEra = explicitBeforeCommonEra || inheritedBeforeCommonEra;
    const year = String(Number(match[2]));
    if (!year || dates.some((date) => date.year === year && date.beforeCommonEra === beforeCommonEra)) {
      continue;
    }
    dates.push({
      year,
      beforeCommonEra,
      label: `${beforeCommonEra ? "前" : ""}${year}年`,
    });
  }
  return dates;
}

export function parseWixPageItems(
  html,
  { subjectId, url, sourceId = "wix" },
) {
  const items = [];
  const entryPattern =
    /<div[^>]*data-testid="richTextElement"[^>]*>([\s\S]*?)<\/div>/gu;
  for (const match of String(html ?? "").matchAll(entryPattern)) {
    const lines = htmlLines(match[1]);
    const dateLine = lines.find((line) => line.startsWith("●"));
    const mnemonicLine = lines.find(
      (line) => line.startsWith("☆") && !line.startsWith("☆暗唱"),
    );
    if (!dateLine || !mnemonicLine) continue;
    const dateMatch = dateLine.match(/^●\s*([^:：]+)[：:]\s*(.+)$/u);
    if (!dateMatch) {
      throw new Error(`${url}の年号行を解析できません: ${dateLine}`);
    }
    const dates = parseWixDateExpression(dateMatch[1]);
    if (dates.length === 0) {
      throw new Error(`${url}の対象年を解析できません: ${dateLine}`);
    }
    const eventDescription = cleanText(dateMatch[2]);
    const event = eventDescription;
    const mnemonic = cleanText(mnemonicLine.replace(/^☆\s*/u, ""));
    items.push({
      sourceId,
      subjectId,
      dates,
      event,
      eventDescription,
      mnemonic,
      url,
      formattedMnemonic: formatWixMnemonic({ dates, event, mnemonic }),
    });
  }
  return items;
}

export function formatMasterMnemonic(date, mnemonic) {
  const normalizedMnemonic = cleanText(mnemonic);
  const match = normalizedMnemonic.match(/^(.*?)\s*([（(][^）)]+[）)])(.*)$/u);
  if (!match || !/\d/u.test(match[2])) {
    throw new Error(`数字との対応を取り出せない語呂合わせです: ${mnemonic}`);
  }
  const phrase = match[1].replace(/[「」『』]/gu, "").trim();
  if (!phrase) {
    throw new Error(`数字に対応する読みが空です: ${mnemonic}`);
  }
  return `${date}：「${phrase}」${match[2]}${match[3]}`;
}

export function formatWixMnemonic({ dates, event, mnemonic }) {
  const dateLabel = dates.map((date) => date.label).join("〜");
  const marker = dates
    .map((date) => date.label.replace(/年$/u, ""))
    .join("〜");
  return `${dateLabel}：「${cleanText(mnemonic)}」（${marker}）${cleanText(event)}`;
}

export function normalizeEvent(value) {
  return cleanText(value)
    .replace(/[\s・･「」『』（）()\[\]【】〈〉《》、，,。.\-―‐〜～=＝]/gu, "")
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

function questionList(term) {
  return Object.values(term?.stages ?? {}).flat();
}

function itemMatchesQuestion(item, question) {
  return item.dates.some((date) => answerContainsDate(question.answer, date.label));
}

function siteItemSortValue(item) {
  const firstDate = item.dates[0];
  const signedYear = Number(firstDate?.year ?? 0) * (firstDate?.beforeCommonEra ? -1 : 1);
  const sourceOrder = item.sourceId === "goroawase-master" ? 0 : 1;
  return [signedYear, sourceOrder, item.formattedMnemonic];
}

function compareSiteItems(left, right) {
  const leftValue = siteItemSortValue(left);
  const rightValue = siteItemSortValue(right);
  return (
    leftValue[0] - rightValue[0] ||
    leftValue[1] - rightValue[1] ||
    leftValue[2].localeCompare(rightValue[2], "ja")
  );
}

export function mnemonicQualityScore(item, term) {
  const phrase = cleanText(item.mnemonic);
  const compactPhrase = phrase.replace(/\s+/gu, "");
  const normalizedPhrase = normalizeEvent(phrase);
  const names = [term?.term, ...(term?.aliases ?? [])]
    .map(normalizeEvent)
    .filter(Boolean);
  let score = item.sourceId === "goroawase-master" ? 20 : 0;
  if (names.some((name) => normalizedPhrase.includes(name))) score += 35;
  if (compactPhrase.length >= 7 && compactPhrase.length <= 32) {
    score += 24 - Math.abs(18 - compactPhrase.length);
  } else {
    score -= Math.abs(18 - compactPhrase.length);
  }
  if (/[?？!！]/u.test(phrase)) score -= 4;
  if (/\[[^\]]+\]/u.test(phrase)) score -= 6;
  if (compactPhrase.length > 42) score -= compactPhrase.length - 42;
  return score;
}

function selectBestSiteItems(items, term) {
  const itemsByDate = new Map();
  for (const item of items) {
    const key = item.dates.map((date) => date.label).join("〜");
    const candidates = itemsByDate.get(key) ?? [];
    candidates.push(item);
    itemsByDate.set(key, candidates);
  }
  return [...itemsByDate.values()]
    .map((candidates) =>
      [...candidates].sort(
        (left, right) =>
          mnemonicQualityScore(right, term) - mnemonicQualityScore(left, term) ||
          compareSiteItems(left, right),
      )[0],
    )
    .sort(compareSiteItems);
}

function formatSiteItems(items, term) {
  const selectedItems = selectBestSiteItems(items, term);
  return {
    selectedItems,
    value: selectedItems.map((item) => item.formattedMnemonic).join("|"),
  };
}

export function createApprovedMnemonicPlan(siteItems, remoteTerms) {
  const desiredByQuestionId = new Map();
  const matchedSiteItems = new Set();
  const selectedSiteItems = new Set();
  const matchedTerms = new Set();
  const matches = [];
  for (const remote of remoteTerms) {
    const questions = questionList(remote.term);
    const matchedForTerm = [];
    const matchedByQuestionId = new Map();
    for (const item of siteItems) {
      if (item.subjectId !== remote.subjectId) continue;
      const eventText = `${item.event} ${item.eventDescription}`;
      if (!eventMatchesTerm(eventText, remote.term)) continue;
      const matchingQuestions = questions.filter((question) =>
        itemMatchesQuestion(item, question),
      );
      if (matchingQuestions.length === 0) continue;
      matchedSiteItems.add(item);
      matchedTerms.add(`${remote.subjectId}\0${remote.term.id}`);
      matchedForTerm.push(item);
      for (const question of matchingQuestions) {
        const questionItems = matchedByQuestionId.get(question.id) ?? [];
        questionItems.push(item);
        matchedByQuestionId.set(question.id, questionItems);
      }
      matches.push({
        subjectId: remote.subjectId,
        termId: remote.term.id,
        term: remote.term.term,
        questionIds: matchingQuestions.map((question) => question.id),
        siteItem: item,
      });
    }
    for (const question of questions) {
      const desiredItems =
        question.stage === "integrated"
          ? matchedForTerm
          : matchedByQuestionId.get(question.id) ?? [];
      const formatted = formatSiteItems(desiredItems, remote.term);
      desiredByQuestionId.set(question.id, formatted.value);
      for (const item of formatted.selectedItems) selectedSiteItems.add(item);
    }
  }
  return {
    desiredByQuestionId,
    matchedSiteItems,
    selectedSiteItems,
    matchedTerms,
    matches,
  };
}

function encodeCsvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function serializeCsv(rows, newline) {
  return `${rows.map((row) => row.map(encodeCsvCell).join(",")).join(newline)}${newline}`;
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`${url}を取得できませんでした（${response.status}）。`);
  }
  return { value: await response.text(), headers: response.headers };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`${url}を取得できませんでした（${response.status}）。`);
  }
  return { value: await response.json(), headers: response.headers };
}

function discoverWixPageUrls(homeHtml, site) {
  const base = new URL(site.baseUrl);
  const urls = new Set();
  for (const match of String(homeHtml ?? "").matchAll(/href="([^"]+)"/gu)) {
    const value = decodeHtml(match[1]);
    let candidate;
    try {
      candidate = new URL(value, base);
    } catch {
      continue;
    }
    if (
      candidate.origin !== base.origin ||
      !candidate.pathname.startsWith(base.pathname) ||
      candidate.pathname === base.pathname ||
      site.excludedPaths.has(candidate.pathname)
    ) {
      continue;
    }
    candidate.search = "";
    candidate.hash = "";
    urls.add(candidate.href.replace(/\/$/u, ""));
  }
  return [...urls].sort();
}

async function fetchWixSiteItems(site) {
  const homeHtml = (await fetchText(site.baseUrl)).value;
  const pageUrls = discoverWixPageUrls(homeHtml, site);
  const pages = await Promise.all(
    pageUrls.map(async (url) => ({ url, html: (await fetchText(url)).value })),
  );
  const items = pages.flatMap(({ url, html }) =>
    parseWixPageItems(html, {
      subjectId: site.subjectId,
      sourceId: site.id,
      url,
    }),
  );
  if (items.length !== site.expectedItemCount) {
    throw new Error(
      `${site.baseUrl}は${site.expectedItemCount}句の想定に対して${items.length}句しか取得できませんでした。`,
    );
  }
  return items;
}

async function fetchGoroawaseMasterItems() {
  const fields = "id,link,title,categories,content";
  const first = await fetchJson(
    `${goroawaseMasterApiBase}/posts?per_page=100&page=1&_fields=${fields}`,
    { headers: { "User-Agent": "AnkiLearningDataMaintainer/1.0" } },
  );
  const totalPages = Number(first.headers.get("x-wp-totalpages") ?? 1);
  const pages = [first.value];
  for (let page = 2; page <= totalPages; page += 1) {
    pages.push(
      (
        await fetchJson(
          `${goroawaseMasterApiBase}/posts?per_page=100&page=${page}&_fields=${fields}`,
          { headers: { "User-Agent": "AnkiLearningDataMaintainer/1.0" } },
        )
      ).value,
    );
  }
  return pages
    .flat()
    .map((post) => {
      const subjectId = post.categories.includes(japaneseHistoryCategoryId)
        ? "japanese-history"
        : "world-history";
      const title = decodeHtml(post.title.rendered);
      const parsedTitle = parseMasterTitle(title);
      const mnemonic = extractMasterMnemonic(post.content.rendered);
      if (!parsedTitle || !mnemonic) return null;
      const dates = parseWixDateExpression(parsedTitle.date);
      if (dates.length !== 1) return null;
      return {
        sourceId: "goroawase-master",
        subjectId,
        dates,
        event: parsedTitle.event,
        eventDescription: parsedTitle.event,
        mnemonic,
        url: post.link,
        formattedMnemonic: formatMasterMnemonic(parsedTitle.date, mnemonic),
      };
    })
    .filter(Boolean);
}

async function fetchApprovedSiteItems() {
  const [masterItems, ...wixItemLists] = await Promise.all([
    fetchGoroawaseMasterItems(),
    ...wixSites.map(fetchWixSiteItems),
  ]);
  return [...masterItems, ...wixItemLists.flat()];
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

async function updateSourceCsvFiles(remoteTerms, desiredByQuestionId) {
  const remoteQuestionById = new Map();
  for (const remote of remoteTerms) {
    for (const question of questionList(remote.term)) {
      remoteQuestionById.set(question.id, {
        subjectId: remote.subjectId,
        currentMnemonic: String(question.yearMnemonic ?? ""),
      });
    }
  }
  let changedRows = 0;
  let clearedRows = 0;
  let populatedRows = 0;
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
    if (serializeCsv(rows, newline) !== body) {
      throw new Error(
        `${path.basename(filePath)}は内容を保ったまま再保存できないため処理を中止しました。`,
      );
    }
    const questionIdIndex = header.indexOf("question_id");
    const mnemonicIndex = header.indexOf("year_mnemonic");
    let fileChanged = false;
    for (const row of rows.slice(1)) {
      const questionId = row[questionIdIndex];
      const remote = remoteQuestionById.get(questionId);
      if (!remote || remote.subjectId !== subjectId) continue;
      verifiedQuestionIds.add(questionId);
      if (row[mnemonicIndex] !== remote.currentMnemonic) {
        throw new Error(
          `${questionId}の手元とCloudflareの語呂合わせが一致しません。`,
        );
      }
      const desiredMnemonic = desiredByQuestionId.get(questionId) ?? "";
      if (row[mnemonicIndex] === desiredMnemonic) continue;
      if (row[mnemonicIndex] && !desiredMnemonic) clearedRows += 1;
      if (desiredMnemonic) populatedRows += 1;
      row[mnemonicIndex] = desiredMnemonic;
      changedRows += 1;
      fileChanged = true;
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
  const missingQuestionIds = [...remoteQuestionById.keys()].filter(
    (questionId) => !verifiedQuestionIds.has(questionId),
  );
  if (missingQuestionIds.length > 0) {
    throw new Error(
      `Cloudflareにある問題が元CSVにありません: ${missingQuestionIds.join(", ")}`,
    );
  }
  return { changedRows, clearedRows, populatedRows, changedFiles };
}

export async function main() {
  const [siteItems, remoteTerms] = await Promise.all([
    fetchApprovedSiteItems(),
    fetchCloudflareTerms(),
  ]);
  const plan = createApprovedMnemonicPlan(siteItems, remoteTerms);
  const updateResult = await updateSourceCsvFiles(
    remoteTerms,
    plan.desiredByQuestionId,
  );
  const sourceCounts = Object.fromEntries(
    ["goroawase-master", "sekaishi-goro", "nihonshi-goro"].map((sourceId) => [
      sourceId,
      siteItems.filter((item) => item.sourceId === sourceId).length,
    ]),
  );
  const desiredQuestionCount = [...plan.desiredByQuestionId.values()].filter(Boolean)
    .length;
  const desiredMnemonicCount = new Set(
    [...plan.desiredByQuestionId.values()]
      .flatMap((value) => value.split("|"))
      .filter(Boolean),
  ).size;
  const matchedSourceCounts = Object.fromEntries(
    ["goroawase-master", "sekaishi-goro", "nihonshi-goro"].map((sourceId) => [
      sourceId,
      [...plan.matchedSiteItems].filter((item) => item.sourceId === sourceId)
        .length,
    ]),
  );
  const selectedSourceCounts = Object.fromEntries(
    ["goroawase-master", "sekaishi-goro", "nihonshi-goro"].map((sourceId) => [
      sourceId,
      [...plan.selectedSiteItems].filter((item) => item.sourceId === sourceId)
        .length,
    ]),
  );
  const termIdsBySiteItem = new Map();
  for (const match of plan.matches) {
    const termIds = termIdsBySiteItem.get(match.siteItem) ?? new Set();
    termIds.add(`${match.subjectId}\0${match.termId}`);
    termIdsBySiteItem.set(match.siteItem, termIds);
  }
  const multipleTermItemCount = [...termIdsBySiteItem.values()].filter(
    (termIds) => termIds.size > 1,
  ).length;
  const worldTerms = new Set(
    [...plan.matchedTerms]
      .filter((key) => key.startsWith("world-history\0"))
      .map((key) => key.split("\0")[1]),
  );
  const japaneseTerms = new Set(
    [...plan.matchedTerms]
      .filter((key) => key.startsWith("japanese-history\0"))
      .map((key) => key.split("\0")[1]),
  );
  console.log(
    `許可済み3サイトを取得しました: 語呂合わせマスター${sourceCounts["goroawase-master"]}件、世界史サイト${sourceCounts["sekaishi-goro"]}句、日本史サイト${sourceCounts["nihonshi-goro"]}句`,
  );
  console.log(
    `Cloudflare上の世界史・日本史${remoteTerms.length}語と照合しました: 世界史${worldTerms.size}語、日本史${japaneseTerms.size}語、${desiredQuestionCount}問・${desiredMnemonicCount}種類`,
  );
  console.log(
    `既存カードとの一致: 語呂合わせマスター${matchedSourceCounts["goroawase-master"]}件、世界史サイト${matchedSourceCounts["sekaishi-goro"]}句、日本史サイト${matchedSourceCounts["nihonshi-goro"]}句、複数用語候補${multipleTermItemCount}件`,
  );
  console.log(
    `品質比較後の採用: 語呂合わせマスター${selectedSourceCounts["goroawase-master"]}件、世界史サイト${selectedSourceCounts["sekaishi-goro"]}句、日本史サイト${selectedSourceCounts["nihonshi-goro"]}句`,
  );
  console.log(
    `変更${updateResult.changedRows}行（削除${updateResult.clearedRows}行、掲載語呂設定${updateResult.populatedRows}行、${updateResult.changedFiles}ファイル）`,
  );
  console.log(
    applyChanges
      ? "元CSVへ反映しました。"
      : "予行表示のみです。反映するには--applyを付けてください。",
  );
  if (process.argv.includes("--verbose")) {
    for (const match of plan.matches) {
      console.log(
        `${match.subjectId} ${match.termId} ${match.term}: ${match.siteItem.formattedMnemonic} (${match.siteItem.url})`,
      );
    }
    for (const [item, termIds] of termIdsBySiteItem) {
      if (termIds.size <= 1) continue;
      console.log(
        `複数用語候補 ${[...termIds].join(", ")}: ${item.formattedMnemonic} (${item.url})`,
      );
    }
    const unmatchedItems = siteItems.filter(
      (item) => !plan.matchedSiteItems.has(item),
    );
    console.log(`既存カードに一致しない掲載語呂: ${unmatchedItems.length}件`);
    for (const item of unmatchedItems) {
      console.log(`${item.subjectId} ${item.event}: ${item.url}`);
    }
  }
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main();
}
