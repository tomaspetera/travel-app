// 🚆 Vlak / bus na cestě (čas odjezdu, nástupiště, místo a kód z plánovače – t.rides), 🌤️ předpověď na kartě „Dnes na
// cestě“ (Open-Meteo, mezipaměť v localStorage) a okno cesty během cesty (dnešek a rezervace nahoře). Cesta Praha →
// Lisabon (let) → Porto (vlak 10:42) → let domů, 2 dospělí + dítě, s pevnými hodinami – testy nezávisí na dnešním datu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { lisbonPorto, vienna, plannerOnly, saved } from './fixtures/trips-now.js';

const src = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
const APP = src('app.js');
const pick = (...names) => names.map((n) => {
  const m = APP.match(new RegExp(`^(const ${n} = (?:.*\\{\\n[\\s\\S]*?^\\};|.*)|function ${n}\\([^\\n]*\\}|function ${n}\\([\\s\\S]*?^\\})$`, 'm'));
  assert.ok(m, `app.js: ${n}`);
  return m[0];
}).join('\n');
function load({ fetch = null, storage = null, online = true } = {}) {
  const ctx = { URLSearchParams, TextEncoder, TextDecoder, btoa, atob, console, navigator: { onLine: online }, ...(fetch ? { fetch } : {}) };
  ctx.window = ctx;
  if (storage) ctx.localStorage = { getItem: (k) => (k in storage ? storage[k] : null), setItem: (k, v) => { storage[k] = String(v); } };
  vm.createContext(ctx);
  vm.runInContext(pick('esc', 'enc', 'flag', 'safeUrl', 'cssUrl', 'pad', 'fmtYMD', 'fmtDate', 'czk'), ctx, { filename: 'app-helpers.js' });
  vm.runInContext(`var S = { trips: [] }, __els = {}, __go = [], __toasts = [], __rn = 0;
    var $ = (s) => (__els[s] ||= { innerHTML: '', value: '', remove() {} });
    var $$ = () => []; var go = (v) => { __go.push(v); }; var save = () => {}; var toast = (m) => { __toasts.push(m); }; var confirm = () => true;
    var renderNow = () => { __rn++; };
    var byIso = { PT: { cs: 'Portugalsko' }, AT: { cs: 'Rakousko' } }; var PACK = ['Pas'];`, ctx, { filename: 'stubs.js' });
  vm.runInContext(src('data.js').match(/^const (WC|wIco)=.*$/gm).join('\n'), ctx, { filename: 'data.js' });
  for (const f of ['ics.js', 'planshare.js', 'weather.js', 'backup.js', 'trip.js', 'places.js']) vm.runInContext(src(f), ctx, { filename: f });
  vm.runInContext(pick('todayLocal', 'daysTo', 'inDays', 'okYmd', 'ymdPlus', 'wallAt', 'ridesOf', 'dtPlus', 'rideOn', 'tripGround', 'tripLegs', 'tripZone', 'tripBack', 'tripNow', 'tripWiz', 'tripRows', 'pastRows', 'nowParts',
    'hmTxt', 'dowLbl', 'canCopy', 'doGen', 'rideAhead', 'nowCard', 'NWX_LS', 'nwxLoad', 'nowWx', 'nowWxFetch', 'tripLive', 'tripOrder', 'tripRides', 'rideEd', 'rideSet',
    'dateRange', 'planIco', 'planTransport', 'tripIsos', 'tripVia', 'planEvents') + '\n' + APP.match(/^let nwxMem = .*$/m)[0]
    // konstanty (const) nejsou vlastnosti globálního objektu – pro testy ano
    + '\nObject.assign(window, { hmTxt, doGen, tripOrder });', ctx, { filename: 'app-now.js' });
  return ctx;
}
const C = load();
const plain = (x) => JSON.parse(JSON.stringify(x));
const sp = (s) => String(s).replace(/\u00a0/g, ' ');
const at = (c, t, iso) => { const n = Date.parse(iso), x = c.tripNow([t], n), p = x && c.nowParts(x, n); return { n, x, p, h: p ? sp(c.nowCard(x, p)) : '' }; };
const KEY = '2026-10-26|Lisabon|Porto';
/** Cesta z průvodce v plánovači s vlakem do Porta, jak ho uživatel zapíše v itineráři (pole po poli jako setRide). */
function porto(c = C, fields = { dep: '10:42', plat: '4', seat: 'vůz 3, místo 45', kod: 'CP7QX2' }) {
  const t = saved(lisbonPorto(), { pax: '3', refs: [{ co: 'Ryanair', kod: 'K7XQ2M', pozn: '' }] });
  for (const [k, v] of Object.entries(fields)) t.rides = c.rideSet(t, KEY, k, v);
  return t;
}

