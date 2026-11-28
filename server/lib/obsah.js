// Obsahové stránky webu: země /zeme/<slug> (zatím Portugalsko; další země, rozcestník /zeme a měsíce /kam-v-…
// přibudou). Server je vykreslí sám z dat repozitáře – seznam zemí a letišť data/obsah.json, podnebí climate.js, cesta
// z letiště arrival.js, vstup data/entry.json, země countries.json, zdraví a zásuvky public/data/pretrip.json – líně
// při prvním požadavku a drží v paměti. Žádný build ani soubor na disku: Render krok sestavení spolehlivě nemá.
// Výstup je deterministický (v HTML není datum vykreslení), takže po probuzení serveru vyjde stejný ETag a prohlížeč
// dostane 304. HTML nikdy do public/ – service worker hashuje každý soubor tam do verze aplikace a každá úprava stránky
// by všem ukázala „Je k dispozici nová verze“; sdílené CSS je public/obsah/obsah.css s otiskem ?v=.
// Texty jen z dat, žádné ceny letenek (ani v titulku, popisu a náhledu): modul nesmí načítat search.js, providers/,
// fares.js ani pricelevel.js (hlídá test/obsah.test.js). Na stránce je jen jízdné z letiště do centra a kurz ČNB.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRAND } from '../brand.js';
import { COUNTRY_BY_ISO, getAirport } from './airports.js';
import { airportClimate, sourceText } from './climate.js';
import { ARRIVAL_FX, arrivalTransfer } from './arrival.js';
import { haversineKm } from './geo.js';
import { flightMinOf } from './ground.js';
import { tzOffsetMin } from './dates.js';
import { slug } from './links.js';
import { contentVersion } from './pwa.js';
import { sendGenerated } from './seo.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const json = (rel) => JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8'));
export const OBSAH = json('data/obsah.json');
export const ENTRY = json('data/entry.json');
export const PRETRIP = json('public/data/pretrip.json');
const CSS_FILE = path.join(ROOT, 'public', 'obsah', 'obsah.css');

/** Stránky jsou zatím jen pro kontrolu: noindex a mimo sitemap. Spuštění indexace (P6) je jen přepnutí na true. */
export const LIVE = false;

/** CSP: žádný skript (stránka žádný nemá), styly ze sdíleného CSS a style="--v:…" u sloupců grafu, vše z vlastního
    serveru. JSON-LD by byl datový blok, toho se script-src netýká. */
export const CONTENT_CSP = "default-src 'none'; script-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/* ---------- drobnosti ---------- */
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const NB = ' ';
/** Číslo česky (tisíce dělí pevná mezera, desetinná čárka). */
export const nb = (n, digits = 0) => n.toLocaleString('cs-CZ', { maximumFractionDigits: digits }).replace(/\s/g, NB);
// jednopísmenná předložka či spojka nezůstane na konci řádku (česká typografie)
const vlna = (s) => s.replace(/(^|[\s(])([aikosuvzAIKOSUVZ]) /g, `$1$2${NB}`);
const int = (n) => (n < 0 ? `−${-n}` : String(n));
export const kmTxt = (km) => `${nb(Math.round(km))}${NB}km`;
/** Odhad přímého letu z Prahy (flightMinOf) zaokrouhlený nahoru na 5 minut – odhad nemá působit přesně. */
export const flyMin = (km) => Math.ceil(flightMinOf(km) / 5) * 5;
export const dur = (min) => { const h = Math.floor(min / 60), m = min % 60; return [h && `${h}${NB}h`, m && `${m}${NB}min`].filter(Boolean).join(NB); };
const list = (a) => (a.length > 1 ? `${a.slice(0, -1).join(', ')} a${NB}${a[a.length - 1]}` : a[0] || '');
const dmy = (ymd) => ymd.slice(0, 10).split('-').reverse().map(Number).join(`.${NB}`);
const flagOf = (cc) => String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0)));
const MON = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
const MON_LOC = ['lednu', 'únoru', 'březnu', 'dubnu', 'květnu', 'červnu', 'červenci', 'srpnu', 'září', 'říjnu', 'listopadu', 'prosinci'];
const MON_S = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'];
const fare = (x) => (Number.isInteger(x) ? String(x) : x.toFixed(2).replace('.', ','));
const SYM = { EUR: '€', GBP: '£', USD: '$' };

