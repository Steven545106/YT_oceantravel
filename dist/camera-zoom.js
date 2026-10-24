import * as THREE from 'three';

export function createObservationCamera(camera){
  const view={active:false,magnification:2,yaw:0,pitch:0};
  const position=new THREE.Vector3(),direction=new THREE.Vector3(),target=new THREE.Vector3();
  function setMagnification(value){if(Number.isFinite(value))view.magnification=THREE.MathUtils.clamp(value,1,8);return view.magnification;}
  function close(){view.active=false;camera.zoom=1;camera.updateProjectionMatrix();}
  return {
    view,setMagnification,close,
    open(){view.active=true;view.yaw=0;view.pitch=0;},
    reset(){view.yaw=0;view.pitch=0;setMagnification(1);},
    drag(dx,dy){view.yaw=THREE.MathUtils.euclideanModulo(view.yaw-dx*.003/view.magnification+Math.PI,Math.PI*2)-Math.PI;view.pitch=THREE.MathUtils.clamp(view.pitch-dy*.003/view.magnification,-.5,1.2);},
    update(delta,anchor,heading){
      if(!view.active)return false;
      // Observe from ahead of the bow, so magnifying a distant sight does not fill the image with the ship.
      position.set(0,.6,-.9).applyAxisAngle(THREE.Object3D.DEFAULT_UP,heading).add(anchor);
      camera.position.lerp(position,1-Math.exp(-12*delta));
      const yaw=heading+view.yaw,cos=Math.cos(view.pitch);
      direction.set(-Math.sin(yaw)*cos,Math.sin(view.pitch),-Math.cos(yaw)*cos);
      target.copy(camera.position).add(direction);camera.lookAt(target);
      camera.fov=55;camera.zoom=THREE.MathUtils.damp(camera.zoom,view.magnification,12,delta);camera.updateProjectionMatrix();
      return true;
    }
  };
}

export function initCameraZoom({camera,canvas,onOpen}){
  const controller=createObservationCamera(camera);
  const toggle=document.createElement('button');toggle.type='button';toggle.className='camera-zoom-toggle';toggle.textContent='🔍 觀景變焦';toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','camera-zoom-panel');
  const panel=document.createElement('section');panel.id='camera-zoom-panel';panel.className='camera-zoom-panel';panel.hidden=true;panel.setAttribute('aria-label','觀景變焦');
  const title=document.createElement('strong');title.textContent='觀景鏡頭';
  const readout=document.createElement('output');readout.className='camera-zoom-value';
  const slider=document.createElement('input');slider.type='range';slider.min='1';slider.max='8';slider.step='.1';slider.setAttribute('aria-label','觀景放大倍率');
  const presets=document.createElement('div');presets.className='camera-zoom-presets';
  const choices=[];
  const sync=()=>{slider.value=String(controller.view.magnification);readout.textContent=`${controller.view.magnification.toFixed(1)}×`;slider.setAttribute('aria-valuetext',readout.textContent);for(const [button,value] of choices)button.setAttribute('aria-pressed',String(Math.abs(value-controller.view.magnification)<.01));};
  for(const value of [1,2,4,8]){
    const button=document.createElement('button');button.type='button';button.textContent=`${value}×`;button.setAttribute('aria-label',`放大 ${value} 倍`);button.addEventListener('click',()=>{controller.setMagnification(value);sync();button.blur();});presets.append(button);choices.push([button,value]);
  }
  slider.addEventListener('input',()=>{controller.setMagnification(Number(slider.value));sync();});
  const reset=document.createElement('button');reset.type='button';reset.className='camera-zoom-reset';reset.textContent='重設視角與倍率';reset.addEventListener('click',()=>{controller.reset();sync();reset.blur();});
  const hint=document.createElement('p');hint.textContent='拖曳畫面轉動鏡頭，滾輪調整倍率。再次按「觀景變焦」回到航行視角。';
  panel.append(title,readout,slider,presets,reset,hint);document.body.append(toggle,panel);
  const close=()=>{controller.close();panel.hidden=true;toggle.setAttribute('aria-expanded','false');drag=null;};
  toggle.addEventListener('click',()=>{
    toggle.blur();if(controller.view.active){close();return;}
    onOpen();controller.open();panel.hidden=false;toggle.setAttribute('aria-expanded','true');sync();
  });
  let drag=null;
  canvas.addEventListener('wheel',event=>{
    if(!controller.view.active)return;event.preventDefault();controller.setMagnification(controller.view.magnification*Math.exp(-event.deltaY*.0015));sync();
  },{passive:false});
  canvas.addEventListener('pointerdown',event=>{if(!controller.view.active||event.button!==0)return;drag={id:event.pointerId,x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId);});
  canvas.addEventListener('pointermove',event=>{if(!controller.view.active||!drag||drag.id!==event.pointerId)return;controller.drag(event.clientX-drag.x,event.clientY-drag.y);drag.x=event.clientX;drag.y=event.clientY;});
  const end=event=>{if(drag?.id===event.pointerId)drag=null;};
  for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,end);
  addEventListener('blur',()=>{drag=null;});sync();
  return {...controller,close};
}
