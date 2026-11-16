// Fotky měst na karty radaru (server/lib/photos.js): výběr oceněné fotky celého města z Wikimedie – bez sítě,
// odpovědi API jsou vzorky ve tvaru formatversion=2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePageImages, photoScore, namesCity, pexelsPick, unsplashPick, unsplashClient, UNSPLASH_UTM, pickPhotos, cityPhotos, plainText, commonsCredit } from '../server/lib/photos.js';

const FP = 'Category:Featured pictures on Wikimedia Commons';
const QI = 'Category:Quality images';
// Commons: autor (Artist bývá HTML s odkazem na uživatele) a licence k souboru, jak je vrací imageinfo s extmetadata
const ARTIST = '<a href="//commons.wikimedia.org/wiki/User:Fotograf" title="User:Fotograf">Jan Fotograf</a>';
const pageOf = (t) => `https://commons.wikimedia.org/wiki/${t.replace(/ /g, '_')}`;
const ext = (artist = ARTIST, lic = 'CC BY-SA 4.0') => ({ Artist: { value: artist }, LicenseShortName: { value: lic }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' } });
/** Odpověď Commons na dotaz p.titles podle info { soubor: { cats, w, h, artist, lic } }; co v info není, chybí. */
const commonsReply = (p, info) => ({ query: { pages: p.titles.split('|').map((t) => (info[t]
  ? { title: t, categories: (info[t].cats || []).map((c) => ({ title: c })), imageinfo: [{ width: info[t].w || 4000, height: info[t].h || 2600, thumburl: info[t].url || `https://u/thumb/500px-${t.slice(5)}`, descriptionurl: pageOf(t), extmetadata: ext(info[t].artist, info[t].lic) }] }
  : { title: t, missing: true })) } });
const CREDIT = { by: 'Jan Fotograf', lic: 'CC BY-SA 4.0', lu: 'https://creativecommons.org/licenses/by-sa/4.0' };

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
          { title: 'Řím', pageimage: 'Rome_Montage_2017.jpg', thumbnail: { source: 'https://u/thumb/500px-Rome_Montage_2017.jpg?utm=x' }, langlinks: [{ lang: 'en', title: 'Rome' }] },
          { title: 'Pécs', pageimage: 'Pecs_lead.jpg', thumbnail: { source: 'https://u/thumb/500px-Pecs_lead.jpg' }, langlinks: [{ lang: 'en', title: 'Pécs' }] },
          { title: 'Pécs-Pogány', missing: true },
          { title: 'Oradea', pageimage: 'Oradea_lead.jpg', thumbnail: { source: 'https://u/thumb/500px-Oradea_lead.jpg' }, langlinks: [{ lang: 'en', title: 'Oradea' }] },
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
    // Commons: ocenění, rozměry, autor a licence
    return commonsReply(p, {
      'File:Pincio panorama.jpg': { cats: [QI], w: 10931, h: 4975 },
      'File:Colosseum at night.jpg': { cats: [FP], w: 5000, h: 3300 },
      'File:Pecs cathedral view.jpg': { cats: [QI], w: 4000, h: 2700 },
      'File:Oradea street.jpg': { cats: [], w: 3000, h: 2000 },
      'File:Oradea lead.jpg': { artist: 'Ana &amp; Ion', lic: 'CC BY 3.0' },
    });
  };
  const { photos: out, by, bu, lic, partial } = await pickPhotos(['Řím', 'Pécs-Pogány', 'Oradea'], api);
  assert.equal(partial, false);
  assert.deepEqual(out, {
    'Řím': 'https://u/thumb/500px-Colosseum at night.jpg', // FP s nočním pohledem; koláž z úvodu ne
    'Pécs-Pogány': 'https://u/thumb/500px-Pecs cathedral view.jpg',
    Oradea: 'https://u/thumb/500px-Oradea_lead.jpg', // nic oceněného – úvodní obrázek článku
  });
  // ke každé fotce autor, licence a stránka souboru na Commons (u úvodního obrázku českého článku taky)
  assert.deepEqual(by, { 'Řím': 'Jan Fotograf', 'Pécs-Pogány': 'Jan Fotograf', Oradea: 'Ana & Ion' });
  assert.deepEqual(lic, { 'Řím': 'CC BY-SA 4.0', 'Pécs-Pogány': 'CC BY-SA 4.0', Oradea: 'CC BY 3.0' });
  assert.deepEqual(bu, { 'Řím': pageOf('File:Colosseum at night.jpg'), 'Pécs-Pogány': pageOf('File:Pecs cathedral view.jpg'), Oradea: pageOf('File:Oradea lead.jpg') });
  // tři dotazy: cs (s městem před pomlčkou), en, Commons jen na kandidáty bez map a soch (a úvodní obrázky)
  assert.deepEqual(calls.map((c) => c[0]), ['cs.wikipedia.org', 'en.wikipedia.org', 'commons.wikimedia.org']);
  assert.equal(calls[0][1], 'Řím|Pécs-Pogány|Oradea|Pécs');
  assert.ok(!calls[2][1].includes('Map of Rome') && !calls[2][1].includes('Statue'));
  // Commons neodpovídá (429): autora a licenci nezná – zatím karty bez fotky, partial
  const down = await pickPhotos(['Řím', 'Oradea'], async (host, p) => { if (host === 'commons.wikimedia.org') throw new Error('429'); return api(host, p); });
  assert.deepEqual(down, { photos: { 'Řím': '', Oradea: '' }, by: {}, bu: {}, lic: {}, lu: {}, partial: true, retry: [] });
});

