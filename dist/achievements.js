import { isWithinStampReach } from './stamp-reach.js';
import { normalizeAchievements, parseProgress } from './progress-data.js';
// Achievements and the country unlock chain, both driven by the region registry (Data/regions.json):
// - circuits: sail round a country (every one of 16 compass sectors round its centre visited within 60 km of its coast);
// - each country's `unlock` lists the achievement ids it needs (circuits, or master badges "master:<name>");
// - each country's `arrival` is a "reach its coast" achievement once it is unlocked.
// Progress is saved in localStorage. Until a country is unlocked, boats are turned back at its waters.
import { geoToWorld, worldToGeo } from './geo.js';
import { COUNTRIES, REGIONS, countryByCode, countryCode, countryName } from './regions.js';
const STORAGE_KEY = 'relax-achievements-v1';
const SECTORS = 16;
const COAST_RANGE_KM = 60;
export const JAPAN_BARRIER_KM = 12;     // how close to a locked country's shore a boat may get

const CIRCUITS = REGIONS.circuits.map((circuit) => ({ ...circuit, origin: geoToWorld({ latitude: circuit.centre[0], longitude: circuit.centre[1] }) }));
const SECTOR_KEYS = CIRCUITS.map((circuit) => circuit.saveKey);
const blank = () => ({ ...Object.fromEntries(SECTOR_KEYS.map((key) => [key, []])), unlocked: {}, counters: { nightSeconds: 0, whales: 0, arrivals: 0, landmarks: [] } });
let data = blank();
let notify = () => {};
let circumnavigate = () => {};
let ui = null;

try {
  const saved = parseProgress(localStorage.getItem(STORAGE_KEY));
  if (saved) data = normalizeAchievements(saved, SECTOR_KEYS);
} catch { /* private mode: progress simply isn't saved */ }

