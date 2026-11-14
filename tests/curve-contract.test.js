import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const src=p=>readFileSync(resolve(root,p),"utf8");
test("GPU consumes at most two eight-point curves in both transport passes",()=>{
 const g=src("src/gpu-transport.js"),f=src("src/gpu-fiber-memory.js");
 assert.match(g,/uniform vec4 uCurvePoints\[16\],uCurveInfo\[2\]/);
 assert.match(g,/for\(int ci=0;ci<2;ci\+\+\)/);
 assert.match(g,/for\(int j=0;j<7;j\+\+\)/);
 for(const u of ["uCurveCount","uCurvePoints","uCurveInfo"]){
   assert.ok(g.includes("U."+u));assert.ok(f.includes("U."+u));
 }
 assert.match(f,/pigment\.slice\(0,split\)\+BODY/);
});
test("GPU and CPU snapshots preserve editable curves",()=>{
 const g=src("src/gpu-transport.js"),c=src("src/field.js");
 assert.match(g,/flowCurves:cloneFlowCurves\(this\.flowCurves\)/);
 assert.match(g,/cloneFlowCurves\(s\.flowCurves\|\|\[\]\)/);
 assert.match(c,/curveVelocity\(this\._stepCurves\|\|evaluateLivingCurves/);
 assert.match(c,/this\._stepCurves=evaluateLivingCurves\(this\.flowCurves,this\.time\+dt/);
});
test("mobile drawing and undo controls wired",()=>{
 const h=src("index.html"),m=src("src/main.js");
 for(const id of ["curveOverlay","curveType","curveStrength","curveWidth","curveCount","selectDrawFlow","removeCurve","clearCurves"]){
   assert.ok(h.includes('id="'+id+'"'));assert.ok(m.includes('"'+id+'"'));
 }
 assert.match(h,/data-mode="curve"/);
 assert.match(m,/resampleStroke\(active\.curveRaw,MAX_CURVE_POINTS\)/);
 assert.match(m,/active\.curveMoving/);
 assert.match(m,/snapshotCommand\(active\.before\)/);
});
