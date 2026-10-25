import test from 'node:test';
import assert from 'node:assert/strict';

test('a fresh development game opens every country while circuit achievements retain their order',async()=>{
  const memory=new Map();
  globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};globalThis.addEventListener=()=>{};
  const {isCountryUnlocked,isCountryEarned,lockMessage,trackAchievements}=await import('../dist/achievements.js');
  const {geoToWorld}=await import('../dist/geo.js');
  assert.equal(isCountryUnlocked('tw'),true);
  assert.equal(isCountryUnlocked('jp'),true);
  assert.equal(isCountryUnlocked('hk'),true);
  assert.equal(isCountryUnlocked('mo'),true);
  assert.equal(isCountryEarned('jp'),false);
  assert.equal(lockMessage('日本'),'日本尚未解鎖：先完成「環台一圈」');
  assert.equal(lockMessage('kr'),'韓國尚未解鎖：先完成「環日本一圈」');
  // Japan's circuit can progress during development without first circling Taiwan.
  const tokyo=geoToWorld({latitude:35,longitude:140});
  trackAchievements({delta:.6,x:tokyo.x,z:tokyo.y,nearestLand:{country:'jp',km:10},speed:0,night:false,landmarks:[]});
  assert.equal(JSON.parse(memory.get('relax-achievements-v1')??'{"japanSectors":[]}').japanSectors?.length??0,1);
  for(let k=0;k<16;k++){
    const angle=(k+.5)/16*Math.PI*2;
    trackAchievements({delta:.6,x:Math.sin(angle)*50,z:-Math.cos(angle)*50,nearestLand:{country:'tw',km:10},speed:0,night:false,landmarks:[]});
  }
  assert.equal(isCountryEarned('jp'),true);
  assert.equal(isCountryEarned('kr'),false);
});
