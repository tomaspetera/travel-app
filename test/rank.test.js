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
};
// z letiště do města (arrivals[iata].min)
const ARR = { BCN: { min: 30, czk: 140 }, VLC: { min: 25, czk: 60 }, LIL: { min: 30, czk: 100 }, FCO: { min: 35, czk: 360 }, MXP: { min: 55, czk: 300 }, LIS: { min: 30, czk: 50 }, CGN: { min: 20, czk: 80 }, NAP: { min: 25, czk: 150 } };
const CC = { BCN: 'ES', VLC: 'ES', LIL: 'FR', ROM: 'IT', MIL: 'IT', LIS: 'PT', CGN: 'DE', NAP: 'IT', DUS: 'DE', STR: 'DE', LEJ: 'DE', BLQ: 'IT' };
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
/** Zpáteční nabídka: ticket = letenka/os., km = vzdálenost; doprava na letiště a do města jako server (tripCzk). */
function offer({ dest, out, back, ticket, km, level = 'low', nights = null }) {
  const ground = (GROUND[out.from]?.czk || 0) + (back ? GROUND[back.to]?.czk || 0 : 0);
  const arr = (ARR[out.to]?.czk || 0) + (back ? ARR[back.from]?.czk || 0 : 0);
  return {
    id: `t${++seq}`, destKey: dest, out, back, flightCzk: ticket, perPersonCzk: ticket, groundCzk: ground, arrCzk: arr, tripCzk: ticket + ground + arr,
    distanceKm: km, nights: nights ?? (back ? H.diffDays(out.date, back.date) : null), priceLevel: { level },
  };
}
function context({ stats = {}, dealBase = null } = {}) {
  return {
    ground: (i) => GROUND[i] || null, arrival: (i) => ARR[i] || null, stats: (k) => stats[k] || null, cc: (k) => CC[k] || null,
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
    // 7. německý: bez stropu × 1,48 = 1 490 > 1 450, se stropem × 1,40 = 1 410 – zůstane před italským
    { name: 'přirážka nejvýš 5×', items: [1, 2, 3, 4, 5, 6, 7].map((i) => it(1000 + i, 'DE')).concat(it(1450, 'IT')), want: [1001, 1002, 1003, 1004, 1005, 1006, 1007, 1450] },
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
  const prev = { key, at: T0, items: [it('BCN', 990, 'VIE', '2026-11-13'), it('LIS', 1800, 'PRG', '2026-11-13'), it('ROM', 1500, 'PRG', '2026-11-13')] };
  const now = plain(H.radarDiff(prev, [it('BCN', 1490, 'PRG', '2026-11-13'), it('LIS', 1500, 'PRG', '2026-11-14'), it('ROM', 1700, 'PRG', '2026-11-13')], key, T1));
  assert.equal(now[0].was, undefined, 'Barcelona: místo Vídně v noci Praha – jiná nabídka, ne zdražení');
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

/* ---------- demo: Kamkoliv víkend z Prahy +200 km (vymyšlená data) ---------- */
let server;
let base;
before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('demo Kamkoliv víkend z Prahy +200 km: doporučené pořadí je levnější i s cestou a štítky říkají pravdu', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const q = H.radarQuery('weekend', { from: [H.homeOf('Praha').from[0]], radius: 200, adults: 1 }, today);
  const r = await fetch(`${base}/api/search`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...q.payload, noPartial: true }) });
  const res = plain(JSON.parse((await r.text()).trim().split('\n').at(-1)).result);
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
  for (const [i, x] of w) {
    if (x.k === 'airport') assert.ok(all.every((t) => items[i].t.tripCzk <= t.tripCzk), `${items[i].label}: „i s cestou na letiště nejlevnější“`);
    assert.ok(x.text.length <= 34, x.text);
  }
});
