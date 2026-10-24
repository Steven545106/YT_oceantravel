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

export function geoToWorld({ latitude, longitude }) {
  return new THREE.Vector2(
    THREE.MathUtils.degToRad(longitude - TAIWAN_REFERENCE.longitude) * WORLD_UNITS_PER_RADIAN,
    -(mercatorY(latitude) - REFERENCE_MERCATOR_Y) * WORLD_UNITS_PER_RADIAN
  );
}

export function worldToGeo(x, z) {
  return {
    latitude: THREE.MathUtils.radToDeg(2 * Math.atan(Math.exp(REFERENCE_MERCATOR_Y - z / WORLD_UNITS_PER_RADIAN)) - Math.PI / 2),
    longitude: TAIWAN_REFERENCE.longitude + THREE.MathUtils.radToDeg(x / WORLD_UNITS_PER_RADIAN)
  };
}

// Mercator stretches distances away from the reference latitude, so convert
// world-space distances back to true kilometres using the local latitude.
export function kmPerWorldUnitAt(z) {
  const latitude = worldToGeo(0, z).latitude;
  return Math.cos(THREE.MathUtils.degToRad(latitude)) / (MERCATOR_SCALE * WORLD_UNITS_PER_KM);
}

