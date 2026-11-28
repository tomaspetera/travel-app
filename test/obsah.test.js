// Obsahové stránky webu (server/lib/obsah.js, /zeme/<slug>): hlavičky a CSP bez skriptů, noindex do spuštění, 404 pro
// neznámé adresy, žádné ceny letenek v titulku ani náhledu, odkazy jen tam, kde stránka existuje, odkaz do aplikace
// (#hledat=) s rel="nofollow", deterministický výstup (stejný ETag po probuzení serveru), země v data/obsah.json
// s úplnými daty, čísla na stránce shodná s daty, štítek dokladu shodný s aplikací a stáří zdrojových dat.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';

process.env.ATLAS_MOCK = '1';
const { createServer } = await import('../server/index.js');
const { config } = await import('../server/config.js');
const { SECURITY_HEADERS } = await import('../server/lib/security.js');
const { COUNTRY_BY_ISO, getAirport } = await import('../server/lib/airports.js');
const { airportClimate } = await import('../server/lib/climate.js');
const { ARRIVAL, ARRIVAL_CHECKED, ARRIVAL_FX, arrivalTransfer } = await import('../server/lib/arrival.js');
const O = await import('../server/lib/obsah.js');

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const PATHS = O.contentPaths();
const CC_OF = Object.fromEntries(PATHS.map((p, i) => [p, Object.keys(O.OBSAH.zeme)[i]]));
const sp = (s) => String(s).replace(/ /g, ' ');
const metaOf = (html, k) => (new RegExp(`<meta (?:name|property)="${k}" content="([^"]*)">`).exec(html) || [])[1];
// sekce aplikace (#flights…), na které smí stránka odkazovat – stejný seznam jako isView() v app.js
const VIEWS = new Set(['planner', ...[...read('public/js/app.js').split('const NAV = [')[1].split(']];')[0].matchAll(/\['(\w+)', '/g)].map((m) => m[1])]);
// gramatika odkazu do aplikace (stejný regex jako parser v aplikaci, plan-faze2 §0.13)
const HLEDAT = /^#hledat=([A-Z]{3})?-([A-Z]{2,3})?(?:-(\d{2}|\d{4}-\d{2}-\d{2}(?:-\d{4}-\d{2}-\d{2})?))?$/;

let server, base;
const pages = {};
before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  for (const p of PATHS) pages[p] = await (await fetch(base + p)).text();
});
after(() => server.close());

test('HTTP: 200, HTML, CSP bez skriptů a cizích zdrojů, X-Atlas-Build obsah, mezipaměť, HEAD bez těla, ETag → 304', async () => {
  assert.ok(PATHS.includes('/zeme/portugalsko'));
  for (const p of PATHS) {
    const r = await fetch(base + p);
    assert.equal(r.status, 200, p);
    assert.equal(r.headers.get('content-type'), 'text/html; charset=utf-8');
    const csp = r.headers.get('content-security-policy');
    // doslovně podle plánu, ne proti konstantě v kódu – volnější politika (třeba img-src data:) by jinak prošla
    assert.equal(csp, "default-src 'none'; script-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    assert.match(csp, /script-src 'none'/);
    assert.doesNotMatch(csp, /http|\*/, 'nic cizího');
    assert.equal(r.headers.get('x-atlas-build'), 'obsah', 'service worker ji neuloží jako stránku aplikace');
    assert.equal(r.headers.get('cache-control'), 'public, max-age=300, s-maxage=86400');
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) assert.equal(r.headers.get(k), v, k);
    const etag = r.headers.get('etag');
    assert.ok(etag);
    assert.equal((await fetch(base + p, { headers: { 'if-none-match': etag } })).status, 304);
    const head = await fetch(base + p, { method: 'HEAD' });
    assert.deepEqual([head.status, await head.text(), head.headers.get('etag')], [200, '', etag]);
  }
});

test('neznámá adresa, velká písmena i lomítko na konci → 404 bez verze aplikace', async () => {
  for (const p of ['/zeme/neexistuje', '/zeme/Portugalsko', '/zeme/portugalsko/', '/kam-v-nicem', '/zeme/']) {
    const r = await fetch(base + p);
    assert.equal(r.status, 404, p);
    assert.equal(r.headers.get('x-atlas-build'), null, p);
  }
});

test('HTML: bez skriptů, jeden h1, česky, kanonická adresa, noindex do spuštění, velikost, ikony místo emoji', () => {
  for (const p of PATHS) {
    const html = pages[p];
    assert.match(html, /^<!DOCTYPE html>\n<html lang="cs">/);
    assert.doesNotMatch(html, /<script(?![^>]*type="application\/ld\+json")/i, 'jen datové bloky JSON-LD, žádný spustitelný skript');
    assert.doesNotMatch(html, /\son[a-z]+=/i, 'žádné obsluhy událostí');
    assert.equal(html.match(/<h1[\s>]/g).length, 1);
    assert.equal(/<link rel="canonical" href="([^"]+)">/.exec(html)[1], config.publicUrl + p);
    assert.equal(/<meta name="robots" content="noindex">/.test(html), !O.LIVE, 'noindex právě dokud stránky nejsou spuštěné');
    assert.ok(Buffer.byteLength(html) <= 40000, `${p}: ${Buffer.byteLength(html)} B`);
    // emoji jen vlajka (font Flags) – v nadpisech a tlačítkách nikdy (CLAUDE.md)
    const noFlags = html.replace(/<span class="flag" aria-hidden="true">(?:\p{Regional_Indicator}{2})<\/span>/gu, '');
    assert.doesNotMatch(noFlags.replace(/©/g, ''), /\p{Extended_Pictographic}|\p{Regional_Indicator}/u);
    assert.match(html, /<a class="skip" href="#obsah">/);
    assert.match(html, /<main id="obsah">/);
  }
});

test('SEO: titulek do 60 a popis do 155 znaků, jedineční, bez slibů a bez cen letenek v hlavičce a náhledu', () => {
  const titles = new Set(), descs = new Set();
  for (const p of PATHS) {
    const html = pages[p];
    const title = /<title>([^<]*)<\/title>/.exec(html)[1], desc = metaOf(html, 'description');
    assert.ok(sp(title).length <= 60, title);
    assert.ok(desc && sp(desc).length <= 155, `${desc} (${desc?.length})`);
    titles.add(title);
    descs.add(desc);
    const head = html.split('</head>')[0];
    const texts = [title, desc, ...[...head.matchAll(/<meta property="og:[^"]+" content="([^"]*)">/g)].map((m) => m[1]), ...[...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1])];
    for (const t of texts) {
      assert.doesNotMatch(t, /nejlevn|živ|aktuáln|ryanair|wizz|kiwi|easyjet|smartwings|ATLAS/i, t);
      assert.doesNotMatch(t, /\d\s*(Kč|€|CZK|EUR)/, `cena v hlavičce: ${t}`);
    }
  }
  assert.equal(titles.size, PATHS.length);
  assert.equal(descs.size, PATHS.length);
});

test('zdroje a odkazy: vlastní web, každý interní odkaz vede na existující stránku nebo soubor; #hledat= s nofollow', () => {
  for (const p of PATHS) {
    const html = pages[p];
    for (const [, tag, attrs] of html.matchAll(/<(link|img)\b([^>]*)>/g)) {
      const url = /(?:src|href)="([^"]+)"/.exec(attrs)[1];
      if (/rel="canonical"/.test(attrs)) continue;
      assert.match(url, /^\/(?!\/)/, `${tag} ${url}: jen vlastní web`);
      const file = url.split('?')[0];
      assert.ok(existsSync(new URL(`../public${file}`, import.meta.url)), `${file} existuje v public/`);
    }
    for (const [, attrs] of html.matchAll(/<a\b([^>]*)>/g)) {
      const href = /href="([^"]+)"/.exec(attrs)[1];
      if (/^https:\/\//.test(href)) continue; // zdroj (mzv.gov.cz) – cizí web, ne stránka Letsi
      const hash = href.startsWith('/#') ? href.slice(1) : null;
      if (hash?.startsWith('#hledat=')) {
        assert.match(hash, HLEDAT, href);
        assert.match(attrs, /rel="nofollow"/, `${href}: nofollow`);
        continue;
      }
      const ok = href === '#obsah' || href === '/' || PATHS.includes(href) || ['/soukromi', '/podminky'].includes(href) || (hash && VIEWS.has(hash.slice(1)));
      assert.ok(ok, `${p}: odkaz ${href} nevede na existující stránku`);
    }
  }
});

