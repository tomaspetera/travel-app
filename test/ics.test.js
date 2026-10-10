// Export do kalendáře (public/js/ics.js) a sdílení plánu (public/js/planshare.js) – klasické
// skripty prohlížeče, tady načtené přes node:vm s falešným window.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { deflateRawSync, inflateRawSync } from 'node:zlib';

const load = (...files) => {
  const ctx = { window: {}, URLSearchParams, TextEncoder, TextDecoder, btoa, atob, CompressionStream, DecompressionStream };
  vm.createContext(ctx);
  for (const file of files) vm.runInContext(readFileSync(new URL(`../public/js/${file}`, import.meta.url), 'utf8'), ctx, { filename: file });
  vm.runInContext('var ShareLink = window.ShareLink;', ctx);
  return ctx.window;
};
const { Ics } = load('ics.js');
const { PlanShare, ShareLink } = load('sharelink.js', 'planshare.js');

const NOW = Date.UTC(2026, 9, 5, 12, 0, 0);
const build = (events, opts = {}) => Ics.build(events, { now: NOW, ...opts });
// Rozbalení zalomených řádků (RFC 5545 3.1) a hodnoty vlastností první/všech událostí.
const unfold = (text) => text.replace(/\r\n /g, '');
const props = (text, name) => unfold(text).split('\r\n').filter((l) => l.startsWith(name + ':') || l.startsWith(name + ';')).map((l) => l.slice(l.indexOf(':') + 1));
const prop = (text, name) => props(text, name)[0];
const utc = (local, tz) => prop(build([{ title: 'x', start: local, tz }]), 'DTSTART');

