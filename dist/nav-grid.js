// Pure grid-search helpers for the autopilot (no DOM or three.js, so they can be unit tested).
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// A grid with `wrap` set joins its east and west edges (the world grid); its columns are taken modulo `cols`.
const wrapColumn = (grid, i) => grid.wrap ? ((i % grid.cols) + grid.cols) % grid.cols : i;
export const gridCellOf = (grid, x, z) => ({
  i: grid.wrap ? wrapColumn(grid, Math.floor((x - grid.minX) / grid.cell)) : clamp(Math.floor((x - grid.minX) / grid.cell), 0, grid.cols - 1),
  j: clamp(Math.floor((z - grid.minZ) / grid.cell), 0, grid.rows - 1)
});
export const gridCenterOf = (grid, i, j) => ({ x: grid.minX + (i + .5) * grid.cell, z: grid.minZ + (j + .5) * grid.cell });

export function nearestFreeCell(grid, i, j) {
  for (let radius = 0; radius < 80; radius++) {
    let best = null, bestD = Infinity;
    for (let dj = -radius; dj <= radius; dj++) {
      for (let di = -radius; di <= radius; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== radius) continue;
        const ni = wrapColumn(grid, i + di), nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= grid.cols || nj >= grid.rows || grid.blocked[nj * grid.cols + ni]) continue;
        const d = di * di + dj * dj;
        if (d < bestD) { bestD = d; best = { i: ni, j: nj }; }
      }
    }
    if (best) return best;
  }
  return null;
}

export function findGridPath(grid, start, goal, partial = false) {
  const { cols, rows, blocked, near } = grid;
  const total = cols * rows;
  const cost = new Float32Array(total).fill(Infinity);
  const parent = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);
  const heapNodes = [], heapKeys = [];
  const push = (node, key) => {
    let child = heapNodes.length;
    heapNodes.push(node); heapKeys.push(key);
    while (child > 0) {
      const up = (child - 1) >> 1;
      if (heapKeys[up] <= key) break;
      heapNodes[child] = heapNodes[up]; heapKeys[child] = heapKeys[up]; child = up;
    }
    heapNodes[child] = node; heapKeys[child] = key;
  };
  const pop = () => {
    const top = heapNodes[0];
    const lastNode = heapNodes.pop(), lastKey = heapKeys.pop();
    const size = heapNodes.length;
    if (size) {
      let hole = 0;
      for (;;) {
        let child = hole * 2 + 1;
        if (child >= size) break;
        if (child + 1 < size && heapKeys[child + 1] < heapKeys[child]) child++;
        if (heapKeys[child] >= lastKey) break;
        heapNodes[hole] = heapNodes[child]; heapKeys[hole] = heapKeys[child]; hole = child;
      }
      heapNodes[hole] = lastNode; heapKeys[hole] = lastKey;
    }
    return top;
  };
  const goalIndex = goal.j * cols + goal.i;
  const heuristic = (index) => {
    let dx = Math.abs((index % cols) - goal.i);
    if (grid.wrap) dx = Math.min(dx, cols - dx);
    const dz = Math.abs(Math.floor(index / cols) - goal.j);
    return dx + dz - .5858 * Math.min(dx, dz);
  };
  const startIndex = start.j * cols + start.i;
  cost[startIndex] = 0;
  push(startIndex, heuristic(startIndex));
  let closestIndex = startIndex, closestEstimate = heuristic(startIndex);
  while (heapNodes.length) {
    const index = pop();
    if (closed[index]) continue;
    closed[index] = 1;
    if (partial) {
      const estimate = heuristic(index);
      if (estimate < closestEstimate) { closestEstimate = estimate; closestIndex = index; }
    }
    if (index === goalIndex) break;
    const ci = index % cols, cj = (index - ci) / cols;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = wrapColumn(grid, ci + di), nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
        const next = nj * cols + ni;
        if (blocked[next] || closed[next]) continue;
        if (di && dj && (blocked[cj * cols + ni] || blocked[nj * cols + ci])) continue;
        const stepCost = (di && dj ? 1.4142 : 1) * (near[next] ? 3 : 1);
        const through = cost[index] + stepCost;
        if (through < cost[next]) {
          cost[next] = through;
          parent[next] = index;
          push(next, through + heuristic(next) * 1.05);
        }
      }
    }
  }
  if (!closed[goalIndex] && !partial) return null;
  const path = [];
  for (let index = closed[goalIndex] ? goalIndex : closestIndex; index !== -1; index = parent[index]) {
    const i = index % cols;
    path.push({ i, j: (index - i) / cols });
  }
  return path.reverse();
}

export function gridLineClear(grid,a,b) {
  // Supercover traversal: check every touched cell, including both sides of a diagonal corner.
  const ax=(a.x-grid.minX)/grid.cell,az=(a.z-grid.minZ)/grid.cell;
  const bx=(b.x-grid.minX)/grid.cell,bz=(b.z-grid.minZ)/grid.cell;
  const open=(i,j)=>{i=wrapColumn(grid,i);return i>=0&&j>=0&&i<grid.cols&&j<grid.rows&&!grid.blocked[j*grid.cols+i];};
  let i=Math.floor(ax),j=Math.floor(az);const endI=Math.floor(bx),endJ=Math.floor(bz);
  if(!open(i,j)||!open(endI,endJ))return false;
  const dx=bx-ax,dz=bz-az,sx=Math.sign(dx),sz=Math.sign(dz);
  const stepX=dx?Math.abs(1/dx):Infinity,stepZ=dz?Math.abs(1/dz):Infinity;
  let tx=dx?(sx>0?i+1-ax:ax-i)*stepX:Infinity;
  let tz=dz?(sz>0?j+1-az:az-j)*stepZ:Infinity;
  const boundaryX=!dx&&Math.abs(ax-Math.round(ax))<1e-10;
  const boundaryZ=!dz&&Math.abs(az-Math.round(az))<1e-10;
  for(let n=0;n<=grid.cols+grid.rows+2;n++){
    if(!open(i,j)||(boundaryX&&!open(i-1,j))||(boundaryZ&&!open(i,j-1)))return false;
    if(i===endI&&j===endJ)return true;
    if(Math.abs(tx-tz)<1e-10){if(!open(i+sx,j)||!open(i,j+sz))return false;i+=sx;j+=sz;tx+=stepX;tz+=stepZ;}
    else if(tx<tz){i+=sx;tx+=stepX;}else{j+=sz;tz+=stepZ;}
  }
  return false;
}


// Cut corners along a grid path wherever the straight line between two points stays in open water.
export function smoothGridPath(grid, cells) {
  const points = cells.map(({ i, j }) => gridCenterOf(grid, i, j));
  // across a wrapping grid's seam, keep x continuous (one world width further on) so the course does not jump back
  if (grid.wrap) for (let k = 1; k < points.length; k++) {
    const width = grid.cols * grid.cell, dx = points[k].x - points[k - 1].x;
    if (Math.abs(dx) > width / 2) points[k] = { x: points[k].x - Math.sign(dx) * width, z: points[k].z };
  }
  const smoothed = [points[0]];
  for (let from = 0; from < points.length - 1;) {
    let to = Math.min(points.length - 1, from + 250);
    while (to > from + 1 && !gridLineClear(grid, points[from], points[to])) to--;
    smoothed.push(points[to]);
    from = to;
  }
  return smoothed;
}


export function formatDuration(totalSeconds) {
  const seconds = Math.max(1, Math.round(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return `${seconds} 秒`;
  return `${minutes} 分 ${String(seconds % 60).padStart(2, '0')} 秒`;
}