/** České názvy měn zemí sady (test hlídá, že má každá země v obsah.json svoji). Kurz jen z arrival.json (ČNB s datem). */
export const CUR_CS = {
  EUR: 'Euro', GBP: 'Britská libra', CHF: 'Švýcarský frank', NOK: 'Norská koruna', SEK: 'Švédská koruna',
  DKK: 'Dánská koruna', ISK: 'Islandská koruna', RON: 'Rumunský leu', RSD: 'Srbský dinár',
  MDL: 'Moldavský leu', ALL: 'Albánský lek', TRY: 'Turecká lira', EGP: 'Egyptská libra', TND: 'Tuniský dinár',
  MAD: 'Marocký dirham', GEL: 'Gruzínský lari', THB: 'Thajský baht', MVR: 'Maledivská rupie', JPY: 'Japonský jen',
  USD: 'Americký dolar', MXN: 'Mexické peso',
};

/** Režim vstupu jako kind() v public/js/entry.js – stejný klíč a štítek (test je porovná přes node:vm). */
export function entryKind(r) {
  if (!r) return null;
  const via = r.etaName ? `: ${r.etaName}` : '';
  const reg = String(r.etaName || '').replace(/\s*\(.*?\)/g, '').split(/\s+[+–-]\s+/)[0].trim();
  const regName = reg && reg.length <= 12 ? reg : r.visa === 'eta' ? 'registrace' : 'e-vízum';
  switch (r.visa) {
    case 'eu': return { key: 'op', label: 'stačí OP', text: 'EU / Schengen – volný pohyb, stačí občanský průkaz' };
    case 'none': return r.idCard ? { key: 'op', label: 'stačí OP', text: 'Bez víza – stačí i občanský průkaz' } : { key: 'free', label: 'bez víza', text: 'Bez víza – jen s cestovním pasem' };
    case 'eta': return { key: 'eta', label: regName, text: `Nutná online registrace předem${via}` };
    case 'evisa': return { key: 'evisa', label: 'e-vízum', text: `Nutné e-vízum, vyřídíš online předem${via}` };
    case 'voa': return { key: 'voa', label: 'vízum na hranici', text: `Vízum při příletu${r.etaName ? `, nebo předem online${via}` : ''}` };
    case 'visa': return { key: 'visa', label: 'vízum předem', text: `Vízum předem na zastupitelském úřadě${r.etaName ? `; online žádost${via}` : ''}` };
    default: return null;
  }
}
// doklad jako číslo v pásu: krátká hodnota, upřesnění v popisku (hodnota se musí vejít na řádek)
const DOC_DT = { free: 'stačí, bez víza', eta: 'vyřídit online předem', evisa: 'vyřídit online předem', voa: 'vyřídíš při příletu', visa: 'vyřídit předem na úřadě' };

/* ---------- stránky ---------- */
const pathOf = (cc) => `/zeme/${OBSAH.zeme[cc].slug || slug(COUNTRY_BY_ISO.get(cc).cs)}`;
const PAGES = new Map(Object.keys(OBSAH.zeme).map((cc) => [pathOf(cc), cc]));
/** Adresy všech obsahových stránek (pro směrování, test a později sitemap). */
export const contentPaths = () => [...PAGES.keys()];

const PRG = getAirport('PRG');
/** Letiště stránky se vším, co o něm stránka říká. */
function airportRow(iata) {
  const a = getAirport(iata), t = arrivalTransfer(iata), km = haversineKm(PRG.lat, PRG.lon, a.lat, a.lon);
  return { iata, a, t, c: airportClimate(iata), km, fly: flyMin(km), city: t.city, gen: t.gen || t.city };
}

