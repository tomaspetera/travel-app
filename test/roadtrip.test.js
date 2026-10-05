import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planTrips, driveMin, roadKm, transitMin } from '../server/lib/roadtrip.js';
import { addDays } from '../server/lib/dates.js';

const PRAHA = { lat: 50.0875, lon: 14.4213, label: 'Praha' };
const C = [
  ['karlstejn', 'Karlštejn', 49.9394, 14.1883, 'castle', 60],
  ['kh', 'Kutná Hora', 49.9481, 15.2681, 'town', 75],
  ['ck', 'Český Krumlov', 48.8127, 14.3175, 'town', 80],
  ['konopiste', 'Konopiště', 49.7797, 14.6567, 'castle', 40],
  ['krivoklat', 'Křivoklát', 50.0378, 13.8717, 'castle', 35],
  ['melnik', 'Mělník', 50.3505, 14.4741, 'town', 45],
  ['plzen', 'Plzeň', 49.7475, 13.3776, 'town', 70],
  ['kv', 'Karlovy Vary', 50.2306, 12.8711, 'town', 72],
  ['telc', 'Telč', 49.1842, 15.4527, 'town', 65],
  ['cs', 'České Švýcarsko', 50.88, 14.27, 'nature', 62],
  ['wien', 'Vídeň', 48.2082, 16.3738, 'town', 99], // ~250 km – na jednodenní výlet moc daleko
].map(([id, name, lat, lon, tripKind, score]) => ({ id, name, lat, lon, tripKind, score, category: 'daytrip' }));

const START = '2026-11-02';
const CAP = 630; // tempo normal

test('roadtrip: odhad jízdy autem z vzdušné vzdálenosti', () => {
  const kh = C.find((c) => c.id === 'kh');
  assert.ok(roadKm(PRAHA, kh) > 70 && roadKm(PRAHA, kh) < 85, `Praha–Kutná Hora ${roadKm(PRAHA, kh)} km`);
  assert.ok(driveMin(PRAHA, kh) > 60 && driveMin(PRAHA, kh) < 90);
  assert.equal(driveMin(PRAHA, PRAHA), 0);
});

test('roadtrip: jednodenní výlety – každý den jiné cíle, návrat večer, nic přes kapacitu', () => {
  const r = planTrips(C, { base: PRAHA, start: START, days: 3, mode: 'day' });
  assert.equal(r.mode, 'day');
  assert.equal(r.days.length, 3);
  const ids = r.days.flatMap((d) => d.stops.map((s) => s.id));
  assert.equal(new Set(ids).size, ids.length, 'žádný cíl dvakrát');
  assert.ok(!ids.includes('wien'), 'Vídeň není na jednodenní výlet');
  r.days.forEach((d, i) => {
    assert.equal(d.date, addDays(START, i));
    assert.equal(d.from.name, 'Praha');
    assert.ok(d.back, 'návrat domů');
    assert.equal(d.overnight, null);
    assert.ok(d.stops.length >= 1 && d.stops.length <= 3);
    assert.ok(d.minutes <= CAP, `den ${i + 1}: ${d.minutes} min`);
    assert.ok(d.travelMin <= 300);
    assert.match(d.stops[0].arrive, /^\d{2}:\d{2}$/);
  });
  assert.ok(r.spare.length > 0);
});

test('roadtrip: okružní cesta – přespání po cestě, další den začíná tam, poslední den zpět', () => {
  const r = planTrips(C, { base: PRAHA, start: START, days: 3, mode: 'loop', adults: 2 });
  assert.equal(r.mode, 'loop');
  assert.ok(r.days.length >= 2 && r.days.length <= 3, `${r.days.length} dní`);
  const ids = r.days.flatMap((d) => d.stops.map((s) => s.id));
  assert.equal(new Set(ids).size, ids.length);
  r.days.forEach((d, i) => {
    const last = i === r.days.length - 1;
    if (last) {
      assert.ok(d.back && !d.overnight);
    } else {
      assert.ok(d.overnight && !d.back);
      assert.equal(d.overnight.name, d.stops.at(-1).name);
      const u = new URL(d.overnight.bookUrl.startsWith('https://tp.media') ? new URL(d.overnight.bookUrl).searchParams.get('u') : d.overnight.bookUrl);
      assert.equal(u.searchParams.get('ss'), d.overnight.name);
      assert.equal(u.searchParams.get('checkin'), d.date);
      assert.equal(u.searchParams.get('checkout'), addDays(d.date, 1));
      assert.equal(r.days[i + 1].from.name, d.overnight.name);
    }
    assert.ok(d.minutes <= CAP, `den ${i + 1}: ${d.minutes} min`);
    assert.ok(d.travelMin <= 330, `den ${i + 1}: ${d.travelMin} min za volantem`);
  });
  assert.ok(ids.length >= 4, 'za 3 dny víc cílů než za jeden');
});

test('roadtrip: okruh s cíli na opačných stranách – žádný den přes kapacitu ani limit jízdy', () => {
  const W = { id: 'w', name: 'Západ', lat: 50.0875, lon: 14.4213 - 1.61, tripKind: 'town', score: 90 };
  const E = { id: 'e', name: 'Východ', lat: 50.0875, lon: 14.4213 + 1.61, tripKind: 'town', score: 90 };
  for (const pace of ['relaxed', 'normal']) {
    const r = planTrips([W, E, ...C], { base: PRAHA, start: START, days: 2, mode: 'loop', pace });
    const cap = pace === 'relaxed' ? 540 : 630;
    for (const d of r.days) {
      assert.ok(d.minutes <= cap, `${pace}: ${d.minutes} min`);
      assert.ok(d.travelMin <= 330, `${pace}: ${d.travelMin} min za volantem`);
    }
    assert.ok(r.days.length <= 2);
  }
});

