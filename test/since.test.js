// 🕘 Od minula (public/js/since.js): kdy se karta po návratu ukáže a co v ní je – jen z uloženého stavu (historie
// hlídaných cen, plánovač, uložený radar, odložené nabídky). Klasické skripty prohlížeče přes node:vm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = { console, Intl, Date };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['alerts.js', 'ics.js', 'since.js']) vm.runInContext(readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8'), ctx, { filename: f });
const S = ctx.Since;
const plain = (v) => JSON.parse(JSON.stringify(v)); // objekty z jiného vm kontextu
const kc = (n) => n.toLocaleString('cs-CZ') + ' Kč';

// místní čas (testy nezávisí na časové zóně stroje): návrat ve čtvrtek 22. 10. ráno, minule v pondělí 19. 10. večer
const at = (d, h, m = 0) => new Date(2026, 9, d, h, m).getTime();
const NOW = at(22, 9), FROM = at(19, 20), TODAY = '2026-10-22', H = 36e5;

test('dayRef: včera, den v týdnu do týdne, jinak datum', () => {
  assert.equal(S.dayRef(at(21, 22), NOW), 'včera');
  assert.equal(S.dayRef(FROM, NOW), 'v pondělí');
  assert.equal(S.dayRef(at(17, 10), NOW), 'v sobotu');
  assert.equal(S.dayRef(at(16, 10), NOW), 'v pátek');
  assert.equal(S.dayRef(at(15, 10), NOW), '15. 10.', 'před týdnem by „ve čtvrtek“ znělo jako tento týden');
  assert.equal(S.dayRef(at(12, 10), NOW), '12. 10.');
  assert.equal(S.dayRef(at(22, 7), NOW), 'dnes');
});

test('gate: poprvé nic, návrat jiný den otevře okno se základem = minulá návštěva', () => {
  const first = S.gate(null, NOW);
  assert.equal(first.from, null);
  assert.equal(first.mem.last, NOW, 'zapamatuje si návštěvu');
  const g = S.gate({ last: FROM, hid: ['x'] }, NOW);
  assert.equal(g.from, FROM);
  assert.equal(g.fresh, true);
  assert.deepEqual(plain(g.mem), { last: NOW, from: FROM, at: NOW, hid: ['x'] });
});

test('gate: týž den ani přes půlnoc po chvíli okno neotevře; jiný den po 8 h ano', () => {
  assert.equal(S.gate({ last: at(22, 7) }, NOW).from, null, 'ráno podruhé');
  assert.equal(S.gate({ last: at(21, 23, 50) }, at(22, 0, 10)).from, null, '23:50 → 0:10');
  assert.equal(S.gate({ last: at(21, 23) }, at(22, 7, 30)).from, at(21, 23), 'večer → ráno (8,5 h)');
  assert.equal(S.gate({ last: NOW + 2 * H }, NOW).from, null, 'čas z budoucnosti (hodiny jiného zařízení) se nebere');
  assert.equal(S.gate({ last: 'x', from: 'y' }, NOW).from, null, 'poškozený stav');
});

test('gate: okno vydrží 12 h od návratu (znovu otevřená aplikace ho neztratí), propadlé nabídky jen v tomtéž okně', () => {
  const open = { last: at(22, 9, 30), from: FROM, at: NOW, hid: [], gone: [{ k: 'a', d1: '2026-10-20', label: 'Řím' }], shut: NOW };
  const g = S.gate(open, NOW + 3 * H);
  assert.equal(g.from, FROM);
  assert.equal(g.fresh, false);
  assert.equal(g.mem.at, NOW);
  assert.equal(g.mem.gone.length, 1);
  assert.equal(g.mem.shut, NOW, 'zavřené ✕ v tomhle okně');
  assert.equal(S.gate(open, NOW + 13 * H).from, null, 'po 12 h karta zmizí');
  const next = S.gate({ ...open, last: at(22, 10) }, at(24, 9));
  assert.equal(next.fresh, true);
  assert.equal(next.mem.gone, undefined, 'nový návrat = nové okno bez starých nabídek…');
  assert.equal(next.mem.shut, undefined, '…a znovu otevřené');
});

