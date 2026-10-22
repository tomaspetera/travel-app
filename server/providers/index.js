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
import { kiwi, kiwiBlocked, kiwiRetryAfter } from './kiwi.js';
import { mockProviders } from './mock.js';
import { liteapiTestKey, liteapiLive } from './stays/index.js';
import { xoteloBlocked, xoteloRetryAfter, xoteloBlockReason } from './stays/xotelo.js';

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
    { id: 'ryanair', ...PROVIDER_INFO.ryanair, enabled: config.ryanair, blocked: ryanair.isBlocked(), retryAfter: ryanair.retryAfter() },
    { id: 'wizzair', ...PROVIDER_INFO.wizzair, enabled: config.wizz, blocked: wizzair.isBlocked() },
    { id: 'kiwi', ...PROVIDER_INFO.kiwi, enabled: config.kiwi, blocked: kiwiBlocked(), retryAfter: kiwiRetryAfter() },
    {
      id: 'liteapi', name: 'Hotely (LiteAPI)', color: '#7c3aed', kind: 'stays', note: 'hotely s cenou a hodnocením hostů', enabled: liteapiLive(),
      hint: !config.liteapiKey ? `Volitelné: ostrý klíč z liteapi.travel → LITEAPI_KEY${config.xotelo ? ' (má přednost před TripAdvisorem, umožní provize)' : ' zapne nabídky hotelů s hodnocením'}`
        : liteapiTestKey() ? `Testovací klíč LiteAPI (sand_…) vrací smyšlené hotely – ATLAS je neukazuje${config.xotelo ? ' (ceny hotelů dává TripAdvisor přes Xotelo)' : ', jen odkazy na partnery'}. Ostrý klíč zapne skutečné nabídky.` : null,
    },
    {
      // Xotelo: neoficiální bezplatné API nad TripAdvisorem – když není ostrý klíč LiteAPI (stays/index.js).
      id: 'xotelo', name: 'Hotely (TripAdvisor)', color: '#00aa6c', kind: 'stays', tag: 'orientačně',
      note: 'orientační ceny hotelů z TripAdvisoru (Booking.com, Agoda, Trip.com…) a hodnocení – zdarma, bez klíče, přes neoficiální API Xotelo',
      enabled: config.xotelo && !liteapiLive(),
      // pojistka po chybách (429, 401/403, výpadek): na chvíli vynecháno, ukazují se jen odkazy
      blocked: xoteloBlocked(), retryAfter: xoteloRetryAfter(), reason: xoteloBlockReason() || null,
      hint: !config.xotelo ? 'Vypnuto (XOTELO=off) – bez klíče LiteAPI zůstanou u ubytování jen odkazy na partnery'
        : liteapiLive() ? 'Nepoužívá se – ceny hotelů dává LiteAPI'
          : xoteloBlocked() ? `Xotelo ${xoteloBlockReason()} – teď se vynechává (u ubytování jen odkazy na partnery), znovu se zkusí za ${Math.max(1, Math.round(xoteloRetryAfter() / 60))} min` : null,
    },
    {
      id: 'travelpayouts', ...PROVIDER_INFO.travelpayouts, enabled: Boolean(config.travelpayoutsToken),
      hint: config.travelpayoutsToken ? null : 'Zdarma token na travelpayouts.com → TRAVELPAYOUTS_TOKEN v .env přidá stovky dalších aerolinek',
    },
  ];
}
