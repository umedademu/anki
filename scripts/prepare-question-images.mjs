import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadBiologyDecks,
  loadEarthScienceDecks,
  loadGeographyDecks,
  loadJapaneseHistoryDecks,
  loadSourceDecks,
} from "./build-learning-data.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const subjectArgumentIndex = process.argv.indexOf("--subject");
export const imageSubjectId =
  subjectArgumentIndex >= 0 ? process.argv[subjectArgumentIndex + 1] : "world-history";
if (
  ![
    "world-history",
    "japanese-history",
    "geography",
    "biology-basics",
    "earth-science-basics",
  ].includes(imageSubjectId)
) {
  throw new Error(`画像を準備できない科目です: ${imageSubjectId}`);
}
const sourceDirectory = path.join(projectRoot, "data", "source", imageSubjectId);
const imageDirectory = path.join(sourceDirectory, "term-images");
const manifestPath = path.join(sourceDirectory, "term-images.json");
export const imageAssetIdPrefix =
  imageSubjectId === "japanese-history"
    ? "WMJ"
    : imageSubjectId === "geography"
      ? "WMG"
      : imageSubjectId === "biology-basics"
        ? "WMB"
        : imageSubjectId === "earth-science-basics"
          ? "WME"
          : "WM";
const loadSubjectDecks =
  imageSubjectId === "japanese-history"
    ? loadJapaneseHistoryDecks
    : imageSubjectId === "geography"
      ? loadGeographyDecks
      : imageSubjectId === "biology-basics"
        ? loadBiologyDecks
        : imageSubjectId === "earth-science-basics"
          ? loadEarthScienceDecks
          : loadSourceDecks;
const userAgent = "anki-history-learning/1.0 (https://anki-ume.vercel.app/)";
const apiHeaders = { "User-Agent": userAgent };
let apiRequestQueue = Promise.resolve();
let nextApiRequestAt = 0;

const termQueryOverrides = new Map([
  ["ポリス", "古代ギリシア ポリス"],
  ["孔子", "孔子"],
  ["十二表法", "十二表法 古代ローマ"],
  ["法家", "法家 中国"],
  ["郡県制", "郡県制 中国"],
  ["武帝", "漢 武帝"],
  ["九品中正", "九品官人法"],
  ["均田制", "均田制 中国"],
  ["封建社会", "封建制 ヨーロッパ"],
  ["封建制（中国）", "封建制 中国"],
  ["イクター制", "イクター制"],
  ["スルタン", "スルターン"],
  ["新法", "王安石 新法"],
  ["サラディン", "サラーフッディーン"],
  ["商業革命", "商業革命 大西洋"],
  ["マゼラン", "フェルディナンド・マゼラン"],
  ["主権国家体制", "主権国家体制 ヨーロッパ"],
  ["大西洋三角貿易", "三角貿易"],
  ["ロック", "ジョン・ロック"],
  ["工場制機械工業", "工場制機械工業 産業革命"],
  ["自由主義", "自由主義"],
  ["アメリカ独立革命", "アメリカ合衆国の独立"],
  ["ラテンアメリカ独立", "ラテンアメリカ独立戦争"],
  ["ウィーン体制", "ウィーン体制 ヨーロッパ"],
  ["社会主義", "社会主義"],
  ["帝国主義", "帝国主義 風刺画"],
  ["三国同盟", "三国同盟 (1882年)"],
  ["総力戦", "総力戦 第一次世界大戦"],
  ["民族自決", "民族自決 ウィルソン"],
  ["ヴェルサイユ条約", "ヴェルサイユ条約"],
  ["ワシントン体制", "ワシントン会議"],
  ["冷戦", "冷戦 地図"],
  ["NATO", "北大西洋条約機構"],
  ["非同盟運動", "非同盟運動 地図"],
  ["デタント", "デタント 米ソ"],
  ["石油危機", "オイルショック"],
  ["人権宣言", "フランス人権宣言"],
]);

