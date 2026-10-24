import {stampGuidanceEnabled,setStampGuidanceEnabled,onStampGuidanceChange,stampBearing,nearbyStampGuides} from './stamp-guidance.js';
import {landmarkAccess} from './landmark-access.js';
import {isCountryUnlocked} from './achievements.js';
import {hasStamp} from './journey.js';
import { geoToWorld, worldToGeo, kmPerWorldUnitAt } from './geo.js';
import { WORLD_BOUNDS, boat, currentVehicleType } from './core.js';
import { landIslands } from './land.js';
import { seaMainAnchors } from './seas.js';
import { PLACE_TYPE_WEIGHT, placeCountries } from './places.js';
import { runNavigation } from './nav.js';

// ---------------------------------------------------------------------------
// Exploration + world map (Tab): unexplored water and land stay grey; what the boat has
// sailed past turns green (land) or blue (sea). Progress is kept in localStorage.
// ---------------------------------------------------------------------------
const EXPLORE_REVEAL_RADIUS = 16;     // world units (~44 km) revealed around the boat
const EXPLORE_STORAGE_KEY = 'relax-explored-v1';
const MAP_PIXELS_PER_UNIT = 2;
const mapUnitsWide = WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX, mapUnitsHigh = WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ;
const exploreCanvas = document.createElement('canvas');
exploreCanvas.width = Math.ceil(mapUnitsWide);
exploreCanvas.height = Math.ceil(mapUnitsHigh);
const exploreContext = exploreCanvas.getContext('2d', { willReadFrequently: true });
const UNEXPLORED_GREY = '#808890';
exploreContext.fillStyle = UNEXPLORED_GREY;
exploreContext.fillRect(0, 0, exploreCanvas.width, exploreCanvas.height);
let exploreDirty = false, lastRevealX = Infinity, lastRevealZ = Infinity;

try {
  const saved = localStorage.getItem(EXPLORE_STORAGE_KEY);
  if (saved) {
    const image = new Image();
    image.onload = () => {
      // Keep anything revealed this session on top of what was saved.
      const current = document.createElement('canvas');
      current.width = exploreCanvas.width; current.height = exploreCanvas.height;
      current.getContext('2d').drawImage(exploreCanvas, 0, 0);
      exploreContext.globalCompositeOperation = 'source-over';
      exploreContext.clearRect(0, 0, exploreCanvas.width, exploreCanvas.height);
      exploreContext.drawImage(image, 0, 0);
      exploreContext.globalCompositeOperation = 'destination-in';
      exploreContext.drawImage(current, 0, 0);
      // the map may have grown since it was saved (new regions): fill the uncovered part with the unexplored grey
      exploreContext.globalCompositeOperation = 'destination-over';
      exploreContext.fillStyle = UNEXPLORED_GREY;
      exploreContext.fillRect(0, 0, exploreCanvas.width, exploreCanvas.height);
      exploreContext.globalCompositeOperation = 'source-over';
    };
    image.src = saved;
  }
} catch { /* storage unavailable: exploration just won't persist */ }