test('🚆 vlak Lisabon → Porto: čas odjezdu z plánovače → odpočet na kartě („vlak do Porta v 10:42 – za 1 h 20 min“), nádraží v mapě, průběh cesty', () => {
  // průvodce zná jen odhad přejezdu (~2 h 50 min vlakem) – bez zapsaného času žádný odpočet
  const t0 = saved(lisbonPorto(), { pax: '3' });
  assert.deepEqual(plain(C.tripRides(t0)), [{ key: KEY, date: '2026-10-26', from: 'Lisabon', to: 'Porto', kind: 'vlak', min: 170, tz: 'Europe/Lisbon', dep: '', plat: '', seat: '', kod: '' }]);
  const b0 = at(C, t0, '2026-10-26T09:22:00Z');
  assert.equal(b0.p.ahead, null);
  assert.ok(!b0.h.includes('Vlak do'));
  // zapsané pole po poli; neznámý úsek nebo pole nic
  const t = porto();
  assert.deepEqual(plain(t.rides), [{ date: '2026-10-26', from: 'Lisabon', to: 'Porto', kind: 'vlak', dep: '10:42', min: 170, tz: 'Europe/Lisbon', plat: '4', seat: 'vůz 3, místo 45', kod: 'CP7QX2' }]);
  assert.equal(C.rideSet(t, '2026-10-27|Porto|Lisabon', 'dep', '09:00'), null);
  assert.equal(C.rideSet(t, KEY, 'carrier', 'CP'), null);
  assert.deepEqual(plain(C.rideSet(porto(C, { dep: '10:42' }), KEY, 'dep', '')), [], 'smazaný čas a nic dalšího → záznam pryč');
  assert.deepEqual(plain(C.rideSet(t, KEY, 'dep', '25:99')).map((r) => r.dep), [''], 'nesmyslný čas se neuloží');

  // den vlaku 9:22 v Lisabonu (WET = UTC): vlak za 1 h 20 min, nástupiště, místo, kód a nádraží v Google Maps
  const d = at(C, t, '2026-10-26T09:22:00Z');
  assert.deepEqual([d.x.day, d.p.ahead.min, d.p.ahead.l.dep, d.p.ahead.l.arr, d.p.ahead.l.fromTz], [3, 80, '2026-10-26T10:42', '2026-10-26T13:32', 'Europe/Lisbon']);
  assert.ok(d.h.includes('<span>🚆 Vlak do Porta v <b>10:42</b> – <b data-nw="cd"></b> · nástupiště <b>4</b> · vůz 3, místo 45 · kód <b>CP7QX2</b> · '
    + '<a href="https://www.google.com/maps/search/?api=1&amp;query=vlakov%C3%A9%20n%C3%A1dra%C5%BE%C3%AD%20Lisabon" target="_blank" rel="noopener">🚉 nádraží ↗</a></span>'), d.h);
  assert.equal(sp('za ' + C.hmTxt(d.p.ahead.min)), 'za 1 h 20 min', 'odpočet doplní renderNow');
  // průběh dne: přejezd s časem a příjezdem odhadem (po něm se řádek ztlumí)
  const tr = d.p.rows.find((r) => r[1] === '🚆');
  assert.ok(sp(tr[2]).startsWith('Přejezd Lisabon 10:42 → Porto ~13:32 · ~2 h 50 min vlakem / busem (odhad) · nástupiště 4 · vůz 3, místo 45 · <a '), tr[2]);
  assert.deepEqual(plain(d.p.rows.map((r) => r[1])), ['🚗', '📍', '🚆', '🏨', '📍']);
  assert.deepEqual(plain(at(C, t, '2026-10-26T11:00:00Z').p.past), [true, false, false, false, false], 'vlak ještě jede');
  assert.deepEqual(plain(at(C, t, '2026-10-26T14:00:00Z').p.past), [true, true, true, false, false], 'po příjezdu do Porta');
  assert.equal(at(C, t, '2026-10-26T11:00:00Z').p.ahead, null, 'po odjezdu vlaku další spoj až let domů');
  // večer předem: „zítra v 10:42“ (do 24 h)
  const eve = at(C, t, '2026-10-25T19:00:00Z');
  assert.deepEqual([eve.x.day, eve.p.ahead.min], [2, 15 * 60 + 42]);
  assert.ok(eve.h.includes('🚆 Vlak do Porta zítra v <b>10:42</b> – <b data-nw="cd"></b>'), eve.h);
  // vlak mezi místy není cesta zpět: návrat domů se pozná dál podle letu OPO → PRG; den po návratu nic
  const home = at(C, t, '2026-10-28T15:30:00Z');
  assert.deepEqual([home.x.home, home.p.ahead], [true, null]);
  assert.equal(at(C, t, '2026-10-29T09:00:00Z').x, null);
  // starší cesta bez zapsaného vlaku: spoje jako dřív
  assert.deepEqual(plain(C.tripLegs(t0).map((x) => x.l.from)), ['PRG', 'OPO']);
  assert.deepEqual(plain(C.tripLegs(t).map((x) => [x.l.from, x.l.ride || false])), [['PRG', false], ['Lisabon', true], ['OPO', false]]);
});

