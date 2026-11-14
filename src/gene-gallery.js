// Phase 01N — Mutant Family Album. Lightweight, safe, versioned mathematical
// DNA archive. Contains NO volume textures, screenshots, or WebGL resources.
import {cloneCurveGenome,cloneBreederParents} from "./curve-breeder.js";
import {normalizeTraitLocks} from "./trait-locks.js";
export const GALLERY_LIMIT=24;
export const GENE_STORAGE_KEY="volumetric-possession-gene-album-v1";
const idPattern=/^g[0-9a-z]+$/;
const int=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
export const emptyGeneSources=()=>[null,null,null];
const safeName=s=>String(s??"Unnamed mutant").trim().slice(0,48)||"Unnamed mutant";
function saneId(id){return typeof id==="string"&&idPattern.test(id)&&id.length<=12?id:null;}
function cloneRef(ref){
  if(!ref||typeof ref!=="object")return null;
  return {id:saneId(ref.id),label:safeName(ref.label)};
}
function canonicalEntry(e){
  if(!e||typeof e!=="object"||!saneId(e.id))throw Error("Invalid gallery specimen ID");
  const genome=cloneCurveGenome(e.genome);
  const parents=Array.isArray(e.parents)?e.parents.slice(0,3).map(cloneRef).filter(Boolean):[];
  return {id:e.id,label:safeName(e.label),genome,parents,
    generation:int(e.generation,0,100000)?e.generation:0,
    favorite:!!e.favorite,seed:int(e.seed,0,0xffffffff)?e.seed:null,
    traitLocks:normalizeTraitLocks(e.traitLocks),
    inheritance:e.inheritance&&typeof e.inheritance==="object"?Object.fromEntries(Object.entries(e.inheritance).filter(([k,v])=>["topology","shape","force","material","motion","dynamics"].includes(k)&&["Auto","A","B","C"].includes(v))):{},
    mutation:typeof e.mutation==="number"&&Number.isFinite(e.mutation)?
      Math.min(.5,Math.max(0,e.mutation)):null,
    sequence:int(e.sequence,1,0x7fffffff)?e.sequence:1};
}
export function cloneGeneGallery(items){
  if(!Array.isArray(items))return [];
  if(items.length>GALLERY_LIMIT)throw Error("Gallery contains too many specimens");
  const clones=items.map(canonicalEntry);
  if(new Set(clones.map(x=>x.id)).size!==clones.length)throw Error("Gallery has duplicate specimen IDs");
  return clones;
}
export function cloneGeneSources(sources){
  return Array.from({length:3},(_,i)=>cloneRef(sources?.[i]));
}
export function addGeneSpecimen(gallery,genome,options={}){
  const list=cloneGeneGallery(gallery),sequence=options.sequence;
  if(!int(sequence,1,0x7fffffff))throw Error("Invalid specimen sequence");
  const id="g"+sequence.toString(36);
  if(list.some(x=>x.id===id))throw Error("Specimen ID already exists");
  const parents=(options.parents||[]).map(cloneRef).filter(Boolean);
  const generation=parents.length?1+Math.max(...parents.map(ref=>
    list.find(x=>x.id===ref.id)?.generation??0)):0;
  const entry=canonicalEntry({id,label:options.label||("Mutant #"+sequence),
    genome,parents,generation,favorite:!!options.favorite,seed:options.seed,
    mutation:options.mutation,traitLocks:options.traitLocks,inheritance:options.inheritance,sequence});
  if(list.length===GALLERY_LIMIT){
    const oldest=list.findIndex(e=>!e.favorite);
    if(oldest<0)throw Error("All 24 specimens are favorites; unstar one or delete a specimen");
    list.splice(oldest,1);
  }
  list.push(entry);
  return {gallery:list,record:entry,nextSequence:sequence+1};
}
export function editGeneSpecimen(items,id,patch={}){
  const list=cloneGeneGallery(items),index=list.findIndex(x=>x.id===id);
  if(index<0)throw Error("Specimen not found");
  if("label" in patch)list[index].label=safeName(patch.label);
  if("favorite" in patch)list[index].favorite=!!patch.favorite;
  return list;
}
export function removeGeneSpecimen(items,id){
  return cloneGeneGallery(items).filter(x=>x.id!==id);
}
export function genealogicalChain(items,id,maxDepth=4){
  const byId=new Map(cloneGeneGallery(items).map(item=>[item.id,item]));
  const output=[],seen=new Set();
  function visit(nodeId,depth){
    if(!nodeId||seen.has(nodeId)||depth>maxDepth)return;
    seen.add(nodeId);
    const item=byId.get(nodeId);if(!item)return;
    output.push({id:item.id,label:item.label,generation:item.generation,depth});
    for(const parent of item.parents)visit(parent.id,depth+1);
  }
  visit(id,0);
  return output;
}
export function serializeGeneBank(system){
  const data={version:1,album:cloneGeneGallery(system.geneGallery||[]),
    nextSequence:system.geneNextSequence||1,
    breederParents:cloneBreederParents(system.breederParents),
    breederSources:cloneGeneSources(system.breederSources),
    breederSeed:system.breederSeed??314159,
    breedTraitLocks:normalizeTraitLocks(system.breedTraitLocks)};
  return JSON.stringify(data,null,2);
}
export function parseGeneBank(value){
  if(typeof value!=="string"||value.length>400000)throw Error("Gene bank backup is too large");
  let data;try{data=JSON.parse(value)}catch{throw Error("Gene bank is not valid JSON")}
  if(!data||data.version!==1)throw Error("Unrecognized gene bank version");
  const album=cloneGeneGallery(data.album);
  if(!int(data.nextSequence,1,0x7fffffff))throw Error("Invalid gene archive counter");
  if(!int(data.breederSeed,0,0xffffffff))throw Error("Invalid breeding seed");
  const maxSequence=Math.max(0,...album.map(x=>x.sequence));
  if(data.nextSequence<=maxSequence)throw Error("Gene bank has an invalid next ID");
  return {geneGallery:album,geneNextSequence:data.nextSequence,
    breederParents:cloneBreederParents(data.breederParents),
    breederSources:cloneGeneSources(data.breederSources),
    breederSeed:data.breederSeed,
    breedTraitLocks:normalizeTraitLocks(data.breedTraitLocks)};
}
