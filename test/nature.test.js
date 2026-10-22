// Hory, národní parky, jeskyně a jezera v Objevuj (server/lib/names.js NATURE): hledání (api/geocode?mapy=1 →
// geocodeExplore s regions), věta („výlet na Sněžku“, „v Krkonoších“ – smartPlace v public/js/places.js) a co Objevuj
// s takovým místem udělá (pěšky, okruh celé oblasti). Pole letů je dál nenabízejí. Bez sítě: DEMO, geokodér jako náhrada fetch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { stubFetch } from './helpers.js';
import { config } from '../server/config.js';

const { suggest, localSuggestions, geocodeExplore, natureMatches } = await import('../server/lib/places.js');
const { NATURE } = await import('../server/lib/names.js');
const { COUNTRY_BY_ISO } = await import('../server/lib/airports.js');
const { haversineKm } = await import('../server/lib/geo.js');
const src = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
const plain = (x) => JSON.parse(JSON.stringify(x));

// /api/places a /api/geocode přímo nad serverovým kódem (jako server/index.js)
async function api(url) {
  const u = new URL(url, 'http://atlas/');
  const q = (u.searchParams.get('q') || '').slice(0, 80);
  if (u.pathname === '/api/places') {
    return { items: await suggest(q, { remote: u.searchParams.get('remote') !== '0', role: u.searchParams.get('role') === 'from' ? 'from' : 'to', nature: u.searchParams.get('nature') === '1' }) };
  }
  if (u.pathname === '/api/geocode') return { items: await geocodeExplore(q, { mapy: false, regions: u.searchParams.get('mapy') === '1' }) };
  throw new Error(`neznámý dotaz ${url}`);
}
const ctx = { console, URLSearchParams, setTimeout, clearTimeout, fetch: async (url) => { const body = plain(await api(url)); return { ok: true, status: 200, json: async () => body }; } };
ctx.window = ctx; // places.js volá Smart bez window.
vm.createContext(ctx);
vm.runInContext(src('app.js').match(/^const (esc|enc|flag|safeUrl|cssUrl|pad|fmtYMD) = .*$/gm).join('\n'), ctx);
for (const f of ['searchhelp.js', 'smart.js', 'places.js']) vm.runInContext(src(f), ctx, { filename: f });
const { Smart } = ctx;
const T = ctx.Places._t;
const today = '2026-10-22';
const demo = async (fn) => {
  const mock = config.mock;
  config.mock = true;
  try { return await fn(); } finally { config.mock = mock; }
};

