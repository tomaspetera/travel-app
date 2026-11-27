// Přístupnost vzhledu na telefonu: větší písmo v systému (Android 130–150 %) nesmí překrýt název cíle rámečkem ceny ani
// roztáhnout stránku do strany, drobné odkazy a ✕ mají plochu pro prst aspoň 24 px (WCAG 2.5.8). Statické kontroly CSS;
// vzhled při běžném písmu ověřen pixelovým porovnáním snímků (412 / 360 / 600 px, světlý i tmavý režim).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const atlasCss = noComments(read('css/atlas.css')), flightsCss = noComments(read('css/flights.css'));
const tripCss = noComments(read('css/trip.css'));
/** Bloky @media s danou podmínkou (obsah mezi závorkami, i víc stejných). */
const media = (css, cond) => [...css.matchAll(new RegExp(`@media\\s*\\(${cond.replace(/[()]/g, '\\$&')}\\)\\s*\\{([\\s\\S]*?\\})\\s*\\}`, 'g'))].map((m) => m[1]).join('\n');

test('větší písmo: rámeček „Celkem zatím“ je na telefonu v toku hlavičky, absolutně jen od 861 px', () => {
  // mimo media dotazy zůstává absolutní (počítač a širší tablet), telefon a tablet do 860 px ho vrací do toku
  assert.match(tripCss, /^\.th-total\{position:absolute;top:14px;right:14px;/m);
  const tab = media(tripCss, 'max-width:860px'), tel = media(tripCss, 'max-width:560px');
  assert.match(tab, /\.th-total\{position:static;align-self:flex-end;margin:calc\(clamp\(0px,\(1lh - 1\.5em\)\*40,48px\) - 2px\) -4px auto 0\}/);
  assert.match(tel, /\.th-total\{padding:7px 12px;margin:clamp\(0px,\(1lh - 1\.5em\)\*40,48px\) -2px auto 0\}/);
  assert.match(tab, /\.th-dest\{margin-top:clamp\(-10px,\(1lh - 1\.5em\)\*40 - 10px,8px\)\}/);
});

test('větší písmo: signál (1lh - 1.5em) je 0 při běžném písmu a od +10 % odsune rámeček pod vlajku a ↺', () => {
  // Chrome (text-size-adjust, písmo systému v Androidu) zvětší písmo i 1lh, ale em/rem ne – rozdíl je míra zvětšení.
  // Platí jen s řádkováním 1,5 zděděným z body; jinak by signál „střílel“ i při běžném písmu.
  assert.match(atlasCss, /^body\{[^}]*line-height:1\.5;/m);
  const clamp = (lo, v, hi) => Math.min(Math.max(lo, v), hi);
  const sig = (scale, fs = 16) => (fs * scale * 1.5 - 1.5 * fs) * 40; // (1lh - 1.5em)*40 v px
  const total = (s) => clamp(0, sig(s), 48), dest = (s) => clamp(-10, sig(s) - 10, 8);
  assert.equal(total(1), 0, 'běžné písmo: rámeček nahoře vpravo jako dřív');
  assert.equal(dest(1), -10, 'běžné písmo: název zasahuje 10 px do rezervy jako dřív (výška hlavičky beze změny)');
  for (const s of [1.1, 1.3, 1.5, 2]) {
    assert.ok(total(s) >= 44, `${s}: rámeček pod vlajkou (44 px), ne vedle „↺ Začít znovu“`);
    assert.ok(dest(s) > 0, `${s}: mezera mezi rámečkem a názvem`);
  }
});

test('větší písmo: stránka nejde posouvat do strany (štítek aplikace, tabulka ceny, přepínače)', () => {
  // 🎫 Jízdenka v PID Lítačka se zalomí uvnitř, jen když se nevejde na samostatný řádek (dřív jen do 380 px)
  assert.match(atlasCss, /^\.app-chip\{[^}]*white-space:normal;/m);
  assert.doesNotMatch(atlasCss.match(/^\.app-chip\{[^}]*\}/m)[0], /nowrap/);
  // Cena cesty a rozpočet po položkách: popisek se zalomí i uprostřed slova, částky ne
  assert.match(tripCss, /^table\.cost td:nth-child\(2\)\{overflow-wrap:anywhere\}/m);
  assert.match(tripCss, /^table\.cost td:last-child\{[^}]*white-space:nowrap\}/m);
  // Lety: „🚌 veřejnou dopravou | 🚗 autem“ a režimy radaru (Kdykoliv / …) nevytečou z karty
  assert.match(flightsCss, /^\.gm-row \.seg\{max-width:100%\}/m);
  assert.doesNotMatch(flightsCss.match(/^\.gm-row \.seg button\{[^}]*\}/m)[0], /nowrap/);
  assert.match(flightsCss, /^\.seg\.radar-modes\{display:flex;flex-wrap:wrap;/m);
});

test('plocha pro prst aspoň 24 px: odkazy pod nabídkou letu, ✕ v plánu dne, ‹ Moje cesty', () => {
  // Info o zemi · 📌 Odložit · 📤 Sdílet (a Ověřit: tam · zpět): dřív 15 px vysoké, dva řádky těsně nad sebou
  const m = flightsCss.match(/^\.tr-more :is\(\.linkbtn,a\)\{display:inline-block;padding:(\d+)px 0;line-height:(\d+)px\}/m);
  assert.ok(m, 'pravidlo pro odkazy pod nabídkou');
  assert.ok(2 * +m[1] + +m[2] >= 24, `výška ${2 * +m[1] + +m[2]} px`);
  // ✕ Vyřadit z plánu (13 × 18 px): neviditelná plocha přes ::after, vzhled beze změny
  assert.match(tripCss, /^\.dp-item button\{[^}]*position:relative\}/m);
  const x = tripCss.match(/^\.dp-item button::after\{content:"";position:absolute;inset:-(\d+)px -(\d+)px -(\d+)px\}/m);
  assert.ok(x, 'plocha ✕ v plánu');
  assert.ok(13 + 2 * +x[2] >= 24 && 18 + +x[1] + +x[3] >= 44, `${13 + 2 * +x[2]} × ${18 + +x[1] + +x[3]} px`);
  // ‹ Moje cesty (13,5 px písmo, ~17 px vysoké)
  assert.match(tripCss, /^\.mt-back \.linkbtn\{[^}]*position:relative\}/m);
  const b = tripCss.match(/^\.mt-back \.linkbtn::after\{content:"";position:absolute;inset:-(\d+)px -(\d+)px\}/m);
  assert.ok(b && 17 + 2 * +b[1] >= 24, 'plocha ‹ Moje cesty');
});
