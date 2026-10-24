import {TIME_LIGHTING,TIME_MODES,TIME_MODE_PHASE,TIME_MODE_NAMES,solarAngles} from './day-cycle.js';
import {refineOceanSurface} from './ocean-surface.js';
import { state } from './state.js';
import { YACHT_PAINTS, buildYacht } from './yacht.js';
import { FIGHTER_PAINTS, buildFighter } from './fighter.js';
import {YACHT_SPEED_FACTOR} from './vehicle-speeds.js';
import { onQualityChange, quality } from './quality.js';
import * as THREE from 'three';
import { Sky } from './vendor/Sky.js';
import { Water } from 'three/examples/jsm/objects/Water.js';
import shipModelUrl from './Data/pirateship.bin';
import { markLoaded } from './data-loader.js';
import { REGIONS } from './regions.js';
import waterNormalsUrl from './Data/waternormals.jpg';
import { ELUANBI_LIGHTHOUSE, ELUANBI_OFFSHORE_START, geoToWorld } from './geo.js';

const container = document.querySelector('#app');
export const loading = document.querySelector('#loading');
export const speedReadout = document.querySelector('#speed');
const moodReadout = document.querySelector('#mood');
const weatherReadout = document.querySelector('#weather');
export const windReadout = document.querySelector('#wind');
export const compassDial = document.querySelector('#compass-dial');
export const headingReadout = document.querySelector('#heading');
export const positionReadout = document.querySelector('#position');
export const landDistanceReadout = document.querySelector('#land-distance');
export const fpsReadout = document.querySelector('#fps');
const paintToggle = document.querySelector('#paint-toggle');
const paintOptions = document.querySelector('#paint-options');
const paintButtons = [...document.querySelectorAll('[data-paint]')];
// Galleon paint schemes, one colour per part of the ship (see SHIP_PARTS): antifouled bottom, two tones of hull planking,
// gilded gunwale trim, deck, masts and spars, sail canvas and its accent band, the pennant, the dark wale, the gun-deck band,
// the raised fore and aft castles, the carved stern gallery, the gilt bow and figurehead, and the shrouds and rigging.
const SHIP_PARTS = { bottom: 0, plankA: 1, plankB: 2, trim: 3, deck: 4, mast: 5, sail: 6, sailBand: 7, flag: 8, wale: 9, gunBand: 10, castle: 11, gallery: 12, bowGilt: 13, rigging: 14 };
const G = (bottom, plankA, plankB, trim, deck, mast, sail, sailBand, flag, wale, gunBand, castle, gallery, bowGilt, rigging) => [bottom, plankA, plankB, trim, deck, mast, sail, sailBand, flag, wale, gunBand, castle, gallery, bowGilt, rigging];
const shipPaints = {
  //                bottom    plankA    plankB    trim      deck      mast      sail      sailBand  flag      wale      gunBand   castle    gallery   bowGilt   rigging
  default: { parts: G(0x7a2416, 0x7a4524, 0x66381c, 0xe0b04a, 0xa8784a, 0x4a2c18, 0xf1e4c4, 0xb8322a, 0xc8102e, 0x18110c, 0xc9892c, 0xa8321e, 0xe8b84e, 0xe8b84e, 0x2e2216), emissive: 0x2a1408 },
  blue: { parts: G(0x1d1d22, 0x123c6b, 0x0d2f56, 0xece6d4, 0xa07c55, 0x3a2a1c, 0xf7f5ee, 0x1f5fa8, 0x1f5fa8, 0xf4f2ea, 0xe6c35a, 0x2a5f9e, 0xf4f2ea, 0xd8c27a, 0x2a2420), emissive: 0x081830 },
  gold: { parts: G(0x3b1408, 0x7a2e12, 0x66240f, 0xf2c14e, 0xb0783e, 0x4a2a14, 0xf6dba8, 0xe07a1f, 0xf2c14e, 0x2a1408, 0x1e3a5c, 0xa8461c, 0xf2c14e, 0xf2c14e, 0x3a2614), emissive: 0x2e1606 },
  black: { parts: G(0x6a1212, 0x1e1e22, 0x151518, 0xc9a24a, 0x5a4030, 0x2a1d14, 0xe6dfd0, 0x18181b, 0x111111, 0xc9a24a, 0x6a1212, 0x2a2a30, 0xc9a24a, 0xc9a24a, 0x1a1410), emissive: 0x100c08 }
};
// each ship keeps its own scheme; both are remembered in this browser
const activePaint = { galleon: 'default', yacht: 'pearl', fighter:'slate' };
try { Object.assign(activePaint, JSON.parse(localStorage.getItem('relax-paint') ?? '{}')); } catch { /* private mode */ }
export const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x8aaec0, 0.000075);

export const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, .05, 20000);
export const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
onQualityChange((q) => { renderer.setPixelRatio(Math.min(devicePixelRatio, q.pixelRatio)); renderer.setSize(innerWidth, innerHeight); });
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.22;
container.append(renderer.domElement);
renderer.domElement.style.visibility = 'hidden';   // revealed (and the quick 2D fallback ocean removed) once the world has loaded
export function revealGame() {
  window.__oceanFallback?.stop();
  window.__oceanFallback?.canvas.remove();
  renderer.domElement.style.visibility = '';
}

