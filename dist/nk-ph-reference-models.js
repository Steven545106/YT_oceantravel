import * as THREE from 'three';

// Compact exterior reconstructions. The game terrain supplies the full mountain
// for both peak entries; these models supply their distinctive summit details.
export function refineNkPhLandmarks(h) {
  const {builders, lmAdd:add, lmBox:box, lmCyl:cyl, lmMaterial:mat,
    mergeByMaterial:merge, roughMass, lmHip:hip, referencePlaque:plaque, TEXTURES} = h;
  const stone=mat(0xd8d2c5,{map:TEXTURES.stone}), pale=mat(0xe9e8e1,{map:TEXTURES.stone});
  const joint=mat(0x837e75), dark=mat(0x292b2b), brick=mat(0x9d573e,{map:TEXTURES.brick});
  const roof=mat(0xa95436,{map:TEXTURES.tiles}), timber=mat(0x65442f,{map:TEXTURES.wood});
  const green=mat(0x4c793e,{roughness:1}), deepGreen=mat(0x27543a,{roughness:1});
  const water=mat(0x236782,{roughness:.22,metalness:.12}), foam=mat(0xe9f4ed,{roughness:.55});
  const bronze=mat(0x5b503f,{metalness:.48,roughness:.46}), gold=mat(0xd8b565,{metalness:.47});
  const ash=mat(0x746f68,{roughness:1}), snow=mat(0xc6c9c5,{roughness:1});
  const glass=mat(0x9fc1ca,{metalness:.35,roughness:.3});
  const finish=(g,features)=>{const root=merge(g);root.userData={...g.userData,referencePass:'nk-ph-2026',features};return root;};
  const previousPeak=builders.peak;
  function beam(g,a,b,r,m) {
    const p=new THREE.Vector3(...a),q=new THREE.Vector3(...b),d=q.clone().sub(p);
    const mesh=add(g,new THREE.CylinderGeometry(r,r,d.length(),7),m,...p.add(q).multiplyScalar(.5).toArray());
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());
  }
  function ridgeRing(g,rings,material,segments=48) {
    const v=[],idx=[];
    for(let row=0;row<rings.length;row++)for(let j=0;j<=segments;j++){
      const a=j/segments*Math.PI*2,[radius,height]=rings[row];
      const wobble=1+.035*Math.sin(a*7+row)+.025*Math.sin(a*13-row);
      v.push(Math.sin(a)*radius*wobble,height+.015*Math.sin(a*5+row),Math.cos(a)*radius*wobble);
    }
    for(let row=0;row<rings.length-1;row++)for(let j=0;j<segments;j++){
      const a=row*(segments+1)+j,b=a+segments+1;idx.push(a,a+1,b,b,a+1,b+1);
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));geo.setIndex(idx);geo.computeVertexNormals();
    add(g,geo,material,0,0,0);
  }
  builders.peak=(options={})=>{
    const g=new THREE.Group();
    if(options.volcano==='paektu') {
      ridgeRing(g,[[.78,.025],[.59,.19],[.40,.39],[.30,.31],[.27,.18]],ash);
      cyl(g,.274,.274,.008,water,0,.177,0,48);
      for(let i=0;i<14;i++){
        const a=i*Math.PI*2/14,r=.40+.026*Math.sin(i*3);
        add(g,roughMass(.055,.075,.05,{seed:110+i,jitter:.18,detail:1}),i%3?snow:ash,Math.sin(a)*r,.36,Math.cos(a)*r);
      }
      g.userData.summit='Lake Chon caldera';
      return finish(g,'白頭山火口環壁、灰白岩稜、殘雪與藍色天池');
    }
    if(options.volcano==='mayon') {
      ridgeRing(g,[[.70,0],[.57,.12],[.43,.33],[.30,.55]],green);
      ridgeRing(g,[[.30,.55],[.16,.78],[.055,.89]],ash);
      cyl(g,.057,.057,.008,dark,0,.885,0,32);
      for(let i=0;i<13;i++){
        const a=i*Math.PI*2/13;
        beam(g,[Math.sin(a)*.075,.80,Math.cos(a)*.075],[Math.sin(a)*(.44+.03*Math.sin(i)),.30,Math.cos(a)*(.44+.03*Math.sin(i))],.004,i%3?snow:ash);
      }
      if(options.smoke)for(let i=0;i<4;i++){
        const puff=add(g,new THREE.SphereGeometry(.025+i*.012,9,7),snow,.02+i*.035,.94+i*.075,0);
        puff.scale.set(1.4,.45,1);
      }
      g.userData.summit='Mayon cone and crater';
      return finish(g,'馬永火山對稱錐形山頂、放射狀灰溝與小型火口');
    }
    return previousPeak(options);
  };
  builders.triumphArch=()=>{
    const g=new THREE.Group();
    box(g,1.52,.035,.83,stone,0,-.035,0);
    // The passage is open through the full depth. The arched spandrel follows
    // its curved ceiling, rather than painting a black door on a solid slab.
    for(const side of [-1,1]){
      box(g,.36,.74,.48,pale,side*.35,0,0);
      box(g,.41,.025,.55,stone,side*.35,.31,0);
      for(const z of [-.244,.244]){
        box(g,.045,.68,.014,stone,side*.53,.015,z);
        box(g,.24,.20,.008,stone,side*.35,.40,z+Math.sign(z)*.012);
        for(let i=0;i<4;i++)box(g,.18,.005,.009,joint,side*.35,.435+i*.043,z+Math.sign(z)*.018);
      }
      box(g,.17,.085,.012,stone,side*.34,.16,.253);
      for(let k=0;k<4;k++)box(g,.12,.006,.014,gold,side*(.29+k*.032),.198,.263);
      plaque(g,side<0?'1925':'1945',side*.35,.64,.258,.19,.052,'#d8d2c5','#655d52');
    }
    const s=new THREE.Shape();s.moveTo(-.17,.55);s.absarc(0,.55,.17,Math.PI,0,true);s.lineTo(.53,.74);s.lineTo(-.53,.74);s.closePath();
    const spandrel=new THREE.ExtrudeGeometry(s,{depth:.48,bevelEnabled:false,curveSegments:24});spandrel.translate(0,0,-.24);
    add(g,spandrel,pale,0,0,0);
    for(const z of [-.251,.251]){
      const ring=new THREE.TorusGeometry(.175,.012,8,32,Math.PI);
      const a=add(g,ring,stone,0,.55,z);a.rotation.z=Math.PI;
    }
    box(g,1.18,.05,.60,stone,0,.74,0);box(g,1.24,.035,.64,pale,0,.79,0);
    box(g,1.15,.23,.54,pale,0,.825,0);
    for(const y of [.86,.98,1.045])box(g,1.21,.012,.59,stone,0,y,0);
    box(g,1.29,.025,.68,stone,0,1.055,0);
    for(const side of [-1,1])for(const z of [-.27,.27]){
      box(g,.11,.045,.013,gold,side*.37,.92,z+Math.sign(z)*.006);
      box(g,.14,.038,.015,stone,side*.37,.96,z+Math.sign(z)*.007);
    }
    g.userData.openPassage=true;
    return finish(g,'白色花崗岩、真正通透的圓拱、兩側浮雕與多層檐口');
  };
  // Existing exterior masses are retained where accurate; this pass redraws
  // the silhouettes and foreground details that identify each Philippine site.
  const old={};
  for(const key of ['sanAgustin','rizalMonument','fortSantiago','vigan','banaueTerraces','pagsanjanFalls','taal','bojeador','bascoLighthouse'])old[key]=builders[key];
  builders.sanAgustin=()=>{
    const g=old.sanAgustin();
    // Paired Tuscan pilasters, front rose window, stone parapets and the single bell tower.
    for(const x of [-.40,-.25,.34,.49]){
      box(g,.055,.018,.035,pale,x,.025,.46);box(g,.065,.024,.035,stone,x,.60,.46);
    }
    add(g,new THREE.TorusGeometry(.056,.008,7,24),stone,.05,.51,.462);
    for(let i=0;i<8;i++){const a=i*Math.PI/4;beam(g,[.05,.51,.466],[.05+Math.cos(a)*.045,.51+Math.sin(a)*.045,.466],.002,joint);}
    for(let k=0;k<3;k++){box(g,.81,.014,.028,stone,.05,.57+k*.025,.465);}
    return finish(g,'粗石巴洛克立面、成對柱式、玫瑰窗與單側鐘樓');
  };
  builders.rizalMonument=()=>{
    const g=old.rizalMonument();
    // A legible standing figure on the seaward face of the granite pylon.
    box(g,.11,.015,.10,stone,0,.44,.195);
    for(const x of [-.025,.025])cyl(g,.012,.014,.12,bronze,x,.46,.21,7);
    box(g,.09,.17,.05,bronze,0,.57,.21);
    for(const x of [-.055,.055])beam(g,[x,.705,.21],[x*1.25,.59,.21],.009,bronze);
    add(g,new THREE.SphereGeometry(.032,12,8),bronze,0,.76,.21);
    box(g,.21,.075,.009,joint,0,.29,.305);
    return finish(g,'灰色花崗石方尖碑、面海黎剎銅像、群像與公園地坪');
  };
  builders.fortSantiago=()=>{
    const g=new THREE.Group();
    box(g,2.05,.015,1.65,green,0,-.015,0);
    box(g,2.05,.018,.32,water,0,-.018,.75);
    for(const side of [-1,1]){
      box(g,.67,.37,.32,stone,side*.63,0,.34);
      box(g,.32,.33,.98,stone,side*.87,0,-.23);
      for(let i=0;i<7;i++)box(g,.075,.065,.34,pale,side*(.34+i*.10),.37,.34);
    }
    const gate=new THREE.Shape();gate.moveTo(-.32,0);gate.lineTo(-.13,0);gate.lineTo(-.13,.235);gate.absarc(0,.235,.13,Math.PI,0,true);gate.lineTo(.13,0);gate.lineTo(.32,0);gate.lineTo(.32,.59);gate.lineTo(-.32,.59);gate.closePath();
    const geo=new THREE.ExtrudeGeometry(gate,{depth:.27,bevelEnabled:false,curveSegments:20});geo.translate(0,0,-.135);
    add(g,geo,stone,0,0,.40);
    for(const x of [-.25,.25])cyl(g,.028,.032,.47,pale,x,.02,.55,10);
    box(g,.64,.035,.32,pale,0,.59,.40);
    const crest=new THREE.Shape();crest.moveTo(-.29,0);crest.quadraticCurveTo(0,.24,.29,0);crest.closePath();
    add(g,new THREE.ExtrudeGeometry(crest,{depth:.31,bevelEnabled:false,curveSegments:16}),pale,0,.62,.245);
    add(g,new THREE.TorusGeometry(.10,.012,6,20,Math.PI),joint,0,.27,.548).rotation.z=Math.PI;
    // Carved coat of arms and St James relief above the gateway.
    box(g,.16,.10,.012,joint,0,.49,.555);add(g,new THREE.SphereGeometry(.022,8,6),pale,0,.54,.567);
    box(g,.26,.02,.32,stone,0,.008,.69);
    for(let i=0;i<6;i++)box(g,.26,.008,.02,pale,0,.015,.56+i*.045);
    g.userData.openPassage=true;
    return finish(g,'巴石河口護城河、厚石牆雉堞、雕飾山花與通透拱門');
  };
  builders.vigan=()=>{
    const g=old.vigan();
    // Calle Crisologo's cobbles, timber balcony rails and capiz window grid.
    for(let row=0;row<28;row++)for(let col=0;col<5;col++){
      const x=(col-2)*.095+(row%2)*.025,z=-1.22+row*.09;
      box(g,.075,.002,.055,row%4?stone:joint,x,.012,z);
    }
    for(const side of [-1,1])for(let i=0;i<6;i++){
      const z=-1.1+i*.44,x=side*.18;
      box(g,.012,.016,.34,timber,x,.415,z);
      for(let j=0;j<5;j++)box(g,.008,.065,.008,timber,x,.35,z-.14+j*.07);
      for(let j=0;j<4;j++)box(g,.006,.075,.004,stone,side*.199,.28,z-.13+j*.09);
    }
    return finish(g,'克里索洛哥街鵝卵石路、外挑木樓、貝殼窗與卡萊薩馬車');
  };
  builders.banaueTerraces=()=>{
    const g=old.banaueTerraces();
    // Batad-like amphitheatre: emphasise the visible curved retaining lips.
    for(let k=0;k<14;k++){
      const r=1.07-k*.062,y=k*.056;
      const arc=new THREE.TorusGeometry(r,.007,5,48,Math.PI*1.22);
      const mesh=add(g,arc,k%3?stone:joint,0,y+.055,0);mesh.rotation.x=Math.PI/2;mesh.rotation.z=-.60;
      if(k%3===0){const pool=new THREE.RingGeometry(r-.034,r-.016,48,1,-.65,Math.PI*1.14);add(g,pool,water,0,y+.058,0).rotation.x=-Math.PI/2;}
    }
    return finish(g,'半圓劇場式稻田、彎曲石埂、水田反光與伊富高高腳屋');
  };
  builders.pagsanjanFalls=()=>{
    const g=old.pagsanjanFalls();
    // Narrow translucent-looking streams break up the old flat waterfall slab.
    for(let i=0;i<17;i++){
      const x=-.16+i*.020,y=.07+(i%4)*.012;
      box(g,.009,.85,.009,i%4?foam:water,x,y,-.551);
      add(g,new THREE.SphereGeometry(.012,7,5),foam,x,.055,-.49+(i%3)*.025);
    }
    for(const side of [-1,1])for(let i=0;i<9;i++){
      const x=side*(.46+i*.028),z=-.72+i*.105;
      add(g,roughMass(.07,.08,.07,{seed:141+i+(side+1)*9,jitter:.2,detail:1}),deepGreen,x,.61+(i%3)*.09,z);
    }
    return finish(g,'狹窄植被峽谷、分束高瀑、飛沫潭與兩艘獨木舟');
  };
  builders.taal=()=>{
    const g=old.taal();
    // Low, broad Volcano Island with an uneven crater rim and inner lake.
    ridgeRing(g,[[.44,.11],[.28,.235],[.18,.20]],ash,36);
    cyl(g,.17,.17,.009,water,0,.206,0,36);
    for(let i=0;i<12;i++){
      const a=i*Math.PI/6;add(g,roughMass(.06,.035,.05,{seed:150+i,jitter:.18,detail:1}),i%3?green:ash,Math.sin(a)*.43,.08,Math.cos(a)*.43);
    }
    return finish(g,'大湖中的低矮火山島、不規則火口、內湖與遠方大雅台山脊');
  };
  builders.bojeador=()=>{
    const g=old.bojeador();
    // Red octagonal brick tower, black-framed lantern and white keeper house.
    for(let level=0;level<5;level++)cyl(g,.071,.071,.008,stone,-.35,.40+level*.09,-.05,8);
    for(let i=0;i<8;i++){
      const a=i*Math.PI/4;
      cyl(g,.003,.003,.085,dark,-.35+Math.sin(a)*.055,.93,-.05+Math.cos(a)*.055,5);
    }
    cyl(g,.081,.081,.011,dark,-.35,1.01,-.05,8);
    for(let i=0;i<7;i++)box(g,.06,.012,.012,stone,.13+i*.075,.45,.286);
    return finish(g,'紅磚八角塔、黑框燈室、環形欄杆與白色燈守住房');
  };
  builders.bascoLighthouse=()=>{
    const g=new THREE.Group();
    add(g,roughMass(.92,.15,.76,{seed:360,jitter:.10,detail:2}),green,0,0,0);
    add(g,roughMass(.48,.10,.42,{seed:361,jitter:.12,detail:2}),deepGreen,.30,.07,-.20);
    const y=.13;
    cyl(g,.12,.15,.95,pale,0,y,0,20);
    for(let level=0;level<5;level++){
      cyl(g,.122+level*.004,.122+level*.004,.012,stone,0,y+.16+level*.16,0,20);
      box(g,.043,.062,.008,glass,0,y+.13+level*.16,.125);
    }
    box(g,.075,.13,.009,timber,0,y,.151);
    cyl(g,.19,.19,.026,pale,0,1.08,0,20);
    for(let i=0;i<16;i++){
      const a=i*Math.PI/8;
      cyl(g,.004,.004,.065,stone,Math.sin(a)*.177,1.105,Math.cos(a)*.177,5);
    }
    cyl(g,.092,.092,.14,glass,0,1.13,0,16);
    for(let i=0;i<8;i++){
      const a=i*Math.PI/4;cyl(g,.005,.005,.14,dark,Math.sin(a)*.088,1.13,Math.cos(a)*.088,5);
    }
    cyl(g,.116,.116,.014,dark,0,1.27,0,16);
    add(g,new THREE.SphereGeometry(.113,16,8,0,Math.PI*2,0,Math.PI/2),roof,0,1.282,0);
    cyl(g,.010,.010,.054,dark,0,1.39,0,8);
    for(const [x,z] of [[-.48,.35],[.50,.27]]){
      box(g,.25,.15,.19,stone,x,.09,z);
      hip(g,.015,.17,.095,mat(0xbda16f,{roughness:1}),x,.24,z,1.1);
      box(g,.044,.064,.008,dark,x,.14,z+.10);
    }
    for(const [x0,z0,x1,z1] of [[-.73,-.13,-.22,-.36],[.22,-.36,.69,-.10],[-.68,.55,.68,.55]]){
      for(let i=0;i<9;i++){
        const t=i/8;box(g,.10,.035,.038,stone,x0+(x1-x0)*t,.04,z0+(z1-z0)*t,Math.atan2(-(z1-z0),x1-x0));
      }
    }
    return finish(g,'奈迪山白色圓塔、紅色燈室圓頂、牧草坡與矮石牆');
  };
}
