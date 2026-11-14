import {forgeAt,forgePhase,FORGE_MODES} from "./filament-forge.js";
import {FiberMemory} from "./fiber-memory.js";
import {cloneSculptNodes,sculptVelocity} from "./flow-sculpt.js";
import {cloneFlowCurves,curveVelocity} from "./flow-curve.js";
import {evaluateLivingCurves,LIVING_MODES} from "./living-braid.js";
import {cloneBreederParents,DEFAULT_BREED_SEED} from "./curve-breeder.js";
import {cloneGeneGallery,cloneGeneSources} from "./gene-gallery.js";
import {normalizeTraitLocks} from "./trait-locks.js";
// Persistent CPU 3D dye field. The analytic vortices are divergence-free individually.
// Semi-Lagrangian transport is approximate and dissipative, not a Navier-Stokes solver.
export const N = 28;
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const index = (x,y,z) => 4*(x+N*(y+N*z));
function random(seed){let t=seed>>>0;return ()=>{t+=0x6D2B79F5;let r=Math.imul(t^(t>>>15),1|t);r^=r+Math.imul(r^(r>>>7),61|r);return ((r^(r>>>14))>>>0)/4294967296;};}
export class PigmentField {

  constructor(seed=1226){
    this.a=new Float32Array(N*N*N*4);this.b=new Float32Array(this.a.length);
    this.bytes=new Uint8Array(this.a.length);this.impulses=[];this.turbulence=0;this.integration="euler";
    this.foldWrite=1.4;this.foldPersistence=.80;this.foldGrip=.35;
    this.fibers=new FiberMemory(N);this.fiberGrowth=2.3;this.fiberPersistence=.88;
    this.fiberBend=1;this.fiberGuidance=.65;this.fiberEnabled=true;
    this.sculptNodes=[];this.flowCurves=[];
    this.livingMode="still";this.livingRate=.65;this.livingAmount=.18;this._stepCurves=null;
    this.breederParents=cloneBreederParents();this.breederSeed=DEFAULT_BREED_SEED;this.breedTraitLocks=normalizeTraitLocks();
    this.breederSources=cloneGeneSources();this.geneGallery=[];this.geneNextSequence=1;
    this.forgeMode="rosette";this.forgePower=.75;this.forgeWidth=.17;this.forgePace=.65;
    this.flow="cathedral";this.morphology="cathedral";this.time=0;this.dirty=true;this.reset(seed);
  }
  reset(seed,morphology=this.morphology){
    const valid=["cathedral","gyroid","trefoil","braid"];
    if(!valid.includes(morphology))throw Error("Unknown genesis morphology: "+morphology);
    this.seed=seed>>>0;this.morphology=morphology;this.time=0;this.impulses.length=0;
    this.sculptNodes=[];this.flowCurves=[];this._stepCurves=null; // Restart clears authored geometry.
    this.fibers.reset();
    const rng=random(this.seed),sx=rng()*.32-.16,sy=rng()*.22-.11,sz=rng()*.30-.15;
    // Pre-sample the closed trefoil core, so genesis is deterministic and inexpensive.
    const knot=[];
    if(morphology==="trefoil")for(let n=0;n<84;n++){
      const t=n/84*Math.PI*2;
      knot.push([.27*(Math.sin(t)+2*Math.sin(2*t)),.27*(Math.cos(t)-2*Math.cos(2*t)),.34*Math.sin(3*t),t]);
    }
    for(let z=0;z<N;z++)for(let y=0;y<N;y++)for(let x=0;x<N;x++){
      const px=2*(x+.5)/N-1,py=2*(y+.5)/N-1,pz=2*(z+.5)/N-1;
      const qx=px-sx,qy=py-sy,qz=pz-sz,rad=Math.hypot(qx,qz);
      const c=[0,0,0],envelope=Math.exp(-.25*(px*px+py*py+pz*pz));
      if(morphology==="cathedral"){
        const torus=Math.exp(-((rad-.52)**2*49+qy*qy*15));
        const plume=Math.exp(-((px+.27)**2*8+(py+.25)**2*13+(pz-.16)**2*13));
        const ribbon=Math.exp(-((rad-.28)**2*36+(qy-.45*Math.sin(Math.atan2(qz,qx)*2))**2*21));
        c[0]=.74*torus+.11*plume;c[1]=.65*plume+.18*ribbon;c[2]=.58*ribbon+.10*torus;
      }else if(morphology==="gyroid"){
        const k=5.2;
        const g=Math.sin(k*qx)*Math.cos(k*qy)+Math.sin(k*qy)*Math.cos(k*qz)+Math.sin(k*qz)*Math.cos(k*qx);
        c[0]=.76*Math.exp(-Math.pow(g-.18,2)*7)*envelope;
        c[1]=.52*Math.exp(-Math.pow(g+.64,2)*11)*envelope;
        c[2]=.46*Math.exp(-Math.pow(g-1.04,2)*17)*envelope;
      }else if(morphology==="trefoil"){
        let dist2=Infinity,phase=0;
        for(const node of knot){
          const dx=px-node[0],dy=py-node[1],dz=pz-node[2],d2=dx*dx+dy*dy+dz*dz;
          if(d2<dist2){dist2=d2;phase=node[3];}
        }
        const tube=Math.exp(-dist2*63);
        c[0]=tube*(.38+.62*(.5+.5*Math.sin(phase*3)));
        c[1]=tube*(.28+.72*(.5+.5*Math.sin(phase*3+2.09)));
        c[2]=tube*(.28+.72*(.5+.5*Math.sin(phase*3+4.19)));
      }else{
        const taper=Math.exp(-.65*pz*pz);
        for(let j=0;j<3;j++){
          const phase=5.5*pz+j*2*Math.PI/3;
          const cx=.37*Math.cos(phase)+sx,cy=.37*Math.sin(phase)+sy;
          const d2=(px-cx)**2+(py-cy)**2;
          c[j]=.85*Math.exp(-d2*43)*taper;
        }
      }
      const i=index(x,y,z),variation=.91+.09*rng();
      this.a[i]=clamp(c[0]*variation,0,1);
      this.a[i+1]=clamp(c[1]*variation,0,1);
      this.a[i+2]=clamp(c[2]*variation,0,1);this.a[i+3]=0; // A = advected fold-memory, not opacity.
    }
    this.dirty=true;
  }
  snapshot(){return {seed:this.seed,morphology:this.morphology,flow:this.flow,turbulence:this.turbulence,integration:this.integration,foldWrite:this.foldWrite,foldPersistence:this.foldPersistence,foldGrip:this.foldGrip,
    fiberGrowth:this.fiberGrowth,fiberPersistence:this.fiberPersistence,fiberBend:this.fiberBend,
    fiberGuidance:this.fiberGuidance,fiberEnabled:this.fiberEnabled,fibers:this.fibers.snapshot(),
    sculptNodes:cloneSculptNodes(this.sculptNodes),flowCurves:cloneFlowCurves(this.flowCurves),
    livingMode:this.livingMode,livingRate:this.livingRate,livingAmount:this.livingAmount,
    breederParents:cloneBreederParents(this.breederParents),breederSeed:this.breederSeed,breedTraitLocks:normalizeTraitLocks(this.breedTraitLocks),
    breederSources:cloneGeneSources(this.breederSources),geneGallery:cloneGeneGallery(this.geneGallery),geneNextSequence:this.geneNextSequence,forgeMode:this.forgeMode,forgePower:this.forgePower,forgeWidth:this.forgeWidth,forgePace:this.forgePace,time:this.time,values:this.a.slice()};}
  restore(s){
    this.seed=s.seed;this.morphology=s.morphology||"cathedral";this.flow=s.flow||"cathedral";
    this.time=s.time;this.turbulence=s.turbulence||0;this.integration=s.integration||"euler";this.foldWrite=s.foldWrite??1.4;
    this.foldPersistence=s.foldPersistence??.80;this.foldGrip=s.foldGrip??.35;
    this.fiberGrowth=s.fiberGrowth??2.3;this.fiberPersistence=s.fiberPersistence??.88;
    this.fiberBend=s.fiberBend??1;this.fiberGuidance=s.fiberGuidance??.65;
    this.fiberEnabled=s.fiberEnabled??true;this.fibers.restore(s.fibers);
    this.sculptNodes=cloneSculptNodes(s.sculptNodes||[]);
    this.flowCurves=cloneFlowCurves(s.flowCurves||[]);
    this.livingMode=LIVING_MODES.includes(s.livingMode)?s.livingMode:"still";
    this.livingRate=s.livingRate??.65;this.livingAmount=s.livingAmount??.18;this._stepCurves=null;
    this.breederParents=cloneBreederParents(s.breederParents);this.breederSeed=s.breederSeed??DEFAULT_BREED_SEED;this.breedTraitLocks=normalizeTraitLocks(s.breedTraitLocks);
    this.breederSources=cloneGeneSources(s.breederSources);
    this.geneGallery=cloneGeneGallery(s.geneGallery);this.geneNextSequence=s.geneNextSequence??1;
    this.forgeMode=FORGE_MODES.includes(s.forgeMode)?s.forgeMode:"rosette";
    this.forgePower=s.forgePower??.75;this.forgeWidth=s.forgeWidth??.17;this.forgePace=s.forgePace??.65;
    this.a.set(s.values);this.impulses.length=0;this.dirty=true;
  }
  stamp(p,r,channel,amount=.38){
    const lo=p.map(v=>clamp(Math.floor((v-r+1)*N*.5),0,N-1));
    const hi=p.map(v=>clamp(Math.ceil((v+r+1)*N*.5),0,N-1));
    for(let z=lo[2];z<=hi[2];z++)for(let y=lo[1];y<=hi[1];y++)for(let x=lo[0];x<=hi[0];x++){
      const dx=2*(x+.5)/N-1-p[0],dy=2*(y+.5)/N-1-p[1],dz=2*(z+.5)/N-1-p[2],d=(dx*dx+dy*dy+dz*dz)/(r*r);
      if(d>=1)continue;
      const i=index(x,y,z)+channel,w=(1-d)*(1-d);this.a[i]=clamp(this.a[i]+amount*w,0,1);
    }
    this.dirty=true;
  }
  push(p,v,r){this.impulses.push({p:p.slice(),v:v.slice(),r,ttl:.9});if(this.impulses.length>16)this.impulses.shift();}


