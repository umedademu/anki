import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { atlas, byPlaceId, chapterContext, findMapPlaces, normalizeMapName } from "./world-history-so-atlas.mjs";

const esc = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const hash = value => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex").slice(0, 20);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const overlaps = (a, b) => a.x < b.x + b.w + 7 && a.x + a.w + 7 > b.x && a.y < b.y + b.h + 7 && a.y + a.h + 7 > b.y;

function mapFrame(places) {
  const points = places.flatMap(p => p.extent && p.kind === "region" && !["india", "central-asia", "indian-ocean", "china", "russia"].includes(p.id)
    ? [p.point, [p.extent[0], p.extent[1]], [p.extent[2], p.extent[3]]] : [p.point]);
  let west = Math.min(...points.map(p => p[0])) - 7, east = Math.max(...points.map(p => p[0])) + 7;
  let south = Math.min(...points.map(p => p[1])) - 5, north = Math.max(...points.map(p => p[1])) + 5;
  const cx = (west + east) / 2, cy = (south + north) / 2;
  const width = Math.max(30, east - west, (north - south) * 960 / 550);
  const height = width * 550 / 960;
  west = cx - width / 2; east = cx + width / 2; south = cy - height / 2; north = cy + height / 2;
  if (west < -18) { east += -18 - west; west = -18; }
  if (east > 122) { west -= east - 122; east = 122; }
  if (north > 55) { south -= north - 55; north = 55; }
  if (south < -26) { north += -26 - south; south = -26; }
  return [Math.max(-18, west), Math.max(-26, south), Math.min(122, east), Math.min(55, north)];
}

