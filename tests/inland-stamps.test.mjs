import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {landmarkDisplayGeo} from '../dist/landmark-scale.js';
import {geoToWorld,kmPerWorldUnitAt} from '../dist/geo.js';
import {createCoastQuery} from '../dist/nav-coast.js';
import {seaCandidates} from '../dist/nav-destinations.js';
import {createNavPlanner} from '../dist/nav-planner.js';
import {isWithinStampReach} from '../dist/stamp-reach.js';
const bounds={minX:-120,maxX:900,minZ:-760,maxZ:330},islands=[];
for(const country of ['taiwan','japan','korea','north_korea','philippines']){
  const data=JSON.parse(await readFile(new URL(`../scripts/source-data/${country}_coast.json`,import.meta.url)));
  for(const flat of data.polys){
    let lon=0,lat=0,minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
    const points=new Float64Array(flat.length);
    for(let i=0;i<flat.length;i+=2){
      lon+=flat[i];lat+=flat[i+1];const p=geoToWorld({latitude:lat/data.scale,longitude:lon/data.scale});
      points[i]=p.x;points[i+1]=p.y;
      minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minZ=Math.min(minZ,p.y);maxZ=Math.max(maxZ,p.y);
    }
    islands.push({points,count:points.length/2,minX,maxX,minZ,maxZ});
  }
}
const coast=createCoastQuery(islands,kmPerWorldUnitAt);
const catalogue=JSON.parse(await readFile(new URL('../dist/Data/landmarks.json',import.meta.url))).landmarks;
for(const item of catalogue)test(`${item.name}: all offshore destinations collect its stamp and have a safe local approach`,()=>{
  const p=geoToWorld(landmarkDisplayGeo(item)),nearest=coast.nearest(p.x,p.y);
  const {candidates}=seaCandidates(p.x,p.y,{coast,bounds,kmPerWorldUnitAt});
  assert.ok(candidates.length,'must have an offshore destination');
  const target={x:p.x,z:p.y,reach:Math.max(2.4,Math.hypot(nearest.x-p.x,nearest.z-p.y)+2.6),stampZones:candidates.map(c=>({...c,reach:2/kmPerWorldUnitAt(c.z)}))};
  const planner=createNavPlanner({islands,bounds,kmPerWorldUnitAt,makeCanvas:()=>{throw new Error('a short clear approach should not rasterise');}});
  for(const c of candidates){
    assert.equal(coast.isLand(c.x,c.z),false);assert.ok(coast.distance(c.x,c.z)>=2.2);
    assert.ok(isWithinStampReach(target,c.x,c.z));
    // Autopilot completes within .12 units; the half-second stamp poll must still catch arrival.
    assert.ok(isWithinStampReach(target,c.x+.12,c.z));
    const result=planner.plan({x:c.x+.01,z:c.z},{x:p.x,z:p.y});
    assert.ok(result.route);assert.ok(isWithinStampReach(target,result.route.target.x,result.route.target.z));
  }
  assert.equal(isWithinStampReach(target,-100,300),false,'unrelated sea must not award this stamp');
});
test('legacy vicinity targets still work and offshore zones are bounded',()=>{
  const target={x:0,z:0,reach:1,stampZones:[{x:10,z:10,reach:.5}]};
  assert.equal(isWithinStampReach(target,.5,0),false);assert.ok(isWithinStampReach(target,10.4,10));
  assert.equal(isWithinStampReach(target,10.6,10),false);
  assert.ok(isWithinStampReach({x:0,z:0,reach:1},0,0));
});
test('audit all destinations against the former stamp radius',t=>{
  const affected=[];
  for(const item of catalogue){
    const p=geoToWorld(landmarkDisplayGeo(item)),n=coast.nearest(p.x,p.y);
    const reach=Math.max(2.4,Math.hypot(n.x-p.x,n.z-p.y)+2.6);
    const {candidates}=seaCandidates(p.x,p.y,{coast,bounds,kmPerWorldUnitAt});
    if(candidates.some(c=>Math.hypot(c.x-p.x,c.z-p.y)>=reach))affected.push(item.name);
  }
  t.diagnostic(`Former radius excludes some safe destinations: ${affected.length} — ${affected.join('、')}`);
});

test('visible footprint collects stamps after display displacement, including broad model edges',async()=>{
  const {displayStampZone}=await import('../dist/stamp-reach.js');
  const zone=displayStampZone({min:{x:18,z:27},max:{x:24,z:29}},3);
  const target={x:0,z:0,reach:1,stampZones:[zone]};
  assert.equal(isWithinStampReach(target,24,29),true,'the model corner itself is collectible');
  assert.equal(isWithinStampReach(target,21,30.9),true,'manual sailing near the visible model collects without navigation');
  assert.equal(isWithinStampReach(target,21,31.1),false,'the expanded area is bounded');
  assert.equal(isWithinStampReach(target,27,32),false,'corners use distance to the footprint, not a square buffer');
});
