// ⭐ Plus jako falešné dveře (public/js/plus.js přes node:vm): které cesty se počítají do jedné cesty zdarma, kdy se
// ukáže list limitu, že nic nemaže kromě potvrzeného Nahradit a cesta se uloží vždy, otázka na cenu jednou za 30 dní,
// karta sešitu 14 dní před odletem a že každá událost je v seznamu EVENTS serveru.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { EVENTS } from '../server/lib/counts.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const SRC = read('public/js/plus.js');
const ctx = { window: {} };
vm.runInNewContext(SRC, ctx);
const P = ctx.window.Plus;
const T = '2026-11-26';
const plain = (v) => JSON.parse(JSON.stringify(v)); // objekty z jiného vm kontextu

const future = { name: 'Léto v Portugalsku', dest: 'Portugalsko', start: '2027-07-01', end: '2027-07-10' };
const past = { name: 'Řím', dest: 'Řím', start: '2026-05-01', end: '2026-05-05' };
const undated = { name: 'Někdy Island', dest: 'Island', start: '', end: '' };
const explore = { name: 'Lisabon na 3 dny', dest: 'Lisabon', start: '2027-03-01', end: '2027-03-03', explore: { city: {} } };
const fromFriend = { name: 'Barcelona', dest: 'Barcelona', start: '2027-04-01', end: '2027-04-05', sid: 'abc', sharedSnap: {}, gotVer: 'x1' };
const autoDraft = { name: 'Porto 3. 5.', dest: 'Porto', start: '2027-05-03', end: '2027-05-08', tripId: 1, auto: true };

test('počítání cest: budoucí a bez data ano; proběhlá, z Objevuj, od jiného a sama uložená rozpracovaná ne', () => {
  assert.equal(P.counts(future, T), true);
  assert.equal(P.counts(undated, T), true, 'rozpracovaná bez data');
  assert.equal(P.counts({ ...future, start: '2026-11-20', end: T }, T), true, 'návrat dnes – cesta ještě běží');
  assert.equal(P.counts({ ...future, start: '2026-12-01', end: '' }, T), true, 'jen odjezd v budoucnu');
  assert.equal(P.counts(past, T), false);
  assert.equal(P.counts({ ...past, end: '' }, T), false, 'jen odjezd v minulosti');
  assert.equal(P.counts(explore, T), false);
  assert.equal(P.counts({ ...explore, tripId: 5 }, T), true, 'program z Objevuj přidaný k cestě z průvodce ji nevyřadí');
  assert.equal(P.counts(fromFriend, T), false);
  assert.equal(P.counts({ ...fromFriend, gotVer: undefined }, T), false, 'starší odkaz bez otisku verze');
  assert.equal(P.counts({ ...future, sid: 's', sharedSnap: {}, sentSnaps: { v1: {} } }, T), true, 'moje cesta, kterou jsem sdílel');
  assert.equal(P.counts(autoDraft, T), false);
  assert.equal(P.counts({ ...autoDraft, auto: undefined }, T), true, 'po uložení na přání už ano');
  assert.equal(P.counts(null, T), false);
  const list = P.countedTrips([past, undated, explore, future, autoDraft, { ...future, start: '2027-01-02', name: 'Vídeň' }], T);
  assert.deepEqual(list.map((t) => t.name), ['Vídeň', 'Léto v Portugalsku', 'Někdy Island'], 'nejbližší první, bez data na konci');
});

test('kdy se list limitu ukáže: jen když už jedna započítaná cesta je a nová by se počítala', () => {
  assert.equal(P.needsGate([], future, T), false, 'první cesta – nikdy');
  assert.equal(P.needsGate([past, explore, fromFriend, autoDraft], future, T), false, 'nic započítaného');
  assert.equal(P.needsGate([future], { ...undated }, T), true);
  assert.equal(P.needsGate([undated], future, T), true);
  assert.equal(P.needsGate([future], past, T), false, 'zapsání proběhlé cesty nic neomezuje');
  assert.equal(P.needsGate([future], null, T), true, 'bez nové cesty jen podle uložených');
});

