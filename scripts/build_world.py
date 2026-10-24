"""Build a whole world region in one go: coastlines per country, a heightmap, place names and registry entries.

For a region in scripts/source-data/world_regions.json this:
  1. cuts OpenStreetMap land inside the area (one box, or several, e.g. either side of the 180° meridian) into 2° cells,
     minus land already in the `exclude` coast files;
  2. gives each piece of land to a country with the Natural Earth 1:10m country outlines: land inside an outline is that
     country's, land outside every outline (coast the 1 km outlines miss, small islands) goes to the nearest country
     within NEAREST_DEG; only the region's `countries` are kept;
  3. writes scripts/source-data/<country>_coast.json for each of them (replacing older files of the same name);
  4. builds scripts/source-data/<region>_dem.png from AWS Terrain Tiles (scripts/build_dem.py), or one heightmap per
     `dem.boxes` entry for regions of scattered islands, fetching only tiles near the region's land;
  5. adds each country's place names from GeoNames (scripts/build_places.py), downloading the dumps it needs;
  6. adds countries missing from regions.source.json (code, Chinese and English names, aliases, coast file, unlock) and
     the heightmap to its `dem` list.
Afterwards run scripts/build_regions.py and scripts/build.mjs as usual.

Inputs downloaded once, kept outside the project:
  OSM land polygons    https://osmdata.openstreetmap.de/download/land-polygons-split-4326.zip (ODbL)
  Natural Earth        https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_0_countries.zip (public domain)
Needs shapely, pyshp, numpy, Pillow and opencc-python-reimplemented. Run from the project root:
  <venv>/bin/python scripts/build_world.py <region> <land-polygons-split-4326 folder> <ne_10m_admin_0_countries folder> <cache folder>
"""
import importlib.util
import json
import math
import os
import re
import sys
import urllib.request
import zipfile
import shapefile
from shapely.geometry import shape, box, Polygon
from shapely.ops import unary_union
from shapely.prepared import prep

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, 'scripts', 'source-data')
SCALE = 100000
CELL = 2                 # degrees, the same grid build_regions.py cuts chunks on
SIMPLIFY_DEG = .0003     # ≈ 30 m
MIN_AREA_KM2 = .005      # drop rocks smaller than this
NEAREST_DEG = 1.0        # land outside every country outline goes to the nearest one within this distance


