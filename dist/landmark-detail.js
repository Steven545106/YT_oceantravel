import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { quality } from './quality.js';

const details = [];
const shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x15231c, transparent: true, opacity: .25, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
const foundationMaterial=new THREE.MeshStandardMaterial({color:0x817e69,roughness:.96,side:THREE.DoubleSide});
let contactMap;
function contactTexture() {
  if (contactMap) return contactMap;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64,64,8,64,64,63);
  gradient.addColorStop(0,'#cccccc'); gradient.addColorStop(.55,'#666666'); gradient.addColorStop(1,'#000000');
  ctx.fillStyle=gradient; ctx.fillRect(0,0,128,128);
  contactMap = new THREE.CanvasTexture(canvas);
  shadowMaterial.alphaMap = contactMap;
  return contactMap;
}

// Simplified, material-coloured silhouettes are used only when a sight is tiny on screen.
// Vertical slices preserve stepped towers and roofs without allocating another full model.
export function buildSilhouette(root, slices = 16) {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert(), buckets = new Map();
  let originalTriangles=0;
  const bounds = new THREE.Box3().setFromObject(root).applyMatrix4(inverse);
  const height = Math.max(bounds.max.y-bounds.min.y,.001), p = new THREE.Vector3();
  root.traverse(mesh => {
    if (!mesh.isMesh || mesh.isInstancedMesh || Array.isArray(mesh.material)) return;
    const matrix = inverse.clone().multiply(mesh.matrixWorld), pos=mesh.geometry.attributes.position;
    originalTriangles+=(mesh.geometry.index?.count ?? pos.count)/3;
    let bands=buckets.get(mesh.material);
    if (!bands) { bands=Array.from({length:slices},()=>new THREE.Box3()); buckets.set(mesh.material,bands); }
    for(let i=0;i<pos.count;i++) {
      p.fromBufferAttribute(pos,i).applyMatrix4(matrix);
      const band=Math.min(slices-1,Math.max(0,Math.floor((p.y-bounds.min.y)/height*slices)));
      bands[band].expandByPoint(p);
    }
  });
  const result=new THREE.Group(); result.name='遠景輪廓';
  for(const [material,bands] of buckets) {
    // Box walls often have vertices only at their top and bottom. Interpolate empty
    // bands so distant facades remain solid rather than becoming floating roof strips.
    const occupied=bands.map((b,i)=>b.isEmpty()?-1:i).filter(i=>i>=0);
    for(let k=0;k<occupied.length-1;k++) {
      const a=occupied[k],b=occupied[k+1];
      for(let i=a+1;i<b;i++) {
        const t=(i-a)/(b-a);
        bands[i].min.copy(bands[a].min).lerp(bands[b].min,t);
        bands[i].max.copy(bands[a].max).lerp(bands[b].max,t);
      }
    }
    const parts=[];
    for(let i=0;i<slices;i++) {
      const b=bands[i]; if(b.isEmpty()) continue;
      const size=b.getSize(new THREE.Vector3());
      if(Math.max(size.x,size.z)<height*.018) continue;
      const centre=b.getCenter(new THREE.Vector3());
      parts.push(new THREE.BoxGeometry(Math.max(size.x,.001),height/slices,Math.max(size.z,.001)).translate(centre.x,bounds.min.y+(i+.5)*height/slices,centre.z));
    }
    if(parts.length) { result.add(new THREE.Mesh(mergeGeometries(parts),material)); parts.forEach(g=>g.dispose()); }
  }
  let proxyTriangles=0;result.traverse(o=>{if(o.isMesh)proxyTriangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});
  // A proxy is useful only when it actually reduces geometry. Simple markers keep their original mesh.
  if(proxyTriangles>=originalTriangles*.8) {
    result.traverse(o=>o.geometry?.dispose());result.clear();
  }
  return result;
}

export function addLandmarkDetail(group, model, { heightAt, natural = false, sea = false, foundation = true } = {}) {
  group.updateMatrixWorld(true);
  const worldBounds=new THREE.Box3().setFromObject(model);
  const size=worldBounds.getSize(new THREE.Vector3());
  const span=Math.max(size.x,size.z,size.y,.07);
  model.traverse(o=>{if(o.isMesh) o.receiveShadow=true;});
  const lod=new THREE.LOD(); lod.autoUpdate=false; lod.name='景點細節分級';
  group.remove(model);
  lod.addLevel(model,0);
  const medium=buildSilhouette(model,32);
  medium.position.copy(model.position); medium.rotation.copy(model.rotation); medium.scale.copy(model.scale);
  if(medium.children.length) lod.addLevel(medium,span*28,.15);
  const silhouette=buildSilhouette(model);
  // Copy the root transform: silhouette vertices are in the model's local space.
  silhouette.position.copy(model.position); silhouette.rotation.copy(model.rotation); silhouette.scale.copy(model.scale);
  if(silhouette.children.length) lod.addLevel(silhouette,span*55,.15);
  group.add(lod);
  const ground=!sea && !natural && heightAt ? {heightAt,foundation} : null;
  if(ground) fitLandmarkGround(group,model,heightAt,foundation);
  const lodDistances=lod.levels.map(level=>level.distance);
  details.push({group,model,lod,span,ground,lodDistances});
  return lod;
}

