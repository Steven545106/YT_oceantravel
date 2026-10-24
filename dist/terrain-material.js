import * as THREE from 'three';

// World-space procedural layers stay continuous across tile and LOD boundaries.
// No satellite imagery: relief remains the source of truth, microdetail is decorative.
export function createTerrainMaterial() {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .94, metalness: 0, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = 'attribute float coastWeight; varying vec3 vTerrainPosition; varying vec3 vTerrainNormal; varying float vCoastWeight;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vTerrainPosition = (modelMatrix * vec4(position, 1.0)).xyz;
      vTerrainNormal = normalize(mat3(modelMatrix) * normal);
      vCoastWeight = coastWeight;`);
    shader.fragmentShader = `varying vec3 vTerrainPosition; varying vec3 vTerrainNormal; varying float vCoastWeight;
      float terrainHash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float terrainNoise(vec2 p) { vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(terrainHash(i),terrainHash(i+vec2(1,0)),f.x),mix(terrainHash(i+vec2(0,1)),terrainHash(i+vec2(1,1)),f.x),f.y); }
      ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float slope = 1.0 - abs(normalize(vTerrainNormal).y);
      float broad = terrainNoise(vTerrainPosition.xz * 3.5);
      float grain = terrainNoise(vTerrainPosition.xz * 90.0);
      float rock = smoothstep(.10, .48, slope + (broad-.5)*.14);
      vec3 rockColour = mix(vec3(.22,.24,.21), vec3(.42,.40,.33), broad);
      diffuseColor.rgb = mix(diffuseColor.rgb, rockColour, rock * .84);
      diffuseColor.rgb *= .88 + broad*.19 + grain*.09;
      float shore = vCoastWeight * (1.0-smoothstep(.055,.15,vTerrainPosition.y));
      vec3 sand = mix(vec3(.29,.28,.22),vec3(.60,.55,.38),smoothstep(.025,.09,vTerrainPosition.y));
      diffuseColor.rgb = mix(diffuseColor.rgb, mix(sand,rockColour,rock),shore*.88);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      // Attenuate the grain below pixel size to avoid glittering in distant hills.
      float grainFade = 1.0-smoothstep(.002,.025,length(fwidth(vTerrainPosition.xz)));
      vec3 grainGradient = vec3(dFdx(grain),dFdy(grain),0.0);
      normal = normalize(normal - grainGradient * .10 * grainFade);`);
  };
  material.customProgramCacheKey = () => 'relief-layers-v1';
  return material;
}
