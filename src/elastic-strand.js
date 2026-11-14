// Phase 01R — Gesture Witch / Elastic Strand Puppet.
// A viewport grab bends a bounded real 3D force curve, not just its overlay.
// The original DNA stays untouched until the parent pointer transaction commits.
import {newFlowCurve,resampleStroke,MAX_CURVE_POINTS} from "./flow-curve.js";
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const length=(a,b)=>Math.hypot(...a.map((v,k)=>v-b[k]));
export function closestScreenCurve(curves,project,x,y,tolerance=25){
  if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(tolerance)||tolerance<=0)
    throw Error("Invalid screen-space grab");
  let best=null,bestD2=tolerance*tolerance;
  for(const [index,curve] of curves.entries()){
    const pts=curve.points,screen=pts.map(project);
    const lengths=[];let total=0;
    for(let i=1;i<pts.length;i++){const l=length(pts[i],pts[i-1]);lengths.push(l);total+=l;}
    let passed=0;
    for(let i=1;i<pts.length;i++){
      const a=screen[i-1],b=screen[i],segLen=lengths[i-1];
      if(a&&b&&a.visible!==false&&b.visible!==false){
        const vx=b.x-a.x,vy=b.y-a.y,ll=vx*vx+vy*vy;
        const u=ll>1e-9?clamp(((x-a.x)*vx+(y-a.y)*vy)/ll,0,1):0;
        const d2=(x-a.x-u*vx)**2+(y-a.y-u*vy)**2;
        if(d2<bestD2){
          bestD2=d2;
          best={index,contact:total>1e-9?(passed+u*segLen)/total:0,
            world:pts[i-1].map((v,k)=>v+(pts[i][k]-v)*u),
            distance:Math.sqrt(d2)};
        }
      }
      passed+=segLen;
    }
  }
  return best;
}
export function bendForceCurve(curve,contact,delta,reach=.22,tension=1){
  if(!curve||!Array.isArray(curve.points)||curve.points.length<2)throw Error("Missing force strand");
  if(!Number.isFinite(contact)||contact<0||contact>1||
     !Array.isArray(delta)||delta.length!==3||!delta.every(Number.isFinite)||
     !Number.isFinite(reach)||!Number.isFinite(tension))throw Error("Invalid elastic gesture");
  const r=clamp(reach,.07,.75),power=clamp(tension,.2,2.5);
  // Two-point genetic strands need subdivision so a local bend can exist.
  const expanded=curve.points.length<4?resampleStroke(curve.points,MAX_CURVE_POINTS):curve.points.map(p=>p.slice());
  if(expanded.length<2)return newFlowCurve(curve.type,curve.points,curve.r,curve.strength);
  let total=0;const distanceAlong=[0];
  for(let i=1;i<expanded.length;i++){total+=length(expanded[i],expanded[i-1]);distanceAlong.push(total);}
  if(total<1e-9)return newFlowCurve(curve.type,curve.points,curve.r,curve.strength);
  const points=expanded.map((p,i)=>{
    const t=distanceAlong[i]/total,weight=Math.exp(-.5*((t-contact)/r)**2)*power;
    return p.map((v,k)=>clamp(v+delta[k]*weight,-.93,.93));
  });
  return newFlowCurve(curve.type,points,curve.r,curve.strength);
}
