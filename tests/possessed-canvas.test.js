import test from "node:test";
import assert from "node:assert/strict";
import {newFlowCurve} from "../src/flow-curve.js";
import {PigmentField} from "../src/field.js";
import {twistForceCurve,twoFingerTransform,wrappedTurn} from "../src/gesture-twist.js";
import {defaultColorState,cloneColorState,moveColorLens} from "../src/color-control.js";
import {sampleFlowWinding,measureAuthoredWinding,projectWindingDefects} from "../src/flow-winding.js";
const strand=()=>newFlowCurve("coil",Array.from({length:8},(_,i)=>[
 -.7+.2*i,.2*Math.sin(i*.7),.13*Math.cos(i*.4)]),.27,1.4);
test("two-finger rotation genuinely changes authored 3D geometry, never its source",()=>{
 const src=strand(),old=JSON.stringify(src),edited=twistForceCurve(src,[0,0,-1],1.2,1.3);
 assert.equal(edited.type,src.type);assert.equal(edited.strength,src.strength);
 assert.ok(edited.points.some((p,i)=>p.some((v,k)=>Math.abs(v-src.points[i][k])>.01)));
 assert.ok(Math.abs(edited.r-.351)<1e-8);
 assert.equal(JSON.stringify(src),old);
});
test("zero twist and unit pinch preserve geometry; zero vector axis is rejected",()=>{
 const source=strand(),same=twistForceCurve(source,[0,0,-1],0,1);
 assert.ok(same.points.every((p,i)=>p.every((v,j)=>Math.abs(v-source.points[i][j])<1e-10)));
 assert.equal(same.r,source.r);
 assert.throws(()=>twistForceCurve(source,[0,0,0],1,1),/nonzero/);
 assert.throws(()=>twistForceCurve(source,[0,0,1],1,-1),/Invalid gesture/);
});
test("twists clamp all points to world cube and radius to GPU supported range",()=>{
 const extreme=twistForceCurve(strand(),[.2,.8,.5],500,500);
 assert.ok(extreme.points.every(p=>p.every(v=>Number.isFinite(v)&&v>=-.93&&v<=.93)));
 assert.equal(extreme.r,.65);
});
test("two-pointer gesture angle wraps around ±pi without a 2pi discontinuity",()=>{
 const value=twoFingerTransform([{x:100,y:60},{x:140,y:80}]);
 assert.ok(value.span>40&&value.center.x===120&&value.center.y===70);
 assert.ok(Math.abs(wrappedTurn(-Math.PI+.01,Math.PI-.01)-.02)<1e-10);
 assert.throws(()=>twoFingerTransform([{x:0,y:0}]),/Two pointers/);
});
test("default color grading is exact off, lenses clamp in screen UV",()=>{
 const original=defaultColorState(),before=JSON.stringify(original);
 const lens=moveColorLens(original,240,150,{left:0,top:0,width:320,height:600});
 assert.equal(original.neon,0);assert.equal(JSON.stringify(original),before);
 assert.equal(lens.mode,"lens");assert.equal(lens.neon,1);
 assert.deepEqual(lens.lens,[.75,.75]);
 const max=cloneColorState({...lens,neon:10,radius:99,lens:[-1,3],defectGlow:20});
 assert.deepEqual([max.neon,max.radius,max.defectGlow,max.lens],[2,.85,2,[0,1]]);
});
test("phase winding measures index +1 for a vortex and -1 for a saddle",()=>{
 const vortex=sampleFlowWinding((x,y)=>[-y,x]);
 const saddle=sampleFlowWinding((x,y)=>[x,-y]);
 assert.equal(vortex.length,1);
 assert.equal(vortex[0].charge,1);
 assert.equal(saddle.length,1);
 assert.equal(saddle[0].charge,-1);
 // Reversing circulation does NOT reverse index (index ≠ vorticity sign).
 assert.equal(sampleFlowWinding((x,y)=>[y,-x])[0].charge,1);
 assert.equal(sampleFlowWinding(()=>[1,0]).length,0);
});
test("winding detector rejects invalid grid and unresolved low-speed samples",()=>{
 assert.throws(()=>sampleFlowWinding(()=>[1,0],4),/Invalid winding grid/);
 assert.equal(sampleFlowWinding((x,y)=>[-1e-5*y,1e-5*x]).length,0);
 assert.equal(measureAuthoredWinding([],[],0).length,0);
});
test("projection keeps defect sign and respects the six-marker shader cap",()=>{
 const charges=Array.from({length:9},(_,i)=>({x:i/12,y:0,z:0,charge:i%2?-1:1}));
 const projected=projectWindingDefects(charges,p=>({x:.5+p[0],y:.2,visible:true}));
 assert.equal(projected.length,6);
 assert.deepEqual(projected[0],{uv:[.5,.8],charge:1});
 assert.equal(projected[1].charge,-1);
});
test("color rendering state is scene-checkpointed without changing material",()=>{
 const field=new PigmentField(77);
 for(let i=0;i<2;i++)field.step(1/15,1);
 const before=field.a.slice(),fibers=field.fibers.a.slice();
 field.colorGrade=cloneColorState({neon:1.6,mode:"lens",lens:[.15,.65],
   radius:.19,defectGlow:1.2});
 const snap=field.snapshot();
 field.colorGrade=defaultColorState();field.restore(snap);
 assert.deepEqual(field.colorGrade,snap.colorGrade);
 assert.deepEqual(field.a,before);assert.deepEqual(field.fibers.a,fibers);
 field.reset(78);
 assert.equal(field.colorGrade.neon,1.6);
});