// obsluha okna pro gateFlow: zapisuje, co se stalo a v jakém pořadí
const io = (ok = true) => {
  const log = [];
  return {
    log,
    proceed: (asked) => log.push(`proceed:${asked}`),
    show: () => log.push('show'),
    hit: (e) => log.push(`hit:${e}`),
    thanks: () => log.push('thanks'),
    download: () => log.push('download'),
    close: () => log.push('close'),
    confirm: () => { log.push('confirm'); return ok; },
    remove: (t) => log.push(`remove:${t.name}`),
  };
};
const proceeds = (log) => log.filter((x) => x.startsWith('proceed')).length;
const removes = (log) => log.filter((x) => x.startsWith('remove')).length;

test('list limitu: bez listu hned proceed(false); každá volba i zavření uloží cestu právě jednou', () => {
  const none = io();
  assert.equal(P.gateFlow([past], future, T, none), null);
  assert.deepEqual(none.log, ['proceed:false']);

  for (const c of ['plus', 'download', 'replace']) {
    const o = io(), f = P.gateFlow([future, past], undated, T, o);
    f.choose(c); f.closed(); f.choose(c);
    assert.equal(proceeds(o.log), 1, c);
    assert.ok(o.log.includes('proceed:true'), c);
    assert.deepEqual(o.log.slice(0, 2), ['show', 'hit:limit_shown'], c);
    assert.ok(o.log.includes(`hit:limit_${c}`), c);
  }
  const shut = io(), f = P.gateFlow([future], undated, T, shut);
  f.closed();
  assert.deepEqual(shut.log, ['show', 'hit:limit_shown', 'proceed:true'], 'zavření bez volby = uložit');
  f.choose('replace');
  assert.equal(removes(shut.log), 0, 'po zavření už nic');
});

test('list limitu: maže jen potvrzené Nahradit, a to až po uložení nové cesty; Plus a Stáhnout nemažou nic', () => {
  const plus = io(); P.gateFlow([future], undated, T, plus).choose('plus');
  assert.deepEqual(plus.log, ['show', 'hit:limit_shown', 'hit:limit_plus', 'proceed:true', 'thanks']);
  const down = io(); P.gateFlow([future], undated, T, down).choose('download');
  assert.equal(removes(down.log), 0);
  assert.ok(down.log.indexOf('download') < down.log.indexOf('proceed:true'), 'soubor dřív, než vznikne nová');

  const no = io(false), f = P.gateFlow([future], undated, T, no);
  f.choose('replace');
  assert.equal(removes(no.log), 0, 'zrušené potvrzení nic nesmaže');
  assert.equal(proceeds(no.log), 0, 'list zůstane otevřený, ještě se vybírá');
  f.closed();
  assert.equal(proceeds(no.log), 1);
  assert.equal(removes(no.log), 0);

  const yes = io(true), g = P.gateFlow([past, future], undated, T, yes);
  assert.equal(g.cur.name, 'Léto v Portugalsku', 'nahrazuje se započítaná cesta, ne proběhlá');
  g.choose('replace');
  assert.deepEqual(yes.log.slice(-4), ['confirm', 'close', 'proceed:true', 'remove:Léto v Portugalsku']);
});

test('otázka na cenu nejvýš jednou za 30 dní (v úložišti jen datum)', () => {
  assert.equal(P.askDue(null, T), true);
  assert.equal(P.askDue('nesmysl', T), true);
  assert.equal(P.askDue(T, T), false);
  assert.equal(P.askDue('2026-10-28', T), false, '29 dní');
  assert.equal(P.askDue('2026-10-27', T), true, '30 dní');
  assert.equal(P.askDue('2026-12-30', T), true, 'datum v budoucnu (posunuté hodiny)');
  assert.deepEqual([...P.PRICES], [0, 199, 399, 599, 799]);
  assert.match(SRC, /store\.set\(ASK_KEY, today\)/, 'ukládá se jen den');
});