// [napsáno v hledání Objevuj, první návrh, druh, poloha (z geokodéru Mapy.com / GeoNames, 10/2026)]
const SEARCH = [
  ['Sněžka', 'Sněžka', 'peak', 50.7360, 15.7396], ['Šumava', 'Šumava', 'range', 48.9769, 13.6331], ['Jeseníky', 'Jeseníky', 'range', 50.0831, 17.2310],
  ['Krkonoše', 'Krkonoše', 'range', 50.7672, 15.6222], ['Beskydy', 'Beskydy', 'range', 49.4916, 18.2231], ['Pálava', 'Pálava', 'park', 48.8585, 16.6414],
  ['Macocha', 'Propast Macocha', 'cave', 49.3732, 16.7298], ['Punkevní jeskyně', 'Punkevní jeskyně', 'cave', 49.3711, 16.7260],
  ['Moravský kras', 'Moravský kras', 'cave', 49.3732, 16.7298], ['Pravčická brána', 'Pravčická brána', 'rocks', 50.8839, 14.2816],
  ['České Švýcarsko', 'České Švýcarsko', 'park', 50.8673, 14.3538], ['Adršpašsko-teplické skály', 'Adršpašsko-teplické skály', 'rocks', 50.6012, 16.1257],
  ['Adršpach', 'Adršpašsko-teplické skály', 'rocks', 50.6012, 16.1257], ['Teplické skály', 'Adršpašsko-teplické skály', 'rocks', 50.6012, 16.1257],
  ['Prachovské skály', 'Prachovské skály', 'rocks', 50.4673, 15.2932], ['Český ráj', 'Český ráj', 'park', 50.5452, 15.1947],
  ['Lipno', 'Lipno', 'lake', 48.7018, 14.0626], ['Máchovo jezero', 'Máchovo jezero', 'lake', 50.5835, 14.6498], ['Radhošť', 'Radhošť', 'peak', 49.4916, 18.2231],
  ['Praděd', 'Praděd', 'peak', 50.0831, 17.2310], ['Boubín', 'Boubín', 'peak', 48.9913, 13.8175], ['Bílé Karpaty', 'Bílé Karpaty', 'range', 48.8574, 17.6752],
  ['Křivoklátsko', 'Křivoklátsko', 'park', 50.0367, 13.8707], ['Slapy', 'Slapská přehrada', 'lake', 49.7417, 14.3567],
  // v zahraničí
  ['Dolomity', 'Dolomity', 'range', 46.3833, 11.8500], ['Tatry', 'Vysoké Tatry', 'range', 49.1382, 20.2193], ['Vysoké Tatry', 'Vysoké Tatry', 'range', 49.1382, 20.2193],
  ['Malá Fatra', 'Malá Fatra', 'park', 49.1935, 19.0386], ['Slovenský ráj', 'Slovenský ráj', 'park', 48.9491, 20.3836], ['Hallstatt', 'Hallstatt', 'lake', 47.5622, 13.6487],
  ['Königssee', 'Königssee', 'lake', 47.5551, 12.9766], ['Plitvická jezera', 'Plitvická jezera', 'park', 44.8835, 15.6138], ['Plitvice', 'Plitvická jezera', 'park', 44.8835, 15.6138],
  // bez diakritiky, malými, slovensky
  ['snezka', 'Sněžka', 'peak', 50.7360, 15.7396], ['sumava', 'Šumava', 'range', 48.9769, 13.6331], ['krkonose', 'Krkonoše', 'range', 50.7672, 15.6222],
  ['CESKE SVYCARSKO', 'České Švýcarsko', 'park', 50.8673, 14.3538], ['Slovenský raj', 'Slovenský ráj', 'park', 48.9491, 20.3836], ['Koenigssee', 'Königssee', 'lake', 47.5551, 12.9766],
];

test('Objevuj, hledání: hory, národní parky, jeskyně, skály a jezera → první návrh s druhem a polohou (DEMO, bez geokódování)', () => demo(async () => {
  const bad = [];
  for (const [q, label, kind, lat, lon] of SEARCH) {
    const s = (await geocodeExplore(q, { mapy: false, regions: true }))[0];
    if (!s || s.label !== label || s.nature !== kind || haversineKm(s.lat, s.lon, lat, lon) > 1) bad.push(`${q} → ${s ? `${s.label} ${s.nature} ${s.lat},${s.lon}` : '—'}`);
  }
  assert.deepEqual(bad, []);
}));

test('seznam míst v přírodě: druh, okruh, země a poloha v pořádku, názvy a jiné názvy jednoznačné', () => {
  const seen = new Map();
  for (const n of NATURE) {
    assert.ok(['range', 'park', 'peak', 'cave', 'rocks', 'lake'].includes(n.kind), n.cs);
    assert.ok([10, 20].includes(n.km), `${n.cs}: okruh z nabídky Objevuj`);
    assert.ok(COUNTRY_BY_ISO.has(n.cc), n.cs);
    assert.ok(n.lat > 44 && n.lat < 51.1 && n.lon > 11 && n.lon < 20.5, `${n.cs}: poloha ve střední Evropě`);
    for (const a of [n.cs, ...(n.aliases || [])]) {
      const k = a.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/-/g, ' ');
      assert.ok(!seen.has(k), `${a}: i u ${seen.get(k)}`);
      seen.set(k, n.cs);
    }
  }
  // pohoří a parky na celou oblast, jednotlivá hora nebo jeskyně okolí
  assert.equal(NATURE.find((n) => n.cs === 'Krkonoše').km, 20);
  assert.equal(NATURE.find((n) => n.cs === 'Sněžka').km, 10);
});

