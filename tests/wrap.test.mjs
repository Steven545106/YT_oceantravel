import test from 'node:test';
import assert from 'node:assert/strict';
import {SEAM_LONGITUDE,WORLD_MIN_X,WORLD_MAX_X,WORLD_WIDTH,geoToWorld,worldToGeo,wrapWorldX,frameLongitude} from '../dist/geo.js';
import {findGridPath,smoothGridPath,gridCellOf} from '../dist/nav-grid.js';
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

test('a wrapping grid finds the way round through its seam and keeps the course continuous',()=>{
  const cols=10,rows=3,blocked=new Uint8Array(cols*rows);
  for(let j=0;j<rows;j++)blocked[j*cols+5]=1;   // a wall in the middle: the only way from column 2 to 8 is west, over the seam
  const grid={cols,rows,cell:1,minX:0,minZ:0,blocked,near:new Uint8Array(cols*rows),wrap:true};
  const cells=findGridPath(grid,{i:2,j:1},{i:8,j:1});
  assert.ok(cells,'path found');
  assert.ok(cells.every(c=>c.i!==5));
  const course=smoothGridPath(grid,cells);
  assert.ok(course.at(-1).x<0,'the course goes on past the west edge instead of jumping east');
  for(let k=1;k<course.length;k++)assert.ok(Math.abs(course[k].x-course[k-1].x)<=cols/2);
  assert.deepEqual(gridCellOf(grid,-1.5,1.5),{i:8,j:1});
  assert.equal(findGridPath({...grid,wrap:false},{i:2,j:1},{i:8,j:1}),null);
});
