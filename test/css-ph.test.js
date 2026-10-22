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

test('flights.css: vysvětlivka „Co to znamená?“ v modré poznámce nepřebírá žlutou barvu varování', () => {
  assert.match(readFileSync(new URL('flights.css', dir), 'utf8'), /\.mc-note \.mc-why\{[^}]*color:inherit/);
});
