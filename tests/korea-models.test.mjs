import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {KOREA_REFERENCE_MODELS} from '../dist/korea-reference-data.js';
import {TERRAIN_LANDMARK_TYPES,landmarkDisplayScale} from '../dist/landmark-scale.js';
const ctx=new Proxy({createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},{get:(t,k)=>t[k]??(()=>{})});
globalThis.document={createElement:()=>({width:128,height:128,getContext:()=>ctx})};
const {LANDMARK_BUILDERS}=await import('../dist/landmark-models.js');
const models=new Map();
for(const item of KOREA_REFERENCE_MODELS)test(`${item.name}: distinct finite reference geometry with bounded rendering cost`,()=>{
 const root=LANDMARK_BUILDERS[item.type](item.options??{});models.set(item.id??item.type,root);
 let draws=0,triangles=0;
 root.traverse(m=>{if(!m.isMesh)return;draws++;const geo=m.geometry;
  for(const attribute of ['position','normal'])assert.ok([...geo.attributes[attribute].array].every(Number.isFinite),attribute);
  triangles+=(geo.index?.count??geo.attributes.position.count)/3;
 });
 const size=new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
 assert.ok(size.x>0&&size.y>0&&size.z>0);
 assert.ok(draws<40,`${draws} draws`);assert.ok(triangles<70000,`${triangles} triangles`);
 assert.equal(root.userData.referencePass,'korea-2026');
});
test('all 17 Korean stamp names and geographic anchors remain intact and have individual references',async()=>{
 const all=JSON.parse(await readFile(new URL('../dist/Data/landmarks.json',import.meta.url))).landmarks;
 const korea=all.filter(t=>t.country==='韓國');assert.equal(korea.length,17);assert.equal(KOREA_REFERENCE_MODELS.length,17);
 for(const t of korea){const reference=KOREA_REFERENCE_MODELS.find(m=>m.name===t.name);assert.ok(reference,t.name);assert.equal(reference.type,t.type);assert.ok(t.lat>33&&t.lat<39);assert.ok(t.lon>126&&t.lon<133);assert.ok(reference.sources.every(s=>s.startsWith('https://')));}
});
test('Gwanghwamun has real openings in all three stone arches',()=>{
 const root=models.get('gyeongbokgung');root.updateMatrixWorld(true);
 const hits=(x,y)=>new THREE.Raycaster(new THREE.Vector3(x,y,1.7),new THREE.Vector3(0,0,-1)).intersectObject(root,true).filter(h=>h.point.z>.85&&h.point.z<1.2);
 for(const x of [-.38,0,.38])assert.equal(hits(x,.09).length,0);
 assert.ok(hits(.18,.09).length>0);
});
test('Hwaseong gate has an actual arch passage',()=>{
 const root=models.get('hwaseong');root.updateMatrixWorld(true);
 const hits=x=>new THREE.Raycaster(new THREE.Vector3(x,.09,.3),new THREE.Vector3(0,0,-1)).intersectObject(root,true).filter(h=>Math.abs(h.point.z)<.2);
 assert.equal(hits(0).length,0);assert.ok(hits(.25).length>0);
});
test('Lotte crown has an open central slot above its sky bridge',()=>{
 const root=models.get('lotteTower');root.updateMatrixWorld(true);
 const hits=x=>new THREE.Raycaster(new THREE.Vector3(x,1.26,.3),new THREE.Vector3(0,0,-1)).intersectObject(root,true);
 assert.equal(hits(0).length,0);assert.ok(hits(.026).length>0);
});
test('Korean mountain details replace flags without adding a second full mountain',()=>{
 for(const type of ['seongsan','hallasan','seoraksan','jirisan']){
  assert.ok(TERRAIN_LANDMARK_TYPES.has(type));assert.equal(landmarkDisplayScale({type,realHeight:0}),1);
  const root=models.get(type),size=new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  assert.ok(root.userData.terrainSummit);assert.ok(size.y<.35);assert.ok(size.x<1.1);
 }
 assert.ok(models.get('seongsan').userData.crater);assert.ok(models.get('hallasan').userData.craterLake);
});
test('Bulguksa pagodas retain different forms and correct sides from the entrance',()=>{
 const p=models.get('bulguksa').userData.pagodas;assert.ok(p.seokgatapX<0&&p.dabotapX>0);
});
test('Gwangan uses two road decks and leaves its central water passage open',()=>{
 const root=models.get('gwanganBridge');assert.equal(root.userData.roadDecks,2);assert.equal(root.userData.railDeck,false);
 root.updateMatrixWorld(true);assert.equal(new THREE.Raycaster(new THREE.Vector3(0,.05,1),new THREE.Vector3(0,0,-1)).intersectObject(root,true).length,0);
});
test('Nami Island keeps a clear centre beneath its paired tree avenue',()=>{
 const root=models.get('namiIsland');root.updateMatrixWorld(true);
 const hits=new THREE.Raycaster(new THREE.Vector3(0,.12,2),new THREE.Vector3(0,0,-1)).intersectObject(root,true);
 assert.equal(hits.length,0);
});
