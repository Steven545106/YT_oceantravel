import {hasCustomCoastalTerrain} from './taiwan-coastal-data.js';
import { pointInIsland } from './land-geometry.js';
import { createTerrainMaterial } from './terrain-material.js';
import { quality } from './quality.js';
import * as THREE from 'three';
import { fetchGrayPixels, fetchJson, markLoaded } from './data-loader.js';
import { WORLD_UNITS_PER_KM, geoToWorld, worldToGeo, kmPerWorldUnitAt } from './geo.js';
import { boat, camera, reflectionExclusions, scene } from './core.js';
import { REGIONS, COUNTRIES, COUNTRY_LABELS, countryByCode, exaggerationAt } from './regions.js';
export { COUNTRY_LABELS };

// ---------------------------------------------------------------------------
// Land, streamed by region (see regions.js / Data/regions.json):
// - every island is always present as a simplified outline (coast/base.json); the full outline of the chunks near the
//   boat or jet replaces it in place, and goes back to the simplified one when they are far away again;
// - heights come from one coarse overview heightmap plus full-resolution tiles streamed the same way;
// - relief: every land block has a coarse mesh from the outlines and the overview; the detailed mesh is built once the
//   block is near and its full outlines and heightmap tiles have arrived, and dropped again when it is far.
// Collision, navigation and maps always read `landIslands`, which holds whichever outline each island has now.
// ---------------------------------------------------------------------------
const { coast: COAST, dem: DEM } = REGIONS;
const STREAM_RADIUS = 170;   // world units around the vehicle in which full-detail data is loaded…
const UNLOAD_RADIUS = 230;   // …and beyond which it is released again
const MAX_PARALLEL_LOADS = 4;

const baseCoast = await fetchJson(COAST.base);

function makeIsland(flat, scale, country, chunk) {
  const count = flat.length / 2;
  const points = new Float64Array(flat.length);
  let lonUnits = 0, latUnits = 0;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < count; i++) {
    lonUnits += flat[i * 2];
    latUnits += flat[i * 2 + 1];
    const world = geoToWorld({ latitude: latUnits / scale, longitude: lonUnits / scale });
    points[i * 2] = world.x;
    points[i * 2 + 1] = world.y;
    if (world.x < minX) minX = world.x;
    if (world.x > maxX) maxX = world.x;
    if (world.y < minZ) minZ = world.y;
    if (world.y > maxZ) maxZ = world.y;
  }
  let twiceArea = 0;
  for (let i = 0, j = count - 1; i < count; j = i++) {
    twiceArea += points[j * 2] * points[i * 2 + 1] - points[i * 2] * points[j * 2 + 1];
  }
  const kmPerUnit = kmPerWorldUnitAt((minZ + maxZ) / 2);
  return { country, chunk, points, count, minX, maxX, minZ, maxZ, areaKm2: Math.abs(twiceArea) / 2 * kmPerUnit * kmPerUnit };
}

const geoBoundsToWorld = ([lon0, lat0, lon1, lat1], pad = 0) => {
  const a = geoToWorld({ latitude: lat1, longitude: lon0 }), b = geoToWorld({ latitude: lat0, longitude: lon1 });
  return { minX: a.x - pad, maxX: b.x + pad, minZ: a.y - pad, maxZ: b.y + pad };
};
const boxDistance = (box, x, z) => Math.hypot(Math.max(box.minX - x, 0, x - box.maxX), Math.max(box.minZ - z, 0, z - box.maxZ));

