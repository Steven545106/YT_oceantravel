import { isWithinStampReach } from './stamp-reach.js';
import { normalizeAchievements, parseProgress } from './progress-data.js';
// Achievements: progress is saved in localStorage. Sailing all the way round Taiwan (every one of 16 compass sectors
// around the island visited within 60 km of its coast) unlocks Japan; sailing round Japan's main islands the same way
// then unlocks South and North Korea; collecting every Korean and North Korean stamp (both master badges) unlocks the
// Philippines. Until a country is unlocked, boats are turned back at its waters.
import { geoToWorld, worldToGeo } from './geo.js';
import { countryCode } from './regions.js';
const STORAGE_KEY = 'relax-achievements-v1';
const SECTORS = 16;
const COAST_RANGE_KM = 60;
export const JAPAN_BARRIER_KM = 12;     // how close to Japan's shore a boat may get while Japan is locked

const blank = () => ({ sectors: [], japanSectors: [], unlocked: {}, counters: { nightSeconds: 0, whales: 0, arrivals: 0, landmarks: [] } });
let data = blank();
let notify = () => {};
let circumnavigate = () => {};
let ui = null;

try {
  const saved = parseProgress(localStorage.getItem(STORAGE_KEY));
  if (saved) data = normalizeAchievements(saved);
} catch { /* private mode: progress simply isn't saved */ }

let saveTimer = 0;
// Merge with whatever is stored before writing: with the game open in two tabs (or a stale tab saving on close),
// a plain overwrite would wipe achievements earned in the other tab. Progress only ever grows.
function merge(stored) {
  if (!stored) return;
  stored = normalizeAchievements(stored);
  data.sectors = [...new Set([...data.sectors, ...(stored.sectors ?? [])])];
  data.japanSectors = [...new Set([...(data.japanSectors ?? []), ...(stored.japanSectors ?? [])])];
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

const DEFINITIONS = [
  { id: 'circumTaiwan', title: '環台一圈', description: '沿著台灣海岸航行一整圈（繞行 16 個方位，每個方位都要靠近海岸 60 公里內）。完成後解鎖日本。', target: SECTORS, progress: () => data.sectors.length, reward: '解鎖日本' },
  { id: 'firstWhale', title: '遇見鯨魚', description: '在海上遇見一隻鯨魚。', target: 1, progress: () => Math.min(1, data.counters.whales) },
  { id: 'nightSail', title: '夜航者', description: '在夜晚駕船航行累計 2 分鐘。', target: 120, progress: () => Math.min(120, Math.floor(data.counters.nightSeconds)), format: (v, t) => `${v} / ${t} 秒` },
  { id: 'autopilot', title: '自動導航抵達', description: '使用自動導航成功抵達一個目的地。', target: 1, progress: () => Math.min(1, data.counters.arrivals) },
  { id: 'sightseer', title: '景點達人', description: '航行到 8 個不同景點附近（內陸景點則是離它最近的海岸）。', target: 8, progress: () => Math.min(8, data.counters.landmarks.length) },
  { id: 'circumJapan', title: '環日本一圈', description: '解鎖日本後，沿著日本本土（北海道、本州、四國、九州）航行一整圈：繞行 16 個方位，每個方位都要靠近海岸 60 公里內。完成後解鎖韓國與北韓。', target: SECTORS, progress: () => data.japanSectors.length, reward: '解鎖韓國、北韓', requires: 'circumTaiwan' },
  { id: 'philippinesArrival', title: '踏上菲律賓', description: '解鎖菲律賓後，抵達菲律賓海岸 20 公里內。', target: 1, progress: () => (data.unlocked.philippinesArrival ? 1 : 0), locked: () => !isPhilippinesUnlocked(), lockedText: '先集滿韓國與北韓的所有印章才會開放。' },
  { id: 'japanArrival', title: '踏上日本', description: '解鎖日本後，抵達日本海岸 20 公里內。', target: 1, progress: () => (data.unlocked.japanArrival ? 1 : 0), requires: 'circumTaiwan' }
];

// Country master badges ("台灣達人" …), registered by the stamp book once it knows how many stamps each country has.
export function registerMasterBadges(countries, progress) {
  for (const { country, total } of countries) {
    const id = `master:${country}`;
    if (DEFINITIONS.some((entry) => entry.id === id)) continue;
    DEFINITIONS.push({ id, title: `${country}達人`, description: `集滿${country}所有景點的印章（共 ${total} 枚）。`, target: total, progress: () => progress(country) });
  }
  check();
  renderPanel();
}
export const isJapanUnlocked = () => !!data.unlocked.circumTaiwan;
export const isKoreaUnlocked = () => !!data.unlocked.circumJapan;
// the Philippines opens once both Korean master badges ("韓國達人", "北韓達人") are earned
const PHILIPPINES_KEYS = ['master:韓國', 'master:北韓'];
export const isPhilippinesUnlocked = () => PHILIPPINES_KEYS.every((id) => !!data.unlocked[id]);
const isLocked = (definition) => definition.locked ? definition.locked() : !!definition.requires && !data.unlocked[definition.requires];
// country (as a name or a land code) -> unlocked?, and the message shown when it is still locked
export function isCountryUnlocked(country) {
  const code = countryCode(country);
  return code === 'jp' ? isJapanUnlocked() : code === 'ph' ? isPhilippinesUnlocked() : code === 'kr' || code === 'kp' ? isKoreaUnlocked() : true;
}
export function lockMessage(country) {
  const code = countryCode(country);
  return code === 'jp' ? '日本尚未解鎖：先完成「環台一圈」' : code === 'ph' ? '菲律賓尚未解鎖：先集滿韓國與北韓的所有印章' : '韓國、北韓尚未解鎖：先完成「環日本一圈」';
}
const JAPAN_CENTRE = geoToWorld({ latitude: 36.2, longitude: 137.8 });

function unlock(id) {
  if (data.unlocked[id]) return;
  data.unlocked[id] = Date.now();
  const definition = DEFINITIONS.find((entry) => entry.id === id);
  save();
  const big = PHILIPPINES_KEYS.includes(id) && isPhilippinesUnlocked() ? '韓國、北韓印章全部集滿！菲律賓已解鎖'
    : { circumTaiwan: '環台一圈完成！日本已解鎖', circumJapan: '環日本一圈完成！韓國、北韓已解鎖' }[id];
  notify(big ?? `成就解鎖：${definition.title}`, big ? 'big' : 'normal');
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
    if (data.unlocked[definition.id]) continue;
    if (isLocked(definition)) continue;
    if (definition.id !== 'japanArrival' && definition.id !== 'philippinesArrival' && definition.progress() >= definition.target) unlock(definition.id);
  }
}

