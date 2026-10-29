// Doporučení „Kam vyrazit“ (public/js/recs.js – klasický skript pro prohlížeč, načtený přes node:vm): pořadí zemí pro
// měsíc z data/countries.json a počasí z api/climate?month= (server/lib/climate.js seasonMonth), uživatel z Prahy.
// Sezóna (v listopadu ne k moři do Norska ani na Jadran), pestrost, vynechané země (MZV, 🙈), ⭐, děti, radar a proč.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { seasonMonth } from '../server/lib/climate.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(read('public/js/data.js'), ctx, { filename: 'data.js' });
vm.runInContext(read('public/js/recs.js'), ctx, { filename: 'recs.js' });
const VIBES = vm.runInContext('VIBES', ctx);
const R = ctx.window.Recs;
const COUNTRIES = JSON.parse(read('data/countries.json'));
const BY = Object.fromEntries(COUNTRIES.map((c) => [c.iso2, c]));
const NOW = Date.parse('2026-10-23T10:00:00Z');
const TODAY = '2026-10-23';

const rank = (m, o = {}) => R.rank(COUNTRIES, m, { vibes: VIBES, season: seasonMonth(m).countries, ...o });
const isos = (r) => r.list.map((x) => x.c.iso2);
const beachForms = [
  { form: { from: [{ id: 'metro:PRG' }], to: [{ id: 'rg:kanary', label: 'Kanárské ostrovy' }], trip: 'return' } },
  { form: { from: [{ id: 'metro:PRG' }], to: [], minTemp: 25, trip: 'return' } },
  { form: { from: [{ id: 'metro:PRG' }], to: [{ id: 'metro:LON', label: 'Londýn' }], trip: 'return' } },
];

test('měsíc tipu: od 20. dne už příští (23. 10. → listopad), termín hledání letů v nejbližším takovém měsíci', () => {
  assert.equal(R.defaultMonth(new Date(2026, 9, 23)), 11);
  assert.equal(R.defaultMonth(new Date(2026, 9, 5)), 10);
  assert.equal(R.defaultMonth(new Date(2026, 11, 28)), 1, 'prosinec → leden');
  assert.deepEqual({ ...R.monthRange(11, TODAY) }, { dFrom: '2026-11-01', dTo: '2026-11-30' });
  assert.deepEqual({ ...R.monthRange(10, TODAY) }, { dFrom: '2026-10-24', dTo: '2026-10-31' }, 'letošní říjen od zítřka');
  assert.equal(R.monthRange(10, '2026-10-30'), null, 'ze zbytku měsíce nic není');
  assert.deepEqual({ ...R.monthRange(2, TODAY) }, { dFrom: '2027-02-01', dTo: '2027-02-28' }, 'únor až příští rok');
});

test('profil: k moři jen při aspoň 2 hledáních k moři / za teplem, děti z hledání, ⭐ / 🙈 / 👀 po zemích', () => {
  const p = R.profile({ recent: beachForms, form: { children: 0 }, fav: [{ key: 'LIS', label: 'Lisabon', cc: 'PT' }], mute: [{ key: 'TUN', label: 'Tunis', cc: 'TN' }, { key: 'XX' }],
    viewed: [{ label: 'Porto', cc: 'PT', at: NOW - 2 * 864e5 }, { label: 'Oslo', cc: 'NO', at: NOW - 40 * 864e5 }], now: NOW });
  assert.equal(p.sea, true);
  assert.equal(p.seaN, 2);
  assert.equal(p.kids, false);
  assert.deepEqual([...p.fav.get('PT')], ['Lisabon']);
  assert.deepEqual([...p.mute.keys()], ['TN'], 'bez země se nepočítá');
  assert.deepEqual([...p.viewed.keys()], ['PT'], 'prohlížené jen 21 dní');
  assert.equal(R.profile({ recent: beachForms.slice(1) }).sea, false, 'jedno hledání k moři nestačí');
  assert.equal(R.profile({ form: { children: 2 } }).kids, true);
  assert.equal(R.profile({ recent: [{ form: { from: [{}], to: [], infants: 1 } }] }).kids, true, 'miminko z nedávného hledání');
  assert.equal(R.profile({}).sea, false);
});

