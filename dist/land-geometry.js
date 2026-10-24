// Point-in-outline test for land islands ({ points: Float64Array [x, z, …], count, minZ, maxZ }), kept free of the
// browser so it can be unit-tested.
// Big outlines (Honshu has ~38,000 vertices) get their edges sorted into horizontal strips, so a point test only
// crosses the edges of its own strip instead of the whole coast; the result is identical to testing every edge.
const STRIP_EDGES = 8;
function edgeStrips(island) {
  const { points, count, minZ, maxZ } = island;
  const strips = Math.max(1, Math.ceil(count / STRIP_EDGES)), height = (maxZ - minZ) / strips || 1;
  const stripOf = (z) => Math.min(strips - 1, Math.max(0, Math.floor((z - minZ) / height)));
  const sizes = new Int32Array(strips + 1);
  const range = (i) => { const j = i ? i - 1 : count - 1, a = points[i * 2 + 1], b = points[j * 2 + 1]; return [stripOf(Math.min(a, b)), stripOf(Math.max(a, b))]; };
  for (let i = 0; i < count; i++) { const [lo, hi] = range(i); for (let k = lo; k <= hi; k++) sizes[k + 1]++; }
  for (let k = 0; k < strips; k++) sizes[k + 1] += sizes[k];
  const edges = new Int32Array(sizes[strips]), fill = sizes.slice(0, strips);
  for (let i = 0; i < count; i++) { const [lo, hi] = range(i); for (let k = lo; k <= hi; k++) edges[fill[k]++] = i; }
  return { stripOf, starts: sizes, edges };
}

export function pointInIsland(island, x, z) {
  const { points, count } = island;
  let inside = false;
  if (count < 64) {
    for (let i = 0, j = count - 1; i < count; j = i++) {
      const ax = points[i * 2], az = points[i * 2 + 1], bx = points[j * 2], bz = points[j * 2 + 1];
      if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
    }
    return inside;
  }
  const strips = island.strips ??= edgeStrips(island);
  const strip = strips.stripOf(z);
  for (let e = strips.starts[strip], end = strips.starts[strip + 1]; e < end; e++) {
    const i = strips.edges[e], j = i ? i - 1 : count - 1;
    const ax = points[i * 2], az = points[i * 2 + 1], bx = points[j * 2], bz = points[j * 2 + 1];
    if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
  }
  return inside;
}