test('hledání při psaní: rozepsaný název („Krkon“) za většími místy, přesný název před stejnojmennými městy jinde', async () => {
  const mock = config.mock;
  config.mock = false;
  // geokodér (Open-Meteo): Lipno v Polsku, Königsee v Durynsku, město Jeseník a vrchol Sněžka (totéž místo jednou)
  const GEO = {
    Lipno: [{ name: 'Lipno', latitude: 52.84436, longitude: 19.17852, country_code: 'PL', country: 'Polsko', population: 14821, feature_code: 'PPLA3', id: 1 }],
    Königssee: [{ name: 'Königsee', latitude: 50.66143, longitude: 11.09748, country_code: 'DE', country: 'Německo', population: 6979, feature_code: 'PPL', id: 2 }],
    Jese: [{ name: 'Jeseník', latitude: 50.2294, longitude: 17.2046, country_code: 'CZ', country: 'Česko', population: 11000, feature_code: 'PPLA3', id: 3 }],
    Sněžka: [{ name: 'Sněžka', latitude: 50.73609, longitude: 15.73979, country_code: 'CZ', country: 'Česko', population: 0, feature_code: 'MT', id: 4 },
      { name: 'Sněžka', latitude: 49.79215, longitude: 16.39515, country_code: 'CZ', country: 'Česko', population: 0, feature_code: 'MT', id: 5 }],
  };
  const stub = stubFetch((url) => ({ body: { results: GEO[new URL(url).searchParams.get('name')] || [] } }));
  try {
    const labels = async (q) => (await geocodeExplore(q, { mapy: false, regions: true })).map((x) => x.label);
    assert.deepEqual((await labels('Lipno')).slice(0, 2), ['Lipno', 'Lipno']);
    assert.equal((await geocodeExplore('Lipno', { mapy: false, regions: true }))[0].cc, 'CZ', 'Lipno na Šumavě, ne v Polsku');
    assert.deepEqual(await labels('Königssee'), ['Königssee', 'Königsee']);
    assert.deepEqual((await labels('Jese')).slice(0, 2), ['Jeseník', 'Jeseníky'], 'město Jeseník napřed, pohoří hned za ním');
    // vrchol Sněžky z geokodéru je tentýž (jednou), jiná Sněžka 100 km daleko zůstane
    assert.deepEqual(await labels('Sněžka'), ['Sněžka', 'Sněžka']);
    assert.equal((await geocodeExplore('Sněžka', { mapy: false, regions: true }))[1].lat, 49.79215);
    // bez regions (průvodce cestou, střed cíle u letů) jen geokodér – příroda ne
    assert.ok(!(await geocodeExplore('Lipno', { mapy: false })).some((x) => x.nature));
  } finally {
    stub.restore();
    config.mock = mock;
  }
  assert.deepEqual(natureMatches('Krkon').map((x) => [x.s.label, x.exact]), [['Krkonoše', false]]);
  assert.deepEqual(natureMatches('Krk'), [], 'od 4 znaků');
  assert.deepEqual(natureMatches('Česk').map((x) => x.s.label), ['České Švýcarsko', 'Český ráj']);
});

