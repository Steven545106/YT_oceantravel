"""Build a heightmap for scripts/source-data from AWS Terrain Tiles (Terrarium PNG, Mapzen/Amazon open data).

The output is a grayscale PNG on a plain longitude/latitude grid storing sqrt(elevation / max_meters) * 255, the format
the game reads (see land.js). Sea and below-sea-level ground are 0. Downloaded tiles are cached in `cache_dir`.

Needs numpy and Pillow. Run from the project root, e.g.:
  <venv>/bin/python scripts/build_dem.py china_dem.png 8 109.3 123.0 20.0 31.6 200 <cache_dir>
  (name, tile zoom, lon0, lon1, lat0, lat1, pixels per degree, cache folder)
"""
import io
import math
import os
import sys
import urllib.request
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
MAX_METERS = 4000


def tile_xy(lon, lat, z):
    n = 2 ** z
    return (lon + 180) / 360 * n, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n


def fetch(z, x, y, cache):
    path = os.path.join(cache, f'{z}-{x}-{y}.png')
    if not os.path.exists(path):
        with urllib.request.urlopen(URL.format(z=z, x=x, y=y), timeout=60) as response:
            open(path, 'wb').write(response.read())
    rgb = np.asarray(Image.open(path).convert('RGB'), dtype=np.float64)
    return rgb[..., 0] * 256 + rgb[..., 1] + rgb[..., 2] / 256 - 32768


def tile_lon(x, z):
    return x / 2 ** z * 360 - 180


def tile_lat(y, z):
    return math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / 2 ** z))))


def main(name, z, lon0, lon1, lat0, lat1, ppd, cache, keep=None):
    """`keep(lon0, lat0, lon1, lat1)`, if given, says whether a tile is worth fetching; the others stay sea level."""
    z, ppd = int(z), float(ppd)
    lon0, lon1, lat0, lat1 = map(float, (lon0, lon1, lat0, lat1))
    os.makedirs(cache, exist_ok=True)
    tx0, ty0 = (int(v) for v in tile_xy(lon0, lat1, z))
    tx1, ty1 = (min(2 ** z - 1, int(v)) for v in tile_xy(lon1, lat0, z))
    mosaic = np.zeros(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256), dtype=np.float32)
    fetched = 0
    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            if keep and not keep(tile_lon(tx, z), tile_lat(ty + 1, z), tile_lon(tx + 1, z), tile_lat(ty, z)):
                continue
            fetched += 1
            mosaic[(ty - ty0) * 256:(ty - ty0 + 1) * 256, (tx - tx0) * 256:(tx - tx0 + 1) * 256] = fetch(z, tx, ty, cache)
    width, height = round((lon1 - lon0) * ppd) + 1, round((lat1 - lat0) * ppd) + 1
    lons = lon0 + np.arange(width) / (width - 1) * (lon1 - lon0)
    lats = lat1 - np.arange(height) / (height - 1) * (lat1 - lat0)
    px = np.array([tile_xy(lon, 0, z)[0] for lon in lons]) - tx0
    py = np.array([tile_xy(0, lat, z)[1] for lat in lats]) - ty0
    u, v = np.meshgrid(px * 256 - .5, py * 256 - .5)
    u = np.clip(u, 0, mosaic.shape[1] - 1.001)
    v = np.clip(v, 0, mosaic.shape[0] - 1.001)
    x0, y0 = np.floor(u).astype(int), np.floor(v).astype(int)
    fx, fy = u - x0, v - y0
    elevation = (mosaic[y0, x0] * (1 - fx) + mosaic[y0, x0 + 1] * fx) * (1 - fy) + (mosaic[y0 + 1, x0] * (1 - fx) + mosaic[y0 + 1, x0 + 1] * fx) * fy
    encoded = np.sqrt(np.clip(elevation, 0, MAX_METERS) / MAX_METERS) * 255
    Image.fromarray(np.round(encoded).astype(np.uint8), 'L').save(os.path.join(ROOT, 'scripts', 'source-data', name), optimize=True)
    print(f'{name}: {width}x{height}, {fetched} tiles at z{z}')


if __name__ == '__main__':
    main(*sys.argv[1:9])
