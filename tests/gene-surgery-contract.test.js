import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(resolve(root,p),"utf8");
test("touch surgery has previews, independent target/source controls and one archive commit",()=>{
 const ui=read("src/main.js"),html=read("index.html");
 for(const id of ["surgerySource","surgeryAction","surgeryTarget","surgeryDonorStrand",
   "surgeryBefore","surgeryAfter","surgeryReport","previewSurgery","applySurgery"]){
  assert.ok(html.includes('id="'+id+'"'),id);
  assert.ok(ui.includes('"'+id+'"'),id);
 }
 assert.match(ui,/performGeneSurgery\(inputs\.recipient,inputs\.donor,inputs\.params\)/);
 assert.match(ui,/if\(!surgeryCandidate\|\|surgeryCandidateSignature!==current\.signature\)/);
 assert.match(ui,/archived=addGeneSpecimen\(engine\.geneGallery,result\.genome/);
 assert.match(ui,/snapshotCommand\(before\)/);
});
test("pure math surgery stays under existing GPU geometry caps and is Undoable",()=>{
 const op=read("src/gene-surgery.js"),main=read("src/main.js"),gpu=read("src/gpu-transport.js");
 assert.match(op,/MAX_CURVES/);
 assert.match(op,/result\.curves\.length>=MAX_CURVES/);
 assert.match(op,/newFlowCurve\(c\.type,c\.points,c\.r,c\.strength\)/);
 assert.match(main,/engine\.flowCurves=cloneFlowCurves\(result\.genome\.curves\)/);
 assert.match(gpu,/uCurvePoints\[16\],uCurveInfo\[2\]/);
});
test("surgery metadata is safely cloned and rendered in family-tree records",()=>{
 const gallery=read("src/gene-gallery.js"),main=read("src/main.js");
 assert.match(gallery,/surgery:cloneSurgery\(e\.surgery\)/);
 assert.match(gallery,/surgery:options\.surgery/);
 assert.match(main,/if\(selected\.surgery\)/);
 assert.match(main,/sourceLabel:inputs\.sourceLabel/);
});
