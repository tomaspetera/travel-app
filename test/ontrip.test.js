// 📍 Dnes na cestě (app.js tripNow / nowParts / nowCard nad Trip.timeline z trip.js) a 🔖 rezervace u cesty (t.refs:
// pročištění a sloučení v backup.js, nikdy v odkazech). Klasické skripty prohlížeče přes node:vm; funkce z app.js jsou
// skutečné řádky vybrané podle jména (celý app.js potřebuje DOM). „Teď“ se předává – testy nezávisí na dnešním datu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { lisbon, lisbonOneWay, italy, vienna, plannerOnly, saved, lisbonPorto } from './fixtures/trips-now.js';

const src = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
const APP = src('app.js');
/** Konstanty a funkce z app.js podle jména (jednořádkové i víceřádkové). */
const pick = (...names) => names.map((n) => {
  const m = APP.match(new RegExp(`^(const ${n} = (?:.*\\{\\n[\\s\\S]*?^\\};|.*)|function ${n}\\([^\\n]*\\}|function ${n}\\([\\s\\S]*?^\\})$`, 'm'));
  assert.ok(m, `app.js: ${n}`);
  return m[0];
}).join('\n');
function load({ clipboard = false } = {}) {
  const ctx = { URLSearchParams, TextEncoder, TextDecoder, btoa, atob, console, navigator: clipboard ? { clipboard: { writeText: async () => {} } } : {} };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(pick('esc', 'enc', 'flag', 'safeUrl', 'cssUrl', 'pad', 'fmtYMD', 'fmtDate', 'czk'), ctx, { filename: 'app-helpers.js' });
  vm.runInContext(`var S = { trips: [] }, __els = {}, __go = [], __toasts = [];
    var $ = (s) => (__els[s] ||= { innerHTML: '', value: '', remove() {} });
    var $$ = () => []; var go = (v) => { __go.push(v); }; var save = () => {}; var toast = (m) => { __toasts.push(m); }; var confirm = () => true;
    var byIso = { PT: { cs: 'Portugalsko' }, IT: { cs: 'Itálie' }, AT: { cs: 'Rakousko' } }; var PACK = ['Pas'];`, ctx, { filename: 'stubs.js' });
  // ikony počasí (štítek předpovědi na kartě) – jen tabulka z data.js, zbytek dat aplikace karta nepotřebuje
  vm.runInContext(src('data.js').match(/^const (WC|wIco)=.*$/gm).join('\n'), ctx, { filename: 'data.js' });
  for (const f of ['ics.js', 'planshare.js', 'weather.js', 'backup.js', 'trip.js', 'places.js']) vm.runInContext(src(f), ctx, { filename: f });
  vm.runInContext(pick('todayLocal', 'daysTo', 'inDays', 'okYmd', 'ymdPlus', 'wallAt', 'ridesOf', 'dtPlus', 'rideOn', 'tripGround', 'tripLegs', 'tripZone', 'tripBack', 'tripNow', 'tripWiz', 'tripRows', 'pastRows', 'nowParts',
    'hmTxt', 'dowLbl', 'canCopy', 'doGen', 'rideAhead', 'nowCard', 'NWX_LS', 'nowWx', 'tripLive', 'tripOrder', 'tripRides', 'rideEd', 'rideSet',
    'dateRange', 'planIco', 'planTransport', 'tripIsos', 'tripVia', 'planEvents'), ctx, { filename: 'app-now.js' });
  return ctx;
}
const C = load();
const plain = (x) => JSON.parse(JSON.stringify(x));
const sp = (s) => String(s).replace(/ /g, ' ');
const UTC = (d, hm) => Date.parse(`${d}T${hm}:00Z`);
// poledne v zóně tohoto počítače – cesty bez zón spojů berou den zařízení (testy pak platí v kterékoli zóně)
const noon = (d) => new Date(`${d}T12:00:00`).getTime();
const DOW = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];
const dayLbl = (ymd) => { const d = new Date(ymd + 'T12:00:00'); return `${DOW[d.getDay()]} ${d.getDate()}. ${d.getMonth() + 1}.`; };
const rowsOf = (h) => [...h.matchAll(/<div class="tl-row"><span class="tl-d">([^<]*)<\/span><span class="tl-i">([^<]*)<\/span><span>(.*?)<\/span><\/div>/g)].map((m) => [m[1], m[2], m[3]]);
const lines = (rows) => plain(rows).map((r) => `${r[0]} ${r[1]} ${r[2]}`);

test('Trip.timeline: průběh cesty ve shrnutí je řádek po řádku Trip.timeline – stejný jako před refaktorem, navíc jen číslo letu', () => {
  // Zachyceno ze shrnutí před vytažením Trip.timeline (test/fixtures/timeline-golden.json); jediná zamýšlená změna:
  // u letu tam / zpět i číslo letu (karta „Dnes na cestě“ ho chce, tabule na letišti ho ukazují). Ceny z czk() mají
  // před „Kč“ pevnou mezeru (na telefonu se částka neroztrhne na dva řádky) – i v uloženém vzoru.
  const GOLD = JSON.parse(readFileSync(new URL('./fixtures/timeline-golden.json', import.meta.url), 'utf8'));
  const FLNO = { lisbon: ['FR 1234', 'FR 1235'], lisbonOneWay: ['FR 1234'], italy: ['W6 2301', 'W6 2301'], vienna: [] };
  for (const [name, mk] of Object.entries({ lisbon, lisbonOneWay, italy, vienna })) {
    const c = load();
    c.S.trip = mk();
    c.Trip.render();
    const h = c.__els['#tripStep'].innerHTML, got = rowsOf(h.slice(h.indexOf('<div class="timeline">')));
    const no = [...FLNO[name]];
    assert.deepEqual(got, GOLD[name].map(([d, i, x]) => [d, i, /^(🛫|🛬)$/u.test(i) ? `${x} · ${no.shift()}` : x]), name);
    assert.equal(no.length, 0, `${name}: čísla letů`);
    // shrnutí = Trip.timeline (karta „Dnes na cestě“ bere stejné řádky)
    assert.deepEqual(got, plain(c.Trip.timeline(mk())).map((r) => [dayLbl(r[0]), r[1], r[2]]), name);
  }
  assert.ok(C.Trip.timeline(lisbon()).every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r[0])), 'bez „~“ za datem');
});

test('Trip.timeline: den programu nese program a den (trasa pěšky na kartě); aktivity přidané v plánovači (o.own) po programu dne, před odletem', () => {
  const rows = C.Trip.timeline(lisbon(), { own: { '2026-11-13': ['Fado v Alfamě <b>'], '2026-11-17': ['Snídaně'], 'x': ['ne'], '2026-11-14': [] } });
  const r13 = rows.filter((r) => r[0] === '2026-11-13');
  assert.deepEqual(plain(r13.map((r) => `${r[1]} ${r[2]}`)), ['📍 Belém · Jerónimos', '📝 Fado v Alfamě &lt;b&gt;']);
  assert.deepEqual(plain(r13[0][3].day.items).map((x) => x.name), ['Belém', 'Jerónimos']);
  assert.equal(r13[0][3].plan.center.label, 'Hotel Lisboa Centro');
  assert.equal(r13[1][3], undefined);
  assert.deepEqual(plain(rows.filter((r) => r[0] === '2026-11-17').map((r) => r[1])), ['📝', '🚪', '🚇', '🛬', '🚆'], 'aktivita dne odletu před cestou na letiště');
  // trasa přes víc míst: program místa i vlastní aktivity
  const it = C.Trip.timeline(italy(), { own: { '2026-11-14': ['Uffizi – rezervace 10:15'] } });
  assert.deepEqual(lines(it.filter((r) => r[0] === '2026-11-14')), ['2026-11-14 📝 Uffizi – rezervace 10:15']);
  assert.equal(it.find((r) => r[2] === 'Milán: Brera')[3].plan.center.city, 'Milán');
});

test('Trip.timeline: cesta jen z plánovače – lety s časem, dopravcem a číslem, online check-in, vlak, aktivity dnů; zpět až po aktivitách', () => {
  const t = plannerOnly({ days: { '2026-11-13': ['Belém', 'Pastéis <de> Belém'], '2026-11-17': ['Time Out Market'] } });
  assert.deepEqual(lines(C.Trip.timeline(t)), [
    '2026-11-11 📲 Online check-in Ryanair PRG → LIS: otevře se 11.11. v 06:25 (24\u00a0h před odletem), zavře 2\u00a0h před odletem · na letišti se platí ~55\u00a0€/os.',
    '2026-11-12 🛫 PRG 06:25 → LIS 09:05 · Ryanair · FR 1234',
    '2026-11-13 📍 Belém · Pastéis &lt;de&gt; Belém',
    '2026-11-16 📲 Online check-in Ryanair LIS → PRG: otevře se 16.11. v 10:00 (24\u00a0h před odletem), zavře 2\u00a0h před odletem · na letišti se platí ~55\u00a0€/os.',
    '2026-11-17 📍 Time Out Market',
    '2026-11-17 🛬 LIS 10:00 → PRG 14:35 · Ryanair · FR 1235',
  ]);
  // vlak / bus (groundBrief) a let bez času; poškozené položky pryč
  const g = plannerOnly({
    legs: [{ from: 'PRG', to: 'OPO', date: '2026-11-12', dep: null, arr: null, carrier: 'TAP', flightNo: '' }, null, { date: 'x' }],
    ground: [{ from: 'Praha', to: 'Vídeň', date: '2026-11-13', dep: '2026-11-13T06:01', arr: '2026-11-13T09:55', kind: 'vlak', carrier: 'RegioJet', fromStation: 'hl.n.', toStation: 'Wien Hbf' },
      { from: 'Vídeň', to: 'Praha', date: '2026-11-17', dep: null, arr: null, kind: 'bus', min: 270 }],
    days: {},
  });
  assert.deepEqual(lines(C.Trip.timeline(g)), [
    '2026-11-12 🛫 PRG → OPO · TAP · čas ověř',
    '2026-11-13 🚆 Praha 06:01 → Vídeň 09:55 · vlak · hl.n. → Wien Hbf (RegioJet)',
    '2026-11-17 🚌 Vídeň → Praha · bus · ~4\u00a0h 30\u00a0min, čas ověř',
  ]);
  assert.deepEqual(plain(C.Trip.timeline({ name: 'Bez ničeho' })), []);
});

