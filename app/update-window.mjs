// Deadline-based countdown: interaction/newer batches never postpone an update.
// Explicit pause freezes the remaining time; returning from a background tab
// consumes elapsed time instead of counting delayed timer callbacks.
export function createUpdateWindow(delayMs=15000, now=()=>Date.now()) {
  let active=false, paused=false, deadline=0, left=delayMs;
  return {
    start(){if(!active){active=true;left=delayMs;deadline=now()+left;}},
    setPaused(value){
      if(value===paused)return;
      if(value){left=active?Math.max(0,deadline-now()):delayMs;}
      else deadline=now()+left;
      paused=value;
    },
    remaining(){return !active?delayMs:paused?left:Math.max(0,deadline-now());},
    clear(){active=false;paused=false;deadline=0;left=delayMs;}
  };
}
