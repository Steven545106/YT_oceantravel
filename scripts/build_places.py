"""Add a country's place names from a GeoNames dump to scripts/source-data/places.json.

Keeps the place types the game uses (see PLACE_TYPE_WEIGHT in dist/places.js) that lie on the country's land in its
coast file, or (for islands, capes, bays, harbours, lighthouses) within `SEA_REACH_KM` of it. The display name is the
shortest Chinese form among the GeoNames alternate names, converted to Traditional characters; the rest become aliases.
A place already in places.json for this country (same type, same position to 0.01°) keeps its existing name and aliases,
so hand-checked names survive a rebuild; existing places the dump no longer yields (e.g. volcanoes added by hand) are kept.
GeoNames data: CC BY 4.0, https://download.geonames.org/export/dump/

Needs shapely and opencc-python-reimplemented. Run from the project root, e.g.:
  <venv>/bin/python scripts/build_places.py 中國 china_coast.json <CN.txt> 中國 中国 China CN
  (country name, coast file, GeoNames file, then the country's search aliases)
"""
import json
import math
import os
import re
import sys
from opencc import OpenCC
from shapely.geometry import Point, Polygon
from shapely.ops import unary_union
from shapely.prepared import prep

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, 'scripts', 'source-data')
SEA_REACH_KM = 20
KEEP = {('A', 'ADM1'), ('A', 'ADM2'), ('P', 'PPLC'), ('P', 'PPLA'), ('P', 'PPLA2'), ('P', 'PPLA3'), ('P', 'PPL'),
        ('T', 'ISL'), ('T', 'ISLS'), ('T', 'CAPE'), ('H', 'BAY'), ('H', 'HBR'), ('S', 'PRT'), ('S', 'LTHSE')}
AT_SEA = {'ISL', 'ISLS', 'CAPE', 'BAY', 'HBR', 'PRT', 'LTHSE'}
MIN_TOWN_POP = 50000   # plain settlements (PPL) need at least this many people
CJK = re.compile(r'[一-鿿]')
to_traditional = OpenCC('s2t')


def outlines(file):
    data = json.load(open(os.path.join(SOURCE, file)))
    rings = []
    for flat in data['polys']:
        lon = lat = 0
        ring = []
        for i in range(0, len(flat), 2):
            lon += flat[i]
            lat += flat[i + 1]
            ring.append((lon / data['scale'], lat / data['scale']))
        if len(ring) >= 3:
            rings.append(Polygon(ring).buffer(0))
    return unary_union(rings)


def main(country, coast_file, geonames_file, *aliases):
    land = outlines(coast_file)
    path = os.path.join(SOURCE, 'places.json')
    data = json.load(open(path))
    previous = {}
    for p in data['countries'].get(country, {}).get('places', []):
        previous.setdefault((p['type'], round(p['lat'], 2), round(p['lon'], 2)), []).append(p)
    on_land = prep(land.buffer(.002))
    near = prep(land.buffer(SEA_REACH_KM / 111))
    places = []
    for line in open(geonames_file, encoding='utf-8'):
        f = line.rstrip('\n').split('\t')
        kind, code = f[6], f[7]
        if (kind, code) not in KEEP:
            continue
        lat, lon, pop = float(f[4]), float(f[5]), int(f[14] or 0)
        if code == 'PPL' and pop < MIN_TOWN_POP:
            continue
        point = Point(lon, lat)
        if not (on_land.contains(point) or (code in AT_SEA and near.contains(point))):
            continue
        chinese = []
        for alt in f[3].split(','):
            if CJK.search(alt) and not re.search(r'[A-Za-z\u3040-\u30ff]', alt):   # Chinese only: no Latin letters or Japanese kana
                name = to_traditional.convert(alt.strip())
                if name not in chinese:
                    chinese.append(name)
        chinese.sort(key=len)
        latin = [n for n in dict.fromkeys([f[1], f[2]]) if n]
        name = next((n for n in chinese if len(n) >= 2), latin[0])
        aliases = [n for n in chinese + latin if n != name][:6]
        same = previous.get((code, round(lat, 2), round(lon, 2)))
        kept = same.pop(0) if same else None
        if kept:
            name, aliases = kept['name'], kept['aliases']
        place = {'name': name, 'aliases': aliases, 'lat': round(lat, 4), 'lon': round(lon, 4), 'type': code}
        if pop:
            place['pop'] = pop
        places.append(place)
    places += [p for same in previous.values() for p in same]
    data['countries'][country] = {'aliases': list(aliases), 'places': places}
    json.dump(data, open(path, 'w'), ensure_ascii=False, separators=(',', ':'))
    print(f'{country}: {len(places)} places')


if __name__ == '__main__':
    main(*sys.argv[1:])