const termFileOverrides = new Map([
  ["新人", "Cro-Magnon man - steps of forensic facial reconstruction.jpg"],
  ["ピラミッド", "All Gizah Pyramids.jpg"],
  ["ヒエログリフ", "Temple of Seti I, Egyptian hieroglyphs, Abydos, Egypt.jpg"],
  ["十二表法", "Twelve Tables Engraving.svg"],
  ["封建制（中国）", "Zhou capitales.svg"],
  ["法家", "Statue Of Han Fei.png"],
  ["郡県制", "China Qin Dynasty.jpg"],
  ["高祖", "Liu Bang (Emperor Gaozu of Han).png"],
  ["叙任権闘争", "Investiturewoodcut.png"],
  ["身分制議会", "Opening of the Estates General at Versailles on 5th May 1789.jpg"],
  ["ヒジュラ", "Hejaz622-ar.png"],
  ["イクター制", "Flag of the Seljuk.png"],
  ["宋", "Song Dynasty 960 – 1279 (AD).PNG"],
  ["文治主義", "Song Taizu.jpg"],
  ["金", "Map of the Jin dynasty (1115–1234).png"],
  ["マゼラン", "Ferdinand Magellan.jpg"],
  ["ピサロ", "Portrait of Francisco Pizarro.jpg"],
  ["価格革命", "Cerro Rico, Potosí, Bolivia.jpg"],
  ["商業革命", "Atlantic Triangular Trade, 1500-1800s.png"],
  ["大西洋三角貿易", "Triangular trade en.svg"],
  ["プランテーション", "Chinese contract laborers on a sugar plantation in 19th century Hawaii.jpg"],
  ["信仰義認", "Lucas Cranach d.Ä. - Martin Luther, 1528 (Veste Coburg).jpg"],
  ["主権国家体制", "Westfaelischer Friede in Muenster (Gerard Terborch 1648).jpg"],
  ["絶対王政", "Louis XIV of France.jpg"],
  ["啓蒙思想", "Salon de Madame Geoffrin.jpg"],
  ["囲い込み", "Pre enclosure fields at Garton on the Wolds - geograph.org.uk - 356608.jpg"],
  ["ワット", "James Watt Thomas Lawrence (1812).jpg"],
  ["ワシントン", "Gilbert Stuart - George Washington - Google Art Project.jpg"],
  ["人権宣言", "Declaration of the Rights of Man and of the Citizen in 1789.jpg"],
  [
    "自由主義",
    "La Liberté guidant le peuple - Eugène Delacroix - Musée du Louvre Peintures RF 129 - après restauration 2024.jpg",
  ],
  [
    "国民主義",
    "La Liberté guidant le peuple - Eugène Delacroix - Musée du Louvre Peintures RF 129 - après restauration 2024.jpg",
  ],
  ["鉄血政策", "Bundesarchiv Bild 146-2005-0057, Otto von Bismarck.jpg"],
  ["帝国主義", "Punch Rhodes Colossus.png"],
  ["ベルリン会議", "Kongokonferenz.jpg"],
  [
    "二月革命",
    "International Women's Day - February Revolution - Petrograd.jpg",
  ],
  ["集団農場", "1930 Jewish kolkhoz AJJDC 05.jpg"],
  ["国際連合", "Flag of the United Nations.svg"],
  [
    "GATT",
    "In GATT We Trust by Claude Namy (1966), 1.10 m high, 1.85 m wide, acrylic on canvas.jpg",
  ],
  ["NATO", "Flag of NATO.svg"],
  ["ドイツ分断", "East Germany and West Germany. LOC 91685645.jpg"],
  ["中華人民共和国", "Mao Proclaiming New China.JPG"],
  ["非同盟運動", "Gedung.Merdeka.jpg"],
  ["EC", "Flag of Europe.svg"],
  ["グローバル化", "Global Container International container.jpg"],
  ["海の民", "Medinet Habu Ramses III. Tempel Nordostwand Abzeichnung 01.jpg"],
  [
    "エーゲ文明",
    "Map of Aegean Civilization JF Horrabin; Ship Procession fresco 3, Akrotiri, Santorini 1550 B.C.jpg",
  ],
  ["宗法", "Western Zhou Ritual Containers.jpg"],
  [
    "塩鉄専売",
    "0025-0220 Brick Relief with Salt-mining Scene Eastern Han Dynasty National Museum of China anagoria.jpg",
  ],
  ["士族", "Seven Sages of the Bamboo Grove 2.Nanjing Museum.jpg"],
  ["ジズヤ", "Jizya document Chokmanovo 1615.jpg"],
  ["ハラージュ", "Abbasid Caliphate 850AD.png"],
  [
    "マワーリー",
    "Portrait of Abu Muslim (d. 755) from the genealogy (silsilanāma), Cream of Histories (Zübdet-üt Tevarih, 1598).jpg",
  ],
  ["フラグ", "Hulagu Khan resting.jpg"],
  ["デーン朝", "Canute and Ælfgifu cropped (Canute).jpg"],
  [
    "カロリング＝ルネサンス",
    "Evangeliarium - évangéliaire dit de Charlemagne ou de Godescalc - Jésus-Christ - BNF Gallica.jpg",
  ],
  ["三圃制", "Three Field System.svg"],
  ["ローマ教皇", "Pope Leo III – Triclinium Leoninum.jpg"],
  ["自治都市", "00 73774 Holstentor - Lübeck.jpg"],
  ["コミューン", "Palazzo Pubblico in Siena.jpg"],
  ["フランドル", "County of Flanders (topogaphy).png"],
  ["グラナダ陥落", "La Rendición de Granada - Pradilla.jpg"],
  ["首長法", "Holbein henry8 full length.jpg"],
  ["統一法", "Elizabeth I (Armada Portrait).jpg"],
  ["人身保護法", "Charles II (1675).jpg"],
  [
    "啓蒙専制君主",
    "Portrait of Frederick II (the Great), King of Prussia, by Anton Graff at Sanssouci.jpg",
  ],
  ["ベーコン", "Portrait-Francis-Bacon.jpg"],
  ["重農主義", "Quesnay Portrait.jpg"],
  ["ミッレト制", "OttomanEmpireIn1683.png"],
  ["連邦制", "United States Constitution.jpg"],
  [
    "旧制度",
    "Opening of the Estates General at Versailles on 5th May 1789.jpg",
  ],
  ["国民議会", "Serment du Jeu de Paume - Jacques-Louis David.jpg"],
  ["オーウェン", "Portrait of Robert Owen.png"],
  ["フロンティア", "UnitedStatesExpansion.png"],
  ["リンカン", "Abraham Lincoln O-77 by Gardner, 1863.jpg"],
  ["全インド＝ムスリム連盟", "All India Muslim League Dhaka 1906.jpg"],
  [
    "中華民国",
    "1912年1月1日，孙中山就职中华民国临时大总统后与总统府职员合影.jpg",
  ],
  ["ブロック経済", "Pacific Area - The Imperial Powers 1939 - Map.svg"],
  ["コミンフォルム", "Eastern Bloc countries Europe 1948.png"],
  ["ポーランド「連帯」", "Solidarity August 1980 gate of Gdańsk Shipyard.jpg"],
  ["青銅器", "HouMuWuDingFullView.jpg"],
  ["第1回三頭政治", "First Triumvirate of Caesar, Crassius and Pompey.jpg"],
  ["ヴァルナ制", "Varna-Caste-South-india-srilanka.jpg"],
  ["マヌ法典", "Manusmriti.jpg"],
  ["アンコール朝", "Carte Empire-Khmer.png"],
  ["春秋五覇", "Chinese plain 5c. BC-en.svg"],
  ["江南開発", "Eastern Jin and Later Qin.png"],
  ["玄宗", "Tang-xuanzong.jpg"],
  ["ウイグル", "Map of the Uyghur Khaganate.png"],
  ["パーニーパットの戦い", "1526-First Battle of Panipat-Ibrahim Lodhi and Babur.jpg"],
  ["ツァーリ", "Ivan IV of Russia from Titulyarnik (17th c., GIM).jpg"],
  ["主従関係", "Hommage au Moyen Age - miniature.jpg"],
  ["封土", "Plan mediaeval manor.jpg"],
  ["商人ギルド", "Merchant Adventurers' Hall.jpg"],
  [
    "ユートピア",
    "Thomas More Utopia 1516 Libellus vere aureus nec minus salutaris quam festivus. De Optimo reipublicae Statu, deque nova Insula Utopia (Bibliothèque Mazarine).jpg",
  ],
  ["ネーデルラント独立戦争", "Geography 017 - Map of Leo Belgicus - 1611.jpg"],
  ["ステュアート朝", "House of Stuart.png"],
  ["ポーランド分割", "Partitions of Poland.png"],
  ["ジロンド派", "Girondins execution.jpg"],
  ["四国同盟", "Map of the Quadruple Alliance (1815).svg"],
  ["ドイツ関税同盟", "Zollverein (1834).png"],
  [
    "平和共存",
    "Photographs of President Dwight D. Eisenhower and Russian Premier Nikita Khrushchev Arriving at Camp David - DPLA - 22d2ad716857840dbff172b36bf0b5e4 (page 1).jpg",
  ],
  ["バビロン第1王朝", "Code Of Hammurabi.jpg"],
  ["アラム人", "Neo-hittites et arameens.svg"],
  [
    "第2回三頭政治",
    "M565681 The-Triumvirate-of-Mark-Antony-Marcus-Aemilius-Lepidus-and-Octavian-proclaiming-proscriptions-against-their-political-e.jpg",
  ],
  ["コロナトゥス", "Dominus Julius villa mosaic.jpg"],
  ["冒頓単于", "Map of the Xiongnu, circa 150 BCE.png"],
  ["六信五行", "Five pillars of Islam.svg"],
  ["ジハード", "Map of expansion of Caliphate.svg"],
  ["知恵の館", "Cheshm manuscript.jpg"],
  ["プランタジネット朝", "Church of Fontevraud Abbey Henry II effigy.jpg"],
  ["三省六部", "唐代三省六部制思维导图.png"],
  ["租庸調", "Tang Silver Disc with Characters (9949889713).jpg"],
  ["両税法", "Tang Dynasty - Jian Zhong Tong Bao.png"],
  ["一国社会主義", "Stalin before 1929.jpg"],
]);

