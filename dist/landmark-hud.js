import {stampGuidanceEnabled,setStampGuidanceEnabled,onStampGuidanceChange,stampBearing,nearbyStampGuides} from './stamp-guidance.js';
import * as THREE from 'three';
import {boat,camera} from './core.js';
import {kmPerWorldUnitAt} from './geo.js';
import {landmarkAccess} from './landmark-access.js';
import {isCountryUnlocked} from './achievements.js';
import {hasStamp} from './journey.js';
import {runNavigation} from './nav.js';
const layer=document.createElement('div');layer.className='landmark-hud';document.body.append(layer);
const nearby=document.createElement('div');nearby.className='landmark-nearby';document.body.append(nearby);
nearby.id='stamp-guidance-list';nearby.hidden=true;
const guideToggle=document.createElement('button');guideToggle.type='button';guideToggle.id='stamp-guidance-toggle';guideToggle.className='stamp-guidance-toggle';
guideToggle.textContent='⚑ 集章指示';guideToggle.setAttribute('aria-controls',nearby.id);guideToggle.setAttribute('aria-pressed','false');document.body.append(guideToggle);
guideToggle.addEventListener('click',()=>{guideToggle.blur();setStampGuidanceEnabled(!stampGuidanceEnabled);});
const markers=[],buttons=[],point=new THREE.Vector3();let timer=0;
onStampGuidanceChange(enabled=>{
  guideToggle.setAttribute('aria-pressed',String(enabled));timer=0;
  if(!enabled){nearby.hidden=true;for(const marker of markers)if(marker.classList.contains('is-stop'))marker.hidden=true;}
});
export function updateLandmarkHud(delta,topDown){
  timer-=delta;if(timer>0)return;timer=.2;
  const units=kmPerWorldUnitAt(boat.position.z);
  const sights=landmarkAccess.filter(t=>isCountryUnlocked(t.country)).map(t=>{
    const stops=t.stampZones.filter(p=>p.halfWidth===undefined);
    const stop=stops.reduce((best,p)=>!best||Math.hypot(p.x-boat.position.x,p.z-boat.position.z)<Math.hypot(best.x-boat.position.x,best.z-boat.position.z)?p:best,null);
    const distance=Math.hypot((t.displayX??t.x)-boat.position.x,(t.displayZ??t.z)-boat.position.z)*units;
    return {t,stop,distance,stopKm:stop?Math.hypot(stop.x-boat.position.x,stop.z-boat.position.z)*units:Infinity};
  }).filter(s=>s.distance<100||s.stopKm<60).sort((a,b)=>a.stopKm-b.stopKm);
  let used=0;const boxes=[];
  for(const {t,stop,stopKm} of sights.slice(0,8)){
    for(const isStop of [false,true]){
      if(isStop&&(!stampGuidanceEnabled||!stop||hasStamp(t.name)))continue;
      point.set(isStop?stop.x:t.displayX??t.x,isStop?.08:t.markerY??.2,isStop?stop.z:t.displayZ??t.z).project(camera);
      if(point.z< -1||point.z>1||Math.abs(point.x)>.94||point.y<-.84)continue;
      point.y=Math.min(point.y,.70);
      let sx=(point.x*.5+.5)*innerWidth;let sy=Math.max(170,(-point.y*.5+.5)*innerHeight);
      const label=t.displayName??t.name;
      const w=Math.min(innerWidth-16,360,label.length*12+(isStop?210:36));
      sx=Math.max(w/2+8,Math.min(innerWidth-w/2-8,sx));
      if(stampGuidanceEnabled&&sx-w/2<340&&sy>innerHeight-340)continue;
      if(sx+w/2>innerWidth-250&&sy<320)sy=320;
      for(let attempt=0;attempt<5&&boxes.some(b=>Math.abs(sx-b.x)<(w+b.w)/2&&Math.abs(sy-b.y)<24);attempt++)sy+=26;
      if(sy>innerHeight-120||boxes.some(b=>Math.abs(sx-b.x)<(w+b.w)/2&&Math.abs(sy-b.y)<24))continue;
      boxes.push({x:sx,y:sy,w});
      let marker=markers[used];if(!marker){marker=document.createElement('div');layer.append(marker);markers.push(marker);}
      marker.className=`landmark-pin${isStop?' is-stop':''}${hasStamp(t.name)?' is-earned':''}`;
      const bearing=isStop?stampBearing({x:boat.position.x,z:boat.position.z},stop,boat.rotation.y):null;
      marker.textContent=isStop?`${['↑','↗','→','↘','↓','↙','←','↖'][(Math.round(bearing.degrees/45)+8)%8]} ⚑ ${t.name}集章點 · ${stopKm.toFixed(1)} km · ${bearing.direction}`:`${hasStamp(t.name)?'✓':'◆'} ${label}`;
      marker.style.transform=`translate(${sx}px,${sy}px) translate(-50%,-100%)`;
      marker.hidden=false;used++;
    }
  }
  for(let i=used;i<markers.length;i++)markers[i].hidden=true;
  if(!stampGuidanceEnabled){nearby.hidden=true;return;}
  const list=nearbyStampGuides(landmarkAccess,{x:boat.position.x,z:boat.position.z},units,isCountryUnlocked,hasStamp).slice(0,3);
  for(let i=0;i<list.length;i++){
    let button=buttons[i];if(!button){
      button=document.createElement('button');button.type='button';nearby.append(button);buttons.push(button);
      const arrow=document.createElement('span');arrow.className='stamp-direction-arrow';arrow.textContent='↑';arrow.setAttribute('aria-hidden','true');
      const text=document.createElement('span');text.className='stamp-direction-text';button.append(arrow,text);
      button.addEventListener('click',()=>runNavigation(button.dataset.destination));
    }
    const {t,stop,km}=list[i],bearing=stampBearing({x:boat.position.x,z:boat.position.z},stop,boat.rotation.y);
    button.children[0].style.transform=`rotate(${bearing.degrees}deg)`;
    button.children[1].textContent=`${t.name} · ${km.toFixed(1)} km\n${bearing.direction} · ${bearing.instruction}`;
    button.title=`自動導航前往 ${t.name}`;
    button.dataset.destination=`${t.country}-${t.name}`;button.hidden=false;
  }
  for(let i=list.length;i<buttons.length;i++)buttons[i].hidden=true;
  nearby.hidden=false;
  let empty=nearby.querySelector('.stamp-guidance-empty');
  if(!list.length&&!empty){empty=document.createElement('p');empty.className='stamp-guidance-empty';nearby.append(empty);}
  if(empty){empty.hidden=!!list.length;empty.textContent='目前沒有已解鎖、尚未集章的景點';}
}
