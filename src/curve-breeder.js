// Phase 01M — Gene Thief: real, reproducible crossbreeding for living
// curve-based velocity systems, without copying or erasing pigment textures.
import {MAX_CURVES,MAX_CURVE_POINTS,newFlowCurve,cloneFlowCurves,resampleStroke} from "./flow-curve.js";
import {LIVING_MODES} from "./living-braid.js";
export const BREEDER_SLOTS=3;
export const DEFAULT_BREED_SEED=314159;
const TAU=2*Math.PI;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const hash32=v=>{v=(v^v>>>16)>>>0;v=Math.imul(v,0x7feb352d);v=(v^v>>>15)>>>0;v=Math.imul(v,0x846ca68b);return (v^v>>>16)>>>0;};
function random(seed){let state=hash32(seed>>>0);return ()=>{state=(state+0x6D2B79F5)>>>0;let v=state;v=Math.imul(v^(v>>>15),1|v);v^=v+Math.imul(v^(v>>>7),61|v);return ((v^(v>>>14))>>>0)/4294967296;};}
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const validCurve=c=>c&&Array.isArray(c.points)&&c.points.length>=2;
const validateParent=p=>p&&Array.isArray(p.curves)&&p.curves.length>=1&&p.curves.length<=MAX_CURVES&&
  p.curves.every(validCurve);
