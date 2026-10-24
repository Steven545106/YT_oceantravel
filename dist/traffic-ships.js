import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
const mat=(color,roughness=.55,metalness=.08)=>new THREE.MeshStandardMaterial({color,roughness,metalness});

// A continuous flared hull: pointed stem, rounded bilges, flat transom and raised bow sheer.
function hullGeometry(length,beam,bottom,deck){
  const p=[],uv=[],indices=[],stations=40,ring=18;
  for(let i=0;i<=stations;i++){
    const t=i/stations,z=(t-.5)*length;
    const width=beam*(t<.56?.86+.14*Math.sin(t/.56*Math.PI/2):Math.pow(Math.max(.0001,1-((t-.56)/.44)**1.8),.58));
    const top=deck+.018*(t**4),keel=bottom+.035*(t**6);
    for(let j=0;j<=ring;j++){
      const a=j/ring*Math.PI,x=Math.cos(a)*width,y=top-(top-keel)*Math.sin(a)**.65;
      p.push(x,y,z);uv.push(j/ring,t);
      if(i<stations&&j<ring){const n=i*(ring+1)+j;indices.push(n,n+ring+1,n+1,n+1,n+ring+1,n+ring+2);}
    }
  }
  // Transom and sheer deck caps close both ends without a separate triangular nose.
  for(const row of [0,stations])for(let j=1;j<ring;j++){
    const a=row*(ring+1),b=a+j,c=a+j+1;indices.push(...(row===0?[a,b,c]:[a,c,b]));
  }
  for(let i=0;i<stations;i++){const a=i*(ring+1),b=a+ring+1;indices.push(a,a+ring,b,b,a+ring,b+ring);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
function builder(){
  const detail=new THREE.Group(),parts=[];
  function mesh(geometry,material,x=0,y=0,z=0){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);parts.push(m);return m;}
  const box=(w,h,d,m,x,y,z,r=0)=>mesh(r?new RoundedBoxGeometry(w,h,d,2,r):new THREE.BoxGeometry(w,h,d),m,x,y,z);
  function rod(a,b,r,m){const delta=b.clone().sub(a),g=new THREE.CylinderGeometry(r,r,delta.length(),6);const o=mesh(g,m,...a.clone().add(b).multiplyScalar(.5).toArray());o.quaternion.setFromUnitVectors(V(0,1,0),delta.normalize());return o;}
  function tube(points,r,m){return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),Math.max(12,points.length*3),r,5,false),m);}
  function finish(){
    const batches=new Map();
    for(const m of parts){m.updateMatrix();const geometry=(m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone()).applyMatrix4(m.matrix);if(!batches.has(m.material))batches.set(m.material,[]);batches.get(m.material).push(geometry);m.geometry.dispose();}
    for(const [material,geometries] of batches){const geometry=mergeGeometries(geometries);for(const g of geometries)g.dispose();const merged=new THREE.Mesh(geometry,material);detail.add(merged);}
    return detail;
  }
  return {mesh,box,rod,tube,finish,detail};
}
function addLabel(parent,text,length,y,z,x){
  if(typeof document==='undefined')return;
  const c=document.createElement('canvas');c.width=512;c.height=96;const ctx=c.getContext('2d');
  ctx.clearRect(0,0,512,96);ctx.fillStyle='#f7f3e7';ctx.font='bold 64px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,50,500);
  const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.MeshBasicMaterial({map,transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});
  for(const side of [-1,1]){const label=new THREE.Mesh(new THREE.PlaneGeometry(length,length*.1875),material);label.position.set(side*x,y,z);label.rotation.y=side*Math.PI/2;parent.add(label);}
}
function lights(parent,sprite,entries){
  const group=new THREE.Group();group.name='航行燈';group.visible=false;
  const lenses=builder(),materials=new Map();
  for(const [x,y,z,color,size] of entries){
    if(!materials.has(color))materials.set(color,new THREE.MeshBasicMaterial({color,toneMapped:false}));
    lenses.mesh(new THREE.SphereGeometry(size*.10,8,6),materials.get(color),x,y,z);
    if(sprite){const glow=sprite(color,size);glow.position.set(x,y,z);group.add(glow);}
  }
  parent.children[0].levels[0].object.add(lenses.finish());
  parent.add(group);return group;
}
function rail(b,side,length,beam,height,metal,start=-.47,end=.47){
  const points=[];
  for(let i=0;i<=16;i++){
    const t=start+(end-start)*i/16,u=t+.5;
    const width=beam*(u<.56?.86+.14*Math.sin(u/.56*Math.PI/2):Math.pow(Math.max(.0001,1-((u-.56)/.44)**1.8),.58));
    points.push(V(side*width,height+.018*u**4,t*length));
  }
  b.tube(points,length*.0025,metal);
  for(let i=0;i<points.length;i+=2){const p=points[i];b.rod(p,V(p.x,p.y-length*.05,p.z),length*.002,metal);}
}
function installLOD(name,detail,proxy,distance){
  const g=new THREE.Group();g.name=name;const lod=new THREE.LOD();lod.addLevel(detail,0);lod.addLevel(proxy,distance,.12);g.add(lod);
  g.userData.trafficKind=name;g.userData.detailMeshes=detail.children.length;return g;
}

