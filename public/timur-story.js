import { renderCharacterTheater } from "./timur-characters.js?v=0.182";

const scenes = [
  {
    characters: "culture",
    year: "14世紀", kicker: "まず、時代の背景から", title: "モンゴルの支配が、\n変わり始める。",
    body: ["広大なモンゴル帝国。その支配が弱まるころ、舞台となる<strong>中央アジア</strong>では、支配階級のモンゴル人にも変化が起きていた。", "トルコ語を使う<strong>トルコ化</strong>と、イスラーム教に改宗する<strong>イスラーム化</strong>が進んでいたんだ。"],
    takeaway: "モンゴルの伝統に、トルコ語とイスラームが重なる。",
    note: "「トルコ化」は、現在のトルコ共和国へ移ったという意味ではありません。",
    mapHeading: "舞台は、中央アジア", mapDescription: "黒海・カスピ海の東に広がる中央アジアを強調しています。サマルカンドもこの地域にあります。",
    regions: ["chagatai"], places: [], labels: ["central", "chagatai"], camera: [140, 45, 900, 600], mobileCamera: [300, 70, 610, 405],
  },
  {
    characters: "split",
    year: "14世紀半ば", kicker: "まとまりが崩れると…", title: "国が東西に分かれ、\n争いが続く。",
    body: ["中央アジアを支配した<strong>チャガタイ＝ハン国</strong>は、東西に分裂。それぞれで部族どうしの内紛が起きた。", "そのうち<strong>西チャガタイ＝ハン国</strong>の争いを勝ち抜いてきたのが、ティムールだった。"],
    takeaway: "チャガタイ＝ハン国が分裂 → 西側からティムールが登場。",
    note: "チャガタイ＝ハン国は「チャガタイ＝ウルス」とも呼ばれます。",
    mapHeading: "東西の分裂と、西側からの登場", mapDescription: "チャガタイ＝ハン国の西側と東側を別々に色付けし、西側に位置するサマルカンドを示しています。",
    regions: ["west", "east"], places: [], labels: ["west", "east"], camera: [320, 55, 740, 490], mobileCamera: [390, 90, 650, 430], split: true,
  },
  {
    characters: "marriage",
    year: "1370年", kicker: "ティムール朝の成立", title: "「後継者」の権威で、\n新しい政権をつくる。",
    body: ["ティムールは政権を握り、<strong>サマルカンドを都</strong>にした。チンギス＝ハンの血を引くチャガタイ家の王女との結婚を、権威のよりどころにしたんだ。", "本人は直系の子孫ではなく、王家の<strong>「婿」</strong>。征服地の多くを一族に分け与えるなど、モンゴルの伝統も受け継いだ。"],
    takeaway: "都はサマルカンド。血筋そのものではなく、婚姻と伝統を使う。",
    note: "チンギス＝ハンは「チンギス＝カン」とも表記します。",
    mapHeading: "ここが拠点、サマルカンド", mapDescription: "中央アジアの西部と、都サマルカンドを強調しています。ティムールの勢力拡大の拠点です。",
    regions: ["west"], places: [], labels: ["central"], camera: [300, 90, 620, 410], mobileCamera: [360, 95, 490, 330], capitalActive: true,
  },
  {
    characters: "north",
    year: "1391・1395年", kicker: "遠征① 北の草原へ", title: "カスピ海の北へ、\n影響力を広げる。",
    body: ["サマルカンドを拠点に、ティムールは各地へ遠征。北方では、<strong>キプチャク＝ハン国</strong>と戦った。", "その支配者トクタミシュを破り、カスピ海北方から広い草原地帯へ影響力を伸ばした。相手の勢力を大きく弱めたんだ。"],
    takeaway: "カスピ海の北 → キプチャク＝ハン国を弱体化。",
    note: "別名はジョチ＝ウルス。北方・イラン・コーカサスへの遠征は時期が重なるため、ここからは地域ごとに見ます。",
    mapHeading: "北方の遠征｜斜線は影響を及ぼした地域", mapDescription: "サマルカンドからカスピ海の北側を回って、キプチャク＝ハン国へ向かう矢印。斜線は影響を及ぼした地域の概略です。",
    regions: ["west", "kipchak"], places: ["sarai"], labels: ["kipchak"], routes: ["north"], camera: [140, 0, 760, 505], mobileCamera: [250, 15, 600, 400],
  },
  {
    characters: "iran",
    year: "1380〜1390年代", kicker: "遠征② イランへ", title: "支配者を失った\nイランを取り込む。",
    body: ["イランでは、かつてこの地を支配していた<strong>イル＝ハン国</strong>がすでに滅亡し、いくつもの勢力に分かれていた。", "ティムールはそこへ侵攻。各地の勢力を倒して、<strong>イランを支配下</strong>に組み込んでいった。"],
    takeaway: "イル＝ハン国の滅亡後のイラン → ティムールの支配下へ。",
    note: "イル＝ハン国は「フレグ＝ウルス」とも呼ばれます。北方への遠征と前後して進められた征服です。",
    mapHeading: "西方の遠征｜カスピ海の南にイラン", mapDescription: "サマルカンドから南西のイランへの矢印。カスピ海の南にあるイランを強調しています。",
    regions: ["west", "iran"], places: ["isfahan"], labels: ["iran"], routes: ["iran"], camera: [145, 120, 720, 480], mobileCamera: [265, 160, 510, 340],
  },
  {
    characters: "caucasus",
    year: "1386年以降", kicker: "遠征③ 二つの海の間へ", title: "黒海とカスピ海の\n間にも進出する。",
    body: ["イランから、さらに北西へ。<strong>アルメニア</strong>や<strong>グルジア</strong>にも軍を進めた。", "地図で見ると、舞台は<strong>黒海とカスピ海の間</strong>。この位置関係を押さえると、遠征の広がりがつかみやすい。"],
    takeaway: "黒海 ｜ グルジア・アルメニア ｜ カスピ海",
    note: "この一帯をコーカサスと呼びます。グルジアの現在の日本語国名はジョージアです。",
    mapHeading: "コーカサス｜二つの海の間に注目", mapDescription: "西の黒海、東のカスピ海、その間のグルジアとアルメニアを表示し、イラン側からの進出方向を示します。",
    regions: ["iran", "caucasus"], places: ["georgia", "armenia"], labels: [], routes: ["caucasus"], camera: [40, 100, 730, 485], mobileCamera: [115, 155, 540, 360],
  },
  {
    characters: "delhi",
    year: "1398年", kicker: "遠征④ インドへ", title: "デリーを占領し、\nトゥグルク朝に打撃。",
    body: ["今度は中央アジアから<strong>西北インド</strong>へ。ティムールは<strong>デリー</strong>を占領した。", "このときの略奪で大きな被害が生まれ、デリーを都とする<strong>トゥグルク朝の衰退</strong>が進んだ。"],
    takeaway: "1398年・デリー占領 → トゥグルク朝が衰退。",
    note: "デリーを占領したことと、インド全体を継続して支配したことは区別します。",
    mapHeading: "南東へ｜山々を越えてデリーへ", mapDescription: "サマルカンドから南東のデリーへ矢印が伸びます。インド北部のデリーを占領した遠征です。",
    regions: ["west", "india"], places: ["delhi"], labels: ["india"], routes: ["india"], camera: [360, 175, 640, 425], mobileCamera: [460, 200, 440, 295],
  },
  {
    characters: "syria",
    year: "1400〜1401年", kicker: "遠征⑤ シリア・イラクへ", title: "ダマスクス、\nそしてバグダードへ。",
    body: ["再び西へ向かったティムールは、シリアに侵攻し、<strong>ダマスクス</strong>を占領した。", "さらにイラクの<strong>バグダード</strong>も占領。その後、北西の<strong>アナトリア</strong>へと進み、オスマン朝と衝突する。"],
    takeaway: "シリア・イラクへの遠征から、アナトリアでの対決へ。",
    note: "ダマスクスはシリア、バグダードはイラクにあります。",
    mapHeading: "西アジアへ｜ダマスクスとバグダード", mapDescription: "中央アジアからイランを経て西へ向かい、シリアのダマスクスとイラクのバグダードをたどる矢印です。",
    regions: ["iran", "syria"], places: ["damascus", "baghdad"], labels: ["syria", "iraq"], routes: ["syria", "baghdad"], camera: [75, 185, 680, 455], mobileCamera: [105, 240, 470, 315],
  },
  {
    characters: "ankara",
    year: "1402年", kicker: "遠征⑥ アンカラの戦い", title: "オスマン朝の\nスルタンを捕らえる。",
    body: ["アナトリアへ進んだティムールは、<strong>アンカラの戦い</strong>でオスマン朝の<strong>バヤジット1世</strong>を破った。", "スルタンが捕虜になると、オスマン朝では後継者たちが争うようになり、統一的な支配が一時途絶えた。"],
    takeaway: "1402年・アンカラの戦い → バヤジット1世を捕虜に。",
    note: "オスマン朝が永久に滅んだわけではありません。内紛を経て再統一されます。",
    mapHeading: "アナトリアへ｜アンカラでオスマン朝と対決", mapDescription: "イラク方面から北西のアナトリアへ進み、アンカラを強調します。黒海の南側がアナトリアです。",
    regions: ["anatolia"], places: ["ankara"], labels: ["anatolia"], routes: ["ankara"], camera: [0, 125, 725, 480], mobileCamera: [35, 185, 480, 320],
  },
  {
    characters: "return",
    year: "1402年の戦いの後", kicker: "西での勝利。その先は？", title: "西へ進み続けず、\n関心は東へ向かう。",
    body: ["ティムールは、オスマン朝に領地を奪われていた<strong>アナトリアの旧支配者たち</strong>に領地を戻した。", "オスマン朝の重要な拠点だった<strong>バルカン半島</strong>へは遠征を広げなかった。彼の大きな目標は、はるか東にあったんだ。"],
    takeaway: "勝った土地をすべて直轄化せず、西への拡大にも区切り。",
    note: "バルカン半島はアナトリアの西、海峡を挟んだヨーロッパ側にあります。",
    mapHeading: "西への拡大はここまで｜バルカンとの位置関係", mapDescription: "アナトリアと、その西側にあるバルカン半島を示しています。バルカンへ向かう遠征の矢印はありません。",
    regions: ["anatolia", "balkans"], places: ["ankara"], labels: ["anatolia", "balkans"], camera: [0, 110, 705, 470], mobileCamera: [0, 150, 490, 325], afterAnkara: true,
  },
  {
    characters: "ming",
    year: "1404年", kicker: "最後の目標は、明", title: "モンゴルの敵を討つ。\n今度は中国へ。",
    body: ["ティムールが目指したのは<strong>明</strong>。明は、モンゴルの皇帝が治めた<strong>元を中国から北方へ追いやった</strong>王朝だった。", "モンゴル帝国の後継者を自認するティムールは、サマルカンドへ戻って軍を再編成し、<strong>明への遠征</strong>に出発した。"],
    takeaway: "「モンゴルの後継者」という意識が、明への遠征につながる。",
    note: "青い破線は目指した方向です。明の領内まで到達した行軍路ではありません。",
    mapHeading: "地図を東へ広げる｜目標は明", mapDescription: "サマルカンドから東の中国方面まで地図を広げ、明を強調。青い破線は実現しなかった遠征の計画方向です。",
    regions: ["west", "ming"], places: [], labels: ["ming", "yuan"], routes: ["china"], camera: [310, 0, 950, 635], mobileCamera: [450, 40, 810, 540],
  },
  {
    characters: "death",
    year: "1405年", kicker: "遠征の途中で", title: "オトラルで病死。\n明には届かなかった。",
    body: ["軍を率いて出発したものの、ティムールは中央アジアの<strong>オトラル</strong>で病に倒れ、亡くなった。", "オトラルは、まだサマルカンドに近い中央アジア。<strong>明への遠征は実現しないまま</strong>、彼の生涯は終わった。"],
    takeaway: "1405年・オトラルで病死 → 明への遠征は中止。",
    note: "ティムール本人の死後も、子孫によるティムール朝は続きます。",
    mapHeading: "実際の到達点｜中央アジアのオトラル", mapDescription: "サマルカンドから北のオトラルまでを赤い実線、その先の明へは青い破線で示します。オトラルに停止の印を付けています。",
    regions: ["west", "ming"], places: ["otrar"], labels: ["ming"], routes: ["otrar", "chinaFromOtrar"], camera: [310, 0, 950, 635], mobileCamera: [450, 40, 810, 540], stop: true,
  },
  {
    characters: "summary",
    year: "流れを振り返る", kicker: "13場面のまとめ", title: "中央アジアから拡大。\n最後は、東への途上で。",
    body: ["<strong>1370年</strong>、サマルカンドを都に政権を確立。北方・イラン・コーカサスへ勢力を広げた。", "<strong>1398年はデリー</strong>、<strong>1402年はアンカラ</strong>。そして<strong>1405年、オトラルで病死</strong>。明への遠征は果たせなかった。"],
    takeaway: "モンゴルの伝統を受け継ぎ、中央アジアから各地へ遠征した。",
    note: "もう一度見るなら「最初から」。下の番号から、気になる場面だけにも戻れます。",
    mapHeading: "遠征の全体像｜四つの地名をつなげよう", mapDescription: "サマルカンドを中心に北方、イラン、インド、アナトリアへの遠征方向をまとめて示します。オトラルの先、明への矢印は計画を表す破線です。",
    regions: ["west", "iran", "ming"], places: ["delhi", "ankara", "otrar"], labels: ["ming"], routes: ["north", "iran", "india", "summaryAnkara", "otrar", "chinaFromOtrar"], camera: [0, 0, 1260, 720], mobileCamera: [0, 0, 1260, 720], summary: true,
  },
];

