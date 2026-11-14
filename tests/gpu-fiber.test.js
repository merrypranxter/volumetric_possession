import test from "node:test";
import assert from "node:assert/strict";
import {PigmentField,N} from "../src/field.js";
import {GPUPigmentTransport} from "../src/gpu-transport.js";

function mockGL(){
 const c={TEXTURE_3D:32879,TEXTURE0:33984,TEXTURE1:33985,TEXTURE2:33986,
  TEXTURE_MIN_FILTER:10241,TEXTURE_MAG_FILTER:10240,TEXTURE_WRAP_S:10242,TEXTURE_WRAP_T:10243,TEXTURE_WRAP_R:32882,
  LINEAR:9729,CLAMP_TO_EDGE:33071,RGBA8:32856,RGBA:6408,UNSIGNED_BYTE:5121,
  FRAGMENT_SHADER:35632,VERTEX_SHADER:35633,COMPILE_STATUS:35713,LINK_STATUS:35714,
  FRAMEBUFFER:36160,COLOR_ATTACHMENT0:36064,FRAMEBUFFER_COMPLETE:36053,NO_ERROR:0,TRIANGLES:4};
 let seq=0,draws=0,copies=0,uploads=0,readbacks=0;
 const uniforms={},shaders=[];
 const api={
  createTexture(){return {id:++seq}},createFramebuffer(){return {id:++seq}},
  createProgram(){return {id:++seq}},createVertexArray(){return {id:++seq}},
  createShader(type){return {id:++seq,type}},
  shaderSource(s,source){shaders.push({type:s.type,source})},
  getShaderParameter(){return true},getProgramParameter(){return true},
  checkFramebufferStatus(){return c.FRAMEBUFFER_COMPLETE},getError(){return 0},
  getUniformLocation(_p,n){return n},uniform1i(n,v){uniforms[n]=v},
  uniform1f(n,v){uniforms[n]=v},drawArrays(){draws++},
  copyTexSubImage3D(){copies++},texSubImage3D(){uploads++},readPixels(){readbacks++}
 };
 const gl=new Proxy({...c,...api},{get(o,k){return k in o?o[k]:()=>{}}});
 return {gl,uniforms,shaders,stats:()=>({draws,copies,uploads,readbacks})};
}
test("GPU advances both 3D volumes and checkpoints without CPU readback",()=>{
 const mock=mockGL(),{gl,stats,uniforms,shaders}=mock;
 const source=new PigmentField(42);
 const renderer={gl,texture:gl.createTexture(),fiberTexture:gl.createTexture(),externalSource:false};
 const gpu=new GPUPigmentTransport(renderer,source);
 gpu.step(1/15,1);
 assert.equal(stats().draws,N*2,"pigment and fiber each get N slice renders");
 assert.equal(uniforms.uFiberGrowth,source.fiberGrowth);
 assert.equal(uniforms.uFiberGuidance,source.fiberGuidance);
 assert.equal(uniforms.uFiberBend,source.fiberBend);
 assert.equal(uniforms.uFiberPersistence,source.fiberPersistence);
 assert.equal(renderer.externalSource,true);
 assert.equal(shaders.filter(s=>s.type===gl.FRAGMENT_SHADER).length,2);
 const snap=gpu.snapshot();
 assert.equal(stats().copies,N*2,"both volumes must be checkpointed");
 gpu.fiberGrowth=4;gpu.fiberGuidance=0;gpu.fiberEnabled=false;
 gpu.step(1/15,1);
 assert.equal(stats().draws,N*3,"disabling fibers must skip extra 3D slice pass");
 gpu.restore(snap);
 assert.equal(stats().copies,N*4,"both checkpoint volumes restored");
 assert.equal(gpu.fiberGrowth,source.fiberGrowth);
 assert.equal(gpu.fiberGuidance,source.fiberGuidance);
 assert.equal(gpu.fiberEnabled,true);
 gpu.release(snap);
 gpu.reset(source);
 assert.equal(stats().uploads,2,"both dye and fiber volumes reset on GPU");
 assert.equal(stats().readbacks,0);
});
