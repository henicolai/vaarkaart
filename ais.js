// VaarKaart — AIS-laag (schepen live op de kaart)
// Gegevens: aisstream.io via een eigen Cloudflare Worker (worker/ais-worker.js).
(function () {
  'use strict';
  var WORKER = 'wss://vaarkaart-ais.hnicolai.workers.dev';  // AIS-doorgever (Cloudflare Worker)
  try { WORKER = localStorage.getItem('vaarkaart_ais_url') || WORKER; } catch (e) {}

  var schepen = {}, laag = null, ws = null, aan = false, vak = null, herTimer = null, opruimTimer = null, pogingen = 0, laatsteBericht = 0;
  var bron = 'wacht', bronTimer = null, bronTekst = '';  // stand van de verbinding Worker -> aisstream.io
  var BRON_TIMEOUT = 20000;
  var MAX_LEEFTIJD = 12 * 60000;
  var alleenVarend = false;
  try { alleenVarend = !!JSON.parse(localStorage.getItem('vaarkaart_lagen') || '{}')['toggle-ais-varend']; } catch (e) {}
  function verborgen(s) { return alleenVarend && !((s.sog || 0) >= 0.5); }

  function status(t) {
    var el = document.getElementById('ais-status');
    if (!el) return;
    el.style.display = t ? 'block' : 'none';
    el.textContent = t || '';
  }

  // AIS-scheepstype -> groep
  function groep(t) {
    if (t === 30) return ['Visserij', '#8d6e63'];
    if (t === 31 || t === 32 || t === 52) return ['Sleepvaart', '#00838f'];
    if (t === 36) return ['Zeiljacht', '#8e24aa'];
    if (t === 37) return ['Pleziervaart', '#8e24aa'];
    if (t >= 40 && t <= 49) return ['Snel vaartuig', '#f9a825'];
    if (t === 50 || t === 51 || t === 53 || t === 54 || t === 55 || t === 58) return ['Dienstvaartuig', '#00838f'];
    if (t >= 60 && t <= 69) return ['Passagiersschip', '#1565c0'];
    if (t >= 70 && t <= 79) return ['Vrachtschip', '#2e7d32'];
    if (t >= 80 && t <= 89) return ['Tanker', '#c62828'];
    return ['Schip', '#546e7a'];
  }

  function icoon(s) {
    var g = groep(s.type), kleur = g[1];
    var schaduw = 'filter:drop-shadow(0 0 1.5px #fff) drop-shadow(0 1px 2px rgba(0,0,0,.6));';
    var vaart = (s.sog || 0) >= 0.5;
    var richting = (s.hdg != null && s.hdg < 360) ? s.hdg : (vaart && s.cog != null && s.cog < 360 ? s.cog : null);
    if (richting == null) {
      return L.divIcon({ className: '', iconSize: [14, 14], iconAnchor: [7, 7], popupAnchor: [0, -7],
        html: '<div style="width:14px;height:14px;border-radius:50%;box-sizing:border-box;background:' + kleur + ';border:2px solid #fff;' + schaduw + '"></div>' });
    }
    var draai = richting + ((map.getBearing && map.getBearing()) || 0);
    var gr = vaart ? 26 : 20;
    return L.divIcon({ className: '', iconSize: [gr, gr], iconAnchor: [gr / 2, gr / 2], popupAnchor: [0, -gr / 2],
      html: '<svg viewBox="0 0 24 24" width="' + gr + '" height="' + gr + '" style="transform:rotate(' + draai + 'deg);' + schaduw + '">' +
        '<path d="M12 1 L18.5 21 L12 17.5 L5.5 21 Z" fill="' + kleur + '" fill-opacity="' + (vaart ? 1 : 0.55) + '" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>' });
  }

  // Land uit de eerste drie cijfers van het MMSI (MID) — de in onze wateren gangbare landen
  var MID = { 244: 'Nederland', 245: 'Nederland', 246: 'Nederland', 205: 'België', 211: 'Duitsland', 218: 'Duitsland', 219: 'Denemarken', 220: 'Denemarken',
    226: 'Frankrijk', 227: 'Frankrijk', 228: 'Frankrijk', 232: 'Verenigd Koninkrijk', 233: 'Verenigd Koninkrijk', 234: 'Verenigd Koninkrijk', 235: 'Verenigd Koninkrijk',
    257: 'Noorwegen', 258: 'Noorwegen', 259: 'Noorwegen', 265: 'Zweden', 266: 'Zweden', 230: 'Finland', 209: 'Cyprus', 210: 'Cyprus', 212: 'Cyprus',
    215: 'Malta', 229: 'Malta', 248: 'Malta', 249: 'Malta', 256: 'Malta', 236: 'Gibraltar', 237: 'Griekenland', 239: 'Griekenland', 240: 'Griekenland', 241: 'Griekenland',
    247: 'Italië', 224: 'Spanje', 225: 'Spanje', 263: 'Portugal', 255: 'Portugal (Madeira)', 250: 'Ierland', 261: 'Polen', 269: 'Zwitserland', 203: 'Oostenrijk',
    273: 'Rusland', 276: 'Estland', 275: 'Letland', 277: 'Litouwen', 271: 'Turkije', 304: 'Antigua en Barbuda', 305: 'Antigua en Barbuda',
    308: 'Bahama’s', 309: 'Bahama’s', 311: 'Bahama’s', 310: 'Bermuda', 319: 'Kaaimaneilanden', 306: 'Curaçao / Sint Maarten', 307: 'Aruba',
    351: 'Panama', 352: 'Panama', 353: 'Panama', 354: 'Panama', 355: 'Panama', 356: 'Panama', 357: 'Panama', 370: 'Panama', 371: 'Panama', 372: 'Panama', 373: 'Panama', 374: 'Panama',
    636: 'Liberia', 637: 'Liberia', 538: 'Marshalleilanden', 563: 'Singapore', 564: 'Singapore', 565: 'Singapore', 566: 'Singapore',
    477: 'Hongkong', 412: 'China', 413: 'China', 414: 'China', 431: 'Japan', 440: 'Zuid-Korea', 441: 'Zuid-Korea', 338: 'Verenigde Staten', 366: 'Verenigde Staten', 367: 'Verenigde Staten', 368: 'Verenigde Staten', 369: 'Verenigde Staten',
    316: 'Canada', 341: 'Saint Kitts en Nevis', 375: 'Saint Vincent', 376: 'Saint Vincent', 377: 'Saint Vincent', 378: 'Britse Maagdeneilanden', 620: 'Comoren', 657: 'Nigeria' };
  function mmsiInfo(mmsi) {
    var t = String(mmsi);
    if (t.length !== 9) return '';
    if (t.slice(0, 2) === '00') return 'kuststation ' + (MID[+t.slice(2, 5)] || '');
    if (t.charAt(0) === '0') return 'groepsoproep';
    if (t.slice(0, 3) === '111') return 'SAR-luchtvaartuig';
    if (t.slice(0, 2) === '97') return t.slice(0, 3) === '970' ? 'AIS-SART (noodbaken)' : t.slice(0, 3) === '972' ? 'MOB-baken' : 'EPIRB';
    if (t.slice(0, 2) === '99') return 'hulp voor de navigatie (AtoN)';
    if (t.slice(0, 2) === '98') return 'bijboot / vaartuig bij moederschip';
    if (t.charAt(0) === '8') return 'marifoon (handheld) ' + (MID[+t.slice(1, 4)] || '');
    return MID[+t.slice(0, 3)] || ('landcode ' + t.slice(0, 3));
  }
  var NAVSTATUS = ['Varend op motor', 'Voor anker', 'Niet onder commando', 'Beperkt manoeuvreerbaar', 'Beperkt door diepgang', 'Afgemeerd', 'Aan de grond', 'Vissend', 'Zeilend'];

  function rad(g) { return g * Math.PI / 180; }
  function afstandNm(a, b, c, d) { return haversine(a, b, c, d) / 1852; }
  function peiling(lat1, lon1, lat2, lon2) {
    var y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
    var x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }
  // Dichtste nadering (CPA in zeemijl, TCPA in minuten) t.o.v. eigen schip
  function cpa(s) {
    var p = window._laatsteGpsPositie, b = window._eigenBeweging;
    if (!p || !b || b.speed == null || b.heading == null || isNaN(b.heading)) return null;
    var eigenKn = b.speed * 1.94384;
    if (eigenKn < 0.5 && (s.sog || 0) < 0.5) return null;
    var cl = Math.cos(rad(p.lat));
    var dx = (s.lon - p.lon) * 60 * cl, dy = (s.lat - p.lat) * 60;              // zeemijl
    var vx = (s.sog || 0) * Math.sin(rad(s.cog || 0)) - eigenKn * Math.sin(rad(b.heading));
    var vy = (s.sog || 0) * Math.cos(rad(s.cog || 0)) - eigenKn * Math.cos(rad(b.heading));
    var v2 = vx * vx + vy * vy;
    if (v2 < 0.01) return null;
    var t = -(dx * vx + dy * vy) / v2;                                           // uur
    if (t < 0 || t > 1) return null;
    var cx = dx + vx * t, cy = dy + vy * t;
    return { nm: Math.sqrt(cx * cx + cy * cy), min: t * 60 };
  }

  function popup(s) {
    var g = groep(s.type);
    var oud = Math.round((Date.now() - s.t) / 1000);
    var land = mmsiInfo(s.mmsi);
    var h = '<b>🚢 ' + (s.naam || 'Onbekende naam') + '</b><br>' + g[0];
    if (s.len) h += ' · ' + s.len + ' m' + (s.br ? ' × ' + s.br + ' m' : '');
    if (s.diep) h += ' · diepgang ' + s.diep.toFixed(1) + ' m';
    h += '<div style="margin:4px 0;padding:4px 6px;background:rgba(0,0,0,0.06);border-radius:4px;font-size:12px;line-height:1.5">' +
      'MMSI: <b>' + s.mmsi + '</b>' + (land ? ' (' + land + ')' : '') +
      (s.call ? '<br>Roepnaam: <b>' + s.call + '</b>' : '') +
      (s.imo ? '<br>IMO: <b>' + s.imo + '</b>' : '') +
      (s.klasse ? '<br>AIS-klasse: ' + s.klasse : '') + '</div>';
    if (s.nav != null && NAVSTATUS[s.nav]) h += 'Status: <b>' + NAVSTATUS[s.nav] + '</b><br>';
    h += 'Snelheid: <b>' + (s.sog != null ? s.sog.toFixed(1) + ' kn' : '—') + '</b>';
    if (s.cog != null && s.cog < 360 && (s.sog || 0) >= 0.5) h += ' · koers <b>' + Math.round(s.cog) + '°</b>';
    if (s.best) h += '<br>Bestemming: ' + s.best;
    var p = window._laatsteGpsPositie;
    if (p) {
      h += '<br>Afstand: <b>' + afstandNm(p.lat, p.lon, s.lat, s.lon).toFixed(2) + ' NM</b> · peiling ' + Math.round(peiling(p.lat, p.lon, s.lat, s.lon)) + '°';
      var c = cpa(s);
      if (c) h += '<br>Dichtste nadering: <b>' + c.nm.toFixed(2) + ' NM</b> over ' + Math.round(c.min) + ' min';
    }
    h += '<br><a href="https://www.vesselfinder.com/vessels/details/' + s.mmsi + '" target="_blank" rel="noopener">Meer over dit schip ↗</a>';
    h += '<br><small style="color:#888">' + (oud < 90 ? oud + ' s' : Math.round(oud / 60) + ' min') + ' geleden · aisstream.io</small>';
    return h;
  }

  function teken(s) {
    if (!laag || s.lat == null) return;
    if (verborgen(s)) { if (s.m) { laag.removeLayer(s.m); s.m = null; } return; }
    if (!s.m) {
      s.m = L.marker([s.lat, s.lon], { icon: icoon(s), zIndexOffset: 700 }).addTo(laag);
      s.m.bindPopup(function () { return popup(s); }, { maxWidth: 230 });
      s.m.bindTooltip(function () { return s.naam || String(s.mmsi); }, { direction: 'right', offset: [10, 0], opacity: 0.9 });
    } else {
      s.m.setLatLng([s.lat, s.lon]);
      s.m.setIcon(icoon(s));
    }
  }

  function verwerk(d) {
    var md = d.MetaData || {}, mmsi = md.MMSI;
    if (!mmsi) return;
    var s = schepen[mmsi] || (schepen[mmsi] = { mmsi: mmsi });
    var naam = (md.ShipName || '').trim();
    if (naam) s.naam = naam;
    var msg = d.Message || {};
    var pr = msg.PositionReport || msg.StandardClassBPositionReport || msg.ExtendedClassBPositionReport;
    if (pr) {
      if (Math.abs(pr.Latitude) > 90 || Math.abs(pr.Longitude) > 180) return;
      s.lat = pr.Latitude; s.lon = pr.Longitude; s.sog = pr.Sog < 102 ? pr.Sog : null; s.cog = pr.Cog; s.hdg = pr.TrueHeading; s.t = Date.now();
      s.klasse = msg.PositionReport ? 'A' : 'B';
      if (msg.PositionReport && pr.NavigationalStatus != null) s.nav = pr.NavigationalStatus;
      if (msg.ExtendedClassBPositionReport) { s.type = pr.Type || s.type; if ((pr.Name || '').trim()) s.naam = pr.Name.trim(); }
      teken(s);
    }
    var st = msg.ShipStaticData;
    if (st) {
      s.type = st.Type; s.best = (st.Destination || '').replace(/@+/g, '').trim();
      if ((st.Name || '').trim()) s.naam = st.Name.trim();
      if (st.Dimension) { s.len = (st.Dimension.A || 0) + (st.Dimension.B || 0) || null; s.br = (st.Dimension.C || 0) + (st.Dimension.D || 0) || null; }
      if ((st.CallSign || '').trim()) s.call = st.CallSign.replace(/@+/g, '').trim();
      if (st.ImoNumber) s.imo = st.ImoNumber;
      if (st.MaximumStaticDraught) s.diep = st.MaximumStaticDraught;
      if (s.m) s.m.setIcon(icoon(s));
    }
    var sr = msg.StaticDataReport;
    if (sr) {
      if (sr.ReportA && (sr.ReportA.Name || '').trim()) s.naam = sr.ReportA.Name.trim();
      if (sr.ReportB) { if (sr.ReportB.ShipType) s.type = sr.ReportB.ShipType; var dm = sr.ReportB.Dimension; if (dm) { s.len = (dm.A || 0) + (dm.B || 0) || s.len; s.br = (dm.C || 0) + (dm.D || 0) || s.br; } if ((sr.ReportB.CallSign || '').trim()) s.call = sr.ReportB.CallSign.replace(/@+/g, '').trim(); }
      if (s.m) s.m.setIcon(icoon(s));
    }
  }

  function ruimOp() {
    var nu = Date.now(), n = 0;
    Object.keys(schepen).forEach(function (k) {
      var s = schepen[k];
      if (!s.t || nu - s.t > MAX_LEEFTIJD) { if (s.m && laag) laag.removeLayer(s.m); delete schepen[k]; }
      else if (s.m) n++;
    });
    if (!aan || !ws || ws.readyState !== 1) return;
    if (bron !== 'ok') { status(bronTekst); return; }  // nog geen (werkende) verbinding met aisstream
    status(n ? n + ' schepen in beeld (aisstream.io)' : (nu - laatsteBericht > 60000 ? 'Verbonden — nog geen schepen ontvangen in dit gebied' : 'Verbonden — wachten op schepen…'));
  }

  // Vak rond de kaart, hooguit ±0,5° (ca. 30 NM) rond het midden
  function gewenstVak() {
    var b = map.getBounds().pad(0.3), c = map.getCenter();
    var s = Math.max(b.getSouth(), c.lat - 0.5), n = Math.min(b.getNorth(), c.lat + 0.5);
    var w = Math.max(b.getWest(), c.lng - 0.9), e = Math.min(b.getEast(), c.lng + 0.9);
    return { s: +s.toFixed(3), w: +w.toFixed(3), n: +n.toFixed(3), e: +e.toFixed(3) };
  }
  function binnenVak() {
    if (!vak) return false;
    var b = map.getBounds(), c = map.getCenter();
    var s = Math.max(b.getSouth(), c.lat - 0.5), n = Math.min(b.getNorth(), c.lat + 0.5), w = Math.max(b.getWest(), c.lng - 0.9), e = Math.min(b.getEast(), c.lng + 0.9);
    return s >= vak.s && n <= vak.n && w >= vak.w && e <= vak.e;
  }

  function verbind() {
    clearTimeout(herTimer);
    if (!aan) return;
    if (!WORKER) { status('AIS-server is nog niet ingesteld'); return; }
    vak = gewenstVak();
    status('Verbinden met AIS…');
    var sock;
    try { sock = new WebSocket(WORKER + '?s=' + vak.s + '&w=' + vak.w + '&n=' + vak.n + '&e=' + vak.e); }
    catch (e) { status('AIS niet bereikbaar'); return; }
    ws = sock;
    bron = 'wacht'; bronTekst = 'AIS: verbinden met aisstream…';
    sock.onopen = function () {
      laatsteBericht = Date.now();
      status(bronTekst);
      clearTimeout(bronTimer);
      bronTimer = setTimeout(function () {
        if (ws !== sock || bron === 'ok') return;
        bron = 'traag'; bronTekst = 'AIS: aisstream.io reageert niet — blijft proberen…';
        status(bronTekst);
      }, BRON_TIMEOUT);
    };
    sock.onmessage = function (ev) {
      var verw = function (t) {
        try {
          var d = JSON.parse(t);
          if (d.error) { bron = 'fout'; bronTekst = 'AIS: ' + d.error; status(bronTekst); return; }
          if (d.status) {
            if (/^verbonden met/.test(d.status)) { bron = 'ok'; pogingen = 0; laatsteBericht = Date.now(); clearTimeout(bronTimer); status('Verbonden — wachten op schepen…'); }
            else if (bron !== 'traag' || /sloot|weigert|onbereikbaar/.test(d.status)) { bronTekst = 'AIS: ' + d.status; status(bronTekst); }
            return;
          }
          if (bron !== 'ok') { bron = 'ok'; pogingen = 0; clearTimeout(bronTimer); }
          laatsteBericht = Date.now();
          verwerk(d);
        } catch (e) {}
      };
      if (typeof ev.data === 'string') verw(ev.data); else if (ev.data && ev.data.text) ev.data.text().then(verw);
    };
    sock.onclose = function () {
      if (ws !== sock) return;
      ws = null;
      clearTimeout(bronTimer);
      if (!aan) return;
      pogingen++;
      status(bron === 'ok' ? 'AIS-verbinding verbroken — opnieuw proberen…' : (bronTekst || 'AIS niet bereikbaar') + ' — opnieuw proberen…');
      herTimer = setTimeout(verbind, Math.min(60000, 3000 * pogingen));
    };
    sock.onerror = function () { try { sock.close(); } catch (e) {} };
  }

  function verschoven() {
    if (!aan || !ws || ws.readyState !== 1 || binnenVak()) return;
    vak = gewenstVak();
    try { ws.send(JSON.stringify(vak)); } catch (e) {}
  }
  function herteken() { Object.keys(schepen).forEach(function (k) { var s = schepen[k]; if (s.m) s.m.setIcon(icoon(s)); }); }

  window.toggleAIS = function (zet) {
    aan = zet;
    if (typeof _slaLaagOp === 'function') _slaLaagOp('toggle-ais', zet);
    if (zet) {
      if (!laag) laag = L.layerGroup();
      laag.addTo(map);
      verbind();
      clearInterval(opruimTimer); opruimTimer = setInterval(ruimOp, 10000);
    } else {
      clearTimeout(herTimer); clearInterval(opruimTimer); clearTimeout(bronTimer);
      if (ws) { var w = ws; ws = null; try { w.close(); } catch (e) {} }
      if (laag) { laag.clearLayers(); map.removeLayer(laag); }
      schepen = {};
      status('');
    }
  };
  window.toggleAISVarend = function (zet) {
    alleenVarend = zet;
    if (typeof _slaLaagOp === 'function') _slaLaagOp('toggle-ais-varend', zet);
    Object.keys(schepen).forEach(function (k) { teken(schepen[k]); });
    ruimOp();
  };
  window._aisTest = { verwerk: verwerk, schepen: function () { return schepen; }, cpa: cpa };

  function start() {
    if (typeof map === 'undefined' || !map) { setTimeout(start, 300); return; }
    var cv = document.getElementById('toggle-ais-varend'); if (cv) cv.checked = alleenVarend;
    map.on('moveend', verschoven);
    map.on('rotate', herteken);
    // Bij terugkeer naar de app meteen opnieuw verbinden
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && aan && (!ws || ws.readyState > 1)) verbind();
    });
    try {
      if (typeof _lagenStaten !== 'undefined' && _lagenStaten['toggle-ais']) {
        var cb = document.getElementById('toggle-ais'); if (cb) cb.checked = true;
        setTimeout(function () { window.toggleAIS(true); }, 1200);
      }
    } catch (e) {}
  }
  start();
})();
