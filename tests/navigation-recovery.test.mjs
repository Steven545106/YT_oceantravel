import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {obstacleBlocksSegment,obstacleContains} from '../dist/nav-obstacles.js';
import {createCoastQuery} from '../dist/nav-coast.js';
const rect={minX:1,maxX:2,minZ:-1,maxZ:1};
test('visual foundations block whole movement segments and planner checks, including thin crossings',()=>{
  assert.ok(obstacleContains(rect,1.5,0));assert.ok(obstacleBlocksSegment(rect,{x:0,z:0},{x:3,z:0}));
  assert.equal(obstacleBlocksSegment(rect,{x:0,z:2},{x:3,z:2}),false);
  assert.equal(createCoastQuery([],()=>4).segmentClear({x:0,z:0},{x:3,z:0},0,[rect]),false);
});
const source=await readFile(new URL('../dist/nav.js',import.meta.url),'utf8');
const body=source.slice(source.indexOf('export function autopilotStep'),source.indexOf('\nfunction routeLength')).replace('export function','function');
function controller({obstacles=[],blocked=false,from={x:0,z:0},waypoints=[{x:4,z:0}],heading=-Math.PI/2}={}){
  const boat={position:{...from},rotation:{y:heading}},events=[],hazards=[];
  const state={velocity:0,handling:{speed:1,turn:1},autopilot:{waypoints,index:0,label:'測試',query:'test',retries:2,lastText:'',progressSeconds:0,bestDistance:Infinity,progressIndex:0}};
  const step=new Function('THREE','boat','state','distanceToLand','isLandAt','sceneryObstacles','obstacleBlocksSegment','markNavObstacle','stopAutopilot','runNavigation','setNavStatus','recordEvent','kmPerWorldUnitAt','formatDuration','queueMicrotask','scheduleNavigationRetry',`const AUTOPILOT_CRUISE=2.2,AUTOPILOT_TURN_RATE=1.1;${body};return autopilotStep;`)(THREE,boat,state,()=>({km:100}),()=>blocked,obstacles,obstacleBlocksSegment,(...p)=>hazards.push(p),message=>{events.push(message);state.autopilot=null;},()=>events.push('replan'),()=>{},()=>events.push('arrive'),()=>4,String,fn=>fn(),()=>events.push('replan'));
  return {step,boat,state,events,hazards};
}
test('stalled navigation remembers an obstruction and replans rather than waiting forever',()=>{
  const c=controller();for(let i=0;i<850&&c.state.autopilot;i++)c.step(1/60);
  assert.ok(c.events.includes('replan'));assert.equal(c.hazards.length,1);
});
test('a foundation ahead is remembered before replanning',()=>{
  const c=controller({obstacles:[rect]});c.state.velocity=2;
  c.step(1/60);assert.ok(c.events.includes('replan'));assert.equal(c.hazards.length,1);
});
test('actual steering reaches tight turns and stops, with frame-sized motion and wind drift',()=>{
  for(const delta of [1/60,.05]){
    const c=controller({waypoints:[{x:2,z:0},{x:2,z:-2},{x:4,z:-2}]});
    for(let i=0;i<120/delta&&c.state.autopilot;i++){
      c.step(delta);c.boat.position.x+=(-Math.sin(c.boat.rotation.y)*c.state.velocity+.003)*delta;c.boat.position.z+=-Math.cos(c.boat.rotation.y)*c.state.velocity*delta;
    }
    assert.ok(c.events.includes('arrive'));assert.equal(c.hazards.length,0);
    assert.ok(Math.hypot(c.boat.position.x-4,c.boat.position.z+2)<.14);
  }
});
test('a boat loaded inside a newly placed foundation can move toward the nearest exit',async()=>{
  const {movementBlocked}=await import('../dist/nav-obstacles.js');
  assert.equal(movementBlocked(rect,{x:1.8,z:0},{x:1.9,z:0}),false);
  assert.equal(movementBlocked(rect,{x:1.8,z:0},{x:1.7,z:0}),true);
  assert.equal(movementBlocked(rect,{x:1.8,z:0},{x:2.1,z:0}),false);
});
test('valid sea coordinates remain the destination even when another route is required',async()=>{
  const {seaCandidates}=await import('../dist/nav-destinations.js');
  const coast=createCoastQuery([],()=>4);
  assert.deepEqual(seaCandidates(2,3,{coast,bounds:{minX:-10,maxX:10,minZ:-10,maxZ:10},kmPerWorldUnitAt:()=>4}).candidates,[{x:2,z:3}]);
});
test('overlapping inland borders are rejected as docking coastlines',()=>{
  const square=(x0,z0,x1,z1)=>({minX:x0,maxX:x1,minZ:z0,maxZ:z1,count:4,points:new Float64Array([x0,z0,x1,z0,x1,z1,x0,z1])});
  const coast=createCoastQuery([square(0,0,10,10),square(9,0,20,10)],()=>4);
  const p=coast.nearestSea(9.5,5);
  assert.ok(p.z===0||p.z===10||p.x===0||p.x===20);
});