def load_script(name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, 'scripts', f'{name}.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def decode(flat):
    lon = lat = 0
    for i in range(0, len(flat), 2):
        lon += flat[i]
        lat += flat[i + 1]
        yield lon / SCALE, lat / SCALE


def encode(ring):
    flat, plon, plat = [], 0, 0
    for lon, lat in ring:
        x, y = round(lon * SCALE), round(lat * SCALE)
        if flat and (x, y) == (plon, plat):
            continue
        flat += [x - plon, y - plat]
        plon, plat = x, y
    return flat


def polygons(geometry):
    if isinstance(geometry, Polygon):
        return [geometry] if not geometry.is_empty else []
    return [g for g in getattr(geometry, 'geoms', []) if isinstance(g, Polygon) and not g.is_empty]


def area_km2(polygon):
    return polygon.area * 111.32 ** 2 * math.cos(math.radians(polygon.centroid.y))


def file_name(english):
    return re.sub(r'[^a-z]+', '_', english.lower()).strip('_') + '_coast.json'


def area_boxes(region):
    area = region['area']
    return area if isinstance(area[0], list) else [area]


def build_coasts(region, land_folder, ne_folder):
    boxes = area_boxes(region)
    area = unary_union([box(*b) for b in boxes])
    near = lambda x0, y0, x1, y1, pad: any(x1 >= b[0] - pad and x0 <= b[2] + pad and y1 >= b[1] - pad and y0 <= b[3] + pad for b in boxes)
    reader = shapefile.Reader(os.path.join(ne_folder, 'ne_10m_admin_0_countries'))
    fields = [f[0] for f in reader.fields[1:]]
    outlines, names = {}, {}
    for record in reader.iterShapeRecords():
        info = dict(zip(fields, record.record))
        code = info['ISO_A2_EH']
        x0, y0, x1, y1 = record.shape.bbox
        if not near(x0, y0, x1, y1, 2) or code in ('-99', ''):
            continue
        # a code can have several records (Australia's Coral Sea and Ashmore islands): keep them all, name the first
        outline = shape(record.shape.__geo_interface__).buffer(0)
        outlines[code] = outlines[code].union(outline) if code in outlines else outline
        if code not in names:
            names[code] = {'en': info['NAME_EN'], 'zht': region.get('names', {}).get(code, info['NAME_ZHT']), 'zh': info['NAME_ZH'], 'long': info['NAME_LONG']}
    excluded = []
    for name in region['exclude']:
        for flat in json.load(open(os.path.join(SOURCE, name)))['polys']:
            ring = list(decode(flat))
            if len(ring) >= 3:
                excluded.append(Polygon(ring).buffer(0))
    excluded = unary_union(excluded).buffer(.002)

    cells = {}
    reader = shapefile.Reader(os.path.join(land_folder, 'land_polygons'))
    for shp in reader.iterShapes():
        x0, y0, x1, y1 = shp.bbox
        if not near(x0, y0, x1, y1, 0):
            continue
        piece = shape(shp.__geo_interface__)
        for cx in range(math.floor(x0 / CELL), math.floor(x1 / CELL) + 1):
            for cy in range(math.floor(y0 / CELL), math.floor(y1 / CELL) + 1):
                if near(cx * CELL, cy * CELL, (cx + 1) * CELL, (cy + 1) * CELL, 0):
                    cells.setdefault((cx, cy), []).append(piece)
    kept = {code: [] for code in region['countries']}
    all_land = []
    for (cx, cy), pieces in sorted(cells.items()):
        cell = box(cx * CELL, cy * CELL, (cx + 1) * CELL, (cy + 1) * CELL).intersection(area)
        if cell.is_empty or cell.area == 0:
            continue
        whole = unary_union(pieces).intersection(cell)
        # every country's land, not just the kept ones: a heightmap must not flatten a neighbour where they overlap
        all_land.append(whole)
        land = whole.difference(excluded)
        if land.is_empty:
            continue
        here = {code: outline for code, outline in outlines.items() if outline.intersects(cell.buffer(NEAREST_DEG))}
        if not here:
            continue
        parts = {code: [] for code in region['countries']}
        for code in region['countries']:
            if code in here:
                parts[code] += polygons(land.intersection(here[code]))
        leftover = land.difference(unary_union(list(here.values())))
        for piece in polygons(leftover):
            nearest = min(here, key=lambda code: here[code].distance(piece))
            if nearest in parts and here[nearest].distance(piece) <= NEAREST_DEG:
                parts[nearest].append(piece)
        for code, found in parts.items():
            for polygon in polygons(unary_union(found)) if found else []:
                if area_km2(polygon) < MIN_AREA_KM2:
                    continue
                ring = list(polygon.exterior.simplify(SIMPLIFY_DEG, preserve_topology=False).coords)[:-1]
                if len(ring) >= 3:
                    kept[code].append(encode(ring))
    files = {}
    for code, polys in kept.items():
        files[code] = file_name(names[code]['en'])
        json.dump({'scale': SCALE, 'polys': polys}, open(os.path.join(SOURCE, files[code]), 'w'), separators=(',', ':'))
        print(f"{files[code]}: {len(polys)} islands, {sum(len(p) for p in polys) // 2} vertices")
    return files, names, unary_union(all_land)


def fetch_geonames(code, cache):
    folder = os.path.join(cache, 'geonames')
    os.makedirs(folder, exist_ok=True)
    text = os.path.join(folder, f'{code}.txt')
    if not os.path.exists(text):
        archive = os.path.join(folder, f'{code}.zip')
        urllib.request.urlretrieve(f'https://download.geonames.org/export/dump/{code}.zip', archive)
        zipfile.ZipFile(archive).extract(f'{code}.txt', folder)
    return text


def update_registry(region_name, region, files, names, dems):
    """Append countries the registry lacks, point existing ones at their new coast file, and list the heightmap."""
    path = os.path.join(SOURCE, 'regions.source.json')
    text = open(path, encoding='utf-8').read()
    config = json.loads(text)
    known = {c['code']: c for c in config['countries']}
    added = []
    for code in region['countries']:
        lower = code.lower()
        if lower in known:
            if known[lower]['coast'] != files[code]:
                text = text.replace(f'"coast": "{known[lower]["coast"]}"', f'"coast": "{files[code]}"', 1)
            continue
        n = names[code]
        aliases = list(dict.fromkeys([n['zht'], n['zh'], n['en'], n['long'], code]))
        entry = {'code': lower, 'name': n['zht'], 'label': n['en'].upper(), 'coast': files[code], 'reliefStep': 0.2,
                 'unlock': region['unlock'], 'aliases': aliases}
        added.append('    ' + json.dumps(entry, ensure_ascii=False))
    if added:
        end = text.index('\n  ],\n  "circuits"')
        text = text[:end] + ',\n' + ',\n'.join(added) + text[end:]
    for dem_id, dem_file, bounds in dems:
        if f'"{dem_file}"' not in text:
            entry = json.dumps({'id': dem_id, 'file': dem_file, 'bounds': bounds, 'quality': 90})
            start = text.index('  "dem": [\n') + len('  "dem": [\n')
            text = text[:start] + '    ' + entry + ',\n' + text[start:]
    json.loads(text)
    open(path, 'w', encoding='utf-8').write(text)
    print(f'registry: {len(added)} countries added')


def main(region_name, land_folder, ne_folder, cache):
    region = json.load(open(os.path.join(SOURCE, 'world_regions.json')))['regions'][region_name]
    files, names, land = build_coasts(region, land_folder, ne_folder)
    # one heightmap over the area, or one per `dem.boxes` entry (id: [lon0, lat0, lon1, lat1] or [..., pixels per degree])
    boxes = region['dem'].get('boxes') or {'': area_boxes(region)[0]}
    land, dems = prep(land), []
    for box_id, bounds in boxes.items():
        dem_id = f'{region_name}-{box_id}' if box_id else region_name
        dem_file = f"{dem_id.replace('-', '_')}_dem.png"
        lon0, lat0, lon1, lat1 = bounds[:4]
        ppd = bounds[4] if len(bounds) > 4 else region['dem']['pixelsPerDegree']
        load_script('build_dem').main(dem_file, region['dem']['zoom'], lon0, lon1, lat0, lat1, ppd, os.path.join(cache, 'terrarium'),
                                      keep=lambda x0, y0, x1, y1: land.intersects(box(x0 - .05, y0 - .05, x1 + .05, y1 + .05)))
        dems.append((dem_id, dem_file, [lon0, lat0, lon1, lat1]))
    places = load_script('build_places')
    registry = {c['code']: c for c in json.load(open(os.path.join(SOURCE, 'regions.source.json')))['countries']}
    for code in region['countries']:
        known = registry.get(code.lower())
        name = known['name'] if known else names[code]['zht']
        aliases = known['aliases'] if known else list(dict.fromkeys([names[code]['zht'], names[code]['zh'], names[code]['en'], code]))
        places.main(name, files[code], fetch_geonames(code, cache), *aliases)
    update_registry(region_name, region, files, names, dems)


if __name__ == '__main__':
    main(*sys.argv[1:5])
