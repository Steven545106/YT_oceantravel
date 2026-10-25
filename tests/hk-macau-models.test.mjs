import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {HK_MACAU_REFERENCE_MODELS} from '../dist/hk-macau-reference-data.js';

const ctx=new Proxy({createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},{get:(t,k)=>t[k]??(()=>{})});
globalThis.document={createElement:()=>({width:128,height:128,getContext:()=>ctx})};
const {LANDMARK_BUILDERS}=await import('../dist/landmark-models.js');
const {landmarks}=JSON.parse(await readFile(new URL('../dist/Data/landmarks.json',import.meta.url)));
const expected={
  香港:['太平山頂','維多利亞港','天壇大佛','星光大道','大館'],
  澳門:['大三巴牌坊','議事亭前地','東望洋炮台及燈塔','澳門旅遊塔','澳門威尼斯人']
};
test('Hong Kong and Macao contain the requested sights and real-world references',()=>{
  for(const [country,names] of Object.entries(expected)){
    assert.deepEqual(landmarks.filter(item=>item.country===country).map(item=>item.name),names);
    for(const name of names)assert.ok(HK_MACAU_REFERENCE_MODELS.find(item=>item.name===name)?.sources.length,name);
  }
});
for(const entry of landmarks.filter(item=>['香港','澳門'].includes(item.country))){
  test(`${entry.name}: finite original geometry and bounded rendering cost`,()=>{
    const model=LANDMARK_BUILDERS[entry.type](),bounds=new THREE.Box3().setFromObject(model);
    const size=bounds.getSize(new THREE.Vector3());
    assert.ok([size.x,size.y,size.z].every(n=>Number.isFinite(n)&&n>0),entry.name);
    let meshes=0,triangles=0;
    model.traverse(object=>{
      if(!object.isMesh)return;
      meshes++;
      const position=object.geometry.attributes.position;
      assert.ok(position&&position.count>0,entry.name);
      for(const n of position.array)assert.ok(Number.isFinite(n),entry.name);
      triangles+=(object.geometry.index?.count??position.count)/3;
    });
    assert.ok(meshes<=16,`${entry.name}: ${meshes} draws`);
    assert.ok(triangles<8000,`${entry.name}: ${triangles} triangles`);
    assert.equal(model.userData.referencePass,'hk-mo-2026');
  });
}
test('sea model stays in the harbour and landmark silhouettes remain distinct',()=>{
  assert.equal(landmarks.find(item=>item.type==='victoriaHarbour').sea,true);
  const peak=LANDMARK_BUILDERS.victoriaPeak(),buddha=LANDMARK_BUILDERS.tianTanBuddha();
  const ruin=LANDMARK_BUILDERS.ruinsStPaul(),tower=LANDMARK_BUILDERS.macauTower();
  assert.equal(peak.userData.peakTower,true);
  assert.equal(buddha.userData.seatedBuddha,true);
  assert.equal(ruin.userData.openRuin,true);
  assert.equal(tower.userData.towerPod,true);
  const towerSize=new THREE.Box3().setFromObject(tower).getSize(new THREE.Vector3());
  assert.ok(towerSize.y>towerSize.x*3);
});
test('sights are compact enough to show at the common height without a footprint cap',()=>{
  for(const entry of landmarks.filter(item=>['香港','澳門'].includes(item.country))){
    assert.equal(entry.maxDisplayFootprintKm,undefined,entry.name);
    const bounds=new THREE.Box3().setFromObject(LANDMARK_BUILDERS[entry.type]());
    const size=bounds.getSize(new THREE.Vector3()),height=bounds.max.y-Math.min(bounds.min.y,0);
    assert.ok(Math.max(size.x,size.z)<=1.5*height,`${entry.name}: ${(Math.max(size.x,size.z)/height).toFixed(2)} wide per unit height`);
  }
});
