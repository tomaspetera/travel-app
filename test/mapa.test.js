// Mapa kódu (docs/mapa.md) nesmí zastarat: každý soubor kódu, stylů, skriptů a dat a každá routa serveru v ní musí
// být zmíněná celou cestou – nová relace podle ní hledá místo procházení repozitáře (CLAUDE.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const ls = (dir, re) => readdirSync(new URL(dir, root)).filter((f) => re.test(f)).map((f) => `${dir}${f}`);

test('docs/mapa.md zmiňuje každý soubor a každou routu serveru', () => {
  const map = read('docs/mapa.md');
  const files = [
    ...ls('server/', /\.js$/), ...ls('server/lib/', /\.js$/), ...ls('server/providers/', /\.js$/),
    ...ls('server/providers/stays/', /\.js$/), ...ls('public/js/', /\.js$/), ...ls('public/css/', /\.css$/),
    ...ls('scripts/', /\.mjs$/), ...ls('data/', /\.json$/),
  ];
  const index = read('server/index.js');
  const routes = [...index.matchAll(/p === '(\/[^']+)'|p\.startsWith\('(\/[^']+)'\)/g)].map((m) => m[1] || m[2]);
  assert.ok(files.length > 100 && routes.length > 30, `${files.length} souborů, ${routes.length} rout`);
  const missing = [...new Set([...files, ...routes])].filter((x) => !map.includes(`\`${x}`));
  assert.deepEqual(missing, [], 'doplň do docs/mapa.md (celou cestou v `…`)');
});
