import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {INDONESIA_SINGAPORE_REFERENCE_MODELS} from '../dist/indonesia-singapore-reference-data.js';
const ctx=new Proxy({createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},{get:(t,k)=>t[k]??(()=>{})});
globalThis.document={createElement:()=>({width:128,height:128,getContext:()=>ctx})};
const {LANDMARK_BUILDERS}=await import('../dist/landmark-models.js');
const catalogue=JSON.parse(await readFile(new URL('../dist/Data/landmarks.json',import.meta.url))).landmarks;
test('nine Indonesia and Singapore sights have referenced, finite models and stamp identities',()=>{
  assert.equal(INDONESIA_SINGAPORE_REFERENCE_MODELS.length,9);
  for(const [country,count] of Object.entries({印尼:4,新加坡:5}))assert.equal(catalogue.filter(i=>i.country===country).length,count);
  for(const ref of INDONESIA_SINGAPORE_REFERENCE_MODELS){
    const entry=catalogue.find(i=>i.name===ref.name);
    assert.equal(entry?.type,ref.type,ref.name);
    assert.ok(ref.sources.length&&ref.sources.every(s=>s.startsWith('https://')),ref.name);
    const model=LANDMARK_BUILDERS[ref.type]();
    assert.equal(model.userData.referencePass,'indonesia-singapore-2026',ref.name);
    const size=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    assert.ok([size.x,size.y,size.z].every(n=>Number.isFinite(n)&&n>.2),ref.name);
    model.traverse(o=>o.geometry?.dispose());
  }
});
test('upper Ubud paddies have earth underneath down to the terrain base',()=>{
  const model=LANDMARK_BUILDERS.ubudRiceTerraces();
  model.updateMatrixWorld(true);
  const ray=new THREE.Raycaster(new THREE.Vector3(0,.10,1.2),new THREE.Vector3(0,0,-1));
  const hit=ray.intersectObject(model,true)[0];
  assert.ok(hit&&hit.point.z>.83,'a high retaining wall should reach the low slope without a void');
  model.traverse(o=>o.geometry?.dispose());
});
test('Merlion silhouette includes fish scales, curled tail, lion mane and open-mouth fountain',()=>{
  const model=LANDMARK_BUILDERS.merlionPark();
  for(const key of ['fishScales','lionMane','openMouth','waterSpout'])assert.equal(model.userData[key],true,key);
  const bounds=new THREE.Box3().setFromObject(model);
  assert.ok(bounds.max.y>.9&&bounds.min.x<-.7&&bounds.max.x>.85);
  model.traverse(o=>o.geometry?.dispose());
});
