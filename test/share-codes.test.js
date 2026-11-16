// Sdílení bez kódů: okno Sdílet slibuje „bez kódů rezervací“ – 🔖 kódy rezervací (refs: { co, kod, pozn }) ani kód
// jízdenky (rides[].kod) se nesmí dostat do odkazu na cestu (#trip=), krátkého odkazu (/api/share), odkazu na plán
// (#plan=), karty „Jede někdo se mnou?“ (#jed=) ani do kalendáře (.ics) – i když je cesta průvodce nese přímo na sobě
// (cesta otevřená z Mých cest prochází sanitizeTrip, který nechá i neznámá pole). Klasické skripty přes node:vm jako
// v pretrip.test.js (průvodce se shrnutím a tlačítkem Sdílet) a sharecard.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const PT = JSON.parse(read('public/data/pretrip.json'));
const ENTRY = JSON.parse(read('data/entry.json'));
const COUNTRIES = JSON.parse(read('data/countries.json'));

const REF = 'REZ7K2QX', RIDE = 'JIZD9QX7', TOP = 'KOD4WZ8P', NOTE = 'POZN5TAJ';
const CODES = [REF, RIDE, TOP, NOTE];
const clean = (s, what) => { for (const k of CODES) assert.ok(!String(s).includes(k), `${what}: obsahuje ${k}\n${s}`); };

/** Průvodce cestou jako v prohlížeči (helpery z app.js, země, vstupní podmínky, pretrip.js, plánovač PlanShare, trip.js):
 *  shrnutí do falešných prvků (tlačítka v els), adresa a schránka. */
function wizard() {
  const ctx = { window: {}, URLSearchParams, TextEncoder, TextDecoder, btoa, atob, console, URL, Intl, setTimeout, clearTimeout, CompressionStream, DecompressionStream, location: { origin: 'https://atlas.example', pathname: '/', hash: '' } };
  vm.createContext(ctx);
  for (const f of ['ics.js', 'sharelink.js', 'planshare.js']) vm.runInContext(read(`public/js/${f}`), ctx, { filename: f });
  vm.runInContext('var ShareLink = window.ShareLink; var PlanShare = window.PlanShare;', ctx);
  const helpers = read('public/js/app.js').match(/^const (esc|safeUrl|pad|fmtYMD|fmtDate|czk) = .*$/gm);
  assert.equal(helpers.length, 6);
  vm.runInContext(`const Ics = window.Ics;\n${helpers.join('\n')}\nvar byIso = {}; var S = {}; var flag = (iso) => '[' + iso + ']'; var PACK = ['Pas / OP'];`, ctx, { filename: 'app-helpers.js' });
  for (const c of COUNTRIES) vm.runInContext(`byIso[${JSON.stringify(c.iso2)}] = ${JSON.stringify(c)};`, ctx);
  vm.runInContext(read('public/js/entry.js'), ctx, { filename: 'entry.js' });
  vm.runInContext('var Entry = window.Entry;', ctx);
  ctx.window.Entry.set(JSON.parse(JSON.stringify(ENTRY)));
  vm.runInContext(read('public/js/pretrip.js'), ctx, { filename: 'pretrip.js' });
  vm.runInContext('var PreTrip = window.PreTrip;', ctx);
  vm.runInContext(read('public/js/trip.js'), ctx, { filename: 'trip.js' });
  ctx.window.PreTrip.set(JSON.parse(JSON.stringify(PT)));
  const els = {};
  vm.runInContext('var $ = (s) => (s === "#tripRoot" ? __root : s === "#tripStep" ? __host : (__els[s] ||= { innerHTML: "", value: "" })); var $$ = () => []; var go = () => {}; var toast = () => {}; var save = () => {};', ctx);
  Object.assign(ctx, { __root: { innerHTML: '' }, __host: { innerHTML: '' }, __els: els, confirm: () => true, copied: [] });
  ctx.history = { replaceState: (s, title, h) => { ctx.location.hash = h; } };
  ctx.navigator = { clipboard: { writeText: (u) => { ctx.copied.push(u); return Promise.resolve(); } } };
  ctx.S.trips = [];
  return { c: ctx, els, Trip: ctx.window.Trip };
}

const leg = (from, to, date) => ({ from, to, date, dep: `${date}T10:00:00`, arr: `${date}T14:00:00`, hasTime: true });
const RIDES = [{ date: '2027-03-15', from: 'Tokio', to: 'Kjóto', kind: 'vlak', dep: '08:00', min: 135, tz: 'Asia/Tokyo', plat: '14', seat: 'vůz 7, místo 3A', kod: RIDE }];
const REFS = [{ co: 'Ryanair', kod: REF, pozn: NOTE }];
/** Cesta do Tokia v průvodci – s kódy i přímo na sobě (jako by je nesla cesta otevřená z Mých cest). */
function tokyo() {
  return {
    v: 1, created: 1767225600000, adults: 2, bags: 'none', nightsOneWay: 3, booked: {}, step: 'summary', ground: {},
    flight: { out: leg('PRG', 'NRT', '2027-03-12'), back: leg('NRT', 'PRG', '2027-03-21'), flightCzk: 5000 },
    dest: { label: 'Tokio', country: 'Japonsko', cc: 'JP', lat: 35.7, lon: 139.7 }, stay: null, car: null, plan: null,
    refs: REFS.map((r) => ({ ...r })), rides: RIDES.map((r) => ({ ...r })), kod: TOP,
  };
}
/** Táž cesta uložená v plánovači: 🔖 kódy rezervací, vlak s kódem jízdenky a celá cesta průvodce (i s kódy) ve wizard. */
const planned = (t) => ({
  name: 'Tokio 12. 3.', dest: 'Tokio', iso: 'JP', start: '2027-03-12', end: '2027-03-21', pax: '2', budget: '', flight: 'let',
  legs: [], days: { '2027-03-15': ['Kjóto'] }, checklist: [{ t: 'Pas / OP', done: false }], notes: '',
  tripId: t.created, wizard: JSON.parse(JSON.stringify(t)), refs: REFS.map((r) => ({ ...r })), rides: RIDES.map((r) => ({ ...r })), kod: TOP,
});
/** JSON ze sdíleného odkazu na cestu: zkomprimovaný („z“ + deflate-raw) i dřívější base64url JSON. */
const sentOf = (url) => {
  const p = url.split('#trip=')[1];
  return (p[0] === 'z' ? inflateRawSync(Buffer.from(p.slice(1), 'base64url')) : Buffer.from(p, 'base64url')).toString('utf8');
};