test('tripNow: od 2 dnů před odjezdem do konce cesty – předtím, potom, cesty bez data a skončené nic', () => {
  const trips = [saved(lisbon())];
  const at = (d, hm) => C.tripNow(trips, UTC(d, hm));
  assert.equal(at('2026-11-09', '12:00'), null, '3 dny před odletem');
  const before = at('2026-11-10', '12:00');
  assert.deepEqual([before.i, before.on, before.until, before.today, before.tz], [0, false, 2, '2026-11-10', 'Europe/Prague']);
  assert.deepEqual([at('2026-11-11', '12:00').until, at('2026-11-11', '12:00').on], [1, false]);
  const d1 = at('2026-11-12', '02:00'); // 3:00 v Praze, odlet 6:25
  assert.deepEqual([d1.on, d1.day, d1.days, d1.tz], [true, 1, 6, 'Europe/Prague'], 'den odletu, ještě doma');
  const d3 = at('2026-11-14', '12:00');
  assert.deepEqual([d3.on, d3.day, d3.days, d3.today, d3.tz, d3.end], [true, 3, 6, '2026-11-14', 'Europe/Lisbon', '2026-11-17']);
  assert.equal(at('2026-11-17', '20:00').day, 6, 'den návratu do konce');
  assert.equal(at('2026-11-18', '12:00'), null, 'po cestě');
  // bez data, s neplatným datem, návrat před odjezdem = jen den odjezdu
  const odd = [{ name: 'bez data' }, { start: '' }, { start: '2026-13-45', end: '2026-14-01' }, null, 'x', { start: '2026-11-14', end: '2026-11-01', name: 'jednodenní' }];
  const x = C.tripNow(odd, noon('2026-11-14'));
  assert.deepEqual([x.i, x.day, x.days, x.end], [5, 1, 1, '2026-11-14']);
  assert.equal(C.tripNow(odd, noon('2026-11-15')), null);
  assert.equal(C.tripNow(undefined, 0), null);
});

