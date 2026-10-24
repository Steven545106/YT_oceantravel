import { isCountryUnlocked, lockMessage } from './achievements.js';
import { PLACE_TYPE_WEIGHT, getPlaceIndex, hasCountryPlaces, loadCountryPlaces, normalizeName, parseNavQuery, stripAdminSuffix } from './places.js';
import { navCancel, navForm, navInput, navSuggest, runNavigation, stopAutopilot } from './nav.js';

// Grouped suggestion list: one section per country, best matches first.
const PLACE_TYPE_NAMES = { ADM1: '行政區', ADM2: '行政區', PPLC: '首都', PPLA: '市', PPLA2: '市', ISL: '島', CAPE: '岬', LTHSE: '燈塔', BAY: '灣', HBR: '港', PRT: '港' };
const SUGGEST_TYPES = new Set(['ADM1', 'ADM2', 'PPLC', 'PPLA', 'PPLA2', 'ISL', 'CAPE', 'LTHSE', 'BAY', 'HBR', 'PRT']);
const SUGGEST_PER_COUNTRY = 6;
let suggestItems = [], suggestActive = -1;
function suggestPlaces(text) {
  const { country, placeText } = parseNavQuery(text);
  // once a country is typed, fetch its full place list and show the list again with it
  if (country && !hasCountryPlaces(country)) loadCountryPlaces(country).then(() => { if (hasCountryPlaces(country) && navInput.value === text && document.activeElement === navInput) renderSuggestions(); });
  const query = normalizeName(placeText);
  const groups = new Map();
  const add = (entry, score) => {
    if (!groups.has(entry.country)) groups.set(entry.country, []);
    groups.get(entry.country).push({ entry, score });
  };
  for (const entry of getPlaceIndex()) {
    if (country && entry.country !== country) continue;
    if (!SUGGEST_TYPES.has(entry.place.type)) continue;
    if (entry.country === '台灣' && entry.place.type === 'ADM1' && !/[縣市]$/.test(entry.place.name)) continue;
    const weight = (PLACE_TYPE_WEIGHT[entry.place.type] ?? 10) * .2 + Math.log10((entry.place.pop ?? 0) + 1);
    if (!query) { if (entry.place.type === 'ADM1' || entry.place.type === 'PPLC') add(entry, weight); continue; }
    let score = 0;
    for (let i = 0; i < entry.full.length; i++) {
      if (entry.full[i] === query || entry.stripped[i] === stripAdminSuffix(query)) score = Math.max(score, 100);
      else if (entry.full[i].startsWith(query)) score = Math.max(score, 60);
      else if (entry.full[i].includes(query)) score = Math.max(score, 30);
    }
    if (score) add(entry, score + weight);
  }
  return [...groups.entries()].map(([name, list]) => [name, list.sort((a, b) => b.score - a.score).slice(0, SUGGEST_PER_COUNTRY).map((x) => x.entry)]);
}
function renderSuggestions() {
  const groups = suggestPlaces(navInput.value);
  navSuggest.replaceChildren();
  suggestItems = [];
  suggestActive = -1;
  const { placeText } = parseNavQuery(navInput.value);
  const needle = placeText.trim();
  if (!groups.length) {
    const empty = document.createElement('div');
    empty.className = 'nav-suggest-empty';
    empty.textContent = '找不到符合的地名';
    navSuggest.append(empty);
  }
  for (const [country, entries] of groups) {
    const heading = document.createElement('div');
    heading.className = 'nav-suggest-group';
    heading.textContent = isCountryUnlocked(country) ? country : `${country}　🔒 ${lockMessage(country)}`;
    navSuggest.append(heading);
    for (const entry of entries) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'nav-suggest-item';
      item.setAttribute('role', 'option');
      const name = document.createElement('span');
      const at = needle ? entry.place.name.toLowerCase().indexOf(needle.toLowerCase()) : -1;
      if (at >= 0) {
        name.append(entry.place.name.slice(0, at));
        const mark = document.createElement('mark');
        mark.textContent = entry.place.name.slice(at, at + needle.length);
        name.append(mark, entry.place.name.slice(at + needle.length));
      } else name.textContent = entry.place.name;
      const kind = document.createElement('small');
      kind.textContent = PLACE_TYPE_NAMES[entry.place.type] ?? '';
      item.append(name, kind);
      item.addEventListener('mousedown', (event) => event.preventDefault());
      item.addEventListener('click', () => chooseSuggestion(entry));
      navSuggest.append(item);
      suggestItems.push({ item, entry });
    }
  }
  navSuggest.hidden = false;
  navInput.setAttribute('aria-expanded', 'true');
}
function hideSuggestions() {
  navSuggest.hidden = true;
  navInput.setAttribute('aria-expanded', 'false');
}
function chooseSuggestion(entry) {
  navInput.value = `${entry.country}-${entry.place.name}`;
  hideSuggestions();
  navInput.blur();
  runNavigation(navInput.value);
}
function moveSuggestion(step) {
  if (!suggestItems.length) return;
  suggestActive = (suggestActive + step + suggestItems.length) % suggestItems.length;
  suggestItems.forEach(({ item }, index) => item.classList.toggle('is-active', index === suggestActive));
  suggestItems[suggestActive].item.scrollIntoView({ block: 'nearest' });
}
navInput.addEventListener('focus', renderSuggestions);
navInput.addEventListener('input', renderSuggestions);
navInput.addEventListener('blur', hideSuggestions);
navInput.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown') { event.preventDefault(); if (navSuggest.hidden) renderSuggestions(); moveSuggestion(1); }
  else if (event.key === 'ArrowUp') { event.preventDefault(); moveSuggestion(-1); }
  else if (event.key === 'Enter' && suggestActive >= 0) { event.preventDefault(); chooseSuggestion(suggestItems[suggestActive].entry); }
  else if (event.key === 'Escape') hideSuggestions();
});
navForm.addEventListener('submit', (event) => { event.preventDefault(); hideSuggestions(); runNavigation(navInput.value); navInput.blur(); });
navCancel.addEventListener('click', () => stopAutopilot('已取消自動導航'));
