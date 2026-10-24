// A modern motor yacht drawn in code (no model file): a lofted deep-V hull with flared bow and sheer, boot stripe and
// antifouling below the waterline, a long hull window band and portholes, a teak swim platform and decks, two tiers of
// swept-back superstructure wrapped in tinted glass, a flybridge hardtop on a raked radar arch, radar dome and antennas,
// and stainless rails. Built in the boat group's own units: bow toward -z, about as long as the galleon it replaces.
import * as THREE from 'three';

const L = 9.4, B = 1.3;                  // length and half-beam
const WATER_Y = -2.14;                   // the sea surface in boat units (boat origin rides .15 above the water, scale .07)
// The yacht's own paint schemes (the galleon has different ones), one colour per component.
const P = (hull, stripe, bottom, accent, cabin, roof, glass, deck, teak, cushion, metal, arch, flag) => ({ hull, stripe, bottom, accent, cabin, roof, glass, deck, teak, cushion, metal, arch, flag });
export const YACHT_PAINTS = {
  //            hull      stripe    bottom    accent    cabin     roof      glass     deck      teak      cushion   metal     arch      flag
  pearl: P(0xf4f6f8, 0x14305a, 0x23262b, 0xc9a24a, 0xf6f7f9, 0x14305a, 0x0e1c2a, 0xeef0f2, 0xa8743f, 0x1f3f6e, 0xdfe5ea, 0xf6f7f9, 0xc8102e),      // 珍珠白
  champagne: P(0xe6d6b4, 0x5a3b22, 0x2a2420, 0xf2e6cf, 0xf3ece0, 0x5a3b22, 0x2a1e14, 0xefe6d6, 0x8a5a2e, 0xc9a77a, 0xc9a24a, 0xe6d6b4, 0x8a1c1c),  // 香檳金
  gunmetal: P(0x3d434b, 0xd8342c, 0x1a1c20, 0xd8342c, 0xd9dde2, 0x24282e, 0x101418, 0xc9ccd0, 0x6e6a64, 0xd8342c, 0x2a2e34, 0x3d434b, 0xd8342c),   // 槍灰
  azure: P(0x2b8fc9, 0xf4f6f8, 0x15263a, 0xf4f6f8, 0xf6f7f9, 0x2b8fc9, 0x0a2236, 0xf2f4f6, 0xb5824e, 0xf4f6f8, 0xdfe5ea, 0xf6f7f9, 0x2b8fc9)      // 地中海藍
};
const HULL_PARTS = ['hull', 'stripe', 'bottom', 'accent'];

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const halfBeam = (t) => B * (t < .38 ? .9 + .1 * smooth(0, .38, t) : Math.pow(Math.max(0, 1 - ((t - .38) / .62) ** 1.7), .55));
const deckY = (t) => -.95 + .42 * t * t;                              // sheer rises toward the bow
const keelY = (t) => -2.62 + 1.25 * smooth(.62, 1, t) ** 1.4;         // forefoot sweeps up into the raked stem
const zAt = (t) => L / 2 - t * L;                                       // t = 0 stern (+z), 1 bow (-z)
const PROFILE_U = [0, .12, .26, .42, .58, .78, 1];
const PROFILE_X = [0, .42, .72, .88, .96, 1, 1.03];                     // deep V that turns into near-vertical, slightly flared sides
const PROFILE_Y = [0, .07, .17, .3, .45, .7, 1];

