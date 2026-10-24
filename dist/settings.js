// Settings panel (gear button, bottom right): graphics quality, time of day, weather, and on/off plus volume for the
// music, the ambient sea sounds and the whale calls. Keyboard shortcuts keep working; the panel and the help list
// stay in step with them, and the sound settings are remembered in this browser.
import { TIME_MODE_LIST, WEATHER_MODE_LIST, currentWeatherMode, dayCycle, setTimeMode, setWeatherMode } from './core.js';
import { quality, setQuality } from './quality.js';

const STORAGE_KEY = 'relax-audio';
const QUALITY_LIST = [{ id: 'high', name: '高' }, { id: 'medium', name: '中' }, { id: 'low', name: '低' }];

export function initSettings({ music, whaleSound, ambience }) {
  const sounds = {
    music: { name: '背景音樂', hint: '#music-state', on: () => music.enabled, set: (on) => music.setEnabled(on), volume: (v) => music.setVolume(v), level: () => music.volume },
    ambience: { name: '環境音（海浪・風・海鷗）', hint: '#ambience-state', on: () => !ambience.muted, set: (on) => ambience.setMuted(!on), volume: (v) => ambience.setVolume(v), level: () => ambience.volume },
    whale: { name: '鯨魚叫聲', hint: '#sound-state', on: () => !whaleSound.muted, set: (on) => whaleSound.setMuted(!on), volume: (v) => whaleSound.setVolume(v), level: () => whaleSound.volume }
  };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    for (const [id, value] of Object.entries(saved ?? {})) {
      if (!sounds[id]) continue;
      if (typeof value.volume === 'number') sounds[id].volume(Math.min(1, Math.max(0, value.volume)));
      if (typeof value.on === 'boolean') sounds[id].set(value.on);
    }
  } catch { /* private mode */ }
  const save = () => {
    const data = Object.fromEntries(Object.entries(sounds).map(([id, sound]) => [id, { on: sound.on(), volume: sound.level() }]));
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
  };
  const syncHints = () => {
    const text = (selector, value) => { const node = document.querySelector(selector); if (node) node.textContent = value; };
    text('#music-state', sounds.music.on() ? '開' : '關');
    text('#ambience-state', sounds.ambience.on() ? '開' : '關');
    text('#sound-state', sounds.whale.on() ? '開' : '靜音');
    text('#quality-state', quality.name);
  };
  syncHints();

  const button = document.createElement('button');
  button.className = 'settings-button'; button.type = 'button'; button.title = '設定'; button.setAttribute('aria-label', '設定');
  button.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" fill="none" stroke="#fff" stroke-width="1.6"/><path d="M19.4 13.5l1.6 1.2-1.8 3.1-1.9-.7a7.4 7.4 0 0 1-1.7 1l-.3 2H10.7l-.3-2a7.4 7.4 0 0 1-1.7-1l-1.9.7-1.8-3.1 1.6-1.2a7.6 7.6 0 0 1 0-2l-1.6-1.2 1.8-3.1 1.9.7a7.4 7.4 0 0 1 1.7-1l.3-2h3.6l.3 2a7.4 7.4 0 0 1 1.7 1l1.9-.7 1.8 3.1-1.6 1.2a7.6 7.6 0 0 1 0 2z" fill="none" stroke="#9de8ff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  document.body.append(button);

  const panel = document.createElement('div');
  panel.className = 'achievements settings'; panel.hidden = true;
  panel.innerHTML = `<div class="achievements-card settings-card" role="dialog" aria-label="設定">
    <div class="achievements-head"><h2>設定</h2><span>快捷鍵：Q 畫質 · T 時間 · G 天氣 · B 音樂 · N 環境音 · M 鯨魚</span><button type="button" class="settings-close" aria-label="關閉">✕</button></div>
    <div class="settings-body"></div></div>`;
  document.body.append(panel);
  const body = panel.querySelector('.settings-body');

  const choiceRow = (label, options, current, onPick) => {
    const row = document.createElement('div'); row.className = 'settings-row';
    row.innerHTML = `<span class="settings-label">${label}</span>`;
    const group = document.createElement('div'); group.className = 'settings-choices';
    for (const option of options) {
      const choice = document.createElement('button'); choice.type = 'button'; choice.textContent = option.name;
      choice.classList.toggle('is-active', option.id === current);
      choice.addEventListener('click', () => { onPick(option.id); render(); });
      group.append(choice);
    }
    row.append(group); return row;
  };
  const soundRow = (id) => {
    const sound = sounds[id];
    const row = document.createElement('div'); row.className = 'settings-row';
    row.innerHTML = `<span class="settings-label">${sound.name}</span>`;
    const controls = document.createElement('div'); controls.className = 'settings-sound';
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'settings-toggle';
    toggle.textContent = sound.on() ? '開' : '關'; toggle.classList.toggle('is-active', sound.on());
    toggle.addEventListener('click', () => { sound.set(!sound.on()); save(); syncHints(); render(); });
    const slider = document.createElement('input');
    slider.type = 'range'; slider.min = '0'; slider.max = '100'; slider.value = String(Math.round(sound.level() * 100)); slider.setAttribute('aria-label', `${sound.name}音量`);
    const readout = document.createElement('span'); readout.className = 'settings-volume'; readout.textContent = `${slider.value}%`;
    slider.addEventListener('input', () => { sound.volume(Number(slider.value) / 100); readout.textContent = `${slider.value}%`; save(); });
    controls.append(toggle, slider, readout); row.append(controls); return row;
  };
  function render() {
    body.replaceChildren(
      choiceRow('畫質', QUALITY_LIST, quality.level, (id) => { setQuality(id); syncHints(); }),
      choiceRow('時間', TIME_MODE_LIST, dayCycle.mode, setTimeMode),
      choiceRow('天氣', WEATHER_MODE_LIST, currentWeatherMode(), setWeatherMode),
      soundRow('music'), soundRow('ambience'), soundRow('whale')
    );
  }
  const setOpen = (open) => { panel.hidden = !open; if (open) render(); };
  button.addEventListener('click', () => { button.blur(); setOpen(panel.hidden); });
  panel.querySelector('.settings-close').addEventListener('click', () => setOpen(false));
  panel.addEventListener('click', (event) => { if (event.target === panel) setOpen(false); });
  // keyboard shortcuts (handled in ocean.js) change the same things: remember them and refresh an open panel
  addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement) return;
    const key = event.key.toLowerCase();
    if (key === 'escape' && !panel.hidden) { setOpen(false); return; }
    if (!['b', 'm', 'n', 'q', 't', 'g'].includes(key)) return;
    setTimeout(() => { save(); syncHints(); if (!panel.hidden) render(); }, 0);
  });
  return { setOpen, get open() { return !panel.hidden; } };
}