function targetKey(term, target) {
  return `${term}\t${target}`;
}

const targetFileOverrides = new Map([
  [targetKey("ローマ帝国", "道路網"), "Roman Empire 125 general map (Red roads).svg"],
  [targetKey("隋", "文帝"), "隋文帝 杨坚.jpg"],
  [targetKey("カール大帝", "ローマ教皇"), "Coronation of Charlemagne by Pope Leo III.jpg"],
  [targetKey("蒸気機関", "ワット"), "James Watt Thomas Lawrence (1812).jpg"],
  [
    targetKey("プラッシーの戦い", "クライヴ"),
    "Robert Clive, 1st Baron Clive by Nathaniel Dance, (later Sir Nathaniel Dance-Holland, Bt).jpg",
  ],
  [targetKey("メキシコ革命", "サパタ"), "Emiliano Zapata.jpg"],
  [targetKey("奴隷解放宣言", "リンカン"), "Abraham Lincoln head on shoulders photo portrait.jpg"],
  [targetKey("アメリカ南北戦争", "リンカン"), "Abraham Lincoln head on shoulders photo portrait.jpg"],
  [
    targetKey("ベルリン封鎖", "ベルリン大空輸"),
    "Avro Tudor - The Berlin Airlift 1948 - 1949 HU98417.jpg",
  ],
  [targetKey("インド独立", "パキスタン"), "Partition of India 1947 en.svg"],
  [targetKey("イスラエル建国", "ベン＝グリオン"), "David Ben-Gurion in 1952.jpg"],
  [targetKey("スエズ戦争", "ナセル"), "Official Portrait - Gamal Abdel Nasser.jpg"],
  [
    targetKey("クレイステネス", "デーモス"),
    "Greece (ancient) Attica Demos.svg",
  ],
  [targetKey("ワット＝タイラーの乱", "ジョン＝ボール"), "William.Morris.John.Ball.jpg"],
  [
    targetKey("ワーテルローの戦い", "ウェリントン"),
    "Wellington by Thomas Lawrence (1829).jpg",
  ],
  [targetKey("アレクサンドル2世", "人民の意志"), "Executive committee.jpg"],
  [targetKey("イラン革命", "パフレヴィー2世"), "Mohammad Reza Pahlavi in 1973.jpg"],
  [targetKey("イル＝ハン国", "フラグ"), "Hulagu Khan.jpg"],
]);