export function buildYacht() {
  const g = new THREE.Group();
  // gelcoat parts get a little self-light so pale colours stay clean under the game's low exposure
  const gelcoat = (extra = {}) => new THREE.MeshPhysicalMaterial({ roughness: .28, metalness: .02, clearcoat: .8, clearcoatRoughness: .15, emissive: 0x8a96a4, emissiveIntensity: .3, ...extra });
  const white = gelcoat(), roof = gelcoat(), arch = gelcoat();
  const deckMaterial = new THREE.MeshStandardMaterial({ roughness: .6, side: THREE.DoubleSide, emissive: 0x606870, emissiveIntensity: .2 });
  const cushion = new THREE.MeshStandardMaterial({ roughness: .95, emissive: 0x404040, emissiveIntensity: .15 });
  const flagMaterial = new THREE.MeshStandardMaterial({ roughness: .8 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0e1c2a, roughness: .08, metalness: .6, clearcoat: 1, emissive: 0xffd9a0, emissiveIntensity: 0 });
  const chrome = new THREE.MeshStandardMaterial({ roughness: .18, metalness: .95 });
  const teak = new THREE.MeshStandardMaterial({ color: 0xa8743f, roughness: .7, map: teakTexture() });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: .5 });
  const hullMaterial = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: .25, metalness: .03, clearcoat: .9, clearcoatRoughness: .12, side: THREE.DoubleSide });

  // ---- hull: rings of the cross-section profile lofted from transom to stem
  const STATIONS = 48, positions = [], parts = [], indices = [];
  for (let s = 0; s <= STATIONS; s++) {
    const t = s / STATIONS, b = halfBeam(t), d = deckY(t), k = keelY(t), z = zAt(t);
    for (let side = -1; side <= 1; side += 2) {
      for (let p = 0; p < PROFILE_U.length; p++) positions.push(side * b * PROFILE_X[p], k + (d - k) * PROFILE_Y[p], z);
    }
  }
  const ringSize = PROFILE_U.length * 2;
  for (let s = 0; s < STATIONS; s++) {
    for (let side = 0; side < 2; side++) {
      for (let p = 0; p < PROFILE_U.length - 1; p++) {
        const a = s * ringSize + side * PROFILE_U.length + p, b = a + ringSize;
        if (side === 0) indices.push(a, b, a + 1, a + 1, b, b + 1); else indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  // transom: a flat stern panel joining both sides of the first ring
  const transomCentre = positions.length / 3;
  positions.push(0, (keelY(0) + deckY(0)) / 2, zAt(0));
  for (let side = 0; side < 2; side++) {
    for (let p = 0; p < PROFILE_U.length - 1; p++) {
      const a = side * PROFILE_U.length + p;
      if (side === 0) indices.push(transomCentre, a + 1, a); else indices.push(transomCentre, a, a + 1);
    }
  }
  const hull = new THREE.BufferGeometry();
  hull.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  hull.setIndex(indices);
  hull.computeVertexNormals();
  const hullColours = new Float32Array(positions.length);
  for (let i = 0; i < positions.length / 3; i++) {
    const y = positions[i * 3 + 1], z = positions[i * 3 + 2], t = (L / 2 - z) / L;
    const sheer = deckY(Math.min(1, Math.max(0, t)));
    parts.push(y < WATER_Y + .1 ? 2 : y < WATER_Y + .34 ? 1 : Math.abs(y - (sheer - .17)) < .07 ? 3 : 0);
  }
  hull.setAttribute('color', new THREE.BufferAttribute(hullColours, 3));
  hullMaterial.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vColor.rgb * 0.3;');
  };
  g.add(new THREE.Mesh(hull, hullMaterial));

  // ---- deck: white cap with teak inlays aft and on the foredeck sunpad
  const deckShape = new THREE.Shape();
  for (let s = 0; s <= STATIONS; s++) { const t = s / STATIONS; deckShape[s ? 'lineTo' : 'moveTo'](halfBeam(t) * 1.02, zAt(t)); }
  for (let s = STATIONS; s >= 0; s--) { const t = s / STATIONS; deckShape.lineTo(-halfBeam(t) * 1.02, zAt(t)); }
  const deckGeometry = new THREE.ShapeGeometry(deckShape, 4).rotateX(Math.PI / 2);
  const deckPos = deckGeometry.attributes.position;
  for (let i = 0; i < deckPos.count; i++) deckPos.setY(i, deckY((L / 2 - deckPos.getZ(i)) / L) + .005);
  deckGeometry.computeVertexNormals();
  g.add(new THREE.Mesh(deckGeometry, deckMaterial));
  addBox(g, B * 1.6, .03, 1.5, teak, 0, deckY(.12) + .02, zAt(.12));            // aft cockpit
  addBox(g, B * .9, .06, 1.1, cushion, 0, deckY(.78) + .06, zAt(.78));   // foredeck sunpad
  for (const x of [-.32, .32]) addBox(g, .5, .05, .16, cushion, x, deckY(.78) + .12, zAt(.78) - .5);   // its headrests
  // aft cockpit lounge: a U-shaped sofa round a teak table
  const cockpitY = deckY(.12) + .05;
  addBox(g, 1.9, .18, .32, cushion, 0, cockpitY, zAt(.12) + .55);
  for (const side of [-1, 1]) addBox(g, .3, .18, .9, cushion, side * .8, cockpitY, zAt(.12) + .15);
  addBox(g, 1.9, .2, .1, cushion, 0, cockpitY + .18, zAt(.12) + .7);
  addBox(g, .8, .04, .45, teak, 0, cockpitY + .2, zAt(.12) + .05);
  addCyl(g, .04, .2, chrome, 0, cockpitY, zAt(.12) + .05);
  addBox(g, B * 1.75, .1, .7, teak, 0, WATER_Y + .22, zAt(0) + .35);              // swim platform
  for (let k = 0; k < 4; k++) addBox(g, .5, .04, .14, teak, 0, WATER_Y + .3 + k * .12, zAt(0) - .05 - k * .12);   // steps up to the cockpit

  // ---- hull side details: a long dark window band, portholes and a stainless rub rail
  for (const side of [-1, 1]) {
    for (let k = 0; k < 7; k++) {
      const t = .3 + k * .055, b = halfBeam(t);
      const pane = addBox(g, .02, .22, L * .055, glass, side * (b * 1.0 + .012), deckY(t) - .42, zAt(t));
      pane.rotation.y = side * Math.atan2(halfBeam(t + .03) - halfBeam(t - .03), L * .06);
    }
    for (let k = 0; k < 4; k++) {
      const t = .7 + k * .045, b = halfBeam(t);
      const port = new THREE.Mesh(new THREE.CircleGeometry(.06, 14), glass);
      port.position.set(side * (b * 1.0 + .015), deckY(t) - .48, zAt(t)); port.rotation.y = side * Math.PI / 2;
      g.add(port);
    }
    const railPoints = [];
    for (let s = 0; s <= 40; s++) { const t = s / 40 * .97; railPoints.push(new THREE.Vector3(side * halfBeam(t) * 1.035, deckY(t) - .06, zAt(t))); }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPoints), 60, .025, 6), chrome));
    // bow rail on short stanchions
    const bowRail = [];
    for (let s = 0; s <= 16; s++) { const t = .55 + s / 16 * .42; bowRail.push(new THREE.Vector3(side * halfBeam(t) * .93, deckY(t) + .28, zAt(t))); }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bowRail), 40, .018, 6), chrome));
    for (let s = 0; s <= 8; s++) { const t = .55 + s / 8 * .42; addCyl(g, .012, .28, chrome, side * halfBeam(t) * .93, deckY(t), zAt(t)); }
  }

  // ---- superstructure: two swept tiers, each wrapped by a tinted window band and a raked windscreen
  const mainBase = -.93;
  tier(g, { base: mainBase, aft: 2.7, roofFore: .3, foot: -1.75, height: 1.0, halfWidth: 1.02, white, glass, roof });
  tier(g, { base: mainBase + 1.0, aft: 1.9, roofFore: .15, foot: -.85, height: .68, halfWidth: .86, white, glass, roof });
  // flybridge hardtop on a raked radar arch, with a radar dome, antennas and a stern flag
  const topY = mainBase + 1.68;
  for (const side of [-1, 1]) {
    const post = addBox(g, .08, .85, .22, arch, side * .78, topY - .02, 1.75);
    post.rotation.x = -.35; post.position.z -= .1;
  }
  addBox(g, 1.85, .07, 2.0, roof, 0, topY + .7, .9);
  addBox(g, 1.6, .03, 1.7, dark, 0, topY + .69, .9);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(.17, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), arch); dome.position.set(0, topY + .77, .55); g.add(dome);
  addBox(g, .5, .05, .08, dark, 0, topY + .95, 1.1);                      // open-array radar
  addCyl(g, .025, .2, arch, 0, topY + .77, 1.1);
  for (const x of [-.6, .6]) addCyl(g, .012, .55, chrome, x, topY + .77, 1.5);
  addCyl(g, .015, .9, chrome, 0, deckY(0) + .02, zAt(0) - .15);          // flagstaff on the transom
  const flag = addBox(g, .02, .2, .32, flagMaterial, 0, deckY(0) + .7, zAt(0) - .02);
  flag.userData.flag = true;
  // flybridge seating and helm
  addBox(g, 1.3, .16, .4, cushion, 0, topY, 1.5);
  addBox(g, 1.3, .18, .08, cushion, 0, topY + .16, 1.68);
  addBox(g, .5, .25, .25, dark, .35, topY, .35);

  // ---- paint and night
  const swatch = new THREE.Color();
  g.userData.paint = (name) => {
    const paint = YACHT_PAINTS[name] ?? YACHT_PAINTS.pearl;
    white.color.setHex(paint.cabin); roof.color.setHex(paint.roof); arch.color.setHex(paint.arch);
    glass.color.setHex(paint.glass); deckMaterial.color.setHex(paint.deck); teak.color.setHex(paint.teak);
    cushion.color.setHex(paint.cushion); chrome.color.setHex(paint.metal); flagMaterial.color.setHex(paint.flag);
    for (let i = 0; i < parts.length; i++) { swatch.setHex(paint[HULL_PARTS[parts[i]]]); hullColours.set([swatch.r, swatch.g, swatch.b], i * 3); }
    hull.attributes.color.needsUpdate = true;
  };
  g.userData.setNight = (night) => { glass.emissiveIntensity = night ? .55 : 0; };
  g.userData.paint('pearl');
  g.traverse((object) => { if (object.isMesh) object.castShadow = false; });
  return g;
}

