import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TAIWAN_REFERENCE_MODELS } from '../dist/taiwan-reference-data.js';
import { geoToWorld } from '../dist/geo.js';
import { landmarkDisplayScale, layoutLandmarkDisplays } from '../dist/landmark-scale.js';
// Canvas drawing is not what this test verifies: inspect actual generated geometry, topology and ray hits.
const context=new Proxy({createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},{get:(target,key)=>target[key]??(()=>{})});
globalThis.document={createElement:()=>({width:128,height:128,getContext:()=>context})};
const {LANDMARK_BUILDERS}=await import('../dist/landmark-models.js');
const models=new Map();
for(const item of TAIWAN_REFERENCE_MODELS) {
  test(`${item.name}: finite geometry, complete bounds, and a renderable material`,()=>{
    const root=LANDMARK_BUILDERS[item.type]();models.set(item.type,root);
    let triangles=0,meshes=0;
    root.traverse(o=>{
      if(!o.isMesh)return;meshes++;
      const p=o.geometry.attributes.position;
      assert.ok([...p.array].every(Number.isFinite));
      if(o.geometry.attributes.normal)assert.ok([...o.geometry.attributes.normal.array].every(Number.isFinite));
      triangles+=(o.geometry.index?.count??p.count)/3;assert.ok(o.material);
    });
    assert.ok(triangles>12);assert.ok(meshes<100,`draw-call budget exceeded: ${meshes}`);
    const size=new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
    assert.ok(size.x>0&&size.y>0&&size.z>0);
  });
}
test('Eluanbi veranda arches are genuine openings while the piers remain solid',()=>{
  const model=models.get('eluanbi');model.updateMatrixWorld(true);
  const ray=new THREE.Raycaster(),front=.045;
  // The arcade spans -.16 .. .60 with five bays. Test above the sill, below each arch crown.
  const hitsAt=x=>{ray.set(new THREE.Vector3(x,.11,.35),new THREE.Vector3(0,0,-1));return ray.intersectObject(model,true).filter(h=>Math.abs(h.point.z-front)<.018);};
  assert.equal(hitsAt(-.084).length,0);
  assert.ok(hitsAt(-.148).length>0);
});
test('Taiwan lighthouse metadata still supports placement and flashing beacons',()=>{
  for(const type of ['eluanbi','keelungLighthouse']) {
    const root=models.get(type);assert.ok(root.userData.lens?.isMaterial);assert.ok(root.userData.top>0);
  }
});
test('Yushan summit is a terrain-sized detail rather than another full-height mountain or flag',()=>{
  const bounds=new THREE.Box3().setFromObject(models.get('yushan'));
  assert.ok(bounds.max.y<.15);
});
test('reference catalogue covers every Taiwan landmark, including the three separately placed models',async()=>{
  const {readFile}=await import('node:fs/promises');
  const data=JSON.parse(await readFile(new URL('../dist/Data/landmarks.json',import.meta.url),'utf8'));
  const catalogue=new Set(TAIWAN_REFERENCE_MODELS.map(item=>item.name));
  for(const item of data.landmarks.filter(item=>item.country==='台灣'))assert.ok(catalogue.has(item.name),`missing reference: ${item.name}`);
});

test('Kaohsiung campus and 85 Tower stay readable and have separate presentation footprints',async()=>{
  const {readFile}=await import('node:fs/promises');
  const {landmarks}=JSON.parse(await readFile(new URL('../dist/Data/landmarks.json',import.meta.url),'utf8'));
  const sites=['nsysu','sky85'].map(type=>{
    const entry=landmarks.find(item=>item.type===type),model=models.get(type).clone();
    const raw=new THREE.Box3().setFromObject(model),height=raw.max.y-Math.min(raw.min.y,0);
    const scale=landmarkDisplayScale(entry);model.scale.setScalar(scale/height);model.rotation.y=entry.yaw??0;
    const p=geoToWorld({latitude:entry.lat,longitude:entry.lon});model.position.set(p.x,0,p.y);
    const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),centre=box.getCenter(new THREE.Vector3());
    assert.ok(size.y>=.89);
    return {name:entry.name,x:p.x,z:p.y,width:size.x*1.12,depth:size.z*1.12,height:size.y,offsetX:centre.x-p.x,offsetZ:centre.z-p.y};
  });
  const positions=layoutLandmarkDisplays(sites),[a,b]=sites;
  const pa=positions.get(a.name),pb=positions.get(b.name);
  assert.ok(Math.abs(pa.x+a.offsetX-pb.x-b.offsetX)>(a.width+b.width)/2||Math.abs(pa.z+a.offsetZ-pb.z-b.offsetZ)>(a.depth+b.depth)/2);
});
