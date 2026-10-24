"""Add or replace sea areas in dist/Data/seas.json from Natural Earth marine polygons, clipped to a box.

Natural Earth 10m geography marine polys (public domain):
  https://naciscdn.org/naturalearth/10m/physical/ne_10m_geography_marine_polys.zip
Each entry below gives the Natural Earth English name and how the game shows it (kind, colour, label priority, the
highest camera at which the label shows, label position [lat, lon]; without one the label goes at a point inside the
largest piece). An existing entry with the same Chinese name is replaced.

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
CLIP = (85.0, -15.0, 165.0, 56.0)   # lon0, lat0, lon1, lat1 of the map's seas
SEAS = [
    {'en': 'South China Sea', 'zh': '南海', 'kind': 'sea', 'color': '#fc8181', 'priority': 95, 'maxHeight': None, 'label': [19.0, 116.5]},
    {'en': 'Gulf of Tonkin', 'zh': '北部灣', 'kind': 'bay', 'color': '#cbd5e0', 'priority': 60, 'maxHeight': 2200, 'label': [20.3, 108.3]},
    {'en': 'Qiongzhou Strait', 'zh': '瓊州海峽', 'kind': 'strait', 'color': '#fbd38d', 'priority': 55, 'maxHeight': 900, 'label': [20.2, 110.25]},
    {'en': 'Gulf of Thailand', 'zh': '泰國灣', 'kind': 'bay', 'color': '#cbd5e0', 'priority': 70, 'maxHeight': 2600, 'label': [9.8, 102.5]},
    {'en': 'Java Sea', 'zh': '爪哇海', 'kind': 'sea', 'color': '#f6ad55', 'priority': 80, 'maxHeight': 2600, 'label': [-3.8, 112.0]},
    {'en': 'Makassar Strait', 'zh': '望加錫海峽', 'kind': 'strait', 'color': '#fbd38d', 'priority': 65, 'maxHeight': 2200, 'label': [-1.5, 118.3]},
    {'en': 'Andaman Sea', 'zh': '安達曼海', 'kind': 'sea', 'color': '#cbd5e0', 'priority': 80, 'maxHeight': 2600},
    {'en': 'Strait of Malacca', 'zh': '麻六甲海峽', 'kind': 'strait', 'color': '#fbd38d', 'priority': 75, 'maxHeight': 2200},
    {'en': 'Strait of Singapore', 'zh': '新加坡海峽', 'kind': 'strait', 'color': '#fbd38d', 'priority': 55, 'maxHeight': 700},
    {'en': 'Gulf of Martaban', 'zh': '馬達班灣', 'kind': 'bay', 'color': '#cbd5e0', 'priority': 50, 'maxHeight': 1200},
    {'en': 'Bay of Bengal', 'zh': '孟加拉灣', 'kind': 'bay', 'color': '#cbd5e0', 'priority': 80, 'maxHeight': 2600},
    {'en': 'Banda Sea', 'zh': '班達海', 'kind': 'sea', 'color': '#cbd5e0', 'priority': 80, 'maxHeight': 2600},
    {'en': 'Arafura Sea', 'zh': '阿拉弗拉海', 'kind': 'sea', 'color': '#cbd5e0', 'priority': 80, 'maxHeight': 2600},
    {'en': 'Timor Sea', 'zh': '帝汶海', 'kind': 'sea', 'color': '#cbd5e0', 'priority': 80, 'maxHeight': 2600},
    {'en': 'Molucca Sea', 'zh': '馬魯古海', 'kind': 'sea', 'color': '#cbd5e0', 'priority': 70, 'maxHeight': 2200},
    {'en': 'Ceram Sea', 'zh': '塞蘭海', 'kind': 'sea', 'color': '#cbd5e0', 'priority': 65, 'maxHeight': 2000},
    {'en': 'Halmahera Sea', 'zh': '哈馬黑拉海', 'kind': 'sea', 'color': '#cbd5e0', 'priority': 60, 'maxHeight': 1600},
    {'en': 'Flores Sea', 'zh': '弗洛勒斯海', 'kind': 'sea', 'color': '#cbd5e0', 'priority': 70, 'maxHeight': 2200},
    {'en': 'Savu Sea', 'zh': '薩武海', 'kind': 'sea', 'color': '#cbd5e0', 'priority': 65, 'maxHeight': 2000},
    {'en': 'Bali Sea', 'zh': '峇里海', 'kind': 'sea', 'color': '#cbd5e0', 'priority': 60, 'maxHeight': 1600},
    {'en': 'Selat Bali', 'zh': '峇里海峽', 'kind': 'strait', 'color': '#fbd38d', 'priority': 45, 'maxHeight': 700},
    {'en': 'Gulf of Tomini', 'zh': '托米尼灣', 'kind': 'bay', 'color': '#cbd5e0', 'priority': 55, 'maxHeight': 1400},
    {'en': 'Philippine Sea', 'zh': '菲律賓海', 'kind': 'sea', 'color': '#b794f4', 'priority': 95, 'maxHeight': None, 'label': [24.0, 135.0]},
    {'en': 'Sulu Sea', 'zh': '蘇祿海', 'kind': 'sea', 'color': '#f6ad55', 'priority': 80, 'maxHeight': 2600, 'label': [8.8, 120.2]},
    {'en': 'Celebes Sea', 'zh': '西里伯斯海', 'kind': 'sea', 'color': '#f6ad55', 'priority': 80, 'maxHeight': 2600, 'label': [5.5, 122.5]},
    {'en': 'Sibuyan Sea', 'zh': '錫布延海', 'kind': 'sea', 'color': '#cbd5e0', 'priority': 60, 'maxHeight': 1600},
    {'en': 'Visayan Sea', 'zh': '米沙鄢海', 'kind': 'sea', 'color': '#cbd5e0', 'priority': 60, 'maxHeight': 1600},
    {'en': 'Samar Sea', 'zh': '薩馬海', 'kind': 'sea', 'color': '#cbd5e0', 'priority': 55, 'maxHeight': 1400},
    {'en': 'Bohol Sea', 'zh': '保和海', 'kind': 'sea', 'color': '#cbd5e0', 'priority': 60, 'maxHeight': 1600},
    {'en': 'Davao Gulf', 'zh': '達沃灣', 'kind': 'bay', 'color': '#cbd5e0', 'priority': 50, 'maxHeight': 1200},
    {'en': 'Leyte Gulf', 'zh': '萊特灣', 'kind': 'bay', 'color': '#cbd5e0', 'priority': 50, 'maxHeight': 1200},
    {'en': 'Ragay Gulf', 'zh': '拉蓋灣', 'kind': 'bay', 'color': '#cbd5e0', 'priority': 45, 'maxHeight': 900},
    {'en': 'Tayabas Bay', 'zh': '塔亞巴灣', 'kind': 'bay', 'color': '#cbd5e0', 'priority': 45, 'maxHeight': 900},
    {'en': 'Surigao Strait', 'zh': '蘇里高海峽', 'kind': 'strait', 'color': '#fbd38d', 'priority': 50, 'maxHeight': 900},
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
        if 'label' not in entry:
            inside = max(parts, key=lambda p: p.area).representative_point()
            entry['label'] = [round(inside.y, 3), round(inside.x, 3)]
        data['seas'] = [s for s in data['seas'] if s['zh'] != sea['zh']] + [entry]
        print(f"{sea['zh']}: {len(parts)} ring(s)")
    json.dump(data, open(PATH, 'w'), ensure_ascii=False, separators=(',', ':'))


if __name__ == '__main__':
    main(sys.argv[1])
