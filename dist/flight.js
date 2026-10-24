import {FIGHTER_CRUISE_SPEED} from './vehicle-speeds.js';

// Arcade VTOL sightseeing flight. Horizontal scene units are four kilometres;
// height follows the exaggerated terrain mesh, so clearance is measured in scene units.
export const FLIGHT_MIN_CLEARANCE=.12;
export const FLIGHT_MAX_HEIGHT=10; // HUD metres = scene height × 1000.
export const FLIGHT_GEAR_HEIGHT=.055;
export const FLIGHT_LANDING_RADIUS=.18;
const FLIGHT_CLEARANCE_RADIUS=.22;
// Turbo: ramps the cruise speed up to TURBO_MULTIPLIER× over TURBO_RAMP_SECONDS, holds it, then eases back.
// One use per TURBO_COOLDOWN_MS of real time (the caller keeps the last-use time).
export const TURBO_MULTIPLIER=3;
export const TURBO_RAMP_SECONDS=10;
export const TURBO_HOLD_SECONDS=20;
export const TURBO_COOLDOWN_MS=60*60*1000;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const approach=(value,target,step)=>value<target?Math.min(value+step,target):Math.max(value-step,target);

export function createFlightState({x=0,y=.8,z=0,heading=0,mode='hover',speed=0}={}){
  return {x,y,z,heading,mode,speed,verticalSpeed:0,bank:0,pitch:0,warning:'',turbo:null,turboEndless:false};
}

export function landingSite(flight,{isOnLand,terrainHeightAt,obstacleTopAt=()=>-Infinity}){
  const {x,z}=flight;
  const samples=[[0,0],[FLIGHT_LANDING_RADIUS,0],[-FLIGHT_LANDING_RADIUS,0],[0,FLIGHT_LANDING_RADIUS],[0,-FLIGHT_LANDING_RADIUS]];
  if(!samples.every(([dx,dz])=>isOnLand(x+dx,z+dz)))return {ok:false,reason:'下方不是可降落的陸地'};
  const heights=samples.map(([dx,dz])=>terrainHeightAt(x+dx,z+dz));
  if(Math.max(...heights)-Math.min(...heights)>.14)return {ok:false,reason:'地形過於陡峭，無法降落'};
  if(obstacleTopAt(x,z,FLIGHT_LANDING_RADIUS)>Math.max(...heights)+.08)return {ok:false,reason:'下方有景點或建築物，無法降落'};
  return {ok:true,height:Math.max(...heights)};
}

export function requestTakeoff(flight,env){
  if(flight.mode!=='grounded')return {ok:false,reason:'戰鬥機已在空中'};
  const site=landingSite(flight,env);
  if(!site.ok)return site;
  flight.mode='takingOff';flight.speed=0;flight.verticalSpeed=0;flight.warning='';
  return {ok:true};
}

export function requestLanding(flight,env){
  if(flight.mode==='grounded')return {ok:false,reason:'戰鬥機已在地面'};
  const site=landingSite(flight,env);
  if(!site.ok)return site;
  flight.mode='landing';flight.speed=0;flight.verticalSpeed=0;flight.warning='';
  return {ok:true};
}

export function toggleHover(flight){
  if(flight.mode==='grounded'||flight.mode==='landing'||flight.mode==='takingOff')return {ok:false,reason:'起飛後才能切換滯空'};
  flight.mode=flight.mode==='hover'?'flying':'hover';
  flight.verticalSpeed=0;flight.warning='';
  return {ok:true,mode:flight.mode};
}

export const turboCooldownLeft=(lastUsed,now)=>Number.isFinite(lastUsed)?Math.max(0,lastUsed+TURBO_COOLDOWN_MS-now):0;
// Turbo boost multiplier for the current moment, or 1 when it is not running.
export const turboMultiplier=(flight)=>flight.turbo===null?1:1+(TURBO_MULTIPLIER-1)*Math.min(1,flight.turbo/TURBO_RAMP_SECONDS);

// `unlimited` (test mode): no cooldown, and the boost lasts until stopTurbo instead of TURBO_HOLD_SECONDS.
export function requestTurbo(flight,{lastUsed,now,unlimited=false}){
  if(flight.mode!=='flying'&&flight.mode!=='hover')return {ok:false,reason:'起飛後才能使用 Turbo'};
  if(flight.turbo!==null)return {ok:false,reason:'Turbo 已在加速中'};
  const left=unlimited?0:turboCooldownLeft(lastUsed,now);
  if(left>0)return {ok:false,reason:`Turbo 冷卻中，還要 ${Math.ceil(left/60000)} 分鐘`};
  flight.mode='flying';flight.turbo=0;flight.turboEndless=unlimited;flight.warning='';
  return {ok:true};
}

export function stopTurbo(flight){flight.turbo=null;flight.turboEndless=false;}