test('roadtrip: poznámka při menším počtu výletů – správné tvary (dny/dní)', () => {
  const few = C.filter((c) => ['karlstejn', 'kh', 'melnik', 'konopiste', 'krivoklat'].includes(c.id));
  const r = planTrips(few, { base: PRAHA, start: START, days: 7, mode: 'day', pace: 'relaxed' });
  assert.ok(r.days.length < 7);
  const n = r.days.length;
  assert.match(r.note, new RegExp(`jen na ${n} ${n === 1 ? 'den' : n <= 4 ? 'dny' : 'dní'}\\.`));
});

test('roadtrip: připnutý cíl je v plánu, prázdný seznam → žádné dny', () => {
  const pinned = C.map((c) => (c.id === 'melnik' ? { ...c, score: c.score + 1000 } : c));
  const r = planTrips(pinned, { base: PRAHA, start: START, days: 1, mode: 'day' });
  assert.ok(r.days[0].stops.some((s) => s.id === 'melnik'));
  // nic nenalezeno → žádné dny ani poznámka (prázdný stav ukáže aplikace)
  for (const mode of ['loop', 'day']) {
    const empty = planTrips([], { base: PRAHA, start: START, days: 2, mode });
    assert.equal(empty.days.length, 0);
    assert.equal(empty.note, null);
  }
});

test('roadtrip: veřejná doprava – odhad času odpovídá skutečným spojům', () => {
  const kh = C.find((c) => c.id === 'kh');
  const ks = C.find((c) => c.id === 'karlstejn');
  const DD = { lat: 51.0504, lon: 13.7373, tripKind: 'town' };
  // Praha–Kutná Hora vlakem ~1–1,5 h, Praha–Drážďany ~2,5 h, Karlštejn s cestou na hrad ~1 h 15 min
  assert.ok(transitMin(PRAHA, kh) >= 70 && transitMin(PRAHA, kh) <= 110, `Kutná Hora ${transitMin(PRAHA, kh)}`);
  assert.ok(transitMin(PRAHA, DD) >= 130 && transitMin(PRAHA, DD) <= 180, `Drážďany ${transitMin(PRAHA, DD)}`);
  assert.ok(transitMin(PRAHA, ks) >= 60 && transitMin(PRAHA, ks) <= 95, `Karlštejn ${transitMin(PRAHA, ks)}`);
  assert.equal(transitMin(PRAHA, ks), transitMin(ks, PRAHA), 'tam i zpět stejně');
  assert.ok(transitMin(PRAHA, kh) > driveMin(PRAHA, kh) - 15, 'veřejnou dopravou ne výrazně rychleji než autem');
  const ck = C.find((c) => c.id === 'ck');
  assert.ok(transitMin(PRAHA, ck) >= 170 && transitMin(PRAHA, ck) <= 215, `Český Krumlov ${transitMin(PRAHA, ck)} (bus ~3 h)`);
});

test('roadtrip: výlety vlakem a busem – méně zastávek za den, limity dne, údaje o cestě', () => {
  const day = planTrips(C, { base: PRAHA, start: START, days: 3, mode: 'day', transport: 'transit' });
  assert.equal(day.transport, 'transit');
  assert.ok(day.days.length >= 1);
  for (const d of day.days) {
    assert.ok(d.stops.length <= 2, 'normální tempo: nejvýš 2 zastávky');
    assert.ok(d.minutes <= CAP && d.travelMin <= 360, `${d.minutes} / ${d.travelMin}`);
    assert.ok(d.back && d.back.depart && d.back.arrive);
    for (const s of d.stops) {
      assert.match(s.depart, /^\d{2}:\d{2}$/);
      assert.equal(s.travelMin > 0, true);
    }
  }
  const car = planTrips(C, { base: PRAHA, start: START, days: 3, mode: 'day' });
  assert.equal(car.transport, 'car');
  const n = (r) => r.days.reduce((x, d) => x + d.stops.length, 0);
  assert.ok(n(day) <= n(car), 'veřejnou dopravou se nestihne víc než autem');
  // dva cíle na opačných stranách (Kutná Hora na východ, Karlštejn na západ) vlakem v jednom dni ne
  const kh = day.days.find((d) => d.stops.some((s) => s.id === 'kh'));
  if (kh) assert.ok(!kh.stops.some((s) => s.id === 'karlstejn' || s.id === 'krivoklat'), 'Kutná Hora a Karlštejn ne v jeden den');
  const loop = planTrips(C, { base: PRAHA, start: START, days: 4, mode: 'loop', transport: 'transit' });
  assert.ok(loop.days.length >= 2 && loop.days.length <= 4);
  for (const d of loop.days) assert.ok(d.minutes <= CAP && d.travelMin <= 360 && d.stops.length <= 2);
  assert.ok(loop.days.slice(0, -1).every((d) => d.overnight), 'přespání po cestě i bez auta');
});

test('roadtrip: přidaný cíl, který se vlakem nevejde do dne, ohlásí poznámka', () => {
  const far = { id: 'far', name: 'Vzdálený hrad', lat: 50.0875, lon: 14.4213 + 1.53, tripKind: 'castle', score: 1060, pinned: true };
  const r = planTrips([far, ...C], { base: PRAHA, start: START, days: 2, mode: 'day', transport: 'transit' });
  assert.ok(!r.days.some((d) => d.stops.some((s) => s.id === 'far')));
  assert.match(r.note, /Do plánu se nevešlo: Vzdálený hrad – vlakem a autobusem je to na jednodenní výlet moc daleko\./);
});