test('pole letů dál bez hor a jeskyní (Kam/Odkud, chytré hledání); jen Objevuj (nature) je dostane přesným názvem', () => demo(async () => {
  for (const [q] of SEARCH) {
    assert.ok(!localSuggestions(q, 8).some((x) => x.nature), q);
    assert.ok(!(await suggest(q)).some((x) => x.nature), q);
    assert.ok(!(await suggest(q, { remote: false, role: 'from' })).some((x) => x.nature), q);
  }
  // Tatry v poli Kam = letiště Poprad-Tatry, jako dřív
  assert.equal((await suggest('Tatry'))[0]?.id, 'ap:TAT');
  // nature: jen přesný název nebo tvar z věty („Krkonoš“), ne začátek
  assert.equal((await suggest('Krkonoš', { remote: false, nature: true }))[0]?.label, 'Krkonoše');
  assert.ok(!(await suggest('Krkon', { remote: false, nature: true })).some((x) => x.nature));
}));

// [věta v Objevuj, místo (smartPlace)]
const SENTENCES = [
  ['výlet na Sněžku', 'Sněžka'], ['na Šumavu na 3 dny', 'Šumava'], ['pěšky na Šumavě', 'Šumava'], ['do Jeseníků', 'Jeseníky'], ['v Jeseníkách pěšky', 'Jeseníky'],
  ['do Krkonoš', 'Krkonoše'], ['v Krkonoších', 'Krkonoše'], ['do Beskyd', 'Beskydy'], ['v Beskydech', 'Beskydy'], ['na Pálavu', 'Pálava'],
  ['na Macochu', 'Propast Macocha'], ['do Českého Švýcarska', 'České Švýcarsko'], ['v Českém Švýcarsku', 'České Švýcarsko'], ['do Prachovských skal', 'Prachovské skály'],
  ['do Českého ráje', 'Český ráj'], ['v Českém ráji', 'Český ráj'], ['na Lipno', 'Lipno'], ['k Máchovu jezeru', 'Máchovo jezero'], ['na Radhošť', 'Radhošť'],
  ['na Praděd', 'Praděd'], ['na Boubín', 'Boubín'], ['do Bílých Karpat', 'Bílé Karpaty'], ['na Křivoklátsko', 'Křivoklátsko'], ['na Slapy', 'Slapská přehrada'],
  ['do Dolomit', 'Dolomity'], ['v Dolomitech', 'Dolomity'], ['do Tater', 'Vysoké Tatry'], ['ve Vysokých Tatrách', 'Vysoké Tatry'], ['na Malou Fatru', 'Malá Fatra'],
  ['do Slovenského ráje', 'Slovenský ráj'], ['do Hallstattu', 'Hallstatt'], ['Plitvická jezera na 2 dny', 'Plitvická jezera'],
];

test('Objevuj, věta: hory a příroda ve tvaru z věty → místo s druhem (smartPlace, DEMO); města a oblasti jako dřív', () => demo(async () => {
  const bad = [];
  for (const [text, want] of SENTENCES) {
    const px = Smart.parseExplore(text, { today });
    const s = await T.smartPlace(px.place);
    if (!s || s.label !== want || !s.nature) bad.push(`${text} [${px.place}] → ${s ? s.label : '—'}`);
  }
  assert.deepEqual(bad, []);
  // ✨ řádek ukáže základní tvar
  assert.equal(await T.smartName('Krkonoš'), 'Krkonoše');
  assert.equal(await T.smartName('Sněžku'), 'Sněžka');
  for (const [text, want] of [['co vidět v Brně', 'Brno'], ['v Toskánsku', 'Florencie'], ['do Benátek', 'Benátky']]) {
    const s = await T.smartPlace(Smart.parseExplore(text, { today }).place);
    assert.equal(s?.label, want, text);
    assert.equal(s.nature, undefined, text);
  }
}));

