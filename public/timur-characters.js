// 整数の升目だけで描く人物。衣装の色と頭飾りを人物ごとに固定する。
const ink = "#252731";
const people = {
  timur: { name: "ティムール", hat: "helmet", coat: "#227fa6", light: "#51b0c4", dark: "#235073", trim: "#e9b94f", beard: true, cape: "#973e48" },
  princess: { name: "チャガタイ家の王女", hat: "crown", coat: "#ad5775", light: "#dc8a9b", dark: "#713d64", trim: "#f0ce70", dress: true },
  genghis: { name: "チンギス＝ハン", hat: "fur", coat: "#866137", light: "#be9957", dark: "#544636", trim: "#edcc7a", beard: true },
  tokhtamysh: { name: "トクタミシュ", hat: "fur", coat: "#735a9a", light: "#a38ab9", dark: "#49446b", trim: "#e2c58d", beard: true },
  bayezid: { name: "バヤジット1世", hat: "turban", coat: "#a74243", light: "#d26b57", dark: "#6f343d", trim: "#eac569", beard: true },
  chief: { name: "部族の長", hat: "fur", coat: "#6a8171", light: "#99aa7d", dark: "#465851", trim: "#d9bd7b", beard: true },
  scholar: { name: "イスラームを学ぶ人", hat: "turban", coat: "#428a78", light: "#7bb397", dark: "#346358", trim: "#e6d5a0" },
  ruler: { name: "各地の支配者", hat: "crown", coat: "#997447", light: "#c8a66b", dark: "#64513c", trim: "#f1d17a", beard: true },
  tughluq: { name: "トゥグルク朝の支配者", hat: "turban", coat: "#577c59", light: "#87ac75", dark: "#405847", trim: "#e6c16b", beard: true },
  citizen: { name: "町の人", hat: "cap", coat: "#ba8961", light: "#d8b185", dark: "#87664e", trim: "#e9d8ae" },
  ming: { name: "明の皇帝（模式）", hat: "imperial", coat: "#ac493d", light: "#d66e49", dark: "#743b34", trim: "#f0c85a", beard: true },
  attendant: { name: "付き添う人", hat: "cap", coat: "#608d9b", light: "#99bac2", dark: "#44616e", trim: "#e0d5b0" },
};

