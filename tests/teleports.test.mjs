import test from 'node:test';
import assert from 'node:assert/strict';
import {createTeleportStore,teleportSiteProblem,TELEPORT_KEY,TELEPORT_REACH_KM} from '../dist/teleports.js';

const memory=()=>{const items=new Map();return {getItem:k=>items.get(k)??null,setItem:(k,v)=>items.set(k,v)};};

test('one teleport point per country, kept across reloads, replaced when set again',()=>{
  const storage=memory(),store=createTeleportStore(storage);
  let changed=[];store.onChange(code=>changed.push(code));
  store.set('jp',{lat:35,lon:140,heading:1});
  store.set('jp',{lat:34,lon:135,heading:2});
  store.set('kr',{lat:35.1,lon:129.1});
  assert.deepEqual(changed,['jp','jp','kr']);
  const again=createTeleportStore(storage);
  assert.equal(again.get('jp').lat,34);assert.equal(again.get('jp').heading,2);
  assert.deepEqual(Object.keys(again.all()).sort(),['jp','kr']);
  assert.equal(again.get('tw'),null);
  assert.ok(JSON.parse(storage.getItem(TELEPORT_KEY)).kr);
});

test('a broken save starts empty',()=>{
  const storage=memory();storage.setItem(TELEPORT_KEY,'{oops');
  assert.deepEqual(createTeleportStore(storage).all(),{});
});

test('a point needs the master badge, a ship at sea, and the country\'s own coast within reach',()=>{
  const spot={name:'澳門',unlocked:true,fighter:false,onLand:false,countryKm:3};
  assert.equal(teleportSiteProblem(spot),null,'another country\'s nearer shore (Zhuhai beside Macau) does not matter');
  assert.match(teleportSiteProblem({...spot,unlocked:false}),/澳門達人/);
  assert.match(teleportSiteProblem({...spot,fighter:true}),/船/);
  assert.match(teleportSiteProblem({...spot,onLand:true}),/海上/);
  assert.match(teleportSiteProblem({...spot,countryKm:TELEPORT_REACH_KM+1}),/澳門沿海 60 公里/);
  assert.match(teleportSiteProblem({...spot,countryKm:Infinity}),/澳門沿海/,'none of its coast loaded');
});
