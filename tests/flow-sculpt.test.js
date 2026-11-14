import test from "node:test";
import assert from "node:assert/strict";
import {PigmentField} from "../src/field.js";
import {newSculptNode,cloneSculptNodes,sculptVelocity,summonSculptTriad,MAX_SCULPT_NODES} from "../src/flow-sculpt.js";
import {cameraVectors,projectToScreen,pointFromScreen} from "../src/render.js";

const dt=1/15;
const v=(nodes,x,y,z,t=1)=>sculptVelocity(nodes,x,y,z,t,[0,0,0]);

test("sculpt types are distinct math fields and fade with distance",()=>{
 const samples={};
 for(const type of ["vortex","pull","push"]){
  const n=newSculptNode(type,[0,0,0],.3,1.5,.1);
  samples[type]=v([n],.22,.1,.09);
  assert.ok(samples[type].every(Number.isFinite));
  assert.ok(Math.hypot(...samples[type])>.01);
  assert.deepEqual(v([n],1,1,1),[0,0,0]);
 }
 assert.ok(samples.vortex[1]===0);
 assert.ok(samples.pull[0]<0&&samples.push[0]>0);
 assert.ok(samples.pull[1]<0&&samples.push[1]>0);
});

test("whirlpool is locally divergence-free",()=>{
 const node=newSculptNode("vortex",[0,0,0],.37,1.2,.4);
 const x=.2,y=.09,z=-.16,h=.00015;
 const a=(v([node],x+h,y,z)[0]-v([node],x-h,y,z)[0])/(2*h);
 const b=(v([node],x,y+h,z)[1]-v([node],x,y-h,z)[1])/(2*h);
 const c=(v([node],x,y,z+h)[2]-v([node],x,y,z-h)[2])/(2*h);
 assert.ok(Math.abs(a+b+c)<.00002);
});

test("persistent anchors change RGB dye and fiber-memory history",()=>{
 const off=new PigmentField(1226),on=new PigmentField(1226);
 on.sculptNodes=summonSculptTriad();
 for(let i=0;i<6;i++){off.step(dt,1);on.step(dt,1);}
 let pigmentDiff=0,fiberDiff=0;
 for(let i=0;i<on.a.length;i++)pigmentDiff+=Math.abs(on.a[i]-off.a[i]);
 for(let i=0;i<on.fibers.a.length;i++)fiberDiff+=Math.abs(on.fibers.a[i]-off.fibers.a[i]);
 assert.ok(pigmentDiff>1);
 assert.ok(fiberDiff>1);
 assert.ok(on.a.every(Number.isFinite)&&on.fibers.a.every(Number.isFinite));
});

test("undo checkpoints deep copy nodes; reset clears them",()=>{
 const f=new PigmentField(1226);
 f.sculptNodes=summonSculptTriad();
 const snap=f.snapshot();
 f.sculptNodes[0].p[0]=.82;
 f.sculptNodes.pop();
 assert.equal(snap.sculptNodes.length,3);
 assert.equal(snap.sculptNodes[0].p[0],-.42);
 f.restore(snap);
 assert.deepEqual(f.sculptNodes,snap.sculptNodes);
 assert.notStrictEqual(f.sculptNodes[0],snap.sculptNodes[0]);
 f.reset(1226,"cathedral");
 assert.equal(f.sculptNodes.length,0);
 assert.equal(cloneSculptNodes(snap.sculptNodes).length,3);
 assert.equal(MAX_SCULPT_NODES,6);
});

test("same nodes and seed produce deterministic dye and fibers",()=>{
 const a=new PigmentField(41),b=new PigmentField(41);
 a.sculptNodes=b.sculptNodes=summonSculptTriad();
 for(let i=0;i<4;i++){a.step(dt,1.1);b.step(dt,1.1);}
 assert.deepEqual(a.a,b.a);
 assert.deepEqual(a.fibers.a,b.fibers.a);
});

test("touch placement and visible node projection use the same 3D camera",()=>{
 const camera={azimuth:.62,elevation:.23,distance:1.95};
 for(const [width,height] of [[393,852],[874,402]]){
  const canvas={getBoundingClientRect:()=>({left:10,top:19,width,height})};
  for(const target of [[.25,-.12,.1],[-.48,.28,-.29],[0,0,0]]){
   const screen=projectToScreen(canvas,camera,target);
   assert.ok(screen?.visible);
   const forward=cameraVectors(camera).forward;
   const depth=target.reduce((sum,x,i)=>sum+x*forward[i],0);
   const recovered=pointFromScreen(canvas,camera,{clientX:10+screen.x,clientY:19+screen.y},depth).point;
   assert.ok(Math.hypot(...recovered.map((x,i)=>x-target[i]))<1.e-8);
  }
 }
});
