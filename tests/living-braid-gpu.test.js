import test from "node:test";
import assert from "node:assert/strict";
import {PigmentField,N} from "../src/field.js";
import {GPUPigmentTransport} from "../src/gpu-transport.js";
import {newFlowCurve} from "../src/flow-curve.js";
import {braidFlowCurve} from "../src/curve-topology.js";
import {evaluateLivingCurves} from "../src/living-braid.js";
import {nurseryStarters} from "../src/curve-breeder.js";
import {addGeneSpecimen,cloneGeneGallery,cloneGeneSources} from "../src/gene-gallery.js";

function mockGL(){
 let serial=0,draws=0,copies=0,uploads=0,reads=0;
 const sends=[],counts=[];
 const c={TEXTURE_3D:32879,TEXTURE0:33984,TEXTURE1:33985,TEXTURE2:33986,
 TEXTURE_MIN_FILTER:10241,TEXTURE_MAG_FILTER:10240,TEXTURE_WRAP_S:10242,TEXTURE_WRAP_T:10243,TEXTURE_WRAP_R:32882,
 LINEAR:9729,CLAMP_TO_EDGE:33071,RGBA8:32856,RGBA:6408,UNSIGNED_BYTE:5121,
 FRAGMENT_SHADER:35632,VERTEX_SHADER:35633,COMPILE_STATUS:35713,LINK_STATUS:35714,
 FRAMEBUFFER:36160,COLOR_ATTACHMENT0:36064,FRAMEBUFFER_COMPLETE:36053,NO_ERROR:0,TRIANGLES:4};
 const api={
 createTexture(){return{id:++serial}},createFramebuffer(){return{id:++serial}},
 createProgram(){return{id:++serial}},createShader(){return{id:++serial}},
 createVertexArray(){return{id:++serial}},getShaderParameter(){return true},
 getProgramParameter(){return true},checkFramebufferStatus(){return c.FRAMEBUFFER_COMPLETE},getError(){return 0},
 getUniformLocation(_,name){return name},
 uniform1i(name,value){if(name==="uCurveCount")counts.push(value)},
 uniform1f(){},
 uniform4fv(name,value){if(name==="uCurvePoints[0]")sends.push(Array.from(value))},
 drawArrays(){draws++},copyTexSubImage3D(){copies++},
 texSubImage3D(){uploads++},readPixels(){reads++}
 };
 const gl=new Proxy({...c,...api},{get(o,k){return k in o?o[k]:()=>{}}});
 return {gl,sends,counts,stats:()=>({draws,copies,uploads,reads})};
}

test("living braid uploads same moving geometry to dye and fiber without new passes",()=>{
 const {gl,sends,counts,stats}=mockGL();
 const field=new PigmentField(42);
 const points=Array.from({length:8},(_,i)=>[-.65+1.3*i/7,.21*Math.sin(i*.6),.08*Math.cos(i*.43)]);
 field.flowCurves=braidFlowCurve(newFlowCurve("coil",points,.25,1.6),2.5,.13);
 field.livingMode="unravel";field.livingRate=1.1;field.livingAmount=.22;
 const renderer={gl,texture:gl.createTexture(),fiberTexture:gl.createTexture()};
 const gpu=new GPUPigmentTransport(renderer,field);
 const base=JSON.stringify(gpu.flowCurves);
 gpu.step(1/15,1);
 gpu.step(1/15,1);
 assert.deepEqual(counts,[2,2,2,2]);
 assert.equal(sends.length,4);
 assert.deepEqual(sends[0],sends[1],"dye and fiber must see the same first pose");
 assert.deepEqual(sends[2],sends[3],"dye and fiber must see the same next pose");
 assert.notDeepEqual(sends[0],sends[2],"geometry must evolve between steps");
 assert.equal(stats().draws,N*4,"no extra GPU volume passes");
 assert.equal(JSON.stringify(gpu.flowCurves),base,"authored base is not mutated");
 const posed=evaluateLivingCurves(gpu.flowCurves,gpu.time,"unravel",1.1,.22);
 assert.ok(Math.abs(sends[2][0]-posed[0].points[0][0])<1e-6);
 const checkpoint=gpu.snapshot();
 gpu.livingMode="grow";gpu.livingAmount=.3;
 gpu.restore(checkpoint);
 assert.equal(gpu.livingMode,"unravel");
 assert.equal(gpu.livingAmount,.22);
 assert.deepEqual(gpu.flowCurves,field.flowCurves);
 assert.equal(stats().copies,N*4);
 gpu.release(checkpoint);
 field.reset(44);gpu.reset(field);
 assert.equal(gpu.flowCurves.length,0);
 assert.equal(gpu.livingMode,"unravel","restart retains selected living mode");
 assert.equal(stats().uploads,2);
 assert.equal(stats().reads,0);
});

