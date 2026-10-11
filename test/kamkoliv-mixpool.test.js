// Kamkoliv: kombinace aerolinek a letišť (search.js, mix*) bez držení všech letů do konce hledání – lety po cílech,
// nejlevnější let trasy a dne, průběžné prořezání (mixPrune) a složení cíle, jakmile do něj nic nepřijde. Výsledek musí
// být stejný jako ze všech letů najednou (limits.mixWhole) a držených letů musí být zlomek nabídnutých (res.stats.mix).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stubFetch, ymdPlus } from './helpers.js';

process.env.ATLAS_MOCK = '1';
const { search } = await import('../server/lib/search.js');
const { makeMock, mockProviders } = await import('../server/providers/mock.js');
const { makeLeg } = await import('../server/lib/fares.js');

const plain = (v) => JSON.parse(JSON.stringify(v));
const groupsOf = (r) => plain(r.groups);
const isMix = (t) => t.back && (t.provider === 'mix' || t.back.from !== t.out.to || t.back.to !== t.out.from);
const third = makeMock({ id: 'demo-three', name: 'Demo Three', code: 'D3', seed: 'c', share: 0.2 });
const DEMO = [...mockProviders, third];
const D = (n) => ymdPlus(n);

async function both(raw, providers = DEMO) {
  const stub = stubFetch(() => ({ status: 404, body: {} })); // kurzy: orientační
  try {
    const a = await search({ ...raw, noPartial: true }, () => {}, { providers });
    const b = await search({ ...raw, noPartial: true }, () => {}, { providers, limits: { mixWhole: true } });
    return { a, b };
  } finally {
    stub.restore();
  }
}

test('Kamkoliv: kombinace s průběžným prořezáním a skládáním po cílech = ze všech letů najednou (i pořadí při shodě ceny)', async () => {
  const cases = [
    ['2–6 nocí, návrat jinam', { from: ['ap:BRQ'], radiusKm: 150, dateFrom: D(20), dateTo: D(45), trip: 'return', nightsMin: 2, nightsMax: 6, adults: 1 }],
    ['výlety 0–2 noci (stihne návrat?)', { from: ['ap:VIE'], radiusKm: 60, dateFrom: D(20), dateTo: D(40), trip: 'return', nightsMin: 0, nightsMax: 2, adults: 1 }],
    ['autem 1–3 noci (parkování podle nocí)', { from: ['ap:BRQ'], radiusKm: 150, dateFrom: D(20), dateTo: D(40), trip: 'return', nightsMin: 1, nightsMax: 3, groundMode: 'car', adults: 2 }],
    ['bez návratu jinam, jen přímé, zavazadla', { from: ['ap:BRQ'], radiusKm: 150, dateFrom: D(20), dateTo: D(45), trip: 'return', nightsMin: 3, nightsMax: 8, openJaw: false, directOnly: true, bags: 'cabin', adults: 1 }],
    ['dny v týdnu', { from: ['ap:BRQ'], radiusKm: 150, dateFrom: D(20), dateTo: D(60), trip: 'return', nightsMin: 2, nightsMax: 4, outDays: [4, 5], backDays: [0, 1], adults: 1 }],
    ['přesná data ± 1', { from: ['ap:BRQ'], radiusKm: 150, exactOut: D(30), exactBack: D(34), flexDays: 1, trip: 'return', adults: 1 }],
  ];
  for (const [name, q] of cases) {
    const { a, b } = await both(q);
    assert.deepEqual(groupsOf(a), groupsOf(b), name);
    assert.ok(a.groups.some((g) => g.options.some(isMix)), `${name}: kombinace jsou`);
    const m = a.stats.mix;
    assert.ok(m.legs > 0 && m.peak <= b.stats.mix.peak, `${name}: drží ${m.peak}, všechny lety najednou ${b.stats.mix.peak}`);
  }
});

