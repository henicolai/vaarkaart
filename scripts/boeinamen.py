#!/usr/bin/env python3
"""Haalt namen van boeien en bakens (OpenStreetMap/OpenSeaMap) op en schrijft data/boeinamen.json."""
import json, os, sys, time, urllib.parse, urllib.request
from datetime import datetime, timezone

SERVERS = ['https://overpass-api.de/api/interpreter',
           'https://overpass.private.coffee/api/interpreter',
           'https://overpass.kumi.systems/api/interpreter']
# Kleinere vakken: minder kans op time-outs bij drukke Overpass-servers
VAKKEN = [(50.7, 2.5, 52.3, 4.9), (50.7, 4.9, 52.3, 7.3), (52.3, 2.5, 53.9, 4.9), (52.3, 4.9, 53.9, 7.3)]

def query(b):
    return '[out:json][timeout:120];node["seamark:type"~"^(buoy|beacon)_"](%s,%s,%s,%s);out body;' % b

def haal(b):
    data = urllib.parse.urlencode({'data': query(b)}).encode()
    fout = None
    for ronde in range(3):
        for s in SERVERS:
            try:
                req = urllib.request.Request(s, data=data, headers={'User-Agent': 'VaarKaart (github.com/henicolai/vaarkaart)'})
                with urllib.request.urlopen(req, timeout=150) as r:
                    return json.load(r)
            except Exception as e:  # noqa
                fout = e
                print('mislukt', s, e, file=sys.stderr)
        time.sleep(30)
    raise fout

def main():
    elementen = []
    try:
        for b in VAKKEN:
            elementen += haal(b).get('elements', [])
    except Exception as e:
        # Overpass onbereikbaar: oud bestand houden, run niet laten mislukken
        print('::warning::Overpass niet bereikbaar (%s); bestaand bestand blijft staan.' % e)
        return
    punten = []
    for el in elementen:
        t = el.get('tags', {})
        naam = t.get('seamark:name') or t.get('name') or t.get('seamark:ref') or t.get('ref')
        if not naam or 'lat' not in el:
            continue
        punten.append([round(el['lat'], 5), round(el['lon'], 5), naam.strip()[:40]])
    if len(punten) < 500:
        print('::warning::Te weinig boeien (%d); bestaand bestand blijft staan.' % len(punten))
        return
    punten = sorted(set(map(tuple, punten)))
    os.makedirs('data', exist_ok=True)
    with open('data/boeinamen.json', 'w') as f:
        json.dump({'gemaakt': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
                   'bron': 'OpenStreetMap / OpenSeaMap (ODbL)', 'punten': punten}, f, ensure_ascii=False, separators=(',', ':'))
    print(len(punten), 'boeien en bakens met naam')

if __name__ == '__main__':
    main()
