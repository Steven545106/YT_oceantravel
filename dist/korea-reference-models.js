import * as THREE from 'three';

// Original geometry guided by the official exterior references in korea-reference-data.js.
export function refineKoreaLandmarks(h){
 const {builders,lmAdd:add,lmBox:box,lmCyl:cyl,lmMaterial:mat,mergeByMaterial:merge,roughMass,loftedTower,irimoya,koreanHallAt,balustrade,suspensionBridge2,referencePlaque:plaque,JK,LM,TEXTURES}=h;
 const stone=mat(0xc9c5b9,{map:TEXTURES.stone}),tile=mat(0x41494b,{map:TEXTURES.tiles}),wood=mat(0x673d29,{map:TEXTURES.wood}),green=mat(0x297258),red=mat(0xa83a2d),cream=mat(0xeee5d0),glass=mat(0x6997ac,{map:TEXTURES.windows,metalness:.55,roughness:.24}),dark=mat(0x263434),leaf=mat(0x476b44,{roughness:1}),pale=mat(0xb5b3a7,{roughness:1});
 function finish(g,features){const root=merge(g);root.userData={...g.userData,referencePass:'korea-2026',features};return root;}
 function beam(g,a,b,r,material=wood){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),d=end.clone().sub(start);const m=add(g,new THREE.CylinderGeometry(r,r,d.length(),6),material,...start.clone().add(end).multiplyScalar(.5).toArray());m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return m;}
 function panel(g,text,x,y,z,w=.2,hh=.045){plaque(g,text,x,y,z,w,hh,'#e6d5a3','#24302c');}
 function hall(g,{x=0,y=0,z=0,w=.8,d=.38,double=false,blue=false,sign}={}){
  const a=new THREE.Group();a.position.set(x,y,z);g.add(a);
  box(a,w*1.28,.04,d*1.42,stone,0,0,0);box(a,w*.94,.17,d*.90,wood,0,.04,0);
  for(const side of [-1,1])for(let i=0;i<=6;i++){
   const xx=-w/2+i*w/6;cyl(a,.011,.014,.19,red,xx,.04,side*d/2,8);
   box(a,.036,.025,d*1.15,green,xx,.22,0);box(a,.024,.011,d*1.25,cream,xx,.245,0);
   if(i<6){box(a,w/6-.016,.115,.005,green,xx+w/12,.065,side*(d*.454));for(let k=0;k<4;k++)box(a,.002,.115,.006,wood,xx+.018+k*w/26,.065,side*(d*.459));}
  }
  const roof=blue?mat(0x315c7a,{map:TEXTURES.tiles}):tile;
  irimoya(a,{y:.255,w:w*1.05,d:d*1.10,h:.15,material:roof,trim:cream});
  if(double){box(a,w*.72,.11,d*.70,wood,0,.32,0);for(let i=0;i<6;i++)box(a,.018,.12,d*.75,green,-w*.34+i*w*.136,.32,0);irimoya(a,{y:.445,w:w*.85,d:d*.88,h:.15,material:roof,trim:cream});}
  if(sign)panel(a,sign,0,double?.455:.26,d*.60,.18,.039);
  return a;
 }
 function archWall(g,{w=1.2,height=.24,depth=.28,x=0,y=0,z=0,openings=[0],radius=.085}={}){
  const s=new THREE.Shape();s.moveTo(-w/2,0);s.lineTo(w/2,0);s.lineTo(w/2,height);s.lineTo(-w/2,height);s.closePath();
  for(const cx of openings){const p=new THREE.Path();p.moveTo(cx-radius,.001);p.lineTo(cx+radius,.001);p.lineTo(cx+radius,.115);p.absarc(cx,.115,radius,0,Math.PI,false);p.lineTo(cx-radius,.001);s.holes.push(p);}
  return add(g,new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:false,curveSegments:16}).translate(0,0,-depth/2),stone,x,y,z);
 }
 function steps(g,x,z,width,count,rise,run,y=0){for(let k=0;k<count;k++)box(g,width,(k+1)*rise,run,stone,x,y,z-k*run);}
 function grove(g,x,z,size=.2,seed=1){cyl(g,.01,.018,size*.6,wood,x,0,z,6);add(g,roughMass(size*.65,size*.65,size*.5,{seed,jitter:.16,detail:1}),leaf,x,size*.75,z);}
 builders.gyeongbokgung=()=>{
  const g=new THREE.Group();box(g,2.4,.012,2.8,mat(0xd6cdb8),0,-.012,0);
  archWall(g,{w:1.5,z:1.02,openings:[-.38,0,.38]});hall(g,{y:.24,z:1.02,w:1.0,d:.31,double:true,sign:'光化門'});
  box(g,1.8,.035,.60,stone,0,.0,1.08);steps(g,0,1.55,.30,5,.008,.05);
  hall(g,{z:-.43,w:.94,d:.50,double:true,sign:'勤政殿'});box(g,1.35,.04,.92,stone,0,0,-.43);
  for(const side of [-1,1]){
   box(g,.15,.13,1.3,wood,side*1.02,0,-.12);irimoya(g,{x:side*1.02,y:.13,z:-.12,w:.16,d:1.4,h:.09,material:tile});
   for(let i=0;i<9;i++)box(g,.035,.035,.023,stone,side*(.18+(i%2)*.19),.015,.63-Math.floor(i/2)*.16);
  }
  box(g,.15,.004,1.38,stone,0,.018,.27);
  // Gyeonghoeru: open lower column storey reflected in the western pond.
  box(g,.7,.008,.58,JK.water,-.83,.012,-1.01);const p=new THREE.Group();p.position.set(-.83,.03,-1.01);p.scale.setScalar(.55);g.add(p);
  for(const x of [-.35,-.12,.12,.35])for(const z of [-.19,0,.19])cyl(p,.014,.017,.20,stone,x,0,z,8);
  hall(p,{y:.20,w:.75,d:.42});
  g.userData.openGateCenters=[-.38,0,.38];return finish(g,'Gwanghwamun three arch passages, Geunjeongjeon terraces, rank stones, Gyeonghoeru pond');
 };
 builders.changdeokgung=()=>{
  const g=new THREE.Group();box(g,2.35,.012,2.7,mat(0xd5c8ad),0,-.012,0);
  hall(g,{z:.83,w:.68,d:.29,double:true,sign:'敦化門'});hall(g,{z:-.24,w:.86,d:.48,double:true,sign:'仁政殿'});
  for(const side of [-1,1]){box(g,.14,.11,1.1,wood,side*.92,0,.05);irimoya(g,{x:side*.92,z:.05,y:.11,w:.16,d:1.2,h:.08,material:tile});}
  hall(g,{x:.69,z:-.66,w:.47,d:.28,blue:true,sign:'宣政殿'});
  for(let k=0;k<10;k++)box(g,.025,.025,.024,stone,(k%2?1:-1)*.22,.014,.48-Math.floor(k/2)*.11);
  box(g,.62,.008,.49,JK.water,-.67,.015,-1.01);hall(g,{x:-.48,y:.03,z:-.91,w:.28,d:.21});
  for(let i=0;i<8;i++)grove(g,-1.05+i*.29,-1.30,.20,120+i);
  return finish(g,'Injeongjeon double eaves, blue Seonjeongjeon roof, Donhwamun and Buyongji garden pond');
 };
 builders.seoulTower=()=>{
  const g=new THREE.Group();cyl(g,.24,.29,.045,stone,0,0,0,32);cyl(g,.11,.17,.06,cream,0,.045,0,24);
  cyl(g,.034,.055,.58,cream,0,.105,0,24);cyl(g,.08,.042,.035,cream,0,.66,0,32);
  for(let i=0;i<3;i++){const y=.695+i*.035;cyl(g,.112-i*.006,.112-i*.006,.025,glass,0,y,0,32);cyl(g,.12-i*.006,.12-i*.006,.009,cream,0,y+.025,0,32);}
  cyl(g,.04,.10,.035,cream,0,.80,0,24);
  for(let k=0;k<10;k++)cyl(g,.018-k*.0012,.019-k*.0012,.058,k%2?cream:red,0,.835+k*.058,0,10);
  for(let k=0;k<16;k++){const a=k*Math.PI/8;beam(g,[Math.cos(a)*.11,.695,Math.sin(a)*.11],[Math.cos(a)*.10,.80,Math.sin(a)*.10],.002,cream);}
  balustrade(g,-.24,.2,.24,.2,{y:.045,h:.025,material:dark,spacing:.025});
  for(const x of [-.25,.25])grove(g,x,-.15,.17,7);
  g.userData.antennaRatio=.58/1.415;return finish(g,'slender white shaft, stacked observation glazing, long red and white antenna, Namsan plaza');
 };
 builders.lotteTower=()=>{
  const g=new THREE.Group();box(g,.65,.04,.46,cream,0,0,0);box(g,.45,.025,.25,glass,.23,.01,-.16);
  const size=t=>.100*Math.pow(1-t,.55)+.040;
  add(g,loftedTower(1.04,size,{corner:.55,steps:52,segments:6}),glass,0,.04,0);
  for(let k=0;k<80;k++){const t=k/80,r=size(t);for(const side of [-1,1])box(g,r*1.68,.0015,.002,cream,0,.04+t*1.04,side*r);}
  for(const side of [-1,1]){
   const shape=new THREE.Shape();shape.moveTo(side*.018,1.07);shape.lineTo(side*.044,1.07);shape.quadraticCurveTo(side*.050,1.20,side*.024,1.29);shape.lineTo(side*.014,1.29);shape.quadraticCurveTo(side*.029,1.20,side*.018,1.07);shape.closePath();
   add(g,new THREE.ExtrudeGeometry(shape,{depth:.055,bevelEnabled:false,curveSegments:16}).translate(0,0,-.0275),mat(0x8fa6b4,{metalness:.6,roughness:.25}),0,0,0);
   beam(g,[side*.12,.04,.012],[side*.025,1.08,.012],.0024,cream);
  }
  box(g,.05,.007,.022,cream,0,1.225,0);g.userData.openCrown=true;
  return finish(g,'tapered rounded glass mass, central seam, separated ear crown and Sky Bridge');
 };
 builders.building63=()=>{
  const g=new THREE.Group(),gold=mat(0xc4a253,{metalness:.72,roughness:.24,map:TEXTURES.windows}),trim=mat(0xb99a5a,{metalness:.5});
  box(g,.59,.045,.36,stone,0,0,0);const body=add(g,loftedTower(1.15,t=>.17*(1-.23*t),{corner:.55,steps:45,segments:5}),gold,0,.045,0);body.scale.z=.51;
  for(let k=0;k<61;k++){const t=k/61,w=.31*(1-.23*t);for(const side of [-1,1])box(g,w,.002,.0015,trim,0,.06+t*1.13,side*(w*.28));}
  box(g,.24,.035,.125,gold,-.008,1.19,0);g.userData.goldFacade=true;return finish(g,'gold curtain wall, narrow rounded slab plan, horizontal floor bands and stepped podium');
 };
 builders.hwaseong=()=>{
  const g=new THREE.Group();box(g,2.4,.012,1.65,JK.grass,0,-.012,0);archWall(g,{w:.9,depth:.38,openings:[0],radius:.105});hall(g,{y:.24,w:.69,d:.34,double:true,sign:'長安門'});
  for(const side of [-1,1])for(let i=0;i<9;i++){const x=side*(.49+i*.078),z=-i*.014;box(g,.08,.17,.11,stone,x,0,z);box(g,.038,.035,.115,stone,x,.17,z);box(g,.012,.032,.003,dark,x,.11,z+.057);}
  const inner=.43,outer=.49;
  for(let i=0;i<25;i++){const a=i/24*Math.PI,x=Math.cos(a)*outer,z=.1+Math.sin(a)*outer;box(g,.073,.15,.065,stone,x,0,z,-a);box(g,.04,.035,.065,stone,x,.15,z,-a);}
  for(let k=0;k<6;k++){const x=(k-2.5)*.36;if(Math.abs(x)<.45)continue;cyl(g,.003,.003,.28,wood,x,.17,-.03,6);box(g,.055,.09,.002,mat([0xe6bb36,0xb33d31,0x366b96,0xf0eee5,0x343b3b][k%5]),x+.025,.34,-.03);}
  g.userData.openGateCenters=[0];return finish(g,'Janganmun two eaved gate, arched stone entrance, semicircular ongseong and crenellated walls');
 };
 builders.bulguksa=()=>{
  const g=new THREE.Group();box(g,2.1,.012,1.9,JK.grass,0,-.012,0);box(g,1.85,.22,.85,stone,0,0,-.12);
  steps(g,-.45,.88,.30,12,.018,.045);steps(g,.43,.78,.22,9,.024,.045);
  hall(g,{x:-.45,y:.22,z:.25,w:.43,d:.23,sign:'紫霞門'});hall(g,{y:.22,z:-.55,w:.78,d:.42,sign:'大雄殿'});
  for(const x of [-.88,.88]){box(g,.1,.11,.92,wood,x,.22,-.12);irimoya(g,{x,y:.33,z:-.12,w:.13,d:1.0,h:.06,material:tile});}
  // Front-facing view: simple Seokgatap left, elaborate Dabotap right.
  const a=-.37,b=.38,y=.22,z=-.06;
  box(g,.21,.035,.21,stone,a,y,z);
  for(let k=0;k<3;k++){const w=.14-k*.026;box(g,w,.045,w,stone,a,y+.035+k*.064,z);add(g,new THREE.CylinderGeometry(w*.28,w*.85,.02,4).rotateY(Math.PI/4),stone,a,y+.090+k*.064,z);}
  cyl(g,.006,.012,.10,stone,a,y+.22,z,8);
  box(g,.22,.045,.22,stone,b,y,z);for(const side of [-1,1])steps(g,b+side*.11,z+.08,.06,3,.015,.023,y);
  for(const sx of [-1,1])for(const sz of [-1,1])box(g,.018,.11,.018,stone,b+sx*.067,y+.045,z+sz*.067);
  box(g,.21,.02,.21,stone,b,y+.155,z);cyl(g,.047,.06,.055,stone,b,y+.175,z,8);
  for(let k=0;k<8;k++){const angle=k*Math.PI/4;cyl(g,.004,.004,.048,stone,b+Math.cos(angle)*.072,y+.176,z+Math.sin(angle)*.072,6);}
  cyl(g,.07,.087,.018,stone,b,y+.231,z,8);cyl(g,.017,.033,.075,stone,b,y+.249,z,8);
  g.userData.pagodas={seokgatapX:a,dabotapX:b};return finish(g,'stone stair bridges, Jahamun, Daeungjeon, plain Seokgatap and ornate open Dabotap');
 };
 const originalBusan=builders.busanTower;
 builders.busanTower=()=>{const g=originalBusan();for(let k=0;k<20;k++){const a=k*Math.PI/10;beam(g,[Math.cos(a)*.15,.95,Math.sin(a)*.15],[Math.cos(a)*.145,1.01,Math.sin(a)*.145],.002,cream);}for(let i=0;i<5;i++)grove(g,-.35+i*.17,-.32,.14,44+i);panel(g,'BUSAN',0,.05,.40,.19,.035);return finish(g,'fluted shaft, pagoda inspired observation crown, Yongdusan park and tower plaza');};
 const previousBridge=builders.bridge;
 builders.bridge=(options={})=>{
  if(options.style!=='gwangan')return previousBridge(options);
  const g=new THREE.Group(),span=options.span??2,deck=span*.17;
  suspensionBridge2(g,{span,pylon:span*.38,deckY:deck,doubleDeck:true,lengthSide:.32,tower:0xe3e4df,truss:0xb9c1c6,beams:3});
  for(const y of [deck+.024,deck+.084])for(const side of [-1,1])for(let k=0;k<24;k++)box(g,span/40,.0015,.002,cream,-span*.8+k*span*1.6/23,y,side*.025);
  g.userData.bridgeStyle='gwangan';g.userData.roadDecks=2;g.userData.railDeck=false;return finish(g,'white suspension towers, upper and lower roadways, stiffening truss and open water below');
 };
 builders.haeundae=()=>{
  const g=new THREE.Group(),sand=mat(0xdccb9f,{roughness:1});
  box(g,2.4,.015,1.1,mat(0x647b60),0,-.015,0);
  const beach=new THREE.Shape();beach.moveTo(-1.2,.28);beach.quadraticCurveTo(0,.52,1.2,.28);beach.lineTo(1.2,.65);beach.quadraticCurveTo(0,.87,-1.2,.65);beach.closePath();
  const m=add(g,new THREE.ShapeGeometry(beach,32),sand,0,.008,1.0);m.rotation.x=-Math.PI/2;
  // Three LCT masses: the central Landmark Tower is visibly tallest.
  for(const [x,z,height,w] of [[0,-.07,1.35,.18],[-.30,-.03,1.08,.15],[.30,-.03,1.08,.15]]){
   const tower=add(g,loftedTower(height,t=>w/2*(1-.13*t),{corner:.4,steps:30,segments:4}),glass,x,0,z);tower.scale.z=.78;
   const crown=new THREE.Shape();crown.moveTo(-w/2,0);crown.lineTo(w/2,0);crown.lineTo(w*.25,.12);crown.lineTo(-w*.30,.07);crown.closePath();add(g,new THREE.ExtrudeGeometry(crown,{depth:w*.60,bevelEnabled:false}).translate(0,0,-w*.30),cream,x,height,z);
  }
  for(let k=0;k<6;k++)box(g,.11,.48+(k%3)*.15,.12,glass,-1.0+k*.15,0,-.22);
  for(let k=0;k<14;k++){const x=-1.1+k*.17;cyl(g,.002,.002,.04,wood,x,.012,.54,5);const canopy=add(g,new THREE.ConeGeometry(.025,.014,8),k%2?cream:mat(0x66859b),x,.057,.54);canopy.rotation.y=k*.4;}
  box(g,2.4,.009,.055,stone,0,.012,.27);return finish(g,'LCT three towers, sloping crowns, curved sandy beach, parasols and coastal promenade');
 };
 // Summit details sit on the existing East Asia DEM, rather than adding a second full mountain.
 function radialSurface(g,{rx,rz,height,color,rings=20,segments=80}){
  const positions=[],colors=[],indices=[];
  for(let j=0;j<=rings;j++)for(let k=0;k<=segments;k++){
   const r=j/rings,a=k/segments*Math.PI*2,y=height(r,a),c=new THREE.Color(color(r,a,y));
   positions.push(Math.cos(a)*r*rx,y,Math.sin(a)*r*rz);colors.push(c.r,c.g,c.b);
   if(j<rings&&k<segments){const i=j*(segments+1)+k;indices.push(i,i+1,i+segments+1,i+1,i+segments+2,i+segments+1);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const m=add(g,geometry,mat(0xffffff,{vertexColors:true,roughness:1}),0,0,0);m.userData.summitSurface=true;return m;
 }
 builders.seongsan=()=>{
  const g=new THREE.Group();
  radialSurface(g,{rx:.45,rz:.36,height:(r,a)=>r<.68?-.050+.065*(r/.68)**3:(.020+.012*Math.sin(a*13))-(r-.68)*.60,
   color:r=>r<.68?0x718142:r<.82?0x969465:0x8e8062});
  const tuff=mat(0xa49d7b,{roughness:1});
  for(let i=0;i<19;i++){const a=i/19*Math.PI*2,r=.34+Math.sin(i*2.1)*.012;add(g,roughMass(.021,.013+(i%4)*.003,.020,{seed:620+i,jitter:.22,detail:1}),tuff,Math.cos(a)*r,.008,Math.sin(a)*r*.80);}
  for(let k=0;k<22;k++){const a=.7+k*.018,r=.93-k*.011;box(g,.016,.004,.025,wood,Math.cos(a)*r*.45,-.13+k*.006,Math.sin(a)*r*.36,-a);}
  g.userData.terrainSummit=true;g.userData.crater=true;return finish(g,'steep layered tuff rim, depressed grass crater, crenellated rocks and ascent boardwalk');
 };
 builders.hallasan=()=>{
  const g=new THREE.Group();
  radialSurface(g,{rx:.30,rz:.22,height:(r,a)=>r<.45?-.035+.008*r:(r<.72?-.027+(r-.45)*.31:.057-(r-.72)*.27)+Math.sin(a*7)*r*.008,
   color:r=>r<.46?0x797a5a:r<.78?0x999e91:0x64784f});
  const pool=add(g,new THREE.CircleGeometry(.104,64),mat(0x3c6f89,{roughness:.24,metalness:.15}),0,-.027,0);pool.rotation.x=-Math.PI/2;pool.scale.y=.68;
  for(let i=0;i<8;i++){const a=i/8*Math.PI*2;add(g,roughMass(.035,.018,.025,{seed:750+i,jitter:.13,detail:1}),leaf,Math.cos(a)*.28,-.008,Math.sin(a)*.21);}
  g.userData.terrainSummit=true;g.userData.craterLake=true;return finish(g,'Baengnokdam oval crater lake, asymmetric granite rim and alpine scrub');
 };
 builders.seoraksan=()=>{
  const g=new THREE.Group();
  for(let i=0;i<7;i++){const x=-.24+i*.08,z=Math.sin(i*1.9)*.035;
   const rock=add(g,roughMass(.065,.055+(i%3)*.025,.075,{seed:810+i,jitter:.18,detail:2}),pale,x,-.018,z);rock.rotation.z=(i-3)*.08;
   for(let k=0;k<3;k++)box(g,.002,.035,.002,dark,x-.03+k*.024,.012,z+.048);
  }
  box(g,.026,.045,.018,stone,0,.045,0);panel(g,'大青峰',0,.064,.010,.022,.012);
  for(let i=0;i<9;i++)add(g,roughMass(.045,.022,.034,{seed:830+i,jitter:.2,detail:1}),leaf,-.26+i*.065,-.01,-.10);
  g.userData.terrainSummit=true;return finish(g,'fractured pale granite summit ridge, Daecheongbong marker and low alpine scrub');
 };
 builders.jirisan=()=>{
  const g=new THREE.Group();
  radialSurface(g,{rx:.33,rz:.23,rings:12,segments:48,height:(r,a)=>.047*(1-r)+.012*Math.sin(a*3)*r,
   color:r=>r<.50?0xa5a79b:r<.70?0x73805d:0x466640});
  for(let i=0;i<6;i++)add(g,roughMass(.075,.025,.055,{seed:910+i,jitter:.14,detail:1}),pale,-.21+i*.075,.018,Math.sin(i*2)*.06);
  const marker=add(g,roughMass(.023,.044,.016,{seed:930,jitter:.08,detail:1}),stone,0,.073,0);
  panel(g,'天王峰',0,.075,.017,.035,.016);
  g.userData.terrainSummit=true;return finish(g,'broad Cheonwangbong granite crest, summit marker, wooded shoulders and rounded ridgeline');
 };
 const oldDokdo=builders.dokdo;
 builders.dokdo=()=>{
  const g=oldDokdo(),white=mat(0xe9e9e0),pad=mat(0x6c7773),dock=mat(0x92978f);
  // Facilities belong to the lower eastern islet; leave the western summit wild.
  box(g,.19,.012,.16,pad,.53,.64,.13);
  for(const x of [.48,.58])box(g,.008,.002,.10,white,x,.653,.13);box(g,.10,.002,.008,white,.53,.653,.13);
  box(g,.34,.025,.10,dock,.61,.008,.44);box(g,.08,.022,.27,dock,.80,.008,.35);
  for(let k=0;k<25;k++){const t=k/24;box(g,.031,.005,.018,stone,.72-t*.31,.04+t*.49,.34-t*.14);}
  cyl(g,.025,.032,.085,white,.34,.73,0,12);cyl(g,.041,.041,.009,dark,.34,.81,0,12);
  g.userData.facilitiesOnEast=true;return finish(g,'two unequal volcanic islets, eastern lighthouse and H helipad, wharf and cliff stairs');
 };
 const oldHaeinsa=builders.haeinsa;
 builders.haeinsa=()=>{
  const g=oldHaeinsa();
  for(const z of [-.25,-.62])for(let bay=0;bay<13;bay++){
   const x=-.59+bay*.099;
   for(let slit=0;slit<4;slit++)box(g,.002,.055,.002,wood,x+slit*.008,.294,z+.104);
   for(let slit=0;slit<6;slit++)box(g,.002,.035,.002,wood,x+slit*.008,.253,z+.104);
  }
  for(let i=0;i<18;i++)box(g,.018,.015,.058,mat(0x483525),-.54+i*.064,.252,-.14);
  panel(g,'藏經板殿',0,.38,-.142,.20,.038);panel(g,'大寂光殿',0,.36,.74,.18,.036);
  g.userData.ventilatedArchives=true;return finish(g,'sloping terraces, main hall, two long woodblock archives with unequal upper and lower ventilation slats');
 };
 builders.namiIsland=()=>{
  const g=new THREE.Group(),bark=mat(0x77523c,{roughness:1}),ochre=mat(0x977444,{roughness:1}),foliage=mat(0x688349,{roughness:1}),sand=mat(0xc2b497,{roughness:1});
  box(g,1.6,.012,2.7,JK.grass,0,-.012,0);box(g,.33,.008,2.7,sand,0,0,0);
  for(const side of [-1,1])for(let i=0;i<12;i++){
   const x=side*.25,z=-1.20+i*.215,hh=.64+(i%3)*.035;cyl(g,.012,.023,hh,bark,x,0,z,8);
   for(let tier=0;tier<5;tier++){
    const yy=.20+tier*.09,r=.11*(1-tier*.13);
    for(let branch=0;branch<5;branch++){
     const a=branch*Math.PI*.4+tier*.7,tip=[x+Math.cos(a)*r,yy+.035,z+Math.sin(a)*r];beam(g,[x,yy,z],tip,.003,bark);
     add(g,roughMass(r*.48,.037,r*.35,{seed:1200+i*20+tier*5+branch,jitter:.13,detail:1}),i%4?foliage:ochre,...tip);
    }
   }
  }
  for(const side of [-1,1])for(let i=0;i<12;i++)add(g,new THREE.ConeGeometry(.035,.13,8),foliage,side*.25,.63+(i%3)*.035,-1.20+i*.215);
  for(const side of [-1,1]){box(g,.22,.006,2.7,JK.water,side*.92,-.004,0);for(let i=0;i<4;i++){const z=-.95+i*.60;box(g,.13,.025,.055,wood,side*.60,.04,z);for(const x of [-.04,.04])box(g,.012,.04,.045,bark,side*.60+x,0,z);}}
  box(g,.26,.025,.15,wood,.66,.006,1.30);g.userData.clearAvenue=true;
  return finish(g,'paired dawn redwood trunks and tiered branches, clear central path, benches, river edges and small pier');
 };
}