test('gonePins: odložené nabídky s odletem před dneškem zachytí před úklidem, každou jednou', () => {
  const pin = (k, d1, label, extra = {}) => ({ k, kind: 'r', r: { d1 }, dest: { id: 'metro:' + k, key: k, label, cc: 'IT' }, ...extra });
  const full = { k: 'f1', kind: 'f', t: { out: { date: '2026-10-21' } }, dest: { id: null, key: 'LIS', label: 'Lisabon', cc: 'PT' } };
  const g = S.gonePins([{ k: 'ROM', d1: '2026-10-20', label: 'Řím', id: 'metro:ROM', cc: 'IT' }], [pin('ROM', '2026-10-20', 'Řím'), pin('NAP', '2026-10-22', 'Neapol'), full, null, { k: 'x' }], TODAY);
  assert.deepEqual(plain(g), [
    { k: 'ROM', d1: '2026-10-20', label: 'Řím', id: 'metro:ROM', cc: 'IT' },
    { k: 'f1', d1: '2026-10-21', label: 'Lisabon', id: 'ap:LIS', cc: 'PT' },
  ], 'odlet dnes ještě platí; bez id místa letiště z klíče');
});

// hlídání: minule (před FROM) 2 500 Kč, po návratu zkontrolováno znovu
const watch = (id, cur, extra = {}) => ({
  id, label: `Praha → ${id}`, form: { dateMode: 'flex', dFrom: '2026-11-01', dTo: '2026-12-01' },
  best: { czk: cur }, checked: NOW - H, seen: 2500,
  history: [{ at: FROM - 10 * H, czk: 2600 }, { at: FROM - H, czk: 2500 }, { at: NOW - H, czk: cur }], ...extra,
});
const base = (o = {}) => ({ from: FROM, now: NOW, today: TODAY, ...o });

test('digest: zlevnění od minulé návštěvy s cenou z poslední kontroly před ní', () => {
  const l = plain(S.digest(base({ watch: [watch('Řím', 2160)] })));
  assert.equal(l.length, 1);
  assert.deepEqual(l[0], { kind: 'drop', sig: 'd:Řím@2160', ico: '📉', b: 'Praha → Řím', t: `o ${kc(340)} levněji než v pondělí · teď ${kc(2160)}`, go: { to: 'watch', id: 'Řím' } });
});

test('digest: hlídání bez nové kontroly, viděné, s proběhlým termínem nebo zlevněné o méně než 1 % nic neřekne', () => {
  assert.deepEqual(plain(S.digest(base({ watch: [watch('A', 2160, { checked: FROM - H })] }))), [], 'od minula nekontrolováno (kontrola po otevření ještě nedoběhla)');
  assert.deepEqual(plain(S.digest(base({ watch: [watch('B', 2160, { seen: 2160 })] }))), [], 'už viděné (prohlédnutý seznam, 📉 karta)');
  assert.deepEqual(plain(S.digest(base({ watch: [watch('C', 2160, { form: { dateMode: 'exact', xOut: '2026-10-20' } })] }))), [], 'proběhlý termín');
  assert.deepEqual(plain(S.digest(base({ watch: [watch('C2', 2160, { best: { czk: 2160, dep: '2026-10-21' } })] }))), [], 'nabídka už odletěla (termín hledání trvá)');
  assert.equal(plain(S.digest(base({ watch: [watch('C3', 2160, { best: { czk: 2160, dep: TODAY } })] }))).length, 1, 'odlet dnes ještě platí');
  assert.deepEqual(plain(S.digest(base({ watch: [watch('D', 2490)] }))), [], 'jen drobný výkyv');
  assert.deepEqual(plain(S.digest(base({ watch: [watch('E', 2700)] }))), [], 'zdražení');
  const nov = watch('F', 2160, { history: [{ at: NOW - H, czk: 2160 }] });
  assert.deepEqual(plain(S.digest(base({ watch: [nov] }))), [], 'hlídání přidané až po minulé návštěvě – není s čím srovnat');
  const reb = watch('G', 1900, { history: [{ at: FROM - H, czk: 2500 }, { at: NOW - H, czk: 1900, own: 1 }] });
  assert.deepEqual(plain(S.digest(base({ watch: [reb] }))), [], 'nový základ ceny (🏠 vlastní ceny) není zlevnění');
});

