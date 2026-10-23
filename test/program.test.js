// Kvalita programu ve městě (Objevuj, krok Program průvodce Cestou) nad živými daty z Wikidat – jak ho posoudí náročný
// cestovatel: nejznámější místa nechybí, den v jedné části města bez skoků, čas na chůzi a oběd, muzea ne za sebou,
// s dětmi zoo a ne muzeum marihuany, kratší den příletu a odletu, tipy na večer a na déšť. Plus klasifikace míst, na
// které program stojí (Koloseum, hradby, vítězné oblouky) a vykreslení v aplikaci.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { planItinerary, dayTimeline, eveningOrder, mustSeeIds, clusterDays, segKm, addTips } from '../server/lib/itinerary.js';
import { groupBindings, spreadCats } from '../server/lib/poi.js';
import { haversineKm } from '../server/lib/geo.js';
import { bindings } from './fixtures/wikidata.js';
import * as F from './fixtures/program-cities.js';

const plan = (key, start, end, arrivalTime, departureTime, extra = {}) => planItinerary(F.places(F[key]), { center: F[`${key}_C`], start, end, arrivalTime, departureTime, pace: 'normal', ...extra });
const names = (r) => r.days.flatMap((d) => d.items.map((p) => p.name));
const show = (r) => r.days.map((d) => `${d.date}: ${d.items.map((p) => `${p.at} ${p.name}`).join(' → ')}`).join('\n');
const spread = (d) => Math.max(0, ...d.items.flatMap((a) => d.items.map((b) => haversineKm(a.lat, a.lon, b.lat, b.lon))));
const toMin = (hm) => +hm.slice(0, 2) * 60 + +hm.slice(3);
const dayOf = (r, name) => r.days.findIndex((d) => d.items.some((p) => p.name === name));

test('Řím 3 dny (přílet 10:30, odlet 18:00): Koloseum, Forum, Pantheon, Fontána di Trevi, sv. Petr i Vatikánská muzea; den v jedné části města', () => {
  const r = plan('ROM', '2026-11-06', '2026-11-08', '10:30', '18:00');
  const n = names(r);
  for (const must of ['Koloseum', 'Forum Romanum', 'Pantheon', 'Fontána di Trevi', 'Bazilika svatého Petra', 'Vatikánská muzea']) assert.ok(n.includes(must), `${must}\n${show(r)}`);
  // odlehlé (sv. Pavel za hradbami, Via Appia – dřív konec dne příletu po setmění) ani Vatikán jako 90 min „čtvrti“ vedle baziliky
  for (const no of ['Bazilika svatého Pavla za hradbami', 'Via Appia', 'Vatikán']) assert.ok(!n.includes(no), `${no}\n${show(r)}`);
  assert.ok(r.days.some((d) => d.area === 'Vatikán'), 'Vatikán jako oblast dne');
  assert.equal(dayOf(r, 'Koloseum'), dayOf(r, 'Forum Romanum'), 'Koloseum a Forum vedle sebe v jednom dni');
  assert.equal(dayOf(r, 'Bazilika svatého Petra'), dayOf(r, 'Vatikánská muzea'));
  for (const d of r.days) {
    assert.ok(spread(d) < 3.5, `${d.date}: rozptyl ${spread(d).toFixed(1)} km\n${show(r)}`);
    assert.ok(d.items.filter((p) => p.category === 'museum').length <= 2);
    assert.ok(d.lunch && d.lunch.at >= '11:45' && d.lunch.at <= '14:45', `${d.date}: oběd ${d.lunch?.at}`);
  }
  // den odletu v 18:00: program do 15:00 (+ čtvrthodina rezerva)
  assert.ok(toMin(r.days[2].end) <= 15 * 60 + 15, r.days[2].end);
  // den příletu začíná 1,5 h po příletu
  assert.ok(r.days[0].items[0].at >= '12:00', r.days[0].items[0].at);
});

