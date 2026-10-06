// Cesta přes víc měst: kontrola letů ve formuláři (normalizeQuery), pravidla návaznosti letů, výběr letů na úsek,
// skládání celých cest a hledání úseků s rozpočtem dotazů (zdroje nahrazené – žádná síť).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stubFetch, ymdPlus } from './helpers.js';

process.env.ATLAS_MOCK = '0';
const { search, normalizeQuery, UserError } = await import('../server/lib/search.js');
const { MULTI, legFits, pickOptions, linkMatrix, buildCombos, pairsPerLeg, runLimited, mergeStatus } = await import('../server/lib/multi.js');
const { makeLeg } = await import('../server/lib/fares.js');

const plus = (ymd, n) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const D = ymdPlus(30);
const leg = (from, to, dep, arr, extra = {}) => ({ from, to, dep, arr, date: dep.slice(0, 10), hasTime: true, stops: 0, ...extra });
const opt = (l, czk) => ({ out: l, perPersonCzk: czk, flightCzk: czk, groundCzk: 0, bagCzk: 0 });
const err = (raw) => { try { normalizeQuery(raw); } catch (e) { assert.ok(e instanceof UserError, e.message); return e.message; } return null; };
const base = (legs, extra = {}) => ({ trip: 'multi', legs, ...extra });

test('normalizeQuery: lety cesty přes víc měst – počet, místa, data po sobě, ne v minulosti, ± dny', () => {
  const a = { from: ['ap:PRG'], to: ['metro:ROM'], date: D };
  const b = { from: ['ap:NAP'], to: ['ap:PRG'], date: plus(D, 6), flexDays: 2 };
  const q = normalizeQuery(base([a, b], { adults: 2, radiusKm: 150, bags: 'cabin', maxPrice: 9000 }));
  assert.equal(q.trip, 'multi');
  assert.equal(q.legs.length, 2);
  assert.deepEqual(q.legs[1], { from: ['ap:NAP'], to: ['ap:PRG'], date: plus(D, 6), flex: 2, dateFrom: plus(D, 4), dateTo: plus(D, 8) });
  assert.deepEqual([q.from, q.dateFrom, q.dateTo, q.adults, q.radiusKm, q.bags, q.maxPrice, q.exact], [['ap:PRG'], D, plus(D, 8), 2, 150, 'cabin', 9000, null]);
  // ± dny jen 0–3; okno nezačne v minulosti
  const today = ymdPlus(0);
  const q2 = normalizeQuery(base([{ ...a, date: today, flexDays: 9 }, b]));
  assert.deepEqual([q2.legs[0].flex, q2.legs[0].dateFrom, q2.legs[0].dateTo], [3, today, plus(today, 3)]);
  // týž den smí (přestup), dřív ne
  assert.equal(err(base([a, { ...b, date: D }])), null);
  assert.match(err(base([a, { ...b, date: plus(D, -1) }])), /2\. let nesmí být dřív než 1\./);
  assert.match(err(base([a])), /aspoň 2 lety/);
  assert.match(err(base([a, b, b, b, b])), /nejvýš 4 lety/);
  assert.match(err(base([a, { ...b, to: [] }])), /kam je 2\. let/);
  assert.match(err(base([a, { ...b, to: ['anywhere'] }])), /kam je 2\. let/);
  assert.match(err(base([{ ...a, from: [] }, b])), /odkud je 1\. let/);
  assert.match(err(base([a, { ...b, to: ['ap:NAP'] }])), /stejné místo/);
  assert.match(err(base([{ ...a, date: ymdPlus(-1) }, b])), /1\. letu je v minulosti/);
  assert.match(err(base([a, { ...b, date: 'zítra' }])), /Zadej datum 2\. letu/);
  assert.match(err(base([a, { ...b, date: plus(D, 91) }])), /nejvýš 90 dní/);
  assert.match(err(base([a, null])), /odkud je 2\. let/);
  // jednoduché hledání se nezměnilo
  assert.equal(normalizeQuery({ from: ['ap:PRG'], trip: 'oneway' }).trip, 'oneway');
});

