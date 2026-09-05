import {places,zones,scenes} from "./safavid-scenes.js?v=0.185";

const NS="http://www.w3.org/2000/svg";
const project=([lon,lat])=>[(lon-20)*12,(58-lat)*15];
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const byId=id=>document.getElementById(id);
const map=byId("story-map"),reduced=matchMedia("(prefers-reduced-motion: reduce)");
const colors={campaign:"#b5573f",rival:"#5c7886",move:"#54866b",trade:"#b0882f"};
let index=0,stop=()=>{},lastSize="";
function svg(tag,attrs={},text){const node=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,v);if(text)node.textContent=text;return node;}
function geometry(scene,width,height){
  const [west,south,east,north]=scene.frame;
  const points=[[west,north],[east,south],...scene.pins.map(k=>places[k].point),...scene.routes.flatMap(r=>r.points),...scene.tags.map(t=>t.at)].map(project);
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const scale=Math.min((width-82)/(maxX-minX),(height-125)/(maxY-minY));
  const x=width/2-(minX+maxX)/2*scale,y=height/2-(minY+maxY)/2*scale;
  return {scale,x,y,toScreen:p=>{const q=project(p);return [q[0]*scale+x,q[1]*scale+y];}};
}
function drawMap(scene){
  stop();
  const width=map.clientWidth,height=map.clientHeight;
  if(!width||!height)return;
  const {scale,x,y,toScreen}=geometry(scene,width,height);
  map.setAttribute("viewBox",`0 0 ${width} ${height}`);
  map.dataset.scene=scene.id;
  map.replaceChildren(svg("title",{id:"map-title"},scene.mapHeading),svg("desc",{id:"map-description"},`${scene.before}。${scene.after}。${scene.pins.map(k=>places[k].name).join("、")}を地図で示します。${scene.square?"広場の北にバザール、西に王宮、東にモスク、南に王のモスクがあります。":""}`));
  const base=svg("image",{href:"/timur-map.svg",x,y,width:1260*scale,height:720*scale,opacity:scene.square ? .4 : 1});map.append(base);
  const regions=svg("g",{class:`safavid-regions${scene.fractured?" is-fractured":""}`});map.append(regions);
  const polygon=points=>points.map(p=>toScreen(p).join(",")).join(" ");
  for(const key of scene.zones){const z=zones[key];regions.append(svg("polygon",{points:polygon(z.points),fill:z.color,stroke:z.color,"stroke-width":1.1}));}
  for(const [p,text] of [[[51,41.8],"カスピ海"],[[51.5,26.3],"ペルシア湾"],[[35,43.4],"黒海"]]){
    const [sx,sy]=toScreen(p);if(sx>40&&sx<width-40&&sy>32&&sy<height-40)map.append(svg("text",{x:sx,y:sy,class:"safavid-water","text-anchor":"middle"},text));
  }
  const arrows=svg("g",{class:"safavid-arrows"});map.append(arrows);
  const routeNodes=scene.routes.map((route,i)=>{
    const p=route.points.map(toScreen),d=p.map((v,j)=>`${j?"L":"M"}${v.join(",")}`).join(" ");
    const ghost=svg("path",{d,fill:"none",stroke:colors[route.kind],"stroke-width":1.5,opacity:.15});
    const path=svg("path",{d,fill:"none",stroke:colors[route.kind],"stroke-width":route.kind==="trade"?2:2.7,"stroke-linecap":"round"});
    const head=svg("path",{d:"M-7,-4 L0,0 -7,4",fill:"none",stroke:colors[route.kind],"stroke-width":2});
    const dot=svg("circle",{r:3.5,fill:colors[route.kind],stroke:"#fff9ea","stroke-width":1.2,"data-route":i,class:"safavid-moving-point"});
    if(route.kind==="trade")ghost.setAttribute("stroke-dasharray","3 4");
    arrows.append(ghost,path,head,dot);
    const length=path.getTotalLength();path.setAttribute("stroke-dasharray",`${length} ${length}`);
    let reveal=path;
    if(route.kind==="trade"){
      const mask=svg("mask",{id:`trade-reveal-${i}`,maskUnits:"userSpaceOnUse",x:0,y:0,width,height});
      reveal=svg("path",{d,fill:"none",stroke:"white","stroke-width":8,"stroke-dasharray":`${length} ${length}`});mask.append(reveal);map.prepend(mask);
      path.setAttribute("mask",`url(#trade-reveal-${i})`);path.setAttribute("stroke-dasharray","3 4");
    }
    return {route,path,reveal,head,dot,length};
  });
  const pins=svg("g",{class:"safavid-pins"}),labels=svg("g",{class:"safavid-labels"});map.append(pins,labels);
  const occupied=[];
  if(scene.square)occupied.push({left:width/2-126,right:width/2+126,top:54,bottom:248});
  const overlaps=(a,b)=>a.left<b.right+4&&a.right>b.left-4&&a.top<b.bottom+4&&a.bottom>b.top-4;
  function label(text,point,className){
    const [px,py]=toScreen(point),node=svg("text",{x:px,y:py,class:className,"text-anchor":"middle"},text);labels.append(node);
    const half=node.getComputedTextLength()/2+3,candidates=[];
    for(const dy of [-13,23,-34,44,-55,65])for(const dx of [0,-38,38,-70,70]){
      const cx=clamp(px+dx,half+8,width-half-8),cy=py+dy;
      const r={left:cx-half,right:cx+half,top:cy-12,bottom:cy+4,cx,cy};
      if(r.top>28&&r.bottom<height-43)candidates.push(r);
    }
    const chosen=candidates.find(r=>!occupied.some(b=>overlaps(r,b)))??candidates[0];
    if(!chosen){node.remove();return;}
    occupied.push(chosen);node.setAttribute("x",chosen.cx);node.setAttribute("y",chosen.cy);
    if(Math.hypot(chosen.cx-px,chosen.cy-py)>26){const line=svg("line",{x1:px,y1:py,x2:chosen.cx,y2:chosen.cy-5,stroke:"#617e7c","stroke-width":.7,opacity:.65});labels.insertBefore(line,node);}
  }
  for(const key of scene.pins){
    const [px,py]=toScreen(places[key].point),capital=scene.capital===key;
    pins.append(capital?svg("path",{d:`M${px},${py-5} l5,5 -5,5 -5,-5 Z`,fill:"#2d716f",stroke:"#fff9ec","stroke-width":1.5}):svg("circle",{cx:px,cy:py,r:3.5,fill:"#8e553b",stroke:"#fff9ec","stroke-width":1.5}));
    label(places[key].name,places[key].point,capital?"safavid-capital":"safavid-city");
  }
  for(const tag of scene.tags)label(tag.text,tag.at,"safavid-country");
  let ring;
  const target=scene.battle??scene.capital;
  if(target){const [px,py]=toScreen(places[target].point);ring=svg("circle",{cx:px,cy:py,r:8,fill:"none",stroke:scene.battle?colors.campaign:colors.move,"stroke-width":1.6});pins.prepend(ring);}
  let city;
  if(scene.square){
    const cw=Math.min(250,width-34),cx=(width-cw)/2,cy=56,mid=cw/2;
    city=svg("g",{class:"city-plan",transform:`translate(${cx},${cy})`});map.append(city);
    city.append(svg("rect",{width:cw,height:186,rx:5,fill:"#fffaf0",stroke:"#a4b7ab"}));
    city.append(svg("text",{x:mid,y:20,"text-anchor":"middle",class:"plan-heading"},"王の広場と周辺（模式図）"));
    city.append(svg("rect",{x:mid-38,y:55,width:76,height:90,fill:"#eae3cf",stroke:"#b3a57f","stroke-dasharray":"4 3"}));
    city.append(svg("text",{x:mid,y:105,"text-anchor":"middle",class:"plan-center"},"王の広場"));
    for(const [tx,ty,text,color] of [[mid,43,"バザール","#a98443"],[mid-80,101,"王宮","#96728b"],[mid+80,101,"モスク","#4d858b"],[mid,164,"王のモスク","#4d858b"]])city.append(svg("text",{x:tx,y:ty,"text-anchor":"middle",fill:color,class:"plan-building"},text));
    const [px,py]=toScreen(places.isfahan.point);map.insertBefore(svg("line",{x1:width/2,y1:cy+186,x2:px,y2:py,stroke:"#6f9389","stroke-dasharray":"3 3"}),city);
  }
  let frame=0,cancelled=false;
  const update=p=>{
    map.dataset.progress=p.toFixed(3);map.dataset.phase=p>=1?"complete":"moving";
    byId("map-status").textContent=p>=1?scene.after:scene.before;
    regions.style.opacity=scene.square ? ".14" : String(.2+.12*p);
    if(scene.fractured)regions.style.opacity=String(.3-.14*p);
    for(const {route,path,reveal,head,dot,length} of routeNodes){
      const q=clamp((p-(route.start??0))/((route.end??1)-(route.start??0))),at=path.getPointAtLength(q*length),prev=path.getPointAtLength(Math.max(0,q*length-1));
      reveal.setAttribute("stroke-dashoffset",length*(1-q));
      const opacity=scene.fadeRoutes?1-.8*p:1;
      path.setAttribute("opacity",opacity);dot.setAttribute("opacity",q>0&&q<1?opacity:0);head.setAttribute("opacity",q>0?opacity:0);
      dot.setAttribute("cx",at.x);dot.setAttribute("cy",at.y);dot.dataset.progress=q.toFixed(3);
      head.setAttribute("transform",`translate(${at.x},${at.y}) rotate(${Math.atan2(at.y-prev.y,at.x-prev.x)*180/Math.PI})`);
    }
    if(ring){ring.setAttribute("r",8+7*Math.sin(p*Math.PI));ring.setAttribute("opacity",.45+.45*p);}
    if(city)city.setAttribute("opacity",String(.3+.7*p));
  };
  if(reduced.matches||!scene.duration)update(1);
  else{update(0);const start=performance.now()+300;const tick=now=>{if(cancelled)return;const p=clamp((now-start)/scene.duration);update(p);if(p<1)frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);}
  stop=()=>{cancelled=true;cancelAnimationFrame(frame);};
}
function show(scroll=false){
  const scene=scenes[index];
  for(const [id,value] of Object.entries({"scene-number":`${String(index+1).padStart(2,"0")} / ${scenes.length}`,"scene-year":scene.year,"scene-kicker":scene.kicker,"scene-title":scene.title,"scene-takeaway":scene.takeaway,"scene-note":scene.note,"map-heading":scene.mapHeading,"map-focus":scene.focus,"progress-label":`${index+1} / ${scenes.length}`}))byId(id).textContent=value;
  byId("scene-body").innerHTML=scene.body.map(text=>`<p>${text}</p>`).join("");
  byId("map-facts").replaceChildren(...scene.facts.map(text=>{const item=document.createElement("li");item.textContent=text;return item;}));
  byId("previous").disabled=index===0;byId("next").textContent=index===scenes.length-1?"最初から ↻":"次へ →";
  byId("story-progress").value=index+1;byId("story-progress").textContent=`${index+1} / ${scenes.length}`;
  document.querySelectorAll("button[data-scene]").forEach(b=>{if(Number(b.dataset.scene)===index)b.setAttribute("aria-current","step");else b.removeAttribute("aria-current");});
  document.querySelectorAll("[data-chapter]").forEach(b=>{if(scenes[Number(b.dataset.chapter)].chapter===scene.chapter)b.setAttribute("aria-current","step");else b.removeAttribute("aria-current");});
  drawMap(scene);
  if(scroll&&matchMedia("(max-width: 740px)").matches)document.querySelector(".chapter-nav").scrollIntoView({block:"start",behavior:"instant"});
}
function go(next){next=clamp(next,0,scenes.length-1);if(next===index)return;index=next;show(true);}
scenes.forEach((scene,i)=>{const b=document.createElement("button");b.type="button";b.dataset.scene=i;b.textContent=String(i+1).padStart(2,"0");b.setAttribute("aria-label",`${i+1}. ${scene.title.replace("\n","")}`);b.title=b.getAttribute("aria-label");b.addEventListener("click",()=>go(i));byId("scene-nav").append(b);});
byId("previous").addEventListener("click",()=>go(index-1));byId("next").addEventListener("click",()=>go(index===scenes.length-1?0:index+1));
byId("replay").addEventListener("click",()=>drawMap(scenes[index]));
document.querySelectorAll("[data-chapter]").forEach(b=>b.addEventListener("click",()=>go(Number(b.dataset.chapter))));
document.addEventListener("keydown",event=>{if(event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||event.repeat||event.target.closest("input,textarea,select,[contenteditable=true],details"))return;if(event.key==="ArrowRight"||event.key==="ArrowLeft"){event.preventDefault();go(index+(event.key==="ArrowRight"?1:-1));}});
new ResizeObserver(()=>{const size=`${map.clientWidth},${map.clientHeight}`;if(size===lastSize)return;lastSize=size;drawMap(scenes[index]);}).observe(map);
reduced.addEventListener("change",()=>drawMap(scenes[index]));
// この教材は無音。音声・動画・人物画像・学習データの読み書きを使用しない。
show();
