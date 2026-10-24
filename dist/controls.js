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
