// Phase 01T — Phantom Echoes.
// Deterministic delayed, independently moving pigment emitters in the existing 3D dye volume.
// Bounded to a dozen active offspring and at most six stamps per fixed 15 Hz simulation step.
// An echo is not a second simulation or rendered decorative sprite.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const finite3=a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite);
const normalize=v=>{const n=Math.hypot(...v);return n>1e-8?v.map(x=>x/n):[1,0,0];};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const MODES=["off","spiral","fork","orbit"];
export const ECHO_CAP=12;
export const ECHO_STAMPS_PER_STEP=6;
export function echoSettings(raw={}){
  return {mode:MODES.includes(raw.mode)?raw.mode:"spiral",
    copies:raw.copies===3?3:2,
    delay:clamp(Number.isFinite(Number(raw.delay))?Number(raw.delay):.35,.1,1.5),
    drift:clamp(Number.isFinite(Number(raw.drift))?Number(raw.drift):.9,.1,2),
    duration:clamp(Number.isFinite(Number(raw.duration))?Number(raw.duration):1.25,.35,2.5),
    strength:clamp(Number.isFinite(Number(raw.strength))?Number(raw.strength):.85,0,1.5)};
}
export function cloneEchoes(queue){
  if(!Array.isArray(queue))return [];
  return queue.slice(0,ECHO_CAP).filter(e=>e&&finite3(e.origin)&&finite3(e.direction)&&
    finite3(e.color)&&[e.born,e.delay,e.duration,e.drift,e.width,e.strength,e.phase,e.lane].every(Number.isFinite)&&
    (e.mode==="spiral"||e.mode==="fork"||e.mode==="orbit"))
    .map(e=>({origin:e.origin.slice(),direction:e.direction.slice(),color:e.color.map(v=>clamp(v,0,1)),
      born:e.born,delay:clamp(e.delay,.1,2),duration:clamp(e.duration,.35,2.5),
      drift:clamp(e.drift,.1,2),width:clamp(e.width,.035,.28),strength:clamp(e.strength,0,1.5),
      phase:e.phase,lane:e.lane,mode:e.mode}));
}
export function queuePhantomEcho(queue,origin,direction,color,born,config,width,phase=0){
  const cfg=echoSettings(config);
  if(cfg.mode==="off"||cfg.strength===0)return 0;
  if(!Array.isArray(queue)||!finite3(origin)||!finite3(direction)||!finite3(color)||
     !Number.isFinite(born)||!Number.isFinite(phase)||!Number.isFinite(width))
    throw Error("Invalid phantom echo birth");
  const dir=normalize(direction),n=Math.min(cfg.copies,ECHO_CAP-queue.length);
  for(let lane=0;lane<n;lane++){
    const tint=color.map((v,k)=>clamp(v*(.52+.48*(.5+.5*Math.cos(phase*2.4+k*2.094+lane*1.1))),0,1));
    queue.push({origin:origin.map(v=>clamp(v,-.93,.93)),direction:dir.slice(),color:tint,
      born,delay:cfg.delay+lane*.16,duration:cfg.duration,drift:cfg.drift,
      width:clamp(width*.83,.035,.28),strength:cfg.strength,phase,lane,mode:cfg.mode});
  }
  return n;
}
export function echoPosition(e,time){
  const age=clamp(time-e.born-e.delay,0,e.duration),v=normalize(e.direction);
  const up=Math.abs(v[2])<.83?[0,0,1]:[0,1,0],side=normalize(cross(v,up)),other=normalize(cross(side,v));
  const a=e.phase+age*(5.4+e.lane*1.27),sign=e.lane%2===0?1:-1;
  let straight=e.drift*.21*age,sideDrift=0,otherDrift=0;
  if(e.mode==="spiral"){
    const radius=.025+.11*age;sideDrift=radius*Math.sin(a)*sign;
    otherDrift=radius*Math.cos(a)*sign;
  }else if(e.mode==="fork"){
    sideDrift=sign*.22*age*e.drift;
    otherDrift=.035*Math.sin(a);
  }else{
    straight*=.55;
    const radius=.10+age*.04;sideDrift=radius*(Math.sin(a)-Math.sin(e.phase));
    otherDrift=radius*(Math.cos(a)-Math.cos(e.phase));
  }
  return e.origin.map((value,k)=>clamp(value+v[k]*straight+
    side[k]*sideDrift+other[k]*otherDrift,-.93,.93));
}
// Pure phase advance. The engine stamps the returned positions into existing RGB,
// then advances its usual dye and fiber volume normally. A rotating priority prevents
// early-born branches from monopolizing mobile GPU stamp uniforms.
export function advancePhantomEchoes(queue,time,budget=ECHO_STAMPS_PER_STEP){
  if(!Number.isFinite(time)||!Number.isInteger(budget)||budget<0||budget>16)
    throw Error("Invalid echo simulation step");
  const alive=cloneEchoes(queue).filter(e=>time<e.born+e.delay+e.duration);
  const eligible=alive.filter(e=>time>=e.born+e.delay);
  const stamps=[];
  const take=Math.min(budget,eligible.length);
  const offset=eligible.length?Math.floor(Math.max(0,time)*15)%eligible.length:0;
  for(let i=0;i<take;i++){
    const e=eligible[(offset+i)%eligible.length],age=Math.max(0,time-e.born-e.delay);
    const fade=Math.pow(Math.max(0,1-age/e.duration),.75);
    stamps.push({p:echoPosition(e,time),r:e.width,
      color:e.color.map(v=>clamp(v*(.18*e.strength)*fade,0,1))});
  }
  return {queue:alive,stamps};
}