const landmarkPosition=new THREE.Vector3();
export function updateLandmarkDetails(camera, night) {
  shadowMaterial.opacity=night?.10:.28;
  for(const item of details) {
    if(!item.group.visible) continue;
    // Lower quality spends less geometry on distant buildings.
    for(let i=1;i<item.lod.levels.length;i++) item.lod.levels[i].distance=item.lodDistances[i]*Math.max(.5,quality.detail);
    item.lod.update(camera);
    const distance=camera.position.distanceTo(item.group.getWorldPosition(landmarkPosition));
    const cast=quality.shadows && !night && item.lod.getCurrentLevel()===0 && distance<Math.min(18,item.span*16+3);
    if(item.casting!==cast) { item.model.traverse(o=>{if(o.isMesh)o.castShadow=cast;}); item.casting=cast; }
  }
}

export function regroundLandmarkDetails() {
  for(const {group,model,ground} of details) if(ground)fitLandmarkGround(group,model,ground.heightAt,ground.foundation);
}

function fitLandmarkGround(group,model,heightAt,foundation) {
  for(const child of [...group.children]) if(child.userData.landmarkGround) {group.remove(child);child.geometry.dispose();}
  group.updateMatrixWorld(true);
  const worldBounds=new THREE.Box3().setFromObject(model),size=worldBounds.getSize(new THREE.Vector3());
  contactTexture();
  const width=Math.max(size.x*1.12,.08), depth=Math.max(size.z*1.12,.08);
  const centre=worldBounds.getCenter(new THREE.Vector3());
  const geometry=new THREE.PlaneGeometry(width,depth,12,12).rotateX(-Math.PI/2);
  const pos=geometry.attributes.position;
  const inverse=group.matrixWorld.clone().invert(), point=new THREE.Vector3();
  for(let i=0;i<pos.count;i++) {
    const x=centre.x+pos.getX(i), z=centre.z+pos.getZ(i);
    point.set(x,heightAt(x,z)+.003,z).applyMatrix4(inverse);
    pos.setXYZ(i,point.x,point.y,point.z);
  }
  geometry.computeVertexNormals();
  const edge=[]; const halfX=width*.45, halfZ=depth*.45;
  for(let side=0;side<4;side++) for(let i=0;i<8;i++) {
    const t=i/8;
    const x=centre.x+(side===0?-halfX+2*halfX*t:side===1?halfX:side===2?halfX-2*halfX*t:-halfX);
    const z=centre.z+(side===0?-halfZ:side===1?-halfZ+2*halfZ*t:side===2?halfZ:halfZ-2*halfZ*t);
    edge.push([x,z]);
  }
  const vertices=[]; const top=Math.max(group.position.y,worldBounds.min.y+.005);
  for(let i=0;i<edge.length;i++) {
    const a=edge[i],b=edge[(i+1)%edge.length];
    const ay=Math.min(top-.012,heightAt(...a)-.008),by=Math.min(top-.012,heightAt(...b)-.008);
    if(top-Math.min(ay,by)<.025)continue;
    for(const v of [[a[0],top,a[1]],[b[0],by,b[1]],[b[0],top,b[1]],[a[0],top,a[1]],[a[0],ay,a[1]],[b[0],by,b[1]]]) {
      point.set(...v).applyMatrix4(inverse);vertices.push(point.x,point.y,point.z);
    }
  }
  if(foundation && vertices.length) {
    const skirtGeometry=new THREE.BufferGeometry();skirtGeometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));skirtGeometry.computeVertexNormals();
    const skirt=new THREE.Mesh(skirtGeometry,foundationMaterial);skirt.receiveShadow=true;skirt.userData.landmarkGround=true;group.add(skirt);
  }
  const shadow=new THREE.Mesh(geometry,shadowMaterial); shadow.renderOrder=1; shadow.userData.landmarkGround=true;group.add(shadow);

}
