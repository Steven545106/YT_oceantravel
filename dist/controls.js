const MOVEMENT_KEYS=new Set(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright']);
export const isMovementKey=key=>MOVEMENT_KEYS.has(key.toLowerCase());
// Letter and digit keys by their physical position (event.code): with a Chinese input method switched on, event.key
// can come through as 'Process' or a Zhuyin symbol instead of the letter, and the controls would not react.
export function keyOf(event){
  const code=event.code??'';
  if(/^Key[A-Z]$/.test(code))return code.slice(3).toLowerCase();
  if(/^Digit[0-9]$/.test(code))return code.slice(5);
  return String(event.key??'').toLowerCase();
}
export const isTextControl=target=>!!target&&(target.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(target.tagName));
export function movementAxes(keys){
  const held=(letter,arrow)=>keys.has(letter)||keys.has(arrow);
  return {throttle:Number(held('w','arrowup'))-Number(held('s','arrowdown')),steer:Number(held('a','arrowleft'))-Number(held('d','arrowright'))};
}
// Ships: W held drives ahead by hand; E turns on auto cruise, which keeps the engine ahead until E again, S (held S
// still goes astern), R or running aground.
export const shipThrottle=(keys,cruise)=>{
  const {throttle}=movementAxes(keys);
  return throttle<0?-1:cruise?1:throttle;
};
// what a key press does to auto cruise: E toggles it, S / ↓ stops it, other keys leave it
export const cruiseAfterKey=(key,cruise)=>key==='e'?!cruise:['s','arrowdown'].includes(key)?false:cruise;
// the ship panel's state line
export function shipModeText({cruise,throttle,velocity}){
  if(cruise)return throttle<0?'倒退中（自動巡航已暫停）':'自動巡航';
  if(throttle>0)return '手動前進';
  if(throttle<0)return '倒退';
  return Math.abs(velocity)>.05?'滑行中':'停船';
}
