import {buildFishingBoat,buildCargoShip} from './traffic-ships.js';
import { dolphinLeapPose, swimToward } from './dolphin-motion.js';
// Life on the sea: a pod of dolphins that races the bow and leaps, gulls circling near the coast, slow fishing boats working the shelf waters,
// and container ships plodding along the shipping lanes. All are procedural; everything lights up at night.
import * as THREE from 'three';
import { buildWhaleGeometry } from './whale-model.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const DOLPHIN = {
  back: 0x56677a, belly: 0xe6ebee, flipper: 0x748696, mottle: 0, arch: .025, fluke: .26, flipperLength: .17, flipperWidth: .03, dorsal: .1, eyeSize: .012, eyeAt: .88,
  profile: [[0, .002, .002, .002], [.08, .014, .016, .015], [.2, .036, .042, .04], [.4, .07, .082, .076], [.6, .088, .098, .092], [.78, .074, .078, .074], [.9, .044, .042, .044], [.96, .022, .02, .022], [1, .012, .01, .012]]
};
const FISHING_AREAS = [   // lat0, lat1, lon0, lon1 : shelf waters worth fishing
  [22.5, 25.0, 119.3, 119.9], [23.0, 24.5, 121.6, 122.2], [22.0, 22.8, 120.0, 120.5], [25.3, 25.8, 121.2, 122.0], [32.2, 33.5, 128.8, 129.4],
  [33.8, 34.4, 132.5, 134.5], [34.5, 34.9, 140.0, 140.5], [34.7, 35.0, 128.3, 129.0], [35.2, 36.0, 129.5, 130.2], [26.0, 26.5, 127.0, 127.5],
  [24.8, 25.2, 121.8, 122.3], [23.6, 24.0, 119.6, 119.9]
];
const SHIPPING_LANES = [  // [lat, lon] waypoints
  [[21.8, 118.6], [23.2, 119.2], [24.6, 119.8], [25.8, 120.5]],
  [[21.8, 122.0], [23.5, 122.4], [25.5, 122.8], [27.5, 123.5]],
  [[26.5, 123.5], [29.5, 126.0], [31.5, 128.8]],
  [[31.5, 136.0], [33.3, 138.5], [34.2, 140.5]]
];

// Measure in the boat's frame so turning/rolling does not resize the dolphins or their leap.
export function shipLocalLength(boat,ship){
  ship.updateWorldMatrix(true,true);
  const inverse=boat.matrixWorld.clone().invert(),bounds=new THREE.Box3();
  ship.traverse(mesh=>{
    if(!mesh.geometry)return;
    mesh.geometry.computeBoundingBox();
    bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld)));
  });
  const size=bounds.getSize(new THREE.Vector3());
  // The boat root is scaled to .07: convert its local dimensions back to scene units.
  const worldScale=boat.getWorldScale(new THREE.Vector3());
  return Math.max(size.x*Math.abs(worldScale.x),size.z*Math.abs(worldScale.z),.3*Math.max(Math.abs(worldScale.x),Math.abs(worldScale.z)));
}

