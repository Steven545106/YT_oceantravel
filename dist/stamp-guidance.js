// Shared by the sailing HUD and the north-up world map. Each session starts closed.
export let stampGuidanceEnabled=false;
const listeners=new Set();
export function setStampGuidanceEnabled(enabled){
  stampGuidanceEnabled=!!enabled;
  for(const listener of listeners)listener(stampGuidanceEnabled);
}
export function onStampGuidanceChange(listener){listeners.add(listener);return ()=>listeners.delete(listener);}
export function stampBearing(from,target,heading){
  const dx=target.x-from.x,dz=target.z-from.z;
  if(Math.hypot(dx,dz)<1e-6)return {degrees:0,direction:'已到達',instruction:'已到達集章點'};
  // Forward is (-sin(yaw), -cos(yaw)); positive bearing is clockwise/right of the bow.
  const radians=Math.atan2(dx,-dz)+heading;
  const degrees=Math.atan2(Math.sin(radians),Math.cos(radians))*180/Math.PI;
  const angle=Math.abs(degrees),side=degrees>=0?'右':'左';
  const direction=angle<15?'前方':angle<67.5?`${side}前方`:angle<112.5?`${side}方`:angle<165?`${side}後方`:'後方';
  const instruction=angle<8?'保持船頭方向':angle>172?'向後迴轉':`${side}轉 ${Math.round(angle)}°`;
  return {degrees,direction,instruction};
}
export function nearbyStampGuides(targets,from,kmPerUnit,isUnlocked,isStamped){
  return targets.filter(t=>isUnlocked(t.country)&&!isStamped(t.name)).map(t=>{
    const stop=(t.stampZones??[]).filter(p=>p.halfWidth===undefined).reduce((best,p)=>!best||Math.hypot(p.x-from.x,p.z-from.z)<Math.hypot(best.x-from.x,best.z-from.z)?p:best,null);
    return {t,stop,km:stop?Math.hypot(stop.x-from.x,stop.z-from.z)*kmPerUnit:Infinity};
  }).filter(s=>s.stop).sort((a,b)=>a.km-b.km);
}