let sinceCheck = 0;
// called every frame with the boat's state; heavy work is throttled
export function trackAchievements({ delta, x, z, nearestLand, night, speed, landmarks }) {
  sinceCheck += delta;
  if (night && speed > .05) data.counters.nightSeconds += delta;
  if (sinceCheck < .5) return;
  sinceCheck = 0;
  // sector round Taiwan: bearing from the island's centre (the world origin), clockwise from north
  if (nearestLand.country === 'tw' && nearestLand.km < COAST_RANGE_KM && !data.unlocked.circumTaiwan) {
    const angle = (Math.atan2(x, -z) + Math.PI * 2) % (Math.PI * 2);
    const sector = Math.floor(angle / (Math.PI * 2 / SECTORS)) % SECTORS;
    if (!data.sectors.includes(sector)) { data.sectors.push(sector); renderPanel(); }
  }
  // sector round Japan's main islands (Okinawa and the Ryukyus, far to the south, don't count)
  if (isJapanUnlocked() && !data.unlocked.circumJapan && nearestLand.country === 'jp' && nearestLand.km < COAST_RANGE_KM && worldToGeo(x, z).latitude > 30.8) {
    const angle = (Math.atan2(x - JAPAN_CENTRE.x, -(z - JAPAN_CENTRE.y)) + Math.PI * 2) % (Math.PI * 2);
    const sector = Math.floor(angle / (Math.PI * 2 / SECTORS)) % SECTORS;
    if (!data.japanSectors.includes(sector)) { data.japanSectors.push(sector); renderPanel(); }
  }
  for (const item of landmarks ?? []) {
    if (data.counters.landmarks.includes(item.name)) continue;
    if (isCountryUnlocked(item.country) && isWithinStampReach(item,x,z)) { data.counters.landmarks.push(item.name); renderPanel(); }
  }
  if (isJapanUnlocked() && !data.unlocked.japanArrival && nearestLand.country === 'jp' && nearestLand.km < 20) unlock('japanArrival');
  if (isPhilippinesUnlocked() && !data.unlocked.philippinesArrival && nearestLand.country === 'ph' && nearestLand.km < 20) unlock('philippinesArrival');
  check();
  if ((saveTimer += .5) >= 5) { saveTimer = 0; save(); }
}

function renderPanel() {
  if (!ui) return;
  const japanText = isJapanUnlocked() ? '日本：已解鎖' : `日本：尚未解鎖（環台進度 ${data.sectors.length} / ${SECTORS}）`;
  const koreaText = isKoreaUnlocked() ? '韓國、北韓：已解鎖' : `韓國、北韓：尚未解鎖（環日本進度 ${data.japanSectors.length} / ${SECTORS}）`;
  const stamps = PHILIPPINES_KEYS.map((id) => DEFINITIONS.find((entry) => entry.id === id)).filter(Boolean);
  const stampText = stamps.length ? `（韓國、北韓印章 ${stamps.reduce((sum, entry) => sum + Math.min(entry.progress(), entry.target), 0)} / ${stamps.reduce((sum, entry) => sum + entry.target, 0)}）` : '';
  const philippinesText = isPhilippinesUnlocked() ? '菲律賓：已解鎖' : `菲律賓：尚未解鎖${stampText}`;
  ui.japan.textContent = `${japanText}　·　${koreaText}　·　${philippinesText}`;
  ui.japan.dataset.state = isJapanUnlocked() && isKoreaUnlocked() && isPhilippinesUnlocked() ? 'open' : 'locked';
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
    text.textContent = locked ? definition.lockedText ?? '先完成「環台一圈」才會開放。' : definition.description;
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
