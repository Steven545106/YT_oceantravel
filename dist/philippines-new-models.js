import * as THREE from 'three';

// Exterior-only, compressed reconstructions of the seven new Philippine sights.
// Shared materials and merged geometry keep their draw calls low in the game.
export function addPhilippinesNewModels(h) {
  const {builders,lmAdd:add,lmBox:box,lmCyl:cyl,lmHip:hip,lmMaterial:mat,
    roughMass,mergeByMaterial:merge,referencePlaque:plaque,TEXTURES}=h;
  const limestone=mat(0xbeb5a1,{map:TEXTURES.stone}),lightStone=mat(0xd9d0bb,{map:TEXTURES.stone});
  const cream=mat(0xe7d9bc),white=mat(0xe9e6dc),dark=mat(0x353c3c);
  const tile=mat(0x9b4e35,{map:TEXTURES.tiles}),wood=mat(0x6c4935,{map:TEXTURES.wood});
  const brick=mat(0x92513d,{map:TEXTURES.brick}),sand=mat(0xbb9b71,{map:TEXTURES.stone});
  const glass=mat(0x7396a0,{roughness:.27,metalness:.25}),copper=mat(0x6c7a6a,{metalness:.4});
  const grass=mat(0x568346,{roughness:1}),leaf=mat(0x3b6343,{roughness:1});
  const water=mat(0x397d95,{roughness:.24,metalness:.12}),iron=mat(0x4e5051,{metalness:.5});
  const gold=mat(0xb88954,{metalness:.42}),peach=mat(0xb97e68),skyGlass=mat(0x7aacc3,{roughness:.22,metalness:.2});
  const finish=(g,features)=>{const root=merge(g);root.userData={...g.userData,referencePass:'nk-ph-2026',features};return root;};
  function beam(g,a,b,r,m){
    const p=new THREE.Vector3(...a),q=new THREE.Vector3(...b),d=q.clone().sub(p);
    const mesh=add(g,new THREE.CylinderGeometry(r,r,d.length(),7),m,...p.add(q).multiplyScalar(.5).toArray());
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());
  }
  function arch(g,x,y,z,w,h,d,m){
    const s=new THREE.Shape(),r=w*.24,top=h*.52;
    s.moveTo(-w/2,0);s.lineTo(-r,0);s.lineTo(-r,top);
    s.absarc(0,top,r,Math.PI,0,true);s.lineTo(r,0);s.lineTo(w/2,0);
    s.lineTo(w/2,h);s.lineTo(-w/2,h);s.closePath();
    add(g,new THREE.ExtrudeGeometry(s,{depth:d,bevelEnabled:false,curveSegments:20}).translate(0,0,-d/2),m,x,y,z);
  }
  function pediment(g,x,y,z,w,h,d,m){
    const s=new THREE.Shape();s.moveTo(-w/2,0);s.lineTo(w/2,0);s.lineTo(0,h);s.closePath();
    add(g,new THREE.ExtrudeGeometry(s,{depth:d,bevelEnabled:false}),m,x,y,z);
  }
  function shrub(g,x,z,y=0,r=.09){add(g,roughMass(r,r*.8,r,{seed:Math.round((x+3)*73+(z+3)*31),jitter:.15,detail:1}),leaf,x,y+r*.7,z);}

  builders.intramuros=()=>{
    const g=new THREE.Group();
    box(g,2.35,.012,1.78,sand,0,-.012,0);
    // Puerta Real and the long southern curtain wall, separated from Fort Santiago.
    for(const side of [-1,1]){
      box(g,.72,.32,.19,limestone,side*.72,0,.63);
      for(let i=0;i<7;i++)box(g,.065,.045,.20,lightStone,side*(.39+i*.105),.32,.63);
      box(g,.17,.27,.85,limestone,side*1.10,0,.18);
    }
    arch(g,0,0,.63,.66,.41,.25,limestone);
    box(g,.70,.025,.28,lightStone,0,.41,.63);
    // A rounded defensive bastion at the left, with a recessed courtyard.
    cyl(g,.34,.37,.18,limestone,-.88,0,-.51,20);
    cyl(g,.23,.23,.018,grass,-.88,.185,-.51,20);
    for(let i=0;i<16;i++){
      const a=i*Math.PI/8;cyl(g,.015,.015,.065,lightStone,-.88+Math.sin(a)*.30,.18,-.51+Math.cos(a)*.30,6);
    }
    // Plaza de Roma and Manila Cathedral establish the walled-city skyline.
    box(g,.65,.012,.47,lightStone,.26,.012,-.26);
    box(g,.40,.28,.30,cream,.31,.025,-.57);
    for(const side of [-1,1]){
      box(g,.13,.45,.13,lightStone,.31+side*.21,.025,-.49);
      box(g,.16,.028,.16,limestone,.31+side*.21,.48,-.49);
      add(g,new THREE.ConeGeometry(.085,.16,8),copper,.31+side*.21,.59,-.49);
    }
    add(g,new THREE.SphereGeometry(.14,14,8,0,Math.PI*2,0,Math.PI/2),copper,.31,.35,-.62);
    for(let i=0;i<4;i++)box(g,.18,.16,.23,i%2?lightStone:brick,-.53+i*.24,.02,-.04);
    g.userData.openPassage=true;
    return finish(g,'王城石牆與通透城門、稜堡、羅馬廣場與馬尼拉主教座堂剪影');
  };

  builders.malacanang=()=>{
    const g=new THREE.Group();
    box(g,2.3,.015,1.2,grass,0,-.015,-.14);
    box(g,2.3,.008,.28,water,0,-.017,.62);
    box(g,1.90,.11,.49,cream,0,.015,-.14);
    box(g,2.00,.28,.55,white,0,.12,-.14);
    box(g,1.88,.24,.50,white,0,.43,-.14);
    box(g,1.98,.025,.60,limestone,0,.395,-.14);
    hip(g,.05,1.04,.15,tile,0,.67,-.14,.34);
    // The river-facing veranda is a long two-storey rhythm of arches and balcony bays.
    for(let i=0;i<13;i++){
      const x=-.86+i*.143;
      cyl(g,.012,.016,.26,white,x,.13,.147,10);
      box(g,.09,.13,.009,glass,x+.068,.19,.151);
      box(g,.09,.13,.009,glass,x+.068,.49,.117);
      if(i<12)box(g,.005,.08,.010,limestone,x+.071,.505,.124);
    }
    box(g,1.91,.025,.20,white,0,.405,.16);
    for(let i=0;i<21;i++)cyl(g,.006,.007,.065,lightStone,-.91+i*.091,.43,.249,6);
    box(g,.36,.54,.20,cream,0,.13,.013);
    for(const x of [-.13,0,.13])cyl(g,.019,.022,.40,white,x,.13,.224,12);
    box(g,.43,.03,.26,lightStone,0,.55,.12);
    pediment(g,0,.69,.07,.50,.12,.23,white);
    for(const x of [-.88,.88])shrub(g,x,.34,.02,.12);
    box(g,2.22,.035,.05,lightStone,0,-.005,.43);
    return finish(g,'白色河岸雙層拱廊、中央門廊、紅瓦和巴石河步道');
  };

  builders.nationalMuseumFineArts=()=>{
    const g=new THREE.Group();
    box(g,2.48,.025,1.08,lightStone,0,-.025,0);
    // Old Legislative Building: four floors, long wings and central colonnade.
    for(const side of [-1,1]){
      box(g,.88,.59,.48,limestone,side*.73,.055,-.17);
      for(let floor=0;floor<4;floor++)for(let j=0;j<6;j++){
        const x=side*.73-.37+j*.145;
        box(g,.075,.085,.009,dark,x,.10+floor*.126,.075);
        box(g,.087,.015,.015,lightStone,x,.19+floor*.126,.077);
      }
      box(g,.92,.025,.55,lightStone,side*.73,.65,-.17);
      for(let j=0;j<6;j++)cyl(g,.013,.016,.085,limestone,side*.73-.37+j*.145,.675,.091,8);
    }
    box(g,.73,.65,.62,cream,0,.065,-.18);
    box(g,.82,.025,.70,lightStone,0,.69,-.18);
    for(let i=0;i<6;i++)cyl(g,.035,.042,.48,white,-.30+i*.12,.14,.214,12);
    box(g,.78,.055,.21,lightStone,0,.62,.17);
    pediment(g,0,.71,.18,.80,.19,.14,lightStone);
    box(g,.22,.23,.015,dark,0,.08,.143);
    for(let i=0;i<5;i++)box(g,.65-i*.07,.020,.085,lightStone,0,.035+i*.018,.38+i*.045);
    for(let i=0;i<5;i++)box(g,.05,.09,.022,limestone,-.25+i*.125,.77,.335);
    return finish(g,'舊議會大廈的四層對稱長翼、中央柱廊與三角山花');
  };

  builders.metropolitanTheater=()=>{
    const g=new THREE.Group();
    box(g,2.22,.014,1.10,sand,0,-.014,0);
    box(g,1.96,.43,.58,cream,0,0,-.17);
    for(const side of [-1,1]){
      box(g,.44,.53,.63,peach,side*.75,0,-.17);
      box(g,.48,.028,.70,lightStone,side*.75,.53,-.17);
      for(let k=0;k<4;k++){
        box(g,.07,.085,.014,skyGlass,side*(.58+k*.11),.26,.153);
        box(g,.055,.10,.014,gold,side*(.58+k*.11),.41,.155);
      }
      for(let i=0;i<4;i++)box(g,.025,.08,.05,lightStone,side*(.63+i*.10),.56,-.16);
      shrub(g,side*.92,.34,.0,.08);
    }
    box(g,.95,.50,.68,cream,0,.04,-.14);
    // The broad arched stained-glass window and its radiating Art Deco muntins.
    const fan=new THREE.Shape();fan.moveTo(-.38,.0);fan.lineTo(-.38,.12);
    fan.absarc(0,.12,.38,Math.PI,0,true);fan.lineTo(.38,0);fan.closePath();
    add(g,new THREE.ShapeGeometry(fan),skyGlass,0,.24,.208);
    for(let i=0;i<=10;i++){
      const a=Math.PI-i*Math.PI/10;
      beam(g,[0,.36,.222],[Math.cos(a)*.38,.36+Math.sin(a)*.38,.222],.006,i%2?gold:dark);
    }
    box(g,.84,.035,.05,gold,0,.77,.19);
    for(const x of [-.34,-.17,0,.17,.34])cyl(g,.018,.023,.25,lightStone,x,.04,.285,12);
    box(g,.79,.045,.28,gold,0,.30,.26);
    for(const x of [-.12,.12])box(g,.14,.25,.013,wood,x,.04,.307);
    plaque(g,'MET',0,.68,.243,.28,.064,'#e2c491','#413c37');
    for(let i=0;i<5;i++)box(g,.045,.035,.035,gold,-.44+i*.22,.80,-.12);
    return finish(g,'裝飾藝術階梯立面、放射彩玻主窗、熱帶紋樣與劇院入口');
  };

  builders.corregidor=()=>{
    const g=new THREE.Group();
    box(g,2.45,.008,1.66,water,0,-.02,0);
    add(g,roughMass(1.02,.16,.58,{seed:480,jitter:.16,detail:2}),grass,0,.02,0);
    add(g,roughMass(.44,.21,.28,{seed:481,jitter:.12,detail:2}),leaf,.05,.13,-.16);
    box(g,.72,.035,.20,limestone,.39,.045,.26);
    // Malinta Tunnel mouth, not a closed black painted rectangle.
    arch(g,-.58,.04,.21,.36,.25,.22,limestone);
    box(g,.44,.017,.25,lightStone,-.58,.29,.21);
    for(let i=0;i<4;i++)box(g,.20,.010,.028,lightStone,-.58,.055+i*.022,.30+i*.035);
    // Battery Way's paired coastal guns and circular emplacements.
    for(const x of [.22,.71]){
      cyl(g,.19,.19,.035,limestone,x,.075,-.18,18);
      box(g,.18,.065,.17,iron,x,.11,-.18);
      const tube=add(g,new THREE.CylinderGeometry(.024,.039,.38,12),iron,x,.18,-.02);
      tube.rotation.x=Math.PI/2;
    }
    // Ruined barracks: standing wall fragments and open window voids.
    for(let i=0;i<5;i++){
      const x=-.72+i*.15;
      box(g,.10,.20+(i%2)*.08,.09,brick,x,.08,-.34);
      if(i<4)box(g,.15,.04,.10,brick,x+.075,.31,-.34);
    }
    for(let i=0;i<7;i++)shrub(g,-.9+i*.30,-.39,.10,.055);
    g.userData.openTunnel=true;
    return finish(g,'馬林塔隧道口、岸防砲臺與破損兵舍');
  };

  builders.lasCasas=()=>{
    const g=new THREE.Group();
    box(g,2.35,.010,1.86,sand,0,-.010,0);
    box(g,2.35,.008,.29,water,0,-.013,.80);
    box(g,.49,.012,1.54,limestone,0,.002,-.05);
    for(let row=0;row<17;row++)for(let col=0;col<4;col++){
      box(g,.095,.002,.066,row%2?lightStone:limestone,(col-1.5)*.115,.014,-.73+row*.09);
    }
    // Different stone-base / timber-upper casas surrounding the cobbled street.
    for(const side of [-1,1])for(let i=0;i<4;i++){
      const x=side*.68,z=-.58+i*.40,w=.44,h=.19+(i%3)*.035;
      box(g,w,h,.32,i%3?limestone:brick,x,.015,z);
      box(g,w+.025,.19,.35,i%2?cream:wood,x,.015+h,z);
      for(let k=0;k<4;k++){
        const xx=x-w*.38+k*w*.25;
        box(g,.055,.082,.010,glass,xx,.055+h,z+.18);
        box(g,.007,.085,.012,wood,xx,.055+h,z+.187);
      }
      box(g,w+.06,.025,.39,wood,x,h+.205,z);
      hip(g,.025,w*.61,.11,tile,x,h+.23,z,.82);
      for(let k=0;k<4;k++)cyl(g,.009,.010,.12,wood,x-.16+k*.105,h+.03,z+.205,6);
    }
    box(g,2.20,.020,.070,lightStone,0,.008,.65);
    for(let i=0;i<5;i++)shrub(g,-1.0+i*.5,.46,.02,.045);
    return finish(g,'巴丹水岸石板街、成列移建宅邸、石造底層與木質樓上');
  };

  builders.paoayChurch=()=>{
    const g=new THREE.Group();
    box(g,2.66,.02,2.05,sand,-.12,-.02,0);
    box(g,.78,.52,1.40,limestone,.17,.02,-.16);
    hip(g,.025,.47,.20,tile,.17,.54,-.16,1.58);
    // Fourteen huge volute-inspired seismic buttresses along nave sides.
    for(const side of [-1,1])for(let i=0;i<7;i++){
      const z=-.76+i*.205,x=.17+side*.48;
      box(g,.20,.28,.15,limestone,x,.02,z);
      beam(g,[x+side*.04,.32,z],[x-side*.09,.57,z],.052,lightStone);
      box(g,.15,.045,.18,lightStone,x,.31,z);
      add(g,new THREE.ConeGeometry(.049,.10,4).rotateY(Math.PI/4),lightStone,x,.40,z);
    }
    // Weathered coral-stone facade with broad triangular, relief-rich pediment.
    box(g,.94,.64,.19,lightStone,.17,.02,.64);
    pediment(g,.17,.66,.57,1.05,.36,.19,limestone);
    for(const x of [-.19,.17,.53]){
      cyl(g,.030,.035,.47,limestone,x,.03,.75,10);
      box(g,.09,.035,.06,lightStone,x,.50,.75);
    }
    arch(g,.17,.035,.755,.27,.33,.022,limestone);
    box(g,.14,.22,.012,wood,.17,.035,.77);
    add(g,new THREE.TorusGeometry(.075,.015,8,20),lightStone,.17,.58,.76);
    for(let i=0;i<5;i++)box(g,.36-i*.05,.019,.08,lightStone,.17,.008+i*.018,.91+i*.045);
    // The detached coral-stone bell tower is the decisive Paoay silhouette.
    for(let level=0;level<4;level++){
      const y=.02+level*.205,r=.18-level*.025;
      cyl(g,r,r+.025,.185,limestone,-.99,y,.16,8);
      for(let i=0;i<4;i++){
        const a=i*Math.PI/2;
        box(g,.055,.095,.012,dark,-.99+Math.sin(a)*(r+.008),y+.045,.16+Math.cos(a)*(r+.008),a);
      }
      cyl(g,r+.018,r+.018,.020,lightStone,-.99,y+.185,.16,8);
    }
    add(g,new THREE.ConeGeometry(.11,.15,8),limestone,-.99,.89,.16);
    return finish(g,'帕瓦伊教堂巨型抗震扶壁、厚珊瑚石正面與獨立鐘樓');
  };
}