const excludedTargetKeys = new Set([
  targetKey("ヴェルダン条約", "三王国"),
  targetKey("ルネサンス", "イタリア都市"),
  targetKey("遼", "契丹人"),
  targetKey("コロンブス", "スペイン"),
  targetKey("産業革命", "イギリス"),
  targetKey("ワシントン", "初代"),
  targetKey("バスティーユ牢獄襲撃", "パリ"),
  targetKey("人権宣言", "国民"),
  targetKey("大陸封鎖令", "イギリス"),
  targetKey("シモン＝ボリバル", "ボリビア"),
  targetKey("レーニン", "四月テーゼ"),
  targetKey("国際連盟", "アメリカ合衆国"),
  targetKey("ファシズム", "イタリアのムッソリーニ"),
  targetKey("五・四運動", "北京の学生"),
  targetKey("バルフォア宣言", "イギリス"),
  targetKey("独ソ不可侵条約", "ポーランド"),
  targetKey("真珠湾攻撃", "アメリカ合衆国"),
  targetKey("GATT", "世界貿易機関"),
  targetKey("アジア・アフリカ会議", "インドネシア"),
  targetKey("アフリカの年", "フランス"),
  targetKey("三省六部", "尚書省"),
  targetKey("渤海", "大祚栄"),
  targetKey("ウラービー運動", "ウラービー＝パシャ"),
  targetKey("北京議定書", "列強十一か国"),
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
  const downloadUrl = new URL(metadata.downloadUrl);
  for (const key of [...downloadUrl.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_")) downloadUrl.searchParams.delete(key);
  }
  let lastFailure = "応答なし";
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      const response = await fetch(downloadUrl, {
        headers: apiHeaders,
        signal: AbortSignal.timeout(60_000),
      });
      const contentType = String(response.headers.get("content-type") ?? "");
      if (response.ok && contentType.startsWith("image/")) {
        await mkdir(path.dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, Buffer.from(await response.arrayBuffer()));
        return relativePath;
      }
      lastFailure = `${response.status} ${contentType || "content-typeなし"}`;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }
    await delay(attempt * 1_000);
  }
  throw new Error(`画像を取得できません: ${downloadUrl}（${lastFailure}）`);
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

function assetIdForSource(sourcePageUrl, prefix = imageAssetIdPrefix) {
  return `${prefix}-${createHash("sha256").update(sourcePageUrl).digest("hex").slice(0, 14)}`;
}

function questionList(term) {
  return Object.values(term.stages).flat();
}

async function main() {
  const rebuild = process.argv.includes("--rebuild");
  const { terms: allTerms } = await loadSubjectDecks();
  const usesSelectedTerms = [
    "geography",
    "biology-basics",
    "earth-science-basics",
  ].includes(
    imageSubjectId,
  );
  const selectedTermOverrides =
    usesSelectedTerms
      ? JSON.parse(
          await readFile(path.join(sourceDirectory, "image-overrides.json"), "utf8"),
        )
      : [];
  const selectedOverrideByTermId = new Map(
    selectedTermOverrides.map((override) => [override.termId, override]),
  );
  if (selectedOverrideByTermId.size !== selectedTermOverrides.length) {
    throw new Error(`${imageSubjectId}の画像指定に重複した用語IDがあります。`);
  }
  const knownTermIds = new Set(allTerms.map((term) => term.id));
  const unknownSelectedTermIds = [...selectedOverrideByTermId.keys()].filter(
    (termId) => !knownTermIds.has(termId),
  );
  if (unknownSelectedTermIds.length > 0) {
    throw new Error(
      `${imageSubjectId}の画像指定に存在しない用語IDがあります: ${unknownSelectedTermIds.join(", ")}`,
    );
  }
  const terms = usesSelectedTerms
      ? allTerms.filter((term) => selectedOverrideByTermId.has(term.id))
      : allTerms;
  const activeTermQueryOverrides =
    imageSubjectId === "world-history" ? termQueryOverrides : new Map();
  const activeTermFileOverrides =
    imageSubjectId === "world-history" ? termFileOverrides : new Map();
  const activeTargetFileOverrides =
    imageSubjectId === "world-history" ? targetFileOverrides : new Map();
  const activeExcludedTargetKeys =
    imageSubjectId === "world-history" ? excludedTargetKeys : new Set();
  const previousManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const assets = [];
  const assetBySource = new Map();
  const fallbackByTerm = new Map();
  const previousAssignmentByQuestion = new Map();

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
    if (!rebuild) {
      const previousAssetIds = new Set(previousManifest.assets.map((asset) => asset.id));
      for (const assignment of previousManifest.assignments) {
        if (previousAssetIds.has(assignment.assetId)) {
          previousAssignmentByQuestion.set(assignment.questionId, assignment);
        }
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
    const selectedOverride = selectedOverrideByTermId.get(term.id);
    const query =
      selectedOverride?.query ?? activeTermQueryOverrides.get(term.term) ?? term.term;
    const context =
      selectedOverride?.context ??
      [term.era, term.geography?.regionDetail, term.subunit, term.category]
        .filter(Boolean)
        .join(" ");
    const asset = await resolveAsset(
      query,
      context,
      selectedOverride?.caption ?? term.term,
      selectedOverride?.fileName ?? activeTermFileOverrides.get(term.term),
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
  for (const term of usesSelectedTerms ? [] : terms) {
    for (const question of questionList(term)) {
      const previousAssignment = previousAssignmentByQuestion.get(question.id);
      if (previousAssignment?.termId === term.id) continue;
      if (!isUsefulAnswerTarget(question)) continue;
      const target = cleanSearchText(question.answer);
      if (normalizedTitle(target) === normalizedTitle(term.term)) continue;
      if (activeExcludedTargetKeys.has(targetKey(term.term, target))) continue;
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
    const asset = await resolveAsset(
      request.target,
      context,
      request.target,
      activeTargetFileOverrides.get(targetKey(request.term.term, request.target)),
    );
    if (asset) targetAssets.set(request.key, asset.id);
    if ((index + 1) % 20 === 0 || index + 1 === uniqueTargetRequests.length) {
      console.log(`問題別画像候補: ${index + 1}/${uniqueTargetRequests.length}`);
    }
  });

  const assignments = [];
  for (const term of terms) {
    const fallbackAssetId = fallbackByTerm.get(term.id);
    for (const question of questionList(term)) {
      const previousAssignment = previousAssignmentByQuestion.get(question.id);
      if (previousAssignment?.termId === term.id) {
        assignments.push(previousAssignment);
        continue;
      }
      const target = !usesSelectedTerms && isUsefulAnswerTarget(question)
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

  const termFallbacks = terms.map((term) => ({
    termId: term.id,
    assetId: fallbackByTerm.get(term.id),
  }));
  const referencedAssetIds = new Set([
    ...termFallbacks.map((fallback) => fallback.assetId),
    ...assignments.map((assignment) => assignment.assetId),
  ]);
  const manifest = {
    schemaVersion: 2,
    assets: [
      ...new Map(
        assets
          .filter((asset) => referencedAssetIds.has(asset.id))
          .map((asset) => [asset.id, asset]),
      ).values(),
    ]
      .sort((left, right) => left.id.localeCompare(right.id)),
    termFallbacks,
    assignments,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(
    `画像${manifest.assets.length}点を${terms.length}用語・${assignments.length}問へ固定しました（問題別画像${targetAssets.size}候補）。`,
  );
}

export {
  assetIdForSource,
  commonsMetadata,
  downloadAsset,
  findImage,
  targetFileOverrides,
  targetKey,
  termFileOverrides,
};

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main();
}
