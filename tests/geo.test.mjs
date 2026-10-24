import test from 'node:test';
import assert from 'node:assert/strict';
import { geoToWorld, worldToGeo, kmPerWorldUnitAt, TAIWAN_REFERENCE, WORLD_UNITS_PER_KM } from '../dist/geo.js';

const close = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} vs ${b}`);

test('reference point maps to the world origin', () => {
  const p = geoToWorld(TAIWAN_REFERENCE);
  close(p.x, 0, 1e-9); close(p.y, 0, 1e-9);
});

test('x is east and z is south', () => {
  assert.ok(geoToWorld({ latitude: 23.7, longitude: 122 }).x > 0);
  assert.ok(geoToWorld({ latitude: 25, longitude: 121 }).y < 0);
});

test('geoToWorld and worldToGeo round-trip', () => {
  for (const [latitude, longitude] of [[25.15, 121.77], [26.2, 127.7], [43.4, 142.8], [33.4, 126.5], [21.9, 120.85]]) {
    const p = geoToWorld({ latitude, longitude });
    const back = worldToGeo(p.x, p.y);
    close(back.latitude, latitude, 1e-9); close(back.longitude, longitude, 1e-9);
  }
});

test('one degree of longitude at the reference latitude is about 102 km', () => {
  const p = geoToWorld({ latitude: TAIWAN_REFERENCE.latitude, longitude: TAIWAN_REFERENCE.longitude + 1 });
  const km = p.x / WORLD_UNITS_PER_KM;
  close(km, 111.32 * Math.cos(23.7 * Math.PI / 180) * 1.0, 0.5);
});

test('kmPerWorldUnitAt converts stretched Mercator distances back to true km', () => {
  for (const latitude of [23.7, 35, 45]) {
    const a = geoToWorld({ latitude, longitude: 130 }), b = geoToWorld({ latitude, longitude: 131 });
    const realKm = 111.32 * Math.cos(latitude * Math.PI / 180);
    close((b.x - a.x) * kmPerWorldUnitAt(a.y), realKm, 0.6, `lat ${latitude}`);
  }
});
