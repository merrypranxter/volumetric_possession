import test from "node:test";
import assert from "node:assert/strict";
import {coverProjection,cameraVectors,pointFromScreen} from "../src/render.js";

test("cover projection crops without distorting angular pixel scale",()=>{
  for(const [width,height] of [[393,852],[874,402],[1366,768],[500,500]]){
    const [x,y]=coverProjection(width/height);
    assert.ok(Math.abs(x/width-y/height)<1e-12);
    assert.ok(x<=1&&y<=1&&x>0&&y>0);
  }
  assert.deepEqual(coverProjection(1),[1,1]);
  assert.throws(()=>coverProjection(0),/Invalid viewport aspect/);
});

test("touch picking and shader projection agree on the centered viewing ray",()=>{
  const canvas={getBoundingClientRect:()=>({left:7,top:11,width:393,height:852})};
  const camera={azimuth:.62,elevation:.23,distance:1.95};
  const hit=pointFromScreen(canvas,camera,{clientX:7+393/2,clientY:11+852/2},0);
  const frame=cameraVectors(camera);
  assert.ok(Math.hypot(...hit.point)<1e-8);
  assert.ok(frame.eye.every(Number.isFinite));
});

test("immersive focal length is closer than the previous specimen view",()=>{
  const old={azimuth:.62,elevation:.23,distance:3.25};
  const now={azimuth:.62,elevation:.23,distance:1.95};
  assert.ok(Math.hypot(...cameraVectors(now).eye)<Math.hypot(...cameraVectors(old).eye));
});
