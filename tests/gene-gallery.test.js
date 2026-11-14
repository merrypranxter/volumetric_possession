import test from "node:test";
import assert from "node:assert/strict";
import {PigmentField} from "../src/field.js";
import {nurseryStarters,breedCurveGenomes,cloneBreederParents} from "../src/curve-breeder.js";
import {GALLERY_LIMIT,GENE_STORAGE_KEY,cloneGeneGallery,cloneGeneSources,addGeneSpecimen,editGeneSpecimen,removeGeneSpecimen,genealogicalChain,serializeGeneBank,parseGeneBank} from "../src/gene-gallery.js";
function build(){
 const parents=nurseryStarters();let gallery=[],sequence=1,refs=[];
 for(let i=0;i<3;i++){
   const saved=addGeneSpecimen(gallery,parents[i],{sequence,label:"Ancestor "+(i+1)});
   gallery=saved.gallery;sequence=saved.nextSequence;
   refs.push({id:saved.record.id,label:saved.record.label});
 }
 return {parents,gallery,sequence,refs};
}
test("album starts empty, has bounded storage key and mobile count",()=>{
 assert.equal(GALLERY_LIMIT,24);
 assert.match(GENE_STORAGE_KEY,/volumetric-possession/);
 assert.deepEqual(cloneGeneGallery(),[]);
 assert.deepEqual(cloneGeneSources(),[null,null,null]);
});
test("archiving three starter ancestors creates stable IDs and independent genomes",()=>{
 const data=build(),ids=data.gallery.map(s=>s.id);
 assert.deepEqual(ids,["g1","g2","g3"]);
 assert.ok(data.gallery.every(s=>s.generation===0));
 const copy=cloneGeneGallery(data.gallery);
 copy[0].genome.curves[0].points[0][0]=.91;
 assert.notEqual(copy[0].genome.curves[0].points[0][0],data.gallery[0].genome.curves[0].points[0][0]);
 assert.notEqual(copy[0].genome.curves[0].points[0][0],data.parents[0].curves[0].points[0][0]);
});
test("two births create a real three-generation ancestry chain",()=>{
 const b=build();
 const child=breedCurveGenomes(b.parents,314159,.22);
 const x=addGeneSpecimen(b.gallery,child,{sequence:b.sequence,parents:b.refs,seed:314159,label:"First mutant"});
 const child2=breedCurveGenomes([child,b.parents[1]],2346,.13);
 const y=addGeneSpecimen(x.gallery,child2,{sequence:x.nextSequence,
   parents:[{id:x.record.id,label:x.record.label},b.refs[1]],label:"Second mutant",seed:2346});
 assert.equal(x.record.generation,1);
 assert.equal(y.record.generation,2);
 const ancestors=genealogicalChain(y.gallery,y.record.id,4);
 assert.deepEqual(ancestors.map(a=>a.generation),[2,1,0,0,0]);
 assert.equal(ancestors[1].id,x.record.id);
});
test("JSON backup round-trips album, parents, slot IDs and seed",()=>{
 const b=build();
 const serialized=serializeGeneBank({
   geneGallery:b.gallery,geneNextSequence:b.sequence,
   breederParents:b.parents,breederSources:b.refs,breederSeed:1911});
 const restored=parseGeneBank(serialized);
 assert.equal(restored.geneGallery.length,3);
 assert.equal(restored.geneNextSequence,4);
 assert.equal(restored.breederSeed,1911);
 assert.deepEqual(restored.breederParents,b.parents);
 assert.deepEqual(restored.breederSources,b.refs);
 assert.equal(serializeGeneBank(restored),serialized);
 assert.doesNotMatch(serialized,/"values"|"fiberTexture"|"texture"/);
});
test("malformed backup, unsupported schema and forged ID cannot overwrite a gallery",()=>{
 const b=build(),raw=JSON.parse(serializeGeneBank({
   geneGallery:b.gallery,geneNextSequence:b.sequence,breederParents:b.parents,
   breederSources:b.refs,breederSeed:5}));
 assert.throws(()=>parseGeneBank("{oops"),/valid JSON/);
 assert.throws(()=>parseGeneBank("x".repeat(400001)),/too large/);
 assert.throws(()=>parseGeneBank(JSON.stringify({...raw,version:99})),/version/);
 assert.throws(()=>parseGeneBank(JSON.stringify({...raw,nextSequence:2})),/next ID/);
 assert.throws(()=>parseGeneBank(JSON.stringify({...raw,album:[raw.album[0],raw.album[0]]})),/duplicate/);
 const bad={...raw.album[0],id:"!danger"};
 assert.throws(()=>parseGeneBank(JSON.stringify({...raw,album:[bad]})),/specimen ID/);
});
test("gallery automatically evicts oldest non-favorite, not favorites",()=>{
 const parents=nurseryStarters();let gallery=[],seq=1;
 for(let i=0;i<GALLERY_LIMIT;i++){
  const v=addGeneSpecimen(gallery,parents[i%3],
   {sequence:seq,label:"Specimen "+i,favorite:i===0});
  gallery=v.gallery;seq=v.nextSequence;
 }
 const v=addGeneSpecimen(gallery,parents[0],{sequence:seq,label:"New"});
 assert.equal(v.gallery.length,GALLERY_LIMIT);
 assert.ok(v.gallery.some(s=>s.id==="g1"));
 assert.ok(!v.gallery.some(s=>s.id==="g2"));
 assert.ok(v.gallery.some(s=>s.id===v.record.id));
});
test("all-favorite album rejects overflow without mutating saved DNA",()=>{
 let gallery=[],seq=1;
 for(let i=0;i<GALLERY_LIMIT;i++){
  const v=addGeneSpecimen(gallery,nurseryStarters()[0],{sequence:seq,favorite:true});
  gallery=v.gallery;seq=v.nextSequence;
 }
 const orig=JSON.stringify(gallery);
 assert.throws(()=>addGeneSpecimen(gallery,nurseryStarters()[0],{sequence:seq}),/favorites/);
 assert.equal(JSON.stringify(gallery),orig);
});
test("rename, star, delete are immutable and keep descendants' lineage text",()=>{
 const b=build(),first=b.gallery[0];
 const starred=editGeneSpecimen(b.gallery,first.id,{label:"★ Queen",favorite:true});
 assert.equal(starred[0].label,"★ Queen");assert.equal(starred[0].favorite,true);
 assert.equal(b.gallery[0].favorite,false);
 const born=addGeneSpecimen(starred,b.parents[2],{sequence:b.sequence,
   parents:[{id:first.id,label:first.label}],label:"Descendant"});
 const gone=removeGeneSpecimen(born.gallery,first.id);
 assert.equal(gone.length,3);
 assert.equal(gone.at(-1).parents[0].label,first.label);
});
test("scene checkpoints preserve album and genealogy without altering material",()=>{
 const f=new PigmentField(85),b=build();
 f.geneGallery=cloneGeneGallery(b.gallery);
 f.geneNextSequence=b.sequence;
 f.breederParents=cloneBreederParents(b.parents);
 f.breederSources=cloneGeneSources(b.refs);
 for(let i=0;i<3;i++)f.step(1/15,1);
 const snap=f.snapshot(),before=f.a.slice(),fibers=f.fibers.a.slice();
 f.geneGallery[0].label="ROGUE";f.breederSources[0].id="not-really";
 f.restore(snap);
 assert.deepEqual(f.geneGallery,snap.geneGallery);
 assert.deepEqual(f.breederSources,snap.breederSources);
 assert.deepEqual(f.a,before);assert.deepEqual(f.fibers.a,fibers);
 f.reset(86);
 assert.equal(f.flowCurves.length,0);
 assert.deepEqual(f.geneGallery,snap.geneGallery);
});
