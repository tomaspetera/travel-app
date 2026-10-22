// Motiv: nový uživatel (bez uloženého motivu) dostane motiv podle systému – světlý telefon = světlý ATLAS, hned při
// startu bez probliknutí (skript na začátku index.html, barva lišty i úvodní obrazovka). Zvolený motiv a uložený motiv
// dřívějších uživatelů zůstane. Skript z index.html běží v node:vm s napodobeným prohlížečem; themeOf a defState jsou
// skutečné řádky z app.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
const INDEX = read('index.html');
const APP = read('js/app.js');
const CSS = read('css/atlas.css');
const bg = (t) => CSS.match(new RegExp(`\\[data-theme="${t}"\\]\\{[^}]*--bg:(#[0-9a-f]{6})`))[1];
const BOOT = [...INDEX.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes("localStorage.getItem('atlas_v1')"));
const pick = (...names) => names.map((n) => {
  const m = APP.match(new RegExp(`^(const ${n} = .*|function ${n}\\([^\\n]*\\})$`, 'm'));
  assert.ok(m, `app.js: ${n}`);
  return m[0];
}).join('\n');

/** Start stránky: stored = obsah atlas_v1 (undefined = nic uloženo), sys = 'light' | 'dark' | null (prohlížeč bez prefers-color-scheme). */
function boot(stored, sys) {
  const attrs = { 'data-theme': 'dark' };
  const metas = [{ content: bg('dark') }, { content: bg('light') }].map((m) => ({ ...m, setAttribute(k, v) { this[k] = v; } }));
  const win = {
    localStorage: { getItem: (k) => (k === 'atlas_v1' && stored !== undefined ? (typeof stored === 'string' ? stored : JSON.stringify(stored)) : null) },
    document: {
      documentElement: { setAttribute: (k, v) => { attrs[k] = v; } },
      querySelectorAll: (s) => (s === 'meta[name="theme-color"]' ? metas : []),
      querySelector: () => null,
    },
    navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14)', maxTouchPoints: 5 },
    performance: { now: () => 0 },
  };
  if (sys) win.matchMedia = (q) => ({ matches: q === `(prefers-color-scheme: ${sys})` });
  win.window = win;
  vm.runInNewContext(BOOT, win, { filename: 'index-boot.js' });
  return { theme: attrs['data-theme'], bar: [...new Set(metas.map((m) => m.content))] };
}

test('start: bez uloženého motivu podle systému (i barva lišty), zvolený nebo dřívější uložený motiv zůstane', () => {
  assert.ok(BOOT, 'skript s motivem v index.html');
  // nový uživatel: nic uloženého, nebo stav uložený už s motivem „podle systému“ (theme null)
  assert.deepEqual(boot(undefined, 'light'), { theme: 'light', bar: [bg('light')] });
  assert.deepEqual(boot(undefined, 'dark'), { theme: 'dark', bar: [bg('dark')] });
  assert.deepEqual(boot({ theme: null, visited: [] }, 'light'), { theme: 'light', bar: [bg('light')] });
  assert.deepEqual(boot('{poškozené', 'light'), { theme: 'light', bar: [bg('light')] });
  // prohlížeč bez prefers-color-scheme: jako dřív tmavý
  assert.deepEqual(boot(undefined, null), { theme: 'dark', bar: [bg('dark')] });
  // zvolený motiv (a výchozí tmavý uložený dřívější verzí – od zvoleného nejde odlišit) přebije systém
  assert.deepEqual(boot({ theme: 'dark' }, 'light'), { theme: 'dark', bar: [bg('dark')] });
  assert.deepEqual(boot({ theme: 'light' }, 'dark'), { theme: 'light', bar: [bg('light')] });
});

test('app.js: nový stav má motiv „podle systému“, themeOf = stejné pravidlo jako start v index.html', () => {
  const ctx = {};
  vm.runInNewContext(`${pick('themeOf', 'defState')}\nthis.themeOf = themeOf; this.def = defState();`, ctx);
  assert.equal(ctx.def.theme, null);
  for (const t of [undefined, null, 'dark', 'light', 'auto']) {
    for (const sys of ['light', 'dark']) {
      const stored = t === undefined ? undefined : { theme: t };
      assert.equal(ctx.themeOf(t, sys === 'light'), boot(stored, sys).theme, `${t} / ${sys}`);
    }
  }
  // přepínač ukládá vždy konkrétní motiv (opak toho, co je vidět) a systém sleduje jen bez vlastní volby
  assert.match(APP, /\$\('#themeToggle'\)\.onclick = \(\) => \{ S\.theme = themeNow\(\) === 'dark' \? 'light' : 'dark'; save\(\);/);
  assert.match(APP, /sysLightMq\.addEventListener\('change', sysChanged\)/);
});

test('úvodní obrazovka aplikace na ploše ve světlém motivu světlá – bez tmavé, která by se rozplynula do světlé aplikace', () => {
  const style = INDEX.match(/<style>([\s\S]*?)<\/style>/)[1];
  const standalone = style.slice(style.indexOf('@media (display-mode:standalone)'));
  assert.match(standalone, new RegExp(`\\[data-theme=light\\] #launch\\{background:${bg('light')};color:#0f1830\\}`));
  assert.match(standalone, /\[data-theme=light\] #launch \.l-air,\[data-theme=light\] #launch \.l-jet path\{fill:#0f1830\}/);
  // tmavá zůstane jako úvodní obrazovka Androidu z manifestu
  assert.match(standalone, new RegExp(`#launch\\{position:fixed;[^}]*background:${bg('dark')};`));
});