test('🚆 vlak / bus z plánovače: výchozí čas z plánu, zapsaný čas u busu bez času, „vlak do Prahy“, bus a nádraží podle zastávky', () => {
  // vlak místo letu (RegioJet z průvodce): čas z plánu je výchozí, zapíše se jen nástupiště
  const v = saved(vienna());
  v.ground[1] = { ...v.ground[1], kind: 'vlak', fromStation: 'Wien Hbf', toStation: 'hl.n.' }; // jako groundBrief z průvodce
  assert.deepEqual(plain(C.tripRides(v)).map((r) => [r.key, r.dep, r.kind]), [['2026-11-04|Praha|Vídeň', '06:01', 'vlak'], ['2026-11-08|Vídeň|Praha', '17:00', 'vlak']]);
  v.rides = C.rideSet(v, '2026-11-08|Vídeň|Praha', 'plat', '7');
  const b = at(C, v, '2026-11-08T10:00:00Z');
  assert.deepEqual([b.p.ahead.min, b.p.ahead.l.dep, b.p.ahead.l.arr, b.p.ahead.l.plat], [6 * 60, '2026-11-08T17:00', '2026-11-08T21:20', '7']);
  assert.ok(b.h.includes('🚆 Vlak do Prahy v <b>17:00</b> – <b data-nw="cd"></b> · nástupiště <b>7</b> · <a href="https://www.google.com/maps/search/?api=1&amp;query=Wien%20Hbf%2C%20V%C3%ADde%C5%88"'), b.h);
  // jen z plánovače: bus bez času – zapsaný čas, příjezd odhadem z délky cesty, řádek v průběhu cesty
  const p = plannerOnly({ ground: [{ from: 'Lisabon', to: 'Porto', date: '2026-11-14', dep: null, arr: null, kind: 'bus', min: 200, fromTz: 'Europe/Lisbon', toTz: 'Europe/Lisbon' }] });
  for (const [k, val] of [['dep', '08:15'], ['plat', '12']]) p.rides = C.rideSet(p, '2026-11-14|Lisabon|Porto', k, val);
  const q = at(C, p, '2026-11-14T07:00:00Z');
  assert.deepEqual(plain(q.p.rows.map((r) => `${r[0]} ${r[1]} ${sp(r[2])}`)), ['2026-11-14 🚌 Lisabon 08:15 → Porto ~11:35 · bus · nástupiště 12']);
  assert.ok(q.h.includes('🚌 Bus do Porta v <b>8:15</b> – <b data-nw="cd"></b> · nástupiště <b>12</b> · <a href="https://www.google.com/maps/search/?api=1&amp;query=autobusov%C3%A9%20n%C3%A1dra%C5%BE%C3%AD%20Lisabon" target="_blank" rel="noopener">🚏 nádraží ↗</a>'), q.h);
  // „do …“ jen s jistou koncovkou, jinak „odkud → kam“
  assert.deepEqual(['Porto', 'Praha', 'Brno', 'Malaga', 'Florencie', 'Lisabon', 'Vídeň', 'Bologna', 'Tokio', 'Mallorca', 'Rio de Janeiro', ''].map(C.doGen),
    ['Porta', 'Prahy', 'Brna', 'Malagy', 'Florencie', null, null, null, null, null, null, null]);
  assert.ok(sp(C.rideAhead({ from: 'Porto', to: 'Lisabon', kind: 'vlak', dep: '2026-10-27T09:05' }, '2026-10-27')).startsWith('🚆 Vlak Porto → Lisabon v <b>9:05</b>'));
  // text z cizího vstupu (sdílený plán) escapovaný
  const x = sp(C.rideAhead({ from: '<i>', to: '"><b>', kind: 'vlak', dep: '2026-10-27T09:05', plat: '<script>', seat: '"x"', kod: '<img>' }, '2026-10-27'));
  assert.ok(!/<i>|<script>|<img>|"x"/.test(x), x);
});

