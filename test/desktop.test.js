// Desktopové rozvržení (public/css/desktop.css): jen pro široké obrazovky – telefon a tablet beze změny – a načtené
// jako poslední styl, ať přebije základní pravidla.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../public/css/desktop.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

/** Pravidla mimo @media bloky (komentáře pryč) – nejvyšší úroveň má být prázdná. */
function topLevel(src) {
  const s = src.replace(/\/\*[\s\S]*?\*\//g, '');
  let depth = 0, out = '';
  const media = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '{') {
      if (depth === 0) { const head = out.slice(out.lastIndexOf('}') + 1).trim(); media.push(head); out += '{'; }
      depth++;
    } else if (c === '}') { depth--; if (depth === 0) out += '}'; } else if (depth === 0) out += c;
  }
  return { rest: out.replace(/[^{}]*\{\}/g, (m) => m.trim()).replace(/[{}]/g, '').trim(), media };
}

test('desktop.css: všechna pravidla jen v @media od 1024 px (telefon a tablet beze změny)', () => {
  const { media } = topLevel(css);
  assert.ok(media.length >= 3, media.join(' | '));
  for (const m of media) assert.match(m, /^@media \(min-width:(1024|1600)px\)/, m);
});

test('desktop.css se načítá po všech základních stylech, desktopové doplňky (desktop-*.css) až po něm', () => {
  const links = [...html.matchAll(/<link rel="stylesheet" href="(css\/[^"]+)">/g)].map((m) => m[1]);
  const at = links.indexOf('css/desktop.css');
  assert.ok(at > 0, links.join(', '));
  assert.ok(links.slice(0, at).every((l) => !/desktop/.test(l)), links.join(', '));
  assert.ok(links.slice(at + 1).every((l) => /^css\/desktop-[a-z]+\.css$/.test(l)), links.join(', '));
  assert.ok(links.includes('css/atlas.css') && links.includes('css/trip.css'));
});

// Objevuj, Plánovač, Doporučení, Mapa a okna na desktopu (public/css/desktop-explore.css)
const explore = readFileSync(new URL('../public/css/desktop-explore.css', import.meta.url), 'utf8');

test('desktop-explore.css: všechna pravidla jen v @media od 1024 px (telefon a tablet beze změny), načtené po desktop.css', () => {
  const { media } = topLevel(explore);
  assert.ok(media.length >= 4, media.join(' | '));
  for (const m of media) {
    const min = Number((/^@media \(min-width:(\d+)px\)/.exec(m) || [])[1]);
    assert.ok(min >= 1024, m);
  }
  const links = [...html.matchAll(/<link rel="stylesheet" href="(css\/[^"]+)">/g)].map((m) => m[1]);
  assert.ok(links.indexOf('css/desktop-explore.css') > links.indexOf('css/desktop.css'), links.join(', '));
});

test('desktop-explore.css: Objevuj – mapa vedle seznamu přes výšku okna, přehled země jako mřížka karet, okno země ve dvou sloupcích', () => {
  assert.match(explore, /\.ex-main>\.ex-map\{position:sticky;top:var\(--sticky-top\);height:calc\(100vh - var\(--sticky-top\) - 24px\)/);
  assert.match(explore, /\.ex-layout\.ex-main:has\(#exCList\)\{grid-template-columns:minmax\(0,1fr\);grid-template-areas:"map" "places"/);
  assert.match(explore, /#exCList\{display:grid;grid-template-columns:repeat\(auto-fill,minmax\(340px,1fr\)\)/);
  assert.match(explore, /\.modal:has\(>\.modal-hero\.mh-photo\)\{display:grid;grid-template-columns:40% 60%/);
  // zavírací tlačítko vpravo nahoře okna: hlavička 40 % → -150 % její šířky = zbývajících 60 %
  assert.match(explore, /\.modal>\.modal-hero\.mh-photo>\.modal-close\{right:calc\(-150% \+ 18px\)/);
});

test('desktop.css: obsah i horní lišta ve stejném kontejneru uprostřed (stejný výpočet okrajů)', () => {
  const pad = 'max(var(--gutter),calc((100% - var(--content-max)) / 2))';
  assert.ok(css.includes(`.topbar{padding:20px ${pad} 18px}`));
  assert.ok(css.includes(`.content{max-width:none;padding:4px ${pad} 72px}`));
  assert.match(css, /--content-max:1240px/);
  assert.match(css, /@media \(min-width:1600px\)\{:root\{--content-max:1360px\}\}/);
});
