import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
const context=new Proxy({createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},{get:(t,k)=>t[k]??(()=>{})});
globalThis.document={createElement:()=>({width:128,height:128,getContext:()=>context})};
const {LANDMARK_BUILDERS,setLandmarkNight}=await import('../dist/landmark-models.js');
const {TAIWAN_REFERENCE_MODELS}=await import('../dist/taiwan-reference-data.js');
const data=JSON.parse(await readFile(new URL('../dist/Data/landmarks.json',import.meta.url))).landmarks;
for(const [type,name,lat,lon] of [['shengliVillage','勝利星村',22.678632,120.48449],['pingxiLanterns','平溪天燈',25.04269,121.77667]])test(`${name}: reference, stamp identity and geometry survive day/night`,()=>{
 const entry=data.find(item=>item.type===type);assert.equal(entry.name,name);assert.equal(entry.country,'台灣');assert.equal(entry.seal,name);assert.equal(entry.lat,lat);assert.equal(entry.lon,lon);assert.ok(entry.aliases.length>2);
 assert.equal(data.filter(item=>item.type===type).length,1);
 const reference=TAIWAN_REFERENCE_MODELS.find(item=>item.type===type);assert.ok(reference.sources.length>=2);
 const root=LANDMARK_BUILDERS[type](),materials=new Set();let meshes=0,triangles=0;
 root.traverse(m=>{if(!m.isMesh)return;meshes++;materials.add(m.material);for(const a of ['position','normal'])assert.ok([...m.geometry.attributes[a].array].every(Number.isFinite));triangles+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3;});
 assert.ok(meshes<40,`${meshes} draws`);assert.ok(triangles<35000,`${triangles} triangles`);
 const box=new THREE.Box3().setFromObject(root),size=box.getSize(new THREE.Vector3());assert.ok(size.x>2&&size.z>1.5&&size.y>.6);
 setLandmarkNight(false);const day=[...materials].map(m=>m.emissiveIntensity);setLandmarkNight(true);assert.ok([...materials].some((m,i)=>m.emissiveIntensity>day[i]));setLandmarkNight(false);
 [...materials].forEach((m,i)=>assert.equal(m.emissiveIntensity,day[i]));
});
test('sky lantern envelope has an open lower mouth rather than a closed balloon base',()=>{
 const root=LANDMARK_BUILDERS.pingxiLanterns();root.updateMatrixWorld(true);
 // First lantern's off-centre mouth: avoid its fuel and crossed bamboo supports.
 const ray=new THREE.Raycaster(new THREE.Vector3(-.09+.017,.111,.73+.017),new THREE.Vector3(0,1,0));
 const hits=ray.intersectObject(root,true);assert.ok(hits.length);assert.ok(hits[0].point.y>.28,`mouth unexpectedly capped at ${hits[0].point.y}`);
});
