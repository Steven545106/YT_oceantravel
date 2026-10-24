import test from 'node:test';
import assert from 'node:assert/strict';
import {pointInIsland} from '../dist/land-geometry.js';

const island=(xy)=>{const points=Float64Array.from(xy),count=xy.length/2;let minZ=Infinity,maxZ=-Infinity;for(let i=1;i<xy.length;i+=2){minZ=Math.min(minZ,xy[i]);maxZ=Math.max(maxZ,xy[i]);}return {points,count,minZ,maxZ};};
const everyEdge=({points,count},x,z)=>{let inside=false;for(let i=0,j=count-1;i<count;j=i++){const ax=points[i*2],az=points[i*2+1],bx=points[j*2],bz=points[j*2+1];if((az>z)!==(bz>z)&&x<(bx-ax)*(z-az)/(bz-az)+ax)inside=!inside;}return inside;};

test('strip-indexed point test matches testing every edge on a large jagged outline',()=>{
  const xy=[];let seed=7;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  for(let i=0;i<5000;i++){const a=i/5000*Math.PI*2,r=10+3*Math.sin(a*37)+random()*1.5;xy.push(Math.cos(a)*r,Math.sin(a)*r*1.6);}
  const shape=island(xy);
  for(let k=0;k<20000;k++){const x=(random()-.5)*30,z=(random()-.5)*48;assert.equal(pointInIsland(shape,x,z),everyEdge(shape,x,z),`${x},${z}`);}
  assert.ok(shape.strips,'large outlines build their strip index');
});

test('small outlines and points on the outline bounds behave as before',()=>{
  const square=island([0,0,4,0,4,4,0,4]);
  assert.equal(pointInIsland(square,2,2),true);assert.equal(pointInIsland(square,5,2),false);
  // the same square traced with 200 vertices, so it takes the strip-indexed path
  const xy=[];for(let k=0;k<50;k++)xy.push(k*.08,0);for(let k=0;k<50;k++)xy.push(4,k*.08);for(let k=0;k<50;k++)xy.push(4-k*.08,4);for(let k=0;k<50;k++)xy.push(0,4-k*.08);
  const big=island(xy);
  assert.equal(pointInIsland(big,2,2),true);assert.equal(pointInIsland(big,5,2),false);
  for(const [x,z] of [[2,0],[2,4],[1,2],[3.99,3.99]])assert.equal(pointInIsland(big,x,z),everyEdge(big,x,z));
});
