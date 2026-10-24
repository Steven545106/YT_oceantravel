// Permanent exterior features based on the public references in taiwan-reference-data.js.
// Street blocks and lantern positions are compressed for the sailing game's miniature scale.
import * as THREE from 'three';
export function addTaiwanVillages({builders,lmAdd:add,lmBox:box,lmCyl:cyl,lmMaterial:baseMat,mergeByMaterial:merge,roughMass,TEXTURES}){
 const mat=(color,extra={})=>baseMat(color,{emissiveIntensity:0,...extra});
 const V=(x,y,z)=>new THREE.Vector3(x,y,z);
 function rod(g,a,b,r,m){const d=b.clone().sub(a),mesh=add(g,new THREE.CylinderGeometry(r,r,d.length(),6),m,...a.clone().add(b).multiplyScalar(.5).toArray());mesh.quaternion.setFromUnitVectors(V(0,1,0),d.normalize());}
 function plaque(g,text,w,h,x,y,z,color='#f0dfb4',bg='#3c574c'){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const c=canvas.getContext('2d');c.fillStyle=bg;c.fillRect(0,0,512,128);c.fillStyle=color;c.font='bold 72px "PingFang TC", "Microsoft JhengHei", sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(text,256,68,490);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
  add(g,new THREE.PlaneGeometry(w,h),mat(0xffffff,{map,roughness:.8}),x,y,z);
 }
 function hip(g,w,d,h,x,y,z,m){
  const vertices=[[-w/2,0,-d/2],[w/2,0,-d/2],[w/2,0,d/2],[-w/2,0,d/2],[-w*.26,h,0],[w*.26,h,0]],faces=[[0,4,5],[0,5,1],[3,2,5],[3,5,4],[0,3,4],[1,5,2]],p=[],uv=[];
  for(const face of faces)for(const i of face){const v=vertices[i];p.push(...v);uv.push(v[0]*6,(v[2]+v[1])*6);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.computeVertexNormals();add(g,geo,m,x,y,z);
  box(g,w*.54,.015,.023,m,x,y+h-.004,z);
  for(let k=1;k<18;k++){
   const xx=-w*.45+k*w*.9/18,topX=THREE.MathUtils.clamp(xx,-w*.26,w*.26);
   for(const side of [-1,1])rod(g,V(x+xx,y,z+side*d/2),V(x+topX,y+h,z),.0025,m);
  }
 }
 function gable(g,w,d,h,x,y,z,m){
  const s=new THREE.Shape();s.moveTo(-w/2,0);s.lineTo(w/2,0);s.lineTo(0,h);s.closePath();
  const geo=new THREE.ExtrudeGeometry(s,{depth:d,bevelEnabled:false});geo.translate(0,0,-d/2);add(g,geo,m,x,y,z);
 }
 function tree(g,x,z,size,seed,bark,leaf){
  cyl(g,.015*size,.027*size,.48*size,bark,x,.02,z,8);
  for(const [dx,dy,dz] of [[-.13,.48,.02],[.15,.56,.04],[0,.68,-.08],[-.14,.64,-.08]]){
   rod(g,V(x,.28*size,z),V(x+dx*size,dy*size,z+dz*size),.011*size,bark);
   add(g,roughMass(.20*size,.18*size,.18*size,{seed:seed++,jitter:.16,detail:2}),leaf,x+dx*size,dy*size,z+dz*size);
  }
 }
 builders.shengliVillage=()=>{
  const g=new THREE.Group(),cream=mat(0xe8dfc7),white=mat(0xf1eddf),roof=mat(0x343d40,{map:TEXTURES.tiles,roughness:.65}),timber=mat(0x5d4435,{map:TEXTURES.wood}),green=mat(0x4c9280),glass=mat(0x90b6a2,{map:TEXTURES.windows,roughness:.3,emissive:0xffcf7d,emissiveIntensity:.1}),brick=mat(0x885a4a,{map:TEXTURES.brick}),pave=mat(0xa7a69c,{roughness:1}),grass=mat(0x6c884e,{roughness:1}),red=mat(0x963c36),bark=mat(0x615346),leaf=mat(0x527044,{roughness:1}),black=mat(0x303c39);
  box(g,2.8,.025,1.9,grass,0,-.025,0);box(g,2.8,.014,.28,pave,0,.002,.73);box(g,.22,.016,1.65,pave,-.26,.003,-.08);
  function house(x,z,w,d,main=false){
   box(g,w,.055,d,brick,x,.015,z);box(g,w,.25,d,cream,x,.07,z);box(g,w+.05,.015,d+.08,white,x,.315,z);
   hip(g,w+.16,d+.16,.17,x,.33,z,roof);
   // Horizontal weatherboards and regular timber window frames.
   for(let i=0;i<5;i++)box(g,w,.006,.008,timber,x,.08+i*.025,z+d/2+.006);
   for(const side of [-1,1]){
    const xx=x+side*w*.30,zz=z+d/2+.012;
    box(g,w*.24,.16,.012,green,xx,.11,zz);box(g,w*.20,.135,.014,glass,xx,.122,zz+.003);
    for(const offset of [-.075,0,.075])box(g,.006,.14,.016,white,xx+offset*w,.12,zz+.012);
    box(g,w*.23,.006,.016,white,xx,.185,zz+.013);
   }
   box(g,.09,.205,.018,green,x,.07,z+d/2+.018);box(g,.07,.13,.012,glass,x,.13,z+d/2+.03);
   box(g,.16,.025,.12,pave,x,.02,z+d/2+.075);
   if(main){
    box(g,.25,.13,.25,white,x+.12,.46,z-.015);gable(g,.30,.30,.10,x+.12,.59,z-.015,roof);
    box(g,.14,.075,.012,green,x+.12,.485,z+.118);for(let j=-1;j<=1;j++)box(g,.005,.08,.014,white,x+.12+j*.045,.482,z+.126);
    gable(g,.23,.18,.07,x,.333,z+d/2+.04,white);gable(g,.28,.22,.07,x,.37,z+d/2+.04,roof);
   }
   // Actual hipped roofs have gutters and downpipes rather than temple roof ornaments.
   box(g,w+.10,.008,.012,black,x,.328,z+d/2+.07);cyl(g,.004,.004,.28,black,x+w*.46,.04,z+d/2+.07,6);
  }
  house(.48,.06,.86,.47,true);house(-.84,-.30,.66,.43);house(.55,-.64,.76,.38);house(-.78,.36,.62,.37);
  // Low garden walls, open red gate and the broad shaded front yard.
  for(const x of [-.03,1.0])box(g,.12,.20,.12,white,x,.02,.49);
  box(g,.23,.19,.022,red,.15,.02,.49);box(g,.50,.17,.04,white,.70,.02,.49);
  plaque(g,'將軍之屋',.18,.045,.48,.29,.31);plaque(g,'勝利星村',.39,.09,-.18,.145,.618);
  for(const [x,z,s] of [[1.12,.21,1.15],[-1.12,-.6,1.0],[.04,-.7,.83]])tree(g,x,z,s,4100,bark,leaf);
  for(const x of [-1.15,-.45,.28,.98]){cyl(g,.007,.008,.30,black,x,.02,.59,6);box(g,.042,.06,.042,white,x,.32,.59);gable(g,.055,.055,.025,x,.38,.59,black);}
  for(let i=0;i<14;i++)add(g,roughMass(.075,.025,.045,{seed:4200+i,jitter:.13,detail:1}),leaf,-1.26+i*.19,.035,.51);
  const model=merge(g);model.userData.referencePass='taiwan-villages-2026';model.userData.houses=4;return model;
 };
 builders.pingxiLanterns=()=>{
  const g=new THREE.Group(),base=mat(0x77766e,{roughness:1}),pave=mat(0xb4aca0),rail=mat(0x5c6668,{metalness:.65,roughness:.4}),wood=mat(0x685347,{map:TEXTURES.wood}),tile=mat(0x4b5655,{map:TEXTURES.tiles}),cream=mat(0xd9cdb6),brick=mat(0x9c6550,{map:TEXTURES.brick}),gray=mat(0xa6a9a0),dark=mat(0x314346),trim=mat(0xc6b995),yellow=mat(0xf2b63a),orange=mat(0xe77830),silver=mat(0xa7b1af,{metalness:.5}),leaf=mat(0x4f7146,{roughness:1});
  const paperColors=[0xd94431,0xf5b946,0xe07896,0x5aab9a],papers=paperColors.map(color=>mat(color,{roughness:.85,side:THREE.DoubleSide,emissive:color,emissiveIntensity:.7}));
  const flame=mat(0xffd079,{emissive:0xffa328,emissiveIntensity:1.5}),panes=mat(0x91b3bd,{map:TEXTURES.windows,roughness:.3,emissive:0xffc47f,emissiveIntensity:.12});
  box(g,2.25,.035,2.50,base,0,-.035,0);box(g,.66,.012,2.50,pave,0,.002,0);
  for(let i=0;i<42;i++)box(g,.32,.014,.027,wood,0,.016,-1.2+i*.058);
  for(const x of [-.108,.108])box(g,.013,.022,2.5,rail,x,.026,0);
  // Irregular two-storey street-front shops tightly line the railway.
  const signs=['天燈','祈福','十分幸福','老街','天燈','平安'];
  for(const side of [-1,1])for(let i=0;i<5;i++){
   const z=-.91+i*.43,x=side*.76,h=.32+(i%3)*.06,w=.55,d=.38,m=i%2?cream:brick;
   box(g,w,h,d,m,x,.035,z);box(g,w,.12,d,gray,x,h+.035,z);
   if(i%3===0){box(g,w+.05,.024,d+.05,gray,x,h+.155,z);box(g,.018,.045,d+.05,cream,x+side*w*.48,h+.18,z);}
   else if(i%3===1)gable(g,w+.06,d+.06,.09,x,h+.16,z,tile);
   else hip(g,w+.06,d+.06,.07,x,h+.16,z,tile);
   // Windows face the railway; timber muntins remain readable close up.
   for(let j=0;j<2;j++){
    box(g,.012,.105,.095,panes,side*.478,h-.08,z-.10+j*.20);
    box(g,.018,.10,.006,trim,side*.466,h-.076,z-.10+j*.20);
   }
   box(g,.018,.17,.22,dark,side*.477,.035,z);box(g,.020,.009,.24,trim,side*.465,.125,z);
   const awning=box(g,.26,.012,.39,i%2?yellow:tile,side*.405,.25,z);awning.rotation.z=side*.18;
   for(let k=0;k<6;k++)box(g,.26,.005,.008,trim,side*.405,.262,z-.17+k*.066);
   box(g,.06,.21,.10,i%2?yellow:cream,side*.43,.39,z+.15);
   // Sign boards are oriented into the street, using generic names instead of business logos.
   const sign=new THREE.Group();plaque(sign,signs[i],.24,.055,0,.29,0,'#f8e8af',i%2?'#8c332e':'#335c57');sign.rotation.y=-side*Math.PI/2;sign.position.set(side*.36,0,z);g.add(sign);
   for(let j=0;j<2;j++)add(g,new THREE.SphereGeometry(.026,10,8),papers[0],side*.38,.235,z-.12+j*.23);
  }
  // One DR1000-inspired railcar at the far end leaves the release scene open.
  box(g,.20,.18,.53,silver,0,.075,-1.02);box(g,.21,.052,.54,orange,0,.075,-1.02);box(g,.20,.205,.018,yellow,0,.075,-.748);
  for(const x of [-.064,.064]){box(g,.060,.093,.022,dark,x,.16,-.736);add(g,new THREE.SphereGeometry(.012,10,8),flame,x,.135,-.721);}
  box(g,.04,.14,.022,orange,0,.10,-.733);box(g,.022,.04,.024,dark,0,.19,-.719);
  for(const side of [-1,1])for(let i=0;i<4;i++)box(g,.012,.07,.065,dark,side*.106,.17,-1.21+i*.12);
  // Open-bottom paper lanterns: tapered mouth, swollen envelope, sewn vertical seams.
  const lanternData=[[-.09,.11,.73,1],[.17,.36,.27,.85],[-.26,.62,-.03,.77],[.12,.86,-.45,.68],[-.38,1.12,-.72,.57],[.37,1.30,-.90,.50],[.49,.73,.57,.70]];
  lanternData.forEach(([x,y,z,s],index)=>{
   const holder=new THREE.Group(),points=[[.038,0],[.050,.035],[.085,.12],[.092,.19],[.080,.235],[.035,.27],[0,.277]].map(([r,h])=>new THREE.Vector2(r,h));
   const color=index%4,geo=new THREE.LatheGeometry(points,24);geo.rotateY(Math.PI/4);add(holder,geo,papers[color]);
   for(let seam=0;seam<4;seam++){
    const a=seam*Math.PI/2+Math.PI/4,curve=points.slice(0,-1).map(p=>V(Math.cos(a)*p.x,p.y,Math.sin(a)*p.x));
    add(holder,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curve),16,.0011,4,false),trim);
   }
   add(holder,new THREE.TorusGeometry(.038,.002,5,20).rotateX(Math.PI/2),wood);
   rod(holder,V(-.03,.005,0),V(.03,.005,0),.0015,wood);rod(holder,V(0,.005,-.03),V(0,.005,.03),.0015,wood);
   add(holder,new THREE.SphereGeometry(.015,10,8),flame,0,.019,0);holder.scale.setScalar(s);holder.position.set(x,y,z);holder.rotation.z=(index%2?1:-1)*.08;g.add(holder);
  });
  // Utility poles and sagging cables distinguish the lived-in rail town from a temple street.
  for(const side of [-1,1]){
   cyl(g,.009,.012,.66,wood,side*.34,.025,.63,8);box(g,.13,.012,.012,rail,side*.34,.63,.63);
   const points=[V(side*.34,.65,.63),V(side*.32,.56,-.1),V(side*.34,.65,-1.15)];add(g,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),20,.002,4,false),dark);
  }
  plaque(g,'十分 · 平溪天燈',.42,.07,0,.048,1.258,'#f6dfaa','#495b52');
  for(const side of [-1,1])for(let k=0;k<5;k++)add(g,roughMass(.13,.12,.12,{seed:4300+k,jitter:.18,detail:1}),leaf,side*1.03,.10,-1.02+k*.46);
  const model=merge(g);model.userData.referencePass='taiwan-villages-2026';model.userData.lanternCount=lanternData.length;model.userData.railGauge=.216;return model;
 };
}
