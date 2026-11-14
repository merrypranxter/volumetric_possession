import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(resolve(root,p),"utf8");
test("canvas has explicit direct neon tool and accessible color controls",()=>{
 const h=read("index.html"),s=read("src/main.js");
 for(const id of ["colorLensMarker","neonIntensity","neonIntensityText",
   "neonMode","neonRadius","neonRadiusText","windingGlow",
   "windingGlowText","flowWindingReport"]){
  assert.ok(h.includes('id="'+id+'"'),id);
  assert.ok(s.includes('"'+id+'"'),id);
 }
 assert.match(h,/data-mode="neon"/);
 assert.match(s,/moveColorLens\(engine\.colorGrade/);
});
test("two-finger curve editing is semantic, atomic and cancellable",()=>{
 const m=read("src/main.js");
 assert.match(m,/twistForceCurve\(/);
 assert.match(m,/twoFingerTransform\(/);
 assert.match(m,/pinchEdit=\{kind:"curve"/);
 assert.match(m,/snapshotCommand\(gesture\.before\)/);
 assert.match(m,/if\(cancelled\)/);
 assert.match(m,/cancelActiveGesture\(\)/);
 assert.match(m,/pointercancel/);
 assert.match(m,/lostpointercapture/);
});
test("read-only color stage defaults off and has protected OKLab gamut search",()=>{
 const r=read("src/render.js"),c=read("src/color-control.js");
 assert.match(r,/if\(uNeon>\.001\)encoded=gradeNeon/);
 assert.match(r,/labFromLinear\(toLinear/);
 assert.match(r,/for\(int i=0;i<7;i\+\+\)/);
 assert.match(r,/vec3 encoded=pow\(max\(color,vec3\(0\.0\)\),vec3\(\.82\)\)/);
 assert.match(c,/neon:0,mode:"full"/);
});
test("winding comes from an authored vector field and remains a 2D index",()=>{
 const w=read("src/flow-winding.js"),r=read("src/render.js");
 assert.match(w,/curveVelocity\(curves\|\|\[\],x,y,0,time,velocity\)/);
 assert.match(w,/sculptVelocity\(nodes\|\|\[\],x,y,0,time,velocity\)/);
 assert.match(w,/Math\.round\(winding\)/);
 assert.match(r,/uniform vec3 uWinding\[6\]/);
 assert.match(r,/uniform float uNeon,uWindingGlow/);
 assert.match(r,/if\(uWindCount>0&&uWindingGlow>0\.0\)/);
});
test("color state survives CPU and GPU Undo checkpoints and resets",()=>{
 for(const path of ["src/field.js","src/gpu-transport.js"]){
  const code=read(path);
  assert.match(code,/colorGrade:cloneColorState\(this\.colorGrade\)/);
  assert.match(code,/this\.colorGrade=cloneColorState\(s\.colorGrade\)/);
 }
 const g=read("src/gpu-transport.js");
 assert.match(g,/this\.colorGrade=cloneColorState\(source\.colorGrade\)/);
});