const actor = (person, mood, words, options = {}) => ({ person, mood, words, ...options });
export const characterScenes = {
  culture: {
    title: "言葉と信仰が変わっていく", setting: "steppe", action: "change", symbol: "book", cue: "文化の変化",
    description: "モンゴル系の支配者が考え込み、トルコ語やイスラームを学んで納得した笑顔に変わる。隣には学ぶ相手を模式的に描く。",
    cast: [actor("chief", "happy", "なるほど！", { name: "モンゴル系の支配者", before: "thinking", beforeWords: "新しい言葉と信仰…" }), actor("scholar", "happy", "トルコ語・イスラーム")],
  },
  split: {
    title: "争いの中からティムールが登場", setting: "steppe", action: "battle", symbol: "clash", cue: "内紛を勝ち抜く",
    description: "西側のティムールが決意した顔で前へ進み、対立する部族の長は怒った顔から困った顔に変わる。",
    cast: [actor("timur", "determined", "西側から力を伸ばす！", { pose: "advance", weapon: true }), actor("chief", "worried", "勢いを止められない…", { before: "angry", beforeWords: "主導権を争うぞ！", pose: "recoil", weapon: true })],
  },
  marriage: {
    title: "王女との結婚で、王家の「婿」に", setting: "palace", action: "marriage", symbol: "heart", cue: "婚姻でつながる", ancestor: true,
    description: "笑顔のティムールとチャガタイ家の王女が近づき、間にハートが現れる。上の小さなチンギス＝ハンの像は王女の祖先を表し、同時代の対面ではない。",
    cast: [actor("timur", "happy", "王家の婿に！", { before: "neutral", beforeWords: "王家と結びつこう", pose: "approach" }), actor("princess", "happy", "婚姻で結びつく", { before: "neutral", beforeWords: "私は王家の子孫", pose: "approach" })],
  },
  north: {
    title: "北方へ遠征し、トクタミシュを破る", setting: "steppe", action: "battle", symbol: "clash", cue: "北方で勝利",
    description: "青い鎧のティムールが勇ましく進軍し、紫の衣装のトクタミシュは強気の表情から驚きと敗北の表情に変わる。",
    cast: [actor("timur", "determined", "北の勢力を破る！", { pose: "advance", weapon: true }), actor("tokhtamysh", "shocked", "勢力が弱まった…", { before: "angry", beforeWords: "迎え撃つ！", pose: "recoil", weapon: true })],
  },
  iran: {
    title: "イランの諸勢力を支配下へ", setting: "city", action: "battle", symbol: "flag", cue: "支配下へ",
    description: "ティムールが真剣な顔で進み、イランの支配者を表す人物は困った表情に変わる。城の前にティムール側の旗が上がる。",
    cast: [actor("timur", "determined", "イランを支配下へ", { pose: "advance", weapon: true }), actor("ruler", "worried", "支配者が変わる…", { name: "イランの諸勢力", before: "angry", beforeWords: "領地を守れ！", pose: "recoil" })],
  },
  caucasus: {
    title: "二つの海の間にも軍を進める", setting: "mountains", action: "march", symbol: "flag", cue: "さらに進軍",
    description: "山々を背景にティムールが決意した表情で足踏みし、コーカサスの支配者を表す人物は軍の接近に驚く。",
    cast: [actor("timur", "determined", "二つの海の間へ！", { pose: "advance", weapon: true }), actor("ruler", "shocked", "ここにも軍が！", { name: "コーカサスの諸勢力", before: "neutral", beforeWords: "黒海とカスピ海の間", pose: "recoil" })],
  },
  delhi: {
    title: "デリーの占領で王朝に打撃", setting: "city", action: "battle", symbol: "clash", cue: "デリー占領",
    description: "ティムールが進軍。トゥグルク朝の支配者を表す人物は抵抗する表情から悲しい表情に変わり、王朝への打撃を示す。",
    cast: [actor("timur", "determined", "デリーに進軍！", { pose: "advance", weapon: true }), actor("tughluq", "sad", "王朝に大きな打撃…", { before: "angry", beforeWords: "都を守れ！", pose: "recoil" })],
  },
  syria: {
    title: "占領と略奪で、町にも大きな被害", setting: "city", action: "battle", symbol: "clash", cue: "町を占領",
    description: "ティムールは厳しい表情で軍を進める。町の人は驚いた顔から涙を浮かべた悲しい顔に変わり、占領による被害を表す。",
    cast: [actor("timur", "determined", "シリア・イラクへ", { pose: "advance", weapon: true }), actor("citizen", "sad", "町に大きな被害が…", { before: "shocked", beforeWords: "軍がやってきた！", pose: "recoil" })],
  },
  ankara: {
    title: "バヤジット1世を破り、捕虜に", setting: "battlefield", action: "capture", symbol: "clash", cue: "敗北 → 捕虜",
    description: "青い鎧のティムールと赤い衣装に白いターバンのバヤジット1世が対峙する。バヤジット1世は怒った顔から落胆した顔に変わり、前に格子が現れて捕虜になったことを示す。",
    cast: [actor("timur", "determined", "アンカラで勝利！", { before: "angry", beforeWords: "いざ、対決！", pose: "advance", weapon: true }), actor("bayezid", "sad", "捕虜になってしまった", { before: "angry", beforeWords: "迎え撃つぞ！", pose: "recoil", captive: true, weapon: true })],
  },
  return: {
    title: "旧支配者たちへ領地を戻す", setting: "palace", action: "gift", symbol: "scroll", cue: "領地を返す",
    description: "穏やかな顔のティムールが領地を示す巻物を渡し、アナトリアの旧支配者を表す人物は驚いた顔から喜ぶ顔に変わる。",
    cast: [actor("timur", "happy", "領地を戻そう", { pose: "offer" }), actor("ruler", "happy", "領地が戻ってきた！", { name: "アナトリアの旧支配者", before: "shocked", beforeWords: "私たちの領地は…", pose: "approach" })],
  },
  ming: {
    title: "明を目指す。ただし、対決は実現せず", setting: "palace", action: "plan", symbol: "arrow", cue: "遠征の計画",
    description: "ティムールが東を指し、遠くに明の皇帝を模式的に描く。間に破線の矢印を置き、二人は接近も戦闘もしない。",
    cast: [actor("timur", "determined", "次は、東の明へ！", { pose: "offer" }), actor("ming", "neutral", "はるか東の中国", { beforeWords: "はるか東の中国" })],
  },
  death: {
    title: "オトラルで病死し、遠征は中止に", setting: "snow", action: "illness", symbol: "pause", cue: "遠征は中止",
    description: "病気で汗を浮かべたティムールがうつむき、やがて目を閉じる。付き添う人は悲しい顔になる。明に到達する前の死を静かに表現する。",
    cast: [actor("timur", "closed", "オトラルで病死", { before: "ill", beforeWords: "遠征の途中で病に…", pose: "ill" }), actor("attendant", "sad", "明には届かなかった", { before: "worried", beforeWords: "体調が心配だ…" })],
  },
  summary: {
    title: "同じ人物の、成立・遠征・最期", setting: "steppe", action: "recap", cue: "ティムールの生涯",
    description: "同じティムールを三つの時期に分けて表示。成立時は笑顔、遠征時は勇ましい顔、最期は病気の顔で、人生の流れを振り返る。",
    cast: [actor("timur", "happy", "王家の婿となる", { name: "1370年・成立" }), actor("timur", "determined", "各地へ遠征", { name: "1398・1402年", weapon: true }), actor("timur", "ill", "オトラルで病死", { name: "1405年・最期" })],
  },
};

