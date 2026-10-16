// Fotky měst na karty radaru (server/lib/photos.js): výběr oceněné fotky celého města z Wikimedie – bez sítě,
// odpovědi API jsou vzorky ve tvaru formatversion=2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePageImages, photoScore, namesCity, pickPhotos, cityPhotos } from '../server/lib/photos.js';

const FP = 'Category:Featured pictures on Wikimedia Commons';
const QI = 'Category:Quality images';

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

test('photoScore: oceněný celkový pohled na šířku vede, mapy/koláže/sochy ne, dlouhé panorama a výška dolů', () => {
  const s = (title, cats = [], width = 4000, height = 2600) => photoScore({ title, cats, width, height });
  assert.ok(s('File:Panorama of Old Town.jpg', [QI]) > s('File:Some street.jpg', [QI]));
  assert.ok(s('File:Some street.jpg', [FP]) > s('File:Some street.jpg', [QI]));
  assert.ok(s('File:Some street.jpg', [QI]) > s('File:View from hill.jpg'));
  assert.ok(s('File:View from hill.jpg', [QI], 9000, 2000) < s('File:View from hill.jpg', [QI]));
  assert.ok(s('File:Church tower.jpg', [QI], 2000, 3500) < s('File:Church tower.jpg', [QI]));
  for (const bad of ['File:Rome Montage 2017.jpg', 'File:Map of Rome.jpg', 'File:Coat of arms of Rome.jpg', 'File:Statue of Marcus.jpg', 'File:Flag.jpg', 'File:Skyline.png', 'File:Museum interior.jpg']) {
    assert.equal(s(bad, [FP]), -Infinity, bad);
  }
  // „photograph“ ani „Columbus“ nejsou graf a autobus
  assert.ok(s('File:Aerial photograph of Columbus.jpg', [QI]) > 0);
});

test('namesCity a photoScore: fotka města (jméno v názvu, i bez diakritiky) před oceněnou fotkou z okolí', () => {
  assert.ok(namesCity('File:Rynek Glowny Krakow at night.jpg', ['Kraków', 'Krakov']));
  assert.ok(namesCity('File:Łódź Piotrkowska.jpg', ['Łódź', 'Lodž']));
  assert.ok(!namesCity('File:Castillo de Petrela, Albania.jpg', ['Tirana']));
  assert.ok(!namesCity('File:Rome.jpg', ['Ro'])); // krátké jméno se nepočítá
  const near = photoScore({ title: 'File:Castillo de Petrela, Albania.jpg', cats: [FP], width: 4000, height: 2600 }, ['Tirana']);
  const city = photoScore({ title: 'File:Tirana Skanderbeg Square.jpg', cats: [QI], width: 4000, height: 2600 }, ['Tirana']);
  assert.ok(city > near);
});

