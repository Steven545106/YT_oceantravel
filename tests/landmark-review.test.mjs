import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {buildReviewCatalogue,filterReviewCatalogue,REVIEW_COUNTRIES} from '../dist/landmark-review-catalogue.js';
import {TAIWAN_REFERENCE_MODELS} from '../dist/taiwan-reference-data.js';
import {JAPAN_REFERENCE_MODELS} from '../dist/japan-reference-data.js';
import {KOREA_REFERENCE_MODELS} from '../dist/korea-reference-data.js';
import {NK_PH_REFERENCE_MODELS} from '../dist/nk-ph-reference-data.js';
const ctx=new Proxy({createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},{get:(t,k)=>t[k]??(()=>{})});
globalThis.document={createElement:()=>({width:128,height:128,getContext:()=>ctx})};
const {LANDMARK_BUILDERS}=await import('../dist/landmark-models.js');
const landmarks=JSON.parse(await readFile(new URL('../dist/Data/landmarks.json',import.meta.url))).landmarks;
const references=[...TAIWAN_REFERENCE_MODELS,...JAPAN_REFERENCE_MODELS,...KOREA_REFERENCE_MODELS,...NK_PH_REFERENCE_MODELS];
const items=buildReviewCatalogue(landmarks,references);
test('unified preview covers every game landmark with unique URLs and valid builders',()=>{
  assert.equal(items.length,landmarks.length);assert.equal(new Set(items.map(item=>item.id)).size,items.length);
  assert.deepEqual(REVIEW_COUNTRIES.map(country=>items.filter(item=>item.country===country).length),[25,29,17,10,2]);
  for(const item of items){assert.equal(typeof LANDMARK_BUILDERS[item.type],'function',item.name);assert.ok(item.features);}
  for(const ref of references){const item=items.find(item=>item.name===ref.name);assert.equal(item.id,ref.id??ref.type);assert.deepEqual(item.sources,ref.sources);}
});
test('country, aliases and combined filters work and zero results can recover',()=>{
  assert.equal(filterReviewCatalogue(items,{country:'菲律賓'}).length,10);
  assert.equal(filterReviewCatalogue(items,{country:'北韓'}).length,2);
  assert.equal(filterReviewCatalogue(items,{query:'NSYSU'})[0].name,'國立中山大學');
  assert.equal(filterReviewCatalogue(items,{country:'日本',query:'SkyTree'})[0].name,'東京晴空塔');
  assert.equal(filterReviewCatalogue(items,{country:'台灣',query:'東京'}).length,0);
  assert.equal(filterReviewCatalogue(items,{query:' '}).length,items.length);
});
test('newly included Philippines and North Korea previews build finite visible geometry',()=>{
  for(const item of items.filter(item=>['菲律賓','北韓'].includes(item.country))){
    const model=LANDMARK_BUILDERS[item.type](item.options);const size=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    assert.ok([size.x,size.y,size.z].every(n=>Number.isFinite(n)&&n>0),item.name);
    model.traverse(o=>{if(o.geometry){for(const n of o.geometry.attributes.position.array)assert.ok(Number.isFinite(n),item.name);o.geometry.dispose();}});
  }
});
