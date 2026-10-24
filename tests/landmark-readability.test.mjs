import test from 'node:test';
import assert from 'node:assert/strict';
import {landmarkDisplayScale,landmarkDisplayHeight,layoutLandmarkDisplays} from '../dist/landmark-scale.js';
test('short sights have a readable minimum, while the tall tower height order remains',()=>{
  assert.equal(landmarkDisplayHeight(12),.9);assert.equal(landmarkDisplayHeight(24),.9);
  assert.ok(landmarkDisplayHeight(634)>landmarkDisplayHeight(333));
  assert.equal(landmarkDisplayScale({type:'sensoji',realHeight:53}),.9);
  assert.equal(landmarkDisplayScale({type:'fuji',realHeight:0}),1);
});
test('presentation layout separates nearby dioramas without shrinking them or mutating geographic anchors',()=>{
  const entries=[{name:'塔',x:0,z:0,width:1,depth:1,height:2},{name:'寺',x:.2,z:.2,width:2,depth:2,height:.9}];
  const before=JSON.stringify(entries),layout=layoutLandmarkDisplays(entries);
  assert.equal(JSON.stringify(entries),before);assert.deepEqual(layout.get('塔'),{x:0,z:0});
  const temple=layout.get('寺');assert.ok(Math.abs(temple.x)>1.68||Math.abs(temple.z)>1.68);
});
test('presentation offsets avoid sea centres and respect asymmetric model footprints',()=>{
  const sites=[{name:'A',x:0,z:0,width:2,depth:2,height:2,offsetX:.5},{name:'B',x:.1,z:.1,width:2,depth:2,height:1,offsetX:-.5}];
  const placed=layoutLandmarkDisplays(sites,(x,z)=>z>=0);
  assert.ok(placed.get('B').z>=0);
  const a=placed.get('A'),b=placed.get('B');assert.ok(Math.abs(a.x+.5-b.x+.5)>=2.18||Math.abs(a.z-b.z)>=2.18);
});
test('fixed bridge footprints retain geographic anchors and nearby dioramas move clear',()=>{
 const sites=[{name:'bridge',x:0,z:0,width:3,depth:.5,height:Infinity,fixed:true},{name:'beach',x:.1,z:.1,width:2,depth:1,height:2}];
 const result=layoutLandmarkDisplays(sites,(x,z,item)=>item.fixed||z>=0);
 assert.deepEqual(result.get('bridge'),{x:0,z:0});
 const beach=result.get('beach');assert.ok(Math.abs(beach.x)>=2.68||beach.z>=.93);
});

test('fixed geographic landmarks take precedence even when shorter than neighbouring models',()=>{
 const sites=[{name:'tall',x:.1,z:.1,width:2,depth:2,height:3},{name:'anchored',x:0,z:0,width:1,depth:1,height:.3,fixed:true}];
 const result=layoutLandmarkDisplays(sites);assert.deepEqual(result.get('anchored'),{x:0,z:0});assert.notDeepEqual(result.get('tall'),{x:.1,z:.1});
});
