import { fetchJson, markLoaded } from './data-loader.js';
import { COUNTRIES, REGIONS } from './regions.js';
import { worldToGeo } from './geo.js';

// Place names come in two parts (see scripts/build_regions.py): the index, one file per world region
// (places/index-<region>.json), has the countries' regions, cities, harbours and lighthouses (labels, night lights,
// the world map); a country's own file adds the rest (islets, bays, capes, villages) when its coast streams in near the
// boat or jet. Nothing here holds up the start: loadPlaceIndexes() fetches the region nearest the vehicle first and
// the others behind it.
// how much a place type counts when places compete for a label or a map tooltip
export const PLACE_TYPE_WEIGHT = { ADM1: 100, PPLC: 95, PPLA: 85, ADM2: 80, PPLA2: 70, ADM3: 55, PPLA3: 50, ISL: 45, ISLS: 40, PPLA4: 40, CAPE: 35, LTHSE: 35, BAY: 33, HBR: 30, PRT: 30, PPL: 20 };

export const placeCountries = COUNTRIES.map((country) => ({
  country: country.name, code: country.code, places: []
}));
const placeCountryByCode = new Map(placeCountries.map((entry) => [entry.code, entry]));
// bumped whenever the place list changes, for caches built from it (the world map's tooltips)
export let placesVersion = 0;
export function invalidatePlaceIndex() { placesVersion++; }

// A country's full place list, merged in once: places already listed keep their objects (night lights hold them),
// sights added by landmarks.js stay, and listeners hear the newly added places (to label them).
const fullLoads = new Map(), fullLoaded = new Set();
const placeListeners = [];
export const onPlacesAdded = (listener) => { placeListeners.push(listener); };
// the index and a full list can arrive in either order: each place is added once
function mergePlaces(entry, places) {
  const key = (place) => `${place.type}|${place.name}|${place.lat}|${place.lon}`;
  const known = new Set(entry.places.map(key));
  const added = places.filter((place) => !known.has(key(place)));
  entry.places.push(...added);
  if (!added.length) return added;
  invalidatePlaceIndex();
  for (const listener of placeListeners) listener(entry, added);
  return added;
}

// The index by world region, nearest first: a region's distance is how far the point is from its nearest 10° cell
// (longitude measured the short way round).
const indexLoads = new Map();
let allIndexes = null;
function loadIndexGroup(group) {
  if (!indexLoads.has(group.id)) {
    indexLoads.set(group.id, fetchJson(group.file).then((index) => {
      for (const [code, places] of Object.entries(index)) {
        const entry = placeCountryByCode.get(code);
        if (entry) mergePlaces(entry, places);
      }
    }).catch((error) => { indexLoads.delete(group.id); throw error; }));
  }
  return indexLoads.get(group.id);
}
function groupDistance(group, latitude, longitude) {
  let best = Infinity;
  for (const [lonCell, latCell] of group.cells) {
    const dLat = Math.max(latCell * 10 - latitude, 0, latitude - latCell * 10 - 10);
    const centre = lonCell * 10 + 5;
    const dLon = Math.max(0, Math.abs(((longitude - centre) % 360 + 540) % 360 - 180) - 5);
    best = Math.min(best, Math.hypot(dLat, dLon));
  }
  return best;
}
// Starts loading every region's index, the one nearest (x, z) first; resolves once all are in.
export function loadPlaceIndexes(x = 0, z = 0) {
  if (allIndexes) return allIndexes;
  const { latitude, longitude } = worldToGeo(x, z);
  const [nearest, ...rest] = [...REGIONS.placeGroups].sort((a, b) => groupDistance(a, latitude, longitude) - groupDistance(b, latitude, longitude));
  allIndexes = loadIndexGroup(nearest).then(() => {
    markLoaded('places');
    return Promise.all(rest.map(loadIndexGroup));
  }).catch((error) => { allIndexes = null; throw error; });
  return allIndexes;
}
export function loadCountryPlaces(countryOrCode) {
  const entry = placeCountries.find((item) => item.code === countryOrCode || item.country === countryOrCode);
  if (!entry) return Promise.resolve();
  if (!fullLoads.has(entry.code)) {
    const file = COUNTRIES.find((country) => country.code === entry.code).places;
    fullLoads.set(entry.code, fetchJson(file).then(({ places }) => {
      fullLoaded.add(entry.code);
      mergePlaces(entry, places);
    }).catch((error) => { fullLoads.delete(entry.code); console.error(error); }));
  }
  return fullLoads.get(entry.code);
}
