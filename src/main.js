import {PigmentField} from "./field.js";
import {VolumeRenderer,pointFromScreen,projectToScreen,cameraVectors} from "./render.js";
import {MAX_SCULPT_NODES,newSculptNode,summonSculptTriad} from "./flow-sculpt.js";
import {MAX_CURVES,MAX_CURVE_POINTS,newFlowCurve,resampleStroke} from "./flow-curve.js";
import {splitFlowCurve,braidFlowCurve} from "./curve-topology.js";
import {cloneFlowCurves} from "./flow-curve.js";
import {evaluateLivingCurves,LIVING_MODES} from "./living-braid.js";
import {BREEDER_SLOTS,DEFAULT_BREED_SEED,captureCurveGenome,cloneBreederParents,breedCurveGenomes,nurseryStarters} from "./curve-breeder.js";
import {GPUPigmentTransport} from "./gpu-transport.js";
const $=id=>document.getElementById(id);
const palettes={
 "Prismatic Riot":["#ff36cb","#1df6eb","#ffe143"],
 "Ghost Orchid":["#a25bff","#ff94f8","#70fbe8"],
 "Acid Aquarium":["#a6ff00","#00f0da","#ff4a6b"],
 "Molten Aurora":["#ff671d","#fd4deb","#6af3ff"],
 "Radioactive Velvet":["#e9ff47","#9a43ff","#ff3385"],
 "Candy Plasma":["#fd49fb","#2ffaf3","#fff4fb"],
 "Deep-Space Jewel":["#a0caff","#dc59fa","#ffa456"],
 "Coral Exorcism":["#ff4d5f","#ffbe41","#4dffe7"]
};
function rgb(h){return [1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);}
const paletteSelect=$("palette");for(const name of Object.keys(palettes)){const o=document.createElement("option");o.value=name;o.textContent=name;paletteSelect.append(o);}
const canvas=$("art"),field=new PigmentField(1226);
field.turbulence=.6; // Begin with visible multiscale advection, not a static specimen.
let engine=field,engineMode="CPU";
let renderer,paused=false,mode="stir",active=null,lastFrame=0,lastDraw=0,accumulator=0;
const IMMERSIVE_DISTANCE=1.95;
const camera={azimuth:.62,elevation:.23,distance:IMMERSIVE_DISTANCE};
const options={speed:1,force:1,brush:.22,depth:0,gain:4.5,glow:1.2,shadow:1,lightDirection:"side",lightSteps:2,foldGlow:1.3,memoryView:0,fiberLight:1.5,wisp:1,prism:.8,steps:50,background:[0.009,.006,.023]};
const directions={side:[.75,.45,.4],top:[.2,1,.2],back:[-.6,.23,-.75]};
const undo=[],redo=[];
const foldEditDrafts=new Map();
const structuralControls=["foldWrite","foldPersistence","foldGrip","forgePower","forgeWidth","forgePace","fiberGrowth","fiberPersistence","fiberBend","fiberGuidance","livingRate","livingAmount"];
function structuralDecimals(id){return ["foldGrip","foldPersistence","forgePower","forgeWidth","forgePace","fiberPersistence","fiberGuidance","livingRate","livingAmount"].includes(id)?2:1;}
const touches=new Map();
let selectedSculpt=-1,selectedCurve=-1,selectedHandle=-1;
const displayFlowCurves=()=>evaluateLivingCurves(engine.flowCurves,engine.time,
  engine.livingMode,engine.livingRate,engine.livingAmount);
const sculptMarkerContainer=$("sculptMarkers");
const sculptSymbols={vortex:"⟳",pull:"◉",push:"✹"};
function sculptSelectionUI(){
  const nodes=engine.sculptNodes||[];
  if(selectedSculpt>=nodes.length)selectedSculpt=-1;
  $("sculptCount").textContent=nodes.length+" / "+MAX_SCULPT_NODES;
  const current=nodes[selectedSculpt];
  if(current){
    $("sculptType").value=current.type;
    $("sculptStrength").value=current.strength;
    $("sculptStrengthText").textContent=current.strength.toFixed(1);
    $("sculptRadius").value=current.r;
    $("sculptRadiusText").textContent=current.r.toFixed(2);
  }
  $("removeSculpt").disabled=!current;
  $("clearSculpt").disabled=nodes.length===0;
}
function updateSculptMarkers(){
  sculptMarkerContainer.replaceChildren();
  if(mode!=="sculpt")return;
  const nodes=engine.sculptNodes||[];
  for(let i=0;i<nodes.length;i++){
    const point=projectToScreen(canvas,camera,nodes[i].p);
    if(!point||!point.visible)continue;
    const el=document.createElement("span");
    el.className="sculpt-node"+(i===selectedSculpt?" active":"");
    el.dataset.kind=nodes[i].type;
    el.style.left=point.x+"px";el.style.top=point.y+"px";
    el.textContent=sculptSymbols[nodes[i].type];
    sculptMarkerContainer.append(el);
  }
}
function pickSculptHandle(event){
  const rect=canvas.getBoundingClientRect(),nodes=engine.sculptNodes||[];
  const x=event.clientX-rect.left,y=event.clientY-rect.top;
  let closest=-1,dist2=36*36;
  for(let i=0;i<nodes.length;i++){
    const p=projectToScreen(canvas,camera,nodes[i].p);
    if(!p||!p.visible)continue;
    const d=(p.x-x)**2+(p.y-y)**2;
    if(d<dist2){dist2=d;closest=i;}
  }
  return closest;
}

