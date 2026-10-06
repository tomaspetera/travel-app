// Ukázková (vymyšlená!) data pro offline demo a testy – zapíná se ATLAS_MOCK=1.
// Deterministické: stejný dotaz = stejné ceny. V UI jsou jasně označená jako DEMO.
import { AIRPORTS, getAirport } from '../lib/airports.js';
import { haversineKm } from '../lib/geo.js';
import { addDays, daysBetween, parseYmd } from '../lib/dates.js';
import { makeLeg } from '../lib/fares.js';

function rnd(...parts) {
  let h = 2166136261;
  for (const ch of parts.join('|')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000003) / 1000003;
}

const pad = (n) => String(n).padStart(2, '0');
// Přestupní letiště pro ukázkové lety s přestupem.
const HUBS = ['VIE', 'MUC', 'FRA', 'AMS', 'ZRH', 'WAW', 'IST', 'CDG', 'FCO', 'MAD', 'BUD', 'ATH', 'CPH', 'LIS'];

export function makeMock({ id, name, code, seed, share }) {
  const destCache = new Map();

  function destinations(origin) {
    if (destCache.has(origin)) return destCache.get(origin);
    const o = getAirport(origin);
    if (!o) return [];
    const list = [];
    for (const a of AIRPORTS.values()) {
      if (a.type !== 'L' || a.iata === origin) continue;
      const d = haversineKm(o.lat, o.lon, a.lat, a.lon);
      if (d < 250 || d > 5200) continue;
      const p = d < 2600 ? share : share / 3;
      if (rnd(seed, origin, a.iata) < p) list.push(a.iata);
    }
    destCache.set(origin, list);
    return list;
  }

  function fare(from, to, date) {
    const a = getAirport(from);
    const b = getAirport(to);
    if (!a || !b) return null;
    if (rnd(seed, 'fly', from, to, date) < 0.22) return null; // ten den se nelétá
    const d = haversineKm(a.lat, a.lon, b.lat, b.lon);
    const dt = parseYmd(date);
    const wd = dt.getUTCDay();
    const month = dt.getUTCMonth() + 1;
    const wf = [1.25, 0.95, 0.85, 0.85, 1.05, 1.35, 1.1][wd];
    const sf = [7, 8].includes(month) ? 1.5 : month === 12 ? 1.3 : [1, 2, 11].includes(month) ? 0.8 : 1;
    const noise = 0.7 + rnd(seed, 'p', from, to, date) * 0.9;
    const deal = rnd(seed, 'deal', from, to, date) < 0.04 ? 0.4 : 1;
    const eur = Math.max(9.99, Math.round((16 + d * 0.042) * wf * sf * noise * deal) + 0.99);
    const hh = 6 + Math.floor(rnd(seed, 'h', from, to, date) * 16);
    const mm = [0, 10, 25, 35, 50][Math.floor(rnd(seed, 'm', from, to, date) * 5)];
    const dur = Math.round((d / 780) * 60 + 35);
    const dep = `${date}T${pad(hh)}:${pad(mm)}:00`;
    // Přílet v místním čase cíle – pro demo stačí bez rozdílu časových pásem.
    const arrMs = Date.parse(`${dep}Z`) + dur * 60000;
    const arr = new Date(arrMs).toISOString().slice(0, 19);
    const leg = makeLeg({
      provider: id, carrier: code, carrierName: name, flightNo: `${code} ${100 + Math.floor(rnd(seed, 'n', from, to) * 8800)}`,
      from, to, dep, arr, price: eur, currency: 'EUR', durationMin: dur,
      prevPrice: rnd(seed, 'prev', from, to, date) < 0.1 ? Math.round(eur * 1.3) : null,
      bookUrl: null,
    });
    // Jako u Wizz Air / Ryanairu: další (neceněné) odlety téhož dne.
    const extra = Math.floor(rnd(seed, 'x', from, to, date) * 3);
    const other = [...new Set(Array.from({ length: extra }, (_, i) => `${pad(6 + Math.floor(rnd(seed, 'o', i, from, to, date) * 16))}:${pad(mm)}`))]
      .filter((t) => t !== `${pad(hh)}:${pad(mm)}`).sort();
    if (other.length) leg.otherDeps = other;
    return leg;
  }

  // K delším trasám někdy i let s jedním přestupem přes velké letiště po cestě – vždy dražší než přímý,
  // takže nejlevnější let dne (a s ním výsledky „kamkoliv“ i kalendář) zůstává stejný.
  function connection(from, to, date, direct) {
    const a = getAirport(from);
    const b = getAirport(to);
    const d = haversineKm(a.lat, a.lon, b.lat, b.lon);
    if (d < 900 || rnd(seed, 'c', from, to, date) >= 0.55) return null;
    const km = (x, y) => haversineKm(x.lat, x.lon, y.lat, y.lon);
    let hub = null;
    for (const code of HUBS) {
      const h = getAirport(code);
      if (!h || code === from || code === to || km(a, h) < 250 || km(h, b) < 250) continue;
      const via = km(a, h) + km(h, b);
      if (via <= d * 1.3 && (!hub || via < hub.via)) hub = { code, h, via };
    }
    if (!hub) return null;
    const mins = (x, y) => Math.round((km(x, y) / 780) * 60 + 35);
    const lay = [45, 70, 95, 130, 185, 260, 420][Math.floor(rnd(seed, 'lay', from, to, date) * 7)];
    const hh = 6 + Math.floor(rnd(seed, 'ch', from, to, date) * 15);
    const dep = `${date}T${pad(hh)}:${pad([5, 20, 40][Math.floor(rnd(seed, 'cm', from, to, date) * 3)])}:00`;
    const dur = mins(a, hub.h) + lay + mins(hub.h, b);
    const arr = new Date(Date.parse(`${dep}Z`) + dur * 60000).toISOString().slice(0, 19);
    const n = 100 + Math.floor(rnd(seed, 'cn', from, to) * 8800);
    return makeLeg({
      provider: id, carrier: code, carrierName: name, flightNo: `${code} ${n}, ${code} ${n + 1}`,
      from, to, dep, arr, price: Math.round(direct.price * (1.1 + rnd(seed, 'cp', from, to, date) * 0.4)) + 0.99, currency: 'EUR',
      durationMin: dur, stops: 1, layovers: [{ at: hub.code, min: lay }], bookUrl: null,
    });
  }

  return {
    id,
    name,
    live: true,
    demo: true,
    async stations() {
      return null;
    },
    // Trasa platí oběma směry (jako daily) – i let jen tam z cíle zpáteční trasy (cesta přes víc měst).
    async routes(origin) {
      const own = new Set(destinations(origin));
      return { has: (d) => own.has(d) || destinations(d).includes(origin) };
    },
    async destinations(origin, country = null) {
      return destinations(origin).filter((d) => !country || getAirport(d)?.cc === country);
    },
    callsPerRoute: () => 1,
    // near = { from, to }: dny kolem přesného data (demo je má zadarmo).
    async daily({ from, to, dateFrom, dateTo, near = null }) {
      if (!destinations(from).includes(to) && !destinations(to).includes(from)) return [];
      const a = near && near.from < dateFrom ? near.from : dateFrom;
      const b = near && near.to > dateTo ? near.to : dateTo;
      const out = [];
      for (let i = 0, n = daysBetween(a, b); i <= n; i++) {
        const leg = fare(from, to, addDays(a, i));
        if (!leg) continue;
        out.push(leg);
        const via = connection(from, to, leg.date, leg);
        if (via) out.push(via);
      }
      return out;
    },
  };
}

export const mockProviders = [
  makeMock({ id: 'demo-air', name: 'Demo Air', code: 'DA', seed: 'a', share: 0.32 }),
  makeMock({ id: 'demo-jet', name: 'Demo Jet', code: 'DJ', seed: 'b', share: 0.22 }),
];