test('Kamkoliv: prořezání nezahodí let, který jediný stihne levný návrat (1 noc, přílet pozdě večer)', async () => {
  const d0 = D(30);
  const d1 = D(31);
  // VIE → Londýn čtyřmi letišti: tři levné lety tam s příletem ve 23:30 (návrat v 0:30 nestihnou), dražší SEN s příletem
  // v 10:00; zpět STN → VIE levně v 0:30, ostatní návraty drahé. Ostatní dny drahé lety (aby se cíl prořezával).
  const L = (from, to, date, hm, arr, eur) => makeLeg({ provider: 'tst', carrier: 'TS', carrierName: 'Test Air', from, to, dep: `${date}T${hm}:00`, arr: `${arr}:00`, czk: eur * 25 });
  const AWAY = ['STN', 'LTN', 'LGW', 'SEN'];
  const days = (a, b) => { const out = []; for (let x = a; x <= b; x = new Date(Date.parse(`${x}T12:00:00Z`) + 864e5).toISOString().slice(0, 10)) out.push(x); return out; };
  const tst = {
    id: 'tst', name: 'Test Air', live: true, callsPerRoute: () => 1,
    stations: async () => null,
    destinations: async (o) => (o === 'VIE' ? AWAY : []),
    daily: async ({ from, to, dateFrom, dateTo }) => {
      // trasy doběhnou postupně (STN, LTN, LGW, SEN): při letech SEN už jsou ostatní trasy konečné a cíl se prořezává
      await new Promise((r) => setTimeout(r, { STN: 0, LTN: 15, LGW: 30, SEN: 60 }[from === 'VIE' ? to : from]));
      // každá trasa v jinou minutu (jinak by to pro optimalizátor byla táž kombinace – stejný dopravce i čas odletu)
      const mm = String((AWAY.indexOf(from === 'VIE' ? to : from) + 1) * 5).padStart(2, '0'); // 00:00 = bez času
      return days(dateFrom, dateTo).map((date) => {
        if (from === 'VIE' && date === d0) return to === 'SEN' ? L(from, to, date, `07:${mm}`, `${date}T10:00`, 100) : L(from, to, date, `21:${mm}`, `${date}T23:30`, 20);
        if (to === 'VIE' && date === d1) return from === 'STN' ? L(from, to, date, `00:${mm}`, `${date}T03:30`, 10) : L(from, to, date, `20:${mm}`, `${date}T23:00`, 200);
        return L(from, to, date, `12:${mm}`, `${date}T14:30`, 500);
      });
    },
  };
  const q = { from: ['ap:VIE'], radiusKm: 0, dateFrom: D(15), dateTo: D(45), trip: 'return', nightsMin: 1, nightsMax: 1, adults: 1 };
  const { a, b } = await both(q, [tst]);
  assert.deepEqual(groupsOf(a), groupsOf(b));
  const lon = a.groups.find((g) => g.dest.key === 'LON');
  assert.deepEqual([lon.best.out.from, lon.best.out.to, lon.best.back.from, lon.best.back.to, lon.best.flightCzk], ['VIE', 'SEN', 'STN', 'VIE', 110 * 25]);
  assert.ok(a.stats.mix.dropped > 0, `prořezávalo se: zahozeno ${a.stats.mix.dropped} z ${a.stats.mix.legs}`);
  assert.equal(b.stats.mix.dropped, 0);
});

test('Kamkoliv se zpožděnými zdroji (jako v provozu): kombinací drží jen zlomek stažených letů, nejlepší ceny stejné', async () => {
  // Demo Air rychle, Demo Jet a Demo Three pomaleji (každá trasa jinak dlouho) – cíle se skládají průběžně
  const delay = { 'demo-air': 4, 'demo-jet': 40, 'demo-three': 90 };
  const slow = (p) => ({ ...p, daily: async (x) => { await new Promise((r) => setTimeout(r, delay[p.id] * (0.5 + ((x.from.charCodeAt(0) * 7 + x.to.charCodeAt(1) * 13 + x.to.charCodeAt(2)) % 100) / 100))); return p.daily(x); } });
  const q = { from: ['ap:BRQ'], radiusKm: 150, dateFrom: D(20), dateTo: D(60), trip: 'return', nightsMin: 2, nightsMax: 7, adults: 1 };
  const { a, b } = await both(q, DEMO.map(slow));
  const m = a.stats.mix;
  assert.ok(m.legs > 5000, `${m.legs} letů`);
  assert.ok(m.peak < m.legs * 0.5, `drží nejvýš ${m.peak} z ${m.legs} letů`);
  assert.ok(b.stats.mix.peak > 2 * m.peak, `všechny lety najednou: ${b.stats.mix.peak}`);
  // pořadí příchodu letů se může v obou bězích lišit (časovače) – nejlepší cena cíle ne
  const best = (r) => Object.fromEntries(r.groups.map((g) => [g.dest.key, g.best.perPersonCzk]));
  assert.deepEqual(best(a), best(b));
  assert.ok(a.groups.some((g) => g.options.some(isMix)));
});