test('karta sešitu: nejbližší uložená cesta 1–14 dní před odletem, ne v den odletu ani během cesty, zavřená ne', () => {
  const at = (start, extra = {}) => ({ name: `Cesta ${start}`, dest: 'Porto', start, end: '2027-01-30', ...extra });
  assert.equal(P.cardPick([at(T)], T), null, 'den odletu');
  assert.equal(P.cardPick([at('2026-11-20')], T), null, 'během cesty');
  assert.equal(P.cardPick([at('2026-12-11')], T), null, '15 dní');
  assert.equal(P.cardPick([at('2026-12-10')], T).days, 14);
  const two = [at('2026-12-05'), at('2026-11-27')];
  assert.equal(P.cardPick(two, T).trip.start, '2026-11-27', 'nejbližší');
  assert.equal(P.cardPick(two, T, [P.tripKey(two[1])]).trip.start, '2026-12-05', '„Teď ne“ jen pro tu cestu');
  assert.equal(P.cardPick([at('2026-11-27', { auto: true })], T), null, 'sama uložená rozpracovaná');
  assert.equal(P.cardPick([at('2026-11-27', { gotVer: 'v' })], T), null, 'cesta od jiného');
  assert.equal(P.tripKey({ tripId: 42, name: 'x' }), '42');

  const pick = (days, extra) => ({ trip: at('2026-12-01', extra), days });
  assert.equal(P.cardText(pick(14), 'Porta'), 'Za 14 dní letíš do Porta. Vezmi si cestu s sebou – sešit k tisku i do telefonu.');
  assert.match(P.cardText(pick(9), 'Porta'), /^Za 9 dní letíš do Porta\./);
  assert.match(P.cardText(pick(3), 'Porta'), /^Za 3 dny letíš/);
  assert.match(P.cardText(pick(1), 'Porta'), /^Zítra letíš do Porta\./);
  assert.match(P.cardText(pick(1, { ground: [{}] }), 'Porta'), /^Zítra jedeš do Porta\./, 'vlakem / busem');
  assert.match(P.cardText(pick(5, { name: 'Lisabon' }), null), /^Za 5 dní tě čeká Lisabon\./, 'nesklonné jméno v 1. pádě');
});

test('texty: termín cesty, věta sešitu s 1. pádem tam, kde cíl nejde vyskloňovat', () => {
  assert.equal(P.termTxt({ start: '2027-05-03', end: '2027-05-10' }), '3.–10. 5.');
  assert.equal(P.termTxt({ start: '2027-04-28', end: '2027-05-03' }), '28. 4.–3. 5.');
  assert.equal(P.termTxt({ start: '2027-05-03', end: '' }), 'od 3. 5.');
  assert.equal(P.termTxt({ start: '2027-05-03', end: '2027-05-03' }), '3. 5.');
  assert.equal(P.termTxt({}), 'bez termínu');
  assert.equal(P.sesitLine('Porto', 'Portugalsko', 'Porta'), 'Celá cesta do Porta v jednom souboru: den po dni s časy, adresy, co zařídit a co platí v zemi Portugalsko pro tvůj termín. K tisku i do telefonu, pro celou partu.');
  assert.match(P.sesitLine('Lisabon', 'Portugalsko', null), /^Lisabon v jednom souboru: /);
  assert.match(P.sesitLine('Itálie', 'Itálie', null), /co zařídit a počasí pro tvůj termín\./, 'cíl = země: země podruhé ne');
});

