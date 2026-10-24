import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildFighter,FIGHTER_PAINTS} from '../dist/fighter.js';
import {createFlightState,flightStep,landingSite,requestLanding,requestTakeoff,toggleHover,FLIGHT_MIN_CLEARANCE,FLIGHT_MAX_HEIGHT} from '../dist/flight.js';
import {requestTurbo,turboCooldownLeft,TURBO_COOLDOWN_MS,TURBO_MULTIPLIER} from '../dist/flight.js';
import {createFlightHoldInput,FLIGHT_HOLD_MS} from '../dist/flight-input.js';
import {BASE_CRUISE_SPEED,YACHT_SPEED_FACTOR,FIGHTER_CRUISE_SPEED} from '../dist/vehicle-speeds.js';

const bounds={minX:-10,maxX:10,minZ:-10,maxZ:10};
const land={bounds,isOnLand:(x,z)=>x>0,terrainHeightAt:(x,z)=>x>0?.2:0,obstacleTopAt:()=>-Infinity};

test('fighter has a finite closed silhouette and changes three paint schemes',()=>{
  const model=buildFighter(),box=new THREE.Box3().setFromObject(model);
  assert.ok(box.max.z-box.min.z>9);
  assert.ok(box.max.x-box.min.x>7);
  assert.ok(box.max.y-box.min.y>1);
  let triangles=0,meshes=0;
  model.traverse(object=>{if(object.isMesh){meshes++;const p=object.geometry.attributes.position;for(let i=0;i<p.count;i++)assert.ok(Number.isFinite(p.getX(i))&&Number.isFinite(p.getY(i))&&Number.isFinite(p.getZ(i)));triangles+=(object.geometry.index?.count??p.count)/3;}});
  assert.ok(meshes<40&&triangles<10000);
  for(const paint of Object.keys(FIGHTER_PAINTS))model.userData.paint(paint);
  model.userData.setNight(true);model.userData.setNight(false);
});

test('landing is refused over sea, steep terrain and a landmark; land accepts controlled descent',()=>{
  const aircraft=createFlightState({x:-1,y:.9,z:0});
  assert.equal(requestLanding(aircraft,land).ok,false);
  assert.equal(aircraft.mode,'hover');
  aircraft.x=2;
  assert.equal(requestLanding(aircraft,{...land,terrainHeightAt:(x)=>x>2?.5:.2}).ok,false);
  assert.equal(requestLanding(aircraft,{...land,obstacleTopAt:()=>.8}).ok,false);
  assert.equal(requestLanding(aircraft,land).ok,true);
  for(let i=0;i<100&&aircraft.mode!=='grounded';i++)flightStep(aircraft,{},land,.05);
  assert.equal(aircraft.mode,'grounded');
  assert.ok(aircraft.y>.2);
});

test('grounded jet takes off vertically, then can hover, reverse and climb',()=>{
  const aircraft=createFlightState({x:2,y:.255,z:0,mode:'grounded'});
  assert.equal(requestTakeoff(aircraft,land).ok,true);
  for(let i=0;i<80&&aircraft.mode!=='hover';i++)flightStep(aircraft,{},land,.05);
  assert.equal(aircraft.mode,'hover');
  const first=aircraft.z;
  for(let i=0;i<20;i++)flightStep(aircraft,{throttle:-1,steer:0,climb:true},land,.05);
  assert.ok(aircraft.z>first);
  assert.ok(aircraft.y>.8);
  assert.equal(toggleHover(aircraft).mode,'flying');
});

test('F and L taps issue commands while holds continuously change altitude',()=>{
  let time=0;
  const input=createFlightHoldInput({now:()=>time});
  input.press('key:f','takeoff');
  time=FLIGHT_HOLD_MS-1;
  assert.equal(input.release('key:f').kind,'tap');
  const aircraft=createFlightState({x:2,y:.8,z:0,mode:'hover'});
  input.press('key:f','takeoff');
  time+=FLIGHT_HOLD_MS;
  assert.equal(input.active('takeoff'),true);
  flightStep(aircraft,{climb:input.active('takeoff')},land,.05);
  assert.ok(aircraft.y>.8);
  assert.equal(input.release('key:f').kind,'hold');
  input.press('pointer:1','land');
  time+=FLIGHT_HOLD_MS;
  const beforeDescent=aircraft.y;
  flightStep(aircraft,{descend:input.active('land')},land,.05);
  assert.ok(aircraft.y<beforeDescent);
  assert.equal(input.release('pointer:1').kind,'hold');
  input.press('pointer:2','land');
  time++;
  assert.equal(input.release('pointer:2').kind,'tap');
  input.press('key:l','land');input.clear();
  assert.equal(input.release('key:l'),null);
});

test('holding climb at the former ceiling gains height; actual ceiling does not fake a nose-up climb',()=>{
  assert.equal(FLIGHT_MAX_HEIGHT*1000,10000);
  const sky={...land,isOnLand:()=>false,terrainHeightAt:()=>0};
  const aircraft=createFlightState({x:0,y:3.4,z:0,mode:'hover'});
  for(let i=0;i<20;i++)flightStep(aircraft,{climb:true},sky,.05);
  assert.ok(aircraft.y>3.4);
  assert.ok(aircraft.verticalSpeed>0);
  aircraft.y=FLIGHT_MAX_HEIGHT;
  for(let i=0;i<20;i++)flightStep(aircraft,{climb:true},sky,.05);
  assert.equal(aircraft.y,FLIGHT_MAX_HEIGHT);
  assert.equal(aircraft.verticalSpeed,0);
  assert.equal(aircraft.pitch,0);
  assert.equal(aircraft.warning,'已達飛行高度上限');
});