// One slot per island: `landIslands[slot]` is its current outline (base or detail).
export const landIslands = [];
const slotBase = [];
const chunks = new Map();   // id -> { meta, box, slots, state: 'base' | 'loading' | 'detail' }
for (const meta of COAST.chunks) {
  const polys = baseCoast.chunks.find((entry) => entry.id === meta.id)?.polys ?? [];
  const chunk = { meta, box: geoBoundsToWorld(meta.bounds), slots: [], state: 'base' };
  for (const flat of polys) {
    const island = makeIsland(flat, baseCoast.scale, meta.country, meta.id);
    island.slot = landIslands.length;
    chunk.slots.push(island.slot);
    slotBase.push(island);
    landIslands.push(island);
  }
  chunks.set(meta.id, chunk);
}
// Bumped whenever an outline is swapped, so caches built from `landIslands` (e.g. the route planner) can tell.
export let landVersion = 0;

// Coarse bucket index so a point-in-land test only looks at nearby outlines.
const LAND_BUCKET_SIZE = 24;
const landBuckets = new Map();
function indexIsland(island, add) {
  for (let bx = Math.floor(island.minX / LAND_BUCKET_SIZE); bx <= Math.floor(island.maxX / LAND_BUCKET_SIZE); bx++) {
    for (let bz = Math.floor(island.minZ / LAND_BUCKET_SIZE); bz <= Math.floor(island.maxZ / LAND_BUCKET_SIZE); bz++) {
      const key = `${bx},${bz}`;
      if (add) {
        if (!landBuckets.has(key)) landBuckets.set(key, []);
        landBuckets.get(key).push(island);
      } else {
        const list = landBuckets.get(key);
        list?.splice(list.indexOf(island), 1);
      }
    }
  }
}
landIslands.forEach((island) => indexIsland(island, true));

export function landIslandAt(x, z) {
  const bucket = landBuckets.get(`${Math.floor(x / LAND_BUCKET_SIZE)},${Math.floor(z / LAND_BUCKET_SIZE)}`);
  if (!bucket) return null;
  for (const island of bucket) {
    if (x < island.minX || x > island.maxX || z < island.minZ || z > island.maxZ) continue;
    if (pointInIsland(island, x, z)) return island;
  }
  return null;
}

export const isOnLand = (x, z) => landIslandAt(x, z) !== null;

// Nearest shore in true kilometres, and which country it belongs to.
export function distanceToLand(x, z) {
  const here = landIslandAt(x, z);
  if (here) return { km: 0, country: here.country };
  let bestSquared = Infinity, bestCountry = COUNTRIES[0].code;
  for (const island of landIslands) {
    const boxDx = Math.max(island.minX - x, 0, x - island.maxX);
    const boxDz = Math.max(island.minZ - z, 0, z - island.maxZ);
    if (boxDx * boxDx + boxDz * boxDz >= bestSquared) continue;
    const { points, count } = island;
    for (let i = 0; i < count; i++) {
      const next = i + 1 === count ? 0 : i + 1;
      const ax = points[i * 2], az = points[i * 2 + 1];
      const dx = points[next * 2] - ax, dz = points[next * 2 + 1] - az;
      const lengthSquared = dx * dx + dz * dz;
      const t = lengthSquared > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / lengthSquared)) : 0;
      const ex = x - (ax + dx * t), ez = z - (az + dz * t);
      const d = ex * ex + ez * ez;
      if (d < bestSquared) { bestSquared = d; bestCountry = island.country; }
    }
  }
  return { km: Math.sqrt(bestSquared) * kmPerWorldUnitAt(z), country: bestCountry };
}

// Listeners hear { kind: 'coast' | 'dem', box } whenever detail arrives or leaves, e.g. to lift sights onto new heights.
const landListeners = [];
export const onLandChange = (listener) => { landListeners.push(listener); };
const emitLandChange = (kind, box) => { for (const listener of landListeners) listener({ kind, box }); };

