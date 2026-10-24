// Compact unarmed VTOL sightseeing jet, facing -Z like the existing vessels.
import * as THREE from 'three';

export const FIGHTER_PAINTS={
  slate:{body:0x667783,wing:0x334651,trim:0xffa02e,tail:0xd45b28},
  navy:{body:0x1765bd,wing:0x0b4391,trim:0xffd449,tail:0xf4bd2b},
  silver:{body:0xf0f1eb,wing:0xc9d3da,trim:0xe93b4e,tail:0xb72e3f}
};

export function buildFighter(){
  const jet=new THREE.Group();jet.name='觀光戰鬥機';
  const body=new THREE.MeshStandardMaterial({color:FIGHTER_PAINTS.slate.body,roughness:.52,metalness:.38,flatShading:false});
  const wing=new THREE.MeshStandardMaterial({color:FIGHTER_PAINTS.slate.wing,roughness:.58,metalness:.28,side:THREE.DoubleSide});
  const trim=new THREE.MeshStandardMaterial({color:FIGHTER_PAINTS.slate.trim,roughness:.43,metalness:.32});
  const tail=new THREE.MeshStandardMaterial({color:FIGHTER_PAINTS.slate.tail,roughness:.62,metalness:.25,side:THREE.DoubleSide});
  const glass=new THREE.MeshPhysicalMaterial({color:0x132d3d,roughness:.11,metalness:.28,transparent:true,opacity:.89,clearcoat:1});
  const dark=new THREE.MeshStandardMaterial({color:0x16232b,roughness:.7,metalness:.35});
  const engine=new THREE.MeshStandardMaterial({color:0x263640,roughness:.45,metalness:.8,emissive:0x235274,emissiveIntensity:.32});
  const add=(geometry,material,x=0,y=0,z=0)=>{const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);jet.add(mesh);return mesh;};
  // Slim tapered fuselage and sharp radome.
  add(new THREE.CylinderGeometry(.47,.67,5.45,16,1),body,0,.12,.05).rotation.x=-Math.PI/2;
  add(new THREE.ConeGeometry(.46,2.65,16),body,0,.12,-3.95).rotation.x=-Math.PI/2;
  add(new THREE.CylinderGeometry(.62,.45,1.25,16),tail,0,.10,3.12).rotation.x=-Math.PI/2;
  add(new THREE.ConeGeometry(.115,.42,10),trim,0,.14,-5.38).rotation.x=-Math.PI/2;
  // Swept wings are shallow closed extrusions, with stronger root and thin tips.
  const panel=(points,depth,material,y)=>{
    const shape=new THREE.Shape();shape.moveTo(points[0][0],points[0][1]);
    for(let i=1;i<points.length;i++)shape.lineTo(points[i][0],points[i][1]);shape.closePath();
    const mesh=add(new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:2}),material,0,y+depth/2,0);
    mesh.rotation.x=Math.PI/2;return mesh;
  };
  for(const side of [-1,1]){
    const mirror=points=>points.map(([x,z])=>[side*x,z]);
    panel(mirror([[.38,-1.25],[1.05,-.95],[3.8,1.15],[3.6,1.5],[.65,1.03]]),.13,wing,-.01);
    panel(mirror([[.44,2.32],[2.06,2.68],[2.08,3.1],[.52,2.95]]),.095,wing,.02);
    // Two canted vertical stabilizers, side intakes and navigation lamps.
    const fin=add(new THREE.BoxGeometry(.13,1.45,.9),tail,side*.62,.89,2.45);fin.rotation.z=-side*.24;fin.rotation.x=.18;
    const intake=add(new THREE.BoxGeometry(.72,.4,1.3),dark,side*.72,-.08,-.05);intake.rotation.y=side*.08;
    add(new THREE.SphereGeometry(.09,8,6),new THREE.MeshBasicMaterial({color:side<0?0xe04a48:0x57d99b}),side*3.68,.06,1.3);
  }
  // One-piece smoky canopy over the forward cockpit, with a narrow silver frame.
  const canopy=add(new THREE.SphereGeometry(1,24,12),glass,0,.58,-1.12);canopy.scale.set(.49,.43,1.32);
  const sill=add(new THREE.BoxGeometry(1.06,.09,2.46),trim,0,.27,-1.06);sill.material=tail;
  const rail=add(new THREE.BoxGeometry(.035,.37,1.95),trim,0,.56,-1.1);rail.rotation.x=.05;
  for(const side of [-1,1]){
    const nozzle=add(new THREE.CylinderGeometry(.34,.39,.42,16),dark,side*.32,.01,3.53);nozzle.rotation.x=Math.PI/2;
    const glow=add(new THREE.CircleGeometry(.28,16),engine,side*.32,.01,3.77);glow.rotation.y=Math.PI;
  }
  // Folded landing wheels remain available for visible ground contact.
  const gear=new THREE.Group();jet.add(gear);
  for(const [x,z] of [[0,-3.1],[-1.08,1.5],[1.08,1.5]]){
    const strut=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,.72,8),trim);strut.position.set(x,-.45,z);gear.add(strut);
    const wheel=new THREE.Mesh(new THREE.TorusGeometry(.18,.07,8,12),dark);wheel.position.set(x,-.82,z);wheel.rotation.y=Math.PI/2;gear.add(wheel);
  }
  jet.userData.gear=gear;
  jet.userData.paint=name=>{
    const paint=FIGHTER_PAINTS[name]??FIGHTER_PAINTS.slate;
    body.color.setHex(paint.body);wing.color.setHex(paint.wing);trim.color.setHex(paint.trim);tail.color.setHex(paint.tail);
  };
  jet.userData.setNight=night=>{engine.emissiveIntensity=night?.9:.32;};
  jet.userData.paint('slate');
  return jet;
}
