// Zavírací dny památek (data/sight-hours.json, server/lib/hours.js) a jak s nimi pracuje plánovač programu: Louvre ne
// v úterý, Vatikánská muzea ne v neděli (kromě poslední v měsíci) a pořád ve stejný den jako bazilika sv. Petra,
// Pergamonmuseum v rekonstrukci vůbec, tipy na déšť jen otevřené. Data: jen z oficiálních webů, se zdrojem a datem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SIGHTS, DOW, sightHours, closedOn, closedDaysText, hoursNote, closedWhy } from '../server/lib/hours.js';
import { planItinerary, closedFix, addTips } from '../server/lib/itinerary.js';
import { addDays, weekday } from '../server/lib/dates.js';
import * as F from './fixtures/program-cities.js';

const RAW = JSON.parse(readFileSync(new URL('../data/sight-hours.json', import.meta.url), 'utf8'));
const by = (qid) => SIGHTS.find((s) => s.ids.includes(qid));

test('sight-hours.json: QID, poloha, dny v týdnu, svátky, oficiální zdroj a datum kontroly u každé památky', () => {
  assert.ok(RAW.sights.length >= 50, `${RAW.sights.length} památek`);
  const seen = new Set();
  for (const s of RAW.sights) {
    const at = s.name;
    assert.ok(Array.isArray(s.ids) && s.ids.length, `${at}: ids`);
    for (const id of s.ids) {
      assert.match(id, /^Q\d+$/, `${at}: ${id}`);
      assert.ok(!seen.has(id), `${at}: ${id} dvakrát`);
      seen.add(id);
    }
    assert.ok(typeof s.name === 'string' && s.name.length > 2 && typeof s.city === 'string', `${at}: název a město`);
    assert.ok(Number.isFinite(s.lat) && Number.isFinite(s.lon) && Math.abs(s.lat) <= 90 && Math.abs(s.lon) <= 180, `${at}: poloha`);
    assert.ok(Array.isArray(s.closed) && s.closed.every((d) => DOW.includes(d)), `${at}: closed ${s.closed}`);
    for (const md of s.dates || []) assert.match(md, /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, `${at}: datum ${md}`);
    assert.ok(s.except === undefined || (s.except === 'last-sunday' && s.closed.includes('ne')), `${at}: except`);
    assert.ok(s.shut === undefined || (/^\d{4}-\d{2}-\d{2}$/.test(s.shut) && typeof s.why === 'string'), `${at}: shut`);
    assert.ok(s.hours === undefined || /^[^\n]{5,60}$/.test(s.hours), `${at}: hours`);
    assert.match(s.src, /^https:\/\/[^\s]+$/, `${at}: zdroj`);
    assert.equal(s.checked, '2026-10-23', `${at}: datum kontroly`);
  }
});

test('sightHours: shoda podle QID, jinak podle názvu jen do 1 km (stejný název jinde ne)', () => {
  assert.equal(sightHours({ id: 'Q19675', name: 'cokoliv', lat: 0, lon: 0 })?.name, 'Louvre');
  assert.equal(sightHours({ id: 'Q1075988', name: 'Palais du Louvre' })?.name, 'Louvre', 'budova muzea má vlastní QID');
  assert.equal(sightHours({ id: 'wv:Louvre', name: 'Musée du Louvre', lat: 48.8608, lon: 2.3376 })?.name, 'Louvre');
  assert.equal(sightHours({ id: 'wv:x', name: 'Albertina', lat: 50.08, lon: 14.42 }), null, 'Albertina v Praze není vídeňská');
  assert.equal(sightHours({ id: 'Q244952', name: 'Santa Maria delle Grazie', lat: 45.46583, lon: 9.17111 }), null, 'kostel je otevřený – zavírá jen Poslední večeře');
  assert.equal(sightHours({ id: 'Q1', name: 'x' }), null);
});

