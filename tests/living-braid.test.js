import test from "node:test";
import assert from "node:assert/strict";
import {PigmentField} from "../src/field.js";
import {newFlowCurve,cloneFlowCurves} from "../src/flow-curve.js";
import {braidFlowCurve} from "../src/curve-topology.js";
import {LIVING_MODES,evaluateLivingCurves} from "../src/living-braid.js";

const spine=()=>newFlowCurve("coil",Array.from({length:8},(_,i)=>
 [-.65+1.3*i/7,.21*Math.sin(i*.6),.08*Math.cos(i*.43)]),.25,1.6);
const pair=()=>braidFlowCurve(spine(),2.5,.13);
const difference=(a,b)=>a.reduce((sum,c,i)=>sum+c.points.reduce(
 (v,p,j)=>v+Math.hypot(...p.map((x,k)=>x-b[i].points[j][k])),0),0);

test("Still mode is exactly backward-compatible and never edits source controls",()=>{
 const curves=pair(),original=JSON.stringify(curves);
 assert.strictEqual(evaluateLivingCurves(curves,42,"still",.65,.18),curves);
 assert.strictEqual(evaluateLivingCurves(curves,42,"writhe",.65,0),curves);
 assert.equal(JSON.stringify(curves),original);
});
test("four living modes move genuine bounded 3D curve geometry",()=>{
 const curves=pair(),original=JSON.stringify(curves);
 for(const mode of LIVING_MODES.filter(m=>m!=="still")){
   const start=evaluateLivingCurves(curves,0,mode,.65,.18);
   const middle=evaluateLivingCurves(curves,5,mode,.65,.18);
   assert.equal(middle.length,2);
   assert.ok(difference(start,middle)>.01,mode+" should move");
   assert.ok(middle.every(c=>c.points.length>=2&&c.points.length<=8&&
     c.points.every(p=>p.length===3&&p.every(v=>Number.isFinite(v)&&v>=-.93&&v<=.93))));
 }
 assert.equal(JSON.stringify(curves),original);
});
test("evolution repeats deterministically after one 8/rate cycle",()=>{
 const curves=pair(),rate=.65;
 for(const mode of ["writhe","grow","unravel","reconnect"]){
   const a=evaluateLivingCurves(curves,0,mode,rate,.18);
   const b=evaluateLivingCurves(curves,8/rate,mode,rate,.18);
   assert.ok(difference(a,b)<1e-7,mode);
   assert.deepEqual(evaluateLivingCurves(curves,3,mode,rate,.18),
                    evaluateLivingCurves(curves,3,mode,rate,.18));
 }
});
test("paired operations don't secretly become another effect with only one curve",()=>{
 const a=[spine()];
 for(const mode of ["unravel","reconnect"])assert.deepEqual(
   evaluateLivingCurves(a,5,mode,.65,.18),a);
});
test("reconnect transfers endpoints of both paths before the cycle reverses",()=>{
 const curves=pair();
 const swapped=evaluateLivingCurves(curves,4/.65,"reconnect",.65,.18);
 const initial=curves.map(c=>c.points.at(-1));
 assert.ok(Math.hypot(...swapped[0].points.at(-1).map((v,i)=>v-initial[1][i]))<1e-8);
 assert.ok(Math.hypot(...swapped[1].points.at(-1).map((v,i)=>v-initial[0][i]))<1e-8);
});
test("live forces modify RGB and fibers but preserve authored points and snapshots",()=>{
 const animated=new PigmentField(123),still=new PigmentField(123),repeated=new PigmentField(123);
 for(const f of [animated,still,repeated]){
  f.flowCurves=cloneFlowCurves(pair());
  f.livingRate=.65;f.livingAmount=.18;
 }
 animated.livingMode="unravel";repeated.livingMode="unravel";
 const original=JSON.stringify(animated.flowCurves);
 for(let i=0;i<6;i++){animated.step(1/15,1.1);still.step(1/15,1.1);repeated.step(1/15,1.1);}
 let dye=0,fibers=0;
 for(let i=0;i<animated.a.length;i++)dye+=Math.abs(animated.a[i]-still.a[i]);
 for(let i=0;i<animated.fibers.a.length;i++)fibers+=Math.abs(animated.fibers.a[i]-still.fibers.a[i]);
 assert.ok(dye>.01&&fibers>.01);
 assert.equal(JSON.stringify(animated.flowCurves),original);
 assert.deepEqual(animated.a,repeated.a);
 assert.deepEqual(animated.fibers.a,repeated.fibers.a);
 const snap=animated.snapshot();
 animated.livingMode="reconnect";animated.livingRate=1.5;animated.flowCurves.pop();
 animated.restore(snap);
 assert.equal(animated.livingMode,"unravel");assert.equal(animated.livingRate,.65);
 assert.deepEqual(animated.flowCurves,snap.flowCurves);
 assert.deepEqual(animated.a,snap.values);assert.deepEqual(animated.fibers.a,snap.fibers);
 assert.equal(animated._stepCurves,null);
});