test('digest: pod cílovou cenou od minula napřed, víc zlevnění v jednom řádku s počtem, 📉 karta se neopakuje', () => {
  const hit = watch('Lisabon', 2300, { target: 2400 });
  const ws = [watch('Řím', 2160), hit, watch('Nice', 2400), watch('Oslo', 2000)];
  const l = plain(S.digest(base({ watch: ws })));
  assert.deepEqual(l.map((x) => x.kind), ['hit', 'drop']);
  assert.equal(l[0].t, `teď ${kc(2300)} – pod tvou cenou ${kc(2400)}`);
  assert.equal(l[1].b, 'Praha → Oslo');
  assert.equal(l[1].t, `o ${kc(500)} levněji než v pondělí · teď ${kc(2000)} · a 2 další`);
  const skip = plain(S.digest(base({ watch: ws, skip: ['Oslo'] })));
  assert.equal(skip[1].b, 'Praha → Řím', 'Oslo už je na velké 📉 kartě');
  assert.match(skip[1].t, /· a 1 další$/);
  assert.equal(plain(S.digest(base({ watch: [watch('X', 2300, { target: 2400, history: [{ at: FROM - H, czk: 2350 }, { at: NOW - H, czk: 2300 }] })] })))[0].kind, 'drop', 'pod cílem byla už minule');
  const old = watch('Y', 2160, { history: [{ at: at(12, 10), czk: 2500 }, { at: NOW - H, czk: 2160 }] });
  assert.match(plain(S.digest(base({ watch: [old] })))[0].t, /než 12\. 10\./, 'cena z dřívější kontroly – s jejím dnem');
});

// cesta za 5 dní s letem Ryanairu (čas odletu → online check-in 24 h předem)
const trip = (extra = {}) => ({
  name: 'Lisabon 27.10.', dest: 'Lisabon', start: '2026-10-27', end: '2026-10-31',
  legs: [{ from: 'PRG', to: 'LIS', date: '2026-10-27', dep: '2026-10-27T06:10', arr: '2026-10-27T08:55', fromTz: 'Europe/Prague', toTz: 'Europe/Lisbon', carrier: 'Ryanair' }],
  checklist: [{ t: 'Zařídit cestovní pojištění', done: false }, { t: 'Pas', done: false }], ...extra,
});

test('digest: cesta za 3–7 dní – kdy odlet a kdy se otevře online check-in, jinak co zbývá zařídit', () => {
  const l = plain(S.digest(base({ trips: [{ name: 'Proběhlá', start: '2026-10-01' }, trip()] })));
  assert.deepEqual(l, [{ kind: 'trip', sig: 't:2026-10-27|Lisabon', ico: '✈️', b: 'Lisabon', t: 'odlet za 5 dní (út\u00a027.\u00a010.) · online check-in Ryanair od po\u00a026.\u00a010. v 6:10', go: { to: 'trip', i: 1 } }]);
  const noTime = plain(S.digest(base({ trips: [trip({ legs: [], flight: 'PRG → LIS' })] })))[0];
  assert.equal(noTime.t, 'odlet za 5 dní (út\u00a027.\u00a010.) · zbývá zařídit 1'); // datum s pevnými mezerami – na telefonu se nerozdělí
  const train = plain(S.digest(base({ trips: [trip({ legs: [], start: '2026-10-25', ground: [{ from: 'Praha', to: 'Vídeň', date: '2026-10-25' }], checklist: [] })] })))[0];
  assert.equal(train.ico, '🧳');
  assert.equal(train.t, 'odjezd za 3 dny (ne\u00a025.\u00a010.)');
  assert.deepEqual(plain(S.digest(base({ trips: [trip({ start: '2026-10-24' })] }))), [], 'za 2 dny ukazuje karta 📍 Dnes na cestě');
  assert.deepEqual(plain(S.digest(base({ trips: [trip({ start: '2026-11-05' })] }))), [], 'za 2 týdny ještě ne');
  assert.equal(plain(S.digest(base({ trips: [trip({ start: '2026-10-29', name: 'Pozdější' }), trip()] })))[0].go.i, 1, 'nejbližší');
});

const rItem = (id, label, czk, extra = {}) => ({ id, label, to: id.slice(-3), czk, d1: '2026-11-06', ...extra });
test('digest: radar jen s novými cíli od minula (obnovený po návratu, bez výpadku)', () => {
  const items = [rItem('metro:LON', 'Londýn', 1290, { newAt: NOW - H }), rItem('metro:BCN', 'Barcelona', 990, { newAt: NOW - H }), rItem('metro:ROM', 'Řím', 800, { was: { czk: 900, at: FROM - H } }), rItem('metro:OSL', 'Oslo', 700, { newAt: FROM - 2 * H })];
  const l = plain(S.digest(base({ radar: { at: NOW - H, items, mode: 'weekend' } })));
  assert.deepEqual(l, [{ kind: 'radar', sig: 'r:metro:BCN,metro:LON', ico: '📡', b: 'Radar', t: `2 nové levné víkendy – nejlevnější Barcelona za ${kc(990)}`, go: { to: 'radar' } }]);
  assert.equal(plain(S.digest(base({ radar: { at: NOW - H, items: items.slice(0, 1), mode: 'all' } })))[0].t, `nový levný cíl: Londýn za ${kc(1290)}`);
  assert.deepEqual(plain(S.digest(base({ radar: { at: FROM - H, items, mode: 'all' } }))), [], 'radar od minula neobnovený');
  assert.deepEqual(plain(S.digest(base({ radar: { at: NOW - H, items, mode: 'all', partial: true } }))), [], 'výpadek zdroje');
  assert.deepEqual(plain(S.digest(base({ radar: { at: NOW - H, items: items.slice(2), mode: 'all' } }))), [], 'jen zlevnění a staré „nové“ – nic nového');
});