test('closedOn: den v týdnu, poslední neděle ve Vatikánu, svátky a rekonstrukce; texty česky', () => {
  const louvre = by('Q19675');
  assert.equal(closedOn(louvre, '2026-11-10'), 'day', 'úterý');
  assert.equal(closedOn(louvre, '2026-11-11'), null);
  assert.equal(closedOn(louvre, '2026-12-25'), 'date');
  const vat = by('Q182955');
  assert.equal(closedOn(vat, '2026-11-08'), 'day', '2. neděle v listopadu');
  assert.equal(closedOn(vat, '2026-11-29'), null, 'poslední neděle v listopadu – otevřeno');
  assert.equal(closedOn(vat, '2026-02-22'), null, 'poslední neděle v únoru (28 dní)');
  assert.equal(closedOn(vat, '2026-02-15'), 'day');
  const perg = by('Q157298');
  assert.equal(closedOn(perg, '2027-06-03'), 'shut');
  assert.equal(closedOn(perg, '2027-06-04'), null);
  assert.equal(closedOn(by('Q10285'), '2026-12-25'), 'date', 'Koloseum 25. 12.');
  assert.equal(closedOn(by('Q10285'), '2026-12-24'), null);
  assert.equal(closedDaysText(louvre), 'zavřeno v úterý');
  assert.equal(closedDaysText(by('Q4890')), 'zavřeno v pondělí');
  assert.equal(closedDaysText(vat), 'v neděli zavřeno (kromě poslední neděle v měsíci)');
  assert.equal(closedDaysText(by('Q131330')), '');
  assert.equal(closedWhy(louvre, '2026-11-10'), 'v úterý zavřeno');
  assert.equal(closedWhy(by('Q51252'), '2026-11-09'), 'v pondělí zavřeno');
  assert.equal(closedWhy(louvre, '2026-12-25'), '25. 12. zavřeno');
  assert.equal(closedWhy(perg, '2026-11-10'), 'zavřeno kvůli rekonstrukci, otevře 4. 6. 2027');
  assert.equal(hoursNote(louvre, '2026-11-09', '2026-11-12'), 'zavřeno v úterý · otevřeno 9:00–18:00 (st a pá do 21:00)');
  assert.equal(hoursNote(louvre, '2026-12-23', '2027-01-02'), 'zavřeno v úterý · 1. 1. a 25. 12. zavřeno · otevřeno 9:00–18:00 (st a pá do 21:00)');
  assert.equal(hoursNote(by('Q5933'), '2026-11-09', '2026-11-12'), 'v neděli jen bohoslužby · otevřeno po–pá 9:30–16:30, so 9:00–16:00');
  assert.equal(hoursNote(by('Q131330'), '2026-11-09', '2026-11-12'), '', 'Schönbrunn: denně, bez celoroční doby – nic');
});

// Paříž: Louvre (v úterý zavřeno), Musée Rodin (v pondělí), Centre Pompidou (přestavba do 2030) a místa bez údajů
const PAR_C = { lat: 48.8566, lon: 2.3522 };
const PAR = [
  ['Q19675', 'Louvre', 48.86111, 2.33583, 'museum', 90, 170],
  ['Q2981', 'Katedrála Notre-Dame', 48.853, 2.3498, 'church', 85, 120],
  ['Q243', 'Eiffelova věž', 48.8584, 2.2945, 'tower', 88, 150],
  ['Q193193', 'Sainte-Chapelle', 48.85537, 2.34503, 'church', 70, 58],
  ['Q64436', 'Vítězný oblouk', 48.87378, 2.29504, 'monument', 75, 86],
  ['Q23402', 'Musée d’Orsay', 48.86, 2.3266, 'museum', 74, 90],
  ['Q650519', 'Musée Rodin', 48.85536, 2.31582, 'museum', 60, 38],
  ['Q178065', 'Centre Pompidou', 48.86064, 2.35224, 'museum', 72, 63],
  ['Q1137478', 'Jardin des Tuileries', 48.8634, 2.3275, 'park', 62, 40],
  ['Q193171', 'Place de la Concorde', 48.8656, 2.3212, 'square', 64, 60],
  ['Q187823', 'Panthéon', 48.8462, 2.3464, 'church', 66, 70],
  ['Q2232', 'Invalidovna', 48.8550, 2.3125, 'palace', 68, 75],
];
const parPlan = (start, end, extra = {}) => planItinerary(F.places(PAR), { center: PAR_C, start, end, arrivalTime: '07:30', departureTime: '21:30', pace: 'normal', ...extra });
const dayOf = (r, name) => r.days.findIndex((d) => d.items.some((p) => p.name === name));

test('plánovač: Louvre na jednodenní cestě v úterý ne – s upozorněním; Pompidou v přestavbě nikdy', () => {
  const r = parPlan('2026-11-10', '2026-11-10');
  assert.equal(dayOf(r, 'Louvre'), -1);
  assert.ok(r.warnings.includes('Louvre: v úterý zavřeno – v programu není.'), r.warnings.join(' / '));
  for (const [s, e] of [['2026-11-10', '2026-11-10'], ['2026-11-09', '2026-11-12'], ['2027-03-01', '2027-03-05']]) assert.equal(dayOf(parPlan(s, e), 'Centre Pompidou'), -1);
});

