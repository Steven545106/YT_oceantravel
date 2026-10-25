import * as THREE from 'three';
import { geoToWorld } from './geo.js';
import { isOnLand, landIslandAt } from './land.js';
import { onPlacesAdded, placeCountries } from './places.js';
import { boat, camera } from './core.js';
import { cameraAnchor, topDownView } from './state.js';

// ---------------------------------------------------------------------------
// Map labels: names shown on the top-down chart (press V). Everything that wants
// a name on the map registers through addMapLabel().
// ---------------------------------------------------------------------------
const mapLabelLayer = document.querySelector('#map-labels');
// seas.js registers its lookup here (seas needs addMapLabel, labels need the sea name: this breaks the cycle)
export const labelHooks = { seaNameAt: () => null };
const mapLabels = [];
const MAP_LABEL_LIMIT = 220;
const labelMeasureContext = document.createElement('canvas').getContext('2d');

export function addMapLabel({ text, x, z, kind = 'island', priority = 10, maxHeight = Infinity, minHeight = 0, color = null }) {
  labelMeasureContext.font = kind === 'sea' ? '600 15px sans-serif' : '600 12px sans-serif';
  mapLabels.push({
    text, x, z, kind, priority, maxHeight, minHeight, color,
    halfWidth: labelMeasureContext.measureText(text).width / 2 + 6, halfHeight: kind === 'sea' ? 11 : 9, key: `${kind}:${text}`
  });
}

// Replace every label of one kind (e.g. 'teleport' points, which the player can move).
export function setMapMarkers(kind, markers) {
  for (let i = mapLabels.length - 1; i >= 0; i--) if (mapLabels[i].kind === kind) mapLabels.splice(i, 1);
  for (const marker of markers) addMapLabel({ ...marker, kind });
}

export function addMapLabelAtGeo(options, latitude, longitude) {
  const world = geoToWorld({ latitude, longitude });
  addMapLabel({ ...options, x: world.x, z: world.y });
}

const landIslandAreaKm2At = (x, z) => landIslandAt(x, z)?.areaKm2 ?? 0;

// Island, prefecture/county and city names straight from the place list.
const MAJOR_ISLANDS = new Set(['臺灣', '台灣', '本州', '九州', '北海道', '四国', '四國', '濟州島']);
const namedIslands = new Set();
function registerPlaceLabels(lists) {
  for (const { country, places } of lists) {
    for (const place of places) {
      if (place.type === 'ISL' || place.type === 'ISLS') {
        const world = geoToWorld({ latitude: place.lat, longitude: place.lon });
        const area = landIslandAreaKm2At(world.x, world.y);
        // Small islets, sandbars and places that merely sit inside a big landmass are not worth a name on the chart:
        // a landmass over 2000 km2 is named only if it is one of the big islands, and each island is named once.
        const island = landIslandAt(world.x, world.y);
        if (!island || area <= 3) continue;
        if (area > 2000 && !MAJOR_ISLANDS.has(place.name)) continue;
        if (namedIslands.has(island)) continue;
        namedIslands.add(island);
        const named = place.type === 'ISL';
        let maxHeight, priority;
        if (area > 20000) { maxHeight = Infinity; priority = 100; }
        else if (area > 2000) { maxHeight = 2200; priority = 90; }
        else if (area > 300) { maxHeight = 1100; priority = 75; }
        else if (area > 40) { maxHeight = 450; priority = 62; }
        else if (area > 3) { maxHeight = 220; priority = 50; }
        else { maxHeight = country === '台灣' ? 220 : 110; priority = 30; }
        if (country === '台灣' && area === 0) { maxHeight = 260; priority = 55; }
        if (!named && maxHeight > 110) maxHeight = 110;
        addMapLabel({ text: place.name, x: world.x, z: world.y, kind: 'island', priority, maxHeight });
      } else if (place.type === 'ADM1') {
        if (country === '台灣' && !/[縣市]$/.test(place.name)) continue;
        addMapLabelAtGeo({ text: place.name, kind: 'region', priority: 20, maxHeight: 1800, minHeight: 0 }, place.lat, place.lon);
      } else if ((place.type === 'PPLC' || place.type === 'PPLA') && (place.pop ?? 0) > 150000) {
        addMapLabelAtGeo({ text: place.name, kind: 'city', priority: 12, maxHeight: 160 }, place.lat, place.lon);
      }
    }
  }
}
registerPlaceLabels(placeCountries);
// a country's full place list arrives when its coast streams in; label the newly added places then
onPlacesAdded((entry, added) => registerPlaceLabels([{ country: entry.country, places: added }]));