test('pickPhotos: z článku vybere oceněnou fotku města, cíl po letišti dostane město, bez ocenění úvodní obrázek', async () => {
  const calls = [];
  const api = async (host, p) => {
    calls.push([host, p.titles]);
    if (host === 'cs.wikipedia.org') {
      return { query: {
        pages: [
          { title: 'Řím', thumbnail: { source: 'https://u/thumb/500px-Rome_Montage_2017.jpg?utm=x' }, langlinks: [{ lang: 'en', title: 'Rome' }] },
          { title: 'Pécs', thumbnail: { source: 'https://u/thumb/500px-Pecs_lead.jpg' }, langlinks: [{ lang: 'en', title: 'Pécs' }] },
          { title: 'Pécs-Pogány', missing: true },
          { title: 'Oradea', thumbnail: { source: 'https://u/thumb/500px-Oradea_lead.jpg' }, langlinks: [{ lang: 'en', title: 'Oradea' }] },
        ],
      } };
    }
    if (host === 'en.wikipedia.org') {
      return { query: { pages: [
        { title: 'Rome', images: [{ title: 'File:Rome Montage 2017.jpg' }, { title: 'File:Map of Rome.svg' }, { title: 'File:Pincio panorama.jpg' }, { title: 'File:Colosseum at night.jpg' }, { title: 'File:Statue.jpg' }] },
        { title: 'Pécs', images: [{ title: 'File:Pecs cathedral view.jpg' }] },
        { title: 'Oradea', images: [{ title: 'File:Oradea street.jpg' }] },
      ] } };
    }
    // Commons: ocenění a rozměry
    const info = {
      'File:Pincio panorama.jpg': { cats: [QI], w: 10931, h: 4975 },
      'File:Colosseum at night.jpg': { cats: [FP], w: 5000, h: 3300 },
      'File:Pecs cathedral view.jpg': { cats: [QI], w: 4000, h: 2700 },
      'File:Oradea street.jpg': { cats: [], w: 3000, h: 2000 },
    };
    return { query: { pages: p.titles.split('|').map((t) => (info[t]
      ? { title: t, categories: info[t].cats.map((c) => ({ title: c })), imageinfo: [{ width: info[t].w, height: info[t].h, thumburl: `https://u/thumb/500px-${t.slice(5)}` }] }
      : { title: t, missing: true })) } };
  };
  const { photos: out, partial } = await pickPhotos(['Řím', 'Pécs-Pogány', 'Oradea'], api);
  assert.equal(partial, false);
  assert.deepEqual(out, {
    'Řím': 'https://u/thumb/500px-Colosseum at night.jpg', // FP s nočním pohledem; koláž z úvodu ne
    'Pécs-Pogány': 'https://u/thumb/500px-Pecs cathedral view.jpg',
    Oradea: 'https://u/thumb/500px-Oradea_lead.jpg', // nic oceněného – úvodní obrázek článku
  });
  // tři dotazy: cs (s městem před pomlčkou), en, Commons jen na kandidáty bez map a soch
  assert.deepEqual(calls.map((c) => c[0]), ['cs.wikipedia.org', 'en.wikipedia.org', 'commons.wikimedia.org']);
  assert.equal(calls[0][1], 'Řím|Pécs-Pogány|Oradea|Pécs');
  assert.ok(!calls[2][1].includes('Map of Rome') && !calls[2][1].includes('Statue') && !calls[2][1].includes('Montage'));
  // Commons neodpovídá (429): zatím úvodní obrázky bez koláže, partial
  const down = await pickPhotos(['Řím', 'Oradea'], async (host, p) => { if (host === 'commons.wikimedia.org') throw new Error('429'); return api(host, p); });
  assert.deepEqual(down, { photos: { 'Řím': '', Oradea: 'https://u/thumb/500px-Oradea_lead.jpg' }, partial: true });
});

test('cityPhotos: z paměti bez dotazu, „fotka není“ jako prázdná adresa, výpadek se neuloží', async () => {
  const ok = (photos) => async () => ({ photos, partial: false });
  assert.deepEqual(await cityPhotos(['Testov A', 'Testov B', 'Testov A', 'X|Y', ''], { pick: ok({ 'Testov A': 'https://x/a.jpg' }) }),
    { photos: { 'Testov A': 'https://x/a.jpg', 'Testov B': '' }, partial: false });
  assert.deepEqual(await cityPhotos(['Testov A', 'Testov B'], { pick: async () => { throw new Error('nemá se ptát'); } }),
    { photos: { 'Testov A': 'https://x/a.jpg', 'Testov B': '' }, partial: false });
  assert.deepEqual(await cityPhotos(['Testov C'], { pick: async () => { throw new Error('429'); } }), { photos: {}, partial: false });
  assert.deepEqual(await cityPhotos(['Testov C'], { pick: async () => ({ photos: { 'Testov C': 'https://x/c.jpg' }, partial: true }) }),
    { photos: { 'Testov C': 'https://x/c.jpg' }, partial: true });
});
