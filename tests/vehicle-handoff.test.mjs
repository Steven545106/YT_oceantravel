import test from 'node:test';
import assert from 'node:assert/strict';
import {seaSpotNear} from '../dist/vehicle-handoff.js';

// a round island of radius 10 at the origin; open sea starts 1 unit off it
const onIsland=(x,z)=>Math.hypot(x,z)<11;
const openSea=(x,z)=>!onIsland(x,z);

test('a jet over the sea hands over exactly where it is',()=>{
  assert.deepEqual(seaSpotNear(20,5,openSea),{x:20,z:5,moved:false});
});

test('a jet over land hands over at the nearest open water',()=>{
  const spot=seaSpotNear(6,0,openSea);
  assert.equal(spot.moved,true);
  assert.equal(onIsland(spot.x,spot.z),false);
  assert.ok(Math.hypot(spot.x-6,spot.z)<=5.25,'about the 5 units to open water on the near side, not across the island');
});

test('a lake or river mouth is not taken for open sea',()=>{
  const lake=(x,z)=>Math.hypot(x-3,z)<1;   // water inside the island, a little east of the start
  const open=(x,z)=>!lake(x,z)&&!onIsland(x,z);
  const spot=seaSpotNear(2,0,open);
  assert.ok(Math.hypot(spot.x,spot.z)>=11);
});

test('no sea within reach gives null',()=>{
  assert.equal(seaSpotNear(0,0,()=>false,{maxRadius:2}),null);
});