let saveTimer = 0;
// Merge with whatever is stored before writing: with the game open in two tabs (or a stale tab saving on close),
// a plain overwrite would wipe achievements earned in the other tab. Progress only ever grows.
function merge(stored) {
  if (!stored) return;
  stored = normalizeAchievements(stored, SECTOR_KEYS);
  for (const key of SECTOR_KEYS) data[key] = [...new Set([...data[key], ...stored[key]])];
  for (const [id, time] of Object.entries(stored.unlocked ?? {})) data.unlocked[id] = Math.min(data.unlocked[id] ?? Infinity, time);
  const c = data.counters, o = stored.counters ?? {};
  c.nightSeconds = Math.max(c.nightSeconds, o.nightSeconds ?? 0);
  c.whales = Math.max(c.whales, o.whales ?? 0);
  c.arrivals = Math.max(c.arrivals, o.arrivals ?? 0);
  c.landmarks = [...new Set([...c.landmarks, ...(o.landmarks ?? [])])];
}
const save = () => {
  try { merge(parseProgress(localStorage.getItem(STORAGE_KEY))); localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
};
addEventListener('storage', (event) => { if (event.key === STORAGE_KEY) { try { merge(parseProgress(event.newValue)); renderPanel(); } catch { /* ignore */ } } });

// --- Unlock rules ------------------------------------------------------------
const requirementsOf = (code) => countryByCode(code)?.unlock ?? [];
const allMet = (ids) => ids.every((id) => !!data.unlocked[id]);
// country (as a name or a land code) -> unlocked?, and the message shown when it is still locked
// Whether the player has really earned a country (what stamps, achievements and the stamp book go by).
export const isCountryEarned = (country) => allMet(requirementsOf(countryCode(country)));
// ?unlock=all opens every country's waters, sights and routes for a look round, without recording anything there:
// stamps and achievements still need the country to be earned, and nothing is saved as unlocked.
export const PREVIEW_ALL_COUNTRIES = new URLSearchParams(globalThis.location?.search ?? '').get('unlock') === 'all';
export const isCountryUnlocked = (country) => PREVIEW_ALL_COUNTRIES || isCountryEarned(country);
const masterCountry = (id) => id.startsWith('master:') ? id.slice(7) : null;
// "完成「環台一圈」", "集滿韓國與北韓的所有印章", joined when a country needs both kinds
function needsText(ids) {
  const parts = ids.filter((id) => !masterCountry(id)).map((id) => `完成「${CIRCUITS.find((circuit) => circuit.id === id)?.title ?? id}」`);
  const masters = ids.map(masterCountry).filter(Boolean);
  if (masters.length) parts.push(`集滿${masters.join('與')}的所有印章`);
  return parts.join('，並');
}
export const lockMessage = (country) => `${countryName(countryCode(country))}尚未解鎖：先${needsText(requirementsOf(countryCode(country)))}`;
// the countries an achievement opens, by display name
const opensCountries = (id) => COUNTRIES.filter((country) => (country.unlock ?? []).includes(id)).map((country) => country.name);

const sameUnlock = (a, b) => a.length === b.length && a.every((id) => b.includes(id));
const circuitDefinition = (circuit) => {
  const names = opensCountries(circuit.id).join('、');
  return { id: circuit.id, title: circuit.title, country: circuit.country, target: SECTORS, progress: () => data[circuit.saveKey].length, reward: names && `解鎖${names}`,
    description: `沿著${circuit.area}海岸航行一整圈：繞行 16 個方位，每個方位都要靠近海岸 60 公里內。${names ? `完成後解鎖${names}。` : ''}` };
};
const DEFINITIONS = [
  ...CIRCUITS.slice(0, 1).map(circuitDefinition),
  { id: 'firstWhale', title: '遇見鯨魚', description: '在海上遇見一隻鯨魚。', target: 1, progress: () => Math.min(1, data.counters.whales) },
  { id: 'nightSail', title: '夜航者', description: '在夜晚駕船航行累計 2 分鐘。', target: 120, progress: () => Math.min(120, Math.floor(data.counters.nightSeconds)), format: (v, t) => `${v} / ${t} 秒` },
  { id: 'autopilot', title: '自動導航抵達', description: '使用自動導航成功抵達一個目的地。', target: 1, progress: () => Math.min(1, data.counters.arrivals) },
  { id: 'sightseer', title: '景點達人', description: '航行到 8 個不同景點附近（內陸景點則是離它最近的海岸）。', target: 8, progress: () => Math.min(8, data.counters.landmarks.length) },
  ...CIRCUITS.slice(1).map(circuitDefinition),
  ...COUNTRIES.filter((country) => country.arrival).map((country) => ({ id: country.arrival, title: `踏上${country.name}`, country: country.code, arrival: true,
    description: `解鎖${country.name}後，抵達${country.name}海岸 20 公里內。`, target: 1, progress: () => (data.unlocked[country.arrival] ? 1 : 0) }))
];

// Country master badges ("台灣達人" …), registered by the stamp book once it knows how many stamps each country has.
export function registerMasterBadges(countries, progress) {
  for (const { country, total } of countries) {
    const id = `master:${country}`;
    if (DEFINITIONS.some((entry) => entry.id === id)) continue;
    DEFINITIONS.push({ id, title: `${country}達人`, country: countryCode(country), target: total, progress: () => progress(country),
      description: `集滿${country}所有景點的印章（共 ${total} 枚）。` });
  }
  check();
  renderPanel();
}
const isLocked = (definition) => !!definition.country && !isCountryEarned(definition.country);

function unlock(id) {
  if (data.unlocked[id]) return;
  const before = COUNTRIES.filter((country) => isCountryEarned(country.code)).length;
  data.unlocked[id] = Date.now();
  const definition = DEFINITIONS.find((entry) => entry.id === id);
  save();
  // a big banner when this completes some country's unlock requirements
  const opened = COUNTRIES.filter((country) => (country.unlock ?? []).includes(id) && isCountryEarned(country.code)).map((country) => country.name);
  const big = opened.length && COUNTRIES.filter((country) => isCountryEarned(country.code)).length > before
    ? `${definition?.title ?? id}${CIRCUITS.some((circuit) => circuit.id === id) ? '完成' : ''}！${opened.join('、')}已解鎖` : null;
  notify(big ?? `成就解鎖：${definition?.title ?? id}`, big ? 'big' : 'normal');
  renderPanel();
}

export function recordEvent(name) {
  if (name === 'whale') data.counters.whales++;
  if (name === 'arrive') data.counters.arrivals++;
  save();
  check();
}

function check() {
  for (const definition of DEFINITIONS) {
    if (data.unlocked[definition.id] || definition.arrival || isLocked(definition)) continue;
    if (definition.progress() >= definition.target) unlock(definition.id);
  }
}

let sinceCheck = 0;
// called every frame with the boat's state; heavy work is throttled
export function trackAchievements({ delta, x, z, nearestLand, night, speed, landmarks }) {
  sinceCheck += delta;
  if (night && speed > .05) data.counters.nightSeconds += delta;
  if (sinceCheck < .5) return;
  sinceCheck = 0;
  // circuit sectors: bearing from the circuit's centre, clockwise from north
  for (const circuit of CIRCUITS) {
    if (data.unlocked[circuit.id] || !isCountryEarned(circuit.country) || nearestLand.country !== circuit.country || nearestLand.km >= COAST_RANGE_KM) continue;
    if (circuit.minLatitude !== undefined && worldToGeo(x, z).latitude <= circuit.minLatitude) continue;   // e.g. the Ryukyus don't count for Japan
    const angle = (Math.atan2(x - circuit.origin.x, -(z - circuit.origin.y)) + Math.PI * 2) % (Math.PI * 2);
    const sector = Math.floor(angle / (Math.PI * 2 / SECTORS)) % SECTORS;
    if (!data[circuit.saveKey].includes(sector)) { data[circuit.saveKey].push(sector); renderPanel(); }
  }
  for (const item of landmarks ?? []) {
    if (data.counters.landmarks.includes(item.name)) continue;
    if (isCountryEarned(item.country) && isWithinStampReach(item,x,z)) { data.counters.landmarks.push(item.name); renderPanel(); }
  }
  for (const country of COUNTRIES) {
    if (country.arrival && !data.unlocked[country.arrival] && isCountryEarned(country.code) && nearestLand.country === country.code && nearestLand.km < 20) unlock(country.arrival);
  }
  check();
  if ((saveTimer += .5) >= 5) { saveTimer = 0; save(); }
}

// "日本：已解鎖 · 韓國、北韓…：尚未解鎖（環日本一圈進度 3 / 16）": one entry per distinct unlock requirement
function unlockStatusText() {
  const groups = [];
  for (const country of COUNTRIES) {
    const ids = country.unlock ?? [];
    if (!ids.length) continue;
    const group = groups.find((entry) => sameUnlock(entry.ids, ids));
    if (group) group.names.push(country.name); else groups.push({ ids, names: [country.name] });
  }
  return groups.map(({ ids, names }) => {
    if (allMet(ids)) return `${names.join('、')}：已解鎖`;
    const progress = ids.filter((id) => !data.unlocked[id]).map((id) => {
      const circuit = CIRCUITS.find((entry) => entry.id === id);
      if (circuit) return `${circuit.title}進度 ${data[circuit.saveKey].length} / ${SECTORS}`;
      return null;
    }).filter(Boolean);
    const masters = ids.map((id) => DEFINITIONS.find((entry) => entry.id === id && masterCountry(id))).filter(Boolean);
    if (masters.length) progress.push(`${masters.map((entry) => masterCountry(entry.id)).join('、')}印章 ${masters.reduce((sum, entry) => sum + Math.min(entry.progress(), entry.target), 0)} / ${masters.reduce((sum, entry) => sum + entry.target, 0)}`);
    return `${names.join('、')}：尚未解鎖${progress.length ? `（${progress.join('；')}）` : ''}`;
  });
}

function renderPanel() {
  if (!ui) return;
  const status = unlockStatusText();
  ui.japan.textContent = status.join('　·　');
  ui.japan.dataset.state = COUNTRIES.every((country) => isCountryEarned(country.code)) ? 'open' : 'locked';
  const circumReady = !!data.unlocked.circumTaiwan;
  ui.circum.hidden = !circumReady;
  ui.navCircum.hidden = !circumReady;
  ui.list.replaceChildren();
  const done = DEFINITIONS.filter((entry) => data.unlocked[entry.id]).length;
  ui.summary.textContent = `已完成 ${done} / ${DEFINITIONS.length}`;
  for (const definition of DEFINITIONS) {
    const finished = !!data.unlocked[definition.id];
    const locked = isLocked(definition);
    const value = definition.progress();
    const row = document.createElement('div');
    row.className = `achievement${finished ? ' is-done' : ''}${locked ? ' is-locked' : ''}`;
    const badge = document.createElement('div');
    badge.className = 'achievement-badge';
    badge.textContent = finished ? '✓' : locked ? '🔒' : String(Math.round(value / definition.target * 100)) + '%';
    const body = document.createElement('div');
    body.className = 'achievement-body';
    const title = document.createElement('strong');
    title.textContent = definition.title + (definition.reward ? `　· ${definition.reward}` : '');
    const text = document.createElement('p');
    text.textContent = locked ? `先${needsText(requirementsOf(definition.country))}才會開放。` : definition.description;
    const bar = document.createElement('div');
    bar.className = 'achievement-bar';
    const fill = document.createElement('span');
    fill.style.width = `${Math.min(100, value / definition.target * 100)}%`;
    bar.append(fill);
    const count = document.createElement('small');
    count.textContent = definition.format ? definition.format(value, definition.target) : `${value} / ${definition.target}`;
    body.append(title, text, bar, count);
    row.append(badge, body);
    ui.list.append(row);
  }
}

export function setAchievementsOpen(open) {
  if (!ui) return;
  ui.panel.hidden = !open;
  if (open) renderPanel();
}
export const achievementsOpen = () => !!ui && !ui.panel.hidden;

export function initAchievements({ onNotify, onCircumnavigate }) {
  notify = onNotify;
  circumnavigate = onCircumnavigate;
  ui = {
    panel: document.querySelector('#achievements'),
    list: document.querySelector('#achievements-list'),
    summary: document.querySelector('#achievements-summary'),
    japan: document.querySelector('#achievements-japan'),
    circum: document.querySelector('#achievements-circum'),
    navCircum: document.querySelector('#circum-button')
  };
  const start = () => { setAchievementsOpen(false); circumnavigate(); };
  ui.circum.addEventListener('click', start);
  ui.navCircum.addEventListener('click', start);
  document.querySelector('#achievements-button')?.addEventListener('click', (event) => { event.currentTarget.blur(); setAchievementsOpen(ui.panel.hidden); });
  document.querySelector('#achievements-close')?.addEventListener('click', () => setAchievementsOpen(false));
  ui.panel.addEventListener('click', (event) => { if (event.target === ui.panel) setAchievementsOpen(false); });
  renderPanel();
  addEventListener('pagehide', save);
}