test('Lisabon 4 dny s příletem odpoledne: Belémská věž i Jerónimos v celém dni (dřív v den příletu – a vypadly), Alfama jako oblast', () => {
  const r = plan('LIS', '2026-11-05', '2026-11-08', '13:05', '14:10');
  const tower = dayOf(r, 'Belémská věž');
  assert.ok(tower > 0 && tower < 3, show(r));
  assert.equal(dayOf(r, 'Klášter svatého Jeronýma'), tower);
  assert.ok(r.days[tower].cap === 360);
  assert.ok(r.days.some((d) => /Alfama/.test(d.area || '')), 'Alfama není zastávka na 90 min vedle katedrály a hradu');
  assert.ok(!names(r).includes('Alfama'));
  // den odletu ve 14:10: jen ráno do 11:10
  const last = r.days[3];
  assert.ok(!last.items.length || toMin(last.end) <= 11 * 60 + 25, last.end);
});

test('Vídeň na 1 den (přílet 8:15, odlet 21:30): Štěpán, opera, Belveder; oběd, konec 3 h před odletem, cestou kolem Albertina', () => {
  const r = plan('VIE', '2026-11-06', '2026-11-06', '08:15', '21:30');
  const [d] = r.days;
  const n = names(r);
  for (const must of ['Katedrála svatého Štěpána ve Vídni', 'Vídeňská státní opera', 'Belveder']) assert.ok(n.includes(must), `${must}\n${show(r)}`);
  assert.ok(d.items[0].at >= '09:45', 'program od 1,5 h po příletu');
  assert.ok(toMin(d.end) <= 18 * 60 + 45, d.end);
  assert.ok(d.lunch, 'pauza na oběd');
  assert.ok(d.items.filter((p) => ['museum', 'gallery'].includes(p.category)).length <= 3);
  assert.ok(d.items.some((p) => (p.passBy || []).includes('Albertina')), 'Albertina leží na cestě k opeře');
});

test('Barcelona 2 dny s dětmi (6 a 9 let): zoo nebo akvárium dopoledne, Park Güell, nejvýš 1 muzeum za den, bez muzea marihuany', () => {
  const r = plan('BCN', '2026-11-07', '2026-11-08', '09:40', '19:30', { kids: true, interests: { zoo: 2, theme: 2, park: 1.4, museum: 1.1 } });
  const all = r.days.flatMap((d) => d.items);
  const zoo = all.filter((p) => p.category === 'zoo');
  assert.equal(zoo.length, 1, show(r));
  assert.ok(zoo[0].at <= '14:30', `zoo od ${zoo[0].at} – ne až před zavírací dobou`);
  assert.ok(all.some((p) => p.name === 'Park Güell'));
  assert.ok(!all.some((p) => /marihuan/i.test(p.name)));
  for (const d of r.days) assert.ok(d.items.filter((p) => p.category === 'museum').length <= 1, `${d.date}\n${show(r)}`);
  // s dětmi pomaleji (3,5 km/h) a MHD už od 2 km
  for (const p of all) {
    if (!p.transit && p.fromPrevKm >= 0.5) assert.ok(p.fromPrevMin >= Math.round((p.fromPrevKm / 3.5) * 60) - 1, `${p.name}: ${p.fromPrevKm} km za ${p.fromPrevMin} min`);
    if (p.fromPrevKm > 2.05) assert.ok(p.transit, `${p.name}: ${p.fromPrevKm} km pěšky s dětmi`);
  }
  // bez dětí stejné místo: muzeum marihuany zůstává mezi místy (jen ne pro děti) a zoo není povinná
  const adults = plan('BCN', '2026-11-07', '2026-11-08', '09:40', '19:30');
  assert.ok(adults.days.every((d) => d.items.filter((p) => p.category === 'museum').length <= 2));
});

test('Dubrovník 2 dny u moře: hradby jako procházka (75 min, ne 20), Lokrum, příroda nejvýš jednou za den, na večer pláž', () => {
  const r = plan('DBV', '2026-06-12', '2026-06-13', '11:00', '20:00', { interests: { park: 1.6, nature: 1.8, viewpoint: 1.8, beach: 1.6 } });
  const all = r.days.flatMap((d) => d.items);
  assert.equal(all.find((p) => p.name === 'Hradby Dubrovníku')?.visitMin, 75, show(r));
  const lokrum = all.find((p) => p.name === 'Lokrum');
  assert.ok(lokrum?.boat && lokrum.transit, 'na ostrov lodí, ne 2 km pěšky po moři');
  assert.equal(r.days.find((d) => d.items.includes(lokrum)).walkKm < 1, true, 'plavba se nepočítá do chůze');
  for (const d of r.days) assert.ok(d.items.filter((p) => p.category === 'nature').length <= 1, `${d.date}\n${show(r)}`);
  assert.ok(r.days.some((d) => d.evening?.category === 'beach'), 'tip na pláž na večer');
  assert.ok(r.days.some((d) => d.rain?.length), 'tip na déšť u dne s ostrovem a hradbami');
});

