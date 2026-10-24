"""Build the streamed world data from scripts/source-data/regions.source.json.

Outputs (all under dist/Data):
  regions.json          the region registry the game reads at start-up
  coast/base.json       every island, simplified (Douglas-Peucker in game units), grouped by chunk
  coast/<chunk>.json    full-detail outlines, one file per country per chunk of `chunkDegrees`
  dem/overview.png      one low-resolution heightmap over every DEM source
  dem/<src>-<i>-<j>.png full-resolution heightmap tiles (all-sea tiles are skipped)
  places/<code>.json    place names per country
  nav/sea-grid.png      coarse sea grid for long routes: 255 land, k = sea near country k (for locked-country
                        barriers), 0 open sea; one pixel per `nav.cell` game units over `worldBounds`

Needs Pillow:  python3 -m venv <dir> && <dir>/bin/pip install pillow
Run from the project root:  <dir>/bin/python scripts/build_regions.py
"""
import json
import math
import os
import shutil
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, 'scripts', 'source-data')
OUT = os.path.join(ROOT, 'dist', 'Data')

# Same projection as dist/geo.js: Mercator scaled to be true at Taiwan, one game unit = 4 km there.
REF_LAT, REF_LON = 23.70, 121.00
UNITS_PER_RADIAN = 6378.137 * math.cos(math.radians(REF_LAT)) * .25
merc = lambda lat: math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
REF_Y = merc(REF_LAT)
def to_world(lon, lat):
    return math.radians(lon - REF_LON) * UNITS_PER_RADIAN, -(merc(lat) - REF_Y) * UNITS_PER_RADIAN


def decode(flat):
    """Delta-encoded [lon, lat, dlon, dlat, ...] integers -> absolute integer pairs."""
    lon = lat = 0
    out = []
    for i in range(0, len(flat), 2):
        lon += flat[i]
        lat += flat[i + 1]
        out.append((lon, lat))
    return out


def encode(points):
    flat, plon, plat = [], 0, 0
    for lon, lat in points:
        flat += [lon - plon, lat - plat]
        plon, plat = lon, lat
    return flat


