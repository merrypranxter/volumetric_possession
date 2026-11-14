// Persistent 3D GPU dye advection through analytic vortices.
// Uses WebGL2 texture-layer rendering. Not pressure-projected Navier-Stokes.
import {N} from "./field.js";
const VS=`#version 300 es
precision highp float;
void main(){vec2 p=vec2(gl_VertexID==1?3.0:-1.0,gl_VertexID==2?3.0:-1.0);gl_Position=vec4(p,0.0,1.0);}`;
const FS=`#version 300 es
precision highp float;
precision highp sampler3D;
uniform sampler3D uPrev;
uniform float uLayer,uDim,uTime,uDt,uSpeed,uSeedPhase,uTurb;
uniform int uFlow,uImpulseCount,uStampCount,uIntegrator;
uniform vec4 uImpulsePos[8],uImpulseVel[8],uStampPos[16],uStampColor[16];
out vec4 fragColor;
vec3 velocity(vec3 p,float t){
 float x=p.x,y=p.y,z=p.z,k=uSeedPhase;
 vec3 v=vec3(0.0);
 if(uFlow==0){
   vec3 a=vec3(x-sin(t*.24+k)*.22,y,z);
   vec3 b=vec3(x-.20,y-cos(t*.19+k)*.23,z-.15);
   vec3 c=vec3(x+.15,y-.12,z-sin(t*.17)*.19);
   float w0=1.38*exp(-dot(a,a)/1.1025)*uSpeed;
   float w1=-1.15*exp(-dot(b,b)/.9025)*uSpeed;
   float w2=.9*exp(-dot(c,c))*uSpeed;
   v=vec3(a.z*w0-c.y*w2,-b.z*w1+c.x*w2,-a.x*w0+b.y*w1);
 }else if(uFlow==1){
   float phase=t*.16+k,w=3.14159265*1.25;
   v=.38*uSpeed*vec3(.72*sin(w*z+phase)+.91*cos(w*y-phase),
                      .91*sin(w*x+phase)+.72*cos(w*z-phase),
                      .83*sin(w*y+phase)+.91*cos(w*x-phase));
 }else{
   vec3 a=vec3(x-.28*sin(t*.19+k),y-.27,z+.18);
   vec3 b=vec3(x+.28*sin(t*.19+k),y+.27,z-.18);
   float w0=1.42*exp(-dot(a,a)/.58)*uSpeed;
   float w1=-1.42*exp(-dot(b,b)/.58)*uSpeed;
   v=vec3(a.z*w0+b.z*w1,0.0,-a.x*w0-b.x*w1);
 }
 // Divergence-free analytic turbulence: each component omits its own coordinate.
 v+=uTurb*.15*vec3(sin(4.1*z+t*.53+k)+.55*cos(6.7*y-t*.39),
                      sin(4.1*x-t*.47+k)+.55*cos(6.7*z+t*.28),
                      sin(4.1*y+t*.32+k)+.55*cos(6.7*x-t*.37));
 for(int i=0;i<8;i++){
   if(i>=uImpulseCount)break;
   vec3 d=p-uImpulsePos[i].xyz;float r=uImpulsePos[i].w;
   float dd=dot(d,d);if(dd>9.0*r*r)continue;
   v+=uImpulseVel[i].xyz*exp(-dd/(2.0*r*r))*(uImpulseVel[i].w/.9);
 }
 return v;
}
void main(){
 vec3 pos=vec3(2.0*gl_FragCoord.xy/uDim-1.0,2.0*(uLayer+.5)/uDim-1.0);
 vec3 v=velocity(pos,uTime+uDt);
 if(uIntegrator==1){
   vec3 mid=pos-v*(.5*uDt);
   v=velocity(mid,uTime+.5*uDt);
 }
 vec3 back=clamp(pos-v*uDt,vec3(-1),vec3(1));
 vec3 dye=texture(uPrev,back*.5+.5).rgb*exp(-.019*uDt);
 for(int i=0;i<16;i++){
   if(i>=uStampCount)break;
   vec3 diff=pos-uStampPos[i].xyz;float r=uStampPos[i].w;
   float d=dot(diff,diff)/(r*r);
   if(d>=1.0)continue;
   dye+=uStampColor[i].rgb*(1.0-d)*(1.0-d);
 }
 fragColor=vec4(clamp(dye,0.0,1.0),1.0);
}`;
const FLOW={cathedral:0,beltrami:1,countercurrent:2};
function shader(gl,type,source){
 const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
 if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error("GPU transport GLSL: "+gl.getShaderInfoLog(s));
 return s;
}
function volume(gl){
 const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_3D,t);
 for(const dir of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_3D,dir,gl.LINEAR);
 for(const dir of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T,gl.TEXTURE_WRAP_R])gl.texParameteri(gl.TEXTURE_3D,dir,gl.CLAMP_TO_EDGE);
 gl.texImage3D(gl.TEXTURE_3D,0,gl.RGBA8,N,N,N,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
 return t;
}
export class GPUPigmentTransport{
 constructor(renderer,source){
   const gl=renderer.gl;this.gl=gl;this.renderer=renderer;
   this.front=renderer.texture;this.back=volume(gl);
   this.fbo=gl.createFramebuffer();this.copyFbo=gl.createFramebuffer();
   gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo);
   gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,this.back,0,0);
   const valid=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
   gl.bindFramebuffer(gl.FRAMEBUFFER,null);
   if(!valid){gl.deleteTexture(this.back);gl.deleteFramebuffer(this.fbo);gl.deleteFramebuffer(this.copyFbo);throw Error("GPU 3D slice framebuffer unavailable");}
   const p=gl.createProgram(),v=shader(gl,gl.VERTEX_SHADER,VS),f=shader(gl,gl.FRAGMENT_SHADER,FS);
   gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);
   gl.deleteShader(v);gl.deleteShader(f);
   if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error("GPU transport link: "+gl.getProgramInfoLog(p));
   this.program=p;this.vao=gl.createVertexArray();this.loc={};
   const names=["uPrev","uLayer","uDim","uTime","uDt","uSpeed","uSeedPhase","uTurb","uFlow","uImpulseCount","uStampCount","uIntegrator","uImpulsePos","uImpulseVel","uStampPos","uStampColor"];
   for(const n of names)this.loc[n]=gl.getUniformLocation(p,n);
   for(const n of ["uImpulsePos","uImpulseVel","uStampPos","uStampColor"])this.loc[n]=gl.getUniformLocation(p,n+"[0]");
   this.time=source.time;this.seed=source.seed;this.morphology=source.morphology;this.flow=source.flow;
   this.turbulence=source.turbulence||0;this.integration=source.integration||"euler";this.impulses=[];this.pending=[];
   renderer.externalSource=true;renderer.texture=this.front;
 }
 stamp(p,r,channel,amount=.38){
   const color=[0,0,0];color[channel]=amount;this.pending.push({p:p.slice(),r,color});
   if(this.pending.length>64)this.pending.shift();
 }
 push(p,v,r){this.impulses.push({p:p.slice(),v:v.slice(),r,ttl:.9});if(this.impulses.length>8)this.impulses.shift();}
 step(dt,speed){
   if(dt===0&&this.pending.length===0)return;
   const gl=this.gl,U=this.loc;
   gl.useProgram(this.program);gl.bindVertexArray(this.vao);
   gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_3D,this.front);
   gl.uniform1i(U.uPrev,1);gl.uniform1f(U.uTime,this.time);gl.uniform1f(U.uDt,dt);
   gl.uniform1f(U.uSpeed,speed);gl.uniform1f(U.uDim,N);gl.uniform1f(U.uSeedPhase,this.seed*.000017);
   gl.uniform1f(U.uTurb,this.turbulence);gl.uniform1i(U.uFlow,FLOW[this.flow]??0);
   gl.uniform1i(U.uIntegrator,this.integration==="midpoint"?1:0);
   const pp=new Float32Array(32),pv=new Float32Array(32);
   for(let i=0;i<this.impulses.length;i++){const s=this.impulses[i];pp.set([...s.p,s.r],i*4);pv.set([...s.v,s.ttl],i*4);}
   gl.uniform1i(U.uImpulseCount,this.impulses.length);gl.uniform4fv(U.uImpulsePos,pp);gl.uniform4fv(U.uImpulseVel,pv);
   const count=Math.min(16,this.pending.length),sp=new Float32Array(64),sc=new Float32Array(64);
   for(let i=0;i<count;i++){const s=this.pending[i];sp.set([...s.p,s.r],i*4);sc.set([...s.color,0],i*4);}
   gl.uniform1i(U.uStampCount,count);gl.uniform4fv(U.uStampPos,sp);gl.uniform4fv(U.uStampColor,sc);
   gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo);gl.viewport(0,0,N,N);
   for(let z=0;z<N;z++){
     gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,this.back,0,z);
     gl.uniform1f(U.uLayer,z);gl.drawArrays(gl.TRIANGLES,0,3);
   }
   const error=gl.getError();gl.bindFramebuffer(gl.FRAMEBUFFER,null);
   gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_3D,null);gl.activeTexture(gl.TEXTURE0);
   if(error!==gl.NO_ERROR)throw Error("GPU transport failure: "+error);
   [this.front,this.back]=[this.back,this.front];this.renderer.texture=this.front;
   this.time+=dt;this.pending.splice(0,count);
   this.impulses=this.impulses.filter(s=>(s.ttl-=dt)>0);
 }
 flush(speed){while(this.pending.length)this.step(0,speed);}
 // All layers copied GPU-to-GPU, with no readPixels stalls.
 copyVolume(src,dst){
   const gl=this.gl;gl.bindFramebuffer(gl.FRAMEBUFFER,this.copyFbo);gl.bindTexture(gl.TEXTURE_3D,dst);
   for(let z=0;z<N;z++){
     gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,src,0,z);
     gl.copyTexSubImage3D(gl.TEXTURE_3D,0,0,0,z,0,0,N,N);
   }
   gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindTexture(gl.TEXTURE_3D,null);
   const e=gl.getError();if(e!==gl.NO_ERROR)throw Error("GPU checkpoint failure: "+e);
 }
 snapshot(){
   const texture=volume(this.gl);this.copyVolume(this.front,texture);
   return {kind:"gpu",texture,time:this.time,seed:this.seed,flow:this.flow,morphology:this.morphology,turbulence:this.turbulence,integration:this.integration};
 }
 restore(s){
   if(s.kind!=="gpu")throw Error("Expected a GPU checkpoint");
   this.copyVolume(s.texture,this.front);this.time=s.time;this.seed=s.seed;
   this.flow=s.flow;this.morphology=s.morphology;this.turbulence=s.turbulence||0;this.integration=s.integration||"euler";
   this.pending.length=0;this.impulses.length=0;this.renderer.texture=this.front;
 }
 release(s){if(s?.kind==="gpu"&&s.texture)this.gl.deleteTexture(s.texture);}
 reset(source){
   const gl=this.gl;gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_3D,this.front);
   gl.texSubImage3D(gl.TEXTURE_3D,0,0,0,0,N,N,N,gl.RGBA,gl.UNSIGNED_BYTE,source.pack());
   this.time=source.time;this.seed=source.seed;this.flow=source.flow;this.morphology=source.morphology;
   this.turbulence=source.turbulence||0;this.integration=source.integration||"euler";
   this.pending.length=0;this.impulses.length=0;this.renderer.texture=this.front;
 }
}
