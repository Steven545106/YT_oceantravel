"""Build the streamed world data from scripts/source-data/regions.source.json.

Outputs (all under dist/Data):
  regions.json          the region registry the game reads at start-up (bundled into the game script, so kept small:
                        the chunk list lives in coast/outline.bin and heightmap tiles are listed by grid position)
  coast/outline.bin     the chunk list plus the always-loaded layer: islands of outline.minAreaKm2 or more, simplified
                        to outline.tolerance game units (Douglas-Peucker), cut at the chunk grid (format below)
  coast/<chunk>.json    full-detail outlines, one file per country per `chunkDegrees` cell, cut at the cell edges
  dem/overview.png      one low-resolution heightmap over every DEM source
  dem/<src>-<i>-<j>.webp full-resolution heightmap tiles (all-sea tiles are skipped)
  places/<code>.json    place names per country
  places/index-<group>.json  start-up place index (cities, harbours, lighthouses) per world region, nearest loaded first

Needs Pillow and shapely:  python3 -m venv <dir> && <dir>/bin/pip install pillow shapely
Run from the project root:  <dir>/bin/python scripts/build_regions.py
"""
import json
import math
import os
import shutil
from PIL import Image
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


# coast/outline.bin, read by dist/coast-outline.js: zigzag varints after the 4-byte magic 'RLC1'.
#   chunk count, then per chunk: country index (registry order), cell x, cell y, full-detail island count, bounds as
#   lon0, lat0, lon1, lat1 in 1 / OUTLINE_SCALE degrees from the cell corner (rounded outwards), outline island count,
#   and per island: vertex count * 2 + cut flag, the first vertex from the cell corner, then deltas.
OUTLINE_SCALE = 10000   # 1e-4° ≈ 11 m, ample for outlines simplified to about 1.6 km


def zigzag(out, value):
    value = value * 2 if value >= 0 else -value * 2 - 1
    while value >= 128:
        out.append(value & 127 | 128)
        value >>= 7
    out.append(value)


def write_outline(path, entries, deg, scale):
    out = bytearray(b'RLC1')
    zigzag(out, len(entries))
    for country_index, (cx, cy), islands, bounds, rings in entries:
        ox, oy = cx * deg * OUTLINE_SCALE, cy * deg * OUTLINE_SCALE
        for value in (country_index, cx, cy, islands, math.floor(bounds[0] * OUTLINE_SCALE) - ox, math.floor(bounds[1] * OUTLINE_SCALE) - oy,
                      math.ceil(bounds[2] * OUTLINE_SCALE) - ox, math.ceil(bounds[3] * OUTLINE_SCALE) - oy):
            zigzag(out, value)
        packed = []
        for ring, cut in rings:
            points = [(round(lon * OUTLINE_SCALE / scale), round(lat * OUTLINE_SCALE / scale)) for lon, lat in ring]
            points = [p for i, p in enumerate(points) if p != points[i - 1]]
            if len(points) >= 3:
                packed.append((points, cut))
        zigzag(out, len(packed))
        for points, cut in packed:
            zigzag(out, len(points) * 2 + (1 if cut else 0))
            px, py = ox, oy
            for x, y in points:
                zigzag(out, x - px)
                zigzag(out, y - py)
                px, py = x, y
    open(path, 'wb').write(out)


def build_coast(config, countries):
    """Full-detail outlines go into one file per country per `chunkDegrees` cell, cut at the cell edges so a continent
    streams in pieces. The always-loaded outline layer keeps only islands of at least outline.minAreaKm2, simplified to
    outline.tolerance game units and cut the same way."""
    scale = None
    chunks = []
    entries = []
    deg = config['chunkDegrees']
    outline_tolerance, outline_min = config['outline']['tolerance'], config['outline']['minAreaKm2']
    for country_index, country in enumerate(countries):
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
            entries.append((country_index, (cx, cy), len(pieces), (min(lons), min(lats), max(lons), max(lats)), outline.get((cx, cy), [])))
            chunks.append(chunk_id)
    write_outline(os.path.join(OUT, 'coast', 'outline.bin'), entries, deg, scale)
    return {'scale': scale, 'tolerance': outline_tolerance, 'outline': 'coast/outline.bin', 'outlineScale': OUTLINE_SCALE,
            'chunkDegrees': deg, 'chunkCount': len(chunks)}