const boatLabel = { text: '▲ 我的船', x: 0, z: 0, kind: 'boat', priority: 1000, maxHeight: Infinity, minHeight: 0, color: null, halfWidth: 34, halfHeight: 9, key: 'boat' };
mapLabels.push(boatLabel);

const labelPool = [];
const labelVector = new THREE.Vector3();
const placedBoxes = [];
const placedSeaNames = [];
const labelCandidates = [];
export function updateMapLabels(active, height) {
  mapLabelLayer.hidden = !active;
  if (!active) { if (seaBanner) seaBanner.hidden = true; return; }
  boatLabel.x = boat.position.x;
  boatLabel.z = boat.position.z;
  const width = innerWidth, heightPx = innerHeight;
  labelCandidates.length = 0;
  for (const label of mapLabels) {
    if (height > label.maxHeight || height < label.minHeight) continue;
    labelVector.set(label.x, 0.05, label.z).project(camera);
    if (labelVector.z > 1) continue;
    const sx = (labelVector.x * .5 + .5) * width, sy = (-labelVector.y * .5 + .5) * heightPx;
    if (sx < -60 || sx > width + 60 || sy < -30 || sy > heightPx + 30) continue;
    labelCandidates.push({ label, sx, sy });
  }
  labelCandidates.sort((a, b) => b.label.priority - a.label.priority);
  placedBoxes.length = 0;
  placedSeaNames.length = 0;
  let used = 0;
  for (const { label, sx, sy } of labelCandidates) {
    if (used >= MAP_LABEL_LIMIT) break;
    if (label.kind === 'sea' && placedSeaNames.some((other) => other.text === label.text && Math.hypot(other.sx - sx, other.sy - sy) < 380)) continue;
    const left = sx - label.halfWidth, right = sx + label.halfWidth, top = sy - label.halfHeight, bottom = sy + label.halfHeight;
    let clear = true;
    for (const box of placedBoxes) {
      if (left < box.right && right > box.left && top < box.bottom && bottom > box.top) { clear = false; break; }
    }
    if (!clear && label.kind !== 'boat') continue;
    placedBoxes.push({ left, right, top, bottom });
    if (label.kind === 'sea') placedSeaNames.push({ text: label.text, sx, sy });
    let element = labelPool[used];
    if (!element) {
      element = document.createElement('div');
      element.className = 'map-label';
      mapLabelLayer.append(element);
      labelPool.push(element);
    }
    if (element.dataset.key !== label.key) {
      element.dataset.key = label.key;
      element.textContent = label.text;
      element.className = `map-label map-label--${label.kind}`;
      element.style.color = label.color ?? '';
    }
    element.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -50%)`;
    element.hidden = false;
    used++;
  }
  for (let i = used; i < labelPool.length; i++) labelPool[i].hidden = true;
  updateSeaBanner();
}

// The sea under the middle of the chart, named across the top however far you zoom in.
const seaBanner = document.querySelector('#sea-banner');
let seaBannerFrame = 0;
function updateSeaBanner() {
  if (!seaBanner || ++seaBannerFrame % 8 !== 1) return;
  const x = cameraAnchor.x + topDownView.offsetX, z = cameraAnchor.z + topDownView.offsetZ;
  const name = labelHooks.seaNameAt(x, z);
  const text = name ? `海域 · ${name}` : (isOnLand(x, z) ? '陸地' : '');
  seaBanner.hidden = !text;
  if (seaBanner.textContent !== text) seaBanner.textContent = text;
}
