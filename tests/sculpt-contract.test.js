import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(resolve(root,p),"utf8");

test("sculpt force declarations are shared by dye and fiber GLSL passes",()=>{
 const dye=read("src/gpu-transport.js"),fiber=read("src/gpu-fiber-memory.js");
 for(const name of ["uSculptCount","uSculptPos","uSculptInfo"]){
  assert.ok(dye.includes(name));assert.ok(fiber.includes("U."+name));
 }
 assert.match(dye,/for\(int i=0;i<6;i\+\+\)/);
 assert.match(dye,/uSculptInfo\[6\]/);
 assert.match(fiber,/pigment\.slice\(0,split\)\+BODY/);
});
test("sculpt positions and independent force strengths are GPU checkpointed",()=>{
 const gpu=read("src/gpu-transport.js"),cpu=read("src/field.js");
 assert.match(gpu,/sculptNodes:cloneSculptNodes\(this\.sculptNodes\)/);
 assert.match(gpu,/this\.sculptNodes=cloneSculptNodes\(s\.sculptNodes\|\|\[\]\)/);
 assert.match(gpu,/this\.sculptNodes=cloneSculptNodes\(source\.sculptNodes\|\|\[\]\)/);
 assert.match(cpu,/sculptVelocity\(this\.sculptNodes,x,y,z,t,out\)/);
 assert.match(cpu,/sculptNodes:cloneSculptNodes\(this\.sculptNodes\)/);
});
test("mobile sculpt tool, markers and undo controls are connected",()=>{
 const ui=read("index.html"),main=read("src/main.js"),render=read("src/render.js");
 for(const id of ["sculptMarkers","sculptType","sculptStrength","sculptRadius","summonTriad","removeSculpt","clearSculpt"]){
  assert.ok(ui.includes('id="'+id+'"'));assert.ok(main.includes('"'+id+'"'));
 }
 assert.match(ui,/data-mode="sculpt"/);
 assert.match(main,/mode==="sculpt"/);
 assert.match(main,/sculptIndex/);
 assert.match(main,/snapshotCommand\(active\.before\)/);
 assert.match(render,/export function projectToScreen/);
});
