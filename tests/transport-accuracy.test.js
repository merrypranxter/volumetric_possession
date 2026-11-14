import test from "node:test";
import assert from "node:assert/strict";
import {PigmentField} from "../src/field.js";

const dt=1/15;

test("midpoint is distinct from Euler, while both evolve finite persistent pigment",()=>{
  for(const flow of ["cathedral","beltrami","countercurrent"]){
    const e=new PigmentField(121),m=new PigmentField(121);
    e.flow=flow;m.flow=flow;m.integration="midpoint";
    const base=e.a.slice();
    e.step(dt,1.4);m.step(dt,1.4);
    let different=0,transported=0;
    for(let i=0;i<e.a.length;i+=4){
      assert.ok(Number.isFinite(e.a[i])&&Number.isFinite(m.a[i]));
      assert.ok(e.a[i]>=0&&e.a[i]<=1&&m.a[i]>=0&&m.a[i]<=1);
      different+=Math.abs(e.a[i]-m.a[i]);
      transported+=Math.abs(e.a[i]-base[i]);
    }
    assert.ok(transported>1,flow+" must transport dye");
    assert.ok(different>.01,flow+" midpoint must differ from Euler");
  }
});

test("flow tracing selection is restored by snapshots without resetting the artwork",()=>{
  const f=new PigmentField(2026);
  f.integration="midpoint";f.flow="beltrami";f.reset(2026,"gyroid");
  const saved=f.snapshot();
  const before=f.a.slice();
  f.integration="euler";f.step(dt,1.5);
  f.restore(saved);
  assert.equal(f.integration,"midpoint");
  assert.equal(f.flow,"beltrami");
  assert.equal(f.morphology,"gyroid");
  assert.deepEqual(f.a,before);
});

test("identical seed, morphology, flow and tracing mode give identical output",()=>{
  const a=new PigmentField(77),b=new PigmentField(77);
  a.reset(77,"braid");b.reset(77,"braid");
  a.integration=b.integration="midpoint";
  a.flow=b.flow="countercurrent";
  for(let i=0;i<3;i++){a.step(dt,.7);b.step(dt,.7);}
  assert.deepEqual(a.a,b.a);
});
