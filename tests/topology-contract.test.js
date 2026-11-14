import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(resolve(root,p),"utf8");

test("split and braid are wired to checkpointed selected 3D curves",()=>{
 const s=read("src/main.js");
 assert.match(s,/splitFlowCurve\(curve,selectedHandle\)/);
 assert.match(s,/braidFlowCurve\(curve,Number\(\$\("braidTurns"\)\.value\),Number\(\$\("braidSpread"\)\.value\)\)/);
 assert.match(s,/snapshotCommand\(before\)/);
 assert.match(s,/engine\.flowCurves\.splice\(selectedCurve,1,\.\.\.pair\)/);
});
test("iPhone touch editing selects points and moves only the selected handle",()=>{
 const s=read("src/main.js"),h=read("index.html");
 assert.match(s,/function pickCurveHandle\(event\)/);
 assert.match(s,/curve\.points\[active\.curveHandle\]=next/);
 assert.match(s,/const depth=point\.reduce/);
 assert.match(s,/selectedHandle=handle/);
 assert.match(s,/if\(active\.curveHandle>=0\)/);
 for(const id of ["curveHandleText","splitCurve","braidCurve","braidTurns","braidSpread"]){
  assert.ok(h.includes('id="'+id+'"'));
  assert.ok(s.includes('"'+id+'"'));
 }
});
test("one pair fits old GPU limits with no new volume textures",()=>{
 const shader=read("src/gpu-transport.js");
 assert.match(shader,/uniform vec4 uCurvePoints\[16\],uCurveInfo\[2\]/);
 assert.match(shader,/for\(int ci=0;ci<2;ci\+\+\)/);
 const f=read("src/gpu-fiber-memory.js");
 assert.match(f,/pigment\.slice\(0,split\)\+BODY/);
});
