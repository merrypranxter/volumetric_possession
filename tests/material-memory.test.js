import test from "node:test";
import assert from "node:assert/strict";
import {PigmentField} from "../src/field.js";

const dt=1/15;
const historySum=f=>{let total=0;for(let i=3;i<f.a.length;i+=4)total+=f.a[i];return total;};

test("fold-memory starts empty, and disabled writing never invents a fold",()=>{
  const f=new PigmentField(500);
  assert.equal(historySum(f),0);
  f.foldWrite=0;
  for(let i=0;i<5;i++)f.step(dt,1);
  assert.equal(historySum(f),0);
});

test("interface folds accumulate, persist, and survive history snapshots",()=>{
  const f=new PigmentField(500);f.foldWrite=2.6;f.integration="midpoint";
  for(let i=0;i<5;i++)f.step(dt,1);
  assert.ok(historySum(f)>1);
  const alphaBytes=f.pack().filter((_,i)=>i%4===3);
  assert.ok(alphaBytes.some(v=>v>0)&&alphaBytes.some(v=>v<255));
  const snap=f.snapshot();
  f.foldWrite=0;f.foldPersistence=0;f.foldGrip=1;f.step(dt,1);
  f.restore(snap);
  assert.equal(f.foldWrite,2.6);
  assert.equal(f.foldPersistence,.8);
  assert.equal(f.foldGrip,.35);
  assert.deepEqual(f.a,snap.values);
});

test("older material remembers longer at higher persistence",()=>{
  const high=new PigmentField(100),low=new PigmentField(100);
  high.foldWrite=low.foldWrite=3;
  for(let i=0;i<4;i++){high.step(dt,1);low.step(dt,1);}
  high.foldWrite=low.foldWrite=0;
  high.foldGrip=low.foldGrip=0;high.foldPersistence=1;low.foldPersistence=0;
  for(let i=0;i<8;i++){high.step(dt,0);low.step(dt,0);}
  assert.ok(historySum(high)>historySum(low)*1.1);
});

test("fold grip alters later RGB transport; memory is not only a shading mask",()=>{
  const sticky=new PigmentField(500),free=new PigmentField(500);
  sticky.foldWrite=free.foldWrite=2.6;sticky.foldGrip=1;free.foldGrip=0;
  for(let i=0;i<5;i++){sticky.step(dt,1);free.step(dt,1);}
  let diff=0;
  for(let i=0;i<sticky.a.length;i+=4){
    for(let channel=0;channel<3;channel++)diff+=Math.abs(sticky.a[i+channel]-free.a[i+channel]);
  }
  assert.ok(diff>.1,"old fold history must feed back on RGB trajectories");
});

test("memory evolution is deterministic with fixed seed and parameters",()=>{
  const a=new PigmentField(121),b=new PigmentField(121);
  a.reset(121,"gyroid");b.reset(121,"gyroid");
  a.foldWrite=b.foldWrite=2.1;a.foldPersistence=b.foldPersistence=.95;
  a.foldGrip=b.foldGrip=.6;
  for(let i=0;i<3;i++){a.step(dt,1.2);b.step(dt,1.2);}
  assert.deepEqual(a.a,b.a);
});
