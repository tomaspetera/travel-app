// Letsi Plus (public/js/plus.js přes node:vm): plánovaná cena se ukáže až po odpovědi na „Kolik by ti Plus stálo
// za rok?“. Tabulka Zdarma × Plus ani list limitu ji neukazují – jinak by se odpovědi přiklonily k ukázané ceně.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync(new URL('../public/js/plus.js', import.meta.url), 'utf8');
const ctx = { window: {} };
vm.runInNewContext(SRC, ctx);
const P = ctx.window.Plus;
const T = '2026-11-26';
const lis = { name: 'Lisabon', dest: 'Lisabon', start: '2027-01-05', end: '2027-01-09' };
const par = { name: 'Paříž', dest: 'Paříž', start: '2027-03-01', end: '2027-03-04' };
const cena = new RegExp(`${P.YEAR_CZK}|${P.MONTH_CZK}|na rok|na měsíc`);

test('věta o ceně Plus: bez odpovědi nic, po kterékoli odpovědi „Plánujeme kolem 399 Kč na rok“', () => {
  for (const a of [undefined, null, '', 'abc', '42']) assert.equal(P.priceNote(a), '', String(a));
  for (const p of P.PRICES) assert.equal(P.priceNote(String(p)), 'Plánujeme kolem 399 Kč na rok (nebo 149 Kč na měsíc).', `odpověď ${p}`);
});

test('tabulka Zdarma × Plus a list limitu jsou bez ceny; cena jen v odpovědi na otázku', () => {
  assert.doesNotMatch(P.pageHtml(), cena);
  assert.doesNotMatch(P.pageHtml({ affiliate: true }), cena);
  let html = '';
  P.gateFlow([lis], par, T, { proceed() {}, show: (h) => { html = h; }, hit() {} });
  assert.match(html, /data-pl="plus">Nechat si obě · Plus<\/button>/);
  assert.doesNotMatch(html, cena);
  // cenu skládá jen priceNote, a to jen v obsluze klepnutí na odpověď
  assert.equal(SRC.match(/kc\((YEAR|MONTH)_CZK\)/g).length, 2);
  assert.match(SRC, /b\.onclick = \(\) => \{\n\s+hit\(`price_\$\{b\.dataset\.price\}`\);[\s\S]{0,200}priceNote\(b\.dataset\.price\)/);
});
