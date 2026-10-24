const smooth=t=>{t=Math.min(1,Math.max(0,t));return t*t*(3-2*t);};
// Ballistic porpoising: pitch follows the velocity tangent, head toward +Z.
// Entry/exit pitch blends below the water so there is no rotation snap on resuming a swim.
export function dolphinLeapPose(time,{duration,height,depth,speed}){
  const u=Math.min(1,Math.max(0,time/duration));
  const verticalSpeed=4*(height+depth)*(1-2*u)/duration;
  return {y:-depth+4*(height+depth)*u*(1-u),pitch:Math.atan2(verticalSpeed,Math.max(speed,.001))*smooth(u/.12)*smooth((1-u)/.14),verticalSpeed,done:u>=1};
}
export function swimToward(x,z,targetX,targetZ,delta,maxSpeed){
  const dx=targetX-x,dz=targetZ-z,d=Math.hypot(dx,dz);
  const step=Math.min(d*(1-Math.exp(-delta*2.4)),maxSpeed*delta);
  return d>.000001?{x:x+dx/d*step,z:z+dz/d*step}:{x,z};
}
