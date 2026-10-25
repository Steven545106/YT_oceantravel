import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
test('root files are only the local launchers, and both launch the relocated server',async(t)=>{
  const files=(await readdir(root,{withFileTypes:true})).filter(e=>e.isFile()&&!e.name.startsWith('.')).map(e=>e.name).sort();
  // the launchers are kept out of the repository (friends play on GitHub Pages), so a fresh checkout has none
  if(!files.length){t.skip('no local launchers in this checkout');return;}
  assert.deepEqual(files,['開始遊戲.bat','開始遊戲.command'].sort());
  const mac=await readFile(new URL('../開始遊戲.command',import.meta.url),'utf8');
  const win=await readFile(new URL('../開始遊戲.bat',import.meta.url),'utf8');
  assert.ok(mac.includes('python3 scripts/serve.py'));
  assert.ok(win.includes('py -3 scripts\\serve.py')&&win.includes('python scripts\\serve.py'));
  const shell=spawnSync('bash',['-n',fileURLToPath(new URL('../開始遊戲.command',import.meta.url))]);assert.equal(shell.status,0);
});
test('relocated server locates real assets outside the project working directory with correct MIME types',()=>{
  const server=new URL('../scripts/serve.py',import.meta.url).pathname;
  const result=spawnSync('python3',['-c',`
import importlib.util, os
spec=importlib.util.spec_from_file_location('game_server',${JSON.stringify(server)})
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
handler=m.Handler.__new__(m.Handler);handler.directory=m.ROOT
for path,mime in [('/index.html','text/html'),('/build/ocean.bundle.js','text/javascript'),('/Data/landmarks.json','application/json')]:
 asset=handler.translate_path(path)
 assert os.path.isfile(asset),asset
 assert handler.guess_type(asset)==mime
 assert os.path.commonpath([m.ROOT,asset])==m.ROOT

`],{cwd:'/tmp',encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
  assert.equal(result.status,0,result.stderr);
});
