// Doporučené pořadí nabídek (public/js/rank.js – klasický skript pro prohlížeč, načtený přes node:vm se SearchHelp):
// srovnávací cena z realistických vymyšlených nabídek z Prahy (+200 km: PRG, Vídeň, Brno), pestrost, štítek „proč výš“,
// radar (SearchHelp.radarPick s pořadím) a nabídky cíle ze serveru (groupOptions). Bez sítě; na konci demo hledání.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

process.env.ATLAS_MOCK = '1';
const { createServer } = await import('../server/index.js');
const { groupOptions } = await import('../server/lib/search.js');

const ctx = { window: {} };
vm.createContext(ctx);
for (const f of ['searchhelp.js', 'rank.js']) vm.runInContext(readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8'), ctx, { filename: f });
const { Rank, SearchHelp: H } = ctx.window;
const { W } = Rank;

/* ---------- vymyšlené nabídky ---------- */
// doprava na letiště z Prahy (jako origins[].ground ze serveru): letiště ve městě s nočním taxi, Vídeň a Brno daleko
const GROUND = {
  PRG: { mode: 'transit', minutes: 55, czk: 50, local: true, nightMin: 25 },
  VIE: { mode: 'transit', minutes: 245, czk: 520, local: false },
  BRQ: { mode: 'transit', minutes: 220, czk: 350, local: false },
  PED: { mode: 'transit', minutes: 110, czk: 240, local: false },
};
// Praha +300 km a Brno +200 km (odhady access.js: vlak / bus a MHD, Kč na osobu jedním směrem)
const PRAHA300 = { ...GROUND, BER: { mode: 'transit', minutes: 270, czk: 540, local: false }, MUC: { mode: 'transit', minutes: 320, czk: 520, local: false }, VIE: { mode: 'transit', minutes: 315, czk: 480, local: false } };
const BRNO = { BRQ: { mode: 'transit', minutes: 40, czk: 30, local: true, nightMin: 15 }, VIE: { mode: 'transit', minutes: 130, czk: 330, local: false }, BTS: { mode: 'transit', minutes: 180, czk: 280, local: false }, KTW: { mode: 'transit', minutes: 290, czk: 570, local: false } };
// z letiště do města (arrivals[iata]; od Málagy dál podle ověřené tabulky data/arrival.json)
const ARR = {
  BCN: { min: 30, czk: 140 }, VLC: { min: 25, czk: 60 }, LIL: { min: 30, czk: 100 }, FCO: { min: 35, czk: 360 }, MXP: { min: 55, czk: 300 }, LIS: { min: 30, czk: 50 }, CGN: { min: 20, czk: 80 }, NAP: { min: 25, czk: 150 },
  AGP: { min: 15, czk: 100 }, ALC: { min: 25, czk: 110 }, PMI: { min: 25, czk: 120 }, BRI: { min: 50, czk: 20 }, CTA: { min: 15, czk: 100 }, CAG: { min: 8, czk: 30 }, BGY: { min: 50, czk: 200 },
  SPU: { min: 30, czk: 240 }, ZAD: { min: 20, czk: 120 }, CFU: { min: 15, czk: 30 }, HER: { min: 20, czk: 30 }, MLA: { min: 25, czk: 70 }, FAO: { min: 15, czk: 60 }, PSA: { min: 5, czk: 160 },
};
const CC = { BCN: 'ES', VLC: 'ES', LIL: 'FR', ROM: 'IT', MIL: 'IT', LIS: 'PT', CGN: 'DE', NAP: 'IT', DUS: 'DE', STR: 'DE', LEJ: 'DE', BLQ: 'IT', AGP: 'ES', ALC: 'ES', PMI: 'ES', BRI: 'IT', CTA: 'IT', CAG: 'IT', PSA: 'IT', SPU: 'HR', ZAD: 'HR', CFU: 'GR', HER: 'GR', MLA: 'MT', FAO: 'PT' };
const pad = (n) => String(n).padStart(2, '0');
const plusMin = (ymdhm, m) => new Date(Date.parse(`${ymdhm}:00Z`) + m * 60000).toISOString().slice(0, 16);
/** Let: odlet 'YYYY-MM-DDTHH:MM' (místní čas), délka v minutách, přestupy [[letiště, minuty]]. */
function leg(from, to, dep, dur, lays = []) {
  return {
    from, to, date: dep.slice(0, 10), dep: `${dep}:00`, arr: `${plusMin(dep, dur)}:00`, hasTime: true, durationMin: dur,
    stops: lays.length, ...(lays.length ? { layovers: lays.map(([at, min]) => ({ at, min })) } : {}), provider: 'ryanair', carrier: 'FR',
  };
}
let seq = 0;
/** Zpáteční nabídka: ticket = letenka/os., km = vzdálenost; doprava na letiště (home) a do města jako server (tripCzk). */
function offer({ dest, out, back, ticket, km, level = 'low', nights = null, home = GROUND }) {
  const ground = (home[out.from]?.czk || 0) + (back ? home[back.to]?.czk || 0 : 0);
  const arr = (ARR[out.to]?.czk || 0) + (back ? ARR[back.from]?.czk || 0 : 0);
  return {
    id: `t${++seq}`, destKey: dest, out, back, flightCzk: ticket, perPersonCzk: ticket, groundCzk: ground, arrCzk: arr, tripCzk: ticket + ground + arr,
    distanceKm: km, nights: nights ?? (back ? H.diffDays(out.date, back.date) : null), priceLevel: { level },
  };
}
function context({ stats = {}, dealBase = null, home = GROUND } = {}) {
  return {
    ground: (i) => home[i] || null, arrival: (i) => ARR[i] || null, stats: (k) => stats[k] || null, cc: (k) => CC[k] || null,
    level: (t) => t.priceLevel, memo: new WeakMap(), dealBase,
  };
}
const plain = (v) => JSON.parse(JSON.stringify(v));

// Barcelona z Prahy v pátek ráno, zpět v pondělí večer (3 noci) – rozumná nabídka bez přirážek
const bcnPrg = () => offer({ dest: 'BCN', km: 1350, ticket: 1490, out: leg('PRG', 'BCN', '2026-11-13T09:30', 140), back: leg('BCN', 'PRG', '2026-11-16T18:00', 140) });

test('dayHours: hodiny přes den (8–22 h) mezi příjezdem do města a odjezdem z něj', () => {
  const t = (s) => Date.parse(`${s}:00Z`);
  for (const [a, b, h] of [
    ['2026-11-14T10:00', '2026-11-14T20:00', 10],
    ['2026-11-14T19:26', '2026-11-15T03:55', 2.5666666666666664], // sobota večer → neděle v noci: skoro nic
    ['2026-11-13T21:00', '2026-11-15T17:00', 1 + 14 + 9],
    ['2026-11-14T06:00', '2026-11-14T07:30', 0],
    ['2026-11-14T12:00', '2026-11-14T11:00', 0], // odjezd před příjezdem
  ]) assert.ok(Math.abs(Rank.dayHours(t(a), t(b)) - h) < 1e-9, `${a} → ${b}`);
});

test('score: přirážky a sleva po složkách (tabulka realistických nabídek z Prahy +200 km)', () => {
  const c = context({ stats: { LIS: { n: 12, median: 3000 } }, dealBase: 0.75 });
  const rows = [
    {
      name: 'Praha 9:30 → Barcelona, zpět v pondělí 18:00: jen cena i s cestou a čas cesty na letiště a do města',
      t: bcnPrg(),
      want: { night: 0, stay: 0, lay: 0, deal: 0 },
      check: (s) => { assert.equal(s.parts.ground, 380); assert.equal(s.accessMin, 55 * 2 + 30 * 2); assert.equal(s.parts.access, Math.round(170 / 60 * W.hourCzk)); },
    },
    {
      name: 'Vídeň 7:30: z domu v 1:25, veřejnou dopravou v noci nic nejede → +700 Kč',
      t: offer({ dest: 'BCN', km: 1350, ticket: 990, out: leg('VIE', 'BCN', '2026-11-13T07:30', 150), back: leg('BCN', 'VIE', '2026-11-16T12:00', 150) }),
      want: { night: W.nightHome },
      check: (s) => assert.match(s.notes[0].txt, /z domu už v 1:25 \(v noci veřejná doprava nejede\)/),
    },
    {
      name: 'Praha 6:00: letiště ve městě, v noci taxi – jen nevyspání +250 Kč',
      t: offer({ dest: 'BCN', km: 1350, ticket: 1290, out: leg('PRG', 'BCN', '2026-11-13T06:00', 140), back: leg('BCN', 'PRG', '2026-11-16T18:00', 140) }),
      want: { night: W.nightSoft },
    },
    {
      name: 'Návrat do Vídně ve 22:30: doma až ve 3:20 → +700 Kč',
      t: offer({ dest: 'BCN', km: 1350, ticket: 990, out: leg('VIE', 'BCN', '2026-11-13T11:00', 150), back: leg('BCN', 'VIE', '2026-11-16T20:00', 150) }),
      want: { night: W.nightHome },
      check: (s) => assert.match(s.notes[0].txt, /domů až ~3:20/),
    },
    {
      name: 'Víkend 1 noc: přílet v sobotu 18:11, odlet v neděli 6:25 – na místě ~2,6 h přes den, z města ve 3:55',
      t: offer({ dest: 'LIL', km: 830, ticket: 836, out: leg('PRG', 'LIL', '2026-11-28T16:35', 96), back: leg('LIL', 'PRG', '2026-11-29T06:25', 90) }),
      want: { night: W.nightCity },
      check: (s) => {
        assert.equal(s.dayH, 2.6);
        assert.equal(s.refH, 12);
        assert.equal(s.parts.stay, Math.round(((W.stayOk - 2.6 / 12) / W.stayOk) * W.stayMax * s.trip));
        assert.ok(s.parts.stay > 0.5 * s.trip, 'cesta, ze které skoro nic nezbude, je skoro o polovinu dražší');
      },
    },
    {
      name: 'Víkend pá 18:00 → ne 20:00: běžný víkend po práci bez přirážky za pobyt',
      t: offer({ dest: 'BCN', km: 1350, ticket: 1590, out: leg('PRG', 'BCN', '2026-11-13T18:00', 140), back: leg('BCN', 'PRG', '2026-11-15T20:00', 140) }),
      want: { stay: 0, night: 0 },
    },
    {
      name: 'Víkend z Brna s přestupem: 2 noci, 7 h cesty každým směrem – cesta na letiště i přestup se platí časem',
      t: offer({ dest: 'LIS', km: 2250, ticket: 1890, level: 'normal', out: leg('BRQ', 'LIS', '2026-11-13T10:00', 420, [['MUC', 150]]), back: leg('LIS', 'BRQ', '2026-11-15T13:00', 420, [['MUC', 150]]) }),
      check: (s) => {
        const direct = 2250 / 780 * 60 + 35;
        assert.equal(s.layMin, Math.round(420 - direct) * 2);
        assert.equal(s.parts.lay, Math.round(s.layMin / 60 * W.hourCzk));
        assert.equal(s.accessMin, 220 * 2 + 30 * 2);
        assert.ok(s.parts.stay > 0, 'z víkendu zbyde méně než 85 % dne');
        assert.ok(s.czk > s.trip + 2000, `${s.czk}`);
      },
    },
    {
      name: 'Přestup 7 h (často přes noc): čas navíc proti přímému letu + 500 Kč',
      t: offer({ dest: 'LIS', km: 2250, ticket: 1500, level: 'normal', out: leg('PRG', 'LIS', '2026-11-13T15:00', 660, [['IST', 420]]), back: leg('LIS', 'PRG', '2026-11-20T10:00', 200) }),
      check: (s) => {
        assert.equal(s.longLay, 420);
        assert.equal(s.parts.lay, Math.round(Math.round(660 - (2250 / 780 * 60 + 35)) / 60 * W.hourCzk + W.layNightCzk));
      },
    },
    {
      name: 'Lisabon o 40 % pod obvyklou cenou (medián 3 000 Kč, nejlevnější cíle bývají o 25 % níž) → sleva rozdílu navíc',
      t: offer({ dest: 'LIS', km: 2250, ticket: 1800, out: leg('PRG', 'LIS', '2026-11-13T09:00', 200), back: leg('LIS', 'PRG', '2026-11-20T10:00', 200) }),
      want: { deal: -Math.round(0.15 * 3000) },
      check: (s) => { assert.equal(s.pct, 40); assert.equal(s.median, 3000); },
    },
    {
      name: 'stejná letenka bez „Dobré ceny“ (Je to dobrá cena? = běžná) slevu nedostane',
      t: offer({ dest: 'LIS', km: 2250, ticket: 1800, level: 'normal', out: leg('PRG', 'LIS', '2026-11-13T09:00', 200), back: leg('LIS', 'PRG', '2026-11-20T10:00', 200) }),
      want: { deal: 0 },
    },
    {
      name: 'o 30 % pod mediánem nestačí, když tak hluboko bývá nejlevnější nabídka skoro každého cíle',
      t: offer({ dest: 'LIS', km: 2250, ticket: 2100, out: leg('PRG', 'LIS', '2026-11-13T09:00', 200), back: leg('LIS', 'PRG', '2026-11-20T10:00', 200) }),
      want: { deal: 0 },
    },
  ];
  for (const r of rows) {
    const s = Rank.score(r.t, c);
    for (const [k, v] of Object.entries(r.want || {})) assert.equal(s.parts[k], v, `${r.name}: ${k}`);
    if (r.check) r.check(s);
    assert.equal(s.czk, s.base + Object.values(s.parts).reduce((a, b) => a + b, 0), `${r.name}: součet složek`);
    assert.equal(Rank.score(r.t, c), s, 'podruhé z paměti (memo)');
  }
});

test('score: neznámé časy, doprava „nepočítat“ a let jen tam nic nevymýšlejí', () => {
  const c = context();
  const t = offer({ dest: 'BCN', km: 1350, ticket: 1200, out: { ...leg('PRG', 'BCN', '2026-11-13T00:00', 140), hasTime: false, arr: null, durationMin: null }, back: { ...leg('BCN', 'PRG', '2026-11-16T00:00', 140), hasTime: false } });
  const s = Rank.score(t, c);
  assert.deepEqual([s.parts.night, s.parts.stay, s.dayH], [0, 0, null]);
  const off = Rank.score(bcnPrg(), { ...context(), ground: (i) => ({ ...GROUND[i], off: true }) });
  assert.equal(off.accessMin, 30 * 2, 'doprava na letiště vypnutá: jen cesta do města');
  const ow = Rank.score(offer({ dest: 'BCN', km: 1350, ticket: 700, out: leg('PRG', 'BCN', '2026-11-13T09:30', 140), back: null }), c);
  assert.deepEqual([ow.parts.stay, ow.accessMin], [0, 55 + 30]);
});

test('explain: rozpis srovnávací ceny jednou větou, jen složky, které něco dělají', () => {
  const s = Rank.score(offer({ dest: 'BCN', km: 1350, ticket: 990, out: leg('VIE', 'BCN', '2026-11-13T07:30', 150), back: leg('BCN', 'VIE', '2026-11-16T12:00', 150) }), context());
  const x = Rank.explain(s);
  assert.match(x, /^srovnávací cena ~[\d\s]+Kč \(letenka 990\sKč, cesta na letiště a do města \+1\s320\sKč, 9\sh 10\smin na cestě na letiště a do města \+1\s375\sKč, z domu už v 1:25/);
  assert.doesNotMatch(x, /přestup|na místě jen|pod obvyklou/);
});

test('order: pestrost – další cíl ze stejné země o 8 % dráž, cíle bez země bez přirážky; stabilní', () => {
  const it = (k, c) => ({ k, c });
  const key = (x) => x.k, cc = (x) => x.c;
  const rows = [
    { name: 'tři německé za sebou: italský o 5 % dražší předběhne druhý a třetí německý', items: [it(1000, 'DE'), it(1010, 'DE'), it(1020, 'DE'), it(1050, 'IT')], want: [1000, 1050, 1010, 1020] },
    { name: 'velký cenový rozdíl pestrost nepřebije', items: [it(1000, 'DE'), it(1050, 'DE'), it(2000, 'IT')], want: [1000, 1050, 2000] },
    { name: 'bez země a se shodou podle původního pořadí', items: [it(900, ''), it(900, ''), it(900, 'DE')], want: [900, 900, 900] },
    // 5. německý: bez stropu × 1,32 = 1 327 > 1 300, se stropem × 1,24 = 1 246 – zůstane před italským
    { name: 'přirážka nejvýš 3×', items: [1, 2, 3, 4, 5].map((i) => it(1000 + i, 'DE')).concat(it(1300, 'IT')), want: [1001, 1002, 1003, 1004, 1005, 1300] },
  ];
  for (const r of rows) assert.deepEqual(plain(Rank.order(r.items, key, cc).map((x) => x.k)), r.want, r.name);
  const same = [it(900, ''), it(900, ''), it(900, 'DE')];
  Rank.order(same, key, cc).forEach((x, i) => assert.equal(x, same[i], 'stabilní – stejné objekty ve stejném pořadí'));
  const nan = Rank.order([it(NaN, 'DE'), it(5, 'DE')], key, cc).map((x) => x.k);
  assert.ok(nan[0] === 5 && Number.isNaN(nan[1]), 'nečíselný klíč na konec');
});

/** Seznam jako ve výsledcích: položky { t, sc, label, cc, alt? } v doporučeném pořadí s pestrostí. */
function ranked(entries, c) {
  const items = entries.map(([label, t, alt]) => ({ t, sc: Rank.score(t, c), label, cc: CC[t.destKey], ...(alt ? { alt: { t: alt, sc: Rank.score(alt, c) } } : {}) }));
  return Rank.order(items, (x) => x.sc.czk, (x) => x.cc);
}

test('reasons: štítek „proč výš“ jen nad levnější letenkou a s pravdivým důvodem (tabulka)', () => {
  const c = context({ stats: { LIS: { n: 12, median: 3000 } }, dealBase: 0.75 });
  const rows = [
    {
      name: 'Barcelona z Prahy nad Valencií z Vídně (letenka o 500 Kč levnější, cesta do Vídně 1 040 Kč a 8 h)',
      list: [['Valencie', offer({ dest: 'VLC', km: 1500, ticket: 990, out: leg('VIE', 'VLC', '2026-11-13T11:00', 160), back: leg('VLC', 'VIE', '2026-11-16T15:00', 160) })], ['Barcelona', bcnPrg()]],
      want: ['Barcelona', 'i s cestou na letiště nejlevnější', /Valencie \(VIE → VLC, 13\. 11\.–16\. 11\.\) má levnější letenku \(990\sKč\), ale i s cestou na letiště a do města tahle vyjde na ~1\s870\sKč, tamta na ~2\s150\sKč/],
    },
    {
      name: 'levnější varianta téhož cíle z Vídně: „Varianta …“',
      list: [['Barcelona', bcnPrg(), offer({ dest: 'BCN', km: 1350, ticket: 1090, out: leg('VIE', 'BCN', '2026-11-13T11:00', 150), back: leg('BCN', 'VIE', '2026-11-16T15:00', 150) })]],
      want: ['Barcelona', 'i s cestou na letiště nejlevnější', /^Varianta VIE → BCN, 13\. 11\.–16\. 11\. má levnější letenku \(1\s090\sKč\)/],
    },
    {
      name: 'Řím z Prahy v 6:00 o 150 Kč levnější než Milán v 10:00 – noční odjezd rozhodne',
      list: [['Řím', offer({ dest: 'ROM', km: 920, ticket: 1250, out: leg('PRG', 'FCO', '2026-11-13T06:00', 110), back: leg('FCO', 'PRG', '2026-11-16T22:30', 110) })], ['Milán', offer({ dest: 'MIL', km: 650, ticket: 1400, out: leg('PRG', 'MXP', '2026-11-13T10:00', 90), back: leg('MXP', 'PRG', '2026-11-16T18:00', 90) })]],
      want: ['Milán', 'rozumné časy', /tamta: z domu už ve 3:35, domů až ~2:00/],
    },
    {
      name: 'Lille na 1 noc (sobota večer → neděle ráno) pod víkendem v Kolíně',
      list: [['Lille', offer({ dest: 'LIL', km: 830, ticket: 836, out: leg('PRG', 'LIL', '2026-11-28T16:35', 96), back: leg('LIL', 'PRG', '2026-11-29T06:25', 90) })], ['Kolín nad Rýnem', offer({ dest: 'CGN', km: 540, ticket: 1190, out: leg('PRG', 'CGN', '2026-11-27T17:30', 75), back: leg('CGN', 'PRG', '2026-11-29T19:00', 75) })]],
      want: ['Kolín nad Rýnem', 'víc času na místě', /z tamté zbude na místě ~3 h přes den, z téhle ~2[0-9] h/],
    },
    {
      name: 'Lisabon o 40 % pod obvyklou cenou předběhne o 200 Kč levnější Neapol',
      list: [['Neapol', offer({ dest: 'NAP', km: 1050, ticket: 1600, level: 'normal', out: leg('PRG', 'NAP', '2026-11-13T09:00', 110), back: leg('NAP', 'PRG', '2026-11-20T18:00', 110) })], ['Lisabon', offer({ dest: 'LIS', km: 2250, ticket: 1800, out: leg('PRG', 'LIS', '2026-11-13T09:00', 200), back: leg('LIS', 'PRG', '2026-11-20T10:00', 200) })]],
      want: ['Lisabon', 'o 40 % pod obvyklou cenou', /tahle je o 40 % pod obvyklou cenou do cíle \(polovina nabídek nejvýš 3\s000\sKč\)/],
    },
  ];
  for (const r of rows) {
    const list = ranked(r.list, c);
    const w = Rank.reasons(list, 10);
    assert.equal(list[0].label, r.want[0], `${r.name}: první`);
    assert.ok(w.has(0), `${r.name}: štítek`);
    assert.equal(w.get(0).text, r.want[1], r.name);
    assert.match(w.get(0).title, r.want[2], r.name);
    assert.match(w.get(0).title, /Doporučené pořadí: srovnávací cena ~/);
    for (const [i] of w) assert.ok(list.slice(i + 1).some((y) => y.t.perPersonCzk < list[i].t.perPersonCzk) || list[i].alt, `${r.name}: štítek jen nad levnější letenkou`);
  }
});

test('reasons: nejlevnější nahoře bez štítku, pestrost řekne „pestřejší výběr“, n omezí počet', () => {
  const c = context();
  // tři německá města a Bologna – stejné časy i cesta, liší se jen cenou letenky
  const city = (label, iata, ticket) => [label, offer({ dest: iata, km: 600, ticket, out: leg('PRG', iata, '2026-11-13T10:00', 70), back: leg(iata, 'PRG', '2026-11-15T19:00', 70) })];
  const list = ranked([city('Lipsko', 'LEJ', 1020), city('Düsseldorf', 'DUS', 1000), city('Bologna', 'BLQ', 1060), city('Stuttgart', 'STR', 1010)], c);
  assert.deepEqual(plain(list.map((x) => x.label)), ['Düsseldorf', 'Bologna', 'Stuttgart', 'Lipsko']);
  const w = Rank.reasons(list, 10);
  assert.equal(w.has(0), false, 'nejlevnější letenka nahoře štítek nepotřebuje');
  assert.equal(w.get(1).text, 'pestřejší výběr');
  assert.match(w.get(1).title, /^Stuttgart \(PRG → STR, 13\. 11\.–15\. 11\.\) má levnější letenku \(1\s010\sKč\), ale ze stejné země je výš už jiný cíl/);
  assert.deepEqual(plain([...w.keys()]), [1]);
  assert.equal(Rank.reasons(list, 1).size, 0);
});

test('radarPick s doporučeným pořadím: z nabídek cíle ta s nejnižší srovnávací cenou, cíle podle ní; bez pořadí beze změny', () => {
  const c = context();
  const vieBcn = offer({ dest: 'BCN', km: 1350, ticket: 990, out: leg('VIE', 'BCN', '2026-11-13T07:30', 150), back: leg('BCN', 'VIE', '2026-11-16T12:00', 150) });
  const prgBcn = bcnPrg();
  const vlc = offer({ dest: 'VLC', km: 1500, ticket: 1350, out: leg('PRG', 'VLC', '2026-11-13T12:00', 160), back: leg('VLC', 'PRG', '2026-11-16T15:00', 160) });
  const g = (key, cc, ts) => ({ dest: { key, cc, label: key }, best: ts[0], options: ts });
  const groups = [g('BCN', 'ES', [vieBcn, prgBcn]), g('VLC', 'ES', [vlc])];
  const plainPick = H.radarPick(groups, null, 12);
  assert.deepEqual(plain(plainPick.map((x) => x.t.id)), [vieBcn.id, vlc.id], 'bez pořadí: nejlevnější letenka cíle, pořadí serveru');
  const p = H.radarPick(groups, null, 12, null, Rank.radar(c));
  assert.deepEqual(plain(p.map((x) => x.t.id)), [vlc.id, prgBcn.id], 'Valencie z Prahy, pak Barcelona z Prahy (ne z Vídně v noci)');
  assert.ok(Rank.score(vlc, c).czk < Rank.score(prgBcn, c).czk);
  assert.deepEqual(plain(H.radarPick(groups, null, 1, new Set(['VLC']), Rank.radar(c)).map((x) => x.g.dest.key)), ['VLC', 'BCN'], '🙈 se do n nepočítá');
});

test('radarDiff: jiná nabídka cíle s dražší letenkou (doporučené pořadí) není „↑ zdražilo“, levnější jiná je „↓“', () => {
  const home = { from: [{ id: 'ap:PRG', label: 'Praha' }], radius: 200 };
  const key = JSON.stringify(H.radarQuery('all', home, '2026-10-08').payload);
  const T0 = Date.parse('2026-10-08T09:00:00Z'), T1 = T0 + 6 * 3600e3;
  const it = (id, czk, from, d1) => ({ id, label: id, czk, from, to: id, d1, d2: '2026-11-16' });
  const prev = { key, at: T0, items: [{ ...it('BCN', 990, 'VIE', '2026-11-13'), newAt: T0 - 3600e3 }, it('LIS', 1800, 'PRG', '2026-11-13'), it('ROM', 1500, 'PRG', '2026-11-13')] };
  const now = plain(H.radarDiff(prev, [it('BCN', 1490, 'PRG', '2026-11-13'), it('LIS', 1500, 'PRG', '2026-11-14'), it('ROM', 1700, 'PRG', '2026-11-13')], key, T1));
  assert.equal(now[0].was, undefined, 'Barcelona: místo Vídně v noci Praha – jiná nabídka, ne zdražení');
  assert.equal(now[0].newAt, T0 - 3600e3, 'Barcelona: „nové“ z minula zůstane – cíl je pořád nový, jen s jinou nabídkou');
  assert.deepEqual(now[1].was, { czk: 1800, at: T0 }, 'Lisabon: jiný den a levněji – cíl opravdu zlevnil');
  assert.deepEqual(now[2].was, { czk: 1500, at: T0 }, 'Řím: stejná nabídka dráž – zdražila');
});

test('groupOptions (server): 6 nejlevnějších různých, + z každého letiště, + nejlevnější i s cestou na letiště', () => {
  const t = (id, from, backTo, czk, trip, date = '2026-11-13') => ({ id, provider: 'ryanair', perPersonCzk: czk, tripCzk: trip, out: { from, to: 'BCN', date }, back: { from: 'BCN', to: backTo, date: '2026-11-16' } });
  const trips = [
    t('a', 'VIE', 'VIE', 900, 2000, '2026-11-01'), t('b', 'VIE', 'VIE', 910, 2010, '2026-11-05'), t('c', 'VIE', 'VIE', 920, 2020, '2026-11-09'),
    t('d', 'VIE', 'VIE', 930, 2030, '2026-11-13'), t('e', 'VIE', 'VIE', 940, 2040, '2026-11-17'), t('f', 'VIE', 'VIE', 950, 2050, '2026-11-21'),
    t('g', 'VIE', 'VIE', 960, 2060, '2026-11-25'),
    t('h', 'PRG', 'BRQ', 1200, 1500), // návrat na jiné letiště domova – nejlevnější i s cestou, z letiště PRG s návratem tam nic
    t('i', 'BRQ', 'BRQ', 1250, 1900),
  ];
  assert.deepEqual(groupOptions(trips).map((x) => x.id), ['a', 'b', 'c', 'd', 'e', 'f', 'i', 'h']);
  assert.deepEqual(groupOptions(trips.slice(0, 3)).map((x) => x.id), ['a', 'b', 'c'], 'nejlevnější i s cestou už mezi nimi je');
});

test('noc na cestě: ranní let ze vzdáleného letiště s odjezdem večer předem ani přílet s domovem až ráno nevyjdou líp než o hodinu jindy', () => {
  // Praha → Vídeň 5 h 15 min veřejnou dopravou: let v 6:00 = z domu ve 22:45 předchozího dne – podle hodiny (štítek ⏰)
  // „ne brzy“, ale noc v autobuse a na letišti stejně jako let v 9:00 s odjezdem v 1:45
  const c = context({ home: PRAHA300 });
  const out = (dep) => Rank.score(offer({ home: PRAHA300, dest: 'BCN', km: 1350, ticket: 990, out: leg('VIE', 'BCN', `2026-11-13T${dep}`, 150), back: leg('BCN', 'PRG', '2026-11-16T15:00', 140) }), c);
  const deps = ['02:30', '04:00', '06:00', '07:30', '09:00', '10:30', '12:00'];
  assert.deepEqual(plain(deps.map((d) => out(d).parts.night)), [700, 700, 700, 700, 700, 700, 0], 'z domu před 4:30 dne letu (i večer předem) = noc');
  assert.deepEqual(plain(deps.slice(0, 5).map((d) => out(d).notes[0].txt)), [
    'odlet v noci (2:30)', 'odlet v noci (4:00)', 'z domu už ve 22:45 večer předem (noc na cestě)',
    'z domu už v 0:15 (v noci veřejná doprava nejede)', 'z domu už v 1:45 (v noci veřejná doprava nejede)',
  ]);
  // zpět do Vídně: přílet ve 23:30 = doma v 5:30 – po celé noci v autobuse, ne „v pořádku, doma po páté“
  const back = (arr) => Rank.score(offer({ home: PRAHA300, dest: 'BCN', km: 1350, ticket: 990, out: leg('PRG', 'BCN', '2026-11-13T10:00', 140), back: leg('BCN', 'VIE', plusMin(`2026-11-16T${arr}`, -150), 150) }), c);
  const arrs = ['17:50', '18:40', '20:30', '23:30', '01:30'];
  assert.deepEqual(plain(arrs.map((a) => back(a).parts.night)), [0, 700, 700, 700, 700]);
  assert.deepEqual(plain(arrs.slice(1, 5).map((a) => back(a).notes[0].txt)), [
    'domů až ~0:40 (v noci veřejná doprava nejede)', 'domů až ~2:30 (v noci veřejná doprava nejede)', 'domů až ráno ~5:30 (noc na cestě)', 'přílet zpět v noci (1:30), domů ~7:30',
  ]);
  // letiště ve tvém městě (Praha, v noci taxi) a auto: noc jen nevyspání
  const prg = Rank.score(offer({ dest: 'BCN', km: 1350, ticket: 990, out: leg('PRG', 'BCN', '2026-11-13T01:30', 140), back: leg('BCN', 'PRG', '2026-11-16T15:00', 140) }), context());
  assert.deepEqual(plain([prg.parts.night, prg.notes[0].txt]), [W.nightSoft, 'odlet v noci (1:30)']);
  const car = { ...PRAHA300, VIE: { mode: 'car', minutes: 225, czk: 296 } };
  assert.equal(Rank.score(offer({ home: car, dest: 'BCN', km: 1350, ticket: 990, out: leg('VIE', 'BCN', '2026-11-13T06:00', 150), back: leg('BCN', 'PRG', '2026-11-16T15:00', 140) }), context({ home: car })).parts.night, W.nightSoft);
});

test('Praha +300 km vs. jen Praha, k moři v květnu: levná letenka z Berlína s nocí na cestě nepřebije Prahu, Praha zůstane stejná', () => {
  // Málaga na týden: Praha 3 490 Kč v rozumných časech, Berlín 1 490 Kč (odlet 6:10 = z domu ve 23:40, přílet zpět
  // 0:55 = doma ráno), Berlín 1 490 Kč přes den, Vídeň 2 290 Kč
  const c = context({ home: PRAHA300 });
  const agp = (from, ticket, dep, backDep, to = from) => offer({ home: PRAHA300, dest: 'AGP', km: 2050, ticket, out: leg(from, 'AGP', `2027-05-15T${dep}`, 215), back: leg('AGP', to, `2027-05-22T${backDep}`, 205) });
  const prg = agp('PRG', 3490, '10:15', '14:30'), berNight = agp('BER', 1490, '06:10', '21:30'), berDay = agp('BER', 1490, '11:00', '15:00'), vie = agp('VIE', 2290, '11:00', '15:00');
  const s = (t) => Rank.score(t, c);
  assert.deepEqual(plain(s(berNight).notes.map((n) => n.txt)), ['z domu už ve 23:40 večer předem (noc na cestě)', 'přílet zpět v noci (0:55), domů ~6:10']);
  assert.equal(s(berNight).czk - s(berDay).czk, 2 * W.nightHome, 'tatáž letenka s nocí na cestě o 1 400 Kč hůř');
  // ušetřených 2 000 Kč na letence skoro vyrovná 9 h autobusu a 1 080 Kč za jízdenky – přes den Berlín těsně za Prahou
  assert.ok(s(prg).czk < s(berDay).czk && s(berDay).czk - s(prg).czk < 200, `${s(prg).czk} / ${s(berDay).czk}`);
  const r = Rank.radar(c), g = { dest: { key: 'AGP', cc: 'ES', label: 'Málaga' } };
  assert.equal(r.pick([berNight, vie, berDay, prg]), prg, 'z okolí +300 km: Praha');
  assert.equal(Rank.score(prg, context()).czk, s(prg).czk, 'jen Praha: tatáž srovnávací cena – okolí ji nemění');
  assert.equal(H.radarPick([{ ...g, best: berNight, options: [berNight, vie, berDay, prg] }], null, 1, null, r)[0].t, prg);
});

test('k moři v květnu z Brna +200 km (Vídeň, Bratislava): rozumných prvních 10, pestrost nejvýš +24 %', () => {
  // Brno: letiště ve městě skoro bez letů k moři, Vídeň 2 h 10 min a 330 Kč, Bratislava 3 h a 280 Kč (odhady access.js);
  // Ryanair / Wizz Air s reálnými časy (první vlna 6:00–7:30, odpolední, večerní) a cenami na týden v květnu
  const c = context({ home: BRNO });
  const o = (dest, from, ticket, dep, dur, backDep, km) => offer({ home: BRNO, dest, km, ticket, out: leg(from, dest, `2027-05-15T${dep}`, dur), back: leg(dest, from, `2027-05-22T${backDep}`, dur) });
  const rows = [
    ['Málaga', o('AGP', 'VIE', 1890, '06:30', 205, '10:30', 2000)], // z domu ve 2:20
    ['Málaga', o('AGP', 'BTS', 2090, '10:00', 210, '14:15', 2050)],
    ['Alicante', o('ALC', 'BTS', 1690, '13:20', 180, '17:00', 1800)],
    ['Mallorca', o('PMI', 'VIE', 2490, '09:45', 140, '18:30', 1300)],
    ['Bari', o('BRI', 'VIE', 1190, '11:40', 95, '16:10', 720)],
    ['Bari', o('BRI', 'BTS', 1090, '20:45', 95, '22:50', 700)], // přílet 0:25, doma ve 4:10
    ['Neapol', o('NAP', 'VIE', 1390, '08:25', 100, '11:15', 830)],
    ['Catania', o('CTA', 'BTS', 1290, '15:30', 125, '18:40', 1220)],
    ['Cagliari', o('CAG', 'VIE', 1590, '12:05', 115, '14:45', 1000)],
    ['Pisa', o('PSA', 'VIE', 1190, '17:55', 85, '20:25', 620)],
    ['Split', o('SPU', 'VIE', 1490, '10:00', 65, '11:30', 450)],
    ['Zadar', o('ZAD', 'BTS', 1090, '06:00', 70, '07:20', 470)], // z domu v 1:00
    ['Korfu', o('CFU', 'VIE', 1790, '09:10', 120, '12:35', 1000)],
    ['Kréta', o('HER', 'VIE', 2690, '07:00', 165, '11:00', 1500)],
    ['Malta', o('MLA', 'BTS', 1590, '11:25', 145, '14:30', 1300)],
    ['Faro', o('FAO', 'BTS', 2490, '16:55', 255, '21:15', 2600)],
  ];
  const groups = Object.values(rows.reduce((m, [label, t]) => {
    (m[t.destKey] = m[t.destKey] || { dest: { key: t.destKey, cc: CC[t.destKey], label }, options: [] }).options.push(t);
    return m;
  }, {})).map((g) => ({ ...g, best: g.options.reduce((a, b) => (b.perPersonCzk < a.perPersonCzk ? b : a)) }));
  const rec = H.radarPick(groups, null, Infinity, null, Rank.radar(c));
  const top = rec.slice(0, 10).map((x) => x.g.dest.label);
  // Málaga z Bratislavy (přes den), ne z Vídně v 6:30; Bari z Vídně, ne z Bratislavy s návratem domů ve 4:10
  assert.equal(rec.find((x) => x.g.dest.key === 'AGP').t.out.from, 'BTS');
  assert.equal(rec.find((x) => x.g.dest.key === 'BRI').t.out.from, 'VIE');
  // nejlevnější letenka (Zadar 1 090 Kč) s odjezdem z domu v 1:00 není mezi prvními třemi; Itálie nejvýš 4× v top 10
  assert.ok(top.indexOf('Zadar') > 2, top.join(', '));
  assert.ok(top.filter((l) => ['Bari', 'Neapol', 'Catania', 'Cagliari', 'Pisa'].includes(l)).length <= 4, top.join(', '));
  assert.ok(top.includes('Split') && top.includes('Alicante'), top.join(', '));
  // nic výš než cíl, který má o víc než 24 % nižší srovnávací cenu (strop pestrosti)
  const czk = rec.map((x) => Rank.score(x.t, c).czk);
  czk.forEach((a, i) => czk.slice(i + 1).forEach((b) => assert.ok(a <= b * (1 + W.sameCountry * W.sameMax) + 1e-9, `${a} nad ${b}`)));
});

test('reasons: štítek platí doslova – víc času na noc, lepší (ne rozumné) časy, přestupy, cesta do města, neznámé časy', () => {
  const c = context();
  const rows = [
    {
      name: 'Kolín na 1 noc (13 h přes den) nad Lille na 2 noci (18 h): víc času NA NOC, hodin má míň',
      list: [['Lille', offer({ dest: 'LIL', km: 830, ticket: 1190, out: leg('PRG', 'LIL', '2026-11-27T20:00', 96), back: leg('LIL', 'PRG', '2026-11-29T14:00', 90) })], ['Kolín nad Rýnem', offer({ dest: 'CGN', km: 540, ticket: 1290, out: leg('PRG', 'CGN', '2026-11-28T09:00', 75), back: leg('CGN', 'PRG', '2026-11-29T13:00', 75) })]],
      want: ['víc času na místě na noc', /z tamté zbude na místě ~18 h přes den za 2 noci, z téhle ~13 h za 1 noc/],
    },
    {
      name: 'obě v 6:00 z Prahy, levnější i s návratem po půlnoci: „lepší časy“, ne „rozumné“',
      list: [['Řím', offer({ dest: 'ROM', km: 920, ticket: 1250, out: leg('PRG', 'FCO', '2026-11-13T06:00', 110), back: leg('FCO', 'PRG', '2026-11-16T21:40', 110) })], ['Milán', offer({ dest: 'MIL', km: 650, ticket: 1300, out: leg('PRG', 'MXP', '2026-11-13T06:00', 90), back: leg('MXP', 'PRG', '2026-11-16T18:00', 90) })]],
      want: ['lepší časy', /tamta: z domu už ve 3:35, domů až ~1:10; tahle: z domu už ve 3:35/],
    },
    {
      name: 'přímý let nad letem s přestupem 7 h',
      list: [['Lisabon', offer({ dest: 'LIS', km: 2250, ticket: 1500, level: 'normal', out: leg('PRG', 'LIS', '2026-11-13T15:00', 660, [['IST', 420]]), back: leg('LIS', 'PRG', '2026-11-20T10:00', 200) })], ['Faro', offer({ dest: 'FAO', km: 2500, ticket: 2500, level: 'normal', out: leg('PRG', 'FAO', '2026-11-13T15:00', 230), back: leg('FAO', 'PRG', '2026-11-20T10:00', 230) })]],
      want: ['bez přestupu', /tamta má přestup 7\sh, tahle letí přímo/],
    },
    {
      name: 'přestup 2 h nad přestupem 7 h',
      list: [['Lisabon', offer({ dest: 'LIS', km: 2250, ticket: 1500, level: 'normal', out: leg('PRG', 'LIS', '2026-11-13T15:00', 660, [['IST', 420]]), back: leg('LIS', 'PRG', '2026-11-20T10:00', 200) })], ['Faro', offer({ dest: 'FAO', km: 2500, ticket: 2100, level: 'normal', out: leg('PRG', 'FAO', '2026-11-13T15:00', 330, [['MAD', 120]]), back: leg('FAO', 'PRG', '2026-11-20T10:00', 230) })]],
      want: ['bez dlouhého přestupu', /tamta má přestup 7\sh, tahle nejvýš 2\sh/],
    },
    {
      name: 'obě z Prahy – Korfu nad Bergamem díky cestě do města (30 Kč proti 200 Kč), ne „levnější cesta na letiště“',
      list: [['Bergamo', offer({ dest: 'MIL', km: 650, ticket: 1390, out: leg('PRG', 'BGY', '2027-05-15T10:00', 85), back: leg('BGY', 'PRG', '2027-05-22T12:00', 85) })], ['Korfu', offer({ dest: 'CFU', km: 1150, ticket: 1790, out: leg('PRG', 'CFU', '2027-05-15T10:00', 120), back: leg('CFU', 'PRG', '2027-05-22T12:00', 120) })]],
      want: ['levnější cesta z letiště do města', /cesta z letiště do města a zpět tu stojí ~60\sKč, tam ~400\sKč/],
    },
    {
      name: 'let bez známých časů (cena z cache) nad letem v 6:00: o časech téhle nic nevíme – „levnější let je v noci“',
      list: [['Řím', offer({ dest: 'ROM', km: 920, ticket: 1250, out: leg('PRG', 'FCO', '2026-11-13T06:00', 110), back: leg('FCO', 'PRG', '2026-11-16T18:00', 110) })], ['Milán', offer({ dest: 'MIL', km: 650, ticket: 1300, out: { ...leg('PRG', 'MXP', '2026-11-13T00:00', 90), hasTime: false }, back: { ...leg('MXP', 'PRG', '2026-11-16T00:00', 90), hasTime: false } })]],
      want: ['levnější let je v noci', /tamta: z domu už ve 3:35; časy téhle letenky neznám/],
    },
  ];
  for (const r of rows) {
    const list = ranked(r.list, c);
    const w = Rank.reasons(list, 10);
    assert.notEqual(list[0].label, r.list[0][0], `${r.name}: levnější letenka není první`);
    assert.equal(w.get(0)?.text, r.want[0], r.name);
    assert.match(w.get(0).title, r.want[1], r.name);
  }
});

test('reasons: pestrost jen když tahle levnější letenky nepředběhla ničím jiným; jinak důvod proti té, kterou předběhla', () => {
  const c = context();
  const city = (label, iata, ticket, from = 'PRG') => [label, offer({ dest: iata, km: 600, ticket, out: leg(from, iata, '2026-11-13T10:00', 70), back: leg(iata, from, '2026-11-15T19:00', 70) })];
  // Düsseldorf, Bologna (výš jen díky pestrosti nad Stuttgartem), Stuttgart, Lipsko z Pardubic (levnější letenka, ale
  // 1 h 50 min a 240 Kč na letiště) – Bologna má proti Lipsku opravdový důvod, Stuttgart je jen „pestřejší“
  const list = ranked([city('Düsseldorf', 'DUS', 1000), city('Bologna', 'BLQ', 1060), city('Stuttgart', 'STR', 1010), city('Lipsko', 'LEJ', 900, 'PED')], c);
  assert.deepEqual(plain(list.map((x) => x.label)), ['Düsseldorf', 'Bologna', 'Stuttgart', 'Lipsko']);
  const w = Rank.reasons(list, 10);
  assert.match(w.get(1).title, /^Lipsko \(PED → LEJ/, 'Bologna: proti Lipsku, které předběhla srovnávací cenou');
  assert.notEqual(w.get(1).text, 'pestřejší výběr');
  assert.ok(Rank.score(list[1].t, c).czk > Rank.score(list[2].t, c).czk, 'nad Stuttgartem jen díky pestrosti');
});

test('score: chybějící odhady (doprava, cesta do města, časy, délka letu, cena i s cestou) – jen to, co známe, nikdy NaN', () => {
  const full = () => offer({ dest: 'BCN', km: 1350, ticket: 1490, out: leg('PRG', 'BCN', '2026-11-13T06:00', 300, [['MUC', 90]]), back: leg('BCN', 'PRG', '2026-11-16T18:00', 140) });
  // bez odhadů (prázdný kontext, bez ceny i s cestou): letenka a přestup, nic dalšího se nedomýšlí
  const bare = Rank.score({ ...full(), tripCzk: undefined, groundCzk: undefined }, {});
  assert.deepEqual(plain(bare.parts), { ground: 0, access: 0, lay: Math.round(Math.round(300 - (1350 / 780 * 60 + 35)) / 60 * W.hourCzk), night: 0, stay: 0, deal: 0 });
  assert.equal(bare.czk, 1490 + bare.parts.lay);
  // náhodně vynechané odhady a pole nabídky: srovnávací cena vždy konečná a aspoň letenka bez slevy za výhodnost
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const junk = [undefined, null, NaN, '', 'x', -5, 0];
  const pickJunk = () => junk[Math.floor(rnd() * junk.length)];
  for (let i = 0; i < 300; i++) {
    const t = full();
    for (const k of ['tripCzk', 'groundCzk', 'distanceKm', 'nights', 'flightCzk']) if (rnd() < 0.4) t[k] = pickJunk();
    for (const l of [t.out, t.back]) for (const k of ['dep', 'arr', 'durationMin', 'layovers', 'stops', 'hasTime']) if (rnd() < 0.25) l[k] = pickJunk();
    const g = (x) => (rnd() < 0.5 ? x : { ...x, minutes: pickJunk() });
    const ctx = { ...context(), ground: (iata) => (rnd() < 0.3 ? null : g(GROUND[iata] || {})), arrival: (iata) => (rnd() < 0.3 ? null : { min: rnd() < 0.5 ? pickJunk() : ARR[iata]?.min }), memo: new WeakMap() };
    const s = Rank.score(t, ctx);
    assert.ok(Number.isFinite(s.czk) && s.czk >= t.perPersonCzk * (1 - W.dealCap) - 1, `${i}: ${s.czk}`);
    assert.ok(Object.values(s.parts).every(Number.isFinite), `${i}: ${JSON.stringify(s.parts)}`);
    assert.doesNotThrow(() => Rank.explain(s));
  }
});

test('výkon: 160 cílů × 8 nabídek – srovnávací cena, výběr, pořadí a štítky v řádu milisekund (telefon ~5× pomaleji)', () => {
  const groups = [];
  const cities = ['BCN', 'VLC', 'LIL', 'NAP', 'LIS', 'CGN', 'AGP', 'ALC', 'PMI', 'BRI', 'CTA', 'CAG', 'SPU', 'ZAD', 'CFU', 'HER'];
  for (let i = 0; i < 160; i++) {
    const iata = cities[i % cities.length], key = `${iata}${i}`;
    const options = Array.from({ length: 8 }, (_, j) => {
      const from = ['PRG', 'VIE', 'BRQ'][j % 3], dep = `${String(5 + ((i + j * 3) % 17)).padStart(2, '0')}:${j % 2 ? '35' : '05'}`;
      const t = offer({ dest: iata, km: 600 + i * 7, ticket: 900 + ((i * 37 + j * 113) % 1700), out: leg(from, iata, `2026-11-${String(10 + (j % 9)).padStart(2, '0')}T${dep}`, 90 + (i % 5) * 20, j === 7 ? [['MUC', 95]] : []), back: leg(iata, from, `2026-11-${String(12 + (j % 9) + (i % 3)).padStart(2, '0')}T${dep}`, 90 + (i % 5) * 20) });
      t.destKey = key;
      return t;
    });
    groups.push({ dest: { key, cc: CC[iata], label: key }, best: options[0], options, priceStats: { n: 8, median: 1800 }, minFlightCzk: Math.min(...options.map((t) => t.flightCzk)) });
  }
  const res = { groups, origins: Object.entries(GROUND).map(([iata, ground]) => ({ iata, ground })), arrivals: ARR };
  const once = () => {
    const r = plain(res), t0 = performance.now(), c = Rank.ctxOf(r);
    const rec = H.radarPick(r.groups, null, Infinity, null, Rank.radar(c));
    Rank.reasons(rec.map(({ g, t }) => ({ t, sc: Rank.score(t, c), label: g.dest.label, cc: g.dest.cc })), 10);
    return performance.now() - t0;
  };
  const times = Array.from({ length: 9 }, once).sort((a, b) => a - b);
  // naměřeno ~3–5 ms zahřáté (Node 22, notebook); 60 ms je pojistka proti kvadratickému zpomalení, ne cíl
  assert.ok(times[4] < 60, `medián ${times[4].toFixed(1)} ms`);
});
/* ---------- demo: Kamkoliv víkend z Prahy +200 km (vymyšlená data) ---------- */
let server;
let base;
before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

let demoRes = null;
async function demo() {
  if (demoRes) return plain(demoRes);
  const today = new Date().toISOString().slice(0, 10);
  const q = H.radarQuery('weekend', { from: [H.homeOf('Praha').from[0]], radius: 200, adults: 1 }, today);
  const r = await fetch(`${base}/api/search`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...q.payload, noPartial: true }) });
  demoRes = JSON.parse((await r.text()).trim().split('\n').at(-1)).result;
  return plain(demoRes);
}

