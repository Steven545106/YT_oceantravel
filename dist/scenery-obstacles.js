import {pointSegmentDistanceSquared,segmentDistanceSquared} from './coast-query.js';
// Sights' foundations the boat cannot sail through (bridge openings stay open); used for collision.
export const sceneryObstacles=[];
export function obstacleContains(o,x,z,padding=0){
  if(o.minX!==undefined)return x>=o.minX-padding&&x<=o.maxX+padding&&z>=o.minZ-padding&&z<=o.maxZ+padding;
  return Math.hypot(x-o.x,z-o.z)<(o.radius??.65)+padding;
}
export function obstacleBlocksSegment(o,a,b,padding=0){
  if(o.minX===undefined)return pointSegmentDistanceSquared(o.x,o.z,a.x,a.z,b.x,b.z)<((o.radius??.65)+padding)**2;
  if(obstacleContains(o,a.x,a.z,padding)||obstacleContains(o,b.x,b.z,padding))return true;
  const corners=[{x:o.minX-padding,z:o.minZ-padding},{x:o.maxX+padding,z:o.minZ-padding},{x:o.maxX+padding,z:o.maxZ+padding},{x:o.minX-padding,z:o.maxZ+padding}];
  return corners.some((c,i)=>segmentDistanceSquared(a,b,c,corners[(i+1)%4])<1e-12);
}

// A newly added foundation must not trap a boat loaded inside it: permit motion toward an exit.
export function movementBlocked(o,a,b){
  if(!obstacleContains(o,a.x,a.z))return obstacleBlocksSegment(o,a,b);
  if(!obstacleContains(o,b.x,b.z))return false;
  const depth=p=>o.minX!==undefined?Math.min(p.x-o.minX,o.maxX-p.x,p.z-o.minZ,o.maxZ-p.z):(o.radius??.65)-Math.hypot(p.x-o.x,p.z-o.z);
  return depth(b)>depth(a)+1e-8;
}
