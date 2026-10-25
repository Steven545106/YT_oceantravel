import test from 'node:test';
import assert from 'node:assert/strict';
import {limitShoreMove} from '../dist/shore-limit.js';

// A harbour basin 4 km across (z = ±2) whose mouth is a 2 km wide channel (z = ±1) from x = 2 out to sea at x = 8.
const walls=[[[-3,-2],[2,-2]],[[-3,2],[2,2]],[[-3,-2],[-3,2]],[[2,-2],[2,-1]],[[2,1],[2,2]],[[2,-1],[8,-1]],[[2,1],[8,1]]];
function coastPoint(x,z){
  let best=null,bestD=Infinity;
  for(const [[ax,az],[bx,bz]] of walls){
    const dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));
    const px=ax+dx*t,pz=az+dz*t,d=Math.hypot(x-px,z-pz);
    if(d<bestD){bestD=d;best={x:px,z:pz};}
  }
  return best;
}
const distanceKm=(x,z)=>{const c=coastPoint(x,z);return x>8?Infinity:Math.hypot(x-c.x,z-c.z);};
const options={distanceKm,coastPoint,limitKm:2,floorKm:.5,blocked:(a,b)=>b.z>=2||b.z<=-2||(b.x>=2&&Math.abs(b.z)>=1)};

test('a boat in a harbour basin can sail out through a mouth narrower than the shore limit',()=>{
  let boat={x:-1,z:0};
  for(let i=0;i<400&&boat.x<8.5;i++){
    const next=limitShoreMove(boat,{x:boat.x+.05,z:boat.z},options);
    assert.equal(next.stopped,false,`stuck at ${boat.x.toFixed(2)}, ${boat.z.toFixed(2)}`);
    boat=next;
  }
  assert.ok(boat.x>8,'out at sea');
});

test('heading straight for a shore inside the limit slides along it instead',()=>{
  const step=limitShoreMove({x:0,z:1},{x:.05,z:1.05},options);
  assert.equal(step.limited,true);
  assert.ok(Math.abs(step.z-1)<1e-9,'no closer to the wall');
  assert.ok(step.x>0,'still moving along it');
  assert.deepEqual(limitShoreMove({x:0,z:1},{x:0,z:.95},options),{x:0,z:.95,limited:false,stopped:false},'moving away is never changed');
});

test('a slide that would touch land or pass the floor stops',()=>{
  const corner=limitShoreMove({x:-2.6,z:1.6},{x:-2.7,z:1.7},{...options,floorKm:.45});
  assert.equal(corner.stopped,true);
  assert.deepEqual([corner.x,corner.z],[-2.6,1.6]);
});