test('tripNow: „dnes“ podle místa cesty – doma před odletem, v cíli po něm, doma po návratu; půlnoc a změna času', () => {
  const trips = [saved(lisbon())];
  const today = (iso) => { const x = C.tripNow(trips, Date.parse(iso)); return x && `${x.today} ${x.tz}${x.on ? ` den ${x.day}` : ` za ${x.until}`}`; };
  // před odletem platí pražská půlnoc (Lisabon je o hodinu pozadu)
  assert.equal(today('2026-11-09T22:30:00Z'), null, '23:30 v Praze 9. 11. → za 3 dny');
  assert.equal(today('2026-11-09T23:30:00Z'), '2026-11-10 Europe/Prague za 2', '0:30 v Praze 10. 11.');
  // v Lisabonu po půlnoci pražského času je ještě předchozí den
  assert.equal(today('2026-11-12T23:30:00Z'), '2026-11-12 Europe/Lisbon den 1', '23:30 v Lisabonu = 0:30 v Praze');
  assert.equal(today('2026-11-13T00:10:00Z'), '2026-11-13 Europe/Lisbon den 2');
  // po odletu zpět (Lisabon 10:00) zase Praha: 0:30 pražského času 18. 11. = po cestě, i když v Lisabonu je 17. 11.
  assert.equal(today('2026-11-17T23:00:00Z'), null, '0:00 v Praze 18. 11. – v Lisabonu je ještě 17. 11., ale cesta skončila doma');
  assert.equal(today('2026-11-17T22:30:00Z'), '2026-11-17 Europe/Prague den 6');
  // změna času (Lisabon a Praha 25. 10. 2026 v 1:00 UTC): letní WEST +1, zimní WET 0
  const oct = saved(lisbon({
    flight: { ...lisbon().flight, out: { ...lisbon().flight.out, date: '2026-10-23', dep: '2026-10-23T06:25:00', arr: '2026-10-23T09:05:00' }, back: { ...lisbon().flight.back, date: '2026-10-27', dep: '2026-10-27T10:00:00', arr: '2026-10-27T14:35:00' } },
  }));
  const d = (iso) => { const x = C.tripNow([oct], Date.parse(iso)); return `${x.today} den ${x.day}`; };
  assert.equal(d('2026-10-24T23:30:00Z'), '2026-10-25 den 3', 'letní čas: 0:30 25. 10.');
  assert.equal(d('2026-10-25T23:30:00Z'), '2026-10-25 den 3', 'zimní čas: 23:30 25. 10.');
  assert.equal(d('2026-10-26T00:00:00Z'), '2026-10-26 den 4');
  // vlak: zóny měst (groundBrief)
  const v = C.tripNow([saved(vienna())], UTC('2026-11-03', '23:30'));
  assert.deepEqual([v.today, v.tz, v.on, v.day], ['2026-11-04', 'Europe/Prague', true, 1]);
  assert.equal(C.tripNow([saved(vienna())], UTC('2026-11-04', '12:00')).tz, 'Europe/Vienna');
  // bez zón (cesta jen s daty): den zařízení
  const local = (ms) => { const x = new Date(ms); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  const ms = noon('2026-11-14'), p = C.tripNow([{ name: 'Výlet', start: '2026-11-13', end: '2026-11-15' }], ms);
  assert.deepEqual([p.today, p.tz], [local(ms), null]);
});

test('tripNow: víc cest najednou – probíhající má přednost (naposledy začatá, pak dřív končící), jinak nejbližší odjezd', () => {
  const long = { name: 'Celý listopad', start: '2026-11-01', end: '2026-11-30' };
  const lis = saved(lisbon());
  const pick = (trips, d = '2026-11-14') => { const x = C.tripNow(trips, noon(d)); return x && x.t.name; };
  assert.equal(pick([long, lis]), lis.name, 'výlet uprostřed delší cesty');
  assert.equal(pick([lis, long]), lis.name);
  assert.equal(pick([long, lis], '2026-11-19'), 'Celý listopad', 'po výletu zase delší cesta');
  const a = { name: 'A', start: '2026-11-10', end: '2026-11-14' }, b = { name: 'B', start: '2026-11-15', end: '2026-11-20' };
  assert.equal(pick([b, a], '2026-11-13'), 'A', 'probíhající před nadcházející');
  assert.equal(pick([b, a], '2026-11-15'), 'B', 'A skončila');
  const c = { name: 'C', start: '2026-11-14', end: '2026-11-16' }, d = { name: 'D', start: '2026-11-14', end: '2026-11-15' };
  assert.equal(pick([b, c], '2026-11-13'), 'C', 'nejbližší odjezd');
  assert.equal(pick([c, d], '2026-11-14'), 'D', 'stejný začátek → dřív končící');
  assert.equal(pick([{ name: 'Skončená', start: '2026-11-01', end: '2026-11-11' }], '2026-11-12'), null);
  assert.equal(C.tripNow([long, lis], noon('2026-11-14')).i, 1, 'index cesty v S.trips');
});

test('tripNow + nowCard: výlet z plánovače či z Objevuj ve dnech cesty se spoji kartu nepřebije – ukáže se pod ní („také dnes“)', () => {
  const c = load({ clipboard: true });
  const lis = saved(lisbon(), { refs: [{ co: 'Let tam i zpět', kod: 'K7QW2P', pozn: 'Ryanair' }] });
  lis.checklist = [{ t: 'Zařídit: cestovní pojištění', done: false }, ...Array.from({ length: 21 }, (_, k) => ({ t: `Věc ${k}`, done: false }))];
  // Plánovač → Nová cesta (bez letu) na den příletu a výlet pěšky z Objevuj. Cesty bez spojů berou den zařízení – den
  // v zóně tohoto počítače v okamžiku karty (v Praze 12. a 13. 11.; v New Yorku je ve 4:00 pražského času ještě 11. 11.)
  const devDay = (iso) => { const x = new Date(iso); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  const d12 = devDay('2026-11-12T03:00:00Z'), d13 = devDay('2026-11-13T10:00:00Z');
  const alfama = { name: 'Odpoledne v Alfamě', dest: 'Lisabon', iso: null, start: d12, end: d12, pax: '2', budget: '', flight: null, days: {}, checklist: Array.from({ length: 8 }, (_, k) => ({ t: `x${k}`, done: false })), notes: '' };
  const hike = { name: 'Pěšky: Lisabon – Alfama 6 km', dest: 'Alfama', iso: 'PT', start: d13, end: d13, days: { [d13]: ['🥾 Okruh 6 km z Alfama', 'Trasa v Mapy.com'] }, notes: '', src: 'hike', explore: {}, pax: '2', budget: '', checklist: [{ t: 'Pas', done: false }] };
  const card = (trips, iso) => { const n = Date.parse(iso), x = c.tripNow(trips, n), p = c.nowParts(x, n); return { x, p, h: sp(c.nowCard(x, p)) }; };
  // ráno odletu (4:00 v Praze): pořád cesta s letem – z domu, let, odpočet, rezervace, „Sbaleno“ z její (22 věcí)
  for (const trips of [[lis, alfama], [alfama, lis]]) {
    const m = card(trips, '2026-11-12T03:00:00Z');
    assert.equal(m.x.t, lis);
    assert.deepEqual(plain(m.x.also.map((y) => [y.t.name, y.today])), [['Odpoledne v Alfamě', d12]]);
    assert.ok(m.h.includes('📍 Dnes na cestě · den 1 z 6 · <b>Lisabon</b>') && m.h.includes('Vyraž z domu nejpozději v 3:40') && m.h.includes('PRG 06:25 → LIS 09:05 · Ryanair · FR 1234'), m.h);
    assert.ok(m.h.includes('✈️ Odlet PRG → LIS <b data-nw="cd"></b>') && m.h.includes('<code>K7QW2P</code>'), m.h);
    assert.ok(m.h.includes('🧾 Před cestou zbývá zařídit 1 a sbalit 21'), m.h);
    const ai = trips.indexOf(alfama);
    assert.ok(m.h.includes(`<li class="nw-also"><span class="nw-i">📌</span><span><span class="nw-d">také dnes</span><b>Odpoledne v Alfamě</b> · <button type="button" class="linkbtn" data-nw-plan="${ai}">Otevřít plán →</button></span></li>`), m.h);
    assert.equal(m.p.hotel, null, 'doma před odletem bez navigace do hotelu v Lisabonu');
  }
  // další den výlet pěšky: hotel, místní čas a rezervace cesty, výlet s programem pod dnešními řádky
  const d = card([hike, lis], '2026-11-13T10:00:00Z');
  assert.equal(d.x.t, lis);
  assert.deepEqual([d.p.hotel && d.p.hotel.name, d.p.clock, d.p.refs.length], ['Hotel Lisboa Centro', '10:00', 1]);
  assert.ok(d.h.includes('<span class="nw-d">také dnes</span><b>Pěšky: Lisabon – Alfama 6 km</b> · 🥾 Okruh 6 km z Alfama · Trasa v Mapy.com · <button type="button" class="linkbtn" data-nw-plan="0">'), d.h);
  assert.ok(d.h.indexOf('nw-also') > d.h.indexOf('Belém · Jerónimos') && d.h.indexOf('nw-also') < d.h.indexOf('nw-next'), 'po dnešních řádcích, před zítřkem');
  // bez cesty se spoji výlet sám (jako dřív) a bez „také dnes“
  const solo = card([hike], '2026-11-13T10:00:00Z');
  assert.deepEqual([solo.x.t.name, solo.x.also.length, solo.h.includes('nw-also')], [hike.name, 0, false]);
  // výlet se spoji uprostřed cesty (vlakem do Porta): ten den výlet, rezervace cesty zůstanou na kartě
  const porto = { name: 'Porto', dest: 'Porto', start: '2026-11-14', end: '2026-11-16', days: {}, checklist: [], refs: [{ co: 'Vlak', kod: 'CP-77' }], ground: [
    { from: 'Lisabon', to: 'Porto', date: '2026-11-14', dep: '2026-11-14T08:00', arr: '2026-11-14T11:00', fromTz: 'Europe/Lisbon', toTz: 'Europe/Lisbon', kind: 'vlak' },
    { from: 'Porto', to: 'Lisabon', date: '2026-11-16', dep: '2026-11-16T18:00', arr: '2026-11-16T21:00', fromTz: 'Europe/Lisbon', toTz: 'Europe/Lisbon', kind: 'vlak' }] };
  const p15 = card([lis, porto], '2026-11-15T12:00:00Z');
  assert.deepEqual([p15.x.t.name, plain(p15.p.refs.map((r) => r.kod))], ['Porto', ['CP-77', 'K7QW2P']]);
  // den návratu z Porta: vlak do 24 h – Porto i proti dřív končící cestě
  assert.equal(card([lis, porto], '2026-11-16T09:00:00Z').x.t.name, 'Porto');
  assert.equal(card([lis, porto], '2026-11-16T22:00:00Z').x.t.name, lis.name, 'zpět v Lisabonu (Porto doma)');
  // deštník bez spojů (celý listopad): probíhá, ale den před odletem (do 24 h) má přednost cesta se spoji
  const long = { name: 'Celý listopad', start: '2026-11-01', end: '2026-11-30', days: { [devDay('2026-11-11T07:00:00Z')]: ['Večeře'] } };
  assert.equal(card([long, lis], '2026-11-10T12:00:00Z').x.t.name, 'Celý listopad', 'odlet za víc než 24 h – probíhající');
  const e = card([long, lis], '2026-11-11T07:00:00Z');
  assert.deepEqual([e.x.t, e.x.on, e.x.until, e.p.ahead.l.from], [lis, false, 1, 'PRG']);
  assert.ok(e.h.includes('🧳 Zítra odlet') && e.h.indexOf('nw-also') < e.h.indexOf('nw-day') && e.h.includes('<b>Celý listopad</b> · Večeře'), e.h);
});

test('tripNow + nowParts: večer po návratu domů má přednost zítřejší odlet; hotel jen v cíli (po příletu, do odletu zpět)', () => {
  const lis = saved(lisbon());
  const rim = { name: 'Řím', dest: 'Řím', iso: 'IT', start: '2026-11-18', end: '2026-11-21', pax: '1', budget: '', flight: 'PRG→FCO 18.11. 06:00 (Ryanair)', days: {}, notes: '',
    checklist: [{ t: 'Zařídit: cestovní pojištění', done: false }, { t: 'Pas', done: false }],
    legs: [{ from: 'PRG', to: 'FCO', date: '2026-11-18', dep: '2026-11-18T06:00', arr: '2026-11-18T07:45', arrEst: false, fromTz: 'Europe/Prague', toTz: 'Europe/Rome', carrier: 'Ryanair', flightNo: 'FR 1880', durationMin: 105 }],
    refs: [{ co: 'Let do Říma', kod: 'RM8Q1Z', pozn: '' }] };
  const at = (trips, iso) => { const n = Date.parse(iso), x = C.tripNow(trips, n), p = C.nowParts(x, n); return { x, p, h: sp(C.nowCard(x, p)) }; };
  // 20:00 v Praze, doma od 14:35: zítřejší let do Říma (odpočet, „zařídit“, kód), Lisabon už ne
  const ev = at([lis, rim], '2026-11-17T19:00:00Z');
  assert.deepEqual([ev.x.t.name, ev.x.on, ev.x.until, ev.x.also.length, ev.p.ahead.l.to, plain(ev.p.todo), plain(ev.p.refs.map((r) => r.kod))], ['Řím', false, 1, 0, 'FCO', { zar: 1, bal: 1 }, ['RM8Q1Z']]);
  assert.ok(ev.h.includes('🧳 Zítra odlet · <b>Řím</b>') && ev.h.includes('✈️ Odlet PRG → FCO') && ev.h.includes('🧾 Před cestou zbývá zařídit 1 a sbalit 1') && !ev.h.includes('Hotel Lisboa'), ev.h);
  // ráno 17. 11. (let zpět za 2 h) i v letadle domů ještě Lisabon
  assert.equal(at([rim, lis], '2026-11-17T08:00:00Z').x.t, lis);
  assert.equal(at([rim, lis], '2026-11-17T12:00:00Z').x.t, lis, 'v letadle zpět');
  assert.equal(at([rim, lis], '2026-11-17T13:40:00Z').x.t.name, 'Řím', 'po přistání v Praze');
  // samotná cesta po návratu: karta do půlnoci (den 6 z 6), ale bez navigace do hotelu v Lisabonu
  const home = at([lis], '2026-11-17T19:00:00Z');
  assert.deepEqual([home.x.day, home.x.home, home.p.hotel, home.h.includes('🏨')], [6, true, null, false]);
  assert.ok(home.h.includes('🏠 Zpátky doma · <b>Lisabon</b>') && !home.h.includes('Dnes na cestě ·') && !home.h.includes('🕐'), home.h);
  // dnešní řádky, které už proběhly, jsou ztlumené (ne schované)
  const pastOf = (p) => p.rows.map((r, k) => `${r[1]}${p.past[k] ? '·' : ''}`).join(' ');
  // ráno v Lisabonu nic; po 7:15 „vyraž z ubytování“; v letadle (do příletu 14:35) let ani metro ještě ne; doma vše
  assert.deepEqual(['06:00', '09:30', '12:00'].map((hm) => pastOf(at([lis], `2026-11-17T${hm}:00Z`).p)),
    ['🚪 🚇 🛬 🚆', '🚪· 🚇 🛬 🚆', '🚪· 🚇 🛬 🚆']);
  assert.equal(pastOf(home.p), '🚪· 🚇· 🛬· 🚆·');
  assert.equal((home.h.match(/<li class="nw-past">/g) || []).length, 4, home.h);
  assert.equal((at([lis], '2026-11-17T06:00:00Z').h.match(/nw-past/g) || []).length, 0);
  assert.equal(plain(C.pastRows([['d', '🍽️', 'Večeře ve 20:30'], ['d', '📍', 'Program'], ['d', '🛫', 'FCO <b>21:40</b> → PRG 23:35']], '21:00')).join(), 'true,false,false',
    'večeře proběhla; program bez času po ní ne (další řádek ještě neproběhl); čas v HTML se počítá bez značek');
  // hotel: ne doma před odletem, ano po přistání, ne po odletu zpět
  const hotel = (iso) => at([lis], iso).p.hotel && at([lis], iso).p.hotel.name;
  assert.deepEqual(['2026-11-12T03:00:00Z', '2026-11-12T07:00:00Z', '2026-11-12T09:10:00Z', '2026-11-17T09:30:00Z', '2026-11-17T10:05:00Z'].map(hotel), [null, null, 'Hotel Lisboa Centro', 'Hotel Lisboa Centro', null]);
  // z průvodce je druhý spoj zpět, i když přistane jinde (Drážďany, jiná zóna): doma, hotel jen do odletu
  const dd = saved(lisbon());
  dd.legs[1] = { ...dd.legs[1], to: 'DRS', toTz: 'Europe/Berlin' };
  assert.deepEqual([at([dd], '2026-11-17T19:00:00Z').x.home, at([dd], '2026-11-17T10:05:00Z').p.hotel], [true, null]);
  // plánovač bez průvodce návrat jinam nepozná – zítřejší odlet (do 24 h) má přednost i tak
  const pd = { ...dd, wizard: undefined };
  assert.deepEqual([at([pd], '2026-11-17T19:00:00Z').x.home, at([pd, rim], '2026-11-17T19:00:00Z').x.t.name], [false, 'Řím']);
  // let bez času: v den odletu se neví kdy – hotel ukázat (navigace z letiště)
  const nt = saved(lisbon());
  nt.legs[0] = { ...nt.legs[0], dep: null, arr: null };
  assert.equal(at([nt], '2026-11-12T08:00:00Z').p.hotel.name, 'Hotel Lisboa Centro');
  // cesta jen tam: hotel po příletu do konce
  assert.equal(at([saved(lisbonOneWay())], '2026-11-16T20:00:00Z').p.hotel.name, 'Hotel Lisboa Centro');
});

test('Víc měst jen tam (PRG → FCO → BCN): poslední let není návrat – ✈️ před programem dne, cesta po přistání pořád probíhá', () => {
  const mc = { name: 'Řím a Barcelona', dest: 'Řím, Barcelona', iso: null, start: '2026-11-12', end: '2026-11-15', pax: '1', budget: '', flight: '1. PRG→FCO …', days: { '2026-11-15': ['Snídaně u Pantheonu'] }, checklist: [], notes: '',
    legs: [{ from: 'PRG', to: 'FCO', date: '2026-11-12', dep: '2026-11-12T07:00', arr: '2026-11-12T09:00', fromTz: 'Europe/Prague', toTz: 'Europe/Rome', carrier: 'Wizz Air', flightNo: 'W6 1' },
      { from: 'FCO', to: 'BCN', date: '2026-11-15', dep: '2026-11-15T15:00', arr: '2026-11-15T17:00', fromTz: 'Europe/Rome', toTz: 'Europe/Madrid', carrier: 'Vueling', flightNo: 'VY 6107' }] };
  assert.deepEqual(lines(C.Trip.timeline(mc)).filter((l) => l.startsWith('2026-11-15')), ['2026-11-15 ✈️ FCO 15:00 → BCN 17:00 · Vueling · VY 6107', '2026-11-15 📍 Snídaně u Pantheonu']);
  const n = Date.parse('2026-11-15T20:00:00Z'), x = C.tripNow([mc], n);
  assert.deepEqual([x.home, x.tz, x.today], [false, 'Europe/Madrid', '2026-11-15']);
  // zpět: na první letiště, jiné letiště doma (stejná zóna), vlak zpět do města odjezdu; jen tam ne
  const L = C.Trip.legBack;
  assert.deepEqual([
    L({ from: 'PRG', fromTz: 'Europe/Prague' }, { to: 'PRG', toTz: 'Europe/Prague' }),
    L({ from: 'PRG', fromTz: 'Europe/Prague' }, { to: 'BRQ', toTz: 'Europe/Prague' }),
    L({ from: 'Praha', fromTz: null }, { to: ' praha', toTz: null }),
    L({ from: 'PRG', fromTz: 'Europe/Prague' }, { to: 'BCN', toTz: 'Europe/Madrid' }),
    L({ from: 'PRG' }, { to: 'FCO' }), L(null, { to: 'PRG' }), L({ from: '' }, { to: '' }),
  ], [true, true, true, false, false, false, false]);
  // cesta tam a zpět beze změny: 🛬 po aktivitách dne
  assert.deepEqual(plain(C.Trip.timeline(plannerOnly({ days: { '2026-11-17': ['Time Out Market'] } })).filter((r) => r[0] === '2026-11-17').map((r) => r[1])), ['📍', '🛬']);
});

test('nowParts: apostrofy a uvozovky z průvodce na kartě zůstanou (program, hotel, trasa pěšky, navigace) – escapované', () => {
  const real = (w) => { const c = load(); c.S.trip = w; c.S.trip.step = 'summary'; c.Trip.render(); c.__els['#sumSave'].onclick(); return c.S.trips[0]; };
  const it = italy();
  it.route.bases[2].plan.days[0].items[1].name = "Castel Sant'Angelo";
  const t = real(it);
  assert.deepEqual(plain(t.days['2026-11-17']), ['Řím: Koloseum', "Řím: Castel Sant'Angelo"]);
  const n = Date.parse('2026-11-17T09:00:00Z'), x = C.tripNow([t], n), p = C.nowParts(x, n), h = C.nowCard(x, p);
  assert.deepEqual(plain(p.rows.map((r) => r[2]))[0], 'Řím: Koloseum · Castel Sant&#39;Angelo');
  assert.ok(/destination=Castel(\+|%20)Sant(%27|&#39;|')Angelo/.test(h) && !/SantAngelo/.test(h), h.match(/destination=[^&"]*/));
  const w = lisbon();
  w.stay.name = "Hotel D'Angleterre \"Centro\"";
  const l = real(w), m = Date.parse('2026-11-13T11:00:00Z'), lx = C.tripNow([l], m), lp = C.nowParts(lx, m);
  assert.deepEqual(plain(lp.hotel), { name: "Hotel D'Angleterre \"Centro\"", q: "Hotel D'Angleterre \"Centro\", Lisabon, Portugalsko" });
  const lh = C.nowCard(lx, lp);
  assert.ok(lh.includes('🏨 Hotel D&#39;Angleterre &quot;Centro&quot; · <a href="https://www.google.com/maps/dir/?api=1&amp;destination=Hotel+D%27Angleterre+%22Centro%22%2C+Lisabon%2C+Portugalsko&amp;travelmode=transit"'), lh);
  // pořád bez < > ` (karta je jen escapuje, ale ať je cesta pročištěná jako jinde)
  const bad = lisbon();
  bad.stay.name = 'Hotel <b>`X`</b>';
  const b = real(bad), bx = C.tripNow([b], m);
  assert.equal(C.nowParts(bx, m).hotel.name, 'Hotel bX/b');
  // Trip.sanitizeTrip bez volby dál apostrofy a uvozovky vyhazuje (odkaz #trip=, záloha, „Otevřít v průvodci“)
  assert.equal(C.Trip.sanitizeTrip(plain(l.wizard)).stay.name, 'Hotel DAngleterre Centro');
});

test('🔖 rezervace v okně cesty: Enter v „Co“ (a v prázdném „Kódu“) jen přejde na další pole, uloží kód nebo poznámka', () => {
  const c = load();
  vm.runInContext(`var __add = []; var addRef = (i) => { __add.push(i); }; var ico = () => '';`, c);
  vm.runInContext(pick('refsHtml', 'refKey'), c);
  const h = c.refsHtml({ refs: [] }, 3);
  // pole s data-refk (Enter obslouží openTrip přes refKey) – bez obsluh v HTML (atribut onkeydown CSP stránky nepustí)
  // placeholder krátce (na 360 px má pole ~127 px – „Co (let tam, hotel…)“ se uřízlo), celý popis v aria-label
  assert.ok(h.includes('id="refCo-3" maxlength="40" placeholder="Co (let, hotel…)" aria-label="Co je to za rezervaci (let tam, hotel…)" enterkeyhint="next" data-refk="0"'), h);
  assert.ok(h.includes('enterkeyhint="done" data-refk="1"') && h.includes('enterkeyhint="done" data-refk="2"') && h.includes('data-addref>Přidat'), h);
  assert.doesNotMatch(h, /\son[a-z]+=/, 'žádná obsluha v HTML');
  const focus = [];
  for (const k of ['refCo', 'refKod', 'refNote']) c.__els[`#${k}-3`] = { value: '', focus() { focus.push(k); } };
  const key = (k, o = {}) => { let prevented = false; c.refKey({ key: 'Enter', preventDefault() { prevented = true; }, ...o }, 3, k); return prevented; };
  c.__els['#refCo-3'].value = 'Let tam';
  assert.equal(key(0), true);
  assert.deepEqual([focus, plain(c.__add)], [['refKod'], []], 'Enter v „Co“ → kód, nic se neuloží');
  key(1);
  assert.deepEqual([focus, plain(c.__add)], [['refKod', 'refNote'], []], 'prázdný kód → poznámka');
  key(2);
  assert.deepEqual(plain(c.__add), [3], 'v poznámce uložit');
  c.__els['#refKod-3'].value = 'K7QW2P';
  key(1); key(0);
  assert.deepEqual(plain(c.__add), [3, 3, 3], 's kódem Enter uloží z kteréhokoli pole');
  key(0, { isComposing: true }); key(0, { key: 'a' });
  assert.equal(c.__add.length, 3, 'psaní přes IME a jiné klávesy nic');
});

test('nowParts + nowCard: dnešní řádky z průvodce, zítřek, ubytování s navigací, posun času, rezervace a „Sbaleno“ před odjezdem', () => {
  const c = load({ clipboard: true });
  const t = saved(lisbon(), {
    days: { '2026-11-13': ['Belém', 'Fado v Alfamě'] }, genDays: { '2026-11-13': ['Belém'] },
    refs: [{ co: 'Let tam', kod: 'ABC123', pozn: 'Ryanair, 2 os.' }, { co: 'Hotel', kod: '4021.775.913' }, { co: '', kod: '' }],
  });
  const now = UTC('2026-11-13', '10:00'), x = c.tripNow([t], now), p = c.nowParts(x, now);
  assert.deepEqual(lines(p.rows.map((r) => r.slice(0, 3))), ['2026-11-13 📍 Belém · Jerónimos', '2026-11-13 📝 Fado v Alfamě']);
  assert.deepEqual(plain(p.next).slice(0, 3), ['2026-11-14', '📍', 'volný den']);
  assert.deepEqual(plain(p.hotel), { name: 'Hotel Lisboa Centro', q: 'Hotel Lisboa Centro, Lisabon, Portugalsko' });
  assert.deepEqual([p.place, p.verb, p.shift, p.clock, p.ahead, p.todo], ['Lisabon', 'odlet', -60, '10:00', null, null]);
  assert.deepEqual(plain(p.refs), [{ co: 'Let tam', kod: 'ABC123', pozn: 'Ryanair, 2 os.' }, { co: 'Hotel', kod: '4021.775.913', pozn: '' }]);
  const h = sp(c.nowCard(x, p));
  assert.ok(h.includes('📍 Dnes na cestě · den 2 z 6 · <b>Lisabon</b>'), h);
  assert.ok(h.includes('🕐 Místní čas <b data-nw="clock"></b> – o 1\u00a0h méně než v Praze'));
  assert.ok(h.includes('🏨 Hotel Lisboa Centro · <a href="https://www.google.com/maps/dir/?api=1&amp;destination=Hotel+Lisboa+Centro%2C+Lisabon%2C+Portugalsko&amp;travelmode=transit" target="_blank" rel="noopener">navigovat ↗</a>'));
  assert.match(h, /🗺️ trasa pěšky: <a href="https:\/\/www\.google\.com\/maps\/dir\/\?api=1&amp;origin=Hotel\+Lisboa\+Centro[^"]*travelmode=walking"[^>]*>Google Maps ↗<\/a> · <a href="https:\/\/mapy\.com\/fnc\/v1\/route\?[^"]*routeType=foot_fast/);
  assert.ok(h.includes('<li class="nw-next"><span class="nw-i">📍</span><span><span class="nw-d">zítra</span>volný den</span></li>'));
  assert.ok(h.includes('<code>ABC123</code><button type="button" class="nw-copy" data-copy="ABC123" aria-label="Zkopírovat kód ABC123">Kopírovat</button><span class="faint">Ryanair, 2 os.</span>'));
  assert.ok(h.includes('data-nw-plan="0">📋 Celý plán →'));
  assert.ok(!h.includes('nw-todo'), 'během cesty bez „Sbaleno“');
  // bez schránky jen kód (dá se označit), bez tlačítka
  assert.ok(!load().nowCard(x, p).includes('nw-copy'));

  // 2 dny před odletem: všechny řádky až do dne odletu, „Sbaleno“, posun času v cíli
  const b = c.tripNow([t], UTC('2026-11-10', '09:00')), pb = c.nowParts(b, UTC('2026-11-10', '09:00'));
  assert.deepEqual(plain(pb.rows.map((r) => r[0] + r[1])), ['2026-11-11📲', '2026-11-12🚪', '2026-11-12🚆', '2026-11-12🛫', '2026-11-12🚇', '2026-11-12🏨', '2026-11-12📍']);
  assert.deepEqual([plain(pb.todo), pb.hotel, pb.shift, pb.clock, pb.next], [{ zar: 1, bal: 1 }, null, -60, '09:00', null]);
  const hb = sp(c.nowCard(b, pb));
  assert.ok(hb.includes(`🧳 Za 2 dny odlet · <b>Lisabon</b> <span class="faint">${dayLbl('2026-11-12')}</span>`), hb);
  assert.ok(hb.includes('🕐 V cíli je o 1\u00a0h méně než v Praze'));
  // řádky po dnech: zítra online check-in, v den odletu cesta na letiště, let, hotel…
  assert.ok(hb.includes('<li class="nw-day">zítra</li><li><span class="nw-i">📲</span><span>Online check-in Ryanair PRG → LIS'), hb);
  assert.ok(hb.includes(`<li class="nw-day">${dayLbl('2026-11-12')}</li><li><span class="nw-i">🚪</span><span>Vyraž z domu nejpozději v 3:40`));
  assert.equal((hb.match(/class="nw-day"/g) || []).length, 2);
  assert.ok(hb.includes('🧾 Před cestou zbývá zařídit 1 a sbalit 1 · <button type="button" class="linkbtn" data-nw-plan="0">odškrtat v plánu →</button>'));
  // den odletu ráno: odpočet do odletu (do 24 h), „Sbaleno“ ještě ano; po odletu už ne
  const m = UTC('2026-11-12', '02:00'), pm = c.nowParts(c.tripNow([t], m), m);
  assert.deepEqual([pm.ahead.l.from, pm.ahead.l.to, pm.ahead.min, Boolean(pm.todo), pm.shift], ['PRG', 'LIS', 205, true, 0]);
  assert.ok(sp(c.nowCard(c.tripNow([t], m), pm)).includes('✈️ Odlet PRG → LIS <b data-nw="cd"></b>'));
  assert.equal(c.nowParts(c.tripNow([t], UTC('2026-11-12', '07:00')), UTC('2026-11-12', '07:00')).todo, null);
  assert.deepEqual(plain(vm.runInContext('[205, 45, 60].map(hmTxt)', c)), ['3\u00a0h 25\u00a0min', '45\u00a0min', '1\u00a0h']);
});

test('nowParts: trasa přes víc míst (místo a hotel toho dne), vlak místo letu, cesta jen z plánovače, poškozená cesta z průvodce', () => {
  const it = saved(italy()), at = (t, iso) => { const n = Date.parse(iso); return C.nowParts(C.tripNow([t], n), n); };
  const p13 = at(it, '2026-11-13T12:00:00Z');
  assert.equal(p13.place, 'Florencie', 'v den přejezdu se spí na dalším místě');
  assert.deepEqual(plain(p13.hotel), { name: 'U kamaráda', q: 'U kamaráda, Florencie, Itálie', car: true }, 's půjčeným autem (k navigaci i Waze)');
  assert.deepEqual(plain(p13.rows.map((r) => r[1])), ['🚗', '🏨']);
  assert.equal(p13.shift, 0, 'Itálie má stejný čas jako Praha');
  const p17 = at(it, '2026-11-17T12:00:00Z');
  assert.deepEqual([p17.place, p17.hotel, p17.rows.map((r) => r[1]).join('')], ['Řím', null, '📍📲'], 'Řím jen s odkazy na ubytování');
  assert.ok(sp(C.nowCard(C.tripNow([it], Date.parse('2026-11-14T12:00:00Z')), at(it, '2026-11-14T12:00:00Z'))).includes('<li class="faint"><span class="nw-i">🌤️</span><span>Dnes nic naplánovaného</span></li>'));
  // vlak tam i zpět: odjezd, ne odlet
  const v = saved(vienna()), pv = at(v, '2026-11-03T07:00:00Z');
  assert.deepEqual([pv.verb, pv.place], ['odjezd', 'Vídeň']);
  assert.ok(sp(C.nowCard(C.tripNow([v], Date.parse('2026-11-03T07:00:00Z')), pv)).includes('🧳 Zítra odjezd · <b>Vídeň</b>'));
  // jen z plánovače: řádky z t.legs / t.days, bez hotelu
  const po = at(plannerOnly(), '2026-11-13T12:00:00Z');
  assert.deepEqual([lines(po.rows), po.hotel, po.place], [['2026-11-13 📍 Belém · Pastéis de Belém'], null, 'Lisabon']);
  // poškozená cesta z průvodce: řádky aspoň z plánovače
  const bad = saved(lisbon(), { wizard: { flight: 'x' }, days: { '2026-11-13': ['Belém'] } });
  assert.deepEqual(lines(at(bad, '2026-11-13T12:00:00Z').rows), ['2026-11-13 📍 Belém']);
  // text z cizího vstupu escapovaný
  const x = plannerOnly({ dest: '<img src=x onerror=alert(1)>', refs: [{ co: '<b>', kod: '"><script>' }] }), n = UTC('2026-11-13', '12:00');
  const hx = C.nowCard(C.tripNow([x], n), C.nowParts(C.tripNow([x], n), n));
  assert.ok(!/<img|<script/.test(hx), hx);
  assert.ok(hx.includes('<b>&lt;img src=x onerror=alert(1)&gt;</b>') && hx.includes('<span>🔖 &lt;b&gt;</span><code>&quot;&gt;&lt;script&gt;</code>'), hx);
});

test('Na cestě s autem: Waze u přejezdu do dalšího místa (poloha místa) a u hotelu (hledání podle názvu)', () => {
  const CS = load();
  vm.runInContext(src('searchhelp.js'), CS, { filename: 'searchhelp.js' });
  const it = saved(italy()), n = Date.parse('2026-11-13T12:00:00Z'), x = CS.tripNow([it], n), h = CS.nowCard(x, CS.nowParts(x, n));
  const wz = [...h.matchAll(/href="(https:\/\/waze\.com\/[^"]+)"/g)].map((m) => new URL(m[1].replace(/&amp;/g, '&')));
  // nahoře u hotelu hledání podle názvu, v řádku přejezdu navigace na polohu místa
  assert.deepEqual(wz.map((u) => u.searchParams.get('q') || u.searchParams.get('ll')), ['U kamaráda, Florencie, Itálie', '43.7696,11.2558'], h);
  assert.equal(wz[1].searchParams.get('navigate'), 'yes');
  // bez auta (vlak do Vídně): žádný Waze
  const v = saved(vienna()), nv = Date.parse('2026-11-04T12:00:00Z'), xv = CS.tripNow([v], nv);
  assert.ok(!/waze\.com/.test(CS.nowCard(xv, CS.nowParts(xv, nv))));
});

test('tripNow + nowParts: spoj bez času – žádný vymyšlený odpočet ani poledne; „Sbaleno“ celý den odletu, v cíli až po půlnoci', () => {
  const t = plannerOnly();
  t.legs[0] = { ...t.legs[0], dep: null, arr: null }; // legBrief u letu bez času: zóny ano, časy ne
  assert.deepEqual(plain(C.tripLegs(t).map((x) => [x.l.from, x.at, x.sw])), [['PRG', null, UTC('2026-11-12', '23:00')], ['LIS', UTC('2026-11-17', '10:00'), UTC('2026-11-17', '13:35')]]);
  const at = (iso) => { const n = Date.parse(iso), x = C.tripNow([t], n), p = C.nowParts(x, n); return { x, p, h: sp(C.nowCard(x, p)) }; };
  const m = at('2026-11-12T07:00:00Z'); // 8:00 v Praze
  assert.deepEqual([m.x.tz, m.x.day, m.p.ahead, plain(m.p.todo), m.p.shift], ['Europe/Prague', 1, null, { zar: 1, bal: 1 }, 0]);
  assert.ok(!m.h.includes('data-nw="cd"') && m.h.includes('<span class="nw-i">🛫</span><span>PRG → LIS · Ryanair · FR 1234 · čas ověř'), m.h);
  const a = at('2026-11-12T12:30:00Z'); // 13:30 v Praze – let může být i večer
  assert.deepEqual([a.x.tz, a.x.today, a.p.shift, a.p.clock], ['Europe/Prague', '2026-11-12', 0, '']);
  assert.ok(a.h.includes('🧾 Před cestou zbývá zařídit 1 a sbalit 1') && !a.h.includes('Místní čas'), a.h);
  // po půlnoci pražského času v Lisabonu (tam je ještě 12. 11.), další den bez „Sbaleno“
  const n = at('2026-11-12T23:01:00Z');
  assert.deepEqual([n.x.tz, n.x.today, n.x.day], ['Europe/Lisbon', '2026-11-12', 1]);
  const d2 = at('2026-11-13T10:00:00Z');
  assert.deepEqual([d2.x.day, d2.p.todo, d2.p.shift], [2, null, -60]);
  // let zpět s časem: odpočet jen k němu
  const b = at('2026-11-16T12:00:00Z');
  assert.deepEqual([b.p.ahead.l.from, b.p.ahead.min], ['LIS', 22 * 60]);
  // vlak bez času: totéž (řazení podle dne jako v poledne, za ranním letem téhož dne)
  const g = plannerOnly({ legs: [plannerOnly().legs[0]], ground: [{ from: 'Lisabon', to: 'Porto', date: '2026-11-12', dep: null, arr: null, fromTz: 'Europe/Lisbon', toTz: 'Europe/Lisbon', kind: 'vlak' }] });
  assert.deepEqual(plain(C.tripLegs(g).map((x) => [x.l.from, x.at])), [['PRG', UTC('2026-11-12', '05:25')], ['Lisabon', null]]);
  // cesta z průvodce s letem bez času (cena z mezipaměti): ani v průběhu cesty (shrnutí i karta) vymyšlená „PRG 00:00“
  const w = lisbon();
  w.flight.out = { ...w.flight.out, hasTime: false, dep: '2026-11-12T00:00:00', arr: null, carrierName: 'TAP', flightNo: '' };
  w.flight.back = { ...w.flight.back, hasTime: false, dep: '2026-11-17T00:00:00', arr: null };
  assert.deepEqual(lines(C.Trip.timeline(w).filter((r) => /🛫|🛬/u.test(r[1]))), ['2026-11-12 🛫 PRG → LIS · TAP · čas ověř', '2026-11-17 🛬 LIS → PRG · Ryanair · FR 1235 · čas ověř']);
});

test('tripNow: dálkový let – v cíli až po přistání (po vzletu na západ ne zpátky „Zítra odlet“), návrat přes půlnoc až do dne příletu', () => {
  const L = (from, to, date, dep, arr, fromTz, toTz) => ({ from, to, date, dep, arr, fromTz, toTz, carrier: 'Lufthansa', flightNo: 'LH 1' });
  const la = { name: 'LA', dest: 'Los Angeles', start: '2026-11-12', end: '2026-11-20', days: {}, legs: [
    L('PRG', 'LAX', '2026-11-12', '2026-11-12T06:30', '2026-11-12T13:00', 'Europe/Prague', 'America/Los_Angeles'),
    L('LAX', 'PRG', '2026-11-20', '2026-11-20T16:00', '2026-11-21T14:00', 'America/Los_Angeles', 'Europe/Prague')] };
  const at = (iso, trips = [la]) => { const x = C.tripNow(trips, Date.parse(iso)); return x && `${x.today} ${x.tz} ${x.on ? `den ${x.day} z ${x.days}` : `za ${x.until}`}`; };
  assert.equal(at('2026-11-12T05:00:00Z'), '2026-11-12 Europe/Prague den 1 z 10');
  assert.equal(at('2026-11-12T05:31:00Z'), '2026-11-12 Europe/Prague den 1 z 10', 'minutu po vzletu – v letadle pořád pražský den');
  assert.equal(at('2026-11-12T20:59:00Z'), '2026-11-12 Europe/Prague den 1 z 10');
  assert.equal(at('2026-11-12T21:00:00Z'), '2026-11-12 America/Los_Angeles den 1 z 10', 'přistání 13:00 v LA');
  assert.equal(at('2026-11-12T23:30:00Z'), '2026-11-12 America/Los_Angeles den 1 z 10', '0:30 v Praze, v LA odpoledne');
  // zpět: odlet 16:00 v LA (1:00 v Praze 21. 11.), přistání 14:00 v Praze – karta do konce dne příletu
  assert.equal(at('2026-11-21T00:01:00Z'), '2026-11-20 America/Los_Angeles den 9 z 10');
  assert.equal(at('2026-11-21T09:00:00Z'), '2026-11-21 America/Los_Angeles den 10 z 10', 'v letadle po půlnoci v LA');
  assert.equal(at('2026-11-21T13:00:00Z'), '2026-11-21 Europe/Prague den 10 z 10');
  assert.equal(at('2026-11-21T22:59:00Z'), '2026-11-21 Europe/Prague den 10 z 10');
  assert.equal(at('2026-11-21T23:00:00Z'), null);
  assert.equal(C.tripNow([la], UTC('2026-11-21', '13:00')).end, '2026-11-21');
  // cesta z průvodce, let zpět přistane po půlnoci: v den příletu řádek „z letiště domů“
  const w = lisbon();
  w.flight.back = { ...w.flight.back, dep: '2026-11-17T21:30:00', arr: '2026-11-18T01:55:00' };
  w.plan.span.departureTime = '21:30';
  const late = saved(w), n = UTC('2026-11-18', '08:00'), x = C.tripNow([late], n);
  assert.deepEqual([late.end, x.today, x.day, x.days], ['2026-11-17', '2026-11-18', 7, 7]);
  assert.deepEqual(lines(C.nowParts(x, n).rows), ['2026-11-18 🚆 Cesta z letiště PRG domů (~45\u00a0min)']);
  // přes datovou hranici (Tokio → Honolulu přistane „včera“): po odletu už ne „Zítra odlet“
  const hnl = { name: 'Havaj', start: '2026-11-12', end: '2026-11-15', legs: [L('HND', 'HNL', '2026-11-12', '2026-11-12T00:30', '2026-11-11T12:00', 'Asia/Tokyo', 'Pacific/Honolulu')] };
  assert.equal(at('2026-11-11T23:00:00Z', [hnl]), '2026-11-12 Pacific/Honolulu den 1 z 4');
  // poškozená data: spoj z ledna cestu v listopadu nezačne, přílet za 3 měsíce ji neprodlouží
  const odd = { ...la, legs: [{ ...la.legs[0], date: '2026-01-05', dep: '2026-01-05T06:30', arr: '2026-01-05T13:00' }, { ...la.legs[1], arr: '2027-03-01T14:00' }] };
  assert.equal(at('2026-11-01T12:00:00Z', [odd]), null);
  assert.equal(at('2026-11-21T13:00:00Z', [odd]), null);
});

test('nowParts: aktivita od průvodce smazaná či přejmenovaná v plánovači (Itinerář) na kartě není – ani v trase pěšky', () => {
  // skutečné „💾 Uložit do plánovače“: days = genDays = program průvodce
  const real = (w) => { const c = load(); c.S.trip = w; c.S.trip.step = 'summary'; c.Trip.render(); c.__els['#sumSave'].onclick(); return c.S.trips[0]; };
  const at = (t, iso) => { const n = Date.parse(iso), x = C.tripNow([t], n); return { x, p: C.nowParts(x, n) }; };
  const day = (t, d) => { const { p } = at(t, `${d}T10:00:00Z`); return plain(p.rows.map((r) => `${r[1]} ${r[2]}${r[3] ? ` [${r[3].day.items.map((i) => i.name).join(', ')}]` : ''}`)); };
  const t = real(lisbon());
  assert.deepEqual(plain(t.genDays['2026-11-13']), ['Belém', 'Jerónimos']);
  assert.deepEqual(day(t, '2026-11-13'), ['📍 Belém · Jerónimos [Belém, Jerónimos]'], 'beze změny program průvodce');
  // smazané Belém: jen Jerónimos, trasa pěšky jen k němu
  t.days['2026-11-13'] = ['Jerónimos'];
  assert.deepEqual(day(t, '2026-11-13'), ['📍 Jerónimos [Jerónimos]']);
  const { x, p } = at(t, '2026-11-13T10:00:00Z'), walk = C.nowCard(x, p).match(/<span class="nw-walk">.*?<\/span>/)[0];
  assert.ok(walk.includes('destination=Jer%C3%B3nimos') && !/Bel%C3%A9m/.test(walk), walk);
  // přejmenované: z programu pryč, nový text jako vlastní aktivita
  t.days['2026-11-13'] = ['Jerónimos', 'Belém – věž až odpoledne'];
  assert.deepEqual(day(t, '2026-11-13'), ['📍 Jerónimos [Jerónimos]', '📝 Belém – věž až odpoledne']);
  // všechno smazané (i bez dne v plánu): volný den bez trasy
  for (const v of [[], undefined]) {
    t.days['2026-11-13'] = v;
    const r = at(t, '2026-11-13T10:00:00Z');
    assert.deepEqual(day(t, '2026-11-13'), ['📍 volný den []']);
    assert.ok(!C.nowCard(r.x, r.p).includes('nw-walk'));
  }
  assert.deepEqual(day(t, '2026-11-15'), ['📍 Sintra [Sintra]'], 'ostatní dny dál z průvodce');
  // trasa přes víc míst: „Místo: aktivita“
  const it = real(italy());
  it.days['2026-11-11'] = [];
  it.days['2026-11-10'] = ['Milán: Galerie'];
  assert.deepEqual(day(it, '2026-11-11'), ['📍 Milán: volno []']);
  assert.deepEqual(day(it, '2026-11-10').at(-1), '📍 Milán: Galerie [Galerie]');
  // uvozovky a apostrofy: na kartě jako v Itineráři (escapované), smazání se pozná i tak
  const wq = lisbon();
  wq.plan.days[1].items[0].name = "Belém ('Torre')";
  const q = real(wq);
  assert.deepEqual(plain(q.genDays['2026-11-13']), ["Belém ('Torre')", 'Jerónimos']);
  q.days['2026-11-13'] = ["Belém ('Torre')"];
  assert.deepEqual(day(q, '2026-11-13'), ["📍 Belém (&#39;Torre&#39;) [Belém ('Torre')]"]);
  q.days['2026-11-13'] = ['Jerónimos'];
  assert.deepEqual(day(q, '2026-11-13'), ['📍 Jerónimos [Jerónimos]']);
  // cesta ze zálohy: průvodce bez apostrofů (sanitizeTrip), Itinerář s typografickým (PlanShare.txt) – smazání se pozná
  const bk = { ...q, wizard: C.Trip.sanitizeTrip(plain(q.wizard)), genDays: { ...q.genDays, '2026-11-13': ['Belém (’Torre’)', 'Jerónimos'] }, days: { ...q.days, '2026-11-13': ['Jerónimos'] } };
  assert.equal(bk.wizard.plan.days[1].items[0].name, 'Belém (Torre)');
  assert.deepEqual(day(bk, '2026-11-13'), ['📍 Jerónimos [Jerónimos]']);
});

test('nowParts + nowCard: „odlet“ jen u cesty s letem – výlet autem či z Objevuj „odjezd“, bez rady o časech spojů', () => {
  const card = (t, d = '2026-11-13') => { const n = noon(d), x = C.tripNow([t], n), p = C.nowParts(x, n); return [p.verb, sp(C.nowCard(x, p)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()]; };
  const hory = { name: 'Víkend v Krkonoších', dest: 'Krkonoše', iso: 'CZ', start: '2026-11-14', end: '2026-11-15', flight: null, days: {}, checklist: [{ t: 'Boty', done: false }] };
  const [v, h] = card(hory);
  assert.equal(v, 'odjezd');
  assert.ok(h.startsWith('🧳 Zítra odjezd · Krkonoše') && h.includes('🌤️ Do odjezdu nic naplánovaného') && !h.includes('Časy spojů'), h);
  assert.equal(card({ ...hory, flight: '  ' })[0], 'odjezd');
  // let jen jako text (z hledání letů): odlet a rada ověřit časy; vlak textem odjezd, rada taky
  const [fv, fh] = card({ ...hory, flight: 'PRG→LIS 14.11. 06:25 (Ryanair)' });
  assert.ok(fv === 'odlet' && fh.startsWith('🧳 Zítra odlet') && fh.includes('Časy spojů v plánu nemáš'), fh);
  const [tv, th] = card({ ...hory, flight: '🚆 Praha→Vídeň 14.11. 06:01 (RegioJet, vlak)' });
  assert.ok(tv === 'odjezd' && th.includes('Časy spojů v plánu nemáš'), th);
  // spoje v plánu: let = odlet, jen vlak = odjezd
  assert.equal(card(plannerOnly(), '2026-11-11')[0], 'odlet');
  assert.equal(card({ ...hory, ground: [{ from: 'Praha', to: 'Vídeň', date: '2026-11-14', dep: null, arr: null, kind: 'vlak' }] })[0], 'odjezd');
});

test('🔖 rezervace: pročištění – texty oříznuté a zkrácené, jeden řádek, bez řídicích znaků, nejvýš 6 řádků s kódem nebo názvem', () => {
  const B = C.Backup;
  assert.deepEqual([B.REFS_MAX, plain(B.REF_LEN)], [6, { co: 40, kod: 40, pozn: 120 }]);
  const r = plain(B.cleanRefs([
    { co: '  Let tam  ', kod: ' ABC123 ', pozn: 'řádek 1\nřádek 2' },
    { co: 'x'.repeat(80), kod: 'K'.repeat(80), pozn: 'p'.repeat(300) },
    { co: '', kod: '', pozn: 'jen poznámka' }, null, 'text', ['pole'],
    { co: 'Hotel "U Lva" <b>', kod: 'H‮1\u0000', extra: 'pryč', __proto__: { kod: 'zděděný' } },
    { kod: 42 }, { co: 'a' }, { co: 'b' }, { co: 'c' }, { co: 'd' },
  ]));
  assert.equal(r.length, 6);
  assert.deepEqual(r[0], { co: 'Let tam', kod: 'ABC123', pozn: 'řádek 1 řádek 2' });
  assert.deepEqual([r[1].co.length, r[1].kod.length, r[1].pozn.length], [40, 40, 120]);
  assert.deepEqual(r[2], { co: 'Hotel "U Lva" <b>', kod: 'H1', pozn: '' }, 'vlastní data: uvozovky a < > zůstanou (vypisuje se přes esc), řídicí znaky ne');
  assert.deepEqual(r.slice(3).map((x) => x.kod || x.co), ['42', 'a', 'b']);
  assert.deepEqual(plain(B.cleanRefs('ABC')), []);
  assert.deepEqual(plain(B.cleanRefs(undefined)), []);
});

test('🔖 rezervace nikdy v odkazech: #plan= (PlanShare), kalendář .ics, cesta z průvodce (#trip=) – a opětovné uložení z průvodce je nesmaže', async () => {
  const c = load();
  const refs = [{ co: 'Let tam', kod: 'PNR7Q2', pozn: 'tajné-heslo-123' }];
  const t = saved(lisbon(), { refs });
  const json = c.PlanShare.json(t);
  assert.ok(!/PNR7Q2|tajné|refs/.test(json), json);
  assert.ok(!/PNR7Q2|refs/.test(JSON.stringify(c.PlanShare.decode(c.PlanShare.encode(t)))));
  const ics = c.Ics.build(c.planEvents(t), { name: t.name, now: 0 });
  assert.ok(ics.includes('BEGIN:VEVENT') && !/PNR7Q2|tajné/.test(ics));
  // „Otevřít v průvodci“ – cesta v průvodci (a tedy odkaz #trip=) kódy nemá
  c.S.trips = [t];
  assert.equal(c.Trip.openSaved(t.wizard, t.tripId), true);
  assert.ok(!/PNR7Q2|refs/.test(JSON.stringify(c.S.trip)));
  // znovu „💾 Uložit do plánovače“: tatáž cesta (tripId) se aktualizuje, kódy u ní zůstanou
  c.S.trip.step = 'summary';
  c.Trip.render();
  c.__els['#sumSave'].onclick();
  assert.equal(c.S.trips.length, 1);
  assert.deepEqual(plain(c.S.trips[0].refs), refs);
  assert.ok(!/PNR7Q2/.test(JSON.stringify(c.S.trips[0].wizard)));
});

test('🔖 rezervace v 💾 záloze: zabalí se, pročistí, k cestě v zařízení přibudou chybějící (nic se nesmaže), náhled to řekne', () => {
  const B = C.Backup, d = { sanitizePlan: C.PlanShare.sanitize, sanitizeWizard: C.Trip.sanitizeTrip, txt: C.PlanShare.txt };
  const pc = saved(lisbon(), { pid: 'abc123def', refs: [{ co: 'Let tam', kod: 'ABC123', pozn: '' }, { co: 'Hotel', kod: 'H-77', pozn: 'platba na místě' }] });
  const inc = B.parse(B.pack({ trips: [pc, { name: 'Bez kódů', start: '2026-12-01', refs: 'x' }] }, {}, 0), d);
  assert.deepEqual(plain(inc.trips[0].refs), plain(pc.refs));
  assert.equal(inc.trips[1].refs, undefined);
  // cizí soubor: pročištění jako v okně cesty
  const evil = B.parse(JSON.stringify({ app: 'atlas', v: 1, data: { trips: [{ name: 'X', start: '2026-12-01', refs: [{ co: 'a\u0007b', kod: 'K'.repeat(99) }, ...Array(10).fill({ co: 'z' })] }] } }), d);
  assert.deepEqual([evil.trips[0].refs.length, evil.trips[0].refs[0].co, evil.trips[0].refs[0].kod.length], [6, 'a b', 40]);
  // telefon: stejná cesta bez kódů (a s jedním vlastním) → přibudou ze zálohy, vlastní zůstane
  const phone = { ...saved(lisbon(), { pid: 'abc123def' }), refs: [{ co: 'Hotel', kod: 'H-77', pozn: '' }, { co: 'Vlak do Sintry', kod: 'CP-1', pozn: '' }] };
  const cur = { trips: [phone], watch: [], home: null, visited: [], pretrip: {} };
  const df = B.diff(cur, inc, { deps: d });
  assert.deepEqual([df.trips.same + df.trips.changed, df.refs], [1, 1]);
  const m = B.merge(cur, inc, { deps: d });
  assert.deepEqual(plain(m.trips[0].refs).map((r) => r.kod), ['H-77', 'CP-1', 'ABC123'], 'stejné co + kód = tatáž rezervace');
  assert.equal(m.trips.length, 2);
  // už je všechno: nic nového
  const again = { ...cur, trips: m.trips };
  assert.equal(B.diff(again, inc, { deps: d }).refs, 0);
  assert.equal(B.merge(again, inc, { deps: d }).trips[0], m.trips[0], 'beze změny tentýž objekt');
  // přepsání změněné cesty verzí ze zálohy: kódy z obou stran, nejvýš 6
  const changed = { ...phone, name: 'Lisabon (upraveno)', refs: Array.from({ length: 5 }, (_, i) => ({ co: `Můj ${i}`, kod: `M${i}`, pozn: '' })) };
  const cur2 = { ...cur, trips: [changed] };
  assert.equal(B.diff(cur2, inc, { deps: d }).trips.changed, 1);
  const o = B.merge(cur2, inc, { overwrite: true, deps: d });
  assert.equal(o.trips[0].name, pc.name);
  assert.deepEqual(plain(o.trips[0].refs).map((r) => r.kod), ['ABC123', 'H-77', 'M0', 'M1', 'M2', 'M3']);
  const keep = B.merge(cur2, inc, { deps: d });
  assert.equal(keep.trips[0].name, 'Lisabon (upraveno)', 'bez přepsání plán zůstane…');
  assert.deepEqual(plain(keep.trips[0].refs).map((r) => r.kod), ['M0', 'M1', 'M2', 'M3', 'M4', 'ABC123'], '…a kódy se doplní');
});

test('Lisabon → Porto (2 dosp. + dítě, auto 2.–3. den, do Porta vlakem): co je na řadě teď – od 3 dnů před odletem po den po návratu', () => {
  // pevné hodiny (UTC); 25. 10. v 1:00 UTC změna času v Praze (CEST → CET) i v Lisabonu (WEST → WET)
  const t = saved(lisbonPorto(), { refs: [{ co: 'Ryanair', kod: 'K7XQ2M', pozn: '' }] });
  const at = (iso) => { const n = Date.parse(iso), x = C.tripNow([t], n), p = x && C.nowParts(x, n); return { x, p, h: p ? sp(C.nowCard(x, p)) : '' }; };
  const ic = (p) => plain(p.rows).map((r) => r[1]).join('');
  // 3 dny před odletem: karta ještě ne
  assert.equal(at('2026-10-21T17:00:00Z').x, null);
  // večer před odletem (18:00 v Praze): online check-in je otevřený – do kdy (zítra 4:25 = 2 h před odletem 6:25)
  const eve = at('2026-10-23T16:00:00Z');
  assert.deepEqual([eve.x.on, eve.x.until, eve.p.ahead.min, eve.p.ahead.ck], [false, 1, 12 * 60 + 25, '2026-10-24T04:25']);
  assert.ok(eve.h.includes('✈️ Odlet PRG → LIS <b data-nw="cd"></b> · online check-in do\u00a0zítra\u00a0<b>4:25</b>'), eve.h);
  // ráno odletu doma (3:30): den 1, odpočet, check-in do 4:25, „Sbaleno“, ještě bez hotelu a posunu času
  const dawn = at('2026-10-24T01:30:00Z');
  assert.deepEqual([dawn.x.day, dawn.x.days, dawn.x.tz, dawn.p.ahead.min, dawn.p.ahead.ck, dawn.p.hotel, Boolean(dawn.p.todo), dawn.p.from], [1, 5, 'Europe/Prague', 175, '2026-10-24T04:25', null, true, '']);
  assert.ok(dawn.h.includes('· online check-in do\u00a0<b>4:25</b>'), dawn.h);
  // po zavření check-inu už ne (na letišti se platí)
  assert.equal(at('2026-10-24T02:30:00Z').p.ahead.ck, undefined);
  // večer po příletu (20:30 v Lisabonu, telefon v kterékoli zóně): hotel s navigací, ale bez Waze – auto až zítra ráno
  const arr = at('2026-10-24T19:30:00Z');
  assert.deepEqual([arr.x.tz, arr.x.today, arr.p.clock, arr.p.shift, arr.p.place], ['Europe/Lisbon', '2026-10-24', '20:30', -60, 'Lisabon']);
  assert.deepEqual(plain(arr.p.hotel), { name: 'Hotel Lisboa Centro', q: 'Hotel Lisboa Centro, Lisabon, Portugalsko' });
  assert.deepEqual(plain(arr.p.next).slice(0, 3), ['2026-10-25', '🚗', 'Vyzvednutí auta Lisabon (město) 09:00']);
  assert.equal(arr.p.past[plain(arr.p.rows).findIndex((r) => r[1] === '🛫')], true, 'let už proběhl (ztlumený)');
  // den 2 po změně času (7:30 WET = 7:30 UTC): vyzvednutí auta, program, Waze k hotelu; zítra nejdřív vrácení auta
  const d2 = at('2026-10-25T07:30:00Z');
  assert.deepEqual([d2.x.day, d2.p.clock, d2.p.shift, ic(d2.p), d2.p.hotel.car], [2, '07:30', -60, '🚗📍', true]);
  assert.equal(d2.p.rows[0][2], 'Vyzvednutí auta Lisabon (město) 09:00');
  assert.deepEqual(plain(d2.p.next).slice(0, 3), ['2026-10-26', '🚗', 'Vrácení auta Lisabon (město) 10:00']);
  // den vlaku: Lisabon → Porto; auto se vrací v Lisabonu dopoledne – před přejezdem, ne až po příjezdu do Porta
  const d3 = at('2026-10-26T08:00:00Z');
  assert.deepEqual([d3.x.day, d3.p.from, d3.p.place, ic(d3.p)], [3, 'Lisabon', 'Porto', '🚗📍🚆🏨📍']);
  assert.match(d3.p.rows[2][2], /^Přejezd Lisabon → Porto · ~2\sh 50\smin vlakem/);
  assert.deepEqual(plain(d3.p.hotel), { name: 'Porto Ribeira Guesthouse', q: 'Porto Ribeira Guesthouse, Porto, Portugalsko' }, 'do Porta vlakem – bez Waze');
  assert.ok(d3.h.includes('📍 Dnes na cestě · den 3 z 5 · Lisabon → <b>Porto</b>'), d3.h);
  assert.deepEqual(plain(at('2026-10-26T11:00:00Z').p.past), [true, false, false, false, false], 'po vrácení auta (11:00)');
  // poslední den ráno (6:30 v Portu): odlet za 4 h, check-in do 8:30, hotel ještě ano, bez auta
  const d5 = at('2026-10-28T06:30:00Z');
  assert.deepEqual([d5.x.day, d5.x.home, d5.p.place, d5.p.from, d5.p.ahead.l.from, d5.p.ahead.min, d5.p.ahead.ck, d5.p.hotel.car], [5, false, 'Porto', '', 'OPO', 240, '2026-10-28T08:30', undefined]);
  assert.deepEqual(ic(d5.p), '🚪🚆🛬🚆');
  // po přistání doma: karta do půlnoci kvůli kódům, vše proběhlé; další den nic
  const home = at('2026-10-28T15:30:00Z');
  assert.deepEqual([home.x.home, home.p.ahead, home.p.hotel, plain(home.p.past).every(Boolean)], [true, null, null, true]);
  assert.ok(home.h.includes('🏠 Zpátky doma') && home.h.includes('K7XQ2M'));
  assert.equal(at('2026-10-29T09:00:00Z').x, null);
  // auto přes den přejezdu (dny auta 2.–3. → Lisabon → Porto autem, vrácení večer v Portu): vrácení až po příjezdu, Waze i v Portu
  const w2 = lisbonPorto({ car: { ...lisbonPorto().car, dropoff: 'OPO', to: '2026-10-26T18:00', doCity: { name: 'Porto', lat: 41.1579, lon: -8.6291, cc: 'PT' } } });
  w2.route.legModes = [{ a: '', b: 'city:LIS', m: 'transit' }, { a: 'city:LIS', b: 'city:OPO', m: 'car' }, { a: 'city:OPO', b: '', m: 'transit' }];
  const t2 = saved(w2), n2 = Date.parse('2026-10-26T08:00:00Z'), p2 = C.nowParts(C.tripNow([t2], n2), n2);
  assert.deepEqual([ic(p2), p2.rows.at(-1)[2], p2.hotel.car], ['📍🚗🏨📍🚗', 'Vrácení auta Porto (město) 18:00', true]);
});

test('kalendář z plánovače (.ics): připomínka online check-inu u letů, dny trasy přes víc míst pod místem toho dne', () => {
  const t = saved(lisbonPorto(), {
    days: { '2026-10-24': ['Lisabon: Alfama'], '2026-10-26': ['Lisabon: Belém', 'Porto: Ribeira'], '2026-10-27': ['Porto: Livraria Lello'], '2026-10-28': ['Snídaně na Ribeiře'] },
  });
  const ev = plain(C.planEvents(t));
  assert.deepEqual(ev.filter((e) => /^📲/u.test(e.title)).map((e) => [e.title, e.start, e.tz]), [
    ['📲 Online check-in Ryanair · PRG → LIS', '2026-10-23T06:25', 'Europe/Prague'], ['📲 Online check-in Ryanair · OPO → PRG', '2026-10-27T10:30', 'Europe/Lisbon'],
  ]);
  assert.deepEqual(ev.filter((e) => /^Den /.test(e.title)).map((e) => [e.title, e.location]), [
    ['Den 1 – Lisabon', 'Lisabon'], ['Den 3 – Lisabon → Porto', 'Porto'], ['Den 4 – Porto', 'Porto'], ['Den 5 – Porto', 'Porto'],
  ]);
  // v .ics v UTC: check-in tam 4:25 UTC (letní čas), zpět 10:30 UTC (po změně času)
  const ics = C.Ics.build(C.planEvents(t), { name: t.name, now: 0 });
  assert.ok(ics.includes('DTSTART:20261023T042500Z') && ics.includes('DTSTART:20261027T103000Z'), ics);
  // cesta s jedním místem beze změny: dny pod cílem
  const one = plain(C.planEvents(saved(lisbon(), { days: { '2026-11-13': ['Belém'] } }))).filter((e) => /^Den /.test(e.title));
  assert.deepEqual(one.map((e) => [e.title, e.location]), [['Den 2 – Lisabon', 'Lisabon']]);
});

test('zkratka aplikace „Na cestě“ (/#now) vedle Letů a Mých cest', () => {
  const m = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
  assert.deepEqual(m.shortcuts.map((s) => [s.short_name, s.url]), [['Lety', '/#flights'], ['Moje cesty', '/#planner'], ['Na cestě', '/#now']]);
  const s = m.shortcuts[2];
  assert.equal(s.name, 'Na cestě');
  assert.deepEqual(plain(s.icons), plain(m.shortcuts[0].icons));
  // #now otevře Přehled s kartou (start i změna adresy v otevřené aplikaci)
  assert.equal((APP.match(/if \(v === 'now'\) return showNow\(\);/g) || []).length, 2);
  // pod ní jen krátká karta 🕘 Od minula (po návratu jiný den) a karta 📉 Zlevnilo (hlídaná cena), pak úvod s hledáním
  assert.match(src('../index.html'), /<div class="now-trip" id="nowTrip" hidden><\/div>\s*(?:<!--[^>]*-->\s*)?<div class="since-wrap" id="sinceCard" hidden><\/div>\s*(?:<!--[^>]*-->\s*)?<div class="drop-wrap" id="dropCard" hidden><\/div>\s*<div class="hero"[^>]*>/);
});

test('Přehled – karta Nejbližší cesta: „zbývá zařídit“ jen před cestou, ne během ní (pojištění na cestě nikdo nezařizuje)', () => {
  const c = load();
  vm.runInContext(`var nowIdx = -1;\n${pick('nextTripStat')}`, c, { filename: 'app-stat.js' });
  const today = vm.runInContext('todayLocal()', c), plus = (n) => vm.runInContext(`ymdPlus(${JSON.stringify(today)}, ${n})`, c);
  const stat = () => vm.runInContext('nextTripStat()[2]', c);
  const ck = [{ t: 'Zařídit: cestovní pojištění', done: false }, { t: 'Pas', done: false }];
  c.S.trips = [{ name: 'Lisabon', dest: 'Lisabon', iso: 'PT', start: plus(2), end: plus(6), checklist: ck }];
  assert.equal(stat(), 'za 2 dny · zbývá zařídit 1');
  c.S.trips[0].start = plus(-1);
  assert.equal(stat(), 'právě probíhá');
  c.S.trips[0].start = today;
  assert.equal(stat(), 'právě probíhá', 'den odletu');
});

test('Přehled – rozpracovaná cesta z průvodce jen jednou: nahoře ↩ Pokračuj s odpočtem, dlaždice ukáže další cestu', () => {
  const c = load();
  vm.runInContext(`var nowIdx = -1;\n${pick('nextTripStat')}`, c, { filename: 'app-stat.js' });
  const today = vm.runInContext('todayLocal()', c), plus = (n) => vm.runInContext(`ymdPlus(${JSON.stringify(today)}, ${n})`, c);
  const stat = () => plain(vm.runInContext('nextTripStat()', c));
  const rim = { name: 'Řím', dest: 'Řím', iso: 'IT', start: plus(33), end: plus(41), tripId: 7 };
  const lis = { name: 'Lisabon', dest: 'Lisabon', iso: 'PT', start: plus(78), end: plus(82), tripId: 9 };
  const vid = { name: 'Vídeň', dest: 'Vídeň', iso: 'AT', start: plus(-40), end: plus(-38) };
  c.S.trips = [lis, rim, null, vid];
  assert.equal(stat()[0], 'Nejbližší cesta', 'bez rozpracované v průvodci beze změny (prázdné místo v seznamu nevadí)');
  assert.match(stat()[1], /Řím/);
  c.Flights = { resumeTrip: () => ({ t: { created: 7 } }) };
  assert.equal(stat()[0], 'Další cesta', 'Řím je nahoře v ↩ Pokračuj');
  assert.match(stat()[1], /Lisabon/);
  assert.match(stat()[3], /data-nt="0"/, 'Otevřít plán otevře Lisabon');
  c.Flights = { resumeTrip: () => ({ t: { created: 9 } }) };
  assert.deepEqual([stat()[0], /Řím/.test(stat()[1])], ['Nejbližší cesta', true], 'rozpracovaná je až pozdější cesta');
  c.Flights = { resumeTrip: () => ({ t: { created: 7 } }) };
  c.S.trips = [rim, vid];
  assert.equal(stat(), null, 'jediná nadcházející je nahoře – dlaždice by byla jen druhá karta téže cesty');
  c.Flights = { resumeTrip: () => null };
  c.S.trips = [vid];
  assert.equal(stat()[0], 'Naplánované cesty', 'jen proběhlé: odkaz na Moje cesty zůstává');
  assert.match(APP, /S\.trips\.length \? nextTripStat\(\) : null,\s*\]\.filter\(Boolean\);/, 'null = bez dlaždice');
  // karta ↩ Pokračuj: stejná podmínka jako dlaždice (Flights.resumeTrip) a odpočet do odletu místo dlaždice
  const fl = src('flights.js');
  assert.match(fl, /function renderResume\(\) \{\s*const host = \$\('#resumeRow'\); if \(!host\) return;\s*const rs = resumeTrip\(\), trip = rs && rs\.t, d = rs && rs\.d;/);
  assert.match(fl, /return d && t\.flight\.out\.date >= today\(\) && !saved \? \{ t, d \} : null;/);
  assert.match(fl, /soon = dd == null \|\| shared \? '' : dd <= 0 \? 'dnes' : inDays\(dd\);/);
  assert.match(fl, /\$\{fmtDate\(d\.checkin\)\}–\$\{fmtDate\(d\.checkout\)\}\$\{soon \? ` · \$\{soon\}` : ''\} · /);
  assert.match(fl, /renderResume, resumeTrip, /);
});

test('Přehled – cesta v kartě 📍 Dnes na cestě (probíhá nebo do 2 dnů) se v dlaždici neopakuje: ukáže další cestu', () => {
  const c = load();
  vm.runInContext(`var nowIdx = -1;\n${pick('nextTripStat')}`, c, { filename: 'app-stat.js' });
  const today = vm.runInContext('todayLocal()', c), plus = (n) => vm.runInContext(`ymdPlus(${JSON.stringify(today)}, ${n})`, c);
  const stat = () => plain(vm.runInContext('nextTripStat()', c));
  c.S.trips = [{ name: 'Řím', dest: 'Řím', iso: 'IT', start: plus(-1), end: plus(6) }, { name: 'Krkonoše', dest: 'Krkonoše', iso: 'CZ', start: plus(44), end: plus(45) }];
  assert.deepEqual([stat()[0], /Řím/.test(stat()[1]), stat()[2]], ['Nejbližší cesta', true, 'právě probíhá'], 'bez karty Dnes na cestě beze změny');
  vm.runInContext('nowIdx = 0', c);
  assert.deepEqual([stat()[0], /Krkonoše/.test(stat()[1]), stat()[3].includes('data-nt="1"')], ['Další cesta', true, true]);
  c.S.trips = [c.S.trips[0]];
  assert.equal(stat(), null, 'jediná nadcházející je v kartě nahoře');
  // renderNow (na začátku renderDashStats) si cestu karty zapamatuje – jen když se karta opravdu ukáže
  assert.match(APP, /\} catch \(e\) \{ p = null; h = ''; \}\n  nowIdx = p && x \? x\.i : -1;/);
  assert.match(APP, /function renderDashStats\(\) \{\n  renderNow\(\);/);
});
