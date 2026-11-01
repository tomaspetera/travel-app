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

test('hledání do víc míst: výpis drží z každého cíle pár nejlevnějších (dřív dražší cíl mezi 60 nejlevnějšími chyběl)', async () => {
  const { topWithDays } = await import('../server/lib/search.js');
  const offer = (destKey, czk, day) => ({ destKey, perPersonCzk: czk, out: { date: `2026-12-${String(day).padStart(2, '0')}`, from: 'PRG' } });
  // 70 levných do Říma a Barcelony (po 3 na den je jich dost), Lisabon až za nimi
  const flat = [];
  for (let i = 0; i < 70; i++) flat.push(offer(i % 2 ? 'city:FCO' : 'city:BCN', 900 + i, 1 + (i % 25)));
  for (let i = 0; i < 8; i++) flat.push(offer('city:LIS', 1900 + i, 1 + i));
  flat.sort((a, b) => a.perPersonCzk - b.perPersonCzk);
  const top = topWithDays(flat);
  assert.equal(top.filter((t) => t.destKey === 'city:LIS').length, 5, 'pět nejlevnějších do Lisabonu');
  assert.equal(top.find((t) => t.destKey === 'city:LIS').perPersonCzk, 1900, 'štítek „Lisabon od 1 900“ je ve výpisu');
});

test('konkrétní cíl: skupiny (hlavička, štítky „od“, Mapa) z nabídek výpisu; nadpis karet podle řazení; mapa s nejnižší cenou', () => {
  assert.match(src, /const top = res\.mode === 'route' && \(res\.top \|\| \[\]\)\.length \? res\.top : null;/);
  assert.match(src, /visibleTrips\(top \? top\.filter\(t => t\.destKey === g\.dest\.key\) : g\.options\)/);
  assert.match(src, /date: '📅 Nejdřívější odlet', near: '📍 Nejblíž', far: '🌍 Nejdál' \}\[view\.sort\] \|\| '💸 Nejlevnější teď'/);
  assert.match(src, /t: g\.vis\.reduce\(\(m, x\) => \(x\.perPersonCzk < m\.perPersonCzk \? x : m\)\)/);
  // prázdný výpis jen jednou; „nových zemí“ jen u Kamkoliv a zemí; „Hledám jen pro dospělé (2 dospělí)“
  assert.match(src, /if \(!body\.includes\('class="empty"'\) && /);
  assert.match(src, /aerolinek\$\{isRoute \? '' : ', nových zemí'\}/);
  assert.match(src, /Hledám jen pro dospělé \(\$\{esc\(SearchHelp\.paxTxt\(lastForm\)\)\}\)/);
});

test('hlavička „nejlevněji … /os.“ z víc letišť řekne i odkud – výpis řadí i s cestou na letiště, nejlevnější letenka bývá níž', () => {
  assert.match(src, /const bestFrom = best && best\.out && best\.out\.from && res\.origins\.length > 1\s*\? ` z <button type="button" class="linkbtn best-jump" id="bestJump" data-tid="\$\{esc\(best\.id\)\}"[^`]*><b>\$\{esc\(best\.out\.from\)\}<\/b>&nbsp;↓<\/button>` : '';/);
  // klepnutí sjede na letenku; když ve výpisu není, Seznam podle nejlevnější letenky
  assert.match(src, /if \(show\(\)\) return;[\s\S]{0,200}view\.sort = 'total'; if \(view\.mode === 'map' \|\| view\.mode === 'cal'\) view\.mode = 'list';\s*rerender\(\); show\(\);/);
  assert.match(src, /nejlevněji <b class="good">\$\{czk\(best\.perPersonCzk\)\}<\/b>\/os\.\$\{bestFrom\}/);
});