export function renderAnswerMap(baseSvg, selection) {
  const focus = selection.focus.map(id => byPlaceId.get(id));
  const context = selection.context.map(id => byPlaceId.get(id));
  assert.ok([...focus, ...context].every(Boolean));
  const all = [...focus, ...context];
  const frame = mapFrame(all), [west, south, east, north] = frame;
  const scale = Math.min(960 / (east - west), 550 / (north - south));
  const project = ([lon, lat]) => [20 + (lon - west) * scale, 38 + (north - lat) * scale];
  const inside = ([lon, lat]) => lon >= west && lon <= east && lat >= south && lat <= north;
  const mapBody = baseSvg.replace(/<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/<(title|desc)>[\s\S]*?<\/\1>/g, "");
  const baseView = `${(west + 18) * 14} ${(55 - north) * 14} ${(east - west) * 14} ${(north - south) * 14}`;
  const pieces = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 650" role="img" aria-labelledby="title desc"><title id="title">${esc(focus.map(p => p.name).join("・"))}の位置関係</title><desc id="desc">赤は注目する場所、灰色は位置の比較に使う場所、青い線は川。王朝の印は主要拠点であり領土境界ではありません。</desc><defs><clipPath id="map-clip"><rect x="20" y="38" width="960" height="550" rx="10"/></clipPath></defs><rect width="1000" height="650" fill="#f9faf7"/><g clip-path="url(#map-clip)"><svg x="20" y="38" width="960" height="550" viewBox="${baseView}" preserveAspectRatio="xMinYMin meet">${mapBody}</svg>`];
  const riverIds = new Set(all.filter(p => p.kind === "river").map(p => p.id));
  for (const river of atlas.filter(p => p.line)) {
    if (!river.line.some(inside)) continue;
    const points = river.line.map(p => project(p).map(n => n.toFixed(1)).join(",")).join(" ");
    pieces.push(`<polyline points="${points}" fill="none" stroke="${riverIds.has(river.id) ? "#166fa0" : "#67a3bb"}" stroke-width="${riverIds.has(river.id) ? 4 : 2}" stroke-linejoin="round"/>`);
  }
  for (const p of focus.filter(p => p.kind === "region" && p.extent)) {
    const [x, y] = project(p.point);
    pieces.push(`<ellipse cx="${x}" cy="${y}" rx="${Math.max(20, (p.extent[2] - p.extent[0]) * scale / 2)}" ry="${Math.max(12, (p.extent[3] - p.extent[1]) * scale / 2)}" fill="#ce7040" fill-opacity=".09" stroke="#b55c36" stroke-width="1.5" stroke-dasharray="7 5"/>`);
  }
  pieces.push("</g>");
  // 同じ都市を拠点とする王朝の名を、一つの番号からたどれるようにする。
  const groups = [];
  for (const p of all) {
    const key = p.point.join(","), existing = groups.find(g => g.key === key);
    if (existing) { existing.places.push(p); existing.focus ||= focus.includes(p); }
    else groups.push({ key, point: p.point, places: [p], focus: focus.includes(p) });
  }
  const occupied = [{ x: 765, y: 443, w: 210, h: 140 }, { x: 915, y: 42, w: 60, h: 80 }];
  // 地理上の点は動かさず、ラベルだけ空き場所に置いて引き出し線で結ぶ。
  occupied.push(...groups.map(g => { const [x,y] = project(g.point); return { x:x-10,y:y-10,w:20,h:20 }; }));
  const labels = [];
  let number = 0;
  for (const g of groups.sort((a,b) => Number(b.focus) - Number(a.focus))) {
    number++;
    const [x, y] = project(g.point), primary = g.places[0];
    const names = [primary.name];
    const seat = g.places.find(p => p.kind === "city" && p !== primary);
    if (seat) names.push(seat.name);
    const lines = names.flatMap(name => name.length > 11 ? [name.slice(0,11), name.slice(11)] : [name]).slice(0,3);
    const w = Math.min(265, Math.max(...lines.map(t => t.length)) * 21 + 18), h = lines.length * 27 + 12;
    const candidates = [];
    for (const distance of [18, 50, 95, 155, 230, 320]) {
      for (const [dx,dy] of [[1,-1],[1,0],[-1,-1],[-1,0],[0,-1],[0,1],[1,1],[-1,1]]) {
        const box = { x: clamp(x + dx * distance - (dx < 0 ? w : dx === 0 ? w/2 : 0), 26, 974-w), y: clamp(y + dy * distance - (dy <= 0 ? h : 0), 42, 582-h), w, h };
        if (!occupied.some(b => overlaps(box,b))) candidates.push(box);
      }
    }
    candidates.sort((a,b) => Math.hypot(a.x+w/2-x,a.y+h/2-y)-Math.hypot(b.x+w/2-x,b.y+h/2-y));
    const box = candidates[0];
    if (box) {
      occupied.push(box); labels.push(box);
      pieces.push(`<path d="M${x},${y} L${clamp(x,box.x,box.x+w)},${clamp(y,box.y,box.y+h)}" stroke="${g.focus ? "#b65031" : "#77867f"}" stroke-width="1.5" fill="none"/><rect x="${box.x}" y="${box.y}" width="${w}" height="${h}" rx="6" fill="#ffffff" fill-opacity=".95" stroke="${g.focus ? "#deaa91" : "#d2dbd4"}"/><text font-family="'Noto Sans JP','Yu Gothic',sans-serif" font-size="21" font-weight="${g.focus ? 700 : 500}" fill="${g.focus ? "#7c3022" : "#4e6058"}">${lines.map((line,i)=>`<tspan x="${box.x+9}" y="${box.y+27+i*27}">${esc(line)}</tspan>`).join("")}</text>`);
    } else assert.ok(!g.focus, `注目場所のラベルを配置できません: ${primary.name}`);
    pieces.push(`<circle cx="${x}" cy="${y}" r="${g.focus ? 12 : 7}" fill="${g.focus ? "#af442c" : "#526b60"}" stroke="white" stroke-width="2"/>`);
    if (g.focus) pieces.push(`<text x="${x}" y="${y+5}" font-family="sans-serif" font-size="14" font-weight="bold" text-anchor="middle" fill="white">${number}</text>`);
  }
  // 広域図の四角で、拡大した場所を見失わないようにする。
  pieces.push(`<g><rect x="769" y="448" width="202" height="135" rx="8" fill="white" stroke="#c5d0c8"/><text x="781" y="470" font-family="sans-serif" font-size="15" fill="#52665b">広域での位置</text><svg x="779" y="478" width="182" height="96" viewBox="0 0 1960 1134" preserveAspectRatio="none">${mapBody}<rect x="${(west+18)*14}" y="${(55-north)*14}" width="${(east-west)*14}" height="${(north-south)*14}" fill="#ce7040" fill-opacity=".12" stroke="#ac442c" stroke-width="18"/></svg></g><path d="M948 102 V62 M939 78 L948 60 L957 78" fill="none" stroke="#3b5548" stroke-width="3"/><text x="948" y="54" text-anchor="middle" font-family="sans-serif" font-size="17" fill="#3b5548">北</text><text x="28" y="620" font-family="'Yu Gothic',sans-serif" font-size="18" fill="#56685e"><tspan fill="#af442c">● 注目する場所</tspan>　<tspan fill="#526b60">● 比較する場所</tspan>　青線：川　点線：範囲の目安</text><text x="28" y="644" font-family="'Yu Gothic',sans-serif" font-size="16" fill="#617067">王朝の印は主要拠点。領土の境界は示していません。</text></svg>`);
  for (let i=0;i<labels.length;i++) for(let j=i+1;j<labels.length;j++) assert.ok(!overlaps(labels[i], labels[j]));
  return { svg: pieces.join(""), frame, labelCount: labels.length };
}