test('CSS: sdílený soubor jen s písmy z vlastního serveru (žádné Google Fonts ani cizí adresy)', () => {
  const css = read('public/obsah/obsah.css');
  assert.doesNotMatch(css, /https?:|@import/);
  const fonts = [...css.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1]);
  assert.ok(fonts.length >= 6);
  for (const f of fonts) assert.ok(existsSync(new URL(`../public${f}`, import.meta.url)), f);
  assert.match(css, /font-family:Flags;font-display:swap/);
});

test('determinismus: stejné bajty při každém vykreslení i v jiný den – v HTML není datum vykreslení', () => {
  const p = PATHS[0], cc = CC_OF[p];
  const a = O.countryHtml(cc, config.publicUrl);
  assert.equal(a, pages[p]);
  const RealDate = Date, fake = RealDate.UTC(2031, 0, 1);
  globalThis.Date = class extends RealDate {
    constructor(...x) { super(...(x.length ? x : [fake])); }
    static now() { return fake; }
  };
  try {
    assert.equal(O.countryHtml(cc, config.publicUrl), a, 'jiný den → stejné HTML (a stejný ETag)');
  } finally {
    globalThis.Date = RealDate;
  }
  assert.doesNotMatch(a, /2031/);
});

test('data/obsah.json: každá země projde pravidlem výběru (POPULAR nebo arrival.json, bezpečnost ≥ 3, ne soused, úplná data)', () => {
  const POPULAR = new Set(read('public/js/recs.js').match(/const POPULAR = new Set\(\[([^\]]+)\]/)[1].match(/[A-Z]{2}/g));
  const NEIGHBORS = new Set(['AT', 'DE', 'PL', 'SK', 'HU', 'SI']);
  assert.match(O.OBSAH.checked, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(new Set(PATHS).size, PATHS.length, 'adresy jedinečné');
  for (const [cc, z] of Object.entries(O.OBSAH.zeme)) {
    const c = COUNTRY_BY_ISO.get(cc), e = O.ENTRY.countries.find((x) => x.iso2 === cc), why = [];
    if (!c) { assert.fail(`${cc}: není v countries.json`); }
    if (!POPULAR.has(cc) && !z.letiste.some((i) => ARRIVAL[i])) why.push('není v POPULAR ani nemá letiště v arrival.json');
    if (!(c.safety >= 3)) why.push(`bezpečnost ${c.safety}`);
    if (NEIGHBORS.has(cc)) why.push('soused Česka');
    if (!e?.verified) why.push('vstup v entry.json chybí nebo není ověřený');
    if (!O.entryKind(e)) why.push('neznámý režim vstupu');
    if (typeof z.do !== 'string' || !z.do.trim()) why.push('chybí 2. pád „do“');
    if (!O.CUR_CS[c.cur]) why.push(`chybí český název měny ${c.cur}`);
    if (!c.months?.length) why.push('chybí doporučené měsíce');
    if (!O.PRETRIP.plugs[cc]) why.push('chybí zásuvky v pretrip.json');
    if (!z.letiste?.length || new Set(z.letiste).size !== z.letiste.length) why.push('letiště chybí nebo se opakují');
    for (const i of z.letiste || []) {
      if (getAirport(i)?.cc !== cc) why.push(`${i}: letiště nepatří do ${cc}`);
      const k = airportClimate(i);
      if (!k || k.hi.length !== 12 || k.p.length !== 12) why.push(`${i}: chybí podnebí`);
      // stránka vypisuje jízdné, měnu, zdroj a datum – ty má jen řádek z tabulky (ne 'access' ani odhad)
      if (arrivalTransfer(i)?.basis !== 'table') why.push(`${i}: cesta do centra není v tabulce arrival.json`);
    }
    assert.deepEqual(why, [], cc);
  }
});

test('konzistence: vzdálenosti v popisu a pásu = řádky letišť, měsíce v odpovědi = doporučené řádky, buňky = podnebí', () => {
  const num = (s) => Number(sp(s).replace(/\s/g, ''));
  for (const p of PATHS) {
    const html = sp(pages[p]), cc = CC_OF[p], z = O.OBSAH.zeme[cc];
    const rows = [...html.matchAll(/<td class="km"><b class="num">([\d ]+) km<\/b>/g)].map((m) => num(m[1]));
    assert.equal(rows.length, z.letiste.length);
    const [, lo, hi] = /([\d ]+)–([\d ]+) km od Prahy/.exec(metaOf(html, 'description'));
    assert.deepEqual([num(lo), num(hi)], [Math.min(...rows), Math.max(...rows)]);
    assert.equal(num(/<dd class="num">([\d ]+) km<\/dd>/.exec(html)[1]), Math.min(...rows), 'nejbližší v pásu');
    const mins = z.letiste.map((i) => arrivalTransfer(i).min);
    const [, mLo, mHi] = /<p class="odp">Z letiště do centra za (\d+)(?:–(\d+))? min\.<\/p>/.exec(html);
    assert.deepEqual([Number(mLo), Number(mHi ?? mLo)], [Math.min(...mins), Math.max(...mins)], 'cesta do centra v nadpisu = řádky');
    // tučný začátek poznámky o vstupu je z dat (2. pád), ne první „věta“ poznámky – ta se láme u zkratek a dat (od 1. 1.)
    assert.match(html, new RegExp(`<p class="stamp">.*?<span><b>Vstup do ${z.do}:</b> `), 'začátek poznámky o vstupu');

    const MON = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
    const MON_S = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'];
    const said = /<p class="odp">Nejhezčí je ([^<]+)\.<\/p>/.exec(html)[1].split(/, | a /).map((m) => MON.indexOf(m) + 1);
    const dopRows = [...html.matchAll(/<tr class="dop"><td><span>([^<]+)<\/span>/g)].map((m) => MON_S.indexOf(m[1]) + 1);
    assert.deepEqual(said, COUNTRY_BY_ISO.get(cc).months);
    assert.deepEqual(dopRows, said);

    const body = html.split('<tbody>')[1].split('</tbody>')[0];
    [...body.matchAll(/<tr[^>]*>(.*?)<\/tr>/g)].forEach(([, tr], m) => {
      const cells = [...tr.matchAll(/<b>(−?\d+) °C<\/b>(\d+) mm/g)];
      z.letiste.forEach((iata, i) => {
        const k = airportClimate(iata);
        assert.deepEqual([Number(cells[i][1].replace('−', '-')), Number(cells[i][2])], [k.hi[m], k.p[m]], `${iata} ${MON_S[m]}`);
      });
    });
  }
});

test('doklad: štítek na serveru = Entry.kind() z public/js/entry.js pro každou zemi sady', () => {
  const ctx = { window: {}, URLSearchParams, TextEncoder, TextDecoder, btoa, atob, console, URL };
  vm.createContext(ctx);
  vm.runInContext(read('public/js/ics.js'), ctx);
  const helpers = read('public/js/app.js').match(/^const (esc|safeUrl|pad|fmtYMD|fmtDate|czk) = .*$/gm);
  vm.runInContext(`const Ics = window.Ics;\n${helpers.join('\n')}\nvar byIso = {}; var S = {}; var flag = (iso) => iso;`, ctx);
  vm.runInContext(read('public/js/entry.js'), ctx);
  const { Entry } = ctx.window;
  Entry.set(JSON.parse(JSON.stringify(O.ENTRY)));
  for (const cc of Object.keys(O.OBSAH.zeme)) {
    const app = Entry.kind(Entry.get(cc)), srv = O.entryKind(O.ENTRY.countries.find((x) => x.iso2 === cc));
    assert.deepEqual([srv.key, srv.label, srv.text], [app.key, app.label, app.text], cc);
  }
  // všechny režimy, ne jen ty, které sada zrovna má
  for (const r of O.ENTRY.countries) {
    const app = Entry.kind(r), srv = O.entryKind(r);
    assert.deepEqual([srv.key, srv.label, srv.text], [app.key, app.label, app.text], r.iso2);
  }
});

test('izolace: obsah.js nenačítá nic, co drží ceny letenek', () => {
  const src = read('server/lib/obsah.js');
  for (const [, from] of src.matchAll(/^import .* from '([^']+)';$/gm)) assert.doesNotMatch(from, /search\.js|providers\/|fares\.js|pricelevel/, from);
});

test('stáří dat na stránkách: po 6 měsících upozornění, po 12 chyba', (t) => {
  const today = Date.now();
  const sources = {
    'entry.json checked': O.ENTRY.checked, 'arrival.json checked': ARRIVAL_CHECKED, 'arrival.json fx.date': ARRIVAL_FX.date,
    'pretrip.json checked': O.PRETRIP.checked, 'obsah.json safetyChecked': O.OBSAH.safetyChecked,
    ...Object.fromEntries(Object.values(O.OBSAH.zeme).flatMap((z) => z.letiste).map((i) => [`arrival.json ${i}`, ARRIVAL[i].date])),
  };
  for (const [k, d] of Object.entries(sources)) {
    assert.match(d, /^\d{4}-\d{2}(-\d{2})?$/, k);
    const months = (today - Date.parse(d.length === 7 ? `${d}-01` : d)) / (30.44 * 864e5);
    assert.ok(months < 12, `${k}: data z ${d} jsou starší než rok – ověř a aktualizuj`);
    if (months > 6) t.diagnostic(`${k}: data z ${d} jsou starší než půl roku`);
  }
});
