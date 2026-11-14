import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(resolve(root,p),"utf8");
test("GPU forge uniforms and dt=0 stamp-flush safety",()=>{
 const gpu=read("src/gpu-transport.js");
 for(const key of ["uForgeMode","uForgePower","uForgeWidth","uForgePace"]){
   assert.ok(gpu.includes(key));
   assert.ok(gpu.includes("U."+key));
 }
 assert.match(gpu,/uForgeMode>0&&uForgePower>0\.0&&uDt>0\.0/);
 assert.match(gpu,/dye\+=uDt\*uForgePower\*feed/);
 assert.match(gpu,/result\[c\]=\.13\*exp\(-delta\*delta\)\*envelope/);
 assert.match(gpu,/forgeMode:this\.forgeMode/);
});
test("Forge controls are live, included in structural checkpoints, and match UI",()=>{
 const main=read("src/main.js"),html=read("index.html");
 for(const id of ["forgeMode","forgePower","forgeWidth","forgePace"]){
  assert.ok(html.includes('id="'+id+'"'));assert.ok(main.includes('"'+id+'"'));
 }
 assert.match(main,/structuralControls\.includes\(id\)/);
 assert.match(main,/snapshotCommand\(before\)/);
 assert.match(main,/field\.forgeMode=engine\.forgeMode/);
});