test('legFits: stejné letiště aspoň 3 h, jiné letiště téhož města 5 h, jiné město nejdřív další den a aspoň 8 h', () => {
  const arr = leg('PRG', 'FCO', `${D}T07:00`, `${D}T09:00`);
  // stejné letiště
  assert.equal(legFits(arr, leg('FCO', 'NAP', `${D}T12:00`, `${D}T13:00`)), null);
  assert.deepEqual(legFits(arr, leg('FCO', 'NAP', `${D}T11:30`, `${D}T12:30`)), { why: 'short', gapMin: 150, needMin: 180 });
  assert.deepEqual(legFits(arr, leg('FCO', 'NAP', `${D}T08:00`, `${D}T09:00`)), { why: 'early' });
  // jiné letiště v Římě (CIA): rezerva 5 h
  assert.deepEqual(legFits(arr, leg('CIA', 'NAP', `${D}T13:00`, `${D}T14:00`)), { why: 'short', gapMin: 240, needMin: 300 });
  assert.equal(legFits(arr, leg('CIA', 'NAP', `${D}T14:00`, `${D}T15:00`)), null);
  // jiné město (přejezd Řím → Neapol): týž den ne, další den ano
  assert.deepEqual(legFits(arr, leg('NAP', 'PRG', `${D}T20:00`, `${D}T22:00`)), { why: 'nextday' });
  assert.equal(legFits(arr, leg('NAP', 'PRG', `${plus(D, 1)}T06:00`, `${plus(D, 1)}T08:00`)), null);
  // jiné město další den, ale hned po půlnoci: přílet do Říma 23:50, odlet z Neapole 0:30 nestihneš (aspoň 8 h)
  const late = leg('PRG', 'FCO', `${D}T21:50`, `${D}T23:50`, { fromTz: 'Europe/Prague', toTz: 'Europe/Rome' });
  const tz = { fromTz: 'Europe/Rome', toTz: 'Europe/Prague' };
  assert.deepEqual(legFits(late, leg('NAP', 'PRG', `${plus(D, 1)}T00:30`, `${plus(D, 1)}T02:20`, tz)), { why: 'short', gapMin: 40, needMin: 480, move: true });
  assert.equal(legFits(late, leg('NAP', 'PRG', `${plus(D, 1)}T07:50`, `${plus(D, 1)}T09:40`, tz)), null);
  // mezi městy v různých časových zónách skutečný čas: přílet Londýn 23:00 (= 0:00 v Paříži), odlet Paříž 7:30 → 7 h 30 min
  const lon = leg('PRG', 'STN', `${D}T21:30`, `${D}T23:00`, { fromTz: 'Europe/Prague', toTz: 'Europe/London' });
  assert.deepEqual(legFits(lon, leg('CDG', 'PRG', `${plus(D, 1)}T07:30`, `${plus(D, 1)}T09:10`, { fromTz: 'Europe/Paris' })), { why: 'short', gapMin: 450, needMin: 480, move: true });
  // den předem nikdy
  assert.deepEqual(legFits(arr, leg('FCO', 'NAP', `${plus(D, -1)}T20:00`, `${plus(D, -1)}T21:00`)), { why: 'early' });
  // noční let s příletem po půlnoci: další let téhož (odletového) dne nejde, druhý den ráno až po příletu
  const night = leg('PRG', 'FCO', `${D}T22:30`, `${plus(D, 1)}T00:40`);
  assert.deepEqual(legFits(night, leg('FCO', 'NAP', `${D}T23:50`, `${plus(D, 1)}T00:50`)), { why: 'early' });
  assert.equal(legFits(night, leg('FCO', 'NAP', `${plus(D, 1)}T06:00`, `${plus(D, 1)}T07:00`)), null);
  // neznámý čas (Ryanair bez času, Travelpayouts): týž den ani na stejném letišti ne, další den ano
  const noTime = leg('PRG', 'FCO', `${D}T00:00`, null, { hasTime: false });
  assert.deepEqual(legFits(noTime, leg('FCO', 'NAP', `${D}T20:00`, `${D}T21:00`)), { why: 'nextday' });
  assert.equal(legFits(noTime, leg('FCO', 'NAP', `${plus(D, 1)}T06:00`, `${plus(D, 1)}T07:00`)), null);
});