test('plainText: z HTML v Artist zbude jen text (bez značek a skriptu), entity dekódované, dlouhé jméno zkrácené', () => {
  assert.equal(plainText(ARTIST), 'Jan Fotograf');
  assert.equal(plainText('<span class="fn"><a href="x">Jiří&nbsp;Novák</a></span> (<a href="y">talk</a>)\n'), 'Jiří Novák ( talk )');
  assert.equal(plainText('<b onmouseover="alert(1)">Eve</b> &lt;script&gt;x&lt;/script&gt; &#268;ech &#x10C;'), 'Eve script x /script Čech Č');
  assert.equal(plainText('&#0;Ana&#1;'), 'Ana');
  assert.equal(plainText('x'.repeat(200)).length, 80);
  assert.equal(plainText(null), '');
});

test('commonsCredit: autor a licence pro komerční užití, jinak fotka nejde (bez autora, NC, GFDL, mimo Commons)', () => {
  const ii = (o = {}) => ({ descriptionurl: 'https://commons.wikimedia.org/wiki/File:Praha.jpg', extmetadata: ext(), ...o });
  assert.deepEqual(commonsCredit(ii()), { ...CREDIT, pg: 'https://commons.wikimedia.org/wiki/File:Praha.jpg' });
  for (const l of ['CC BY 2.0', 'CC BY-SA 3.0 de', 'CC BY-SA 2.5,2.0,1.0', 'CC0', 'Public domain']) assert.ok(commonsCredit(ii({ extmetadata: ext(ARTIST, l) })), l);
  for (const l of ['CC BY-NC-SA 2.0', 'CC BY-ND 4.0', 'GFDL', 'Fair use', '', 'Attribution']) assert.equal(commonsCredit(ii({ extmetadata: ext(ARTIST, l) })), null, l);
  for (const a of ['', '<a href="x"></a>', 'Unknown author', 'unknown', 'Anonymous']) assert.equal(commonsCredit(ii({ extmetadata: ext(a) })), null, a);
  assert.equal(commonsCredit(ii({ descriptionurl: 'https://en.wikipedia.org/wiki/File:Praha.jpg' })), null);
  assert.equal(commonsCredit(ii({ extmetadata: undefined })), null);
  assert.equal(commonsCredit(null), null);
  // odkaz na licenci jen na creativecommons.org (i bez https), jinak bez odkazu
  assert.equal(commonsCredit(ii({ extmetadata: { ...ext(), LicenseUrl: { value: '//creativecommons.org/licenses/by/2.0' } } })).lu, 'https://creativecommons.org/licenses/by/2.0');
  assert.equal(commonsCredit(ii({ extmetadata: { ...ext(), LicenseUrl: { value: 'javascript:alert(1)' } } })).lu, '');
});

