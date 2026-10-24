import {initCameraZoom} from './camera-zoom.js';
import {createFlightState,flightStep,landingSite,requestTakeoff,requestLanding,requestTurbo,toggleHover,turboCooldownLeft,turboMultiplier,FLIGHT_MIN_CLEARANCE,FLIGHT_MAX_HEIGHT} from './flight.js';
import {createFlightHoldInput} from './flight-input.js';
import {flightFeedback} from './flight-feedback.js';
import {createJetSound} from './jet-sound.js';
import {BASE_CRUISE_SPEED} from './vehicle-speeds.js';
import { scheduleNavigationRetry } from './nav.js';
import { updateLandmarkHud } from './landmark-hud.js';
import {setStampGuidanceEnabled} from './stamp-guidance.js';
import { sceneryObstacles, movementBlocked } from './nav-obstacles.js';
import { keyOf, movementAxes, isMovementKey, isTextControl } from './controls.js';
import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { createWhaleEvent } from './whale.js';
import { setLandmarkNight } from './landmark-models.js';
import { createLandscapeLighting } from './landscape-lighting.js';
import { createCoastalWater } from './coastal-water.js';
import { createCapeScenery } from './coastal-scenery.js';
import { updateLandmarkDetails, regroundLandmarkDetails } from './landmark-detail.js';
import { createNightLights } from './night-lights.js';
import { createWhaleSound } from './whale-sound.js';
import { createMusic } from './music.js';
import { cycleQuality, quality } from './quality.js';
import { createAmbience } from './ambience.js';
import { initSettings } from './settings.js';
import { initJourney, journeyOpen, logEvent, recordSpecialStamp, recordWhale, setJourneyOpen, setStampTargets, trackJourney } from './journey.js';
import { JAPAN_BARRIER_KM, PREVIEW_ALL_COUNTRIES, achievementsOpen, initAchievements, isCountryUnlocked, lockMessage, recordEvent, setAchievementsOpen, trackAchievements } from './achievements.js';
import { ELUANBI_OFFSHORE_START, geoToWorld, kmPerWorldUnitAt, worldToGeo, wrapWorldX } from './geo.js';
import { loadCountryPlaces, placeCountries } from './places.js';
import { COUNTRY_LABELS, buildCoarseRelief, distanceToLand, isOnLand, landIslands, onLandChange, streamLandAround, terrainHeightAt, updateLandDetail, updateLandStreaming } from './land.js';
import { revealGame, startingHeading, BOAT_WATERLINE_Y, WORLD_BOUNDS, boat, boatLights, camera, compassDial, currentVehicleType, cycleTimeMode, cycleWeatherMode, fpsReadout, glowTexture, headingReadout, landDistanceReadout, lighthouseBeacons, loading, positionReadout, reflectionExclusions, renderer, scene, sky, directional, sun, setWeatherAlert, speedReadout, startingWorldPosition, timeOfDay, updateDayCycle, updateWeather, water, weatherBlend, windDirection, windReadout } from './core.js';
import { createSeaLife } from './sea-life.js';
import { createSeaFx } from './sea-fx.js';
import { createLensFx } from './lens-fx.js';
import { createSkyFx } from './sky-fx.js';
import { createSkyExtras } from './sky-extras.js';
import { createLightningFx, unlockWeatherSound } from './weather-fx.js';
import { addTaiwanLandmarks, regroundTaiwanLandmarks, setTaipei101Night } from './taiwan-landmarks.js';
import { addLandmarks, refreshStampStops, regroundLandmarks, landmarkEntries, landmarkInstances, updateLandmarkVisibility, updateLandmarkAnimations } from './landmarks.js';
import { autopilotStep, markNavObstacle, nearestCoastPoint, runNavigation, setNavStatus, stopAutopilot } from './nav.js';
import { cameraAnchor, keys, state, topDownView } from './state.js';
import { setWorldMapOpen, updateExploration, updateWorldMap, worldMapOpen } from './world-map.js';
import { seaNameAt, updateSeaName } from './seas.js';
import './nav-ui.js';   // registers the destination box's suggestion list and submit handler
import { updateMapLabels } from './labels.js';

// Night view of the coast (see night-lights.js): clustered city lights, harbour lights, flashing lighthouses and sweeping beams.
let nightLights = null;
let capeScenery = null;
const landscapeLighting = createLandscapeLighting({renderer,scene,directional,sky});
const coastalWater = createCoastalWater(water,landIslands);
function addCityLights() {
  const cities = [], harbours = [], lighthouses = [];
  for (const { places } of placeCountries) {
    for (const place of places) {
      const world = geoToWorld({ latitude: place.lat, longitude: place.lon });
      if (place.type === 'LTHSE') { const onLand = isOnLand(world.x, world.y); lighthouses.push({ x: world.x, z: world.y, onLand, y: onLand ? terrainHeightAt(world.x, world.y) : 0 }); }
      else if (place.type === 'HBR' || place.type === 'PRT') harbours.push({ x: world.x, z: world.y });
      else if ((place.pop ?? 0) >= 50000 && place.type !== 'ADM1' && place.type !== 'ADM2' && place.type !== 'ISL' && isOnLand(world.x, world.y)) cities.push({ x: world.x, z: world.y, pop: place.pop });
    }
  }
  if (nightLights) {       // rebuilt once the East Asia heightmap arrives
    scene.remove(nightLights.group);
    nightLights.group.traverse((object) => { object.geometry?.dispose(); if (object.material && !object.material.map) object.material.dispose?.(); });
    reflectionExclusions.splice(reflectionExclusions.indexOf(nightLights.group), 1);
  }
  nightLights = createNightLights({ cities, harbours, lighthouses, isOnLand, heightAt: terrainHeightAt });
  scene.add(nightLights.group);
  reflectionExclusions.push(nightLights.group);
}
// Full-detail coast and heights around the start arrive first, then sights and lights are placed and the coarse relief
// of all land is built. Detail elsewhere streams in as the boat or jet moves (land.js); whenever heightmap tiles
// arrive or leave, the sights and lights are lifted onto the new heights (batched, at most once a second). The light
// layout itself is never rebuilt here: that takes seconds and froze flights that crossed many heightmap tiles.
let regroundTimer = 0;
const regroundBoxes = [];
onLandChange(({ kind, box, country }) => {
  if (kind === 'coast' && country) loadCountryPlaces(country);   // the country's full place list (islets, bays, villages)
  if (!landPlaced) return;
  if (kind === 'coast') { refreshStampStops(box); return; }
  regroundBoxes.push(box);
  if (regroundTimer) return;
  regroundTimer = setTimeout(() => {
    regroundTimer = 0;
    regroundTaiwanLandmarks(terrainHeightAt);
    regroundLandmarks();
    regroundLandmarkDetails();
    for (const changed of regroundBoxes.splice(0)) nightLights?.reground(changed);
  }, 1000);
});
let landPlaced = false;
async function addLand() {
  try { await streamLandAround(boat.position.x, boat.position.z); } catch (error) { console.error('無法載入附近的海岸線與地形', error); }
  addTaiwanLandmarks(terrainHeightAt);
  addLandmarks();
  setStampTargets(landmarkEntries);
  capeScenery = createCapeScenery({scene,reflectionExclusions,heightAt:terrainHeightAt,isOnLand});
  addCityLights();
  landPlaced = true;
  await buildCoarseRelief();
}



