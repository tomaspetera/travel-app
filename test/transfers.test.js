// Přejezdy mezi místy trasy (server/lib/transfers.js): trasa autem z BRouteru (podstrčený fetch –
// rozbor odpovědi, mezipaměť, záložní pokusy, rozpočet), pravidla regionu, hranic a veřejné dopravy
// a kalibrace na skutečných cestách (časy BRouteru car-fast naměřené 6. 10. 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stubFetch } from './helpers.js';
import { cache } from '../server/lib/cache.js';
import {
  transferTimes, driveRoute, routeTransfers, routeKey, cachedRoute, parseDrive, openBorder, borderMin, congestionMin, transitKind, hsrMin, regionKey,
} from '../server/lib/transfers.js';
import { planStay, evaluateRoute } from '../server/lib/stayplan.js';

process.env.BROUTER_GAP_MS = '0';

const P = {
  lagos: { name: 'Lagos', lat: 6.455, lon: 3.3841, cc: 'NG' },
  portoNovo: { name: 'Porto Novo', lat: 6.4969, lon: 2.6289, cc: 'BJ' },
  abeokuta: { name: 'Abeokuta', lat: 7.1557, lon: 3.3451, cc: 'NG' },
  cotonou: { name: 'Cotonou', lat: 6.3654, lon: 2.4183, cc: 'BJ' },
  praha: { name: 'Praha', lat: 50.0875, lon: 14.4213, cc: 'CZ' },
  brno: { name: 'Brno', lat: 49.1951, lon: 16.6068, cc: 'CZ' },
  milano: { name: 'Milán', lat: 45.4642, lon: 9.19, cc: 'IT' },
  bologna: { name: 'Boloňa', lat: 44.4949, lon: 11.3426, cc: 'IT' },
  wien: { name: 'Vídeň', lat: 48.2082, lon: 16.3738, cc: 'AT' },
};
// Odpověď BRouteru (GeoJSON) s délkou v m a časem v s.
const geo = (m, s) => ({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { 'track-length': String(m), 'total-time': String(s) }, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } }] });
const between = (x, lo, hi, what) => assert.ok(x >= lo && x <= hi, `${what}: ${x} min (čekáno ${lo}–${hi})`);

test('kalibrace: Lagos → Porto Novo, Porto Novo → Abeokuta (hranice Nigérie–Benin, bez vlaku), Praha → Brno, Milán → Boloňa', () => {
  // časy BRouteru car-fast (volný provoz): 122,5 km / 123 min, 208,1 km / 184 min (vede přes Lagos), 208,3 km / 117 min, 215,3 km / 134 min
  const lp = transferTimes(P.lagos, P.portoNovo, { km: 122.5, min: 123 });
  between(lp.carMin, 140, 220, 'Lagos → Porto Novo autem (skutečně 3 h a víc)');
  between(lp.transitMin, 300, 390, 'Lagos → Porto Novo autobusem i s hranicí (skutečně ~6 h)');
  assert.deepEqual([lp.transitKind, lp.border, lp.basis, lp.km], ['bus', { from: 'NG', to: 'BJ' }, 'route', 123]);
  const pa = transferTimes(P.portoNovo, P.abeokuta, { km: 208.1, min: 184 });
  between(pa.carMin, 180, 240, 'Porto Novo → Abeokuta autem i s hranicí');
  assert.equal(pa.transitKind, 'bus', 'v Beninu ani Nigérii se mezi městy vlakem nejezdí');
  assert.deepEqual(pa.border, { from: 'BJ', to: 'NG' });
  const pb = transferTimes(P.praha, P.brno, { km: 208.3, min: 117 });
  between(pb.carMin, 135, 160, 'Praha → Brno autem');
  between(pb.transitMin, 150, 180, 'Praha → Brno vlakem');
  assert.deepEqual([pb.transitKind, pb.border], ['rail', null]);
  const mb = transferTimes(P.milano, P.bologna, { km: 215.3, min: 134 });
  between(mb.carMin, 135, 165, 'Milán → Boloňa autem (~2 h 30 min)');
  between(mb.transitMin, 75, 120, 'Milán → Boloňa rychlovlakem');
  assert.equal(mb.hsr, true);
  // bez trasy (odhad) vyjdou stejná pravidla podobně
  const est = transferTimes(P.lagos, P.portoNovo, null);
  assert.equal(est.basis, 'estimate');
  between(est.carMin, 140, 240, 'odhad Lagos → Porto Novo autem');
  between(est.transitMin, 300, 420, 'odhad Lagos → Porto Novo autobusem');
  // Cotonou → Porto Novo: v rámci Beninu, bez hranice
  assert.equal(transferTimes(P.cotonou, P.portoNovo, { km: 38.2, min: 43 }).border, null);
});

