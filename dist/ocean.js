import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { Sky } from './vendor/Sky.js';
import { Water } from './vendor/Water.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import shipStlUrl from './Data/pirateship.stl';

const container = document.querySelector('#app');
const loading = document.querySelector('#loading');
const speedReadout = document.querySelector('#speed');
const moodReadout = document.querySelector('#mood');
const windReadout = document.querySelector('#wind');
const compassDial = document.querySelector('#compass-dial');
const headingReadout = document.querySelector('#heading');
const positionReadout = document.querySelector('#position');
window.__oceanFallback?.stop();
window.__oceanFallback?.canvas.remove();
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x8aaec0, 0.000075);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.5, 20000);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.22;
container.append(renderer.domElement);

function makeWaterNormals() {
  const size = 256;
  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = normalCanvas.height = size;
  const context = normalCanvas.getContext('2d');
  const pixels = context.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = Math.cos(x * .19 + y * .07) * .65 + Math.sin(y * .31) * .35;
      const dy = Math.sin(y * .17 - x * .09) * .65 + Math.cos(x * .29) * .35;
      const i = (y * size + x) * 4;
      pixels.data[i] = 128 + dx * 22;
      pixels.data[i + 1] = 128 + dy * 22;
      pixels.data[i + 2] = 255;
      pixels.data[i + 3] = 255;
    }
  }
  context.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(normalCanvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

const water = new Water(new THREE.PlaneGeometry(10000, 10000), {
  textureWidth: 512,
  textureHeight: 512,
  waterNormals: makeWaterNormals(),
  sunDirection: new THREE.Vector3(),
  sunColor: 0xfff0c6,
  waterColor: 0x001e0f,
  distortionScale: 3.2,
  fog: true
});
water.rotation.x = -Math.PI / 2;
water.material.uniforms.size.value = 1.1;
scene.add(water);

const sky = new Sky();
sky.scale.setScalar(10000);
scene.add(sky);
const skyUniforms = sky.material.uniforms;
skyUniforms.turbidity.value = 10;
skyUniforms.rayleigh.value = 2;
skyUniforms.mieCoefficient.value = 0.005;
skyUniforms.mieDirectionalG.value = 0.8;
if (skyUniforms.cloudCoverage) skyUniforms.cloudCoverage.value = 0.28;
if (skyUniforms.cloudDensity) skyUniforms.cloudDensity.value = 0.48;
if (skyUniforms.cloudElevation) skyUniforms.cloudElevation.value = 0.36;

const sun = new THREE.Vector3();
const hemisphere = new THREE.HemisphereLight(0xa7ddff, 0x0a1d2b, 1.4);
const ambient = new THREE.AmbientLight(0xfff2dc, 0.45);
const directional = new THREE.DirectionalLight(0xffedbd, 1.4);
scene.add(hemisphere, ambient, directional);

const moon = new THREE.Mesh(
  new THREE.SphereGeometry(62, 32, 20),
  new THREE.MeshBasicMaterial({ color: 0xe7efff })
);
moon.visible = false;
scene.add(moon);
let timeOfDay = 'morning';

function setTimeOfDay(mode) {
  const night = mode === 'night';
  timeOfDay = night ? 'night' : 'morning';

  if (night) {
    renderer.toneMappingExposure = 0.15;
    scene.fog.color.setHex(0x020716);
    scene.fog.density = 0.000095;
    skyUniforms.turbidity.value = 1.5;
    skyUniforms.rayleigh.value = 0.32;
    skyUniforms.mieCoefficient.value = 0.001;
    skyUniforms.mieDirectionalG.value = 0.72;
    if (skyUniforms.cloudCoverage) skyUniforms.cloudCoverage.value = 0.16;
    if (skyUniforms.cloudDensity) skyUniforms.cloudDensity.value = 0.26;
    if (skyUniforms.cloudElevation) skyUniforms.cloudElevation.value = 0.18;
    sun.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 34), THREE.MathUtils.degToRad(-35));
    water.material.uniforms.sunColor.value.setHex(0x91adff);
    water.material.uniforms.waterColor.value.setHex(0x000d2b);
    water.material.uniforms.distortionScale.value = 2.45;
    hemisphere.color.setHex(0x263d80);
    hemisphere.groundColor.setHex(0x01030a);
    hemisphere.intensity = 0.62;
    ambient.color.setHex(0x355aab);
    ambient.intensity = 0.2;
    directional.color.setHex(0xaac0ff);
    directional.intensity = 0.82;
    moon.visible = true;
    moodReadout && (moodReadout.textContent = 'MOONLIT NIGHT');
  } else {
    renderer.toneMappingExposure = 0.22;
    scene.fog.color.setHex(0x8aaec0);
    scene.fog.density = 0.000075;
    skyUniforms.turbidity.value = 10;
    skyUniforms.rayleigh.value = 2;
    skyUniforms.mieCoefficient.value = 0.005;
    skyUniforms.mieDirectionalG.value = 0.8;
    if (skyUniforms.cloudCoverage) skyUniforms.cloudCoverage.value = 0.28;
    if (skyUniforms.cloudDensity) skyUniforms.cloudDensity.value = 0.48;
    if (skyUniforms.cloudElevation) skyUniforms.cloudElevation.value = 0.36;
    sun.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 5), THREE.MathUtils.degToRad(180));
    water.material.uniforms.sunColor.value.setHex(0xfff0c6);
    water.material.uniforms.waterColor.value.setHex(0x001e0f);
    water.material.uniforms.distortionScale.value = 3.2;
    hemisphere.color.setHex(0xa7ddff);
    hemisphere.groundColor.setHex(0x0a1d2b);
    hemisphere.intensity = 1.4;
    ambient.color.setHex(0xfff2dc);
    ambient.intensity = 0.45;
    directional.color.setHex(0xffedbd);
    directional.intensity = 1.4;
    moon.visible = false;
    moodReadout && (moodReadout.textContent = 'EARLY MORNING');
  }

  skyUniforms.sunPosition.value.copy(sun);
  water.material.uniforms.sunDirection.value.copy(sun).normalize();
  directional.position.copy(sun).multiplyScalar(3500);
  moon.position.copy(sun).multiplyScalar(5000);
}
scene.add(directional);

