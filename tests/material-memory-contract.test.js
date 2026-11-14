import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const src=p=>readFileSync(resolve(root,p),"utf8");

test("GPU shader carries historical memory in the RGBA8 alpha channel",()=>{
  const gpu=src("src/gpu-transport.js");
  assert.match(gpu,/uniform float uFoldWrite,uFoldPersistence,uFoldGrip;/);
  assert.match(gpu,/vec4 previous=texture\(uPrev,back\*\.5\+\.5\);/);
  assert.match(gpu,/previous\.a\*decay/);
  assert.match(gpu,/texelFetch\(uPrev,cell,0\)\.a/);
  assert.match(gpu,/fragColor=vec4\(clamp\(dye,0\.0,1\.0\),fold\)/);
  for(const name of ["uFoldWrite","uFoldPersistence","uFoldGrip"]){
    assert.ok(gpu.includes('gl.uniform1f(U.'+name+',this.'+name.slice(1,2).toLowerCase()+name.slice(2)+')'));
  }
});

test("CPU uploads stored alpha and the renderer visibly reads it",()=>{
  const cpu=src("src/field.js"),render=src("src/render.js");
  assert.match(cpu,/out\[i\+3\]=clamp\(Math\.round\(a\[i\+3\]\*255\),0,255\)/);
  assert.match(render,/vec4 sampleData=texture\(uVolume,sampleUV\);/);
  assert.match(render,/sampleData\.a\*uFoldGlow/);
  assert.match(render,/uniform1f\(U\.uFoldGlow,opts\.foldGlow\?\?1\)/);
  assert.match(render,/uniform1i\(U\.uMemoryView,opts\.memoryView\|\|0\)/);
});

test("interface exposes fold formation, persistence, grip, optical shine and memory inspection",()=>{
  const html=src("index.html"),main=src("src/main.js");
  for(const id of ["foldWrite","foldPersistence","foldGrip","foldGlow","memoryView"]){
    assert.ok(html.includes('id="'+id+'"'));
    assert.ok(main.includes('"'+id+'"'));
  }
  assert.match(main,/foldEditDrafts\.set\(id,engine\.snapshot\(\)\)/);
  assert.match(main,/snapshotCommand\(original\)/);
});
