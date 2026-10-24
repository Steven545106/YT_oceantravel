// Ambient sea sound, all synthesized: swells on the hull, wind that rises with the weather, rain hiss, and gull cries near the coast.
export function createAmbience() {
  let ctx = null, master = null, muted = false, started = false, volume = 1;
  let waveGain, waveFilter, windGain, windFilter, rainGain, nextGull = 4;
  const state = { gulls: 0, wind: 13, rain: 0, storm: 0, speed: 0 };

  function noiseSource(kind) {
    const length = ctx.sampleRate * 4, buffer = ctx.createBuffer(1, length, ctx.sampleRate), data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + .02 * white) / 1.02; data[i] = last * 3.5; } else data[i] = white;
    }
    const source = ctx.createBufferSource(); source.buffer = buffer; source.loop = true; source.start();
    return source;
  }
  function lfo(rate, depth, target) {
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.frequency.value = rate; gain.gain.value = depth; osc.connect(gain).connect(target); osc.start();
  }
  function ensure() {
    if (ctx) return true;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return false;
    ctx = new Context(); master = ctx.createGain(); master.gain.value = muted ? 0 : .8 * volume; master.connect(ctx.destination);
    // waves: low-passed brown noise with a slow swell
    waveFilter = ctx.createBiquadFilter(); waveFilter.type = 'lowpass'; waveFilter.frequency.value = 420;
    waveGain = ctx.createGain(); waveGain.gain.value = .25;
    noiseSource('brown').connect(waveFilter).connect(waveGain).connect(master);
    lfo(.11, .12, waveGain.gain); lfo(.07, 90, waveFilter.frequency);
    // wind: band-passed white noise, gusting
    windFilter = ctx.createBiquadFilter(); windFilter.type = 'bandpass'; windFilter.frequency.value = 500; windFilter.Q.value = .7;
    windGain = ctx.createGain(); windGain.gain.value = .05;
    noiseSource('white').connect(windFilter).connect(windGain).connect(master);
    lfo(.13, .03, windGain.gain); lfo(.09, 120, windFilter.frequency);
    // rain: high-passed hiss
    const rainFilter = ctx.createBiquadFilter(); rainFilter.type = 'highpass'; rainFilter.frequency.value = 2400;
    rainGain = ctx.createGain(); rainGain.gain.value = 0;
    noiseSource('white').connect(rainFilter).connect(rainGain).connect(master);
    started = true; return true;
  }
  function gullCry() {
    const t = ctx.currentTime, pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) pan.pan.value = Math.random() * 1.6 - .8;
    const calls = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < calls; i++) {
      const start = t + i * (.22 + Math.random() * .08), osc = ctx.createOscillator(), amp = ctx.createGain();
      const base = 1500 + Math.random() * 500;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(base * .75, start); osc.frequency.linearRampToValueAtTime(base * 1.25, start + .08); osc.frequency.exponentialRampToValueAtTime(base * .6, start + .24);
      amp.gain.setValueAtTime(0, start); amp.gain.linearRampToValueAtTime(.07, start + .03); amp.gain.exponentialRampToValueAtTime(.001, start + .26);
      osc.connect(amp); amp.connect(pan || master); osc.start(start); osc.stop(start + .3);
    }
    if (pan) pan.connect(master);
  }
  return {
    unlock() { ensure(); },
    update(delta, { gulls, wind, rain, storm, speed }) {
      if (!started) return;
      Object.assign(state, { gulls, wind, rain, storm, speed });
      const t = ctx.currentTime, windLevel = Math.min(1.6, Math.max(0, (wind - 8) / 22));
      waveGain.gain.setTargetAtTime(.2 + .1 * Math.min(1, speed * 6) + storm * .45, t, 1.2);
      waveFilter.frequency.setTargetAtTime(380 + storm * 700 + speed * 600, t, 1.5);
      windGain.gain.setTargetAtTime(.025 + windLevel * .16, t, 1.2);
      windFilter.frequency.setTargetAtTime(380 + windLevel * 700, t, 1.5);
      rainGain.gain.setTargetAtTime(Math.min(1, rain) * .09, t, 1.0);
      nextGull -= delta;
      if (nextGull <= 0) { nextGull = 5 + Math.random() * 10; if (!muted && gulls > .5 && ctx.state === 'running') gullCry(); }
    },
    toggle() { muted = !muted; if (master) master.gain.value = muted ? 0 : .8 * volume; return muted; },
    setMuted(value) { if (value !== muted) this.toggle(); },
    setVolume(value) { volume = value; if (master && !muted) master.gain.value = .8 * volume; },
    get volume() { return volume; },
    get muted() { return muted; }
  };
}