test('pickPhotos: fotka bez autora nebo s licencí bez komerčního užití se nevrátí – vezme se jiná, jinak nic', async () => {
  const api = async (host, p) => {
    if (host === 'cs.wikipedia.org') return { query: { pages: [{ title: 'Brno', pageimage: 'Brno_lead.jpg', thumbnail: { source: 'https://u/thumb/960px-Brno_lead.jpg' }, langlinks: [{ lang: 'en', title: 'Brno' }] }] } };
    if (host === 'en.wikipedia.org') return { query: { pages: [{ title: 'Brno', images: [{ title: 'File:Brno panorama.jpg' }, { title: 'File:Brno old town.jpg' }] }] } };
    return commonsReply(p, {
      'File:Brno panorama.jpg': { cats: [FP], artist: '<span>Unknown author</span>' }, // oceněná, ale bez autora
      'File:Brno old town.jpg': { cats: [QI], lic: 'CC BY-NC-SA 2.0' }, // nekomerční
      'File:Brno lead.jpg': { artist: 'Petr Novák', lic: 'CC0' },
    });
  };
  const r = await pickPhotos(['Brno'], api);
  assert.deepEqual([r.photos, r.by, r.lic], [{ Brno: 'https://u/thumb/960px-Brno_lead.jpg' }, { Brno: 'Petr Novák' }, { Brno: 'CC0' }]);
  // ani úvodní obrázek nemá autora → karta bez fotky (ne fotka bez popisku)
  const none = await pickPhotos(['Brno'], async (host, p) => (host === 'commons.wikimedia.org'
    ? commonsReply(p, { 'File:Brno panorama.jpg': { artist: '' }, 'File:Brno lead.jpg': { artist: 'Anonymous' } }) : api(host, p)));
  assert.deepEqual([none.photos, none.by, none.bu], [{ Brno: '' }, {}, {}]);
});

test('cityPhotos: z paměti bez dotazu, „fotka není“ jako prázdná adresa, výpadek se neuloží', async () => {
  const ok = (photos, by = {}) => async () => ({ photos, by, partial: false });
  const opt = (pick) => ({ pick, prov: 'wiki' });
  assert.deepEqual(await cityPhotos(['Testov A', 'Testov B', 'Testov A', 'X|Y', ''], opt(ok({ 'Testov A': 'https://x/a.jpg' }))),
    { photos: { 'Testov A': 'https://x/a.jpg', 'Testov B': '' }, by: {}, bu: {}, lic: {}, lu: {}, partial: false, prov: 'wiki' });
  assert.deepEqual((await cityPhotos(['Testov A', 'Testov B'], opt(async () => { throw new Error('nemá se ptát'); }))).photos, { 'Testov A': 'https://x/a.jpg', 'Testov B': '' });
  // výpadek: nic v odpovědi ani v paměti, ale partial a failed – server ji pošle s krátkou mezipamětí (ne 6 h „bez fotek“)
  const down = await cityPhotos(['Testov C'], opt(async () => { throw new Error('429'); }));
  assert.deepEqual([down.photos, down.partial, down.failed], [{}, true, true]);
  // i se skutečným výběrem: česká Wikipedie neodpovídá → nic se neuloží, příště se ptá znovu
  const wikiDown = (t) => pickPhotos(t, async () => { throw new Error('503'); }, null, null);
  assert.equal((await cityPhotos(['Testov Z'], opt(wikiDown))).failed, true);
  assert.equal((await cityPhotos(['Testov Z'], opt(wikiDown))).failed, true);
  // DEMO: bez fotek a bez dotazu ven
  const demo = await cityPhotos(['Testov C'], { pick: async () => { throw new Error('nemá se ptát'); }, prov: 'wiki', mock: true });
  assert.deepEqual([demo.photos, demo.partial, demo.demo], [{}, false, true]);
  const half = await cityPhotos(['Testov C'], opt(async () => ({ photos: { 'Testov C': 'https://x/c.jpg' }, partial: true })));
  assert.deepEqual([half.photos, half.partial], [{ 'Testov C': 'https://x/c.jpg' }, true]);
  // s Pexels: autor fotky jde s ní (i z paměti); paměť je zvlášť pro Pexels a Wikimedii
  const px = { pick: ok({ 'Testov D': 'https://images.pexels.com/d.jpeg' }, { 'Testov D': 'Jana Nováková' }), prov: 'pexels' };
  assert.deepEqual(await cityPhotos(['Testov D'], px), { photos: { 'Testov D': 'https://images.pexels.com/d.jpeg' }, by: { 'Testov D': 'Jana Nováková' }, bu: {}, lic: {}, lu: {}, partial: false, prov: 'pexels' });
  assert.deepEqual((await cityPhotos(['Testov D'], { pick: async () => { throw new Error('z paměti'); }, prov: 'pexels' })).by, { 'Testov D': 'Jana Nováková' });
  assert.deepEqual((await cityPhotos(['Testov D'], opt(ok({ 'Testov D': 'https://x/wiki-d.jpg' })))).photos, { 'Testov D': 'https://x/wiki-d.jpg' });
});