// Posun proti Česku v polovině ledna a července (zimní a letní čas), rok podle data seznamu – výstup se nemění s dneškem
function shifts(tz) {
  const y = Number(OBSAH.checked.slice(0, 4));
  return [0, 6].map((m) => { const t = Date.UTC(y, m, 15, 12); return tzOffsetMin(tz, t) - tzOffsetMin('Europe/Prague', t); });
}
const hoursTxt = (min) => { const h = Math.abs(min) / 60; return `${min < 0 ? '−' : '+'}${nb(h, 2)}`; };
function shiftFact(rows) {
  const v = [...new Set(rows.flatMap((r) => shifts(r.a.tz)))];
  if (v.length > 1) return [`${v.map((m) => (m ? hoursTxt(m) : '0')).join(' / ')}${NB}h`, 'časový posun podle letiště a ročního období'];
  if (!v[0]) return ['žádný', 'stejný čas jako v Česku'];
  const h = Math.abs(v[0]) / 60;
  return [`${hoursTxt(v[0])}${NB}${!Number.isInteger(h) ? 'h' : h === 1 ? 'hodina' : h < 5 ? 'hodiny' : 'hodin'}`, 'časový posun proti Česku'];
}

/** Zdroj vstupu jako v aplikaci (entry.js srcTxt): „ověřeno“ jen u ověřeného záznamu z webu MZV ČR. */
function entrySource(r) {
  const host = new URL(r.source).hostname.replace(/^www\./, '');
  const mzv = /(^|\.)mzv\.gov\.cz$/.test(host);
  const [y, m] = ENTRY.checked.split('-');
  const when = r.verified && mzv ? `ověřeno ${+m}/${y}` : `stav ${+m}/${y}, neověřeno na oficiální stránce`;
  return `${mzv ? `MZV${NB}ČR` : esc(host)} · ${when}${r.validUntil ? ` · platí zatím do ${dmy(r.validUntil)}` : ''} · <a href="${esc(r.source)}">${esc(host)}</a>`;
}

// Klimatický graf: měřítko z dat, aby horké a deštivé země nepřetekly řádek (132 px na teploty, 90 px na srážky)
function climate(rows, months, name) {
  const maxHi = Math.max(1, ...rows.flatMap((r) => r.c.hi)), maxP = Math.max(1, ...rows.flatMap((r) => r.c.p));
  const k = Math.min(3.6, 109 / maxHi), kr = Math.min(0.4, 55 / maxP);
  const dop = (m) => (months.has(m + 1) ? ' dop' : '');
  let chart = `<div class="ax"></div>${rows.map((r) => `<div class="ax mesto">${esc(r.city)}</div><div class="ax a3">srážky</div>`).join('')}<div class="ax"></div>\n`;
  for (let m = 0; m < 12; m++) {
    chart += `<div class="m${dop(m)}"><span>${MON_S[m]}</span></div>${rows.map((r) => `<div class="t${dop(m)}" style="--v:${Math.max(0, r.c.hi[m])}"><b>${int(r.c.hi[m])}°</b><i></i></div><div class="r" style="--v:${r.c.p[m]}"><i></i>${r.c.p[m]}</div>`).join('')}<div class="mb"><span>${MON_S[m]}</span></div>\n`;
  }
  const head = rows.map((r) => `<th>${esc(r.city)}</th>`).join('');
  const body = MON_S.map((s, m) => `<tr${dop(m) ? ' class="dop"' : ''}><td><span>${s}</span>${dop(m) ? '<span class="sr"> – doporučený měsíc</span>' : ''}</td>${rows.map((r) => `<td><b>${int(r.c.hi[m])}${NB}°C</b>${r.c.p[m]}${NB}mm</td>`).join('')}</tr>`).join('\n');
  const bySrc = new Map();
  for (const r of rows) bySrc.set(r.c.src, [...(bySrc.get(r.c.src) || []), esc(r.city)]);
  const src = [...bySrc].map(([s, cities]) => `${list(cities)}: ${esc(sourceText(s))}`).join('; ');
  return `<div class="kl k3" style="--n:${rows.length};--k:${+k.toFixed(3)}px;--kr:${+kr.toFixed(4)}px" aria-hidden="true">
${chart}</div>
<div class="kl3t"><table><caption><span aria-hidden="true">Přes den °C · srážky za měsíc</span><span class="sr">${esc(name)} po měsících: průměrná teplota přes den a srážky za měsíc u letišť ${list(rows.map((r) => esc(r.city)))}. Doporučené měsíce jsou zvýrazněné.</span></caption>
<thead><tr><th>Měsíc</th>${head}</tr></thead><tbody>
${body}
</tbody></table></div>
<div class="legend" aria-hidden="true"><span><i class="p"></i>doporučený měsíc</span><span><i></i>přes den, °C</span><span><i class="r"></i>srážky za měsíc, mm</span></div>
<p class="src">${vlna(src)}. Dlouhodobý průměr, ne předpověď.</p>`;
}

