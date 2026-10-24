import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Procedural whale: a body swept from elliptical cross-sections along its length, plus flukes, flippers and a dorsal fin.
// Built in a frame with the head toward +Z, tail toward -Z, +Y up, length 1 (callers scale it).
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Catmull-Rom through [s, ...values] control rows
function sampleProfile(rows, s) {
  let i = 0;
  while (i < rows.length - 2 && s > rows[i + 1][0]) i++;
  const p0 = rows[Math.max(0, i - 1)], p1 = rows[i], p2 = rows[i + 1], p3 = rows[Math.min(rows.length - 1, i + 2)];
  const t = (s - p1[0]) / (p2[0] - p1[0] || 1);
  const out = [];
  for (let k = 1; k < p1.length; k++) {
    const a = p0[k], b = p1[k], c = p2[k], d = p3[k];
    out.push(.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t));
  }
  return out;
}

function paint(geometry, color) {
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b; }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}
function plain(geometry) {   // same attribute set on every part so they can be merged
  geometry = geometry.index ? geometry.toNonIndexed() : geometry;
  geometry.deleteAttribute('uv');
  return geometry;
}

export function buildWhaleGeometry(def) {
  const STATIONS = 72, RING = 28;
  const back = new THREE.Color(def.back), belly = new THREE.Color(def.belly), fin = new THREE.Color(def.flipper), color = new THREE.Color();
  // --- body ---
  const positions = [], index = [], rings = [];
  for (let i = 0; i <= STATIONS; i++) {
    const s = i / STATIONS;
    const [w, top, bottom] = sampleProfile(def.profile, s);
    const arch = def.arch * Math.sin(Math.PI * s);
    const z = s - .5;
    rings.push(s);
    for (let j = 0; j < RING; j++) {
      const a = j / RING * Math.PI * 2, cs = Math.cos(a), sn = Math.sin(a);
      const x = w * Math.sign(cs) * Math.abs(cs) ** .82;
      const y = (sn > 0 ? top : bottom) * Math.sign(sn) * Math.abs(sn) ** .82 + arch;
      positions.push(x, y, z);
    }
  }
  for (let i = 0; i < STATIONS; i++) for (let j = 0; j < RING; j++) {
    const a = i * RING + j, b = i * RING + (j + 1) % RING, c = (i + 1) * RING + j, d = (i + 1) * RING + (j + 1) % RING;
    index.push(a, b, c, b, d, c);
  }
  const bodyGeometry = new THREE.BufferGeometry();
  bodyGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  bodyGeometry.setIndex(index);
  bodyGeometry.computeVertexNormals();
  const normal = bodyGeometry.attributes.normal, position = bodyGeometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const ny = normal.getY(i), y = position.getY(i), z = position.getZ(i);
    // dark back, pale belly; the transition rides a little above the flank like a real whale's countershading
    color.copy(back).lerp(belly, smoothstep(.15, -.35, ny));
    if (def.mottle) {
      const p = position.getX(i) * 40 + z * 21, q = y * 46 - z * 30;
      color.multiplyScalar(1 + def.mottle * (Math.sin(p * 3.1) * Math.sin(q * 2.3) + Math.sin((p + q) * 1.7) * .6));
    }
    colors.set([color.r, color.g, color.b], i * 3);
  }
  bodyGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const parts = [plain(bodyGeometry)];

  // --- flukes: a notched crescent lying flat at the tail ---
  const span = def.fluke;
  const shape = new THREE.Shape();
  const pts = [[0, .06], [-.5, -.02], [-1, -.42], [-.62, -.26], [-.12, -.34], [0, -.24], [.12, -.34], [.62, -.26], [1, -.42], [.5, -.02]];
  pts.forEach(([x, y], k) => (k ? shape.lineTo(x * span, y * span) : shape.moveTo(x * span, y * span)));
  shape.closePath();
  const flukes = new THREE.ExtrudeGeometry(shape, { depth: .012, bevelEnabled: false });
  flukes.rotateX(Math.PI / 2);                       // lie flat: shape y becomes -z (trailing edge toward the tail)
  const tailY = def.arch * Math.sin(Math.PI * .02);
  flukes.translate(0, tailY, -.5 + .015);
  parts.push(plain(paint(flukes, back.clone().multiplyScalar(.8))));

  // --- flippers ---
  for (const side of [-1, 1]) {
    const flipper = new THREE.SphereGeometry(1, 12, 8);
    flipper.scale(def.flipperWidth, .008, def.flipperLength / 2);
    flipper.translate(0, 0, -def.flipperLength / 2);   // root at the origin, pointing backward
    flipper.applyMatrix4(new THREE.Matrix4().makeRotationX(-.35));         // tip hangs below the root
    flipper.applyMatrix4(new THREE.Matrix4().makeRotationY(side * -.7));    // swing outward from the flank
    const [w, , bottom] = sampleProfile(def.profile, .7);
    flipper.translate(side * w * .92, -bottom * .5, .7 - .5);
    parts.push(plain(paint(flipper, fin)));
  }

  // --- eyes: a dark pupil in a pale ring, set low on each side of the head just above the mouth line ---
  const eyeS = def.eyeAt ?? .875;
  const [ew, etop, ebottom] = sampleProfile(def.profile, eyeS);
  const eyeY = def.arch * Math.sin(Math.PI * eyeS) - ebottom * .12;
  const eyeX = ew * Math.sqrt(Math.max(0, 1 - Math.abs(eyeY / ebottom) ** 2.4)) ** .82;
  for (const side of [-1, 1]) {
    const ring = new THREE.SphereGeometry(def.eyeSize * 2, 14, 10);
    ring.scale(.35, 1, 1);
    ring.translate(side * eyeX * .98, eyeY, eyeS - .5);
    parts.push(plain(paint(ring, new THREE.Color(0xd8d2c2))));
    const pupil = new THREE.SphereGeometry(def.eyeSize * 1.2, 14, 10);
    pupil.scale(.5, 1, 1);
    pupil.translate(side * (eyeX * .98 + def.eyeSize * .75), eyeY, eyeS - .5);
    parts.push(plain(paint(pupil, new THREE.Color(0x05070a))));
  }

  // --- dorsal fin ---
  const dorsal = new THREE.ConeGeometry(.012, def.dorsal, 6);
  dorsal.scale(1, 1, 2.4);
  dorsal.rotateX(-.55);
  const [, top30] = sampleProfile(def.profile, .3);
  dorsal.translate(0, top30 + def.arch * Math.sin(Math.PI * .3) + def.dorsal * .35, .3 - .5);
  parts.push(plain(paint(dorsal, back.clone().multiplyScalar(.9))));

  const merged = mergeGeometries(parts, false);
  const blowS = .8, [, topBlow] = sampleProfile(def.profile, blowS);
  merged.userData.blowhole = new THREE.Vector3(0, topBlow + def.arch * Math.sin(Math.PI * blowS), blowS - .5);
  return merged;
}
