// Hidden developer mode, switched on and off with Ctrl + Cmd + Shift + E (Ctrl + Win + Shift + E on Windows):
// every country open for sailing and stamps, every teleport point open, and the jet's Turbo without its time limit
// or cooldown. It is remembered in this browser; players never see it unless they press the keys.
const KEY = 'relax-dev-mode-v1';
let on = false;
try { on = globalThis.localStorage?.getItem(KEY) === '1'; } catch { on = false; }
const listeners = [];

export const isDevMode = () => on;
export const onDevModeChange = (listener) => { listeners.push(listener); };
export function setDevMode(value) {
  if (value === on) return;
  on = value;
  try { globalThis.localStorage?.setItem(KEY, on ? '1' : '0'); } catch { /* private mode */ }
  for (const listener of listeners) listener(on);
}
// the shortcut, by key position so a Chinese input method or Shift does not change the letter
export const isDevModeShortcut = (event) => !!(event.ctrlKey && event.metaKey && event.shiftKey && event.code === 'KeyE');
