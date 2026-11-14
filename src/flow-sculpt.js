// Stateful, editable 3D flow anchors. No screen-space decoration.
export const MAX_SCULPT_NODES=6;
export const SCULPT_TYPES=["vortex","pull","push"];
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export function newSculptNode(type,p,r=.30,strength=1.5,phase=0){
  if(!SCULPT_TYPES.includes(type))throw Error("Unknown sculpt type "+type);
  if(!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite))throw Error("Invalid sculpt position");
  return {type,p:p.map(v=>clamp(v,-.93,.93)),r:clamp(Number(r)||.30,.12,.75),
    strength:clamp(Number(strength)||0,0,3),phase:Number.isFinite(phase)?phase:0};
}
export function cloneSculptNodes(nodes){
  return nodes.slice(0,MAX_SCULPT_NODES).map(n=>newSculptNode(n.type,n.p,n.r,n.strength,n.phase));
}
export function sculptVelocity(nodes,x,y,z,t,out){
  // A bounded localized rotational field, or a deliberately compressible
  // attraction/repulsion. Nodes are stationary; their strength softly pulses.
  for(const n of nodes){
    const dx=x-n.p[0],dy=y-n.p[1],dz=z-n.p[2];
    const r=Math.max(.12,n.r),d2=dx*dx+dy*dy+dz*dz;
    if(d2>9*r*r)continue;
    const f=.78+.22*Math.sin(.83*t+n.phase);
    const gain=n.strength*.60*f*Math.exp(-d2/(2*r*r))/r;
    if(n.type==="vortex"){out[0]+=dz*gain;out[2]-=dx*gain;}
    else if(n.type==="pull"){out[0]-=dx*gain;out[1]-=dy*gain;out[2]-=dz*gain;}
    else if(n.type==="push"){out[0]+=dx*gain;out[1]+=dy*gain;out[2]+=dz*gain;}
  }
  return out;
}
export function summonSculptTriad(radius=.31,strength=1.4){
  return [
    newSculptNode("vortex",[-.42,.16,-.22],radius,strength,.1),
    newSculptNode("pull",[.34,-.26,.2],radius,strength,2.15),
    newSculptNode("push",[.1,.36,.30],radius,strength,4.2)
  ];
}
