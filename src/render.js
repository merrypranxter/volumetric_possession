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
uniform sampler3D uVolume,uFiberVolume;
uniform vec3 uEye,uForward,uRight,uUp,uA,uB,uC,uBg;
uniform float uGain,uGlow,uShadow,uFoldGlow,uWisp,uPrism,uFiberLight;
uniform vec2 uCover;
uniform vec3 uLightDir;
uniform vec2 uCanvasSize;
uniform int uSteps,uLightSteps,uMemoryView;
uniform float uNeon,uWindingGlow;
uniform vec4 uGradeLens;
uniform int uWindCount;
uniform vec3 uWinding[6];

// The host's ordinary final display pixels are clamped to [0,1] before
// display-sRGB OKLab grading. Off means exact bypass, no palette mutation.
vec3 toLinear(vec3 s){
  return mix(s/12.92,pow((s+.055)/1.055,vec3(2.4)),step(vec3(.04045),s));
}
vec3 fromLinear(vec3 s){
  s=max(s,vec3(0.0));
  return mix(s*12.92,1.055*pow(s,vec3(1.0/2.4))-.055,step(vec3(.0031308),s));
}
vec3 labFromLinear(vec3 v){
  vec3 lms=vec3(dot(v,vec3(.4122214708,.5363325363,.0514459929)),
    dot(v,vec3(.2119034982,.6806995451,.1073969566)),
    dot(v,vec3(.0883024619,.2817188376,.6299787005)));
  lms=pow(max(lms,vec3(0.0)),vec3(1.0/3.0));
  return vec3(dot(lms,vec3(.2104542553,.7936177850,-.0040720468)),
    dot(lms,vec3(1.9779984951,-2.4285922050,.4505937099)),
    dot(lms,vec3(.0259040371,.7827717662,-.8086757660)));
}
vec3 linearFromLab(vec3 lab){
  float l=lab.x+.3963377774*lab.y+.2158037573*lab.z;
  float m=lab.x-.1055613458*lab.y-.0638541728*lab.z;
  float s=lab.x-.0894841775*lab.y-1.2914855480*lab.z;
  vec3 x=vec3(l*l*l,m*m*m,s*s*s);
  return vec3(dot(x,vec3(4.0767416621,-3.3077115913,.2309699292)),
    dot(x,vec3(-1.2684380046,2.6097574011,-.3413193965)),
    dot(x,vec3(-.0041960863,-.7034186147,1.7076147010)));
}
vec3 gradeNeon(vec3 encoded,vec2 uv){
  // The host's original art-directed output may contain values above 1.
  // Never flatten already-blooming channels when chroma grading is enabled.
  if(any(greaterThanEqual(encoded,vec3(.995))))return encoded;
  vec3 lab=labFromLinear(toLinear(clamp(encoded,0.0,1.0)));
  float C=length(lab.yz);
  // Guard intentional darkness, glowing whites and almost-neutral grays.
  float protection=smoothstep(.07,.25,lab.x)*(1.0-smoothstep(.79,.98,lab.x))
    *smoothstep(.008,.045,C);
  float lensMask=1.0;
  if(uGradeLens.w>.5){
    vec2 dd=(uv-uGradeLens.xy)*vec2(uCanvasSize.x/uCanvasSize.y,1.0);
    lensMask=exp(-dot(dd,dd)/(2.0*uGradeLens.z*uGradeLens.z));
  }
  float requested=clamp(uNeon*protection*lensMask,0.0,2.0);
  if(requested<.002)return encoded;
  float target=C*(1.0+requested*1.35);
  float low=C,high=target;
  // OKLab chroma-direction gamut search: no arbitrary RGB channel clipping.
  for(int i=0;i<7;i++){
    float mid=(low+high)*.5;
    vec2 ab=lab.yz*(mid/max(C,1e-5));
    vec3 linear=linearFromLab(vec3(lab.x,ab));
    if(all(greaterThanEqual(linear,vec3(-.0001)))&&
       all(lessThanEqual(linear,vec3(1.0001))))low=mid;
    else high=mid;
  }
  vec3 graded=fromLinear(linearFromLab(vec3(lab.x,lab.yz*(low/max(C,1e-5)))));
  return clamp(graded,0.0,1.0);
}
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
      vec4 fiberSample=texture(uFiberVolume,sampleUV);
      float coherence=fiberSample.a;
      vec3 tangent=normalize(fiberSample.rgb*2.0-1.0+vec3(.00001));
      // A feathered spatial support removes the harsh box-shaped boundary.
      // The underlying persistent 3D density is unchanged.
      float boundary=1.0-max(max(abs(pos.x),abs(pos.y)),abs(pos.z));
      float edgeFade=smoothstep(0.0,.32,boundary);
      vec3 dye=sampleData.rgb*edgeFade;
      float fold=clamp(sampleData.a*uFoldGlow*edgeFade,0.0,2.0);
      float mass=uMemoryView==1?sampleData.a*1.8*edgeFade:
        uMemoryView==2?coherence*1.8*edgeFade:(dye.r+dye.g+dye.b);
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
          : uMemoryView==2
          ? abs(tangent)*.86+vec3(.08)
          : (dye.r*uA+dye.g*uB+dye.b*uC)/max(mass,.0001);
        // Anisotropic filament light: a stored world-space tangent catches
        // light according to its angle to the light/view half vector.
        vec3 halfVector=normalize(normalize(uLightDir)-direction+vec3(.00001));
        float cylinder=pow(clamp(1.0-abs(dot(tangent,halfVector)),0.0,1.0),6.0);
        float fiberShine=clamp(uFiberLight*coherence*(.2+.8*cylinder),0.0,2.0);
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
        float alpha=1.0-exp(-mass*uGain*stride*(1.0+.38*fold+.23*wispDetail+.40*fiberShine));
        accum+=trans*alpha*filamentTint*shade*(.76+uGlow*.42)
          *(1.0+.55*fold+.45*wispDetail+.75*fiberShine);
        trans*=1.0-alpha;
        if(trans<.015)break;
      }
    }
  }
  vec3 color=accum+trans*uBg;
  color=color/(vec3(1.0)+color*.29);
  vec3 encoded=pow(max(color,vec3(0.0)),vec3(.82));
  vec2 screenUV=gl_FragCoord.xy/uCanvasSize;
  // A measured index of the authored 2D XY flow slice, projected here
  // only for an optional read-only chromatic marker (not volume genus).
  if(uWindCount>0&&uWindingGlow>0.0){
    for(int i=0;i<6;i++){
      if(i>=uWindCount)break;
      vec3 defect=uWinding[i];
      vec2 q=(screenUV-defect.xy)*vec2(uCanvasSize.x/uCanvasSize.y,1.0);
      float d=length(q);
      float halo=exp(-d*d/.0064)*clamp(uWindingGlow,0.0,2.0);
      vec3 source=defect.z>0.0?uB:uC;
      float ink=clamp(length(encoded)*.9,0.0,1.0);
      encoded=mix(encoded,clamp(encoded*.48+source*.92,0.0,1.0),
        clamp(halo*ink*.5,0.0,.72));
    }
  }
  if(uNeon>.001)encoded=gradeNeon(encoded,screenUV);
  outColor=vec4(encoded,1.0);
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
// Mathematically inverse of the cover-projection camera ray. Used to pick
// persistent sculpt handles without a separate/incorrect screen-space camera.
export function projectToScreen(canvas,camera,point){
  const rect=canvas.getBoundingClientRect();
  const {eye,forward,right,up}=cameraVectors(camera);
  const relative=point.map((v,i)=>v-eye[i]);
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const distance=dot(relative,forward);
  if(distance<.01)return null;
  const [cx,cy]=coverProjection(rect.width/rect.height);
  const uvx=dot(relative,right)/distance*1.55/cx;
  const uvy=dot(relative,up)/distance*1.55/cy;
  return {x:(uvx+1)*rect.width*.5,y:(1-uvy)*rect.height*.5,visible:Math.abs(uvx)<1.08&&Math.abs(uvy)<1.08};
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
    for(const name of ["uVolume","uFiberVolume","uFiberLight","uEye","uForward","uRight","uUp","uA","uB","uC","uBg","uCover","uGain","uGlow","uSteps","uCanvasSize","uLightDir","uShadow","uLightSteps","uFoldGlow","uMemoryView","uWisp","uPrism","uNeon","uGradeLens","uWindCount","uWindingGlow","uWinding[0]"])this.locations[name]=gl.getUniformLocation(prog,name);
    this.texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_3D,this.texture);
    gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_WRAP_R,gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
    gl.texImage3D(gl.TEXTURE_3D,0,gl.RGBA8,N,N,N,0,gl.RGBA,gl.UNSIGNED_BYTE,field.pack());
    const uploadError=gl.getError();
    if(uploadError!==gl.NO_ERROR)throw Error("3D texture upload failed (WebGL error "+uploadError+")");
    this.fiberTexture=gl.createTexture();
    gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_3D,this.fiberTexture);
    gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    for(const dir of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T,gl.TEXTURE_WRAP_R])
      gl.texParameteri(gl.TEXTURE_3D,dir,gl.CLAMP_TO_EDGE);
    gl.texImage3D(gl.TEXTURE_3D,0,gl.RGBA8,N,N,N,0,gl.RGBA,gl.UNSIGNED_BYTE,field.packFibers());
    gl.activeTexture(gl.TEXTURE0);
    const fiberError=gl.getError();
    if(fiberError!==gl.NO_ERROR)throw Error("3D fiber texture upload failed: "+fiberError);
    this.vao=gl.createVertexArray();this.uploaded=true;
  }
  upload(){
    const gl=this.gl;if(this.externalSource)return;
    if(this.field.dirty){
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_3D,this.texture);
      gl.texSubImage3D(gl.TEXTURE_3D,0,0,0,0,N,N,N,gl.RGBA,gl.UNSIGNED_BYTE,this.field.pack());
    }
    if(this.field.fibers.dirty){
      gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_3D,this.fiberTexture);
      gl.texSubImage3D(gl.TEXTURE_3D,0,0,0,0,N,N,N,gl.RGBA,gl.UNSIGNED_BYTE,this.field.packFibers());
      gl.activeTexture(gl.TEXTURE0);
    }
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
    gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_3D,this.fiberTexture);
    gl.activeTexture(gl.TEXTURE0);
    const U=this.locations,c=cameraVectors(camera);
    gl.uniform1i(U.uVolume,0);gl.uniform1i(U.uFiberVolume,2);
    gl.uniform1f(U.uFiberLight,opts.fiberLight??0);
    gl.uniform3fv(U.uEye,c.eye);gl.uniform3fv(U.uForward,c.forward);
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
    const grade=opts.colorGrade||{neon:0,mode:"full",lens:[.5,.5],radius:.3,defectGlow:0};
    gl.uniform1f(U.uNeon,grade.neon||0);
    gl.uniform4f(U.uGradeLens,grade.lens?.[0]??.5,grade.lens?.[1]??.5,
      grade.radius??.3,grade.mode==="lens"?1:0);
    const defects=(opts.windingDefects||[]).slice(0,6);
    const packed=new Float32Array(18);
    for(let i=0;i<defects.length;i++){
      packed[3*i]=defects[i].uv[0];
      packed[3*i+1]=defects[i].uv[1];
      packed[3*i+2]=defects[i].charge;
    }
    gl.uniform1i(U.uWindCount,defects.length);
    gl.uniform1f(U.uWindingGlow,grade.defectGlow||0);
    gl.uniform3fv(U["uWinding[0]"],packed);
    gl.drawArrays(gl.TRIANGLES,0,3);
  }
}