// --- Elevation -------------------------------------------------------------
// Heightmaps store sqrt(elevation / maxMeters) in one 8-bit channel.
const withBounds = (entry) => {
  const [lonMin, latMin, lonMax, latMax] = entry.bounds;
  return { ...entry, lonMin, latMin, lonMax, latMax, box: geoBoundsToWorld(entry.bounds), pixels: null, state: 'idle' };
};
const overviewDem = withBounds(DEM.overview);
const demTiles = DEM.tiles.map(withBounds);
// 1° buckets of tiles, for the per-sample lookup
const tileBuckets = new Map();
for (const tile of demTiles) {
  for (let lon = Math.floor(tile.lonMin); lon <= Math.floor(tile.lonMax); lon++) {
    for (let lat = Math.floor(tile.latMin); lat <= Math.floor(tile.latMax); lat++) {
      const key = `${lon},${lat}`;
      if (!tileBuckets.has(key)) tileBuckets.set(key, []);
      tileBuckets.get(key).push(tile);
    }
  }
}

async function loadDemPixels(dem) {
  dem.pixels = (await fetchGrayPixels(dem.file)).pixels;
  return dem;
}

function demMeters(dem, latitude, longitude) {
  const { lonMin, lonMax, latMin, latMax, width, height, pixels } = dem;
  const u = (longitude - lonMin) / (lonMax - lonMin) * (width - 1);
  const v = (latMax - latitude) / (latMax - latMin) * (height - 1);
  if (u < 0 || v < 0 || u > width - 1 || v > height - 1) return 0;
  const x0 = Math.floor(u), y0 = Math.floor(v);
  const x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1);
  const fx = u - x0, fy = v - y0;
  const value = (pixels[y0 * width + x0] * (1 - fx) + pixels[y0 * width + x1] * fx) * (1 - fy)
    + (pixels[y1 * width + x0] * (1 - fx) + pixels[y1 * width + x1] * fx) * fy;
  const normalised = value / 255;
  return normalised * normalised * DEM.maxMeters;
}

const overviewMeters = (latitude, longitude) => overviewDem.pixels ? demMeters(overviewDem, latitude, longitude) : 0;
// Full-resolution tile when one is loaded here, otherwise the overview.
function elevationMetersAt(latitude, longitude) {
  const bucket = tileBuckets.get(`${Math.floor(longitude)},${Math.floor(latitude)}`);
  if (bucket) {
    for (const tile of bucket) {
      if (tile.pixels && longitude >= tile.lonMin && longitude <= tile.lonMax && latitude >= tile.latMin && latitude <= tile.latMax) {
        return demMeters(tile, latitude, longitude);
      }
    }
  }
  return overviewMeters(latitude, longitude);
}

try { await loadDemPixels(overviewDem); } catch (error) { console.error('無法載入總覽地形高度圖，遠處改用平坦地形', error); }
markLoaded('dem:overview');

const SURFACE_BASE_HEIGHT = .05;   // even sea-level ground (beaches, capes, reclaimed harbour land) stands clear of the water
const BASE_EXAGGERATION = REGIONS.exaggeration.default;
const surfaceHeightFromMeters = (meters, latitude, longitude) => SURFACE_BASE_HEIGHT + (meters / 1000) * WORLD_UNITS_PER_KM * exaggerationAt(latitude, longitude);
export function terrainHeightAt(x, z) {
  const { latitude, longitude } = worldToGeo(x, z);
  return surfaceHeightFromMeters(elevationMetersAt(latitude, longitude), latitude, longitude);
}

// --- Streaming -------------------------------------------------------------
let activeLoads = 0;
const loadQueue = [];
const waiters = [];
function settleWaiters() {
  if (activeLoads || loadQueue.length) return;
  for (const resolve of waiters.splice(0)) resolve();
}
function pumpLoads() {
  while (activeLoads < MAX_PARALLEL_LOADS && loadQueue.length) {
    const job = loadQueue.shift();
    activeLoads++;
    job().catch((error) => console.error(error)).finally(() => { activeLoads--; pumpLoads(); settleWaiters(); });
  }
  settleWaiters();
}

