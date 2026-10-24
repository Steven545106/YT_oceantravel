import { normalizeJourney, parseProgress } from './progress-data.js';
// Voyage log + stamp book. Progress is saved in localStorage: sailing distance and time, seas and coasts visited, whale sightings,
// a short timeline, and a stamp for every sight the boat first reaches (with a little introduction for each).
import { isWithinStampReach } from './stamp-reach.js';
import { isCountryEarned, isCountryUnlocked, lockMessage, registerMasterBadges } from './achievements.js';
import { COUNTRY_ORDER, countryName } from './regions.js';

export const hasStamp=name=>!!data.stamps[name];

export { COUNTRY_ORDER };

const STORAGE_KEY = 'relax-journey-v1';
const blank = () => ({ distanceKm: 0, seconds: 0, whales: 0, seas: {}, countries: {}, stamps: {}, masters: {}, specials: {}, log: [] });
let data = blank();
let notify = () => {};
let ui = null;
let targets = [];
try {
  const saved = parseProgress(localStorage.getItem(STORAGE_KEY));
  if (saved) data = normalizeJourney(saved);
} catch { /* private mode */ }
// Merge with the stored copy before writing, so two open tabs never wipe each other's stamps and log (progress only grows).
function merge(stored) {
  if (!stored) return;
  stored = normalizeJourney(stored);
  for (const key of ['distanceKm', 'seconds', 'whales']) data[key] = Math.max(data[key] ?? 0, stored[key] ?? 0);
  for (const key of ['seas', 'countries', 'stamps', 'masters', 'specials']) data[key] = { ...(stored[key] ?? {}), ...data[key] };
  const seen = new Set(), log = [];
  for (const entry of [...(stored.log ?? []), ...data.log].sort((a, b) => a.t - b.t)) { const id = entry.t + entry.text; if (!seen.has(id)) { seen.add(id); log.push(entry); } }
  data.log = log.slice(-80);
}
const save = () => {
  try { merge(parseProgress(localStorage.getItem(STORAGE_KEY))); localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
};
addEventListener('storage', (event) => { if (event.key === STORAGE_KEY) { try { merge(parseProgress(event.newValue)); } catch { /* ignore */ } } });

const dateText = (t) => new Date(t).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const dayText = (t) => new Date(t).toLocaleDateString('zh-TW', { year: 'numeric', month: 'numeric', day: 'numeric' });
const durationText = (s) => { const m = Math.floor(s / 60); return m < 60 ? `${m} 分` : `${Math.floor(m / 60)} 小時 ${m % 60} 分`; };

// A big red seal thumps down in the middle of the screen when a stamp is earned, then fades away.
let sealTimer = 0;
const sealQueue=[];let sealShowing=false;
function showStampSeal(target){sealQueue.push(target);if(!sealShowing)nextStampSeal();}
function nextStampSeal(){
  const target=sealQueue.shift();sealShowing=!!target;if(target)renderStampSeal(target);
}
function renderStampSeal(target) {
  let overlay = document.querySelector('#stamp-seal-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'stamp-seal-overlay';
    overlay.className = 'stamp-seal-overlay';
    overlay.setAttribute('aria-live', 'polite');
    document.body.append(overlay);
  }
  const name = (target.seal ?? target.name).slice(0, 4);
  overlay.replaceChildren();
  const seal = document.createElement('div');
  seal.className = `big-seal${name.length > 2 ? ' is-long' : ''}${target.master ? ' is-master' : ''}${target.pink ? ' is-pink' : ''}`;
  const text = document.createElement('span'); text.textContent = name; seal.append(text);
  const caption = document.createElement('p'); caption.textContent = target.caption ?? (target.master ? `恭喜！獲得「${target.name}」` : `蓋章成功・${target.name}`);
  overlay.append(seal, caption);
  overlay.hidden = false;
  overlay.classList.remove('is-showing'); void overlay.offsetWidth; overlay.classList.add('is-showing');
  clearTimeout(sealTimer);
  sealTimer = setTimeout(() => { overlay.hidden = true; overlay.classList.remove('is-showing');nextStampSeal(); }, 3200);
}

export function logEvent(text) {
  data.log.push({ t: Date.now(), text });
  if (data.log.length > 80) data.log.shift();
  render();
}
// Special stamps that aren't tied to a place, such as meeting the rare pink whale.
export const SPECIAL_STAMPS = [{ id: 'pinkWhale', name: '偶遇粉鯨', seal: '粉鯨', hint: '每次抵達景點附近，都有機率遇見罕見的粉紅色藍鯨。', intro: '傳說中的粉紅色藍鯨，體長可達 30 公尺，極少在海面現身。能遇見牠的航海人，據說會一路順風。' }];
export function recordSpecialStamp(id) {
  const special = SPECIAL_STAMPS.find((entry) => entry.id === id);
  if (!special || data.specials[id]) return;
  data.specials[id] = Date.now();
  notify(`蓋章：${special.name}`, 'normal');
  showStampSeal({ name: special.seal, pink: true, caption: `特別印章・${special.name}` });
  logEvent(`獲得特別印章「${special.name}」`);
  save();
}
const visiting = new Set();
let onVisit = () => {};
export function recordWhale() { data.whales++; logEvent('遇見一隻鯨魚'); save(); }

let last = null, accumulated = 0, saveClock = 0;
// called every frame from the main loop; heavy checks run twice a second
// Collecting every stamp of a country earns its master badge ("台灣達人" …), shown in the stamp book and as an achievement.
const countryTargets = (country) => targets.filter((target) => target.country === country);
const countryProgress = (country) => countryTargets(country).filter((target) => data.stamps[target.name]).length;
function checkMaster(country, celebrate) {
  const all = countryTargets(country);
  if (!all.length || data.masters[country] || countryProgress(country) < all.length) return;
  data.masters[country] = Date.now();
  logEvent(`集滿${country}所有印章，成為「${country}達人」`);
  save();
  if (celebrate) setTimeout(() => { showStampSeal({ name: `${country}達人`, master: true }); notify(`集滿${country}全部 ${all.length} 枚印章！獲得「${country}達人」`, 'big'); }, 3400);
}
let mastersRegistered = false;
// Called once the sights are placed (and again by trackJourney), so the stamp book and master badges show even when
// the game starts in the fighter, which never runs trackJourney.
export function setStampTargets(stampTargets) {
  targets = stampTargets;
  if (!mastersRegistered && targets.length) {
    mastersRegistered = true;
    const countries = COUNTRY_ORDER.filter((country) => countryTargets(country).length);
    registerMasterBadges(countries.map((country) => ({ country, total: countryTargets(country).length })), countryProgress);
    for (const country of countries) checkMaster(country, false);   // progress made before badges existed
    render();
  }
}
export function trackJourney({ delta, x, z, kmPerUnit, speed, seaName, nearestLand, stampTargets }) {
  setStampTargets(stampTargets);
  if (last) {
    const step = Math.hypot(x - last.x, z - last.z);
    if (step < 5) { data.distanceKm += step * kmPerUnit; if (speed > .02) data.seconds += delta; }
  }
  last = { x, z };
  accumulated += delta;
  if (accumulated < .5) return;
  accumulated = 0;
  const sea = seaName();
  if (sea && !data.seas[sea]) { data.seas[sea] = Date.now(); logEvent(`首次駛入「${sea}」`); }
  if (nearestLand.km < 30 && !data.countries[nearestLand.country]) {
    data.countries[nearestLand.country] = Date.now();
    logEvent(`第一次靠近${countryName(nearestLand.country)}海岸`);
  }
  for (const target of targets) {
    const inside = isCountryEarned(target.country) && isWithinStampReach(target,x,z);
    if (inside && !visiting.has(target.name)) { visiting.add(target.name); onVisit(target); }   // every arrival counts, stamped or not
    else if (!inside) visiting.delete(target.name);
    if (data.stamps[target.name]) continue;
    if (inside) {
      data.stamps[target.name] = Date.now();
      notify(`蓋章：${target.name}`, 'normal');
      showStampSeal(target);
      checkMaster(target.country, true);
      logEvent(`在${target.name}蓋章`);
      save();
    }
  }
  if ((saveClock += .5) >= 5) { saveClock = 0; save(); }
  if (ui && !ui.panel.hidden) render();
}

let tab = 'journal', openStamp = null;
function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }

