import {FIGHTER_CRUISE_SPEED} from './vehicle-speeds.js';

// Lightweight synthesized engine: a filtered two-tone turbine and soft air rush.
// The AudioContext starts only after a user gesture and is silent outside the jet.
export function createJetSound(){
  let ctx=null,master=null,turbine=null,rush=null,lowpass=null,muted=false,volume=.65;
  const clamp01=value=>Math.max(0,Math.min(1,value));
  function unlock(){
    if(ctx){if(ctx.state==='suspended')ctx.resume();return;}
    const Context=window.AudioContext||window.webkitAudioContext;
    if(!Context)return;
    ctx=new Context();
    master=ctx.createGain();master.gain.value=0;master.connect(ctx.destination);
    lowpass=ctx.createBiquadFilter();lowpass.type='lowpass';lowpass.frequency.value=240;lowpass.Q.value=.3;
    turbine=ctx.createOscillator();turbine.type='sawtooth';turbine.frequency.value=65;
    const harmonic=ctx.createOscillator();harmonic.type='triangle';harmonic.frequency.value=130;
    const harmonicGain=ctx.createGain();harmonicGain.gain.value=.23;
    turbine.connect(lowpass);harmonic.connect(harmonicGain).connect(lowpass);lowpass.connect(master);
    turbine.start();harmonic.start();
    const samples=ctx.sampleRate,buffer=ctx.createBuffer(1,samples,ctx.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<samples;i++)data[i]=Math.random()*2-1;
    const noise=ctx.createBufferSource();noise.buffer=buffer;noise.loop=true;
    const filter=ctx.createBiquadFilter();filter.type='bandpass';filter.frequency.value=850;filter.Q.value=.5;
    rush=ctx.createGain();rush.gain.value=0;
    noise.connect(filter).connect(rush).connect(master);noise.start();
  }
  return {
    unlock,
    update({active=false,speed=0,acceleration=0}={}){
      if(!ctx)return;
      const ratio=Math.max(0,speed)/FIGHTER_CRUISE_SPEED;
      const cruise=clamp01(ratio),boost=clamp01((ratio-1)/2),push=clamp01(acceleration/4),time=ctx.currentTime;
      const audible=active&&!muted;
      master.gain.setTargetAtTime(audible?volume*(.045+.075*cruise+.07*boost+.025*push):0,time,.09);
      turbine.frequency.setTargetAtTime(65+95*cruise+90*boost+12*push,time,.12);
      lowpass.frequency.setTargetAtTime(240+600*cruise+950*boost,time,.15);
      rush.gain.setTargetAtTime(audible ? .015+.055*cruise+.075*boost : 0,time,.12);
    },
    setMuted(value){muted=!!value;if(muted&&master)master.gain.setTargetAtTime(0,ctx.currentTime,.06);},
    setVolume(value){volume=clamp01(value);},
    get muted(){return muted;},
    get volume(){return volume;}
  };
}