test('digest: propadlé odložené nabídky – hledat nové termíny do stejných míst', () => {
  const gone = [{ k: 'a', d1: '2026-10-20', label: 'Řím', id: 'metro:ROM', cc: 'IT' }, { k: 'b', d1: '2026-10-21', label: 'Lisabon', id: 'ap:LIS', cc: 'PT' }];
  const l = plain(S.digest(base({ gone })));
  assert.deepEqual(l, [{ kind: 'pins', sig: 'p:a,b', ico: '📌', b: 'Řím a Lisabon', t: '2 odložené nabídky už propadly – hledat nové termíny', go: { to: 'search', places: [{ id: 'metro:ROM', label: 'Řím', cc: 'IT' }, { id: 'ap:LIS', label: 'Lisabon', cc: 'PT' }] } }]);
  assert.equal(plain(S.digest(base({ gone: gone.slice(0, 1) })))[0].t, 'odložená nabídka na 20.\u00a010. už propadla – hledat nový termín');
});

test('digest: nejvýš 3 řádky v pořadí důležitosti, ✕ skryje jen ten stav řádku, bez změn nic', () => {
  const all = base({
    watch: [watch('Lisabon', 2300, { target: 2400 }), watch('Řím', 2160)], trips: [trip()],
    radar: { at: NOW - H, items: [rItem('metro:LON', 'Londýn', 1290, { newAt: NOW - H })], mode: 'all' },
    gone: [{ k: 'a', d1: '2026-10-20', label: 'Řím', id: 'metro:ROM' }],
  });
  const l = plain(S.digest(all));
  assert.deepEqual(l.map((x) => x.kind), ['hit', 'drop', 'trip']);
  const hid = l.map((x) => x.sig);
  assert.deepEqual(plain(S.digest({ ...all, hid })).map((x) => x.kind), ['radar', 'pins']);
  // Řím zlevnil ještě víc → nový podpis, řádek se vrátí
  const more = { ...all, hid, watch: [all.watch[0], watch('Řím', 2000)] };
  assert.deepEqual(plain(S.digest(more)).map((x) => x.kind), ['drop', 'radar', 'pins']);
  assert.deepEqual(plain(S.digest(base({}))), [], 'nic se nezměnilo – karta se neukáže');
  assert.deepEqual(plain(S.digest({ ...all, from: null })), [], 'bez okna (poprvé, týž den)');
});

test('řádek „Od minula“ pod hledáním: „+2 další“, ale „+5 dalších“; novinka jmenuje tlačítko „💾 Uložit do Mých cest“ jako karta', () => {
  const FL = readFileSync(new URL('../public/js/flights.js', import.meta.url), 'utf8');
  assert.match(FL, /\+\$\{rest\} \$\{rest <= 4 \? 'další' : 'dalších'\}/);
  assert.doesNotMatch(FL, /\} další<\/span>/);
  const APP = readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
  assert.match(APP, /data-nw-save>💾 Uložit do Mých cest</);
  assert.match(APP, /'Dnes na cestě i bez plánovače', [^\n]*💾 Uložit do Mých cest/);
  assert.doesNotMatch(APP, /<b>💾 Uložit do plánovače<\/b>/);
});

test('app.js sinceNb: předložky s pevnou mezerou (i dvě za sebou), „check-in“ se nerozdělí, HTML escapované', () => {
  const APP = readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
  const line = (re) => APP.match(re)[0];
  const x = vm.createContext({});
  vm.runInContext([line(/^const esc = .*$/m), line(/^const SINCE_NB = .*$/m), line(/^const sinceNb = .*$/m), 'this.sinceNb = sinceNb;'].join('\n'), x);
  assert.equal(x.sinceNb('o 210 Kč levněji než v pondělí · a v sobotu (v 6:10) online check-in <b>'),
    'o 210 Kč levněji než v pondělí · a v sobotu (v 6:10) online check‑in &lt;b&gt;');
});
