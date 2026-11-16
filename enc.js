// ── ENC ZEEKAART (S-57 cellen van de Dienst der Hydrografie, omgezet naar enc/*.json) ──
// Tekent de vectorkaart zelf op canvas-tegels: dieptevlakken, dieptelijnen, dieptecijfers,
// boeien, bakens, lichten, wrakken en gebieden. Vereenvoudigde weergave, geen officiële ECDIS.
(function () {
  'use strict';
  const ENC = { cat: null, cel: {}, bezig: {}, laag: null, aan: false, zee: false, binnen: false };
  const isBinnen = n => n.charAt(0) !== 'N';      // Rijkswaterstaat-cellen (1R7...) = binnenwater, NL... = zeekaart
  const soortAan = n => isBinnen(n) ? ENC.binnen : ENC.zee;
  window.ENC = ENC;

  // ── hulpfuncties ──
  const D2R = Math.PI / 180;
  const mx = lon => (lon + 180) / 360;
  const my = lat => (1 - Math.log(Math.tan(Math.PI / 4 + lat * D2R / 2)) / Math.PI) / 2;
  // kaartschaal -> zoomniveau vanaf waar de cel getoond wordt
  const minZoom = s => Math.max(4, Math.round(Math.log2(336e6 / s)) - 2);
  const schaalBij = z => 336e6 / Math.pow(2, z);

  const KLEUR = { 1: '#ffffff', 2: '#1a1a1a', 3: '#e0262c', 4: '#1f9d3a', 5: '#2a63c9', 6: '#f2c500', 7: '#8c8c8c', 8: '#7a4a1e', 9: '#f0a020', 10: '#8a3fb0', 11: '#f08a00', 12: '#d040a0', 13: '#f0b0c0' };
  const LICHT = { 1: 'F', 2: 'Fl', 3: 'LFl', 4: 'Q', 5: 'VQ', 6: 'UQ', 7: 'Iso', 8: 'Oc', 9: 'IQ', 10: 'IVQ', 11: 'IUQ', 12: 'Mo', 13: 'FFl', 14: 'Fl+LFl', 15: 'OcFl', 16: 'FLFl', 17: 'AlOc', 18: 'AlLFl', 19: 'AlFl', 25: 'Q+LFl', 26: 'VQ+LFl', 27: 'UQ+LFl', 28: 'Al', 29: 'AlFFl' };
  const LKL = { 1: 'W', 3: 'R', 4: 'G', 5: 'Bu', 6: 'Y', 9: 'Am', 11: 'Or' };

  function dieptekleur(d1) {
    if (d1 === undefined || d1 === null) return '#cfe6f5';
    if (d1 < 0) return '#bfd6a2';      // droogvallend
    if (d1 < 2) return '#86c1e8';
    if (d1 < 5) return '#aed8f1';
    if (d1 < 10) return '#d0e9f8';
    return '#f1f8fd';
  }

  // vlakstijl: [vulkleur|null, lijnkleur|null, lijndikte, streep]
  function vlakStijl(c, p) {
    switch (c) {
      case 'DEPARE': return [p.DRVAL2 === undefined && !p.DRVAL1 ? '#aed8f1' : dieptekleur(p.DRVAL1), null, 0];
      case 'HRBBSN': case 'LKBSPT': return ['#aed8f1', '#5c7f99', 0.6];
      case 'TRNBSN': return [null, '#5c7f99', 0.8, [6, 4]];
      case 'TERMNL': return ['#ddd6c4', '#8a8672', 0.6];
      case 'DRGARE': return [dieptekleur(p.DRVAL1), '#6b8fa8', 0.8, [4, 3]];
      case 'UNSARE': return ['#d9d9d9', null, 0];
      case 'LNDARE': return ['#f2e3ad', '#5c4a1c', 0.8];
      case 'BUAARE': return ['#dcc089', null, 0];
      case 'LAKARE': case 'RIVERS': case 'CANALS': case 'LOKBSN': case 'DOCARE': return ['#aed8f1', '#5c7f99', 0.6];
      case 'VEGATN': return ['#dbe6b4', null, 0];
      case 'SLOGRD': return ['#e6d79f', null, 0];
      case 'AIRARE': case 'RUNWAY': return ['#e0dccb', '#8a8672', 0.6];
      case 'SLCONS': case 'DAMCON': case 'DYKCON': case 'CAUSWY': case 'FORSTC': return ['#c9b98a', '#2b2b2b', 1];
      case 'PONTON': case 'FLODOC': case 'DRYDOC': case 'HULKES': case 'MORFAC': case 'GATCON': return ['#c9b98a', '#2b2b2b', 0.8];
      case 'BRIDGE': return ['#b5b5b5', '#3a3a3a', 1];
      case 'TUNNEL': return [null, '#666', 1, [5, 4]];
      case 'BUISGL': case 'SILTNK': case 'LNDMRK': return ['#b99a66', '#6b4f22', 0.6];
      case 'WRECKS': case 'OBSTRN': return ['rgba(134,193,232,0.6)', '#222', 0.8, [2, 2]];
      case 'OFSPLF': case 'PYLONS': case 'CRANES': return ['#999', '#222', 0.8];
      case 'FAIRWY': return [null, '#8a8a8a', 0.7, [8, 5]];
      case 'TSSLPT': case 'TSEZNE': case 'ISTZNE': case 'PRCARE': return ['rgba(204,96,180,0.16)', null, 0];
      case 'DWRTPT': case 'RECTRC': return [null, '#c040a0', 0.8, [8, 4]];
      case 'ACHARE': case 'ACHBRT': return [null, '#c040a0', 1, [6, 4]];
      case 'RESARE': case 'CTNARE': case 'MIPARE': case 'DMPGRD': case 'CBLARE': case 'PIPARE': case 'SPLARE': case 'TESARE': case 'PRDARE': case 'OSPARE': case 'SWPARE': case 'PILBOP':
        return [null, '#c040a0', 1, [7, 4]];
      case 'MARCUL': return [null, '#7a5a2a', 0.8, [4, 3]];
      case 'BERTHS': case 'HRBFAC': case 'SMCFAC': return [null, null, 0];
      default: return [null, null, 0];
    }
  }
  function lijnStijl(c, p) {
    switch (c) {
      case 'DEPCNT': return ['#6f9cbd', 0.7];
      case 'WTWAXS': return ['rgba(60,90,130,0.45)', 0.7, [10, 6]];
      case 'COALNE': return ['#3b3113', 1];
      case 'SLCONS': case 'DYKCON': case 'DAMCON': case 'CAUSWY': case 'GATCON': case 'FORSTC': case 'MORFAC': case 'PONTON': return ['#1f1f1f', 1.4];
      case 'BRIDGE': return ['#3a3a3a', 3];
      case 'CBLSUB': return ['#c040a0', 0.8, [2, 3]];
      case 'PIPSOL': return ['#7a7a7a', 0.9, [6, 3]];
      case 'CBLOHD': case 'PIPOHD': case 'CONVYR': return ['#444', 1, [10, 3, 2, 3]];
      case 'NAVLNE': case 'RECTRC': case 'RCRTCL': case 'DWRTCL': return ['#333', 0.9, [8, 4]];
      case 'TSSBND': case 'TSELNE': return ['#c040a0', 1.6];
      case 'FERYRT': return ['#555', 0.8, [3, 4]];
      case 'ROADWY': return ['#9a8a6a', 0.8];
      case 'RAILWY': return ['#555', 1];
      case 'MARCUL': case 'FSHFAC': return ['#7a5a2a', 0.8, [4, 3]];
      default: return ['#666', 0.7];
    }
  }

  // ── cel inladen en voorbereiden ──
  function bereidVoor(o, mz) {
    const q = o.q || 0;
    const cel = { n: o.n, s: o.s, mz: mz || minZoom(o.s), ed: o.ed, up: o.up, d: o.d, vl: [], ln: [], pt: [], snd: null };
    for (const f of o.f) {
      const c = f[0], t = f[1], co = f[2], p = f[3] || {};
      if (t === 0) {
        cel.pt.push({ c, p, x: mx(co[0]), y: my(co[1]), lon: co[0], lat: co[1] });
      } else {
        const ringen = t === 1 ? [co] : co;
        let x0 = 9, y0 = 9, x1 = -9, y1 = -9;
        const rr = ringen.map(r => {
          const a = new Float64Array(r.length);
          let lo = 0, la = 0;
          for (let i = 0; i < r.length; i += 2) {
            if (q) { lo += r[i]; la += r[i + 1]; } else { lo = r[i] * 1; la = r[i + 1] * 1; }   // q: gehele verschillen
            const x = mx(q ? lo / q : lo), y = my(q ? la / q : la);
            a[i] = x; a[i + 1] = y;
            if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
          }
          return a;
        });
        (t === 1 ? cel.ln : cel.vl).push({ c, p, r: rr, x0, y0, x1, y1 });
      }
    }
    const s = o.snd || [];
    cel.snd = new Float64Array(s.length);
    for (let i = 0; i < s.length; i += 3) { cel.snd[i] = mx(s[i]); cel.snd[i + 1] = my(s[i + 1]); cel.snd[i + 2] = s[i + 2]; }
    return cel;
  }
  function laadCel(n, mz) {
    if (ENC.cel[n]) return Promise.resolve(ENC.cel[n]);
    if (!ENC.bezig[n]) {
      ENC.bezig[n] = fetch('./enc/' + n + '.json').then(r => { if (!r.ok) throw new Error(n); return r.json(); })
        .then(o => (ENC.cel[n] = bereidVoor(o, mz)))
        .catch(e => { delete ENC.bezig[n]; console.warn('ENC-cel niet geladen:', n, e); return null; });
    }
    return ENC.bezig[n];
  }
  function laadCatalogus() {
    if (ENC.cat) return Promise.resolve(ENC.cat);
    if (!ENC._catP) {
      ENC._catP = fetch('./enc/index.json?t=' + Date.now()).then(r => r.json()).then(c => {
        c.forEach(e => {
          e.mz = e.mz || minZoom(e.s);
          e.x0 = mx(e.bb[0]); e.x1 = mx(e.bb[2]); e.y0 = my(e.bb[3]); e.y1 = my(e.bb[1]);
          e.covm = (e.cov || []).map(r => { const a = []; for (let i = 0; i < r.length; i += 2) a.push(mx(r[i]), my(r[i + 1])); return a; });
        });
        c.sort((a, b) => b.s - a.s);   // grof eerst, fijn bovenop
        return (ENC.cat = c);
      });
    }
    return ENC._catP;
  }
  function inRing(r, x, y) {
    let b = false;
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      if ((r[i + 1] > y) !== (r[j + 1] > y) && x < (r[j] - r[i]) * (y - r[i + 1]) / (r[j + 1] - r[i + 1]) + r[i]) b = !b;
    }
    return b;
  }
  // ligt de hele tegel binnen het dekkingsgebied van deze cel?
  function dektTegel(e, tx0, ty0, tx1, ty1) {
    if (!e.covm.length) return false;
    const xs = [tx0, (tx0 + tx1) / 2, tx1], ys = [ty0, (ty0 + ty1) / 2, ty1];
    return e.covm.some(r => xs.every(x => ys.every(y => inRing(r, x, y))));
  }
  function cellenVoorTegel(z, tx0, ty0, tx1, ty1) {
    const m = (tx1 - tx0) * 0.2;
    const cat = ENC.cat.filter(e => soortAan(e.n));
    let lijst = cat.filter(e => z >= e.mz && e.x0 < tx1 + m && e.x1 > tx0 - m && e.y0 < ty1 + m && e.y1 > ty0 - m);
    if (!lijst.length) {
      // uitgezoomd: neem de grofste cel(len) die de tegel raken
      const raak = cat.filter(e => e.x0 < tx1 && e.x1 > tx0 && e.y0 < ty1 && e.y1 > ty0);
      if (raak.length) { const grofst = raak[0].s; lijst = raak.filter(e => e.s >= grofst * 0.5 && z >= e.mz - 3); }
    }
    // grovere cellen overslaan als een fijnere de tegel helemaal dekt
    for (let i = lijst.length - 1; i > 0; i--) {
      if (dektTegel(lijst[i], tx0, ty0, tx1, ty1)) { lijst = lijst.slice(i); break; }
    }
    return lijst;
  }

  // ── symbolen ──
  function kleuren(p) { return String(p.COLOUR || '').split(',').filter(Boolean).map(k => KLEUR[k] || '#888'); }
  function vulBanden(g, kl, pat, x, y, w, h) {
    if (!kl.length) kl = ['#888'];
    const n = kl.length;
    for (let i = 0; i < n; i++) {
      g.fillStyle = kl[i];
      if (String(pat || '').split(',')[0] === '2') g.fillRect(x + w * i / n, y, w / n + 0.5, h);       // verticale banen
      else g.fillRect(x, y + h * i / n, w, h / n + 0.5);                                               // horizontale banden
    }
  }
  function topKardinaal(g, cat, x, y) {
    const d = (cx, cy, op) => { g.beginPath(); if (op) { g.moveTo(cx, cy - 4); g.lineTo(cx - 3.2, cy + 1.5); g.lineTo(cx + 3.2, cy + 1.5); } else { g.moveTo(cx, cy + 4); g.lineTo(cx - 3.2, cy - 1.5); g.lineTo(cx + 3.2, cy - 1.5); } g.closePath(); g.fill(); };
    g.fillStyle = '#111';
    const v = { 1: [true, true], 2: [true, false], 3: [false, false], 4: [false, true] }[cat];
    if (!v) return;
    d(x, y - 7, v[0]); d(x, y, v[1]);
  }
  function tekenBoei(g, f, x, y, klein) {
    const p = f.p, kl = kleuren(p), s = klein ? 0.75 : 1;
    const shp = p.BOYSHP || 4, h = 13 * s;
    g.save(); g.translate(x, y);
    g.lineWidth = 1; g.strokeStyle = '#111';
    g.beginPath();
    if (shp === 1) { g.moveTo(-5 * s, 0); g.lineTo(0, -h); g.lineTo(5 * s, 0); }                    // spits
    else if (shp === 2) { g.rect(-4.5 * s, -h * 0.8, 9 * s, h * 0.8); }                              // stomp
    else if (shp === 3) { g.arc(0, -h * 0.45, h * 0.45, 0, 2 * Math.PI); }                           // bol
    else if (shp === 5) { g.rect(-1.6 * s, -h * 1.15, 3.2 * s, h * 1.15); }                          // spar
    else { g.moveTo(-4.5 * s, 0); g.lineTo(-2 * s, -h * 1.1); g.lineTo(2 * s, -h * 1.1); g.lineTo(4.5 * s, 0); } // pilaar
    g.closePath();
    g.save(); g.clip(); vulBanden(g, kl, p.COLPAT, -7, -h * 1.2, 14, h * 1.2); g.restore();
    g.stroke();
    g.beginPath(); g.arc(0, 0, 1.6, 0, 2 * Math.PI); g.fillStyle = '#fff'; g.fill(); g.stroke();
    if (f.c === 'BOYCAR') topKardinaal(g, p.CATCAM, 0, -h * 1.1 - 6);
    g.restore();
  }
  function tekenBaken(g, f, x, y) {
    const p = f.p, kl = kleuren(p);
    g.save(); g.translate(x, y);
    g.strokeStyle = '#111'; g.lineWidth = 1;
    g.beginPath(); g.rect(-2, -13, 4, 13);
    g.save(); g.clip(); vulBanden(g, kl, p.COLPAT, -3, -13, 6, 13); g.restore(); g.stroke();
    g.beginPath(); g.moveTo(-4, 0); g.lineTo(4, 0); g.stroke();
    if (f.c === 'BCNCAR') topKardinaal(g, p.CATCAM, 0, -19);
    g.restore();
  }
  function lichtTekst(p) {
    let t = LICHT[p.LITCHR] || '';
    if (p.SIGGRP && p.SIGGRP !== '(1)') t += p.SIGGRP;
    const k = String(p.COLOUR || '').split(',').map(c => LKL[c] || '').join('');
    if (k) t += (t ? ' ' : '') + k;
    if (p.SIGPER) t += ' ' + p.SIGPER + 's';
    if (p.HEIGHT) t += ' ' + p.HEIGHT + 'm';
    if (p.VALNMR) t += ' ' + p.VALNMR + 'M';
    return t.trim();
  }
  function tekenLicht(g, f, x, y) {
    const k = String(f.p.COLOUR || '').split(',')[0];
    g.save(); g.translate(x, y); g.rotate(Math.PI * 0.75);
    g.fillStyle = k === '3' ? 'rgba(224,38,44,0.85)' : k === '4' ? 'rgba(31,157,58,0.85)' : 'rgba(214,60,190,0.8)';
    g.beginPath(); g.moveTo(0, -3); g.quadraticCurveTo(5, -12, 0, -19); g.quadraticCurveTo(-5, -12, 0, -3); g.fill();
    g.restore();
  }
  function tekenWrak(g, f, x, y) {
    g.save(); g.translate(x, y); g.strokeStyle = '#111'; g.lineWidth = 1.1;
    g.beginPath(); g.moveTo(-7, 0); g.lineTo(7, 0);
    for (const dx of [-4, 0, 4]) { g.moveTo(dx, -3.5); g.lineTo(dx, 3.5); }
    g.stroke();
    if (f.p.CATWRK === 2 || (f.p.VALSOU !== undefined && f.p.VALSOU < 10)) { g.setLineDash([1.5, 2]); g.beginPath(); g.ellipse(0, 0, 10, 6, 0, 0, 2 * Math.PI); g.stroke(); }
    g.restore();
  }
  function tekenObstakel(g, f, x, y) {
    g.save(); g.translate(x, y); g.strokeStyle = '#111'; g.lineWidth = 1;
    if (f.c === 'UWTROC') { g.beginPath(); g.moveTo(-4, 0); g.lineTo(4, 0); g.moveTo(0, -4); g.lineTo(0, 4); g.stroke(); }
    g.setLineDash([1.5, 2]); g.beginPath(); g.arc(0, 0, 5.5, 0, 2 * Math.PI); g.fillStyle = 'rgba(134,193,232,0.7)'; g.fill(); g.stroke();
    g.restore();
  }
  function label(g, t, x, y, opt) {
    opt = opt || {};
    g.font = (opt.schuin ? 'italic ' : '') + (opt.vet ? '600 ' : '') + (opt.px || 10) + 'px sans-serif';
    g.textAlign = opt.midden ? 'center' : 'left'; g.textBaseline = 'middle';
    g.lineWidth = 2.5; g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineJoin = 'round';
    g.strokeText(t, x, y); g.fillStyle = opt.kleur || '#111'; g.fillText(t, x, y);
  }
  function tekenDieptecijfer(g, d, x, y) {
    const neg = d < 0, a = Math.abs(d), h = Math.floor(a + 1e-6), dec = Math.round((a - h) * 10);
    const hele = (neg ? '-' : '') + h;
    g.font = 'italic 10px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillStyle = neg ? '#2f6b2f' : '#3f5f78';
    const w = g.measureText(hele).width, tot = w + (dec && a < 31 ? 5 : 0);
    g.fillText(hele, x - tot / 2, y);
    if (dec && a < 31) { g.font = 'italic 8px sans-serif'; g.fillText(String(dec), x - tot / 2 + w, y + 3); }
  }

  // ── een tegel tekenen ──
  function tekenTegel(canvas, z, tx, ty, cellen) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = canvas.height = 256 * dpr;
    const g = canvas.getContext('2d');
    g.scale(dpr, dpr);
    const S = 256 * Math.pow(2, z), ox = tx * 256, oy = ty * 256;
    const X = x => x * S - ox, Y = y => y * S - oy;
    const schaal = schaalBij(z);
    const zichtbaar = p => !p.SCAMIN || schaal <= p.SCAMIN * 2.5;
    const m = 40 / S;
    const bx0 = tx * 256 / S - m, bx1 = (tx + 1) * 256 / S + m, by0 = ty * 256 / S - m, by1 = (ty + 1) * 256 / S + m;
    const raakt = f => f.x0 < bx1 && f.x1 > bx0 && f.y0 < by1 && f.y1 > by0;
    const pad = r => { g.moveTo(X(r[0]), Y(r[1])); for (let i = 2; i < r.length; i += 2) g.lineTo(X(r[i]), Y(r[i + 1])); };

    for (const cel of cellen) {
      if (!cel) continue;
      const detail = z - cel.mz;         // 0 = net zichtbaar, hoger = verder ingezoomd
      // vlakken
      for (const f of cel.vl) {
        if (!raakt(f)) continue;
        const st = vlakStijl(f.c, f.p);
        if (st[0] || st[1]) {
          if (!st[0] && !zichtbaar(f.p)) continue;
          g.beginPath();
          for (const r of f.r) { pad(r); g.closePath(); }
          if (st[0]) { g.fillStyle = st[0]; g.fill('evenodd'); }
          if (st[1] && st[2]) { g.strokeStyle = st[1]; g.lineWidth = st[2]; g.setLineDash(st[3] || []); g.stroke(); g.setLineDash([]); }
        }
      }
      // lijnen
      for (const f of cel.ln) {
        if (!raakt(f) || !zichtbaar(f.p)) continue;
        const st = lijnStijl(f.c, f.p);
        g.beginPath(); pad(f.r[0]);
        g.strokeStyle = st[0]; g.lineWidth = st[1]; g.setLineDash(st[2] || []); g.stroke(); g.setLineDash([]);
      }
      // namen van gebieden
      if (detail >= 1) {
        for (const f of cel.vl) {
          if (!f.p.OBJNAM || !raakt(f) || !zichtbaar(f.p)) continue;
          const c = f.c;
          if (c !== 'SEAARE' && c !== 'LNDRGN' && c !== 'BUAARE' && c !== 'LNDARE' && c !== 'ACHARE' && c !== 'HRBFAC' && c !== 'FAIRWY' && !((c === 'LOKBSN' || c === 'HRBARE') && detail >= 3)) continue;
          const w = (f.x1 - f.x0) * S;
          if (w < 30) continue;
          label(g, f.p.OBJNAM, X((f.x0 + f.x1) / 2), Y((f.y0 + f.y1) / 2), { midden: true, schuin: c === 'SEAARE' || c === 'FAIRWY', px: c === 'BUAARE' ? 11 : 10, kleur: c === 'SEAARE' || c === 'FAIRWY' ? '#2f5f86' : '#3a2f10', vet: c === 'BUAARE' });
        }
      }
      // bruggen: doorvaarthoogte
      if (detail >= 2) {
        for (const lijst of [cel.vl, cel.ln]) for (const f of lijst) {
          if (f.c !== 'BRIDGE' || !raakt(f)) continue;
          const t = f.p.VERCLR !== undefined ? 'H ' + f.p.VERCLR : (detail >= 3 && f.p.OBJNAM ? f.p.OBJNAM : '');
          if (t) label(g, t, X((f.x0 + f.x1) / 2), Y((f.y0 + f.y1) / 2), { midden: true, px: 10, vet: true, kleur: '#7a1f1f' });
        }
        // namen van vaarwegen langs de as
        if (detail >= 2) for (const f of cel.ln) {
          if (f.c !== 'WTWAXS' || !f.p.OBJNAM || !raakt(f)) continue;
          const r = f.r[0], i = (r.length >> 2) << 1;
          const px = X(r[i]), py = Y(r[i + 1]);
          if (px > 20 && px < 236 && py > 10 && py < 246) label(g, f.p.OBJNAM, px, py, { midden: true, schuin: true, px: 10, kleur: '#2f5f86' });
        }
      }
      // dieptecijfers
      if (detail >= 2 && cel.snd.length) {
        const s = cel.snd;
        for (let i = 0; i < s.length; i += 3) {
          if (s[i] < bx0 || s[i] > bx1 || s[i + 1] < by0 || s[i + 1] > by1) continue;
          tekenDieptecijfer(g, s[i + 2], X(s[i]), Y(s[i + 1]));
        }
      }
      // puntobjecten
      for (const f of cel.pt) {
        if (f.x < bx0 || f.x > bx1 || f.y < by0 || f.y > by1 || !zichtbaar(f.p)) continue;
        const x = X(f.x), y = Y(f.y), c = f.c;
        if (c.startsWith('BOY')) { tekenBoei(g, f, x, y, detail < 1); if (f.p.OBJNAM && detail >= 2) label(g, f.p.OBJNAM, x + 8, y - 4, { px: 10, vet: true }); }
        else if (c === 'DAYMAR') { if (detail >= 2) tekenBaken(g, f, x, y); }
        else if (c === 'NOTMRK') { if (detail >= 4) { g.fillStyle = '#fff'; g.strokeStyle = '#d02020'; g.lineWidth = 1.5; g.beginPath(); g.rect(x - 3.5, y - 3.5, 7, 7); g.fill(); g.stroke(); } }
        else if (c === 'DISMAR') { if (detail >= 3 && f.p.INFORM && String(f.p.INFORM).length < 6) label(g, 'km ' + f.p.INFORM, x, y, { midden: true, px: 9, kleur: '#555' }); }
        else if (c === 'BUNSTA') { if (detail >= 2) { g.beginPath(); g.arc(x, y, 5, 0, 2 * Math.PI); g.fillStyle = '#fff'; g.fill(); g.strokeStyle = '#c040a0'; g.lineWidth = 1.2; g.stroke(); label(g, 'B', x, y + 0.5, { midden: true, px: 8, vet: true, kleur: '#c040a0' }); } }
        else if (c === 'PYLONS' || c === 'CRANES') { if (detail >= 3) { g.fillStyle = '#555'; g.fillRect(x - 1.5, y - 1.5, 3, 3); } }
        else if (c.startsWith('BCN')) { tekenBaken(g, f, x, y); if (f.p.OBJNAM && detail >= 2) label(g, f.p.OBJNAM, x + 7, y - 4, { px: 10 }); }
        else if (c === 'LIGHTS' || c === 'LITFLT' || c === 'LITVES') { tekenLicht(g, f, x, y); if (detail >= 3) { const t = lichtTekst(f.p); if (t) label(g, t, x + 9, y + 9, { px: 9, kleur: '#7a1f70' }); } }
        else if (c === 'WRECKS') tekenWrak(g, f, x, y);
        else if (c === 'OBSTRN' || c === 'UWTROC') tekenObstakel(g, f, x, y);
        else if (c === 'PILPNT' || c === 'MORFAC') { if (detail < 2) continue; g.beginPath(); g.arc(x, y, c === 'PILPNT' ? 1.6 : 2.4, 0, 2 * Math.PI); g.fillStyle = c === 'PILPNT' ? '#222' : '#fff'; g.fill(); g.strokeStyle = '#222'; g.lineWidth = 1; g.stroke(); }
        else if (c === 'LNDMRK' || c === 'BUISGL' || c === 'SILTNK') { if (detail >= 1) { g.beginPath(); g.arc(x, y, 3, 0, 2 * Math.PI); g.strokeStyle = '#3a2f10'; g.lineWidth = 1; g.stroke(); g.beginPath(); g.arc(x, y, 0.9, 0, 2 * Math.PI); g.fillStyle = '#3a2f10'; g.fill(); if (f.p.OBJNAM && detail >= 2) label(g, f.p.OBJNAM, x + 6, y, { px: 9, kleur: '#3a2f10' }); } }
        else if (c === 'LNDARE') { g.beginPath(); g.arc(x, y, 2, 0, 2 * Math.PI); g.fillStyle = '#f2e3ad'; g.fill(); g.strokeStyle = '#5c4a1c'; g.stroke(); }
        else if (c === 'SEAARE' || c === 'LNDRGN' || c === 'BUAARE' || c === 'HRBFAC' || c === 'SMCFAC' || c === 'BERTHS' || c === 'ACHBRT') { if (f.p.OBJNAM && detail >= (c === 'BERTHS' ? 2 : 0)) label(g, f.p.OBJNAM, x, y, { midden: true, schuin: c === 'SEAARE', px: 10, kleur: c === 'SEAARE' ? '#2f5f86' : '#3a2f10' }); }
        else if (c === 'RSCSTA' || c === 'CGUSTA' || c === 'SISTAT' || c === 'SISTAW' || c === 'RDOCAL' || c === 'PILBOP' || c === 'RTPBCN' || c === 'FOGSIG') {
          if (detail >= 1) { g.beginPath(); g.arc(x, y, 3.2, 0, 2 * Math.PI); g.strokeStyle = '#c040a0'; g.lineWidth = 1.1; g.stroke(); }
        }
      }
    }
  }

  // ── Leaflet-laag ──
  const Laag = L.GridLayer.extend({
    createTile: function (coords, klaar) {
      const canvas = document.createElement('canvas');
      canvas.style.width = canvas.style.height = '256px';
      const z = coords.z, n = Math.pow(2, z);
      const tx0 = coords.x / n, tx1 = (coords.x + 1) / n, ty0 = coords.y / n, ty1 = (coords.y + 1) / n;
      laadCatalogus().then(() => {
        const lijst = cellenVoorTegel(z, tx0, ty0, tx1, ty1);
        if (!lijst.length) { klaar(null, canvas); return; }
        return Promise.all(lijst.map(e => laadCel(e.n, e.mz))).then(cellen => {
          try { tekenTegel(canvas, z, coords.x, coords.y, cellen); } catch (e) { console.warn('ENC tekenfout', e); }
          klaar(null, canvas);
        });
      }).catch(e => klaar(e, canvas));
      return canvas;
    }
  });

  // ── info bij aantikken ──
  const NAAM = { BOYLAT: 'Laterale boei', BOYCAR: 'Kardinale boei', BOYSPP: 'Bijzondere markering (boei)', BOYSAW: 'Veiligvaarwaterboei', BOYISD: 'Boei geïsoleerd gevaar', BOYINB: 'Installatieboei', BCNLAT: 'Lateraal baken', BCNCAR: 'Kardinaal baken', BCNSPP: 'Bijzonder baken', BCNSAW: 'Veiligvaarwaterbaken', BCNISD: 'Baken geïsoleerd gevaar', LIGHTS: 'Licht', LITFLT: 'Lichtvlot', LITVES: 'Lichtschip', WRECKS: 'Wrak', OBSTRN: 'Obstakel', UWTROC: 'Onderwaterrots', PILPNT: 'Paal', MORFAC: 'Meerpaal / meerboei', LNDMRK: 'Landmerk', NOTMRK: 'Verkeersteken', BUNSTA: 'Bunkerstation', DISMAR: 'Kilometerraai', BRIDGE: 'Brug', LOKBSN: 'Sluiskolk', BERTHS: 'Ligplaats', HRBARE: 'Haven', TERMNL: 'Terminal' };
  const KLNAAM = { 1: 'wit', 2: 'zwart', 3: 'rood', 4: 'groen', 5: 'blauw', 6: 'geel', 7: 'grijs', 8: 'bruin', 9: 'amber', 11: 'oranje' };
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function infoHtml(f, cel) {
    const p = f.p, r = [];
    r.push('<b>' + esc(NAAM[f.c] || f.c) + (p.OBJNAM ? ' ' + esc(p.OBJNAM) : '') + '</b>');
    if (p.COLOUR) r.push('Kleur: ' + String(p.COLOUR).split(',').map(k => KLNAAM[k] || k).join('/'));
    if (f.c === 'LIGHTS' || f.c === 'LITFLT') { const t = lichtTekst(p); if (t) r.push('Licht: ' + esc(t)); if (p.SECTR1 !== undefined) r.push('Sector: ' + p.SECTR1 + '°–' + p.SECTR2 + '°'); }
    if (p.VALSOU !== undefined) r.push('Diepte: ' + p.VALSOU + ' m');
    if (p.VERCLR !== undefined) r.push('Doorvaarthoogte: ' + p.VERCLR + ' m' + (f.c === 'BRIDGE' && p.INFORM && String(p.INFORM).length < 12 ? ' (t.o.v. ' + esc(p.INFORM) + ')' : ''));
    if (p.VERCCL !== undefined) r.push('Hoogte gesloten: ' + p.VERCCL + ' m');
    if (p.VERCOP !== undefined) r.push('Hoogte geopend: ' + p.VERCOP + ' m');
    if (p.HORCLR !== undefined) r.push('Doorvaartbreedte: ' + p.HORCLR + ' m');
    if (p.HORLEN !== undefined) r.push('Kolk: ' + p.HORLEN + ' × ' + (p.HORWID !== undefined ? p.HORWID : '?') + ' m');
    if (p.COMCHA) r.push('Marifoon: kanaal ' + esc(p.COMCHA));
    if (f.c === 'NOTMRK' && p.CATNMK !== undefined) r.push('CEVNI-categorie ' + p.CATNMK);
    if (p.INFORM && !(f.c === 'BRIDGE' && String(p.INFORM).length < 12)) r.push(esc(p.INFORM));
    if (p.NINFOM) r.push(esc(p.NINFOM));
    r.push('<span style="opacity:.6;font-size:11px">ENC ' + esc(cel.n) + ' · editie ' + esc(cel.ed) + '.' + esc(cel.up) + ' · ' + esc(cel.d) + '</span>');
    return r.join('<br>');
  }
  function bijKlik(e) {
    if (!ENC.aan) return;
    // tijdens het zetten van routepunten geen kaartinfo tonen
    if (window._routeKlik && Date.now() - window._routeKlik < 500) return;
    const z = map.getZoom(), S = 256 * Math.pow(2, z);
    const x = mx(e.latlng.lng), y = my(e.latlng.lat), tol = 14 / S;
    let beste = null, bd = tol * tol, bc = null;
    for (const n in ENC.cel) {
      const cel = ENC.cel[n];
      if (!cel || z < cel.mz - 3 || !soortAan(n)) continue;
      for (const f of cel.pt) {
        if (!NAAM[f.c]) continue;
        const d = (f.x - x) * (f.x - x) + (f.y - y) * (f.y - y);
        if (d < bd || (d === bd && bc && cel.s < bc.s)) { bd = d; beste = f; bc = cel; }
      }
    }
    if (!beste) {
      // geen puntobject: brug, sluiskolk, ligplaats of haven onder de vinger?
      const VL = { BRIDGE: 1, LOKBSN: 1, BERTHS: 1, HRBARE: 1, TERMNL: 1 };
      let opp = Infinity; const t2 = 6 / S;
      for (const n in ENC.cel) {
        const cel = ENC.cel[n];
        if (!cel || z < cel.mz || !soortAan(n)) continue;
        for (const lijst of [cel.vl, cel.ln]) for (const f of lijst) {
          if (!VL[f.c] || x < f.x0 - t2 || x > f.x1 + t2 || y < f.y0 - t2 || y > f.y1 + t2) continue;
          if (lijst === cel.vl && f.c !== 'BRIDGE' && !inRing(f.r[0], x, y)) continue;
          const o = (f.x1 - f.x0 + t2) * (f.y1 - f.y0 + t2) * (f.c === 'BRIDGE' ? 0.01 : 1);
          if (o < opp) { opp = o; beste = { c: f.c, p: f.p, lat: e.latlng.lat, lon: e.latlng.lng }; bc = cel; }
        }
      }
    }
    if (beste) L.popup({ maxWidth: 260 }).setLatLng([beste.lat, beste.lon]).setContent(infoHtml(beste, bc)).openOn(map);
  }

  // ── aan/uit ──
  function werkLaagBij() {
    ENC.aan = ENC.zee || ENC.binnen;
    if (ENC.aan) {
      if (!map.getPane('encPane')) { map.createPane('encPane', map.getPane('rotatePane') || undefined); map.getPane('encPane').style.zIndex = 250; }   // in de draaiende laag, boven de ondergrond
      if (!ENC.laag) ENC.laag = new Laag({ pane: 'encPane', tileSize: 256, minZoom: 6, maxZoom: 20, updateWhenZooming: false, keepBuffer: 1, attribution: 'ENC © Dienst der Hydrografie / Rijkswaterstaat' });
      if (map.hasLayer(ENC.laag)) ENC.laag.redraw(); else ENC.laag.addTo(map);
    } else if (ENC.laag && map.hasLayer(ENC.laag)) map.removeLayer(ENC.laag);
  }
  window.toggleEnc = function (aan) {
    ENC.zee = aan; werkLaagBij();
    if (typeof _slaLaagOp === 'function') _slaLaagOp('toggle-enc', aan);
  };
  window.toggleEncBinnen = function (aan) {
    ENC.binnen = aan; werkLaagBij();
    if (typeof _slaLaagOp === 'function') _slaLaagOp('toggle-enc-binnen', aan);
  };
  map.on('click', bijKlik);
  try {
    if (typeof _lagenStaten !== 'undefined') {
      for (const [id, fn] of [['toggle-enc', window.toggleEnc], ['toggle-enc-binnen', window.toggleEncBinnen]]) {
        if (_lagenStaten[id]) { const el = document.getElementById(id); if (el) el.checked = true; fn(true); }
      }
    }
  } catch (e) {}
  // voor tests
  ENC._tekenTegel = tekenTegel; ENC._bereidVoor = bereidVoor; ENC._cellenVoorTegel = cellenVoorTegel; ENC._laadCatalogus = laadCatalogus;
})();
