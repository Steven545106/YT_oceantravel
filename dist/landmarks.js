import { addLandmarkDetail } from './landmark-detail.js';
import { isCountryUnlocked } from './achievements.js';
import { createCoastQuery } from './nav-coast.js';
import { seaCandidates } from './nav-destinations.js';
import { landmarkAccess } from './landmark-access.js';
import { sceneryObstacles, obstacleContains } from './nav-obstacles.js';
import { displayStampZone } from './stamp-reach.js';
import * as THREE from 'three';
import { fetchJson } from './data-loader.js';
import { LANDMARK_BUILDERS } from './landmark-models.js';
import { geoToWorld, kmPerWorldUnitAt } from './geo.js';
import { invalidatePlaceIndex, placeCountries } from './places.js';
import { addMapLabel } from './labels.js';
import { terrainHeightAt, isOnLand, landIslands } from './land.js';
import { camera, reflectionExclusions, scene, WORLD_BOUNDS } from './core.js';
import { landmarkFootprintScale, landmarkDisplayGeo, landmarkDisplayName, landmarkDisplayHeight, landmarkDisplayScale, layoutLandmarkDisplays, TERRAIN_LANDMARK_TYPES } from './landmark-scale.js';

const landmarksData = await fetchJson('landmarks.json');

export const landmarkInstances = [];
// every sight (including the ones that are only a label, like Taipei 101) with the reach at which the boat earns its stamp
export const landmarkEntries = landmarkAccess;
// Sit sights back on the terrain after a heightmap has loaded (they were placed before it arrived).
export function regroundLandmarks(filter = () => true) {
  for (const landmark of landmarkInstances) {
    if (!landmark.sea && filter(landmark)) landmark.group.position.y = terrainHeightAt(landmark.displayX, landmark.displayZ);
  }
}

