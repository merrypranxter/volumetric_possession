// Saturation Sadist read-only post-render controls; scene state is immutable
// and defaults to exact renderer bypass. Lens position is screen-space UV.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const numeric=(v,fall)=>Number.isFinite(Number(v))?Number(v):fall;
export const defaultColorState=()=>({neon:0,mode:"full",lens:[.5,.5],radius:.30,defectGlow:0});
export function cloneColorState(value){
  const v=value||defaultColorState(),lens=Array.isArray(v.lens)?v.lens:[.5,.5];
  return {neon:clamp(numeric(v.neon,0),0,2),
    mode:v.mode==="lens"?"lens":"full",
    lens:[clamp(numeric(lens[0],.5),0,1),clamp(numeric(lens[1],.5),0,1)],
    radius:clamp(numeric(v.radius,.3),.08,.85),
    defectGlow:clamp(numeric(v.defectGlow,0),0,2)};
}
export function moveColorLens(state,clientX,clientY,rect){
  if(!rect||rect.width<=0||rect.height<=0)throw Error("Invalid artwork bounds");
  const out=cloneColorState(state);
  out.mode="lens";
  out.lens=[clamp((clientX-rect.left)/rect.width,0,1),
    clamp(1-(clientY-rect.top)/rect.height,0,1)];
  if(out.neon<.1)out.neon=1;
  return out;
}