function buildBoat() {
  const boat = new THREE.Group();
  const wakeMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      time: { value: 0 },
      strength: { value: 0 }
    },
    vertexShader: `
      uniform float time;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 transformed = position;
        float trail = 1.0 - uv.y;
        transformed.z += sin(position.y * 1.6 - time * 4.0) * .045 * (1.0 + trail * 2.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform float strength;
      varying vec2 vUv;
      void main() {
        float trail = 1.0 - vUv.y;
        float halfWidth = mix(.09, .43, trail);
        float edge = 1.0 - smoothstep(halfWidth, halfWidth + .10, abs(vUv.x - .5));
        float broken = sin(vUv.y * 96.0 - time * 7.0 + sin(vUv.x * 31.0 + time * 2.0) * 2.4);
        float flecks = smoothstep(.10, .72, broken * .5 + .5);
        float alpha = edge * flecks * strength * mix(.62, .18, trail);
        gl_FragColor = vec4(.79, .95, 1.0, alpha);
      }
    `
  });
  const wake = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 22, 16, 32), wakeMaterial);
  wake.rotation.x = -Math.PI / 2;
  wake.position.set(0, .04, 11.5);
  wake.renderOrder = 1;
  boat.add(wake);
  boat.userData.wake = wake;
  return boat;
}