const svgNamespace = "http://www.w3.org/2000/svg";
const project = ([longitude, latitude]) => [(longitude - 20) * 12, (58 - latitude) * 15];
const pointsPath = (points, close = false) => points.map((point, i) => `${i ? "L" : "M"}${project(point).join(",")}`).join(" ") + (close ? " Z" : "");
const places = {
  samarkand: { point: [66.97, 39.65], label: "サマルカンド", offset: [0, 30], anchor: "middle" },
  sarai: { point: [47.2, 47.2], label: "サライ付近", offset: [-13, -16], anchor: "end" },
  isfahan: { point: [51.68, 32.65], label: "イスファハーン", offset: [10, 27] },
  georgia: { point: [44.8, 41.7], label: "グルジア", offset: [15, -18] },
  armenia: { point: [44.5, 40.2], label: "アルメニア", offset: [12, 30] },
  delhi: { point: [77.21, 28.61], label: "デリー", offset: [13, 7] },
  damascus: { point: [36.29, 33.51], label: "ダマスクス", offset: [-12, 24], anchor: "end" },
  baghdad: { point: [44.37, 33.31], label: "バグダード", offset: [12, 26] },
  ankara: { point: [32.86, 39.93], label: "アンカラ", offset: [-12, -17], anchor: "end" },
  otrar: { point: [68.3, 42.85], label: "オトラル", offset: [14, -16] },
};
const regions = {
  chagatai: { points: [[58,43],[64,47],[77,48],[87,46],[91,40],[80,35],[68,34],[59,37]] },
  west: { points: [[59,42],[65,45],[71,44],[74,41],[70,36],[64,35],[60,38]] },
  east: { points: [[73,44],[78,48],[87,46],[91,41],[84,36],[74,36],[76,41]], kind: "planned" },
  kipchak: { points: [[37,48],[44,52],[58,54],[72,51],[68,47],[58,46],[48,47],[42,45]], kind: "influence" },
  iran: { points: [[45,38],[54,39],[61,36],[63,29],[58,26],[51,29],[47,33]] },
  caucasus: { points: [[40,43],[45,43],[49,41],[47,38],[42,39]] },
  india: { points: [[71,32],[75,32],[80,30],[80,27],[75,27],[71,29]], kind: "influence" },
  syria: { points: [[35,37],[41,37],[46,35],[47,32],[42,31],[35,32]], kind: "influence" },
  anatolia: { points: [[28,40],[34,42],[41,41],[42,38],[35,36],[29,37]], kind: "opponent" },
  balkans: { points: [[20,44],[26,45],[29,42],[26,40],[23,38],[20,40]], kind: "planned" },
  ming: { points: [[104,39],[112,42],[119,41],[123,36],[122,29],[118,24],[109,21],[104,26],[103,32]], kind: "planned" },
};
const labels = {
  central: { point: [77, 47.5], text: "中央アジア" },
  chagatai: { point: [77, 34.5], text: "チャガタイ＝ハン国" },
  west: { point: [63, 45.8], text: "西チャガタイ" },
  east: { point: [82.5, 43], text: "東チャガタイ" },
  kipchak: { point: [57, 51.4], text: "キプチャク＝ハン国" },
  iran: { point: [55, 35.7], text: "イラン" },
  india: { point: [81, 24], text: "インド" },
  syria: { point: [37, 36.5], text: "シリア" },
  iraq: { point: [44, 36], text: "イラク" },
  anatolia: { point: [35, 36.2], text: "アナトリア" },
  balkans: { point: [25, 46], text: "バルカン半島" },
  ming: { point: [114, 32], text: "明（中国）" },
  yuan: { point: [111, 49], text: "北へ退いた元" },
};
const routes = {
  north: { points: [[66.97,39.65],[69,44.5],[61,49],[53,49.5],[47.2,47.2]] },
  iran: { points: [[66.97,39.65],[61,36.5],[56,35],[51.68,32.65]] },
  caucasus: { points: [[51.68,32.65],[49,37],[46,39],[44.8,41.7]] },
  india: { points: [[66.97,39.65],[69,34.5],[72,31],[77.21,28.61]] },
  syria: { points: [[66.97,39.65],[57,36],[48,36.5],[39,37],[36.29,33.51]] },
  baghdad: { points: [[36.29,33.51],[40,32],[44.37,33.31]], delay: .6 },
  ankara: { points: [[44.37,33.31],[42,37],[37,39],[32.86,39.93]] },
  summaryAnkara: { points: [[66.97,39.65],[57,36],[46,36],[38,38],[32.86,39.93]] },
  china: { points: [[66.97,39.65],[77,43],[91,43],[101,40],[111,36]], planned: true },
  otrar: { points: [[66.97,39.65],[67.4,41],[68.3,42.85]] },
  chinaFromOtrar: { points: [[68.3,42.85],[79,45],[91,43],[101,40],[111,36]], planned: true },
};

