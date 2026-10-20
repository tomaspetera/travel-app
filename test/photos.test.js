// Fotky měst na karty radaru (server/lib/photos.js): výběr oceněné fotky celého města z Wikimedie – bez sítě,
// odpovědi API jsou vzorky ve tvaru formatversion=2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePageImages, photoScore, namesCity, pexelsPick, unsplashPick, unsplashClient, UNSPLASH_UTM, pickPhotos, cityPhotos } from '../server/lib/photos.js';

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
        { title: 'Rome', pageimage: 'Rome_Montage_2017.jpg', images: [{ title: 'File:Rome Montage 2017.jpg' }, { title: 'File:Map of Rome.svg' }, { title: 'File:Pincio panorama.jpg' }, { title: 'File:Colosseum at night.jpg' }, { title: 'File:Statue.jpg' }] },
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
  assert.deepEqual(down, { photos: { 'Řím': '', Oradea: 'https://u/thumb/500px-Oradea_lead.jpg' }, by: {}, bu: {}, partial: true, retry: [] });
});

test('cityPhotos: z paměti bez dotazu, „fotka není“ jako prázdná adresa, výpadek se neuloží', async () => {
  const ok = (photos, by = {}) => async () => ({ photos, by, partial: false });
  const opt = (pick) => ({ pick, prov: 'wiki' });
  assert.deepEqual(await cityPhotos(['Testov A', 'Testov B', 'Testov A', 'X|Y', ''], opt(ok({ 'Testov A': 'https://x/a.jpg' }))),
    { photos: { 'Testov A': 'https://x/a.jpg', 'Testov B': '' }, by: {}, bu: {}, partial: false, prov: 'wiki' });
  assert.deepEqual((await cityPhotos(['Testov A', 'Testov B'], opt(async () => { throw new Error('nemá se ptát'); }))).photos, { 'Testov A': 'https://x/a.jpg', 'Testov B': '' });
  assert.deepEqual((await cityPhotos(['Testov C'], opt(async () => { throw new Error('429'); }))).photos, {});
  const half = await cityPhotos(['Testov C'], opt(async () => ({ photos: { 'Testov C': 'https://x/c.jpg' }, partial: true })));
  assert.deepEqual([half.photos, half.partial], [{ 'Testov C': 'https://x/c.jpg' }, true]);
  // s Pexels: autor fotky jde s ní (i z paměti); paměť je zvlášť pro Pexels a Wikimedii
  const px = { pick: ok({ 'Testov D': 'https://images.pexels.com/d.jpeg' }, { 'Testov D': 'Jana Nováková' }), prov: 'pexels' };
  assert.deepEqual(await cityPhotos(['Testov D'], px), { photos: { 'Testov D': 'https://images.pexels.com/d.jpeg' }, by: { 'Testov D': 'Jana Nováková' }, bu: {}, partial: false, prov: 'pexels' });
  assert.deepEqual((await cityPhotos(['Testov D'], { pick: async () => { throw new Error('z paměti'); }, prov: 'pexels' })).by, { 'Testov D': 'Jana Nováková' });
  assert.deepEqual((await cityPhotos(['Testov D'], opt(ok({ 'Testov D': 'https://x/wiki-d.jpg' })))).photos, { 'Testov D': 'https://x/wiki-d.jpg' });
});

test('pickPhotos: hlavní fotka anglického článku (Eiffelovka) před oceněnou fotkou se jménem města z okolí (HEC Paris)', async () => {
  const api = async (host, p) => {
    if (host === 'cs.wikipedia.org') return { query: { pages: [{ title: 'Paříž', thumbnail: { source: 'https://u/thumb/500px-Paris_montage.jpg' }, langlinks: [{ lang: 'en', title: 'Paris' }] }] } };
    if (host === 'en.wikipedia.org') {
      return { query: { pages: [{ title: 'Paris', pageimage: 'La_Tour_Eiffel_vue_de_la_Tour_Saint-Jacques.jpg', images: [
        { title: 'File:Chateau, HEC Paris, Jouy-en-Josas, Southwest view.jpg' }, { title: 'File:Paris Seine at dusk.jpg' }, { title: 'File:La Tour Eiffel vue de la Tour Saint-Jacques.jpg' },
      ] }] } };
    }
    const info = { 'File:La Tour Eiffel vue de la Tour Saint-Jacques.jpg': [], 'File:Paris Seine at dusk.jpg': [QI] };
    return { query: { pages: p.titles.split('|').map((t) => (info[t]
      ? { title: t, categories: info[t].map((c) => ({ title: c })), imageinfo: [{ width: 4000, height: 2600, thumburl: `https://u/${t.slice(5)}` }] }
      : { title: t, missing: true })) } };
  };
  const calls = [];
  const out = await pickPhotos(['Paříž'], async (h, p) => { calls.push(p.titles); return api(h, p); });
  assert.equal(out.photos['Paříž'], 'https://u/La Tour Eiffel vue de la Tour Saint-Jacques.jpg');
  assert.ok(!calls[2].includes('HEC')); // škola za městem se ani neptá
});

