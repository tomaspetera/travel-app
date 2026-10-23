// 💡 Karta hlídání – kdy koupit: statistika historie ceny (Nejníž, Teď, za týden), dny do odletu a opatrný tip
// (public/js/alerts.js – watchStats, depDays, buyTip, dayTxt, sparkPath; klasický skript načtený přes node:vm).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = { window: {} };
vm.runInNewContext(readFileSync(new URL('../public/js/alerts.js', import.meta.url), 'utf8'), ctx);
const A = ctx.window.Alerts;
const plain = (v) => JSON.parse(JSON.stringify(v)); // objekty z jiného vm kontextu
const H = 3600e3, D = 24 * H;
// poledne místního času – dayTxt počítá místní dny (jako karta v prohlížeči)
const NOW = new Date(2026, 9, 23, 12, 0).getTime();
const kc = (n) => n.toLocaleString('cs-CZ') + ' Kč';
/** Hlídání s historií: ceny po dnech dozadu, poslední = teď (dnes v poledne). */
const watch = (prices, { step = D, ...rest } = {}) => {
  const history = prices.map((czk, i) => ({ at: NOW - (prices.length - 1 - i) * step, czk }));
  return { id: 'w', history, best: { czk: prices[prices.length - 1] }, checked: NOW, ...rest };
};

test('sparkPath: souřadnice bodů a index nejnižší ceny (poslední z několika stejných)', () => {
  const sp = A.sparkPath([{ at: 0, czk: 1500 }, { at: 10, czk: 1290 }, { at: 20, czk: 1400 }, { at: 30, czk: 1290 }, { at: 40, czk: 1490 }], 100, 30, 0);
  assert.equal(sp.xy.length, 5);
  assert.equal(sp.lo, 3, 'nejníž naposledy');
  assert.deepEqual(plain(sp.xy[3]), [75, 30], 'nejlevnější dole');
  assert.deepEqual(plain(sp.last), plain(sp.xy[4]));
});

test('dayTxt: dnes, včera, jinak „12. 10.“ (místní dny)', () => {
  assert.equal(A.dayTxt(NOW - 3 * H, NOW), 'dnes');
  assert.equal(A.dayTxt(new Date(2026, 9, 22, 23, 50).getTime(), new Date(2026, 9, 23, 0, 10).getTime()), 'včera', 'přes půlnoc');
  assert.equal(A.dayTxt(new Date(2026, 9, 12, 8, 0).getTime(), NOW), '12. 10.');
  assert.equal(A.dayTxt(null, NOW), '');
});

test('watchStats: nejnižší cena s dnem (poslední výskyt), teď, rozpětí, dny hlídání', () => {
  const w = watch([1690, 1590, 1290, 1390, 1290, 1450, 1520, 1490]);
  const st = A.watchStats(w, NOW);
  assert.equal(st.n, 8);
  assert.equal(st.cur, 1490);
  assert.equal(st.low.czk, 1290);
  assert.equal(st.low.at, NOW - 3 * D, 'stejná nejnižší cena dvakrát → ta pozdější');
  assert.equal(A.dayTxt(st.low.at, NOW), '20. 10.');
  assert.equal(st.min, 1290);
  assert.equal(st.max, 1690);
  assert.equal(st.swing, 31, '(1690 − 1290) / 1290');
  assert.equal(st.span, 7);
  assert.equal(st.days, 7);
});