const elements = Object.fromEntries([
  "story-map", "map-heading", "map-title", "map-description", "map-regions", "map-labels", "map-routes", "map-places", "map-annotations",
  "narrative", "scene-number", "scene-year", "scene-kicker", "scene-title", "scene-body", "scene-takeaway", "scene-note",
  "previous", "next", "replay", "story-progress", "progress-label", "scene-nav", "character-theater",
].map((id) => [id, document.getElementById(id)]));
const mobile = window.matchMedia("(max-width: 740px)");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let sceneIndex = 0;

function svgElement(tag, attributes = {}, text) {
  const element = document.createElementNS(svgNamespace, tag);
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
  if (text !== undefined) element.textContent = text;
  return element;
}

function mapText(point, text, className = "region-label", extra = {}) {
  const [x, y] = project(point);
  return svgElement("text", { x, y, class: className, "text-anchor": "middle", ...extra }, text);
}

function drawPlace(key, scene) {
  const place = places[key];
  const [x, y] = project(place.point);
  const [left, top, width, height] = mobile.matches ? scene.mobileCamera : scene.camera;
  if (x < left || x > left + width || y < top || y > top + height) return;
  const capital = key === "samarkand";
  const active = !capital || scene.capitalActive;
  const group = svgElement("g");
  if (active && !reducedMotion.matches) group.append(svgElement("circle", { cx: x, cy: y, r: 12, class: "place-ring" }));
  group.append(capital
    ? svgElement("path", { d: `M${x},${y - 8} l8,8 -8,8 -8,-8 Z`, class: "capital-dot" })
    : svgElement("circle", { cx: x, cy: y, r: 6, class: `place-dot${active ? " active" : ""}` }));
  const summaryAnkara = scene.summary && mobile.matches && key === "ankara";
  const offset = summaryAnkara ? [15, 30] : scene.summary && key === "otrar" ? [10, -20] : place.offset;
  group.append(svgElement("text", {
    x: x + offset[0], y: y + offset[1],
    class: capital ? "capital-label" : `place-label${active ? " active" : ""}`,
    "text-anchor": summaryAnkara ? "start" : place.anchor ?? "start",
  }, place.label));
  elements["map-places"].append(group);
}