function setShipPaint(name) {
  const valid = shipType === 'yacht' ? YACHT_PAINTS : shipType==='fighter'?FIGHTER_PAINTS:shipPaints;
  if (valid[name]) activePaint[shipType] = name;
  const current = activePaint[shipType] in valid ? activePaint[shipType] : Object.keys(valid)[0];
  try { localStorage.setItem('relax-paint', JSON.stringify(activePaint)); } catch { /* ignore */ }
  const ship = boat?.userData.ship;
  ship?.userData.paint?.(current);
  if (ship?.userData.paintLevels) {
    const palette = shipPaints[current];
    const colors = ship.geometry.attributes.color;
    const swatches = palette.parts.map((hex) => new THREE.Color(hex));
    for (let i = 0; i < colors.count; i++) {
      const color = swatches[ship.userData.paintLevels[i]];
      colors.setXYZ(i, color.r, color.g, color.b);
    }
    colors.needsUpdate = true;
    ship.material.emissive.setHex(palette.emissive);
  }
  // only the current ship's swatches are offered
  paintButtons.forEach((button) => {
    button.hidden = button.dataset.for !== shipType;
    button.classList.toggle('is-active', button.dataset.paint === current);
  });
}

paintToggle?.addEventListener('click', () => {
  const open = paintOptions.hidden;
  paintOptions.hidden = !open;
  paintToggle.setAttribute('aria-expanded', String(open));
});
paintButtons.forEach((button) => button.addEventListener('click', () => {
  setShipPaint(button.dataset.paint);
  paintOptions.hidden = true;
  paintToggle.setAttribute('aria-expanded', 'false');
}));

export const water = new Water(new THREE.PlaneGeometry(10000, 10000), {
  textureWidth: 1024,
  textureHeight: 1024,
  waterNormals: new THREE.TextureLoader().load(waterNormalsUrl, (texture) => {
    markLoaded('water');
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  }),
  sunDirection: new THREE.Vector3(),
  sunColor: 0xffffff,
  waterColor: 0x001e0f,
  distortionScale: 3.7,
  fog: true
});
water.rotation.x = -Math.PI / 2;
// Keep the official example's detailed waves at the scale of our miniature vessel.
refineOceanSurface(water);
water.material.uniforms.size.value=1;
// Retain the official Water reflection pass for the sky and sunset, while
// omitting nearby scene objects that would create distracting mirror images.
export const reflectionExclusions = [];
const renderWaterReflection = water.onBeforeRender;
let reflectionFrame = 0;
water.onBeforeRender = function (...args) {
  if (reflectionFrame++ % quality.reflectEvery) return;   // lower quality refreshes the mirror image less often
  const previousVisibility = reflectionExclusions.map((object) => object.visible);
  reflectionExclusions.forEach((object) => { object.visible = false; });
  try {renderWaterReflection.call(this, ...args);}
  finally {reflectionExclusions.forEach((object, index) => { object.visible = previousVisibility[index]; });}
};
scene.add(water);

export const sky = new Sky();
sky.scale.setScalar(10000);
scene.add(sky);
export const skyUniforms = sky.material.uniforms;
skyUniforms.turbidity.value = 10;
skyUniforms.rayleigh.value = 2;
skyUniforms.mieCoefficient.value = 0.005;
skyUniforms.mieDirectionalG.value = 0.8;
if (skyUniforms.cloudCoverage) skyUniforms.cloudCoverage.value = 0.22;
if (skyUniforms.cloudDensity) skyUniforms.cloudDensity.value = 0.42;
if (skyUniforms.cloudElevation) skyUniforms.cloudElevation.value = 0.36;

export const sun = new THREE.Vector3();
const hemisphere = new THREE.HemisphereLight(0xa7ddff, 0x0a1d2b, 1.4);
const ambient = new THREE.AmbientLight(0xfff2dc, 0.45);
export const directional = new THREE.DirectionalLight(0xffedbd, 1.4);
scene.add(hemisphere, ambient, directional);

export const moon = new THREE.Mesh(
  new THREE.SphereGeometry(62, 32, 20),
  new THREE.MeshBasicMaterial({ color: 0xe7efff })
);
moon.visible = false;
scene.add(moon);

const rainMaterial = new THREE.MeshBasicMaterial({
  color: 0xc5edff, transparent: true, opacity: 0, depthWrite: false
});
const rain = new THREE.Group();
const rainDrops = [];
for (let i = 0; i < 180; i++) {
  const drop = new THREE.Mesh(new THREE.PlaneGeometry(.025, .75), rainMaterial);
  drop.position.set((Math.random() - .5) * 26, Math.random() * 16, (Math.random() - .5) * 26);
  drop.userData = { speed: 13 + Math.random() * 12, drift: .35 + Math.random() * .45 };
  rain.add(drop);
  rainDrops.push(drop);
}
rain.visible = false;
scene.add(rain);

const weather = { mist: 0, rain: 0, label: 'CLEAR' };
export let timeOfDay = 'sunrise';

