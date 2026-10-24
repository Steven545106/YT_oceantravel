// Sky phenomena: rainbow after rain, sunrise/sunset glow with streaky clouds, and a night sky of stars with the Milky Way.
import * as THREE from 'three';

const NOISE = `
float hash(vec3 p){ p = fract(p * .3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p){ float a = .5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= .5; } return s; }`;

export function createSkyExtras({ scene, camera, reflectionExclusions = [] }) {
  const root = new THREE.Group();
  scene.add(root);
  const sunDir = new THREE.Vector3(), sunFlat = new THREE.Vector3();

  // ---------------------------------------------------------------- rainbow (primary and a faint secondary)
  const R = 3200;
  const rainbowUniforms = { uStrength: { value: 0 } };
  const rainbowMaterial = (flip, weight) => new THREE.ShaderMaterial({
    uniforms: rainbowUniforms, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec2 vP; uniform float uStrength; uniform float uInner; uniform float uOuter;
      vec3 spectrum(float t){ // 0 = violet .. 1 = red
        vec3 c = vec3(0.0);
        c += vec3(.55, .1, .85) * exp(-pow((t - .02) / .13, 2.0));
        c += vec3(.1, .25, 1.0) * exp(-pow((t - .22) / .12, 2.0));
        c += vec3(.1, .9, .3) * exp(-pow((t - .5) / .13, 2.0));
        c += vec3(1.0, .9, .1) * exp(-pow((t - .68) / .1, 2.0));
        c += vec3(1.0, .45, .05) * exp(-pow((t - .83) / .09, 2.0));
        c += vec3(1.0, .08, .05) * exp(-pow((t - 1.0) / .12, 2.0));
        return c; }
      void main(){ float r = length(vP); float t = clamp((r - uInner) / (uOuter - uInner), 0.0, 1.0);
        float edge = sin(3.14159 * t); vec3 col = spectrum(${flip ? '1.0 - t' : 't'});
        gl_FragColor = vec4(col, edge * uStrength * ${weight.toFixed(2)}); }`
  });
  const makeRing = (innerDeg, outerDeg, flip, weight) => {
    const inner = R * Math.tan(THREE.MathUtils.degToRad(innerDeg)), outer = R * Math.tan(THREE.MathUtils.degToRad(outerDeg));
    const material = rainbowMaterial(flip, weight); material.uniforms = { uStrength: rainbowUniforms.uStrength, uInner: { value: inner }, uOuter: { value: outer } };
    const mesh = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 160, 1), material);
    mesh.frustumCulled = false; mesh.renderOrder = 3; root.add(mesh); return mesh;
  };
  const rainbows = [makeRing(40.2, 42.6, false, .55), makeRing(50.5, 53.5, true, .2)];
  reflectionExclusions.push(...rainbows);   // a reflected ring smeared by the water normals looks like contour lines
  let rainbowEnergy = 0;

  // ---------------------------------------------------------------- sunrise / sunset glow
  const glowUniforms = (anti) => ({ uStrength: { value: 0 }, uTime: { value: 0 }, uAnti: { value: anti }, uDusk: { value: 0 } });
  const glowMaterial = (uniforms) => new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float uStrength; uniform float uTime; uniform float uAnti; uniform float uDusk;${NOISE}
      void main(){
        float h = (vUv.y * 2200.0 - 200.0) / 1800.0;                    // 0 at the horizon, 1 high up
        float across = vUv.x - .5;
        vec3 p = vec3(vUv.x * 2.6 + uTime * .004, h * 13.0, uTime * .01);
        float streak = fbm(p) * .75 + fbm(p * vec3(2.5, 1.6, 1.0) + 4.0) * .35;
        float cloud = smoothstep(.34, .78, streak);
        float widthEnv = exp(-pow(across / mix(.3, .2, uAnti), 2.0));
        float height = smoothstep(.0, .07, h) * (1.0 - smoothstep(mix(.4, .22, uAnti), 1.0, h));
        vec3 low = mix(mix(vec3(1.0, .78, .65), vec3(1.0, .39, .08), uDusk), vec3(.7, .55, .85), uAnti);
        vec3 mid = mix(mix(vec3(.85, .65, .8), vec3(1.0, .22, .17), uDusk), vec3(.65, .55, .9), uAnti);
        vec3 top = mix(mix(vec3(.42, .58, .85), vec3(.6, .22, .55), uDusk), vec3(.45, .5, .85), uAnti);
        vec3 col = mix(low, mid, smoothstep(.05, .35, h)); col = mix(col, top, smoothstep(.3, .8, h));
        float halo = exp(-pow(h / .22, 2.0)) * .22 * (1.0 - uAnti * .6);
        float a = (cloud * height * .95 + halo) * widthEnv * uStrength;
        gl_FragColor = vec4(col * a, 1.0); }`
  });
  const glows = [0, 1].map((anti) => {
    const uniforms = glowUniforms(anti);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(7600, 2200), glowMaterial(uniforms));
    mesh.frustumCulled = false; mesh.renderOrder = 2; mesh.userData.uniforms = uniforms; root.add(mesh); return mesh;
  });

  // ---------------------------------------------------------------- stars and Milky Way
  const starUniforms = { uStrength: { value: 0 }, uTime: { value: 0 } };
  const stars = new THREE.Mesh(new THREE.SphereGeometry(4600, 40, 24), new THREE.ShaderMaterial({
    uniforms: starUniforms, transparent: true, depthWrite: false, fog: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vDir; uniform float uStrength; uniform float uTime;${NOISE}
      void main(){
        vec3 d = normalize(vDir);
        vec3 n = normalize(vec3(.35, .82, .45));
        vec3 c0 = normalize(cross(n, vec3(0.0, 1.0, 0.0)) * .6 + vec3(0.0, .2, 0.0) + n * .0);
        float lat = dot(d, n);
        float band = exp(-pow(lat / .2, 2.0)), core = exp(-pow(lat / .08, 2.0));
        float dust = fbm(d * 7.0 + 3.0), lane = smoothstep(.5, .72, fbm(d * 15.0 + 9.0));
        float centre = smoothstep(-.3, .95, dot(d, c0));
        float density = band * (.3 + 1.0 * dust) * (1.0 - .65 * lane * band);
        vec3 glow = mix(vec3(.42, .52, .82), vec3(1.0, .82, .6), centre * core) * density * (.28 + .75 * centre);
        vec3 sp = d * 300.0; vec3 cell = floor(sp); vec3 fr = fract(sp) - .5;
        float h = hash(cell), thresh = .972 - band * .03;
        vec3 off = (vec3(hash(cell + 1.0), hash(cell + 2.0), hash(cell + 3.0)) - .5) * .5;
        float star = step(thresh, h) * smoothstep(.32, .0, length(fr - off));
        star *= (.35 + .65 * hash(cell + 7.0)) * (1.0 + step(.996, h) * 1.5) * (.8 + .2 * sin(uTime * (2.0 + h * 7.0) + h * 40.0));
        vec3 tint = mix(vec3(.75, .85, 1.0), vec3(1.0, .88, .7), hash(cell + 11.0));
        float horizon = smoothstep(-.02, .16, d.y);
        gl_FragColor = vec4((glow * .9 + star * tint * 1.1) * horizon * uStrength, 1.0); }`
  }));
  stars.frustumCulled = false; stars.renderOrder = 1; root.add(stars);

  return {
    update({ delta, elapsed, sun, precipitation, mist }) {
      root.position.copy(camera.position);
      sunDir.copy(sun).normalize();
      const elevation = THREE.MathUtils.radToDeg(Math.asin(sunDir.y));
      const dry = 1 - THREE.MathUtils.smoothstep(precipitation, .12, .35);

      // rainbow: charged while it rains, shown once the rain stops and the sun is out, then fades over a couple of minutes
      if (precipitation > .35) rainbowEnergy = Math.min(1, rainbowEnergy + delta / 20);
      else rainbowEnergy = Math.max(0, rainbowEnergy - delta / 160);
      const sunUp = THREE.MathUtils.smoothstep(elevation, 3, 9) * (1 - THREE.MathUtils.smoothstep(elevation, 38, 52));
      const rainbowTarget = rainbowEnergy * dry * sunUp;
      const u = rainbowUniforms.uStrength;
      u.value += (rainbowTarget - u.value) * (1 - Math.exp(-delta * .6));
      for (const mesh of rainbows) {
        mesh.visible = u.value > .01;
        if (!mesh.visible) continue;
        mesh.position.set(-sunDir.x, -sunDir.y, -sunDir.z).multiplyScalar(R);
        mesh.lookAt(root.position);
      }

      // sunrise / sunset glow around the sun's bearing and the pink "belt" opposite it
      const peak = Math.exp(-(((elevation + 1.5) / 8) ** 2));
      const flat = sunFlat.set(sunDir.x, 0, sunDir.z);
      if (flat.lengthSq() < 1e-4) flat.set(1, 0, 0);
      flat.normalize();
      glows.forEach((mesh, i) => {
        const dusk = sunDir.x < 0;
        mesh.userData.uniforms.uDusk.value = dusk ? 1 : 0;
        const strength = peak * (dusk ? 1.1 : .5) * dry * (1 - mist * .5) * (i === 0 ? 1 : .35);
        mesh.userData.uniforms.uStrength.value = strength; mesh.userData.uniforms.uTime.value = elapsed;
        mesh.visible = strength > .01;
        if (!mesh.visible) return;
        mesh.position.set(flat.x * (i === 0 ? 1 : -1) * 3800, 900, flat.z * (i === 0 ? 1 : -1) * 3800);
        mesh.lookAt(root.position);
      });

      // stars and Milky Way: only in a dark, clear sky
      const dark = 1 - THREE.MathUtils.smoothstep(elevation, -16, -5);
      starUniforms.uStrength.value = dark * dry * (1 - mist * .8) * 1.0;
      starUniforms.uTime.value = elapsed;
      stars.visible = starUniforms.uStrength.value > .01;
    }
  };
}