test('Krkonoše 2 dny: Sněžka v programu, národní park není zastávka (ani dvakrát), delší úseky autem / busem', () => {
  const r = plan('KRK', '2026-07-11', '2026-07-12', '10:00', '18:00');
  const n = names(r);
  assert.ok(n.includes('Sněžka'), show(r));
  assert.ok(!n.some((x) => /národní park/i.test(x)), show(r));
  for (const d of r.days) {
    assert.ok(d.items.filter((p) => p.category === 'nature').length <= 1);
    assert.equal(d.rural, true);
  }
  // ve městě zůstává MHD
  assert.ok(plan('ROM', '2026-11-06', '2026-11-08', '10:30', '18:00').days.every((d) => !d.rural));
});

test('nic dvakrát, každý den se vejde do svého okna (prohlídky + chůze + oběd)', () => {
  const cases = [['ROM', '2026-11-06', '2026-11-09', '07:00', '21:00'], ['LIS', '2026-11-05', '2026-11-07', '13:05', '20:00'], ['BCN', '2026-11-07', '2026-11-09', '09:40', '19:30'], ['VIE', '2026-11-06', '2026-11-07', '10:00', '16:00']];
  for (const [key, start, end, arr, dep] of cases) {
    for (const pace of ['relaxed', 'normal', 'intense']) {
      const r = plan(key, start, end, arr, dep, { pace });
      const ids = r.days.flatMap((d) => d.items.map((p) => p.id));
      assert.equal(new Set(ids).size, ids.length, `${key} ${pace}`);
      for (const [i, d] of r.days.entries()) {
        if (!d.items.length || d.kind !== 'city') continue;
        const to = i === r.days.length - 1 ? Math.min(20 * 60, toMin(dep) - 180) : 20 * 60;
        assert.ok(toMin(d.end) <= to + 15, `${key} ${pace} ${d.date}: konec ${d.end}`);
        assert.ok(d.items.every((p, j) => !j || p.at > d.items[j - 1].at), 'časy jdou po sobě');
      }
    }
  }
});

/* ---------- čisté funkce ---------- */

const C = { lat: 41.9, lon: 12.5 };
const at = (dLat, dLon) => ({ lat: C.lat + dLat, lon: C.lon + dLon });

test('dayTimeline: chůze podle vzdálenosti, nad 3 km MHD, hodina na oběd po 11:45, odpolední den bez obědu', () => {
  const p = (id, dLat, visitMin, category = 'church') => ({ id, ...at(dLat, 0), visitMin, category });
  // 1,11 km na sever = 1,44 km ulicemi = 18 min chůze
  const items = [p('a', 0.01, 120), p('b', 0.02, 60), p('c', 0.03, 60)];
  const t = dayTimeline(items, { start: C, from: 9 * 60 });
  assert.equal(t.at[0], 9 * 60 + 18);
  assert.equal(t.at[1], 9 * 60 + 18 + 120 + 18);
  assert.equal(t.lunch, 1, 'oběd po druhé zastávce (konec ve 12:54)');
  assert.equal(t.at[2], t.at[1] + 60 + 60 + 18);
  assert.equal(t.end, t.at[2] + 60);
  // s dětmi pomaleji
  assert.ok(dayTimeline(items, { start: C, from: 9 * 60, kids: true }).at[0] > t.at[0]);
  // úsek 5,5 km (×1,3 = 7,2 km) jede MHD: 12 + 3 min/km
  const far = dayTimeline([p('x', 0.05, 30)], { start: C, from: 9 * 60 });
  assert.equal(far.at[0], 9 * 60 + Math.round(12 + 3 * 5.56 * 1.3));
  // přílet odpoledne: od 15:00, oběd už ne
  assert.equal(dayTimeline(items, { start: C, from: 15 * 60 }).lunch, -1);
  // dopolední program před odletem (do 12:30): oběd až po něm
  const morning = dayTimeline([p('a', 0.01, 120), p('b', 0.02, 60)], { start: C, from: 9 * 60 });
  assert.equal(morning.lunch, 1);
});

