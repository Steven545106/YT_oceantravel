// Night sky extras: occasional shooting stars, and aurora curtains over the northern sea (only far enough north).
import * as THREE from 'three';

const rand = (a, b) => a + Math.random() * (b - a);
const AURORA_START_LAT = 35, AURORA_FULL_LAT = 41;

export function createSkyFx({ scene, camera }) {
  const root = new THREE.Group();
  scene.add(root);

  // ---- meteors: a bright head with a fading streak, placed on a far dome around the camera
  const meteors = [];
  for (let i = 0; i < 3; i++) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false }));
    line.frustumCulled = false; line.renderOrder = 5; line.visible = false; root.add(line);
    meteors.push({ line, life: 0, duration: 1, from: new THREE.Vector3(), dir: new THREE.Vector3(), length: 0 });
  }
  let nextMeteor = rand(15, 40);
  const meteorHead = new THREE.Vector3(), meteorTail = new THREE.Vector3();
  function launch(meteor) {
    const azimuth = rand(0, Math.PI * 2), elevation = rand(.35, 1.1);
    const radius = 3000;
    meteor.from.set(Math.cos(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.sin(azimuth) * Math.cos(elevation)).multiplyScalar(radius);
    const heading = azimuth + Math.PI / 2 + rand(-.5, .5);
    meteor.dir.set(Math.cos(heading), -rand(.25, .6), Math.sin(heading)).normalize();
    meteor.length = rand(260, 520); meteor.duration = rand(.7, 1.3); meteor.life = meteor.duration;
    meteor.travel = rand(900, 1500);
  }

  // ---- aurora: a few vertical ribbons of additive shader, wavy and slowly shifting
  const uniforms = { uTime: { value: 0 }, uStrength: { value: 0 } };
  const auroraMaterial = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `varying vec2 vUv; uniform float uTime;
      void main(){ vUv = uv; vec3 p = position; p.x += sin(uv.x * 9.0 + uTime * .35) * 160.0 + sin(uv.x * 23.0 - uTime * .5) * 40.0;
        p.y *= 1.0 + .15 * sin(uv.x * 7.0 + uTime * .2);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform float uTime; uniform float uStrength;
      void main(){
        float rays = .55 + .45 * sin(vUv.x * 80.0 + sin(vUv.x * 11.0 + uTime * .4) * 4.0 + uTime * .3);
        rays *= .6 + .4 * sin(vUv.x * 37.0 - uTime * .25);
        float fade = smoothstep(0.0, .12, vUv.y) * pow(1.0 - vUv.y, 1.6);
        vec3 low = vec3(.15, 1.0, .5), high = vec3(.55, .25, .95);
        vec3 col = mix(low, high, smoothstep(.25, .85, vUv.y));
        float edge = smoothstep(0.0, .1, vUv.x) * smoothstep(1.0, .9, vUv.x);
        gl_FragColor = vec4(col * rays * fade * edge * uStrength, 1.0);
      }`
  });
  const curtains = [];
  for (let i = 0; i < 3; i++) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2600, 520, 80, 1), auroraMaterial);
    mesh.frustumCulled = false; mesh.renderOrder = 4; mesh.visible = false;
    mesh.userData = { offset: (i - 1) * 520, depth: 3300 + i * 450, tilt: rand(-.12, .12) };
    root.add(mesh); curtains.push(mesh);
  }
  let strength = 0;

  return {
    update({ delta, elapsed, night, latitude, storm, typhoon }) {
      root.position.copy(camera.position);
      // meteors
      const clear = night && storm + typhoon < .4;
      nextMeteor -= delta;
      if (clear && nextMeteor <= 0) {
        const free = meteors.find((m) => m.life <= 0);
        if (free) launch(free);
        nextMeteor = rand(25, 70);
      }
      for (const m of meteors) {
        if (m.life <= 0) continue;
        m.life -= delta;
        if (m.life <= 0) { m.line.visible = false; continue; }
        const u = 1 - m.life / m.duration;
        const head = meteorHead.copy(m.from).addScaledVector(m.dir, u * m.travel);
        const tail = meteorTail.copy(head).addScaledVector(m.dir, -m.length * Math.min(1, u * 3));
        const p = m.line.geometry.attributes.position, c = m.line.geometry.attributes.color;
        p.setXYZ(0, head.x, head.y, head.z); p.setXYZ(1, tail.x, tail.y, tail.z);
        const fade = Math.sin(Math.PI * Math.min(1, u)) ;
        c.setXYZ(0, fade, fade, fade); c.setXYZ(1, 0, 0, 0);
        p.needsUpdate = c.needsUpdate = true; m.line.visible = true;
      }
      // aurora
      const wanted = night && storm + typhoon < .6 ? Math.min(1, Math.max(0, (latitude - AURORA_START_LAT) / (AURORA_FULL_LAT - AURORA_START_LAT))) : 0;
      strength += (wanted - strength) * (1 - Math.exp(-delta * .5));
      uniforms.uStrength.value = strength * .9; uniforms.uTime.value = elapsed;
      for (const mesh of curtains) {
        mesh.visible = strength > .01;
        if (!mesh.visible) continue;
        const d = mesh.userData;
        mesh.position.set(d.offset, 520 + 40 * Math.sin(elapsed * .1 + d.offset), -d.depth);   // north is −z
        mesh.rotation.set(0, d.tilt, 0);
      }
    }
  };
}
