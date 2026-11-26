// Karty pro sítě (public/js/sharecard.js) ve vzhledu Letsi: kreslení na canvas se zaznamená napodobeným plátnem
// (každé volání a nastavení barvy, písma, stínu…). Bez data-brand="letsi" musí být záznam stejný jako před motivy –
// hlídá ho otisk SHA-256 (změní se jen se záměrnou změnou kresby ATLASu). Se vzhledem Letsi paleta Letsi 2.1: Pistácie
// s Nocí, Vápno, žádné barevné přechody ani sklo, bez Rajčete, písma Letsi a Onest jen načtená.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
const TRIP = { dest: 'Madeira', cc: 'PT', id: 'ap:FNC', a: 'FNC', o: '2026-11-12', b: '2026-11-19', f: 'Praha', temp: 22 };
const LONG = { ...TRIP, dest: 'Santiago de Compostela', temp: null };

/**
 * Nakreslí karty (ShareCard.render) do napodobeného plátna → záznam kreslení jako řádky textu.
 * brand: data-brand na <html>; loaded: rodiny, které document.fonts.check hlásí jako načtené; photo: fotka cíle.
 */
async function draw(d, { brand, loaded = [], photo = false } = {}) {
  const log = [], ids = new Map();
  const name = (v) => {
    if (v && typeof v === 'object') { if (!ids.has(v)) ids.set(v, `obj${ids.size}`); return ids.get(v); }
    return typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : JSON.stringify(v);
  };
  const grad = (tag) => { const g = { addColorStop: (p, c) => log.push(`${tag}.addColorStop(${name(p)},${name(c)})`) }; ids.set(g, tag); return g; };
  function context(cv) {
    const tag = `c${ids.size}`, st = { font: '10px sans-serif' };
    ids.set(cv, tag);
    const methods = {
      measureText: (s) => ({ width: [...String(s)].length * (+(/(\d+)px/.exec(st.font) || [0, 10])[1]) * 0.55 }),
      createLinearGradient: (...a) => { const g = grad(`${tag}.g${ids.size}`); log.push(`${tag}.createLinearGradient(${a.map(name)})=${ids.get(g)}`); return g; },
    };
    return new Proxy(st, {
      get(t, k) {
        if (k === 'canvas') return cv;
        if (k in methods) return methods[k];
        if (k in t) return t[k];
        return (...a) => { log.push(`${tag}.${String(k)}(${a.map(name)})`); };
      },
      set(t, k, v) { t[k] = v; log.push(`${tag}.${String(k)}=${name(v)}`); return true; },
    });
  }
  const c = {
    window: {}, TextEncoder, TextDecoder, btoa, atob, navigator: {}, location: { origin: 'https://atlas.example', pathname: '/' }, File,
    // pojistka fonts() (8 s) nesmí držet test naživu
    setTimeout: (f, ms) => { const t = setTimeout(f, ms); t.unref(); return t; },
    Path2D: class { constructor(p) { this.p = p; } },
    Image: class { set src(u) { this.u = u; this.width = 960; this.height = 1200; setTimeout(() => this.onload(), 0); } get src() { return this.u; } },
    fetch: async () => ({ json: async () => (photo ? { photos: { [d.dest]: 'https://images.pexels.com/p.jpg?w=960&h=1200' }, by: { [d.dest]: 'Jan' } } : { photos: {} }) }),
    document: {
      documentElement: { dataset: brand ? { brand } : {} },
      fonts: { load: async () => [], check: (f) => loaded.some((n) => f.includes(n)) },
      createElement: () => { const cv = { toBlob: (cb) => cb(new Blob(['x'])) }; const x = context(cv); cv.getContext = () => x; return cv; },
    },
  };
  vm.createContext(c);
  for (const f of ['sharelink.js', 'sharecard.js']) vm.runInContext(src(f), c, { filename: f });
  // render() bere data z sanitize() a počasí doplní open() – tady rovnou hotový objekt
  await c.window.ShareCard.render(d);
  return log;
}
const hash = (log) => createHash('sha256').update(log.join('\n')).digest('hex').slice(0, 16);

test('ATLAS (bez data-brand="letsi"): karty se kreslí přesně jako před motivy', async () => {
  // otisky záznamu kreslení z doby před tabulkou motivů – Story i příspěvek, krátký i dlouhý cíl, s fotkou i bez
  assert.equal(hash(await draw(TRIP)), '37971e1939f4dc0b');
  assert.equal(hash(await draw(LONG)), '62a2387ecbaf757d');
  assert.equal(hash(await draw(TRIP, { photo: true })), 'b4bc9965b8b23012');
  // jiný vzhled než letsi (nebo žádný) je ATLAS
  assert.equal(hash(await draw(TRIP, { brand: 'atlas' })), hash(await draw(TRIP)));
});

