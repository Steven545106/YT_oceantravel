// Loading progress: runtime data (coast outlines, place names, seas, landmarks, terrain images, the ship model) is fetched
// as separate files instead of being baked into one huge script, and a progress bar tracks it.
// Only start-up items count; streamed detail (coast chunks, heightmap tiles) loads in the background later.
const WEIGHTS = {
  'coast/base.json': 3, 'dem:overview': 2, places: 3, 'seas.json': 1, 'landmarks.json': 1, 'land:nearby': 6, ship: 2, water: 1
};
const TOTAL = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
const done = new Set();
let panel, fill, label;

function ready() {
  if (panel !== undefined) return;
  panel = document.querySelector('#load-progress');
  fill = panel?.querySelector('.load-bar span');
  label = panel?.querySelector('b');
}

export function markLoaded(key) {
  if (done.has(key)) return;
  done.add(key);
  ready();
  let value = 0;
  for (const name of done) value += WEIGHTS[name] ?? 0;
  const fraction = Math.min(1, value / TOTAL);
  if (fill) fill.style.width = `${(fraction * 100).toFixed(0)}%`;
  if (label) label.textContent = `${(fraction * 100).toFixed(0)}%`;
  if (fraction >= 1 && panel) setTimeout(() => { panel.classList.add('is-done'); }, 500);
}

// A one-channel image (heightmap, sea grid) as raw bytes: { width, height, pixels }.
export function fetchGrayPixels(name) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      const pixels = new Uint8Array(image.width * image.height);
      for (let y = 0; y < image.height; y += 256) {
        const rows = Math.min(256, image.height - y);
        const data = context.getImageData(0, y, image.width, rows).data;
        for (let i = 0, n = image.width * rows; i < n; i++) pixels[y * image.width + i] = data[i * 4];
      }
      canvas.width = canvas.height = 0;
      resolve({ width: image.width, height: image.height, pixels });
    };
    image.onerror = () => reject(new Error(`無法載入 ${name}`));
    image.src = `./Data/${name}`;
  });
}

export async function fetchJson(name) {
  const response = await fetch(`./Data/${name}`, { cache: 'no-cache' });   // revalidate, so an updated data file is never served stale from the cache
  if (!response.ok) throw new Error(`無法載入 ${name}（${response.status}）`);
  const json = await response.json();
  markLoaded(name);
  return json;
}
