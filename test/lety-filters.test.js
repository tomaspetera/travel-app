// Filtry výsledků Letů (⚙️ Filtry): posuvník max. ceny a další drobnosti panelu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../public/js/flights.js', import.meta.url), 'utf8');

test('posuvník max. ceny začíná na nejlevnější nabídce – úplně vlevo nic neschová a neskočí na „bez limitu“', () => {
  // dřív min="0": hodnota 0 = žádný limit → ukázal „0 Kč“, nic neschoval a po puštění skočil zpět
  assert.match(src, /id="fPrice"[^>]*min="\$\{minP\}"/);
  const m = src.match(/const minP = ([^;]+);/);
  assert.ok(m, 'minP spočítané z cen výpisu');
  const minOf = new Function('prices', 'maxP', `return ${m[1]};`);
  assert.equal(minOf([516, 910, 4034], 4034), 600, 'nahoru na stovky – nejlevnější (516) při minimu zůstane');
  assert.equal(minOf([700], 700), 700, 'jediná cena: min = max');
  assert.equal(minOf([], 0), 0);
  // úplně vlevo zůstane aspoň nejlevnější nabídka
  for (const prices of [[516, 910], [499, 1200], [1000, 1001]]) assert.ok(Math.min(...prices) <= minOf(prices, Math.max(...prices)));
});

test('štítky cílů nad výpisem („Hurghada od 4 748 Kč“) ukazují nejlevnější nabídku cíle, ne první doporučenou', () => {
  // dřív g.vis[0] – výpis je řazený podle doporučení, štítek tak tvrdil „od“ vyšší cenu než nejlevnější let v seznamu
  const m = src.match(/<div class="dest-mini">\$\{groups\.map\(g => `<span class="chip">\$\{flag\(g\.dest\.cc\)\} \$\{esc\(g\.dest\.label\)\} od <b>\$\{czk\(([^}]+)\)\}<\/b>/);
  assert.ok(m, 'štítek cíle s cenou „od“');
  const of = new Function('g', `return ${m[1]};`);
  assert.equal(of({ vis: [{ perPersonCzk: 4157 }, { perPersonCzk: 4083 }, { perPersonCzk: 5200 }] }), 4083);
});