export function captureCurveGenome(system){
  if(!system||!validateParent({curves:system.flowCurves}))throw Error("Draw at least one flow curve before capturing a parent");
  return {
    curves:cloneFlowCurves(system.flowCurves),
    livingMode:LIVING_MODES.includes(system.livingMode)?system.livingMode:"still",
    livingRate:clamp(Number(system.livingRate)||.65,.05,2),
    livingAmount:clamp(Number.isFinite(Number(system.livingAmount))?Number(system.livingAmount):.18,0,.3)
  };
}
export function cloneCurveGenome(p){
  if(p===null||p===undefined)return null;
  if(!validateParent(p))throw Error("Invalid captured parent genome");
  return captureCurveGenome({
    flowCurves:p.curves,livingMode:p.livingMode,livingRate:p.livingRate,livingAmount:p.livingAmount
  });
}
export function cloneBreederParents(parents){
  return Array.from({length:BREEDER_SLOTS},(_,i)=>cloneCurveGenome(parents?.[i]??null));
}
function randomIndex(weights,rng){
  const total=weights.reduce((sum,w)=>sum+w,0);
  let pick=rng()*total;
  for(let i=0;i<weights.length;i++){pick-=weights[i];if(pick<=0)return i;}
  return weights.length-1;
}
function sampled(curve){
  const points=resampleStroke(curve.points,MAX_CURVE_POINTS);
  // Degenerate drawn strands remain bounded; no invalid shader geometry.
  if(points.length===MAX_CURVE_POINTS)return points;
  const a=curve.points[0],b=curve.points.at(-1);
  return Array.from({length:MAX_CURVE_POINTS},(_,i)=>a.map((v,k)=>v+(b[k]-v)*i/(MAX_CURVE_POINTS-1)));
}
function chord(points){return points.at(-1).map((v,k)=>v-points[0][k]);}
function dot(a,b){return a.reduce((sum,v,k)=>sum+v*b[k],0);}
export function breedCurveGenomes(parents,seed=DEFAULT_BREED_SEED,mutation=.2,dominance="balanced"){
  const valid=(parents||[]).map((p,i)=>({p,i})).filter(item=>item.p&&validateParent(item.p));
  if(valid.length<2)throw Error("Capture at least two parents, or load the starter nursery");
  if(!Number.isInteger(Number(seed))||Number(seed)<0||Number(seed)>0xffffffff)throw Error("Breeding seed must be a 32-bit unsigned integer");
  const rng=random(Number(seed)>>>0),rate=clamp(Number(mutation)||0,0,.5);
  const main=valid.findIndex(({i})=>String(i)===String(dominance));
  const weights=valid.map((_,i)=>main<0?1:main===i?4:1);
  const select=()=>valid[randomIndex(weights,rng)].p;
  // Inherit curve-system topology as a discrete trait: 1 or 2 slots,
  // not a shader-breaking unbounded number of parents.
  const model=select(),count=model.curves.length;
  const child=[];
  for(let slot=0;slot<count;slot++){
    const donors=valid.filter(({p})=>p.curves[slot]),localWeights=donors.map(({i})=>main<0?1:valid[main].i===i?4:1);
    // Pick an explicit geometry lineage; use weighted crossover and a
    // smooth correlated mutation field so children are not random noise.
    const lead=donors[randomIndex(localWeights,rng)],base=sampled(lead.p.curves[slot]);
    const influence=donors.map(d=>d.i===lead.i?(.58+.18*rng()):(.10+.12*rng()));
    const weightSum=influence.reduce((a,b)=>a+b,0);
    const sampledDonors=donors.map(({p})=>{
      const pts=sampled(p.curves[slot]);
      return dot(chord(pts),chord(base))<0?pts.slice().reverse():pts;
    });
    const frequency=1+Math.floor(rng()*3),phase=rng()*TAU;
    const angle=rng()*TAU,secondary=rng()*TAU;
    const points=Array.from({length:MAX_CURVE_POINTS},(_,j)=>{
      const t=j/(MAX_CURVE_POINTS-1);
      return [0,1,2].map(k=>{
        const combined=sampledDonors.reduce((sum,pts,i)=>sum+influence[i]*pts[j][k],0)/weightSum;
        // Continuous field, largely interior, preserves recognizable parents.
        const taper=.25+.75*Math.sin(Math.PI*t);
        const wiggle=(Math.sin(TAU*frequency*t+phase+angle*k)+
                      .42*Math.cos(TAU*(frequency+1)*t+secondary-k*.7))/1.42;
        return clamp(combined+rate*.24*taper*wiggle,-.93,.93);
      });
    });
    const force=select().curves[slot]?.type||lead.p.curves[slot].type;
    const r=clamp(donors.reduce((sum,{p},i)=>sum+influence[i]*p.curves[slot].r,0)/weightSum+
      (rng()-.5)*rate*.13,.12,.65);
    const strength=clamp(donors.reduce((sum,{p},i)=>sum+influence[i]*p.curves[slot].strength,0)/weightSum+
      (rng()-.5)*rate*.6,.05,2.4);
    child.push(newFlowCurve(force,points,r,strength));
  }
  // Inherit dynamic behavior independently of geometric shape and local force.
  const motion=select();
  let livingMode=motion.livingMode;
  if(count===1&&(livingMode==="unravel"||livingMode==="reconnect"))livingMode="writhe";
  if(rate>.01&&rng()<rate*.35){
    const applicable=count===1?["still","writhe","grow"]:LIVING_MODES;
    livingMode=applicable[Math.floor(rng()*applicable.length)];
  }
  const livingRate=clamp(valid.reduce((sum,{p},i)=>sum+weights[i]*p.livingRate,0)/
    weights.reduce((a,b)=>a+b,0)+(rng()-.5)*rate*.55,.05,2);
  const livingAmount=clamp(valid.reduce((sum,{p},i)=>sum+weights[i]*p.livingAmount,0)/
    weights.reduce((a,b)=>a+b,0)+(rng()-.5)*rate*.13,0,.3);
  return {curves:child,livingMode,livingRate,livingAmount,seed:Number(seed)>>>0,
    lineage:valid.map(v=>v.i)};
}
export function nurseryStarters(){
  const curve=(type,fn,r,strength)=>newFlowCurve(type,
    Array.from({length:MAX_CURVE_POINTS},(_,i)=>fn(i/(MAX_CURVE_POINTS-1))),r,strength);
  const mother=curve("stream",t=>[-.72+1.44*t,.34*Math.sin(t*TAU*1.3),.22*Math.cos(t*TAU*.7)],.25,1.3);
  const father=curve("coil",t=>[-.68+1.36*t,.25*Math.cos(t*TAU*2.5),.25*Math.sin(t*TAU*2.5)],.28,1.7);
  const second=curve("coil",t=>[-.68+1.36*t,-.25*Math.cos(t*TAU*2.5),-.25*Math.sin(t*TAU*2.5)],.28,1.1);
  const rogue=curve("gather",t=>[-.55+1.1*t,.52*(t-.5),.38*Math.sin(t*TAU*1.7)],.32,1.5);
  const rogue2=curve("stream",t=>[.57-1.14*t,-.4*Math.sin(t*TAU),.30*Math.cos(t*TAU*.9)],.23,1.2);
  return [
    {curves:[mother],livingMode:"writhe",livingRate:.72,livingAmount:.22},
    {curves:[father,second],livingMode:"unravel",livingRate:1.12,livingAmount:.26},
    {curves:[rogue,rogue2],livingMode:"reconnect",livingRate:.91,livingAmount:.20}
  ];
}
