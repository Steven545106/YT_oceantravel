import * as THREE from 'three';

// RCKH is a compact east-west (09/27) field. The aircraft are deliberately
// enlarged relative to the runway so their motion reads from the sea.
export function createKaohsiungAirport({lmAdd,lmBox,lmCyl,lmMaterial,mergeByMaterial}) {
  const staticParts=new THREE.Group();
  const pavement=lmMaterial(0x747a7c,{roughness:1});
  const runway=lmMaterial(0x30363b,{roughness:1});
  const taxi=lmMaterial(0x626b70,{roughness:1});
  const apron=lmMaterial(0xaeb5b4,{roughness:1});
  const white=lmMaterial(0xe9e9df,{roughness:.85});
  const yellow=lmMaterial(0xe6bd46,{roughness:.8});
  const glass=lmMaterial(0x508da2,{metalness:.18,roughness:.25});
  const roof=lmMaterial(0xc8d3d7,{metalness:.15,roughness:.48});
  const concrete=lmMaterial(0xd8dad5,{roughness:.9});
  const light=lmMaterial(0xf8d693,{emissive:0xe3ac52,emissiveIntensity:.55});
  const grass=lmMaterial(0x527c4d,{roughness:1});
  const dark=lmMaterial(0x3b4850,{roughness:.8});

  // West is -X, east is +X; north is -Z. The southern apron is omitted.
  lmBox(staticParts,4.75,.012,1.72,grass,0,-.018,0);
  lmBox(staticParts,4.42,.013,.43,pavement,0,.001,.30);
  lmBox(staticParts,4.34,.009,.32,runway,0,.016,.30);
  lmBox(staticParts,3.94,.008,.13,taxi,0,.013,-.055);
  lmBox(staticParts,3.54,.009,.28,apron,0,.012,-.36);
  // White runway thresholds, dashed centreline, edge lights and yellow taxi centreline.
  for(const end of [-1,1]) {
    for(let i=0;i<4;i++)lmBox(staticParts,.085,.003,.020,white,end*1.96,.023,.235+i*.044);
    lmBox(staticParts,.125,.003,.018,white,end*1.76,.024,.30);
  }
  // Runway-end numerals read as 09 from the west and 27 from the east.
  const digits={
    '0':[0,1,2,4,5,6], '9':[0,1,2,3,5,6],
    '2':[0,1,3,4,6], '7':[0,1,2]
  };
  const drawDigit=(digit,x,z)=>{
    for(const segment of digits[digit]){
      const horizontal=[0,3,6].includes(segment);
      const dx=horizontal?0:((segment===1||segment===2) ? .021 : -.021);
      const dz=segment===0 ? -.041 : segment===3 ? 0 : segment===6 ? .041 : ((segment===1||segment===5) ? -.0205 : .0205);
      lmBox(staticParts,horizontal?.043:.006,.002,horizontal?.006:.037,white,x+dx,.025,z+dz);
    }
  };
  drawDigit('0',-1.70,.25);drawDigit('9',-1.63,.25);
  drawDigit('2',1.63,.25);drawDigit('7',1.70,.25);
  for(let i=-8;i<=8;i++)lmBox(staticParts,.10,.003,.008,white,i*.225,.024,.30);
  for(let i=-21;i<=21;i++) {
    const x=i*.10;
    lmBox(staticParts,.013,.007,.012,white,x,.025,.126);
    lmBox(staticParts,.013,.007,.012,white,x,.025,.474);
  }
  lmBox(staticParts,3.78,.003,.006,yellow,0,.022,-.055);
  for(const x of [-1.48,-.72,.08,.82,1.55]) {
    lmBox(staticParts,.011,.003,.38,taxi,x,.017,.105);
    lmBox(staticParts,.006,.003,.38,yellow,x,.024,.105);
  }
  for(const x of [-.65,.72]){
    lmBox(staticParts,.006,.003,.17,yellow,x,.022,-.30);
    lmBox(staticParts,.28,.004,.006,white,x,.024,-.39);
  }
  // Current international terminal: long glass frontage, pale raised roof,
  // passenger bridges; domestic terminal is lower and to the west.
  lmBox(staticParts,1.85,.17,.20,concrete,.43,.011,-.67);
  lmBox(staticParts,1.90,.065,.075,glass,.43,.112,-.545);
  lmBox(staticParts,1.96,.033,.28,roof,.43,.205,-.67);
  for(let i=0;i<19;i++)lmBox(staticParts,.006,.07,.005,dark,-.48+i*.10,.119,-.505);
  for(const x of [-.20,.28,.76,1.24]){
    lmBox(staticParts,.034,.025,.24,roof,x,.076,-.445);
    lmBox(staticParts,.026,.038,.19,glass,x,.042,-.435);
    lmBox(staticParts,.075,.006,.075,white,x,.038,-.34);
  }
  lmBox(staticParts,.63,.14,.22,concrete,-.95,.011,-.66);
  lmBox(staticParts,.67,.023,.27,roof,-.95,.164,-.66);
  for(let i=0;i<7;i++)lmBox(staticParts,.045,.054,.006,glass,-1.22+i*.09,.065,-.542);
  // Distinctive freestanding control tower behind the terminal.
  lmCyl(staticParts,.032,.042,.42,concrete,1.57,.012,-.79,10);
  lmCyl(staticParts,.102,.058,.07,glass,1.57,.432,-.79,10);
  lmCyl(staticParts,.108,.108,.020,roof,1.57,.505,-.79,10);
  lmCyl(staticParts,.007,.007,.09,dark,1.57,.525,-.79,8);
  for(const x of [-1.98,1.98])for(const z of [-.035,.635]){
    lmCyl(staticParts,.008,.008,.11,dark,x,.011,z,6);
    lmAdd(staticParts,new THREE.SphereGeometry(.018,8,6),light,x,.125,z);
  }
  // Cargo hangars and airside service buildings stay behind the passenger apron.
  for(const [x,w] of [[-1.77,.40],[2.03,.36]]){
    lmBox(staticParts,w,.11,.23,concrete,x,.012,-.60);
    lmBox(staticParts,w+.03,.014,.25,roof,x,.123,-.60);
    lmBox(staticParts,w*.65,.074,.004,glass,x,.030,-.475);
  }

  const root=mergeByMaterial(staticParts);
  root.name='高雄國際機場・09/27跑道';
  const makeAirliner=(accent)=>{
    const plane=new THREE.Group();
    const body=lmMaterial(0xf4f3ed,{metalness:.08,roughness:.43});
    const stripe=lmMaterial(accent,{roughness:.45});
    const window=lmMaterial(0x263b52,{metalness:.12,roughness:.26});
    const engine=lmMaterial(0x89949a,{metalness:.35,roughness:.5});
    // A tapered fuselage, swept wings, two engines and a vertical tail.
    const fuselage=new THREE.CylinderGeometry(.035,.035,.34,10);fuselage.rotateZ(Math.PI/2);
    lmAdd(plane,fuselage,body,0,0,0);
    lmAdd(plane,new THREE.ConeGeometry(.035,.08,10).rotateZ(-Math.PI/2),body,.21,0,0);
    lmAdd(plane,new THREE.ConeGeometry(.035,.07,10).rotateZ(Math.PI/2),body,-.205,0,0);
    const wing=new THREE.BufferGeometry();
    wing.setAttribute('position',new THREE.Float32BufferAttribute([
      -.08,0,0, .07,0,0, -.12,0,.30,
      -.08,0,0, -.12,0,-.30, .07,0,0
    ],3));wing.computeVertexNormals();
    plane.add(new THREE.Mesh(wing,new THREE.MeshStandardMaterial({color:0xe4e7e7,side:THREE.DoubleSide,roughness:.6})));
    lmBox(plane,.085,.006,.16,body,-.17,.003,0);
    const fin=new THREE.BufferGeometry();fin.setAttribute('position',new THREE.Float32BufferAttribute([-.21,0,0,-.13,0,0,-.195,.13,0],3));fin.computeVertexNormals();
    plane.add(new THREE.Mesh(fin,new THREE.MeshStandardMaterial({color:accent,side:THREE.DoubleSide,roughness:.5})));
    for(const z of [-.115,.115]){
      lmAdd(plane,new THREE.CylinderGeometry(.022,.022,.065,8).rotateZ(Math.PI/2),engine,-.015,-.023,z);
      lmBox(plane,.20,.009,.008,stripe,0,.017,z>0?.028:-.028);
    }
    for(let i=0;i<7;i++)for(const z of [-.034,.034])lmBox(plane,.010,.009,.004,window,-.105+i*.033,.012,z);
    lmBox(plane,.043,.010,.004,window,.135,.017,.033);
    lmBox(plane,.043,.010,.004,window,.135,.017,-.033);
    const merged=mergeByMaterial(plane);
    merged.userData.role='airport-aircraft';
    return merged;
  };
  for(const [x,accent] of [[-.65,0xd5573d],[.72,0x305e9d]]){
    const parked=makeAirliner(accent);
    parked.rotation.y=-Math.PI/2;
    parked.position.set(x,.08,-.33);
    parked.userData.operation='parked';root.add(parked);
  }
  const departure=makeAirliner(0xd5573d),arrival=makeAirliner(0x305e9d);
  departure.userData.operation='takeoff';arrival.userData.operation='landing';
  root.add(departure,arrival);
  root.userData.aircraft=[departure,arrival];
  root.userData.update=(elapsed)=>{
    // One aircraft uses the runway at a time: depart, clear it, then land.
    const phase=((elapsed%11)+11)%11;
    departure.visible=phase<4.5;
    arrival.visible=phase>=5&&phase<9.5;
    if(departure.visible){
      const progress=phase/4.5;
      departure.position.set(-1.75+4.1*progress,.085+.69*Math.pow(Math.max(0,(progress-.34)/.66),1.3),.30);
      departure.rotation.z=.18*Math.min(1,Math.max(0,(progress-.34)/.40));
    }
    if(arrival.visible){
      const progress=(phase-5)/4.5;
      arrival.position.set(-2.33+3.95*progress,.085+.69*Math.pow(Math.max(0,1-progress/.65),1.25),.30);
      arrival.rotation.z=-.12*Math.max(0,1-progress/.65);
    }
  };
  root.userData.update(0);
  return root;
}
