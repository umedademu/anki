// 人物は透過PNG。位置は地図と同じ緯度・経度から求める。
const capital = [66.97, 39.65];
const actor = (name, image, point, options = {}) => ({ name, image, point, ...options });
const expedition = (route, destination, opponent, before, after, result) => ({
  action: "march", routeKeys: [route], before, after, result,
  cast: [actor("ティムール", "timur-march", capital, { travel: true }), opponent],
  destination,
});
export const characterScenes = {
  culture: {
    action: "learn", before: "中央アジアで、言葉と信仰が変わっていく", after: "トルコ語とイスラームが広がる", result: "なるほど！", speaker: 0,
    cast: [actor("モンゴル系の支配者", "ruler-calm", capital, { afterImage: "ruler-happy", side: -1 }), actor("イスラームを学ぶ人", "scholar", capital, { side: 1 })],
  },
  split: {
    action: "conflict", before: "西チャガタイの部族どうしが争う", after: "西側の争いを勝ち抜き、ティムールが台頭", result: "主導権を握る",
    cast: [actor("ティムール", "timur-march", capital, { side: -1 }), actor("対立する部族（模式）", "ruler-calm", capital, { side: 1, afterImage: "ruler-worried" })],
  },
  marriage: {
    action: "marriage", before: "王家との結婚で、権威を得る", after: "王家の「婿」に。本人は直系の子孫ではない", result: "♥ 結婚", ancestor: true,
    cast: [actor("ティムール", "timur-calm", capital, { side: -1, afterImage: "timur-happy" }), actor("チャガタイ家の王女", "princess-calm", capital, { side: 1, afterImage: "princess-happy" })],
  },
  north: expedition("north", "sarai", actor("トクタミシュ", "tokhtamysh-angry", [47.2, 47.2], { afterImage: "tokhtamysh-worried", side: -1 }), "サマルカンド → カスピ海の北へ", "トクタミシュを破り、北方の勢力を弱める", "勢力が弱まる"),
  iran: expedition("iran", "isfahan", actor("イランの諸勢力（模式）", "ruler-calm", [51.68, 32.65], { afterImage: "ruler-worried", side: -1 }), "サマルカンド → イランへ", "イランの諸勢力を倒し、支配下へ", "支配下へ"),
  caucasus: expedition("caucasus", "georgia", actor("現地の勢力（模式）", "ruler-calm", [44.8, 41.7], { afterImage: "ruler-worried", side: -1 }), "イラン → 黒海とカスピ海の間へ", "アルメニア・グルジアにも進出", "ここにも軍が！"),
  delhi: expedition("india", "delhi", actor("トゥグルク朝（模式）", "ruler-calm", [77.21, 28.61], { afterImage: "ruler-worried", side: 1 }), "サマルカンド → 西北インドへ", "1398年、デリーを占領。略奪で王朝に打撃", "王朝に打撃"),
  syria: {
    action: "march", routeKeys: ["syria", "baghdad"], destination: "baghdad", before: "サマルカンド → ダマスクス → バグダード", after: "二つの町を占領。大きな被害が生まれた", result: "町に被害が…",
    cast: [actor("ティムール", "timur-march", capital, { travel: true }), actor("シリアの勢力（模式）", "ruler-calm", [36.29, 33.51], { side: -1, afterImage: "ruler-worried", reactAt: .41, until: .5 }), actor("イラクの勢力（模式）", "ruler-calm", [44.37, 33.31], { side: 1, afterImage: "ruler-worried", from: .5, reactAt: .91 })],
  },
  ankara: {
    ...expedition("ankara", "ankara", actor("バヤジット1世", "bayezid-angry", [32.86, 39.93], { afterImage: "bayezid-sad", side: -1 }), "バグダード方面 → アンカラへ", "1402年、アンカラで勝利。バヤジット1世は捕虜に", "敗北 → 捕虜"),
    action: "capture",
  },
  return: {
    action: "gift", before: "アンカラでの勝利後、領地を返す", after: "アナトリアの旧支配者へ返還。バルカンへは進まない", result: "領地を返還",
    cast: [actor("ティムール", "timur-calm", [32.86, 39.93], { side: -1, afterImage: "timur-happy" }), actor("旧支配者（模式）", "ruler-worried", [32.86, 39.93], { side: 1, afterImage: "ruler-happy" })],
  },
  ming: {
    action: "plan", before: "サマルカンドで軍を整える。目標は東の明", after: "青い破線は計画。明には到達していない", result: "目標は明",
    cast: [actor("ティムール", "timur-march", capital), actor("明の皇帝（模式）", "ming", [111, 36])],
  },
  death: {
    action: "death", routeKeys: ["otrar"], destination: "otrar", before: "サマルカンドを出発 → オトラルへ", after: "1405年、オトラルで病死。明への遠征は中止", result: "ここで病死",
    cast: [actor("ティムール", "timur-march", capital, { travel: true, afterImage: "timur-ill" }), actor("明の皇帝（模式）", "ming", [111, 36])],
  },
  summary: {
    action: "summary", before: "地名と出来事を結びつけて、振り返ろう", after: "サマルカンドから各地へ。最期はオトラル", result: "",
    cast: [actor("1405年・ティムール", "timur-ill", [68.3, 42.85])],
  },
};