  velocity(x,y,z,speed,out,t=this.time){
    const k=this.seed*.000017;
    let vx=0,vy=0,vz=0;
    if(this.flow==="cathedral"){
      // Three Gaussian-windowed rotational vortices; each is divergence-free.
      const x0=x-Math.sin(t*.24+k)*.22,y0=y,z0=z;
      const w0=1.38*Math.exp(-(x0*x0+y0*y0+z0*z0)/1.1025)*speed;
      const x1=x-.20,y1=y-Math.cos(t*.19+k)*.23,z1=z-.15;
      const w1=-1.15*Math.exp(-(x1*x1+y1*y1+z1*z1)/.9025)*speed;
      const x2=x+.15,y2=y-.12,z2=z-Math.sin(t*.17)*.19;
      const w2=.9*Math.exp(-(x2*x2+y2*y2+z2*z2))*speed;
      vx=z0*w0-y2*w2;vy=-z1*w1+x2*w2;vz=-x0*w0+y1*w1;
    }else if(this.flow==="beltrami"){
      // ABC flow: each velocity component is independent of its own coordinate;
      // divergence is exactly zero. Phase varies, preserving that property.
      const p=t*.16+k,w=Math.PI*1.25;
      vx=speed*.38*(.72*Math.sin(w*z+p)+.91*Math.cos(w*y-p));
      vy=speed*.38*(.91*Math.sin(w*x+p)+.72*Math.cos(w*z-p));
      vz=speed*.38*(.83*Math.sin(w*y+p)+.91*Math.cos(w*x-p));
    }else if(this.flow==="countercurrent"){
      // Two time-dependent counter-rotating localized vortex filaments.
      const dx=x-.28*Math.sin(t*.19+k),dy=y-.27,dz=z+.18;
      const dx2=x+.28*Math.sin(t*.19+k),dy2=y+.27,dz2=z-.18;
      const w1=1.42*Math.exp(-(dx*dx+dy*dy+dz*dz)/.58)*speed;
      const w2=-1.42*Math.exp(-(dx2*dx2+dy2*dy2+dz2*dz2)/.58)*speed;
      vx=dz*w1+dz2*w2;vy=0;vz=-dx*w1-dx2*w2;
    }else{
      throw Error("Unknown motion field: "+this.flow);
    }
    const h=this.turbulence||0;
    vx+=h*.15*(Math.sin(4.1*z+t*.53+k)+.55*Math.cos(6.7*y-t*.39));
    vy+=h*.15*(Math.sin(4.1*x-t*.47+k)+.55*Math.cos(6.7*z+t*.28));
    vz+=h*.15*(Math.sin(4.1*y+t*.32+k)+.55*Math.cos(6.7*x-t*.37));
    // Touch impulses deliberately not claimed divergence-free; a later pressure
    // projection phase will handle physically constrained gestures.
    for(const impulse of this.impulses){
      const dx=x-impulse.p[0],dy=y-impulse.p[1],dz=z-impulse.p[2],d2=dx*dx+dy*dy+dz*dz;
      if(d2>impulse.r*impulse.r*9)continue;
      const w=Math.exp(-d2/(impulse.r*impulse.r*2))*impulse.ttl/.9;
      vx+=impulse.v[0]*w;vy+=impulse.v[1]*w;vz+=impulse.v[2]*w;
    }
    out[0]=vx;out[1]=vy;out[2]=vz;
    sculptVelocity(this.sculptNodes,x,y,z,t,out);
    curveVelocity(this._stepCurves||evaluateLivingCurves(this.flowCurves,t,
      this.livingMode,this.livingRate,this.livingAmount),x,y,z,t,out);
  }
  step(dt,speed){
    // Cache effective moving geometry ONCE per step, not per 28³ voxel.
    this._stepCurves=evaluateLivingCurves(this.flowCurves,this.time+dt,
      this.livingMode,this.livingRate,this.livingAmount);
    const a=this.a,b=this.b,v=[0,0,0],source=[0,0,0];
    const emit=dt>0&&this.forgePower>0&&this.forgeMode!=="off";
    const phase=forgePhase(this.time+dt,this.forgePace,this.seed);
    for(let z=0;z<N;z++)for(let y=0;y<N;y++)for(let x=0;x<N;x++){
      const px=2*(x+.5)/N-1,py=2*(y+.5)/N-1,pz=2*(z+.5)/N-1;
      // Backtrace from end-of-step, optionally using curved RK2 trajectories.
      this.velocity(px,py,pz,speed,v,this.time+dt);
      if(this.integration==="midpoint"){
        const mx=px-.5*dt*v[0],my=py-.5*dt*v[1],mz=pz-.5*dt*v[2];
        this.velocity(mx,my,mz,speed,v,this.time+.5*dt);
      }
      const i=index(x,y,z);
      // Older folds become fractionally resistant to advection (art-directed, not incompressible).
      const grip=1-.35*this.foldGrip*a[i+3];
      v[0]*=grip;v[1]*=grip;v[2]*=grip;
      if(this.fiberEnabled&&this.fiberGuidance>0){
        const c=this.fibers.a[i+3];
        if(c>.001){
          const dx=this.fibers.a[i],dy=this.fibers.a[i+1],dz=this.fibers.a[i+2];
          const len=Math.hypot(dx,dy,dz)||1;
          const ax=dx/len,ay=dy/len,az=dz/len;
          const influence=Math.min(.75,.55*this.fiberGuidance*c);
          const along=(v[0]*ax+v[1]*ay+v[2]*az)*influence;
          v[0]=v[0]*(1-influence)+along*ax;
          v[1]=v[1]*(1-influence)+along*ay;
          v[2]=v[2]*(1-influence)+along*az;
        }
      }
      const sx=clamp((px-v[0]*dt+1)*N*.5-.5,0,N-1);
      const sy=clamp((py-v[1]*dt+1)*N*.5-.5,0,N-1);
      const sz=clamp((pz-v[2]*dt+1)*N*.5-.5,0,N-1);
      const x0=Math.floor(sx),y0=Math.floor(sy),z0=Math.floor(sz);
      const x1=Math.min(N-1,x0+1),y1=Math.min(N-1,y0+1),z1=Math.min(N-1,z0+1);
      const fx=sx-x0,fy=sy-y0,fz=sz-z0;
      const j000=index(x0,y0,z0),j100=index(x1,y0,z0),j010=index(x0,y1,z0),j110=index(x1,y1,z0);
      const j001=index(x0,y0,z1),j101=index(x1,y0,z1),j011=index(x0,y1,z1),j111=index(x1,y1,z1);
      const fade=Math.exp(-.019*dt);
      for(let c=0;c<4;c++){
        const c00=a[j000+c]*(1-fx)+a[j100+c]*fx,c10=a[j010+c]*(1-fx)+a[j110+c]*fx;
        const c01=a[j001+c]*(1-fx)+a[j101+c]*fx,c11=a[j011+c]*(1-fx)+a[j111+c]*fx;
        b[i+c]=((c00*(1-fy)+c10*fy)*(1-fz)+(c01*(1-fy)+c11*fy)*fz)*(c===3?1:fade);
      }
      // Replenish persistent dye along moving 3D mathematical source manifolds.
      // This is actual material injection; advection on future steps deforms the trails.
      if(emit){
        forgeAt(this.forgeMode,px,py,pz,phase,this.forgeWidth,source);
        for(let c=0;c<3;c++){
          const dose=dt*this.forgePower*source[c];
          b[i+c]=clamp(b[i+c]+dose*(1-b[i+c]),0,1);
        }
      }
      // Measure cross-flow pigment interface contrast in the previous material.
      // This is a bounded fold-writing proxy, NOT a finite-strain tensor.
      const chooseY=Math.abs(v[0])>Math.abs(v[1]);
      const plus=chooseY?index(x,Math.min(N-1,y+1),z):index(Math.min(N-1,x+1),y,z);
      const minus=chooseY?index(x,Math.max(0,y-1),z):index(Math.max(0,x-1),y,z);
      const dc0=a[plus]-a[minus],dc1=a[plus+1]-a[minus+1],dc2=a[plus+2]-a[minus+2];
      const contrast=Math.min(1,Math.hypot(dc0,dc1,dc2)*.57735026919);
      const mass=b[i]+b[i+1]+b[i+2];
      const decay=Math.exp(-dt*(.06+1.15*(1-this.foldPersistence)));
      b[i+3]=clamp(b[i+3]*decay+dt*this.foldWrite*contrast*Math.min(1,mass),0,1);
    }
    this.a=b;this.b=a;this.time+=dt;this.dirty=true;
    if(this.fiberEnabled&&dt>0)this.fibers.step(this,dt,speed);
    this.impulses=this.impulses.filter(s=>(s.ttl-=dt)>0);
    this._stepCurves=null;
  }
  packFibers(){return this.fibers.pack();}
  pack(){
    if(!this.dirty)return this.bytes;
    const a=this.a,out=this.bytes;
    for(let i=0;i<a.length;i+=4){out[i]=clamp(Math.round(a[i]*255),0,255);out[i+1]=clamp(Math.round(a[i+1]*255),0,255);out[i+2]=clamp(Math.round(a[i+2]*255),0,255);out[i+3]=clamp(Math.round(a[i+3]*255),0,255);}
    this.dirty=false;return out;
  }
}
