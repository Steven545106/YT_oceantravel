import test from 'node:test';
import assert from 'node:assert/strict';
import {obstacleBlocksSegment,obstacleContains} from '../dist/scenery-obstacles.js';
import {createCoastQuery} from '../dist/coast-query.js';
const rect={minX:1,maxX:2,minZ:-1,maxZ:1};
test('visual foundations block whole movement segments and coast checks, including thin crossings',()=>{
  assert.ok(obstacleContains(rect,1.5,0));assert.ok(obstacleBlocksSegment(rect,{x:0,z:0},{x:3,z:0}));
  assert.equal(obstacleBlocksSegment(rect,{x:0,z:2},{x:3,z:2}),false);
  assert.equal(createCoastQuery([],()=>4).segmentClear({x:0,z:0},{x:3,z:0},0,[rect]),false);
});
test('a boat loaded inside a newly placed foundation can move toward the nearest exit',async()=>{
  const {movementBlocked}=await import('../dist/scenery-obstacles.js');
  assert.equal(movementBlocked(rect,{x:1.8,z:0},{x:1.9,z:0}),false);
  assert.equal(movementBlocked(rect,{x:1.8,z:0},{x:1.7,z:0}),true);
  assert.equal(movementBlocked(rect,{x:1.8,z:0},{x:2.1,z:0}),false);
});
test('a stamp stop given at sea stays where it is',async()=>{
  const {seaCandidates}=await import('../dist/stamp-stops.js');
  const coast=createCoastQuery([],()=>4);
  assert.deepEqual(seaCandidates(2,3,{coast,bounds:{minX:-10,maxX:10,minZ:-10,maxZ:10},kmPerWorldUnitAt:()=>4}).candidates,[{x:2,z:3}]);
});
test('overlapping inland borders are not taken for coastlines when finding the nearest sea',()=>{
  const square=(x0,z0,x1,z1)=>({minX:x0,maxX:x1,minZ:z0,maxZ:z1,count:4,points:new Float64Array([x0,z0,x1,z0,x1,z1,x0,z1])});
  const coast=createCoastQuery([square(0,0,10,10),square(9,0,20,10)],()=>4);
  const p=coast.nearestSea(9.5,5);
  assert.ok(p.z===0||p.z===10||p.x===0||p.x===20);
});