test('pravidla: hranice (Schengen, Británie a Irsko), zácpy v metropoli, vlak jen kde jezdí, rychlovlaky', () => {
  assert.equal(openBorder('CZ', 'AT'), true);
  assert.equal(openBorder('HR', 'SI'), true, 'Chorvatsko je v Schengenu');
  assert.equal(openBorder('GB', 'IE'), true);
  assert.equal(openBorder('NG', 'BJ'), false);
  assert.equal(openBorder('HR', 'BA'), false);
  assert.equal(openBorder('', 'BJ'), true, 'neznámá země → bez hranice');
  assert.deepEqual(['car', 'rail', 'bus'].map((m) => borderMin('HR', 'BA', m)), [30, 30, 45], 'Evropa mimo Schengen');
  assert.deepEqual(['car', 'rail', 'bus'].map((m) => borderMin('NG', 'BJ', m)), [45, 60, 120], 'Afrika: autobusem přestup na hranici');
  assert.deepEqual(['car', 'bus'].map((m) => borderMin('TH', 'KH', m)), [45, 75]);
  assert.equal(borderMin('DE', 'FR', 'bus'), 0);
  assert.deepEqual([regionKey('CZ'), regionKey('NG'), regionKey('XX')], ['seu', 'waf', null]);
  // zácpy: Lagos na začátku i konci (letiště → město) jen jednou
  assert.equal(congestionMin({ lat: 6.5774, lon: 3.3212 }, P.lagos), 30);
  assert.equal(congestionMin(P.lagos, P.portoNovo), 30);
  assert.equal(congestionMin(P.praha, P.brno), 0);
  // veřejná doprava
  assert.equal(transitKind(P.praha, P.wien), 'rail');
  assert.equal(transitKind(P.lagos, P.portoNovo), 'bus');
  assert.equal(transitKind(P.praha, { lat: 48.15, lon: 17.1, cc: 'HR' }), 'bus', 'do země bez vlaků → autobus');
  assert.equal(transitKind(P.praha, { lat: 50.0, lon: 15.0 }), 'rail', 'bez kódu země: země podle polohy');
  // z mezipaměti nádraží víme, že u místa žádné není → autobus
  const village = { lat: 49.71, lon: 13.51, cc: 'CZ' };
  cache.set('wdqs-stations:49.7:13.5:40', [{ id: 'Q1', name: 'Daleko', lat: 49.95, lon: 13.9 }], 60e3);
  assert.equal(transitKind(P.praha, village), 'bus');
  cache.set('wdqs-stations:49.7:13.5:40', [{ id: 'Q2', name: 'Blízko', lat: 49.72, lon: 13.52 }], 60e3);
  assert.equal(transitKind(P.praha, village), 'rail');
  // rychlovlak jen mezi dvěma městy na trati v téže zemi
  assert.ok(hsrMin(P.milano, P.bologna) > 0);
  assert.equal(hsrMin(P.praha, P.brno), null);
  assert.equal(hsrMin(P.milano, { lat: 48.8566, lon: 2.3522 }), null, 'Milán – Paříž: jiná země');
  // krátký přejezd v témže místě
  assert.deepEqual({ ...transferTimes(P.praha, { ...P.praha }) }, { km: 0, carMin: 0, transitMin: 0, transitKind: 'rail', border: null, basis: 'estimate' });
});

