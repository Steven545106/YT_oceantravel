// Hand steering may not head straight for a coast once within `limitKm` of it. Moves that keep the distance or open it
// always go through; a move that closes in has its part towards the nearest coast point removed, so the boat slides
// along the shore. The slide is judged only against where the boat is now, never against how close it once was: in a
// harbour or a narrow channel the way out often passes nearer some other shore, and remembering the closest distance
// reached left boats unable to leave. A slide stops only where it would touch land or an obstacle, or come within
// `floorKm` of the coast.
export function limitShoreMove(previous, next, { distanceKm, coastPoint, blocked = () => false, limitKm, floorKm }) {
  const before = distanceKm(previous.x, previous.z), after = distanceKm(next.x, next.z);
  if (after >= limitKm || after >= before) return { x: next.x, z: next.z, limited: false, stopped: false };
  const coast = coastPoint(previous.x, previous.z);
  let nx = previous.x - coast.x, nz = previous.z - coast.z;
  const length = Math.hypot(nx, nz) || 1;
  nx /= length; nz /= length;
  const moveX = next.x - previous.x, moveZ = next.z - previous.z;
  const inward = Math.min(0, moveX * nx + moveZ * nz);
  const slid = { x: previous.x + moveX - inward * nx, z: previous.z + moveZ - inward * nz };
  if (blocked(previous, slid) || distanceKm(slid.x, slid.z) < Math.min(floorKm, before)) {
    return { x: previous.x, z: previous.z, limited: true, stopped: true };
  }
  return { x: slid.x, z: slid.z, limited: true, stopped: false };
}
