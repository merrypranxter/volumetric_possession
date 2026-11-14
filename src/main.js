import {PigmentField} from "./field.js";
import {VolumeRenderer,pointFromScreen,projectToScreen,cameraVectors} from "./render.js";
import {MAX_SCULPT_NODES,newSculptNode,summonSculptTriad} from "./flow-sculpt.js";
import {MAX_CURVES,MAX_CURVE_POINTS,newFlowCurve,resampleStroke} from "./flow-curve.js";
import {splitFlowCurve,braidFlowCurve} from "./curve-topology.js";
import {cloneFlowCurves} from "./flow-curve.js";
import {evaluateLivingCurves,LIVING_MODES} from "./living-braid.js";
import {BREEDER_SLOTS,DEFAULT_BREED_SEED,captureCurveGenome,cloneCurveGenome,cloneBreederParents,breedCurveGenomes,nurseryStarters} from "./curve-breeder.js";
import {GALLERY_LIMIT,GENE_STORAGE_KEY,cloneGeneGallery,cloneGeneSources,addGeneSpecimen,editGeneSpecimen,removeGeneSpecimen,genealogicalChain,serializeGeneBank,parseGeneBank} from "./gene-gallery.js";
import {TRAIT_KEYS,TRAIT_LABELS,normalizeTraitLocks,breedWithTraitLocks} from "./trait-locks.js";
import {SURGERY_OPERATIONS,SURGERY_LABELS,performGeneSurgery} from "./gene-surgery.js";
import {GPUPigmentTransport} from "./gpu-transport.js";
import {twistForceCurve,twoFingerTransform,wrappedTurn} from "./gesture-twist.js";
import {cloneColorState,moveColorLens} from "./color-control.js";
import {measureAuthoredWinding,projectWindingDefects} from "./flow-winding.js";
import {closestScreenCurve,bendForceCurve} from "./elastic-strand.js";
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
const foldEditDrafts=new Map(),gradeEditDrafts=new Map();
let pinchEdit=null,pinchSuppressed=false;
let windingCache=[],lastWindingScan=0;
const structuralControls=["foldWrite","foldPersistence","foldGrip","forgePower","forgeWidth","forgePace","fiberGrowth","fiberPersistence","fiberBend","fiberGuidance","livingRate","livingAmount"];
function structuralDecimals(id){return ["foldGrip","foldPersistence","forgePower","forgeWidth","forgePace","fiberPersistence","fiberGuidance","livingRate","livingAmount"].includes(id)?2:1;}
const touches=new Map();
let selectedSculpt=-1,selectedCurve=-1,selectedHandle=-1,selectedGeneId=null;
let previewChild=null,previewSignature=null;
let surgeryCandidate=null,surgeryCandidateSignature=null;
function invalidateSurgeryPreview(){
  surgeryCandidate=null;surgeryCandidateSignature=null;
  $("applySurgery").disabled=true;
  $("surgeryReport").textContent="Preview needs refreshing · active material remains intact";
}
const traitSelectors={topology:"traitTopology",shape:"traitShape",force:"traitForce",
  material:"traitMaterial",motion:"traitMotion",dynamics:"traitDynamics"};