const curveOverlay=$("curveOverlay"),curveContext=curveOverlay.getContext("2d");
const curveHues={stream:"#41fbdf",coil:"#ea7cff",gather:"#ffcc59"};
function curveSelectionUI(){
  const curves=engine.flowCurves||[];
  if(selectedCurve>=curves.length)selectedCurve=-1;
  $("curveCount").textContent=curves.length+" / "+MAX_CURVES;
  const c=curves[selectedCurve];
  if(!c||selectedHandle>=c.points.length)selectedHandle=-1;
  $("curveHandleText").textContent=c&&selectedHandle>=0?
    (selectedHandle+1)+" / "+c.points.length:"none";
  $("splitCurve").disabled=curves.length!==1||!c||selectedHandle<=0||
    selectedHandle>=c.points.length-1;
  $("braidCurve").disabled=curves.length!==1||!c;
  if(c){
    $("curveType").value=c.type;$("curveStrength").value=c.strength;
    $("curveStrengthText").textContent=c.strength.toFixed(1);
    $("curveWidth").value=c.r;$("curveWidthText").textContent=c.r.toFixed(2);
  }
  $("removeCurve").disabled=!c;
  $("clearCurves").disabled=curves.length===0;
  $("bakeLiving").disabled=curves.length===0||engine.livingMode==="still"||
      engine.livingAmount<=0||engine.livingRate<=0;
  $("livingStatus").textContent=engine.livingMode==="still"?
    "Resting geometry":(engine.livingMode==="unravel"||engine.livingMode==="reconnect")&&curves.length!==2?
    "Draw or braid two curves":"Evolving at t = "+engine.time.toFixed(1)+" s";
}
function updateGeneNursery(){
  const parents=engine.breederParents||[];
  const count=parents.filter(Boolean).length;
  $("geneParentCount").textContent=count+" / "+BREEDER_SLOTS+" parents";
  for(let i=0;i<BREEDER_SLOTS;i++){
    const parent=parents[i];
    $("geneParent"+(i+1)+"Label").textContent=parent?
      parent.curves.length+" curve"+(parent.curves.length===1?"":"s")+" · "+
      parent.curves.map(c=>c.type).join(" / ")+" · "+parent.livingMode:"Empty";
  }
  $("breedChild").disabled=count<2;
  $("clearGeneParents").disabled=count===0;
  $("breedSeed").value=engine.breederSeed??DEFAULT_BREED_SEED;
}
function syncBreedingField(){
  if(engine===field)return;
  field.breederParents=cloneBreederParents(engine.breederParents);
  field.breederSeed=engine.breederSeed;
}
function drawCurveOverlay(){
  if(!curveContext)return;
  const rect=canvas.getBoundingClientRect(),scale=Math.min(window.devicePixelRatio||1,2);
  const w=Math.max(1,Math.round(rect.width*scale)),h=Math.max(1,Math.round(rect.height*scale));
  if(curveOverlay.width!==w||curveOverlay.height!==h){curveOverlay.width=w;curveOverlay.height=h;}
  curveContext.setTransform(w/rect.width,0,0,h/rect.height,0,0);
  curveContext.clearRect(0,0,rect.width,rect.height);
  if(mode!=="curve")return;
  const live=displayFlowCurves();
  $("livingStatus").textContent=engine.livingMode==="still"?"Resting geometry":
    (engine.livingMode==="unravel"||engine.livingMode==="reconnect")&&live.length!==2?
    "Draw or braid two curves":"Evolving at t = "+engine.time.toFixed(1)+" s";
  for(let index=0;index<live.length;index++){
    const curve=live[index],pts=curve.points
      .map(p=>projectToScreen(canvas,camera,p)).filter(Boolean);
    if(pts.length<2)continue;
    const chosen=index===selectedCurve;
    curveContext.beginPath();curveContext.moveTo(pts[0].x,pts[0].y);
    for(const p of pts.slice(1))curveContext.lineTo(p.x,p.y);
    curveContext.lineWidth=chosen?5:3;
    curveContext.lineJoin="round";curveContext.lineCap="round";
    curveContext.strokeStyle=curveHues[curve.type];
    curveContext.shadowColor=curveHues[curve.type];
    curveContext.shadowBlur=chosen?19:12;curveContext.globalAlpha=.95;
    curveContext.stroke();curveContext.shadowBlur=0;
    curveContext.fillStyle="#f8f4ff";
    for(const p of [pts[0],pts.at(-1)]){
      curveContext.beginPath();curveContext.arc(p.x,p.y,chosen?4.5:3.2,0,Math.PI*2);
      curveContext.fill();
    }
    if(chosen){
      for(let k=0;k<curve.points.length;k++){
        const pt=projectToScreen(canvas,camera,curve.points[k]);
        if(!pt||!pt.visible)continue;
        const activeHandle=k===selectedHandle;
        curveContext.beginPath();curveContext.arc(pt.x,pt.y,activeHandle?7:4.5,0,Math.PI*2);
        curveContext.fillStyle=activeHandle?"#fff":"#190a2c";
        curveContext.fill();
        curveContext.lineWidth=activeHandle?3:2;
        curveContext.strokeStyle=activeHandle?"#ffed6b":curveHues[curve.type];
        curveContext.stroke();
      }
    }
  }
  curveContext.globalAlpha=1;
}
function pickCurveHandle(event){
  const curve=displayFlowCurves()[selectedCurve];
  if(!curve)return -1;
  const rect=canvas.getBoundingClientRect();
  const x=event.clientX-rect.left,y=event.clientY-rect.top;
  let best=-1,dist=20*20;
  for(let k=0;k<curve.points.length;k++){
    const point=projectToScreen(canvas,camera,curve.points[k]);
    if(!point||!point.visible)continue;
    const d=(point.x-x)**2+(point.y-y)**2;
    if(d<dist){dist=d;best=k;}
  }
  return best;
}
function nearestCurve(event){
  const rect=canvas.getBoundingClientRect();
  const x=event.clientX-rect.left,y=event.clientY-rect.top;
  let best=-1,bestDist2=24*24;
  for(const [k,curve] of displayFlowCurves().entries()){
    const pts=curve.points.map(p=>projectToScreen(canvas,camera,p));
    for(let j=1;j<pts.length;j++){
      if(!pts[j]||!pts[j-1])continue;
      const a=pts[j-1],b=pts[j],sx=b.x-a.x,sy=b.y-a.y,ss=sx*sx+sy*sy;
      const u=ss>1e-8?Math.max(0,Math.min(1,((x-a.x)*sx+(y-a.y)*sy)/ss)):0;
      const dd=(x-a.x-u*sx)**2+(y-a.y-u*sy)**2;
      if(dd<bestDist2){bestDist2=dd;best=k;}
    }
  }
  return best;
}
let pinchSpan=0;
const limitZoom=d=>Math.max(1.22,Math.min(5.6,d));
function setZoom(distance,announce=true){
  camera.distance=limitZoom(distance);
  if(announce)status("Camera distance "+camera.distance.toFixed(2)+" · pinch, +/−, or Fill view");
}
function touchSpan(){
  const points=[...touches.values()];
  return points.length<2?0:Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y);
}
const status=text=>$("status").textContent=text;
function releaseCommands(commands){for(const cmd of commands){engine.release?.(cmd.before);engine.release?.(cmd.after);}}
function clearHistory(){
  for(const saved of foldEditDrafts.values())engine.release?.(saved);
  foldEditDrafts.clear();
  releaseCommands(undo);releaseCommands(redo);undo.length=0;redo.length=0;updateHistory();
}
function updateHistory(){$("undo").disabled=undo.length===0;$("redo").disabled=redo.length===0;}
function snapshotCommand(before){undo.push({before,after:engine.snapshot()});if(undo.length>9)releaseCommands([undo.shift()]);releaseCommands(redo);redo.length=0;updateHistory();}
function restore(s){engine.restore(s);syncBreedingField();updateGeneNursery();curveSelectionUI();drawCurveOverlay();sculptSelectionUI();updateSculptMarkers();$("flow").value=engine.flow;$("genesis").value=engine.morphology;$("turbulence").value=engine.turbulence||0;$("turbulenceText").textContent=(engine.turbulence||0).toFixed(1);$("integration").value=engine.integration||"euler";
$("forgeMode").value=engine.forgeMode||"off";field.forgeMode=engine.forgeMode;
$("livingMode").value=engine.livingMode||"still";field.livingMode=engine.livingMode;
$("fiberEnabled").value=engine.fiberEnabled?"on":"off";field.fiberEnabled=engine.fiberEnabled;
for(const id of structuralControls){
  $(id).value=engine[id];$(id+"Text").textContent=Number(engine[id]).toFixed(structuralDecimals(id));
  field[id]=engine[id];
}
if(renderer&&engine===field)renderer.upload();}
function undoStroke(){if(!undo.length)return;const cmd=undo.pop();redo.push(cmd);restore(cmd.before);updateHistory();}
function redoStroke(){if(!redo.length)return;const cmd=redo.pop();undo.push(cmd);restore(cmd.after);updateHistory();}
function params(){const p=palettes[paletteSelect.value]||palettes["Prismatic Riot"];return p.map(rgb);}
function draw(){
  if(!renderer)return;const bg=[options.background,[.012,.018,.065],[.042,.008,.05]][Number($("background").value)];
  renderer.draw(camera,params(),{gain:options.gain,glow:options.glow,steps:options.steps,background:bg,lightDir:directions[options.lightDirection],shadow:options.shadow,lightSteps:options.lightSteps,foldGlow:options.foldGlow,memoryView:options.memoryView,wisp:options.wisp,prism:options.prism,fiberLight:options.fiberLight});
  updateSculptMarkers();drawCurveOverlay();
}
function setMode(next){mode=next;for(const b of document.querySelectorAll(".mode"))b.setAttribute("aria-pressed",String(b.dataset.mode===mode));$("modeLabel").textContent={stir:"STIR · drag to disturb pigment",inject:"INJECT · paint into the volume",orbit:"ORBIT · drag to rotate camera",sculpt:"SCULPT · tap to anchor / drag glowing handles",curve:"DRAW FLOW · stroke a 3D path or drag a trace"}[mode];updateSculptMarkers();drawCurveOverlay();}
for(const b of document.querySelectorAll(".mode"))b.addEventListener("click",()=>setMode(b.dataset.mode));
for(const b of document.querySelectorAll(".tab"))b.addEventListener("click",()=>{
  for(const t of document.querySelectorAll(".tab"))t.setAttribute("aria-pressed",String(t===b));
  for(const p of document.querySelectorAll(".panel"))p.classList.toggle("open",p.id===b.dataset.panel);
});
for(const id of ["speed","force","brush","depth","density","glow","shadow","turbulence","foldGlow","foldWrite","foldPersistence","foldGrip","forgePower","forgeWidth","forgePace","fiberGrowth","fiberPersistence","fiberBend","fiberGuidance","livingRate","livingAmount","fiberLight","wisp","prism"]){
  $(id).addEventListener("input",()=>{
    if(structuralControls.includes(id)&&!foldEditDrafts.has(id)){
      foldEditDrafts.set(id,engine.snapshot());
    }
    const val=Number($(id).value);const key=id==="density"?"gain":id;if(id==="turbulence")engine.turbulence=val;
    else if(structuralControls.includes(id)){engine[id]=val;field[id]=val;}
    else options[key]=val;$(id+"Text").textContent=val.toFixed(id==="brush"||id==="depth"?2:structuralDecimals(id));});
  if(structuralControls.includes(id)){
    const commit=()=>{
      const original=foldEditDrafts.get(id);
      if(!original)return;
      foldEditDrafts.delete(id);
      snapshotCommand(original);
    };
    $(id).addEventListener("change",commit);
    $(id).addEventListener("blur",commit);
  }
}
// Sculpt editing shares the existing bounded, GPU-safe checkpoint history.
$("sculptType").addEventListener("change",()=>{
  const node=engine.sculptNodes?.[selectedSculpt];
  if(!node||node.type===$("sculptType").value)return;
  const before=engine.snapshot();node.type=$("sculptType").value;
  snapshotCommand(before);updateSculptMarkers();
  status("Recast selected force as "+node.type);
});
for(const [id,key,digits] of [["sculptStrength","strength",1],["sculptRadius","r",2]]){
  $(id).addEventListener("input",()=>{
    const value=Number($(id).value);
    $(id+"Text").textContent=value.toFixed(digits);
    const node=engine.sculptNodes?.[selectedSculpt];
    if(!node)return;
    if(!foldEditDrafts.has(id))foldEditDrafts.set(id,engine.snapshot());
    node[key]=value;
  });
  const commit=()=>{
    if(!foldEditDrafts.has(id))return;
    const before=foldEditDrafts.get(id);
    foldEditDrafts.delete(id);snapshotCommand(before);
  };
  $(id).addEventListener("change",commit);
  $(id).addEventListener("blur",commit);
}
$("summonTriad").addEventListener("click",()=>{
  const room=MAX_SCULPT_NODES-engine.sculptNodes.length;
  if(room<=0){status("Six anchors maximum · remove one first");return;}
  const before=engine.snapshot();
  const triad=summonSculptTriad(Number($("sculptRadius").value),Number($("sculptStrength").value));
  engine.sculptNodes.push(...triad.slice(0,room));
  selectedSculpt=engine.sculptNodes.length-1;
  setMode("sculpt");sculptSelectionUI();snapshotCommand(before);
  status("Summoned "+Math.min(room,3)+" persistent flow forces · drag their handles");
});
$("removeSculpt").addEventListener("click",()=>{
  if(!engine.sculptNodes?.[selectedSculpt])return;
  const before=engine.snapshot();
  engine.sculptNodes.splice(selectedSculpt,1);
  selectedSculpt=-1;sculptSelectionUI();snapshotCommand(before);
  updateSculptMarkers();status("Selected force removed · pigment preserved");
});
$("clearSculpt").addEventListener("click",()=>{
  if(!engine.sculptNodes.length||!confirm("Remove all flow anchors? Existing pigment will remain."))return;
  const before=engine.snapshot();
  engine.sculptNodes.length=0;selectedSculpt=-1;sculptSelectionUI();snapshotCommand(before);
  updateSculptMarkers();status("Cleared flow anchors · pigment preserved");
});
// Curve Witch editing: one checkpoint per operation, never every pointer move.
$("selectDrawFlow").addEventListener("click",()=>{setMode("curve");status("Draw flow · tap a dot to bend, or draw a new path");});
for(let i=0;i<BREEDER_SLOTS;i++){
  $("captureGene"+(i+1)).addEventListener("click",()=>{
    if(!engine.flowCurves.length){status("Draw a curve first, or load the weird starter parents");return;}
    const before=engine.snapshot();
    engine.breederParents[i]=captureCurveGenome(engine);
    syncBreedingField();updateGeneNursery();snapshotCommand(before);
    $("breedResult").textContent="Captured parent "+String.fromCharCode(65+i);
    status("Parent "+String.fromCharCode(65+i)+" captured: permanent geometry and motion DNA");
  });
}
$("loadGeneStarters").addEventListener("click",()=>{
  const before=engine.snapshot();
  engine.breederParents=cloneBreederParents(nurseryStarters());
  syncBreedingField();updateGeneNursery();snapshotCommand(before);
  $("breedResult").textContent="Three weird parents loaded";
  status("The nursery is full: writhing stream, opposed coil braid and reconnecting crosscurrents");
});
$("breedMutation").addEventListener("input",()=>{
  $("breedMutationText").textContent=Number($("breedMutation").value).toFixed(2);
});
$("breedSeed").addEventListener("change",()=>{
  const n=Number($("breedSeed").value);
  if(!Number.isInteger(n)||n<0||n>0xffffffff){
    $("breedSeed").value=engine.breederSeed;status("Seed must be an integer from 0 to 4294967295");return;
  }
  if(n===engine.breederSeed)return;
  const before=engine.snapshot();
  engine.breederSeed=n>>>0;field.breederSeed=engine.breederSeed;
  snapshotCommand(before);
  status("Breeding seed set to "+engine.breederSeed);
});
$("breedChild").addEventListener("click",()=>{
  const available=engine.breederParents.filter(Boolean).length;
  if(available<2){status("Capture two parents or load the starter nursery");return;}
  const seed=Number($("breedSeed").value);
  if(!Number.isInteger(seed)||seed<0||seed>0xffffffff){
    status("Enter a whole-number breeding seed between 0 and 4294967295");return;
  }
  const dominant=$("breedDominance").value;
  if(dominant!=="balanced"&&!engine.breederParents[Number(dominant)]){
    status("That dominant parent slot is empty");return;
  }
  const child=breedCurveGenomes(engine.breederParents,seed,Number($("breedMutation").value),dominant);
  const before=engine.snapshot();
  engine.flowCurves=cloneFlowCurves(child.curves);
  engine.livingMode=child.livingMode;
  engine.livingRate=child.livingRate;
  engine.livingAmount=child.livingAmount;
  engine.breederSeed=(seed+1)>>>0;
  if(engine!==field){
    field.flowCurves=cloneFlowCurves(engine.flowCurves);
    field.livingMode=engine.livingMode;
    field.livingRate=engine.livingRate;
    field.livingAmount=engine.livingAmount;
  }
  field.breederSeed=engine.breederSeed;
  selectedCurve=0;selectedHandle=-1;
  $("livingMode").value=engine.livingMode;
  for(const id of ["livingRate","livingAmount"]){
    $(id).value=engine[id];
    $(id+"Text").textContent=Number(engine[id]).toFixed(2);
  }
  curveSelectionUI();updateGeneNursery();snapshotCommand(before);setMode("curve");
  const report="Seed "+seed+" · "+child.curves.length+" curves · "+child.livingMode;
  $("breedResult").textContent=report;
  status("Offspring born — "+report+" · existing pigment and fibers preserved");
});
$("clearGeneParents").addEventListener("click",()=>{
  if(!engine.breederParents.some(Boolean)||!confirm("Clear all three captured parents? Current art will remain."))return;
  const before=engine.snapshot();
  engine.breederParents=cloneBreederParents();
  syncBreedingField();updateGeneNursery();snapshotCommand(before);
  $("breedResult").textContent="Nursery cleared";
  status("Captured parent DNA cleared · living artwork preserved");
});
$("livingMode").addEventListener("change",()=>{
  const next=$("livingMode").value;
  if(!LIVING_MODES.includes(next)||next===engine.livingMode)return;
  const before=engine.snapshot();
  engine.livingMode=next;field.livingMode=next;
  curveSelectionUI();snapshotCommand(before);drawCurveOverlay();
  status(next==="still"?"Curve geometry frozen · existing material preserved":
    "Living geometry: "+$("livingMode").selectedOptions[0].textContent);
});
$("bakeLiving").addEventListener("click",()=>{
  if(engine.livingMode==="still"||!engine.flowCurves.length)return;
  const before=engine.snapshot();
  const posed=evaluateLivingCurves(engine.flowCurves,engine.time,
    engine.livingMode,engine.livingRate,engine.livingAmount);
  engine.flowCurves=cloneFlowCurves(posed);
  engine.livingMode="still";field.livingMode="still";
  if(engine!==field)field.flowCurves=cloneFlowCurves(engine.flowCurves);
  $("livingMode").value="still";
  selectedHandle=-1;
  curveSelectionUI();snapshotCommand(before);drawCurveOverlay();
  status("Baked live shape into editable 3D force paths · pigment preserved");
});
for(const [id,digits] of [["braidTurns",2],["braidSpread",2]]){
  $(id).addEventListener("input",()=>{$(id+"Text").textContent=Number($(id).value).toFixed(digits);});
}
$("splitCurve").addEventListener("click",()=>{
  const curve=engine.flowCurves[selectedCurve];
  if(!curve||engine.flowCurves.length!==1||selectedHandle<=0||
     selectedHandle>=curve.points.length-1)return;
  const before=engine.snapshot();
  const halves=splitFlowCurve(curve,selectedHandle);
  engine.flowCurves.splice(selectedCurve,1,...halves);
  selectedCurve=1;selectedHandle=-1;
  curveSelectionUI();snapshotCommand(before);drawCurveOverlay();
  status("Curve split into two independent forces · the junction remains aligned");
});
$("braidCurve").addEventListener("click",()=>{
  const curve=engine.flowCurves[selectedCurve];
  if(!curve||engine.flowCurves.length!==1)return;
  const before=engine.snapshot();
  const pair=braidFlowCurve(curve,Number($("braidTurns").value),Number($("braidSpread").value));
  engine.flowCurves.splice(selectedCurve,1,...pair);
  if(engine.livingMode==="still"){
    engine.livingMode="unravel";field.livingMode="unravel";
    $("livingMode").value="unravel";
  }
  selectedCurve=0;selectedHandle=Math.min(3,pair[0].points.length-2);
  curveSelectionUI();snapshotCommand(before);drawCurveOverlay();
  status("Two living braided force strands · geometry now unbraids and rebraids");
});
$("curveType").addEventListener("change",()=>{
  const c=engine.flowCurves?.[selectedCurve];
  if(!c||c.type===$("curveType").value)return;
  const before=engine.snapshot();c.type=$("curveType").value;
  snapshotCommand(before);drawCurveOverlay();
  status("Curve recast as "+c.type+" · existing pigment intact");
});
for(const [id,key,digits] of [["curveStrength","strength",1],["curveWidth","r",2]]){
  $(id).addEventListener("input",()=>{
    const val=Number($(id).value);
    $(id+"Text").textContent=val.toFixed(digits);
    const c=engine.flowCurves?.[selectedCurve];
    if(!c)return;
    if(!foldEditDrafts.has(id))foldEditDrafts.set(id,engine.snapshot());
    c[key]=val;
  });
  const finish=()=>{
    if(!foldEditDrafts.has(id))return;
    const before=foldEditDrafts.get(id);foldEditDrafts.delete(id);
    snapshotCommand(before);
  };
  $(id).addEventListener("change",finish);$(id).addEventListener("blur",finish);
}
$("removeCurve").addEventListener("click",()=>{
  if(!engine.flowCurves[selectedCurve])return;
  const before=engine.snapshot();engine.flowCurves.splice(selectedCurve,1);
  selectedCurve=-1;selectedHandle=-1;curveSelectionUI();snapshotCommand(before);drawCurveOverlay();
  status("Curve removed · stored pigment preserved");
});
$("clearCurves").addEventListener("click",()=>{
  if(!engine.flowCurves.length||!confirm("Remove all drawn flow curves? The pigment will remain."))return;
  const before=engine.snapshot();engine.flowCurves.length=0;
  selectedCurve=-1;selectedHandle=-1;curveSelectionUI();snapshotCommand(before);drawCurveOverlay();
  status("Flow curves cleared · pigment preserved");
});
$("quality").addEventListener("change",()=>{
  const quality=$("quality").value;
  options.steps=({low:36,mid:50,high:72})[quality];
  options.lightSteps=({low:1,mid:2,high:4})[quality];
});
$("fiberEnabled").addEventListener("change",()=>{
  const enabled=$("fiberEnabled").value==="on";
  if(engine.fiberEnabled===enabled)return;
  const before=engine.snapshot();
  engine.fiberEnabled=enabled;field.fiberEnabled=enabled;
  snapshotCommand(before);
  status(enabled?"Fiber Nerves on · directional memory evolving":
    "Fiber Nerves frozen · stored directions preserved; guidance paused");
});
$("forgeMode").addEventListener("change",()=>{
  const next=$("forgeMode").value;
  if(engine.forgeMode===next)return;
  const before=engine.snapshot();
  engine.forgeMode=next;field.forgeMode=next;
  snapshotCommand(before);
  status(next==="off"?"Filament Forge off · existing pigment keeps moving":
    "Filament Forge: "+$("forgeMode").selectedOptions[0].textContent+" · drawing new 3D material");
});
$("integration").addEventListener("change",()=>{
  const next=$("integration").value;
  if(engine.integration===next)return;
  const before=engine.snapshot();
  engine.integration=next;
  field.integration=next;
  snapshotCommand(before);
  status("Flow tracing: "+(next==="midpoint"?"Curved midpoint trajectories":"Fast single-step")+" · pigment preserved");
});
$("lightDirection").addEventListener("change",()=>{options.lightDirection=$("lightDirection").value;});
$("memoryView").addEventListener("change",()=>{options.memoryView=Number($("memoryView").value);});
$("flow").addEventListener("change",()=>{
  if(engine.flow===$("flow").value)return;
  const before=engine.snapshot();
  engine.flow=$("flow").value;
  snapshotCommand(before);
  status("Changed motion law to "+$("flow").selectedOptions[0].textContent+" · pigment preserved");
});
$("genesis").addEventListener("change",()=>status("Genesis queued: "+$("genesis").selectedOptions[0].textContent+" · current artwork preserved"));
$("background").addEventListener("change",draw);paletteSelect.addEventListener("change",draw);
$("controlsToggle").addEventListener("click",()=>{
  const panel=$("dockDetails"),opening=panel.hidden;
  panel.hidden=!opening;
  $("controlsToggle").setAttribute("aria-expanded",String(opening));
  $("controlsToggle").textContent=opening?"✕ Hide controls":"⚙ Controls";
});
$("zoomIn").addEventListener("click",()=>setZoom(camera.distance/1.22));
$("zoomOut").addEventListener("click",()=>setZoom(camera.distance*1.22));
$("fitView").addEventListener("click",()=>setZoom(IMMERSIVE_DISTANCE));
function artOnly(enabled){
  document.body.classList.toggle("art-only",enabled);
  $("returnUI").hidden=!enabled;
}
$("artOnly").addEventListener("click",()=>artOnly(true));
$("returnUI").addEventListener("click",()=>artOnly(false));
canvas.addEventListener("wheel",event=>{
  event.preventDefault();setZoom(camera.distance*Math.exp(event.deltaY*.0012),false);
},{passive:false});
$("pause").addEventListener("click",()=>{paused=!paused;$("pause").textContent=paused?"▶ Play":"Ⅱ Pause";status(paused?"Simulation paused":"Simulation resumed");});
$("undo").addEventListener("click",undoStroke);$("redo").addEventListener("click",redoStroke);
$("restart").addEventListener("click",()=>{if(!confirm("Restart this seed? Current pigment and touch changes will be replaced."))return;const flow=engine.flow,turbulence=engine.turbulence,integration=engine.integration;field.reset(engine.seed,engine.morphology);field.flow=flow;field.turbulence=turbulence;field.integration=integration;
for(const id of structuralControls)field[id]=engine[id];field.forgeMode=engine.forgeMode;field.fiberEnabled=engine.fiberEnabled;
field.livingMode=engine.livingMode;
field.livingMode=engine.livingMode;if(engine!==field)engine.reset(field);selectedSculpt=-1;selectedCurve=-1;selectedHandle=-1;sculptSelectionUI();curveSelectionUI();drawCurveOverlay();updateGeneNursery();clearHistory();$("genesis").value=field.morphology;status("Restarted "+field.morphology+" · seed "+field.seed);});
$("new").addEventListener("click",()=>{if(!confirm("Create a new design? This replaces the current volume."))return;const seed=(field.seed+1+Math.floor(Math.random()*100000))>>>0;const flow=engine.flow,turbulence=engine.turbulence,integration=engine.integration;field.reset(seed,$("genesis").value);field.flow=flow;field.turbulence=turbulence;field.integration=integration;
for(const id of structuralControls)field[id]=engine[id];field.forgeMode=engine.forgeMode;field.fiberEnabled=engine.fiberEnabled;if(engine!==field)engine.reset(field);selectedSculpt=-1;selectedCurve=-1;selectedHandle=-1;sculptSelectionUI();curveSelectionUI();drawCurveOverlay();updateGeneNursery();clearHistory();status("New design · "+$("genesis").selectedOptions[0].textContent+" · seed "+seed);});
$("png").addEventListener("click",()=>{try{draw();const a=document.createElement("a");a.download="volumetric-possession-"+field.seed+".png";a.href=canvas.toDataURL("image/png");a.click();status("Current camera view exported as PNG");}catch(err){status("PNG failed: "+err.message);}});
document.addEventListener("keydown",event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="z"){event.preventDefault();if(event.shiftKey)redoStroke();else undoStroke();}});
canvas.addEventListener("pointerdown",event=>{
  if(event.button!==0&&event.pointerType==="mouse")return;
  event.preventDefault();try{canvas.setPointerCapture(event.pointerId);}catch{}
  if(event.pointerType==="touch"){
    touches.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(touches.size>1){
      // A second finger cancels any pending paint stroke before zooming.
      if(active?.before){restore(active.before);engine.release?.(active.before);}
      active=null;pinchSpan=touchSpan();return;
    }
  }
  if(active)return;
  active={id:event.pointerId,x:event.clientX,y:event.clientY,mode,
    before:mode==="orbit"?null:engine.snapshot(),changed:false,sculptIndex:-1,
    curveIndex:-1,curveMoving:false,curveRaw:null,curveHandle:-1};
  if(mode==="curve"){
    const handle=pickCurveHandle(event);
    if(handle>=0){
      active.curveIndex=selectedCurve;active.curveHandle=handle;
      selectedHandle=handle;
      status("Bend control point "+(handle+1)+" · release to save one Undo step");
    }else{
      const found=nearestCurve(event);
      if(found>=0){
        selectedCurve=found;selectedHandle=-1;active.curveIndex=found;active.curveMoving=true;
        status("Selected entire curve · drag its line to translate it");
      }else{
      if(engine.flowCurves.length>=MAX_CURVES){
        engine.release?.(active.before);active=null;
        status("Two curves maximum · select/remove one first");
        return;
      }
      selectedCurve=-1;selectedHandle=-1;
      active.curveRaw=[pointFromScreen(canvas,camera,event,options.depth).point];
      status("Drawing a 3D force path · release to finish");
      }
    }
    curveSelectionUI();drawCurveOverlay();
  }
  if(mode==="sculpt"){
    const found=pickSculptHandle(event);
    if(found>=0){
      selectedSculpt=found;active.sculptIndex=found;
    }else{
      if(engine.sculptNodes.length>=MAX_SCULPT_NODES){
        engine.release?.(active.before);active=null;
        status("Six anchors maximum · drag a handle or remove one");
        return;
      }
      const pos=pointFromScreen(canvas,camera,event,options.depth).point;
      const node=newSculptNode($("sculptType").value,pos,Number($("sculptRadius").value),
        Number($("sculptStrength").value),engine.time*.83+engine.sculptNodes.length*1.7);
      engine.sculptNodes.push(node);
      selectedSculpt=engine.sculptNodes.length-1;
      active.sculptIndex=selectedSculpt;active.changed=true;
      status("Placed "+node.type+" anchor · drag to reposition");
    }
    sculptSelectionUI();curveSelectionUI();updateSculptMarkers();drawCurveOverlay();
  }
  if(mode==="inject"){
    const p=pointFromScreen(canvas,camera,event,options.depth).point;
    engine.stamp(p,options.brush,Number($("pigment").value),.46);active.changed=true;
  }
});
canvas.addEventListener("pointermove",event=>{
  if(touches.has(event.pointerId)){
    touches.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(touches.size>=2){
      const span=touchSpan();
      if(pinchSpan>0&&span>2)setZoom(camera.distance*pinchSpan/span,false);
      pinchSpan=span;return;
    }
  }
  if(!active||active.id!==event.pointerId)return;
  const rect=canvas.getBoundingClientRect();
  const dx=(event.clientX-active.x)/Math.max(1,rect.width),dy=(event.clientY-active.y)/Math.max(1,rect.height);
  if(dx===0&&dy===0)return;
  const {mode:currentMode}=active;
  const oldX=active.x,oldY=active.y;
  active.x=event.clientX;active.y=event.clientY;
  if(currentMode==="curve"){
    if(active.curveHandle>=0){
      const curve=engine.flowCurves[active.curveIndex];
      const point=curve?.points[active.curveHandle];
      if(point){
        const forward=cameraVectors(camera).forward;
        const depth=point.reduce((sum,v,i)=>sum+v*forward[i],0);
        // Apply the camera-space drag DELTA to the persistent base point.
        // This stays usable while the projected animated pose is elsewhere.
        const oldPoint=pointFromScreen(canvas,camera,
          {clientX:oldX,clientY:oldY},depth).point;
        const newPoint=pointFromScreen(canvas,camera,event,depth).point;
        const next=point.map((v,i)=>Math.max(-.93,Math.min(.93,v+newPoint[i]-oldPoint[i])));
        if(Math.hypot(...next.map((v,i)=>v-point[i]))>1e-5){
          curve.points[active.curveHandle]=next;
          active.changed=true;
        }
      }
    }else if(active.curveMoving){
      const curve=engine.flowCurves[active.curveIndex];
      if(curve){
        const forward=cameraVectors(camera).forward;
        const depth=curve.points[0].reduce((acc,v,i)=>acc+v*forward[i],0);
        const previous=pointFromScreen(canvas,camera,{clientX:oldX,clientY:oldY},depth).point;
        const current=pointFromScreen(canvas,camera,event,depth).point;
        const offset=current.map((v,i)=>v-previous[i]);
        if(Math.hypot(...offset)>1.e-5){
          curve.points=curve.points.map(p=>p.map((v,i)=>Math.max(-.93,Math.min(.93,v+offset[i]))));
          active.changed=true;
        }
      }
    }else if(active.curveRaw){
      const next=pointFromScreen(canvas,camera,event,options.depth).point;
      const last=active.curveRaw[active.curveRaw.length-1];
      if(Math.hypot(...next.map((v,i)=>v-last[i]))>.035){
        active.curveRaw.push(next);
        if(active.curveRaw.length>96)active.curveRaw=resampleStroke(active.curveRaw,MAX_CURVE_POINTS);
        const sampled=resampleStroke(active.curveRaw,MAX_CURVE_POINTS);
        if(sampled.length>=2){
          if(active.curveIndex<0){
            engine.flowCurves.push(newFlowCurve($("curveType").value,sampled,
              Number($("curveWidth").value),Number($("curveStrength").value)));
            active.curveIndex=engine.flowCurves.length-1;
            selectedCurve=active.curveIndex;selectedHandle=-1;
          }else engine.flowCurves[active.curveIndex].points=sampled;
          active.changed=true;
        }
      }
    }
    curveSelectionUI();drawCurveOverlay();
    return;
  }
  if(currentMode==="orbit"){
    camera.azimuth-=dx*4.6;camera.elevation=Math.max(-1.32,Math.min(1.32,camera.elevation+dy*3.6));
  }else{
    const sample=pointFromScreen(canvas,camera,event,options.depth);
    if(currentMode==="sculpt"){
      const n=engine.sculptNodes[active.sculptIndex];
      if(n){
        const forward=cameraVectors(camera).forward;
        const depth=n.p[0]*forward[0]+n.p[1]*forward[1]+n.p[2]*forward[2];
        n.p=pointFromScreen(canvas,camera,event,depth).point.map(v=>Math.max(-.93,Math.min(.93,v)));
        updateSculptMarkers();
      }
    }
    if(currentMode==="inject")engine.stamp(sample.point,options.brush,Number($("pigment").value),.26);
    if(currentMode==="stir"){
      const velocity=sample.right.map((v,i)=>(v*dx-sample.up[i]*dy)*options.force*17);
      engine.push(sample.point,velocity,options.brush);
    }
    active.changed=true;
  }
});
function completePointer(event,cancelled){
  if(touches.has(event.pointerId))touches.delete(event.pointerId);
  if(touches.size<2)pinchSpan=0;
  if(!active||active.id!==event.pointerId)return;
  if(active.before){
    if(cancelled){restore(active.before);engine.release?.(active.before);status("Touch cancelled; pigment checkpoint restored");}
    else if(active.changed){
      if(engine!==field){
        if(active.mode==="inject")engine.flush(options.speed);
        else if(active.mode==="stir")engine.step(1/15,options.speed);
      }
      snapshotCommand(active.before);
    }
    else engine.release?.(active.before);
  }
  if(active.mode==="curve"&&active.changed&&!cancelled&&active.curveRaw&&
     active.curveIndex>=0){
    const points=engine.flowCurves[active.curveIndex]?.points;
    if(points?.length>2)selectedHandle=Math.floor((points.length-1)/2);
  }
  active=null;sculptSelectionUI();curveSelectionUI();drawCurveOverlay();updateSculptMarkers();
}
canvas.addEventListener("pointerup",e=>completePointer(e,false));
canvas.addEventListener("pointercancel",e=>completePointer(e,true));
canvas.addEventListener("lostpointercapture",e=>completePointer(e,true));
window.addEventListener("blur",()=>{touches.clear();pinchSpan=0;if(active){if(active.before){restore(active.before);engine.release?.(active.before);}active=null;}});
document.addEventListener("visibilitychange",()=>{lastFrame=0;accumulator=0;});
canvas.addEventListener("webglcontextlost",e=>{e.preventDefault();paused=true;status("GPU context lost. Reload to restore the volume.");});
function frame(timestamp){
  try{
    if(!lastFrame)lastFrame=timestamp;
    const elapsed=Math.min((timestamp-lastFrame)/1000,.1);lastFrame=timestamp;
    if(!paused){
      accumulator+=elapsed;
      let n=0;while(accumulator>=1/15&&n<3){engine.step(1/15,options.speed);accumulator-=1/15;n++;}
      if(n===3)accumulator=0;
    }
    if(timestamp-lastDraw>38){draw();lastDraw=timestamp;}
  }catch(err){paused=true;status("Render halted: "+err.message);console.error(err);}
  requestAnimationFrame(frame);
}
try{
  renderer=new VolumeRenderer(canvas,field);
  try{engine=new GPUPigmentTransport(renderer,field);engineMode="GPU";}
  catch(gpuError){engine=field;engineMode="CPU";console.warn("GPU transport unavailable; CPU fallback",gpuError);}
  paletteSelect.value="Prismatic Riot";
  $("forgeMode").value=engine.forgeMode;
  $("livingMode").value=engine.livingMode;
  $("fiberEnabled").value=engine.fiberEnabled?"on":"off";
  $("turbulence").value=field.turbulence;
  $("turbulenceText").textContent=field.turbulence.toFixed(1);
  $("engineBadge").textContent=engineMode+" transport";
  updateGeneNursery();curveSelectionUI();sculptSelectionUI();updateSculptMarkers();
  status(engineMode+" immersive volume ready · pinch to zoom, tap Controls for settings");
  requestAnimationFrame(frame);
}catch(err){status("Cannot start volume: "+err.message);console.error(err);}
