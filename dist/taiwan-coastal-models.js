// Original procedural miniatures based on the official references, not scanned assets.
import * as THREE from 'three';
import {GUISHAN_OUTLINE} from './taiwan-coastal-data.js';
export function addTaiwanCoastalModels({builders,lmAdd:add,lmBox:box,lmCyl:cyl,lmMaterial:baseMat,mergeByMaterial:merge,roughMass,patternTexture}){
 const mat=(color,extra={})=>baseMat(color,{emissiveIntensity:0,...extra}),V=(x,y,z)=>new THREE.Vector3(x,y,z);
 const rock=mat(0x847e6d,{roughness:.98}),stone=mat(0xb8b09a,{roughness:.98}),leaf=mat(0x486f3e,{roughness:1}),concrete=mat(0xd4d0be),iron=mat(0xddd9c9),red=mat(0xa8583e),road=mat(0x626869,{roughness:.95});
 function tube(g,points,r,m,segments=48){return add(g,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),segments,r,6,false),m);}
 function rod(g,a,b,r,m){const delta=b.clone().sub(a),o=add(g,new THREE.CylinderGeometry(r,r,delta.length(),6),m,...a.clone().add(b).multiplyScalar(.5).toArray());o.quaternion.setFromUnitVectors(V(0,1,0),delta.normalize());}
 function label(g,text,w,h,x,y,z){const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');ctx.clearRect(0,0,512,128);ctx.fillStyle='#315e68';ctx.font='bold 78px "PingFang TC", "Microsoft JhengHei", sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,70,480);const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;add(g,new THREE.PlaneGeometry(w,h),mat(0xffffff,{map,transparent:true,alphaTest:.1}),x,y,z);}
 function mass(g,x,y,z,w,h,d,seed,m=rock){return add(g,roughMass(w,h,d,{seed,jitter:.14,detail:2}),m,x,y,z);}
 function finish(g,type){const model=merge(g);model.userData.referencePass='taiwan-coast-2026';model.userData.coastalType=type;return model;}
 builders.sanxiantai=()=>{
  const g=new THREE.Group(),underside=mat(0x7eaaa4),sand=mat(0xbcb5a0,{roughness:1});
  // Mainland to the west and the volcanic island to the east; no slab beneath the open spans.
  mass(g,-1.02,.015,0,.29,.05,.25,5000,sand);
  mass(g,.75,.028,0,.56,.08,.29,5001);
  for(const [x,z,w,h,d,seed] of [[.47,-.10,.15,.18,.12,5002],[.76,.05,.22,.30,.17,5003],[1.02,-.08,.17,.23,.13,5004]]){
   mass(g,x,h*.65,z,w,h,d,seed);
   for(let k=0;k<8;k++){const a=k*2.4;mass(g,x+Math.cos(a)*w*.35,h*1.45+.014*Math.sin(k),z+Math.sin(a)*d*.35,w*.28,.035,d*.3,seed+10+k,leaf);}
  }
  // Eight distinct wave-shaped walkways and true open arches, with stepped treads and railings.
  const start=-.91,span=1.27,bay=span/8;
  for(let i=0;i<8;i++){
   const x0=start+i*bay,path=[];
   for(let j=0;j<=12;j++){const t=j/12;path.push(V(x0+t*bay,.065+.078*Math.sin(Math.PI*t),0));}
   for(const side of [-1,1]){
    const arch=new THREE.Shape();arch.moveTo(x0,.045);
    for(let j=0;j<=20;j++){const t=j/20;arch.lineTo(x0+t*bay,.055+.075*Math.sin(Math.PI*t));}
    for(let j=20;j>=0;j--){const t=j/20;arch.lineTo(x0+t*bay,.038+.060*Math.sin(Math.PI*t));}arch.closePath();
    const geo=new THREE.ExtrudeGeometry(arch,{depth:.009,bevelEnabled:false,curveSegments:12});add(g,geo,underside,0,0,side*.041-.0045);
    tube(g,path.map(p=>p.clone().add(V(0,.055,side*.047))),.003,iron,30);
    tube(g,path.map(p=>p.clone().add(V(0,.027,side*.047))),.0025,iron,30);
    for(let j=0;j<path.length;j+=2){const p=path[j];rod(g,V(p.x,p.y,side*.047),V(p.x,p.y+.057,side*.047),.002,concrete);}
   }
   for(let j=0;j<12;j++){const p=path[j];box(g,bay/12+.001,.013,.085,red,p.x+bay/24,p.y-.008,0);}
   box(g,.026,.075,.070,concrete,x0,-.025,0);
  }
  box(g,.026,.075,.07,concrete,start+span,-.025,0);
  tube(g,[V(.37,.09,0),V(.50,.12,-.08),V(.66,.12,-.08),V(.84,.15,.06)],.012,sand,40);
  cyl(g,.010,.014,.06,iron,.98,.34,-.08,10);cyl(g,.014,.014,.012,red,.98,.40,-.08,10);
  const model=finish(g,'sanxiantai');model.userData.archCount=8;return model;
 };
 builders.vaseRock=()=>{
  const g=new THREE.Group();
  const coral=patternTexture((ctx,s)=>{ctx.fillStyle='#c9c2a8';ctx.fillRect(0,0,s,s);let seed=127;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};for(let i=0;i<650;i++){const x=random()*s,y=random()*s;ctx.fillStyle=i%3?'#aaa28e':'#dbd2bb';ctx.beginPath();ctx.ellipse(x,y,.4+random()*1.8,.5+random()*1.3,random()*6,0,Math.PI*2);ctx.fill();}});
  const limestone=mat(0xc8bea2,{map:coral,roughness:.97});
  const profile=[[.13,0],[.12,.04],[.09,.12],[.085,.22],[.12,.32],[.22,.41],[.30,.50],[.29,.57],[.24,.62],[.12,.65],[0,.65]];
  const geo=new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),48),p=geo.attributes.position;
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),noise=Math.sin(x*63+y*31)*Math.cos(z*57-y*13);p.setXYZ(i,x*(1+.12*noise)+.025*y,y+.004*noise,z*(1+.10*noise));}geo.computeVertexNormals();
  add(g,geo,limestone);
  mass(g,0,-.025,0,.40,.025,.32,5100,stone);
  for(let i=0;i<13;i++){const a=i*2.4,r=.17*Math.sqrt((i+1)/13);mass(g,Math.cos(a)*r+.014,.65,Math.sin(a)*r,.08,.027,.06,5110+i,leaf);}
  // Low coral shelves, rather than a generic round pedestal.
  for(let i=0;i<9;i++)mass(g,-.34+i*.085,-.016,-.22+.025*Math.sin(i),.09,.02,.08,5150+i,stone);
  const model=finish(g,'vaseRock');model.userData.narrowNeck=true;return model;
 };
 builders.penghuBridge=()=>{
  const g=new THREE.Group(),white=mat(0xe7e4d5),yellow=mat(0xd4b84c),blue=mat(0x3d7f8b),grass=mat(0x718756,{roughness:1});
  const length=1.45,w=.085,deck=.14;
  box(g,length,.024,w,concrete,0,deck-.024,0);box(g,length,.004,w*.83,road,0,deck+.001,0);
  for(const side of [-1,1]){
   box(g,length,.024,.006,white,0,deck+.004,side*w*.54);box(g,length,.007,.009,white,0,deck+.033,side*w*.54);
   for(let i=0;i<58;i++)box(g,.005,.03,.005,white,-length/2+i*length/57,deck+.007,side*w*.54);
  }
  for(let i=0;i<28;i++){const x=-length/2+i*length/27;cyl(g,.011,.014,.145,concrete,x,-.03,0,8);box(g,.032,.012,.07,concrete,x,deck-.034,0);}
  for(let i=0;i<31;i++)box(g,.020,.001,.002,yellow,-length/2+.024+i*.046,deck+.007,0);
  for(const x of [-length/2,length/2]){
   // White half-circle bridge gate with a real opening across the roadway.
   const arch=new THREE.Shape();arch.moveTo(-.10,0);arch.lineTo(-.10,.07);arch.absarc(0,.07,.10,Math.PI,0,true);arch.lineTo(.10,0);arch.lineTo(.082,0);arch.lineTo(.082,.07);arch.absarc(0,.07,.082,0,Math.PI,false);arch.lineTo(-.082,0);arch.closePath();
   const m=add(g,new THREE.ExtrudeGeometry(arch,{depth:.022,bevelEnabled:false,curveSegments:32}),white,x,deck,0);m.rotation.y=Math.PI/2;
   for(const side of [-1,1])box(g,.065,.052,.038,blue,x,deck-.012,side*.091);
   const sign=new THREE.Group();label(sign,'澎湖跨海大橋',.15,.024,0,.145,.024);sign.rotation.y=Math.PI/2;sign.position.set(x,deck,0);g.add(sign);
   mass(g,x+Math.sign(x)*.10,.012,0,.16,.035,.17,x<0?5200:5201,grass);
  }
  // Weathered remains of the former bridge beside the newer roadway.
  for(let i=0;i<8;i++)box(g,.014,.042,.016,stone,-.60+i*.06,-.012,.115);
  for(const x of [-.6,-.3,0,.3,.6]){rod(g,V(x,deck,.06),V(x,deck+.13,.06),.0025,iron);tube(g,[V(x,deck+.13,.06),V(x,deck+.15,.04),V(x,deck+.14,.025)],.0025,iron,12);}
  const model=finish(g,'penghuBridge');model.userData.openGate=true;return model;
 };
 builders.twinHearts=()=>{
  const g=new THREE.Group(),basalt=[mat(0x393c36,{roughness:.99}),mat(0x4b4f44,{roughness:.99}),mat(0x6d6e5c,{roughness:.99})],sand=mat(0xb5ac8e,{roughness:1}),pool=mat(0x549e9f,{roughness:.16,transparent:true,opacity:.55,depthWrite:false});
  function heart(cx,cz){const pts=[];for(let i=0;i<=90;i++){const t=i/90*Math.PI*2;pts.push(V(cx+16*Math.sin(t)**3*.015,.025,cz-(13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t))*.015));}return pts;}
  function wall(points,seed){const curve=new THREE.CatmullRomCurve3(points),count=Math.ceil(curve.getLength()/.018);for(let i=0;i<count;i++){const p=curve.getPoint(i/count),q=curve.getPoint(Math.min(1,(i+.5)/count));for(let tier=0;tier<2;tier++){const o=add(g,new THREE.DodecahedronGeometry(.012,0),basalt[(i+tier)%3],p.x+.003*Math.sin(i*3+seed),.012+tier*.016,p.z);o.scale.set(1.8,.65,1.4);o.rotation.y=Math.atan2(q.x-p.x,q.z-p.z);}}}
  const hearts=[heart(-.235,0),heart(.235,.035)];hearts.forEach((p,i)=>{wall(p,5300+i);const shape=new THREE.Shape(p.map(v=>new THREE.Vector2(v.x,-v.z)));const water=new THREE.ShapeGeometry(shape,48);water.rotateX(-Math.PI/2);add(g,water,pool,0,.002,0);});
  wall([V(-.47,.02,.10),V(-.60,.02,.26),V(-.62,.02,.48)],5320);wall([V(.45,.02,.14),V(.59,.02,.31),V(.64,.02,.45)],5321);
  // An intertidal rock shelf behind the weirs; no solid fill inside the hearts.
  const shelf=new THREE.Shape();shelf.moveTo(-.88,-.43);shelf.bezierCurveTo(-.51,-.61,-.25,-.36,.02,-.43);shelf.bezierCurveTo(.28,-.37,.60,-.50,.86,-.41);shelf.lineTo(.90,-.53);shelf.lineTo(.73,-.64);shelf.lineTo(.51,-.59);shelf.lineTo(.30,-.68);shelf.lineTo(.02,-.61);shelf.lineTo(-.21,-.69);shelf.lineTo(-.46,-.62);shelf.lineTo(-.73,-.67);shelf.lineTo(-.92,-.55);shelf.closePath();add(g,new THREE.ExtrudeGeometry(shelf,{depth:.02,bevelEnabled:false}).rotateX(-Math.PI/2),sand,0,-.015,0);
  for(let i=0;i<35;i++)mass(g,-.76+i*.046,-.004,.52+.025*Math.sin(i),.030,.008,.025,5350+i,basalt[i%3]);
  const model=finish(g,'twinHearts');model.userData.heartCount=2;return model;
 };
 builders.guishanIsland=()=>{
  const g=new THREE.Group(),N=GUISHAN_OUTLINE.length,rings=18,positions=[],colors=[],uvs=[],indices=[];
  function height(x,z,r){const body=.185*Math.exp(-Math.pow((x+.035)/.23,4)-Math.pow((z+.025)/.13,2))+.045*Math.exp(-Math.pow((x-.09)/.075,2)-Math.pow((z+.045)/.06,2)),head=.135*Math.exp(-Math.pow((x-.28)/.082,2)-Math.pow((z-.005)/.08,2));let h=.025+(body+head)*(1-.45*r**5);if(x<-.23)h*=.33;const lakeR=Math.sqrt(((x+.205)/.045)**2+((z+.035)/.026)**2);if(lakeR<1.7)h=.044+(h-.044)*THREE.MathUtils.smoothstep(lakeR,.8,1.7);return h;}
  for(let ring=0;ring<=rings;ring++)for(let i=0;i<N;i++){
   const r=Math.max(.0001,ring/rings),[ox,oz]=GUISHAN_OUTLINE[i],x=ox*r,z=oz*r;
   const h=ring===rings?.009:height(x,z,r)+.003*Math.sin(x*83+z*31)*Math.sin(z*57);
   positions.push(x,h,z);uvs.push(x,z);
   const c=new THREE.Color();if(r>.88)c.setHex(0x857a59);else if(r>.68&&h>.05)c.setHex(0xa29a78);else c.setHex(0x3f6840);c.multiplyScalar(.92+.07*Math.sin(x*71+z*41)*Math.sin(x*13-z*33));colors.push(c.r,c.g,c.b);
   if(ring<rings){const a=ring*N+i,b=ring*N+(i+1)%N,c=(ring+1)*N+i,d=(ring+1)*N+(i+1)%N;indices.push(a,c,b,b,c,d);}
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.computeVertexNormals();
  // Match outward/upward winding regardless of the coast dataset's contour direction.
  let ny=0;for(let i=0;i<geo.attributes.normal.count;i++)ny+=geo.attributes.normal.getY(i);if(ny<0){const a=geo.index.array;for(let i=0;i<a.length;i+=3)[a[i+1],a[i+2]]=[a[i+2],a[i+1]];geo.computeVertexNormals();}
  add(g,geo,mat(0xffffff,{vertexColors:true,roughness:1}));
  const lake=add(g,new THREE.CircleGeometry(.045,40).rotateX(-Math.PI/2),mat(0x4d8c83,{roughness:.2}),-.205,.045,-.035);lake.scale.z=.57;
  // North shore landing, tiny former settlement and the summit observation marker.
  box(g,.12,.012,.018,concrete,-.24,.015,-.19);box(g,.018,.012,.09,concrete,-.29,.015,-.22);
  for(let i=0;i<4;i++){box(g,.025,.018,.018,concrete,-.24+i*.032,.035,-.10);box(g,.030,.004,.023,road,-.24+i*.032,.053,-.10);}
  box(g,.012,.008,.012,concrete,.025,height(.025,-.025,.1)+.002,-.025);
  const milk=add(g,new THREE.CircleGeometry(.11,40).rotateX(-Math.PI/2),mat(0x83cbc1,{transparent:true,opacity:.30,roughness:.2,depthWrite:false}),.35,.001,.06);milk.scale.z=.5;
  const model=finish(g,'guishanIsland');model.userData.coastMatched=true;return model;
 };
}