function renderJournal() {
  const wrap = el('div', 'journal');
  const stats = el('div', 'journal-stats');
  const stampCount = Object.keys(data.stamps).length;
  for (const [label, value] of [['航行距離', `${data.distanceKm.toFixed(0)} km`], ['航行時間', durationText(data.seconds)], ['遇見鯨魚', `${data.whales} 次`], ['到訪海域', `${Object.keys(data.seas).length} 處`], ['集章', `${stampCount} / ${targets.length || '—'}`]]) {
    const cell = el('div', 'journal-stat');
    cell.append(el('b', '', value), el('span', '', label));
    stats.append(cell);
  }
  wrap.append(stats);
  const seas = Object.keys(data.seas);
  wrap.append(el('h3', '', '到訪的海域與海岸'));
  const chips = el('div', 'journal-chips');
  for (const name of seas) chips.append(el('span', 'journal-chip', name));
  for (const code of Object.keys(data.countries)) chips.append(el('span', 'journal-chip is-coast', `${countryName(code)}海岸`));
  if (!chips.children.length) chips.append(el('span', 'journal-empty', '還沒有紀錄，出海去吧！'));
  wrap.append(chips);
  wrap.append(el('h3', '', '最近的紀錄'));
  const timeline = el('ul', 'journal-log');
  for (const entry of data.log.slice(-14).reverse()) { const li = el('li'); li.append(el('time', '', dateText(entry.t)), el('span', '', entry.text)); timeline.append(li); }
  if (!timeline.children.length) timeline.append(el('li', 'journal-empty', '尚無紀錄'));
  wrap.append(timeline);
  return wrap;
}

