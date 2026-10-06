// Vlak nebo bus místo letadla v prohlížeči: public/js/ground.js (texty, převod spojů, HTML bez vložení cizích
// řetězců), chytrá nápověda (searchhelp.js), průvodce cestou s vlakem/busem místo letu (trip.js – ceny, termíny,
// kalendář, sdílený odkaz) a plán ze sdíleného odkazu (planshare.js). Klasické skripty načtené přes node:vm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
function load() {
  const ctx = { window: {}, URLSearchParams, TextEncoder, TextDecoder, btoa, atob, console };
  vm.createContext(ctx);
  vm.runInContext(src('ics.js'), ctx, { filename: 'ics.js' });
  vm.runInContext(src('planshare.js'), ctx, { filename: 'planshare.js' });
  const helpers = src('app.js').match(/^const (esc|safeUrl|pad|fmtYMD|fmtDate|czk) = .*$/gm);
  assert.equal(helpers.length, 6);
  vm.runInContext(`const Ics = window.Ics;\n${helpers.join('\n')}`, ctx, { filename: 'app-helpers.js' });
  vm.runInContext(src('ground.js'), ctx, { filename: 'ground.js' });
  vm.runInContext(src('searchhelp.js'), ctx, { filename: 'searchhelp.js' });
  vm.runInContext(src('trip.js'), ctx, { filename: 'trip.js' });
  return ctx.window;
}
const W = load();
const { Ground, SearchHelp, Trip, Ics, PlanShare } = W;
const plain = (x) => JSON.parse(JSON.stringify(x));
const XSS = '<img src=x onerror=alert(1)>"\'`';

const live = (over = {}) => ({
  id: '8730597632', dep: '2026-11-10T06:01', arr: '2026-11-10T10:21', min: 260, transfers: 0, kinds: ['TRAIN'], priceFrom: 299, priceTo: 649,
  seats: 339, bookable: true, fromStation: 'hl.n.', toStation: 'Wien Hbf', ...over,
});

test('Ground: text čipu, délka cesty, převod spoje a odhadu na úsek cesty, cena za všechny', () => {
  assert.equal(Ground.chipText({ min: 260, czk: 299 }), '🚆 i vlakem/busem ~4 h 20 · od ~299 Kč');
  assert.equal(Ground.hm(45), '45 min');
  assert.equal(Ground.hm(720), '12 h');
  assert.equal(Ground.hm(65), '1 h 05');
  assert.match(Ground.basisTxt('measured'), /skutečných spojů/);
  assert.match(Ground.basisTxt('distance'), /vzdálenosti/);
  const l = plain(Ground.legFromLive(live(), '2026-11-10'));
  assert.deepEqual(l, { source: 'regiojet', id: '8730597632', date: '2026-11-10', dep: '2026-11-10T06:01', arr: '2026-11-10T10:21', min: 260, czk: 299, kinds: ['TRAIN'], transfers: 0, fromStation: 'hl.n.', toStation: 'Wien Hbf' });
  const e = plain(Ground.legFromEst('2026-11-14', { minutes: 234, czk: 299, basis: 'measured' }));
  assert.deepEqual([e.source, e.date, e.dep, e.min, e.czk], ['estimate', '2026-11-14', null, 234, 299]);
  assert.equal(Ground.tripCzk({ out: l, back: e }, 2), (299 + 299) * 2);
  assert.equal(Ground.legTxt(l), '10. 11. 06:01 → 10:21 · 4 h 20 · vlak, přímý');
  assert.equal(Ground.legTxt({ ...l, arr: '2026-11-11T04:00', transfers: 1, kinds: ['TRAIN', 'BUS'] }), '10. 11. 06:01 → 04:00 +1 · 4 h 20 · vlak + bus, 1× přestup');
  assert.match(Ground.legTxt(e), /odhad/);
});

