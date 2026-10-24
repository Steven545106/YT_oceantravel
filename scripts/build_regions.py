"""Build the streamed world data from scripts/source-data/regions.source.json.

Outputs (all under dist/Data):
  regions.json          the region registry the game reads at start-up
  coast/outline.json    the always-loaded layer: islands of outline.minAreaKm2 or more, simplified to outline.tolerance
                        game units (Douglas-Peucker), cut at the chunk grid
  coast/<chunk>.json    full-detail outlines, one file per country per `chunkDegrees` cell, cut at the cell edges
  dem/overview.png      one low-resolution heightmap over every DEM source
  dem/<src>-<i>-<j>.png full-resolution heightmap tiles (all-sea tiles are skipped)
  places/<code>.json    place names per country
  nav/sea-grid.png      coarse sea grid for long routes: 255 land, k = sea near country k (for locked-country
                        barriers), 0 open sea; one pixel per `nav.cell` game units over `worldBounds`

Needs Pillow and shapely:  python3 -m venv <dir> && <dir>/bin/pip install pillow shapely
Run from the project root:  <dir>/bin/python scripts/build_regions.py
"""
import json
import math
import os
import shutil
from PIL import Image, ImageDraw, ImageFilter
from shapely.geometry import Polygon, box

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


WORLD_WIDTH = 2 * math.pi * UNITS_PER_RADIAN


def world_frame(config):
    """The game's east-west frame (see dist/geo.js): x from the seam meridian eastwards for one world width; copies of
    land within `ghostDegrees` of the seam reach past both ends, and latitude stops at `north` / `south`."""
    world = config['world']
    min_x = to_world(world['seamLongitude'], 0)[0]
    ghost = math.radians(world['ghostDegrees']) * UNITS_PER_RADIAN
    return {'minX': min_x, 'maxX': min_x + WORLD_WIDTH, 'ghost': ghost,
            'bounds': {'minX': round(min_x - ghost, 3), 'maxX': round(min_x + WORLD_WIDTH + ghost, 3),
                       'minZ': round(to_world(0, world['north'])[1], 3), 'maxZ': round(to_world(0, world['south'])[1], 3)}}


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


def ring_area_km2(points, scale):
    twice = 0
    for i in range(len(points)):
        (x1, y1), (x2, y2) = points[i - 1], points[i]
        twice += x1 * y2 - x2 * y1
    return abs(twice) / 2 / scale / scale * 111.32 ** 2 * math.cos(math.radians(points[0][1] / scale))


def clip_to_cells(points, deg, scale):
    """Cut one outline (integer lon/lat pairs) at the chunk grid: [((cx, cy), points, cut)], cut = touches a cell edge."""
    lons = [p[0] for p in points]
    lats = [p[1] for p in points]
    cx0, cx1 = math.floor(min(lons) / scale / deg), math.floor(max(lons) / scale / deg)
    cy0, cy1 = math.floor(min(lats) / scale / deg), math.floor(max(lats) / scale / deg)
    if cx0 == cx1 and cy0 == cy1:
        # already cut at this grid upstream (build_world.py): a piece lying on a cell edge is cut there
        edge = deg * scale
        cut = min(lons) % edge == 0 or max(lons) % edge == 0 or min(lats) % edge == 0 or max(lats) % edge == 0
        return [((cx0, cy0), points, cut)]
    polygon = Polygon(points).buffer(0)
    out = []
    for cx in range(cx0, cx1 + 1):
        for cy in range(cy0, cy1 + 1):
            cell = box(cx * deg * scale, cy * deg * scale, (cx + 1) * deg * scale, (cy + 1) * deg * scale)
            part = polygon.intersection(cell)
            for piece in [part] if isinstance(part, Polygon) else [g for g in getattr(part, 'geoms', []) if isinstance(g, Polygon)]:
                ring = [(round(x), round(y)) for x, y in piece.exterior.coords[:-1]]
                ring = [p for i, p in enumerate(ring) if p != ring[i - 1]]
                if len(ring) >= 3:
                    out.append(((cx, cy), ring, True))
    return out


