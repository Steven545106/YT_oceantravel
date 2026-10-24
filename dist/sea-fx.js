// Surface detail: spray thrown up at the bow, splashes when the hull slams into a wave, and whitecaps (foam patches) scattered over the sea in strong wind.
import * as THREE from 'three';
import { quality } from './quality.js';

const rand = (a, b) => a + Math.random() * (b - a);

function foamTexture() {
  const size = 128, canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  for (let i = 0; i < 90; i++) {
    const x = size / 2 + (Math.random() + Math.random() - 1) * size * .32, y = size / 2 + (Math.random() + Math.random() - 1) * size * .32, r = rand(3, 14);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${rand(.35, .8)})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  const fade = ctx.createRadialGradient(size / 2, size / 2, size * .1, size / 2, size / 2, size / 2);   // soft edge
  fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalCompositeOperation = 'destination-in'; ctx.fillStyle = fade; ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

export function createSeaFx({ scene, boat, glowTexture, waterlineY, reflectionExclusions }) {
  const root = new THREE.Group();
  scene.add(root); reflectionExclusions.push(root);
  const tmp = new THREE.Vector3();
  let shipLength = 1.2, shipChecked = false;

  // ---- spray particles
  const sprayMaterial = () => new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffffff, transparent: true, depthWrite: false, opacity: 0, toneMapped: false });
  const spray = Array.from({ length: 90 }, () => {
    const sprite = new THREE.Sprite(sprayMaterial()); sprite.visible = false; root.add(sprite);
    return { sprite, life: 0, max: 1, vx: 0, vy: 0, vz: 0, size: .1 };
  });
  let sprayCursor = 0;
  function emit(x, y, z, vx, vy, vz, size) {
    const p = spray[sprayCursor]; sprayCursor = (sprayCursor + 1) % spray.length;
    p.life = p.max = rand(.55, 1.1); p.sprite.visible = true; p.sprite.position.set(x, y, z);
    p.vx = vx; p.vy = vy; p.vz = vz; p.size = size;
  }

  // ---- whitecaps
  const foam = foamTexture();
  const caps = Array.from({ length: 70 }, () => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: foam, transparent: true, depthWrite: false, opacity: 0, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    mesh.rotation.x = -Math.PI / 2; mesh.visible = false; mesh.renderOrder = 2; root.add(mesh);
    return { mesh, life: 0, max: 1, size: 1, stretch: 1, yaw: 0 };
  });
  let capTimer = 0, lastPitch = 0, emitDebt = 0;

  return {
    root,
    update({ delta, light = 1, speed, waveScale, windSpeed, windDirection, forward, pitch }) {
      if (shipChecked !== boat.userData.ship && boat.userData.ship) {
        shipChecked = boat.userData.ship;
        const box = new THREE.Box3().setFromObject(boat.userData.ship); box.getSize(tmp); shipLength = Math.max(tmp.x, tmp.z, .4);
      }
      const bowDistance = shipLength * .46;
      const bowX = boat.position.x + forward.x * bowDistance, bowZ = boat.position.z + forward.z * bowDistance;
      const sideX = -forward.z, sideZ = forward.x;
      const sea = Math.max(0, waveScale - .9);

      // steady bow spray grows with speed and sea state
      const rate = Math.max(0, speed - .06) * 14 * (1 + sea * 1.2) * quality.particles;
      emitDebt += rate * delta;
      while (emitDebt >= 1) {
        emitDebt--;
        const side = Math.random() < .5 ? -1 : 1;
        emit(bowX + sideX * side * .06, waterlineY + .03, bowZ + sideZ * side * .06,
          sideX * side * rand(.25, .7) + forward.x * rand(.1, .5) * speed * 2, rand(.5, 1.2) * (1 + sea * .4), sideZ * side * rand(.25, .7) + forward.z * rand(.1, .5) * speed * 2, rand(.12, .22) * (1 + sea * .3));
      }
      // slamming into a wave: a burst when the bow dips quickly
      const pitchRate = -(pitch - lastPitch) / Math.max(delta, 1e-3); lastPitch = pitch;
      if (pitchRate > .22 * Math.max(1, waveScale * .7) && speed > .04) {
        const burst = Math.min(14, 5 + Math.round(sea * 6));
        for (let i = 0; i < burst; i++) {
          const side = Math.random() < .5 ? -1 : 1;
          emit(bowX + sideX * side * rand(.03, .12), waterlineY + .04, bowZ + sideZ * side * rand(.03, .12),
            sideX * side * rand(.3, 1.0), rand(.8, 1.8) * (1 + sea * .4), sideZ * side * rand(.3, 1.0), rand(.16, .3) * (1 + sea * .3));
        }
      }
      for (const p of spray) {
        if (p.life <= 0) continue;
        p.life -= delta; p.vy -= 2.6 * delta;
        p.sprite.position.x += p.vx * delta; p.sprite.position.y += p.vy * delta; p.sprite.position.z += p.vz * delta;
        const t = 1 - p.life / p.max;
        p.sprite.material.color.setScalar(light * .92);
        p.sprite.material.opacity = Math.max(0, Math.min(.75, p.life * 2.2));
        p.sprite.scale.setScalar(p.size * (1 + t * 1.4));
        if (p.life <= 0 || p.sprite.position.y < waterlineY - .02) { p.life = 0; p.sprite.visible = false; }
      }

      // whitecaps: appear with wind above ~12 knots, drift downwind, stretch along the wind and fade
      const windy = Math.max(0, (windSpeed - 11) / 20);
      capTimer -= delta;
      if (capTimer <= 0) {
        capTimer = .15 / ((.15 + windy * 2.5) * quality.particles);
        const c = caps.find((cap) => cap.life <= 0);
        if (c) {
          const angle = Math.random() * Math.PI * 2, distance = Math.sqrt(Math.random()) * 14 + 1.2;
          c.mesh.position.set(boat.position.x + Math.cos(angle) * distance, waterlineY + .035, boat.position.z + Math.sin(angle) * distance);
          c.max = c.life = rand(3, 6.5); c.size = rand(.25, .75) * (1 + windy * .5); c.stretch = rand(1.3, 2.4);
          c.yaw = Math.atan2(windDirection.x, windDirection.y); c.mesh.visible = true;
        }
      }
      for (const c of caps) {
        if (c.life <= 0) continue;
        c.life -= delta;
        c.mesh.position.x += windDirection.x * delta * (.18 + windy * .5); c.mesh.position.z += windDirection.y * delta * (.18 + windy * .5);
        const t = 1 - c.life / c.max, fade = Math.sin(Math.PI * Math.min(1, t)) ** 1.2;
        c.mesh.material.color.setScalar(light * .85);
        c.mesh.material.opacity = fade * Math.min(.9, .2 + windy * .8);
        c.mesh.rotation.set(-Math.PI / 2, 0, c.yaw, 'YXZ');
        c.mesh.scale.set(c.size * c.stretch * (1 + t * .4), c.size * (1 + t * .3), 1);
        if (c.life <= 0) c.mesh.visible = false;
      }
    }
  };
}
