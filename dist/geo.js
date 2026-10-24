import * as THREE from 'three';

// WGS84 coordinates are the source of truth. One scene unit represents four km,
// keeping Taiwan visible without pretending that the ship itself is kilometres long.
export const TAIWAN_REFERENCE = { latitude: 23.70, longitude: 121.00 };
export const WORLD_UNITS_PER_KM = .25;
// Web-Mercator-style projection, scaled to be true at Taiwan's reference
// latitude. A plain equirectangular grid would stretch Hokkaido's width by a
// quarter at 45 deg N, whereas this keeps every island's real shape.
export const EARTH_RADIUS_KM = 6378.137;
export const MERCATOR_SCALE = Math.cos(THREE.MathUtils.degToRad(TAIWAN_REFERENCE.latitude));
export const WORLD_UNITS_PER_RADIAN = EARTH_RADIUS_KM * MERCATOR_SCALE * WORLD_UNITS_PER_KM;
export const mercatorY = (latitude) => Math.log(Math.tan(Math.PI / 4 + THREE.MathUtils.degToRad(latitude) / 2));
export const REFERENCE_MERCATOR_Y = mercatorY(TAIWAN_REFERENCE.latitude);
// Eluanbi Lighthouse (Pingtung) and the default start: about 5 km from the nearest shore (south-southeast of it), bow pointing at the lighthouse.
export const ELUANBI_LIGHTHOUSE = { latitude: 21.902250, longitude: 120.852667 };
export const ELUANBI_OFFSHORE_START = { latitude: 21.8423, longitude: 120.8761 };   // about 6 km off the lighthouse, outside the 5 km limit

// The world wraps round east-west. Longitudes are laid out from the seam meridian (in the Bering Sea, on a 2° chunk
// boundary; the same value is `world.seamLongitude` in scripts/source-data/regions.source.json) eastwards for 360°, so
// x runs from WORLD_MIN_X to WORLD_MAX_X; a vehicle leaving one end comes back in at the other (wrapWorldX), and land
// near the seam is also kept as a copy one world width away so the far side is there before you cross.
export const SEAM_LONGITUDE = -168;
export const WORLD_WIDTH = 2 * Math.PI * WORLD_UNITS_PER_RADIAN;
export const WORLD_MIN_X = THREE.MathUtils.degToRad(SEAM_LONGITUDE - TAIWAN_REFERENCE.longitude) * WORLD_UNITS_PER_RADIAN;
export const WORLD_MAX_X = WORLD_MIN_X + WORLD_WIDTH;
// a longitude in the world's frame: [SEAM_LONGITUDE, SEAM_LONGITUDE + 360)
export const frameLongitude = (longitude) => SEAM_LONGITUDE + ((((longitude - SEAM_LONGITUDE) % 360) + 360) % 360);
// an x moved by whole world widths into [WORLD_MIN_X, WORLD_MAX_X)
export const wrapWorldX = (x) => WORLD_MIN_X + ((((x - WORLD_MIN_X) % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH);

// `wrap: false` keeps the longitude as given (for the copies of land beyond the seam).
export function geoToWorld({ latitude, longitude }, wrap = true) {
  return new THREE.Vector2(
    THREE.MathUtils.degToRad((wrap ? frameLongitude(longitude) : longitude) - TAIWAN_REFERENCE.longitude) * WORLD_UNITS_PER_RADIAN,
    -(mercatorY(latitude) - REFERENCE_MERCATOR_Y) * WORLD_UNITS_PER_RADIAN
  );
}

// Longitude comes back in (-180, 180], wherever x is.
export function worldToGeo(x, z) {
  const longitude = TAIWAN_REFERENCE.longitude + THREE.MathUtils.radToDeg(x / WORLD_UNITS_PER_RADIAN);
  return {
    latitude: THREE.MathUtils.radToDeg(2 * Math.atan(Math.exp(REFERENCE_MERCATOR_Y - z / WORLD_UNITS_PER_RADIAN)) - Math.PI / 2),
    longitude: 180 - ((((180 - longitude) % 360) + 360) % 360)
  };
}

// Mercator stretches distances away from the reference latitude, so convert
// world-space distances back to true kilometres using the local latitude.
export function kmPerWorldUnitAt(z) {
  const latitude = worldToGeo(0, z).latitude;
  return Math.cos(THREE.MathUtils.degToRad(latitude)) / (MERCATOR_SCALE * WORLD_UNITS_PER_KM);
}