function rect(x, y, width, height, fill) {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}"/>`;
}
function path(d, fill) { return `<path d="${d}" fill="${fill}"/>`; }

function face(mood, beard) {
  let result = "";
  const worried = ["worried", "sad", "ill", "closed"].includes(mood);
  const eyeY = 24;
  for (const x of [16, 29]) {
    if (mood === "happy") result += path(`M${x - 1} ${eyeY + 2}v-2h1v-1h3v1h1v2h-2v-1h-2v1z`, ink);
    else if (["ill", "closed"].includes(mood)) result += rect(x - 1, eyeY + 2, 6, 1, ink) + rect(x, eyeY + 3, 4, 1, ink);
    else result += rect(x - 1, eyeY, 6, mood === "shocked" ? 6 : 5, "#fff4d7") + rect(x + 1, eyeY, 3, mood === "shocked" ? 5 : 4, ink);
  }
  if (["angry", "determined"].includes(mood)) result += path("M14 20h4v1h4v3h-4v-1h-4z M27 22h4v-1h4v-1h2v3h-4v1h-6z", ink);
  else if (worried) result += path("M14 23v-2h4v-2h4v2h-4v2z M27 19h4v2h5v2h-5v-2h-4z", "#6c493c");
  else result += rect(14, 21, 8, 2, "#6c493c") + rect(27, 21, 8, 2, "#6c493c");
  result += rect(24, 28, 3, 3, "#c47e59") + rect(14, 30, 4, 2, "#e58c70") + rect(32, 30, 4, 2, "#e58c70");
  if (beard) result += path("M12 30h3v3h5v-2h4v1h4v-1h5v2h3v-3h3v7h-4v3h-5v2h-9v-2h-5v-3h-4z", "#42332c");
  const mouthY = beard ? 34 : 33;
  if (mood === "happy") result += rect(21, mouthY, 10, 2, ink) + rect(23, mouthY + 2, 6, 2, "#eaa08b") + rect(23, mouthY, 6, 1, "#fff4d7");
  else if (["shocked", "angry"].includes(mood)) result += rect(23, mouthY, 6, 5, ink) + rect(24, mouthY + 3, 4, 1, "#d88b78");
  else if (worried) result += path(`M21 ${mouthY + 2}v-2h2v-1h6v1h2v2h-2v-1h-6v1z`, ink);
  else result += rect(22, mouthY, 8, 2, ink);
  if (["worried", "shocked", "ill"].includes(mood)) result += path("M38 23h2v3h1v4h-4v-4h1z", "#67b9d0") + rect(38, 26, 1, 2, "#d4f0eb");
  if (mood === "sad") result += rect(16, 29, 2, 6, "#71b9d4") + rect(30, 29, 2, 6, "#71b9d4");
  if (mood === "ill") result += rect(18, 16, 14, 3, "#d7e1d5");
  return result;
}

