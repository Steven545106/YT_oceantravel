// Compact unarmed VTOL sightseeing jet, facing -Z like the existing vessels.
import * as THREE from 'three';

export const FIGHTER_PAINTS={
  slate:{body:0x667783,wing:0x334651,trim:0xffa02e,tail:0xd45b28},
  navy:{body:0x1765bd,wing:0x0b4391,trim:0xffd449,tail:0xf4bd2b},
  silver:{body:0xf0f1eb,wing:0xc9d3da,trim:0xe93b4e,tail:0xb72e3f}
};

export function buildFighter(){
  const jet=new THREE.Group();jet.name='觀光戰鬥機';
  const body=new THREE.MeshStandardMaterial({color:FIGHTER_PAINTS.slate.body,roughness:.52,metalness:.38,flatShading:false});
  const wing=new THREE.MeshStandardMaterial({color:FIGHTER_PAINTS.slate.wing,roughness:.58,metalness:.28,side:THREE.DoubleSide});
  const trim=new THREE.MeshStandardMaterial({color:FIGHTER_PAINTS.slate.trim,roughness:.43,metalness:.32});
  const tail=new THREE.MeshStandardMaterial({color:FIGHTER_PAINTS.slate.tail,roughness:.62,metalness:.25,side:THREE.DoubleSide});
  const glass=new THREE.MeshPhysicalMaterial({color:0x132d3d,roughness:.11,metalness:.28,transparent:true,opacity:.89,clearcoat:1});
  const dark=new THREE.MeshStandardMaterial({color:0x16232b,roughness:.7,metalness:.35});
  const engine=new THREE.MeshStandardMaterial({color:0x18232a,roughness:.52,metalness:.64,emissive:0xff6930,emissiveIntensity:.08});
  const add=(geometry,material,x=0,y=0,z=0)=>{const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);jet.add(mesh);return mesh;};
  // Slim tapered fuselage and sharp radome.
  add(new THREE.CylinderGeometry(.47,.67,5.45,16,1),body,0,.12,.05).rotation.x=-Math.PI/2;
  add(new THREE.ConeGeometry(.46,2.65,16),body,0,.12,-3.95).rotation.x=-Math.PI/2;
  add(new THREE.CylinderGeometry(.62,.45,1.25,16),tail,0,.10,3.12).rotation.x=-Math.PI/2;
  add(new THREE.ConeGeometry(.115,.42,10),trim,0,.14,-5.38).rotation.x=-Math.PI/2;
  // Swept wings are shallow closed extrusions, with stronger root and thin tips.
  const panel=(points,depth,material,y)=>{
    const shape=new THREE.Shape();shape.moveTo(points[0][0],points[0][1]);
    for(let i=1;i<points.length;i++)shape.lineTo(points[i][0],points[i][1]);shape.closePath();
    const mesh=add(new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:2}),material,0,y+depth/2,0);
    mesh.rotation.x=Math.PI/2;return mesh;
  };
  for(const side of [-1,1]){
    const mirror=points=>points.map(([x,z])=>[side*x,z]);
    panel(mirror([[.38,-1.25],[1.05,-.95],[3.8,1.15],[3.6,1.5],[.65,1.03]]),.13,wing,-.01);
    panel(mirror([[.44,2.32],[2.06,2.68],[2.08,3.1],[.52,2.95]]),.095,wing,.02);
    // Two canted vertical stabilizers, side intakes and navigation lamps.
    const fin=add(new THREE.BoxGeometry(.13,1.45,.9),tail,side*.62,.89,2.45);fin.rotation.z=-side*.24;fin.rotation.x=.18;
    const intake=add(new THREE.BoxGeometry(.72,.4,1.3),dark,side*.72,-.08,-.05);intake.rotation.y=side*.08;
    add(new THREE.SphereGeometry(.09,8,6),new THREE.MeshBasicMaterial({color:side<0?0xe04a48:0x57d99b}),side*3.68,.06,1.3);
  }
  // One-piece smoky canopy over the forward cockpit, with a narrow silver frame.
  const canopy=add(new THREE.SphereGeometry(1,24,12),glass,0,.58,-1.12);canopy.scale.set(.49,.43,1.32);
  const sill=add(new THREE.BoxGeometry(1.06,.09,2.46),trim,0,.27,-1.06);sill.material=tail;
  const rail=add(new THREE.BoxGeometry(.035,.37,1.95),trim,0,.56,-1.1);rail.rotation.x=.05;
  const flameMaterial=core=>new THREE.ShaderMaterial({
    uniforms:{uTime:{value:0},uStrength:{value:0}},
    vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`varying vec2 vUv;uniform float uTime;uniform float uStrength;
      void main(){float t=vUv.y;float pulse=.88+.12*sin(uTime*31.0+t*25.0);
      float envelope=smoothstep(0.0,.06,t)*pow(1.0-t,${core?'0.48':'0.82'});
      vec3 hot=vec3(1.0,.94,.60);vec3 amber=vec3(1.0,.35,.025);vec3 red=vec3(.8,.08,.01);
      vec3 color=mix(mix(hot,amber,smoothstep(.06,.58,t)),red,smoothstep(.55,1.0,t));
      gl_FragColor=vec4(color,envelope*pulse*uStrength*${core?'.88':'.34'});
    }`,
    transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false
  });
  const outerFlame=flameMaterial(false),innerFlame=flameMaterial(true);
  const flames=[];
  for(const side of [-1,1]){
    const nozzle=add(new THREE.CylinderGeometry(.34,.39,.42,16),dark,side*.32,.01,3.53);nozzle.rotation.x=Math.PI/2;
    const glow=add(new THREE.CircleGeometry(.28,16),engine,side*.32,.01,3.77);glow.rotation.y=Math.PI;
    const outer=add(new THREE.ConeGeometry(.28,1,12,1,true),outerFlame,side*.32,.01,4.12);outer.rotation.x=Math.PI/2;
    const inner=add(new THREE.ConeGeometry(.14,1,10,1,true),innerFlame,side*.32,.01,4.02);inner.rotation.x=Math.PI/2;
    flames.push({outer,inner});
  }
  // One reusable point cloud gives both nozzles moving sparks without a mesh per particle.
  const sparkCount=72,positions=new Float32Array(sparkCount*6),colors=new Float32Array(sparkCount*6);
  const sparkGeometry=new THREE.BufferGeometry();
  sparkGeometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
  sparkGeometry.setAttribute('color',new THREE.BufferAttribute(colors,3).setUsage(THREE.DynamicDrawUsage));
  const sparks=new THREE.LineSegments(sparkGeometry,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));
  sparks.name='雙發噴射火花';sparks.frustumCulled=false;sparks.visible=false;jet.add(sparks);
  const particles=Array.from({length:sparkCount},()=>({life:0,duration:1,vx:0,vy:0,vz:0}));
  let nextParticle=0,emission=0,flameTime=0;
  // Folded landing wheels remain available for visible ground contact.
  const gear=new THREE.Group();jet.add(gear);
  for(const [x,z] of [[0,-3.1],[-1.08,1.5],[1.08,1.5]]){
    const strut=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,.72,8),trim);strut.position.set(x,-.45,z);gear.add(strut);
    const wheel=new THREE.Mesh(new THREE.TorusGeometry(.18,.07,8,12),dark);wheel.position.set(x,-.82,z);wheel.rotation.y=Math.PI/2;gear.add(wheel);
  }
  jet.userData.gear=gear;
  jet.userData.paint=name=>{
    const paint=FIGHTER_PAINTS[name]??FIGHTER_PAINTS.slate;
    body.color.setHex(paint.body);wing.color.setHex(paint.wing);trim.color.setHex(paint.trim);tail.color.setHex(paint.tail);
    body.emissive.copy(body.color).lerp(new THREE.Color(0xa8dfff),.48);
    wing.emissive.copy(wing.color).lerp(new THREE.Color(0x75bfff),.56);
    tail.emissive.copy(tail.color).lerp(new THREE.Color(0xffb47c),.34);
    trim.emissive.copy(trim.color);
  };
  jet.userData.setNight=night=>{
    body.emissiveIntensity=night?1.1:0;
    wing.emissiveIntensity=night?.9:0;
    tail.emissiveIntensity=night?.8:0;
    trim.emissiveIntensity=night?.23:0;
    engine.emissiveIntensity=night?.15:.04;
  };
  jet.userData.setPropulsion=({cruise=0,boost=0,kick=0,active=false,delta=0}={})=>{
    const strength=active?Math.min(1,.09+.49*cruise+.35*boost+.22*kick):0;
    flameTime+=Math.min(Math.max(delta,0),.1);
    outerFlame.uniforms.uTime.value=innerFlame.uniforms.uTime.value=flameTime;
    outerFlame.uniforms.uStrength.value=innerFlame.uniforms.uStrength.value=active?.4+.75*strength:0;
    for(let i=0;i<flames.length;i++){
      const {outer,inner}=flames[i],flicker=1+.13*Math.sin(flameTime*41+i*2.7)+.08*Math.sin(flameTime*67+i);
      outer.visible=inner.visible=strength>.1;
      const outerLength=(.5+5.5*strength+2.5*boost)*flicker;
      const innerLength=(.4+4.5*strength+1.7*boost)*flicker;
      outer.scale.y=outerLength;outer.position.z=3.79+outerLength/2;
      inner.scale.y=innerLength;inner.position.z=3.8+innerLength/2;
    }
    const step=Math.min(Math.max(delta,0),.1);
    emission=Math.min(sparkCount,emission+step*(active?(20*cruise+80*boost+55*kick):0));
    while(emission>=1){
      emission--;
      const i=nextParticle++%sparkCount,p=particles[i],side=nextParticle%2?-1:1;
      p.life=p.duration=.43+Math.random()*.3+.14*boost;
      p.vx=(Math.random()-.5)*(.36+.4*boost);
      p.vy=(Math.random()-.5)*(.32+.35*boost);
      p.vz=7+Math.random()*5+3*boost;
      const j=i*6;
      positions[j]=side*.32+(Math.random()-.5)*.18;
      positions[j+1]=.01+(Math.random()-.5)*.12;
      positions[j+2]=3.82;
      positions[j+3]=positions[j];positions[j+4]=positions[j+1];positions[j+5]=positions[j+2]+.25;
    }
    let alive=0;
    for(let i=0;i<sparkCount;i++){
      const p=particles[i];if(p.life<=0)continue;
      p.life=Math.max(0,p.life-step);
      const j=i*6,fade=p.life/p.duration;
      positions[j]+=p.vx*step;positions[j+1]+=p.vy*step;positions[j+2]+=p.vz*step;
      positions[j+3]=positions[j]+p.vx*.035;
      positions[j+4]=positions[j+1]+p.vy*.035;
      positions[j+5]=positions[j+2]+.25+.2*boost;
      colors[j]=fade;
      colors[j+1]=fade*(.48+.47*fade);
      colors[j+2]=fade*(.045+.16*boost*fade);
      colors[j+3]=fade*.4;
      colors[j+4]=fade*.12;
      colors[j+5]=0;
      if(p.life>0)alive++;
    }
    sparks.visible=alive>0;
    sparkGeometry.attributes.position.needsUpdate=true;
    sparkGeometry.attributes.color.needsUpdate=true;
  };
  jet.userData.setPropulsion();
  jet.userData.paint('slate');
  return jet;
}
