import * as THREE from 'three';
import { buildWhaleGeometry } from './whale-model.js';

// Random whale visits: a whale surfaces near the boat, swims across its path blowing spouts, then dives.
// The mesh is Data/Whale.stl (decimated to ~18k triangles); its colours are painted per vertex, slate-blue back fading to a pale belly.
const SPECIES_DEFS = [
  {   // humpback: stout body, dark back, white belly, very long white flippers
    name: 'humpback', eyeSize: .0085, lengthFactor: 1.4, back: 0x2f4152, belly: 0xf0f4f6, flipper: 0xe4ebee, mottle: 0, arch: .02, fluke: .24, flipperLength: .3, flipperWidth: .036, dorsal: .05,
    profile: [[0, .002, .002, .002], [.06, .014, .016, .015], [.14, .034, .04, .038], [.3, .075, .09, .085], [.5, .115, .13, .125], [.65, .125, .135, .135], [.8, .11, .11, .115], [.92, .09, .08, .095], [.98, .055, .045, .06], [1, .012, .01, .012]]
  },
  {   // blue whale: very long and slender, mottled blue-grey, tiny dorsal fin
    name: 'blue', eyeSize: .0065, lengthFactor: 4.2, back: 0x587891, belly: 0xbccbd6, flipper: 0x7f9db3, mottle: .08, arch: .01, fluke: .2, flipperLength: .14, flipperWidth: .02, dorsal: .02,
    profile: [[0, .002, .002, .002], [.05, .01, .012, .011], [.12, .026, .032, .03], [.25, .05, .06, .056], [.42, .075, .088, .082], [.58, .088, .098, .092], [.72, .088, .092, .09], [.85, .078, .074, .078], [.95, .052, .042, .052], [.985, .03, .022, .03], [1, .006, .005, .006]]
  },
  {   // the rare pink blue whale: a blue whale's long slender build in rose pink with a pale blush belly; never picked at random (see spawn)
    name: 'pink', rare: true, eyeSize: .0065, lengthFactor: 4.2, back: 0xe87fa6, belly: 0xffe1ec, flipper: 0xf4a3c1, mottle: .06, arch: .01, fluke: .2, flipperLength: .14, flipperWidth: .02, dorsal: .02, emissive: 0x6a2440,
    profile: [[0, .002, .002, .002], [.05, .01, .012, .011], [.12, .026, .032, .03], [.25, .05, .06, .056], [.42, .075, .088, .082], [.58, .088, .098, .092], [.72, .088, .092, .09], [.85, .078, .074, .078], [.95, .052, .042, .052], [.985, .03, .022, .03], [1, .006, .005, .006]]
  }
];
const BASE_PITCH = 0;
const LIFETIME = 40, RISE = 4.5, DIVE = 4.5, SPEED = .22;
// The pink whale breaches: it sounds, sweeps up at a steep angle, bursts out of the water to about half its length
// with a slow twist, hangs at the top, then falls back on its side into a huge splash, and settles back to cruising.
const BREACH_TIMES = [RISE + 4, 21], BREACH_LENGTH = 6.5;
function breachPose(u) {   // u 0..1 through the breach -> { lift (fraction of body length above cruise), pitch, roll, pace, splash }
  const ease = (a, b, x) => smooth(a, b, x);
  if (u < .28) {           // sound: dip and tilt nose-up underwater, gathering speed
    const k = ease(0, .28, u);
    return { lift: -.18 * k, pitch: -.9 * k, roll: 0, pace: 1 + 1.8 * k };
  }
  if (u < .52) {           // launch: shoot up and out, starting to twist
    const k = ease(.28, .52, u);
    return { lift: -.18 + .5 * k, pitch: -.9 - .35 * k, roll: .9 * k, pace: 2.8 };
  }
  if (u < .62) {           // hang at the apex
    const k = (u - .52) / .1;
    return { lift: .32 + .03 * Math.sin(k * Math.PI), pitch: -1.25 + .2 * k, roll: .9 + .4 * k, pace: 2 };   // tail still in the water, about two-thirds of the body out
  }
  if (u < .74) {           // topple back onto its side
    const k = ease(.62, .74, u);
    return { lift: .32 - .47 * k, pitch: -1.05 + .95 * k, roll: 1.3 + .3 * k, pace: 1.4 };
  }
  const k = ease(.74, 1, u);   // under the foam, rolling upright and levelling off
  return { lift: -.15 * (1 - k), pitch: -.1 * (1 - k), roll: 1.6 * (1 - k), pace: 1 + .4 * (1 - k) };
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createWhaleEvent({ scene, boat, glowTexture, waterlineY, isOnLand, distanceToLand, onAppear, onCall, onAlarm, quickDemo = false, forceSpecies = null, reflectionExclusions = [] }) {
  const root = new THREE.Group();
  root.visible = false;
  scene.add(root);
  reflectionExclusions.push(root);
  const body = new THREE.Group();   // pitched/bobbing inner group
  root.add(body);
  const spouts = [];
  for (let i = 0; i < 20; i++) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffffff, transparent: true, depthWrite: false, opacity: 0 }));
    sprite.visible = false;
    scene.add(sprite);
    reflectionExclusions.push(sprite);
    spouts.push({ sprite, age: 99, vx: 0, vz: 0, vy: 0 });
  }
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  foam.rotation.x = -Math.PI / 2;
  foam.visible = false;
  scene.add(foam);
  reflectionExclusions.push(foam);
  const tail = { time: { value: 0 }, amp: { value: 0 } };   // shared tail-beat uniforms
  const species = [];   // loaded models, each { def, mesh geometry, length, height, blowhole }
  let current = null;   // species currently swimming
    SPECIES_DEFS.forEach((def) => {
    const geometry = buildWhaleGeometry(def);
    geometry.computeBoundingBox();
    const lift = -geometry.boundingBox.min.y;
    geometry.translate(0, lift, 0);   // sit on y = 0
    geometry.computeBoundingBox();
    const size = geometry.boundingBox.getSize(new THREE.Vector3());
    const blowhole = geometry.userData.blowhole.clone();
    blowhole.y += lift;
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .55, metalness: .02, emissive: def.emissive ?? 0x2a3a48, emissiveIntensity: .9 });
    // Tail beat: bend the rear of the body up and down with a travelling sine wave (head is +Z, tail -Z).
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = tail.time;
      shader.uniforms.uAmp = tail.amp;
      shader.uniforms.uLen = { value: size.z };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uAmp;\nuniform float uLen;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float tz = position.z / uLen;
          float tf = 1.0 - smoothstep(-.5, .05, tz);
          transformed.y += uAmp * uLen * (tf * tf * .9 + tf * .1) * sin(uTime * 2.3 + tz * 6.0);
          transformed.x += uAmp * uLen * .25 * tf * sin(uTime * 2.3 + tz * 6.0 + 1.2);`);
    };
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false;
    body.add(mesh);
    species.push({ def, mesh, length: size.z, height: size.y, blowhole });
  });

  let timer = quickDemo ? 4 : 25 + Math.random() * 20;
  let length = 1, height = 1, blowhole = new THREE.Vector3();
  let fleeing = false, called = 0, breach = -1, breachDone = 0, splashed = 0;
  let active = false, t = 0, scale = 1, heading = 0, turn = 0, nextBlow = 2, blowAge = 99, landCheck = 0;
  const headingVector = new THREE.Vector2();

  // spawn() picks a common species at random; spawn('pink') (or ?whale=pink) brings a specific one, e.g. the rare pink whale.
  function spawn(wanted = null) {
    if (!species.length || active) return false;
    const ship = boat.userData.ship;
    const shipLength = ship ? Math.max(...new THREE.Box3().setFromObject(ship).getSize(new THREE.Vector3()).toArray()) : .6;
    const common = species.filter((entry) => !entry.def.rare);
    const choice = species.find((entry) => entry.def.name === (wanted ?? forceSpecies)) ?? common[Math.floor(Math.random() * common.length)];
    species.forEach((entry) => { entry.mesh.visible = entry === choice; });
    current = choice;
    length = choice.length; height = choice.height; blowhole = choice.blowhole;
    scale = shipLength * choice.def.lengthFactor / length;
    const boatAngle = Math.atan2(-Math.sin(boat.rotation.y), -Math.cos(boat.rotation.y));   // heading as atan2(x, z)
    for (let attempt = 0; attempt < 30; attempt++) {
      // well off to one side of the bow, not dead ahead, so the boat's course doesn't run straight into it
      const angle = boatAngle + (Math.random() < .5 ? 1 : -1) * (.55 + Math.random() * .6);
      const distance = length * scale * 1.4 + 7 + Math.random() * 5;   // a big whale appears further off
      const x = boat.position.x + Math.sin(angle) * distance, z = boat.position.z + Math.cos(angle) * distance;
      if (isOnLand(x, z) || distanceToLand(x, z).km < (choice.def.rare ? 3 : 12)) continue;   // the rare whale may come in closer, near the sights
      // swim roughly across the boat's course
      // swim away from the boat's course rather than toward it
      const away = Math.atan2(x - boat.position.x, z - boat.position.z);
      heading = away + (Math.random() - .5) * .8;
      root.position.set(x, waterlineY, z);
      active = true; fleeing = false; called = 0; breach = -1; breachDone = 0; splashed = 0; t = 0; turn = (Math.random() - .5) * .05; nextBlow = RISE + .8; blowAge = 99; landCheck = 0;
      root.visible = true;
      onAppear?.(choice.def.name);
      return true;
    }
    return false;
  }

  function update(delta) {
    if (!species.length) return;
    if (!active) {
      timer -= delta;
      if (timer <= 0) {
        if (spawn()) timer = quickDemo ? 25 + Math.random() * 10 : 70 + Math.random() * 90;
        else timer = 8;   // no open water nearby, try again soon
      }
      updateSpouts(delta);
      return;
    }
    t += delta;
    tail.time.value += delta;
    heading += turn * delta;
    headingVector.set(Math.sin(heading), Math.cos(heading));
    const rise = smooth(0, RISE, t), dive = smooth(LIFETIME - DIVE, LIFETIME, t);
    const level = rise * (1 - dive);
    // breaching (pink whale only): start one at each breach time while it is cruising
    if (current.def.rare && breach < 0 && !fleeing && breachDone < BREACH_TIMES.length && t >= BREACH_TIMES[breachDone]) { breach = 0; splashed = 0; }
    const pose = breach >= 0 ? breachPose(breach / BREACH_LENGTH) : null;
    const pace = SPEED * (.45 + .55 * level) * (fleeing ? 2.4 : 1) * (pose ? pose.pace : 1);   // slows to a glide while surfacing and diving
    root.position.x += headingVector.x * pace * delta;
    root.position.z += headingVector.y * pace * delta;
    root.rotation.y = heading + Math.sin(t * .35) * .05 * level;   // gentle sway
    // A boat that comes too close startles the whale: it turns away and dives early.
    const gap = Math.hypot(boat.position.x - root.position.x, boat.position.z - root.position.z);
    // keep clear of the boat: when it comes within a few body lengths, ease the heading away from it
    if (!fleeing && !pose && gap < length * scale * 2.5 + 3) {
      const away = Math.atan2(root.position.x - boat.position.x, root.position.z - boat.position.z);
      let diff = away - heading; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      heading += diff * Math.min(1, delta * .8);
    }
    // only a boat that actually runs right up to it startles the whale into diving
    if (!fleeing && !pose && t > 1.5 && t < LIFETIME - DIVE && gap < length * scale * .45 + .5) {
      fleeing = true;
      t = LIFETIME - DIVE;
      heading = Math.atan2(root.position.x - boat.position.x, root.position.z - boat.position.z);
      turn = 0;
      onAlarm?.();
    }
    // whale calls: once it has surfaced, and once more halfway through
    const callTimes = [RISE + 1, 22];
    if (called < callTimes.length && t >= callTimes[called] && !fleeing) { called++; onCall?.(current.def.name, Math.max(.08, 1 - gap / 16)); }
    landCheck -= delta;
    if (landCheck <= 0) {
      landCheck = .6;
      if (t < LIFETIME - DIVE && (isOnLand(root.position.x, root.position.z) || distanceToLand(root.position.x, root.position.z).km < 6)) t = LIFETIME - DIVE;   // head for deep water: dive early
    }
    // Mostly submerged while cruising: only the back, blowhole and fins break the surface.
    const surfaceY = waterlineY - height * scale * .72;
    const sunk = waterlineY - height * scale * 1.25;
    tail.amp.value = .07 * (.35 + .65 * level);
    const swell = Math.sin(t * .55);
    root.position.y = sunk + (surfaceY - sunk) * level + (swell * .5 + .5) * height * scale * .06 * level;   // rises a little to breathe
    body.scale.setScalar(scale);
    // The scanned poses are about 8 degrees head-up, so level them out, then add a slow pitch and roll
    body.rotation.x = BASE_PITCH + swell * .05 * level - (1 - rise) * .16 + dive * .28;
    body.rotation.z = Math.sin(t * .42) * .05 * level;
    if (pose) {
      root.position.y = surfaceY + pose.lift * length * scale;
      body.rotation.x = pose.pitch;
      body.rotation.z = pose.roll;
      tail.amp.value = .12;
      const u = breach / BREACH_LENGTH;
      if (splashed === 0 && u > .4) { splashed = 1; splash(.6); }          // bursting through the surface
      if (splashed === 1 && u > .72) { splashed = 2; splash(1.4); }        // the crash back down
      breach += delta;
      if (breach >= BREACH_LENGTH) { breach = -1; breachDone++; }
    }
    foam.visible = level > .05;
    foam.position.set(root.position.x, waterlineY + .003, root.position.z);
    foam.scale.setScalar(length * scale * (1.2 + Math.sin(t * 1.3) * .05));
    foam.material.opacity = .32 * level + (splashed === 2 && breach >= 0 ? .5 * (1 - breach / BREACH_LENGTH) : 0);
    if (splashed === 2 && breach >= 0) foam.scale.multiplyScalar(1 + .8 * (1 - breach / BREACH_LENGTH));
    if (t >= nextBlow && level > .85) { nextBlow = t + 6.5 + Math.random() * 2.5; blow(); }
    updateSpouts(delta);
    if (t >= LIFETIME) { active = false; fleeing = false; root.visible = false; foam.visible = false; }
  }

  function splash(power) {   // a white burst of spray thrown out round the whale
    spouts.forEach((spout, i) => {
      const a = i / spouts.length * Math.PI * 2;
      spout.age = -i * .01;
      spout.sprite.position.set(root.position.x + Math.cos(a) * .2 * scale * length, waterlineY + .02, root.position.z + Math.sin(a) * .2 * scale * length);
      spout.vx = Math.cos(a) * (.3 + Math.random() * .3) * power * scale; spout.vz = Math.sin(a) * (.3 + Math.random() * .3) * power * scale;
      spout.vy = (1.2 + Math.random() * .9) * .45 * power * scale;
      spout.big = power;
      spout.sprite.visible = true;
    });
  }
  function blow() {
    root.updateMatrixWorld(true);
    const origin = body.localToWorld(blowhole.clone());
    spouts.forEach((spout, i) => {
      spout.age = -i * .04;
      spout.sprite.position.copy(origin);
      spout.vx = (Math.random() - .5) * .08 * scale; spout.vz = (Math.random() - .5) * .08 * scale;
      spout.vy = (1.4 + Math.random() * .6) * .35 * scale;
      spout.big = 0;
      spout.sprite.visible = true;
    });
  }
  function updateSpouts(delta) {
    for (const spout of spouts) {
      if (spout.age > 2.2) { spout.sprite.visible = false; continue; }
      spout.age += delta;
      if (spout.age < 0) { spout.sprite.visible = false; continue; }
      spout.sprite.visible = true;
      spout.vy -= .45 * scale * delta;
      spout.sprite.position.x += spout.vx * delta; spout.sprite.position.z += spout.vz * delta; spout.sprite.position.y += spout.vy * delta;
      spout.sprite.material.opacity = Math.max(0, .75 * (1 - spout.age / 2.2));
      spout.sprite.scale.setScalar((.05 + spout.age * .06) * scale * (1 + (spout.big ?? 0) * 2.5));   // breach splashes are much bigger than a blow
    }
  }
  return { update, get active() { return active; }, get position() { return root.position; }, spawn };
}
