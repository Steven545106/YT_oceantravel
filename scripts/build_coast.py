"""Cut country coastlines out of OpenStreetMap land polygons (hand-tuned regions; newer regions use build_world.py), in the format of scripts/source-data/*_coast.json.

Inputs (downloaded once, kept outside the project):
  OSM land polygons    https://osmdata.openstreetmap.de/download/land-polygons-split-4326.zip  (ODbL, © OpenStreetMap contributors)
  province outlines    geoBoundaries gbOpen CHN ADM1 GeoJSON (only used to tell which land belongs to which region)
  exact boundaries     OSM administrative relations as GeoJSON, e.g. from Nominatim (Hong Kong 913110, Macau 1867188),
                       for regions whose land border must be exact; they include the territorial waters

Each region is the OSM land inside its zone: its exact boundary file if it has one, otherwise the listed provinces widened
by `widen` degrees (so islands and capes beyond the coarse province outline are kept), minus the other provinces and the
zones of regions listed before it. Land already in another country's coast file is cut away (the North Korean bank of the
Yalu), and islands left mostly cut away (Kinmen and Matsu, in taiwan_coast.json) are dropped.

Needs shapely and pyshp (pip install shapely pyshp). Run from the project root, e.g.:
  <venv>/bin/python scripts/build_coast.py <preset: vietnam | china | philippines> <land-polygons-split-4326 folder>
Boundary and province files are read from scripts/source-data/boundaries.
"""
import json
import math
import os
import sys
import shapefile
from shapely.geometry import shape, box, Polygon
from shapely.ops import unary_union
from shapely.prepared import prep

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, 'scripts', 'source-data')
SCALE = 100000
SIMPLIFY_DEG = .0003                         # ≈ 30 m: well under the game's 200 m simplified outline
MIN_AREA_KM2 = .005                          # drop rocks smaller than this
BOUNDARIES = os.path.join(SOURCE, 'boundaries')
# One preset per data run. area: lon0, lat0, lon1, lat1 searched in the OSM data; exclude: coast files whose land is
# already another country's; provinces: geoBoundaries outlines for province-based zones; exact: province names that
# have exact boundary files instead; regions: (output file, exact boundary file or province names, how far to widen
# provinces in degrees; '*' takes what is left of the area), earlier regions win. drop_cut: drop islands the area's edge
# cuts through; skip: boxes whose islands are left out.
PRESETS = {
    'china': {
        'area': (104.3, 18.0, 126.0, 43.6),
        'exclude': ['taiwan_coast.json', 'north_korea_coast.json', 'vietnam_coast.json'],
        'provinces': 'geoBoundaries-CHN-ADM1.geojson',
        'exact': {'Hong Kong Special Administrative Region', 'Macau Special Administrative Region'},
        'regions': [
            ('hong_kong_coast.json', 'hk.geojson', 0),
            ('macau_coast.json', 'mo.geojson', 0),
            # "Guangzhou Province" is Guangdong in this file; Beijing has no coast but would otherwise be a hole inside Hebei
            ('china_coast.json', ['Liaoning Province', 'Hebei Province', 'Beijing Municipality', 'Tianjin Municipality', 'Shandong Province',
                                  'Jiangsu Province', 'Shanghai Municipality', 'Zhejiang Province', 'Fujian Province', 'Guangzhou Province',
                                  'Hainan Province', 'Guangxi Zhuang Autonomous Region'], .3),
        ],
    },
    # The whole country inside its OSM boundary (territorial waters included). West of 116.8°E (the disputed Spratlys)
    # is left out.
    # Run before 'china', which cuts Vietnam's land out of Guangxi. East of 109.6°E (the disputed Paracels and Spratlys)
    # is left out.
    'vietnam': {
        'area': (102.1, 8.3, 109.6, 23.5),
        'exclude': [],
        'regions': [('vietnam_coast.json', 'vn.geojson', 0)],
    },
    'philippines': {
        'area': (116.8, 4.3, 127.0, 21.4),
        'exclude': ['taiwan_coast.json'],
        'regions': [('philippines_coast.json', 'ph.geojson', 0)],
    },
}


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
        if (x, y) == (plon, plat) and flat:
            continue
        flat += [x - plon, y - plat]
        plon, plat = x, y
    return flat