def build_coast(config, countries):
    """Full-detail outlines go into one file per country per `chunkDegrees` cell, cut at the cell edges so a continent
    streams in pieces. The always-loaded outline layer keeps only islands of at least outline.minAreaKm2, simplified to
    outline.tolerance game units and cut the same way."""
    scale = None
    chunks = []
    outline_chunks = []
    deg = config['chunkDegrees']
    outline_tolerance, outline_min = config['outline']['tolerance'], config['outline']['minAreaKm2']
    for country in countries:
        data = json.load(open(os.path.join(SOURCE, country['coast'])))
        scale = scale or data['scale']
        assert data['scale'] == scale, 'all coast files must share one integer scale'
        detail, outline = {}, {}
        for flat in data['polys']:
            points = decode(flat)
            for key, ring, cut in clip_to_cells(points, deg, scale):
                detail.setdefault(key, []).append((ring, cut))
            if ring_area_km2(points, scale) >= outline_min:
                for key, ring, cut in clip_to_cells(simplify(points, scale, outline_tolerance), deg, scale):
                    outline.setdefault(key, []).append((ring, cut))
        for (cx, cy), pieces in sorted(detail.items()):
            chunk_id = f"{country['code']}-{cx}-{cy}"
            file = f'coast/{chunk_id}.json'
            lons = [p[0] / scale for ring, _ in pieces for p in ring]
            lats = [p[1] / scale for ring, _ in pieces for p in ring]
            json.dump({'scale': scale, 'polys': [encode(ring) for ring, _ in pieces], 'cut': [i for i, (_, cut) in enumerate(pieces) if cut]},
                      open(os.path.join(OUT, file), 'w'), separators=(',', ':'))
            rough = outline.get((cx, cy), [])
            outline_chunks.append({'id': chunk_id, 'polys': [encode(ring) for ring, _ in rough], 'cut': [i for i, (_, cut) in enumerate(rough) if cut]})
            chunks.append({'id': chunk_id, 'country': country['code'], 'file': file, 'islands': len(pieces),
                           'bounds': [round(min(lons), 5), round(min(lats), 5), round(max(lons), 5), round(max(lats), 5)]})
    json.dump({'scale': scale, 'chunks': outline_chunks}, open(os.path.join(OUT, 'coast', 'outline.json'), 'w'), separators=(',', ':'))
    return {'scale': scale, 'tolerance': outline_tolerance, 'outline': 'coast/outline.json', 'chunks': chunks}


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


def build_nav_grid(config, countries):
    # one world width across (the grid wraps east-west), from the frame's north to south limit
    frame, cell = world_frame(config), config['nav']['cell']
    bounds = {'minX': frame['minX'], 'maxX': frame['maxX'], 'minZ': frame['bounds']['minZ'], 'maxZ': frame['bounds']['maxZ']}
    cols = round((bounds['maxX'] - bounds['minX']) / cell)
    cell = (bounds['maxX'] - bounds['minX']) / cols   # square cells, a whole number of them per world width
    rows = math.ceil((bounds['maxZ'] - bounds['minZ']) / cell)
    pixel = lambda x, z: ((x - bounds['minX']) / cell, (z - bounds['minZ']) / cell)
    seam = config['world']['seamLongitude']
    def outlines_in_frame(flat, scale):
        # longitudes kept continuous along the outline, the first one in the frame; drawn again one width over if it
        # runs past either end
        points = decode(flat)
        first = seam + ((points[0][0] / scale - seam) % 360)
        lons, prev = [], None
        for lon, _ in points:
            lon = lon / scale
            lon = first if prev is None else prev + ((lon - prev + 180) % 360 - 180)
            lons.append(lon)
            prev = lon
        world = [to_world(lon, lat / scale) for lon, (_, lat) in zip(lons, points)]
        copies = [world]
        if min(x for x, _ in world) < bounds['minX']:
            copies.append([(x + WORLD_WIDTH, z) for x, z in world])
        if max(x for x, _ in world) > bounds['maxX']:
            copies.append([(x - WORLD_WIDTH, z) for x, z in world])
        return [[pixel(x, z) for x, z in copy] for copy in copies]
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
            max_lat = max(max_lat, max(p[1] for p in decode(flat)) / data['scale'])
            for polygon in outlines_in_frame(flat, data['scale']):
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
    return {'file': file, 'cell': cell, 'wrap': True, 'minX': bounds['minX'], 'minZ': bounds['minZ'], 'cols': cols, 'rows': rows,
            'countries': [c['code'] for c in countries]}


# Loaded at start-up for every country: names for search across the map, labels, and the cities, harbours and
# lighthouses that light up at night. Everything else (islets, bays, capes, villages) comes with the country's own file.
INDEX_TYPES = {'ADM1', 'PPLC', 'PPLA', 'LTHSE', 'HBR', 'PRT'}
INDEX_MIN_POP = 50000


def build_places(config, countries):
    data = json.load(open(os.path.join(SOURCE, config['places'])))
    by_name = data['countries']
    index = {}
    for country in countries:
        places = by_name[country['name']]['places']
        json.dump({'places': places}, open(os.path.join(OUT, 'places', f"{country['code']}.json"), 'w'),
                  ensure_ascii=False, separators=(',', ':'))
        index[country['code']] = [p for p in places if p['type'] in INDEX_TYPES or (p.get('pop') or 0) >= INDEX_MIN_POP]
    json.dump(index, open(os.path.join(OUT, 'places', 'index.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
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
        'world': {**config['world'], 'ghostUnits': round(world_frame(config)['ghost'], 3)},
        'worldBounds': world_frame(config)['bounds'],
        'nav': build_nav_grid(config, countries),
    }
    json.dump(registry, open(os.path.join(OUT, 'regions.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    sizes = {folder: sum(os.path.getsize(os.path.join(OUT, folder, f)) for f in os.listdir(os.path.join(OUT, folder))) for folder in ('coast', 'dem', 'places')}
    print(f"chunks {len(registry['coast']['chunks'])}, dem tiles {len(registry['dem']['tiles'])}, bytes {sizes}, "
          f"outline {os.path.getsize(os.path.join(OUT, 'coast', 'outline.json'))}, overview {os.path.getsize(os.path.join(OUT, 'dem', 'overview.png'))}")


if __name__ == '__main__':
    main()
