import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {geoToWorld} from '../dist/geo.js';
import {displayStampZone} from '../dist/stamp-reach.js';
const catalogue=JSON.parse(await readFile(new URL('../dist/Data/landmarks.json',import.meta.url),'utf8')).landmarks;

test('NSYSU is a unique Taiwan landmark with search aliases and an individual stamp',()=>{
  const matches=catalogue.filter(item=>item.type==='nsysu');assert.equal(matches.length,1);
  const campus=matches[0];assert.equal(campus.country,'台灣');assert.equal(campus.name,'國立中山大學');
  for(const alias of ['中山大學','國立高雄中山大學','NSYSU'])assert.ok(campus.aliases.includes(alias));
  assert.equal(campus.seal,'中山大學');assert.ok(campus.lat>22.62&&campus.lat<22.64);assert.ok(campus.lon>120.26&&campus.lon<120.28);
  assert.equal(catalogue.filter(item=>item.country==='台灣').length,25);
});

test('offshore arrival earns NSYSU once, saves it, and retains existing stamps',async()=>{
  // Exercise the real journey loop against in-memory storage; never touch a player's browser save.
  const memory=new Map([['relax-journey-v1',JSON.stringify({stamps:{'台北101':123},log:[]})]]);
  const storage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)};
  const nodes=new Map();
  class Node {
    children=[];classList={add(){},remove(){}};textContent='';hidden=false;offsetWidth=1;
    append(...nodes){this.children.push(...nodes);for(const node of nodes)if(node.id)globalThis.__stampTestNodes.set(node.id,node);}
    replaceChildren(...nodes){this.children=[];this.append(...nodes);}
    setAttribute(){}
  }
  globalThis.__stampTestNodes=nodes;
  globalThis.localStorage=storage;globalThis.addEventListener=()=>{};
  globalThis.document={querySelector:selector=>nodes.get(selector.slice(1))??null,createElement:()=>new Node(),body:new Node()};
  const originalTimeout=globalThis.setTimeout,originalClear=globalThis.clearTimeout;
  const scheduled=[];globalThis.setTimeout=fn=>{scheduled.push(fn);return scheduled.length;};globalThis.clearTimeout=()=>{};
  try {
    const {trackJourney}=await import('../dist/journey.js');
    const stampTargets=catalogue.filter(item=>item.country==='台灣').map(item=>{
      const p=geoToWorld({latitude:item.lat,longitude:item.lon});return {...item,x:p.x,z:p.y,reach:2.4};
    });
    const campus=stampTargets.find(item=>item.type==='nsysu');
    const step=(x,z)=>trackJourney({delta:.6,x,z,kmPerUnit:4,speed:0,seaName:()=>'',nearestLand:{km:4,country:'tw'},stampTargets});
    step(campus.x-4,campus.z);assert.ok(!JSON.parse(memory.get('relax-journey-v1')).stamps[campus.name]);
    step(campus.x-1,campus.z);
    const saved=JSON.parse(memory.get('relax-journey-v1'));
    assert.ok(saved.stamps[campus.name]);assert.equal(saved.stamps['台北101'],123);
    assert.ok(saved.log.some(entry=>entry.text===`在${campus.name}蓋章`));
    const shown=[];for(let i=0;i<30&&scheduled.length;i++){shown.push(nodes.get('stamp-seal-overlay')?.children[0]?.children[0]?.textContent);scheduled.shift()();}
    assert.ok(shown.includes('中山大學'),'queued campus seal must be shown after neighboring stamps');
    step(campus.x-1,campus.z);step(campus.x-4,campus.z);step(campus.x-1,campus.z);
    const again=JSON.parse(memory.get('relax-journey-v1'));
    assert.equal(again.stamps[campus.name],saved.stamps[campus.name]);
    assert.equal(again.log.filter(entry=>entry.text===`在${campus.name}蓋章`).length,1);
    // Manual arrival at an enlarged/displaced model must work without starting navigation.
    const lake=stampTargets.find(target=>target.name==='日月潭');
    lake.stampZones=[displayStampZone({min:{x:46,z:49},max:{x:54,z:51}},4)];
    step(55,50);
    const manual=JSON.parse(memory.get('relax-journey-v1'));
    assert.ok(manual.stamps[lake.name]);
    assert.equal(manual.stamps[campus.name],saved.stamps[campus.name]);
    assert.equal(manual.stamps['台北101'],123);
    for(const [i,type] of ['shengliVillage','pingxiLanterns','sanxiantai','vaseRock','guishanIsland','penghuBridge','twinHearts'].entries()){
      const target=stampTargets.find(item=>item.type===type);
      target.stampZones=[{x:campus.x+100+i*10,z:campus.z,reach:.5}];
      const stop=target.stampZones[0];step(stop.x,stop.z);step(stop.x,stop.z);
      const result=JSON.parse(memory.get('relax-journey-v1'));
      assert.ok(result.stamps[target.name]);assert.equal(result.stamps['台北101'],123);
      assert.equal(result.log.filter(entry=>entry.text===`在${target.name}蓋章`).length,1);
    }
  } finally {globalThis.setTimeout=originalTimeout;globalThis.clearTimeout=originalClear;delete globalThis.__stampTestNodes;}
});
