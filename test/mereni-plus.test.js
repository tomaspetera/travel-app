// Předstartovní kontrola – Plus a měření: list limitu u víc uložených cest nelže o „jedné cestě“, karta Sešitu na
// Přehledu se počítá jako zobrazení (až když je vidět, jednou), Moje cesty z lišty se počítají jako Moje cesty,
// volba v přepínači souhlasu zavře kartu na Přehledu a Cesty návštěv ve statistikách mají české popisky kroků.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { TRACE_EVENTS } from '../server/lib/traces.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const T = '2026-11-26';
const lis = { name: 'Lisabon', dest: 'Lisabon', start: '2027-01-05', end: '2027-01-09' };
const rim = { name: 'Řím', dest: 'Řím', start: '2027-02-10', end: '2027-02-14' };
const par = { name: 'Paříž', dest: 'Paříž', start: '2027-03-01', end: '2027-03-04' };

function plus(extra = {}) {
  const ctx = { window: {}, ...extra };
  vm.runInNewContext(read('public/js/plus.js'), ctx);
  return ctx.window.Plus;
}
// list limitu: zachytí html listu a argument poděkování
function sheet(trips) {
  const o = { html: '', thanks: [] };
  const f = plus().gateFlow(trips, par, T, { proceed() {}, show: (h) => { o.html = h; }, hit() {}, thanks: (n) => o.thanks.push(n), download() {}, close() {}, confirm: () => true, remove() {} });
  f.choose('plus');
  return o;
}

test('list limitu: u dvou a víc uložených cest počet a „všechny“, ne „držíš jednu cestu“ a „obě“; u jedné beze změny', () => {
  const two = sheet([lis, rim]);
  assert.doesNotMatch(two.html, /držíš jednu cestu|obsazené|obě/);
  assert.match(two.html, /uložené 2 cesty, nejbližší <b>Lisabon<\/b> 5\.–9\.\u00a01\./);
  assert.match(two.html, /Nechat si všechny · Plus/);
  assert.deepEqual(two.thanks, [2], 'poděkování ví, kolik cest už je');
  assert.match(sheet([lis, rim, par, { ...par, name: 'Vídeň' }, { ...par, name: 'Oslo' }]).html, /uložených 5 cest/);

  const one = sheet([lis]);
  assert.match(one.html, /<h3>Místo pro jednu cestu máš obsazené<\/h3>/);
  assert.match(one.html, /Zdarma si tu držíš jednu cestu – teď <b>Lisabon<\/b> 5\.–9\.\u00a01\./);
  assert.match(one.html, /Nechat si obě · Plus/);
  assert.deepEqual(one.thanks, [1]);
  // po volbě Plus se cesta už uložila – nadpis „máš obsazené“ nad „nech si je“ by odporoval
  assert.match(read('public/js/plus.js'), /sheet\.querySelector\('h3'\)\.textContent = 'Cesta se uložila'/);
});

test('karta Sešitu na Přehledu: sesit_shown až když je vidět a jednou za načtení pro cestu', () => {
  const d = new Date(); d.setDate(d.getDate() + 6);
  const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const hits = [], ios = [];
  class IO { constructor(cb) { this.cb = cb; ios.push(this); } observe() {} disconnect() { this.off = true; } }
  const env = (io) => ({
    window: { Count: { hit: (e) => hits.push(e) } },
    S: { trips: [{ name: 'Lisabon', dest: 'Lisabon', tripId: 7, start, end: start }] },
    localStorage: { getItem: () => null, setItem() {} },
    document: { querySelector: () => ({}) },
    ...(io ? { IntersectionObserver: io } : {}),
  });
  const P = plus(env(IO)), el = { hidden: true, innerHTML: '' };
  P.renderCard(el, false);
  assert.equal(el.hidden, false);
  assert.deepEqual(hits, [], 'karta pod ohybem ještě není zobrazení');
  ios[0].cb([{ isIntersecting: false }]);
  assert.deepEqual(hits, []);
  ios[0].cb([{ isIntersecting: true }]);
  assert.deepEqual(hits, ['sesit_shown']);
  assert.ok(ios[0].off, 'po zobrazení se už nehlídá');
  P.renderCard(el, false); // návrat na Přehled
  ios[1].cb([{ isIntersecting: true }]);
  P.sesitShown(7); // Shrnutí téže cesty (t.created = tripId)
  assert.deepEqual(hits, ['sesit_shown'], 'jednou za načtení pro cestu, karta i Shrnutí dohromady');
  P.renderCard(el, true);
  assert.equal(el.hidden, true, 'při uvítání žádná karta');

  hits.length = 0;
  plus(env(null)).renderCard({ hidden: true, innerHTML: '' }, false);
  assert.deepEqual(hits, ['sesit_shown'], 'prohlížeč bez IntersectionObserver: hned');
});

/* ---------- app.js: funkce podle jména (celý app.js potřebuje DOM) ---------- */
const APP = read('public/js/app.js');
const pick = (n) => {
  const m = APP.match(new RegExp(`^(const ${n} = .*|function ${n}\\([\\s\\S]*?^\\})$`, 'm'));
  assert.ok(m, `app.js: ${n}`);
  return m[0];
};

