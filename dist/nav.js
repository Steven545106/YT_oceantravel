import { landmarkAccess } from './landmark-access.js';
import { sceneryObstacles, obstacleBlocksSegment } from './nav-obstacles.js';
import * as THREE from 'three';
import {geoToWorld,kmPerWorldUnitAt} from './geo.js';
import {formatDuration} from './nav-grid.js';
import {distanceToLand,landIslands,landVersion} from './land.js';
import {isLandAt,searchPlace} from './places.js';
import {WORLD_BOUNDS,boat,currentVehicleType} from './core.js';
import {state} from './state.js';
import {isCountryUnlocked,lockMessage,recordEvent} from './achievements.js';
import {createNavClient} from './nav-client.js';
import {COUNTRIES,REGIONS} from './regions.js';
import {fetchGrayPixels} from './data-loader.js';
// Coarse sea grid of the whole map (see scripts/build_regions.py): long trips are planned on it first.
let seaGrid=null;
try{const {pixels}=await fetchGrayPixels(REGIONS.nav.file);seaGrid={...REGIONS.nav,codes:pixels};}catch(error){console.error('無法載入遠洋航線格網，長程導航改用一般規劃',error);}
import {BASE_CRUISE_SPEED} from './vehicle-speeds.js';
const AUTOPILOT_CRUISE=BASE_CRUISE_SPEED,AUTOPILOT_TURN_RATE=1.1,MIN_SHORE_DISTANCE_KM=5.5;
export const navForm=document.querySelector('#navigator'),navInput=document.querySelector('#nav-input');
const navStatus=document.querySelector('#nav-status');
export const navCancel=document.querySelector('#nav-cancel'),navSuggest=document.querySelector('#nav-suggest');
const planner=createNavClient(landIslands,WORLD_BOUNDS,()=>COUNTRIES.map(c=>c.code).filter(country=>!isCountryUnlocked(country)),()=>sceneryObstacles,()=>landVersion,seaGrid);let navVersion=0;
export function markNavObstacle(x,z,radius=.3){planner.obstacle({x,z,radius});}

export function nearestCoastPoint(x, z) {
  let bestSquared = Infinity, bestX = x, bestZ = z;
  const consider = (ax, az, bx, bz) => {
    const dx = bx - ax, dz = bz - az;
    const lengthSquared = dx * dx + dz * dz;
    const t = lengthSquared > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / lengthSquared)) : 0;
    const nx = ax + dx * t, nz = az + dz * t;
    const d = (x - nx) ** 2 + (z - nz) ** 2;
    if (d < bestSquared) { bestSquared = d; bestX = nx; bestZ = nz; }
  };
  for (const island of landIslands) {
    const boxDx = Math.max(island.minX - x, 0, x - island.maxX);
    const boxDz = Math.max(island.minZ - z, 0, z - island.maxZ);
    if (boxDx * boxDx + boxDz * boxDz >= bestSquared) continue;
    const { points, count } = island;
    for (let i = 0; i < count; i++) {
      const next = (i + 1) % count;
      consider(points[i * 2], points[i * 2 + 1], points[next * 2], points[next * 2 + 1]);
    }
  }
  return { x: bestX, z: bestZ };
}

export function setNavStatus(text, tone = '') {
  navStatus.textContent = text;
  navStatus.dataset.tone = tone;
}

export function stopAutopilot(message, tone = '') {
  navVersion++;
  planner.cancel();
  state.navBusy=false;
  state.autopilot = null;
  navCancel.hidden = true;
  if (message) setNavStatus(message, tone);
}


// A manual cancellation or a new route invalidates already queued recovery work.
export function scheduleNavigationRetry(query,retries){
  const version=navVersion;
  queueMicrotask(()=>{if(version===navVersion)runNavigation(query,retries);});
}


function startAutopilot(route, label, query, retries = 4) {
  // minClearance: how close to shore this route was planned to pass (under 2 km only through a narrow strait)
  state.autopilot = { waypoints: route.waypoints, index: 0, label, query, retries, lastText: '', progressSeconds:0, bestDistance:Infinity, progressIndex:0, minClearance: route.clearance ?? 2.1 };
  navCancel.hidden = false;
}

