import test from "node:test";
import assert from "node:assert/strict";
import {PigmentField} from "../src/field.js";
import {resampleStroke,newFlowCurve,cloneFlowCurves,curveVelocity,MAX_CURVES} from "../src/flow-curve.js";
test("long raw stroke becomes bounded 3D geometry; short tap ignored",()=>{
 const raw=Array.from({length:70},(_,i)=>[-.7+i*.02,.24*Math.sin(i*.2),0]);
 const v=resampleStroke(raw);
 assert.equal(v.length,8);assert.deepEqual(v[0],raw[0]);
 assert.deepEqual(resampleStroke([[0,0,0],[.01,0,0]]),[]);
 assert.equal(MAX_CURVES,2);
});
test("stream / coil / gather produce distinct directional velocity",()=>{
 const c=newFlowCurve("stream",[[-.4,0,0],[.4,0,0]]);
 const velocity=t=>curveVelocity([{...c,type:t}],0,.16,0,0,[0,0,0]);
 const a=velocity("stream"),b=velocity("coil"),d=velocity("gather");
 assert.ok(a[0]>.1&&Math.abs(a[1])<1e-8);
 assert.ok(b[2]>.1&&Math.abs(b[0])<1e-8);
 assert.ok(d[1]<-.1&&Math.abs(d[0])<1e-8);
});
test("curves alter actual RGB and fiber memory",()=>{
 const a=new PigmentField(1226),b=new PigmentField(1226);
 a.flowCurves=[newFlowCurve("coil",[[-.65,-.1,.1],[0,.3,.15],[.65,-.1,.1]])];
 for(let i=0;i<5;i++){a.step(1/15,1);b.step(1/15,1);}
 let dye=0,fiber=0;
 for(let i=0;i<a.a.length;i++)dye+=Math.abs(a.a[i]-b.a[i]);
 for(let i=0;i<a.fibers.a.length;i++)fiber+=Math.abs(a.fibers.a[i]-b.fibers.a[i]);
 assert.ok(dye>1&&fiber>1);
});
test("checkpoints independently preserve curves and reset removes them",()=>{
 const f=new PigmentField(41);
 f.flowCurves=[newFlowCurve("gather",[[0,-.3,0],[.2,.4,.1]])];
 const checkpoint=f.snapshot();
 f.flowCurves[0].points[0][0]=.8;
 f.restore(checkpoint);
 assert.deepEqual(f.flowCurves,checkpoint.flowCurves);
 assert.notStrictEqual(f.flowCurves[0].points[0],checkpoint.flowCurves[0].points[0]);
 f.reset(41);assert.deepEqual(f.flowCurves,[]);
});
test("identical seeds and curves reproduce the same state",()=>{
 const a=new PigmentField(53),b=new PigmentField(53);
 a.flowCurves=cloneFlowCurves([newFlowCurve("stream",[[-.5,0,0],[.5,.2,0]])]);
 b.flowCurves=cloneFlowCurves(a.flowCurves);
 for(let i=0;i<3;i++){a.step(1/15,1.2);b.step(1/15,1.2);}
 assert.deepEqual(a.a,b.a);assert.deepEqual(a.fibers.a,b.fibers.a);
});