// Three fixed scenic times; the sun stays close to the correct horizon.
export const dayCycle = { mode: 'sunrise', phase: TIME_MODE_PHASE.sunrise };
export const TIME_MODE_LIST = TIME_MODES.map((id) => ({ id, name: TIME_MODE_NAMES[id] }));
export function cycleTimeMode() { setTimeMode(TIME_MODES[(TIME_MODES.indexOf(dayCycle.mode) + 1) % TIME_MODES.length]); }
export function setTimeMode(mode) {
  if(mode==='afternoon')mode='sunset';
  if (!TIME_MODES.includes(mode)) return;
  dayCycle.mode = mode;
  dayCycle.phase = TIME_MODE_PHASE[mode];
  const hint = document.querySelector('#time-mode');
  if (hint) hint.textContent = TIME_MODE_NAMES[mode];
}
const timeParam=new URLSearchParams(location.search).get('time');
if(timeParam)setTimeMode(timeParam);

// the per-frame base values; updateWeather() layers mist, rain and storms on top
export const skyBase = { exposure: .3, fog: .00004, turbidity: 10, cloud: .16, density: .3, distortion: 3.7 };
export const lightning = { level: 0 };      // lightning flash strength, set by weather-fx.js
const moonDirection = new THREE.Vector3(), lightDirection = new THREE.Vector3();
let hemisphereBase = 1.4, ambientBase = .45;
export function updateDayCycle(delta) {
  const phase = dayCycle.phase;
  const {elevation,azimuth}=solarAngles(phase);
  sun.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elevation), THREE.MathUtils.degToRad(azimuth));
  moonDirection.copy(sun).negate();
  const day = dayCycle.mode === 'night' ? 0 : 1;
  const lighting = TIME_LIGHTING[dayCycle.mode];
  for(const key of ['exposure','fog','turbidity','cloud','density','distortion'])skyBase[key]=lighting[key];
  skyUniforms.rayleigh.value = lighting.rayleigh;
  skyUniforms.mieCoefficient.value = lighting.mie;
  skyUniforms.mieDirectionalG.value = lighting.mieG;
  scene.fog.color.setHex(lighting.fogColor);
  water.material.uniforms.sunColor.value.setHex(lighting.sunColor);
  water.material.uniforms.waterColor.value.setHex(lighting.waterColor);
  hemisphere.color.setHex(lighting.hemisphereColor);
  hemisphere.groundColor.setHex(lighting.hemisphereGround);
  ambient.color.setHex(lighting.ambientColor);
  directional.color.setHex(lighting.directionalColor);
  hemisphereBase = lighting.hemisphereIntensity;
  ambientBase = lighting.ambientIntensity;
  directional.intensity = lighting.directionalIntensity;
  hemisphere.intensity = hemisphereBase + lightning.level * 2.4;
  ambient.intensity = ambientBase + lightning.level * .9;
  skyUniforms.sunPosition.value.copy(sun);
  lightDirection.copy(moonDirection).lerp(sun, day).normalize();
  water.material.uniforms.sunDirection.value.copy(lightDirection);
  directional.position.copy(lightDirection).multiplyScalar(3500);
  moon.position.copy(moonDirection).multiplyScalar(5000);
  moon.visible = moonDirection.y > -.05 && day < .95;
  timeOfDay = dayCycle.mode;
  if (moodReadout) moodReadout.textContent = {sunrise:'SUNRISE',sunset:'SUNSET',night:'MOONLIT NIGHT'}[timeOfDay];
}
scene.add(directional);

