import { fetchJson, markLoaded } from './data-loader.js';
import { isOnLand } from './land.js';
import { COUNTRIES } from './regions.js';

// Place names come in two parts (see scripts/build_regions.py): places/index.json, loaded at start-up, has every
// country's regions, cities, harbours and lighthouses; a country's own file adds the rest (islets, bays, capes,
// villages) when its coast streams in near the boat or jet, or when a search names that country.
const placeIndexData = await fetchJson('places/index.json');
markLoaded('places');

// ---------------------------------------------------------------------------
// Auto navigation: "country-place" -> nearest open water -> sea route around
// every island -> autopilot.
// ---------------------------------------------------------------------------

const CHAR_MAP = {
  臺: '台', 国: '國', 縄: '繩', 县: '縣', 県: '縣', 绳: '繩', 冲: '沖', 东: '東', 叶: '葉', 岛: '島', 湾: '灣', 韩: '韓', 鲜: '鮮',
  尔: '爾', 济: '濟', 済: '濟', 庆: '慶', 罗: '羅', 汉: '漢', 壌: '壤', 陵: '陵', 欝: '鬱', 郁: '鬱', 独: '獨', 竹: '竹',
  滨: '濱', 浜: '濱', 龙: '龍', 竜: '龍', 宫: '宮', 冈: '岡', 广: '廣', 広: '廣', 关: '關', 関: '關', 泽: '澤',
  沢: '澤', 区: '區', 镇: '鎮', 乡: '鄉', 头: '頭', 门: '門', 鸟: '鳥', 与: '與', 隠: '隱', 崎: '崎', 荣: '榮',
  栄: '榮', 齐: '齊', 斎: '齋', 蔵: '藏', 亀: '龜', 桜: '櫻', 温: '溫', 总: '總', 総: '總', 台: '台'
};
export const normalizeName = (text) => [...String(text).toLowerCase().replace(/[\s'’`\-_.・·()（）]/g, '')]
  .map((ch) => CHAR_MAP[ch] ?? ch).join('');
export const stripAdminSuffix = (name) => (name.length > 1 ? name.replace(/(市|縣|町|村|區|都|府|鎮|鄉|郡|道)$/, '') : name);
export const PLACE_TYPE_WEIGHT = { ADM1: 100, PPLC: 95, PPLA: 85, ADM2: 80, PPLA2: 70, ADM3: 55, PPLA3: 50, ISL: 45, ISLS: 40, PPLA4: 40, CAPE: 35, LTHSE: 35, BAY: 33, HBR: 30, PRT: 30, PPL: 20 };

export const placeCountries = COUNTRIES.map((country) => ({
  country: country.name, code: country.code, aliasKeys: new Set(country.aliases.map(normalizeName)), places: placeIndexData[country.code] ?? []
}));
let placeIndex = null;
// bumped whenever the place list changes, for caches built from it (map clicks)
export let placesVersion = 0;
export function invalidatePlaceIndex() { placeIndex = null; placesVersion++; }

// A country's full place list, merged in once: places already listed keep their objects (night lights hold them),
// sights added by landmarks.js stay, and listeners hear the newly added places (to label them).
const fullLoads = new Map(), fullLoaded = new Set();
const placeListeners = [];
export const onPlacesAdded = (listener) => { placeListeners.push(listener); };
export const hasCountryPlaces = (countryOrCode) => fullLoaded.has(placeCountries.find((item) => item.code === countryOrCode || item.country === countryOrCode)?.code);
export function loadCountryPlaces(countryOrCode) {
  const entry = placeCountries.find((item) => item.code === countryOrCode || item.country === countryOrCode);
  if (!entry) return Promise.resolve();
  if (!fullLoads.has(entry.code)) {
    const file = COUNTRIES.find((country) => country.code === entry.code).places;
    fullLoads.set(entry.code, fetchJson(file).then(({ places }) => {
      const known = new Set(entry.places.map((place) => `${place.type}|${place.name}|${place.lat}|${place.lon}`));
      const added = places.filter((place) => !known.has(`${place.type}|${place.name}|${place.lat}|${place.lon}`));
      entry.places.push(...added);
      fullLoaded.add(entry.code);
      invalidatePlaceIndex();
      for (const listener of placeListeners) listener(entry, added);
    }).catch((error) => { fullLoads.delete(entry.code); console.error(error); }));
  }
  return fullLoads.get(entry.code);
}
export function getPlaceIndex() {
  if (placeIndex) return placeIndex;
  placeIndex = [];
  for (const { country, places } of placeCountries) {
    for (const place of places) {
      const full = [place.name, ...place.aliases].map(normalizeName).filter(Boolean);
      placeIndex.push({ country, place, full, stripped: full.map(stripAdminSuffix) });
    }
  }
  return placeIndex;
}

export function parseNavQuery(text) {
  const trimmed = text.trim();
  const split = trimmed.match(/^(.+?)\s*[-－–—−:：/／]\s*(.+)$/) || trimmed.match(/^(\S+)\s+(.+)$/);
  if (split) {
    const countryKey = normalizeName(split[1]);
    const match = placeCountries.find(({ aliasKeys }) => aliasKeys.has(countryKey));
    if (match) return { country: match.country, placeText: split[2].trim() };
  }
  return { country: null, placeText: trimmed };
}

export function searchPlace(text) {
  const { country, placeText } = parseNavQuery(text);
  const query = normalizeName(placeText);
  if (!query) return null;
  const strippedQuery = stripAdminSuffix(query);
  let best = null;
  for (const entry of getPlaceIndex()) {
    if (country && entry.country !== country) continue;
    let score = 0;
    for (let i = 0; i < entry.full.length; i++) {
      if (entry.full[i] === query) score = Math.max(score, 100);
      else if (entry.stripped[i] === strippedQuery) score = Math.max(score, 85);
      else if (entry.full[i].startsWith(query)) score = Math.max(score, 50);
      else if (query.length > 1 && entry.full[i].includes(query)) score = Math.max(score, 25);
    }
    if (!score) continue;
    score += (PLACE_TYPE_WEIGHT[entry.place.type] ?? 10) * .2 + Math.log10((entry.place.pop ?? 0) + 1);
    if (!best || score > best.score) best = { score, entry };
  }
  return best?.entry ?? null;
}

export const isLandAt = isOnLand;
