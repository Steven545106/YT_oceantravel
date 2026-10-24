import {hasCustomCoastalTerrain} from './taiwan-coastal-data.js';
import { pointInIsland } from './land-geometry.js';
import { createTerrainMaterial } from './terrain-material.js';
import { quality } from './quality.js';
import * as THREE from 'three';
import { fetchGrayPixels, fetchJson, markLoaded } from './data-loader.js';
import { WORLD_MAX_X, WORLD_MIN_X, WORLD_UNITS_PER_KM, WORLD_WIDTH, geoToWorld, worldToGeo, kmPerWorldUnitAt } from './geo.js';
import { boat, camera, reflectionExclusions, scene } from './core.js';
import { REGIONS, COUNTRIES, COUNTRY_NAMES, countryByCode, exaggerationAt } from './regions.js';
export { COUNTRY_NAMES };

// ---------------------------------------------------------------------------
// Land, streamed by region (see regions.js / Data/regions.json):
// - an always-loaded outline layer (coast/outline.json) holds the larger islands, simplified to about 1.6 km; near the
//   boat or jet each chunk's full-detail outlines (including the small islets) replace its outline islands, and the
//   outline islands come back when it is far again. Chunks are cut at a 2° grid, so a continent streams in pieces;
//   cut pieces carry `cut` (their straight edges are not coast);
// - heights come from one coarse overview heightmap plus full-resolution tiles streamed the same way;
// - relief: land blocks within COARSE_RADIUS get a coarse mesh from the outline layer and the overview; the detailed
//   mesh is built once a block is near and its full outlines and heightmap tiles have arrived. Both are released again
//   when far, so only land around the camera is ever meshed.
// Collision, navigation and maps always read `landIslands`, the islands each chunk has now.
// ---------------------------------------------------------------------------
const { coast: COAST, dem: DEM } = REGIONS;
const STREAM_RADIUS = 170;   // world units around the vehicle in which full-detail data is loaded…
const UNLOAD_RADIUS = 230;   // …and beyond which it is released again
const COARSE_RADIUS = 1500, COARSE_RELEASE = 1800;   // coarse relief around the camera
const MAX_PARALLEL_LOADS = 4;

const outlineCoast = await fetchJson(COAST.outline);

function makeIsland(flat, scale, country, chunk, cut = false, shift = 0) {
  const count = flat.length / 2;
  const points = new Float64Array(flat.length);
  let lonUnits = 0, latUnits = 0;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < count; i++) {
    lonUnits += flat[i * 2];
    latUnits += flat[i * 2 + 1];
    const world = geoToWorld({ latitude: latUnits / scale, longitude: lonUnits / scale });
    world.x += shift;
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
  return { country, chunk, cut, points, count, minX, maxX, minZ, maxZ, areaKm2: Math.abs(twiceArea) / 2 * kmPerUnit * kmPerUnit };
}
const makeIslands = (data, chunk) => {
  const cut = new Set(data.cut ?? []);
  return data.polys.map((flat, i) => makeIsland(flat, data.scale ?? COAST.scale, chunk.meta.country, chunk.meta.id, cut.has(i), chunk.shift));
};

const geoBoundsToWorld = ([lon0, lat0, lon1, lat1], pad = 0) => {
  const a = geoToWorld({ latitude: lat1, longitude: lon0 }), b = geoToWorld({ latitude: lat0, longitude: lon1 });
  return { minX: a.x - pad, maxX: a.x + (b.x - a.x + WORLD_WIDTH) % WORLD_WIDTH + pad, minZ: a.y - pad, maxZ: b.y + pad };
};
const shiftedBox = (box, dx) => ({ ...box, minX: box.minX + dx, maxX: box.maxX + dx });
// Land (and heightmaps) within the ghost margin of the seam get a copy one world width over, so the far side is there
// before the vehicle wraps round (see geo.js).
const GHOST = REGIONS.world?.ghostUnits ?? 0;
const ghostShifts = (box) => [box.minX < WORLD_MIN_X + GHOST ? WORLD_WIDTH : null, box.maxX > WORLD_MAX_X - GHOST ? -WORLD_WIDTH : null].filter((shift) => shift !== null);
const boxDistance = (box, x, z) => Math.hypot(Math.max(box.minX - x, 0, x - box.maxX), Math.max(box.minZ - z, 0, z - box.maxZ));
const boxesOverlap = (a, b) => a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;

