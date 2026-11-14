// Phase 01O — Trait Heist. Lock individual inherited cause-field traits
// to a particular saved parent, while the unlocked traits use original genetics.
// No shader changes, textures, or simulation rewrites.
import {breedCurveGenomes} from "./curve-breeder.js";
import {cloneFlowCurves,MAX_CURVES} from "./flow-curve.js";
import {LIVING_MODES} from "./living-braid.js";
export const TRAIT_KEYS=["topology","shape","force","material","motion","dynamics"];
export const TRAIT_LABELS={
  topology:"Curve count",shape:"3D shape",force:"Force law",
  material:"Width + strength",motion:"Living motion",dynamics:"Speed + excursion"
};
export const DEFAULT_TRAIT_LOCKS=Object.freeze(Object.fromEntries(TRAIT_KEYS.map(k=>[k,"auto"])));
export function normalizeTraitLocks(locks){
  const result={};
  for(const key of TRAIT_KEYS){
    const value=locks?.[key];
    result[key]=["0","1","2"].includes(String(value))?String(value):"auto";
  }
  return result;
}
const letter=i=>String.fromCharCode(65+i);
export function breedWithTraitLocks(parents,seed,mutation,dominance="balanced",locks={}){
  const choose=normalizeTraitLocks(locks);
  const orig=breedCurveGenomes(parents,seed,mutation,dominance);
  const child={...orig,curves:cloneFlowCurves(orig.curves)};
  const receipt={},notes=[];
  const donor=(key)=>{
    const value=choose[key];
    if(value==="auto")return null;
    const index=Number(value),parent=parents?.[index];
    if(!parent?.curves?.length)throw Error(TRAIT_LABELS[key]+": Parent "+letter(index)+" is empty");
    receipt[key]=letter(index);
    return {index,parent};
  };
  const model=donor("topology");
  if(model){
    const originalCount=child.curves.length;
    const desiredCount=model.parent.curves.length;
    if(desiredCount<1||desiredCount>MAX_CURVES)throw Error("Unsupported curve count");
    if(desiredCount!==originalCount){
      const target=model.parent.curves;
      child.curves=Array.from({length:desiredCount},(_,i)=>
        i<originalCount?cloneFlowCurves([child.curves[i]])[0]:cloneFlowCurves([target[i]])[0]);
    }
  }else receipt.topology="Auto";
  // When a locked parent has only one path but topology requires two,
  // inherit its first path exactly and use the topology parent for slot 2.
  // Never silently grow a bogus zero-length secondary curve.
  const getSource=(key,slot)=>{
    const locked=donor(key);
    if(!locked)return null;
    if(locked.parent.curves[slot])return locked.parent.curves[slot];
    const topology=model?.parent.curves[slot];
    if(topology){
      notes.push(TRAIT_LABELS[key]+": strand "+(slot+1)+" from topology parent "+letter(model.index));
      return topology;
    }
    const backup=(parents||[]).find(p=>p?.curves?.[slot])?.curves?.[slot];
    if(backup){
      notes.push(TRAIT_LABELS[key]+": strand "+(slot+1)+" from an available parent");
      return backup;
    }
    throw Error(TRAIT_LABELS[key]+": no donor for strand "+(slot+1));
  };
  const shape=donor("shape");
  receipt.shape=shape?letter(shape.index):"Auto";
  for(let i=0;i<child.curves.length;i++){
    if(shape){
      const source=shape.parent.curves[i]||getSource("shape",i);
      child.curves[i].points=source.points.map(pt=>pt.slice());
    }
  }
  const force=donor("force");
  receipt.force=force?letter(force.index):"Auto";
  for(let i=0;i<child.curves.length;i++)if(force){
    const source=force.parent.curves[i]||getSource("force",i);
    child.curves[i].type=source.type;
  }
  const mat=donor("material");
  receipt.material=mat?letter(mat.index):"Auto";
  for(let i=0;i<child.curves.length;i++)if(mat){
    const source=mat.parent.curves[i]||getSource("material",i);
    child.curves[i].r=source.r;child.curves[i].strength=source.strength;
  }
  const motion=donor("motion");
  if(motion){
    child.livingMode=motion.parent.livingMode;
    if(child.curves.length===1&&["unravel","reconnect"].includes(child.livingMode)){
      notes.push("Paired motion needs two strands — uses Writhe");
      child.livingMode="writhe";
    }
  }
  receipt.motion=motion?letter(motion.index):"Auto";
  const dynamics=donor("dynamics");
  if(dynamics){
    child.livingRate=dynamics.parent.livingRate;
    child.livingAmount=dynamics.parent.livingAmount;
  }
  receipt.dynamics=dynamics?letter(dynamics.index):"Auto";
  if(!LIVING_MODES.includes(child.livingMode))throw Error("Invalid motion inheritance");
  return {...child,traitLocks:choose,inheritance:receipt,notes};
}
