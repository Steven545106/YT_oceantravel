// Teleport points: one per country, set by the player, opened by that country's master badge ("日本達人": every stamp
// of the country collected). A point is a spot at sea off that country, saved by latitude / longitude with a heading.
// The game wires `teleportHooks.travel` to move the boat; teleport-ui.js shows the points on the panel and the maps.
export const TELEPORT_KEY = 'relax-teleports-v1';
export const TELEPORT_REACH_KM = 60;   // a point must lie within this of its country's coast

export function createTeleportStore(storage = globalThis.localStorage) {
  let points = {};
  try { points = JSON.parse(storage?.getItem(TELEPORT_KEY) ?? '{}') ?? {}; } catch { points = {}; }
  const listeners = [];
  const save = () => { try { storage?.setItem(TELEPORT_KEY, JSON.stringify(points)); } catch { /* private mode */ } };
  return {
    get: (code) => points[code] ?? null,
    all: () => ({ ...points }),
    set(code, point) {
      points = { ...points, [code]: { lat: point.lat, lon: point.lon, heading: point.heading ?? 0, setAt: point.setAt ?? Date.now() } };
      save();
      for (const listener of listeners) listener(code);
    },
    onChange: (listener) => { listeners.push(listener); }
  };
}

// Why the boat's spot cannot become `code`'s point, or null when it can. `countryKm` is the distance to that country's
// own coast: another country's shore may well be nearer (Macau sits beside Zhuhai), and that is fine.
export function teleportSiteProblem({ name, fighter, onLand, countryKm, unlocked }) {
  if (!unlocked) return `先取得「${name}達人」成就（集滿${name}所有景點的印章）才能設定傳送點`;
  if (fighter) return '傳送點供船隻使用，請換成船再設定';
  if (onLand) return '傳送點要設在海上';
  if (!(countryKm <= TELEPORT_REACH_KM)) return `請先開到${name}沿海 ${TELEPORT_REACH_KM} 公里內再設定`;
  return null;
}

export const teleportHooks = { travel: null };
export const teleports = typeof localStorage === 'undefined' ? createTeleportStore(null) : createTeleportStore();