test('plánovač: pondělí + úterý v Paříži – Louvre v pondělí, Musée Rodin v úterý, u zastávky „zavřeno v úterý“', () => {
  const r = parPlan('2026-11-09', '2026-11-10', { interests: { museum: 1.5 } });
  const lv = dayOf(r, 'Louvre');
  assert.equal(r.days[lv]?.date, '2026-11-09', JSON.stringify(r.days.map((d) => d.items.map((p) => p.name))));
  assert.equal(r.days[lv].items.find((p) => p.name === 'Louvre').hoursNote, 'zavřeno v úterý · otevřeno 9:00–18:00 (st a pá do 21:00)');
  const ro = dayOf(r, 'Musée Rodin');
  assert.ok(ro === -1 || r.days[ro].date === '2026-11-10', 'Musée Rodin ne v pondělí');
  assert.ok(!r.warnings.some((w) => /Louvre/.test(w)));
});

test('plánovač: v Římě nikdy nic v zavírací den; Vatikánská muzea ne v neděli a pořád ve dni s bazilikou sv. Petra', () => {
  for (let s = 0; s < 14; s++) {
    for (const len of [2, 3, 4]) {
      const start = addDays('2026-11-02', s);
      const r = planItinerary(F.places(F.ROM), { center: F.ROM_C, start, end: addDays(start, len - 1), arrivalTime: '10:30', departureTime: '18:00' });
      for (const d of r.days) for (const p of d.items) assert.equal(closedOn(sightHours(p), d.date), null, `${start}+${len}: ${p.name} ${d.date}`);
      const v = dayOf(r, 'Vatikánská muzea');
      const pe = dayOf(r, 'Bazilika svatého Petra');
      if (v >= 0 && pe >= 0) assert.equal(v, pe, `${start}+${len}: muzea a bazilika v jednom dni`);
    }
  }
  // so–po: bez údajů o zavírání by Vatikán připadl na neděli 8. 11. – celý den se vymění s jiným
  const r = planItinerary(F.places(F.ROM), { center: F.ROM_C, start: '2026-11-07', end: '2026-11-09', arrivalTime: '10:30', departureTime: '18:00' });
  const v = dayOf(r, 'Vatikánská muzea');
  assert.ok(v >= 0 && weekday(r.days[v].date) !== 0);
  assert.equal(v, dayOf(r, 'Bazilika svatého Petra'));
});

test('closedFix: celý den se vymění, jednotlivé místo se přesune nebo vymění, jinak vypadne', () => {
  const P = (id, lat, visitMin = 60, category = 'museum') => ({ id, name: id, lat, lon: 12.5, visitMin, category });
  const shut = { A: '2026-11-08', B: '2026-11-08', X: '2026-11-08' };
  const isClosed = (p, date) => (Array.isArray(shut[p.id]) ? shut[p.id].includes(date) : shut[p.id] === date);
  // A a B (zavřené v neděli) spolu do pondělí, pondělní program do neděle
  const days = [{ date: '2026-11-08', cap: 360, items: [P('A', 41.9), P('B', 41.901)] }, { date: '2026-11-09', cap: 360, items: [P('C', 41.95), P('D', 41.951)] }];
  assert.deepEqual(closedFix(days, isClosed), []);
  assert.deepEqual(days.map((d) => d.items.map((p) => p.id)), [['C', 'D'], ['A', 'B']]);
  // jen A zavřené, druhý den plný a s X zavřeným v neděli (celý den vyměnit nejde): A za E, které je v neděli otevřené
  shut.B = null;
  const full = [{ date: '2026-11-08', cap: 120, items: [P('A', 41.9), P('B', 41.901)] }, { date: '2026-11-09', cap: 120, items: [P('X', 41.95), P('E', 41.951)] }];
  assert.deepEqual(closedFix(full, isClosed), []);
  assert.deepEqual(full.map((d) => d.items.map((p) => p.id).sort()), [['B', 'E'], ['A', 'X']]);
  // nikde otevřeno: vypadne
  shut.A = ['2026-11-08', '2026-11-09'];
  const one = [{ date: '2026-11-08', cap: 360, items: [P('A', 41.9)] }, { date: '2026-11-09', cap: 360, items: [] }];
  assert.deepEqual(closedFix(one, isClosed).map((x) => x.p.id), ['A']);
});

test('addTips: na déšť jen místa otevřená ten den', () => {
  const P = (id, category, dLat, score = 50) => ({ id, name: id, category, lat: 41.9 + dLat, lon: 12.5, score, visitMin: 60 });
  const days = [{ kind: 'city', date: '2026-11-09', items: [P('park', 'park', 0), P('vyhlidka', 'viewpoint', 0.002)] }];
  addTips(days, [...days[0].items, P('galerie', 'gallery', 0.003, 70), P('muzeum', 'museum', 0.004, 60), P('palac', 'palace', 0.004, 40)], [], { closed: (p, date) => p.id === 'galerie' && date === '2026-11-09' });
  assert.deepEqual(days[0].rain.map((p) => p.id), ['muzeum', 'palac']);
});