test('odkaz na cestu z průvodce (#trip=) bez kódů rezervací a kódu jízdenky – z plánovače ani přímo z cesty', async () => {
  const a = wizard(), t = tokyo();
  a.c.S.trip = t;
  a.c.S.trips = [planned(t)];
  a.Trip.render();
  await a.els['#sumShare'].onclick();
  const url = a.c.copied[0];
  assert.match(url, /^https:\/\/atlas\.example\/#trip=[A-Za-z0-9_-]+$/);
  const json = sentOf(url);
  assert.ok(json.includes('"NRT"'), 'odkaz nese cestu');
  clean(url, 'odkaz');
  clean(json, 'odkaz #trip=');
  const sent = JSON.parse(json);
  assert.deepEqual([sent.refs, sent.rides, sent.kod], [undefined, undefined, undefined]);
  // průvodce si kódy z plánovače dál čte – cesta odesílatele zůstala celá
  assert.equal(t.refs[0].kod, REF);
  assert.equal(t.rides[0].kod, RIDE);
});

test('krátký odkaz (/api/share) bez kódů: na server odchází stejný JSON jako v dlouhém odkazu', async () => {
  const a = wizard(), t = tokyo();
  a.c.S.trip = t;
  a.c.S.trips = [planned(t)];
  a.Trip.render();
  const sent = [];
  a.c.fetch = (u, o = {}) => {
    sent.push({ u: String(u), body: o.body || '' });
    return Promise.resolve(String(u) === 'api/share' ? { ok: true, status: 200, json: async () => ({ id: 'Abc12345' }) } : { ok: false, status: 404, json: async () => null });
  };
  await a.els['#sumShare'].onclick();
  assert.equal(a.c.copied[0], 'https://atlas.example/c/Abc12345');
  const post = sent.find((x) => x.u === 'api/share');
  assert.ok(post, 'krátký odkaz se uložil na server');
  const { k, j } = JSON.parse(post.body);
  assert.equal(k, 'trip');
  assert.ok(j.includes('"NRT"'));
  clean(post.body, 'krátký odkaz');
  for (const x of sent) clean(x.u + x.body, `dotaz ${x.u}`);
});

test('karta „Jede někdo se mnou?“ a kalendář z průvodce bez kódů', () => {
  const a = wizard(), t = tokyo();
  a.c.S.trip = t;
  a.c.S.trips = [planned(t)];
  const card = a.Trip.cardData(t);
  clean(JSON.stringify(card), 'data karty');
  // karta: ShareCard.json → odkaz #jed= (sharecard.js zvlášť – v průvodci by tlačítko Sdílet otevřelo okno karty)
  const sc = { window: {}, TextEncoder, TextDecoder, btoa, atob, CompressionStream, DecompressionStream, location: { origin: 'https://atlas.example', pathname: '/' }, navigator: {} };
  vm.createContext(sc);
  for (const f of ['sharelink.js', 'sharecard.js']) vm.runInContext(read(`public/js/${f}`), sc, { filename: f });
  clean(sc.window.ShareCard.json(card), 'karta #jed=');
  clean(sc.window.ShareCard.json(a.Trip.cardData(planned(t).wizard)), 'karta z plánovače');
  // kalendář (.ics) z průvodce
  const ev = a.Trip.calendarEvents(t);
  assert.ok(ev.length > 0);
  clean(JSON.stringify(ev), 'události kalendáře');
  clean(a.c.window.Ics.build(ev, { name: 'Tokio', now: 0 }), 'soubor .ics');
});

test('odkaz na plán z plánovače (#plan=) bez kódů – i když je wizard cesty nese', async () => {
  const a = wizard(), PS = a.c.window.PlanShare, p = planned(tokyo());
  const json = PS.json(p);
  assert.ok(json.includes('"seat":"vůz 7, místo 3A"'), 'vlak s nástupištěm a místem v odkazu je');
  clean(json, 'odkaz #plan=');
  clean(PS.encode(p), 'dřívější odkaz #plan=');
  const back = PS.decode(PS.encode(p));
  clean(JSON.stringify(back), 'plán u příjemce');
  // nový (zkomprimovaný) tvar odkazu
  clean(JSON.stringify(await PS.unpack(await a.c.window.ShareLink.pack(json))), 'plán ze zkomprimovaného odkazu');
});
