// Gesture Witch: a two-finger transaction edits actual 3D curve geometry
// and force influence width. No screen-space-only deformation.
import {newFlowCurve} from "./flow-curve.js";
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function twistForceCurve(curve,cameraAxis,rotation=0,pinch=1){
  if(!curve||!Array.isArray(curve.points)||curve.points.length<2)throw Error("Select a real force curve");
  if(!Array.isArray(cameraAxis)||cameraAxis.length!==3||!cameraAxis.every(Number.isFinite))
    throw Error("Invalid camera axis");
  const length=Math.hypot(...cameraAxis);
  if(length<1e-7)throw Error("Camera axis must be nonzero");
  if(!Number.isFinite(rotation)||!Number.isFinite(pinch)||pinch<=0)
    throw Error("Invalid gesture transform");
  const axis=cameraAxis.map(v=>v/length);
  const center=[0,1,2].map(k=>curve.points.reduce((sum,p)=>sum+p[k],0)/curve.points.length);
  const theta=clamp(rotation,-2.6,2.6);
  const points=curve.points.map((p,i)=>{
    const t=i/(curve.points.length-1);
    // Opposite turns at the two ends, neutral at the midpoint: actual twist.
    const local=theta*(t-.5)*1.65,cs=Math.cos(local),sn=Math.sin(local);
    const q=p.map((v,k)=>v-center[k]),axial=q.reduce((sum,v,k)=>sum+v*axis[k],0);
    const cross=[axis[1]*q[2]-axis[2]*q[1],
      axis[2]*q[0]-axis[0]*q[2],axis[0]*q[1]-axis[1]*q[0]];
    return q.map((v,k)=>clamp(center[k]+v*cs+cross[k]*sn+
      axis[k]*axial*(1-cs),-.93,.93));
  });
  return newFlowCurve(curve.type,points,clamp(curve.r*clamp(pinch,.5,3),.12,.65),curve.strength);
}
export function twoFingerTransform(points){
  if(!Array.isArray(points)||points.length!==2)throw Error("Two pointers required");
  const [a,b]=points;if(![a.x,a.y,b.x,b.y].every(Number.isFinite))
    throw Error("Invalid pointer coordinates");
  return {span:Math.max(1,Math.hypot(b.x-a.x,b.y-a.y)),
    angle:Math.atan2(b.y-a.y,b.x-a.x),
    center:{x:(a.x+b.x)*.5,y:(a.y+b.y)*.5}};
}
export function wrappedTurn(current,origin){
  return Math.atan2(Math.sin(current-origin),Math.cos(current-origin));
}