test('driveRoute: dotaz na BRouter (car-fast), rozbor, mezipaměť bez ohledu na směr, záložní pokusy', async () => {
  assert.deepEqual(parseDrive(geo(122500, 7380)), { km: 122.5, min: 123 });
  assert.throws(() => parseDrive({ features: [] }), /trasu/);
  const a = { lat: 10.12345, lon: 20.98765 };
  const b = { lat: 10.5, lon: 21.4 };
  const stub = stubFetch(() => ({ body: geo(61000, 3000) }));
  try {
    const r = await driveRoute(a, b);
    assert.deepEqual(r, { km: 61, min: 50 });
    assert.equal(stub.calls.length, 1);
    const u = new URL(stub.calls[0].url);
    assert.equal(u.origin + u.pathname, 'https://brouter.de/brouter');
    assert.equal(u.searchParams.get('profile'), 'car-fast');
    assert.equal(u.searchParams.get('lonlats'), '20.99,10.12|21.4,10.5', 'body zaokrouhlené na ~1 km');
    assert.match(stub.calls[0].init.headers['User-Agent'], /ATLAS-travel/);
    assert.deepEqual(await driveRoute(b, a), r, 'zpět = tam, z mezipaměti');
    assert.deepEqual(cachedRoute({ lat: 10.121, lon: 20.991 }, b), r);
    assert.equal(stub.calls.length, 1);
  } finally {
    stub.restore();
  }
  // střed města v pěší zóně („target island“) → body posunuté k sobě
  const c = { lat: 11.1, lon: 22.1 };
  const d = { lat: 11.6, lon: 22.6 };
  const isl = stubFetch((url) => (isl.calls.length === 1 ? { status: 400, body: 'target island detected for section 0' } : { body: geo(80000, 3600) }));
  try {
    assert.deepEqual(await driveRoute(c, d), { km: 80, min: 60 });
    assert.equal(isl.calls.length, 2);
    const ll = new URL(isl.calls[1].url).searchParams.get('lonlats').split('|').map((x) => x.split(',').map(Number));
    assert.ok(ll[0][0] > 22.1 && ll[1][0] < 22.6, 'oba body o kus blíž k sobě');
    assert.equal(new URL(isl.calls[1].url).searchParams.get('profile'), 'car-fast');
  } finally {
    isl.restore();
  }
  // jiná chyba výpočtu → profil car-eco, čas přepočtený na car-fast
  const e = { lat: 12.1, lon: 23.1 };
  const f = { lat: 12.8, lon: 23.9 };
  const eco = stubFetch((url) => (url.includes('car-fast') ? { status: 400, body: 'error re-tracking track' } : { body: geo(200000, 12000) }));
  try {
    const r = await driveRoute(e, f);
    assert.equal(eco.calls.length, 2);
    assert.equal(new URL(eco.calls[1].url).searchParams.get('profile'), 'car-eco');
    assert.deepEqual(r, { km: 200, min: 200 * 0.92 }, '60 km/h průměr → × 0,92');
  } finally {
    eco.restore();
  }
  // trasa nejde (ani záložní pokus) → { fail } v mezipaměti, další dotaz už BRouter nevolá
  const g = { lat: 13.1, lon: 24.1 };
  const h = { lat: 13.5, lon: 24.5 };
  const bad = stubFetch(() => ({ status: 400, body: 'no track found at pass=0' }));
  try {
    assert.deepEqual(await driveRoute(g, h), { fail: true });
    assert.equal(bad.calls.length, 2);
    assert.deepEqual(await driveRoute(g, h), { fail: true });
    assert.equal(bad.calls.length, 2);
    assert.equal(cachedRoute(g, h), null);
  } finally {
    bad.restore();
  }
  // výpadek sítě / 5xx → bez záložního pokusu, v mezipaměti jen krátce
  const down = stubFetch(() => ({ status: 503, body: 'busy' }));
  try {
    assert.deepEqual(await driveRoute({ lat: 14.1, lon: 25.1 }, { lat: 14.5, lon: 25.5 }), { fail: true, transient: true });
    assert.equal(down.calls.length, 1);
  } finally {
    down.restore();
  }
  // plná fronta dotazů: chyba, nic se neuloží (příště se zkusí znovu)
  const busy = Object.assign(new Error('busy'), { code: 'BUSY' });
  await assert.rejects(driveRoute({ lat: 15.1, lon: 26.1 }, { lat: 15.5, lon: 26.5 }, { get: async () => { throw busy; } }), /busy/);
  assert.equal(cache.get(routeKey({ lat: 15.1, lon: 26.1 }, { lat: 15.5, lon: 26.5 })), undefined);
});

