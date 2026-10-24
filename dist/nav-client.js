import {createNavPlanner} from './nav-planner.js';
import {kmPerWorldUnitAt} from './geo.js';
// Every request stays tracked, including requests transferred to the main-thread fallback.
// `getIslandsVersion` changes when streamed coast detail swaps outlines, so the planner is rebuilt from the current ones.
export function createNavClient(islands,bounds,getLockedCountries=()=>[],getSceneObstacles=()=>[],getIslandsVersion=()=>0,seaGrid=null){
  let worker=null,fallback=null,serial=0,workerFailed=false,lockKey=null;
  const pending=new Map(),obstacles=[];
  function local(){
    if(!fallback){fallback=createNavPlanner({islands,bounds,seaGrid,lockedCountries:getLockedCountries(),initialObstacles:getSceneObstacles(),kmPerWorldUnitAt,makeCanvas:(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;}});for(const o of obstacles)fallback.obstacle(o);}
    return fallback;
  }
  function finish(id,error,result){
    const request=pending.get(id);if(!request)return;
    clearTimeout(request.timer);pending.delete(id);
    if(error)request.reject(error);else request.resolve(result);
  }
  function localRequest(request){
    request.timer=setTimeout(()=>{
      if(!pending.has(request.message.id))return;
      try{const m=request.message;finish(m.id,null,m.type==='circum'?local().circum(m.from):local().plan(m.from,m.place));}
      catch(error){finish(request.message.id,error);}
    },0);
  }
  function cancel(){
    if(!pending.size)return;
    worker?.terminate();worker=null;
    for(const id of pending.keys())finish(id,new DOMException('Navigation cancelled','AbortError'));
  }
  function failWorker(active){
    if(worker!==active)return;
    active.terminate();worker=null;workerFailed=true;
    for(const request of pending.values())localRequest(request);
  }
  function startWorker(){
    if(worker||workerFailed||typeof Worker==='undefined')return;
    let active;
    try{
      const url=new URL('./nav-worker.bundle.js',import.meta.url);url.search=new URL(import.meta.url).search;
      active=new Worker(url,{type:'module'});worker=active;
      active.onmessage=({data})=>{
        if(worker!==active)return;
        if(data.fallback){failWorker(active);return;}
        finish(data.id,data.error?new Error(data.error):null,data.result);
      };
      active.onerror=()=>failWorker(active);
      active.postMessage({type:'init',islands,bounds,seaGrid,lockedCountries:getLockedCountries(),initialObstacles:getSceneObstacles()});
      for(const point of obstacles)active.postMessage({type:'obstacle',point});
    }catch{active?.terminate();workerFailed=true;worker=null;}
  }
  return {
    request(type,from,place){
      const nextLocks=getLockedCountries().join(',')+'|'+JSON.stringify(getSceneObstacles())+'|'+getIslandsVersion();
      if(nextLocks!==lockKey){cancel();worker?.terminate();worker=null;fallback=null;lockKey=nextLocks;}
      startWorker();const message={type,from,place,id:++serial};
      return new Promise((resolve,reject)=>{
        const request={resolve,reject,message};pending.set(message.id,request);
        if(!worker){localRequest(request);return;}
        try{worker.postMessage(message);}catch{failWorker(worker);}
      });
    },
    cancel,
    obstacle(point){obstacles.push(point);if(worker){try{worker.postMessage({type:'obstacle',point});}catch{failWorker(worker);}}if(fallback)fallback.obstacle(point);}
  };
}