export function addLandmarks() {
  invalidatePlaceIndex(); // landmarks join the searchable place list
  const countryMap = Object.fromEntries(placeCountries.map((entry) => [entry.country, entry]));
  const displays=[];
  const coastQuery=createCoastQuery(landIslands,kmPerWorldUnitAt);
  for (const entry of landmarksData.landmarks) {
    const world = geoToWorld({ latitude: entry.lat, longitude: entry.lon });
    if(entry.type==='virtual')addMapLabel({text:entry.name,x:world.x,z:world.y,kind:'landmark',priority:45,maxHeight:entry.labelHeight??420});
    const country = countryMap[entry.country];
    if (country) country.places.push({ name: entry.name, aliases: entry.aliases ?? [], lat: entry.lat, lon: entry.lon, type: 'LM', pop: 5e6 });
    // Preserve the original vicinity, and cover the same offshore stops used by navigation.
    const coast = coastQuery.nearestSea(world.x, world.y);
    const reach = Math.max(2.4, Math.hypot(coast.x - world.x, coast.z - world.y) + 2.6);   // the boat keeps ≥5 km off shore, so allow ~10 km beyond the coast
    const stampZones=seaCandidates(world.x,world.y,{coast:coastQuery,bounds:WORLD_BOUNDS,kmPerWorldUnitAt,preserveSeaPoint:false}).candidates.map(point=>({...point,reach:2/kmPerWorldUnitAt(point.z)}));
    landmarkEntries.push({stampZones, name: entry.name, displayName:landmarkDisplayName(entry), country: entry.country, lat: entry.lat, lon: entry.lon, x: world.x, z: world.y, reach, intro: entry.intro ?? '', seal: entry.seal, height: TERRAIN_LANDMARK_TYPES.has(entry.type) ? 0 : entry.realHeight });
    if (entry.type === 'virtual') continue;

    const displayWorld=geoToWorld(landmarkDisplayGeo(entry));
    const build = LANDMARK_BUILDERS[entry.type] ?? LANDMARK_BUILDERS.marker;
    const isPeak = TERRAIN_LANDMARK_TYPES.has(entry.type);
    // Keep a readable height; nearby miniatures are separated after all models are measured.
    let scale = isPeak ? 1 : landmarkDisplayHeight(entry.realHeight) * (entry.displayScale ?? 1);
    const options = { ...(entry.options ?? {}) };
    // Sizes given in world units (a lake, a bridge span) are converted into this model's own units.
    if (options.worldRadius) options.radius = options.worldRadius / scale;
    if (options.worldSpan) options.span = options.worldSpan / scale;
    const model = build(options);
    const bounds = new THREE.Box3().setFromObject(model);
    scale = landmarkDisplayScale(entry);
    const group = new THREE.Group();
    group.add(model);
    if (!isPeak && !entry.worldSized && entry.type !== 'marker') {
      const height = Math.max(bounds.max.y - Math.min(bounds.min.y, 0), 1e-3);
      model.scale.setScalar(entry.type === 'bridge' ? 1 : 1 / height);
    }
    group.scale.setScalar(scale);
    const footprint=new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());
    group.scale.multiplyScalar(landmarkFootprintScale(entry,footprint,kmPerWorldUnitAt(displayWorld.y)));
    const ground = entry.sea ? 0 : terrainHeightAt(displayWorld.x, displayWorld.y);
    group.position.set(displayWorld.x, ground, displayWorld.y);
    group.rotation.y = entry.yaw ?? 0;
    group.name = entry.name;
    landmarkGroup.add(group);
    const instance={ group, model, entry, name:entry.name, country:entry.country, sea:!!entry.sea,
      x:displayWorld.x,z:displayWorld.y,reach,visibleDistance:entry.visibleDistance??(scale>1?560:190) };
    landmarkInstances.push(instance);
    if(!isPeak&&(!entry.sea||entry.type==='bridge')){
      const box=new THREE.Box3().setFromObject(group),size=box.getSize(new THREE.Vector3()),centre=box.getCenter(new THREE.Vector3());
      // Contact shadows extend 6% beyond the geometry on each side.
      displays.push({name:entry.name,x:displayWorld.x,z:displayWorld.y,width:size.x*1.12,depth:size.z*1.12,height:entry.type==='bridge'?Infinity:size.y,fixed:entry.preserveLocation===true||entry.type==='bridge',offsetX:centre.x-displayWorld.x,offsetZ:centre.z-displayWorld.y});
    }
  }
  const layout=layoutLandmarkDisplays(displays,(x,z,item)=>item.fixed||isOnLand(x,z));
  const stampTargets=new Map(landmarkEntries.map(target=>[target.name,target]));
  for(const item of landmarkInstances){
    const position=layout.get(item.name)??{x:item.x,z:item.z};
    item.displayX=position.x;item.displayZ=position.z;
    item.group.position.set(position.x,item.sea?0:terrainHeightAt(position.x,position.z),position.z);
    const displayBounds=new THREE.Box3().setFromObject(item.group);
    const target=stampTargets.get(item.name);
    target.displayZone=displayStampZone(displayBounds,kmPerWorldUnitAt(position.z));
    target.displayX=position.x;target.displayZ=position.z;target.markerY=displayBounds.max.y+.15;
    if(!item.entry.terrainReplacement&&!TERRAIN_LANDMARK_TYPES.has(item.entry.type)&&item.entry.type!=='bridge'&&item.entry.type!=='marker'){
      const pad=.12;
      sceneryObstacles.push({name:item.name,minX:displayBounds.min.x-pad,maxX:displayBounds.max.x+pad,minZ:displayBounds.min.z-pad,maxZ:displayBounds.max.z+pad});
    }
    // Bridges retain their passages; only supports intersecting the waterline block sailing.
    if(item.entry.type==='bridge')item.model.traverse(mesh=>{
      if(!mesh.isMesh)return;const b=new THREE.Box3().setFromObject(mesh);
      if(b.min.y<=.02&&b.max.y>.05&&b.max.x-b.min.x<.5&&b.max.z-b.min.z<.5)
        sceneryObstacles.push({name:item.name,minX:b.min.x-.08,maxX:b.max.x+.08,minZ:b.min.z-.08,maxZ:b.max.z+.08});
    });
    addMapLabel({text:landmarkDisplayName(item.entry),x:position.x,z:position.z,kind:'landmark',priority:45,maxHeight:item.entry.labelHeight??420});
    addLandmarkDetail(item.group,item.model,{heightAt:terrainHeightAt,sea:item.sea,natural:['peak','yushan','fuji','seongsan','hallasan','seoraksan','jirisan','lake','gorge','queenhead','alishan','tree','banaueTerraces','pagsanjanFalls','taal','dokdo','guishanIsland','vaseRock','twinHearts'].includes(item.entry.type)});
  }
  for(const target of landmarkEntries){
    const x=target.displayX??target.x,z=target.displayZ??target.z;
    target.stampZones=seaCandidates(x,z,{coast:coastQuery,bounds:WORLD_BOUNDS,kmPerWorldUnitAt,preserveSeaPoint:false}).candidates
      .filter(p=>!sceneryObstacles.some(o=>obstacleContains(o,p.x,p.z)))
      .map(p=>({...p,reach:2/kmPerWorldUnitAt(p.z)}));
    if(target.displayZone)target.stampZones.push(target.displayZone);
  }
}
const landmarkGroup = new THREE.Group();
scene.add(landmarkGroup);
reflectionExclusions.push(landmarkGroup);
export function updateLandmarkVisibility() {
  for (const item of landmarkInstances) {
    item.group.visible = isCountryUnlocked(item.country) && Math.hypot(item.displayX - camera.position.x, item.displayZ - camera.position.z) < item.visibleDistance + camera.position.y;
  }
}