// Nejvyšší / nejnižší hodnota přes letiště a měsíce → { r, v, when: „červenci a srpnu“ } (při shodě letišť první
// v pořadí; měsíce se stejnou hodnotou u toho letiště všechny – „nejtepleji v červenci“ by zamlčel stejně teplý srpen)
function extreme(rows, key, sign) {
  let best = null;
  for (const r of rows) r.c[key].forEach((v) => { if (!best || sign * (v - best.v) > 0) best = { r, v }; });
  best.when = list(best.r.c[key].flatMap((v, m) => (v === best.v ? [MON_LOC[m]] : [])));
  return best;
}

/** Stránka země cc → HTML. base = veřejná adresa webu (kanonická adresa a náhled odkazu). */
export function countryHtml(cc, base) {
  const z = OBSAH.zeme[cc], c = COUNTRY_BY_ISO.get(cc), name = c.cs, rel = pathOf(cc);
  const entry = ENTRY.countries.find((x) => x.iso2 === cc), kind = entryKind(entry);
  const rows = z.letiste.map(airportRow);
  const near = rows.reduce((a, b) => (b.km < a.km ? b : a));
  const far = rows.reduce((a, b) => (b.km > a.km ? b : a));
  const months = new Set(c.months);
  const monthsTxt = list(c.months.map((m) => MON[m - 1]));
  const monthsLoc = list(c.months.map((m) => MON_LOC[m - 1]));
  const goodHi = rows.flatMap((r) => c.months.map((m) => r.c.hi[m - 1])); // přes den v doporučených měsících
  const hiRange = Math.min(...goodHi) === Math.max(...goodHi) ? `${int(goodHi[0])}` : `${int(Math.min(...goodHi))}–${int(Math.max(...goodHi))}`;
  const kmRange = rows.length > 1 ? `${nb(Math.round(near.km))}–${kmTxt(far.km)}` : kmTxt(near.km);
  const flyRange = rows.length > 1 && near.fly !== far.fly ? `${dur(near.fly)} až ${dur(far.fly)}` : dur(near.fly);
  const cities = list(rows.map((r) => r.city));

  const title = `${name} – kdy letět, vstup a letiště | ${BRAND.name}`;
  // úvodní věta z čísel stránky; přes 155 znaků (Google víc neukáže) bez věty o měsících
  const intro = `${cities} ${rows.length > 1 ? 'jsou' : 'je'} ${kmRange} od Prahy, přímý let by trval asi ${flyRange}.`;
  const desc = `${intro} Nejhezčí bývá ${monthsTxt}.`.length <= 155 ? `${intro} Nejhezčí bývá ${monthsTxt}.` : intro;

  const [shiftV, shiftDt] = shiftFact(rows);
  const doc = kind.key === 'op' ? ['občanka', entry.visa === 'eu' ? 'stačí, volný pohyb osob' : 'stačí, bez víza'] : [kind.key === 'free' ? 'pas' : kind.label, DOC_DT[kind.key]];
  const facts = [
    [kmTxt(near.km), `z Prahy do ${near.gen}${rows.length > 1 ? ', nejblíž' : ''}`],
    [`~${dur(near.fly)}`, `přímý let do ${near.gen}, odhad`],
    [shiftV, shiftDt],
    doc,
  ];

  const hot = extreme(rows, 'hi', 1), cold = extreme(rows, 'hi', -1), wet = extreme(rows, 'p', 1), dry = extreme(rows, 'p', -1);
  const side = [
    `<b>Nejtepleji v ${hot.when}: ${esc(hot.r.city)}${NB}${int(hot.v)}${NB}°C.</b> Nejchladněji v ${cold.when}: ${esc(cold.r.city)}${NB}${int(cold.v)}${NB}°C.`,
    `<b>Nejvíc prší v ${wet.when}: ${esc(wet.r.city)}${NB}${wet.v}${NB}mm.</b> Nejméně v ${dry.when}: ${esc(dry.r.city)}${NB}${dry.v}${NB}mm.`,
  ];

  const fx = ARRIVAL_FX.czk;
  const cur = (code, x) => `${fare(x)}${NB}${SYM[code] || code}`;
  const airportsTable = rows.map((r) => {
    const sub = [r.iata, r.city === c.capCs ? 'hlavní město' : (/\(([^)]+)\)/.exec(r.a.cityCs) || [])[1] || (r.a.cityCs !== r.city ? r.a.cityCs : '')].filter(Boolean).join(' · ');
    const czk = fx[r.t.cur] ? ` (~${nb(Math.round(r.t.fare * fx[r.t.cur]))}${NB}Kč)` : '';
    return `<tr><td class="cil"><span class="mn">${esc(r.city)}</span><span class="s">${esc(sub)}</span></td>
<td class="km"><b class="num">${kmTxt(r.km)}</b><span class="s">přímý let ~${dur(r.fly)}, odhad</span></td>
<td class="cen">${esc(vlna(r.t.how))}<span class="s num">~${r.t.min}${NB}min · ${r.t.from ? 'od ' : ''}${cur(r.t.cur, r.t.fare)}${czk}</span></td>
<td class="hl r"><a class="go row" href="/#hledat=PRG-${r.iata}" rel="nofollow">Hledat Praha → ${esc(r.city)}</a></td></tr>`;
  }).join('\n');
  const dates = [...new Set(rows.map((r) => r.t.date))].sort();
  // nadpis sekce odpovídá na její téma (cesta do centra); nejbližší letiště už je v pásu nahoře
  const mins = rows.map((r) => r.t.min), minRange = Math.min(...mins) === Math.max(...mins) ? `${mins[0]}` : `${Math.min(...mins)}–${Math.max(...mins)}`;
  const sec = rows.filter((r) => r.t.sec).map((r) => esc(r.city));
  const fareSrc = `Jízdné ověřeno ${dates.map(dmy).join(' – ')} u${NB}dopravců${sec.length ? ` (${list(sec)} podle sekundárního zdroje)` : ''}, kurz ČNB ${dmy(ARRIVAL_FX.date)}.`;

  // Na místě: šest polí jen z dat. Kurz s datem ČNB z arrival.json – živý kurz by měnil HTML i ETag.
  // shortcut: datum kurzu je u všech měn fx.date, u MAD, EGP… je podle fx.source k 30. 9.; upravit, až je stránky budou mít
  const rate = fx[c.cur];
  const unit = rate && rate < 1 ? 100 : 1;
  const plug = PRETRIP.plugs[cc], plugT = plug.t.split(',');
  const fit = plugT.some((t) => t === 'E' || t === 'F') ? 'ok' : plugT.includes('C') ? 'part' : 'no';
  const contract = PRETRIP.health.contract[cc];
  const cz = COUNTRY_BY_ISO.get('CZ');
  const cells = [
    ['Měna', CUR_CS[c.cur], rate ? `${unit}${NB}${SYM[c.cur] || c.cur}${NB}=${NB}${nb(rate * unit, 3)}${NB}Kč (ČNB${NB}${dmy(ARRIVAL_FX.date)})` : ''],
    ['Ceny na místě', `${c.cost} z${NB}5`, `cenová hladina, Česko ${cz.cost} z${NB}5`],
    ['Bezpečnost', `${c.safety} z${NB}5`, `hodnocení ${esc(BRAND.name)} podle MZV${NB}ČR k${NB}${dmy(OBSAH.safetyChecked)}${c.safety <= 3 && c.geo ? `. ${esc(c.geo)}` : ''}`],
    PRETRIP.health.ehic.includes(cc) ? ['Zdravotní péče', 'Platí kartička pojišťovny', 'evropský průkaz EHIC']
      : contract ? ['Zdravotní péče', 'Jen nutná péče', esc(contract)] : ['Zdravotní péče', 'Kartička neplatí', 'sjednej si cestovní pojištění'],
    // nařízení EU o roamingu platí v celém EHP, jinde ceník operátora
    PRETRIP.eea.includes(cc) ? ['Volání a data', 'Jako doma', 'roaming v EU a EHP bez příplatku'] : ['Volání a data', 'Podle operátora', 'mimo EU a EHP se roaming platí zvlášť'],
    // stejné pravidlo jako pretrip.js plugOf(): české zástrčky pasují do E i F, plochá europlug i do C
    ['Zásuvky', fit === 'ok' ? 'Jako doma' : fit === 'part' ? 'Jen ploché zástrčky' : 'Potřebuješ adaptér', `typ ${esc(plugT.join(', '))} · ${esc(plug.v)}${NB}V${fit === 'ok' ? ', české zástrčky pasují' : ''}`],
  ];

  // Otázky jen z faktů stránky (bez FAQPage JSON-LD); A, nebo B jen u víc letišť
  const cap = rows.find((r) => r.city === c.capCs) || rows[0];
  const faq = [
    [`Kdy letět do ${z.do}?`, `Nejhezčí bývá v${NB}${monthsLoc}, přes den ${hiRange}${NB}°C. Nejtepleji je v${NB}${hot.when}: ${esc(hot.r.city)}${NB}${int(hot.v)}${NB}°C.`],
    kind.key === 'op' ? [`Potřebuju do ${z.do} pas?`, `Ne, stačí občanka. ${esc(entry.notes)}`] : [`Jaký doklad potřebuju do ${z.do}?`, `${esc(kind.text)}. ${esc(entry.notes)}`],
  ];
  if (rows.length > 1) {
    const [A, B] = rows;
    // nejteplejší měsíc obou a nejdeštivější z doporučených – tam se letiště liší nejvíc
    const sum = (k, m) => A.c[k][m] + B.c[k][m];
    const mHot = [...Array(12).keys()].reduce((a, m) => (sum('hi', m) > sum('hi', a) ? m : a), 0);
    const mWet = c.months.map((m) => m - 1).reduce((a, m) => (sum('p', m) > sum('p', a) ? m : a));
    faq.push([`${A.city}, nebo ${B.city}?`, `Přes den v${NB}${MON_LOC[mHot]}: ${esc(A.city)}${NB}${int(A.c.hi[mHot])}${NB}°C, ${esc(B.city)}${NB}${int(B.c.hi[mHot])}${NB}°C. Srážky v${NB}${MON_LOC[mWet]}: ${esc(A.city)}${NB}${A.c.p[mWet]}${NB}mm, ${esc(B.city)}${NB}${B.c.p[mWet]}${NB}mm. Z${NB}Prahy: ${esc(A.city)}${NB}${kmTxt(A.km)}, ${esc(B.city)}${NB}${kmTxt(B.km)}. Z${NB}letiště do centra: ${esc(A.city)} ~${A.t.min}${NB}min, ${esc(B.city)} ~${B.t.min}${NB}min.`]);
  }
  faq.push([`Jak se dostanu z letiště do ${cap.gen}?`, `${esc(cap.t.how[0].toUpperCase() + cap.t.how.slice(1))}, asi ${cap.t.min} minut, jízdné ${cap.t.from ? 'od ' : ''}${cur(cap.t.cur, cap.t.fare)}.`]);

  const main = `<div class="band"><div class="wrap">
<nav class="crumbs" aria-label="Drobečková navigace"><a href="/">${esc(BRAND.name)}</a><span aria-hidden="true">›</span><a href="/#countries">Země</a><span aria-hidden="true">›</span><span aria-current="page"><span class="flag" aria-hidden="true">${flagOf(cc)}</span>${esc(name)}</span></nav>
<div class="rh">
<div class="rt"><h1${h1Class(name)}>${esc(name)}</h1></div>
<dl class="fk">
${facts.map(([v, dt]) => `<div><dt>${vlna(esc(dt))}</dt><dd class="num">${esc(v)}</dd></div>`).join('\n')}
</dl>
</div>
<a class="search s3" href="/#hledat=-${cc}" rel="nofollow" aria-label="Hledat lety do ${esc(z.do)} v aplikaci ${esc(BRAND.name)}">
<span class="f"><span class="lbl">Odkud</span><span class="v">Z tvého domova</span><span class="s">vybereš v aplikaci</span></span>
<span class="f"><span class="lbl">Kam</span><span class="v">${esc(name)}</span><span class="s">${rows.map((r) => esc(r.city)).join(' · ')}</span></span>
<span class="f"><span class="lbl">Kdy</span><span class="v">Kdykoliv</span><span class="s">termín doladíš v aplikaci</span></span>
<span class="b"><span class="btn">${ICO.lupa} Najít lety</span></span>
</a>
<p class="stamp">${ICO.info}<span><b>Vstup do ${esc(z.do)}:</b> ${vlna(esc(entry.notes))} ${entrySource(entry)}</span></p>
</div></div>

<section class="sec" aria-labelledby="h-kdy"><div class="wrap">
<div class="op"><h2 id="h-kdy">Kdy letět do ${esc(z.do)}</h2>
<div><p class="odp">Nejhezčí je ${monthsTxt}.</p><p class="pod">Přes den ${hiRange}${NB}°C.</p></div>
<div class="side">${side.map((p) => `<p>${vlna(p)}</p>`).join('')}</div></div>
${climate(rows, months, name)}
</div></section>

<section class="sec" aria-labelledby="h-kam"><div class="wrap">
<div class="op"><h2 id="h-kam">Letiště a cesta do centra</h2>
<div><p class="odp">Z${NB}letiště do centra za ${minRange}${NB}min.</p><p class="pod">${vlna(`Přímý let by trval asi ${flyRange}, odhad podle vzdálenosti z Prahy.`)}</p></div>
<div class="side"><p><b>Ceny letenek tu neukazuju</b> – rychle stárnou. Najdu je v${NB}aplikaci.</p></div></div>
<table class="tab let3"><thead><tr><th>Letiště</th><th>Z Prahy</th><th>Z letiště do centra</th><th><span class="sr">Hledat</span></th></tr></thead><tbody>
${airportsTable}
</tbody></table>
<p class="src">${fareSrc}</p>
</div></section>

<section class="sec b" aria-labelledby="h-misto"><div class="wrap">
<div class="op b"><h2 id="h-misto">Na místě</h2></div>
<dl class="fakta">
${cells.map(([dt, v, d]) => `<div><dt>${dt}</dt><dd><b>${esc(v)}</b>${d ? `<span>${vlna(d)}</span>` : ''}</dd></div>`).join('\n')}
</dl>
</div></section>

<section class="sec b" aria-labelledby="h-faq"><div class="wrap two">
<div><div class="op b"><h2 id="h-faq">Časté otázky</h2></div>
<div class="faq">
${faq.map(([q, a], i) => `<details${i ? '' : ' open'}><summary>${esc(q)}<i aria-hidden="true"></i></summary><p>${vlna(a)}</p></details>`).join('\n')}
</div></div>
</div></section>`;

  return pageShell({ rel, title, desc, base, main });
}

