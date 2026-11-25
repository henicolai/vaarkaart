// VaarKaart — AIS-laag (schepen live op de kaart)
// Gegevens: aisstream.io via een eigen Cloudflare Worker (worker/ais-worker.js).
(function () {
  'use strict';
  var WORKER = 'wss://vaarkaart-ais.hnicolai.workers.dev';  // AIS-doorgever (Cloudflare Worker)
  try { WORKER = localStorage.getItem('vaarkaart_ais_url') || WORKER; } catch (e) {}

  var schepen = {}, laag = null, ws = null, aan = false, vak = null, herTimer = null, opruimTimer = null, pogingen = 0, laatsteBericht = 0;
  var MAX_LEEFTIJD = 12 * 60000;

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
    var h = '<b>🚢 ' + (s.naam || 'MMSI ' + s.mmsi) + '</b><br>' + g[0];
    if (s.len) h += ' · ' + s.len + ' m';
    h += '<br>Snelheid: <b>' + (s.sog != null ? s.sog.toFixed(1) + ' kn' : '—') + '</b>';
    if (s.cog != null && s.cog < 360 && (s.sog || 0) >= 0.5) h += ' · koers <b>' + Math.round(s.cog) + '°</b>';
    if (s.best) h += '<br>Bestemming: ' + s.best;
    var p = window._laatsteGpsPositie;
    if (p) {
      h += '<br>Afstand: <b>' + afstandNm(p.lat, p.lon, s.lat, s.lon).toFixed(2) + ' NM</b> · peiling ' + Math.round(peiling(p.lat, p.lon, s.lat, s.lon)) + '°';
      var c = cpa(s);
      if (c) h += '<br>Dichtste nadering: <b>' + c.nm.toFixed(2) + ' NM</b> over ' + Math.round(c.min) + ' min';
    }
    h += '<br><small style="color:#888">MMSI ' + s.mmsi + ' · ' + (oud < 90 ? oud + ' s' : Math.round(oud / 60) + ' min') + ' geleden · aisstream.io</small>';
    return h;
  }

  function teken(s) {
    if (!laag || s.lat == null) return;
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
      if (msg.ExtendedClassBPositionReport) { s.type = pr.Type || s.type; if ((pr.Name || '').trim()) s.naam = pr.Name.trim(); }
      teken(s);
    }
    var st = msg.ShipStaticData;
    if (st) {
      s.type = st.Type; s.best = (st.Destination || '').replace(/@+/g, '').trim();
      if ((st.Name || '').trim()) s.naam = st.Name.trim();
      if (st.Dimension) s.len = (st.Dimension.A || 0) + (st.Dimension.B || 0) || null;
      if (s.m) s.m.setIcon(icoon(s));
    }
    var sr = msg.StaticDataReport;
    if (sr) {
      if (sr.ReportA && (sr.ReportA.Name || '').trim()) s.naam = sr.ReportA.Name.trim();
      if (sr.ReportB) { if (sr.ReportB.ShipType) s.type = sr.ReportB.ShipType; var dm = sr.ReportB.Dimension; if (dm) s.len = (dm.A || 0) + (dm.B || 0) || s.len; }
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
    if (aan && ws && ws.readyState === 1) status(n ? n + ' schepen in beeld (aisstream.io)' : (nu - laatsteBericht > 60000 ? 'Verbonden — nog geen schepen ontvangen in dit gebied' : 'Verbonden — wachten op schepen…'));
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
    sock.onopen = function () { pogingen = 0; laatsteBericht = Date.now(); status('Verbonden — wachten op schepen…'); setTimeout(ruimOp, 4000); };
    sock.onmessage = function (ev) {
      laatsteBericht = Date.now();
      var verw = function (t) { try { var d = JSON.parse(t); if (d.error) { status('AIS: ' + d.error); return; } if (d.status) { if (/sloot|weigert|onbereikbaar/.test(d.status)) status('AIS: ' + d.status); return; } verwerk(d); } catch (e) {} };
      if (typeof ev.data === 'string') verw(ev.data); else if (ev.data && ev.data.text) ev.data.text().then(verw);
    };
    sock.onclose = function () {
      if (ws !== sock) return;
      ws = null;
      if (!aan) return;
      pogingen++;
      status('AIS-verbinding verbroken — opnieuw proberen…');
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
      clearTimeout(herTimer); clearInterval(opruimTimer);
      if (ws) { var w = ws; ws = null; try { w.close(); } catch (e) {} }
      if (laag) { laag.clearLayers(); map.removeLayer(laag); }
      schepen = {};
      status('');
    }
  };
  window._aisTest = { verwerk: verwerk, schepen: function () { return schepen; }, cpa: cpa };

  function start() {
    if (typeof map === 'undefined' || !map) { setTimeout(start, 300); return; }
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