test('Ics.build: kostra kalendáře, CRLF, povinné vlastnosti a unikátní UID', () => {
  const text = build([{ title: 'A', start: '2026-11-10' }, { title: 'A', start: '2026-11-10' }, { title: 'B', start: '2026-11-11T08:00', tz: 'Europe/Prague' }], { name: 'Cesta: Řím' });
  assert.ok(text.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:'));
  assert.ok(text.endsWith('END:VCALENDAR\r\n'));
  assert.match(text, /\r\nCALSCALE:GREGORIAN\r\n/);
  assert.equal(prop(text, 'X-WR-CALNAME'), 'Cesta: Řím');
  assert.ok(!/[^\r]\n/.test(text) && !/\r[^\n]/.test(text), 'jen CRLF konce řádků');
  assert.equal(props(text, 'BEGIN').filter((v) => v === 'VEVENT').length, 3);
  const uids = props(text, 'UID');
  assert.equal(uids.length, 3);
  assert.equal(new Set(uids).size, 3, 'stejné události dostanou různé UID');
  assert.deepEqual(props(text, 'DTSTAMP'), ['20261005T120000Z', '20261005T120000Z', '20261005T120000Z']);
  // Stejný vstup → stejná UID (opakovaný import událost aktualizuje).
  assert.deepEqual(props(build([{ title: 'A', start: '2026-11-10' }], { name: 'Cesta: Řím' }), 'UID'), uids.slice(0, 1));
  // Neplatné události se vynechají.
  assert.equal(props(build([{ title: 'x', start: '2026-02-30' }, { title: 'y', start: 'zítra' }, null]), 'UID').length, 0);
});

test('Ics.build: escapování \\ ; , a konců řádků, vložení řádků do souboru nejde', () => {
  const text = build([{ title: 'Řím; Neapol, Capri\\Amalfi', start: '2026-11-10', description: 'řádek 1\r\nřádek 2\nřádek 3; a, b\\c', location: 'Via Appia, Roma' }]);
  assert.equal(prop(text, 'SUMMARY'), 'Řím\\; Neapol\\, Capri\\\\Amalfi');
  assert.equal(prop(text, 'DESCRIPTION'), 'řádek 1\\nřádek 2\\nřádek 3\\; a\\, b\\\\c');
  assert.equal(prop(text, 'LOCATION'), 'Via Appia\\, Roma');
  const evil = build([{ title: 'x\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:podvrh', start: '2026-11-10', description: 'a\r\nATTACH:http://zly.example', location: 'b\nX-INJ:1' }]);
  assert.equal(props(evil, 'BEGIN').filter((v) => v === 'VEVENT').length, 1);
  assert.equal(props(evil, 'ATTACH').length + props(evil, 'X-INJ').length, 0);
  // URL jen http(s), bez escapování (je to URI, ne TEXT); jinak vynechána.
  assert.equal(prop(build([{ title: 'x', start: '2026-11-10', url: 'https://ex.example/a?b=1,2;c' }]), 'URL'), 'https://ex.example/a?b=1,2;c');
  assert.equal(props(build([{ title: 'x', start: '2026-11-10', url: 'javascript:alert(1)' }]), 'URL').length, 0);
  assert.equal(props(build([{ title: 'x', start: '2026-11-10', url: 'https://ex.example/a\r\nX:1' }]), 'URL').length, 0);
});

test('Ics.build: dlouhý český text se zalomí po 75 oktetech bez rozbití UTF-8', () => {
  const long = 'Příliš žluťoučký kůň úpěl ďábelské ódy – 🏰🏖️ hrad a pláž. '.repeat(12);
  const title = long.slice(0, long.indexOf('Příliš', 150));
  const text = build([{ title, start: '2026-11-10', description: long + '\n' + long }]);
  const bytes = Buffer.from(text, 'utf8');
  const strict = new TextDecoder('utf-8', { fatal: true });
  let at = 0;
  for (let i = 0; i <= bytes.length - 2; i++) {
    if (bytes[i] !== 13 || bytes[i + 1] !== 10) continue;
    const line = bytes.subarray(at, i);
    assert.ok(line.length <= 75, `řádek má ${line.length} oktetů`);
    assert.doesNotThrow(() => strict.decode(line), 'každý fyzický řádek je samostatně platné UTF-8');
    at = i + 2;
  }
  assert.ok(text.split('\r\n').filter((l) => l.startsWith(' ')).length > 10, 'pokračovací řádky začínají mezerou');
  assert.equal(prop(text, 'SUMMARY'), title.trim());
  assert.equal(prop(text, 'DESCRIPTION'), Ics.escText((long + '\n' + long).trim()));
  // Zkrácení dlouhého názvu nerozpůlí emoji (surrogate pár).
  assert.equal(prop(build([{ title: 'a' + '🏰'.repeat(200), start: '2026-11-10' }]), 'SUMMARY'), 'a' + '🏰'.repeat(124));
  // Hranice přesně: 75 ASCII oktetů se nezalomí, 76 ano.
  assert.equal(Ics.fold('x'.repeat(75)), 'x'.repeat(75));
  assert.equal(Ics.fold('x'.repeat(76)), 'x'.repeat(75) + '\r\n x');
  assert.equal(Ics.fold('č'.repeat(40)), 'č'.repeat(37) + '\r\n ' + 'č'.repeat(3), '2bajtové znaky: 37 × 2 = 74 oktetů');
});

test('Ics.build: celodenní události mají DTEND den po posledním dni (exkluzivně)', () => {
  const text = build([
    { title: 'Jeden den', start: '2026-11-10' },
    { title: 'Přes Silvestra', start: '2026-12-30', end: '2027-01-02' },
    { title: 'Přestupný rok', start: '2028-02-27', end: '2028-02-28' },
    { title: 'Konec před začátkem', start: '2026-11-10', end: '2026-11-01' },
  ]);
  assert.deepEqual(props(text, 'DTSTART'), ['20261110', '20261230', '20280227', '20261110']);
  assert.deepEqual(props(text, 'DTEND'), ['20261111', '20270103', '20280229', '20261111']);
  assert.ok(unfold(text).includes('DTSTART;VALUE=DATE:20261110\r\nDTEND;VALUE=DATE:20261111'));
  assert.equal(props(text, 'TRANSP').length, 4, 'celodenní bloky neblokují čas');
});

test('Ics: časové zóny → UTC (Praha v zimě i v létě, přechody času, mimoevropské zóny)', () => {
  assert.equal(Ics.tzOffset('Europe/Prague', Date.UTC(2026, 0, 15, 12)), 60);
  assert.equal(Ics.tzOffset('Europe/Prague', Date.UTC(2026, 6, 15, 12)), 120);
  assert.equal(Ics.tzOffset('Asia/Kolkata', Date.UTC(2026, 6, 15, 12)), 330);
  assert.equal(Ics.tzOffset('Neplatna/Zona', Date.UTC(2026, 6, 15, 12)), null);
  assert.equal(utc('2026-01-15T10:00', 'Europe/Prague'), '20260115T090000Z', 'zima: SEČ +1');
  assert.equal(utc('2026-07-15T10:00', 'Europe/Prague'), '20260715T080000Z', 'léto: SELČ +2');
  // Den změny času (29. 3. a 25. 10. 2026): před, v mezeře, po; dvojznačná hodina = první výskyt.
  assert.equal(utc('2026-03-29T01:30', 'Europe/Prague'), '20260329T003000Z');
  assert.equal(utc('2026-03-29T02:30', 'Europe/Prague'), '20260329T013000Z', 'neexistující čas → posun před změnou (= 3:30 SELČ)');
  assert.equal(utc('2026-03-29T10:00', 'Europe/Prague'), '20260329T080000Z');
  assert.equal(utc('2026-10-25T02:30', 'Europe/Prague'), '20261025T003000Z', 'dvakrát → první výskyt (SELČ)');
  assert.equal(utc('2026-10-25T10:00', 'Europe/Prague'), '20261025T090000Z');
  // Příklady přímo z RFC 5545 3.3.5 (New York 2007).
  assert.equal(utc('2007-03-11T02:30', 'America/New_York'), '20070311T073000Z');
  assert.equal(utc('2007-11-04T01:30', 'America/New_York'), '20071104T053000Z');
  assert.equal(utc('2026-07-04T18:00', 'America/New_York'), '20260704T220000Z');
  assert.equal(utc('2026-01-10T09:00', 'Asia/Tokyo'), '20260110T000000Z');
  assert.equal(utc('2026-05-01T10:00', 'Asia/Kolkata'), '20260501T043000Z');
  assert.equal(utc('2026-01-10T09:00', 'Australia/Sydney'), '20260109T220000Z', 'jižní polokoule: letní čas v lednu, předchozí den v UTC');
  assert.equal(utc('2026-07-10T09:00', 'Australia/Sydney'), '20260709T230000Z');
});

test('Ics: let přes časová pásma, plovoucí čas bez zóny, délka místo chybějícího příletu', () => {
  const fl = Ics.flightEvent({ from: 'PRG', to: 'DXB', date: '2026-11-10', dep: '2026-11-10T22:00', arr: '2026-11-11T06:45', fromTz: 'Europe/Prague', toTz: 'Asia/Dubai', carrier: 'flydubai', flightNo: 'FZ1786' }, { url: 'https://kiwi.example/x', note: 'Cesta do Dubaje' });
  const text = build([fl]);
  assert.equal(prop(text, 'DTSTART'), '20261110T210000Z');
  assert.equal(prop(text, 'DTEND'), '20261111T024500Z');
  assert.equal(prop(text, 'SUMMARY'), '✈️ PRG → DXB · flydubai FZ1786');
  assert.match(prop(text, 'DESCRIPTION'), /Odlet 22:00 místního času \(PRG\)\\nPřílet 06:45 místního času \(DXB\)\\nCesta do Dubaje/);
  assert.match(prop(text, 'DESCRIPTION'), /https:\/\/kiwi\.example\/x$/, 'odkaz i v popisu (Google URL nezobrazí)');
  // Zóna cíle neznámá → konec z délky letu, ne z místního času v jiné zóně.
  const noTo = build([Ics.flightEvent({ from: 'PRG', to: 'DXB', date: '2026-11-10', dep: '2026-11-10T22:00', arr: '2026-11-11T06:45', fromTz: 'Europe/Prague', durationMin: 345 })]);
  assert.equal(prop(noTo, 'DTEND'), '20261111T024500Z');
  // Starý let bez zón: plovoucí odlet, konec z délky letu (místní přílet je v jiné zóně).
  const noTz = build([Ics.flightEvent({ from: 'PRG', to: 'DXB', date: '2026-11-10', dep: '2026-11-10T22:00', arr: '2026-11-11T06:45', durationMin: 345 })]);
  assert.deepEqual([prop(noTz, 'DTSTART'), prop(noTz, 'DTEND')], ['20261110T220000', '20261111T034500']);
  // Bez zón → plovoucí čas (bez Z), konec podle místních časů.
  const floating = build([{ title: 'x', start: '2026-01-15T10:00', end: '2026-01-15T12:30' }, { title: 'y', start: '2026-01-15T10:00', tz: 'Mars/Olympus' }, { title: 'z', start: '2026-01-15T10:00', tz: 'Europe/Prague"; X' }]);
  assert.deepEqual(props(floating, 'DTSTART'), ['20260115T100000', '20260115T100000', '20260115T100000']);
  assert.deepEqual(props(floating, 'DTEND'), ['20260115T123000', '20260115T110000', '20260115T110000']);
  // Let s přestupem z cache bez známého příletu: žádný vymyšlený přílet, v popisu upozornění
  const unk = prop(build([Ics.flightEvent({ from: 'PRG', to: 'BCN', date: '2026-10-30', dep: '2026-10-30T20:30', arr: null, arrUnknown: true, fromTz: 'Europe/Prague', toTz: 'Europe/Madrid' })]), 'DESCRIPTION');
  assert.match(unk, /^Odlet 20:30 místního času \(PRG\)\\nPřílet neznámý \(let s přestupem z cache\) – čas příletu ověř v rezervaci\.$/);
  // Let bez času odletu → celodenní událost v den letu.
  const allDay = build([Ics.flightEvent({ from: 'VIE', to: 'BCN', date: '2026-11-10', dep: null })]);
  assert.equal(prop(allDay, 'DTSTART'), '20261110');
  assert.ok(unfold(allDay).includes('DTSTART;VALUE=DATE:'));
  // Krátká událost s délkou (vyzvednutí auta).
  assert.equal(prop(build([{ title: 'auto', start: '2026-07-01T09:45', tz: 'Europe/Rome', durationMin: 30 }]), 'DTEND'), '20260701T081500Z');
});

test('Ics.gcalUrl: odkaz do Google Kalendáře (celodenní exkluzivně, časy v UTC)', () => {
  const u = new URL(Ics.gcalUrl({ title: '🧳 Řím', start: '2026-11-10', end: '2026-11-14', description: 'Program', location: 'Řím', url: 'https://ex.example/r' }));
  assert.equal(u.origin + u.pathname, 'https://calendar.google.com/calendar/render');
  assert.equal(u.searchParams.get('action'), 'TEMPLATE');
  assert.equal(u.searchParams.get('text'), '🧳 Řím');
  assert.equal(u.searchParams.get('dates'), '20261110/20261115');
  assert.equal(u.searchParams.get('details'), 'Program\n\nhttps://ex.example/r');
  assert.equal(u.searchParams.get('location'), 'Řím');
  const t = new URL(Ics.gcalUrl({ title: 'Let', start: '2026-07-15T10:00', end: '2026-07-15T12:00', tz: 'Europe/Prague' }));
  assert.equal(t.searchParams.get('dates'), '20260715T080000Z/20260715T100000Z');
  assert.equal(Ics.gcalUrl({ title: 'x', start: 'nikdy' }), null);
  // Zkrácený popis nerozpůlí emoji (v adrese by z půlky byl znak �).
  const long = new URL(Ics.gcalUrl({ title: 'x', start: '2026-11-10', description: 'a' + '🏰'.repeat(900) })).searchParams.get('details');
  assert.equal(long, 'a' + '🏰'.repeat(749));
});

test('PlanShare: odkaz na plán – tam a zpět beze ztráty (čeština, emoji, lety), zkomprimovaný i dřívější', async () => {
  const trip = {
    name: 'Léto v Portugalsku 🌞', dest: 'Lisabon', iso: 'PT', start: '2026-07-01', end: '2026-07-05', pax: '2', budget: '42000',
    flight: 'PRG→LIS 1.7. 06:30 (Ryanair)', days: { '2026-07-01': ['Belém', 'Tramvaj 28'], '2026-07-02': ['Sintra – Pena'] },
    legs: [{ from: 'PRG', to: 'LIS', date: '2026-07-01', dep: '2026-07-01T06:30', arr: '2026-07-01T09:05', fromTz: 'Europe/Prague', toTz: 'Europe/Lisbon', carrier: 'Ryanair', flightNo: 'FR123', durationMin: 215 }],
    checklist: [{ t: 'Pas / OP', done: true }, { t: 'Opalovací krém', done: false }], notes: 'Rezervace č. 123\nDruhý řádek',
  };
  // nový odkaz: JSON plánu zkomprimovaný (deflate-raw) se značkou „z“ – kratší než dřívější base64url JSON
  const json = PlanShare.json(trip);
  const payload = await ShareLink.pack(json);
  assert.match(payload, /^z[A-Za-z0-9_-]+$/);
  assert.equal(inflateRawSync(Buffer.from(payload.slice(1), 'base64url')).toString('utf8'), json, 'standardní deflate-raw');
  const legacy = PlanShare.encode(trip);
  assert.ok(payload.length < legacy.length * 0.8, `${payload.length} vs ${legacy.length} znaků`);
  const p = await PlanShare.fromHash('#plan=' + payload);
  assert.deepEqual(JSON.parse(JSON.stringify(p)), JSON.parse(JSON.stringify(await PlanShare.fromHash('#plan=' + legacy))), 'dřívější odkaz dá totéž');
  assert.deepEqual(JSON.parse(JSON.stringify(p)), JSON.parse(JSON.stringify(PlanShare.decode(legacy))));
  assert.equal(p.name, trip.name);
  assert.equal(p.dest, 'Lisabon');
  assert.equal(p.iso, 'PT');
  assert.deepEqual([p.start, p.end, p.pax, p.budget], ['2026-07-01', '2026-07-05', '2', '42000']);
  assert.deepEqual(JSON.parse(JSON.stringify(p.days)), trip.days);
  assert.equal(p.legs[0].toTz, 'Europe/Lisbon');
  assert.equal(p.legs[0].dep, '2026-07-01T06:30');
  assert.deepEqual(JSON.parse(JSON.stringify(p.checklist)), [{ t: 'Pas / OP', done: true }, { t: 'Opalovací krém', done: false }], 'i s odškrtnutím');
  assert.equal(p.notes, trip.notes);
  assert.equal(await PlanShare.fromHash('#planner'), null);
  assert.equal(await PlanShare.fromHash('#trip=abc'), null);
  // Plán bez dat a bez letů je platný (jen se nedá exportovat do kalendáře).
  const bare = PlanShare.decode(PlanShare.encode({ name: 'Někdy', dest: 'Tatry' }));
  assert.deepEqual([bare.start, bare.end, bare.legs, bare.flight], ['', '', undefined, null]);
});

test('PlanShare: škodlivý odkaz – texty bez HTML/JS, data ověřená, pole omezená', async () => {
  const enc = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
  const xss = '<img src=x onerror=alert(1)>"\'`\\';
  const evil = {
    v: 1, name: xss + 'Výlet', dest: "x');alert(1);//", iso: '__proto__', start: '2026-07-01', end: '2026-13-45',
    pax: '1<script>', budget: '9e99', flight: '<b>let</b>\u202egnp.exe', notes: 'a'.repeat(10000),
    days: { constructor: ['y'], '2026-07-01': ['<script>alert(1)</script>', { toString: 1 }, 5, ''], '2026-02-30': ['neplatný den'], '2026-08-15': ['mimo termín cesty'], ...Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`2027-01-${String(i % 28 + 1).padStart(2, '0')}x${i}`, ['z']])) },
    checklist: Array.from({ length: 500 }, (_, i) => ({ t: `<i>${i}</i>`, done: true })),
    legs: [{ from: 'PRG"', to: 'LIS', date: '2026-07-01' }, { from: 'PRG', to: 'LIS', date: '2026-07-01', dep: '2026-07-01T25:99', fromTz: 'Europe/Prague"><script>', toTz: '../../etc' }, ...Array(10).fill({ from: 'AAA', to: 'BBB', date: '2026-07-01' })],
    onload: 'alert(1)', constructor: { prototype: { polluted: true } },
  };
  // „__proto__“ jako vlastní klíč (JSON.parse ho tak vytvoří) – nesmí se stát prototypem.
  const json = JSON.stringify(evil).replace('"days":{', '"__proto__":{"polluted":true},"days":{"__proto__":["x"],');
  const p = PlanShare.decode(enc(json));
  const strings = [];
  (function walk(x) { if (typeof x === 'string') strings.push(x); else if (x && typeof x === 'object') Object.values(x).forEach(walk); })(p);
  assert.ok(strings.length > 80);
  for (const s of strings) assert.ok(!/[<>"'`\u202a-\u202e\u2066-\u2069]/.test(s), `nebezpečný znak v „${s.slice(0, 40)}“`);
  assert.equal(p.name, 'img src=x onerror=alert(1)’\\Výlet', 'apostrof jen typografický');
  assert.equal(p.dest, 'x’);alert(1);//');
  assert.equal(p.iso, null);
  assert.deepEqual([p.start, p.end], ['2026-07-01', ''], 'neplatný konec zahozen');
  assert.equal(p.pax, '2');
  assert.equal(p.budget, '100000000');
  assert.equal(p.flight, 'blet/bgnp.exe', 'bez HTML a znaků pro obrácení textu');
  assert.equal(p.notes.length, 3000);
  assert.deepEqual(Object.getOwnPropertyNames(p.days), ['2026-07-01'], 'jen platné dny v termínu cesty');
  assert.deepEqual([...p.days['2026-07-01']], ['scriptalert(1)/script', '5']);
  assert.ok(!Array.isArray(Object.getPrototypeOf(p.days)) && p.days.length === undefined, 'prototyp days nepodvržen');
  assert.equal(p.polluted, undefined);
  assert.equal({}.polluted, undefined);
  assert.equal(p.checklist.length, 80);
  assert.ok(p.checklist.every((x) => typeof x.done === 'boolean' && !/[<>]/.test(x.t)));
  assert.equal(p.legs.length, 3, 'nejvýš 4 lety, neplatné vyřazené');
  assert.deepEqual([p.legs[0].from, p.legs[0].dep, p.legs[0].fromTz, p.legs[0].toTz], ['PRG', null, null, null]);
  assert.deepEqual(Object.keys(p).sort(), ['budget', 'checklist', 'days', 'dest', 'end', 'flight', 'iso', 'legs', 'name', 'notes', 'pax', 'start']);
  // Podvržené datum začátku (jde do onclick v plánovači) → bez termínu, tedy i bez aktivit.
  const noDate = PlanShare.decode(enc({ start: "2026-07-01');alert(1)//", end: '2026-07-03', days: { '2026-07-01': ['x'] } }));
  assert.deepEqual([noDate.start, noDate.end, Object.keys(noDate.days).length], ['', '', 0]);
  // Konec před začátkem a nesmyslně dlouhé cesty se zahodí.
  assert.equal(PlanShare.decode(enc({ start: '2026-07-05', end: '2026-07-01' })).end, '');
  assert.equal(PlanShare.decode(enc({ start: '2026-07-05', end: '2030-07-01' })).end, '');
  // Poškozené a podvržené odkazy.
  for (const bad of ['', '!!!', 'a'.repeat(200001), enc([1, 2]), enc('text'), enc(null), enc({ v: 2, name: 'x' }), Buffer.from('{"name":').toString('base64url'), Buffer.from([0xff, 0xfe, 0x7b]).toString('base64url')]) {
    assert.throws(() => PlanShare.decode(bad), undefined, `má selhat: ${bad.slice(0, 30)}`);
  }
  await assert.rejects(PlanShare.fromHash('#plan=<script>'));
  // totéž ve zkomprimovaném odkazu: stejné pročištění, poškozená komprimovaná data → zamítnutí
  const z = (text) => 'z' + deflateRawSync(Buffer.from(text)).toString('base64url');
  assert.deepEqual(JSON.parse(JSON.stringify(await PlanShare.unpack(z(json)))), JSON.parse(JSON.stringify(p)));
  for (const bad of ['z', 'zzzz', z('{"name":'), z('[1,2]'), z(JSON.stringify({ v: 2 })), 'z' + 'A'.repeat(200001)]) {
    await assert.rejects(PlanShare.unpack(bad), undefined, `má selhat: ${bad.slice(0, 30)}`);
  }
});

