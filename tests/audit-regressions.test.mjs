import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeAchievements,normalizeJourney,parseProgress} from '../dist/progress-data.js';
import {createNavClient} from '../dist/nav-client.js';
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
test('cancelling the no-worker fallback settles the promise without running canvas work',async()=>{
  const original=globalThis.Worker;globalThis.Worker=undefined;
  try{
    const client=createNavClient([],bounds),promise=client.request('route',{x:0,z:0},{x:1,z:1});
    const rejected=assert.rejects(promise,{name:'AbortError'});client.cancel();await rejected;
  }finally{globalThis.Worker=original;}
});
test('configuration changes settle old requests, and stale workers cannot affect new ones',async()=>{
  const original=globalThis.Worker,workers=[];let locks=[];
  globalThis.Worker=class{constructor(){workers.push(this);}postMessage(message){this.message=message;}terminate(){this.terminated=true;}};
  try{
    const client=createNavClient([],bounds,()=>locks),a=client.request('route',{x:0,z:0},{x:1,z:1});
    const rejected=assert.rejects(a,{name:'AbortError'});locks=['jp'];
    const b=client.request('route',{x:0,z:0},{x:2,z:2});await rejected;
    workers[0].onerror();workers[0].onmessage({data:{fallback:true}});
    assert.ok(!workers[1].terminated);
    workers[1].onmessage({data:{id:workers[1].message.id,result:{route:'new'}}});assert.deepEqual(await b,{route:'new'});
    client.cancel();assert.ok(!workers[1].terminated,'idle planner cache should survive completed navigation');
    const c=client.request('route',{x:0,z:0},{x:3,z:3}),cancelled=assert.rejects(c,{name:'AbortError'});
    workers[1].onerror();client.cancel();await cancelled;
  }finally{globalThis.Worker=original;}
});
test('queued obstacle recovery cannot restart navigation after manual cancellation',async()=>{
  const source=await readFile(new URL('../dist/nav.js',import.meta.url),'utf8');
  const helper=source.slice(source.indexOf('export function scheduleNavigationRetry'),source.indexOf('\n\nfunction startAutopilot')).replace('export function','function');
  const jobs=[],calls=[];
  const control=new Function('queueMicrotask','runNavigation',`let navVersion=0;${helper};return {scheduleNavigationRetry,cancel:()=>navVersion++};`)(fn=>jobs.push(fn),(...args)=>calls.push(args));
  control.scheduleNavigationRetry('old',2);control.cancel();jobs.shift()();assert.equal(calls.length,0);
  control.scheduleNavigationRetry('current',1);jobs.shift()();assert.deepEqual(calls,[['current',1]]);
});
test('sightseeing counts the same accessible stamp zones and respects country locks',async()=>{
  const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};globalThis.addEventListener=()=>{};
  const {trackAchievements,recordEvent}=await import('../dist/achievements.js');
  const target={name:'外海景點',country:'台灣',x:100,z:100,stampZones:[{x:0,z:0,reach:2}]};
  const sourceTarget=target;
  trackAchievements({delta:.6,x:0,z:0,nearestLand:{country:'tw',km:100},speed:0,night:false,landmarks:[sourceTarget,{...sourceTarget,name:'尚未解鎖',country:'日本'}]});
  recordEvent('arrive');
  const saved=JSON.parse(memory.get('relax-achievements-v1'));assert.ok(saved.counters.landmarks.includes(target.name));assert.ok(!saved.counters.landmarks.includes('尚未解鎖'));
});
test('long routes expand beyond the local window to round a peninsula safely',async()=>{
  const {createNavPlanner}=await import('../dist/nav-planner.js');
  const island={minX:-1,maxX:1,minZ:-200,maxZ:200,count:4,points:new Float64Array([-1,-200,1,-200,1,200,-1,200])};
  // Analytic raster of this rectangular island, including the canvas stroke buffer.
  const makeCanvas=()=>{
    const canvas={width:0,height:0};let scale=1,tx=0,tz=0,buffer=0,hasLand=false;
    const context={setTransform(a,b,c,d,e,f){scale=a;tx=e;tz=f;},set lineWidth(v){buffer=v/2;},beginPath(){hasLand=false;},moveTo(){hasLand=true;},lineTo(){},closePath(){},fill(){},stroke(){},getImageData(){
      const pixels=new Uint8ClampedArray(canvas.width*canvas.height*4);
      for(let j=0;j<canvas.height;j++)for(let i=0;i<canvas.width;i++){
        const x=(i+.5-tx)/scale,z=(j+.5-tz)/scale;
        if(x>=-1-buffer&&x<=1+buffer&&z>=-200-buffer&&z<=200+buffer)pixels[(j*canvas.width+i)*4+3]=255;
      }
      return {data:pixels};
    }};
    // Locked-country stroke is empty; retain the original coast buffer.
    Object.defineProperty(context,'lineWidth',{set(v){if(!hasLand)buffer=v/2;}});
    canvas.getContext=()=>context;return canvas;
  };
  const planner=createNavPlanner({islands:[island],bounds:{minX:-350,maxX:350,minZ:-350,maxZ:350},kmPerWorldUnitAt:()=>4,makeCanvas});
  const result=planner.plan({x:-10,z:0},{x:10,z:0});
  assert.ok(result.route,'connected sea must not be reported as unreachable');
  assert.ok(result.route.waypoints.some(p=>Math.abs(p.z)>200));
  const {createCoastQuery}=await import('../dist/nav-coast.js');let a={x:-10,z:0};const coast=createCoastQuery([island],()=>4);
  for(const b of result.route.waypoints){assert.ok(coast.segmentClear(a,b,2.1));a=b;}
});
test('landmark destinations offer offshore alternatives while explicit sea coordinates stay exact',async()=>{
  const {seaCandidates}=await import('../dist/nav-destinations.js');
  const {createCoastQuery}=await import('../dist/nav-coast.js');
  const island={minX:0,maxX:2,minZ:0,maxZ:2,count:4,points:new Float64Array([0,0,2,0,2,2,0,2])};
  const coast=createCoastQuery([island],()=>4),options={coast,bounds,kmPerWorldUnitAt:()=>4};
  assert.deepEqual(seaCandidates(-2,1,options).candidates,[{x:-2,z:1}]);
  assert.deepEqual(seaCandidates(-1,1,options).candidates,[{x:-1,z:1}]);
  const alternatives=seaCandidates(-2,1,{...options,preserveSeaPoint:false});
  assert.ok(alternatives.candidates.length>1);assert.equal(alternatives.clearanceKm,5.5);
  for(const p of alternatives.candidates)assert.ok(coast.distance(p.x,p.z)>=5.5);
});
test('a blocked landmark approach uses its declared alternate stamp stop, without moving coordinate destinations',async()=>{
  const {createNavPlanner}=await import('../dist/nav-planner.js');
  const planner=createNavPlanner({islands:[],bounds,kmPerWorldUnitAt:()=>4,makeCanvas:()=>{throw new Error('direct outer route needs no grid');},initialObstacles:[{minX:4,maxX:6,minZ:-1,maxZ:1}]});
  const place={x:5,z:0,destinations:[{x:5,z:0}],fallbackDestinations:[{x:0,z:5,reach:.5,fallback:true}]};
  const result=planner.plan({x:0,z:0},place);assert.ok(result.route);assert.deepEqual(result.route.target,place.fallbackDestinations[0]);
  const exact=planner.plan({x:0,z:0},{x:5,z:0});assert.equal(exact.route,null);
});
test('long trips follow the coarse sea grid instead of rasterising the whole window',async()=>{
  const {createNavPlanner}=await import('../dist/nav-planner.js');
  const {createCoastQuery}=await import('../dist/nav-coast.js');
  const island={minX:-1,maxX:1,minZ:-200,maxZ:200,count:4,country:'tw',points:new Float64Array([-1,-200,1,-200,1,200,-1,200])};
  const cell=2,minX=-350,minZ=-350,cols=350,rows=350,codes=new Uint8Array(cols*rows);
  for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){const x=minX+(i+.5)*cell,z=minZ+(j+.5)*cell;if(Math.abs(x)<=2&&Math.abs(z)<=201)codes[j*cols+i]=255;}
  let canvases=0;const makeCanvas=()=>{canvases++;throw new Error('the coarse course should not need a local grid here');};
  const planner=createNavPlanner({islands:[island],bounds:{minX,maxX:350,minZ,maxZ:350},kmPerWorldUnitAt:()=>4,makeCanvas,seaGrid:{cell,minX,minZ,cols,rows,codes,countries:['tw']}});
  const result=planner.plan({x:-150,z:0},{x:150,z:0});
  assert.ok(result.route,'the far side of the wall is reachable');
  assert.equal(canvases,0);
  assert.ok(result.route.waypoints.some(p=>Math.abs(p.z)>200));
  const coast=createCoastQuery([island],()=>4);let a={x:-150,z:0};
  for(const b of result.route.waypoints){assert.ok(coast.segmentClear(a,b,2.1));a=b;}
});
test('a strait under 2 km a side is threaded at the narrow-water clearance instead of being reported closed',async()=>{
  const {createNavPlanner}=await import('../dist/nav-planner.js');
  const {createCoastQuery}=await import('../dist/nav-coast.js');
  const rect=(minX,minZ,maxX,maxZ)=>({minX,minZ,maxX,maxZ,country:'jp',count:4,points:new Float64Array([minX,minZ,maxX,minZ,maxX,maxZ,minX,maxZ])});
  // a wall across the map with one 3.4 km gap (0.85 units at 4 km per unit)
  const islands=[rect(-.5,-60,.5,-.425),rect(-.5,.425,.5,60)];
  const makeCanvas=()=>{
    const canvas={width:0,height:0};let scale=1,tx=0,tz=0,buffer=0,hasLand=false;
    const context={setTransform(a,b,c,d,e,f){scale=a;tx=e;tz=f;},beginPath(){hasLand=false;},moveTo(){hasLand=true;},lineTo(){},closePath(){},fill(){},stroke(){},rect(){},arc(){},getImageData(){
      const pixels=new Uint8ClampedArray(canvas.width*canvas.height*4);
      for(let j=0;j<canvas.height;j++)for(let i=0;i<canvas.width;i++){
        const x=(i+.5-tx)/scale,z=(j+.5-tz)/scale;
        if(islands.some(r=>x>=r.minX-buffer&&x<=r.maxX+buffer&&z>=r.minZ-buffer&&z<=r.maxZ+buffer))pixels[(j*canvas.width+i)*4+3]=255;
      }
      return {data:pixels};
    }};
    Object.defineProperty(context,'lineWidth',{set(v){if(!hasLand)buffer=v/2;}});
    canvas.getContext=()=>context;return canvas;
  };
  const planner=createNavPlanner({islands,bounds:{minX:-60,maxX:60,minZ:-60,maxZ:60},kmPerWorldUnitAt:()=>4,makeCanvas});
  const result=planner.plan({x:-12,z:3},{x:12,z:-3});
  assert.ok(result.route,'the strait is wide enough at 1.5 km a side');
  assert.equal(result.route.clearance,1.5);
  const coast=createCoastQuery(islands,()=>4);let a={x:-12,z:3};
  for(const b of result.route.waypoints){assert.ok(coast.segmentClear(a,b,1.5));a=b;}
});
