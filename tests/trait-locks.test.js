import test from "node:test";
import assert from "node:assert/strict";
import {PigmentField} from "../src/field.js";
import {nurseryStarters,breedCurveGenomes} from "../src/curve-breeder.js";
import {TRAIT_KEYS,normalizeTraitLocks,breedWithTraitLocks} from "../src/trait-locks.js";
import {serializeGeneBank,parseGeneBank,addGeneSpecimen} from "../src/gene-gallery.js";
const parents=()=>nurseryStarters();
const all={topology:"1",shape:"0",force:"2",material:"1",motion:"0",dynamics:"2"};
test("six independent trait channels default to the old crossover",()=>{
 const p=parents(),seed=39872,mutation=.27;
 const kid=breedWithTraitLocks(p,seed,mutation,"balanced");
 const classic=breedCurveGenomes(p,seed,mutation,"balanced");
 for(const key of ["curves","livingMode","livingRate","livingAmount","seed","lineage"])
   assert.deepEqual(kid[key],classic[key]);
 assert.deepEqual(kid.traitLocks,normalizeTraitLocks());
 assert.deepEqual(TRAIT_KEYS,["topology","shape","force","material","motion","dynamics"]);
});
test("theft from six different source channels controls real 3D causal DNA",()=>{
 const p=parents(),kid=breedWithTraitLocks(p,314159,.22,"balanced",all);
 assert.equal(kid.curves.length,2);
 assert.deepEqual(kid.curves[0].points,p[0].curves[0].points);
 assert.deepEqual(kid.curves[1].points,p[1].curves[1].points);
 assert.deepEqual(kid.curves.map(c=>c.type),["gather","stream"]);
 assert.deepEqual(kid.curves.map(c=>c.r),p[1].curves.map(c=>c.r));
 assert.deepEqual(kid.curves.map(c=>c.strength),p[1].curves.map(c=>c.strength));
 assert.equal(kid.livingMode,"writhe");
 assert.equal(kid.livingRate,p[2].livingRate);
 assert.equal(kid.livingAmount,p[2].livingAmount);
 assert.match(kid.notes.join(" "),/strand 2 from topology parent B/);
 assert.deepEqual(kid.inheritance,{topology:"B",shape:"A",force:"C",material:"B",motion:"A",dynamics:"C"});
});
test("locked geometry is copied exactly when mutation is zero or maximum",()=>{
 const p=parents();
 for(const mutation of [0,.5]){
  const kid=breedWithTraitLocks(p,17,mutation,"balanced",{topology:"1",shape:"1"});
  assert.deepEqual(kid.curves.map(x=>x.points),p[1].curves.map(x=>x.points));
 }
});
test("paired-only motion cannot be applied to one-curve child",()=>{
 const p=parents(),kid=breedWithTraitLocks(p,10,.24,"balanced",{topology:"0",motion:"2"});
 assert.equal(kid.curves.length,1);
 assert.equal(kid.livingMode,"writhe");
 assert.match(kid.notes.join(" "),/Paired motion needs two strands/);
});
test("all donor slots are validated and never substituted silently if empty",()=>{
 const p=parents();p[2]=null;
 assert.throws(()=>breedWithTraitLocks(p,101,.25,"balanced",{shape:"2"}),/Parent C is empty/);
 assert.equal(normalizeTraitLocks({force:"banana",motion:9,shape:0}).shape,"0");
 assert.equal(normalizeTraitLocks({force:"banana",motion:9}).force,"auto");
});
test("locked offspring remains repeatable and varies across unlocked seeds",()=>{
 const p=parents(),a=breedWithTraitLocks(p,45,.23,"balanced",all);
 assert.deepEqual(a,breedWithTraitLocks(p,45,.23,"balanced",all));
 const other=breedWithTraitLocks(p,46,.23,"balanced",{shape:"1",topology:"1"});
 const another=breedWithTraitLocks(p,47,.23,"balanced",{shape:"1",topology:"1"});
 assert.deepEqual(other.curves.map(c=>c.points),another.curves.map(c=>c.points));
 assert.notDeepEqual(other.curves.map(c=>c.strength),another.curves.map(c=>c.strength));
});
test("trait locks survive CPU checkpoint and Restart without altering pigment",()=>{
 const f=new PigmentField(31);
 f.breederParents=parents();f.breedTraitLocks=normalizeTraitLocks(all);
 for(let i=0;i<2;i++)f.step(1/15,1);
 const s=f.snapshot(),volume=f.a.slice(),fibers=f.fibers.a.slice();
 f.breedTraitLocks=normalizeTraitLocks();f.restore(s);
 assert.deepEqual(f.breedTraitLocks,normalizeTraitLocks(all));
 assert.deepEqual(f.a,volume);assert.deepEqual(f.fibers.a,fibers);
 f.reset(31);assert.deepEqual(f.breedTraitLocks,normalizeTraitLocks(all));
});
test("gene bank stores selected locks and accepts Phase 01N v1 backups",()=>{
 const f=new PigmentField(1);f.breederParents=parents();f.breedTraitLocks=normalizeTraitLocks(all);
 const json=serializeGeneBank(f),loaded=parseGeneBank(json);
 assert.deepEqual(loaded.breedTraitLocks,normalizeTraitLocks(all));
 assert.equal(serializeGeneBank(loaded),json);
 const old=JSON.parse(json);delete old.breedTraitLocks;
 assert.deepEqual(parseGeneBank(JSON.stringify(old)).breedTraitLocks,normalizeTraitLocks());
});
test("birth receipts and lock settings survive archiving, without snapshotting pixels",()=>{
 const p=parents(),kid=breedWithTraitLocks(p,177,.25,"balanced",all);
 const saved=addGeneSpecimen([],kid,{sequence:1,seed:177,
   traitLocks:kid.traitLocks,inheritance:kid.inheritance});
 assert.deepEqual(saved.record.traitLocks,normalizeTraitLocks(all));
 assert.deepEqual(saved.record.inheritance,kid.inheritance);
 assert.doesNotMatch(JSON.stringify(saved.record),/"values"|"fiberTexture"|"texture"/);
});
