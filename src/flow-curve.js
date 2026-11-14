// Curve Witch: bounded 3D polylines as persistent material velocity fields.
// CPU math and WebGL2 shader use nearest-segment influence per curve.
export const MAX_CURVES=2,MAX_CURVE_POINTS=8;
export const CURVE_TYPES=["stream","coil","gather"];
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
export function resampleStroke(points,count=MAX_CURVE_POINTS){
  if(!Array.isArray(points)||points.length<2)return [];
  const cleaned=[points[0].slice()];
  for(let i=1;i<points.length;i++){
    if(!points[i].every(Number.isFinite))continue;
    if(distance(points[i],cleaned[cleaned.length-1])>1e-5)cleaned.push(points[i].slice());
  }
  if(cleaned.length<2)return [];
  let length=0;const cumulative=[0];
  for(let i=1;i<cleaned.length;i++){length+=distance(cleaned[i],cleaned[i-1]);cumulative.push(length);}
  if(length<.075)return [];
  const n=Math.min(Math.max(2,Math.floor(count)),MAX_CURVE_POINTS);
  const out=[];let segment=1;
  for(let i=0;i<n;i++){
    const t=length*i/(n-1);
    while(segment<cumulative.length-1&&cumulative[segment]<t)segment++;
    const a=cleaned[segment-1],b=cleaned[segment];
    const u=clamp((t-cumulative[segment-1])/Math.max(1e-9,cumulative[segment]-cumulative[segment-1]),0,1);
    out.push(a.map((v,k)=>clamp(v+(b[k]-v)*u,-.93,.93)));
  }
  return out;
}
export function newFlowCurve(type,points,r=.27,strength=1.2){
  if(!CURVE_TYPES.includes(type))throw Error("Unknown flow-curve type "+type);
  if(!Array.isArray(points)||points.length<2||points.length>MAX_CURVE_POINTS||
    !points.every(p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite)))throw Error("Invalid curve points");
  return {type,points:points.map(p=>p.map(v=>clamp(v,-.93,.93))),
    r:clamp(Number(r)||.27,.12,.65),strength:clamp(Number(strength)||0,0,2.4)};
}
export function cloneFlowCurves(curves){
  return curves.slice(0,MAX_CURVES).map(c=>newFlowCurve(c.type,c.points,c.r,c.strength));
}
export function curveVelocity(curves,x,y,z,t,out){
  for(let i=0;i<Math.min(MAX_CURVES,curves.length);i++){
    const curve=curves[i],pts=curve.points;
    if(pts.length<2)continue;
    let nearest=Infinity,dx=0,dy=0,dz=0,tx=0,ty=0,tz=0;
    for(let j=1;j<pts.length;j++){
      const a=pts[j-1],b=pts[j],sx=b[0]-a[0],sy=b[1]-a[1],sz=b[2]-a[2];
      const ls=sx*sx+sy*sy+sz*sz;if(ls<1e-9)continue;
      const u=clamp(((x-a[0])*sx+(y-a[1])*sy+(z-a[2])*sz)/ls,0,1);
      const xx=x-(a[0]+u*sx),yy=y-(a[1]+u*sy),zz=z-(a[2]+u*sz);
      const dd=xx*xx+yy*yy+zz*zz;
      if(dd<nearest){nearest=dd;dx=xx;dy=yy;dz=zz;
        const len=Math.sqrt(ls);tx=sx/len;ty=sy/len;tz=sz/len;}
    }
    const r=curve.r;if(nearest>9*r*r)continue;
    const pulse=.82+.18*Math.sin(t*.75+i*2.1);
    const gain=.55*curve.strength*pulse*Math.exp(-nearest/(2*r*r));
    if(curve.type==="stream"){out[0]+=gain*tx;out[1]+=gain*ty;out[2]+=gain*tz;}
    else if(curve.type==="coil"){const q=gain/r;out[0]+=(ty*dz-tz*dy)*q;out[1]+=(tz*dx-tx*dz)*q;out[2]+=(tx*dy-ty*dx)*q;}
    else {const q=gain/r;out[0]-=dx*q;out[1]-=dy*q;out[2]-=dz*q;}
  }
  return out;
}