function invalidateChildPreview(){
  previewChild=null;previewSignature=null;
  $("hatchGene").disabled=true;
  $("traitReceipt").textContent="Preview needs refreshing · no artwork changed";
}
function syncTraitControls(){
  const locks=normalizeTraitLocks(engine.breedTraitLocks);
  for(const key of TRAIT_KEYS){
    const select=$(traitSelectors[key]);
    select.value=locks[key];
    for(const option of select.options){
      if(option.value!=="auto")option.disabled=!engine.breederParents[Number(option.value)];
    }
  }
}
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
  $("previewSurgery").disabled=curves.length===0;
  if(curves.length===0)invalidateSurgeryPreview();
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
  $("previewGene").disabled=count<2;
  syncTraitControls();
  invalidateChildPreview();
  invalidateSurgeryPreview();
  $("clearGeneParents").disabled=count===0;
  $("breedSeed").value=engine.breederSeed??DEFAULT_BREED_SEED;
}
function syncBreedingField(){
  if(engine===field)return;
  field.breederParents=cloneBreederParents(engine.breederParents);
  field.breederSeed=engine.breederSeed;
  field.breedTraitLocks=normalizeTraitLocks(engine.breedTraitLocks);
  field.breederSources=cloneGeneSources(engine.breederSources);
  field.geneGallery=cloneGeneGallery(engine.geneGallery);
  field.geneNextSequence=engine.geneNextSequence;
}
function persistGeneBank(){
  try{
    if(!window.localStorage)throw Error("Local storage unavailable");
    window.localStorage.setItem(GENE_STORAGE_KEY,serializeGeneBank(engine));
    $("geneAlbumStorage").textContent="Saved on this device · backup JSON for safekeeping (no pigment or textures)";
  }catch(e){
    $("geneAlbumStorage").textContent="Local save unavailable — use Backup JSON to keep your family safely";
  }
}
function restoreSavedGeneBank(){
  try{
    const raw=window.localStorage?.getItem(GENE_STORAGE_KEY);
    if(!raw)return;
    const bank=parseGeneBank(raw);
    Object.assign(engine,bank);
    syncBreedingField();
    $("geneAlbumStorage").textContent="Restored local mathematical DNA · export a backup when you find a keeper";
  }catch(e){
    $("geneAlbumStorage").textContent="Local family unavailable ("+e.message+"). Import a JSON backup if you have one";
  }
}
function albumPreview(canvas,genome){
  const c=canvas.getContext?.("2d");if(!c)return;
  canvas.width=240;canvas.height=104;
  c.clearRect(0,0,240,104);c.fillStyle="#080b18";c.fillRect(0,0,240,104);
  const colors={stream:"#36f8e2",coil:"#ef71ff",gather:"#ffc964"};
  for(const curve of genome.curves){
    const pts=curve.points.map(p=>[120+94*(.84*p[0]+.36*p[2]),52-41*(p[1]+.18*p[2])]);
    if(pts.length<2)continue;
    c.beginPath();c.moveTo(pts[0][0],pts[0][1]);
    for(const pt of pts.slice(1))c.lineTo(pt[0],pt[1]);
    c.lineJoin="round";c.lineCap="round";c.lineWidth=4;
    c.shadowBlur=14;c.shadowColor=colors[curve.type];c.strokeStyle=colors[curve.type];c.stroke();
    c.shadowBlur=0;c.lineWidth=1.4;c.strokeStyle="#fff5fb";c.stroke();
  }
}
function renderGeneGallery(){
  const gallery=engine.geneGallery||[],container=$("geneGallery");
  container.replaceChildren();
  $("geneAlbumCount").textContent=gallery.length+" / "+GALLERY_LIMIT;
  $("saveGeneNow").disabled=!engine.flowCurves.length;
  $("exportGeneBank").disabled=gallery.length===0&&!engine.breederParents.some(Boolean);
  if(!gallery.some(item=>item.id===selectedGeneId))selectedGeneId=gallery.at(-1)?.id||null;
  const byId=new Map(gallery.map(g=>[g.id,g]));
  const selected=byId.get(selectedGeneId);
  if(selected){
    const chain=genealogicalChain(gallery,selected.id,4);
    const textLines=chain.map((n,i)=>"  ".repeat(n.depth)+(n.depth?"↳ ":"")+"G"+n.generation+" · "+n.label+" ("+n.id+")");
    if(selected.surgery){
      const op=selected.surgery;
      textLines.push("  ✂ Surgery: "+(SURGERY_LABELS[op.operation]||op.operation)+
        " · recipient strand "+(op.target+1)+" · donor "+op.sourceLabel+
        (op.operation==="remove"?"":" · donor strand "+(op.donorStrand+1)));
    }
    if(selected.inheritance&&Object.values(selected.inheritance).some(v=>v!=="Auto")){
      const receipt=TRAIT_KEYS.map(k=>selected.inheritance[k]&&selected.inheritance[k]!=="Auto"?
        TRAIT_LABELS[k]+" ← "+selected.inheritance[k]:null).filter(Boolean);
      if(receipt.length)textLines.push("  Trait heists: "+receipt.join(" · "));
    }
    const missing=selected.parents.filter(p=>p.id&&!byId.has(p.id));
    if(missing.length)textLines.push("  ↳ Earlier ancestors not in album: "+missing.map(x=>x.label).join(", "));
    $("geneTree").textContent=textLines.join("\n")+"\n"+(selected.seed===null?"Hand-authored / starter DNA":"Birth seed "+selected.seed);
  }else $("geneTree").textContent="Select a specimen to reveal its family tree.";
  const make=(label,fn)=>{
    const button=document.createElement("button");
    button.type="button";button.textContent=label;button.addEventListener("click",event=>{event.stopPropagation?.();fn();});
    return button;
  };
  // Newest first; strong favorites remain protected from automatic overflow.
  for(const item of [...gallery].reverse()){
    const card=document.createElement("article");card.className="gene-card";
    card.setAttribute("role","listitem");card.dataset.selected=String(item.id===selectedGeneId);
    const preview=document.createElement("canvas");preview.className="gene-thumb";
    preview.setAttribute("aria-hidden","true");albumPreview(preview,item.genome);card.append(preview);
    const name=document.createElement("div");name.className="gene-card-name";
    name.textContent=(item.favorite?"★ ":"")+item.label;card.append(name);
    const subtitle=document.createElement("div");subtitle.className="gene-card-sub";
    subtitle.textContent="G"+item.generation+" · "+item.genome.curves.length+" curve(s) · "+item.genome.livingMode;
    card.append(subtitle);
    const actions=document.createElement("div");actions.className="gene-card-actions";
    actions.append(
      make("View tree",()=>{selectedGeneId=item.id;renderGeneGallery();}),
      make("Activate",()=>activateArchivedGene(item.id)),
      make(item.favorite?"★ Saved":"☆ Keep",()=>{
        const before=engine.snapshot();engine.geneGallery=editGeneSpecimen(engine.geneGallery,item.id,{favorite:!item.favorite});
        syncBreedingField();snapshotCommand(before);renderGeneGallery();
      })
    );
    for(let i=0;i<BREEDER_SLOTS;i++)actions.append(make("Parent "+String.fromCharCode(65+i),
      ()=>promoteArchivedGene(item.id,i)));
    actions.append(
      make("Rename",()=>renameArchivedGene(item.id)),
      make("×",()=>removeArchivedGene(item.id))
    );
    card.append(actions);container.append(card);
  }
}
function saveGenomeToAlbum(genome,options={}){
  const saved=addGeneSpecimen(engine.geneGallery,genome,
    {...options,sequence:engine.geneNextSequence});
  engine.geneGallery=saved.gallery;engine.geneNextSequence=saved.nextSequence;
  selectedGeneId=saved.record.id;
  return saved.record;
}
function promoteArchivedGene(id,slot){
  const chosen=engine.geneGallery.find(g=>g.id===id);if(!chosen)return;
  const before=engine.snapshot();
  engine.breederParents[slot]=cloneCurveGenome(chosen.genome);
  engine.breederSources[slot]={id:chosen.id,label:chosen.label};
  syncBreedingField();snapshotCommand(before);updateGeneNursery();renderGeneGallery();
  status(chosen.label+" promoted to Parent "+String.fromCharCode(65+slot));
}
function activateArchivedGene(id){
  const specimen=engine.geneGallery.find(g=>g.id===id);if(!specimen)return;
  const before=engine.snapshot();const genome=cloneCurveGenome(specimen.genome);
  engine.flowCurves=cloneFlowCurves(genome.curves);
  engine.livingMode=genome.livingMode;engine.livingRate=genome.livingRate;engine.livingAmount=genome.livingAmount;
  if(engine!==field){
    field.flowCurves=cloneFlowCurves(engine.flowCurves);
    field.livingMode=engine.livingMode;field.livingRate=engine.livingRate;field.livingAmount=engine.livingAmount;
  }
  $("livingMode").value=engine.livingMode;
  for(const id of ["livingRate","livingAmount"]){
    $(id).value=engine[id];$(id+"Text").textContent=Number(engine[id]).toFixed(2);
  }
  selectedCurve=0;selectedHandle=-1;selectedGeneId=id;
  snapshotCommand(before);setMode("curve");curveSelectionUI();renderGeneGallery();
  status("Activated "+specimen.label+" · pigment and fiber history preserved");
}
function renameArchivedGene(id){
  const item=engine.geneGallery.find(g=>g.id===id);if(!item)return;
  const name=prompt("Name this mathematical specimen",item.label);
  if(name===null||!name.trim())return;
  const before=engine.snapshot();
  engine.geneGallery=editGeneSpecimen(engine.geneGallery,id,{label:name});
  for(const ref of engine.breederSources||[])if(ref?.id===id)ref.label=name.trim().slice(0,48);
  syncBreedingField();snapshotCommand(before);renderGeneGallery();updateGeneNursery();
}
function removeArchivedGene(id){
  const specimen=engine.geneGallery.find(g=>g.id===id);if(!specimen)return;
  if(!confirm("Delete "+specimen.label+" from the album? Descendants keep their ancestral label, but the specimen cannot be reopened."))return;
  const before=engine.snapshot();
  engine.geneGallery=removeGeneSpecimen(engine.geneGallery,id);
  selectedGeneId=null;
  syncBreedingField();snapshotCommand(before);renderGeneGallery();
  status("Specimen deleted; saved descendants and existing material remain");
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
  return closestScreenCurve(displayFlowCurves(),
    p=>projectToScreen(canvas,camera,p),
    event.clientX-rect.left,event.clientY-rect.top,27);
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
function syncColorState(){
  const grade=cloneColorState(engine.colorGrade);
  engine.colorGrade=grade;field.colorGrade=cloneColorState(grade);
  $("neonIntensity").value=grade.neon;
  $("neonIntensityText").textContent=grade.neon.toFixed(1);
  $("neonMode").value=grade.mode;
  $("neonRadius").value=grade.radius;
  $("neonRadiusText").textContent=grade.radius.toFixed(2);
  $("windingGlow").value=grade.defectGlow;
  $("windingGlowText").textContent=grade.defectGlow.toFixed(1);
  updateColorLensMarker();
}
function updateColorLensMarker(){
  const marker=$("colorLensMarker"),grade=engine.colorGrade;
  marker.hidden=mode!=="neon"||grade.mode!=="lens"||grade.neon<=0;
  if(marker.hidden)return;
  const rect=canvas.getBoundingClientRect(),size=grade.radius*2*rect.height;
  marker.style.left=(grade.lens[0]*100)+"%";
  marker.style.top=((1-grade.lens[1])*100)+"%";
  marker.style.width=size+"px";marker.style.height=size+"px";
}
function setGrade(update){
  engine.colorGrade=cloneColorState({...engine.colorGrade,...update});
  field.colorGrade=cloneColorState(engine.colorGrade);
  syncColorState();
}
function releaseCommands(commands){for(const cmd of commands){engine.release?.(cmd.before);engine.release?.(cmd.after);}}
function clearHistory(){
  for(const saved of foldEditDrafts.values())engine.release?.(saved);
  foldEditDrafts.clear();
  for(const saved of gradeEditDrafts.values())engine.release?.(saved);
  gradeEditDrafts.clear();
  releaseCommands(undo);releaseCommands(redo);undo.length=0;redo.length=0;updateHistory();
}
function updateHistory(){$("undo").disabled=undo.length===0;$("redo").disabled=redo.length===0;}
function snapshotCommand(before){undo.push({before,after:engine.snapshot()});if(undo.length>9)releaseCommands([undo.shift()]);releaseCommands(redo);redo.length=0;updateHistory();persistGeneBank();}
function restore(s){engine.restore(s);syncColorState();lastWindingScan=0;invalidateSurgeryPreview();syncBreedingField();updateGeneNursery();renderGeneGallery();persistGeneBank();curveSelectionUI();drawCurveOverlay();sculptSelectionUI();updateSculptMarkers();$("flow").value=engine.flow;$("genesis").value=engine.morphology;$("turbulence").value=engine.turbulence||0;$("turbulenceText").textContent=(engine.turbulence||0).toFixed(1);$("integration").value=engine.integration||"euler";
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
  if(!renderer)return;
  const bg=[options.background,[.012,.018,.065],[.042,.008,.05]][Number($("background").value)];
  const grade=engine.colorGrade;
  let projected=[];
  if(grade.defectGlow>.001){
    const now=Date.now();
    if(!lastWindingScan||now-lastWindingScan>650){
      windingCache=measureAuthoredWinding(displayFlowCurves(),engine.sculptNodes,engine.time,20);
      lastWindingScan=now;
      $("flowWindingReport").textContent="XY phase defects: "+windingCache.length+
        " sampled ±1 charges (20×20; z=0)";
    }
    const rect=canvas.getBoundingClientRect();
    projected=projectWindingDefects(windingCache,point=>{
      const pos=projectToScreen(canvas,camera,point);
      return pos?{x:pos.x/rect.width,y:pos.y/rect.height,visible:pos.visible}:null;
    },6);
  }else $("flowWindingReport").textContent="Flow winding: off";
  renderer.draw(camera,params(),{gain:options.gain,glow:options.glow,steps:options.steps,
    background:bg,lightDir:directions[options.lightDirection],shadow:options.shadow,
    lightSteps:options.lightSteps,foldGlow:options.foldGlow,memoryView:options.memoryView,
    wisp:options.wisp,prism:options.prism,fiberLight:options.fiberLight,
    colorGrade:grade,windingDefects:projected});
  updateColorLensMarker();updateSculptMarkers();drawCurveOverlay();
}
function setMode(next){mode=next;for(const b of document.querySelectorAll(".mode"))b.setAttribute("aria-pressed",String(b.dataset.mode===mode));$("modeLabel").textContent={stir:"STIR · drag to disturb pigment",inject:"INJECT · paint into the volume",orbit:"ORBIT · drag to rotate camera",sculpt:"SCULPT · tap to anchor / drag glowing handles",curve:"DRAW FLOW · tug locally, drag a handle, or twist/pinch the force",neon:"NEON LENS · drag light focus / pinch lens radius"}[mode];updateColorLensMarker();updateSculptMarkers();drawCurveOverlay();}
for(const b of document.querySelectorAll(".mode"))b.addEventListener("click",()=>setMode(b.dataset.mode));
// Elastic gesture reach and tension are brush preferences, not new GPU passes.
for(const [id,digits] of [["curveTugReach",2],["curveTugPower",1]]){
  $(id).addEventListener("input",()=>{$(id+"Text").textContent=Number($(id).value).toFixed(digits);});
}
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
// Color is a scene-level read-only render control with one checkpoint per
// completed slider gesture. Nothing here mutates pigment or palette stops.
for(const [id,key] of [["neonIntensity","neon"],["neonRadius","radius"],["windingGlow","defectGlow"]]){
  $(id).addEventListener("input",()=>{
    if(!gradeEditDrafts.has(id))gradeEditDrafts.set(id,engine.snapshot());
    setGrade({[key]:Number($(id).value)});
    if(id==="windingGlow")lastWindingScan=0;
  });
  const commit=()=>{
    const before=gradeEditDrafts.get(id);if(!before)return;
    gradeEditDrafts.delete(id);snapshotCommand(before);
  };
  $(id).addEventListener("change",commit);
  $(id).addEventListener("blur",commit);
  $(id).addEventListener("pointercancel",()=>{
    const before=gradeEditDrafts.get(id);if(!before)return;
    gradeEditDrafts.delete(id);restore(before);engine.release?.(before);
  });
}
$("neonMode").addEventListener("change",()=>{
  if($("neonMode").value===engine.colorGrade.mode)return;
  const before=engine.snapshot();setGrade({mode:$("neonMode").value});
  snapshotCommand(before);
});
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
    try{
      const parent=captureCurveGenome(engine),letter=String.fromCharCode(65+i);
      const item=saveGenomeToAlbum(parent,{label:"Captured Parent "+letter+" #"+engine.geneNextSequence});
      engine.breederParents[i]=cloneCurveGenome(parent);
      engine.breederSources[i]={id:item.id,label:item.label};
      syncBreedingField();updateGeneNursery();snapshotCommand(before);renderGeneGallery();
      $("breedResult").textContent="Captured parent "+letter;
      status("Parent "+letter+" archived for selective breeding");
    }catch(error){engine.release?.(before);status("Capture failed: "+error.message);}

  });
}
$("loadGeneStarters").addEventListener("click",()=>{
  const before=engine.snapshot();
  try{
    const starters=nurseryStarters(),labels=["Writhe Siren","Coil Doppelgänger","Tail-Swap Devil"];
    // Build all three before changing the active scene, so a full starred
    // gallery cannot partially replace the family.
    let staged=cloneGeneGallery(engine.geneGallery),serial=engine.geneNextSequence;
    const refs=[];
    for(let i=0;i<3;i++){
      const saved=addGeneSpecimen(staged,starters[i],{
        sequence:serial,label:labels[i]+" · G0",favorite:false
      });
      staged=saved.gallery;serial=saved.nextSequence;
      refs.push({id:saved.record.id,label:saved.record.label});
    }
    engine.geneGallery=staged;engine.geneNextSequence=serial;
    engine.breederParents=cloneBreederParents(starters);
    engine.breederSources=cloneGeneSources(refs);
    selectedGeneId=refs[2].id;
    syncBreedingField();updateGeneNursery();snapshotCommand(before);renderGeneGallery();
    $("breedResult").textContent="Three weird parents archived";
    status("Three starter ancestors archived · they're ready to breed and mutate");
  }catch(error){engine.release?.(before);status("Nursery failed: "+error.message);}
});
$("breedMutation").addEventListener("input",()=>{
  $("breedMutationText").textContent=Number($("breedMutation").value).toFixed(2);
  invalidateChildPreview();
});
$("breedSeed").addEventListener("change",()=>{
  const n=Number($("breedSeed").value);
  if(!Number.isInteger(n)||n<0||n>0xffffffff){
    $("breedSeed").value=engine.breederSeed;status("Seed must be an integer from 0 to 4294967295");return;
  }
  if(n===engine.breederSeed)return;
  const before=engine.snapshot();
  engine.breederSeed=n>>>0;field.breederSeed=engine.breederSeed;
  snapshotCommand(before);invalidateChildPreview();
  status("Breeding seed set to "+engine.breederSeed);
});

