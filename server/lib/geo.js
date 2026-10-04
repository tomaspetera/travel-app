// Geografické výpočty a odhad dopravy na letiště.

const R = 6371;
const rad = (d) => (d * Math.PI) / 180;

export function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export const normalize = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Odhad cesty z výchozího bodu na letiště veřejnou dopravou (bus/vlak).
// Silniční vzdálenost ≈ 1,25 × vzdušná; průměr 80 km/h + 30 min na přestupy a rezervu.
// Cena: kmRate Kč za km (střední Evropa: RegioJet/Flixbus/ÖBB vychází cca 0,9–1,5 Kč/km).
export function groundEstimate(distKm, kmRate = 1.1) {
  const km = Math.round(distKm);
  if (distKm < 30) {
    // Městská/příměstská doprava.
    return { km, minutes: Math.round(30 + distKm * 1.2), czk: kmRate > 0 ? 60 : 0, local: true };
  }
  const roadKm = distKm * 1.25;
  const minutes = Math.round((roadKm / 80) * 60 + 30);
  const czk = kmRate > 0 ? Math.max(80, Math.round((roadKm * kmRate) / 10) * 10) : 0;
  return { km, minutes, czk, local: false };
}
