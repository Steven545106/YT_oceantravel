import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAchievements,normalizeJourney,parseProgress} from '../dist/progress-data.js';
const bounds={minX:-10,maxX:10,minZ:-10,maxZ:10};
test('damaged progress fields do not erase valid stamps or break counters and logs',()=>{
  const saved=normalizeJourney({distanceKm:'oops',seconds:Infinity,whales:-3,stamps:{'台北101':123,bad:null},seas:null,log:[null,{t:123,text:'出發'},{t:'bad',text:'bad'}]});
  assert.equal(saved.distanceKm,0);assert.equal(saved.seconds,0);assert.equal(saved.whales,0);
  assert.deepEqual(saved.stamps,{'台北101':123});assert.deepEqual(saved.seas,{});assert.deepEqual(saved.log,[{t:123,text:'出發'}]);
  const a=normalizeAchievements({sectors:[0,0,15,16,'2'],japanSectors:null,unlocked:{circumTaiwan:123},counters:{landmarks:null,whales:'3'}});
  assert.deepEqual(a.sectors,[0,15]);assert.deepEqual(a.japanSectors,[]);assert.deepEqual(a.counters.landmarks,[]);assert.equal(a.unlocked.circumTaiwan,123);
  for(const value of [null,[],true,'bad'])assert.doesNotThrow(()=>normalizeJourney(value));
  assert.equal(parseProgress('{bad'),null);
});
test('sightseeing counts stamp zones in every country in developer mode',async()=>{
  const memory=new Map([['relax-dev-mode-v1','1']]);globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};globalThis.addEventListener=()=>{};
  const {trackAchievements,recordEvent}=await import('../dist/achievements.js');
  const target={name:'外海景點',country:'台灣',x:100,z:100,stampZones:[{x:0,z:0,reach:2}]};
  const sourceTarget=target;
  trackAchievements({delta:.6,x:0,z:0,nearestLand:{country:'tw',km:100},speed:0,night:false,landmarks:[sourceTarget,{...sourceTarget,name:'尚未解鎖',country:'日本'}]});
  recordEvent('whale');   // saves
  const saved=JSON.parse(memory.get('relax-achievements-v1'));assert.ok(saved.counters.landmarks.includes(target.name));assert.ok(saved.counters.landmarks.includes('尚未解鎖'));
});
test('sights offer offshore stamp stops while explicit sea points stay exact',async()=>{
  const {seaCandidates}=await import('../dist/stamp-stops.js');
  const {createCoastQuery}=await import('../dist/coast-query.js');
  const island={minX:0,maxX:2,minZ:0,maxZ:2,count:4,points:new Float64Array([0,0,2,0,2,2,0,2])};
  const coast=createCoastQuery([island],()=>4),options={coast,bounds,kmPerWorldUnitAt:()=>4};
  assert.deepEqual(seaCandidates(-2,1,options).candidates,[{x:-2,z:1}]);
  assert.deepEqual(seaCandidates(-1,1,options).candidates,[{x:-1,z:1}]);
  const alternatives=seaCandidates(-2,1,{...options,preserveSeaPoint:false});
  assert.ok(alternatives.candidates.length>1);assert.equal(alternatives.clearanceKm,5.5);
  for(const p of alternatives.candidates)assert.ok(coast.distance(p.x,p.z)>=5.5);
});
