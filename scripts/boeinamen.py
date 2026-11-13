#!/usr/bin/env python3
"""Haalt namen van boeien en bakens (OpenStreetMap/OpenSeaMap) op en schrijft data/boeinamen.json."""
import json, os, sys, time, urllib.parse, urllib.request
from datetime import datetime, timezone

SERVERS = ['https://overpass-api.de/api/interpreter',
           'https://overpass.private.coffee/api/interpreter',
           'https://overpass.kumi.systems/api/interpreter']
QUERY = '[out:json][timeout:170];node["seamark:type"~"^(buoy|beacon)_"](50.7,2.5,53.9,7.3);out body;'

def haal():
    data = urllib.parse.urlencode({'data': QUERY}).encode()
    fout = None
    for ronde in range(3):
        for s in SERVERS:
            try:
                req = urllib.request.Request(s, data=data, headers={'User-Agent': 'VaarKaart (github.com/henicolai/vaarkaart)'})
                with urllib.request.urlopen(req, timeout=200) as r:
                    return json.load(r)
            except Exception as e:  # noqa
                fout = e
                print('mislukt', s, e, file=sys.stderr)
        time.sleep(30)
    raise fout

def main():
    d = haal()
    punten = []
    for el in d.get('elements', []):
        t = el.get('tags', {})
        naam = t.get('seamark:name') or t.get('name') or t.get('seamark:ref') or t.get('ref')
        if not naam or 'lat' not in el:
            continue
        punten.append([round(el['lat'], 5), round(el['lon'], 5), naam.strip()[:40]])
    if len(punten) < 500:
        sys.exit('Te weinig boeien (%d); bestaand bestand blijft staan.' % len(punten))
    punten.sort()
    os.makedirs('data', exist_ok=True)
    with open('data/boeinamen.json', 'w') as f:
        json.dump({'gemaakt': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
                   'bron': 'OpenStreetMap / OpenSeaMap (ODbL)', 'punten': punten}, f, ensure_ascii=False, separators=(',', ':'))
    print(len(punten), 'boeien en bakens met naam')

if __name__ == '__main__':
    main()