test('demo Kamkoliv víkend z Prahy +200 km: doporučené pořadí je levnější i s cestou a štítky říkají pravdu', async () => {
  const res = await demo();
  assert.ok(res.groups.length >= 20);
  const c = Rank.ctxOf(res);
  const rec = H.radarPick(res.groups, null, Infinity, null, Rank.radar(c));
  const cheap = H.radarPick(res.groups, null, Infinity);
  assert.equal(rec.length, cheap.length);
  // nahoře nabídka s nejnižší srovnávací cenou ze všech nabídek všech cílů
  const all = res.groups.flatMap((g) => [g.best, ...g.options]);
  assert.equal(Rank.score(rec[0].t, c).czk, Math.min(...all.map((t) => Rank.score(t, c).czk)));
  // prvních 10: i s cestou na letiště a do města v mediánu levnější než 10 nejlevnějších letenek
  const med = (xs) => xs.map((x) => x.t.tripCzk).sort((a, b) => a - b)[4];
  assert.ok(med(rec.slice(0, 10)) < med(cheap.slice(0, 10)), `${med(rec.slice(0, 10))} < ${med(cheap.slice(0, 10))}`);
  // štítky: jen nad levnější letenkou; „nejlevnější i s cestou“ jen když to platí pro celý seznam
  const items = rec.map(({ g, t }) => {
    const alt = [g.best, ...g.options].reduce((a, b) => (b.perPersonCzk < a.perPersonCzk ? b : a), t);
    return { t, sc: Rank.score(t, c), label: g.dest.label, cc: g.dest.cc, minTrip: Math.min(...[g.best, ...g.options].map((y) => y.tripCzk)), ...(alt !== t ? { alt: { t: alt, sc: Rank.score(alt, c) } } : {}) };
  });
  const w = Rank.reasons(items, 10);
  const low = (y) => Math.min(y.t.perPersonCzk, y.alt ? y.alt.t.perPersonCzk : Infinity);
  for (let i = 0; i < 10; i++) {
    const beaten = low(items[i]) < items[i].t.perPersonCzk || items.slice(i + 1).some((y) => low(y) < items[i].t.perPersonCzk);
    assert.equal(w.has(i), beaten, `${items[i].label}: štítek právě tehdy, když předběhl levnější letenku`);
  }
  assert.ok(w.size >= 5, 'nahoře nejsou jen nejlevnější letenky');
  // nic výš než cíl s o víc než 24 % nižší srovnávací cenou (strop pestrosti)
  const czk = rec.map((x) => Rank.score(x.t, c).czk);
  czk.forEach((a, i) => czk.slice(i + 1).forEach((b) => assert.ok(a <= b * (1 + W.sameCountry * W.sameMax) + 1e-9, `${a} nad ${b}`)));
  for (const [i, x] of w) {
    if (x.k === 'airport') assert.ok(all.every((t) => items[i].t.tripCzk <= t.tripCzk), `${items[i].label}: „i s cestou na letiště nejlevnější“`);
    assert.ok(x.text.length <= 34, x.text);
  }
});

test('stabilita: stejný vstup → stejné pořadí, štítky i výběr nabídky (demo hledání dvakrát od nuly)', async () => {
  await demo();
  const run = () => {
    const res = plain(demoRes);
    const c = Rank.ctxOf(res);
    const rec = H.radarPick(res.groups, null, Infinity, null, Rank.radar(c));
    const items = rec.map(({ g, t }) => ({ t, sc: Rank.score(t, c), label: g.dest.label, cc: g.dest.cc }));
    return { order: rec.map((x) => `${x.g.dest.key}:${x.t.id}`), why: [...Rank.reasons(items, 10)].map(([i, x]) => `${i}:${x.text}`) };
  };
  const a = run(), b = run();
  assert.deepEqual(a, b);
  assert.ok(a.order.length >= 20);
});