test('PlanShare: odškrtnutí „Sbaleno“ – maska v odkazu tam a zpět, starší odkaz bez ní, podvržená maska nic neodškrtne', () => {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const raw = (payload) => JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  const plain = (x) => JSON.parse(JSON.stringify(x));
  const list = Array.from({ length: 80 }, (_, i) => ({ t: `Věc ${i + 1}`, done: i % 3 === 0 || i === 79 }));
  const trip = { name: 'Sbaleno', dest: 'Lisabon', start: '2026-07-01', end: '2026-07-05', checklist: list };
  const payload = PlanShare.encode(trip);
  const r = raw(payload);
  // formát: verze 1 jako dosud, texty jako dosud, odškrtnutí ve volitelném poli done (4 položky na znak)
  assert.equal(r.v, 1);
  assert.deepEqual(r.checklist, list.map((x) => x.t));
  assert.equal(r.done, '9249249249249249249' + '3');
  assert.deepEqual(plain(PlanShare.decode(payload).checklist), list);
  // malá režie: 80 položek = 20 znaků masky, odkaz delší jen o pár desítek znaků
  const none = PlanShare.encode({ ...trip, checklist: list.map((x) => ({ ...x, done: false })) });
  assert.equal(raw(none).done, undefined, 'nic odškrtnuté = bez pole');
  assert.ok(payload.length - none.length <= 40, `+${payload.length - none.length} znaků`);
  // koncové neodškrtnuté položky masku neprodlužují
  assert.equal(raw(PlanShare.encode({ ...trip, checklist: [{ t: 'a', done: true }, ...Array.from({ length: 30 }, (_, i) => ({ t: `b${i}`, done: false }))] })).done, '8');
  // starší odkaz (bez masky): texty bez odškrtnutí, nic se nerozbije
  const old = enc({ v: 1, name: 'Starý plán', start: '2026-07-01', end: '2026-07-03', checklist: ['Pas / OP', 'Opalovací krém'], notes: '' });
  assert.deepEqual(plain(PlanShare.decode(old).checklist), [{ t: 'Pas / OP', done: false }, { t: 'Opalovací krém', done: false }]);
  assert.equal(PlanShare.decode(old).name, 'Starý plán');
  // podvržená nebo poškozená maska → nic odškrtnuté, žádná výjimka ani pole navíc
  for (const done of ['zz', 'F', 'f'.repeat(21), '<script>', '', 7, true, ['f'], { 0: 'f' }, null]) {
    const p = PlanShare.decode(enc({ v: 1, checklist: ['a', 'b', 'c'], done }));
    assert.ok(p.checklist.every((x) => x.done === false), JSON.stringify(done));
    assert.equal(p.done, undefined);
  }
  // položka jako objekt: odškrtnutá jen s done === true
  assert.deepEqual(plain(PlanShare.decode(enc({ v: 1, checklist: [{ t: 'a', done: 'true' }, { t: 'b', done: 1 }, { t: 'c', done: true }] })).checklist).map((x) => x.done), [false, false, true]);
  // maska patří k pořadí v odkazu – vyřazená (prázdná) položka neposune odškrtnutí ostatních
  assert.deepEqual(plain(PlanShare.decode(enc({ v: 1, checklist: ['a', '<>', 'c', 'd'], done: '3' })).checklist), [{ t: 'a', done: false }, { t: 'c', done: true }, { t: 'd', done: true }]);
});