test('routeTransfers: rozpočet dotazů a času, nedokončené dál na pozadí (pending), dvojice tam a zpět jednou', async () => {
  const pts = Array.from({ length: 6 }, (_, i) => ({ lat: 20 + i * 0.5, lon: 30 + i * 0.5 }));
  const pairs = pts.slice(1).map((p, i) => [pts[i], p]);
  let n = 0;
  const route = async () => ({ km: 80, min: 60 + n++ });
  const r1 = await routeTransfers([...pairs, [pts[1], pts[0]]], { route, maxNew: 3 });
  assert.equal(n, 3, 'nejvýš 3 nové výpočty, zpáteční dvojice se nepočítá znovu');
  assert.equal(r1.pending, 0);
  assert.equal([...r1.routes.values()].filter(Boolean).length, 3);
  assert.equal(r1.routes.get(routeKey(pts[4], pts[5])), null, 'mimo rozpočet → odhad');
  // pomalý výpočet: po termínu odpověď bez něj (pending), výsledek se uloží do mezipaměti
  const slow = { lat: 40, lon: 40 };
  const far = { lat: 40.5, lon: 40.5 };
  let release;
  const gate = new Promise((res) => { release = res; });
  const r2 = await routeTransfers([[slow, far]], { route: (a, b) => driveRoute(a, b, { get: async () => { await gate; return geo(70000, 3000); } }), deadlineMs: 30 });
  assert.equal(r2.pending, 1);
  assert.equal(r2.routes.get(routeKey(slow, far)), null);
  release();
  await new Promise((res) => setTimeout(res, 20));
  assert.deepEqual(cachedRoute(slow, far), { km: 70, min: 50 }, 'dopočteno na pozadí');
  const r3 = await routeTransfers([[far, slow]], { route: () => { throw new Error('nevolat'); } });
  assert.deepEqual([r3.pending, r3.routes.get(routeKey(slow, far))], [0, { km: 70, min: 50 }]);
  // bez plánovače (DEMO), moc blízko nebo moc daleko → odhad bez dotazu
  const r4 = await routeTransfers([[slow, { lat: 40.001, lon: 40.001 }], [slow, { lat: 50, lon: 50 }]], { route: () => { throw new Error('nevolat'); } });
  assert.deepEqual([...r4.routes.values()], [null, null]);
  const r5 = await routeTransfers(pairs, { route: null });
  assert.equal([...r5.routes.values()].filter(Boolean).length, 0);
});

