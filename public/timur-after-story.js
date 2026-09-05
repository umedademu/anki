import { locations, zones, scenes } from "./timur-after-scenes.js?v=0.184";

const NS = "http://www.w3.org/2000/svg";
const project = ([lon, lat]) => [(lon - 20) * 12, (58 - lat) * 15];
const pointOf = (place) => typeof place === "string" ? locations[place].point : place;
const asset = (name) => `/images/${name.includes("/") ? name : `timur-after/${name}`}.png`;
const colors = { move: "#467b92", campaign: "#b85434", peace: "#428974", trade: "#ac812e" };
const ids = ["story-map","map-heading","map-title","map-description","map-regions","map-labels","map-routes","map-places","map-annotations","map-characters","scene-number","scene-year","scene-kicker","scene-title","scene-body","scene-takeaway","scene-note","narrative","previous","next","replay","story-progress","progress-label","scene-nav"];
const el = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
const small = matchMedia("(max-width: 740px)");
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
let index = 0, stop = () => {}, lastSize = "";
const loaded = new Map();
function preload(name) {
  if (!loaded.has(name)) loaded.set(name, new Promise((resolve) => {
    const image = new Image();
    image.onload = image.onerror = resolve;
    image.src = asset(name);
  }));
  return loaded.get(name);
}
function svg(tag, attrs, text) {
  const node = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  if (text) node.textContent = text;
  return node;
}
const pathText = (points, closed = false) => points.map((p, i) => `${i ? "L" : "M"}${project(p).join(",")}`).join(" ") + (closed ? " Z" : "");
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
function routePosition(points, progress) {
  const positions = points.map(project);
  const lengths = positions.slice(1).map((p,i) => Math.hypot(p[0] - positions[i][0], p[1] - positions[i][1]));
  let remaining = lengths.reduce((a,b) => a+b, 0) * progress;
  for (let i=0;i<lengths.length;i++) {
    if (remaining <= lengths[i] && lengths[i] > 0) {
      const t = remaining / lengths[i];
      return positions[i].map((n,axis) => n + (positions[i+1][axis]-n)*t);
    }
    remaining -= lengths[i];
  }
  return positions.at(-1);
}
function camera(scene, width, height) {
  const [west,south,east,north] = scene.area;
  const base = [...project([west,north]), (east-west)*12, (north-south)*15];
  const items = [...scene.actors,...scene.props];
  const points = [...scene.pins.map((id) => locations[id].point), ...items.flatMap((item) => item.route === undefined ? [pointOf(item.at)] : scene.routes[item.route].points)].map(project);
  const xs = points.map(p=>p[0]), ys = points.map(p=>p[1]);
  const minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys);
  const side = small.matches ? 71 : 106;
  const top = scene.paddingTop ?? (small.matches ? 139 : 168), bottom = 93;
  const scale = Math.min(width/base[2], height/base[3], (width-side*2)/Math.max(1,maxX-minX), (height-top-bottom)/Math.max(1,maxY-minY));
  const w=width/scale, h=height/scale;
  const x=clamp(base[0]+(base[2]-w)/2,maxX+side/scale-w,minX-side/scale);
  const y=clamp(base[1]+(base[3]-h)/2,maxY+bottom/scale-h,minY-top/scale);
  return [x,y,w,h];
}

