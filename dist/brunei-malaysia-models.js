import * as THREE from 'three';

// Silhouette-focused miniatures based on the cited tourism and heritage references.
// Keep repeated details in shared materials so mergeByMaterial can batch them.
export function addBruneiMalaysiaModels(h) {
  const {builders, lmAdd:add, lmBox:box, lmCyl:cyl, lmMaterial:mat, roughMass, mergeByMaterial:merge, TEXTURES}=h;
  const white=mat(0xe8e9df),ivory=mat(0xf5ecd8),shadow=mat(0x78818a),gold=mat(0xe9b83b,{metalness:.65,roughness:.25});
  const darkGold=mat(0x9f782a,{metalness:.45}),glass=mat(0x7094a0,{metalness:.55,roughness:.25}),silver=mat(0xc4d0d0,{metalness:.7,roughness:.27});
  const green=mat(0x327149),leaf=mat(0x58864c),darkLeaf=mat(0x245438),stone=mat(0x888e88,{map:TEXTURES.stone});
  const granite=mat(0x858f92,{roughness:1}),graniteLight=mat(0x9da6a8,{roughness:1});
  const water=mat(0x3d8e9b,{roughness:.26,metalness:.1}),sand=mat(0xe5d4a2),wood=mat(0x694b31,{map:TEXTURES.wood});
  const rose=mat(0xd390a1),pink=mat(0xe4adbc),pinkDark=mat(0xa56b7c),red=mat(0xb24435),redDark=mat(0x73382f),roof=mat(0x72564a);
  function finish(g,features){const root=merge(g);root.userData={...g.userData,referencePass:'brunei-malaysia-2026',features};return root;}
  function beam(g,a,b,r,m,segments=6){
    const p=new THREE.Vector3(...a),q=new THREE.Vector3(...b),d=q.clone().sub(p);
    const mesh=add(g,new THREE.CylinderGeometry(r,r,d.length(),segments),m,...p.add(q).multiplyScalar(.5).toArray());
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());
  }
  function dome(g,x,y,z,r,m){
    const mesh=add(g,new THREE.SphereGeometry(r,16,9,0,Math.PI*2,0,Math.PI/2),m,x,y,z);
    cyl(g,r*1.01,r*1.01,.025,darkGold,x,y-.025,z,16);
    return mesh;
  }
  function finial(g,x,y,z,m=gold){beam(g,[x,y,z],[x,y+.14,z],.012,m);add(g,new THREE.SphereGeometry(.025,7,5),m,x,y+.13,z);}
  function archRow(g,x0,count,step,z,y,w,h,wall,voidMat){
    for(let i=0;i<count;i++){
      const x=x0+i*step;
      box(g,w,.11,.018,voidMat,x,y,z);
      add(g,new THREE.TorusGeometry(w*.55,.014,5,10,Math.PI),wall,x,y+h*.71,z).rotation.z=Math.PI;
      box(g,.022,h*.73,.032,wall,x-w*.55,y,z);box(g,.022,h*.73,.032,wall,x+w*.55,y,z);
    }
  }
  function tree(g,x,z,s=1,seed=0){
    cyl(g,.018*s,.023*s,.18*s,wood,x,0,z,6);
    add(g,roughMass(.14*s,.17*s,.14*s,{seed:700+seed,jitter:.22,detail:1}),seed%3?green:leaf,x,.24*s,z);
  }
  function spire(g,x,y,z,m=gold){cyl(g,.035,.075,.12,m,x,y,z,12);add(g,new THREE.ConeGeometry(.055,.23,10),m,x,y+.23,z);finial(g,x,y+.36,z,m);}

  builders.nurulImanPalace=()=>{
    const g=new THREE.Group();
    box(g,3.20,.025,1.46,stone,0,-.03,0);
    box(g,2.72,.26,.80,ivory,0,.02,0);box(g,1.21,.44,.91,white,0,.26,0);
    for(const side of [-1,1]){
      box(g,.77,.32,.76,white,side*.98,.27,0);
      box(g,.74,.055,.78,gold,side*.98,.57,0);
      dome(g,side*.98,.64,0,.20,gold);finial(g,side*.98,.85,0);
      box(g,.43,.23,.69,ivory,side*1.37,.06,0);
    }
    box(g,1.25,.06,.96,darkGold,0,.70,0);box(g,.83,.21,.55,white,0,.76,0);
    dome(g,0,.98,0,.39,gold);finial(g,0,1.39,0);
    for(const z of [-.49,.49]){
      archRow(g,-1.34,11,.268,z,.28,.18,.20,ivory,shadow);
      for(let i=0;i<9;i++)box(g,.045,.21,.055,gold,-1.12+i*.28,.27,z);
    }
    for(const x of [-1.55,1.55]){
      box(g,.16,.58,.18,white,x,.02,-.38);dome(g,x,.61,-.38,.10,gold);
    }
    box(g,.68,.025,.38,stone,0,-.012,.75);
    for(let i=0;i<6;i++)tree(g,-1.45+i*.58,.88,.8,i);
    g.userData.goldDomes=true;
    return finish(g,'沿河展開的奶白色宮殿、拱廊、金色主穹頂與兩翼小穹頂');
  };

  builders.omarAliMosque=()=>{
    const g=new THREE.Group();
    box(g,2.9,.012,1.94,water,0,-.035,0);
    box(g,1.75,.045,1.25,white,-.18,-.015,-.05);
    box(g,1.27,.41,.79,white,-.18,.03,-.08);box(g,.73,.20,.57,ivory,-.18,.44,-.08);
    dome(g,-.18,.65,-.08,.38,gold);finial(g,-.18,1.04,-.08);
    for(const [x,z] of [[-.75,-.44],[.39,-.44],[-.75,.28],[.39,.28]]){
      box(g,.18,.38,.18,white,x,.06,z);dome(g,x,.46,z,.095,gold);finial(g,x,.55,z);
    }
    // Distinct tall marble minaret and its stacked observation balconies.
    const mx=.72,mz=-.43;box(g,.19,.82,.19,white,mx,.02,mz);
    for(const y of [.40,.70])box(g,.27,.025,.27,shadow,mx,y,mz);
    dome(g,mx,.85,mz,.105,gold);spire(g,mx,.94,mz);
    archRow(g,-.69,5,.25,.328,.11,.16,.18,white,shadow);
    // The ceremonial barge sits in the reflecting lagoon.
    box(g,.54,.025,.17,ivory,.45,-.010,.66);box(g,.45,.05,.09,gold,.45,.018,.66);
    for(const x of [.28,.45,.62])spire(g,x,.07,.66,gold);
    g.userData.lagoon=true;g.userData.royalBarge=true;
    return finish(g,'白色大理石立面、金色穹頂、高聳宣禮塔與潟湖中的皇家船');
  };

  builders.uluTemburong=()=>{
    const g=new THREE.Group();
    box(g,2.8,.07,1.8,darkLeaf,0,-.075,0);
    // Rainforest layers frame the elevated steel canopy walk and river.
    const river=new THREE.Shape();river.moveTo(-1.4,-.53);river.bezierCurveTo(-.75,-.25,-.65,.19,.10,.02);
    river.bezierCurveTo(.70,-.10,.82,.31,1.4,.43);river.lineTo(1.4,.72);
    river.bezierCurveTo(.68,.54,.55,.16,-.03,.31);river.bezierCurveTo(-.8,.52,-.94,.02,-1.4,-.21);river.closePath();
    add(g,new THREE.ShapeGeometry(river),water,0,-.033,0).rotation.x=-Math.PI/2;
    for(let i=0;i<36;i++){
      const x=-1.23+(i%9)*.31,z=-.72+Math.floor(i/9)*.49;
      if(Math.abs(z-.16*Math.sin(x*2))<.22)continue;
      tree(g,x,z,.75+(i*17%7)*.09,i);
    }
    for(const x of [-.74,.74]){
      for(const z of [-.43,.43])beam(g,[x,0,z],[x,.90,z],.018,silver);
      for(const y of [.20,.45,.68,.90]){
        beam(g,[x,y,-.43],[x,y,.43],.012,silver);
        beam(g,[x-.052,y,-.43],[x+.052,y+.20,.43],.008,shadow);
      }
      box(g,.14,.018,.91,silver,x,.90,0);
    }
    for(let i=0;i<12;i++){
      const x=-.73+i*.133;
      box(g,.137,.014,.15,silver,x,.75,.02);
      for(const side of [-1,1])beam(g,[x,.76,side*.10],[x,.86,side*.10],.005,shadow);
    }
    for(const side of [-1,1])beam(g,[-.75,.86,side*.10],[.75,.86,side*.10],.008,silver);
    g.userData.canopyWalk=true;
    return finish(g,'熱帶雨林、蜿蜒河流與架在樹冠上的鋼構觀景步道');
  };

  builders.petronasTowers=()=>{
    const g=new THREE.Group();
    box(g,2.35,.09,1.20,stone,0,-.06,0);
    box(g,1.34,.24,.74,glass,0,.03,0);
    for(const x of [-.54,.54]){
      cyl(g,.24,.29,.18,silver,x,.25,0,12);
      for(let floor=0;floor<10;floor++){
        const y=.40+floor*.146,r=.225-floor*.009;
        cyl(g,r,r+.005,.126,glass,x,y,0,16);
        cyl(g,r+.020,r+.020,.017,silver,x,y+.126,0,16);
        // The repeated stainless-steel triangular facets give the star plan its glint.
        for(let j=0;j<8;j++){
          const a=j*Math.PI/4;
          beam(g,[x+Math.cos(a)*r,y+.01,Math.sin(a)*r],[x+Math.cos(a)*r,y+.115,Math.sin(a)*r],.006,silver,5);
        }
      }
      cyl(g,.13,.16,.18,silver,x,1.86,0,12);
      cyl(g,.075,.12,.19,glass,x,2.04,0,12);
      spire(g,x,2.23,0,silver);
    }
    // The real double-deck bridge joins floors 41 and 42; triangular legs support it.
    box(g,.81,.14,.21,silver,0,1.09,0);
    box(g,.76,.085,.17,glass,0,1.12,0);
    box(g,.83,.018,.24,silver,0,1.24,0);
    for(const x of [-.43,.43])beam(g,[x,.77,0],[x*.63,1.10,0],.026,silver);
    g.userData.doubleSkybridge=true;
    return finish(g,'兩座層層收分的銀色雙塔、41–42 樓雙層空中橋與雙尖塔');
  };

  builders.langkawiSkyBridge=()=>{
    const g=new THREE.Group();
    for(const [x,z,h,s] of [[-1.20,.25,.85,1],[.65,-.15,.84,1.2],[1.20,.41,.92,.9]]){
      add(g,roughMass(.60*s,.23*s,.49*s,{seed:1470+Math.round(x*100),jitter:.24,detail:2}),darkLeaf,x,.05,z);
      add(g,roughMass(.42*s,.25*s,.37*s,{seed:1500+Math.round(x*100),jitter:.24,detail:2}),leaf,x,.24,z);
    }
    const points=[];
    for(let i=0;i<=20;i++){
      const t=i/20,x=-1.18+2.36*t,z=.29*Math.sin(t*Math.PI);
      points.push([x,.68+.07*Math.sin(t*Math.PI),z]);
    }
    for(let i=0;i<20;i++){
      const a=points[i],b=points[i+1];
      beam(g,a,b,.055,silver);
      for(const side of [-1,1]){
        beam(g,[a[0],a[1]+.025,a[2]+side*.11],[b[0],b[1]+.025,b[2]+side*.11],.008,glass);
        if(i%2===0)beam(g,[a[0],a[1]+.025,a[2]+side*.11],[a[0],a[1]+.13,a[2]+side*.11],.006,silver);
      }
    }
    const mast=[.07,1.53,-.36];beam(g,[.07,.16,-.36],mast,.025,silver);
    for(let i=2;i<19;i+=3)beam(g,mast,[...points[i]],.006,silver);
    g.userData.curvedCableBridge=true;
    return finish(g,'馬西岡山林上空的彎曲行人橋、單桅懸索與深谷');
  };

  builders.kinabaluPark=()=>{
    const g=new THREE.Group();
    box(g,2.65,.05,1.9,darkLeaf,0,-.05,0);
    for(let i=0;i<20;i++){
      const x=-1.2+(i%7)*.38,z=-.8+Math.floor(i/7)*.49;
      add(g,roughMass(.15,.16,.15,{seed:1640+i,jitter:.21,detail:1}),i%3?green:leaf,x,.13,z);
    }
    const peaks=[[-.83,-.08,.91,.55,1700],[-.22,.08,1.34,.62,1701],[.39,-.04,1.72,.70,1702],[.98,.10,1.03,.45,1703]];
    for(const [x,z,h,w,seed] of peaks){
      // Kinabalu's summit is exposed granite with a broken ridge, not a snow cap.
      const geo=new THREE.CylinderGeometry(.10,w,h,9,5);const p=geo.attributes.position;
      for(let i=0;i<p.count;i++){
        const y=p.getY(i),a=Math.atan2(p.getZ(i),p.getX(i));
        p.setXYZ(i,p.getX(i)*(1+.17*Math.sin(a*7+y*13+seed)),y+(y>h*.45?.085*Math.sin(a*3+seed):0),p.getZ(i)*(1+.12*Math.cos(a*9+y*7)));
      }
      geo.computeVertexNormals();add(g,geo,seed%2?granite:graniteLight,x,h/2-.05,z);
    }
    g.userData.graniteSummit=true;
    return finish(g,'沙巴神山鋸齒狀花崗岩峰、山麓常綠雨林與多層山脊');
  };

  builders.tanjungAruBeach=()=>{
    const g=new THREE.Group();
    box(g,2.8,.012,1.75,water,0,-.035,0);
    const shore=new THREE.Shape();shore.moveTo(-1.4,-.15);shore.bezierCurveTo(-.55,.05,.65,-.02,1.4,.27);
    shore.lineTo(1.4,.9);shore.lineTo(-1.4,.9);shore.closePath();
    add(g,new THREE.ShapeGeometry(shore),sand,0,-.016,0).rotation.x=-Math.PI/2;
    for(let i=0;i<12;i++){
      const x=-1.25+i*.23,z=-.21+.09*Math.sin(i*.39);
      box(g,.17,.003,.009,white,x,-.008,z,.18);
    }
    // Aru are casuarina trees: fine drooping whorls, not broad palm fronds.
    for(let i=0;i<7;i++){
      const x=-1.20+i*.40,z=.45+(i%2)*.17,h=.32+(i%3)*.07;
      beam(g,[x,-.012,z],[x+.025,h,z],.011,wood);
      for(let tier=0;tier<3;tier++)for(let j=0;j<7;j++){
        const a=j*Math.PI*2/7+tier*.17,yy=h-.035-tier*.065,spread=.07+tier*.047;
        beam(g,[x+.025,yy,z],[x+.025+Math.cos(a)*spread,yy-.07,z+Math.sin(a)*spread],.005,j%2?darkLeaf:green,4);
      }
    }
    box(g,.22,.02,.16,redDark,.82,-.01,.57);box(g,.16,.04,.10,roof,.82,.02,.57);
    g.userData.westFacingBeach=true;
    return finish(g,'面向西方的寬闊沙灘、淺海浪緣及沿岸的亞魯木樹');
  };

  builders.stadthuys=()=>{
    const g=new THREE.Group();
    box(g,2.8,.04,1.55,stone,0,-.05,0);
    box(g,2.15,.61,.65,red,-.19,0,-.18);
    box(g,.74,.47,.65,red,.94,0,-.18);
    for(const [x,w] of [[-.19,2.18],[.94,.77]]){
      box(g,w,.025,.71,ivory,x,.61,-.18);
      const a=add(g,new THREE.ConeGeometry(w*.54,.23,4),redDark,x,.75,-.18);a.rotation.y=Math.PI/4;
    }
    for(let i=0;i<8;i++){
      const x=-1.10+i*.27;
      for(const y of [.14,.42]){
        box(g,.12,.14,.012,ivory,x,y,.154);box(g,.085,.11,.014,shadow,x,y+.016,.164);
        box(g,.008,.12,.016,ivory,x,y+.01,.177);
      }
    }
    box(g,.20,.29,.016,redDark,.95,.02,.165);box(g,.24,.014,.02,ivory,.95,.31,.169);
    // Dutch Square's adjacent clock tower acts as a recognizable companion.
    box(g,.20,.72,.20,red,1.17,0,.35);box(g,.24,.025,.24,ivory,1.17,.71,.35);
    add(g,new THREE.ConeGeometry(.18,.22,4),redDark,1.17,.85,.35).rotation.y=Math.PI/4;
    for(const z of [.455,.245]){
      add(g,new THREE.CircleGeometry(.065,16),ivory,1.17,.59,z).material.side=THREE.DoubleSide;
    }
    g.userData.dutchSquare=true;
    return finish(g,'磚紅色荷蘭殖民行政樓、白色窗框與馬六甲荷蘭廣場鐘樓');
  };

  builders.putraMosque=()=>{
    const g=new THREE.Group();
    box(g,2.85,.012,1.95,water,0,-.035,0);
    box(g,2.06,.045,1.32,rose,-.24,-.014,-.03);
    box(g,1.30,.40,.88,pink,-.31,.03,-.04);
    box(g,.86,.22,.64,pinkDark,-.31,.43,-.04);
    dome(g,-.31,.66,-.04,.44,rose);finial(g,-.31,1.11,-.04,pinkDark);
    for(const [x,z] of [[-.84,-.42],[.22,-.42],[-.84,.34],[.22,.34]]){
      box(g,.18,.25,.18,pink,x,.08,z);dome(g,x,.34,z,.10,rose);
    }
    archRow(g,-.83,5,.26,.42,.11,.16,.18,pinkDark,shadow);
    // Five-section minaret: slender shaft, five balconied rings and pointed cap.
    const mx=.80,mz=-.40;box(g,.13,1.34,.13,pink,mx,.02,mz);
    for(const y of [.25,.48,.72,.96,1.19])cyl(g,.115,.115,.024,pinkDark,mx,y,mz,10);
    dome(g,mx,1.37,mz,.095,rose);spire(g,mx,1.43,mz,pinkDark);
    box(g,.26,.025,.72,rose,-.30,-.01,.70);
    g.userData.lakesidePinkGranite=true;
    return finish(g,'面向布城湖的玫瑰色花崗岩立面、粉紅穹頂與五段式宣禮塔');
  };
}
