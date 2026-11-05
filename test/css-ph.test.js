// .ph je třída „fotka načtena“ (Photos v app.js – karty, úvod, hlavičky oken, ikony hlídání). Nadpis karty průběhu
// hledání má stejnou třídu, jeho styl proto smí platit jen uvnitř .progress-card – holé .ph{…} dávalo každé fotce
// po načtení tučný text a okraj 10 px dole (úvod, karty v mřížce i hlavička okna země poskočily).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('../public/css/', import.meta.url);

test('CSS: žádné pravidlo pro samotné .ph (kolize s třídou načtené fotky)', () => {
  for (const f of readdirSync(dir).filter(n => n.endsWith('.css'))) {
    const css = readFileSync(new URL(f, dir), 'utf8');
    assert.doesNotMatch(css, /(^|[},])\s*\.ph\s*[{,]/m, `${f}: .ph bez rodiče zasáhne i fotky`);
  }
  assert.match(readFileSync(new URL('flights.css', dir), 'utf8'), /\.progress-card \.ph\{font-weight:800/);
});

test('trip.css: řádek Průběhu cesty s dlouhou vlastní aktivitou (odkaz) nepřeteče na telefonu', () => {
  const rule = readFileSync(new URL('trip.css', dir), 'utf8').match(/\.tl-row\{[^}]*\}/)[0];
  assert.match(rule, /grid-template-columns:90px 26px minmax\(0,1fr\)/);
  assert.match(rule, /overflow-wrap:anywhere/);
});

test('trip.css: místo v Objevuj (.poi) a bod programu dne (.dp-item) s dlouhým slovem v názvu nepřeteče na telefonu', () => {
  const css = readFileSync(new URL('trip.css', dir), 'utf8');
  for (const [sel, cols] of [['poi', '96px minmax\\(0,1fr\\)'], ['dp-item', '22px minmax\\(0,1fr\\) auto']]) {
    const rule = css.match(new RegExp(`(^|\\n)\\.${sel}\\{[^}]*\\}`))[0];
    assert.match(rule, new RegExp(`grid-template-columns:${cols}`), sel);
    assert.match(rule, /overflow-wrap:anywhere/, sel);
  }
  // telefon (≤ 560 px) zúží obrázek na 72 px – i tam minmax(0,1fr), holé 1fr by se roztáhlo podle nejdelšího slova
  assert.match(css, /\.poi\{grid-template-columns:72px minmax\(0,1fr\)\}/);
  assert.doesNotMatch(css, /\.(poi|dp-item)\{[^}]*grid-template-columns:[^;}]*\s1fr/);
});

test('flights.css: vysvětlivka „Co to znamená?“ v modré poznámce nepřebírá žlutou barvu varování', () => {
  assert.match(readFileSync(new URL('flights.css', dir), 'utf8'), /\.mc-note \.mc-why\{[^}]*color:inherit/);
});
