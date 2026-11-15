#!/usr/bin/env node
// Sestaví data/places.json – vlastní seznam míst pro hledání (našeptávač, Objevuj, anglické názvy pro ubytování)
// z výpisu GeoNames (CC BY 4.0, komerční užití povolené). Nahrazuje geokódování Open-Meteo: to stojí na týchž
// datech, ale zdarma jen pro nekomerční užití.
//
//   node scripts/build-places.mjs [--cache <adresář>]
//
// Stahuje ~630 MB (allCountries.zip 423 MB, alternateNamesV2.zip 205 MB, admin1CodesASCII.txt, countryInfo.txt)
// do --cache (výchozí: dočasná složka systému); podruhé už z ní, přerušené stahování naváže. allCountries obsahuje
// i cities500, CZ a SK – stahovat je zvlášť by bylo totéž dvakrát; potřeba je kvůli ostrovům, horám a parkům ve světě
// (Bali, Matterhorn) a malým slavným místům pod 500 obyvatel (Manarola, Sveti Stefan). ZIPy se čtou proudově,
// 1,8 GB a 787 MB textu se na disk nerozbaluje.
//
// Výběr (selectPlace):
//  - Česko a Slovensko: všechna obydlená místa (Pustevny, Kvilda) a hory, kopce, parky, jezera, hrady, jeskyně…
//    s článkem na Wikipedii nebo českým jménem (Sněžka, Říp, hrad Karlštejn),
//  - Evropa (světadíl EU v countryInfo): celé cities500 (od 500 obyvatel nebo sídlo obce – Portofino, Hallstatt),
//    menší místa s článkem na Wikipedii, jménem aspoň ve 2 jazycích a známým počtem obyvatel (Manarola, Sveti Stefan)
//    a ostrovy, hory, parky, jezera, sopky, ledovce, pláže, letoviska a hrady s článkem na Wikipedii nebo českým či
//    anglickým jménem, pokud mají jméno aspoň v jednom dalším jazyce nebo obyvatele (Lofoty),
//  - svět: od 15 000 obyvatel, hlavní města a sídla krajů; v zemích, kam se jezdí k moři a na dovolenou (HOLIDAY),
//    i menší letoviska s článkem na Wikipedii, jménem aspoň v 1 jazyce a od 1000 obyvatel (Side, Göreme, Dahab);
//    ostrovy, parky, hory, sopky a letoviska s článkem na Wikipedii, jen když mají české jméno, aspoň 1000 obyvatel
//    (Bali, Tenerife) nebo jméno aspoň v 5 jazycích – ostatních je ~25 tisíc a soubor by přerostl rozpočet (~8 MB).
// Nikdy části měst a zaniklá či historická místa (PPLX, PPLH, PPLQ, PPLW).
//
// Formát viz NOTE níže. Jedno místo na řádek, ať jsou rozdíly při přegenerování malé. Řádek je řetězec s poli
// oddělenými „|“ místo pole hodnot: soubor je o ~10 % menší a po JSON.parse zabere v paměti polovinu (13 místo 27 MB).
import { createReadStream, createWriteStream, existsSync, statSync, renameSync, unlinkSync, openSync, readSync, closeSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { pipeline } from 'node:stream/promises';
import { createInflateRaw, crc32 } from 'node:zlib';
import { pipeline as pipe, Transform } from 'node:stream';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { normalize } from '../server/lib/geo.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(root, 'data/places.json');
const DUMP = 'https://download.geonames.org/export/dump/';
// obecný User-Agent: GeoNames nepotřebuje vědět, čí skript stahuje
const UA = 'Mozilla/5.0 (compatible; data-build-script/1.0)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const COLS = ['gid', 'name', 'lat', 'lon', 'admin1', 'pop', 'fc', 'n', 'en', 'keys'];
const NOTE = 'Řádek = pole oddělená „|“ v pořadí cols, prázdná pole na konci vynechána. gid = ID GeoNames jako rozdíl '
  + 'od předchozího řádku (řádky jsou seřazené podle ID). name = český název, jinak hlavní název GeoNames. lat, lon '
  + 'v desetitisícinách stupně. admin1 = index do admin1 ([země, kraj]). fc = index do fc (prázdné = PPL). n = počet '
  + 'jazyků se jménem – jak je známý neobydlený objekt (u obydlených míst prázdné, stačí počet obyvatel). en = anglický '
  + 'název (prázdné = jako name). keys = normalizované názvy pro hledání oddělené „,“ (prázdné = jen name malými '
  + 'písmeny), „=“ na začátku = historické nebo hovorové jméno, hledá se jen celé. countries = české názvy území, '
  + 'která data/countries.json nemá.';

/**
 * Stáhne soubor do mezipaměti (jednou). Přerušené stahování naváže dotazem Range (proxy občas spojení utne),
 * nejvýš 8 pokusů s rostoucí prodlevou; 60 s bez dat = nový pokus. Kousek z výpisu, který GeoNames mezitím přegeneroval,
 * by se slepil s novým – to pozná kontrola CRC v zipLines.
 */
export async function download(url, file) {
  if (existsSync(file)) return file;
  mkdirSync(path.dirname(file), { recursive: true });
  const part = `${file}.part`;
  for (let attempt = 1; ; attempt++) {
    const have = existsSync(part) ? statSync(part).size : 0;
    const ac = new AbortController();
    let idle;
    const kick = () => {
      clearTimeout(idle);
      idle = setTimeout(() => ac.abort(new Error('60 s bez dat')), 60000);
    };
    try {
      kick();
      const r = await fetch(url, { headers: { 'User-Agent': UA, ...(have ? { Range: `bytes=${have}-` } : {}) }, signal: ac.signal });
      if (r.status === 416) {
        unlinkSync(part); // kousek nesedí k souboru na serveru (mezitím nový výpis) → znovu od začátku
        throw new Error('HTTP 416');
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const append = r.status === 206;
      const total = Number(append ? r.headers.get('content-range')?.split('/')[1] : r.headers.get('content-length')) || 0;
      await pipeline(r.body, async function* (src) {
        for await (const chunk of src) {
          kick();
          yield chunk;
        }
      }, createWriteStream(part, { flags: append ? 'a' : 'w' }));
      const size = statSync(part).size;
      if (total && size !== total) throw new Error(`staženo ${size} z ${total} B`);
      renameSync(part, file);
      return file;
    } catch (e) {
      if (attempt >= 8) throw new Error(`${url}: ${e.message}`);
      console.warn(`  ${path.basename(file)}: ${e.message} – pokus ${attempt + 1} za ${2 ** attempt} s`);
      await sleep(1000 * 2 ** attempt);
    } finally {
      clearTimeout(idle);
    }
  }
}

/**
 * Řádky souboru uvnitř ZIPu (async iterátor) podle centrálního adresáře: najde záznam, přeskočí lokální hlavičku
 * a data pošle přes inflateRaw. Jen deflate nebo bez komprese a bez ZIP64 (výpisy GeoNames ho nemají). Na konci ověří
 * CRC-32 z centrálního adresáře: deflate poškozená data často „rozbalí“ bez chyby (tiché nesmysly v datech).
 */
export function zipLines(file, name) {
  const fd = openSync(file, 'r');
  const read = (pos, len) => {
    const b = Buffer.alloc(len);
    readSync(fd, b, 0, len, pos);
    return b;
  };
  let entry;
  try {
    const size = statSync(file).size;
    const tail = read(Math.max(0, size - 65557), Math.min(size, 65557)); // konec centrálního adresáře + komentář
    const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (eocd < 0) throw new Error(`${file}: není ZIP`);
    const count = tail.readUInt16LE(eocd + 10);
    const cdOffset = tail.readUInt32LE(eocd + 16);
    if (count === 0xffff || cdOffset === 0xffffffff) throw new Error(`${file}: ZIP64 neumím`);
    const cd = read(cdOffset, tail.readUInt32LE(eocd + 12));
    for (let p = 0, i = 0; i < count; i++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) throw new Error(`${file}: poškozený centrální adresář`);
      const [n, x, c] = [cd.readUInt16LE(p + 28), cd.readUInt16LE(p + 30), cd.readUInt16LE(p + 32)];
      if (cd.toString('utf8', p + 46, p + 46 + n) === name) {
        entry = { method: cd.readUInt16LE(p + 10), crc: cd.readUInt32LE(p + 16), csize: cd.readUInt32LE(p + 20), local: cd.readUInt32LE(p + 42) };
        break;
      }
      p += 46 + n + x + c;
    }
    if (!entry) throw new Error(`${file}: chybí ${name}`);
    if (entry.method !== 8 && entry.method !== 0) throw new Error(`${file}: neznámá komprese ${entry.method}`);
    const lh = read(entry.local, 30);
    entry.start = entry.local + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
  } finally {
    closeSync(fd);
  }
  let crc = 0;
  const check = new Transform({
    transform(chunk, enc, cb) {
      crc = crc32(chunk, crc);
      cb(null, chunk);
    },
    flush: (cb) => cb(crc === entry.crc ? null : new Error(`${file}: ${name} je poškozený (CRC nesedí) – smaž soubor z mezipaměti (--cache) a spusť znovu`)),
  });
  const raw = createReadStream(file, { start: entry.start, end: entry.start + entry.csize - 1 });
  // chyba kteréhokoli kroku (čtení, inflate, CRC) skončí na posledním proudu, a tedy ve for await nad řádky
  const input = pipe(raw, ...(entry.method === 8 ? [createInflateRaw()] : []), check, () => {});
  return createInterface({ input, crlfDelay: Infinity });
}

/**
 * Zobrazovaný název z alternativních jmen jednoho jazyka ([{ name, pref, short, colloq, hist }]): preferované (celé
 * před zkráceným – „Ústecký kraj“, ne „Ústecký“) > jediné > shodné s hlavním názvem > první; historická a hovorová ne.
 * Žádné → hlavní název GeoNames.
 */
export function pickName(names, main) {
  const ok = names.filter((n) => !n.hist && !n.colloq);
  return (ok.find((n) => n.pref && !n.short) || ok.find((n) => n.pref) || (ok.length === 1 ? ok[0] : null) || ok.find((n) => n.name === main) || ok[0])?.name || main;
}

// Části měst a zaniklá či historická místa – do hledání nepatří.
const GONE = new Set(['PPLX', 'PPLH', 'PPLQ', 'PPLW']);
// cities500: od 500 obyvatel nebo sídlo správního celku do 4. úrovně (readme GeoNames)
const SEAT = /^PPL(A[2-4]?|C|G)$/;
// Neobydlené objekty: Česko a Slovensko, Evropa, svět
const OBJ_CZSK = new Set(['MT', 'MTS', 'HLL', 'PK', 'PKS', 'LK', 'LKS', 'PRK', 'CSTL', 'CAVE', 'FLLS', 'RSRT', 'SPA', 'RSV', 'RUIN', 'MNMT', 'ISL', 'VAL', 'GRGE']);
const OBJ_EU = new Set(['ISL', 'ISLS', 'MT', 'MTS', 'PK', 'PKS', 'PRK', 'LK', 'LKS', 'VLC', 'GLCR', 'BCH', 'BCHS', 'RSRT', 'CSTL']);
const OBJ_WORLD = new Set(['ISL', 'ISLS', 'PRK', 'MT', 'PK', 'VLC', 'RSRT']);
// Země mimo Evropu (podle GeoNames – Turecko je Asie, Egypt Afrika), kam se jezdí k moři a na dovolenou: letoviska tam
// mívají pod 15 000 obyvatel (Side, Ölüdeniz, Göreme, Dahab, Marsa Alam) a bez nich by je hledání nenašlo vůbec.
const HOLIDAY = new Set(['TR', 'EG', 'TN', 'MA', 'AE', 'OM', 'JO', 'IL', 'GE', 'CV', 'DO', 'MX', 'CU', 'JM', 'TH', 'ID', 'LK', 'MV', 'VN', 'MY', 'PH', 'KE', 'TZ', 'MU', 'SC']);
export const LINK = 1, CS = 2, EN = 4;

/**
 * Patří záznam z allCountries do seznamu? r = { fcl, fc, cc, pop }, eu = světadíl Evropa, f = příznaky LINK | CS | EN
 * (článek na Wikipedii, české a anglické jméno), n = počet jazyků se jménem. Vrací skupinu pro výpis, nebo null.
 */
export function selectPlace(r, eu, f, n) {
  if (GONE.has(r.fc)) return null;
  const populated = r.fcl === 'P';
  if (r.cc === 'CZ' || r.cc === 'SK') {
    if (populated) return 'cz-sk obce';
    return OBJ_CZSK.has(r.fc) && f & (LINK | CS) ? 'cz-sk objekty' : null;
  }
  if (eu) {
    if (populated) return r.pop > 500 || SEAT.test(r.fc) ? 'evropa cities500' : f & LINK && n >= 2 && r.pop > 0 ? 'evropa malá místa' : null;
    // samotný odkaz bez jména v jiném jazyce mají tisíce bezejmenných jezer a vrcholů; obydlené ostrovy (Lofoty) ano
    return OBJ_EU.has(r.fc) && f & (LINK | CS | EN) && (n >= 1 || r.pop >= 1000) ? 'evropa objekty' : null;
  }
  if (populated) return r.pop >= 15000 || r.fc === 'PPLC' || r.fc === 'PPLA' ? 'svět města' : HOLIDAY.has(r.cc) && f & LINK && n >= 1 && r.pop >= 1000 ? 'svět letoviska' : null;
  return OBJ_WORLD.has(r.fc) && f & LINK && (f & CS || r.pop >= 1000 || n >= 5) ? 'svět objekty' : null;
}

// Povinná místa (zadání): dotaz → očekávaný název (a země), nejvýš na 3. místě; en = anglický název. Hlídá je i test
// (test/places-search.test.js).
export const MUST = [
  ['Benátky', 'Benátky', 'IT', 'Venice'], ['Mnichov', 'Mnichov', 'DE', 'Munich'], ['Řezno', 'Řezno', 'DE'], ['Drážďany', 'Drážďany', 'DE'],
  ['Kolín nad Rýnem', 'Kolín nad Rýnem', 'DE'], ['Vratislav', 'Vratislav', 'PL'], ['Soluň', 'Soluň', 'GR'], ['Lublaň', 'Lublaň', 'SI'],
  ['Vídeň', 'Vídeň', 'AT'], ['Krakov', 'Krakov', 'PL'], ['Hallstatt', 'Hallstatt', 'AT'], ['Portofino', 'Portofino', 'IT'],
  ['Manarola', 'Manarola', 'IT'], ['Vernazza', 'Vernazza', 'IT'], ['Sveti Stefan', 'Sveti Stefan', 'ME'], ['Karlštejn', 'Karlštejn', 'CZ'],
  ['Pustevny', 'Pustevny', 'CZ'], ['Kvilda', 'Kvilda', 'CZ'], ['Modrava', 'Modrava', 'CZ'], ['Lipno nad Vltavou', 'Lipno nad Vltavou', 'CZ'],
  ['Sněžka', 'Sněžka', 'CZ'], ['Lysá hora', 'Lysá hora', 'CZ'], ['Hvar', 'Hvar', 'HR'], ['Mljet', 'Mljet', 'HR'], ['Santorini', 'Santorin', 'GR'],
  ['Santorin', 'Santorin', 'GR'], ['Mallorca', 'Mallorca', 'ES'], ['Tenerife', 'Tenerife', 'ES'], ['Bali', 'Bali', 'ID'],
  ['Plitvice', 'Plitvice Lakes National Park', 'HR'], ['Plitvická jezera', 'Plitvička Jezera', 'HR'], ['Matterhorn', 'Matterhorn', 'CH'],
  ['Zugspitze', 'Zugspitze', 'DE'], ['Triglav', 'Triglav', 'SI'], ['Toledo', 'Toledo', 'ES', '', 6], ['Toledo', 'Toledo', 'US', '', 6],
  ['Bologna', 'Bologna', 'IT'], ['Boloňa', 'Bologna', 'IT', 'Bologna'], ['Dubrovník', 'Dubrovnik', 'HR'], ['Dubrovnik', 'Dubrovnik', 'HR'],
  ['Salcburk', 'Salzburg', 'AT'], ['Salzburg', 'Salzburg', 'AT'], ['Kodaň', 'Kodaň', 'DK', 'Copenhagen'], ['Brno', 'Brno', 'CZ'],
  ['Ostrava', 'Ostrava', 'CZ'], ['Olomouc', 'Olomouc', 'CZ'], ['Zlín', 'Zlín', 'CZ'], ['Praha', 'Praha', 'CZ'],
  // letoviska mimo Evropu pod 15 000 obyvatel (kontrola po první verzi, která je vynechala)
  ['Side', 'Side', 'TR'], ['Göreme', 'Göreme', 'TR'], ['Dahab', 'Dahab', 'EG'],
];

/**
 * Kontrola povinných míst skutečným hledáním aplikace (server/lib/places.js geocode a englishName) nad právě zapsaným
 * data/places.json. Vrací řádky výpisu a počet chyb.
 */
export async function mustFind() {
  const { geocode, englishName } = await import('../server/lib/places.js');
  const out = [];
  let bad = 0;
  for (const [q, label, cc, en, top = 3] of MUST) {
    const hits = await geocode(q);
    const rank = hits.findIndex((p) => p.label === label && p.cc === cc) + 1;
    const p = hits[rank - 1];
    const pen = p && (await englishName(p.label, p.lat, p.lon, p.cc, p.gid));
    const ok = rank && rank <= top && (!en || pen === en);
    if (!ok) bad++;
    out.push(`${ok ? 'OK ' : 'CHYBA'} ${q} → ${rank ? `${rank}. ${label} (${cc})${en ? ` / ${pen}` : ''}` : 'nenalezeno'}`
      + `   [${hits.slice(0, 3).map((h) => `${h.label} ${h.cc}`).join('; ')}]`);
  }
  return { out, bad };
}

async function main() {
  const i = process.argv.indexOf('--cache');
  const CACHE = i > 0 ? process.argv[i + 1] : path.join(tmpdir(), 'atlas-geonames');
  const t0 = Date.now();
  const src = {};
  for (const f of ['countryInfo.txt', 'admin1CodesASCII.txt', 'alternateNamesV2.zip', 'allCountries.zip']) src[f] = await download(DUMP + f, path.join(CACHE, f));
  const lap = (what) => console.log(`${what} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);

  // země: světadíl, jazyky (bez varianty: de-AT → de) a ID kvůli českému jménu území
  const countries = new Map();
  for (const l of readFileSync(src['countryInfo.txt'], 'utf8').split('\n')) {
    const f = l.split('\t');
    if (l.startsWith('#') || f.length < 17) continue;
    countries.set(f[0], { name: f[4], eu: f[8] === 'EU', langs: new Set(f[15].split(',').map((x) => x.split('-')[0]).filter(Boolean)), gid: Number(f[16]) });
  }
  const admin1 = new Map();
  for (const l of readFileSync(src['admin1CodesASCII.txt'], 'utf8').split('\n')) {
    const f = l.split('\t');
    if (f.length >= 4) admin1.set(f[0], { name: f[1], gid: Number(f[3]) });
  }

  // 1) příznaky podle ID (ID GeoNames jsou do ~13 mil.): článek na Wikipedii, české a anglické jméno a počet jazyků
  //    se jménem (jména jednoho místa jdou v souboru za sebou)
  const ALT = [src['alternateNamesV2.zip'], 'alternateNamesV2.txt'];
  const flags = new Uint8Array(1 << 25);
  const nLangs = new Uint8Array(1 << 25);
  let cur = -1;
  const langs = new Set();
  for await (const l of zipLines(...ALT)) {
    const a = l.indexOf('\t'), b = l.indexOf('\t', a + 1), c = l.indexOf('\t', b + 1);
    const gid = Number(l.slice(a + 1, b));
    const lang = l.slice(b + 1, c);
    if (gid !== cur) {
      if (cur >= 0) nLangs[cur] = Math.min(255, langs.size);
      cur = gid;
      langs.clear();
    }
    if (lang === 'link') flags[gid] |= LINK;
    else if (/^[a-z]{2,3}(-|$)/.test(lang)) { // ISO 639 (ne post, iata, wkdt, abbr…)
      langs.add(lang.split('-')[0]);
      if (lang === 'cs') flags[gid] |= CS;
      else if (lang === 'en') flags[gid] |= EN;
    }
  }
  nLangs[cur] = Math.min(255, langs.size);
  lap('alternativní jména: příznaky');

  // 2) výběr míst
  const places = new Map();
  const groups = {};
  for await (const l of zipLines(src['allCountries.zip'], 'allCountries.txt')) {
    const f = l.split('\t');
    const gid = Number(f[0]);
    if (gid >= flags.length) throw new Error(`ID ${gid} se nevejde do příznaků – zvětšit`);
    const r = { gid, name: f[1], ascii: f[2], lat: Number(f[4]), lon: Number(f[5]), fcl: f[6], fc: f[7], cc: f[8], a1: f[10], pop: Number(f[14]) || 0 };
    const c = countries.get(r.cc);
    const g = c && selectPlace(r, c.eu, flags[gid], nLangs[gid]);
    if (!g) continue;
    groups[g] = (groups[g] || 0) + 1;
    r.group = g;
    r.names = [];
    places.set(gid, r);
  }
  lap(`výběr: ${places.size} míst`);

  // 3) jména vybraných míst (cs, sk, en, de, pl a jazyky země), krajů a území (jen česká)
  const BASE = new Set(['cs', 'sk', 'en', 'de', 'pl']);
  const extra = new Map();
  for (const a of admin1.values()) extra.set(a.gid, []);
  for (const c of countries.values()) extra.set(c.gid, []);
  for await (const l of zipLines(...ALT)) {
    const f = l.split('\t');
    const gid = Number(f[1]);
    const p = places.get(gid);
    const lang = f[2];
    if (p ? !(BASE.has(lang) || countries.get(p.cc).langs.has(lang)) : !(lang === 'cs' && extra.has(gid))) continue;
    (p ? p.names : extra.get(gid)).push({ lang, name: f[3], pref: f[4] === '1', short: f[5] === '1', colloq: f[6] === '1', hist: f[7] === '1' });
  }
  lap('alternativní jména: názvy');

  // kraje a druhy míst jako tabulky indexů (pořadí podle kódu, ať se při přegenerování nepřehazuje)
  const sorted = [...places.values()].sort((a, b) => a.gid - b.gid);
  // neznámý kraj (00 – hory, jezera přes hranice krajů) → jeden prázdný záznam za zemi
  for (const p of sorted) if (!admin1.has(`${p.cc}.${p.a1}`)) p.a1 = '';
  const a1Keys = [...new Set(sorted.map((p) => `${p.cc}.${p.a1}`))].sort();
  const a1Index = new Map(a1Keys.map((k, i) => [k, i]));
  const a1Table = a1Keys.map((k) => {
    const a = admin1.get(k);
    return [k.slice(0, 2), a ? pickName(extra.get(a.gid), a.name) : ''];
  });
  const fcTable = ['PPL', ...[...new Set(sorted.map((p) => p.fc))].filter((x) => x !== 'PPL').sort()];
  const fcIndex = new Map(fcTable.map((x, i) => [x, i]));
  const known = new Set(JSON.parse(readFileSync(path.join(root, 'data/countries.json'), 'utf8')).map((c) => c.iso2));
  const terr = {};
  for (const cc of [...new Set(sorted.map((p) => p.cc))].sort()) {
    const c = countries.get(cc);
    if (!known.has(cc)) terr[cc] = pickName(extra.get(c.gid), c.name);
  }

  const rows = [];
  const bytes = {};
  let prev = 0;
  // poloha jako toFixed(4) z čísla GeoNames (ne Math.round(x × 1e4) – u x,xxxx5 zaokrouhlí jinak): ID míst
  // geo:lat,lon|název jsou pak stejná jako dřív z Open-Meteo (uložené cesty, hlídání cen, sdílené odkazy)
  const e4 = (x) => Math.round(x.toFixed(4) * 1e4);
  for (const p of sorted) {
    const of = (lang) => p.names.filter((n) => n.lang === lang);
    const label = pickName(of('cs'), p.name).replace(/\|/g, '/');
    const en = pickName(of('en').filter((n) => n.pref), p.name).replace(/\|/g, '/');
    // historická a hovorová jména jen celá („=“): Bombaj najde Mumbai, ale „madr“ Madrid, ne Čennaí (Madras), „bena“
    // Benátky, ne Váránasí (Benares), „New York“ ne Jakartu („New York Van Java“)
    const now = p.names.filter((n) => !n.hist && !n.colloq);
    const keys = [...new Set([label, p.name, p.ascii, en, ...now.map((n) => n.name)].map(normalize).filter(Boolean))];
    const old = new Set(p.names.filter((n) => !now.includes(n)).map((n) => normalize(n.name)));
    keys.push(...[...old].filter((k) => k && !keys.includes(k)).map((k) => `=${k}`));
    const n = nLangs[p.gid];
    const f = [p.gid - prev, label, e4(p.lat), e4(p.lon), a1Index.get(`${p.cc}.${p.a1}`), p.pop, fcIndex.get(p.fc) || '', p.fcl === 'P' ? '' : n || '',
      en === label ? '' : en, keys.length === 1 && keys[0] === label.toLowerCase() ? '' : keys.join(',')];
    while (f[f.length - 1] === '') f.pop();
    const row = f.join('|');
    rows.push(row);
    bytes[p.group] = (bytes[p.group] || 0) + Buffer.byteLength(row) + 4;
    prev = p.gid;
  }

  const head = { built: new Date().toISOString().slice(0, 10), source: 'GeoNames (CC BY 4.0) – https://www.geonames.org, výpis allCountries a alternateNamesV2', cols: COLS, note: NOTE };
  const json = `${JSON.stringify(head).slice(0, -1)},"admin1":${JSON.stringify(a1Table)},"fc":${JSON.stringify(fcTable)},"countries":${JSON.stringify(terr)},"places":[\n${rows.map((r) => JSON.stringify(r)).join(',\n')}\n]}\n`;
  writeFileSync(OUT, json);
  lap(`hotovo: ${rows.length} míst, ${(Buffer.byteLength(json) / 1e6).toFixed(2)} MB`);
  for (const [g, c] of Object.entries(groups).sort()) console.log(`  ${g.padEnd(18)} ${String(c).padStart(7)} míst ${(bytes[g] / 1e6).toFixed(2).padStart(6)} MB`);
  const { out, bad } = await mustFind();
  console.log(`Povinná místa (${MUST.length - bad}/${MUST.length}):\n  ${out.join('\n  ')}`);
  if (bad) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