function headwear(person) {
  const gold = person.trim;
  if (person.hat === "helmet") return [
    path("M25 0h5v3h4v4h3v4h-5V8h-4V5h-3z", ink),
    path("M25 2h3v3h4v3h3v2h-4V7h-4V5h-2z", "#8c6240"),
    path("M19 5h11v3h5v4h4v5h3v8h-8v-4H13v4H7v-9h4v-5h4V8h4z", ink),
    path("M20 8h9v3h5v4h4v4H12v-4h4v-4h4z", person.coat),
    rect(21, 9, 4, 8, person.light), rect(24, 8, 3, 13, gold),
    path("M10 17h30v6h-7v-2H16v2h-6z", gold), rect(11, 18, 3, 4, "#ffe499"),
    rect(23, 15, 6, 6, "#9d433a"), rect(24, 15, 2, 2, "#ed8b56"),
    rect(7, 24, 5, 13, person.dark), rect(38, 24, 5, 13, person.coat), rect(39, 25, 2, 3, gold), rect(39, 32, 2, 3, gold),
  ].join("");
  if (person.hat === "fur") return [
    path("M18 6h15v3h4v4h4v7H9v-7h4V9h5z", ink),
    path("M19 9h12v3h5v5H14v-5h5z", person.dark), rect(18, 10, 7, 3, person.light),
    rect(10, 16, 30, 5, "#d4be92"), rect(12, 16, 4, 3, "#f2e0b4"), rect(22, 16, 4, 3, "#f2e0b4"), rect(34, 16, 4, 3, "#f2e0b4"),
    rect(10, 20, 4, 10, "#66513e"), rect(37, 20, 3, 10, "#66513e"),
  ].join("");
  if (person.hat === "turban") return [
    path("M16 5h18v3h5v4h3v8h-4v3H12v-3H8v-8h3V8h5z", ink),
    path("M17 8h16v2h5v4h2v4h-6v3H14v-3h-4v-5h4v-3h3z", "#f5e9c8"),
    rect(12, 14, 25, 3, "#cfc49f"), rect(18, 9, 4, 4, "#fff6dc"), rect(20, 17, 19, 2, "#fff6dc"),
    rect(25, 7, 3, 13, person.coat), rect(24, 15, 6, 6, gold), rect(26, 16, 2, 3, person.coat),
  ].join("");
  if (person.hat === "crown") return [
    path("M11 12h5V7h4v5h4V5h5v7h4V7h4v5h4v10H11z", ink),
    path("M14 14h4v-4h1v4h7V8h1v6h8v-4h1v4h3v5H14z", gold),
    rect(25, 15, 3, 3, person.coat), rect(16, 15, 2, 2, "#fff0b1"), rect(35, 15, 2, 2, "#fff0b1"),
  ].join("");
  if (person.hat === "imperial") return [
    path("M15 8h21v5h4v7H10v-7h5z M3 12h8v6H3z M39 12h8v6h-8z", ink),
    rect(17, 10, 16, 7, "#4a4646"), rect(12, 18, 26, 3, gold), rect(23, 11, 6, 7, gold), rect(25, 13, 2, 3, person.coat),
  ].join("");
  return path("M16 9h18v3h5v7H10v-7h6z", ink) + rect(14, 12, 21, 5, person.coat) + rect(12, 17, 26, 3, person.trim);
}

