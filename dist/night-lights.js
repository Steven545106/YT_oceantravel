import * as THREE from 'three';

// Night lighting for the coast: clustered city glow (denser and wider for bigger cities), harbour lights,
// flashing lighthouse lamps and a small pool of sweeping lighthouse beams assigned to the lighthouses nearest the boat.
// Everything is drawn as additive points in one draw call, so thousands of lights stay cheap.

const rand = (seed) => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
function gaussian(random) { return Math.sqrt(-2 * Math.log(random() + 1e-9)) * Math.cos(2 * Math.PI * random()); }

const POINT_VERTEX = `
  attribute float aSize;
  attribute vec4 aInfo;      // kind (0 steady, 1 twinkle, 2 lighthouse flash), period, offset, intensity
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uScale;
  varying vec3 vColor;
  varying float vIntensity;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float intensity = aInfo.w;
    if (aInfo.x > 0.5 && aInfo.x < 1.5) intensity *= 0.78 + 0.22 * sin(uTime * (1.5 + aInfo.y) + aInfo.z * 6.2831);
    if (aInfo.x > 1.5) {
      float cycle = fract(uTime / aInfo.y + aInfo.z);
      intensity *= cycle < 0.14 ? 1.0 : 0.12;
    }
    vIntensity = intensity;
    vColor = aColor;
    float dist = max(-mv.z, 0.05);
    gl_PointSize = clamp(aSize * uScale / dist, 1.6, 90.0);
    gl_Position = projectionMatrix * mv;
  }`;
const POINT_FRAGMENT = `
  varying vec3 vColor;
  varying float vIntensity;
  uniform float uOpacity;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float glow = pow(1.0 - d, 1.7);
    gl_FragColor = vec4(vColor * glow * vIntensity, glow * vIntensity * uOpacity);
  }`;

