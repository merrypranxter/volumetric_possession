// Phase 01S — Gesture Afterlife.
// Sparse, distance-based 3D gesture deposits into the existing RGB density.
// The three RGB weights here are *palette dye channels*, not display RGB.
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const TAU=Math.PI*2;
export const AFTERLIFE_STYLES=["prism","staccato","aurora","ghost"];
export const AFTERLIFE_TARGETS=["off","stir","all"];
export function normalizeAfterlifeSettings(input={}){
  return {
    target:AFTERLIFE_TARGETS.includes(input.target)?input.target:"stir",
    style:AFTERLIFE_STYLES.includes(input.style)?input.style:"prism",
    strength:clamp(Number.isFinite(Number(input.strength))?Number(input.strength):1,0,2),
    width:clamp(Number.isFinite(Number(input.width))?Number(input.width):.115,.055,.28)
  };
}
export function afterlifeEnabled(target,mode){
  return target!=="off"&&(mode==="stir"||(target==="all"&&(mode==="curve"||mode==="sculpt")));
}
export function afterlifeColor(style,travel,strength=1){
  if(!AFTERLIFE_STYLES.includes(style)||!Number.isFinite(travel)||
     !Number.isFinite(strength))throw Error("Invalid gesture afterlife ink");
  const amount=clamp(strength,0,2)*.24;
  const phase=travel*12.0;
  if(style==="staccato"){
    const channel=((Math.floor(Math.max(0,phase)/1.7)%3)+3)%3;
    return [0,1,2].map(i=>i===channel?amount:amount*.035);
  }
  if(style==="ghost"){
    const weights=[0,1,2].map(i=>.35+.65*(.5+.5*Math.sin(phase*.55+i*TAU/3)));
    return weights.map(v=>amount*.38*v);
  }
  if(style==="aurora"){
    const peaks=[0,1,2].map(i=>.45+.55*(.5+.5*Math.sin(phase*.35+i*TAU/3)));
    return peaks.map(v=>amount*.85*v);
  }
  const weights=[0,1,2].map(i=>Math.pow(.5+.5*Math.cos(phase+i*TAU/3),2));
  return weights.map(v=>amount*(.08+.92*v));
}
// Path state is independent of pointer event frequency; trail "travel" counts
// physical length in normalized volume coordinates, not elapsed animation frames.
// Oversized/jumped events are capped to 12 deposits to protect Safari GPU queues.
export function sampleAfterlifeSegment(state,from,to,spacing,maxDabs=12){
  if(!state||!Array.isArray(from)||!Array.isArray(to)||from.length!==3||
     to.length!==3||![...from,...to].every(Number.isFinite)||
     !Number.isFinite(spacing)||spacing<=0||
     !Number.isInteger(maxDabs)||maxDabs<1||maxDabs>16)
    throw Error("Invalid afterlife stroke segment");
  const span=distance(from,to);
  if(span<=1e-9)return [];
  const step=clamp(spacing,.025,.3);
  const carry=clamp(Number(state.carry)||0,0,step);
  const prior=Number(state.travel)||0;
  const first=step-carry;
  const count=span+1e-9<first?0:1+Math.floor((span-first+1e-9)/step);
  const sampleCount=Math.min(count,maxDabs);
  const deposits=[];
  for(let i=0;i<sampleCount;i++){
    const originalOrdinal=count<=maxDabs?i:
      Math.floor((i+.5)*count/maxDabs);
    const along=Math.min(span,first+originalOrdinal*step);
    const u=along/span;
    deposits.push({point:from.map((v,k)=>v+(to[k]-v)*u),travel:prior+along});
  }
  state.carry=(carry+span)%step;
  state.travel=prior+span;
  return deposits;
}