export const landIslands = [];
const chunks = new Map();   // id -> { meta, box, outline, current, state: 'outline' | 'loading' | 'detail' }
const outlineById = new Map(outlineCoast.chunks.map((entry) => [entry.id, entry]));
for (const meta of COAST.chunks) {
  const box = geoBoundsToWorld(meta.bounds);
  for (const shift of [0, ...ghostShifts(box)]) {
    const chunk = { meta, shift, box: shiftedBox(box, shift), state: 'outline' };
    chunk.outline = makeIslands({ scale: outlineCoast.scale, polys: [], ...outlineById.get(meta.id) }, chunk);
    chunk.current = chunk.outline;
    landIslands.push(...chunk.outline);
    chunks.set(shift ? `${meta.id}~${Math.sign(shift)}` : meta.id, chunk);
  }
}
// chunks by 100-unit cells of their bounds, to find the ones under a relief block quickly
const CHUNK_CELL = 100;
const chunkCells = new Map();
for (const chunk of chunks.values()) {
  for (let cx = Math.floor(chunk.box.minX / CHUNK_CELL); cx <= Math.floor(chunk.box.maxX / CHUNK_CELL); cx++) {
    for (let cz = Math.floor(chunk.box.minZ / CHUNK_CELL); cz <= Math.floor(chunk.box.maxZ / CHUNK_CELL); cz++) {
      const key = `${cx},${cz}`;
      if (!chunkCells.has(key)) chunkCells.set(key, []);
      chunkCells.get(key).push(chunk);
    }
  }
}
function chunksInBox(box) {
  const found = new Set();
  for (let cx = Math.floor(box.minX / CHUNK_CELL); cx <= Math.floor(box.maxX / CHUNK_CELL); cx++) {
    for (let cz = Math.floor(box.minZ / CHUNK_CELL); cz <= Math.floor(box.maxZ / CHUNK_CELL); cz++) {
      for (const chunk of chunkCells.get(`${cx},${cz}`) ?? []) if (boxesOverlap(chunk.box, box)) found.add(chunk);
    }
  }
  return [...found];
}
// Bumped whenever outlines are swapped, so caches built from `landIslands` (e.g. the route planner) can tell.
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
// islands overlapping a world box, from the given bucket index (the live one, or the outline layer's)
function islandsInBox(buckets, box) {
  const found = new Set();
  for (let bx = Math.floor(box.minX / LAND_BUCKET_SIZE); bx <= Math.floor(box.maxX / LAND_BUCKET_SIZE); bx++) {
    for (let bz = Math.floor(box.minZ / LAND_BUCKET_SIZE); bz <= Math.floor(box.maxZ / LAND_BUCKET_SIZE); bz++) {
      for (const island of buckets.get(`${bx},${bz}`) ?? []) if (boxesOverlap(island, box)) found.add(island);
    }
  }
  return [...found];
}
const outlineBuckets = new Map();
for (const chunk of chunks.values()) {
  for (const island of chunk.outline) {
    for (let bx = Math.floor(island.minX / LAND_BUCKET_SIZE); bx <= Math.floor(island.maxX / LAND_BUCKET_SIZE); bx++) {
      for (let bz = Math.floor(island.minZ / LAND_BUCKET_SIZE); bz <= Math.floor(island.maxZ / LAND_BUCKET_SIZE); bz++) {
        const key = `${bx},${bz}`;
        if (!outlineBuckets.has(key)) outlineBuckets.set(key, []);
        outlineBuckets.get(key).push(island);
      }
    }
  }
}

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

// Listeners hear { kind: 'coast' | 'dem', box, country } whenever detail arrives or leaves, e.g. to lift sights onto new heights.
const landListeners = [];
export const onLandChange = (listener) => { landListeners.push(listener); };
const emitLandChange = (kind, box, country = null) => { for (const listener of landListeners) listener({ kind, box, country }); };

// --- Elevation -------------------------------------------------------------
// Heightmaps store sqrt(elevation / maxMeters) in one 8-bit channel.
const withBounds = (entry) => {
  const [lonMin, latMin, lonMax, latMax] = entry.bounds;
  return { ...entry, lonMin, latMin, lonMax, latMax, box: geoBoundsToWorld(entry.bounds), pixels: null, state: 'idle' };
};
const overviewDem = withBounds(DEM.overview);
const demTiles = DEM.tiles.flatMap((entry) => {
  const tile = withBounds(entry);
  return [tile, ...ghostShifts(tile.box).map((shift) => ({ ...withBounds(entry), box: shiftedBox(tile.box, shift) }))];
});
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
// where heightmaps overlap (Taiwan's covers part of the Fujian coast), the sharper one wins
const pixelsPerDegree = (tile) => (tile.width - 1) / (tile.lonMax - tile.lonMin);
for (const bucket of tileBuckets.values()) bucket.sort((a, b) => pixelsPerDegree(b) - pixelsPerDegree(a));

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