// ---- Weather ------------------------------------------------------------------------------------
// G cycles: auto (a slow front now and then, thunderstorms and, rarely, a typhoon), clear, mist, rain, thunderstorm, typhoon.
const WEATHER_MODES = ['auto', 'clear', 'mist', 'rain', 'storm', 'typhoon'];
const WEATHER_MODE_NAMES = { auto: '自動', clear: '晴朗', mist: '起霧', rain: '下雨', storm: '雷雨', typhoon: '颱風' };
let weatherMode = 'auto';
export const weatherBlend = { mist: 0, rain: 0, storm: 0, typhoon: 0 };
let weatherAlert = () => {};
export const setWeatherAlert = (callback) => { weatherAlert = callback; };
export const WEATHER_MODE_LIST = WEATHER_MODES.map((id) => ({ id, name: WEATHER_MODE_NAMES[id] }));
export const currentWeatherMode = () => weatherMode;
export function cycleWeatherMode() { setWeatherMode(WEATHER_MODES[(WEATHER_MODES.indexOf(weatherMode) + 1) % WEATHER_MODES.length]); }
export function setWeatherMode(mode) {
  if (!WEATHER_MODES.includes(mode)) return;
  weatherMode = mode;
  const hint = document.querySelector('#weather-mode');
  if (hint) hint.textContent = WEATHER_MODE_NAMES[weatherMode];
}
const ramp = (x, a, b) => THREE.MathUtils.smoothstep(x, a, b);
let stormAlerted = false, typhoonAlerted = false;
export function updateWeather(elapsed, delta) {
  // A slow sea-weather front (clear, lifting mist, a rain band) plus storms every 8 minutes and a typhoon every 25.
  const phase = elapsed % 52;
  let targetMist = ramp(phase, 15, 20) * (1 - ramp(phase, 31, 36));
  let targetRain = ramp(phase, 31, 36) * (1 - ramp(phase, 48, 52));
  const stormClock = elapsed % 480, typhoonClock = elapsed % 1500;
  const autoStorm = ramp(stormClock, 330, 350) * (1 - ramp(stormClock, 420, 445));
  const autoTyphoon = ramp(typhoonClock, 900, 960) * (1 - ramp(typhoonClock, 1080, 1140));
  let targetStorm = Math.max(autoStorm, autoTyphoon), targetTyphoon = autoTyphoon;
  if (weatherMode === 'clear') { targetMist = 0; targetRain = 0; targetStorm = 0; targetTyphoon = 0; }
  else if (weatherMode === 'mist') { targetMist = 1; targetRain = 0; targetStorm = 0; targetTyphoon = 0; }
  else if (weatherMode === 'rain') { targetMist = .35; targetRain = 1; targetStorm = 0; targetTyphoon = 0; }
  else if (weatherMode === 'storm') { targetMist = .3; targetRain = .9; targetStorm = 1; targetTyphoon = 0; }
  else if (weatherMode === 'typhoon') { targetMist = .45; targetRain = 1; targetStorm = 1; targetTyphoon = 1; }
  else { targetRain = Math.max(targetRain, .85 * targetStorm, targetTyphoon); targetMist = Math.max(targetMist, .3 * targetStorm, .45 * targetTyphoon); }
  const follow = 1 - Math.exp(-delta * 1.2), slowFollow = 1 - Math.exp(-delta * .6);
  weatherBlend.mist += (targetMist - weatherBlend.mist) * follow;
  weatherBlend.rain += (targetRain - weatherBlend.rain) * follow;
  weatherBlend.storm += (targetStorm - weatherBlend.storm) * slowFollow;
  weatherBlend.typhoon += (targetTyphoon - weatherBlend.typhoon) * slowFollow;
  const mist = weatherBlend.mist, rainAmount = weatherBlend.rain, storm = weatherBlend.storm, typhoon = weatherBlend.typhoon;
  // warnings: once when a storm or typhoon builds, re-armed when it has passed
  if (typhoon > .15 && !typhoonAlerted) { typhoonAlerted = true; weatherAlert('颱風接近！海面將變得非常危險'); }
  else if (storm > .35 && typhoon < .1 && !stormAlerted) { stormAlerted = true; weatherAlert('雷雨雲接近，注意閃電'); }
  if (typhoon < .03) typhoonAlerted = false;
  if (storm < .05) stormAlerted = false;
  weather.mist = mist;
  weather.rain = rainAmount;
  weather.label = typhoon > .3 ? 'TYPHOON' : storm > .3 ? 'THUNDERSTORM' : rainAmount > .08 ? 'RAIN' : mist > .08 ? 'SEA MIST' : 'CLEAR';
  if (weatherReadout) weatherReadout.textContent = `WEATHER · ${weather.label}`;

  const base = skyBase;
  scene.fog.density = base.fog + mist * .00055 + rainAmount * .0002 + typhoon * .0004;
  skyUniforms.turbidity.value = base.turbidity + mist * 7 + rainAmount * 13 + storm * 6;
  if (skyUniforms.cloudCoverage) skyUniforms.cloudCoverage.value = base.cloud + mist * .22 + rainAmount * .46 + storm * .2 + typhoon * .15;
  if (skyUniforms.cloudDensity) skyUniforms.cloudDensity.value = base.density + mist * .18 + rainAmount * .38 + storm * .15;
  water.material.uniforms.distortionScale.value = base.distortion + rainAmount * 1.4 + storm * 1.5 + typhoon * 3.5;
  water.material.uniforms.size.value = 1 / (1 + .35 * storm + .65 * typhoon);
  water.material.uniforms.oceanChop.value = .8 + storm*.3 + typhoon*.35;
  renderer.toneMappingExposure = base.exposure * (1 - .35 * storm - .15 * typhoon) * (1 + lightning.level * 1.8);
  if (skyUniforms.cloudCoverage) skyUniforms.cloudCoverage.value += Math.sin(elapsed * .09) * .018;
  if (skyUniforms.cloudDensity) skyUniforms.cloudDensity.value += Math.sin(elapsed * .07 + 1.2) * .022;

  rain.visible = rainAmount > .01;
  rainMaterial.opacity = rainAmount * (.58 + storm * .15);
  rain.position.set(boat.position.x, 0, boat.position.z);
  const gust = 1 + storm + typhoon * 3;
  for (const drop of rainDrops) {
    drop.position.y -= drop.userData.speed * delta * (1 + storm * .4);
    drop.position.x += windDirection.x * drop.userData.drift * delta * 5 * gust;
    drop.position.z += windDirection.y * drop.userData.drift * delta * 5 * gust;
    if (drop.position.y < -.15) {
      drop.position.y = 15 + Math.random() * 3;
      drop.position.x = (Math.random() - .5) * 26;
      drop.position.z = (Math.random() - .5) * 26;
    }
  }
}