test('pexelsPick: jen fotka, v jejímž popisu nebo adrese je jméno města; náhled na výšku 960 × 1200', () => {
  const ph = (alt, url, o = 'https://images.pexels.com/photos/1/x.jpeg') => ({ alt, url, photographer: 'Autor', src: { original: o } });
  assert.deepEqual(pexelsPick([ph('Aerial view of a city', 'https://www.pexels.com/photo/city-1/'), ph('Colosseum in Rome at sunset', 'https://www.pexels.com/photo/2/', 'https://images.pexels.com/photos/2/r.jpeg')], ['Rome', 'Řím']),
    { u: 'https://images.pexels.com/photos/2/r.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=960&h=1200', by: 'Autor', bu: '' });
  assert.equal(pexelsPick([ph('', 'https://www.pexels.com/photo/old-town-of-krakow-poland-3/')], ['Kraków'])?.by, 'Autor'); // jméno jen v adrese
  assert.equal(pexelsPick([ph('Beautiful landscape of Romania', 'https://www.pexels.com/photo/4/')], ['Oradea']), null);
  assert.equal(pexelsPick(null, ['Rome']), null);
});

test('pickPhotos s Pexels: fotka města z Pexels, co Pexels nemá, dohledá Wikimedia', async () => {
  const api = async (host, p) => {
    if (host === 'cs.wikipedia.org') return { query: { pages: [
      { title: 'Řím', thumbnail: { source: 'https://u/thumb/960px-Rome_lead.jpg' }, langlinks: [{ lang: 'en', title: 'Rome' }] },
      { title: 'Oradea', thumbnail: { source: 'https://u/thumb/960px-Oradea_lead.jpg' }, langlinks: [{ lang: 'en', title: 'Oradea' }] },
    ] } };
    if (host === 'en.wikipedia.org') return { query: { pages: [{ title: 'Oradea', images: [] }, { title: 'Rome', images: [] }] } };
    return { query: { pages: [] } };
  };
  const asked = [];
  const pexels = async (q) => { asked.push(q); return q.startsWith('Rome') ? [{ alt: 'Trevi Fountain, Rome', url: 'https://www.pexels.com/photo/9/', photographer: 'Luca', src: { original: 'https://images.pexels.com/photos/9/t.jpeg' } }] : [{ alt: 'Romania mountains', url: 'https://www.pexels.com/photo/8/', photographer: 'X', src: { original: 'https://images.pexels.com/photos/8/m.jpeg' } }]; };
  const out = await pickPhotos(['Řím', 'Oradea'], api, pexels);
  assert.deepEqual(asked.sort(), ['Oradea city', 'Rome city']);
  assert.deepEqual(out.photos, { 'Řím': 'https://images.pexels.com/photos/9/t.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=960&h=1200', Oradea: 'https://u/thumb/960px-Oradea_lead.jpg' });
  assert.deepEqual(out.by, { 'Řím': 'Luca' });
});

// ---------- Unsplash (UNSPLASH_ACCESS_KEY) ----------
const usp = (o = {}) => ({ width: 4000, height: 6000, urls: { raw: 'https://images.unsplash.com/photo-1?ixid=abc' }, user: { name: 'Ana Silva', links: { html: 'https://unsplash.com/@anasilva' } }, links: { html: 'https://unsplash.com/photos/x' }, ...o });

test('unsplashPick: jen fotka se jménem města (popis, adresa, štítky, místo), dost velká; výřez 960 × 1200, autor s utm', () => {
  const lis = ['Lisbon', 'Lisabon'];
  assert.deepEqual(unsplashPick([usp({ alt_description: 'a city street with tall buildings' }), usp({ description: 'Tram 28 in Lisbon', urls: { raw: 'https://images.unsplash.com/photo-2?ixid=q' } })], lis), {
    u: 'https://images.unsplash.com/photo-2?ixid=q&w=960&h=1200&fit=crop&crop=entropy&q=75&auto=format',
    by: 'Ana Silva', bu: `https://unsplash.com/@anasilva?${UNSPLASH_UTM}`,
  });
  assert.equal(unsplashPick([usp({ slug: 'yellow-tram-lisbon-portugal-AbC' })], lis)?.by, 'Ana Silva'); // jméno jen v adrese
  assert.equal(unsplashPick([usp({ tags: [{ title: 'portugal' }, { title: 'lisboa' }] })], ['Lisboa']) !== null, true); // štítek
  assert.equal(unsplashPick([usp({ location: { city: 'Lisbon' } })], lis) !== null, true); // místo
  assert.equal(unsplashPick([usp({ description: 'Lisbon', width: 640 })], lis), null); // malá fotka
  assert.equal(unsplashPick([usp({ description: 'Lisbon', urls: { raw: 'https://evil.example/x.jpg' } })], lis), null); // jen z Unsplash
  assert.equal(unsplashPick([usp({ description: 'Beautiful Portugal coast' })], lis), null);
  assert.equal(unsplashPick(null, lis), null);
  // profil autora jen na unsplash.com, jinak bez odkazu
  assert.equal(unsplashPick([usp({ description: 'Lisbon', user: { name: 'X', links: { html: 'javascript:alert(1)' } } })], lis).bu, '');
});

