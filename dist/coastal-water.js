import * as THREE from 'three';
import { quality } from './quality.js';

// Local coastline mask: two small texture reads, no second water surface or z-fighting.
export function createCoastalWater(water, islands) {
  const canvas=document.createElement('canvas'); canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d');
  const texture=new THREE.CanvasTexture(canvas); texture.flipY=false;
  texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;
  const origin=new THREE.Vector2(1e9,1e9),span=16;
  Object.assign(water.material.uniforms,{coastMask:{value:texture},coastOrigin:{value:origin},coastSpan:{value:span},coastLight:{value:1}});
  water.material.fragmentShader='uniform sampler2D coastMask; uniform vec2 coastOrigin; uniform float coastSpan; uniform float coastLight;\n'+water.material.fragmentShader;
  water.material.fragmentShader=water.material.fragmentShader.replace('vec3 outgoingLight = albedo;', `
    vec2 coastUv=(worldPosition.xz-coastOrigin)/coastSpan;
    float inside=step(0.0,coastUv.x)*step(0.0,coastUv.y)*step(coastUv.x,1.0)*step(coastUv.y,1.0);
    float coast=texture2D(coastMask,clamp(coastUv,0.0,1.0)).r*inside;
    float shallow=smoothstep(.015,.58,coast)*coastLight;
    vec3 outgoingLight = mix(albedo,albedo*vec3(.68,1.18,1.08)+vec3(.015,.065,.055),shallow*.42);
    float foam=pow(max(0.0,sin(coast*45.0-time*8.0+noise.x*4.0)),10.0)*smoothstep(.15,.6,coast)*(1.0-smoothstep(.7,.95,coast));
    outgoingLight+=vec3(.16,.19,.17)*foam*coastLight;
  `);
  water.material.needsUpdate=true;
  let centreX=Infinity,centreZ=Infinity;
  return {update(camera,night,storm=0) {
    water.material.uniforms.coastLight.value=quality.level==='low'?0:(night?.08:1)*(1-storm*.6);
    if(quality.level==='low'||Math.hypot(camera.position.x-centreX,camera.position.z-centreZ)<1)return;
    centreX=camera.position.x;centreZ=camera.position.z;
    origin.set(Math.floor((centreX-span/2)*16)/16,Math.floor((centreZ-span/2)*16)/16);
    ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#000';ctx.fillRect(0,0,256,256);
    ctx.save();ctx.scale(256/span,256/span);ctx.translate(-origin.x,-origin.y);
    ctx.fillStyle='#fff';ctx.shadowColor='#fff';ctx.shadowBlur=5;
    ctx.beginPath();
    for(const island of islands) {
      if(island.maxX<origin.x-.5||island.minX>origin.x+span+.5||island.maxZ<origin.y-.5||island.minZ>origin.y+span+.5)continue;
      for(let i=0;i<island.count;i++) {const x=island.points[i*2],z=island.points[i*2+1];if(i)ctx.lineTo(x,z);else ctx.moveTo(x,z);}ctx.closePath();
    }
    ctx.fill();ctx.restore();texture.needsUpdate=true;
  }};
}
