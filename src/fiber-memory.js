// Persistent 3D tangent director field (xyz) + coherence (w).
// Director update approximates D_t a=(I-aa^T) (grad v) a via finite differences.
// Not a full deformation gradient, true hair simulation, or incompressible solver.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const normalize=(x,y,z)=>{
  const l=Math.hypot(x,y,z);
  return l>1e-7?[x/l,y/l,z/l]:[1,0,0];
};
export class FiberMemory{
  constructor(n){
    this.n=n;
    this.a=new Float32Array(n*n*n*4);
    this.b=new Float32Array(this.a.length);
    this.bytes=new Uint8Array(this.a.length);
    this.dirty=true;this.reset();
  }
  reset(){
    this.a.fill(0);this.b.fill(0);
    for(let i=0;i<this.a.length;i+=4)this.a[i]=1; // coherence starts at ZERO
    this.dirty=true;
  }
  snapshot(){return this.a.slice();}
  restore(bytes){
    if(bytes)this.a.set(bytes);else this.reset();
    this.dirty=true;
  }
  pack(){
    if(!this.dirty)return this.bytes;
    for(let i=0;i<this.a.length;i+=4){
      this.bytes[i]=clamp(Math.round((this.a[i]*.5+.5)*255),0,255);
      this.bytes[i+1]=clamp(Math.round((this.a[i+1]*.5+.5)*255),0,255);
      this.bytes[i+2]=clamp(Math.round((this.a[i+2]*.5+.5)*255),0,255);
      this.bytes[i+3]=clamp(Math.round(this.a[i+3]*255),0,255);
    }
    this.dirty=false;return this.bytes;
  }
  // Runs AFTER pigment advection: field.a is new dye; field.b is old dye.
  step(field,dt,speed){
    const n=this.n,previous=this.a,next=this.b,oldDye=field.b,newDye=field.a;
    const at=(x,y,z)=>4*(x+n*(y+n*z));
    const v=[0,0,0],vp=[0,0,0],vm=[0,0,0];
    const fade=Math.exp(-dt*(.045+1.2*(1-field.fiberPersistence)));
    const h=.065,halfN=n*.5;
    const back=[0,0,0],base=[0,0,0],d=[0,0,0],g=[0,0,0];
    for(let z=0;z<n;z++)for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const i=at(x,y,z);
      const mass=clamp(newDye[i]+newDye[i+1]+newDye[i+2],0,1);
      const oldC=previous[i+3];
      if(mass<.005&&oldC<.002){
        next[i]=1;next[i+1]=0;next[i+2]=0;next[i+3]=0;
        continue;
      }
      const px=2*(x+.5)/n-1,py=2*(y+.5)/n-1,pz=2*(z+.5)/n-1;
      field.velocity(px,py,pz,speed,v,field.time);
      if(field.integration==="midpoint"){
        field.velocity(px-.5*dt*v[0],py-.5*dt*v[1],pz-.5*dt*v[2],speed,v,field.time-.5*dt);
      }
      const grip=1-.35*field.foldGrip*oldDye[i+3];
      v[0]*=grip;v[1]*=grip;v[2]*=grip;
      if(field.fiberGuidance>0&&oldC>.001){
        const a=normalize(previous[i],previous[i+1],previous[i+2]);
        const influence=clamp(.55*field.fiberGuidance*oldC,0,.75);
        const projection=(v[0]*a[0]+v[1]*a[1]+v[2]*a[2])*influence;
        v[0]=v[0]*(1-influence)+projection*a[0];
        v[1]=v[1]*(1-influence)+projection*a[1];
        v[2]=v[2]*(1-influence)+projection*a[2];
      }
      back[0]=clamp((px-v[0]*dt+1)*halfN-.5,0,n-1);
      back[1]=clamp((py-v[1]*dt+1)*halfN-.5,0,n-1);
      back[2]=clamp((pz-v[2]*dt+1)*halfN-.5,0,n-1);
      const x0=Math.floor(back[0]),y0=Math.floor(back[1]),z0=Math.floor(back[2]);
      const x1=Math.min(n-1,x0+1),y1=Math.min(n-1,y0+1),z1=Math.min(n-1,z0+1);
      const fx=back[0]-x0,fy=back[1]-y0,fz=back[2]-z0;
      const i000=at(x0,y0,z0),i100=at(x1,y0,z0),i010=at(x0,y1,z0),i110=at(x1,y1,z0);
      const i001=at(x0,y0,z1),i101=at(x1,y0,z1),i011=at(x0,y1,z1),i111=at(x1,y1,z1);
      function sample(c){
        const c00=previous[i000+c]*(1-fx)+previous[i100+c]*fx;
        const c10=previous[i010+c]*(1-fx)+previous[i110+c]*fx;
        const c01=previous[i001+c]*(1-fx)+previous[i101+c]*fx;
        const c11=previous[i011+c]*(1-fx)+previous[i111+c]*fx;
        return (c00*(1-fy)+c10*fy)*(1-fz)+(c01*(1-fy)+c11*fy)*fz;
      }
      const coherence=clamp(sample(3),0,1);
      for(let axis=0;axis<3;axis++){
        const up=[x,y,z],down=[x,y,z];
        up[axis]=Math.min(n-1,up[axis]+1);down[axis]=Math.max(0,down[axis]-1);
        const u=at(...up),l=at(...down);
        g[axis]=((oldDye[u]+oldDye[u+1]+oldDye[u+2])-
                 (oldDye[l]+oldDye[l+1]+oldDye[l+2]))/3;
      }
      const interfaceStrength=clamp(Math.hypot(...g)*2.5,0,1);
      if(coherence>.006){
        d[0]=sample(0);d[1]=sample(1);d[2]=sample(2);
      }else{
        // Tangent to the advected dye interface: cross(gradient, local flow).
        d[0]=g[1]*v[2]-g[2]*v[1];
        d[1]=g[2]*v[0]-g[0]*v[2];
        d[2]=g[0]*v[1]-g[1]*v[0];
        if(Math.hypot(...d)<1e-7){
          // Fallback tangent orthogonal to local density normal when flow is small.
          d[0]=-g[1];d[1]=g[0];d[2]=0;
        }
      }
      const director=normalize(...d);
      field.velocity(px+h*director[0],py+h*director[1],pz+h*director[2],speed,vp,field.time);
      field.velocity(px-h*director[0],py-h*director[1],pz-h*director[2],speed,vm,field.time);
      const dv=[(vp[0]-vm[0])/(2*h),(vp[1]-vm[1])/(2*h),(vp[2]-vm[2])/(2*h)];
      const adv=normalize(director[0]+dt*field.fiberBend*dv[0],
                          director[1]+dt*field.fiberBend*dv[1],
                          director[2]+dt*field.fiberBend*dv[2]);
      const strain=Math.max(0,Math.min(2,adv[0]*dv[0]+adv[1]*dv[1]+adv[2]*dv[2]));
      next[i]=adv[0];next[i+1]=adv[1];next[i+2]=adv[2];
      next[i+3]=clamp(coherence*fade+
        dt*field.fiberGrowth*interfaceStrength*mass*(.8+.2*strain),0,1);
    }
    this.a=next;this.b=previous;this.dirty=true;
  }
}
