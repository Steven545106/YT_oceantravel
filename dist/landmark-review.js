import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { LANDMARK_BUILDERS, setLandmarkNight, setTaipei101Night, setLandmarkEnvironment } from './landmark-models.js';
import { TAIWAN_REFERENCE_MODELS } from './taiwan-reference-data.js';
import { KOREA_REFERENCE_MODELS } from './korea-reference-data.js';
import { JAPAN_REFERENCE_MODELS } from './japan-reference-data.js';
import catalogue from './Data/landmarks.json';
import {TERRAIN_LANDMARK_TYPES} from './landmark-scale.js';
import {buildReviewCatalogue,filterReviewCatalogue,REVIEW_COUNTRIES} from './landmark-review-catalogue.js';
const REFERENCE_MODELS=buildReviewCatalogue(catalogue.landmarks,[...TAIWAN_REFERENCE_MODELS,...JAPAN_REFERENCE_MODELS,...KOREA_REFERENCE_MODELS]);
const modelId=item=>item.id;
const stage=document.querySelector('#stage'),select=document.querySelector('#model'),metrics=document.querySelector('#metrics');
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.85;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;stage.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color(0xd9e4e2);
const camera=new THREE.PerspectiveCamera(40,1,.01,100);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;
const hemisphere=new THREE.HemisphereLight(0xe3f0ff,0x8f9371,1.3);scene.add(hemisphere);
const sun=new THREE.DirectionalLight(0xfff1d8,2.8);sun.position.set(-3,6,5);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=sun.shadow.camera.bottom=-4;sun.shadow.camera.right=sun.shadow.camera.top=4;sun.shadow.bias=-.0002;sun.shadow.normalBias=.008;scene.add(sun);
const environmentScene=new THREE.Scene();environmentScene.background=new THREE.Color(0xcbdce1);
const pmrem=new THREE.PMREMGenerator(renderer),environment=pmrem.fromScene(environmentScene);scene.environment=environment.texture;scene.environmentIntensity=.6;setLandmarkEnvironment(environment.texture);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({opacity:.18}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;ground.position.y=-.03;scene.add(ground);
let current=null,night=false,currentRadius=1;
const reviewCentre=new THREE.Vector3(),reviewBounds=new THREE.Box3();
const countrySelect=document.querySelector('#country'),search=document.querySelector('#search');
let filtered=REFERENCE_MODELS;
for(const country of REVIEW_COUNTRIES){const option=document.createElement('option');option.value=country;option.textContent=`${country}（${REFERENCE_MODELS.filter(item=>item.country===country).length}）`;countrySelect.append(option);}
function populate(){
  select.replaceChildren();
  for(const country of REVIEW_COUNTRIES){
    const items=filtered.filter(item=>item.country===country);if(!items.length)continue;
    const group=document.createElement('optgroup');group.label=country;
    for(const item of items){const option=document.createElement('option');option.value=item.id;option.textContent=item.name;group.append(option);}select.append(group);
  }
  document.querySelector('#result-count').textContent=`${filtered.length} / ${REFERENCE_MODELS.length} 個景點`;
  const empty=!filtered.length;
  document.querySelector('#empty').hidden=!empty;select.disabled=empty;
  for(const id of ['previous','next'])document.querySelector(`#${id}`).disabled=filtered.length<2;
  document.querySelector('#reset').disabled=empty;
  document.querySelector('footer').hidden=empty;
  if(current)current.visible=!empty;
}
function applyFilters(){
  const selected=select.value;filtered=filterReviewCatalogue(REFERENCE_MODELS,{country:countrySelect.value,query:search.value});populate();
  if(filtered.length)show(filtered.some(item=>item.id===selected)?selected:filtered[0].id);
}
countrySelect.addEventListener('change',applyFilters);search.addEventListener('input',applyFilters);
for(const [id,step] of [['previous',-1],['next',1]])document.querySelector(`#${id}`).addEventListener('click',()=>{if(filtered.length)show(filtered[(filtered.findIndex(item=>item.id===select.value)+step+filtered.length)%filtered.length].id);});
populate();
function reset(){
  const direction=(select.value==='twinHearts'?new THREE.Vector3(.3,2.8,1.2):select.value==='guishanIsland'?new THREE.Vector3(-1.3,.9,2):select.value==='gorge'?new THREE.Vector3(2,1.5,.25):select.value==='pingxiLanterns'?new THREE.Vector3(.4,.8,2):select.value==='queenhead'?new THREE.Vector3(-1.1,.85,2):new THREE.Vector3(1.35,.85,2)).normalize(),right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),direction).normalize(),up=new THREE.Vector3().crossVectors(direction,right);
  const tan=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));let distance=.1;
  for(const x of [reviewBounds.min.x,reviewBounds.max.x])for(const y of [reviewBounds.min.y,reviewBounds.max.y])for(const z of [reviewBounds.min.z,reviewBounds.max.z]) {
    const offset=new THREE.Vector3(x,y,z).sub(reviewCentre),toward=offset.dot(direction);
    distance=Math.max(distance,toward+Math.abs(offset.dot(up))/tan,toward+Math.abs(offset.dot(right))/(tan*camera.aspect));
  }
  camera.position.copy(direction).multiplyScalar(distance*1.14).add(reviewCentre);controls.target.copy(reviewCentre);controls.update();
}
function show(type){
  if(current){scene.remove(current);current.traverse(o=>o.geometry?.dispose());}
  const item=REFERENCE_MODELS.find(i=>modelId(i)===type)??REFERENCE_MODELS[0];select.value=modelId(item);
  current=LANDMARK_BUILDERS[item.type](item.options??{});
  const bounds=new THREE.Box3().setFromObject(current),size=bounds.getSize(new THREE.Vector3()),centre=bounds.getCenter(new THREE.Vector3());
  const scale=2.8/Math.max(size.x,size.y,size.z,.01);
  current.position.copy(centre).multiplyScalar(-scale);current.position.y=-bounds.min.y*scale;current.scale.setScalar(scale);scene.add(current);
  current.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;}});
  reviewBounds.setFromObject(current);reviewBounds.getCenter(reviewCentre);currentRadius=reviewBounds.getSize(new THREE.Vector3()).length()/2;reset();
  document.querySelector('#current-name').textContent=[item.country,item.locality,item.name].filter(Boolean).join(' · ');
  document.querySelector('#features').textContent=item.features+(TERRAIN_LANDMARK_TYPES.has(item.type)?'（此處預覽山頂細節／標記；完整山體使用遊戲內地形。）':'');
  document.title=`${item.name}・景點預覽總覽`;
  const sources=document.querySelector('#sources');sources.replaceChildren();item.sources.forEach((url,i)=>{const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener';a.textContent=`實景參考 ${i+1}`;sources.append(a);});
  if(!item.sources.length){const note=document.createElement('span');note.className='caption';note.textContent='遊戲內現有模型預覽';sources.append(note);}
  setLandmarkNight(night);setTaipei101Night(night);
  const url=new URL(location);url.searchParams.set('model',modelId(item));history.replaceState(null,'',url);
}
select.addEventListener('change',()=>show(select.value));document.querySelector('#reset').addEventListener('click',reset);
document.querySelector('#night').addEventListener('click',()=>{night=!night;setLandmarkNight(night);setTaipei101Night(night);sun.intensity=night?.2:2.8;hemisphere.intensity=night?.4:1.3;scene.background.setHex(night?0x172933:0xd9e4e2);document.querySelector('#night').textContent=night?'日景':'夜景';document.querySelector('#night').setAttribute('aria-pressed',String(night));});
function resize(){const w=stage.clientWidth,h=stage.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();if(current)reset();}new ResizeObserver(resize).observe(stage);resize();
show(new URLSearchParams(location.search).get('model'));
document.querySelector('#loading-review').remove();
renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);metrics.textContent=`${renderer.info.render.calls} draw calls\n${renderer.info.render.triangles.toLocaleString()} triangles`;});
