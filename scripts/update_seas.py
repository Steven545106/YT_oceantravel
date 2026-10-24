"""Add or replace sea areas in dist/Data/seas.json from Natural Earth marine polygons, clipped to a box.

Natural Earth 10m geography marine polys (public domain):
  https://naciscdn.org/naturalearth/10m/physical/ne_10m_geography_marine_polys.zip
Each entry below gives the Natural Earth English name and how the game shows it (kind, colour, label priority, the
highest camera at which the label shows, label position). An existing entry with the same Chinese name is replaced.

Needs shapely and pyshp. Run from the project root:
  <venv>/bin/python scripts/update_seas.py <folder with ne_10m_geography_marine_polys.shp>
"""
import json
import os
import sys
import shapefile
from shapely.geometry import shape, box, Polygon

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATH = os.path.join(ROOT, 'dist', 'Data', 'seas.json')
CLIP = (105.0, 12.0, 165.0, 56.0)   # lon0, lat0, lon1, lat1 of the map's seas
SEAS = [
    {'en': 'South China Sea', 'zh': '南海', 'kind': 'sea', 'color': '#fc8181', 'priority': 95, 'maxHeight': None, 'label': [19.0, 116.5]},
    {'en': 'Gulf of Tonkin', 'zh': '北部灣', 'kind': 'bay', 'color': '#cbd5e0', 'priority': 60, 'maxHeight': 2200, 'label': [20.3, 108.3]},
    {'en': 'Qiongzhou Strait', 'zh': '瓊州海峽', 'kind': 'strait', 'color': '#fbd38d', 'priority': 55, 'maxHeight': 900, 'label': [20.2, 110.25]},
]


def encode(ring, scale):
    flat, plon, plat = [], 0, 0
    for lon, lat in ring:
        x, y = round(lon * scale), round(lat * scale)
        flat += [x - plon, y - plat]
        plon, plat = x, y
    return flat


def main(folder):
    data = json.load(open(PATH))
    scale = data['scale']
    reader = shapefile.Reader(os.path.join(folder, 'ne_10m_geography_marine_polys'))
    fields = [f[0] for f in reader.fields[1:]]
    found = {}
    for record in reader.iterShapeRecords():
        name = dict(zip(fields, record.record))['name']
        if any(sea['en'] == name for sea in SEAS):
            found[name] = shape(record.shape.__geo_interface__).buffer(0).intersection(box(*CLIP))
    for sea in SEAS:
        geometry = found[sea['en']]
        parts = [geometry] if isinstance(geometry, Polygon) else [g for g in geometry.geoms if isinstance(g, Polygon)]
        entry = {**sea, 'lines': [], 'rings': [encode(list(p.exterior.coords)[:-1], scale) for p in parts]}
        data['seas'] = [s for s in data['seas'] if s['zh'] != sea['zh']] + [entry]
        print(f"{sea['zh']}: {len(parts)} ring(s)")
    json.dump(data, open(PATH, 'w'), ensure_ascii=False, separators=(',', ':'))


if __name__ == '__main__':
    main(sys.argv[1])