test('watchStats: změna za týden – kontrola ~7 dní před poslední (12 h tolerance), jinak nejstarší aspoň ~den stará', () => {
  // kontroly každých 6 h po 10 dní: před týdnem 1600, teď 1490
  const prices = Array.from({ length: 41 }, (_, i) => (i === 12 ? 1600 : i < 12 ? 1700 : 1490));
  const st = A.watchStats(watch(prices, { step: 6 * H }), NOW);
  assert.deepEqual(plain({ czk: st.week.czk, d: st.week.d, pct: st.week.pct, days: st.week.days, dir: st.week.dir }), { czk: 1600, d: -110, pct: -7, days: 7, dir: 'down' });
  // kontrola před 6 dny a 13 h (dnes ráno jsem přišel dřív) se počítá jako „před týdnem“
  const w2 = { history: [{ at: NOW - 6.6 * D, czk: 1400 }, { at: NOW - 2 * D, czk: 1450 }, { at: NOW, czk: 1470 }], best: { czk: 1470 }, checked: NOW };
  const wk2 = A.watchStats(w2, NOW).week;
  assert.equal(wk2.days, 7);
  assert.equal(wk2.dir, 'up');
  assert.equal(wk2.pct, 5);
  // hlídání 3 dny: srovnání s nejstarší kontrolou a poctivě „za 3 dny“
  const wk3 = A.watchStats(watch([1500, 1500, 1520, 1510]), NOW).week;
  assert.equal(wk3.days, 3);
  assert.equal(wk3.dir, 'flat', 'pod 3 % beze změny');
  // jediná kontrola, nebo všechny v jednom dni → nic
  assert.equal(A.watchStats(watch([1500]), NOW).week, null);
  assert.equal(A.watchStats(watch([1500, 1400, 1300], { step: 3 * H }), NOW).week, null);
  // bez ceny teď (poslední kontrola nic nenašla) → nic
  assert.equal(A.watchStats({ ...watch([1500, 1400, 1300]), best: null }, NOW).week, null);
});

test('watchStats: nový základ (epoch), poškozené body, nejnižší cena z oříznuté historie, prázdné hlídání', () => {
  const w = watch([900, 950, 1500, 1450]);
  w.history[2].own = 1; // změna 🏠 vlastní ceny na letiště: starší ceny se nesrovnávají
  const st = A.watchStats(w, NOW);
  assert.equal(st.n, 2);
  assert.equal(st.low.czk, 1450);
  assert.equal(st.min, 1450);
  const bad = A.watchStats({ history: [null, { at: 'x', czk: 1 }, { at: NOW - D, czk: -5 }, { at: NOW - D, czk: 1600 }, { at: NOW, czk: 1500 }], best: { czk: 1500 }, checked: NOW }, NOW);
  assert.equal(bad.n, 2);
  // w.low drží nejnižší cenu i z kontrol, které z 60 bodů historie vypadly – den už neznáme
  const old = A.watchStats({ ...watch([1500, 1480, 1490]), low: 1190 }, NOW);
  assert.deepEqual(plain(old.low), { czk: 1190, at: null });
  const empty = A.watchStats({ id: 'x' }, NOW);
  assert.deepEqual(plain({ n: empty.n, cur: empty.cur, low: empty.low, week: empty.week }), { n: 0, cur: null, low: null, week: null });
  // jen cena bez historie (starší data)
  assert.deepEqual(plain(A.watchStats({ best: { czk: 1800 }, checked: NOW - H }, NOW).low), { czk: 1800, at: NOW - H });
});

test('depDays: odlet nejlevnější nabídky, přesná data, víc měst; flexibilní rozsah bez data nabídky a proběhlý odlet → null', () => {
  const T = '2026-10-23';
  assert.equal(A.depDays({ best: { czk: 1, dep: '2026-11-01' }, form: { dateMode: 'flex', dFrom: '2026-10-25', dTo: '2026-12-20' } }, T), 9);
  assert.equal(A.depDays({ best: null, form: { dateMode: 'exact', xOut: '2026-12-22' } }, T), 60);
  assert.equal(A.depDays({ form: { trip: 'multi', legs: [{ date: '2026-10-30' }, { date: '2026-11-04' }] } }, T), 7);
  assert.equal(A.depDays({ best: { czk: 1 }, form: { dateMode: 'flex', dFrom: '2026-10-26', dTo: '2026-12-20' } }, T), null, 'začátek rozsahu není odlet');
  assert.equal(A.depDays({ best: { czk: 1, dep: '2026-10-20' }, form: {} }, T), null);
  assert.equal(A.depDays({ best: { czk: 1, dep: '2026-10-23' } }, T), 0, 'odlet dnes');
  assert.equal(A.depDays(null, T), null);
});

const tip = (prices, x = {}, opt = {}) => plain(A.buyTip(A.watchStats(watch(prices, opt), NOW), x));
const BUMPY = [1690, 1590, 1290, 1390, 1550, 1450, 1520, 1490]; // 7 dní, kolísá o 31 %

