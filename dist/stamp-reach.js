// Measure from the miniature's visible footprint, after layout offsets and scaling.
export function displayStampZone(bounds,kmPerUnit) {
  return {x:(bounds.min.x+bounds.max.x)/2,z:(bounds.min.z+bounds.max.z)/2,
    halfWidth:(bounds.max.x-bounds.min.x)/2,halfDepth:(bounds.max.z-bounds.min.z)/2,
    reach:6/kmPerUnit};
}
// Preserve the original vicinity and include offshore stops and the visible miniature.
export function isWithinStampReach(target,x,z) {
  return (!target.stampZones?.length && Math.hypot(target.x-x,target.z-z)<target.reach) ||
    (target.stampZones??[]).some(point=>Math.hypot(
      Math.max(0,Math.abs(point.x-x)-(point.halfWidth??0)),
      Math.max(0,Math.abs(point.z-z)-(point.halfDepth??0)))<point.reach);
}
