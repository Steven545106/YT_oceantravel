import test from 'node:test';
import assert from 'node:assert/strict';

test('stamp book lists country stamps once sights are placed, without the boat ever running trackJourney',async()=>{
  const memory=new Map([['relax-journey-v1',JSON.stringify({stamps:{'台北101':1},specials:{pinkWhale:2}})]]);
  globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};globalThis.addEventListener=()=>{};
  const node=()=>{const n={children:[],dataset:{},style:{},hidden:true,classList:{toggle(){}},addEventListener(){},setAttribute(){}};n.append=(...c)=>n.children.push(...c);n.replaceChildren=(...c)=>{n.children=c;};return n;};
  const nodes={};globalThis.document={querySelector:s=>nodes[s]??=node(),querySelectorAll:()=>[],createElement:()=>node()};
  const {initJourney,setJourneyOpen,setStampTargets}=await import('../dist/journey.js');
  initJourney({onNotify(){}});
  setJourneyOpen(true,'stamps');
  setStampTargets([{name:'台北101',country:'台灣'},{name:'富士山',country:'日本'}]);
  const text=(n)=>[n.textContent??'',...n.children.map(text)].join(' ');
  const shown=text(nodes['#journey-body']);
  assert.match(shown,/台灣 1 \/ 1/);
  assert.match(shown,/日本 0 \/ 1/);
});