test('buyTip: příklady z karty – pod obvyklou cenou kup, blízko odletu ceny rostou, daleko a kolísá počkej', () => {
  assert.deepEqual(tip([1600, 1550, 1490], { days: 70, level: 'low', lvlWhy: 'levnější než 80 % nabídek do tohoto cíle' }),
    { kind: 'buy', text: 'Teď je to pod obvyklou cenou – kup', why: '„Je to dobrá cena?“: levnější než 80 % nabídek do tohoto cíle' });
  assert.deepEqual(tip(BUMPY, { days: 9 }),
    { kind: 'late', text: 'Do odletu 9 dní – ceny u nízkonákladovek obvykle už spíš rostou', why: 'jestli ti termín sedí, čekáním se nejspíš nic nezíská' });
  assert.deepEqual(tip(BUMPY, { days: 60 }),
    { kind: 'wait', text: 'Cena kolísá, zatím počkej (zbývá 60 dní)', why: `za 7 dní mezi ${kc(1290)} a ${kc(1690)} – nastav si 🎯\u00a0cílovou cenu` });
});

test('buyTip: pořadí pravidel a prahy', () => {
  // 1. cílová cena má přednost před vším
  assert.equal(tip(BUMPY, { days: 60, target: 1500 }).kind, 'buy');
  assert.match(tip(BUMPY, { days: 60, target: 1500 }).why, /tvoje cena 1\s500/);
  assert.equal(tip(BUMPY, { days: 60, target: 1400 }).kind, 'wait', 'nad cílem nic');
  // 2. dobrá cena, ale daleko před odletem a nedávno o ≥ 10 % levnější → kolísá, ne „kup“
  assert.equal(tip(BUMPY, { days: 60, level: 'low' }).text, 'Cena kolísá, zatím počkej (zbývá 60 dní)');
  assert.equal(tip(BUMPY, { days: 30, level: 'low' }).kind, 'buy', 'blíž odletu dobrá cena platí');
  // 3. blízko odletu: práh 21 dní
  assert.equal(tip(BUMPY, { days: 20 }).text, 'Do odletu 20 dní – ceny u nízkonákladovek obvykle už spíš rostou');
  assert.equal(tip(BUMPY, { days: 21 }).text, 'Do odletu 21 dní – čekání se už spíš nevyplatí');
  assert.equal(tip(BUMPY, { days: 0 }).text, 'Odlet je dnes – ceny u nízkonákladovek obvykle už spíš rostou');
  assert.deepEqual(tip(BUMPY, { days: 5, level: 'high' }), { kind: 'late', text: 'Do odletu 5 dní – levněji už to nejspíš nebude', why: 'cena je nad obvyklou – zkus jiné dny nebo letiště' });
  assert.match(tip([1600, 1500, 1450, 1400], { days: 9 }).why, /teď je u nejnižší ceny/);
  // 4. nejníž za týden hlídání (cena se hýbe) → kup; po 6 dnech ještě ne
  const back = [1500, 1600, 1700, 1650, 1600, 1550, 1520, 1490]; // zdražila a vrátila se pod cenu před týdnem
  assert.deepEqual(tip(back, { days: 80 }), { kind: 'buy', text: 'Teď je nejníž za 7 dní hlídání – kup, jestli ti termín sedí', why: 'levněji to ještě být může, ale nemusí' });
  assert.notEqual(tip(back.slice(1), { days: 80 }).kind, 'buy', '6 dní hlídání je málo');
  assert.notEqual(tip(back, { days: 80, level: 'high' }).kind, 'buy', 'nad obvyklou cenou ne');
  assert.notEqual(tip([1500, 1505, 1500, 1495, 1500, 1500, 1498, 1490], { days: 80 }).kind, 'buy', 'rovná cena: „nejníž“ nic neznamená');
  // pořád klesá: daleko před odletem počkej, za 21–49 dní je nejnižší cena dobrá chvíle
  const dip = [1690, 1590, 1550, 1600, 1520, 1500, 1480, 1450];
  assert.equal(tip(dip, { days: 80 }).text, 'Cena klesá, zatím počkej (zbývá 80 dní)');
  assert.equal(tip(dip, { days: 30 }).text, 'Teď je nejníž za 7 dní hlídání – kup, jestli ti termín sedí');
  // 5. 21–49 dní: čekání se spíš nevyplatí; práh 50
  assert.equal(tip(BUMPY, { days: 49 }).kind, 'late');
  assert.equal(tip(BUMPY, { days: 49, level: 'high' }).text, 'Do odletu 49 dní a cena je nad obvyklou – čekání se spíš nevyplatí');
  assert.equal(tip(BUMPY, { days: 50 }).kind, 'wait');
});

