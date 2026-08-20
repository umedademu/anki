import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  findSourcePath,
  groupTerms,
  parseCsv,
  toObjects,
  validateTerms,
} from "./build-learning-data.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const sourceDirectory = path.join(projectRoot, "data", "source", "world-history");
const imageDirectory = path.join(sourceDirectory, "term-images");
const manifestPath = path.join(sourceDirectory, "term-images.json");
const userAgent = "anki-world-history/1.0 (https://anki-ume.vercel.app/)";
const apiHeaders = { "User-Agent": userAgent };
let apiRequestQueue = Promise.resolve();
let nextApiRequestAt = 0;

const termQueryOverrides = new Map([
  ["WH-000022", "古代ギリシア ポリス"],
  ["WH-000028", "孔子"],
  ["WH-000037", "ジャイナ教"],
  ["WH-000039", "十二表法"],
  ["WH-000042", "法家"],
  ["WH-000044", "老荘思想"],
  ["WH-000043", "郡県制 中国"],
  ["WH-000054", "武帝 漢"],
  ["WH-000059", "内乱の一世紀 ローマ"],
  ["WH-000071", "九品官人法"],
  ["WH-000085", "均田制 中国"],
  ["WH-000091", "漢字文化圏"],
  ["WH-000092", "三省六部 唐"],
  ["WH-000106", "両税法 唐"],
  ["WH-000109", "クメール王朝"],
  ["WH-000111", "封建制 ヨーロッパ"],
  ["WH-000119", "イクター制"],
  ["WH-000120", "スワヒリ文明"],
  ["WH-000124", "スルターン"],
  ["WH-000127", "王安石 新法"],
  ["WH-000132", "サラーフッディーン"],
  ["WH-000139", "東南アジア イスラム化"],
  ["WH-000144", "イギリスの議会"],
  ["WH-000167", "ミッレト オスマン帝国"],
  ["WH-000174", "ヴァスコ・ダ・ガマ"],
  ["WH-000176", "商業革命 大西洋"],
  ["WH-000182", "フェルディナンド・マゼラン"],
  ["WH-000191", "主権国家体制 ヨーロッパ"],
  ["WH-000202", "三角貿易"],
  ["WH-000210", "立憲君主制"],
  ["WH-000211", "ジョン・ロック"],
  ["WH-000213", "イギリス農業革命"],
  ["WH-000219", "工場制機械工業 産業革命"],
  ["WH-000220", "ロシア 南下政策 地図"],
  ["WH-000226", "ナショナリズム"],
  ["WH-000229", "自由主義"],
  ["WH-000230", "東方問題 地図"],
  ["WH-000221", "アメリカ合衆国の独立"],
  ["WH-000231", "ラテンアメリカ独立戦争"],
  ["WH-000235", "ウィーン体制 ヨーロッパ"],
  ["WH-000237", "社会主義"],
  ["WH-000250", "帝国主義 風刺画"],
  ["WH-000253", "三国同盟 (1882年)"],
  ["WH-000257", "中国分割 風刺画"],
  ["WH-000262", "総力戦 第一次世界大戦"],
  ["WH-000265", "民族自決 ウィルソン"],
  ["WH-000266", "ヴェルサイユ体制 地図"],
  ["WH-000272", "ワシントン会議"],
  ["WH-000280", "脱植民地化 地図"],
  ["WH-000282", "冷戦 地図"],
  ["WH-000287", "北大西洋条約機構"],
  ["WH-000289", "欧州連合 統合"],
  ["WH-000292", "中ソ対立 地図"],
  ["WH-000294", "非同盟運動 地図"],
  ["WH-000297", "デタント 米ソ"],
  ["WH-000298", "オイルショック"],
  ["WH-000299", "東欧革命 1989"],
]);

const termFileOverrides = new Map([
  ["WH-000037", "Jain Prateek Chihna.svg"],
  ["WH-000039", "Twelve Tables Engraving.svg"],
  ["WH-000044", "Zhang Lu-Laozi Riding an Ox.jpg"],
  ["WH-000109", "Angkor Wat.jpg"],
  ["WH-000182", "Ferdinand Magellan.jpg"],
  ["WH-000225", "Declaration of the Rights of Man and of the Citizen in 1789.jpg"],
  ["WH-000287", "Flag of NATO.svg"],
]);