test('🚆 vlak v odkazu na plán, v kalendáři (.ics) a v záloze – kód jízdenky jen v zařízení a v záloze; znovu uložená cesta z průvodce ho nechá', async () => {
  const c = load(), t = porto(c);
  // odkaz #plan=: čas, nástupiště a místo ano, kód ne; příjemce (bez průvodce) má odpočet i řádek v průběhu cesty
  const json = c.PlanShare.json(t);
  assert.ok(json.includes('"rides":[{"date":"2026-10-26","from":"Lisabon","to":"Porto","kind":"vlak","dep":"10:42","min":170,"tz":"Europe/Lisbon","plat":"4","seat":"vůz 3, místo 45"}]'), json);
  assert.ok(!/CP7QX2|K7XQ2M/.test(json));
  const got = c.PlanShare.decode(c.PlanShare.encode(t));
  const r = at(c, got, '2026-10-26T09:22:00Z');
  assert.equal(r.p.ahead.min, 80);
  assert.ok(r.h.includes('🚆 Vlak do Porta v <b>10:42</b>') && !r.h.includes('CP7QX2'), r.h);
  assert.deepEqual(plain(r.p.rows.map((x) => `${x[1]} ${sp(x[2])}`)), ['🚆 Lisabon 10:42 → Porto ~13:32 · vlak · nástupiště 4 · vůz 3, místo 45']);
  // kalendář: událost vlaku s časem a nástupištěm, bez kódu
  const ev = plain(c.planEvents(t)).find((e) => /^🚆/u.test(e.title));
  assert.deepEqual([ev.title, ev.start, ev.tz, ev.end, ev.location], ['🚆 Lisabon → Porto (vlak)', '2026-10-26T10:42', 'Europe/Lisbon', '2026-10-26T13:32', 'Lisabon']);
  // příjezd jen odhadem (zapsaný odjezd + délka přejezdu z průvodce) – v kalendáři s „~“ jako na kartě, ne jako jistý čas
  assert.match(ev.description, /^Odjezd 10:42 místního času \(Lisabon\)\nPříjezd ~13:32 místního času \(Porto\) – odhad podle délky cesty\nNástupiště 4\nvůz 3, místo 45\n/);
  const ics = c.Ics.build(c.planEvents(t), { name: t.name, now: 0 });
  assert.ok(ics.includes('DTSTART:20261026T104200Z') && !/CP7QX2/.test(ics), ics);
  // bez zapsaného času vlak do kalendáře nejde (čas nikdo nezná)
  assert.ok(!c.planEvents(porto(c, { plat: '4' })).some((e) => /^🚆/u.test(e.title)));
  // 💾 záloha: celý záznam i s kódem
  const B = c.Backup, d = { sanitizePlan: c.PlanShare.sanitize, sanitizeWizard: c.Trip.sanitizeTrip, txt: c.PlanShare.txt };
  assert.deepEqual(plain(B.parse(B.pack({ trips: [t] }, {}, 0), d).trips[0].rides), plain(t.rides));
  // znovu „💾 Uložit do plánovače“ z průvodce: vlak, který trasa pořád má, zůstane; úsek, který už nemá, zmizí
  t.rides = [...t.rides, { date: '2026-10-25', from: 'Lisabon', to: 'Sintra', kind: 'vlak', dep: '09:10', min: 40, tz: 'Europe/Lisbon', plat: '', seat: '', kod: '' }];
  c.S.trips = [t];
  assert.equal(c.Trip.openSaved(t.wizard, t.tripId), true);
  c.S.trip.step = 'summary';
  c.Trip.render();
  c.__els['#sumSave'].onclick();
  assert.equal(c.S.trips.length, 1);
  assert.deepEqual(plain(c.S.trips[0].rides).map((x) => [x.from, x.to, x.dep, x.kod]), [['Lisabon', 'Porto', '10:42', 'CP7QX2']]);
  assert.ok(!/CP7QX2/.test(JSON.stringify(c.S.trips[0].wizard)));
});

