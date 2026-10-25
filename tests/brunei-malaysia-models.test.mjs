import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {BRUNEI_MALAYSIA_REFERENCE_MODELS} from '../dist/brunei-malaysia-reference-data.js';
const ctx=new Proxy({createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},{get:(t,k)=>t[k]??(()=>{})});
globalThis.document={createElement:()=>({width:128,height:128,getContext:()=>ctx})};
const {LANDMARK_BUILDERS}=await import('../dist/landmark-models.js');
const catalogue=JSON.parse(await readFile(new URL('../dist/Data/landmarks.json',import.meta.url))).landmarks;
test('nine Brunei and Malaysia sights have real-world references and distinct finite models',()=>{
  assert.equal(BRUNEI_MALAYSIA_REFERENCE_MODELS.length,9);
  const countries={汶萊:3,馬來西亞:6};
  for(const [country,count] of Object.entries(countries))assert.equal(catalogue.filter(i=>i.country===country).length,count);
  for(const ref of BRUNEI_MALAYSIA_REFERENCE_MODELS){
    const entry=catalogue.find(i=>i.name===ref.name);
    assert.equal(entry?.type,ref.type,ref.name);
    assert.ok(ref.sources.length&&ref.sources.every(s=>s.startsWith('https://')),ref.name);
    const model=LANDMARK_BUILDERS[ref.type]();
    assert.equal(model.userData.referencePass,'brunei-malaysia-2026',ref.name);
    const bounds=new THREE.Box3().setFromObject(model);
    const size=bounds.getSize(new THREE.Vector3());
    assert.ok([size.x,size.y,size.z].every(n=>Number.isFinite(n)&&n>.2),ref.name);
    model.traverse(o=>o.geometry?.dispose());
  }
});
