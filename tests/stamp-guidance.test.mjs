import test from 'node:test';
import assert from 'node:assert/strict';
import {stampBearing,nearbyStampGuides,stampGuidanceEnabled,setStampGuidanceEnabled,onStampGuidanceChange} from '../dist/stamp-guidance.js';
const origin={x:0,z:0};
test('stamp guidance starts closed and both map controls can share changes',()=>{
  assert.equal(stampGuidanceEnabled,false);const changes=[],unsubscribe=onStampGuidanceChange(value=>changes.push(value));
  setStampGuidanceEnabled(true);assert.equal(stampGuidanceEnabled,true);setStampGuidanceEnabled(false);assert.equal(stampGuidanceEnabled,false);
  unsubscribe();assert.deepEqual(changes,[true,false]);
});
test('guidance points relative to the bow rather than always using north',()=>{
  assert.equal(stampBearing(origin,{x:0,z:-10},0).direction,'前方');
  assert.equal(stampBearing(origin,{x:10,z:0},0).instruction,'右轉 90°');
  assert.equal(stampBearing(origin,{x:-10,z:0},0).instruction,'左轉 90°');
  assert.equal(stampBearing(origin,{x:0,z:10},0).instruction,'向後迴轉');
  assert.equal(stampBearing(origin,{x:10,z:0},-Math.PI/2).direction,'前方');
  assert.equal(stampBearing(origin,{x:0,z:-10},-Math.PI/2).instruction,'左轉 90°');
  assert.equal(stampBearing(origin,{x:0,z:10},Math.PI).direction,'前方');
  assert.equal(stampBearing(origin,origin,Math.PI).direction,'已到達');
});
test('heading wraparound chooses the short turn and ignores boat pitch and roll',()=>{
  const target={x:Math.sin(Math.PI/180),z:-Math.cos(Math.PI/180)};
  const bearing=stampBearing(origin,target,-359*Math.PI/180);
  assert.ok(Math.abs(bearing.degrees-2)<1e-8);assert.equal(bearing.instruction,'保持船頭方向');
});
test('guides select the closest real stamp zone and exclude locked and completed sights',()=>{
  const targets=[{name:'內陸景點',country:'tw',x:100,z:100,stampZones:[{x:4,z:0,reach:.5},{x:1,z:0,reach:.5,fallback:true},{x:0,z:0,halfWidth:3,halfDepth:2,reach:1}]},{name:'未解鎖',country:'jp',stampZones:[{x:0,z:0,reach:1}]},{name:'已集章',country:'tw',stampZones:[{x:0,z:0,reach:1}]},{name:'沒有海上點',country:'tw',stampZones:[]}];
  const guides=nearbyStampGuides(targets,origin,4,c=>c==='tw',n=>n==='已集章');
  assert.equal(guides.length,1);assert.equal(guides[0].km,4);assert.equal(guides[0].stop.x,1);
});