def area_km2(polygon):
    lat = polygon.centroid.y
    return polygon.area * 111.32 ** 2 * math.cos(math.radians(lat))


def main(preset_name, land_folder):
    preset = PRESETS[preset_name]
    AREA, EXCLUDE, EXACT = preset['area'], preset['exclude'], preset.get('exact', set())
    region_box = box(*AREA)
    reader = shapefile.Reader(os.path.join(land_folder, 'land_polygons'))
    pieces = []
    for shp in reader.iterShapes():
        x0, y0, x1, y1 = shp.bbox
        if x1 < AREA[0] or x0 > AREA[2] or y1 < AREA[1] or y0 > AREA[3]:
            continue
        pieces.append(shape(shp.__geo_interface__).intersection(region_box))
    land = unary_union(pieces)
    print(f'OSM land pieces in area: {len(pieces)}')

    provinces = {f['properties']['shapeName']: shape(f['geometry']) for f in json.load(open(os.path.join(BOUNDARIES, preset['provinces'])))['features']} if 'provinces' in preset else {}
    excluded = []
    for name in EXCLUDE:
        for flat in json.load(open(os.path.join(SOURCE, name)))['polys']:
            ring = list(decode(flat))
            if len(ring) >= 3:
                excluded.append(Polygon(ring).buffer(0))
    excluded = unary_union(excluded)
    excluded_test = prep(excluded.buffer(.01))

    taken = None
    for file, names, widen in preset['regions']:
        if names == '*':
            zone = region_box   # whatever earlier regions did not take
        elif isinstance(names, str):
            zone = shape(json.load(open(os.path.join(BOUNDARIES, names)))['geometry']).buffer(0).intersection(region_box)
        else:
            own = unary_union([provinces[n] for n in names])
            # outlines replaced by exact boundaries above are left out, or their coarse shapes would bite into neighbours
            others = unary_union([g for n, g in provinces.items() if n not in names and n not in EXACT])
            zone = own.buffer(widen).difference(others.difference(own.buffer(.005)))
        if taken is not None:
            zone = zone.difference(taken)
        taken = zone if taken is None else taken.union(zone)
        result = land.intersection(zone)
        polygons = [result] if isinstance(result, Polygon) else [g for g in getattr(result, 'geoms', []) if isinstance(g, Polygon)]
        polys = []
        kept = []
        for polygon in polygons:
            if excluded_test.intersects(polygon):
                rest = polygon.difference(excluded.buffer(.002))
                if rest.area < polygon.area * .5:
                    continue   # an island that is really another country's
                kept += [rest] if isinstance(rest, Polygon) else [g for g in getattr(rest, 'geoms', []) if isinstance(g, Polygon)]
            else:
                kept.append(polygon)
        edge = region_box.exterior.buffer(1e-6)
        for polygon in kept:
            if area_km2(polygon) < MIN_AREA_KM2:
                continue
            if preset.get('drop_cut') and polygon.intersects(edge):
                continue   # an island cut through by the search area belongs to a later run
            if any(box(*b).contains(polygon.representative_point()) for b in preset.get('skip', [])):
                continue
            outline = polygon.exterior.simplify(SIMPLIFY_DEG, preserve_topology=False)
            coords = list(outline.coords)[:-1]
            if len(coords) >= 3:
                polys.append(encode(coords))
        json.dump({'scale': SCALE, 'polys': polys}, open(os.path.join(SOURCE, file), 'w'), separators=(',', ':'))
        print(f'{file}: {len(polys)} islands, {sum(len(p) for p in polys) // 2} vertices')


if __name__ == '__main__':
    main(*sys.argv[1:3])
