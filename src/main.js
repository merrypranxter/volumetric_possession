import {PigmentField} from "./field.js";
import {VolumeRenderer,pointFromScreen} from "./render.js";
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
let renderer,paused=false,mode="stir",active=null,lastFrame=0,lastDraw=0,accumulator=0;
const camera={azimuth:.62,elevation:.23,distance:3.25};
const options={speed:1,force:1,brush:.22,depth:0,gain:4.5,glow:1.2,steps:56,background:[0.009,.006,.023]};
const undo=[],redo=[];
const status=text=>$("status").textContent=text;
function updateHistory(){$("undo").disabled=undo.length===0;$("redo").disabled=redo.length===0;}
function snapshotCommand(before){undo.push({before,after:field.snapshot()});if(undo.length>9)undo.shift();redo.length=0;updateHistory();}
function restore(s){field.restore(s);if(renderer)renderer.upload();}
function undoStroke(){if(!undo.length)return;const cmd=undo.pop();redo.push(cmd);restore(cmd.before);updateHistory();}
function redoStroke(){if(!redo.length)return;const cmd=redo.pop();undo.push(cmd);restore(cmd.after);updateHistory();}
function params(){const p=palettes[paletteSelect.value]||palettes["Prismatic Riot"];return p.map(rgb);}
function draw(){
  if(!renderer)return;const bg=[options.background,[.012,.018,.065],[.042,.008,.05]][Number($("background").value)];
  renderer.draw(camera,params(),{gain:options.gain,glow:options.glow,steps:options.steps,background:bg});
}
function setMode(next){mode=next;for(const b of document.querySelectorAll(".mode"))b.setAttribute("aria-pressed",String(b.dataset.mode===mode));$("modeLabel").textContent={stir:"STIR · drag to disturb pigment",inject:"INJECT · paint into the volume",orbit:"ORBIT · drag to rotate camera"}[mode];}
for(const b of document.querySelectorAll(".mode"))b.addEventListener("click",()=>setMode(b.dataset.mode));
for(const b of document.querySelectorAll(".tab"))b.addEventListener("click",()=>{
  for(const t of document.querySelectorAll(".tab"))t.setAttribute("aria-pressed",String(t===b));
  for(const p of document.querySelectorAll(".panel"))p.classList.toggle("open",p.id===b.dataset.panel);
});
for(const id of ["speed","force","brush","depth","density","glow"]){
  $(id).addEventListener("input",()=>{const val=Number($(id).value);const key=id==="density"?"gain":id;options[key]=val;$(id+"Text").textContent=val.toFixed(id==="brush"||id==="depth"?2:1);});
}
$("quality").addEventListener("change",()=>options.steps=({low:40,mid:56,high:76})[$("quality").value]);
$("background").addEventListener("change",draw);paletteSelect.addEventListener("change",draw);
$("pause").addEventListener("click",()=>{paused=!paused;$("pause").textContent=paused?"▶ Play":"Ⅱ Pause";status(paused?"Simulation paused":"Simulation resumed");});
$("undo").addEventListener("click",undoStroke);$("redo").addEventListener("click",redoStroke);
$("restart").addEventListener("click",()=>{if(!confirm("Restart this seed? Current pigment and touch changes will be replaced."))return;field.reset(field.seed);undo.length=0;redo.length=0;updateHistory();status("Restarted seed "+field.seed);});
$("new").addEventListener("click",()=>{if(!confirm("Create a new design? This replaces the current volume."))return;const seed=(field.seed+1+Math.floor(Math.random()*100000))>>>0;field.reset(seed);undo.length=0;redo.length=0;updateHistory();status("New design · seed "+seed);});
$("png").addEventListener("click",()=>{try{draw();const a=document.createElement("a");a.download="volumetric-possession-"+field.seed+".png";a.href=canvas.toDataURL("image/png");a.click();status("Current camera view exported as PNG");}catch(err){status("PNG failed: "+err.message);}});
document.addEventListener("keydown",event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="z"){event.preventDefault();if(event.shiftKey)redoStroke();else undoStroke();}});
canvas.addEventListener("pointerdown",event=>{
  if(active)return;if(event.button!==0&&event.pointerType==="mouse")return;
  event.preventDefault();try{canvas.setPointerCapture(event.pointerId);}catch{}
  active={id:event.pointerId,x:event.clientX,y:event.clientY,mode,before:mode==="orbit"?null:field.snapshot(),changed:false};
  if(mode==="inject"){
    const p=pointFromScreen(canvas,camera,event,options.depth).point;
    field.stamp(p,options.brush,Number($("pigment").value),.46);active.changed=true;
  }
});
canvas.addEventListener("pointermove",event=>{
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
    if(currentMode==="inject")field.stamp(sample.point,options.brush,Number($("pigment").value),.26);
    if(currentMode==="stir"){
      const velocity=sample.right.map((v,i)=>(v*dx-sample.up[i]*dy)*options.force*17);
      field.push(sample.point,velocity,options.brush);
    }
    active.changed=true;
  }
});
function completePointer(event,cancelled){
  if(!active||active.id!==event.pointerId)return;
  if(active.before){
    if(cancelled){restore(active.before);status("Touch cancelled; pigment checkpoint restored");}
    else if(active.changed){snapshotCommand(active.before);}
  }
  active=null;
}
canvas.addEventListener("pointerup",e=>completePointer(e,false));
canvas.addEventListener("pointercancel",e=>completePointer(e,true));
canvas.addEventListener("lostpointercapture",e=>completePointer(e,true));
window.addEventListener("blur",()=>{if(active){if(active.before)restore(active.before);active=null;}});
document.addEventListener("visibilitychange",()=>{lastFrame=0;accumulator=0;});
canvas.addEventListener("webglcontextlost",e=>{e.preventDefault();paused=true;status("GPU context lost. Reload to restore the volume.");});
function frame(timestamp){
  try{
    if(!lastFrame)lastFrame=timestamp;
    const elapsed=Math.min((timestamp-lastFrame)/1000,.1);lastFrame=timestamp;
    if(!paused){
      accumulator+=elapsed;
      let n=0;while(accumulator>=1/18&&n<3){field.step(1/18,options.speed);accumulator-=1/18;n++;}
      if(n===3)accumulator=0;
    }
    if(timestamp-lastDraw>38){draw();lastDraw=timestamp;}
  }catch(err){paused=true;status("Render halted: "+err.message);console.error(err);}
  requestAnimationFrame(frame);
}
try{
  renderer=new VolumeRenderer(canvas,field);
  paletteSelect.value="Prismatic Riot";
  status("3D pigment ready · seed "+field.seed+" · drag to stir");
  requestAnimationFrame(frame);
}catch(err){status("Cannot start volume: "+err.message);console.error(err);}
