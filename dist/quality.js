// Graphics quality (Q cycles 高 / 中 / 低, remembered per browser): render resolution, how often the water reflection
// (a second full render of the scene) is refreshed, how far fine terrain tiles are kept, and how many particles are used.
const LEVELS = {
  high: { name: '高', pixelRatio: 2, reflectEvery: 1, detail: 1, particles: 1, shadows: true, shadowSize: 2048, scenery: 1 },
  medium: { name: '中', pixelRatio: 1.5, reflectEvery: 2, detail: .7, particles: .65, shadows: true, shadowSize: 1024, scenery: .65 },
  low: { name: '低', pixelRatio: 1, reflectEvery: 4, detail: .45, particles: .35, shadows: false, shadowSize: 512, scenery: .35 }
};
const ORDER = ['high', 'medium', 'low'];
const STORAGE_KEY = 'relax-quality';

let saved = null;
try { saved = localStorage.getItem(STORAGE_KEY); } catch { /* private mode */ }
export const quality = { level: LEVELS[saved] ? saved : 'high', ...LEVELS[LEVELS[saved] ? saved : 'high'] };

const listeners = [];
export const onQualityChange = (callback) => { listeners.push(callback); callback(quality); };
export function setQuality(level) {
  if (!LEVELS[level]) return;
  Object.assign(quality, { level }, LEVELS[level]);
  try { localStorage.setItem(STORAGE_KEY, level); } catch { /* ignore */ }
  for (const callback of listeners) callback(quality);
}
export function cycleQuality() { setQuality(ORDER[(ORDER.indexOf(quality.level) + 1) % ORDER.length]); return quality; }
