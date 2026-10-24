const MOVEMENT_KEYS=new Set(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright']);
export const isMovementKey=key=>MOVEMENT_KEYS.has(key.toLowerCase());
export const isTextControl=target=>!!target&&(target.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(target.tagName));
export function movementAxes(keys){
  const held=(letter,arrow)=>keys.has(letter)||keys.has(arrow);
  return {throttle:Number(held('w','arrowup'))-Number(held('s','arrowdown')),steer:Number(held('a','arrowleft'))-Number(held('d','arrowright'))};
}
