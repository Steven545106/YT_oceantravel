import test from 'node:test';
import assert from 'node:assert/strict';
import {SEAM_LONGITUDE,WORLD_MIN_X,WORLD_MAX_X,WORLD_WIDTH,geoToWorld,worldToGeo,wrapWorldX,frameLongitude} from '../dist/geo.js';
import {REGIONS} from '../dist/regions.js';

test('the world frame starts at the seam meridian and wraps one world width round',()=>{
  assert.equal(REGIONS.world.seamLongitude,SEAM_LONGITUDE);
  assert.ok(Math.abs(geoToWorld({latitude:0,longitude:SEAM_LONGITUDE}).x-WORLD_MIN_X)<1e-9);
  assert.ok(Math.abs(WORLD_MAX_X-WORLD_MIN_X-WORLD_WIDTH)<1e-9);
  // just west of the seam is the far east end of the frame
  assert.ok(geoToWorld({latitude:0,longitude:SEAM_LONGITUDE-1}).x>WORLD_MAX_X-WORLD_WIDTH/300);
  assert.equal(frameLongitude(-180),180);
  for(const lon of [121,0,-75,179.5,-179.5]){
    const p=geoToWorld({latitude:10,longitude:lon});
    assert.ok(Math.abs(worldToGeo(p.x,p.y).longitude-lon)<1e-9,String(lon));
    assert.ok(Math.abs(worldToGeo(p.x+WORLD_WIDTH,p.y).longitude-lon)<1e-9,'a copy one width over is the same place');
  }
  assert.ok(Math.abs(wrapWorldX(WORLD_MAX_X+5)-(WORLD_MIN_X+5))<1e-9);
  assert.ok(Math.abs(wrapWorldX(WORLD_MIN_X-5)-(WORLD_MAX_X-5))<1e-9);
});

