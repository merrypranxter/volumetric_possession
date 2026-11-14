import test from "node:test";
import assert from "node:assert/strict";
import {newFlowCurve,curveVelocity} from "../src/flow-curve.js";
import {splitFlowCurve,braidFlowCurve} from "../src/curve-topology.js";
import {PigmentField} from "../src/field.js";

const spine=Array.from({length:8},(_,i)=>[-.65+1.3*i/7,.21*Math.sin(i*.6),.08*Math.cos(i*.43)]);
const starting=()=>newFlowCurve("coil",spine,.25,1.6);
const separation=(a,b)=>a.points.map((p,i)=>Math.hypot(...p.map((v,k)=>v-b.points[i][k])));

test("split at one interior handle keeps both original sections and the junction",()=>{
 const original=starting(),old=original.points.map(p=>p.slice());
 const [left,right]=splitFlowCurve(original,3);
 assert.equal(left.points.length,4);assert.equal(right.points.length,5);
 assert.deepEqual(left.points.at(-1),right.points[0]);
 assert.deepEqual(left.points[0],old[0]);assert.deepEqual(right.points.at(-1),old.at(-1));
 assert.deepEqual(original.points,old);
 assert.notStrictEqual(original.points[3],left.points[3]);
});
test("endpoints cannot split, and no invalid curve geometry can be created",()=>{
 for(const point of [-1,0,7,8,3.4]){
   assert.throws(()=>splitFlowCurve(starting(),point),/Split requires an interior/);
 }
});
test("braid creates two independent finite three-dimensional strands, no new GPU budget",()=>{
 const original=starting(),[a,b]=braidFlowCurve(original,2.5,.13);
 assert.equal(a.points.length,8);assert.equal(b.points.length,8);
 assert.ok(a.points.every(p=>p.length===3&&p.every(Number.isFinite)));
 assert.ok(b.points.every(p=>p.length===3&&p.every(Number.isFinite)));
 assert.ok(Math.min(...separation(a,b))>.15);
 assert.equal(a.strength+b.strength,original.strength);
 assert.deepEqual(original.points,spine);
 assert.notStrictEqual(a.points[0],b.points[0]);
});
test("braid parameters change real geometry, not an optical-only overlay",()=>{
 const [a,b]=braidFlowCurve(starting(),2.5,.13);
 const [c,d]=braidFlowCurve(starting(),3.5,.17);
 const result=[a,b].map(x=>x.points).flat(2);
 const other=[c,d].map(x=>x.points).flat(2);
 let difference=0;for(let i=0;i<result.length;i++)difference+=Math.abs(result[i]-other[i]);
 assert.ok(difference>.2);
 const origin=curveVelocity([starting()],0,.1,0,0,[0,0,0]);
 const braided=curveVelocity([a,b],0,.1,0,0,[0,0,0]);
 assert.ok(Math.hypot(...origin.map((v,i)=>v-braided[i]))>.01);
});
test("braid cannot create degenerate or unbounded source shapes",()=>{
 assert.throws(()=>braidFlowCurve(starting(),0,.13),/Braid turns/);
 assert.throws(()=>braidFlowCurve(starting(),2.5,1),/Braid spacing/);
 const tiny=newFlowCurve("stream",[[0,0,0],[0,.01,0]]);
 assert.throws(()=>braidFlowCurve(tiny,2,.1),/too short/);
});
test("topology edits change future material without replacing past simulation state",()=>{
 const f=new PigmentField(91);
 for(let i=0;i<2;i++)f.step(1/15,1);
 const existing=f.a.slice(),existingFiber=f.fibers.a.slice();
 f.flowCurves=[starting()];
 const checkpoint=f.snapshot();
 f.flowCurves=braidFlowCurve(f.flowCurves[0],2.5,.13);
 assert.deepEqual(f.a,existing);
 assert.deepEqual(f.fibers.a,existingFiber);
 f.step(1/15,1);
 assert.notDeepEqual(f.a,existing);
 f.restore(checkpoint);
 assert.deepEqual(f.flowCurves,checkpoint.flowCurves);
 assert.deepEqual(f.a,existing);
 assert.deepEqual(f.fibers.a,existingFiber);
});