async function loadPirateShip(boat) {
  try {
    const geometry = await new STLLoader().loadAsync(shipStlUrl);
    // 此 STL 以 Z 為高度、Y 為船身長度；轉成 Three.js 場景使用的 Y-up 座標。
    geometry.rotateX(-Math.PI / 2);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    const height = bounds.max.y - bounds.min.y;
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    const color = new THREE.Color();
    for (let i = 0; i < geometry.attributes.position.count; i++) {
      const y = geometry.attributes.position.getY(i);
      const level = (y - bounds.min.y) / height;
      if (level < .20) color.setHex(0x5f200a);
      else if (level < .48) color.setHex(0xae4918);
      else if (level < .68) color.setHex(0xe49a4d);
      else color.setHex(0xffe6a9);
      colors.set([color.r, color.g, color.b], i * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.translate(-(bounds.min.x + bounds.max.x) * .5, -bounds.min.y, -(bounds.min.z + bounds.max.z) * .5);

    const ship = new THREE.Mesh(geometry, new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      roughness: .62,
      metalness: .04,
      clearcoat: .12,
      clearcoatRoughness: .55,
      emissive: 0x6a290a,
      emissiveIntensity: 1.15
    }));
    ship.scale.setScalar(.13);
    // 龍骨沉入水面下，僅保留吃水線以上的船體與桅杆。
    ship.position.y = -1.35;
    boat.add(ship);
    boat.userData.ship = ship;
  } catch (error) {
    console.error('無法載入 pirateship.stl', error);
  }
}

const boat = buildBoat();
// WGS84 coordinates are the source of truth. One scene unit represents four km,
// keeping Taiwan visible without pretending that the ship itself is kilometres long.
const TAIWAN_REFERENCE = { latitude: 23.70, longitude: 121.00 };
const WORLD_UNITS_PER_KM = .25;
const KM_PER_LATITUDE_DEGREE = 110.574;
const KM_PER_LONGITUDE_DEGREE = 111.320 * Math.cos(THREE.MathUtils.degToRad(TAIWAN_REFERENCE.latitude));
const TAIWAN_EAST_COAST_START = { latitude: 24.070, longitude: 122.000 };

function geoToWorld({ latitude, longitude }) {
  return new THREE.Vector2(
    (longitude - TAIWAN_REFERENCE.longitude) * KM_PER_LONGITUDE_DEGREE * WORLD_UNITS_PER_KM,
    -(latitude - TAIWAN_REFERENCE.latitude) * KM_PER_LATITUDE_DEGREE * WORLD_UNITS_PER_KM
  );
}

function worldToGeo(x, z) {
  return {
    latitude: TAIWAN_REFERENCE.latitude - z / (KM_PER_LATITUDE_DEGREE * WORLD_UNITS_PER_KM),
    longitude: TAIWAN_REFERENCE.longitude + x / (KM_PER_LONGITUDE_DEGREE * WORLD_UNITS_PER_KM)
  };
}

const taiwanCoastline = [
  [25.30, 121.57], [25.22, 121.70], [24.96, 121.84], [24.53, 121.84],
  [24.05, 121.72], [23.54, 121.51], [23.05, 121.40], [22.53, 120.86],
  [22.00, 120.63], [21.90, 120.85], [22.10, 120.98], [22.54, 120.74],
  [23.05, 120.25], [23.58, 120.12], [24.05, 120.24], [24.59, 120.40],
  [25.04, 121.03], [25.30, 121.57]
].map(([latitude, longitude]) => geoToWorld({ latitude, longitude }));

function addTaiwan() {
  const center = taiwanCoastline.reduce((total, point) => total.add(point), new THREE.Vector2()).multiplyScalar(1 / taiwanCoastline.length);
  const vertices = [];
  for (let index = 0; index < taiwanCoastline.length - 1; index++) {
    const a = taiwanCoastline[index];
    const b = taiwanCoastline[index + 1];
    vertices.push(center.x, .35, center.y, a.x, .35, a.y, b.x, .35, b.y);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  const island = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: 0x426348,
    roughness: .92,
    metalness: 0,
    flatShading: true,
    side: THREE.DoubleSide
  }));
  scene.add(island);

}

