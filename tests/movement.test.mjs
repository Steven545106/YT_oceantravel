import test from 'node:test';
import assert from 'node:assert/strict';
import {movementAxes,isMovementKey,isTextControl} from '../dist/controls.js';
import {dolphinLeapPose,swimToward} from '../dist/dolphin-motion.js';
test('arrow keys match WASD, cancel opposite directions, and release independently',()=>{
  for(const [a,b] of [['w','arrowup'],['s','arrowdown'],['a','arrowleft'],['d','arrowright']])assert.deepEqual(movementAxes(new Set([a])),movementAxes(new Set([b])));
  assert.deepEqual(movementAxes(new Set(['w','arrowdown','a','arrowright'])),{throttle:0,steer:0});
  const keys=new Set(['w','arrowup']);keys.delete('w');assert.equal(movementAxes(keys).throttle,1);
  assert.ok(isMovementKey('ArrowLeft'));assert.ok(!isMovementKey('c'));
});
test('typing controls and editable content retain normal arrow-key behaviour',()=>{
  for(const tagName of ['INPUT','SELECT','TEXTAREA'])assert.ok(isTextControl({tagName}));
  assert.ok(isTextControl({isContentEditable:true}));assert.ok(!isTextControl({tagName:'CANVAS'}));
});
test('dolphin head rises on takeoff and points down on re-entry, with continuous boundary poses',()=>{
  const options={duration:1.1,height:.2,depth:.03,speed:.8};
  const start=dolphinLeapPose(0,options),up=dolphinLeapPose(.3,options),apex=dolphinLeapPose(.55,options),down=dolphinLeapPose(.85,options),end=dolphinLeapPose(1.1,options);
  assert.equal(start.y,-.03);assert.equal(start.pitch,0);assert.ok(up.pitch>0);assert.ok(down.pitch<0);assert.ok(Math.abs(apex.pitch)<1e-10);
  assert.ok(Math.abs(apex.y-.2)<1e-10);assert.ok(Math.abs(end.pitch)<1e-10);assert.equal(end.y,start.y);assert.ok(end.done);
  for(let t=0;t<1.3;t+=.01){const pose=dolphinLeapPose(t,options);assert.ok(Number.isFinite(pose.y)&&Number.isFinite(pose.pitch));assert.ok(Math.abs(pose.pitch)<Math.PI/2);}
});
test('swimming cannot teleport to the formation after a turn or a leap',()=>{
  const p=swimToward(0,0,100,-100,.05,2);assert.ok(Math.hypot(p.x,p.z)<=.100001);
  assert.deepEqual(swimToward(1,2,1,2,.05,2),{x:1,z:2});
});

test('boat yaw and roll do not resize the dolphins or their jump height',async()=>{
  const THREE=await import('three'),{shipLocalLength}=await import('../dist/sea-life.js');
  const boat=new THREE.Group(),ship=new THREE.Mesh(new THREE.BoxGeometry(.2,.3,.8),new THREE.MeshBasicMaterial());boat.add(ship);ship.scale.setScalar(2);
  boat.scale.setScalar(.07); // Real game boat root; measuring only its local frame magnifies sea life.
  const original=shipLocalLength(boat,ship);
  assert.ok(Math.abs(original-.112)<1e-6);
  boat.rotation.set(.2,Math.PI/4,.12);boat.position.set(20,.3,-40);
  assert.ok(Math.abs(shipLocalLength(boat,ship)-original)<1e-6);
});
test('keys are read by their physical position, so a Chinese input method cannot swallow them',async()=>{
  const {keyOf}=await import('../dist/controls.js');
  assert.equal(keyOf({key:'ㄑ',code:'KeyF'}),'f');
  assert.equal(keyOf({key:'Process',code:'KeyW'}),'w');
  assert.equal(keyOf({key:'F',code:'KeyF'}),'f');
  assert.equal(keyOf({key:'ArrowUp',code:'ArrowUp'}),'arrowup');
  assert.equal(keyOf({key:' ',code:'Space'}),' ');
  assert.equal(keyOf({key:'Shift',code:'ShiftLeft'}),'shift');
  assert.equal(keyOf({key:'3',code:'Digit3'}),'3');
});
test('a new press of the climb key restarts the hold even if its last release was missed',async()=>{
  const {createFlightHoldInput,FLIGHT_HOLD_MS}=await import('../dist/flight-input.js');
  let time=0;const input=createFlightHoldInput({now:()=>time});
  input.press('key:f','takeoff');time+=10;   // released while the page missed the keyup
  input.press('key:f','takeoff');time+=FLIGHT_HOLD_MS-1;
  assert.equal(input.active('takeoff'),false);
  time+=2;assert.equal(input.active('takeoff'),true);
  assert.equal(input.release('key:f').kind,'hold');
});

test('ships: W held is manual, E toggles auto cruise until E or S, and S held goes astern',async()=>{
  const {shipThrottle,cruiseAfterKey,shipModeText}=await import('../dist/controls.js');
  assert.equal(cruiseAfterKey('w',false),false,'W does not latch');
  assert.equal(shipThrottle(new Set(['w']),false),1,'W held drives ahead');
  assert.equal(shipThrottle(new Set(),false),0,'W released, the engine stops');
  let cruise=cruiseAfterKey('e',false);
  assert.equal(cruise,true);
  assert.equal(shipThrottle(new Set(),cruise),1,'auto cruise keeps going');
  assert.equal(cruiseAfterKey('a',cruise),true,'steering leaves the cruise on');
  assert.equal(shipThrottle(new Set(['s']),cruise),-1,'S held goes astern');
  assert.equal(cruiseAfterKey('s',cruise),false,'S stops the cruise');
  assert.equal(cruiseAfterKey('e',cruise),false,'E again stops it');
  assert.equal(shipModeText({cruise:true,throttle:1,velocity:2}),'自動巡航');
  assert.equal(shipModeText({cruise:false,throttle:1,velocity:1}),'手動前進');
  assert.equal(shipModeText({cruise:false,throttle:0,velocity:0}),'停船');
});
