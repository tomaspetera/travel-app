// Registr poskytovatelů ubytování (cena + hodnocení). Bez nastavených klíčů je prázdný
// a aplikace nabídne odkazy s předvyplněným hledáním (server/lib/links.js).
//
// Rozhraní poskytovatele: { id, name, search(q) → Promise<Stay[]> }
// Stay: { id, provider, name, type, stars, rating (0–10), reviews, address, lat, lon, distanceKm,
//         photo, priceTotalCzk, pricePerNightCzk, bookUrl, freeCancellation, breakfast }
export function stayProviders() {
  return [];
}
