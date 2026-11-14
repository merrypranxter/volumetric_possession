import test from "node:test";
import assert from "node:assert/strict";
import {PigmentField} from "../src/field.js";
import {cloneFlowCurves} from "../src/flow-curve.js";
import {captureCurveGenome,cloneBreederParents,breedCurveGenomes,nurseryStarters,BREEDER_SLOTS,DEFAULT_BREED_SEED} from "../src/curve-breeder.js";
const dna=()=>nurseryStarters();
test("three mathematical nursery parents have distinct geometry and motion",()=>{
 const p=dna();
 assert.equal(p.length,BREEDER_SLOTS);
 assert.deepEqual(p.map(x=>x.curves.length),[1,2,2]);
 assert.deepEqual(p.map(x=>x.livingMode),["writhe","unravel","reconnect"]);
 assert.equal(DEFAULT_BREED_SEED,314159);
});
test("genomes capture deep curve DNA, not pigment textures",()=>{
 const f=new PigmentField(5);f.flowCurves=cloneFlowCurves(dna()[1].curves);
 f.livingMode="unravel";f.livingRate=1.3;f.livingAmount=.26;
 const p=captureCurveGenome(f),before=JSON.stringify(p);
 f.flowCurves[0].points[0][0]=.92;f.livingMode="still";
 assert.equal(JSON.stringify(p),before);
 assert.deepEqual(Object.keys(p).sort(),["curves","livingMode","livingRate","livingAmount"].sort());
});
test("breeding requires two parents and validated 32-bit seed",()=>{
 assert.throws(()=>breedCurveGenomes([dna()[0]],7),/at least two parents/);
 for(const seed of [-1,4.1,4294967296])assert.throws(()=>breedCurveGenomes(dna(),seed),/32-bit unsigned/);
});
test("same seed, mutation and dominant lineage always yields same child",()=>{
 for(const dominance of ["balanced","0","1","2"]){
 const a=breedCurveGenomes(dna(),642431,.22,dominance);
 const b=breedCurveGenomes(dna(),642431,.22,dominance);
 assert.deepEqual(a,b);
 assert.equal(a.seed,642431);
 }
});
test("seeds create visually different 1-2-curve offspring within phone limits",()=>{
 const parents=dna();
 const children=Array.from({length:24},(_,i)=>breedCurveGenomes(parents,314159+i,.22));
 assert.ok(new Set(children.map(x=>JSON.stringify(x.curves))).size>=20);
 assert.ok(children.some(x=>x.curves.length===1)&&children.some(x=>x.curves.length===2));
 assert.ok(children.every(x=>x.curves.length<=2&&x.curves.every(c=>
  c.points.length===8&&c.points.every(p=>p.length===3&&p.every(v=>Number.isFinite(v)&&Math.abs(v)<=.93)))));
 assert.ok(new Set(children.map(x=>x.livingMode)).size>=2);
});
test("crossover changes real force traits and does not mutate parents",()=>{
 const p=dna(),original=JSON.stringify(p);
 const a=breedCurveGenomes(p,314159,.22,"0"),b=breedCurveGenomes(p,314159,.22,"2");
 assert.notDeepEqual(a,b);
 assert.equal(JSON.stringify(p),original);
 assert.ok(a.curves.every(c=>c.r>=.12&&c.r<=.65&&c.strength>=.05));
});
test("nursery survives Restart and Undo restores child DNA and exact material",()=>{
 const f=new PigmentField(91);f.flowCurves=cloneFlowCurves(dna()[1].curves);
 for(let i=0;i<3;i++)f.step(1/15,1);
 f.breederParents=cloneBreederParents(dna());
 const s=f.snapshot(),child=breedCurveGenomes(f.breederParents,15151,.22);
 f.flowCurves=cloneFlowCurves(child.curves);
 f.livingMode=child.livingMode;f.breederSeed=15152;
 assert.deepEqual(f.a,s.values);assert.deepEqual(f.fibers.a,s.fibers);
 f.restore(s);
 assert.deepEqual(f.flowCurves,s.flowCurves);
 assert.deepEqual(f.breederParents,s.breederParents);
 assert.equal(f.breederSeed,s.breederSeed);
 assert.deepEqual(f.a,s.values);assert.deepEqual(f.fibers.a,s.fibers);
 f.reset(91);
 assert.equal(f.flowCurves.length,0);
 assert.deepEqual(f.breederParents,s.breederParents);
});
test("different offspring causal curves alter actual pigment and fibers",()=>{
 const f=new PigmentField(92),control=new PigmentField(92);
 const kid=breedCurveGenomes(dna(),71991,.3);
 f.flowCurves=cloneFlowCurves(kid.curves);
 f.livingMode=kid.livingMode;f.livingRate=kid.livingRate;f.livingAmount=kid.livingAmount;
 for(let i=0;i<4;i++){f.step(1/15,1);control.step(1/15,1);}
 let dye=0,filament=0;
 for(let i=0;i<f.a.length;i++)dye+=Math.abs(f.a[i]-control.a[i]);
 for(let i=0;i<f.fibers.a.length;i++)filament+=Math.abs(f.fibers.a[i]-control.fibers.a[i]);
 assert.ok(dye>1&&filament>1);
});
