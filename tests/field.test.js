import test from "node:test";
import assert from "node:assert/strict";
import {PigmentField,N} from "../src/field.js";

test("same seed yields exactly reproducible initial pigment volume",()=>{
  const a=new PigmentField(47),b=new PigmentField(47);
  assert.equal(N,28);
  assert.deepEqual(a.a,b.a);
});

test("advection changes persistent dye rather than just animating the camera",()=>{
  const f=new PigmentField(47),initial=f.a.slice();
  f.step(1/15,1);
  let difference=0;
  for(let i=0;i<f.a.length;i+=4){
    assert.ok(Number.isFinite(f.a[i]));
    assert.ok(f.a[i]>=0&&f.a[i]<=1);
    difference+=Math.abs(f.a[i]-initial[i]);
  }
  assert.ok(difference>0.01,"density should evolve under flow");
});

test("field checkpoint restores all three pigment channels and simulation clock",()=>{
  const f=new PigmentField(2026),before=f.snapshot();
  f.stamp([0,0,0],.25,2);
  f.push([0,0,0],[1,0,0],.22);
  f.step(1/15,1);
  f.restore(before);
  assert.equal(f.time,before.time);
  assert.deepEqual(f.a,before.values);
  assert.equal(f.impulses.length,0);
});

test("unperturbed analytic vortex field has near-zero finite-difference divergence",()=>{
  const f=new PigmentField(100),out=[0,0,0],h=.0002;
  function v(x,y,z){f.velocity(x,y,z,1,out);return out.slice();}
  for(const [x,y,z] of [[0,0,0],[.4,-.2,.6],[-.7,.2,-.45]]){
    const d=(v(x+h,y,z)[0]-v(x-h,y,z)[0]+v(x,y+h,z)[1]-v(x,y-h,z)[1]+v(x,y,z+h)[2]-v(x,y,z-h)[2])/(2*h);
    assert.ok(Math.abs(d)<.0001,"divergence "+d+" at "+[x,y,z]);
  }
});