function swapChunk(chunk, polys) {
  for (let i = 0; i < chunk.slots.length; i++) {
    const slot = chunk.slots[i];
    const next = polys ? makeIsland(polys[i], COAST.scale, chunk.meta.country, chunk.meta.id) : slotBase[slot];
    next.slot = slot;
    indexIsland(landIslands[slot], false);
    landIslands[slot] = next;
    indexIsland(next, true);
  }
  landVersion++;
  emitLandChange('coast', chunk.box);
}

function loadChunk(chunk) {
  chunk.state = 'loading';
  loadQueue.push(async () => {
    try {
      const data = await fetchJson(chunk.meta.file);
      if (chunk.state !== 'loading') return;   // released while it was downloading
      if (data.polys.length !== chunk.slots.length) throw new Error(`海岸線區塊 ${chunk.meta.id} 與總覽不一致`);
      chunk.state = 'detail';
      swapChunk(chunk, data.polys);
    } catch (error) {
      chunk.state = 'base';   // keep the simplified outline; the next pass tries again
      throw error;
    }
  });
}

function unloadChunk(chunk) {
  const wasDetail = chunk.state === 'detail';
  chunk.state = 'base';
  if (wasDetail) swapChunk(chunk, null);
}

function loadTile(tile) {
  tile.state = 'loading';
  loadQueue.push(async () => {
    try {
      await loadDemPixels(tile);
      if (tile.state !== 'loading') { tile.pixels = null; return; }
      tile.state = 'loaded';
      emitLandChange('dem', tile.box);
    } catch (error) {
      tile.state = 'idle';
      throw error;
    }
  });
}

function unloadTile(tile) {
  const wasLoaded = tile.state === 'loaded';
  tile.state = 'idle';
  tile.pixels = null;
  if (wasLoaded) emitLandChange('dem', tile.box);
}

let streamX = Infinity, streamZ = Infinity;
// Called every frame with the vehicle's position; does real work only after it has moved a little.
export function updateLandStreaming(x, z, force = false) {
  if (!force && Math.hypot(x - streamX, z - streamZ) < 4) return;
  streamX = x; streamZ = z;
  const wanted = [];
  for (const chunk of chunks.values()) {
    const distance = boxDistance(chunk.box, x, z);
    if (distance < STREAM_RADIUS && chunk.state === 'base') wanted.push({ distance, load: () => loadChunk(chunk) });
    else if (distance > UNLOAD_RADIUS && chunk.state !== 'base') unloadChunk(chunk);
  }
  for (const tile of demTiles) {
    const distance = boxDistance(tile.box, x, z);
    if (distance < STREAM_RADIUS && tile.state === 'idle') wanted.push({ distance, load: () => loadTile(tile) });
    else if (distance > UNLOAD_RADIUS && tile.state !== 'idle') unloadTile(tile);
  }
  wanted.sort((a, b) => a.distance - b.distance).forEach(({ load }) => load());
  pumpLoads();
}

// Load everything near a position and resolve once it has all arrived (used before placing sights at start-up).
export function streamLandAround(x, z) {
  updateLandStreaming(x, z, true);
  return new Promise((resolve) => { waiters.push(resolve); settleWaiters(); }).then(() => markLoaded('land:nearby'));
}

const terrainColorLookup = (() => {
  const stops = [[.08, 0x7ca66d], [.42, 0x315f36], [.92, 0x64775a], [1.36, 0xa7aa99]];
  const table = [];
  for (let i = 0; i < 256; i++) {
    const height = i / 255 * 1.36;
    let color;
    if (height <= stops[0][0]) color = new THREE.Color(stops[0][1]);
    else {
      const upper = Math.max(1, stops.findIndex(([altitude]) => height <= altitude));
      const [lowAltitude, lowColor] = stops[upper - 1];
      const [highAltitude, highColor] = stops[upper];
      color = new THREE.Color(lowColor).lerp(new THREE.Color(highColor), THREE.MathUtils.smoothstep(height, lowAltitude, highAltitude));
    }
    table.push(color);
  }
  return table;
})();
const terrainColorForHeight = (height) => terrainColorLookup[THREE.MathUtils.clamp(Math.round(height / 1.36 * 255), 0, 255)];