function addBox(g, w, h, d, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y + h / 2, z); g.add(mesh); return mesh;
}
function addCyl(g, r, h, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 8), material);
  mesh.position.set(x, y + h / 2, z); g.add(mesh); return mesh;
}
// One deck of superstructure: a side profile (aft wall, flat roof, long raked front) extruded across the beam with
// rounded edges, a dark glass band around it and a windscreen laid on the raked front.
function tier(g, { base, aft, roofFore, foot, height, halfWidth, white, glass, roof }) {
  const profile = (inset, bottom, top) => {
    const slope = (y) => foot + (roofFore - foot) * (y / height);           // z of the raked front at height y
    const shape = new THREE.Shape();
    shape.moveTo(aft - inset, bottom); shape.lineTo(aft - inset, top); shape.lineTo(slope(top) + inset, top); shape.lineTo(slope(bottom) + inset, bottom);
    return shape;
  };
  const extrude = (shape, depth, material, bevel) => {
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel, bevelThickness: .06, bevelSize: .06, bevelSegments: 3 });
    geometry.rotateY(-Math.PI / 2).translate(depth / 2, base, 0);
    const mesh = new THREE.Mesh(geometry, material); g.add(mesh); return mesh;
  };
  extrude(profile(0, 0, height), halfWidth * 2 - .12, white, true);
  // roof cap in the accent colour, overhanging a little
  const capLength = aft - roofFore + .2;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(halfWidth * 2 + .06, .05, capLength), roof);
  cap.position.set(0, base + height + .07, roofFore + capLength / 2 - .14); g.add(cap);
  extrude(profile(.12, height * .42, height * .8), halfWidth * 2 + .02, glass, false);
  // windscreen on the raked front
  const rise = height * .5, run = (roofFore - foot) * .5, angle = Math.atan2(rise, run);
  const screen = new THREE.Mesh(new THREE.BoxGeometry(halfWidth * 1.7, .02, Math.hypot(rise, run) * 1.05), glass);
  screen.position.set(0, base + height * .62, foot + (roofFore - foot) * .62 - .05);
  screen.rotation.x = -angle;
  g.add(screen);
}
function teakTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  // neutral planks and dark caulking seams: the paint scheme's teak colour tints it
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#e4e4e4' : '#ffffff'; ctx.fillRect(0, i * 8, 64, 7); ctx.fillStyle = '#4a4a4a'; ctx.fillRect(0, i * 8 + 7, 64, 1); }
  const texture = new THREE.CanvasTexture(canvas); texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(2, 3); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
