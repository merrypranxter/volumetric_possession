// A second persistent WebGL2 volume: encoded tangent (RGB) + coherence (A).
import {N} from "./field.js";
const BODY="\nvoid main(){\n ivec3 cell=ivec3(ivec2(gl_FragCoord.xy),int(uLayer));\n vec3 pos=vec3(2.0*gl_FragCoord.xy/uDim-1.0,2.0*(uLayer+.5)/uDim-1.0);\n vec3 v=velocity(pos,uTime+uDt);\n if(uIntegrator==1){vec3 mid=pos-v*.5*uDt;v=velocity(mid,uTime+.5*uDt);}\n vec4 local=texelFetch(uFiberPrev,cell,0);\n v*=1.0-.35*uFoldGrip*texelFetch(uPrev,cell,0).a;\n if(uFiberGuidance>0.0&&local.a>.001){\n  vec3 axis=normalize(local.rgb*2.0-1.0+vec3(.00001));\n  float grip=clamp(.55*uFiberGuidance*local.a,0.0,.75);\n  v=mix(v,axis*dot(v,axis),grip);\n }\n vec3 back=clamp(pos-v*uDt,vec3(-1),vec3(1));\n vec4 advected=texture(uFiberPrev,back*.5+.5);\n float coherence=advected.a;\n float mass=min(1.0,dot(texture(uPrev,back*.5+.5).rgb,vec3(1.0)));\n if(mass<.005&&coherence<.002){fragColor=vec4(1.0,.5,.5,0.0);return;}\n ivec3 hi=ivec3(int(uDim)-1);\n vec3 gradient=vec3(0);\n for(int a=0;a<3;a++){\n  ivec3 stepAxis=ivec3(a==0?1:0,a==1?1:0,a==2?1:0);\n  vec3 p=texelFetch(uPrev,clamp(cell+stepAxis,ivec3(0),hi),0).rgb;\n  vec3 m=texelFetch(uPrev,clamp(cell-stepAxis,ivec3(0),hi),0).rgb;\n  gradient[a]=(dot(p,vec3(1.0))-dot(m,vec3(1.0)))/3.0;\n }\n vec3 tangent=coherence>.006?advected.rgb*2.0-1.0:cross(gradient,v);\n if(length(tangent)<.00001)tangent=vec3(-gradient.y,gradient.x,0.0);\n if(length(tangent)<.00001)tangent=vec3(1.0,0.0,0.0);\n tangent=normalize(tangent);\n float h=.065;\n vec3 dv=(velocity(pos+h*tangent,uTime+uDt)-velocity(pos-h*tangent,uTime+uDt))/(2.0*h);\n vec3 changed=tangent+uDt*uFiberBend*dv;\n if(length(changed)<.00001)changed=tangent;\n tangent=normalize(changed);\n float stretch=clamp(dot(tangent,dv),0.0,2.0);\n float activity=clamp(length(gradient)*2.5,0.0,1.0);\n float fade=exp(-uDt*(.045+1.2*(1.0-uFiberPersistence)));\n float nextC=clamp(coherence*fade+uDt*uFiberGrowth*activity*mass*(.8+.2*stretch),0.0,1.0);\n fragColor=vec4(tangent*.5+.5,nextC);\n}";
function volume(gl){
 const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_3D,tex);
 for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_3D,p,gl.LINEAR);
 for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T,gl.TEXTURE_WRAP_R])gl.texParameteri(gl.TEXTURE_3D,p,gl.CLAMP_TO_EDGE);
 gl.texImage3D(gl.TEXTURE_3D,0,gl.RGBA8,N,N,N,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
 return tex;
}
function shader(gl,type,source){
 const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
 if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error("Fiber GLSL "+gl.getShaderInfoLog(s));
 return s;
}
export class GPUFiberMemory{
 constructor(renderer,vertex,pigment){
  const gl=renderer.gl;this.gl=gl;this.renderer=renderer;
  const split=pigment.indexOf("void main(){");
  if(split<0)throw Error("Missing pigment shader velocity definitions");
  const program=gl.createProgram(),v=shader(gl,gl.VERTEX_SHADER,vertex);
  const f=shader(gl,gl.FRAGMENT_SHADER,pigment.slice(0,split)+BODY);
  gl.attachShader(program,v);gl.attachShader(program,f);gl.linkProgram(program);
  gl.deleteShader(v);gl.deleteShader(f);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error("Fiber shader link "+gl.getProgramInfoLog(program));
  this.program=program;this.vao=gl.createVertexArray();
  this.front=renderer.fiberTexture;this.back=volume(gl);
  this.fbo=gl.createFramebuffer();this.copyFbo=gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo);
  gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,this.back,0,0);
  const ready=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  if(!ready)throw Error("GPU fiber layer framebuffer unavailable");
  this.loc={};
  for(const name of ["uPrev","uFiberPrev","uLayer","uDim","uTime","uDt","uSpeed","uSeedPhase","uTurb","uFlow","uIntegrator","uFoldGrip","uFiberGuidance","uFiberGrowth","uFiberBend","uFiberPersistence","uImpulseCount","uImpulsePos","uImpulseVel"]){
   this.loc[name]=gl.getUniformLocation(program,["uImpulsePos","uImpulseVel"].includes(name)?name+"[0]":name);
  }
 }
 step(c){
  const gl=this.gl,U=this.loc;
  gl.useProgram(this.program);gl.bindVertexArray(this.vao);
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_3D,c.dye);
  gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_3D,this.front);
  gl.uniform1i(U.uPrev,1);gl.uniform1i(U.uFiberPrev,2);
  for(const [name,val] of Object.entries({uTime:c.time,uDt:c.dt,uSpeed:c.speed,uDim:N,
    uSeedPhase:c.seed*.000017,uTurb:c.turbulence,uFoldGrip:c.foldGrip,
    uFiberGuidance:c.fiberGuidance,uFiberGrowth:c.fiberGrowth,
    uFiberBend:c.fiberBend,uFiberPersistence:c.fiberPersistence}))gl.uniform1f(U[name],val);
  gl.uniform1i(U.uFlow,({cathedral:0,beltrami:1,countercurrent:2})[c.flow]??0);
  gl.uniform1i(U.uIntegrator,c.integration==="midpoint"?1:0);
  const pp=new Float32Array(32),pv=new Float32Array(32);
  const n=Math.min(8,c.impulses.length);
  for(let i=0;i<n;i++){const q=c.impulses[i];pp.set([...q.p,q.r],i*4);pv.set([...q.v,q.ttl],i*4);}
  gl.uniform1i(U.uImpulseCount,n);gl.uniform4fv(U.uImpulsePos,pp);gl.uniform4fv(U.uImpulseVel,pv);
  gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo);gl.viewport(0,0,N,N);
  for(let z=0;z<N;z++){
    gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,this.back,0,z);
    gl.uniform1f(U.uLayer,z);gl.drawArrays(gl.TRIANGLES,0,3);
  }
  const err=gl.getError();
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_3D,null);
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_3D,null);
  gl.activeTexture(gl.TEXTURE0);
  if(err!==gl.NO_ERROR)throw Error("Fiber transport GPU error "+err);
  [this.front,this.back]=[this.back,this.front];this.renderer.fiberTexture=this.front;
 }
 copy(src,dst){
  const gl=this.gl;gl.bindFramebuffer(gl.FRAMEBUFFER,this.copyFbo);gl.bindTexture(gl.TEXTURE_3D,dst);
  for(let z=0;z<N;z++){
    gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,src,0,z);
    gl.copyTexSubImage3D(gl.TEXTURE_3D,0,0,0,z,0,0,N,N);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindTexture(gl.TEXTURE_3D,null);
  const e=gl.getError();if(e!==gl.NO_ERROR)throw Error("Fiber snapshot GPU error "+e);
 }
 snapshot(){const t=volume(this.gl);this.copy(this.front,t);return t;}
 restore(t){if(t)this.copy(t,this.front);else throw Error("Missing GPU fiber checkpoint");this.renderer.fiberTexture=this.front;}
 release(t){if(t)this.gl.deleteTexture(t);}
 reset(field){
  const gl=this.gl;gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_3D,this.front);
  gl.texSubImage3D(gl.TEXTURE_3D,0,0,0,0,N,N,N,gl.RGBA,gl.UNSIGNED_BYTE,field.packFibers());
  gl.bindTexture(gl.TEXTURE_3D,null);this.renderer.fiberTexture=this.front;
 }
}