test('unsplashPick: přednost fotce města (panorama, památka) před lidmi; jen lidé → nic (fotka z Wikimedie)', () => {
  const rio = ['Rio de Janeiro', 'Rio de Janeiro'];
  const people = usp({ description: 'silhouette of people at sunset in Rio de Janeiro', urls: { raw: 'https://images.unsplash.com/photo-p?ixid=1' } });
  const city = usp({ alt_description: 'aerial view of Rio de Janeiro city with Sugarloaf mountain', urls: { raw: 'https://images.unsplash.com/photo-c?ixid=2' } });
  const tram = usp({ description: 'Tram in Rio de Janeiro', urls: { raw: 'https://images.unsplash.com/photo-t?ixid=3' } });
  assert.match(unsplashPick([people, tram, city], rio).u, /photo-c/);
  assert.match(unsplashPick([people, tram], rio).u, /photo-t/, 'bez lidí, i bez slova o městě');
  assert.equal(unsplashPick([people], rio), null);
});

test('unsplashClient: dotaz s klíčem a verzí; po vyčerpání limitu (403) čtvrt hodiny bez dotazů, po neplatném klíči (401) 6 h', async () => {
  let t = 1e12;
  const calls = [];
  let status = 0;
  const req = async (url, o) => {
    calls.push([url, o.headers]);
    if (status) throw Object.assign(new Error(`HTTP ${status}`), { status });
    return { results: [usp({ description: 'Rome' })] };
  };
  const api = unsplashClient('KEY', { req, now: () => t });
  assert.equal((await api('Rome city')).length, 1);
  const u = new URL(calls[0][0]);
  assert.equal(u.origin + u.pathname, 'https://api.unsplash.com/search/photos');
  assert.deepEqual([u.searchParams.get('query'), u.searchParams.get('orientation'), u.searchParams.get('content_filter')], ['Rome city', 'portrait', 'high']);
  assert.deepEqual(calls[0][1], { Authorization: 'Client-ID KEY', 'Accept-Version': 'v1' });
  status = 403; // Rate Limit Exceeded
  await assert.rejects(api('Paris city'), (e) => e.soon === true);
  await assert.rejects(api('Oslo city'), (e) => e.soon === true && /vynechán/.test(e.message));
  assert.equal(calls.length, 2, 'během pauzy se Unsplash neptá');
  t += 16 * 6e4; status = 0;
  assert.equal((await api('Oslo city')).length, 1, 'po čtvrthodině znovu');
  status = 401;
  await assert.rejects(api('Bern city'), (e) => e.soon === false);
  t += 5 * 36e5;
  await assert.rejects(api('Bern city'), (e) => e.soon === false);
  assert.equal(calls.length, 4, 'neplatný klíč: 6 h bez dotazů');
});

