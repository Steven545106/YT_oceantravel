// Scenic miniatures need a readable minimum height beside the deliberately enlarged ship.
export const LANDMARK_MIN_DISPLAY_HEIGHT = .9;
export const landmarkDisplayHeight = metres => Math.max(Math.sqrt(metres) * 2.24 / Math.sqrt(508), LANDMARK_MIN_DISPLAY_HEIGHT);
export const TERRAIN_LANDMARK_TYPES = new Set(['peak','yushan','fuji','seongsan','hallasan','seoraksan','jirisan']);
export function landmarkDisplayScale(entry) {
  if(TERRAIN_LANDMARK_TYPES.has(entry.type)||entry.worldSized)return entry.displayScale??1;
  return landmarkDisplayHeight(entry.realHeight)*(entry.displayScale??1);
}

// Wide street dioramas can otherwise cover an entire city at the minimum display height.
export function landmarkFootprintScale(entry,size,kmPerUnit){
  const cap=entry.maxDisplayFootprintKm;
  if(!(cap>0)||!(kmPerUnit>0))return 1;
  return Math.min(1,cap/(Math.max(size.x,size.z,1e-6)*kmPerUnit));
}
export const landmarkDisplayGeo=entry=>({latitude:entry.displayLocation?.lat??entry.lat,longitude:entry.displayLocation?.lon??entry.lon});
export const landmarkDisplayName=entry=>entry.locality?`${entry.locality}・${entry.name}`:entry.name;

// Presentation placement: navigation retains geographic anchors; stamps also cover visible footprints.
// Keep the tallest silhouettes at their anchors, then place smaller sites as close as possible.
export function layoutLandmarkDisplays(items,canPlace=()=>true){
  const placed=[],result=new Map(),gap=.18;
  const sorted=[...items].sort((a,b)=>Number(!!b.fixed)-Number(!!a.fixed)||b.height-a.height||a.name.localeCompare(b.name));
  const overlaps=(p,other)=>Math.abs(p.x+(p.offsetX??0)-other.x-(other.offsetX??0))<(p.width+other.width)/2+gap&&Math.abs(p.z+(p.offsetZ??0)-other.z-(other.offsetZ??0))<(p.depth+other.depth)/2+gap;
  for(const item of sorted){
    let chosen={...item};
    const clear=p=>!placed.some(other=>overlaps(p,other))&&canPlace(p.x,p.z,item);
    if(!item.fixed&&!clear(chosen)){
      let found=false;
      // 0.15 world units is about 600m on this miniature map. Search nearest first.
      for(let ring=1;ring<=100&&!found;ring++){
        const radius=ring*.15,steps=Math.max(16,Math.ceil(radius*Math.PI*2/.15));
        const angles=Array.from({length:steps},(_,k)=>k/steps*Math.PI*2).sort((a,b)=>Math.abs(Math.cos(a))-Math.abs(Math.cos(b)));
        for(const angle of angles){
          const p={...item,x:item.x+Math.cos(angle)*radius,z:item.z+Math.sin(angle)*radius};
          if(clear(p)){chosen=p;found=true;break;}
        }
      }
    }
    placed.push(chosen);result.set(item.name,{x:chosen.x,z:chosen.z});
  }
  return result;
}