// Replace a chunk's islands in `landIslands` in place (other modules hold that array).
function setChunkIslands(chunk, islands) {
  const leaving = new Set(chunk.current);
  for (const island of chunk.current) indexIsland(island, false);
  let kept = 0;
  for (let i = 0; i < landIslands.length; i++) if (!leaving.has(landIslands[i])) landIslands[kept++] = landIslands[i];
  landIslands.length = kept;
  landIslands.push(...islands);
  for (const island of islands) indexIsland(island, true);
  chunk.current = islands;
  landVersion++;
  emitLandChange('coast', chunk.box, chunk.meta.country);
}

function loadChunk(chunk) {
  chunk.state = 'loading';
  loadQueue.push(async () => {
    try {
      const data = await fetchJson(chunk.meta.file);
      if (chunk.state !== 'loading') return;   // released while it was downloading
      chunk.state = 'detail';
      setChunkIslands(chunk, makeIslands(data, chunk));
    } catch (error) {
      chunk.state = 'outline';   // keep the outline islands; the next pass tries again
      throw error;
    }
  });
}

function unloadChunk(chunk) {
  const wasDetail = chunk.state === 'detail';
  chunk.state = 'outline';
  if (wasDetail) setChunkIslands(chunk, chunk.outline);
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
    if (distance < STREAM_RADIUS && chunk.state === 'outline') wanted.push({ distance, load: () => loadChunk(chunk) });
    else if (distance > UNLOAD_RADIUS && chunk.state !== 'outline') unloadChunk(chunk);
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

// Relief blocks: square cells of relief step × RELIEF_CELLS per country, created around the camera and released when far.
// What a block shows is looked up when it is built: the outline layer for its coarse mesh, the live islands for the
// detailed one. Islets too small for a grid cell are drawn by the block holding their centre; pieces cut at the chunk
// grid are always drawn on the grid, so a continent's pieces join up.
const reliefBlocks = new Map();
const stepOf = (country) => countryByCode(country)?.reliefStep ?? .2;
const isSmall = (island, step) => !island.cut && island.areaKm2 < 6 * (step * 4) ** 2;
function blockContents(block, buckets) {
  const islands = islandsInBox(buckets, block.box).filter((island) => island.country === block.country && !hasCustomCoastalTerrain(island));
  const inside = (island) => { const x = (island.minX + island.maxX) / 2, z = (island.minZ + island.maxZ) / 2; return x >= block.box.minX && x < block.box.maxX && z >= block.box.minZ && z < block.box.maxZ; };
  return { grid: islands.filter((island) => !isSmall(island, block.step)), small: islands.filter((island) => isSmall(island, block.step) && inside(island)) };
}
function ensureBlock(country, bx, bz) {
  const key = `${country}|${bx},${bz}`;
  if (reliefBlocks.has(key)) return;
  const step = stepOf(country), span = step * RELIEF_CELLS;
  const box = { minX: bx * span, maxX: (bx + 1) * span, minZ: bz * span, maxZ: (bz + 1) * span };
  const padded = { minX: box.minX - step, maxX: box.maxX + step, minZ: box.minZ - step, maxZ: box.maxZ + step };
  reliefBlocks.set(key, { key, country, bx, bz, step, span, box, x: (box.minX + box.maxX) / 2, z: (box.minZ + box.maxZ) / 2, switchDistance: span * 3.5,
    chunks: chunksInBox(padded).filter((chunk) => chunk.meta.country === country),
    tiles: demTiles.filter((tile) => boxesOverlap(tile.box, padded)), coarse: null, fine: null });
}
const isDetailReady = (block) => block.chunks.every((chunk) => chunk.state === 'detail') && block.tiles.every((tile) => tile.state === 'loaded');
const disposeMeshes = (meshes) => { for (const mesh of meshes ?? []) { landGroup.remove(mesh); mesh.geometry.dispose(); } };

function buildFine(block) {
  const { grid, small } = blockContents(block, landBuckets);
  const meshes = [];
  const gridMesh = grid.length && buildReliefMesh(block, block.step, RELIEF_CELLS, grid, { seaFloor: SEA_FLOOR_HEIGHT, strokeWidth: .8, metersAt: elevationMetersAt });
  if (gridMesh) meshes.push(gridMesh);
  const smallMesh = small.length && buildSmallIslandMesh(small, .14);
  if (smallMesh) meshes.push(smallMesh);
  return meshes;
}

function buildCoarse(block) {
  const { grid, small } = blockContents(block, outlineBuckets);
  const meshes = [];
  const gridMesh = grid.length && buildReliefMesh(block, block.step * COARSE_FACTOR, RELIEF_CELLS / COARSE_FACTOR, grid,
    { seaFloor: COARSE_SEA_FLOOR_HEIGHT, strokeWidth: 2, metersAt: overviewMeters });
  if (gridMesh) meshes.push(gridMesh);
  const smallMesh = small.length && buildSmallIslandMesh(small, block.step * COARSE_FACTOR);
  if (smallMesh) meshes.push(smallMesh);
  return meshes;
}

// Create the blocks over every chunk within COARSE_RADIUS of the camera, and release blocks beyond COARSE_RELEASE.
let blocksX = Infinity, blocksZ = Infinity;
function refreshBlocks(x, z) {
  if (Math.hypot(x - blocksX, z - blocksZ) < 40) return;
  blocksX = x; blocksZ = z;
  for (const chunk of chunks.values()) {
    if (boxDistance(chunk.box, x, z) > COARSE_RADIUS) continue;
    const span = stepOf(chunk.meta.country) * RELIEF_CELLS;
    for (let bx = Math.floor(chunk.box.minX / span); bx <= Math.floor(chunk.box.maxX / span); bx++) {
      for (let bz = Math.floor(chunk.box.minZ / span); bz <= Math.floor(chunk.box.maxZ / span); bz++) ensureBlock(chunk.meta.country, bx, bz);
    }
  }
  for (const [key, block] of reliefBlocks) {
    if (boxDistance(block.box, x, z) <= COARSE_RELEASE) continue;
    disposeMeshes(block.coarse); disposeMeshes(block.fine);
    reliefBlocks.delete(key);
  }
}

// Meshes are built nearest-first within a frame budget, so streaming never stalls the game for long.
let building = false;
async function buildQueuedRelief() {
  building = true;
  let frameStart = performance.now();
  for (;;) {
    let next = null, nearest = Infinity, fine = false;
    for (const block of reliefBlocks.values()) {
      const distance = Math.hypot(block.x - camera.position.x, block.z - camera.position.z);
      const wantsFine = !block.fine && distance < block.switchDistance * quality.detail && isDetailReady(block);
      if ((wantsFine || !block.coarse) && distance < nearest) { nearest = distance; next = block; fine = wantsFine; }
    }
    if (!next) break;
    if (fine) { next.fine = buildFine(next); for (const mesh of next.fine) { mesh.visible = false; landGroup.add(mesh); } }
    else { next.coarse = buildCoarse(next); for (const mesh of next.coarse) { mesh.visible = !next.fine; landGroup.add(mesh); } }
    if (performance.now() - frameStart > 6) {
      await nextFrame();
      frameStart = performance.now();
    }
  }
  building = false;
}

// Coarse meshes around the start position; awaited once at start-up.
export async function buildCoarseRelief() {
  refreshBlocks(camera.position.x, camera.position.z);
  if (!building) await buildQueuedRelief();
}

// Releasing detail data drops the detailed meshes built from it.
onLandChange(({ box }) => {
  for (const block of reliefBlocks.values()) {
    if (!block.fine || isDetailReady(block) || !boxesOverlap(block.box, box)) continue;
    disposeMeshes(block.fine);
    block.fine = null;
  }
});

// Show each block's detailed or coarse mesh by its distance to the camera; build what is due.
export function updateLandDetail() {
  refreshBlocks(camera.position.x, camera.position.z);
  let due = false;
  for (const block of reliefBlocks.values()) {
    const distance = Math.hypot(block.x - camera.position.x, camera.position.y, block.z - camera.position.z);
    const limit = block.switchDistance * quality.detail;
    const near = distance < limit;
    if ((near && !block.fine && isDetailReady(block)) || !block.coarse) due = true;
    // drop detailed meshes only when far sideways, so zooming the chart out and in does not rebuild them
    else if (block.fine && Math.hypot(block.x - camera.position.x, block.z - camera.position.z) > limit * 2) { disposeMeshes(block.fine); block.fine = null; }
    const showFine = near && !!block.fine;
    if (block.fine) for (const mesh of block.fine) mesh.visible = showFine;
    for (const mesh of block.coarse ?? []) mesh.visible = !showFine;
  }
  if (due && !building) buildQueuedRelief();
}
