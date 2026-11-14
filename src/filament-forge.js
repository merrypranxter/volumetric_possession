// Filament Forge: continuously inject dye into persistent volume along distinct 3D loci.
// Output channels are source concentrations [0,1], not the simulated dye itself.
export const FORGE_MODES=["off","helix","rosette","gyroid"];
const TAU=Math.PI*2;
export function forgeAt(mode,x,y,z,phase,width,out){
  out[0]=0;out[1]=0;out[2]=0;
  if(mode==="off")return out;
  const w2=Math.max(.0025,width*width);
  if(mode==="helix"){
    const base=5.3*z+phase;
    const envelope=Math.exp(-.25*z*z);
    for(let c=0;c<3;c++){
      const angle=base+c*TAU/3;
      const dx=x-.42*Math.cos(angle),dy=y-.42*Math.sin(angle);
      out[c]=Math.exp(-(dx*dx+dy*dy)/w2)*envelope;
    }
  }else if(mode==="rosette"){
    const r=Math.hypot(x,z),theta=Math.atan2(z,x),envelope=Math.exp(-.17*r*r);
    for(let c=0;c<3;c++){
      const shift=c*TAU/3;
      const ring=.44+.16*Math.cos(5*theta+phase+shift);
      const height=.30*Math.sin(3*theta-1.2*phase+shift);
      const dr=r-ring,dy=y-height;
      out[c]=Math.exp(-(dr*dr+dy*dy)/w2)*envelope;
    }
  }else if(mode==="gyroid"){
    const xx=5.0*x+.35*Math.sin(phase),yy=5.0*y+.25*Math.cos(phase),zz=5.0*z-.28*Math.cos(phase);
    const gyroid=Math.sin(xx)*Math.cos(yy)+Math.sin(yy)*Math.cos(zz)+Math.sin(zz)*Math.cos(xx);
    const envelope=Math.exp(-.32*(x*x+y*y+z*z));
    const scale=Math.max(.08,width*5);
    for(let c=0;c<3;c++){
      const target=(c-1)*.88;
      const g=(gyroid-target)/scale;
      out[c]=.13*Math.exp(-g*g)*envelope;
    }
  }else throw Error("Unknown filament source: "+mode);
  return out;
}
export function forgePhase(time,pace,seed){return time*pace*.55+(seed>>>0)*.000017;}