test('holding climb or descend changes altitude briskly',()=>{
  const sky={...land,isOnLand:()=>false,terrainHeightAt:()=>0};
  const hover=createFlightState({x:0,y:3,z:0,mode:'hover'});
  for(let i=0;i<20;i++)flightStep(hover,{climb:true},sky,.05);
  assert.ok(Math.abs(hover.y-3.72)<1e-9);
  const flying=createFlightState({x:0,y:3,z:0,mode:'flying'});
  for(let i=0;i<20;i++)flightStep(flying,{descend:true},{...sky,bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100}},.05);
  assert.ok(Math.abs(flying.y-2.04)<1e-9);
  assert.ok(flying.verticalSpeed<-.9);
});

test('full throttle flight cruises at three times the yacht speed',()=>{
  const aircraft=createFlightState({x:2,y:.8,z:0,mode:'flying'});
  const openSky={...land,bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100}};
  for(let i=0;i<100;i++)flightStep(aircraft,{throttle:1},openSky,.05);
  assert.equal(FIGHTER_CRUISE_SPEED,BASE_CRUISE_SPEED*YACHT_SPEED_FACTOR*3);
  assert.equal(aircraft.speed,FIGHTER_CRUISE_SPEED);
});

test('left steering lowers the left wing and right steering lowers the right wing',()=>{
  const openSky={...land,bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100}};
  for(const [steer,loweredSide] of [[1,-1],[-1,1]]){
    const aircraft=createFlightState({x:2,y:.8,z:0,mode:'flying',speed:1.4});
    for(let i=0;i<12;i++)flightStep(aircraft,{steer},openSky,.05);
    assert.equal(Math.sign(aircraft.bank),steer);
    assert.equal(Math.sign(aircraft.heading),steer);
    const roll=new THREE.Euler(0,0,aircraft.bank,'YXZ');
    const left=new THREE.Vector3(-3,0,0).applyEuler(roll).y;
    const right=new THREE.Vector3(3,0,0).applyEuler(roll).y;
    assert.ok(loweredSide<0?left<right:right<left);
  }
});

test('terrain and landmarks pull the jet above their collision volume even at full horizontal speed',()=>{
  const ridge={...land,terrainHeightAt:x=>x>1?.8:0,obstacleTopAt:(x)=>x>1.3?1.1:-Infinity};
  const aircraft=createFlightState({x:.5,y:.25,z:0,heading:-Math.PI/2,mode:'flying',speed:4.7});
  for(let i=0;i<5;i++)flightStep(aircraft,{throttle:1},ridge,.05);
  assert.ok(aircraft.x>1.3);
  assert.ok(aircraft.y>=1.1+FLIGHT_MIN_CLEARANCE);
  assert.ok(aircraft.y>=.8+FLIGHT_MIN_CLEARANCE);
});

test('flight cannot cross world bounds and grounded mode cannot taxi into water',()=>{
  const aircraft=createFlightState({x:9.9,y:.6,z:0,heading:-Math.PI/2,mode:'hover',speed:1.25});
  for(let i=0;i<20;i++)flightStep(aircraft,{throttle:1},land,.05);
  assert.ok(aircraft.x<=10);
  const parked=createFlightState({x:2,y:.255,z:0,mode:'grounded'});
  flightStep(parked,{throttle:1,steer:1},land,.05);
  assert.equal(parked.x,2);assert.equal(parked.z,0);
  flightStep(parked,{}, {...land,isOnLand:()=>false},.05);
  assert.equal(parked.mode,'hover');
  assert.ok(parked.y>=FLIGHT_MIN_CLEARANCE);
});

test('turbo reaches three times top speed within 10 seconds, then eases back, once per hour',()=>{
  const openSky={...land,isOnLand:()=>false,terrainHeightAt:()=>0,bounds:{minX:-1e4,maxX:1e4,minZ:-1e4,maxZ:1e4}};
  const aircraft=createFlightState({x:0,y:2,z:0,mode:'flying',speed:FIGHTER_CRUISE_SPEED});
  assert.equal(requestTurbo(createFlightState({mode:'grounded'}),{lastUsed:NaN,now:0}).ok,false);
  assert.equal(requestTurbo(aircraft,{lastUsed:0,now:TURBO_COOLDOWN_MS-1000}).ok,false);
  assert.equal(requestTurbo(aircraft,{lastUsed:0,now:TURBO_COOLDOWN_MS}).ok,true);
  assert.equal(turboCooldownLeft(0,TURBO_COOLDOWN_MS/2),TURBO_COOLDOWN_MS/2);
  for(let i=0;i<200;i++)flightStep(aircraft,{throttle:1},openSky,.05);   // 10 s
  assert.ok(Math.abs(aircraft.speed-FIGHTER_CRUISE_SPEED*TURBO_MULTIPLIER)<1e-9);
  for(let i=0;i<600;i++)flightStep(aircraft,{},openSky,.05);   // turbo over, coasting
  assert.equal(aircraft.turbo,null);
  assert.equal(aircraft.speed,FIGHTER_CRUISE_SPEED);
  const hovering=createFlightState({x:0,y:2,z:0,mode:'hover'});
  assert.equal(requestTurbo(hovering,{lastUsed:NaN,now:0}).ok,true);
  assert.equal(hovering.mode,'flying');
  flightStep(hovering,{throttle:-1},openSky,.05);
  assert.equal(hovering.turbo,null);
});