export function pixelPerson(personKey, mood = "neutral", options = {}) {
  const person = people[personKey];
  if (!person) throw new Error(`人物が見つかりません: ${personKey}`);
  const skin = "#edb17d";
  const bits = [];
  if (person.cape) bits.push(path("M11 36h26v21h4v6h-5v3H10v-4H7v-8h4z", ink), path("M13 39h22v17h4v5h-6v2H12v-4H9v-5h4z", person.cape));
  bits.push(path("M14 47h22v15h4v7H26v-6h-4v6H8v-7h6z", ink), rect(16, 49, 8, 13, person.dark), rect(27, 49, 7, 13, person.coat));
  bits.push(`<g class="pixel-foot pixel-foot-left">${rect(11, 63, 12, 4, "#6e4835")}${rect(13, 63, 4, 2, "#a27247")}</g><g class="pixel-foot pixel-foot-right">${rect(28, 63, 10, 4, "#6e4835")}${rect(29, 63, 4, 2, "#a27247")}</g>`);
  bits.push(path("M14 35h21v3h5v6h3v10h-8v-4H14v4H6V44h3v-6h5z", ink));
  bits.push(rect(14, 38, 21, 16, person.coat), rect(15, 39, 5, 12, person.light), rect(32, 39, 3, 14, person.dark));
  bits.push(`<g class="pixel-arm-left">${rect(9, 40, 5, 8, person.light)}${rect(8, 48, 5, 4, skin)}</g><g class="pixel-arm-right">${rect(35, 40, 5, 8, person.dark)}${rect(36, 48, 5, 4, skin)}</g>`);
  if (person.dress) {
    bits.push(path("M14 44h21v5h2v5h3v8H9v-8h3v-5h2z", ink), path("M16 44h17v6h2v5h3v4H11v-4h3v-5h2z", person.coat));
    bits.push(rect(23, 42, 4, 17, person.trim), rect(12, 58, 26, 2, person.trim), rect(16, 51, 3, 5, person.light), rect(30, 51, 3, 5, person.light));
  } else {
    for (const y of [41, 46, 55]) for (const x of [16, 23, 30]) bits.push(rect(x, y, 4, 3, (x + y) % 2 ? person.trim : person.light));
    bits.push(rect(13, 51, 23, 4, "#59432f"), rect(23, 51, 6, 4, person.trim), rect(25, 52, 2, 2, "#6f4e31"));
  }
  if (options.weapon) {
    bits.push(`<g class="pixel-weapon">${path("M3 25h3v16H3z M1 41h7v3H1z M3 44h3v8H3z", ink)}${rect(4, 27, 1, 13, "#d3e7e7")}${rect(1, 42, 7, 1, person.trim)}${rect(4, 45, 1, 5, "#a47b4a")}</g>`);
    bits.push(path("M36 43h11v15h-3v4h-5v-4h-3z", ink), path("M38 45h7v12h-2v3h-2v-3h-3z", person.trim), rect(40, 46, 3, 11, person.dark));
  }
  bits.push(`<g class="pixel-head">`);
  if (person.dress) bits.push(path("M13 15h23v4h4v23H10V19h3z", ink), rect(12, 23, 4, 20, "#6c4235"), rect(35, 23, 3, 20, "#6c4235"));
  bits.push(path("M15 15h20v3h4v15h-3v5H15v-4h-4V19h4z", ink));
  bits.push(path("M16 18h17v2h4v12h-4v4H16v-4h-3V21h3z", skin), rect(14, 21, 3, 9, "#f5c78e"), rect(33, 22, 4, 10, "#d78b60"));
  if (options.before && options.before !== mood) bits.push(`<g class="expression-before">${face(options.before, person.beard)}</g>`);
  bits.push(`<g class="${options.before && options.before !== mood ? "expression-after" : "expression-static"}">${face(mood, person.beard)}</g>`);
  bits.push(headwear(person));
  if (person.dress) bits.push(rect(12, 29, 2, 4, person.trim), rect(36, 29, 2, 4, person.trim));
  bits.push("</g>");
  return `<svg class="pixel-person" viewBox="0 0 48 72" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true"><g${options.mirror ? ' transform="translate(48 0) scale(-1 1)"' : ""}>${bits.join("")}</g></svg>`;
}

