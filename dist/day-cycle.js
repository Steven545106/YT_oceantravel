export const TIME_MODES=['sunrise','sunset','night'];
export const TIME_MODE_PHASE={sunrise:.258,sunset:.747,night:0};
export const TIME_MODE_NAMES={sunrise:'日出（東方）',sunset:'日落（西方）',night:'夜晚'};
export const SCENIC_MODE_SECONDS=120;
export function advanceScenicTime(cycle,delta){
  if(!Number.isFinite(delta)||delta<=0)return false;
  cycle.elapsed=(cycle.elapsed??0)+delta;
  let changed=false;
  while(cycle.elapsed>=SCENIC_MODE_SECONDS){
    cycle.elapsed-=SCENIC_MODE_SECONDS;
    cycle.mode=TIME_MODES[(TIME_MODES.indexOf(cycle.mode)+1)%TIME_MODES.length];
    cycle.phase=TIME_MODE_PHASE[cycle.mode];
    changed=true;
  }
  return changed;
}
// Fixed scenic lighting: cool, clear dawn versus hazy amber dusk.
export const TIME_LIGHTING={
  sunrise:{exposure:.46,fog:.000035,turbidity:2.4,rayleigh:1.15,mie:.003,mieG:.8,
    cloud:.12,density:.26,distortion:3.7,hemisphereIntensity:1.35,ambientIntensity:.4,directionalIntensity:1.25,
    fogColor:0xa9bfd5,sunColor:0xffdfbd,waterColor:0x073c50,hemisphereColor:0xb7dcff,hemisphereGround:0x17273e,ambientColor:0xe2ecff,directionalColor:0xffe3cb},
  sunset:{exposure:.38,fog:.000065,turbidity:9,rayleigh:2.8,mie:.009,mieG:.84,
    cloud:.21,density:.34,distortion:3.7,hemisphereIntensity:1.0,ambientIntensity:.34,directionalIntensity:1.5,
    fogColor:0xb3756d,sunColor:0xff8c3c,waterColor:0x162d3d,hemisphereColor:0xc7a5c8,hemisphereGround:0x201529,ambientColor:0xffbb8d,directionalColor:0xff934f},
  night:{exposure:.2,fog:.000095,turbidity:1.5,rayleigh:.32,mie:.001,mieG:.72,
    cloud:.16,density:.26,distortion:2.7,hemisphereIntensity:.62,ambientIntensity:.2,directionalIntensity:.82,
    fogColor:0x020716,sunColor:0x91b9ff,waterColor:0x000b1c,hemisphereColor:0x263d80,hemisphereGround:0x01030a,ambientColor:0x355aab,directionalColor:0xaac0ff}
};
export function solarAngles(phase){
  const wrapped=((phase%1)+1)%1;
  return {elevation:68*Math.sin((wrapped-.25)*Math.PI*2),azimuth:90-(wrapped-.25)*360};
}
