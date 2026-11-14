import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(resolve(root,p),"utf8");
test("both engines checkpoint genealogy, gallery and parent source identities",()=>{
 for(const path of ["src/field.js","src/gpu-transport.js"]){
  const src=read(path);
  assert.match(src,/geneGallery:cloneGeneGallery\(this\.geneGallery\)/);
  assert.match(src,/breederSources:cloneGeneSources\(this\.breederSources\)/);
  assert.match(src,/this\.geneGallery=cloneGeneGallery\(s\.geneGallery\)/);
  assert.match(src,/this\.geneNextSequence=s\.geneNextSequence\?\?1/);
 }
});
test("gallery UI supports favorites, ancestry, activation, selective breeding and persistence",()=>{
 const src=read("src/main.js"),html=read("index.html");
 for(const id of ["geneAlbumCount","geneGallery","geneTree","saveGeneNow",
   "exportGeneBank","importGeneBank","importGeneBankButton","geneAlbumStorage"]){
  assert.ok(html.includes('id="'+id+'"'),id);
  assert.ok(src.includes('"'+id+'"'),id);
 }
 for(const literal of ["promoteArchivedGene","activateArchivedGene","editGeneSpecimen",
  "genealogicalChain","restoreSavedGeneBank","persistGeneBank","parseGeneBank"]){
  assert.ok(src.includes(literal),literal);
 }
 assert.match(src,/archived=addGeneSpecimen\(engine\.geneGallery,child/);
 assert.match(src,/sequence:engine\.geneNextSequence,parents,seed,mutation/);
 assert.match(src,/snapshotCommand\(before\)/);
});
test("album preview uses only 2D canvas and 24 bounded genomes",()=>{
 const album=read("src/gene-gallery.js"),ui=read("src/main.js"),shader=read("src/gpu-transport.js");
 assert.match(album,/export const GALLERY_LIMIT=24/);
 assert.match(ui,/canvas\.getContext\?\.\("2d"\)/);
 assert.match(shader,/uCurvePoints\[16\],uCurveInfo\[2\]/);
});