function eventSymbol(symbol) {
  const drawings = {
    heart: path("M3 4h7v3h4V4h7v3h3v8h-3v3h-3v3h-3v3H9v-3H6v-3H3v-3H0V7h3z", ink) + path("M4 6h5v3h6V6h5v3h2v5h-3v3h-3v3h-4v2h-1v-2H8v-3H5v-3H2V9h2z", "#d76b7e") + rect(5, 7, 3, 3, "#ffbdaf"),
    clash: path("M0 1h4l7 7V5h3v4l7-8h4v4l-8 8h4v3h-5l8 8h-5l-7-7-7 7H0l8-9H3v-3h5L0 4z", ink) + path("M2 2h2l8 9L22 2h1v2l-9 9 8 9h-2l-8-8-9 9H2l9-11z", "#f1cf71"),
    flag: rect(5, 2, 3, 23, ink) + path("M8 2h16v13H8z", ink) + rect(8, 4, 14, 9, "#3288a8") + rect(13, 6, 4, 5, "#edc45f") + rect(2, 24, 11, 2, ink),
    scroll: path("M3 2h17v3h4v7h-4v12H3v-3H0v-7h3z", ink) + rect(5, 4, 13, 18, "#f2d39c") + rect(2, 16, 3, 5, "#bf955c") + rect(19, 5, 3, 5, "#f7e2b4") + rect(8, 8, 7, 2, "#a2784a") + rect(8, 12, 7, 2, "#a2784a") + rect(9, 17, 5, 3, "#b65244"),
    book: path("M1 4h10l2 2 2-2h10v19H15l-2 2-2-2H1z", ink) + rect(3, 6, 8, 15, "#f7e4ad") + rect(15, 6, 8, 15, "#e5c58a") + rect(5, 9, 4, 1, "#987f54") + rect(17, 9, 4, 1, "#987f54") + rect(5, 13, 4, 1, "#987f54") + rect(17, 13, 4, 1, "#987f54"),
    arrow: rect(1, 11, 4, 3, "#6c8998") + rect(8, 11, 4, 3, "#6c8998") + rect(15, 11, 4, 3, "#6c8998") + path("M18 5h3v3h3v3h3v3h-3v3h-3v3h-3v-4h3v-5h-3z", "#6c8998"),
    pause: rect(4, 4, 7, 20, "#657b8a") + rect(17, 4, 7, 20, "#657b8a"),
  };
  return `<svg viewBox="0 0 28 28" shape-rendering="crispEdges" aria-hidden="true">${drawings[symbol] ?? ""}</svg>`;
}