test('Plánovač: dny cesty přes změnu času – žádný den dvakrát ani chybějící (export po dnech)', () => {
  // dateRange z app.js (celý app.js potřebuje DOM) v místní zóně prohlížeče uživatele.
  const src = readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8').match(/^function dateRange\(.*$/m)[0];
  const days = (a, n) => Array.from({ length: n }, (_, i) => new Date(Date.parse(a) + i * 864e5).toISOString().slice(0, 10));
  const tz0 = process.env.TZ;
  try {
    for (const tz of ['Europe/Prague', 'America/New_York', 'Australia/Sydney', 'UTC']) {
      process.env.TZ = tz;
      const dateRange = vm.runInNewContext(src + '; dateRange');
      for (const [a, b, n] of [['2026-03-27', '2026-03-31', 5], ['2026-03-06', '2026-03-10', 5], ['2026-10-02', '2026-10-06', 5], ['2026-10-23', '2026-10-27', 5], ['2026-07-01', '2026-07-01', 1]]) {
        assert.deepEqual([...dateRange(a, b)], days(a, n), `${tz}: ${a} – ${b}`);
      }
      assert.equal(dateRange('2026-01-01', '2026-12-31').length, 31, 'nejvýš 31 dní');
    }
  } finally {
    if (tz0 === undefined) delete process.env.TZ; else process.env.TZ = tz0;
  }
});

