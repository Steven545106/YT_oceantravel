import { COUNTRIES } from './regions.js';
import { hasAchievement } from './achievements.js';
import { geoToWorld } from './geo.js';
import { setMapMarkers } from './labels.js';
import { TELEPORT_REACH_KM, teleportHooks, teleports, teleportSiteProblem } from './teleports.js';

// Teleport points in their window (P), on the chart (V) and on the world map (Tab); see teleports.js.
// ?teleports=all opens every country's point without its master badge (for testing).
const OPEN_ALL = new URLSearchParams(location.search).get('teleports') === 'all';
export const teleportUnlocked = (country) => OPEN_ALL || hasAchievement(`master:${country.name}`);

// The points that can be used now, in world units.
export function teleportMarkers() {
  return COUNTRIES.filter((country) => teleports.get(country.code) && teleportUnlocked(country)).map((country) => {
    const point = teleports.get(country.code), world = geoToWorld({ latitude: point.lat, longitude: point.lon });
    return { code: country.code, name: country.name, x: world.x, z: world.y, heading: point.heading };
  });
}
export const travelToTeleport = (code) => {
  const marker = teleportMarkers().find((item) => item.code === code);
  if (marker) teleportHooks.travel?.(marker);
};
const refreshChartMarkers = () => setMapMarkers('teleport', teleportMarkers().map((marker) => ({ text: `⌖ ${marker.name}傳送點`, x: marker.x, z: marker.z, priority: 900 })));

const formatPoint = (point) => `${Math.abs(point.lat).toFixed(2)}°${point.lat < 0 ? 'S' : 'N'} ${Math.abs(point.lon).toFixed(2)}°${point.lon < 0 ? 'W' : 'E'}`;

const REGION_NAMES = { 'east-asia': '東亞', 'southeast-asia': '東南亞', 'south-asia': '南亞', 'middle-east': '中東', 'central-asia': '中亞與高加索', oceania: '大洋洲' };
// Which regions the player opened or closed by hand; the rest follow the boat (its own region open, others closed).
const FOLDS_KEY = 'relax-teleport-folds-v1';
let folds = {};
try { folds = JSON.parse(localStorage.getItem(FOLDS_KEY) ?? '{}') ?? {}; } catch { folds = {}; }
const saveFolds = () => { try { localStorage.setItem(FOLDS_KEY, JSON.stringify(folds)); } catch { /* private mode */ } };
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };

// The window: a "here" box for the countries whose coast is within reach of the boat (the only place a point is set),
// then every set point as a chip, grouped by world region; click a chip to go there.
// `here(code)` describes the boat now: { fighter, onLand, countryKm (to that country's coast), lat, lon, heading };
// `boatCountry()` is the country of the nearest coast, whose region opens by default.
export function initTeleportPanel({ list, here, boatCountry, notify }) {
  function render() {
    refreshChartMarkers();
    const open = COUNTRIES.filter(teleportUnlocked);
    if (!open.length) {
      list.replaceChildren(el('p', 'teleport-empty', '還沒有國家的「達人」成就：集滿一個國家所有景點的印章，就能設定那個國家的傳送點。'));
      return;
    }
    const parts = [el('p', 'teleport-label', `這裡（船 ${TELEPORT_REACH_KM} km 內）`)];
    const nearby = open.filter((country) => here(country.code).countryKm <= TELEPORT_REACH_KM);
    if (!nearby.length) parts.push(el('p', 'teleport-empty', `附近 ${TELEPORT_REACH_KM} km 內沒有可設定的國家。開到已取得達人成就的國家沿海，就能在這裡設定。`));
    for (const country of nearby) {
      const point = teleports.get(country.code);
      const box = el('div', 'teleport-here');
      const text = el('div');
      text.append(el('b', '', country.name), el('small', '', point ? `已設定 · ${formatPoint(point)}` : '尚未設定'));
      const set = el('button', '', point ? '改到這裡' : '設在這裡');
      set.type = 'button'; set.dataset.teleportSet = country.code;
      box.append(text, set);
      parts.push(box);
    }
    parts.push(el('p', 'teleport-label', '傳送點 · 點一下傳送'));
    const boatRegion = COUNTRIES.find((country) => country.code === boatCountry())?.placeGroup;
    const regions = [...new Set(COUNTRIES.map((country) => country.placeGroup))];
    for (const region of regions) {
      const members = COUNTRIES.filter((country) => country.placeGroup === region);
      const shown = members.filter(teleportUnlocked);
      if (!shown.length) continue;
      const isOpen = folds[region] ?? region === boatRegion;
      const group = el('section', 'teleport-group');
      const head = el('button', 'teleport-group-head');
      head.type = 'button'; head.dataset.teleportRegion = region; head.setAttribute('aria-expanded', String(isOpen));
      head.append(el('span', 'teleport-chevron', isOpen ? '▾' : '▸'), el('b', '', REGION_NAMES[region] ?? region),
        el('small', '', `${shown.filter((country) => teleports.get(country.code)).length} / ${members.length}`));
      group.append(head);
      if (isOpen) {
        const chips = el('div', 'teleport-chips');
        for (const country of shown) {
          const point = teleports.get(country.code), mine = nearby.includes(country);
          const chip = el('button', `teleport-chip${point ? '' : ' is-unset'}${mine ? ' is-here' : ''}`, `${country.name}${mine ? ' · 這裡' : ''}`);
          chip.type = 'button';
          if (point) { chip.dataset.teleportGo = country.code; chip.title = `${formatPoint(point)}　點一下傳送`; }
          else { chip.dataset.teleportUnset = country.code; chip.title = `尚未設定：開到${country.name}沿海 ${TELEPORT_REACH_KM} km 內設定`; }
          chips.append(chip);
        }
        group.append(chips);
      }
      parts.push(group);
    }
    parts.push(el('p', 'teleport-legend', '實線：已設定，點一下傳送　虛線：已取得達人成就、尚未設定'));
    list.replaceChildren(...parts);
  }
  list.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    button.blur();
    if (button.dataset.teleportRegion) {
      folds[button.dataset.teleportRegion] = button.getAttribute('aria-expanded') !== 'true';
      saveFolds();
      render();
      return;
    }
    const code = button.dataset.teleportSet ?? button.dataset.teleportGo ?? button.dataset.teleportUnset;
    const country = COUNTRIES.find((item) => item.code === code);
    if (!country) return;
    if (button.dataset.teleportGo) { travelToTeleport(country.code); return; }
    if (button.dataset.teleportUnset) { notify(`${country.name}還沒有傳送點：開到${country.name}沿海 ${TELEPORT_REACH_KM} 公里內，在上方「這裡」設定`); return; }
    const spot = here(country.code);
    const problem = teleportSiteProblem({ name: country.name, unlocked: teleportUnlocked(country), ...spot });
    if (problem) { notify(problem); return; }
    const replaced = !!teleports.get(country.code);
    teleports.set(country.code, { lat: spot.lat, lon: spot.lon, heading: spot.heading });
    notify(`${country.name}傳送點已${replaced ? '改到' : '設在'}這裡`);
  });
  teleports.onChange(render);
  render();
  return { render };
}
