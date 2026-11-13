#!/usr/bin/env python3
"""Haalt de laatste stroommetingen op bij Rijkswaterstaat en schrijft data/stroom.json."""
import json, os, sys, urllib.request
from datetime import datetime, timezone

URL = 'https://ddapi20-waterwebservices.rijkswaterstaat.nl/ONLINEWAARNEMINGENSERVICES/OphalenLaatsteWaarnemingen'
PUNTEN = {  # RWS-locatiecode -> (naam, lat, lon); alleen punten die snelheid én richting meten
    'denhelder.waddenzee.mondingnieuwehaven': ('Den Helder, Marsdiep', 52.967, 4.794),
    'eemshaven.waddenzee': ('Eemshaven', 53.474, 6.822),
    'ijgeul.1': ('IJgeul (IJmuiden)', 52.464, 4.518),
    'schaar.stroomgat': ('Schaar', 51.652, 3.100),
    'buitenbanken.west': ('Buitenbanken', 51.795, 2.972),
}

def main():
    body = json.dumps({
        'AquoPlusWaarnemingMetadataLijst': [
            {'AquoMetadata': {'Compartiment': {'Code': 'OW'}, 'Grootheid': {'Code': 'STROOMSHD'}}},
            {'AquoMetadata': {'Compartiment': {'Code': 'OW'}, 'Grootheid': {'Code': 'STROOMRTG'}}}],
        'LocatieLijst': [{'Code': c} for c in PUNTEN],
    }).encode()
    req = urllib.request.Request(URL, data=body, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as r:
        d = json.load(r)
    laatste = {}  # (code, grootheid) -> (tijd, waarde)
    for w in d.get('WaarnemingenLijst', []):
        code = w.get('Locatie', {}).get('Code')
        g = w.get('AquoMetadata', {}).get('Grootheid', {}).get('Code')
        for m in w.get('MetingenLijst', []):
            v = m.get('Meetwaarde', {}).get('Waarde_Numeriek')
            if v is None or abs(v) > 900:
                continue
            t = datetime.fromisoformat(m['Tijdstip']).timestamp()
            if (code, g) not in laatste or t > laatste[(code, g)][0]:
                laatste[(code, g)] = (t, v)
    nu = datetime.now(timezone.utc).timestamp()
    punten = []
    for code, (naam, lat, lon) in PUNTEN.items():
        s, r = laatste.get((code, 'STROOMSHD')), laatste.get((code, 'STROOMRTG'))
        if not s or not r or nu - min(s[0], r[0]) > 6 * 3600:
            continue  # geen recente meting
        punten.append({'code': code, 'naam': naam, 'lat': lat, 'lon': lon,
                       'tijd': int(min(s[0], r[0]) // 60), 'ms': round(abs(s[1]), 3), 'graden': round(r[1], 1)})
    os.makedirs('data', exist_ok=True)
    with open('data/stroom.json', 'w') as f:
        json.dump({'gemaakt': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
                   'bron': 'Rijkswaterstaat, gemeten stroming (tijd = minuten sinds 1970 UTC, ms = m/s)',
                   'punten': punten}, f, separators=(',', ':'))
    print(len(punten), 'punten')

if __name__ == '__main__':
    main()