test('pickOptions: každý let jednou, nejlevnější, přímý, každý den a ráno / odpoledne / večer, nejvýš max', () => {
  const t = (dep, czk, extra = {}) => opt(leg('PRG', 'FCO', dep, null, extra), czk);
  const trips = [
    t(`${D}T07:00`, 900, { stops: 1, carrier: 'LH' }), t(`${D}T07:00`, 900, { stops: 1, carrier: 'LH' }), // týž let 2×
    t(`${D}T08:00`, 1000, { stops: 1, carrier: 'OS' }), t(`${D}T09:00`, 1100, { stops: 1, carrier: 'AZ' }),
    t(`${D}T10:00`, 1200, { stops: 1, carrier: 'KL' }), t(`${D}T21:00`, 3000, { carrier: 'FR' }),
    t(`${plus(D, 1)}T13:00`, 2000, { carrier: 'W6' }), t(`${D}T15:00`, 2500, { stops: 1, carrier: 'LX' }),
  ];
  const picked = pickOptions(trips, 5);
  const deps = picked.map((x) => x.out.dep.slice(5));
  assert.equal(picked.length, 5);
  assert.deepEqual(picked.map((x) => x.perPersonCzk), [...picked.map((x) => x.perPersonCzk)].sort((a, b) => a - b), 'od nejlevnějšího');
  assert.equal(new Set(deps).size, 5, 'žádný let dvakrát');
  for (const want of [`${D.slice(5)}T07:00`, `${D.slice(5)}T21:00`, `${plus(D, 1).slice(5)}T13:00`, `${D.slice(5)}T15:00`]) assert.ok(deps.includes(want), want);
  // nejlevnější + přímý (večer) + druhý den + odpoledne prvního dne mají přednost před levnějšími ranními
  assert.ok(!deps.includes(`${D.slice(5)}T10:00`));
});

test('linkMatrix + buildCombos: jen navazující lety, nejlevnější napřed (shodně s hrubou silou), limit ceny', () => {
  // náhodný, ale deterministický svět: 3 úseky po 9 letech v 1–2 dnech
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const hh = (n) => String(n).padStart(2, '0');
  const mk = (from, to, day) => Array.from({ length: 9 }, () => {
    const d = plus(D, day + (rnd() < 0.5 ? 0 : 1));
    const h = 6 + Math.floor(rnd() * 15);
    return opt(leg(from, to, `${d}T${hh(h)}:00`, `${d}T${hh(h + 2)}:00`), 500 + Math.floor(rnd() * 3000));
  });
  const legs = [{ options: mk('PRG', 'FCO', 0) }, { options: mk('FCO', 'BCN', 1) }, { options: mk('BCN', 'PRG', 2) }];
  const links = linkMatrix(legs);
  assert.equal(links.length, 2);
  assert.equal(links[0].length, 9);
  assert.equal(links[0][0].length, 9);
  const brute = [];
  for (let a = 0; a < 9; a++) for (let b = 0; b < 9; b++) for (let c = 0; c < 9; c++) {
    if (links[0][a][b] || links[1][b][c]) continue;
    brute.push(legs[0].options[a].perPersonCzk + legs[1].options[b].perPersonCzk + legs[2].options[c].perPersonCzk);
  }
  brute.sort((x, y) => x - y);
  assert.ok(brute.length > 10 && brute.length < 729, 'část kombinací se nestihne');
  const { combos, feasible } = buildCombos(legs, links, { limit: 10 });
  assert.equal(feasible, brute.length);
  assert.deepEqual(combos.map((c) => c.perPersonCzk), brute.slice(0, 10));
  for (const c of combos) {
    assert.equal(links[0][c.picks[0]][c.picks[1]], null);
    assert.equal(links[1][c.picks[1]][c.picks[2]], null);
    assert.equal(c.flightCzk, c.perPersonCzk);
  }
  // limit ceny na celou cestu skryje dražší cesty a řekne kolik
  const cap = brute[4];
  const capped = buildCombos(legs, links, { limit: 10, maxPrice: cap });
  assert.deepEqual(capped.combos.map((c) => c.perPersonCzk), brute.filter((x) => x <= cap).slice(0, 10));
  assert.equal(capped.hidden, brute.filter((x) => x > cap).length);
  assert.equal(capped.feasible, brute.length);
  // úsek bez letů → žádná cesta
  assert.deepEqual(buildCombos([legs[0], { options: [] }], [[]]), { combos: [], hidden: 0, feasible: 0 });
});

