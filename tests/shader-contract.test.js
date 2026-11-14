import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {resolve,dirname} from "node:path";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const file=name=>readFileSync(resolve(root,name),"utf8");

test("GPU transport shader has a runtime midpoint switch",()=>{
 const src=file("src/gpu-transport.js");
 assert.match(src,/uniform int uFlow,uImpulseCount,uStampCount,uIntegrator;/);
 assert.match(src,/vec3 velocity\(vec3 p,float t\)/);
 assert.match(src,/v=velocity\(mid,uTime\+\.5\*uDt\)/);
 assert.match(src,/uniform1i\(U\.uIntegrator,this\.integration==="midpoint"\?1:0\)/);
});

test("ray-march lighting uniform and limited light-ray loop are connected",()=>{
 const src=file("src/render.js");
 assert.match(src,/uniform int uSteps,uLightSteps;/);
 assert.match(src,/for\(int li=0;li<4;li\+\+\)/);
 assert.match(src,/uniform1i\(U\.uLightSteps,opts\.lightSteps\|\|1\)/);
 assert.match(src,/exp\(-uShadow\*opticalDepth\*\.68\)/);
});

test("quality budget maps Mobile/Balanced/Detailed to 1/2/4 light taps",()=>{
 const main=file("src/main.js");
 const html=file("index.html");
 assert.match(main,/lightSteps:\s*2/);
 assert.match(main,/low:1,mid:2,high:4/);
 assert.match(html,/id="integration"/);
 assert.match(html,/value="midpoint"/);
});
