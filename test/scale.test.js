// Nával uživatelů (docs/skalovani.md): hledání se dělí na kousky a mezi nimi pouští ke slovu ostatní požadavky
// (crowd.js breathe) – i konečné složení výsledku a průběžné náhledy (search.js compose, buildGroups) –, počítání s daty
// má paměť (dates.js) a výsledek sdíleného hledání se převádí na JSON jednou pro všechny (index.js ndjsonLine). Všechno
// se stejnými výsledky jako dřív.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ymdPlus } from './helpers.js';

process.env.ATLAS_MOCK = '1';
const { search, PARTIAL } = await import('../server/lib/search.js');
const { mockProviders } = await import('../server/providers/mock.js');
const { breathe, setSliceMs } = await import('../server/lib/crowd.js');
const dates = await import('../server/lib/dates.js');
const { ndjsonLine } = await import('../server/index.js');

// Původní podoba (před pamětí) – nové funkce musí vracet totéž, i pro neplatné a podivné vstupy.
const old = {
  parseYmd(s) {
    const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  },
  ymd: (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`,
  addDays(s, n) {
    const d = old.parseYmd(s);
    d.setUTCDate(d.getUTCDate() + n);
    return old.ymd(d);
  },
  daysBetween: (a, b) => Math.round((old.parseYmd(b) - old.parseYmd(a)) / 864e5),
  weekday: (s) => old.parseYmd(s).getUTCDay(),
};

test('data s pamětí: parseYmd, addDays, daysBetween a weekday vrací totéž co dřív (i přestupné roky, neplatné a podivné vstupy)', () => {
  const days = [];
  for (let i = -900; i <= 900; i += 13) days.push(old.addDays('2026-10-23', i));
  const odd = ['2024-02-29', '2026-02-29', '2026-13-01', '2026-00-10', '0026-01-01', '1969-12-31', '1900-03-01', '2026-10-23T23:30:00',
    '2026-1-5', 'abc', '', undefined, null, 20261023];
  const ns = [0, 1, -1, 6, 31, 365, -366, 1.5, -1.5, '3', NaN, Infinity, 1e9];
  for (let pass = 0; pass < 2; pass++) { // podruhé z paměti
    for (const a of [...days, ...odd]) {
      assert.equal(dates.parseYmd(a).getTime(), old.parseYmd(a).getTime(), `parseYmd(${a})`);
      assert.equal(dates.weekday(a), old.weekday(a), `weekday(${a})`);
      for (const n of ns) assert.equal(dates.addDays(a, n), old.addDays(a, n), `addDays(${a}, ${n})`);
      for (const b of [...days.slice(0, 40), ...odd]) assert.equal(dates.daysBetween(a, b), old.daysBetween(a, b), `daysBetween(${a}, ${b})`);
    }
  }
  // parseYmd dál vrací nový Date (volající ho mění – monthsInRange, chunkRange)
  const d = dates.parseYmd('2026-10-23');
  d.setUTCDate(40);
  assert.equal(dates.parseYmd('2026-10-23').getUTCDate(), 23);
  assert.deepEqual(dates.monthsInRange('2026-11-15', '2027-01-02'), ['2026-11-01', '2026-12-01', '2027-01-01']);
});

test('normalize s pamětí (našeptávač): stejný převod jako dřív, i podruhé z paměti; paměť nepřeroste strop', async () => {
  const { normalize, _normalizeMemoSize } = await import('../server/lib/geo.js');
  const { AIRPORTS, COUNTRIES } = await import('../server/lib/airports.js');
  const ref = (s) => String(s || '').toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const texts = [...[...AIRPORTS.values()].flatMap((a) => [a.name, a.city, a.cityCs]), ...COUNTRIES.flatMap((c) => [c.cs, c.en]),
    'Łódź', '  Wrocław  ', 'São Paulo', 'Ústí nad Labem', 'Kréta (Heraklion)', 'ŘÍM', '', null, undefined, 0, 42, '🏖️ Pláž'];
  for (let pass = 0; pass < 2; pass++) for (const t of texts) assert.equal(normalize(t), ref(t), String(t));
  for (let i = 0; i < 60000; i++) normalize(`dotaz ${i}`); // cizí texty (dotazy, geokódování)
  assert.ok(_normalizeMemoSize() <= 50000, `paměť ${_normalizeMemoSize()}`);
  assert.equal(normalize('Łódź'), 'lodz');
});

const busy = (ms) => {
  const t = performance.now();
  while (performance.now() - t < ms);
};

test('breathe: bez čekání nic nestojí, čekající kousky jdou v pořadí, v jakém přišly (FIFO i přes různé úlohy)', async () => {
  const prev = setSliceMs(Infinity);
  try {
    assert.equal(breathe(), null, 'bez stropu kola se nečeká vůbec (žádný await navíc)');
    setSliceMs(0); // každý kousek ve vlastním kole
    const order = [];
    await Promise.all([0, 1, 2, 3].map(async (job) => {
      for (let i = 0; i < 5; i++) {
        const w = breathe();
        if (w) await w;
        order.push(`${job}:${i}`);
      }
    }));
    const robin = [];
    for (let i = 0; i < 5; i++) for (let job = 0; job < 4; job++) robin.push(`${job}:${i}`);
    assert.deepEqual(order, robin, 'úlohy se střídají po kouscích v pořadí příchodu');
  } finally {
    setSliceMs(prev);
  }
});

test('breathe(true): dokončení hledání předběhne čekající kousky ostatních hledání, mezi sebou v pořadí příchodu', async () => {
  const prev = setSliceMs(0); // každý kousek ve vlastním kole
  try {
    const order = [];
    const job = async (name, first, n) => {
      for (let i = 0; i < n; i++) {
        const w = breathe(first);
        if (w) await w;
        order.push(`${name}${i}`);
      }
    };
    await Promise.all([job('a', false, 3), job('b', false, 3), job('F', true, 2), job('G', true, 2)]);
    assert.deepEqual(order, ['F0', 'G0', 'F1', 'G1', 'a0', 'b0', 'a1', 'b1', 'a2', 'b2']);
    setSliceMs(Infinity);
    assert.equal(breathe(true), null, 'bez stropu kola se nečeká ani u dokončení');
  } finally {
    setSliceMs(prev);
  }
});

test('breathe: 200 ms práce ve 4 úlohách se rozdělí do kol do sliceMs – časovač se mezitím dostane ke slovu', async () => {
  const prev = setSliceMs(10);
  let ticks = 0;
  let last = performance.now();
  let gap = 0;
  const iv = setInterval(() => {
    const t = performance.now();
    gap = Math.max(gap, t - last);
    last = t;
    ticks++;
  }, 1);
  try {
    await new Promise((r) => setTimeout(r, 5));
    gap = 0;
    last = performance.now();
    ticks = 0;
    await Promise.all([0, 1, 2, 3].map(async () => {
      for (let i = 0; i < 25; i++) {
        const w = breathe();
        if (w) await w;
        busy(2);
      }
    }));
    assert.ok(ticks >= 8, `časovač za 200 ms práce běžel jen ${ticks}×`);
    assert.ok(gap < 100, `nejdelší čekání časovače ${Math.round(gap)} ms (v kuse by to bylo 200 ms)`);
  } finally {
    clearInterval(iv);
    setSliceMs(prev);
  }
});

// DEMO zdroje jako skutečné s mezipamětí: odpověď „přijde ze sítě“ (setImmediate – všechny trasy v jednom kole, nejhorší
// případ) a pokaždé jako nová kopie, data se skládají jen poprvé. Výsledky DEMO jsou deterministické.
const memo = new Map();
for (const p of mockProviders) {
  const daily = p.daily;
  p.daily = async function (q) {
    const key = JSON.stringify([p.id, q.from, q.to, q.dateFrom, q.dateTo, q.near]);
    if (!memo.has(key)) memo.set(key, daily.call(this, q));
    const legs = structuredClone(await memo.get(key));
    await new Promise((r) => setImmediate(r));
    return legs;
  };
}
// výsledek bez časů (trvání hledání a zdrojů se liší běh od běhu)
const plain = (r) => JSON.parse(JSON.stringify(r, (k, v) => (k === 'ms' ? undefined : v)));
const QUERIES = {
  'Kamkoliv zpáteční s kombinacemi': { from: ['ap:BRQ'], radiusKm: 130, to: [], dateFrom: ymdPlus(5), dateTo: ymdPlus(13), trip: 'return', nightsMin: 2, nightsMax: 4, adults: 1, kmRate: 1, groundMode: 'transit', arrival: true },
  'radar Víkendy': { from: ['ap:PRG'], radiusKm: 0, to: [], dateFrom: ymdPlus(3), dateTo: ymdPlus(45), trip: 'return', nightsMin: 1, nightsMax: 3, outDays: [5, 6], backDays: [0, 1], adults: 1, kmRate: 1, groundMode: 'transit', arrival: true },
  'radar Kdykoliv (zmenšený výsledek)': { from: ['ap:PRG'], radiusKm: 0, to: [], dateFrom: ymdPlus(3), dateTo: ymdPlus(45), trip: 'return', nightsMin: 2, nightsMax: 7, adults: 2, kmRate: 1, groundMode: 'transit', arrival: true, radar: true },
  'Kamkoliv jednosměrně': { from: ['ap:VIE'], radiusKm: 60, to: [], dateFrom: ymdPlus(5), dateTo: ymdPlus(20), trip: 'oneway', adults: 2 },
  'konkrétní cíl s kalendářem a mřížkou': { from: ['ap:PRG'], radiusKm: 250, to: ['ap:FCO', 'ap:CIA'], dateFrom: ymdPlus(10), dateTo: ymdPlus(40), trip: 'return', nightsMin: 3, nightsMax: 6, adults: 1, bags: 'cabin' },
};

test('hledání po kouscích (breathe) dá přesně stejný výsledek jako v kuse – kamkoliv, víkendy, jednosměrně, konkrétní cíl', async () => {
  const prev = setSliceMs(Infinity);
  try {
    for (const [name, q] of Object.entries(QUERIES)) {
      setSliceMs(Infinity);
      const whole = plain(await search({ ...q, noPartial: true }));
      setSliceMs(0); // nejhorší případ: každý kousek v jiném kole
      const sliced = plain(await search({ ...q, noPartial: true }));
      assert.ok(whole.groups.length > 0, `${name}: něco se našlo`);
      assert.deepEqual(sliced, whole, name);
    }
  } finally {
    setSliceMs(prev);
  }
});

// Průběžné náhledy (compose(false)) jdou po kouscích taky. Demo Air doběhne, druhý zdroj čeká (gate) – náhled ze stavu po
// Demo Air. Hledání může mezi kousky náhledu pokračovat i skončit: náhled se skládá ze stavu, kdy začal, a skončí-li
// hledání dřív, než ho doskládá, zahodí se (konečný výsledek je hned za ním, náhled po výsledku nepřijde).
const waiting = (gate) => ({
  id: 'demo-slow', name: 'Demo Slow', live: false, demo: true,
  async stations() { return null; },
  async destinations() {
    await gate;
    return [];
  },
});
async function withPartials(fn) {
  const prev = setSliceMs(Infinity);
  const first = PARTIAL.firstMs;
  PARTIAL.firstMs = 0; // náhled hned, jak Demo Air doběhne
  try {
    return await fn();
  } finally {
    setSliceMs(prev);
    PARTIAL.firstMs = first;
  }
}

// Zdroj p, který začne hledat, až se otevře gate (Demo Jet až po Demo Air).
const after = (p, gate) => ({
  ...p,
  async destinations(...a) {
    await gate;
    return p.destinations(...a);
  },
});
// Až Demo Air doběhne (stav zdrojů z průběhu hledání), za ms otevřít → zastaví.
function whenAirDone(open, ms) {
  let status = null;
  const poll = setInterval(() => {
    if (status && status.find((s) => s.id === 'demo-air').state === 'done') {
      clearInterval(poll);
      setTimeout(open, ms);
    }
  }, 1);
  return { seen: (ev) => { if (ev.type === 'progress' && !status) status = ev.providers; }, stop: () => clearInterval(poll) };
}

test('průběžný náhled po kouscích = v kuse: ze stavu, kdy začal, i když další zdroj mezitím hledá; konečný výsledek taky', () => withPartials(async () => {
  const q = QUERIES['Kamkoliv zpáteční s kombinacemi'];
  const run = async (slice) => {
    setSliceMs(slice);
    let openJet;
    let openSlow;
    const jet = new Promise((r) => { openJet = r; });
    const slow = new Promise((r) => { openSlow = r; });
    // Demo Jet začne 2 ms po Demo Air – v kuse až po náhledu, po kouscích během jeho skládání; Demo Slow až po náhledu
    const air = whenAirDone(openJet, 2);
    const safety = setTimeout(() => openSlow(), 20000); // náhled nepřišel – test selže níž, nezasekne se
    const partials = [];
    const res = await search(q, (ev) => {
      air.seen(ev);
      if (ev.type !== 'partial') return;
      partials.push(plain(ev.result));
      openSlow();
    }, { providers: [mockProviders[0], after(mockProviders[1], jet), waiting(slow)] });
    air.stop();
    clearTimeout(safety);
    return { partials, res: plain(res) };
  };
  const whole = await run(Infinity);
  const sliced = await run(0);
  assert.equal(whole.partials.length, 1);
  const p = whole.partials[0];
  assert.ok(p.partial && p.groups.length > 0);
  assert.deepEqual(p.providers.map((x) => [x.id, x.state, x.found > 0]), [['demo-air', 'done', true], ['demo-jet', 'running', false], ['demo-slow', 'running', false]]);
  assert.ok(whole.res.providers.find((x) => x.id === 'demo-jet').found > 0, 'Demo Jet pak našel taky');
  assert.deepEqual(sliced.partials, whole.partials);
  assert.deepEqual(sliced.res, whole.res);
}));

test('náhled, jehož hledání skončilo uprostřed skládání, se zahodí – po výsledku nepřijde, výsledek je stejný', () => withPartials(async () => {
  const q = QUERIES['Kamkoliv zpáteční s kombinacemi'];
  const run = async (slice) => {
    setSliceMs(slice);
    let open;
    const gate = new Promise((r) => { open = r; });
    // druhý zdroj doběhne 2 ms po Demo Air – náhled (hned po Demo Air) se v kuse stihne, po kouscích ne
    const air = whenAirDone(open, 2);
    let done = false;
    const events = [];
    const res = await search(q, (ev) => {
      air.seen(ev);
      if (ev.type === 'partial') events.push(done ? 'po výsledku' : 'náhled');
    }, { providers: [mockProviders[0], waiting(gate)] });
    done = true;
    air.stop();
    await new Promise((r) => setTimeout(r, 30)); // rozpracovaný náhled by přišel až teď
    return { events, res: plain(res) };
  };
  const whole = await run(Infinity);
  const sliced = await run(0);
  assert.deepEqual(whole.events, ['náhled']);
  assert.deepEqual(sliced.events, [], 'hledání skončilo, než se náhled doskládal');
  assert.deepEqual(sliced.res, whole.res);
}));

test('hledání neblokuje server: během hledání se dostane ke slovu časovač (dřív celé hledání v kuse)', async () => {
  const q = { ...QUERIES['Kamkoliv zpáteční s kombinacemi'], noPartial: true };
  await search(q); // data zdrojů v mezipaměti jako u oblíbených tras
  const measure = async () => {
    let ticks = 0;
    let last = performance.now();
    let gap = 0;
    const iv = setInterval(() => {
      const t = performance.now();
      gap = Math.max(gap, t - last);
      last = t;
      ticks++;
    }, 2);
    const t0 = performance.now();
    await search(q);
    const ms = performance.now() - t0;
    gap = Math.max(gap, performance.now() - last);
    clearInterval(iv);
    return { ticks, gap, ms };
  };
  const prev = setSliceMs(Infinity);
  try {
    const whole = await measure();
    setSliceMs(15);
    const sliced = await measure();
    // běžně: v kuse 3–5 tiků a blok ~200–300 ms, po kouscích ~20 tiků a nejdelší blok ~30 ms (dřív ~50 ms – konečné
    // složení výsledku, teď i to po kouscích)
    assert.ok(sliced.ticks >= 4 * Math.max(2, whole.ticks), `časovač: po kouscích ${sliced.ticks}×, v kuse ${whole.ticks}× (${Math.round(whole.ms)} ms)`);
    assert.ok(sliced.gap < whole.gap * 0.6, `nejdelší blok po kouscích ${Math.round(sliced.gap)} ms, v kuse ${Math.round(whole.gap)} ms`);
  } finally {
    setSliceMs(prev);
  }
});

test('řádek NDJSON výsledku a náhledu sdíleného hledání: JSON jednou pro všechny odběratele, průběh vždy znovu', () => {
  let calls = 0;
  const result = { groups: [{ id: 1 }], toJSON() { calls++; return { groups: this.groups }; } };
  const a = ndjsonLine({ type: 'result', result });
  const b = ndjsonLine({ type: 'result', result }); // další odběratel: nový obal, týž výsledek
  assert.equal(a, '{"type":"result","result":{"groups":[{"id":1}]}}\n');
  assert.equal(b, a);
  assert.equal(calls, 1, 'výsledek se převedl na JSON jen jednou');
  const partial = { type: 'partial', result: { groups: [], partial: true } };
  assert.equal(ndjsonLine(partial), `${JSON.stringify(partial)}\n`);
  assert.equal(ndjsonLine(partial), `${JSON.stringify(partial)}\n`);
  // průběh nese živý stav zdrojů (mění se) – pokaždé aktuální
  const providers = [{ id: 'demo-air', state: 'running' }];
  const ev = { type: 'progress', providers };
  assert.equal(ndjsonLine(ev), '{"type":"progress","providers":[{"id":"demo-air","state":"running"}]}\n');
  providers[0].state = 'done';
  assert.equal(ndjsonLine(ev), '{"type":"progress","providers":[{"id":"demo-air","state":"done"}]}\n');
  assert.equal(ndjsonLine({ type: 'wait' }), '{"type":"wait"}\n');
});
