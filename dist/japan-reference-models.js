import * as THREE from 'three';

// Original procedural geometry based on the exterior references in japan-reference-data.js.
// Do not use downloaded photographs as textures. All repeated detail is merged by material.
export function refineJapanLandmarks(h) {
  const {builders,lmAdd:add,lmBox:box,lmCyl:cyl,lmHip:hip,lmMaterial:mat,patternTexture,mergeByMaterial:merge,
    roughMass,strutGeometry,curvedBeam,irimoya,templeHall,pagoda5,balustrade,gardenPine,starShape,suspensionBridge2,
    referencePlaque:plaque,JP,LM,TW,TEXTURES}=h;
  const dark=mat(0x242c2c,{roughness:.85}), wood=mat(0x70523c,{map:TEXTURES.wood}), cream=mat(0xe7e2d5),
    bronze=mat(0x5e8278,{roughness:.65,metalness:.35}), gold=mat(0xd5ad49,{roughness:.38,metalness:.65}),
    stone=mat(0xb3aba0,{map:TEXTURES.stone,roughness:.95});
  const V=(x,y,z)=>new THREE.Vector3(x,y,z);
  function beam(g,a,b,r,material){return add(g,strutGeometry(V(...a),V(...b),r),material);}
  function finish(g,features){const result=merge(g);result.userData={...g.userData,referencePass:'japan-2026',features};return result;}
  function refine(type,features,detail){
    const original=builders[type];
    builders[type]=(options={})=>{const g=original(options);detail(g,options);return finish(g,features);};
  }
  function panel(g,text,x,y,z,w,hh,colour='#e7ded0',background='#303632',yaw=0){
    // Plain plane UVs preserve the entire label, independent of the model's tiled box UV scale.
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;
    const c=canvas.getContext('2d');c.fillStyle=background;c.fillRect(0,0,512,256);c.fillStyle=colour;
    c.font='bold 155px "Hiragino Sans", "Yu Gothic", sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(text,256,135,480);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    return add(g,new THREE.PlaneGeometry(w,hh),mat(0xffffff,{map:texture,roughness:.8}),x,y+hh/2,z,yaw);
  }
  function windowGrid(g,{x=0,y,z,w,hh,cols=5,rows=2,yaw=0,frame=wood}){
    const holder=new THREE.Group();holder.position.set(x,y,z);holder.rotation.y=yaw;g.add(holder);
    box(holder,w,hh,.003,dark,0,0,0);
    for(let k=0;k<=cols;k++)box(holder,.002,hh,.006,frame,-w/2+k*w/cols,0,.002);
    for(let k=0;k<=rows;k++)box(holder,w,.002,.006,frame,0,k*hh/rows,.002);
  }
  // Wall with physically open windows, usable from both sides. No painted black rectangles.
  function piercedWall(g,{x=0,y=0,z=0,w,hh,d=.02,cols=3,rows=2,windowW=.07,windowH=.1,arch=false,yaw=0,material=stone}){
    const shape=new THREE.Shape([new THREE.Vector2(-w/2,0),new THREE.Vector2(w/2,0),new THREE.Vector2(w/2,hh),new THREE.Vector2(-w/2,hh)]);
    for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
      const cx=-w/2+(col+1)*w/(cols+1),bottom=.045+row*(hh-.065)/rows,ww=windowW/2;
      const hole=new THREE.Path();hole.moveTo(cx-ww,bottom);hole.lineTo(cx+ww,bottom);
      if(arch){const spring=bottom+windowH-ww;hole.lineTo(cx+ww,spring);hole.absarc(cx,spring,ww,0,Math.PI,false);}
      else {hole.lineTo(cx+ww,bottom+windowH);hole.lineTo(cx-ww,bottom+windowH);}
      hole.lineTo(cx-ww,bottom);shape.holes.push(hole);
    }
    return add(g,new THREE.ExtrudeGeometry(shape,{depth:d,bevelEnabled:false,curveSegments:12}).translate(0,0,-d/2),material,x,y,z,yaw);
  }
  function openGate(g,{x=0,y=0,z=0,w=.4,d=.16,hh=.16,roofH=.12,material=wood,double=true}){
    const gate=new THREE.Group();gate.position.set(x,y,z);g.add(gate);
    for(const px of [-w/2,-w/6,w/6,w/2])for(const pz of [-d/2,d/2])cyl(gate,.009,.011,hh,material,px,0,pz,8);
    box(gate,w+.02,.023,d+.02,material,0,hh,0);
    if(double){hip(gate,w*.4,w*.63,roofH*.42,JP.tileDark,0,hh+.02,0,d/w);box(gate,w*.8,.06,d*.7,material,0,hh+.055,0);}
    irimoya(gate,{y:hh+(double?.115:.02),w,d,h:roofH,material:JP.tileDark});
    return gate;
  }

  refine('tokyoTower','open lattice, external stairway, broadcast antennas',(g)=>{
    // Main deck at 150/333 of tower height; stair flights follow one inner leg.
    for(let k=0;k<35;k++){const t=k/34,y=.08+t*.35,x=.115*(1-t)+.025*t;box(g,.025,.002,.018,JP.white,x,y,.08*(1-t)+.025*t);}
    for(const side of [-1,1])beam(g,[side*.052,.48,0],[side*.052,.57,0],.0018,JP.white);
    for(const y of [.57,.6,.63])cyl(g,.027,.027,.003,JP.white,0,y,0,16);
  });
  refine('skytree','315m triangle-circle transition, spiral galleria',(g)=>{
    const points=[];
    for(let i=0;i<=72;i++){const a=i/72*Math.PI*2;points.push(V(Math.sin(a)*.046,.703+i/72*.022,Math.cos(a)*.046));}
    add(g,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),72,.0025,5,false),JP.white);
    for(let k=0;k<24;k++){const a=k/24*Math.PI*2;beam(g,[Math.sin(a)*.059,.543,Math.cos(a)*.059],[Math.sin(a)*.065,.58,Math.cos(a)*.065],.0015,JP.skytree);}
  });
  refine('sapporoTower','four digital clock faces, park paths',(g)=>{
    for(let k=0;k<4;k++){const a=k*Math.PI/2;panel(g,'12:00',Math.sin(a)*.078,.53,Math.cos(a)*.078,.095,.026,'#ffbf39','#171b1b',a);}
    for(const z of [-.09,.09])box(g,.85,.0015,.018,JP.gravel,-.42,.008,z);
    box(g,.35,.045,.26,cream,0,.025,0);
  });
  refine('kyotoTower','lighthouse shaft, glazed deck mullions, facade',(g)=>{
    panel(g,'KYOTO TOWER',-.2,.225,.162,.28,.025,'#bb382c','#eae6df');
    for(let k=0;k<24;k++){const a=k/24*Math.PI*2;cyl(g,.0014,.0014,.058,JP.white,Math.sin(a)*.085,.745,Math.cos(a)*.085,4);}
    for(let k=0;k<12;k++)box(g,.004,.28,.006,cream,-.37+k*.067,.01,.152);
  });
  refine('tsutenkaku','vertical signage and projecting observation deck',(g)=>{
    for(const side of [-1,1]){
      const holder=new THREE.Group();holder.position.set(side*.075,.18,.09);g.add(holder);
      for(let k=0;k<4;k++)panel(holder,'通天閣'[k]??'',0,k*.048,0,.031,.044,'#334e69','#e4e5d8');
    }
    box(g,.055,.007,.12,JP.white,0,.854,.105);
    for(const x of [-.028,.028])beam(g,[x,.86,.075],[x,.89,.17],.0018,JP.steel);
  });
  // Individual castle entrances and defensive features, preserving distinct keep silhouettes.
  refine('osakaCastle','gokurakubashi entrance, stone gateway, gold top gallery',(g)=>{
    box(g,.13,.018,.34,wood,.35,.025,.67);
    for(const x of [.285,.415])balustrade(g,x,.5,x,.84,{y:.043,h:.025,material:wood,spacing:.035});
    openGate(g,{x:.35,z:.47,w:.15,d:.08,hh:.06,roofH:.04,material:JP.plaster,double:false});
    for(let k=0;k<7;k++)box(g,.018,.018,.008,dark,-.15+k*.05,.12,.34);
  });
  refine('himeji','defensive arrow slits and winding plaster walls',(g)=>{
    for(let k=0;k<8;k++){
      const x=-.75+k*.19;
      box(g,.17,.085,.025,JP.plaster,x,.02,.78);
      add(g,new THREE.ConeGeometry(.009,.018,3).rotateZ(Math.PI),dark,x,.067,.794);
      box(g,.18,.007,.04,JP.tileDark,x,.105,.78);
    }
    openGate(g,{x:-.6,z:.57,w:.16,hh:.07,d:.09,roofH:.055,material:JP.plaster,double:false});
  });
  refine('matsumoto','dark timber keep and open moon-viewing railing',(g)=>{
    for(const z of [.135,.225])balustrade(g,.29,z,.47,z,{y:.15,h:.025,material:JP.vermilion,spacing:.025});
    for(let k=0;k<7;k++)box(g,.002,.065,.002,wood,-.11+k*.037,.09,.172);
  });
  refine('nagoyaCastle','Hommaru palace facade and golden shachi scales',(g)=>{
    windowGrid(g,{x:-.3,y:.012,z:.552,w:.43,hh:.045,cols:10,rows:1,frame:JP.cypress});
    panel(g,'本丸御殿',-.3,.082,.579,.065,.021,'#d4b36a','#312b25');
    for(const s of [-1,1])for(let k=0;k<4;k++)add(g,new THREE.SphereGeometry(.003,6,4),gold,s*.058,.87+k*.004,0);
  });
  refine('kumamotoCastle','long defensive wall, musha-gaeshi stonework',(g)=>{
    for(let k=0;k<14;k++){const x=-.82+k*.12;box(g,.115,.055,.025,JP.plaster,x,.025,.73);box(g,.12,.008,.045,JP.tileDark,x,.08,.73);box(g,.012,.018,.003,dark,x,.043,.745);}
    box(g,.32,.012,.18,wood,.7,.02,.53);
    for(let k=0;k<8;k++)box(g,.034,.002,.18,JP.plaster,.56+k*.04,.033,.53);
  });
  refine('sensoji','lettered lanterns and guardian alcoves',(g)=>{
    panel(g,'雷門',0,.067,1.001,.057,.06,'#171716','#bd3829');
    panel(g,'小舟町',0,.064,-.009,.044,.041,'#171716','#bd3829');
    for(const side of [-1,1]){
      box(g,.054,.085,.024,dark,side*.117,.028,.964);
      add(g,roughMass(.014,.028,.012,{seed:side+4,jitter:.1}),side<0?bronze:mat(0x9c5d46),side*.117,.07,.983);
      for(let k=0;k<4;k++)box(g,.002,.082,.003,wood,side*.117-.022+k*.015,.03,.994);
    }
  });
  refine('kiyomizu','Otowa three-stream waterfall and stage planking',(g)=>{
    for(let k=0;k<25;k++)box(g,.001,.001,.23,wood,-.24+k*.02,.316,.085);
    const x=.48,z=.32;
    box(g,.26,.035,.17,stone,x,.005,z);
    for(const side of [-1,1])cyl(g,.008,.008,.11,wood,x+side*.11,.04,z-.035,6);
    hip(g,.07,.17,.065,JP.tileDark,x,.15,z-.035,.65);
    for(let k=0;k<3;k++){
      box(g,.014,.012,.06,stone,x-.07+k*.07,.11,z+.02);
      cyl(g,.002,.003,.09,LM.aqua,x-.07+k*.07,.025,z+.055,5);
    }
  });
  refine('pavilion','gold-leaf upper floors, fenestration and phoenix',(g)=>{
    // Existing pavilion is positioned at z=-.42 and scaled by 1.6.
    for(const [y,w,hh] of [[.26,.39,.084],[.444,.25,.075]]){
      windowGrid(g,{y,z:-.42+.194,w,hh,cols:6,rows:2,frame:gold});
      for(const side of [-1,1])windowGrid(g,{x:side*w/2,y,z:-.42,w:.25,hh,cols:4,rows:2,frame:gold,yaw:side*Math.PI/2});
    }
    for(const side of [-1,1])beam(g,[0,.746,-.42],[side*.045,.773,-.42],.006,gold);
    // Delete the painted reflection rectangle; the game supplies actual water reflections.
    for(const o of [...g.children])if(o.isMesh&&o.material.transparent&&o.material.opacity===.45){g.remove(o);o.geometry.dispose();}
  });
  refine('toriiRow','stone approach steps and fox guardians',(g)=>{
    for(let k=0;k<8;k++)box(g,.18,.008,.028,stone,.2,.01+k*.004,.95-k*.026);
    for(const s of [-1,1]){
      const x=.2+s*.22,z=.85;
      add(g,new THREE.SphereGeometry(.018,10,8),cream,x,.105,z).scale.set(.6,1.5,.7);
      add(g,new THREE.SphereGeometry(.012,10,8),cream,x,.14,z+.005);
      for(const dx of [-.007,.007])add(g,new THREE.ConeGeometry(.004,.017,5),cream,x+dx,.159,z);
      box(g,.018,.008,.013,JP.vermilion,x,.127,z+.012);
      beam(g,[x,.085,z-.005],[x+s*.02,.12,z-.015],.005,cream);
    }
  });
  refine('daibutsuden','open Nandaimon, large doors and shibi',(g)=>{
    openGate(g,{z:.9,w:.45,d:.19,hh:.2,roofH:.13,material:wood});
    windowGrid(g,{y:.04,z:.018,w:.34,hh:.1,cols:9,rows:2});
    for(const side of [-1,1]){
      const points=[V(side*.27,.59,-.3),V(side*.31,.62,-.3),V(side*.33,.68,-.3)];
      add(g,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),14,.009,6,false),gold);
    }
  });
  refine('toriiGreat','wide six-legged torii and raised shrine corridor',(g)=>{
    panel(g,'嚴島神社',0,.39,.533,.045,.058,'#d9b763','#25313d');
    for(const z of [-.17,-.02])balustrade(g,-.18,z,.18,z,{y:.045,h:.02,material:JP.vermilion,spacing:.025});
    for(let k=0;k<9;k++)box(g,.014,.014,.045,JP.vermilion,-.16+k*.04,.023,-.1);
  });
  refine('toshogu','Yomeimon gilt brackets and three-monkey carving',(g)=>{
    for(let k=0;k<8;k++)for(const side of [-1,1]){
      const x=-.15+k*.043,z=-.38+side*.115;
      box(g,.018,.012,.034,gold,x,.246,z);
      add(g,new THREE.SphereGeometry(.006,6,4),cream,x,.27,z+side*.006);
    }
    const x=-.62,z=-.22;
    box(g,.24,.1,.1,wood,x,.01,z);hip(g,.05,.16,.05,JP.tileDark,x,.11,z,.5);
    panel(g,'三猿',x,.073,z+.053,.08,.022,'#c9ac63','#34281f');
    for(let k=0;k<3;k++){
      const px=x-.07+k*.07;add(g,new THREE.SphereGeometry(.014,8,6),wood,px,.055,z+.055);
      add(g,new THREE.SphereGeometry(.01,8,6),wood,px,.078,z+.057);
      const yy=[.08,.085,.066][k];for(const s of [-1,1])beam(g,[px+s*.012,.055,z+.06],[px+s*.009,yy,z+.066],.003,wood);
    }
  });

  builders.dome=()=>{
    const g=new THREE.Group(),brick=mat(0x966c5b,{map:TEXTURES.brick,roughness:1}),concrete=mat(0xb9b5a8,{roughness:.95}),steel=mat(0x574b42,{metalness:.45,roughness:.75});
    box(g,1.85,.012,1.15,JP.gravel,0,0,0);
    for(const z of [-.16,.16])piercedWall(g,{x:-.06,y:.025,z,w:.38,hh:.65,cols:2,rows:3,windowW:.09,windowH:.12,arch:true,material:concrete});
    for(const x of [-.25,.13])piercedWall(g,{x,y:.025,z:0,w:.3,hh:.65,cols:2,rows:3,windowW:.065,windowH:.12,arch:true,yaw:Math.PI/2,material:concrete});
    for(const y of [.22,.41,.66]){
      // Ring beams leave the central tower open from above.
      for(const z of [-.17,.17])box(g,.42,.018,.035,concrete,-.06,y,z);
      for(const x of [-.255,.135])box(g,.035,.018,.34,concrete,x,y,0);
    }
    for(let k=0;k<12;k++){
      const a=k/12*Math.PI*2;
      piercedWall(g,{x:-.06+Math.sin(a)*.165,y:.69,z:Math.cos(a)*.165,w:.086,hh:.14,cols:1,rows:1,windowW:.046,windowH:.078,arch:true,yaw:a,material:concrete,d:.018});
    }
    for(let k=0;k<12;k++){
      const a=k/12*Math.PI*2,points=[];
      for(let j=0;j<=18;j++){const p=j/18*Math.PI/2;points.push(V(-.06+Math.sin(a)*.18*Math.cos(p),.835+.185*Math.sin(p),Math.cos(a)*.18*Math.cos(p)));}
      add(g,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),18,.003,5,false),steel);
    }
    for(const p of [.15,.5,.85,1.18])add(g,new THREE.TorusGeometry(.18*Math.cos(p),.0025,5,32).rotateX(Math.PI/2),steel,-.06,.835+.185*Math.sin(p),0);
    for(const [x,w,hh] of [[-.62,.63,.34],[.48,.68,.39]]){
      for(const z of [-.16,.16])piercedWall(g,{x,z,y:.025,w,hh,cols:3,rows:2,windowW:.09,windowH:.1,material:brick});
      for(let k=0;k<7;k++)box(g,.06,.02+(k%3)*.018,.022,brick,x-w/2+.04+k*w/7,.025+hh,.16);
      for(const y of [.17,.32])for(const z of [-.15,.15])box(g,w,.012,.03,concrete,x,y,z);
    }
    // Broken rear wall and scattered small rubble, rather than a complete roof.
    piercedWall(g,{x:.1,y:.025,z:-.31,w:1.45,hh:.25,cols:6,rows:1,windowW:.12,windowH:.15,material:brick});
    for(let k=0;k<25;k++)add(g,roughMass(.018,.01,.014,{seed:k,jitter:.35,detail:0}),k%2?brick:concrete,-.75+(k%9)*.17,.025,-.28+Math.floor(k/9)*.19);
    for(let k=0;k<29;k++)box(g,.003,.05,.003,dark,-.9+k*.065,.012,.47);
    box(g,1.85,.004,.005,dark,0,.06,.47);
    g.userData.openWindows=true;
    return finish(g,'hollow steel dome, real window openings, broken brick wings');
  };

  builders.fort=()=>{
    const g=new THREE.Group();
    const flat=(shape,material,y)=>add(g,new THREE.ShapeGeometry(shape).rotateX(-Math.PI/2),material,0,y,0);
    box(g,4,.01,3.5,JP.moss,.25,0,0);
    flat(starShape(1.49,.95),JP.water,.014);
    add(g,new THREE.ExtrudeGeometry(starShape(1.29,.8),{depth:.045,bevelEnabled:false}).rotateX(-Math.PI/2),JP.stone,0,.018,0);
    flat(starShape(1.25,.77),JP.moss,.065);
    // Open centre grounds and Hakodate Magistrate's Office (not a central keep).
    box(g,.57,.07,.25,JP.plaster,0,.068,0);
    hip(g,.13,.34,.075,JP.tileGrey,0,.138,0,.52);
    box(g,.23,.07,.16,JP.plaster,.12,.068,.2);hip(g,.05,.16,.05,JP.tileGrey,.12,.138,.2,.7);
    box(g,.065,.06,.065,JP.plaster,0,.208,0);hip(g,.005,.05,.04,JP.tileGrey,0,.268,0);
    for(let k=0;k<10;k++)box(g,.004,.06,.004,wood,-.25+k*.055,.075,.127);
    box(g,.15,.01,.47,wood,.58,.07,.82);
    for(let k=0;k<5;k++)for(let j=0;j<6;j++){
      const a=k/5*Math.PI*2-Math.PI/2,r=1.01+j*.012,x=Math.cos(a)*r-Math.sin(a)*(j-2.5)*.08,z=Math.sin(a)*r+Math.cos(a)*(j-2.5)*.08;
      cyl(g,.004,.006,.04,wood,x,.065,z,5);add(g,roughMass(.047,.033,.045,{seed:k*6+j,jitter:.25,detail:1}),JP.sakura,x,.127,z);
    }
    const tx=1.64,tz=.74;
    add(g,new THREE.ExtrudeGeometry(starShape(.065,.047),{depth:.85,bevelEnabled:false}).rotateX(-Math.PI/2),JP.white,tx,.01,tz);
    // Official specification: star-shaped shaft, PENTAGONAL observation floors.
    const pent=(r,depth,material,y)=>add(g,new THREE.CylinderGeometry(r,r,depth,5).rotateY(Math.PI/10),material,tx,y+depth/2,tz);
    pent(.13,.055,JP.darkGlass,.86);pent(.168,.055,JP.darkGlass,.92);
    pent(.137,.009,JP.white,.854);pent(.173,.015,JP.white,.975);
    pent(.11,.04,JP.white,.99);cyl(g,.003,.004,.07,JP.white,tx,1.03,tz,6);
    box(g,.36,.07,.24,cream,tx,.01,tz+.04);
    g.userData.towerPosition=[tx,tz];g.userData.observationSides=5;
    return finish(g,'star fort, moat, tower outside ramparts, pentagonal deck');
  };

  builders.fuji=()=>{
    // Only the crater cap is added: the full volcanic cone already exists in the elevation map.
    const g=new THREE.Group(),segments=72,rings=18,positions=[],colours=[],indices=[];
    const rock=new THREE.Color(0x756d68),snow=new THREE.Color(0xe4e9e7),ash=new THREE.Color(0x554e4a);
    for(let j=0;j<=rings;j++)for(let k=0;k<=segments;k++){
      const r=.3*j/rings,a=k/segments*Math.PI*2;
      const ridge=.057*Math.exp(-(((r-.105)/.042)**2)),crater=-.018*Math.max(0,1-r/.085);
      const y=ridge+crater-.05*(r/.3)**2+.009*Math.sin(a*7)*Math.min(1,r/.1);
      positions.push(Math.sin(a)*r,y,Math.cos(a)*r);
      const c=rock.clone().lerp(ash,.25+.2*Math.sin(a*11));
      if(r>.12&&r<.26&&Math.sin(a*5+r*38)>.0)c.lerp(snow,.9);
      colours.push(c.r,c.g,c.b);
      if(j<rings&&k<segments){const i=j*(segments+1)+k;indices.push(i,i+segments+1,i+1,i+1,i+segments+1,i+segments+2);}
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    add(g,geometry,mat(0xffffff,{vertexColors:true,roughness:1,side:THREE.DoubleSide}));
    add(g,roughMass(.04,.025,.028,{seed:77,jitter:.25}),JP.stoneDark,-.085,.062,-.055);
    box(g,.027,.012,.018,cream,-.112,.078,-.05);box(g,.034,.003,.023,JP.white,-.112,.09,-.05);
    box(g,.032,.015,.024,wood,.065,.04,.09);hip(g,.004,.021,.01,JP.tileDark,.065,.055,.09,.65);
    for(const s of [-1,1])cyl(g,.0018,.002,.018,stone,.065+s*.009,.043,.118,5);
    box(g,.027,.003,.004,stone,.065,.061,.118);
    g.userData.terrainSummit=true;return finish(g,'summit crater, Kengamine, residual snow, summit shrine');
  };

  // Exterior reconstruction of Shuri's Seiden; not a claim about the construction site today.
  builders.shuri=()=>{
    const g=new THREE.Group(),red=mat(0xb73c2b),tile=mat(0xb95c40,{map:TEXTURES.tiles}),plaster=mat(0xe7ddc7),black=mat(0x423027);
    box(g,2.2,.045,1.8,stone,0,0,.15);
    for(let k=0;k<12;k++)box(g,1.6,.002,.055,k%2?red:plaster,0,.046,.2+k*.07);
    box(g,1.35,.07,.62,stone,0,.045,-.4);
    box(g,1.25,.27,.55,red,0,.115,-.4);
    for(let k=0;k<9;k++)windowGrid(g,{x:-.53+k*.133,y:.15,z:-.121,w:.08,hh:.18,cols:3,rows:4,frame:red});
    hip(g,.3,.77,.17,tile,0,.385,-.4,.45);
    box(g,.85,.17,.36,red,0,.54,-.42);
    for(let k=0;k<7;k++)windowGrid(g,{x:-.35+k*.117,y:.57,z:-.237,w:.07,hh:.105,cols:2,rows:3,frame:red});
    irimoya(g,{y:.71,z:-.42,w:.97,d:.44,h:.21,material:tile,trim:plaster});
    // Light mortar ridges and curled dragon terminals.
    for(const side of [-1,1]){
      beam(g,[side*.36,.92,-.42],[side*.43,.97,-.42],.009,plaster);
      add(g,new THREE.SphereGeometry(.018,10,8),gold,side*.42,.97,-.42);
      cyl(g,.018,.024,.25,stone,side*.21,.115,-.045,10);
      add(g,new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(side*.21,.16,-.02),V(side*.23,.25,0),V(side*.21,.36,-.02)]),20,.006,5,false),gold);
      add(g,new THREE.SphereGeometry(.022,10,8),gold,side*.21,.37,-.025);
    }
    const porch=openGate(g,{z:-.04,y:.115,w:.45,d:.17,hh:.25,roofH:.08,material:red,double:false});
    panel(porch,'中山世土',0,.19,.09,.18,.04,'#dab54c','#5d3021');
    for(let k=0;k<6;k++)box(g,.36,.017,.035,stone,0,.045+k*.012,.22-k*.035);
    for(const s of [-1,1]){box(g,.25,.16,.85,red,s*.94,.045,.45);hip(g,.05,.19,.08,tile,s*.94,.205,.45,2.3);}
    g.userData.reconstruction=true;return finish(g,'vermilion Seiden, red-white Una, tiled ridges and dragon pillars');
  };

  refine('aquarium','outdoor canopy colonnades and whale-shark sculpture',(g)=>{
    // The Kuroshio viewing window is inside; remove the fictitious bright-blue outdoor aquarium pane.
    for(const o of [...g.children])if(o.isMesh&&o.material.emissive?.getHex()===0x0a4a88){g.remove(o);o.geometry.dispose();}
    panel(g,'沖縄美ら海水族館',0,.235,.195,.47,.045,'#315b69','#eae7de');
    for(let k=0;k<13;k++)box(g,1.42,.006,.006,cream,0,.316,-.78+k*.04);
    for(const side of [-1,1]){
      const fin=add(g,new THREE.ConeGeometry(.065,.11,3).rotateZ(side*Math.PI/2),dark,.49,.068,.62+side*.075);fin.rotation.x=Math.PI/2;
    }
    box(g,.75,.008,.12,stone,0,.018,.74);
  });
  refine('buddha','bronze patina, robe folds, lotus altar',(g)=>{
    for(let k=0;k<6;k++){
      const points=[V(-.24+k*.03,.46,.16),V(-.12+k*.02,.55,.19),V(-.06+k*.014,.7,.10)];
      add(g,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),14,.0035,5,false),bronze);
    }
    // Cut stone paving leading to the open-air statue.
    for(let k=0;k<6;k++)box(g,.23,.003,.045,stone,0,.008,.66+k*.049);
  });
  refine('gassho','timber trusses, roof thatch and irrigation paths',(g)=>{
    const houses=[[-.6,-.4,.2,1],[.1,-.5,-.1,1.1],[.7,-.2,.3,.9],[-.3,.3,0,1],[.5,.45,-.2,.95],[-.9,.5,.4,.85]];
    for(const [x,z,yaw,s] of houses){
      const holder=new THREE.Group();holder.position.set(x,0,z);holder.rotation.y=yaw;holder.scale.setScalar(s);g.add(holder);
      for(const side of [-1,1]){
        for(let k=0;k<5;k++)box(holder,.003,.2,.004,wood,-.1+k*.05,.09,side*.287);
        beam(holder,[-.13,.1,side*.288],[0,.35,side*.288],.004,wood);beam(holder,[.13,.1,side*.288],[0,.35,side*.288],.004,wood);
      }
      for(let k=0;k<8;k++)for(const side of [-1,1])beam(holder,[0,.411,-.25+k*.07],[side*.195,.08,-.25+k*.07],.002,JP.thatchDark);
    }
    for(let k=0;k<5;k++)box(g,.022,.006,1.6,stone,-1.2+k*.5,.018,0);
  });
  refine('tree','buttress roots, trunk burls and protected observation boardwalk',(g)=>{
    for(let k=0;k<9;k++){
      const a=k/9*Math.PI*2;
      beam(g,[Math.cos(a)*.17,.16,Math.sin(a)*.17],[Math.cos(a)*.39,.005,Math.sin(a)*.39],.022,wood);
      if(k%2===0)add(g,roughMass(.035,.052,.028,{seed:k+33,jitter:.23}),wood,Math.cos(a)*.175,.27+(k%3)*.08,Math.sin(a)*.175);
    }
    box(g,.15,.013,.5,wood,.32,.06,.76);
    for(let k=0;k<16;k++)box(g,.15,.002,.002,JP.cypress,.32,.074,.52+k*.03);
    balustrade(g,.395,.52,.395,1.01,{y:.075,h:.04,material:wood,spacing:.065});
  });
  refine('statue','closed eyes, pointing finger, horizontal arm and plinth',(g)=>{
    for(const side of [-1,1]){
      box(g,.019,.002,.003,dark,side*.019,.766,.041);
      beam(g,[.45,.66,.11+side*.011],[.49,.66,.11+side*.011],.002,bronze);
    }
    box(g,.009,.021,.009,bronze,0,.735,.044);
    box(g,.025,.002,.003,dark,0,.72,.046);
    cyl(g,.003,.003,.04,bronze,-.14,1.026,-.03,6);
    panel(g,'平和',0,.16,.203,.18,.08,'#b7a886','#4e504c');
  });

  builders.fairyCastle=()=>{
    const g=new THREE.Group(),wall=mat(0xcfcfd2,{map:TEXTURES.stone}),trim=mat(0xe5dfd2),blue=mat(0x3f6895,{roughness:.6}),roof=mat(0x324c6c),goldTip=gold;
    box(g,1.6,.012,1.3,JP.water,0,0,0);box(g,1.3,.025,.95,stone,0,.013,0);
    // Two wings and a perforated front wall leave the passage visible through the whole building.
    for(const side of [-1,1])box(g,.43,.29,.62,wall,side*.395,.038,-.05);
    piercedWall(g,{y:.038,z:.265,w:.92,hh:.29,d:.05,cols:1,rows:1,windowW:.16,windowH:.21,arch:true,material:wall});
    const tower=(x,z,r,hh,y=.04)=>{
      cyl(g,r,r*1.06,hh,wall,x,y,z,16);
      cyl(g,r*1.12,r*1.12,.018,trim,x,y+hh-.035,z,16);
      add(g,new THREE.ConeGeometry(r*1.28,hh*.5,16),blue,x,y+hh+hh*.25,z);
      cyl(g,.003,.004,.055,goldTip,x,y+hh*1.5,z,5);
      for(let k=0;k<4;k++){const a=k*Math.PI/2;box(g,.022,.05,.003,dark,x+Math.sin(a)*r,y+hh*.65,z+Math.cos(a)*r,a);}
    };
    for(const [x,z,r,hh] of [[-.53,.23,.085,.4],[.53,.23,.09,.43],[-.48,-.28,.09,.52],[.48,-.28,.085,.46],[-.23,.12,.07,.57],[.25,.06,.067,.66]])tower(x,z,r,hh);
    box(g,.34,.42,.31,wall,0,.25,-.12);
    hip(g,.02,.21,.15,roof,0,.67,-.12,.85);
    tower(-.08,-.15,.085,.42,.76);tower(.16,-.18,.055,.33,.69);
    for(let k=0;k<13;k++)box(g,.035,.027,.04,trim,-.44+k*.073,.328,.265);
    windowGrid(g,{y:.41,z:.038,w:.12,hh:.17,cols:3,rows:3,frame:trim});
    box(g,.18,.016,.37,stone,0,.036,.49);
    for(const side of [-1,1])balustrade(g,side*.095,.31,side*.095,.68,{y:.052,h:.026,material:trim,spacing:.035});
    g.userData.openPassage=true;return finish(g,'Cinderella Castle asymmetrical blue turrets and open archway');
  };

  const otherBridge=builders.bridge;
  builders.bridge=(options={})=>{
    if(!['akashi','seto'].includes(options.style))return otherBridge(options);
    const g=new THREE.Group(),seto=options.style==='seto',span=options.span??2,deck=span*(seto?.12:.1),height=span*(seto?.34:.30),width=.11;
    suspensionBridge2(g,{span,deckY:deck,pylon:height,doubleDeck:seto,lengthSide:seto?.249:.482,tower:seto?0xd9dddc:0xbfcac5,truss:0xbac3c1,beams:seto?3:4});
    const total=span*(seto?1.498:1.964);
    // Road lane markings, a real median, and a distinct lower rail deck for Seto.
    const roadY=deck+(seto?.06:0)+.022;
    for(const side of [-1,1])for(let k=0;k<28;k++)box(g,total/60,.001,.002,cream,-total/2+(k+.5)*total/28,roadY,side*.022);
    box(g,total,.008,.006,stone,0,roadY,0);
    if(seto){
      for(const z of [-.033,-.016,.016,.033])box(g,total,.002,.002,dark,0,deck+.022,z);
      for(let k=0;k<65;k++)box(g,.007,.002,width*.8,wood,-total/2+k*total/64,deck+.02,0);
    }
    g.userData.bridgeStyle=options.style;g.userData.railDeck=seto;
    return finish(g,seto?'road and railway suspension bridge, lower rails':'Akashi long-span suspension bridge, road median and pale towers');
  };
}
