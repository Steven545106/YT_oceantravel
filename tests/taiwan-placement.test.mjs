import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {geoToWorld,worldToGeo,kmPerWorldUnitAt} from '../dist/geo.js';
import {landmarkFootprintScale,landmarkDisplayGeo,landmarkDisplayName,layoutLandmarkDisplays,landmarkDisplayScale,TERRAIN_LANDMARK_TYPES} from '../dist/landmark-scale.js';
import {pointInIsland} from '../dist/nav-coast.js';
const ctx=new Proxy({createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},{get:(t,k)=>t[k]??(()=>{})});globalThis.document={createElement:()=>({getContext:()=>ctx})};
const {LANDMARK_BUILDERS}=await import('../dist/landmark-models.js');
const root=new URL('../dist/Data/',import.meta.url);const data=JSON.parse(fs.readFileSync(new URL('landmarks.json',root))).landmarks;
const coast=JSON.parse(fs.readFileSync(new URL('../scripts/source-data/taiwan_coast.json',import.meta.url))),islands=coast.polys.map(flat=>{let lat=0,lon=0;const points=[];for(let i=0;i<flat.length;i+=2){lon+=flat[i];lat+=flat[i+1];const p=geoToWorld({latitude:lat/coast.scale,longitude:lon/coast.scale});points.push(p.x,p.y);}return {points,count:points.length/2};});
const sites=[];
for(const entry of data.filter(e=>e.country==='台灣'&&e.type!=='virtual'&&!TERRAIN_LANDMARK_TYPES.has(e.type))){const model=LANDMARK_BUILDERS[entry.type](entry.options??{}),raw=new THREE.Box3().setFromObject(model),p=geoToWorld(landmarkDisplayGeo(entry));model.scale.setScalar(landmarkDisplayScale(entry)/(entry.worldSized?1:raw.max.y-Math.min(raw.min.y,0)));const footprint=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());model.scale.multiplyScalar(landmarkFootprintScale(entry,footprint,kmPerWorldUnitAt(p.y)));model.position.set(p.x,0,p.y);model.rotation.y=entry.yaw??0;const b=new THREE.Box3().setFromObject(model),s=b.getSize(new THREE.Vector3()),c=b.getCenter(new THREE.Vector3());sites.push({fixed:entry.preserveLocation,name:entry.name,x:p.x,z:p.y,width:s.x*1.12,depth:s.z*1.12,height:s.y,offsetX:c.x-p.x,offsetZ:c.z-p.y});}
const canPlace=(x,z)=>islands.some(i=>pointInIsland(i,x,z));const layout=layoutLandmarkDisplays(sites,canPlace);
test('village uses its separated game location while the temple retains its anchor',()=>{
 const village=sites.find(i=>i.name==='勝利星村'),temple=sites.find(i=>i.name==='佛光山');
 for(const site of [village,temple])assert.deepEqual(layout.get(site.name),{x:site.x,z:site.z});
 const p=layout.get(village.name),q=layout.get(temple.name);
 const geo=worldToGeo(p.x,p.z);assert.ok(Math.abs(geo.latitude-22.52)<1e-9);assert.ok(Math.abs(geo.longitude-120.52)<1e-9);
 assert.ok(p.x>q.x&&p.z>q.z,'village is southeast of the temple');
 const km=Math.hypot(p.x-q.x,p.z-q.z)*kmPerWorldUnitAt(p.z);assert.ok(km>25&&km<32);
});
test('village stays within its 4 km display cap and does not touch the temple miniature',()=>{
 const v=sites.find(i=>i.name==='勝利星村'),t=sites.find(i=>i.name==='佛光山');
 assert.ok(Math.max(v.width,v.depth)/1.12*kmPerWorldUnitAt(v.z)<=4+1e-6);
 assert.ok(Math.abs(v.x+v.offsetX-t.x-t.offsetX)>(v.width+t.width)/2+.18||Math.abs(v.z+v.offsetZ-t.z-t.offsetZ)>(v.depth+t.depth)/2+.18);
 for(const other of sites.filter(i=>i!==v)){
  const a=layout.get(v.name),b=layout.get(other.name);
  assert.ok(Math.abs(a.x+v.offsetX-b.x-other.offsetX)>=(v.width+other.width)/2+.179||Math.abs(a.z+v.offsetZ-b.z-other.offsetZ)>=(v.depth+other.depth)/2+.179,`village overlaps ${other.name}`);
 }
});
test('plain labels retain the saved stamp identities',()=>{
 const entry=data.find(i=>i.type==='shengliVillage');assert.equal(entry.name,'勝利星村');assert.equal(entry.seal,'勝利星村');assert.equal(landmarkDisplayName(entry),'勝利星村');assert.equal(entry.lat,22.678632);assert.equal(entry.lon,120.48449);assert.equal(landmarkDisplayName(data.find(i=>i.type==='foguangshan')),'佛光山');
 assert.equal(landmarkDisplayName({name:'東京鐵塔'}),'東京鐵塔');
});
