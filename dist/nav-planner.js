import { seaCandidates } from './nav-destinations.js';
import { gridCellOf,gridCenterOf,nearestFreeCell,findGridPath,smoothGridPath } from './nav-grid.js';
import { createCoastQuery } from './nav-coast.js';
export function createNavPlanner({islands,bounds,kmPerWorldUnitAt,makeCanvas,lockedCountries=[],initialObstacles=[],seaGrid=null}){
const landIslands=islands,WORLD_BOUNDS=bounds,obstacles=[...initialObstacles];
const coast=createCoastQuery(islands,kmPerWorldUnitAt,lockedCountries);
const isLandAt=coast.isLand,nearestCoastPoint=coast.nearest,distanceToLand=(x,z)=>({km:coast.distance(x,z)});
let stats={grids:0,gridCells:0,cacheHits:0};
// Rasterise the land outlines of a world-space window into a sea grid. `buffer` (world units) widens the
// coastline so routes keep that distance from shore.
const SHORE_BUFFER = 1.3;      // ≈ 5 km
function buildNavGrid(minX, maxX, minZ, maxZ, cell, buffer, threshold) {
  const lineWidth = Math.max(.9, 2 * buffer / cell);
  const cols = Math.ceil((maxX - minX) / cell);
  const rows = Math.ceil((maxZ - minZ) / cell);
  stats.gridCells+=cols*rows;stats.grids++;
  const canvas = makeCanvas(cols,rows);
  canvas.width = cols;
  canvas.height = rows;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.setTransform(1 / cell, 0, 0, 1 / cell, -minX / cell, -minZ / cell);
  context.fillStyle = '#fff';
  context.strokeStyle = '#fff';
  context.lineWidth = lineWidth * cell;
  context.lineJoin = 'round';
  context.beginPath();
  for (const island of landIslands) {
    if (island.maxX < minX - cell || island.minX > maxX + cell || island.maxZ < minZ - cell || island.minZ > maxZ + cell) continue;
    const { points, count } = island;
    for (let i = 0; i < count; i++) {
      if (i) context.lineTo(points[i * 2], points[i * 2 + 1]);
      else context.moveTo(points[0], points[1]);
    }
    context.closePath();
  }
  context.fill();
  context.stroke();
  context.lineWidth=24/Math.min(kmPerWorldUnitAt(minZ),kmPerWorldUnitAt(maxZ));
  context.beginPath();
  for(const island of landIslands){
    if(!lockedCountries.includes(island.country)||island.maxX<minX-4||island.minX>maxX+4||island.maxZ<minZ-4||island.minZ>maxZ+4)continue;
    for(let i=0;i<island.count;i++){if(i)context.lineTo(island.points[i*2],island.points[i*2+1]);else context.moveTo(island.points[0],island.points[1]);}context.closePath();
  }
  context.stroke();
  for(const o of obstacles){context.beginPath();if(o.minX!==undefined)context.rect(o.minX,o.minZ,o.maxX-o.minX,o.maxZ-o.minZ);else context.arc(o.x,o.z,o.radius??.65,0,Math.PI*2);context.fill();}
  const pixels = context.getImageData(0, 0, cols, rows).data;
  const blocked = new Uint8Array(cols * rows);
  for (let i = 0; i < blocked.length; i++) blocked[i] = pixels[i * 4 + 3] >= threshold ? 1 : 0;   // partly covered edge cells count from `threshold`
  const near = new Uint8Array(cols * rows);
  for (let j = 1; j < rows - 1; j++) {
    for (let i = 1; i < cols - 1; i++) {
      const k = j * cols + i;
      if (blocked[k]) continue;
      if (blocked[k - 1] || blocked[k + 1] || blocked[k - cols] || blocked[k + cols] ||
        blocked[k - cols - 1] || blocked[k - cols + 1] || blocked[k + cols - 1] || blocked[k + cols + 1]) near[k] = 1;
    }
  }
  return { cols, rows, cell, blocked, near, minX, minZ };
}

const grids=new Map();
function getNavGrid(from,candidates,pad){
  const cell=.5;
  const minX=Math.max(WORLD_BOUNDS.minX,Math.floor((Math.min(from.x,...candidates.map(p=>p.x))-pad)/8)*8);
  const maxX=Math.min(WORLD_BOUNDS.maxX,Math.ceil((Math.max(from.x,...candidates.map(p=>p.x))+pad)/8)*8);
  const minZ=Math.max(WORLD_BOUNDS.minZ,Math.floor((Math.min(from.z,...candidates.map(p=>p.z))-pad)/8)*8);
  const maxZ=Math.min(WORLD_BOUNDS.maxZ,Math.ceil((Math.max(from.z,...candidates.map(p=>p.z))+pad)/8)*8);
  const resolution=Math.max(cell,(maxX-minX)/1100,(maxZ-minZ)/1100);
  const key=[minX,maxX,minZ,maxZ,resolution,obstacles.length].join(',');
  if(grids.has(key)){stats.cacheHits++;return grids.get(key);}
  const grid=buildNavGrid(minX,maxX,minZ,maxZ,resolution,SHORE_BUFFER,1);
  grids.set(key,grid);if(grids.size>3)grids.delete(grids.keys().next().value);
  return grid;
}
function legClear(a,b,clearance=2.1){return coast.segmentClear(a,b,clearance,obstacles);}
// `limit`: the shore distance (km) the route must keep; 2.1 normally, NARROW_KM through a strait that allows no more.
function safeRoute(from,waypoints,limit=2.1){
  let a=from;
  for(let k=0;k<waypoints.length;k++){
    const b=waypoints[k],clearance=k===0?Math.min(limit,Math.max(0,coast.distance(a.x,a.z)-.01)):limit;
    if(!legClear(a,b,clearance))return false;a=b;
  }
  return true;
}
// Straits such as Akashi and Kitan (into Osaka Bay) leave under 2 km either side; only there may a route come this close.
const NARROW_KM=1.5;

// Narrow bays and inland seas can be closed off on the coarse grid. From the nearest point the
// coarse search could reach, finish the trip on a fine grid covering just that stretch.
function planFineApproach(reach, candidates) {
  // keep 5 km off shore if the passage allows it; only squeeze closer through genuinely narrow water. The last tier
  // threads straits narrower than 2 km a side on a much finer grid over a small window, keeping NARROW_KM.
  const km=kmPerWorldUnitAt(reach.z);
  const tiers=[{buffer:SHORE_BUFFER,limit:2.1,pads:[10,30,55],cell:.12,span:170,maxCells:1100,threshold:90},{buffer:2.15/km,limit:2.1,pads:[10,30,55],cell:.12,span:170,maxCells:1100,threshold:90},
    {buffer:(NARROW_KM+.05)/km,limit:NARROW_KM,pads:[4,10],cell:.03,span:60,maxCells:2000,threshold:128}];
  for (const {buffer,limit,pads,cell,span,maxCells,threshold} of tiers) for (const candidate of candidates.slice(0, 3)) for (const pad of pads) {
    const minX = Math.min(reach.x, candidate.x) - pad, maxX = Math.max(reach.x, candidate.x) + pad;
    const minZ = Math.min(reach.z, candidate.z) - pad, maxZ = Math.max(reach.z, candidate.z) + pad;
    if (maxX - minX > span || maxZ - minZ > span) continue;
    const fine = buildNavGrid(minX, maxX, minZ, maxZ, Math.max(cell,(maxX-minX)/maxCells,(maxZ-minZ)/maxCells), buffer, threshold);
    const startCell = nearestFreeCell(fine, ...Object.values(gridCellOf(fine, reach.x, reach.z)));
    const goalCell = nearestFreeCell(fine, ...Object.values(gridCellOf(fine, candidate.x, candidate.z)));
    if (!startCell || !goalCell) continue;
    const cells = findGridPath(fine, startCell, goalCell);
    if (!cells) continue;
    const goalCenter = gridCenterOf(fine, goalCell.i, goalCell.j);
    const waypoints=[...smoothGridPath(fine,cells),candidate];
    if (!legClear(goalCenter, candidate, limit)||!safeRoute(reach,waypoints,limit)) continue;
    return { waypoints, target: candidate, clearance: limit };
  }
  return null;
}

function planSeaRouteOnGrid(from, candidates, grid, fineApproach) {
  const startCell = nearestFreeCell(grid, ...Object.values(gridCellOf(grid, from.x, from.z)));
  if (!startCell) return null;
  const startCenter = gridCenterOf(grid, startCell.i, startCell.j);
  if (!legClear(from, startCenter,Math.min(2.1,Math.max(0,coast.distance(from.x,from.z)-.01)))) return null;
  const triedGoals = new Map();
  for (const candidate of candidates) {
    const rawGoal = gridCellOf(grid, candidate.x, candidate.z);
    const goalCell = nearestFreeCell(grid, rawGoal.i, rawGoal.j);
    if (!goalCell) continue;
    const goalCenter = gridCenterOf(grid, goalCell.i, goalCell.j);
    if (!legClear(goalCenter, candidate)) continue;
    const goalKey = goalCell.j * grid.cols + goalCell.i;
    if (!triedGoals.has(goalKey)) triedGoals.set(goalKey, findGridPath(grid, startCell, goalCell));
    const cells = triedGoals.get(goalKey);
    if (!cells) continue;
    const waypoints=[...smoothGridPath(grid,cells),candidate];
    if(!safeRoute(from,waypoints))continue;
    return { waypoints, target: candidate };
  }
  // Second chance: sail as far as the coarse grid allows, then thread the rest on a fine grid.
  if(!fineApproach)return null;
  const first = candidates[0];
  const firstGoal = nearestFreeCell(grid, ...Object.values(gridCellOf(grid, first.x, first.z)));
  if (!firstGoal) return null;
  const partial = findGridPath(grid, startCell, firstGoal, true);
  if (!partial || partial.length < 2) return null;
  const reachCell = partial[partial.length - 1];
  const reach = gridCenterOf(grid, reachCell.i, reachCell.j);
  const approach = planFineApproach(reach, candidates);
  if (!approach) return null;
  const waypoints=[...smoothGridPath(grid,partial),...approach.waypoints.slice(1)];
  return safeRoute(from,waypoints,approach.clearance)?{waypoints,target:approach.target,clearance:approach.clearance}:null;
}


function planSeaRoute(from,candidates){
  // Most open-sea trips need no grid at all; exact coast checks still guard every segment.
  for(const target of candidates)if(coast.distance(from.x,from.z)>=2.1&&legClear(from,target))return {waypoints:[target],target};
  // Long trips may need to round an entire peninsula, beyond the local search window.
  for(const pad of [12,40,120,240]){
    const route=planSeaRouteOnGrid(from,candidates,getNavGrid(from,candidates,pad),false);
    if(route)return route;
  }
  return planSeaRouteOnGrid(from,candidates,getNavGrid(from,candidates,240),true)??planFineApproach(from,candidates);
}
// Long trips: plan the overall course on the precomputed coarse sea grid of the whole map (one cell = seaGrid.cell
// units; 255 = land, k = water near country k, which is closed while that country is locked), then sail it leg by leg.
// Legs that pass the exact coast check are kept as they are; the rest, and both ends of the trip, use the local planner.
const LONG_TRIP=80;
let coarse=null;
function coarseGrid(){
  if(coarse)return coarse;
  const {cols,rows,codes,countries}=seaGrid,locked=new Set(lockedCountries);
  const blocked=new Uint8Array(cols*rows),near=new Uint8Array(cols*rows);
  for(let k=0;k<blocked.length;k++)blocked[k]=codes[k]===255||(codes[k]>0&&locked.has(countries[codes[k]-1]))?1:0;
  for(let j=1;j<rows-1;j++)for(let i=1;i<cols-1;i++){
    const k=j*cols+i;
    if(!blocked[k]&&(blocked[k-1]||blocked[k+1]||blocked[k-cols]||blocked[k+cols]))near[k]=1;
  }
  // Connected stretches of coarse water: the open sea is the largest; bays behind narrow straits are separate pieces.
  const piece=new Int32Array(cols*rows).fill(-1),sizes=[];
  for(let k=0;k<piece.length;k++){
    if(blocked[k]||piece[k]>=0)continue;
    const id=sizes.length,queue=[k];piece[k]=id;let size=0;
    while(queue.length){
      const c=queue.pop(),i=c%cols;size++;
      const west=i>0?c-1:seaGrid.wrap?c+cols-1:-1,east=i<cols-1?c+1:seaGrid.wrap?c-cols+1:-1;
      for(const n of [west,east,c-cols,c+cols])if(n>=0&&n<piece.length&&!blocked[n]&&piece[n]<0){piece[n]=id;queue.push(n);}
    }
    sizes.push(size);
  }
  const openSea=sizes.indexOf(Math.max(...sizes));
  return coarse={cols,rows,cell:seaGrid.cell,minX:seaGrid.minX,minZ:seaGrid.minZ,wrap:!!seaGrid.wrap,blocked,near,piece,openSea};
}
// Nearest coarse cell of the open sea, searched outwards ring by ring from a cell.
function nearestOpenSea(grid,cell){
  for(let radius=1;radius<60;radius++){
    let best=null,bestD=Infinity;
    for(let dj=-radius;dj<=radius;dj++)for(let di=-radius;di<=radius;di++){
      if(Math.max(Math.abs(di),Math.abs(dj))!==radius)continue;
      const i=cell.i+di,j=cell.j+dj;
      if(i<0||j<0||i>=grid.cols||j>=grid.rows||grid.piece[j*grid.cols+i]!==grid.openSea)continue;
      const d=di*di+dj*dj;if(d<bestD){bestD=d;best={i,j};}
    }
    if(best)return best;
  }
  return null;
}
// A coarse corner can sit close to shore; move it to nearby water at least 3 km out, or drop it.
function seaPoint(p){
  if(!isLandAt(p.x,p.z)&&coast.distance(p.x,p.z)>=3)return p;
  for(let r=.5;r<=2;r+=.5)for(let a=0;a<12;a++){
    const q={x:p.x+Math.cos(a*Math.PI/6)*r,z:p.z+Math.sin(a*Math.PI/6)*r};
    if(!isLandAt(q.x,q.z)&&coast.distance(q.x,q.z)>=3)return q;
  }
  return null;
}
// Returns undefined when the coarse grid does not apply (short trip, no grid), so the caller plans locally instead.
// On a world that wraps east-west the coarse course keeps x continuous across the seam (x past the world's east end
// is the west end one world width on). Local planning and checks happen in the frame the islands are in: each leg is
// moved by whole world widths to start inside it, and moved back afterwards.
const worldWidth=()=>seaGrid?.wrap?seaGrid.cols*seaGrid.cell:Infinity;
const frameShift=(p)=>{const width=worldWidth();return Number.isFinite(width)?-Math.floor((p.x-seaGrid.minX)/width)*width:0;};
const moved=(p,dx)=>({...p,x:p.x+dx});
function localRoute(a,targets){
  const dx=frameShift(a),width=worldWidth();
  // targets go to the copy nearest the start
  const near=targets.map(t=>Number.isFinite(width)?moved(t,Math.round((a.x-t.x)/width)*width+dx):moved(t,dx));
  const route=planSeaRoute(moved(a,dx),near);
  return route&&{...route,waypoints:route.waypoints.map(p=>moved(p,-dx)),target:moved(route.target,-dx)};
}
const localSafe=(a,points,limit=2.1)=>{const dx=frameShift(a);return safeRoute(moved(a,dx),points.map(p=>moved(p,dx)),limit);};
function planLongRoute(from,candidates){
  const goal=candidates[0];
  if(!seaGrid)return undefined;
  const width=worldWidth(),gap=Math.abs(goal.x-from.x);
  if(Math.hypot(Number.isFinite(width)?Math.min(gap,width-gap):gap,goal.z-from.z)<LONG_TRIP)return undefined;
  const grid=coarseGrid();
  let startCell=nearestFreeCell(grid,...Object.values(gridCellOf(grid,from.x,from.z)));
  const goalCell=nearestFreeCell(grid,...Object.values(gridCellOf(grid,goal.x,goal.z)));
  if(!startCell||!goalCell)return undefined;
  // Starting inside a bay the coarse grid sees as closed: first find the way out to open sea on the local planner.
  const waypoints=[];let current=from,clearance=2.1;
  if(grid.piece[startCell.j*grid.cols+startCell.i]!==grid.openSea){
    const outCell=nearestOpenSea(grid,startCell),out=outCell&&seaPoint(gridCenterOf(grid,outCell.i,outCell.j));
    const exit=out&&localRoute(from,[out]);
    if(!exit)return null;
    waypoints.push(...exit.waypoints);current=exit.target;clearance=Math.min(clearance,exit.clearance??2.1);
    startCell=nearestFreeCell(grid,...Object.values(gridCellOf(grid,current.x,current.z)));
  }
  // a bay behind a strait narrower than a coarse cell is closed on this grid: get as close as it allows, finish locally
  const cells=findGridPath(grid,startCell,goalCell)??findGridPath(grid,startCell,goalCell,true);
  if(!cells)return undefined;
  // the course from the coarse grid starts at the start cell's copy nearest `current`
  const course=smoothGridPath(grid,cells),lead=Number.isFinite(width)?Math.round((current.x-course[0].x)/width)*width:0;
  const corners=course.slice(1,-1).map(p=>moved(p,lead)).map(p=>{const dx=frameShift(p),q=seaPoint(moved(p,dx));return q&&moved(q,-dx);}).filter(Boolean);
  for(const corner of corners){
    if(Math.hypot(corner.x-current.x,corner.z-current.z)<4)continue;
    const leg=localSafe(current,[corner])?{waypoints:[corner],target:corner}:localRoute(current,[corner]);
    if(!leg)continue;   // head for the next corner instead
    waypoints.push(...leg.waypoints);current=leg.target;clearance=Math.min(clearance,leg.clearance??2.1);
  }
  const last=localRoute(current,candidates);
  if(!last)return null;
  waypoints.push(...last.waypoints);clearance=Math.min(clearance,last.clearance??2.1);
  let a=from;
  for(const b of waypoints){if(!localSafe(a,[b],clearance))return null;a=b;}
  return {waypoints,target:last.target,clearance};
}
// A long trip that fails on the coarse course is not retried with the old whole-window search: across a whole
// country that search takes seconds and finds nothing the coarse course could not.
function planRoute(from,candidates){
  const long=planLongRoute(from,candidates);
  return long===undefined?localRoute(from,candidates):long;   // localRoute: targets across the seam are taken at their near copy
}
function circum(from){
  const ring=[];
  for(let k=0;k<28;k++){
    const angle=k/28*Math.PI*2,dx=Math.sin(angle),dz=-Math.cos(angle);
    for(let r=1;r<120;r+=.5){const x=dx*r,z=dz*r;if(!isLandAt(x,z)&&distanceToLand(x,z).km>=12){if(!ring.length||Math.hypot(ring.at(-1).x-x,ring.at(-1).z-z)>.5)ring.push({x,z});break;}}
  }
  if(ring.length<8)return null;
  let nearest=0,best=Infinity;ring.forEach((p,i)=>{const d=Math.hypot(p.x-from.x,p.z-from.z);if(d<best){best=d;nearest=i;}});
  const order=[...ring.slice(nearest),...ring.slice(0,nearest)],waypoints=[];let current=from;
  for(const target of [...order,order[0]]){
    const route=planSeaRoute(current,[target]);if(!route)return null;
    waypoints.push(...route.waypoints);current=route.target;
  }
  return {waypoints};
}
return {
  plan(from,place){stats={grids:0,gridCells:0,cacheHits:0};const start=performance.now();
    const inBounds=p=>p.x>=WORLD_BOUNDS.minX&&p.x<=WORLD_BOUNDS.maxX&&p.z>=WORLD_BOUNDS.minZ&&p.z<=WORLD_BOUNDS.maxZ;
    if(!inBounds(from)||!inBounds(place)||coast.isLand(from.x,from.z))return {route:null,clearanceKm:0,stats:{...stats,milliseconds:performance.now()-start}};
    const {candidates,clearanceKm}=place.destinations?.length?{candidates:place.destinations,clearanceKm:2.2}:seaCandidates(place.x,place.z,{coast,bounds:WORLD_BOUNDS,kmPerWorldUnitAt});
    const usable=candidates.filter(p=>coast.segmentClear(p,p,0,obstacles));
    let route=usable.length?planRoute(from,usable):null;
    if(!route&&place.fallbackDestinations?.length){
      const outer=place.fallbackDestinations.filter(p=>inBounds(p)&&coast.segmentClear(p,p,0,obstacles));
      if(outer.length)route=planRoute(from,outer);
    }
    return {route,clearanceKm:route?Math.min(5.5,coast.distance(route.target.x,route.target.z)):clearanceKm,stats:{...stats,milliseconds:performance.now()-start}};
  },
  circum(from){stats={grids:0,gridCells:0,cacheHits:0};const start=performance.now();const route=circum(from);return {route,clearanceKm:12,stats:{...stats,milliseconds:performance.now()-start}};},
  obstacle(point){obstacles.push({...point,radius:point.radius??.65});grids.clear();}
};
}
