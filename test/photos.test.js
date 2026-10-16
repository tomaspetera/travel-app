import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePageImages, cityPhotos } from '../server/lib/photos.js';

test('parsePageImages: normalizace a přesměrování k názvu z dotazu, SVG (znak, mapa) se nebere', () => {
  const j = {
    query: {
      normalized: [{ from: 'řím', to: 'Řím' }],
      redirects: [{ from: 'Krakov', to: 'Krakov (město)' }],
      pages: [
        { title: 'Řím', thumbnail: { source: 'https://upload.wikimedia.org/a/500px-Rome.jpg' } },
        { title: 'Krakov (město)', thumbnail: { source: 'https://upload.wikimedia.org/b/500px-Krakow.jpg' } },
        { title: 'Tirana', thumbnail: { source: 'https://upload.wikimedia.org/c/320px-Coat_of_arms.svg.png' } },
        { title: 'Nikde', missing: true },
      ],
    },
  };
  assert.deepEqual(parsePageImages(j, ['řím', 'Krakov', 'Tirana', 'Nikde']), {
    'řím': 'https://upload.wikimedia.org/a/500px-Rome.jpg',
    Krakov: 'https://upload.wikimedia.org/b/500px-Krakow.jpg',
  });
  assert.deepEqual(parsePageImages(null, ['Řím']), {});
});

test('cityPhotos: chybějící v češtině doplní angličtina, „fotka není“ jako prázdná adresa, výpadek se neuloží', async () => {
  const asked = [];
  const fetchLang = async (lang, titles) => {
    asked.push([lang, titles]);
    return lang === 'cs' ? { 'Testov A': 'https://x/a.jpg' } : { 'Testov B': 'https://x/b.jpg' };
  };
  const out = await cityPhotos(['Testov A', 'Testov B', 'Testov C', 'Testov A', 'X|Y', ''], { fetchLang });
  assert.deepEqual(out, { 'Testov A': 'https://x/a.jpg', 'Testov B': 'https://x/b.jpg', 'Testov C': '' });
  assert.deepEqual(asked, [['cs', ['Testov A', 'Testov B', 'Testov C']], ['en', ['Testov B', 'Testov C']]]);
  // podruhé z paměti, bez dotazu
  const again = await cityPhotos(['Testov A', 'Testov C'], { fetchLang: async () => { throw new Error('nemá se ptát'); } });
  assert.deepEqual(again, { 'Testov A': 'https://x/a.jpg', 'Testov C': '' });
  // výpadek Wikipedie: nic se neuloží, příště znovu; výpadek jen anglické: česká fotka platí
  const down = await cityPhotos(['Testov D'], { fetchLang: async () => { throw new Error('503'); } });
  assert.deepEqual(down, {});
  const half = await cityPhotos(['Testov E', 'Testov F'], { fetchLang: async (lang) => { if (lang === 'en') throw new Error('429'); return { 'Testov E': 'https://x/e.jpg' }; } });
  assert.deepEqual(half, { 'Testov E': 'https://x/e.jpg' });
  const up = await cityPhotos(['Testov D'], { fetchLang: async (lang) => (lang === 'cs' ? { 'Testov D': 'https://x/d.jpg' } : {}) });
  assert.deepEqual(up, { 'Testov D': 'https://x/d.jpg' });
});

test('cityPhotos: cíl pojmenovaný po letišti dostane fotku města před pomlčkou', async () => {
  const fetchLang = async (lang, titles) => (lang === 'cs' && titles.includes('Pécsov') ? { 'Pécsov': 'https://x/p.jpg' } : {});
  assert.deepEqual(await cityPhotos(['Pécsov-Pogány', 'Bez – fotky'], { fetchLang }), { 'Pécsov-Pogány': 'https://x/p.jpg', 'Bez – fotky': '' });
});
