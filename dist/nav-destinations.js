// Shared by navigation and stamp collection: arriving offshore must count.
// Open-water spots near a place, nearest first. Every spot is kept at least
// MIN_SHORE_DISTANCE_KM from the closest shore (true km, not map units).
const MIN_SHORE_DISTANCE_KM = 5.5;
// Normally a destination sits at least 5.5 km off the nearest shore. In cramped waters (the
// Seto Inland Sea, narrow bays) no such spot exists, so settle for the roomiest one available.
const SHORE_CLEARANCE_STEPS_KM = [MIN_SHORE_DISTANCE_KM, 3.5, 2.2];   // closer than 5.5 km only where no open water that far out exists
export function seaCandidates(placeX, placeZ, { coast: query, bounds: WORLD_BOUNDS, kmPerWorldUnitAt, preserveSeaPoint=true }) {
  const nearestCoastPoint=query.nearest, isLandAt=query.isLand;
  const distanceToLand=(x,z)=>({km:query.distance(x,z)});
  const coast = query.isLand(placeX,placeZ) && query.nearestSea ? query.nearestSea(placeX,placeZ) : nearestCoastPoint(placeX, placeZ);
  const onLand = isLandAt(placeX, placeZ);
  let dirX = onLand ? coast.x - placeX : placeX - coast.x;
  let dirZ = onLand ? coast.z - placeZ : placeZ - coast.z;
  if(Math.hypot(dirX,dirZ)<1e-8){dirX=1;dirZ=0;}
  const length = Math.hypot(dirX, dirZ) || 1;
  dirX /= length; dirZ /= length;
  const kmPerUnit = kmPerWorldUnitAt(coast.z);
  const exactClearance=query.distance(placeX,placeZ);
  if(preserveSeaPoint&&!onLand&&exactClearance>=2.2&&placeX>=WORLD_BOUNDS.minX&&placeX<=WORLD_BOUNDS.maxX&&placeZ>=WORLD_BOUNDS.minZ&&placeZ<=WORLD_BOUNDS.maxZ)
    return {candidates:[{x:placeX,z:placeZ}],clearanceKm:Math.min(5.5,exactClearance)};
  for (const clearanceKm of SHORE_CLEARANCE_STEPS_KM) {
    const candidates = [];
    const open = (x, z) => x>=WORLD_BOUNDS.minX&&x<=WORLD_BOUNDS.maxX&&z>=WORLD_BOUNDS.minZ&&z<=WORLD_BOUNDS.maxZ&&!isLandAt(x, z) && distanceToLand(x, z).km >= clearanceKm;
    if (preserveSeaPoint && !onLand && open(placeX, placeZ)) return {candidates:[{x:placeX,z:placeZ}],clearanceKm};
    const minRadius = clearanceKm / kmPerUnit;
    for (const factor of [1.08, 1.3, 1.7, 2.4, 3.5, 5, 8]) {
      const radius = minRadius * factor;
      for (const turn of (clearanceKm<5.5?Array.from({length:64},(_,i)=>i*Math.PI/32).sort((a,b)=>Math.abs(Math.atan2(Math.sin(a),Math.cos(a)))-Math.abs(Math.atan2(Math.sin(b),Math.cos(b)))):[0, .5, -.5, 1, -1, 1.6, -1.6, 2.4, -2.4, Math.PI])) {
        const cos = Math.cos(turn), sin = Math.sin(turn);
        const x = coast.x + (dirX * cos - dirZ * sin) * radius;
        const z = coast.z + (dirX * sin + dirZ * cos) * radius;
        if (open(x, z)) candidates.push({ x, z });
      }
      if (candidates.length >= 8) break;
    }
    if (candidates.length) {
      const nearby=candidates.slice(0,8);
      // A roomy pocket inside a bay may have no navigable entrance. Landmarks also
      // expose outer-water alternatives; exact coordinate requests keep their point.
      if(!preserveSeaPoint)for(const factor of [12,20]){
        const outer=[];
        for(let i=0;i<16;i++){
          const a=i*Math.PI/8,x=coast.x+Math.cos(a)*minRadius*factor,z=coast.z+Math.sin(a)*minRadius*factor;
          if(open(x,z))outer.push({x,z,fallback:true});
        }
        nearby.push(...outer.slice(0,4));
      }
      return {candidates:nearby,clearanceKm};
    }
  }
  return { candidates: [], clearanceKm: 0 };
}