test('buyTip: daleko před odletem – málo dat, kolísá (práh 10 %), klesá, nad obvyklou, stoupá, drží se', () => {
  assert.deepEqual(tip([1500], { days: 90 }), { kind: 'info', text: 'Zatím sleduj (zbývá 90 dní)', why: 'na radu z vývoje ceny je zatím málo kontrol' });
  assert.equal(tip([1500, 1400, 1300], { days: 90 }, { step: 6 * H }).kind, 'info', '3 kontroly v jednom dni jsou pořád jeden den');
  assert.equal(tip([1500, 1450], {}).text, 'Zatím sleduj', 'bez dne odletu bez „zbývá“');
  // rozpětí 9 % ještě nekolísá, 10 % ano
  assert.match(tip([1090, 1000, 1050, 1080], { days: 90 }).text, /^Cena se drží|^Cena stoupá/);
  assert.equal(tip([1100, 1000, 1050, 1080], { days: 90 }).text, 'Cena kolísá, zatím počkej (zbývá 90 dní)');
  // levněji než před týdnem, ale o ≥ 10 % nad nedávným minimem → kolísá, ne „klesá“
  assert.equal(tip(BUMPY, { days: 90 }).text, 'Cena kolísá, zatím počkej (zbývá 90 dní)');
  // klesá (za týden o ≥ 3 %, rozpětí pod 10 %)
  const down = tip([1560, 1550, 1540, 1530, 1520, 1510, 1500, 1500], { days: 90 });
  assert.equal(down.text, 'Cena klesá, zatím počkej (zbývá 90 dní)');
  assert.equal(down.why, `za týden o ${kc(60)} (−4 %) – nastav si 🎯\u00a0cílovou cenu`);
  assert.match(tip([1560, 1550, 1540, 1530, 1520, 1510, 1500, 1500], { days: 90, target: 1200 }).why, /ATLAS hlídá tvou cenu 1\s200/);
  assert.equal(tip([1500, 1505, 1510, 1500], { days: 90, level: 'high', lvlWhy: 'dráž než 90 % nabídek do tohoto cíle' }).why, '„Je to dobrá cena?“: dráž než 90 % nabídek do tohoto cíle');
  const up = tip([1450, 1460, 1470, 1480, 1490, 1500, 1500, 1510], { days: 90 });
  assert.equal(up.text, 'Cena stoupá – zatím sleduj (zbývá 90 dní)');
  assert.match(up.why, /^za týden o 60 Kč \(\+4 %\); .*může zase klesnout, ale nemusí$/);
  assert.deepEqual(tip([1500, 1505, 1510, 1500], { days: 90 }), { kind: 'wait', text: 'Cena se drží, zatím můžeš počkat (zbývá 90 dní)', why: `už 3 dny kolem ${kc(1500)} – nastav si 🎯\u00a0cílovou cenu` });
});

test('buyTip: bez ceny nic; žádný tip nic neslibuje', () => {
  assert.equal(A.buyTip(A.watchStats({ id: 'x' }, NOW), { days: 30 }), null);
  assert.equal(A.buyTip(null), null);
  const all = [];
  for (const prices of [[1500], [1500, 1450], BUMPY, [1690, 1590, 1550, 1600, 1520, 1500, 1480, 1450], [1500, 1505, 1510, 1500]]) {
    for (const days of [null, 0, 9, 30, 60, 120]) {
      for (const level of [null, 'low', 'normal', 'high']) for (const target of [null, 1000, 2000]) all.push(tip(prices, { days, level, target }));
    }
  }
  for (const t of all) {
    assert.ok(['buy', 'late', 'wait', 'info'].includes(t.kind), t.kind);
    assert.ok(t.text && t.why, 'vždy s důvodem');
    assert.doesNotMatch(`${t.text} ${t.why}`, /určitě|jistě|zaručen|garant|100 %|stoprocent/i, 'jistotu nikdo nemá');
    assert.doesNotMatch(`${t.text} ${t.why}`, /undefined|NaN|null/);
  }
});