export function createSeaLife({ scene, boat, glowTexture, waterlineY, isOnLand, distanceToLand, geoToWorld, reflectionExclusions, onToast, quickDolphins = false }) {
  const root = new THREE.Group();
  scene.add(root);
  reflectionExclusions.push(root);
  const glow = glowTexture();
  const tmp = new THREE.Vector3();
  const sprite = (color, size) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.scale.setScalar(size); return s; };
  let shipLength = .6;
  let measuredShip=null;
  const refreshShipLength=()=>{const ship=boat.userData.ship;if(ship&&ship!==measuredShip){shipLength=shipLocalLength(boat,ship);measuredShip=ship;}};

  // ---------------------------------------------------------------- splash particles
  const splashes = [];
  for (let i = 0; i < 40; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffffff, transparent: true, depthWrite: false, opacity: 0, toneMapped: false }));
    s.visible = false; root.add(s); splashes.push({ s, life: 0, vx: 0, vy: 0, vz: 0, size: .1 });
  }
  // a ring of white foam spreading on the water where a dolphin goes in or comes out
  const rings = Array.from({ length: 8 }, () => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glow, color: 0xffffff, transparent: true, depthWrite: false, opacity: 0, toneMapped: false }));
    mesh.rotation.x = -Math.PI / 2; mesh.visible = false; root.add(mesh);
    return { mesh, life: 0, size: 1 };
  });
  function foamRing(x, z, size) {
    const r = rings.find((entry) => entry.life <= 0) ?? rings[0];
    r.life = 1.2; r.size = size; r.mesh.visible = true; r.mesh.position.set(x, waterlineY + .006, z);
  }
  function splash(x, z, count, scale) {
    for (let k = 0, made = 0; k < splashes.length && made < count; k++) {
      const p = splashes[k]; if (p.life > 0) continue;
      p.life = rand(.6, 1.0); p.s.visible = true; p.s.position.set(x + rand(-.08, .08) * scale, waterlineY + .01, z + rand(-.08, .08) * scale);
      const a = rand(0, Math.PI * 2), out = rand(.3, .9);
      p.vx = Math.cos(a) * out * scale; p.vz = Math.sin(a) * out * scale; p.vy = rand(1.2, 2.2) * scale; p.size = rand(.1, .2) * scale; made++;
    }
    foamRing(x, z, scale * .9);
  }
  function updateSplashes(delta) {
    for (const p of splashes) {
      if (p.life <= 0) continue;
      p.life -= delta; p.vy -= 4.5 * delta * (p.size / .15 + .5);
      p.s.position.x += p.vx * delta; p.s.position.z += p.vz * delta; p.s.position.y += p.vy * delta * .35;
      p.s.material.opacity = Math.max(0, Math.min(.9, p.life * 1.6)); p.s.scale.setScalar(p.size * (1 + (1 - p.life) * .8));
      if (p.life <= 0 || p.s.position.y < waterlineY) { p.life = 0; p.s.visible = false; }
    }
    for (const r of rings) {
      if (r.life <= 0) continue;
      r.life -= delta;
      const k = 1 - r.life / 1.2;
      r.mesh.scale.setScalar(r.size * (.4 + k * 1.4));
      r.mesh.material.opacity = Math.max(0, .7 * (1 - k));
      if (r.life <= 0) r.mesh.visible = false;
    }
  }

  // ---------------------------------------------------------------- dolphins
  const tail = { time: { value: 0 }, amp: { value: .09 } };
  const dolphinGeometry = buildWhaleGeometry(DOLPHIN);
  dolphinGeometry.computeBoundingBox();
  const dolphinBox = dolphinGeometry.boundingBox;
  dolphinGeometry.translate(0, -(dolphinBox.min.y + dolphinBox.max.y) / 2, 0);   // centred, head toward +z
  const dolphinSize = dolphinBox.getSize(new THREE.Vector3());
  const dolphinMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .45, metalness: .05, emissive: 0x1a2a38, emissiveIntensity: .8 });
  dolphinMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = tail.time; shader.uniforms.uAmp = tail.amp; shader.uniforms.uLen = { value: dolphinSize.z };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uAmp;\nuniform float uLen;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float tz = position.z / uLen;
        float tf = 1.0 - smoothstep(-.5, .1, tz);
        transformed.y += uAmp * uLen * (tf * tf * .9 + tf * .1) * sin(uTime * 7.0 + tz * 6.0);`);
  };
  const podRight = new THREE.Vector3();
  const pod = { state: 'idle', timer: quickDolphins ? 5 : rand(40, 70), age: 0, duration: 60, members: [] };
  const OFFSETS = [[.9, .9], [-1.0, .5], [1.7, -.1], [-1.8, -.6], [.5, -1.4]];     // [starboard, ahead] in dolphin lengths
  for (let i = 0; i < OFFSETS.length; i++) {
    const mesh = new THREE.Mesh(dolphinGeometry, dolphinMaterial);
    const holder = new THREE.Group(); holder.add(mesh); holder.visible = false; root.add(holder);
    pod.members.push({ holder, x: 0, z: 0, heading: 0, jumpTimer: rand(1, 4), jumpT: -1, phase: rand(0, 6), spread: 1 });
  }
  function updatePod(delta, ctx) {
    const { day, calm, speed } = ctx;
    if (pod.state === 'idle') {
      pod.timer -= delta;
      if (pod.timer <= 0 && day && calm && speed > .08) {
        pod.state = 'active'; pod.age = 0; pod.duration = rand(45, 80);
        const back = new THREE.Vector3(-ctx.forward.x, 0, -ctx.forward.z);
        for (const m of pod.members) { m.x = boat.position.x + back.x * shipLength * 3 + rand(-1,1)*shipLength; m.z = boat.position.z + back.z * shipLength * 3 + rand(-1,1)*shipLength; m.jumpT=-1; m.jumpTimer=rand(.8,3.5); m.heading = ctx.heading; m.holder.visible = true; m.spread = 1; }
        onToast?.('海豚跟著船跳！');
      } else if (pod.timer <= 0) pod.timer = 8;
    }
    if (pod.state === 'idle') return;
    pod.age += delta;
    const leaving = pod.age > pod.duration || !day || !calm;
    const len = shipLength * .42; // Readable from the sailing camera: about two fifths of the ship's length.
    const size = len / dolphinSize.z;
    const formationLength = shipLength * .5; // Keep the larger bodies clear of the hull.
    const right = podRight.set(-ctx.forward.z, 0, ctx.forward.x);
    pod.members.forEach((m, i) => {
      m.spread += ((leaving ? 14 : 1) - m.spread) * (1 - Math.exp(-delta * (leaving ? .6 : 1)));
      const [side, ahead] = OFFSETS[i];
      const tx = boat.position.x + (right.x * side + ctx.forward.x * (ahead + 1.2)) * formationLength * 1.6 * m.spread;
      const tz = boat.position.z + (right.z * side + ctx.forward.z * (ahead + 1.2)) * formationLength * 1.6 * m.spread;
      const px=m.x,pz=m.z;
      if(m.jumpT<0){
        const swim=swimToward(m.x,m.z,tx,tz,delta,Math.max(speed*1.2+len*.5,len*2));m.x=swim.x;m.z=swim.z;
        const vx=m.x-px,vz=m.z-pz;
        const desired=Math.hypot(vx,vz)>1e-5?Math.atan2(vx,vz):ctx.heading;
        const diff=Math.atan2(Math.sin(desired-m.heading),Math.cos(desired-m.heading));m.heading+=diff*(1-Math.exp(-delta*4));
        m.jumpTimer-=delta;
        if(m.jumpTimer<=0&&!leaving&&speed>.05){
          const jumpSpeed=Math.max(Math.hypot(vx,vz)/Math.max(delta,.001),speed*.95,len*1.4);
          const duration=1.0+(i%3)*.12;
          const endX=m.x+Math.sin(m.heading)*jumpSpeed*duration,endZ=m.z+Math.cos(m.heading)*jumpSpeed*duration;
          if(!isOnLand(endX,endZ)&&!isOnLand((m.x+endX)/2,(m.z+endZ)/2)){
            m.jumpT=0;m.launchX=m.x;m.launchZ=m.z;m.launchHeading=m.heading;
            m.jumpSpeed=jumpSpeed;m.jumpDuration=duration;m.exited=false;m.entered=false;
          } else m.jumpTimer=2;
        }
      }
      const depth=dolphinSize.y*size*.22; // Keep the back visible during surface swimming.
      let y=waterlineY-depth+Math.sin(pod.age*3+m.phase)*len*.025;
      let pitch=Math.sin(pod.age*3+m.phase+1)*.04,roll=Math.sin(pod.age*2+m.phase)*.04;
      if(m.jumpT>=0){
        m.jumpT=Math.min(m.jumpDuration,m.jumpT+delta);
        const pose=dolphinLeapPose(m.jumpT,{duration:m.jumpDuration,height:len*(.65+i*.025),depth,speed:m.jumpSpeed});
        m.heading=m.launchHeading;
        m.x=m.launchX+Math.sin(m.heading)*m.jumpSpeed*m.jumpT;
        m.z=m.launchZ+Math.cos(m.heading)*m.jumpSpeed*m.jumpT;
        y=waterlineY+pose.y;pitch=pose.pitch;roll=0;
        const noseHeight=pose.y+Math.sin(pitch)*len*.43;
        if(!m.exited&&noseHeight>=0&&pose.verticalSpeed>0){m.exited=true;splash(m.x,m.z,5,len*.55);}
        if(m.exited&&!m.entered&&noseHeight<=0&&pose.verticalSpeed<0){
          m.entered=true;splash(m.x+Math.sin(m.heading)*len*.43,m.z+Math.cos(m.heading)*len*.43,9,len*.85);
        }
        if(pose.done){m.jumpT=-1;m.jumpTimer=rand(3.5,7.5);}
      }
      if (leaving) y -= Math.min(1, (m.spread - 1) / 6) * dolphinSize.y * size * 1.2;     // dive away
      m.holder.position.set(m.x, y, m.z);
      m.holder.rotation.set(-pitch, m.heading, roll, 'YXZ');
      m.holder.scale.setScalar(size);
      if (leaving && m.spread > 12) m.holder.visible = false;
    });
    if (leaving && pod.members.every((m) => !m.holder.visible)) { pod.state = 'idle'; pod.timer = rand(90, 180); }
  }

  // ---------------------------------------------------------------- gulls
  const gullBodyMaterial = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: .8, emissive: 0x303030, emissiveIntensity: .5 });
  const gullTipMaterial = new THREE.MeshStandardMaterial({ color: 0x2b2f35, roughness: .8 });
  const beakMaterial = new THREE.MeshStandardMaterial({ color: 0xf0a020, roughness: .6 });
  const gulls = [];
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), gullBodyMaterial); body.scale.set(.028, .026, .085); g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(.024, 8, 6), gullBodyMaterial); head.position.set(0, .012, .09); g.add(head);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(.01, .04, 5), beakMaterial); beak.rotation.x = Math.PI / 2; beak.position.set(0, .006, .125); g.add(beak);
    const wings = [-1, 1].map((side) => {
      const pivot = new THREE.Group(); pivot.position.set(side * .02, .008, .01);
      const wing = new THREE.Mesh(new THREE.BoxGeometry(.17, .005, .06), gullBodyMaterial); wing.position.x = side * .085; pivot.add(wing);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(.045, .006, .05), gullTipMaterial); tip.position.x = side * .19; pivot.add(tip);
      g.add(pivot); return pivot;
    });
    g.visible = false; root.add(g);
    gulls.push({ g, wings, angle: rand(0, 6.28), radius: rand(2.5, 9), height: rand(.5, 2.2), speed: rand(.35, .7) * (Math.random() < .5 ? 1 : -1), flap: rand(6, 10), phase: rand(0, 6), presence: 0, offset: rand(-4, 14), side: rand(-10, 10), need: i / 6 });
  }
  function updateGulls(delta, elapsed, ctx) {
    const nearness = Math.max(0, 1 - ctx.nearestLand.km / 40);   // fewer gulls the farther from shore
    if (!(ctx.day && ctx.storm < .5 && nearness > 0) && gulls.every((gull) => gull.presence < .02)) return;   // no gulls about: nothing to animate
    for (const gull of gulls) {
      const wanted = ctx.day && ctx.storm < .5 && nearness > gull.need * .8 ? 1 : 0;
      gull.presence += (wanted - gull.presence) * (1 - Math.exp(-delta * .8));
      if (gull.presence < .02) { gull.g.visible = false; continue; }
      gull.g.visible = true;
      gull.angle += gull.speed * delta;
      const cx = boat.position.x + ctx.forward.x * gull.offset - ctx.forward.z * gull.side, cz = boat.position.z + ctx.forward.z * gull.offset + ctx.forward.x * gull.side;
      const x = cx + Math.cos(gull.angle) * gull.radius, z = cz + Math.sin(gull.angle) * gull.radius;
      const y = waterlineY + gull.height + Math.sin(elapsed * .8 + gull.phase) * .12;
      const dx = -Math.sin(gull.angle) * Math.sign(gull.speed), dz = Math.cos(gull.angle) * Math.sign(gull.speed);
      gull.g.position.set(x, y, z);
      gull.g.rotation.set(0, Math.atan2(dx, dz), -Math.sign(gull.speed) * .35, 'YXZ');       // banking into the turn
      const flapping = Math.sin(elapsed * .6 + gull.phase * 2) > -.3;
      const swing = flapping ? Math.sin(elapsed * gull.flap + gull.phase) * .6 : .12;
      gull.wings[0].rotation.z = swing; gull.wings[1].rotation.z = -swing;
      gull.g.scale.setScalar(gull.presence * 1.6);
    }
  }

  // ---------------------------------------------------------------- fishing boats
  const fishingBoats = [];
  function makeFishingBoat() {
    return buildFishingBoat({color:pick([0xe8e5d9,0x24628a,0xa34437,0x397360,0xb99543]),variant:Math.random()<.5?'squid':'trawler',sprite});
  }
  const addFishingBoats = () => {
    for (const [lat0, lat1, lon0, lon1] of FISHING_AREAS) {
      for (let attempt = 0; attempt < 30; attempt++) {
        const w = geoToWorld({ latitude: rand(lat0, lat1), longitude: rand(lon0, lon1) });
        if (isOnLand(w.x, w.y) || distanceToLand(w.x, w.y).km < 8) continue;
        const model = makeFishingBoat();
        model.g.visible = false; root.add(model.g);
        fishingBoats.push({ ...model, x: w.x, z: w.y, heading: rand(0, 6.28), speed: rand(.03, .09), turn: rand(-.1, .1), phase: rand(0, 6), clock: rand(0, 10), checks: 0 });
        break;
      }
    }
  };
  addFishingBoats();
  function updateFishing(frameDelta, elapsed, ctx) {
    let delta = frameDelta;
    for (const f of fishingBoats) {
      const dist = Math.hypot(f.x - boat.position.x, f.z - boat.position.z);
      f.g.visible = dist < 140;
      // out of sight: keep it drifting, but only step it about once a second
      f.pending = (f.pending ?? 0) + frameDelta;
      if (!f.g.visible && f.pending < 1) continue;
      delta = f.pending; f.pending = 0;
      f.clock -= delta;
      if (f.clock <= 0) { f.clock = rand(6, 16); f.turn = rand(-.12, .12); }
      f.heading += f.turn * delta;
      const nx = f.x + Math.sin(f.heading) * f.speed * delta, nz = f.z + Math.cos(f.heading) * f.speed * delta;
      if ((f.checks += delta) > .8) {   // keep clear of land: turn round when a shore is near
        f.checks = 0;
        if (isOnLand(nx + Math.sin(f.heading) * 1.5, nz + Math.cos(f.heading) * 1.5)) f.heading += Math.PI * rand(.6, 1.4);
      }
      if (!isOnLand(nx, nz)) { f.x = nx; f.z = nz; }
      if (!f.g.visible) continue;
      f.g.position.set(f.x, waterlineY - .02 + Math.sin(elapsed * 1.4 + f.phase) * .008, f.z);
      f.g.rotation.set(Math.sin(elapsed * 1.1 + f.phase) * .03, f.heading, Math.sin(elapsed * 1.3 + f.phase) * .05, 'YXZ');
      f.g.scale.setScalar(shipLength * 1.1 / .4);
      f.lights.visible = !ctx.day;
      f.windowMaterial.emissiveIntensity=ctx.day?0:1.1;
    }
  }

  // ---------------------------------------------------------------- cargo ships
  const cargoShips = [];
  const makeCargoShip=()=>buildCargoShip({sprite});
  const addCargoShips = () => {
    for (const lane of SHIPPING_LANES) {
      const points = lane.map(([latitude, longitude]) => { const w = geoToWorld({ latitude, longitude }); return new THREE.Vector2(w.x, w.y); });
      let clear = true, length = 0; const lengths = [];
      for (let i = 0; i < points.length - 1; i++) {
        const segment = points[i].distanceTo(points[i + 1]); lengths.push(segment); length += segment;
        for (let t = 0; t <= segment; t += .5) { const p = points[i].clone().lerp(points[i + 1], t / segment); if (isOnLand(p.x, p.y)) clear = false; }
      }
      if (!clear) { console.warn('航道穿過陸地，略過', lane[0]); continue; }
      for (let k = 0; k < 2; k++) {
        const model = makeCargoShip(); model.g.visible = false; root.add(model.g);
        cargoShips.push({ ...model, points, lengths, length, s: rand(0, length), dir: k ? -1 : 1, speed: rand(.18, .3), heading: 0, phase: rand(0, 6) });
      }
    }
  };
  addCargoShips();
  function placeOnLane(ship) {
    let remaining = ship.s;
    for (let i = 0; i < ship.lengths.length; i++) {
      if (remaining <= ship.lengths[i] || i === ship.lengths.length - 1) {
        const t = Math.min(1, remaining / ship.lengths[i]);
        const a = ship.points[i], b = ship.points[i + 1];
        return { x: a.x + (b.x - a.x) * t, z: a.y + (b.y - a.y) * t, heading: Math.atan2((b.x - a.x) * ship.dir, (b.y - a.y) * ship.dir) };
      }
      remaining -= ship.lengths[i];
    }
    return null;
  }
  function updateCargo(delta, elapsed, ctx) {
    for (const ship of cargoShips) {
      ship.pending = (ship.pending ?? 0) + delta;
      if (!ship.g.visible && ship.pending < 1 && ship.wasFar) continue;   // far ships advance in one-second steps
      const step = ship.pending; ship.pending = 0;
      ship.s += ship.dir * ship.speed * step;
      if (ship.s > ship.length) { ship.s = ship.length; ship.dir = -1; }
      if (ship.s < 0) { ship.s = 0; ship.dir = 1; }
      const place = placeOnLane(ship); if (!place) continue;
      const dist = Math.hypot(place.x - boat.position.x, place.z - boat.position.z);
      ship.g.visible = dist < 420;
      ship.wasFar = !ship.g.visible;
      if (!ship.g.visible) continue;
      let diff = place.heading - ship.heading; diff = Math.atan2(Math.sin(diff), Math.cos(diff)); ship.heading += diff * (1 - Math.exp(-delta * 1.2));
      ship.g.position.set(place.x, waterlineY - .035 + Math.sin(elapsed * .9 + ship.phase) * .006, place.z);
      ship.g.rotation.set(Math.sin(elapsed * .7 + ship.phase) * .012, ship.heading, Math.sin(elapsed * .6 + ship.phase) * .02, 'YXZ');
      ship.g.scale.setScalar(shipLength * 3.4 / 1.5);
      ship.lights.visible = !ctx.day;
      ship.windowMaterial.emissiveIntensity = ctx.day ? 0 : 1.4;
    }
  }

  return {
    get gullLevel() { return gulls.reduce((a, g) => a + g.presence, 0) / gulls.length; },
    update({ delta, elapsed, night, storm, typhoon, speed, nearestLand }) {
      refreshShipLength();
      tail.time.value += delta;
      const day = !night;
      const calm = storm < .3;
      const heading = boat.rotation.y;
      const forward = { x: -Math.sin(heading), z: -Math.cos(heading) };
      const ctx = { day, calm, speed, nearestLand, storm: storm + typhoon, forward, heading: Math.atan2(forward.x, forward.z) };
      updatePod(delta, ctx);
      updateGulls(delta, elapsed, ctx);
      updateFishing(delta, elapsed, ctx);
      updateCargo(delta, elapsed, ctx);
      updateSplashes(delta);
    }
  };
}
