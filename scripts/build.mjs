import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
const args=['dist/ocean.js','dist/landmark-review.js','--bundle','--format=esm','--target=es2022','--minify',
  ...['png','jpg','webp','bin','glb'].map(ext=>`--loader:.${ext}=file`),
  '--asset-names=assets/[name]-[hash]','--public-path=./build','--outdir=dist/build','--entry-names=[name].bundle'];
let binary=process.env.ESBUILD_BINARY_PATH;
if(!binary) {
  const local=new URL('../node_modules/.bin/esbuild',import.meta.url);
  if(existsSync(local)) binary=local.pathname;
  else {
    const cache=join(homedir(),'.npm','_npx');
    if(existsSync(cache)) for(const entry of readdirSync(cache)) {
      const candidate=join(cache,entry,'node_modules','esbuild','bin','esbuild');
      if(existsSync(candidate)) {binary=candidate;break;}
    }
  }
}
rmSync(new URL('../dist/build/assets',import.meta.url),{recursive:true,force:true});   // drop assets no longer imported
const result=spawnSync(binary??'npx',binary?args:['--yes','esbuild',...args],{stdio:'inherit',cwd:new URL('..',import.meta.url)});
if(result.error)throw result.error;
if(result.status!==0)process.exit(result.status??1);
const path=new URL('../dist/index.html',import.meta.url);
const html=readFileSync(path,'utf8').replace(/ocean\.bundle\.js\?v=(\d+)/g,(_,v)=>`ocean.bundle.js?v=${Number(v)+1}`);
writeFileSync(path,html);
const reviewPath=new URL('../dist/landmark-review.html',import.meta.url);
writeFileSync(reviewPath,readFileSync(reviewPath,'utf8').replace(/landmark-review\.bundle\.js\?v=(\d+)/g,(_,v)=>`landmark-review.bundle.js?v=${Number(v)+1}`));