// Past the seam meridian the boat or jet comes back in at the other end of the world, one world width away; the
// camera, its look-at points and any autopilot course move with it, so nothing on screen jumps.
function wrapVehicle() {
  const dx = wrapWorldX(boat.position.x) - boat.position.x;
  if (!dx) return;
  boat.position.x += dx;
  if (currentVehicleType() === 'fighter') aircraft.x += dx;
  camera.position.x += dx; smoothLook.x += dx; controls.target.x += dx;
  for (const point of state.autopilot?.waypoints ?? []) point.x += dx;
}

function seaHeight(x, z, time) {
  return (
    Math.sin(x * .055 + z * .031 + time * .72) * .17 +
    Math.sin(x * .019 - z * .079 + time * .43) * .12 +
    Math.cos(x * .091 + z * .047 + time * .91) * .065
  );
}

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * .49;
controls.minDistance = 1.5;
controls.maxDistance = 80;
controls.enabled = false;
const observation=initCameraZoom({camera,canvas:renderer.domElement,onOpen:()=>{
  state.topDownMode=false;state.orbitMode=false;controls.enabled=false;state.smoothLookReady=false;
}});
const targetCamera = new THREE.Vector3();
const targetLook = new THREE.Vector3();
// Camera follows the boat's position on the water, not its wave bobbing: the bob would
// otherwise rock the whole view and make every distant island appear to shake.
const smoothLook = new THREE.Vector3();
const forward = new THREE.Vector2();
const starboard = new THREE.Vector2();
const clock = new THREE.Clock();
let aircraft=createFlightState();
let flightKick=0,flightAcceleration=0,displayFlightKnots=0;
const flightControls=document.querySelector('#flight-controls');
const flightReadout=document.querySelector('#flight-readout');
const flightModeReadout=document.querySelector('#flight-mode');
const flightHoldInput=createFlightHoldInput();
const flightObstacleBox=new THREE.Box3();
const flightObstacleTopAt=(x,z,radius=0)=>{
  let top=-Infinity;
  for(const item of landmarkInstances){
    if(Math.abs(item.displayX-x)>2+radius||Math.abs(item.displayZ-z)>2+radius)continue;
    flightObstacleBox.setFromObject(item.group);
    if(x+radius>=flightObstacleBox.min.x&&x-radius<=flightObstacleBox.max.x&&z+radius>=flightObstacleBox.min.z&&z-radius<=flightObstacleBox.max.z)
      top=Math.max(top,flightObstacleBox.max.y);
  }
  return top;
};
const flightEnvironment={isOnLand,terrainHeightAt,obstacleTopAt:flightObstacleTopAt,bounds:WORLD_BOUNDS};
const modeNames={grounded:'地面待命',takingOff:'起飛中',hover:'滯空中',flying:'飛行中',landing:'降落中'};
function syncAircraft(){
  boat.position.set(aircraft.x,aircraft.y,aircraft.z);
  boat.rotation.set(aircraft.pitch,aircraft.heading,aircraft.bank,'YXZ');
  const gear=boat.userData.ship?.userData.gear;if(gear)gear.visible=['grounded','takingOff','landing'].includes(aircraft.mode);
}
function flightCommand(command){
  if(currentVehicleType()!=='fighter')return;
  const result=command==='takeoff'?requestTakeoff(aircraft,flightEnvironment):command==='land'?requestLanding(aircraft,flightEnvironment):toggleHover(aircraft);
  showEventToast(result.ok?command==='takeoff'?'正在垂直起飛':command==='land'?'確認陸地，正在降落':result.mode==='hover'?'已切換滯空':'已恢復前進飛行':result.reason);
  syncAircraft();
}
for(const [id,command] of [['flight-takeoff','takeoff'],['flight-land','land']]){
  const button=document.querySelector(`#${id}`);
  button?.addEventListener('pointerdown',event=>{
    if(event.button!==0||currentVehicleType()!=='fighter')return;
    button.setPointerCapture(event.pointerId);
    flightHoldInput.press(`pointer:${event.pointerId}`,command);
  });
  button?.addEventListener('pointerup',event=>{
    const result=flightHoldInput.release(`pointer:${event.pointerId}`);
    if(result?.kind==='tap')flightCommand(command);
  });
  button?.addEventListener('pointercancel',event=>flightHoldInput.cancel(`pointer:${event.pointerId}`));
  // Keyboard activation and assistive clicks do not dispatch pointer events.
  button?.addEventListener('click',event=>{if(event.detail===0)flightCommand(command);});
}
document.querySelector('#flight-hover')?.addEventListener('click',()=>flightCommand('hover'));
// Turbo's last use is real time in localStorage, so reloading or another tab cannot skip the one-hour cooldown.
const TURBO_KEY='relax-turbo-v1';
const flightTurboButton=document.querySelector('#flight-turbo');
const lastTurboUse=()=>{try{return Number(localStorage.getItem(TURBO_KEY))||NaN;}catch{return NaN;}};
function flightTurbo(){
  if(currentVehicleType()!=='fighter')return;
  const now=Date.now(),result=requestTurbo(aircraft,{lastUsed:lastTurboUse(),now});
  if(result.ok)try{localStorage.setItem(TURBO_KEY,String(now));}catch{/* private mode: cooldown lasts this session only */}
  showEventToast(result.ok?'Turbo！10 秒內加速到最高速度 3 倍':result.reason);
}
flightTurboButton?.addEventListener('click',()=>flightTurbo());
function updateTurboButton(){
  if(!flightTurboButton)return;
  const left=turboCooldownLeft(lastTurboUse(),Date.now());
  const text=aircraft.turbo!==null?`Turbo ${turboMultiplier(aircraft).toFixed(1)}×`:left>0?`E Turbo ${Math.floor(left/60000)}:${String(Math.floor(left/1000)%60).padStart(2,'0')}`:'E Turbo';
  if(flightTurboButton.textContent!==text)flightTurboButton.textContent=text;
  flightTurboButton.classList.toggle('is-active',aircraft.turbo!==null);
  flightTurboButton.classList.toggle('is-cooling',aircraft.turbo===null&&left>0);
}

// Offshore spots to jump to: [offshore position, landmark the bow should face].
const TELEPORT_SPOTS = [
  { name: '基隆燈塔', sea: { latitude: 25.2150, longitude: 121.7900 }, landmark: { latitude: 25.155417, longitude: 121.747733 } },
  { name: '屏東燈塔', sea: ELUANBI_OFFSHORE_START, landmark: { latitude: 21.902250, longitude: 120.852667 } },
  { name: '沖繩', country: '日本', sea: { latitude: 26.2125, longitude: 127.6000 }, landmark: { latitude: 26.2125, longitude: 127.6790 } },
  { name: '鴨川', country: '日本', sea: { latitude: 35.0700, longitude: 140.1600 }, landmark: { latitude: 35.1147, longitude: 140.1030 } }
];
const locationButtons = [...document.querySelectorAll('[data-location]')];