function isOnTaiwan(x, z) {
  let inside = false;
  for (let i = 0, j = taiwanCoastline.length - 1; i < taiwanCoastline.length; j = i++) {
    const a = taiwanCoastline[i];
    const b = taiwanCoastline[j];
    const crosses = (a.y > z) !== (b.y > z) && x < (b.x - a.x) * (z - a.y) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

const startingWorldPosition = geoToWorld(TAIWAN_EAST_COAST_START);
boat.position.set(startingWorldPosition.x, .08, startingWorldPosition.y);
boat.rotation.y = Math.PI / 2;
scene.add(boat);
loadPirateShip(boat);
addTaiwan();

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
controls.minDistance = 10;
controls.maxDistance = 160;
controls.enabled = false;
let orbitMode = false;
let velocity = 0;
let collisionPulse = 0;
const keys = new Set();
const targetCamera = new THREE.Vector3();
const targetLook = new THREE.Vector3();
const forward = new THREE.Vector2();
const starboard = new THREE.Vector2();
const windDirection = new THREE.Vector2();
const clock = new THREE.Clock();

addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  keys.add(key);
  if (key === 'c' && !event.repeat) {
    orbitMode = !orbitMode;
    controls.enabled = orbitMode;
    if (orbitMode) controls.target.copy(boat.position);
  }
  if (key === 'r' && !event.repeat) {
    velocity = 0;
    boat.position.set(startingWorldPosition.x, .08, startingWorldPosition.y);
    boat.rotation.set(0, Math.PI / 2, 0);
  }
  if (key === 't' && !event.repeat) {
    setTimeOfDay(timeOfDay === 'morning' ? 'night' : 'morning');
  }
});
addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function animate() {
  const delta = Math.min(clock.getDelta(), .05);
  const elapsed = clock.elapsedTime;
  const windAngle = .72 + Math.sin(elapsed * .018) * .58;
  const windSpeed = 13 + Math.sin(elapsed * .041) * 2.5;
  windDirection.set(Math.sin(windAngle), Math.cos(windAngle));
  forward.set(-Math.sin(boat.rotation.y), -Math.cos(boat.rotation.y));
  starboard.set(-forward.y, forward.x);
  const windAlignment = forward.dot(windDirection);
  const throttle = (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0);
  const engineForce = throttle > 0 ? 18 : throttle < 0 ? -13 : 0;
  const windForce = windAlignment * windSpeed * .13;
  velocity += (engineForce + windForce - velocity * .45) * delta;
  velocity = THREE.MathUtils.clamp(velocity, -18, 36);
  const steer = (keys.has('a') ? 1 : 0) - (keys.has('d') ? 1 : 0);
  boat.rotation.y += steer * delta * (.36 + Math.abs(velocity) * .035) * Math.sign(velocity || 1);
  forward.set(-Math.sin(boat.rotation.y), -Math.cos(boat.rotation.y));
  starboard.set(-forward.y, forward.x);
  const sideDrift = starboard.dot(windDirection) * windSpeed * (.018 + Math.abs(velocity) * .0022);
  boat.position.x += (forward.x * velocity + starboard.x * sideDrift) * delta;
  boat.position.z += (forward.y * velocity + starboard.y * sideDrift) * delta;

  if (isOnTaiwan(boat.position.x, boat.position.z)) {
    boat.position.x -= (forward.x * velocity + starboard.x * sideDrift) * delta;
    boat.position.z -= (forward.y * velocity + starboard.y * sideDrift) * delta;
    velocity *= -.16;
    collisionPulse = 1;
  }
  const worldLimit = 160;
  if (Math.abs(boat.position.x) > worldLimit || Math.abs(boat.position.z) > worldLimit) {
    boat.position.x = THREE.MathUtils.clamp(boat.position.x, -worldLimit, worldLimit);
    boat.position.z = THREE.MathUtils.clamp(boat.position.z, -worldLimit, worldLimit);
    velocity *= -.22;
    collisionPulse = 1;
  }
  collisionPulse = Math.max(0, collisionPulse - delta * 2.4);

  const bowWave = seaHeight(boat.position.x + forward.x * 4.5, boat.position.z + forward.y * 4.5, elapsed);
  const sternWave = seaHeight(boat.position.x - forward.x * 4.5, boat.position.z - forward.y * 4.5, elapsed);
  const portWave = seaHeight(boat.position.x - starboard.x * 2, boat.position.z - starboard.y * 2, elapsed);
  const starboardWave = seaHeight(boat.position.x + starboard.x * 2, boat.position.z + starboard.y * 2, elapsed);
  const centerWave = seaHeight(boat.position.x, boat.position.z, elapsed);
  const targetPitch = Math.atan2(sternWave - bowWave, 9);
  const targetRoll = Math.atan2(portWave - starboardWave, 4) - sideDrift * .012 + collisionPulse * .07;
  boat.position.y = THREE.MathUtils.lerp(boat.position.y, centerWave + .08, 1 - Math.pow(.002, delta));
  boat.rotation.x = THREE.MathUtils.lerp(boat.rotation.x, targetPitch, 1 - Math.pow(.006, delta));
  boat.rotation.z = THREE.MathUtils.lerp(boat.rotation.z, targetRoll, 1 - Math.pow(.006, delta));
  const wakeForce = THREE.MathUtils.clamp(Math.abs(velocity) / 30, 0, 1);
  boat.userData.wake.material.uniforms.time.value = elapsed;
  boat.userData.wake.material.uniforms.strength.value = wakeForce * .58;
  water.material.uniforms.time.value += delta * (.65 + wakeForce * 4.5);

  const atmosphericDrift = elapsed * .012;
  const isNight = timeOfDay === 'night';
  const baseElevation = isNight ? 34 : 5;
  const elevation = baseElevation + Math.sin(atmosphericDrift) * (isNight ? 5 : 4.5);
  const azimuth = (isNight ? -35 : 180) + atmosphericDrift * (isNight ? 18 : 24);
  sun.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elevation), THREE.MathUtils.degToRad(azimuth));
  skyUniforms.sunPosition.value.copy(sun);
  water.material.uniforms.sunDirection.value.copy(sun).normalize();
  directional.position.copy(sun).multiplyScalar(3500);
  moon.position.copy(sun).multiplyScalar(5000);
  if (skyUniforms.cloudCoverage) skyUniforms.cloudCoverage.value = (isNight ? .16 : .28) + Math.sin(elapsed * .09) * .035;
  if (skyUniforms.cloudDensity) skyUniforms.cloudDensity.value = (isNight ? .26 : .48) + Math.sin(elapsed * .07 + 1.2) * .045;

  if (!orbitMode) {
    targetCamera.set(7.8, 9 + wakeForce * .7, 25 + wakeForce * 6.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), boat.rotation.y).add(boat.position);
    camera.position.lerp(targetCamera, 1 - Math.pow(.0006, delta));
    targetLook.set(0, 2.4, -wakeForce * 5).applyAxisAngle(new THREE.Vector3(0, 1, 0), boat.rotation.y).add(boat.position);
    camera.lookAt(targetLook);
    camera.rotateZ(-steer * wakeForce * .018);
    camera.fov = THREE.MathUtils.lerp(camera.fov, 55 + wakeForce * 9, 1 - Math.pow(.02, delta));
    camera.updateProjectionMatrix();
  } else {
    controls.target.lerp(boat.position, .08);
    controls.update();
  }
  speedReadout.textContent = Math.abs(velocity * 1.94).toFixed(1);
  const compass = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const windIndex = Math.round((Math.atan2(windDirection.x, windDirection.y) / (Math.PI * 2)) * 8 + 8) % 8;
  windReadout.textContent = `WIND · ${compass[windIndex]} ${windSpeed.toFixed(0)} kn`;
  const headingDegrees = (THREE.MathUtils.radToDeg(-boat.rotation.y) + 360) % 360;
  const headingIndex = Math.round(headingDegrees / 45) % 8;
  compassDial.style.transform = `rotate(${-headingDegrees}deg)`;
  headingReadout.textContent = `${String(Math.round(headingDegrees)).padStart(3, '0')}° ${compass[headingIndex]}`;
  const coordinates = worldToGeo(boat.position.x, boat.position.z);
  const latitudeHemisphere = coordinates.latitude >= 0 ? 'N' : 'S';
  const longitudeHemisphere = coordinates.longitude >= 0 ? 'E' : 'W';
  positionReadout.textContent = `${Math.abs(coordinates.latitude).toFixed(3)}° ${latitudeHemisphere} · ${Math.abs(coordinates.longitude).toFixed(3)}° ${longitudeHemisphere}`;
  renderer.render(scene, camera);
}

camera.position.set(7.8, 9, 25);
setTimeOfDay('morning');
loading?.remove();
renderer.setAnimationLoop(animate);