// Returns the steering direction (-1..1) for the HUD/camera, or null when off.
export function autopilotStep(delta) {
  if (!state.autopilot) return null;
  const autopilot=state.autopilot;
  autopilot.safetyTimer=(autopilot.safetyTimer??0)-delta;
  if(autopilot.safetyTimer<=0&&Math.abs(state.velocity)>.12){
    autopilot.safetyTimer=.35;
    // Look ahead along the planned route (which may bend through a strait), plus a short probe straight off the bow
    // to catch the boat drifting off it.
    const distance=Math.max(.25,Math.abs(state.velocity)*.8),a={x:boat.position.x,z:boat.position.z};
    const path=[a];let left=distance;
    for(let i=autopilot.index;i<autopilot.waypoints.length&&left>0;i++){
      const from=path.at(-1),to=autopilot.waypoints[i],length=Math.hypot(to.x-from.x,to.z-from.z);
      if(length>=left){path.push({x:from.x+(to.x-from.x)*left/length,z:from.z+(to.z-from.z)*left/length});left=0;}
      else{path.push(to);left-=length;}
    }
    const bow=Math.min(distance,.4);path.unshift({x:a.x-Math.sin(boat.rotation.y)*bow,z:a.z-Math.cos(boat.rotation.y)*bow},a);
    const b=path.at(-1),clearance=distanceToLand(a.x,a.z).km;
    let unsafe=false,hazard=b;
    for(let s=1;s<path.length&&!unsafe;s++){
      const p=path[s-1],q=path[s];
      if(sceneryObstacles.some(o=>obstacleBlocksSegment(o,p,q))){unsafe=true;hazard=q;break;}
      for(let k=1;k<=8;k++){const x=p.x+(q.x-p.x)*k/8,z=p.z+(q.z-p.z)*k/8;if(isLandAt(x,z)){unsafe=true;hazard={x,z};break;}}
    }
    const ahead=distanceToLand(b.x,b.z).km;
    if(unsafe||(ahead<Math.min(2,autopilot.minClearance-.1)&&ahead<clearance-.02)){
      const {query,retries}=autopilot;markNavObstacle(hazard.x,hazard.z,.2);state.velocity=0;stopAutopilot('前方有障礙，重新規劃繞行路線…','busy');
      if(retries>0)scheduleNavigationRetry(query,retries-1);else setNavStatus('前方沒有安全航路，已停止導航','error');
      return 0;
    }
  }
  const { waypoints } = state.autopilot;
  let waypoint = waypoints[state.autopilot.index];
  let dx = waypoint.x - boat.position.x, dz = waypoint.z - boat.position.z;
  let distance = Math.hypot(dx, dz);
  if(autopilot.progressIndex!==autopilot.index||distance<autopilot.bestDistance-.08){
    autopilot.progressIndex=autopilot.index;autopilot.bestDistance=distance;autopilot.progressSeconds=0;
  }else autopilot.progressSeconds+=delta;
  if(autopilot.progressSeconds>12){
    const {query,retries}=autopilot;
    const length=distance||1;
    markNavObstacle(boat.position.x+dx/length*.6,boat.position.z+dz/length*.6,.2);
    state.velocity=0;stopAutopilot(retries>0?'航行停滯，改走其他路線…':'目前無法脫困，請手動移至開闊海域後重試',retries>0?'busy':'error');
    if(retries>0)scheduleNavigationRetry(query,retries-1);return 0;
  }
  const isLast = state.autopilot.index === waypoints.length - 1;
  if (distance < (isLast ? .12 : .10)) {
    state.autopilot.index++;
    if (state.autopilot.index >= waypoints.length) {
      state.velocity *= .1;
      recordEvent('arrive');
      stopAutopilot(`已抵達 ${state.autopilot.label} 外海`, 'ok');
      return 0;
    }
    waypoint = waypoints[state.autopilot.index];
    dx = waypoint.x - boat.position.x; dz = waypoint.z - boat.position.z;
    distance = Math.hypot(dx, dz);
  }
  const desired = Math.atan2(-dx, -dz);
  let difference = desired - boat.rotation.y;
  difference = Math.atan2(Math.sin(difference), Math.cos(difference));
  const turnRate = AUTOPILOT_TURN_RATE * state.handling.turn;
  const turn = THREE.MathUtils.clamp(difference, -turnRate * delta, turnRate * delta);
  boat.rotation.y += turn;
  let remaining = distance;
  for (let i = state.autopilot.index; i < waypoints.length - 1; i++) {
    remaining += Math.hypot(waypoints[i + 1].x - waypoints[i].x, waypoints[i + 1].z - waypoints[i].z);
  }
  // Turn on the spot before moving off, so a bow pointing at the shore never ploughs into it.
  const alignment = THREE.MathUtils.clamp(1 - (Math.abs(difference) - .15) / .6, 0, 1);
  // Ease off before a sharp corner: the hull needs room to swing round without cutting the shore.
  let cornerFactor = 1;
  const afterWaypoint = waypoints[state.autopilot.index + 1];
  if (afterWaypoint) {
    const legAngle = Math.atan2(-dx, -dz);
    const nextAngle = Math.atan2(-(afterWaypoint.x - waypoint.x), -(afterWaypoint.z - waypoint.z));
    const bend = Math.abs(Math.atan2(Math.sin(nextAngle - legAngle), Math.cos(nextAngle - legAngle)));
    cornerFactor = 1 - Math.min(1, bend / 1.1) * .75 * (1 - Math.min(1, distance / 6));
  }
  const targetSpeed = Math.min(AUTOPILOT_CRUISE * state.handling.speed, .2 + remaining * .6) * alignment * cornerFactor;
  state.velocity += (targetSpeed - state.velocity) * Math.min(1, delta * 1.6);
  const seconds = remaining / (AUTOPILOT_CRUISE * state.handling.speed * .8) + 4;
  const text = `導航中 → ${state.autopilot.label}（剩餘 ${(remaining * kmPerWorldUnitAt(boat.position.z)).toFixed(0)} km，預計 ${formatDuration(seconds)}）`;
  if (text !== state.autopilot.lastText) { state.autopilot.lastText = text; setNavStatus(text, 'busy'); }
  return Math.sign(difference) * Math.min(1, Math.abs(difference) / .3);
}