test('tvary dvouslovných jmen: 6. pád, 4. pád, přivlastňovací, 2. pád množného čísla; shoda rodu napřed', () => {
  const F = (p) => [...Smart.placeForms(p)];
  for (const [p, want] of [['Českém Švýcarsku', 'České Švýcarsko'], ['Českého Švýcarska', 'České Švýcarsko'], ['Máchovu jezeru', 'Máchovo jezero'],
    ['Máchova jezera', 'Máchovo jezero'], ['Malou Fatru', 'Malá Fatra'], ['Bílých Karpat', 'Bílé Karpaty'], ['Krušných hor', 'Krušné hory'],
    ['Vysokých Tatrách', 'Vysoké Tatry'], ['Českém Krumlově', 'Český Krumlov'], ['Novém Městě', 'Nové Město']]) {
    assert.ok(F(p).slice(0, 2).includes(want), `${p} → ${want}: ${F(p).join(', ')}`);
  }
  assert.equal(F('Českém Krumlově')[0], 'Český Krumlov');
  assert.equal(F('Českého Krumlova')[0], 'Český Krumlov');
  assert.ok(!F('Vysokých Tatrách').includes('Vysoké Tatráchy'), '-ách není 2. pád');
});

test('Objevuj s horami: pěšky místo programu ve městě, okruh na celou oblast; u dalšího města zpět, volba uživatele zůstane', () => {
  const ex = T.ex;
  Object.assign(ex, { mode: 'city', radius: 5, auto: null, planOpen: false });
  const nat = async (q) => (await demo(() => geocodeExplore(q, { mapy: false, regions: true })))[0];
  const city = { label: 'Brno', lat: 49.1952, lon: 16.608, cc: 'CZ' };
  return (async () => {
    T.setPlace(await nat('Krkonoše'));
    assert.deepEqual([ex.mode, ex.radius, ex.planOpen, ex.place.nature, ex.place.km], ['hike', 20, true, 'range', 20]);
    T.setPlace(await nat('Sněžka'));
    assert.deepEqual([ex.mode, ex.radius], ['hike', 10], 'hora: okolí 10 km (okruh z 5 km, ne z Krkonoš)');
    T.setPlace(city);
    assert.deepEqual([ex.mode, ex.radius, ex.planOpen, ex.place.nature], ['city', 5, false, undefined], 'město: zpět program ve městě a 5 km');
    // větší okruh se nezmenší, jiný zvolený druh plánu zůstane
    Object.assign(ex, { mode: 'bike', radius: 50 });
    T.setPlace(await nat('Šumava'));
    assert.deepEqual([ex.mode, ex.radius, ex.auto], ['bike', 50, null]);
    // uživatel po horách sám zvolí výlety: u města zůstanou
    Object.assign(ex, { mode: 'city', radius: 10 });
    T.setPlace(await nat('Pálava'));
    assert.equal(ex.mode, 'hike');
    ex.mode = 'day';
    T.setPlace(city);
    assert.deepEqual([ex.mode, ex.radius], ['day', 10]);
    // věta s druhem plánu („Brno pěšky“) po horách: pěšky zůstane
    Object.assign(ex, { mode: 'city', radius: 10 });
    T.setPlace(await nat('Praděd'));
    T.exploreApply(Smart.parseExplore('Brno pěšky', { today }), city);
    T.setPlace(city);
    assert.equal(ex.mode, 'hike');
    // zapamatované místo („Naposledy“, obnovení stránky) si druh a okruh nese, cizí hodnoty ne
    assert.deepEqual(plain(T.cleanPlace({ label: 'Šumava', lat: 48.9769, lon: 13.6331, cc: 'CZ', nature: 'range', km: 20 })),
      { lat: 48.9769, lon: 13.6331, label: 'Šumava', cc: 'CZ', geo: false, country: '', nature: 'range', km: 20 });
    assert.deepEqual(plain(T.cleanPlace({ label: 'X', lat: 1, lon: 2, nature: 'volcano', km: 20 })), { lat: 1, lon: 2, label: 'X', cc: '', geo: false, country: '' });
    assert.equal(T.cleanPlace({ label: 'X', lat: 1, lon: 2, nature: 'peak', km: 7 }).km, undefined);
    Object.assign(ex, { mode: 'city', radius: 10, auto: null, place: null });
  })();
});
