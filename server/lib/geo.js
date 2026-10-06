// Geografické výpočty a odhad času cesty mezi letištěm a městem.

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

// Odhad času cesty mezi letištěm a městem veřejnou dopravou (bus/vlak) – jen čas, např. z letiště příletu do cíle.
// Silniční vzdálenost ≈ 1,25 × vzdušná; průměr 80 km/h + 30 min na přestupy a rezervu.
// Cena a čas cesty z domova na letiště odletu (veřejnou dopravou i autem) viz access.js.
export function groundEstimate(distKm) {
  const km = Math.round(distKm);
  // Městská/příměstská doprava.
  if (distKm < 30) return { km, minutes: Math.round(30 + distKm * 1.2), local: true };
  const roadKm = distKm * 1.25;
  return { km, minutes: Math.round((roadKm / 80) * 60 + 30), local: false };
}