function buildBoat() {
  const boat = new THREE.Group();
  // Foam that stays put on the water (noise is anchored to world position) while
  // the hull moves away from it, so a trail looks like churned water rather than
  // a decal dragged along behind the boat.
  const wakeUniforms = { time: { value: 0 }, strength: { value: 0 } };
  const foamVertexShader = `
    varying vec2 vUv;
    varying vec3 vWorld;
    void main() {
      vUv = uv;
      vec4 world = modelMatrix * vec4(position, 1.0);
      vWorld = world.xyz;
      gl_Position = projectionMatrix * viewMatrix * world;
    }
  `;
  const foamFragmentShader = `
    uniform float time;
    uniform float strength;
    uniform float fadePower;
    uniform float coreSharpness;
    uniform float foamBias;
    uniform float noiseScale;
    uniform float swirl;
    varying vec2 vUv;
    varying vec3 vWorld;

    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    float vnoise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
                 mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float fbm(vec2 p) {
      float sum = 0.0, amp = 0.5;
      for (int i = 0; i < 5; i++) {
        sum += amp * vnoise(p);
        p = p * 2.03 + vec2(17.1, 9.7);
        amp *= 0.5;
      }
      return sum;
    }

    void main() {
      float across = abs(vUv.x * 2.0 - 1.0);
      float along = vUv.y;
      float moving = smoothstep(0.04, 0.2, strength);
      float reach = mix(0.35, 1.0, clamp(strength / 0.82, 0.0, 1.0));
      float fade = pow(clamp(1.0 - along / reach, 0.0, 1.0), fadePower);
      float core = pow(clamp(1.0 - across, 0.0, 1.0), coreSharpness);
      float density = core * fade;

      vec2 q = vWorld.xz * noiseScale;
      vec2 drift = vec2(time * 0.04, -time * 0.025);
      vec2 warp = vec2(vnoise(q * 0.6 + drift) - 0.5, vnoise(q * 0.6 - drift + 7.3) - 0.5) * swirl;
      float body = fbm(q + warp + drift);
      float lace = fbm(q * 2.7 - warp * 1.6 - drift * 2.0);
      float foam = smoothstep(0.62 - density * foamBias, 0.80 - density * foamBias * 0.55, body * 0.7 + lace * 0.45);
      float bubbles = smoothstep(0.72, 0.9, vnoise(q * 9.0 + drift * 3.0)) * density;
      float aerated = density * 0.32;
      float whiteness = clamp(foam + bubbles * 0.7, 0.0, 1.0);
      float alpha = clamp(max(aerated, whiteness) * 0.95, 0.0, 1.0) * moving;
      vec3 water = vec3(0.50, 0.78, 0.82);
      vec3 color = mix(water, vec3(0.97, 0.99, 1.0), whiteness);
      gl_FragColor = vec4(color, alpha);
    }
  `;
  const makeFoamMaterial = (settings) => new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    toneMapped: false,
    side: THREE.DoubleSide,
    uniforms: {
      time: wakeUniforms.time,
      strength: wakeUniforms.strength,
      fadePower: { value: settings.fadePower },
      coreSharpness: { value: settings.coreSharpness },
      foamBias: { value: settings.foamBias },
      noiseScale: { value: settings.noiseScale },
      swirl: { value: settings.swirl }
    },
    vertexShader: foamVertexShader,
    fragmentShader: foamFragmentShader
  });
  const trailMaterial = makeFoamMaterial({ fadePower: 1.15, coreSharpness: .75, foamBias: .5, noiseScale: 55, swirl: 1.2 });
  const churnMaterial = makeFoamMaterial({ fadePower: 1.0, coreSharpness: .55, foamBias: .65, noiseScale: 65, swirl: 1.8 });
  const bowMaterial = makeFoamMaterial({ fadePower: 1.4, coreSharpness: .9, foamBias: .55, noiseScale: 70, swirl: 1.0 });

  // Everything below is in the ship's own units (hull about 9.4 long, 3.9 wide;
  // the bow points to -z), with the water surface at y = -2.14.
  const WATER_Y = -2.143;
  // A ribbon along `centre(t)` with a raised ridge down its middle: a perfectly
  // flat strip foreshortens to nothing from a low helm-camera angle.
  const buildRibbon = (segments, halfWidthAt, centreAt, crestAt, material) => {
    const vertices = [], uvs = [], indices = [];
    const across = [-1, -.5, 0, .5, 1];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const [cx, cz] = centreAt(t);
      const halfWidth = halfWidthAt(t);
      for (const a of across) {
        const ridge = 1 - Math.abs(a) ** 1.5;
        vertices.push(cx + a * halfWidth, WATER_Y + .12 + crestAt(t) * ridge, cz);
        uvs.push((a + 1) / 2, t);
      }
      if (i < segments) {
        for (let k = 0; k < across.length - 1; k++) {
          const a = i * across.length + k, b = a + 1, c = a + across.length, d = c + 1;
          indices.push(a, b, d, a, d, c);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setIndex(indices);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 2;
    mesh.frustumCulled = false;
    return mesh;
  };

  const wake = new THREE.Group();
  for (const side of [-1, 1]) {
    // Trailing V: leaves the stern corners and opens out behind the boat.
    wake.add(buildRibbon(48,
      (t) => 1.2 + t * 3.4,
      (t) => [side * (1.7 + t * 15), 4.2 + t * 52],
      (t) => .38 * (1 - t * .75),
      trailMaterial));
    // Bow wave: curls away from the stem and runs back along the hull.
    wake.add(buildRibbon(24,
      (t) => .55 + t * .45,
      (t) => [side * (.35 + 2.1 * Math.sqrt(t)), -4.9 + t * 9.4],
      (t) => .3 * (1 - t * .6),
      bowMaterial));
  }
  // Churned white water right behind the transom.
  wake.add(buildRibbon(14,
    (t) => 2.1 + t * 1.2,
    (t) => [0, 3.6 + t * 15],
    (t) => .28 * (1 - t * .5),
    churnMaterial));
  wake.material = { uniforms: wakeUniforms };
  boat.add(wake);
  boat.userData.wake = wake;
  return boat;
}

// Night lighting: red/green side lights, a white masthead light and a warm lantern glow amidships.
export const boatLights = new THREE.Group();
boatLights.visible = false;
function lightSprite(color, size) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  sprite.scale.setScalar(size);
  return sprite;
}
let glowTextureCache = null;
export function glowTexture() {
  if (glowTextureCache) return glowTextureCache;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(.25, 'rgba(255,255,255,.55)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  glowTextureCache = new THREE.CanvasTexture(canvas);
  return glowTextureCache;
}
// Night lighting for the boat: red/green side lights and a white masthead light on the bow, a white stern light, warm deck lanterns,
// and a forward searchlight (a real spotlight that lights the sea and shore ahead, a visible beam and a pool of light on the water).
const HEADLAMP_BEAM_VERTEX = `
  attribute float aFade;
  varying float vFade;
  void main() { vFade = aFade; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const HEADLAMP_BEAM_FRAGMENT = `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vFade;
  void main() { gl_FragColor = vec4(uColor * vFade, vFade * uOpacity); }`;
function addBoatLights(boat, bounds, scale, offsetY) {
  const size = bounds.getSize(new THREE.Vector3());
  const halfWidth = size.x * .5 * scale, halfLength = size.z * .5 * scale;
  const topY = size.y * scale + offsetY;
  const deckY = topY * .32;
  const bowZ = bounds.min.z * scale * .92, sternZ = halfLength * .85;                 // the bow points to -z
  const red = lightSprite(0xff3b30, .09); red.position.set(-halfWidth * .8, deckY, bowZ * .6);
  const green = lightSprite(0x30ff6a, .09); green.position.set(halfWidth * .8, deckY, bowZ * .6);
  const mast = lightSprite(0xfff2c8, .11); mast.position.set(0, topY, 0);
  const stern = lightSprite(0xffffff, .09); stern.position.set(0, deckY + .1, sternZ);
  const lantern = lightSprite(0xffb050, .16); lantern.position.set(0, deckY + .05, 0);
  const bowLantern = lightSprite(0xffb050, .12); bowLantern.position.set(0, deckY + .04, bowZ);
  const lamp = new THREE.PointLight(0xffb868, 1.4, 1.6, 1.6);
  lamp.position.set(0, deckY + .08, 0);
  boatLights.add(red, green, mast, stern, lantern, bowLantern, lamp);

  // the searchlight on the bow
  const lampY = deckY + .1, ahead = 4.6 / boat.scale.x;                       // beam length in the boat's own units
  const spot = new THREE.SpotLight(0xfff0cc, 14, 9, .34, .6, 1.2);
  spot.position.set(0, lampY, bowZ);
  spot.target.position.set(0, lampY - ahead * .03, bowZ - ahead);
  boatLights.add(spot, spot.target);
  const cone = new THREE.ConeGeometry(ahead * .17, ahead, 20, 1, true);
  cone.rotateX(Math.PI / 2);
  cone.translate(0, 0, -ahead / 2);
  const fade = new Float32Array(cone.attributes.position.count);
  for (let k = 0; k < fade.length; k++) fade[k] = Math.pow(1 - Math.min(1, -cone.attributes.position.getZ(k) / ahead), 1.3);
  cone.setAttribute('aFade', new THREE.BufferAttribute(fade, 1));
  const beam = new THREE.Mesh(cone, new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0xfff2cc) }, uOpacity: { value: .3 } },
    vertexShader: HEADLAMP_BEAM_VERTEX, fragmentShader: HEADLAMP_BEAM_FRAGMENT,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
  }));
  beam.position.set(0, lampY - .01, bowZ);
  boatLights.add(beam);
  // the bright pool where the light meets the water
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(ahead * .5, ahead * .5), new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xfff0cc, transparent: true, opacity: .45, depthWrite: false, blending: THREE.AdditiveBlending }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, -2.1, bowZ - ahead * .45);
  boatLights.add(pool);
  boat.add(boatLights);
}
// The ship ships as a compact binary (48 KB instead of a 1.15 MB text STL): 'SHP1', vertex and index counts, the bounding box,
// positions quantised to 16 bits inside that box, then triangle indices. Expanded to flat triangles exactly like the STL was.
async function loadShipGeometry(url) {
  const buffer = await (await fetch(url)).arrayBuffer();
  const view = new DataView(buffer);
  if (String.fromCharCode(...new Uint8Array(buffer, 0, 4)) !== 'SHP1') throw new Error('unknown ship model format');
  const vertexCount = view.getUint32(4, true), indexCount = view.getUint32(8, true);
  const min = [0, 1, 2].map((k) => view.getFloat32(12 + k * 4, true)), max = [0, 1, 2].map((k) => view.getFloat32(24 + k * 4, true));
  const quantised = new Uint16Array(buffer, 36, vertexCount * 3);
  const indexOffset = 36 + vertexCount * 6;
  const indices = vertexCount < 65536 ? new Uint16Array(buffer.slice(indexOffset, indexOffset + indexCount * 2)) : new Uint32Array(buffer.slice(indexOffset, indexOffset + indexCount * 4));
  const positions = new Float32Array(indexCount * 3);
  for (let i = 0; i < indexCount; i++) {
    for (let k = 0; k < 3; k++) positions[i * 3 + k] = min[k] + quantised[indices[i] * 3 + k] / 65535 * (max[k] - min[k]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geometry;
}
// Ship types: the galleon (loaded model) and the yacht (drawn in code). The choice is remembered in this browser.
const shipModels = { galleon: null, yacht: null, fighter:null };
// handling per ship: the yacht is about 35% faster and turns 70% quicker than the galleon
const SHIP_HANDLING = { galleon: { speed: 1, turn: 1 }, yacht: { speed: YACHT_SPEED_FACTOR, turn: 1.7 },fighter:{speed:1,turn:1} };
let shipType = 'galleon';
try { if (['yacht','fighter'].includes(localStorage.getItem('relax-ship'))) shipType = localStorage.getItem('relax-ship'); } catch { /* private mode */ }
export const currentVehicleType=()=>shipType;
function mountShip(type) {
  if (type === 'yacht' && !shipModels.yacht) {
    const yacht = buildYacht();
    const bounds = new THREE.Box3().setFromObject(yacht);
    yacht.userData.lights = [bounds, 1, bounds.min.y];
    shipModels.yacht = yacht;
  }
  if(type==='fighter'&&!shipModels.fighter)shipModels.fighter=buildFighter();
  const model = shipModels[type];
  if (!model) return false;                     // the galleon is still loading
  const previous=shipType;
  shipType = type;
  Object.assign(state.handling, SHIP_HANDLING[type]);
  try { localStorage.setItem('relax-ship', type); } catch { /* ignore */ }
  if (boat.userData.ship) boat.remove(boat.userData.ship);
  boatLights.clear();
  boat.add(model);
  boat.userData.ship = model;
  if(type!=='fighter')addBoatLights(boat, ...model.userData.lights);
  boat.userData.wake.visible=type!=='fighter';
  setShipPaint(activePaint[type]);
  shipTypeButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.ship === shipType));
  if(previous!==type)dispatchEvent(new CustomEvent('vehiclechange',{detail:{previous,type}}));
  return true;
}
const shipTypeButtons = [...document.querySelectorAll('[data-ship]')];
shipTypeButtons.forEach((button) => button.addEventListener('click', () => { mountShip(button.dataset.ship);paintOptions.hidden=true;paintToggle?.setAttribute('aria-expanded','false');button.blur(); }));
async function loadPirateShip(boat) {
  try {
    const geometry = await loadShipGeometry(shipModelUrl);
    markLoaded('ship');
    // 此模型以 Z 為高度、Y 為船身長度；轉成 Three.js 場景使用的 Y-up 座標。
    geometry.rotateX(-Math.PI / 2);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    const height = bounds.max.y - bounds.min.y;
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    const paintLevels = new Uint8Array(geometry.attributes.position.count);   // which SHIP_PARTS entry each vertex belongs to
    // Classify each triangle by its height on the ship and which way it faces: hull bands below the gunwale,
    // broad fore/aft-facing panels up in the rig are sails, everything else up there is masts, spars and rigging.
    const position = geometry.attributes.position, normal = geometry.attributes.normal;
    const ab = new THREE.Vector3(), ac = new THREE.Vector3();
    const halfLength = (bounds.max.z - bounds.min.z) / 2, midZ = (bounds.max.z + bounds.min.z) / 2;
    for (let t = 0; t < position.count; t += 3) {
      let y = 0, nx = 0, ny = 0, nz = 0, z = 0, x = 0, top = -Infinity;
      for (let k = 0; k < 3; k++) { top = Math.max(top, position.getY(t + k)); y += position.getY(t + k) / 3; z += position.getZ(t + k) / 3; x += position.getX(t + k) / 3; nx += normal.getX(t + k); ny += normal.getY(t + k); nz += normal.getZ(t + k); }
      const length = Math.hypot(nx, ny, nz) || 1;
      ab.set(position.getX(t + 1) - position.getX(t), position.getY(t + 1) - position.getY(t), position.getZ(t + 1) - position.getZ(t));
      ac.set(position.getX(t + 2) - position.getX(t), position.getY(t + 2) - position.getY(t), position.getZ(t + 2) - position.getZ(t));
      const area = ab.cross(ac).length() / 2;   // in the model's own units
      const level = (y - bounds.min.y) / height, along = Math.abs(z - midZ) / halfLength;
      let part;
      const topLevel = (top - bounds.min.y) / height;
      const ax = Math.abs(nx / length), ay = Math.abs(ny / length), az = Math.abs(nz / length);
      const offCentre = Math.abs(x - (bounds.min.x + bounds.max.x) / 2) / ((bounds.max.x - bounds.min.x) / 2);
      const bow = z < midZ - halfLength * .82, stern = z > midZ + halfLength * .72;
      const sideways = ax > az && offCentre > .22;                         // panels leaning out to the ship's sides: the shrouds
      if (level < .17) part = SHIP_PARTS.bottom;
      else if (area > .35 && topLevel > .62 && level > .4) part = sideways ? SHIP_PARTS.rigging : SHIP_PARTS.sail;   // big panels reaching up into the rig: the jib is canvas, shrouds are rope
      else if (bow && level > .3 && level < .62) part = SHIP_PARTS.bowGilt;                                       // stem, beakhead and figurehead
      else if (stern && level > .4 && level < .7 && nz / length > .55) part = SHIP_PARTS.gallery;                  // carved stern gallery and windows
      else if (level < .27) part = Math.floor(level * 46) % 3 === 0 ? SHIP_PARTS.plankB : SHIP_PARTS.plankA;
      else if (level < .3) part = SHIP_PARTS.wale;
      else if (level < .36) part = SHIP_PARTS.gunBand;
      else if (level < .43) part = Math.floor(level * 46) % 3 === 0 ? SHIP_PARTS.plankB : SHIP_PARTS.plankA;
      else if (level < .47) part = SHIP_PARTS.trim;
      else if (level < .55 || (level < .66 && along > .62)) {
        if (ay > .7) part = SHIP_PARTS.deck;
        else if (along > .62) part = level > .62 ? SHIP_PARTS.trim : SHIP_PARTS.castle;                           // raised castles fore and aft, gilt along their top edge
        else part = SHIP_PARTS.plankA;
      }
      else if (level > .955) part = SHIP_PARTS.flag;
      else if (area > .35 || (az > .8 && area > .1)) part = sideways ? SHIP_PARTS.rigging : level > .74 && level < .78 ? SHIP_PARTS.sailBand : SHIP_PARTS.sail;   // sails are the broad panels; masts are thin
      else part = sideways && area > .05 ? SHIP_PARTS.rigging : SHIP_PARTS.mast;
      paintLevels[t] = paintLevels[t + 1] = paintLevels[t + 2] = part;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.translate(-(bounds.min.x + bounds.max.x) * .5, -bounds.min.y, -(bounds.min.z + bounds.max.z) * .5);

    const ship = new THREE.Mesh(geometry, new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      roughness: .62,
      metalness: .04,
      clearcoat: .12,
      clearcoatRoughness: .55,
      emissive: 0x2a1408,
      emissiveIntensity: .35
    }));
    // Calibrate the imported STL against the geographic world scale instead
    // of relying on its arbitrary authoring units. The complete ship is 15 m.
    ship.scale.setScalar(.13);
    // 龍骨沉入水面下，僅保留吃水線以上的船體與桅杆。
    ship.position.y = -1.35;
    // a share of each part's own colour is added as glow, so the shaded side of the sails and hull keeps its paint
    // instead of going muddy brown under the low exposure
    ship.material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vColor.rgb * 0.42;');
    };
    ship.userData.paintLevels = paintLevels;
    ship.userData.lights = [bounds, ship.scale.x, ship.position.y];
    shipModels.galleon = ship;
    if (shipType === 'galleon') mountShip('galleon');
  } catch (error) {
    console.error('無法載入船的模型', error);
  }
}

export const boat = buildBoat();
export const lighthouseBeacons = [];
export const startingWorldPosition = geoToWorld(ELUANBI_OFFSHORE_START);
export const BOAT_WATERLINE_Y = .15;
// Sailable area: Taiwan out to Japan's northern and eastern islands.
export const WORLD_BOUNDS = REGIONS.worldBounds;   // sailable area, from the region registry (south edge ≈ 12°N for northern Philippines)
boat.position.set(startingWorldPosition.x, BOAT_WATERLINE_Y, startingWorldPosition.y);
// the bow points at the lighthouse (forward is (-sin y, -cos y) in x/z)
const startingLighthouse = geoToWorld(ELUANBI_LIGHTHOUSE);
export const startingHeading = Math.atan2(-(startingLighthouse.x - startingWorldPosition.x), -(startingLighthouse.y - startingWorldPosition.y));
boat.rotation.y = startingHeading;
boat.scale.setScalar(.07);
scene.add(boat);
reflectionExclusions.push(boat, rain);
loadPirateShip(boat);
if (shipType === 'yacht') { markLoaded('ship'); mountShip('yacht'); }
if (shipType === 'fighter') { markLoaded('ship'); mountShip('fighter'); }
export const windDirection = new THREE.Vector2();
