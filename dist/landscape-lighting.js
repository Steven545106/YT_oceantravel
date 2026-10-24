import * as THREE from 'three';
import { onQualityChange, quality } from './quality.js';
import { setLandmarkEnvironment } from './landmark-models.js';

export function createLandscapeLighting({renderer,scene,directional,sky}) {
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate=false;
  directional.shadow.bias=-.00015;
  directional.shadow.normalBias=.008;
  directional.shadow.camera.near=.5;
  directional.shadow.camera.far=90;
  scene.add(directional.target);
  onQualityChange(q=>{
    directional.castShadow=q.shadows;
    directional.shadow.mapSize.set(q.shadowSize,q.shadowSize);
    if(directional.shadow.map) { directional.shadow.map.dispose(); directional.shadow.map=null; }
    renderer.shadowMap.needsUpdate=true;
  });
  const pmrem=new THREE.PMREMGenerator(renderer);
  const environmentScene=new THREE.Scene();
  environmentScene.add(sky.clone()); // Shared Sky material keeps sun direction and atmosphere in sync.
  let environment=null,lastBand='',lastShadow=-1;
  const target=new THREE.Vector3(),lastSun=new THREE.Vector3();
  return {
    update({camera,boat,sun,night,time,storm=0}) {
      // A small moving shadow volume concentrates resolution around the ship and nearby sights.
      directional.castShadow=quality.shadows&&!night&&sun.y>.06;
      if(directional.castShadow) {
        const radius=THREE.MathUtils.clamp(camera.position.y*1.1+8,10,22);
        const step=radius*2/quality.shadowSize;
        target.set(Math.round(boat.position.x/step)*step,.15,Math.round(boat.position.z/step)*step);
        directional.target.position.copy(target);
        directional.position.copy(target).addScaledVector(sun,36);
        const c=directional.shadow.camera;
        c.left=c.bottom=-radius;c.right=c.top=radius;c.updateProjectionMatrix();
        if(time-lastShadow>.12) {renderer.shadowMap.needsUpdate=true;lastShadow=time;}
      }
      const band=night?'night':sun.y<.25?'warm':'day';
      if(band!==lastBand||lastSun.dot(sun)<.995) {
        lastBand=band;lastSun.copy(sun);
        // Official ocean example: prefilter the actual sky, rather than a painted gradient.
        const next=pmrem.fromScene(environmentScene,0,.1,20000);
        scene.environment=next.texture;
        setLandmarkEnvironment(next.texture);
        environment?.dispose();environment=next;
      }
      scene.environmentIntensity=(night?.12:.8)*(1-storm*.45);
    }
  };
}
