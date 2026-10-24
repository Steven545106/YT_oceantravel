import {FIGHTER_CRUISE_SPEED} from './vehicle-speeds.js';

const clamp01=value=>Math.max(0,Math.min(1,value));

// Speed drives the exhaust and sound; the pursuit camera stays steady during acceleration.
export function flightFeedback(speed,acceleration=0){
  const ratio=Math.max(0,speed)/FIGHTER_CRUISE_SPEED;
  const cruise=clamp01(ratio);
  const boost=clamp01((ratio-1)/2);
  const kick=clamp01(acceleration/4);
  return {
    cruise,boost,kick,
    fov:61,
    followDistance:1.35,
    lookAhead:1.3
  };
}