for(const key of TRAIT_KEYS){
  $(traitSelectors[key]).addEventListener("change",()=>{
    const value=$(traitSelectors[key]).value;
    if(value!=="auto"&&!engine.breederParents[Number(value)]){
      $(traitSelectors[key]).value=engine.breedTraitLocks[key];
      status("That donor parent slot is empty");return;
    }
    if(value===engine.breedTraitLocks[key])return;
    const before=engine.snapshot();
    engine.breedTraitLocks=normalizeTraitLocks({...engine.breedTraitLocks,[key]:value});
    syncBreedingField();snapshotCommand(before);invalidateChildPreview();
    status(TRAIT_LABELS[key]+": "+(value==="auto"?"automatic inheritance":"locked to Parent "+String.fromCharCode(65+Number(value))));
  });
}
$("resetTraitLocks").addEventListener("click",()=>{
  const fresh=normalizeTraitLocks();
  if(JSON.stringify(fresh)===JSON.stringify(engine.breedTraitLocks))return;
  const before=engine.snapshot();engine.breedTraitLocks=fresh;
  syncBreedingField();syncTraitControls();snapshotCommand(before);invalidateChildPreview();
  status("All six trait channels returned to automatic crossover");
});
$("breedDominance").addEventListener("change",invalidateChildPreview);
function birthInputs(){
  if(engine.breederParents.filter(Boolean).length<2)throw Error("Capture two parents or load starters");
  const seed=Number($("breedSeed").value);
  if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw Error("Seed must be a 32-bit unsigned integer");
  const dominance=$("breedDominance").value;
  if(dominance!=="balanced"&&!engine.breederParents[Number(dominance)])
    throw Error("Dominant parent slot is empty");
  const mutation=Number($("breedMutation").value);
  if(!Number.isFinite(mutation)||mutation<0||mutation>.5)
    throw Error("Mutation must be from 0 to 0.5");
  const locks=normalizeTraitLocks(engine.breedTraitLocks);
  for(const key of TRAIT_KEYS){
    const value=locks[key];
    if(value!=="auto"&&!engine.breederParents[Number(value)])
      throw Error(TRAIT_LABELS[key]+" donor is empty");
  }
  return {seed,dominance,mutation,locks,
    signature:JSON.stringify({seed,dominance,mutation,locks,parents:engine.breederParents})};
}
function candidateReceipt(child){
  const details=TRAIT_KEYS.map(key=>TRAIT_LABELS[key]+": "+child.inheritance[key]);
  return child.curves.length+" strands · "+child.curves.map(c=>c.type).join("+")+
    " · "+child.livingMode+" · "+details.join(" · ")+
    (child.notes.length?" · "+child.notes.join("; "):"");
}
function generateChild(inputs){
  return breedWithTraitLocks(engine.breederParents,
    inputs.seed,inputs.mutation,inputs.dominance,inputs.locks);
}
$("previewGene").addEventListener("click",()=>{
  try{
    const inputs=birthInputs(),child=generateChild(inputs);
    previewChild=child;previewSignature=inputs.signature;
    albumPreview($("traitPreviewCanvas"),child);
    $("traitReceipt").textContent="👁 "+candidateReceipt(child)+
      " · seed "+inputs.seed+" (not yet born)";
    $("hatchGene").disabled=false;
    status("Preview only · no pigment, seed, or archive changed");
  }catch(error){invalidateChildPreview();status("Preview failed: "+error.message);}
});
function hatchOffspring(child,seed,mutation,dominance){
  // Build archive before touching material; full favorite-only galleries
  // reject birth safely without changing active curves or texture state.
  let archived;
  try{
    const parents=(engine.breederSources||[]).map((ref,i)=>engine.breederParents[i]?
      ref||{id:null,label:"Unsaved Parent "+String.fromCharCode(65+i)}:null).filter(Boolean);
    archived=addGeneSpecimen(engine.geneGallery,child,{
      sequence:engine.geneNextSequence,parents,seed,mutation,
      traitLocks:child.traitLocks,inheritance:child.inheritance,
      label:"Mutant "+engine.geneNextSequence+" · seed "+seed
    });
  }catch(error){status("Birth not archived: "+error.message);return false;}
  const before=engine.snapshot();
  engine.geneGallery=archived.gallery;
  engine.geneNextSequence=archived.nextSequence;
  selectedGeneId=archived.record.id;
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
  curveSelectionUI();updateGeneNursery();snapshotCommand(before);setMode("curve");renderGeneGallery();
  const report="Seed "+seed+" · G"+archived.record.generation+" · "+child.curves.length+" curves · "+child.livingMode;
  $("breedResult").textContent=report;
  status("Offspring born — "+report+" · inherited force laws, existing pigment preserved");
  return true;
}
$("hatchGene").addEventListener("click",()=>{
  try{
    const inputs=birthInputs();
    if(!previewChild||previewSignature!==inputs.signature){
      invalidateChildPreview();status("Preview changed; preview the child again before hatching");return;
    }
    hatchOffspring(previewChild,inputs.seed,inputs.mutation,inputs.dominance);
  }catch(error){status("Hatch failed: "+error.message);}
});
$("breedChild").addEventListener("click",()=>{
  try{
    const inputs=birthInputs();
    const child=generateChild(inputs);
    hatchOffspring(child,inputs.seed,inputs.mutation,inputs.dominance);
  }catch(error){status("Breeding failed: "+error.message);}
});
// Phase 01P: every preview is derived from the immutable current patient
// and a captured or archived donor, never from a mutable GPU texture.
function surgicalInputs(){
  const recipient=captureCurveGenome(engine);
  const operation=$("surgeryAction").value;
  const target=Number($("surgeryTarget").value);
  const donorStrand=Number($("surgeryDonorStrand").value);
  if(!SURGERY_OPERATIONS.includes(operation))throw Error("Unknown operation");
  let donor=null,sourceLabel="No donor",sourceRef=null;
  if(operation!=="remove"){
    const key=$("surgerySource").value;
    if(key==="album"){
      const entry=engine.geneGallery.find(g=>g.id===selectedGeneId);
      if(!entry)throw Error("Select a saved album specimen using View tree");
      donor=cloneCurveGenome(entry.genome);
      sourceLabel=entry.label;
      sourceRef={id:entry.id,label:entry.label};
    }else{
      const slot=Number(key);
      if(!Number.isInteger(slot)||slot<0||slot>=BREEDER_SLOTS)
        throw Error("Choose a parent donor A/B/C or an album specimen");
      if(!engine.breederParents[slot])throw Error("Parent "+String.fromCharCode(65+slot)+" is empty");
      donor=cloneCurveGenome(engine.breederParents[slot]);
      sourceRef=engine.breederSources?.[slot]||null;
      sourceLabel=sourceRef?.label||"Captured Parent "+String.fromCharCode(65+slot);
    }
  }
  const params={operation,target,donorStrand};
  const signature=JSON.stringify({recipient,donor,sourceRef,sourceLabel,selectedGeneId:
    $("surgerySource").value==="album"?selectedGeneId:null,params});
  return {recipient,donor,sourceRef,sourceLabel,params,signature};
}
function previewSurgicalGraft(){
  const inputs=surgicalInputs(),result=performGeneSurgery(inputs.recipient,inputs.donor,inputs.params);
  return {inputs,result};
}
function archiveAndApplySurgery(candidate){
  const {inputs,result}=candidate;
  // Album selection can point to the DONOR rather than the live patient.
  // Identify an actual archived patient by exact genome equivalence, never
  // falsely claim the currently selected donor was the patient's parent.
  const matchesPatient=e=>JSON.stringify(e.genome)===JSON.stringify(inputs.recipient);
  const chosen=engine.geneGallery.find(e=>e.id===selectedGeneId&&matchesPatient(e));
  const exactPatient=chosen||[...engine.geneGallery].reverse().find(matchesPatient);
  const originalRef=exactPatient?
    {id:exactPatient.id,label:exactPatient.label}:null;
  const refs=[];
  if(originalRef)refs.push(originalRef);
  else refs.push({id:null,label:"Edited / unarchived live sculpture"});
  if(inputs.sourceRef?.id&&!refs.some(ref=>ref.id===inputs.sourceRef.id))
    refs.push(inputs.sourceRef);
  else if(inputs.params.operation!=="remove"&&!inputs.sourceRef?.id)
    refs.push({id:null,label:inputs.sourceLabel});
  // Archive creation happens BEFORE any material/velocity mutation.
  const archived=addGeneSpecimen(engine.geneGallery,result.genome,{
    sequence:engine.geneNextSequence,
    parents:refs,
    surgery:{operation:result.operation,target:result.target,donorStrand:result.donorStrand,
      sourceLabel:inputs.sourceLabel},
    label:"Grafted mutant "+engine.geneNextSequence
  });
  const before=engine.snapshot();
  engine.geneGallery=archived.gallery;engine.geneNextSequence=archived.nextSequence;
  selectedGeneId=archived.record.id;
  engine.flowCurves=cloneFlowCurves(result.genome.curves);
  engine.livingMode=result.genome.livingMode;
  engine.livingRate=result.genome.livingRate;
  engine.livingAmount=result.genome.livingAmount;
  if(engine!==field){
    field.flowCurves=cloneFlowCurves(engine.flowCurves);
    field.livingMode=engine.livingMode;
    field.livingRate=engine.livingRate;
    field.livingAmount=engine.livingAmount;
  }
  selectedCurve=Math.max(0,Math.min(result.target,engine.flowCurves.length-1));
  selectedHandle=-1;
  $("livingMode").value=engine.livingMode;
  for(const id of ["livingRate","livingAmount"]){
    $(id).value=engine[id];$(id+"Text").textContent=Number(engine[id]).toFixed(2);
  }
  curveSelectionUI();snapshotCommand(before);setMode("curve");renderGeneGallery();
  invalidateSurgeryPreview();
  $("surgeryReport").textContent="✂ Applied · "+result.detail+
    (result.notes.length?" · "+result.notes.join("; "):"")+
    " · saved as "+archived.record.label+". Material memory preserved.";
  status("Gene Surgery complete · new 3D force DNA archived without resetting pigment");
}
for(const id of ["surgerySource","surgeryAction","surgeryTarget","surgeryDonorStrand"]){
  $(id).addEventListener("change",invalidateSurgeryPreview);
}
$("previewSurgery").addEventListener("click",()=>{
  try{
    const candidate=previewSurgicalGraft();
    surgeryCandidate=candidate;surgeryCandidateSignature=candidate.inputs.signature;
    albumPreview($("surgeryBefore"),candidate.inputs.recipient);
    albumPreview($("surgeryAfter"),candidate.result.genome);
    $("surgeryReport").textContent="👁 "+candidate.result.detail+
      " · donor: "+candidate.inputs.sourceLabel+
      (candidate.result.notes.length?" · "+candidate.result.notes.join("; "):"")+
      " · simulation and artwork unchanged";
    $("applySurgery").disabled=false;
    status("Gene Surgery preview ready · no material changed");
  }catch(error){invalidateSurgeryPreview();status("Surgery preview failed: "+error.message);}
});
$("applySurgery").addEventListener("click",()=>{
  try{
    const current=surgicalInputs();
    if(!surgeryCandidate||surgeryCandidateSignature!==current.signature){
      invalidateSurgeryPreview();status("Patient or donor changed; preview again before surgery");return;
    }
    archiveAndApplySurgery(surgeryCandidate);
  }catch(error){status("Surgery blocked: "+error.message);}
});
$("clearGeneParents").addEventListener("click",()=>{
  if(!engine.breederParents.some(Boolean)||!confirm("Clear all three captured parents? Current art will remain."))return;
  const before=engine.snapshot();
  engine.breederParents=cloneBreederParents();
  engine.breederSources=cloneGeneSources();
  syncBreedingField();updateGeneNursery();snapshotCommand(before);renderGeneGallery();
  $("breedResult").textContent="Nursery cleared";
  status("Parent slots cleared; archived family still safe");
});
$("saveGeneNow").addEventListener("click",()=>{
  if(!engine.flowCurves.length){status("Draw or breed some curves first");return;}
  const before=engine.snapshot();
  try{
    const parentRefs=selectedGeneId&&engine.geneGallery.some(e=>e.id===selectedGeneId)?
      [{id:selectedGeneId,label:engine.geneGallery.find(e=>e.id===selectedGeneId).label}]:[];
    const item=saveGenomeToAlbum(captureCurveGenome(engine),{
      label:"Hand-sculpted "+engine.geneNextSequence,parents:parentRefs
    });
    syncBreedingField();snapshotCommand(before);renderGeneGallery();
    status("Saved "+item.label+" into the album");
  }catch(error){engine.release?.(before);status("Save failed: "+error.message);}
});
$("exportGeneBank").addEventListener("click",()=>{
  try{
    const blob=new Blob([serializeGeneBank(engine)],{type:"application/json"});
    const url=URL.createObjectURL(blob),anchor=document.createElement("a");
    anchor.href=url;anchor.download="volumetric-possession-family-album.json";
    anchor.click();setTimeout(()=>URL.revokeObjectURL(url),7000);
    status("Family JSON backup exported: math DNA only, no pigment");
  }catch(error){status("Backup failed: "+error.message);}
});
$("importGeneBankButton").addEventListener("click",()=>$("importGeneBank").click());
$("importGeneBank").addEventListener("change",event=>{
  const file=event.target.files?.[0];if(!file)return;
  if(file.size>400000){status("Backup too large (400 KB maximum)");return;}
  file.text().then(text=>{
    const bank=parseGeneBank(text);
    if(!confirm("Restore this family JSON? This replaces your saved album and parent slots, not your artwork."))return;
    const before=engine.snapshot();
    Object.assign(engine,bank);syncBreedingField();
    selectedGeneId=null;updateGeneNursery();snapshotCommand(before);renderGeneGallery();
    $("breedResult").textContent="Family backup restored";
    status("Imported "+engine.geneGallery.length+" archived specimens");
  }).catch(error=>status("Import failed: "+error.message))
    .finally(()=>{event.target.value="";});
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
field.livingMode=engine.livingMode;if(engine!==field)engine.reset(field);selectedSculpt=-1;selectedCurve=-1;selectedHandle=-1;sculptSelectionUI();curveSelectionUI();drawCurveOverlay();updateGeneNursery();renderGeneGallery();clearHistory();$("genesis").value=field.morphology;status("Restarted "+field.morphology+" · seed "+field.seed);});
$("new").addEventListener("click",()=>{if(!confirm("Create a new design? This replaces the current volume."))return;const seed=(field.seed+1+Math.floor(Math.random()*100000))>>>0;const flow=engine.flow,turbulence=engine.turbulence,integration=engine.integration;field.reset(seed,$("genesis").value);field.flow=flow;field.turbulence=turbulence;field.integration=integration;
for(const id of structuralControls)field[id]=engine[id];field.forgeMode=engine.forgeMode;field.fiberEnabled=engine.fiberEnabled;if(engine!==field)engine.reset(field);selectedSculpt=-1;selectedCurve=-1;selectedHandle=-1;sculptSelectionUI();curveSelectionUI();drawCurveOverlay();updateGeneNursery();renderGeneGallery();clearHistory();status("New design · "+$("genesis").selectedOptions[0].textContent+" · seed "+seed);});
$("png").addEventListener("click",()=>{try{draw();const a=document.createElement("a");a.download="volumetric-possession-"+field.seed+".png";a.href=canvas.toDataURL("image/png");a.click();status("Current camera view exported as PNG");}catch(err){status("PNG failed: "+err.message);}});
document.addEventListener("keydown",event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="z"){event.preventDefault();if(event.shiftKey)redoStroke();else undoStroke();}});
canvas.addEventListener("pointerdown",event=>{
  if(event.button!==0&&event.pointerType==="mouse")return;
  event.preventDefault();try{canvas.setPointerCapture(event.pointerId);}catch{}
  if(event.pointerType==="touch"){
    touches.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(touches.size>1){
      if(touches.size>2)return;
      // Roll back the interrupted one-finger draft BEFORE starting a
      // separate atomic two-finger edit. No phantom drawing after pinch.
      if(active?.before){restore(active.before);engine.release?.(active.before);}
      active=null;pinchSpan=touchSpan();pinchSuppressed=false;
      const fingers=twoFingerTransform([...touches.values()]);
      if(mode==="curve"&&selectedCurve>=0&&engine.flowCurves[selectedCurve]){
        pinchEdit={kind:"curve",before:engine.snapshot(),index:selectedCurve,
          original:cloneFlowCurves([engine.flowCurves[selectedCurve]])[0],
          axis:cameraVectors(camera).forward,span:fingers.span,angle:fingers.angle,changed:false};
        status("TWIST the selected 3D strand · PINCH its force radius · release to save");
      }else if(mode==="neon"){
        pinchEdit={kind:"neon",before:engine.snapshot(),
          original:moveColorLens(engine.colorGrade,fingers.center.x,fingers.center.y,
            canvas.getBoundingClientRect()),
          span:fingers.span,angle:fingers.angle,changed:false};
        status("PINCH the neon lens width · move its center · release to save");
      }else pinchEdit=null;
      return;
    }
  }
  if(pinchSuppressed||active)return;
  active={id:event.pointerId,x:event.clientX,y:event.clientY,mode,
    before:mode==="orbit"?null:engine.snapshot(),changed:false,sculptIndex:-1,
    curveIndex:-1,curveMoving:false,curveRaw:null,curveHandle:-1,curveTug:null};
  if(mode==="curve"){
    const handle=pickCurveHandle(event);
    if(handle>=0){
      active.curveIndex=selectedCurve;active.curveHandle=handle;
      selectedHandle=handle;
      status("Bend control point "+(handle+1)+" · release to save one Undo step");
    }else{
      const grab=nearestCurve(event),found=grab?.index??-1;
      if(found>=0){
        selectedCurve=found;selectedHandle=-1;active.curveIndex=found;
        active.curveMoving=$("curveDragBehavior").value==="move";
        if(active.curveMoving){
          status("Move whole 3D strand · release to save one Undo step");
        }else{
          active.curveTug={
            original:cloneFlowCurves([engine.flowCurves[found]])[0],
            contact:grab.contact,world:grab.world.slice(),delta:[0,0,0]
          };
          status("ELASTIC TUG · drag this spot to bend its local 3D force · release to save");
        }
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
  if(mode==="neon"){
    setGrade(moveColorLens(engine.colorGrade,event.clientX,event.clientY,
      canvas.getBoundingClientRect()));
    active.changed=true;
    status("Painted chroma focus · drag the lens across the artwork");
  }
});
canvas.addEventListener("pointermove",event=>{
  if(touches.has(event.pointerId)){
    touches.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(touches.size>=2){
      if(touches.size!==2)return;
      if(pinchEdit){
        const fingers=twoFingerTransform([...touches.values()]);
        const ratio=Math.max(.5,Math.min(3,fingers.span/Math.max(1,pinchEdit.span)));
        if(pinchEdit.kind==="curve"){
          const angle=wrappedTurn(fingers.angle,pinchEdit.angle);
          engine.flowCurves[pinchEdit.index]=twistForceCurve(
            pinchEdit.original,pinchEdit.axis,angle,ratio);
          if(engine!==field)field.flowCurves=cloneFlowCurves(engine.flowCurves);
          pinchEdit.changed=Math.abs(angle)>.006||Math.abs(ratio-1)>.006;
          if(pinchEdit.changed)lastWindingScan=0;
          curveSelectionUI();drawCurveOverlay();
        }else if(pinchEdit.kind==="neon"){
          const rect=canvas.getBoundingClientRect();
          const seed=cloneColorState({...pinchEdit.original,
            radius:pinchEdit.original.radius*ratio});
          setGrade(moveColorLens(seed,fingers.center.x,fingers.center.y,rect));
          pinchEdit.changed=Math.abs(ratio-1)>.006||
            Math.hypot(fingers.center.x-(rect.left+pinchEdit.original.lens[0]*rect.width),
              fingers.center.y-(rect.top+(1-pinchEdit.original.lens[1])*rect.height))>2;
        }
        return;
      }
      const span=touchSpan();
      if(pinchSpan>0&&span>2)setZoom(camera.distance*pinchSpan/span,false);
      pinchSpan=span;return;
    }
  }
  if(pinchSuppressed||!active||active.id!==event.pointerId)return;
  const rect=canvas.getBoundingClientRect();
  const dx=(event.clientX-active.x)/Math.max(1,rect.width),dy=(event.clientY-active.y)/Math.max(1,rect.height);
  if(dx===0&&dy===0)return;
  const {mode:currentMode}=active;
  const oldX=active.x,oldY=active.y;
  active.x=event.clientX;active.y=event.clientY;
  if(currentMode==="neon"){
    setGrade(moveColorLens(engine.colorGrade,event.clientX,event.clientY,rect));
    active.changed=true;
    return;
  }
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
    }else if(active.curveTug){
      const tug=active.curveTug,forward=cameraVectors(camera).forward;
      const depth=tug.world.reduce((sum,v,k)=>sum+v*forward[k],0);
      const oldPoint=pointFromScreen(canvas,camera,{clientX:oldX,clientY:oldY},depth).point;
      const newPoint=pointFromScreen(canvas,camera,event,depth).point;
      for(let k=0;k<3;k++)tug.delta[k]+=newPoint[k]-oldPoint[k];
      const bent=bendForceCurve(tug.original,tug.contact,tug.delta,
        Number($("curveTugReach").value),Number($("curveTugPower").value));
      const prior=engine.flowCurves[active.curveIndex];
      if(prior&&bent.points.some((p,i)=>p.some((v,k)=>Math.abs(v-(prior.points[i]?.[k]??0))>1.e-5))){
        engine.flowCurves[active.curveIndex]=bent;
        if(engine!==field)field.flowCurves=cloneFlowCurves(engine.flowCurves);
        active.changed=true;lastWindingScan=0;
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
  if(pinchEdit){
    if(cancelled||touches.size<2){
      const gesture=pinchEdit;pinchEdit=null;pinchSuppressed=touches.size>0;
      if(cancelled){
        restore(gesture.before);engine.release?.(gesture.before);
        status("Two-finger edit cancelled · restored previous geometry");
      }else if(gesture.changed){
        snapshotCommand(gesture.before);
        status(gesture.kind==="curve"?"3D twist and force reach saved · Undo available":
          "Neon lens geometry saved · Undo available");
      }else engine.release?.(gesture.before);
      curveSelectionUI();drawCurveOverlay();
    }
    return;
  }
  if(pinchSuppressed){if(touches.size===0)pinchSuppressed=false;return;}
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
function cancelActiveGesture(){
  if(pinchEdit){
    const before=pinchEdit.before;pinchEdit=null;restore(before);engine.release?.(before);
  }
  if(active?.before){restore(active.before);engine.release?.(active.before);}
  active=null;touches.clear();pinchSpan=0;pinchSuppressed=false;
}
window.addEventListener("blur",cancelActiveGesture);
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"&&(active||pinchEdit)){cancelActiveGesture();status("Gesture rolled back");}
});
document.addEventListener("visibilitychange",()=>{lastFrame=0;accumulator=0;if(document.hidden)cancelActiveGesture();});
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
  restoreSavedGeneBank();syncColorState();updateGeneNursery();renderGeneGallery();curveSelectionUI();sculptSelectionUI();updateSculptMarkers();
  status(engineMode+" immersive volume ready · pinch to zoom, tap Controls for settings");
  requestAnimationFrame(frame);
}catch(err){status("Cannot start volume: "+err.message);console.error(err);}
