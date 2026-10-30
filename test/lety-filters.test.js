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