function safeHeight(x,z,env){
  let ground=0;
  for(const [dx,dz] of [[0,0],[FLIGHT_CLEARANCE_RADIUS,0],[-FLIGHT_CLEARANCE_RADIUS,0],[0,FLIGHT_CLEARANCE_RADIUS],[0,-FLIGHT_CLEARANCE_RADIUS]])
    if(env.isOnLand(x+dx,z+dz))ground=Math.max(ground,env.terrainHeightAt(x+dx,z+dz));
  return Math.max(ground,env.obstacleTopAt?.(x,z,FLIGHT_CLEARANCE_RADIUS)??-Infinity)+FLIGHT_MIN_CLEARANCE;
}

export function flightStep(flight,input,env,delta){
  const dt=clamp(delta,0,.05),oldY=flight.y;
  flight.warning='';
  if(flight.mode!=='flying')stopTurbo(flight);   // hovering, landing or parking ends turbo
  if(flight.mode==='grounded'){
    const site=landingSite(flight,env);
    if(site.ok)flight.y=site.height+FLIGHT_GEAR_HEIGHT;
    else{flight.mode='hover';flight.y=Math.max(flight.y,safeHeight(flight.x,flight.z,env));flight.warning='地面已不適合停放，已安全滯空';}
    flight.speed=0;flight.verticalSpeed=0;flight.bank=approach(flight.bank,0,dt*2);flight.pitch=0;
    return flight;
  }
  if(flight.mode==='takingOff'){
    const ground=env.terrainHeightAt(flight.x,flight.z);
    flight.y=Math.min(FLIGHT_MAX_HEIGHT,flight.y+dt*.6);
    if(flight.y>=ground+.52)flight.mode='hover';
    flight.speed=0;flight.pitch=0;
  }else if(flight.mode==='landing'){
    const site=landingSite(flight,env);
    if(!site.ok){flight.mode='hover';flight.warning=site.reason;}
    else{
      flight.y=approach(flight.y,site.height+FLIGHT_GEAR_HEIGHT,dt*.5);
      flight.speed=0;flight.pitch=0;
      if(flight.y<=site.height+FLIGHT_GEAR_HEIGHT+1e-5){flight.mode='grounded';flight.y=site.height+FLIGHT_GEAR_HEIGHT;}
    }
  }else{
    const hover=flight.mode==='hover';
    const throttle=clamp(input.throttle??0,-1,1),steer=clamp(input.steer??0,-1,1);
    if(flight.turbo!==null&&(throttle<0||((flight.turbo+=dt)>TURBO_RAMP_SECONDS+TURBO_HOLD_SECONDS&&!flight.turboEndless)))stopTurbo(flight);   // braking ends it early
    const desiredSpeed=hover?(throttle>0?1.25:throttle<0?-.65:0):flight.turbo!==null?FIGHTER_CRUISE_SPEED*turboMultiplier(flight):throttle>0?FIGHTER_CRUISE_SPEED:throttle<0?1.1:clamp(flight.speed,1.4,FIGHTER_CRUISE_SPEED);   // coasting after turbo eases back to cruise
    flight.speed=approach(flight.speed,desiredSpeed,dt*(hover?2.8:3));
    flight.heading+=steer*dt*(hover ? .83 : .36);
    // +steer turns left. With the nose facing -Z, +roll lowers the left (-X) wing.
    flight.bank=approach(flight.bank,steer*(hover ? .11 : .35),dt*.9);
    const verticalInput=Number(!!input.climb)-Number(!!input.descend);
    const beforeClimb=flight.y;
    flight.y=clamp(flight.y+verticalInput*dt*(hover ? .72 : .96),0,FLIGHT_MAX_HEIGHT);
    const didClimb=Math.abs(flight.y-beforeClimb)>1e-6;
    flight.pitch=approach(flight.pitch,didClimb?verticalInput*.13:0,dt*.7);
    if(verticalInput>0&&!didClimb&&flight.y>=FLIGHT_MAX_HEIGHT)flight.warning='已達飛行高度上限';
    const dx=-Math.sin(flight.heading)*flight.speed*dt,dz=-Math.cos(flight.heading)*flight.speed*dt;
    const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.035));
    let nx=flight.x,nz=flight.z,required=0;
    for(let i=1;i<=steps;i++){
      nx=flight.x+dx*i/steps;nz=flight.z+dz*i/steps;
      if(nx<env.bounds.minX||nx>env.bounds.maxX||nz<env.bounds.minZ||nz>env.bounds.maxZ||env.canEnter?.(nx,nz)===false){
        flight.speed=0;flight.warning='已到達可飛行範圍邊界';nx=flight.x;nz=flight.z;break;
      }
      required=Math.max(required,safeHeight(nx,nz,env));
    }
    flight.x=nx;flight.z=nz;
    if(flight.y<required){flight.y=required;flight.warning='地形接近，已自動拉升';}
  }
  if(flight.mode!=='grounded'){
    const minimum=safeHeight(flight.x,flight.z,env);
    if(flight.mode!=='landing'&&flight.y<minimum){flight.y=minimum;flight.warning='高度不足，已自動拉升';}
  }
  flight.y=clamp(flight.y,0,FLIGHT_MAX_HEIGHT);
  // Terrain corrections may jump several scene units in one frame; cap the
  // instrument rate so its reading remains useful during automatic pull-ups.
  flight.verticalSpeed=clamp((flight.y-oldY)/Math.max(dt,1e-4),-1.5,1.5);
  return flight;
}