function teleportTo(index) {
  if(currentVehicleType()==='fighter'){showEventToast('戰鬥機請直接飛行；傳送點供船隻使用');return;}
  const spot = TELEPORT_SPOTS[index];
  if (!spot) return;
  if (spot.country && !isCountryUnlocked(spot.country)) { showEventToast(lockMessage(spot.country)); return; }
  const sea = geoToWorld(spot.sea);
  const landmark = geoToWorld(spot.landmark);
  stopAutopilot();
  state.velocity = 0;
  boat.position.set(sea.x, BOAT_WATERLINE_Y, sea.y);
  // respect the 5 km rule: back away from the nearest shore until the boat is at least 5.5 km out
  for (let step = 0; step < 60 && distanceToLand(boat.position.x, boat.position.z).km < MIN_SHORE_KM + .5; step++) {
    const coast = nearestCoastPoint(boat.position.x, boat.position.z);
    const dx = boat.position.x - coast.x, dz = boat.position.z - coast.z, length = Math.hypot(dx, dz) || 1;
    boat.position.x += dx / length * .08; boat.position.z += dz / length * .08;
  }
  boat.rotation.set(0, Math.atan2(-(landmark.x - boat.position.x), -(landmark.y - boat.position.z)), 0);
  lastShoreKm = Infinity;
  // Snap the camera next to the boat so it doesn't glide hundreds of units across the map.
  const behind = new THREE.Vector3(.5, .75, 2.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), boat.rotation.y).add(boat.position);
  camera.position.copy(behind);
  state.smoothLookReady = false;
  controls.target.copy(boat.position);
  locationButtons.forEach((button) => button.classList.toggle('is-active', Number(button.dataset.location) === index));
}
locationButtons.forEach((button) => button.addEventListener('click', () => teleportTo(Number(button.dataset.location))));

// Top-down chart: wheel to zoom, drag to pan, double-click to recentre on the boat.
renderer.domElement.addEventListener('wheel', (event) => {
  if (!state.topDownMode) return;
  event.preventDefault();
  topDownView.height = THREE.MathUtils.clamp(topDownView.height * Math.exp(event.deltaY * .0012), 12, 1900);
}, { passive: false });
renderer.domElement.addEventListener('pointerdown', (event) => {
  if (!state.topDownMode) return;
  topDownView.drag = { x: event.clientX, y: event.clientY };
  renderer.domElement.setPointerCapture(event.pointerId);
});
renderer.domElement.addEventListener('pointermove', (event) => {
  if (!state.topDownMode || !topDownView.drag) return;
  const unitsPerPixel = 2 * topDownView.height * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / innerHeight;
  topDownView.offsetX -= (event.clientX - topDownView.drag.x) * unitsPerPixel;
  topDownView.offsetZ -= (event.clientY - topDownView.drag.y) * unitsPerPixel;
  topDownView.drag = { x: event.clientX, y: event.clientY };
});
const endMapDrag = () => { topDownView.drag = null; };
renderer.domElement.addEventListener('pointerup', endMapDrag);
renderer.domElement.addEventListener('pointercancel', endMapDrag);
renderer.domElement.addEventListener('dblclick', () => { topDownView.offsetX = 0; topDownView.offsetZ = 0; });

addEventListener('keydown', (event) => {
  if(event.key==='Escape'&&observation.view.active&&event.target.closest?.('#camera-zoom-panel')){observation.close();event.target.blur();return;}
  if (isTextControl(event.target)) {
    if (event.key === 'Escape') event.target.blur();
    return;
  }
  if (event.key === 'Tab') {
    event.preventDefault();
    if (!event.repeat) setWorldMapOpen(!worldMapOpen);
    return;
  }
  if (event.key === 'Escape' && journeyOpen()) { setJourneyOpen(false); return; }
  if (event.key === 'Escape' && achievementsOpen()) { setAchievementsOpen(false); return; }
  if (event.key === 'Escape' && worldMapOpen) { setWorldMapOpen(false); return; }
  const key = keyOf(event);
  if(currentVehicleType()==='fighter'&&['arrowup','arrowdown'].includes(key))event.preventDefault();
  if(currentVehicleType()==='fighter'&&['f','l'].includes(key)){
    if(!event.repeat)flightHoldInput.press(`key:${key}`,key==='f'?'takeoff':'land');
    return;
  }
  if(currentVehicleType()==='fighter'&&key==='h'&&!event.repeat){
    flightCommand('hover');return;
  }
  if(currentVehicleType()==='fighter'&&key==='e'&&!event.repeat){
    flightTurbo();return;
  }
  if(key==='escape'&&observation.view.active){observation.close();return;}
  if (isMovementKey(key) && key.startsWith('arrow')) event.preventDefault();
  if ((state.autopilot || state.navBusy) && (isMovementKey(key) || key === 'escape' || key === 'r')) stopAutopilot('已手動接管，自動導航結束');
  keys.add(key);
  if (/^[1-4]$/.test(key) && !event.repeat) teleportTo(Number(key) - 1);
  if (key === 'c' && !event.repeat) {
    observation.close();
    state.orbitMode = !state.orbitMode;
    state.topDownMode = false;
    controls.enabled = state.orbitMode;
    if (state.orbitMode) {
      controls.target.copy(boat.position);
      // still far away (e.g. pressed right after loading): start the orbit just behind the boat
      if (camera.position.distanceTo(boat.position) > 12) camera.position.set(.5, .75, 2.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), boat.rotation.y).add(boat.position);
    }
  }
  if (key === 'v' && !event.repeat) {
    observation.close();
    state.topDownMode = !state.topDownMode;
    topDownView.offsetX = 0; topDownView.offsetZ = 0;
    state.orbitMode = false;
    controls.enabled = false;
  }
  if (key === 'r' && !event.repeat) {
    state.velocity = 0;
    if(currentVehicleType()==='fighter'){
      aircraft=createFlightState({x:startingWorldPosition.x,y:.8,z:startingWorldPosition.y,heading:startingHeading,mode:'hover'});
      syncAircraft();showEventToast('已回到屏東外海上空');
    }else{
      boat.position.set(startingWorldPosition.x, BOAT_WATERLINE_Y, startingWorldPosition.y);
      boat.rotation.set(0, startingHeading, 0);
    }
    state.smoothLookReady=false;
  }
  if (key === 't' && !event.repeat) {
    cycleTimeMode();
  }
  if (key === 'g' && !event.repeat) cycleWeatherMode();
  if (key === 'o' && !event.repeat) setAchievementsOpen(!achievementsOpen());
  if (key === 'j' && !event.repeat) setJourneyOpen(!journeyOpen());
  if (key === 'b' && !event.repeat) { const on = music.toggle(); const hint = document.querySelector('#music-state'); if (hint) hint.textContent = on ? '開' : '關'; }
  if (key === 'q' && !event.repeat) { const q = cycleQuality(); const hint = document.querySelector('#quality-state'); if (hint) hint.textContent = q.name; showEventToast(`畫質：${q.name}`); }
  if (key === 'n' && !event.repeat) { const muted = ambience.toggle(); const hint = document.querySelector('#ambience-state'); if (hint) hint.textContent = muted ? '關' : '開'; }
  if (key === 'm' && !event.repeat) { const muted = whaleSound.toggle(); const hint = document.querySelector('#sound-state'); if (hint) hint.textContent = muted ? '靜音' : '開'; }
});
addEventListener('keyup', (event) => {
  const key=keyOf(event);
  if(currentVehicleType()==='fighter'&&['f','l'].includes(key)){
    const result=flightHoldInput.release(`key:${key}`);
    if(result?.kind==='tap')flightCommand(result.command);
  }
  keys.delete(key);
});
addEventListener('blur', () => {keys.clear();flightHoldInput.clear();});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const fpsMeter = { frames: 0, since: performance.now() };
function updateFps() {
  fpsMeter.frames++;
  const now = performance.now();
  if (now - fpsMeter.since < 500) return;
  const fps = fpsMeter.frames * 1000 / (now - fpsMeter.since);
  fpsMeter.frames = 0;
  fpsMeter.since = now;
  // a struggling machine gets one hint to lower the quality
  if (!fpsMeter.hinted && quality.level !== 'low' && performance.now() > 20000) {
    fpsMeter.slow = fps < 28 ? (fpsMeter.slow ?? 0) + 1 : 0;
    if (fpsMeter.slow >= 16) { fpsMeter.hinted = true; showEventToast('畫面有點卡：按 Q 可以降低畫質'); }
  }
  if (fpsReadout) {
    fpsReadout.textContent = `${Math.round(fps)} FPS`;
    fpsReadout.dataset.level = fps >= 50 ? 'good' : fps >= 30 ? 'ok' : 'low';
  }
}