test('radar: nejlevnější čerstvá letenka do země – starší než týden, odlet v minulosti a 🙈 cíle ne', () => {
  const items = [
    { id: 'metro:LIS', cc: 'PT', czk: 2400, from: 'PRG', d1: '2026-11-12' },
    { id: 'ap:OPO', cc: 'PT', czk: 1890, from: 'VIE', d1: '2026-11-03' },
    { id: 'ap:FAO', cc: 'PT', czk: 900, from: 'PRG', d1: '2026-10-20' }, // odlet už byl
    { id: 'ap:HRG', cc: 'EG', czk: 4100, from: 'PRG', d1: '2026-11-20' },
  ];
  const radar = { all: { at: NOW - 3600e3, items }, weekend: { at: NOW - 9 * 864e5, items: [{ id: 'ap:AYT', cc: 'TR', czk: 1500, d1: '2026-11-01' }] }, lw: { '2026-11-14': { at: NOW, items: [{ id: 'metro:ROM', cc: 'IT', czk: 1700, from: 'PRG', d1: '2026-11-14' }] } } };
  const b = R.radarBest(radar, NOW, TODAY, [{ key: 'HRG', cc: 'EG' }]);
  assert.deepEqual(Object.fromEntries([...b].map(([k, v]) => [k, v.czk])), { PT: 1890, IT: 1700 });
  assert.equal(b.get('PT').from, 'VIE');
  assert.equal(R.radarBest(null, NOW, TODAY).size, 0);
});

test('Praha, listopad, nový uživatel: jen sezóna nebo měsíc vedle, bez zemí s varováním MZV a bez Česka, pestré', () => {
  const r = rank(11);
  assert.equal(r.list.length, 18);
  for (const x of r.list) {
    assert.ok(x.season > 0, `${x.c.iso2} mimo sezónu`);
    assert.ok(x.c.safety >= 3, `${x.c.iso2} bezpečnost ${x.c.safety}`);
  }
  assert.ok(!isos(r).includes('CZ') && !isos(r).includes('NO'));
  for (const cc of ['EG', 'MA', 'TH']) assert.ok(isos(r).slice(0, 8).includes(cc), `${cc} mezi prvními 8: ${isos(r)}`);
  assert.ok(r.hidden.unsafe >= 20, 'SAE, Jordánsko, Kuba… vynechané');
  assert.ok(!isos(r).includes('AE') && !isos(r).includes('CU') && !isos(r).includes('JO'));
  // pořadí = skóre na kartě (pestrost je v něm)
  r.list.forEach((x, i) => { if (i) assert.ok(x.score <= r.list[i - 1].score, `${x.c.iso2} ${x.score} > ${r.list[i - 1].score}`); });
  // pestrost: žádný světadíl nezabere víc než polovinu
  const per = {};
  r.list.forEach((x) => { per[x.c.cont] = (per[x.c.cont] || 0) + 1; });
  assert.ok(Math.max(...Object.values(per)) <= 9, JSON.stringify(per));
  // proč: počasí v měsíci u hlavního letiště
  const eg = r.list.find((x) => x.c.iso2 === 'EG');
  assert.match(eg.why[0].t, /^Hurghada: ~2\d\u00a0°C přes den$/, 'teplota před „přes den“ – na telefonu se useknutím neztratí');
  assert.match(eg.why[0].title, /dlouhodobý průměr/);
  assert.deepEqual({ ...eg.fly }, { id: 'cc:EG', label: 'Egypt' });
});

test('k moři v listopadu: Rudé moře a Kanáry ano, Norsko a Jadran ne; let rovnou do oblasti u moře', () => {
  const r = rank(11, { vibe: 'pláže' });
  const top = r.list.slice(0, 10);
  assert.ok(top.every((x) => x.vibe === 'pláže'), top.map((x) => x.c.iso2 + x.vibe).join(' '));
  const es = r.list.find((x) => x.c.iso2 === 'ES');
  assert.ok(es && es.tags.includes('pláže a moře'), 'Kanáry v listopadu');
  assert.match(es.why[0].t, /^Kanárské ostrovy: ~2\d\u00a0°C přes den$/);
  assert.equal(es.why[0].ic, '🏖️');
  assert.deepEqual({ ...es.fly }, { id: 'rg:kanary', label: 'Kanárské ostrovy' });
  const eg = r.list.find((x) => x.c.iso2 === 'EG');
  assert.match(eg.why[0].t, /^Rudé moře: /, 'bez „(Egypt)“ – země je na kartě');
  assert.equal(eg.fly.id, 'rg:egypt-more');
  for (const cc of ['NO', 'HR', 'ME', 'AL', 'BG']) {
    const x = r.list.find((y) => y.c.iso2 === cc);
    assert.ok(!x || x.vibe !== 'pláže', `${cc} v listopadu k moři`);
  }
  // bez dat o počasí (offline) k moři jen v sezóně: Chorvatsko (červen–září) ne, Egypt ano
  const off = R.rank(COUNTRIES, 11, { vibes: VIBES, vibe: 'pláže', season: null });
  assert.equal(off.list.find((x) => x.c.iso2 === 'EG').vibe, 'pláže');
  assert.ok(!off.list.some((x) => x.c.iso2 === 'HR' && x.vibe), 'Chorvatsko');
  assert.ok(off.list.every((x) => !x.why.some((w) => /°C/.test(w.t))), 'bez dat žádné teploty');
});