def simplify(points, scale, tolerance):
    """Douglas-Peucker on a closed ring, measured in game units; keeps original vertices only."""
    if len(points) <= 4:
        return points
    world = [to_world(lon / scale, lat / scale) for lon, lat in points]
    # split the ring at the vertex farthest from the first one, then simplify both halves
    far = max(range(len(world)), key=lambda i: (world[i][0] - world[0][0]) ** 2 + (world[i][1] - world[0][1]) ** 2)
    keep = [False] * len(world)
    keep[0] = keep[far] = True
    ring = world + [world[0]]
    stack = [(0, far), (far, len(world))]
    tol2 = tolerance * tolerance
    while stack:
        a, b = stack.pop()
        ax, ay = ring[a]
        bx, by = ring[b]
        dx, dy = bx - ax, by - ay
        length2 = dx * dx + dy * dy
        best, best_d = -1, tol2
        for i in range(a + 1, b):
            px, py = ring[i]
            t = 0 if length2 == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / length2))
            d = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
            if d > best_d:
                best, best_d = i, d
        if best >= 0:
            keep[best] = True
            stack += [(a, best), (best, b)]
    kept = [p for p, k in zip(points, keep) if k]
    if len(kept) < 3:   # a tiny islet still needs an area: keep three spread-out vertices
        step = max(1, len(points) // 3)
        kept = [points[0], points[step], points[min(len(points) - 1, 2 * step)]]
    return kept


def build_coast(config, countries):
    scale = None
    chunks = []
    base = []
    deg = config['chunkDegrees']
    for country in countries:
        data = json.load(open(os.path.join(SOURCE, country['coast'])))
        scale = scale or data['scale']
        assert data['scale'] == scale, 'all coast files must share one integer scale'
        groups = {}
        for flat in data['polys']:
            points = decode(flat)
            lons = [p[0] / scale for p in points]
            lats = [p[1] / scale for p in points]
            centre = ((min(lons) + max(lons)) / 2, (min(lats) + max(lats)) / 2)
            key = (math.floor(centre[0] / deg), math.floor(centre[1] / deg))
            group = groups.setdefault(key, {'polys': [], 'bounds': [math.inf, math.inf, -math.inf, -math.inf]})
            group['polys'].append(points)
            b = group['bounds']
            group['bounds'] = [min(b[0], min(lons)), min(b[1], min(lats)), max(b[2], max(lons)), max(b[3], max(lats))]
        for (cx, cy), group in sorted(groups.items()):
            chunk_id = f"{country['code']}-{cx}-{cy}"
            file = f'coast/{chunk_id}.json'
            json.dump({'scale': scale, 'polys': [encode(p) for p in group['polys']]}, open(os.path.join(OUT, file), 'w'), separators=(',', ':'))
            base.append({'id': chunk_id, 'polys': [encode(simplify(p, scale, config['coastTolerance'])) for p in group['polys']]})
            chunks.append({'id': chunk_id, 'country': country['code'], 'file': file, 'islands': len(group['polys']),
                           'bounds': [round(v, 5) for v in group['bounds']]})
    json.dump({'scale': scale, 'chunks': base}, open(os.path.join(OUT, 'coast', 'base.json'), 'w'), separators=(',', ':'))
    return {'scale': scale, 'tolerance': config['coastTolerance'], 'base': 'coast/base.json', 'chunks': chunks}


def build_dem(config):
    tiles = []
    sources = []
    for source in config['dem']:
        image = Image.open(os.path.join(SOURCE, source['file'])).convert('L')
        sources.append((source, image))
        lon0, lat0, lon1, lat1 = source['bounds']
        width, height = image.size
        # tiles share their edge pixel row/column with the next tile, so bilinear sampling is seamless
        per_x = max(2, round(config['demTileDegrees'] * (width - 1) / (lon1 - lon0)))
        per_y = max(2, round(config['demTileDegrees'] * (height - 1) / (lat1 - lat0)))
        for j, y0 in enumerate(range(0, height - 1, per_y)):
            for i, x0 in enumerate(range(0, width - 1, per_x)):
                x1, y1 = min(width - 1, x0 + per_x), min(height - 1, y0 + per_y)
                tile = image.crop((x0, y0, x1 + 1, y1 + 1))
                if not tile.getbbox():
                    continue   # open sea: heights are all zero, nothing to stream
                file = f"dem/{source['id']}-{i}-{j}.webp"
                # lossless unless the source asks for lossy WebP (`quality`, as the original Japan heightmap already was)
                tile.save(os.path.join(OUT, file), **({'quality': source['quality'], 'method': 6} if 'quality' in source else {'lossless': True, 'method': 6}))
                tiles.append({'file': file, 'width': x1 - x0 + 1, 'height': y1 - y0 + 1, 'bounds': [
                    round(lon0 + x0 / (width - 1) * (lon1 - lon0), 7), round(lat1 - y1 / (height - 1) * (lat1 - lat0), 7),
                    round(lon0 + x1 / (width - 1) * (lon1 - lon0), 7), round(lat1 - y0 / (height - 1) * (lat1 - lat0), 7)]})
    # overview: every source box-filtered onto one coarse grid covering them all
    ppd = config['overviewPixelsPerDegree']
    lon0 = min(s['bounds'][0] for s, _ in sources)
    lat0 = min(s['bounds'][1] for s, _ in sources)
    lon1 = max(s['bounds'][2] for s, _ in sources)
    lat1 = max(s['bounds'][3] for s, _ in sources)
    width, height = round((lon1 - lon0) * ppd) + 1, round((lat1 - lat0) * ppd) + 1
    overview = Image.new('L', (width, height), 0)
    for source, image in sources:
        s0, t0, s1, t1 = source['bounds']
        left, top = round((s0 - lon0) * ppd), round((lat1 - t1) * ppd)
        size = (round((s1 - s0) * ppd) + 1, round((t1 - t0) * ppd) + 1)
        overview.paste(image.resize(size, Image.BOX), (left, top))
    overview.save(os.path.join(OUT, 'dem', 'overview.png'), optimize=True)
    return {'maxMeters': config['demMaxMeters'],
            'overview': {'file': 'dem/overview.png', 'width': width, 'height': height, 'bounds': [lon0, lat0, lon1, lat1]},
            'tiles': tiles}


def to_world_delta(points, scale):
    return [to_world(lon / scale, lat / scale) for lon, lat in points]


def build_nav_grid(config, countries):
    bounds, cell = config['worldBounds'], config['nav']['cell']
    cols, rows = math.ceil((bounds['maxX'] - bounds['minX']) / cell), math.ceil((bounds['maxZ'] - bounds['minZ']) / cell)
    pixel = lambda x, z: ((x - bounds['minX']) / cell, (z - bounds['minZ']) / cell)
    land = Image.new('L', (cols, rows), 0)
    land_draw = ImageDraw.Draw(land)
    grid = Image.new('L', (cols, rows), 0)
    # Barrier cells: within barrierKm of a country's coast. The widest it gets in game units is at the highest
    # latitude in the grid, plus half a cell diagonal so any cell the barrier touches is marked.
    for index, country in enumerate(countries):
        data = json.load(open(os.path.join(SOURCE, country['coast'])))
        mask = Image.new('L', (cols, rows), 0)
        draw = ImageDraw.Draw(mask)
        max_lat = 0
        for flat in data['polys']:
            points = decode(flat)
            max_lat = max(max_lat, max(p[1] for p in points) / data['scale'])
            polygon = [pixel(*xy) for xy in to_world_delta(points, data['scale'])]
            if len(polygon) >= 3:
                draw.polygon(polygon, fill=255, outline=255)
                land_draw.polygon(polygon, fill=255, outline=255)
        km_per_unit = math.cos(math.radians(max_lat)) / (math.cos(math.radians(REF_LAT)) * .25)
        reach = math.ceil((config['nav']['barrierKm'] / km_per_unit + cell * .71) / cell)
        near = mask.filter(ImageFilter.MaxFilter(2 * reach + 1))
        grid.paste(index + 1, mask=near)
    grid.paste(255, mask=land)
    file = 'nav/sea-grid.png'
    grid.save(os.path.join(OUT, file), optimize=True)
    return {'file': file, 'cell': cell, 'minX': bounds['minX'], 'minZ': bounds['minZ'], 'cols': cols, 'rows': rows,
            'countries': [c['code'] for c in countries]}


def build_places(config, countries):
    data = json.load(open(os.path.join(SOURCE, config['places'])))
    by_name = data['countries']
    for country in countries:
        json.dump({'places': by_name[country['name']]['places']}, open(os.path.join(OUT, 'places', f"{country['code']}.json"), 'w'),
                  ensure_ascii=False, separators=(',', ':'))
    return data['description']


def main():
    config = json.load(open(os.path.join(SOURCE, 'regions.source.json')))
    countries = config['countries']
    for folder in ('coast', 'dem', 'places', 'nav'):
        shutil.rmtree(os.path.join(OUT, folder), ignore_errors=True)
        os.makedirs(os.path.join(OUT, folder))
    registry = {
        'version': 1,
        'note': 'Generated by scripts/build_regions.py from scripts/source-data/regions.source.json - edit the source, not this file.',
        'exaggeration': config['exaggeration'],
        'countries': [{'code': c['code'], 'name': c['name'], 'label': c['label'], 'aliases': c['aliases'],
                       'reliefStep': c['reliefStep'], 'places': f"places/{c['code']}.json",
                       **{key: c[key] for key in ('unlock', 'arrival') if key in c}} for c in countries],
        'circuits': config['circuits'],
        'coast': build_coast(config, countries),
        'dem': build_dem(config),
        'placesCredit': build_places(config, countries),
        'worldBounds': config['worldBounds'],
        'nav': build_nav_grid(config, countries),
    }
    json.dump(registry, open(os.path.join(OUT, 'regions.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    sizes = {folder: sum(os.path.getsize(os.path.join(OUT, folder, f)) for f in os.listdir(os.path.join(OUT, folder))) for folder in ('coast', 'dem', 'places')}
    print(f"chunks {len(registry['coast']['chunks'])}, dem tiles {len(registry['dem']['tiles'])}, bytes {sizes}, "
          f"base {os.path.getsize(os.path.join(OUT, 'coast', 'base.json'))}, overview {os.path.getsize(os.path.join(OUT, 'dem', 'overview.png'))}")


if __name__ == '__main__':
    main()
