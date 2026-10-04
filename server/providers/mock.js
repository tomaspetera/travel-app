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
    return makeLeg({
      provider: id, carrier: code, carrierName: name, flightNo: `${code} ${100 + Math.floor(rnd(seed, 'n', from, to) * 8800)}`,
      from, to, dep, arr, price: eur, currency: 'EUR', durationMin: dur,
      prevPrice: rnd(seed, 'prev', from, to, date) < 0.1 ? Math.round(eur * 1.3) : null,
      bookUrl: null,
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
    async routes(origin) {
      return new Set(destinations(origin));
    },
    async destinations(origin, country = null) {
      return destinations(origin).filter((d) => !country || getAirport(d)?.cc === country);
    },
    callsPerRoute: () => 1,
    async daily({ from, to, dateFrom, dateTo }) {
      if (!destinations(from).includes(to) && !destinations(to).includes(from)) return [];
      const out = [];
      for (let i = 0, n = daysBetween(dateFrom, dateTo); i <= n; i++) {
        const leg = fare(from, to, addDays(dateFrom, i));
        if (leg) out.push(leg);
      }
      return out;
    },
  };
}

export const mockProviders = [
  makeMock({ id: 'demo-air', name: 'Demo Air', code: 'DA', seed: 'a', share: 0.32 }),
  makeMock({ id: 'demo-jet', name: 'Demo Jet', code: 'DJ', seed: 'b', share: 0.22 }),
];
