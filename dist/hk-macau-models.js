import * as THREE from 'three';

// Compact exterior dioramas based on the defining forms of each site.
// Geometry is merged by material so ten extra sights remain cheap in the game.
export function addHongKongMacauModels(h){
  const {builders,lmAdd:add,lmBox:box,lmCyl:cyl,lmHip:hip,lmMaterial:mat,
    roughMass,mergeByMaterial:merge,TEXTURES}=h;
  const stone=mat(0xb6aa93,{map:TEXTURES.stone}),pale=mat(0xe8ddc5,{map:TEXTURES.stone});
  const white=mat(0xeceae0),dark=mat(0x26333b),black=mat(0x171e24);
  const brick=mat(0x9f5948,{map:TEXTURES.brick}),red=mat(0x9c4a36,{map:TEXTURES.tiles});
  const bronze=mat(0x56766e,{metalness:.68,roughness:.35}),gold=mat(0xb29b65,{metalness:.48});
  const green=mat(0x4e7651),foliage=mat(0x366246),water=mat(0x397d97,{roughness:.26,metalness:.15});
  const glass=mat(0x6c9cad,{metalness:.35,roughness:.21}),blueGlass=mat(0x335e78,{metalness:.4,roughness:.2});
  const paving=mat(0xb9b2a2,{map:TEXTURES.stone});
  const yellow=mat(0xd9b24a,{map:TEXTURES.stone}),shutter=mat(0x3f6b4a),aluminium=mat(0x8f8a80,{metalness:.45,roughness:.5});
  function beam(g,a,b,r,m){
    const p=new THREE.Vector3(...a),q=new THREE.Vector3(...b),d=q.clone().sub(p);
    const mesh=add(g,new THREE.CylinderGeometry(r,r,d.length(),8),m,...p.add(q).multiplyScalar(.5).toArray());
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());
  }
  function arch(g,x,y,z,w,height,depth,m){
    const s=new THREE.Shape(),r=w*.31,shoulder=height-r;
    s.moveTo(-w/2,0);s.lineTo(-r,0);s.lineTo(-r,shoulder);
    s.absarc(0,shoulder,r,Math.PI,0,true);s.lineTo(r,0);s.lineTo(w/2,0);
    s.lineTo(w/2,height);s.lineTo(-w/2,height);s.closePath();
    add(g,new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:false,curveSegments:12}).translate(0,0,-depth/2),m,x,y,z);
  }
  function roof(g,x,y,z,w,d,m=red){hip(g,.065,w*.55,.06,m,x,y,z,d/w);}
  function finish(g,features){const root=merge(g);root.userData={...g.userData,referencePass:'hk-mo-2026',features};return root;}

  // Each sight is kept about as wide as it is tall (like the other countries' sights), so it can be shown at the
  // common minimum height without its base spreading over the city: compact plots, the main structure raised.
  builders.victoriaPeak=()=>{
    const g=new THREE.Group(),T=.21;   // the Peak Tower sits on the summit of a compact green hill
    add(g,roughMass(.60,.40,.48,{seed:3101,jitter:.15,detail:2}),green,0,-.04,0);
    for(const [x,z] of [[-.30,.30],[.32,.26]])add(g,roughMass(.09,.07,.09,{seed:Math.round(x*172+z*431)+1100,jitter:.14,detail:1}),foliage,x,.22,z);
    // Peak Tower's flared wok-shaped roof is its defining silhouette.
    box(g,.66,.29,.37,pale,0,.19+T,0);
    for(let i=0;i<7;i++)box(g,.055,.18,.012,glass,-.27+i*.09,.26+T,.192);
    const profile=[new THREE.Vector2(.10,.47),new THREE.Vector2(.36,.48),new THREE.Vector2(.49,.53),new THREE.Vector2(.54,.63),new THREE.Vector2(.58,.66),new THREE.Vector2(.59,.68)];
    const bowl=add(g,new THREE.LatheGeometry(profile,32),dark,0,T,0);bowl.scale.z=.62;
    const roofTop=add(g,new THREE.CircleGeometry(.59,32),dark,0,.679+T,0);roofTop.rotation.x=-Math.PI/2;roofTop.scale.y=.62;
    const rim=add(g,new THREE.TorusGeometry(.57,.018,8,32),gold,0,.67+T,0);rim.rotation.x=Math.PI/2;rim.scale.y=.62;
    box(g,.74,.025,.45,paving,0,.15+T,0);
    for(let i=0;i<10;i++)cyl(g,.006,.007,.075,white,-.37+i*.082,.17+T,.235,6);
    g.userData.peakTower=true;
    return finish(g,'山頂綠坡、凌霄閣外張碗形屋頂與觀景平台');
  };

  builders.victoriaHarbour=()=>{
    const g=new THREE.Group();box(g,1.50,.012,1.20,water,0,-.02,0);
    for(const side of [-1,1]){
      const z=side*.47;box(g,1.46,.018,.22,paving,0,-.002,z);
      for(let i=0;i<7;i++){
        const x=-.63+i*.21,h=.24+((i*7)%6)*.06;
        box(g,.12,h,.11,i%3?blueGlass:glass,x,.02,z+side*.07);
        for(let f=0;f<3;f++)box(g,.125,.005,.115,dark,x,.05+f*h/3,z+side*.07);
      }
    }
    // Two actual skyline landmarks: IFC's slender twin-pronged crown on the Central side, the taller ICC in Kowloon.
    box(g,.16,1.02,.15,blueGlass,-.42,.02,.52);
    for(const x of [-.475,-.365])box(g,.035,.15,.15,white,x,1.04,.52);
    box(g,.17,1.24,.16,blueGlass,.46,.02,-.52);
    box(g,.19,.034,.18,white,.46,1.26,-.52);
    // Star Ferry's green/white two-deck profile crosses the open centre.
    box(g,.54,.044,.19,dark,0,.035,0);
    box(g,.48,.055,.17,white,0,.076,0);
    box(g,.36,.025,.15,green,0,.132,0);
    for(let i=0;i<6;i++)box(g,.038,.035,.006,glass,-.14+i*.055,.096,.089);
    box(g,.03,.15,.025,white,-.07,.145,0);
    return finish(g,'中環與九龍兩岸天際線、國際金融中心、環球貿易廣場和天星小輪');
  };

  builders.tianTanBuddha=()=>{
    const g=new THREE.Group(),T=.12;   // a third altar tier lifts the figure, as the real three-tier altar does
    box(g,1.20,.016,1.20,paving,0,-.016,-.10);
    cyl(g,.56,.60,T,stone,0,0,-.22,12);
    cyl(g,.50,.56,.17,stone,0,T,-.22,12);
    cyl(g,.40,.44,.085,pale,0,.18+T,-.22,12);
    for(let i=0;i<12;i++){
      const a=i*Math.PI/6;
      const petal=add(g,new THREE.SphereGeometry(.11,10,8),bronze,Math.cos(a)*.30,.28+T,-.22+Math.sin(a)*.30);
      petal.scale.set(.85,.27,1.25);
    }
    add(g,new THREE.SphereGeometry(.30,16,12),bronze,0,.37+T,-.22).scale.set(1.2,.42,.88);
    add(g,new THREE.SphereGeometry(.24,16,12),bronze,0,.56+T,-.22).scale.set(1.00,1.06,.74);
    add(g,new THREE.SphereGeometry(.155,16,12),bronze,0,.79+T,-.22);
    add(g,new THREE.SphereGeometry(.09,12,8),bronze,0,.92+T,-.22).scale.y=.3;
    // Right palm outward; left hand rests on the lap.
    beam(g,[-.20,.60+T,-.22],[-.35,.48+T,-.02],.060,bronze);
    add(g,new THREE.SphereGeometry(.07,10,8),bronze,-.37,.48+T,.015).scale.set(.30,1.15,1.0);
    beam(g,[.19,.61+T,-.22],[.28,.38+T,-.015],.060,bronze);
    for(let i=0;i<6;i++)box(g,.40+i*.03,.02,.05,pale,0,.10-i*.018,.40+i*.04);
    g.userData.seatedBuddha=true;
    return finish(g,'青銅坐佛、三層圓壇、蓮花座和昂坪長階');
  };

  builders.avenueOfStars=()=>{
    const g=new THREE.Group();box(g,1.30,.012,.42,water,0,-.02,-.40);
    box(g,1.30,.022,.80,paving,0,.005,.20);
    box(g,1.26,.040,.045,dark,0,.015,-.18);
    for(let i=0;i<10;i++){
      const x=-.58+i*.129;
      cyl(g,.006,.007,.075,white,x,.055,-.18,6);
      box(g,.055,.004,.024,gold,x,.076,-.18);
      if(i%2===0)box(g,.040,.002,.040,bronze,x,.028,.42);
    }
    // Bruce Lee's statue, the promenade's best-known figure, shown large on a granite plinth in his fighting stance.
    box(g,.34,.16,.30,stone,0,.025,.18);
    const S=2.6,base=.185,lee=(x,y,z)=>[x*S,base+y*S,.18+z*S];
    cyl(g,.025*S,.03*S,.21*S,bronze,0,base+.025*S,.18,8);
    add(g,new THREE.SphereGeometry(.047*S,10,8),bronze,...lee(0,.27,0));
    beam(g,lee(-.01,.22,0),lee(-.19,.15,-.13),.018*S,bronze);
    beam(g,lee(.01,.22,0),lee(.19,.19,-.08),.018*S,bronze);
    beam(g,lee(-.02,.07,0),lee(-.12,0,.12),.020*S,bronze);
    beam(g,lee(.02,.07,0),lee(.13,0,.11),.020*S,bronze);
    // the Hong Kong Film Awards statuette on its column at the promenade's end
    cyl(g,.05,.06,.42,stone,-.52,.025,.40,10);
    cyl(g,.02,.03,.16,gold,-.52,.445,.40,8);
    add(g,new THREE.SphereGeometry(.05,10,8),gold,-.52,.64,.40);
    return finish(g,'尖沙咀海濱步道、電影人手印欄杆、李小龍銅像與金像獎雕塑');
  };

  builders.taiKwun=()=>{
    const g=new THREE.Group();box(g,1.20,.016,1.00,paving,0,-.016,0);
    // Former Central Police Station Headquarters Block: cream classical frontage, arcaded veranda and raised pediment.
    box(g,1.04,.46,.36,pale,0,.02,-.26);box(g,1.10,.028,.44,stone,0,.49,-.26);
    for(let i=0;i<8;i++){
      const x=-.455+i*.13;
      box(g,.074,.11,.009,dark,x,.17,-.071);
      cyl(g,.013,.015,.21,white,x,.04,-.059,8);
      box(g,.047,.088,.009,glass,x,.36,-.072);
    }
    const pediment=new THREE.Shape();pediment.moveTo(-.24,0);pediment.lineTo(.24,0);pediment.lineTo(0,.16);pediment.closePath();
    add(g,new THREE.ExtrudeGeometry(pediment,{depth:.06,bevelEnabled:false}),pale,0,.518,-.09);
    box(g,.40,.20,.30,pale,0,.518,-.26);
    cyl(g,.008,.008,.32,white,0,.84,-.26,6);
    // JC Contemporary's perforated aluminium box rises behind the red-brick prison wing.
    box(g,.38,.30,.30,brick,-.36,.02,.30);
    for(let i=0;i<3;i++)box(g,.067,.089,.009,dark,-.51+i*.15,.12,.455);
    box(g,.36,.80,.32,aluminium,.34,.02,.28);
    for(let r=0;r<6;r++)for(let c=0;c<4;c++)box(g,.05,.05,.006,dark,.22+c*.08,.10+r*.12,.443);
    return finish(g,'前中區警署古典柱廊與山牆、監獄紅磚樓與賽馬會當代美術館的鋁磚立面');
  };

  builders.ruinsStPaul=()=>{
    const g=new THREE.Group();box(g,1.00,.015,1.00,paving,0,-.015,-.05);
    for(let i=0;i<8;i++)box(g,1.00-i*.03,.019,.06,stone,0,.003+i*.019,.42-i*.075);
    // A freestanding five-tier granite screen: the lost church has no solid body behind it.
    const widths=[1.00,.91,.77,.60,.39],levels=[.01,.26,.48,.69,.86],heights=[.26,.22,.21,.17,.13];
    for(let k=0;k<5;k++){
      const w=widths[k],y=levels[k],height=heights[k];
      for(const side of [-1,1])box(g,.17,height,.11,stone,side*(w/2-.085),y,-.42);
      if(k===0)arch(g,0,y,-.42,w-.34,height,.11,stone);
      else {
        box(g,w-.34,.045,.12,stone,0,y+height-.045,-.42);
        for(const x of k<3?[-.23,0,.23]:[0]){
          box(g,.12,.11,.011,dark,x,y+.038,-.355);
          box(g,.015,.14,.015,pale,x-.067,y+.025,-.35);
          box(g,.015,.14,.015,pale,x+.067,y+.025,-.35);
        }
      }
      box(g,w+.05,.035,.15,pale,0,y+height,-.42);
      for(const side of [-1,1])cyl(g,.017,.022,height*.68,pale,side*(w/2-.15),y+.03,-.33,8);
    }
    box(g,.14,.14,.10,stone,0,1.00,-.42);
    box(g,.035,.15,.040,stone,0,1.14,-.42);
    box(g,.12,.033,.040,stone,0,1.20,-.42);
    g.userData.openRuin=true;
    return finish(g,'僅存的五層花崗石巴洛克立面、雕飾柱與大三巴石階');
  };

  builders.senadoSquare=()=>{
    const g=new THREE.Group();box(g,1.20,.015,1.10,white,0,-.015,0);
    // Curving Portuguese black-and-white calcada stripes, visible from above.
    for(let row=0;row<6;row++){
      const shape=new THREE.Shape();
      const z=-.10+row*.10;
      for(let i=0;i<=20;i++){const x=-.58+i*1.16/20,v=z+.02*Math.sin(i*.75+row*.37);if(i===0)shape.moveTo(x,v);else shape.lineTo(x,v);}
      for(let i=20;i>=0;i--){const x=-.58+i*1.16/20;shape.lineTo(x,z+.035+.02*Math.sin(i*.75+row*.37));}
      shape.closePath();
      const stripe=add(g,new THREE.ShapeGeometry(shape),dark,0,.004,0);stripe.rotation.x=-Math.PI/2;
    }
    for(const side of [-1,1]){
      box(g,.30,.34,.32,side<0?pale:white,side*.44,.02,.10);
      roof(g,side*.44,.36,.10,.34,.36,red);
      for(let i=0;i<2;i++){
        box(g,.067,.11,.010,glass,side*.44-.07+i*.14,.19,-.065);
        cyl(g,.017,.019,.15,stone,side*.44-.07+i*.14,.02,-.066,8);
      }
    }
    // St Dominic's Church closes the square: yellow baroque front with green shutters and a bell-tower gable.
    box(g,.62,.62,.26,yellow,0,.02,-.40);
    for(const x of [-.20,0,.20])for(const y of [.14,.38])box(g,.07,.13,.012,shutter,x,y,-.264);
    for(const x of [-.30,-.10,.10,.30])box(g,.03,.60,.03,white,x,.02,-.262);
    box(g,.66,.035,.30,white,0,.64,-.40);
    box(g,.34,.20,.20,yellow,0,.675,-.40);
    const gable=new THREE.Shape();gable.moveTo(-.19,0);gable.lineTo(.19,0);gable.lineTo(0,.14);gable.closePath();
    add(g,new THREE.ExtrudeGeometry(gable,{depth:.05,bevelEnabled:false}),white,0,.875,-.34);
    cyl(g,.012,.012,.10,white,0,1.00,-.315,6);
    cyl(g,.10,.13,.07,stone,0,.00,.32,16);
    cyl(g,.045,.055,.10,white,0,.07,.32,12);
    add(g,new THREE.SphereGeometry(.04,12,8),white,0,.21,.32);
    return finish(g,'葡式黑白波浪石仔路、中央噴泉、議事亭周邊騎樓與玫瑰堂黃色巴洛克立面');
  };

  builders.guiaFortress=()=>{
    const g=new THREE.Group();box(g,1.10,.017,1.00,green,0,-.017,0);
    add(g,roughMass(.52,.19,.46,{seed:3341,jitter:.13,detail:2}),stone,0,.00,0);
    for(const side of [-1,1])box(g,.34,.14,.10,stone,side*.30,.10,.36);
    for(let i=0;i<6;i++)box(g,.070,.040,.11,pale,-.45+i*.18,.24,.36);
    // Square white Guia lighthouse, red window surrounds and lantern room.
    box(g,.22,.80,.22,white,-.18,.21,-.16);
    for(let i=0;i<4;i++)box(g,.066,.085,.012,dark,-.18,.34+i*.16,-.041);
    box(g,.29,.032,.29,brick,-.18,1.01,-.16);
    cyl(g,.15,.15,.15,glass,-.18,1.04,-.16,10);
    add(g,new THREE.ConeGeometry(.19,.12,10),red,-.18,1.21,-.16);
    box(g,.30,.22,.26,white,.24,.18,-.12);roof(g,.24,.42,-.12,.32,.28,red);
    box(g,.12,.13,.015,brick,.24,.21,.016);
    box(g,.18,.035,.14,stone,.36,.18,.24);
    const gun=add(g,new THREE.CylinderGeometry(.028,.041,.24,10),dark,.36,.25,.33);gun.rotation.x=Math.PI/2;
    g.userData.lighthouse=true;
    return finish(g,'東望洋石砌炮台、白色燈塔、雪地聖母小堂與岸防砲');
  };

  builders.macauTower=()=>{
    const g=new THREE.Group();box(g,.86,.016,.82,paving,0,-.016,0);
    box(g,.55,.11,.49,pale,0,.02,0);
    // Tapered concrete shaft with the characteristic layered observation pod.
    add(g,new THREE.CylinderGeometry(.055,.105,2.60,16),pale,0,1.32,0);
    for(let i=0;i<4;i++){
      const y=2.07+i*.13,r=[.18,.23,.23,.18][i];
      cyl(g,r,r,.105,i===1||i===2?blueGlass:white,0,y,0,24);
    }
    cyl(g,.075,.10,.35,white,0,2.59,0,16);
    beam(g,[0,2.89,0],[0,3.39,0],.018,dark);
    for(let i=0;i<3;i++)cyl(g,.084,.084,.012,white,0,2.92+i*.11,0,12);
    g.userData.towerPod=true;
    return finish(g,'細長混凝土塔身、疊層環形觀景艙與頂端天線');
  };

  builders.venetianMacao=()=>{
    const g=new THREE.Group();box(g,1.16,.013,1.00,paving,0,-.013,0);
    box(g,.92,.44,.46,pale,-.04,.02,-.22);roof(g,-.04,.48,-.22,.98,.50,red);
    for(let i=0;i<7;i++)arch(g,-.43+i*.13,.035,.04,.115,.25,.075,pale);
    // The Venetian's tall, square Campanile and canal-side palazzo arcade.
    box(g,.20,1.06,.20,pale,.42,.02,.10);
    for(let i=0;i<4;i++)box(g,.095,.15,.013,dark,.42,.63+i*.12,.211);
    box(g,.28,.055,.28,stone,.42,1.09,.10);
    add(g,new THREE.ConeGeometry(.16,.19,4),red,.42,1.20,.10).rotation.y=Math.PI/4;
    box(g,1.10,.008,.26,water,0,.002,.36);
    beam(g,[-.38,.025,.36],[-.16,.13,.36],.017,stone);
    beam(g,[-.16,.13,.36],[.06,.025,.36],.017,stone);
    box(g,.40,.014,.08,stone,-.16,.075,.36);
    return finish(g,'威尼斯式紅瓦宮殿拱廊、方形鐘樓、人工運河與小橋');
  };
}
