// Hranice oblastí, které jsou správním celkem (Toskánsko, Apulie, Istrie…; data/regions.json ze scripts/build-regions.mjs).
// Okruh „po Toskánsku“ se plánuje z kandidátů v kruhu kolem města oblasti; tady se z nich nechají jen ty uvnitř hranice.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REGIONS = JSON.parse(readFileSync(path.join(root, 'data', 'regions.json'), 'utf8')).regions;

export const hasRegion = (key) => Object.hasOwn(REGIONS, String(key || ''));

// paprsek na východ: lichý počet průsečíků s hranou = uvnitř (ring: [[lon, lat], …])
function inRing(ring, lat, lon) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// hranice jsou zjednodušené na ~2 km, takže místa na pobřeží (Polignano a Mare, Benagil, Mont-Saint-Michel) leží
// těsně za ní – do EDGE_KM od hranice platí jako uvnitř
const EDGE_KM = 3;
function nearRing(ring, lat, lon) {
  const kx = 111.32 * Math.cos((lat * Math.PI) / 180), ky = 110.57; // km na stupeň v okolí bodu
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = (ring[j][0] - lon) * kx, ay = (ring[j][1] - lat) * ky;
    const dx = (ring[i][0] - lon) * kx - ax, dy = (ring[i][1] - lat) * ky - ay;
    const t = dx || dy ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) : 0;
    if (Math.hypot(ax + t * dx, ay + t * dy) <= EDGE_KM) return true;
  }
  return false;
}

/** Leží bod v oblasti (nebo do 3 km od její hranice)? null = oblast bez známé hranice. */
export function inRegion(key, lat, lon) {
  if (!hasRegion(key)) return null;
  const polys = REGIONS[key].polys;
  return polys.some((ring) => inRing(ring, lat, lon)) || polys.some((ring) => nearRing(ring, lat, lon));
}

/**
 * Kandidáti jen z oblasti (+ ti, které si uživatel připnul). Když by jich zbylo méně než `min`, zůstane původní kruh –
 * méně cílů by okruh zkrátilo víc, než mu přesah za hranici uškodí. Příznaky pole (natureLoading…) se přenesou.
 */
export function keepInRegion(list, key, { min = 6, keep = () => false } = {}) {
  if (!hasRegion(key)) return list;
  const inside = list.filter((c) => keep(c) || inRegion(key, c.lat, c.lon));
  if (inside.length >= min) return Object.assign(inside, { natureLoading: list.natureLoading, descFailed: list.descFailed, degraded: list.degraded });
  return list;
}
