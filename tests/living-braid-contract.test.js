import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const src=p=>readFileSync(resolve(root,p),"utf8");

test("CPU caches live geometry outside voxel loop and GPU shares exact same curves",()=>{
 const cpu=src("src/field.js"),gpu=src("src/gpu-transport.js");
 assert.match(cpu,/this\._stepCurves=evaluateLivingCurves\(this\.flowCurves,this\.time\+dt/);
 assert.match(cpu,/curveVelocity\(this\._stepCurves\|\|evaluateLivingCurves/);
 assert.match(gpu,/this\.liveCurves=evaluateLivingCurves\(this\.flowCurves,this\.time\+dt/);
 assert.match(gpu,/flowCurves:this\.liveCurves/);
 assert.match(gpu,/const nCurves=Math\.min\(2,this\.liveCurves\.length\)/);
 assert.match(gpu,/this\.flowCurves=cloneFlowCurves\(source\.flowCurves\|\|\[\]\)/);
});
test("Undo snapshots contain all animation controls in CPU and GPU",()=>{
 const cpu=src("src/field.js"),gpu=src("src/gpu-transport.js");
 for(const key of ["livingMode","livingRate","livingAmount"]){
  assert.ok(cpu.includes(key+":this."+key));
  assert.ok(gpu.includes(key+":this."+key));
 }
 assert.match(cpu,/this\.livingMode=LIVING_MODES\.includes\(s\.livingMode\)/);
 assert.match(gpu,/this\.livingMode=LIVING_MODES\.includes\(s\.livingMode\)/);
});
test("Curve Witch exposes living controls, animated handles and Bake Shape",()=>{
 const html=src("index.html"),main=src("src/main.js");
 for(const id of ["livingMode","livingStatus","livingRate","livingAmount","bakeLiving"]){
  assert.ok(html.includes('id="'+id+'"'),id);
  assert.ok(main.includes('"'+id+'"'),id);
 }
 assert.match(main,/function drawCurveOverlay\(\)/);
 assert.match(main,/const live=displayFlowCurves\(\)/);
 assert.match(main,/engine\.flowCurves=cloneFlowCurves\(posed\)/);
 assert.match(main,/snapshotCommand\(before\)/);
 assert.match(main,/field\.livingMode=engine\.livingMode/);
 assert.match(main,/engine\.livingMode="unravel"/);
});