// --- Relief meshes ---------------------------------------------------------
// Land is cut into square blocks per country (block size = relief step × RELIEF_CELLS). A block's land/sea mask is
// rasterised from the outlines with a 1-cell margin so neighbouring blocks agree on coastlines and shading normals.
const landGroup = new THREE.Group();
scene.add(landGroup);
reflectionExclusions.push(landGroup);
const reliefMaterial = createTerrainMaterial();
// Corners just outside the coastline sit only a little below the water, so the shore slope crosses sea level close to
// the real coastline instead of halfway back up the land cell (which used to drown thin capes and low points).
const SEA_FLOOR_HEIGHT = -.012;
// the coarse far-away meshes have cells four times as wide, so their sea corners drop deeper to keep the shore from creeping out
const COARSE_SEA_FLOOR_HEIGHT = -.07;
const RELIEF_CELLS = 192, COARSE_FACTOR = 4;
export const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

let reliefMaskCanvas = null;
// One relief mesh for a block at lattice spacing `step` (`cells` per side), sampling heights with `metersAt`.
function buildReliefMesh(block, step, cells, islands, { seaFloor, strokeWidth, metersAt }) {
  const size = cells + 3;
  if (!reliefMaskCanvas || reliefMaskCanvas.width !== size) {
    reliefMaskCanvas = document.createElement('canvas');
    reliefMaskCanvas.width = reliefMaskCanvas.height = size;
  }
  const context = reliefMaskCanvas.getContext('2d', { willReadFrequently: true });
  const gi0 = block.bx * cells, gj0 = block.bz * cells;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, size, size);
  context.setTransform(1 / step, 0, 0, 1 / step, .5 - (gi0 - 1), .5 - (gj0 - 1));
  context.fillStyle = '#fff';
  context.strokeStyle = '#fff';
  context.lineWidth = step * strokeWidth;
  context.lineJoin = 'round';
  context.beginPath();
  for (const { points, count } of islands) {
    for (let i = 0; i < count; i++) {
      if (i) context.lineTo(points[i * 2], points[i * 2 + 1]);
      else context.moveTo(points[0], points[1]);
    }
    context.closePath();
  }
  context.fill();
  context.stroke();
  const alpha = context.getImageData(0, 0, size, size).data;
  const land = new Uint8Array(size * size);
  let anyLand = false;
  for (let i = 0; i < land.length; i++) {
    if (alpha[i * 4 + 3] >= 128) { land[i] = 1; anyLand = true; }
  }
  if (!anyLand) return null;

  // Surface heights over the whole padded lattice (needed for shading normals).
  const surface = new Float32Array(size * size);
  const longitudes = new Float64Array(size), latitudes = new Float64Array(size);
  for (let k = 0; k < size; k++) {
    longitudes[k] = worldToGeo((gi0 - 1 + k) * step, 0).longitude;
    latitudes[k] = worldToGeo(0, (gj0 - 1 + k) * step).latitude;
  }
  for (let lj = 0; lj < size; lj++) {
    for (let li = 0; li < size; li++) {
      surface[lj * size + li] = surfaceHeightFromMeters(metersAt(latitudes[lj], longitudes[li]), latitudes[lj], longitudes[li]);
    }
  }

  const corners = cells + 1;
  const flags = new Uint8Array(corners * corners);
  for (let cj = 0; cj < corners; cj++) for (let ci = 0; ci < corners; ci++) flags[cj * corners + ci] = land[(cj + 1) * size + ci + 1];
  const used = new Int32Array(corners * corners).fill(-1);
  let vertexCount = 0, cellCount = 0;
  const keep = (ci, cj) => flags[cj * corners + ci] || flags[cj * corners + ci + 1] || flags[(cj + 1) * corners + ci] || flags[(cj + 1) * corners + ci + 1];
  const useCorner = (ci, cj) => {
    const k = cj * corners + ci;
    if (used[k] === -1) used[k] = vertexCount++;
  };
  for (let cj = 0; cj < cells; cj++) {
    for (let ci = 0; ci < cells; ci++) {
      if (!keep(ci, cj)) continue;
      useCorner(ci, cj); useCorner(ci + 1, cj); useCorner(ci, cj + 1); useCorner(ci + 1, cj + 1);
      cellCount++;
    }
  }
  if (!cellCount) return null;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const coastWeights = new Float32Array(vertexCount);
  for (let cj = 0; cj < corners; cj++) {
    for (let ci = 0; ci < corners; ci++) {
      const id = used[cj * corners + ci];
      if (id === -1) continue;
      const li = ci + 1, lj = cj + 1, at = lj * size + li;
      const height = surface[at];
      let shore = !flags[cj * corners + ci];
      for (let dz = -2; dz <= 2 && !shore; dz++) for (let dx = -2; dx <= 2; dx++) {
        const px = li + dx, pz = lj + dz;
        if (px >= 0 && pz >= 0 && px < size && pz < size && !land[pz * size + px]) shore = true;
      }
      coastWeights[id] = shore ? 1 : 0;
      positions[id * 3] = (gi0 + ci) * step;
      positions[id * 3 + 1] = flags[cj * corners + ci] ? height : seaFloor;
      positions[id * 3 + 2] = (gj0 + cj) * step;
      const nx = -(surface[at + 1] - surface[at - 1]) / (2 * step);
      const nz = -(surface[at + size] - surface[at - size]) / (2 * step);
      const inverse = 1 / Math.hypot(nx, 1, nz);
      normals[id * 3] = nx * inverse; normals[id * 3 + 1] = inverse; normals[id * 3 + 2] = nz * inverse;
      const color = terrainColorForHeight(height * BASE_EXAGGERATION / exaggerationAt(latitudes[lj], longitudes[li]));
      colors[id * 3] = color.r; colors[id * 3 + 1] = color.g; colors[id * 3 + 2] = color.b;
    }
  }
  const indices = new (vertexCount > 65535 ? Uint32Array : Uint16Array)(cellCount * 6);
  let cursor = 0;
  for (let cj = 0; cj < cells; cj++) {
    for (let ci = 0; ci < cells; ci++) {
      if (!keep(ci, cj)) continue;
      const a = used[cj * corners + ci], b = used[cj * corners + ci + 1], c = used[(cj + 1) * corners + ci + 1], d = used[(cj + 1) * corners + ci];
      indices[cursor++] = a; indices[cursor++] = c; indices[cursor++] = b;
      indices[cursor++] = a; indices[cursor++] = d; indices[cursor++] = c;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('coastWeight', new THREE.BufferAttribute(coastWeights, 1));
  const mesh = new THREE.Mesh(geometry, reliefMaterial); mesh.receiveShadow = true; return mesh;
}

// Islets too small for a grid cell are triangulated directly; `maxEdge` sets how finely they follow the heights.
function buildSmallIslandMesh(islands, maxEdge) {
  const positions = [], colors = [], indices = [];
  for (const { points, count } of islands) {
    const contour = [];
    for (let i = 0; i < count; i++) contour.push(new THREE.Vector2(points[i * 2], points[i * 2 + 1]));
    const faces = THREE.ShapeUtils.triangulateShape(contour, []);
    if (!faces.length) continue;
    const addTriangle = (a, b, c, depth) => {
      const longest = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
      if (depth < 5 && longest > maxEdge) {
        const ab = a.clone().lerp(b, .5), bc = b.clone().lerp(c, .5), ca = c.clone().lerp(a, .5);
        addTriangle(a, ab, ca, depth + 1); addTriangle(ab, b, bc, depth + 1);
        addTriangle(ca, bc, c, depth + 1); addTriangle(ab, bc, ca, depth + 1); return;
      }
      const base = positions.length / 3;
      for (const point of [a, b, c]) {
        const height = terrainHeightAt(point.x, point.y) - .01;
        positions.push(point.x, height, point.y);
        const geo = worldToGeo(point.x, point.y);
        const colour = terrainColorForHeight(height * BASE_EXAGGERATION / exaggerationAt(geo.latitude, geo.longitude));
        colors.push(colour.r, colour.g, colour.b);
      }
      indices.push(base, base + 1, base + 2);
    };
    for (const [a, b, c] of faces) addTriangle(contour[a], contour[b], contour[c], 0);
  }
  if (!indices.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('coastWeight', new THREE.Float32BufferAttribute(new Float32Array(positions.length / 3).fill(1), 1));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, reliefMaterial); mesh.receiveShadow = true; return mesh;
}

// Relief blocks, assigned from the simplified outlines (padded by the simplification tolerance, so the full outline
// still falls inside its blocks). A block knows which coast chunks and heightmap tiles its detailed mesh needs.
const reliefBlocks = [];
{
  const blocks = new Map();
  const pad = COAST.tolerance;
  for (const island of slotBase) {
    const step = countryByCode(island.country)?.reliefStep ?? .2;
    const span = step * RELIEF_CELLS;
    const blockOf = (bx, bz) => {
      const key = `${island.country}:${bx},${bz}`;
      if (!blocks.has(key)) blocks.set(key, { bx, bz, step, span, grid: [], small: [], chunks: new Set() });
      return blocks.get(key);
    };
    // Guishan Island keeps its geographic coast for collisions; its relief comes from the dedicated coastal model.
    if (hasCustomCoastalTerrain(island)) continue;
    if (island.areaKm2 >= 6 * (step * 4) ** 2) {
      for (let bx = Math.floor((island.minX - pad) / span); bx <= Math.floor((island.maxX + pad) / span); bx++) {
        for (let bz = Math.floor((island.minZ - pad) / span); bz <= Math.floor((island.maxZ + pad) / span); bz++) {
          const block = blockOf(bx, bz);
          block.grid.push(island.slot);
          block.chunks.add(island.chunk);
        }
      }
    } else {
      const block = blockOf(Math.floor((island.minX + island.maxX) / 2 / span), Math.floor((island.minZ + island.maxZ) / 2 / span));
      block.small.push(island.slot);
      block.chunks.add(island.chunk);
    }
  }
  for (const block of blocks.values()) {
    const box = { minX: block.bx * block.span, maxX: (block.bx + 1) * block.span, minZ: block.bz * block.span, maxZ: (block.bz + 1) * block.span };
    block.box = box;
    block.x = (box.minX + box.maxX) / 2;
    block.z = (box.minZ + box.maxZ) / 2;
    block.switchDistance = block.span * 3.5;
    block.chunks = [...block.chunks].map((id) => chunks.get(id));
    block.tiles = demTiles.filter((tile) => tile.box.minX < box.maxX + block.step && tile.box.maxX > box.minX - block.step && tile.box.minZ < box.maxZ + block.step && tile.box.maxZ > box.minZ - block.step);
    block.coarse = [];
    block.fine = null;
    reliefBlocks.push(block);
  }
}
const isDetailReady = (block) => block.chunks.every((chunk) => chunk.state === 'detail') && block.tiles.every((tile) => tile.state === 'loaded');
const disposeMeshes = (meshes) => { for (const mesh of meshes) { landGroup.remove(mesh); mesh.geometry.dispose(); } };

function buildFine(block) {
  const islands = (slots) => slots.map((slot) => landIslands[slot]);
  const meshes = [];
  const grid = block.grid.length && buildReliefMesh(block, block.step, RELIEF_CELLS, islands(block.grid), { seaFloor: SEA_FLOOR_HEIGHT, strokeWidth: .8, metersAt: elevationMetersAt });
  if (grid) meshes.push(grid);
  const small = block.small.length && buildSmallIslandMesh(islands(block.small), .14);
  if (small) meshes.push(small);
  return meshes;
}

function buildCoarse(block) {
  const meshes = [];
  const grid = block.grid.length && buildReliefMesh(block, block.step * COARSE_FACTOR, RELIEF_CELLS / COARSE_FACTOR, block.grid.map((slot) => slotBase[slot]),
    { seaFloor: COARSE_SEA_FLOOR_HEIGHT, strokeWidth: 2, metersAt: overviewMeters });
  if (grid) meshes.push(grid);
  const small = block.small.length && buildSmallIslandMesh(block.small.map((slot) => slotBase[slot]), block.step * COARSE_FACTOR);
  if (small) meshes.push(small);
  return meshes;
}

// Coarse meshes for all land, nearest first; awaited once at start-up.
export async function buildCoarseRelief() {
  const pending = [...reliefBlocks].sort((a, b) => Math.hypot(a.x - boat.position.x, a.z - boat.position.z) - Math.hypot(b.x - boat.position.x, b.z - boat.position.z));
  let frameStart = performance.now();
  for (const block of pending) {
    block.coarse = buildCoarse(block);
    for (const mesh of block.coarse) { mesh.visible = !block.fine; landGroup.add(mesh); }
    if (performance.now() - frameStart > 9) {
      await nextFrame();
      frameStart = performance.now();
    }
  }
}

// Detailed meshes: built nearest-first within a frame budget so streaming never stalls the game for long.
const fineQueue = new Set();
let fineBuilding = false;
async function buildQueuedFine() {
  fineBuilding = true;
  let frameStart = performance.now();
  while (fineQueue.size) {
    let next = null, nearest = Infinity;
    for (const block of fineQueue) {
      const distance = Math.hypot(block.x - camera.position.x, block.z - camera.position.z);
      if (distance < nearest) { nearest = distance; next = block; }
    }
    fineQueue.delete(next);
    if (!next.fine && isDetailReady(next)) {
      next.fine = buildFine(next);
      for (const mesh of next.fine) { mesh.visible = false; landGroup.add(mesh); }
    }
    if (performance.now() - frameStart > 6) {
      await nextFrame();
      frameStart = performance.now();
    }
  }
  fineBuilding = false;
}

// Releasing detail data drops the detailed meshes built from it.
onLandChange(({ box }) => {
  for (const block of reliefBlocks) {
    if (!block.fine || isDetailReady(block)) continue;
    if (block.box.maxX < box.minX || block.box.minX > box.maxX || block.box.maxZ < box.minZ || block.box.minZ > box.maxZ) continue;
    disposeMeshes(block.fine);
    block.fine = null;
  }
});

// Show each block's detailed or coarse mesh by its distance to the camera; queue detailed meshes that are due.
export function updateLandDetail() {
  for (const block of reliefBlocks) {
    const distance = Math.hypot(block.x - camera.position.x, camera.position.y, block.z - camera.position.z);
    const limit = block.switchDistance * quality.detail;
    const near = distance < limit;
    if (near && !block.fine && !fineQueue.has(block) && isDetailReady(block)) fineQueue.add(block);
    // drop detailed meshes only when far sideways, so zooming the chart out and in does not rebuild them
    else if (block.fine && Math.hypot(block.x - camera.position.x, block.z - camera.position.z) > limit * 2) { disposeMeshes(block.fine); block.fine = null; }
    const showFine = near && !!block.fine;
    if (block.fine) for (const mesh of block.fine) mesh.visible = showFine;
    for (const mesh of block.coarse) mesh.visible = !showFine;
  }
  if (fineQueue.size && !fineBuilding) buildQueuedFine();
}