test('pairsPerLeg, runLimited a mergeStatus', async () => {
  assert.deepEqual([pairsPerLeg(2), pairsPerLeg(3), pairsPerLeg(4)], [12, 8, 6]);
  assert.ok(pairsPerLeg(4) * 4 <= MULTI.pairBudget);
  let active = 0;
  let max = 0;
  const order = await runLimited([30, 5, 20, 1].map((ms, i) => async () => {
    max = Math.max(max, ++active);
    await new Promise((r) => setTimeout(r, ms));
    active--;
    return i;
  }), 2);
  assert.deepEqual(order, [0, 1, 2, 3]);
  assert.equal(max, 2);
  const st = (id, state, x = {}) => ({ id, state, calls: 2, done: 2, found: 3, ms: 100, error: null, note: null, failed: 0, retried: 0, outage: null, retryAfter: 0, ...x });
  const m = mergeStatus([[st('kiwi', 'done', { note: 'přesná data' })], [st('kiwi', 'partial', { outage: 'down', failed: 2, error: 'HTTP 503' })], null]);
  assert.equal(m.length, 1);
  assert.equal(m[0].state, 'running', 'třetí úsek ještě nezačal');
  assert.deepEqual([m[0].calls, m[0].found, m[0].failed, m[0].outage], [4, 6, 2, 'partial']);
  assert.equal(m[0].note, '1. let: přesná data');
  assert.equal(m[0].error, '2. let: HTTP 503');
  const all = mergeStatus([[st('kiwi', 'error', { outage: 'down' })], [st('kiwi', 'error', { outage: 'blocked' })]]);
  assert.deepEqual([all[0].state, all[0].outage], ['error', 'blocked']);
});

/* ---------- hledání úseků se zástupnými zdroji ---------- */
// Zdroj typu „trasa“ (jako Wizz Air): ceny po dnech na dvojici letišť; zapisuje si dotazy.
function stubProvider(id, fares) {
  const p = {
    id, name: id, live: true, calls: [],
    async stations() { return null; },
    async routes() { return null; },
    callsPerRoute: () => 1,
    async daily({ from, to, dateFrom, dateTo }) {
      p.calls.push(`${from}-${to}`);
      await new Promise((r) => setTimeout(r, 2));
      return fares.filter((f) => f.from === from && f.to === to && f.dep.slice(0, 10) >= dateFrom && f.dep.slice(0, 10) <= dateTo)
        .map((f) => makeLeg({ provider: id, carrier: f.carrier || 'W6', carrierName: id, from: f.from, to: f.to, dep: `${f.dep}:00`, arr: `${f.arr}:00`, czk: f.czk, bookUrl: `https://example.com/${f.from}${f.to}` }));
    },
  };
  return p;
}
const fare = (from, to, date, dep, arr, czk, carrier) => ({ from, to, dep: `${date}T${dep}`, arr: `${date}T${arr}`, czk, carrier });