function drawRoute(key, scene) {
  const route = routes[key];
  const d = pointsPath(route.points);
  const path = svgElement("path", { d, pathLength: 1, class: `route${route.planned ? " planned" : ""}` });
  // 破線の長さは画面上の長さで指定するため、正規化しない。
  if (route.planned) path.removeAttribute("pathLength");
  if (route.delay) path.style.animationDelay = `${route.delay}s`;
  elements["map-routes"].append(path);
  if (!route.planned && !reducedMotion.matches && !scene.summary) {
    const traveler = svgElement("circle", { r: 5, class: "arrival", opacity: 0 });
    const motion = svgElement("animateMotion", { path: d, dur: "1.2s", begin: `${route.delay ?? 0}s`, fill: "freeze" });
    const visibility = svgElement("animate", { attributeName: "opacity", values: "0;1;1;0", keyTimes: "0;0.02;0.96;1", dur: "1.2s", begin: `${route.delay ?? 0}s`, fill: "freeze" });
    traveler.append(motion, visibility);
    elements["map-routes"].append(traveler);
    // ページを開いてから何分経っても、その場面で動き始める。
    motion.beginElementAt(route.delay ?? 0);
    visibility.beginElementAt(route.delay ?? 0);
  }
}

function renderMap(scene) {
  ["map-regions", "map-labels", "map-routes", "map-places", "map-annotations"].forEach((id) => elements[id].replaceChildren());
  elements["story-map"].setAttribute("viewBox", (mobile.matches ? scene.mobileCamera : scene.camera).join(" "));
  elements["story-map"].classList.toggle("eastward", scene.regions.includes("ming"));
  elements["story-map"].classList.toggle("overview", Boolean(scene.summary));
  elements["map-heading"].textContent = scene.mapHeading;
  elements["map-title"].textContent = scene.mapHeading;
  elements["map-description"].textContent = scene.mapDescription;
  for (const key of scene.regions) {
    const region = regions[key];
    elements["map-regions"].append(svgElement("path", { d: pointsPath(region.points, true), class: `region ${region.kind ?? ""}` }));
  }
  for (const [point, text] of [ [[34,43.8],"黒海"], [[51,41.3],"カスピ海"], [[27,32],"地中海"], [[64,20],"アラビア海"] ]) {
    elements["map-labels"].append(mapText(point, text, "sea-label"));
  }
  for (const key of scene.labels) {
    const label = labels[key];
    elements["map-labels"].append(mapText(label.point, label.text, "region-label active"));
  }
  for (const key of scene.routes ?? []) drawRoute(key, scene);
  drawPlace("samarkand", scene);
  for (const key of scene.places) drawPlace(key, scene);
  if (scene.split) {
    elements["map-annotations"].append(svgElement("path", { d: pointsPath([[74,46],[72.6,43],[74,40],[72.5,36]]), fill: "none", stroke: "#fdfaf4", "stroke-width": 5, "stroke-dasharray": "6 5" }));
    elements["map-annotations"].append(mapText([65,33], "西側からティムール", "map-callout"));
  }
  if (scene.afterAnkara) elements["map-annotations"].append(mapText([41,30], "旧支配者へ領地を戻す", "map-callout"));
  if (scene.stop) {
    const [x,y] = project(places.otrar.point);
    elements["map-annotations"].append(svgElement("path", { d: `M${x - 7},${y - 8} l14,16 m0,-16 l-14,16`, fill: "none", stroke: "#a6422c", "stroke-width": 4 }));
    elements["map-annotations"].append(mapText([81,49], "1405年、ここで病死", "map-callout"));
  }
  if (scene.summary && mobile.matches) {
    elements["map-labels"].replaceChildren(mapText(labels.ming.point, labels.ming.text, "region-label active"));
  }
}

