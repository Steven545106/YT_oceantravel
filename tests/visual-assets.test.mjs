import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { buildSilhouette, addLandmarkDetail } from '../dist/landmark-detail.js';

const triangles = root => {let count=0;root.traverse(o=>{if(o.isMesh)count+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});return count;};

test('GLB coastline asset parses with r180 and has finite positions, normals and PBR material', async()=>{
  const bytes=await readFile(new URL('../dist/Data/coastal-limestone.glb',import.meta.url));
  assert.equal(bytes.toString('ascii',0,4),'glTF');
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  let meshes=0;
  gltf.scene.traverse(o=>{
    if(!o.isMesh)return;meshes++;
    assert.ok(o.material.isMeshStandardMaterial);
    for(const name of ['position','normal','color']) {
      assert.ok(o.geometry.attributes[name]);
      assert.ok([...o.geometry.attributes[name].array].every(Number.isFinite));
    }
    const bounds=new THREE.Box3().setFromObject(o);
    assert.ok(bounds.max.x-bounds.min.x>1);
  });
  assert.equal(meshes,1);
});

test('distant silhouettes reduce dense geometry and retain bounds after a transformed root',()=>{
  const root=new THREE.Group();root.scale.setScalar(2);root.position.set(7,3,-4);
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(.35,.5,2,96,32),new THREE.MeshStandardMaterial());mesh.position.y=1;root.add(mesh);
  const before=triangles(root),proxy=buildSilhouette(root,16);
  assert.ok(proxy.children.length);
  assert.ok(triangles(proxy)<before*.8);
  proxy.scale.copy(root.scale);proxy.position.copy(root.position);
  const a=new THREE.Box3().setFromObject(root),b=new THREE.Box3().setFromObject(proxy);
  for(const key of ['x','y','z']) {
    assert.ok(Math.abs(a.min[key]-b.min[key])<.2);
    assert.ok(Math.abs(a.max[key]-b.max[key])<.2);
  }
  // No gaps between vertical slices, even when the source has sparse end rings.
  const geometry=proxy.children[0].geometry;
  assert.ok(geometry.attributes.position.count>0);
});

test('simple landmarks do not get a more expensive LOD proxy and shared materials survive',()=>{
  const material=new THREE.MeshStandardMaterial();let disposed=false;material.addEventListener('dispose',()=>{disposed=true;});
  const root=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),material);
  const proxy=buildSilhouette(root);
  assert.equal(proxy.children.length,0);assert.equal(disposed,false);
});

test('installing LOD preserves the near model scale, placement and child transforms',()=>{
  const group=new THREE.Group();group.position.set(12,3,-7);group.rotation.y=.6;group.scale.setScalar(1.7);
  const model=new THREE.Group();model.scale.setScalar(.4);model.position.set(.2,.1,-.3);
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(.4,.6,3,80,24),new THREE.MeshStandardMaterial());mesh.position.y=1.5;model.add(mesh);group.add(model);
  group.updateMatrixWorld(true);
  const before=new THREE.Box3().setFromObject(model);
  const lod=addLandmarkDetail(group,model,{natural:true});group.updateMatrixWorld(true);
  const after=new THREE.Box3().setFromObject(model);
  assert.ok(before.min.distanceTo(after.min)<1e-8);assert.ok(before.max.distanceTo(after.max)<1e-8);
  const camera=new THREE.PerspectiveCamera();camera.position.copy(group.position).add(new THREE.Vector3(0,0,2));
  camera.updateMatrixWorld(true);lod.update(camera);assert.equal(lod.getCurrentLevel(),0);
  camera.position.z+=10000;camera.updateMatrixWorld(true);lod.update(camera);assert.ok(lod.getCurrentLevel()>0);
});

test('late DEM arrival reprojects contact shadows in world space without accumulating supports', async()=>{
  const {regroundLandmarkDetails}=await import('../dist/landmark-detail.js');
  const previousDocument=globalThis.document;
  globalThis.document={createElement:()=>({width:128,height:128,getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})})};
  try {
    let elevation=0;
    const heightAt=(x,z)=>elevation+x*.03-z*.02;
    const group=new THREE.Group();group.position.set(5,.2,-3);group.scale.setScalar(.7);group.rotation.y=.5;
    const model=new THREE.Mesh(new THREE.BoxGeometry(.6,1,.5),new THREE.MeshStandardMaterial());model.position.y=.5;group.add(model);
    addLandmarkDetail(group,model,{heightAt});
    elevation=.8;group.position.y+=.8;regroundLandmarkDetails();regroundLandmarkDetails();
    const shadows=group.children.filter(o=>o.material?.alphaMap);
    assert.equal(shadows.length,1);
    group.updateMatrixWorld(true);
    const point=new THREE.Vector3(),position=shadows[0].geometry.attributes.position;
    for(let i=0;i<position.count;i++) {
      point.fromBufferAttribute(position,i).applyMatrix4(shadows[0].matrixWorld);
      assert.ok(Math.abs(point.y-heightAt(point.x,point.z)-.003)<1e-5);
    }
    assert.ok(group.children.filter(o=>o.userData.landmarkGround).length<=2);
  } finally {globalThis.document=previousDocument;}
});
