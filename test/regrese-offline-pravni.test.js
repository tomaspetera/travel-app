// Regresní drobnosti před spuštěním: počasí v okně země bez internetu (srozumitelná hláška, po připojení se načte
// samo) a zásady, podmínky a 404 v motivu zvoleném v aplikaci. Preload pod service workerem: test/startup.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const { THEME_SCRIPT, notFoundHtml, notFoundCsp } = await import('../server/lib/seo.js');
const { legalPage, LEGAL_CSP } = await import('../server/lib/pravni.js');
const { inlineScriptHashes } = await import('../server/lib/security.js');

const app = readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
const pick = (re) => { const m = app.match(re); assert.ok(m, `v app.js chybí ${re}`); return m[0]; };

/** loadWeather ve falešném prohlížeči: fetch selže chybou err, okno země PT je (ne)otevřené. */
function weather(err, { online = true } = {}) {
  const st = { html: '', queue: new Map(), fetches: 0, retry: null, iso: 'PT' };
  const box = { set innerHTML(h) { st.html = h; }, get innerHTML() { return st.html; } };
  const ctx = {
    S: { weather: {}, geo: {} }, save() {}, paintWeather() {}, wxSignal() {},
    capitalOf: () => ({ lat: 38.7, lon: -9.1 }),
    navigator: { onLine: online },
    fetch: () => { st.fetches++; return Promise.reject(err); },
    window: { Pwa: { whenOnline: (k, fn) => st.queue.set(k, fn) } },
  };
  ctx.Pwa = ctx.window.Pwa;
  ctx.$ = (q) => (q === '#wxBox' ? box : q === '#wxRetry' ? (st.retry = {}) : null);
  vm.createContext(ctx);
  vm.runInContext(`let curIso = 'PT';\n${pick(/^async function loadWeather\(c\) \{[\s\S]*?\n\}/m)}\n${pick(/^const wxFailTxt = .*$/m)}
this.loadWeather = loadWeather; this.setIso = (i) => { curIso = i; };`, ctx);
  return { st, ctx, run: () => ctx.loadWeather({ iso2: 'PT', capLL: [38.7, -9.1] }) };
}

test('počasí v okně země bez internetu: žádné „dej Aktualizovat“, po připojení se načte samo (jen v otevřeném okně)', async () => {
  const off = Object.assign(new Error('Jsi offline'), { offline: true });
  const w = weather(off);
  await w.run();
  assert.match(w.st.html, /Jsi offline – počasí se načte po připojení k internetu\./);
  assert.doesNotMatch(w.st.html, /Aktualizovat/);
  assert.ok(w.st.queue.has('wx'), 'nový pokus po připojení (Pwa.whenOnline)');
  // po připojení: okno té země pořád otevřené → nové načtení
  w.st.queue.get('wx')();
  await new Promise((r) => setImmediate(r));
  assert.equal(w.st.fetches, 2);
  // okno mezitím zavřené nebo jiná země → nic
  w.st.queue.clear(); w.ctx.setIso('IT');
  await w.run();
  assert.equal(w.st.fetches, 3);
  assert.ok(!w.st.queue.has('wx'), 'zavřené okno – nic se neplánuje');

  // chyba bez e.offline, ale prohlížeč hlásí offline (navigator.onLine)
  const w2 = weather(new TypeError('Failed to fetch'), { online: false });
  await w2.run();
  assert.match(w2.st.html, /Jsi offline/);
  assert.ok(w2.st.queue.has('wx'));
});

test('počasí v okně země, jiná chyba (zdroj neodpovídá): tlačítko Zkusit znovu přímo v okně, ne Aktualizovat pod ztmavením', async () => {
  const w = weather(new Error('bez počasí'));
  await w.run();
  assert.match(w.st.html, /Počasí se teď nepodařilo načíst\./);
  assert.match(w.st.html, /<button type="button" class="linkbtn" id="wxRetry">↻ Zkusit znovu<\/button>/);
  assert.doesNotMatch(w.st.html, /Aktualizovat|Jsi offline/);
  assert.equal(w.st.queue.size, 0);
  w.st.retry.onclick();
  await new Promise((r) => setImmediate(r));
  assert.equal(w.st.fetches, 2, 'klepnutí načte počasí znovu');
});

/** Skript s motivem ve falešné stránce: uložený stav atlas_v1 (řetězec, nebo null), vrátí data-theme a barvy lišty. */
function theme(saved) {
  const attrs = {}, metas = [{ content: '#F3F4F0' }, { content: '#14161F' }];
  vm.runInNewContext(THEME_SCRIPT.replace(/^<script>|<\/script>$/g, ''), {
    localStorage: { getItem: (k) => (k === 'atlas_v1' ? saved : null) },
    document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } }, querySelectorAll: () => metas },
  });
  return [attrs['data-theme'] || null, metas.map((m) => m.content).join(' ')];
}

test('zásady, podmínky a 404: motiv zvolený v aplikaci (atlas_v1.theme), jinak systém', () => {
  assert.deepEqual(theme(JSON.stringify({ theme: 'dark' })), ['dark', '#14161F #14161F']);
  assert.deepEqual(theme(JSON.stringify({ theme: 'light' })), ['light', '#F3F4F0 #F3F4F0']);
  // bez volby, bez stavu, poškozený stav: nic – rozhodne systém (media dotazy v CSS a theme-color)
  for (const s of [JSON.stringify({ theme: 'auto' }), JSON.stringify({}), null, '{rozbité']) assert.deepEqual(theme(s), [null, '#F3F4F0 #14161F'], String(s));

  const pages = [['zásady', legalPage('# Zásady\n\nText.'), LEGAL_CSP], ['404', notFoundHtml(), notFoundCsp(notFoundHtml())]];
  for (const [name, html, csp] of pages) {
    assert.ok(html.includes(THEME_SCRIPT), `${name}: skript s motivem`);
    assert.ok(html.indexOf(THEME_SCRIPT) < html.indexOf('<style>') && html.indexOf('name="theme-color"') < html.indexOf(THEME_SCRIPT), `${name}: v <head> za theme-color, před styly`);
    // tmavé barvy pro zvolený tmavý motiv i pro tmavý systém, pokud si uživatel nezvolil světlý
    assert.match(html, /:root\[data-theme=dark\]\{color-scheme:dark;--bg:#14161F;[^}]*--lg-l:none;--lg-d:block\}/, name);
    assert.match(html, /@media \(prefers-color-scheme:dark\)\{:root:not\(\[data-theme=light\]\)\{color-scheme:dark;--bg:#14161F;/, name);
    // logo podle motivu, ne podle systému (<picture> s media by světlou stránku v tmavém motivu nechal s tmavým logem)
    assert.doesNotMatch(html, /<picture|<source/, name);
    assert.match(html, /<img src="\/vendor\/letsi\/letsi-logo-hlavni\.svg"[^>]*><img src="\/vendor\/letsi\/letsi-logo-negativ\.svg"/, name);
    // CSP pustí skript s motivem podle otisku
    for (const h of inlineScriptHashes(THEME_SCRIPT)) assert.ok(csp.includes(`script-src ${h}`), `${name}: otisk v CSP`);
  }
});
