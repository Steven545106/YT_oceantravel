// Adapt the r180 ocean example to this game's miniature ship/camera scale.
// The official normal layers and Fresnel/sun reflection stay intact.
export const OCEAN_SCENE_SCALE=60;
export function refineOceanSurface(water){
  const material=water.material;
  material.uniforms.oceanSceneScale={value:OCEAN_SCENE_SCALE};
  material.uniforms.oceanChop={value:.8};
  material.fragmentShader='uniform float oceanSceneScale; uniform float oceanChop;\n'+material.fragmentShader;
  material.fragmentShader=material.fragmentShader
    .replace('getNoise( worldPosition.xz * size )','getNoise( worldPosition.xz * size * oceanSceneScale )')
    .replace('noise.xzy * vec3( 1.5, 1.0, 1.5 )','noise.xzy * vec3( 1.5 * oceanChop, 1.0, 1.5 * oceanChop )')
    .replace('0.001 + 1.0 / distance','0.001 + 1.0 / max( distance * oceanSceneScale, 0.1 )');
  material.needsUpdate=true;
}
