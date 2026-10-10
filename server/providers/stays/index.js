// Registr poskytovatelů ubytování (cena + hodnocení). Bez nastavených klíčů je prázdný
// a aplikace nabídne odkazy s předvyplněným hledáním (server/lib/links.js).
//
// Rozhraní poskytovatele: { id, name, search(q) → Promise<Stay[]> }
// Stay: { id, provider, name, type, stars, rating (0–10), reviews, address, lat, lon, distanceKm,
//         photo, priceTotalCzk, pricePerNightCzk, bookUrl, freeCancellation, breakfast }
import { config } from '../../config.js';
import { liteapi } from './liteapi.js';
import { demoStays } from './demo.js';

// Testovací klíč LiteAPI (sand_…) vrací smyšlené hotely a ceny – v ostrém provozu je neukazovat (vybraný „hotel“ by se
// započítal do ceny cesty); zůstanou odkazy na partnery s předvyplněným termínem. Ukázkové hotely jen v demo režimu.
export const liteapiTestKey = () => /^sand_/i.test(config.liteapiKey || '');

export function stayProviders() {
  if (config.mock) return [demoStays];
  return [config.liteapiKey && !liteapiTestKey() ? liteapi : null].filter(Boolean);
}
