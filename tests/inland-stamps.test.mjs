import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {landmarkDisplayGeo} from '../dist/landmark-scale.js';
import {geoToWorld,kmPerWorldUnitAt} from '../dist/geo.js';
import {createCoastQuery} from '../dist/coast-query.js';
import {seaCandidates} from '../dist/stamp-stops.js';
import {isWithinStampReach} from '../dist/stamp-reach.js';
const bounds=JSON.parse(await readFile(new URL('../dist/Data/regions.json',import.meta.url))).worldBounds,islands=[];
for(const country of ['taiwan','japan','korea','north_korea','philippines','hong_kong','macau','vietnam','brunei','malaysia','indonesia','singapore']){
  const data=JSON.parse(await readFile(new URL(`../scripts/source-data/${country}_coast.json`,import.meta.url)));
  for(const flat of data.polys){
    let lon=0,lat=0,minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity,minLon=Infinity,maxLon=-Infinity,minLat=Infinity,maxLat=-Infinity;
    const points=new Float64Array(flat.length);
    for(let i=0;i<flat.length;i+=2){
      lon+=flat[i];lat+=flat[i+1];const longitude=lon/data.scale,latitude=lat/data.scale;
      minLon=Math.min(minLon,longitude);maxLon=Math.max(maxLon,longitude);minLat=Math.min(minLat,latitude);maxLat=Math.max(maxLat,latitude);
      const p=geoToWorld({latitude,longitude});
      points[i]=p.x;points[i+1]=p.y;
      minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minZ=Math.min(minZ,p.y);maxZ=Math.max(maxZ,p.y);
    }
    // Indonesia's 8,815 polygons span a huge archipelago; retain the local
    // Java/Bali coast needed by this catalogue without bloating every route test.
    if(country==='indonesia'&&![[115.2791,-8.4312],[112.953,-7.9425],[110.364,-7.8056],[110.2039,-7.6078]].some(([x,y])=>minLon<x+2&&maxLon>x-2&&minLat<y+2&&maxLat>y-2))continue;
    islands.push({points,count:points.length/2,minX,maxX,minZ,maxZ});
  }
}
const coast=createCoastQuery(islands,kmPerWorldUnitAt);
const catalogue=JSON.parse(await readFile(new URL('../dist/Data/landmarks.json',import.meta.url))).landmarks;
for(const item of catalogue)test(`${item.name}: all offshore stamp stops collect its stamp`,()=>{
  const p=geoToWorld(landmarkDisplayGeo(item)),nearest=coast.nearest(p.x,p.y);
  const {candidates}=seaCandidates(p.x,p.y,{coast,bounds,kmPerWorldUnitAt});
  assert.ok(candidates.length,'must have an offshore destination');
  const target={x:p.x,z:p.y,reach:Math.max(2.4,Math.hypot(nearest.x-p.x,nearest.z-p.y)+2.6),stampZones:candidates.map(c=>({...c,reach:2/kmPerWorldUnitAt(c.z)}))};
  for(const c of candidates){
    assert.equal(coast.isLand(c.x,c.z),false);assert.ok(coast.distance(c.x,c.z)>=2.2);
    assert.ok(isWithinStampReach(target,c.x,c.z));
    // a boat passing just beside the stop must still collect it on the half-second stamp poll
    assert.ok(isWithinStampReach(target,c.x+.12,c.z));
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
  assert.equal(isWithinStampReach(target,21,30.9),true,'sailing near the visible model collects the stamp');
  assert.equal(isWithinStampReach(target,21,31.1),false,'the expanded area is bounded');
  assert.equal(isWithinStampReach(target,27,32),false,'corners use distance to the footprint, not a square buffer');
});