test('cityPhotos s Wikimedií: autor, licence a stránka souboru jdou s fotkou (i z paměti)', async () => {
  const pick = async () => ({ photos: { 'Testov K': 'https://upload.wikimedia.org/k.jpg' }, by: { 'Testov K': 'Jan Fotograf' }, bu: { 'Testov K': pageOf('File:K.jpg') },
    lic: { 'Testov K': 'CC BY-SA 4.0' }, lu: { 'Testov K': CREDIT.lu }, partial: false });
  const want = { photos: { 'Testov K': 'https://upload.wikimedia.org/k.jpg' }, by: { 'Testov K': 'Jan Fotograf' }, bu: { 'Testov K': pageOf('File:K.jpg') },
    lic: { 'Testov K': 'CC BY-SA 4.0' }, lu: { 'Testov K': CREDIT.lu }, partial: false, prov: 'wiki' };
  assert.deepEqual(await cityPhotos(['Testov K'], { pick, prov: 'wiki' }), want);
  assert.deepEqual(await cityPhotos(['Testov K'], { pick: async () => { throw new Error('z paměti'); }, prov: 'wiki' }), want);
});

test('pickPhotos: hlavní fotka anglického článku (Eiffelovka) před oceněnou fotkou se jménem města z okolí (HEC Paris)', async () => {
  const api = async (host, p) => {
    if (host === 'cs.wikipedia.org') return { query: { pages: [{ title: 'Paříž', thumbnail: { source: 'https://u/thumb/500px-Paris_montage.jpg' }, langlinks: [{ lang: 'en', title: 'Paris' }] }] } };
    if (host === 'en.wikipedia.org') {
      return { query: { pages: [{ title: 'Paris', pageimage: 'La_Tour_Eiffel_vue_de_la_Tour_Saint-Jacques.jpg', images: [
        { title: 'File:Chateau, HEC Paris, Jouy-en-Josas, Southwest view.jpg' }, { title: 'File:Paris Seine at dusk.jpg' }, { title: 'File:La Tour Eiffel vue de la Tour Saint-Jacques.jpg' },
      ] }] } };
    }
    return commonsReply(p, { 'File:La Tour Eiffel vue de la Tour Saint-Jacques.jpg': { url: 'https://u/La Tour Eiffel vue de la Tour Saint-Jacques.jpg' }, 'File:Paris Seine at dusk.jpg': { cats: [QI] } });
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
      { title: 'Řím', pageimage: 'Rome_lead.jpg', thumbnail: { source: 'https://u/thumb/960px-Rome_lead.jpg' }, langlinks: [{ lang: 'en', title: 'Rome' }] },
      { title: 'Oradea', pageimage: 'Oradea_lead.jpg', thumbnail: { source: 'https://u/thumb/960px-Oradea_lead.jpg' }, langlinks: [{ lang: 'en', title: 'Oradea' }] },
    ] } };
    if (host === 'en.wikipedia.org') return { query: { pages: [{ title: 'Oradea', images: [] }, { title: 'Rome', images: [] }] } };
    return commonsReply(p, { 'File:Oradea lead.jpg': {} });
  };
  const asked = [];
  const pexels = async (q) => { asked.push(q); return q.startsWith('Rome') ? [{ alt: 'Trevi Fountain, Rome', url: 'https://www.pexels.com/photo/9/', photographer: 'Luca', src: { original: 'https://images.pexels.com/photos/9/t.jpeg' } }] : [{ alt: 'Romania mountains', url: 'https://www.pexels.com/photo/8/', photographer: 'X', src: { original: 'https://images.pexels.com/photos/8/m.jpeg' } }]; };
  const out = await pickPhotos(['Řím', 'Oradea'], api, pexels);
  assert.deepEqual(asked.sort(), ['Oradea city', 'Rome city']);
  assert.deepEqual(out.photos, { 'Řím': 'https://images.pexels.com/photos/9/t.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=960&h=1200', Oradea: 'https://u/thumb/960px-Oradea_lead.jpg' });
  assert.deepEqual(out.by, { 'Řím': 'Luca', Oradea: 'Jan Fotograf' });
  assert.deepEqual(out.lic, { Oradea: 'CC BY-SA 4.0' }); // licence jen u fotky z Commons
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
  // „bird's eye view“ je pohled na město shora, ne pták
  assert.match(unsplashPick([usp({ alt_description: "bird's eye view of Rio de Janeiro city", urls: { raw: 'https://images.unsplash.com/photo-b?ixid=4' } })], rio).u, /photo-b/);
  assert.match(unsplashPick([usp({ description: 'Birds-eye view, Rio de Janeiro', urls: { raw: 'https://images.unsplash.com/photo-e?ixid=5' } })], rio).u, /photo-e/);
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
  const api = async (host, p) => {
    if (host === 'cs.wikipedia.org') return { query: { pages: [
      { title: 'Řím', pageimage: 'Rome_lead.jpg', thumbnail: { source: 'https://u/thumb/960px-Rome_lead.jpg' }, langlinks: [{ lang: 'en', title: 'Rome' }] },
      { title: 'Oradea', pageimage: 'Oradea_lead.jpg', thumbnail: { source: 'https://u/thumb/960px-Oradea_lead.jpg' }, langlinks: [{ lang: 'en', title: 'Oradea' }] },
      { title: 'Lisabon', pageimage: 'Lisbon_lead.jpg', thumbnail: { source: 'https://u/thumb/960px-Lisbon_lead.jpg' }, langlinks: [{ lang: 'en', title: 'Lisbon' }] },
    ] } };
    if (host === 'en.wikipedia.org') return { query: { pages: [{ title: 'Oradea', images: [] }, { title: 'Rome', images: [] }, { title: 'Lisbon', images: [] }] } };
    return commonsReply(p, { 'File:Oradea lead.jpg': {}, 'File:Lisbon lead.jpg': {} });
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
  assert.deepEqual(out.by, { 'Řím': 'Luca', Lisabon: 'Ana Silva', Oradea: 'Jan Fotograf' });
  assert.deepEqual(out.bu, { 'Řím': 'https://www.pexels.com/@luca', Lisabon: `https://unsplash.com/@anasilva?${UNSPLASH_UTM}`, Oradea: pageOf('File:Oradea lead.jpg') });
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
    { photos: { 'Testov U': 'https://images.unsplash.com/u.jpg' }, by: { 'Testov U': 'Ana' }, bu: { 'Testov U': 'https://unsplash.com/@ana?x=1' }, lic: {}, lu: {}, partial: false, prov: 'unsplash' });
  const again = await cityPhotos(['Testov U'], { pick: async () => { throw new Error('z paměti'); }, prov: 'unsplash' });
  assert.deepEqual([again.by, again.bu], [{ 'Testov U': 'Ana' }, { 'Testov U': 'https://unsplash.com/@ana?x=1' }]);
  assert.deepEqual((await cityPhotos(['Testov U'], { pick: async () => ({ photos: { 'Testov U': 'https://x/w.jpg' }, partial: false }), prov: 'wiki' })).photos, { 'Testov U': 'https://x/w.jpg' });
  // limit dotazů Unsplash: fotka z Wikimedie jen na hodinu (pak z Unsplash), nalezená z Unsplash na týden; odpověď partial
  const r = await cityPhotos(['Testov V', 'Testov W'], { pick: async () => ({ photos: { 'Testov V': 'https://images.unsplash.com/v.jpg', 'Testov W': 'https://x/w-wiki.jpg' }, by: { 'Testov V': 'Ana' }, partial: false, retry: ['Testov W'] }), prov: 'unsplash' });
  assert.equal(r.partial, true);
  const { cache } = await import('../server/lib/cache.js');
  const ttl = (k) => cache.map.get(k).exp - Date.now();
  const [tv, tw] = [ttl('ph7:unsplash:Testov V'), ttl('ph7:unsplash:Testov W')];
  assert.ok(tv > 6 * 864e5 && tw <= 36e5, `${tv} ${tw}`);
  // náhradní fotka z paměti (do hodiny, jiné zařízení) je pořád jen na chvíli – partial, ať ji prohlížeč nedrží 30 dní
  const hit = await cityPhotos(['Testov W'], { pick: async () => { throw new Error('z paměti'); }, prov: 'unsplash' });
  assert.deepEqual([hit.photos, hit.partial], [{ 'Testov W': 'https://x/w-wiki.jpg' }, true]);
  assert.equal((await cityPhotos(['Testov V'], { pick: async () => { throw new Error('z paměti'); }, prov: 'unsplash' })).partial, false);
});
