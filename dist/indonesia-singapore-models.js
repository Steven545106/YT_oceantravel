import * as THREE from 'three';

// Readable, batched miniature silhouettes of the nine referenced places.
export function addIndonesiaSingaporeModels(h) {
  const {builders, lmAdd:add, lmBox:box, lmCyl:cyl, lmMaterial:mat, roughMass, mergeByMaterial:merge, TEXTURES}=h;
  const grass=mat(0x4b7541),rice=mat(0x3b8a3a),riceLight=mat(0x62a341),forest=mat(0x315b3f);
  const earth=mat(0x856e53),mud=mat(0x665b49),sand=mat(0xaaa092),ash=mat(0x756f6a,{side:THREE.DoubleSide}),lava=mat(0x4a4644);
  const stone=mat(0x797770,{map:TEXTURES.stone}),stoneLight=mat(0xa09b8c),water=mat(0x388999,{roughness:.25,metalness:.08}),foam=mat(0xa7dedb);
  const ivory=mat(0xe5e2d1),white=mat(0xf5f5ec),wood=mat(0x704633,{map:TEXTURES.wood}),brownRoof=mat(0x614238);
  const supertreeSteel=mat(0x6c766c,{metalness:.35,roughness:.48});
  const gold=mat(0xd8ad5d,{metalness:.55,roughness:.35}),dark=mat(0x354955),glass=mat(0x78b4bd,{metalness:.35,roughness:.24,transparent:true,opacity:.55,side:THREE.DoubleSide});
  const blue=mat(0x347a9e,{metalness:.25}),red=mat(0xc75949),yellow=mat(0xe4b461),mint=mat(0x8cbdad),purple=mat(0x947cab);
  function beam(g,a,b,r,m,segments=6){
    const p=new THREE.Vector3(...a),q=new THREE.Vector3(...b),d=q.clone().sub(p);
    const mesh=add(g,new THREE.CylinderGeometry(r,r,d.length(),segments),m,...p.add(q).multiplyScalar(.5).toArray());
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());
  }
  function finish(g,features){const root=merge(g);root.userData={...g.userData,referencePass:'indonesia-singapore-2026',features};return root;}
  function tree(g,x,z,s=1,seed=0){
    cyl(g,.012*s,.017*s,.16*s,wood,x,0,z,5);
    add(g,roughMass(.11*s,.14*s,.10*s,{seed:800+seed,jitter:.18,detail:1}),seed%2?grass:forest,x,.19*s,z);
  }
  function roof(g,x,y,z,w,d,h,m=brownRoof){
    const shape=new THREE.Shape();shape.moveTo(-w/2,0);shape.lineTo(0,h);shape.lineTo(w/2,0);shape.closePath();
    const geo=new THREE.ExtrudeGeometry(shape,{depth:d,bevelEnabled:false}).translate(0,0,-d/2);
    return add(g,geo,m,x,y,z);
  }
  function stupa(g,x,y,z,r,m=stone){
    cyl(g,r*.95,r,.055,m,x,y,z,10);
    add(g,new THREE.SphereGeometry(r,10,6,0,Math.PI*2,0,Math.PI/2),m,x,y+.055,z);
    add(g,new THREE.ConeGeometry(r*.25,r*.60,8),m,x,y+r*.70,z);
  }

  builders.ubudRiceTerraces=()=>{
    const g=new THREE.Group();
    box(g,2.85,.065,3.0,forest,0,-.07,0);
    // Two opposed, curving paddy slopes leave a clear green valley between them.
    for(const side of [-1,1])for(let tier=0;tier<7;tier++){
      const z=side*(.20+tier*.118),y=.06+tier*.092,w=2.55-tier*.14;
      // Every retaining wall reaches the terrain base. Thin floating slabs used
      // to expose the underside of the upper paddies when viewed from below.
      box(g,w,y+.005,.151,earth,0,-.005,z);
      box(g,w*.97,.014,.127,tier%2?rice:riceLight,0,y,z);
      const shape=new THREE.Shape();shape.moveTo(-w/2,-.065);shape.quadraticCurveTo(0,.04,w/2,-.065);
      shape.lineTo(w/2,.065);shape.quadraticCurveTo(0,.19,-w/2,.065);shape.closePath();
      const bed=add(g,new THREE.ShapeGeometry(shape),tier%2?rice:riceLight,0,y,z);bed.rotation.x=-Math.PI/2;
      for(let i=0;i<12;i++){
        const x=-w*.44+i*w*.08,zz=z+side*(.02+.015*Math.cos(x*3));
        box(g,.08,.008,.008,grass,x,y+.004,zz);
      }
      beam(g,[-w/2,y-.018,z+side*.10],[w/2,y-.018,z+side*.10],.013,earth);
      if(tier%2===0)beam(g,[-w*.4,y+.006,z-side*.055],[w*.4,y+.006,z-side*.055],.004,water,4);
    }
    // The final paddy sits on a hillside, rather than ending in a vertical
    // retaining wall. Fill the outer face down to the surrounding terrain.
    for(const side of [-1,1]){
      const x=.86,outerX=1.07,inside=side*.98,outside=side*1.43,top=.62,base=-.005;
      const points=[-x,top,inside,x,top,inside,-x,base,inside,x,base,inside,-outerX,base,outside,outerX,base,outside];
      const mound=new THREE.BufferGeometry();
      mound.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
      mound.setIndex([0,1,2,1,3,2,0,2,4,1,5,3,0,4,1,1,4,5,2,3,4,3,5,4]);
      mound.computeVertexNormals();
      add(g,mound,mat(0x77694f,{side:THREE.DoubleSide}));
      const slope=new THREE.BufferGeometry();
      slope.setAttribute('position',new THREE.Float32BufferAttribute([
        -x,top+.004,inside,x,top+.004,inside,-outerX,base+.008,outside,
        outerX,base+.008,outside
      ],3));
      slope.setIndex([0,1,2,1,3,2]);slope.computeVertexNormals();
      add(g,slope,mat(0x3d7141,{side:THREE.DoubleSide}));
      for(let contour=1;contour<=5;contour++){
        const t=contour/6,z=side*(.98+.45*t),y=.62*(1-t),width=1.70+.35*t;
        box(g,width,.012,.061,contour%2?rice:riceLight,0,y+.016,z);
        beam(g,[-width/2,y+.006,z+side*.035],[width/2,y+.006,z+side*.035],.008,earth);
      }
      for(const px of [-.65,-.25,.30,.68]){
        add(g,roughMass(.055,.045,.045,{seed:1200+Math.round((px+side)*100),jitter:.25,detail:1}),grass,px,.08,side*1.36);
      }
    }
    for(const [x,z] of [[-1.16,.85],[1.14,-.84],[-1.22,-.68],[1.17,.78]])tree(g,x,z,.95,Math.round(x*20));
    g.userData.subakIrrigation=true;
    return finish(g,'德格拉朗雙側山谷的曲線稻田階地、田埂與 Subak 灌溉水道');
  };

  builders.mountBromo=()=>{
    const g=new THREE.Group();
    box(g,3.0,.045,2.05,sand,0,-.065,0);
    // Batok's neat cone and the broader, open Bromo crater are deliberately distinct.
    add(g,new THREE.ConeGeometry(.55,1.16,14,7),earth,.80,.53,.13);
    const profile=[new THREE.Vector2(0,.31),new THREE.Vector2(.20,.30),new THREE.Vector2(.30,.44),new THREE.Vector2(.40,.62),new THREE.Vector2(.50,.61),new THREE.Vector2(.68,.29),new THREE.Vector2(.83,.02)];
    add(g,new THREE.LatheGeometry(profile,24),ash,-.44,0,-.02);
    add(g,new THREE.CircleGeometry(.27,24),lava,-.44,.315,-.02).rotation.x=-Math.PI/2;
    const rim=add(g,new THREE.TorusGeometry(.40,.027,6,26),stoneLight,-.44,.625,-.02);rim.rotation.x=Math.PI/2;
    // A receding Semeru silhouette gives the Bromo-Tengger sand sea depth.
    add(g,new THREE.ConeGeometry(.31,.75,11,4),mud,-1.13,.33,-.63);
    for(let i=0;i<9;i++){
      const a=i*2.4,x=Math.cos(a)*1.18,z=Math.sin(a)*.72;
      add(g,roughMass(.06,.018,.05,{seed:1100+i,jitter:.2,detail:1}),stoneLight,x,.005,z);
    }
    g.userData.openCrater=true;g.userData.sandSea=true;
    return finish(g,'騰格爾沙海、布羅莫開口火山口、圓錐形巴托克山與遠方山影');
  };

  builders.yogyakartaKraton=()=>{
    const g=new THREE.Group();
    box(g,2.70,.035,1.95,stoneLight,0,-.04,0);
    // North-facing ceremonial gate and inward-facing pendopo court.
    for(const side of [-1,1])box(g,.075,.34,1.73,ivory,side*1.30,0,0);
    for(const z of [-.86,.85])box(g,2.65,.30,.07,ivory,0,0,z);
    box(g,.70,.32,.13,ivory,0,0,.84);roof(g,0,.32,.84,.88,.19,.18,brownRoof);
    box(g,.28,.24,.12,wood,0,0,.77);
    for(const [z,w,d,h] of [[.28,1.45,.53,.28],[-.42,1.11,.47,.31]]){
      box(g,w,.055,d,stoneLight,0,.015,z);
      for(const x of [-w*.39,w*.39])for(const dz of [-d*.36,d*.36])cyl(g,.019,.023,.37,wood,x,.07,z+dz,6);
      roof(g,0,.44,z,w*1.15,d*.95,h,brownRoof);
      roof(g,0,.46+h*.65,z,w*.75,d*.66,h*.54,wood);
      roof(g,0,.49+h*1.05,z,w*.40,d*.45,h*.32,brownRoof);
    }
    for(const x of [-.91,.91]){
      box(g,.28,.29,.28,ivory,x,.01,-.37);
      roof(g,x,.30,-.37,.36,.33,.17,brownRoof);
    }
    g.userData.pendopoPavilions=true;
    return finish(g,'日惹王宮的白牆宮門、對稱內院和多層爪哇 Pendopo 亭頂');
  };

  builders.borobudur=()=>{
    const g=new THREE.Group();
    box(g,2.65,.035,2.45,grass,0,-.045,0);
    for(let level=0;level<5;level++){
      const size=2.12-level*.28,y=.015+level*.105;
      box(g,size,.105,size,level%2?stoneLight:stone,0,y,0);
      for(const side of [-1,1])for(let i=0;i<5-level;i++){
        const step=size/(6-level),p=-size/2+step*(i+.8);
        box(g,.05,.055,.055,stoneLight,p,y+.105,side*(size/2-.04));
        box(g,.055,.055,.05,stoneLight,side*(size/2-.04),y+.105,p);
      }
    }
    for(let level=0;level<3;level++){
      const r=.70-level*.17,y=.55+level*.103;
      cyl(g,r,r,.103,stone,0,y,0,24);
      const count=level===0?16:level===1?12:8;
      for(let i=0;i<count;i++){
        const a=i*Math.PI*2/count;
        stupa(g,Math.cos(a)*(r-.095),y+.106,Math.sin(a)*(r-.095),.047,stoneLight);
      }
    }
    stupa(g,0,.87,0,.185,stone);
    g.userData.squareAndCircularTerraces=true;
    return finish(g,'五層方形迴廊、三層圓形平台與中央大佛塔及環列小佛塔');
  };

  builders.gardensByTheBay=()=>{
    const g=new THREE.Group();
    box(g,3.0,.025,1.90,grass,0,-.04,0);
    function supertree(x,z,h,r){
      cyl(g,.040,.086,h*.78,supertreeSteel,x,0,z,9);
      for(let i=0;i<9;i++){
        const a=i*Math.PI*2/9,xx=x+Math.cos(a)*r,zz=z+Math.sin(a)*r;
        beam(g,[x,h*.45,z],[xx,h*.92,zz],.018,wood);
        beam(g,[xx,h*.92,zz],[x+Math.cos(a)*r*.76,h*.66,z+Math.sin(a)*r*.76],.011,forest);
      }
      cyl(g,r*.94,r*.60,.040,forest,x,h*.91,z,12);
      const crown=add(g,new THREE.TorusGeometry(r*.94,.014,5,16),supertreeSteel,x,h*.97,z);crown.rotation.x=Math.PI/2;
      for(let i=0;i<12;i++){
        const a=i*Math.PI/6;
        beam(g,[x,h*.72,z],[x+Math.cos(a)*r*.94,h*.97,z+Math.sin(a)*r*.94],.009,supertreeSteel,5);
      }
      cyl(g,.10,.10,.015,gold,x,h*.99,z,12);
    }
    for(const [x,z,h,r] of [[-.69,.10,.98,.28],[.10,.37,1.35,.34],[.86,.09,1.05,.30],[-.05,-.55,.83,.25],[1.16,-.59,.76,.24]])supertree(x,z,h,r);
    // OCBC elevated skyway links two Supertree crowns.
    beam(g,[-.69,.72,.10],[.10,.92,.37],.035,stoneLight);
    for(let i=0;i<=7;i++){
      const t=i/7,x=-.69+.79*t,y=.72+.20*t,z=.10+.27*t;
      beam(g,[x,y,z-.05],[x,y+.12,z-.05],.005,gold,4);
    }
    for(const [x,z,r] of [[-.87,-.63,.41],[.61,-.67,.35]]){
      const dome=add(g,new THREE.SphereGeometry(r,16,8,0,Math.PI*2,0,Math.PI/2),glass,x,.02,z);dome.scale.y=.58;
      for(let i=0;i<6;i++){
        const a=i*Math.PI/6;
        beam(g,[x-r*Math.cos(a),.02,z-r*Math.sin(a)],[x+r*Math.cos(a),.02,z+r*Math.sin(a)],.006,stoneLight,4);
      }
    }
    g.userData.supertreeSkyway=true;
    return finish(g,'擎天樹群、空中步道及花穹與雲霧林的玻璃溫室');
  };

  builders.merlionPark=()=>{
    const g=new THREE.Group();
    const scaleStone=mat(0xb7beb7),maneStone=mat(0xb5bdb5),mouthStone=mat(0x465158);
    box(g,2.25,.012,1.50,water,0,-.035,0);
    box(g,1.10,.045,.96,stoneLight,-.16,-.018,.14);
    cyl(g,.31,.37,.14,stone,-.20,.03,.14,16);
    cyl(g,.26,.29,.025,white,-.20,.17,.14,16);
    // Upright fish body: broad near the waves, tapering to a lion's neck.
    const torsoProfile=[new THREE.Vector2(0,.16),new THREE.Vector2(.135,.17),new THREE.Vector2(.18,.24),new THREE.Vector2(.19,.36),new THREE.Vector2(.17,.49),new THREE.Vector2(.13,.63),new THREE.Vector2(.11,.71)];
    const torso=add(g,new THREE.LatheGeometry(torsoProfile,18),ivory,-.22,0,.14);
    torso.scale.z=.86;
    // White overlapping scales remain readable at game distance.
    for(let row=0;row<6;row++){
      const y=.245+row*.065,r=.18-row*.009;
      for(let col=0;col<12;col++){
        const a=(col+(row%2)*.5)*Math.PI/6;
        const scale=add(g,new THREE.SphereGeometry(.031,6,4),scaleStone,-.22+Math.cos(a)*r,y,.14+Math.sin(a)*r*.85);
        scale.scale.set(.90,.30,.42);
        scale.rotation.y=-a;
      }
    }
    // A curled fish tail rises from the back and splits into two broad fins.
    const tail=new THREE.Shape();tail.moveTo(-.31,.23);
    tail.bezierCurveTo(-.48,.17,-.57,.26,-.62,.40);
    tail.bezierCurveTo(-.67,.48,-.68,.53,-.75,.57);
    tail.bezierCurveTo(-.60,.56,-.52,.48,-.48,.37);
    tail.quadraticCurveTo(-.39,.31,-.31,.33);tail.closePath();
    add(g,new THREE.ExtrudeGeometry(tail,{depth:.072,bevelEnabled:true,bevelThickness:.012,bevelSize:.014,bevelSegments:1,curveSegments:8}),white,0,0,.10);
    for(const end of [[-.77,.68,.02],[-.80,.53,.12],[-.72,.39,.22]]){
      beam(g,[-.52,.34,.14],end,.014,scaleStone);
      const tip=add(g,new THREE.SphereGeometry(.055,7,5),white,...end);
      tip.scale.set(.65,1.6,.38);
    }
    for(const z of [.04,.24]){
      const fin=add(g,new THREE.ConeGeometry(.085,.24,6),ivory,-.39,.46,z);
      fin.rotation.z=-.70;
    }
    // Framed mane, open jaw, muzzle and nose distinguish the lion from a round head.
    const mane=add(g,new THREE.SphereGeometry(.225,16,12),maneStone,-.12,.77,.14);mane.scale.x=.76;
    // Layered mane locks around the cheek in silhouette; a smooth sphere alone
    // read as a seal when the model was viewed from its usual camera angle.
    for(let i=0;i<15;i++){
      const a=i*Math.PI*2/15,xx=-.12+Math.cos(a)*.19,yy=.79+Math.sin(a)*.19;
      const lock=add(g,new THREE.ConeGeometry(.048,.135,6),maneStone,xx,yy,.265);
      lock.rotation.z=a-Math.PI/2;
    }
    for(let i=0;i<13;i++){
      const a=i*Math.PI*2/13,yy=.77+Math.cos(a)*.185,zz=.14+Math.sin(a)*.185;
      const tuft=add(g,new THREE.ConeGeometry(.047,.13,5),ivory,-.10,yy,zz);
      tuft.rotation.x=a+.3;tuft.rotation.z=-.34;
    }
    const face=add(g,new THREE.SphereGeometry(.155,16,12),white,-.018,.80,.14);face.scale.set(1.20,.88,.93);
    for(const z of [.045,.235]){
      const ear=add(g,new THREE.ConeGeometry(.052,.12,7),white,-.11,.95,z);ear.rotation.z=-.25;
      add(g,new THREE.SphereGeometry(.024,8,6),dark,.060,.840,z>.14?.270:.010);
    }
    const upperMuzzle=add(g,new THREE.SphereGeometry(.095,12,8),white,.158,.754,.14);upperMuzzle.scale.y=.48;
    const mouth=add(g,new THREE.SphereGeometry(.068,12,8),mouthStone,.174,.697,.14);mouth.scale.y=.52;
    const jaw=add(g,new THREE.SphereGeometry(.081,10,7),white,.146,.653,.14);jaw.scale.y=.35;
    const mouthSide=new THREE.Shape();mouthSide.moveTo(.12,.721);mouthSide.lineTo(.234,.709);mouthSide.lineTo(.198,.672);mouthSide.lineTo(.116,.680);mouthSide.closePath();
    for(const z of [.033,.235])add(g,new THREE.ShapeGeometry(mouthSide),mouthStone,0,0,z);
    add(g,new THREE.SphereGeometry(.015,8,6),dark,.235,.773,.14);
    // The fountain starts at the open mouth and falls into Marina Bay.
    const pts=[];for(let i=0;i<=12;i++){
      const t=i/12;pts.push(new THREE.Vector3(.236+t*.78,.706+.035*Math.sin(t*Math.PI)-t*t*.68,.14));
    }
    add(g,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),24,.017,6),foam);
    box(g,1.15,.016,.11,stoneLight,-.17,.02,-.36);
    g.userData.waterSpout=true;g.userData.fishScales=true;g.userData.lionMane=true;g.userData.openMouth=true;
    return finish(g,'白色魚鱗魚身、捲起的魚尾、獅鬃與張口噴水的獅首');
  };

  builders.universalStudiosSingapore=()=>{
    const g=new THREE.Group();
    box(g,2.65,.03,1.72,stoneLight,0,-.04,0);
    cyl(g,.39,.47,.095,blue,0,0,.23,20);
    add(g,new THREE.SphereGeometry(.36,24,16),blue,0,.46,.23);
    for(const a of [-.65,0,.65]){
      const ring=add(g,new THREE.TorusGeometry(.365,.010,5,40),gold,0,.46,.23);ring.rotation.y=a;
    }
    const equator=add(g,new THREE.TorusGeometry(.367,.016,6,40),gold,0,.46,.23);equator.rotation.x=Math.PI/2;
    // Entrance arch and a stepped New York-style streetscape behind the globe.
    for(const x of [-.76,.76])box(g,.16,.48,.20,ivory,x,0,-.54);
    box(g,1.68,.12,.20,red,0,.48,-.54);
    for(let i=0;i<5;i++){
      const x=-1.06+i*.52,h=.26+(i%3)*.08;
      box(g,.38,h,.28,[mint,yellow,red,purple,ivory][i],x,0,-.80);
      box(g,.43,.025,.31,stone,x,h,-.80);
    }
    g.userData.entranceGlobe=true;
    return finish(g,'聖淘沙環球影城入口的藍金地球標誌、拱門與彩色街景');
  };

  builders.jewelChangi=()=>{
    const g=new THREE.Group();
    box(g,2.75,.04,2.33,stoneLight,0,-.045,0);
    const shell=add(g,new THREE.SphereGeometry(1.08,24,12,0,Math.PI*2,0,Math.PI/2),glass,0,.07,0);shell.scale.z=.86;shell.scale.y=.67;
    for(let i=0;i<12;i++){
      const a=i*Math.PI/6,r=.90;
      beam(g,[Math.cos(a)*r,.06,Math.sin(a)*r*.86],[Math.cos(a)*.08,.74,Math.sin(a)*.08],.010,stoneLight);
    }
    for(const y of [.28,.49]){
      const ring=add(g,new THREE.TorusGeometry((.92-(y-.07)*.74),.009,5,40),stoneLight,0,y,0);ring.rotation.x=Math.PI/2;ring.scale.y=.86;
    }
    // The Rain Vortex falls from the oculus into Forest Valley.
    cyl(g,.084,.084,.025,stone,0,.71,0,18);
    cyl(g,.038,.065,.63,water,0,.055,0,12);
    add(g,new THREE.CylinderGeometry(.10,.19,.045,14),foam,0,.06,0);
    for(let i=0;i<14;i++){
      const a=i*2.399,r=.29+(i%3)*.15;
      tree(g,Math.cos(a)*r,Math.sin(a)*r,.45+(i%4)*.07,i);
    }
    g.userData.rainVortex=true;g.userData.glassDome=true;
    return finish(g,'星耀樟宜玻璃鋼骨穹頂、中央雨漩渦與室內森林谷');
  };

  builders.clarkeQuay=()=>{
    const g=new THREE.Group();
    box(g,2.85,.015,1.84,water,0,-.04,0);
    for(const side of [-1,1]){
      const z=side*.59;box(g,2.72,.035,.57,stoneLight,0,-.014,z);
      for(let i=0;i<6;i++){
        const x=-1.10+i*.43,h=.26+(i%3)*.025,m=[red,yellow,mint,purple,ivory][(i+(side>0?1:0))%5];
        box(g,.38,h,.27,m,x,.015,z);
        roof(g,x,h+.015,z,.41,.29,.085,brownRoof);
        for(const yy of [.10,.20])box(g,.07,.055,.009,white,x,yy,z-side*.14);
      }
      for(const x of [-.78,-.19,.55]){
        cyl(g,.012,.012,.20,stone,x,.035,z-side*.29,5);
        const canopy=add(g,new THREE.ConeGeometry(.26,.13,8),x<0?purple:mint,x,.29,z-side*.29);canopy.rotation.y=Math.PI/8;
      }
    }
    // Restored shophouse-lined Singapore River and a small bumboat.
    const boat=add(g,new THREE.SphereGeometry(.24,10,6),wood,.20,.012,0);boat.scale.set(1,.20,.38);
    box(g,.23,.12,.12,red,.20,.022,0);
    box(g,.27,.012,.15,brownRoof,.20,.15,0);
    g.userData.riversideShophouses=true;
    return finish(g,'新加坡河兩岸修復的彩色店屋、遮陽棚與傳統遊船');
  };
}
