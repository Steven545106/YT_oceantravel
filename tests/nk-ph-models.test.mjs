import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {NK_PH_REFERENCE_MODELS} from '../dist/nk-ph-reference-data.js';
const ctx=new Proxy({createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},{get:(t,k)=>t[k]??(()=>{})});
globalThis.document={createElement:()=>({width:128,height:128,getContext:()=>ctx})};
const {LANDMARK_BUILDERS}=await import('../dist/landmark-models.js');
const landmarks=JSON.parse(await readFile(new URL('../dist/Data/landmarks.json',import.meta.url))).landmarks;
const roots=new Map();

for(const ref of NK_PH_REFERENCE_MODELS)test(`${ref.name} has a finite, efficient reference model`,()=>{
  const entry=landmarks.find(item=>item.name===ref.name);
  assert.ok(entry);assert.equal(ref.type,entry.type);
  const root=LANDMARK_BUILDERS[entry.type](entry.options??{});roots.set(ref.name,root);
  let draws=0,triangles=0;
  root.traverse(mesh=>{if(!mesh.isMesh)return;draws++;
    for(const attr of ['position','normal'])assert.ok([...mesh.geometry.attributes[attr].array].every(Number.isFinite),`${ref.name}: ${attr}`);
    triangles+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3;
  });
  const size=new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  assert.ok(size.x>0&&size.y>0&&size.z>0);
  assert.ok(draws<32,`${ref.name}: ${draws} draws`);
  assert.ok(triangles<35000,`${ref.name}: ${triangles} triangles`);
  assert.equal(root.userData.referencePass,'nk-ph-2026');
  assert.ok(ref.sources.length);
});
test('Philippine catalogue contains the requested ten stamps in order',()=>{
  const entries=landmarks.filter(item=>['北韓','菲律賓'].includes(item.country));
  assert.equal(entries.length,12);assert.equal(NK_PH_REFERENCE_MODELS.length,12);
  for(const entry of entries)assert.ok(NK_PH_REFERENCE_MODELS.some(ref=>ref.name===entry.name));
  assert.deepEqual(landmarks.filter(item=>item.country==='菲律賓').map(item=>item.name),[
    '馬尼拉王城區','維甘古城','聖地牙哥堡','馬拉坎南宮','菲律賓國家美術館',
    '馬尼拉大都會劇院','黎剎紀念碑','科雷希多島','巴丹西班牙古建築園區','帕瓦伊教堂'
  ]);
  assert.equal(landmarks.find(item=>item.name==='白頭山').options.volcano,'paektu');
});
test('Pyongyang arch and Fort Santiago gateway have actual openings',()=>{
  for(const [name,solidX,passY] of [['平壤凱旋門',.35,.24],['聖地牙哥堡',.25,.12]]){
    const root=roots.get(name);root.updateMatrixWorld(true);
    const ray=(x)=>new THREE.Raycaster(new THREE.Vector3(x,passY,2),new THREE.Vector3(0,0,-1)).intersectObject(root,true)
      .filter(hit=>name==='平壤凱旋門'?Math.abs(hit.point.z)<.31:Math.abs(hit.point.z-.4)<.2);
    assert.equal(ray(0).length,0,`${name}: passage blocked`);
    assert.ok(ray(solidX).length>0,`${name}: pier missing`);
  }
});
test('Paektu summit replaces the generic flag',()=>{
  assert.equal(roots.get('白頭山').userData.summit,'Lake Chon caldera');
  const size=new THREE.Box3().setFromObject(roots.get('白頭山')).getSize(new THREE.Vector3());
  assert.ok(size.y<1.5&&size.x<2);
});
test('Intramuros gate has a walk-through passage',()=>{
  const root=roots.get('馬尼拉王城區');root.updateMatrixWorld(true);
  const hits=x=>new THREE.Raycaster(new THREE.Vector3(x,.1,1.2),new THREE.Vector3(0,0,-1))
    .intersectObject(root,true).filter(hit=>Math.abs(hit.point.z-.63)<.2);
  assert.equal(hits(0).length,0);assert.ok(hits(.5).length>0);
});
test('Paoay tower stands apart from the buttressed church',()=>{
  const root=roots.get('帕瓦伊教堂'),box=new THREE.Box3().setFromObject(root);
  assert.ok(root.userData.features.includes('獨立鐘樓'));
  assert.ok(box.min.x<-.8&&box.max.x>.6);
});