function renderScene({ moveToStage = false } = {}) {
  const scene = scenes[sceneIndex];
  elements["scene-number"].textContent = `${String(sceneIndex + 1).padStart(2, "0")} / ${scenes.length}`;
  elements["scene-year"].textContent = scene.year;
  elements["scene-kicker"].textContent = scene.kicker;
  elements["scene-title"].replaceChildren(...scene.title.split("\n").flatMap((line, i) => i ? [document.createElement("br"), document.createTextNode(line)] : [document.createTextNode(line)]));
  // 本文はこのファイルで管理する固定の説明文だけを使う。
  elements["scene-body"].innerHTML = scene.body.map((paragraph) => `<p>${paragraph}</p>`).join("");
  elements["scene-takeaway"].textContent = scene.takeaway;
  elements["scene-note"].textContent = scene.note;
  elements.previous.disabled = sceneIndex === 0;
  elements.next.replaceChildren(document.createTextNode(sceneIndex === scenes.length - 1 ? "最初から" : "次へ"), Object.assign(document.createElement("span"), { textContent: sceneIndex === scenes.length - 1 ? "↻" : "→" }));
  elements["story-progress"].value = sceneIndex + 1;
  elements["story-progress"].textContent = `${sceneIndex + 1} / ${scenes.length}`;
  elements["progress-label"].textContent = `${sceneIndex + 1} / ${scenes.length}`;
  for (const button of elements["scene-nav"].children) {
    if (Number(button.dataset.scene) === sceneIndex) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
  }
  const chapter = sceneIndex < 3 ? 0 : sceneIndex < 10 ? 3 : 10;
  document.querySelectorAll("[data-chapter]").forEach((button) => {
    if (Number(button.dataset.chapter) === chapter) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
  });
  renderMap(scene);
  renderCharacterTheater(elements["character-theater"], scene.characters);
  elements.narrative.classList.remove("scene-enter");
  void elements.narrative.offsetWidth;
  elements.narrative.classList.add("scene-enter");
  if (moveToStage && mobile.matches) document.querySelector(".chapter-nav").scrollIntoView({ block: "start", behavior: "instant" });
}