const imagePath = (key) => `/images/timur/${key}.png`;
const imageCache = new Map();
function preload(key) {
  if (!imageCache.has(key)) imageCache.set(key, new Promise((resolve) => {
    const image = new Image();
    image.onload = image.onerror = resolve;
    image.src = imagePath(key);
  }));
  return imageCache.get(key);
}

function pathFor(definition, routes) {
  return (definition.routeKeys ?? []).flatMap((key, index) => {
    // 未実現の計画上へは人物を移動させない。
    const route = routes[key];
    return route.planned ? [] : index ? route.points.slice(1) : route.points;
  });
}

// 地形の表示範囲を保ちながら、出発点と到達点の人物も画面に収める。
export function characterCamera(scene, routes, project, width, height, small) {
  const definition = characterScenes[scene.characters];
  const route = pathFor(definition, routes);
  const points = [...definition.cast.filter((item) => !item.travel).map((item) => item.point), ...route].map(project);
  const base = small ? scene.mobileCamera : scene.camera;
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const side = small ? 77 : 104, top = small ? 119 : 155, bottom = small ? 86 : 85;
  const scale = Math.min(width / base[2], height / base[3], (width - side * 2) / Math.max(1, maxX - minX), (height - top - bottom) / Math.max(1, maxY - minY));
  const w = width / scale, h = height / scale;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const left = clamp(base[0] + (base[2] - w) / 2, maxX + side / scale - w, minX - side / scale);
  const upper = clamp(base[1] + (base[3] - h) / 2, maxY + bottom / scale - h, minY - top / scale);
  return [left, upper, w, h];
}

