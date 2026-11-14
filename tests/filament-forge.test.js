import test from "node:test";
import assert from "node:assert/strict";
import {PigmentField} from "../src/field.js";
import {FORGE_MODES,forgeAt,forgePhase} from "../src/filament-forge.js";
const dt=1/15;
const mass=f=>{let v=0;for(let i=0;i<f.a.length;i+=4)v+=f.a[i]+f.a[i+1]+f.a[i+2];return v;};
const diff=(a,b)=>{let v=0;for(let i=0;i<a.a.length;i+=4)for(let c=0;c<3;c++)v+=Math.abs(a.a[i+c]-b.a[i+c]);return v;};

test("Off gives exactly the same dye as disabled growth",()=>{
 const a=new PigmentField(1226),b=new PigmentField(1226);
 a.forgeMode="off";b.forgePower=0;a.step(dt,1);b.step(dt,1);
 assert.deepEqual(a.a,b.a);
});
test("helix, rosette, gyroid generate distinct permanent RGB pigment",()=>{
 const off=new PigmentField(1226);off.forgeMode="off";off.step(dt,1);
 const results=new Map();
 for(const mode of FORGE_MODES.filter(v=>v!=="off")){
   const f=new PigmentField(1226);f.forgeMode=mode;f.step(dt,1);
   assert.ok(mass(f)-mass(off)>10);
   results.set(mode,f);
 }
 for(const x of results.keys())for(const y of results.keys())if(x<y)
   assert.ok(diff(results.get(x),results.get(y))>1);
});
test("source switching preserves material, with undoable source DNA",()=>{
 const f=new PigmentField(31);
 f.step(dt,1);
 const prior=f.a.slice();f.forgeMode="helix";
 assert.deepEqual(f.a,prior);
 f.forgePower=1.3;f.forgeWidth=.26;f.forgePace=1.4;
 const checkpoint=f.snapshot();f.step(dt,1);
 f.forgeMode="off";f.restore(checkpoint);
 assert.equal(f.forgeMode,"helix");assert.equal(f.forgePower,1.3);
 assert.equal(f.forgeWidth,.26);assert.equal(f.forgePace,1.4);
 assert.deepEqual(f.a,checkpoint.values);
});
test("motion affects real 3D source positions",()=>{
 const a=[0,0,0],b=[0,0,0];
 forgeAt("rosette",.4,.1,.2,forgePhase(0,1,42),.17,a);
 forgeAt("rosette",.4,.1,.2,forgePhase(7,1,42),.17,b);
 assert.ok(a.some((v,i)=>Math.abs(v-b[i])>.01));
 assert.throws(()=>forgeAt("unknown",0,0,0,0,.17,a),/Unknown/);
});
test("maximum gyroid growth remains finite and bounded",()=>{
 const f=new PigmentField(71);f.forgeMode="gyroid";f.forgePower=2;
 for(let i=0;i<7;i++)f.step(dt,1);
 assert.ok(f.a.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
});
