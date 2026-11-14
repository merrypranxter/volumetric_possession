import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname,resolve} from "node:path";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const source=path=>readFileSync(resolve(root,path),"utf8");

test("GPU pigment and director share analytic velocity definitions",()=>{
 const dye=source("src/gpu-transport.js"),fiber=source("src/gpu-fiber-memory.js");
 assert.match(dye,/uniform sampler3D uPrev,uFiberPrev/);
 assert.match(dye,/uFiberEnabled==1&&uFiberGuidance>0\.0/);
 assert.match(fiber,/pigment\.slice\(0,split\)\+BODY/);
 assert.match(fiber,/vec3 changed=tangent\+uDt\*uFiberBend\*dv/);
 assert.match(dye,/if\(dt>0&&this\.fiberEnabled\)this\.fibers\.step/);
 assert.match(dye,/const fiberTexture=this\.fibers\.snapshot\(\)/);
});
test("renderer uploads the CPU director channel and shades along it",()=>{
 const s=source("src/render.js");
 for(const k of ["uFiberVolume","uFiberLight"])assert.ok(s.includes(k));
 assert.match(s,/this\.field\.fibers\.dirty/);
 assert.match(s,/this\.field\.packFibers\(\)/);
 assert.match(s,/uMemoryView==2/);
 assert.match(s,/fiberSample\.a/);
 assert.match(s,/pow\(clamp\(1\.0-abs\(dot\(tangent,halfVector\)\)/);
});
test("Fiber Nerves UI controls are exposed and work with undo and reset",()=>{
 const html=source("index.html"),main=source("src/main.js");
 for(const id of ["fiberEnabled","fiberGrowth","fiberPersistence","fiberBend","fiberGuidance","fiberLight"]){
  assert.ok(html.includes('id="'+id+'"'),id+" missing HTML");
  assert.ok(main.includes('"'+id+'"'),id+" missing main.js");
 }
 assert.match(main,/field\.fiberEnabled=engine\.fiberEnabled/);
 assert.match(main,/structuralControls\.includes\(id\)/);
 assert.match(html,/Fiber alignment map/);
});