test('k moři v červenci: Středomoří nahoře i mimo „nejlepší měsíce“ (Řecko, Španělsko), Rudé moře ve vedru ne', () => {
  const r = rank(7, { vibe: 'pláže' });
  const top = isos(r).slice(0, 14);
  for (const cc of ['HR', 'GR', 'BG']) assert.ok(top.includes(cc), `${cc}: ${top}`);
  const gr = r.list.find((x) => x.c.iso2 === 'GR');
  assert.equal(gr.season, 1, 'Řecko v červenci je k moři sezóna');
  const eg = r.list.find((x) => x.c.iso2 === 'EG');
  assert.ok(!eg || eg.season === 0, 'Egypt v červenci (přes 33 °C) mimo sezónu');
  // jaro: Jadran v květnu ještě ne (moře se ohřívá pomaleji než vzduch)
  const may = rank(5, { vibe: 'pláže' });
  const hr = may.list.find((x) => x.c.iso2 === 'HR');
  assert.ok(!hr || hr.vibe !== 'pláže', 'Chorvatsko v květnu');
});

test('hledá hlavně k moři (bez zvoleného stylu): moře výš a štítek „moře“, věta pod nadpisem', () => {
  const prof = R.profile({ recent: beachForms });
  const base = rank(11), r = rank(11, { prof });
  const pos = (x, cc) => isos(x).indexOf(cc);
  assert.ok(pos(r, 'ES') >= 0 && (pos(base, 'ES') < 0 || pos(r, 'ES') < pos(base, 'ES')), `Kanáry výš: ${pos(base, 'ES')} → ${pos(r, 'ES')}`);
  assert.ok(isos(r).slice(0, 6).includes('EG'), isos(r).join(' '));
  assert.ok(r.list.find((x) => x.c.iso2 === 'EG').tags.includes('moře'));
  assert.match(R.profileLine(prof, r.hidden, ''), /hledáš hlavně moře/);
  assert.equal(R.profileLine(prof, r.hidden, 'hory'), '', 'zvolený styl má přednost');
});

test('s dětmi: blízké a bezpečné země výš s větou o vzdálenosti, Egypt a Turecko zůstávají', () => {
  const prof = R.profile({ form: { children: 2, adults: 2 } });
  const r = rank(11, { prof });
  for (const x of r.list.slice(0, 3)) {
    assert.ok(x.c.safety >= 4, `${x.c.iso2} bezpečnost`);
    assert.ok(seasonMonth(11).countries[x.c.iso2].km <= R.W.nearKm, `${x.c.iso2} daleko`);
    assert.ok(x.why.some((w) => /^s dětmi blízko: ~[\d\u00a0]+\u00a0km$/.test(w.t)), JSON.stringify(x.why));
  }
  const egK = isos(r).indexOf('EG');
  assert.ok(egK >= 0 && egK < 10, `Egypt (bezpečnost 4) s dětmi: ${egK}`);
});

test('⭐ Moje cíle výš, 🙈 Nezajímá mě: země s městem v 🙈 vynechaná (s ⭐ ve stejné zemi ne) a vypsaná', () => {
  const fav = [{ key: 'LIS', label: 'Lisabon', cc: 'PT' }];
  const base = rank(11), r = rank(11, { prof: R.profile({ fav, mute: [{ key: 'HRG', label: 'Hurghada', cc: 'EG' }] }) });
  assert.ok(!isos(r).includes('EG'));
  assert.deepEqual([...r.hidden.mute], ['Egypt']);
  assert.ok(isos(r).indexOf('PT') < isos(base).indexOf('PT'), 'Portugalsko výš');
  assert.ok(r.list.find((x) => x.c.iso2 === 'PT').why.some((w) => w.t === 'Moje cíle: Lisabon'));
  assert.match(R.profileLine(R.profile({ fav }), r.hidden, ''), /🙈 vynechávám Egypt/);
  // ⭐ i 🙈 v téže zemi: zemi chce – zůstává
  const both = rank(11, { prof: R.profile({ fav: [{ key: 'SSH', label: 'Šarm aš-Šajch', cc: 'EG' }], mute: [{ key: 'HRG', label: 'Hurghada', cc: 'EG' }] }) });
  assert.ok(isos(both).includes('EG'));
  assert.deepEqual([...both.hidden.mute], []);
});