function renderMap(scene) {
  stop();
  const map = el["story-map"], width = map.clientWidth, height = map.clientHeight;
  const [left,top,w,h]=camera(scene,width,height), scale=width/w;
  map.setAttribute("viewBox", [left,top,w,h].join(" "));
  map.classList.toggle("fractured",Boolean(scene.fractured));
  ["map-regions","map-labels","map-routes","map-places","map-annotations"].forEach(id=>el[id].replaceChildren());
  el["map-heading"].textContent=scene.mapHeading;
  el["map-title"].textContent=scene.mapHeading;
  el["map-description"].textContent=`${scene.before}。${scene.after}。${scene.pins.map(id=>locations[id].name).join("、")}を地図に示します。`;
  for (const key of scene.zones) {
    const zone=zones[key];
    el["map-regions"].append(svg("path",{d:pathText(zone.points,true),class:"after-zone",fill:zone.color,stroke:zone.color}));
  }
  for (const [point,text] of [[[51,41.4],"カスピ海"],[[59.8,45.4],"アラル海"],[[34,43.8],"黒海"]]) {
    const [x,y]=project(point);
    if(x>left+20/scale&&x<left+w-20/scale&&y>top+14/scale&&y<top+h-50/scale) el["map-labels"].append(svg("text",{x,y,"text-anchor":"middle",class:"sea-label",style:`font-size:${(small.matches?10:12)/scale}px`},text));
  }
  scene.routes.forEach((route,i)=>{
    el["map-routes"].append(svg("path",{d:pathText(route.points),class:`after-route ${route.kind}`,stroke:colors[route.kind],"stroke-width":2/scale,"marker-end":`url(#after-${route.kind})`,"data-route":i}));
  });
  // 都市の印は地理上の位置に固定し、人物や建物は引き出し線でその場所と結ぶ。
  const pinNodes=scene.pins.map(key=>{
    const place=locations[key], [x,y]=project(place.point), isCapital=scene.capital===key;
    el["map-places"].append(isCapital ? svg("path",{d:`M${x},${y-5/scale} l${5/scale},${5/scale} -${5/scale},${5/scale} -${5/scale},-${5/scale} Z`,fill:"#24778a"}) : svg("circle",{cx:x,cy:y,r:3/scale,fill:"#a65335",stroke:"#fff9eb","stroke-width":1.5/scale}));
    const node=svg("text",{x,y,"text-anchor":"middle",class:isCapital?"capital-label":"place-label",style:`font-size:${(small.matches?10.5:12)/scale}px`},place.name);
    const guide=svg("line",{x1:x,y1:y,x2:x,y2:y,stroke:"#6c8384","stroke-width":.7/scale,opacity:.55});
    el["map-places"].append(guide,node);
    return {key,x,y,node,guide,labelWidth:node.getComputedTextLength()*scale+8};
  });
  const root=el["map-characters"];
  root.replaceChildren(); root.dataset.scene=scene.id; root.dataset.phase="loading";
  root.setAttribute("aria-label",`${scene.before}。${scene.after}。`);
  const status=document.createElement("p"); status.className="map-action-status"; status.textContent=scene.before; root.append(status);
  if(scene.relation) { const note=document.createElement("p"); note.className="map-relation"; note.textContent=scene.relation; root.append(note); }
  const items=[...scene.props,...scene.actors].map((item)=>{
    const node=document.createElement("div"); node.className=`after-map-item${item.kind==="prop"?" is-prop":""}${item.compact?" is-compact":""}`; node.dataset.name=item.name;
    const size=item.kind==="prop" ? item.size??76 : item.compact ? small.matches?44:54 : small.matches?54:72;
    node.style.setProperty("--item-width",`${size}px`); node.style.setProperty("--item-height",`${item.kind==="prop"?size:size*1.5}px`);
    node.innerHTML=`<span class="after-connector"></span><div class="after-figure"><span class="after-bubble"></span><img src="${asset(item.image)}" width="${item.kind==="prop"?192:128}" height="192" alt="${item.name}" draggable="false"><span class="after-name">${item.name}</span></div>`;
    root.append(node);
    return {item,node,figure:node.querySelector(".after-figure"),image:node.querySelector("img"),bubble:node.querySelector(".after-bubble"),connector:node.firstElementChild};
  });
  let cancelled=false, frame=0;
  const update=(progress)=>{
    root.dataset.progress=progress.toFixed(3);
    root.dataset.phase=progress>=1?"complete":"moving";
    status.textContent=progress>=1?scene.after:scene.before;
    const bounds=[];
    items.forEach(({item,node,figure,image,bubble,connector})=>{
      const moving=item.route!==undefined&&progress<1;
      const pos=item.route===undefined?project(pointOf(item.at)):routePosition(scene.routes[item.route].points,progress);
      const x=(pos[0]-left)*scale, y=(pos[1]-top)*scale;
      const arrival=item.route===undefined?1:clamp((progress-.78)/.22);
      const offset=(item.offset??[0,0]).map(v=>v*arrival);
      node.hidden=progress<(item.from??0);
      node.style.transform=`translate(${x}px,${y}px)`;
      node.dataset.mapX=pos[0].toFixed(3); node.dataset.mapY=pos[1].toFixed(3);
      figure.style.transform=`translate(calc(-50% + ${offset[0]}px),${offset[1]}px)`;
      connector.style.width=`${Math.hypot(...offset)}px`;
      connector.style.transform=`rotate(${Math.atan2(offset[1],offset[0])}rad)`;
      const changed=progress>=1;
      const key=changed&&item.afterImage?item.afterImage:item.image;
      if(node.dataset.image!==key){image.src=asset(key);node.dataset.image=key;}
      node.classList.toggle("is-walking",Boolean(moving&&!reduced.matches));
      bubble.textContent=changed&&item.bubble?item.bubble:"";
      if(!node.hidden) bounds.push({x:x+offset[0],y:y+offset[1],w:Math.max(parseFloat(node.style.getPropertyValue("--item-width")),small.matches?80:104),h:parseFloat(node.style.getPropertyValue("--item-height"))+(bubble.textContent?31:0),item});
    });
    // 人物が都市に着いたら、地名を足元の下へ移して隠れないようにする。
    const placed=[];
    const intersects=(a,b)=>a.left<b.right+5&&a.right>b.left-5&&a.top<b.bottom+4&&a.bottom>b.top-4;
    const occupied=bounds.map(b=>({left:b.x-b.w/2,right:b.x+b.w/2,top:b.y-b.h-4,bottom:b.y+28}));
    pinNodes.forEach(({key,x,y,node,guide,labelWidth})=>{
      const px=(x-left)*scale, py=(y-top)*scale;
      const overlapping=bounds.filter(b=>Math.abs(b.x-px)<b.w/2+30&&py>b.y-b.h-16&&py<b.y+40);
      const below=overlapping.length?Math.max(...overlapping.map(b=>b.y))+48:py+19;
      const desired=scene.id==="three-khanates"?py+(key==="bukhara"?78:48):Math.min(height-57,below);
      const candidates=[];
      for(const cy of [desired,py+19,py+48,desired+22,desired-22,py-16,py-42,desired+44,desired-44]) {
        for(const dx of [0,-42,42,-75,75]) {
          const cx=clamp(px+dx,labelWidth/2+8,width-labelWidth/2-8);
          const candidate={left:cx-labelWidth/2,right:cx+labelWidth/2,top:cy-12,bottom:cy+4,cx,cy};
          if(candidate.top>38&&candidate.bottom<height-48)candidates.push(candidate);
        }
      }
      const chosen=candidates.find(c=>![...occupied,...placed].some(b=>intersects(c,b)))??candidates[0];
      placed.push(chosen);
      node.setAttribute("x",left+chosen.cx/scale);node.setAttribute("y",top+chosen.cy/scale);
      guide.setAttribute("x2",left+chosen.cx/scale);guide.setAttribute("y2",top+(chosen.cy-8)/scale);
      guide.setAttribute("visibility",Math.hypot(chosen.cx-px,chosen.cy-py)>28?"visible":"hidden");
    });
  };
  update(reduced.matches||!scene.duration?1:0); root.dataset.phase="loading";
  const keys=[...new Set(items.flatMap(({item})=>[item.image,item.afterImage].filter(Boolean)))];
  Promise.all(keys.map(preload)).then(()=>{
    if(cancelled)return;
    if(reduced.matches||!scene.duration){update(1);return;}
    const start=performance.now()+600;
    const tick=(now)=>{if(cancelled)return;const p=clamp((now-start)/scene.duration);update(p);if(p<1)frame=requestAnimationFrame(tick);};
    frame=requestAnimationFrame(tick);
  });
  stop=()=>{cancelled=true;cancelAnimationFrame(frame);};
}
function show({scroll=false}={}) {
  const scene=scenes[index];
  el["scene-number"].textContent=`${String(index+1).padStart(2,"0")} / ${scenes.length}`;
  el["scene-year"].textContent=scene.year;
  el["scene-kicker"].textContent=scene.kicker;
  el["scene-title"].replaceChildren(...scene.title.split("\n").flatMap((line,i)=>i?[document.createElement("br"),document.createTextNode(line)]:[document.createTextNode(line)]));
  // このファイルと場面定義にある固定本文だけを表示する。
  el["scene-body"].innerHTML=scene.body.map(text=>`<p>${text}</p>`).join("");
  el["scene-takeaway"].textContent=scene.takeaway; el["scene-note"].textContent=scene.note;
  el.previous.disabled=index===0;
  el.next.textContent=index===scenes.length-1?"最初から ↻":"次へ →";
  el["story-progress"].value=index+1; el["story-progress"].textContent=`${index+1} / ${scenes.length}`;
  el["progress-label"].textContent=`${index+1} / ${scenes.length}`;
  document.querySelectorAll("[data-scene]").forEach(button=>{
    if(button.tagName!=="BUTTON")return;
    if(Number(button.dataset.scene)===index)button.setAttribute("aria-current","step");else button.removeAttribute("aria-current");
  });
  document.querySelectorAll("[data-chapter]").forEach(button=>{
    if(scenes[Number(button.dataset.chapter)].chapter===scene.chapter)button.setAttribute("aria-current","step");else button.removeAttribute("aria-current");
  });
  renderMap(scene);
  if(scroll&&small.matches)document.querySelector(".chapter-nav").scrollIntoView({block:"start",behavior:"instant"});
}
function go(next){next=clamp(next,0,scenes.length-1);if(next===index)return;index=next;show({scroll:true});}
scenes.forEach((scene,i)=>{
  const button=document.createElement("button");button.type="button";button.dataset.scene=i;button.textContent=String(i+1).padStart(2,"0");button.setAttribute("aria-label",`${i+1}. ${scene.title.replace("\n","")}`);button.title=button.getAttribute("aria-label");button.addEventListener("click",()=>go(i));el["scene-nav"].append(button);
});
el.previous.addEventListener("click",()=>go(index-1));el.next.addEventListener("click",()=>go(index===scenes.length-1?0:index+1));el.replay.addEventListener("click",()=>renderMap(scenes[index]));
document.querySelectorAll("[data-chapter]").forEach(button=>button.addEventListener("click",()=>go(Number(button.dataset.chapter))));
document.addEventListener("keydown",event=>{
  if(event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||event.repeat||event.target.closest("input,textarea,select,[contenteditable=true],details"))return;
  if(["ArrowRight","ArrowLeft"].includes(event.key)){event.preventDefault();go(index+(event.key==="ArrowRight"?1:-1));}
});
new ResizeObserver(()=>{
  const size=`${el["story-map"].clientWidth},${el["story-map"].clientHeight}`;
  if(size===lastSize)return;lastSize=size;renderMap(scenes[index]);
}).observe(el["story-map"]);
reduced.addEventListener("change",()=>renderMap(scenes[index]));
// 自動読み上げ・音声・動画・学習データの読み書きは行わない。
show();