test('planStay: časy z trasy autem (basis), pending, hranice a země přidaných míst, přejezdy z města příjezdu vlakem', async () => {
  const calls = [];
  const route = async (a, b) => { calls.push([a, b]); return { km: 120, min: 120 }; };
  const bases = [{ name: 'Lagos', lat: 6.455, lon: 3.3841, cc: 'NG' }, { name: 'Porto Novo', lat: 6.4969, lon: 2.6289 }, { name: 'Abeokuta', lat: 7.1557, lon: 3.3451, cc: '' }];
  const ev = await planStay({ arrival: 'LOS', departure: 'LOS', transport: 'car', bases }, { route });
  assert.equal(ev.pending, 0);
  assert.deepEqual(ev.bases.map((b) => [b.cc, b.country]), [['NG', 'Nigérie'], ['BJ', 'Benin'], ['NG', 'Nigérie']], 'země i u míst bez kódu (podle polohy)');
  assert.ok(ev.transfers.every((x) => x.basis === 'route' && x.transitKind === 'bus'));
  assert.deepEqual(ev.transfers.map((x) => x.border), [{ from: 'NG', to: 'BJ' }, { from: 'BJ', to: 'NG' }]);
  assert.equal(new URL(ev.transfers[0].carUrl).searchParams.get('destination'), 'Porto Novo, Benin');
  assert.ok(ev.notes.some((x) => /přes hranici – s půjčeným autem/.test(x)));
  assert.equal(calls.length, 4, '2 přejezdy + z letiště a na letiště');
  // přepočet beze změny: trasy z mezipaměti / výsledků se nepočítají znovu (podstrčený výpočet do mezipaměti nepíše – skutečný ano)
  const ev2 = evaluateRoute(ev.bases.map((b, i) => ({ ...bases[i], ...b })), { transport: 'transit' });
  assert.ok(ev2.transfers.every((x) => x.basis === 'estimate'));
  // pomalý plánovač → odpověď po termínu s odhadem a pending
  const never = () => new Promise(() => {});
  const slow = await planStay({ arrival: 'LOS', transport: 'transit', bases }, { route: never, deadlineMs: 20 });
  assert.equal(slow.pending, 3);
  assert.ok(slow.transfers.every((x) => x.basis === 'estimate'));
  // vlakem/busem místo letu: přejezd z města příjezdu na 1. místo a z posledního zpět
  const g = await planStay({ arrival: 'LOS', departure: 'LOS', bases, ground: { name: 'Cotonou', lat: 6.3654, lon: 2.4183, cc: 'BJ' } }, { route: null });
  assert.ok(g.groundLegs.arrival.carMin > 0 && g.groundLegs.departure.border);
  assert.deepEqual(g.groundLegs.arrival.border, { from: 'BJ', to: 'NG' });
  assert.equal((await planStay({ arrival: 'LOS', bases, ground: { name: '', lat: 1, lon: 1 } }, { route: null })).groundLegs, undefined, 'neplatné město → bez přejezdů z něj');
});

test('planStay návrh: trasa autem ukáže dlouhý přejezd → návrh se jednou zopakuje s ní', async () => {
  const T = (id, name, lat, lon, score) => ({ id, name, lat, lon, score, cc: 'IT', tripKind: 'town' });
  // Kolem Milána: Verona (nejvýznamnější) a Parma; podle trasy z plánovače je Verona daleko (zavřená dálnice).
  const towns = async () => [T('Q3', 'Verona', 45.4384, 10.9916, 120), T('Q10', 'Parma', 44.8015, 10.3279, 90)];
  const verona = (p) => Math.abs(p.lat - 45.4384) < 0.01;
  const route = async (a, b) => (verona(a) || verona(b) ? { km: 400, min: 300 } : { km: 100, min: 80 });
  const r = await planStay({ arrival: 'MXP', departure: 'MXP', nights: 4, count: 2 }, { towns, geo: async () => [], route });
  assert.deepEqual(r.bases.map((b) => b.name), ['Milán', 'Parma'], 'Verona by byla přes 5 h');
  assert.ok(r.transfers.every((x) => !x.long && x.basis === 'route'));
  // bez plánovače (odhad) zůstane Verona
  const est = await planStay({ arrival: 'MXP', departure: 'MXP', nights: 4, count: 2 }, { towns, geo: async () => [], route: null });
  assert.deepEqual(est.bases.map((b) => b.name), ['Milán', 'Verona']);
});
