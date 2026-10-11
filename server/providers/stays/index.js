// Registr poskytovatelů ubytování (cena + hodnocení). Bez nich aplikace nabídne jen odkazy s předvyplněným hledáním
// (server/lib/links.js).
//
// Rozhraní poskytovatele: { id, name, search(q, { fresh }) → Promise<Stay[]>, probe?() → Promise<string> (ostrý test
// /api/diag), refresh? (umí fresh – ceny znovu, ne z mezipaměti: „Aktualizovat ceny“) }
// Stay: { id, provider, name, type, stars, rating (0–10), reviews, address, lat, lon, distanceKm,
//         photo, priceTotalCzk, pricePerNightCzk, bookUrl, bookSponsored (partnerský odkaz → „reklama“), freeCancellation, breakfast }
// Xotelo navíc: rating5 (TripAdvisor 0–5), reviewsUrl (stránka na TripAdvisoru), rates [{ code, name, totalCzk,
// perNightCzk, tax, site, url, sponsored }] (ceny u jednotlivých webů s odkazem na hotel, nejlevnější první; Booking.com
// vždy, má-li nabídku), ratesAt (kdy se ceny zjistily, ms); bookUrl = odkaz nejlevnější nabídky.
import { config } from '../../config.js';
import { liteapi } from './liteapi.js';
import { xotelo } from './xotelo.js';
import { demoStays } from './demo.js';

// Testovací klíč LiteAPI (sand_…) vrací smyšlené hotely a ceny – v ostrém provozu je neukazovat (vybraný „hotel“ by se
// započítal do ceny cesty); ceny pak dává Xotelo, jinak zůstanou odkazy na partnery s předvyplněným termínem.
// Ukázkové hotely jen v demo režimu.
export const liteapiTestKey = () => /^sand_/i.test(config.liteapiKey || '');
/** Ostrý klíč LiteAPI – má přednost (lepší pokrytí, později provize). */
export const liteapiLive = () => Boolean(config.liteapiKey) && !liteapiTestKey();

/** DEMO → ukázková data; ostrý klíč LiteAPI → LiteAPI; jinak Xotelo (zdarma, bez klíče), pokud není XOTELO=off. */
export function stayProviders() {
  if (config.mock) return [demoStays];
  if (liteapiLive()) return [liteapi];
  return config.xotelo ? [xotelo] : [];
}