// Nadpis podle nejdelšího slova (to se nezalomí): 10–12 znaků menší, delší ještě menší – víceslovný název se zalomí sám
const h1Class = (name) => { const n = Math.max(...name.split(/\s+/).map((w) => w.length)); return n > 12 ? ' class="s"' : n >= 10 ? ' class="m"' : ''; };

// Ikony Letsi (public/vendor/letsi/ikony) vložené, aby měly barvu textu kolem
const ICO = {
  lupa: '<svg class="ico" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.9 10.5A6.6 6.6 0 1 0 17.1 10.5A6.6 6.6 0 1 0 3.9 10.5Z"/><path d="M15.3 15.3L20.6 20.6"/></svg>',
  info: '<svg class="ico" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.25 12A8.75 8.75 0 1 0 20.75 12A8.75 8.75 0 1 0 3.25 12Z"/><path d="M12 11L12 16.5"/><path d="M10.7 7.75A1.3 1.3 0 1 0 13.3 7.75A1.3 1.3 0 1 0 10.7 7.75Z" fill="currentColor" stroke="none"/></svg>',
};

/**
 * Hlavička, patička a <head> každé obsahové stránky. Odkazy jen tam, kde stránka existuje: sekce aplikace za #,
 * /soukromi, /podminky. Odkaz do aplikace s vyplněním hledání (#hledat=) má rel="nofollow" – robot ho nemá procházet.
 * Patička bez věty o provizi: ta platí jen se zapnutými partnerskými odkazy (plan-faze1 §2.7).
 */
