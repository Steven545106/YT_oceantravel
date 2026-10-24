// Lightning and thunder for storms: a jagged bolt drawn ahead of the boat, a brightening of the whole scene (core.lightning.level),
// and a rumble of thunder (synthesised, delayed by the bolt's distance).
import * as THREE from 'three';
import { boat, camera, lightning, reflectionExclusions, scene } from './core.js';

let audioContext = null, noiseBuffer = null, unlocked = false;
export function unlockWeatherSound() { unlocked = true; }

function thunder(volume) {
  if (!unlocked) return;
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return;
  audioContext ??= new Context();
  if (audioContext.state === 'suspended') audioContext.resume();
  const ctx = audioContext, now = ctx.currentTime;
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 3.2, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) { last = (last + .02 * (Math.random() * 2 - 1)) / 1.02; data[i] = last * 3.5; }   // brown noise
  }
  const source = ctx.createBufferSource(); source.buffer = noiseBuffer;
  const filter = ctx.createBiquadFilter(); filter.type = 'lowpass';
  filter.frequency.setValueAtTime(900, now); filter.frequency.exponentialRampToValueAtTime(70, now + 2.9);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + .05);
  gain.gain.linearRampToValueAtTime(volume * .45, now + .5);
  gain.gain.linearRampToValueAtTime(volume * .85, now + .95);
  gain.gain.exponentialRampToValueAtTime(.001, now + 3.1);
  source.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
  source.start(now);
}

export function createLightningFx() {
  const bolt = new THREE.Group();
  bolt.visible = false;
  scene.add(bolt);
  reflectionExclusions.push(bolt);
  const material = new THREE.LineBasicMaterial({ color: 0xe4eeff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  const forward = new THREE.Vector3();
  let timer = 4, pattern = null, patternTime = 0;
  const pending = [];     // thunder claps waiting for their delay
  const STEP = .07;

  function jagged(x, y, z, bottom, spread, segments) {
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments, shrink = 1 - t * .4;
      points.push(new THREE.Vector3(x + (Math.random() - .5) * spread * shrink, y + (bottom - y) * t, z + (Math.random() - .5) * spread * shrink));
    }
    points[segments].y = bottom;
    return points;
  }
  function strike(storm) {
    camera.getWorldDirection(forward); forward.y = 0; forward.normalize();
    const turn = (Math.random() - .5) * 2.2, cos = Math.cos(turn), sin = Math.sin(turn);
    const distance = 6 + Math.random() * 11;
    const dx = forward.x * cos - forward.z * sin, dz = forward.x * sin + forward.z * cos;
    const x = camera.position.x + dx * distance, z = camera.position.z + dz * distance;
    bolt.clear();
    const main = jagged(x, 16 + Math.random() * 6, z, 0, 1.4, 16);
    for (const offset of [0, .03, -.03]) bolt.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(main.map((p) => p.clone().add(new THREE.Vector3(offset, 0, offset)))), material));
    for (let b = 0; b < 2; b++) {                      // a couple of branches
      const from = main[3 + Math.floor(Math.random() * 7)];
      bolt.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(jagged(from.x, from.y, from.z, from.y - 4 - Math.random() * 4, 1.6, 6).map((p, i) => p.add(new THREE.Vector3((i * .25) * (b ? 1 : -1), 0, 0)))), material));
    }
    pattern = Math.random() < .25 ? [.8, 0, .5] : [1, 0, .75, .1, .45];       // sometimes just a quick flicker
    patternTime = 0;
    pending.push({ delay: distance * .14, volume: Math.min(.5, .12 + (1 - distance / 18) * .35 + storm * .08) });
  }

  return {
    update(delta, storm, typhoon) {
      if (storm > .35) {
        timer -= delta * (1 + typhoon * 1.2);
        if (timer <= 0) { strike(storm); timer = 3 + Math.random() * 9; }
      }
      if (pattern) {
        patternTime += delta;
        const index = Math.floor(patternTime / STEP);
        lightning.level = (pattern[index] ?? 0) * Math.min(1, storm + .3);
        material.opacity = pattern[index] ?? 0;
        bolt.visible = index < 2 && lightning.level > .1;
        if (index >= pattern.length) { pattern = null; lightning.level = 0; bolt.visible = false; }
      }
      for (let i = pending.length - 1; i >= 0; i--) {
        pending[i].delay -= delta;
        if (pending[i].delay <= 0) { thunder(pending[i].volume); pending.splice(i, 1); }
      }
    }
  };
}