function routeLength(route,from){let total=0;for(const p of route.waypoints){total+=Math.hypot(p.x-from.x,p.z-from.z);from=p;}return total;}
export async function runCircumnavigation(retriesLeft=4){
  if(currentVehicleType()==='fighter'){setNavStatus('戰鬥機觀光模式不使用海上導航','error');return;}
  if(state.navBusy)return;stopAutopilot();state.navBusy=true;state.velocity=0;
  const version=navVersion;navCancel.hidden=false;setNavStatus('計算環台航線中…','busy');
  try{
    const result=await planner.request('circum',{x:boat.position.x,z:boat.position.z});
    if(version!==navVersion)return;
    if(!result.route){setNavStatus('找不到安全的環台航線','error');navCancel.hidden=true;return;}
    const total=routeLength(result.route,boat.position);
    startAutopilot(result.route,'環台一圈','@circum',retriesLeft);
    setNavStatus(`出發 → 環台一圈（全程約 ${(total*kmPerWorldUnitAt(0)).toFixed(0)} km，預計 ${formatDuration(total/(AUTOPILOT_CRUISE*state.handling.speed*.8)+4)}）`,'busy');
    return result;
  }catch(error){if(error.name!=='AbortError'&&version===navVersion){console.error('環台航線規劃失敗',error);setNavStatus('無法規劃環台航線','error');navCancel.hidden=true;}}
  finally{if(version===navVersion)state.navBusy=false;}
}
export async function runNavigation(queryText,retriesLeft=4){
  if(currentVehicleType()==='fighter'){setNavStatus('戰鬥機觀光模式不使用海上導航','error');return;}
  if(queryText.trim()==='@circum')return runCircumnavigation(retriesLeft);
  if(state.navBusy||!queryText.trim())return;
  const coordinate=queryText.trim().match(/^@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
  const found=coordinate?{country:'海圖',place:{name:`${Number(coordinate[1]).toFixed(2)}°N ${Number(coordinate[2]).toFixed(2)}°E`,lat:Number(coordinate[1]),lon:Number(coordinate[2])}}:searchPlace(queryText);
  if(!found){setNavStatus(`找不到「${queryText.trim()}」，請輸入「國家-地名」，例如 日本-鴨川`,'error');return;}
  const {country,place}=found;if(!isCountryUnlocked(country)){setNavStatus(`${lockMessage(country)}，才能前往`,'error');return;}
  const label=`${country}-${place.name}`;stopAutopilot();state.navBusy=true;state.velocity=0;
  const version=navVersion;navCancel.hidden=false;setNavStatus(`計算 ${label} 的航線中…`,'busy');
  try{
    const world=geoToWorld({latitude:place.lat,longitude:place.lon});
    const sight=landmarkAccess.find(t=>t.country===country&&t.name===place.name);
    const stops=sight?.stampZones.filter(p=>p.halfWidth===undefined);
    const result=await planner.request('route',{x:boat.position.x,z:boat.position.z},{x:sight?.displayX??world.x,z:sight?.displayZ??world.y,destinations:stops?.length?stops.filter(p=>!p.fallback):undefined,fallbackDestinations:stops?.filter(p=>p.fallback)});
    if(version!==navVersion)return;
    const {route,clearanceKm}=result;
    if(!route){setNavStatus(`找不到前往 ${label} 的安全航路，請移至開闊海域後重試`,'error');navCancel.hidden=true;return result;}
    navInput.value=label;
    const total=routeLength(route,boat.position);startAutopilot(route,label,queryText,retriesLeft);
    const narrow=clearanceKm<MIN_SHORE_DISTANCE_KM?`；此處海域狹窄，停在離岸約 ${clearanceKm} km`:'';
    setNavStatus(`出發 → ${label}（全程約 ${(total*kmPerWorldUnitAt(boat.position.z)).toFixed(0)} km，預計 ${formatDuration(total/(AUTOPILOT_CRUISE*state.handling.speed*.8)+4)}${narrow}）`,'busy');
    return result;
  }catch(error){if(error.name!=='AbortError'&&version===navVersion){console.error('自動導航失敗',error);setNavStatus('自動導航失敗','error');navCancel.hidden=true;}}
  finally{if(version===navVersion)state.navBusy=false;}
}