function goTo(index) {
  const nextIndex = Math.max(0, Math.min(scenes.length - 1, index));
  if (nextIndex === sceneIndex) return;
  sceneIndex = nextIndex;
  renderScene({ moveToStage: true });
}

scenes.forEach((scene, index) => {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.scene = index;
  button.textContent = String(index + 1).padStart(2, "0");
  button.title = `${index + 1}. ${scene.title.replace("\n", "")}`;
  button.setAttribute("aria-label", button.title);
  button.addEventListener("click", () => goTo(index));
  elements["scene-nav"].append(button);
});
elements.previous.addEventListener("click", () => goTo(sceneIndex - 1));
elements.next.addEventListener("click", () => goTo(sceneIndex === scenes.length - 1 ? 0 : sceneIndex + 1));
elements.replay.addEventListener("click", () => {
  renderMap(scenes[sceneIndex]);
  renderCharacterTheater(elements["character-theater"], scenes[sceneIndex].characters);
});
document.querySelectorAll("[data-chapter]").forEach((button) => button.addEventListener("click", () => goTo(Number(button.dataset.chapter))));
document.addEventListener("keydown", (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat) return;
  if (event.target.closest("input, textarea, select, [contenteditable=true], details")) return;
  if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
    event.preventDefault();
    goTo(sceneIndex + (event.key === "ArrowRight" ? 1 : -1));
  }
});
mobile.addEventListener("change", () => renderMap(scenes[sceneIndex]));
reducedMotion.addEventListener("change", () => renderMap(scenes[sceneIndex]));
// 独立した無音のページ。学習用の音声・設定・履歴は読み込まない。
renderScene();