test('Ground: HTML spojů a odkazů – cizí texty escapované, odkazy jen http(s), štítky odhad / živé ceny / jen odkaz', () => {
  const j = {
    est: { minutes: 234, czk: 299, basis: 'measured' },
    links: [{ id: 'regiojet', name: 'RegioJet', url: 'https://regiojet.cz/?x=1' }, { id: 'flixbus', name: `Flix${XSS}`, url: 'javascript:alert(1)' }, { id: 'idos', name: 'IDOS', url: 'https://idos.cz/' }],
    live: { ok: true, count: 2, items: [live({ fromStation: XSS, toStation: 'Wien Hbf' }), live({ id: 'x2', dep: '2026-11-10T23:00', arr: '2026-11-11T04:00', priceFrom: null, bookable: false, seats: 0 })] },
  };
  const html = Ground.liveHtml(j);
  assert.ok(!html.includes('<img'), 'název zastávky escapovaný');
  assert.match(html, /RegioJet – živé ceny/);
  assert.match(html, /vyprodáno/);
  assert.match(html, /<small>\+1<\/small>/, 'příjezd další den');
  assert.match(html, /href="https:\/\/regiojet\.cz\/\?x=1"/);
  const links = Ground.linksHtml(j.links);
  assert.ok(!links.includes('javascript:'), 'javascript: odkaz neprojde');
  assert.ok(!links.includes('<img'));
  assert.match(links, /FlixBus|Flix/);
  assert.match(links, /jen odkaz/);
  // Výběr spoje v průvodci: přepínače, vyprodaný spoj nejde vybrat, „ponechat odhad“
  const sel = Ground.liveHtml(j, { sel: 'ov-out', picked: '8730597632' });
  assert.match(sel, /type="radio" name="ov-out" value="8730597632" checked/);
  assert.match(sel, /value="x2"\s+disabled/);
  assert.match(sel, /value="" >|value=""\s*>/, 'odhad bez výběru');
  // Bez živých dat: vysvětlení a odhad
  const off = Ground.liveHtml({ est: j.est, live: { ok: false, error: `RegioJet ${XSS} vypnutý` } });
  assert.match(off, /odhad/);
  assert.ok(!off.includes('<img'));
});

test('SearchHelp: blízký cíl s málo lety → nabídka vlaku/busu; daleký cíl ne; jen filtry času → ne', () => {
  const form = { from: [{ id: 'ap:PRG', label: 'Praha' }], to: [{ id: 'ap:VIE', label: 'Vídeň', type: 'airport' }], dateMode: 'exact', xOut: '2026-11-10', xBack: '2026-11-14', xFlex: 0, trip: 'return', radius: 100 };
  const res = { mode: 'route', groups: [], top: [], destination: { kind: 'airports' }, destinationLabels: [{ id: 'ap:VIE', cc: 'AT' }], ground: { min: 234, czk: 299, worth: true, q: { from: 'ap:PRG', to: 'ap:VIE' } } };
  const acts = SearchHelp.smartActions(form, res, { today: '2026-10-06' });
  assert.equal(acts[0].key, 'ground');
  assert.equal(acts[0].ground, true);
  assert.equal(acts[0].label, '🚆 Vlakem/busem ~3 h 54 · od ~299 Kč (odhad)');
  // nevýhodné (dlouhé) a lety existují → nenabízet; žádné lety → nabídnout i delší cestu
  const slow = { ...res, ground: { ...res.ground, worth: false, min: 700 }, groups: [{ best: {} }] };
  assert.ok(!SearchHelp.smartActions(form, slow, { today: '2026-10-06' }).some((a) => a.key === 'ground'));
  assert.ok(SearchHelp.smartActions(form, { ...slow, groups: [] }, { today: '2026-10-06' }).some((a) => a.key === 'ground'));
  assert.ok(!SearchHelp.smartActions(form, { ...res, ground: null }, { today: '2026-10-06' }).some((a) => a.key === 'ground'), 'Lisabon apod. bez odhadu');
  // filtry času přednost (skryly nabídky)
  const chips = [{ key: 'tOut', label: 'odlet ráno', hidden: 3, time: true }];
  const t = SearchHelp.smartActions(form, res, { today: '2026-10-06', time: { chips, any: 3 } });
  assert.equal(t[0].clear, 'tOut');
  assert.equal(t[1].key, 'ground');
});