test('index.html: ics.js, sharelink.js a planshare.js se načtou před skripty, které je používají', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const at = (f) => html.indexOf(`<script src="js/${f}"></script>`);
  assert.ok(at('sharelink.js') > 0 && at('sharelink.js') < at('planshare.js'), 'sharelink.js před planshare.js');
  for (const f of ['ics.js', 'sharelink.js', 'planshare.js']) {
    assert.ok(at(f) > 0, f);
    for (const user of ['app.js', 'trip.js']) assert.ok(at(f) < at(user), `${f} před ${user}`);
  }
});

test('Ics.checkin: online check-in Ryanair / Wizz Air 24 h před odletem (i přes půlnoc a přelom měsíce), jiní dopravci nic', () => {
  const ry = Ics.checkin({ carrier: 'FR', dep: '2026-11-01T06:15', from: 'BRQ', to: 'STN' });
  assert.deepEqual(JSON.parse(JSON.stringify(ry)), { airline: 'Ryanair', closeH: 2, fee: '55 €', open: '2026-10-31T06:15' });
  assert.equal(Ics.checkin({ carrier: 'Wizz Air', dep: '2026-03-01T22:40' }).open, '2026-02-28T22:40');
  assert.equal(Ics.checkin({ carrier: 'W6', dep: '2026-03-01T22:40' }).closeH, 3);
  assert.equal(Ics.checkin({ carrier: 'Malta Air', dep: '2026-03-01T10:00' }).airline, 'Ryanair');
  assert.equal(Ics.checkin({ carrier: 'OK', dep: '2026-03-01T10:00' }), null, 'ČSA');
  assert.equal(Ics.checkin({ carrier: 'easyJet', dep: '2026-03-01T10:00' }), null);
  assert.equal(Ics.checkin({ carrier: 'FR', dep: null, date: '2026-03-01' }), null, 'bez času odletu');
  // změna času 25. 10. 2026 ve 3:00: odlet 10:00 SEČ = 24 h předtím 11:00 SELČ; bez pásma den předem ve stejný čas
  assert.equal(Ics.checkin({ carrier: 'FR', dep: '2026-10-25T10:00', fromTz: 'Europe/Prague' }).open, '2026-10-24T11:00');
  assert.equal(Ics.checkin({ carrier: 'FR', dep: '2026-03-29T10:00', fromTz: 'Europe/Prague' }).open, '2026-03-28T09:00', 'jarní změna');
  assert.equal(Ics.checkin({ carrier: 'FR', dep: '2026-10-25T10:00' }).open, '2026-10-24T10:00');
  assert.equal(Ics.checkin({ carrier: 'FR', dep: '2026-11-10T10:00', fromTz: 'Europe/Prague' }).open, '2026-11-09T10:00');
  // poplatek za odbavení na letišti u Ryanairu podle země odletu
  assert.equal(Ics.checkin({ carrier: 'FR', dep: '2026-11-10T10:00', fromTz: 'Europe/Vienna' }).fee, '40 €');
  assert.equal(Ics.checkin({ carrier: 'FR', dep: '2026-11-10T10:00', fromTz: 'Atlantic/Canary' }).fee, '30 €');
  assert.equal(Ics.checkin({ carrier: 'W6', dep: '2026-11-10T10:00', fromTz: 'Europe/Vienna' }).fee, '40–50 €');
  const ev = Ics.checkinEvent({ carrier: 'FR', dep: '2026-11-01T06:15', from: 'BRQ', to: 'STN', fromTz: 'Europe/Prague' });
  assert.match(ev.title, /Online check-in Ryanair · BRQ → STN/);
  const ics = build([ev]);
  assert.equal(prop(ics, 'DTSTART'), '20261031T051500Z', '6:15 v Brně (CET) den předem');
  assert.match(unfold(ics), /zavírá 2 h před odletem/);
});
