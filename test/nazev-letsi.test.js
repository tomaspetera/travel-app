// Přejmenování ATLAS → Letsi (identita Letsi 2.1): ve viditelných textech aplikace (public/js, public/index.html) už
// název ATLAS není. Komentáře a technické názvy (klíče atlas_* v localStorage, ATLAS_MOCK, mezipaměť atlas-…) zůstávají –
// jejich změna by lidem smazala uložená data nebo rozbila nasazení. statistiky.js a kukatko.js přejmenovávají jiné části.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
const SKIP = new Set(['statistiky.js', 'kukatko.js']);

/** Zdroj bez komentářů a technických názvů. Komentář se bere jen po mezeře, začátku řádku nebo závorce – „https://“
    a „image/*“ v řetězcích tak zůstanou textem. */
const visible = (src) => src
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/(^|[\s;{}(),])\/\*[\s\S]*?\*\//gm, '$1')
  .replace(/(^|[\s;{}(),])\/\/.*$/gm, '$1')
  .replace(/ATLAS_MOCK/g, '')
  // jediná výjimka: novinka o přejmenování musí starý název říct, jinak by lidé nevěděli, že jde o tutéž aplikaci
  .replace("['✨', 'ATLAS je teď Letsi',", '');

test('viditelné texty: místo ATLAS jen Letsi (bez komentářů a technických názvů)', () => {
  const files = readdirSync(new URL('../public/js/', import.meta.url)).filter((f) => f.endsWith('.js') && !SKIP.has(f)).map((f) => `js/${f}`);
  assert.ok(files.length > 30, `${files.length} souborů`);
  for (const f of [...files, 'index.html']) {
    const left = visible(read(f)).split('\n').filter((l) => /ATLAS|\bAtlas\b/.test(l)).map((l) => l.trim().slice(0, 120));
    assert.deepEqual(left, [], f);
  }
  // komentáře zůstaly (nejsou vidět) a technické názvy taky
  assert.match(read('js/app.js'), /^\/\* ATLAS – jádro aplikace/);
  assert.match(read('index.html'), /ATLAS_MOCK=1/);
  assert.match(read('js/backup.js'), /raw\.app !== 'atlas'/, 'značka zálohy beze změny – staré zálohy jdou obnovit');
  // a Letsi je tam, kde dřív byl ATLAS
  assert.match(read('index.html'), /<div class="brand-name">Letsi<\/div>/);
  assert.match(read('js/plus.js'), /const NAME = 'Letsi Plus';/);
});