// Random whale visits (see whale.js). Add ?whale to the URL for a quick demo: the first one appears after a few seconds.
const eventToast = document.querySelector('#event-toast');
let eventToastTimer = 0;
function showEventToast(text, kind = 'normal') {
  if (!eventToast) return;
  eventToast.textContent = text;
  eventToast.classList.toggle('is-big', kind === 'big');
  eventToast.hidden = false;
  eventToast.classList.remove('is-visible');
  void eventToast.offsetWidth;
  eventToast.classList.add('is-visible');
  clearTimeout(eventToastTimer);
  eventToastTimer = setTimeout(() => { eventToast.hidden = true; }, 6000);
}
const whaleEvent = createWhaleEvent({
  scene, boat, glowTexture, waterlineY: 0, isOnLand, distanceToLand, reflectionExclusions,   // waterlineY 0 = the sea surface (see SEA_LEVEL)
  quickDemo: new URLSearchParams(location.search).has('whale'),
  forceSpecies: new URLSearchParams(location.search).get('whale'),
  onAppear: (kind) => {
    recordEvent('whale'); recordWhale();
    if (kind === 'pink') { showEventToast('罕見！粉紅色的藍鯨出現了！', 'big'); recordSpecialStamp('pinkWhale'); } else showEventToast('發現鯨魚！');
  },
  onAlarm: () => showEventToast('鯨魚受驚，潛入深海'),
  onCall: (kind, volume) => whaleSound.call(kind, volume)
});
// Each arrival at a sight has a 5% chance of bringing the rare pink blue whale; if there is no room for it right then,
// it keeps trying for half a minute.
const PINK_WHALE_CHANCE = .05;
let pinkWhalePending = 0;
initJourney({ onNotify: showEventToast, onVisit: () => { if (Math.random() < PINK_WHALE_CHANCE) pinkWhalePending = 30; } });
initAchievements({ onNotify: (text, kind) => { showEventToast(text, kind); if (!text.startsWith('蓋章')) logEvent(text); }, onCircumnavigate: () => runNavigation('@circum') });
if (PREVIEW_ALL_COUNTRIES) setTimeout(() => showEventToast('預覽模式：所有國家都已開放，未解鎖國家不會集章或記錄成就'), 1500);
const lightningFx = createLightningFx();
// BOAT_WATERLINE_Y is where the boat's origin rides; the water surface itself is the plane y = 0.
const SEA_LEVEL = 0;
const seaLife = createSeaLife({ scene, boat, glowTexture, waterlineY: SEA_LEVEL, isOnLand, distanceToLand, geoToWorld, reflectionExclusions, onToast: (text) => { showEventToast(text); logEvent(text); }, quickDolphins: new URLSearchParams(location.search).has('dolphins') });
const skyFx = createSkyFx({ scene, camera });
const seaFx = createSeaFx({ scene, boat, glowTexture, waterlineY: SEA_LEVEL, reflectionExclusions });
const lensFx = createLensFx();
const skyExtras = createSkyExtras({ scene, camera, reflectionExclusions });
setWeatherAlert((text) => { showEventToast(text, 'big'); logEvent(text); });
// Browsers only allow audio after a user gesture; M mutes.
const whaleSound = createWhaleSound();
const music = createMusic();
const ambience = createAmbience();
const jetSound = createJetSound();
initSettings({ music, whaleSound, ambience, jetSound });
for (const type of ['pointerdown', 'keydown']) addEventListener(type, () => { whaleSound.unlock(); music.unlock(); ambience.unlock(); jetSound.unlock(); unlockWeatherSound(); }, { once: true });

document.querySelector('#whale-button')?.addEventListener('click', (event) => {
  event.currentTarget.blur();
  if (!whaleEvent.spawn()) showEventToast('附近沒有開闊海域');
});