test('radar zná letenku: věta „tam i zpět od …“ a trochu výš; Přehled bez navštívených zemí', () => {
  const radar = new Map([['PT', { czk: 1890, from: 'PRG', d1: '2026-11-12' }]]);
  const r = rank(11, { radar });
  const pt = r.list.find((x) => x.c.iso2 === 'PT');
  assert.ok(pt.why.some((w) => w.t === 'tam i zpět od 1\u00a0890\u00a0Kč' && /PRG.*12\.\u00a011\./.test(w.title)), JSON.stringify(pt.why));
  assert.ok(isos(r).indexOf('PT') <= isos(rank(11)).indexOf('PT'));
  const dash = rank(11, { skip: new Set(['MA', 'EG']), n: 4 });
  assert.equal(dash.list.length, 4);
  assert.ok(!isos(dash).includes('MA') && !isos(dash).includes('EG'));
  // rozpočet a bezpečnost z výběru
  const cheap = rank(11, { budget: 2, safe: 5 });
  assert.ok(cheap.list.every((x) => x.c.cost <= 2 && x.c.safety === 5));
});

test('kde už jsi byl (mapa, proběhlá cesta): země níž s větou „už jsi tu byl/a“, ne pryč; se ⭐ cílem ne', () => {
  const base = rank(11), ma = isos(base).indexOf('MA');
  assert.ok(ma >= 0 && ma < 3, `Maroko v listopadu nahoře: ${ma}`);
  const r = rank(11, { been: new Set(['MA']) });
  assert.ok(isos(r).includes('MA'), 'zůstává');
  assert.ok(isos(r).indexOf('MA') > ma + 2, `níž: ${ma} → ${isos(r).indexOf('MA')}`);
  const x = r.list.find((y) => y.c.iso2 === 'MA');
  assert.ok(x.why.some((w) => w.ic === '🗺️' && w.t === 'už jsi tu byl/a'));
  assert.ok(x.score < base.list.find((y) => y.c.iso2 === 'MA').score);
  assert.equal(r.hidden.been, 1);
  assert.match(R.profileLine(R.profile({}), r.hidden, ''), /🗺️ země, kde už jsi byl\/a, níž/);
  // ⭐ cíl v zemi, kde už byl: chce se vrátit – pořadí jako bez návštěvy
  const fav = R.profile({ fav: [{ key: 'RAK', label: 'Marrákeš', cc: 'MA' }] });
  assert.deepEqual(isos(rank(11, { prof: fav, been: new Set(['MA']) })), isos(rank(11, { prof: fav })));
  assert.equal(rank(11, { prof: fav, been: new Set(['MA']) }).hidden.been, 0);
  // bez been beze změny
  assert.deepEqual(isos(rank(11, { been: new Set() })), isos(base));
});

test('app.js: Doporučení počítají s mapou navštívených i proběhlými cestami (beenIn)', () => {
  const app = read('public/js/app.js');
  assert.match(app, /Recs\.rank\(COUNTRIES, m, \{ vibes: VIBES, prof, radar, been: beenIn\(\), \.\.\.o \}\)/);
  assert.match(app, /const beenIn = \(\) => new Set\(\[\.\.\.visited, \.\.\.\(S\.trips \|\| \[\]\)\.filter\(t => t && \(t\.end \|\| t\.start\) && \(t\.end \|\| t\.start\) < todayLocal\(\)\)/);
});

test('Doporučení na telefonu: vysvětlivka pod nadpisem „Kam vyrazit · měsíc“ (vedle sebe se obojí lámalo do dvou řádků), počítač beze změny', () => {
  assert.match(read('public/index.html'), /<div class="section-head rec-head"><h2 id="recTitle">Kam teď vyrazit<\/h2><span class="faint" style="font-size:12px">číslo = jak se hodí teď · ● ceny · ☀️ sezóna<\/span><\/div>/);
  assert.match(read('public/css/atlas.css'), /@media\(max-width:1023px\)\{\.rec-head\{flex-direction:column;align-items:flex-start;gap:4px\}\}/);
});

test('Přehled – dlaždice „Tip na měsíc“: k názvu země teplota přes den z Doporučení, bez údaje jen název', async () => {
  const vmod = await import('node:vm');
  const line = read('public/js/app.js').match(/^const tipDeg = .*$/m)[0];
  const c = { };
  vmod.createContext(c);
  vmod.runInContext(`${line}\nthis.tipDeg = tipDeg;`, c);
  assert.equal(c.tipDeg({ why: [{ ic: '🏖️', t: 'Hurghada: ~28 °C přes den' }] }), ' · 🏖️ ~28 °C');
  assert.equal(c.tipDeg({ why: [{ ic: '✈️', t: 'tam i zpět od 2 900 Kč' }, { ic: '🌡️', t: 'Ulánbátar: ~-8 °C přes den' }] }), ' · 🌡️ ~-8 °C', 'i pod nulou, i když není první');
  assert.equal(c.tipDeg({ why: [{ ic: '⭐', t: 'Moje cíle: Řím' }] }), '');
  assert.equal(c.tipDeg({}), '');
  assert.match(read('public/js/app.js'), /topRec \? topRec\.c\.cs \+ tipDeg\(topRec\) : ''/);
});
