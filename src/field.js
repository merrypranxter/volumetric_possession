// Persistent CPU 3D dye field. The analytic vortices are divergence-free individually.
// Semi-Lagrangian transport is approximate and dissipative, not a Navier-Stokes solver.
export const N = 28;
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const index = (x,y,z) => 4*(x+N*(y+N*z));
function random(seed){let t=seed>>>0;return ()=>{t+=0x6D2B79F5;let r=Math.imul(t^(t>>>15),1|t);r^=r+Math.imul(r^(r>>>7),61|r);return ((r^(r>>>14))>>>0)/4294967296;};}
export class PigmentField {
  constructor(seed=1226){this.a=new Float32Array(N*N*N*4);this.b=new Float32Array(this.a.length);this.bytes=new Uint8Array(this.a.length);this.impulses=[];this.time=0;this.dirty=true;this.reset(seed);}
  reset(seed){
    this.seed=seed>>>0;this.time=0;this.impulses.length=0;const rng=random(this.seed);
    const sx=rng()*.45-.225,sy=rng()*.2-.1,sz=rng()*.4-.2;
    for(let z=0;z<N;z++)for(let y=0;y<N;y++)for(let x=0;x<N;x++){
      const px=2*(x+.5)/N-1,py=2*(y+.5)/N-1,pz=2*(z+.5)/N-1;
      const qx=px-sx,qy=py-sy,qz=pz-sz,rad=Math.hypot(qx,qz);
      const torus=Math.exp(-((rad-.52)**2*49+qy*qy*15));
      const plume=Math.exp(-((px+.27)**2*8+(py+.25)**2*13+(pz-.16)**2*13));
      const ribbon=Math.exp(-((rad-.28)**2*36+(qy-.45*Math.sin(Math.atan2(qz,qx)*2.0))**2*21));
      const i=index(x,y,z),variation=.84+.16*rng();
      this.a[i]=clamp((.74*torus+.11*plume)*variation,0,1);
      this.a[i+1]=clamp((.65*plume+.18*ribbon)*variation,0,1);
      this.a[i+2]=clamp((.58*ribbon+.10*torus)*variation,0,1);
      this.a[i+3]=1;
    }
    this.dirty=true;
  }
  snapshot(){return {seed:this.seed,time:this.time,values:this.a.slice()};}
  restore(s){this.seed=s.seed;this.time=s.time;this.a.set(s.values);this.impulses.length=0;this.dirty=true;}
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

  velocity(x,y,z,speed,out){
    const t=this.time,k=this.seed*.000017;
    // Three Gaussian-windowed rotational vortices: each has zero analytic divergence.
    const x0=x-Math.sin(t*.24+k)*.22,y0=y,z0=z;
    const w0=1.38*Math.exp(-(x0*x0+y0*y0+z0*z0)/1.1025)*speed;
    const x1=x-.20,y1=y-Math.cos(t*.19+k)*.23,z1=z-.15;
    const w1=-1.15*Math.exp(-(x1*x1+y1*y1+z1*z1)/.9025)*speed;
    const x2=x+.15,y2=y-.12,z2=z-Math.sin(t*.17)*.19;
    const w2=.9*Math.exp(-(x2*x2+y2*y2+z2*z2))*speed;
    let vx=z0*w0-y2*w2,vy=-z1*w1+x2*w2,vz=-x0*w0+y1*w1;
    for(const impulse of this.impulses){
      const dx=x-impulse.p[0],dy=y-impulse.p[1],dz=z-impulse.p[2],d2=dx*dx+dy*dy+dz*dz;
      if(d2>impulse.r*impulse.r*9)continue;
      const w=Math.exp(-d2/(impulse.r*impulse.r*2))*impulse.ttl/.9;
      vx+=impulse.v[0]*w;vy+=impulse.v[1]*w;vz+=impulse.v[2]*w;
    }
    out[0]=vx;out[1]=vy;out[2]=vz;
  }
  step(dt,speed){
    const a=this.a,b=this.b,v=[0,0,0];
    for(let z=0;z<N;z++)for(let y=0;y<N;y++)for(let x=0;x<N;x++){
      const px=2*(x+.5)/N-1,py=2*(y+.5)/N-1,pz=2*(z+.5)/N-1;
      this.velocity(px,py,pz,speed,v);
      const sx=clamp((px-v[0]*dt+1)*N*.5-.5,0,N-1);
      const sy=clamp((py-v[1]*dt+1)*N*.5-.5,0,N-1);
      const sz=clamp((pz-v[2]*dt+1)*N*.5-.5,0,N-1);
      const x0=Math.floor(sx),y0=Math.floor(sy),z0=Math.floor(sz);
      const x1=Math.min(N-1,x0+1),y1=Math.min(N-1,y0+1),z1=Math.min(N-1,z0+1);
      const fx=sx-x0,fy=sy-y0,fz=sz-z0;
      const j000=index(x0,y0,z0),j100=index(x1,y0,z0),j010=index(x0,y1,z0),j110=index(x1,y1,z0);
      const j001=index(x0,y0,z1),j101=index(x1,y0,z1),j011=index(x0,y1,z1),j111=index(x1,y1,z1);
      const i=index(x,y,z),fade=Math.exp(-.019*dt);
      for(let c=0;c<3;c++){
        const c00=a[j000+c]*(1-fx)+a[j100+c]*fx,c10=a[j010+c]*(1-fx)+a[j110+c]*fx;
        const c01=a[j001+c]*(1-fx)+a[j101+c]*fx,c11=a[j011+c]*(1-fx)+a[j111+c]*fx;
        b[i+c]=((c00*(1-fy)+c10*fy)*(1-fz)+(c01*(1-fy)+c11*fy)*fz)*fade;
      }
      b[i+3]=1;
    }
    this.a=b;this.b=a;this.time+=dt;this.dirty=true;
    this.impulses=this.impulses.filter(s=>(s.ttl-=dt)>0);
  }
  pack(){
    if(!this.dirty)return this.bytes;
    const a=this.a,out=this.bytes;
    for(let i=0;i<a.length;i+=4){out[i]=clamp(Math.round(a[i]*255),0,255);out[i+1]=clamp(Math.round(a[i+1]*255),0,255);out[i+2]=clamp(Math.round(a[i+2]*255),0,255);out[i+3]=255;}
    this.dirty=false;return out;
  }
}
