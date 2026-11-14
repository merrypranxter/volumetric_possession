import {N} from "./field.js";
const vertex = `#version 300 es
precision highp float;
void main(){
  vec2 p=vec2(gl_VertexID==1?3.0:-1.0,gl_VertexID==2?3.0:-1.0);
  gl_Position=vec4(p,0.0,1.0);
}`;
const fragment = `#version 300 es
precision highp float;
precision highp sampler3D;
out vec4 outColor;
uniform sampler3D uVolume;
uniform vec3 uEye,uForward,uRight,uUp,uA,uB,uC,uBg;
uniform float uAspect,uGain,uGlow;
uniform vec2 uCanvasSize;
uniform int uSteps;
void main(){
  vec2 uv=(gl_FragCoord.xy/uCanvasSize)*2.0-1.0;
  vec3 direction=normalize(uForward*1.55+uRight*uv.x*uAspect+uUp*uv.y);
  vec3 lower=(-vec3(1.0)-uEye)/direction,upper=(vec3(1.0)-uEye)/direction;
  vec3 nearV=min(lower,upper),farV=max(lower,upper);
  float entry=max(max(nearV.x,nearV.y),nearV.z);
  float exitT=min(min(farV.x,farV.y),farV.z);
  vec3 accum=vec3(0.0);float trans=1.0;
  if(exitT>max(entry,0.0)){
    float start=max(entry,0.0);
    float stride=(exitT-start)/float(uSteps);
    for(int i=0;i<96;i++){
      if(i>=uSteps)break;
      vec3 pos=uEye+direction*(start+(float(i)+.5)*stride);
      vec3 sampleUV=clamp(pos*.5+.5,vec3(0.0),vec3(1.0));
      vec3 dye=texture(uVolume,sampleUV).rgb;
      float mass=dye.r+dye.g+dye.b;
      if(mass>.008){
        float upstream=dot(texture(uVolume,clamp(sampleUV+vec3(.013,.026,.011),vec3(0.0),vec3(1.0))).rgb,vec3(1.0));
        float shade=clamp(.77+2.2*(mass-upstream),.35,1.3);
        vec3 pigment=(dye.r*uA+dye.g*uB+dye.b*uC)/max(mass,.0001);
        float alpha=1.0-exp(-mass*uGain*stride);
        accum+=trans*alpha*pigment*shade*(.76+uGlow*.42);
        trans*=1.0-alpha;
        if(trans<.015)break;
      }
    }
  }
  vec3 color=accum+trans*uBg;
  color=color/(vec3(1.0)+color*.29);
  outColor=vec4(pow(max(color,vec3(0.0)),vec3(.82)),1.0);
}
`;
function compile(gl,type,src){
  const sh=gl.createShader(type);gl.shaderSource(sh,src);gl.compileShader(sh);
  if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(sh);gl.deleteShader(sh);throw Error("GLSL: "+message);}
  return sh;
}
const norm=a=>{const l=Math.hypot(...a)||1;return a.map(v=>v/l);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function cameraVectors(camera){
  const a=camera.azimuth,e=camera.elevation,dist=camera.distance;
  const eye=[Math.sin(a)*Math.cos(e)*dist,Math.sin(e)*dist,Math.cos(a)*Math.cos(e)*dist];
  const forward=norm(eye.map(v=>-v)),right=norm(cross(forward,[0,1,0])),up=norm(cross(right,forward));
  return {eye,forward,right,up};
}
export function pointFromScreen(canvas,camera,event,depth=0){
  const rect=canvas.getBoundingClientRect();
  const x=2*(event.clientX-rect.left)/rect.width-1,y=1-2*(event.clientY-rect.top)/rect.height;
  const {eye,forward,right,up}=cameraVectors(camera),aspect=rect.width/rect.height;
  const dir=norm(forward.map((v,i)=>v*1.55+right[i]*x*aspect+up[i]*y));
  const center=forward.map(v=>v*depth);
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const travel=dot(center.map((v,i)=>v-eye[i]),forward)/dot(dir,forward);
  return {point:eye.map((v,i)=>Math.max(-.98,Math.min(.98,v+dir[i]*travel))),right,up};
}
export class VolumeRenderer{
  constructor(canvas,field){
    this.canvas=canvas;this.field=field;
    const gl=canvas.getContext("webgl2",{alpha:false,antialias:false,preserveDrawingBuffer:true,powerPreference:"high-performance"});
    if(!gl)throw Error("This artwork needs WebGL2; your browser did not provide it.");
    this.gl=gl;
    const prog=gl.createProgram(),vs=compile(gl,gl.VERTEX_SHADER,vertex),fs=compile(gl,gl.FRAGMENT_SHADER,fragment);
    gl.attachShader(prog,vs);gl.attachShader(prog,fs);gl.linkProgram(prog);
    if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw Error("GL link: "+gl.getProgramInfoLog(prog));
    gl.deleteShader(vs);gl.deleteShader(fs);this.prog=prog;
    this.locations={};
    for(const name of ["uVolume","uEye","uForward","uRight","uUp","uA","uB","uC","uBg","uAspect","uGain","uGlow","uSteps","uCanvasSize"])this.locations[name]=gl.getUniformLocation(prog,name);
    this.texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_3D,this.texture);
    gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_WRAP_R,gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
    gl.texImage3D(gl.TEXTURE_3D,0,gl.RGBA8,N,N,N,0,gl.RGBA,gl.UNSIGNED_BYTE,field.pack());
    this.vao=gl.createVertexArray();this.uploaded=true;
  }
  upload(){
    const gl=this.gl;if(!this.field.dirty)return;
    gl.bindTexture(gl.TEXTURE_3D,this.texture);
    gl.texSubImage3D(gl.TEXTURE_3D,0,0,0,0,N,N,N,gl.RGBA,gl.UNSIGNED_BYTE,this.field.pack());
  }
  draw(camera,colors,opts){
    const gl=this.gl,canvas=this.canvas,rect=canvas.getBoundingClientRect();
    const pixelRatio=Math.min(window.devicePixelRatio||1,1.3);
    const w=Math.min(780,Math.max(1,Math.round(rect.width*pixelRatio)));
    const h=Math.min(780,Math.max(1,Math.round(rect.height*pixelRatio)));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    this.upload();gl.viewport(0,0,w,h);gl.useProgram(this.prog);gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_3D,this.texture);
    const U=this.locations,c=cameraVectors(camera);
    gl.uniform1i(U.uVolume,0);gl.uniform3fv(U.uEye,c.eye);gl.uniform3fv(U.uForward,c.forward);
    gl.uniform3fv(U.uRight,c.right);gl.uniform3fv(U.uUp,c.up);
    gl.uniform3fv(U.uA,colors[0]);gl.uniform3fv(U.uB,colors[1]);gl.uniform3fv(U.uC,colors[2]);gl.uniform3fv(U.uBg,opts.background);
    gl.uniform1f(U.uAspect,w/h);gl.uniform1f(U.uGain,opts.gain);gl.uniform1f(U.uGlow,opts.glow);
    gl.uniform1i(U.uSteps,opts.steps);gl.uniform2f(U.uCanvasSize,w,h);gl.drawArrays(gl.TRIANGLES,0,3);
  }
}
