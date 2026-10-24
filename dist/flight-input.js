export const FLIGHT_HOLD_MS=350;

// One gesture source per key or pointer. A short release is a command; a
// sustained press is read continuously by the flight loop for altitude input.
export function createFlightHoldInput({now=()=>performance.now(),holdMs=FLIGHT_HOLD_MS}={}){
  const presses=new Map();
  return {
    // a fresh press restarts the hold, even if the last release was never seen (a key let go while the window was busy)
    press(source,command){presses.set(source,{command,since:now()});},
    release(source){
      const press=presses.get(source);
      if(!press)return null;
      presses.delete(source);
      return {command:press.command,kind:now()-press.since>=holdMs?'hold':'tap'};
    },
    active(command){return [...presses.values()].some(press=>press.command===command&&now()-press.since>=holdMs);},
    cancel(source){presses.delete(source);},
    clear(){presses.clear()}
  };
}
