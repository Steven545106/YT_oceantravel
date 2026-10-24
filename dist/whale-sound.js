// Synthesised whale calls (no audio files): soft, flute-like gliding coos for the humpback and a warm low hum for the blue whale
// (gentle by request: pure sine tones, slow swells, no buzzing harmonics), plus a breathy spout "whoosh",
// both through a soft feedback-delay "underwater" reverb. The AudioContext is created on the first user gesture (browser autoplay rules).
export function createWhaleSound() {
  let ctx = null, master = null, bus = null, muted = false, volume = 1;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return false;
    ctx = new Context();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : .55 * volume;
    master.connect(ctx.destination);
    // muffled, echoing "underwater" bus
    bus = ctx.createGain();
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass'; lowpass.frequency.value = 900; lowpass.Q.value = .4;
    const delay = ctx.createDelay(1.5); delay.delayTime.value = .37;
    const feedback = ctx.createGain(); feedback.gain.value = .5;
    const damp = ctx.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 600;
    bus.connect(lowpass); lowpass.connect(master);
    lowpass.connect(delay); delay.connect(damp); damp.connect(feedback); feedback.connect(delay); damp.connect(master);
    return true;
  }

  function note(start, duration, f0, f1, volume, { type = 'sine', vibrato = 5, vibratoDepth = 6, harmonic = .25 } = {}) {
    const output = ctx.createGain();
    output.gain.setValueAtTime(0, start);
    output.gain.linearRampToValueAtTime(volume, start + duration * .35);       // slow, soft swell in
    output.gain.setValueAtTime(volume, start + duration * .55);
    output.gain.exponentialRampToValueAtTime(.0008, start + duration);
    output.connect(bus);
    const lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
    lfo.frequency.value = vibrato; lfoGain.gain.value = vibratoDepth;
    lfo.connect(lfoGain);
    for (const [ratio, level, waveform] of [[1, 1, type], [2, harmonic, 'sine']]) {
      const oscillator = ctx.createOscillator(), gain = ctx.createGain();
      oscillator.type = waveform;
      oscillator.frequency.setValueAtTime(f0 * ratio, start);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * ratio), start + duration);
      gain.gain.value = level;
      lfoGain.connect(oscillator.frequency);
      oscillator.connect(gain); gain.connect(output);
      oscillator.start(start); oscillator.stop(start + duration + .1);
    }
    lfo.start(start); lfo.stop(start + duration + .1);
  }

  // the spout: a short breathy whoosh of filtered noise
  function breath(start, volume) {
    const length = Math.floor(ctx.sampleRate * 1.2), buffer = ctx.createBuffer(1, length, ctx.sampleRate), data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource(); source.buffer = buffer;
    const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 900; filter.Q.value = .6;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(volume, start + .12); gain.gain.exponentialRampToValueAtTime(.0008, start + 1.1);
    source.connect(filter); filter.connect(gain); gain.connect(master);
    source.start(start); source.stop(start + 1.2);
  }

  return {
    // kind: 'humpback' (a short song) or 'blue' (long, deep moans); volume 0..1 from distance
    call(kind, volume = 1) {
      if (!ensure() || muted) return;
      const now = ctx.currentTime + .05, level = Math.max(.04, Math.min(1, volume)) * .5;
      breath(now, level * .6);
      const scale = [261.6, 293.7, 329.6, 392, 440, 523.3];                  // soft pentatonic coos
      if (kind === 'blue') {
        const hums = 2;
        for (let i = 0; i < hums; i++) {
          const start = now + .8 + i * 3.6, from = 150 + Math.random() * 30;
          note(start, 3.2, from, from * .88, level * .7, { type: 'sine', vibrato: 1.2, vibratoDepth: 1, harmonic: .12 });
        }
      } else {
        let start = now + .9;
        const notes = 3 + Math.floor(Math.random() * 2);
        let index = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < notes; i++) {
          const nextIndex = Math.max(0, Math.min(scale.length - 1, index + (Math.random() < .5 ? -1 : 1) * (1 + Math.floor(Math.random() * 2))));
          const duration = 1.1 + Math.random() * .7;
          note(start, duration, scale[index], scale[nextIndex], level * .55, { type: 'sine', vibrato: 3.5, vibratoDepth: 2.5, harmonic: .1 });
          start += duration * .9 + .25;
          index = nextIndex;
        }
      }
    },
    unlock() { ensure(); },
    setMuted(value) { muted = value; if (master) master.gain.value = value ? 0 : .55 * volume; },
    setVolume(value) { volume = value; if (master && !muted) master.gain.value = .55 * volume; },
    get volume() { return volume; },
    toggle() { this.setMuted(!muted); return muted; },
    get muted() { return muted; }
  };
}