export function buildSOAnswerVisuals(snapshot, imageManifest, baseSvg) {
  const assets = new Map(), assignments = [], audit = [];
  const photos = imageManifest.assets.filter(a => /commons\.wikimedia\.org/.test(a.sourcePageUrl ?? "") &&
    /タージ|アルハンブラ|岩のドーム|アヤソフィア|スレイマン|オスマン1世|アクバル|バーブル|シャー|メフメト|ミナレット|アラベスク|コーラン|クルアーン|イブン|モスク|イスファハーン|コルドバ/.test(a.caption ?? ""));
  for (const deck of snapshot.decks) for (const term of deck.chunks.flatMap(c => c.terms)) {
    // この地理対応表は第6章の既存パート専用。他章を同じ背景地図へ割り当てない。
    if (!chapterContext[deck.entry.id]) continue;
    const question = term.stages.beginner[0];
    if (question.questionMap) {
      assignments.push({ questionId: question.id, existingQuestionMap: true });
      audit.push({ questionId: question.id, prompt: question.prompt, focus: ["既存の穴埋め地図と解答地図"], relatedImage: null });
      continue;
    }
    const selection = findMapPlaces(question, deck.entry.id);
    const { svg, frame } = renderAnswerMap(baseSvg, selection);
    const key = `subjects/world-history-so/answer-visuals/maps/${hash(svg)}.svg`;
    assets.set(key, svg);
    const focus = selection.focus.map(id => byPlaceId.get(id));
    const text = normalizeMapName(question.prompt + " " + question.answer);
    const relatedImage = photos.filter(a => normalizeMapName(a.caption).length >= 4 && text.includes(normalizeMapName(a.caption)))
      .sort((a,b) => Number(normalizeMapName(question.answer).includes(normalizeMapName(b.caption))) - Number(normalizeMapName(question.answer).includes(normalizeMapName(a.caption))) || b.caption.length - a.caption.length)[0];
    const map = { path: key, title: selection.fallback ? "学習範囲の位置" : "この問題の位置関係", alt: focus.map(p => p.name).join("、") + "の位置関係。王朝は主要拠点、地方はおおよその範囲を示す。", places: focus.map(({id,name,note,kind}) => ({id,name,note,kind})), contextPlaces: selection.context, frame };
    assignments.push({ questionId: question.id, map, ...(relatedImage ? { relatedImage } : {}) });
    audit.push({ questionId: question.id, prompt: question.prompt, focus: focus.map(p => p.name), fallback: selection.fallback, relatedImage: relatedImage?.caption ?? null });
  }
  assert.equal(new Set(assignments.map(a => a.questionId)).size, assignments.length);
  return { manifest: { schemaVersion: 1, subjectId: "world-history-so", version: hash(assignments), questionCount: assignments.length, attribution: { creator: "W-Historyの基図をもとに作成", source: "Natural Earth", licenseUrl: "https://www.naturalearthdata.com/about/terms-of-use/" }, assignments }, assets, audit };
}