test('🚆 pole vlaku se ukládá už při psaní: kód jízdenky vložený z e-mailu nezmizí, když aplikace skončí dřív, než pole opustí', async () => {
  const c = load(), t = porto(c, { dep: '10:42' });
  c.setTimeout = setTimeout; c.clearTimeout = clearTimeout;
  vm.runInContext(pick('putRide', 'flushRide', 'rideSoon') + '\n' + APP.match(/^let rideP = .*$/m)[0]
    + `\nvar activeView = 'planner', __saves = 0, ShareLink = { prepare() {} }; save = () => { __saves++; };
    Object.assign(window, { flushRide, rideSoon });`, c, { filename: 'app-ride.js' });
  c.S.trips = [t];
  const r = () => plain(t.rides[0]);
  // psaní: ještě neuloženo; skrytí aplikace (visibilitychange / pagehide → flushRide) uloží rozepsané
  c.rideSoon(t, KEY, 'kod', 'CP7');
  c.rideSoon(t, KEY, 'kod', 'CP7QX2');
  assert.deepEqual([r().kod, c.__saves], ['', 0]);
  c.flushRide();
  assert.deepEqual([r().kod, r().dep, c.__saves], ['CP7QX2', '10:42', 1]);
  // samo za chvíli po posledním znaku; jiné pole napřed uloží to rozepsané
  c.rideSoon(t, KEY, 'plat', '4');
  await new Promise((ok) => setTimeout(ok, 450));
  assert.equal(r().plat, '4');
  c.rideSoon(t, KEY, 'seat', 'vůz 3');
  c.rideSoon(t, KEY, 'plat', '5');
  assert.deepEqual([r().seat, r().plat], ['vůz 3', '4']);
  c.flushRide();
  assert.equal(r().plat, '5');
  // cesta mezitím smazaná: čekající hodnota nic nepřepíše
  c.rideSoon(t, KEY, 'kod', 'JINY');
  c.S.trips = [];
  c.flushRide();
  assert.equal(r().kod, 'CP7QX2');
  // v aplikaci: psaní v polích (input), skrytí i zavření aplikace a nové vykreslení okna cesty uloží čekající hodnotu
  assert.match(APP, /x\.oninput = \(\) => setRideSoon\(i, b\.dataset\.ride, x\.dataset\.rf, x\.value\)/);
  assert.match(APP, /^window\.addEventListener\('pagehide', flushRide\);$/m);
  assert.match(APP, /^document\.addEventListener\('visibilitychange', \(\) => \{ if \(document\.hidden\) flushRide\(\); \}\);$/m);
  assert.match(APP, /^function openTrip\(i\) \{\n {2}flushRide\(\);/m);
});

test('🌤️ předpověď na kartě: kde dnes jsi (v den přejezdu obě místa), zítřejší další místo, den před odletem cíl – po návratu ani 2 dny předem nic', () => {
  const t = porto(), wx = (iso) => plain(at(C, t, iso).p.wx).map((q) => `${q.tag} ${q.name} ${q.date} ${q.lat},${q.lon}`);
  assert.deepEqual(wx('2026-10-22T16:00:00Z'), [], '2 dny před odletem');
  assert.deepEqual(wx('2026-10-23T16:00:00Z'), ['zítra Lisabon 2026-10-24 38.7223,-9.1393'], 'večer před odletem');
  assert.deepEqual(wx('2026-10-24T01:30:00Z'), ['dnes Lisabon 2026-10-24 38.7223,-9.1393'], 'ráno odletu doma');
  assert.deepEqual(wx('2026-10-25T07:30:00Z'), ['dnes Lisabon 2026-10-25 38.7223,-9.1393', 'zítra Porto 2026-10-26 41.1579,-8.6291'], 'zítra vlakem do Porta');
  assert.deepEqual(wx('2026-10-26T09:22:00Z'), ['dnes Lisabon 2026-10-26 38.7223,-9.1393', 'dnes Porto 2026-10-26 41.1579,-8.6291'], 'den přejezdu');
  assert.deepEqual(wx('2026-10-27T09:00:00Z'), ['dnes Porto 2026-10-27 41.1579,-8.6291']);
  assert.deepEqual(wx('2026-10-28T06:30:00Z'), ['dnes Porto 2026-10-28 41.1579,-8.6291'], 'ráno odletu domů');
  assert.deepEqual(wx('2026-10-28T15:30:00Z'), [], 'doma');
  // cesta jen z plánovače (bez poloh míst): bez předpovědi – a tedy bez dotazu
  assert.deepEqual(plain(at(C, plannerOnly(), '2026-11-13T10:00:00Z').p.wx), []);
});

test('🌤️ předpověď z mezipaměti: jeden řádek na místo (ikona, max / min, srážky), stará nebo bez signálu „předpověď z 9:22“, jiný den s datem', () => {
  const t = porto(), d = at(C, t, '2026-10-26T09:22:00Z'), H = 36e5;
  const cache = (age) => ({ [C.Weather.key(38.7223, -9.1393)]: { '2026-10-26': [1, 22, 15, 10, d.n - age] }, [C.Weather.key(41.1579, -8.6291)]: { '2026-10-26': [61, 19, 13, 70, d.n - age], '2026-10-27': [2, 20, 12, 20, d.n - age] } });
  const w = (age, o) => plain(C.nowWx(d.p.wx, cache(age), d.n, { tz: 'Europe/Lisbon', ...o }));
  assert.deepEqual(w(H / 2), { rows: [{ name: 'Lisabon', tag: 'dnes', w: { code: 1, hi: 22, lo: 15, pop: 10 } }, { name: 'Porto', tag: 'dnes', w: { code: 61, hi: 19, lo: 13, pop: 70 } }], from: '' });
  assert.equal(w(H / 2, { offline: true }).from, '8:52', 'bez signálu');
  assert.equal(w(3 * H).from, '6:22', 'novější se nestáhla');
  assert.equal(sp(w(20 * H).from), '25. 10. 13:22', 'z předchozího dne');
  // místo bez předpovědi na ten den se vynechá; poškozená mezipaměť nic nerozbije
  assert.deepEqual(plain(C.nowWx(d.p.wx, { [C.Weather.key(41.1579, -8.6291)]: { '2026-10-27': [2, 20, 12, 20, d.n] } }, d.n)), { rows: [], from: '' });
  assert.deepEqual(plain(C.nowWx(d.p.wx, { 'x': 'y', [C.Weather.key(38.7223, -9.1393)]: { '2026-10-26': ['a', 1] } }, d.n)), { rows: [], from: '' });
  // na kartě pod odpočtem vlaku, stáří u posledního místa
  const h = sp(C.nowCard(d.x, { ...d.p, wxNow: C.nowWx(d.p.wx, cache(3 * H), d.n, { tz: 'Europe/Lisbon' }) }));
  assert.ok(h.includes('🚉 nádraží ↗</a></span><span class="nw-wx">Lisabon <span class="wx" title="Skoro jasno, pravděpodobnost srážek 10 % – předpověď Open-Meteo">🌤️ 22°<small> / 15°</small> · 💧 10 %</span></span>'
    + '<span class="nw-wx">Porto <span class="wx wet" title="Déšť, pravděpodobnost srážek 70 % – předpověď Open-Meteo">🌧️ 19°<small> / 13°</small> · 💧 70 %</span> <span class="faint">předpověď z 6:22</span></span><span>🕐 Místní čas'), h);
  // zítřejší místo s „zítra“
  const e = at(C, t, '2026-10-25T07:30:00Z'), z = sp(C.nowCard(e.x, { ...e.p, wxNow: C.nowWx(e.p.wx, { [C.Weather.key(41.1579, -8.6291)]: { '2026-10-26': [61, 19, 13, 70, e.n] } }, e.n) }));
  assert.ok(z.includes('<span class="nw-wx">zítra Porto <span class="wx wet"'), z);
});

test('🌤️ stažení předpovědi: jeden dotaz na Open-Meteo pro všechna místa karty, do localStorage, další až za 2 h; bez signálu ani bez míst žádný', async () => {
  const calls = [], storage = {};
  const fetch = async (url) => {
    calls.push(url);
    const n = new URL(url).searchParams.get('latitude').split(',').length;
    const day = (code, hi, lo, pop) => ({ time: ['2026-10-26'], weather_code: [code], temperature_2m_max: [hi], temperature_2m_min: [lo], precipitation_probability_max: [pop], precipitation_sum: [0], sunset: ['2026-10-26T18:30'] });
    const body = [{ timezone: 'Europe/Lisbon', daily: day(1, 22.4, 14.6, 10) }, { timezone: 'Europe/Lisbon', daily: day(61, 18.6, 13.2, 70) }];
    return { ok: true, json: async () => (n === 1 ? body[0] : body) };
  };
  const tick = () => new Promise((r) => setTimeout(r, 20));
  const c = load({ fetch, storage }), t = porto(c), d = at(c, t, '2026-10-26T09:22:00Z');
  c.nowWxFetch(d.p.wx, d.n);
  await tick();
  assert.equal(calls.length, 1);
  const u = new URL(calls[0]);
  assert.deepEqual([u.host, u.searchParams.get('latitude'), u.searchParams.get('longitude'), u.searchParams.get('start_date'), u.searchParams.get('end_date')], ['api.open-meteo.com', '38.72,41.16', '-9.14,-8.63', '2026-10-26', '2026-10-26']);
  assert.deepEqual(JSON.parse(storage.atlas_nowwx), { '38.72,-9.14': { '2026-10-26': [1, 22, 15, 10, d.n] }, '41.16,-8.63': { '2026-10-26': [61, 19, 13, 70, d.n] } });
  assert.equal(c.__rn, 1, 'karta se překreslí');
  // do 2 h znovu nic
  c.nowWxFetch(d.p.wx, d.n + 36e5);
  assert.equal(calls.length, 1);
  // nové spuštění aplikace bez signálu: předpověď z localStorage, žádný dotaz
  const off = load({ fetch, storage, online: false });
  off.nowWxFetch(d.p.wx, d.n + 3 * 36e5);
  assert.equal(calls.length, 1);
  assert.deepEqual(plain(off.nowWx(d.p.wx, off.nwxLoad(), d.n + 3 * 36e5, { tz: 'Europe/Lisbon', offline: true })), {
    rows: [{ name: 'Lisabon', tag: 'dnes', w: { code: 1, hi: 22, lo: 15, pop: 10 } }, { name: 'Porto', tag: 'dnes', w: { code: 61, hi: 19, lo: 13, pop: 70 } }], from: '9:22' });
  // telefon na pražském čase v cíli o hodinu dál na západ po půlnoci: den karty je včera podle zařízení – i tak dotaz
  const y = load({ fetch, storage: {} });
  y.nowWxFetch([{ lat: 38.7223, lon: -9.1393, date: '2026-10-25', name: 'Lisabon', tag: 'dnes' }], Date.parse('2026-10-26T00:30:00Z'));
  await tick();
  assert.equal(new URL(calls.at(-1)).searchParams.get('start_date'), '2026-10-25', calls.at(-1));
  calls.pop();
  // bez míst (po návratu, cesta jen z plánovače) žádný dotaz
  c.nowWxFetch([], d.n + 3 * 36e5);
  assert.equal(calls.length, 1);
  // po 2 h nová předpověď (Weather.forecast – v paměti hodinu, pak znovu z Open-Meteo)
  c.nowWxFetch(d.p.wx, d.n + 3 * 36e5);
  await tick();
  assert.deepEqual(JSON.parse(storage.atlas_nowwx)['41.16,-8.63']['2026-10-26'], [61, 19, 13, 70, d.n + 3 * 36e5]);
  assert.equal(c.__rn, 2);
  // chyba sítě: další pokus až za 10 min, ne každou minutu
  const bad = load({ fetch: async () => { calls.push('x'); throw new Error('offline'); }, storage: {} });
  bad.nowWxFetch(d.p.wx, d.n);
  await tick();
  bad.nowWxFetch(d.p.wx, d.n + 6e4);
  await tick();
  assert.equal(calls.filter((x) => x === 'x').length, 1);
});

test('okno cesty během cesty: nahoře dnešní den (vlak, program) a 🔖 rezervace, pod nimi doprava, hledání a „Před cestou“; před cestou a po ní jako dřív', () => {
  const t = porto();
  assert.equal(C.tripLive(t, Date.parse('2026-10-23T16:00:00Z')), null, 'den před odletem');
  assert.deepEqual(plain(C.tripLive(t, Date.parse('2026-10-26T09:22:00Z'))), { today: '2026-10-26', day: 3, days: 5 });
  // v Lisabonu po půlnoci pražského času je ještě den 2
  assert.deepEqual(plain(C.tripLive(t, Date.parse('2026-10-25T23:30:00Z'))), { today: '2026-10-25', day: 2, days: 5 });
  assert.equal(C.tripLive(t, Date.parse('2026-10-28T15:30:00Z')), null, 'po přistání doma');
  assert.equal(C.tripLive({ name: 'x', start: 'nesmysl' }), null);
  assert.deepEqual(plain(C.tripOrder(null)), ['flight', 'acts', 'entry', 'share', 'days', 'refs', 'pack']);
  const live = plain(C.tripOrder({ today: '2026-10-26' }));
  assert.equal(live[0], 'live');
  assert.ok(live.indexOf('live') < live.indexOf('acts') && live.indexOf('live') < live.indexOf('entry') && !live.includes('refs'), 'rezervace v části „live“');
  // pole vlaku v itineráři: bez obsluh v HTML (CSP), čas jako type="time", hodnoty escapované
  const h = C.rideEd({ ...C.tripRides(t)[0], seat: '"><img src=x>' });
  assert.ok(h.startsWith('<div class="ride-ed" data-ride="2026-10-26|Lisabon|Porto"><div class="ride-h">🚆 <b>Lisabon → Porto</b> <span class="faint">· ~2'), h);
  assert.ok(h.includes('<input class="input" data-rf="dep" value="10:42" type="time" autocomplete="off" enterkeyhint="done">'), h);
  assert.ok(h.includes('data-rf="kod" value="CP7QX2" maxlength="40" autocapitalize="characters"'), h);
  assert.ok(!/<img|\son[a-z]+=/.test(h), h);
});


test('den přejezdu Lisabon → Porto: navigace do hotelu v Portu až po příjezdu vlaku (dřív celý den, i ráno v Lisabonu)', () => {
  const t = porto(); // vlak 26. 10. v 10:42, ~2 h 50 min
  const ráno = at(C, t, '2026-10-26T09:22:00Z'), odpo = at(C, t, '2026-10-26T15:00:00Z');
  assert.equal(ráno.p.hotel, null, ráno.h);
  assert.ok(odpo.p.hotel && odpo.p.hotel.name, 'po příjezdu hotel v Portu');
  assert.equal(at(C, t, '2026-10-25T09:22:00Z').p.hotel?.name, at(C, t, '2026-10-24T12:00:00Z').p.hotel?.name, 'jiné dny beze změny');
});

test('🚆 čas vlaku zapsaný v Mých cestách platí i v kalendáři ze Shrnutí (dřív přejezd vždy v 11:00)', () => {
  const t = porto(); // uložená cesta s vlakem Lisabon → Porto v 10:42
  C.S.trips = [t];
  const w = C.window.Trip.sanitizeTrip(plain({ ...t.wizard, created: t.tripId }));
  const ev = plain(C.window.Trip.calendarEvents(w)).find((e) => /Přejezd Lisabon → Porto/.test(e.title));
  assert.equal(ev.start, '2026-10-26T10:42');
  C.S.trips = [];
  const ev0 = plain(C.window.Trip.calendarEvents(w)).find((e) => /Přejezd Lisabon → Porto/.test(e.title));
  assert.equal(ev0.start, '2026-10-26T11:00', 'bez zapsaného času odhad po check-outu');
});