const BEAM_VERTEX = `
  attribute float aFade;
  varying float vFade;
  void main() { vFade = aFade; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const BEAM_FRAGMENT = `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vFade;
  void main() { gl_FragColor = vec4(uColor * vFade, vFade * uOpacity); }`;

function beamGeometry(length, radius) {
  const cone = new THREE.ConeGeometry(radius, length, 14, 1, true);   // apex at +y
  cone.rotateZ(Math.PI / 2);                                        // point along +x, apex at x = +length/2
  cone.translate(length / 2, 0, 0);                                 // apex now at the origin... flip so apex is at the lamp
  const position = cone.attributes.position, fade = new Float32Array(position.count);
  for (let i = 0; i < position.count; i++) fade[i] = Math.pow(1 - position.getX(i) / length, 1.4);
  cone.setAttribute('aFade', new THREE.BufferAttribute(fade, 1));
  return cone;
}

export function createNightLights({ cities, harbours, lighthouses, isOnLand, heightAt }) {
  const group = new THREE.Group();
  group.visible = false;
  const positions = [], sizes = [], infos = [], colors = [];
  // height above the ground for lights standing on land (NaN for lights fixed above the water), used by reground()
  const lift = [];
  const push = (x, y, z, size, kind, period, offset, intensity, color, aboveGround = NaN) => {
    positions.push(x, y, z); sizes.push(size); infos.push(kind, period, offset, intensity); colors.push(color.r, color.g, color.b); lift.push(aboveGround);
  };
  const warm = [new THREE.Color(0xffd58a), new THREE.Color(0xffc060), new THREE.Color(0xfff0c8), new THREE.Color(0xffe3a0)];
  const cool = new THREE.Color(0xcfe6ff);

  // --- cities: a bright core plus a scatter of lights whose spread and number grow with population ---
  cities.forEach((city, index) => {
    const random = rand(index * 7919 + 13);
    const pop = city.pop;
    const scale = Math.log10(pop / 50000 + 1);                    // 0 .. ~2
    const sigma = .22 + .55 * scale;                              // world units (1 unit = 4 km)
    const count = Math.round(10 + 70 * scale * scale + 40 * scale);
    push(city.x, heightAt(city.x, city.z) + .05, city.z, .5 + 1.1 * scale, 0, 0, 0, .55, warm[0], .05);   // soft halo
    for (let i = 0; i < count; i++) {
      const radius = Math.abs(gaussian(random)) * sigma * (i < count * .35 ? .45 : 1);
      const angle = random() * Math.PI * 2;
      const x = city.x + Math.cos(angle) * radius, z = city.z + Math.sin(angle) * radius;
      if (!isOnLand(x, z)) continue;
      const core = 1 - Math.min(1, radius / (sigma * 2));
      const color = random() < .12 ? cool : warm[Math.floor(random() * warm.length)];
      push(x, heightAt(x, z) + .03, z, .07 + .16 * random() + .1 * core, random() < .4 ? 1 : 0, random() * 2, random(), .65 + .35 * core, color, .03);
    }
  });

  // --- harbours: a few white lights on the quay and a red/green pair at the entrance ---
  harbours.forEach((harbour, index) => {
    const random = rand(index * 104729 + 7);
    for (let i = 0; i < 3; i++) push(harbour.x + (random() - .5) * .25, .06, harbour.z + (random() - .5) * .25, .08 + random() * .06, 1, random() * 2, random(), .8, warm[2]);
    push(harbour.x - .12, .07, harbour.z + .1, .1, 2, 3 + random() * 2, random(), 1, new THREE.Color(0xff3b30));
    push(harbour.x + .12, .07, harbour.z + .1, .1, 2, 3 + random() * 2, random(), 1, new THREE.Color(0x30ff6a));
  });

  // --- lighthouses: flashing lamps (periods 4-12 s) ---
  lighthouses.forEach((lighthouse, index) => {
    const random = rand(index * 31337 + 5);
    lighthouse.period = 4 + Math.floor(random() * 5) * 1.5;
    lighthouse.offset = random();
    push(lighthouse.x, lighthouse.y + .45, lighthouse.z, .5, 2, lighthouse.period, lighthouse.offset, 1.4, new THREE.Color(0xfff2c8), lighthouse.onLand ? .45 : NaN);
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute('aInfo', new THREE.Float32BufferAttribute(infos, 4));
  geometry.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3));
  const uniforms = { uTime: { value: 0 }, uScale: { value: 600 }, uOpacity: { value: 1 } };
  const points = new THREE.Points(geometry, new THREE.ShaderMaterial({
    uniforms, vertexShader: POINT_VERTEX, fragmentShader: POINT_FRAGMENT,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  }));
  points.frustumCulled = false;
  group.add(points);

  // --- sweeping beams: eight reusable beams on the lighthouses closest to the boat ---
  const beams = [];
  const beamGeo = beamGeometry(7, .3);
  for (let i = 0; i < 8; i++) {
    const material = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0xfff0c0) }, uOpacity: { value: .26 } },
      vertexShader: BEAM_VERTEX, fragmentShader: BEAM_FRAGMENT,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
    });
    const pivot = new THREE.Group();
    const forward = new THREE.Mesh(beamGeo, material), back = new THREE.Mesh(beamGeo, material);
    back.rotation.y = Math.PI;
    pivot.add(forward, back);
    pivot.visible = false;
    group.add(pivot);
    beams.push({ pivot, lighthouse: null });
  }
  let assignTimer = 0;

  function update({ time, delta, night, camera, viewportHeight, pixelRatio, boat, darkness }) {
    group.visible = night;   // lights and beams only after dark
    if (!night) return;
    uniforms.uTime.value = time;
    uniforms.uScale.value = viewportHeight * pixelRatio / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    uniforms.uOpacity.value = 1;
    assignTimer -= delta;
    if (assignTimer <= 0) {
      assignTimer = 1.5;
      const ranked = lighthouses
        .map((lighthouse) => ({ lighthouse, d: Math.hypot(lighthouse.x - boat.x, lighthouse.z - boat.z) }))
        .filter((entry) => entry.d < 70)
        .sort((a, b) => a.d - b.d)
        .slice(0, beams.length);
      beams.forEach((beam, i) => { beam.lighthouse = ranked[i]?.lighthouse ?? null; });
    }
    for (const beam of beams) {
      const lighthouse = beam.lighthouse;
      beam.pivot.visible = !!lighthouse;
      if (!lighthouse) continue;
      beam.pivot.position.set(lighthouse.x, lighthouse.y + .45, lighthouse.z);
      beam.pivot.rotation.y = (time / lighthouse.period + lighthouse.offset) * Math.PI * 2 * .5;   // half a turn per period (two beams)
    }
  }
  // Lift lights standing on land inside `box` onto new terrain heights, without rebuilding the (slow) light layout.
  function reground(box) {
    const position = geometry.attributes.position;
    for (let i = 0; i < lift.length; i++) {
      if (Number.isNaN(lift[i])) continue;
      const x = position.getX(i), z = position.getZ(i);
      if (x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ) position.setY(i, heightAt(x, z) + lift[i]);
    }
    position.needsUpdate = true;
    for (const lighthouse of lighthouses) {
      if (lighthouse.onLand && lighthouse.x >= box.minX && lighthouse.x <= box.maxX && lighthouse.z >= box.minZ && lighthouse.z <= box.maxZ) lighthouse.y = heightAt(lighthouse.x, lighthouse.z);
    }
  }
  return { group, update, reground, lightCount: positions.length / 3 };
}
