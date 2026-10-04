// Registr poskytovatelů letenkových dat.
//
// Dva typy:
//  • „explore“ poskytovatelé umí jedním dotazem vrátit nejlevnější lety z letiště kamkoliv
//    (Ryanair, Travelpayouts) → metoda explore(q)
//  • „route“ poskytovatelé umí jen ceny po dnech na konkrétní trase (Wizz Air, demo)
//    → metody destinations(origin) + daily(q); „kamkoliv“ = dotaz na každou trasu zvlášť
// Všichni umí daily(q) pro kalendář a skládání zpátečních cest.
import { config } from '../config.js';
import { ryanair } from './ryanair.js';
import { wizzair } from './wizzair.js';
import { travelpayouts } from './travelpayouts.js';
import { kiwi } from './kiwi.js';
import { mockProviders } from './mock.js';

export const PROVIDER_INFO = {
  ryanair: { name: 'Ryanair', color: '#073590', kind: 'live', note: 'živé ceny z ryanair.com' },
  wizzair: { name: 'Wizz Air', color: '#c6007e', kind: 'live', note: 'živé ceny z wizzair.com' },
  travelpayouts: { name: 'Ostatní aerolinky', color: '#ff6b00', kind: 'cached', note: 'Aviasales – ceny z vyhledávání za posledních ~48 h, nutno ověřit' },
  kiwi: { name: 'Kiwi.com (všechny aerolinky)', color: '#00a991', kind: 'live', note: 'živé ceny stovek aerolinek vč. kombinací s přestupem – pro konkrétní cíl' },
  'demo-air': { name: 'Demo Air', color: '#64748b', kind: 'demo', note: 'VYMYŠLENÁ ukázková data' },
  'demo-jet': { name: 'Demo Jet', color: '#94a3b8', kind: 'demo', note: 'VYMYŠLENÁ ukázková data' },
};

export function activeProviders() {
  if (config.mock) return mockProviders;
  const list = [];
  if (config.ryanair) list.push(ryanair);
  if (config.wizz) list.push(wizzair);
  if (config.travelpayoutsToken) list.push(travelpayouts);
  if (config.kiwi) list.push(kiwi);
  return list;
}

export function providerStatus() {
  if (config.mock) {
    return mockProviders.map((p) => ({ id: p.id, ...PROVIDER_INFO[p.id], enabled: true }));
  }
  return [
    { id: 'ryanair', ...PROVIDER_INFO.ryanair, enabled: config.ryanair },
    { id: 'wizzair', ...PROVIDER_INFO.wizzair, enabled: config.wizz, blocked: wizzair.isBlocked() },
    { id: 'kiwi', ...PROVIDER_INFO.kiwi, enabled: config.kiwi },
    { id: 'liteapi', name: 'Hotely (LiteAPI)', color: '#7c3aed', kind: 'stays', note: 'hotely s cenou a hodnocením hostů', enabled: Boolean(config.liteapiKey), hint: config.liteapiKey ? null : 'Zdarma klíč na liteapi.travel → LITEAPI_KEY zapne nabídky hotelů s hodnocením' },
    {
      id: 'travelpayouts', ...PROVIDER_INFO.travelpayouts, enabled: Boolean(config.travelpayoutsToken),
      hint: config.travelpayoutsToken ? null : 'Zdarma token na travelpayouts.com → TRAVELPAYOUTS_TOKEN v .env přidá stovky dalších aerolinek',
    },
  ];
}
