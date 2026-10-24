// Repair invalid fields independently so usable progress survives an older or damaged save.
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value:{};
const count=value=>Number.isFinite(value)&&value>=0?value:0;
const timestamps=value=>Object.fromEntries(Object.entries(object(value)).filter(([,time])=>Number.isFinite(time)&&time>0&&time<=8.64e15));
const sectors=value=>[...new Set(Array.isArray(value)?value.filter(n=>Number.isInteger(n)&&n>=0&&n<16):[])];
export function parseProgress(text){try{return JSON.parse(text??'null');}catch{return null;}}
export function normalizeAchievements(value){
  const saved=object(value),c=object(saved.counters);
  return {sectors:sectors(saved.sectors),japanSectors:sectors(saved.japanSectors),unlocked:timestamps(saved.unlocked),counters:{nightSeconds:count(c.nightSeconds),whales:count(c.whales),arrivals:count(c.arrivals),landmarks:[...new Set(Array.isArray(c.landmarks)?c.landmarks.filter(n=>typeof n==='string'&&n.length):[])]}};
}
export function normalizeJourney(value){
  const saved=object(value),result={};
  for(const key of ['distanceKm','seconds','whales'])result[key]=count(saved[key]);
  for(const key of ['seas','countries','stamps','masters','specials'])result[key]=timestamps(saved[key]);
  result.log=(Array.isArray(saved.log)?saved.log:[]).filter(e=>e&&Number.isFinite(e.t)&&e.t>0&&e.t<=8.64e15&&typeof e.text==='string').map(e=>({t:e.t,text:e.text})).sort((a,b)=>a.t-b.t).slice(-80);
  return result;
}
