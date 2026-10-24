// Original project asset. Rebuild with: node scripts/build-coastal-model.mjs
import * as THREE from '../node_modules/three/build/three.module.js';
import { GLTFExporter } from '../node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import { writeFile } from 'node:fs/promises';
// GLTFExporter uses FileReader in browsers; Node's Blob already provides arrayBuffer.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(result=>{this.result=result; this.onloadend?.();}); }
};
const geometry=new THREE.IcosahedronGeometry(1,4);
const position=geometry.attributes.position;
const colours=[];
for(let i=0;i<position.count;i++) {
  const x=position.getX(i),y=position.getY(i),z=position.getZ(i);
  const erosion=1+.09*Math.sin(x*17+z*9)*Math.cos(y*14)+.055*Math.sin(z*29+y*19);
  const ledge=Math.sin(y*22+x*2)*.025;
  position.setXYZ(i,x*erosion*(1+ledge),y*.65*erosion,z*.82*erosion);
  const tone=.72+.13*Math.sin(y*22+x*2)+.07*Math.cos(x*19+z*13);
  const c=new THREE.Color(0xa89d84).multiplyScalar(tone);
  colours.push(c.r,c.g,c.b);
}
geometry.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));
geometry.computeVertexNormals();
const rock=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.94,metalness:0}));
rock.name='Eluanbi weathered limestone — original procedural asset';
const exporter=new GLTFExporter();
const data=await exporter.parseAsync(rock,{binary:true});
await writeFile(new URL('../dist/Data/coastal-limestone.glb',import.meta.url),Buffer.from(data));
console.log(`coastal-limestone.glb: ${data.byteLength} bytes`);
