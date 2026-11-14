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
uniform float uGain,uGlow,uShadow,uFoldGlow,uWisp,uPrism;
uniform vec2 uCover;
uniform vec3 uLightDir;
uniform vec2 uCanvasSize;
uniform int uSteps,uLightSteps,uMemoryView;
void main(){
  vec2 uv=(gl_FragCoord.xy/uCanvasSize)*2.0-1.0;
  vec3 direction=normalize(uForward*1.55+uRight*uv.x*uCover.x+uUp*uv.y*uCover.y);
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
      vec4 sampleData=texture(uVolume,sampleUV);
      // A feathered spatial support removes the harsh box-shaped boundary.
      // The underlying persistent 3D density is unchanged.
      float boundary=1.0-max(max(abs(pos.x),abs(pos.y)),abs(pos.z));
      float edgeFade=smoothstep(0.0,.32,boundary);
      vec3 dye=sampleData.rgb*edgeFade;
      float fold=clamp(sampleData.a*uFoldGlow*edgeFade,0.0,2.0);
      float mass=uMemoryView==1?sampleData.a*1.8*edgeFade:(dye.r+dye.g+dye.b);
      if(mass>.008){
        // Integrate optical depth toward the light: 1/2/4 taps by quality.
        // This is an art-directed single-scattering approximation, not a full solver.
        vec3 lightVec=normalize(uLightDir);
        float opticalDepth=0.0;
        float sampleCount=0.0;
        for(int li=0;li<4;li++){
          if(li>=uLightSteps)break;
          vec3 lightUV=sampleUV+lightVec*(.045+float(li)*.085);
          if(any(lessThan(lightUV,vec3(0.0)))||any(greaterThan(lightUV,vec3(1.0))))break;
          opticalDepth+=dot(texture(uVolume,lightUV).rgb,vec3(.3333333));
          sampleCount+=1.0;
        }
        float nearDepth=opticalDepth/max(sampleCount,1.0);
        float shade=clamp(.90+1.65*(mass*.333333-nearDepth),.35,1.4)
                  *exp(-uShadow*opticalDepth*.68);
        vec3 pigment=uMemoryView==1
          ? vec3(.83,.24,1.0)
          : (dye.r*uA+dye.g*uB+dye.b*uC)/max(mass,.0001);
        // Color exchange follows physical 3D position and existing pigment channels.
        // Prism is an art-directed optical effect, not a spectral simulation.
        if(uMemoryView==0&&uPrism>.001){
          vec3 rotated=(dye.r*uB+dye.g*uC+dye.b*uA)/max(mass,.0001);
          float depthPhase=.5+.5*sin(dot(pos,vec3(6.1,4.7,5.3))+fold*8.0);
          pigment=mix(pigment,rotated,clamp(uPrism*.27*depthPhase,0.0,.60));
        }
        // Boundary contrast is evaluated from the actual advected volume,
        // not an independently animated screen-space noise field.
        float wispDetail=0.0;
        if(uMemoryView==0&&uWisp>.001){
          vec3 neighborUV=clamp(sampleUV+vec3(.022,-.017,.020),vec3(0.0),vec3(1.0));
          vec3 neighborDye=texture(uVolume,neighborUV).rgb*edgeFade;
          wispDetail=clamp(length(dye-neighborDye)*3.4*uWisp+fold*.18,0.0,1.0);
        }
        vec3 filamentTint=mix(pigment,
          clamp(pigment*1.27+vec3(.055,.027,.075),vec3(0.0),vec3(1.8)),
          clamp(.42*wispDetail+.16*fold,0.0,.56));
        float alpha=1.0-exp(-mass*uGain*stride*(1.0+.38*fold+.23*wispDetail));
        accum+=trans*alpha*filamentTint*shade*(.76+uGlow*.42)*(1.0+.55*fold+.45*wispDetail);
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
// Crop rather than shrink the 3D subject as the screen becomes wider/taller.
// Both axes have equal angular scale per physical CSS pixel.
export function coverProjection(aspect){
  if(!Number.isFinite(aspect)||aspect<=0)throw Error("Invalid viewport aspect");
  return [Math.min(1,aspect),Math.min(1,1/aspect)];
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
  const [coverX,coverY]=coverProjection(aspect);
  const dir=norm(forward.map((v,i)=>v*1.55+right[i]*x*coverX+up[i]*y*coverY));
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
    const supported=gl.getParameter(gl.MAX_3D_TEXTURE_SIZE);
    if(supported<N)throw Error("GPU only supports 3D textures up to "+supported+"; needs "+N);
    const prog=gl.createProgram(),vs=compile(gl,gl.VERTEX_SHADER,vertex),fs=compile(gl,gl.FRAGMENT_SHADER,fragment);
    gl.attachShader(prog,vs);gl.attachShader(prog,fs);gl.linkProgram(prog);
    if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw Error("GL link: "+gl.getProgramInfoLog(prog));
    gl.deleteShader(vs);gl.deleteShader(fs);this.prog=prog;
    this.locations={};
    for(const name of ["uVolume","uEye","uForward","uRight","uUp","uA","uB","uC","uBg","uCover","uGain","uGlow","uSteps","uCanvasSize","uLightDir","uShadow","uLightSteps","uFoldGlow","uMemoryView","uWisp","uPrism"])this.locations[name]=gl.getUniformLocation(prog,name);
    this.texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_3D,this.texture);
    gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_WRAP_R,gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
    gl.texImage3D(gl.TEXTURE_3D,0,gl.RGBA8,N,N,N,0,gl.RGBA,gl.UNSIGNED_BYTE,field.pack());
    const uploadError=gl.getError();
    if(uploadError!==gl.NO_ERROR)throw Error("3D texture upload failed (WebGL error "+uploadError+")");
    this.vao=gl.createVertexArray();this.uploaded=true;
  }
  upload(){
    const gl=this.gl;if(this.externalSource||!this.field.dirty)return;
    gl.bindTexture(gl.TEXTURE_3D,this.texture);
    gl.texSubImage3D(gl.TEXTURE_3D,0,0,0,0,N,N,N,gl.RGBA,gl.UNSIGNED_BYTE,this.field.pack());
  }
  draw(camera,colors,opts){
    const gl=this.gl,canvas=this.canvas,rect=canvas.getBoundingClientRect();
    // Preserve the exact CSS aspect ratio while respecting the mobile pixel
    // budget. Per-axis clipping used to distort the ray aspect on tall phones.
    const pixelRatio=Math.min(window.devicePixelRatio||1,1.3);
    const maxSide=Math.max(1,rect.width,rect.height);
    const surface=Math.max(1,rect.width*rect.height);
    const scale=Math.min(pixelRatio,780/maxSide,Math.sqrt(420000/surface));
    const w=Math.max(1,Math.round(rect.width*scale));
    const h=Math.max(1,Math.round(rect.height*scale));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    this.upload();gl.viewport(0,0,w,h);gl.useProgram(this.prog);gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_3D,this.texture);
    const U=this.locations,c=cameraVectors(camera);
    gl.uniform1i(U.uVolume,0);gl.uniform3fv(U.uEye,c.eye);gl.uniform3fv(U.uForward,c.forward);
    gl.uniform3fv(U.uRight,c.right);gl.uniform3fv(U.uUp,c.up);
    gl.uniform3fv(U.uA,colors[0]);gl.uniform3fv(U.uB,colors[1]);gl.uniform3fv(U.uC,colors[2]);gl.uniform3fv(U.uBg,opts.background);
    gl.uniform2fv(U.uCover,coverProjection(w/h));gl.uniform1f(U.uGain,opts.gain);gl.uniform1f(U.uGlow,opts.glow);
    gl.uniform1i(U.uSteps,opts.steps);gl.uniform2f(U.uCanvasSize,w,h);
    gl.uniform3fv(U.uLightDir,opts.lightDir);gl.uniform1f(U.uShadow,opts.shadow);
    gl.uniform1i(U.uLightSteps,opts.lightSteps||1);
    gl.uniform1f(U.uFoldGlow,opts.foldGlow??1);
    gl.uniform1i(U.uMemoryView,opts.memoryView||0);
    gl.uniform1f(U.uWisp,opts.wisp??0);
    gl.uniform1f(U.uPrism,opts.prism??0);
    gl.drawArrays(gl.TRIANGLES,0,3);
  }
}