function revealAround(x, z) {
  const px = x - WORLD_BOUNDS.minX, pz = z - WORLD_BOUNDS.minZ;
  const gradient = exploreContext.createRadialGradient(px, pz, 0, px, pz, EXPLORE_REVEAL_RADIUS);
  gradient.addColorStop(0, 'rgba(0,0,0,1)');
  gradient.addColorStop(.75, 'rgba(0,0,0,1)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  exploreContext.globalCompositeOperation = 'destination-out';
  exploreContext.fillStyle = gradient;
  exploreContext.beginPath();
  exploreContext.arc(px, pz, EXPLORE_REVEAL_RADIUS, 0, Math.PI * 2);
  exploreContext.fill();
  exploreContext.globalCompositeOperation = 'source-over';
  exploreDirty = true;
}
export function updateExploration() {
  const x = boat.position.x, z = boat.position.z;
  if (Math.hypot(x - lastRevealX, z - lastRevealZ) < 3) return;
  lastRevealX = x; lastRevealZ = z;
  revealAround(x, z);
}
setInterval(() => {
  if (!exploreDirty) return;
  exploreDirty = false;
  try { localStorage.setItem(EXPLORE_STORAGE_KEY, exploreCanvas.toDataURL('image/png')); } catch { /* ignore */ }
}, 8000);

const worldMapOverlay = document.querySelector('#world-map');
const worldMapCanvas = document.querySelector('#world-map-canvas');
const worldMapStats = document.querySelector('#world-map-stats');
export let worldMapOpen = false;
let mapShapeCanvas = null;
let mapColorCanvas = null, mapLandSamples = null;

const mapGuideToggle=document.createElement('button');mapGuideToggle.type='button';mapGuideToggle.className='world-map-guide-toggle';mapGuideToggle.textContent='⚑ 集章指示';mapGuideToggle.setAttribute('aria-pressed','false');
document.querySelector('.world-map-help').prepend(mapGuideToggle,'　');
mapGuideToggle.addEventListener('click',()=>setStampGuidanceEnabled(!stampGuidanceEnabled));
onStampGuidanceChange(enabled=>{mapGuideToggle.setAttribute('aria-pressed',String(enabled));if(worldMapOpen)drawWorldMap();});

function buildWorldMapBase() {
  mapColorCanvas = document.createElement('canvas');
  mapColorCanvas.width = Math.ceil(mapUnitsWide * MAP_PIXELS_PER_UNIT);
  mapColorCanvas.height = Math.ceil(mapUnitsHigh * MAP_PIXELS_PER_UNIT);
  const context = mapColorCanvas.getContext('2d', { willReadFrequently: true });
  context.fillStyle = '#2f78b8';
  context.fillRect(0, 0, mapColorCanvas.width, mapColorCanvas.height);
  context.setTransform(MAP_PIXELS_PER_UNIT, 0, 0, MAP_PIXELS_PER_UNIT, -WORLD_BOUNDS.minX * MAP_PIXELS_PER_UNIT, -WORLD_BOUNDS.minZ * MAP_PIXELS_PER_UNIT);
  context.fillStyle = '#5aa65c';
  context.strokeStyle = '#2f6b3a';
  context.lineWidth = .35;
  context.lineJoin = 'round';
  context.beginPath();
  for (const { points, count } of landIslands) {
    for (let i = 0; i < count; i++) {
      if (i) context.lineTo(points[i * 2], points[i * 2 + 1]);
      else context.moveTo(points[0], points[1]);
    }
    context.closePath();
  }
  context.fill();
  context.stroke();
  // Island silhouettes drawn on top of the unexplored grey too, so every island's outline is visible from the start.
  mapShapeCanvas = document.createElement('canvas');
  mapShapeCanvas.width = mapColorCanvas.width;
  mapShapeCanvas.height = mapColorCanvas.height;
  const shape = mapShapeCanvas.getContext('2d');
  shape.setTransform(MAP_PIXELS_PER_UNIT, 0, 0, MAP_PIXELS_PER_UNIT, -WORLD_BOUNDS.minX * MAP_PIXELS_PER_UNIT, -WORLD_BOUNDS.minZ * MAP_PIXELS_PER_UNIT);
  shape.fillStyle = 'rgba(235,240,244,.3)';
  shape.strokeStyle = 'rgba(255,255,255,.85)';
  shape.lineWidth = .3;
  shape.lineJoin = 'round';
  shape.beginPath();
  for (const { points, count } of landIslands) {
    for (let i = 0; i < count; i++) {
      if (i) shape.lineTo(points[i * 2], points[i * 2 + 1]);
      else shape.moveTo(points[0], points[1]);
    }
    shape.closePath();
  }
  shape.fill();
  shape.stroke();
  // Remember which 4-unit samples are land, for the progress percentages.
  const data = context.getImageData(0, 0, mapColorCanvas.width, mapColorCanvas.height).data;
  mapLandSamples = [];
  for (let z = 2; z < mapUnitsHigh; z += 4) {
    for (let x = 2; x < mapUnitsWide; x += 4) {
      const index = ((Math.floor(z * MAP_PIXELS_PER_UNIT)) * mapColorCanvas.width + Math.floor(x * MAP_PIXELS_PER_UNIT)) * 4;
      mapLandSamples.push({ x, z, land: data[index] > 70 });
    }
  }
}

function drawWorldMap() {
  if (!mapColorCanvas) buildWorldMapBase();
  const width = mapColorCanvas.width, height = mapColorCanvas.height;
  if (worldMapCanvas.width !== width) { worldMapCanvas.width = width; worldMapCanvas.height = height; }
  const context = worldMapCanvas.getContext('2d');
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.imageSmoothingEnabled = true;
  context.drawImage(mapColorCanvas, 0, 0);
  context.drawImage(exploreCanvas, 0, 0, width, height);
  context.drawImage(mapShapeCanvas, 0, 0);

  const toX = (x) => (x - WORLD_BOUNDS.minX) * MAP_PIXELS_PER_UNIT, toY = (z) => (z - WORLD_BOUNDS.minZ) * MAP_PIXELS_PER_UNIT;
  context.lineWidth = 1.2;
  context.strokeStyle = 'rgba(255,255,255,.22)';
  context.fillStyle = 'rgba(255,255,255,.7)';
  context.font = '600 22px sans-serif';
  context.textAlign = 'left';
  for (let lon = 120; lon <= 155; lon += 5) {
    const x = toX(geoToWorld({ latitude: 30, longitude: lon }).x);
    if (x < 0 || x > width) continue;
    context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke();
    context.fillText(`${lon}°E`, x + 6, height - 10);
  }
  for (let lat = 20; lat <= 45; lat += 5) {
    const y = toY(geoToWorld({ latitude: lat, longitude: 121 }).y);
    if (y < 0 || y > height) continue;
    context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
    context.fillText(`${lat}°N`, 8, y - 6);
  }
  // Sea names, faint, so the chart reads as a map even where nothing is revealed yet.
  context.textAlign = 'center';
  context.font = 'italic 600 34px sans-serif';
  for (const anchor of seaMainAnchors) {
    context.fillStyle = 'rgba(255,255,255,.55)';
    context.fillText(anchor.name, toX(anchor.x), toY(anchor.z));
  }
  if(stampGuidanceEnabled){
    const guides=nearbyStampGuides(landmarkAccess,{x:boat.position.x,z:boat.position.z},kmPerWorldUnitAt(boat.position.z),isCountryUnlocked,hasStamp).slice(0,8);
    const nearest=guides[0];
    if(nearest){
      context.save();context.strokeStyle='#8feaff';context.lineWidth=4;context.setLineDash([12,10]);
      context.beginPath();context.moveTo(toX(boat.position.x),toY(boat.position.z));context.lineTo(toX(nearest.stop.x),toY(nearest.stop.z));context.stroke();context.restore();
    }
    const labels=[];
    guides.forEach(({t,stop,km},i)=>{
      const x=toX(stop.x),y=toY(stop.z);context.fillStyle='#8feaff';context.strokeStyle='#06213d';context.lineWidth=3;
      context.beginPath();context.arc(x,y,10,0,Math.PI*2);context.fill();context.stroke();
      if(i>=3)return;
      const bearing=stampBearing({x:boat.position.x,z:boat.position.z},stop,boat.rotation.y);
      const text=`⚑ ${t.name} · ${km.toFixed(0)} km · ${bearing.instruction}`;
      context.font='600 28px sans-serif';context.textAlign='left';
      const w=context.measureText(text).width+18,lx=Math.max(8,Math.min(width-w-8,x+18));let ly=Math.max(36,y);
      for(let n=0;n<8&&labels.some(b=>lx<b.x+b.w&&lx+w>b.x&&Math.abs(ly-b.y)<40);n++)ly+=42;
      if(ly>height-12)return;
      labels.push({x:lx,y:ly,w});context.fillStyle='#06213dee';context.fillRect(lx-5,ly-30,w,38);context.fillStyle='#c4f5ff';context.fillText(text,lx+4,ly);
    });
  }
  // The boat.
  const bx = toX(boat.position.x), by = toY(boat.position.z);
  context.save();
  context.translate(bx, by);
  context.rotate(Math.atan2(-Math.cos(boat.rotation.y), -Math.sin(boat.rotation.y)) + Math.PI / 2);
  context.fillStyle = '#ffb36b';
  context.strokeStyle = '#3a1a00';
  context.lineWidth = 3;
  context.beginPath(); context.moveTo(0, -20); context.lineTo(13, 14); context.lineTo(-13, 14); context.closePath();
  context.fill(); context.stroke();
  context.restore();

  // Progress.
  const alpha = exploreContext.getImageData(0, 0, exploreCanvas.width, exploreCanvas.height).data;
  let landTotal = 0, landSeen = 0, seaTotal = 0, seaSeen = 0;
  for (const sample of mapLandSamples) {
    const seen = alpha[((Math.floor(sample.z)) * exploreCanvas.width + Math.floor(sample.x)) * 4 + 3] < 128;
    if (sample.land) { landTotal++; if (seen) landSeen++; } else { seaTotal++; if (seen) seaSeen++; }
  }
  const pct = (a, b) => (b ? (a / b * 100) : 0).toFixed(1);
  worldMapStats.textContent = `陸地 ${pct(landSeen, landTotal)}%　·　海洋 ${pct(seaSeen, seaTotal)}%　·　整體 ${pct(landSeen + seaSeen, landTotal + seaTotal)}%`;
}

// --- Zoom / pan / click-to-navigate on the world map -------------------------
const worldMapView = document.querySelector('#world-map-view');
const worldMapTip = document.querySelector('#world-map-tip');
const mapView = { scale: 1, tx: 0, ty: 0, fit: 1 };
const MAP_MAX_ZOOM = 14;
function applyMapView() {
  const width = worldMapCanvas.width, height = worldMapCanvas.height;
  const box = worldMapView.getBoundingClientRect();
  // Keep the chart covering the viewport instead of drifting away from it.
  const shownW = width * mapView.scale, shownH = height * mapView.scale;
  mapView.tx = shownW <= box.width ? (box.width - shownW) / 2 : Math.min(0, Math.max(box.width - shownW, mapView.tx));
  mapView.ty = shownH <= box.height ? (box.height - shownH) / 2 : Math.min(0, Math.max(box.height - shownH, mapView.ty));
  worldMapCanvas.style.width = `${width}px`;
  worldMapCanvas.style.height = `${height}px`;
  worldMapCanvas.style.transform = `translate(${mapView.tx}px, ${mapView.ty}px) scale(${mapView.scale})`;
}
function fitMapView() {
  const box = worldMapView.getBoundingClientRect();
  mapView.fit = Math.min(box.width / worldMapCanvas.width, box.height / worldMapCanvas.height);
  mapView.scale = mapView.fit;
  mapView.tx = mapView.ty = 0;
  applyMapView();
}
function zoomMapAt(factor, clientX, clientY) {
  const box = worldMapView.getBoundingClientRect();
  const px = clientX - box.left, py = clientY - box.top;
  const next = Math.min(mapView.fit * MAP_MAX_ZOOM, Math.max(mapView.fit, mapView.scale * factor));
  const ratio = next / mapView.scale;
  mapView.tx = px - (px - mapView.tx) * ratio;
  mapView.ty = py - (py - mapView.ty) * ratio;
  mapView.scale = next;
  applyMapView();
}
function mapPointToWorld(clientX, clientY) {
  const box = worldMapView.getBoundingClientRect();
  const bitmapX = (clientX - box.left - mapView.tx) / mapView.scale, bitmapY = (clientY - box.top - mapView.ty) / mapView.scale;
  return { x: bitmapX / MAP_PIXELS_PER_UNIT + WORLD_BOUNDS.minX, z: bitmapY / MAP_PIXELS_PER_UNIT + WORLD_BOUNDS.minZ };
}
const MAP_CLICK_TYPES = new Set(['ADM1', 'ADM2', 'PPLC', 'PPLA', 'PPLA2', 'ISL', 'CAPE', 'LTHSE', 'HBR', 'PRT']);
let mapClickPlaces = null;
// The named place under the cursor (within ~16 screen px), else null so a click falls back to raw coordinates.
function mapPlaceNear(clientX, clientY) {
  if (!mapClickPlaces) {
    mapClickPlaces = [];
    for (const { country, places } of placeCountries) {
      for (const place of places) {
        if (!MAP_CLICK_TYPES.has(place.type)) continue;
        if (country === '台灣' && place.type === 'ADM1' && !/[縣市]$/.test(place.name)) continue;
        const world = geoToWorld({ latitude: place.lat, longitude: place.lon });
        mapClickPlaces.push({ country, place, x: world.x, z: world.y, weight: (PLACE_TYPE_WEIGHT[place.type] ?? 10) + Math.log10((place.pop ?? 0) + 1) * 4 });
      }
    }
  }
  const point = mapPointToWorld(clientX, clientY);
  const reach = 16 / (mapView.scale * MAP_PIXELS_PER_UNIT);   // world units covered by 16 screen px
  let best = null, bestScore = Infinity;
  for (const candidate of mapClickPlaces) {
    const d = Math.hypot(candidate.x - point.x, candidate.z - point.z);
    if (d > reach) continue;
    const score = d / reach * 60 - candidate.weight * .3;
    if (score < bestScore) { bestScore = score; best = candidate; }
  }
  return best;
}
let mapDrag = null;
worldMapView.addEventListener('wheel', (event) => {
  event.preventDefault();
  zoomMapAt(Math.exp(-event.deltaY * .0016), event.clientX, event.clientY);
}, { passive: false });
worldMapView.addEventListener('pointerdown', (event) => {
  if (event.target.closest('.world-map-zoom')) return;
  mapDrag = { x: event.clientX, y: event.clientY, tx: mapView.tx, ty: mapView.ty, moved: false };
  worldMapView.setPointerCapture(event.pointerId);
});
worldMapView.addEventListener('pointermove', (event) => {
  if (mapDrag) {
    const dx = event.clientX - mapDrag.x, dy = event.clientY - mapDrag.y;
    if (Math.hypot(dx, dy) > 4) { mapDrag.moved = true; worldMapView.classList.add('is-dragging'); worldMapTip.hidden = true; }
    if (mapDrag.moved) { mapView.tx = mapDrag.tx + dx; mapView.ty = mapDrag.ty + dy; applyMapView(); }
    return;
  }
  const near = mapPlaceNear(event.clientX, event.clientY);
  if (!near) { worldMapTip.hidden = true; return; }
  const box = worldMapView.getBoundingClientRect();
  worldMapTip.textContent = currentVehicleType()==='fighter'?`${near.country}-${near.place.name}　飛行觀光中`:`${near.country}-${near.place.name}　點擊導航`;
  worldMapTip.style.left = `${event.clientX - box.left + 14}px`;
  worldMapTip.style.top = `${event.clientY - box.top + 12}px`;
  worldMapTip.hidden = false;
});
worldMapView.addEventListener('pointerup', (event) => {
  const drag = mapDrag;
  mapDrag = null;
  worldMapView.classList.remove('is-dragging');
  if (!drag || drag.moved || event.target.closest('.world-map-zoom')) return;
  if(currentVehicleType()==='fighter')return;
  const near = mapPlaceNear(event.clientX, event.clientY);
  let query;
  if (near) query = `${near.country}-${near.place.name}`;
  else {
    const point = mapPointToWorld(event.clientX, event.clientY);
    const geo = worldToGeo(point.x, point.z);
    query = `@${geo.latitude.toFixed(4)},${geo.longitude.toFixed(4)}`;
  }
  setWorldMapOpen(false);
  runNavigation(query);
});
worldMapView.addEventListener('pointerleave', () => { worldMapTip.hidden = true; });
document.querySelector('#world-map-zoom-in').addEventListener('click', () => { const b = worldMapView.getBoundingClientRect(); zoomMapAt(1.6, b.left + b.width / 2, b.top + b.height / 2); });
document.querySelector('#world-map-zoom-out').addEventListener('click', () => { const b = worldMapView.getBoundingClientRect(); zoomMapAt(1 / 1.6, b.left + b.width / 2, b.top + b.height / 2); });
document.querySelector('#world-map-zoom-fit').addEventListener('click', fitMapView);
addEventListener('resize', () => { if (worldMapOpen) applyMapView(); });

export function setWorldMapOpen(open) {
  worldMapOpen = open;
  worldMapOverlay.hidden = !open;
  if (open) { drawWorldMap(); fitMapView(); }
}
worldMapOverlay.addEventListener('click', (event) => { if (event.target === worldMapOverlay) setWorldMapOpen(false); });
document.querySelector('#world-map-close')?.addEventListener('click', () => setWorldMapOpen(false));
let worldMapRedraw = 0;
export function updateWorldMap() {
  if (worldMapOpen && ++worldMapRedraw % (stampGuidanceEnabled?20:40) === 0) drawWorldMap();
}
