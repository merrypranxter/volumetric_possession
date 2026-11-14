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

test("each genesis morphology is deterministic and produces a distinct volume",()=>{
  const kinds=["cathedral","gyroid","trefoil","braid"],volumes=[];
  for(const kind of kinds){
    const a=new PigmentField(303),b=new PigmentField(303);
    a.reset(303,kind);b.reset(303,kind);
    assert.deepEqual(a.a,b.a);
    assert.equal(a.morphology,kind);
    assert.ok(a.a.every(Number.isFinite));
    volumes.push(a.a.slice());
  }
  for(let i=0;i<volumes.length;i++)for(let j=i+1;j<volumes.length;j++){
    let delta=0;
    for(let k=0;k<volumes[i].length;k+=4)delta+=Math.abs(volumes[i][k]-volumes[j][k]);
    assert.ok(delta>10,"genesis "+i+" and "+j+" must be structurally distinct");
  }
});

test("all three baseline motion laws remain divergence-free without user impulses",()=>{
  const f=new PigmentField(91),out=[0,0,0],h=.0002;
  function component(p,i){f.velocity(...p,1,out);return out[i];}
  for(const flow of ["cathedral","beltrami","countercurrent"]){
    f.flow=flow;
    for(const p of [[0,0,0],[.24,-.43,.62],[-.4,.2,-.19]]){
      let div=0;
      for(let i=0;i<3;i++){
        const plus=p.slice(),minus=p.slice();plus[i]+=h;minus[i]-=h;
        div+=(component(plus,i)-component(minus,i))/(2*h);
      }
      assert.ok(Math.abs(div)<.0002,flow+" divergence "+div);
    }
  }
});

test("flow switches preserve dye and clock, and snapshots restore genesis and flow",()=>{
  const f=new PigmentField(515),initial=f.a.slice();
  f.reset(515,"gyroid");
  const state=f.snapshot();
  const existing=f.a.slice();
  f.flow="beltrami";
  assert.deepEqual(f.a,existing);
  f.step(1/15,1);
  f.restore(state);
  assert.equal(f.morphology,"gyroid");
  assert.equal(f.flow,"cathedral");
  assert.deepEqual(f.a,existing);
  assert.notDeepEqual(f.a,initial);
});

test("each flow advects initialized 3D pigment while keeping density finite",()=>{
  for(const mode of ["cathedral","beltrami","countercurrent"]){
    const f=new PigmentField(313),old=f.a.slice();f.flow=mode;
    f.step(1/15,1);
    let diff=0;
    for(let i=0;i<f.a.length;i+=4){
      assert.ok(Number.isFinite(f.a[i]));
      diff+=Math.abs(f.a[i]-old[i]);
    }
    assert.ok(diff>.01,mode+" did not transport material");
  }
});
