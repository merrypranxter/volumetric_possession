import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {PigmentField,N} from "../src/field.js";
import {
  normalizeAfterlifeSettings,afterlifeColor,afterlifeEnabled,sampleAfterlifeSegment,
  AFTERLIFE_STYLES
} from "../src/gesture-afterlife.js";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(resolve(root,p),"utf8");

test("palette rhythms remain finite and distinguishable in three true pigment channels",()=>{
  for(const style of AFTERLIFE_STYLES){
    for(const d of [0,.11,.23,.54,3]){
      const ink=afterlifeColor(style,d,1);
      assert.equal(ink.length,3);
      assert.ok(ink.every(v=>Number.isFinite(v)&&v>=0&&v<=.48),style);
    }
    assert.ok(afterlifeColor(style,.11,1).some(v=>v>0));
  }
  assert.notDeepEqual(afterlifeColor("prism",0,1),afterlifeColor("prism",.11,1));
  assert.notDeepEqual(afterlifeColor("prism",0,1),afterlifeColor("aurora",0,1));
  assert.deepEqual(afterlifeColor("ghost",.2,0),[0,0,0]);
});
test("off restores old Stir behavior and all includes only physical edit modes",()=>{
  assert.deepEqual(normalizeAfterlifeSettings({}),{
    target:"stir",style:"prism",strength:1,width:.115
  });
  assert.equal(afterlifeEnabled("off","stir"),false);
  assert.equal(afterlifeEnabled("stir","curve"),false);
  assert.equal(afterlifeEnabled("all","stir"),true);
  assert.equal(afterlifeEnabled("all","curve"),true);
  assert.equal(afterlifeEnabled("all","sculpt"),true);
  assert.equal(afterlifeEnabled("all","orbit"),false);
  assert.equal(afterlifeEnabled("all","neon"),false);
  assert.equal(afterlifeEnabled("all","inject"),false);
});
test("distance samples are event-frequency independent across split strokes",()=>{
  const once={carry:0,travel:0},split={carry:0,travel:0};
  const straight=sampleAfterlifeSegment(once,[0,0,0],[.9,0,0],.075);
  const segmented=[
    ...sampleAfterlifeSegment(split,[0,0,0],[.3,0,0],.075),
    ...sampleAfterlifeSegment(split,[.3,0,0],[.6,0,0],.075),
    ...sampleAfterlifeSegment(split,[.6,0,0],[.9,0,0],.075)
  ];
  assert.equal(straight.length,12);
  assert.equal(segmented.length,12);
  for(let i=0;i<12;i++)assert.ok(Math.abs(straight[i].point[0]-segmented[i].point[0])<1e-6);
  assert.ok(Math.abs(split.travel-.9)<1e-6);
});
test("oversized jumps cap uniform usage but accumulate real travel distance",()=>{
  const state={carry:0,travel:0};
  const dabs=sampleAfterlifeSegment(state,[-1,-1,-1],[1,1,1],.03);
  assert.ok(dabs.length<=12);
  assert.ok(Math.abs(state.travel-Math.sqrt(12))<1e-6);
  assert.ok(dabs.every(d=>d.point.every(v=>v>=-1&&v<=1)));
  assert.throws(()=>sampleAfterlifeSegment(state,[NaN,0,0],[0,0,0],.05),/Invalid/);
});
test("CPU gesture splashes mutate actual 3D dye, survive transport and reverse via scene checkpoint",()=>{
  const volume=new PigmentField(8181);
  volume.forgeMode="off";volume.fiberEnabled=false;
  const x=14,y=14,z=14,point=[x,y,z].map(n=>2*(n+.5)/N-1);
  const idx=4*(x+N*(y+N*z));
  const before=volume.snapshot();
  volume.stampRGB(point,.12,[.2,.11,.3]);
  for(let c=0;c<3;c++)assert.ok(volume.a[idx+c]>before.values[idx+c],String(c));
  volume.step(1/15,1);
  assert.ok(Number.isFinite(volume.a[idx]));
  volume.restore(before);
  for(let c=0;c<4;c++)assert.equal(volume.a[idx+c],before.values[idx+c]);
});
test("GPU queue uses the existing 16 uniform slots; canvas wires trail controls and flush",()=>{
  const gpu=read("src/gpu-transport.js"),main=read("src/main.js"),ui=read("index.html");
  assert.match(gpu,/stampRGB\(p,r,color\)/);
  assert.match(gpu,/uStampPos\[16\],uStampColor\[16\]/);
  assert.match(gpu,/this\.pending\.splice\(0,count\)/);
  assert.match(main,/engine\.stampRGB\(/);
  assert.match(main,/sampleAfterlifeSegment\(/);
  assert.match(main,/if\(active\.afterlifeDeposits\)engine\.flush/);
  assert.match(main,/if\(cancelled\)\{restore\(active\.before\)/);
  for(const id of ["afterlifeTarget","afterlifeStyle","afterlifeStrength","afterlifeStrengthText",
      "afterlifeWidth","afterlifeWidthText"]){
    assert.ok(ui.includes('id="'+id+'"'),id);
  }
});
