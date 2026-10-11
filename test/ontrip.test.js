// 📍 Dnes na cestě (app.js tripNow / nowParts / nowCard nad Trip.timeline z trip.js) a 🔖 rezervace u cesty (t.refs:
// pročištění a sloučení v backup.js, nikdy v odkazech). Klasické skripty prohlížeče přes node:vm; funkce z app.js jsou
// skutečné řádky vybrané podle jména (celý app.js potřebuje DOM). „Teď“ se předává – testy nezávisí na dnešním datu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { lisbon, lisbonOneWay, italy, vienna, plannerOnly, saved } from './fixtures/trips-now.js';

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
  for (const f of ['ics.js', 'planshare.js', 'backup.js', 'trip.js', 'places.js']) vm.runInContext(src(f), ctx, { filename: f });
  vm.runInContext(pick('todayLocal', 'daysTo', 'inDays', 'okYmd', 'ymdPlus', 'wallAt', 'tripLegs', 'tripZone', 'tripNow', 'nowParts', 'hmTxt', 'dowLbl', 'canCopy', 'nowCard',
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
  // u letu tam / zpět i číslo letu (karta „Dnes na cestě“ ho chce, tabule na letišti ho ukazují).
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
  assert.deepEqual(plain(rows.filter((r) => r[0] === '2026-11-17').map((r) => r[1])), ['📝', '🚪', '🚇', '🛬', '🚌'], 'aktivita dne odletu před cestou na letiště');
  // trasa přes víc míst: program místa i vlastní aktivity
  const it = C.Trip.timeline(italy(), { own: { '2026-11-14': ['Uffizi – rezervace 10:15'] } });
  assert.deepEqual(lines(it.filter((r) => r[0] === '2026-11-14')), ['2026-11-14 📝 Uffizi – rezervace 10:15']);
  assert.equal(it.find((r) => r[2] === 'Milán: Brera')[3].plan.center.city, 'Milán');
});

test('Trip.timeline: cesta jen z plánovače – lety s časem, dopravcem a číslem, online check-in, vlak, aktivity dnů; zpět až po aktivitách', () => {
  const t = plannerOnly({ days: { '2026-11-13': ['Belém', 'Pastéis <de> Belém'], '2026-11-17': ['Time Out Market'] } });
  assert.deepEqual(lines(C.Trip.timeline(t)), [
    '2026-11-11 📲 Online check-in Ryanair PRG → LIS: otevře se 11.11. v 06:25 (24 h před odletem), zavře 2 h před odletem · na letišti se platí ~55 €/os.',
    '2026-11-12 🛫 PRG 06:25 → LIS 09:05 · Ryanair · FR 1234',
    '2026-11-13 📍 Belém · Pastéis &lt;de&gt; Belém',
    '2026-11-16 📲 Online check-in Ryanair LIS → PRG: otevře se 16.11. v 10:00 (24 h před odletem), zavře 2 h před odletem · na letišti se platí ~55 €/os.',
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
    '2026-11-17 🚌 Vídeň → Praha · bus · ~4 h 30 min, čas ověř',
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
  assert.ok(h.includes('🕐 Místní čas <b data-nw="clock"></b> – o 1 h méně než v Praze'));
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
  assert.deepEqual(plain(pb.rows.map((r) => r[0] + r[1])), ['2026-11-11📲', '2026-11-12🚪', '2026-11-12🚌', '2026-11-12🛫', '2026-11-12🚇', '2026-11-12🏨', '2026-11-12📍']);
  assert.deepEqual([plain(pb.todo), pb.hotel, pb.shift, pb.clock, pb.next], [{ zar: 1, bal: 1 }, null, -60, '09:00', null]);
  const hb = sp(c.nowCard(b, pb));
  assert.ok(hb.includes(`🧳 Za 2 dny odlet · <b>Lisabon</b> <span class="faint">${dayLbl('2026-11-12')}</span>`), hb);
  assert.ok(hb.includes('🕐 V cíli je o 1 h méně než v Praze'));
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
  assert.deepEqual(plain(vm.runInContext('[205, 45, 60].map(hmTxt)', c)), ['3 h 25 min', '45 min', '1 h']);
});

test('nowParts: trasa přes víc míst (místo a hotel toho dne), vlak místo letu, cesta jen z plánovače, poškozená cesta z průvodce', () => {
  const it = saved(italy()), at = (t, iso) => { const n = Date.parse(iso); return C.nowParts(C.tripNow([t], n), n); };
  const p13 = at(it, '2026-11-13T12:00:00Z');
  assert.equal(p13.place, 'Florencie', 'v den přejezdu se spí na dalším místě');
  assert.deepEqual(plain(p13.hotel), { name: 'U kamaráda', q: 'U kamaráda, Florencie, Itálie' });
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

test('zkratka aplikace „Na cestě“ (/#now) vedle Letů a Plánovače', () => {
  const m = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
  assert.deepEqual(m.shortcuts.map((s) => [s.short_name, s.url]), [['Lety', '/#flights'], ['Plánovač', '/#planner'], ['Na cestě', '/#now']]);
  const s = m.shortcuts[2];
  assert.equal(s.name, 'Na cestě');
  assert.deepEqual(plain(s.icons), plain(m.shortcuts[0].icons));
  // #now otevře Přehled s kartou (start i změna adresy v otevřené aplikaci)
  assert.equal((APP.match(/if \(v === 'now'\) return showNow\(\);/g) || []).length, 2);
  assert.match(src('../index.html'), /<div class="now-trip" id="nowTrip" hidden><\/div>\s*<div class="hero">/);
});
