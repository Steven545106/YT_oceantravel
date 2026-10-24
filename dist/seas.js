import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { fetchJson } from './data-loader.js';
import { geoToWorld } from './geo.js';
import { WORLD_BOUNDS, boat, reflectionExclusions, scene } from './core.js';
import { addMapLabel, addMapLabelAtGeo, labelHooks } from './labels.js';
import { distanceToLand, isOnLand, nextFrame } from './land.js';

const seasData = await fetchJson('seas.json');

// ---------------------------------------------------------------------------
// Seas: coloured dashed boundary lines on the water, names on the chart and
// the sea the boat is currently in (HUD).
// ---------------------------------------------------------------------------
const seaLineGroup = new THREE.Group();
scene.add(seaLineGroup);
reflectionExclusions.push(seaLineGroup);
const seaLineMaterials = [];
const seaRegions = [];
export const seaMainAnchors = [];
const seaNameReadout = document.querySelector('#sea-name');

function decodeSeaPath(flat) {
  const result = [];
  let lon = 0, lat = 0;
  for (let i = 0; i < flat.length; i += 2) {
    lon += flat[i]; lat += flat[i + 1];
    result.push(geoToWorld({ latitude: lat / seasData.scale, longitude: lon / seasData.scale }));
  }
  return result;
}

const SHOW_SEA_BORDERS = false;   // the coloured border lines on the water are switched off by request; names and the HUD sea name stay
for (const sea of seasData.seas) {
  if (SHOW_SEA_BORDERS && sea.color) {
    const material = new LineMaterial({
      color: new THREE.Color(sea.color).getHex(), linewidth: 1.6, dashed: true, dashSize: 5, gapSize: 2.2,
      transparent: true, opacity: .4, worldUnits: false, depthWrite: false
    });
    material.resolution.set(innerWidth, innerHeight);
    seaLineMaterials.push(material);
    for (const flat of sea.lines) {
      const path = decodeSeaPath(flat);
      const positions = [];
      for (const point of path) positions.push(point.x, .12, point.y);
      const geometry = new LineGeometry();
      geometry.setPositions(positions);
      const line = new Line2(geometry, material);
      line.computeLineDistances();
      line.renderOrder = 4;
      line.frustumCulled = false;
      seaLineGroup.add(line);
      // A faint vertical curtain along the border so it can also be seen from the boat's low viewpoint.
      const curtainPositions = [], curtainHeights = [], curtainIndices = [];
      path.forEach((point, i) => {
        curtainPositions.push(point.x, .05, point.y, point.x, .5, point.y);
        curtainHeights.push(0, 1);
        if (i < path.length - 1) { const a = i * 2; curtainIndices.push(a, a + 1, a + 3, a, a + 3, a + 2); }
      });
      const curtainGeometry = new THREE.BufferGeometry();
      curtainGeometry.setIndex(curtainIndices);
      curtainGeometry.setAttribute('position', new THREE.Float32BufferAttribute(curtainPositions, 3));
      curtainGeometry.setAttribute('height', new THREE.Float32BufferAttribute(curtainHeights, 1));
      const curtain = new THREE.Mesh(curtainGeometry, new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
        uniforms: { color: { value: new THREE.Color(sea.color) } },
        vertexShader: 'attribute float height; varying float vHeight; void main() { vHeight = height; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform vec3 color; varying float vHeight; void main() { gl_FragColor = vec4(color, pow(1.0 - vHeight, 1.6) * .42); }'
      }));
      curtain.frustumCulled = false;
      curtain.renderOrder = 3;
      seaLineGroup.add(curtain);
    }
  }
  const rings = sea.rings.map(decodeSeaPath);
  let area = 0;
  for (const ring of rings) {
    let twice = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) twice += ring[j].x * ring[i].y - ring[i].x * ring[j].y;
    area += Math.abs(twice) / 2;
  }
  seaRegions.push({ name: sea.zh, rings, area, priority: sea.priority, color: sea.color ?? null, kind: sea.kind });
  { const anchor = geoToWorld({ latitude: sea.label[0], longitude: sea.label[1] }); if (sea.kind !== 'bay') seaMainAnchors.push({ name: sea.zh, x: anchor.x, z: anchor.y }); }
  addMapLabelAtGeo({
    text: sea.zh, kind: 'sea', priority: sea.priority, maxHeight: sea.maxHeight ?? Infinity, color: sea.color ?? null
  }, sea.label[0], sea.label[1]);
}
seaRegions.sort((a, b) => a.area - b.area);

function pointInSeaRegion(region, x, z) {
  for (const ring of region.rings) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a.y > z) !== (b.y > z) && x < (b.x - a.x) * (z - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}

// Extra copies of each sea's name on a lattice inside it, so a name is on screen wherever you pan the
// chart (the nearest copy to another with the same text is hidden by the label placer).
async function registerSeaAnchors() {
  for (const [step, maxHeight, drop] of [[51, 560, 40], [25, 180, 50]]) {
    let work = 0;
    for (const region of seaRegions) {
      if (region.kind === 'bay') continue;
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const ring of region.rings) for (const p of ring) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.y); maxZ = Math.max(maxZ, p.y); }
      for (let x = Math.ceil(minX / step) * step; x <= maxX; x += step) {
        for (let z = Math.ceil(minZ / step) * step; z <= maxZ; z += step) {
          if (x < WORLD_BOUNDS.minX || x > WORLD_BOUNDS.maxX || z < WORLD_BOUNDS.minZ || z > WORLD_BOUNDS.maxZ) continue;
          if (!pointInSeaRegion(region, x, z) || isOnLand(x, z) || distanceToLand(x, z).km < 25) continue;
          addMapLabel({ text: region.name, x, z, kind: 'sea', priority: region.priority - drop, maxHeight, color: region.color });
          if (++work % 60 === 0) await nextFrame();
        }
      }
    }
  }
}
registerSeaAnchors();

export function seaNameAt(x, z) {
  for (const region of seaRegions) {
    for (const ring of region.rings) {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i], b = ring[j];
        if ((a.y > z) !== (b.y > z) && x < (b.x - a.x) * (z - a.y) / (b.y - a.y) + a.x) inside = !inside;
      }
      if (inside) return region.name;
    }
  }
  return '';
}
labelHooks.seaNameAt = seaNameAt;
let seaNameFrame = 0;
export function updateSeaName() {
  if (++seaNameFrame % 12 !== 1 || !seaNameReadout) return;
  const name = seaNameAt(boat.position.x, boat.position.z);
  const text = name ? `海域 · ${name}` : '海域 · —';
  if (seaNameReadout.textContent !== text) seaNameReadout.textContent = text;
}
addEventListener('resize', () => seaLineMaterials.forEach((material) => material.resolution.set(innerWidth, innerHeight)));
