import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {VIETNAM_REFERENCE_MODELS} from '../dist/vietnam-reference-data.js';

const ctx=new Proxy({createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},{get:(t,k)=>t[k]??(()=>{})});
globalThis.document={createElement:()=>({width:128,height:128,getContext:()=>ctx})};
const {LANDMARK_BUILDERS}=await import('../dist/landmark-models.js');
const {landmarks}=JSON.parse(await readFile(new URL('../dist/Data/landmarks.json',import.meta.url)));
const vietnam=landmarks.filter(entry=>entry.country==='越南');
const names=['下龍灣','巴拿山黃金佛手橋','河內還劍湖','富國島','寧平長安名勝群'];

test('Vietnam has five geographic sights, stamp identities, and real-world references',()=>{
  assert.deepEqual(vietnam.map(item=>item.name),names);
  assert.equal(new Set(vietnam.map(item=>item.type)).size,5);
  for(const item of vietnam){
    assert.ok(Number.isFinite(item.lat)&&Number.isFinite(item.lon));
    assert.ok(item.maxDisplayFootprintKm>=3&&item.intro&&item.aliases.length);
    assert.ok(VIETNAM_REFERENCE_MODELS.find(ref=>ref.name===item.name)?.sources.length);
  }
  assert.equal(vietnam.find(item=>item.name==='下龍灣').sea,true);
});

for(const entry of vietnam)test(`${entry.name} has finite, readable and affordable geometry`,()=>{
  const model=LANDMARK_BUILDERS[entry.type](),size=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  assert.ok([size.x,size.y,size.z].every(n=>Number.isFinite(n)&&n>.1));
  assert.equal(model.userData.referencePass,'vietnam-2026');
  let meshes=0,triangles=0;
  model.traverse(object=>{if(!object.isMesh)return;meshes++;
    const positions=object.geometry.attributes.position;
    assert.ok(positions?.count>0);
    for(const n of positions.array)assert.ok(Number.isFinite(n));
    triangles+=(object.geometry.index?.count??positions.count)/3;
  });
  assert.ok(meshes<=20,`${entry.name}: ${meshes} draw calls`);
  assert.ok(triangles<12000,`${entry.name}: ${triangles} triangles`);
});

test('distinctive silhouettes keep their required site features',()=>{
  assert.equal(LANDMARK_BUILDERS.haLongBay().userData.marineKarst,true);
  assert.equal(LANDMARK_BUILDERS.goldenBridge().userData.twoHands,true);
  const lake=LANDMARK_BUILDERS.hoanKiemLake();
  assert.ok(lake.userData.turtleTower&&lake.userData.redBridge);
  assert.equal(LANDMARK_BUILDERS.phuQuocIsland().userData.westBeach,true);
  assert.equal(LANDMARK_BUILDERS.trangAn().userData.cavePassage,true);
});
