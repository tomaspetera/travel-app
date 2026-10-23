// Zavírací dny nejnavštěvovanějších památek (data/sight-hours.json): pravidelný den v týdnu (Louvre v úterý, Uffizi
// v pondělí), stálé svátky (1. 1., 25. 12.) a dlouhodobé zavření (Pergamonmuseum do června 2027) – jen to, co je na
// oficiálním webu památky (zdroj a datum kontroly u každé). Plánovač programu podle nich památku nedá na den, kdy je
// zavřená, a v programu napíše „zavřeno v pondělí“. Otevírací doby z Wikidat skoro nejsou, proto vlastní malá tabulka.
// Shoda s místem z Wikidat podle QID (i víc QID na jednu památku: muzeum i budova), jinak podle názvu a polohy do 1 km.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { haversineKm, normalize } from './geo.js';
import { weekday } from './dates.js';

const FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'sight-hours.json');
export const SIGHTS = JSON.parse(readFileSync(FILE, 'utf8')).sights;

// dny v týdnu jako v datech (po … ne) → číslo jako Date.getUTCDay (0 = neděle)
export const DOW = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];
const IN_DOW = ['v neděli', 'v pondělí', 'v úterý', 've středu', 've čtvrtek', 'v pátek', 'v sobotu'];
const NAME_KM = 1;

const byId = new Map();
const byName = new Map();
for (const s of SIGHTS) {
  for (const id of s.ids) byId.set(id, s);
  for (const n of [s.name, ...(s.names || [])]) {
    const k = normalize(n);
    byName.set(k, [...(byName.get(k) || []), s]);
  }
}

/** Údaje o památce pro místo { id, name, lat, lon } → záznam z data/sight-hours.json | null. */
export function sightHours(p) {
  if (!p) return null;
  const hit = byId.get(String(p.id || ''));
  if (hit) return hit;
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return null;
  return (byName.get(normalize(p.name)) || []).find((s) => haversineKm(s.lat, s.lon, p.lat, p.lon) <= NAME_KM) || null;
}

// poslední neděle v měsíci (Vatikánská muzea mají otevřeno jen tu)
const lastSunday = (ymd) => weekday(ymd) === 0 && Number(ymd.slice(8, 10)) + 7 > new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7), 0)).getUTCDate();

/**
 * Je památka s ohledem na záznam s v den ymd zavřená? → 'shut' (dlouhodobě), 'day' (den v týdnu), 'date' (svátek) | null.
 */
export function closedOn(s, ymd) {
  if (!s || !ymd) return null;
  if (s.shut && ymd < s.shut) return 'shut';
  if ((s.dates || []).includes(ymd.slice(5, 10))) return 'date';
  const dow = DOW[weekday(ymd)];
  if ((s.closed || []).includes(dow) && !(s.except === 'last-sunday' && lastSunday(ymd))) return 'day';
  return null;
}

const dm = (mmdd) => `${+mmdd.slice(3, 5)}. ${+mmdd.slice(0, 2)}.`;
const dmy = (ymd) => `${+ymd.slice(8, 10)}. ${+ymd.slice(5, 7)}. ${ymd.slice(0, 4)}`;
const list = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} a ${xs.at(-1)}` : xs[0] || '');

/** „zavřeno v pondělí“, „v neděli zavřeno (kromě poslední v měsíci)“ – pravidelný zavírací den slovy | ''. */
export function closedDaysText(s) {
  const days = (s && s.closed) || [];
  if (!days.length) return '';
  const txt = list(days.map((d) => IN_DOW[DOW.indexOf(d)]));
  if (s.except === 'last-sunday') return `${txt} zavřeno (kromě poslední neděle v měsíci)`;
  return `zavřeno ${txt}`;
}

/**
 * Poznámka k zastávce v programu pro pobyt start–end: pravidelný zavírací den, svátky v termínu („25. 12. zavřeno“),
 * otevírací doba, když je celoroční („otevřeno 9:00–18:00“), a poznámka (v neděli jen bohoslužby). '' = nic.
 */
export function hoursNote(s, start, end) {
  if (!s) return '';
  const inStay = (s.dates || []).filter((md) => {
    for (let y = +String(start).slice(0, 4); y <= +String(end).slice(0, 4); y++) {
      const d = `${y}-${md}`;
      if (d >= start && d <= end) return true;
    }
    return false;
  });
  return [s.note || closedDaysText(s), inStay.length ? `${list(inStay.map(dm))} zavřeno` : '', s.hours ? `otevřeno ${s.hours}` : '']
    .filter(Boolean).join(' · ');
}

/** Proč je památka v den ymd zavřená, slovy („v úterý zavřeno“, „25. 12. zavřeno“, „zavřeno kvůli rekonstrukci…“). */
export function closedWhy(s, ymd) {
  const k = closedOn(s, ymd);
  if (k === 'shut') return s.why || `zavřeno do ${dmy(s.shut)}`;
  if (k === 'date') return `${dm(ymd.slice(5, 10))} zavřeno`;
  if (k === 'day') return `${IN_DOW[weekday(ymd)]} zavřeno`;
  return '';
}
