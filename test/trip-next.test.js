// Průvodce Cestou na telefonu: po přepnutí kroku leželo hlavní tlačítko kroku („Pokračovat k ubytování →“) podle délky
// kroku napůl pod plovoucí spodní lištou (klepnutí na jeho kus trefilo lištu). Kopie tlačítka nad lištou (Trip.phoneNext)
// se ukáže, dokud tlačítko v kroku není celé vidět. trip.js přes node:vm s falešnými prvky stránky.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext('var S = { trips: [] }; var $ = () => null, $$ = () => []; var esc = (s) => String(s);', ctx);
vm.runInContext(read('js/trip.js'), ctx, { filename: 'trip.js' });

// prvek s polohou na obrazovce (top..bottom v px okna 844 px; spodní lišta od 770, horní lišta do 68)
const box = (top, h) => ({ top, bottom: top + h, height: h });
function page({ btn = null, alt = null, navShown = true, active = true } = {}) {
  const els = {
    '#tripNext': { hidden: true, dataset: {}, innerHTML: '', firstElementChild: {} },
    '.mobile-nav': { display: navShown ? 'flex' : 'none', getBoundingClientRect: () => box(770, 62) },
    '.topbar': { getBoundingClientRect: () => box(0, 68) },
    '#view-trip': { classList: { contains: (c) => c === 'active' && active } },
  };
  if (btn) els[`#tripStep #${btn.id}`] = { textContent: btn.text, disabled: Boolean(btn.disabled), id: btn.id, isConnected: true, clicks: 0, click() { this.clicks++; },
    classList: { contains: (c) => c === 'primary' && btn.primary !== false }, getBoundingClientRect: () => box(btn.top, 52) };
  if (alt) els[`#tripStep #${alt.id}`] = { id: alt.id, getBoundingClientRect: () => box(alt.top, 34) };
  ctx.$ = (s) => els[s] || null;
  ctx.getComputedStyle = (el) => ({ display: el.display || 'block' });
  ctx.Trip.phoneNext();
  return els;
}

test('phoneNext: tlačítko kroku pod spodní lištou nebo dole → kopie nad lištou, klepnutí zmáčkne tlačítko v kroku', () => {
  // přesně případ z telefonu: „Pokračovat k ubytování →“ 777–829 px, lišta od 770
  const p = page({ btn: { id: 'rtNext', text: 'Pokračovat k ubytování →', top: 777 } });
  const bar = p['#tripNext'];
  assert.equal(bar.hidden, false);
  assert.equal(bar.innerHTML, '<button type="button" class="btn primary">Pokračovat k ubytování →</button>');
  bar.firstElementChild.onclick();
  assert.equal(p['#tripStep #rtNext'].clicks, 1);
  // napůl pod lištou, daleko dole, nad horní lištou (odrolováno) – vždy kopie
  for (const top of [740, 1712, -40]) assert.equal(page({ btn: { id: 'progNext', text: 'Pokračovat ke shrnutí →', top } })['#tripNext'].hidden, false, `top ${top}`);
});

test('phoneNext: tlačítko celé vidět, počítač bez spodní lišty, jiná sekce, krok bez tlačítka → bez kopie', () => {
  assert.equal(page({ btn: { id: 'tfNext', text: 'Pokračovat: Trasa →', top: 600 } })['#tripNext'].hidden, true);
  assert.equal(page({ btn: { id: 'tfNext', text: 'Pokračovat: Trasa →', top: 1055 }, navShown: false })['#tripNext'].hidden, true);
  assert.equal(page({ btn: { id: 'tfNext', text: 'Pokračovat: Trasa →', top: 1055 }, active: false })['#tripNext'].hidden, true);
  assert.equal(page({})['#tripNext'].hidden, true);
  // stejná akce výš v kroku je vidět („Auto nepotřebuji →“ nahoře, „Pokračovat k autu →“ u hotelů ve všech místech)
  assert.equal(page({ btn: { id: 'carSkip', text: 'Auto nepotřebuji →', top: 1712, primary: false }, alt: { id: 'carSkipTop', top: 614 } })['#tripNext'].hidden, true);
  assert.equal(page({ btn: { id: 'stayNext', text: 'Pokračovat k autu →', top: 2450 }, alt: { id: 'stayDone', top: 640 } })['#tripNext'].hidden, true);
  // … a když není vidět, kopie ano (vedlejší tlačítko bez „primary“)
  const p = page({ btn: { id: 'carSkip', text: 'Auto nepotřebuji →', top: 1712, primary: false }, alt: { id: 'carSkipTop', top: -200 } });
  assert.equal(p['#tripNext'].hidden, false);
  assert.match(p['#tripNext'].innerHTML, /class="btn">Auto nepotřebuji →/);
});

test('phoneNext: nepovolené tlačítko kroku jen ukáže, kde je (kopie aria-disabled)', () => {
  const p = page({ btn: { id: 'rtNext', text: 'Pokračovat k ubytování →', top: 1200, disabled: true } });
  assert.match(p['#tripNext'].innerHTML, /aria-disabled="true"/);
  let shown = 0;
  p['#tripStep #rtNext'].scrollIntoView = () => { shown++; };
  p['#tripNext'].firstElementChild.onclick();
  assert.equal(p['#tripStep #rtNext'].clicks, 0);
  assert.equal(shown, 1);
});

test('kopie tlačítka: jen na telefonu se spodní lištou, pevně nad ní a pod ní ve vrstvách; v průvodci za krokem', () => {
  const css = read('css/trip.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /\.trip-next\{display:none\}/);
  const phone = css.slice(css.indexOf('@media(max-width:860px){\n  .trip-next'));
  assert.match(phone, /\.trip-next:not\(\[hidden\]\)\{display:block;position:fixed;z-index:49;[^}]*bottom:calc\(max\(12px,env\(safe-area-inset-bottom\)\) \+ 70px\)\}/);
  // spodní lišta: výška 62 px, z-index 50, 12 px od okraje – kopie 8 px nad ní a pod ní (nepřekryje ji)
  const atlas = read('css/atlas.css');
  assert.match(atlas, /\.mobile-nav\{display:flex;[^}]*z-index:50;height:62px;[^}]*bottom:max\(12px,env\(safe-area-inset-bottom\)\)/);
  const js = read('js/trip.js');
  assert.match(js, /<div class="trip-next" id="tripNext" hidden><\/div>`;/);
  assert.match(js, /addEventListener\('scroll', pnSoon, \{ passive: true \}\)/);
});
