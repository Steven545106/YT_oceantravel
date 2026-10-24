import {createNavPlanner} from './nav-planner.js';
import {kmPerWorldUnitAt} from './geo.js';
let planner;
self.onmessage=({data})=>{
  try{
    if(data.type==='init'){
      if(typeof OffscreenCanvas==='undefined'){self.postMessage({fallback:true});return;}
      planner=createNavPlanner({...data,kmPerWorldUnitAt,makeCanvas:(w,h)=>new OffscreenCanvas(w,h)});return;
    }
    if(data.type==='obstacle'){planner?.obstacle(data.point);return;}
    const result=data.type==='circum'?planner.circum(data.from):planner.plan(data.from,data.place);
    self.postMessage({id:data.id,result});
  }catch(error){self.postMessage({id:data.id,error:String(error.message)});}
};