function decodeHtml(text) {
  const entities = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return String(text ?? "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (_, entity) => {
      if (entity.startsWith("#x")) {
        return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
      }
      if (entity.startsWith("#")) {
        return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
      }
      return entities[entity.toLowerCase()] ?? `&${entity};`;
    })
    .replace(/Edit this at Wikidata/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanSearchText(text) {
  return String(text ?? "")
    .replaceAll("**", "")
    .replace(/\([ぁ-ゖー・\s]+\)/g, "")
    .replace(/[「」『』]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedTitle(text) {
  return cleanSearchText(text)
    .normalize("NFKC")
    .replace(/[\s_=＝・（）()・\-—]/g, "")
    .toLowerCase();
}

function isUsefulAnswerTarget(question) {
  const answer = cleanSearchText(question.answer);
  if (!answer || answer.length > 30 || /[。、！？；;：:〜～]/.test(answer)) {
    return false;
  }
  if (/^(?:前|後|約|紀元|西暦)?\d/.test(answer) || /(?:年|世紀|頃|以降|以前)$/.test(answer)) {
    return false;
  }
  if (/(?:および|及び|ならびに|から|まで|と|、|・|\/)/.test(answer)) {
    return false;
  }
  if (["person", "actor", "place"].includes(question.type)) {
    return true;
  }
  return (
    ["content", "relation"].includes(question.type) &&
    /人物|建国者|中心人物|開祖|本名|称号|都市|都|地域|国家|王朝|文書|作品|条約|会議|組織|事件|戦闘|戦争|宗教|宗派|思想|制度|政策|文化/.test(
      question.focus,
    )
  );
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForApiSlot() {
  const turn = apiRequestQueue.then(async () => {
    const wait = Math.max(0, nextApiRequestAt - Date.now());
    if (wait > 0) await delay(wait);
    nextApiRequestAt = Date.now() + 350;
  });
  apiRequestQueue = turn.catch(() => {});
  await turn;
}

async function fetchJson(url, attempts = 7) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await waitForApiSlot();
      const response = await fetch(url, {
        headers: apiHeaders,
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status === 429) {
        const retryAfter = Number.parseInt(response.headers.get("retry-after") ?? "", 10);
        await delay(Number.isFinite(retryAfter) ? retryAfter * 1_000 : attempt * 4_000);
        continue;
      }
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await delay(Math.min(attempt * 2_000, 12_000));
      }
    }
  }
  throw lastError;
}

function apiUrl(host, parameters) {
  const url = new URL(`https://${host}/w/api.php`);
  for (const [key, value] of Object.entries({
    action: "query",
    format: "json",
    origin: "*",
    ...parameters,
  })) {
    url.searchParams.set(key, value);
  }
  return url;
}

async function commonsMetadata(fileName) {
  const data = await fetchJson(
    apiUrl("commons.wikimedia.org", {
      titles: `File:${String(fileName).replace(/^File:/i, "")}`,
      prop: "imageinfo",
      iiprop: "url|mime|mediatype|extmetadata",
      iiurlwidth: "960",
    }),
  );
  const page = Object.values(data.query?.pages ?? {})[0];
  const info = page?.imageinfo?.[0];
  return normalizeMetadata(info);
}

async function wikidataImage(query) {
  const articleData = await fetchJson(
    apiUrl("ja.wikipedia.org", {
      titles: query,
      redirects: "1",
      prop: "pageprops",
      ppprop: "wikibase_item",
    }),
  );
  const page = Object.values(articleData.query?.pages ?? {}).find(
    (candidate) => !candidate.missing && candidate.pageprops?.wikibase_item,
  );
  const entityId = page?.pageprops?.wikibase_item;
  if (!entityId) return null;
  const entityData = await fetchJson(
    apiUrl("www.wikidata.org", {
      action: "wbgetentities",
      ids: entityId,
      props: "claims",
    }),
  );
  const fileName =
    entityData.entities?.[entityId]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  if (!fileName) return null;
  const metadata = await commonsMetadata(fileName);
  return metadata ? { ...metadata, articleTitle: page.title } : null;
}

function normalizeMetadata(info) {
  const metadata = info?.extmetadata ?? {};
  const license = decodeHtml(metadata.LicenseShortName?.value);
  const sourcePageUrl = info?.descriptionurl;
  const downloadUrl = info?.thumburl ?? info?.url;
  const mime = info?.thumbmime ?? info?.mime;
  if (
    !sourcePageUrl ||
    !downloadUrl ||
    !String(mime ?? "").startsWith("image/") ||
    !/(?:CC|Creative Commons|Public domain|パブリックドメイン)/i.test(license)
  ) {
    return null;
  }
  const creatorText = decodeHtml(metadata.Artist?.value);
  const creator =
    creatorText && creatorText.length <= 180
      ? creatorText
      : "Wikimedia Commons掲載作者";
  let licenseUrl = metadata.LicenseUrl?.value;
  if (!licenseUrl && /Public domain|パブリックドメイン/i.test(license)) {
    licenseUrl = "https://creativecommons.org/publicdomain/mark/1.0/";
  }
  if (!licenseUrl) {
    return null;
  }
  return {
    creator,
    downloadUrl,
    license,
    licenseUrl,
    mime,
    sourcePageUrl,
  };
}

async function wikipediaImage(query, context) {
  const searches = [query, `${query} ${context}`].filter(
    (value, index, values) => value && values.indexOf(value) === index,
  );
  for (const search of searches) {
    const data = await fetchJson(
      apiUrl("ja.wikipedia.org", {
        generator: "search",
        gsrsearch: search,
        gsrnamespace: "0",
        gsrlimit: "8",
        prop: "pageimages|info",
        piprop: "name",
        inprop: "url",
      }),
    );
    const pages = Object.values(data.query?.pages ?? {})
      .filter((page) => page.pageimage)
      .sort((left, right) => {
        const target = normalizedTitle(query);
        const score = (page) => {
          const title = normalizedTitle(page.title);
          if (title === target) return 0;
          if (title.includes(target) || target.includes(title)) return 1;
          return 2;
        };
        return score(left) - score(right) || (left.index ?? 99) - (right.index ?? 99);
      });
    for (const page of pages) {
      const metadata = await commonsMetadata(page.pageimage);
      if (metadata) {
        return { ...metadata, articleTitle: page.title };
      }
    }
  }
  return null;
}

async function commonsSearchImage(query, context) {
  for (const search of [query, `${query} ${context}`]) {
    if (!search.trim()) continue;
    const data = await fetchJson(
      apiUrl("commons.wikimedia.org", {
        generator: "search",
        gsrsearch: search,
        gsrnamespace: "6",
        gsrlimit: "12",
        prop: "imageinfo",
        iiprop: "url|mime|mediatype|extmetadata",
        iiurlwidth: "960",
      }),
    );
    const pages = Object.values(data.query?.pages ?? {}).sort(
      (left, right) => (left.index ?? 99) - (right.index ?? 99),
    );
    for (const page of pages) {
      const metadata = normalizeMetadata(page.imageinfo?.[0]);
      if (metadata) {
        return {
          ...metadata,
          articleTitle: String(page.title ?? "").replace(/^File:/i, ""),
        };
      }
    }
  }
  return null;
}

async function findImage(query, context, fileOverride) {
  if (fileOverride) {
    const metadata = await commonsMetadata(fileOverride);
    if (metadata) return { ...metadata, articleTitle: query };
  }
  return (
    (await wikidataImage(query)) ??
    (await wikipediaImage(query, context)) ??
    (await commonsSearchImage(query, context))
  );
}

function extensionFor(metadata) {
  const types = {
    "image/gif": "gif",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  return types[metadata.mime] ?? "jpg";
}

async function downloadAsset(metadata, assetId) {
  const extension = extensionFor(metadata);
  const relativePath = `term-images/${assetId}.${extension}`;
  const absolutePath = path.join(sourceDirectory, relativePath);
  try {
    await stat(absolutePath);
    return relativePath;
  } catch {
    // 未取得なら下で保存する。
  }
  const response = await fetch(metadata.downloadUrl, {
    headers: apiHeaders,
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok || !String(response.headers.get("content-type") ?? "").startsWith("image/")) {
    throw new Error(`画像を取得できません: ${metadata.downloadUrl}`);
  }
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, Buffer.from(await response.arrayBuffer()));
  return relativePath;
}

async function mapLimit(values, limit, worker) {
  const results = new Array(values.length);
  let cursor = 0;
  async function run() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, run));
  return results;
}

