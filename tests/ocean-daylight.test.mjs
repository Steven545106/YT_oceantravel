import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Water} from 'three/examples/jsm/objects/Water.js';
import {solarAngles,TIME_MODE_PHASE,TIME_MODES,TIME_LIGHTING,SCENIC_MODE_SECONDS,advanceScenicTime} from '../dist/day-cycle.js';
import {refineOceanSurface,OCEAN_SCENE_SCALE} from '../dist/ocean-surface.js';
const position=phase=>{const a=solarAngles(phase);return new THREE.Vector3().setFromSphericalCoords(1,THREE.MathUtils.degToRad(90-a.elevation),THREE.MathUtils.degToRad(a.azimuth));};
test('sunrise and sunset stay low over the correct eastern and western horizons',()=>{
  for(const [mode,heading] of [['sunrise',90],['sunset',270]]){
    assert.ok(TIME_MODES.includes(mode));const phase=TIME_MODE_PHASE[mode],angles=solarAngles(phase),sun=position(phase);
    const bearing=(THREE.MathUtils.radToDeg(Math.atan2(sun.x,-sun.z))+360)%360;
    assert.ok(Math.abs(bearing-heading)<3);assert.ok(angles.elevation>1&&angles.elevation<4);
    assert.ok(Math.abs(angles.elevation-solarAngles(.5).elevation)>60);
  }
  assert.ok(position(.25).x>.999);assert.ok(position(.75).x<-.999);
  assert.ok(position(.5).y>.9);assert.ok(position(TIME_MODE_PHASE.night).y<-.9);
  assert.deepEqual(solarAngles(1.255),solarAngles(.255));
});
test('the official ocean shader keeps its reflection model while normal and distortion distances share the miniature scale',()=>{
  const water=new Water(new THREE.PlaneGeometry(10,10),{waterNormals:new THREE.Texture()});
  refineOceanSurface(water);
  assert.equal(water.material.uniforms.oceanSceneScale.value,OCEAN_SCENE_SCALE);
  const shader=water.material.fragmentShader;
  assert.ok(shader.includes('worldPosition.xz * size * oceanSceneScale'));
  assert.ok(shader.includes('distance * oceanSceneScale'));
  assert.ok(shader.includes('pow( ( 1.0 - theta ), 5.0 )'));
  assert.ok(shader.includes('reflectionSample * specularLight'));
  for(const distance of [.5,2,50])assert.ok(Math.abs(1/(distance*OCEAN_SCENE_SCALE)-(1/distance)/OCEAN_SCENE_SCALE)<1e-12);
  water.geometry.dispose();water.material.dispose();
});

test('only three scenic times are offered and dawn differs materially from dusk',()=>{
  assert.deepEqual(TIME_MODES,['sunrise','sunset','night']);
  assert.deepEqual(Object.keys(TIME_MODE_PHASE),TIME_MODES);
  const dawn=TIME_LIGHTING.sunrise,dusk=TIME_LIGHTING.sunset;
  assert.ok(dusk.turbidity > dawn.turbidity*2);
  assert.notEqual(dawn.waterColor,dusk.waterColor);
  const a=new THREE.Color(dawn.directionalColor),b=new THREE.Color(dusk.directionalColor);
  assert.ok(a.b/a.r>b.b/b.r*2,'dawn light is cooler than dusk');
  for(const mode of TIME_MODES)for(const value of Object.values(TIME_LIGHTING[mode]))assert.ok(Number.isFinite(value));
});
test('scenic times rotate automatically and preserve elapsed time across large frames',()=>{
  const cycle={mode:'sunrise',phase:TIME_MODE_PHASE.sunrise,elapsed:0};
  assert.equal(advanceScenicTime(cycle,SCENIC_MODE_SECONDS-1),false);
  assert.equal(cycle.mode,'sunrise');
  assert.equal(advanceScenicTime(cycle,1),true);
  assert.equal(cycle.mode,'sunset');
  assert.equal(advanceScenicTime(cycle,SCENIC_MODE_SECONDS*2+.5),true);
  assert.equal(cycle.mode,'sunrise');
  assert.equal(cycle.elapsed,.5);
  assert.equal(cycle.phase,TIME_MODE_PHASE.sunrise);
});
