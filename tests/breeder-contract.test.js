import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(resolve(root,p),"utf8");
test("CPU and GPU deep-copy family slots and breeder seed in checkpoints",()=>{
 for(const path of ["src/field.js","src/gpu-transport.js"]){
 const s=read(path);
 assert.match(s,/breederParents:cloneBreederParents\(this\.breederParents\)/);
 assert.match(s,/breederSeed:this\.breederSeed/);
 assert.match(s,/this\.breederParents=cloneBreederParents\(s\.breederParents\)/);
 }
});
test("three-parent nursery UI has live capture, breeding, seed and Undo",()=>{
 const html=read("index.html"),ui=read("src/main.js");
 for(const id of ["captureGene1","captureGene2","captureGene3","geneParentCount",
  "loadGeneStarters","breedChild","clearGeneParents","breedSeed","breedDominance","breedMutation","breedResult"]){
  assert.ok(html.includes('id="'+id+'"'),id);
  assert.ok(ui.includes('"'+id+'"')||(id.startsWith("captureGene")&&ui.includes('"captureGene"+(i+1)')),id);
 }
 assert.match(ui,/engine\.flowCurves=cloneFlowCurves\(child\.curves\)/);
 assert.match(ui,/snapshotCommand\(before\)/);
 assert.match(ui,/engine\.breederSeed=\(seed\+1\)>>>0/);
});
test("new genetics reuses old GPU 2 by 8 velocity uniform budget",()=>{
 const src=read("src/curve-breeder.js"),shader=read("src/gpu-transport.js");
 assert.match(src,/export const BREEDER_SLOTS=3/);
 assert.match(src,/const model=select\(\),count=model\.curves\.length/);
 assert.match(shader,/uCurvePoints\[16\],uCurveInfo\[2\]/);
});
