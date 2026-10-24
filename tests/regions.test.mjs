import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {REGIONS,COUNTRIES,COUNTRY_ORDER,countryCode,countryName,exaggerationAt} from '../dist/regions.js';
const data=(path)=>new URL(`../dist/Data/${path}`,import.meta.url);
const readJson=async(path)=>JSON.parse(await readFile(data(path)));

test('registry lists the countries in unlock order with codes, names and places',async()=>{
  assert.deepEqual(COUNTRIES.map(c=>c.code),['tw','jp','kr','kp','cn','hk','mo','vn','ph','bn','my','id']);
  assert.deepEqual(COUNTRY_ORDER,['台灣','日本','韓國','北韓','中國','香港','澳門','越南','菲律賓','汶萊','馬來西亞','印尼']);
  assert.deepEqual(COUNTRIES.filter(c=>c.unlock?.includes('circumJapan')).map(c=>c.code),['kr','kp','cn','hk','mo','vn']);
  assert.equal(countryCode('日本'),'jp');assert.equal(countryCode('kp'),'kp');assert.equal(countryName('ph'),'菲律賓');
  assert.equal(exaggerationAt(23.5,121),1.9);assert.equal(exaggerationAt(35,139),1.15);assert.equal(exaggerationAt(24.9,118.6),1.15);
  for(const country of COUNTRIES)assert.ok((await readJson(country.places)).places.length>=(["mo","bn"].includes(country.code)?20:100),country.code);
});

test('every coast chunk has a full-detail file, and the outline layer is a much lighter subset',async()=>{
  const outline=await readJson(REGIONS.coast.outline);
  assert.equal(outline.chunks.length,REGIONS.coast.chunks.length);
  let rough=0,detailed=0;
  for(const chunk of REGIONS.coast.chunks){
    const detail=await readJson(chunk.file),layer=outline.chunks.find(entry=>entry.id===chunk.id);
    assert.equal(detail.polys.length,chunk.islands,chunk.id);
    assert.ok(layer.polys.length<=chunk.islands,chunk.id);
    for(const list of [detail.cut,layer.cut])for(const i of list)assert.ok(Number.isInteger(i)&&i>=0,chunk.id);
    rough+=layer.polys.reduce((n,p)=>n+p.length,0);detailed+=detail.polys.reduce((n,p)=>n+p.length,0);
  }
  assert.ok(rough<detailed/10,'the always-loaded outline layer is far lighter than full detail');
});

test('heightmap tiles exist and lie inside the overview',async()=>{
  const [lon0,lat0,lon1,lat1]=REGIONS.dem.overview.bounds;
  await stat(data(REGIONS.dem.overview.file));
  assert.ok(REGIONS.dem.tiles.length>50);
  for(const tile of REGIONS.dem.tiles){
    await stat(data(tile.file));
    const [a,b,c,d]=tile.bounds;
    assert.ok(a>=lon0&&b>=lat0&&c<=lon1&&d<=lat1&&a<c&&b<d,tile.file);
  }
});
