import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {bendForceCurve,closestScreenCurve} from "../src/elastic-strand.js";
import {newFlowCurve} from "../src/flow-curve.js";
const base=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=path=>readFileSync(resolve(base,path),"utf8");
const strand=()=>newFlowCurve("coil",Array.from({length:8},(_,i)=>[-.7+i*.2,0,0]),.3,1.4);
test("screen-space contact finds a real arclength position, not merely the nearest handle",()=>{
  const a=strand();
  const hit=closestScreenCurve([a],p=>({x:(p[0]+1)*100,y:(p[1]+1)*100,visible:true}),100,104);
  assert.equal(hit.index,0);
  assert.ok(Math.abs(hit.contact-.5)<.001);
  assert.ok(Math.abs(hit.world[0])<.001);
  assert.equal(closestScreenCurve([a],p=>({x:(p[0]+1)*100,y:100,visible:true}),100,150),null);
});
test("elastic grab changes the actual strand locally and does not mutate parent DNA",()=>{
  const old=strand(),original=JSON.stringify(old),after=bendForceCurve(old,.5,[0,.3,.05],.16,1);
  assert.equal(JSON.stringify(old),original);
  assert.equal(after.type,"coil");assert.equal(after.r,.3);assert.equal(after.strength,1.4);
  assert.equal(after.points.length,8);
  assert.ok(after.points[3][1]>.25);
  assert.ok(after.points[0][1]<.005);
  assert.ok(after.points[7][1]<.005);
});
test("tiny two-point donor can be locally bent while staying below GPU uniform cap",()=>{
  const two=newFlowCurve("stream",[[-.8,0,0],[.8,0,0]]);
  const out=bendForceCurve(two,.5,[0,.3,0],.2,1);
  assert.equal(out.points.length,8);
  assert.ok(out.points[3][1]>.2);
});
test("invalid gesture rejected, valid extreme gestures remain bounded",()=>{
  const old=strand();
  assert.throws(()=>bendForceCurve(old,.5,[NaN,0,0]),/Invalid elastic/);
  assert.throws(()=>bendForceCurve(old,2,[0,0,0]),/Invalid elastic/);
  const out=bendForceCurve(old,.5,[10,10,10],.7,2.5);
  assert.ok(out.points.every(p=>p.every(v=>v>=-.93&&v<=.93)));
});
test("real full-screen tool is wired into the single-gesture transaction",()=>{
  const m=read("src/main.js"),h=read("index.html");
  for(const id of ["curveDragBehavior","curveTugReach","curveTugReachText","curveTugPower","curveTugPowerText"]){
    assert.ok(h.includes('id="'+id+'"'),id);
    assert.ok(m.includes('"'+id+'"'),id);
  }
  assert.match(m,/closestScreenCurve\(/);
  assert.match(m,/bendForceCurve\(/);
  assert.match(m,/snapshotCommand\(active.before\)/);
  assert.match(m,/if\(cancelled\)\{restore\(active.before\)/);
  assert.match(h,/data-mode="curve"/);
});
