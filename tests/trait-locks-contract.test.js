import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(resolve(root,p),"utf8");
test("touch-first Trait Heist exposes all six independent parent donor controls",()=>{
 const h=read("index.html"),m=read("src/main.js");
 for(const id of ["traitTopology","traitShape","traitForce","traitMaterial","traitMotion",
  "traitDynamics","resetTraitLocks","traitReceipt","traitPreviewCanvas","previewGene","hatchGene"]){
  assert.ok(h.includes('id="'+id+'"'),id);
  assert.ok(m.includes('"'+id+'"'),id);
 }
 assert.match(m,/for\(const key of TRAIT_KEYS\)/);
 assert.match(m,/engine\.breedTraitLocks=normalizeTraitLocks/);
});
test("preview does not mutate pigment, seed, gallery or commit a checkpoint",()=>{
 const m=read("src/main.js");
 assert.match(m,/previewChild=child;previewSignature=inputs\.signature/);
 assert.match(m,/albumPreview\(\$\("traitPreviewCanvas"\),child\)/);
 assert.match(m,/if\(!previewChild\|\|previewSignature!==inputs\.signature\)/);
 assert.match(m,/hatchOffspring\(previewChild,inputs\.seed/);
 assert.match(m,/hatchOffspring\(child,inputs\.seed/);
 assert.match(m,/archived=addGeneSpecimen\(engine\.geneGallery,child/);
});
test("trait donor locks persist in CPU, GPU, JSON, and offspring receipt",()=>{
 for(const path of ["src/field.js","src/gpu-transport.js"]){
  const s=read(path);
  assert.match(s,/breedTraitLocks:normalizeTraitLocks\(this\.breedTraitLocks\)/);
  assert.match(s,/this\.breedTraitLocks=normalizeTraitLocks\(s\.breedTraitLocks\)/);
 }
 const gene=read("src/gene-gallery.js");
 assert.match(gene,/breedTraitLocks:normalizeTraitLocks\(system\.breedTraitLocks\)/);
 assert.match(gene,/breedTraitLocks:normalizeTraitLocks\(data\.breedTraitLocks\)/);
 assert.match(gene,/traitLocks:normalizeTraitLocks\(e\.traitLocks\)/);
});
test("inherited shapes use existing two-curve GPU budget and no extra pass",()=>{
 const s=read("src/trait-locks.js"),g=read("src/gpu-transport.js");
 assert.match(s,/import \{cloneFlowCurves,MAX_CURVES\}/);
 assert.match(g,/uCurvePoints\[16\],uCurveInfo\[2\]/);
});
