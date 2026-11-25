// VaarKaart AIS-doorgever (Cloudflare Worker)
// Bewaart de aisstream.io-sleutel (geheim AIS_KEY) en geeft alleen schepen in het gevraagde vak door.
const TOEGESTAAN = ['https://henicolai.github.io', 'http://localhost:8765'];
const TYPES = ['PositionReport', 'StandardClassBPositionReport', 'ExtendedClassBPositionReport', 'ShipStaticData', 'StaticDataReport'];
const MAX_GRADEN = 2; // grootste vak dat een gebruiker mag opvragen

function vak(o) {
  const s = +o.s, w = +o.w, n = +o.n, e = +o.e;
  if (![s, w, n, e].every(Number.isFinite)) return null;
  if (n <= s || e <= w || n - s > MAX_GRADEN || e - w > MAX_GRADEN * 2) return null;
  if (s < -90 || n > 90 || w < -180 || e > 180) return null;
  return [[[s, w], [n, e]]];
}

export default {
  async fetch(req, env) {
    if (req.headers.get('Upgrade') !== 'websocket') {
      return new Response(env.AIS_KEY ? 'VaarKaart AIS: klaar' : 'VaarKaart AIS: sleutel AIS_KEY ontbreekt', { status: 200 });
    }
    const origin = req.headers.get('Origin') || '';
    if (!TOEGESTAAN.includes(origin)) return new Response('Niet toegestaan', { status: 403 });
    if (!env.AIS_KEY) return new Response('Sleutel ontbreekt', { status: 500 });
    const q = Object.fromEntries(new URL(req.url).searchParams);
    let box = vak(q);
    if (!box) return new Response('Ongeldig vak', { status: 400 });

    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    const up = new WebSocket(env.AIS_URL || 'wss://stream.aisstream.io/v0/stream');
    const abonneer = () => { try { up.send(JSON.stringify({ APIKey: env.AIS_KEY, BoundingBoxes: box, FilterMessageTypes: TYPES })); } catch (e) {} };
    const dec = new TextDecoder();
    up.addEventListener('open', abonneer);
    up.addEventListener('message', ev => {
      try { server.send(typeof ev.data === 'string' ? ev.data : dec.decode(ev.data)); } catch (e) {}
    });
    const sluit = () => { try { up.close(); } catch (e) {} try { server.close(); } catch (e) {} };
    up.addEventListener('close', sluit);
    up.addEventListener('error', sluit);
    server.addEventListener('close', sluit);
    server.addEventListener('error', sluit);
    // De app kan een nieuw vak sturen als de kaart verschuift
    server.addEventListener('message', ev => {
      try { const b = vak(JSON.parse(ev.data)); if (b) { box = b; if (up.readyState === 1) abonneer(); } } catch (e) {}
    });
    return new Response(null, { status: 101, webSocket: client });
  }
};