test('search multi: úseky se zdroji, rozpočet dotazů, nejvýš 2 úseky najednou, doprava domů, návaznosti a průběh', async () => {
  const fx = stubFetch((url) => (url.includes('open.er-api.com') ? { body: { result: 'success', rates: { EUR: 1, CZK: 25 } } } : { status: 404, body: '{}' }));
  const D2 = plus(D, 3);
  const D3 = plus(D, 6);
  const world = [
    // 1. let Praha (+ okruh) → Řím
    fare('PRG', 'FCO', D, '07:00', '09:00', 1500), fare('PRG', 'FCO', D, '12:30', '14:30', 1100), fare('KLV', 'FCO', D, '06:00', '08:00', 900),
    fare('LEJ', 'CIA', D, '12:00', '14:00', 700), // Lipsko je v okruhu, ale na dvojice letišť už nezbyde rozpočet
    // 2. let Řím → Neapol týž den: z FCO 10:00 (jen 1 h po příletu) a 13:30, z CIA 13:00 a 16:00
    fare('FCO', 'NAP', D, '10:00', '11:00', 300), fare('FCO', 'NAP', D, '13:30', '14:30', 600),
    fare('CIA', 'NAP', D, '13:00', '14:00', 400), fare('CIA', 'NAP', D, '19:30', '20:30', 800),
    // 3. let Neapol → Barcelona
    fare('NAP', 'BCN', D2, '09:00', '11:00', 1200),
    // 4. let Barcelona → domů: Praha, nebo levněji Lipsko (doprava z letiště domů se přičte)
    fare('BCN', 'PRG', D3, '18:00', '20:30', 1400), fare('BCN', 'LEJ', D3, '17:00', '19:30', 800),
  ];
  const p = stubProvider('stub', world);
  const events = [];
  try {
    const res = await search({
      trip: 'multi', adults: 2, radiusKm: 400, legs: [
        { from: ['ap:PRG'], to: ['metro:ROM'], date: D },
        { from: ['metro:ROM'], to: ['ap:NAP'], date: D },
        { from: ['ap:NAP'], to: ['ap:BCN'], date: D2 },
        { from: ['ap:BCN'], to: ['ap:PRG'], date: D3 }, // zpět domů = Kam posledního letu je Odkud prvního
      ],
    }, (ev) => events.push(JSON.parse(JSON.stringify(ev))), { providers: [p] });

    // rozpočet: dvojic letišť na úsek nejvýš pairsPerLeg(4), celkem nejvýš MULTI.pairBudget
    const per = pairsPerLeg(4);
    const byLeg = [
      p.calls.filter((c) => c.endsWith('-FCO') || c.endsWith('-CIA')).length,
      p.calls.filter((c) => c.endsWith('-NAP')).length,
      p.calls.filter((c) => c.startsWith('NAP-')).length,
      p.calls.filter((c) => c.startsWith('BCN-')).length,
    ];
    assert.ok(byLeg.every((n) => n >= 1 && n <= per), `dotazy po úsecích ${byLeg}`);
    assert.equal(byLeg.reduce((s, n) => s + n, 0), p.calls.length);
    assert.ok(p.calls.length <= MULTI.pairBudget);
    assert.equal(byLeg[0], per, 'okruh 400 km × 2 letiště Říma je víc dvojic, než dovolí rozpočet');
    assert.ok(p.calls.includes('PRG-FCO') && p.calls.includes('KLV-FCO'), 'domovské a nejbližší letiště mají přednost');
    assert.ok(!p.calls.includes('LEJ-CIA'));
    // průběh: stav úseků, nikdy víc než 2 běžící najednou
    assert.ok(events.length > 3);
    assert.ok(events.every((e) => e.type === 'progress' && e.legs.length === 4 && e.legs.filter((l) => l.state === 'running').length <= 2));
    assert.deepEqual(events.at(-1).legs.map((l) => l.state), ['done', 'done', 'done', 'done']);
    assert.equal(events[0].legs[0].label, 'Praha → Řím');

    assert.equal(res.mode, 'multi');
    assert.equal(res.destination.label, 'Praha → Řím → Neapol → Barcelona → Praha');
    assert.equal(res.returnsHome, true);
    assert.deepEqual(res.legs.map((l) => l.options.length), [3, 4, 1, 2]);
    // 1. let: doprava na letiště odletu je v ceně (KLV ~96 km od Prahy), 4. let: doprava z letiště příletu domů
    const klv = res.legs[0].options.find((o) => o.out.from === 'KLV');
    assert.ok(klv.groundCzk > 60 && klv.perPersonCzk === 900 + klv.groundCzk);
    const lej = res.legs[3].options.find((o) => o.out.to === 'LEJ');
    const prg = res.legs[3].options.find((o) => o.out.to === 'PRG');
    assert.equal(prg.groundCzk, 60, 'Praha: městská doprava');
    assert.ok(lej.groundCzk > 200 && lej.arrGroundCzk === lej.groundCzk && lej.perPersonCzk === 800 + lej.groundCzk);
    // mezi městy cesty se doprava nepočítá
    assert.ok(res.legs[1].options.every((o) => o.groundCzk === 0));
    // návaznosti: FCO 10:00 se po příletu do FCO v 9:00 nestihne, CIA 13:00 po příletu do FCO 8:00 nemá 5 h
    const i0 = (from, hhmm = null) => res.legs[0].options.findIndex((o) => o.out.from === from && (!hhmm || o.out.dep.slice(11, 16) === hhmm));
    const i1 = (from, hhmm) => res.legs[1].options.findIndex((o) => o.out.from === from && o.out.dep.slice(11, 16) === hhmm);
    assert.deepEqual(res.links[0][i0('PRG', '07:00')][i1('FCO', '10:00')], { why: 'short', gapMin: 60, needMin: 180 });
    assert.equal(res.links[0][i0('PRG', '07:00')][i1('FCO', '13:30')], null);
    assert.deepEqual(res.links[0][i0('PRG', '07:00')][i1('CIA', '13:00')], { why: 'short', gapMin: 240, needMin: 300 }, 'jiné letiště Říma: 5 h');
    assert.equal(res.links[0][i0('KLV')][i1('CIA', '13:00')], null, 'přesně 5 h stačí');
    assert.deepEqual(res.links[0][i0('PRG', '12:30')][i1('FCO', '13:30')], { why: 'early' }, 'přílet 14:30, odlet 13:30');
    // Neapol → Barcelona až za 3 dny: navazuje cokoliv
    assert.ok(res.links[1].every((row) => row.every((x) => x === null)));
    // nejlevnější celá cesta: nejlevnější navazující lety, cena za osobu i celkem
    const best = res.combos[0];
    const sum = best.picks.reduce((s, a, i) => s + res.legs[i].options[a].perPersonCzk, 0);
    assert.equal(best.perPersonCzk, sum);
    assert.equal(best.totalCzk, sum * 2);
    for (let i = 0; i < 3; i++) assert.equal(res.links[i][best.picks[i]][best.picks[i + 1]], null);
    assert.ok(res.combos.every((c, k) => !k || c.perPersonCzk >= res.combos[k - 1].perPersonCzk));
    assert.equal(res.stats.feasible >= res.combos.length, true);
    assert.equal(res.providers[0].state, 'done');
    assert.ok(res.origins.some((o) => o.iata === 'LEJ'), 'letiště začátku cesty (pro průvodce cestou)');
  } finally {
    fx.restore();
  }
});