test('eveningOrder: zoo radši na začátek (zavírá), den raději končí na náměstí – za kilometr navíc to stojí', () => {
  const sq = { id: 'sq', ...at(0.0045, 0), visitMin: 30, category: 'square' };
  const zoo = { id: 'zoo', ...at(0.0135, 0), visitMin: 180, category: 'zoo' };
  // od 14:00: náměstí, pak zoo do 17:50 → obráceně zoo do 17:20 a náměstí večer
  assert.deepEqual(eveningOrder(C, [sq, zoo], { from: 14 * 60 }).map((x) => x.id), ['zoo', 'sq']);
  // ráno zoo stihne i jako druhá – zůstane kratší trasa
  assert.deepEqual(eveningOrder(C, [sq, zoo], { from: 9 * 60 }).map((x) => x.id), ['sq', 'zoo']);
  // vzdálenost rozhoduje: 3 km navíc kvůli náměstí na konci ne
  const farZoo = { ...zoo, ...at(0.03, 0) };
  assert.deepEqual(eveningOrder(C, [sq, farZoo], { from: 9 * 60 }).map((x) => x.id), ['sq', 'zoo']);
});

test('mustSeeIds: nejvíc jazykových verzí, jen památky ve městě (ne čtvrť, výlet ani místo 20 km daleko); bez nich skóre', () => {
  const P = (id, sitelinks, category = 'church', d = 0.01, score = 50) => ({ id, ...at(d, 0), sitelinks, category, score });
  const pois = [P('vatikan', 343, 'oldtown'), P('kolos', 148, 'ruins'), P('petr', 131), P('trip', 200, 'daytrip', 0.3), P('far', 180, 'palace', 0.2), P('trevi', 68, 'monument'), P('x', 20)];
  assert.deepEqual([...mustSeeIds(pois, 3, C)], ['kolos', 'petr', 'trevi']);
  const old = [{ id: 'a', ...at(0.01, 0), category: 'museum', score: 40 }, { id: 'b', ...at(0.01, 0), category: 'museum', score: 60 }];
  assert.deepEqual([...mustSeeIds(old, 1, C)], ['b']);
});

test('clusterDays: odlehlá místa nejsou samostatné dny, zatímco zbytek města přeteče jeden den (Řím: Via Appia, sv. Pavel)', () => {
  const central = Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, ...at(0.004 * (i % 3), 0.005 * Math.floor(i / 3)), visitMin: 60 }));
  const outl = [{ id: 'appia', ...at(-0.06, 0.03), visitMin: 75 }, { id: 'paul', ...at(-0.04, -0.03), visitMin: 60 }];
  const pts = [...central, ...outl];
  const { assign } = clusterDays(pts, [360, 288, 216], C.lat);
  const mins = [0, 1, 2].map((c) => pts.reduce((s, p, i) => s + (assign[i] === c ? p.visitMin : 0), 0)).sort((a, b) => b - a);
  assert.ok(mins[0] <= 360 * 1.1, `rozdělení ${mins.join(' / ')} min`);
  assert.ok(!(assign[9] !== assign[10] && pts.filter((_, i) => assign[i] === assign[9]).length === 1), 'Via Appia není den sama pro sebe');
});

test('segKm: vzdálenost od pěšího úseku', () => {
  const a = { lat: 48.2, lon: 16.37 };
  const b = { lat: 48.21, lon: 16.37 };
  assert.ok(segKm(a, b, { lat: 48.205, lon: 16.37 }) < 0.001, 'na cestě');
  assert.ok(Math.abs(segKm(a, b, { lat: 48.205, lon: 16.3727 }) - 0.2) < 0.01, '200 m stranou');
  assert.ok(Math.abs(segKm(a, b, { lat: 48.22, lon: 16.37 }) - 1.106) < 0.01, 'za koncem úseku → vzdálenost od konce');
});

