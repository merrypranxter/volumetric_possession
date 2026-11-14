// Phase 01P — Gene Surgery. Pure causal edits to one strand of a living
// 3D velocity genome. Never touches color volume, GPU resources, or source DNA.
import {cloneCurveGenome} from "./curve-breeder.js";
import {newFlowCurve,MAX_CURVES} from "./flow-curve.js";
import {LIVING_MODES} from "./living-braid.js";

export const SURGERY_OPERATIONS=["strand","shape","force","material","append","remove","motion","dynamics"];
export const SURGERY_LABELS={
  strand:"Whole strand graft",shape:"3D geometry transplant",force:"Force-law swap",
  material:"Radius + strength graft",append:"Add a donor strand",remove:"Amputate selected strand",
  motion:"Living motion transplant",dynamics:"Cycle-rate / excursion graft"
};
const validIndex=n=>Number.isInteger(n)&&n>=0&&n<MAX_CURVES;
const copyCurve=c=>newFlowCurve(c.type,c.points,c.r,c.strength);
const needDonor=op=>!["remove"].includes(op);

export function performGeneSurgery(recipient,donor,options={}){
  const {operation="strand",target=0,donorStrand=0}=options;
  if(!SURGERY_OPERATIONS.includes(operation))throw Error("Unknown genetic operation");
  if(!validIndex(target)||!validIndex(donorStrand))throw Error("Strand index must be 1 or 2");
  const original=cloneCurveGenome(recipient);
  if(!original)throw Error("Draw or activate a curve system before surgery");
  const result=cloneCurveGenome(original);
  const source=needDonor(operation)?cloneCurveGenome(donor):null;
  if(needDonor(operation)&&!source)throw Error("Select a captured or archived donor first");
  const donorCurve=source?.curves[donorStrand];
  const chosen=original.curves[target];
  if(["strand","shape","force","material"].includes(operation)&&!chosen)
    throw Error("Target strand "+(target+1)+" doesn't exist");
  if(["strand","shape","force","material","append"].includes(operation)&&!donorCurve)
    throw Error("Donor strand "+(donorStrand+1)+" doesn't exist");
  let detail="";
  switch(operation){
    case "strand":
      result.curves[target]=copyCurve(donorCurve);
      detail="Replaced strand "+(target+1)+" with an exact donor strand";
      break;
    case "shape":
      result.curves[target].points=donorCurve.points.map(p=>p.slice());
      detail="Replaced only the 3D path of strand "+(target+1);
      break;
    case "force":
      result.curves[target].type=donorCurve.type;
      detail="Replaced only the velocity law of strand "+(target+1);
      break;
    case "material":
      result.curves[target].r=donorCurve.r;
      result.curves[target].strength=donorCurve.strength;
      detail="Replaced only width and force strength of strand "+(target+1);
      break;
    case "append":
      if(result.curves.length>=MAX_CURVES)throw Error("Two-strand limit reached; replace or remove a strand instead");
      result.curves.push(copyCurve(donorCurve));
      detail="Grafted donor strand as new strand "+result.curves.length;
      break;
    case "remove":
      if(result.curves.length<=1)throw Error("Cannot remove the only active strand");
      if(!chosen)throw Error("Target strand "+(target+1)+" doesn't exist");
      result.curves.splice(target,1);
      detail="Removed strand "+(target+1)+" while preserving all other DNA";
      break;
    case "motion":
      result.livingMode=source.livingMode;
      detail="Transplanted living motion law";
      break;
    case "dynamics":
      result.livingRate=source.livingRate;
      result.livingAmount=source.livingAmount;
      detail="Transplanted living cycle speed and excursion";
      break;
  }
  const notes=[];
  if(result.curves.length===1&&["unravel","reconnect"].includes(result.livingMode)){
    result.livingMode="writhe";
    notes.push("Paired-only motion changed to Writhe for one strand");
  }
  if(result.curves.length<1||result.curves.length>MAX_CURVES||!LIVING_MODES.includes(result.livingMode))
    throw Error("Surgery produced unsupported geometry");
  return {genome:result,operation,target,donorStrand,
    detail,notes,sourceStrands:source?.curves.length??0};
}