test('Cesty z lišty s uloženou cestou a bez rozpracované = Moje cesty (view_trips), jinak Průvodce (view_trip)', () => {
  const c = { window: {} };
  vm.runInNewContext(`${read('public/js/count.js')}\n${pick('tripMine')}\nthis.tripMine = tripMine;`, c);
  const ev = (trip, trips) => c.window.Count.viewEvent('trip', c.tripMine(trip, trips));
  assert.equal(ev(null, [{ name: 'Lisabon' }]), 'view_trips');
  assert.equal(ev(null, [null]), 'view_trip', 'jen prázdné místo v seznamu');
  assert.equal(ev(null, []), 'view_trip', 'bez cest úvod průvodce');
  assert.equal(ev({ created: 1 }, [{ name: 'Lisabon' }]), 'view_trip', 'rozpracovaná cesta = průvodce');
  assert.equal(ev(null, undefined), 'view_trip');
  // trip.js render() rozhoduje stejně
  assert.match(read('public/js/trip.js'), /const mine = window\.myTrips && \(\(!t && Array\.isArray\(S\.trips\) && S\.trips\.some\(Boolean\)\)/);
  assert.match(APP, /Count\.view\(v, opts\.mine \|\| \(v === 'trip' && tripMine\(S\.trip, S\.trips\)\)\);/);
});

test('přepínač souhlasu v okně zavře kartu „Pomůžeš mi…?“ na Přehledu; Podrobnosti skočí k přepínači', () => {
  const node = (q = {}) => ({ hidden: false, innerHTML: 'x', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, q });
  const card = node(), faint = { textContent: '' }, btn = node({ '.faint': faint });
  let helping = false;
  const c = {
    Count: { helping: () => helping, consent: (on) => { helping = on; } },
    toast() {},
    $: (s, r) => (r ? (r.q[s] ?? null) : s === '#whatsNew' ? card : null),
  };
  vm.runInNewContext(`${pick('helpSwitch')}\nhelpSwitch(b);`, Object.assign(c, { b: btn }));
  card.q = { '[data-help]': {} }; // karta souhlasu je v #whatsNew
  btn.onclick();
  assert.equal(helping, true);
  assert.equal(card.hidden, true);
  assert.equal(card.innerHTML, '', 'Ne, díky už není na co klepnout');
  assert.equal(btn.attrs['aria-checked'], 'true');

  const welcome = node({}); // v #whatsNew je uvítání, ne karta souhlasu → nechat
  c.$ = (s, r) => (r ? (r.q[s] ?? null) : s === '#whatsNew' ? welcome : null);
  btn.onclick();
  assert.equal(welcome.hidden, false);
  assert.equal(helping, false);

  assert.match(pick('helpCard'), /About\.open\(\); const b = \$\('#abHelp'\); if \(b\) b\.scrollIntoView\(\{ block: 'center' \}\);/);
});

/* ---------- statistiky.js: Cesty návštěv ---------- */
const SC = { window: {} };
vm.runInNewContext(read('public/js/statistiky.js'), SC);
const St = SC.window.Stats;

test('Cesty návštěv: každý krok záznamu má český popisek z tabulek stránky; app_open cestu neprodlužuje', () => {
  assert.deepEqual(TRACE_EVENTS.filter((e) => St.label(e) === e), []);
  assert.equal(St.label('view_trips'), 'Moje cesty');
  assert.equal(St.label('trip_started'), 'Otevřený průvodce cestou', 'hlavní čísla mají přednost');
  assert.equal(St.label('form_err_from'), 'Formulář odmítl: chybí Odkud');
  assert.equal(St.label('trip_step_route'), 'Průvodce: Trasa');
  assert.equal(St.label('lazy_fail'), 'Část aplikace se nenačetla');
  const v = [[[0, 'view_dashboard'], [1, 'app_open'], [5, 'view_flights']], [[0, 'view_dashboard'], [1, 'app_open'], [9, 'view_flights']]];
  assert.deepEqual(JSON.parse(JSON.stringify(St.topPaths(v, 2))), [['view_dashboard → view_flights', 2, 100]]);
  assert.deepEqual(JSON.parse(JSON.stringify(St.exits([[[0, 'app_open']]]))), [], 'návštěva jen s otevřením nemá kde končit');
});

test('Cesty návštěv bez záznamů: věta, že se zapisují s odstupem (40 min = FLUSH_MS + mezipaměť čtení), ne pět prázdných tabulek', async () => {
  const { FLUSH_MS } = await import('../server/lib/counts.js');
  assert.equal(FLUSH_MS, 30 * 60e3, 'věta v NO_VISITS počítá s 30 min zápisu');
  assert.match(read('server/lib/traces.js'), /cacheMs = 10 \* 60e3/, '… a 10 min mezipaměti čtení');
  // záznam odchází až při skrytí stránky – „do 30 minut“ by neplatilo, dokud má člověk aplikaci otevřenou
  assert.match(read('public/js/count.js'), /const onHide = \(\) => \{ if \(document\.visibilityState === 'hidden'\) send\(\); \};/);
  assert.match(St.NO_VISITS, /aplikaci zavře nebo přepne jinam, a zapisuje se s odstupem – nová návštěva se tu objeví zhruba do 40 minut/);
  const root = { innerHTML: '', setAttribute() {}, removeAttribute() {} }, box = { innerHTML: '' };
  const replies = [{ ok: true, status: 200, json: async () => ({ days: [], total: {} }) }, { ok: true, status: 200, json: async () => ({ days: 30, visits: [] }) }];
  const c = {
    window: {}, URLSearchParams, location: { search: '' }, history: { replaceState() {} },
    document: { getElementById: (id) => (id === 'stats' ? root : id === 'traces' ? box : null), querySelectorAll: () => [] },
    fetch: async () => replies.shift(),
  };
  vm.runInNewContext(read('public/js/statistiky.js'), c);
  await new Promise((r) => setTimeout(r, 20));
  assert.match(box.innerHTML, /zhruba do 40 minut/);
  assert.doesNotMatch(box.innerHTML, /Kde návštěvy končí/);
  assert.match(box.innerHTML, /Opakované klepnutí podle sekce/, 'počty z /api/stats zůstanou');
});
