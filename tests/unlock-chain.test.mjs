import test from 'node:test';
import assert from 'node:assert/strict';

test('players start with Taiwan; each country\'s master badge opens the next: Taiwan → Japan → both Koreas → the rest',async()=>{
  const memory=new Map();
  globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};globalThis.addEventListener=()=>{};
  const {DEVELOPMENT_ALL_COUNTRIES_OPEN,isCountryUnlocked,lockMessage,registerMasterBadges,trackAchievements}=await import('../dist/achievements.js');
  assert.equal(DEVELOPMENT_ALL_COUNTRIES_OPEN,false,'player mode unless developer mode was switched on');
  assert.equal(isCountryUnlocked('tw'),true);
  for(const code of ['jp','kr','kp','cn','hk','ph','au'])assert.equal(isCountryUnlocked(code),false,code);
  assert.equal(lockMessage('日本'),'日本尚未解鎖：先集滿台灣的所有印章');
  assert.equal(lockMessage('kr'),'韓國尚未解鎖：先集滿日本的所有印章');
  assert.match(lockMessage('ph'),/集滿韓國與北韓的所有印章/);
  const stamps={台灣:0,日本:0,韓國:0,北韓:0};
  registerMasterBadges([{country:'台灣',total:25},{country:'日本',total:29},{country:'韓國',total:17},{country:'北韓',total:2}],(country)=>stamps[country]);
  const check=()=>trackAchievements({delta:.6,x:0,z:0,nearestLand:{country:'tw',km:100},speed:0,night:false,landmarks:[]});
  stamps.台灣=25;check();
  assert.equal(isCountryUnlocked('jp'),true,'Taiwan master opens Japan');
  assert.equal(isCountryUnlocked('kr'),false);
  stamps.日本=29;check();
  assert.equal(isCountryUnlocked('kr'),true,'Japan master opens South Korea');
  assert.equal(isCountryUnlocked('kp'),true,'and North Korea');
  assert.equal(isCountryUnlocked('ph'),false);
  stamps.韓國=17;stamps.北韓=2;check();
  assert.equal(isCountryUnlocked('ph'),true,'both Korean masters open the rest');
});