export function buildFishingBoat({color=0x24628a,variant='trawler',sprite}={}){
  const b=builder(),hullMaterial=mat(color,.38,.12),white=mat(0xe9ebe5,.35),deck=mat(0x8a8474,.82),metal=mat(0xaab6b8,.25,.75),black=mat(0x182329,.86),red=mat(0x9b3a2d,.65),teak=mat(0x75543a,.9),net=mat(0x4c665c,.95),roof=mat(0x164568,.4),windowMaterial=mat(0x172c38,.16,.45);
  windowMaterial.emissive.setHex(0xffd18b);windowMaterial.emissiveIntensity=0;
  b.mesh(hullGeometry(.4,.058,-.045,.055),hullMaterial);
  b.mesh(hullGeometry(.396,.0575,-.047,-.009),red);
  // Raised deck, a protective rubbing strake and an open aft working area.
  b.box(.096,.006,.25,deck,0,.057,-.035,.002);
  for(const side of [-1,1]){
    rail(b,side,.4,.057,.079,white);rail(b,side,.4,.056,.101,metal,-.47,-.14);rail(b,side,.4,.056,.096,metal,.23,.46);
    for(const z of [-.13,-.07,.015,.095]){
      const tire=b.mesh(new THREE.TorusGeometry(.011,.0038,6,12),black,side*.059,.033,z);tire.rotation.y=Math.PI/2;
      b.rod(V(side*.057,.069,z),V(side*.062,.04,z),.0008,teak);
    }
  }
  b.box(.08,.062,.095,white,0,.09,.026,.004);
  b.box(.09,.012,.107,roof,0,.128,.026,.002);
  // Wraparound glazing with visible mullions, door and sloped front windscreen.
  const windshield=b.box(.069,.031,.002,windowMaterial,0,.105,.074);windshield.rotation.x=-.18;
  for(const side of [-1,1]){
    b.box(.002,.027,.065,windowMaterial,side*.0405,.105,.026);
    for(const z of [.003,.028,.051])b.box(.003,.032,.002,white,side*.042,.105,z);
    b.box(.003,.036,.021,roof,side*.042,.077,-.01);
    b.box(.003,.002,.009,metal,side*.044,.082,-.009);
    b.box(.005,.004,.022,teak,side*.046,.06,-.01);
  }
  for(const x of [-.023,0,.023])b.box(.002,.036,.004,white,x,.105,.076);
  b.box(.062,.024,.003,windowMaterial,0,.103,-.022);
  b.rod(V(0,.13,-.01),V(0,.274,-.015),.0024,white);
  b.rod(V(-.036,.229,-.015),V(.036,.229,-.015),.0018,metal);
  b.box(.04,.006,.009,white,0,.248,-.015,.002);
  b.mesh(new THREE.SphereGeometry(.009,12,8),white,.023,.144,.034);
  b.rod(V(-.025,.133,.04),V(-.026,.225,.04),.0008,metal);
  b.box(.009,.022,.01,black,.027,.146,-.008);
  // Coiled line, refrigerated crates and a working net drum in the stern.
  for(const x of [-.025,.012])for(let layer=0;layer<2;layer++){
    b.box(.027,.012,.032,net,x,.067+layer*.014,-.12,.001);
    for(let k=0;k<3;k++)b.box(.004,.001,.027,white,x-.008+k*.008,.074+layer*.014,-.12);
  }
  const drum=b.mesh(new THREE.CylinderGeometry(.018,.018,.037,12),teak,.018,.085,-.175);drum.rotation.z=Math.PI/2;
  for(const x of [-.003,.039]){const flange=b.mesh(new THREE.CylinderGeometry(.022,.022,.002,14),metal,x,.085,-.175);flange.rotation.z=Math.PI/2;}
  for(let k=0;k<8;k++){const rope=b.mesh(new THREE.TorusGeometry(.017,.0009,4,14),net,.003+k*.004,.085,-.175);rope.rotation.y=Math.PI/2;}
  const bowCoil=b.mesh(new THREE.TorusGeometry(.012,.002,6,18),teak,0,.072,.132);bowCoil.rotation.x=Math.PI/2;
  for(const z of [-.185,.15])for(const side of [-1,1]){b.rod(V(side*.032,.06,z),V(side*.032,.074,z),.002,metal);b.rod(V(side*.027,.074,z),V(side*.037,.074,z),.0018,metal);}
  const lampEntries=[[-.043,.13,.06,0xff342c,.035],[.043,.13,.06,0x34ed82,.035],[0,.278,-.015,0xfff3d1,.048],[0,.14,-.08,0xffe5aa,.04]];
  if(variant==='squid'){
    for(const side of [-1,1]){
      b.rod(V(side*.03,.14,-.01),V(side*.105,.15,-.13),.0018,metal);
      b.rod(V(side*.105,.15,-.13),V(side*.105,.15,.12),.0018,metal);
      for(let k=0;k<7;k++){const z=-.12+k*.038;b.rod(V(side*.105,.15,z),V(side*.105,.127,z),.0009,metal);lampEntries.push([side*.105,.125,z,0xffedc6,.045]);}
    }
  }else{
    for(const side of [-1,1])b.rod(V(side*.043,.06,-.17),V(side*.044,.157,-.15),.0022,metal);
    b.rod(V(-.044,.157,-.15),V(.044,.157,-.15),.0022,metal);
    b.rod(V(0,.155,-.15),V(0,.105,-.19),.0009,black);
    b.rod(V(0,.07,-.074),V(.07,.15,-.12),.003,roof);
    b.rod(V(.07,.15,-.12),V(.07,.082,-.12),.0007,black);
  }
  const detail=b.finish();addLabel(detail,variant==='squid'?'SEA LIGHT':'SEA HARVEST',.096,.023,.005,.0585);
  const proxy=new THREE.Group();const hull=new THREE.Mesh(hullGeometry(.4,.058,-.045,.055),hullMaterial);proxy.add(hull);
  const cabin=new THREE.Mesh(new THREE.BoxGeometry(.08,.065,.10),white);cabin.position.set(0,.093,.026);proxy.add(cabin);
  const g=installLOD('海上漁船',detail,proxy,18),nightLights=lights(g,sprite,lampEntries);
  g.userData.variant=variant;
  return {g,lights:nightLights,hullMaterial,windowMaterial};
}

