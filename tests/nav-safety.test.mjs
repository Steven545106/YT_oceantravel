import test from 'node:test';
import assert from 'node:assert/strict';
import {createCoastQuery,segmentDistanceSquared} from '../dist/nav-coast.js';
import {gridLineClear} from '../dist/nav-grid.js';
const square=(minX,minZ,maxX,maxZ,country='tw')=>({minX,minZ,maxX,maxZ,country,count:4,points:new Float64Array([minX,minZ,maxX,minZ,maxX,maxZ,minX,maxZ])});
test('exact coast validation detects a tiny islet between route samples',()=>{
  const coast=createCoastQuery([square(5.001,-.001,5.002,.001)],()=>4);
  assert.equal(coast.segmentClear({x:0,z:0},{x:10,z:0},0),false);
  assert.equal(coast.segmentClear({x:0,z:1},{x:10,z:1},2.1),true);
});
test('routes respect the sailing shore limit and remembered obstacles',()=>{
  const coast=createCoastQuery([square(0,0,2,2)],()=>4);
  assert.equal(coast.segmentClear({x:-1,z:-.4},{x:3,z:-.4},2.1),false);
  assert.equal(coast.segmentClear({x:-1,z:-.6},{x:3,z:-.6},2.1),true);
  assert.equal(coast.segmentClear({x:-1,z:-.6},{x:3,z:-.6},2.1,[{x:1,z:-.6,radius:.2}]),false);
});
test('locked countries get their 12km barrier even on an otherwise clear sea route',()=>{
  const islands=[square(0,0,2,2,'jp')],a={x:-1,z:-1},b={x:3,z:-1};
  assert.ok(createCoastQuery(islands,()=>4).segmentClear(a,b));
  assert.ok(!createCoastQuery(islands,()=>4,['jp']).segmentClear(a,b));
});
test('smoothing cannot cut through diagonal land corners or leave the grid',()=>{
  const grid={minX:0,minZ:0,cols:2,rows:2,cell:1,blocked:new Uint8Array([0,1,1,0])};
  assert.equal(gridLineClear(grid,{x:.5,z:.5},{x:1.5,z:1.5}),false);
  assert.equal(gridLineClear(grid,{x:-.01,z:.5},{x:.5,z:.5}),false);
});
test('segment distance handles intersections, tangencies, and disjoint collinear spans',()=>{
  assert.equal(segmentDistanceSquared({x:0,z:0},{x:2,z:0},{x:1,z:-1},{x:1,z:1}),0);
  assert.equal(segmentDistanceSquared({x:0,z:0},{x:1,z:0},{x:2,z:0},{x:3,z:0}),1);
});

test('open-water trips bypass rasterisation and invalid land starts fail immediately',async()=>{
  const {createNavPlanner}=await import('../dist/nav-planner.js');
  const options={bounds:{minX:-20,maxX:20,minZ:-20,maxZ:20},kmPerWorldUnitAt:()=>4,makeCanvas:()=>{throw new Error('unexpected raster grid');}};
  const sea=createNavPlanner({...options,islands:[]}).plan({x:0,z:0},{x:10,z:5});
  assert.ok(sea.route);assert.deepEqual(sea.route.waypoints,[{x:10,z:5}]);assert.equal(sea.stats.gridCells,0);
  const planner=createNavPlanner({...options,islands:[square(-1,-1,1,1)]});
  assert.equal(planner.plan({x:0,z:0},{x:10,z:5}).route,null);
  assert.equal(planner.plan({x:5,z:5},{x:100,z:5}).route,null);
});
