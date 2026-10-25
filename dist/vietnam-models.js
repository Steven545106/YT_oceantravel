import * as THREE from 'three';

// Five compact Vietnam dioramas. The full coast and terrain remain the source of
// truth; these meshes emphasize each destination's recognisable real-world forms.
export function addVietnamModels(h) {
  const {builders, lmAdd:add, lmBox:box, lmCyl:cyl, lmMaterial:mat,
    roughMass, mergeByMaterial:merge, TEXTURES} = h;
  const limestone=mat(0x969c89,{roughness:1}),cliff=mat(0x6c786d,{roughness:1});
  const canopy=mat(0x345d3b),brightLeaf=mat(0x4b7b45),water=mat(0x348e9b,{roughness:.3,metalness:.12});
  const deepWater=mat(0x247b92,{roughness:.28}),foam=mat(0xc4eee4),sand=mat(0xe9d8a9);
  const gold=mat(0xdab54b,{metalness:.55,roughness:.35}),stone=mat(0xa5a092,{map:TEXTURES.stone});
  const warmStone=mat(0xc1b9a8,{map:TEXTURES.stone}),red=mat(0xb43729),darkRed=mat(0x713428);
  const roof=mat(0x545a4c,{map:TEXTURES.tiles}),cream=mat(0xf0e2b9),wood=mat(0x715039,{map:TEXTURES.wood});
  function beam(g,a,b,r,m){
    const p=new THREE.Vector3(...a),q=new THREE.Vector3(...b),d=q.clone().sub(p);
    const mesh=add(g,new THREE.CylinderGeometry(r,r,d.length(),7),m,...p.add(q).multiplyScalar(.5).toArray());
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());
  }
  function karst(g,x,z,h,s=1,seed=0){
    const geo=new THREE.CylinderGeometry(.21*s,.29*s,h,11,6);
    const p=geo.attributes.position;
    for(let i=0;i<p.count;i++){
      const y=p.getY(i),phase=Math.atan2(p.getZ(i),p.getX(i));
      const level=(y+h/2)/h;
      const k=(1.15-.48*level)*(1+.20*Math.sin(phase*5+seed+level*2)+.12*Math.cos(y*13+phase*3+seed));
      p.setXYZ(i,p.getX(i)*k+level*level*.07*s,y,p.getZ(i)*k-level*.035*s);
    }
    geo.computeVertexNormals();add(g,geo,seed%2?cliff:limestone,x,h*.48,z);
    add(g,roughMass(.16*s,.085*s,.15*s,{seed:500+seed,jitter:.24,detail:1}),seed%2?canopy:brightLeaf,x+.04*s,h*.94,z);
    for(let j=0;j<3;j++){
      const a=(seed*.9+j*2.08),yy=h*(.46+j*.15);
      add(g,roughMass(.09*s,.06*s,.065*s,{seed:560+seed*5+j,jitter:.22,detail:1}),j===1?canopy:brightLeaf,x+Math.cos(a)*(.15-j*.015)*s,yy,z+Math.sin(a)*(.15-j*.015)*s);
    }
  }
  function sampan(g,x,y,z,yaw=0){
    const hull=add(g,new THREE.SphereGeometry(.19,10,6),wood,x,y,z,yaw);hull.scale.set(1,.20,.35);
    box(g,.22,.009,.08,cream,x,y+.023,z,yaw);
    beam(g,[x-.02,y+.02,z],[x+.11,y+.055,z+.13],.004,wood);
  }
  function finish(g,features){const root=merge(g);root.userData={...g.userData,referencePass:'vietnam-2026',features};return root;}

  builders.haLongBay=()=>{
    const g=new THREE.Group();
    box(g,3.35,.012,2.15,deepWater,0,-.024,0);
    const islands=[[-1.20,-.50,.76,.85,1],[-.73,.36,1.08,1.12,2],[-.16,-.56,.62,.68,3],[.45,.36,1.20,.98,4],[1.15,-.43,.88,.86,5],[1.44,.46,.50,.55,6]];
    for(const [x,z,height,size,seed] of islands){
      add(g,roughMass(.31*size,.11,.26*size,{seed:400+seed,jitter:.16,detail:1}),limestone,x,.025,z);
      karst(g,x,z,height,size,seed);
      for(let i=0;i<2;i++)add(g,roughMass(.11*size,.10*size,.11*size,{seed:440+seed*3+i,jitter:.15,detail:1}),canopy,x+(i?-.12:.13)*size,height*.72,z+.05*i);
    }
    // A two-sail sightseeing junk gives the bay a human-scale landmark.
    box(g,.43,.025,.14,darkRed,.03,.022,.20);
    beam(g,[.02,.04,.20],[.02,.46,.20],.009,wood);
    for(const [x,y,w,h] of [[-.11,.09,.13,.30],[.12,.13,.12,.22]]){
      const sail=new THREE.Shape();sail.moveTo(0,0);sail.lineTo(w,0);sail.lineTo(0,h);sail.closePath();
      const mesh=add(g,new THREE.ShapeGeometry(sail),cream,x,y,.20);mesh.material.side=THREE.DoubleSide;
    }
    g.userData.marineKarst=true;
    return finish(g,'海中陡立的灰白石灰岩峰、綠色植被與觀光帆船');
  };

  builders.goldenBridge=()=>{
    const g=new THREE.Group();
    add(g,roughMass(1.43,.30,.83,{seed:710,jitter:.13,detail:2}),canopy,0,-.25,0);
    const points=[];
    for(let i=0;i<=14;i++){
      const x=-1.15+i*2.30/14;
      points.push([x,.81+.17*(1-(x/1.15)**2),.12*Math.sin(i/14*Math.PI)]);
    }
    for(let i=0;i<14;i++){
      const a=points[i],b=points[i+1],centre=[(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2];
      beam(g,a,b,.09,warmStone);
      beam(g,[a[0],a[1]+.055,a[2]-.14],[b[0],b[1]+.055,b[2]-.14],.014,gold);
      beam(g,[a[0],a[1]+.055,a[2]+.14],[b[0],b[1]+.055,b[2]+.14],.014,gold);
      if(i%2===0)for(const side of [-1,1])beam(g,[centre[0],centre[1]+.05,centre[2]+side*.14],[centre[0],centre[1]+.15,centre[2]+side*.14],.008,gold);
    }
    // Two weathered hands rise from the greenery and carry the curved deck.
    for(const [x,z,tilt] of [[-.38,.06,-1],[.47,-.04,1]]){
      const palm=add(g,new THREE.SphereGeometry(.30,13,10),stone,x,.52,z);palm.scale.set(1.12,.65,.80);
      beam(g,[x+tilt*.08,.17,z],[x,.53,z],.12,stone);
      for(let finger=0;finger<4;finger++){
        const fx=x-.19+finger*.13;
        beam(g,[fx,.54,z-.12],[fx+tilt*.035,.86,z-.10],.048,stone);
        add(g,new THREE.SphereGeometry(.053,7,5),stone,fx+tilt*.035,.86,z-.10);
      }
      beam(g,[x+tilt*.27,.42,z+.08],[x+tilt*.19,.76,z+.20],.06,stone);
    }
    g.userData.twoHands=true;
    return finish(g,'巴拿山綠坡上彎曲的金色步道，由兩隻巨大的風化石手托起');
  };

  builders.hoanKiemLake=()=>{
    const g=new THREE.Group();
    const shore=add(g,new THREE.CircleGeometry(1.20,40),stone,0,-.012,0);shore.rotation.x=-Math.PI/2;shore.scale.y=.72;
    const pool=add(g,new THREE.CircleGeometry(1.10,40),water,0,.001,0);pool.rotation.x=-Math.PI/2;pool.scale.y=.64;
    // The Turtle Tower sits alone on its small island near the lake centre.
    const islet=add(g,new THREE.CylinderGeometry(.16,.21,.025,12),brightLeaf,.12,.003,.09);islet.scale.z=.73;
    box(g,.17,.10,.13,warmStone,.12,.03,.09);
    box(g,.145,.105,.11,cream,.12,.13,.09);
    for(const xx of [.065,.12,.175])box(g,.023,.049,.007,darkRed,xx,.16,.147);
    box(g,.12,.06,.09,warmStone,.12,.235,.09);
    add(g,new THREE.ConeGeometry(.105,.067,4),roof,.12,.328,.09).rotation.y=Math.PI/4;
    // Northern Ngoc Son island and the scarlet The Huc bridge.
    const island=add(g,new THREE.CylinderGeometry(.27,.30,.035,14),brightLeaf,.38,.005,-.40);island.scale.z=.68;
    box(g,.27,.13,.17,cream,.37,.035,-.40);
    add(g,new THREE.ConeGeometry(.23,.13,4),roof,.37,.23,-.40).rotation.y=Math.PI/4;
    for(let i=0;i<9;i++){
      const x=.47+i*.060,z=-.43+i*.010,y=.075+.07*Math.sin(i/8*Math.PI);
      box(g,.071,.018,.085,red,x,y,z,.15);
      if(i%2===0)for(const side of [-1,1])beam(g,[x,y+.01,z+side*.040],[x,y+.105,z+side*.040],.007,red);
    }
    for(const [x,z] of [[-.92,-.07],[-.77,.38],[.85,.27],[.06,-.70]]){
      cyl(g,.013,.018,.13,wood,x,0,z,6);
      add(g,roughMass(.105,.11,.10,{seed:831+Math.round(x*100),jitter:.15,detail:1}),canopy,x,.15,z);
    }
    g.userData.turtleTower=true;g.userData.redBridge=true;
    return finish(g,'湖心龜塔、北岸玉山祠與鮮紅的棲旭橋，圍繞橢圓形湖面');
  };

  builders.phuQuocIsland=()=>{
    const g=new THREE.Group();
    box(g,2.70,.01,1.70,deepWater,0,-.025,0);
    // West-facing Long Beach: a pale sandy crescent backed by palms and modest resorts.
    const shape=new THREE.Shape();shape.moveTo(-.22,-.80);shape.bezierCurveTo(-.45,-.4,-.48,.35,-.18,.82);
    shape.lineTo(1.35,.82);shape.lineTo(1.35,-.80);shape.closePath();
    const beach=add(g,new THREE.ShapeGeometry(shape),sand,.02,.005,0);beach.rotation.x=-Math.PI/2;
    for(const [x,z,s] of [[.98,-.65,.34],[1.09,.10,.39],[.91,.65,.27]])
      add(g,roughMass(s,.08,s*.55,{seed:902+Math.round(z*100),jitter:.15,detail:1}),canopy,x,.012,z);
    for(let i=0;i<14;i++){
      const z=-.7+i*.108,x=-.35-.06*Math.sin(i*.45);
      box(g,.13,.003,.012,foam,x,.009,z,-.18);
    }
    for(const [x,z,h] of [[.14,-.55,.35],[.38,.11,.40],[.80,-.32,.31],[.98,.56,.36]]){
      beam(g,[x,0,z],[x-.05,h,z+.025],.019,wood);
      for(let i=0;i<6;i++){
        const a=i*Math.PI/3;
        beam(g,[x-.05,h,z+.025],[x-.05+Math.cos(a)*.16,h-.075,z+.025+Math.sin(a)*.15],.012,brightLeaf);
      }
    }
    for(const [x,z] of [[.57,-.59],[.77,.02]]){
      box(g,.25,.17,.18,cream,x,.012,z);
      add(g,new THREE.ConeGeometry(.22,.14,4),roof,x,.25,z).rotation.y=Math.PI/4;
    }
    sampan(g,-.82,.025,.27,.4);
    g.userData.westBeach=true;
    return finish(g,'富國島西岸弧形沙灘、淺海浪緣、椰林、低層度假屋與小船');
  };

  builders.trangAn=()=>{
    const g=new THREE.Group();
    box(g,2.60,.018,1.82,brightLeaf,0,-.026,0);
    const channel=new THREE.Shape();channel.moveTo(-1.30,-.30);channel.bezierCurveTo(-.62,-.60,-.36,.22,.34,.12);
    channel.bezierCurveTo(.72,.06,1.05,.36,1.30,.05);channel.lineTo(1.30,.57);
    channel.bezierCurveTo(.80,.72,.57,.37,.22,.46);channel.bezierCurveTo(-.38,.48,-.68,-.20,-1.30,.07);channel.closePath();
    const stream=add(g,new THREE.ShapeGeometry(channel),water,0,.002,0);stream.rotation.x=-Math.PI/2;
    for(const [x,z,h,size,seed] of [[-1.03,.55,.78,.83,31],[-.46,-.57,.91,.70,32],[.46,-.64,1.06,.89,33],[1.02,.59,.81,.70,34]])karst(g,x,z,h,size,seed);
    // A foot cave with a true clear opening for the boat route.
    const archShape=new THREE.Shape();archShape.moveTo(-.30,0);archShape.lineTo(-.30,.38);
    archShape.quadraticCurveTo(0,.71,.30,.38);archShape.lineTo(.30,0);archShape.lineTo(.20,0);
    archShape.lineTo(.20,.28);archShape.quadraticCurveTo(0,.53,-.20,.28);archShape.lineTo(-.20,0);archShape.closePath();
    add(g,new THREE.ExtrudeGeometry(archShape,{depth:.27,bevelEnabled:false,curveSegments:8}).translate(0,0,-.135),limestone,.07,.018,-.16);
    add(g,roughMass(.32,.095,.23,{seed:841,jitter:.12,detail:1}),canopy,.07,.58,-.16);
    sampan(g,-.77,.028,-.04,-.3);sampan(g,.77,.028,.33,.4);
    g.userData.cavePassage=true;
    return finish(g,'綠色石灰岩塔峰、彎曲水道、可穿行的岩洞與兩艘傳統小船');
  };
}
