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
