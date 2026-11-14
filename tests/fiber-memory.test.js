import test from "node:test";
import assert from "node:assert/strict";
import {PigmentField} from "../src/field.js";
const dt=1/15;
const coherence=f=>{let total=0;for(let i=3;i<f.fibers.a.length;i+=4)total+=f.fibers.a[i];return total;};

test("directional memory starts empty and grows through material motion",()=>{
 const f=new PigmentField(151);assert.equal(coherence(f),0);
 for(let i=0;i<6;i++)f.step(dt,1.4);
 assert.ok(coherence(f)>10);
 assert.ok(f.fibers.a.every(Number.isFinite));
 const pack=f.packFibers();
 assert.ok(pack.some((v,i)=>i%4===3&&v>0));
});
test("fiber guidance changes later RGB pigment transport",()=>{
 const guided=new PigmentField(151),free=new PigmentField(151);
 free.fiberGuidance=0;guided.fiberGuidance=1;
 for(let i=0;i<10;i++){guided.step(dt,1.4);free.step(dt,1.4);}
 let diff=0;for(let i=0;i<guided.a.length;i+=4)for(let j=0;j<3;j++)
  diff+=Math.abs(guided.a[i+j]-free.a[i+j]);
 assert.ok(diff>.1,"guide must alter stored dye, not just optical appearance");
});
test("disabling evolution freezes fibers without stopping RGB",()=>{
 const f=new PigmentField(203);for(let i=0;i<4;i++)f.step(dt,1);
 const old=f.fibers.a.slice(),oldDye=f.a.slice();
 f.fiberEnabled=false;for(let i=0;i<3;i++)f.step(dt,1);
 assert.deepEqual(f.fibers.a,old);
 assert.notDeepEqual(f.a,oldDye);
});
test("checkpoint restores all fiber values and structural controls",()=>{
 const f=new PigmentField(25);for(let i=0;i<4;i++)f.step(dt,1);
 f.fiberGrowth=3.1;f.fiberBend=.4;f.fiberPersistence=.92;f.fiberGuidance=.75;
 const snap=f.snapshot();
 f.fiberEnabled=false;f.fiberBend=0;f.fibers.reset();
 f.restore(snap);
 assert.equal(f.fiberEnabled,true);
 for(const key of ["fiberGrowth","fiberBend","fiberPersistence","fiberGuidance"])
  assert.equal(f[key],snap[key]);
 assert.deepEqual(f.fibers.a,snap.fibers);
});
test("seeded RGB and director history are deterministic",()=>{
 const a=new PigmentField(222),b=new PigmentField(222);
 for(let i=0;i<5;i++){a.step(dt,1.2);b.step(dt,1.2);}
 assert.deepEqual(a.a,b.a);
 assert.deepEqual(a.fibers.a,b.fibers.a);
});