function renderStamps() {
  const wrap = el('div', 'stamps');
  const target = targets.find((entry) => entry.name === openStamp);
  const countries = [...COUNTRY_ORDER, ...new Set(targets.map((entry) => entry.country))].filter((country, i, list) => list.indexOf(country) === i && countryTargets(country).length);
  for (const country of countries) {
    const list = countryTargets(country), done = countryProgress(country), master = data.masters[country];
    const head = el('div', 'stamp-group-head');
    head.append(el('h3', '', country), el('span', 'stamp-group-count', `${done} / ${list.length}`));
    const badge = el('span', `stamp-master${master ? ' is-earned' : ''}`, master ? `🏅 ${country}達人` : `${country}達人（集滿解鎖）`);
    if (!isCountryEarned(country)) badge.textContent = `🔒 ${lockMessage(country)}`;
    head.append(badge);
    const bar = el('div', 'stamp-group-bar'); const fill = el('span'); fill.style.width = `${done / list.length * 100}%`; bar.append(fill);
    const grid = el('div', 'stamp-grid');
    for (const entry of list) {
      const stamped = data.stamps[entry.name];
      const card = el('button', `stamp${stamped ? ' is-stamped' : ''}${openStamp === entry.name ? ' is-open' : ''}`);
      card.type = 'button';
      card.append(el('span', 'stamp-seal', stamped ? (entry.seal ?? entry.name).slice(0, 2) : '？'), el('span', 'stamp-name', entry.name), el('small', '', stamped ? dayText(stamped) : '未到訪'));
      card.addEventListener('click', () => { openStamp = openStamp === entry.name ? null : entry.name; render(); });
      grid.append(card);
    }
    const group = el('section', 'stamp-group');
    group.append(head, bar, grid);
    if (target && target.country === country) group.append(renderStampDetail(target));   // the details open right under their own country
    wrap.append(group);
  }
  // special stamps
  const specialHead = el('div', 'stamp-group-head');
  specialHead.append(el('h3', '', '特別印章'), el('span', 'stamp-group-count', `${SPECIAL_STAMPS.filter((entry) => data.specials[entry.id]).length} / ${SPECIAL_STAMPS.length}`));
  const specialGrid = el('div', 'stamp-grid');
  for (const special of SPECIAL_STAMPS) {
    const got = data.specials[special.id];
    const card = el('button', `stamp is-special${got ? ' is-stamped' : ''}${openStamp === special.id ? ' is-open' : ''}`); card.type = 'button';
    card.append(el('span', 'stamp-seal', got ? special.seal : '？'), el('span', 'stamp-name', special.name), el('small', '', got ? dayText(got) : '未遇見'));
    card.addEventListener('click', () => { openStamp = openStamp === special.id ? null : special.id; render(); });
    specialGrid.append(card);
  }
  const specialGroup = el('section', 'stamp-group');
  specialGroup.append(specialHead, specialGrid);
  const openSpecial = SPECIAL_STAMPS.find((entry) => entry.id === openStamp);
  if (openSpecial) {
    const detail = el('div', 'stamp-detail');
    detail.append(el('h3', '', openSpecial.name), el('p', '', data.specials[openSpecial.id] ? openSpecial.intro : openSpecial.hint));
    if (data.specials[openSpecial.id]) detail.append(el('p', 'journal-empty', `獲得日期：${dayText(data.specials[openSpecial.id])}`));
    specialGroup.append(detail);
  }
  wrap.append(specialGroup);
  if (!target && !openSpecial) wrap.append(el('p', 'journal-empty', '點一枚印章看景點介紹與前往方式。集滿一個國家的所有印章，就能獲得該國的「達人」徽章。'));
  return wrap;
}