export function buildCargoShip({sprite,random=Math.random}={}){
  const b=builder(),hullMaterial=mat(0x263e48,.4,.25),bottom=mat(0x963f32,.72),deck=mat(0x6c776f,.8),white=mat(0xe8e9e3,.45),metal=mat(0xaab3b1,.35,.75),dark=mat(0x17232b,.8),orange=mat(0xe88e33,.5),blue=mat(0x204f70,.5),windowMaterial=mat(0x132d3b,.16,.5);
  windowMaterial.emissive.setHex(0xffd18b);windowMaterial.emissiveIntensity=0;
  b.mesh(hullGeometry(1.5,.155,-.07,.075),hullMaterial);b.mesh(hullGeometry(1.498,.154,-.073,-.014),bottom);
  b.box(.268,.008,1.22,deck,0,.079,.02,.002);
  for(const side of [-1,1]){
    rail(b,side,1.5,.153,.104,white);
    for(const z of [-.55,-.38,.41,.59]){b.box(.02,.007,.035,dark,side*.12,.09,z);b.rod(V(side*.12,.09,z),V(side*.12,.105,z),.003,metal);}
  }
  // Tiered aft accommodation and bridge wings with individual windows and deck walkways.
  for(let level=0;level<3;level++){
    b.box(.186,.047,.14,white,0,.104+level*.047,-.59,.003);
    b.box(.20,.005,.155,deck,0,.132+level*.047,-.59);
    for(const side of [-1,1])for(let i=0;i<4;i++)b.box(.002,.014,.017,windowMaterial,side*.094,.109+level*.047,-.637+i*.03);
    for(let i=0;i<6;i++)b.box(.018,.015,.002,windowMaterial,-.072+i*.029,.109+level*.047,-.518);
  }
  b.box(.256,.032,.098,white,0,.26,-.58,.003);
  b.box(.259,.022,.075,windowMaterial,0,.265,-.567,.002);
  b.box(.27,.007,.113,white,0,.284,-.58,.002);
  for(let x=-.117;x<.12;x+=.029)b.box(.003,.029,.004,white,x,.266,-.528);
  for(const side of [-1,1]){
    b.rod(V(side*.123,.278,-.63),V(side*.123,.278,-.52),.0018,metal);
    for(const z of [-.62,-.58,-.535])b.rod(V(side*.123,.278,z),V(side*.123,.25,z),.0014,metal);
    // Enclosed orange lifeboats and launching davits on both accommodation sides.
    b.box(.026,.021,.069,orange,side*.115,.17,-.626,.01);
    b.rod(V(side*.10,.204,-.65),V(side*.136,.198,-.65),.002,white);
    b.rod(V(side*.10,.204,-.60),V(side*.136,.198,-.60),.002,white);
  }
  b.box(.061,.072,.065,blue,0,.269,-.666,.007);b.box(.065,.012,.07,dark,0,.31,-.666);
  for(const x of [-.015,.015])b.rod(V(x,.315,-.666),V(x,.337,-.666),.006,dark);
  b.rod(V(0,.288,-.59),V(0,.41,-.59),.0028,white);b.rod(V(-.047,.36,-.59),V(.047,.36,-.59),.0018,metal);
  b.box(.053,.006,.013,white,0,.389,-.59,.002);
  b.mesh(new THREE.SphereGeometry(.015,12,8),white,.064,.306,-.606);
  // Forecastle winches, anchors and mooring equipment.
  b.box(.115,.02,.095,deck,0,.094,.65,.003);
  for(const side of [-1,1]){
    const winch=b.mesh(new THREE.CylinderGeometry(.012,.012,.028,10),metal,side*.035,.114,.65);winch.rotation.z=Math.PI/2;
    b.rod(V(side*.034,.1,.63),V(side*.072,.078,.69),.0013,dark);
    b.box(.021,.018,.005,dark,side*.073,.063,.69);
  }
  b.rod(V(0,.094,.72),V(0,.25,.718),.0022,white);
  const bulb=b.mesh(new THREE.SphereGeometry(.024,14,8),bottom,0,-.04,.758);bulb.scale.set(.7,.7,1.45);
  const detail=b.finish();
  // Ribbed containers share one instanced draw call; stacking leaves an actual side passage.
  const cell=builder(),containerMaterial=new THREE.MeshStandardMaterial({roughness:.7,metalness:.18});
  const unitMaterial=mat(0xffffff);
  cell.box(.067,.042,.111,unitMaterial,0,0,0,.001);
  for(const side of [-1,1])for(let k=0;k<9;k++)cell.box(.0015,.037,.002,unitMaterial,side*.034,0,-.048+k*.012);
  for(let k=0;k<7;k++)cell.box(.061,.0015,.002,unitMaterial,0,.0217,-.045+k*.015);
  for(const z of [-.056,.056])for(const x of [-.024,.024])cell.box(.0015,.037,.002,unitMaterial,x,0,z);
  const unit=cell.finish().children[0].geometry;
  const count=3*8*3,containers=new THREE.InstancedMesh(unit,containerMaterial,count),matrix=new THREE.Matrix4(),color=new THREE.Color(),palette=[0x225c7a,0xb04d3a,0xb99c62,0x567a65,0xb8bdb3,0x804945];
  let index=0;
  for(let row=0;row<3;row++)for(let bay=0;bay<8;bay++)for(let layer=0;layer<3;layer++){
    if(layer===2&&random()<.25)continue;
    matrix.makeTranslation((row-1)*.073,.109+layer*.044,.48-bay*.119);containers.setMatrixAt(index,matrix);containers.setColorAt(index,color.setHex(palette[(row*5+bay*3+layer)%palette.length]));index++;
  }
  containers.count=index;containers.name='波紋貨櫃';containers.instanceMatrix.needsUpdate=true;containers.instanceColor.needsUpdate=true;detail.add(containers);unitMaterial.dispose();
  addLabel(detail,'OCEAN LINE',.34,.027,.05,.154);
  const proxy=new THREE.Group();proxy.add(new THREE.Mesh(hullGeometry(1.5,.155,-.07,.075),hullMaterial));
  const stack=new THREE.Mesh(new THREE.BoxGeometry(.225,.115,.95),blue);stack.position.set(0,.135,.07);proxy.add(stack);
  const bridge=new THREE.Mesh(new THREE.BoxGeometry(.22,.21,.15),white);bridge.position.set(0,.18,-.59);proxy.add(bridge);
  const g=installLOD('海上貨輪',detail,proxy,60),nightLights=lights(g,sprite,[[-.13,.28,-.54,0xff342c,.07],[.13,.28,-.54,0x34ed82,.07],[0,.414,-.59,0xfff3d1,.08],[0,.255,.718,0xfff3d1,.07],[0,.20,-.73,0xffffff,.05],...[0,1,2,3,4].map(i=>[0,.235,.45-i*.19,0xffe6a9,.045])]);
  return {g,lights:nightLights,windowMaterial,hullMaterial};
}
