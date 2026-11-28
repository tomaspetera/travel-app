// Připravenost na veřejné spuštění 12. 1. 2027 (čistý režim): RegioJet v /api/health a jeho dopad na front-end,
// pravdivá hláška po „Ne, díky“, právní texty bez natvrdo vyjmenovaných živých zdrojů a návod docs/spusteni.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { config } from '../server/config.js';
import { providerStatus } from '../server/providers/index.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const esc = (s) => String(s ?? '');
const plural = (n, one, few, many) => `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;

/** providerStatus() v ostré větvi s danou hodnotou REGIOJET_LIVE (undefined = nenastaveno). */
function status(live) {
  const prev = { mock: config.mock, env: process.env.REGIOJET_LIVE };
  config.mock = false;
  if (live === undefined) delete process.env.REGIOJET_LIVE; else process.env.REGIOJET_LIVE = live;
  try {
    return providerStatus();
  } finally {
    config.mock = prev.mock;
    if (prev.env === undefined) delete process.env.REGIOJET_LIVE; else process.env.REGIOJET_LIVE = prev.env;
  }
}
const rj = (live) => status(live).find((p) => p.id === 'regiojet');

test('/api/health hlásí RegioJet podle REGIOJET_LIVE (kind ground) – čistý režim ho sám nevypne', () => {
  assert.deepEqual([rj(undefined).enabled, rj('1').enabled, rj('0').enabled], [true, true, false]);
  assert.equal(rj('0').kind, 'ground');
  assert.equal(rj('0').name, 'RegioJet');
});

// funkce panelu Zdroje cen a řádku po hledání z public/js/flights.js (čistý režim podle /api/health)
const fl = read('public/js/flights.js');
const a = fl.indexOf('  /* ---------- čistý režim: co ze zdrojů'), b = fl.indexOf('  /* ---------- živé ověření cen z mezipaměti');
assert.ok(a > 0 && b > a, 'úsek čistého režimu ve flights.js');
const F = (health) => new Function('health', 'esc', 'plural', `${fl.slice(a, b)}; return { srcLine, srcBoxHtml, cacheOnly };`)(health, esc, plural);

test('Zdroje cen: zapnutý RegioJet nepřidá zdroj cen letů a nepřepne „orientačně“ na „živě“', () => {
  // čistý režim tak, jak ho vrátí server: Travelpayouts + OpenStreetMap, RegioJet podle REGIOJET_LIVE
  const prev = { r: config.ryanair, w: config.wizz, k: config.kiwi, x: config.xotelo, l: config.liteapiKey, t: config.travelpayoutsToken };
  Object.assign(config, { ryanair: false, wizz: false, kiwi: false, xotelo: false, liteapiKey: '', travelpayoutsToken: 'test' });
  try {
    for (const live of ['1', '0']) {
      const h = { providers: status(live) };
      const f = F(h);
      assert.equal(f.srcLine(), 'Ceny orientačně · 2 zdroje', `REGIOJET_LIVE=${live}`);
      assert.doesNotMatch(f.srcBoxHtml(), /RegioJet/);
      assert.equal(f.cacheOnly(), true, 'řádek po hledání „Ceny z posledních 48 h“ zůstane');
    }
  } finally {
    Object.assign(config, { ryanair: prev.r, wizz: prev.w, kiwi: prev.k, xotelo: prev.x, liteapiKey: prev.l, travelpayoutsToken: prev.t });
  }
});

test('O aplikaci: „RegioJet (spoje a ceny na vyžádání)“ jen se zapnutým REGIOJET_LIVE, jinak jen odkazy', () => {
  const ctx = { console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('public/js/about.js'), ctx, { filename: 'about.js' });
  const row = (live) => ctx.About.sources({ providers: status(live) }).find((x) => x[1] === 'Vlak a bus')[2];
  assert.match(row('1'), /^RegioJet \(spoje a ceny na vyžádání\); FlixBus a IDOS jen jako odkazy$/);
  assert.equal(row('0'), 'RegioJet, FlixBus a IDOS jen jako odkazy');
});

test('„Ne, díky“ u Pomáhat se zlepšováním: netvrdí „nic nezaznamenávám“, souhrnné počty jdou dál (zásady 3.6)', () => {
  const app = read('public/js/app.js');
  const fn = app.slice(app.indexOf('function helpCard('), app.indexOf('const WN_TOP_LS'));
  assert.match(fn, /say\('Dobře, záznam návštěvy nezapínám\. Počítají se jen souhrnné denní počty bez vazby na tebe\. Změnit to jde v Další nebo v O aplikaci a soukromí\.'\)/);
  assert.doesNotMatch(fn, /say\('[^']*nic nezaznamenávám/);
  // Count.hit opravdu jede i bez souhlasu – kdyby se to změnilo, hláška může být zase kratší
  assert.match(read('docs/pravni/zasady-ochrany-osobnich-udaju.md'), /### 3\.6 Souhrnné denní počty/);
});

test('právní texty: Ryanair, Wizz Air, Kiwi.com a Xotelo jen jako „pokud jsou zapnuté“, hlavní zdroj Aviasales', () => {
  const pod = read('docs/pravni/podminky-uzivani.md'), zas = read('docs/pravni/zasady-ochrany-osobnich-udaju.md');
  const sec = (s, h) => s.slice(s.indexOf(h), s.indexOf('\n## ', s.indexOf(h) + 1));
  const veta = sec(pod, '## 4. Ceny a spoje').split('Proto:')[0];
  assert.match(veta, /ceny letů a odkaz k nákupu letenky z Travelpayouts \/\s+Aviasales/);
  assert.match(veta, /Pokud jsou\s+zapnuté živé zdroje \(testovací provoz\), také z webů Ryanair a Wizz Air, Kiwi\.com, TripAdvisoru \(přes Xotelo\)/);
  assert.doesNotMatch(sec(pod, '## 2. Co Letsi je'), /Kiwi/);
  const prijemci = zas.slice(zas.indexOf('### 5.2'), zas.indexOf('### 5.3'));
  assert.match(prijemci, /- ceny letů: \*\*Travelpayouts \/ Aviasales\*\*; pokud jsou zapnuté živé zdroje \(testovací provoz\), také \*\*Ryanair\*\*/);
  assert.match(prijemci, /- ubytování: OpenStreetMap \(Nominatim\); pokud jsou zapnuté ceny ubytování/);
  // otázka 6 pro advokáta jmenuje i počítadlo návštěv krátkých otázek
  assert.match(zas, /6\. \*\*localStorage a § 89 odst\. 3 ZEK\.\*\*[\s\S]*?`atlas_ask`: počet dní s návštěvou[\s\S]*?7\. \*\*Partnerské odkazy/);
});

test('docs/spusteni.md: čistý režim, REGIOJET_LIVE a kontrola přes /api/health; odkaz z README a mapy', () => {
  const s = read('docs/spusteni.md');
  for (const v of ['RYANAIR_ENABLED', 'WIZZ_ENABLED', 'KIWI_ENABLED', 'XOTELO', 'LITEAPI_KEY', 'REGIOJET_LIVE', 'TRAVELPAYOUTS_TOKEN']) assert.ok(s.includes(`\`${v}\``), v);
  assert.match(s, /regiojet/);
  assert.match(s, /23\. 10\. 2027\*\* \(nařízení \(EU\) 2026\/2202[^\n]*\n[^\n]*https:\/\/eur-lex\.europa\.eu\/eli\/reg\/2026\/2202\/oj\/ces/);
  assert.doesNotMatch(s, /^curl[^\n]*\/api\/search/m, 'návod nesmí volat drahé hledání na produkci');
  assert.match(read('README.md'), /Čistý režim \(veřejné spuštění\)[\s\S]{0,800}docs\/spusteni\.md/);
  assert.match(read('docs/mapa.md'), /docs\/spusteni\.md/);
});
