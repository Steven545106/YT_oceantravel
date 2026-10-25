// Switching between a ship and the fighter keeps the place: the jet takes off above the boat, and the boat is put back
// on the sea where the jet was. Where that is no place for a boat (over land, or too near a shore) the nearest one is
// found instead: rings of `step` world units around it are searched outwards until `isOpenSea` holds. Testing for open
// water, not just "not land", matters: the first non-land point may be a river mouth or a lake, with land beyond it.
export function seaSpotNear(x, z, isOpenSea, { step = .25, maxRadius = 150, directions = 32 } = {}) {
  if (isOpenSea(x, z)) return { x, z, moved: false };
  for (let radius = step; radius <= maxRadius; radius += step) {
    for (let k = 0; k < directions; k++) {
      const angle = k / directions * Math.PI * 2;
      const px = x + Math.cos(angle) * radius, pz = z + Math.sin(angle) * radius;
      if (isOpenSea(px, pz)) return { x: px, z: pz, moved: true };
    }
  }
  return null;
}