/* ---------- průvodce cestou: vlak/bus místo letu ---------- */
const leg = (from, to, date, dep, arr, fromTz, toTz) => ({
  from, to, date, dep: `${date}T${dep}:00`, arr: `${date}T${arr}:00`, hasTime: true, fromTz, toTz, carrier: 'DA', carrierName: 'Demo Air', flightNo: 'DA 1', provider: 'demo-air', bookUrl: 'https://air.example/book',
});
const OV = () => ({
  on: true, q: { from: 'geo:50.0755,14.4378|Praha', to: 'ap:VIE' }, km: 252, est: { minutes: 234, czk: 299, basis: 'measured' },
  from: { label: 'Praha', cc: 'CZ', lat: 50.08, lon: 14.43, tz: 'Europe/Prague', regiojet: true, flixbus: true },
  to: { label: 'Vídeň', cc: 'AT', lat: 48.19, lon: 16.38, tz: 'Europe/Vienna', regiojet: true, flixbus: true },
  out: { source: 'regiojet', id: '8730597632', date: '2026-11-11', dep: '2026-11-11T06:01', arr: '2026-11-11T10:21', min: 260, czk: 299, kinds: ['TRAIN'], transfers: 0, fromStation: 'hl.n.', toStation: 'Wien Hbf' },
  back: { source: 'estimate', id: '', date: '2026-11-15', dep: null, arr: null, min: 234, czk: 299, kinds: [], transfers: null, fromStation: '', toStation: '' },
  links: { out: [{ id: 'regiojet', name: 'RegioJet', url: 'https://regiojet.cz/?departureDate=2026-11-11' }, { id: 'idos', name: 'IDOS', url: 'https://idos.cz/x' }], back: [{ id: 'flixbus', name: 'FlixBus', url: 'https://shop.flixbus.cz/search?rideDate=15.11.2026' }] },
});
function trip(over = {}) {
  return {
    v: 1, adults: 2, bags: 'cabin', nightsOneWay: 3, booked: {}, step: 'summary',
    flight: { out: leg('PRG', 'VIE', '2026-11-10', '07:00', '08:00', 'Europe/Prague', 'Europe/Vienna'), back: leg('VIE', 'PRG', '2026-11-14', '19:00', '20:00', 'Europe/Vienna', 'Europe/Prague'), flightCzk: 3000, groundCzk: 200, bagCzk: 900 },
    dest: { label: 'Vídeň', country: 'Rakousko', cc: 'AT', lat: 48.11, lon: 16.57 }, ground: { out: { minutes: 40 } },
    groundRef: { q: { from: 'geo:50.0755,14.4378|Praha', to: 'ap:VIE' }, km: 252, min: 234, czk: 299, basis: 'measured', worth: true, rule: 'time', reason: 'Vlakem/busem ~3 h 54', from: 'Praha', to: 'Vídeň' },
    stay: { mode: 'manual', name: 'Hotel', totalCzk: 8000 }, car: null, plan: null, overland: OV(), ...over,
  };
}

test('trip: vlak/bus místo letu – cena bez letenek, zavazadel a cesty na letiště; termíny podle spojů', () => {
  const t = trip();
  const c = Trip.costs(t);
  assert.deepEqual([c.flights, c.bags, c.ground, c.overland], [0, 0, 0, (299 + 299) * 2]);
  assert.equal(c.total, 1196 + 8000);
  assert.deepEqual(plain(Trip.stayDates(t)), { checkin: '2026-11-11', checkout: '2026-11-15', nights: 4 }, 'termín podle vlaku, ne letu');
  // vypnuto → zase let (data vlaku zůstanou)
  const fly = trip({ overland: { ...OV(), on: false } });
  assert.deepEqual([Trip.costs(fly).flights, Trip.costs(fly).bags, Trip.costs(fly).overland], [6000, 1800, 0]);
  assert.deepEqual(plain(Trip.stayDates(fly)), { checkin: '2026-11-10', checkout: '2026-11-14', nights: 4 });
  // jen tam: pobyt podle počtu nocí
  const one = trip({ overland: { ...OV(), back: null } });
  assert.deepEqual(plain(Trip.stayDates(one)), { checkin: '2026-11-11', checkout: '2026-11-14', nights: 3 });
  assert.equal(Trip.costs(one).overland, 598);
  // víc míst: termíny navazují na spoj tam a zpět
  const multi = trip({ route: { mode: 'multi', transport: 'transit', bases: [{ name: 'Vídeň', lat: 48.2, lon: 16.37, nights: 2 }, { name: 'Salcburk', lat: 47.8, lon: 13.04, nights: 2 }], transfers: [], legs: {} } });
  assert.deepEqual(plain(Trip.baseDates(multi)), [{ checkin: '2026-11-11', checkout: '2026-11-13', nights: 2 }, { checkin: '2026-11-13', checkout: '2026-11-15', nights: 2 }]);
});