test('každá událost z plus.js je v seznamu EVENTS serveru; název placené verze je jen v jedné konstantě', () => {
  const used = [...SRC.matchAll(/hit\('([a-z0-9_]+)'\)/g)].map((m) => m[1]);
  const all = [...new Set([...used, ...P.PRICES.map((p) => `price_${p}`)])];
  for (const e of ['limit_shown', 'limit_plus', 'limit_download', 'limit_replace', 'plus_page', 'plus_offer_shown', 'plus_offer_click', 'sesit_shown', 'sesit_click']) assert.ok(all.includes(e), e);
  assert.deepEqual(all.filter((e) => !EVENTS.includes(e)), []);
  assert.match(SRC, /hit\(`price_\$\{b\.dataset\.price\}`\)/);
  assert.equal(SRC.match(/ATLAS Plus/g).length, 1, 'jen const NAME');
  // po „Nechat si obě“ (Plus chystáme) zmizí věta o měsíčním předplatném a obnovení – nic takového zatím neběží
  assert.match(SRC, /thanks: \(\) => \{ if \(sheet\) \{ sheet\.querySelector\('\.plus-small'\)\.hidden = true;/);
  assert.equal(P.NAME, 'ATLAS Plus');
});

test('háčky: list jen u vědomého uložení nové cesty, nikdy u Objevuj, cesty od jiného, tichého ukládání a Dnes na cestě', () => {
  const app = read('public/js/app.js'), trip = read('public/js/trip.js'), fl = read('public/js/flights.js'), places = read('public/js/places.js');
  assert.match(app, /if \(window\.Plus\) Plus\.gateNewTrip\('form', add, trip\); else add\(\);/);
  assert.match(fl, /if \(window\.Plus\) Plus\.gateNewTrip\('offer', add, trip\); else add\(false\);/);
  assert.match(trip, /if \(!o\.quiet && !o\.gated && !o\.now && !t\.shared && window\.Plus && \(i < 0 \|\| S\.trips\[i\]\.auto\)\) \{\s*Plus\.gateNewTrip\('trip', \(\) => saveToPlanner\(\{ \.\.\.o, gated: true \}\), entry\);/);
  assert.match(app, /Trip\.saveToPlanner\(\{ stay: true, now: true \}\)/, 'karta Dnes na cestě');
  assert.ok(!/Plus\./.test(places), 'Objevuj bez nabídky');
  assert.ok(!/Plus\./.test(read('public/js/backup.js')) && !/Plus\./.test(read('public/js/transfer.js')), 'záloha a přenos bez nabídky');
  const imp = app.slice(app.indexOf("$('#planImport').onclick"), app.indexOf("toast('Plán přidán do Mých cest')"));
  assert.ok(imp.length > 0 && !/Plus\./.test(imp), 'cesta přijatá odkazem');
  assert.equal((fl.match(/Plus\./g) || []).length, 1, 'v Letech jen uložení cesty – ne hledání, výsledky ani Ověřit');
  assert.match(read('public/index.html'), /<script src="js\/transfer\.js"><\/script>\n<script src="js\/plus\.js"><\/script>/);
  assert.match(app, /if \(window\.Plus\) Plus\.renderCard\(\$\('#plusCard'\), wnFirst\);/, 'karta ne při první návštěvě');
});

// průvodce cestou (trip.js) v node:vm s minimem z app.js – jako test/trip-auto.test.js; Plus nahrazený záznamem volání
function loadTrip() {
  const c = { window: {}, URLSearchParams, TextEncoder, TextDecoder, btoa, atob, console, setTimeout: () => 0, clearTimeout() {} };
  vm.createContext(c);
  vm.runInContext(read('public/js/ics.js'), c, { filename: 'ics.js' });
  const helpers = read('public/js/app.js').match(/^const (esc|safeUrl|pad|fmtYMD|fmtDate|czk) = .*$/gm);
  vm.runInContext(`const Ics = window.Ics;\n${helpers.join('\n')}
    var S = { trips: [] }, __els = {}, __calls = [];
    var $ = (s) => (__els[s] ||= { innerHTML: '', value: '', remove() {} });
    var $$ = () => [];
    var go = () => {}; var save = () => {}; var flag = (cc) => '[' + cc + ']';
    var toast = () => {}; var byIso = {}; var PACK = ['Pas']; var enc = encodeURIComponent;
    window.scrollTo = () => {};
    var Plus = window.Plus = { sesitShown: (id) => __calls.push(['shown', id]), sesit: (t) => __calls.push(['sesit', t.dest]),
      gateNewTrip: (kind, proceed, trip) => __calls.push(['gate', kind, trip.start, proceed]) };`, c, { filename: 'app-helpers.js' });
  vm.runInContext(read('public/js/trip.js'), c, { filename: 'trip.js' });
  const leg = (from, to, date) => ({ from, to, date, dep: `${date}T10:00:00`, arr: `${date}T12:00:00`, hasTime: true, fromTz: 'Europe/Prague', toTz: 'Europe/Rome', carrier: 'DA', carrierName: 'Demo Air', provider: 'demo-air', bookUrl: 'https://air.example/' });
  const t = { id: 'x', out: leg('PRG', 'FCO', '2027-03-10'), back: leg('FCO', 'PRG', '2027-03-14'), flightCzk: 3000, groundCzk: 0, bagCzk: 0, arrCzk: 0, perPersonCzk: 1500, totalCzk: 3000, provider: 'demo-air', combined: false, nights: 4 };
  c.window.Trip.start({ t, g: { dest: { key: 'ROM', id: 'metro:ROM', label: 'Řím', cc: 'IT', country: 'Itálie', lat: 41.9, lon: 12.5 } }, result: { origins: [], query: { adults: 2, bags: 'none' }, home: null, arrivals: {} } });
  c.S.trip.verifiedAt = 1;
  return c;
}

test('Shrnutí průvodce: 📒 Sešit cesty · Plus vedle Do kalendáře, otevře okno sešitu; u cesty poslané odkazem ne', () => {
  const c = loadTrip();
  c.S.trip.step = 'summary'; c.window.Trip.render();
  const html = c.__els['#tripStep'].innerHTML;
  assert.match(html, /id="sumIcs">📅 Do kalendáře<\/button>\s*<button class="btn" id="sumSesit">📒 Sešit cesty · Plus<\/button>/);
  assert.ok(c.__calls.some((x) => x[0] === 'shown'), 'sesit_shown (Plus.sesitShown počítá jednou pro cestu)');
  c.__els['#sumSesit'].onclick();
  assert.deepEqual(plain(c.__calls.at(-1)), ['sesit', 'Řím']);
  c.S.trip.shared = true; c.__els['#tripStep'].innerHTML = ''; c.window.Trip.render();
  assert.doesNotMatch(c.__els['#tripStep'].innerHTML, /sumSesit/);
});

test('uložení z průvodce: list jen u vědomého uložení nové cesty – ne potichu, ne z Dnes na cestě, ne cesta z odkazu, ne podruhé', () => {
  const c = loadTrip(), gates = () => c.__calls.filter((x) => x[0] === 'gate');
  c.window.Trip.saveToPlanner({ quiet: true });
  assert.equal(gates().length, 0, 'tiché ukládání');
  assert.equal(c.S.trips.length, 1); assert.equal(c.S.trips[0].auto, true);
  c.window.Trip.saveToPlanner({ stay: true, now: true });
  assert.equal(gates().length, 0, 'karta Dnes na cestě');
  c.S.trips[0].auto = true;
  c.window.Trip.saveToPlanner({ stay: true });
  assert.equal(gates().length, 1, 'dosud jen sama uložená → vědomé uložení');
  assert.deepEqual(plain(gates()[0].slice(0, 3)), ['gate', 'trip', '2027-03-10']);
  assert.equal(c.S.trips[0].auto, true, 'před volbou v listu se nic nezměnilo');
  gates()[0][3](true);
  assert.equal(c.S.trips.length, 1); assert.equal(c.S.trips[0].auto, undefined, 'po volbě uložená na přání, bez kopie');
  c.window.Trip.saveToPlanner({ stay: true });
  assert.equal(gates().length, 1, 'už uložená – přepsání bez listu');
  const d = loadTrip(); d.S.trip.shared = true;
  d.window.Trip.saveToPlanner({ stay: true });
  assert.equal(d.__calls.filter((x) => x[0] === 'gate').length, 0, 'cesta poslaná odkazem');
  assert.equal(d.S.trips.length, 1);
});