function assetIdForSource(sourcePageUrl) {
  return `WM-${createHash("sha256").update(sourcePageUrl).digest("hex").slice(0, 14)}`;
}

function questionList(term) {
  return Object.values(term.stages).flat();
}

async function main() {
  const rebuild = process.argv.includes("--rebuild");
  const sourcePath = await findSourcePath();
  const terms = groupTerms(toObjects(parseCsv(await readFile(sourcePath, "utf8"))));
  validateTerms(terms);
  const previousManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const assets = [];
  const assetBySource = new Map();
  const fallbackByTerm = new Map();

  if (previousManifest.schemaVersion === 1) {
    for (const image of previousManifest.images) {
      const asset = {
        id: `LEGACY-${image.termId}`,
        path: image.path,
        alt: image.alt,
        caption: image.caption,
        creator: image.creator,
        license: image.license,
        licenseUrl: image.licenseUrl,
        sourcePageUrl: image.sourcePageUrl,
      };
      assets.push(asset);
      assetBySource.set(asset.sourcePageUrl, asset);
      fallbackByTerm.set(image.termId, asset.id);
    }
  } else if (previousManifest.schemaVersion === 2) {
    for (const asset of previousManifest.assets) {
      assets.push(asset);
      assetBySource.set(asset.sourcePageUrl, asset);
    }
    for (const fallback of previousManifest.termFallbacks) {
      if (!rebuild || fallback.assetId.startsWith("LEGACY-")) {
        fallbackByTerm.set(fallback.termId, fallback.assetId);
      }
    }
  } else {
    throw new Error("既存の関連画像一覧を読み込めません。");
  }

  async function resolveAsset(query, context, caption, fileOverride) {
    const metadata = await findImage(query, context, fileOverride);
    if (!metadata) return null;
    const existing = assetBySource.get(metadata.sourcePageUrl);
    if (existing) return existing;
    const id = assetIdForSource(metadata.sourcePageUrl);
    const asset = {
      id,
      path: await downloadAsset(metadata, id),
      alt: caption,
      caption,
      creator: metadata.creator,
      license: metadata.license,
      licenseUrl: metadata.licenseUrl,
      sourcePageUrl: metadata.sourcePageUrl,
    };
    assets.push(asset);
    assetBySource.set(asset.sourcePageUrl, asset);
    return asset;
  }

  const termsWithoutFallback = terms.filter((term) => !fallbackByTerm.has(term.id));
  const missingTerms = [];
  await mapLimit(termsWithoutFallback, 2, async (term, index) => {
    const query = termQueryOverrides.get(term.id) ?? term.term;
    const context = `${term.era} ${term.geography.regionDetail}`;
    const asset = await resolveAsset(
      query,
      context,
      term.term,
      termFileOverrides.get(term.id),
    );
    if (!asset) {
      missingTerms.push(`${term.id} ${term.term}`);
      return;
    }
    fallbackByTerm.set(term.id, asset.id);
    if ((index + 1) % 20 === 0 || index + 1 === termsWithoutFallback.length) {
      console.log(`用語画像: ${index + 1}/${termsWithoutFallback.length}`);
    }
  });
  if (missingTerms.length > 0) {
    throw new Error(`画像を取得できない用語があります:\n${missingTerms.join("\n")}`);
  }

  const targetRequests = [];
  for (const term of terms) {
    for (const question of questionList(term)) {
      if (!isUsefulAnswerTarget(question)) continue;
      const target = cleanSearchText(question.answer);
      if (normalizedTitle(target) === normalizedTitle(term.term)) continue;
      targetRequests.push({
        key: `${term.id}\t${target}`,
        term,
        target,
      });
    }
  }
  const uniqueTargetRequests = [
    ...new Map(targetRequests.map((request) => [request.key, request])).values(),
  ];
  const targetAssets = new Map();
  await mapLimit(uniqueTargetRequests, 2, async (request, index) => {
    const context = `${request.term.term} ${request.term.era}`;
    const asset = await resolveAsset(request.target, context, request.target);
    if (asset) targetAssets.set(request.key, asset.id);
    if ((index + 1) % 20 === 0 || index + 1 === uniqueTargetRequests.length) {
      console.log(`問題別画像候補: ${index + 1}/${uniqueTargetRequests.length}`);
    }
  });

  const assignments = [];
  for (const term of terms) {
    const fallbackAssetId = fallbackByTerm.get(term.id);
    for (const question of questionList(term)) {
      const target = isUsefulAnswerTarget(question)
        ? cleanSearchText(question.answer)
        : term.term;
      const targetAssetId = targetAssets.get(`${term.id}\t${target}`);
      assignments.push({
        questionId: question.id,
        termId: term.id,
        target,
        assetId: targetAssetId ?? fallbackAssetId,
      });
    }
  }

  const referencedAssetIds = new Set([
    ...fallbackByTerm.values(),
    ...assignments.map((assignment) => assignment.assetId),
  ]);
  const manifest = {
    schemaVersion: 2,
    assets: assets
      .filter((asset) => referencedAssetIds.has(asset.id))
      .sort((left, right) => left.id.localeCompare(right.id)),
    termFallbacks: terms.map((term) => ({
      termId: term.id,
      assetId: fallbackByTerm.get(term.id),
    })),
    assignments,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(
    `画像${manifest.assets.length}点を全${terms.length}用語・${assignments.length}問へ固定しました（問題別画像${targetAssets.size}候補）。`,
  );
}

export { assetIdForSource, commonsMetadata, downloadAsset };

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main();
}
