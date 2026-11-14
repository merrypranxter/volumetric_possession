// Persistent 3D GPU dye advection through analytic vortices.
// Uses WebGL2 texture-layer rendering. Not pressure-projected Navier-Stokes.
import {N} from "./field.js";
import {GPUFiberMemory} from "./gpu-fiber-memory.js";
import {cloneSculptNodes} from "./flow-sculpt.js";
import {cloneFlowCurves} from "./flow-curve.js";
import {evaluateLivingCurves,LIVING_MODES} from "./living-braid.js";
import {cloneBreederParents,DEFAULT_BREED_SEED} from "./curve-breeder.js";
import {cloneGeneGallery,cloneGeneSources} from "./gene-gallery.js";
import {normalizeTraitLocks} from "./trait-locks.js";
import {cloneColorState} from "./color-control.js";
const VS=`#version 300 es
precision highp float;
void main(){vec2 p=vec2(gl_VertexID==1?3.0:-1.0,gl_VertexID==2?3.0:-1.0);gl_Position=vec4(p,0.0,1.0);}`;
const FS=`#version 300 es
precision highp float;
precision highp sampler3D;
uniform sampler3D uPrev,uFiberPrev;
uniform float uLayer,uDim,uTime,uDt,uSpeed,uSeedPhase,uTurb;
uniform float uFoldWrite,uFoldPersistence,uFoldGrip,uFiberGuidance;
uniform float uFiberGrowth,uFiberBend,uFiberPersistence; // shared header for director pass
uniform int uFlow,uImpulseCount,uStampCount,uIntegrator,uForgeMode,uFiberEnabled,uSculptCount,uCurveCount;
uniform float uForgePower,uForgeWidth,uForgePace;
uniform vec4 uImpulsePos[8],uImpulseVel[8],uStampPos[16],uStampColor[16];
uniform vec4 uSculptPos[6],uSculptInfo[6];
uniform vec4 uCurvePoints[16],uCurveInfo[2];
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
 // Persistent, artist-positioned force anchors, read by both dye and fibers.
 for(int i=0;i<6;i++){
   if(i>=uSculptCount)break;
   vec3 d=p-uSculptPos[i].xyz;
   float radius=max(.12,uSculptPos[i].w),dist2=dot(d,d);
   if(dist2>9.0*radius*radius)continue;
   vec4 spec=uSculptInfo[i];
   float pulse=.78+.22*sin(.83*t+spec.z);
   float gain=spec.y*.60*pulse*exp(-dist2/(2.0*radius*radius))/radius;
   if(spec.x<.5)v+=vec3(d.z,0.0,-d.x)*gain;
   else if(spec.x<1.5)v-=d*gain;
   else v+=d*gain;
 }
 // Persistent hand-drawn path fields, evaluated at the closest line segment.
 // Each curve has at most eight points. The fiber pass reuses these definitions.
 for(int ci=0;ci<2;ci++){
   if(ci>=uCurveCount)break;
   vec4 meta=uCurveInfo[ci];int n=int(meta.x+.5);
   float nearest=1e10;vec3 d=vec3(0.0),axis=vec3(1.0,0.0,0.0);
   for(int j=0;j<7;j++){
     if(j>=n-1)break;
     int k=ci*8+j;
     vec3 a=uCurvePoints[k].xyz,b=uCurvePoints[k+1].xyz;
     vec3 seg=b-a;float ls=dot(seg,seg);
     if(ls<1e-9)continue;
     float u=clamp(dot(p-a,seg)/ls,0.0,1.0);
     vec3 delta=p-(a+u*seg);float dd=dot(delta,delta);
     if(dd<nearest){nearest=dd;d=delta;axis=seg*inversesqrt(ls);}
   }
   float r=max(.12,meta.w);
   if(nearest>9.0*r*r)continue;
   float pulse=.82+.18*sin(t*.75+float(ci)*2.1);
   float gain=.55*meta.z*pulse*exp(-nearest/(2.0*r*r));
   if(meta.y<.5)v+=axis*gain;
   else if(meta.y<1.5)v+=cross(axis,d)*(gain/r);
   else v-=d*(gain/r);
 }
 return v;
}

vec3 forgeSample(vec3 p,float phase,float width){
 if(uForgeMode==0)return vec3(0.0);
 float w2=max(.0025,width*width);
 vec3 result=vec3(0.0);
 if(uForgeMode==1){
   float base=5.3*p.z+phase;
   float envelope=exp(-.25*p.z*p.z);
   for(int c=0;c<3;c++){
     float theta=base+float(c)*2.0943951023931953;
     vec2 d=p.xy-.42*vec2(cos(theta),sin(theta));
     result[c]=exp(-dot(d,d)/w2)*envelope;
   }
 }else if(uForgeMode==2){
   float radius=length(p.xz),theta=atan(p.z,p.x);
   float envelope=exp(-.17*radius*radius);
   for(int c=0;c<3;c++){
     float shift=float(c)*2.0943951023931953;
     float ring=.44+.16*cos(5.0*theta+phase+shift);
     float height=.30*sin(3.0*theta-1.2*phase+shift);
     vec2 d=vec2(radius-ring,p.y-height);
     result[c]=exp(-dot(d,d)/w2)*envelope;
   }
 }else if(uForgeMode==3){
   float xx=5.0*p.x+.35*sin(phase);
   float yy=5.0*p.y+.25*cos(phase);
   float zz=5.0*p.z-.28*cos(phase);
   float gyroid=sin(xx)*cos(yy)+sin(yy)*cos(zz)+sin(zz)*cos(xx);
   float scale=max(.08,width*5.0),envelope=exp(-.32*dot(p,p));
   for(int c=0;c<3;c++){
     float delta=(gyroid-(float(c)-1.0)*.88)/scale;
     result[c]=.13*exp(-delta*delta)*envelope;
   }
 }
 return result;
}
void main(){
 vec3 pos=vec3(2.0*gl_FragCoord.xy/uDim-1.0,2.0*(uLayer+.5)/uDim-1.0);
 ivec3 cell=ivec3(ivec2(gl_FragCoord.xy),int(uLayer));
 vec3 v=velocity(pos,uTime+uDt);
 if(uIntegrator==1){
   vec3 mid=pos-v*(.5*uDt);
   v=velocity(mid,uTime+.5*uDt);
 }
 // Fold memory from the previous material affects the next transport velocity.
 float oldLocalMemory=texelFetch(uPrev,cell,0).a;
 v*=1.0-.35*uFoldGrip*oldLocalMemory;
 if(uFiberEnabled==1&&uFiberGuidance>0.0){
   vec4 fiber=texelFetch(uFiberPrev,cell,0);
   if(fiber.a>.001){
     vec3 axis=normalize(fiber.rgb*2.0-1.0+vec3(.00001));
     float guide=clamp(.55*uFiberGuidance*fiber.a,0.0,.75);
     v=mix(v,axis*dot(v,axis),guide);
   }
 }
 vec3 back=clamp(pos-v*uDt,vec3(-1),vec3(1));
 vec4 previous=texture(uPrev,back*.5+.5);
 vec3 dye=previous.rgb*exp(-.019*uDt);
 for(int i=0;i<16;i++){
   if(i>=uStampCount)break;
   vec3 diff=pos-uStampPos[i].xyz;float r=uStampPos[i].w;
   float d=dot(diff,diff)/(r*r);
   if(d>=1.0)continue;
   dye+=uStampColor[i].rgb*(1.0-d)*(1.0-d);
 }
 // Source material is added to RGB density, not rendered as a disconnected overlay.
 // dt=0 is used for touch-stamp flushes and must not grow fresh filaments.
 if(uForgeMode>0&&uForgePower>0.0&&uDt>0.0){
   float phase=(uTime+uDt)*uForgePace*.55+uSeedPhase;
   vec3 feed=forgeSample(pos,phase,uForgeWidth);
   dye+=uDt*uForgePower*feed*(vec3(1.0)-clamp(dye,0.0,1.0));
 }
 // Cross-flow dye boundaries write to a fourth advected 3D material channel.
 // This is artistic interface/fold memory, not a physical strain tensor.
 ivec3 axis=(abs(v.x)>abs(v.y))?ivec3(0,1,0):ivec3(1,0,0);
 ivec3 sizeMax=ivec3(int(uDim)-1);
 vec3 above=texelFetch(uPrev,clamp(cell+axis,ivec3(0),sizeMax),0).rgb;
 vec3 below=texelFetch(uPrev,clamp(cell-axis,ivec3(0),sizeMax),0).rgb;
 float contrast=min(1.0,length(above-below)*.57735026919);
 float mass=min(1.0,dye.r+dye.g+dye.b);
 float decay=exp(-uDt*(.06+1.15*(1.0-uFoldPersistence)));
 float fold=clamp(previous.a*decay+uDt*uFoldWrite*contrast*mass,0.0,1.0);
 fragColor=vec4(clamp(dye,0.0,1.0),fold);
}`;
const FLOW={cathedral:0,beltrami:1,countercurrent:2};
const FORGE={off:0,helix:1,rosette:2,gyroid:3};
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
   const names=["uFiberPrev","uFiberEnabled","uFiberGuidance","uPrev","uLayer","uDim","uTime","uDt","uSpeed","uSeedPhase","uTurb","uFlow","uImpulseCount","uStampCount","uIntegrator","uFoldWrite","uFoldPersistence","uFoldGrip","uForgeMode","uForgePower","uForgeWidth","uForgePace","uImpulsePos","uImpulseVel","uStampPos","uStampColor","uSculptCount","uSculptPos","uSculptInfo","uCurveCount","uCurvePoints","uCurveInfo"];
   for(const n of names)this.loc[n]=gl.getUniformLocation(p,n);
   for(const n of ["uImpulsePos","uImpulseVel","uStampPos","uStampColor","uSculptPos","uSculptInfo","uCurvePoints","uCurveInfo"])this.loc[n]=gl.getUniformLocation(p,n+"[0]");
   this.time=source.time;this.seed=source.seed;this.morphology=source.morphology;this.flow=source.flow;
   this.turbulence=source.turbulence||0;this.integration=source.integration||"euler";
   this.foldWrite=source.foldWrite??1.4;this.foldPersistence=source.foldPersistence??.80;this.foldGrip=source.foldGrip??.35;
   this.fiberGrowth=source.fiberGrowth??2.3;this.fiberPersistence=source.fiberPersistence??.88;
   this.fiberBend=source.fiberBend??1;this.fiberGuidance=source.fiberGuidance??.65;
   this.fiberEnabled=source.fiberEnabled??true;
   this.fiberGrowth=source.fiberGrowth??2.3;this.fiberPersistence=source.fiberPersistence??.88;
   this.fiberBend=source.fiberBend??1;this.fiberGuidance=source.fiberGuidance??.65;
   this.fiberEnabled=source.fiberEnabled??true;
   this.forgeMode=source.forgeMode??"rosette";this.forgePower=source.forgePower??.75;
   this.forgeWidth=source.forgeWidth??.17;this.forgePace=source.forgePace??.65;
   this.sculptNodes=cloneSculptNodes(source.sculptNodes||[]);
   this.flowCurves=cloneFlowCurves(source.flowCurves||[]);
   this.livingMode=source.livingMode??"still";this.livingRate=source.livingRate??.65;
   this.livingAmount=source.livingAmount??.18;this.liveCurves=this.flowCurves;
   this.breederParents=cloneBreederParents(source.breederParents);
   this.breederSeed=source.breederSeed??DEFAULT_BREED_SEED;
   this.breedTraitLocks=normalizeTraitLocks(source.breedTraitLocks);
   this.breederSources=cloneGeneSources(source.breederSources);
   this.geneGallery=cloneGeneGallery(source.geneGallery);this.geneNextSequence=source.geneNextSequence??1;
   this.colorGrade=cloneColorState(source.colorGrade);
   this.impulses=[];this.pending=[];
   this.fibers=new GPUFiberMemory(renderer,VS,FS);
   renderer.externalSource=true;renderer.texture=this.front;
 }
 stamp(p,r,channel,amount=.38){
   const color=[0,0,0];color[channel]=amount;this.pending.push({p:p.slice(),r,color});
   if(this.pending.length>64)this.pending.shift();
 }
 push(p,v,r){this.impulses.push({p:p.slice(),v:v.slice(),r,ttl:.9});if(this.impulses.length>8)this.impulses.shift();}
 step(dt,speed){
   if(dt===0&&this.pending.length===0)return;
   // Dynamic curve geometry is evaluated ONCE on the CPU, then uploaded as
   // the existing bounded two-curve uniforms to BOTH GPU transport passes.
   this.liveCurves=evaluateLivingCurves(this.flowCurves,this.time+dt,
      this.livingMode,this.livingRate,this.livingAmount);
   const gl=this.gl,U=this.loc;
   gl.useProgram(this.program);gl.bindVertexArray(this.vao);
   gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_3D,this.front);
   gl.uniform1i(U.uPrev,1);
   gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_3D,this.fibers.front);
   gl.uniform1i(U.uFiberPrev,2);gl.uniform1i(U.uFiberEnabled,this.fiberEnabled?1:0);
   gl.uniform1f(U.uFiberGuidance,this.fiberGuidance);
   gl.uniform1f(U.uTime,this.time);gl.uniform1f(U.uDt,dt);
   gl.uniform1f(U.uSpeed,speed);gl.uniform1f(U.uDim,N);gl.uniform1f(U.uSeedPhase,this.seed*.000017);
   gl.uniform1f(U.uTurb,this.turbulence);gl.uniform1i(U.uFlow,FLOW[this.flow]??0);
   gl.uniform1i(U.uIntegrator,this.integration==="midpoint"?1:0);
   gl.uniform1f(U.uFoldWrite,this.foldWrite);gl.uniform1f(U.uFoldPersistence,this.foldPersistence);gl.uniform1f(U.uFoldGrip,this.foldGrip);
   gl.uniform1i(U.uForgeMode,FORGE[this.forgeMode]??0);
   gl.uniform1f(U.uForgePower,this.forgePower);gl.uniform1f(U.uForgeWidth,this.forgeWidth);
   gl.uniform1f(U.uForgePace,this.forgePace);
   const pp=new Float32Array(32),pv=new Float32Array(32);
   for(let i=0;i<this.impulses.length;i++){const s=this.impulses[i];pp.set([...s.p,s.r],i*4);pv.set([...s.v,s.ttl],i*4);}
   gl.uniform1i(U.uImpulseCount,this.impulses.length);gl.uniform4fv(U.uImpulsePos,pp);gl.uniform4fv(U.uImpulseVel,pv);
   const sculptPos=new Float32Array(24),sculptInfo=new Float32Array(24);
   const nSculpt=Math.min(6,this.sculptNodes.length);
   for(let i=0;i<nSculpt;i++){
     const n=this.sculptNodes[i];
     sculptPos.set([...n.p,n.r],i*4);
     sculptInfo.set([({vortex:0,pull:1,push:2})[n.type]??0,n.strength,n.phase||0,0],i*4);
   }
   gl.uniform1i(U.uSculptCount,nSculpt);
   gl.uniform4fv(U.uSculptPos,sculptPos);
   gl.uniform4fv(U.uSculptInfo,sculptInfo);
   const curvePoints=new Float32Array(64),curveInfo=new Float32Array(8);
   const nCurves=Math.min(2,this.liveCurves.length);
   for(let i=0;i<nCurves;i++){
     const c=this.liveCurves[i];
     curveInfo.set([c.points.length,({stream:0,coil:1,gather:2})[c.type]??0,c.strength,c.r],i*4);
     for(let j=0;j<Math.min(8,c.points.length);j++)
       curvePoints.set([...c.points[j],0],i*32+j*4);
   }
   gl.uniform1i(U.uCurveCount,nCurves);
   gl.uniform4fv(U.uCurvePoints,curvePoints);
   gl.uniform4fv(U.uCurveInfo,curveInfo);
   const count=Math.min(16,this.pending.length),sp=new Float32Array(64),sc=new Float32Array(64);
   for(let i=0;i<count;i++){const s=this.pending[i];sp.set([...s.p,s.r],i*4);sc.set([...s.color,0],i*4);}
   gl.uniform1i(U.uStampCount,count);gl.uniform4fv(U.uStampPos,sp);gl.uniform4fv(U.uStampColor,sc);
   gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo);gl.viewport(0,0,N,N);
   for(let z=0;z<N;z++){
     gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,this.back,0,z);
     gl.uniform1f(U.uLayer,z);gl.drawArrays(gl.TRIANGLES,0,3);
   }
   const error=gl.getError();gl.bindFramebuffer(gl.FRAMEBUFFER,null);
   gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_3D,null);
   gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_3D,null);gl.activeTexture(gl.TEXTURE0);
   if(error!==gl.NO_ERROR)throw Error("GPU transport failure: "+error);
   // Both passes read the PREVIOUS textures and only then swap to next state.
   if(dt>0&&this.fiberEnabled)this.fibers.step({
     dye:this.front,time:this.time,dt,speed,seed:this.seed,
     flow:this.flow,turbulence:this.turbulence,integration:this.integration,
     foldGrip:this.foldGrip,fiberGrowth:this.fiberGrowth,
     fiberPersistence:this.fiberPersistence,fiberBend:this.fiberBend,
     fiberGuidance:this.fiberGuidance,impulses:this.impulses,sculptNodes:this.sculptNodes,
     flowCurves:this.liveCurves
   });
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
   const fiberTexture=this.fibers.snapshot();
   return {kind:"gpu",texture,fiberTexture,time:this.time,seed:this.seed,flow:this.flow,
     morphology:this.morphology,turbulence:this.turbulence,integration:this.integration,
     foldWrite:this.foldWrite,foldPersistence:this.foldPersistence,foldGrip:this.foldGrip,
     forgeMode:this.forgeMode,forgePower:this.forgePower,forgeWidth:this.forgeWidth,forgePace:this.forgePace,
     fiberGrowth:this.fiberGrowth,fiberPersistence:this.fiberPersistence,
     fiberBend:this.fiberBend,fiberGuidance:this.fiberGuidance,fiberEnabled:this.fiberEnabled,
     sculptNodes:cloneSculptNodes(this.sculptNodes),
     flowCurves:cloneFlowCurves(this.flowCurves),
     livingMode:this.livingMode,livingRate:this.livingRate,livingAmount:this.livingAmount,
     breederParents:cloneBreederParents(this.breederParents),breederSeed:this.breederSeed,
     breedTraitLocks:normalizeTraitLocks(this.breedTraitLocks),
     breederSources:cloneGeneSources(this.breederSources),geneGallery:cloneGeneGallery(this.geneGallery),geneNextSequence:this.geneNextSequence,
     colorGrade:cloneColorState(this.colorGrade)};
 }
 restore(s){
   if(s.kind!=="gpu")throw Error("Expected a GPU checkpoint");
   this.copyVolume(s.texture,this.front);
   if(s.fiberTexture)this.fibers.restore(s.fiberTexture);
   this.time=s.time;this.seed=s.seed;
   this.flow=s.flow;this.morphology=s.morphology;this.turbulence=s.turbulence||0;this.integration=s.integration||"euler";this.foldWrite=s.foldWrite??1.4;
   this.foldPersistence=s.foldPersistence??.80;this.foldGrip=s.foldGrip??.35;
   this.fiberGrowth=s.fiberGrowth??2.3;this.fiberPersistence=s.fiberPersistence??.88;
   this.fiberBend=s.fiberBend??1;this.fiberGuidance=s.fiberGuidance??.65;
   this.fiberEnabled=s.fiberEnabled??true;
   this.sculptNodes=cloneSculptNodes(s.sculptNodes||[]);
   this.flowCurves=cloneFlowCurves(s.flowCurves||[]);
   this.livingMode=LIVING_MODES.includes(s.livingMode)?s.livingMode:"still";
   this.livingRate=s.livingRate??.65;this.livingAmount=s.livingAmount??.18;
   this.breederParents=cloneBreederParents(s.breederParents);
   this.breederSeed=s.breederSeed??DEFAULT_BREED_SEED;
   this.breedTraitLocks=normalizeTraitLocks(s.breedTraitLocks);
   this.breederSources=cloneGeneSources(s.breederSources);
   this.geneGallery=cloneGeneGallery(s.geneGallery);this.geneNextSequence=s.geneNextSequence??1;
   this.colorGrade=cloneColorState(s.colorGrade);
   this.liveCurves=evaluateLivingCurves(this.flowCurves,this.time,
      this.livingMode,this.livingRate,this.livingAmount);
   this.forgeMode=s.forgeMode??"rosette";this.forgePower=s.forgePower??.75;
   this.forgeWidth=s.forgeWidth??.17;this.forgePace=s.forgePace??.65;
   this.pending.length=0;this.impulses.length=0;this.renderer.texture=this.front;
 }
 release(s){if(s?.kind==="gpu"){if(s.texture)this.gl.deleteTexture(s.texture);this.fibers.release(s.fiberTexture);}}
 reset(source){
   const gl=this.gl;gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_3D,this.front);
   gl.texSubImage3D(gl.TEXTURE_3D,0,0,0,0,N,N,N,gl.RGBA,gl.UNSIGNED_BYTE,source.pack());
   this.fibers.reset(source);
   this.time=source.time;this.seed=source.seed;this.flow=source.flow;this.morphology=source.morphology;
   this.turbulence=source.turbulence||0;this.integration=source.integration||"euler";
   this.foldWrite=source.foldWrite??1.4;this.foldPersistence=source.foldPersistence??.80;this.foldGrip=source.foldGrip??.35;
   this.forgeMode=source.forgeMode??"rosette";this.forgePower=source.forgePower??.75;
   this.forgeWidth=source.forgeWidth??.17;this.forgePace=source.forgePace??.65;
   this.fiberGrowth=source.fiberGrowth??2.3;this.fiberPersistence=source.fiberPersistence??.88;
   this.fiberBend=source.fiberBend??1;this.fiberGuidance=source.fiberGuidance??.65;
   this.fiberEnabled=source.fiberEnabled??true;
   this.sculptNodes=cloneSculptNodes(source.sculptNodes||[]);
   this.flowCurves=cloneFlowCurves(source.flowCurves||[]);
   this.livingMode=LIVING_MODES.includes(source.livingMode)?source.livingMode:"still";
   this.livingRate=source.livingRate??.65;this.livingAmount=source.livingAmount??.18;
   this.breederParents=cloneBreederParents(source.breederParents);
   this.breederSeed=source.breederSeed??DEFAULT_BREED_SEED;
   this.breedTraitLocks=normalizeTraitLocks(source.breedTraitLocks);
   this.breederSources=cloneGeneSources(source.breederSources);
   this.geneGallery=cloneGeneGallery(source.geneGallery);
   this.geneNextSequence=source.geneNextSequence??1;
   this.colorGrade=cloneColorState(source.colorGrade);
   this.liveCurves=evaluateLivingCurves(this.flowCurves,this.time,
      this.livingMode,this.livingRate,this.livingAmount);
   this.pending.length=0;this.impulses.length=0;this.renderer.texture=this.front;
 }
}