def build_dem(config):
    # Each source's tiles are listed by grid position only (dist/regions.js works out their files, sizes and bounds):
    # `tiles` holds the gaps between the indices j * columns + i of the tiles that exist.
    listed = []
    tile_count = 0
    sources = []
    for source in config['dem']:
        image = Image.open(os.path.join(SOURCE, source['file'])).convert('L')
        sources.append((source, image))
        lon0, lat0, lon1, lat1 = source['bounds']
        width, height = image.size
        # tiles share their edge pixel row/column with the next tile, so bilinear sampling is seamless
        per_x = max(2, round(config['demTileDegrees'] * (width - 1) / (lon1 - lon0)))
        per_y = max(2, round(config['demTileDegrees'] * (height - 1) / (lat1 - lat0)))
        columns = len(range(0, width - 1, per_x))
        present, previous = [], 0
        for j, y0 in enumerate(range(0, height - 1, per_y)):
            for i, x0 in enumerate(range(0, width - 1, per_x)):
                x1, y1 = min(width - 1, x0 + per_x), min(height - 1, y0 + per_y)
                tile = image.crop((x0, y0, x1 + 1, y1 + 1))
                if not tile.getbbox():
                    continue   # open sea: heights are all zero, nothing to stream
                file = f"dem/{source['id']}-{i}-{j}.webp"
                # lossless unless the source asks for lossy WebP (`quality`, as the original Japan heightmap already was)
                tile.save(os.path.join(OUT, file), **({'quality': source['quality'], 'method': 6} if 'quality' in source else {'lossless': True, 'method': 6}))
                present.append(j * columns + i - previous)
                previous = j * columns + i
        listed.append({'id': source['id'], 'bounds': source['bounds'], 'width': width, 'height': height, 'perX': per_x, 'perY': per_y, 'tiles': present})
        tile_count += len(present)
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
            'sources': listed, 'tileCount': tile_count}


# Loaded at start-up for every country: names for search across the map, labels, and the cities, harbours and
# lighthouses that light up at night. Everything else (islets, bays, capes, villages) comes with the country's own file.
INDEX_TYPES = {'ADM1', 'PPLC', 'PPLA', 'LTHSE', 'HBR', 'PRT'}
INDEX_MIN_POP = 50000


def place_groups(countries):
    """World region of each country: its region in world_regions.json, or 'east-asia' for the hand-made countries."""
    regions = json.load(open(os.path.join(SOURCE, 'world_regions.json')))['regions']
    group = {code.lower(): name for name, region in regions.items() for code in region['countries']}
    return {c['code']: group.get(c['code'], 'east-asia') for c in countries}


def build_places(config, countries):
    """Full lists per country, and the start-up index split by world region: the game loads the region nearest the
    start first and the others behind it, so a growing world does not slow the start. Each group lists the 10° cells
    (floor(lon / 10), floor(lat / 10)) its places lie in, which tells how near a point it is, across the 180° meridian
    and the seam too."""
    data = json.load(open(os.path.join(SOURCE, config['places'])))
    by_name = data['countries']
    groups, members = place_groups(countries), {}   # country code -> group, group -> {code: index places}
    for country in countries:
        places = by_name[country['name']]['places']
        json.dump({'places': places}, open(os.path.join(OUT, 'places', f"{country['code']}.json"), 'w'),
                  ensure_ascii=False, separators=(',', ':'))
        members.setdefault(groups[country['code']], {})[country['code']] = [
            p for p in places if p['type'] in INDEX_TYPES or (p.get('pop') or 0) >= INDEX_MIN_POP]
    listed = []
    for group, index in members.items():
        file = f'places/index-{group}.json'
        json.dump(index, open(os.path.join(OUT, file), 'w'), ensure_ascii=False, separators=(',', ':'))
        cells = sorted({(math.floor(p['lon'] / 10), math.floor(p['lat'] / 10)) for places in index.values() for p in places})
        listed.append({'id': group, 'file': file, 'cells': [list(cell) for cell in cells]})
    return data['description'], listed


def main():
    config = json.load(open(os.path.join(SOURCE, 'regions.source.json')))
    countries = config['countries']
    shutil.rmtree(os.path.join(OUT, 'nav'), ignore_errors=True)   # the long-route sea grid of the removed autopilot
    for folder in ('coast', 'dem', 'places'):
        shutil.rmtree(os.path.join(OUT, folder), ignore_errors=True)
        os.makedirs(os.path.join(OUT, folder))
    groups = place_groups(countries)
    places_credit, place_index = build_places(config, countries)
    registry = {
        'version': 1,
        'note': 'Generated by scripts/build_regions.py from scripts/source-data/regions.source.json - edit the source, not this file.',
        'exaggeration': config['exaggeration'],
        'countries': [{'code': c['code'], 'name': c['name'], 'label': c['label'], 'aliases': c['aliases'],
                       'reliefStep': c['reliefStep'], 'places': f"places/{c['code']}.json", 'placeGroup': groups[c['code']],
                       **{key: c[key] for key in ('unlock', 'arrival') if key in c}} for c in countries],
        'circuits': config['circuits'],
        'coast': build_coast(config, countries),
        'dem': build_dem(config),
        'placesCredit': places_credit,
        'placeGroups': place_index,
        'world': {**config['world'], 'ghostUnits': round(world_frame(config)['ghost'], 3)},
        'worldBounds': world_frame(config)['bounds'],
    }
    json.dump(registry, open(os.path.join(OUT, 'regions.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    sizes = {folder: sum(os.path.getsize(os.path.join(OUT, folder, f)) for f in os.listdir(os.path.join(OUT, folder))) for folder in ('coast', 'dem', 'places')}
    print(f"chunks {registry['coast']['chunkCount']}, dem tiles {registry['dem']['tileCount']}, bytes {sizes}, "
          f"outline {os.path.getsize(os.path.join(OUT, 'coast', 'outline.bin'))}, overview {os.path.getsize(os.path.join(OUT, 'dem', 'overview.png'))}, "
          f"registry {os.path.getsize(os.path.join(OUT, 'regions.json'))}")


if __name__ == '__main__':
    main()