test('addTips: na déšť jen u dne venku, tip na večer každý den jiný, oběd s tržnicí do 800 m, čtvrť jako oblast dne', () => {
  const P = (id, category, dLat, score = 50, extra = {}) => ({ id, name: id, category, ...at(dLat, 0), score, visitMin: 60, ...extra });
  const outdoor = [P('park', 'park', 0), P('vyhlidka', 'viewpoint', 0.002)];
  const inside = [P('muzeum', 'museum', 0.02), P('palac', 'palace', 0.021)];
  const days = [
    { kind: 'city', items: outdoor, lunch: { after: 0, at: '12:30' } },
    { kind: 'city', items: inside },
  ];
  const pool = [...outdoor, ...inside, P('galerie', 'gallery', 0.003, 60), P('trh', 'market', 0.004, 40), P('namesti', 'square', 0.003, 45),
    P('namesti2', 'square', 0.021, 44), P('ctvrt', 'oldtown', 0.0205, 55)];
  addTips(days, pool, [pool.at(-1)]);
  assert.deepEqual(days[0].rain.map((p) => p.id), ['galerie', 'trh'], 'den venku: galerie a tržnice pod střechou');
  assert.equal(days[1].rain, undefined, 'den v muzeu a paláci tip na déšť nepotřebuje');
  assert.equal(days[0].lunch.tip.id, 'trh');
  assert.equal(days[0].evening.id, 'namesti');
  assert.equal(days[1].evening.id, 'namesti2', 'jiné náměstí, ne stejný tip');
  assert.equal(days[1].area, 'ctvrt');
});

/* ---------- klasifikace míst (server/lib/poi.js) ---------- */

test('groupBindings: Koloseum (i „stadion“) je naleziště, hradby procházka, městská brána a vítězný oblouk krátká zastávka', () => {
  const her = ['Q1019'];
  const rows = bindings([
    ['Q10285', 'Koloseum', 'amfiteátr v Římě', 41.8903, 12.4922, 148, ['Q33506', 'Q109607', 'Q839954', 'Q483110', 'Q1076486', 'Q54831'], her, []],
    ['Q502098', 'Caracallovy lázně', 'lázně v Římě', 41.8794, 12.4924, 43, ['Q33506', 'Q839954'], her, []],
    ['Q931733', 'Hradby Dubrovníku', '', 42.6414, 18.1083, 28, ['Q57821', 'Q42948', 'Q57346'], her, []],
    ['Q625149', 'Aurelianova hradba', 'hradby Říma', 41.8733, 12.499, 48, ['Q57821', 'Q839954', 'Q16748868'], her, []],
    ['Q3509061', 'Vrata od Pila', 'městská brána v Dubrovníku', 42.6418, 18.1069, 10, ['Q57821', 'Q53060', 'Q82117'], her, []],
    ['Q5786', 'Konstantinův oblouk', '', 41.8898, 12.4906, 49, ['Q839954', 'Q143912', 'Q97466153'], her, []],
    ['Q192784', 'Trajánův sloup', 'pomník v Římě', 41.8958, 12.4843, 56, ['Q51845395', 'Q839954'], [], []],
    ['Q7875112', 'Estádio da Luz', 'stadion v Lisabonu', 38.7527, -9.1847, 49, ['Q483110', 'Q1076486', 'Q210272'], her, []],
  ]);
  const by = Object.fromEntries(groupBindings(rows, { lat: 41.9, lon: 12.5 }).map((p) => [p.name, [p.category, p.visitMin]]));
  assert.deepEqual(by.Koloseum, ['ruins', undefined], 'archeologické naleziště, ne vyřazený stadion ani dvouhodinové muzeum');
  assert.deepEqual(by['Caracallovy lázně'], ['ruins', undefined]);
  assert.deepEqual(by['Hradby Dubrovníku'], ['monument', 75]);
  assert.deepEqual(by['Aurelianova hradba'][1], 75);
  assert.deepEqual(by['Vrata od Pila'], ['monument', undefined]);
  assert.deepEqual(by['Konstantinův oblouk'], ['monument', undefined]);
  assert.deepEqual(by['Trajánův sloup'], ['monument', undefined]);
  assert.equal(by['Estádio da Luz'], undefined, 'moderní stadion dál ne');
});