export function renderMapCharacters(root, scene, { map, routes, project, reducedMotion }) {
  const definition = characterScenes[scene.characters];
  const small = window.matchMedia("(max-width: 740px)").matches;
  const path = pathFor(definition, routes);
  const projected = path.map(project);
  const lengths = projected.slice(1).map((p, i) => Math.hypot(p[0] - projected[i][0], p[1] - projected[i][1]));
  const total = lengths.reduce((sum, value) => sum + value, 0);
  const twoStops = definition.routeKeys?.length === 2;
  const firstLeg = twoStops ? lengths.slice(0, routes[definition.routeKeys[0]].points.length - 1).reduce((sum, value) => sum + value, 0) / total : 1;
  let cancelled = false, frame = 0;
  root.replaceChildren();
  root.dataset.scene = scene.characters;
  root.dataset.phase = "loading";
  root.setAttribute("aria-label", `${definition.before}。${definition.after}。人物の表情と位置が変わります。`);
  const status = document.createElement("p");
  status.className = "map-action-status";
  status.textContent = definition.before;
  root.append(status);
  if (definition.ancestor) {
    const ancestor = document.createElement("div");
    ancestor.className = "map-ancestor";
    ancestor.innerHTML = `<img src="${imagePath("genghis")}" alt="" width="32" height="48"><span>王女の祖先<br><strong>チンギス＝ハン</strong><small>同時代の対面ではありません</small></span>`;
    root.append(ancestor);
  }
  const actors = definition.cast.map((item) => {
    const node = document.createElement("div");
    node.className = "map-actor";
    node.dataset.person = item.name;
    node.innerHTML = `<div class="map-person"><span class="map-speech"></span><img class="map-person-image" src="${imagePath(item.image)}" alt="${item.name}" width="128" height="192" draggable="false"><span class="map-person-name">${item.name}</span><span class="map-captive" hidden>捕虜</span></div>`;
    root.append(node);
    return { item, node, image: node.querySelector("img"), speech: node.querySelector(".map-speech"), person: node.firstElementChild, captive: node.querySelector(".map-captive") };
  });
  const pointAlong = (progress) => {
    let distance = progress * total;
    for (let i = 0; i < lengths.length; i++) {
      if (distance <= lengths[i]) {
        const ratio = distance / lengths[i];
        return [0, 1].map((axis) => projected[i][axis] + (projected[i + 1][axis] - projected[i][axis]) * ratio);
      }
      distance -= lengths[i];
    }
    return projected.at(-1);
  };
  const update = (progress) => {
    const finished = progress >= 1;
    const box = map.viewBox.baseVal;
    const scale = map.clientWidth / box.width;
    root.dataset.phase = finished ? "complete" : "moving";
    root.dataset.progress = progress.toFixed(3);
    status.textContent = finished ? definition.after : definition.before;
    actors.forEach(({ item, node, image, speech, person, captive }, index) => {
      node.hidden = progress < (item.from ?? 0) || progress >= (item.until ?? 2);
      const leg = twoStops ? progress < .5 ? progress * 2 : (progress - .5) * 2 : progress;
      const moving = item.travel && !finished && (!twoStops || leg < .82);
      const reacted = progress >= (item.reactAt ?? 1);
      const distanceProgress = twoStops ? progress < .5 ? firstLeg * Math.min(1, leg / .82) : firstLeg + (1 - firstLeg) * Math.min(1, leg / .82) : progress;
      const point = item.travel && path.length ? pointAlong(distanceProgress) : project(item.point);
      let side = item.side ?? 0;
      if (item.travel && definition.action !== "death") side = -(definition.cast.at(-1).side ?? 1) * Math.max(0, (progress - .82) / .18);
      if (item.travel && twoStops) side = (progress < .5 ? 1 : -1) * Math.min(1, Math.max(0, (leg - .58) / .24));
      const approach = definition.action === "marriage" ? 1.35 - progress * .35 : 1;
      const offset = side * (small ? 36 : 47) * approach;
      const x = (point[0] - box.x) * scale, y = (point[1] - box.y) * scale;
      node.style.transform = `translate(${x}px, ${y}px)`;
      person.style.marginLeft = `${offset}px`;
      node.dataset.mapX = point[0].toFixed(3);
      node.dataset.mapY = point[1].toFixed(3);
      node.classList.toggle("is-walking", Boolean(moving && !reducedMotion));
      node.classList.toggle("is-ill", definition.action === "death" && item.travel && finished);
      const nextImage = reacted && item.afterImage ? item.afterImage : item.image;
      if (node.dataset.image !== nextImage) { image.src = imagePath(nextImage); node.dataset.image = nextImage; }
      const speaker = definition.action === "death" ? item.travel : index === (definition.speaker ?? 1) || twoStops && index === 2;
      const showSpeech = reacted && speaker && !["plan", "summary"].includes(definition.action);
      speech.textContent = showSpeech ? definition.result : "";
      captive.hidden = !(definition.action === "capture" && index === 1 && finished);
    });
  };
  update(reducedMotion || definition.action === "summary" || definition.action === "plan" ? 1 : 0);
  root.dataset.phase = "loading";
  const keys = new Set(definition.cast.flatMap((item) => [item.image, item.afterImage].filter(Boolean)));
  Promise.all([...keys].map(preload)).then(() => {
    if (cancelled) return;
    if (reducedMotion || ["summary", "plan"].includes(definition.action)) { update(1); return; }
    const start = performance.now(), delay = 650;
    const duration = path.length ? definition.routeKeys.length > 1 ? 6800 : definition.action === "death" ? 2900 : 4600 : 1700;
    const animate = (now) => {
      if (cancelled) return;
      const progress = Math.min(1, Math.max(0, (now - start - delay) / duration));
      update(progress);
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
  });
  return () => { cancelled = true; cancelAnimationFrame(frame); };
}