test('pickPhotos s Unsplash: co Pexels nemá, zkusí Unsplash, zbytek Wikimedia; limit Unsplash → partial (Wikimedia jen na chvíli)', async () => {
  const api = async (host) => {
    if (host === 'cs.wikipedia.org') return { query: { pages: [
      { title: 'Řím', thumbnail: { source: 'https://u/thumb/960px-Rome_lead.jpg' }, langlinks: [{ lang: 'en', title: 'Rome' }] },
      { title: 'Oradea', thumbnail: { source: 'https://u/thumb/960px-Oradea_lead.jpg' }, langlinks: [{ lang: 'en', title: 'Oradea' }] },
      { title: 'Lisabon', thumbnail: { source: 'https://u/thumb/960px-Lisbon_lead.jpg' }, langlinks: [{ lang: 'en', title: 'Lisbon' }] },
    ] } };
    if (host === 'en.wikipedia.org') return { query: { pages: [{ title: 'Oradea', images: [] }, { title: 'Rome', images: [] }, { title: 'Lisbon', images: [] }] } };
    return { query: { pages: [] } };
  };
  const pAsked = [], uAsked = [];
  const pexels = async (q) => { pAsked.push(q); return q.startsWith('Rome') ? [{ alt: 'Rome', url: 'https://www.pexels.com/photo/9/', photographer: 'Luca', photographer_url: 'https://www.pexels.com/@luca', src: { original: 'https://images.pexels.com/photos/9/t.jpeg' } }] : []; };
  const unsplash = async (q) => { uAsked.push(q); return q.startsWith('Lisbon') ? [usp({ description: 'Lisbon at dusk' })] : []; };
  const out = await pickPhotos(['Řím', 'Oradea', 'Lisabon'], api, pexels, unsplash);
  assert.deepEqual(pAsked.sort(), ['Lisbon city', 'Oradea city', 'Rome city']);
  assert.deepEqual(uAsked.sort(), ['Lisbon city', 'Oradea city'], 'Unsplash jen na to, co Pexels nemá');
  assert.match(out.photos['Řím'], /^https:\/\/images\.pexels\.com\//);
  assert.match(out.photos.Lisabon, /^https:\/\/images\.unsplash\.com\/photo-1\?ixid=abc&w=960&h=1200/);
  assert.equal(out.photos.Oradea, 'https://u/thumb/960px-Oradea_lead.jpg');
  assert.deepEqual(out.by, { 'Řím': 'Luca', Lisabon: 'Ana Silva' });
  assert.deepEqual(out.bu, { 'Řím': 'https://www.pexels.com/@luca', Lisabon: `https://unsplash.com/@anasilva?${UNSPLASH_UTM}` });
  assert.equal(out.partial, false);
  // limit dotazů Unsplash: fotky z Wikimedie jen na chvíli; neplatný klíč ne (jinak by se Wikimedia ptala pořád)
  const limited = await pickPhotos(['Lisabon'], api, null, async () => { throw Object.assign(new Error('HTTP 403'), { status: 403, soon: true }); });
  assert.deepEqual([limited.photos.Lisabon, limited.partial, limited.retry], ['https://u/thumb/960px-Lisbon_lead.jpg', false, ['Lisabon']]);
  const badKey = await pickPhotos(['Lisabon'], api, null, async () => { throw Object.assign(new Error('HTTP 401'), { status: 401, soon: false }); });
  assert.deepEqual([badKey.partial, badKey.retry], [false, []]);
});

test('cityPhotos s Unsplash: autor a odkaz na profil jdou s fotkou (i z paměti), paměť zvlášť pro Unsplash', async () => {
  const pick = async () => ({ photos: { 'Testov U': 'https://images.unsplash.com/u.jpg' }, by: { 'Testov U': 'Ana' }, bu: { 'Testov U': 'https://unsplash.com/@ana?x=1' }, partial: false });
  assert.deepEqual(await cityPhotos(['Testov U'], { pick, prov: 'unsplash' }),
    { photos: { 'Testov U': 'https://images.unsplash.com/u.jpg' }, by: { 'Testov U': 'Ana' }, bu: { 'Testov U': 'https://unsplash.com/@ana?x=1' }, partial: false, prov: 'unsplash' });
  const again = await cityPhotos(['Testov U'], { pick: async () => { throw new Error('z paměti'); }, prov: 'unsplash' });
  assert.deepEqual([again.by, again.bu], [{ 'Testov U': 'Ana' }, { 'Testov U': 'https://unsplash.com/@ana?x=1' }]);
  assert.deepEqual((await cityPhotos(['Testov U'], { pick: async () => ({ photos: { 'Testov U': 'https://x/w.jpg' }, partial: false }), prov: 'wiki' })).photos, { 'Testov U': 'https://x/w.jpg' });
  // limit dotazů Unsplash: fotka z Wikimedie jen na hodinu (pak z Unsplash), nalezená z Unsplash na týden; odpověď partial
  const r = await cityPhotos(['Testov V', 'Testov W'], { pick: async () => ({ photos: { 'Testov V': 'https://images.unsplash.com/v.jpg', 'Testov W': 'https://x/w-wiki.jpg' }, by: { 'Testov V': 'Ana' }, partial: false, retry: ['Testov W'] }), prov: 'unsplash' });
  assert.equal(r.partial, true);
  const { cache } = await import('../server/lib/cache.js');
  const ttl = (k) => cache.map.get(k).exp - Date.now();
  const [tv, tw] = [ttl('ph6:unsplash:Testov V'), ttl('ph6:unsplash:Testov W')];
  assert.ok(tv > 6 * 864e5 && tw <= 36e5, `${tv} ${tw}`);
});