export function pageShell({ rel, title, desc, base, main }) {
  const url = `${base}${rel}`, n = esc(BRAND.name);
  const meta = (k, v, attr = 'property') => `<meta ${attr}="${k}" content="${esc(v)}">`;
  const css = `/obsah/obsah.css?v=${contentVersion(readFileSync(CSS_FILE))}`;
  const link = (href, text, follow = true) => `<a href="${href}"${follow ? '' : ' rel="nofollow"'}>${text}</a>`;
  return `<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="theme-color" content="#F3F4F0">
${LIVE ? '' : '<meta name="robots" content="noindex">\n'}<title>${esc(title)}</title>
${meta('description', desc, 'name')}
<link rel="canonical" href="${esc(url)}">
${meta('og:type', 'website')}
${meta('og:site_name', BRAND.name)}
${meta('og:locale', 'cs_CZ')}
${meta('og:url', url)}
${meta('og:title', title)}
${meta('og:description', desc)}
${meta('og:image', `${base}/${BRAND.image.path}`)}
${meta('og:image:width', BRAND.image.width)}
${meta('og:image:height', BRAND.image.height)}
${meta('og:image:alt', BRAND.image.alt)}
${meta('twitter:card', 'summary_large_image', 'name')}
<link rel="icon" href="/vendor/letsi/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${css}">
</head>
<body>
<a class="skip" href="#obsah">Přeskočit na obsah</a>
<header class="top"><div class="wrap">
<a class="logo" href="/"><img src="/vendor/letsi/letsi-logo-hlavni.svg" alt="${n}" width="113" height="25"></a>
<nav aria-label="Hlavní">${link('/#flights', 'Lety')}${link('/#hledat=-', 'Kamkoliv', false)}${link('/#recommend', 'Kdy letět')}<a href="/#countries" class="on">Země</a></nav>
<div class="right"><a class="pill" href="/">Otevřít ${n}</a></div>
<a class="pill tel" href="/">Otevřít ${n}</a>
</div></header>
<main id="obsah">
${main}
</main>
<footer><div class="wrap"><div class="cols">
<div><a class="logo" href="/"><img src="/vendor/letsi/letsi-logo-negativ.svg" alt="${n}" width="117" height="26"></a><p class="about">Levné letenky ze všech letišť v${NB}okolí, i${NB}s${NB}cestou na letiště.</p></div>
<div><h2>Letenky</h2><ul><li>${link('/#flights', 'Lety')}</li><li>${link('/#hledat=-', 'Kamkoliv', false)}</li><li>${link('/#recommend', 'Kdy letět')}</li></ul></div>
<div><h2>Svět</h2><ul><li>${link('/#countries', 'Země')}</li><li>${link('/#map', 'Mapa')}</li><li>${link('/#explore', 'Objevuj')}</li></ul></div>
<div><h2>Moje</h2><ul><li>${link('/#dashboard', 'Přehled')}</li><li>${link('/#trip', 'Cesty')}</li></ul></div>
<div><h2>O ${n}</h2><ul><li>${link('/soukromi', 'Soukromí')}</li><li>${link('/podminky', 'Podmínky')}</li></ul></div>
</div><div class="bottom"><span>Česko · čeština · Kč</span><span>${n} letenky neprodává.</span><span>© ${n}</span></div></div></footer>
</body>
</html>
`;
}

const memo = new Map();
/**
 * GET/HEAD obsahové stránky: false = adresa není (propadne na statiku a 404). Vykreslí se jednou na adresu webu,
 * pak jen ETag z paměti. Mezipaměť 5 min v prohlížeči, den ve sdílené (začne platit až s vlastním Cloudflare před
 * serverem). X-Atlas-Build: verze, kterou žádný service worker nemá – starý by stránku jinak uložil jako aplikaci.
 */
export function serveContent(req, res, p, base) {
  const cc = PAGES.get(p);
  if (!cc) return false;
  const key = `${p}|${base}`;
  if (!memo.has(key)) memo.set(key, countryHtml(cc, base));
  sendGenerated(req, res, 200, memo.get(key), {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300, s-maxage=86400',
    'Content-Security-Policy': CONTENT_CSP, 'X-Atlas-Build': 'obsah',
  });
  return true;
}