test('search multi: cíl jako země nebo světadíl a neznámé místo odletu dalšího letu → srozumitelná chyba', async () => {
  const fx = stubFetch(() => ({ body: { result: 'success', rates: { EUR: 1, CZK: 25 } } }));
  const p = stubProvider('stub', []);
  try {
    await assert.rejects(search(base([{ from: ['ap:PRG'], to: ['cc:IT'], date: D }, { from: ['ap:NAP'], to: ['ap:PRG'], date: plus(D, 5) }]), () => {}, { providers: [p] }),
      /1\. let: zadej konkrétní město nebo letiště/);
    await assert.rejects(search(base([{ from: ['ap:PRG'], to: ['ap:FCO'], date: D }, { from: ['cc:IT'], to: ['ap:PRG'], date: plus(D, 5) }]), () => {}, { providers: [p] }),
      /2\. let: zadej, z jakého města/);
    assert.equal(p.calls.length, 0, 'chyba dřív, než se začne hledat');
    // návrat domů bez open-jaw: jen letiště samotného místa (Praha), ne celý okruh
    const r = await search(base([{ from: ['ap:PRG'], to: ['ap:FCO'], date: D }, { from: ['ap:FCO'], to: ['ap:PRG'], date: plus(D, 5) }], { radiusKm: 300, openJaw: false }), () => {}, { providers: [p] });
    assert.deepEqual([...new Set(p.calls.filter((c) => c.startsWith('FCO-')))], ['FCO-PRG']);
    assert.equal(r.combos.length, 0);
    assert.equal(r.returnsHome, true);
  } finally {
    fx.restore();
  }
});