let lastBarrierToast = 0, lastShoreToast = 0, lastShoreKm = Infinity;
let lastFlightWarningToast=0;
const MIN_SHORE_KM = 2;   // closest hand steering may bring the boat to a shore (autopilot stops further out)
const MANUAL_CRUISE = BASE_CRUISE_SPEED;   // same as the autopilot's cruise speed
function animate() {
  updateFps();
  const delta = Math.min(clock.getDelta(), .05);
  const elapsed = clock.elapsedTime;
  const windAngle = -1.22 + Math.sin(elapsed * .018) * .58 + weatherBlend.typhoon * Math.sin(elapsed * .35) * .5;
  const windSpeed = 13 + Math.sin(elapsed * .041) * 2.5 + weatherBlend.storm * 12 + weatherBlend.typhoon * 28;
  // sea state: 1 in calm weather, up to about 3 in a typhoon; scales how hard the boat pitches, rolls and bobs
  const waveScale = 1 + weatherBlend.storm * .7 + weatherBlend.typhoon * 1.4 + Math.max(0, windSpeed - 13) / 60;
  windDirection.set(Math.sin(windAngle), Math.cos(windAngle));
  updateDayCycle(delta);
  updateWeather(elapsed, delta);
  lightningFx.update(delta, weatherBlend.storm, weatherBlend.typhoon);
  if(currentVehicleType()!=='fighter'){
    whaleEvent.update(delta);
    if (pinkWhalePending > 0) { pinkWhalePending -= delta; if (!whaleEvent.active && whaleEvent.spawn('pink')) pinkWhalePending = 0; }
  }
  forward.set(-Math.sin(boat.rotation.y), -Math.cos(boat.rotation.y));
  starboard.set(-forward.y, forward.x);
  let nearestLand,sideDrift=0,steer=0;
  if(currentVehicleType()==='fighter'){
    const previousX=aircraft.x,previousZ=aircraft.z,previousSpeed=aircraft.speed;
    const axes=movementAxes(keys);
    const climbHold=flightHoldInput.active('takeoff'),descendHold=flightHoldInput.active('land');
    if(climbHold&&aircraft.mode==='grounded')flightCommand('takeoff');
    if(climbHold&&aircraft.mode==='landing')aircraft.mode='hover';
    if(descendHold&&['takingOff','landing'].includes(aircraft.mode))aircraft.mode='hover';
    flightStep(aircraft,{...axes,climb:climbHold,descend:descendHold},flightEnvironment,delta);
    flightAcceleration=Math.max(0,(aircraft.speed-previousSpeed)/Math.max(delta,1e-4));
    flightKick=Math.max(flightKick*Math.exp(-delta*3.8),Math.min(1,flightAcceleration/4));
    nearestLand=distanceToLand(aircraft.x,aircraft.z);
    if(!isCountryUnlocked(nearestLand.country)&&nearestLand.km<JAPAN_BARRIER_KM){
      aircraft.x=previousX;aircraft.z=previousZ;aircraft.speed=0;aircraft.warning=lockMessage(nearestLand.country);
      nearestLand=distanceToLand(aircraft.x,aircraft.z);
    }
    if(aircraft.warning&&performance.now()-lastFlightWarningToast>4200){showEventToast(aircraft.warning);lastFlightWarningToast=performance.now();}
    state.velocity=aircraft.speed;
    syncAircraft();
    ambience.update(delta,{gulls:0,wind:windSpeed,rain:Math.max(weatherBlend.rain,weatherBlend.storm,weatherBlend.typhoon),storm:Math.min(1,weatherBlend.storm+weatherBlend.typhoon),speed:0});
    skyExtras.update({delta,elapsed,sun,precipitation:Math.max(weatherBlend.rain,weatherBlend.storm,weatherBlend.typhoon),mist:weatherBlend.mist});
    skyFx.update({delta,elapsed,night:timeOfDay==='night',latitude:worldToGeo(aircraft.x,aircraft.z).latitude,storm:weatherBlend.storm,typhoon:weatherBlend.typhoon});
  }else{
  flightAcceleration=0;flightKick=0;
  const autoSteer = autopilotStep(delta);
  steer = autoSteer ?? 0;
  if (autoSteer === null) {
    const { throttle, steer: manualSteer } = movementAxes(keys);
    // full ahead settles at the autopilot's cruising speed (2.2 units/s ≈ 88 kn): force / drag = 2.2
    const engineForce = throttle > 0 ? MANUAL_CRUISE * state.handling.speed * .45 : throttle < 0 ? -.26 : 0;
    // W / S drive the engine forward or astern; water drag settles the boat at its cruising speed.
    state.velocity += (engineForce - state.velocity * .45) * delta;
    state.velocity = THREE.MathUtils.clamp(state.velocity, -.64, MANUAL_CRUISE * state.handling.speed);
    steer = manualSteer;
    boat.rotation.y += steer * delta * (.36 + Math.abs(state.velocity) * .035) * state.handling.turn * Math.sign(state.velocity || 1);
  }
  forward.set(-Math.sin(boat.rotation.y), -Math.cos(boat.rotation.y));
  starboard.set(-forward.y, forward.x);
  // Wind remains a gentle lateral influence at the new map-navigation scale.
  sideDrift = starboard.dot(windDirection) * windSpeed * (.00018 + Math.abs(state.velocity) * .000022);
  boat.position.x += (forward.x * state.velocity + starboard.x * sideDrift) * delta;
  boat.position.z += (forward.y * state.velocity + starboard.y * sideDrift) * delta;

  const previousPosition={x:boat.position.x-(forward.x*state.velocity+starboard.x*sideDrift)*delta,z:boat.position.z-(forward.y*state.velocity+starboard.y*sideDrift)*delta};
  const sceneryHit=sceneryObstacles.some(o=>movementBlocked(o,previousPosition,{x:boat.position.x,z:boat.position.z}));
  if (isOnLand(boat.position.x, boat.position.z)||sceneryHit) {
    const obstacleX=boat.position.x, obstacleZ=boat.position.z;
    boat.position.x = previousPosition.x;
    boat.position.z = previousPosition.z;
    state.velocity *= -.16;
    state.collisionPulse = 1;
    if (state.autopilot) {
      const { query, retries } = state.autopilot;
      markNavObstacle(obstacleX, obstacleZ);
      stopAutopilot();
      if (retries > 0) scheduleNavigationRetry(query, retries - 1);
      else setNavStatus('撞上陸地，自動導航中止', 'error');
    }
  }
  // Japan is locked until Taiwan has been sailed round: its waters turn the boat back.
  let shoreX=boat.position.x,shoreZ=boat.position.z;
  nearestLand = distanceToLand(shoreX,shoreZ);
  seaLife.update({ delta, elapsed, night: timeOfDay === 'night', storm: weatherBlend.storm, typhoon: weatherBlend.typhoon, speed: Math.abs(state.velocity), nearestLand });
  ambience.update(delta, { gulls: seaLife.gullLevel * 6, wind: windSpeed, rain: Math.max(weatherBlend.rain, weatherBlend.storm, weatherBlend.typhoon), storm: Math.min(1, weatherBlend.storm + weatherBlend.typhoon), speed: Math.abs(state.velocity) });
  skyExtras.update({ delta, elapsed, sun, precipitation: Math.max(weatherBlend.rain, weatherBlend.storm, weatherBlend.typhoon), mist: weatherBlend.mist });
  skyFx.update({ delta, elapsed, night: timeOfDay === 'night', latitude: worldToGeo(boat.position.x, boat.position.z).latitude, storm: weatherBlend.storm, typhoon: weatherBlend.typhoon });
  // Hand steering may not bring the boat within MIN_SHORE_KM of any coast. Instead of stopping dead, the part of the move
  // that heads toward the shore is removed, so the boat slides along the limit and can keep sailing parallel to the coast.
  if (!state.autopilot && nearestLand.km < MIN_SHORE_KM && nearestLand.km < lastShoreKm) {
    const moveX = boat.position.x - previousPosition.x, moveZ = boat.position.z - previousPosition.z;
    boat.position.x -= moveX; boat.position.z -= moveZ;
    const coast = nearestCoastPoint(boat.position.x, boat.position.z);
    let nx = boat.position.x - coast.x, nz = boat.position.z - coast.z;
    const length = Math.hypot(nx, nz) || 1; nx /= length; nz /= length;
    const inward = moveX * nx + moveZ * nz;
    const slideX = moveX - Math.min(0, inward) * nx, slideZ = moveZ - Math.min(0, inward) * nz;
    boat.position.x += slideX; boat.position.z += slideZ;
    const after = distanceToLand(boat.position.x, boat.position.z);
    if (isOnLand(boat.position.x, boat.position.z) || sceneryObstacles.some(o=>movementBlocked(o,previousPosition,{x:boat.position.x,z:boat.position.z})) || after.km < Math.min(lastShoreKm, MIN_SHORE_KM) - .02) { boat.position.x -= slideX; boat.position.z -= slideZ; state.velocity *= .5; }   // a corner: no way along it
    else lastShoreKm = Math.min(lastShoreKm, after.km);
    if (performance.now() - lastShoreToast > 8000) { lastShoreToast = performance.now(); showEventToast(`靠岸限制：最近只能到離岸 ${MIN_SHORE_KM} 公里`); }
  } else lastShoreKm = nearestLand.km;
  if(boat.position.x!==shoreX||boat.position.z!==shoreZ){
    shoreX=boat.position.x;shoreZ=boat.position.z;nearestLand=distanceToLand(shoreX,shoreZ);
  }
  if (!isCountryUnlocked(nearestLand.country) && nearestLand.km < JAPAN_BARRIER_KM) {   // locked countries turn the boat back at their waters
    boat.position.x = previousPosition.x;
    boat.position.z = previousPosition.z;
    state.velocity *= -.16;
    state.collisionPulse = 1;
    if (state.autopilot) stopAutopilot(lockMessage(nearestLand.country), 'error');
    if (performance.now() - lastBarrierToast > 4000) { lastBarrierToast = performance.now(); showEventToast(lockMessage(nearestLand.country)); }
  }
  // east-west the world wraps (wrapVehicle); north and south it ends
  const clampedZ = THREE.MathUtils.clamp(boat.position.z, WORLD_BOUNDS.minZ, WORLD_BOUNDS.maxZ);
  if (clampedZ !== boat.position.z) {
    boat.position.z = clampedZ;
    state.velocity *= -.22;
    state.collisionPulse = 1;
  }
  if(boat.position.x!==shoreX||boat.position.z!==shoreZ){
    shoreX=boat.position.x;shoreZ=boat.position.z;nearestLand=distanceToLand(shoreX,shoreZ);
  }
  }
  wrapVehicle();
  if(currentVehicleType()!=='fighter'){
  trackAchievements({ delta, x: boat.position.x, z: boat.position.z, nearestLand, night: timeOfDay === 'night', speed: Math.abs(state.velocity), landmarks: landmarkEntries });
  trackJourney({ delta, x: boat.position.x, z: boat.position.z, kmPerUnit: kmPerWorldUnitAt(boat.position.z), speed: Math.abs(state.velocity), seaName: () => seaNameAt(boat.position.x, boat.position.z), nearestLand, stampTargets: landmarkEntries });
  }
  state.collisionPulse = Math.max(0, state.collisionPulse - delta * 2.4);

  let wakeForce=0;
  if(currentVehicleType()!=='fighter'){
  const bowWave = seaHeight(boat.position.x + forward.x * 4.5, boat.position.z + forward.y * 4.5, elapsed);
  const sternWave = seaHeight(boat.position.x - forward.x * 4.5, boat.position.z - forward.y * 4.5, elapsed);
  const portWave = seaHeight(boat.position.x - starboard.x * 2, boat.position.z - starboard.y * 2, elapsed);
  const starboardWave = seaHeight(boat.position.x + starboard.x * 2, boat.position.z + starboard.y * 2, elapsed);
  const centerWave = seaHeight(boat.position.x, boat.position.z, elapsed);
  const targetPitch = Math.atan2(sternWave - bowWave, 9) * waveScale + Math.sin(elapsed * .9) * .018 * (waveScale - 1);
  const targetRoll = Math.atan2(portWave - starboardWave, 4) * waveScale - sideDrift * .012 + state.collisionPulse * .07 + Math.sin(elapsed * .7 + 1) * .03 * (waveScale - 1);
  // Water's visible motion is shader-based, so do not apply its full analytic
  // wave height to the hull. A tightly bounded bob keeps its keel above water.
  const gentleBob = (Math.sin(elapsed * 1.05 + boat.position.x * .04) * .008 + centerWave * .018) * waveScale;
  boat.position.y = THREE.MathUtils.lerp(boat.position.y, BOAT_WATERLINE_Y + gentleBob, 1 - Math.pow(.002, delta));
  boat.rotation.x = THREE.MathUtils.lerp(boat.rotation.x, targetPitch, 1 - Math.pow(.006, delta));
  boat.rotation.z = THREE.MathUtils.lerp(boat.rotation.z, targetRoll, 1 - Math.pow(.006, delta));
  seaFx.update({ delta, light: (timeOfDay === 'night' ? .16 : 1) * (1 - .4 * Math.min(1, weatherBlend.storm + weatherBlend.typhoon)), speed: Math.abs(state.velocity), waveScale, windSpeed, windDirection, forward: { x: forward.x, z: forward.y }, pitch: boat.rotation.x });
  // `velocity` is expressed in scene units while the HUD presents knots. Use
  // the small cruising range here so a visible wake begins with normal motion,
  // instead of only appearing at unrealistically high scene speeds.
  wakeForce = THREE.MathUtils.clamp((Math.abs(state.velocity) - .0002) / .0015, 0, 1);
  boat.userData.wake.material.uniforms.time.value = elapsed;
  // Foam follows real speed (a boat merely drifting in the wind leaves none); the camera keeps its own, more sensitive wakeForce.
  const foamForce = THREE.MathUtils.clamp((Math.abs(state.velocity) - .01) / .25, 0, 1);
  boat.userData.wake.material.uniforms.strength.value = foamForce * .82;
  }else boat.userData.wake.material.uniforms.strength.value=0;
  lensFx.update(delta, { rain: Math.max(weatherBlend.rain, weatherBlend.storm, weatherBlend.typhoon), spray: currentVehicleType()==='fighter'?0:Math.max(0, waveScale - 1.6) * .5 * Math.min(1, Math.abs(state.velocity) * 4), topDown: state.topDownMode });
  water.material.uniforms.time.value += delta * (.85 + weatherBlend.storm*.45 + weatherBlend.typhoon*.7);
  for (const { lensMaterial, flashPeriod, flashPattern } of lighthouseBeacons) {
    const isLit = flashPattern(elapsed % flashPeriod);
    // by day a lantern is just glass: it only blazes after dark
    const lampLevel = timeOfDay === 'night' ? 1 : .12;
    lensMaterial.emissiveIntensity = (isLit ? 3.4 : .55) * lampLevel;
  }

  const darkSky = timeOfDay === 'night';   // the boat's lamps and searchlight only at night
  boatLights.visible = darkSky&&currentVehicleType()!=='fighter';
  boat.userData.ship?.userData.setNight?.(darkSky);
  setTaipei101Night(timeOfDay === 'night');
  setLandmarkNight(timeOfDay === 'night');
  nightLights?.update({
    time: elapsed, delta, night: timeOfDay === 'night', camera, viewportHeight: innerHeight, pixelRatio: renderer.getPixelRatio(),
    boat: { x: boat.position.x, z: boat.position.z }, darkness: weatherBlend.rain
  });

  const flying=currentVehicleType()==='fighter';
  const feedback=flightFeedback(flying?aircraft.speed:0,flightKick*4);
  boat.userData.ship?.userData.setPropulsion?.({...feedback,delta,active:flying&&aircraft.mode!=='grounded'&&aircraft.mode!=='landing'});
  jetSound.update({active:flying,speed:flying?aircraft.speed:0,acceleration:flightAcceleration});
  seaFx.root.visible=!flying;
  cameraAnchor.set(boat.position.x, flying?boat.position.y:BOAT_WATERLINE_Y, boat.position.z);
  if(observation.update(delta,cameraAnchor,boat.rotation.y)){
    state.smoothLookReady=false;
  } else if (state.topDownMode) {
    targetCamera.set(topDownView.offsetX, topDownView.height, topDownView.offsetZ + .01).add(cameraAnchor);
    camera.position.lerp(targetCamera, 1 - Math.pow(.0002, delta));
    camera.lookAt(cameraAnchor.x + topDownView.offsetX, flying?cameraAnchor.y:0, cameraAnchor.z + topDownView.offsetZ);
    camera.fov = THREE.MathUtils.lerp(camera.fov, 45, 1 - Math.pow(.02, delta));
    camera.updateProjectionMatrix();
    state.smoothLookReady = false;
  } else if (!state.orbitMode) {
    const follow = 1 - Math.pow(.0006, delta);
    targetCamera.set(flying ? .18 : .5, flying ? .34 : .75 + wakeForce * .12, flying ? feedback.followDistance : 2.2 + wakeForce * .45).applyAxisAngle(new THREE.Vector3(0, 1, 0), boat.rotation.y).add(cameraAnchor);
    if(flying)camera.position.copy(targetCamera);
    else camera.position.lerp(targetCamera, follow);
    targetLook.set(0, flying ? .08 : .2, flying ? -feedback.lookAhead : -wakeForce * .4).applyAxisAngle(new THREE.Vector3(0, 1, 0), boat.rotation.y).add(cameraAnchor);
    if (!state.smoothLookReady) { smoothLook.copy(targetLook); state.smoothLookReady = true; }
    if(flying)smoothLook.copy(targetLook);
    else smoothLook.lerp(targetLook, Math.min(1, follow * 1.6));
    camera.lookAt(smoothLook);
    camera.rotateZ(flying?aircraft.bank*.11:-steer * wakeForce * .018 + Math.sin(elapsed * 1.3) * .012 * (waveScale - 1));
    camera.fov = THREE.MathUtils.lerp(camera.fov, flying?feedback.fov:55 + wakeForce * 9, 1 - Math.pow(.02, delta));
    camera.updateProjectionMatrix();
  } else {
    controls.target.lerp(cameraAnchor, .08);
    controls.update();
    state.smoothLookReady = false;
  }
  coastalWater.update(camera,timeOfDay==='night',weatherBlend.storm);
  updateLandStreaming(boat.position.x, boat.position.z);
  updateLandDetail();
  updateExploration();
  updateWorldMap();
  updateLandmarkVisibility();
  updateLandmarkAnimations(elapsed);
  updateLandmarkDetails(camera,timeOfDay==='night');
  capeScenery?.update(camera,timeOfDay==='night');
  landscapeLighting.update({camera,boat,sun,night:timeOfDay==='night',time:elapsed,storm:weatherBlend.storm});
  updateSeaName();
  updateMapLabels(state.topDownMode, camera.position.y);
  updateLandmarkHud(delta,state.topDownMode);
  if(flying){
    const targetKnots=Math.abs(state.velocity*40);
    displayFlightKnots+=(targetKnots-displayFlightKnots)*(1-Math.exp(-delta*7));
    speedReadout.textContent=displayFlightKnots.toFixed(0);
  }else speedReadout.textContent=Math.abs(state.velocity*40).toFixed(0);   // cruising ≈ 88 kn
  speedReadout.classList.toggle('is-accelerating',flying&&flightKick>.12);
  if(flightReadout){
    flightReadout.hidden=!flying;
    if(flying){
      const ground=isOnLand(boat.position.x,boat.position.z)?terrainHeightAt(boat.position.x,boat.position.z):0;
      const climb=Math.round(aircraft.verticalSpeed*300);
      flightReadout.textContent=`高度 ${Math.max(0,Math.round(boat.position.y*1000))} m · 離地 ${aircraft.mode==='grounded'?0:Math.max(0,Math.round((boat.position.y-ground)*1000))} m · 升降 ${climb>0?'+':''}${climb} m/min`;
    }
  }
  if(flightModeReadout&&flying)flightModeReadout.textContent=modeNames[aircraft.mode]??'飛行中';
  if(flying)updateTurboButton();
  const compass = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const windIndex = Math.round((Math.atan2(-windDirection.x, windDirection.y) / (Math.PI * 2)) * 8 + 8) % 8;
  windReadout.textContent = `WIND · ${compass[windIndex]} ${windSpeed.toFixed(0)} kn`;
  const headingDegrees = (THREE.MathUtils.radToDeg(-boat.rotation.y) + 360) % 360;
  const headingIndex = Math.round(headingDegrees / 45) % 8;
  compassDial.style.transform = `rotate(${-headingDegrees}deg)`;
  headingReadout.textContent = `${String(Math.round(headingDegrees)).padStart(3, '0')}° ${compass[headingIndex]}`;
  const coordinates = worldToGeo(boat.position.x, boat.position.z);
  const latitudeHemisphere = coordinates.latitude >= 0 ? 'N' : 'S';
  const longitudeHemisphere = coordinates.longitude >= 0 ? 'E' : 'W';
  positionReadout.textContent = `${Math.abs(coordinates.latitude).toFixed(3)}° ${latitudeHemisphere} · ${Math.abs(coordinates.longitude).toFixed(3)}° ${longitudeHemisphere}`;
  const coastName = COUNTRY_LABELS[nearestLand.country];
  landDistanceReadout.textContent = nearestLand.km < .2 ? `${coastName} COAST · ARRIVED` : `${coastName} COAST · ${nearestLand.km.toFixed(1)} km`;
  // The sea plane and sky box are finite (10,000 units): keep them centred on the camera so they never run out,
  // however far the map reaches. Water ripples are sampled in world space, so moving the plane does not slide them.
  water.position.x = camera.position.x; water.position.z = camera.position.z;
  sky.position.copy(camera.position);
  // Seen from high up (chart view, jet at altitude) a fixed 0.05 near plane leaves too little depth precision, and low
  // plains just above sea level flicker through the water; push the near plane out with the camera's height.
  const near = THREE.MathUtils.clamp(camera.position.y * .02, .05, 40);
  if (Math.abs(near - camera.near) > camera.near * .1) { camera.near = near; camera.updateProjectionMatrix(); }
  renderer.render(scene, camera);
}

