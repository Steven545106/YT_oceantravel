import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import rockUrl from './Data/coastal-limestone.glb';
import { geoToWorld } from './geo.js';
import { quality } from './quality.js';

// One original GLB is shared by all coastal rocks. No external model service or licence dependency.
export function createCapeScenery({ scene, reflectionExclusions, heightAt, isOnLand }) {
  const origin=geoToWorld({latitude:21.902250,longitude:120.852667});
  const group=new THREE.Group(); group.name='鵝鑾鼻・石灰岩岸與海岸林';
  group.position.set(origin.x,0,origin.y); scene.add(group); reflectionExclusions.push(group);
  let rocks=null, loaded=false;
  const dummy=new THREE.Object3D(), colour=new THREE.Color();
  const foliage=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.96}),64);
  const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.008,.013,.10,6),new THREE.MeshStandardMaterial({color:0x665443,roughness:1}),64);
  const shrubs=[];
  for(let i=0;i<64;i++) {
    const angle=i*2.399963, r=.72+((i*13)%29)/29*.72;
    const x=Math.cos(angle)*r,z=Math.sin(angle)*r;
    if(!isOnLand(origin.x+x,origin.y+z)) continue;
    const y=heightAt(origin.x+x,origin.y+z);
    // Keep the lighthouse compound open and readable.
    shrubs.push({x,y,z,scale:.065+((i*7)%11)*.005});
  }
  for(let i=0;i<shrubs.length;i++) {
    const s=shrubs[i]; dummy.position.set(s.x,s.y+.12,s.z); dummy.scale.set(s.scale*1.3,s.scale,s.scale); dummy.rotation.set(0,i*.7,.08*Math.sin(i)); dummy.updateMatrix(); foliage.setMatrixAt(i,dummy.matrix);
    colour.setHex(i%3?0x476b3d:0x667e49); foliage.setColorAt(i,colour);
    dummy.position.y=s.y+.05; dummy.scale.set(1,1,1); dummy.updateMatrix(); trunks.setMatrixAt(i,dummy.matrix);
  }
  foliage.count=trunks.count=shrubs.length; foliage.instanceMatrix.needsUpdate=trunks.instanceMatrix.needsUpdate=true;
  foliage.receiveShadow=trunks.receiveShadow=true;
  foliage.computeBoundingSphere(); trunks.computeBoundingSphere(); group.add(foliage,trunks);
  const loader=new GLTFLoader();
  async function loadRocks() {
    try {
      const gltf=await loader.loadAsync(rockUrl);
      let source; gltf.scene.traverse(o=>{if(o.isMesh)source=o;});
      if(!source) throw new Error('GLB contains no mesh');
      rocks=new THREE.InstancedMesh(source.geometry,source.material,72); rocks.name='GLB・風化石灰岩（實例化）';
      for(let i=0;i<72;i++) {
        const angle=i/72*Math.PI*2;
        const radius=.92+.23*Math.sin(i*1.7);
        const x=Math.cos(angle)*radius-.18,z=Math.sin(angle)*radius-.20;
        const onLand=isOnLand(origin.x+x,origin.y+z);
        const ground=onLand?heightAt(origin.x+x,origin.y+z):.015;
        const s=.055+((i*17)%13)/13*.09;
        dummy.position.set(x,Math.min(ground,.16)-.025,z);
        dummy.rotation.set(.15*Math.sin(i),i*1.31,.12*Math.cos(i)); dummy.scale.set(s*1.4,s*.8,s); dummy.updateMatrix(); rocks.setMatrixAt(i,dummy.matrix);
        colour.setHex(i%4?0xb4aa91:0x8c8b76); rocks.setColorAt(i,colour);
      }
      rocks.instanceMatrix.needsUpdate=true; rocks.receiveShadow=true; rocks.computeBoundingSphere(); group.add(rocks); loaded=true;
    } catch(error) { console.warn('岩岸 GLB 載入失敗，保留程序地景',error); }
  }
  // Safe procedural stand-in also provides a coastline while the asset is in flight.
  const fallback=new THREE.Mesh(new THREE.IcosahedronGeometry(1,2),new THREE.MeshStandardMaterial({color:0x979681,roughness:1}));
  fallback.position.set(-.3,-.11,-.3); fallback.scale.set(1.1,.16,.9); group.add(fallback);
  void loadRocks();
  return {
    group,
    update(camera,night) {
      const distance=Math.hypot(camera.position.x-origin.x,camera.position.z-origin.y,camera.position.y);
      group.visible=distance<55;
      if(!group.visible)return;
      foliage.count=Math.ceil(shrubs.length*quality.scenery); trunks.count=foliage.count;
      if(rocks) { rocks.count=Math.ceil(72*quality.scenery); rocks.castShadow=quality.shadows&&!night&&distance<14; }
      foliage.castShadow=trunks.castShadow=quality.shadows&&!night&&distance<14;
      fallback.visible=!loaded;
    }
  };
}
