#!/usr/bin/env python3
"""Haalt de scheepvaartberichten (stremmingen en beperkingen) voor de komende 7 dagen op
bij vaarweginformatie.nl (Rijkswaterstaat FIS) en schrijft data/stremmingen.json."""
import json, time, urllib.request
from datetime import datetime, timezone

URL = 'https://www.vaarweginformatie.nl/frp/api/messages/nts/summaries?validFrom=%d&validUntil=%d&ntsTypes=FTM&limitationGroup=%s'

def haal(groep, t0, t1):
    req = urllib.request.Request(URL % (t0, t1, groep), headers={'Accept': 'application/json', 'User-Agent': 'VaarKaart (github.com/henicolai/vaarkaart)'})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.load(r)

def main():
    t0 = int(time.time() * 1000); t1 = t0 + 7 * 86400 * 1000
    alles = haal('ALL', t0, t1)
    blok = {m['ntsSummaryId'] for m in haal('BLOCKED', t0, t1)}
    uit = []
    for m in alles:
        loc = [[round(p['lat'], 5), round(p['lon'], 5)] for p in (m.get('location') or []) if p.get('lat') and p.get('lon')]
        if not loc:
            continue
        n = m.get('ntsNumber') or {}
        uit.append({
            'id': m.get('ntsSummaryId'),
            'nr': '%s.%05d.%s' % (n.get('year', ''), n.get('number', 0), n.get('serialNumber', 0)),
            'vw': m.get('fairwayName') or '', 'loc': m.get('locationName') or '',
            'code': m.get('limitationCode') or '',
            'van': (m.get('startDate') or 0) // 60000, 'tot': (m['endDate'] // 60000) if m.get('endDate') else None,
            'blok': m.get('ntsSummaryId') in blok, 'p': loc[:40],
        })
    if not uit:
        raise SystemExit('geen berichten ontvangen; bestand niet overschreven')
    out = {'gemaakt': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
           'bron': 'Rijkswaterstaat FIS, vaarweginformatie.nl (van/tot = minuten sinds 1970 UTC)',
           'berichten': uit}
    with open('data/stremmingen.json', 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print(len(uit), 'berichten,', sum(1 for u in uit if u['blok']), 'stremmingen')

if __name__ == '__main__':
    main()
