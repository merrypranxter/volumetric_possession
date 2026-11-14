// Topology Gremlin: edit the actual 3D velocity-curve DNA, not the raster overlay.
import {MAX_CURVE_POINTS,newFlowCurve,resampleStroke} from "./flow-curve.js";
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const normalize=(p)=>{const n=Math.hypot(...p);return n>1e-8?p.map(x=>x/n):[1,0,0];};
export function splitFlowCurve(curve,index){
  if(!Number.isInteger(index)||index<=0||index>=curve.points.length-1)
    throw Error("Split requires an interior control point");
  const left=newFlowCurve(curve.type,curve.points.slice(0,index+1),curve.r,curve.strength);
  const right=newFlowCurve(curve.type,curve.points.slice(index),curve.r,curve.strength);
  return [left,right];
}
export function braidFlowCurve(curve,turns=2.5,spread=.13){
  if(!Number.isFinite(turns)||turns<.25||turns>5)throw Error("Braid turns outside 0.25–5");
  if(!Number.isFinite(spread)||spread<.03||spread>.35)throw Error("Braid spacing outside 0.03–0.35");
  // Resample to use all eight available control points without expanding
  // the shader's 2x7 segment budget.
  const center=resampleStroke(curve.points,MAX_CURVE_POINTS);
  if(center.length<2)throw Error("Braid path is too short");
  const lengths=[0];let total=0;
  for(let i=1;i<center.length;i++){total+=Math.hypot(...sub(center[i],center[i-1]));lengths.push(total);}
  if(total<.075)throw Error("Braid needs a nondegenerate spine");
  const strands=[[],[]];
  let normal=null;
  for(let i=0;i<center.length;i++){
    const before=center[Math.max(0,i-1)],after=center[Math.min(center.length-1,i+1)];
    const tangent=normalize(sub(after,before));
    if(!normal){
      const reference=Math.abs(tangent[2])<.88?[0,0,1]:[0,1,0];
      normal=normalize(cross(tangent,reference));
    }else{
      // Discrete parallel-transport frame: project the previous normal onto
      // the tangent plane. Avoid Frenet-frame flips at inflection points.
      const projection=dot(normal,tangent);
      const carried=normal.map((v,k)=>v-projection*tangent[k]);
      normal=Math.hypot(...carried)>1e-6?normalize(carried):
        normalize(cross(tangent,Math.abs(tangent[2])<.88?[0,0,1]:[0,1,0]));
    }
    const secondary=normalize(cross(tangent,normal));
    const fraction=lengths[i]/total,angle=2*Math.PI*turns*fraction;
    const s=spread*(.85+.15*Math.sin(Math.PI*fraction));
    const offset=normal.map((v,k)=>s*(v*Math.cos(angle)+secondary[k]*Math.sin(angle)));
    for(let side=0;side<2;side++)strands[side].push(center[i].map((v,k)=>
      clamp(v+(side===0?1:-1)*offset[k],-.93,.93)));
  }
  // Sharing total source strength avoids instantly doubling the force.
  return strands.map(points=>newFlowCurve(curve.type,points,curve.r,curve.strength*.5));
}
