import test from 'node:test';
import assert from 'node:assert/strict';

test('developer mode opens every country while earned milestones still count',async()=>{
  const memory=new Map([['relax-dev-mode-v1','1'],['relax-achievements-v1',JSON.stringify({sectors:[],japanSectors:[],unlocked:{},counters:{landmarks:[]}})]]);
  globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};globalThis.addEventListener=()=>{};
  const {DEVELOPMENT_ALL_COUNTRIES_OPEN,isCountryUnlocked,isCountryEarned,registerMasterBadges,trackAchievements}=await import('../dist/achievements.js');
  assert.equal(DEVELOPMENT_ALL_COUNTRIES_OPEN,true);
  for(const code of ['tw','jp','kr','kp','ph','au','kz'])assert.equal(isCountryUnlocked(code),true,code);
  assert.equal(isCountryEarned('jp'),false,'opened, not earned');
  const stamps={台灣:25};
  registerMasterBadges([{country:'台灣',total:25}],(country)=>stamps[country]??0);
  trackAchievements({delta:.6,x:0,z:0,nearestLand:{country:'tw',km:100},speed:0,night:false,landmarks:[]});
  assert.equal(isCountryEarned('jp'),true,'the Taiwan master badge is still earned and saved');
});

test('the hidden shortcut is Ctrl + Cmd + Shift + E, by key position',async()=>{
  const {isDevModeShortcut}=await import('../dist/dev-mode.js');
  assert.equal(isDevModeShortcut({ctrlKey:true,metaKey:true,shiftKey:true,code:'KeyE'}),true);
  assert.equal(isDevModeShortcut({ctrlKey:true,metaKey:false,shiftKey:true,code:'KeyE'}),false);
  assert.equal(isDevModeShortcut({ctrlKey:true,metaKey:true,shiftKey:true,code:'KeyW'}),false);
});
