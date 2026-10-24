import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {REGIONS,COUNTRIES,COUNTRY_ORDER,countryCode,countryName,exaggerationAt} from '../dist/regions.js';
const data=(path)=>new URL(`../dist/Data/${path}`,import.meta.url);
const readJson=async(path)=>JSON.parse(await readFile(data(path)));

test('registry lists the countries in unlock order with codes, names and places',async()=>{
  assert.deepEqual(COUNTRIES.map(c=>c.code),['tw','jp','kr','kp','cn','hk','mo','vn','ph']);
  assert.deepEqual(COUNTRY_ORDER,['台灣','日本','韓國','北韓','中國','香港','澳門','越南','菲律賓']);
  assert.deepEqual(COUNTRIES.filter(c=>c.unlock?.includes('circumJapan')).map(c=>c.code),['kr','kp','cn','hk','mo','vn']);
  assert.equal(countryCode('日本'),'jp');assert.equal(countryCode('kp'),'kp');assert.equal(countryName('ph'),'菲律賓');
  assert.equal(exaggerationAt(23.5,121),1.9);assert.equal(exaggerationAt(35,139),1.15);assert.equal(exaggerationAt(24.9,118.6),1.15);
  for(const country of COUNTRIES)assert.ok((await readJson(country.places)).places.length>=(country.code==="mo"?20:100),country.code);
});

test('every coast chunk has a full-detail file matching its simplified outlines',async()=>{
  const base=await readJson(REGIONS.coast.base);
  assert.equal(base.chunks.length,REGIONS.coast.chunks.length);
  let simplified=0,detailed=0;
  for(const chunk of REGIONS.coast.chunks){
    const detail=await readJson(chunk.file),outline=base.chunks.find(entry=>entry.id===chunk.id);
    assert.equal(detail.polys.length,chunk.islands,chunk.id);
    assert.equal(outline.polys.length,chunk.islands,chunk.id);
    for(let i=0;i<detail.polys.length;i++){
      assert.ok(outline.polys[i].length>=6&&outline.polys[i].length<=detail.polys[i].length,`${chunk.id}#${i}`);
      simplified+=outline.polys[i].length;detailed+=detail.polys[i].length;
    }
  }
  assert.ok(simplified<detailed/3,'the always-loaded outlines are much lighter than full detail');
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