test("GPU scene checkpoint, Undo and Reset preserve the 3-parent family album",()=>{
 const {gl,stats}=mockGL();
 const source=new PigmentField(47),parents=nurseryStarters();
 let album=[],sequence=1,refs=[];
 for(let i=0;i<3;i++){
   const result=addGeneSpecimen(album,parents[i],{sequence,label:"Ancestor "+(i+1)});
   album=result.gallery;sequence=result.nextSequence;
   refs.push({id:result.record.id,label:result.record.label});
 }
 source.geneGallery=cloneGeneGallery(album);
 source.geneNextSequence=sequence;
 source.breederParents=parents;
 source.breederSources=cloneGeneSources(refs);
 const renderer={gl,texture:gl.createTexture(),fiberTexture:gl.createTexture()};
 const gpu=new GPUPigmentTransport(renderer,source);
 assert.deepEqual(gpu.geneGallery,source.geneGallery);
 assert.deepEqual(gpu.breederSources,source.breederSources);
 const snapshot=gpu.snapshot();
 gpu.geneGallery[0].label="Evil mutation";
 gpu.breederSources[0].id="untracked";
 gpu.geneNextSequence=88;
 assert.equal(snapshot.geneGallery[0].label,"Ancestor 1");
 gpu.restore(snapshot);
 assert.deepEqual(gpu.geneGallery,source.geneGallery);
 assert.deepEqual(gpu.breederSources,source.breederSources);
 assert.equal(gpu.geneNextSequence,4);
 assert.equal(stats().copies,N*4);
 gpu.release(snapshot);
 source.reset(48);gpu.reset(source);
 assert.deepEqual(gpu.geneGallery,source.geneGallery);
 assert.equal(gpu.flowCurves.length,0);
 assert.equal(gpu.geneNextSequence,4);
 assert.equal(stats().reads,0);
});

test("GPU checkpoints and Restart preserve selective genetic donor locks with no new shaders",()=>{
 const {gl,stats}=mockGL();
 const source=new PigmentField(41);
 source.breedTraitLocks={topology:"1",shape:"0",force:"2",material:"1",motion:"0",dynamics:"2"};
 const renderer={gl,texture:gl.createTexture(),fiberTexture:gl.createTexture()};
 const gpu=new GPUPigmentTransport(renderer,source);
 assert.deepEqual(gpu.breedTraitLocks,source.breedTraitLocks);
 const checkpoint=gpu.snapshot();
 gpu.breedTraitLocks={topology:"auto",shape:"auto",force:"auto",material:"auto",motion:"auto",dynamics:"auto"};
 gpu.restore(checkpoint);
 assert.deepEqual(gpu.breedTraitLocks,source.breedTraitLocks);
 assert.equal(stats().copies,N*4);
 gpu.release(checkpoint);
 source.reset(42);gpu.reset(source);
 assert.deepEqual(gpu.breedTraitLocks,source.breedTraitLocks);
 assert.equal(stats().reads,0);
 assert.equal(stats().draws,0,"gene changes must not cause a simulation draw");
});
