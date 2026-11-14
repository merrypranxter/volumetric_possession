// Phase 01L — Living Braid: non-destructive time-dependent 3D velocity geometry.
// Evaluated ONCE per simulation step, never for every voxel. Base points remain
// editable, checkpointable and exactly unchanged until "Bake living shape".
import {newFlowCurve,resampleStroke,MAX_CURVES,MAX_CURVE_POINTS} from "./flow-curve.js";
export const LIVING_MODES=["still","writhe","grow","unravel","reconnect"];
const TAU=Math.PI*2;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const vecSub=(a,b)=>a.map((v,i)=>v-b[i]);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const norm=a=>{const size=Math.hypot(...a);return size>1e-8?a.map(v=>v/size):[1,0,0];};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const mix=(a,b,q)=>a.map((v,i)=>clamp(v+(b[i]-v)*q,-.93,.93));
function curveAs(type,points,src){return newFlowCurve(type,points,src.r,src.strength);}
function arcParameters(points){
 const cum=[0];let total=0;
 for(let i=1;i<points.length;i++){total+=Math.hypot(...vecSub(points[i],points[i-1]));cum.push(total);}
 return {length:total,s:cum.map(v=>total>1e-8?v/total:0)};
}
function frameAt(points,index){
 const tangent=norm(vecSub(points[Math.min(points.length-1,index+1)],
    points[Math.max(0,index-1)]));
 const reference=Math.abs(tangent[2])<.87?[0,0,1]:[0,1,0];
 const n=norm(cross(tangent,reference)),b=norm(cross(tangent,n));
 return {n,b};
}
function growCurve(curve,progress){
 const points=curve.points;
 const {length,s}=arcParameters(points);
 if(length<1e-7)return curveAs(curve.type,points,curve);
 const target=length*progress;
 const out=[points[0].slice()];
 let remaining=target;
 for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i],dist=Math.hypot(...vecSub(b,a));
   if(dist<1e-8)continue;
   if(remaining>=dist){out.push(b.slice());remaining-=dist;}
   else {out.push(mix(a,b,remaining/dist));break;}
 }
 if(out.length<2)out.push(points[0].slice());
 // Don't create more than eight segments or change the curve's identity.
 return curveAs(curve.type,out.length>MAX_CURVE_POINTS?
   resampleStroke(out,MAX_CURVE_POINTS):out,curve);
}
export function evaluateLivingCurves(curves,time,mode="still",rate=.65,amount=.18){
 if(!Array.isArray(curves)||curves.length===0)return [];
 if(mode==="still"||amount<=0||rate<=0)return curves;
 if(!LIVING_MODES.includes(mode))throw Error("Unknown living-curve mode "+mode);
 const t=Math.max(0,Number.isFinite(time)?time:0);
 const omega=t*TAU*clamp(rate,.05,2)/8;
 const power=clamp(amount,0,.3);
 const active=curves.slice(0,MAX_CURVES);
 // Paired modes do not silently degrade into an unrelated effect on one path.
 if((mode==="unravel"||mode==="reconnect")&&active.length!==2)return active;
 if(mode==="grow"){
   // Reversible growing/retracting tip. Root remains anchored.
   const phase=.5-.5*Math.cos(omega);
   const progress=(.08+.25*(1-power/.3))+(1-(.08+.25*(1-power/.3)))*phase;
   return active.map(curve=>growCurve(curve,progress));
 }
 if(mode==="unravel"&&active.length===2){
   const a=active[0],b=active[1],n=Math.min(a.points.length,b.points.length);
   if(n>=2){
     // Paired paths approach a common spine and re-open, with moving twist.
     // Derives from the CURRENT edited paths: editing a base handle still works.
     const contraction=clamp((.5-.5*Math.cos(omega))*power/.3,0,.97);
     return [a,b].map((src,side)=>curveAs(src.type,src.points.map((p,i)=>{
       if(i>=n)return p.slice();
       const other=active[1-side].points[i],center=p.map((v,k)=>(v+other[k])*.5);
       const tangent=norm(vecSub(src.points[Math.min(i+1,n-1)],src.points[Math.max(i-1,0)]));
       const diff=vecSub(p,center),parallel=dot(diff,tangent);
       const perp=diff.map((v,k)=>v-parallel*tangent[k]);
       const binormal=cross(tangent,perp),twist=.38*Math.sin(omega)*power/.3;
       const rotated=perp.map((v,k)=>v*Math.cos(twist)+binormal[k]*Math.sin(twist));
       return center.map((v,k)=>clamp(v+parallel*tangent[k]+
          (1-contraction)*rotated[k],-.93,.93));
     }),src));
   }
 }
 if(mode==="reconnect"&&active.length===2){
   const a=active[0],b=active[1];
   const q=.5-.5*Math.cos(omega);
   return [a,b].map((src,side)=>{
     const mate=active[1-side];
     const {s}=arcParameters(src.points);
     const pts=src.points.map((p,i)=>{
       const u=i/(src.points.length-1);
       const j=Math.round(u*(mate.points.length-1));
       const fraction=s[i];
       const tail=clamp((fraction-.33)/.57,0,1);
       const smooth=tail*tail*(3-2*tail);
       const w=q*smooth*clamp(power/.18,0,1);
       return mix(p,mate.points[j],w);
     });
     return curveAs(src.type,pts,src);
   });
 }
 // General 3D moving deformation. Bounded zero-motion at endpoints.
 return active.map((curve,index)=>{
   const {s}=arcParameters(curve.points);
   return curveAs(curve.type,curve.points.map((point,i)=>{
     const {n,b}=frameAt(curve.points,i);
     const envelope=Math.sin(Math.PI*s[i]);
     const phase=omega-TAU*1.4*s[i]+index*1.9;
     const displacement=power*envelope;
     return point.map((v,k)=>clamp(v+displacement*(n[k]*Math.cos(phase)+b[k]*Math.sin(phase)),-.93,.93));
   }),curve);
 });
}