test('trip: kalendář s vlakem/busem – spoj s časem v pásmech měst, odhad jako celodenní; žádný let', () => {
  const t = trip();
  const ev = plain(Trip.calendarEvents(t));
  assert.ok(!ev.some((e) => e.title.startsWith('✈️')), 'let se do kalendáře nedá');
  const g = ev.filter((e) => /^🚆/.test(e.title));
  assert.equal(g.length, 2);
  assert.deepEqual([g[0].title, g[0].start, g[0].tz, g[0].end, g[0].endTz], ['🚆 Praha → Vídeň · RegioJet (vlak)', '2026-11-11T06:01', 'Europe/Prague', '2026-11-11T10:21', 'Europe/Vienna']);
  assert.match(g[0].description, /Odjezd 06:01 místního času \(Praha – hl\.n\.\)/);
  assert.equal(g[0].url, 'https://regiojet.cz/?departureDate=2026-11-11');
  assert.deepEqual([g[1].title, g[1].start], ['🚆 Vídeň → Praha (vlak / bus)', '2026-11-15']);
  assert.match(g[1].description, /ověř u dopravce/);
  assert.equal(g[1].url, 'https://shop.flixbus.cz/search?rideDate=15.11.2026', 'odhad → první odkaz zpět');
  const ics = Ics.build(Trip.calendarEvents(t), { now: Date.UTC(2026, 9, 5) });
  assert.ok(ics.includes('DTSTART:20261111T050100Z\r\nDTEND:20261111T092100Z'), '06:01 v Praze = 05:01 UTC, příjezd 10:21 ve Vídni');
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261115'));
  const te = plain(Trip.tripEvent(t));
  assert.equal(te.start, '2026-11-11');
  assert.equal(te.end, '2026-11-15');
  assert.match(te.description, /🚆 Praha → Vídeň 06:01 → 10:21/);
  assert.ok(!/✈️/.test(te.description));
});

