// Color Topologist: winding of the actual authored flow's 2D XY phase slice,
// z=0, open boundaries. This is an S1 index, NOT volume genus.
import {curveVelocity} from "./flow-curve.js";
import {sculptVelocity} from "./flow-sculpt.js";
const TAU=Math.PI*2;
const wrap=v=>Math.atan2(Math.sin(v),Math.cos(v));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function sampleFlowWinding(sample,grid=20,extent=.88,minSpeed=.008){
  if(!Number.isInteger(grid)||grid<5||grid>65)throw Error("Invalid winding grid");
  if(!Number.isFinite(extent)||extent<=0||extent>1)throw Error("Invalid winding extent");
  const angle=new Float64Array(grid*grid),valid=new Uint8Array(grid*grid);
  for(let j=0;j<grid;j++)for(let i=0;i<grid;i++){
    const x=-extent+2*extent*i/(grid-1),y=-extent+2*extent*j/(grid-1);
    const vector=sample(x,y);
    if(!vector||!vector.slice(0,2).every(Number.isFinite))continue;
    if(Math.hypot(vector[0],vector[1])<minSpeed)continue;
    const p=j*grid+i;valid[p]=1;angle[p]=Math.atan2(vector[1],vector[0]);
  }
  const defects=[];
  for(let j=0;j<grid-1;j++)for(let i=0;i<grid-1;i++){
    const a=j*grid+i,b=a+1,c=a+grid+1,d=a+grid;
    if(!valid[a]||!valid[b]||!valid[c]||!valid[d])continue;
    const winding=(wrap(angle[b]-angle[a])+wrap(angle[c]-angle[b])+
      wrap(angle[d]-angle[c])+wrap(angle[a]-angle[d]))/TAU;
    const charge=Math.round(winding);
    if(Math.abs(charge)!==1||Math.abs(winding-charge)>.14)continue;
    defects.push({x:-extent+2*extent*(i+.5)/(grid-1),
      y:-extent+2*extent*(j+.5)/(grid-1),z:0,charge,
      error:Math.abs(winding-charge)});
  }
  // Sort in fixed order. This is an open-slice sampling diagnostic;
  // the caller caps displayed charges, not their mathematical count.
  return defects;
}
export function measureAuthoredWinding(curves,nodes,time,grid=20){
  if(!curves?.length&&!nodes?.length)return [];
  return sampleFlowWinding((x,y)=>{
    const velocity=[0,0,0];
    curveVelocity(curves||[],x,y,0,time,velocity);
    sculptVelocity(nodes||[],x,y,0,time,velocity);
    return velocity;
  },grid,.88,.008);
}
export function projectWindingDefects(defects,project,maxCount=6){
  const out=[];
  for(const d of defects){
    const pt=project([d.x,d.y,d.z]);
    if(!pt||!pt.visible)continue;
    out.push({uv:[clamp(pt.x,0,1),clamp(1-pt.y,0,1)],charge:d.charge});
    if(out.length>=maxCount)break;
  }
  return out;
}