test('spreadCats: nejvýš pětina limitu z jedné kategorie (Řím: kostely a muzea nevytlačí Španělské schody), přebytek na konec', () => {
  const sorted = [...Array.from({ length: 20 }, (_, i) => ({ id: `ch${i}`, category: 'church', score: 90 - i })), { id: 'schody', category: 'sight', score: 60 }, { id: 'nam', category: 'square', score: 55 }];
  const out = spreadCats(sorted, 30);
  assert.deepEqual(out.slice(0, 8).map((p) => p.id), ['ch0', 'ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'schody', 'nam']);
  assert.equal(out.length, sorted.length, 'nic se neztratí');
  assert.equal(out.at(-1).id, 'ch19');
  // hory: samé vrcholy – pořadí beze změny
  const peaks = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, category: 'nature', score: 50 - i }));
  assert.deepEqual(spreadCats(peaks, 60), peaks);
});

/* ---------- aplikace: program s časy, obědem a tipy (public/js/places.js) ---------- */

test('planHtml: čas zastávky, oběd mezi zastávkami, cestou kolem, oblast, konec dne; na déšť schované, v horách autem / busem', () => {
  const src = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
  const ctx = { window: {}, URLSearchParams, console };
  vm.createContext(ctx);
  vm.runInContext(src('app.js').match(/^const (esc|enc|flag|safeUrl|cssUrl|pad|fmtYMD) = .*$/gm).join('\n'), ctx);
  vm.runInContext(src('places.js'), ctx);
  const T = ctx.window.Places._t;
  const C0 = { lat: 41.89, lon: 12.51, label: 'Řím', city: 'Řím', country: 'Itálie' };
  const it = (id, name, atHm, extra = {}) => ({ id, name, lat: 41.89, lon: 12.49, category: 'ruins', visitMin: 90, fromPrevKm: 1.2, fromPrevMin: 15, at: atHm, ...extra });
  const day = {
    date: '2026-11-06', kind: 'city', cap: 288, minutes: 180, walkKm: 2.4, end: '15:10', area: 'Vatikán',
    items: [it('a', 'Koloseum', '12:26', { passBy: ['Domus Aurea'] }), it('b', 'Forum Romanum', '14:58')],
    lunch: { after: 0, at: '13:56', tip: { name: 'Mercato <Monti>', km: 0.4 } },
    evening: { name: 'Piazza Venezia', km: 0.7 }, rain: [{ name: 'Kapitolská muzea' }, { name: 'Altare della Patria' }],
  };
  const html = T.planHtml({ days: [day] }, C0).replace(/ /g, ' ');
  assert.match(html, /Koloseum<\/b> <span class="faint">· ~12:26, 1 h 30 min<\/span>/);
  assert.match(html, /<div class="dp-walk">od ubytování 1,2 km pěšky \(~15 min\) · cestou kolem: Domus Aurea<\/div>/);
  assert.match(html, /<\/div><div class="dp-pause">🍽️ Oběd ~13:56 · tip: Mercato &lt;Monti&gt; <span class="faint">\(0,4 km\)<\/span><\/div><div class="dp-item" data-poi="b">/);
  assert.match(html, /<p class="dp-area">🏘️ Oblast: Vatikán<\/p>/);
  assert.match(html, /2,4 km pěšky · konec ~15:10/);
  assert.match(html, /🌙 Na večer: Piazza Venezia <span class="faint">\(0,7 km\)<\/span>/);
  assert.match(html, /<div class="dp-tip dp-rain" hidden>🌧️ Když prší: Kapitolská muzea · Altare della Patria<\/div>/);
  assert.match(T.planHtml({ days: [{ ...day, rural: true, items: [it('c', 'Sněžka', '12:10', { transit: true, fromPrevKm: 9.4 })] }] }, C0), /9,4\s+km – autem \/ busem/);
  assert.match(T.planHtml({ days: [{ ...day, items: [it('d', 'Lokrum', '16:04', { transit: true, boat: true, fromPrevKm: 2.2 })] }] }, C0), /2,2\s+km – lodí/);
  // starší uložený program bez časů a tipů vypadá jako dřív
  const old = T.planHtml({ days: [{ date: '2026-11-06', cap: 288, minutes: 90, walkKm: 1.2, items: [it('a', 'Koloseum')] }] }, C0).replace(/ /g, ' ');
  assert.match(old, /Koloseum<\/b> <span class="faint">· 1 h 30 min<\/span>/);
  assert.doesNotMatch(old, /dp-pause|dp-tip|dp-area|konec ~/);
});
