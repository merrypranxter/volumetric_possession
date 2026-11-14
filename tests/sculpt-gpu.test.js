import test from "node:test";
import assert from "node:assert/strict";
import {PigmentField,N} from "../src/field.js";
import {GPUPigmentTransport} from "../src/gpu-transport.js";
import {summonSculptTriad} from "../src/flow-sculpt.js";

function mockGL(){
 let serial=0,draws=0,copies=0,readbacks=0,uploads=0;
 const U={};
 const C={TEXTURE_3D:32879,TEXTURE0:33984,TEXTURE1:33985,TEXTURE2:33986,
 TEXTURE_MIN_FILTER:10241,TEXTURE_MAG_FILTER:10240,TEXTURE_WRAP_S:10242,TEXTURE_WRAP_T:10243,TEXTURE_WRAP_R:32882,
 LINEAR:9729,CLAMP_TO_EDGE:33071,RGBA8:32856,RGBA:6408,UNSIGNED_BYTE:5121,
 VERTEX_SHADER:35633,FRAGMENT_SHADER:35632,COMPILE_STATUS:35713,LINK_STATUS:35714,
 FRAMEBUFFER:36160,COLOR_ATTACHMENT0:36064,FRAMEBUFFER_COMPLETE:36053,NO_ERROR:0,TRIANGLES:4};
 const A={
  createTexture(){return {id:++serial}},createFramebuffer(){return {id:++serial}},
  createShader(){return {id:++serial}},createProgram(){return {id:++serial}},
  createVertexArray(){return {id:++serial}},getShaderParameter(){return true},
  getProgramParameter(){return true},checkFramebufferStatus(){return C.FRAMEBUFFER_COMPLETE},
  getError(){return C.NO_ERROR},getUniformLocation(_p,name){return name},
  uniform1i(name,value){U[name]=value},uniform1f(name,value){U[name]=value},
  uniform4fv(name,value){U[name]=Array.from(value)},
  drawArrays(){draws++},copyTexSubImage3D(){copies++},
  readPixels(){readbacks++},texSubImage3D(){uploads++}
 };
 return {gl:new Proxy({...C,...A},{get(o,key){return key in o?o[key]:()=>{}}}),U,
  stats:()=>({draws,copies,readbacks,uploads})};
}
test("sculpt nodes reach both WebGL2 volume passes and survive checkpoints",()=>{
 const {gl,U,stats}=mockGL();
 const source=new PigmentField(42);
 source.sculptNodes=summonSculptTriad();
 const renderer={gl,texture:gl.createTexture(),fiberTexture:gl.createTexture()};
 const gpu=new GPUPigmentTransport(renderer,source);
 gpu.step(1/15,1);
 assert.equal(stats().draws,N*2);
 assert.equal(U.uSculptCount,3);
 assert.deepEqual(U["uSculptInfo[0]"].filter((v,i)=>i%4===0).slice(0,3),[0,1,2]);
 const snapshot=gpu.snapshot();
 assert.equal(stats().copies,N*4/2);
 gpu.sculptNodes[0].p[0]=.9;
 gpu.sculptNodes.pop();
 gpu.restore(snapshot);
 assert.equal(stats().copies,N*4);
 assert.equal(gpu.sculptNodes.length,3);
 assert.equal(gpu.sculptNodes[0].p[0],-.42);
 gpu.release(snapshot);
 source.reset(47);gpu.reset(source);
 assert.equal(gpu.sculptNodes.length,0);
 assert.equal(stats().uploads,2);
 assert.equal(stats().readbacks,0);
});