function renderStampDetail(target) {
  const detail = el('div', 'stamp-detail');
  {
    const stamped = data.stamps[target.name];
    detail.append(el('h3', '', target.name));
    if (!stamped) {
      const locked = !isCountryUnlocked(target.country);
      detail.append(el('p', '', locked ? `🔒 ${lockMessage(target.country)}，才能前往蓋章。`
        : `尚未到訪。駛入畫面中${target.name}模型周圍約 6 公里的海域即可集章。也可使用下方自動導航，抵達外海集章點（約 2 公里內）自動蓋章。航行畫面與海圖上的「⚑」會標示集章點。`));
      const where = el('p', 'journal-empty'); where.textContent = `位置：${target.country}（${Math.abs(target.lat).toFixed(3)}°N、${Math.abs(target.lon).toFixed(3)}°E）`; detail.append(where);
      if (!locked) {
        const go = el('button', 'journey-go', `自動導航前往 ${target.name}`); go.type = 'button';
        go.addEventListener('click', () => {
          const input = document.querySelector('#nav-input');
          if (!input) return;
          input.value = `${target.country}-${target.name}`;
          setJourneyOpen(false);
          input.form?.requestSubmit();
        });
        detail.append(go);
      }
    }
    else {
      detail.append(el('p', '', target.intro));
      const facts = el('ul', 'stamp-facts');
      if (target.height) { const li = el('li'); li.textContent = `高度：約 ${target.height} 公尺`; facts.append(li); }
      const where = el('li'); where.textContent = `位置：${target.country}（${Math.abs(target.lat).toFixed(3)}°${target.lat >= 0 ? 'N' : 'S'}、${Math.abs(target.lon).toFixed(3)}°${target.lon >= 0 ? 'E' : 'W'}）`; facts.append(where);
      const when = el('li'); when.textContent = `蓋章日期：${dayText(stamped)}`; facts.append(when);
      detail.append(facts);
    }
  }
  return detail;
}

function render() {
  if (!ui || ui.panel.hidden) return;
  ui.body.replaceChildren(tab === 'journal' ? renderJournal() : renderStamps());
  ui.tabs.forEach((button) => button.classList.toggle('is-active', button.dataset.tab === tab));
}

export function setJourneyOpen(open, which) {
  if (!ui) return;
  if (which) tab = which;
  ui.panel.hidden = !open;
  if (open) render();
}
export const journeyOpen = () => !!ui && !ui.panel.hidden;

export function initJourney({ onNotify, onVisit: visitHandler }) {
  notify = onNotify;
  if (visitHandler) onVisit = visitHandler;
  ui = { panel: document.querySelector('#journey'), body: document.querySelector('#journey-body'), tabs: [...document.querySelectorAll('[data-tab]')] };
  document.querySelector('#journey-button')?.addEventListener('click', (event) => { event.currentTarget.blur(); setJourneyOpen(ui.panel.hidden); });
  document.querySelector('#journey-close')?.addEventListener('click', () => setJourneyOpen(false));
  ui.panel.addEventListener('click', (event) => { if (event.target === ui.panel) setJourneyOpen(false); });
  ui.tabs.forEach((button) => button.addEventListener('click', () => { tab = button.dataset.tab; render(); }));
  addEventListener('pagehide', save);
}
