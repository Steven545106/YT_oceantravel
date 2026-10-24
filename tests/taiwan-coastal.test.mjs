import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GUISHAN_LOCATION,GUISHAN_OUTLINE,hasCustomCoastalTerrain} from '../dist/taiwan-coastal-data.js';
import {geoToWorld} from '../dist/geo.js';
const ctx=new Proxy({createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},{get:(t,k)=>t[k]??(()=>{})});globalThis.document={createElement:()=>({getContext:()=>ctx})};
const {LANDMARK_BUILDERS}=await import('../dist/landmark-models.js');
const data=JSON.parse(await readFile(new URL('../dist/Data/landmarks.json',import.meta.url))).landmarks;
const types=['sanxiantai','vaseRock','guishanIsland','penghuBridge','twinHearts'],models=new Map();
for(const type of types)test(`${type}: real geometry, unique stamp and controlled rendering cost`,()=>{
 const entry=data.find(i=>i.type===type);assert.equal(data.filter(i=>i.type===type).length,1);assert.equal(entry.country,'台灣');assert.equal(entry.name,entry.seal);assert.ok(entry.aliases.length>=2);
 const model=LANDMARK_BUILDERS[type]();models.set(type,model);let draws=0,tris=0;
 model.traverse(o=>{if(!o.isMesh)return;draws++;tris+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;for(const key of ['position','normal'])assert.ok([...o.geometry.attributes[key].array].every(Number.isFinite),`${type} ${key}`);});
 assert.ok(draws<=20,`${draws} draws`);assert.ok(tris<35000,`${tris} triangles`);assert.equal(model.userData.referencePass,'taiwan-coast-2026');
 assert.ok(new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).length()>.5);
});
test('eight-arch footbridge has clear arch openings and an actual raised arch band',()=>{
 const model=models.get('sanxiantai');model.updateMatrixWorld(true);assert.equal(model.userData.archCount,8);
 const x=-.91+3.5*1.27/8;
 const ray=new THREE.Raycaster(new THREE.Vector3(x,.065,.2),new THREE.Vector3(0,0,-1),0,.4);
 assert.equal(ray.intersectObject(model,true).length,0);
 ray.ray.origin.y=.12;assert.ok(ray.intersectObject(model,true).length>0);
});
test('Penghu gate is a hollow arch rather than a solid plate',()=>{
 const model=models.get('penghuBridge');model.updateMatrixWorld(true);
 const ray=new THREE.Raycaster(new THREE.Vector3(.9,.25,0),new THREE.Vector3(-1,0,0),0,.25);
 assert.equal(ray.intersectObject(model,true).length,0);
 ray.ray.origin.y=.302;assert.ok(ray.intersectObject(model,true).length>0);
});
test('heart enclosures retain water interiors rather than filled rock slabs',()=>{
 const model=models.get('twinHearts');model.updateMatrixWorld(true);assert.equal(model.userData.heartCount,2);
 for(const x of [-.235,.235]){
  const ray=new THREE.Raycaster(new THREE.Vector3(x,.5,.02),new THREE.Vector3(0,-1,0),0,.6);
  assert.equal(ray.intersectObject(model,true).filter(hit=>hit.object.material.roughness>.9).length,0);
 }
});
test('Guishan replaces exactly one rendered island, retaining its original collision coastline',async()=>{
 const raw=JSON.parse(await readFile(new URL('../scripts/source-data/taiwan_coast.json',import.meta.url)));const islands=raw.polys.map(flat=>{
  let lon=0,lat=0;const points=[];for(let i=0;i<flat.length;i+=2){lon+=flat[i];lat+=flat[i+1];const p=geoToWorld({latitude:lat/raw.scale,longitude:lon/raw.scale});points.push(p.x,p.y);}
  const xs=points.filter((_,i)=>i%2===0),zs=points.filter((_,i)=>i%2===1);return {country:'tw',points,count:points.length/2,minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs)};
 });
 const selected=islands.filter(hasCustomCoastalTerrain);assert.equal(selected.length,1);
 const centre=geoToWorld(GUISHAN_LOCATION);assert.equal(GUISHAN_OUTLINE.length,selected[0].count);
 GUISHAN_OUTLINE.forEach(([x,z],i)=>{assert.ok(Math.abs(x+centre.x-selected[0].points[i*2])<.000001);assert.ok(Math.abs(z+centre.y-selected[0].points[i*2+1])<.000001);});
 assert.ok(data.find(i=>i.type==='guishanIsland').terrainReplacement);
});