test('sanitizeTrip: vlak/bus ze sdíleného odkazu – škodlivé texty, odkazy, data a čísla', () => {
  const raw = trip();
  raw.overland.from.label = `${XSS}Praha`;
  raw.overland.to.tz = 'Europe/../../etc/passwd';
  raw.overland.out.fromStation = XSS;
  raw.overland.out.czk = 1e9;
  raw.overland.out.kinds = ['TRAIN', 'PLANE', '<b>'];
  raw.overland.out.id = 'x" onclick="1';
  raw.overland.back.date = '2026-11-01'; // před cestou tam
  raw.overland.links.out.push({ id: 'evil', name: 'x', url: 'https://evil.example' }, { id: 'idos', name: 'IDOS', url: 'javascript:alert(1)' });
  raw.overland.q = { from: 'cc:CZ', to: 'ap:VIE' };
  raw.overland.extra = { deep: 1 };
  raw.groundRef.q.to = 'ap:VIE<script>';
  const t = Trip.sanitizeTrip(JSON.parse(JSON.stringify(raw)));
  const o = plain(t.overland);
  assert.equal(o.on, true);
  assert.ok(!/[<>"'`]/.test(o.from.label));
  assert.equal(o.to.tz, null);
  assert.ok(!/[<>"'`]/.test(o.out.fromStation));
  assert.equal(o.out.czk, 0, 'nesmyslná cena');
  assert.deepEqual(o.out.kinds, ['TRAIN']);
  assert.equal(o.out.id, '');
  assert.equal(o.back, null, 'návrat před cestou tam');
  assert.deepEqual(o.links.out.map((l) => l.id), ['regiojet', 'idos'], 'neznámý dopravce a javascript: pryč');
  assert.ok(o.links.out.every((l) => /^https:\/\//.test(l.url)), 'jen https odkazy');
  assert.ok(!o.links.out.some((l) => l.id === 'evil'));
  assert.equal(o.q, null, 'země jako místo neprojde');
  assert.equal(o.extra, undefined);
  assert.equal(t.groundRef.q.to, 'ap:VIEscript', 'clean() odstraní znaky HTML');
  // poškozené → bez vlaku (let zůstane)
  for (const bad of [5, 'x', { on: true }, { ...OV(), out: { date: 'zítra' } }, { ...OV(), from: { label: 'x', lat: 999, lon: 1 } }]) {
    assert.equal(Trip.sanitizeTrip(JSON.parse(JSON.stringify(trip({ overland: bad })))).overland, null);
  }
  // spoj bez času příjezdu → odhad (jen den)
  const half = trip();
  half.overland.out.arr = null;
  const h = plain(Trip.sanitizeTrip(JSON.parse(JSON.stringify(half))).overland.out);
  assert.deepEqual([h.source, h.dep, h.arr, h.date], ['estimate', null, null, '2026-11-11']);
  // stará cesta bez vlaku projde jako dřív
  const old = trip();
  delete old.overland;
  delete old.groundRef;
  const so = Trip.sanitizeTrip(JSON.parse(JSON.stringify(old)));
  assert.equal(so.overland, null);
  assert.equal(Trip.costs(so).flights, 6000);
});

test('PlanShare + Ics: plán s vlakem/busem (#plan=) – úseky projdou kontrolou a dají události kalendáře', () => {
  const plan = {
    name: 'Vídeň 11.11.', dest: 'Vídeň', start: '2026-11-11', end: '2026-11-15', pax: 2, flight: '🚆 Praha→Vídeň 11.11. 06:01 (RegioJet, vlak)',
    ground: [
      { from: `Praha${XSS}`, to: 'Vídeň', date: '2026-11-11', dep: '2026-11-11T06:01', arr: '2026-11-11T10:21', fromTz: 'Europe/Prague', toTz: 'Europe/Vienna', kind: 'vlak', carrier: 'RegioJet', min: 260, fromStation: 'hl.n.', toStation: 'Wien Hbf' },
      { from: 'Vídeň', to: 'Praha', date: '2026-11-15', dep: null, kind: 'vlak / bus', min: 234 },
      { from: 'X', to: 'Y', date: 'zítra' }, 'nic',
    ],
  };
  const p = PlanShare.decode(PlanShare.encode(plan));
  assert.equal(p.ground.length, 2);
  assert.ok(!/[<>"'`]/.test(p.ground[0].from));
  assert.deepEqual([p.ground[0].dep, p.ground[0].fromTz, p.ground[1].dep, p.ground[1].date], ['2026-11-11T06:01', 'Europe/Prague', null, '2026-11-15']);
  const ev = Ics.groundEvent(p.ground[0], { note: 'Vídeň' });
  assert.equal(ev.start, '2026-11-11T06:01');
  assert.equal(ev.tz, 'Europe/Prague');
  const ics = Ics.build([ev, Ics.groundEvent(p.ground[1])], { now: Date.UTC(2026, 9, 5) });
  assert.ok(ics.includes('DTSTART:20261111T050100Z'));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261115'));
  assert.match(ics, /SUMMARY:🚆 Vídeň → Praha \(vlak \/ bus\)/);
  // plán bez vlaku se nemění
  assert.equal(PlanShare.decode(PlanShare.encode({ name: 'x', start: '2026-11-11' })).ground, undefined);
});
