// Jeden odkaz na zpáteční let (Ryanair, Wizz Air): server (search.js roundTripUrl) ho dá cestě, když jsou oba lety
// v téže měně – cena je pak stejná jako za dvě letenky; z Prahy (tam Kč, zpět eura) zůstanou dva odkazy a jedna
// rezervace je jen volba pod nimi (SearchHelp.roundBookUrl – z odkazu na let tam, stejný formát jako server).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { makeLeg, makeTrip } from '../server/lib/fares.js';
import { roundTripUrl } from '../server/lib/search.js';
import { bookingUrl as ryanairUrl } from '../server/providers/ryanair.js';
import { bookingUrl as wizzairUrl } from '../server/providers/wizzair.js';

const ctx = { window: {}, URL };
vm.runInNewContext(readFileSync(new URL('../public/js/searchhelp.js', import.meta.url), 'utf8'), ctx);
const H = ctx.window.SearchHelp;

const PAX = { adults: 2, children: 1, infants: 1 };
const URLS = { ryanair: ryanairUrl, wizzair: wizzairUrl };
// let jako od zdroje: odkaz na jednosměrnou letenku s cestujícími, cena v měně země odletu
const leg = (provider, from, to, date, price, currency) => makeLeg({
  provider, carrier: provider === 'wizzair' ? 'W6' : 'FR', from, to, dep: `${date}T10:00:00`, price, currency,
  bookUrl: URLS[provider] ? URLS[provider]({ from, to, dateOut: date, ...PAX }) : `https://www.kiwi.com/cz/?${from}${to}`,
});

