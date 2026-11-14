import test from "node:test";
import assert from "node:assert/strict";
import {PigmentField} from "../src/field.js";
import {nurseryStarters,cloneCurveGenome} from "../src/curve-breeder.js";
import {SURGERY_OPERATIONS,performGeneSurgery} from "../src/gene-surgery.js";
import {addGeneSpecimen,serializeGeneBank,parseGeneBank} from "../src/gene-gallery.js";
const family=()=>nurseryStarters();

test("whole-strand surgery replaces exactly one 3D force structure",()=>{
 const [a,b]=family(),patient=cloneCurveGenome(b),donor=cloneCurveGenome(a);
 const base=JSON.stringify(patient),source=JSON.stringify(donor);
 const graft=performGeneSurgery(patient,donor,{operation:"strand",target:1,donorStrand:0});
 assert.deepEqual(graft.genome.curves[0],patient.curves[0]);
 assert.deepEqual(graft.genome.curves[1],donor.curves[0]);
 assert.equal(graft.genome.livingMode,patient.livingMode);
 assert.equal(JSON.stringify(patient),base);
 assert.equal(JSON.stringify(donor),source);
 graft.genome.curves[1].points[0][0]=.88;
 assert.equal(JSON.stringify(donor),source,"graft must never mutate parent DNA");
});
test("geometry-only graft does not replace its force law, radius or strength",()=>{
 const [a,b]=family(),p=cloneCurveGenome(b);
 const child=performGeneSurgery(p,a,{operation:"shape",target:1,donorStrand:0}).genome;
 assert.deepEqual(child.curves[0],p.curves[0]);
 assert.deepEqual(child.curves[1].points,a.curves[0].points);
 assert.equal(child.curves[1].type,p.curves[1].type);
 assert.equal(child.curves[1].r,p.curves[1].r);
 assert.equal(child.curves[1].strength,p.curves[1].strength);
});
test("force and material can be transplanted independently on either strand",()=>{
 const [a,b,c]=family(),base=cloneCurveGenome(b);
 const force=performGeneSurgery(base,c,{operation:"force",target:0,donorStrand:0}).genome;
 assert.equal(force.curves[0].type,c.curves[0].type);
 assert.deepEqual(force.curves[0].points,base.curves[0].points);
 assert.deepEqual(force.curves[1],base.curves[1]);
 const material=performGeneSurgery(base,a,{operation:"material",target:1,donorStrand:0}).genome;
 assert.equal(material.curves[1].r,a.curves[0].r);
 assert.equal(material.curves[1].strength,a.curves[0].strength);
 assert.equal(material.curves[1].type,base.curves[1].type);
 assert.deepEqual(material.curves[1].points,base.curves[1].points);
});
test("append transplants exactly one additional real strand without exceeding two",()=>{
 const [a,b]=family();
 const added=performGeneSurgery(a,b,{operation:"append",donorStrand:1}).genome;
 assert.equal(added.curves.length,2);
 assert.deepEqual(added.curves[0],a.curves[0]);
 assert.deepEqual(added.curves[1],b.curves[1]);
 assert.throws(()=>performGeneSurgery(b,a,{operation:"append"}),/Two-strand limit/);
});
test("amputation preserves surviving strand and never destroys only remaining path",()=>{
 const [a,b]=family(),before=JSON.stringify(b);
 const cut=performGeneSurgery(b,null,{operation:"remove",target:0}).genome;
 assert.deepEqual(cut.curves,[b.curves[1]]);
 assert.equal(cut.livingMode,"writhe");
 assert.equal(JSON.stringify(b),before);
 assert.throws(()=>performGeneSurgery(a,null,{operation:"remove"}),/only active strand/);
});
test("living-motion and dynamics transplants preserve both 3D curve paths",()=>{
 const [a,b,c]=family();
 const motion=performGeneSurgery(b,c,{operation:"motion"}).genome;
 assert.equal(motion.livingMode,c.livingMode);
 assert.deepEqual(motion.curves,b.curves);
 const dynamics=performGeneSurgery(b,a,{operation:"dynamics"}).genome;
 assert.equal(dynamics.livingRate,a.livingRate);
 assert.equal(dynamics.livingAmount,a.livingAmount);
 assert.equal(dynamics.livingMode,b.livingMode);
 assert.deepEqual(dynamics.curves,b.curves);
});
test("invalid patient, donor strand, missing donor, and out-of-range indices fail safely",()=>{
 const [a,b]=family(),before=JSON.stringify(b);
 assert.throws(()=>performGeneSurgery(null,a),/Draw or activate/);
 assert.throws(()=>performGeneSurgery(b,null),/Select a captured or archived donor/);
 assert.throws(()=>performGeneSurgery(b,a,{operation:"strand",donorStrand:1}),/Donor strand 2/);
 assert.throws(()=>performGeneSurgery(b,a,{operation:"shape",target:2}),/Strand index/);
 assert.throws(()=>performGeneSurgery(b,a,{operation:"unknown"}),/Unknown genetic operation/);
 assert.equal(JSON.stringify(b),before);
 assert.equal(SURGERY_OPERATIONS.length,8);
});
test("surgery is causal source-data editing, not a texture reset",()=>{
 const f=new PigmentField(28);
 const familySet=family();f.flowCurves=cloneCurveGenome(familySet[1]).curves;
 for(let i=0;i<3;i++)f.step(1/15,1);
 const snap=f.snapshot();
 const result=performGeneSurgery({curves:f.flowCurves,livingMode:f.livingMode,
   livingRate:f.livingRate,livingAmount:f.livingAmount},familySet[2],
   {operation:"strand",target:1,donorStrand:1});
 f.flowCurves=result.genome.curves;
 assert.deepEqual(f.a,snap.values);
 assert.deepEqual(f.fibers.a,snap.fibers);
 f.restore(snap);
 assert.deepEqual(f.flowCurves,snap.flowCurves);
});
test("archive retains true surgical provenance through JSON backup",()=>{
 const [a,b]=family();
 const entry=addGeneSpecimen([],a,{sequence:1,label:"Real donor"});
 const op=performGeneSurgery(b,a,{operation:"shape",target:1,donorStrand:0});
 const saved=addGeneSpecimen(entry.gallery,op.genome,{
   sequence:2,parents:[{id:entry.record.id,label:entry.record.label}],
   surgery:{operation:"shape",target:1,donorStrand:0,sourceLabel:"Real donor"}
 });
 assert.equal(saved.record.generation,1);
 assert.equal(saved.record.surgery.operation,"shape");
 assert.equal(saved.record.surgery.sourceLabel,"Real donor");
 const bank=serializeGeneBank({geneGallery:saved.gallery,geneNextSequence:3,
   breederParents:family(),breederSeed:12});
 const parsed=parseGeneBank(bank);
 assert.deepEqual(parsed.geneGallery,saved.gallery);
 assert.doesNotMatch(bank,/"values"|"fiberTexture"/);
});