// Preserve the original boat save unchanged; aircraft have a separate position and altitude record.
const VOYAGE_KEY = 'relax-boat-v1';
const AIRCRAFT_KEY = 'relax-aircraft-v1';
let seaVoyage={x:startingWorldPosition.x,z:startingWorldPosition.y,heading:startingHeading};
try {
  const saved = JSON.parse(localStorage.getItem(VOYAGE_KEY) ?? 'null');
  if (saved && [saved.x, saved.z, saved.heading].every(Number.isFinite) && !isOnLand(saved.x, saved.z)) {
    seaVoyage={x:wrapWorldX(saved.x),z:THREE.MathUtils.clamp(saved.z,WORLD_BOUNDS.minZ,WORLD_BOUNDS.maxZ),heading:saved.heading};
  }
} catch { /* no saved voyage */ }
let savedAircraft=null;
try{
  const saved=JSON.parse(localStorage.getItem(AIRCRAFT_KEY)??'null');
  if(saved&&[saved.x,saved.y,saved.z,saved.heading].every(Number.isFinite)&&['hover','flying','grounded','takingOff','landing'].includes(saved.mode))
    savedAircraft=createFlightState({x:wrapWorldX(saved.x),y:THREE.MathUtils.clamp(saved.y,0,FLIGHT_MAX_HEIGHT),z:THREE.MathUtils.clamp(saved.z,WORLD_BOUNDS.minZ,WORLD_BOUNDS.maxZ),heading:saved.heading,mode:['takingOff','landing'].includes(saved.mode)?'hover':saved.mode,speed:Number.isFinite(saved.speed)?saved.speed:0});
}catch{/* first flight */}
let aircraftInitialized=false;
function saveAircraft(){try{localStorage.setItem(AIRCRAFT_KEY,JSON.stringify({x:aircraft.x,y:aircraft.y,z:aircraft.z,heading:aircraft.heading,mode:aircraft.mode,speed:aircraft.speed}));}catch{/* private mode */}}
function activateVehicle({previous,type}){
  if(previous==='fighter')saveAircraft();
  else if(previous){
    seaVoyage={x:boat.position.x,z:boat.position.z,heading:boat.rotation.y};
    try{localStorage.setItem(VOYAGE_KEY,JSON.stringify(seaVoyage));}catch{/* private mode */}
  }
  stopAutopilot();state.velocity=0;state.smoothLookReady=false;
  flightKick=0;flightAcceleration=0;
  observation.close();state.orbitMode=false;state.topDownMode=false;controls.enabled=false;
  keys.clear();flightHoldInput.clear();lastShoreKm=Infinity;
  const fighter=type==='fighter';
  document.body.classList.toggle('fighter-mode',fighter);
  if(fighter){
    if(!aircraftInitialized){
      aircraft=savedAircraft??createFlightState({x:boat.position.x,y:Math.max(.8,terrainHeightAt(boat.position.x,boat.position.z)+.65),z:boat.position.z,heading:boat.rotation.y,mode:'hover'});
      aircraftInitialized=true;
    }
    if(aircraft.mode==='grounded'&&!landingSite(aircraft,flightEnvironment).ok)aircraft.mode='hover';
    aircraft.y=Math.max(aircraft.y,aircraft.mode==='grounded'?terrainHeightAt(aircraft.x,aircraft.z)+.055:(isOnLand(aircraft.x,aircraft.z)?terrainHeightAt(aircraft.x,aircraft.z):0)+FLIGHT_MIN_CLEARANCE);
    displayFlightKnots=Math.abs(aircraft.speed*40);
    syncAircraft();
    showEventToast(aircraft.mode==='grounded'?'戰鬥機在陸地待命，按 F 起飛':'戰鬥機已在空中；可飛到陸地上方降落');
  }else{
    boat.position.set(seaVoyage.x,BOAT_WATERLINE_Y,seaVoyage.z);
    boat.rotation.set(0,seaVoyage.heading,0);
  }
  if(flightControls)flightControls.hidden=!fighter;
  if(fighter)setStampGuidanceEnabled(false);
  const navToggle=document.querySelector('#nav-toggle'),navPanel=document.querySelector('#nav-panel');
  if(navToggle)navToggle.hidden=fighter;
  if(navPanel&&fighter)navPanel.hidden=true;
  const guide=document.querySelector('#stamp-guidance-toggle');if(guide)guide.hidden=fighter;
  const mapGuide=document.querySelector('.world-map-guide-toggle');if(mapGuide)mapGuide.hidden=fighter;
  camera.position.set(fighter ? .18 : .5,fighter ? .34 : .75,fighter ? 1.35 : 2.2).applyAxisAngle(new THREE.Vector3(0,1,0),boat.rotation.y).add(boat.position);
}
addEventListener('vehiclechange',event=>activateVehicle(event.detail));
if(currentVehicleType()==='fighter')activateVehicle({previous:null,type:'fighter'});
else{boat.position.set(seaVoyage.x,BOAT_WATERLINE_Y,seaVoyage.z);boat.rotation.y=seaVoyage.heading;}
const saveVoyage = () => {
  if(currentVehicleType()==='fighter'){saveAircraft();return;}
  seaVoyage={x:boat.position.x,z:boat.position.z,heading:boat.rotation.y};
  try { localStorage.setItem(VOYAGE_KEY,JSON.stringify(seaVoyage)); } catch { /* private mode */ }
};
setInterval(() => { if (document.visibilityState === 'visible') saveVoyage(); }, 3000);   // a second, hidden game tab must not overwrite the voyage being played
addEventListener('pagehide', saveVoyage);
const atParam = new URLSearchParams(location.search).get('at')?.split(',').map(Number);   // ?at=14.5,120.8 starts there (for checking far regions)
if (atParam?.length === 2 && atParam.every(Number.isFinite)) { const start = geoToWorld({ latitude: atParam[0], longitude: atParam[1] }); boat.position.x = start.x; boat.position.z = start.y; if(currentVehicleType()==='fighter'){aircraft.x=start.x;aircraft.z=start.y;aircraft.mode='hover';aircraft.y=Math.max(aircraft.y,terrainHeightAt(start.x,start.y)+.6);syncAircraft();} }
const headingParam = new URLSearchParams(location.search).get('heading');   // ?heading=270 starts facing west (for checking views)
if (headingParam !== null && !Number.isNaN(Number(headingParam))) {boat.rotation.y = -THREE.MathUtils.degToRad(Number(headingParam));if(currentVehicleType()==='fighter')aircraft.heading=boat.rotation.y;}
camera.position.set(currentVehicleType()==='fighter' ? .18 : .5, currentVehicleType()==='fighter' ? .34 : .75, currentVehicleType()==='fighter' ? 1.35 : 2.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), boat.rotation.y).add(boat.position);
loading?.remove();
window.__gameStarted = true;
{ const hint = document.querySelector('#quality-state'); if (hint) hint.textContent = quality.name; }
addLand();   // after the saved or ?at= position is restored, so the first detail streams in around it
revealGame();
renderer.setAnimationLoop(animate);

// The help list and the autopilot panel are folded into two corner buttons.
for (const [buttonId, panelId, focus] of [['controls-toggle', 'controls-panel', null], ['nav-toggle', 'nav-panel', 'nav-input']]) {
  const button = document.querySelector(`#${buttonId}`), panel = document.querySelector(`#${panelId}`);
  button?.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    button.setAttribute('aria-expanded', String(!panel.hidden));
    button.blur();
    if (!panel.hidden && focus) document.querySelector(`#${focus}`)?.focus();
  });
}