test('server: oba lety v eurech (z Vídně) → jeden odkaz na zpáteční let s cestujícími, jako bookingUrl s datem zpět', () => {
  for (const p of ['wizzair', 'ryanair']) {
    const t = makeTrip(leg(p, 'VIE', 'BCN', '2026-12-12', 30, 'EUR'), leg(p, 'BCN', 'VIE', '2026-12-20', 25, 'EUR'));
    assert.equal(t.out.siteCur, 'EUR');
    assert.equal(roundTripUrl(t, PAX), URLS[p]({ from: 'VIE', to: 'BCN', dateOut: '2026-12-12', dateIn: '2026-12-20', ...PAX }), p);
  }
  // výlet na den: zpět týž den
  const day = makeTrip(leg('wizzair', 'VIE', 'BCN', '2026-12-12', 30, 'EUR'), leg('wizzair', 'BCN', 'VIE', '2026-12-12', 25, 'EUR'));
  assert.match(roundTripUrl(day, PAX), /\/VIE\/BCN\/2026-12-12\/2026-12-12\/2\/1\/1\//);
});

test('server: z Prahy (tam Kč, zpět eura), dvě aerolinky, návrat jinam nebo Kiwi → bez jednoho odkazu', () => {
  const prg = makeTrip(leg('wizzair', 'PRG', 'TAT', '2026-12-12', 639, 'CZK'), leg('wizzair', 'TAT', 'PRG', '2026-12-20', 22.99, 'EUR'));
  assert.deepEqual([prg.out.siteCur, prg.back.siteCur], ['CZK', 'EUR']);
  assert.equal(roundTripUrl(prg, PAX), null, 'let zpět by aerolinka přepočetla svým kurzem – cena by neseděla');
  const mix = makeTrip(leg('wizzair', 'VIE', 'BCN', '2026-12-12', 30, 'EUR'), leg('ryanair', 'BCN', 'VIE', '2026-12-20', 25, 'EUR'));
  assert.equal(roundTripUrl(mix, PAX), null);
  const jaw = makeTrip(leg('ryanair', 'VIE', 'BCN', '2026-12-12', 30, 'EUR'), leg('ryanair', 'BCN', 'BTS', '2026-12-20', 25, 'EUR'));
  assert.equal(roundTripUrl(jaw, PAX), null, 'návrat na jiné letiště');
  const kiwi = makeTrip(leg('kiwi', 'VIE', 'BCN', '2026-12-12', 30, 'EUR'), leg('kiwi', 'BCN', 'VIE', '2026-12-20', 25, 'EUR'));
  assert.equal(roundTripUrl(kiwi, PAX), null);
  assert.equal(roundTripUrl(makeTrip(leg('ryanair', 'VIE', 'BCN', '2026-12-12', 30, 'EUR')), PAX), null, 'jen tam');
});

test('aplikace: obojí v jedné rezervaci z odkazu na let tam – stejný odkaz jako server (Wizz Air i Ryanair, s dětmi)', () => {
  for (const p of ['wizzair', 'ryanair']) {
    const t = makeTrip(leg(p, 'PRG', 'TAT', '2026-12-12', 639, 'CZK'), leg(p, 'TAT', 'PRG', '2026-12-20', 22.99, 'EUR'));
    assert.equal(H.roundBookUrl(t), URLS[p]({ from: 'PRG', to: 'TAT', dateOut: '2026-12-12', dateIn: '2026-12-20', ...PAX }), p);
  }
  // odkaz Peter ověřil v aplikaci Wizz Air: oba lety, zpáteční v Kč
  const one = makeTrip(leg('wizzair', 'PRG', 'TAT', '2026-12-12', 639, 'CZK'), leg('wizzair', 'TAT', 'PRG', '2026-12-20', 22.99, 'EUR'));
  one.out.bookUrl = wizzairUrl({ from: 'PRG', to: 'TAT', dateOut: '2026-12-12' });
  assert.equal(H.roundBookUrl(one), 'https://www.wizzair.com/cs-cz/booking/select-flight/PRG/TAT/2026-12-12/2026-12-20/1/0/0/null');
  const mix = makeTrip(leg('wizzair', 'PRG', 'BCN', '2026-12-12', 900, 'CZK'), leg('ryanair', 'BCN', 'PRG', '2026-12-20', 25, 'EUR'));
  assert.equal(H.roundBookUrl(mix), null);
  const jaw = makeTrip(leg('wizzair', 'PRG', 'BCN', '2026-12-12', 900, 'CZK'), leg('wizzair', 'BCN', 'VIE', '2026-12-20', 25, 'EUR'));
  assert.equal(H.roundBookUrl(jaw), null);
  // odkaz, který už je zpáteční (Ryanair isReturn=true), se nepřepisuje
  const rt = makeTrip(leg('ryanair', 'PRG', 'TAT', '2026-12-12', 639, 'CZK'), leg('ryanair', 'TAT', 'PRG', '2026-12-20', 22.99, 'EUR'));
  rt.out.bookUrl = ryanairUrl({ from: 'PRG', to: 'TAT', dateOut: '2026-12-12', dateIn: '2026-12-19' });
  assert.equal(H.roundBookUrl(rt), null);
  assert.equal(H.roundBookUrl({ out: { provider: 'wizzair', from: 'PRG', to: 'TAT', date: '2026-12-12', bookUrl: 'x' } }), null, 'jen tam');
});

test('aplikace: dvojice složená v prohlížeči ve stejné měně → jedno tlačítko na zpáteční let, bez věty o přepočtu', () => {
  const src = readFileSync(new URL('../public/js/flights.js', import.meta.url), 'utf8');
  const a = src.indexOf('  // Dvojice složená v prohlížeči'), b = src.indexOf('  // S dětmi pod tlačítky Koupit');
  const ctx2 = { URL, Intl, SearchHelp: H, lastResult: { fx: { eurCzk: 24.3 } }, esc: (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
    safeUrl: (u) => u, provColor: () => '#000', shopName: (p) => ({ wizzair: 'Wizz Air', ryanair: 'Ryanair' })[p] || p };
  vm.runInNewContext(`${src.slice(a, b)}\nthis.bookButtons = bookButtons; this.buyNote = buyNote;`, ctx2);
  for (const p of ['ryanair', 'wizzair']) {
    // složená v prohlížeči (composeTrip) – bez bookUrl
    const vie = { ...makeTrip(leg(p, 'VIE', 'BCN', '2026-12-12', 30, 'EUR'), leg(p, 'BCN', 'VIE', '2026-12-20', 25.5, 'EUR')), bookUrl: null };
    const html = ctx2.bookButtons(vie);
    assert.equal((html.match(/<a /g) || []).length, 1, `${p}: jedno tlačítko`);
    assert.ok(html.includes(URLS[p]({ from: 'VIE', to: 'BCN', dateOut: '2026-12-12', dateIn: '2026-12-20', ...PAX }).replace(/&/g, '&amp;')), p);
    const note = ctx2.buyNote(vie);
    assert.match(note, /ukáže cenu v EUR – ~55,50\s€\/os\. tam i zpět/);
    assert.doesNotMatch(note, /přepočte/, 've stejné měně se nic nepřepočítává');
    // z Prahy (tam Kč, zpět eura): dvě tlačítka a jedna rezervace jako volba s přepočtem
    const prg = { ...makeTrip(leg(p, 'PRG', 'TAT', '2026-12-12', 639, 'CZK'), leg(p, 'TAT', 'PRG', '2026-12-20', 22.99, 'EUR')), bookUrl: null };
    assert.equal((ctx2.bookButtons(prg).match(/<a /g) || []).length, 2);
    assert.match(ctx2.buyNote(prg), /Obojí v jedné rezervaci: <a [^>]+>[^<]+ ↗<\/a> – celé v Kč, let zpět ale aerolinka přepočte svým kurzem/);
  }
});
