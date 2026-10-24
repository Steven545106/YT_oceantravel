import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildFishingBoat,buildCargoShip} from '../dist/traffic-ships.js';
for(const [name,build,length,budget] of [['trawler',()=>buildFishingBoat(),.4,20000],['squid',()=>buildFishingBoat({variant:'squid'}),.4,22000],['cargo',()=>buildCargoShip({random:()=>.9}),1.5,80000]]){
 test(`${name} traffic model has finite geometry, stable scale and bounded rendering cost`,()=>{
  const {g,lights,windowMaterial}=build();let triangles=0,meshes=0;
  g.traverse(o=>{if(!o.isMesh)return;meshes++;for(const name of ['position','normal'])assert.ok([...o.geometry.attributes[name].array].every(Number.isFinite));triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);});
  assert.ok(triangles<budget);assert.ok(meshes<=20);
  const bounds=new THREE.Box3().setFromObject(g);assert.ok(Math.abs(bounds.max.z-bounds.min.z-length)<length*.08);
  assert.ok(bounds.min.y<0&&bounds.max.y>0);assert.equal(lights.visible,false);assert.ok(windowMaterial.isMeshStandardMaterial);
  const camera=new THREE.PerspectiveCamera();camera.position.set(0,0,500);camera.updateMatrixWorld();g.updateMatrixWorld(true);
  const lod=g.children[0];lod.update(camera);assert.equal(lod.getCurrentLevel(),1);
  camera.position.z=5;camera.updateMatrixWorld();lod.update(camera);assert.equal(lod.getCurrentLevel(),0);
  // A telephoto camera must request the detailed model even when the ship is farther away.
  camera.position.z=lod.levels[1].distance*4;camera.zoom=8;camera.updateMatrixWorld();lod.update(camera);assert.equal(lod.getCurrentLevel(),0);
 });
}
test('cargo containers use one instanced ribbed mesh with real empty top-stack slots',()=>{
 const full=buildCargoShip({random:()=>.9}),sparse=buildCargoShip({random:()=>0});
 let a,b;full.g.traverse(o=>{if(o.isInstancedMesh)a=o;});sparse.g.traverse(o=>{if(o.isInstancedMesh)b=o;});
 assert.equal(a.count,72);assert.equal(b.count,48);assert.ok(a.geometry.attributes.position.count>36,'container ribs must add actual geometry');
 const matrix=new THREE.Matrix4();for(let i=0;i<a.count;i++){a.getMatrixAt(i,matrix);assert.ok(matrix.determinant()>.99,'empty slots must not use singular zero-scale matrices');}
});
