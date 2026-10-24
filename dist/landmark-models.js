import {addTaiwanCoastalModels} from './taiwan-coastal-models.js';
import {addTaiwanVillages} from './taiwan-village-models.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { refineKoreaLandmarks } from './korea-reference-models.js';
import { refineJapanLandmarks } from './japan-reference-models.js';
import { refineNkPhLandmarks } from './nk-ph-reference-models.js';
import { createKaohsiungAirport } from './airport-model.js';

// ---------------------------------------------------------------------------
// Landmarks: stylised low-poly stand-ins for famous sights, placed at their real
// coordinates. Data-driven (Data/landmarks.json); each entry picks a builder.
// ---------------------------------------------------------------------------
// Small greyscale canvas textures multiply the base colour: roof tiles, masonry, brick, window grids.
// One texture cell spans UV_UNIT model units; boxes and roofs scale their UVs so the pattern keeps a constant size.
const UV_UNIT = .16;
function patternTexture(draw, size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, size, size);
  draw(context, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
const TEXTURES = {
  tiles: patternTexture((c, s) => {          // rows of roof tiles with staggered joints
    const rows = 8;
    for (let r = 0; r < rows; r++) {
      const y = r * s / rows;
      c.fillStyle = 'rgba(0,0,0,.34)'; c.fillRect(0, y, s, 3);
      c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(0, y + 3, s, 2);
      c.fillStyle = 'rgba(0,0,0,.2)';
      for (let k = 0; k < 8; k++) c.fillRect(((k + (r % 2) * .5) * s / 8) | 0, y + 3, 2, s / rows - 3);
    }
  }),
  stone: patternTexture((c, s) => {          // cut-stone wall
    const rows = 4;
    for (let r = 0; r < rows; r++) {
      const y = r * s / rows, w = s / (r % 2 ? 3 : 2);
      c.fillStyle = 'rgba(0,0,0,.38)'; c.fillRect(0, y, s, 3);
      for (let x = (r % 2 ? w / 2 : 0); x < s; x += w) c.fillRect(x | 0, y, 3, s / rows);
      for (let b = 0; b < 3; b++) { c.fillStyle = `rgba(0,0,0,${.04 + Math.random() * .1})`; c.fillRect(Math.random() * s, y + 4, w * .8, s / rows - 6); }
    }
  }),
  brick: patternTexture((c, s) => {
    const rows = 10;
    for (let r = 0; r < rows; r++) {
      const y = r * s / rows;
      c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(0, y, s, 2);
      c.fillStyle = 'rgba(0,0,0,.25)';
      for (let k = 0; k < 6; k++) c.fillRect(((k + (r % 2) * .5) * s / 6) | 0, y, 2, s / rows);
    }
  }),
  windows: patternTexture((c, s) => {        // grid of dark window panes between pale mullions
    c.fillStyle = 'rgba(0,0,0,.55)';
    for (let i = 0; i < 4; i++) for (let j = 0; j < 6; j++) c.fillRect(i * s / 4 + 4, j * s / 6 + 4, s / 4 - 8, s / 6 - 9);
  }),
  plaster: patternTexture((c, s) => {        // white wall with timber battens and lattice windows
    c.fillStyle = 'rgba(0,0,0,.28)';
    c.fillRect(0, 0, 3, s); c.fillRect(s / 2, 0, 3, s);
    c.fillRect(0, 0, s, 3);
    c.fillStyle = 'rgba(40,36,30,.7)';
    c.fillRect(s * .12, s * .3, s * .26, s * .34); c.fillRect(s * .62, s * .3, s * .26, s * .34);
    c.fillStyle = 'rgba(255,255,255,.5)';
    for (let k = 1; k < 4; k++) { c.fillRect(s * .12 + k * s * .065, s * .3, 1, s * .34); c.fillRect(s * .62 + k * s * .065, s * .3, 1, s * .34); }
  }),
  windowsLit: patternTexture((c, s) => {       // the same window grid, glowing: black wall, warm lit panes
    c.fillStyle = '#000'; c.fillRect(0, 0, s, s);
    c.fillStyle = '#ffd98a';
    for (let i = 0; i < 4; i++) for (let j = 0; j < 6; j++) if ((i * 7 + j * 3) % 5 !== 0) c.fillRect(i * s / 4 + 4, j * s / 6 + 4, s / 4 - 8, s / 6 - 9);
  }),
  lit: patternTexture((c, s) => {            // warm lit shop windows between dark timber
    c.fillStyle = '#3b2e22'; c.fillRect(0, 0, s, s);
    c.fillStyle = '#ffcf7a';
    for (let i = 0; i < 3; i++) c.fillRect(i * s / 3 + 6, s * .22, s / 3 - 12, s * .5);
    c.fillStyle = '#d83a22';
    for (let i = 0; i < 6; i++) c.fillRect(i * s / 6 + 8, s * .08, 8, 8);   // lanterns under the eaves
  }),
  pits: patternTexture((c, s) => {            // honeycomb weathering pits on sandstone
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = 1.5 + Math.random() * 3.5;
      c.fillStyle = `rgba(30,20,12,${.35 + Math.random() * .35})`;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255,230,190,.25)';
      c.beginPath(); c.arc(x - r * .3, y - r * .3, r * .5, 0, Math.PI * 2); c.fill();
    }
  }),
  timber: patternTexture((c, s) => {          // dark timber frame around pale infill panels (Todai-ji's walls)
    c.fillStyle = '#e9e4d6'; c.fillRect(0, 0, s, s);
    c.fillStyle = '#3b2a20';
    c.fillRect(0, 0, s, 7); c.fillRect(0, s * .5 - 3, s, 6); c.fillRect(0, s - 6, s, 6);
    for (let i = 0; i < 4; i++) c.fillRect(i * s / 4 - 3, 0, 7, s);
    c.fillStyle = '#5a463a';
    for (let i = 0; i < 4; i++) c.fillRect(i * s / 4 + 16, 12, 28, 12);          // brackets
  }),
  marble: patternTexture((c, s) => {          // Taroko marble: pale grey rock with dark streaks and weathered bands
    c.fillStyle = '#e8e6de'; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 14; i++) { const y = Math.random() * s; c.fillStyle = `rgba(${60 + Math.random() * 40},${60 + Math.random() * 40},${55 + Math.random() * 40},${.1 + Math.random() * .22})`; c.fillRect(0, y, s, 1 + Math.random() * 5); }
    for (let i = 0; i < 5; i++) { const x = Math.random() * s; c.fillStyle = `rgba(30,35,30,${.12 + Math.random() * .2})`; c.fillRect(x, 0, 1 + Math.random() * 3, s); }
  }),
  wood: patternTexture((c, s) => {           // vertical grain
    for (let k = 0; k < 14; k++) { c.fillStyle = `rgba(0,0,0,${.05 + Math.random() * .16})`; c.fillRect((Math.random() * s) | 0, 0, 1 + (Math.random() * 3 | 0), s); }
  })
};
const materialRegistry = [];
const stdMaterial = (parameters) => {
  const material = new THREE.MeshStandardMaterial(parameters);
  // Existing stone/roof/wood maps double as restrained relief, rather than adding more meshes.
  if (parameters.map && (parameters.roughness ?? .7) >= .55 && !parameters.emissiveMap) {
    material.bumpMap = parameters.map;
    material.bumpScale = .002;
  }
  if (landmarkEnvironment) { material.envMap=landmarkEnvironment; material.envMapIntensity=landmarkNight ? ENV_NIGHT : ENV_DAY; }
  materialRegistry.push({ material, emissive: material.emissive.clone(), intensity: material.emissiveIntensity, emissiveMap: material.emissiveMap });
  return material;
};
const lmMaterial = (color, extra = {}) => stdMaterial({ color, roughness: .7, metalness: .05, ...extra });

// Outdoor sky/ground PMREM, updated for day, dusk and night by landscape-lighting.js.
// Glass, glazed tiles and metal share the current environment with newly created sights.
let landmarkEnvironment = null;
const ENV_DAY = 1.6, ENV_NIGHT = .12;
export function setLandmarkEnvironment(envMap) {
  landmarkEnvironment = envMap;
  for (const { material } of materialRegistry) { material.envMap = envMap; material.envMapIntensity = landmarkNight ? ENV_NIGHT : ENV_DAY; material.needsUpdate = true; }
}
// Night lighting for every sight: window grids glow, walls and roofs pick up a warm floodlight tint
// (water, foliage and grass stay dark), and gilded parts shine. Called from the main loop with the time of day.
let landmarkNight = null;
let nightMaterialCount = -1;
export function setLandmarkNight(night) {
  if (night === landmarkNight && nightMaterialCount === materialRegistry.length) return;
  nightMaterialCount = materialRegistry.length;
  landmarkNight = night;
  for (const entry of materialRegistry) {
    const { material } = entry;
    if (landmarkEnvironment) { material.envMap = landmarkEnvironment; material.envMapIntensity = night ? ENV_NIGHT : ENV_DAY; }
    if (material.userData.ownNight) continue;                               // drives its own night glow (Taipei 101)
    if (!night) { material.emissive.copy(entry.emissive); material.emissiveIntensity = entry.intensity; material.emissiveMap = entry.emissiveMap; material.needsUpdate = true; continue; }
    const { r, g, b } = material.color;
    const foliage = g > r * 1.05 && g > b * 1.05, water = material.roughness <= .2;
    if (material.map === TEXTURES.windows) { material.emissive.set(0xffd27a); material.emissiveMap = TEXTURES.windowsLit; material.emissiveIntensity = 1.1; }
    else if (material.map === TEXTURES.lit) continue;                      // Jiufen's shop windows already glow
    else if (foliage || water || material.roughness >= .95 || material.vertexColors) continue;   // hills, rock, sand and clouds stay dark
    else if (entry.emissiveMap) { material.emissive.set(0xffd9a0); material.emissiveIntensity = .55; }  // glass facades: their own pattern lights up
    else { material.emissive.copy(material.color).lerp(new THREE.Color(0xffc980), .35); material.emissiveMap = material.map; material.emissiveIntensity = Math.max(entry.intensity, .3); }
    material.needsUpdate = true;
  }
}
export const LM = {
  plaster: lmMaterial(0xf1ede0, { map: TEXTURES.plaster }), black: lmMaterial(0x1d1f22), roofDark: lmMaterial(0x3a4046, { map: TEXTURES.tiles }), tileGrey: lmMaterial(0x7d848c, { map: TEXTURES.tiles }),
  roofGreen: lmMaterial(0x58a08a, { map: TEXTURES.tiles }), roofBlue: lmMaterial(0x3677c4, { map: TEXTURES.tiles }), roofYellow: lmMaterial(0xe0b53a, { map: TEXTURES.tiles }), roofRed: lmMaterial(0xb84230, { map: TEXTURES.tiles }),
  vermilion: lmMaterial(0xc8341f), paleRed: lmMaterial(0xd9806a),
  gold: lmMaterial(0xdcae2f, { metalness: .5, roughness: .35, emissive: 0x4a3300, emissiveIntensity: .4 }),
  wood: lmMaterial(0x6b4630, { map: TEXTURES.wood }), stone: lmMaterial(0x9a9a90, { map: TEXTURES.stone }), white: lmMaterial(0xf5f6f8), steelRed: lmMaterial(0xd4381e),
  glass: lmMaterial(0x9fc2cc, { map: TEXTURES.windows, metalness: .5, roughness: .25, emissive: 0xfff0b0, emissiveIntensity: .06 }),
  goldGlass: lmMaterial(0xd9b24a, { metalness: .6, roughness: .25, emissive: 0x6b4a00, emissiveIntensity: .25 }),
  concrete: lmMaterial(0xb9b9b4), pale: lmMaterial(0xcfe3f2), green: lmMaterial(0x3f7a4a), thatch: lmMaterial(0xb89a5a),
  brick: lmMaterial(0x9a4632, { map: TEXTURES.brick }), water: lmMaterial(0x2f7fb8, { roughness: .15, metalness: .15 }), aqua: lmMaterial(0x62b6e8, { roughness: .25 }),
  bronze: lmMaterial(0x5d8f78, { roughness: .5, metalness: .3 }), sand: lmMaterial(0xe4d3a0), rock: lmMaterial(0x8e8a80),
  whiteRock: lmMaterial(0xe8e6df), leaf: lmMaterial(0x2f6b3a), trunk: lmMaterial(0x6a4a32), pink: lmMaterial(0xf3d3dc),
  spireBlue: lmMaterial(0x4d7fd0), lantern: lmMaterial(0xff4a2f, { emissive: 0xff2a10, emissiveIntensity: .7 })
};
const SQRT2 = Math.SQRT2;
function lmAdd(group, geometry, material, x = 0, y = 0, z = 0, yaw = 0) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.rotation.y = yaw;
  group.add(mesh);
  return mesh;
}
// y is the bottom of each part.
// BoxGeometry UVs run 0..1 on every face; rescale them to the face's real size so textures keep a constant scale.
function texturedBox(w, h, d) {
  const geometry = new THREE.BoxGeometry(w, h, d);
  const uv = geometry.attributes.uv;
  const faces = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];   // +x, -x, +y, -y, +z, -z
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const k = f * 4 + i;
    uv.setXY(k, uv.getX(k) * faces[f][0] / UV_UNIT, uv.getY(k) * faces[f][1] / UV_UNIT);
  }
  return geometry;
}
const lmBox = (g, w, h, d, mat, x = 0, y = 0, z = 0, yaw = 0) => lmAdd(g, texturedBox(w, h, d), mat, x, y + h / 2, z, yaw);
const lmCyl = (g, rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 14) => lmAdd(g, new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y + h / 2, z);
// A square-plan frustum with half-sides given (the 4-sided cylinder is diamond-oriented, so turn it 45 degrees).
const squareFrustum = (halfTop, halfBottom, height) => new THREE.CylinderGeometry(halfTop * SQRT2, halfBottom * SQRT2, height, 4).rotateY(Math.PI / 4);
// Hipped roof with the East Asian profile: slopes flatten towards the eaves and the four corners flick upward.
function curvedRoofGeometry(halfTop, halfBottom, h, lift = .2) {
  const N = 8, M = 5;
  const positions = [], uvs = [], index = [];
  const bottom = [[-halfBottom, -halfBottom], [halfBottom, -halfBottom], [halfBottom, halfBottom], [-halfBottom, halfBottom]];
  const top = [[-halfTop, -halfTop], [halfTop, -halfTop], [halfTop, halfTop], [-halfTop, halfTop]];
  const slope = Math.hypot(halfBottom - halfTop, h);
  const point = (face, s, t) => {
    const a = bottom[face], b = bottom[(face + 1) % 4], c = top[face], d = top[(face + 1) % 4];
    const bx = a[0] + (b[0] - a[0]) * s, bz = a[1] + (b[1] - a[1]) * s, tx = c[0] + (d[0] - c[0]) * s, tz = c[1] + (d[1] - c[1]) * s;
    const corner = Math.abs(2 * s - 1) ** 4;
    const y = h * t ** 1.55 + lift * h * (1 - t) ** 2 * corner;
    const flare = 1 + .06 * corner * (1 - t);   // eave corners also reach slightly outward
    return [(bx + (tx - bx) * t) * flare, y, (bz + (tz - bz) * t) * flare, s, t];
  };
  for (let face = 0; face < 4; face++) {
    const base = positions.length / 3;
    const edge = Math.hypot(bottom[(face + 1) % 4][0] - bottom[face][0], bottom[(face + 1) % 4][1] - bottom[face][1]);
    for (let j = 0; j <= M; j++) for (let i = 0; i <= N; i++) {
      const [px, py, pz, s, t] = point(face, i / N, j / M);
      positions.push(px, py, pz);
      uvs.push(s * edge / UV_UNIT, t * slope / UV_UNIT);
    }
    const triangles = [];
    for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) {
      const a = base + j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
      triangles.push([a, c, b], [b, c, d]);
    }
    // wind the face so its normal points away from the roof's axis
    const [ia, ib, ic] = triangles[0];
    const v = (n) => [positions[n * 3], positions[n * 3 + 1], positions[n * 3 + 2]];
    const A = v(ia), B = v(ib), C = v(ic);
    const nx = (B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]);
    const nz = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
    const midX = (bottom[face][0] + bottom[(face + 1) % 4][0]) / 2, midZ = (bottom[face][1] + bottom[(face + 1) % 4][1]) / 2;
    const flip = nx * midX + nz * midZ < 0;
    for (const [p, q, r] of triangles) index.push(...(flip ? [p, r, q] : [p, q, r]));
  }
  const cap = (y, size, up) => {
    const base = positions.length / 3;
    for (const [cx, cz] of [[-size, -size], [size, -size], [size, size], [-size, size]]) { positions.push(cx, y, cz); uvs.push(cx / UV_UNIT, cz / UV_UNIT); }
    index.push(...(up ? [base, base + 3, base + 2, base, base + 2, base + 1] : [base, base + 1, base + 2, base, base + 2, base + 3]));
  };
  cap(0, halfBottom, false);
  if (halfTop > .002) cap(h, halfTop, true);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  geometry.translate(0, -h / 2, 0);
  return geometry;
}
const lmHip = (g, halfTop, halfBottom, h, mat, x = 0, y = 0, z = 0, stretchZ = 1, yaw = 0) => {
  const mesh = lmAdd(g, curvedRoofGeometry(halfTop, halfBottom, h), mat, x, y + h / 2, z, yaw);
  mesh.scale.z = stretchZ;
  return mesh;
};


// Octagonal roof with the curved East Asian profile (slopes flatten toward the eave, which flicks up a little).
function octagonRoof(rBottom, rTop, h, segments = 8) {
  const points = [];
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;                                           // 0 = eave, 1 = top
    const r = rBottom + (rTop - rBottom) * t;
    const y = h * Math.pow(t, 1.6) + h * .18 * Math.pow(1 - t, 3);  // concave slope with an upturned eave
    points.push(new THREE.Vector2(r, y));
  }
  points.push(new THREE.Vector2(0.001, h));
  return new THREE.LatheGeometry(points, segments).rotateY(Math.PI / segments);
}


// A round-headed arcade opening on the +Z face of a wall (flip with yaw for other faces).
function archBay(g, x, y, z, width, height, material, yaw = 0) {
  const holder = new THREE.Group();
  holder.position.set(x, y, z);
  holder.rotation.y = yaw;
  lmBox(holder, width, height - width / 2, .006, material, 0, 0, 0);
  lmAdd(holder, new THREE.CircleGeometry(width / 2, 14, 0, Math.PI), material, 0, height - width / 2, .003);
  g.add(holder);
}

// A thin round bar between two points, for lattice frames and cables.
const strutAxis = new THREE.Vector3(0, 1, 0);
function strutGeometry(from, to, radius) {
  const direction = new THREE.Vector3().subVectors(to, from);
  const geometry = new THREE.CylinderGeometry(radius, radius, direction.length(), 5);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(strutAxis, direction.clone().normalize()));
  geometry.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
  return geometry;
}
function latticeTower(group, { base, top, height, sections, reds, whites, radius, y = 0 }) {
  const halfAt = (h) => top + (base - top) * Math.max(0, 1 - h / height) ** 1.7;   // max(): rounding can push h a hair past height, and a negative base ** 1.7 is NaN
  const corners = (h) => { const w = halfAt(h); return [new THREE.Vector3(-w, y + h, -w), new THREE.Vector3(w, y + h, -w), new THREE.Vector3(w, y + h, w), new THREE.Vector3(-w, y + h, w)]; };
  const redParts = [], whiteParts = [];
  for (let k = 0; k < sections; k++) {
    const a = corners(height * k / sections), b = corners(height * (k + 1) / sections);
    const legs = k % 2 ? whiteParts : redParts, rings = k % 2 ? redParts : whiteParts;
    for (let c = 0; c < 4; c++) {
      legs.push(strutGeometry(a[c], b[c], radius));
      rings.push(strutGeometry(b[c], b[(c + 1) % 4], radius * .7));
      if (k < sections - 2) {
        legs.push(strutGeometry(a[c], b[(c + 1) % 4], radius * .45));
        legs.push(strutGeometry(a[(c + 1) % 4], b[c], radius * .45));
      }
    }
  }
  group.add(new THREE.Mesh(mergeGeometries(redParts), reds));
  group.add(new THREE.Mesh(mergeGeometries(whiteParts), whites));
}


// A round lattice shaft (rings of struts with X bracing), radius easing from r0 at y0 to r1 at y1; flare > 1 makes a wide, quickly narrowing foot.
function roundLattice(group, { r0, r1, y0, y1, rings, sides, radius, material, flare = 1 }) {
  const parts = [];
  const radiusAt = (t) => r1 + (r0 - r1) * Math.pow(1 - t, flare);
  const ringPoints = (i) => {
    const t = i / rings, r = radiusAt(t), y = y0 + (y1 - y0) * t;
    return Array.from({ length: sides }, (_, k) => new THREE.Vector3(Math.cos(k / sides * Math.PI * 2) * r, y, Math.sin(k / sides * Math.PI * 2) * r));
  };
  let lower = ringPoints(0);
  for (let i = 1; i <= rings; i++) {
    const upper = ringPoints(i);
    for (let k = 0; k < sides; k++) {
      const n = (k + 1) % sides;
      parts.push(strutGeometry(lower[k], upper[k], radius));
      parts.push(strutGeometry(upper[k], upper[n], radius * .8));
      parts.push(strutGeometry(lower[k], upper[n], radius * .55));
    }
    lower = upper;
  }
  group.add(new THREE.Mesh(mergeGeometries(parts), material));
}


// A triangular gable (chidori-hafu) face: a thin extruded triangle standing on its base, facing +Z (rotate with yaw).
function gableAt(g, { x, y, z, width, height, depth = .02, material, yaw = 0 }) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0); shape.lineTo(width / 2, 0); shape.lineTo(0, height); shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }).translate(0, 0, -depth / 2);
  const mesh = lmAdd(g, geometry, material, x, y, z, yaw);
  return mesh;
}
// A pine with flat, cloud-like tiers of needles on a crooked trunk (Japanese garden style).
function gardenPine(g, x, z, scale = 1) {
  const trunk = lmCyl(g, .012 * scale, .02 * scale, .2 * scale, LM.trunk, x, 0, z, 6); trunk.rotation.z = .12;
  for (let i = 0; i < 3; i++) {
    const cloud = lmAdd(g, new THREE.SphereGeometry(.07 * scale * (1 - i * .18), 9, 6), LM.leaf, x + (i - 1) * .03 * scale, (.17 + i * .06) * scale, z + (i % 2 ? .02 : -.02) * scale);
    cloud.scale.y = .5;
  }
}


// A box beam bent upward at both ends (a smooth swept torii roof): length along x, rise = how far the tips lift.
function curvedBeam(length, thickness, depth, rise) {
  const geometry = new THREE.BoxGeometry(length, thickness, depth, 24, 1, 1);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) { const t = position.getX(i) / (length / 2); position.setY(i, position.getY(i) + rise * t * t); }
  geometry.computeVertexNormals();
  return geometry;
}


// A karahafu-style gable: a pointed arch whose sides are concave curves (extruded thin), facing +Z.
function curvedGableAt(g, { x, y, z, width, height, depth = .02, material, yaw = 0 }) {
  const shape = new THREE.Shape();
  const w = width / 2;
  shape.moveTo(-w, 0);
  shape.bezierCurveTo(-w * .55, .02 * height, -w * .12, .45 * height, 0, height);
  shape.bezierCurveTo(w * .12, .45 * height, w * .55, .02 * height, w, 0);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }).translate(0, 0, -depth / 2);
  return lmAdd(g, geometry, material, x, y, z, yaw);
}


// A rough, lumpy mass (jittered icosphere) for hills, cliffs and boulders; deterministic from the seed.
function roughMass(rx, ry, rz, { jitter = .22, seed = 1, detail = 2 } = {}) {
  const geometry = new THREE.IcosahedronGeometry(1, detail);
  const position = geometry.attributes.position;
  let state = seed * 9301 + 49297;
  const hash = (x, y, z) => { const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + state) * 43758.5453; return n - Math.floor(n); };
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const k = 1 + (hash(Math.round(x * 20), Math.round(y * 20), Math.round(z * 20)) - .5) * 2 * jitter;
    position.setXYZ(i, x * k * rx, y * k * ry, z * k * rz);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// --- Reusable parts --------------------------------------------------------
function castleKeep(g, { x = 0, z = 0, y = 0, half, tiers, wall, roof, tierH, roofH, shrink = .8, gold = true }) {
  let yy = y, h = half;
  for (let i = 0; i < tiers; i++) {
    lmBox(g, h * 2, tierH, h * 2, wall, x, yy, z);
    yy += tierH;
    lmHip(g, h * .45, h * 1.45, roofH, roof, x, yy, z);
    if (i < tiers - 1) lmBox(g, h * .8, roofH * .95, h * .14, wall, x, yy + roofH * .1, z + h * 1.06); // karahafu gable
    yy += roofH;
    h *= shrink;
  }
  if (gold) {
    lmAdd(g, new THREE.ConeGeometry(half * .09, half * .4, 6), LM.gold, x + h * .9, yy + half * .1, z);
    lmAdd(g, new THREE.ConeGeometry(half * .09, half * .4, 6), LM.gold, x - h * .9, yy + half * .1, z);
  }
  return yy;
}
function pagodaAt(g, { x = 0, z = 0, y = 0, half = .13, levels = 5, wall = LM.vermilion, roof = LM.roofDark }) {
  let yy = y, h = half;
  lmBox(g, h * 2.6, h * .35, h * 2.6, LM.stone, x, yy, z);
  yy += h * .35;
  for (let i = 0; i < levels; i++) {
    lmBox(g, h * 1.5, h * .8, h * 1.5, wall, x, yy, z);
    yy += h * .8;
    lmHip(g, h * .4, h * 1.35, h * .42, roof, x, yy, z);
    yy += h * .42;
    h *= .88;
  }
  lmCyl(g, h * .06, h * .1, h * 1.8, LM.gold, x, yy, z, 6);
  return yy + h * 1.8;
}
function hallAt(g, { x = 0, z = 0, y = 0, w = .66, d = .38, wallH = .17, wall = LM.vermilion, roof = LM.roofDark, double = true, roofH = .17, gold = false, platformH = .05 }) {
  lmBox(g, w * 1.35, platformH, d * 1.5, LM.stone, x, y, z);
  let yy = y + platformH;
  lmBox(g, w, wallH, d, wall, x, yy, z);
  // a row of columns across the front
  for (let i = 0; i <= 6; i++) lmCyl(g, .008, .008, wallH, LM.wood, x - w / 2 + (w / 6) * i, yy, z + d / 2 + .012, 6);
  yy += wallH;
  const bigRoof = lmHip(g, w * .14, w * .6, roofH, roof, x, yy, z, d / w * 1.2);
  if (double) {
    lmBox(g, w * .46, wallH * .35, d * .6, wall, x, yy + roofH * .75, z);
    lmHip(g, w * .05, w * .34, roofH * .7, roof, x, yy + roofH * .75 + wallH * .35, z, d / w * 1.2);
    yy += roofH * .75 + wallH * .35 + roofH * .7;
  } else yy += roofH;
  if (gold) {
    lmAdd(g, new THREE.ConeGeometry(.018, .07, 5), LM.gold, x - w * .08, yy + .02, z);
    lmAdd(g, new THREE.ConeGeometry(.018, .07, 5), LM.gold, x + w * .08, yy + .02, z);
  }
  return { top: yy, roof: bigRoof };
}
function toriiAt(g, { x = 0, z = 0, y = 0, span = .42, height = .62, yaw = 0, sub = false }) {
  const inner = new THREE.Group();
  inner.position.set(x, y, z);
  inner.rotation.y = yaw;
  for (const side of [-1, 1]) {
    lmCyl(inner, .026, .032, height, LM.vermilion, side * span / 2, 0, 0, 10);
    if (sub) for (const off of [-1, 1]) lmCyl(inner, .014, .018, height * .6, LM.vermilion, side * span / 2, 0, off * .08, 8);
  }
  lmBox(inner, span + .16, .045, .07, LM.vermilion, 0, height - .05, 0);
  lmBox(inner, span + .2, .025, .09, LM.black, 0, height - .005, 0);
  lmBox(inner, span, .035, .05, LM.vermilion, 0, height * .72, 0);
  lmBox(inner, .05, .1, .05, LM.vermilion, 0, height * .78, 0);
  g.add(inner);
}
function treeAt(g, { x = 0, z = 0, y = 0, height = 1, girth = .1, leaf = LM.leaf }) {
  lmCyl(g, girth * .5, girth, height * .55, LM.trunk, x, y, z, 8);
  for (let i = 0; i < 3; i++) lmAdd(g, new THREE.ConeGeometry(girth * (3.2 - i * .8), height * .42, 9), leaf, x, y + height * (.4 + i * .2) + height * .21, z);
}
function suspensionBridge(g, { span, pylon = 1, deckY = .3, doubleDeck = false, lengthSide = .3 }) {
  const half = span / 2, total = span + span * lengthSide * 2;
  lmBox(g, total, .02, .1, LM.concrete, 0, deckY, 0);
  if (doubleDeck) lmBox(g, total, .02, .1, LM.concrete, 0, deckY + .06, 0);
  const cables = [], hangers = [];
  for (const sideZ of [-.05, .05]) {
    const pts = [];
    const sag = (t) => deckY + .05 + (pylon * .98 - deckY - .05) * (2 * Math.abs(t)) ** 2; // t in -1..1 across the main span
    for (let i = 0; i <= 28; i++) { const t = i / 28 * 2 - 1; pts.push(new THREE.Vector3(t * half, sag(t), sideZ)); }
    for (let i = 0; i < pts.length - 1; i++) cables.push(strutGeometry(pts[i], pts[i + 1], .004));
    for (let i = 1; i < pts.length - 1; i += 1) hangers.push(strutGeometry(new THREE.Vector3(pts[i].x, deckY + .01, sideZ), pts[i], .0013));
    for (const sign of [-1, 1]) {
      const anchor = new THREE.Vector3(sign * (half + span * lengthSide), deckY + .02, sideZ);
      cables.push(strutGeometry(new THREE.Vector3(sign * half, pylon * .98, sideZ), anchor, .004));
    }
  }
  for (const sign of [-1, 1]) {
    for (const sideZ of [-.05, .05]) lmBox(g, .035, pylon, .03, LM.steelRed, sign * half, 0, sideZ);
    lmBox(g, .04, .03, .15, LM.steelRed, sign * half, pylon * .72, 0);
    lmBox(g, .04, .03, .15, LM.steelRed, sign * half, pylon * .96, 0);
  }
  g.add(new THREE.Mesh(mergeGeometries(cables), LM.white));
  g.add(new THREE.Mesh(mergeGeometries(hangers), LM.white));
}

export const LANDMARK_BUILDERS = {
  // ---- Towers ----
  tokyoTower() {   // Tokyo Tower: widely splayed red lattice legs, the main deck, a narrower red-and-white middle, the special deck and a banded antenna
    const g = new THREE.Group();
    const red = LM.steelRed;
    lmBox(g, .3, .02, .3, LM.concrete, 0, 0, 0);
    latticeTower(g, { base: .14, top: .055, height: .33, sections: 4, reds: red, whites: red, radius: .0055, y: .02 });
    lmBox(g, .2, .014, .2, red, 0, .345, 0);                                   // underside of the main deck
    lmBox(g, .21, .028, .21, LM.white, 0, .359, 0);                            // main deck (150 m): white band with windows
    lmBox(g, .212, .014, .212, LM.glass, 0, .372, 0);
    lmBox(g, .19, .012, .19, red, 0, .387, 0);
    latticeTower(g, { base: .052, top: .022, height: .3, sections: 5, reds: red, whites: LM.white, radius: .0045, y: .399 });
    lmCyl(g, .04, .04, .03, LM.white, 0, .70, 0, 18);                          // special deck (250 m)
    lmCyl(g, .0405, .0405, .012, LM.glass, 0, .709, 0, 18);
    lmCyl(g, .028, .035, .02, red, 0, .73, 0, 18);
    latticeTower(g, { base: .022, top: .01, height: .12, sections: 3, reds: LM.white, whites: red, radius: .0035, y: .75 });
    for (let i = 0; i < 6; i++) lmCyl(g, .0035 * (1 - i * .08), .005 * (1 - i * .08), .02 + i * .004, i % 2 ? LM.white : red, 0, .87 + i * .022, 0, 6);
    return g;
  },
  skytree() {   // Tokyo Skytree: a flared lattice foot narrowing into a round shaft, the two big glassy decks (350 m and 450 m), a slender mast with grey gain sections and a lantern at the tip
    const g = new THREE.Group();
    const silver = lmMaterial(0xdfe4e8, { metalness: .5, roughness: .35 });
    const grey = lmMaterial(0x9aa3aa, { metalness: .4 });
    roundLattice(g, { r0: .085, r1: .034, y0: 0, y1: .5, rings: 20, sides: 9, radius: .0034, material: silver, flare: 2.3 });
    lmCyl(g, .07, .056, .03, silver, 0, .5, 0, 28);                          // Tembo Deck: a thick disc flaring outward
    lmCyl(g, .0705, .0705, .012, LM.glass, 0, .515, 0, 28);
    lmCyl(g, .056, .04, .016, silver, 0, .53, 0, 28);
    roundLattice(g, { r0: .036, r1: .03, y0: .546, y1: .6, rings: 5, sides: 9, radius: .003, material: silver });
    lmCyl(g, .05, .044, .024, silver, 0, .6, 0, 28);                          // Tembo Galleria
    lmCyl(g, .0505, .0505, .009, LM.glass, 0, .609, 0, 28);
    roundLattice(g, { r0: .03, r1: .02, y0: .624, y1: .72, rings: 8, sides: 8, radius: .0028, material: silver });
    roundLattice(g, { r0: .017, r1: .011, y0: .72, y1: .93, rings: 14, sides: 6, radius: .0022, material: silver });
    for (const y of [.76, .81, .86, .91]) lmCyl(g, .019, .019, .028, grey, 0, y, 0, 12);   // gain antenna sections
    lmCyl(g, .011, .013, .04, LM.white, 0, .93, 0, 12);
    lmCyl(g, .003, .011, .03, LM.white, 0, .97, 0, 10);
    return g;
  },
  sapporoTower() {
    const g = new THREE.Group();
    lmBox(g, .2, .06, .2, LM.concrete, 0, 0, 0);
    latticeTower(g, { base: .075, top: .03, height: .62, sections: 6, reds: LM.steelRed, whites: LM.white, radius: .006, y: .06 });
    lmBox(g, .12, .05, .12, LM.white, 0, .06 + .62 * .6, 0);
    lmCyl(g, .004, .008, .2, LM.steelRed, 0, .74, 0, 6);
    return g;
  },
  tsutenkaku() {
    const g = new THREE.Group();
    latticeTower(g, { base: .1, top: .045, height: .6, sections: 5, reds: LM.steelRed, whites: LM.white, radius: .007, y: .02 });
    lmBox(g, .14, .05, .14, LM.pale, 0, .5, 0);
    lmBox(g, .06, .24, .06, LM.white, 0, .6, 0);
    lmCyl(g, .004, .008, .1, LM.steelRed, 0, .87, 0, 6);
    return g;
  },
  kyotoTower() {
    const g = new THREE.Group();
    lmBox(g, .5, .13, .3, LM.concrete, 0, 0, 0);
    lmCyl(g, .06, .075, .62, LM.white, 0, .13, 0, 20);
    lmCyl(g, .09, .06, .07, LM.pale, 0, .72, 0, 20);
    lmCyl(g, .004, .018, .2, LM.steelRed, 0, .79, 0, 6);
    return g;
  },
  needleTower(o = {}) {   // N Seoul Tower / Busan Tower style: concrete shaft, round deck, mast
    const g = new THREE.Group();
    lmCyl(g, .018, .042, .72, LM.white, 0, 0, 0, 18);
    lmCyl(g, .06, .06, .045, LM.pale, 0, .6, 0, 20);
    lmCyl(g, .045, .06, .03, LM.white, 0, .64, 0, 20);
    lmCyl(g, .004, .014, .3, LM.steelRed, 0, .7, 0, 6);
    return g;
  },
  skyscraper(o = {}) {
    const g = new THREE.Group();
    const wide = o.width ?? .09;
    lmAdd(g, squareFrustum(wide * .55, wide, .86), LM[o.material ?? 'glass'], 0, .43, 0);
    lmAdd(g, squareFrustum(wide * .3, wide * .55, .07), LM.concrete, 0, .895, 0);
    lmCyl(g, .004, .009, .18, LM.steelRed, 0, .86, 0, 6);
    return g;
  },
  sky85() {   // Kaohsiung 85 Sky Tower: two broad legs with an open gap that merge into one tall slim shaft, crowned by a pyramid and spire
    const g = new THREE.Group();
    const darkGlass = lmMaterial(0x7d95aa, { map: TEXTURES.windows, metalness: .5, roughness: .28 });
    const midGlass = lmMaterial(0x8fa3b3, { map: TEXTURES.windows, metalness: .45, roughness: .3 });
    const stripe = lmMaterial(0xc6b79e, { roughness: .6 });
    const podiumWall = lmMaterial(0xe8c8b0, { map: TEXTURES.windows });
    lmBox(g, 1.15, .1, .55, podiumWall, 0, 0, 0);
    for (const side of [-1, 1]) {
      lmBox(g, .24, .55, .32, darkGlass, side * .25, .1, 0);
      lmBox(g, .06, .02, .32, LM.concrete, side * .25 + side * .09, .65, 0);
    }
    lmBox(g, .26, .42, .02, LM.black, 0, .1, -.1);
    lmBox(g, .74, .1, .32, darkGlass, 0, .6, 0);
    lmBox(g, .32, .82, .27, midGlass, 0, .7, 0);
    lmBox(g, .13, .82, .29, stripe, 0, .7, 0);
    lmBox(g, .34, .035, .29, LM.white, 0, 1.52, 0);
    lmAdd(g, squareFrustum(.012, .15, .13), lmMaterial(0x2e5b63, { metalness: .5, roughness: .3 }), 0, 1.555 + .065, 0);
    lmCyl(g, .003, .01, .2, LM.white, 0, 1.685, 0, 6);
    return g;
  },
  lotteTower() {   // slim tapering tower with a curved glass crown
    const g = new THREE.Group();
    lmAdd(g, new THREE.CylinderGeometry(.05, .1, .86, 28), LM.glass, 0, .43, 0);
    lmAdd(g, new THREE.CylinderGeometry(.018, .05, .12, 28), LM.glass, 0, .92, 0);
    lmAdd(g, new THREE.ConeGeometry(.018, .1, 12), LM.pale, 0, 1.03, 0);
    return g;
  },
  slabTower() {    // Seoul 63 Building: golden-glass slab with stepped ends
    const g = new THREE.Group();
    lmBox(g, .2, .84, .09, LM.goldGlass, 0, 0, 0);
    lmBox(g, .12, .1, .09, LM.goldGlass, 0, .84, 0);
    lmBox(g, .045, .08, .09, LM.goldGlass, 0, .94, 0);
    return g;
  },
  skyline() {      // Haeundae waterfront towers
    const g = new THREE.Group();
    [[-.3, .7], [-.15, 1], [.02, .85], [.18, .62], [.33, .8]].forEach(([x, h], i) => {
      lmBox(g, .09, h, .09, i % 2 ? LM.glass : LM.pale, x, 0, (i % 2) * .06);
      lmBox(g, .06, .05, .06, LM.concrete, x, h, (i % 2) * .06);
    });
    return g;
  },
  // ---- Japanese castles ----
  castle(o = {}) {
    const g = new THREE.Group();
    const wall = LM[o.wall ?? 'plaster'], roof = LM[o.roof ?? 'roofDark'];
    const baseHalf = o.baseHalf ?? .3;
    if (o.moat) lmCyl(g, .85, .85, .004, LM.water, 0, 0, 0, 28);
    lmAdd(g, squareFrustum(baseHalf * .62, baseHalf, o.baseH ?? .13), LM.stone, 0, (o.baseH ?? .13) / 2, 0);
    const keepY = o.baseH ?? .13;
    for (const annex of o.annexes ?? []) {
      lmBox(g, annex.link ?? .06, .035, .06, wall, annex.x * .5, keepY, annex.z * .5);
      castleKeep(g, { x: annex.x, z: annex.z, y: keepY, half: (o.half ?? .17) * (annex.scale ?? .55), tiers: annex.tiers ?? 3, wall, roof, tierH: .07, roofH: .045, shrink: .82, gold: false });
    }
    castleKeep(g, { y: keepY, half: o.half ?? .17, tiers: o.tiers ?? 5, wall, roof, tierH: .085, roofH: .055, gold: o.gold !== false });
    if (o.redBridge) {
      lmBox(g, .1, .018, .45, LM.vermilion, .15, 0, .66);
    }
    return g;
  },
  fairyCastle() {   // Tokyo Disneyland's Cinderella Castle
    const g = new THREE.Group();
    lmBox(g, .8, .3, .5, LM.pink, 0, 0, 0);
    for (const [x, z, r, h] of [[-.3, .18, .07, .62], [.3, .18, .07, .62], [-.3, -.18, .06, .5], [.3, -.18, .06, .5], [0, 0, .1, 1.0], [-.15, .0, .06, .7], [.15, 0, .06, .7]]) {
      lmCyl(g, r, r * 1.05, h * .7, LM.pink, x, 0, z, 14);
      lmAdd(g, new THREE.ConeGeometry(r * 1.25, h * .5, 14), LM.spireBlue, x, h * .7 + h * .25, z);
    }
    return g;
  },
  pavilion() {      // Kinkaku-ji: the three-storey Golden Pavilion — a wood-and-white shinden ground floor with a veranda, two gold-leaf storeys with balconies, dark-bark roofs and a golden phoenix — beside its mirror pond, with pines and rocks
    const g = new THREE.Group();
    const bark = lmMaterial(0x3a3128, { map: TEXTURES.tiles, roughness: .8 });
    const wood = lmMaterial(0x6b4a30, { map: TEXTURES.wood });
    lmCyl(g, .9, .9, .004, LM.water, 0, 0, 0, 32);
    lmBox(g, .58, .02, .38, LM.stone, 0, .004, 0);                                  // stone edge of the pond
    // ground floor: raised wooden veranda, dark posts, white wall panels
    lmBox(g, .5, .025, .32, wood, 0, .02, 0);
    lmBox(g, .42, .1, .26, LM.plaster, 0, .045, 0);
    for (let i = 0; i < 6; i++) lmBox(g, .018, .1, .018, wood, -.2 + i * .08, .045, .14);
    lmBox(g, .52, .012, .34, wood, 0, .06, 0).visible = false;
    lmHip(g, .12, .3, .045, bark, 0, .145, 0, .78);
    // second storey: gold, with a balcony rail all around
    lmBox(g, .32, .11, .22, LM.gold, 0, .185, 0);
    lmBox(g, .38, .012, .26, LM.gold, 0, .185, 0);
    for (let i = 0; i < 12; i++) { const t = i / 12; lmBox(g, .008, .026, .008, LM.gold, -.19 + t * .38, .197, .125); lmBox(g, .008, .026, .008, LM.gold, -.19 + t * .38, .197, -.125); }
    lmHip(g, .09, .24, .04, bark, 0, .295, 0, .78);
    // third storey: a smaller gold hall with its own balcony
    lmBox(g, .22, .09, .15, LM.gold, 0, .335, 0);
    lmBox(g, .27, .01, .19, LM.gold, 0, .335, 0);
    lmHip(g, .015, .19, .065, bark, 0, .425, 0, .78);
    lmAdd(g, new THREE.OctahedronGeometry(.022), LM.gold, 0, .52, 0);               // phoenix finial
    lmCyl(g, .004, .006, .035, LM.gold, 0, .49, 0, 6);
    // garden pines and rocks around the pond
    for (const [x, z, sc] of [[-.45, .15, 1.5], [.5, .1, 1.7], [.4, -.3, 1.3], [-.3, -.35, 1.2], [.0, -.5, 1.4], [-.55, -.1, 1.1]]) gardenPine(g, x, z, sc);
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; lmAdd(g, new THREE.SphereGeometry(.03, 7, 5), LM.rock, Math.cos(a) * .72, .01, Math.sin(a) * .62).scale.y = .6; }
    return g;
  },
  // ---- Shrines & temples ----
  toriiGreat() {    // Itsukushima's Great Torii: two tapered main pillars, each braced by a pair of lower pillars with their own small caps, under a broad upswept black-and-blue-green copper roof, standing in the sea
    const g = new THREE.Group();
    const vermilion = lmMaterial(0xe2441e), blackCap = lmMaterial(0x2a241f), copper = lmMaterial(0x4f9b9a, { map: TEXTURES.tiles, roughness: .5 });
    const pink = lmMaterial(0xd9a597);
    lmCyl(g, 1.2, 1.2, .004, LM.water, 0, 0, 0, 32);
    const span = .5, height = .62;
    for (const side of [-1, 1]) {
      const x = side * span / 2;
      lmCyl(g, .062, .07, .05, pink, x, .0, 0, 12);                                      // stone-coloured footing in the water
      lmCyl(g, .034, .062, .5, vermilion, x, .05, 0, 14);                                // tapered main pillar
      lmCyl(g, .028, .034, .1, vermilion, x, .54, 0, 14);
      for (const dz of [-1, 1]) {                                                         // the two bracing pillars, set diagonally so they show from every side
        const z = dz * .12, bx = x + dz * side * -.12;
        lmCyl(g, .026, .03, .04, pink, bx, 0, z, 10);
        lmCyl(g, .02, .026, .3, vermilion, bx, .04, z, 10);
        lmBox(g, .075, .014, .075, blackCap, bx, .34, z);                                 // small cap
        lmBox(g, Math.abs(bx - x) + .02, .018, .02, vermilion, (bx + x) / 2, .2, z * .5); // tie beam to the main pillar
        lmBox(g, .02, .018, .12, vermilion, bx, .2, z * .5);
      }
    }
    // crossbeams and the plaque
    lmBox(g, span + .2, .035, .05, vermilion, 0, .46, 0);                                // nuki
    lmBox(g, span + .12, .04, .06, vermilion, 0, .595, 0);                               // shimaki
    lmBox(g, .08, .09, .014, lmMaterial(0x14223a), 0, .52, .03);                         // blue plaque
    lmBox(g, .09, .008, .016, LM.gold, 0, .565, .03);
    // the broad, upswept roof: a black timber base with blue-green copper over it, ends flicking upward
    lmAdd(g, curvedBeam(span * 1.55, .03, .14, .07), blackCap, 0, .645, 0);                // dark timber base, tips lifted
    lmAdd(g, curvedBeam(span * 1.58, .014, .17, .07), copper, 0, .672, 0);                  // blue-green copper cover
    return g;
  },
  toriiRow() {      // Fushimi Inari: a dense tunnel of vermilion gates — black bases and caps, double crossbeams and a gold plaque on the first — winding through cedar forest
    const g = new THREE.Group();
    const orange = lmMaterial(0xe0481f), blackCap = lmMaterial(0x1d1a18);
    lmBox(g, 1.1, .004, 2.2, lmMaterial(0xb9b2a4), 0, 0, -.2);                         // stone path
    const gate = (z, span, height, plaque) => {
      for (const side of [-1, 1]) {
        lmCyl(g, .026, .028, .04, blackCap, side * span / 2, .004, z, 10);              // black base
        lmCyl(g, .022, .024, height, orange, side * span / 2, .044, z, 10);
      }
      lmBox(g, span + .22, .02, .08, blackCap, 0, height + .05, z);                      // black kasagi
      lmBox(g, span + .16, .035, .07, orange, 0, height + .015, z);                      // shimaki
      lmBox(g, span + .2, .035, .05, orange, 0, height * .72, z);                        // nuki crossbeam, projecting past the pillars
      if (plaque) lmBox(g, .05, .075, .012, LM.gold, 0, height * .84, z + .03);
    };
    for (let i = 0; i < 18; i++) gate(i * .11 - .9, .3, .5, i === 17);
    for (let i = 0; i < 14; i++) for (const side of [-1, 1]) treeAt(g, { x: side * (.6 + (i % 3) * .12), z: -.95 + i * .15, height: .9 + (i % 4) * .1, girth: .035 });
    return g;
  },
  daibutsuden() {   // Todai-ji's Great Buddha Hall: a huge two-tier hip roof of grey tile with gold chiwei horns on the ridge, dark timber storeys with pale infill panels and bracketed eaves, the green-copper karahafu gable over the entrance, broad stairs, the bronze lantern and side corridors
    const g = new THREE.Group();
    const tile = lmMaterial(0x4a4e55, { map: TEXTURES.tiles, roughness: .6 });
    const timber = lmMaterial(0xcfc7b4, { map: TEXTURES.timber });
    const gold = LM.gold, copper = lmMaterial(0x4f9a82, { roughness: .45 });
    const dark = lmMaterial(0x3b2a20);
    // plaza and platform with the three flights of steps
    lmBox(g, 2.4, .01, 1.6, lmMaterial(0xc9c9c2), 0, 0, .3);
    lmBox(g, 1.5, .07, .62, LM.stone, 0, .01, 0);
    for (let s = 0; s < 7; s++) lmBox(g, .5, .01, .06, LM.stone, 0, .01 + s * .01, .46 - s * .05);
    // lower storey and its wide skirt roof
    lmBox(g, 1.3, .26, .46, timber, 0, .08, 0);
    lmBox(g, 1.34, .02, .5, dark, 0, .1, 0);
    lmHip(g, .46, .8, .1, tile, 0, .34, 0, .58);
    // karahafu: the curved gable over the central entrance
    lmBox(g, .22, .1, .05, dark, 0, .28, .27);
    const arch = lmAdd(g, new THREE.CylinderGeometry(.14, .14, .06, 12, 1, true, 0, Math.PI), copper, 0, .37, .28); arch.rotation.set(Math.PI / 2, 0, Math.PI / 2); arch.scale.set(1, 1, .6);
    lmBox(g, .3, .006, .07, gold, 0, .33, .29);
    // upper storey and the great roof
    lmBox(g, 1.0, .24, .34, timber, 0, .42, 0);
    lmBox(g, 1.04, .02, .38, dark, 0, .435, 0);
    lmHip(g, .2, .66, .24, tile, 0, .66, 0, .54);
    for (const side of [-1, 1]) {                                                       // gold chiwei at both ridge ends
      const horn = lmAdd(g, new THREE.TorusGeometry(.035, .01, 6, 12, Math.PI * 1.3), gold, side * .2, .9, 0);
      horn.rotation.set(0, 0, side > 0 ? Math.PI * .15 : Math.PI * .55);
    }
    // bronze lantern and the low corridors beside the hall
    lmCyl(g, .018, .02, .09, lmMaterial(0x4b7a66, { metalness: .4 }), 0, .01, .78, 8);
    lmAdd(g, new THREE.SphereGeometry(.03, 8, 6), lmMaterial(0x4b7a66, { metalness: .4 }), 0, .11, .78);
    for (const side of [-1, 1]) {
      lmBox(g, .5, .1, .12, lmMaterial(0xece7da), side * 1.0, .02, .15);
      lmHip(g, .16, .32, .04, tile, side * 1.0, .12, .15, .4);
      for (let i = 0; i < 6; i++) lmBox(g, .01, .1, .01, LM.vermilion, side * 1.0 - .22 + i * .09, .02, .22);
    }
    for (const side of [-1, 1]) lmBox(g, .55, .025, .05, lmMaterial(0x2f7a35), side * .65, .01, .92);   // hedges
    return g;
  },
  kiyomizu() {      // Kiyomizu-dera: the main hall with its famous stage on a lattice of pillars, under a broad cypress-bark roof, and the five-storey timber pagoda of the Higashiyama skyline behind
    const g = new THREE.Group();
    const bark = lmMaterial(0x4b3a2b, { map: TEXTURES.tiles, roughness: .85 });
    const stageH = .22;
    for (let i = 0; i < 8; i++) for (let j = 0; j < 3; j++) lmCyl(g, .012, .014, stageH, LM.wood, -.24 + i * .068, 0, .3 + j * .08, 6);
    for (const y of [.07, .14]) lmBox(g, .5, .01, .22, LM.wood, 0, y, .38);       // cross-bracing of the pillar lattice
    lmBox(g, .52, .02, .3, LM.wood, 0, stageH, .36);
    lmBox(g, .66, .02, .42, LM.stone, 0, stageH, -.05);
    lmBox(g, .6, .16, .34, LM.vermilion, 0, stageH + .02, -.05);                                   // main hall walls
    for (let i = 0; i < 7; i++) lmBox(g, .02, .16, .02, LM.wood, -.29 + i * .097, stageH + .02, .125);
    for (const x of [-.18, 0, .18]) lmBox(g, .12, .09, .008, LM.white, x, stageH + .05, .124);
    lmBox(g, .66, .02, .4, LM.black, 0, stageH + .18, -.05);
    lmHip(g, .22, .46, .07, bark, 0, stageH + .2, -.05, .75);                                      // hipped skirt
    gableAt(g, { x: 0, y: stageH + .27, z: -.05, width: .34, height: .1, depth: .5, material: bark, yaw: Math.PI / 2 });   // the gabled upper roof
    for (const sx of [-1, 1]) gableAt(g, { x: sx * .25, y: stageH + .27, z: -.05, width: .27, height: .09, depth: .01, material: LM.plaster, yaw: Math.PI / 2 });
    // five-tier dark timber pagoda with a tall ringed finial
    let y = 0, w = .09;
    lmBox(g, w * 2.4, .03, w * 2.4, LM.stone, .62, 0, -.2); y = .03;
    const woodDark = lmMaterial(0x3a2a20, { map: TEXTURES.wood });
    for (let i = 0; i < 5; i++) {
      lmBox(g, w * 1.5, .075, w * 1.5, woodDark, .62, y, -.2);
      lmHip(g, w * .5, w * 1.5, .035, bark, .62, y + .075, -.2, 1);
      y += .105; w *= .9;
    }
    lmCyl(g, .004, .006, .16, LM.gold, .62, y - .02, -.2, 6);
    for (let k = 0; k < 6; k++) lmCyl(g, .014 - k * .001, .014 - k * .001, .006, LM.gold, .62, y + .0 + k * .02, -.2, 8);
    return g;
  },
  sensoji() {       // Sensō-ji: the Kaminarimon gate (red columns, wide grey-tiled roof, the great red lantern and guardian alcoves), five-storey pagoda and main hall
    const g = new THREE.Group();
    const gz = .85;
    lmBox(g, 1.0, .03, .44, LM.stone, 0, 0, gz);
    // four red columns on black bases, an upper beam stack with white and green panels
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      lmCyl(g, .026, .026, .02, LM.black, sx * .4, .03, gz + sz * .15, 10);
      lmCyl(g, .022, .022, .26, LM.vermilion, sx * .4, .05, gz + sz * .15, 10);
    }
    for (const x of [-.16, .16]) for (const sz of [-1, 1]) lmCyl(g, .02, .02, .26, LM.vermilion, x, .05, gz + sz * .15, 10);
    lmBox(g, 1.02, .035, .42, LM.vermilion, 0, .31, gz);                           // beam stack under the eaves
    lmBox(g, .96, .045, .43, LM.white, 0, .345, gz);                                // white panel band
    lmBox(g, .96, .016, .434, lmMaterial(0x2f7a5a), 0, .36, gz);                    // green decorative band
    lmBox(g, 1.04, .025, .44, LM.vermilion, 0, .39, gz);
    lmHip(g, .42, .66, .1, LM.roofDark, 0, .415, gz, .52);                           // wide grey-tiled roof
    for (const sx of [-1, 1]) lmBox(g, .035, .05, .035, LM.roofDark, sx * .43, .5, gz);
    // the great lantern and the sign above it
    const lantern = lmAdd(g, new THREE.SphereGeometry(.075, 16, 12), LM.lantern, 0, .18, gz + .0);
    lantern.scale.set(1, 1.35, 1);
    lmCyl(g, .04, .04, .014, LM.black, 0, .275, gz, 14);
    lmCyl(g, .04, .04, .014, LM.black, 0, .085, gz, 14);
    lmBox(g, .2, .05, .02, lmMaterial(0x24604a), 0, .31, gz + .21);
    lmBox(g, .21, .008, .022, LM.gold, 0, .35, gz + .21);
    // the two guardian-statue alcoves with their mesh screens, and the white signboards on brick bases
    for (const sx of [-1, 1]) {
      lmBox(g, .2, .2, .03, lmMaterial(0x4a3426), sx * .27, .05, gz + .12);
      lmBox(g, .07, .12, .02, LM.gold, sx * .27, .09, gz + .105);
      lmBox(g, .13, .1, .03, LM.brick, sx * .27, .05, gz + .22);
      lmBox(g, .12, .08, .012, LM.white, sx * .27, .11, gz + .232);
    }
    hallAt(g, { z: 0, w: .8, d: .45, wall: LM.vermilion, roof: LM.roofDark, roofH: .18, double: true });
    pagodaAt(g, { x: -.75, z: .1, half: .12, levels: 5 });
    return g;
  },
  toshogu() {       // Nikko Toshogu: the Yomeimon gate — white carved pillars, gilded bracket layers, a black-and-gold balcony with railing, a curved gilt-edged roof — up a flight of steps between stone balustrades, with side roofs, the five-storey pagoda and the shrine hall
    const g = new THREE.Group();
    const gold = LM.gold, black = lmMaterial(0x191614), white = lmMaterial(0xf4f1e8);
    const tile = lmMaterial(0x30343a, { map: TEXTURES.tiles });
    const gz = .6;
    lmBox(g, .8, .06, .5, LM.stone, 0, 0, gz);
    for (let s = 0; s < 8; s++) lmBox(g, .38, .0075, .05, LM.stone, 0, .06 + s * .0075, gz + .35 - s * .05);   // the steps up to the gate
    for (const side of [-1, 1]) { lmBox(g, .035, .06, .5, lmMaterial(0x6f6a60), side * .3, .06, gz + .0); lmBox(g, .02, .012, .5, LM.stone, side * .3, .12, gz); }
    // lower storey: four white pillars with gold collars, white carved panels, gilded lintel
    for (const x of [-.24, -.08, .08, .24]) {
      lmCyl(g, .022, .022, .15, white, x, .06, gz + .13, 10);
      lmBox(g, .05, .018, .05, gold, x, .2, gz + .13);
      lmCyl(g, .022, .022, .15, white, x, .06, gz - .13, 10);
    }
    for (const x of [-.16, 0, .16]) lmBox(g, .12, .035, .012, gold, x, .17, gz + .15);
    lmBox(g, .62, .035, .3, gold, 0, .215, gz);
    lmBox(g, .6, .03, .28, black, 0, .25, gz);                                                  // bracket layer (dark and gilded)
    for (let i = 0; i < 12; i++) lmBox(g, .024, .02, .024, gold, -.26 + i * .047, .252, gz + .15);
    // balcony with a gold-and-black railing
    lmBox(g, .66, .012, .34, black, 0, .28, gz);
    for (let i = 0; i < 14; i++) lmBox(g, .01, .03, .01, gold, -.3 + i * .046, .292, gz + .17);
    lmBox(g, .64, .008, .01, black, 0, .322, gz + .17);
    // upper storey: dark with gold fittings, a second bracket layer, then the swept roof
    lmBox(g, .5, .07, .2, black, 0, .292, gz);
    for (const x of [-.18, -.06, .06, .18]) lmBox(g, .02, .07, .012, gold, x, .292, gz + .102);
    lmBox(g, .64, .03, .3, gold, 0, .362, gz);
    lmHip(g, .08, .38, .095, tile, 0, .392, gz, .6);
    for (let i = 0; i < 3; i++) lmBox(g, .66 - i * .06, .008, .008, gold, 0, .396 + i * .012, gz + .3 - i * .02);   // gilt eave edge
    lmAdd(g, new THREE.SphereGeometry(.018, 10, 8), gold, 0, .5, gz);
    // the carving: white relief panels in gilded frames, guardian beasts on the pillar tops, bracket sets under the eaves and the balcony, corner ornaments
    const bracketColours = [gold, black, lmMaterial(0xb07a2a)];
    for (const x of [-.24, -.16, -.08, 0, .08, .16, .24]) {
      lmBox(g, .062, .05, .012, gold, x, .125, gz + .152);
      lmBox(g, .048, .036, .014, white, x, .132, gz + .153);
      lmBox(g, .02, .014, .016, gold, x, .14, gz + .154);
    }
    for (const x of [-.24, -.08, .08, .24]) {
      lmAdd(g, new THREE.SphereGeometry(.02, 8, 6), white, x, .222, gz + .14);                               // guardian beast heads
      lmBox(g, .014, .02, .02, gold, x, .205, gz + .165);
      lmAdd(g, new THREE.ConeGeometry(.009, .03, 5), white, x + .018, .235, gz + .14).rotation.z = -.5;
    }
    for (let row = 0; row < 3; row++) for (let i = 0; i < 24; i++) {                                         // dense bracket sets
      const x = -.29 + i * .0255, y = .232 + row * .012;
      lmBox(g, .016 + (i % 2) * .006, .01, .02 + row * .012, bracketColours[(i + row) % 3], x, y, gz + .152 + row * .006);
    }
    for (let i = 0; i < 26; i++) lmBox(g, .01, .014, .03, bracketColours[i % 3], -.31 + i * .0245, .348, gz + .13 + (i % 2) * .01);   // upper bracket ends
    for (const sx of [-1, 1]) {
      lmAdd(g, new THREE.ConeGeometry(.012, .05, 5), gold, sx * .3, .45, gz + .1).rotation.z = -sx * .5;       // gilded corner finials
      lmBox(g, .05, .012, .05, gold, sx * .3, .43, gz + .1);
    }
    lmBox(g, .09, .035, .014, gold, 0, .385, gz + .22);                                                       // the central gilded gable plaque
    lmBox(g, .06, .022, .016, white, 0, .391, gz + .222);
    // low side roofs with red walls
    for (const side of [-1, 1]) {
      lmBox(g, .3, .1, .26, LM.vermilion, side * .5, .06, gz);
      lmHip(g, .06, .2, .05, tile, side * .5, .17, gz, .8);
    }
    hallAt(g, { z: -.4, w: .55, d: .3, wall: LM.gold, roof: tile, roofH: .13, double: false });
    pagodaAt(g, { x: 1.05, z: .1, half: .08, levels: 5, wall: LM.vermilion, roof: LM.roofDark });
    return g;
  },
  shuri() {         // Shuri Castle seiden: red hall with a double roof on a white stone terrace
    const g = new THREE.Group();
    lmBox(g, 1.3, .06, .8, LM.whiteRock, 0, 0, 0);
    hallAt(g, { y: .06, w: .8, d: .42, wall: LM.vermilion, roof: LM.roofRed, roofH: .2, gold: true, platformH: .02 });
    return g;
  },
  buddha(o = {}) {  // seated Buddha: folded legs, tapering robe, round head with a topknot (bronze or gold)
    const g = new THREE.Group();
    const mat = LM[o.material ?? 'bronze'];
    lmCyl(g, .36, .42, .1, LM.stone, 0, 0, 0, 16);
    const profile = [[.001, 0], [.3, 0], [.31, .06], [.25, .22], [.2, .38], [.17, .5], [.1, .58], [.07, .62], [.001, .63]].map(([x, y]) => new THREE.Vector2(x, y));
    const torso = lmAdd(g, new THREE.LatheGeometry(profile, 18), mat, 0, .1, 0);
    torso.scale.z = .8;
    const legs = lmAdd(g, new THREE.SphereGeometry(.28, 16, 10), mat, 0, .15, .1);
    legs.scale.set(1.2, .4, .95);
    for (const side of [-1, 1]) {
      const shoulder = lmAdd(g, new THREE.SphereGeometry(.09, 10, 8), mat, side * .19, .52, 0);
      shoulder.scale.set(1, 1.2, .9);
      lmAdd(g, new THREE.BoxGeometry(.03, .07, .02), mat, side * .12, .73, .02);   // ears
    }
    lmAdd(g, new THREE.SphereGeometry(.105, 16, 12), mat, 0, .73, .02);
    lmAdd(g, new THREE.SphereGeometry(.05, 10, 8), mat, 0, .83, .02);
    lmBox(g, .2, .035, .14, mat, 0, .3, .2);   // hands in lap
    if (o.pagodas) for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; pagodaAt(g, { x: Math.cos(a) * 1.0, z: Math.sin(a) * 1.0, half: .07, levels: 3, wall: LM.goldGlass, roof: LM.gold }); }
    return g;
  },
  dome() {          // Genbaku Dome (Hiroshima): the ruined central tower with its drum of arched openings and bare steel-ribbed dome, the gutted brick wings with empty window frames, a curved colonnade wing, a stone entrance projection, fence and hedge
    const g = new THREE.Group();
    const concrete = lmMaterial(0xa7a49a), brickRuin = lmMaterial(0xa65a45, { map: TEXTURES.brick }), hole = lmMaterial(0x1c1b1a);
    const steel = lmMaterial(0x5a3d33, { metalness: .5, roughness: .7 });
    lmBox(g, 1.7, .03, .8, lmMaterial(0xb3ad9f), 0, 0, 0.1);
    lmBox(g, .62, .1, .4, lmMaterial(0x9d9a90, { map: TEXTURES.stone }), -.05, .03, .2);                // stone entrance projection
    lmBox(g, .66, .03, .42, concrete, -.05, .13, .2);
    // the central tower: stone-faced, three storeys of empty windows, then the drum and dome
    lmBox(g, .34, .66, .3, concrete, -.05, .03, -.02);
    for (let row = 0; row < 3; row++) for (const x of [-.14, .03]) lmBox(g, .08, .12, .006, hole, x, .2 + row * .18, .15);
    for (const x of [-.19, .09]) lmBox(g, .05, .66, .05, concrete, x, .03, .16);                          // pilasters
    lmBox(g, .38, .03, .34, concrete, -.05, .69, -.02);
    const drum = lmCyl(g, .17, .17, .12, concrete, -.05, .72, -.02, 20);
    for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; lmBox(g, .035, .08, .012, hole, -.05 + Math.cos(a) * .17, .74, -.02 + Math.sin(a) * .17, -a + Math.PI / 2); }
    for (let k = 0; k < 10; k++) {                                                                       // bare steel ribs of the dome
      const rib = lmAdd(g, new THREE.TorusGeometry(.17, .005, 5, 14, Math.PI), steel, -.05, .84, -.02);
      rib.rotation.y = k / 10 * Math.PI;
    }
    for (const r of [.14, .1, .05]) lmAdd(g, new THREE.TorusGeometry(r, .004, 5, 16), steel, -.05, .84 + Math.sqrt(.17 ** 2 - r ** 2), -.02).rotation.x = Math.PI / 2;
    // the right wing: brick walls with empty window frames and a broken, stepped top
    lmBox(g, .62, .4, .14, brickRuin, .42, .03, -.02);
    for (let row = 0; row < 2; row++) for (const x of [.28, .5]) lmBox(g, .11, .12, .016, hole, x, .11 + row * .17, .06);
    lmBox(g, .2, .1, .14, brickRuin, .62, .43, -.02);
    lmBox(g, .12, .05, .14, brickRuin, .3, .43, -.02);
    lmBox(g, .1, .14, .14, brickRuin, .5, .43, -.02);
    for (const [x, y] of [[.28, .11], [.5, .11], [.28, .28], [.5, .28]]) {                       // white window frames round the empty openings
      lmBox(g, .125, .012, .018, LM.white, x, y + .115, .066); lmBox(g, .125, .012, .018, LM.white, x, y - .005, .066);
    }
    // the left wing: a curved colonnade of bare concrete columns with broken floor slabs, a stub of brick wall behind
    for (let i = 0; i < 12; i++) {
      const a = Math.PI * (.55 + i * .075), x = -.62 + Math.cos(a) * .46, z = -.02 + Math.sin(a) * .3;
      lmBox(g, .032, .3, .032, concrete, x, .03, z);
      if (i < 11) {
        const b = Math.PI * (.55 + (i + .5) * .075), mx = -.62 + Math.cos(b) * .46, mz = -.02 + Math.sin(b) * .3;
        for (const y of [.17, .33]) if ((i + (y > .2 ? 1 : 0)) % 4 !== 3) lmBox(g, .09, .02, .05, concrete, mx, y, mz, -b + Math.PI / 2);
      }
    }
    lmBox(g, .18, .26, .03, brickRuin, -.86, .03, -.05);
    // fence and hedge in front
    lmBox(g, 1.7, .05, .06, lmMaterial(0x6c9a30), 0, .0, .58);
    for (let i = 0; i < 34; i++) lmBox(g, .006, .05, .006, LM.black, -.84 + i * .05, .0, .54);
    return g;
  },
  gassho() {        // Shirakawa-go: steep thatched farmhouses among rice fields
    const g = new THREE.Group();
    lmBox(g, 2.2, .004, 1.3, LM.green, 0, 0, 0);
    [[-.7, .1, .2], [-.25, -.25, -.1], [.2, .15, .3], [.65, -.2, -.2], [.05, -.45, .1]].forEach(([x, z, yaw]) => {
      lmBox(g, .26, .12, .36, LM.wood, x, 0, z, yaw);
      lmAdd(g, new THREE.CylinderGeometry(0, .27, .42, 4).rotateY(Math.PI / 4).scale(1, 1, 1.3), LM.thatch, x, .33, z, yaw);
    });
    return g;
  },
  fort(o = {}) {    // Goryokaku: star fort with its observation tower
    const g = new THREE.Group();
    const star = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const radius = i % 2 ? .9 : 1.6, angle = i / 10 * Math.PI * 2;
      const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
      if (i) star.lineTo(x, y); else star.moveTo(x, y);
    }
    const ring = lmAdd(g, new THREE.ExtrudeGeometry(star, { depth: .03, bevelEnabled: false }), LM.green, 0, 0, 0);
    ring.rotation.x = -Math.PI / 2;
    const moat = lmAdd(g, new THREE.ExtrudeGeometry(star, { depth: .004, bevelEnabled: false }), LM.water, 0, -.005, 0);
    moat.rotation.x = -Math.PI / 2;
    moat.scale.set(1.12, 1.12, 1);
    lmCyl(g, .05, .09, .78, LM.pale, 0, .03, 0, 4).rotation.y = Math.PI / 4;
    lmCyl(g, .12, .1, .06, LM.glass, 0, .8, 0, 12);
    lmCyl(g, .003, .01, .14, LM.steelRed, 0, .86, 0, 6);
    return g;
  },
  bridge(o = {}) { const g = new THREE.Group(); suspensionBridge(g, { span: o.span ?? 2, doubleDeck: o.doubleDeck, pylon: 1 }); return g; },
  tree(o = {}) { const g = new THREE.Group(); treeAt(g, { height: 1, girth: o.girth ?? .09 }); for (let i = 0; i < (o.extra ?? 0); i++) { const a = i * 2.4; treeAt(g, { x: Math.cos(a) * (.25 + i * .06), z: Math.sin(a) * (.25 + i * .06), height: .75 + (i % 3) * .1, girth: (o.girth ?? .09) * .8 }); } return g; },
  alishan() {       // Alishan: tall cypress forest on a green slope with the narrow-gauge Forest Railway steam train (black locomotive, red carriages) curving past
    const g = new THREE.Group();
    let seed = 11;
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const grass = lmMaterial(0x6fb23a), cedar = lmMaterial(0x2c6b3a), cedar2 = lmMaterial(0x3a7d3f);
    const railRadius = .55, railArc = [Math.PI * .08, Math.PI * .78];
    // green slope behind and below
    lmAdd(g, new THREE.SphereGeometry(1.1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), grass, 0, -.02, 0).scale.set(1, .04, 1);
    // tall slender cedars on both sides of the track
    for (let i = 0; i < 26; i++) {
      const angle = random() * Math.PI * 2, d = random() < .5 ? .15 + random() * .28 : .75 + random() * .35;
      const height = .75 + random() * .35, girth = .018 + random() * .012;
      const x = Math.cos(angle) * d, z = Math.sin(angle) * d;
      lmCyl(g, girth * .6, girth, height * .75, LM.trunk, x, 0, z, 6);
      for (let k = 0; k < 4; k++) lmAdd(g, new THREE.ConeGeometry(girth * (7 - k * 1.4), height * .3, 7), k % 2 ? cedar : cedar2, x, height * (.35 + k * .17) + height * .12, z);
    }
    // curved track: two rails on sleepers
    const pointAt = (t) => ({ x: Math.cos(t) * railRadius, z: Math.sin(t) * railRadius });
    const steps = 46;
    for (let i = 0; i < steps; i++) {
      const t = railArc[0] + (railArc[1] - railArc[0]) * i / steps, p = pointAt(t);
      const yaw = -t - Math.PI / 2;
      lmBox(g, .06, .004, .012, LM.trunk, p.x, .004, p.z, yaw);
      for (const side of [-1, 1]) lmBox(g, .006, .006, .03, LM.stone, p.x + Math.cos(t) * side * .02, .008, p.z + Math.sin(t) * side * .02, yaw);
    }
    // the train: locomotive at the head, then three red carriages with window rows and grey roofs
    const red = lmMaterial(0xd42a22), roofGrey = lmMaterial(0x5a5f66), windows = lmMaterial(0xe8eef2, { map: TEXTURES.windows });
    const black = lmMaterial(0x15181b, { metalness: .3 });
    const place = (tCentre, build) => { const p = pointAt(tCentre); const holder = new THREE.Group(); holder.position.set(p.x, .03, p.z); holder.scale.setScalar(1.8); holder.rotation.y = -tCentre - Math.PI / 2; g.add(holder); build(holder); };
    const headT = railArc[0] + .38;
    place(headT, (h) => {   // locomotive (local +z points back along the train? the local x axis follows the track)
      lmBox(h, .075, .05, .04, black, 0, .012, 0);                 // frame and cab
      lmBox(h, .03, .036, .04, black, -.03, .062, 0);
      const boiler = lmCyl(h, .02, .02, .08, black, .02, .02, 0, 12); boiler.rotation.z = Math.PI / 2; boiler.position.y = .058;
      lmCyl(h, .008, .01, .028, black, .045, .075, 0, 8);          // smokestack
      lmBox(h, .08, .006, .046, roofGrey, -.03, .098, 0);
      lmAdd(h, new THREE.CylinderGeometry(.011, .011, .004, 14), LM.white, .062, .056, 0).rotation.z = Math.PI / 2;
    });
    for (let i = 0; i < 3; i++) place(headT - .17 - i * .15, (h) => {
      lmBox(h, .13, .048, .042, red, 0, .014, 0);
      lmBox(h, .122, .026, .043, windows, 0, .03, 0);
      lmBox(h, .134, .008, .046, roofGrey, 0, .062, 0);
    });
    return g;
  },
  aquarium() {      // Churaumi: long low white halls with a curved roof and the big blue tank window
    const g = new THREE.Group();
    lmBox(g, 1.3, .24, .5, LM.white, 0, 0, 0);
    lmBox(g, .56, .15, .02, LM.aqua, -.2, .05, .26);
    const wave = lmAdd(g, new THREE.CylinderGeometry(.2, .2, .9, 14, 1, false, 0, Math.PI), LM.concrete, .1, .24, 0);
    wave.rotation.z = Math.PI / 2; wave.rotation.y = 0;
    wave.scale.set(1, 1, 1.5);
    lmBox(g, .4, .1, .4, LM.pale, .5, .24, 0);
    return g;
  },
  // ---- Taiwan ----
  cks() {           // Chiang Kai-shek Memorial Hall: white hall with a tall arched doorway under an octagonal two-tier blue roof, three flights of stairs between long white balustrade wings
    const g = new THREE.Group();
    const navy = stdMaterial({ color: 0x1b2a6e, roughness: .55, metalness: .1 });
    const grey = lmMaterial(0xb8b8b2);
    const orange = lmMaterial(0xe0791f, { roughness: .45 });
    // long low terrace with balustrade wings either side
    lmBox(g, 2.6, .08, 1.0, LM.white, 0, 0, 0);
    for (const side of [-1, 1]) {
      lmBox(g, .95, .2, .46, LM.white, side * .88, .08, -.1);
      lmBox(g, .97, .035, .5, LM.white, side * .88, .28, -.1);
      for (let i = 0; i < 12; i++) lmBox(g, .022, .04, .025, LM.white, side * .88 - .44 + i * .08, .315, .13);
    }
    // main hall: slightly battered white walls, the central arch, and a deep cornice
    lmAdd(g, squareFrustum(.34, .4, .5), LM.white, 0, .08 + .25, -.08);
    lmBox(g, .86, .03, .8, LM.white, 0, .58, -.08);
    lmBox(g, .22, .24, .03, LM.black, 0, .08, .32);
    lmAdd(g, new THREE.CircleGeometry(.11, 20, 0, Math.PI), LM.black, 0, .32, .318);
    lmBox(g, .05, .07, .02, stdMaterial({ color: 0x8a3a30 }), 0, .48, .32);   // red plaque under the roof
    // three flights of stairs: a pale centre flight between two grey side flights
    for (let step = 0; step < 9; step++) {
      const z = .45 + (8 - step) * .06 - .06 * 8 + .06 * 0;
      lmBox(g, .34, .0089, .06, LM.white, 0, step * .0089, .62 - step * .06);
      for (const side of [-1, 1]) lmBox(g, .3, .0089, .06, grey, side * .38, step * .0089, .62 - step * .06);
    }
    for (const x of [-.55, -.2, .2, .55]) lmBox(g, .02, .06, .5, LM.white, x, .08, .36 + .0);   // stair side walls
    // octagonal blue roof, two tiers, with white eave trim and the orange finial
    lmCyl(g, .47, .47, .018, LM.white, 0, .61, -.08, 8);
    lmAdd(g, octagonRoof(.5, .22, .14), navy, 0, .63, -.08);
    lmCyl(g, .3, .3, .016, LM.white, 0, .77, -.08, 8);
    lmAdd(g, octagonRoof(.32, .06, .12), navy, 0, .786, -.08);
    lmCyl(g, .018, .03, .04, LM.white, 0, .9, -.08, 8);
    lmAdd(g, new THREE.SphereGeometry(.045, 14, 10), orange, 0, .975, -.08);
    // rows of flag poles on the lawns
    for (const side of [-1, 1]) for (let i = 0; i < 7; i++) {
      const x = side * (.5 + i * .3), z = 1.05;
      lmCyl(g, .004, .004, .22, LM.white, x, 0, z, 5);
      lmBox(g, .06, .035, .004, stdMaterial({ color: 0xd42a2a }), x + .032, .18, z);
    }
    return g;
  },
  palaceMuseum() {  // National Palace Museum: stepped masses of cream wall under teal glazed roofs, gold ridges and corner ornaments, white balustrade
    const g = new THREE.Group();
    const wall = lmMaterial(0xe8d6a6, { map: TEXTURES.windows });
    const plain = lmMaterial(0xe8d6a6);
    const teal = lmMaterial(0x3aa596, { map: TEXTURES.tiles });
    const bracket = lmMaterial(0x2a8277);
    const gold = LM.gold;
    // a teal roof with gold ridge, gold corner ornaments, and the dark bracket band under the eaves
    const roof = (x, y, z, halfBottom, halfTop, h, stretch) => {
      lmBox(g, halfBottom * 1.82, .035, halfBottom * 2 * stretch * .9, bracket, x, y - .035, z);
      lmBox(g, halfBottom * 1.7, .012, halfBottom * 1.9 * stretch * .8, LM.white, x, y - .047, z);   // white cornice line
      lmHip(g, halfTop, halfBottom, h, teal, x, y, z, stretch);
      lmBox(g, halfTop * 2 + .02, .014, .02, gold, x, y + h, z);                                       // ridge
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        lmBox(g, .016, .03, .016, gold, x + sx * halfBottom * .97, y + h * .2, z + sz * halfBottom * stretch * .97);
      }
      lmBox(g, .022, .04, .022, gold, x - halfTop - .01, y + h + .005, z);   // ridge-end ornaments
      lmBox(g, .022, .04, .022, gold, x + halfTop + .01, y + h + .005, z);
    };
    // podium and balustrade
    lmBox(g, 2.2, .06, 1.0, LM.stone, 0, 0, 0);
    lmBox(g, 2.1, .04, .025, LM.white, 0, .06, .45);
    for (let i = 0; i < 26; i++) lmBox(g, .02, .05, .02, LM.white, -1.0 + i * .08, .06, .45);
    // back mass: tall central block and its large roof
    lmBox(g, .9, .42, .36, wall, 0, .06, -.22);
    roof(0, .48, -.22, .5, .3, .11, .42);
    // middle mass: long two-storey wing with a long roof
    lmBox(g, 1.9, .3, .34, wall, 0, .06, .02);
    roof(0, .36, .02, 1.0, .6, .075, .22);
    // front wings: lower blocks stepping forward, each with its own small roof
    for (const side of [-1, 1]) {
      lmBox(g, .62, .19, .26, plain, side * .66, .06, .28);
      roof(side * .66, .25, .28, .36, .16, .05, .5);
    }
    // central entrance porch with a small roof and a red-brown panel
    lmBox(g, .4, .14, .22, wall, 0, .06, .28);
    lmBox(g, .12, .1, .01, stdMaterial({ color: 0x8a3a3a }), 0, .08, .395);
    roof(0, .2, .28, .26, .1, .05, .6);
    return g;
  },
  lake(o = {}) {    // Sun Moon Lake: calm blue water ringed by forested hills, Ci'en pagoda on a hilltop, and a ferry dock with white boats beside a red-and-gold pavilion boat
    const g = new THREE.Group();
    const R = o.radius ?? .6;
    let seed = 7;
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    lmCyl(g, R, R, .012, LM.water, 0, 0, 0, 48);
    const darkGreen = lmMaterial(0x2f6a46), blueMountain = lmMaterial(0x3f6f5e), forest = lmMaterial(0x3c7d4a);
    // layered hills: a near ring of forested slopes, then taller blue-green mountains behind
    for (let i = 0; i < 24; i++) {
      const angle = i / 24 * Math.PI * 2 + random() * .2;
      const d = R * (1.0 + random() * .1);
      const width = R * (.16 + random() * .1), height = .025 + random() * .035;
      const hill = lmAdd(g, roughMass(width * .8, height * .7, width * .65, { seed: 100 + i, jitter: .2, detail: 1 }), i % 3 ? forest : darkGreen, Math.cos(angle) * d, 0, Math.sin(angle) * d);
      hill.rotation.y = random() * 3;
    }
    for (let i = 0; i < 14; i++) {
      const angle = i / 14 * Math.PI * 2 + random() * .3;
      const d = R * (1.7 + random() * .35);
      const width = R * (.5 + random() * .2), height = .16 + random() * .22;
      lmAdd(g, roughMass(width * .85, height * .55, width * .6, { seed: 200 + i, jitter: .18, detail: 2 }), blueMountain, Math.cos(angle) * d, 0, Math.sin(angle) * d).rotation.y = random() * 3;
    }
    // the hilltop with Ci'en pagoda (seven storeys)
    const hx = R * .62, hz = -R * .5;
    lmAdd(g, new THREE.ConeGeometry(R * .26, .2, 9), forest, hx, .1, hz);
    pagodaAt(g, { x: hx, z: hz, y: .18, half: .06, levels: 7, wall: LM.pale, roof: LM.roofRed });
    // ferry dock with white boats and the red-and-gold pavilion boat
    const dx = -R * .32, dz = R * .55;
    lmBox(g, R * .6, .012, .05, LM.concrete, dx, .01, dz);
    const boatHull = lmMaterial(0xf4f6f8), trim = lmMaterial(0x24427a);
    for (let i = 0; i < 5; i++) {
      const bx = dx - R * .24 + i * R * .12, bz = dz + (i % 2 ? -.06 : .06);
      lmBox(g, .14, .03, .055, i % 2 ? trim : boatHull, bx, .012, bz);
      lmBox(g, .07, .035, .045, boatHull, bx, .042, bz);
      lmBox(g, .072, .01, .047, LM.glass, bx, .06, bz);
    }
    lmBox(g, .18, .05, .075, LM.vermilion, dx - R * .36, .012, dz + .1);
    lmHip(g, .03, .11, .045, LM.roofRed, dx - R * .36, .062, dz + .1, .8);
    lmBox(g, .13, .014, .01, LM.gold, dx - R * .36, .107, dz + .1);
    return g;
  },
  anping() {        // Fort Zeelandia / Anping Old Fort: cream colonial hall with an arched colonnade and grey tiled roof, a white lookout tower with a terracotta pyramid roof, brick plaza, brick wall and a cannon
    const g = new THREE.Group();
    const cream = lmMaterial(0xeadfc8), terracotta = lmMaterial(0xb55a35, { map: TEXTURES.tiles });
    const plaza = lmMaterial(0xc2694a, { map: TEXTURES.brick });
    const maroon = lmMaterial(0x6a2a30, { roughness: .5 });
    lmBox(g, 1.5, .02, 1.1, plaza, 0, 0, 0);
    lmBox(g, 1.5, .1, .06, LM.brick, 0, .02, -.52);
    lmBox(g, .06, .1, 1.1, LM.brick, -.72, .02, 0);
    lmBox(g, .96, .035, .46, LM.white, .12, .02, .02);
    lmBox(g, .94, .2, .34, cream, .12, .055, -.04);
    for (let i = 0; i < 6; i++) {
      const x = .12 - .45 + i * .18;
      lmBox(g, .045, .2, .045, LM.white, x, .055, .2);
      if (i < 5) lmAdd(g, new THREE.TorusGeometry(.07, .014, 6, 12, Math.PI), LM.white, x + .09, .2, .2);
    }
    for (const x of [-.1, .12, .34]) lmBox(g, .035, .09, .005, stdMaterial({ color: 0x24324a }), x, .1, .13);
    lmBox(g, 1.0, .02, .46, LM.black, .12, .255, .02);
    lmHip(g, .3, .56, .1, LM.roofDark, .12, .27, -.02, .46);
    lmBox(g, .21, .36, .21, LM.white, -.38, .02, -.2);
    lmBox(g, .23, .1, .23, lmMaterial(0x24324a, { metalness: .5, roughness: .25 }), -.38, .38, -.2);
    lmBox(g, .25, .02, .25, LM.white, -.38, .48, -.2);
    lmHip(g, .01, .15, .11, terracotta, -.38, .5, -.2, 1);
    lmBox(g, .1, .025, .04, maroon, .0, .04, .38);
    const barrel = lmCyl(g, .014, .02, .16, maroon, -.01, .05, .38, 10); barrel.rotation.z = Math.PI / 2 - .12;
    for (const z of [.355, .405]) lmAdd(g, new THREE.CylinderGeometry(.04, .04, .008, 14), maroon, .0, .06, z).rotation.x = Math.PI / 2;
    lmCyl(g, .008, .012, .12, LM.trunk, -.62, .02, .3, 6);
    lmAdd(g, new THREE.SphereGeometry(.12, 12, 8), LM.leaf, -.62, .17, .3).scale.set(1.3, .7, 1.3);
    return g;
  },
  hongmaocheng() {  // Fort San Domingo's red-brick British consulate: two storeys of round-arched verandas with white balustrades, a low hipped roof with a small cupola, and a single-storey arcaded wing
    const g = new THREE.Group();
    const brickWall = lmMaterial(0xb55a3c, { map: TEXTURES.brick });
    const roofRed = lmMaterial(0x8e4a36, { map: TEXTURES.tiles });
    const opening = lmMaterial(0x23302c), shutter = lmMaterial(0x2f6a5a);
    const lawn = lmMaterial(0x5fa04a);
    lmBox(g, 1.9, .02, 1.3, lawn, 0, 0, 0);
    // main two-storey block
    lmBox(g, 1.0, .08, .54, LM.stone, .18, .02, 0);                       // plinth
    lmBox(g, .98, .34, .5, brickWall, .18, .1, 0);
    lmBox(g, 1.02, .025, .54, LM.white, .18, .44, 0);                     // cornice
    // front arcades on both floors, with a balustrade on the upper one
    for (let i = 0; i < 6; i++) archBay(g, .18 - .38 + i * .152, .12, .253, .09, .14, opening);
    for (let i = 0; i < 6; i++) archBay(g, .18 - .38 + i * .152, .3, .253, .09, .12, opening);
    lmBox(g, .96, .025, .014, LM.white, .18, .27, .262);
    for (let i = 0; i < 24; i++) lmBox(g, .01, .03, .01, LM.white, .18 - .46 + i * .04, .245, .262);
    for (let i = 0; i < 3; i++) lmBox(g, .035, .08, .004, shutter, .18 - .3 + i * .3, .13, .258);
    // end wall arches
    for (let i = 0; i < 3; i++) archBay(g, .68, .12, -.14 + i * .14, .08, .13, opening, Math.PI / 2);
    for (let i = 0; i < 3; i++) archBay(g, .68, .3, -.14 + i * .14, .08, .11, opening, Math.PI / 2);
    // low hipped roof and a small square cupola
    lmHip(g, .2, .56, .1, roofRed, .18, .465, 0, .55);
    lmBox(g, .1, .07, .1, brickWall, .18, .56, -.02);
    lmHip(g, .004, .075, .06, lmMaterial(0x2a2a30), .18, .63, -.02, 1);
    // single-storey arcaded wing to the left
    lmBox(g, .5, .2, .34, brickWall, -.56, .02, .1);
    for (let i = 0; i < 4; i++) archBay(g, -.56 - .18 + i * .12, .06, .274, .075, .12, opening);
    lmHip(g, .1, .32, .07, roofRed, -.56, .22, .1, .6);
    // hedges and shrubs along the front
    for (let i = 0; i < 8; i++) lmBox(g, .16, .05, .07, lmMaterial(0x2f6b3a), -.5 + i * .17, .02, .5);
    return g;
  },
  queenhead() {     // Yehliu's Queen's Head: a head in profile — back-swept hair bun, high forehead, a pointed nose, small lips and a firm chin, pitted brown-grey rock — on a long slender golden sandstone neck, on a golden rock slope dotted with a line of stones
    const g = new THREE.Group();
    const sand = lmMaterial(0xdba643, { roughness: 1 }), neck = lmMaterial(0xc88b3a, { roughness: 1 });
    const cap = lmMaterial(0x7d6a59, { map: TEXTURES.pits, roughness: 1 });
    lmAdd(g, roughMass(1.3, .2, 1.0, { seed: 12, jitter: .06 }), sand, 0, -.04, 0);
    // the neck: a smooth lathe, wide at the foot, pinched under the head
    const profile = [[.15, 0], [.115, .08], [.075, .22], [.05, .4], [.04, .55], [.045, .62], [.001, .64]].map(([x, y]) => new THREE.Vector2(x, y));
    lmAdd(g, new THREE.LatheGeometry(profile, 16), neck, 0, 0, 0);
    // the head profile, drawn as an outline facing right and extruded with rounded edges
    const outline = [[-.05, .0], [-.09, .08], [-.15, .16], [-.2, .24], [-.2, .31], [-.14, .36], [-.07, .41], [.03, .43], [.1, .4], [.14, .34], [.15, .29], [.2, .24], [.21, .21], [.16, .19], [.17, .15], [.14, .11], [.15, .07], [.1, .03], [.05, .0]];
    const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
    const pts = shape.getPoints(1);
    const smooth = new THREE.Shape(new THREE.SplineCurve(outline.map(([x, y]) => new THREE.Vector2(x, y))).getPoints(80));
    const headGeometry = new THREE.ExtrudeGeometry(smooth, { depth: .1, bevelEnabled: true, bevelThickness: .05, bevelSize: .04, bevelSegments: 5, curveSegments: 4 }).translate(0, 0, -.05);
    const pos = headGeometry.attributes.position;
    for (let k = 0; k < pos.count; k++) {          // weathered, lumpy surface
      const n = Math.sin(pos.getX(k) * 83 + pos.getY(k) * 61 + pos.getZ(k) * 47) * Math.cos(pos.getX(k) * 41 - pos.getZ(k) * 73);
      pos.setXYZ(k, pos.getX(k) + n * .006, pos.getY(k) + n * .006, pos.getZ(k) + n * .01);
    }
    headGeometry.computeVertexNormals();
    // map UVs by position so the pits texture wraps the head
    const uv = headGeometry.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (pos.getX(k) + pos.getZ(k)) * 5, pos.getY(k) * 5);
    const head = lmAdd(g, headGeometry, cap, 0, .63, 0);
    head.rotation.z = -.12;
    for (let k = 0; k < 18; k++) {
      const t = k / 17, x = -1.0 + t * 2.0, z = .42 - Math.sin(t * Math.PI) * .12;
      lmAdd(g, roughMass(.045 + (k % 3) * .012, .028, .04, { seed: 30 + k, jitter: .15, detail: 1 }), LM.rock, x, .01, z);
    }
    for (const [x, z, h] of [[-.7, -.3, .3], [.75, -.35, .22], [.35, -.55, .26]]) {
      lmCyl(g, .03 * h / .3, .05 * h / .3, h * .6, neck, x, 0, z, 8);
      lmAdd(g, roughMass(.09 * h / .3, .05 * h / .3, .09 * h / .3, { seed: 40 + Math.round(h * 10), jitter: .12, detail: 1 }), cap, x, h * .7, z);
    }
    return g;
  },
  osakaCastle() {   // Osaka Castle: five white storeys with green copper roofs, a gold-trimmed gable on every face, a black top storey with gold tigers and a wide balcony, gold shachi, on a tall battered stone base
    const g = new THREE.Group();
    const white = lmMaterial(0xf4f1e8, { map: TEXTURES.plaster });
    const green = lmMaterial(0x6aa386, { map: TEXTURES.tiles, roughness: .5 });
    const black = lmMaterial(0x1c1c1e);
    lmCyl(g, 1.0, 1.0, .004, LM.water, 0, 0, 0, 32);
    lmAdd(g, squareFrustum(.36, .5, .2), LM.stone, 0, .1, 0);                          // battered stone base
    lmBox(g, .98, .1, .98, lmMaterial(0x8b8b82, { map: TEXTURES.stone }), 0, 0, 0).visible = false;
    let y = .2, w = .58;
    for (let i = 0; i < 5; i++) {
      const h = .12;
      lmBox(g, w, h, w * .9, white, 0, y, 0);
      lmBox(g, w + .02, .012, w * .9 + .02, black, 0, y, 0);                          // dark sill band
      lmHip(g, w * .22, w * .66, .06, green, 0, y + h, 0, .9);                         // green eave
      // gables: front and both sides, with a gold fan on each
      gableAt(g, { x: 0, y: y + h + .005, z: w * .45 + .01, width: w * .46, height: .075, material: white });
      gableAt(g, { x: 0, y: y + h + .036, z: w * .45 + .026, width: w * .16, height: .028, depth: .008, material: LM.gold });
      for (const sx of [-1, 1]) gableAt(g, { x: sx * (w / 2 + .01), y: y + h + .005, z: 0, width: w * .42, height: .07, material: white, yaw: sx * Math.PI / 2 });
      y += h + .035; w *= .88;
    }
    // top storey: black with gold tigers, a gold balcony rail and a big green roof
    lmBox(g, w * .9, .14, w * .82, black, 0, y, 0);
    for (const sx of [-1, 1]) lmBox(g, .07, .04, .012, LM.gold, sx * w * .22, y + .06, w * .41 + .006);
    lmBox(g, w * 1.1, .012, w * 1.0, LM.gold, 0, y, 0);
    for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; lmBox(g, .008, .026, .008, LM.gold, Math.cos(a) * w * .52, y + .012, Math.sin(a) * w * .46); }
    lmHip(g, w * .1, w * .78, .1, green, 0, y + .14, 0, .9);
    for (const sx of [-1, 1]) lmAdd(g, new THREE.ConeGeometry(.014, .07, 5), LM.gold, sx * w * .56, y + .27, 0);
    return g;
  },
  himeji() {        // Himeji Castle: a cluster of brilliant white keeps — a five-tier main keep and three smaller ones linked by long white wings — under grey-black tiled roofs edged in white plaster, every tier crowned with layered curved gables, on a flaring stone base
    const g = new THREE.Group();
    const white = lmMaterial(0xf8f7f1, { map: TEXTURES.plaster });
    const plaster = lmMaterial(0xfdfcf7);
    const tile = lmMaterial(0x454a52, { map: TEXTURES.tiles, roughness: .6 });
    const stone = lmMaterial(0x93938a, { map: TEXTURES.stone });
    const ornament = lmMaterial(0x25282c);
    lmBox(g, 2.0, .04, 1.2, lmMaterial(0x6b8a52), 0, 0, 0);
    const gabled = (x, y, z, width, height, yaw = 0, thick = .02) => {
      curvedGableAt(g, { x, y, z, width: width * 1.12, height: height * 1.06, depth: thick, material: tile, yaw });                  // tiled cap behind
      curvedGableAt(g, { x: x + Math.sin(yaw) * .012, y: y + .002, z: z + Math.cos(yaw) * .012, width, height, depth: thick, material: plaster, yaw });
    };
    // a keep: stacked white storeys, each under a tiled roof edged in white, with layered curved gables
    const keep = (x, z, width, tiers, base) => {
      lmAdd(g, squareFrustum(width * .5, width * .7, base), stone, x, base / 2, z);
      let y = base, w = width;
      for (let i = 0; i < tiers; i++) {
        const h = .09;
        lmBox(g, w, h, w * .82, white, x, y, z);
        for (let k = 0; k < 3; k++) lmBox(g, w * .09, .035, .006, ornament, x - w * .3 + k * w * .3, y + .035, z + w * .41 + .004);    // slit windows
        lmBox(g, w * 1.32, .01, w * 1.08, plaster, x, y + h - .003, z);                                    // white eave fascia
        lmHip(g, w * .2, w * .7, .06, tile, x, y + h, z, .84);
        // front gable on every tier, side gables on alternating tiers, a second smaller gable above
        gabled(x, y + h + .004, z + w * .38, w * .62, .075);
        if (i % 2 === 0) for (const sx of [-1, 1]) gabled(x + sx * (w * .5 + .004), y + h + .004, z, w * .5, .065, sx * Math.PI / 2);
        else gabled(x, y + h + .045, z + w * .3, w * .3, .045);
        y += h + .03; w *= .87;
      }
      lmHip(g, w * .1, w * .74, .09, tile, x, y - .03, z, .8);                                              // top roof
      gabled(x, y + .004, z + w * .3, w * .5, .07);
      for (const sx of [-1, 1]) lmAdd(g, new THREE.ConeGeometry(.012, .055, 5), ornament, x + sx * w * .5, y + .075, z);   // shachi ridge ends
    };
    keep(.34, -.05, .5, 5, .26);                       // the main keep
    keep(-.34, .1, .24, 3, .2);                         // west keep
    keep(-.1, .16, .2, 2, .2);                          // middle keep
    keep(-.6, .04, .18, 2, .18);
    // long connecting wings with tiled roofs and a gable on each bay
    for (const [x, w] of [[-.22, .56], [.04, .34]]) {
      lmBox(g, w, .13, .22, white, x, .2, .14);
      lmBox(g, w * 1.1, .01, .26, plaster, x, .325, .14);
      lmHip(g, w * .4, w * .62, .05, tile, x, .33, .14, .55);
      for (let k = 0; k < 3; k++) gabled(x - w * .3 + k * w * .3, .335, .26, .12, .05);
    }
    // the stone wall in front
    lmBox(g, 1.7, .09, .1, stone, 0, 0, .55);
    return g;
  },
  matsumoto() {     // Matsumoto Castle: the black five-roof keep with white-edged eaves and curved gables, the lower Tatsumi turret and the open Tsukimi veranda attached, on a stone base rising from the moat, with the red Uzumi bridge
    const g = new THREE.Group();
    const black = lmMaterial(0x1d1d20), tile = lmMaterial(0x23262b, { map: TEXTURES.tiles, roughness: .6 }), white = lmMaterial(0xf1efe8);
    const stone = lmMaterial(0x97978d, { map: TEXTURES.stone });
    lmCyl(g, 1.0, 1.0, .004, LM.water, 0, 0, 0, 32);
    lmAdd(g, squareFrustum(.3, .42, .16), stone, 0, .08, 0);
    const storey = (x, z, w, d, y, tiers) => {
      for (let i = 0; i < tiers; i++) {
        const h = .085;
        lmBox(g, w, h, d, black, x, y, z);
        for (let k = 0; k < 4; k++) lmBox(g, w * .18, .035, .006, white, x - w * .36 + k * w * .24, y + .025, z + d / 2 + .004);    // window lattices
        lmHip(g, w * .22, w * .68, .05, tile, x, y + h, z, d / w * 1.0);
        lmBox(g, w * 1.24, .008, d * 1.24, white, x, y + h - .004, z).scale.set(.97, 1, .97);    // the pale eave edge
        gableAt(g, { x, y: y + h + .003, z: z + d * .42, width: w * .5, height: .06, material: white });
        gableAt(g, { x, y: y + h + .006, z: z + d * .42 + .012, width: w * .36, height: .045, depth: .01, material: black });
        y += h + .028; w *= .87; d *= .87;
      }
      return y;
    };
    const top = storey(0, 0, .5, .4, .16, 5);
    lmBox(g, .22, .06, .18, black, 0, top - .028, 0);
    lmHip(g, .02, .17, .06, tile, 0, top + .03, 0, .8);
    // Tatsumi turret (left) and the Tsukimi veranda (right)
    storey(-.42, .08, .24, .2, .16, 2);
    lmBox(g, .3, .08, .24, black, .43, .16, .1);
    lmBox(g, .32, .012, .26, LM.vermilion, .43, .17, .1);
    for (let i = 0; i < 8; i++) lmBox(g, .008, .03, .008, LM.vermilion, .29 + i * .04, .18, .225);
    lmHip(g, .06, .2, .05, tile, .43, .24, .1, .75);
    lmBox(g, .1, .012, .5, LM.vermilion, .55, .0, .5);                                      // red bridge
    return g;
  },
  gorge() {         // Taroko Gorge: a narrow V-shaped canyon of near-vertical pale marble walls streaked with dark bands, trees clinging to the ledges, a turquoise river winding at the bottom, a tunnel mouth in the wall, blue-green peaks and cloud at the far end, the golden-roofed highway gateway and the carved boulder marker at the entrance
    const g = new THREE.Group();
    let seed = 17;
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const marble = lmMaterial(0xd4d4cc, { map: TEXTURES.marble, roughness: 1 });
    const marbleDark = lmMaterial(0xaaa8a0, { map: TEXTURES.marble, roughness: 1 });
    const forest = lmMaterial(0x3a7a43, { roughness: 1 }), forestDark = lmMaterial(0x2b5f36, { roughness: 1 });
    const peak = lmMaterial(0x517f78, { roughness: 1 }), peakFar = lmMaterial(0x6d93a4, { roughness: 1 });
    const river = lmMaterial(0x28b4a8, { roughness: .2, metalness: .1 });
    const goldRoof = lmMaterial(0xd9a52b, { map: TEXTURES.tiles, roughness: .5 });
    // a sheer wall built from jagged vertical blocks, leaning slightly out, with a ragged top and ledges
    const wall = (side, zFrom, zTo) => {
      const blocks = 16;
      for (let k = 0; k < blocks; k++) {
        const z = zFrom + (zTo - zFrom) * (k + .5) / blocks, bw = Math.abs(zTo - zFrom) / blocks * 1.2;
        const height = .85 + random() * .35, depth = .16 + random() * .12, offset = random() * .06;
        const block = lmAdd(g, jaggedSlab(depth, height, bw, k * 7 + side * 31, .18), k % 3 ? marble : marbleDark, side * (.17 + depth / 2 + offset), height / 2, z);
        block.rotation.z = -side * (.03 + random() * .05);
        if (random() < .7) {   // a ledge with trees and shrubs part-way up
          const ly = height * (.35 + random() * .4);
          lmAdd(g, roughMass(.07 + random() * .05, .05, bw * .55, { seed: k + side * 40, jitter: .3, detail: 1 }), random() < .5 ? forest : forestDark, side * (.17 + offset * .5), ly, z);
        }
      }
      // vegetation spilling over the top and filling the lower slopes
      for (let k = 0; k < 7; k++) {
        const z = zFrom + (zTo - zFrom) * random();
        lmAdd(g, roughMass(.12 + random() * .08, .09 + random() * .05, .1 + random() * .05, { seed: 60 + k + side * 20, jitter: .3 }), random() < .5 ? forest : forestDark, side * (.32 + random() * .1), 1.0 + random() * .15, z);
        lmAdd(g, roughMass(.1 + random() * .06, .08, .1, { seed: 90 + k + side * 20, jitter: .3, detail: 1 }), forestDark, side * (.2 + random() * .05), .04, z);
      }
    };
    wall(-1, -1.0, .75);
    wall(1, -1.0, .75);
    // the winding turquoise river and a pale gravel bar
    for (let k = 0; k < 18; k++) {
      const z = -.95 + k * .1, x = Math.sin(k * .7) * .05;
      lmBox(g, .17, .01, .13, river, x, 0, z);
      if (k % 4 === 1) lmBox(g, .06, .012, .08, LM.sand, x + .06, 0, z);
    }
    // tunnel mouth cut in the right wall
    lmBox(g, .02, .11, .1, LM.black, .205, 0, .2);
    // far peaks, cloud and a thin waterfall
    lmAdd(g, roughMass(.85, .7, .4, { seed: 3, jitter: .12 }), peakFar, -.15, .45, -1.4);
    lmAdd(g, roughMass(.6, .95, .4, { seed: 5, jitter: .12 }), peak, .5, .6, -1.3);
    lmBox(g, .018, .45, .01, LM.white, .35, .55, -.92);
    for (const [x, y, z, r] of [[-.2, 1.05, -1.0, .35], [.35, 1.18, -1.05, .3], [.0, .95, -.7, .25]]) lmAdd(g, new THREE.SphereGeometry(r, 10, 6), lmMaterial(0xf4f6f8, { roughness: 1 }), x, y, z).scale.set(1.6, .35, .8);
    // the gateway: a taller central roof over the pillars and a lower roof on each side
    const gate = (x, z) => {
      for (const px of [-.09, .09]) {
        lmBox(g, .026, .02, .026, LM.white, x + px, 0, z);
        lmCyl(g, .009, .009, .13, LM.vermilion, x + px, .02, z, 8);
      }
      lmBox(g, .22, .016, .026, LM.vermilion, x, .13, z);
      lmBox(g, .22, .012, .034, LM.gold, x, .146, z);
      lmHip(g, .045, .14, .05, goldRoof, x, .158, z, .7);
      lmBox(g, .1, .008, .012, LM.gold, x, .208, z);
    };
    gate(-.05, .85);
    for (const side of [-1, 1]) {
      const x = -.05 + side * .17, z = .85;
      lmCyl(g, .008, .008, .09, LM.vermilion, x + side * .03, .02, z, 8);
      lmBox(g, .02, .012, .02, LM.white, x + side * .03, .0, z);
      lmHip(g, .02, .075, .035, goldRoof, x, .11, z, .8);
    }
    const rock = lmAdd(g, new THREE.SphereGeometry(1, 14, 10), lmMaterial(0xe3e3dc, { roughness: .9 }), .22, .09, .9);
    rock.scale.set(.07, .1, .05);
    for (let i = 0; i < 4; i++) lmBox(g, .006, .02, .004, LM.black, .22 + .004, .06 + i * .03, .948);
    return g;
  },
  village() {       // Jiufen: tiers of dark-timber teahouses climbing a steep hillside under a green peak, windows glowing, red lanterns along every eave, grey tiled roofs, a white arched building at the top
    const g = new THREE.Group();
    let seed = 5;
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const timber = lmMaterial(0x4a3a2a, { map: TEXTURES.lit, emissive: 0xffa040, emissiveMap: TEXTURES.lit, emissiveIntensity: .45 });
    const roofGrey = lmMaterial(0x59616a, { map: TEXTURES.tiles });
    const hill = lmMaterial(0x2f6b45), hillDark = lmMaterial(0x25543a);
    const white = lmMaterial(0xe9ecee, { map: TEXTURES.plaster });
    // the green peak behind
    lmAdd(g, new THREE.ConeGeometry(.95, 1.25, 9), hill, -.55, .62, -.95);
    lmAdd(g, new THREE.ConeGeometry(.6, .8, 8), hillDark, .35, .4, -1.05);
    // stepped hillside: each terrace higher and further back, buildings on top
    const rows = 4;
    for (let r = 0; r < rows; r++) {
      const z = .5 - r * .3, y = r * .1;
      lmBox(g, 1.7, .1 + y, .3, r % 2 ? LM.stone : hillDark, 0, 0, z);
      const count = 4 - (r % 2);
      for (let i = 0; i < count; i++) {
        const w = .26 + random() * .1, floors = 2 + (r > 1 ? 1 : 0), h = floors * .1;
        const x = -.62 + i * (1.24 / (count - 1 || 1)) + (random() - .5) * .06;
        lmBox(g, w, h, .22, timber, x, .1 + y, z);
        lmHip(g, .02, w * .62, .05, roofGrey, x, .1 + y + h, z, .55);
        // a string of lanterns along the eave
        for (let k = 0; k < 5; k++) lmAdd(g, new THREE.SphereGeometry(.012, 6, 5), LM.lantern, x - w * .4 + k * w * .2, .1 + y + h * .55, z + .115);
      }
    }
    // the white arched building at the top
    lmBox(g, .4, .24, .24, white, .62, .4 + .1, -.62);
    lmBox(g, .44, .03, .26, LM.white, .62, .74, -.62);
    for (let i = 0; i < 4; i++) archBay(g, .62 - .15 + i * .1, .42, -.495, .07, .1, lmMaterial(0x24324a));
    return g;
  },
  rocks() {         // Yehliu: mushroom rocks on the headland
    const g = new THREE.Group();
    [[-.3, 0, 1], [0, .25, .75], [.3, -.1, .6], [.5, .3, .45]].forEach(([x, z, h]) => {
      lmCyl(g, .06 * h, .09 * h, .55 * h, LM.rock, x, 0, z, 8);
      lmAdd(g, new THREE.SphereGeometry(.16 * h, 10, 8), LM.rock, x, .6 * h, z).scale.y = .55;
    });
    return g;
  },
  chihkan() {       // Chihkan Tower: brick storey under a wide swept red-tile eave, an upper timber storey with red pillars, blue windows and a white balustrade, a gabled hip roof with finials, and the row of stone steles in front
    const g = new THREE.Group();
    const tile = lmMaterial(0xc75530, { map: TEXTURES.tiles, roughness: .6 });
    const brickWall = lmMaterial(0xb04a32, { map: TEXTURES.brick });
    const blue = lmMaterial(0x2f5fb0), cream = lmMaterial(0xdcccb0);
    lmBox(g, 1.5, .06, .6, LM.stone, 0, 0, .1);
    // low cream wall with a brick-pattern band, and the stone steles in front of it
    lmBox(g, 1.4, .1, .06, cream, 0, .06, .36);
    lmBox(g, 1.4, .03, .062, brickWall, 0, .16, .36);
    for (let i = 0; i < 9; i++) {
      const x = -.6 + i * .15;
      lmBox(g, .09, .15, .025, LM.whiteRock, x, .06, .42);
      lmBox(g, .1, .02, .03, LM.whiteRock, x, .21, .42);
    }
    // lower storey: brick walls with a latticed window, red pillars at the corners
    lmBox(g, .62, .22, .4, brickWall, 0, .06, -.05);
    lmBox(g, .12, .1, .01, lmMaterial(0x2a2220), 0, .12, .16);
    for (const sx of [-1, 1]) lmCyl(g, .016, .016, .22, LM.vermilion, sx * .31, .06, .17, 8);
    lmHip(g, .22, .52, .09, tile, 0, .28, -.05, .62);                          // wide swept eave over the lower storey
    // upper storey: red pillars, blue windows, white balustrade
    lmBox(g, .36, .13, .26, lmMaterial(0xe9dfca), 0, .37, -.05);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) lmCyl(g, .012, .012, .13, LM.vermilion, sx * .18, .37, -.05 + sz * .13, 8);
    for (const x of [-.11, .0, .11]) lmBox(g, .06, .08, .006, blue, x, .395, .085);
    lmBox(g, .44, .035, .02, LM.white, 0, .37, .105);
    for (let i = 0; i < 12; i++) lmBox(g, .012, .03, .012, LM.white, -.2 + i * .036, .37, .105);
    // upper roof: hip roof with a central gable, swallow-tail ridge finials
    lmHip(g, .1, .3, .08, tile, 0, .5, -.05, .75);
    lmHip(g, .03, .12, .06, tile, 0, .575, -.05, 1);
    for (const sx of [-1, 1]) {
      lmBox(g, .018, .05, .018, LM.white, sx * .29, .53, .09);
      lmBox(g, .018, .05, .018, LM.white, sx * .29, .53, -.19);
    }
    lmCyl(g, .004, .008, .06, LM.gold, 0, .635, -.05, 6);
    return g;
  },
  koreanHall() {    // Changdeokgung Injeongjeon: two-tier hall on a stone terrace
    const g = new THREE.Group();
    lmBox(g, .9, .05, .6, LM.stone, 0, 0, 0);
    lmBox(g, .72, .05, .48, LM.stone, 0, .05, 0);
    hallAt(g, { y: .1, w: .55, d: .32, wall: LM.vermilion, roof: LM.tileGrey, roofH: .17, platformH: 0 });
    return g;
  },
  haeinsa() {       // Haeinsa: terraces of plain grey-tiled halls on a hillside
    const g = new THREE.Group();
    lmBox(g, 1.3, .08, 1, LM.stone, 0, 0, 0);
    lmBox(g, 1.1, .08, .7, LM.stone, 0, .08, -.1);
    hallAt(g, { y: .16, z: -.25, w: .8, d: .3, wall: LM.trunk, roof: LM.roofDark, double: false, roofH: .13, platformH: 0 });
    for (const x of [-.4, .4]) hallAt(g, { y: .08, x, z: .25, w: .3, d: .22, wall: LM.trunk, roof: LM.roofDark, double: false, roofH: .09, platformH: 0 });
    return g;
  },
  avenue() {        // Nami Island: avenue of tall metasequoia trees
    const g = new THREE.Group();
    lmBox(g, .24, .004, 2.4, LM.sand, 0, 0, 0);
    for (let i = 0; i < 9; i++) for (const side of [-1, 1]) lmCyl(g, .018, .026, .9 + (i % 3) * .05, LM.trunk, side * .28, 0, -1 + i * .25, 6) && lmAdd(g, new THREE.ConeGeometry(.12, .5, 7), LM.leaf, side * .28, .7 + (i % 3) * .05, -1 + i * .25);
    return g;
  },
  kumamotoCastle() {   // Kumamoto: black-boarded main keep with a smaller keep beside it, on tall steep stone walls
    const g = new THREE.Group();
    lmAdd(g, squareFrustum(.2, .46, .26), LM.stone, 0, .13, 0);
    lmBox(g, .5, .05, .4, LM.stone, .42, 0, .05);
    const baseY = .26;
    castleKeep(g, { x: .42, z: .05, y: baseY - .1, half: .09, tiers: 2, wall: LM.black, roof: LM.roofDark, tierH: .07, roofH: .045, shrink: .85, gold: false });
    lmBox(g, .36, .035, .12, LM.black, .2, baseY, .02);
    // wide white-trimmed lower storeys, then the black upper tower
    lmBox(g, .4, .08, .4, LM.white, 0, baseY, 0);
    lmHip(g, .16, .27, .05, LM.roofDark, 0, baseY + .08, 0);
    castleKeep(g, { y: baseY + .13, half: .17, tiers: 4, wall: LM.black, roof: LM.roofDark, tierH: .075, roofH: .05, shrink: .84, gold: false });
    return g;
  },
  nagoyaCastle() {     // Nagoya: white-walled five-storey keep, green copper roofs, golden shachi on the ridge
    const g = new THREE.Group();
    lmCyl(g, .9, .9, .004, LM.water, 0, 0, 0, 28);
    lmAdd(g, squareFrustum(.2, .34, .2), LM.stone, 0, .1, 0);
    lmBox(g, .3, .06, .3, LM.white, -.42, 0, .08);
    castleKeep(g, { x: -.42, z: .08, y: .06, half: .075, tiers: 2, wall: LM.plaster, roof: LM.roofGreen, tierH: .06, roofH: .04, shrink: .85, gold: false });
    const copper = lmMaterial(0x5fa88c);
    const top = castleKeep(g, { y: .2, half: .17, tiers: 5, wall: LM.plaster, roof: copper, tierH: .085, roofH: .06, shrink: .82, gold: true });
    for (const sx of [-1, 1]) lmBox(g, .02, .06, .02, LM.gold, sx * .07, top, 0);
    return g;
  },
  foguangshan() {      // Fo Guang Shan Buddha Memorial Center: a giant gold seated Buddha on a navy platform above a broad cream stepped pyramid, white stupas beside it, four orange-roofed nine-tier pagodas down the avenue, lawns, hedges and a paved path
    const g = new THREE.Group();
    const orange = lmMaterial(0xe8841e, { map: TEXTURES.tiles, roughness: .5 });
    const cream = lmMaterial(0xd9ccb0, { map: TEXTURES.stone });
    const navy = lmMaterial(0x1b2540, { metalness: .2 });
    const grey = lmMaterial(0xbdb6a6), lawn = lmMaterial(0x5fae3f), hedge = lmMaterial(0x2f7a35);
    lmBox(g, 3.2, .02, 2.4, lawn, 0, 0, .2);
    lmBox(g, .36, .022, 1.7, lmMaterial(0xcfcabd), 0, 0, .9);                       // the paved avenue
    for (const side of [-1, 1]) lmBox(g, .09, .05, 1.6, hedge, side * .26, .0, .9);   // hedges along it
    // the memorial hall: a broad base, then the stepped pyramid the Buddha sits on
    lmBox(g, 1.5, .14, .62, cream, 0, .02, -.1);
    lmAdd(g, squareFrustum(.3, .62, .3), cream, 0, .16 + .15, -.1);
    lmAdd(g, squareFrustum(.24, .32, .05), LM.concrete, 0, .46 + .025, -.1);
    lmCyl(g, .3, .3, .05, navy, 0, .51, -.1, 24);                                 // dark round platform
    lmCyl(g, .22, .27, .05, cream, 0, .56, -.1, 20);                             // lotus throne
    // the Buddha: layered legs, tapering robe, raised right hand, round head with a topknot
    const bz = -.1;
    const robe = [[.001, 0], [.27, 0], [.27, .06], [.17, .12], [.14, .24], [.19, .32], [.12, .4], [.05, .43], [.001, .44]].map(([x, y]) => new THREE.Vector2(x, y));
    lmAdd(g, new THREE.LatheGeometry(robe, 20), LM.gold, 0, .61, bz).scale.z = .8;
    const legs = lmAdd(g, new THREE.SphereGeometry(.26, 18, 10), LM.gold, 0, .66, bz + .03); legs.scale.set(1.15, .32, .9);
    lmAdd(g, new THREE.SphereGeometry(.09, 16, 12), LM.gold, 0, 1.12, bz);
    lmAdd(g, new THREE.SphereGeometry(.035, 10, 8), LM.gold, 0, 1.2, bz);
    for (const side of [-1, 1]) { const arm = lmCyl(g, .035, .045, .2, LM.gold, side * .2, .82, bz + .02, 8); arm.rotation.z = side * .15; }
    lmCyl(g, .028, .03, .1, LM.gold, -.17, .84, bz + .02, 8).rotation.z = -.35;      // raised right hand
    lmBox(g, .1, .03, .07, LM.gold, .08, .69, bz + .13);
    // white stupas beside the Buddha
    for (const side of [-1, 1]) for (const dx of [.52, .7]) {
      const x = side * dx, z = -.05 - (dx > .6 ? .12 : 0);
      lmAdd(g, squareFrustum(.035, .06, .12), LM.plaster, x, .08 + .06, z);
      lmAdd(g, squareFrustum(.018, .035, .1), LM.plaster, x, .2 + .05, z);
      lmCyl(g, .004, .012, .05, LM.gold, x, .3, z, 6);
    }
    // the four nine-tier pagodas: grey storeys with white balustrades under orange roofs
    const pagoda = (x, z, levels = 9, base = .11) => {
      let y = .02, w = base;
      lmBox(g, w * 2.4, .02, w * 2.4, LM.stone, x, 0, z);
      for (let i = 0; i < levels; i++) {
        lmBox(g, w * 1.5, .05, w * 1.5, grey, x, y, z);
        lmBox(g, w * 1.9, .012, w * 1.9, LM.white, x, y + .05, z);                // balustrade
        lmHip(g, w * .5, w * 1.22, .028, orange, x, y + .062, z, 1);
        y += .09; w *= .965;
      }
      lmHip(g, .005, w * 1.4, .06, orange, x, y, z, 1);
      lmAdd(g, new THREE.SphereGeometry(.022, 10, 8), LM.gold, x, y + .07, z);
    };
    for (const side of [-1, 1]) { pagoda(side * 1.12, .55, 9, .12); pagoda(side * 1.5, .15, 9, .12); }
    // a few round trees
    for (const side of [-1, 1]) for (let i = 0; i < 5; i++) {
      const x = side * (.55 + i * .2), z = .8 + (i % 2) * .15;
      lmCyl(g, .01, .014, .08, LM.trunk, x, .02, z, 6);
      lmAdd(g, new THREE.SphereGeometry(.07, 8, 6), LM.leaf, x, .13, z);
    }
    return g;
  },
  // ---- Korea ----
  gyeongbokgung() { // Gwanghwamun gate in front of the Geunjeongjeon throne hall
    const g = new THREE.Group();
    lmBox(g, .9, .1, .3, LM.stone, 0, 0, 1.0);
    for (const x of [-.25, 0, .25]) lmBox(g, .1, .08, .32, LM.black, x, .0, 1.0);
    lmBox(g, .6, .12, .2, LM.vermilion, 0, .1, 1.0);
    lmHip(g, .08, .4, .1, LM.roofBlue, 0, .22, 1.0, .6);
    lmBox(g, .9, .04, .8, LM.stone, 0, 0, 0);
    lmBox(g, .7, .04, .62, LM.stone, 0, .04, 0);
    hallAt(g, { y: .08, w: .6, d: .34, wall: LM.vermilion, roof: LM.roofBlue, roofH: .16, platformH: .0 });
    return g;
  },
  hwaseong() {      // Suwon Hwaseong: fortress wall with the two-storey Paldalmun gate
    const g = new THREE.Group();
    lmBox(g, 2.0, .2, .1, LM.stone, 0, 0, 0);
    for (let i = 0; i < 20; i++) lmBox(g, .06, .04, .1, LM.stone, -.95 + i * .1, .2, 0);
    lmBox(g, .5, .26, .3, LM.stone, 0, 0, 0);
    lmBox(g, .4, .14, .22, LM.vermilion, 0, .26, 0);
    lmHip(g, .06, .3, .1, LM.roofDark, 0, .4, 0, .7);
    return g;
  },
  bulguksa() {      // Bulguksa: stone terraces, the main hall and the stepped stone pagodas
    const g = new THREE.Group();
    lmBox(g, 1.3, .1, .9, LM.stone, 0, 0, 0);
    lmBox(g, 1.0, .08, .6, LM.stone, 0, .1, -.1);
    hallAt(g, { y: .18, z: -.2, w: .7, d: .36, wall: LM.vermilion, roof: LM.roofDark, double: false, roofH: .16, platformH: 0 });
    // Dabotap (ornate, square) and Seokgatap (plain, three tiers)
    const pagodaStone = (x, tiers, width) => {
      let yy = .1, w = width;
      lmBox(g, w * 1.5, .03, w * 1.5, LM.whiteRock, x, yy, .3); yy += .03;
      for (let i = 0; i < tiers; i++) {
        lmBox(g, w, .09, w, LM.whiteRock, x, yy, .3); yy += .09;
        lmBox(g, w * 1.25, .025, w * 1.25, LM.whiteRock, x, yy, .3); yy += .025;
        w *= .78;
      }
      lmCyl(g, .004, .012, .08, LM.whiteRock, x, yy, .3, 6);
    };
    pagodaStone(-.22, 3, .12);
    pagodaStone(.22, 3, .1);
    return g;
  },
  triumphArch() {   // Pyongyang's Arch of Triumph: two stone piers, a wide arched opening and a stepped flat crown
    const g = new THREE.Group();
    for (const side of [-1, 1]) lmBox(g, .22, .62, .36, LM.whiteRock, side * .29, 0, 0);
    lmBox(g, .8, .2, .38, LM.whiteRock, 0, .62, 0);
    lmBox(g, .9, .05, .42, LM.whiteRock, 0, .82, 0);
    lmBox(g, .7, .05, .34, LM.whiteRock, 0, .87, 0);
    lmBox(g, .5, .04, .26, LM.whiteRock, 0, .92, 0);
    return g;
  },
  dokdo() {         // two rocky islets
    const g = new THREE.Group();
    lmAdd(g, new THREE.ConeGeometry(.3, 1, 8), LM.rock, 0, .5, 0);
    lmAdd(g, new THREE.ConeGeometry(.22, .75, 8), LM.rock, .55, .38, .2);
    lmBox(g, .08, .06, .08, LM.white, .55, .75, .2);
    return g;
  },
  // ---- generic ----
  marker(o = {}) {
    const g = new THREE.Group();
    const color = new THREE.Color(o.color ?? '#ffd36e');
    lmCyl(g, .012, .016, .8, LM.concrete, 0, 0, 0, 6);
    lmAdd(g, new THREE.OctahedronGeometry(.1), stdMaterial({ color, emissive: color, emissiveIntensity: .35, roughness: .4 }), 0, .88, 0);
    lmCyl(g, .14, .16, .03, LM.stone, 0, 0, 0, 12);
    return g;
  },
  peak(o = {}) {
    const g = new THREE.Group();
    lmCyl(g, .01, .014, .8, LM.white, 0, 0, 0, 6);
    lmAdd(g, new THREE.PlaneGeometry(.34, .2), stdMaterial({ color: o.color ?? 0xd62d20, side: THREE.DoubleSide, roughness: .6 }), .17, .7, 0);
    return g;
  }
};


// --- Taiwan detail pass: each sight gets the extra features that make it recognisable at close range ------------------
const raycaster = new THREE.Raycaster(), rayOrigin = new THREE.Vector3(), rayDown = new THREE.Vector3(0, -1, 0);
function groundAt(g, x, z) {            // top surface of the model under (x, z), so added parts sit on slopes instead of floating
  g.updateMatrixWorld(true);
  raycaster.set(rayOrigin.set(x, 20, z), rayDown);
  const hit = raycaster.intersectObject(g, true)[0];
  return hit ? hit.point.y : 0;
}
// a tall, irregular rock slab: a subdivided box with its sides jittered and position-mapped UVs (marble cliffs, sea stacks)
function jaggedSlab(w, h, d, seed = 1, jitter = .25) {
  const geometry = new THREE.BoxGeometry(w, h, d, 2, 10, 2);
  const position = geometry.attributes.position, uv = geometry.attributes.uv;
  const hash = (a, b) => { const n = Math.sin(a * 12.9898 + b * 78.233 + seed * 37.719) * 43758.5453; return n - Math.floor(n); };
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const band = Math.round((y / h + .5) * 10);
    const kx = 1 + (hash(band, Math.sign(x) + 3) - .5) * 2 * jitter, kz = 1 + (hash(band + 20, Math.sign(z) + 7) - .5) * 2 * jitter;
    position.setXYZ(i, x * kx, y, z * kz);
    uv.setXY(i, (x + z) / UV_UNIT, y / UV_UNIT);
  }
  geometry.computeVertexNormals();
  return geometry;
}
function hoodoo(g, x, z, scale, seed, materials) {   // a Yehliu mushroom rock: a pinched sandstone neck under a pitted brown cap
  const y = groundAt(g, x, z);
  const neckHeight = .12 * scale;
  const profile = [[.07, 0], [.05, neckHeight * .4], [.035, neckHeight * .8], [.04, neckHeight], [.001, neckHeight * 1.02]].map(([px, py]) => new THREE.Vector2(px * scale, py));
  lmAdd(g, new THREE.LatheGeometry(profile, 10), materials.neck, x, y - .005, z);
  const capMesh = lmAdd(g, roughMass(.09 * scale, .055 * scale, .08 * scale, { seed, jitter: .18, detail: 2 }), materials.cap, x, y + neckHeight + .03 * scale, z);
  capMesh.rotation.y = seed;
}
function archGateway(g, { x = 0, z = 0, y = 0, width = 1.6, height = .5, depth = .14, wall = LM.white, roof, bays = 5 }) {   // a monumental gateway: bays of piers with taller centre, each bay under its own hipped roof
  const bayWidth = width / bays;
  for (let i = 0; i < bays; i++) {
    const centre = Math.abs(i - (bays - 1) / 2), bx = x - width / 2 + bayWidth * (i + .5);
    const h = height * (1 - centre * .14);
    for (const side of [-1, 1]) lmBox(g, bayWidth * .2, h, depth, wall, bx + side * bayWidth * .4, y, z);
    lmBox(g, bayWidth, h * .18, depth, wall, bx, y + h * .82, z);
    lmHip(g, bayWidth * .2, bayWidth * .56, h * .2, roof, bx, y + h, z, depth / bayWidth * 1.6 + .4);
  }
}

const TAIWAN_DETAILS = {
  cks(g, box) {      // Liberty Square: the five-arched white gate with dark-blue roofs, and the blue-capped white walls running back to the hall
    const navyTile = lmMaterial(0x1f3a8a, { map: TEXTURES.tiles });
    const gz = box.max.z + .8;
    archGateway(g, { z: gz, width: 1.7, height: .62, depth: .16, roof: navyTile });
    for (const side of [-1, 1]) {
      lmBox(g, .05, .14, gz - box.min.z, LM.white, side * 1.45, 0, (gz + box.min.z) / 2);
      lmBox(g, .08, .03, gz - box.min.z, navyTile, side * 1.45, .14, (gz + box.min.z) / 2);
      for (let k = 0; k < 6; k++) lmBox(g, .05, .035, .05, navyTile, side * 1.45, .1, box.min.z + .2 + k * (gz - box.min.z - .4) / 5);
    }
    lmBox(g, .7, .006, gz - box.max.z - .1, lmMaterial(0xd8d4c8, { map: TEXTURES.stone }), 0, 0, (gz + box.max.z) / 2);   // paved processional way
  },
  palaceMuseum(g, box) {   // the white-marble "天下為公" pailou gateway with teal roofs and the long stair approach
    const tealTile = lmMaterial(0x3f9c86, { map: TEXTURES.tiles });
    const gz = box.max.z + .55, cx = (box.min.x + box.max.x) / 2;
    archGateway(g, { x: cx, z: gz, width: 1.0, height: .36, depth: .07, roof: tealTile, wall: lmMaterial(0xf2efe6) });
    lmBox(g, .55, .006, gz - box.max.z, lmMaterial(0xe8e2d2, { map: TEXTURES.stone }), cx, 0, (gz + box.max.z) / 2);
    for (const side of [-1, 1]) for (let k = 0; k < 6; k++) lmCyl(g, .012, .014, .06, LM.white, cx + side * .3, 0, box.max.z + .06 + k * (gz - box.max.z - .1) / 5, 6);
  },
  lake(g, box) {     // Lalu island in the middle with its white pavilion, and the red Wenwu Temple climbing the north shore
    const isle = lmMaterial(0x3e8a4e, { roughness: 1 });
    lmAdd(g, roughMass(.08, .025, .06, { seed: 4, jitter: .2 }), isle, -.08, .01, -.02);
    lmCyl(g, .016, .016, .03, LM.white, -.08, .025, -.02, 8);
    lmAdd(g, octagonRoof(.026, .004, .02), LM.roofRed, -.08, .055, -.02);
    const tx = -.35, tz = -.62, ty = groundAt(g, tx, tz);
    for (let k = 0; k < 3; k++) hallAt(g, { x: tx + k * .02, z: tz - k * .1, y: ty + k * .035, w: .2 - k * .02, d: .09, wallH: .045, wall: LM.vermilion, roof: LM.roofYellow, roofH: .045, double: k === 2, platformH: .015 });
    lmBox(g, .12, .05, .015, LM.vermilion, tx, ty - .02, tz + .09);           // the gate
    lmHip(g, .02, .075, .02, LM.roofYellow, tx, ty + .03, tz + .09, .4);
    for (let k = 0; k < 4; k++) lmBox(g, .02, .006, .03, LM.white, .05 + k * .1, .012, .18 - k * .05);   // little boats crossing
  },
  alishan(g, box) {  // the 2000-year-old Sacred Tree, cherry blossom and the little wooden station
    const bark = lmMaterial(0x6a4e38, { map: TEXTURES.wood }), crown = lmMaterial(0x2c5f3a, { roughness: 1 });
    const blossom = lmMaterial(0xf5bfd0, { roughness: .9 });
    const sx = box.min.x * .45, sz = box.min.z * .4, sy = groundAt(g, sx, sz);
    lmCyl(g, .05, .085, .55, bark, sx, sy - .02, sz, 10);
    for (const [dx, dy, dz, r] of [[0, .6, 0, .12], [.07, .52, .04, .08], [-.06, .5, -.03, .09]]) lmAdd(g, roughMass(r, r * .8, r, { seed: 7 + dx * 50, jitter: .25, detail: 1 }), crown, sx + dx, sy + dy, sz + dz);
    lmBox(g, .09, .02, .09, LM.wood, sx + .1, sy, sz + .08);                 // viewing deck at its foot
    for (let k = 0; k < 7; k++) {
      const x = box.max.x * (.15 + k * .1), z = box.max.z * .55 - (k % 2) * .12, y = groundAt(g, x, z);
      lmCyl(g, .008, .012, .09, LM.trunk, x, y, z, 6);
      lmAdd(g, roughMass(.06, .045, .06, { seed: 40 + k, jitter: .3, detail: 1 }), blossom, x, y + .11, z);
    }
    const stationX = box.max.x * .6, stationZ = box.min.z * .25, stationY = groundAt(g, stationX, stationZ);
    hallAt(g, { x: stationX, z: stationZ, y: stationY, w: .2, d: .1, wallH: .06, wall: lmMaterial(0xc9a173, { map: TEXTURES.wood }), roof: LM.roofGreen, roofH: .05, double: false, platformH: .01 });
  },
  gorge(g, box) {    // Eternal Spring Shrine with its waterfall, and the red arched Cimu Bridge with white lions across the river
    const red = lmMaterial(0xc8341f), lion = lmMaterial(0xf0eee6);
    const sx = .3, sz = .45, sy = .32;
    lmBox(g, .12, .012, .1, LM.stone, sx, sy - .012, sz);
    hallAt(g, { x: sx, z: sz, y: sy, w: .1, d: .07, wallH: .045, wall: red, roof: LM.roofDark, roofH: .045, double: false, platformH: .005 });
    lmBox(g, .03, sy - .02, .012, lmMaterial(0xf4f8fb, { roughness: .3, transparent: true, opacity: .85 }), sx - .03, 0, sz + .055);   // the spring falling out of the cliff
    const bz = .62, rise = .06;
    const arch = new THREE.TorusGeometry(.2, .012, 6, 24, Math.PI);
    lmAdd(g, arch, red, 0, .1, bz).scale.set(1, rise / .2 + .3, 2.5);
    lmBox(g, .44, .012, .07, red, 0, .1 + rise * .9, bz);
    for (const side of [-1, 1]) for (const dz of [-.03, .03]) lmAdd(g, roughMass(.012, .016, .012, { seed: 3 + side + dz * 10, jitter: .1, detail: 1 }), lion, side * .22, .16 + rise * .5, bz + dz);
  },
  queenhead(g, box) {   // a field of mushroom rocks and candle rocks across the cape
    const materials = { neck: lmMaterial(0xc99a4a, { roughness: 1 }), cap: lmMaterial(0x6f5a48, { map: TEXTURES.pits, roughness: 1 }) };
    const spots = [[-.6, -.3, 1.1], [-.4, -.55, .8], [-.15, -.6, 1.0], [.25, -.5, .7], [.45, -.25, 1.2], [.6, .1, .9], [-.7, .15, .75], [.3, .3, .85], [-.35, .3, .65], [.05, -.35, .6]];
    spots.forEach(([x, z, s], k) => hoodoo(g, x, z, s, 50 + k, materials));
    for (const [x, z] of [[.75, -.45], [.82, -.3]]) {          // candle rocks: a cone with a ball on top
      const y = groundAt(g, x, z);
      lmAdd(g, new THREE.ConeGeometry(.05, .14, 9), materials.neck, x, y + .06, z);
      lmAdd(g, new THREE.SphereGeometry(.025, 10, 8), materials.cap, x, y + .14, z);
    }
  },
  hongmaocheng(g, box) {   // Fort San Domingo itself: the squat red keep with a crenellated parapet, white-framed windows and its row of flags
    const red = lmMaterial(0xb24a32, { map: TEXTURES.brick }), trim = lmMaterial(0xf2efe6);
    const fx = box.max.x + .55, fz = (box.min.z + box.max.z) / 2;
    lmBox(g, .6, .5, .6, red, fx, 0, fz);
    lmBox(g, .64, .04, .64, trim, fx, .5, fz);
    for (let k = 0; k < 6; k++) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const t = -.25 + k * .1;
      lmBox(g, dz ? .05 : .05, .06, dz ? .05 : .05, red, fx + (dx ? dx * .3 : t), .54, fz + (dz ? dz * .3 : t));
    }
    for (const level of [.12, .32]) for (const t of [-.15, .15]) {
      lmBox(g, .07, .1, .012, trim, fx + t, level, fz + .305);
      lmBox(g, .05, .08, .014, LM.black, fx + t, level + .01, fz + .306);
    }
    const flagColours = [0xc8102e, 0x003893, 0xffd100, 0xffffff, 0x00843d, 0xd52b1e, 0x003f87, 0xfcd116];
    flagColours.forEach((colour, k) => {
      const x = fx - .45 + k * .13, z = fz + .55;
      lmCyl(g, .004, .004, .3, LM.white, x, 0, z, 5);
      lmBox(g, .07, .045, .004, lmMaterial(colour), x + .037, .25, z);
    });
  },
  foguangshan(g, box) {   // the Front Hall at the head of the avenue: a long cream hall under orange roofs with a gate tower at each end
    const orange = lmMaterial(0xe8841e, { map: TEXTURES.tiles, roughness: .5 }), cream = lmMaterial(0xe6dcc4, { map: TEXTURES.windows });
    const z = box.max.z + .35, cx = (box.min.x + box.max.x) / 2;
    lmBox(g, 1.4, .16, .28, cream, cx, 0, z);
    lmHip(g, .5, .74, .1, orange, cx, .16, z, .4);
    for (const side of [-1, 1]) { lmBox(g, .22, .3, .3, cream, cx + side * .8, 0, z); lmHip(g, .04, .16, .12, orange, cx + side * .8, .3, z); }
  },
  village(g, box) {   // red lanterns hung down the stair street
    for (let k = 0; k < 10; k++) {
      const z = box.max.z - .1 - k * (box.max.z - box.min.z) * .08, x = -.02 + Math.sin(k) * .03, y = groundAt(g, x, z);
      lmAdd(g, new THREE.SphereGeometry(.018, 8, 6), LM.lantern, x, y + .1, z).scale.set(1, 1.2, 1);
    }
  },
  anping(g, box) {   // the 17th-century red-brick wall remnant, half swallowed by banyan roots
    const oldBrick = lmMaterial(0x8e4a34, { map: TEXTURES.brick, roughness: 1 }), root = lmMaterial(0x6b5a45, { roughness: 1 });
    const wx = box.min.x - .25;
    for (let k = 0; k < 7; k++) lmAdd(g, jaggedSlab(.12, .22 + (k % 3) * .05, .16, 60 + k, .12), oldBrick, wx, .11, box.min.z + .15 + k * .17);
    for (let k = 0; k < 6; k++) lmCyl(g, .012, .02, .25, root, wx + .05, 0, box.min.z + .2 + k * .19, 5).rotation.z = .3 * (k % 2 ? 1 : -1);
    lmAdd(g, roughMass(.24, .14, .3, { seed: 14, jitter: .25 }), lmMaterial(0x2f6b3a, { roughness: 1 }), wx, .32, box.min.z + .6);
  },
  chihkan(g, box) {  // the nine stone turtles carrying their tablets, lined up in front, and a lotus pond
    const stone = lmMaterial(0x8c8c84, { map: TEXTURES.stone });
    const z = box.max.z + .2;
    for (let k = 0; k < 9; k++) {
      const x = -.64 + k * .16;
      lmAdd(g, roughMass(.055, .03, .07, { seed: 70 + k, jitter: .1, detail: 1 }), stone, x, .02, z);
      lmBox(g, .06, .14, .015, stone, x, .04, z - .01);
    }
    lmBox(g, .8, .006, .3, LM.water, -.3, 0, z + .3);
    for (let k = 0; k < 6; k++) lmCyl(g, .02, .02, .004, LM.green, -.6 + k * .12, .007, z + .25 + (k % 2) * .08, 8);
  }
};
for (const [name, addDetail] of Object.entries(TAIWAN_DETAILS)) {
  const build = LANDMARK_BUILDERS[name];
  if (!build) continue;
  LANDMARK_BUILDERS[name] = (options) => {
    const g = build(options);
    const box = new THREE.Box3().setFromObject(g);
    addDetail(g, box);
    return g;
  };
}

// --- Japan & Korea detail pass (drawn from reference photos) -------------------------------------------------------
const JK = {
  ryukyuRed: lmMaterial(0xb8321f), ryukyuTile: lmMaterial(0xc4472c, { map: TEXTURES.tiles }), ryukyuGold: lmMaterial(0xe0b23a, { metalness: .5, roughness: .35 }),
  koreanTile: lmMaterial(0x4b5057, { map: TEXTURES.tiles }), koreanPillar: lmMaterial(0xa3301f), dancheongGreen: lmMaterial(0x2f7d62), dancheongBlue: lmMaterial(0x2a6f8f),
  dancheongRed: lmMaterial(0xc7442a), lattice: lmMaterial(0x7a2e22, { map: TEXTURES.windows }), granite: lmMaterial(0xd9d6cc, { map: TEXTURES.stone }),
  whiteConcrete: lmMaterial(0xeef0f0), glassBlue: lmMaterial(0x8fb4c8, { map: TEXTURES.windows, metalness: .55, roughness: .22 }),
  goldGlass: lmMaterial(0xd8ad45, { map: TEXTURES.windows, metalness: .65, roughness: .22, emissive: 0x4a3200, emissiveIntensity: .25 }),
  bronze: lmMaterial(0x5f7f6c, { roughness: .45, metalness: .45 }), thatch: lmMaterial(0x9c8452, { roughness: 1 }), timberDark: lmMaterial(0x4a3426, { map: TEXTURES.wood }),
  paddyGold: lmMaterial(0xd9b54a, { roughness: 1 }), paddyGreen: lmMaterial(0x6f9a3e, { roughness: 1 }), forest: lmMaterial(0x355f3c, { roughness: 1 }),
  autumn: lmMaterial(0xc8642a, { roughness: 1 }), autumnGold: lmMaterial(0xd9a23a, { roughness: 1 }), grass: lmMaterial(0x5f8f4a, { roughness: 1 }),
  water: lmMaterial(0x3a86b8, { roughness: .15, metalness: .15 }), rock: lmMaterial(0x7d7468, { roughness: 1 }), rockDark: lmMaterial(0x5a524a, { roughness: 1 }),
  steelRed: lmMaterial(0xd2452a), white: lmMaterial(0xf4f5f6), dark: lmMaterial(0x23272c), pinkStone: lmMaterial(0xe8d9cf),
  castleWhite: lmMaterial(0xf1ece6), castleBlue: lmMaterial(0x3f6fc2, { map: TEXTURES.tiles }), castleGold: lmMaterial(0xe3b545, { metalness: .6, roughness: .3 })
};

// A Korean palace hall: stone terrace, red columns, lattice doors, a painted (dancheong) bracket band under deep eaves and a
// dark-grey tiled hipped-gable roof with curved, upturned corners; optionally two storeys.
function koreanHallAt(g, { x = 0, y = 0, z = 0, w = .8, d = .45, wallH = .18, roofH = .16, double = false, terrace = .05, terraces = 1, yaw = 0 }) {
  const h = new THREE.Group(); h.position.set(x, y, z); h.rotation.y = yaw; g.add(h);
  let yy = 0;
  for (let k = 0; k < terraces; k++) { lmBox(h, w * (1.5 - k * .12), terrace, d * (1.8 - k * .15), JK.granite, 0, yy, 0); yy += terrace; }
  const storey = (sw, sd, sh, roofScale) => {
    lmBox(h, sw * .94, sh, sd * .9, JK.lattice, 0, yy, 0);
    const columns = Math.max(3, Math.round(sw / .14));
    for (let i = 0; i <= columns; i++) for (const side of [-1, 1]) lmCyl(h, .014, .016, sh, JK.koreanPillar, -sw / 2 + sw * i / columns, yy, side * sd / 2, 8);
    for (const side of [-1, 1]) for (let i = 1; i < 3; i++) lmCyl(h, .014, .016, sh, JK.koreanPillar, side * sw / 2, yy, -sd / 2 + sd * i / 3, 8);
    yy += sh;
    lmBox(h, sw * 1.04, sh * .16, sd * 1.06, JK.dancheongGreen, 0, yy, 0);                // painted bracket band
    lmBox(h, sw * 1.06, sh * .05, sd * 1.08, JK.dancheongRed, 0, yy + sh * .16, 0);
    lmBox(h, sw * 1.1, sh * .06, sd * 1.12, JK.dancheongBlue, 0, yy + sh * .21, 0);
    yy += sh * .27;
    const half = sw * .5 * roofScale;
    lmHip(h, half * .55, half * 1.35, roofH, JK.koreanTile, 0, yy, 0, sd / sw * 1.25);
    lmBox(h, half * 1.15, roofH * .12, .03, JK.dark, 0, yy + roofH * .92, 0);             // ridge
    for (const side of [-1, 1]) lmBox(h, .03, roofH * .3, .03, JK.dark, side * half * .58, yy + roofH * .9, 0);   // ridge-end ornaments
    yy += roofH;
  };
  storey(w, d, wallH, 1);
  if (double) { yy -= roofH * .45; storey(w * .72, d * .7, wallH * .7, 1); }
  return h;
}
function koreanWall(g, { x0, z0, x1, z1, height = .09, roofed = true }) {   // a plastered wall with a small tiled coping
  const length = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(-(z1 - z0), x1 - x0);
  lmBox(g, length, height, .04, JK.pinkStone, (x0 + x1) / 2, 0, (z0 + z1) / 2, yaw);
  if (roofed) lmBox(g, length, .02, .07, JK.koreanTile, (x0 + x1) / 2, height, (z0 + z1) / 2, yaw);
}
function crenellatedWall(g, { x0, z0, x1, z1, height = .14, depth = .07, material = JK.granite }) {
  const length = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(-(z1 - z0), x1 - x0);
  lmBox(g, length, height, depth, material, (x0 + x1) / 2, 0, (z0 + z1) / 2, yaw);
  const n = Math.max(2, Math.floor(length / .07));
  for (let i = 0; i < n; i++) {
    const t = (i + .5) / n;
    lmBox(g, length / n * .55, height * .28, depth * .8, material, x0 + (x1 - x0) * t, height, z0 + (z1 - z0) * t, yaw);
  }
}
// A smooth tower lofted from rounded-square slices; size(t) gives the half-width at height fraction t.
function loftedTower(height, size, { corner = .35, steps = 40, segments = 6 } = {}) {
  const ring = (half) => {
    const points = [], r = half * corner, inner = half - r;
    for (let q = 0; q < 4; q++) for (let s = 0; s <= segments; s++) {
      const angle = q * Math.PI / 2 + s / segments * Math.PI / 2;
      const cx = (q === 0 || q === 3 ? 1 : -1) * inner, cz = (q < 2 ? 1 : -1) * inner;
      points.push([cx + Math.cos(angle) * r, cz + Math.sin(angle) * r]);
    }
    return points;
  };
  const positions = [], uvs = [], index = [];
  const count = 4 * (segments + 1);
  for (let k = 0; k <= steps; k++) {
    const t = k / steps, pts = ring(Math.max(.0005, size(t)));
    pts.forEach(([px, pz], i) => { positions.push(px, t * height, pz); uvs.push(i / count * 8 * .14 / UV_UNIT, t * height / UV_UNIT); });   // a fixed number of window columns round the tower, so the grid stays vertical as it tapers
  }
  for (let k = 0; k < steps; k++) for (let i = 0; i < count; i++) {
    const a = k * count + i, b = k * count + (i + 1) % count, c = a + count, d = b + count;
    index.push(a, c, b, b, c, d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index); geometry.computeVertexNormals();
  return geometry;
}
function windowedBox(g, w, h, d, material, x, y, z) { return lmBox(g, w, h, d, material, x, y, z); }

Object.assign(LANDMARK_BUILDERS, {
  shuri() {        // Shuri Castle Seiden: a wide vermilion two-storey hall with orange-red Ryukyu tiles and white mortared ridges, the gilded karahafu porch with dragon columns, and the red-and-white striped Una courtyard
    const g = new THREE.Group();
    const plaster = lmMaterial(0xf2ede4);
    lmBox(g, 2.4, .06, 2.0, JK.granite, 0, 0, -.1);
    for (let i = 0; i < 9; i++) lmBox(g, 2.0, .004, .09, i % 2 ? JK.ryukyuRed : plaster, 0, .06, .35 + i * .09);   // the striped Una
    // main hall
    lmBox(g, 1.7, .08, .85, JK.granite, 0, .06, -.45);
    lmBox(g, 1.6, .32, .72, JK.ryukyuRed, 0, .14, -.45);
    for (let i = 0; i < 9; i++) lmBox(g, .1, .2, .006, LM.black, -.72 + i * .18, .18, -.088);         // lattice doors
    lmHip(g, .56, .98, .16, JK.ryukyuTile, 0, .46, -.45, .52);
    lmBox(g, 1.15, .04, .05, plaster, 0, .6, -.45);
    lmBox(g, 1.2, .2, .5, JK.ryukyuRed, 0, .6, -.48);
    for (let i = 0; i < 7; i++) lmBox(g, .1, .12, .006, LM.black, -.5 + i * .166, .64, -.228);
    lmHip(g, .36, .74, .2, JK.ryukyuTile, 0, .8, -.48, .5);
    lmBox(g, .78, .04, .05, plaster, 0, .99, -.48);
    for (const side of [-1, 1]) lmAdd(g, new THREE.SphereGeometry(.035, 10, 8), JK.ryukyuGold, side * .4, 1.04, -.48).scale.set(.6, 1.4, .6);   // dragon-head ridge ends
    // the karahafu porch out front, gilded, on dragon columns
    lmBox(g, .5, .28, .22, JK.ryukyuRed, 0, .14, -.02);
    curvedGableAt(g, { x: 0, y: .42, z: .1, width: .62, height: .2, depth: .05, material: JK.ryukyuTile });
    curvedGableAt(g, { x: 0, y: .43, z: .125, width: .46, height: .13, depth: .02, material: JK.ryukyuGold });
    for (const side of [-1, 1]) { lmCyl(g, .022, .022, .28, JK.ryukyuGold, side * .2, .14, .1, 10); lmCyl(g, .03, .03, .02, JK.ryukyuGold, side * .2, .4, .1, 10); }
    for (let s = 0; s < 4; s++) lmBox(g, .32, .02, .05, JK.granite, 0, .06 + s * .02, .24 - s * .04);
    // side halls framing the courtyard
    for (const side of [-1, 1]) {
      lmBox(g, .3, .18, 1.0, side < 0 ? lmMaterial(0xc9a173, { map: TEXTURES.wood }) : JK.ryukyuRed, side * 1.18, .06, .55);
      lmHip(g, .06, .2, .1, side < 0 ? LM.roofDark : JK.ryukyuTile, side * 1.18, .24, .55, 2.75);
    }
    // Hoshinmon gate closing the courtyard
    lmBox(g, .9, .18, .16, JK.ryukyuRed, 0, .06, 1.25);
    for (let i = 0; i < 3; i++) lmBox(g, .16, .13, .17, LM.black, -.28 + i * .28, .06, 1.25);
    lmHip(g, .2, .52, .1, JK.ryukyuTile, 0, .24, 1.25, .5);
    return g;
  },
  aquarium() {     // Churaumi Aquarium: long low buildings stepping down a slope toward the sea under great sweeping cream canopy roofs on slim columns, glass walls, and a pool plaza with the whale-shark fountain
    const g = new THREE.Group();
    const cream = lmMaterial(0xece6d8), concrete = lmMaterial(0xc9c6bd);
    for (let k = 0; k < 3; k++) {
      const z = -.6 + k * .6, y = .3 - k * .12, w = 2.2 - k * .2;
      lmBox(g, w, y, .55, concrete, 0, 0, z);
      lmBox(g, w * .9, .18, .45, JK.glassBlue, 0, y, z);
      for (let i = 0; i < 9; i++) lmCyl(g, .012, .012, .26, LM.white, -w * .45 + i * w * .9 / 8, y, z + .26, 6);
      const canopy = new THREE.CylinderGeometry(.9, .9, w * 1.02, 32, 1, true, -.42, .84);
      canopy.rotateZ(Math.PI / 2).rotateX(-Math.PI / 2);   // axis along x, the arc bulging upward
      const roof = lmAdd(g, canopy, cream, 0, y + .3 - .9 * .5, z); roof.scale.set(1, .5, .42); roof.material.side = THREE.DoubleSide;
    }
    lmBox(g, 1.4, .02, .7, concrete, 0, 0, 1.0);
    lmBox(g, 1.0, .03, .45, JK.water, 0, .02, 1.0);
    const shark = lmAdd(g, roughMass(.22, .06, .07, { seed: 5, jitter: .05 }), lmMaterial(0x3b5f80), .1, .1, 1.0); shark.rotation.y = .4;
    lmAdd(g, new THREE.ConeGeometry(.05, .1, 3), shark.material, -.1, .12, 1.08).rotation.set(0, .4, Math.PI / 2);
    return g;
  },
  buddha() {       // Kamakura Daibutsu: the seated bronze Amida, hands in meditation, head of tight curls with long earlobes, slightly stooped, on a stone lotus base with a bronze incense burner and pines behind
    const g = new THREE.Group();
    lmBox(g, 1.3, .05, 1.2, JK.granite, 0, 0, 0);
    lmBox(g, 1.0, .06, .9, JK.granite, 0, .05, -.05);
    const lotus = [[.46, 0], [.5, .03], [.47, .08], [.4, .1], [.001, .1]].map(([r, y]) => new THREE.Vector2(r, y));
    lmAdd(g, new THREE.LatheGeometry(lotus, 24), JK.bronze, 0, .11, -.1).scale.z = .8;
    lmAdd(g, roughMass(.42, .14, .3, { seed: 2, jitter: .04 }), JK.bronze, 0, .3, -.06);                 // crossed legs
    const robe = [[.4, 0], [.36, .1], [.31, .22], [.29, .32], [.28, .4], [.22, .45], [.09, .48], [.001, .49]].map(([r, y]) => new THREE.Vector2(r, y));
    const body = lmAdd(g, new THREE.LatheGeometry(robe, 22), JK.bronze, 0, .3, -.13); body.scale.z = .62; body.rotation.x = .08;   // robed torso, slightly stooped
    lmAdd(g, new THREE.SphereGeometry(1, 12, 8), JK.bronze, 0, .38, .1).scale.set(.16, .05, .09);           // hands in the meditation mudra
    const head = lmAdd(g, new THREE.SphereGeometry(.13, 16, 12), lmMaterial(0x5f7f6c, { map: TEXTURES.pits, roughness: .5, metalness: .4 }), 0, .9, -.1);
    head.scale.set(1, 1.12, 1);
    lmAdd(g, new THREE.SphereGeometry(.06, 12, 8), head.material, 0, 1.03, -.11);                         // ushnisha
    for (const side of [-1, 1]) lmBox(g, .025, .12, .04, JK.bronze, side * .13, .82, -.1);                 // long earlobes
    const burner = lmCyl(g, .06, .05, .08, JK.bronze, 0, .05, .45, 10); burner.scale.z = .8;
    lmAdd(g, octagonRoof(.08, .01, .05), JK.bronze, 0, .13, .45);
    for (const [x, z, s] of [[-.6, -.6, 2.2], [.6, -.65, 2.6], [-.75, .1, 1.8], [.78, .05, 1.9]]) gardenPine(g, x, z, s);
    return g;
  },
  gassho() {       // Shirakawa-go: steep A-frame thatched gassho-zukuri farmhouses, gable ends of dark timber with rows of small windows, set among golden and green rice paddies with forested hills behind
    const g = new THREE.Group();
    lmBox(g, 3.0, .01, 2.4, JK.grass, 0, 0, 0);
    for (let i = 0; i < 8; i++) lmBox(g, .6, .012, .45, i % 3 ? JK.paddyGold : JK.paddyGreen, -1.1 + (i % 4) * .7, .005, -.6 + Math.floor(i / 4) * 1.5);
    const house = (x, z, s, yaw) => {
      const h = new THREE.Group(); h.position.set(x, 0, z); h.rotation.y = yaw; h.scale.setScalar(s); g.add(h);
      lmBox(h, .44, .12, .8, JK.timberDark, 0, 0, 0);
      const tri = new THREE.Shape(); tri.moveTo(-.3, 0); tri.lineTo(.3, 0); tri.lineTo(0, .55); tri.closePath();
      const roof = new THREE.ExtrudeGeometry(tri, { depth: .9, bevelEnabled: false }).translate(0, 0, -.45);
      lmAdd(h, roof, JK.thatch, 0, .12, 0);
      for (const side of [-1, 1]) {
        const gableShape = new THREE.Shape(); gableShape.moveTo(-.22, 0); gableShape.lineTo(.22, 0); gableShape.lineTo(0, .4); gableShape.closePath();
        lmAdd(h, new THREE.ExtrudeGeometry(gableShape, { depth: .01, bevelEnabled: false }), JK.timberDark, 0, .13, side * .455);
        for (let row = 0; row < 3; row++) for (let c = 0; c < 3 - row; c++) lmBox(h, .05, .04, .012, lmMaterial(0xf2e8d0), -.07 * (2 - row) / 2 * 2 + c * .07 + (row ? .035 * row : 0) - .0, .16 + row * .1, side * .462);
      }
      lmBox(h, .05, .03, .92, LM.roofDark, 0, .66, 0);
    };
    [[-.8, -.1, 1, .1], [-.1, .2, 1.1, -.05], [.7, -.15, .95, .15], [.3, .9, .9, 0], [-.6, .95, .85, .2], [1.1, .85, .9, -.1]].forEach(([x, z, s, yaw]) => house(x, z, s, yaw));
    for (let i = 0; i < 6; i++) lmAdd(g, roughMass(.5, .45, .3, { seed: 20 + i, jitter: .2 }), JK.forest, -1.3 + i * .55, .1, -1.3);
    return g;
  },
  fort() {         // Goryokaku: the five-pointed star fort of grassy ramparts edged in stone, ringed by its star-shaped moat, the magistrate's office inside, cherry trees, and the white observation tower with its star-shaped glass deck
    const g = new THREE.Group();
    const star = (outer, inner) => { const s = new THREE.Shape(); for (let i = 0; i < 10; i++) { const r = i % 2 ? inner : outer, a = i / 10 * Math.PI * 2 - Math.PI / 2; s[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } s.closePath(); return s; };
    const flat = (shape, depth, material, y) => { const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }).rotateX(-Math.PI / 2); return lmAdd(g, geometry, material, 0, y, 0); };
    flat(star(1.3, .78), .01, JK.grass, 0);
    flat(star(1.18, .7), .012, JK.water, 0);
    flat(star(1.02, .6), .05, JK.granite, 0);
    flat(star(.98, .57), .055, JK.grass, 0);
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, r = .5 + (i % 2) * .15; lmAdd(g, new THREE.SphereGeometry(.07, 8, 6), LM.pink, Math.cos(a) * r, .14, Math.sin(a) * r).scale.y = .7; }
    lmBox(g, .4, .08, .22, LM.plaster, .05, .055, .1);
    lmHip(g, .1, .26, .07, LM.roofDark, .05, .135, .1, .6);
    // the tower
    const tx = .25, tz = -.25;
    lmBox(g, .3, .1, .3, JK.whiteConcrete, tx, .055, tz);
    lmCyl(g, .06, .09, 1.5, JK.whiteConcrete, tx, .15, tz, 10);
    const deck = flat(star(.2, .12), .14, JK.glassBlue, 1.62); deck.position.set(tx, 1.62, tz);
    const roof = flat(star(.21, .13), .03, JK.whiteConcrete, 1.76); roof.position.set(tx, 1.76, tz);
    const base = flat(star(.19, .11), .03, JK.whiteConcrete, 1.59); base.position.set(tx, 1.59, tz);
    lmCyl(g, .01, .01, .2, JK.whiteConcrete, tx, 1.79, tz, 6);
    return g;
  },
  sapporoTower() { // Sapporo TV Tower: an orange-red steel lattice on splayed legs, a white observation deck at mid height with the big digital clock, and a slender lattice mast on top
    const g = new THREE.Group();
    lmBox(g, .5, .12, .5, JK.whiteConcrete, 0, 0, 0);
    latticeTower(g, { base: .22, top: .07, height: .62, sections: 6, reds: JK.steelRed, whites: JK.steelRed, radius: .008, y: .12 });
    lmBox(g, .22, .12, .22, JK.white, 0, .7, 0);
    lmBox(g, .23, .06, .23, JK.glassBlue, 0, .74, 0);
    lmBox(g, .14, .05, .01, LM.black, 0, .62, .11);
    lmBox(g, .12, .03, .012, lmMaterial(0xffe9a0, { emissive: 0xffd060, emissiveIntensity: .8 }), 0, .63, .112);   // the clock
    latticeTower(g, { base: .06, top: .015, height: .45, sections: 6, reds: JK.steelRed, whites: JK.white, radius: .005, y: .82 });
    lmCyl(g, .004, .004, .12, JK.steelRed, 0, 1.27, 0, 5);
    return g;
  },
  kyotoTower() {   // Kyoto Tower: a slim white cylinder like a lighthouse rising from a broad nine-storey office block, a round windowed observation deck and a red-and-white tip
    const g = new THREE.Group();
    lmBox(g, .9, .3, .45, lmMaterial(0xe6e4dc, { map: TEXTURES.windows }), 0, 0, 0);
    lmBox(g, .92, .02, .47, JK.white, 0, .3, 0);
    const shaft = [[.07, 0], [.075, .3], [.068, .6], [.05, .74], [.07, .78]].map(([r, y]) => new THREE.Vector2(r, y));
    lmAdd(g, new THREE.LatheGeometry(shaft, 20), JK.white, 0, .32, 0);
    lmCyl(g, .12, .1, .03, JK.white, 0, 1.08, 0, 20);
    lmCyl(g, .12, .12, .06, JK.glassBlue, 0, 1.11, 0, 20);
    lmCyl(g, .1, .12, .03, JK.white, 0, 1.17, 0, 20);
    lmCyl(g, .05, .07, .05, JK.white, 0, 1.2, 0, 16);
    for (let i = 0; i < 4; i++) lmCyl(g, .02 - i * .004, .022 - i * .004, .04, i % 2 ? JK.white : JK.steelRed, 0, 1.25 + i * .04, 0, 10);
    return g;
  },
  tsutenkaku() {   // Tsutenkaku: a steel lattice tower that straddles the street on four arched legs, a big white observation deck with a lit sign, a second lattice stage and an upper gallery under a pointed cap
    const g = new THREE.Group();
    const steel = lmMaterial(0xc9ccd0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) lmBox(g, .05, .22, .05, steel, sx * .22, 0, sz * .22);
    for (const [ax, az] of [[1, 0], [0, 1]]) for (const side of [-1, 1]) {
      const arch = new THREE.TorusGeometry(.22, .018, 6, 16, Math.PI);
      const mesh = lmAdd(g, arch, steel, side * .22 * az, .2, side * .22 * ax); mesh.rotation.y = ax ? 0 : Math.PI / 2; mesh.scale.y = .6;
    }
    latticeTower(g, { base: .22, top: .12, height: .42, sections: 5, reds: steel, whites: steel, radius: .008, y: .32 });
    lmBox(g, .36, .14, .36, JK.white, 0, .74, 0);
    lmBox(g, .37, .05, .37, JK.glassBlue, 0, .79, 0);
    lmBox(g, .3, .06, .01, lmMaterial(0xff5a3c, { emissive: 0xff3010, emissiveIntensity: .7 }), 0, .67, .186);
    latticeTower(g, { base: .1, top: .06, height: .28, sections: 4, reds: steel, whites: steel, radius: .006, y: .88 });
    lmBox(g, .16, .07, .16, JK.white, 0, 1.16, 0);
    lmAdd(g, new THREE.ConeGeometry(.08, .16, 4).rotateY(Math.PI / 4), JK.white, 0, 1.31, 0);
    lmCyl(g, .004, .004, .1, steel, 0, 1.39, 0, 5);
    return g;
  },
  fairyCastle() {  // the fairy-tale castle: white walls and a tall central keep crowned with blue conical spires and gold finials, ringed by round turrets, a gilded archway and a moat
    const g = new THREE.Group();
    lmBox(g, 1.6, .02, 1.3, JK.water, 0, 0, 0);
    lmBox(g, 1.2, .3, .8, JK.castleWhite, 0, .02, 0);
    for (let i = 0; i < 12; i++) lmBox(g, .06, .05, .06, JK.castleWhite, -.55 + i * .1, .32, .4);
    lmBox(g, .2, .2, .03, JK.castleGold, 0, .02, .41);
    lmAdd(g, new THREE.CircleGeometry(.1, 16, 0, Math.PI), LM.black, 0, .12, .43);
    const turret = (x, z, r, h, y = .02) => {
      lmCyl(g, r, r, h, JK.castleWhite, x, y, z, 14);
      lmAdd(g, new THREE.ConeGeometry(r * 1.25, h * .8, 14), JK.castleBlue, x, y + h + h * .4, z);
      lmCyl(g, .006, .006, h * .25, JK.castleGold, x, y + h * 1.8, z, 5);
      lmAdd(g, new THREE.SphereGeometry(.015, 8, 6), JK.castleGold, x, y + h * 2.05, z);
    };
    for (const [x, z, r, h] of [[-.58, .38, .1, .5], [.58, .38, .1, .5], [-.58, -.38, .09, .45], [.58, -.38, .09, .45], [-.3, .2, .08, .65], [.3, .2, .08, .65], [-.25, -.2, .09, .75], [.25, -.2, .09, .75]]) turret(x, z, r, h);
    lmBox(g, .4, .55, .4, JK.castleWhite, 0, .32, -.05);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) lmBox(g, .05, .04, .05, JK.castleGold, sx * .19, .87, -.05 + sz * .19);
    turret(0, -.05, .13, .55, .87);
    return g;
  },
  tree(o = {}) {   // Jomon Sugi: a colossal gnarled cedar, its trunk fluted and buttressed, mossy, splitting into thick crooked limbs with clouds of dark needles, a wooden viewing deck at its foot
    const g = new THREE.Group();
    const bark = lmMaterial(0x6a5242, { map: TEXTURES.wood, roughness: 1 }), moss = lmMaterial(0x5e7f3a, { roughness: 1 }), needles = lmMaterial(0x2f5a35, { roughness: 1 });
    const girth = (o.girth ?? .14) * 2.2;
    const trunk = [[girth * 1.5, 0], [girth * 1.15, .08], [girth, .25], [girth * .9, .5], [girth * .75, .62], [girth * .5, .7]].map(([r, y]) => new THREE.Vector2(r, y));
    const trunkGeometry = new THREE.LatheGeometry(trunk, 14);
    const pos = trunkGeometry.attributes.position;
    for (let i = 0; i < pos.count; i++) { const a = Math.atan2(pos.getZ(i), pos.getX(i)), k = 1 + .14 * Math.sin(a * 7) + .06 * Math.sin(a * 3 + pos.getY(i) * 9); pos.setXYZ(i, pos.getX(i) * k, pos.getY(i), pos.getZ(i) * k); }
    trunkGeometry.computeVertexNormals();
    lmAdd(g, trunkGeometry, bark, 0, 0, 0);
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; lmAdd(g, roughMass(.09, .05, .06, { seed: k + 3, jitter: .3, detail: 1 }), moss, Math.cos(a) * girth * 1.1, .12 + (k % 2) * .2, Math.sin(a) * girth * 1.1); }
    for (const [dx, dz, tilt, len] of [[1, 0, .7, .35], [-.8, .4, -.6, .3], [.2, -1, .5, .32], [-.3, -.6, -.4, .28]]) {
      const limb = lmCyl(g, girth * .2, girth * .35, len, bark, dx * girth * .3, .62, dz * girth * .3, 8);
      limb.rotation.set(dz * tilt, 0, -dx * tilt);
      lmAdd(g, roughMass(.2, .1, .18, { seed: 30 + dx * 7, jitter: .3 }), needles, dx * (girth * .3 + len * .7), .62 + len * .7, dz * (girth * .3 + len * .7));
    }
    lmAdd(g, roughMass(.28, .14, .24, { seed: 40, jitter: .3 }), needles, 0, .95, 0);
    lmBox(g, .5, .02, .18, LM.wood, 0, .04, girth * 2 + .2);
    for (const x of [-.24, .24]) lmCyl(g, .01, .01, .08, LM.wood, x, .04, girth * 2 + .29, 5);
    lmBox(g, .5, .012, .012, LM.wood, 0, .12, girth * 2 + .29);
    return g;
  },
  statue() {       // Nagasaki Peace Statue: a massive seated figure in pale blue-green bronze, right hand pointing to the sky, left arm stretched out level, eyes closed, on a tall granite pedestal at the end of the park
    const g = new THREE.Group();
    const statueMaterial = lmMaterial(0x8fb3b0, { roughness: .5, metalness: .3 });
    lmBox(g, .7, .3, .5, JK.granite, 0, 0, 0);
    lmBox(g, .5, .05, .4, JK.granite, 0, .3, 0);
    lmAdd(g, roughMass(.24, .07, .18, { seed: 3, jitter: .05 }), statueMaterial, 0, .42, .02);          // the bench-seated hips and thighs
    for (const side of [-1, 1]) { lmBox(g, .07, .2, .08, statueMaterial, side * .1, .3, .18); }             // shins
    lmBox(g, .12, .05, .08, statueMaterial, -.1, .3, .26); lmBox(g, .12, .05, .2, statueMaterial, .12, .35, .22).rotation.x = -.6;   // one foot down, one drawn back
    lmAdd(g, new THREE.SphereGeometry(1, 14, 10), statueMaterial, 0, .62, 0).scale.set(.2, .19, .12);       // broad, muscular torso
    lmAdd(g, new THREE.SphereGeometry(.07, 14, 10), statueMaterial, 0, .86, .0);                          // head
    lmAdd(g, new THREE.SphereGeometry(.05, 10, 8), statueMaterial, .16, .74, 0);                            // shoulders
    lmAdd(g, new THREE.SphereGeometry(.05, 10, 8), statueMaterial, -.16, .74, 0);
    lmCyl(g, .028, .034, .18, statueMaterial, .18, .74, 0, 8);                                              // right arm raised, pointing to the sky
    lmCyl(g, .016, .026, .1, statueMaterial, .18, .92, 0, 8);
    const left = lmCyl(g, .028, .034, .32, statueMaterial, -.36, .74 - .16, 0, 8); left.rotation.z = Math.PI / 2;   // left arm stretched out level
    lmAdd(g, new THREE.SphereGeometry(.03, 8, 6), statueMaterial, -.53, .74, 0).scale.set(1.2, .7, 1);
    return g;
  },
  gyeongbokgung() { // Gyeongbokgung: Gwanghwamun's granite base with three arched gates under a two-tier pavilion, the long courtyard, and Geunjeongjeon on its double stone terrace, with Bugaksan rising behind
    const g = new THREE.Group();
    lmBox(g, 2.4, .01, 2.6, lmMaterial(0xd8d0bc), 0, 0, 0);
    // Gwanghwamun
    lmBox(g, 1.3, .26, .42, JK.granite, 0, 0, 1.0);
    for (const x of [-.36, 0, .36]) { lmBox(g, .16, .15, .43, LM.black, x, 0, 1.0); lmAdd(g, new THREE.CircleGeometry(.08, 16, 0, Math.PI), LM.black, x, .15, 1.215); }
    koreanHallAt(g, { y: .26, z: 1.0, w: .8, d: .3, wallH: .1, roofH: .1, double: true, terrace: .0001 });
    for (const side of [-1, 1]) koreanWall(g, { x0: side * .65, z0: 1.0, x1: side * 1.15, z1: 1.0, height: .14 });
    // corridors round the throne-hall court
    for (const side of [-1, 1]) {
      lmBox(g, .14, .1, 1.3, JK.lattice, side * .95, 0, -.3);
      lmHip(g, .03, .12, .06, JK.koreanTile, side * .95, .1, -.3, 9);
    }
    lmBox(g, .2, .004, 1.1, JK.granite, 0, .01, .35);
    koreanHallAt(g, { z: -.45, w: .9, d: .5, wallH: .17, roofH: .15, double: true, terrace: .06, terraces: 2 });
    lmAdd(g, roughMass(1.2, .8, .5, { seed: 8, jitter: .15 }), lmMaterial(0x50705a, { roughness: 1 }), .2, 0, -1.5);
    lmAdd(g, roughMass(.6, .35, .4, { seed: 9, jitter: .25 }), lmMaterial(0x9a9a8c, { roughness: 1 }), .2, .55, -1.55);   // the granite crown of the peak
    return g;
  },
  koreanHall() {    // Changdeokgung: Injeongjeon, a two-storey throne hall on a raised stone terrace behind Donhwamun gate, walled courtyard, autumn trees on the hills around
    const g = new THREE.Group();
    lmBox(g, 2.2, .01, 2.0, lmMaterial(0xd8d0bc), 0, 0, 0);
    koreanHallAt(g, { z: -.3, w: .9, d: .5, wallH: .16, roofH: .15, double: true, terrace: .06, terraces: 2 });
    koreanHallAt(g, { z: .75, w: .6, d: .25, wallH: .12, roofH: .1, double: true, terrace: .03 });
    koreanWall(g, { x0: -1.0, z0: .75, x1: -.35, z1: .75 }); koreanWall(g, { x0: .35, z0: .75, x1: 1.0, z1: .75 });
    for (const side of [-1, 1]) koreanWall(g, { x0: side * 1.0, z0: .75, x1: side * 1.0, z1: -.9 });
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; lmAdd(g, roughMass(.2, .18, .2, { seed: 12 + i, jitter: .3 }), i % 3 ? JK.autumn : JK.autumnGold, Math.cos(a) * 1.25, .12, Math.sin(a) * 1.0 - .2); }
    return g;
  },
  needleTower() {   // N Seoul Tower: a slim white concrete shaft from the Namsan summit, the stacked observation pod with its glass band, and the tall red-and-white antenna mast
    const g = new THREE.Group();
    lmCyl(g, .26, .3, .1, JK.whiteConcrete, 0, 0, 0, 12);
    lmCyl(g, .16, .18, .06, JK.glassBlue, 0, .1, 0, 12);
    lmCyl(g, .045, .07, .9, JK.whiteConcrete, 0, .16, 0, 16);
    lmCyl(g, .1, .06, .05, JK.whiteConcrete, 0, 1.0, 0, 20);
    lmCyl(g, .12, .12, .05, JK.glassBlue, 0, 1.05, 0, 20);
    lmCyl(g, .12, .12, .012, JK.white, 0, 1.1, 0, 20);
    lmCyl(g, .115, .115, .045, JK.glassBlue, 0, 1.112, 0, 20);
    lmCyl(g, .07, .115, .04, JK.whiteConcrete, 0, 1.157, 0, 20);
    lmCyl(g, .03, .04, .06, JK.whiteConcrete, 0, 1.197, 0, 12);
    for (let i = 0; i < 6; i++) lmCyl(g, .014 - i * .0015, .016 - i * .0015, .07, i % 2 ? JK.white : JK.steelRed, 0, 1.257 + i * .07, 0, 8);
    return g;
  },
  busanTower() {    // Busan Tower: a fluted white shaft crowned by a lantern-like observation deck wrapped in flaring white fins (a Silla pagoda top), above Yongdusan park
    const g = new THREE.Group();
    lmBox(g, .8, .02, .8, JK.granite, 0, 0, 0);
    lmCyl(g, .055, .07, .85, JK.whiteConcrete, 0, .02, 0, 8);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; lmBox(g, .014, .85, .03, JK.white, Math.cos(a) * .065, .02, Math.sin(a) * .065, -a); }
    const crown = [[.06, 0], [.14, .06], [.16, .12], [.13, .2], [.07, .24], [.04, .3]].map(([r, y]) => new THREE.Vector2(r, y));
    lmAdd(g, new THREE.LatheGeometry(crown, 16), JK.white, 0, .87, 0);
    lmCyl(g, .15, .15, .05, JK.glassBlue, 0, .95, 0, 16);
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; const fin = lmBox(g, .01, .2, .05, JK.white, Math.cos(a) * .16, .88, Math.sin(a) * .16, -a); fin.rotation.z = .25 * Math.cos(a); }
    lmCyl(g, .006, .01, .16, JK.white, 0, 1.17, 0, 6);
    return g;
  },
  lotteTower() {    // Lotte World Tower: a smooth, gently curving glass spire tapering from a rounded square to a slender open lantern at the top, standing on its mall podium
    const g = new THREE.Group();
    lmBox(g, .9, .06, .7, lmMaterial(0xd8dde2, { map: TEXTURES.windows }), 0, 0, 0);
    const height = 1.15, size = (t) => .14 * (1 - t) ** .55 + .012;
    lmAdd(g, loftedTower(height, size), lmMaterial(0xb8c9d6, { map: TEXTURES.windows, metalness: .6, roughness: .2 }), 0, .06, 0);
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const fin = lmCyl(g, .003, .008, .12, JK.white, sx * .016, .06 + height - .02, sz * .016, 5);
      fin.rotation.set(sz * .12, 0, -sx * .12);
    }
    return g;
  },
  slabTower() {     // the 63 Building: a slim tower of gold reflective glass whose one face sweeps in a long curve to the narrow top
    const g = new THREE.Group();
    const profile = new THREE.Shape();
    profile.moveTo(-.2, 0); profile.lineTo(.2, 0); profile.lineTo(.2, .3); profile.quadraticCurveTo(.16, .9, -.06, 1.25); profile.lineTo(-.2, 1.25); profile.closePath();
    const body = new THREE.ExtrudeGeometry(profile, { depth: .22, bevelEnabled: false }).translate(0, 0, -.11);
    const uv = body.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / UV_UNIT, uv.getY(i) / UV_UNIT);
    lmAdd(g, body, JK.goldGlass, 0, 0, 0);
    lmBox(g, .14, .04, .23, JK.goldGlass, -.13, 1.25, 0);
    lmBox(g, .6, .05, .4, lmMaterial(0xc7b07a), 0, 0, .05);
    return g;
  },
  hwaseong() {      // Hwaseong Fortress: crenellated stone walls winding along the ground, a gate with an arched passage under a two-tier pavilion, the half-moon outer wall in front, and the five-colour banners
    const g = new THREE.Group();
    lmBox(g, 2.4, .01, 1.6, JK.grass, 0, 0, 0);
    crenellatedWall(g, { x0: -1.2, z0: .2, x1: -.42, z1: .05 }); crenellatedWall(g, { x0: .42, z0: .05, x1: 1.2, z1: -.25 });
    lmBox(g, .84, .26, .32, JK.granite, 0, 0, 0);
    lmBox(g, .2, .18, .33, LM.black, 0, 0, 0); lmAdd(g, new THREE.CircleGeometry(.1, 16, 0, Math.PI), LM.black, 0, .18, .166);
    koreanHallAt(g, { y: .26, w: .56, d: .24, wallH: .1, roofH: .1, double: true, terrace: .0001 });
    const arc = new THREE.TorusGeometry(.45, .05, 6, 20, Math.PI);
    const ongseong = lmAdd(g, arc, JK.granite, 0, 0, .18); ongseong.rotation.x = -Math.PI / 2; ongseong.scale.z = 3;
    const colours = [0xf2c94c, 0xd8342c, 0x2b6fc0, 0xf4f4f4, 0x222222];
    for (let i = 0; i < 10; i++) {
      const t = i / 9, x = -1.1 + t * 2.2, z = (t < .5 ? .2 - t * .3 : .05 - (t - .5) * .6) - .02;
      if (Math.abs(x) < .45) continue;
      lmCyl(g, .004, .004, .3, LM.wood, x, .14, z, 5);
      lmBox(g, .004, .1, .07, lmMaterial(colours[i % 5]), x, .32, z + .035);
    }
    return g;
  },
  bulguksa() {      // Bulguksa: the great stone terrace with the double flights of the Blue Cloud and White Cloud bridges up to Jahamun gate, painted corridors along the top, Daeungjeon behind, and the Dabotap and Seokgatap pagodas
    const g = new THREE.Group();
    lmBox(g, 2.4, .01, 2.2, JK.grass, 0, 0, 0);
    lmBox(g, 2.0, .3, .1, lmMaterial(0xbab4a6, { map: TEXTURES.stone }), 0, 0, .55);
    lmBox(g, 2.0, .3, 1.2, lmMaterial(0xd8d0bc), 0, 0, -.06);
    for (let s = 0; s < 8; s++) { lmBox(g, .22, .02, .04, JK.granite, -.35, s * .038, .62 + (7 - s) * .035); lmBox(g, .22, .02, .04, JK.granite, -.35, .3 + s * .02, .52 - s * .03); }
    lmBox(g, .26, .02, .3, JK.granite, -.35, .3, .58);
    koreanHallAt(g, { x: -.35, y: .3, z: .4, w: .34, d: .16, wallH: .1, roofH: .08, terrace: .0001 });
    for (const x of [-.85, .1, .6]) { lmBox(g, .38, .09, .1, JK.lattice, x, .3, .5); lmHip(g, .08, .22, .06, JK.koreanTile, x, .39, .5, .4); }
    koreanHallAt(g, { x: -.2, y: .3, z: -.35, w: .6, d: .35, wallH: .14, roofH: .12, terrace: .03 });
    // Dabotap: an elaborate stone pagoda; Seokgatap: three plain tiers
    const pagodaStone = lmMaterial(0xcfc8b8, { map: TEXTURES.stone });
    lmBox(g, .12, .05, .12, pagodaStone, -.6, .3, .05); for (const sx of [-1, 1]) for (const sz of [-1, 1]) lmBox(g, .015, .07, .015, pagodaStone, -.6 + sx * .045, .35, .05 + sz * .045);
    lmBox(g, .14, .02, .14, pagodaStone, -.6, .42, .05); lmCyl(g, .04, .05, .06, pagodaStone, -.6, .44, .05, 8); lmAdd(g, octagonRoof(.07, .01, .04), pagodaStone, -.6, .5, .05); lmCyl(g, .006, .008, .08, pagodaStone, -.6, .54, .05, 6);
    for (let k = 0; k < 3; k++) { const s = .1 - k * .02; lmBox(g, s, .04, s, pagodaStone, .25, .3 + k * .06, .05); lmBox(g, s * 1.4, .012, s * 1.4, pagodaStone, .25, .34 + k * .06, .05); }
    lmCyl(g, .005, .008, .08, pagodaStone, .25, .48, .05, 6);
    return g;
  },
  skyline() {       // Haeundae: the three LCT towers with curved, pointed crowns, the slimmer residential towers of Marine City, and the long beach in front
    const g = new THREE.Group();
    lmBox(g, 2.4, .008, .5, LM.sand, 0, 0, .7);
    const tower = (x, z, w, h, crown) => {
      lmBox(g, w, h, w * .8, JK.glassBlue, x, 0, z);
      if (crown) {
        const tip = lmAdd(g, new THREE.ConeGeometry(w * .62, h * .12, 4, 1).rotateY(Math.PI / 4), lmMaterial(0xd9e2ea, { metalness: .5, roughness: .25 }), x, h + h * .06, z);
        tip.scale.z = .8;
      }
    };
    tower(0, 0, .2, 1.15, true); tower(-.32, .1, .16, .95, true); tower(.3, .12, .16, .92, true);
    [[-.75, -.1, .12, .7], [-.6, .25, .11, .6], [.7, -.15, .12, .74], [.6, .3, .1, .55], [-.95, .1, .1, .5], [.95, .05, .1, .52]].forEach(([x, z, w, h]) => tower(x, z, w, h, false));
    return g;
  },
  dokdo() {         // Dokdo: the two steep volcanic islets, the taller pointed West Islet and the flatter East Islet with its lighthouse, helipad and flag, and scattered rocks
    const g = new THREE.Group();
    lmAdd(g, roughMass(.4, .95, .36, { seed: 6, jitter: .22 }), JK.rock, -.5, 0, 0);
    lmAdd(g, roughMass(.2, .3, .18, { seed: 7, jitter: .3 }), JK.grass, -.5, .82, .02);
    lmAdd(g, roughMass(.45, .55, .38, { seed: 8, jitter: .2 }), JK.rockDark, .45, 0, .05);
    lmAdd(g, roughMass(.32, .12, .28, { seed: 9, jitter: .25 }), JK.grass, .45, .5, .05);
    lmCyl(g, .05, .05, .02, JK.white, .55, .55, .1, 12);
    lmCyl(g, .025, .03, .15, JK.white, .35, .55, .0, 10); lmCyl(g, .03, .03, .03, JK.glassBlue, .35, .7, 0, 10);
    lmBox(g, .1, .05, .08, JK.white, .5, .55, -.05);
    lmCyl(g, .003, .003, .14, JK.white, .58, .58, -.02, 5); lmBox(g, .06, .04, .003, JK.white, .61, .68, -.02);
    for (let k = 0; k < 6; k++) lmAdd(g, roughMass(.06, .06, .05, { seed: 20 + k, jitter: .3, detail: 1 }), JK.rockDark, -.2 + k * .12 * (k % 2 ? 1 : -1), 0, .42 - k * .05);
    return g;
  },
  haeinsa() {       // Haeinsa: terraces climbing the slope, the two long plain Janggyeong Panjeon halls with slatted windows that store the Tripitaka, the painted main hall below, and forested Gayasan around
    const g = new THREE.Group();
    const hall = lmMaterial(0xd9cdb6), slats = lmMaterial(0x5a4632, { map: TEXTURES.windows });
    for (let k = 0; k < 3; k++) lmBox(g, 2.0 - k * .3, .08, .7, JK.granite, 0, k * .08, .7 - k * .55);
    koreanHallAt(g, { y: .08, z: .55, w: .6, d: .3, wallH: .12, roofH: .1, terrace: .02 });
    for (const z of [-.25, -.62]) {
      lmBox(g, 1.3, .14, .2, hall, 0, .24, z);
      for (let i = 0; i < 10; i++) lmBox(g, .06, .05, .202, slats, -.58 + i * .13, .29, z);
      lmHip(g, .5, .7, .08, JK.koreanTile, 0, .38, z, .32);
    }
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; lmAdd(g, roughMass(.3, .3, .25, { seed: 30 + i, jitter: .25 }), i % 4 ? JK.forest : JK.autumn, Math.cos(a) * 1.3, .15, Math.sin(a) * 1.0 - .2); }
    return g;
  },
  avenue() {        // Nami Island: the famous lane of tall, narrow metasequoias on either side of a sandy path across a lawn, a little wooden cabin, the river at the edges
    const g = new THREE.Group();
    lmBox(g, 1.6, .01, 2.6, JK.grass, 0, 0, 0);
    lmBox(g, .24, .012, 2.6, LM.sand, 0, 0, 0);
    for (const side of [-1, 1]) lmBox(g, .3, .008, 2.6, JK.water, side * .95, 0, 0);
    const trunk = lmMaterial(0x7a4a2e), foliage = lmMaterial(0x6f8a3a, { roughness: 1 });
    for (const side of [-1, 1]) for (let i = 0; i < 12; i++) {
      const z = -1.15 + i * .21;
      lmCyl(g, .012, .02, .5, trunk, side * .17, 0, z, 6);
      lmAdd(g, new THREE.ConeGeometry(.08, .75, 8), i % 3 ? foliage : JK.autumnGold, side * .17, .55 + .375 - .12, z);
    }
    lmBox(g, .2, .1, .14, LM.wood, .5, 0, .6); lmHip(g, .02, .14, .06, LM.roofDark, .5, .1, .6, .7);
    return g;
  },
  triumphArch() {   // Pyongyang Arch of Triumph: a massive white granite arch with a tall round-headed opening, pilasters, a deep stepped cornice and an attic with tiered crown
    const g = new THREE.Group();
    const stone = lmMaterial(0xe6e2d8, { map: TEXTURES.stone });
    for (const side of [-1, 1]) {
      lmBox(g, .32, .72, .5, stone, side * .34, 0, 0);
      for (const z of [-.26, .26]) lmBox(g, .05, .66, .03, stone, side * .34 + side * .12, 0, z);
    }
    lmBox(g, 1.0, .2, .5, stone, 0, .72, 0);
    const arch = new THREE.CylinderGeometry(.18, .18, .52, 24, 1, false, 0, Math.PI); arch.rotateX(Math.PI / 2); arch.rotateZ(Math.PI / 2);
    lmBox(g, .36, .56, .52, LM.black, 0, 0, 0); lmAdd(g, arch, LM.black, 0, .56, 0);
    for (let k = 0; k < 3; k++) lmBox(g, 1.06 - k * .08, .03, .56 - k * .04, stone, 0, .92 + k * .03, 0);
    lmBox(g, .8, .12, .4, stone, 0, 1.01, 0);
    lmBox(g, .86, .02, .44, stone, 0, 1.13, 0);
    lmBox(g, .5, .06, .26, stone, 0, 1.15, 0);
    return g;
  }
});

// --- Northern Philippines (drawn from reference photos) ---------------------------------------------------------------
const PH = {
  adobe: lmMaterial(0xb8ad98, { map: TEXTURES.stone }), adobeDark: lmMaterial(0x8f8572, { map: TEXTURES.stone }), terracotta: lmMaterial(0xb5532f, { map: TEXTURES.tiles }),
  capiz: lmMaterial(0xeee6cf, { map: TEXTURES.windows }), timber: lmMaterial(0x5a3a24, { map: TEXTURES.wood }), brick: lmMaterial(0xa4583a, { map: TEXTURES.brick }),
  white: lmMaterial(0xf2f2ee), grass: lmMaterial(0x5d9a46, { roughness: 1 }), terrace: lmMaterial(0x7fae4a, { roughness: 1 }), terraceDark: lmMaterial(0x4f7f34, { roughness: 1 }),
  mud: lmMaterial(0x8a6a48, { roughness: 1 }), water: lmMaterial(0x3a8fb8, { roughness: .12, metalness: .15 }), lake: lmMaterial(0x2f6f8e, { roughness: .12, metalness: .15 }),
  jungle: lmMaterial(0x2f6a35, { roughness: 1 }), cliff: lmMaterial(0x5d6b4f, { roughness: 1 }), foam: lmMaterial(0xf4f8fa, { roughness: .4, transparent: true, opacity: .85 }),
  ash: lmMaterial(0x8a8478, { roughness: 1 }), bronze: lmMaterial(0x4a4038, { roughness: .45, metalness: .5 }), granite: lmMaterial(0xd9d4c8, { map: TEXTURES.stone })
};
Object.assign(LANDMARK_BUILDERS, {
  sanAgustin() {   // San Agustin Church, Intramuros: a severe grey-stone baroque facade with paired columns on two storeys, a triangular pediment with a cross, the surviving square bell tower on its left, carved doors, and a red-tile nave roof behind
    const g = new THREE.Group();
    lmBox(g, 1.6, .02, 1.8, PH.granite, 0, 0, 0);
    lmBox(g, .8, .55, 1.4, PH.adobe, .05, .02, -.35);
    lmHip(g, .05, .46, .2, PH.terracotta, .05, .57, -.35, 1.5);
    lmBox(g, .9, .62, .12, PH.adobe, .05, .02, .38);                                         // the facade
    for (const y of [.02, .33]) for (const x of [-.32, -.2, .3, .42]) lmCyl(g, .025, .028, .29, PH.adobeDark, x, y, .45, 10);   // paired columns, two orders
    lmBox(g, .92, .04, .14, PH.adobeDark, .05, .31, .38);
    const pediment = new THREE.Shape(); pediment.moveTo(-.42, 0); pediment.lineTo(.42, 0); pediment.lineTo(0, .2); pediment.closePath();
    lmAdd(g, new THREE.ExtrudeGeometry(pediment, { depth: .12, bevelEnabled: false }), PH.adobe, .05, .64, .32);
    lmBox(g, .012, .1, .012, PH.adobeDark, .05, .84, .38); lmBox(g, .06, .012, .012, PH.adobeDark, .05, .88, .38);
    lmBox(g, .16, .26, .02, PH.timber, .05, .02, .45); lmAdd(g, new THREE.CircleGeometry(.08, 14, 0, Math.PI), PH.timber, .05, .28, .462);
    lmAdd(g, new THREE.CircleGeometry(.05, 14), PH.adobeDark, .05, .5, .446);                 // round window
    // the bell tower: square, three stages, arched openings, a small dome and finial
    for (let k = 0; k < 3; k++) {
      const w = .3 - k * .04, y = .02 + k * .3;
      lmBox(g, w, .3, w, PH.adobe, -.55, y, .32);
      if (k) for (const [dx, dz, yaw] of [[0, 1, 0], [1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2]]) archBay(g, -.55 + dx * (w / 2 + .002), y + .07, .32 + dz * (w / 2 + .002), .07, .17, LM.black, yaw);
      lmBox(g, w + .03, .03, w + .03, PH.adobeDark, -.55, y + .3, .32);
    }
    lmAdd(g, new THREE.SphereGeometry(.09, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), PH.adobe, -.55, .95, .32);
    lmCyl(g, .01, .01, .12, PH.adobeDark, -.55, 1.03, .32, 6);
    for (const x of [-.6, .7]) lmAdd(g, roughMass(.14, .2, .14, { seed: 3 + x, jitter: .3 }), PH.jungle, x, .2, .75);
    return g;
  },
  rizalMonument() { // Rizal Monument: a tall granite obelisk rising behind the bronze statue of José Rizal in an overcoat, on a stepped pedestal, the flagpoles and red paving of Rizal Park
    const g = new THREE.Group();
    lmBox(g, 1.8, .01, 1.8, lmMaterial(0xb06a4e, { map: TEXTURES.stone }), 0, 0, 0);
    for (let k = 0; k < 3; k++) lmBox(g, .7 - k * .14, .06, .7 - k * .14, PH.granite, 0, .01 + k * .06, 0);
    lmBox(g, .3, .3, .3, PH.granite, 0, .19, 0);
    lmAdd(g, squareFrustum(.04, .1, 1.0), PH.granite, 0, .49 + .5, -.03);
    lmAdd(g, new THREE.ConeGeometry(.057, .08, 4).rotateY(Math.PI / 4), PH.granite, 0, 1.03, -.03);
    lmBox(g, .1, .2, .08, PH.bronze, 0, .49, .1);                                             // Rizal in his greatcoat
    lmAdd(g, new THREE.SphereGeometry(.035, 10, 8), PH.bronze, 0, .72, .1);
    for (const side of [-1, 1]) lmBox(g, .12, .1, .05, PH.bronze, side * .14, .26, .16);     // flanking bronze figure groups
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; lmCyl(g, .004, .004, .5, PH.white, Math.cos(a) * .8, 0, Math.sin(a) * .8, 5); lmBox(g, .08, .05, .004, lmMaterial(i % 2 ? 0x0038a8 : 0xce1126), Math.cos(a) * .8 + .04, .44, Math.sin(a) * .8); }
    return g;
  },
  fortSantiago() {  // Fort Santiago: thick weathered adobe-stone walls and bastions at the mouth of the Pasig, the carved baroque gate with the relief of St James on horseback, moat and lawns
    const g = new THREE.Group();
    lmBox(g, 2.0, .01, 1.6, PH.grass, 0, 0, 0);
    lmBox(g, 2.0, .01, .3, PH.water, 0, .002, .75);
    crenellatedWall(g, { x0: -.95, z0: .45, x1: -.28, z1: .45, height: .3, depth: .16, material: PH.adobeDark });
    crenellatedWall(g, { x0: .28, z0: .45, x1: .95, z1: .45, height: .3, depth: .16, material: PH.adobeDark });
    for (const side of [-1, 1]) crenellatedWall(g, { x0: side * .95, z0: .45, x1: side * .95, z1: -.6, height: .3, depth: .16, material: PH.adobeDark });
    lmBox(g, .56, .5, .18, PH.adobe, 0, 0, .45);                                             // the gate
    lmBox(g, .2, .26, .19, LM.black, 0, 0, .45); lmAdd(g, new THREE.CircleGeometry(.1, 16, 0, Math.PI), LM.black, 0, .26, .541);
    for (const x of [-.2, .2]) lmCyl(g, .025, .028, .44, PH.adobeDark, x, 0, .55, 10);
    lmBox(g, .22, .14, .02, PH.adobeDark, 0, .32, .545);                                    // the St James relief
    const pediment = new THREE.Shape(); pediment.moveTo(-.3, 0); pediment.quadraticCurveTo(0, .28, .3, 0); pediment.closePath();
    lmAdd(g, new THREE.ExtrudeGeometry(pediment, { depth: .18, bevelEnabled: false }), PH.adobe, 0, .5, .36);
    for (const x of [-.6, .1, .6]) gardenPine(g, x, -.2, 1.6);
    return g;
  },
  vigan() {         // Vigan, Calle Crisologo: a cobbled street lined with two-storey Spanish-colonial houses, brick-and-lime ground floors, overhanging timber upper floors with sliding capiz-shell windows, red tile roofs, and a horse-drawn kalesa
    const g = new THREE.Group();
    lmBox(g, .5, .01, 2.6, lmMaterial(0x8e7a64, { map: TEXTURES.stone }), 0, 0, 0);
    let seed = 4;
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (const side of [-1, 1]) for (let i = 0; i < 6; i++) {
      const z = -1.1 + i * .44, w = .4 + random() * .04, x = side * .48;
      lmBox(g, .44, .22, w, i % 2 ? PH.brick : lmMaterial(0xe2d6bf), x, 0, z);
      for (const dz of [-.1, .1]) lmBox(g, .01, .12, .07, LM.black, x - side * .222, .04, z + dz);
      lmBox(g, .5, .2, w + .02, PH.timber, x - side * .03, .22, z);                          // the overhanging upper floor
      for (let k = 0; k < 4; k++) lmBox(g, .012, .1, .07, PH.capiz, x - side * .282, .27, z - .14 + k * .095);
      lmHip(g, .04, .3, .14, PH.terracotta, x - side * .03, .42, z, (w + .02) / .5);
    }
    const kalesa = new THREE.Group(); kalesa.position.set(.05, 0, .3); g.add(kalesa);
    lmBox(kalesa, .12, .08, .2, lmMaterial(0x2f2a26), 0, .06, 0); lmBox(kalesa, .13, .02, .21, lmMaterial(0xc89a3a), 0, .16, 0);
    for (const side of [-1, 1]) { const wheel = lmAdd(kalesa, new THREE.TorusGeometry(.055, .008, 6, 16), lmMaterial(0x6b2a1e), side * .07, .055, -.03); wheel.rotation.y = Math.PI / 2; }
    lmAdd(kalesa, roughMass(.035, .05, .1, { seed: 2, jitter: .05 }), lmMaterial(0x7a5a3a), 0, .11, .2);   // the horse
    for (const [dx, dz] of [[-.025, .15], [.025, .15], [-.025, .25], [.025, .25]]) lmCyl(kalesa, .008, .008, .07, lmMaterial(0x7a5a3a), dx, 0, dz, 5);
    return g;
  },
  banaueTerraces() { // Banaue rice terraces: steep mountainsides carved into hundreds of narrow, contour-following paddies, bright green rice above mud walls, scattered Ifugao huts, jungle and cloud on the ridges
    const g = new THREE.Group();
    const levels = 16;
    for (let k = 0; k < levels; k++) {
      const t = k / levels, y = t * .9, r = 1.1 - t * .95;
      const ring = new THREE.CylinderGeometry(r, r + .06, .05, 40, 1, false, -1.9, 3.8);
      const pos = ring.attributes.position;
      for (let i = 0; i < pos.count; i++) { const a = Math.atan2(pos.getX(i), pos.getZ(i)), wobble = 1 + .08 * Math.sin(a * 5 + k) + .05 * Math.sin(a * 11 + k * 2); pos.setX(i, pos.getX(i) * wobble); pos.setZ(i, pos.getZ(i) * wobble); }
      ring.computeVertexNormals();
      lmAdd(g, ring, PH.mud, 0, y + .025, 0);
      const top = new THREE.CylinderGeometry(r - .005, r - .005, .006, 40, 1, false, -1.9, 3.8);
      const tp = top.attributes.position;
      for (let i = 0; i < tp.count; i++) { const a = Math.atan2(tp.getX(i), tp.getZ(i)), wobble = 1 + .08 * Math.sin(a * 5 + k) + .05 * Math.sin(a * 11 + k * 2); tp.setX(i, tp.getX(i) * wobble); tp.setZ(i, tp.getZ(i) * wobble); }
      lmAdd(g, top, k % 3 ? PH.terrace : PH.terraceDark, 0, y + .052, 0);
    }
    lmAdd(g, roughMass(.6, .35, .5, { seed: 4, jitter: .25 }), PH.jungle, 0, .95, -.15);
    for (const [x, z] of [[.5, .4], [-.4, .55], [.2, .2]]) {
      const y = groundAt(g, x, z);
      lmBox(g, .06, .05, .06, PH.timber, x, y, z);
      lmAdd(g, new THREE.ConeGeometry(.07, .1, 4).rotateY(Math.PI / 4), lmMaterial(0x9c8452), x, y + .1, z);
    }
    return g;
  },
  pagsanjanFalls() { // Pagsanjan Falls: a white curtain of water dropping down a mossy jungle cliff into a dark plunge pool, the narrow gorge, and the wooden bangka canoes
    const g = new THREE.Group();
    lmBox(g, 1.6, .01, 1.8, PH.lake, 0, 0, .1);
    for (const side of [-1, 1]) lmAdd(g, jaggedSlab(.35, .85, .8, side * 5, .2), PH.cliff, side * .62, .425, -.4);   // gorge walls only behind, so the falls stay in view
    lmAdd(g, jaggedSlab(1.4, 1.0, .3, 9, .15), PH.cliff, 0, .5, -.75);
    for (let k = 0; k < 10; k++) lmAdd(g, roughMass(.16, .1, .16, { seed: 20 + k, jitter: .3, detail: 1 }), PH.jungle, -.6 + (k % 5) * .3, 1.0 + (k % 2) * .04, -.7 + Math.floor(k / 5) * 1.3 * (k % 2 ? 1 : .3));
    lmBox(g, .32, .95, .04, PH.foam, 0, .02, -.58);
    lmAdd(g, new THREE.SphereGeometry(.22, 12, 8), PH.foam, 0, .04, -.5).scale.set(1.4, .25, .8);
    for (const [x, z] of [[-.1, .3], [.15, .6]]) {
      const bangka = lmAdd(g, new THREE.CylinderGeometry(.03, .03, .4, 8, 1).rotateX(Math.PI / 2), PH.timber, x, .03, z); bangka.scale.set(1, .5, 1);
      lmAdd(g, new THREE.SphereGeometry(.02, 8, 6), lmMaterial(0xd8342c), x, .06, z - .08);
      lmAdd(g, new THREE.SphereGeometry(.02, 8, 6), lmMaterial(0x2b6fc0), x, .06, z + .08);
    }
    return g;
  },
  taal() {          // Taal Volcano: the volcano island rising from the wide blue lake, a ring of grey ash slopes and green ridges, the small green crater lake in its summit, and Tagaytay ridge behind
    const g = new THREE.Group();
    lmCyl(g, 1.2, 1.2, .01, PH.lake, 0, 0, 0, 48);
    const island = [[.55, 0], [.5, .05], [.4, .14], [.28, .22], [.22, .24], [.17, .2], [.001, .2]].map(([r, y]) => new THREE.Vector2(r, y));
    const islandGeometry = new THREE.LatheGeometry(island, 28); const ip = islandGeometry.attributes.position;
    for (let i = 0; i < ip.count; i++) { const a = Math.atan2(ip.getZ(i), ip.getX(i)), k = 1 + .12 * Math.sin(a * 3) + .06 * Math.sin(a * 7); ip.setX(i, ip.getX(i) * k); ip.setZ(i, ip.getZ(i) * k); }
    islandGeometry.computeVertexNormals();
    lmAdd(g, islandGeometry, PH.ash, 0, 0, 0);
    lmCyl(g, .16, .16, .005, lmMaterial(0x7fb07a, { roughness: .2 }), 0, .2, 0, 24);   // the crater lake
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + .3; lmAdd(g, roughMass(.12, .06, .1, { seed: 30 + k, jitter: .3, detail: 1 }), PH.grass, Math.cos(a) * .42, .05, Math.sin(a) * .42); }
    lmAdd(g, roughMass(1.6, .45, .35, { seed: 8, jitter: .15 }), PH.jungle, 0, 0, -1.35);   // Tagaytay ridge
    return g;
  },
  bojeador() {      // Cape Bojeador Lighthouse: an octagonal red-brick tower with a white lantern and a gallery, on a hilltop above the sea, beside the white keeper's house with a red tile roof and arcaded veranda, tropical gardens
    const g = new THREE.Group();
    lmAdd(g, roughMass(1.0, .3, .9, { seed: 5, jitter: .12 }), PH.grass, 0, 0, 0);
    const top = .26;
    lmBox(g, .7, .18, .36, PH.white, .1, top, .1);
    for (let i = 0; i < 6; i++) archBay(g, -.17 + i * .1, top, .281, .06, .12, PH.brick);
    lmHip(g, .2, .44, .12, PH.terracotta, .1, top + .18, .1, .52);
    lmCyl(g, .1, .12, .1, PH.brick, -.35, top, -.05, 8);
    lmCyl(g, .07, .09, .55, PH.brick, -.35, top + .1, -.05, 8);
    lmCyl(g, .1, .1, .02, PH.white, -.35, top + .65, -.05, 8);
    lmCyl(g, .055, .055, .09, PH.white, -.35, top + .67, -.05, 8);
    lmCyl(g, .05, .05, .05, lmMaterial(0xffe7a0, { emissive: 0xffd060, emissiveIntensity: .5 }), -.35, top + .7, -.05, 8);
    lmAdd(g, new THREE.ConeGeometry(.07, .08, 8), PH.white, -.35, top + .8, -.05);
    for (const [x, z] of [[.6, -.3], [-.7, .35], [.5, .5]]) { const y = groundAt(g, x, z); lmCyl(g, .008, .012, .22, LM.trunk, x, y, z, 5); lmAdd(g, new THREE.SphereGeometry(.08, 8, 6), PH.jungle, x, y + .25, z).scale.y = .5; }
    return g;
  },
  bascoLighthouse() { // Basco (Naidi Hills) Lighthouse, Batanes: a slender white stone tower with a balcony and a lantern on rolling green grassland above the sea, low Ivatan stone houses with thick cogon-grass roofs, grazing cattle
    const g = new THREE.Group();
    lmAdd(g, roughMass(1.2, .22, 1.0, { seed: 11, jitter: .1 }), PH.grass, 0, 0, 0);
    lmAdd(g, roughMass(.7, .15, .6, { seed: 12, jitter: .12 }), PH.grass, .5, .05, -.4);
    const top = .2;
    lmCyl(g, .07, .09, .7, PH.white, 0, top, 0, 16);
    lmCyl(g, .12, .12, .02, PH.white, 0, top + .5, 0, 16);
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; lmCyl(g, .003, .003, .04, PH.white, Math.cos(a) * .115, top + .52, Math.sin(a) * .115, 4); }
    lmCyl(g, .06, .06, .08, lmMaterial(0xbfd9e6, { metalness: .4, roughness: .2 }), 0, top + .7, 0, 12);
    lmAdd(g, new THREE.SphereGeometry(.065, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), PH.white, 0, top + .78, 0);
    for (const [x, z, yaw] of [[.45, .3, .3], [-.4, .4, -.2]]) {
      const y = groundAt(g, x, z);
      lmBox(g, .2, .1, .14, PH.adobe, x, y, z, yaw);
      const roofShape = new THREE.Shape(); roofShape.moveTo(-.09, 0); roofShape.lineTo(.09, 0); roofShape.lineTo(0, .12); roofShape.closePath();
      const roof = lmAdd(g, new THREE.ExtrudeGeometry(roofShape, { depth: .24, bevelEnabled: false }).translate(0, 0, -.12), lmMaterial(0xb0965e, { roughness: 1 }), x, y + .1, z);
      roof.rotation.y = yaw + Math.PI / 2;
    }
    for (const [x, z] of [[.3, -.2], [.4, -.1], [-.3, -.3]]) { const y = groundAt(g, x, z); lmAdd(g, roughMass(.04, .025, .06, { seed: x * 10, jitter: .1, detail: 1 }), lmMaterial(0x6a4a32), x, y + .04, z); }
    return g;
  }
});
// Mayon and other active volcanoes: the terrain gives the cone, the peak marker adds a drifting plume
const basePeak = LANDMARK_BUILDERS.peak;
LANDMARK_BUILDERS.peak = (o = {}) => {
  const g = basePeak(o);
  if (o.smoke) for (let k = 0; k < 5; k++) lmAdd(g, new THREE.SphereGeometry(.12 + k * .05, 10, 8), lmMaterial(0xe9ecee, { transparent: true, opacity: .55 - k * .08, roughness: 1 }), k * .12, .95 + k * .14, 0);
  return g;
};

// --- Philippines detail pass: the features that make each sight read at close range -----------------------------------
const PH_EXTRA = {
  bougainvillea: lmMaterial(0xd8418f, { roughness: 1 }), palmLeaf: lmMaterial(0x3f7f3a, { roughness: 1 }), palmTrunk: lmMaterial(0x8a7356, { roughness: 1 }),
  iron: lmMaterial(0x2a2a2c, { roughness: .6, metalness: .4 }), lamp: lmMaterial(0xffe2a0, { emissive: 0xffc860, emissiveIntensity: .6 }),
  granite: lmMaterial(0xc9c3b5, { map: TEXTURES.stone }), cattle: lmMaterial(0x6a4632, { roughness: 1 }), cattleWhite: lmMaterial(0xe8e2d8, { roughness: 1 }),
  stoneWall: lmMaterial(0x8d8676, { map: TEXTURES.stone, roughness: 1 }), cloud: lmMaterial(0xf2f4f6, { roughness: 1, transparent: true, opacity: .8 })
};
function palmAt(g, x, z, h = .4, y = null) {      // a coconut palm: a gently curved trunk and a crown of drooping fronds
  const base = y ?? groundAt(g, x, z);
  const lean = (x * 7 + z * 3) % 1 * .3 - .15;
  const trunk = lmCyl(g, .008, .014, h, PH_EXTRA.palmTrunk, x, base, z, 6); trunk.rotation.z = lean;
  const tx = x - Math.sin(lean) * h, ty = base + Math.cos(lean) * h;
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2, frond = lmBox(g, .16 * h / .4, .006, .035 * h / .4, PH_EXTRA.palmLeaf, tx + Math.cos(a) * .06 * h / .4, ty - .01, z + Math.sin(a) * .06 * h / .4);
    frond.rotation.set(0, -a, -.45);
  }
}
function streetLamp(g, x, z, h = .2) { const y = groundAt(g, x, z); lmCyl(g, .004, .005, h, PH_EXTRA.iron, x, y, z, 6); lmBox(g, .025, .035, .025, PH_EXTRA.lamp, x, y + h, z); lmAdd(g, new THREE.ConeGeometry(.024, .02, 4).rotateY(Math.PI / 4), PH_EXTRA.iron, x, y + h + .045, z); }
function stoneLion(g, x, z, yaw, s = 1) { const y = groundAt(g, x, z); lmBox(g, .07 * s, .06 * s, .07 * s, PH_EXTRA.granite, x, y, z, yaw); lmAdd(g, roughMass(.032 * s, .05 * s, .04 * s, { seed: x * 13, jitter: .15, detail: 1 }), PH_EXTRA.granite, x, y + .1 * s, z).rotation.y = yaw; }

const PH_DETAILS = {
  sanAgustin(g, box) {   // the atrium wall with its Chinese granite lions, statue niches and cornices on the facade, buttressed nave with small high windows, plaza lamps and acacias
    for (const x of [-.25, .37]) { lmBox(g, .08, .12, .03, LM.black, x - .03, .12, .452); lmAdd(g, roughMass(.02, .045, .015, { seed: x * 9, jitter: .1, detail: 1 }), PH.adobe, x - .03, .17, .46); }
    for (const y of [.62, .31]) lmBox(g, .96, .02, .16, PH.adobe, .05, y, .38);
    for (let i = 0; i < 5; i++) { const z = .2 - i * .27; for (const side of [-1, 1]) { lmBox(g, .06, .4, .08, PH.adobeDark, .05 + side * .42, .02, z); lmBox(g, .006, .08, .05, LM.black, .05 + side * .401, .38, z - .13); } }
    // the atrium: low wall with a gate flanked by stone lions
    const front = box.max.z + .25;
    for (const side of [-1, 1]) { lmBox(g, .55, .1, .04, PH.adobe, .05 + side * .5, 0, front); lmBox(g, .06, .16, .06, PH.adobeDark, .05 + side * .2, 0, front); stoneLion(g, .05 + side * .2, front + .07, 0, .9); }
    for (const x of [-.75, .85]) streetLamp(g, x, front + .1, .22);
    for (const x of [-.95, 1.0]) palmAt(g, x, front - .3, .45);
  },
  rizalMonument(g, box) {   // the flanking bronze groups, inscription plaques, a ring of chained bollards, the honour guards and lamp posts on the red paving
    for (const side of [-1, 1]) { lmBox(g, .014, .04, .1, PH.bronze, side * .151, .27, 0); lmAdd(g, roughMass(.04, .06, .04, { seed: side + 4, jitter: .2, detail: 1 }), PH.bronze, side * .14, .38, .16); }
    lmBox(g, .14, .08, .006, PH.bronze, 0, .25, .151);
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; lmCyl(g, .01, .012, .06, PH.granite, Math.cos(a) * .45, .01, Math.sin(a) * .45, 6); }
    for (const side of [-1, 1]) { lmBox(g, .025, .08, .02, lmMaterial(0xf4f4f0), side * .3, .01, .4); lmCyl(g, .012, .012, .02, lmMaterial(0xf4f4f0), side * .3, .09, .4, 8); }
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; streetLamp(g, Math.cos(a) * .62, Math.sin(a) * .62, .26); }
    for (const x of [-.85, .85]) for (const z of [-.6, .6]) palmAt(g, x, z, .5);
  },
  fortSantiago(g, box) {    // the corner bastions, the white Rizal Shrine inside, the bridge over the moat, old cannons on the ramparts, palms
    for (const side of [-1, 1]) lmAdd(g, new THREE.CylinderGeometry(.16, .18, .32, 6), PH.adobeDark, side * .95, .16, .45);
    lmBox(g, .5, .2, .22, lmMaterial(0xf1ece2), -.3, 0, -.25); lmHip(g, .1, .3, .1, PH.terracotta, -.3, .2, -.25, .55);
    for (let i = 0; i < 4; i++) lmBox(g, .05, .1, .006, PH.timber, -.48 + i * .12, .06, -.138);
    lmBox(g, .22, .03, .32, PH.timber, 0, 0, .7);
    for (const x of [-.6, -.45, .45, .6]) { const c = lmCyl(g, .015, .02, .12, PH_EXTRA.iron, x, .32, .48, 8); c.rotation.x = Math.PI / 2 - .2; }
    for (const [x, z] of [[.4, -.3], [.7, -.1], [-.7, .1]]) palmAt(g, x, z, .45);
  },
  vigan(g, box) {           // wrought-iron balconies and ventanilla grilles, gas street lamps along the cobbles, potted plants, and the bell tower of the cathedral closing the street
    for (const side of [-1, 1]) for (let i = 0; i < 6; i++) {
      const z = -1.1 + i * .44, x = side * .48 - side * .292;
      lmBox(g, .03, .012, .3, PH_EXTRA.iron, x, .21, z);
      for (let k = 0; k < 6; k++) lmCyl(g, .002, .002, .05, PH_EXTRA.iron, x, .222, z - .13 + k * .052, 4);
      lmBox(g, .006, .03, .26, PH_EXTRA.iron, x + side * .005, .225, z);
      if (i % 2) { lmCyl(g, .02, .015, .03, PH.terracotta, side * .24, 0, z + .15, 8); lmAdd(g, new THREE.SphereGeometry(.03, 8, 6), PH_EXTRA.bougainvillea, side * .24, .05, z + .15); }
    }
    for (let i = 0; i < 5; i++) for (const side of [-1, 1]) streetLamp(g, side * .2, -1.0 + i * .5, .2);
    lmBox(g, .24, .5, .24, PH.adobe, 0, 0, -1.55); lmBox(g, .2, .2, .2, PH.adobe, 0, .5, -1.55);
    lmAdd(g, new THREE.SphereGeometry(.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), PH.adobe, 0, .7, -1.55);
    for (const [dx, dz, yaw] of [[0, 1, 0], [1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2]]) archBay(g, dx * .101, .55, -1.55 + dz * .101, .06, .12, LM.black, yaw);
  },
  banaueTerraces(g, box) {  // water glinting in the flooded paddies, Ifugao huts raised on posts with steep thatch, mist on the ridge
    for (let k = 1; k < 16; k += 3) {
      const t = k / 16, r = 1.1 - t * .95;
      const pool = new THREE.CylinderGeometry(r - .02, r - .02, .002, 40, 1, false, -1.0, 2.0);
      lmAdd(g, pool, PH.water, 0, t * .9 + .056, 0);
    }
    for (const [x, z] of [[.75, .55], [-.65, .7], [.3, .9], [-.2, .75]]) {
      const y = groundAt(g, x, z);
      for (const dx of [-.025, .025]) for (const dz of [-.025, .025]) lmCyl(g, .004, .004, .06, PH.timber, x + dx, y, z + dz, 4);
      lmBox(g, .07, .04, .07, PH.timber, x, y + .06, z);
      lmAdd(g, new THREE.ConeGeometry(.075, .12, 4).rotateY(Math.PI / 4), lmMaterial(0x8a7244, { roughness: 1 }), x, y + .16, z);
    }
    for (let k = 0; k < 4; k++) lmAdd(g, new THREE.SphereGeometry(.25, 10, 6), PH_EXTRA.cloud, -.5 + k * .35, 1.2 + (k % 2) * .06, -.4).scale.set(1.6, .2, .6);
  },
  pagsanjanFalls(g, box) {  // spray rising off the pool, boulders and white rapids downstream, vines hanging down the cliffs, a boatman in each bangka
    for (let k = 0; k < 3; k++) lmAdd(g, new THREE.SphereGeometry(.08, 10, 8), PH_EXTRA.cloud, -.06 + k * .06, .08 + k * .03, -.48).scale.set(1.4, .5, .7);   // spray at the foot of the falls
    for (let k = 0; k < 7; k++) lmAdd(g, roughMass(.06, .04, .05, { seed: 40 + k, jitter: .3, detail: 1 }), PH.cliff, -.35 + k * .12, .01, .1 + (k % 3) * .2);
    for (let k = 0; k < 6; k++) lmAdd(g, new THREE.SphereGeometry(.05, 8, 6), PH.foam, -.3 + k * .12, .012, .15 + (k % 2) * .25).scale.set(1.6, .15, .8);
    for (const side of [-1, 1]) for (let k = 0; k < 6; k++) lmBox(g, .01, .3 + (k % 3) * .1, .012, PH.jungle, side * (.45 - (k % 2) * .03), .5, -.6 + k * .1);
    for (const [x, z] of [[-.1, .3], [.15, .6]]) { lmCyl(g, .012, .014, .05, lmMaterial(0xe8d0b0), x, .05, z, 6); lmAdd(g, new THREE.SphereGeometry(.014, 8, 6), lmMaterial(0x3a2a20), x, .11, z); }
  },
  taal(g, box) {            // a steam plume from the crater, fishing bancas and fish-pen frames on the lake, and the hotels and trees along Tagaytay ridge
    for (let k = 0; k < 4; k++) lmAdd(g, new THREE.SphereGeometry(.03 + k * .015, 10, 8), PH_EXTRA.cloud, .03 + k * .05, .24 + k * .05, 0).scale.y = .7;   // a thin wisp of steam
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + .4; const bx = Math.cos(a) * .85, bz = Math.sin(a) * .85; lmBox(g, .08, .012, .02, lmMaterial(k % 2 ? 0x2b6fc0 : 0xf4f4f0), bx, .01, bz, -a); }
    for (let k = 0; k < 3; k++) for (let j = 0; j < 3; j++) lmBox(g, .004, .01, .06, PH.timber, -.75 + k * .04, .008, .5 + j * .02);
    for (let k = 0; k < 7; k++) { const x = -1.2 + k * .4; lmBox(g, .1, .08 + (k % 3) * .05, .08, lmMaterial(0xe8e2d6, { map: TEXTURES.windows }), x, .4, -1.15); }
    for (let k = 0; k < 10; k++) lmAdd(g, new THREE.SphereGeometry(.06, 8, 6), PH.jungle, -1.3 + k * .28, .45, -1.05).scale.y = .7;
  },
  bojeador(g, box) {        // windows up the brick tower and a railed gallery, the brick stairway climbing the hill, bougainvillea and palms
    for (let k = 0; k < 3; k++) lmBox(g, .02, .05, .006, LM.black, -.35, .4 + k * .14, .041);
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; lmCyl(g, .002, .002, .03, PH_EXTRA.iron, -.35 + Math.cos(a) * .095, .93, -.05 + Math.sin(a) * .095, 4); }
    for (let s = 0; s < 8; s++) { const z = .85 - s * .07; lmBox(g, .14, .02, .07, PH.brick, -.1, Math.max(0, groundAt(g, -.1, z) - .01), z); }
    for (let k = 0; k < 8; k++) { const x = -.6 + k * .17, z = .5 + (k % 2) * .08; const y = groundAt(g, x, z); lmAdd(g, new THREE.SphereGeometry(.05, 8, 6), k % 3 ? PH_EXTRA.bougainvillea : PH.jungle, x, y + .03, z).scale.y = .6; }
    for (const [x, z] of [[.75, .1], [-.75, -.4]]) palmAt(g, x, z, .4);
  },
  bascoLighthouse(g, box) { // the low Ivatan stone walls dividing the pastures, more cattle grazing, the door and windows up the tower, and the sea cliff falling away to the shore
    for (const [x0, z0, x1, z1] of [[-.9, -.1, .1, -.6], [.1, -.6, .9, -.2], [-.8, .5, .2, .7]]) {
      const n = 10;
      for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n, z = z0 + (z1 - z0) * i / n; lmBox(g, .1, .04, .04, PH_EXTRA.stoneWall, x, groundAt(g, x, z) - .01, z, Math.atan2(-(z1 - z0), x1 - x0)); }
    }
    lmBox(g, .04, .07, .006, PH.timber, 0, .2, .072);
    for (let k = 0; k < 3; k++) lmBox(g, .02, .04, .006, LM.black, 0, .34 + k * .1, .068);
    for (const [x, z, white] of [[-.5, -.3, 0], [.6, .1, 1], [-.2, .55, 0], [.15, -.45, 1]]) {
      const y = groundAt(g, x, z);
      lmAdd(g, roughMass(.04, .025, .065, { seed: x * 10 + z, jitter: .1, detail: 1 }), white ? PH_EXTRA.cattleWhite : PH_EXTRA.cattle, x, y + .045, z);
      lmAdd(g, new THREE.SphereGeometry(.018, 8, 6), white ? PH_EXTRA.cattleWhite : PH_EXTRA.cattle, x, y + .05, z + .07);
      for (const [dx, dz] of [[-.02, -.04], [.02, -.04], [-.02, .04], [.02, .04]]) lmCyl(g, .005, .005, .03, PH_EXTRA.cattle, x + dx, y, z + dz, 4);
    }
  }
};
for (const [name, addDetail] of Object.entries(PH_DETAILS)) {
  const build = LANDMARK_BUILDERS[name];
  if (!build) continue;
  LANDMARK_BUILDERS[name] = (options) => { const g = build(options); addDetail(g, new THREE.Box3().setFromObject(g)); return g; };
}

// --- redraws of the weaker models --------------------------------------------------------------------------------------
const capsuleAxis = new THREE.Vector3(0, 1, 0);
function limb(g, material, from, to, radius) {   // a rounded limb (capsule) between two points
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), dir = new THREE.Vector3().subVectors(b, a);
  const geometry = new THREE.CapsuleGeometry(radius, Math.max(.001, dir.length()), 4, 10);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(capsuleAxis, dir.normalize()));
  geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  const mesh = new THREE.Mesh(geometry, material); g.add(mesh); return mesh;
}
// A suspension bridge with proper towers (tapered legs, stacked portal beams, caissons), a lattice stiffening truss
// under the deck, thick main cables over the saddles, hangers, side-span piers and concrete anchorages.
function suspensionBridge2(g, { span, pylon = 1, deckY = .3, doubleDeck = false, lengthSide = .3, tower = 0xe9ecea, truss = 0xd9dcda, cable = 0xf4f4f2, beams = 4 }) {
  const towerMat = lmMaterial(tower), trussMat = lmMaterial(truss), cableMat = lmMaterial(cable), concrete = lmMaterial(0xbdbab2);
  const half = span / 2, sideLen = span * lengthSide, total = span + sideLen * 2, w = .1;
  const deckLevels = doubleDeck ? [deckY + .06, deckY] : [deckY];
  for (const y of deckLevels) lmBox(g, total, .016, w * 1.1, lmMaterial(0x6a6e72), 0, y + .004, 0);
  // stiffening truss: chords and diagonals down both sides
  const parts = [], depth = doubleDeck ? .09 : .05, bottom = deckY - (doubleDeck ? .03 : depth);
  const panels = Math.round(total / .05);
  for (const z of [-w / 2, w / 2]) {
    for (let i = 0; i < panels; i++) {
      const x0 = -total / 2 + i * total / panels, x1 = x0 + total / panels;
      parts.push(strutGeometry(new THREE.Vector3(x0, deckY + .004, z), new THREE.Vector3(x1, deckY + .004, z), .003));
      parts.push(strutGeometry(new THREE.Vector3(x0, bottom, z), new THREE.Vector3(x1, bottom, z), .003));
      parts.push(strutGeometry(new THREE.Vector3(x0, i % 2 ? bottom : deckY, z), new THREE.Vector3(x1, i % 2 ? deckY : bottom, z), .002));
      parts.push(strutGeometry(new THREE.Vector3(x0, bottom, z), new THREE.Vector3(x0, deckY, z), .0018));
    }
  }
  g.add(new THREE.Mesh(mergeGeometries(parts), trussMat));
  // towers
  for (const sign of [-1, 1]) {
    const x = sign * half;
    lmCyl(g, .07, .08, deckY * .6, concrete, x, 0, 0, 16);                                    // caisson
    for (const z of [-w * .6, w * .6]) { const leg = lmAdd(g, squareFrustum(.012, .02, pylon - deckY * .5), towerMat, x, deckY * .5 + (pylon - deckY * .5) / 2, z); leg.scale.z = .8; }
    for (let k = 0; k < beams; k++) lmBox(g, .03, .02, w * 1.3, towerMat, x, deckY + .06 + (pylon - deckY - .1) * (k + 1) / beams, 0);
    lmBox(g, .045, .025, w * 1.4, towerMat, x, pylon - .01, 0);
    lmAdd(g, new THREE.SphereGeometry(.008, 8, 6), lmMaterial(0xff3020, { emissive: 0xff2010, emissiveIntensity: .8 }), x, pylon + .02, 0);
  }
  // cables and hangers
  const cables = [], hangers = [];
  for (const z of [-w * .6, w * .6]) {
    const sag = (t) => deckY + .03 + (pylon - deckY - .03) * t * t;
    const pts = [];
    for (let i = 0; i <= 40; i++) { const t = i / 40 * 2 - 1; pts.push(new THREE.Vector3(t * half, sag(t), z)); }
    for (let i = 0; i < pts.length - 1; i++) cables.push(strutGeometry(pts[i], pts[i + 1], .006));
    for (let i = 1; i < pts.length - 1; i++) hangers.push(strutGeometry(new THREE.Vector3(pts[i].x, deckY + .01, z), pts[i], .0012));
    for (const sign of [-1, 1]) {
      const top = new THREE.Vector3(sign * half, pylon, z), anchor = new THREE.Vector3(sign * (half + sideLen), deckY + .02, z);
      cables.push(strutGeometry(top, anchor, .006));
      for (let i = 1; i < 8; i++) { const p = top.clone().lerp(anchor, i / 8); hangers.push(strutGeometry(new THREE.Vector3(p.x, deckY + .01, z), p, .0012)); }
    }
  }
  g.add(new THREE.Mesh(mergeGeometries(cables), cableMat));
  g.add(new THREE.Mesh(mergeGeometries(hangers), cableMat));
  for (const sign of [-1, 1]) {
    lmBox(g, .12, deckY + .06, .18, concrete, sign * (half + sideLen + .04), 0, 0);              // anchorage
    for (let k = 1; k <= 2; k++) lmBox(g, .03, deckY, .05, concrete, sign * (half + sideLen * k / 3), 0, 0);   // side-span piers
  }
}
Object.assign(LANDMARK_BUILDERS, {
  bridge(o = {}) {   // suspension bridges: Akashi (pale grey-green towers, deep truss), Seto Ohashi (double road-rail deck) and Gwangan (white double-deck towers)
    const g = new THREE.Group();
    const styles = { akashi: { tower: 0xd6dfda, truss: 0xc9d3ce, beams: 5 }, seto: { tower: 0xe2e6e8, truss: 0xd0d4d6, beams: 3 }, gwangan: { tower: 0xf2f2f0, truss: 0xc7c9cb, beams: 2 } };
    suspensionBridge2(g, { span: o.span ?? 2, doubleDeck: o.doubleDeck, pylon: 1, ...(styles[o.style] ?? {}) });
    return g;
  },
  statue() {       // Nagasaki Peace Statue: the 10 m seated male figure in blue-green bronze, right arm raised straight up pointing at the sky, left arm stretched forward level, right leg folded, left foot planted, eyes closed, on a tall granite plinth
    const g = new THREE.Group();
    const bronze = lmMaterial(0x7fa8a3, { roughness: .5, metalness: .3 }), granite = lmMaterial(0xcfcac0);
    lmBox(g, .9, .34, .6, granite, 0, 0, 0);
    lmBox(g, .8, .02, .5, granite, 0, .34, 0);
    lmAdd(g, roughMass(.24, .06, .16, { seed: 2, jitter: .08 }), granite, 0, .4, -.02);          // the rock seat
    const torso = [[.14, 0], [.16, .08], [.17, .16], [.19, .22], [.17, .26], [.08, .28], [.001, .29]].map(([r, y]) => new THREE.Vector2(r, y));
    const body = lmAdd(g, new THREE.LatheGeometry(torso, 16), bronze, 0, .44, -.02); body.scale.z = .62;
    limb(g, bronze, [0, .73, -.02], [0, .76, -.02], .04);                                         // neck
    const head = lmAdd(g, new THREE.SphereGeometry(.065, 14, 10), bronze, 0, .82, 0); head.scale.set(.95, 1.1, 1);
    lmAdd(g, new THREE.SphereGeometry(.066, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.3), lmMaterial(0x6e9792, { roughness: .6 }), 0, .835, -.008);   // hair
    // right arm straight up, finger pointing to the sky
    limb(g, bronze, [.17, .68, -.02], [.18, .88, -.02], .036); limb(g, bronze, [.18, .88, -.02], [.18, 1.06, -.01], .03);
    limb(g, bronze, [.18, 1.06, -.01], [.18, 1.12, 0], .012);
    // left arm stretched forward and out, palm down
    limb(g, bronze, [-.17, .68, -.02], [-.3, .66, .12], .036); limb(g, bronze, [-.3, .66, .12], [-.42, .65, .28], .03);
    lmBox(g, .05, .015, .07, bronze, -.45, .64, .32);
    // legs: the right folded on the seat, the left lowered with the foot on the plinth
    limb(g, bronze, [.08, .46, .02], [.16, .47, .2], .055); limb(g, bronze, [.16, .47, .2], [.06, .44, .26], .045);
    limb(g, bronze, [-.08, .46, .02], [-.12, .47, .22], .055); limb(g, bronze, [-.12, .47, .22], [-.13, .37, .26], .045);
    lmBox(g, .07, .03, .12, bronze, -.13, .35, .3);
    lmAdd(g, roughMass(.2, .04, .14, { seed: 5, jitter: .1 }), bronze, 0, .46, .1);              // drapery over the lap
    return g;
  },
  buddha() {       // Kamakura Daibutsu: the seated bronze Amida in deep meditation, robe draped over both shoulders, hands resting in the lap in the meditation mudra, a large head with tight snail-shell curls and long earlobes, slightly stooped, on a granite lotus base, a bronze lotus vase and incense burner in front, pines behind
    const g = new THREE.Group();
    const bronze = lmMaterial(0x5d7f6c, { roughness: .45, metalness: .45 }), curls = lmMaterial(0x58786a, { map: TEXTURES.pits, roughness: .5, metalness: .4 }), granite = lmMaterial(0xcfc8ba, { map: TEXTURES.stone });
    lmBox(g, 1.5, .04, 1.4, granite, 0, 0, 0);
    lmBox(g, 1.15, .07, 1.0, granite, 0, .04, -.05);
    const lotus = [[.5, 0], [.54, .03], [.52, .07], [.46, .1], [.001, .1]].map(([r, y]) => new THREE.Vector2(r, y));
    const base = lmAdd(g, new THREE.LatheGeometry(lotus, 24), bronze, 0, .11, -.08); base.scale.z = .78;
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; const petal = lmAdd(g, new THREE.SphereGeometry(.07, 8, 6), bronze, Math.cos(a) * .48, .15, -.08 + Math.sin(a) * .37); petal.scale.set(.5, .35, .25); petal.rotation.y = -a; }
    lmAdd(g, roughMass(.46, .13, .32, { seed: 2, jitter: .03 }), bronze, 0, .3, -.04);           // crossed legs under the robe
    const robe = [[.38, 0], [.34, .1], [.3, .2], [.29, .3], [.3, .37], [.24, .42], [.1, .45], [.001, .46]].map(([r, y]) => new THREE.Vector2(r, y));
    const body = lmAdd(g, new THREE.LatheGeometry(robe, 22), bronze, 0, .32, -.14); body.scale.z = .6; body.rotation.x = .1;
    for (const side of [-1, 1]) { limb(g, bronze, [side * .27, .7, -.14], [side * .3, .5, -.06], .07); limb(g, bronze, [side * .3, .5, -.06], [side * .1, .42, .08], .06); }
    lmAdd(g, new THREE.SphereGeometry(1, 12, 8), bronze, 0, .42, .1).scale.set(.14, .045, .08);   // hands in the mudra
    limb(g, bronze, [0, .76, -.12], [0, .8, -.1], .07);
    const head = lmAdd(g, new THREE.SphereGeometry(.16, 18, 14), bronze, 0, .93, -.06); head.scale.set(.92, 1.08, .98);
    const hair = lmAdd(g, new THREE.SphereGeometry(.163, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2.1), curls, 0, .95, -.07); hair.scale.set(.93, 1.05, 1);
    curls.map.repeat?.set(3, 3);
    lmAdd(g, new THREE.SphereGeometry(.075, 12, 8), curls, 0, 1.1, -.08);                         // ushnisha
    for (const side of [-1, 1]) limb(g, bronze, [side * .15, .96, -.06], [side * .16, .8, -.05], .022);   // long earlobes
    lmAdd(g, new THREE.SphereGeometry(.015, 8, 6), lmMaterial(0xd8c37a, { metalness: .6 }), 0, .99, .1);   // urna
    lmCyl(g, .07, .06, .1, bronze, 0, .04, .5, 10); lmAdd(g, octagonRoof(.09, .01, .06), bronze, 0, .14, .5);
    for (const side of [-1, 1]) { lmCyl(g, .03, .04, .12, bronze, side * .2, .04, .5, 10); lmAdd(g, new THREE.SphereGeometry(.05, 8, 6), lmMaterial(0xc85a7a), side * .2, .19, .5).scale.y = .6; }
    for (const [x, z, s] of [[-.65, -.65, 2.4], [.65, -.7, 2.8], [-.82, .15, 2], [.85, .05, 2.1], [0, -.85, 2.6]]) gardenPine(g, x, z, s);
    return g;
  },
  tree(o = {}) {   // Jomon Sugi: the ancient cedar — a short, enormously thick, fluted and burled trunk, a few massive crooked limbs with sparse tufts of needles, moss and ferns at its foot, the wooden viewing deck, and slender younger cedars of the Yakushima forest around it
    const g = new THREE.Group();
    const bark = lmMaterial(0x6e5848, { map: TEXTURES.wood, roughness: 1 }), moss = lmMaterial(0x6f8f3a, { roughness: 1 }), needles = lmMaterial(0x2f5a35, { roughness: 1 }), fern = lmMaterial(0x4f8a3a, { roughness: 1 });
    lmBox(g, 2.2, .01, 2.0, lmMaterial(0x4e6a3a, { roughness: 1 }), 0, 0, 0);
    const r = .22;
    const trunk = [[r * 1.7, 0], [r * 1.25, .06], [r * 1.1, .18], [r, .34], [r * .9, .46], [r * .62, .52]].map(([x, y]) => new THREE.Vector2(x, y));
    const trunkGeometry = new THREE.LatheGeometry(trunk, 18);
    const pos = trunkGeometry.attributes.position;
    for (let i = 0; i < pos.count; i++) { const a = Math.atan2(pos.getZ(i), pos.getX(i)), y = pos.getY(i), k = 1 + .16 * Math.sin(a * 6 + y * 4) + .08 * Math.sin(a * 13 - y * 9) + .1 * Math.max(0, .15 - y) / .15 * Math.sin(a * 4); pos.setXYZ(i, pos.getX(i) * k, y, pos.getZ(i) * k); }
    trunkGeometry.computeVertexNormals();
    lmAdd(g, trunkGeometry, bark, 0, 0, 0);
    for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; lmAdd(g, roughMass(.08, .04, .06, { seed: k + 3, jitter: .3, detail: 1 }), moss, Math.cos(a) * r * 1.3, .08 + (k % 3) * .12, Math.sin(a) * r * 1.3); }
    for (const [dx, dz, up, len] of [[1, .2, .5, .45], [-.9, .4, .6, .4], [.2, -1, .55, .38], [-.4, -.7, .7, .32], [.1, .2, 1, .3]]) {
      const base = [dx * r * .5, .5, dz * r * .5], tip = [dx * len, .5 + up * len, dz * len];
      limb(g, bark, base, tip, .05);
      const kink = [tip[0] * 1.25, tip[1] + .12, tip[2] * 1.25];
      limb(g, bark, tip, kink, .03);
      for (let k = 0; k < 3; k++) lmAdd(g, roughMass(.12, .06, .1, { seed: dx * 9 + k, jitter: .35, detail: 1 }), needles, kink[0] + (k - 1) * .06, kink[1] + .03 * k, kink[2] + (k % 2) * .05);
    }
    for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2 + .2, d = .45 + (k % 3) * .06; const f = lmAdd(g, new THREE.ConeGeometry(.05, .06, 5), fern, Math.cos(a) * d, .03, Math.sin(a) * d); f.scale.set(1.5, .6, 1.5); }
    lmBox(g, .7, .02, .2, LM.wood, 0, .06, .72);
    for (const x of [-.34, 0, .34]) lmCyl(g, .01, .01, .06, LM.wood, x, 0, .72, 5);
    for (const x of [-.34, .34]) lmCyl(g, .008, .008, .1, LM.wood, x, .08, .81, 5);
    lmBox(g, .7, .012, .012, LM.wood, 0, .17, .81);
    for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2 + .5, d = .85 + (k % 2) * .15; treeAt(g, { x: Math.cos(a) * d, z: Math.sin(a) * d * .9, height: .9 + (k % 3) * .15, girth: .035, leaf: needles }); }
    return g;
  },
  triumphArch() {   // Pyongyang Arch of Triumph: a massive pale granite arch — tall round-headed opening with a moulded archivolt, paired pilasters and relief panels on the piers, a deep cornice, a band of Korean bracketed eaves under the attic, and a stepped crown
    const g = new THREE.Group();
    const stone = lmMaterial(0xe8e4da), stoneShade = lmMaterial(0xd6d1c4), tile = lmMaterial(0x6f6a62);
    lmBox(g, 1.5, .02, 1.0, lmMaterial(0xcfc9bd), 0, 0, 0);
    for (const side of [-1, 1]) {
      lmBox(g, .34, .72, .5, stone, side * .35, .02, 0);
      for (const z of [-.26, .26]) for (const dx of [-.11, .11]) lmBox(g, .05, .64, .03, stoneShade, side * .35 + dx, .04, z);
      for (const z of [-.252, .252]) lmBox(g, .12, .18, .01, stoneShade, side * .35, .3, z);   // relief panels
    }
    lmBox(g, 1.04, .22, .5, stone, 0, .74, 0);
    lmBox(g, .36, .54, .52, LM.black, 0, .02, 0);
    const vault = new THREE.CylinderGeometry(.18, .18, .52, 28, 1, false, -Math.PI / 2, Math.PI); vault.rotateX(Math.PI / 2);
    lmAdd(g, vault, LM.black, 0, .56, 0);
    for (const z of [-.255, .255]) { const ring = lmAdd(g, new THREE.TorusGeometry(.19, .015, 6, 24, Math.PI), stoneShade, 0, .56, z); }
    for (const [y, inset] of [[.96, 0], [.99, .03]]) lmBox(g, 1.12 - inset, .03, .58 - inset, stoneShade, 0, y, 0);
    lmHip(g, .48, .58, .05, tile, 0, 1.02, 0, .55);                                                // the band of bracketed eaves
    for (let i = 0; i < 18; i++) lmBox(g, .02, .02, .02, stoneShade, -.51 + i * .06, 1.0, .29);
    lmBox(g, .82, .12, .38, stone, 0, 1.07, 0);
    lmBox(g, .86, .02, .42, stoneShade, 0, 1.19, 0);
    lmBox(g, .5, .07, .26, stone, 0, 1.21, 0);
    lmBox(g, .1, .05, .1, stoneShade, 0, 1.28, 0);
    return g;
  }
});

// --- second redraw pass, from reference photos ---------------------------------------------------------------------------
Object.assign(LANDMARK_BUILDERS, {
  sky85() {        // 85 Sky Tower: dark blue-green glass in the shape of the character 高 — two broad side wings with stepped tops that join at mid height across a great open gap, a slimmer central tower rising from the join with stepped setbacks, a recessed light strip up its face, and a spire
    const g = new THREE.Group();
    const glass = lmMaterial(0x5f8d96, { map: TEXTURES.windows, metalness: .5, roughness: .25 }), strip = lmMaterial(0xc9b98a, { metalness: .3, roughness: .4 }), concrete = lmMaterial(0xb7b3a8);
    lmBox(g, 1.0, .05, .6, concrete, 0, 0, 0);
    for (const side of [-1, 1]) {
      const x = side * .27;
      lmBox(g, .2, .5, .28, glass, x, .05, 0);                                    // wing
      lmBox(g, .16, .05, .24, glass, x - side * .01, .55, 0);                     // stepped wing tops
      lmBox(g, .11, .04, .2, glass, x - side * .03, .6, 0);
      lmBox(g, .02, .5, .282, strip, x + side * .07, .05, 0);                      // the light bands up each wing
    }
    lmBox(g, .34, .1, .28, glass, 0, .4, 0);                                       // the bridge across the gap
    lmBox(g, .345, .012, .285, strip, 0, .4, 0);
    // central tower with setbacks
    let y = .5;
    for (const [w, h] of [[.24, .22], [.2, .16], [.16, .12], [.12, .08]]) { lmBox(g, w, h, w * 1.05, glass, 0, y, 0); lmBox(g, .03, h, w * 1.06, strip, 0, y, 0); y += h; }
    lmAdd(g, squareFrustum(.01, .06, .08), glass, 0, y + .04, 0);
    lmCyl(g, .006, .01, .2, lmMaterial(0xd9dde2, { metalness: .8, roughness: .3 }), 0, y + .08, 0, 6);
    return g;
  },
  kumamotoCastle() { // Kumamoto Castle: the black keep — black clapboard walls with white plaster bands under each eave, layered grey-tiled roofs with triangular chidori and curved kara gables, a black shachi-hoko pair on the ridge — on the great curving "musha-gaeshi" stone base, with the smaller connected keep beside it
    const g = new THREE.Group();
    const black = lmMaterial(0x1e1f22, { map: TEXTURES.wood }), plaster = lmMaterial(0xf2efe8), tile = lmMaterial(0x4a4f56, { map: TEXTURES.tiles }), stone = lmMaterial(0x8e897e, { map: TEXTURES.stone });
    // the curving stone base: slices that steepen toward the top
    const base = (x, z, half, height) => {
      const steps = 6;
      for (let i = 0; i < steps; i++) {
        const t0 = i / steps, t1 = (i + 1) / steps, w0 = half * (1.5 - .5 * Math.sqrt(t0)), w1 = half * (1.5 - .5 * Math.sqrt(t1));
        lmAdd(g, squareFrustum(w1, w0, height / steps), stone, x, height * (t0 + t1) / 2, z);
      }
      return height;
    };
    const keep = (x, z, half, tiers, baseH) => {
      let y = base(x, z, half, baseH), h = half;
      for (let k = 0; k < tiers; k++) {
        const wallH = h * (k ? .62 : .8);
        lmBox(g, h * 2, wallH, h * 2, black, x, y, z);
        lmBox(g, h * 2.02, wallH * .14, h * 2.02, plaster, x, y + wallH * .86, z);   // white band under the eave
        for (let i = 0; i < 3; i++) lmBox(g, h * .26, wallH * .22, .006, plaster, x - h * .6 + i * h * .6, y + wallH * .4, z + h + .003);   // windows
        y += wallH;
        const roofH = h * .5;
        lmHip(g, h * .6, h * 1.4, roofH, tile, x, y, z);
        if (k < tiers - 1) {
          for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
            const ox = Math.sin(yaw) * h * .95, oz = Math.cos(yaw) * h * .95;
            (k % 2 ? curvedGableAt : gableAt)(g, { x: x + ox, y: y + roofH * .25, z: z + oz, width: h * .9, height: roofH * .8, depth: .03, material: tile, yaw });
            (k % 2 ? curvedGableAt : gableAt)(g, { x: x + ox * 1.01, y: y + roofH * .3, z: z + oz * 1.01, width: h * .6, height: roofH * .5, depth: .02, material: plaster, yaw });
          }
        }
        y += roofH * .55; h *= .78;
      }
      lmBox(g, h * 1.6, .03, .04, black, x, y + .03, z);
      for (const side of [-1, 1]) lmAdd(g, new THREE.ConeGeometry(.02, .06, 5), black, x + side * h * .75, y + .07, z).rotation.z = side * .4;
    };
    keep(0, 0, .22, 4, .26);
    keep(.48, .1, .14, 3, .2);
    lmBox(g, .2, .09, .1, black, .28, .3, .06); lmHip(g, .04, .14, .05, tile, .28, .39, .06, .7);   // the passage joining the keeps
    for (let i = 0; i < 6; i++) gardenPine(g, -.75 + i * .3, .65, 1.6);
    return g;
  },
  skyline() {      // Haeundae LCT: three slender glass towers with softly curved, faceted faces that taper into slanted pointed crowns — the tall landmark tower between two residential towers — with Marine City behind, the curving sand beach and the sea in front
    const g = new THREE.Group();
    const glass = lmMaterial(0x8fb0c2, { map: TEXTURES.windows, metalness: .55, roughness: .2 }), sand = lmMaterial(0xe8d9b0), sea = lmMaterial(0x2f7fb8, { roughness: .15, metalness: .15 });
    const lct = (x, z, h, w) => {
      const tower = lmAdd(g, loftedTower(h, (t) => w * (1 - .15 * t) * (t > .86 ? Math.max(.08, 1 - (t - .86) / .14 * .92) : 1), { corner: .8, steps: 30, segments: 8 }), glass, x, 0, z);
      tower.scale.z = .62; tower.rotation.y = .35;
    };
    lct(0, 0, 1.25, .14); lct(-.3, .05, 1.03, .12); lct(.3, .05, 1.03, .12);
    for (const [x, z, h] of [[-.75, -.35, .7], [-.6, -.5, .6], [.7, -.4, .72], [.55, -.55, .55], [-.95, -.2, .5], [.95, -.25, .52]]) lmBox(g, .1, h, .1, lmMaterial(0xc6d0d8, { map: TEXTURES.windows }), x, 0, z);
    const beach = new THREE.Shape(); beach.moveTo(-1.3, .25); beach.quadraticCurveTo(0, .6, 1.3, .25); beach.lineTo(1.3, .45); beach.quadraticCurveTo(0, .85, -1.3, .45); beach.closePath();
    lmAdd(g, new THREE.ExtrudeGeometry(beach, { depth: .01, bevelEnabled: false }).rotateX(Math.PI / 2), sand, 0, .01, 0);
    lmBox(g, 2.8, .006, .7, sea, 0, 0, 1.0);
    lmAdd(g, roughMass(1.2, .35, .3, { seed: 3, jitter: .2 }), lmMaterial(0x3e6a45, { roughness: 1 }), 0, 0, -1.0);   // Jangsan behind
    return g;
  },
  busanTower() {    // Busan Tower: a slender fluted white shaft ending in a lantern of stacked, flaring white rings like the tiers of a Silla pagoda, with a band of observation glass and a pointed finial, standing among the pines of Yongdusan Park
    const g = new THREE.Group();
    const white = lmMaterial(0xf2f2ef), glass = lmMaterial(0x5d7f96, { metalness: .5, roughness: .2 });
    lmBox(g, 1.0, .02, 1.0, lmMaterial(0xcfc9bd, { map: TEXTURES.stone }), 0, 0, 0);
    lmCyl(g, .14, .16, .06, white, 0, .02, 0, 16);
    const shaft = lmCyl(g, .05, .065, .86, white, 0, .08, 0, 12);
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; lmBox(g, .012, .86, .02, white, Math.cos(a) * .06, .08, Math.sin(a) * .06, -a); }
    let y = .94;
    lmCyl(g, .1, .06, .05, white, 0, y, 0, 16); y += .05;
    lmCyl(g, .11, .11, .06, glass, 0, y, 0, 16); y += .06;
    for (let k = 0; k < 4; k++) {   // stacked pagoda-like rings
      const r = .13 - k * .022;
      lmCyl(g, r, r * .8, .02, white, 0, y, 0, 16);
      lmCyl(g, r * .7, r * .7, .03, white, 0, y + .02, 0, 16);
      y += .05;
    }
    lmCyl(g, .004, .015, .12, white, 0, y, 0, 8);
    for (const [x, z] of [[-.4, .3], [.4, .35], [-.35, -.35], [.38, -.3]]) gardenPine(g, x, z, 2);
    return g;
  },
  aquarium() {     // Churaumi Aquarium: long cream concrete buildings stepping down toward the sea, crowned by broad flat white roof slabs that overhang deeply on slim columns, a glass-walled entrance hall, and the plaza with the big whale-shark sculpture
    const g = new THREE.Group();
    const cream = lmMaterial(0xe9e3d6), concrete = lmMaterial(0xcbc6ba), glass = lmMaterial(0x4f7f99, { metalness: .5, roughness: .2 });
    for (let k = 0; k < 3; k++) {
      const z = -.55 + k * .5, y = .36 - k * .12, w = 2.0 - k * .25;
      lmBox(g, w, y, .42, concrete, 0, 0, z);
      lmBox(g, w * .92, .16, .02, glass, 0, y - .2, z + .212);
      lmBox(g, w * 1.08, .035, .62, cream, 0, y + .02, z + .06);                  // the deep flat roof slab
      for (let i = 0; i < 10; i++) lmCyl(g, .012, .012, .2, cream, -w * .5 + i * w / 9, y - .18, z + .32, 8);
    }
    lmBox(g, .5, .2, .3, glass, 0, 0, .55);                                       // entrance hall
    lmBox(g, .62, .025, .42, cream, 0, .2, .55);
    lmBox(g, 1.6, .012, .6, lmMaterial(0xd8cfbd, { map: TEXTURES.stone }), 0, 0, .95);
    // the whale-shark sculpture: broad flat head, white spots, tall tail fin, on a low plinth
    const spotted = lmMaterial(0x4b6f8c, { roughness: .5 });
    lmBox(g, .5, .04, .18, concrete, .1, .012, 1.0);
    const body = lmAdd(g, roughMass(.24, .055, .08, { seed: 9, jitter: .04 }), spotted, .1, .1, 1.0); body.rotation.z = .1;
    lmAdd(g, new THREE.ConeGeometry(.05, .14, 3), spotted, -.16, .14, 1.0).rotation.set(0, 0, .3);
    lmAdd(g, new THREE.ConeGeometry(.03, .06, 3), spotted, .1, .17, 1.0);
    for (let i = 0; i < 10; i++) lmAdd(g, new THREE.SphereGeometry(.007, 6, 4), lmMaterial(0xf2f2ee), -.06 + (i % 5) * .07, .14 + Math.floor(i / 5) * .015, 1.0 + (i % 2 ? .06 : -.06));
    return g;
  },
  village() {       // Jiufen: the A-Mei teahouse — a tall dark-timber building stacked up the hillside with balconies, deep tiled eaves and dozens of glowing red lanterns — beside the narrow stone stair street, more teahouses stepping up the slope and the green peak behind
    const g = new THREE.Group();
    const timber = lmMaterial(0x4a2e22, { map: TEXTURES.wood }), dark = lmMaterial(0x2b2a2c, { map: TEXTURES.tiles }), lit = lmMaterial(0xffc979, { map: TEXTURES.lit, emissive: 0xffb050, emissiveIntensity: .5 }), stone = lmMaterial(0x8a857a, { map: TEXTURES.stone });
    lmAdd(g, roughMass(1.4, .9, 1.1, { seed: 5, jitter: .12 }), lmMaterial(0x3f6e45, { roughness: 1 }), 0, 0, -.9);
    // the stair street climbing between the buildings
    for (let s = 0; s < 14; s++) lmBox(g, .12, .05, .1, stone, -.08, s * .05, .7 - s * .1);
    // the A-Mei teahouse: four stepped storeys
    const tx = .18;
    for (let k = 0; k < 4; k++) {
      const y = k * .16, z = .45 - k * .14, w = .5 - k * .03;
      lmBox(g, w, .16, .3, timber, tx, y, z);
      lmBox(g, w * .9, .08, .006, lit, tx, y + .05, z + .152);                     // warm windows
      lmBox(g, w + .04, .012, .06, timber, tx, y + .02, z + .18);                  // balcony
      for (let i = 0; i < 8; i++) lmCyl(g, .003, .003, .04, timber, tx - w / 2 + i * w / 7, y + .032, z + .205, 4);
      lmHip(g, w * .35, w * .62, .07, dark, tx, y + .16, z, .6);
      for (let i = 0; i < 6; i++) lmAdd(g, new THREE.SphereGeometry(.018, 8, 6), LM.lantern, tx - w / 2 + .04 + i * (w - .08) / 5, y + .14, z + .2).scale.y = 1.3;   // red lanterns along every eave
    }
    lmBox(g, .02, .12, .1, lmMaterial(0xc8341f), tx + .27, .1, .45);             // the sign
    // more teahouses up the slope on both sides
    for (let k = 0; k < 6; k++) {
      const side = k % 2 ? -1 : 1, x = side < 0 ? -.4 - (k % 3) * .1 : .62, y = .1 + k * .1, z = .2 - k * .17;
      lmBox(g, .3, .14, .22, timber, x, y, z);
      lmBox(g, .26, .06, .006, lit, x, y + .04, z + .112);
      lmHip(g, .08, .2, .06, dark, x, y + .14, z, .7);
      for (let i = 0; i < 3; i++) lmAdd(g, new THREE.SphereGeometry(.015, 8, 6), LM.lantern, x - .08 + i * .08, y + .12, z + .13);
    }
    return g;
  },
  statue() {       // Nagasaki Peace Statue: the 10 m seated figure in pale blue-green bronze — broad muscular chest and shoulders, eyes closed, wavy hair, the right arm raised straight up pointing at the sky, the left arm stretched forward level, palm down, the right leg folded on the rock and the left foot planted, a cloth over the lap — on a tall pale granite plinth with a stepped base
    const g = new THREE.Group();
    const bronze = lmMaterial(0x86aea8, { roughness: .45, metalness: .35 }), granite = lmMaterial(0xd6d1c6, { map: TEXTURES.stone });
    lmBox(g, 1.0, .06, .7, granite, 0, 0, 0); lmBox(g, .86, .3, .56, granite, 0, .06, 0); lmBox(g, .9, .025, .6, granite, 0, .36, 0);
    lmAdd(g, roughMass(.25, .06, .17, { seed: 2, jitter: .1 }), lmMaterial(0x7d9e98, { roughness: .7 }), 0, .43, -.03);   // rocky seat
    // torso: one smooth lathe from the hips up through a broad chest to the shoulders, flattened front-to-back
    const trunk = [[.15, 0], [.14, .06], [.13, .12], [.15, .18], [.18, .24], [.19, .28], [.15, .31], [.06, .33], [.001, .335]].map(([r, y]) => new THREE.Vector2(r, y));
    const torso = lmAdd(g, new THREE.LatheGeometry(trunk, 20), bronze, 0, .46, -.02); torso.scale.z = .6;
    lmBox(g, .006, .12, .01, lmMaterial(0x6f958f), 0, .58, .085);                                              // the line down the chest
    for (const side of [-1, 1]) lmAdd(g, new THREE.SphereGeometry(.06, 12, 8), bronze, side * .19, .76, -.02);   // deltoids
    limb(g, bronze, [0, .78, -.02], [0, .83, -.01], .045);                                                     // neck
    const head = lmAdd(g, new THREE.SphereGeometry(.07, 16, 12), bronze, 0, .9, .0); head.scale.set(.92, 1.08, 1);
    lmAdd(g, new THREE.SphereGeometry(.073, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), lmMaterial(0x6f948e, { roughness: .6 }), 0, .915, -.01).scale.set(1, 1.05, 1.05);   // hair
    lmBox(g, .012, .03, .02, bronze, 0, .9, .068);                                                             // nose
    for (const side of [-1, 1]) lmBox(g, .025, .004, .006, lmMaterial(0x5a7c77), side * .025, .915, .062);     // closed eyes
    // right arm straight up, the index finger pointing to the sky
    limb(g, bronze, [.2, .76, -.02], [.21, .94, -.03], .04); limb(g, bronze, [.21, .94, -.03], [.2, 1.1, -.02], .033);
    lmAdd(g, new THREE.SphereGeometry(.03, 10, 8), bronze, .2, 1.13, -.02); limb(g, bronze, [.2, 1.15, -.02], [.2, 1.2, -.02], .008);
    // left arm stretched forward and out, palm down
    limb(g, bronze, [-.2, .76, -.02], [-.33, .73, .12], .04); limb(g, bronze, [-.33, .73, .12], [-.45, .72, .27], .033);
    lmBox(g, .06, .018, .08, bronze, -.48, .71, .31).rotation.y = .7;
    // legs
    limb(g, bronze, [.09, .5, .03], [.18, .52, .22], .06); limb(g, bronze, [.18, .52, .22], [.06, .46, .28], .048); lmBox(g, .1, .035, .06, bronze, .02, .44, .29);   // folded right leg
    limb(g, bronze, [-.09, .5, .03], [-.13, .52, .24], .06); limb(g, bronze, [-.13, .52, .24], [-.14, .4, .28], .048); lmBox(g, .07, .03, .12, bronze, -.14, .38, .32);   // left foot planted
    const cloth = lmAdd(g, roughMass(.21, .045, .16, { seed: 5, jitter: .12 }), lmMaterial(0x7aa39d, { roughness: .55, metalness: .3 }), 0, .52, .12); cloth.rotation.x = -.15;
    return g;
  },
  buddha() {       // Kamakura Daibutsu: the seated bronze Amida, slightly stooped forward, head large in proportion with rows of snail-shell curls and a low ushnisha, heavy-lidded downcast eyes, long nose, small mouth, pendulous earlobes; the robe drapes over both shoulders in loose folds; hands rest in the lap in the meditation mudra, thumbs touching; granite platform, bronze lotus vase and incense burner in front, pines behind
    const g = new THREE.Group();
    const bronze = lmMaterial(0x5f8170, { roughness: .45, metalness: .45 }), dark = lmMaterial(0x3f5a4e, { roughness: .5, metalness: .4 }), granite = lmMaterial(0xcfc8ba, { map: TEXTURES.stone });
    lmBox(g, 1.5, .04, 1.4, granite, 0, 0, 0); lmBox(g, 1.15, .07, 1.0, granite, 0, .04, -.05);
    const lotus = [[.52, 0], [.56, .03], [.53, .08], [.46, .11], [.001, .11]].map(([r, y]) => new THREE.Vector2(r, y));
    lmAdd(g, new THREE.LatheGeometry(lotus, 28), bronze, 0, .11, -.08).scale.z = .78;
    lmAdd(g, roughMass(.48, .13, .33, { seed: 2, jitter: .03 }), bronze, 0, .31, -.03);                       // crossed legs
    for (let i = 0; i < 5; i++) lmBox(g, .5 - i * .06, .008, .012, dark, 0, .3 + i * .03, .26 - i * .01);      // robe folds over the knees
    const robe = [[.37, 0], [.33, .1], [.29, .2], [.28, .3], [.3, .36], [.25, .42], [.11, .45], [.001, .46]].map(([r, y]) => new THREE.Vector2(r, y));
    const body = lmAdd(g, new THREE.LatheGeometry(robe, 24), bronze, 0, .32, -.15); body.scale.z = .6; body.rotation.x = .12;
    for (let i = 0; i < 4; i++) { const fold = lmAdd(g, new THREE.TorusGeometry(.2 - i * .02, .006, 4, 20, Math.PI), dark, 0, .64 - i * .07, -.03); fold.rotation.x = Math.PI / 2 + .35; fold.scale.y = .55; }   // the robe's draped neckline folds
    for (const side of [-1, 1]) { limb(g, bronze, [side * .26, .7, -.15], [side * .31, .5, -.07], .075); limb(g, bronze, [side * .31, .5, -.07], [side * .1, .42, .08], .062); }
    lmAdd(g, new THREE.SphereGeometry(1, 12, 8), bronze, 0, .42, .1).scale.set(.13, .045, .08);              // the hands, one on the other
    limb(g, bronze, [-.03, .45, .14], [.03, .45, .14], .012);                                                 // thumbs touching
    limb(g, bronze, [0, .77, -.13], [0, .81, -.11], .075);
    const head = lmAdd(g, new THREE.SphereGeometry(.165, 20, 16), bronze, 0, .95, -.07); head.scale.set(.92, 1.1, .96);
    // snail-shell curls: rows of little knobs over the crown (merged into one mesh)
    const curls = [];
    for (let row = 0; row < 7; row++) {
      const phi = .12 + row * .18, count = Math.round(6 + Math.sin(phi) * 20);
      for (let i = 0; i < count; i++) {
        const theta = i / count * Math.PI * 2 + row * .3;
        if (row > 3 && Math.cos(theta) > .55) continue;                                                       // leave the forehead clear
        curls.push(new THREE.SphereGeometry(.018, 6, 4).translate(Math.sin(phi) * Math.sin(theta) * .152, Math.cos(phi) * .18 + .02, Math.sin(phi) * Math.cos(theta) * .158));
      }
    }
    const curlMesh = new THREE.Mesh(mergeGeometries(curls), dark); curlMesh.position.set(0, .95, -.07); g.add(curlMesh);
    lmAdd(g, new THREE.SphereGeometry(.07, 12, 8), bronze, 0, 1.13, -.08).scale.y = .7;                      // low ushnisha
    // face: heavy downcast eyelids, long nose, small mouth, urna
    for (const side of [-1, 1]) { const lid = lmAdd(g, new THREE.SphereGeometry(.03, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), dark, side * .05, .975, .085); lid.scale.set(1.3, .35, .5); lid.rotation.x = .5; }
    lmBox(g, .028, .07, .03, bronze, 0, .93, .1).rotation.x = -.15;
    lmBox(g, .05, .008, .01, dark, 0, .88, .105);
    lmAdd(g, new THREE.SphereGeometry(.012, 8, 6), lmMaterial(0xcdb36a, { metalness: .6 }), 0, 1.01, .095);
    for (const side of [-1, 1]) limb(g, bronze, [side * .155, .99, -.07], [side * .165, .81, -.06], .022);    // long earlobes
    // in front: incense burner and the bronze lotus vases
    lmCyl(g, .07, .06, .1, bronze, 0, .04, .5, 10); lmAdd(g, octagonRoof(.09, .01, .06), bronze, 0, .14, .5);
    for (const side of [-1, 1]) { lmCyl(g, .03, .04, .12, bronze, side * .2, .04, .5, 10); lmAdd(g, new THREE.SphereGeometry(.05, 8, 6), lmMaterial(0xc85a7a), side * .2, .19, .5).scale.y = .6; }
    for (const [x, z, s] of [[-.65, -.65, 2.4], [.65, -.7, 2.8], [-.82, .15, 2], [.85, .05, 2.1], [0, -.85, 2.6]]) gardenPine(g, x, z, s);
    return g;
  }
});

// 85 Sky Tower, detailed from a photo of the skyline view
// curtain-wall glass: a pane colour with thin mullions every floor and every few metres
function curtainWall(pane, mullion, floors = 6, bays = 3) {
  return patternTexture((ctx, size) => {
    ctx.fillStyle = pane; ctx.fillRect(0, 0, size, size);
    const glare = ctx.createLinearGradient(0, 0, size, size); glare.addColorStop(0, '#ffffff22'); glare.addColorStop(1, '#00000022');
    ctx.fillStyle = glare; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = mullion;
    for (let i = 0; i < floors; i++) ctx.fillRect(0, i * size / floors, size, size / 128);
    for (let i = 0; i < bays; i++) ctx.fillRect(i * size / bays, 0, size / 192, size);
  }, 512);
}
LANDMARK_BUILDERS.sky85 = () => {
  const g = new THREE.Group();
  // low metal plus a faint self-glow through the facade texture keeps the glass bright blue alongside the room environment reflections
  const facade = (map, extra) => lmMaterial(0xffffff, { map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: .35, ...extra });
  const navy = facade(curtainWall('#315d6a', '#314c52'), { metalness: .1, roughness: .35 });
  const teal = facade(curtainWall('#739fa6', '#4d7378', 8, 4), { metalness: .1, roughness: .3 });
  const beige = facade(curtainWall('#ece4cf', '#8c8472', 7, 5), { roughness: .5 });
  const frame = lmMaterial(0x41597d, { metalness: .1, roughness: .4 });
  const white = lmMaterial(0xf6f7f8, { metalness: .05, roughness: .35 });
  const peach = lmMaterial(0xe6b7a0, { map: TEXTURES.windows, roughness: .6 });
  // the peach podium wrapped round the base
  lmBox(g, 1.6, .12, .62, peach, 0, 0, .05);
  lmBox(g, 1.62, .012, .64, white, 0, .12, .05);
  // the two legs of 高, each with a pale blue-green glass band down its face and notched parapet tops
  for (const side of [-1, 1]) {
    const x = side * .28;
    lmBox(g, .36, .52, .36, navy, x, .1, 0);
    for (const z of [.182, -.182]) lmBox(g, .22, .46, .005, teal, x - side * .04, .13, z);   // the broad light glass panel on front and back
    lmBox(g, .006, .46, .22, teal, x + side * .182, .13, 0);                     // and on the outer side
    for (const dx of [-.17, .17]) lmBox(g, .02, .52, .37, frame, x + dx, .1, 0); // dark corner piers
    lmBox(g, .37, .02, .37, frame, x, .62, 0);
    for (const [dx, dz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) lmBox(g, .07, .04, .07, navy, x + dx * .145, .64, dz * .145);   // notched parapet corners
    lmBox(g, .2, .025, .2, navy, x, .64, 0);
  }
  // the great opening between the legs: a dark core and the low building inside, the mullioned bridge across the top
  // Keep the space between the two legs genuinely open, as in the harbour-facing silhouette.
  lmBox(g, .16, .06, .2, peach, 0, .12, .05);
  lmBox(g, .2, .1, .34, navy, 0, .52, 0);                                        // the bridge over the opening: dark glass with a lit band of windows
  lmBox(g, .18, .035, .345, beige, 0, .555, 0);
  for (let i = 0; i < 6; i++) lmBox(g, .004, .1, .35, frame, -.09 + i * .036, .52, 0);
  // the central tower: dark piers either side of a pale banded centre, with a darker band two-thirds up
  const y0 = .62, y1 = 1.42;                                                     // the shaft rises well above the wings (about 40% of the height)
  lmBox(g, .14, y1 - y0, .26, beige, 0, y0, 0);
  for (const side of [-1, 1]) lmBox(g, .065, y1 - y0, .27, navy, side * .1, y0, 0);
  for (const side of [-1, 1]) lmBox(g, .008, y1 - y0, .275, frame, side * .135, y0, 0);
  for (const side of [-1, 1]) lmBox(g, .006, y1 - y0, .14, beige, side * .138, y0, 0);   // the pale centre panel runs up every face
  lmBox(g, .275, .05, .28, navy, 0, 1.02, 0);
  lmBox(g, .275, .02, .28, frame, 0, 1.25, 0);
  lmBox(g, .24, .04, .25, navy, 0, y1, 0);                                       // setback below the crown
  // crown: a white open frame with corner spikes round a dark pyramid, then the white tiered spire
  const top = y1 + .04;
  lmAdd(g, squareFrustum(.02, .1, .12), frame, 0, top + .06, 0);
  for (const [dx, dz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    lmBox(g, .015, .07, .015, white, dx * .12, top, dz * .12);
    const spike = lmAdd(g, new THREE.ConeGeometry(.009, .035, 4), white, dx * .13, top + .09, dz * .13); spike.rotation.set(dz * .5, 0, -dx * .5);
  }
  for (const [w, d, x, z] of [[.25, .012, 0, .12], [.25, .012, 0, -.12], [.012, .25, .12, 0], [.012, .25, -.12, 0]]) lmBox(g, w, .015, d, white, x, top + .06, z);
  lmCyl(g, .018, .025, .04, white, 0, top + .12, 0, 8);
  lmCyl(g, .008, .012, .06, white, 0, top + .16, 0, 8);
  lmAdd(g, new THREE.SphereGeometry(.01, 8, 6), white, 0, top + .225, 0);
  lmCyl(g, .002, .005, .06, white, 0, top + .23, 0, 6);
  return mergeByMaterial(g);
};


// --- third pass: Taiwan's sights in high detail ------------------------------------------------------------------------
// Shared parts for the hand-detailed Taiwan models: balustrades, flights of steps, swept hip-and-gable roofs with
// swallowtail ridges, colonnades. Each builder ends by merging its meshes per material so the extra detail costs few draw calls.
const TW = {
  white: lmMaterial(0xf4f2ec), marble: lmMaterial(0xeeebe3), plaza: lmMaterial(0xd9d4c8),
  blueTile: lmMaterial(0x2c56b0, { map: TEXTURES.tiles, roughness: .45 }), tealTile: lmMaterial(0x3a7461, { map: TEXTURES.tiles, roughness: .45 }),
  yellowTile: lmMaterial(0xe8a832, { map: TEXTURES.tiles, roughness: .45 }), orangeTile: lmMaterial(0xd9762a, { map: TEXTURES.tiles, roughness: .5 }),
  greyTile: lmMaterial(0x5d6166, { map: TEXTURES.tiles }), redTile: lmMaterial(0xb5442c, { map: TEXTURES.tiles }), blackTile: lmMaterial(0x2f3134, { map: TEXTURES.tiles }),
  gold: lmMaterial(0xe0b03c, { metalness: .35, roughness: .35, emissive: 0x4a3300, emissiveIntensity: .35 }),
  red: lmMaterial(0xb8301e), darkRed: lmMaterial(0x7c2418), cream: lmMaterial(0xeadcb6), ochre: lmMaterial(0xc99a5a),
  timber: lmMaterial(0x4a3022, { map: TEXTURES.wood }), brick: lmMaterial(0xa5462f, { map: TEXTURES.brick }), oldBrick: lmMaterial(0x8a4430, { map: TEXTURES.brick, roughness: 1 }),
  doorBlue: lmMaterial(0x1d3566), glass: lmMaterial(0x30404c, { roughness: .3 }), grass: lmMaterial(0x5f9a4a, { roughness: 1 }), lawn: lmMaterial(0x6f8c50, { roughness: 1 }),
  hedge: lmMaterial(0x2f6b38, { roughness: 1 }), leaf: lmMaterial(0x3a6c3d, { roughness: 1 }), leafDark: lmMaterial(0x24532c, { roughness: 1 }), trunk: lmMaterial(0x5a4030, { roughness: 1 }),
  water: lmMaterial(0x2b78a8, { roughness: .15, metalness: .2 }), lantern: lmMaterial(0xe8301c, { emissive: 0xff3010, emissiveIntensity: .6 })
};
// a railing between two points: a top rail on short posts, standing on y
function balustrade(g, x0, z0, x1, z1, { y = 0, h = .03, material = TW.white, spacing = .03 } = {}) {
  const length = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(-(z1 - z0), x1 - x0);
  const n = Math.max(2, Math.round(length / spacing));
  lmBox(g, length, h * .2, h * .25, material, (x0 + x1) / 2, y + h * .8, (z0 + z1) / 2, yaw);
  lmBox(g, length, h * .15, h * .3, material, (x0 + x1) / 2, y, (z0 + z1) / 2, yaw);
  for (let i = 0; i <= n; i++) { const t = i / n; lmBox(g, h * .22, h, h * .22, material, x0 + (x1 - x0) * t, y, z0 + (z1 - z0) * t); }
}
// a flight of steps rising toward -z from its foot at z (rotate with yaw); returns the top height
function stairFlight(g, { x = 0, z = 0, y = 0, w, rise, run, steps = 10, material = TW.marble, yaw = 0 }) {
  const holder = new THREE.Group(); holder.position.set(x, y, z); holder.rotation.y = yaw;
  for (let i = 0; i < steps; i++) lmBox(holder, w, rise * (i + 1) / steps, run / steps, material, 0, 0, -(i + .5) * run / steps);
  g.add(holder);
  return y + rise;
}
// a swept East Asian hip roof over a w × d plan (ridge along x) with an upturned swallowtail main ridge
function sweptRoof(g, { x = 0, y, z = 0, w, d, h, material, ridge = material, ridgeRise = .3, overhang = 1.18, yaw = 0, ridgeLength = .5 }) {
  const holder = new THREE.Group(); holder.position.set(x, y, z); holder.rotation.y = yaw;
  const half = w / 2 * overhang;
  lmHip(holder, half * .35, half, h, material, 0, 0, 0, d / w);
  const length = w * ridgeLength, beam = h * .09;
  lmAdd(holder, curvedBeam(length, beam, beam * 1.2, beam * ridgeRise * 4), ridge, 0, h + beam * .3, 0);
  for (const side of [-1, 1]) {      // the hip ridges running down to the corners
    const from = new THREE.Vector3(side * length / 2, h, 0), to = new THREE.Vector3(side * half * .98, h * .12, half * d / w * .98);
    const to2 = to.clone().setZ(-to.z);
    holder.add(new THREE.Mesh(strutGeometry(from, to, beam * .35), ridge), new THREE.Mesh(strutGeometry(from, to2, beam * .35), ridge));
  }
  g.add(holder);
  return y + h;
}
// a row of round columns along x at z
function colonnade(g, { x0, x1, z, y = 0, h, r = .01, n, material = TW.red }) {
  for (let i = 0; i < n; i++) lmCyl(g, r, r * 1.1, h, material, x0 + (x1 - x0) * i / (n - 1), y, z, 8);
}
// collapse every mesh of a model into one mesh per material
function mergeByMaterial(g) {
  g.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(g.matrixWorld).invert();
  const buckets = new Map();
  g.traverse((o) => {
    if (!o.isMesh) return;
    const geometry = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    const keep = o.material.vertexColors ? ['position', 'normal', 'uv', 'color'] : ['position', 'normal', 'uv'];
    for (const name of Object.keys(geometry.attributes)) if (!keep.includes(name)) geometry.deleteAttribute(name);
    if (!geometry.attributes.uv) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, o.matrixWorld));
    if (!buckets.has(o.material)) buckets.set(o.material, []);
    buckets.get(o.material).push(geometry);
  });
  const merged = new THREE.Group();
  for (const [material, geometries] of buckets) merged.add(new THREE.Mesh(mergeGeometries(geometries), material));
  return merged;
}
const octagonPrism = (r, h) => new THREE.CylinderGeometry(r, r, h, 8).rotateY(Math.PI / 8);

// Chiang Kai-shek Memorial Hall and Liberty Square
LANDMARK_BUILDERS.cks = () => {
  const g = new THREE.Group();
  // the plaza: pale paving with lawns, the hall at the back, the gate at the front
  lmBox(g, 3.2, .01, 3.6, lmMaterial(0xd8d2c4), 0, 0, .9);
  for (const side of [-1, 1]) lmBox(g, .7, .012, 1.5, TW.lawn, side * .62, 0, 1.1);
  // the hall's stepped white terrace
  lmBox(g, 1.16, .1, 1.16, TW.marble, 0, 0, 0);
  lmBox(g, 1.0, .1, 1.0, TW.marble, 0, .1, 0);
  for (const s of [.58, .5]) {   // balustrades round both terrace edges
    const y = s > .55 ? .1 : .2;
    for (const [a, b, c, d] of [[-s, -s, s, -s], [s, -s, s, s], [-s, s, -s, -s]]) balustrade(g, a, b, c, d, { y, h: .028 });
    for (const side of [-1, 1]) balustrade(g, side * s, s, side * .16, s, { y, h: .028 });
  }
  // the great front stair: two flights with a landing, between stepped balustrades
  stairFlight(g, { z: .86, w: .38, rise: .1, run: .28, steps: 59 });
  stairFlight(g, { z: .58, y: .1, w: .38, rise: .1, run: .12, steps: 30 });
  for (const side of [-1, 1]) for (let k = 0; k < 5; k++) lmBox(g, .03, .05 + k * .04, .06, TW.marble, side * .165, 0, .84 - k * .07);
  // the white hall: a square block with a tall arched doorway in blue and gold
  const hy = .2, hh = .3, half = .3;
  lmBox(g, half * 2, hh, half * 2, TW.white, 0, hy, 0);
  lmBox(g, half * 2 + .02, .02, half * 2 + .02, TW.white, 0, hy, 0);
  archBay(g, 0, hy, half + .002, .18, .25, TW.white);
  archBay(g, 0, hy, half + .004, .15, .225, TW.doorBlue);
  for (let k = 0; k < 4; k++) lmBox(g, .002, .2, .002, TW.gold, -.06 + k * .04, hy, half + .006);
  // square-to-octagon transition, the lower octagonal eave of blue glazed tile, a white drum, the upper eave and the gold finial
  let y = hy + hh;
  lmBox(g, half * 2 + .04, .03, half * 2 + .04, TW.blueTile, 0, y, 0);
  y += .03;
  const lower = lmAdd(g, octagonRoof(.46, .24, .16), TW.blueTile, 0, y, 0);
  y += .13;
  lmAdd(g, octagonPrism(.23, .1), TW.white, 0, y + .05, 0);
  lmAdd(g, octagonPrism(.235, .018), TW.gold, 0, y + .1, 0);
  y += .11;
  const upper = lmAdd(g, octagonRoof(.33, .02, .2), TW.blueTile, 0, y, 0);
  y += .2;
  lmCyl(g, .022, .03, .025, TW.gold, 0, y - .01, 0, 12);
  lmAdd(g, new THREE.SphereGeometry(.028, 14, 10), TW.gold, 0, y + .04, 0);
  lmCyl(g, .006, .014, .05, TW.gold, 0, y + .06, 0, 8);
  for (const mesh of [lower, upper]) mesh.geometry.attributes.uv.array.forEach((v, i, a) => { a[i] = v * 6; });
  // the Liberty Square gate: one long white wall pierced by five openings, the middle one tallest, each bay under its own blue roof
  const gz = 2.45, widths = [.27, .31, .37, .31, .27], heights = [.2, .25, .32, .25, .2];
  let cursor = -widths.reduce((sum, w) => sum + w, 0) / 2;
  const bays = widths.map((w, k) => { const bay = [cursor + w / 2, w, heights[k]]; cursor += w; return bay; });
  for (const [bx, bw, bh] of bays) {
    // each bay is a wall shape with a round-headed arch cut as a hole (Shape.holes), extruded through the gate's depth
    const open = bw * .5, top = bh + .06, spring = bh * .78 - open / 2;
    const wall = new THREE.Shape([new THREE.Vector2(-bw / 2, 0), new THREE.Vector2(bw / 2, 0), new THREE.Vector2(bw / 2, top), new THREE.Vector2(-bw / 2, top)]);
    const arch = new THREE.Path(); arch.moveTo(-open / 2, 0); arch.lineTo(open / 2, 0); arch.lineTo(open / 2, spring); arch.absarc(0, spring, open / 2, 0, Math.PI, false); arch.lineTo(-open / 2, 0);
    wall.holes.push(arch);
    lmAdd(g, new THREE.ExtrudeGeometry(wall, { depth: .12, bevelEnabled: false, curveSegments: 16 }).translate(0, 0, -.06), TW.white, bx, 0, gz);
    lmBox(g, bw * .7, .006, .125, TW.gold, bx, top - .025, gz);
    sweptRoof(g, { x: bx, y: top, z: gz, w: bw * 1.02, d: .17, h: bh * .22, material: TW.blueTile, ridgeLength: .6 });
  }
  referencePlaque(g,'自由廣場',0,.282,gz+.064,.28,.045,'#173551','#eeeae0');
  referencePlaque(g,'中正紀念堂',0,.46,.306,.21,.032,'#d8c378','#f2efe5');
  // the National Theater and Concert Hall facing each other across the square: red colonnades under yellow double roofs
  for (const side of [-1, 1]) {
    const x = side * 1.3, z = 1.35;
    lmBox(g, .4, .04, .72, TW.marble, x, 0, z);
    lmBox(g, .3, .13, .62, TW.cream, x, .04, z);
    for (let k = 0; k < 9; k++) lmCyl(g, .008, .009, .13, TW.red, x - side * .165, .04, z - .3 + k * .075, 8);
    sweptRoof(g, { x, y: .17, z, w: .68, d: .4, h: .055, material: TW.yellowTile, yaw: Math.PI / 2, overhang: 1.12, ridgeLength: .7 });
    lmBox(g, .2, .035, .5, TW.red, x, .215, z);
    sweptRoof(g, { x, y: .25, z, w: .54, d: .24, h: .065, material: TW.yellowTile, yaw: Math.PI / 2, ridgeLength: .7 });
  }
  lmBox(g, .32, .013, 1.7, lmMaterial(0xeae6dc), 0, 0, 1.6);       // the pale processional way from gate to hall
  // the white perimeter walls with blue coping and the trees inside them
  for (const side of [-1, 1]) {
    lmBox(g, .04, .08, 3.0, TW.white, side * 1.58, 0, .95);
    lmBox(g, .07, .02, 3.0, TW.blueTile, side * 1.58, .08, .95);
  }
  for (let k = 0; k < 10; k++) for (const side of [-1, 1]) {
    const x = side * (.95 + (k % 2) * .08), z = -.3 + k * .16;
    lmCyl(g, .006, .008, .05, TW.trunk, x, 0, z, 5);
    lmAdd(g, roughMass(.04, .045, .04, { seed: k * 3 + side, jitter: .2, detail: 1 }), TW.leaf, x, .08, z);
  }
  return mergeByMaterial(g);
};

// National Palace Museum: the cream palace of stepped blocks under teal glazed roofs on its terraced hillside, the long stairs and the white pailou
const PALACE_WALL = patternTexture((c, s) => {      // cream wall with tall, narrow dark-green window strips and a pale band at each floor
  c.fillStyle = '#ecdcb0'; c.fillRect(0, 0, s, s);
  c.fillStyle = '#2f5a4e';
  for (let i = 0; i < 4; i++) c.fillRect(i * s / 4 + s / 10, s * .12, s / 16, s * .7);
  c.fillStyle = '#f7efd8'; c.fillRect(0, s * .9, s, s * .05);
}, 256);
LANDMARK_BUILDERS.palaceMuseum = () => {
  const g=new THREE.Group(),wall=lmMaterial(0xe3c789,{roughness:.86}),bracket=lmMaterial(0x5e8272),red=lmMaterial(0x9b3929);
  lmBox(g,2.6,.018,2.45,TW.plaza,0,0,.47);
  lmAdd(g,roughMass(1.5,.5,.5,{seed:21,jitter:.13}),TW.leafDark,0,.05,-.88);
  // Wide, largely solid ochre exhibition wings, raised white terrace, green flat-topped roofs.
  lmBox(g,2.05,.14,.92,TW.marble,0,.02,-.14);
  referenceArcade(g,{y:.025,z:.326,w:.72,h:.115,n:1,material:TW.marble});
  const pavilion=(x,z,w,d,height,roofHeight=.095)=>{
    lmBox(g,w,height,d,wall,x,.16,z);
    lmBox(g,w+.025,.018,d+.025,bracket,x,.16+height,z);
    for(let k=0;k<Math.round(w/.055);k++) lmBox(g,.014,.018,.018,TW.marble,x-w*.47+k*.055,.16+height-.01,z+d*.5+.008);
    blindRoof(g,{x,y:.178+height,z,w:w*1.10,d:d*1.14,h:roofHeight});
  };
  pavilion(0,-.25,.72,.5,.34,.12);
  // An open upper pavilion with a horizontal flat roof, not a pagoda-shaped double crown.
  lmBox(g,.54,.10,.33,TW.marble,0,.62,-.25);
  for(let i=0;i<7;i++) lmBox(g,.048,.067,.006,TW.glass,-.225+i*.075,.64,-.081);
  blindRoof(g,{y:.72,z:-.25,w:.79,d:.58,h:.10});
  for(const side of [-1,1]) {
    pavilion(side*.64,-.25,.52,.48,.23,.085);
    pavilion(side*.95,-.15,.24,.32,.24,.07);
    // Red vertical doors interrupt restrained, mostly unfenestrated palace walls.
    lmBox(g,.07,.16,.006,red,side*.66,.19,-.006);
    balustrade(g,side*.15,.39,side*1.06,.39,{y:.16,h:.04,spacing:.045});
    stairFlight(g,{x:side*.62,z:.72,y:.02,w:.38,rise:.14,run:.38,steps:18});
    lmBox(g,.025,.15,.38,TW.marble,side*.83,.02,.54);
  }
  lmBox(g,.51,.024,.34,TW.marble,0,.16,.27);
  referencePlaque(g,'國立故宮博物院',0,.335,.008,.30,.035,'#b7a46e','#e3cf9a');
  // The five-bay 天下為公 gateway on the main approach.
  const posts=[-.57,-.36,-.13,.13,.36,.57],pz=1.42;
  for(const x of posts)lmBox(g,.032,Math.abs(x)<.2?.36:.29,.035,TW.marble,x,.02,pz);
  for(let i=0;i<5;i++) {
    const w=posts[i+1]-posts[i],x=(posts[i+1]+posts[i])/2,y=i===2?.34:.27;
    lmBox(g,w,.035,.038,TW.marble,x,y,pz);
    blindRoof(g,{x,y:y+.035,z:pz,w:w*1.1,d:.10,h:.042});
  }
  referencePlaque(g,'天下為公',0,.305,pz+.023,.20,.034,'#244b46','#e4e1d4');
  for(const side of [-1,1]) {
    lmCyl(g,.018,.023,.3,TW.marble,side*.70,.02,1.13,12);
    lmAdd(g,new THREE.SphereGeometry(.027,10,8),TW.marble,side*.70,.34,1.13);
    for(let k=0;k<6;k++)lmAdd(g,new THREE.ConeGeometry(.045,.23,10),TW.leafDark,side*(.38+k*.12),.13,.94+(k%2)*.07);
  }
  lmBox(g,.36,.006,1.0,TW.marble,0,.018,1.03);
  const result=mergeByMaterial(g);result.userData.flatRoof=true;return result;
};

// Sun Moon Lake: the round "sun" basin and crescent "moon" arm round Lalu island, forested ridges dotted with trees,
// the nine-storey octagonal Ci'en Pagoda on its hilltop, the red-and-gold Wenwu Temple climbing the north shore, piers and boats
function octagonPagoda(g, { x, z, y, r = .05, levels = 9, wall = TW.cream, roof = TW.orangeTile }) {
  let yy = y, rr = r;
  lmAdd(g, octagonPrism(r * 1.5, r * .5), TW.marble, x, yy + r * .25, z);
  yy += r * .5;
  for (let i = 0; i < levels; i++) {
    const h = r * (i === 0 ? 1.4 : 1.05);
    lmAdd(g, octagonPrism(rr, h), wall, x, yy + h / 2, z);
    lmAdd(g, octagonPrism(rr * 1.02, h * .12), TW.red, x, yy + h * .55, z);    // the band of windows on each storey
    yy += h;
    lmAdd(g, octagonRoof(rr * 1.6, rr * .9, rr * .55), roof, x, yy - rr * .08, z);
    yy += rr * .45;
    rr *= .93;
  }
  lmCyl(g, rr * .15, rr * .3, rr * 2.2, TW.gold, x, yy, z, 8);
  lmAdd(g, new THREE.SphereGeometry(rr * .3, 10, 8), TW.gold, x, yy + rr * .6, z);
  return yy + rr * 2.2;
}
LANDMARK_BUILDERS.lake = (o = {}) => {
  const g = new THREE.Group();
  const R = o.radius ?? .6;
  let seed = 11;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  // the lake outline: a broad round basin to the north-east and a crescent arm curling south-west
  const outline = new THREE.Shape();
  for (let i = 0; i <= 48; i++) {
    const a = i / 48 * Math.PI * 2;
    const lobe = 1 + .22 * Math.cos(a - .8) + .1 * Math.sin(3 * a) + .06 * Math.cos(5 * a + 1);
    const px = Math.cos(a) * R * lobe, pz = Math.sin(a) * R * .8 * lobe;
    i ? outline.lineTo(px, pz) : outline.moveTo(px, pz);
  }
  lmAdd(g, new THREE.ShapeGeometry(outline, 24).rotateX(-Math.PI / 2), TW.water, 0, .012, 0);
  lmAdd(g, new THREE.ShapeGeometry(outline, 24).rotateX(-Math.PI / 2), lmMaterial(0xc9b98a, { roughness: 1 }), 0, .007, 0).scale.set(1.05, 1, 1.05);   // a pale shore line
    // Lalu island: a small wooded mound with a white pavilion and a ring of floating gardens
  const ix = R * .12, iz = R * .18;
  lmAdd(g, roughMass(R * .09, .03, R * .07, { seed: 4, jitter: .2, detail: 1 }), TW.leaf, ix, .015, iz);
  for(let i=0;i<7;i++) {
    const a=i*2.39996;
    lmAdd(g,roughMass(R*.03,.025,R*.025,{seed:91+i,jitter:.17,detail:1}),TW.leafDark,ix+Math.cos(a)*R*.05,.035,iz+Math.sin(a)*R*.04);
  }
  for(let i=0;i<18;i++) {
    const a=i/18*Math.PI*2;
    lmBox(g,R*.045,.005,R*.015,TW.timber,ix+Math.cos(a)*R*.13,.013,iz+Math.sin(a)*R*.105,-a+Math.PI/2);
  }
  // the basin: one smooth heightfield rising from the shore into forested ridges and bluer mountains behind
  // (vertex colours shade it from green slopes to blue-green peaks), dotted with clumps of trees
  const lobeAt = (a) => 1 + .22 * Math.cos(a - .8) + .1 * Math.sin(3 * a) + .06 * Math.cos(5 * a + 1);
  const basinHeight = (x, z) => {
    const a = Math.atan2(-z / .8, x), shore = R * lobeAt(a), d = Math.hypot(x, z / .8) - shore;   // the lake shape is laid flat with rotateX(-90°), which maps its y to -z
    if (d <= 0) return 0;
    const ridge = .06 * THREE.MathUtils.smoothstep(d, 0, R * .5) + .16 * THREE.MathUtils.smoothstep(d, R * .5, R * 1.3);
    return ridge * (1 + .35 * Math.sin(a * 5 + 1) + .2 * Math.sin(a * 11)) + .015 * Math.sin(x * 23) * Math.cos(z * 19);
  };
  const basin = new THREE.PlaneGeometry(R * 5, R * 4.4, 64, 56).rotateX(-Math.PI / 2);
  const bp = basin.attributes.position, colours = [];
  const low = new THREE.Color(0x4f8a46), high = new THREE.Color(0x3d6a5c), colour = new THREE.Color();
  for (let i = 0; i < bp.count; i++) {
    const h = basinHeight(bp.getX(i), bp.getZ(i)); bp.setY(i, h);
    colour.copy(low).lerp(high, THREE.MathUtils.clamp(h / .3, 0, 1)); colours.push(colour.r, colour.g, colour.b);
  }
  basin.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  basin.computeVertexNormals();
  g.add(new THREE.Mesh(basin, lmMaterial(0xffffff, { vertexColors: true, roughness: 1 })));
  for (let k = 0; k < 140; k++) {
    const a = random() * Math.PI * 2, d = R * (1.15 + random() * 1.0), x = Math.cos(a) * d, z = Math.sin(a) * d * .8;
    if (Math.abs(x) > R * 2.4 || Math.abs(z) > R * 2.1) continue;
    lmAdd(g, roughMass(.022, .028, .022, { seed: k, jitter: .25, detail: 1 }), k % 3 ? TW.leafDark : TW.hedge, x, basinHeight(x, z) + .015, z);
  }
  // Ci'en Pagoda on the southern hilltop (the temple and pagoda are drawn at the default lake size and scaled with it)
  const k = R / .6, site = (x, z, factor = 1) => { const s = new THREE.Group(); s.position.set(x, basinHeight(x, z) - .005, z); s.scale.setScalar(k * factor); g.add(s); return s; };
  const ps = site(R * .5, R * 1.5, .5);
  octagonPagoda(ps, { x: 0, z: 0, y: 0, r: .03, levels: 9, wall: TW.cream, roof: TW.redTile });
  // Wenwu Temple on the north shore: three halls stepping up the slope, red walls under yellow-orange roofs, the big gate and a pair of red pillars
  const ts = site(R * .65, -R * 1.05, .55), tx = 0, tz = 0;
  lmAdd(ts, roughMass(.3, .06, .2, { seed: 12, jitter: .15, detail: 1 }), TW.leaf, 0, 0, -.08);
  lmBox(ts, .34, .06, .26, TW.marble, tx, 0, tz);
  for (let j = 0; j < 3; j++) {
    const y = .06 + j * .045, z = tz + .1 - j * .1, w = .36 - k * .04;
    lmBox(ts, w, .05, .08, TW.red, tx, y, z);
    sweptRoof(ts, { x: tx, y: y + .05, z, w, d: .1, h: .04, material: TW.yellowTile, ridge: TW.gold, ridgeLength: .7 });
  }
  lmBox(ts, .16, .07, .03, TW.red, tx, .06, tz + .2);
  sweptRoof(ts, { x: tx, y: .13, z: tz + .2, w: .17, d: .05, h: .03, material: TW.yellowTile, ridge: TW.gold });
  for (const side of [-1, 1]) lmCyl(ts, .008, .008, .14, TW.red, tx + side * .12, .0, tz + .3, 8);
  // piers and white ferries crossing between them
  const pierAt = (x, z, yaw) => { lmBox(g, .14, .008, .025, TW.timber, x, .012, z, yaw); lmBox(g, .04, .025, .03, TW.white, x - .05, .012, z, yaw); };
  pierAt(-R * .55, R * .5, .4); pierAt(R * .7, -R * .2, 1.2); pierAt(R * .1, R * .62, 0);
  const hull = lmMaterial(0xf6f7f8), stripe = lmMaterial(0x2b4c88);
  for (const [x, z, yaw] of [[-R * .3, R * .3, .4], [R * .25, -R * .1, 1.6], [R * .45, R * .35, 2.4], [-R * .2, -R * .4, 3.2]]) {
    lmBox(g, .06, .012, .024, stripe, x, .012, z, yaw);
    lmBox(g, .05, .014, .022, hull, x, .024, z, yaw);
    lmBox(g, .028, .012, .018, LM.glass, x, .038, z, yaw);
  }
  return mergeByMaterial(g);
};

// Alishan: a misty mountainside of towering red cypress, the giant Sacred Tree, the little red Forest Railway train
// winding past the wooden station, cherry trees in bloom and the sea of clouds below
function cypressAt(g, x, z, h, seed, { y = groundAt(g, x, z), crown = TW.leafDark } = {}) {
  lmCyl(g, h * .025, h * .04, h * .7, TW.trunk, x, y, z, 7);
  for (let i = 0; i < 4; i++) {
    const r = h * (.16 - i * .03), cy = y + h * (.38 + i * .15);
    lmAdd(g, roughMass(r, h * .11, r, { seed: seed + i, jitter: .22, detail: 1 }), i % 2 ? crown : TW.leaf, x, cy, z);
  }
  lmAdd(g, new THREE.ConeGeometry(h * .05, h * .14, 7), crown, x, y + h * .95, z);
}
LANDMARK_BUILDERS.alishan = () => {
  const g = new THREE.Group();
  let seed = 5;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  // the mountainside rising to the back, with a ridge line behind
  const heightAt = (x, z) => Math.max(0, (-z + .5) * .28) + .05 * Math.sin(x * 4 + z * 3) + .03 * Math.cos(x * 9);   // the slope surface, used for placing everything on it
  const slope = new THREE.PlaneGeometry(2.4, 1.8, 24, 18).rotateX(-Math.PI / 2);
  const position = slope.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), z = position.getZ(i);
    position.setY(i, heightAt(x, z));
  }
  slope.computeVertexNormals();
  lmAdd(g, slope, lmMaterial(0x4f8a46, { roughness: 1 }), 0, 0, 0);
  for (let i = 0; i < 6; i++) lmAdd(g, roughMass(.45, .3 + random() * .15, .3, { seed: 60 + i, jitter: .15 }), lmMaterial(0x3f6c55, { roughness: 1 }), -1.1 + i * .45, .3, -1.05);
  // the sea of clouds spilling over the low ground in front
  const cloud = lmMaterial(0xf4f6f8, { roughness: 1, transparent: true, opacity: .9 });
  for (let i = 0; i < 26; i++) {   // the sea of clouds: soft billows piled along the foot of the mountain
    const x = -1.25 + random() * 2.5, z = .85 + random() * .25;
    lmAdd(g, new THREE.SphereGeometry(.12 + random() * .1, 16, 10), cloud, x, .0, z).scale.set(1.3, .3 + random() * .15, .8);
  }
  // the forest of red cypress, densest up the slope
  for (let i = 0; i < 46; i++) {
    const x = -1.1 + random() * 2.2, z = -.85 + random() * 1.3;
    if (Math.abs(z - .12 - Math.sin(x * 2) * .12) < .18) continue;          // keep the railway clear
    if (Math.hypot(x + .35, z + .2) < .22 || Math.hypot(x - .55, z - .05) < .25) continue;
    if (x > -.5 && x < .45 && z > .05) continue;                               // keep the view of the train open from the front
    cypressAt(g, x, z, .3 + random() * .25, 300 + i, { y: heightAt(x, z) });
  }
  // The original Sacred Tree is a fallen relic; nearby living cypresses retain tall crowns.
  const sx=-.35,sz=-.2,sy=heightAt(sx,sz),bark=lmMaterial(0x70533f,{map:TEXTURES.wood,roughness:1});
  lmAdd(g,new THREE.CylinderGeometry(.055,.09,.53,18).rotateZ(Math.PI/2),bark,sx,sy+.055,sz);
  lmAdd(g,new THREE.CylinderGeometry(.055,.055,.004,18).rotateZ(Math.PI/2),lmMaterial(0x9f8060,{roughness:1}),sx-.266,sy+.055,sz);
  for(let k=0;k<16;k++)lmBox(g,.04,.007,.025,TW.timber,sx-.31+k*.041,sy+.008,sz+.13);
  // the railway curving across the slope, and the red diesel train with its cream stripe
  const railMaterial=lmMaterial(0x55575a,{metalness:.5,roughness:.4});
  const trackY = (x) => heightAt(x, .12 + Math.sin(x * 2) * .12);
  for (let k = 0; k < 40; k++) {
    const x = -1.1 + k * .056, z = .12 + Math.sin(x * 2) * .12, yaw = -Math.atan(Math.cos(x * 2) * .24);
    lmBox(g, .016, .006, .07, TW.timber, x, trackY(x), z, yaw);
    for (const side of [-1, 1]) lmBox(g, .06, .006, .004, railMaterial, x, trackY(x) + .006, z + side * .022, yaw);
  }
  const red = lmMaterial(0xc22a1e), cream = lmMaterial(0xf0e2c0), wheels=lmMaterial(0x343738,{metalness:.3,roughness:.7});
  for (let car = 0; car < 4; car++) {
    const x = -.25 + car * .16, z = .12 + Math.sin(x * 2) * .12, y = trackY(x) + .012, yaw = -Math.atan(Math.cos(x * 2) * .24);
    lmBox(g, .14, .065, .07, red, x, y, z, yaw);
    const carriage=new THREE.Group();carriage.position.set(x,y,z);carriage.rotation.y=yaw;g.add(carriage);
    lmBox(carriage,.13,.012,.06,wheels,0,-.006,0);
    for(const axle of [-.046,.046])for(const side of [-1,1])lmAdd(carriage,new THREE.CylinderGeometry(.01,.01,.006,10).rotateX(Math.PI/2),wheels,axle,0,side*.032);
    for(let window=0;window<4;window++)for(const side of [-1,1])lmBox(carriage,.019,.021,.004,TW.glass,-.045+window*.03,.032,side*.036);
    lmBox(g, .132, .012, .062, cream, x, y + .03, z, yaw);
    lmBox(g, .12, .012, .063, LM.glass, x, y + .04, z, yaw);
    lmBox(g, .135, .008, .065, lmMaterial(0x3a3c40), x, y + .055, z, yaw);
  }
  // Alishan station: a dark-timber hall with a grey roof and a platform canopy
  const stx = .55, stz = -.04, sty = heightAt(stx, stz);
  lmBox(g, .3, .015, .14, TW.marble, stx, sty, stz - .06);
  lmBox(g, .22, .09, .1, lmMaterial(0xc9a173, { map: TEXTURES.wood }), stx, sty + .015, stz - .08);
  sweptRoof(g, { x: stx, y: sty + .105, z: stz - .08, w: .24, d: .12, h: .05, material: TW.greyTile, ridgeRise: .05 });
  // cherry trees in bloom along the line
  const blossom = lmMaterial(0xf6bcd0, { roughness: .9 });
  for (let k = 0; k < 9; k++) {
    const x = -.9 + k * .22, z = .36 + Math.sin(x * 2) * .1 + (k % 2) * .05, y = heightAt(x, z);
    lmCyl(g, .006, .01, .07, TW.trunk, x, y, z, 6);
    lmAdd(g, roughMass(.05, .04, .05, { seed: 40 + k, jitter: .3, detail: 1 }), blossom, x, y + .09, z);
  }
  return mergeByMaterial(g);
};

// Chihkan Tower: two Qing-dynasty pavilions — Wenchang Pavilion and Haishen Temple — side by side on the old Dutch brick
// foundation, red walls and pillars, double swept roofs with swallowtail ridges, the nine stone turtles with steles, palms and the lotus pond
LANDMARK_BUILDERS.chihkan = () => {
  const g = new THREE.Group();
  const lattice = lmMaterial(0xffffff, { map: patternTexture((c, s) => {   // red wooden lattice doors and windows
    c.fillStyle = '#a3291b'; c.fillRect(0, 0, s, s);
    c.fillStyle = '#5c160e';
    for (let i = 0; i < 8; i++) { c.fillRect(i * s / 8, 0, 2, s); c.fillRect(0, i * s / 8, s, 2); }
  }) });
  lmBox(g, 2.0, .01, 1.7, TW.plaza, 0, 0, .1);
  // the brick podium of Fort Provintia with arched openings, and a stair up the front
  lmBox(g, 1.5, .16, 1.22, TW.oldBrick, 0, 0, -.12);
  for (let k = 0; k < 6; k++) archBay(g, -.6 + k * .24, 0, .2 + .002, .08, .12, lmMaterial(0x3a2a22));
  stairFlight(g, { z: .66, w: .3, rise: .16, run: .18, steps: 9, material: TW.marble });
  balustrade(g, -.75, .2, -.16, .2, { y: .16, h: .035, material: TW.marble });
  balustrade(g, .16, .2, .75, .2, { y: .16, h: .035, material: TW.marble });
  // the two pavilions on the podium
  const pavilion = (x, z) => {
    const building=new THREE.Group(); building.position.z=z+.2; g.add(building);

    const y = .16, w = .5, d = .42;
    lmBox(building, w + .08, .03, d + .08, TW.marble, x, y, -.2);
    lmBox(building, w, .2, d, TW.red, x, y + .03, -.2);
    lmBox(building, w * .7, .16, .005, lattice, x, y + .04, -.2 + d / 2 + .003);
    colonnade(building, { x0: x - w / 2 - .02, x1: x + w / 2 + .02, z: -.2 + d / 2 + .04, y: y + .03, h: .2, r: .012, n: 6 });
    let top = sweptRoof(building, { x, y: y + .23, z: -.2, w: w + .12, d: d + .14, h: .09, material: TW.redTile, ridge: TW.greyTile, ridgeRise: .9 });
    lmBox(building, w * .72, .13, d * .62, TW.red, x, top - .04, -.2);
    lmBox(building, w * .5, .09, .005, lattice, x, top - .02, -.2 + d * .31 + .003);
    balustrade(building, x - w * .4, -.2 + d * .38, x + w * .4, -.2 + d * .38, { y: top - .045, h: .025, material: TW.tealTile });
    top = sweptRoof(building, { x, y: top + .09, z: -.2, w: w * .85, d: d * .75, h: .1, material: TW.redTile, ridge: TW.greyTile, ridgeRise: 1.1, ridgeLength: .6 });
    lmAdd(building, new THREE.SphereGeometry(.018, 10, 8), TW.gold, x, top + .025, -.2);   // the gourd finial
  };
  pavilion(-.22,-.48); pavilion(.22,.26);
  referencePlaque(g,'赤崁樓',.22,.38,.50,.17,.04,'#c5ac62','#3d241d');
  // the nine stone turtles bearing steles, under a little roofed shelter
  const stone = lmMaterial(0x9a9890);
  lmBox(g, 1.5, .02, .2, TW.marble, 0, 0, .78);
  // the nine bixi: stone turtles with domed, plated shells, heads raised forward and stubby feet, each carrying an
  // upright stele with a rounded, dragon-carved top on its back
  const shellTexture = patternTexture((c, size) => { c.fillStyle = '#9c9a92'; c.fillRect(0, 0, size, size); c.strokeStyle = '#5e5c56'; c.lineWidth = 3;
    for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) { c.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; c.lineTo((col + .5 + (row % 2) * .5) * size / 4 + Math.cos(a) * size / 9, (row + .5) * size / 4 + Math.sin(a) * size / 9); } c.closePath(); c.stroke(); } });
  const shell = lmMaterial(0xffffff, { map: shellTexture, roughness: .9 });
  for (let k = 0; k < 9; k++) {
    const x = -.64 + k * .16, z = .78;
    lmBox(g, .1, .02, .14, TW.marble, x, .02, z);
    lmAdd(g, new THREE.SphereGeometry(.055, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), shell, x, .04, z).scale.set(1, .6, 1.25);
    lmAdd(g, new THREE.CapsuleGeometry(.014, .03, 4, 8).rotateX(Math.PI / 2 - .5), stone, x, .055, z + .07);      // neck and head reaching forward
    lmAdd(g, new THREE.SphereGeometry(.016, 10, 8), stone, x, .068, z + .09).scale.set(1, .85, 1.2);
    for (const [dx, dz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) lmAdd(g, new THREE.SphereGeometry(.014, 8, 6), stone, x + dx * .04, .045, z + dz * .045).scale.set(1, .7, 1.3);
    lmBox(g, .05, .012, .03, stone, x, .065, z - .005);                                                         // the stele's socket
    lmBox(g, .045, .09, .012, stone, x, .077, z - .005);
    lmAdd(g, new THREE.CylinderGeometry(.026, .026, .014, 14, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2), stone, x, .167, z - .005);
  }
  for (const x of [-.75, .75]) lmCyl(g, .01, .01, .2, TW.red, x, 0, .9, 8);
  // the lotus pond and palms
  lmBox(g, .6, .006, .3, TW.water, -.6, .005, 1.1);
  for (let k = 0; k < 8; k++) lmCyl(g, .022, .022, .004, TW.leaf, -.85 + k * .07, .012, 1.02 + (k % 3) * .07, 8);
  for (const [x, z] of [[.85, .55], [-.9, .6], [.9, -.6], [-.9, -.65]]) palmAt(g, x, z, .45, .01);
  return mergeByMaterial(g);
};

// Anping Old Fort: the stepped red-brick terraces of Fort Zeelandia, the white Japanese-era hall with its colonnade,
// the white lookout tower with a red dome-capped top, cannons on the ramparts and a banyan over the old brick wall
LANDMARK_BUILDERS.anping = () => {
  const g = new THREE.Group();
  lmBox(g, 2.2, .01, 2.0, TW.plaza, 0, 0, 0);
  // two stepped brick terraces with crenellated parapets
  for (const [w, d, y, h] of [[1.6, 1.3, 0, .14], [1.2, .95, .14, .12]]) {
    lmBox(g, w, h, d, TW.brick, 0, y, -.1);
  }
  stairFlight(g, { z: .56, w: .22, rise: .14, run: .14, steps: 8, material: TW.brick });
  stairFlight(g, { z: .38, y: .14, w: .2, rise: .12, run: .1, steps: 7, material: TW.brick });
  // the white hall on the top terrace: an arcaded veranda under a dark grey tiled hip roof
  const hy = .26;
  lmBox(g, .7, .2, .4, TW.white, -.1, hy, -.2);
  for (let k = 0; k < 7; k++) archBay(g, -.4 + k * .1, hy, .0 + .002, .06, .14, lmMaterial(0x3a3a38));
  lmBox(g, .72, .02, .42, TW.white, -.1, hy + .2, -.2);
  lmHip(g, .2, .42, .1, TW.blackTile, -.1, hy + .22, -.2, .62);
  // the lookout tower: a white octagonal tower with railings, topped by a red cupola and a flagpole
  const tx = .38, tz = -.25;
  lmBox(g,.13,.40,.13,TW.white,tx,hy,tz);
  for(const y of [hy+.07,hy+.20])lmBox(g,.025,.06,.004,TW.glass,tx,y,tz+.067);
  lmAdd(g,squareFrustum(.115,.067,.07),TW.white,tx,hy+.435,tz);
  lmAdd(g,squareFrustum(.115,.085,.08),TW.glass,tx,hy+.50,tz);
  for(const side of [-1,1])for(const other of [-1,1])lmAdd(g,strutGeometry(new THREE.Vector3(tx+side*.085,hy+.46,tz+other*.085),new THREE.Vector3(tx+side*.115,hy+.54,tz+other*.115),.006),TW.white);
  lmAdd(g,squareFrustum(0,.155,.15),TW.redTile,tx,hy+.615,tz);
  referencePlaque(g,'安平古堡',-.1,.14,.565,.27,.055,'#ede7d2','#874d35');
    // cannons on the lower rampart
  const iron = lmMaterial(0x2c2d30, { metalness: .5, roughness: .45 });
  for (const x of [-.6, -.35, .35, .6]) {
    lmBox(g, .06, .03, .08, TW.timber, x, .14, .45);
    lmAdd(g, new THREE.CylinderGeometry(.014, .02, .14, 10).rotateX(Math.PI / 2 - .15), iron, x, .19, .5);
  }
  // the old Dutch brick wall to the side, half swallowed by a banyan
  for (let k = 0; k < 6; k++) lmAdd(g, jaggedSlab(.12, .2 + (k % 3) * .05, .16, 60 + k, .12), TW.oldBrick, -.95, .1, -.6 + k * .17);
  for (let k = 0; k < 7; k++) lmCyl(g, .01, .018, .26, TW.trunk, -.9, 0, -.55 + k * .15, 5).rotation.z = .35 * (k % 2 ? 1 : -1);
  lmAdd(g, roughMass(.28, .16, .4, { seed: 14, jitter: .25 }), TW.leaf, -.92, .34, -.15);
  for (const [x, z] of [[.85, .7], [.95, -.6], [-.6, .8]]) { lmCyl(g, .015, .02, .14, TW.trunk, x, 0, z, 6); lmAdd(g, roughMass(.12, .09, .12, { seed: x * 9, jitter: .25, detail: 1 }), TW.leaf, x, .2, z); }
  return mergeByMaterial(g);
};

// Fort San Domingo: the squat red keep with its crenellated white-trimmed parapet and arched windows, beside the
// red-brick British consular residence with two storeys of arched verandas, all on a lawn with the row of flags
LANDMARK_BUILDERS.hongmaocheng = () => {
  const g = new THREE.Group();
  const red = lmMaterial(0xb2402c, { map: TEXTURES.brick }), trim = lmMaterial(0xf3efe6), dark = lmMaterial(0x2a2422);
  lmBox(g, 2.4, .012, 1.8, TW.lawn, 0, 0, 0);
  lmBox(g, .3, .014, 1.0, TW.plaza, .1, 0, .45);
  // the fort: a near-cubic red keep, the lower storey with a thick battered base
  const fx = .65, fz = -.2, fw = .58;
  lmAdd(g, squareFrustum(fw / 2, fw / 2 + .04, .12), red, fx, .06, fz);
  lmBox(g, fw, .36, fw, red, fx, .12, fz);
  lmBox(g, fw + .03, .025, fw + .03, red, fx, .48, fz);
  for(const side of [-1,1]) {
    lmBox(g,fw,.025,.02,red,fx,.505,fz+side*fw*.48);
    lmBox(g,.02,.025,fw,red,fx+side*fw*.48,.505,fz);
  }
  lmBox(g,.11,.08,.11,red,fx+.16,.505,fz-.15);
  for (const level of [.16, .32]) for (const t of [-.14, 0, .14]) {
    archBay(g, fx + t, level, fz + fw / 2 + .002, .07, .11, trim);
    archBay(g, fx + t, level + .01, fz + fw / 2 + .004, .05, .085, dark);
  }
  // the consulate: red brick, arched verandas on both storeys with white balustrades, a hipped grey roof and chimneys
  const cx = -.4, cz = -.15, cw = .9, cd = .45;
  lmBox(g, cw, .36, cd*.62, red, cx, 0, cz-cd*.19);
  for (const level of [0, .18]) {
    referenceArcade(g,{x:cx,y:level,z:cz+cd/2,w:cw,h:.17,n:8,material:red});
    lmBox(g, cw + .01, .015, .02, trim, cx, level + .165, cz + cd / 2 + .005);
    if (level) balustrade(g, cx - cw / 2, cz + cd / 2 + .02, cx + cw / 2, cz + cd / 2 + .02, { y: level, h: .04, material: trim, spacing: .025 });
  }
  lmBox(g, cw + .04, .02, cd + .04, trim, cx, .36, cz);
  lmHip(g, .25, .52, .12, TW.redTile, cx, .38, cz, cd / cw * 1.1);
  for (const x of [cx - .3, cx + .3]) lmBox(g, .05, .1, .05, red, x, .44, cz);
  // the low arcaded wing behind
  lmBox(g, .5, .16, .3, red, cx - .1, 0, cz - .45);
  lmHip(g, .1, .3, .07, TW.redTile, cx - .1, .16, cz - .45, .6);
  referencePlaque(g,'紅毛城',fx,.27,fz+fw/2+.008,.15,.028,'#d6bd80','#7c3228');
  // the flags of the nations that held the fort, the gateway and palms
  const flagColours = [0xc8102e, 0x003893, 0xff7f00, 0xffffff, 0x00843d, 0xd52b1e, 0x012169, 0xfcd116];
  flagColours.forEach((colour, k) => {
    const x = -.4 + k * .12, z = .7;
    lmCyl(g, .004, .004, .3, TW.white, x, 0, z, 5);
    lmBox(g, .07, .045, .004, lmMaterial(colour), x + .037, .25, z);
  });
  lmBox(g, .2, .16, .06, red, .1, 0, .95);
  archBay(g, .1, 0, .95 + .031, .1, .13, dark);
  for (const [x, z] of [[-1.0, .5], [1.05, .5], [-1.0, -.6], [1.1, -.7]]) palmAt(g, x, z, .4, .01);
  return mergeByMaterial(g);
};

// Fo Guang Shan Buddha Museum: the great bronze-gold seated Buddha behind the Main Hall with its four white stupas,
// the eight seven-storey pagodas lining the avenue to the Front Hall, lawns and hedges
LANDMARK_BUILDERS.foguangshan = () => {
  const g = new THREE.Group();
  const gold = lmMaterial(0xc99a3a, { metalness: .45, roughness: .35, emissive: 0x3a2600, emissiveIntensity: .35 }), robe = lmMaterial(0xb8862e, { metalness: .4, roughness: .4, emissive: 0x2e1e00, emissiveIntensity: .3 });
  const stupa = lmMaterial(0xf0ead8), terracotta = lmMaterial(0xc4643a, { map: TEXTURES.tiles });
  const pagodaWall=lmMaterial(0xece2c8),mainStone=lmMaterial(0xc8bca2);
  lmBox(g, 1.6, .01, 3.0, TW.lawn, 0, 0, .3);
  lmBox(g, .32, .014, 2.4, TW.plaza, 0, 0, .55);
  // the Main Hall: a broad stepped Indian-style mass with four white stupa towers at its corners
  const hz = -.7;
  lmBox(g, 1.0, .1, .6, TW.marble, 0, 0, hz);
  lmBox(g, .8, .12, .48, lmMaterial(0xe6d8b8), 0, .1, hz);
  lmBox(g, .82, .02, .5, terracotta, 0, .22, hz);
  stairFlight(g, { z: hz + .42, w: .3, rise: .1, run: .12, steps: 7 });
  for (const [dx, dz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    const x = dx * .42, z = hz + dz * .25;
    lmCyl(g, .06, .07, .1, stupa, x, .1, z, 12);
    lmAdd(g, new THREE.SphereGeometry(.06, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), stupa, x, .2, z);
    lmAdd(g, new THREE.ConeGeometry(.02, .16, 10), stupa, x, .33, z);
    lmAdd(g, new THREE.SphereGeometry(.01, 8, 6), TW.gold, x, .42, z);
  }
  for(let tier=0;tier<5;tier++)lmBox(g,.84-tier*.13,.025,.49-tier*.065,mainStone,0,.23+tier*.025,hz);
  // the Buddha on a lotus seat, seated in meditation behind the hall
  const bz = -1.25, by = .3;
  lmBox(g, .7, .2, .55, lmMaterial(0x3b3e5a), 0, 0, bz);
  lmBox(g, .74, .02, .59, TW.gold, 0, .2, bz);
  for (let ring = 0; ring < 2; ring++) for (let k = 0; k < 18; k++) {   // the lotus throne: two rings of pointed petals curling outward
    const a = (k + ring * .5) / 18 * Math.PI * 2, r = .3 - ring * .05;
    const petal = lmAdd(g, new THREE.SphereGeometry(.05, 10, 8), robe, Math.cos(a) * r, .24 + ring * .05, bz + Math.sin(a) * r * .8);
    petal.scale.set(.7, 1.3, .35); petal.rotation.set(0, -a + Math.PI / 2, 0); petal.rotateX(-.5);
  }
  const body = new THREE.Group(); body.position.set(0, by, bz); body.scale.setScalar(1.8); g.add(body);
  // the seated figure: a lathed robe body broad at the knees and narrowing to the shoulders, crossed legs, arms falling
  // to the hands joined in the lap (dhyana mudra), a long neck fold, the head with long earlobes, curled hair and ushnisha
  const curls = patternTexture((c, size) => {   // rows of tight snail-shell curls
    c.fillStyle = '#8a6424'; c.fillRect(0, 0, size, size);
    for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
      const x = (col + (row % 2) * .5) * size / 8, y = (row + .5) * size / 8;
      c.fillStyle = '#4a3210'; c.beginPath(); c.arc(x, y, size / 22, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#b08a3a'; c.beginPath(); c.arc(x - size / 70, y - size / 70, size / 60, 0, Math.PI * 2); c.fill();
    }
  });
  curls.repeat.set(6, 3);
  const hair = lmMaterial(0xffffff, { map: curls, metalness: .4, roughness: .5 });
  lmAdd(body, new THREE.CapsuleGeometry(.07, .3, 6, 16).rotateZ(Math.PI / 2), robe, 0, .07, .04).scale.set(1, .8, 1.3);   // the folded legs
  const torso = [[.001, 0], [.2, .0], [.21, .04], [.17, .09], [.125, .16], [.11, .24], [.118, .3], [.105, .34], [.06, .37], [.03, .38], [.001, .38]];
  lmAdd(body, new THREE.LatheGeometry(torso.map(([r, y]) => new THREE.Vector2(r, y)), 24), robe, 0, .04, -.02).scale.z = .72;
  limb(body,robe,new THREE.Vector3(.115,.36,-.02),new THREE.Vector3(.14,.22,.02),.035);
  limb(body,robe,new THREE.Vector3(.14,.22,.02),new THREE.Vector3(.04,.15,.10),.03);
  lmAdd(body,new THREE.SphereGeometry(.037,16,10),gold,.035,.15,.11).scale.set(1.4,.4,.85);
  // The statue's right hand appears on the viewer's left, palm facing forward.
  limb(body,robe,new THREE.Vector3(-.115,.36,-.02),new THREE.Vector3(-.16,.25,.015),.035);
  limb(body,gold,new THREE.Vector3(-.16,.25,.015),new THREE.Vector3(-.16,.40,.075),.025);
  lmAdd(body,new THREE.SphereGeometry(.034,16,12),gold,-.16,.435,.078).scale.set(.85,1.2,.38);
  for(let finger=0;finger<4;finger++)lmAdd(body,new THREE.CapsuleGeometry(.004,.036,4,8),gold,-.183+finger*.014,.476-Math.abs(finger-1.5)*.004,.078);
  limb(body,gold,new THREE.Vector3(-.135,.42,.078),new THREE.Vector3(-.12,.447,.085),.006);
  lmCyl(body, .028, .035, .04, gold, 0, .41, -.02, 12);                                               // neck
  lmAdd(body, new THREE.SphereGeometry(.062, 20, 16), gold, 0, .5, -.015).scale.set(.88, 1.15, .95);  // face
  for (const side of [-1, 1]) lmAdd(body, new THREE.CapsuleGeometry(.008, .05, 4, 8), gold, side * .055, .48, -.02);   // long earlobes
  lmAdd(body, new THREE.SphereGeometry(.064, 20, 12, 0, Math.PI * 2, 0, Math.PI * .55), hair, 0, .51, -.022).scale.set(.9, 1.05, .97);   // curled hair
  lmAdd(body, new THREE.SphereGeometry(.035, 14, 10), hair, 0, .575, -.025);                          // ushnisha
  lmAdd(body, new THREE.SphereGeometry(.008, 8, 6), gold, 0, .515, .045);                             // urna
  // Restrained facial relief and robe folds are visible in the model inspector / close views.
  const crease=lmMaterial(0x8e6b35,{metalness:.25,roughness:.65});
  lmAdd(body,new THREE.SphereGeometry(.008,12,8),gold,0,.49,.045).scale.set(.7,1.6,1.3);
  for(const side of [-1,1]) {
    const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(side*.034,.505,.037),new THREE.Vector3(side*.023,.502,.044),new THREE.Vector3(side*.012,.504,.047)]);
    lmAdd(body,new THREE.TubeGeometry(curve,12,.0016,5,false),crease);
  }
  const mouth=new THREE.CatmullRomCurve3([new THREE.Vector3(-.013,.472,.044),new THREE.Vector3(0,.47,.049),new THREE.Vector3(.013,.472,.044)]);
  lmAdd(body,new THREE.TubeGeometry(mouth,12,.0013,5,false),crease);
  for(let fold=0;fold<7;fold++) {
    const points=[];
    for(let k=0;k<=20;k++) {const a=k/20*Math.PI;points.push(new THREE.Vector3(Math.cos(a)*(.18-fold*.011),.075+fold*.017-Math.sin(a)*.025,.045+Math.sin(a)*(.11-fold*.006)));}
    lmAdd(body,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),24,.0019,5,false),crease);
  }
  // the eight pagodas: square seven-storey towers with orange eaves along both sides of the avenue
  for (let k = 0; k < 4; k++) for (const side of [-1, 1]) {
    const x = side * .42, z = -.15 + k * .42;
    lmBox(g, .14, .04, .14, TW.marble, x, 0, z);
    let y = .04, h = .05;
    for (let level = 0; level < 7; level++) {
      lmBox(g, h * 1.5, h * .9, h * 1.5, pagodaWall, x, y, z);
      for(const side of [-1,1]) {
        lmBox(g,h*1.9,.004,.006,TW.white,x,y+h*.55,z+side*h*.9);
        lmBox(g,.006,.004,h*1.9,TW.white,x+side*h*.9,y+h*.55,z);
      }
      y += h * .9;
      lmHip(g, h * .55, h * 1.25, h * .35, TW.orangeTile, x, y, z);
      y += h * .3;
      h *= .94;
    }
    lmCyl(g, .004, .008, .06, TW.gold, x, y, z, 6);
  }
  // hedged lawns, trees and the Front Hall with its gate towers
  for (let k = 0; k < 7; k++) for (const side of [-1, 1]) lmBox(g, .06, .03, .2, TW.hedge, side * .25, 0, -.2 + k * .3);
  for (let k = 0; k < 10; k++) for (const side of [-1, 1]) { const x = side * (.62 + (k % 2) * .08), z = -.3 + k * .2; lmCyl(g, .005, .007, .05, TW.trunk, x, 0, z, 5); lmAdd(g, roughMass(.035, .04, .035, { seed: k * 2 + side, jitter: .2, detail: 1 }), TW.leaf, x, .07, z); }
  const fz = 1.65;
  lmBox(g, 1.1, .14, .22, lmMaterial(0xe6dcc4, { map: TEXTURES.windows }), 0, 0, fz);
  sweptRoof(g, { x: 0, y: .14, z: fz, w: 1.12, d: .26, h: .07, material: TW.orangeTile, ridgeLength: .75 });
  for (const side of [-1, 1]) {
    lmBox(g, .2, .26, .24, lmMaterial(0xe6dcc4), side * .6, 0, fz);
    sweptRoof(g, { x: side * .6, y: .26, z: fz, w: .22, d: .26, h: .08, material: TW.orangeTile });
  }
  return mergeByMaterial(g);
};

// Yehliu: the golden sandstone cape running into a turquoise sea, fields of mushroom rocks and candle rocks,
// and the Queen's Head itself — a graceful neck, the head in profile with a tall swept-up hairdo
// A smooth rock column lofted from horizontal elliptical slices: rows of [y, xLeft, xRight] give its side profile
// (Catmull-Rom smoothed), depth = width × depthRatio(y); vertex colours come from colourAt(y, angle, x, z).
function loftedRock(rows, { segments = 24, steps = 60, depthRatio = () => .85, colourAt, wobble = 0, seed = 1 }) {
  const left = new THREE.CatmullRomCurve3(rows.map(([y, xl]) => new THREE.Vector3(xl, y, 0)));
  const right = new THREE.CatmullRomCurve3(rows.map(([y, , xr]) => new THREE.Vector3(xr, y, 0)));
  const positions = [], colours = [], index = [], colour = new THREE.Color();
  // the body of each slice follows a smoothed outline; the true front and back edges only push out the very front and
  // back of the ring, so a nose or chin in the profile stays a feature instead of becoming a ring round the column
  const slices = [];
  for (let j = 0; j <= steps; j++) { const l = left.getPoint(j / steps), r = right.getPoint(j / steps); slices.push({ y: (l.y + r.y) / 2, xl: l.x, xr: r.x }); }
  const smooth = slices.map((_, j) => {
    let xl = 0, xr = 0, n = 0;
    for (let d = -6; d <= 6; d++) { const s2 = slices[THREE.MathUtils.clamp(j + d, 0, steps)]; xl += s2.xl; xr += s2.xr; n++; }
    return { xl: xl / n, xr: xr / n };
  });
  for (let j = 0; j <= steps; j++) {
    const { y, xl, xr } = slices[j], cx = (smooth[j].xl + smooth[j].xr) / 2, rs = Math.max((smooth[j].xr - smooth[j].xl) / 2, 1e-4);
    const front = Math.max(cx - xl, 1e-4), back = Math.max(xr - cx, 1e-4), rz = rs * depthRatio(y);
    for (let k = 0; k <= segments; k++) {
      const a = k / segments * Math.PI * 2, c = Math.cos(a), w = Math.abs(c) ** 4;
      const bump = 1 + wobble * (Math.sin(a * 3 + j * .7 + seed) * .5 + Math.sin(a * 7 - j * 1.3 + seed * 2) * .3);
      const rx = rs + ((c < 0 ? front : back) - rs) * w;
      const x = cx + c * rx * bump, z = Math.sin(a) * rz * bump;
      positions.push(x, y, z);
      colourAt(colour, y, a, x, z); colours.push(colour.r, colour.g, colour.b);
    }
  }
  for (let j = 0; j < steps; j++) for (let k = 0; k < segments; k++) {
    const p = j * (segments + 1) + k, q = p + segments + 1;
    index.push(p, p + 1, q, p + 1, q + 1, q);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(positions.length / 3 * 2), 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}
// Yehliu Geopark: a long, low cape of layered yellow sandstone reaching into the sea, the wooded headland with its
// small white lighthouse at the tip, fields of mushroom rocks with dark iron-crusted caps, candle rocks, tide pools —
// and the Queen's Head: a slender pale neck lifting an elegant head in profile with its swept-up hairdo
LANDMARK_BUILDERS.queenhead = () => {
  const g = new THREE.Group();
  let seed = 9;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pitting=TEXTURES.pits.clone(); pitting.repeat.set(12,12);
  const rockMaterial = lmMaterial(0xffffff, { vertexColors: true, bumpMap: pitting, bumpScale: .0007, roughness: .98 });
  const pale = new THREE.Color(0xe2c58c), ochre = new THREE.Color(0xc99a52), crust = new THREE.Color(0x7d5636), dark = new THREE.Color(0x5e4029);
  const strata = (y) => 1 + .07 * Math.sin(y * 160) + .04 * Math.sin(y * 410);   // fine horizontal bedding lines
  const noise = (x, y, z) => Math.sin(x * 91 + y * 57) * Math.cos(z * 83 - y * 37) * .5 + .5;
  // the cape: a heightfield peninsula pointing +x — a rippled rock shelf that slopes into the sea at its edges,
  // rising to the wooded headland near the tip
  const halfWidth = (x) => .42 + .12 * Math.sin(x * 2.3 + .5) - Math.max(0, x - .9) * .25;
  const L = .7;                                                                  // length scale of the cape along x
  const shelfAt = (x0, z) => {
    const x = x0 / L;
    const edge = halfWidth(x) - Math.abs(z), end = 1.35 - x, inside = Math.min(edge, end, x + 1.4);
    if (inside < 0) return Math.max(-.3, inside * 1.5);
    const ripple = .006 * Math.sin(x * 40 + z * 13) + .004 * Math.sin(z * 55 - x * 9);
    const hill = .42 * Math.exp(-((x - .95) ** 2 / .07 + (z - .02) ** 2 / .05));
    return Math.min(inside * .35, .05) + ripple + hill;
  };
  const shelf = new THREE.PlaneGeometry(3.0 * L, 1.5, 100, 60).rotateX(-Math.PI / 2);
  const sp = shelf.attributes.position, shelfColours = [], colour = new THREE.Color();
  const grass = new THREE.Color(0x4f8040), grassDark = new THREE.Color(0x355f30), wet = new THREE.Color(0x6a5638);
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i), z = sp.getZ(i), y = shelfAt(x, z);
    sp.setY(i, y);
    if (y > .09) colour.copy(grass).lerp(grassDark, noise(x, y, z));                        // the wooded headland
    else if (y < .012) colour.copy(wet).lerp(ochre, THREE.MathUtils.clamp((y + .05) / .06, 0, 1));   // wet, dark rock at the waterline
    else colour.copy(ochre).lerp(pale, noise(x * 2, 0, z * 2) * .6).multiplyScalar(strata(x * .2 + z * .1));
    shelfColours.push(colour.r, colour.g, colour.b);
  }
  shelf.setAttribute('color', new THREE.Float32BufferAttribute(shelfColours, 3));
  shelf.computeVertexNormals();
  g.add(new THREE.Mesh(shelf, rockMaterial));
  // trees on the headland and the little white lighthouse at the tip
  for (let k = 0; k < 40; k++) {
    const x = (.75 + random() * .45) * L, z = (random() - .5) * .5, y = shelfAt(x, z);
    if (y < .12) continue;
    lmAdd(g, roughMass(.04, .035, .04, { seed: 900 + k, jitter: .3, detail: 1 }), k % 2 ? TW.leafDark : TW.leaf, x, y + .02, z);
  }
  const lx = 1.08 * L, lz = .05, ly = shelfAt(lx, lz);
  lmCyl(g, .022, .028, .1, TW.white, lx, ly - .01, lz, 14);
  lmCyl(g, .032, .032, .008, lmMaterial(0x1b1f22), lx, ly + .09, lz, 14);
  lmCyl(g, .017, .017, .03, lmMaterial(0xfff1bd, { emissive: 0xffcf5b, emissiveIntensity: .4 }), lx, ly + .098, lz, 12);
  lmAdd(g, new THREE.SphereGeometry(.02, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), lmMaterial(0xb8321f), lx, ly + .128, lz);
  // rock colouring for the columns: pale banded sandstone below, a dark iron-rich crust on the caps and the head
  const rockColour = (crustFrom, crustTo) => (c, y, a, x, z) => {
    const t = THREE.MathUtils.smoothstep(y, crustFrom, crustTo);
    c.copy(pale).lerp(ochre, .35 + .3 * noise(x * 3, y * 2, z * 3)).lerp(crust, t).lerp(dark, t * .35 * noise(x * 9, y * 9, z * 9));
    c.multiplyScalar(t > .5 ? .92 + .16 * noise(x * 40, y * 40, z * 40) : strata(y));
  };
  // the Queen's Head, face toward -x; the table gives [height, front edge, back edge] up the neck and head
  const queenRows = [[0, -.11, .11], [.03, -.06, .065], [.09, -.033, .035], [.17, -.022, .026], [.232, -.02, .027], [.258, -.026, .04],
    [.275, -.05, .055], [.29, -.078, .066], [.302, -.08, .074], [.314, -.07, .082], [.324, -.082, .088], [.334, -.084, .094], [.344, -.1, .1],
    [.356, -.082, .108], [.372, -.074, .118], [.392, -.068, .13], [.415, -.058, .142], [.44, -.044, .155], [.465, -.026, .166], [.485, -.006, .172],
    [.502, .02, .172], [.516, .05, .164], [.527, .08, .15], [.534, .105, .132], [.538, .12, .118]];
  const queen = lmAdd(g, loftedRock(queenRows, { segments: 28, steps: 110, depthRatio: (y) => y > .26 ? .62 : 1, colourAt: rockColour(.245, .29), wobble: .012, seed: 3 }), rockMaterial, -.15 * L, .03, .1);
  queen.rotation.y = .6;
  // a red line and stanchions keeping visitors back, and a few visitors for scale
  for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; lmCyl(g, .002, .002, .025, lmMaterial(0xb8321f), -.15 * L + Math.cos(a) * .14, .04, .1 + Math.sin(a) * .14, 4); }
  const clothes = [0xd94040, 0x3a6fb8, 0xf2f2f2, 0xe8b830, 0x2f2f33, 0x4a9a5a];
  for (let k = 0; k < 9; k++) {
    const x = -.45 + k * .05 + random() * .02, z = .3 + Math.sin(k) * .03, y = shelfAt(x, z);
    lmCyl(g, .006, .007, .024, lmMaterial(clothes[k % clothes.length]), x, y, z, 6);
    lmAdd(g, new THREE.SphereGeometry(.005, 6, 5), lmMaterial(0x3a2a20), x, y + .029, z);
  }
  // the mushroom rocks: short pale necks under broad, lumpy dark caps, scattered over the shelf
  for (let k = 0; k < 26; k++) {
    const x = (-1.25 + random() * 1.9) * L, z = (random() - .5) * 2 * (halfWidth(x / L) - .1);
    if (Math.hypot(x + .15 * L, z - .1) < .2 || Math.abs(z - .3) < .05) continue;
    const s = .45 + random() * .6, neck = .5 + random() * .6;
    const rows = [[0, -.07, .07], [.03 * neck, -.04, .04], [.08 * neck, -.028, .03], [.11 * neck, -.035, .04], [.12 * neck, -.075, .08], [.135 * neck, -.095, .095], [.16 * neck, -.09, .085], [.185 * neck, -.06, .065], [.2 * neck, -.02, .025]];
    const rock = lmAdd(g, loftedRock(rows, { segments: 18, steps: 30, depthRatio: () => .9, colourAt: rockColour(.105 * neck, .125 * neck), wobble: .08, seed: k }), rockMaterial, x, shelfAt(x, z) - .005, z);
    rock.scale.setScalar(s); rock.rotation.set((random() - .5) * .15, random() * 6, (random() - .5) * .15);
  }
  // candle rocks near the tip: tapering cones with a round ball on top, each in a ring-shaped hollow
  for (const [x, z] of [[.55 * L, -.2], [.6 * L, -.28], [.5 * L, -.3]]) {
    const y = shelfAt(x, z);
    lmAdd(g, loftedRock([[0, -.05, .05], [.04, -.03, .03], [.1, -.016, .016], [.12, -.022, .022], [.14, -.024, .024], [.16, -.01, .01]], { segments: 14, steps: 20, colourAt: rockColour(.11, .13) }), rockMaterial, x, y - .005, z);
    lmAdd(g, new THREE.TorusGeometry(.06, .008, 6, 20).rotateX(Math.PI / 2), lmMaterial(0x6a5638, { roughness: 1 }), x, y + .002, z);
  }
  // tide pools in the hollows
  const pool = lmMaterial(0x3f8fa8, { roughness: .1, metalness: .2 });
  for (let k = 0; k < 10; k++) { const x = (-1.1 + random() * 1.6) * L, z = (random() - .5) * .5; lmAdd(g, new THREE.CircleGeometry(.03 + random() * .03, 14).rotateX(-Math.PI / 2), pool, x, shelfAt(x, z) + .004, z).scale.z = .6; }
  // the visitor centre and boardwalk at the landward end
  lmBox(g, .22, .06, .14, lmMaterial(0xe8e2d4), -1.25 * L, shelfAt(-1.25 * L, .25), .25);
  sweptRoof(g, { x: -1.25 * L, y: shelfAt(-1.25 * L, .25) + .06, z: .25, w: .24, d: .16, h: .03, material: TW.greyTile, ridgeRise: .1 });
  for (let k = 0; k < 12; k++) { const x = -1.1 * L + k * .05; lmBox(g, .045, .006, .03, TW.timber, x, shelfAt(x, .3) + .004, .3); }
  return mergeByMaterial(g);
};

// Taroko Gorge: a deep, narrow canyon of streaked grey-white marble with forest on the rims, the turquoise Liwu River
// on its bed, the cliff-hugging road with tunnel mouths, the Eternal Spring Shrine and its waterfall, and the red Cimu Bridge
const TAROKO_MARBLE = patternTexture((c, s) => {     // pale marble with soft diagonal veins and a few dark seams
  const gradient = c.createLinearGradient(0, 0, 0, s); gradient.addColorStop(0, '#e4e2dc'); gradient.addColorStop(1, '#bfbdb6');
  c.fillStyle = gradient; c.fillRect(0, 0, s, s);
  for (let i = 0; i < 26; i++) {
    c.strokeStyle = `rgba(${70 + Math.random() * 40},${72 + Math.random() * 40},${70 + Math.random() * 40},${.08 + Math.random() * .18})`;
    c.lineWidth = 1 + Math.random() * 4;
    const y = Math.random() * s;
    c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(s * .3, y + (Math.random() - .5) * 40, s * .7, y + (Math.random() - .5) * 40, s, y + (Math.random() - .5) * 30); c.stroke();
  }
}, 256);
LANDMARK_BUILDERS.gorge = () => {
  const g = new THREE.Group();
  const marble = lmMaterial(0xffffff, { map: TAROKO_MARBLE, roughness: .95 }), face = lmMaterial(0xffffff, { map: TAROKO_MARBLE, roughness: .95, side: THREE.DoubleSide }), river = lmMaterial(0x3fc0b0, { roughness: .2, metalness: .1 });
  const forest = lmMaterial(0x3c7a42, { roughness: 1 }), forestDark = lmMaterial(0x295c33, { roughness: 1 }), peak = lmMaterial(0x58837a, { roughness: 1 });
  // a canyon wall: a heightfield strip whose face is near-vertical and wavy, rim height rising downstream
  const wallMesh = (side) => {
    const geometry = new THREE.PlaneGeometry(2.4, 1, 40, 16);
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const u = position.getX(i) / 2.4 + .5, v = position.getY(i) + .5;    // u along the river, v up the face
      const sway = .06 * Math.sin(u * 9 + side) + .04 * Math.sin(u * 23 + side * 2);
      const rim = .75 + .2 * Math.sin(u * 4 + side) + .1 * u;
      const lean = Math.pow(v, 3) * .1;                                    // slight overhang near the rim
      position.setXYZ(i, (u - .5) * 2.4, v * rim, side * (.14 + sway - lean + (1 - v) * .03 + .02 * Math.sin(v * 17 + u * 11)));
    }
    geometry.computeVertexNormals();
    const mesh = lmAdd(g, geometry, face, 0, 0, 0);
    // the forested shelf behind each rim
    for (let k = 0; k < 14; k++) {
      const u = (k + .5) / 14, x = (u - .5) * 2.4, rim = .75 + .2 * Math.sin(u * 4 + side) + .1 * u;
      lmBox(g, .18, rim * .97, .14, marble, x, 0, side * .26);                         // solid rock just behind the face
      lmAdd(g, roughMass(.2, rim, .4, { seed: 400 + k + side * 70, jitter: .12, detail: 2 }), k % 2 ? forest : forestDark, x, 0, side * .55);   // the forested mountainside falling away outside
      for (let j = 0; j < 2; j++) lmAdd(g, roughMass(.05, .04, .05, { seed: 450 + k * 3 + j + side * 70, jitter: .3, detail: 1 }), (k + j) % 2 ? forestDark : forest, x + (j - .5) * .07, rim * .97, side * (.22 + j * .06));
    }
    return mesh;
  };
  wallMesh(1); wallMesh(-1);
  // the riverbed of pale boulders and the turquoise river
  lmBox(g, 2.4, .008, .3, lmMaterial(0xd8d4ca, { roughness: 1 }), 0, 0, 0);
  const water = new THREE.PlaneGeometry(2.4, .12, 30, 1).rotateX(-Math.PI / 2);
  const wp = water.attributes.position;
  for (let i = 0; i < wp.count; i++) wp.setZ(i, wp.getZ(i) + .04 * Math.sin(wp.getX(i) * 4));
  lmAdd(g, water, river, 0, .012, 0);
  for (let k = 0; k < 18; k++) lmAdd(g, roughMass(.015, .01, .015, { seed: 500 + k, jitter: .3, detail: 0 }), lmMaterial(0xeae8e2), -1.1 + k * .13, .01, (k % 2 ? .08 : -.08));
  // the highway cut into the right wall: a ledge with a parapet and tunnel mouths
  const roadY = .28;
  lmBox(g, 2.4, .012, .05, lmMaterial(0x6a6c6e), 0, roadY, .13);
  for (let k = 0; k < 24; k++) lmBox(g, .05, .015, .006, TW.white, -1.15 + k * .1, roadY + .012, .105);
  for (const x of [-.6, .5]) { archBay(g, x, roadY, .16, .07, .08, lmMaterial(0x1e1f20)); }
  // the Eternal Spring Shrine perched on the left wall with its waterfall below
  const sx = -.3, sy = .42, sz = -.14;
  lmBox(g, .14, .02, .1, TW.marble, sx, sy - .02, sz - .02);
  lmBox(g, .1, .05, .06, TW.red, sx, sy, sz - .03);
  sweptRoof(g, { x: sx, y: sy + .05, z: sz - .03, w: .1, d: .07, h: .035, material: TW.yellowTile, ridge: TW.gold });
  lmBox(g, .035, sy - .02, .01, lmMaterial(0xf4f8fb, { roughness: .3, transparent: true, opacity: .85 }), sx, 0, sz + .02);
  // the red Cimu Bridge spanning the river downstream, with white marble lions
  const bx = .7, rise = .05;
  lmAdd(g, new THREE.TorusGeometry(.16, .008, 6, 24, Math.PI).rotateY(Math.PI / 2), TW.red, bx, .03, 0).scale.set(1, .5, 1);
  lmBox(g, .04, .01, .34, TW.red, bx, .03 + rise * 1.6, 0);
  for (const side of [-1, 1]) { balustrade(g, bx - .02, -.16, bx - .02, .16, { y: .04 + rise * 1.6, h: .02, material: TW.red }); lmAdd(g, roughMass(.008, .012, .008, { seed: 3 + side, jitter: .1, detail: 1 }), TW.white, bx + .03, .04 + rise * 1.6, side * .16); }
  // the Taroko Archway at the gorge mouth: a three-bay, four-pillar pailou with golden glazed hip roofs, the middle one
  // highest, painted beams and the black plaque 東西橫貫公路, on the road where it leaves the canyon
  const ax = 1.38, pillar = lmMaterial(0xb83222), painted = lmMaterial(0x2f7a72), plaque = lmMaterial(0x15161a), goldTile = lmMaterial(0xe2b13a, { map: TEXTURES.tiles, roughness: .45 });
  lmBox(g, .22, .006, .6, lmMaterial(0x6a6c6e), ax, 0, 0);
  const posts = [-.2, -.08, .08, .2];
  for (const z of posts) { lmBox(g, .03, .03, .03, TW.marble, ax, 0, z); lmBox(g, .02, Math.abs(z) < .1 ? .26 : .21, .02, pillar, ax, .03, z); }
  for (let k = 0; k < 3; k++) {
    const z0 = posts[k], z1 = posts[k + 1], mid = (z0 + z1) / 2, h = k === 1 ? .26 : .21, w = z1 - z0;
    lmBox(g, .026, .022, w, painted, ax, .03 + h - .045, mid);
    lmBox(g, .028, .006, w, TW.gold, ax, .03 + h - .05, mid);
    if (k === 1) lmBox(g, .006, .028, .08, plaque, ax + .014, .03 + h - .1, mid);
    sweptRoof(g, { x: ax, y: .03 + h - .02, z: mid, w: w + .04, d: .07, h: .04, material: goldTile, ridge: goldTile, yaw: Math.PI / 2, ridgeLength: .55 });
  }
  // forest closing the canyon ends so the rock behind the faces never shows
  for (const x of [-1.25, 1.22]) for (const side of [-1, 1]) lmAdd(g, roughMass(.14, .8, .3, { seed: 800 + x * 10 + side, jitter: .12, detail: 2 }), forestDark, x, 0, side * .42);
  // blue-green peaks closing the head of the gorge
  for (let k = 0; k < 5; k++) lmAdd(g, roughMass(.3, .55 + (k % 2) * .2, .25, { seed: 600 + k, jitter: .15 }), peak, -1.3, 0, -.6 + k * .3);
  return mergeByMaterial(g);
};

// Jiufen: the mountainside town above the sea — dark-timber teahouses stacked in terraces up the slope, deep grey
// eaves strung with red lanterns, the narrow Shuqi Road stair climbing through them past the A-Mei Teahouse, the green peak behind
LANDMARK_BUILDERS.village = () => {
  const g = new THREE.Group();
  let seed = 23;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const timber = lmMaterial(0x6a4230, { map: TEXTURES.wood }), timberDark = lmMaterial(0x3e2a20, { map: TEXTURES.wood });
  const plaster = lmMaterial(0xd9cdb4), concrete = lmMaterial(0xb3b0a8), concreteDark = lmMaterial(0x8e8b84), tank = lmMaterial(0x5a87b0, { roughness: .5 });
  const shopLit = lmMaterial(0xffffff, { map: TEXTURES.lit, emissive: 0xffb050, emissiveMap: TEXTURES.lit, emissiveIntensity: .8 });
  const windows = lmMaterial(0xc8c0b0, { map: TEXTURES.windows }), stairStone = lmMaterial(0x8a8a84, { map: TEXTURES.stone });
  // a smooth hillside rising steeply to the back (toward -z), Jilong Mountain behind and the bay below
  const slopeAt = (x, z) => Math.max(0, (.75 - z) * .55) + .04 * Math.sin(x * 3.1) - Math.max(0, -.9 - z) * .2;
  const hill = new THREE.PlaneGeometry(2.4, 2, 30, 26).rotateX(-Math.PI / 2);
  const hp = hill.attributes.position;
  for (let i = 0; i < hp.count; i++) {   // the hillside, sinking into the game's own terrain at its edges
    const x = hp.getX(i), z = hp.getZ(i), edge = Math.min(1.2 - Math.abs(x), 1 - Math.abs(z));
    hp.setY(i, slopeAt(x, z) - Math.max(0, .18 - edge) * 1.2);
  }
  hill.computeVertexNormals();
  lmAdd(g, hill, lmMaterial(0x557f45, { roughness: 1 }), 0, 0, -.2);
  const ground = (x, z) => slopeAt(x, z + .2);
  // Shuqi Road: the stone stair climbing straight up the slope, lanterns strung over it
  for (let k = 0; k < 22; k++) {
    const z = .7 - k * .07, y = ground(0, z);
    lmBox(g, .09, Math.max(.01, ground(0, z - .07) - y + .01), .07, stairStone, 0, y, z - .035);
    if (k % 2 === 0) for (const dx of [-.03, 0, .03]) lmAdd(g, new THREE.SphereGeometry(.011, 8, 6), TW.lantern, dx, y + .11, z - .03).scale.set(1, 1.3, 1);
  }
  // houses packed along contour lines either side of the stair: timber teahouses hung with lanterns, plastered shops,
  // and the grey concrete houses with flat roofs and blue water tanks that cover most of the real hillside
  const house = (x, z, w, d, floors, kind) => {
    const y = Math.min(ground(x - w / 2, z + d / 2), ground(x + w / 2, z + d / 2)) - .01, h = floors * .065;
    const wall = kind === 'tea' ? (random() > .5 ? timber : timberDark) : kind === 'shop' ? plaster : (random() > .5 ? concrete : concreteDark);
    lmBox(g, w, h + (ground(x, z - d / 2) - y), d, wall, x, y, z);
    if (kind === 'concrete') {
      for (let f = 0; f < floors; f++) lmBox(g, w * .7, .03, .004, windows, x, y + .02 + f * .065, z + d / 2 + .002);
      lmBox(g, w + .01, .01, d + .01, concreteDark, x, y + h, z);
      if (random() > .4) lmCyl(g, .018, .018, .03, tank, x + (random() - .5) * w * .5, y + h + .01, z, 10);
      return;
    }
    lmBox(g, w * .9, .04, .006, shopLit, x, y + .005, z + d / 2 + .003);
    for (let f = 1; f < floors; f++) { lmBox(g, w * .8, .03, .006, shopLit, x, y + f * .065 + .015, z + d / 2 + .003); lmBox(g, w + .02, .005, .025, timberDark, x, y + f * .065, z + d / 2 + .012); }
    sweptRoof(g, { x, y: y + h + (ground(x, z - d / 2) - y) * .2, z, w: w + .02, d: d + .03, h: .04, material: kind === 'tea' ? TW.blackTile : TW.greyTile, ridgeRise: .2, overhang: 1.12 });
    if (kind === 'tea') for (let k = 0; k < 4; k++) lmAdd(g, new THREE.SphereGeometry(.011, 8, 6), TW.lantern, x - w * .38 + k * w * .25, y + h - .012, z + d / 2 + .02).scale.set(1, 1.3, 1);
  };
  for (let row = 0; row < 7; row++) {
    const z = .62 - row * .19;
    for (const side of [-1, 1]) {
      let x = side * .08;
      while (Math.abs(x) < 1.05) {
        const w = .1 + random() * .1, near = Math.abs(x) < .4;
        if (z > .3 && Math.abs(x + side * w / 2 - .24) < .26) { x += side * (w + .012); continue; }   // keep the A-Mei Teahouse and the view of it from the sea clear
        const kind = near ? (random() > .35 ? 'tea' : 'shop') : (random() > .3 ? 'concrete' : 'shop');
        house(x + side * w / 2, z + (random() - .5) * .03, w, .12 + random() * .04, 1 + Math.floor(random() * (near ? 3 : 2)), kind);
        x += side * (w + .012);
      }
    }
  }
  // the A-Mei Teahouse: Jiufen's landmark — a tall red timber teahouse stepping down the slope beside the stair, facing
  // the sea: four storeys of red walls and glowing lattice windows, balconies with red railings, deep black-tiled eaves
  // each strung with a row of red lanterns, a curved gable on top and the black-and-gold 阿妹茶樓 signboard
  const vermilion = lmMaterial(0xa82a1c, { map: TEXTURES.wood }), railRed = lmMaterial(0xc03020), beam = lmMaterial(0x3a1c14);
  const lattice = lmMaterial(0xffffff, { map: TEXTURES.lit, emissive: 0xffb050, emissiveMap: TEXTURES.lit, emissiveIntensity: 1 });
  const signCanvas = document.createElement('canvas'); signCanvas.width = 640; signCanvas.height = 200;
  const sc = signCanvas.getContext('2d');
  sc.fillStyle = '#141414'; sc.fillRect(0, 0, 640, 200);
  sc.strokeStyle = '#d8b04a'; sc.lineWidth = 8; sc.strokeRect(10, 10, 620, 180);
  sc.fillStyle = '#ecc45c'; sc.font = 'bold 130px "PingFang TC", "Noto Sans TC", "Heiti TC", "Microsoft JhengHei", sans-serif'; sc.textAlign = 'center'; sc.textBaseline = 'middle';
  sc.fillText('阿妹茶樓', 320, 104);
  const signTexture = new THREE.CanvasTexture(signCanvas); signTexture.colorSpace = THREE.SRGBColorSpace; signTexture.anisotropy = 4;
  const sign = lmMaterial(0xffffff, { map: signTexture, emissive: 0xffffff, emissiveMap: signTexture, emissiveIntensity: .3 });
  const ax = .24, az = .62 - .19 + .04, ay = ground(ax, az + .12) - .01;
  const floors = 4, floorH = .085, width = .3, depth = .2;
  lmBox(g, width + .04, .04, depth + .06, stairStone, ax, ay - .02, az);                 // the stone footing on the slope
  lmBox(g, width, floors * floorH, depth, vermilion, ax, ay, az);
  lmBox(g, width, Math.max(.01, ground(ax, az - depth / 2) - ay), depth * .5, stairStone, ax, ay, az - depth * .25);   // the slope behind is cut back to its foundation
  for (let f = 0; f < floors; f++) {
    const y = ay + f * floorH, zFront = az + depth / 2;
    lmBox(g, width * .86, floorH * .55, .006, lattice, ax, y + floorH * .18, zFront + .003);   // the glowing lattice windows
    for (let k = 0; k <= 5; k++) lmBox(g, .006, floorH * .6, .008, beam, ax - width * .43 + k * width * .172, y + floorH * .15, zFront + .006);
    lmBox(g, width + .01, .006, .008, beam, ax, y + floorH * .78, zFront + .006);
    if (f > 0) {                                                                            // balcony with a red railing
      lmBox(g, width + .02, .005, .035, beam, ax, y, zFront + .018);
      balustrade(g, ax - width / 2 - .01, zFront + .034, ax + width / 2 + .01, zFront + .034, { y: y + .005, h: .025, material: railRed, spacing: .02 });
    }
    sweptRoof(g, { x: ax, y: y + floorH * .82, z: az + .015, w: width + .05, d: depth + .07, h: .028, material: TW.blackTile, ridge: TW.blackTile, ridgeRise: .3, overhang: 1.1 });
    for (let k = 0; k < 9; k++) if (f !== 1 || Math.abs(k - 4) > 2) lmAdd(g, new THREE.SphereGeometry(.012, 10, 8), TW.lantern, ax - width * .48 + k * width * .12, y + floorH * .7, zFront + .058).scale.set(1, 1.3, 1);
  }
  const top = ay + floors * floorH;
  lmBox(g, width * .7, .06, depth * .7, vermilion, ax, top - .01, az);
  curvedGableAt(g, { x: ax, y: top + .04, z: az + depth * .36, width: width * .5, height: .07, depth: .012, material: TW.blackTile });
  sweptRoof(g, { x: ax, y: top + .045, z: az, w: width * .78, d: depth * .8, h: .07, material: TW.blackTile, ridge: TW.blackTile, ridgeRise: .9 });
  lmBox(g, .17, .056, .006, beam, ax, ay + floorH * 2 + .009, az + depth / 2 + .045);
  lmAdd(g, new THREE.PlaneGeometry(.16, .05), sign, ax, ay + floorH * 2 + .037, az + depth / 2 + .0485);   // the signboard over the second-floor balcony
  for (const side of [-1, 1]) lmAdd(g, new THREE.SphereGeometry(.022, 12, 10), TW.lantern, ax + side * (width / 2 + .03), ay + floorH * 1.5, az + depth / 2 + .03).scale.set(1, 1.35, 1);
  // trees on the upper slope
  for (let k = 0; k < 16; k++) { const x = (random() - .5) * 2.1, z = -.95 + random() * .35; lmAdd(g, roughMass(.06, .05, .06, { seed: 700 + k, jitter: .3, detail: 1 }), k % 2 ? TW.leaf : TW.leafDark, x, ground(x, z) + .03, z); }
  const cinemaX=-.24,cinemaZ=.60,cinemaY=ground(cinemaX,cinemaZ);
  lmBox(g,.30,.15,.18,lmMaterial(0xb7aa91),cinemaX,cinemaY,cinemaZ);
  lmBox(g,.32,.025,.015,lmMaterial(0xaaa18c),cinemaX,cinemaY+.125,cinemaZ+.096);
  for(const offset of [-.075,0,.075])lmBox(g,.048,.075,.004,TW.timber,cinemaX+offset,cinemaY+.015,cinemaZ+.092);
  referencePlaque(g,'昇平戲院',cinemaX,cinemaY+.09,cinemaZ+.104,.23,.035,'#5e3025','#cec1a6');
  return mergeByMaterial(g);
};

// --- lighthouses: built to unit height; taiwan-landmarks.js scales them and flashes the lens (group.userData.lens) ---
// the lantern on top of a tower: a black gallery with railing, a glazed lantern room with black astragals and a domed cap
function lanternTop(g, { y, r, lens }) {
  const black = lmMaterial(0x1b1f22, { roughness: .45, metalness: .3 });
  lmCyl(g, r * 1.45, r * 1.2, .025, black, 0, y, 0, 24);                          // the gallery floor on its corbel
  for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; lmBox(g, .004, .04, .004, black, Math.cos(a) * r * 1.4, y + .025, Math.sin(a) * r * 1.4); }
  lmAdd(g, new THREE.TorusGeometry(r * 1.4, .003, 4, 32).rotateX(Math.PI / 2), black, 0, y + .065, 0);
  lmCyl(g, r * .95, r * .95, .025, black, 0, y + .025, 0, 16);                    // lantern base
  lmAdd(g, new THREE.CylinderGeometry(r * .82, r * .82, .1, 16), lens, 0, y + .1, 0);
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; lmBox(g, .006, .1, .006, black, Math.cos(a) * r * .84, y + .05, Math.sin(a) * r * .84); }
  lmCyl(g, r * 1.0, r * 1.0, .012, black, 0, y + .15, 0, 16);
  lmAdd(g, new THREE.SphereGeometry(r * .98, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), black, 0, y + .16, 0).scale.y = .7;
  lmAdd(g, new THREE.SphereGeometry(r * .18, 10, 8), black, 0, y + .16 + r * .72, 0);
  lmCyl(g, .003, .003, .08, black, 0, y + .16 + r * .8, 0, 5);
  return y + .16 + r * .8 + .08;
}
const lensMaterial = () => new THREE.MeshStandardMaterial({ color: 0xfff1bd, emissive: 0xffcf5b, emissiveIntensity: .85, roughness: .25 });   // not in the night registry: the beacon loop drives it

// Eluanbi: the white cylindrical tower inside the only armed lighthouse compound in the world — a ring wall
// pierced with gun loops and a moat-like ditch — with keepers' houses, on the grassy cape among the trees
LANDMARK_BUILDERS.eluanbi = () => {
  const g=new THREE.Group(),white=lmMaterial(0xf5f2e9,{roughness:.78}),lens=lensMaterial();
  const stone=lmMaterial(0x95927b,{map:TEXTURES.stone,roughness:1});
  lmAdd(g,roughMass(.86,.10,.62,{seed:801,jitter:.045,detail:3}),TW.lawn,0,-.05,0);
  lmBox(g,1.55,.012,1.08,TW.lawn,0,0,0);
  // Rectangular fortified precinct. Keep an actual opening at the front gate.
  for(const x of [-.76,.76])lmBox(g,.025,.105,1.05,white,x,.01,0);
  lmBox(g,1.55,.105,.025,white,0,.01,-.52);
  for(const side of [-1,1])lmBox(g,.66,.105,.025,white,side*.44,.01,.52);
  for(let i=0;i<26;i++) {
    const x=-.72+i*.057;
    if(Math.abs(x)>.13)lmBox(g,.009,.016,.028,TW.glass,x,.058,.52);
    lmBox(g,.009,.016,.028,TW.glass,x,.058,-.52);
  }
  // White flat-roofed keeper's house with a real five-arch veranda to the right of the tower.
  const hx=.22,hz=-.05;
  lmBox(g,.69,.22,.25,white,hx,.02,hz-.12);
  referenceArcade(g,{x:hx,y:.02,z:hz+.095,w:.76,h:.22,n:5,material:white});
  referenceArcade(g,{x:hx+.38,y:.02,z:hz-.045,w:.30,h:.22,n:2,yaw:Math.PI/2,material:white});
  lmBox(g,.80,.018,.45,white,hx,.24,hz-.08);
  lmBox(g,.82,.022,.47,white,hx,.258,hz-.08);
  for(let i=0;i<5;i++)lmBox(g,.022,.035,.04,white,hx-.35+i*.175,.28,hz+.15);
  for(let i=0;i<5;i++)lmBox(g,.038,.073,.004,TW.glass,hx-.28+i*.14,.07,hz-.001);
  lmBox(g,.16,.12,.23,white,-.38,.02,hz-.08);
  // Tower on the left, with circumferential masonry bands and a white corbelled balcony.
  const tx=-.42,tz=-.02;
  lmCyl(g,.105,.12,.035,white,tx,.02,tz,40);
  const profile=[[.112,0],[.108,.06],[.096,.30],[.087,.58],[.086,.66]].map(([r,y])=>new THREE.Vector2(r,y));
  lmAdd(g,new THREE.LatheGeometry(profile,48),white,tx,.055,tz);
  for(const y of [.19,.35,.51,.67])lmCyl(g,.103-(y-.19)*.033,.103-(y-.19)*.033,.004,white,tx,y,tz,40);
  archBay(g,tx,.055,tz+.113,.034,.068,TW.glass);
  for(const y of [.27,.45,.61])lmBox(g,.013,.025,.004,TW.glass,tx,y,tz+.10-(y-.27)*.035);
  const top=whiteLantern(g,{x:tx,y:.71,z:tz,r:.076,lens});
  // External paved approach, broad grass and low tropical coastal shrubs.
  lmBox(g,.13,.006,.44,stone,0,.018,.39);
  for(let k=0;k<16;k++) {
    const x=-.75+k*.10,z=k%2?.63:-.63;
    lmAdd(g,roughMass(.06,.04,.05,{seed:830+k,jitter:.18,detail:1}),k%3?TW.leaf:TW.leafDark,x,.025,z);
  }
  const merged=mergeByMaterial(g);merged.userData.lens=lens;merged.userData.top=top;merged.userData.rectangularCompound=true;return merged;
};

// Keelung Lighthouse: a short white tower on the headland at the harbour mouth, on a terraced white base with
// railings and a viewing platform, the lantern under a black dome, trees on the slope around it
LANDMARK_BUILDERS.keelungLighthouse = () => {
  const g = new THREE.Group();
  const white = lmMaterial(0xf4f2ec), shade = lmMaterial(0xd6d2c8), dark = lmMaterial(0x2a2d30), lens = lensMaterial();
  lmAdd(g, roughMass(.55, .22, .5, { seed: 41, jitter: .1, detail: 2 }), lmMaterial(0x4f7f45, { roughness: 1 }), 0, 0, 0);   // the headland
  lmCyl(g, .36, .38, .06, shade, 0, .2, 0, 8);                                    // the octagonal platform
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, b = (k + 1) / 8 * Math.PI * 2; balustrade(g, Math.cos(a) * .35, Math.sin(a) * .35, Math.cos(b) * .35, Math.sin(b) * .35, { y: .26, h: .04, material: white, spacing: .04 }); }
  stairFlight(g, { z: .5, y: .06, w: .1, rise: .17, run: .16, steps: 8, material: shade });
  // the tower: a white cylinder on an annex, a band at the gallery
  lmBox(g, .22, .1, .16, white, 0, .26, -.08);
  archBay(g, 0, .26, .002, .05, .08, dark);
  lmCyl(g, .08, .095, .45, white, 0, .26, -.08, 24);
  for (const y of [.42, .56]) lmBox(g, .02, .04, .004, dark, 0, y, .005 - (y - .26) * .03);
  lmCyl(g, .09, .08, .03, shade, 0, .71, -.08, 24);
  const holder = new THREE.Group(); holder.position.z = -.08; g.add(holder);
  const top = lanternTop(holder, { y: .74, r: .065, lens });
  for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2, d = .42 + (k % 2) * .05; if (Math.abs(a - Math.PI / 2) < .4) continue; const y = .12; lmAdd(g, roughMass(.08, .07, .08, { seed: 500 + k, jitter: .25, detail: 1 }), k % 2 ? TW.leaf : TW.leafDark, Math.cos(a) * d, y + .08, Math.sin(a) * d); }
  for(const [x,z,w,d] of [[-.22,-.24,.22,.15],[.22,-.24,.22,.15],[0,-.40,.32,.12]]) {
    lmBox(g,w,.11,d,white,x,.12,z);lmBox(g,w+.018,.012,d+.018,white,x,.23,z);
    for(let k=0;k<3;k++)lmBox(g,.024,.032,.004,TW.glass,x-w*.30+k*w*.30,.16,z+d*.5+.002);
  }
  lmBox(g,.26,.009,.055,white,0,.23,-.24);
  lmBox(g,.017,.03,.017,white,-.27,.245,-.24);
  referencePlaque(g,'基隆燈塔',0,.27,.005,.105,.022,'#4d5251','#e9e6de');
  const merged = mergeByMaterial(g);
  merged.userData.lens = lens; merged.userData.top = top;
  return merged;
};


// --- Taipei 101 -------------------------------------------------------------------------------------------------------
// Loft a square tower with chamfered corners through the given rings (consecutive rings at one height make a flat ledge).
export function loftChamfered(rings) {
  const positions = [], uvs = [];
  const outline = ({ half: a, cut: c }) => [[-a + c, -a], [a - c, -a], [a, -a + c], [a, a - c], [a - c, a], [-a + c, a], [-a, a - c], [-a, -a + c]];
  // push a triangle, winding it so its normal points away from the tower axis (or up, for the roof)
  const triangle = (a, b, c, up) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const cx = (a[0] + b[0] + c[0]) / 3, cz = (a[2] + b[2] + c[2]) / 3;
    const flat = Math.abs(ny) > Math.hypot(nx, nz);
    const outward = up || flat ? ny : nx * cx + nz * cz;   // flat ledges face up
    const order = outward >= 0 ? [a, b, c] : [a, c, b];
    for (const v of order) { positions.push(v[0], v[1], v[2]); uvs.push(v[3], v[4]); }
  };
  for (let r = 0; r < rings.length - 1; r++) {
    const lower = rings[r], upper = rings[r + 1];
    const p0 = outline(lower), p1 = outline(upper);
    let u = 0;
    for (let k = 0; k < 8; k++) {
      const n = (k + 1) % 8;
      const edge = Math.hypot(p0[n][0] - p0[k][0], p0[n][1] - p0[k][1]);
      const a = [p0[k][0], lower.y, p0[k][1], u * 5, lower.y * 5], b = [p0[n][0], lower.y, p0[n][1], (u + edge) * 5, lower.y * 5];
      const c = [p1[n][0], upper.y, p1[n][1], (u + edge) * 5, upper.y * 5], d = [p1[k][0], upper.y, p1[k][1], u * 5, upper.y * 5];
      triangle(a, b, c, false); triangle(a, c, d, false);
      u += edge;
    }
  }
  const last = rings[rings.length - 1], cap = outline(last).map(([x, z]) => [x, last.y, z, x * 5, z * 5]);
  for (let k = 1; k < 7; k++) triangle(cap[0], cap[k], cap[k + 1], true);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

// Blue-green glass: eight floors of dark window band and pale spandrel per repeat, with vertical mullions; it glows at night.
const TAIPEI101_GLASS = patternTexture((c, s) => {
  c.fillStyle = '#d9ecea'; c.fillRect(0, 0, s, s);
  for (let row = 0; row < 8; row++) {
    const g = c.createLinearGradient(0, row * s / 8, 0, (row + 1) * s / 8);
    g.addColorStop(0, '#5f9c98'); g.addColorStop(1, '#3e7773');
    c.fillStyle = g; c.fillRect(0, row * s / 8 + s / 64, s, s / 8 - s / 32);
  }
  c.fillStyle = '#cfe2df';
  for (let column = 0; column < 8; column++) c.fillRect(column * s / 8, 0, s / 128, s);
}, 256);
TAIPEI101_GLASS.repeat.set(2, .2 / .068);   // the loft maps 0.2 units to one repeat: one repeat (eight floors) per tier
const taipei101Glass = stdMaterial({ color: 0xc4e6e2, roughness: .18, metalness: .35, map: TAIPEI101_GLASS, emissive: 0xffe9a8, emissiveMap: TAIPEI101_GLASS, emissiveIntensity: .04 });
taipei101Glass.userData.ownNight = true;
export function setTaipei101Night(night) { taipei101Glass.emissiveIntensity = night ? 1.3 : .04; }
// a ruyi (the auspicious cloud-head sceptre head): a trefoil heart shape, extruded
function ruyiGeometry(size, depth) {
  const s = new THREE.Shape();
  s.moveTo(0, -size * .55);
  s.bezierCurveTo(size * .45, -size * .2, size * .62, size * .1, size * .42, size * .32);
  s.bezierCurveTo(size * .3, size * .5, size * .12, size * .48, 0, size * .3);
  s.bezierCurveTo(-size * .12, size * .48, -size * .3, size * .5, -size * .42, size * .32);
  s.bezierCurveTo(-size * .62, size * .1, -size * .45, -size * .2, 0, -size * .55);
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * .3, bevelSize: size * .05, bevelSegments: 2, curveSegments: 10 }).translate(0, 0, -depth / 2);
}
// an old round coin with a square hole (Shape.holes, as in the three.js ExtrudeGeometry docs)
function coinGeometry(r, depth) {
  const s = new THREE.Shape(); s.absarc(0, 0, r, 0, Math.PI * 2, false);
  const hole = new THREE.Path(); const h = r * .32; hole.moveTo(-h, -h); hole.lineTo(-h, h); hole.lineTo(h, h); hole.lineTo(h, -h); hole.lineTo(-h, -h);
  s.holes.push(hole);
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * .2, bevelSize: r * .06, bevelSegments: 2, curveSegments: 24 }).translate(0, 0, -depth / 2);
}
// Taipei 101, unit height: the tapering base, eight flared eight-storey tiers like bamboo nodes or a stack of
// ingot boxes, the giant ruyi and coin ornaments on each face, ruyi curls at every tier corner, the stepped crown,
// the spire with its rings, and the 101 Mall's stepped glass podium beside it
LANDMARK_BUILDERS.taipei101 = () => {
  const g = new THREE.Group();
  const trim = lmMaterial(0xcdd8d8, { roughness: .35, metalness: .45 }), gold = lmMaterial(0xd8b24a, { metalness: .6, roughness: .3, emissive: 0x4a3300, emissiveIntensity: .2 });
  const mallGlass = lmMaterial(0xffffff, { map: curtainWall('#a9cdd4', '#6a8a92', 3, 6), metalness: .2, roughness: .2 }), stone = lmMaterial(0xcfcabc);
  const rings = [];
  const add = (y, half, cut) => rings.push({ y, half, cut });
  // base: a truncated pyramid (floors 1-25)
  add(0, .068, .012); add(.2, .052, .009);
  const tiers = 8, start = .2, tierHeight = .068;
  for (let i = 0; i < tiers; i++) {
    const narrow = 1 - i * .012, y0 = start + i * tierHeight;
    add(y0, .044 * narrow, .008 * narrow);                       // each tier starts narrow...
    add(y0 + tierHeight * .96, .056 * narrow, .01 * narrow);    // ...and flares out toward its top
  }
  const top = start + tiers * tierHeight;
  add(top, .036, .007); add(top + .025, .034, .007);            // the crown: two stepped blocks
  add(top + .025, .026, .005); add(top + .05, .024, .005);
  const crownTop = top + .05;
  g.add(new THREE.Mesh(loftChamfered(rings), taipei101Glass));
  // pale ledges where each tier meets the next, and the ruyi curls at the corners of every tier
  const curl = ruyiGeometry(.016, .004);
  for (let i = 0; i < tiers; i++) {
    const narrow = 1 - i * .012, y = start + (i + 1) * tierHeight - tierHeight * .04, half = .056 * narrow;
    lmBox(g, half * 2.02, .004, half * 2.02, trim, 0, y, 0);
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + k * Math.PI / 2, d = half * 1.3;
      const m = lmAdd(g, curl, trim, Math.cos(a) * d, y - .012, Math.sin(a) * d);
      m.rotation.y = -a + Math.PI / 2;
    }
  }
  for(let tier=0;tier<8;tier++)for(let side=0;side<4;side++) {
    const yaw=side*Math.PI/2,y0=start+tier*tierHeight,narrow=1-tier*.012;
    const facade=new THREE.Group();facade.rotation.y=yaw;g.add(facade);
    for(let col=-3;col<=3;col++) {
      const a=new THREE.Vector3(col*.012*narrow,y0,.044*narrow+.0005);
      const b=new THREE.Vector3(col*.015*narrow,y0+tierHeight*.96,.056*narrow+.0005);
      lmAdd(facade,strutGeometry(a,b,.0006),trim);
    }
  }
  // the giant ruyi on each face at the top of the base, and the gold coins above them
  const bigRuyi = ruyiGeometry(.05, .006), coin = coinGeometry(.016, .004);
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2, d = .054;
    const r = lmAdd(g, bigRuyi, trim, Math.sin(a) * d, start - .045, Math.cos(a) * d); r.rotation.y = a;
    const c = lmAdd(g, coin, gold, Math.sin(a) * (d - .008), start + .02, Math.cos(a) * (d - .008)); c.rotation.y = a;
  }
  // the spire: a tapering mast with observation rings
  lmCyl(g, .004, .012, 1 - crownTop, trim, 0, crownTop, 0, 10);
  for (const [y, r] of [[crownTop + .01, .02], [crownTop + .04, .014], [crownTop + .07, .01]]) lmCyl(g, r, r, .006, trim, 0, y, 0, 12);
  // 101 Mall: a broad six-storey podium wrapping the tower's east side, with a stepped glass roof
  lmBox(g, .3, .05, .2, mallGlass, .19, 0, 0);
  lmBox(g, .26, .015, .16, stone, .19, .05, 0);
  for (let k = 0; k < 4; k++) lmBox(g, .24 - k * .04, .01, .14 - k * .02, mallGlass, .19, .065 + k * .01, 0);
  lmBox(g, .34, .004, .4, stone, .05, 0, 0);
  const merged = mergeByMaterial(g);
  merged.userData.beaconY = 1;
  return merged;
};


// --- fourth pass: Japan's sights in high detail ------------------------------------------------------------------------
const JP = {
  orange: lmMaterial(0xe8501c, { metalness: .3, roughness: .45 }), white: lmMaterial(0xf2f2ee, { metalness: .2, roughness: .4 }),
  steel: lmMaterial(0xd8dee4, { metalness: .5, roughness: .35 }), skytree: lmMaterial(0xe4ecf2, { metalness: .45, roughness: .3 }),
  glass: lmMaterial(0x6f8fa8, { map: TEXTURES.windows, metalness: .4, roughness: .2 }), darkGlass: lmMaterial(0x34465a, { metalness: .5, roughness: .2 }),
  concrete: lmMaterial(0xd6d4cc), grey: lmMaterial(0x8e9296),
  plaster: lmMaterial(0xf6f4ee), black: lmMaterial(0x24262a), blackWood: lmMaterial(0x2a2422, { map: TEXTURES.wood }),
  tileGrey: lmMaterial(0x5a6068, { map: TEXTURES.tiles }), tileTeal: lmMaterial(0x5fa392, { map: TEXTURES.tiles, metalness: .2, roughness: .45 }),
  tileDark: lmMaterial(0x3c4046, { map: TEXTURES.tiles }), tileRed: lmMaterial(0xb24230, { map: TEXTURES.tiles }),
  cypress: lmMaterial(0x6e5640, { map: TEXTURES.wood }), thatch: lmMaterial(0x9a7a4a, { roughness: 1 }), thatchDark: lmMaterial(0x7a5e38, { roughness: 1 }),
  vermilion: lmMaterial(0xd23a1e), vermilionDark: lmMaterial(0xa82a18), gold: lmMaterial(0xe0b23a, { metalness: .6, roughness: .3, emissive: 0x4a3300, emissiveIntensity: .25 }),
  stone: lmMaterial(0xa8a49a, { map: TEXTURES.stone }), stoneDark: lmMaterial(0x7e7a72, { map: TEXTURES.stone }), gravel: lmMaterial(0xd8d4c6),
  moss: lmMaterial(0x5d8a4a, { roughness: 1 }), pine: lmMaterial(0x2e5a34, { roughness: 1 }), sakura: lmMaterial(0xf4c2d2, { roughness: .9 }),
  water: lmMaterial(0x3a7fa8, { roughness: .12, metalness: .2 }), bronze: lmMaterial(0x4f7a6a, { metalness: .5, roughness: .45 })
};
// a lattice frame between two lists of ring corners: verticals, horizontals and X bracing, sorted into a material per band
function trussSegment(parts, lower, upper, radius, brace = true) {
  const n = lower.length;
  for (let c = 0; c < n; c++) {
    const d = (c + 1) % n;
    parts.push(strutGeometry(lower[c], upper[c], radius));
    parts.push(strutGeometry(upper[c], upper[d], radius * .7));
    if (brace) { parts.push(strutGeometry(lower[c], upper[d], radius * .4)); parts.push(strutGeometry(lower[d], upper[c], radius * .4)); }
  }
}
const squareRing = (half, y, inset = 0) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => new THREE.Vector3(sx * (half - inset), y, sz * (half - inset)));
const circleRing = (r, y, n, phase = 0) => Array.from({ length: n }, (_, k) => new THREE.Vector3(Math.cos(k / n * Math.PI * 2 + phase) * r, y, Math.sin(k / n * Math.PI * 2 + phase) * r));
// a round glazed observation deck: banded glass drum with white slabs, a soffit and a roof
function observationDeck(g, { y, r, h, floors = 2, glass = JP.glass, frame = JP.white, segments = 24 }) {
  lmCyl(g, r * .9, r * .75, h * .25, frame, 0, y - h * .25, 0, segments);
  for (let f = 0; f < floors; f++) {
    const fy = y + f * h / floors;
    lmCyl(g, r * 1.01, r * 1.01, h / floors * .12, frame, 0, fy, 0, segments);
    lmCyl(g, r, r, h / floors * .88, glass, 0, fy + h / floors * .12, 0, segments);
  }
  lmCyl(g, r * .85, r * 1.03, h * .15, frame, 0, y + h, 0, segments);
  return y + h * 1.15;
}

// Tokyo Tower (333 m): four splayed legs on arched bases straddling the FootTown building, the lattice painted in
// alternating bands of international orange and white, the two-storey main deck at 150 m, the top deck at 250 m and the antenna
LANDMARK_BUILDERS.tokyoTower = () => {
  const g = new THREE.Group();
  const H = 1, halfAt = (h) => .02 + .2 * Math.pow(Math.max(0, 1 - h / .75), 1.9);
  const bandOf = (h) => h < .44 ? (h > .26 && h < .33 ? JP.white : JP.orange) : Math.floor((h - .46) / .065) % 2 ? JP.orange : JP.white;   // orange below the main deck with one white band, then alternating bands
  const orangeParts = [], whiteParts = [];
  const levels = [0, .02, .045, .075, .11, .15, .19, .235, .28, .33, .38, .43, .45, .5, .55, .6, .65, .7, .75];
  for (let i = 0; i < levels.length - 1; i++) {
    const h0 = levels[i], h1 = levels[i + 1], target = bandOf((h0 + h1) / 2) === JP.white ? whiteParts : orangeParts;
    trussSegment(target, squareRing(halfAt(h0), h0), squareRing(halfAt(h1), h1), i < 6 ? .006 : .004, h0 < .44 || h0 > .46);
    if (h0 < .15) trussSegment(target, squareRing(halfAt(h0), h0, .03), squareRing(halfAt(h1), h1, .025), .003, false);   // the inner chord of each leg
  }
  // the great arches between the legs at the foot
  for (let side = 0; side < 4; side++) {
    const a = side * Math.PI / 2, points = [];
    for (let k = 0; k <= 12; k++) { const t = k / 12, u = (t - .5) * 2; points.push(new THREE.Vector3(u * .17, .05 + .07 * (1 - u * u), .2)); }
    const curve = new THREE.CatmullRomCurve3(points);
    const tube = new THREE.TubeGeometry(curve, 20, .006, 6).rotateY(a);
    orangeParts.push(tube);
  }
  // the mast: lattice rising from the top deck, then the banded antenna
  for (let h = .75; h < .9; h += .03) trussSegment(bandOf(h) === JP.white ? whiteParts : orangeParts, squareRing(.02 - (h - .75) * .06, h), squareRing(.02 - (h + .03 - .75) * .06, h + .03), .0025);
  g.add(new THREE.Mesh(mergeGeometries(orangeParts), JP.orange), new THREE.Mesh(mergeGeometries(whiteParts), JP.white));
  for (let k = 0; k < 5; k++) lmCyl(g, .004, .005, .02, k % 2 ? JP.white : JP.orange, 0, .9 + k * .02, 0, 8);
  // the main deck (two storeys, square-ish with chamfers) and the top deck
  const deck = (y, half, h, floors) => {
    lmAdd(g, octagonPrism(half * 1.08, .008), JP.white, 0, y, 0);
    for (let f = 0; f < floors; f++) {
      lmAdd(g, octagonPrism(half, h / floors * .8), JP.glass, 0, y + .004 + f * h / floors + h / floors * .4, 0);
      lmAdd(g, octagonPrism(half * 1.04, h / floors * .2), JP.white, 0, y + (f + 1) * h / floors, 0);
    }
  };
  deck(.44, .085, .04, 2);
  deck(.745, .03, .018, 1);
  // FootTown: a four-storey white building under the legs, with its rooftop
  lmBox(g, .3, .07, .3, lmMaterial(0xeceae2, { map: TEXTURES.windows }), 0, 0, 0);
  lmBox(g, .31, .006, .31, JP.white, 0, .07, 0);
  lmBox(g, .7, .006, .7, JP.gravel, 0, 0, 0);
  const merged = mergeByMaterial(g);
  return merged;
};

// Tokyo Skytree (634 m): a three-legged lattice foot that turns from a triangle into a circle as it rises, the pale "Skytree
// white" steel around a central concrete core, the three-storey Tembo Deck at 350 m, the slim Tembo Galleria ring at 450 m and the antenna
LANDMARK_BUILDERS.skytree = () => {
  const g = new THREE.Group();
  const parts = [];
  const rAt = (h) => .018 + .045 * Math.pow(Math.max(0, 1 - h / .7), 1.4);
  const ring = (h) => {
    const t = Math.min(1, h / (315 / 634)), n = 12, r = rAt(h);
    return Array.from({ length: n }, (_, k) => {
      const a = k / n * Math.PI * 2, tri = Math.cos(Math.PI / 3) / Math.cos(((a + Math.PI / 6) % (Math.PI * 2 / 3)) - Math.PI / 3);   // triangle → circle
      return new THREE.Vector3(Math.cos(a) * r * (tri * (1 - t) + t), h, Math.sin(a) * r * (tri * (1 - t) + t));
    });
  };
  const levels = [];
  for (let h = 0; h <= .7; h += .025) levels.push(h);
  for (let i = 0; i < levels.length - 1; i++) trussSegment(parts, ring(levels[i]), ring(levels[i + 1]), i < 6 ? .0035 : .0025);
  g.add(new THREE.Mesh(mergeGeometries(parts), JP.skytree));
  lmCyl(g, .01, .016, .59, JP.concrete, 0, 0, 0, 16);                           // the central core
  // Tembo Deck: three stacked glass drums
  observationDeck(g, { y: .54, r: .065, h: .045, floors: 3, glass: JP.darkGlass });
  // Tembo Galleria: a slim sloping glass tube ring
  observationDeck(g, { y: .7, r: .045, h: .022, floors: 1, glass: JP.darkGlass });
  // the gain tower: a lattice mast with grey bands and the light at the tip
  const mast = [];
  for (let h = .725; h < .96; h += .02) trussSegment(mast, circleRing(.016 - (h - .725) * .04, h, 6), circleRing(.016 - (h + .02 - .725) * .04, h + .02, 6), .0018);
  g.add(new THREE.Mesh(mergeGeometries(mast), JP.skytree));
  for (const y of [.78, .84, .9]) lmCyl(g, .012, .012, .012, JP.grey, 0, y, 0, 10);
  lmCyl(g, .002, .004, .04, JP.skytree, 0, .96, 0, 6);
  lmAdd(g, new THREE.SphereGeometry(.004, 8, 6), LM.lantern, 0, 1, 0);
  // Tokyo Solamachi at the foot
  lmBox(g, .5, .05, .16, lmMaterial(0xe8e6de, { map: TEXTURES.windows }), .2, 0, .18);
  lmBox(g, .7, .004, .5, JP.gravel, .1, 0, .05);
  return mergeByMaterial(g);
};

// Tsutenkaku (108 m): the octagonal steel tower straddling the Shinsekai crossroads on four legs, the big white observation
// deck with the HITACHI sign, a second lattice stage, the top gallery and the lit cap that forecasts tomorrow's weather
LANDMARK_BUILDERS.tsutenkaku = () => {
  const g = new THREE.Group(), parts = [];
  const halfAt = (h) => .045 + .1 * Math.pow(Math.max(0, 1 - h / .45), 1.3);
  for (let h = 0; h < .45; h += .045) trussSegment(parts, squareRing(halfAt(h), h), squareRing(halfAt(h + .045), h + .045), .006);
  for (let h = .62; h < .82; h += .04) trussSegment(parts, circleRing(.05, h, 8, Math.PI / 8), circleRing(.05, h + .04, 8, Math.PI / 8), .004);
  g.add(new THREE.Mesh(mergeGeometries(parts), JP.steel));
  // the street passes beneath: arches across each pair of legs
  for (let side = 0; side < 4; side++) lmAdd(g, new THREE.TorusGeometry(.1, .008, 6, 20, Math.PI).rotateY(side * Math.PI / 2 + Math.PI / 2), JP.steel, Math.sin(side * Math.PI / 2) * .145, 0, Math.cos(side * Math.PI / 2) * .145).scale.set(1, .9, 1);
  // the big observation deck
  lmAdd(g, octagonPrism(.1, .02), JP.white, 0, .46, 0);
  lmAdd(g, octagonPrism(.095, .1), lmMaterial(0xf2f2ee, { map: TEXTURES.windows }), 0, .52, 0);
  lmAdd(g, octagonPrism(.1, .02), JP.white, 0, .58, 0);
  const sign = lmMaterial(0x2a5fb8, { emissive: 0x2a5fb8, emissiveIntensity: .4 });
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; lmBox(g, .06, .025, .004, sign, Math.sin(a) * .089, .5, Math.cos(a) * .089, a); }
  // the upper gallery, the cap and its weather lights
  lmAdd(g, octagonPrism(.065, .05), lmMaterial(0xf2f2ee, { map: TEXTURES.windows }), 0, .845, 0);
  lmAdd(g, new THREE.ConeGeometry(.07, .08, 8).rotateY(Math.PI / 8), JP.white, 0, .91, 0);
  lmAdd(g, new THREE.CylinderGeometry(.012, .02, .03, 8), lmMaterial(0xffffff, { emissive: 0xffd060, emissiveIntensity: .6 }), 0, .96, 0);
  lmCyl(g, .002, .004, .03, JP.steel, 0, .97, 0, 6);
  // the Shinsekai street and its low shops
  lmBox(g, .7, .004, .08, JP.grey, 0, 0, 0); lmBox(g, .08, .004, .7, JP.grey, 0, 0, 0);
  for (const [x, z] of [[-.25, -.25], [.25, -.25], [-.25, .25], [.25, .25]]) { lmBox(g, .16, .07, .16, lmMaterial(0xe8e0cc, { map: TEXTURES.windows }), x, 0, z); lmBox(g, .162, .025, .162, lmMaterial(0xffffff, { map: TEXTURES.lit, emissive: 0xffb050, emissiveMap: TEXTURES.lit, emissiveIntensity: .6 }), x, 0, z); }
  return mergeByMaterial(g);
};

// Kyoto Tower (131 m): the slim white "lighthouse" cylinder rising from the nine-storey Kyoto Tower Building, the round
// observation deck with its wraparound windows, and the red-and-white tip
LANDMARK_BUILDERS.kyotoTower = () => {
  const g = new THREE.Group();
  const building = lmMaterial(0xf0eeea, { map: TEXTURES.windows });
  lmBox(g, .8, .3, .3, building, 0, 0, 0);
  lmBox(g, .82, .02, .32, JP.white, 0, .3, 0);
  for (let k = 0; k < 5; k++) lmBox(g, .8, .004, .302, lmMaterial(0xa8b0b8), 0, .05 + k * .05, 0);
  lmBox(g, .3, .05, .02, lmMaterial(0xc8302a, { emissive: 0xc8302a, emissiveIntensity: .3 }), -.2, .22, .16);   // the KYOTO TOWER sign
  // the shaft: a smooth white lathe that swells slightly at the base and tapers into the deck
  const shaft = [[.001, .3], [.075, .3], [.07, .38], [.055, .55], [.045, .7], [.05, .74], [.001, .74]].map(([r, y]) => new THREE.Vector2(r, y));
  lmAdd(g, new THREE.LatheGeometry(shaft, 32), JP.white, 0, 0, 0);
  // the deck: a drum with bands of window, a soffit below and a dome above
  observationDeck(g, { y: .74, r: .085, h: .06, floors: 3, glass: JP.darkGlass });
  lmAdd(g, new THREE.SphereGeometry(.088, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), JP.white, 0, .808, 0).scale.y = .4;
  lmCyl(g, .025, .03, .06, JP.white, 0, .83, 0, 16);
  for (let k = 0; k < 4; k++) lmCyl(g, .016 - k * .003, .018 - k * .003, .025, k % 2 ? JP.white : lmMaterial(0xd0302a), 0, .89 + k * .025, 0, 12);
  lmCyl(g, .002, .004, .03, JP.white, 0, .99, 0, 6);
  return mergeByMaterial(g);
};

// Sapporo TV Tower (147 m): an orange lattice on four splayed legs at the east end of Odori Park, the white observation deck
// at 90 m with the giant digital clock on its face, and the lattice mast and antenna above
LANDMARK_BUILDERS.sapporoTower = () => {
  const g = new THREE.Group(), parts = [];
  const halfAt = (h) => .035 + .13 * Math.pow(Math.max(0, 1 - h / .55), 1.5);
  for (let h = 0; h < .58; h += .04) trussSegment(parts, squareRing(halfAt(h), h), squareRing(halfAt(h + .04), h + .04), h < .2 ? .006 : .004);
  for (let h = .66; h < .92; h += .03) trussSegment(parts, squareRing(.03 - (h - .66) * .08, h), squareRing(.03 - (h + .03 - .66) * .08, h + .03), .003);
  g.add(new THREE.Mesh(mergeGeometries(parts), JP.orange));
  // the deck and the clock on each face
  lmBox(g, .14, .08, .14, lmMaterial(0xf2f2ee, { map: TEXTURES.windows }), 0, .58, 0);
  lmBox(g, .15, .01, .15, JP.white, 0, .66, 0);
  const clock = lmMaterial(0x1a1a1a, { emissive: 0xffd04a, emissiveIntensity: .5 });
  lmBox(g, .1, .03, .004, clock, 0, .53, .065);
  lmBox(g, .14, .045, .14, lmMaterial(0xf2f2ee), 0, .5, 0);
  lmCyl(g, .002, .003, .08, JP.white, 0, .92, 0, 6);
  // Odori Park: a long lawn with flower beds and fountains stretching west
  lmBox(g, .9, .004, .26, lmMaterial(0x6fae52, { roughness: 1 }), -.4, 0, 0);
  for (let k = 0; k < 3; k++) lmBox(g, .14, .006, .08, lmMaterial([0xe85a8a, 0xf2d24a, 0xb070d0][k % 3], { roughness: 1 }), -.25 - k * .22, .004, 0);
  for (let k = 0; k < 5; k++) for (const side of [-1, 1]) { const x = -.2 - k * .14; lmCyl(g, .004, .005, .03, TW.trunk, x, 0, side * .12, 5); lmAdd(g, roughMass(.025, .03, .025, { seed: k + side * 20, jitter: .25, detail: 1 }), TW.leaf, x, .045, side * .12); }
  return mergeByMaterial(g);
};

// --- Japanese castles ---
// plastered wall with a row of small dark windows (white) or black-lacquered clapboard with a white band (black)
const CASTLE_WALL_WHITE = patternTexture((c, s) => {
  c.fillStyle = '#f6f4ee'; c.fillRect(0, 0, s, s);
  c.fillStyle = '#2a2a2c'; for (let k = 0; k < 4; k++) c.fillRect(k * s / 4 + s / 12, s * .35, s / 10, s * .3);
  c.fillStyle = '#dedad0'; c.fillRect(0, s * .94, s, s * .06);
});
const CASTLE_WALL_BLACK = patternTexture((c, s) => {
  c.fillStyle = '#26221f'; c.fillRect(0, 0, s, s);
  c.fillStyle = '#3a342f'; for (let k = 0; k < 16; k++) c.fillRect(k * s / 16, 0, 1, s);
  c.fillStyle = '#f2f0ea'; c.fillRect(0, 0, s, s * .28);
  c.fillStyle = '#1a1a1a'; for (let k = 0; k < 4; k++) c.fillRect(k * s / 4 + s / 12, s * .42, s / 10, s * .26);
});
// the ishigaki: a battered stone base whose faces curve concavely upward (ogi-no-kobai)
function ishigaki(g, { x = 0, z = 0, y = 0, half, top, h, steep = 2, material = JP.stone }) {
  const rings = [];
  for (let k = 0; k <= 8; k++) { const t = k / 8, hw = top + (half - top) * Math.pow(1 - t, steep); rings.push({ y: y + h * t, half: hw, cut: hw * .04 }); }
  const mesh = lmAdd(g, loftChamfered(rings), material, x, 0, z);
  return mesh;
}
// a shachihoko: the golden tiger-headed carp standing on its head at each end of the top ridge
function shachihoko(g, x, y, z, size, side, material = JP.gold) {
  const holder = new THREE.Group(); holder.position.set(x, y, z); holder.rotation.z = side * .25; g.add(holder);
  lmAdd(holder, new THREE.SphereGeometry(size * .45, 10, 8), material, 0, size * .35, 0).scale.set(.8, 1, .7);   // head
  lmAdd(holder, new THREE.ConeGeometry(size * .3, size * .9, 8), material, 0, size * 1.05, 0);                      // body arching up
  lmAdd(holder, new THREE.ConeGeometry(size * .35, size * .3, 3), material, side * size * .1, size * 1.55, 0).rotation.z = side * .8;   // the flared tail
}
// one keep: storeys of wall each under a curved hip roof with an outward overhang, gables projecting from chosen storeys
// (chidori = triangular, kara = curved), and a top ridge with shachihoko; returns the ridge height
function castleKeep2(g, { x = 0, z = 0, y = 0, w, d, storeys, wall, roof, trim = JP.plaster, shachi = JP.gold, roofH = .07, shrink = .82 }) {
  let yy = y, cw = w, cd = d;
  storeys.forEach((storey, i) => {
    const h = storey.h ?? .08, last = i === storeys.length - 1;
    lmBox(g, cw, h, cd, storey.wall ?? wall, x, yy, z);
    yy += h;
    const over = storey.over ?? 1.22, rh = storey.roofH ?? roofH;
    if (last) {
      // the top storey has the irimoya roof: a hip with a ridge along x
      lmHip(g, cw * .22, cw * .5 * over, rh * 1.3, roof, x, yy, z, cd / cw);
      lmBox(g, cw * .5, rh * .25, .015, roof, x, yy + rh * 1.25, z);
      for (const side of [-1, 1]) {
        gableAt(g, { x: x + side * cw * .15, y: yy + rh * .5, z, width: cd * .55, height: rh * .7, depth: .01, material: trim, yaw: Math.PI / 2 });
        if (shachi) shachihoko(g, x + side * cw * .27, yy + rh * 1.35, z, rh * .45, side, shachi);
      }
      yy += rh * 1.5;
    } else {
      lmHip(g, Math.max(cw * .5 * shrink - .01, .01), cw * .5 * over, rh, roof, x, yy, z, cd / cw);
      lmBox(g, cw * over * .98, .006, cd * over * .98, trim, x, yy + .002, z);    // the white plastered eave edge
      for (const face of storey.gables ?? []) {
        const [kind, axis, count = 1] = face;
        for (let n = 0; n < count; n++) {
          const along = count === 1 ? 0 : (n - (count - 1) / 2) * (axis === 'z' ? cw : cd) * .45;
          for (const s2 of [-1, 1]) {
            const gx = axis === 'z' ? x + along : x + s2 * cw * .5 * over * .92, gz = axis === 'z' ? z + s2 * cd * .5 * over * .92 : z + along;
            const yaw = axis === 'z' ? 0 : Math.PI / 2, gw = (axis === 'z' ? cw : cd) * (count === 1 ? .42 : .3);
            if (kind === 'kara') {
              curvedGableAt(g, { x: gx, y: yy - rh * .2, z: gz, width: gw, height: rh * .8, depth: .03, material: roof, yaw });
              curvedGableAt(g, { x: gx + (axis === 'z' ? 0 : s2 * .016), y: yy - rh * .2 + .004, z: gz + (axis === 'z' ? s2 * .016 : 0), width: gw * .8, height: rh * .6, depth: .006, material: trim, yaw });
            } else {
              gableAt(g, { x: gx, y: yy - rh * .3, z: gz, width: gw, height: rh * 1.1, depth: .05, material: roof, yaw });
              gableAt(g, { x: gx + (axis === 'z' ? 0 : s2 * .026), y: yy - rh * .3 + .008, z: gz + (axis === 'z' ? s2 * .026 : 0), width: gw * .78, height: rh * .85, depth: .006, material: trim, yaw });
            }
          }
        }
      }
      yy += rh * .75;
    }
    cw *= storey.shrink ?? shrink; cd *= storey.shrink ?? shrink;
  });
  return yy;
}
// a moat ring of water between an outer and inner stone wall
function castleMoat(g, { inner, outer, y = 0, material = JP.water }) {
  const shape = new THREE.Shape([new THREE.Vector2(-outer, -outer), new THREE.Vector2(outer, -outer), new THREE.Vector2(outer, outer), new THREE.Vector2(-outer, outer)]);
  shape.holes.push(new THREE.Path([new THREE.Vector2(-inner, -inner), new THREE.Vector2(-inner, inner), new THREE.Vector2(inner, inner), new THREE.Vector2(inner, -inner)]));
  lmAdd(g, new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), material, 0, y + .013, 0);
  lmBox(g, outer * 2 + .1, .02, .05, JP.stone, 0, y, outer + .025); lmBox(g, outer * 2 + .1, .02, .05, JP.stone, 0, y, -outer - .025);
  lmBox(g, .05, .02, outer * 2, JP.stone, outer + .025, y, 0); lmBox(g, .05, .02, outer * 2, JP.stone, -outer - .025, y, 0);
}
const pinesAround = (g, count, r0, r1, seed = 1) => {
  let s = seed;
  const random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let k = 0; k < count; k++) { const a = random() * Math.PI * 2, d = r0 + random() * (r1 - r0); gardenPine(g, Math.cos(a) * d, Math.sin(a) * d, .8 + random() * .5); }
};

// Osaka Castle: the white five-roofed keep with green copper roofs, gold trims on every gable, the black top storey
// with gold tigers and cranes, gold shachihoko, on its tall stone base inside the moat
LANDMARK_BUILDERS.osakaCastle = () => {
  const g = new THREE.Group();
  const white = lmMaterial(0xffffff, { map: CASTLE_WALL_WHITE }), goldTrim = JP.gold;
  const topWall = lmMaterial(0xffffff, { map: patternTexture((c, s) => { c.fillStyle = '#1e1e22'; c.fillRect(0, 0, s, s); c.fillStyle = '#e0b23a'; for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(k * s / 3 + s / 6, s / 2, s / 9, 0, Math.PI * 2); c.fill(); } c.fillRect(0, s * .9, s, s * .06); c.fillRect(0, s * .04, s, s * .06); }), metalness: .3 });
  lmBox(g, 2, .01, 2, JP.moss, 0, 0, 0);
  castleMoat(g, { inner: .55, outer: .8 });
  ishigaki(g, { half: .36, top: .3, h: .18 });
  const top = castleKeep2(g, { y: .18, w: .46, d: .4, wall: white, roof: JP.tileTeal, trim: goldTrim, roofH: .075, storeys: [
    { h: .1, gables: [['chidori', 'z'], ['chidori', 'x']] },
    { h: .085, gables: [['kara', 'z'], ['chidori', 'x']] },
    { h: .08, gables: [['chidori', 'z', 2], ['kara', 'x']] },
    { h: .075, gables: [['kara', 'z']], shrink: .85 },
    { h: .085, wall: topWall }
  ] });
  lmBox(g, .34, .006, .3, goldTrim, 0, .18 + .1 + .085 + .08 + .075 + .21, 0);   // gold rail of the top balcony
  pinesAround(g, 16, .85, 1.0, 3);
  return mergeByMaterial(g);
};

// Himeji Castle ("White Heron"): the brilliant white main keep with five layers of roofs and many layered gables, linked by
// white corridors to three smaller keeps, grey tiles edged in white plaster, on curving stone bases
LANDMARK_BUILDERS.himeji = () => {
  const g = new THREE.Group();
  const white = lmMaterial(0xffffff, { map: CASTLE_WALL_WHITE }), roof = lmMaterial(0x6a7078, { map: TEXTURES.tiles });
  lmBox(g, 2.2, .01, 2, JP.moss, 0, 0, 0);
  ishigaki(g, { x: 0, z: 0, half: .3, top: .25, h: .16 });
  castleKeep2(g, { y: .16, w: .44, d: .36, wall: white, roof, trim: JP.plaster, shachi: JP.black, roofH: .07, storeys: [
    { h: .1, gables: [['chidori', 'z', 2], ['chidori', 'x']] },
    { h: .08, gables: [['kara', 'z'], ['chidori', 'x', 2]] },
    { h: .075, gables: [['chidori', 'z'], ['kara', 'x']] },
    { h: .07, gables: [['chidori', 'z', 2]], shrink: .85 },
    { h: .08 }
  ] });
  // the three lesser keeps and the white corridors joining them in a ring
  const small = [[-.55, -.25], [-.5, .3], [.05, .5]];
  for (const [x, z] of small) {
    ishigaki(g, { x, z, half: .15, top: .12, h: .1 });
    castleKeep2(g, { x, z, y: .1, w: .2, d: .17, wall: white, roof, shachi: JP.black, roofH: .05, storeys: [{ h: .07, gables: [['chidori', 'z']] }, { h: .06, gables: [['kara', 'x']] }, { h: .06 }] });
  }
  for (const [a, b] of [[[0, 0], small[0]], [small[0], small[1]], [small[1], small[2]], [small[2], [0, 0]]]) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), yaw = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
    lmBox(g, len * .7, .06, .07, white, (a[0] + b[0]) / 2, .1, (a[1] + b[1]) / 2, yaw);
    lmHip(g, .02, .06, .03, roof, (a[0] + b[0]) / 2, .16, (a[1] + b[1]) / 2, len * .7 / .12, yaw + Math.PI / 2);
  }
  // the winding white walls and gates down the hill, and cherry trees
  for (let k = 0; k < 5; k++) { const a = -.6 + k * .3; lmBox(g, .28, .05, .03, white, Math.cos(a) * .82, 0, Math.sin(a) * .82, -a + Math.PI / 2); lmBox(g, .3, .012, .05, roof, Math.cos(a) * .82, .05, Math.sin(a) * .82, -a + Math.PI / 2); }
  for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2, d = .95; lmCyl(g, .006, .008, .05, TW.trunk, Math.cos(a) * d, 0, Math.sin(a) * d, 5); lmAdd(g, roughMass(.05, .04, .05, { seed: k, jitter: .3, detail: 1 }), JP.sakura, Math.cos(a) * d, .07, Math.sin(a) * d); }
  return mergeByMaterial(g);
};

// Matsumoto Castle ("Crow Castle"): the black-lacquered five-roofed keep with white bands under the eaves, the smaller
// Inui keep joined by a corridor, the Tatsumi turret and the open red-railed moon-viewing pavilion, rising from the moat
// with the red Uzumi bridge, the Japanese Alps behind
LANDMARK_BUILDERS.matsumoto = () => {
  const g = new THREE.Group();
  const black = lmMaterial(0xffffff, { map: CASTLE_WALL_BLACK }), roof = lmMaterial(0x4a4e54, { map: TEXTURES.tiles });
  lmBox(g, 2.2, .01, 2, JP.moss, 0, 0, 0);
  lmAdd(g, new THREE.CircleGeometry(.75, 40).rotateX(-Math.PI / 2), JP.water, 0, .013, 0).scale.z = .8;
  ishigaki(g, { half: .27, top: .25, h: .08, steep: 1.2, material: JP.stoneDark });
  castleKeep2(g, { y: .08, w: .4, d: .34, wall: black, roof, trim: JP.plaster, shachi: JP.black, roofH: .06, shrink: .85, storeys: [
    { h: .1, gables: [['chidori', 'z']] }, { h: .08, gables: [['chidori', 'x']] }, { h: .075, gables: [['kara', 'z']] }, { h: .07 }, { h: .07 }
  ] });
  // the Inui small keep to the north and its corridor
  ishigaki(g, { x: -.38, z: -.08, half: .13, top: .12, h: .08, steep: 1.2, material: JP.stoneDark });
  castleKeep2(g, { x: -.38, z: -.08, y: .08, w: .18, d: .16, wall: black, roof, shachi: JP.black, roofH: .045, storeys: [{ h: .07 }, { h: .06 }, { h: .06 }] });
  lmBox(g, .14, .07, .1, black, -.22, .08, -.05); lmHip(g, .02, .09, .03, roof, -.22, .15, -.05, .8);
  // the Tatsumi turret and the moon-viewing pavilion with its red railing on the east
  ishigaki(g, { x: .36, z: .1, half: .14, top: .13, h: .08, steep: 1.2, material: JP.stoneDark });
  castleKeep2(g, { x: .36, z: .02, y: .08, w: .16, d: .14, wall: black, roof, shachi: false, roofH: .045, storeys: [{ h: .07 }, { h: .06 }] });
  lmBox(g, .18, .01, .1, JP.blackWood, .38, .14, .18);
  balustrade(g, .29, .23, .47, .23, { y: .15, h: .025, material: JP.vermilion, spacing: .02 });
  lmHip(g, .04, .12, .04, roof, .38, .2, .18, .6);
  for (const [px, pz] of [[.3, .14], [.46, .14], [.3, .22], [.46, .22]]) lmBox(g, .008, .06, .008, JP.blackWood, px, .14, pz);
  // the red Uzumi bridge across the moat
  lmAdd(g, curvedBeam(.4, .015, .05, .04).rotateY(Math.PI / 2), JP.vermilion, .2, .03, .55);
  balustrade(g, .17, .38, .17, .72, { y: .045, h: .02, material: JP.vermilion }); balustrade(g, .23, .38, .23, .72, { y: .045, h: .02, material: JP.vermilion });
  pinesAround(g, 10, .9, 1.0, 7);
  return mergeByMaterial(g);
};

// Nagoya Castle: the great white keep with green copper roofs and the famous pair of golden shachihoko, the smaller keep
// joined to it, on a high stone base, and the rebuilt Hommaru Palace beside it
LANDMARK_BUILDERS.nagoyaCastle = () => {
  const g = new THREE.Group();
  const white = lmMaterial(0xffffff, { map: CASTLE_WALL_WHITE });
  lmBox(g, 2.2, .01, 2, JP.moss, 0, 0, 0);
  castleMoat(g, { inner: .6, outer: .82 });
  ishigaki(g, { half: .32, top: .28, h: .16 });
  castleKeep2(g, { y: .16, w: .44, d: .38, wall: white, roof: JP.tileTeal, trim: JP.plaster, shachi: JP.gold, roofH: .075, storeys: [
    { h: .1, gables: [['chidori', 'z'], ['chidori', 'x']] }, { h: .085, gables: [['chidori', 'z', 2], ['kara', 'x']] },
    { h: .08, gables: [['kara', 'z'], ['chidori', 'x']] }, { h: .075 }, { h: .085, roofH: .085 }
  ] });
  // golden shachihoko larger than life: add a second, bigger pair over the generic ones
  ishigaki(g, { x: .38, z: .2, half: .14, top: .12, h: .12 });
  castleKeep2(g, { x: .38, z: .2, y: .12, w: .2, d: .18, wall: white, roof: JP.tileTeal, shachi: JP.gold, roofH: .05, storeys: [{ h: .07 }, { h: .065 }] });
  // Hommaru Palace: a long low cypress-wood hall with a grey roof and a curved gable porch
  lmBox(g, .5, .07, .2, JP.cypress, -.3, 0, .45);
  lmHip(g, .1, .3, .07, JP.tileGrey, -.3, .07, .45, .5);
  curvedGableAt(g, { x: -.3, y: .06, z: .56, width: .12, height: .06, depth: .03, material: JP.tileGrey });
  pinesAround(g, 14, .88, 1.0, 11);
  return mergeByMaterial(g);
};

// Kumamoto Castle: the black main keep and its smaller keep, black clapboard with white bands, grey roofs bristling with
// gables, on the great "musha-gaeshi" stone walls that curve out to near-vertical at the top
LANDMARK_BUILDERS.kumamotoCastle = () => {
  const g = new THREE.Group();
  const black = lmMaterial(0xffffff, { map: CASTLE_WALL_BLACK }), roof = lmMaterial(0x50555c, { map: TEXTURES.tiles });
  lmBox(g, 2.2, .01, 2, JP.moss, 0, 0, 0);
  ishigaki(g, { half: .42, top: .3, h: .2, steep: 3 });
  castleKeep2(g, { y: .2, w: .4, d: .34, wall: black, roof, trim: JP.plaster, shachi: JP.black, roofH: .065, storeys: [
    { h: .09, gables: [['chidori', 'z', 2], ['chidori', 'x']] }, { h: .08, gables: [['kara', 'z'], ['chidori', 'x']] },
    { h: .075, gables: [['chidori', 'z']] }, { h: .07 }, { h: .075 }
  ] });
  ishigaki(g, { x: .45, z: .15, half: .2, top: .14, h: .16, steep: 3 });
  castleKeep2(g, { x: .45, z: .15, y: .16, w: .22, d: .2, wall: black, roof, shachi: JP.black, roofH: .05, storeys: [{ h: .07, gables: [['chidori', 'z']] }, { h: .065 }, { h: .065 }] });
  // the long Uto turret and walls along the stone edge, camphor trees
  lmBox(g, .5, .06, .08, black, -.3, .2, .38); lmHip(g, .04, .3, .03, roof, -.3, .26, .38, .3);
  for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2, d = .95; lmCyl(g, .008, .012, .06, TW.trunk, Math.cos(a) * d, 0, Math.sin(a) * d, 5); lmAdd(g, roughMass(.08, .06, .08, { seed: 40 + k, jitter: .3, detail: 1 }), TW.leaf, Math.cos(a) * d, .1, Math.sin(a) * d); }
  return mergeByMaterial(g);
};

// --- Japanese temples and shrines ---
// an irimoya (hip-and-gable) roof over a w × d hall (ridge along x): a curved hip below, a gable face at each end above it
function irimoya(g, { x = 0, y, z = 0, w, d, h, material, trim = material, yaw = 0, over = 1.25 }) {
  const holder = new THREE.Group(); holder.position.set(x, y, z); holder.rotation.y = yaw; g.add(holder);
  lmHip(holder, w * .32, w * .5 * over, h * .65, material, 0, 0, 0, d / w);
  const gh = h * .55, top = h * .6;
  for (const side of [-1, 1]) gableAt(holder, { x: side * w * .32, y: top - .002, z: 0, width: d * .62, height: gh, depth: .01, material: trim, yaw: Math.PI / 2 });
  const ridge = new THREE.Shape([new THREE.Vector2(-d * .33, 0), new THREE.Vector2(d * .33, 0), new THREE.Vector2(0, gh)]);
  lmAdd(holder, new THREE.ExtrudeGeometry(ridge, { depth: w * .64, bevelEnabled: false }).translate(0, 0, -w * .32).rotateY(Math.PI / 2), material, 0, top, 0);
  lmBox(holder, w * .7, h * .06, h * .06, material, 0, top + gh - .002, 0);    // the ridge cap
  return y + top + gh;
}
// a temple hall: raised stone base, vermilion or wood columns, white or wooden walls, bracket band, irimoya roof
function templeHall(g, { x = 0, z = 0, y = 0, w, d, h, roofH, pillar = JP.vermilion, wall = JP.plaster, roof = JP.tileGrey, base = JP.stone, double = false, yaw = 0, cols = 6 }) {
  const holder = new THREE.Group(); holder.position.set(x, y, z); holder.rotation.y = yaw; g.add(holder);
  lmBox(holder, w * 1.15, .03, d * 1.2, base, 0, 0, 0);
  lmBox(holder, w * .92, h, d * .9, wall, 0, .03, 0);
  for (let i = 0; i < cols; i++) for (const s of [-1, 1]) lmCyl(holder, .007, .008, h, pillar, -w / 2 + w * i / (cols - 1), .03, s * d / 2, 8);
  lmBox(holder, w * 1.02, .02, d * 1.04, pillar, 0, .03 + h, 0);                  // the bracket band
  let top = .05 + h;
  if (double) { lmHip(holder, w * .4, w * .62, roofH * .4, roof, 0, top, 0, d / w); lmBox(holder, w * .8, roofH * .35, d * .75, wall, 0, top + roofH * .3, 0); top += roofH * .65; }
  return y + irimoya(holder, { y: top, w, d, h: roofH, material: roof });
}
// a Japanese five-storey pagoda: slender storeys under very wide shallow eaves, the bronze sorin spire with nine rings
function pagoda5(g, { x = 0, z = 0, y = 0, half = .07, storeyH = .07, wall = JP.vermilion, roof = JP.tileDark, levels = 5 }) {
  lmBox(g, half * 2.6, .025, half * 2.6, JP.stone, x, y, z);
  let yy = y + .025, hw = half;
  for (let i = 0; i < levels; i++) {
    lmBox(g, hw * 1.6, storeyH * .55, hw * 1.6, wall, x, yy, z);
    lmBox(g, hw * 1.75, storeyH * .12, hw * 1.75, JP.plaster, x, yy + storeyH * .55, z);
    yy += storeyH * .67;
    lmHip(g, hw * .55, hw * 1.95, storeyH * .33, roof, x, yy, z);
    yy += storeyH * .33;
    hw *= .9;
  }
  lmCyl(g, hw * .12, hw * .25, storeyH * 2.2, JP.bronze, x, yy, z, 8);
  for (let k = 0; k < 9; k++) lmCyl(g, hw * .3, hw * .3, storeyH * .05, JP.bronze, x, yy + storeyH * (.3 + k * .18), z, 10);
  return yy + storeyH * 2.2;
}

// Senso-ji: the vermilion Kaminarimon with its giant red lantern, the Nakamise shopping street, the two-storey Hozomon gate,
// the main hall with its steep grey roof, and the five-storey pagoda
LANDMARK_BUILDERS.sensoji = () => {
  const g = new THREE.Group();
  const lantern = lmMaterial(0xc42a1c, { emissive: 0xa01808, emissiveIntensity: .3 });
  lmBox(g, 1.2, .006, 2.2, JP.gravel, 0, 0, 0);
  // Kaminarimon at the front
  const gate = (z, w, h, twoStorey) => {
    lmBox(g, w * 1.1, .02, .14, JP.stone, 0, 0, z);
    for (const px of [-w / 2, -w / 6, w / 6, w / 2]) for (const pz of [-.05, .05]) lmCyl(g, .01, .011, h, JP.vermilion, px, .02, z + pz, 8);
    lmBox(g, w + .02, .03, .13, JP.vermilion, 0, .02 + h, z);
    if (twoStorey) { lmBox(g, w * .9, h * .6, .11, JP.vermilion, 0, .05 + h, z); }
    const top = .05 + h + (twoStorey ? h * .6 : 0);
    irimoya(g, { y: top, z, w: w * 1.05, d: .2, h: .12, material: JP.tileDark });
    return top;
  };
  gate(.95, .3, .12, false);
  lmAdd(g, new THREE.SphereGeometry(.045, 16, 12), lantern, 0, .1, .95).scale.set(1, 1.25, 1);   // the great red lantern
  lmCyl(g, .03, .03, .012, JP.black, 0, .04, .95, 12); lmCyl(g, .03, .03, .012, JP.black, 0, .155, .95, 12);
  // Nakamise: two rows of little shops with red-white fronts
  for (let k = 0; k < 8; k++) for (const s of [-1, 1]) {
    const z = .8 - k * .1;
    lmBox(g, .09, .05, .085, lmMaterial(0xf0e6d4, { map: TEXTURES.lit }), s * .12, 0, z);
    lmHip(g, .02, .06, .02, JP.tileRed, s * .12, .05, z, .9);
  }
  // Hozomon and its lanterns
  gate(-.05, .34, .1, true);
  lmAdd(g, new THREE.SphereGeometry(.035, 14, 10), lantern, 0, .09, -.05).scale.set(1, 1.2, 1);
  // the main hall, the pagoda to the west, incense burner
  templeHall(g, { z: -.6, w: .5, d: .35, h: .12, roofH: .22, pillar: JP.vermilion, wall: JP.vermilion, roof: JP.tileDark, cols: 7 });
  pagoda5(g, { x: -.42, z: -.1, half: .05, storeyH: .085 });
  lmCyl(g, .025, .03, .04, JP.bronze, 0, 0, -.3, 10); lmHip(g, .005, .035, .02, JP.bronze, 0, .04, -.3);
  return mergeByMaterial(g);
};

// Kiyomizu-dera: the main hall with its huge cypress-bark roof on the hillside, the wooden stage jutting out over the valley
// on a lattice of 18 m pillars, the vermilion three-storey pagoda and Niomon gate above, autumn maples all round
LANDMARK_BUILDERS.kiyomizu = () => {
  const g = new THREE.Group();
  const bark = lmMaterial(0x6a4a3a, { roughness: .9 }), wood = lmMaterial(0x8a6448, { map: TEXTURES.wood }), maple = lmMaterial(0xd2502a, { roughness: 1 }), mapleGold = lmMaterial(0xe0a030, { roughness: 1 });
  // the hillside dropping away to the front (+z)
  const hill = new THREE.PlaneGeometry(2.2, 2, 30, 30).rotateX(-Math.PI / 2), hp = hill.attributes.position;
  const ground = (x, z) => Math.max(0, .28 - Math.max(0, z + .05) * .9) + .03 * Math.sin(x * 4);
  for (let i = 0; i < hp.count; i++) hp.setY(i, ground(hp.getX(i), hp.getZ(i)));
  hill.computeVertexNormals();
  lmAdd(g, hill, lmMaterial(0x4f7a40, { roughness: 1 }), 0, 0, 0);
  // the main hall (hondo): wide hall under a vast curved roof
  templeHall(g, { y: .28, z: -.25, w: .6, d: .4, h: .1, roofH: .2, pillar: wood, wall: wood, roof: bark, base: wood, cols: 8 });
  // the stage over the drop, on a grid of tall pillars with tie beams
  const sy = .3, sz0 = -.03, sz1 = .2;
  lmBox(g, .5, .015, sz1 - sz0, wood, 0, sy, (sz0 + sz1) / 2);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
    const px = -.23 + i * .092, pz = sz0 + .02 + j * (sz1 - sz0 - .04) / 3, gy = ground(px, pz);
    lmCyl(g, .008, .008, sy - gy, wood, px, gy, pz, 6);
  }
  for (let level = 0; level < 4; level++) {
    const y = .08 + level * .055;
    for (let j = 0; j < 4; j++) lmBox(g, .48, .008, .008, wood, 0, y, sz0 + .02 + j * (sz1 - sz0 - .04) / 3);
    for (let i = 0; i < 6; i++) lmBox(g, .008, .008, sz1 - sz0 - .04, wood, -.23 + i * .092, y, (sz0 + sz1) / 2);
  }
  balustrade(g, -.25, sz1, .25, sz1, { y: sy + .015, h: .025, material: wood, spacing: .02 });
  // the vermilion three-storey pagoda and the Niomon gate up the hill
  pagoda5(g, { x: .55, z: -.5, y: ground(.55, -.5), half: .045, storeyH: .085, levels: 3, roof: bark });
  templeHall(g, { x: -.55, z: -.6, y: ground(-.55, -.6), w: .22, d: .12, h: .08, roofH: .1, pillar: JP.vermilion, wall: JP.vermilion, roof: bark, cols: 4 });
  // maples blazing red and gold
  let seed = 3; const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let k = 0; k < 40; k++) {
    const x = (random() - .5) * 2, z = (random() - .5) * 1.8;
    if (Math.abs(x) < .4 && z > -.5 && z < .3) continue;
    const y = ground(x, z);
    lmCyl(g, .005, .007, .04, TW.trunk, x, y, z, 5);
    lmAdd(g, roughMass(.05, .04, .05, { seed: k, jitter: .3, detail: 1 }), k % 3 ? maple : mapleGold, x, y + .06, z);
  }
  return mergeByMaterial(g);
};

// Kinkaku-ji: the three-storey Golden Pavilion — the lower storey natural wood with white panels, the upper two covered in
// gold leaf — under cypress-bark roofs with the golden phoenix on top, reflected in the Mirror Pond with its pine islets
LANDMARK_BUILDERS.pavilion = () => {
  const g = new THREE.Group();
  const gold = lmMaterial(0xf2c83a, { metalness: .7, roughness: .32, emissive: 0x7a5400, emissiveIntensity: .035 });
  const bark = lmMaterial(0x4a3a30, { roughness: .9 }), wood = lmMaterial(0x8a7058, { map: TEXTURES.wood });
  lmBox(g, 2.2, .01, 2, JP.moss, 0, 0, 0);
  const pond = new THREE.Shape(); for (let i = 0; i <= 40; i++) { const a = i / 40 * Math.PI * 2, r = .8 + .1 * Math.sin(a * 3) + .06 * Math.cos(a * 5); i ? pond.lineTo(Math.cos(a) * r, Math.sin(a) * r * .8) : pond.moveTo(Math.cos(a) * r, Math.sin(a) * r * .8); }
  lmAdd(g, new THREE.ShapeGeometry(pond).rotateX(-Math.PI / 2), lmMaterial(0x3a6a5a, { roughness: .08, metalness: .3 }), 0, .012, 0);
  // the pavilion stands at the north edge of the pond
  const px = 0, pz = 0, w = .3, d = .24;
  const pav = new THREE.Group(); pav.position.set(0, 0, -.42); pav.scale.setScalar(1.6); g.add(pav);
  lmBox(pav, w + .06, .02, d + .06, JP.stone, px, .01, pz);
  // first storey: wooden posts, white shutters, open veranda
  lmBox(pav, w, .09, d, lmMaterial(0xf2ece0), px, .03, pz);
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) lmCyl(pav, .005, .005, .09, wood, px - w / 2 + i * w / 5, .03, pz + s * d / 2, 6);
  lmHip(pav, w * .4, w * .62, .03, bark, px, .12, pz, d / w);
  // second and third storeys in gold
  lmBox(pav, w * .92, .08, d * .92, gold, px, .15, pz);
  balustrade(pav, px - w * .48, pz + d * .48, px + w * .48, pz + d * .48, { y: .15, h: .02, material: gold, spacing: .02 });
  lmHip(pav, w * .36, w * .6, .035, bark, px, .23, pz, d / w);
  lmBox(pav, w * .62, .07, w * .62, gold, px, .265, pz);
  lmHip(pav, .005, w * .5, .09, bark, px, .335, pz);
  // the golden phoenix
  lmAdd(pav, new THREE.ConeGeometry(.01, .04, 6), gold, px, .44, pz);
  lmAdd(pav, new THREE.SphereGeometry(.012, 8, 6), gold, px, .46, pz).scale.set(1.6, .6, .6);
  // its reflection in the pond (an upside-down echo of the gold storeys)
  const reflection = lmMaterial(0xc8a438, { metalness: .5, roughness: .4, transparent: true, opacity: .45 });
  lmBox(g, w * 1.5, .13, .002, reflection, px, .014, -.42 + d * .8 + .12).rotation.x = -Math.PI / 2;
  // pine islets in the pond and pines round the shore
  for (const [x, z, r] of [[.3, .1, .1], [-.25, .2, .08], [.05, .35, .06]]) { lmAdd(g, roughMass(r, .025, r * .8, { seed: x * 30, jitter: .2 }), lmMaterial(0x6a7a4a, { roughness: 1 }), x, .012, z); gardenPine(g, x, z, .6); }
  pinesAround(g, 16, .9, 1.0, 21);
  return mergeByMaterial(g);
};

// Fushimi Inari Taisha: the vermilion two-storey Romon gate and main shrine at the foot of Mount Inari, and the famous
// Senbon Torii — thousands of vermilion gates in two parallel tunnels winding up the wooded mountain
LANDMARK_BUILDERS.toriiRow = () => {
  const g = new THREE.Group();
  const black = JP.black, ver = JP.vermilion;
  const hillAt = (x, z) => Math.max(0, .5 * Math.exp(-((x + .1) ** 2 + (z + .6) ** 2) / .5));
  const hill = new THREE.PlaneGeometry(2.2, 2.2, 30, 30).rotateX(-Math.PI / 2), hp = hill.attributes.position;
  for (let i = 0; i < hp.count; i++) hp.setY(i, hillAt(hp.getX(i), hp.getZ(i)));
  hill.computeVertexNormals();
  lmAdd(g, hill, lmMaterial(0x3f6e3a, { roughness: 1 }), 0, 0, 0);
  // the cedar forest
  let seed = 5; const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let k = 0; k < 70; k++) { const x = (random() - .5) * 2, z = (random() - .5) * 2; if (Math.abs(z - .1 - Math.sin(x * 3) * .1) < .1 || z > .55) continue; const y = hillAt(x, z); lmCyl(g, .006, .008, .06, TW.trunk, x, y, z, 5); lmAdd(g, new THREE.ConeGeometry(.04, .16, 7), k % 2 ? JP.pine : TW.leafDark, x, y + .12, z); }
  // two tunnels of torii, gate after gate, winding up the slope
  const torii = (x, z, yaw, s) => {
    const holder = new THREE.Group(); holder.position.set(x, hillAt(x, z), z); holder.rotation.y = yaw; holder.scale.setScalar(s); g.add(holder);
    for (const side of [-1, 1]) { lmCyl(holder, .006, .007, .1, ver, side * .03, 0, 0, 6); lmCyl(holder, .008, .008, .01, black, side * .03, 0, 0, 6); }
    lmAdd(holder, curvedBeam(.085, .008, .012, .004), black, 0, .102, 0);
    lmBox(holder, .07, .006, .01, ver, 0, .08, 0);
  };
  for (const offset of [-.035, .035]) for (let k = 0; k < 70; k++) {
    const t = k / 69, x = -.9 + t * 1.6, z = .1 + Math.sin(x * 3) * .1 + offset - t * .5 * (x > .2 ? 1 : 0);
    const dx = 1.6 / 69, dz = Math.cos(x * 3) * .3 * dx;
    torii(x, z, -Math.atan2(dz, dx) + Math.PI / 2, 1);
  }
  // the Romon gate and the main hall at the foot, with a fox guardian each side
  templeHall(g, { x: .2, z: .75, w: .32, d: .14, h: .11, roofH: .12, pillar: ver, wall: ver, roof: JP.tileDark, double: true, cols: 4 });
  templeHall(g, { x: .2, z: .45, w: .36, d: .22, h: .09, roofH: .13, pillar: ver, wall: lmMaterial(0xf2ece0), roof: JP.tileDark, cols: 6 });
  for (const s of [-1, 1]) { lmBox(g, .04, .05, .04, JP.stone, .2 + s * .22, 0, .85); lmAdd(g, new THREE.ConeGeometry(.014, .05, 6), lmMaterial(0xe8e4d8), .2 + s * .22, .075, .85); }
  return mergeByMaterial(g);
};

// Todai-ji: the vast Daibutsuden — the world's largest wooden building — two storeys under a huge hipped roof with golden
// horn ornaments (shibi) and a curved karahafu window gable, its bronze lantern and courtyard, and the Nandaimon gate
LANDMARK_BUILDERS.daibutsuden = () => {
  const g = new THREE.Group();
  const wood = lmMaterial(0x8a5a3a, { map: TEXTURES.wood }), white = lmMaterial(0xf2ece0), roof = lmMaterial(0x4a4e52, { map: TEXTURES.tiles });
  lmBox(g, 2.2, .006, 2.2, JP.gravel, 0, 0, 0);
  // the hall
  const w = .9, d = .62;
  lmBox(g, w * 1.1, .03, d * 1.15, JP.stone, 0, 0, -.3);
  lmBox(g, w, .14, d, white, 0, .03, -.3);
  for (let i = 0; i <= 10; i++) for (const s of [-1, 1]) lmCyl(g, .008, .009, .14, wood, -w / 2 + i * w / 10, .03, -.3 + s * d / 2, 8);
  for (let i = 0; i < 10; i++) lmBox(g, w / 10 * .7, .07, .005, lmMaterial(0x5a3a28), -w / 2 + (i + .5) * w / 10, .06, -.3 + d / 2 + .003);   // the latticed doors
  lmHip(g, w * .42, w * .62, .06, roof, 0, .17, -.3, d / w);
  lmBox(g, w * .8, .11, d * .78, white, 0, .2, -.3);
  for (let i = 0; i <= 8; i++) lmCyl(g, .007, .008, .11, wood, -w * .4 + i * w * .1, .2, -.3 + d * .39, 8);
  curvedGableAt(g, { x: 0, y: .23, z: -.3 + d * .4, width: .22, height: .1, depth: .05, material: roof });     // the karahafu over the Buddha's window
  lmBox(g, .14, .05, .006, lmMaterial(0xf2ece0), 0, .24, -.3 + d * .42 + .01);
  const top = irimoya(g, { y: .31, z: -.3, w: w * .86, d: d * .82, h: .26, material: roof });
  for (const s of [-1, 1]) { lmAdd(g, new THREE.ConeGeometry(.02, .06, 6), JP.gold, s * w * .3, top + .02, -.3).rotation.z = -s * .4; }   // the golden shibi
  // the great bronze lantern in front
  lmCyl(g, .02, .025, .05, JP.bronze, 0, 0, .25, 8); lmAdd(g, octagonPrism(.03, .05), JP.bronze, 0, .075, .25); lmAdd(g, octagonRoof(.05, .01, .03), JP.bronze, 0, .1, .25);
  // the cloister walls and the Nandaimon (great south gate) with its double roof
  for (const s of [-1, 1]) { lmBox(g, .04, .08, 1.0, white, s * .8, 0, .1); lmHip(g, .02, .05, .03, roof, s * .8, .08, .1, 12); }
  lmBox(g, 1.6, .08, .04, white, 0, 0, .6); lmHip(g, .02, .05, .03, roof, 0, .08, .6, .1, Math.PI / 2);
  // deer on the lawn
  for (let k = 0; k < 6; k++) { const x = -.6 + k * .25, z = .4 + (k % 2) * .25; lmBox(g, .03, .015, .012, lmMaterial(0x9a6a40), x, .015, z); for (const dx of [-.01, .01]) lmBox(g, .003, .015, .003, lmMaterial(0x9a6a40), x + dx, 0, z); lmBox(g, .008, .015, .008, lmMaterial(0x9a6a40), x + .016, .025, z); }
  return mergeByMaterial(g);
};

// Itsukushima Shrine: the great vermilion O-torii standing in the sea, with its four supporting legs, black caps and plaque,
// and behind it the shrine's vermilion halls and corridors raised on piles over the water, Mount Misen behind
LANDMARK_BUILDERS.toriiGreat = () => {
  const g = new THREE.Group();
  const ver = JP.vermilion, black = JP.black;
  // the great torii (the model's tallest part, standing on the sea at y = 0)
  const tz = .5, span = .58, H = .5;
  for (const s of [-1, 1]) {
    lmCyl(g, .032, .036, H, ver, s * span / 2, 0, tz, 12);
    lmCyl(g, .038, .038, .03, black, s * span / 2, 0, tz, 12);
    for (const o of [-1, 1]) { lmCyl(g, .016, .018, H * .55, ver, s * span / 2, 0, tz + o * .1, 8); lmBox(g, .02, .015, .2, ver, s * span / 2, H * .45, tz); }
  }
  lmAdd(g, curvedBeam(span + .22, .04, .07, .04), black, 0, H - .01, tz);
  lmAdd(g, curvedBeam(span + .18, .035, .06, .03), ver, 0, H - .045, tz);
  lmBox(g, span + .06, .03, .045, ver, 0, H * .72, tz);
  lmBox(g, .05, .1, .05, ver, 0, H * .74, tz);
  lmBox(g, .045, .08, .005, lmMaterial(0x1a2a5a), 0, H * .76, tz + .028);
  // the shrine on piles behind, its corridors zigzagging over the water
  const ground = lmMaterial(0x5a6a4a, { roughness: 1 });
  lmAdd(g, roughMass(1.2, .5, .5, { seed: 3, jitter: .15 }), ground, 0, 0, -1.2);                         // Mount Misen
  for (let k = 0; k < 20; k++) lmAdd(g, roughMass(.08, .07, .08, { seed: 50 + k, jitter: .3, detail: 1 }), k % 2 ? JP.pine : TW.leaf, -1 + k * .1, .15 + Math.sin(k) * .05, -.85);
  const deck = lmMaterial(0x8a6a4a, { map: TEXTURES.wood });
  const corridor = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(-(z1 - z0), x1 - x0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    lmBox(g, len, .01, .06, deck, cx, .03, cz, yaw);
    const n = Math.round(len / .05);
    for (let i = 0; i <= n; i++) { const t = i / n, px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t; for (const o of [-.025, .025]) { lmCyl(g, .003, .003, .03, ver, px - Math.sin(-yaw) * o, 0, pz + Math.cos(yaw) * o, 5); lmCyl(g, .003, .003, .05, ver, px - Math.sin(-yaw) * o, .04, pz + Math.cos(yaw) * o, 5); } }
    lmHip(g, .01, .045, .02, JP.tileDark, cx, .09, cz, len / .09, yaw + Math.PI / 2);
  };
  corridor(-.8, -.2, -.3, -.2); corridor(.3, -.2, .8, -.2); corridor(-.8, -.2, -.8, -.6); corridor(.8, -.2, .8, -.6);
  templeHall(g, { z: -.4, w: .5, d: .26, h: .07, roofH: .12, pillar: ver, wall: lmMaterial(0xf2ece0), roof: lmMaterial(0x8a6a50, { roughness: .9 }), base: deck, cols: 7 });
  templeHall(g, { z: -.12, w: .3, d: .14, h: .05, roofH: .07, pillar: ver, wall: ver, roof: lmMaterial(0x8a6a50, { roughness: .9 }), base: deck, cols: 5 });   // the noh stage / haraiden
  lmBox(g, .4, .01, .3, deck, 0, .03, -.15);
  return mergeByMaterial(g);
};

// Goryokaku: the five-pointed star fort — grassy ramparts faced with stone, the star-shaped moat around them, cherry trees
// along the walls, the white Hakodate Magistrate's Office with its drum tower inside, and Goryokaku Tower with its
// pentagonal shaft and star-shaped glass observation decks
function starShape(rOuter, rInner, points = 5, rotate = -Math.PI / 2) {
  const shape = new THREE.Shape();
  for (let k = 0; k <= points * 2; k++) { const a = k / (points * 2) * Math.PI * 2 + rotate, r = k % 2 ? rInner : rOuter; k ? shape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  return shape;
}
LANDMARK_BUILDERS.fort = () => {
  const g = new THREE.Group();
  const flat = (shape, material, y) => lmAdd(g, new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), material, 0, y, 0);
  lmBox(g, 3.4, .01, 3.4, JP.moss, 0, 0, 0);
  flat(starShape(1.5, .95), JP.water, .012);                                     // the moat
  lmAdd(g, new THREE.ExtrudeGeometry(starShape(1.32, .8), { depth: .05, bevelEnabled: true, bevelSize: .03, bevelThickness: .02, bevelSegments: 2 }).rotateX(-Math.PI / 2), JP.stone, 0, .0, 0);   // stone-faced ramparts
  flat(starShape(1.3, .78), lmMaterial(0x6aa04e, { roughness: 1 }), .072);
  // cherry trees round the star
  for (let k = 0; k < 10; k++) for (let j = 0; j < 5; j++) {
    const a = k / 10 * Math.PI * 2 - Math.PI / 2, r = k % 2 ? .72 : 1.12, along = (j - 2) * .07;
    const x = Math.cos(a) * (r - .06) - Math.sin(a) * along, z = Math.sin(a) * (r - .06) + Math.cos(a) * along;
    lmCyl(g, .006, .008, .04, TW.trunk, x, .07, z, 5); lmAdd(g, roughMass(.045, .035, .045, { seed: k * 5 + j, jitter: .3, detail: 1 }), JP.sakura, x, .13, z);
  }
  // the magistrate's office: a long white hall with a grey roof and the taiko drum tower on top
  lmBox(g, .5, .07, .2, JP.plaster, 0, .07, .1); for (let i = 0; i < 9; i++) lmBox(g, .006, .07, .006, JP.blackWood, -.24 + i * .06, .07, .201);
  lmHip(g, .12, .3, .06, JP.tileGrey, 0, .14, .1, .55);
  lmBox(g, .06, .05, .06, JP.plaster, 0, .19, .1); lmHip(g, .005, .05, .04, JP.tileGrey, 0, .24, .1);
  // Goryokaku Tower outside the north-west point
  const tx = -.95, tz = -1.2;
  const shaft = starShape(.07, .05, 5);
  lmAdd(g, new THREE.ExtrudeGeometry(shaft, { depth: .75, bevelEnabled: false }).rotateX(-Math.PI / 2), JP.white, tx, 0, tz);
  for (let k = 0; k < 2; k++) {
    lmAdd(g, new THREE.ExtrudeGeometry(starShape(.17, .12), { depth: .05, bevelEnabled: false }).rotateX(-Math.PI / 2), JP.darkGlass, tx, .75 + k * .06, tz);
    lmAdd(g, new THREE.ExtrudeGeometry(starShape(.175, .125), { depth: .012, bevelEnabled: false }).rotateX(-Math.PI / 2), JP.white, tx, .8 + k * .06, tz);
  }
  lmAdd(g, new THREE.ExtrudeGeometry(starShape(.12, .08), { depth: .05, bevelEnabled: false }).rotateX(-Math.PI / 2), JP.white, tx, .88, tz);
  lmCyl(g, .004, .008, .1, JP.white, tx, .93, tz, 6);
  lmBox(g, .3, .05, .2, lmMaterial(0xe8e6de, { map: TEXTURES.windows }), tx, 0, tz + .05);
  return mergeByMaterial(g);
};

// Churaumi Aquarium: the long cream building stepping down toward the East China Sea under broad, deeply overhanging white
// roof slabs on slim columns, the glass entrance hall, the plaza with its whale-shark sculpture, palms, and Iejima on the horizon
LANDMARK_BUILDERS.aquarium = () => {
  const g = new THREE.Group();
  const cream = lmMaterial(0xece4d2, { map: TEXTURES.windows }), roofWhite = lmMaterial(0xf6f4ee), glassBlue = lmMaterial(0x6aa6c8, { metalness: .4, roughness: .15 });
  // the slope down to the sea (toward +z) and the beach
  lmBox(g, 2.6, .01, 2, lmMaterial(0x6aa04e, { roughness: 1 }), 0, 0, -.3);
  lmBox(g, 2.6, .006, .3, lmMaterial(0xf0e2bc, { roughness: 1 }), 0, 0, .8);
  // three stepped wings
  [[0, -.55, .28, 1.4, .5], [0, -.05, .2, 1.2, .45], [0, .4, .12, 1.0, .35]].forEach(([x, z, h, w, d]) => {
    lmBox(g, w * .9, h, d * .8, cream, x, 0, z);
    lmBox(g, w * .9, h * .7, .006, glassBlue, x, 0, z + d * .4 + .003);
    lmBox(g, w, .025, d, roofWhite, x, h, z);                                      // the overhanging roof slab
    for (let i = 0; i < 8; i++) lmCyl(g, .006, .006, h, roofWhite, x - w * .46 + i * w * .131, 0, z + d * .47, 6);
  });
  // the whale-shark sculpture in the plaza and the big tank window
  const shark = lmMaterial(0x5a6a7a, { roughness: .6 }), spots = lmMaterial(0xe8eef2);
  lmAdd(g, new THREE.SphereGeometry(.12, 16, 10), shark, .5, .08, .62).scale.set(1.6, .45, .55);
  lmAdd(g, new THREE.ConeGeometry(.05, .12, 6).rotateZ(Math.PI / 2), shark, .73, .09, .62);
  lmAdd(g, new THREE.ConeGeometry(.03, .07, 4), shark, .48, .15, .62);
  for (let k = 0; k < 10; k++) lmAdd(g, new THREE.SphereGeometry(.008, 6, 4), spots, .4 + (k % 5) * .05, .1 + Math.floor(k / 5) * .02, .62 + .065);
  lmBox(g, .5, .16, .006, lmMaterial(0x1a6aa8, { emissive: 0x0a4a88, emissiveIntensity: .4, roughness: .1 }), -.3, .02, -.05 + .2);
  for (let k = 0; k < 12; k++) palmAt(g, -1.1 + k * .2, .55 + (k % 2) * .1, .3, .01);
  return mergeByMaterial(g);
};

// Jomon Sugi: the ancient cedar of Yakushima — an enormously thick, fluted and burled trunk splitting into a few massive
// crooked limbs with clouds of dark needles, ferns and moss at its foot, the wooden viewing deck, younger cedars around
LANDMARK_BUILDERS.tree = () => {
  const g = new THREE.Group();
  const bark = new THREE.Color(0x7a5a44), barkDark = new THREE.Color(0x4a3628), mossy = new THREE.Color(0x5a7a3a);
  const barkMaterial = lmMaterial(0xffffff, { vertexColors: true, roughness: 1 });
  const trunk = loftedRock([[0, -.3, .3], [.06, -.2, .2], [.15, -.16, .17], [.3, -.15, .15], [.42, -.15, .16], [.5, -.13, .12], [.56, -.08, .08]], {
    segments: 40, steps: 50, depthRatio: () => .9, wobble: .12, seed: 4,
    colourAt: (c, y, a, x, z) => { const fluting = .5 + .5 * Math.sin(a * 14 + y * 6); c.copy(barkDark).lerp(bark, fluting).lerp(mossy, Math.max(0, .2 - y) * 2.5 * (.5 + .5 * Math.sin(a * 5))); }
  });
  lmAdd(g, trunk, barkMaterial, 0, 0, 0);
  // the great limbs and their needle clouds
  const limbMaterial = lmMaterial(0x5e4636, { roughness: 1 }), needles = lmMaterial(0x2c4a2c, { roughness: 1 }), needles2 = lmMaterial(0x3a5a34, { roughness: 1 });
  const limbs = [[[0, .5, 0], [-.3, .75, .1], [-.45, .82, .05]], [[0, .52, 0], [.25, .7, -.12], [.4, .78, -.05]], [[0, .55, 0], [.05, .85, .2], [.1, .95, .15]], [[0, .53, 0], [-.1, .8, -.25], [-.2, .9, -.3]]];
  limbs.forEach((points, k) => {
    const v = points.map((p) => new THREE.Vector3(...p));
    for (let i = 0; i < v.length - 1; i++) limb(g, limbMaterial, v[i], v[i + 1], .06 - i * .02);
    const tip = v[v.length - 1];
    for (let j = 0; j < 4; j++) lmAdd(g, roughMass(.12, .06, .12, { seed: k * 10 + j, jitter: .3, detail: 1 }), j % 2 ? needles : needles2, tip.x + (j - 1.5) * .07, tip.y + (j % 2) * .04, tip.z + Math.sin(j) * .06);
  });
  // ferns and moss, the deck, and younger cedars around
  for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2, d = .35 + (k % 3) * .08; lmAdd(g, roughMass(.05, .02, .05, { seed: 200 + k, jitter: .4, detail: 1 }), k % 2 ? JP.moss : lmMaterial(0x4a8a3a, { roughness: 1 }), Math.cos(a) * d, .01, Math.sin(a) * d); }
  const deckWood = lmMaterial(0x8a6a4a, { map: TEXTURES.wood });
  lmBox(g, .5, .015, .16, deckWood, 0, .06, .55);
  for (const x of [-.24, .24]) for (const z of [.48, .62]) lmCyl(g, .008, .008, .06, deckWood, x, 0, z, 6);
  balustrade(g, -.25, .48, .25, .48, { y: .075, h: .04, material: deckWood, spacing: .05 });
  for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2 + .2, d = .9 + (k % 3) * .12; const x = Math.cos(a) * d, z = Math.sin(a) * d; lmCyl(g, .015, .022, .5, TW.trunk, x, 0, z, 6); lmAdd(g, new THREE.ConeGeometry(.1, .4, 8), k % 2 ? needles : needles2, x, .55, z); }
  return mergeByMaterial(g);
};

// Nagasaki Peace Statue: the 9.7 m seated figure in blue-green bronze — a broad muscular torso, right arm raised straight up
// pointing at the sky, left arm stretched out level, right leg folded and left foot planted, eyes closed — on a tall granite plinth
LANDMARK_BUILDERS.statue = () => {
  const g = new THREE.Group();
  const bronze = lmMaterial(0x6a9a96, { metalness: .45, roughness: .45 }), granite = lmMaterial(0xd6d0c4, { map: TEXTURES.stone });
  lmBox(g, 1.6, .01, 1.6, JP.gravel, 0, 0, 0);
  lmBox(g, .7, .05, .5, granite, 0, 0, 0); lmBox(g, .6, .3, .4, granite, 0, .05, 0);
  const fig = new THREE.Group(); fig.position.set(0, .35, 0); g.add(fig);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  lmAdd(fig, new THREE.BoxGeometry(.24, .06, .2), granite, 0, .03, -.02);       // the rock seat
  // torso: a lathed chest broad at the shoulders
  const torso = [[.001, 0], [.1, 0], [.11, .08], [.12, .16], [.135, .23], [.12, .27], [.05, .29], [.001, .29]];
  lmAdd(fig, new THREE.LatheGeometry(torso.map(([r, y]) => new THREE.Vector2(r, y)), 20), bronze, 0, .06, -.02).scale.z = .65;
  lmCyl(fig, .03, .035, .04, bronze, 0, .35, -.02, 10);
  lmAdd(fig, new THREE.SphereGeometry(.055, 16, 12), bronze, 0, .41, -.01).scale.set(.9, 1.1, .95);
  lmAdd(fig, new THREE.SphereGeometry(.057, 16, 10, 0, Math.PI * 2, 0, Math.PI * .5), lmMaterial(0x5a8a86, { metalness: .45, roughness: .5 }), 0, .425, -.02);   // wavy hair
  // right arm raised to the sky, left arm stretched out level
  limb(fig, bronze, V(-.12, .31, -.02), V(-.14, .46, -.02), .035); limb(fig, bronze, V(-.14, .46, -.02), V(-.14, .62, -.03), .03);
  lmAdd(fig, new THREE.CapsuleGeometry(.012, .04, 4, 8), bronze, -.14, .66, -.03);
  limb(fig, bronze, V(.12, .31, -.02), V(.26, .31, .05), .035); limb(fig, bronze, V(.26, .31, .05), V(.42, .31, .1), .03);
  lmAdd(fig, new THREE.BoxGeometry(.06, .015, .04), bronze, .46, .31, .11);
  // the legs: right leg folded under, left foot planted forward, a drape over the lap
  limb(fig, bronze, V(-.07, .08, .02), V(-.1, .08, .2), .05); limb(fig, bronze, V(-.1, .08, .2), V(.02, .02, .2), .04);
  limb(fig, bronze, V(.07, .08, .02), V(.12, .1, .2), .05); limb(fig, bronze, V(.12, .1, .2), V(.13, -.18, .24), .042);
  lmAdd(fig, new THREE.BoxGeometry(.06, .025, .1), bronze, .13, -.2, .27);
  lmAdd(fig, new THREE.SphereGeometry(.13, 14, 8), lmMaterial(0x5e8e8a, { metalness: .4, roughness: .5 }), 0, .09, .08).scale.set(1.1, .35, .9);
  // the fountain lawn in front, trees behind
  lmBox(g, .8, .012, .4, JP.water, 0, 0, .55);
  for (let k = 0; k < 10; k++) { const x = -.7 + k * .155; lmCyl(g, .008, .01, .08, TW.trunk, x, 0, -.6, 5); lmAdd(g, roughMass(.08, .07, .08, { seed: k, jitter: .3, detail: 1 }), TW.leaf, x, .14, -.6); }
  return mergeByMaterial(g);
};

// Shirakawa-go: steep gassho-zukuri farmhouses with thick thatched A-frame roofs, gable ends of dark timber with rows of
// small paper windows, set among rice paddies with water and golden crops, the Shogawa river and forested mountains
LANDMARK_BUILDERS.gassho = () => {
  const g = new THREE.Group();
  const timber = lmMaterial(0x4a3426, { map: TEXTURES.wood }), shoji = lmMaterial(0xf2ead4, { emissive: 0xffd080, emissiveIntensity: .05 });
  const house = (x, z, yaw, s) => {
    const holder = new THREE.Group(); holder.position.set(x, 0, z); holder.rotation.y = yaw; holder.scale.setScalar(s); g.add(holder);
    const w = .3, l = .5, wallH = .08, roofH = .32;
    lmBox(holder, w, wallH, l, timber, 0, 0, 0);
    const tri = new THREE.Shape([new THREE.Vector2(-w / 2 - .04, 0), new THREE.Vector2(w / 2 + .04, 0), new THREE.Vector2(0, roofH)]);
    // Thick thatch is a hollow roof shell, exposing the timber gable below it.
    tri.holes.push(new THREE.Path([new THREE.Vector2(-w / 2 + .012, .008), new THREE.Vector2(0, roofH - .045), new THREE.Vector2(w / 2 - .012, .008)]));
    const thatchRoof = lmAdd(holder, new THREE.ExtrudeGeometry(tri, { depth: l + .06, bevelEnabled: true, bevelThickness: .01, bevelSize: .02, bevelSegments: 2 }).translate(0, 0, -(l + .06) / 2), JP.thatch, 0, wallH, 0);
    for (const side of [-1, 1]) {                                                  // the timber gable ends with three rows of windows
      const inner = new THREE.Shape([new THREE.Vector2(-w / 2 + .01, 0), new THREE.Vector2(w / 2 - .01, 0), new THREE.Vector2(0, roofH - .04)]);
      lmAdd(holder, new THREE.ShapeGeometry(inner), timber, 0, wallH, side * (l / 2 + .032)).rotation.y = side > 0 ? 0 : Math.PI;
      for (let row = 0; row < 3; row++) { const ww = (w - .06) * (1 - row * .3); lmBox(holder, ww, .025, .004, shoji, 0, wallH + .03 + row * .08, side * (l / 2 + .035)); }
      lmBox(holder, w * .6, .04, .004, shoji, 0, .02, side * (l / 2 + .002));
    }
    lmBox(holder, .02, .02, l + .1, JP.thatchDark, 0, wallH + roofH + .005, 0);    // the ridge
    return thatchRoof;
  };
  // paddies: water and golden crop plots on terraces, the river, forested mountains
  lmBox(g, 2.6, .01, 2.4, JP.moss, 0, 0, 0);
  for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) lmBox(g, .4, .006, .3, (i + j) % 3 ? lmMaterial(0xd8b84a, { roughness: 1 }) : lmMaterial(0x6a9ab0, { roughness: .1, metalness: .2 }), -1 + i * .45, .01, -.7 + j * .4);
  lmBox(g, 2.6, .012, .2, lmMaterial(0x4a90a8, { roughness: .1, metalness: .2 }), 0, .005, 1.05);
  for (let k = 0; k < 5; k++) lmAdd(g, roughMass(.6, .5, .4, { seed: k, jitter: .15 }), lmMaterial(0x355f35, { roughness: 1 }), -1.2 + k * .6, .1, -1.5);
  [[-.6, -.4, .2, 1], [.1, -.5, -.1, 1.1], [.7, -.2, .3, .9], [-.3, .3, 0, 1], [.5, .45, -.2, .95], [-.9, .5, .4, .85]].forEach(([x, z, yaw, s]) => house(x, z, yaw, s));
  return mergeByMaterial(g);
};

// Nikko Toshogu: the Yomeimon — a two-storey white gate crusted with gilded and painted carvings, layers of coloured brackets,
// a balcony with a gold railing and a curved roof with gilded ridge ends — at the top of stone steps, the black-and-gold
// Karamon and main hall behind, the vermilion five-storey pagoda, the great stone torii and the cedar avenue
LANDMARK_BUILDERS.toshogu = () => {
  const g = new THREE.Group();
  const carved = lmMaterial(0xffffff, { map: patternTexture((c, s) => {                  // white lacquer crusted with gilt and colour
    c.fillStyle = '#f4f2ea'; c.fillRect(0, 0, s, s);
    for (let k = 0; k < 40; k++) { c.fillStyle = ['#d8a830', '#2a7a6a', '#c8402a', '#3a5aa8'][k % 4]; c.beginPath(); c.arc((k * 37) % s, (k * 61) % s, s / 28, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#d8a830'; c.fillRect(0, 0, s, s / 16); c.fillRect(0, s - s / 16, s, s / 16);
  }), roughness: .5 });
  const brackets = lmMaterial(0xffffff, { map: patternTexture((c, s) => { for (let k = 0; k < 8; k++) { c.fillStyle = ['#2a7a6a', '#d8a830', '#3a5aa8', '#c8402a'][k % 4]; c.fillRect(0, k * s / 8, s, s / 8); } c.fillStyle = 'rgba(0,0,0,.35)'; for (let k = 0; k < 8; k++) c.fillRect(k * s / 8, 0, 2, s); }) });
  const blackLacquer = lmMaterial(0x1a1a1c, { roughness: .3, metalness: .2 }), roof = lmMaterial(0x2e3236, { map: TEXTURES.tiles, roughness: .5 });
  lmBox(g, 2.4, .01, 2.6, JP.gravel, 0, 0, 0);
  // the cedar avenue and the stone torii at the bottom
  for (let k = 0; k < 9; k++) for (const s of [-1, 1]) { const z = .2 + k * .1, x = s * (.5 + (k % 2) * .06); lmCyl(g, .01, .013, .16, TW.trunk, x, 0, z, 6); lmAdd(g, new THREE.ConeGeometry(.045, .2, 8), JP.pine, x, .24, z); }
  const stoneTorii = lmMaterial(0xb8b2a4);
  for (const s of [-1, 1]) lmCyl(g, .018, .02, .3, stoneTorii, s * .14, 0, .9, 10);
  lmAdd(g, curvedBeam(.4, .03, .04, .02), stoneTorii, 0, .3, .9); lmBox(g, .32, .02, .03, stoneTorii, 0, .24, .9);
  // the vermilion pagoda to the left of the approach
  pagoda5(g, { x: -.62, z: .45, half: .05, storeyH: .085, roof });
  // the terraces and the steps up to the Yomeimon
  lmBox(g, 1.4, .06, .9, JP.stone, 0, 0, -.5); lmBox(g, 1.0, .05, .6, JP.stone, 0, .06, -.6);
  stairFlight(g, { z: .05, w: .25, rise: .06, run: .1, steps: 6 }); stairFlight(g, { z: -.28, y: .06, w: .22, rise: .05, run: .08, steps: 5 });
  // Yomeimon: two storeys of white carved columns, coloured bracket layers, gold balcony, curved roof with karahafu ends
  const gz = -.38, gy = .11, gw = .3, gd = .16;
  for (const px of [-gw / 2, -gw / 6, gw / 6, gw / 2]) for (const pz of [-gd / 2, gd / 2]) lmCyl(g, .012, .012, .12, carved, px, gy, gz + pz, 10);
  lmBox(g, gw + .03, .035, gd + .03, brackets, 0, gy + .12, gz);
  lmBox(g, gw + .08, .01, gd + .08, blackLacquer, 0, gy + .155, gz);
  balustrade(g, -gw / 2 - .04, gz + gd / 2 + .04, gw / 2 + .04, gz + gd / 2 + .04, { y: gy + .165, h: .025, material: JP.gold, spacing: .02 });
  lmBox(g, gw * .85, .08, gd * .8, carved, 0, gy + .165, gz);
  lmBox(g, gw + .05, .04, gd + .05, brackets, 0, gy + .245, gz);
  irimoya(g, { y: gy + .285, z: gz, w: gw + .08, d: gd + .1, h: .16, material: roof, trim: JP.gold });
  for (const s of [-1, 1]) curvedGableAt(g, { x: s * (gw / 2 + .06), y: gy + .25, z: gz, width: gd, height: .06, depth: .02, material: JP.gold, yaw: Math.PI / 2 });
  // the white cloister walls with gilt panels either side of the gate
  for (const s of [-1, 1]) { lmBox(g, .4, .08, .04, carved, s * .38, .11, gz); lmHip(g, .02, .05, .03, roof, s * .38, .19, gz, 4, Math.PI / 2); }
  // Karamon and the honden behind
  lmBox(g, .14, .1, .08, blackLacquer, 0, .11, -.62); curvedGableAt(g, { x: 0, y: .21, z: -.58, width: .16, height: .07, depth: .08, material: roof });
  templeHall(g, { z: -.8, y: .11, w: .5, d: .2, h: .09, roofH: .14, pillar: blackLacquer, wall: lmMaterial(0x1e1e20, { map: TEXTURES.timber }), roof, cols: 7 });
  return mergeByMaterial(g);
};

// Reference-based Taiwan architecture. Photographs and source notes: taiwan-reference-data.js.
// The geometry stays stylised for the world map; architectural features follow the references.
function referencePlaque(g, text, x, y, z, w, h, colour = '#eee8d0', background = '#29352e') {
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=192;
  const ctx=canvas.getContext('2d');ctx.fillStyle=background;ctx.fillRect(0,0,768,192);
  ctx.fillStyle=colour;ctx.font='bold 112px "PingFang TC", "Microsoft JhengHei", sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,384,102,730);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
  lmAdd(g,new THREE.BoxGeometry(w,h,.003),lmMaterial(0xffffff,{map:texture,roughness:.8}),x,y+h/2,z);
}
function referenceArcade(g,{x=0,y=0,z=0,w,h,d=.024,n=5,yaw=0,material=TW.white}) {
  const shape=new THREE.Shape([new THREE.Vector2(-w/2,0),new THREE.Vector2(w/2,0),new THREE.Vector2(w/2,h),new THREE.Vector2(-w/2,h)]);
  const bay=w/n, radius=bay*.34, spring=h*.57;
  for(let i=0;i<n;i++) {
    const cx=-w/2+bay*(i+.5),hole=new THREE.Path();
    hole.moveTo(cx-radius,.003);hole.lineTo(cx+radius,.003);hole.lineTo(cx+radius,spring);
    hole.absarc(cx,spring,radius,0,Math.PI,false);hole.lineTo(cx-radius,.003);shape.holes.push(hole);
  }
  return lmAdd(g,new THREE.ExtrudeGeometry(shape,{depth:d,bevelEnabled:false,curveSegments:16}).translate(0,0,-d/2),material,x,y,z,yaw);
}
function blindRoof(g,{x=0,y,z=0,w,d,h}) {
  // 盝頂: four pitched green roof planes surrounding a genuinely flat upper terrace.
  const geometry=squareFrustum(w*.28,w*.5,h);geometry.scale(1,1,d/w);
  lmAdd(g,geometry,TW.tealTile,x,y+h/2,z);
  lmBox(g,w*.56,.005,d*.56,TW.tealTile,x,y+h,z);
  for(const side of [-1,1]) {
    lmBox(g,w*.58,.009,.009,TW.yellowTile,x,y+h,z+side*d*.28);
    lmBox(g,.009,.009,d*.58,TW.yellowTile,x+side*w*.28,y+h,z);
    lmBox(g,w*1.01,.009,.012,TW.yellowTile,x,y,z+side*d*.5);
  }
}
function whiteLantern(g,{x=0,y,z=0,r,lens}) {
  // Eluanbi's white corbelled gallery, narrow dark glazing bars and small dark cap.
  const holder=new THREE.Group();holder.position.set(x,y,z);g.add(holder);
  lmCyl(holder,r*1.48,r*.95,.035,TW.white,0,0,0,40);
  lmCyl(holder,r*1.55,r*1.55,.018,TW.white,0,.035,0,40);
  for(let k=0;k<32;k++) {
    const a=k/32*Math.PI*2;
    lmCyl(holder,.002,.002,.05,TW.white,Math.cos(a)*r*1.5,.05,Math.sin(a)*r*1.5,5);
    if(k%4===0)lmAdd(holder,strutGeometry(new THREE.Vector3(Math.cos(a)*r*.95,0,Math.sin(a)*r*.95),new THREE.Vector3(Math.cos(a)*r*1.45,.035,Math.sin(a)*r*1.45),.003),TW.white);
  }
  lmAdd(holder,new THREE.TorusGeometry(r*1.5,.003,5,40).rotateX(Math.PI/2),TW.white,0,.102,0);
  lmCyl(holder,r*.83,r*.83,.10,lens,0,.055,0,24);
  for(let k=0;k<12;k++) {const a=k/12*Math.PI*2;lmCyl(holder,.002,.002,.10,TW.doorBlue,Math.cos(a)*r*.84,.055,Math.sin(a)*r*.84,5);}
  lmCyl(holder,r*.93,r*.93,.008,TW.white,0,.155,0,24);
  lmAdd(holder,new THREE.SphereGeometry(r*.88,24,12,0,Math.PI*2,0,Math.PI/2),LM.black,0,.163,0).scale.y=.55;
  lmCyl(holder,.002,.002,.055,LM.black,0,.163+r*.5,0,6);
  return y+.218+r*.5;
}

LANDMARK_BUILDERS.yushan = () => {
  const g=new THREE.Group(),rock=lmMaterial(0x777b77,{map:TEXTURES.stone,roughness:1});
  for(let i=0;i<34;i++) {
    const angle=i*2.39996,r=.05+(i%9)*.018;
    const stone=lmAdd(g,roughMass(.035,.014,.026,{seed:1100+i,jitter:.27,detail:1}),rock,Math.cos(angle)*r,-.018+(i%3)*.005,Math.sin(angle)*r*.7);
    stone.rotation.y=angle;stone.rotation.z=.18*Math.sin(i);
  }
  const marker=lmMaterial(0x454b4a,{roughness:.85});
  lmBox(g,.073,.085,.026,marker,0,-.005,0);
  referencePlaque(g,'玉山主峰',0,.028,.015,.065,.022,'#deddd6','#454b4a');
  referencePlaque(g,'3952',0,.006,.015,.042,.014,'#deddd6','#454b4a');
  return mergeByMaterial(g);
};

// NSYSU Sizihwan campus: the freestanding maroon entrance tower, lookout opening,
// gold vertical lettering and guardhouse follow the university's published gate photo.
// The low academic blocks and wooded slope are a compact campus setting, not a survey model.
LANDMARK_BUILDERS.nsysu = () => {
  const g=new THREE.Group();
  const paving=lmMaterial(0xc6bfae,{roughness:.94}),asphalt=lmMaterial(0x626568,{roughness:1});
  const tile=patternTexture((ctx,size)=>{
    ctx.fillStyle='#754c48';ctx.fillRect(0,0,size,size);
    ctx.strokeStyle='#b7a29a';ctx.lineWidth=.8;
    for(let i=0;i<=4;i++){ctx.beginPath();ctx.moveTo(0,i*size/4);ctx.lineTo(size,i*size/4);ctx.stroke();}
    for(let i=0;i<=2;i++){ctx.beginPath();ctx.moveTo(i*size/2,0);ctx.lineTo(i*size/2,size);ctx.stroke();}
  },256);
  const maroon=lmMaterial(0xffffff,{map:tile,roughness:.85}),frame=lmMaterial(0x826963,{roughness:.8});
  const cream=lmMaterial(0xd4c4a3,{roughness:.85}),roof=lmMaterial(0xa15a42,{map:TEXTURES.tiles,roughness:.8});
  const gold=lmMaterial(0xd6b568,{metalness:.35,roughness:.55});
  // Coastal promenade in front, a curved campus road leading up toward the hillside.
  lmBox(g,2.1,.016,1.38,TW.lawn,0,-.015,-.02);
  lmBox(g,2.1,.012,.20,paving,0,.002,.59);
  const road=new THREE.Shape();
  road.moveTo(-.85,-.49);road.bezierCurveTo(-.15,-.46,.12,-.12,.14,.55);road.lineTo(.40,.55);road.bezierCurveTo(.42,-.12,.18,-.53,-.55,-.63);road.closePath();
  lmAdd(g,new THREE.ShapeGeometry(road,36).rotateX(-Math.PI/2),asphalt,0,.022,0);
  // The actual gate is a single narrow tower beside the road, not an arch over it.
  const tx=-.48,tz=.30;
  lmBox(g,.132,.70,.155,maroon,tx,.015,tz);
  lmBox(g,.023,.16,.155,maroon,tx-.0545,.715,tz);
  lmBox(g,.023,.16,.155,maroon,tx+.0545,.715,tz);
  lmBox(g,.132,.10,.155,maroon,tx,.875,tz);
  lmBox(g,.132,.012,.155,frame,tx,.703,tz);
  // Narrow side windows and the open lookout room just below the tower crown.
  for(let level=0;level<4;level++) {
    const y=.18+level*.135;
    lmBox(g,.004,.067,.066,TW.glass,tx-.067,y,tz);
    lmBox(g,.004,.067,.066,TW.glass,tx+.067,y,tz);
    lmBox(g,.004,.006,.066,frame,tx+.07,y+.032,tz);
  }
  lmBox(g,.104,.009,.118,gold,tx,.866,tz);
  for(let lamp=0;lamp<4;lamp++) {
    lmBox(g,.019,.012,.018,TW.glass,tx-.045+lamp*.03,.981,tz+.035);
    lmCyl(g,.002,.002,.016,frame,tx-.045+lamp*.03,.967,tz+.035,5);
  }
  // Upright Chinese letters, with normal 0..1 sign UVs and transparent spacing.
  const signCanvas=document.createElement('canvas');signCanvas.width=192;signCanvas.height=1024;
  const ctx=signCanvas.getContext('2d');ctx.clearRect(0,0,192,1024);ctx.fillStyle='#dfbd73';ctx.font='bold 130px "PingFang TC", "Microsoft JhengHei", serif';ctx.textAlign='center';ctx.textBaseline='middle';
  [...'國立中山大學'].forEach((letter,i)=>ctx.fillText(letter,96,92+i*165,172));
  const signTexture=new THREE.CanvasTexture(signCanvas);signTexture.colorSpace=THREE.SRGBColorSpace;signTexture.anisotropy=4;
  const lettering=stdMaterial({color:0xffffff,map:signTexture,transparent:true,alphaTest:.05,roughness:.7,emissive:0xffd899,emissiveMap:signTexture,emissiveIntensity:.05});
  lmAdd(g,new THREE.PlaneGeometry(.087,.51),lettering,tx,.417,tz+.079);
  // A restrained floral crest above the lookout opening.
  for(let petal=0;petal<6;petal++) {
    const a=petal/6*Math.PI*2;
    lmAdd(g,new THREE.TorusGeometry(.012,.0013,5,14),gold,tx+Math.sin(a)*.009,.93+Math.cos(a)*.009,tz+.079);
  }
  // Guardhouse and yellow planter island at the entrance.
  lmBox(g,.16,.18,.18,maroon,-.10,.02,.29);
  lmBox(g,.18,.012,.20,frame,-.10,.20,.29);
  lmBox(g,.10,.042,.004,TW.glass,-.10,.055,.382);
  lmBox(g,.014,.16,.014,TW.white,.025,.02,.30);
  lmBox(g,.25,.012,.012,TW.white,.14,.125,.30);
  for(let stripe=0;stripe<5;stripe++)lmBox(g,.023,.013,.014,TW.red,.04+stripe*.047,.125,.302);
  lmCyl(g,.105,.115,.03,lmMaterial(0xc9a33e),.22,.02,.40,32);
  lmAdd(g,roughMass(.085,.035,.075,{seed:2202,jitter:.12,detail:2}),TW.hedge,.22,.065,.40);
  // Compact, low-rise coastal campus blocks behind the gate.
  for(const [x,z,w,d,h] of [[-.56,-.23,.46,.22,.19],[.10,-.40,.42,.24,.23],[.64,-.27,.38,.23,.18]]) {
    lmBox(g,w,h,d,cream,x,.028,z);
    lmBox(g,w+.025,.014,d+.025,paving,x,.028+h,z);
    lmHip(g,.06,w*.57,.045,roof,x,.045+h,z,d/w);
    for(let floor=0;floor<3;floor++)for(let window=0;window<6;window++)lmBox(g,.025,.026,.004,TW.glass,x-w*.4+window*w*.16,.055+floor*.048,z+d/2+.003);
  }
  referencePlaque(g,'NSYSU',.10,.19,-.277,.22,.027,'#76503d','#d4c4a3');
  // Shoushan greenery, palms and the stone seawall establish the Sizihwan setting.
  lmAdd(g,roughMass(1.1,.24,.27,{seed:2241,jitter:.10,detail:2}),TW.leafDark,0,.015,-.65);
  for(let i=0;i<9;i++) {
    const x=-.90+i*.22,z=-.50-(i%2)*.12;
    lmAdd(g,roughMass(.14,.12,.12,{seed:2250+i,jitter:.17,detail:1}),i%2?TW.leaf:TW.leafDark,x,.13,z);
  }
  for(const [x,z] of [[-.86,.02],[.68,.10],[.85,-.18],[.54,-.52]])palmAt(g,x,z,.30,.02);
  const stone=lmMaterial(0x8d9188,{roughness:1});
  balustrade(g,-1.02,.72,1.02,.72,{y:-.005,h:.045,spacing:.09,material:stone});
  for(let i=0;i<22;i++) {
    const x=-1.04+i*.10;
    lmAdd(g,roughMass(.065,.035,.045,{seed:2300+i,jitter:.18,detail:1}),stone,x,-.04,.76);
  }
  const merged=mergeByMaterial(g);merged.userData.campus='NSYSU';return merged;
};

// Final Japan reference pass: shared by the game and the model review.
refineJapanLandmarks({ builders: LANDMARK_BUILDERS, lmAdd, lmBox, lmCyl, lmHip, lmMaterial, patternTexture, mergeByMaterial, roughMass, strutGeometry, curvedBeam, irimoya, templeHall, pagoda5, balustrade, gardenPine, starShape, suspensionBridge2, referencePlaque, JP, LM, TW, TEXTURES });

refineKoreaLandmarks({builders:LANDMARK_BUILDERS,lmAdd,lmBox,lmCyl,lmMaterial,mergeByMaterial,roughMass,loftedTower,irimoya,koreanHallAt,balustrade,suspensionBridge2,referencePlaque,JK,LM,TEXTURES});

addTaiwanVillages({builders:LANDMARK_BUILDERS,lmAdd,lmBox,lmCyl,lmMaterial,mergeByMaterial,roughMass,TEXTURES});

addTaiwanCoastalModels({builders:LANDMARK_BUILDERS,lmAdd,lmBox,lmCyl,lmMaterial,mergeByMaterial,roughMass,patternTexture});

LANDMARK_BUILDERS.kaohsiungAirport=()=>createKaohsiungAirport({lmAdd,lmBox,lmCyl,lmMaterial,mergeByMaterial});

refineNkPhLandmarks({builders:LANDMARK_BUILDERS,lmAdd,lmBox,lmCyl,lmHip,lmMaterial,mergeByMaterial,roughMass,referencePlaque,TEXTURES});
