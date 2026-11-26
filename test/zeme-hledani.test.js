// Hledání země hovorovým názvem (Svět → Země a Objevuj → Celá země), zdroj počasí v okně země a logo Mapy.com
// vůči zásadám (co vidí cizí servery).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const app = read('public/js/app.js');
const pick = (re) => { const m = app.match(re); assert.ok(m, `v app.js chybí ${re}`); return m[0]; };
const ZEME = [
  { iso2: 'US', cs: 'Spojené státy americké', en: 'United States', tags: [] },
  { iso2: 'GB', cs: 'Spojené království', en: 'United Kingdom', tags: [] },
  { iso2: 'NL', cs: 'Nizozemsko', en: 'Netherlands', tags: [] },
  { iso2: 'FR', cs: 'Francie', en: 'France', tags: ['pláže'] },
];
const HOVOROVE = [['usa', 'US'], ['anglie', 'GB'], ['holandsko', 'NL'], ['britanie', 'GB']];

test('Svět → Země: filtr renderCountries najde USA, Anglii, Holandsko i Británii', () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext([/^const norm = .*$/m, /^const tagHit = .*$/m, /^const cHit = [^\n]*\n[^\n]*$/m, /^const COUNTRY_ALIAS = .*$/m]
    .map(pick).join('\n') + '\nthis.cHit = cHit; this.norm = norm;', ctx);
  assert.match(pick(/function renderCountries\(\) \{[\s\S]*?\n\}/), /list\.filter\(c => cHit\(c, q\)\)/, 'renderCountries filtruje přes cHit');
  const hledej = (t) => ZEME.filter((c) => ctx.cHit(c, ctx.norm(t))).map((c) => c.iso2);
  for (const [t, iso] of HOVOROVE) assert.deepEqual(hledej(t), [iso], t);
  assert.deepEqual(hledej('Británie'), ['GB'], 'i s diakritikou a velkým písmenem');
  assert.deepEqual(hledej('fran'), ['FR'], 'obyčejný název dál funguje');
  assert.deepEqual(hledej('plá'), ['FR'], 'štítek dál funguje');
});

test('Objevuj → Celá země: výběr země najde hovorové názvy přes ccByName', () => {
  const byIso = Object.fromEntries(ZEME.map((c) => [c.iso2, c]));
  const ctx = { console, URLSearchParams, byIso };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(app.match(/^const (esc|enc|flag|safeUrl|cssUrl|pad|fmtYMD) = .*$/gm).join('\n'), ctx);
  vm.runInContext(read('public/js/places.js'), ctx, { filename: 'places.js' });
  const { ccAliasHits } = ctx.Places._t;
  for (const [t, iso] of HOVOROVE) assert.ok(ccAliasHits(t).has(iso), t);
  assert.ok(!ccAliasHits('usa').has('GB'));
  assert.equal(ccAliasHits('').size, 0, 'prázdné pole: nic navíc (ukáže se vše)');
  assert.match(read('public/js/places.js'), /al\.has\(b\.dataset\.cc\)/, 'wirePicker shodu přes ccAliasHits používá');
});

test('okno země: pod předpovědí je zdroj MET Norway s licencí CC BY 4.0 (paintWeather)', () => {
  const el = (id) => ({ id, innerHTML: '', insertAdjacentHTML(pos, html) { doc.after.push([this.id, pos, html]); doc.nodes['#wxSrc'] = el('wxSrc'); } });
  const doc = { after: [], nodes: { '#wxBox': el('wxBox'), '#fcBox': el('fcBox') } };
  const ctx = { document: doc, Intl, Date };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('public/js/weather.js'), ctx, { filename: 'weather.js' });
  vm.runInContext(`const $ = (s) => document.nodes[s] || null; const wIco = () => ['☀', 'jasno']; const fmtYMD = () => '2026-11-26'; const Weather = window.Weather;
${pick(/^const todayIn = .*$/m)}
${pick(/function paintWeather\(j\) \{[\s\S]*?\n\}/)}
this.paintWeather = paintWeather;`, ctx);
  const j = { now: { code: 0, t: 5, wind: 3, rh: 70 }, days: [{ date: '2026-11-26', code: 0, hi: 6, lo: 1 }] };
  ctx.paintWeather(j);
  ctx.paintWeather(j);
  assert.equal(doc.after.length, 1, 'druhé překreslení zdroj nepřidá znovu');
  const [after, pos, html] = doc.after[0];
  assert.deepEqual([after, pos], ['fcBox', 'afterend'], 'pod mřížkou dnů, ne v ní');
  assert.match(html, /^<div id="wxSrc" class="faint" style="font-size:11px/);
  assert.match(html, /MET Norway/);
  assert.match(html, /href="https:\/\/creativecommons\.org\/licenses\/by\/4\.0\/[^"]*"/);
  // Objevuj bere tentýž text z weather.js, ne vlastní kopii
  assert.doesNotMatch(read('public/js/places.js'), /met\.no/);
});

test('logo Mapy.com: buď z vlastního serveru, nebo ho zásady uvádějí mezi službami, které vidí IP adresu', () => {
  const js = ['places.js', 'app.js', 'flights.js', 'trip.js'].map((f) => read(`public/js/${f}`)).join('\n');
  // obrázek (src nebo konstanta s .svg/.png) z api.mapy.com; odkazy <a href> na podmínky a copyright smí zůstat
  const cizi = /['"`]https:\/\/api\.mapy\.com\/[^'"`]*\.(svg|png)['"`]/.test(js);
  if (!cizi) return;
  const z = read('docs/pravni/zasady-ochrany-osobnich-udaju.md');
  const tab = z.split('### 5.1')[1].split('### 5.2')[0];
  assert.match(tab, /^\| \*\*Mapy\.com\*\*.*logo/m, 'Mapy.com (logo) v tabulce služeb, kam se ptá prohlížeč');
  assert.doesNotMatch(tab, /^Mapy\.com[^\n]*\n?[^\n]*tyto služby tvou IP adresu nevidí/m, 'věta o IP nesmí Mapy.com vylučovat celé');
});