function backdrop(setting) {
  const snowy = setting === "snow";
  const sky = snowy ? "#d3e0e4" : "#c8e1e5";
  const sand = snowy ? "#f0f0e6" : "#dfcaa0";
  let decor = path("M0 70h25V58h35V48h25v10h26v12h43V55h30V44h30v11h35v15h40V55h35V39h28v16h30v15h43v-9h32v-9h30v9h36v9h47v30H0z", snowy ? "#b8cccd" : "#acbfb1");
  if (["city", "palace", "battlefield"].includes(setting)) decor += path("M34 108V53h10V42h12v11h10v55z M70 108V70h8V59h8V48h12V38h16v10h12v11h8v11h8v38z M146 108V53h10V42h12v11h10v55z", "#91abb0") + rect(44, 57, 12, 51, "#b7ced0") + rect(78, 74, 56, 34, "#b8c9be") + rect(97, 84, 18, 24, "#74939c") + rect(90, 70, 32, 4, "#d8c28c");
  if (["steppe", "snow"].includes(setting)) decor += path("M393 108V83h7v-7h9v-8h18v8h10v7h8v25z", "#a79375") + path("M398 105V85h7v-8h23v8h11v20z", "#f0e3be") + rect(398, 89, 41, 4, "#bd8768") + rect(414, 92, 12, 16, "#877d67");
  if (setting === "mountains") decor += path("M15 108V90h15V72h15V52h15V32h15V19h12v13h12v20h15v20h15v18h15v18z M356 108V85h14V65h15V43h15V23h12v20h15v22h15v20h15v23z", "#9aafb0") + path("M60 43V32h15V19h12v13h12v11H85v-9H73v9z M388 43h12V23h12v20h10v9h-13v-9h-9v9h-12z", "#edf0df");
  return `<svg class="theater-backdrop" viewBox="0 0 480 140" preserveAspectRatio="xMidYMax slice" shape-rendering="crispEdges" aria-hidden="true">${rect(0, 0, 480, 140, sky)}${path("M28 24h13v-7h17v7h15v7H28z M317 20h17v-7h13v7h21v8h-51z", "#ecf3e9")}${decor}${rect(0, 108, 480, 32, sand)}${rect(13, 119, 36, 3, "#baa989")}${rect(210, 128, 39, 3, "#baa989")}${rect(391, 121, 26, 3, "#baa989")}</svg>`;
}

function characterMarkup(character, index) {
  const { person, mood, words, beforeWords = words, name = people[person].name, pose = "stand" } = character;
  const mirror = index === 1;
  return `<div class="theater-character character-${index} pose-${pose}" data-person="${person}" data-expression="${mood}">
    <div class="character-speech" aria-hidden="true"><span class="speech-before">${beforeWords}</span><span class="speech-after">${words}</span></div>
    <div class="character-figure"><div class="character-shadow"></div><div class="character-motion">${pixelPerson(person, mood, { ...character, mirror })}</div>${character.captive ? '<div class="captive-bars" aria-hidden="true"><i></i><i></i><i></i><i></i></div>' : ""}</div>
    <span class="character-name">${name}</span>
  </div>`;
}

export function renderCharacterTheater(root, key) {
  const scene = characterScenes[key];
  if (!scene) throw new Error(`人物の場面が見つかりません: ${key}`);
  root.dataset.event = key;
  root.className = `character-theater action-${scene.action}`;
  root.innerHTML = `<figcaption class="theater-heading"><span class="theater-eyebrow">人物で見る</span><span id="theater-title">${scene.title}</span></figcaption>
    <p class="visually-hidden" id="theater-description">${scene.description} 吹き出しは理解を助けるための創作です。</p>
    ${scene.ancestor ? `<div class="ancestor-line">${pixelPerson("genghis", "neutral")}<span><strong>チンギス＝ハン</strong>（祖先）<br />その血筋を引く王女との結婚</span></div>` : ""}
    <div class="theater-set">${backdrop(scene.setting)}<div class="theater-cast" data-count="${scene.cast.length}">${scene.cast.map(characterMarkup).join("")}</div>${scene.symbol ? `<div class="theater-event" aria-hidden="true">${eventSymbol(scene.symbol)}<span>${scene.cue}</span></div>` : ""}</div>`;
}
