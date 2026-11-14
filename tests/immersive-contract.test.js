import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname,resolve} from "node:path";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const src=name=>readFileSync(resolve(root,name),"utf8");

test("full-screen canvas and opt-in art-only interface are wired",()=>{
  const html=src("index.html"),app=src("src/main.js");
  assert.match(html,/\.stage\{position:fixed;inset:0/);
  assert.match(html,/\.frame\{position:absolute;inset:0/);
  assert.match(html,/body\.art-only header,body\.art-only \.dock/);
  for(const id of ["controlsToggle","dockDetails","zoomIn","zoomOut","fitView","artOnly","returnUI"]){
    assert.ok(html.includes('id="'+id+'"'),id+" UI missing");
    assert.ok(app.includes('"'+id+'"'),id+" handler missing");
  }
  assert.match(app,/IMMERSIVE_DISTANCE=1\.95/);
  assert.match(app,/touches\.size>=2/);
  assert.match(app,/pinchSpan\/span/);
});
test("real dye interfaces and existing fold memory drive new optical detail",()=>{
  const shader=src("src/render.js"),app=src("src/main.js");
  for(const uniform of ["uCover","uWisp","uPrism"]){
    assert.ok(shader.includes(uniform),"missing "+uniform);
  }
  assert.match(shader,/edgeFade=smoothstep\(0\.0,\.32,boundary\)/);
  assert.match(shader,/vec3 neighborDye=texture\(uVolume,neighborUV\)\.rgb/);
  assert.match(shader,/gl\.uniform1f\(U\.uWisp,opts\.wisp\?\?0\)/);
  assert.match(shader,/gl\.uniform1f\(U\.uPrism,opts\.prism\?\?0\)/);
  assert.match(app,/field\.turbulence=\.6/);
});
