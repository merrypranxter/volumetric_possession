import {PigmentField} from "./field.js";
import {VolumeRenderer,pointFromScreen,projectToScreen,cameraVectors} from "./render.js";
import {MAX_SCULPT_NODES,newSculptNode,summonSculptTriad} from "./flow-sculpt.js";
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
const structuralControls=["foldWrite","foldPersistence","foldGrip","forgePower","forgeWidth","forgePace","fiberGrowth","fiberPersistence","fiberBend","fiberGuidance"];
function structuralDecimals(id){return ["foldGrip","foldPersistence","forgePower","forgeWidth","forgePace","fiberPersistence","fiberGuidance"].includes(id)?2:1;}
const touches=new Map();
let selectedSculpt=-1;
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
function restore(s){engine.restore(s);sculptSelectionUI();updateSculptMarkers();$("flow").value=engine.flow;$("genesis").value=engine.morphology;$("turbulence").value=engine.turbulence||0;$("turbulenceText").textContent=(engine.turbulence||0).toFixed(1);$("integration").value=engine.integration||"euler";
$("forgeMode").value=engine.forgeMode||"off";field.forgeMode=engine.forgeMode;
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
  updateSculptMarkers();
}
function setMode(next){mode=next;for(const b of document.querySelectorAll(".mode"))b.setAttribute("aria-pressed",String(b.dataset.mode===mode));$("modeLabel").textContent={stir:"STIR · drag to disturb pigment",inject:"INJECT · paint into the volume",orbit:"ORBIT · drag to rotate camera",sculpt:"SCULPT · tap to anchor / drag glowing handles"}[mode];updateSculptMarkers();}
for(const b of document.querySelectorAll(".mode"))b.addEventListener("click",()=>setMode(b.dataset.mode));
for(const b of document.querySelectorAll(".tab"))b.addEventListener("click",()=>{
  for(const t of document.querySelectorAll(".tab"))t.setAttribute("aria-pressed",String(t===b));
  for(const p of document.querySelectorAll(".panel"))p.classList.toggle("open",p.id===b.dataset.panel);
});
for(const id of ["speed","force","brush","depth","density","glow","shadow","turbulence","foldGlow","foldWrite","foldPersistence","foldGrip","forgePower","forgeWidth","forgePace","fiberGrowth","fiberPersistence","fiberBend","fiberGuidance","fiberLight","wisp","prism"]){
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
for(const id of structuralControls)field[id]=engine[id];field.forgeMode=engine.forgeMode;field.fiberEnabled=engine.fiberEnabled;if(engine!==field)engine.reset(field);selectedSculpt=-1;sculptSelectionUI();clearHistory();$("genesis").value=field.morphology;status("Restarted "+field.morphology+" · seed "+field.seed);});
$("new").addEventListener("click",()=>{if(!confirm("Create a new design? This replaces the current volume."))return;const seed=(field.seed+1+Math.floor(Math.random()*100000))>>>0;const flow=engine.flow,turbulence=engine.turbulence,integration=engine.integration;field.reset(seed,$("genesis").value);field.flow=flow;field.turbulence=turbulence;field.integration=integration;
for(const id of structuralControls)field[id]=engine[id];field.forgeMode=engine.forgeMode;field.fiberEnabled=engine.fiberEnabled;if(engine!==field)engine.reset(field);selectedSculpt=-1;sculptSelectionUI();clearHistory();status("New design · "+$("genesis").selectedOptions[0].textContent+" · seed "+seed);});
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
  active={id:event.pointerId,x:event.clientX,y:event.clientY,mode,before:mode==="orbit"?null:engine.snapshot(),changed:false,sculptIndex:-1};
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
    sculptSelectionUI();updateSculptMarkers();
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
  active.x=event.clientX;active.y=event.clientY;
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
  active=null;sculptSelectionUI();updateSculptMarkers();
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
  $("fiberEnabled").value=engine.fiberEnabled?"on":"off";
  $("turbulence").value=field.turbulence;
  $("turbulenceText").textContent=field.turbulence.toFixed(1);
  $("engineBadge").textContent=engineMode+" transport";
  sculptSelectionUI();updateSculptMarkers();
  status(engineMode+" immersive volume ready · pinch to zoom, tap Controls for settings");
  requestAnimationFrame(frame);
}catch(err){status("Cannot start volume: "+err.message);console.error(err);}
