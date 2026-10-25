import test from 'node:test';
import assert from 'node:assert/strict';

test('development opens the Philippines while earned milestones still track both Korean master badges',async()=>{
  const memory=new Map([['relax-achievements-v1',JSON.stringify({sectors:[],japanSectors:[],unlocked:{circumTaiwan:1,circumJapan:2},counters:{landmarks:[]}})]]);
  globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};globalThis.addEventListener=()=>{};
  const {isCountryUnlocked,isCountryEarned,lockMessage,registerMasterBadges,trackAchievements}=await import('../dist/achievements.js');
  assert.equal(isCountryUnlocked('jp'),true);
  assert.equal(isCountryUnlocked('kr'),true);
  assert.equal(isCountryUnlocked('菲律賓'),true);
  assert.equal(isCountryEarned('菲律賓'),false);
  assert.match(lockMessage('ph'),/韓國與北韓/);
  const stamps={韓國:17,北韓:1};
  registerMasterBadges([{country:'韓國',total:17},{country:'北韓',total:2}],(country)=>stamps[country]??0);
  assert.equal(isCountryEarned('ph'),false);
  stamps.北韓=2;
  trackAchievements({delta:.6,x:0,z:0,nearestLand:{country:'kp',km:100},speed:0,night:false,landmarks:[]});
  assert.equal(isCountryEarned('ph'),true);
});
