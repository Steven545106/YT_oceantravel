import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createObservationCamera} from '../dist/camera-zoom.js';
test('optical zoom magnifies distant objects while leaving the boat position and heading unchanged',()=>{
  const camera=new THREE.PerspectiveCamera(55,16/9,.05,20000),controller=createObservationCamera(camera),anchor=new THREE.Vector3(12,.1,30),original=anchor.clone();
  const baseline=camera.projectionMatrix.elements[0];controller.open();controller.setMagnification(8);
  for(let i=0;i<120;i++)controller.update(1/60,anchor,Math.PI/2);
  assert.ok(Math.abs(camera.projectionMatrix.elements[0]/baseline-8)<1e-6);assert.deepEqual(anchor,original);
  assert.ok(camera.position.x<anchor.x-.89,'camera stays ahead of the west-facing bow');
  assert.equal(camera.fov,55);controller.close();assert.equal(camera.zoom,1);assert.equal(controller.update(.1,anchor,0),false);
});
test('view rotation is independent of the boat, pitch and magnification are bounded, and reset restores the view',()=>{
  const camera=new THREE.PerspectiveCamera(),c=createObservationCamera(camera);c.open();
  c.setMagnification(999);assert.equal(c.view.magnification,8);c.setMagnification(-10);assert.equal(c.view.magnification,1);c.setMagnification(NaN);assert.equal(c.view.magnification,1);
  c.drag(200,10000);assert.ok(c.view.yaw<0);assert.equal(c.view.pitch,-.5);c.drag(0,-10000);assert.equal(c.view.pitch,1.2);
  c.reset();assert.equal(c.view.yaw,0);assert.equal(c.view.pitch,0);assert.equal(c.view.magnification,1);
  c.close();c.open();assert.equal(c.view.yaw,0);
});
