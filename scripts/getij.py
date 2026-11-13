#!/usr/bin/env python3
"""Haalt astronomische hoog- en laagwaters op bij Rijkswaterstaat en schrijft data/getij.json.

De browser mag de RWS-webservice niet rechtstreeks aanroepen (CORS). Daarom haalt
GitHub dit dagelijks op en leest VaarKaart het bestand uit de eigen site.
"""
import json, os, sys, time, urllib.request
from datetime import datetime, timedelta, timezone

BASIS = 'https://ddapi20-waterwebservices.rijkswaterstaat.nl/ONLINEWAARNEMINGENSERVICES/OphalenWaarnemingen'
DAGEN_VOORUIT = 400
STATIONS = {  # code in VaarKaart -> (RWS-locatiecode, naam)
    'VLISSGN':    ('vlissingen', 'Vlissingen'),
    'HOEKVHLD':   ('hoekvanholland', 'Hoek van Holland'),
    'SCHEVNGN':   ('scheveningen', 'Scheveningen'),
    'IJMDBTHVN':  ('ijmuiden.buitenhaven', 'IJmuiden'),
    'DENHDR':     ('denhelder.marsdiep', 'Den Helder'),
    'WESTTSLG':   ('terschelling.west', 'West-Terschelling'),
    'HUIBGT':     ('huibertgat', 'Huibertgat'),
    'DELFZL':     ('delfzijl', 'Delfzijl'),
    'HARVT':      ('harlingen.waddenzee', 'Harlingen'),
    'KORNWDZBTN': ('kornwerderzand.waddenzee.buitenhaven', 'Kornwerderzand'),
    'OUDSD':      ('texel.oudeschild', 'Oudeschild'),
    'LAUWOG':     ('lauwersoog.waddenzee', 'Lauwersoog'),
}

def iso(d):
    return d.strftime('%Y-%m-%dT%H:%M:%S.000+00:00')

def haal(locatie, van, tot):
    body = json.dumps({
        'Locatie': {'Code': locatie},
        'AquoPlusWaarnemingMetadata': {'AquoMetadata': {
            'Compartiment': {'Code': 'OW'}, 'Grootheid': {'Code': 'WATHTE'},
            'Groepering': {'Code': 'GETETBRKD2'}}},
        'Periode': {'Begindatumtijd': iso(van), 'Einddatumtijd': iso(tot)},
    }).encode()
    req = urllib.request.Request(BASIS, data=body, headers={'Content-Type': 'application/json'})
    for poging in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception as e:  # noqa
            fout = e
            time.sleep(5)
    raise fout

def main():
    nu = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    van, tot = nu - timedelta(days=2), nu + timedelta(days=DAGEN_VOORUIT)
    uit = {'gemaakt': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
           'bron': 'Rijkswaterstaat, astronomisch getij t.o.v. NAP (cm)',
           'uitleg': 'extremen: [minuten sinds 1970 UTC, hoogte in cm NAP, 1=hoogwater 0=laagwater]',
           'stations': {}}
    for code, (loc, naam) in STATIONS.items():
        try:
            d = haal(loc, van, tot)
            punten = []
            for w in d.get('WaarnemingenLijst', []):
                if w.get('AquoMetadata', {}).get('Hoedanigheid', {}).get('Code') != 'NAP':
                    continue
                for m in w.get('MetingenLijst', []):
                    v = m.get('Meetwaarde', {}).get('Waarde_Numeriek')
                    if v is None or abs(v) > 900:
                        continue
                    t = datetime.fromisoformat(m['Tijdstip'])
                    punten.append((int(t.timestamp() // 60), int(round(v))))
            punten = sorted(set(punten))
            ext = []
            for i, (t, v) in enumerate(punten):
                buur = punten[i - 1][1] if i > 0 else punten[i + 1][1]
                ext.append([t, v, 1 if v > buur else 0])
            if len(ext) < 10:
                raise RuntimeError('te weinig gegevens (%d)' % len(ext))
            uit['stations'][code] = {'naam': naam, 'rws': loc, 'extremen': ext}
            print(code, len(ext))
        except Exception as e:  # noqa
            print('MISLUKT', code, e, file=sys.stderr)
    if len(uit['stations']) < 6:
        sys.exit('Te weinig stations opgehaald; bestaand bestand blijft staan.')
    os.makedirs('data', exist_ok=True)
    with open('data/getij.json', 'w') as f:
        json.dump(uit, f, separators=(',', ':'))

if __name__ == '__main__':
    main()