/** Barvy ze záznamu: fillStyle, strokeStyle, shadowColor, zastávky přechodů (gradient sám jako objekt vynechán). */
const colors = (log) => [...new Set(log.flatMap((l) => {
  const m = /\.(?:fillStyle|strokeStyle|shadowColor)="(.*)"$/.exec(l) || /\.addColorStop\([^,]+,"(.*)"\)$/.exec(l);
  return m ? [m[1].toUpperCase()] : [];
}))];
const fontsOf = (log) => [...new Set(log.flatMap((l) => { const m = /\.font=(".*")$/.exec(l); return m ? [JSON.parse(m[1]).replace(/^\d+ \d+px /, '')] : []; }))];

test('Letsi: Pistácie s Nocí, Vápno, bez barevných přechodů, skla a Rajčete; rozměry a rozložení jako ATLAS', async () => {
  for (const [d, photo] of [[TRIP, false], [LONG, false], [TRIP, true]]) {
    const L = await draw(d, { brand: 'letsi', loaded: ['Letsi', 'Onest'], photo }), A = await draw(d, { photo });
    const cs = colors(L);
    for (const c of ['#D6DE82', '#14161F', '#F3F4F0']) assert.ok(cs.includes(c), `${c} na kartě (${cs})`);
    assert.ok(!cs.includes('#DF3A14'), 'Rajče na kartě není');
    // jen paleta Letsi: Noc/Vápno/Pistácie, šedé linky a průhledná Noc nebo Vápno – žádná modrá, fialová ani bílé sklo
    const ok = /^(#D6DE82|#14161F|#F3F4F0|#585D56|#C9CDC2|#DFE2DA|RGBA\(20,22,31,[.\d]+\)|RGBA\(243,244,240,[.\d]+\))$/;
    assert.deepEqual(cs.filter((c) => !ok.test(c)), [], 'barva mimo paletu Letsi');
    // přechody jen jako ztmavení fotky průhlednou Nocí (svisle) – pozadí bez fotky i značka plnou barvou
    const stops = L.filter((l) => l.includes('.addColorStop('));
    assert.ok(stops.every((l) => /"rgba\(20,22,31,[.\d]+\)"\)$/.test(l)), stops.join('\n'));
    assert.ok(L.filter((l) => l.includes('createLinearGradient(')).every((l) => /\(0,[\d.]+,0,[\d.]+\)/.test(l)), 'jen svislé ztmavení');
    // bez skla: štítek „HLEDÁM PARŤÁKA“ bez obrysu (strokeStyle jen u vlaštovky a čárkovaných linek)
    assert.equal(L.filter((l) => l.endsWith('.stroke()')).length, A.filter((l) => l.endsWith('.stroke()')).length - 2);
    // rozložení: stejné texty na stejných místech jako ATLAS (písmo se liší jen jménem, měření je v testu podle velikosti)
    // (čísla pláten bez ohledu na pořadí – přechody ATLASu je posunou)
    const texts = (log) => log.filter((l) => /\.(fillText|drawImage|fillRect|arc)\(/.test(l)).map((l) => l.replace(/\bc\d+\b|\bobj\d+\b/g, '#'));
    assert.deepEqual(texts(L), texts(A));
  }
});

test('Letsi: nadpisy a ceny písmem Letsi (Unbounded), text Onest – jen načtená, jinak systémové', async () => {
  const both = fontsOf(await draw(TRIP, { brand: 'letsi', loaded: ['Letsi', 'Onest'] }));
  assert.deepEqual(both.sort(), ['Caveat, "Segoe Print", "Bradley Hand", cursive', 'Letsi, Onest, system-ui, sans-serif', 'Onest, system-ui, sans-serif'].sort());
  const none = fontsOf(await draw(TRIP, { brand: 'letsi' }));
  assert.deepEqual(none.sort(), ['Caveat, "Segoe Print", "Bradley Hand", cursive', 'system-ui, sans-serif'].sort());
  assert.ok(!none.some((f) => /Letsi|Onest|Sora|Inter/.test(f)));
  // Onest bez Unboundedu: nadpisy Onestem
  assert.ok(fontsOf(await draw(TRIP, { brand: 'letsi', loaded: ['Onest'] })).includes('Onest, system-ui, sans-serif'));
});

test('Letsi stahuje Unbounded a Onest místo Sory a Interu; ATLAS stahuje to co dřív', async () => {
  const asked = (brand) => {
    const got = [];
    const c = {
      window: {}, TextEncoder, TextDecoder, btoa, atob, navigator: {}, location: { origin: 'https://atlas.example', pathname: '/' },
      setTimeout: () => 0, fetch: () => new Promise(() => { }),
      document: { documentElement: { dataset: brand ? { brand } : {} }, fonts: { load: async (f) => { got.push(f); return []; } } },
    };
    vm.createContext(c);
    for (const f of ['sharelink.js', 'sharecard.js']) vm.runInContext(src(f), c, { filename: f });
    c.window.ShareCard.render(TRIP);
    return got;
  };
  assert.deepEqual(asked(), ['800 100px Sora', '700 50px Sora', '800 30px Inter', '700 30px Inter', '600 22px Inter', '700 70px Caveat']);
  assert.deepEqual(asked('letsi'), ['800 100px Letsi', '700 50px Letsi', '800 30px Onest', '700 30px Onest', '600 22px Onest', '700 70px Caveat']);
});
