// Relaxing background music, synthesised live (no audio files): a slow looping chord progression of soft pads,
// a gentle sine bass, and sparse plucked pentatonic notes through a warm echo. Starts after the first user gesture.
const NOTE = (name) => {
  const names = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  const match = name.match(/^([A-G]#?)(\d)$/);
  return 440 * Math.pow(2, (names[match[1]] + (Number(match[2]) + 1) * 12 - 69) / 12);
};
// Cmaj7 - Am7 - Fmaj9 - G6/9, each held for eight seconds
const CHORDS = [
  { bass: 'C2', pad: ['E3', 'G3', 'B3', 'D4'] },
  { bass: 'A1', pad: ['C3', 'E3', 'G3', 'B3'] },
  { bass: 'F2', pad: ['A3', 'C4', 'E4', 'G3'] },
  { bass: 'G1', pad: ['B2', 'D3', 'E3', 'A3'] }
];
const PENTATONIC = ['C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6', 'E6'];
const CHORD_SECONDS = 8;

export function createMusic() {
  let ctx = null, master = null, bus = null, timer = 0;
  let enabled = false, volume = 1, nextChord = 0, chordIndex = 0, nextNote = 0;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return false;
    ctx = new Context();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    bus = ctx.createGain();
    const warm = ctx.createBiquadFilter(); warm.type = 'lowpass'; warm.frequency.value = 2400; warm.Q.value = .3;
    const echo = ctx.createDelay(1.5); echo.delayTime.value = .46;
    const feedback = ctx.createGain(); feedback.gain.value = .42;
    const damp = ctx.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 1400;
    const wet = ctx.createGain(); wet.gain.value = .5;
    bus.connect(warm); warm.connect(master);
    warm.connect(echo); echo.connect(damp); damp.connect(feedback); feedback.connect(echo); damp.connect(wet); wet.connect(master);
    nextChord = ctx.currentTime + .1;
    nextNote = ctx.currentTime + 3;
    timer = setInterval(schedule, 250);
    schedule();
    master.gain.linearRampToValueAtTime(enabled ? .2 * volume : 0, ctx.currentTime + 4);   // fade in
    return true;
  }

  function voice(frequency, start, duration, { type = 'sine', volume = .05, attack = 2.2, release = 3, detune = 0 } = {}) {
    const oscillator = ctx.createOscillator(), gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    oscillator.detune.value = detune;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + attack);
    gain.gain.setValueAtTime(volume, start + Math.max(attack, duration - release));
    gain.gain.linearRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain); gain.connect(bus);
    oscillator.start(start); oscillator.stop(start + duration + .1);
  }

  function pluck(frequency, start) {
    const oscillator = ctx.createOscillator(), second = ctx.createOscillator(), gain = ctx.createGain();
    oscillator.type = 'sine'; second.type = 'triangle';
    oscillator.frequency.value = frequency; second.frequency.value = frequency * 2;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(.07, start + .015);
    gain.gain.exponentialRampToValueAtTime(.0008, start + 2.4);
    const mix = ctx.createGain(); mix.gain.value = .25;
    oscillator.connect(gain); second.connect(mix); mix.connect(gain); gain.connect(bus);
    oscillator.start(start); second.start(start); oscillator.stop(start + 2.6); second.stop(start + 2.6);
  }

  function schedule() {
    if (!ctx || ctx.state !== 'running') return;
    const horizon = ctx.currentTime + 1.5;
    while (nextChord < horizon) {
      const chord = CHORDS[chordIndex % CHORDS.length];
      chord.pad.forEach((name, i) => {
        const f = NOTE(name);
        voice(f, nextChord, CHORD_SECONDS + 3, { type: 'triangle', volume: .035, detune: -5 + i * 3 });
        voice(f * 1.003, nextChord, CHORD_SECONDS + 3, { type: 'sine', volume: .03, detune: 6 - i * 2 });
      });
      voice(NOTE(chord.bass), nextChord, CHORD_SECONDS + 2, { type: 'sine', volume: .08, attack: 1.5, release: 2.5 });
      nextChord += CHORD_SECONDS;
      chordIndex++;
    }
    while (nextNote < horizon) {
      pluck(NOTE(PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)]), nextNote);
      nextNote += [1.5, 2, 3, 4.5][Math.floor(Math.random() * 4)] + Math.random();
    }
  }

  return {
    unlock() { ensure(); },
    setEnabled(value) {
      enabled = value;
      if (!ctx) return;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.linearRampToValueAtTime(value ? .2 * volume : 0, ctx.currentTime + 1.2);
    },
    setVolume(value) { volume = value; if (ctx && enabled) { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.linearRampToValueAtTime(.2 * volume, ctx.currentTime + .2); } },
    get volume() { return volume; },
    toggle() { this.setEnabled(!enabled); return enabled; },
    get enabled() { return enabled; }
  };
}
