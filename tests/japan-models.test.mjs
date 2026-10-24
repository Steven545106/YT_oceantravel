import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {JAPAN_REFERENCE_MODELS} from '../dist/japan-reference-data.js';
import {geoToWorld} from '../dist/geo.js';
import {landmarkDisplayScale,layoutLandmarkDisplays,TERRAIN_LANDMARK_TYPES} from '../dist/landmark-scale.js';
const ctx=new Proxy({createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},{get:(t,k)=>t[k]??(()=>{})});
globalThis.document={createElement:()=>({width:128,height:128,getContext:()=>ctx})};
const {LANDMARK_BUILDERS}=await import('../dist/landmark-models.js');
const models=new Map();
for(const entry of JAPAN_REFERENCE_MODELS){
  test(`${entry.name}: reference model has finite geometry, normals, and bounded rendering cost`,()=>{
    const root=LANDMARK_BUILDERS[entry.type](entry.options??{});models.set(entry.id??entry.type,root);
    let meshes=0,triangles=0;
    root.traverse(o=>{if(!o.isMesh)return;meshes++;const geo=o.geometry;
      for(const attr of ['position','normal'])assert.ok([...geo.attributes[attr].array].every(Number.isFinite),`${entry.name}: ${attr}`);
      triangles+=(geo.index?.count??geo.attributes.position.count)/3;
      assert.ok(o.material?.isMeshStandardMaterial);
    });
    const size=new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
    assert.ok(size.x>0&&size.y>0&&size.z>0);
    assert.ok(meshes<=50,`${entry.name}: ${meshes} material draws`);
    assert.ok(triangles<60000,`${entry.name}: ${triangles} triangles`);
    assert.equal(root.userData.referencePass,'japan-2026');
  });
}
test('all 29 Japanese stamps have an individual reference, including two bridge styles',async()=>{
  const data=JSON.parse(await readFile(new URL('../dist/Data/landmarks.json',import.meta.url),'utf8'));
  const japan=data.landmarks.filter(e=>e.country==='日本');assert.equal(japan.length,29);
  assert.equal(JAPAN_REFERENCE_MODELS.length,29);assert.equal(new Set(JAPAN_REFERENCE_MODELS.map(e=>e.id??e.type)).size,29);
  for(const entry of japan){
    const reference=JAPAN_REFERENCE_MODELS.find(e=>e.name===entry.name);assert.ok(reference,entry.name);
    assert.equal(reference.type,entry.type);
    if(entry.type==='bridge')assert.equal(reference.options.style,entry.options.style);
    assert.ok(reference.sources.every(url=>url.startsWith('https://')));
  }
});
test('Atomic Bomb Dome windows are holes, with masonry surviving beside them',()=>{
  const root=models.get('dome');root.updateMatrixWorld(true);
  const ray=new THREE.Raycaster();
  const hits=x=>{ray.set(new THREE.Vector3(x,.13,.5),new THREE.Vector3(0,0,-1));return ray.intersectObject(root,true).filter(hit=>Math.abs(hit.point.z-.16)<.015);};
  assert.equal(hits(-.06-.38/6).length,0);
  assert.ok(hits(-.06).length>0);
});
test('Cinderella Castle passage can be seen through, while its side piers remain solid',()=>{
  const root=models.get('fairyCastle');root.updateMatrixWorld(true);const ray=new THREE.Raycaster();
  const hits=x=>{ray.set(new THREE.Vector3(x,.14,1),new THREE.Vector3(0,0,-1));return ray.intersectObject(root,true).filter(hit=>hit.point.z>.22&&hit.point.z<.31);};
  assert.equal(hits(0).length,0);assert.ok(hits(.15).length>0);
});
test('Goryokaku observation deck is pentagonal and its tower stands outside the moat',()=>{
  const root=models.get('fort');assert.equal(root.userData.observationSides,5);
  const [x,z]=root.userData.towerPosition;assert.ok(Math.hypot(x,z)>1.65);
});
test('Fuji adds only a crater summit detail to the elevation map, rather than a flag or second mountain',()=>{
  const root=models.get('fuji');assert.equal(root.userData.terrainSummit,true);
  const size=new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());assert.ok(size.y<.16);assert.ok(size.x<.7);
  const crater=root.children.find(o=>o.material.vertexColors),pos=crater.geometry.attributes.position;
  let centre=Infinity,rim=-Infinity;
  for(let i=0;i<pos.count;i++){const r=Math.hypot(pos.getX(i),pos.getZ(i));if(r<.01)centre=Math.min(centre,pos.getY(i));if(r>.085&&r<.13)rim=Math.max(rim,pos.getY(i));}
  assert.ok(rim-centre>.05);
});
test('Japanese bridge styles preserve open water below their decks and distinguish road/rail',()=>{
  assert.equal(models.get('akashiBridge').userData.railDeck,false);assert.equal(models.get('setoBridge').userData.railDeck,true);
  for(const id of ['akashiBridge','setoBridge']){
    const root=models.get(id);root.updateMatrixWorld(true);const ray=new THREE.Raycaster(new THREE.Vector3(0,.05,1),new THREE.Vector3(0,0,-1));
    assert.equal(ray.intersectObject(root,true).length,0);
  }
});
test('nearby Japanese miniatures, including their contact patches, have separate footprints',async()=>{
  const data=JSON.parse(await readFile(new URL('../dist/Data/landmarks.json',import.meta.url),'utf8'));
  const entries=data.landmarks.filter(e=>e.country==='日本'&&!TERRAIN_LANDMARK_TYPES.has(e.type)&&e.type!=='bridge');
  const points=entries.map(e=>geoToWorld({latitude:e.lat,longitude:e.lon}));
  const displayItems=[];
  const footprints=entries.map((entry,i)=>{
    const root=models.get(entry.type).clone(),bounds=new THREE.Box3().setFromObject(root),height=Math.max(bounds.max.y-Math.min(bounds.min.y,0),.001);
    root.scale.setScalar(landmarkDisplayScale(entry)/height);root.rotation.y=entry.yaw??0;
    root.position.set(points[i].x,0,points[i].y);
    const footprint=new THREE.Box3().setFromObject(root),centre=footprint.getCenter(new THREE.Vector3()),size=footprint.getSize(new THREE.Vector3());
    displayItems.push({name:entry.name,x:points[i].x,z:points[i].y,width:size.x*1.12,depth:size.z*1.12,height:size.y,offsetX:centre.x-points[i].x,offsetZ:centre.z-points[i].y});
    return new THREE.Box3().setFromCenterAndSize(centre,size.multiply(new THREE.Vector3(1.12,1,1.12)));
  });
  const layout=layoutLandmarkDisplays(displayItems);
  footprints.forEach((box,i)=>{const p=layout.get(entries[i].name);box.translate(new THREE.Vector3(p.x-points[i].x,0,p.z-points[i].y));});
  for(let a=0;a<entries.length;a++)for(let b=a+1;b<entries.length;b++){
    const x=footprints[a],y=footprints[b];
    assert.ok(x.max.x<y.min.x||y.max.x<x.min.x||x.max.z<y.min.z||y.max.z<x.min.z,`${entries[a].name} overlaps ${entries[b].name}`);
  }
});
