import test from "node:test";
import assert from "node:assert/strict";
import {GPUPigmentTransport} from "../src/gpu-transport.js";
import {PigmentField,N} from "../src/field.js";

function mockWebGL(){
  let id=1,draws=0,copies=0,reads=0,uploads=0;
  const consts={TEXTURE_3D:32879,TEXTURE0:33984,TEXTURE1:33985,
    TEXTURE_MIN_FILTER:10241,TEXTURE_MAG_FILTER:10240,TEXTURE_WRAP_S:10242,
    TEXTURE_WRAP_T:10243,TEXTURE_WRAP_R:32882,LINEAR:9729,CLAMP_TO_EDGE:33071,
    RGBA8:32856,RGBA:6408,UNSIGNED_BYTE:5121,FRAGMENT_SHADER:35632,
    VERTEX_SHADER:35633,COMPILE_STATUS:35713,LINK_STATUS:35714,
    FRAMEBUFFER:36160,COLOR_ATTACHMENT0:36064,
    FRAMEBUFFER_COMPLETE:36053,TRIANGLES:4,NO_ERROR:0};
  const functions={
    createTexture(){return {id:id++}},
    createFramebuffer(){return {id:id++}},
    createProgram(){return {id:id++}},
    createShader(){return {id:id++}},
    createVertexArray(){return {id:id++}},
    getUniformLocation(_program,name){return {name}},
    getShaderParameter(){return true},getProgramParameter(){return true},
    checkFramebufferStatus(){return consts.FRAMEBUFFER_COMPLETE},
    getError(){return consts.NO_ERROR},
    drawArrays(){draws++},
    copyTexSubImage3D(){copies++},
    readPixels(){reads++},
    texSubImage3D(){uploads++}
  };
  const gl=new Proxy({...consts,...functions},{get(o,key){return key in o?o[key]:()=>{};}});
  return {gl,metrics:()=>({draws,copies,reads,uploads})};
}

test("GPU transport renders all volume slices, snapshots without readback and restores time/flow",()=>{
  const {gl,metrics}=mockWebGL();
  const source=new PigmentField(42);
  const renderer={gl,texture:gl.createTexture(),externalSource:false};
  const engine=new GPUPigmentTransport(renderer,source);
  assert.equal(renderer.externalSource,true);
  engine.flow="beltrami";
  engine.turbulence=1.1;
  engine.step(1/15,1);
  assert.equal(metrics().draws,N);
  engine.stamp([0,0,0],.22,2,.45);
  engine.flush(1);
  assert.equal(metrics().draws,N*2);
  assert.equal(engine.pending.length,0);
  const checkpoint=engine.snapshot();
  assert.equal(metrics().copies,N);
  engine.flow="countercurrent";
  engine.turbulence=0;
  engine.push([0,0,0],[1,0,0],.2);
  engine.step(1/15,1);
  engine.restore(checkpoint);
  assert.equal(engine.flow,"beltrami");
  assert.equal(engine.turbulence,1.1);
  assert.equal(engine.time,1/15);
  assert.equal(metrics().copies,N*2);
  engine.release(checkpoint);
  engine.reset(source);
  assert.equal(engine.flow,source.flow);
  assert.equal(engine.time,0);
  assert.equal(metrics().uploads,1);
  assert.equal(metrics().reads,0,"GPU fast path must not read dye back to the CPU");
});
